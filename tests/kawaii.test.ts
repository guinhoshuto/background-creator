import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveExport} from '../scripts/export';
import {
  DRAWN, getContentBox, getFamilyWeights, getKawaiiScene, kawaiiLoopSchema,
  maxFamilyRadius, reachOf,
} from '../src/backgrounds/KawaiiLoop';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

const FRAMES = [0, 1, 90, 173, 359, 540, 719];
const NUMERIC = ['x', 'y', 'scale', 'size', 'squashX', 'squashY', 'rotation', 'opacity', 'gloss', 'variant', 'voice', 'group'] as const;

/** Meia-extensão desenhada de uma peça, sem a deriva: é o que ocupa pixel na tela. */
const drawnHalf = (item: ReturnType<typeof getKawaiiScene>[number]) => {
  const unit = item.kind === 'cloud' ? item.scale * 100 : item.size;
  return {x: DRAWN[item.kind].x * unit * 1.05, y: DRAWN[item.kind].y * unit * 1.05};
};

test('Kawaii: os valores iniciais descrevem um doze segundos pastel', () => {
  const props = kawaiiLoopSchema.parse({});
  assert.equal(props.durationSeconds, 12);
  assert.equal(props.seed, 7, 'a seed inicial precisa bater com o preset, o Root e o README');
  assert.equal(props.familyCount, 5);
  assert.equal(props.familyScale, 1);
  assert.equal(props.centerClearance, 0.5);
  assert.equal(props.drift, 0.55);
  assert.equal(props.sparkleTrail, 2);
  assert.equal(props.backgroundColor, '#FFF7F4');
  assert.deepEqual(props.colors, ['#F7C8D8', '#FFE6BC', '#BFE3DC']);
  assert.deepEqual(getCompositionMetadata(props), {
    width: 1920, height: 1080, fps: 60, durationInFrames: 720,
  });
});

test('Kawaii: os controles rejeitam valores inválidos e aceitam os limites documentados', () => {
  for (const input of [
    {familyCount: 1}, {familyCount: 7}, {familyCount: 2.5}, {familyCount: '5'},
    {familyScale: 0.69}, {familyScale: 1.41}, {familyScale: Number.NaN},
    {centerClearance: -0.01}, {centerClearance: 1.01},
    {drift: -0.01}, {drift: 1.01}, {drift: Number.POSITIVE_INFINITY},
    {sparkleTrail: -1}, {sparkleTrail: 5}, {sparkleTrail: 1.5},
  ]) {
    assert.equal(kawaiiLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {familyCount: 2, familyScale: 0.7, centerClearance: 0, drift: 0, sparkleTrail: 0},
    {familyCount: 6, familyScale: 1.4, centerClearance: 1, drift: 1, sparkleTrail: 4},
  ]) {
    assert.equal(kawaiiLoopSchema.safeParse(input).success, true);
  }
});

test('Kawaii: a cena mantém contagens e valores visuais válidos durante o ciclo', () => {
  for (const [familyCount, sparkleTrail, expected] of [[2, 0, 7], [5, 2, 26], [6, 4, 42]] as const) {
    const props = kawaiiLoopSchema.parse({familyCount, sparkleTrail});
    for (const frame of FRAMES) {
      const scene = getKawaiiScene(props, frame, 720);
      assert.equal(scene.length, expected, `${familyCount} grupos com rastro ${sparkleTrail}`);
      for (const item of scene) {
        for (const key of NUMERIC) {
          assert.ok(Number.isFinite(item[key]), `${item.kind}.${key}`);
        }
        assert.ok(item.opacity >= 0 && item.opacity <= 1, `${item.kind}: opacidade válida`);
        assert.ok(item.gloss >= 0 && item.gloss <= 1, `${item.kind}: brilho válido`);
        assert.ok(item.scale > 0 && item.size > 0, `${item.kind}: tamanho positivo`);
        assert.ok(item.squashX > 0 && item.squashY > 0, `${item.kind}: deformação positiva`);
        assert.ok(Number.isInteger(item.variant) && item.variant >= 0 && item.variant <= 2,
          `${item.kind}: variant fora da faixa desenhável (${item.variant})`);
      }
    }
  }
});

test('Kawaii: os limites dos controles mantêm a cena válida', () => {
  for (const extreme of [
    {familyCount: 2, familyScale: 0.7, centerClearance: 0, drift: 0, sparkleTrail: 0},
    {familyCount: 6, familyScale: 1.4, centerClearance: 1, drift: 1, sparkleTrail: 4},
    {familyCount: 6, familyScale: 1.4, centerClearance: 0, drift: 1, sparkleTrail: 4},
  ]) {
    const props = kawaiiLoopSchema.parse(extreme);
    for (const frame of FRAMES) {
      for (const item of getKawaiiScene(props, frame, 720)) {
        assert.ok(item.opacity >= 0 && item.opacity <= 1, `opacidade em ${JSON.stringify(extreme)}`);
        assert.ok(item.scale > 0 && item.size > 0 && item.squashX > 0 && item.squashY > 0,
          `tamanho em ${JSON.stringify(extreme)}`);
      }
    }
  }
});

