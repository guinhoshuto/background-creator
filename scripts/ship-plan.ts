// The delivery chain of `npm run ship:pack`, apart from the script so tests run it with a fake rclone:
// render:pack, validate:pack and zip:pack, the upload to R2 under the zip's sha8, the check of key and
// size, and the local cleanup only when asked. Every step is idempotent, so a stopped run resumes.
// The manifest's version names the zip (<pack>-overlay-pack-v<N>.zip) and says when a pack ships again.
import path from 'node:path';
import {zipFileName} from './pack-contents';
import {PACK_COUNTER_PATTERN} from './pack-plan';
import type {MachineVerdict} from './machine-check';

export const DEFAULT_REMOTE = 'cf-r2:etsy';
/** The public origin that serves the bucket's packs/ folder. */
export const PUBLIC_ORIGIN = 'https://cacare.co';
/** How long a busy machine waits between checks. */
export const MACHINE_WAIT_MS = 60_000;

export type RemoteFile = {name: string; size: number};

/** What one pack left on R2, kept in the state file so a later run knows it was shipped. */
export type ShippedPack = {version?: number; sha256: string; key: string; url: string; bytes: number; shippedAt: string};
export type ShipState = Record<string, ShippedPack>;

/** A pack to ship: its name and the version its manifest asks for. */
export type PackToShip = {name: string; version: number};

export type ShipEffects = {
  /** Runs `npm run -s <script> -- <args>`, its output in the named log; resolves with the exit code. */
  npm: (script: string, args: string[], logName: string) => Promise<number>;
  machine: () => MachineVerdict | null;
  sleep: (ms: number) => Promise<void>;
  /** Bytes of a local file or folder entry, null when it does not exist. */
  localSize: (relative: string) => Promise<number | null>;
  sha256: (relative: string) => Promise<string>;
  /** The files directly under a remote folder (none when it does not exist). */
  remoteList: (directory: string) => Promise<RemoteFile[]>;
  /** Every file under a remote folder, at any depth, `name` being its path inside it (none when it does not exist). */
  remoteTree: (directory: string) => Promise<RemoteFile[]>;
  upload: (relative: string, key: string) => Promise<void>;
  removeLocal: (relative: string) => Promise<void>;
  readState: () => Promise<ShipState>;
  writeState: (state: ShipState) => Promise<void>;
  now: () => Date;
  log: (message: string) => void;
  /** Called before a pack's render:pack, so the watch band reads that pack's render log. */
  rendering: (pack: string) => Promise<void>;
};

export type ShipOptions = {remote: string; deleteLocal: boolean};

export class ShipError extends Error {}

export const zipPathOf = ({name, version}: PackToShip) => path.posix.join('out', 'deliveries', zipFileName(name, version));
export const packFolderOf = (pack: string) => path.posix.join('out', 'packs', pack);
export const remoteDirectoryOf = (remote: string, pack: string, sha256: string) => `${remote}/packs/${pack}/${sha256.slice(0, 8)}`;
export const publicUrlOf = ({name, version}: PackToShip, sha256: string) =>
  `${PUBLIC_ORIGIN}/packs/${name}/${sha256.slice(0, 8)}/${zipFileName(name, version)}`;

/**
 * What a run does with one pack, the same answer for the run and for --dry-run:
 * - skip: this version was shipped and nothing local is left;
 * - resume: the local zip is the one this version shipped, so only the R2 check and the cleanup are left;
 * - build: anything else, including a version above the one shipped (or a record from before versions).
 * A version below the one shipped is refused: the manifest went back, and its zip name would repeat an old one.
 */
export type ShipDecision = {action: 'skip' | 'resume' | 'build'; shipped?: ShippedPack};

