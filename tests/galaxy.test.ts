import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {test} from 'node:test';
import {isValidElement} from 'react';
import {
  GALAXY_TWINKLE_SECONDS, getGalaxyChurnTurns, getGalaxyCores, getGalaxyFragmentShader, getGalaxyGasLives, getGalaxyScene,
  getGalaxyTwinkleTurns, getGalaxyUniforms, galaxyLoopSchema,
} from '../src/backgrounds/GalaxyLoop';
import {CONTENT_BOX} from '../src/backgrounds/vaporwave/frame';
import {GLSL_MAIN, GLSL_PRELUDE} from '../src/backgrounds/webgl/glsl';
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

const uniformsAt = (input: object, frame: number, length: number) => {
  const props = galaxyLoopSchema.parse(input);
  return getGalaxyUniforms(props, getGalaxyScene(props, frame, length), 1920, 1080);
};

test('Galaxy: Studio, catalog and the cosmic preset share the sixteen-second full HD print', () => {
  const defaults = galaxyLoopSchema.parse({});
  assert.deepEqual(defaults, {
    durationSeconds: 16, seed: 1, transparent: false, backgroundColor: '#07051C',
    colors: ['#29D3FF', '#3767FF', '#7E3BFF', '#FF4FA8'], outputFormat: 'webm',
    speed: 1, clouds: 0.8, stars: 0.8, twinkle: 0.5, centerCalm: 0.25,
  });
  const metadata = getCompositionMetadata(defaults);
  assert.deepEqual(metadata, {width: 1920, height: 1080, fps: 60, durationInFrames: 960});
  assert.deepEqual(backgroundCatalog.GalaxyLoop.defaultProps, defaults);
  assert.equal(getOpenGlRenderer(backgroundCatalog.GalaxyLoop), 'angle');
  const preset: unknown = JSON.parse(readFileSync(new URL('../presets/galaxy-cosmic.json', import.meta.url), 'utf8'));
  assert.deepEqual(galaxyLoopSchema.strict().parse(preset), {...defaults, outputFormat: 'mp4'});

  type CompositionProps = typeof metadata & {id: string; defaultProps: typeof defaults; schema: typeof galaxyLoopSchema};
  const composition = findComposition<CompositionProps>(RemotionRoot(), 'GalaxyLoop');
  assert.ok(isValidElement<CompositionProps>(composition), 'the composition must be registered in Studio');
  assert.equal(composition.props.schema, galaxyLoopSchema);
  assert.deepEqual(composition.props.defaultProps, defaults);
});

test('Galaxy: controls accept their boundaries and reject invalid values', () => {
  const ranges: Record<string, [number, number]> = {speed: [0, 3], clouds: [0, 1], stars: [0, 1], twinkle: [0, 1], centerCalm: [0, 1]};
  for (const [key, [min, max]] of Object.entries(ranges)) {
    for (const value of [min - 0.01, max + 0.01, Number.NaN, Number.POSITIVE_INFINITY, String(min)]) {
      assert.equal(galaxyLoopSchema.safeParse({[key]: value}).success, false, `${key}: ${value}`);
    }
    for (const value of [min, max]) assert.equal(galaxyLoopSchema.safeParse({[key]: value}).success, true, `${key}: ${value}`);
  }
  assert.equal(galaxyLoopSchema.safeParse({colors: ['#FFFFFF']}).success, false);
  assert.equal(galaxyLoopSchema.safeParse({
    colors: ['#000000', 'rgba(255, 255, 255, 0.35)', '#123', 'hsl(200, 50%, 50%)', 'red', '#ABCDEF'],
  }).success, true);
  // The spiral's controls are gone: a preset that still carries one fails instead of being ignored.
  for (const key of ['tilt', 'angle', 'galaxyX', 'galaxyY', 'galaxySize', 'bar']) {
    assert.equal(galaxyLoopSchema.strict().safeParse({[key]: 0.5}).success, false, key);
  }
});

test('Galaxy: every galaxy-*.json preset spells out every control', () => {
  const directory = new URL('../presets/', import.meta.url);
  const names = readdirSync(directory).filter((file) => /^galaxy-.*\.json$/.test(file));
  assert.ok(names.includes('galaxy-cosmic.json'));
  for (const name of names) {
    const raw = JSON.parse(readFileSync(new URL(name, directory), 'utf8')) as Record<string, unknown>;
    const props = galaxyLoopSchema.strict().parse(raw);
    assert.deepEqual(Object.keys(raw).sort(), Object.keys(props).sort(), `${name}: every key`);
  }
});

