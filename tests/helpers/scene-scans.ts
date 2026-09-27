import assert from 'node:assert/strict';
import {getCompositionMetadata} from '../../src/settings';

/**
 * The generic scene scans of tests/backgrounds.test.ts, as reusable assertions for scenes that
 * are not registered there (the overlay engine's builders, a kind's variants).
 */

export type Scene = Record<string, string | number>[];
export type SceneInput = {seed?: number; durationSeconds?: number; outputFormat?: 'mp4' | 'webm' | 'gif' | 'mov' | 'png'};
export type Sampler = (input: SceneInput, frame: number, length: number) => Scene;
/** Fields a scene checks elsewhere (an invisible jump); see backgrounds.test.ts. */
export type SeamExempt = (element: Record<string, string | number>, key: string) => boolean;

/** Same seed and frame, same scene, whatever was computed in between; another seed differs. */
export const assertDeterministic = (id: string, sample: Sampler, {seeded = true} = {}) => {
  const first = sample({seed: 42}, 137, 480);
  sample({seed: -7}, 350, 480);
  assert.deepEqual(sample({seed: 42}, 137, 480), first, `${id}: determinismo`);
  if (seeded) assert.notDeepEqual(sample({seed: 43}, 137, 480), first, `${id}: a seed muda a cena`);
};

/** Frame N is frame 0 again, across durations, cadences (50/60 fps) and seeds. */
export const assertPeriodic = (id: string, sample: Sampler, {moving = true} = {}) => {
  for (const durationSeconds of [3.7, 8, 12.25]) {
    for (const outputFormat of ['mp4', 'webm', 'gif'] as const) {
      const {durationInFrames: length} = getCompositionMetadata({durationSeconds, outputFormat});
      for (const seed of [-7, 1, 2026]) {
        const props = {durationSeconds, outputFormat, seed};
        assert.deepEqual(sample(props, 0, length), sample(props, length, length), `${id} ${durationSeconds}s ${outputFormat}`);
        assert.deepEqual(sample(props, 17, length), sample(props, length + 17, length));
        assert.deepEqual(sample(props, length - 1, length), sample(props, -1, length));
        if (moving) assert.notDeepEqual(sample(props, 0, length), sample(props, length - 1, length), `${id}: não duplique o primeiro frame`);
      }
    }
  }
};

/**
 * Every numeric field keeps its velocity from the last frame into the first. The one-sided
 * velocities use second-order stencils, (3·f(0) − 4·f(∓h) + f(∓2h)) / 2h, so a smooth curve (a
 * glint going round a circle, where one coordinate turns with a large acceleration) agrees on both
 * sides; a first-order difference would split by acceleration·h there without any seam at all.
 */
export const assertSeamVelocity = (id: string, sample: Sampler, seamExempt?: SeamExempt) => {
  const normalizedStep = 1e-6;
  for (const length of [185, 480, 735]) {
    for (const seed of [-7, 1, 2026]) {
      const at = (steps: number) => sample({seed}, steps < 0 ? length * (1 + steps * normalizedStep) : length * steps * normalizedStep, length);
      const beginning = sample({seed}, 0, length);
      const [before2, before, after, after2] = [at(-2), at(-1), at(1), at(2)];
      for (const scene of [before2, before, after, after2]) {
        assert.equal(scene.length, beginning.length, `${id}: a cena muda de tamanho na emenda`);
      }
      for (let i = 0; i < beginning.length; i++) {
        for (const [key, value] of Object.entries(beginning[i]!)) {
          if (typeof value !== 'number' || seamExempt?.(beginning[i]!, key)) continue;
          const [previous2, previous, next, next2] = [before2, before, after, after2].map((scene) => scene[i]![key]);
          for (const neighbour of [previous2, previous, next, next2]) assert.equal(typeof neighbour, 'number');
          const leftVelocity = (3 * value - 4 * (previous as number) + (previous2 as number)) / (2 * normalizedStep);
          const rightVelocity = (4 * (next as number) - 3 * value - (next2 as number)) / (2 * normalizedStep);
          const tolerance = 0.1 + Math.max(Math.abs(leftVelocity), Math.abs(rightVelocity)) * 0.001;
          assert.ok(Number.isFinite(leftVelocity) && Number.isFinite(rightVelocity), `${id} ${i}.${key}: movimento finito`);
          assert.ok(Math.abs(leftVelocity - rightVelocity) < tolerance, `${id} seed ${seed} ${i}.${key}: velocidade ${leftVelocity} vs ${rightVelocity}`);
        }
      }
    }
  }
};

/** Finite numbers, opacity in [0, 1], and every radius* positive, through the cycle. */
export const assertValidElements = (id: string, sample: Sampler) => {
  for (const frame of [0, 1, 60, 120, 240, 359, 479]) {
    for (const element of sample({}, frame, 480)) {
      for (const value of Object.values(element)) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value), `${id}: número finito`);
      }
      assert.ok(typeof element.opacity === 'number' && element.opacity >= 0 && element.opacity <= 1, `${id}: opacidade`);
      for (const key of ['radius', 'radiusX', 'radiusY']) {
        if (key in element) assert.ok(typeof element[key] === 'number' && element[key] > 0, `${id}: ${key} > 0`);
      }
    }
  }
};
