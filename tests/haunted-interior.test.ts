import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Children, isValidElement} from 'react';
import {resolveExport} from '../scripts/export';
import {
  getHauntedInteriorScene, hauntedInteriorLoopSchema, type HauntedInteriorElement,
} from '../src/backgrounds/HauntedInteriorLoop';
import {backgroundCatalog} from '../src/catalog';
import {RemotionRoot} from '../src/Root';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

const FRAMES = [0, 1, 120, 239, 480, 721, 959];
const KINDS = ['dust', 'fog', 'candle', 'chandelier', 'moonlight', 'eyes'] as const;
const CONTROL_NAMES = [
  'fogIntensity', 'candleIntensity', 'moonlightIntensity', 'hauntingIntensity', 'chandelierSway',
] as const;
const pick = (scene: HauntedInteriorElement[], kind: HauntedInteriorElement['kind']) =>
  scene.filter((element) => element.kind === kind);

test('Interior: Studio, catálogo, schema e preset compartilham a configuração da mansão', () => {
  const defaults = hauntedInteriorLoopSchema.parse({});
  assert.deepEqual(defaults, {
    durationSeconds: 16, seed: 113, transparent: false, backgroundColor: '#080D10',
    colors: ['#536C68', '#A8BDB0', '#CA8A48'], outputFormat: 'webm',
    dustCount: 36, fogIntensity: 0.55, candleIntensity: 0.8, moonlightIntensity: 0.65,
    hauntingIntensity: 0.45, chandelierSway: 0.6,
  });
  const metadata = getCompositionMetadata(defaults);
  assert.deepEqual(metadata, {width: 1920, height: 1080, fps: 60, durationInFrames: 960});
  assert.deepEqual(backgroundCatalog.HauntedInteriorLoop.defaultProps, defaults);
  const preset: unknown = JSON.parse(readFileSync(new URL('../presets/halloween-haunted-interior.json', import.meta.url), 'utf8'));
  assert.deepEqual(hauntedInteriorLoopSchema.strict().parse(preset), defaults);

  type CompositionProps = typeof metadata & {
    id: string;
    defaultProps: typeof defaults;
    schema: typeof hauntedInteriorLoopSchema;
    calculateMetadata: (options: {props: typeof defaults}) => typeof metadata & {props: typeof defaults};
  };
  const composition = Children.toArray(RemotionRoot().props.children).find((child) =>
    isValidElement<CompositionProps>(child) && child.props.id === 'HauntedInteriorLoop');
  assert.ok(isValidElement<CompositionProps>(composition), 'o interior precisa estar registrado no Studio');
  assert.equal(composition.props.schema, hauntedInteriorLoopSchema);
  assert.deepEqual(composition.props.defaultProps, defaults);
  for (const key of ['width', 'height', 'fps', 'durationInFrames'] as const) {
    assert.equal(composition.props[key], metadata[key]);
  }
  const custom = hauntedInteriorLoopSchema.parse({durationSeconds: 3.7, outputFormat: 'gif'});
  const calculated = composition.props.calculateMetadata({props: custom});
  assert.deepEqual(calculated.props, custom);
  assert.equal(calculated.durationInFrames, 185);
  assert.equal(calculated.fps, 50);
});

