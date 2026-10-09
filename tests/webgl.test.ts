import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {test} from 'node:test';
import {resolveExport} from '../scripts/export';
import {
  WEBGL_EXPERIMENTS, getShaderSeed, getWebGLFragmentShader, getWebGLScene, getWebGLUniforms, webglLoopSchema,
  type WebGLLoopProps,
} from '../src/backgrounds/WebGLLoop';
import {GLSL_MAIN, GLSL_PRELUDE} from '../src/backgrounds/webgl/glsl';
import {MESH_WARP_SECONDS, layoutMeshSpots, meshSpotCount} from '../src/backgrounds/webgl/experiments/mesh';
import {getNoiseFlow, parseColor, srgbToLinear, wholeTurns} from '../src/backgrounds/webgl/scene';
import {backgroundCatalog, getOpenGlRenderer} from '../src/catalog';
import {TAU} from '../src/loop';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

const COMPONENTS: Record<string, number> = {
  float: 1, vec2: 2, vec3: 3, vec4: 4, int: 1, ivec2: 2, ivec3: 3, ivec4: 4,
  uint: 1, uvec2: 2, uvec3: 3, uvec4: 4, bool: 1, bvec2: 2, bvec3: 3, bvec4: 4,
};

/** Every uniform the source declares, with the number of values it holds. */
const declaredUniforms = (source: string) => {
  const uniforms = new Map<string, number>();
  for (const match of source.matchAll(/^\s*uniform\s+(\w+)\s+(\w+)\s*(?:\[\s*(\d+)\s*\])?\s*;/gm)) {
    const components = COMPONENTS[match[1]!];
    assert.ok(components, `tipo de uniform sem suporte: ${match[1]}`);
    assert.ok(!uniforms.has(match[2]!), `uniform declarado duas vezes: ${match[2]}`);
    uniforms.set(match[2]!, components * Number(match[3] ?? 1));
  }
  return uniforms;
};

const sampleProps = (experiment: WebGLLoopProps['experiment'], input: object = {}) =>
  webglLoopSchema.parse({experiment, ...input});

test('WebGL: os valores iniciais descrevem 16 segundos de aurora', () => {
  const props = webglLoopSchema.parse({});
  assert.equal(props.experiment, 'aurora');
  assert.equal(props.durationSeconds, 16);
  assert.equal(props.seed, 7);
  assert.equal(props.backgroundColor, '#070B16');
  assert.deepEqual(props.colors, ['#2DD4BF', '#818CF8', '#F472B6']);
  assert.equal(props.speed, 1);
  assert.equal(props.scale, 1);
  assert.equal(props.intensity, 1);
  assert.equal(props.centerFade, 0.5);
  assert.deepEqual(getCompositionMetadata(props), {width: 1920, height: 1080, fps: 60, durationInFrames: 960});
});

test('WebGL: o schema recusa controles fora da faixa e aceita os limites', () => {
  for (const input of [
    {experiment: 'plasma'}, {speed: -0.1}, {speed: 3.01}, {scale: 0.49}, {scale: 2.01},
    {intensity: -0.1}, {intensity: 2.01}, {centerFade: -0.1}, {centerFade: 1.01}, {colors: ['#FFFFFF']},
  ]) {
    assert.equal(webglLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {speed: 0}, {speed: 3}, {scale: 0.5}, {scale: 2}, {intensity: 0}, {intensity: 2}, {centerFade: 0}, {centerFade: 1},
    {colors: ['#000000', 'rgba(255, 255, 255, 0.35)', '#123', 'hsl(200, 50%, 50%)', 'red', '#ABCDEF']},
  ]) {
    assert.equal(webglLoopSchema.safeParse(input).success, true, JSON.stringify(input));
  }
});