test('Galaxy: the shader declares exactly the uniforms the scene delivers', () => {
  const source = getGalaxyFragmentShader();
  assert.ok(source.startsWith('#version 300 es\n'), 'GLSL ES 3.00 must start on the first line');
  assert.equal(source.match(/\bvec4\s+experiment\s*\(\s*vec2\s+\w+\s*\)/g)?.length, 1, 'one experiment(vec2)');
  const declared = declaredUniforms(source);
  for (const input of [{}, {colors: ['#000000', '#FFFFFF']}, {speed: 0}, {speed: 3, clouds: 1, stars: 1, twinkle: 1, centerCalm: 1, seed: -99}]) {
    for (const frame of [0, 137, 959]) {
      const uniforms = uniformsAt(input, frame, 960);
      assert.deepEqual([...Object.keys(uniforms)].sort(), [...declared.keys()].sort(), 'declared and delivered uniforms');
      for (const [name, value] of Object.entries(uniforms)) {
        const values = typeof value === 'number' ? [value] : [...value];
        assert.equal(values.length, declared.get(name), `${name}: number of values`);
        assert.ok(values.every(Number.isFinite), `${name}: finite values`);
      }
    }
  }
});

test('Galaxy: time reaches the shader only through the scene, and the GLSL stays portable', () => {
  const source = getGalaxyFragmentShader();
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
    assert.ok(![
      'half', 'patch', 'sample', 'input', 'output', 'filter', 'common', 'partition', 'active', 'round', 'fixed', 'long',
      'short', 'double', 'flat', 'smooth', 'cross', 'distance', 'length', 'step', 'sign', 'texture',
    ].includes(match[1]!), `"${match[1]}" is reserved or built in`);
  }
  for (const file of ['../src/backgrounds/GalaxyLoop.tsx', '../src/backgrounds/galaxy/shader.ts']) {
    const module = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const forbidden of [/Math\.random/, /Date\.now/, /new Date/, /performance\.now/, /requestAnimationFrame/]) {
      assert.doesNotMatch(module, forbidden, `${file}: ${forbidden}`);
    }
  }
});

test('Galaxy: speed 0 holds the picture still and every speed closes the cycle', () => {
  const still = galaxyLoopSchema.parse({speed: 0});
  assert.deepEqual(getGalaxyScene(still, 0, 480), getGalaxyScene(still, 239, 480));
  assert.deepEqual(uniformsAt({speed: 0}, 239, 480).uTwinkle, [1, 0]);
  // A life with no motion in it: every part of the gas holds its place.
  assert.equal((uniformsAt({speed: 0}, 239, 480).uGasClock as number[])[2], 0, 'the gas holds its place');
  for (const speed of [0.05, 0.5, 1, 2.5, 3]) {
    for (const durationSeconds of [3.7, 16, 60]) {
      const props = galaxyLoopSchema.parse({speed, durationSeconds});
      const {durationInFrames: length} = getCompositionMetadata(props);
      assert.deepEqual(getGalaxyScene(props, length, length), getGalaxyScene(props, 0, length));
      assert.notDeepEqual(getGalaxyScene(props, 1, length), getGalaxyScene(props, 0, length), `speed ${speed} moves`);
    }
  }
});

test('Galaxy: the stars twinkle whole turns per cycle, the nearest to one every 7 seconds', () => {
  assert.equal(GALAXY_TWINKLE_SECONDS, 7);
  for (const [speed, durationSeconds, turns] of [
    [1, 16, 2], [1, 7, 1], [1, 10.4, 1], [1, 10.6, 2], [1, 60, 9], [0.5, 32, 2], [3, 16, 7], [0.05, 3.7, 1], [0, 16, 0],
  ] as const) {
    assert.equal(getGalaxyTwinkleTurns({speed, durationSeconds}), turns, `speed ${speed}, ${durationSeconds} s`);
    const props = galaxyLoopSchema.parse({speed, durationSeconds});
    const {durationInFrames: length} = getCompositionMetadata(props);
    for (const frame of [0, Math.round(length / 3), length - 1]) {
      const angle = (turns * 2 * Math.PI * frame) / length;
      const twinkle = uniformsAt({speed, durationSeconds}, frame, length).uTwinkle as number[];
      assert.equal(twinkle.length, 2);
      assert.ok(Math.abs(twinkle[0]! - Math.cos(angle)) < 1e-12 && Math.abs(twinkle[1]! - Math.sin(angle)) < 1e-12, `frame ${frame} of ${length}: ${twinkle}`);
    }
  }
});