test('Interior: controles aceitam os extremos e rejeitam valores inválidos', () => {
  for (const dustCount of [-1, 101, 1.5, '36', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(hauntedInteriorLoopSchema.safeParse({dustCount}).success, false, `dustCount: ${dustCount}`);
  }
  for (const control of CONTROL_NAMES) {
    for (const value of [-0.01, 1.01, '0.5', Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(hauntedInteriorLoopSchema.safeParse({[control]: value}).success, false, `${control}: ${value}`);
    }
  }
  for (const value of [0, 1]) {
    const controls = Object.fromEntries(CONTROL_NAMES.map((control) => [control, value]));
    assert.equal(hauntedInteriorLoopSchema.safeParse({...controls, dustCount: value * 100}).success, true);
  }
});

test('Interior: contagens, dimensões e luzes permanecem válidas nos extremos dos controles', () => {
  for (const input of [
    {},
    {dustCount: 0, ...Object.fromEntries(CONTROL_NAMES.map((control) => [control, 0]))},
    {dustCount: 100, ...Object.fromEntries(CONTROL_NAMES.map((control) => [control, 1]))},
  ]) {
    const props = hauntedInteriorLoopSchema.parse(input);
    for (const frame of FRAMES) {
      const scene = getHauntedInteriorScene(props, frame, 960);
      assert.deepEqual(Object.fromEntries(KINDS.map((kind) => [kind, pick(scene, kind).length])), {
        dust: props.dustCount, fog: 5, candle: 6, chandelier: 1, moonlight: 2, eyes: 2,
      });
      assert.equal(scene.length, props.dustCount + 16);
      for (const element of scene) {
        for (const key of ['x', 'y', 'scale', 'rotation', 'opacity', 'glow', 'lean'] as const) {
          assert.ok(Number.isFinite(element[key]), `${element.kind}.${key}`);
        }
        assert.ok(element.scale > 0, `${element.kind}: escala positiva`);
        assert.ok(element.opacity >= 0 && element.opacity <= 1, `${element.kind}: opacidade válida`);
        assert.ok(element.glow >= 0 && element.glow <= 1, `${element.kind}: brilho válido`);
      }
    }
  }
});

test('Interior: cada controle altera sua camada de forma proporcional e isolada', () => {
  const controlledFields = {
    fogIntensity: {kinds: ['fog'], field: 'opacity'},
    candleIntensity: {kinds: ['candle', 'chandelier'], field: 'glow'},
    moonlightIntensity: {kinds: ['moonlight'], field: 'opacity'},
    hauntingIntensity: {kinds: ['eyes'], field: 'opacity'},
    chandelierSway: {kinds: ['chandelier'], field: 'rotation'},
  } as const;
  for (const control of CONTROL_NAMES) {
    let observedEffect = false;
    const target = controlledFields[control];
    for (const frame of FRAMES) {
      const scenes = [0, 0.5, 1].map((value) => getHauntedInteriorScene(
        hauntedInteriorLoopSchema.parse({[control]: value}), frame, 960,
      ));
      const [off, half, full] = scenes;
      assert.ok(off && half && full);
      for (const [index, element] of full.entries()) {
        const disabled = off[index]!;
        const intermediate = half[index]!;
        assert.equal(element.kind, disabled.kind);
        if ((target.kinds as readonly string[]).includes(element.kind)) {
          assert.ok(disabled[target.field] === 0, `${control}: zero desliga o efeito`);
          assert.equal(intermediate[target.field] * 2, element[target.field], `${control}: intensidade proporcional`);
          observedEffect ||= Math.abs(element[target.field]) > 0;
          const withoutControlledField = (entry: HauntedInteriorElement) =>
            Object.fromEntries(Object.entries(entry).filter(([key]) => key !== target.field));
          assert.deepEqual(withoutControlledField(element), withoutControlledField(disabled), `${control}: outros campos preservados`);
          assert.deepEqual(withoutControlledField(element), withoutControlledField(intermediate));
        } else {
          assert.deepEqual(element, disabled, `${control}: não altera ${element.kind}`);
          assert.deepEqual(element, intermediate);
        }
      }
    }
    assert.ok(observedEffect, `${control}: o controle precisa ter efeito visível durante o ciclo`);
  }
});

test('Interior: aumentar poeira preserva as partículas existentes e as demais camadas', () => {
  for (const frame of [0, 173, 959]) {
    const scenes = [0, 1, 100].map((dustCount) => getHauntedInteriorScene(
      hauntedInteriorLoopSchema.parse({dustCount}), frame, 960,
    ));
    const [empty, few, many] = scenes;
    assert.ok(empty && few && many);
    assert.deepEqual(pick(many, 'dust').slice(0, 1), pick(few, 'dust'));
    for (const kind of KINDS.filter((kind) => kind !== 'dust')) {
      assert.deepEqual(pick(empty, kind), pick(few, kind), `poeira alterou ${kind}`);
      assert.deepEqual(pick(many, kind), pick(few, kind), `poeira alterou ${kind}`);
    }
  }
});

test('Interior: atmosfera respeita o espaço central do overlay e o lustre mantém o ponto de suspensão', () => {
  for (const seed of [-2026, 1, 113]) {
    const props = hauntedInteriorLoopSchema.parse({seed, dustCount: 100, chandelierSway: 1});
    for (let frame = 0; frame <= 960; frame += 12) {
      const scene = getHauntedInteriorScene(props, frame, 960);
      for (const dust of pick(scene, 'dust')) {
        assert.ok(dust.x < 500 || dust.x > 1420, `poeira invadiu o centro no frame ${frame}`);
        assert.ok(!(dust.x >= 540 && dust.x <= 1380 && dust.y >= 250 && dust.y <= 830));
      }
      for (const fog of pick(scene, 'fog')) {
        assert.ok(fog.y > 900, `névoa subiu para a área central no frame ${frame}`);
      }
      assert.deepEqual(pick(scene, 'eyes').map(({x}) => x), [410, 1510]);
      assert.deepEqual(pick(scene, 'chandelier').map(({x, y}) => ({x, y})), [{x: 960, y: 0}]);
    }
  }
});

test('Interior: amostras de outros frames e seeds não alteram parâmetros nem cenas já calculadas', () => {
  const props = hauntedInteriorLoopSchema.parse({seed: -2026, dustCount: 100});
  const originalProps = structuredClone(props);
  const first = getHauntedInteriorScene(props, 173, 960);
  const originalScene = structuredClone(first);
  getHauntedInteriorScene(props, 721, 960);
  getHauntedInteriorScene(hauntedInteriorLoopSchema.parse({seed: 19}), 173, 960);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(first, originalScene);
  assert.deepEqual(getHauntedInteriorScene(props, 173, 960), originalScene);
});

test('Interior: exportação compartilha resolução, duração e regra de alpha com o preview', () => {
  for (const format of ['mp4', 'webm', 'gif'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'HauntedInteriorLoop', format, props: {transparent}});
      assert.equal(resolved.props.backgroundColor, '#080D10');
      assert.equal(resolved.props.durationSeconds, 16);
      assert.deepEqual(getCompositionMetadata(resolved.props), {
        width: 1920, height: 1080, fps: format === 'gif' ? 50 : 60,
        durationInFrames: format === 'gif' ? 800 : 960,
      });
      assert.equal(hasTransparentBackground(resolved.props), format === 'webm' && transparent);
      if (format === 'webm') {
        assert.equal(resolved.preset.codec, 'vp9');
        assert.equal('pixelFormat' in resolved.preset && resolved.preset.pixelFormat, transparent ? 'yuva420p' : 'yuv420p');
      }
    }
  }
});
