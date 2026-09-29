// One heavy render at a time on this machine (8 GB of RAM), across repos and sessions.
//
// Protocol, so another repo can adopt it as is: the slot is the directory ~/.cache/render-slot
// (RENDER_SLOT_DIR overrides it). Taking it is an atomic mkdir; inside, owner.json holds
// {pid, repo, command, startedAt}. A slot whose pid is gone is taken over. Only the owner removes
// it. A child process started by the owner finds RENDER_SLOT_HELD=<owner pid> in its environment
// and runs under the parent's slot instead of waiting for it.
import {mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type SlotOwner = {pid: number; repo: string; command: string; startedAt: string};
export type SlotHandle = {release: () => void; inherited: boolean};
export type SlotOptions = {
  command: string;
  dir?: string;
  repo?: string;
  pollMs?: number;
  waitLimitMs?: number;
  /** false: fail at once when another process holds the slot (`--no-wait`). */
  wait?: boolean;
  log?: (message: string) => void;
};

export const HELD_ENV = 'RENDER_SLOT_HELD';
const REPO = 'background-creator';
const POLL_MS = 2000;
const WAIT_LIMIT_MS = 30 * 60 * 1000;
/** An owner.json still missing after this long means its writer died between mkdir and write. */
const UNWRITTEN_GRACE_MS = 10_000;
const OWNER_FILE = 'owner.json';

export const slotDir = () => process.env.RENDER_SLOT_DIR || path.join(os.homedir(), '.cache', 'render-slot');

/** What `npm run <script> -- <args>` looks like for the waiting message. */
export const currentCommand = () => {
  const args = process.argv.slice(2).join(' ');
  const script = process.env.npm_lifecycle_event;
  const base = script ? `npm run ${script}` : path.basename(process.argv[1] ?? 'node');
  return (args ? `${base}${script ? ' --' : ''} ${args}` : base).slice(0, 200);
};

const alive = (pid: number) => {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
};

const readOwner = (dir: string): SlotOwner | null => {
  try {
    const owner = JSON.parse(readFileSync(path.join(dir, OWNER_FILE), 'utf8')) as SlotOwner;
    return Number.isInteger(owner.pid) && owner.pid > 0 ? owner : null;
  } catch {
    return null;
  }
};

const ageMs = (dir: string) => {
  try { return Date.now() - statSync(dir).mtimeMs; } catch { return 0; }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Moves a dead owner's slot aside; if someone else took it in between, puts theirs back. */
const takeOverStale = (dir: string, stalePid: number | null) => {
  const grave = `${dir}.stale-${process.pid}-${Date.now()}`;
  try { renameSync(dir, grave); } catch { return; }
  const moved = readOwner(grave);
  if ((moved?.pid ?? null) !== stalePid) {
    try { renameSync(grave, dir); return; } catch { /* a third process holds the slot now: the moved one is stale */ }
  }
  rmSync(grave, {recursive: true, force: true});
};

/** Removes the slot only when this process owns it. */
export const releaseRenderSlot = (dir = slotDir()) => {
  if (readOwner(dir)?.pid !== process.pid) return false;
  rmSync(dir, {recursive: true, force: true});
  if (process.env[HELD_ENV] === String(process.pid)) delete process.env[HELD_ENV];
  return true;
};

const noopHandle = (): SlotHandle => ({release: () => {}, inherited: true});

const describeHolder = (owner: SlotOwner | null) => (owner
  ? `held by pid ${owner.pid} (${owner.repo}: ${owner.command}) since ${owner.startedAt}`
  : 'held by a process that is still writing its owner file');

/** Who holds the slot now, as a phrase for messages ("held by pid …"); null when it is free or its owner is gone. */
export const slotHolder = (dir = slotDir()): string | null => {
  const owner = readOwner(dir);
  if (owner) return alive(owner.pid) ? describeHolder(owner) : null;
  try { statSync(dir); } catch { return null; }
  return ageMs(dir) > UNWRITTEN_GRACE_MS ? null : describeHolder(null);
};

/**
 * Waits for the machine-wide render slot and takes it. The slot is released by `release()`, on
 * exit, and on SIGINT/SIGTERM. Nested calls in the same process and children of the owner
 * (RENDER_SLOT_HELD) run under the slot they already hold.
 */
export const acquireRenderSlot = async (options: SlotOptions): Promise<SlotHandle> => {
  const dir = options.dir ?? slotDir();
  const pollMs = options.pollMs ?? POLL_MS;
  const waitLimitMs = options.waitLimitMs ?? WAIT_LIMIT_MS;
  const log = options.log ?? ((message: string) => console.log(message));
  const started = Date.now();
  let warned = false;
  mkdirSync(path.dirname(dir), {recursive: true});
  for (;;) {
    const current = readOwner(dir);
    if (current?.pid === process.pid) return noopHandle();
    const held = Number(process.env[HELD_ENV]);
    if (current && current.pid === held && alive(held)) return noopHandle();
    try {
      mkdirSync(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = readOwner(dir);
      if (owner ? !alive(owner.pid) : ageMs(dir) > UNWRITTEN_GRACE_MS) { takeOverStale(dir, owner?.pid ?? null); continue; }
      const holder = describeHolder(owner);
      if (options.wait === false) throw new Error(`Another render holds the render slot (${dir}), ${holder}. Run again when it ends.`);
      if (!warned) { log(`Waiting for the render slot, ${holder}.`); warned = true; }
      if (Date.now() - started > waitLimitMs) {
        throw new Error(`Gave up after ${Math.round(waitLimitMs / 60_000)} minutes waiting for the render slot (${dir}), ${holder}. Run again when that render ends; a slot whose pid is gone is taken over automatically.`);
      }
      await sleep(pollMs);
      continue;
    }
    const owner: SlotOwner = {pid: process.pid, repo: options.repo ?? REPO, command: options.command, startedAt: new Date().toISOString()};
    const temporary = path.join(dir, `${OWNER_FILE}.tmp`);
    writeFileSync(temporary, `${JSON.stringify(owner, null, 2)}\n`);
    renameSync(temporary, path.join(dir, OWNER_FILE));
    process.env[HELD_ENV] = String(process.pid);

    const onExit = () => { releaseRenderSlot(dir); };
    const onSignal = (signal: NodeJS.Signals) => {
      releaseRenderSlot(dir);
      // Without another handler, Node would keep running once this one returns.
      if (process.listenerCount(signal) === 0) process.exit(signal === 'SIGINT' ? 130 : 143);
    };
    process.once('exit', onExit);
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    return {
      inherited: false,
      release: () => {
        releaseRenderSlot(dir);
        process.off('exit', onExit);
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
      },
    };
  }
};

/** Runs `task` holding the render slot, and releases it however `task` ends. */
export const withRenderSlot = async <T>(task: () => Promise<T>, options: Partial<SlotOptions> = {}): Promise<T> => {
  const slot = await acquireRenderSlot({command: currentCommand(), ...options});
  try {
    return await task();
  } finally {
    slot.release();
  }
};
