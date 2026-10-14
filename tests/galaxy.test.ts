import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {test} from 'node:test';
import {isValidElement} from 'react';
import {
  GALAXY_DRIFT_PACE, GALAXY_TWINKLE_SECONDS, getGalaxyCores, getGalaxyFragmentShader, getGalaxyScene, getGalaxyTwinkleTurns,
  getGalaxyUniforms, galaxyLoopSchema,
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
  assert.deepEqual(uniformsAt({speed: 0}, 239, 480).uTwinkle, [1, 0, 1, 0]);
  assert.ok((uniformsAt({speed: 0}, 239, 480).uChurn as number[]).every((value) => value === 0), 'the gas holds its place');
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
      const expected = [Math.cos(angle), Math.sin(angle), Math.cos(2 * angle), Math.sin(2 * angle)];
      assert.ok(twinkle.every((value, index) => Math.abs(value - expected[index]!) < 1e-12), `frame ${frame} of ${length}: ${twinkle}`);
    }
  }
});

test('Galaxy: the gas drifts at the same pace at any duration, in proportion to the speed', () => {
  for (const [speed, durationSeconds] of [[1, 16], [1, 60], [0.5, 16], [3, 9], [2, 3.7]] as const) {
    const props = galaxyLoopSchema.parse({speed, durationSeconds});
    const {durationInFrames: length, fps} = getCompositionMetadata(props);
    for (const frame of [0, Math.round(length / 2)]) {
      const [x0, y0] = uniformsAt(props, frame, length).uChurn as number[];
      const [x1, y1] = uniformsAt(props, frame + 1, length).uChurn as number[];
      // Lattice units per second along the circle: one frame's chord, stretched to its arc.
      const half = Math.PI / length;
      const pace = Math.hypot(x1! - x0!, y1! - y0!) * fps * (half / Math.sin(half));
      assert.ok(Math.abs(pace - speed * GALAXY_DRIFT_PACE) < 1e-9, `speed ${speed}, ${durationSeconds} s: ${pace}`);
    }
  }
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
