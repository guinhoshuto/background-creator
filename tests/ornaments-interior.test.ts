import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {getHauntedInteriorScene, hauntedInteriorLoopSchema} from '../src/backgrounds/HauntedInteriorLoop';
import {flamePathOf} from '../src/backgrounds/halloween/hauntedInteriorGeometry';
import {getBordaGeometry} from '../src/overlays/border';
import {
  cornerSlot, harmonics, rectDistance, roomAt, roundRectSdf, type OrnamentElement, type OrnamentFrame, type OrnamentPlacement,
} from '../src/overlays/shared';
import {CANDLE_COLORS, CANDLE_HZ, interiorSet, STRIKE_LIGHT, TASSEL_HZ} from '../src/overlays/shared/ornaments/sets/interior';
import {candleBounds, candleHeight, candlePoints, FLICKER, flamePath, num} from '../src/overlays/shared/ornaments/sets/interior-candle';
import {FIXTURE_MARGIN, fixtureBounds, fixturePoints, FIXTURES} from '../src/overlays/shared/ornaments/sets/interior-girandole';
import {
  candleOf, fixtureOf, fixtureOrigin, footOf, GIRANDOLE_MIN, PARTNER_SHARE, scaleOf, SIDE_SPACING, TOP_SPACING,
} from '../src/overlays/shared/ornaments/sets/interior-place';
import {SWAG, SWAG_CORNER, SWAG_MOTIF, SWAG_TASSEL, swagLine, swagPoints} from '../src/overlays/shared/ornaments/sets/interior-swag';
import {getSize, sizeProps, NAMED_SIZES, type NamedSize} from '../src/sizes';
import {kitProps, ORNAMENT_KINDS, packItemProps, unscaledItemProps, type OrnamentKindName} from './helpers/ornament-kinds';

/**
 * The interior set's own guarantees (the shared harness, tests/helpers/ornament-harness.ts, checks the
 * contract): which fixtures stand where at every named size and how much of their room they use,
 * the hero pose at frame 0, whole harmonics at any duration, the constants taken from the
 * background, and that nothing drawn reaches a text area, the window or another fixture.
 */

const preset = (kind: OrnamentKindName) =>
  JSON.parse(readFileSync(new URL(`../presets/${kind}-halloween-interior.json`, import.meta.url), 'utf8')) as Record<string, unknown>;
/**
 * The band the screen frames were tuned for (rounder corners, a wider band). The pack renders the
 * telas only without ornaments; these props keep the set's screen-frame behaviour tested.
 */
const TELA_PROPS = {radius: 48, thickness: 24};

/**
 * The kit's layout at a size at its own px: the preset and the pack item's props, without the
 * pack's scale on the large frames (packLayout), TELA_PROPS on the telas, then extra props.
 */
const kitLayout = (size: NamedSize, extra: Record<string, unknown> = {}) => {
  const adapter = ORNAMENT_KINDS[size.kind as OrnamentKindName];
  const item = unscaledItemProps('halloween-interior', size.id);
  const tela = size.props?.fit === 'tela' ? TELA_PROPS : {};
  const props = adapter.parse({...preset(size.kind as OrnamentKindName), ...item, ...sizeProps(size), ...tela, ...extra});
  return {props, ...adapter.ornamentLayout(props)};
};
/** The kit exactly as the pack renders it (packs/halloween-interior.json), scale included. */
const packLayout = (size: NamedSize) => {
  const adapter = ORNAMENT_KINDS[size.kind as OrnamentKindName];
  const props = adapter.parse(kitProps('halloween-interior', size));
  return {adapter, props, ...adapter.ornamentLayout(props)};
};
/** The kind defaults' layout (no kit). */
const neutralLayout = (size: NamedSize, extra: Record<string, unknown> = {}) => {
  const adapter = ORNAMENT_KINDS[size.kind as OrnamentKindName];
  const props = adapter.parse({ornaments: 'interior', ...extra, ...sizeProps(size)});
  return {props, ...adapter.ornamentLayout(props)};
};

const motifs = (placements: readonly OrnamentPlacement[]) => placements.map((placement) => `${placement.motif}@${placement.slot}`);
const HEROES = ['candelabro-3', 'candelabro-2', 'candelabro-3-pe', 'vela-alta'];

test('ornaments interior: o herói está em todos os 27 tamanhos, com o kit, sem ele e nos ornamentSize extremos', () => {
  assert.equal(NAMED_SIZES.length, 27);
  for (const size of NAMED_SIZES) {
    for (const layout of [kitLayout(size), kitLayout(size, {ornamentSize: 12}), kitLayout(size, {ornamentSize: 256}), neutralLayout(size), neutralLayout(size, {ornamentSize: 12})]) {
      const hero = layout.placements[0];
      assert.ok(hero && HEROES.includes(hero.motif), `${size.id}: herói ${hero?.motif}`);
      for (const placement of layout.placements) assert.equal(placement.layer, 'front', size.id);
    }
  }
});

