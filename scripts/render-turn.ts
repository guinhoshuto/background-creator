// Waiting for this machine's turn to render: no other heavy render running (pgrep) AND the
// machine-wide render slot (render-slot.ts) in hand. Kept free of the bundler and the renderer, so the
// tests import it as is.
//
// The order matters. pgrep is waited for holding nothing: a render that does not take the slot yet
// (Chrome, the se-dev-kit CLI) may itself be waiting for the slot, and holding it while waiting on
// pgrep would deadlock. But waiting for the slot can take minutes, and a render that does not take
// the slot may start meanwhile, so pgrep is checked again, without waiting, once the slot is held.
// Busy then: release the slot, wait for pgrep again and retry, all within one total time limit.
import {execFileSync} from 'node:child_process';
import type {SlotHandle} from './render-slot';

/**
 * Heavy renders that do not take the render slot: headless Chrome (SE Widget Studio, thumbnails, an
 * older checkout) and the Remotion CLI. render:pack and validate:exports are left out: they take the
 * slot, and one waiting for it must not keep this run waiting in turn.
 */
export const BUSY_PATTERN = 'Chrome.*--headless|remotion render|dist/cli/index\\.js';

/**
 * Matching processes, this one excluded. Its ancestors (npm, sh, tsx's dist/cli.mjs) do not match the
 * pattern, and it has no children yet when this runs: the bundle and the browser start after the turn.
 */
export const busyProcesses = (): string[] => {
  try {
    return execFileSync('pgrep', ['-fl', BUSY_PATTERN], {encoding: 'utf8'}).trim().split('\n')
      .filter((line) => line && !line.startsWith(`${process.pid} `));
  } catch {
    return []; // pgrep exits 1 when nothing matches
  }
};

export type TurnEffects = {
  /** The other renders running right now (pgrep), never waiting. */
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

const TOTAL_LIMIT_MS = 30 * 60 * 1000;
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
    // pgrep first, holding nothing.
    for (let busy = effects.busy(); busy.length > 0; busy = effects.busy()) {
      if (!wait) throw new Error(`Another render is running on this machine (one heavy render at a time):\n${sample(busy)}\nRun again when it ends, or drop --no-wait to wait for it.`);
      if (!warnedBusy) { log(`Waiting: another render is running on this machine (one at a time):\n${sample(busy)}`); warnedBusy = true; }
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
    if (!wait) throw new Error(`Another render started while this one took the render slot (one heavy render at a time):\n${sample(busy)}\nThe slot is released. Run again when it ends, or drop --no-wait to wait for it.`);
    if (!warnedRetry) { log(`Released the render slot: another render started while waiting for it:\n${sample(busy)}\nWaiting for it to end, then taking the slot again.`); warnedRetry = true; }
    if (now() >= deadline) throw giveUp();
  }
};
