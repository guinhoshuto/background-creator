import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {resolveExport} from '../scripts/export';
import {
  CENTER_X, CENTER_Y, RAY_LENGTH, getMaxHalfWidth, getRayField, getSunburstScene, sunburstLoopSchema,
  type SunburstLoopProps,
} from '../src/backgrounds/SunburstLoop';
import {createSeededRandom, randomBetween, TAU} from '../src/loop';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

/** The scene's own seeded wave placement, rebuilt here so the field can be probed directly. */
const getWaveOffset = (props: SunburstLoopProps) => {
  const random = createSeededRandom(props.seed + 137);
  randomBetween(random, 0, 360 / props.rayCount);
  return randomBetween(random, 0, TAU);
};

const FRAMES = [0, 1, 97, 173, 300, 451, 599];

/** Perceived brightness of a #RRGGBB colour, on the same 0–255 scale as its channels. */
const luminance = (color: string) => {
  const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
  return 0.299 * red! + 0.587 * green! + 0.114 * blue!;
};
const PRESETS = [
  'sunburst-crimson.json', 'sunburst-sand.json', 'sunburst-ocean.json', 'sunburst-moss.json',
];

test('Sunburst: os valores iniciais descrevem dez segundos de leque vermelho', () => {
  const props = sunburstLoopSchema.parse({});
  assert.equal(props.durationSeconds, 10);
  assert.equal(props.seed, 23);
  assert.equal(props.rayCount, 20);
  assert.equal(props.rayWidth, 0.5);
  assert.equal(props.swirl, 0.5);
  assert.equal(props.spin, 3);
  assert.equal(props.coreFade, 0.7);
  assert.equal(props.coreShade, 0.6);
  assert.equal(props.backgroundColor, '#5A0F18');
  assert.deepEqual(props.colors, ['#9E1A26', '#C42A36']);
  assert.deepEqual(getCompositionMetadata(props), {
    width: 1920, height: 1080, fps: 60, durationInFrames: 600,
  });
});

test('Sunburst: a cena mantém as contagens e valores visuais válidos durante o ciclo', () => {
  for (const rayCount of [6, 20, 48]) {
    const props = sunburstLoopSchema.parse({rayCount});
    for (const frame of FRAMES) {
      const scene = getSunburstScene(props, frame, 600);
      assert.equal(scene.length, rayCount + 2);
      assert.equal(scene.filter(({kind}) => kind === 'ray').length, rayCount);
      assert.equal(scene.filter(({kind}) => kind === 'shade').length, 1);
      assert.equal(scene.filter(({kind}) => kind === 'core').length, 1);
      for (const item of scene) {
        for (const key of ['angle', 'halfWidth', 'radius', 'opacity', 'variant'] as const) {
          assert.ok(Number.isFinite(item[key]), `${item.kind}.${key}`);
        }
        assert.ok(item.opacity >= 0 && item.opacity <= 1, `${item.kind}: opacidade válida`);
        assert.ok(item.radius > 0, `${item.kind}: raio positivo`);
        assert.ok(item.variant >= 0 && item.variant < props.colors.length, `${item.kind}: cor da paleta`);
      }
    }
  }
});

