// npm run blender:sprites -- <set>: renders the Blender sprites of scripts/blender/<set>/sprites.json into
// public/sprites/<set>/<asset>/, one headless Blender per asset, each inside its own render turn (machine
// check, render slot and disk floor). The registry checks, the plan and the run live in
// blender-sprites-plan.ts; this file wires them to Blender, the slot and the disk.
import {spawn} from 'node:child_process';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {
  DEFAULT_BLENDER_BIN, PROGRESS_PREFIX, SPRITES_ROOT, decideSprite, dryRunText, parseBlenderResult, parseSpriteRegistry,
  planSprites, readWebpInfo, resolveBlender, runSprites, spriteHash, type BlenderResult, type SpriteChoice,
} from './blender-sprites-plan';
import {FREE_SPACE_HINT, assertCanStart, existingAncestor, freeBytes} from './disk';
import {acquireRenderSlot, currentCommand} from './render-slot';
import {busyProcesses, takeRenderTurn} from './render-turn';

const HELP_TEXT = `usage: npm run blender:sprites -- <set> [options]

Renders the sprites of scripts/blender/<set>/sprites.json with Blender, headless, one process per
asset: public/sprites/<set>/<asset>/0000.webp … (WEBP with alpha, one per frame of the period) and a
manifest.json. An asset whose manifest matches the registry entry and the set's Python is skipped, so a
stopped run resumes. Each asset waits for the machine and takes the render slot on its own.

Options:
  --only <asset,…>  renders only these assets
  --dry-run         prints the plan with the estimated MiB and minutes; takes nothing, renders nothing
  --overwrite       renders again even when the manifest is up to date
  --frames <a:b>    smoke tests only: frames a to b-1 of the period
  --size <px>       smoke tests only: a smaller square (even px)
  --samples <n>     smoke tests only: fewer Cycles samples
  --no-wait         fails at once when the machine is busy instead of waiting
  -h, --help        shows this help

Blender: ${DEFAULT_BLENDER_BIN}, or the executable in BLENDER_BIN.`;

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const fromRoot = (relative: string) => path.join(projectRoot, relative);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const wholeOption = (flag: string, text: string | undefined) => {
  if (text === undefined) return undefined;
  if (!/^\d+$/.test(text)) throw new Error(`${flag} ${text}: a whole number.`);
  return Number(text);
};

const readJson = async (file: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (error) {
    // Missing: never rendered. Unreadable: rendered again (decideSprite finds no matching hash).
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? null : {unreadable: String(error)};
  }
};

const setsWithSprites = () => readdirSync(fromRoot('scripts/blender'), {withFileTypes: true})
  .filter((entry) => entry.isDirectory() && existsSync(fromRoot(path.posix.join('scripts/blender', entry.name, 'sprites.json'))))
  .map((entry) => entry.name);

/** Runs Blender, shows its `sprites:` lines, keeps the rest for the error message and returns the result line. */
const runBlender = (blender: string, args: string[]): Promise<BlenderResult> => new Promise((resolve, reject) => {
  const child = spawn(blender, args, {cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe']});
  const tail: string[] = [];
  let result: BlenderResult | null = null;
  let failure: Error | null = null;
  const onLine = (line: string) => {
    try {
      const parsed = parseBlenderResult(line);
      if (parsed) {
        result = parsed;
        return;
      }
    } catch (error) {
      failure = error as Error;
    }
    if (line.startsWith(PROGRESS_PREFIX)) console.log(`  ${line.slice(PROGRESS_PREFIX.length).trim()}`);
    tail.push(line);
    if (tail.length > 40) tail.shift();
  };
  for (const stream of [child.stdout, child.stderr]) {
    let buffered = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buffered += chunk;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      lines.forEach(onLine);
    });
    stream.on('end', () => {
      if (buffered) onLine(buffered);
    });
  }
  child.on('error', (error) => reject(new Error(`Could not start Blender (${blender}): ${error.message}`)));
  child.on('close', (code, signal) => {
    if (code === 0 && result && !failure) {
      resolve(result);
      return;
    }
    const how = signal ? `was stopped by ${signal}` : code === 0 ? 'ended without the sprites: result line' : `exited with code ${code}`;
    reject(new Error(`Blender ${how}${failure ? ` (${failure.message})` : ''}. Last lines:\n${tail.slice(-25).join('\n')}`));
  });
});