/** The depth each star layer's twinkle takes from the twinkle control, read from the shader's calls. */
const twinkleDepths = (source: string) =>
  [...source.matchAll(/starLayer\(px,[^;]*?,\s*([\d.]+)\s*\*\s*twinkleDepth\s*,/g)].map((match) => Number(match[1]));

test('Galaxy: at the default twinkle every star layer swells and fades by at least a quarter of its light', () => {
  // The first print's layers twinkled by 0.075 to 0.225 of their light at twinkle 0.5, and the
  // shipped video showed none: the highlight roll-off swallows a small swing (2026-10-15).
  const depths = twinkleDepths(getGalaxyFragmentShader());
  assert.equal(depths.length, 4, 'four star layers');
  const twinkle = galaxyLoopSchema.parse({}).twinkle;
  for (const depth of depths) {
    assert.ok(depth * twinkle >= 0.25, `a layer twinkles by ${depth * twinkle} at the default`);
    // At full twinkle a star may fade out at its dimmest, never below nothing.
    assert.ok(depth <= 1, `depth ${depth} would turn the light negative at full twinkle`);
  }
});

test('Galaxy: the gas lives whole lives per cycle and ages one second of motion per second at speed 1', () => {
  for (const [speed, durationSeconds, lives] of [
    [1, 16, 2], [1, 14.9, 1], [1, 15.1, 2], [1, 60, 6], [3, 16, 5], [0.5, 32, 2], [2, 3.7, 1], [0.05, 3.7, 1], [0, 16, 0],
  ] as const) {
    assert.equal(getGalaxyGasLives({speed, durationSeconds}), lives, `speed ${speed}, ${durationSeconds} s`);
    if (lives === 0) continue;
    const props = galaxyLoopSchema.parse({speed, durationSeconds});
    const {durationInFrames: length, fps} = getCompositionMetadata(props);
    const [clock, wrap, lifeSeconds] = uniformsAt(props, 0, length).uGasClock as number[];
    // A quarter of a life past a turn of the parts at the seam, so neither part begins on it.
    assert.ok(Math.abs(clock! - 0.25) < 1e-12, `speed ${speed}, ${durationSeconds} s: clock ${clock} at the seam`);
    assert.equal(wrap, lives);
    // Each life holds the same share of the cycle's motion.
    assert.ok(Math.abs(lifeSeconds! * lives - speed * durationSeconds) < 1e-9, `${lifeSeconds} s per life`);
    for (const frame of [0, Math.round(length / 3), length - 2, length - 1]) {
      const [now] = uniformsAt(props, frame, length).uGasClock as number[];
      const [next] = uniformsAt(props, frame + 1, length).uGasClock as number[];
      // The clock only runs forwards (wrapping after the last life), so the gas never swings
      // back, and every part ages as many seconds of motion per second as the speed.
      const step = (((next! - now!) % lives) + lives) % lives;
      assert.ok(Math.abs(step * lifeSeconds! * fps - speed) < 1e-9, `speed ${speed}, ${durationSeconds} s, frame ${frame}: ${step * lifeSeconds! * fps}`);
    }
  }
});

test('Galaxy: the gas drifts about 5 px/s at any speed and duration, in a direction from the seed', () => {
  const headings = new Set<number>();
  for (const [speed, durationSeconds] of [[1, 16], [3, 9], [0.5, 60]] as const) {
    for (const seed of [1, 2, -7]) {
      const [x, y] = uniformsAt({speed, durationSeconds, seed}, 0, 960).uCurrent as number[];
      // Cloud lattice units (600 px) per second of motion: the speed reaches the gas through its age.
      const pace = Math.hypot(x!, y!) * 600;
      assert.ok(pace >= 4 && pace <= 6, `speed ${speed}, ${durationSeconds} s, seed ${seed}: ${pace} px/s`);
      headings.add(Math.round(Math.atan2(y!, x!) * 1000));
    }
  }
  assert.equal(headings.size, 3, 'each seed its own direction, the same at every speed');
});

test('Galaxy: each seed keeps the big billows and the hue shift of the approved print', () => {
  // The first print's drift, billow and warp circles at its first frame and its hue shift, as
  // HEAD (9c0c73d) drew them: the big billows stay there, so the composition approved on
  // 2026-10-14 holds while the finer gas flows.
  for (const [input, expected] of [
    [{seed: 1}, [0.05051647721401595, 0.006473625810135707, 0.02079501387179175, -0.07350964274073603, 0.055904418787356844, -0.0036360616816657953, 0.11104815652593969]],
    [{seed: 2}, [-0.01919235137192564, -0.047174950451064505, -0.022770793163040856, 0.07292181536772564, 0.00893370623007107, 0.05530564055772109, 0.05380629172548651]],
    [{seed: -7, speed: 3, durationSeconds: 9}, [0.01909883682133228, 0.08379468192909707, 0.05403695952761098, -0.11704364208254023, 0.08382930876081232, -0.04370454530814118, 0.1082671350426972]],
  ] as const) {
    for (const frame of [0, 300]) {
      const uniforms = uniformsAt(input, frame, 960);
      const [homeX, homeY, billowX, billowZ] = uniforms.uGasHome as number[];
      const [warpY, warpZ, , hueShift] = uniforms.uGasLook as number[];
      assert.deepEqual([homeX, homeY, billowX, billowZ, warpY, warpZ, hueShift], expected, `${JSON.stringify(input)}, frame ${frame}`);
    }
  }
});

test('Galaxy: the big billows breathe whole breaths per cycle, the nearest to one every 16 seconds', () => {
  for (const [speed, durationSeconds, turns] of [[1, 16, 1], [1, 7.9, 0], [1, 24.1, 2], [3, 16, 3], [1, 60, 4], [0.05, 3.7, 1], [0, 16, 0]] as const) {
    const expected = turns === 0 && speed > 0 ? 1 : turns;
    assert.equal(getGalaxyChurnTurns({speed, durationSeconds}), expected, `speed ${speed}, ${durationSeconds} s`);
    const props = galaxyLoopSchema.parse({speed, durationSeconds});
    const {durationInFrames: length} = getCompositionMetadata(props);
    for (const frame of [0, Math.round(length / 3), length - 1]) {
      const angle = (expected * 2 * Math.PI * frame) / length;
      const [cos, sin] = uniformsAt(props, frame, length).uChurn as number[];
      assert.ok(Math.abs(cos! - Math.cos(angle)) < 1e-12 && Math.abs(sin! - Math.sin(angle)) < 1e-12, `frame ${frame} of ${length}: ${cos}, ${sin}`);
    }
  }
});

test('Galaxy: the two parts of the gas mix by weights normalised by the root of their squares', () => {
  // A plain cross-fade of two independent noises keeps 1/√2 of their contrast halfway through.
  assert.match(getGalaxyFragmentShader(), /(\w+)\s*\*=\s*inversesqrt\(\s*dot\(\s*\1\s*,\s*\1\s*\)\s*\)/);
});

test('Galaxy: the light cores sit round the content area, inside the frame, on a diagonal', () => {
  const outside = ([x, y]: number[]) =>
    x! < CONTENT_BOX.left || x! > CONTENT_BOX.right || y! < CONTENT_BOX.top || y! > CONTENT_BOX.bottom;
  const diagonals = new Set<boolean>();
  for (let seed = -25; seed < 25; seed++) {
    const cores = getGalaxyCores(seed, 1920, 1080);
    assert.deepEqual(getGalaxyCores(seed, 1920, 1080), cores, `seed ${seed}: the same seed, the same cores`);
    assert.deepEqual(uniformsAt({seed}, 0, 960).uCores, cores.flat());
    for (const [x, y, reach, brightness] of cores) {
      assert.ok(x! > 0 && x! < 1920 && y! > 0 && y! < 1080, `seed ${seed}: (${x}, ${y}) in the frame`);
      assert.ok(outside([x!, y!]), `seed ${seed}: (${x}, ${y}) clear of the content area`);
      assert.ok(reach! > 0 && brightness! > 0 && brightness! <= 1, `seed ${seed}: reach ${reach}, brightness ${brightness}`);
    }
    const [left, right, small] = cores as [number[], number[], number[]];
    assert.ok(left[0]! < CONTENT_BOX.left && right[0]! > CONTENT_BOX.right, `seed ${seed}: one each side`);
    assert.notEqual(left[1]! < 540, right[1]! < 540, `seed ${seed}: the two large cores in opposite halves`);
    assert.ok(small[1]! < CONTENT_BOX.top || small[1]! > CONTENT_BOX.bottom, `seed ${seed}: the small core above or below`);
    assert.ok(small[2]! < Math.min(left[2]!, right[2]!), `seed ${seed}: the small core is the smallest`);
    diagonals.add(left[1]! < 540);
  }
  assert.equal(diagonals.size, 2, 'the seed picks either diagonal');
  assert.notDeepEqual(getGalaxyCores(1, 1920, 1080), getGalaxyCores(2, 1920, 1080));
});

test('Galaxy: the looks reach the shader as the controls say', () => {
  assert.deepEqual(uniformsAt({clouds: 0.1, stars: 0.2, twinkle: 0.3, centerCalm: 0.4}, 0, 960).uLook, [0.1, 0.2, 0.3, 0.4]);
});
