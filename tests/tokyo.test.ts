import assert from 'node:assert/strict';
import test from 'node:test';
import {createTokyoRain, getTokyoMotion, rainHeight} from '../src/backgrounds/tokyo/motion';
import {tokyoFutureLoopSchema} from '../src/backgrounds/TokyoFutureLoop';

test('Tokyo camera and light return with continuous position and speed', () => {
  for (const duration of [185, 720, 960]) {
    assert.deepEqual(getTokyoMotion(duration, duration), getTokyoMotion(0, duration));
    const step = duration * 0.000001;
    const before = getTokyoMotion(-step, duration);
    const start = getTokyoMotion(0, duration);
    const after = getTokyoMotion(step, duration);
    for (const key of ['cameraX', 'cameraY', 'cameraZ', 'neon'] as const) {
      assert.ok(Math.abs(before[key] - start[key]) < 0.00001, `${key}: position seam`);
      assert.ok(Math.abs((start[key] - before[key]) - (after[key] - start[key])) < 0.0000001, `${key}: speed seam`);
    }
  }
  assert.equal(getTokyoMotion(180, 720, 0).cameraX, 1.3);
});

test('Tokyo rain is seeded and its travel completes whole turns', () => {
  assert.deepEqual(createTokyoRain(19), createTokyoRain(19));
  assert.notDeepEqual(createTokyoRain(19), createTokyoRain(20));
  const phaseBefore = getTokyoMotion(719.999999, 720).phase;
  for (const drop of createTokyoRain(19)) {
    assert.ok(Math.abs(rainHeight(drop.offset, phaseBefore) - rainHeight(drop.offset, 0)) < 0.00001);
  }
});

test('Tokyo stays full HD and refuses an unsupported transparent city', () => {
  const props = tokyoFutureLoopSchema.parse({});
  assert.equal(props.durationSeconds, 12);
  assert.equal(props.transparent, false);
  assert.equal(tokyoFutureLoopSchema.safeParse({transparent: true}).success, false);
  assert.equal(tokyoFutureLoopSchema.safeParse({rain: 2}).success, false);
});