const main = async () => {
  const {values, positionals} = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: {
      only: {type: 'string'},
      'dry-run': {type: 'boolean', default: false},
      overwrite: {type: 'boolean', default: false},
      frames: {type: 'string'},
      size: {type: 'string'},
      samples: {type: 'string'},
      'no-wait': {type: 'boolean', default: false},
      help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) {
    console.log(HELP_TEXT);
    return;
  }
  if (positionals.length !== 1) throw new Error('Name one set: npm run blender:sprites -- <set>, e.g. y2k. Use --help.');
  const set = positionals[0]!;
  const setDirectory = path.posix.join('scripts', 'blender', set);
  const registryFile = path.posix.join(setDirectory, 'sprites.json');
  if (!/^[a-z0-9-]+$/.test(set) || !existsSync(fromRoot(registryFile))) {
    throw new Error(`No ${registryFile}. Sets with sprites: ${setsWithSprites().join(', ') || 'none'}.`);
  }
  const registry = parseSpriteRegistry(JSON.parse(readFileSync(fromRoot(registryFile), 'utf8')), set, registryFile);
  const pythonFiles = readdirSync(fromRoot(setDirectory)).filter((name) => name.endsWith('.py')).sort()
    .map((name) => ({name, content: readFileSync(fromRoot(path.posix.join(setDirectory, name)))}));
  const plans = planSprites(registry, {
    only: values.only, frames: values.frames, size: wholeOption('--size', values.size), samples: wholeOption('--samples', values.samples),
  }, pythonFiles.map(({name}) => name));
  const choices: SpriteChoice[] = await Promise.all(plans.map(async (plan) => {
    const hash = spriteHash(registry, plan.id, pythonFiles);
    const manifest = await readJson(fromRoot(path.posix.join(plan.output, 'manifest.json')));
    return {plan, hash, decision: decideSprite(plan, hash, manifest, values.overwrite)};
  }));

  if (values['dry-run']) {
    let status: string;
    try {
      status = `Blender: ${resolveBlender(process.env, existsSync)}.`;
    } catch (error) {
      status = `Blender missing: ${(error as Error).message}`;
    }
    console.log(dryRunText(set, choices, status));
    return;
  }

  const wait = !values['no-wait'];
  const spritesDirectory = fromRoot(path.posix.join(SPRITES_ROOT, set));
  const results = await runSprites({
    choices, root: projectRoot, script: fromRoot(path.posix.join(setDirectory, 'sprites.py')),
    effects: {
      findBlender: () => resolveBlender(process.env, existsSync),
      // No other render running and the slot held (render-turn.ts has the order and why), per asset.
      takeTurn: (_plan, estimate) => takeRenderTurn({wait}, {
        busy: busyProcesses,
        acquire: ({wait: waitForSlot, waitLimitMs}) => acquireRenderSlot({command: currentCommand(), wait: waitForSlot, waitLimitMs}),
        sleep,
        // Measured inside the slot: after waiting for another render, the disk is what that render left.
        whileHeld: () => assertCanStart({
          free: freeBytes(spritesDirectory), estimate,
          where: path.relative(process.cwd(), existingAncestor(spritesDirectory)) || '.', then: FREE_SPACE_HINT,
        }),
      }),
      resetDirectory: async (relative) => {
        await rm(fromRoot(relative), {recursive: true, force: true});
        await mkdir(fromRoot(relative), {recursive: true});
      },
      runBlender,
      readFrame: async (relative) => {
        let data: Buffer;
        try {
          data = await readFile(fromRoot(relative));
        } catch {
          return null;
        }
        return {info: readWebpInfo(data), bytes: data.length};
      },
      writeJson: async (relative, data) => {
        await writeFile(fromRoot(relative), `${JSON.stringify(data, null, 2)}\n`);
      },
      publish: async (from, to) => {
        await rm(fromRoot(to), {recursive: true, force: true});
        await rename(fromRoot(from), fromRoot(to));
      },
      log: (message) => console.log(message),
      now: () => new Date(),
    },
  });
  const skipped = choices.length - results.length;
  console.log(`Done: ${results.length} asset(s) rendered${skipped > 0 ? `, ${skipped} up to date` : ''}, in ${path.posix.join(SPRITES_ROOT, set)}/.`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
