import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {isValidElement} from 'react';
import {resolveExport} from '../scripts/export';
import {getWutheringWavesScene, getWutheringWavesUniforms, wutheringWavesLoopSchema} from '../src/backgrounds/WutheringWavesLoop';
import {WUTHERING_WAVES_FRAGMENT_SHADER} from '../src/backgrounds/wuthering-waves/shader';
import {backgroundCatalog} from '../src/catalog';
import {RemotionRoot} from '../src/Root';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';
import {findComposition} from './helpers/find-composition';

type Scene = ReturnType<typeof getWutheringWavesScene>;
const pick = (scene: Scene, kind: string) => scene.filter((element) => element.kind === kind);
const FRAMES = [0, 1, 137, 239, 480, 721, 959];
const MOVING_KINDS = ['water', 'particle', 'ripple', 'ribbon', 'plant'];

test('Wuthering Waves: Studio, catalog, and preset share the sixteen-second full HD scene', () => {
  const defaults = wutheringWavesLoopSchema.parse({});
  assert.deepEqual(defaults, {
    durationSeconds: 16, seed: 1403, transparent: false, backgroundColor: '#1B3E6D',
    colors: ['#ECDCB6', '#48B9C6', '#DBBE8D'], outputFormat: 'webm',
    atmosphere: 0.8, resonance: 0.7, particleCount: 28, motion: 1, centerShade: 0.08,
  });
  const metadata = getCompositionMetadata(defaults);
  assert.deepEqual(metadata, {width: 1920, height: 1080, fps: 60, durationInFrames: 960});
  assert.deepEqual(backgroundCatalog.WutheringWavesLoop.defaultProps, defaults);
  const preset: unknown = JSON.parse(readFileSync(new URL('../presets/wuthering-waves-azure-lotus.json', import.meta.url), 'utf8'));
  assert.deepEqual(wutheringWavesLoopSchema.strict().parse(preset), {...defaults, outputFormat: 'mp4'});

  type CompositionProps = typeof metadata & {
    id: string;
    defaultProps: typeof defaults;
    schema: typeof wutheringWavesLoopSchema;
    calculateMetadata: (options: {props: typeof defaults}) => typeof metadata & {props: typeof defaults};
  };
  const composition = findComposition<CompositionProps>(RemotionRoot(), 'WutheringWavesLoop');
  assert.ok(isValidElement<CompositionProps>(composition), 'the composition must be registered in Studio');
  assert.equal(composition.props.schema, wutheringWavesLoopSchema);
  assert.deepEqual(composition.props.defaultProps, defaults);
  for (const key of ['width', 'height', 'fps', 'durationInFrames'] as const) {
    assert.equal(composition.props[key], metadata[key]);
  }
  const custom = wutheringWavesLoopSchema.parse({durationSeconds: 3.7, outputFormat: 'gif'});
  const calculated = composition.props.calculateMetadata({props: custom});
  assert.deepEqual(calculated.props, custom);
  assert.equal(calculated.durationInFrames, 185);
  assert.equal(calculated.fps, 50);
});

test('Wuthering Waves: controls accept their boundaries and reject invalid values', () => {
  for (const key of ['atmosphere', 'resonance', 'centerShade']) {
    for (const value of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, '0.5']) {
      assert.equal(wutheringWavesLoopSchema.safeParse({[key]: value}).success, false, `${key}: ${value}`);
    }
  }
  for (const input of [
    {particleCount: -1}, {particleCount: 101}, {particleCount: 1.5}, {particleCount: '28'},
    {motion: -0.01}, {motion: 2.01}, {motion: Number.NaN}, {motion: Number.POSITIVE_INFINITY}, {motion: '1'},
  ]) {
    assert.equal(wutheringWavesLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {atmosphere: 0, resonance: 0, particleCount: 0, motion: 0, centerShade: 0},
    {atmosphere: 1, resonance: 1, particleCount: 100, motion: 2, centerShade: 1},
    {motion: 0.35},
  ]) {
    assert.equal(wutheringWavesLoopSchema.safeParse(input).success, true, JSON.stringify(input));
  }
});

test('Wuthering Waves: layers stay finite and particle counts hold throughout the cycle', () => {
  for (const controls of [
    {atmosphere: 0, resonance: 0, particleCount: 0, motion: 0, centerShade: 0},
    {atmosphere: 0.8, resonance: 0.7, particleCount: 28, motion: 1, centerShade: 0.08},
    {atmosphere: 1, resonance: 1, particleCount: 100, motion: 2, centerShade: 1},
  ]) {
    for (const seed of [-7, 1403, 2026]) {
      const props = wutheringWavesLoopSchema.parse({...controls, seed});
      for (const frame of FRAMES) {
        const scene = getWutheringWavesScene(props, frame, 960);
        assert.ok(scene.length > 0, 'the scene must not disappear');
        assert.equal(pick(scene, 'particle').length, controls.particleCount);
        for (const element of scene) {
          for (const key of ['x', 'y', 'width', 'height', 'opacity', 'rotation', 'scale'] as const) {
            assert.ok(Number.isFinite(element[key]), `${element.kind}.${key}: non-finite value`);
          }
          assert.ok(element.opacity >= 0 && element.opacity <= 1, `${element.kind}: opacity outside 0…1`);
          // Water uses scale as displacement strength: zero disables the filter's deformation.
          assert.ok(element.kind === 'water' ? element.scale >= 0 : element.scale > 0, `${element.kind}: invalid scale`);
          assert.ok(element.width >= 0 && element.height >= 0, `${element.kind}: negative dimension`);
        }
      }
    }
  }
});

