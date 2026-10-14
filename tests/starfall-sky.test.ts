import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {isValidElement} from 'react';
import {
  getStarfallSkyScene, getStarfallSkyUniforms, starfallSkyLoopSchema,
} from '../src/backgrounds/StarfallSkyLoop';
import {layoutBillows, MAX_BILLOWS, MAX_METEORS} from '../src/backgrounds/starfall-sky/scene';
import {STARFALL_SKY_FRAGMENT_SHADER} from '../src/backgrounds/starfall-sky/shader';
import {GLSL_MAIN, GLSL_PRELUDE} from '../src/backgrounds/webgl/glsl';
import {parseColor, srgbToLinear} from '../src/backgrounds/webgl/scene';
import {backgroundCatalog, getOpenGlRenderer} from '../src/catalog';
import {RemotionRoot} from '../src/Root';
import {getCompositionMetadata} from '../src/settings';
import {findComposition} from './helpers/find-composition';

const COMPONENTS: Record<string, number> = {float: 1, vec2: 2, vec3: 3, vec4: 4, int: 1, uint: 1};

/** Every uniform the source declares, with the number of values it holds. */
const declaredUniforms = (source: string) => {
  const uniforms = new Map<string, number>();
  for (const match of source.matchAll(/^\s*uniform\s+(\w+)\s+(\w+)\s*(?:\[\s*(\d+)\s*\])?\s*;/gm)) {
    const components = COMPONENTS[match[1]!];
    assert.ok(components, `unsupported uniform type: ${match[1]}`);
    assert.ok(!uniforms.has(match[2]!), `uniform declared twice: ${match[2]}`);
    uniforms.set(match[2]!, components * Number(match[3] ?? 1));
  }
  return uniforms;
};

const props = (input: object = {}) => starfallSkyLoopSchema.parse(input);
const meteorsOf = (input: object, frame: number, length: number) =>
  getStarfallSkyScene(props(input), frame, length).filter((element) => element.kind === 'meteor');