test('Kawaii: o retângulo reservado tem as medidas que o README publica', () => {
  assert.deepEqual(getContentBox(0), {halfWidth: 430, halfHeight: 250});
  assert.deepEqual(getContentBox(1), {halfWidth: 640, halfHeight: 345});
  assert.deepEqual(getContentBox(0.5), {halfWidth: 535, halfHeight: 297.5});
});

test('Kawaii: o orçamento de alcance cobre a órbita além do desenho', () => {
  // A deriva máxima é o plano mais adiantado (1,7) vezes a maior amplitude escrita na cena.
  const maxOrbit = {x: 15 * 1.7, y: 10 * 1.7};
  for (const kind of ['cloud', 'heart', 'star'] as const) {
    const reach = reachOf(kind, 100);
    assert.ok(reach.x >= DRAWN[kind].x * 100 * 1.05 + maxOrbit.x, `${kind}: alcance em x`);
    assert.ok(reach.y >= DRAWN[kind].y * 100 * 1.05 + maxOrbit.y, `${kind}: alcance em y`);
  }
  // O corredor precisa caber a maior peça dos dois lados, em qualquer folga pedida.
  for (const centerClearance of [0, 0.25, 0.5, 0.75, 1]) {
    const box = getContentBox(centerClearance);
    const widest = reachOf('cloud', maxFamilyRadius(centerClearance));
    assert.ok(box.halfWidth + 2 * widest.x <= 960 + 1e-9, `folga ${centerClearance}: não cabe em 1920`);
    assert.ok(box.halfHeight + 2 * widest.y <= 540 + 1e-9, `folga ${centerClearance}: não cabe em 1080`);
  }
});

test('Kawaii: o miolo reservado fica vazio em qualquer seed, fase e controle', () => {
  for (const seed of [-31, -1, 1, 7, 2026]) {
    for (const centerClearance of [0, 0.5, 1]) {
      for (const familyScale of [0.7, 1, 1.4]) {
        const props = kawaiiLoopSchema.parse({
          seed, centerClearance, familyScale, familyCount: 6, sparkleTrail: 4, drift: 1,
        });
        const box = getContentBox(centerClearance);
        for (let frame = 0; frame < 720; frame += 15) {
          for (const item of getKawaiiScene(props, frame, 720)) {
            const half = drawnHalf(item);
            const clearsX = Math.abs(item.x - 960) - half.x > box.halfWidth;
            const clearsY = Math.abs(item.y - 540) - half.y > box.halfHeight;
            assert.ok(clearsX || clearsY,
              `${item.kind} invadiu o miolo em (${item.x}, ${item.y}) — seed ${seed}, folga ${centerClearance}, escala ${familyScale}`);
          }
        }
      }
    }
  }
});

test('Kawaii: nenhuma peça é cortada pela borda do quadro', () => {
  for (const centerClearance of [0, 0.5, 1]) {
    for (const familyScale of [0.7, 1, 1.4]) {
      const props = kawaiiLoopSchema.parse({
        centerClearance, familyScale, familyCount: 6, sparkleTrail: 4, drift: 1,
      });
      for (let frame = 0; frame < 720; frame += 15) {
        for (const item of getKawaiiScene(props, frame, 720)) {
          const half = drawnHalf(item);
          assert.ok(item.x - half.x >= 0 && item.x + half.x <= 1920,
            `${item.kind} saiu pela lateral em x ${item.x}`);
          assert.ok(item.y - half.y >= 0 && item.y + half.y <= 1080,
            `${item.kind} saiu por cima ou por baixo em y ${item.y}`);
        }
      }
    }
  }
});

test('Kawaii: a seed muda o baile, nunca o arranjo', () => {
  // É a inversão que separa composição de distribuição: a tabela de âncoras manda no layout,
  // e a seed só escolhe em que momento do ciclo cada grupo está.
  const props = (seed: number) => kawaiiLoopSchema.parse({seed});
  const shapeOf = (seed: number) =>
    getKawaiiScene(props(seed), 0, 720).map(({kind, variant, voice, group}) => ({kind, variant, voice, group}));
  assert.deepEqual(shapeOf(2026), shapeOf(7), 'a seed não pode trocar quem é quem no arranjo');

  const homes = (seed: number) => {
    const still = kawaiiLoopSchema.parse({seed, drift: 0});
    return getKawaiiScene(still, 0, 720).map(({x, y}) => ({x: Math.round(x), y: Math.round(y)}));
  };
  assert.deepEqual(homes(2026), homes(7), 'sem deriva, seeds diferentes desenham as mesmas casas');
  assert.notDeepEqual(getKawaiiScene(props(2026), 0, 720), getKawaiiScene(props(7), 0, 720));
});

