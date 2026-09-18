import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {getCobwebScene, cobwebLoopSchema} from '../src/backgrounds/CobwebLoop';
import {getGeometricScene, geometricLoopSchema} from '../src/backgrounds/GeometricLoop';
import {getGradientScene, gradientLoopSchema} from '../src/backgrounds/GradientLoop';
import {getHalloweenScene, halloweenLoopSchema} from '../src/backgrounds/HalloweenLoop';
import {getKawaiiScene, kawaiiLoopSchema} from '../src/backgrounds/KawaiiLoop';
import {getParticleScene, particleLoopSchema} from '../src/backgrounds/ParticleLoop';
import {getSunburstScene, sunburstLoopSchema} from '../src/backgrounds/SunburstLoop';
import {backgroundCatalog, getBackground} from '../src/catalog';
import {loopPhase} from '../src/loop';
import {getCompositionMetadata} from '../src/settings';

type Scene = Record<string, string | number>[];
/** Fields a scene checks elsewhere, because the element they belong to is not the thing that lasts. */
type SeamExempt = (element: Record<string, string | number>, key: string) => boolean;

const scenes: {id: string; sample: (input: unknown, frame: number, length: number) => Scene; seamExempt?: SeamExempt}[] = [
  {
    id: 'GradientLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getGradientScene(gradientLoopSchema.parse(input), frame, length),
  },
  {
    id: 'ParticleLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getParticleScene(particleLoopSchema.parse(input), frame, length),
  },
  {
    id: 'GeometricLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getGeometricScene(geometricLoopSchema.parse(input), frame, length),
  },
  {
    id: 'HalloweenLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getHalloweenScene(halloweenLoopSchema.parse(input), frame, length),
  },
  {
    id: 'CobwebLoop',
    // The web geometry is frame-invariant and checked in tests/cobweb.test.ts; the shared
    // scans stay on scalars, so every field of every composition remains covered.
    sample: (input: unknown, frame: number, length: number): Scene =>
      getCobwebScene(cobwebLoopSchema.parse(input), frame, length).map(({geometry, ...element}) => ({
        ...element,
        sheen: geometry?.sheen ?? 0,
        nodeCount: geometry?.nodes.length ?? 0,
      })),
  },
  {
    id: 'SunburstLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getSunburstScene(sunburstLoopSchema.parse(input), frame, length),
    // The fan turns: at the seam a ray takes over the place, and the shape, of its neighbour.
    // The picture is continuous, the ray is not; tests/sunburst.test.ts checks the rotation
    // and the field that gives every place its shape. The layers that stay put keep the scan.
    seamExempt: (element, key) => element.kind === 'ray' && ['angle', 'halfWidth', 'opacity'].includes(key),
  },
  {
    id: 'KawaiiLoop',
    sample: (input: unknown, frame: number, length: number): Scene =>
      getKawaiiScene(kawaiiLoopSchema.parse(input), frame, length),
  },
];