test('Sunburst: os raios nunca se encostam e sempre ultrapassam os cantos do quadro', () => {
  // Half the diagonal: a ray shorter than this would leave the corners uncovered.
  const cornerDistance = Math.hypot(CENTER_X, CENTER_Y);
  for (const extreme of [
    {rayCount: 6, rayWidth: 0.8, swirl: 1, spin: 24},
    {rayCount: 20, rayWidth: 0.8, swirl: 1, spin: 0},
    {rayCount: 48, rayWidth: 0.8, swirl: 1, spin: -24},
    {rayCount: 47, rayWidth: 0.15, swirl: 0, spin: 1},
  ]) {
    const props = sunburstLoopSchema.parse({...extreme, seed: 2026});
    const step = 360 / props.rayCount;
    const maxHalfWidth = getMaxHalfWidth(props);
    assert.ok(maxHalfWidth * 2 < step, `${props.rayCount} raios: o vão some`);
    for (const frame of [0, 1, 53, 199, 377, 599]) {
      const rays = getSunburstScene(props, frame, 600).filter(({kind}) => kind === 'ray');
      for (let index = 0; index < rays.length; index++) {
        const ray = rays[index]!;
        const next = rays[(index + 1) % rays.length]!;
        assert.ok(ray.halfWidth > 0 && ray.halfWidth <= maxHalfWidth, `raio ${index}: espessura dentro do limite`);
        assert.ok(ray.halfWidth + next.halfWidth < step, `raios ${index} e ${index + 1} encostaram`);
        // The arc closes the wedge, so the whole outer edge stays at this distance.
        assert.ok(ray.radius > cornerDistance, `raio ${index}: não alcança os cantos`);
        assert.equal(ray.radius, RAY_LENGTH);
      }
      // The fan swings as one piece: the step between neighbours never changes.
      for (let index = 1; index < rays.length; index++) {
        assert.ok(Math.abs(rays[index]!.angle - rays[index - 1]!.angle - step) < 1e-9, 'passo irregular');
      }
    }
  }
});

test('Sunburst: o leque gira para um lado só, com velocidade constante', () => {
  for (const spin of [3, 1, -2, 24]) {
    const props = sunburstLoopSchema.parse({spin, rayCount: 20});
    const step = 360 / props.rayCount;
    const leadAngle = (frame: number) =>
      getSunburstScene(props, frame, 600).find(({kind}) => kind === 'ray')!.angle;
    const perFrame = leadAngle(1) - leadAngle(0);
    // Um ciclo inteiro avança exatamente `spin` passos: é isso que devolve a mesma imagem.
    assert.ok(Math.abs(perFrame * 600 - spin * step) < 1e-9, `${spin}: avanço por ciclo`);
    for (let frame = 0; frame < 600; frame += 29) {
      // Sem parada, sem volta e sem acelerar: o mesmo avanço em qualquer ponto do ciclo.
      assert.ok(Math.abs(leadAngle(frame + 1) - leadAngle(frame) - perFrame) < 1e-9, `frame ${frame}`);
      assert.equal(Math.sign(leadAngle(frame + 1) - leadAngle(frame)), Math.sign(spin), `frame ${frame}: lado`);
    }
    // E o frame seguinte ao último é o primeiro de novo.
    assert.deepEqual(getSunburstScene(props, 600, 600), getSunburstScene(props, 0, 600));
  }
  // Parado é parado: spin zero não deixa o leque escorregar para lado nenhum.
  const still = sunburstLoopSchema.parse({spin: 0});
  const angles = (frame: number) =>
    getSunburstScene(still, frame, 600).filter(({kind}) => kind === 'ray').map(({angle}) => angle);
  for (const frame of FRAMES) assert.deepEqual(angles(frame), angles(0));
});

test('Sunburst: na emenda a imagem continua, mesmo com o raio trocando de lugar', () => {
  const normalizedStep = 1e-6;
  for (const spin of [3, -2]) {
    for (const seed of [23, -7]) {
      const props = sunburstLoopSchema.parse({spin, seed});
      const waveOffset = getWaveOffset(props);
      // O que dura na emenda é o campo: o que um lugar do quadro pede a quem chegar nele.
      for (const angle of [0, 37.5, 180, 359]) {
        const field = (phase: number) => getRayField(props, angle, phase, waveOffset);
        const beginning = field(0);
        const before = field(TAU * (1 - normalizedStep));
        const after = field(TAU * normalizedStep);
        for (const key of ['halfWidth', 'opacity'] as const) {
          const leftVelocity = (beginning[key] - before[key]) / normalizedStep;
          const rightVelocity = (after[key] - beginning[key]) / normalizedStep;
          assert.ok(Math.abs(leftVelocity - rightVelocity) < 0.1 + Math.abs(leftVelocity) * 0.001,
            `${angle}°.${key}: ${leftVelocity} contra ${rightVelocity}`);
        }
      }
      // E o raio que chega ao lugar do vizinho chega com a forma daquele lugar.
      const last = getSunburstScene(props, 600 * (1 - normalizedStep), 600)
        .filter(({kind}) => kind === 'ray');
      const first = getSunburstScene(props, 0, 600).filter(({kind}) => kind === 'ray');
      for (let index = 0; index < first.length; index++) {
        const arriving = last[index]!;
        const leaving = first[(index + spin + first.length * 2) % first.length]!;
        assert.ok(Math.abs(arriving.halfWidth - leaving.halfWidth) < 1e-3, `raio ${index}: espessura na emenda`);
        assert.ok(Math.abs(arriving.opacity - leaving.opacity) < 1e-3, `raio ${index}: opacidade na emenda`);
      }
    }
  }
});

