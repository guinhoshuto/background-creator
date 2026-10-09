import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {test} from 'node:test';
import {isValidElement} from 'react';
import {
  WATERCOLOR_SCENES, getWatercolorFragmentShader, getWatercolorScene, getWatercolorUniforms, watercolorLoopSchema,
  type WatercolorLoopProps,
} from '../src/backgrounds/WatercolorLoop';
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

const sceneProps = (scene: WatercolorLoopProps['scene'], input: object = {}) => watercolorLoopSchema.parse({scene, ...input});

test('Watercolor: Studio, catalog and the flow preset share the sixteen-second full HD painting', () => {
  const defaults = watercolorLoopSchema.parse({});
  assert.deepEqual(defaults, {
    durationSeconds: 16, seed: 11, transparent: false, backgroundColor: '#F6F0E2',
    colors: ['#6C4BA6', '#D65A8E', '#A2479F', '#B49CE0'], outputFormat: 'webm',
    scene: 'flow', speed: 1, granulation: 0.7, paperTexture: 1, centerCalm: 0.3,
  });
  const metadata = getCompositionMetadata(defaults);
  assert.deepEqual(metadata, {width: 1920, height: 1080, fps: 60, durationInFrames: 960});
  assert.deepEqual(backgroundCatalog.WatercolorLoop.defaultProps, defaults);
  assert.equal(getOpenGlRenderer(backgroundCatalog.WatercolorLoop), 'angle');
  const preset: unknown = JSON.parse(readFileSync(new URL('../presets/watercolor-flow.json', import.meta.url), 'utf8'));
  assert.deepEqual(watercolorLoopSchema.strict().parse(preset), {...defaults, outputFormat: 'mp4'});

  type CompositionProps = typeof metadata & {id: string; defaultProps: typeof defaults; schema: typeof watercolorLoopSchema};
  const composition = findComposition<CompositionProps>(RemotionRoot(), 'WatercolorLoop');
  assert.ok(isValidElement<CompositionProps>(composition), 'the composition must be registered in Studio');
  assert.equal(composition.props.schema, watercolorLoopSchema);
  assert.deepEqual(composition.props.defaultProps, defaults);
});

test('Watercolor: controls accept their boundaries and reject invalid values', () => {
  for (const key of ['granulation', 'paperTexture', 'centerCalm']) {
    for (const value of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, '0.5']) {
      assert.equal(watercolorLoopSchema.safeParse({[key]: value}).success, false, `${key}: ${value}`);
    }
  }
  for (const input of [{speed: -0.01}, {speed: 3.01}, {speed: Number.NaN}, {scene: 'ocean'}, {colors: ['#FFFFFF']}]) {
    assert.equal(watercolorLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {speed: 0, granulation: 0, paperTexture: 0, centerCalm: 0},
    {speed: 3, granulation: 1, paperTexture: 1, centerCalm: 1},
    {colors: ['#000000', 'rgba(255, 255, 255, 0.35)', '#123', 'hsl(200, 50%, 50%)', 'red', '#ABCDEF']},
  ]) {
    assert.equal(watercolorLoopSchema.safeParse(input).success, true, JSON.stringify(input));
  }
});

test('Watercolor: every watercolor-*.json preset spells out every control, and every scene has one', () => {
  const directory = new URL('../presets/', import.meta.url);
  const covered = new Set<string>();
  for (const name of readdirSync(directory).filter((file) => /^watercolor-.*\.json$/.test(file))) {
    const raw = JSON.parse(readFileSync(new URL(name, directory), 'utf8')) as Record<string, unknown>;
    const props = watercolorLoopSchema.strict().parse(raw);
    assert.deepEqual(Object.keys(raw).sort(), Object.keys(props).sort(), `${name}: every key`);
    assert.equal(name, `watercolor-${props.scene}.json`);
    covered.add(props.scene);
  }
  assert.deepEqual([...covered].sort(), [...WATERCOLOR_SCENES].sort());
});

