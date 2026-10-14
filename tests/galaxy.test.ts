import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {test} from 'node:test';
import {isValidElement} from 'react';
import {
  GALAXY_DISC_RADIUS, GALAXY_SPIN_SECONDS, getGalaxyFragmentShader, getGalaxyHalfTurns, getGalaxyScene, getGalaxyUniforms,
  galaxyLoopSchema,
} from '../src/backgrounds/GalaxyLoop';
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

test('Galaxy: Studio, catalog and the cosmic preset share the sixteen-second full HD galaxy', () => {
  const defaults = galaxyLoopSchema.parse({});
  assert.deepEqual(defaults, {
    durationSeconds: 16, seed: 5, transparent: false, backgroundColor: '#050512',
    colors: ['#FFD7A1', '#7EA6FF', '#FF4D9D', '#7B3FE4', '#22B7E8'], outputFormat: 'webm',
    speed: 1, tilt: 58, angle: -24, galaxyX: 0.64, galaxyY: 0.46, galaxySize: 1, bar: 0,
    clouds: 0.6, stars: 0.7, twinkle: 0.5, centerCalm: 0.25,
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
  const ranges: Record<string, [number, number]> = {
    speed: [0, 3], tilt: [0, 75], angle: [-90, 90], galaxyX: [0, 1], galaxyY: [0, 1], galaxySize: [0.5, 1.5],
    bar: [0, 1], clouds: [0, 1], stars: [0, 1], twinkle: [0, 1], centerCalm: [0, 1],
  };
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
  for (const input of [{}, {colors: ['#000000', '#FFFFFF']}, {speed: 0}, {speed: 3, tilt: 75, bar: 1, clouds: 1, stars: 1, twinkle: 1, centerCalm: 1, seed: -99}]) {
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
  assert.deepEqual(uniformsAt({speed: 0}, 239, 480).uLoop, [1, 0, 0, 0]);
  for (const speed of [0.05, 0.5, 1, 2.5, 3]) {
    for (const durationSeconds of [3.7, 16, 60]) {
      const props = galaxyLoopSchema.parse({speed, durationSeconds});
      const {durationInFrames: length} = getCompositionMetadata(props);
      assert.deepEqual(getGalaxyScene(props, length, length), getGalaxyScene(props, 0, length));
      assert.notDeepEqual(getGalaxyScene(props, 1, length), getGalaxyScene(props, 0, length), `speed ${speed} moves`);
    }
  }
});

test('Galaxy: the disc turns whole half turns per cycle, the nearest to half a turn every 16 seconds', () => {
  assert.equal(GALAXY_SPIN_SECONDS, 16);
  for (const [speed, durationSeconds, halfTurns] of [
    [1, 16, 1], [1, 8, 1], [1, 23.9, 1], [1, 24, 2], [1, 32, 2], [0.5, 32, 1], [3, 16, 3], [2.5, 60, 9], [0.05, 3.7, 1], [0, 16, 0],
  ] as const) {
    assert.equal(getGalaxyHalfTurns({speed, durationSeconds}), halfTurns, `speed ${speed}, ${durationSeconds} s`);
    const props = galaxyLoopSchema.parse({speed, durationSeconds});
    const {durationInFrames: length} = getCompositionMetadata(props);
    // The shader reads the turn from the cycle's angle, which goes once round per cycle.
    for (const frame of [0, Math.round(length / 3), length - 1]) {
      const [cos, sin, k, unused] = uniformsAt({speed, durationSeconds}, frame, length).uLoop as number[];
      const angle = speed > 0 ? (2 * Math.PI * frame) / length : 0;
      assert.ok(Math.abs(cos! - Math.cos(angle)) < 1e-12 && Math.abs(sin! - Math.sin(angle)) < 1e-12, `frame ${frame} of ${length}`);
      assert.deepEqual([k, unused], [halfTurns, 0]);
    }
  }
});

test('Galaxy: the disc sits, leans and turns on screen as the controls say', () => {
  const uniforms = uniformsAt({galaxyX: 0.25, galaxyY: 0.75, galaxySize: 1.5, tilt: 60, angle: 30, bar: 0.4}, 0, 960);
  const [x, y, radius, cosTilt] = uniforms.uDisc as number[];
  assert.deepEqual([x, y, radius], [480, 810, 1.5 * GALAXY_DISC_RADIUS]);
  assert.ok(Math.abs(cosTilt! - 0.5) < 1e-12);
  // Counterclockwise on screen, where y grows downwards: the long axis rises to the right.
  const [axisX, axisY, bar, pitch] = uniforms.uShape as number[];
  assert.ok(Math.abs(axisX! - Math.sqrt(3) / 2) < 1e-12 && Math.abs(axisY! + 0.5) < 1e-12, `${axisX}, ${axisY}`);
  assert.equal(bar, 0.4);
  assert.ok(pitch! > 0.2 && pitch! < 0.4, `tan of the pitch: ${pitch}`);
  assert.deepEqual(uniformsAt({tilt: 0}, 0, 960).uDisc, [0.64 * 1920, 0.46 * 1080, GALAXY_DISC_RADIUS, 1]);
  assert.deepEqual(uniformsAt({clouds: 0.1, stars: 0.2, twinkle: 0.3, centerCalm: 0.4}, 0, 960).uLook, [0.1, 0.2, 0.3, 0.4]);
});
