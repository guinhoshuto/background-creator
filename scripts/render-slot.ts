// One heavy render at a time on this machine (8 GB of RAM), across repos and sessions.
//
// Protocol, so another repo can adopt it as is: the slot is the directory ~/.cache/render-slot
// (RENDER_SLOT_DIR overrides it). Taking it is an atomic mkdir; inside, owner.json holds
// {pid, repo, command, startedAt}. A slot whose pid is gone, or whose startedAt is before the last
// boot (the pid was reused), is taken over, under the mutex <slot>.takeover (an atomic mkdir), and
// only after checking again under it that the same dead owner still holds it. Only the owner removes
// it. A child process started by the owner finds RENDER_SLOT_HELD=<owner pid> in its environment
// and runs under the parent's slot instead of waiting for it.
//
// The takeover mutex is identified by the inode of its directory, never by its path. Right after
// the mkdir its creator creates holder.json ({pid, token}) inside with an exclusive create, reads
// the inode and keeps it, but only when holder.json still holds its token (otherwise the directory
// at the path is not the one it made). So a live mutex is never an empty directory, and a rename
// cannot replace it. Removing a mutex, whether leaving the critical section or clearing one whose
// mtime is older than 10 seconds (its taker died), is never a plain rm of the path: rename the path
// to a unique name (<slot>.takeover.stale-<pid>-<counter>), which only one process can do for a
// given directory (the others get ENOENT and try again), then compare the inode of the moved
// directory with the inode seen before. The same inode: delete it. Another inode (a live mutex
// someone made in between): move it back if the path is still free, otherwise delete it (its holder
// then finds another inode at the path and leaves that one alone). The window this leaves is
// described at removeMutexIfSame.
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
/** The manual way out when no render is running and the slot stays held. */
const STUCK_HINT = (dir: string) => `If no render is running, remove the slot by hand: rm -r ${dir}`;

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

/** When this machine booted, in ms since the epoch. */
const bootTimeMs = () => Date.now() - os.uptime() * 1000;

/**
 * Whether the owner still runs. A slot written before the last boot is dead even when its pid is
 * alive again: after a reboot the pid belongs to another process (EPERM counts as alive).
 */
const ownerAlive = (owner: SlotOwner) => !(Date.parse(owner.startedAt) < bootTimeMs()) && alive(owner.pid);

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

/** Whether `dir` is held by a dead owner (or by a writer that died before writing owner.json). */
const isStale = (dir: string, owner: SlotOwner | null) => (owner ? !ownerAlive(owner) : ageMs(dir) > UNWRITTEN_GRACE_MS);

const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;

const inodeOf = (target: string) => {
  try { return statSync(target).ino; } catch { return null; }
};

/** What a process saw at a takeover mutex path: which directory (inode) and how old it was. */
export type MutexSighting = {ino: number; ageMs: number};

