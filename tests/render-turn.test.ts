import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {HELD_ENV, acquireRenderSlot, renderSlotHolder} from '../scripts/render-slot';
import {otherRenders, parseProcessList, takeRenderTurn, type TurnEffects} from '../scripts/render-turn';

const MINUTE = 60_000;
// The fake clock starts far from 0, like Date.now(): a `since` of 0 would stand out.
const START = 1_790_000_000_000;
const OTHER = ['4242 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless'];

/**
 * A fake machine on a fake clock. `busyAt(t)` says whether the whole machine check is busy at minute t,
 * `outsideAt(t)` whether what the slot does not cover is (by default the same: a render that does not
 * take the slot); taking the slot costs `slotWaitMs` of waiting. Every effect is recorded.
 */
const fakeMachine = ({busyAt, outsideAt = busyAt, slotWaitMs = 0, diskThrows = false}: {busyAt: (minute: number) => boolean; outsideAt?: (minute: number) => boolean; slotWaitMs?: number; diskThrows?: boolean}) => {
  let clock = START;
  let held = false;
  const minute = () => (clock - START) / MINUTE;
  const events: string[] = [];
  const acquireLimits: number[] = [];
  const acquireSinces: number[] = [];
  const logs: string[] = [];
  const effects: TurnEffects = {
    busy: () => (busyAt(minute()) ? OTHER : []),
    outsideSlot: () => (outsideAt(minute()) ? OTHER : []),
    acquire: async ({waitLimitMs, since}) => {
      acquireLimits.push(waitLimitMs);
      acquireSinces.push(since);
      clock += Math.min(slotWaitMs, waitLimitMs);
      held = true;
      events.push('acquire');
      return {inherited: false, release: () => { if (held) events.push('release'); held = false; }};
    },
    sleep: async (ms) => {
      clock += ms;
      // A run that never gives up would loop forever on the fake clock.
      if (minute() > 5 * 60) throw new Error('still waiting after 5 hours');
    },
    now: () => clock,
    log: (message) => { logs.push(message); },
    whileHeld: () => {
      events.push(held ? 'disk (held)' : 'disk (NOT held)');
      if (diskThrows) throw new Error('not enough free disk');
    },
  };
  return {effects, events, logs, acquireLimits, acquireSinces, isHeld: () => held, minutes: minute};
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

test('the slot owner\'s own render does not delay asking for the slot: it is waited for in the queue', async () => {
  // The slot owner renders until minute 5 (the whole check is busy), which the slot does cover.
  const machine = fakeMachine({busyAt: (minute) => minute < 5, outsideAt: () => false, slotWaitMs: 5 * MINUTE});
  await takeRenderTurn({wait: true}, machine.effects);
  assert.deepEqual(machine.events, ['acquire', 'disk (held)']);
  assert.equal(machine.minutes(), 5, 'asked for the slot only after the owner\'s render, outside its queue');
  assert.deepEqual(machine.acquireSinces, [START]);
  assert.deepEqual(machine.logs, []);
});

test('a run that gives the slot back asks again with the moment it first asked: its place in the queue', async () => {
  // A render outside the slot until minute 3; the slot takes 5 minutes; at minute 8 another render
  // outside the slot runs until minute 10, so the slot goes back and the run waits outside it again.
  const outside = (minute: number) => minute < 3 || (minute >= 7 && minute < 10);
  const machine = fakeMachine({busyAt: outside, slotWaitMs: 5 * MINUTE});
  await takeRenderTurn({wait: true}, machine.effects);
  assert.deepEqual(machine.events, ['acquire', 'release', 'acquire', 'disk (held)']);
  // Fixed when it first asked for the slot (minute 3), not when it started waiting nor on the second round.
  assert.deepEqual(machine.acquireSinces.map((since) => (since - START) / MINUTE), [3, 3]);
  assert.equal(machine.minutes(), 15);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('a stills that comes while a pack chain renders kit 1 goes before kit 2 (HAR-61)', async (t) => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'render-turn-test-'));
  t.after(() => rmSync(base, {recursive: true, force: true}));
  const dir = path.join(base, 'render-slot');
  const marker = `har61-chain-${process.pid}`;
  const log = path.join(base, 'chain.log');
  // Started through a shell that exits at once: a child of this test would be this run's own family,
  // which otherRenders never counts, and the case would pass without looking at the chain's renders.
  const chainPid = Number(execFileSync('/bin/sh', ['-c', '"$0" --import tsx "$1" "$2" kit1,kit2 1500 > "$3" 2>&1 & echo $!', process.execPath, path.join(root, 'tests', 'helpers', 'render-chain.ts'), marker, log], {
    cwd: root, encoding: 'utf8', env: {...process.env, RENDER_SLOT_DIR: dir, [HELD_ENV]: ''},
  }).trim());
  const running = () => { try { process.kill(chainPid, 0); return true; } catch { return false; } };
  t.after(() => { if (running()) process.kill(chainPid); });
  const output = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  for (const started = Date.now(); !output().includes('kit1 held'); await pause(20)) {
    assert.ok(Date.now() - started < 20_000, `the chain never took the slot: ${output()}`);
  }

  // Only this test's renders count, whatever else runs on the machine.
  const renders = (slotOwnerPid?: number) => {
    const list = parseProcessList(execFileSync('ps', ['-Aww', '-o', 'pid=,ppid=,command='], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}));
    return otherRenders(list, process.pid, slotOwnerPid).filter((line) => line.includes(marker));
  };
  // Waiting outside the queue polls every second (10 s for real): the few ms between the chain's kit 1
  // and kit 2 must not let a stills that waited outside the queue slip in.
  const slot = await takeRenderTurn({wait: true, limitMs: 30_000, pollMs: 1000}, {
    busy: () => renders(),
    outsideSlot: () => renders(renderSlotHolder(dir)?.owner?.pid),
    acquire: ({wait, waitLimitMs, since}) => acquireRenderSlot({dir, command: 'stills', wait, waitLimitMs, since, pollMs: 50, log: () => {}}),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: () => {},
  });
  const stillsHeld = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const stillsReleased = Date.now();
  slot.release();
  for (const started = Date.now(); running(); await pause(50)) assert.ok(Date.now() - started < 20_000, `the chain never ended: ${output()}`);

  const text = output();
  const at = (line: string) => Number(new RegExp(`^${line} (\\d+)$`, 'm').exec(text)?.[1]);
  assert.ok(at('kit1 released') <= stillsHeld, `stills took the slot before kit 1 ended:\n${text}`);
  assert.ok(stillsReleased <= at('kit2 held'), `kit 2 went before the stills that came during kit 1:\n${text}stills held ${stillsHeld}, released ${stillsReleased}`);
});
