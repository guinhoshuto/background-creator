// Waiting for this machine's turn to render: the machine free (the machine check shared by every repo,
// machine-check.ts, or the process list where it is missing) AND the machine-wide render slot
// (render-slot.ts) in hand. Kept free of the bundler and the renderer, so the
// tests import it as is.
//
// The order matters. The process check is waited for holding nothing: a render that does not take the
// slot yet (Chrome, the se-dev-kit CLI) may itself be waiting for the slot, and holding it while
// waiting on the check would deadlock. But waiting for the slot can take minutes, and a render that
// does not take the slot may start meanwhile, so the check runs again, without waiting, once the slot
// is held. Busy then: release the slot, wait again and retry, all within one total time limit.
import {execFileSync} from 'node:child_process';
import {basename} from 'node:path';
import {machineVerdict} from './machine-check';
import type {SlotHandle} from './render-slot';

/**
 * Heavy renders that do not take the render slot: headless Chrome (SE Widget Studio, thumbnails, an
 * older checkout) and the Remotion CLI. render:pack and validate:exports are left out: they take the
 * slot, and one waiting for it must not keep this run waiting in turn.
 */
export const BUSY_PATTERN = 'Chrome.*--headless|remotion render|dist/cli/index\\.js';

export type ProcessInfo = {pid: number; ppid: number; command: string};

/** `ps -o pid=,ppid=,command=` output as a list; a line without a pid, a ppid and a command is skipped. */
export const parseProcessList = (text: string): ProcessInfo[] => text.split('\n').flatMap((line) => {
  const match = /^\s*(\d+)\s+(\d+)\s+(\S.*)$/.exec(line);
  return match ? [{pid: Number(match[1]), ppid: Number(match[2]), command: match[3]}] : [];
});

// A shell or a search tool whose command line only mentions the pattern (the machine check's own
// `pgrep -fl 'Chrome.*headless|remotion|...'`, the shell that chains it before `npm run stills`, a
// watch loop) renders nothing: the work a shell starts shows up as a process of its own. So does
// caffeinate, which on macOS runs the command in its own pid and keeps a child with the same command
// line: a sibling of this run, not an ancestor.
const WRAPPER = /^-?(sh|bash|zsh|dash|ksh|fish|pgrep|pkill|grep|egrep|rg|caffeinate)$/;
const executable = (command: string) => basename(command.trimStart().split(/\s+/, 1)[0] ?? '');

/** `selfPid`, the processes above it (below launchd) and everything it started. Safe against ppid cycles. */
const familyOf = (processes: readonly ProcessInfo[], selfPid: number) => {
  const parents = new Map(processes.map(({pid, ppid}) => [pid, ppid]));
  const children = new Map<number, number[]>();
  for (const {pid, ppid} of processes) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const own = new Set<number>();
  const pending = [selfPid];
  for (let pid = pending.pop(); pid !== undefined; pid = pending.pop()) {
    if (own.has(pid)) continue;
    own.add(pid);
    pending.push(...(children.get(pid) ?? []));
  }
  const ancestors = new Set<number>();
  for (let pid = parents.get(selfPid); pid !== undefined && pid > 1 && !ancestors.has(pid); pid = parents.get(pid)) ancestors.add(pid);
  return new Set([...own, ...ancestors]);
};

/**
 * The other heavy renders, as `${pid} ${command}` lines (the shape of `pgrep -fl`): processes whose
 * full command matches BUSY_PATTERN, except this run's own family and the wrappers above. The shell
 * that runs an agent's command is an ancestor, and its command line often contains the pattern (the
 * machine check chained before `npm run stills`): counting it made stills wait for itself.
 */
export const otherRenders = (processes: readonly ProcessInfo[], selfPid: number): string[] => {
  const busy = new RegExp(BUSY_PATTERN);
  const own = familyOf(processes, selfPid);
  return processes
    .filter(({pid, command}) => !own.has(pid) && busy.test(command) && !WRAPPER.test(executable(command)))
    .map(({pid, command}) => `${pid} ${command}`);
};