test('ornaments interior: quais peças ficam onde em cada classe de tamanho (kit)', () => {
  const expect = (id: string, expected: string[], extra: Record<string, unknown> = {}) =>
    assert.deepEqual(motifs(kitLayout(getSize(id), extra).placements), expected, `${id} ${JSON.stringify(extra)}`);
  const corners = ['candelabro-3@TR', 'candelabro-2@TL'];
  for (const id of ['chat-compacto', 'chat-padrao', 'chat-alto', 'chat-coluna', 'chat-vertical', 'cartao', 'quadrado', 'lista']) expect(id, corners);
  for (const id of ['webcam-16x9', 'webcam-4x3', 'webcam-quadrada', 'webcam-vertical', 'webcam-redonda-p', 'webcam-redonda', 'webcam-redonda-g']) expect(id, corners);
  // Wide blocks and windows (AD round 3): the red-velvet swag valance along the bottom, a festoon
  // every 40 px (blocks) or 38 px (windows): faixa and titulo 28, webcam-16x9-g 24, jogo 36.
  const swags = (count: number, slot = 'bottom') => Array(count).fill(`${SWAG_MOTIF}@${slot}`) as string[];
  for (const id of ['faixa', 'titulo']) expect(id, [...corners, ...swags(28)]);
  // Wide windows: the top-centre girandole on its foot, two-light wall girandoles 320 px apart up
  // both sides, and on the jogo two-light girandoles on the top rail at ±400 px.
  expect('webcam-16x9-g', [...corners, 'candelabro-3-pe@top', 'arandela@right', 'arandela@left', ...swags(24)]);
  expect('jogo', [
    ...corners, 'candelabro-3-pe@top', 'arandela@right', 'arandela@left', 'arandela@right', 'arandela@left',
    'candelabro-2-pe@top', 'candelabro-2-pe@top', ...swags(36),
  ]);
  // Labels: one two-light girandole.
  for (const id of ['etiqueta-p', 'etiqueta']) expect(id, ['candelabro-2@TR']);
  // Round blocks: the left accent arc sends the partner to the right side; circulo-p is too small for two.
  expect('circulo-p', ['candelabro-3@TR']);
  for (const id of ['circulo', 'circulo-g']) {
    expect(id, ['candelabro-3@TR', 'candelabro-2@right']);
    expect(id, corners, {accent: 'nenhum'});
    expect(id, ['candelabro-3@right', 'candelabro-2@left'], {accent: 'topo'});
  }
  // The Twitch panel keeps its sill candle (no room for a girandole, and no glow).
  expect('painel-twitch', ['vela-alta@BR']);
  // Screen frames (the pack's radius 48, thickness 24): standing girandoles below, two-light ones
  // above, wall girandoles up the sides, the swag valance across the top band between the top ones.
  const telaCorners = ['candelabro-3-pe@BR', 'candelabro-3-pe@BL', 'candelabro-2@TR', 'candelabro-2@TL'];
  expect('tela-cheia', [...telaCorners, ...Array(3).fill(['arandela@right', 'arandela@left']).flat(), ...swags(54, 'top')]);
  expect('tela-vertical', [...telaCorners, ...Array(5).fill(['arandela@right', 'arandela@left']).flat(), ...swags(28, 'top')]);
});

test('ornaments interior: no pack, jogo e webcam-16x9-g escalam o kit (×2 e ×1,5): o herói usa o quarto e cresce junto', () => {
  for (const [id, scale, bleed] of [['jogo', 2, 96], ['webcam-16x9-g', 1.5, 72]] as const) {
    const size = getSize(id);
    const {adapter, props, frame, placements, scale: drawn} = packLayout(size);
    assert.equal(props.bleed, bleed, id);
    assert.equal(drawn, scale, id);
    const hero = placements[0]!;
    assert.ok(HEROES.includes(hero.motif), `${id}: herói ${hero.motif}`);
    assert.ok(hero.extent >= 0.85 * roomAt(frame, cornerSlot(frame, hero.slot as 'TR'), 'front').extent - 1e-9, `${id}: herói usa o quarto`);
    assert.ok(hero.size * scale >= 0.9 * scale * kitLayout(size).placements[0]!.size - 1e-9, `${id}: herói ${hero.size * scale} px`);
    assert.ok(adapter.outset(props) <= props.bleed + 1e-9, `${id}: cabe no bleed`);
  }
});

