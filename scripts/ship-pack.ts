import {execFile, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, closeSync, createReadStream, existsSync, openSync} from 'node:fs';
import {mkdir, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {freeBytes, gibibytes} from './disk';
import {projectRoot} from './export';
import {machineVerdict} from './machine-check';
import {existingManifestFile, parsePackManifest} from './pack-plan';
import {DEFAULT_REMOTE, packFolderOf, parseLsjson, shipPacks, uploadArgs, zipPathOf, type ShipEffects, type ShipState} from './ship-plan';

const SHIP_HELP_TEXT = `usage: npm run ship:pack -- <name> [<name>...] [options]

Ships each pack in order: waits for the machine check, then render:pack (finished files are skipped),
validate:pack and zip:pack; uploads the zip to <remote>/packs/<name>/<sha8>/<name>-overlay-pack.zip
with rclone, reads it back and compares name and size, and records the public link. The first failure
stops the chain and keeps every local file. Run it again to resume: each step skips what is done, and
a zip already on R2 with the same bytes is not uploaded twice.

Writes .cache/ship-pack/progress.log (one line per step and per wait), one log per step and the
shipped links in .cache/ship-pack/state.json; adds the run to ~/.claude/watch.json and, at the end,
calls the vault's fim_job.py when it is on this machine.
Packs shipped before ship:pack existed are not in state.json.

Options:
  --delete-local     after a checked upload, deletes out/deliveries/<name>-overlay-pack.zip and out/packs/<name>/
  --remote <remote>  rclone remote and bucket (default ${DEFAULT_REMOTE})
  --dry-run          says what each pack would do, running nothing
  -h, --help         shows this help`;

const LOG_DIRECTORY = path.join(projectRoot, '.cache', 'ship-pack');
const PROGRESS_LOG = path.join(LOG_DIRECTORY, 'progress.log');
const STATE_FILE = path.join(LOG_DIRECTORY, 'state.json');
const rclone = () => process.env.RCLONE || 'rclone';
const fromRoot = (relative: string) => path.join(projectRoot, relative);

const stamp = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** The progress.log line format the vault's /gm reads: `=== <date> <message> free=<disk>`. */
const log = (message: string) => {
  console.log(message);
  const line = `=== ${stamp(new Date())} ${message} free=${gibibytes(freeBytes(projectRoot))}\n`;
  // Synchronous: lines stay in order, and a crash never loses the last one.
  appendFileSync(PROGRESS_LOG, line);
};

const run = (command: string, args: string[], logFile: string) => new Promise<number>((resolve, reject) => {
  const fd = openSync(logFile, 'a');
  const child = spawn(command, args, {cwd: projectRoot, stdio: ['ignore', fd, fd]});
  child.on('error', (error) => {closeSync(fd); reject(error);});
  child.on('close', (code) => {closeSync(fd); resolve(code ?? 1);});
});

const capture = (command: string, args: string[]) => new Promise<{code: number; stdout: string; stderr: string}>((resolve) => {
  execFile(command, args, {cwd: projectRoot, maxBuffer: 16 * 1024 ** 2}, (error, stdout, stderr) => {
    const code = error ? Number((error as {code?: unknown}).code ?? 1) || 1 : 0;
    resolve({code, stdout, stderr});
  });
});

const sha256Of = (file: string) => new Promise<string>((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
});

/** Adds this run to the watch band; the agent removes it once the result is checked. */
const addToWatch = async (packs: string[]) => {
  const file = path.join(os.homedir(), '.claude', 'watch.json');
  if (!existsSync(file)) return;
  try {
    const data = JSON.parse(await readFile(file, 'utf8')) as {jobs?: {id: string}[]};
    const id = `ship-pack-${packs.join('-')}`;
    const jobs = (data.jobs ?? []).filter((job) => job.id !== id);
    // cmd: the band checks that the pid still runs this script, so a reused pid never reads as running.
    jobs.push({id, label: `ship:pack ${packs.join(' ')}`, pid: process.pid, cmd: 'ship-pack.ts', log: PROGRESS_LOG} as {id: string});
    // A temporary name of this process: other writers of watch.json (the vault's maquina_livre.py --esperar) use their own.
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify({...data, jobs}, null, 2)}\n`);
    await rename(temporary, file);
  } catch (error) {
    console.error(`watch.json not updated: ${error instanceof Error ? error.message : error}`);
  }
};

/** The vault's end of a detached job: the end line in progress.log, a line in today's note and a notification. */
const finish = async (code: number) => {
  const script = path.join(os.homedir(), 'obsidian', 'AI', 'scripts', 'fim_job.py');
  if (!existsSync(script)) return;
  await capture('python3', [script, '--tarefa', 'ship-pack', '--rc', String(code), '--log', PROGRESS_LOG]);
};

const effects: ShipEffects = {
  npm: (script, args, logName) => run('npm', ['run', '-s', script, '--', ...args], path.join(LOG_DIRECTORY, logName)),
  machine: () => machineVerdict(process.pid),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  localSize: async (relative) => {
    try {
      return (await stat(fromRoot(relative))).size;
    } catch {
      return null;
    }
  },
  sha256: (relative) => sha256Of(fromRoot(relative)),
  remoteList: async (directory) => {
    const {code, stdout, stderr} = await capture(rclone(), ['lsjson', `${directory}/`]);
    // Exit 3 is rclone's "directory not found": an empty folder on R2.
    if (code === 3) return [];
    if (code !== 0) throw new Error(`rclone lsjson ${directory}/ failed (exit ${code}): ${stderr.trim()}`);
    return parseLsjson(stdout);
  },
  upload: async (relative, key) => {
    const code = await run(rclone(), uploadArgs(fromRoot(relative), key), path.join(LOG_DIRECTORY, 'rclone.log'));
    if (code !== 0) throw new Error(`rclone copyto failed (exit ${code}); see .cache/ship-pack/rclone.log.`);
  },
  removeLocal: (relative) => rm(fromRoot(relative), {recursive: true, force: true}),
  readState: async () => (existsSync(STATE_FILE) ? JSON.parse(await readFile(STATE_FILE, 'utf8')) as ShipState : {}),
  writeState: async (state) => {
    await writeFile(`${STATE_FILE}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
    await rename(`${STATE_FILE}.tmp`, STATE_FILE);
  },
  now: () => new Date(),
  log,
};