test('WebGL: o Studio tem um defaultProps literal válido e o catálogo usa os valores do schema', () => {
  const root = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');
  const literal = /id="WebGLLoop"[\s\S]*?defaultProps=\{(\{.*?\})\}/.exec(root);
  assert.ok(literal, 'Root.tsx precisa de um defaultProps literal para WebGLLoop');
  // "Save default props" in the Studio rewrites this literal, so it only has to stay valid.
  webglLoopSchema.parse(JSON.parse(literal[1]!.replace(/ as const/g, '')) as unknown);
  assert.deepEqual(backgroundCatalog.WebGLLoop.defaultProps, webglLoopSchema.parse({}));
});

test('WebGL: shader compositions request the ANGLE backend', () => {
  for (const background of Object.values(backgroundCatalog)) {
    assert.equal(getOpenGlRenderer(background), ['WebGLLoop', 'WutheringWavesLoop', 'WatercolorLoop'].includes(background.id) ? 'angle' : null, background.id);
  }
  const resolved = resolveExport({compositionId: 'WebGLLoop', format: 'mp4'});
  assert.deepEqual(resolved.chromiumOptions, {gl: 'angle'});
  assert.deepEqual(resolveExport({compositionId: 'GradientLoop', format: 'mp4'}).chromiumOptions, {gl: null});
});

test('WebGL: a regra de alpha é a mesma do resto do projeto', () => {
  for (const experiment of WEBGL_EXPERIMENTS) {
    for (const outputFormat of ['mp4', 'webm', 'gif'] as const) {
      const resolved = resolveExport({compositionId: 'WebGLLoop', format: outputFormat, props: {experiment, transparent: true}});
      assert.equal(hasTransparentBackground(resolved.props), outputFormat === 'webm');
      assert.equal(resolved.preset.codec, {mp4: 'h264', webm: 'vp9', gif: 'gif'}[outputFormat]);
      if (outputFormat === 'webm') assert.equal(resolved.preset.pixelFormat, 'yuva420p');
    }
  }
});

test('WebGL: cores CSS viram canais sRGB e luz linear', () => {
  assert.deepEqual(parseColor('#FF0000'), [1, 0, 0, 1]);
  assert.deepEqual(parseColor('rgba(255, 255, 255, 0.35)').slice(0, 3), [1, 1, 1]);
  assert.ok(Math.abs(parseColor('rgba(255, 255, 255, 0.35)')[3] - 0.35) < 0.002);
  assert.throws(() => parseColor('not-a-color'));
  assert.equal(srgbToLinear(0), 0);
  assert.equal(srgbToLinear(1), 1);
  assert.ok(Math.abs(srgbToLinear(0.5) - 0.214) < 0.001);
});

test('WebGL: o eixo de ruído fecha o ciclo em períodos inteiros, longe da emenda', () => {
  for (const [speed, durationSeconds, rate] of [[1, 16, 0.12], [0.1, 3.7, 0.1], [3, 12.25, 0.3], [2.4, 60, 0.05]]) {
    for (const seed of [-7, 1, 2026]) {
      const props = {speed: speed!, durationSeconds: durationSeconds!, seed};
      const start = getNoiseFlow(props, 0, rate!, 5);
      assert.ok(Number.isInteger(start.period) && start.period >= 1);
      assert.equal(start.period, Math.max(1, Math.round(speed! * durationSeconds! * rate!)));
      assert.ok(start.position >= 0.2 * start.period - 1e-9 && start.position <= 0.8 * start.period + 1e-9);
      assert.ok(Math.abs(getNoiseFlow(props, 1, rate!, 5).position - start.position) < 1e-9);
      // Just after the start and just before the end, it moves one period per cycle.
      const velocity = (getNoiseFlow(props, 1e-6, rate!, 5).position - start.position) / 1e-6;
      const before = (start.position - getNoiseFlow(props, 1 - 1e-6, rate!, 5).position) / 1e-6;
      assert.ok(Math.abs(velocity - start.period) < 1e-3 && Math.abs(before - start.period) < 1e-3);
    }
  }
  const still = getNoiseFlow({speed: 0, durationSeconds: 8, seed: 3}, 0.4, 0.2, 5);
  assert.equal(still.position, getNoiseFlow({speed: 0, durationSeconds: 8, seed: 3}, 0.9, 0.2, 5).position);
  assert.deepEqual([wholeTurns(0), wholeTurns(0.01), wholeTurns(1.49), wholeTurns(1.5), wholeTurns(7.2)], [0, 1, 1, 2, 7]);
});