for (const {id, sample, seamExempt} of scenes) {
  test(`${id}: seed and frame determine the scene independently of render order`, () => {
    const first = sample({seed: 42}, 137, 480);
    sample({seed: -7}, 350, 480);
    assert.deepEqual(sample({seed: 42}, 137, 480), first);
    assert.notDeepEqual(sample({seed: 43}, 137, 480), first);
    assert.notDeepEqual(sample({seed: 42}, 180, 480), first);
  });

  test(`${id}: complete cycles repeat exactly across durations, cadences, and seeds`, () => {
    for (const durationSeconds of [3.7, 8, 12.25]) {
      for (const outputFormat of ['mp4', 'webm', 'gif'] as const) {
        const {durationInFrames: length} = getCompositionMetadata({durationSeconds, outputFormat});
        for (const seed of [-7, 1, 2026]) {
          const props = {durationSeconds, outputFormat, seed};
          assert.deepEqual(sample(props, 0, length), sample(props, length, length));
          assert.deepEqual(sample(props, 17, length), sample(props, length + 17, length));
          assert.deepEqual(sample(props, length - 1, length), sample(props, -1, length));
          assert.notDeepEqual(sample(props, 0, length), sample(props, length - 1, length), 'Do not duplicate the first frame at the end');
        }
      }
    }
  });

  test(`${id}: position, size, opacity, and rotation have continuous seam velocity`, () => {
    const normalizedStep = 1e-6;
    for (const length of [185, 480, 735]) {
      for (const seed of [-7, 1, 2026]) {
        const beginning = sample({seed}, 0, length);
        const before = sample({seed}, length * (1 - normalizedStep), length);
        const after = sample({seed}, length * normalizedStep, length);
        assert.equal(before.length, beginning.length);
        assert.equal(after.length, beginning.length);

        for (let i = 0; i < beginning.length; i++) {
          for (const [key, value] of Object.entries(beginning[i]!)) {
            if (typeof value !== 'number' || seamExempt?.(beginning[i]!, key)) continue;
            const previous = before[i]![key];
            const next = after[i]![key];
            assert.equal(typeof previous, 'number');
            assert.equal(typeof next, 'number');
            const leftVelocity = (value - (previous as number)) / normalizedStep;
            const rightVelocity = ((next as number) - value) / normalizedStep;
            const tolerance = 0.1 + Math.max(Math.abs(leftVelocity), Math.abs(rightVelocity)) * 0.001;
            assert.ok(Number.isFinite(leftVelocity) && Number.isFinite(rightVelocity), `${id} ${i}.${key}: finite motion`);
            assert.ok(Math.abs(leftVelocity - rightVelocity) < tolerance, `${id} seed ${seed} ${i}.${key}: seam velocity ${leftVelocity} vs ${rightVelocity}`);
          }
        }
      }
    }
  });

  test(`${id}: elements keep valid dimensions and opacity throughout the cycle`, () => {
    for (const frame of [0, 1, 60, 120, 240, 359, 479]) {
      for (const element of sample({}, frame, 480)) {
        for (const value of Object.values(element)) {
          if (typeof value === 'number') assert.ok(Number.isFinite(value));
        }
        assert.ok(typeof element.opacity === 'number' && element.opacity >= 0 && element.opacity <= 1);
        for (const key of ['radius', 'radiusX', 'radiusY']) {
          if (key in element) assert.ok(typeof element[key] === 'number' && element[key] > 0);
        }
      }
    }
  });
}