export const decideShip = async (pack: PackToShip, state: ShipState, effects: Pick<ShipEffects, 'localSize' | 'sha256'>): Promise<ShipDecision> => {
  const shipped = state[pack.name];
  if (shipped?.version !== undefined && pack.version < shipped.version) {
    throw new ShipError(`${pack.name}: v${shipped.version} was shipped (${shipped.url}) and packs/${pack.name}.json says v${pack.version}; set "version" to ${shipped.version + 1} for a new delivery.`);
  }
  const sameVersion = shipped !== undefined && shipped.version === pack.version;
  if (!sameVersion) return {action: 'build', ...(shipped ? {shipped} : {})};
  const zip = zipPathOf(pack);
  const zipBytes = await effects.localSize(zip);
  if (zipBytes === null && await effects.localSize(packFolderOf(pack.name)) === null) return {action: 'skip', shipped};
  if (zipBytes !== null && await effects.sha256(zip) === shipped.sha256) return {action: 'resume', shipped};
  return {action: 'build', shipped};
};

/** The files of an `rclone lsjson` answer, folders left out. */
export const parseLsjson = (text: string): RemoteFile[] =>
  (JSON.parse(text) as {Name: string; Size: number; IsDir: boolean}[]).filter((entry) => !entry.IsDir).map((entry) => ({name: entry.Name, size: entry.Size}));

/** The files of an `rclone lsjson -R --files-only` answer, each named by its path inside the listed folder. */
export const parseLsjsonTree = (text: string): RemoteFile[] =>
  (JSON.parse(text) as {Path: string; Size: number; IsDir: boolean}[]).filter((entry) => !entry.IsDir).map((entry) => ({name: entry.Path, size: entry.Size}));

/** The upload: copyto names the key exactly, and the bucket check needs a permission the token lacks. */
export const uploadArgs = (file: string, key: string) => ['copyto', '--s3-no-check-bucket', file, key];

/** Waits while the machine check says another render, the game, memory, swap or disk is in the way. */
export const waitForMachine = async (effects: ShipEffects, pack: string) => {
  let last = '';
  for (;;) {
    const verdict = effects.machine();
    if (verdict === null || verdict.free) return;
    const reasons = verdict.reasons.join('; ');
    // Each new reason goes to the log once; the same wait repeated every minute would bury the rest.
    if (reasons !== last) effects.log(`waiting before ${pack}: ${reasons}`);
    last = reasons;
    await effects.sleep(MACHINE_WAIT_MS);
  }
};

/** The log of one step, in .cache/ship-pack/: `<pack>-render-pack.log` holds the render's `[n/m]`. */
export const stepLogName = (pack: string, script: string) => `${pack}-${script.replace(':', '-')}.log`;

/** One job of ~/.claude/watch.json, in the shape the watch band reads. */
export type WatchEntry = {
  id: string; label: string; pid: number; cmd: string; log: string;
  progress: {dir: string; prefix: string; suffix: string; pattern: string};
};

/**
 * The run's entry in the watch band, its progress read from the render log of the pack being rendered:
 * the newest `<pack>…-render-pack.log` in the log folder, its last `[n/m]`.
 */
export const watchEntryOf = (packs: readonly string[], pack: string, {pid, logDirectory, progressLog}: {pid: number; logDirectory: string; progressLog: string}): WatchEntry => {
  const renderLog = stepLogName(pack, 'render:pack');
  return {
    id: `ship-pack-${packs.join('-')}`,
    // The pack being rendered: the band shows the render's [n/m] without a name (the prefix is all of it).
    label: `ship:pack ${pack}${packs.length > 1 ? ` (${packs.indexOf(pack) + 1}/${packs.length} packs)` : ''}`,
    pid,
    // The band checks that the pid still runs this script, so a reused pid never reads as running.
    cmd: 'ship-pack.ts',
    log: progressLog,
    progress: {dir: logDirectory, prefix: pack, suffix: renderLog.slice(pack.length), pattern: PACK_COUNTER_PATTERN},
  };
};