test('ornaments interior: o quarto é o limite (herói ≥ 85 %, parceiro ≥ 60 %) e os tamanhos em px', () => {
  const at = (id: string) => kitLayout(getSize(id));
  // Tela is not here: its standing corner girandoles give up some room to keep their flames off the
  // picture (the 'tela' test below); its partners still use ≥ 60 %.
  for (const id of ['chat-compacto', 'chat-padrao', 'chat-vertical', 'etiqueta-p', 'etiqueta', 'faixa', 'titulo', 'cartao', 'quadrado', 'lista',
    'webcam-16x9', 'webcam-16x9-g', 'webcam-4x3', 'webcam-quadrada', 'webcam-vertical', 'jogo', 'webcam-redonda-p', 'webcam-redonda', 'webcam-redonda-g',
    'circulo-p', 'tela-cheia', 'tela-vertical']) {
    const {frame, placements} = at(id);
    const share = (placement: OrnamentPlacement) => placement.extent / roomAt(frame, cornerSlot(frame, placement.slot as 'TR'), 'front').extent;
    if (frame.fit !== 'tela') assert.ok(share(placements[0]!) >= 0.85, `${id}: herói usa ${share(placements[0]!)} do quarto`);
    for (const partner of placements.slice(1).filter((placement) => ['TR', 'TL', 'BR', 'BL'].includes(placement.slot))) {
      assert.ok(share(partner) >= 0.6, `${id}: ${partner.motif}@${partner.slot} usa ${share(partner)}`);
      assert.ok(partner.size >= PARTNER_SHARE * placements[0]!.size - 1e-9, `${id}: parceiro perto da altura do herói`);
    }
  }
  const height = (id: string, index = 0) => at(id).placements[index]!.size;
  // Full heights (mount to the tallest flame tip), px: measured with the kit presets.
  for (const id of ['chat-compacto', 'chat-padrao', 'chat-vertical']) assert.ok(height(id) >= 52, `${id}: ${height(id)}`);
  for (const id of ['faixa', 'titulo', 'cartao']) assert.ok(height(id) >= 60, `${id}: ${height(id)}`);
  for (const id of ['etiqueta-p', 'etiqueta']) assert.ok(height(id) >= 49, `${id}: ${height(id)}`);
  for (const id of ['webcam-16x9', 'webcam-4x3', 'jogo']) assert.ok(height(id) >= 54, `${id}: ${height(id)}`);
  // Round cams and blocks (AD round 2: the room, not the preset, limits them): redonda-p, redonda and
  // circulo-p at their room (redonda gives up ≤ 14 % of it so its rosettes meet the ring);
  // redonda-g, circulo and circulo-g at the preset's ornamentSize.
  assert.ok(height('webcam-redonda-p') >= 100, `webcam-redonda-p: ${height('webcam-redonda-p')}`);
  assert.ok(height('webcam-redonda') >= 115, `webcam-redonda: ${height('webcam-redonda')}`);
  assert.ok(height('circulo-p') >= 80, `circulo-p: ${height('circulo-p')}`);
  for (const id of ['webcam-redonda-g', 'circulo', 'circulo-g']) assert.equal(height(id), preset(getSize(id).kind as OrnamentKindName).ornamentSize, id);
  assert.deepEqual([preset('chat').ornamentSize, preset('block').ornamentSize, preset('border').ornamentSize], [56, 96, 144]);
  // On the round blocks and on redonda-p/redonda the rosette meets the ring's outline.
  for (const id of ['circulo-p', 'circulo', 'circulo-g', 'webcam-redonda-p', 'webcam-redonda']) {
    const {frame, placements} = at(id);
    const {outline} = frame;
    for (const placement of placements) {
      const {fixture, bounds} = fixtureMap(placement);
      const origin = fixtureOrigin(placement, bounds.centre, fixture.dir);
      const rosette = FIXTURES[fixture.kind].rosette * placement.size;
      const off = Math.hypot(origin.x - (outline.x + outline.width / 2), origin.y - rosette - (outline.y + outline.height / 2)) - outline.width / 2;
      assert.ok(off <= rosette + 1e-6, `${id} ${placement.motif}: roseta no anel (${off})`);
    }
  }
  // The round blocks' side partner (the left accent arc takes TL) keeps the side's room.
  for (const id of ['circulo', 'circulo-g']) assert.ok(height(id, 1) >= 64, `${id}: parceiro do lado`);
  assert.ok(height('jogo', 2) >= 43, 'jogo: girândola do topo');
  for (const index of [3, 4, 5, 6]) assert.ok(height('jogo', index) >= 43, 'jogo: arandelas');
  for (const index of [7, 8]) assert.ok(height('jogo', index) >= PARTNER_SHARE * height('jogo', 2), 'jogo: girândolas do trilho');
  for (const id of ['tela-cheia', 'tela-vertical']) {
    for (const index of [0, 1]) assert.ok(height(id, index) >= 45, `${id}: canto de baixo ${index}`);
    for (const index of [2, 3]) assert.ok(height(id, index) >= 55, `${id}: canto de cima ${index}`);
    assert.ok(height(id, 4) >= 37, `${id}: arandela`);
  }
  // The Twitch panel's sill candle is unchanged.
  assert.equal(height('painel-twitch'), 22.5);
  // Where the rows stand.
  const jogo = at('jogo').placements;
  assert.deepEqual(jogo.filter((placement) => placement.motif === 'arandela').map((placement) => Math.round(placement.y)), [293, 293, 613, 613]);
  assert.deepEqual(at('tela-cheia').placements.filter((placement) => placement.motif === 'arandela').map((placement) => Math.round(placement.y)), [220, 220, 540, 540, 860, 860]);
  const offsets = (id: string, keep: (placement: OrnamentPlacement) => boolean, of = (placement: OrnamentPlacement) => placement.x) => {
    const {frame, placements} = at(id);
    const centre = frame.outline.x + frame.outline.width / 2;
    return placements.filter(keep).map((placement) => Math.round((of(placement) - centre) * 1000) / 1000).sort((a, b) => a - b);
  };
  assert.deepEqual(offsets('jogo', (placement) => placement.motif === 'candelabro-2-pe'), [-TOP_SPACING, TOP_SPACING]);
  // The valance: festoons abutting at their pitch, centred on the frame, hanging from the bottom
  // line's centreline (a border's outer line: 1 px inside the outline; a block's stroke), their
  // circles centred 6.5 / 8 px below it; its ends ≥ 16 px past the corner curve. On a screen frame
  // it hangs from a rail 15 px into the top band.
  const isSwag = (placement: OrnamentPlacement) => placement.motif === SWAG_MOTIF;
  for (const [id, pitch, count, joinFromOutline, centre] of [
    ['faixa', 40, 28, -2, 8], ['titulo', 40, 28, -2, 8], ['webcam-16x9-g', 38, 24, -1, 6.5], ['jogo', 38, 36, -1, 6.5],
  ] as const) {
    const {frame, placements} = at(id);
    const {outline} = frame;
    const expected = Array.from({length: count}, (_, index) => (index - (count - 1) / 2) * pitch);
    assert.deepEqual(offsets(id, isSwag), expected, id);
    assert.equal(swagLine(frame)!.y, outline.y + outline.height + joinFromOutline, `${id}: linha das juntas`);
    for (const placement of placements.filter(isSwag)) {
      assert.equal(placement.y, outline.y + outline.height + joinFromOutline + centre, `${id}: centro do círculo`);
      assert.equal(placement.size, pitch);
    }
    const reach = (count * pitch) / 2;
    assert.ok(outline.width / 2 - outline.radius - reach >= SWAG_CORNER - 1e-9, `${id}: pontas longe da curva`);
  }
  for (const [id, count] of [['tela-cheia', 54], ['tela-vertical', 28]] as const) {
    const {frame, placements} = at(id);
    assert.deepEqual(offsets(id, isSwag), Array.from({length: count}, (_, index) => (index - (count - 1) / 2) * SWAG.tela.pitch), id);
    assert.equal(swagLine(frame)!.y, frame.outline.y + 15);
    for (const placement of placements.filter(isSwag)) assert.equal(placement.y, 21.5, id);
    // As long as the top corners' girandoles allow (the pair gap), an even count.
    const corners = placements.filter((placement) => placement.slot === 'TR' || placement.slot === 'TL');
    const wider = [-(count + 1) / 2, (count + 1) / 2].map((index) => ({x: frame.outline.x + frame.outline.width / 2 + index * SWAG.tela.pitch, y: 21.5, extent: placements.find(isSwag)!.extent}));
    assert.ok(wider.some((festoon) => corners.some((corner) => Math.hypot(festoon.x - corner.x, festoon.y - corner.y) < festoon.extent + corner.extent + 2)), `${id}: a sanefa vai até as girândolas`);
  }
  assert.equal(SIDE_SPACING, 320);
  // Each festoon's circle is the AD's: janela r ≤ 23.5 (room 23.5 at the outline + 5.5), blocks ≤ 25, tela ≤ 20.5.
  assert.deepEqual(['jogo', 'faixa', 'tela-cheia'].map((id) => at(id).placements.find(isSwag)!.extent), [23.5, 25, 20.5]);
});

