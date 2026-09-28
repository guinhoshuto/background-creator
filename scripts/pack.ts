import {existsSync} from 'node:fs';
import {access, mkdir, readFile, rename, rm, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {createBundle, exportAsset, findScratchDirectories, projectRoot, removeScratchDirectories} from './export';
import {dryRunText, filterPlan, parsePackManifest, planPack, realPackDeps, runPack, scratchText} from './pack-plan';

const PACK_HELP_TEXT = `usage: npm run render:pack -- <name|file.json> [options]

Builds a pack in out/packs/<name>/ from packs/<name>.json (or the given file),
exporting one file at a time and writing out/packs/<name>/manifest.json.
The pack folder is a working folder; the buyer gets the zip.

Options:
  --dry-run        lists every planned file with its file dimensions, without rendering
  --only <text>    exports only the files whose path contains the text
  --overwrite      replaces existing files (without it, finished files are skipped)
  -h, --help       shows this help`;

/** A bare name means packs/<name>.json; anything ending in .json is a path. */
const manifestFile = (target: string) =>
  (target.endsWith('.json') ? path.resolve(target) : path.join(projectRoot, 'packs', `${target}.json`));

const fromRoot = (relative: string) => path.join(projectRoot, relative);

const exists = async (file: string) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

/** The nearest existing directory: statfs needs a real path, and out/ may not exist yet. */
const existingAncestor = (directory: string): string =>
  (existsSync(directory) || path.dirname(directory) === directory ? directory : existingAncestor(path.dirname(directory)));

const main = async () => {
  const {values, positionals} = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: {
      'dry-run': {type: 'boolean', default: false},
      only: {type: 'string'},
      overwrite: {type: 'boolean', default: false},
      help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) {console.log(PACK_HELP_TEXT); return;}
  if (positionals.length !== 1) throw new Error('Name one pack: npm run render:pack -- <name|file.json>. Use --help.');
  const file = manifestFile(positionals[0]!);
  if (!existsSync(file)) throw new Error(`Manifest not found: ${path.relative(process.cwd(), file) || file}.`);
  const manifest = parsePackManifest(JSON.parse(await readFile(file, 'utf8')));
  // The whole plan, before --only: the manifest keeps only the entries it has.
  const fullPlan = planPack(manifest, realPackDeps);
  const plan = filterPlan(fullPlan, values.only);

  const packDirectory = fromRoot(path.posix.join('out', 'packs', manifest.name));
  // Scratch directories live outside the pack folder, on the same disk (out/) so results link or rename.
  const scratchDirectory = fromRoot(path.posix.join('out', '.scratch', 'packs', manifest.name));
  // Older runs put them inside the pack itself: both places are swept.
  const scratchRoots = [packDirectory, scratchDirectory];

  if (values['dry-run']) {
    const existing = new Set<string>();
    for (const entry of plan) if (await exists(fromRoot(entry.output))) existing.add(entry.output);
    console.log(`Pack: ${manifest.name}`);
    console.log(dryRunText(plan, existing));
    // A dry run changes nothing: it only says what the real run will clean up.
    const leftovers = (await Promise.all(scratchRoots.map(findScratchDirectories))).flat();
    if (leftovers.length > 0) console.log(scratchText(leftovers.length, 'will-be-removed'));
    return;
  }

  const statTarget = () => existingAncestor(packDirectory);
  // One bundle for the whole pack; exportAsset reuses its serveUrl for every file.
  let serveUrl: string | undefined;
  await runPack({
    manifest, plan, fullPlan, overwrite: values.overwrite, deps: realPackDeps,
    diskLabel: path.relative(process.cwd(), statTarget()) || '.',
    effects: {
      exists: (relative) => exists(fromRoot(relative)),
      freeBytes: async () => {
        const stats = await statfs(statTarget());
        return Number(stats.bavail) * Number(stats.bsize);
      },
      exportFile: async (entry, overwrite) => {
        serveUrl ??= await createBundle();
        // The parsed props, every key spelled out: the Studio's saved defaults never leak into a pack.
        await exportAsset({
          compositionId: entry.composition, format: entry.format, props: entry.exportProps,
          output: fromRoot(entry.output), overwrite, serveUrl, scratchDirectory,
          ...(entry.frame === undefined ? {} : {frame: entry.frame}),
          onProgress: (message) => console.log(`  ${message}`),
        });
      },
      readJson: async (relative) => {
        const target = fromRoot(relative);
        if (!await exists(target)) return null;
        return JSON.parse(await readFile(target, 'utf8')) as unknown;
      },
      remove: (relative) => rm(fromRoot(relative), {force: true}),
      writeManifest: async (relative, data) => {
        const target = fromRoot(relative);
        await mkdir(path.dirname(target), {recursive: true});
        // Write-then-rename: an interrupted build never leaves a half-written manifest behind.
        const temporary = `${target}.tmp`;
        await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
        await rename(temporary, target);
      },
      sweepScratch: () => removeScratchDirectories(scratchRoots),
      log: (message) => console.log(message),
    },
  });
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