export const sightMutex = (mutex: string): MutexSighting | null => {
  try {
    const stats = statSync(mutex);
    return {ino: stats.ino, ageMs: Date.now() - stats.mtimeMs};
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
};

/**
 * Takes the takeover mutex: an atomic mkdir, holder.json inside, then its inode, which the caller
 * keeps. Null when another process holds it, or when the directory at the path is no longer the
 * one made here (moved by a clearer: it is then an orphan, cleared after the grace).
 */
export const takeMutex = (mutex: string): number | null => {
  try {
    mkdirSync(mutex);
  } catch (error) {
    if (errorCode(error) === 'EEXIST') return null;
    throw error;
  }
  // holder.json is created exclusively and read back: a directory at the path that already had one,
  // or that is gone, is not the one made here.
  const holder = path.join(mutex, 'holder.json');
  const token = `${process.pid}-${Date.now()}-${Math.random()}`;
  try {
    writeFileSync(holder, `${JSON.stringify({pid: process.pid, token})}\n`, {flag: 'wx'});
    const {ino} = statSync(mutex);
    return (JSON.parse(readFileSync(holder, 'utf8')) as {token: string}).token === token ? ino : null;
  } catch (error) {
    if (errorCode(error) === 'ENOENT' || errorCode(error) === 'EEXIST') return null;
    throw error;
  }
};

let asideCount = 0;

/**
 * Removes the mutex directory whose inode is `ino`, and never another one: the path is renamed to a
 * unique name first, so of the processes that try this on one directory only one moves it, and
 * the moved directory is deleted only when its inode is `ino`. A live mutex moved by mistake goes
 * back when the path is still free.
 *
 * The window left: between that rename and the move back (a few syscalls), a live mutex is not at
 * its path, so a third process can mkdir a new one and share the critical section with the holder
 * of the moved one. A taker whose new directory is moved before it reads holder.json back gives
 * up, and the directory moved back stays as an orphan until the grace (a stall of 10 seconds).
 * Both need a clearer acting on a sighting that another clearer and a new taker made out of date
 * within microseconds, which only happens right after a taker died holding the mutex; a stress
 * probe with six processes spinning on the mutex and a taker dying every third entry hits it.
 * On a file system that reuses an inode at once (not APFS), a recreated mutex can also match.
 */
const removeMutexIfSame = (mutex: string, ino: number) => {
  asideCount += 1;
  const aside = `${mutex}.stale-${process.pid}-${asideCount}`;
  try {
    renameSync(mutex, aside);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
  if (inodeOf(aside) === ino) {
    rmSync(aside, {recursive: true, force: true});
    return true;
  }
  try {
    renameSync(aside, mutex);
  } catch (error) {
    const code = errorCode(error);
    if (code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error;
    // The path holds a newer mutex: the holder of the one moved here never removes that newer one.
    rmSync(aside, {recursive: true, force: true});
  }
  return false;
};

/** Leaves the critical section: removes the mutex only while the one at the path is still this one. */
export const releaseMutex = (mutex: string, ino: number) => removeMutexIfSame(mutex, ino);

/**
 * Clears a mutex left by a taker that died, given what was seen at its path: nothing when the
 * sighting is not older than the grace, and only the directory seen, never one made after it.
 * True when this process removed it.
 */
export const clearStaleMutex = (mutex: string, seen: MutexSighting) => seen.ageMs > UNWRITTEN_GRACE_MS && removeMutexIfSame(mutex, seen.ino);

/**
 * Removes a dead owner's slot under the takeover mutex, after checking again that the same dead
 * owner still holds it: a slot someone took in between is never touched. False when another
 * process is taking it over now. A mutex left by a taker that died is cleared after the grace.
 */
const takeOverStale = (dir: string, stalePid: number | null) => {
  const mutex = `${dir}.takeover`;
  const ino = takeMutex(mutex);
  if (ino === null) {
    const seen = sightMutex(mutex);
    return seen === null || clearStaleMutex(mutex, seen);
  }
  try {
    const owner = readOwner(dir);
    if ((owner?.pid ?? null) === stalePid && isStale(dir, owner)) rmSync(dir, {recursive: true, force: true});
  } finally {
    releaseMutex(mutex, ino);
  }
  return true;
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
    if (current && current.pid === held && ownerAlive(current)) return noopHandle();
    try {
      mkdirSync(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = readOwner(dir);
      if (isStale(dir, owner) && takeOverStale(dir, owner?.pid ?? null)) continue;
      const holder = describeHolder(owner);
      if (options.wait === false) throw new Error(`Another render holds the render slot (${dir}), ${holder}. Run again when it ends. ${STUCK_HINT(dir)}`);
      if (!warned) { log(`Waiting for the render slot, ${holder}.`); warned = true; }
      if (Date.now() - started > waitLimitMs) {
        throw new Error(`Gave up after ${Math.round(waitLimitMs / 60_000)} minutes waiting for the render slot (${dir}), ${holder}. Run again when that render ends; a slot whose pid is gone is taken over automatically. ${STUCK_HINT(dir)}`);
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