test('WebGL: o hash da GPU recebe uma seed de 32 bits, estável e sensível à seed', () => {
  for (const seed of [-7, 0, 1, 2026, Number.MAX_SAFE_INTEGER]) {
    const value = getShaderSeed(seed);
    assert.ok(Number.isInteger(value) && value >= 0 && value < 2 ** 32);
    assert.equal(getShaderSeed(seed), value);
  }
  assert.notEqual(getShaderSeed(1), getShaderSeed(2));
});

test('WebGL: todo preset webgl-*.json é aceito pelo schema estrito e cada experimento tem preset', () => {
  const directory = new URL('../presets/', import.meta.url);
  const files = readdirSync(directory).filter((name) => /^webgl-.*\.json$/.test(name));
  const covered = new Set<string>();
  for (const name of files) {
    const raw = JSON.parse(readFileSync(new URL(name, directory), 'utf8')) as Record<string, unknown>;
    const props = webglLoopSchema.strict().parse(raw);
    // A preset spells out every control, so saved Studio defaults never change what it shows.
    assert.deepEqual(Object.keys(raw).sort(), Object.keys(props).sort(), `${name}: todas as chaves`);
    covered.add(props.experiment);
  }
  for (const experiment of WEBGL_EXPERIMENTS) assert.ok(covered.has(experiment), `${experiment}: sem preset`);
});

