// The delivery chain of `npm run ship:pack`, apart from the script so tests run it with a fake rclone:
// render:pack, validate:pack and zip:pack, the upload to R2 under the zip's sha8, the check of key and
// size, and the local cleanup only when asked. Every step is idempotent, so a stopped run resumes.
import path from 'node:path';
import {zipFileName} from './pack-contents';
import type {MachineVerdict} from './machine-check';

export const DEFAULT_REMOTE = 'cf-r2:etsy';
/** The public origin that serves the bucket's packs/ folder. */
export const PUBLIC_ORIGIN = 'https://cacare.co';
/** How long a busy machine waits between checks. */
export const MACHINE_WAIT_MS = 60_000;

export type RemoteFile = {name: string; size: number};

/** What one pack left on R2, kept in the state file so a later run knows it was shipped. */
export type ShippedPack = {sha256: string; key: string; url: string; bytes: number; shippedAt: string};
export type ShipState = Record<string, ShippedPack>;

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
  upload: (relative: string, key: string) => Promise<void>;
  removeLocal: (relative: string) => Promise<void>;
  readState: () => Promise<ShipState>;
  writeState: (state: ShipState) => Promise<void>;
  now: () => Date;
  log: (message: string) => void;
};

export type ShipOptions = {remote: string; deleteLocal: boolean};

export class ShipError extends Error {}

export const zipPathOf = (pack: string) => path.posix.join('out', 'deliveries', zipFileName(pack));
export const packFolderOf = (pack: string) => path.posix.join('out', 'packs', pack);
export const remoteDirectoryOf = (remote: string, pack: string, sha256: string) => `${remote}/packs/${pack}/${sha256.slice(0, 8)}`;
export const publicUrlOf = (pack: string, sha256: string) => `${PUBLIC_ORIGIN}/packs/${pack}/${sha256.slice(0, 8)}/${zipFileName(pack)}`;

/** The files of an `rclone lsjson` answer, folders left out. */
export const parseLsjson = (text: string): RemoteFile[] =>
  (JSON.parse(text) as {Name: string; Size: number; IsDir: boolean}[]).filter((entry) => !entry.IsDir).map((entry) => ({name: entry.Name, size: entry.Size}));

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

const step = async (effects: ShipEffects, pack: string, script: string, args: string[] = []) => {
  const logName = `${pack}-${script.replace(':', '-')}.log`;
  const code = await effects.npm(script, [pack, ...args], logName);
  if (code !== 0) throw new ShipError(`${script} ${pack} failed (exit ${code}); see .cache/ship-pack/${logName}.`);
};

/** Uploads unless the key already holds these bytes; refuses a folder that holds anything else. */
const uploadChecked = async (effects: ShipEffects, {pack, zip, sha256, bytes, remote}: {pack: string; zip: string; sha256: string; bytes: number; remote: string}) => {
  const directory = remoteDirectoryOf(remote, pack, sha256);
  const name = zipFileName(pack);
  const key = `${directory}/${name}`;
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
export const shipPack = async (pack: string, options: ShipOptions, effects: ShipEffects) => {
  const zip = zipPathOf(pack);
  const folder = packFolderOf(pack);
  const state = await effects.readState();
  const shipped = state[pack];
  const zipBytes = await effects.localSize(zip);
  if (shipped && zipBytes === null && await effects.localSize(folder) === null) {
    effects.log(`${pack}: already shipped (${shipped.url}) and nothing local is left; skipped`);
    return shipped;
  }
  // A zip this run already uploaded skips the build: only the R2 check and the cleanup are left.
  const resumed = shipped !== undefined && zipBytes !== null && await effects.sha256(zip) === shipped.sha256;
  if (resumed) {
    effects.log(`${pack}: the local zip is the one shipped at ${shipped.url}; checking R2`);
  } else {
    await waitForMachine(effects, pack);
    effects.log(`${pack}: render:pack`);
    await step(effects, pack, 'render:pack');
    effects.log(`${pack}: validate:pack`);
    await step(effects, pack, 'validate:pack');
    effects.log(`${pack}: zip:pack`);
    await step(effects, pack, 'zip:pack');
  }
  const bytes = await effects.localSize(zip);
  if (bytes === null) throw new ShipError(`${zip} is missing after zip:pack.`);
  const sha256 = await effects.sha256(zip);
  const key = await uploadChecked(effects, {pack, zip, sha256, bytes, remote: options.remote});
  const record: ShippedPack = {sha256, key, url: publicUrlOf(pack, sha256), bytes, shippedAt: effects.now().toISOString()};
  await effects.writeState({...await effects.readState(), [pack]: record});
  effects.log(`${pack}: shipped ${record.url}`);
  if (options.deleteLocal) {
    await effects.removeLocal(zip);
    await effects.removeLocal(folder);
    effects.log(`${pack}: deleted ${zip} and ${folder}`);
  }
  return record;
};

/** Every pack in order; the first failure stops the chain, and later packs are not started. */
export const shipPacks = async (packs: readonly string[], options: ShipOptions, effects: ShipEffects): Promise<{code: 0 | 1; shipped: ShippedPack[]}> => {
  const shipped: ShippedPack[] = [];
  for (const pack of packs) {
    try {
      shipped.push(await shipPack(pack, options, effects));
    } catch (error) {
      // Any failure, ours or rclone's, ends in the log: a detached run has nobody watching its stderr.
      effects.log(`FAILED ${pack}: ${error instanceof Error ? error.message : String(error)}`);
      const left = packs.slice(packs.indexOf(pack) + 1);
      if (left.length > 0) effects.log(`not started: ${left.join(', ')}`);
      return {code: 1, shipped};
    }
  }
  effects.log(`done: ${shipped.map((record) => record.url).join(' ')}`);
  return {code: 0, shipped};
};
