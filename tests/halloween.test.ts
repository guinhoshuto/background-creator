import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveExport} from '../scripts/export';
import {getHalloweenScene, halloweenLoopSchema} from '../src/backgrounds/HalloweenLoop';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

test('Halloween: os valores iniciais descrevem uma noite de doze segundos', () => {
  const props = halloweenLoopSchema.parse({});
  assert.equal(props.durationSeconds, 12);
  assert.equal(props.batCount, 7);
  assert.equal(props.emberCount, 36);
  assert.equal(props.fogIntensity, 0.6);
  assert.equal(props.moonScale, 1);
  assert.equal(props.backgroundColor, '#120E20');
  assert.deepEqual(props.colors, ['#9B85C9', '#F7DCA6', '#ED792D']);
  assert.deepEqual(getCompositionMetadata(props), {
    width: 1920, height: 1080, fps: 60, durationInFrames: 720,
  });
});

test('Halloween: os controles rejeitam valores inválidos e aceitam os limites documentados', () => {
  for (const input of [
    {batCount: -1}, {batCount: 19}, {batCount: 0.5}, {batCount: '7'},
    {emberCount: -1}, {emberCount: 121}, {emberCount: 1.5},
    {fogIntensity: -0.01}, {fogIntensity: 1.01}, {fogIntensity: Number.NaN},
    {moonScale: 0.49}, {moonScale: 1.51}, {moonScale: Number.POSITIVE_INFINITY},
  ]) {
    assert.equal(halloweenLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {batCount: 0, emberCount: 0, fogIntensity: 0, moonScale: 0.5},
    {batCount: 18, emberCount: 120, fogIntensity: 1, moonScale: 1.5},
  ]) {
    assert.equal(halloweenLoopSchema.safeParse(input).success, true);
  }
});

test('Halloween: a cena preserva as contagens e valores visuais válidos durante o ciclo', () => {
  for (const [batCount, emberCount] of [[0, 0], [7, 36], [18, 120]] as const) {
    const props = halloweenLoopSchema.parse({batCount, emberCount});
    for (const frame of [0, 1, 90, 180, 359, 540, 719]) {
      const scene = getHalloweenScene(props, frame, 720);
      assert.equal(scene.length, 76 + batCount + emberCount);
      const counts = Object.fromEntries(
        ['star', 'bat', 'ember', 'fog', 'pumpkin', 'tree', 'moon'].map((kind) => [
          kind, scene.filter((element) => element.kind === kind).length,
        ]),
      );
      assert.deepEqual(counts, {star: 64, bat: batCount, ember: emberCount, fog: 5, pumpkin: 4, tree: 2, moon: 1});
      for (const element of scene) {
        for (const key of ['x', 'y', 'scale', 'rotation', 'opacity', 'glow', 'flap'] as const) {
          assert.equal(typeof element[key], 'number', `${element.kind}.${key}`);
          assert.ok(Number.isFinite(element[key]), `${element.kind}.${key}`);
        }
        assert.ok(element.opacity >= 0 && element.opacity <= 1, `${element.kind}: opacidade válida`);
        assert.ok(element.scale > 0, `${element.kind}: escala positiva`);
      }
    }
  }
});

test('Halloween: intensidade da névoa e tamanho da lua alteram a cena', () => {
  for (const frame of [0, 180, 360, 719]) {
    const withoutFog = getHalloweenScene(halloweenLoopSchema.parse({fogIntensity: 0}), frame, 720);
    const fullFog = getHalloweenScene(halloweenLoopSchema.parse({fogIntensity: 1}), frame, 720);
    assert.ok(withoutFog.filter(({kind}) => kind === 'fog').every(({opacity}) => opacity === 0));
    assert.ok(fullFog.filter(({kind}) => kind === 'fog').some(({opacity}) => opacity > 0));

    const smallMoon = getHalloweenScene(halloweenLoopSchema.parse({moonScale: 0.5}), frame, 720).find(({kind}) => kind === 'moon');
    const largeMoon = getHalloweenScene(halloweenLoopSchema.parse({moonScale: 1.5}), frame, 720).find(({kind}) => kind === 'moon');
    assert(smallMoon && largeMoon);
    assert.ok(largeMoon.scale > smallMoon.scale);
  }
});

test('Halloween: calcular frames não altera os parâmetros nem resultados anteriores', () => {
  const props = halloweenLoopSchema.parse({seed: -2026, batCount: 18, emberCount: 120});
  const originalProps = structuredClone(props);
  const firstScene = getHalloweenScene(props, 173, 720);
  const originalScene = structuredClone(firstScene);
  getHalloweenScene(props, 600, 720);
  getHalloweenScene(halloweenLoopSchema.parse({seed: 19}), 173, 720);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(firstScene, originalScene);
  assert.deepEqual(getHalloweenScene(props, 173, 720), originalScene);
});

test('Halloween: o export mantém a regra de alpha e a duração compartilhadas com o preview', () => {
  for (const format of ['mp4', 'webm', 'gif'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'HalloweenLoop', format, props: {transparent}});
      const metadata = getCompositionMetadata(resolved.props);
      assert.equal(resolved.props.backgroundColor, '#120E20');
      assert.equal(resolved.props.durationSeconds, 12);
      assert.equal(metadata.durationInFrames, format === 'gif' ? 600 : 720);
      assert.equal(hasTransparentBackground(resolved.props), format === 'webm' && transparent);
      if (format === 'webm') {
        assert.equal(resolved.preset.codec, 'vp9');
        assert.equal('pixelFormat' in resolved.preset && resolved.preset.pixelFormat, transparent ? 'yuva420p' : 'yuv420p');
      }
    }
  }
});