test('Sunburst: com os controles de movimento em zero a cena continua avançando', () => {
  const frozen = sunburstLoopSchema.parse({swirl: 0, spin: 0, coreShade: 0});
  assert.notDeepEqual(getSunburstScene(frozen, 0, 600), getSunburstScene(frozen, 599, 600));
  for (const frame of FRAMES) {
    for (const item of getSunburstScene(frozen, frame, 600)) {
      assert.ok(item.radius > 0 && item.opacity >= 0 && item.opacity <= 1);
      if (item.kind !== 'ray') assert.equal(item.opacity, 0, 'coreShade zero deve apagar a sombra do miolo');
    }
  }
});

test('Sunburst: calcular frames não altera os parâmetros nem resultados anteriores', () => {
  const props = sunburstLoopSchema.parse({seed: -2026, rayCount: 33});
  const originalProps = structuredClone(props);
  const firstScene = getSunburstScene(props, 173, 600);
  const originalScene = structuredClone(firstScene);
  getSunburstScene(props, 451, 600);
  getSunburstScene(sunburstLoopSchema.parse({seed: 19}), 173, 600);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(firstScene, originalScene);
  assert.deepEqual(getSunburstScene(props, 173, 600), originalScene);
});

test('Sunburst: as quatro variações de cor compartilham o schema e mudam só a paleta', () => {
  const variations = PRESETS.map((filename) => {
    const raw: unknown = JSON.parse(readFileSync(new URL(`../presets/${filename}`, import.meta.url), 'utf8'));
    return {filename, props: sunburstLoopSchema.strict().parse(raw)};
  });
  const palettes = new Set<string>();
  for (const {filename, props} of variations) {
    assert.ok(props.colors.length >= 2, `${filename}: paleta com pelo menos duas cores`);
    palettes.add(`${props.backgroundColor}|${props.colors.join(',')}`);
    // Two tones of one family: the ray separates from the gap without cutting it.
    for (const color of props.colors) {
      const distance = Math.abs(luminance(color) - luminance(props.backgroundColor));
      assert.ok(distance >= 15, `${filename}: ${color} desaparece no fundo`);
      assert.ok(distance <= 70, `${filename}: ${color} contrasta demais com o fundo`);
    }
    for (const frame of FRAMES) {
      const scene = getSunburstScene(props, frame, 600);
      assert.equal(scene.length, props.rayCount + 2, filename);
      assert.ok(scene.every(({opacity, radius}) => opacity >= 0 && opacity <= 1 && radius > 0), filename);
    }
  }
  assert.equal(palettes.size, PRESETS.length, 'as variações precisam ter paletas diferentes');
});

test('Sunburst: o export mantém a regra de alpha e a duração compartilhadas com o preview', () => {
  for (const format of ['mp4', 'webm', 'gif'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'SunburstLoop', format, props: {transparent}});
      const metadata = getCompositionMetadata(resolved.props);
      assert.equal(resolved.props.backgroundColor, '#5A0F18');
      assert.equal(resolved.props.durationSeconds, 10);
      assert.equal(metadata.durationInFrames, format === 'gif' ? 500 : 600);
      assert.equal(hasTransparentBackground(resolved.props), format === 'webm' && transparent);
    }
  }
});