/** Every pair of placements keeps its circles apart by 2 px, except two festoons of the valance (they abut). */
const assertApart = (placements: readonly OrnamentPlacement[], label: string) =>
  placements.forEach((a, i) => placements.slice(i + 1).forEach((b) => assert.ok(
    (a.motif === SWAG_MOTIF && b.motif === SWAG_MOTIF) || Math.hypot(a.x - b.x, a.y - b.y) >= a.extent + b.extent + 2 - 1e-9,
    `${label}: ${a.motif}@${a.slot} sobre ${b.motif}@${b.slot}`)));

test('ornaments interior: as peças nunca se sobrepõem (kit, padrões, extremos, raios em pílula)', () => {
  for (const size of NAMED_SIZES) {
    for (const ornamentSize of [12, 32, 64, 96, 256]) {
      assertApart(kitLayout(size, {ornamentSize}).placements, `${size.id} kit ${ornamentSize}`);
      assertApart(neutralLayout(size, {ornamentSize}).placements, `${size.id} ${ornamentSize}`);
    }
  }
  for (const id of ['chat-padrao', 'chat-compacto', 'quadrado', 'cartao', 'faixa', 'webcam-quadrada', 'webcam-4x3', 'jogo']) {
    const size = getSize(id);
    for (let radius = 0; radius <= Math.min(size.width, size.height) / 2; radius += 3) {
      const {placements} = kitLayout(size, {radius});
      assert.ok(HEROES.includes(placements[0]!.motif), `${id} radius ${radius}: herói`);
      assertApart(placements, `${id} radius ${radius}`);
    }
  }
});