const step = async (effects: ShipEffects, pack: string, script: string, args: string[] = []) => {
  const logName = stepLogName(pack, script);
  const code = await effects.npm(script, [pack, ...args], logName);
  if (code !== 0) throw new ShipError(`${script} ${pack} failed (exit ${code}); see .cache/ship-pack/${logName}.`);
};

/**
 * Uploads unless the key already holds these bytes; refuses a folder that holds anything else, and a
 * version already on R2 under another sha8: same version, other content means the version was not raised.
 */
const uploadChecked = async (effects: ShipEffects, {pack, zip, sha256, bytes, remote}: {pack: PackToShip; zip: string; sha256: string; bytes: number; remote: string}) => {
  const directory = remoteDirectoryOf(remote, pack.name, sha256);
  const name = zipFileName(pack.name, pack.version);
  const key = `${directory}/${name}`;
  const sha8 = sha256.slice(0, 8);
  const elsewhere = (await effects.remoteTree(`${remote}/packs/${pack.name}`))
    .filter((file) => file.name.endsWith(`/${name}`) && file.name !== `${sha8}/${name}`);
  if (elsewhere.length > 0) {
    throw new ShipError(`${name} is already on R2 with other content (${elsewhere.map((file) => `${remote}/packs/${pack.name}/${file.name}`).join(', ')}); nothing was uploaded. Raise "version" in packs/${pack.name}.json for a new delivery.`);
  }
  const before = await effects.remoteList(directory);
  if (before.some((file) => file.name === name && file.size === bytes) && before.length === 1) {
    effects.log(`${pack}: ${key} already holds these ${bytes} B, no upload`);
    return key;
  }
  if (before.length > 0) {
    throw new ShipError(`${directory}/ already holds ${before.map((file) => `${file.name} (${file.size} B)`).join(', ')}; nothing was uploaded. Look at it before shipping again.`);
  }
  effects.log(`${pack}: uploading ${bytes} B to ${key}`);
  await effects.upload(zip, key);
  const after = await effects.remoteList(directory);
  const uploaded = after.find((file) => file.name === name);
  if (!uploaded) throw new ShipError(`${key} is missing after the upload; the local files were kept.`);
  if (uploaded.size !== bytes) throw new ShipError(`${key} has ${uploaded.size} B on R2 and ${bytes} B here; the local files were kept.`);
  if (after.length !== 1) throw new ShipError(`${directory}/ holds more than the zip after the upload; the local files were kept.`);
  effects.log(`${pack}: uploaded and checked ${key} (${bytes} B)`);
  return key;
};

/** One pack, every step. Throws ShipError at the first failure, before any local file is removed. */
export const shipPack = async (pack: PackToShip, options: ShipOptions, effects: ShipEffects) => {
  const zip = zipPathOf(pack);
  const folder = packFolderOf(pack.name);
  const {action, shipped} = await decideShip(pack, await effects.readState(), effects);
  if (action === 'skip') {
    effects.log(`${pack.name}: v${pack.version} already shipped (${shipped!.url}) and nothing local is left; skipped`);
    return shipped!;
  }
  if (action === 'resume') {
    effects.log(`${pack.name}: the local zip is the one shipped at ${shipped!.url}; checking R2`);
  } else {
    await waitForMachine(effects, pack.name);
    effects.log(`${pack.name}: render:pack (v${pack.version})`);
    await effects.rendering(pack.name);
    await step(effects, pack.name, 'render:pack');
    effects.log(`${pack.name}: validate:pack`);
    await step(effects, pack.name, 'validate:pack');
    effects.log(`${pack.name}: zip:pack`);
    await step(effects, pack.name, 'zip:pack');
  }
  const bytes = await effects.localSize(zip);
  if (bytes === null) throw new ShipError(`${zip} is missing after zip:pack.`);
  const sha256 = await effects.sha256(zip);
  const key = await uploadChecked(effects, {pack, zip, sha256, bytes, remote: options.remote});
  const record: ShippedPack = {version: pack.version, sha256, key, url: publicUrlOf(pack, sha256), bytes, shippedAt: effects.now().toISOString()};
  await effects.writeState({...await effects.readState(), [pack.name]: record});
  effects.log(`${pack.name}: shipped ${record.url}`);
  if (options.deleteLocal) {
    await effects.removeLocal(zip);
    await effects.removeLocal(folder);
    effects.log(`${pack.name}: deleted ${zip} and ${folder}`);
  }
  return record;
};