test('composition schemas reject invalid custom controls and accept documented boundaries', () => {
  for (const input of [{scale: 0}, {scale: 3.01}, {intensity: -0.1}, {intensity: 2.01}]) {
    assert.equal(gradientLoopSchema.safeParse(input).success, false);
  }
  for (const input of [{count: 0}, {count: 601}, {count: 2.5}, {size: 0}, {size: 25}, {distribution: 'random'}]) {
    assert.equal(particleLoopSchema.safeParse(input).success, false);
  }
  for (const input of [{count: 0}, {count: 101}, {count: 2.5}, {scale: 0.1}, {scale: 3.01}]) {
    assert.equal(geometricLoopSchema.safeParse(input).success, false);
  }
  for (const input of [
    {webCount: -1}, {webCount: 5}, {webCount: 1.5}, {webCount: '4'},
    {strandCount: -1}, {strandCount: 25}, {strandCount: 1.5},
    {moteCount: -1}, {moteCount: 121}, {moteCount: 2.5},
    {spiderCount: -1}, {spiderCount: 4}, {spiderCount: 1.5},
    {dewIntensity: -0.01}, {dewIntensity: 1.01}, {dewIntensity: Number.POSITIVE_INFINITY},
    {mistIntensity: -0.01}, {mistIntensity: 1.01}, {mistIntensity: Number.NaN},
  ]) {
    assert.equal(cobwebLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {rayCount: 5}, {rayCount: 49}, {rayCount: 12.5}, {rayCount: '20'},
    {rayWidth: 0.14}, {rayWidth: 0.81}, {rayWidth: Number.NaN},
    {swirl: -0.01}, {swirl: 1.01}, {spin: 2.5}, {spin: 25}, {spin: -25}, {spin: '3'},
    {coreFade: -0.01}, {coreFade: 1.01}, {coreShade: -0.01}, {coreShade: Number.POSITIVE_INFINITY},
  ]) {
    assert.equal(sunburstLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  assert.equal(gradientLoopSchema.safeParse({scale: 0.25, intensity: 2}).success, true);
  assert.equal(particleLoopSchema.safeParse({count: 600, size: 24, distribution: 'center'}).success, true);
  assert.equal(geometricLoopSchema.safeParse({count: 100, scale: 0.15}).success, true);
  for (const input of [
    {webCount: 0, strandCount: 0, moteCount: 0, spiderCount: 0, dewIntensity: 0, mistIntensity: 0},
    {webCount: 4, strandCount: 24, moteCount: 120, spiderCount: 3, dewIntensity: 1, mistIntensity: 1},
  ]) {
    assert.equal(cobwebLoopSchema.safeParse(input).success, true);
  }
  for (const input of [
    {rayCount: 6, rayWidth: 0.15, swirl: 0, spin: -24, coreFade: 0, coreShade: 0},
    {rayCount: 48, rayWidth: 0.8, swirl: 1, spin: 24, coreFade: 1, coreShade: 1},
  ]) {
    assert.equal(sunburstLoopSchema.safeParse(input).success, true);
  }
});

test('particle controls keep their element count and visible opacity for the entire cycle', () => {
  for (const distribution of ['uniform', 'center'] as const) {
    const props = particleLoopSchema.parse({count: 600, size: 24, distribution});
    for (const frame of [0, 120, 240, 479]) {
      const particles = getParticleScene(props, frame, 480);
      assert.equal(particles.length, 600);
      assert.ok(particles.every(({opacity, radius}) => opacity > 0 && opacity <= 1 && radius > 0));
    }
  }
});

test('catalog defaults and shipped presets pass the same schemas used by Studio and export', () => {
  const presets = [
    ['GradientLoop', 'gradient-aurora.json'],
    ['ParticleLoop', 'particles-alpha.json'],
    ['GeometricLoop', 'geometric-orbit.json'],
    ['HalloweenLoop', 'halloween-midnight.json'],
    ['KawaiiLoop', 'kawaii-constelacao.json'],
    ['CobwebLoop', 'halloween-cobweb.json'],
    ['SunburstLoop', 'sunburst-crimson.json'],
    ['SunburstLoop', 'sunburst-sand.json'],
    ['SunburstLoop', 'sunburst-ocean.json'],
    ['SunburstLoop', 'sunburst-moss.json'],
  ];
  for (const entry of Object.values(backgroundCatalog)) {
    assert.deepEqual(entry.schema.parse(entry.defaultProps), entry.defaultProps);
    assert.equal(getBackground(entry.id), entry);
  }
  for (const [id, filename] of presets) {
    const props: unknown = JSON.parse(readFileSync(new URL(`../presets/${filename}`, import.meta.url), 'utf8'));
    assert.equal(getBackground(id!).schema.strict().safeParse(props).success, true, filename);
  }
  assert.throws(() => getBackground('UnknownLoop'), /Background desconhecido/);
  assert.throws(() => getBackground('__proto__'), /Background desconhecido/);
});

test('loop helper rejects invalid frame counts instead of propagating NaN', () => {
  for (const length of [0, -1, 1.5, Number.POSITIVE_INFINITY]) {
    assert.throws(() => loopPhase(0, length));
  }
  assert.throws(() => loopPhase(Number.NaN, 480));
  assert.throws(() => loopPhase(Number.POSITIVE_INFINITY, 480));
});