test('Wuthering Waves: zero motion freezes every layer and positive motion animates each effect', () => {
  for (const seed of [-7, 1403, 2026]) {
    const stillProps = wutheringWavesLoopSchema.parse({seed, motion: 0});
    // JSON normalizes -0 and 0, which draw identically when motion disables a sine/cosine.
    const still = JSON.stringify(getWutheringWavesScene(stillProps, 0, 960));
    for (const frame of [...FRAMES, -1, 960, 1097]) {
      assert.equal(JSON.stringify(getWutheringWavesScene(stillProps, frame, 960)), still, `motion=0, seed ${seed}, frame ${frame}`);
    }
    const props = wutheringWavesLoopSchema.parse({seed});
    const scenes = FRAMES.map((frame) => getWutheringWavesScene(props, frame, 960));
    for (const kind of MOVING_KINDS) {
      const first = pick(scenes[0]!, kind);
      assert.ok(first.length > 0, `${kind}: missing layer`);
      assert.ok(scenes.slice(1).some((scene) => JSON.stringify(pick(scene, kind)) !== JSON.stringify(first)), `${kind}: frozen layer`);
    }
  }
});

test('Wuthering Waves: disabling atmosphere or resonance removes its procedural light', () => {
  for (const [control, kind, uniform] of [['atmosphere', 'mist', 'uAtmosphere'], ['resonance', 'ribbon', 'uResonance']] as const) {
    for (const frame of FRAMES) {
      const offProps = wutheringWavesLoopSchema.parse({[control]: 0});
      const onProps = wutheringWavesLoopSchema.parse({[control]: 1});
      const offScene = getWutheringWavesScene(offProps, frame, 960);
      const onScene = getWutheringWavesScene(onProps, frame, 960);
      const off = pick(offScene, kind);
      const on = pick(onScene, kind);
      assert.ok(off.every((element) => element.opacity === 0), `${control}: disabled layer remains visible`);
      assert.ok(on.some((element) => element.opacity > 0), `${control}: enabled layer is invisible`);
      assert.equal(getWutheringWavesUniforms(offProps, offScene, 1920, 1080)[uniform], 0, `${control}: shader light remains enabled`);
      assert.equal(getWutheringWavesUniforms(onProps, onScene, 1920, 1080)[uniform], 1, `${control}: shader ignores the maximum intensity`);
    }
  }
});

test('Wuthering Waves: increasing particles preserves their distribution and every other layer', () => {
  for (const frame of [0, 137, 959]) {
    const few = getWutheringWavesScene(wutheringWavesLoopSchema.parse({particleCount: 1}), frame, 960);
    const many = getWutheringWavesScene(wutheringWavesLoopSchema.parse({particleCount: 100}), frame, 960);
    assert.deepEqual(pick(many, 'particle').slice(0, 1), pick(few, 'particle'));
    assert.deepEqual(many.filter((element) => element.kind !== 'particle'), few.filter((element) => element.kind !== 'particle'));
  }
});

test('Wuthering Waves: sampling another frame leaves props and previous scenes unchanged', () => {
  const props = wutheringWavesLoopSchema.parse({seed: -2026, particleCount: 100, motion: 2});
  const originalProps = structuredClone(props);
  const first = getWutheringWavesScene(props, 137, 960);
  const snapshot = structuredClone(first);
  getWutheringWavesScene(props, 721, 960);
  getWutheringWavesScene(wutheringWavesLoopSchema.parse({seed: 19}), 137, 960);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(first, snapshot);
  assert.deepEqual(getWutheringWavesScene(props, 137, 960), snapshot);
});

test('Wuthering Waves: export preserves resolution, duration, and alpha in every format', () => {
  for (const format of ['mp4', 'webm', 'gif', 'mov', 'png'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'WutheringWavesLoop', format, props: {transparent}});
      assert.equal(resolved.props.backgroundColor, '#1B3E6D');
      assert.equal(resolved.props.durationSeconds, 16);
      assert.deepEqual(getCompositionMetadata(resolved.props), {
        width: 1920, height: 1080, fps: format === 'gif' ? 50 : 60,
        durationInFrames: format === 'gif' ? 800 : 960,
      });
      assert.equal(hasTransparentBackground(resolved.props), transparent && ['webm', 'mov', 'png'].includes(format));
    }
  }
});