/**
 * Why this run should wait now, one line per reason; empty when the machine is free. The machine
 * check shared by every repo (machine-check.ts) answers when it is on this machine: other renders,
 * the render slot, the game, free memory and disk. Elsewhere, the other heavy renders from `ps`
 * (macOS and Linux), as `${pid} ${command}` lines.
 */
export const busyProcesses = (verdict = machineVerdict): string[] => {
  const answer = verdict(process.pid);
  if (answer) return answer.reasons;
  let list: string;
  try {
    list = execFileSync('ps', ['-Aww', '-o', 'pid=,ppid=,command='], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  } catch {
    // Fails open: no list, nothing busy. The render slot still serializes the renders that take it.
    return [];
  }
  return otherRenders(parseProcessList(list), process.pid);
};

export type TurnEffects = {
  /** Why to wait right now, one line per reason (busyProcesses), never waiting; empty when free. */
  busy: () => string[];
  /** Takes the render slot, waiting at most `waitLimitMs` (or failing at once when `wait` is false). */
  acquire: (options: {wait: boolean; waitLimitMs: number}) => Promise<SlotHandle>;
  sleep: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
  /** Runs with the slot held and the machine idle, e.g. the disk check; a throw releases the slot. */
  whileHeld?: () => void;
};

export type TurnOptions = {wait: boolean; limitMs?: number; pollMs?: number};

// Long enough to wait out a whole kit of another pack chain, which gives way between kits (render-slot.ts).
const TOTAL_LIMIT_MS = 4 * 60 * 60 * 1000;
const POLL_MS = 10_000;

const sample = (busy: readonly string[]) => busy.slice(0, 3).map((line) => `  ${line.slice(0, 140)}`).join('\n');

/**
 * Waits until no other render runs and the render slot is held, and returns the held slot. With
 * `wait: false` it fails at once instead of waiting, leaving the slot released.
 */
export const takeRenderTurn = async ({wait, limitMs = TOTAL_LIMIT_MS, pollMs = POLL_MS}: TurnOptions, effects: TurnEffects): Promise<SlotHandle> => {
  const now = effects.now ?? Date.now;
  const log = effects.log ?? ((message: string) => console.log(message));
  const deadline = now() + limitMs;
  const giveUp = () => new Error(`Gave up after ${Math.round(limitMs / 60_000)} minutes waiting for the other render to end.`);
  let warnedBusy = false;
  let warnedRetry = false;
  for (;;) {
    // The process check first, holding nothing.
    for (let busy = effects.busy(); busy.length > 0; busy = effects.busy()) {
      if (!wait) throw new Error(`The machine is busy (one heavy render at a time):\n${sample(busy)}\nRun again when it is free, or drop --no-wait to wait for it.`);
      if (!warnedBusy) { log(`Waiting: the machine is busy (one heavy render at a time):\n${sample(busy)}`); warnedBusy = true; }
      if (now() >= deadline) throw giveUp();
      await effects.sleep(pollMs);
    }
    const slot = await effects.acquire({wait, waitLimitMs: Math.max(0, deadline - now())});
    const busy = effects.busy();
    if (busy.length === 0) {
      try {
        effects.whileHeld?.();
      } catch (error) {
        slot.release();
        throw error;
      }
      return slot;
    }
    slot.release();
    if (!wait) throw new Error(`The machine got busy while this run took the render slot (one heavy render at a time):\n${sample(busy)}\nThe slot is released. Run again when it is free, or drop --no-wait to wait for it.`);
    if (!warnedRetry) { log(`Released the render slot: the machine got busy while waiting for it:\n${sample(busy)}\nWaiting until it is free, then taking the slot again.`); warnedRetry = true; }
    if (now() >= deadline) throw giveUp();
  }
};