/** Every pack in order; the first failure stops the chain, and later packs are not started. */
export const shipPacks = async (packs: readonly PackToShip[], options: ShipOptions, effects: ShipEffects): Promise<{code: 0 | 1; shipped: ShippedPack[]}> => {
  const shipped: ShippedPack[] = [];
  for (const [index, pack] of packs.entries()) {
    try {
      shipped.push(await shipPack(pack, options, effects));
    } catch (error) {
      // Any failure, ours or rclone's, ends in the log: a detached run has nobody watching its stderr.
      effects.log(`FAILED ${pack.name}: ${error instanceof Error ? error.message : String(error)}`);
      const left = packs.slice(index + 1).map((next) => next.name);
      if (left.length > 0) effects.log(`not started: ${left.join(', ')}`);
      return {code: 1, shipped};
    }
  }
  effects.log(`done: ${shipped.map((record) => record.url).join(' ')}`);
  return {code: 0, shipped};
};

// An outside signal (BGC-29: a SIGTERM ended a run with exit 143 and left no trace of who sent it).
// Node never sees the sender's pid (no siginfo), so the run writes what points to it: its parent then
// and at the start, its process group, and every kill, pkill or killall running at that moment, e.g.
// the shell of another session still on the line that sent it.

export type ProcessRow = {pid: number; ppid: number; pgid: number; command: string};

/** The rows of `ps -axo pid=,ppid=,pgid=,command=`. */
export const parsePs = (text: string): ProcessRow[] => text.split('\n').flatMap((line) => {
  const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
  return match ? [{pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), command: match[4]!.trim()}] : [];
});

const KILLER = /(^|[\s;&|('"/])(kill|pkill|killall)(\s|$)/;

/** The processes that may have sent the signal: any running kill, pkill or killall but the run's own children. */
export const signalSuspects = (rows: readonly ProcessRow[], pid: number) =>
  rows.filter((row) => row.ppid !== pid && KILLER.test(row.command));

const cut = (text: string, max = 160) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A suspect's command around its kill: an agent's shell line starts with boilerplate that would hide it. */
const aroundKill = (command: string, max = 160) => {
  const at = command.search(KILLER);
  return at <= 40 ? cut(command, max) : `…${cut(command.slice(at - 40), max - 1)}`;
};

/** The progress.log line of a received signal: the signal, the time, the parent and the suspects. */
export const signalReport = ({signal, pid, ppid, startParent, rows, at}: {
  signal: string; pid: number; ppid: number; startParent: {pid: number; command: string}; rows: readonly ProcessRow[]; at: string;
}) => {
  const parent = rows.find((row) => row.pid === ppid);
  const self = rows.find((row) => row.pid === pid);
  const parentText = ppid === startParent.pid
    ? `ppid ${ppid} (${parent ? `\`${cut(parent.command, 80)}\`` : 'gone'})`
    : `ppid ${ppid}, was ${startParent.pid} \`${cut(startParent.command, 80)}\` at the start (that parent is gone)`;
  const suspects = signalSuspects(rows, pid);
  const senders = suspects.length > 0
    ? `possible senders: ${suspects.map((row) => `${row.pid} \`${aroundKill(row.command)}\` (ppid ${row.ppid})`).join('; ')}`
    : 'no kill, pkill or killall was running any more (the sender had ended; Node cannot read its pid)';
  return `received ${signal} at ${at}: pid ${pid}, ${parentText}, pgid ${self?.pgid ?? '?'}; ${senders}`;
};