test('ornaments interior: frame 0 é a pose do herói (chamas perto da média, borlas da sanefa em repouso)', () => {
  const glowMin = FLICKER.glowMean - FLICKER.glowSlow - FLICKER.glowFast;
  const glowSpan = 2 * (FLICKER.glowSlow + FLICKER.glowFast);
  for (const id of ['chat-padrao', 'faixa', 'jogo', 'circulo', 'painel-twitch', 'tela-cheia']) {
    for (let seed = 0; seed < 60; seed++) {
      const {props, frame, placements} = kitLayout(getSize(id), {seed});
      const elements = interiorSet.build(frame, placements, props, 0, 960);
      for (const element of elements) {
        const flames = element.type === 'interior-flames'
          ? [0, 1, 2].filter((index) => (element[`scale${index}`] as number) > 0).map((index) => ({glow: element[`glow${index}`] as number, scale: element[`scale${index}`] as number}))
          : element.type === 'interior-flame' ? [{glow: element.glow as number, scale: element.scale as number}] : [];
        for (const flame of flames) {
          const glow = glowMin + flame.glow * glowSpan;
          assert.ok(Math.abs(glow - FLICKER.glowMean) <= 0.15 * FLICKER.glowMean, `${id} seed ${seed}: brilho ${glow}`);
          assert.ok(Math.abs(flame.scale - FLICKER.scaleMean) <= 0.15 * FLICKER.scaleMean, `${id} seed ${seed}: altura`);
        }
        if (element.type === 'interior-swag') {
          for (const key of ['angleLeft', 'angleRight']) assert.ok(Math.abs(element[key] as number) <= 0.5 + 1e-9, `${id} seed ${seed}: borla em repouso`);
        }
        assert.ok(element.opacity >= 0.8, `${id} seed ${seed}: aceso`);
      }
      assert.equal(elements.filter((element) => element.type === 'interior-flames').length, placements.filter((placement) => fixtureOf(placement)).length);
    }
  }
});

test('ornaments interior: harmônicos inteiros a partir de Hz (16 s, 3,7 s e 12,25 s), periódicos e contínuos na emenda', () => {
  assert.deepEqual([CANDLE_HZ.glowSlow, CANDLE_HZ.glowFast, CANDLE_HZ.height, CANDLE_HZ.leanSlow, CANDLE_HZ.leanFast].map((hz) => harmonics(hz, 16)), [7, 19, 11, 5, 13]);
  assert.deepEqual([CANDLE_HZ.glowSlow, CANDLE_HZ.glowFast, CANDLE_HZ.height, CANDLE_HZ.leanSlow, CANDLE_HZ.leanFast].map((hz) => harmonics(hz, 12.25)), [5, 15, 8, 4, 10]);
  assert.equal(harmonics(TASSEL_HZ, 16), 2);
  for (const id of ['faixa', 'painel-twitch', 'tela-vertical']) {
    for (const durationSeconds of [3.7, 12.25, 16]) {
      const {props, frame, placements} = kitLayout(getSize(id), {durationSeconds});
      const n = Math.round(durationSeconds * 60);
      const at = (f: number) => interiorSet.build(frame, placements, props, f, n);
      const close = (a: OrnamentElement[], b: OrnamentElement[], tolerance: number, label: string) => {
        assert.equal(a.length, b.length);
        a.forEach((element, index) => {
          for (const [key, value] of Object.entries(element)) {
            if (typeof value === 'number') assert.ok(Math.abs(value - (b[index]![key] as number)) <= tolerance, `${id} ${durationSeconds} s ${label} ${element.type}.${key}`);
            else assert.equal(value, b[index]![key]);
          }
        });
      };
      close(at(0), at(n), 1e-9, 'N = 0');
      close(at(-0.25), at(n - 0.25), 1e-9, 'periódico');
      // Velocity at the seam: the step into frame 0 matches the step out of it.
      const before = at(-0.5);
      const zero = at(0);
      const after = at(0.5);
      before.forEach((element, index) => {
        for (const key of ['glow', 'lean', 'scale', 'glow0', 'lean0', 'scale0', 'lean2', 'angleLeft', 'angleRight']) {
          if (typeof element[key] !== 'number') continue;
          const inStep = (zero[index]![key] as number) - (element[key] as number);
          const outStep = (after[index]![key] as number) - (zero[index]![key] as number);
          assert.ok(Math.abs(inStep - outStep) < 0.02, `${id} ${durationSeconds} s: velocidade de ${key} na emenda`);
        }
      });
    }
  }
});

/** The strongest non-zero frequency bins of a periodic series (a plain DFT). */
const topBins = (series: number[], count: number) => {
  const n = series.length;
  const mean = series.reduce((sum, value) => sum + value, 0) / n;
  const power = Array.from({length: 40}, (_, bin) => {
    let re = 0;
    let im = 0;
    series.forEach((value, index) => {
      re += (value - mean) * Math.cos((2 * Math.PI * bin * index) / n);
      im -= (value - mean) * Math.sin((2 * Math.PI * bin * index) / n);
    });
    return {bin, power: re * re + im * im};
  }).slice(1);
  return power.sort((a, b) => b.power - a.power).slice(0, count).map((entry) => entry.bin).sort((a, b) => a - b);
};