const main = async () => {
  const {values, positionals} = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: {
      'delete-local': {type: 'boolean', default: false},
      remote: {type: 'string', default: DEFAULT_REMOTE},
      'dry-run': {type: 'boolean', default: false},
      help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) {console.log(SHIP_HELP_TEXT); return;}
  if (positionals.length === 0) throw new Error('Name at least one pack: npm run ship:pack -- <name> [<name>...]. Use --help.');
  if (new Set(positionals).size !== positionals.length) throw new Error('A pack is named twice.');
  if (positionals.some((name) => name.endsWith('.json'))) throw new Error('ship:pack takes pack names from packs/, not files: the name is part of the R2 key.');
  // Every name is checked before the first render: a typo in the third pack never waits for the first two.
  const packs = await Promise.all(positionals.map(async (name) => parsePackManifest(JSON.parse(await readFile(existingManifestFile(name), 'utf8'))).name));
  await mkdir(LOG_DIRECTORY, {recursive: true});
  const state = await effects.readState();
  if (values['dry-run']) {
    for (const pack of packs) {
      const zip = await effects.localSize(zipPathOf(pack));
      const folder = await effects.localSize(packFolderOf(pack));
      const shipped = state[pack] ? `shipped before: ${state[pack]!.url}` : 'not shipped yet';
      console.log(`${pack}: ${shipped}; local zip ${zip === null ? 'missing' : `${zip} B`}; pack folder ${folder === null ? 'missing' : 'present'}`);
    }
    console.log(`Would run render:pack, validate:pack and zip:pack, then upload to ${values.remote}/packs/<name>/<sha8>/${values['delete-local'] ? ' and delete the local zip and pack folder' : ''}.`);
    return;
  }
  await addToWatch(packs);
  log(`start ship:pack ${packs.join(' ')}${values['delete-local'] ? ' --delete-local' : ''}`);
  const {code} = await shipPacks(packs, {remote: values.remote, deleteLocal: values['delete-local']}, effects);
  process.exitCode = code;
  await finish(code);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