test('Wuthering Waves: the procedural composition has no image assets or remote media dependencies', () => {
  const source = readFileSync(new URL('../src/backgrounds/WutheringWavesLoop.tsx', import.meta.url), 'utf8');
  for (const forbidden of [
    /\b(?:Img|staticFile|Image|ImageBitmap)\b/, /<\s*(?:img|image)\b/,
    /\.(?:png|jpe?g|webp|avif|gif|bmp)\b/i, /https?:\/\//i, /data:image\//i,
  ]) {
    assert.doesNotMatch(source, forbidden, `procedural composition must not depend on ${forbidden}`);
  }
  assert.doesNotMatch(WUTHERING_WAVES_FRAGMENT_SHADER, /\bsampler\w*\b|\btexture\w*\s*\(/, 'the shader must generate its imagery without sampled textures');
});

test('Wuthering Waves: every declared shader uniform receives finite values with the correct shape', () => {
  const components: Record<string, number> = {
    float: 1, int: 1, uint: 1, bool: 1, vec2: 2, vec3: 3, vec4: 4,
    ivec2: 2, ivec3: 3, ivec4: 4, uvec2: 2, uvec3: 3, uvec4: 4,
  };
  const declared = new Map<string, number>();
  for (const match of WUTHERING_WAVES_FRAGMENT_SHADER.matchAll(/^\s*uniform\s+(\w+)\s+(\w+)\s*(?:\[\s*(\d+)\s*\])?\s*;/gm)) {
    const count = components[match[1]!];
    assert.ok(count, `unsupported uniform type: ${match[1]}`);
    assert.ok(!declared.has(match[2]!), `duplicate uniform: ${match[2]}`);
    declared.set(match[2]!, count * Number(match[3] ?? 1));
  }
  assert.ok(declared.size > 0, 'uniform coverage must not pass on an empty shader');
  for (const input of [
    {},
    {atmosphere: 0, resonance: 0, particleCount: 0, motion: 0, centerShade: 0, colors: ['#000000', '#FFFFFF']},
    {atmosphere: 1, resonance: 1, particleCount: 100, motion: 2, centerShade: 1, transparent: true},
    {colors: ['#000000', '#FFFFFF', 'red', '#48B9C6', 'rgba(255, 255, 255, 0.2)', 'hsl(40, 50%, 50%)']},
  ]) {
    for (const seed of [-7, 1403, 2026]) {
      const props = wutheringWavesLoopSchema.parse({...input, seed});
      for (const frame of FRAMES) {
        const uniforms = getWutheringWavesUniforms(props, getWutheringWavesScene(props, frame, 960), 1920, 1080);
        assert.deepEqual(Object.keys(uniforms).sort(), [...declared.keys()].sort(), 'declared and supplied uniforms must match');
        for (const [name, value] of Object.entries(uniforms)) {
          const values = typeof value === 'number' ? [value] : [...value];
          assert.equal(values.length, declared.get(name), `${name}: incorrect number of components`);
          assert.ok(values.every(Number.isFinite), `${name}: non-finite values`);
        }
      }
    }
  }
});

test('Wuthering Waves: shader uniforms repeat at the seam, freeze at zero motion, and preserve velocity', () => {
  const step = 1e-6;
  for (const motion of [0, 0.35, 1, 2]) {
    for (const length of [185, 480, 960]) {
      const props = wutheringWavesLoopSchema.parse({motion, seed: -1403});
      const sample = (frame: number) => getWutheringWavesUniforms(props, getWutheringWavesScene(props, frame, length), 1920, 1080);
      const start = sample(0);
      assert.deepEqual(sample(length), start);
      assert.deepEqual(sample(length + 137), sample(137));
      assert.deepEqual(sample(-1), sample(length - 1));
      if (motion === 0) {
        assert.equal(JSON.stringify(sample(137)), JSON.stringify(start), 'zero motion must also freeze the shader');
      } else {
        assert.notDeepEqual(sample(137), start, 'the shader must animate when motion is enabled');
      }
      const before = sample(length * (1 - step));
      const after = sample(length * step);
      for (const [name, value] of Object.entries(start)) {
        const values = typeof value === 'number' ? [value] : [...value];
        const previous = before[name]!;
        const next = after[name]!;
        const left = typeof previous === 'number' ? [previous] : [...previous];
        const right = typeof next === 'number' ? [next] : [...next];
        assert.equal(left.length, values.length, `${name}: changing uniform shape`);
        assert.equal(right.length, values.length, `${name}: changing uniform shape`);
        for (const [index, current] of values.entries()) {
          const leftVelocity = (current - left[index]!) / step;
          const rightVelocity = (right[index]! - current) / step;
          const tolerance = 0.1 + Math.max(Math.abs(leftVelocity), Math.abs(rightVelocity)) * 0.001;
          assert.ok(Number.isFinite(leftVelocity) && Number.isFinite(rightVelocity), `${name}[${index}]: non-finite velocity`);
          assert.ok(Math.abs(leftVelocity - rightVelocity) < tolerance, `${name}[${index}]: velocity jumps at the seam`);
        }
      }
    }
  }
});
