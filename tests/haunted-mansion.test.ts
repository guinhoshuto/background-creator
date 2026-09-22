import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Children, isValidElement} from 'react';
import {resolveExport} from '../scripts/export';
import {
  getHauntedMansionScene, hauntedMansionLoopSchema, type HauntedMansionElement,
} from '../src/backgrounds/HauntedMansionLoop';
import {backgroundCatalog} from '../src/catalog';
import {RemotionRoot} from '../src/Root';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

const FRAMES = [0, 1, 120, 239, 480, 721, 959];
const KINDS = ['star', 'bat', 'mote', 'fog', 'cloud', 'window', 'lantern', 'tree', 'moon'] as const;
const pick = (scene: HauntedMansionElement[], kind: HauntedMansionElement['kind']) =>
  scene.filter((element) => element.kind === kind);

test('Mansão: Studio, catálogo, schema e preset abrem a mesma noite de dezesseis segundos', () => {
  const defaults = hauntedMansionLoopSchema.parse({});
  assert.deepEqual(defaults, {
    durationSeconds: 16, seed: 81, transparent: false, backgroundColor: '#0E1520',
    colors: ['#688789', '#D6DDC7', '#E8AF62'], outputFormat: 'webm',
    batCount: 4, moteCount: 28, fogIntensity: 0.75, windowIntensity: 0.7, moonScale: 1,
  });
  const metadata = getCompositionMetadata(defaults);
  assert.deepEqual(metadata, {width: 1920, height: 1080, fps: 60, durationInFrames: 960});
  assert.deepEqual(backgroundCatalog.HauntedMansionLoop.defaultProps, defaults);
  const preset: unknown = JSON.parse(readFileSync(new URL('../presets/halloween-haunted-mansion.json', import.meta.url), 'utf8'));
  assert.deepEqual(hauntedMansionLoopSchema.strict().parse(preset), defaults);

  type CompositionProps = typeof metadata & {
    id: string;
    defaultProps: typeof defaults;
    schema: typeof hauntedMansionLoopSchema;
    calculateMetadata: (options: {props: typeof defaults}) => typeof metadata & {props: typeof defaults};
  };
  const composition = Children.toArray(RemotionRoot().props.children).find((child) =>
    isValidElement<CompositionProps>(child) && child.props.id === 'HauntedMansionLoop');
  assert.ok(isValidElement<CompositionProps>(composition), 'a mansão precisa estar registrada no Studio');
  assert.equal(composition.props.schema, hauntedMansionLoopSchema);
  assert.deepEqual(composition.props.defaultProps, defaults);
  for (const key of ['width', 'height', 'fps', 'durationInFrames'] as const) {
    assert.equal(composition.props[key], metadata[key]);
  }
  const custom = hauntedMansionLoopSchema.parse({durationSeconds: 3.7, outputFormat: 'gif'});
  const calculated = composition.props.calculateMetadata({props: custom});
  assert.deepEqual(calculated.props, custom);
  assert.equal(calculated.durationInFrames, 185);
  assert.equal(calculated.fps, 50);
});

test('Mansão: os controles rejeitam valores inválidos e aceitam seus extremos', () => {
  for (const input of [
    {batCount: -1}, {batCount: 13}, {batCount: 0.5}, {batCount: '4'},
    {moteCount: -1}, {moteCount: 101}, {moteCount: 1.5}, {moteCount: Number.NaN},
    {fogIntensity: -0.01}, {fogIntensity: 1.01}, {fogIntensity: Number.POSITIVE_INFINITY},
    {windowIntensity: -0.01}, {windowIntensity: 1.01}, {windowIntensity: Number.NaN},
    {moonScale: 0.59}, {moonScale: 1.41}, {moonScale: Number.POSITIVE_INFINITY},
  ]) {
    assert.equal(hauntedMansionLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {batCount: 0, moteCount: 0, fogIntensity: 0, windowIntensity: 0, moonScale: 0.6},
    {batCount: 12, moteCount: 100, fogIntensity: 1, windowIntensity: 1, moonScale: 1.4},
  ]) {
    assert.equal(hauntedMansionLoopSchema.safeParse(input).success, true);
  }
});

test('Mansão: a cena mantém contagens e valores válidos durante o ciclo inclusive nos extremos', () => {
  for (const controls of [
    {batCount: 0, moteCount: 0, fogIntensity: 0, windowIntensity: 0, moonScale: 0.6},
    {batCount: 4, moteCount: 28, fogIntensity: 0.75, windowIntensity: 0.7, moonScale: 1},
    {batCount: 12, moteCount: 100, fogIntensity: 1, windowIntensity: 1, moonScale: 1.4},
  ]) {
    const props = hauntedMansionLoopSchema.parse(controls);
    for (const frame of FRAMES) {
      const scene = getHauntedMansionScene(props, frame, 960);
      const counts = Object.fromEntries(KINDS.map((kind) => [kind, pick(scene, kind).length]));
      assert.deepEqual(counts, {
        star: 48, bat: controls.batCount, mote: controls.moteCount, fog: 5, cloud: 3,
        window: 12, lantern: 2, tree: 2, moon: 1,
      });
      assert.equal(scene.length, 73 + controls.batCount + controls.moteCount);
      for (const element of scene) {
        for (const key of ['x', 'y', 'scale', 'rotation', 'opacity', 'glow', 'flap'] as const) {
          assert.ok(Number.isFinite(element[key]), `${element.kind}.${key}`);
        }
        assert.ok(element.opacity >= 0 && element.opacity <= 1, `${element.kind}: opacidade válida`);
        assert.ok(element.glow >= 0 && element.glow <= 1, `${element.kind}: brilho válido`);
        assert.ok(element.scale > 0, `${element.kind}: escala positiva`);
      }
    }
  }
});