test('Starfall sky: Studio, catalog and preset share the sixteen-second full HD sky', () => {
  const defaults = props();
  assert.deepEqual(defaults, {
    durationSeconds: 16, seed: 5, transparent: false, backgroundColor: '#1A1B48',
    colors: ['#7CCBFF', '#C38BFF', '#FFD36E'], outputFormat: 'webm',
    skyColor: '#38549D', horizonColor: '#6A9CEB', cloudColor: '#F2F8FF', cloudShadeColor: '#B3C8F6', seaColor: '#3B6BCF',
    meteorCount: 3, meteorSize: 1, stars: 0.6, cloudBanks: 1, seaCover: 0.5, horizon: 0.8, speed: 1,
  });
  const metadata = getCompositionMetadata(defaults);
  assert.deepEqual(metadata, {width: 1920, height: 1080, fps: 60, durationInFrames: 960});
  assert.deepEqual(backgroundCatalog.StarfallSkyLoop.defaultProps, defaults);
  assert.equal(getOpenGlRenderer(backgroundCatalog.StarfallSkyLoop), 'angle');
  const raw = JSON.parse(readFileSync(new URL('../presets/starfall-sky.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  // A preset spells out every control, so saved Studio defaults never change what it shows.
  assert.deepEqual(Object.keys(raw).sort(), Object.keys(defaults).sort());
  assert.deepEqual(starfallSkyLoopSchema.strict().parse(raw), {...defaults, outputFormat: 'mp4'});

  type CompositionProps = typeof metadata & {id: string; defaultProps: typeof defaults; schema: typeof starfallSkyLoopSchema};
  const composition = findComposition<CompositionProps>(RemotionRoot(), 'StarfallSkyLoop');
  assert.ok(isValidElement<CompositionProps>(composition), 'the composition must be registered in Studio');
  assert.equal(composition.props.schema, starfallSkyLoopSchema);
  assert.deepEqual(composition.props.defaultProps, defaults);
});

test('Starfall sky: controls accept their boundaries and reject invalid values', () => {
  for (const input of [
    {meteorCount: -1}, {meteorCount: 7}, {meteorCount: 1.5}, {meteorCount: '3'},
    {meteorSize: 0.49}, {meteorSize: 2.01}, {stars: -0.01}, {stars: 1.01}, {cloudBanks: -0.01}, {cloudBanks: 1.01},
    {seaCover: -0.01}, {seaCover: 1.01}, {horizon: 0.61}, {horizon: 0.91}, {horizon: Number.NaN},
    {speed: -0.01}, {speed: 3.01}, {speed: Number.POSITIVE_INFINITY}, {colors: ['#FFFFFF']}, {skyColor: 12},
  ]) {
    assert.equal(starfallSkyLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {meteorCount: 0, meteorSize: 0.5, stars: 0, cloudBanks: 0, seaCover: 0, horizon: 0.62, speed: 0},
    {meteorCount: 6, meteorSize: 2, stars: 1, cloudBanks: 1, seaCover: 1, horizon: 0.9, speed: 3},
    {colors: ['#000000', 'rgba(255, 255, 255, 0.35)', '#123', 'hsl(200, 50%, 50%)', 'red', '#ABCDEF']},
  ]) {
    assert.equal(starfallSkyLoopSchema.safeParse(input).success, true, JSON.stringify(input));
  }
});

test('Starfall sky: the shader declares exactly the uniforms the scene delivers', () => {
  const source = STARFALL_SKY_FRAGMENT_SHADER;
  assert.ok(source.startsWith('#version 300 es\n'), 'GLSL ES 3.00 must start on the first line');
  assert.equal(source.match(/\bvec4\s+experiment\s*\(\s*vec2\s+\w+\s*\)/g)?.length, 1, 'one experiment(vec2)');
  const declared = declaredUniforms(source);
  assert.equal(declared.get('uBillows'), 4 * MAX_BILLOWS, 'the billow array holds MAX_BILLOWS discs');
  assert.equal(declared.get('uMeteorWidth'), MAX_METEORS, 'the meteor arrays hold MAX_METEORS stars');
  for (const input of [
    {}, {colors: ['#000000', '#FFFFFF']}, {speed: 0, meteorCount: 0, cloudBanks: 0},
    {meteorCount: 6, meteorSize: 2, horizon: 0.62, transparent: true, seed: -99},
  ]) {
    const sky = props(input);
    for (const frame of [0, 137, 455, 959]) {
      const uniforms = getStarfallSkyUniforms(sky, getStarfallSkyScene(sky, frame, 960), 1920, 1080);
      assert.deepEqual([...Object.keys(uniforms)].sort(), [...declared.keys()].sort(), 'declared and delivered uniforms');
      for (const [name, value] of Object.entries(uniforms)) {
        const values = typeof value === 'number' ? [value] : [...value];
        assert.equal(values.length, declared.get(name), `${name}: number of values`);
        assert.ok(values.every(Number.isFinite), `${name}: finite values`);
      }
    }
  }
});

test('Starfall sky: time reaches the shader only through the scene, and the GLSL stays portable', () => {
  const source = STARFALL_SKY_FRAGMENT_SHADER;
  const own = source.slice(GLSL_PRELUDE.length, source.length - GLSL_MAIN.length);
  for (const forbidden of [/43758/, /sin\s*\(\s*dot\s*\(/, /\bfract\s*\(\s*sin\b/, /\biTime\b/, /\buniform\s+\w+\s+\w*time\w*/i]) {
    assert.doesNotMatch(own, forbidden, `${forbidden}`);
  }
  // smoothstep with edge0 >= edge1 is undefined in GLSL ES 3.00: write 1.0 - smoothstep(b, a, x).
  for (const match of own.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) {
    assert.ok(Number(match[1]) < Number(match[2]), `${match[0]} has its edges reversed`);
  }
  // Names GLSL ES 3.00 reserves, or gives to a built-in, fail to compile with an empty log under ANGLE.
  for (const match of own.matchAll(/\b(?:float|int|uint|bool|vec[234]|mat[234])\s+(\w+)\s*[=;,[(]/g)) {
    assert.ok(!['half', 'patch', 'sample', 'input', 'output', 'filter', 'common', 'partition', 'active', 'round', 'fixed', 'long', 'short', 'double'].includes(match[1]!),
      `"${match[1]}" is reserved or built in`);
  }
  for (const file of ['../src/backgrounds/StarfallSkyLoop.tsx', '../src/backgrounds/starfall-sky/scene.ts']) {
    const module = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const forbidden of [/Math\.random/, /Date\.now/, /new Date/, /performance\.now/, /requestAnimationFrame/]) {
      assert.doesNotMatch(module, forbidden, `${file}: ${forbidden}`);
    }
  }
});

test('Starfall sky: speed 0 holds the clouds and the stars still, and every speed closes the cycle', () => {
  const still = props({speed: 0, meteorCount: 0});
  assert.deepEqual(getStarfallSkyScene(still, 0, 480), getStarfallSkyScene(still, 239, 480));
  // At speed 0 the shooting stars keep flying: only they change.
  const flying = props({speed: 0});
  const calm = (frame: number) => getStarfallSkyScene(flying, frame, 960).filter((element) => element.kind !== 'meteor');
  assert.deepEqual(calm(0), calm(400));
  assert.notDeepEqual(meteorsOf({speed: 0}, 0, 960), meteorsOf({speed: 0}, 150, 960));
  for (const speed of [0.05, 0.5, 1, 2.5, 3]) {
    for (const durationSeconds of [3.7, 16, 60]) {
      const sky = props({speed, durationSeconds});
      const {durationInFrames: length} = getCompositionMetadata(sky);
      assert.deepEqual(getStarfallSkyScene(sky, length, length), getStarfallSkyScene(sky, 0, length));
      assert.notDeepEqual(getStarfallSkyScene(sky, 1, length), getStarfallSkyScene(sky, 0, length), `speed ${speed} moves`);
    }
  }
});

test('Starfall sky: the banks never hold more billows than the shader, and 0 leaves only the sea', () => {
  let most = 0;
  for (const cloudBanks of [0.01, 0.1, 0.3, 0.5, 0.75, 1]) {
    for (const horizon of [0.62, 0.8, 0.9]) {
      for (let seed = -40; seed < 120; seed++) {
        const billows = layoutBillows({seed, cloudBanks, horizon});
        most = Math.max(most, billows.length);
        assert.ok(billows.length > 0, `cloudBanks ${cloudBanks}: some billows`);
        assert.ok(billows.every((billow) => billow.radius >= 10 && Number.isFinite(billow.x) && Number.isFinite(billow.y)));
        // Both banks, one on each side, and the middle of the frame stays open for the title.
        assert.ok(billows.some((billow) => billow.x > 1100) && billows.some((billow) => billow.x < 820));
        assert.ok(billows.every((billow) => billow.x + billow.radius < 760 || billow.x - billow.radius > 1060),
          `cloudBanks ${cloudBanks}, horizon ${horizon}, seed ${seed}: a billow reaches the middle`);
      }
    }
  }
  assert.ok(most <= MAX_BILLOWS, `${most} billows`);
  assert.deepEqual(layoutBillows({seed: 5, cloudBanks: 0, horizon: 0.8}), []);
  const scene = getStarfallSkyScene(props({cloudBanks: 0}), 100, 960);
  assert.equal(scene.filter((element) => element.kind === 'billow').length, 0);
});

test('Starfall sky: every shooting star crosses once per cycle, inside its own slot, and rests at the seam', () => {
  for (const meteorCount of [1, 3, 6]) {
    for (const durationSeconds of [3.7, 16, 60]) {
      for (const seed of [-7, 5, 2026]) {
        const input = {meteorCount, durationSeconds, seed};
        const length = getCompositionMetadata(props(input)).durationInFrames;
        const frames = Array.from({length}, (_, frame) => meteorsOf(input, frame, length));
        for (const edge of [frames[0]!, frames[length - 1]!]) {
          assert.ok(edge.every((meteor) => meteor.opacity === 0 && meteor.travelled === 0 && meteor.trail === 0 && meteor.burn === 0),
            `${JSON.stringify(input)}: a star moves at the seam`);
        }
        for (let index = 0; index < meteorCount; index++) {
          const shown = frames.flatMap((meteors, frame) => (meteors[index]!.opacity > 0 ? [frame] : []));
          assert.ok(shown.length > 0, `${JSON.stringify(input)}: star ${index} never shows`);
          // One flight: the frames it shows are consecutive, and they stay inside its slot.
          assert.equal(shown.at(-1)! - shown[0]! + 1, shown.length, `${JSON.stringify(input)}: star ${index} shows twice`);
          assert.ok(shown[0]! >= (index * length) / meteorCount && shown.at(-1)! < ((index + 1) * length) / meteorCount);
        }
      }
    }
  }
});

test('Starfall sky: shooting stars take the palette in order and fly different slopes', () => {
  const sky = props({meteorCount: 5, colors: ['#FF0000', '#00FF00', '#0000FF']});
  const scene = getStarfallSkyScene(sky, 0, 960);
  const look = getStarfallSkyUniforms(sky, scene, 1920, 1080).uMeteorLook as number[];
  for (let index = 0; index < 5; index++) {
    const [r, g, b] = parseColor(sky.colors[index % 3]!);
    assert.deepEqual(look.slice(4 * index, 4 * index + 3), [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]);
  }
  for (const seed of [-7, 5, 2026]) {
    for (const meteorCount of [2, 3, 6]) {
      const slopes = meteorsOf({seed, meteorCount}, 0, 960).map((meteor) => Math.atan2(meteor.dirY as number, meteor.dirX as number));
      const sorted = [...slopes].sort((a, b) => a - b);
      // Each star keeps to its own band of the 20° to 46° range, at least 30% of a band from the next.
      const gap = (0.3 * 26 * Math.PI) / 180 / meteorCount;
      for (let i = 1; i < sorted.length; i++) {
        assert.ok(sorted[i]! - sorted[i - 1]! > gap - 1e-9, `seed ${seed}, ${meteorCount} stars: two slopes too close`);
      }
    }
  }
});

test('Starfall sky: only a transparent WebM drops the sky', () => {
  for (const [input, sky] of [
    [{}, 1], [{transparent: true}, 0], [{transparent: true, outputFormat: 'mp4'}, 1], [{transparent: true, outputFormat: 'gif'}, 1],
    [{transparent: true, outputFormat: 'mov'}, 0], [{transparent: true, outputFormat: 'png'}, 0],
  ] as const) {
    const parsed = props(input);
    const layout = getStarfallSkyUniforms(parsed, getStarfallSkyScene(parsed, 0, 960), 1920, 1080).uLayout as number[];
    assert.equal(layout[2], sky, JSON.stringify(input));
  }
});
