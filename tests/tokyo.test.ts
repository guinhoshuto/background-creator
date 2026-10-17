import assert from 'node:assert/strict';
import test from 'node:test';
import {createTokyoRain, getTokyoDropState, getTokyoMotion, rainHeight, type TokyoRainDrop} from '../src/backgrounds/tokyo/motion';
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

test('Tokyo rain has seeded depth, physical widths and varied terminal speeds', () => {
  const drops = createTokyoRain(19);
  assert.deepEqual(drops, createTokyoRain(19));
  assert.notDeepEqual(drops, createTokyoRain(20));
  assert.equal(drops.length, 1800);
  assert.equal(drops.filter(({z}) => z >= -12).length, 160);
  assert.equal(drops.filter(({z}) => z < -12 && z >= -52).length, 740);
  assert.equal(drops.filter(({z}) => z < -52).length, 900);
  assert.deepEqual([...new Set(drops.map(({turns}) => turns))].sort(), [3, 4, 5, 6]);
  for (const drop of drops) {
    assert.ok(drop.x >= -17 && drop.x <= 17);
    assert.ok(drop.z >= -128 && drop.z <= 11);
    assert.ok(drop.width >= 0.006 && drop.width <= 0.018);
    assert.ok(drop.opacity >= 0.18 && drop.opacity <= 0.5);
    assert.ok(drop.drift >= 0.6 && drop.drift <= 1.5);
    const exposure = drop.length / (2 * drop.turns);
    assert.ok(exposure >= 1 / 140 && exposure <= 1 / 90);
    assert.ok(drop.windPhase >= 0 && drop.windPhase < 2 * Math.PI);
  }
});

test('Tokyo rain repeats position, opacity, velocity and impact state across the loop', () => {
  const tau = 2 * Math.PI;
  const keys = ['x', 'y', 'z', 'tailX', 'tailY', 'opacity', 'impactX', 'impactZ', 'impactAge'] as const;
  for (const drop of createTokyoRain(19)) {
    for (const phase of [0, 0.47, 2.13, 5.94]) {
      const state = getTokyoDropState(drop, phase);
      const repeated = getTokyoDropState(drop, phase + tau);
      for (const key of keys) assert.ok(Math.abs(state[key] - repeated[key]) < 1e-10, `${key}: repeat`);
      assert.equal(state.y, rainHeight(drop.offset, phase, drop.turns));
    }
    const epsilon = 0.0000001;
    const before = getTokyoDropState(drop, -epsilon);
    const start = getTokyoDropState(drop, 0);
    const after = getTokyoDropState(drop, epsilon);
    for (const key of ['x', 'y', 'opacity', 'tailX'] as const) {
      assert.ok(Math.abs(before[key] - start[key]) < 0.00001, `${key}: position seam`);
      assert.ok(Math.abs((start[key] - before[key]) - (after[key] - start[key])) < 0.00000001, `${key}: speed seam`);
    }
  }
  assert.equal(rainHeight(0.4, 0.7), rainHeight(0.4, 0.7, 6));
});

const sampleDrop: TokyoRainDrop = {
  x: 2, z: -8, offset: 0.25, turns: 4, length: 0.08,
  width: 0.01, opacity: 0.4, drift: 1, windPhase: 0.9,
};

test('Tokyo streaks point opposite the measured fall and wind velocity', () => {
  const tau = 2 * Math.PI;
  const seconds = 0.00001;
  const delta = seconds * tau / 12;
  for (const turns of [3, 4, 5, 6]) {
    const drop = {...sampleDrop, turns};
    for (const phase of [0.4, 1.3, 2.8, 5.1]) {
      const state = getTokyoDropState(drop, phase);
      const before = getTokyoDropState(drop, phase - delta);
      const after = getTokyoDropState(drop, phase + delta);
      const vx = (after.x - before.x) / (2 * seconds);
      const vy = (after.y - before.y) / (2 * seconds);
      assert.ok(Math.abs(vy + 2 * turns) < 1e-7, 'each speed is constant in metres per second');
      assert.ok(Math.abs(state.tailX * vy - state.tailY * vx) < 1e-8, 'streak follows the velocity vector');
      assert.ok(state.tailX < 0 && state.tailY > 0, 'the tail remains behind the drop');
      assert.equal(state.tailY, 0.08);
    }
  }
});

test('Tokyo drops fade smoothly at birth and contact without fading mid-fall', () => {
  const tau = 2 * Math.PI;
  const atProgress = (progress: number) => getTokyoDropState(sampleDrop, (sampleDrop.offset + progress) * tau / 4);
  const born = atProgress(0);
  assert.equal(born.y, 24);
  assert.equal(born.opacity, 0);
  assert.equal(atProgress(0.5).opacity, 0.4);
  assert.ok(atProgress(0.01).opacity > 0 && atProgress(0.01).opacity < 0.4);
  assert.ok(atProgress(0.999).opacity > 0 && atProgress(0.999).opacity < 0.4);
  // Smoothstep gives zero opacity slope at the invisible reset on both ends.
  assert.ok(atProgress(0.000001).opacity < 1e-8);
  assert.ok(atProgress(0.999999).opacity < 1e-7);
  assert.ok(atProgress(0.999999).y < 0.000025);
});

test('Tokyo impact stays at the exact touchdown while its age advances in seconds', () => {
  const tau = 2 * Math.PI;
  for (const offset of [0.25, 0.99]) {
    const drop = {...sampleDrop, offset};
    // The second contact sits just before the loop seam, so the ripple survives it.
    const contactPhase = (offset + (offset === 0.99 ? 3 : 0)) * tau / 4;
    const touchdown = getTokyoDropState(drop, contactPhase - 1e-10);
    const expectedImpactX = 2.5 + 0.12 * Math.sin(contactPhase + 0.9);
    for (const seconds of [0.001, 0.04, 0.15, 0.3]) {
      const state = getTokyoDropState(drop, contactPhase + seconds * tau / 12);
      assert.ok(Math.abs(state.impactX - expectedImpactX) < 1e-12);
      assert.ok(Math.abs(state.impactX - touchdown.x) < 1e-8, 'impact appears at the falling tip');
      assert.equal(state.impactZ, -8);
      assert.ok(Math.abs(state.impactAge - seconds) < 1e-12);
    }
  }
});

test('Tokyo stays full HD and refuses an unsupported transparent city', () => {
  const props = tokyoFutureLoopSchema.parse({});
  assert.equal(props.durationSeconds, 12);
  assert.equal(props.transparent, false);
  assert.equal(tokyoFutureLoopSchema.safeParse({transparent: true}).success, false);
  assert.equal(tokyoFutureLoopSchema.safeParse({rain: 2}).success, false);
});