test('Mansão: névoa, luzes e lua respondem aos controles sem reposicionar a cena', () => {
  for (const frame of FRAMES) {
    const off = getHauntedMansionScene(hauntedMansionLoopSchema.parse({fogIntensity: 0, windowIntensity: 0, moonScale: 0.6}), frame, 960);
    const half = getHauntedMansionScene(hauntedMansionLoopSchema.parse({fogIntensity: 0.5, windowIntensity: 0.5, moonScale: 1}), frame, 960);
    const full = getHauntedMansionScene(hauntedMansionLoopSchema.parse({fogIntensity: 1, windowIntensity: 1, moonScale: 1.4}), frame, 960);
    for (const [index, element] of full.entries()) {
      assert.equal(element.kind, off[index]!.kind);
      assert.equal(element.x, off[index]!.x, `${element.kind}: controle alterou x`);
      assert.equal(element.y, off[index]!.y, `${element.kind}: controle alterou y`);
      if (element.kind === 'fog') {
        assert.equal(off[index]!.opacity, 0);
        assert.ok(element.opacity > 0);
        assert.equal(half[index]!.opacity * 2, element.opacity);
      } else if (element.kind === 'window' || element.kind === 'lantern') {
        assert.equal(off[index]!.glow, 0);
        assert.ok(element.glow > 0);
        assert.equal(half[index]!.glow * 2, element.glow);
      } else if (element.kind === 'moon') {
        assert.ok(Math.abs(element.scale / off[index]!.scale - 1.4 / 0.6) < 1e-12);
      } else {
        assert.deepEqual(element, off[index], `${element.kind}: controle alterou outra camada`);
      }
    }
  }
});

test('Mansão: contagens preservam os elementos existentes e as outras camadas', () => {
  for (const frame of [0, 173, 959]) {
    const few = getHauntedMansionScene(hauntedMansionLoopSchema.parse({batCount: 1, moteCount: 1}), frame, 960);
    const manyBats = getHauntedMansionScene(hauntedMansionLoopSchema.parse({batCount: 12, moteCount: 1}), frame, 960);
    const manyMotes = getHauntedMansionScene(hauntedMansionLoopSchema.parse({batCount: 1, moteCount: 100}), frame, 960);
    for (const kind of KINDS) {
      if (kind !== 'bat') assert.deepEqual(pick(manyBats, kind), pick(few, kind), `morcegos alteraram ${kind}`);
      if (kind !== 'mote') assert.deepEqual(pick(manyMotes, kind), pick(few, kind), `partículas alteraram ${kind}`);
    }
    assert.deepEqual(pick(manyBats, 'bat').slice(0, 1), pick(few, 'bat'));
    assert.deepEqual(pick(manyMotes, 'mote').slice(0, 1), pick(few, 'mote'));
  }
});

test('Mansão: o céu fica ancorado enquanto luzes, atmosfera e criaturas se movem', () => {
  const props = hauntedMansionLoopSchema.parse({});
  const scenes = [0, 173, 481, 719].map((frame) => getHauntedMansionScene(props, frame, 960));
  const positions = (scene: HauntedMansionElement[], kind: HauntedMansionElement['kind']) =>
    pick(scene, kind).map(({x, y}) => ({x, y}));
  for (const scene of scenes.slice(1)) {
    for (const kind of ['star', 'window', 'lantern'] as const) {
      assert.deepEqual(positions(scene, kind), positions(scenes[0]!, kind), `${kind}: posição deve ficar ancorada`);
    }
  }
  for (const kind of ['star', 'bat', 'mote', 'fog', 'cloud', 'window', 'lantern', 'tree'] as const) {
    assert.ok(scenes.slice(1).some((scene) =>
      JSON.stringify(pick(scene, kind)) !== JSON.stringify(pick(scenes[0]!, kind))), `${kind}: camada congelada`);
  }
});

test('Mansão: calcular outros frames e seeds não altera parâmetros ou cenas já calculadas', () => {
  const props = hauntedMansionLoopSchema.parse({seed: -2026, batCount: 12, moteCount: 100});
  const originalProps = structuredClone(props);
  const first = getHauntedMansionScene(props, 173, 960);
  const original = structuredClone(first);
  getHauntedMansionScene(props, 721, 960);
  getHauntedMansionScene(hauntedMansionLoopSchema.parse({seed: 19}), 173, 960);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(first, original);
  assert.deepEqual(getHauntedMansionScene(props, 173, 960), original);
});

test('Mansão: o export preserva resolução, duração e a regra de alpha do preview', () => {
  for (const format of ['mp4', 'webm', 'gif'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'HauntedMansionLoop', format, props: {transparent}});
      const metadata = getCompositionMetadata(resolved.props);
      assert.equal(resolved.props.backgroundColor, '#0E1520');
      assert.equal(resolved.props.durationSeconds, 16);
      assert.deepEqual(metadata, {
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
