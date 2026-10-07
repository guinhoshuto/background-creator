import assert from 'node:assert/strict';
import {test} from 'node:test';
import {takeRenderTurn, type TurnEffects} from '../scripts/render-turn';

const MINUTE = 60_000;
const OTHER = ['4242 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless'];

/**
 * A fake machine on a fake clock. `busyAt(t)` says whether another render (one that does not take the
 * slot) runs at minute t; taking the slot costs `slotWaitMs` of waiting. Every effect is recorded.
 */
const fakeMachine = ({busyAt, slotWaitMs = 0, diskThrows = false}: {busyAt: (minute: number) => boolean; slotWaitMs?: number; diskThrows?: boolean}) => {
  let clock = 0;
  let held = false;
  const events: string[] = [];
  const acquireLimits: number[] = [];
  const logs: string[] = [];
  const effects: TurnEffects = {
    busy: () => (busyAt(clock / MINUTE) ? OTHER : []),
    acquire: async ({waitLimitMs}) => {
      acquireLimits.push(waitLimitMs);
      clock += Math.min(slotWaitMs, waitLimitMs);
      held = true;
      events.push('acquire');
      return {inherited: false, release: () => { if (held) events.push('release'); held = false; }};
    },
    sleep: async (ms) => {
      clock += ms;
      // A run that never gives up would loop forever on the fake clock.
      if (clock > 5 * 60 * MINUTE) throw new Error('still waiting after 5 hours');
    },
    now: () => clock,
    log: (message) => { logs.push(message); },
    whileHeld: () => {
      events.push(held ? 'disk (held)' : 'disk (NOT held)');
      if (diskThrows) throw new Error('not enough free disk');
    },
  };
  return {effects, events, logs, acquireLimits, isHeld: () => held, minutes: () => clock / MINUTE};
};

test('an idle machine takes the slot at the first try and measures the disk while holding it', async () => {
  const machine = fakeMachine({busyAt: () => false});
  const slot = await takeRenderTurn({wait: true}, machine.effects);
  assert.deepEqual(machine.events, ['acquire', 'disk (held)']);
  assert.equal(machine.isHeld(), true);
  assert.equal(machine.minutes(), 0);
  assert.deepEqual(machine.logs, []);
  slot.release();
});

test('a render that starts while waiting for the slot makes it release the slot, wait and take it again', async () => {
  // Idle at first; taking the slot waits 5 minutes, during which another render starts and runs until minute 8.
  const machine = fakeMachine({busyAt: (minute) => minute >= 4 && minute < 8, slotWaitMs: 5 * MINUTE});
  await takeRenderTurn({wait: true}, machine.effects);
  assert.deepEqual(machine.events, ['acquire', 'release', 'acquire', 'disk (held)']);
  assert.equal(machine.isHeld(), true);
  assert.ok(machine.minutes() >= 8, `took the turn at minute ${machine.minutes()}, while the other render ran until minute 8`);
  assert.equal(machine.logs.filter((line) => line.startsWith('Released the render slot')).length, 1);
});

test('--no-wait fails at once when a render started while taking the slot, and leaves the slot released', async () => {
  const machine = fakeMachine({busyAt: (minute) => minute >= 1, slotWaitMs: 2 * MINUTE});
  await assert.rejects(takeRenderTurn({wait: false}, machine.effects), (error: Error) => {
    assert.match(error.message, /Google Chrome --headless/);
    assert.match(error.message, /--no-wait/);
    return true;
  });
  assert.equal(machine.isHeld(), false);
  assert.deepEqual(machine.events, ['acquire', 'release']);
});

test('a failed disk check releases the slot', async () => {
  const machine = fakeMachine({busyAt: () => false, diskThrows: true});
  await assert.rejects(takeRenderTurn({wait: true}, machine.effects), /not enough free disk/);
  assert.equal(machine.isHeld(), false);
});

test('the 4-hour limit covers every round of waiting, not each one', async () => {
  // pgrep busy until minute 20; the slot takes 5 minutes; by then another render runs for good.
  const machine = fakeMachine({busyAt: (minute) => minute < 20 || minute >= 24, slotWaitMs: 5 * MINUTE});
  // Four hours, a whole kit of a pack chain (about 2.4 hours): a short run waits it out instead of giving up.
  await assert.rejects(takeRenderTurn({wait: true}, machine.effects), /Gave up after 240 minutes/);
  assert.equal(machine.isHeld(), false);
  // One poll (10 s) of slack past the limit, no more.
  assert.ok(machine.minutes() <= 240 + 10 / 60, `gave up at minute ${machine.minutes()}`);
  // The slot wait gets only what is left of the 4 hours.
  assert.ok(machine.acquireLimits.every((limit) => limit <= 220 * MINUTE), `slot wait limits: ${machine.acquireLimits.map((limit) => limit / MINUTE)} min`);
});