test('Kawaii: o vão que antecede o grupo decide o peso dele', () => {
  const weights = getFamilyWeights(5);
  assert.equal(weights.length, 5);
  assert.ok(weights.every((weight) => weight >= 0.54 && weight <= 1));
  // O grupo 0 fica depois da maior lacuna angular — é a pausa da composição, e por isso
  // ele é a nota mais pesada do quadro.
  assert.equal(weights.indexOf(Math.max(...weights)), 0);
  for (const familyCount of [2, 3, 4, 5, 6]) {
    const scaled = getFamilyWeights(familyCount);
    assert.equal(scaled.length, familyCount);
    assert.ok(scaled.every((weight) => Number.isFinite(weight) && weight > 0));
  }
});

test('Kawaii: o quadro fica equilibrado em qualquer contagem de grupos', () => {
  for (const familyCount of [2, 3, 4, 5, 6]) {
    const props = kawaiiLoopSchema.parse({familyCount});
    const scene = getKawaiiScene(props, 0, 720);
    let weight = 0;
    let momentX = 0;
    let momentY = 0;
    for (const item of scene) {
      const half = drawnHalf(item);
      const area = half.x * half.y;
      weight += area;
      momentX += area * (item.x - 960);
      momentY += area * (item.y - 540);
    }
    // O centro de massa é conferido por número, não no olho. A tabela é ordenada em pares
    // opostos: a partir de quatro grupos o quadro fecha quase no centro, e com dois ou três
    // sobra uma inclinação deliberada, que é diagonal e não desequilíbrio.
    const limit = familyCount >= 4 ? 0.08 : 0.2;
    assert.ok(Math.abs(momentX / weight) < 960 * limit, `${familyCount} grupos: peso torto em x`);
    assert.ok(Math.abs(momentY / weight) < 540 * limit, `${familyCount} grupos: peso torto em y`);
  }
});

test('Kawaii: a deriva responde ao controle sem congelar a cena', () => {
  const still = kawaiiLoopSchema.parse({drift: 0});
  const moving = kawaiiLoopSchema.parse({drift: 1});
  const at = (props: ReturnType<typeof kawaiiLoopSchema.parse>, frame: number) =>
    getKawaiiScene(props, frame, 720).map(({x, y}) => `${x.toFixed(4)}:${y.toFixed(4)}`).join('|');
  assert.equal(at(still, 0), at(still, 360), 'drift 0 precisa parar o deslocamento');
  assert.notEqual(at(moving, 0), at(moving, 360));
  // Mesmo parado, o quadro continua vivo: respiração, giro e brilho não dependem do controle.
  assert.notDeepEqual(getKawaiiScene(still, 0, 720), getKawaiiScene(still, 719, 720));
});

test('Kawaii: mudar a contagem de grupos não reorganiza os grupos que já estavam', () => {
  const few = getKawaiiScene(kawaiiLoopSchema.parse({familyCount: 3}), 173, 720);
  const many = getKawaiiScene(kawaiiLoopSchema.parse({familyCount: 6}), 173, 720);
  assert.deepEqual(many.filter(({group}) => group < 3), few);
});

test('Kawaii: calcular frames não altera os parâmetros nem resultados anteriores', () => {
  const props = kawaiiLoopSchema.parse({seed: -2026, familyCount: 6, sparkleTrail: 4});
  const originalProps = structuredClone(props);
  const firstScene = getKawaiiScene(props, 173, 720);
  const originalScene = structuredClone(firstScene);
  getKawaiiScene(props, 600, 720);
  getKawaiiScene(kawaiiLoopSchema.parse({seed: 19}), 173, 720);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(firstScene, originalScene);
  assert.deepEqual(getKawaiiScene(props, 173, 720), originalScene);
});

test('Kawaii: o export mantém a regra de alpha e a duração compartilhadas com o preview', () => {
  for (const format of ['mp4', 'webm', 'gif'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'KawaiiLoop', format, props: {transparent}});
      const metadata = getCompositionMetadata(resolved.props);
      assert.equal(resolved.props.backgroundColor, '#FFF7F4');
      assert.equal(resolved.props.durationSeconds, 12);
      assert.equal(metadata.durationInFrames, format === 'gif' ? 600 : 720);
      assert.equal(hasTransparentBackground(resolved.props), format === 'webm' && transparent);
      if (format === 'webm') {
        assert.equal(resolved.preset.codec, 'vp9');
        assert.equal('pixelFormat' in resolved.preset && resolved.preset.pixelFormat,
          transparent ? 'yuva420p' : 'yuv420p');
      }
    }
  }
});