test('ornaments interior: ritmos, chama e cores vêm do fundo (HauntedInteriorLoop)', () => {
  const props = hauntedInteriorLoopSchema.parse({});
  const n = 960;
  const candles = Array.from({length: n}, (_, frame) => getHauntedInteriorScene(props, frame, n).find((element) => element.kind === 'candle')!);
  assert.deepEqual(topBins(candles.map((candle) => candle.glow!), 2), [7, 19], 'brilho');
  assert.deepEqual(topBins(candles.map((candle) => candle.scale!), 1), [11], 'altura');
  assert.deepEqual(topBins(candles.map((candle) => candle.lean!), 2), [5, 13], 'inclinação');
  assert.equal(props.durationSeconds, 16);
  assert.deepEqual([CANDLE_HZ.glowSlow, CANDLE_HZ.glowFast, CANDLE_HZ.height, CANDLE_HZ.leanSlow, CANDLE_HZ.leanFast].map((hz) => hz * 16), [7, 19, 11, 5, 13]);
  // The flame is the background's own path and gradient.
  const source = readFileSync(new URL('../src/backgrounds/HauntedInteriorLoop.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('d={flamePathOf(lean)}'), 'o fundo desenha a chama de flameSegments');
  assert.equal(flamePathOf(1.5), 'M0 2 C-11-5-7-14 1.5-28 C5.5-16 11-5 0 2Z');
  assert.equal(flamePath(1.5), flamePathOf(1.5, num));
  // The sampled bounds come from the same segments: the envelope's top is the tallest flame's tip.
  for (const kind of ['alta', 'media', 'baixa'] as const) {
    const top = Math.min(...candlePoints(kind, null).flame.map((point) => point.y));
    assert.ok(Math.abs(top + candleHeight(kind)) < 1e-9, `${kind}: ponta da chama ${top}`);
  }
  for (const color of [CANDLE_COLORS.flameMid, CANDLE_COLORS.flameBase, CANDLE_COLORS.core, CANDLE_COLORS.wick]) assert.ok(source.includes(color), color);
  // The wax is the background's hi-wax-warm gradient, stop for stop.
  const wax = [CANDLE_COLORS.waxDark, CANDLE_COLORS.waxLight, CANDLE_COLORS.waxShade].map((color) => color.toLowerCase());
  assert.ok(source.includes(`<stop stopColor="${wax[0]}" /><stop offset="0.45" stopColor="${wax[1]}" /><stop offset="1" stopColor="${wax[2]}" />`), 'hi-wax-warm');
  // The kit's palette is the background's `colors`, in all three presets.
  for (const kind of ['chat', 'block', 'border'] as const) assert.deepEqual(preset(kind).ornamentColors, hauntedInteriorLoopSchema.parse({}).colors);
});

/** Fixture units → canvas px for a placement. */
const fixtureMap = (placement: OrnamentPlacement) => {
  const fixture = fixtureOf(placement)!;
  const bounds = fixtureBounds(fixture.kind, fixture.mount);
  const origin = fixtureOrigin(placement, bounds.centre, fixture.dir);
  return {fixture, bounds, map: (point: {x: number; y: number}) => ({x: origin.x + fixture.dir * placement.size * point.x, y: origin.y + placement.size * point.y})};
};

/** Every drawn point of a placement, px, and how far its stroke reaches past it. */
const drawnOf = (frame: OrnamentFrame, placement: OrnamentPlacement): {x: number; y: number; margin: number}[] => {
  if (placement.motif === SWAG_MOTIF) {
    // The fabric, the hem cord and its rule, both joins' bosses and tassels over their whole swing.
    const {spec, y} = swagLine(frame)!;
    return swagPoints(spec).map((point) => ({x: placement.x + point.x, y: y + point.y, margin: point.margin}));
  }
  if (fixtureOf(placement)) {
    const {fixture, bounds, map} = fixtureMap(placement);
    const {body, flames} = fixturePoints(fixture.kind, fixture.mount);
    const halos = bounds.halos.flatMap((halo) => Array.from({length: 24}, (_, index) => {
      const angle = (index / 24) * 2 * Math.PI;
      const centre = map(halo);
      const radius = halo.radius * placement.size + FIXTURE_MARGIN - 0.5;
      return {x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle), margin: 0};
    }));
    return [...body.map((point) => ({...map(point), margin: FIXTURE_MARGIN})), ...flames.map((point) => ({...map(point), margin: 0.6})), ...halos];
  }
  const spec = candleOf(frame, placement);
  const u = scaleOf(placement, spec.kind);
  const foot = footOf(placement, spec, u);
  const {body, flame} = candlePoints(spec.kind, spec.bracket);
  const map = (point: {x: number; y: number}) => ({x: foot.x + spec.dir * u * point.x, y: foot.y + u * point.y});
  assert.ok(u * candleBounds(spec.kind, spec.bracket).radius > 0);
  return [...body.map((point) => ({...map(point), margin: Math.max(0.35, 0.35 * u)})), ...flame.map((point) => ({...map(point), margin: 0}))];
};

test('ornaments interior: nada do desenho sai do lugar, entra no texto ou na janela, nos ornamentSize extremos', () => {
  for (const size of NAMED_SIZES) {
    for (const ornamentSize of [12, 48, 96, 256]) {
      for (const extra of [{}, {accent: 'topo'}, {radius: 0}]) {
        if (size.kind !== 'block' && 'accent' in extra) continue;
        for (const {frame, placements} of [kitLayout(size, {ornamentSize, ...extra}), neutralLayout(size, {ornamentSize, ...extra})]) {
          const label = `${size.id} ${ornamentSize} ${JSON.stringify(extra)}`;
          for (const placement of placements) {
            for (const point of drawnOf(frame, placement)) {
              assert.ok(Math.hypot(point.x - placement.x, point.y - placement.y) + point.margin <= placement.extent + 1e-6, `${label} ${placement.motif}: dentro do lugar`);
              for (const area of frame.keepOut) assert.ok(rectDistance(area, point.x, point.y) >= 1 - 1e-6, `${label}: longe do texto`);
              if (frame.hole) assert.ok(roundRectSdf(frame.hole, point.x, point.y) >= -1e-6, `${label}: fora da janela`);
            }
          }
        }
      }
    }
  }
});

test('ornaments interior: a luz não gasta o quarto (≤ o alcance do corpo) e some sem brilho', () => {
  for (const size of NAMED_SIZES) {
    const {props, frame, placements} = kitLayout(size);
    for (const at of [0, 174, 500]) {
      for (const element of interiorSet.build(frame, placements, props, at, 960)) {
        const placement = placements[element.anchor]!;
        if (element.type === 'interior-flames') {
          const body = fixtureBounds(element.fixture as never, element.mount as never).body * placement.size + FIXTURE_MARGIN;
          assert.ok(element.light <= body + 1e-9, `${size.id}: luz ≤ alcance do corpo`);
          if (frame.glow > 0) assert.ok(element.lightOpacity >= 0.35 - 1e-9 && element.lightOpacity <= 0.58 + 1e-9, `${size.id}: alfa da luz`);
          assert.ok(Math.hypot((element.fx as number) - element.x, (element.fy as number) - element.y) < element.light || element.light === 0, `${size.id}: foco dentro da luz`);
        }
        if (frame.glow === 0) assert.equal(element.light, 0, `${size.id}: sem brilho, sem luz`);
      }
    }
  }
  // glow 0 on any size: no light.
  for (const id of ['chat-padrao', 'webcam-16x9', 'faixa']) {
    const {props, frame, placements} = kitLayout(getSize(id), {glow: 0});
    for (const element of interiorSet.build(frame, placements, props, 0, 960)) assert.equal(element.light, 0, id);
  }
});

test('ornaments interior: no relâmpago o latão acende do lado da janela, uma luz fria abre em volta e a sanefa brilha', () => {
  const {props, frame, placements} = kitLayout(getSize('chat-padrao'));
  const calm = interiorSet.build(frame, placements, props, 0, 960);
  const strike = interiorSet.build(frame, placements, props, 174, 960);
  const flames = (elements: OrnamentElement[]) => elements.filter((element) => element.type === 'interior-flames');
  assert.ok(flames(strike).some((element) => (element.flash as number) > 0.3), 'há clarão no frame 174');
  assert.ok(flames(calm).every((element) => element.flash === 0), 'sem clarão no frame 0');
  for (const element of flames(strike)) assert.equal(element.side, element.x < frame.outline.x + frame.outline.width / 2 ? -1 : 1);
  // The cold light (AD round 3): 0.5·flash, as large as the warm one; ≤ 0.2 where it meets the text
  // (chat and block corners), 0 without glow; no flash (so no cold light) at frames 0 and N−1.
  const lit = (element: OrnamentElement) => element.type === 'interior-flames' || element.type === 'interior-flame';
  for (const size of NAMED_SIZES) {
    for (const extra of [{}, {glow: 0}]) {
      const layout = kitLayout(size, extra);
      for (const at of [0, 959, 172, 174, 176, 803]) {
        for (const element of interiorSet.build(layout.frame, layout.placements, layout.props, at, 960).filter(lit)) {
          const label = `${size.id} ${JSON.stringify(extra)} frame ${at}`;
          const cold = element.cold as number;
          assert.ok(cold >= 0 && cold <= STRIKE_LIGHT + 1e-9, label);
          if (at === 0 || at === 959) assert.equal(element.flash, 0, `${label}: sem clarão`);
          if (at === 0 || at === 959 || layout.frame.glow === 0) assert.equal(cold, 0, `${label}: sem luz fria`);
          if (element.light > 0 && layout.frame.keepOut.some((area) => rectDistance(area, element.x, element.y) < element.light)) {
            assert.ok(cold <= 0.2 + 1e-9, `${label}: luz fria ≤ 0,2 sobre o texto`);
          } else if (layout.frame.glow > 0) {
            assert.ok(Math.abs(cold - STRIKE_LIGHT * Math.min(1, element.flash as number)) < 1e-9, `${label}: luz fria = 0,5·clarão`);
          }
        }
      }
    }
  }
  // At the strike with the kit border (lightning 1.0) the jogo's fixtures bloom (≈ 0.5 at full flash).
  const jogo = kitLayout(getSize('jogo'));
  const bloom = interiorSet.build(jogo.frame, jogo.placements, jogo.props, 174, 960).filter((element) => element.type === 'interior-flames');
  assert.ok(bloom.every((element) => (element.cold as number) > 0.3), 'jogo: luz fria no frame 174');
  // The valance flares on the flashing window's side, and not before the strike.
  const swag = (at: number) => interiorSet.build(jogo.frame, jogo.placements, jogo.props, at, 960).filter((element) => element.type === 'interior-swag');
  assert.ok(swag(174).every((element) => (element.flash as number) > 0.3), 'jogo: sanefa acende');
  assert.ok(swag(0).every((element) => element.flash === 0) && swag(959).every((element) => element.flash === 0), 'jogo: sanefa sem clarão');
  assert.equal(SWAG_TASSEL.swing, 3);
});

/** Small round screen frames (a square tela with radius ≥ side/2): the girandoles do not fit, so the chambersticks stand on the band. */
const ROUND_TELAS = [
  {width: 96, height: 96, bleed: 0, fit: 'tela', shape: 'retangulo', radius: 1920, thickness: 24, glow: 4, lines: 1, strokeWidth: 2, corners: 'nenhum', ornamentSize: 48},
  {width: 96, height: 96, bleed: 0, fit: 'tela', shape: 'retangulo', radius: 1920, thickness: 32, glow: 8, lines: 2, strokeWidth: 2, corners: 'nenhum', ornamentSize: 96},
];

test('ornaments interior: numa tela redonda as velas ficam na faixa, sem braço, e o desenho cabe no lugar e no arquivo', () => {
  const adapter = ORNAMENT_KINDS.border;
  for (const input of ROUND_TELAS) {
    const props = adapter.parse({...input, ornaments: 'interior'});
    const {frame, placements} = adapter.ornamentLayout(props);
    const label = JSON.stringify(input);
    assert.ok(frame.circle && frame.fit === 'tela', `${label}: tela redonda`);
    assert.ok(placements.length > 0 && placements.every((placement) => placement.motif.startsWith('vela-')), `${label}: castiçais (${motifs(placements)})`);
    for (const placement of placements) {
      assert.equal(candleOf(frame, placement).bracket, null, `${label} ${placement.motif}@${placement.slot}: sem braço na tela`);
      for (const point of drawnOf(frame, placement)) {
        const where = `${label} ${placement.motif}@${placement.slot}`;
        assert.ok(Math.hypot(point.x - placement.x, point.y - placement.y) + point.margin <= placement.extent + 1e-6, `${where}: dentro do lugar`);
        const limit = frame.paintLimit;
        const inside = Math.min(point.x - limit.x, limit.x + limit.width - point.x, point.y - limit.y, limit.y + limit.height - point.y) - point.margin;
        assert.ok(inside >= 1 - 1e-6, `${where}: ${inside} px dentro do arquivo`);
        assert.ok(roundRectSdf(frame.hole!, point.x, point.y) >= -1e-6, `${where}: fora da janela`);
      }
    }
    for (const at of [0, 174, 500]) {
      for (const element of interiorSet.build(frame, placements, props, at, 960)) {
        const placement = placements[element.anchor]!;
        if (element.type === 'interior-candle') assert.equal(element.mount, 'edge', `${label}: castiçal de pé`);
        const reach = Math.hypot(element.x - placement.x, element.y - placement.y) + Math.max(element.reach, element.light);
        assert.ok(reach <= placement.extent + 1e-6, `${label} frame ${at} ${element.type}: ${reach} > ${placement.extent}`);
      }
    }
  }
});

test('ornaments interior: tela em qualquer raio e espessura nunca recusa, e as peças ficam na faixa', () => {
  for (const id of ['tela-cheia', 'tela-vertical']) {
    const size = getSize(id);
    for (const extra of [{}, {radius: 0}, {radius: 16}, {radius: 96}, {radius: 200}, {radius: 300}, {thickness: 12, radius: 8}]) {
      for (const layout of [() => kitLayout(size, extra), () => neutralLayout(size, extra)]) {
        const {frame, placements} = layout();
        const label = `${id} ${JSON.stringify(extra)}`;
        assert.ok(HEROES.includes(placements[0]!.motif), `${label}: herói`);
        for (const placement of placements) assert.ok(roundRectSdf(frame.hole!, placement.x, placement.y) >= placement.extent - 1e-6, `${label}: fora da janela`);
        assertApart(placements, label);
      }
    }
  }
  // The pack renders the telas without ornaments only; TELA_PROPS is the band their corners were tuned for.
  assert.deepEqual(packItemProps('halloween-interior', 'tela-cheia'), {});
  assert.ok(GIRANDOLE_MIN <= 12);
  // The girandoles standing on the band (the bottom corners) and the top band's valance keep
  // everything they draw (flames, halos, wax, brass, velvet, tassels) ≥ 1 px off the picture (layout.window), not only off
  // holeShape (the window less the glow margin, which the contract allows): with the pack's props
  // and at any radius.
  for (const id of ['tela-cheia', 'tela-vertical']) {
    const size = getSize(id);
    for (const extra of [{}, {radius: 0}, {radius: 16}, {radius: 96}, {radius: 200}, {radius: 300}, {thickness: 20}, {thickness: 32, radius: 0}, {thickness: 22, glow: 20}, {glow: 24}]) {
      const {props, frame, placements} = kitLayout(size, extra);
      const {window} = getBordaGeometry(props as never).layout;
      for (const placement of placements.filter((entry) => entry.motif.endsWith('-pe') || entry.motif === SWAG_MOTIF)) {
        for (const point of drawnOf(frame, placement)) {
          assert.ok(roundRectSdf(window, point.x, point.y) - point.margin >= 1 - 1e-6, `${id} ${JSON.stringify(extra)} ${placement.motif}@${placement.slot}: fora da imagem`);
        }
      }
    }
  }
});