for (const scene of WATERCOLOR_SCENES) {
  test(`Watercolor ${scene}: the shader declares exactly the uniforms the scene delivers`, () => {
    const source = getWatercolorFragmentShader(scene);
    assert.ok(source.startsWith('#version 300 es\n'), 'GLSL ES 3.00 must start on the first line');
    assert.equal(source.match(/\bvec4\s+experiment\s*\(\s*vec2\s+\w+\s*\)/g)?.length, 1, 'one experiment(vec2)');
    const declared = declaredUniforms(source);
    for (const input of [{}, {colors: ['#000000', '#FFFFFF']}, {speed: 0}, {speed: 3, granulation: 1, centerCalm: 1, seed: -99}]) {
      const props = sceneProps(scene, input);
      for (const frame of [0, 137, 959]) {
        const uniforms = getWatercolorUniforms(props, getWatercolorScene(props, frame, 960), 1920, 1080);
        assert.deepEqual([...Object.keys(uniforms)].sort(), [...declared.keys()].sort(), 'declared and delivered uniforms');
        for (const [name, value] of Object.entries(uniforms)) {
          const values = typeof value === 'number' ? [value] : [...value];
          assert.equal(values.length, declared.get(name), `${name}: number of values`);
          assert.ok(values.every(Number.isFinite), `${name}: finite values`);
        }
      }
    }
  });

  test(`Watercolor ${scene}: time reaches the shader only through the scene, and the GLSL stays portable`, () => {
    const source = getWatercolorFragmentShader(scene);
    const own = source.slice(GLSL_PRELUDE.length, source.length - GLSL_MAIN.length);
    for (const forbidden of [/43758/, /sin\s*\(\s*dot\s*\(/, /\bfract\s*\(\s*sin\b/, /\biTime\b/, /\buniform\s+\w+\s+\w*time\w*/i]) {
      assert.doesNotMatch(own, forbidden, `${scene}: ${forbidden}`);
    }
    // smoothstep with edge0 >= edge1 is undefined in GLSL ES 3.00: write 1.0 - smoothstep(b, a, x).
    for (const match of own.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) {
      assert.ok(Number(match[1]) < Number(match[2]), `${scene}: ${match[0]} has its edges reversed`);
    }
    // Names GLSL ES 3.00 reserves, or gives to a built-in, fail to compile with an empty log under ANGLE.
    for (const match of own.matchAll(/\b(?:float|int|uint|bool|vec[234]|mat[234])\s+(\w+)\s*[=;,[(]/g)) {
      assert.ok(!['half', 'patch', 'sample', 'input', 'output', 'filter', 'common', 'partition', 'active', 'round', 'fixed', 'long', 'short', 'double'].includes(match[1]!),
        `${scene}: "${match[1]}" is reserved or built in`);
    }
  });

  test(`Watercolor ${scene}: speed 0 holds the painting still and every speed closes the cycle`, () => {
    const still = sceneProps(scene, {speed: 0});
    assert.deepEqual(getWatercolorScene(still, 0, 480), getWatercolorScene(still, 239, 480));
    for (const speed of [0.05, 0.5, 1, 2.5, 3]) {
      for (const durationSeconds of [3.7, 16, 60]) {
        const props = sceneProps(scene, {speed, durationSeconds});
        const {durationInFrames: length} = getCompositionMetadata(props);
        assert.deepEqual(getWatercolorScene(props, length, length), getWatercolorScene(props, 0, length));
        assert.notDeepEqual(getWatercolorScene(props, 1, length), getWatercolorScene(props, 0, length), `${scene}: speed ${speed} moves`);
      }
    }
  });
}

test('Watercolor flow: the current carries the pigment as far per second at any duration, in proportion to speed', () => {
  const drift = (speed: number, durationSeconds: number) => {
    const props = sceneProps('flow', {speed, durationSeconds});
    const current = getWatercolorScene(props, 0, getCompositionMetadata(props).durationInFrames).find((element) => element.kind === 'current')!;
    // px per life times lives per cycle, over the cycle's seconds: the pace the viewer sees.
    const lives = Math.max(1, Math.round((speed * durationSeconds) / 9));
    return ((current.drift as number) * lives) / durationSeconds;
  };
  for (const durationSeconds of [8, 16, 30]) {
    assert.ok(Math.abs(drift(1, durationSeconds) - 24) < 1e-9, `${durationSeconds} s: ${drift(1, durationSeconds)} px/s`);
    for (const speed of [0.25, 0.5, 2, 3]) {
      assert.ok(Math.abs(drift(speed, durationSeconds) / drift(1, durationSeconds) - speed) < 1e-9, `${durationSeconds} s, speed ${speed}`);
    }
  }
});