for (const experiment of WEBGL_EXPERIMENTS) {
  test(`WebGL ${experiment}: o shader declara exatamente os uniforms que a cena entrega`, () => {
    const source = getWebGLFragmentShader(experiment);
    assert.ok(source.startsWith('#version 300 es\n'), 'GLSL ES 3.00 precisa começar na primeira linha');
    assert.equal(source.match(/\bvec4\s+experiment\s*\(\s*vec2\s+\w+\s*\)/g)?.length, 1, 'uma função experiment(vec2)');
    const declared = declaredUniforms(source);
    for (const input of [{}, {colors: ['#000000', '#FFFFFF']}, {speed: 0}, {speed: 3, scale: 2, intensity: 2, seed: -99}]) {
      const props = sampleProps(experiment, input);
      for (const frame of [0, 137, 959]) {
        const uniforms = getWebGLUniforms(props, getWebGLScene(props, frame, 960), 1920, 1080);
        assert.deepEqual([...Object.keys(uniforms)].sort(), [...declared.keys()].sort(), 'uniforms declarados e entregues');
        for (const [name, value] of Object.entries(uniforms)) {
          const values = typeof value === 'number' ? [value] : [...value];
          assert.equal(values.length, declared.get(name), `${name}: número de valores`);
          assert.ok(values.every(Number.isFinite), `${name}: valores finitos`);
        }
      }
    }
  });

  test(`WebGL ${experiment}: o tempo só chega ao shader pelos uniforms da cena`, () => {
    const source = getWebGLFragmentShader(experiment);
    const own = source.slice(GLSL_PRELUDE.length, source.length - GLSL_MAIN.length);
    // A sin-based hash differs between GPUs; clocks and CSS animation break the loop.
    for (const forbidden of [/43758/, /sin\s*\(\s*dot\s*\(/, /\bfract\s*\(\s*sin\b/, /\biTime\b/, /\buniform\s+\w+\s+\w*time\w*/i]) {
      assert.doesNotMatch(own, forbidden, `${experiment}: ${forbidden}`);
    }
    // smoothstep with edge0 >= edge1 is undefined in GLSL ES 3.00: write 1.0 - smoothstep(b, a, x).
    for (const match of own.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) {
      assert.ok(Number(match[1]) < Number(match[2]), `${experiment}: ${match[0]} tem as bordas invertidas`);
    }
    const module = readFileSync(new URL(`../src/backgrounds/webgl/experiments/${experiment}.ts`, import.meta.url), 'utf8');
    for (const forbidden of [/Math\.random/, /Date\.now/, /new Date/, /performance\.now/, /requestAnimationFrame/]) {
      assert.doesNotMatch(module, forbidden, `${experiment}: ${forbidden}`);
    }
  });

  test(`WebGL ${experiment}: speed 0 deixa a imagem parada e qualquer speed fecha o ciclo`, () => {
    const still = sampleProps(experiment, {speed: 0});
    assert.deepEqual(getWebGLScene(still, 0, 480), getWebGLScene(still, 239, 480));
    for (const speed of [0.05, 0.5, 1, 2.5, 3]) {
      for (const durationSeconds of [3.7, 16, 60]) {
        const props = sampleProps(experiment, {speed, durationSeconds});
        const {durationInFrames: length} = getCompositionMetadata(props);
        assert.deepEqual(getWebGLScene(props, length, length), getWebGLScene(props, 0, length));
        assert.notDeepEqual(getWebGLScene(props, 1, length), getWebGLScene(props, 0, length), `${experiment}: speed ${speed} move`);
      }
    }
  });
}

test('WebGL mesh: cada cor aparece o mesmo número de vezes e nenhuma mancha vizinha repete a cor', () => {
  for (const paletteSize of [2, 3, 4, 5, 6]) {
    for (const seed of [-7, 1, 7, 2026]) {
      const spots = layoutMeshSpots(seed, paletteSize);
      assert.equal(spots.length, meshSpotCount(paletteSize));
      assert.ok(spots.length >= 6 && spots.length <= 10, `${paletteSize} cores: ${spots.length} manchas`);
      const counts = new Map<number, number>();
      for (const spot of spots) counts.set(spot.color, (counts.get(spot.color) ?? 0) + 1);
      assert.deepEqual([...counts.keys()].sort(), Array.from({length: paletteSize}, (_, index) => index));
      assert.equal(new Set(counts.values()).size, 1, `${paletteSize} cores: a mesma quantidade de cada cor`);
      // Two colours cannot avoid a same-colour neighbour across the rows of a triangular lattice.
      if (paletteSize === 2) continue;
      // The lower row sits half a cell to the right: its spot c touches spots c and c + 1 above.
      const columns = spots.length / 2;
      for (let index = 0; index < spots.length; index++) {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const at = (r: number, c: number) => (c >= 0 && c < columns ? r * columns + c : -1);
        const neighbours = [
          at(row, column - 1), at(row, column + 1),
          ...(row === 0 ? [at(1, column - 1), at(1, column)] : [at(0, column), at(0, column + 1)]),
        ].filter((other) => other >= 0);
        for (const other of neighbours) {
          assert.notEqual(spots[other]!.color, spots[index]!.color, `${paletteSize} cores, seed ${seed}: manchas ${index} e ${other}`);
        }
      }
    }
  }
});

test('WebGL mesh: a fase rápida do warp segue o ritmo pedido em qualquer duração', () => {
  for (const durationSeconds of [3.7, 16, 24, 60]) {
    for (const speed of [0.05, 0.25, 0.5, 1, 2, 3]) {
      const props = sampleProps('mesh', {speed, durationSeconds});
      const {durationInFrames: length} = getCompositionMetadata(props);
      let path = 0;
      let previous: number | undefined;
      for (let frame = 0; frame <= length; frame++) {
        const warp = getWebGLScene(props, frame, length).find((element) => element.kind === 'warp')!;
        const angle = Math.atan2(warp.fastSin as number, warp.fastCos as number);
        if (previous !== undefined) path += Math.abs(Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous)));
        previous = angle;
      }
      // Whole turns round the pace by at most 4/3 either way; below that the phase sways over the same ground.
      const ratio = path / ((speed * durationSeconds * TAU) / MESH_WARP_SECONDS);
      assert.ok(ratio > 0.66 && ratio < 1.34, `${durationSeconds} s, speed ${speed}: ${ratio.toFixed(2)}× o ritmo pedido`);
    }
  }
});
