import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {
  getHauntedMansionScene, hauntedMansionLoopSchema, MANSION_FENCE, MANSION_LANTERN, MANSION_LANTERN_FLICKER,
} from '../src/backgrounds/HauntedMansionLoop';
import {HauntedMansionArtwork} from '../src/backgrounds/halloween/HauntedMansionArtwork';
import {TAU} from '../src/loop';
import {getBorderGeometry} from '../src/overlays/border';
import {roundRectSdf} from '../src/overlays/shared/geometry';
import {
  cornerSlot, MAX_CONTENT_OPACITY, maxExtentAt, meetsKeepOut, rectDistance, roomAt, type OrnamentElement, type OrnamentFrame,
  type OrnamentPlacement,
} from '../src/overlays/shared';
import {hauntedMansionSet} from '../src/overlays/shared/ornaments/sets/haunted-mansion';
import {LANCET, lancetPanePath, ROSE, WINDOW_FLICKER} from '../src/overlays/shared/ornaments/sets/haunted-mansion-glass';
import {
  ceilHalf, FENCE_MAX, FENCE_MIN, FENCE_PER_SIZE, GATE_LEAF, GATE_PEAK, GATE_POST, LANTERN_HEIGHT_UNITS, LANTERN_MIN, LANTERN_UNITS,
  fenceMeasures, lanternMountOf, lanternScale, lightCap, SCONCE_HEIGHT, SCONCE_MIN,
} from '../src/overlays/shared/ornaments/sets/haunted-mansion-place';
import {getSize, NAMED_SIZES, sizeProps} from '../src/sizes';
import {inkOf} from './helpers/ink';
import {framesOf, kitProps, ORNAMENT_KINDS, unscaledItemProps, type OrnamentKindName, type OrnamentProps} from './helpers/ornament-kinds';

/**
 * The 'haunted-mansion' ornament set: the HauntedMansionLoop background's porch lanterns (hero) on
 * shepherd's-hook brackets, its rose window and lancets along the top edge, and its wrought-iron
 * spear fence. The shared harness (tests/helpers/ornament-harness.ts) checks the contract on every size;
 * these tests pin what is particular to this set.
 */

const KIT = {
  ornaments: 'haunted-mansion', ornamentSize: 36, ornamentColors: ['#688789', '#D6DDC7', '#E8AF62'], durationSeconds: 16, seed: 81,
} as const;

const kindOf = (id: string): OrnamentKindName => getSize(id).kind as OrnamentKindName;

const layoutAt = (id: string, extra: Record<string, unknown> = {}) => {
  const adapter = ORNAMENT_KINDS[kindOf(id)];
  const props = adapter.parse({...KIT, ...sizeProps(getSize(id)), ...extra});
  return {adapter, props, ...adapter.ornamentLayout(props)};
};

/**
 * The kit at its own px: the preset and the pack item's props (the Twitch panel's padding), without
 * the pack's scale on the large frames (gameplay and webcam-16x9-lg grow ×2 and ×1.5 with a wider bleed:
 * see packAt), and on the telas, which the pack renders only without ornaments, the band they were
 * tuned for (TELA_PROPS).
 */
const SCREEN_PROPS = {radius: 48, thickness: 24};
const kitAt = (id: string, extra: Record<string, unknown> = {}) => {
  const adapter = ORNAMENT_KINDS[kindOf(id)];
  const item = unscaledItemProps('halloween-haunted-mansion', id);
  const screen = getSize(id).props?.fit === 'screen' ? SCREEN_PROPS : {};
  const props = adapter.parse({...adapter.preset('halloween-haunted-mansion'), ...item, ...sizeProps(getSize(id)), ...screen, ...extra});
  return {adapter, props, ...adapter.ornamentLayout(props)};
};
/** The kit exactly as the pack renders it (packs/halloween-haunted-mansion.json). */
const packAt = (id: string) => {
  const adapter = ORNAMENT_KINDS[kindOf(id)];
  const props = adapter.parse(kitProps('halloween-haunted-mansion', getSize(id)));
  return {adapter, props, ...adapter.ornamentLayout(props)};
};
const lanterns = (placements: readonly OrnamentPlacement[]) => placements.filter((placement) => placement.motif.startsWith('lantern'));
const motifs = (placements: readonly OrnamentPlacement[], motif: string) => placements.filter((placement) => placement.motif === motif);
const fences = (placements: readonly OrnamentPlacement[], slot?: string) =>
  placements.filter((placement) => placement.motif === 'fence' && (!slot || placement.slot === slot));

const build = (frame: OrnamentFrame, placements: readonly OrnamentPlacement[], props: OrnamentProps, at: number, n: number) =>
  hauntedMansionSet.build(frame, placements, props, at, n) as OrnamentElement[];

const glassOf = (elements: readonly OrnamentElement[], type = 'haunted-mansion-lantern') =>
  elements.filter((element) => element.type === type).map((element) => element.glass as number);

const CHATS = ['chat-compact', 'chat-standard', 'chat-tall', 'chat-column', 'chat-vertical'];
const RECT_BLOCKS = ['lower-third', 'title', 'card', 'square', 'list'];
const RECT_CAMS = ['webcam-16x9', 'webcam-16x9-lg', 'webcam-4x3', 'webcam-square', 'webcam-vertical', 'gameplay'];
const ROUND_CAMS = ['webcam-round-sm', 'webcam-round', 'webcam-round-lg'];

test('haunted-mansion: a lanterna principal (ornamentSize = altura da lanterna) em todos os 27 tamanhos nomeados', () => {
  assert.equal(NAMED_SIZES.length, 27);
  for (const size of NAMED_SIZES) {
    for (const ornamentSize of [12, 36, 48, 256]) {
      const {placements} = layoutAt(size.id, {ornamentSize});
      const hero = placements[0];
      assert.ok(hero && hero.motif.startsWith('lantern'), `${size.id} @${ornamentSize}: a lanterna vem primeiro`);
      assert.ok(hero.size <= ornamentSize + 1e-9, `${size.id} @${ornamentSize}: nunca maior que o pedido`);
      assert.ok(hero.size >= Math.min(LANTERN_MIN, ornamentSize) - 1e-9, `${size.id} @${ornamentSize}: não abaixo do mínimo (${hero.size})`);
    }
  }
  // Where the room allows, the lantern is exactly ornamentSize px tall (hook to base), fixed px.
  for (const id of ['chat-standard', 'chat-vertical', 'card', 'lower-third', 'circle', 'webcam-16x9', 'gameplay', 'webcam-round']) {
    const {placements} = layoutAt(id);
    assert.equal(placements[0]!.size, 36, id);
    assert.equal(placements[0]!.slot, 'TR', id);
  }
  assert.equal(lanternScale(36) * LANTERN_HEIGHT_UNITS, 36);
});

test('haunted-mansion: com o kit, a lanterna usa ≥ 85 % do espaço do canto (webcams redondas: o teto do preset) e os secundários ≥ 60 % do seu', () => {
  const measured: string[] = [];
  for (const id of [...CHATS, ...RECT_BLOCKS, ...RECT_CAMS, ...ROUND_CAMS]) {
    const {frame, placements, props} = kitAt(id);
    const hero = placements[0]!;
    const room = roomAt(frame, cornerSlot(frame, hero.slot as 'TR'), 'front').extent;
    // The lamp's body (its hull's circle), not its light, takes the room.
    const body = ceilHalf(lanternMountOf(frame, hero).lantern.reach);
    // Round webcams have room for far more; the preset caps them at the circle blocks' 60 px.
    if (ROUND_CAMS.includes(id)) assert.equal(hero.size, props.ornamentSize, `${id}: teto do preset`);
    else assert.ok(body >= 0.85 * room - 1e-9, `${id}: lanterna ${hero.size} px usa ${body} de ${room}`);
    assert.ok(hero.size <= props.ornamentSize, id);
    measured.push(`${id} ${hero.size}`);
    // The second lantern equals the hero.
    assert.deepEqual(lanterns(placements).map((lamp) => lamp.size), [hero.size, hero.size], `${id}: par igual`);
    // The fence takes ≥ 60 % of the room at its first picket's spot (and its height is capped).
    const fence = fences(placements, 'BL');
    if (fence.length > 0) {
      const first = fence[0]!;
      assert.ok(first.extent >= 0.6 * maxExtentAt(frame, first.x, first.y, 'front') - 1e-9, `${id}: cerca pequena demais`);
    }
    // The rose window takes ≥ 60 % of the top edge's room at its spot.
    for (const rose of motifs(placements, 'rose')) {
      assert.ok(rose.extent >= 0.6 * maxExtentAt(frame, rose.x, rose.y, 'front') - 1e-9, `${id}: rosácea pequena demais`);
    }
  }
  // The measured sizes (the review's targets): chat 52, rect blocks 58.5, window 54.5, round webcams the preset's 60 (as the circle blocks).
  const size = (id: string) => kitAt(id).placements[0]!.size;
  assert.equal(size('chat-standard'), 52);
  assert.equal(size('card'), 58.5);
  assert.equal(size('webcam-16x9'), 54.5);
  assert.equal(size('gameplay'), 54.5);
  for (const id of ROUND_CAMS) assert.equal(size(id), 60, measured.join(', '));
  // Label strips: at most 0.6 of the strip (label-sm 38.5), else the room (label 50). Circles: the preset's 60.
  assert.equal(size('label-sm'), 38.5);
  assert.equal(size('label'), 50);
  for (const id of ['circle-sm', 'circle', 'circle-lg']) assert.equal(size(id), 60, id);
  // Telas at the pack's thickness 24 / radius 48: hung in the band's corner, ≥ 85 % of its room.
  for (const id of ['fullscreen', 'fullscreen-vertical']) {
    const {frame, placements} = kitAt(id);
    assert.ok(placements[0]!.size >= 56, `${id}: ${placements[0]!.size}`);
    assert.ok(placements[0]!.extent >= 0.85 * roomAt(frame, cornerSlot(frame, 'TR'), 'front').extent, id);
  }
});

test('haunted-mansion: no pack, jogo e webcam-16x9-lg escalam o kit (×2 e ×1,5) e a lanterna cresce junto, dentro do bleed', () => {
  for (const [id, scale, bleed] of [['gameplay', 2, 96], ['webcam-16x9-lg', 1.5, 72]] as const) {
    const {adapter, frame, placements, props} = packAt(id);
    assert.equal(props.bleed, bleed, id);
    const layout = adapter.ornamentLayout(props);
    assert.equal(layout.scale, scale, id);
    // In the set's own space the lantern still takes ≥ 85 % of its corner's room…
    const hero = placements[0]!;
    const room = roomAt(frame, cornerSlot(frame, hero.slot as 'TR'), 'front').extent;
    assert.ok(ceilHalf(lanternMountOf(frame, hero).lantern.reach) >= 0.85 * room - 1e-9, `${id}: lanterna ${hero.size} de ${room}`);
    // …so on the file it is about `scale` times the kit's own lantern on that frame (≥ 90 % of it).
    assert.ok(hero.size * scale >= 0.9 * scale * kitAt(id).placements[0]!.size - 1e-9, `${id}: lanterna ${hero.size * scale} px`);
    assert.ok(adapter.outset(props) <= props.bleed + 1e-9, `${id}: cabe no bleed`);
  }
});

test('haunted-mansion: onde cada motivo fica (braços, rosácea, lancetas, cercas) e onde fica de fora', () => {
  // Chat, blocos com bleed, bordas retangulares: duas lanternas em ganchos de pastor, cerca em BL e BR do mesmo comprimento.
  for (const id of [...CHATS, ...RECT_BLOCKS, ...RECT_CAMS]) {
    const {placements} = layoutAt(id);
    assert.deepEqual(lanterns(placements).map((placement) => `${placement.motif}@${placement.slot}`), ['lantern@TR', 'lantern@TL'], id);
    const sides = ['gameplay', 'webcam-16x9-lg'].includes(id) ? ['left', 'right'] : [];
    assert.deepEqual(motifs(placements, 'arm').map((placement) => placement.slot), ['TR', 'TL', ...sides], id);
    assert.deepEqual(motifs(placements, 'sconce').map((placement) => placement.slot), sides, id);
    const left = fences(placements, 'BL');
    assert.ok(left.length >= 3, `${id}: cerca em BL`);
    assert.equal(fences(placements, 'BR').length, left.length, `${id}: cerca em BR igual à de BL`);
  }
  // Etiquetas: uma lanterna (TR) e uma cerca (BL), para respirar.
  for (const id of ['label-sm', 'label']) {
    const {placements} = layoutAt(id);
    assert.deepEqual(lanterns(placements).map((placement) => placement.slot), ['TR'], id);
    assert.ok(fences(placements, 'BL').length >= 3 && fences(placements, 'BR').length === 0, id);
  }
  // Círculos e webcams redondas: duas lanternas em ganchos, sem cerca.
  for (const id of ['circle-sm', 'circle', 'circle-lg', ...ROUND_CAMS]) {
    const {placements} = layoutAt(id);
    assert.deepEqual(lanterns(placements).map((placement) => placement.motif), ['lantern', 'lantern'], id);
    assert.equal(fences(placements).length, 0, id);
  }
  // Round blocks with an accent: the lanterns take the slots the arc leaves free (a bottom slot hangs from a wall arm).
  assert.deepEqual(lanterns(layoutAt('circle', {accent: 'left'}).placements).map((placement) => placement.slot), ['TR', 'BR']);
  assert.deepEqual(lanterns(layoutAt('circle', {accent: 'top'}).placements).map((placement) => placement.slot), ['BR', 'BL']);
  // Painel da Twitch e telas: lanternas penduradas da borda de cima (sem braço, sem bleed).
  for (const id of ['twitch-panel', 'fullscreen', 'fullscreen-vertical']) {
    const {placements} = layoutAt(id);
    assert.deepEqual(lanterns(placements).map((placement) => `${placement.motif}@${placement.slot}`), ['lantern-hung@TR', 'lantern-hung@TL'], id);
    // Only the side sconces (telas) hang from arms.
    assert.equal(motifs(placements, 'arm').length, motifs(placements, 'sconce').length, id);
  }
  // The pack's padding on the Twitch panel (README): the lanterns grow from 22 to 32 px.
  assert.deepEqual(kitAt('twitch-panel').placements.map((placement) => `${placement.motif}@${placement.slot} ${placement.size}`),
    ['lantern-hung@TR 32', 'lantern-hung@TL 32'], 'kit twitch-panel');
  assert.deepEqual(kitAt('twitch-panel', {paddingX: 24, paddingY: 16}).placements.map((placement) => placement.size), [22, 22], 'twitch-panel sem o padding do pack');
  // Painel: no bleed under it, so no fence (it would stand in the padding over the fill, a comb of ticks), and no rose (too narrow).
  for (const extra of [{radius: 0}, {radius: 4}, {radius: 8}, {radius: 16}, {paddingX: 32, paddingY: 24}, {paddingX: 48, paddingY: 40}]) {
    const {placements} = layoutAt('twitch-panel', extra);
    assert.equal(fences(placements).length + motifs(placements, 'rose').length, 0, `painel ${JSON.stringify(extra)}`);
  }
  // Telas: a fence on the file's bottom edge, no taller than the band (+2 px).
  for (const id of ['fullscreen', 'fullscreen-vertical']) {
    const {placements, frame} = kitAt(id);
    const fence = fences(placements);
    assert.ok(fence.length >= 6, `${id}: cerca na faixa de baixo`);
    const band = frame.paintLimit.y + frame.paintLimit.height - (frame.hole!.y + frame.hole!.height) - frame.glow;
    assert.ok(fence[0]!.size <= band + 2 + 1e-9, `${id}: cerca na faixa (${fence[0]!.size} > ${band + 2})`);
  }
  // A small ornamentSize keeps the hero only: the second lantern (≥ 20 px), the rose (≥ 14) and the fence (≥ 16) drop.
  for (const id of ['chat-vertical', 'lower-third', 'gameplay', 'fullscreen']) {
    const {placements} = layoutAt(id, {ornamentSize: 12});
    assert.deepEqual(placements.filter((placement) => placement.motif !== 'arm').map((placement) => placement.motif), [placements[0]!.motif], id);
  }
  // Fence: one height, as tall as its room allows up to FENCE_MAX (and 0.6 of ornamentSize), at least FENCE_MIN.
  for (const size of NAMED_SIZES) {
    for (const ornamentSize of [36, 128]) {
      const {placements} = layoutAt(size.id, {ornamentSize});
      const fence = fences(placements);
      if (fence.length === 0) continue;
      const height = fence[0]!.size;
      assert.ok(height <= Math.min(FENCE_MAX, FENCE_PER_SIZE * ornamentSize) + 1e-9 && height >= FENCE_MIN, `${size.id}: ${height}`);
      assert.ok(fence.every((picket) => picket.size === height), `${size.id}: uma só altura de cerca`);
    }
  }
});

test('haunted-mansion: com o kit, rosácea e lancetas no topo dos contornos largos e cercas mais longas nos grandes', () => {
  const count = (id: string, motif: string) => motifs(kitAt(id).placements, motif).length;
  for (const id of NAMED_SIZES.map((size) => size.id)) {
    const {frame, placements} = kitAt(id);
    const wide = frame.outline.width >= 560;
    assert.equal(motifs(placements, 'rose').length, wide ? 1 : 0, `${id}: rosácea`);
    for (const rose of motifs(placements, 'rose')) {
      // Centred on the top edge, straddling the frame's line where the room lets it.
      assert.ok(Math.abs(rose.x - (frame.outline.x + frame.outline.width / 2)) < 1e-9, id);
      assert.ok(rose.extent <= 0.45 * placements[0]!.size + 1e-9, id);
      // Lancets on the same line, at whole LANCET_SPACING steps from the rose.
      for (const lancet of motifs(placements, 'lancet')) {
        assert.equal(lancet.y, rose.y, id);
        assert.ok(Math.abs(Math.abs(lancet.x - rose.x) % 320) < 1e-9, id);
      }
    }
  }
  assert.deepEqual(['lower-third', 'title', 'gameplay', 'chat-vertical', 'webcam-16x9-lg', 'fullscreen', 'fullscreen-vertical', 'card', 'webcam-16x9']
    .map((id) => count(id, 'lancet')), [2, 2, 2, 2, 2, 4, 2, 0, 0]);
  // Side sconces on big frames (gameplay, webcam-16x9-lg: one per side; screen: every 480 px), and the gate on outlines ≥ 1000 px wide.
  assert.deepEqual(['gameplay', 'webcam-16x9-lg', 'fullscreen', 'fullscreen-vertical', 'webcam-16x9', 'webcam-vertical', 'lower-third', 'chat-vertical']
    .map((id) => count(id, 'sconce')), [2, 2, 2, 6, 0, 0, 0, 0]);
  assert.deepEqual(['lower-third', 'title', 'gameplay', 'fullscreen', 'fullscreen-vertical', 'webcam-16x9-lg', 'chat-vertical', 'card']
    .map((id) => count(id, 'gate') / 6), [1, 1, 1, 1, 1, 0, 0, 0]);
  // Rose extents: blocks 24.5, window 23.5, screen (thickness 24) 20.5.
  assert.deepEqual(['lower-third', 'gameplay', 'fullscreen'].map((id) => motifs(kitAt(id).placements, 'rose')[0]!.extent), [24.5, 23.5, 20.5]);
  // Fence runs per side: 0.22 of the width, at most 16 pickets.
  assert.deepEqual(['chat-standard', 'card', 'lower-third', 'gameplay', 'label'].map((id) => fences(kitAt(id).placements, 'BL').length), [5, 8, 14, 16, 8]);
  // Heavier fence: 30 px on chat, blocks, window and screen (the band's depth); 25 on label-sm.
  assert.deepEqual(['chat-standard', 'card', 'webcam-16x9', 'label-sm', 'fullscreen'].map((id) => fences(kitAt(id).placements)[0]!.size),
    [30, 30, 30, 25, 30]);
  // Lowered 3–4 px where the bleed allows, so the top rail clears the stroke's glow: the spear tips
  // 2 px (chat, lower-third) or 3 px (gameplay, webcam) over the outline's bottom edge, not 0.2·H.
  const tipOver = (id: string) => {
    const {frame, placements} = kitAt(id);
    const picket = fences(placements)[0]!;
    return frame.outline.y + frame.outline.height - (picket.y - fenceMeasures(picket.size).centre);
  };
  assert.deepEqual(['chat-standard', 'lower-third', 'card', 'gameplay', 'webcam-16x9'].map(tipOver), [2, 2, 2, 3, 3]);
});

test('haunted-mansion: frame 0 é a pose principal (vidros acesos) e a luz some no painel da Twitch', () => {
  for (const seed of [1, 7, 81, 999, 123456]) {
    for (const id of ['chat-standard', 'label-sm', 'circle-sm', 'twitch-panel', 'webcam-16x9', 'webcam-round-sm', 'fullscreen', 'lower-third']) {
      const {frame, placements, props} = kitAt(id, {seed});
      const n = framesOf(props);
      const elements = build(frame, placements, props, 0, n);
      const glass = glassOf(elements);
      assert.ok(glass.length >= 1, id);
      for (const level of glass) assert.ok(level >= MANSION_LANTERN_FLICKER.base, `${id} seed ${seed}: vidro aceso no frame 0 (${level})`);
      for (const level of [...glassOf(elements, 'haunted-mansion-rose'), ...glassOf(elements, 'haunted-mansion-lancet')]) {
        assert.ok(level >= 0.8, `${id} seed ${seed}: janela acesa no frame 0 (${level})`);
      }
      for (const element of elements) assert.equal(element.opacity, 1, `${id}: tudo visível no frame 0`);
      if (frame.glow === 0) for (const element of elements) assert.equal(element.light, 0, `${id}: sem luz com glow 0`);
      else assert.ok(elements.some((element) => element.light > 0 && element.lightOpacity > 0), `${id}: lanternas com luz`);
    }
  }
});

test('haunted-mansion: a luz não passa do corpo + max(4, ¼ do alcance) e nunca tira espaço do corpo', () => {
  for (const size of NAMED_SIZES) {
    for (const ornamentSize of [36, 128]) {
      const {frame, placements, props} = kitAt(size.id, {ornamentSize});
      for (const element of build(frame, placements, props, 0, framesOf(props))) {
        if (element.light === 0) continue;
        const placement = placements[element.anchor]!;
        const where = `${size.id} @${ornamentSize} ${element.type}`;
        // Lamps: against the lamp head's own reach (the bracket's bar is not a body the light may grow from).
        const body = element.type === 'haunted-mansion-lantern' ? lanternMountOf(frame, placement).lantern.reach : element.reach;
        assert.ok(element.light <= lightCap(body) + 1e-9, `${where}: luz ${element.light} > ${lightCap(body)}`);
        assert.ok(element.light <= placement.extent + 1e-9, where);
      }
    }
  }
  assert.equal(lightCap(19.3), 24.5);
  assert.equal(lightCap(27.5), 34.5);
});

test('haunted-mansion: tremulação em harmônicos inteiros (3,7 s e 12,25 s), igual ao fundo aos 16 s', () => {
  for (const durationSeconds of [3.7, 12.25, 16]) {
    for (const outputFormat of ['webm', 'gif'] as const) {
      const {frame, placements, props} = layoutAt('chat-vertical', {durationSeconds, outputFormat});
      const n = framesOf(props);
      assert.deepEqual(build(frame, placements, props, n, n), build(frame, placements, props, 0, n), `${durationSeconds} s ${outputFormat}: N = 0`);
      // Velocity through the seam: the step into frame 0 matches the step out of it (lamps and windows).
      for (const type of ['haunted-mansion-lantern', 'haunted-mansion-rose', 'haunted-mansion-lancet']) {
        const [before] = glassOf(build(frame, placements, props, -1, n), type);
        const [at] = glassOf(build(frame, placements, props, 0, n), type);
        const [after] = glassOf(build(frame, placements, props, 1, n), type);
        const [late] = glassOf(build(frame, placements, props, n - 1, n), type);
        assert.ok(Math.abs(before! - late!) < 1e-9, `${durationSeconds} s ${type}: frame −1 = N − 1`);
        assert.ok(Math.abs((after! - at!) - (at! - before!)) < 0.02, `${durationSeconds} s ${type}: sem quebra de velocidade na emenda`);
      }
    }
  }
  // At the background's 16 s the flicker has exactly the background's harmonics and amplitudes:
  // lanterns 3 and 7, windows (rose, lancets) 2 and 5.
  const {frame, placements, props} = layoutAt('chat-vertical');
  const n = framesOf(props);
  const spectrum = (type: string, base: number, harmonics: readonly number[], amplitudes: readonly number[]) => {
    const series = Array.from({length: n}, (_, at) => glassOf(build(frame, placements, props, at, n), type)[0]!);
    const amplitude = (k: number) => {
      let [s, c] = [0, 0];
      for (const [at, value] of series.entries()) {
        s += value * Math.sin(TAU * k * at / n);
        c += value * Math.cos(TAU * k * at / n);
      }
      return 2 * Math.hypot(s, c) / n;
    };
    harmonics.forEach((k, index) => assert.ok(Math.abs(amplitude(k) - amplitudes[index]!) < 1e-6, `${type}: harmônico ${k}`));
    for (let k = 1; k <= 8; k++) if (!harmonics.includes(k)) assert.ok(amplitude(k) < 1e-6, `${type}: sem harmônico ${k}`);
    assert.ok(Math.abs(series.reduce((sum, value) => sum + value, 0) / n - base) < 1e-9, type);
  };
  spectrum('haunted-mansion-lantern', MANSION_LANTERN_FLICKER.base, MANSION_LANTERN_FLICKER.harmonics, [MANSION_LANTERN_FLICKER.first, MANSION_LANTERN_FLICKER.second]);
  for (const type of ['haunted-mansion-rose', 'haunted-mansion-lancet']) {
    spectrum(type, WINDOW_FLICKER.base, WINDOW_FLICKER.harmonics, [WINDOW_FLICKER.first, WINDOW_FLICKER.second]);
  }
});

test('haunted-mansion: constantes vindas do fundo (lanterna, rosácea, lanceta, tremulações, cerca)', () => {
  // The background's own lanterns flicker with the exported constants (times windowIntensity).
  const background = hauntedMansionLoopSchema.parse({});
  const scene = getHauntedMansionScene(background, 123, 960);
  const phase = TAU * 123 / 960;
  const [k3, k7] = MANSION_LANTERN_FLICKER.harmonics;
  scene.filter((element) => element.kind === 'lantern').forEach((element, index) => {
    const expected = background.windowIntensity * (MANSION_LANTERN_FLICKER.base + MANSION_LANTERN_FLICKER.first * Math.sin(phase * k3 + index)
      + MANSION_LANTERN_FLICKER.second * Math.sin(phase * k7 + index));
    assert.ok(Math.abs(element.glow - expected) < 1e-12, 'a tremulação do fundo usa as constantes exportadas');
  });
  assert.equal(MANSION_LANTERN_FLICKER.seconds, background.durationSeconds);
  assert.equal(WINDOW_FLICKER.seconds, background.durationSeconds);
  // The background's windows glow at 2 and 5 cycles per loop with WINDOW_FLICKER's amplitudes (times windowIntensity).
  const windows = Array.from({length: 960}, (_, at) => getHauntedMansionScene(background, at, 960).find((element) => element.kind === 'window')!.glow);
  const amplitude = (k: number) => {
    let [s, c] = [0, 0];
    for (const [at, value] of windows.entries()) {
      s += value * Math.sin(TAU * k * at / 960);
      c += value * Math.cos(TAU * k * at / 960);
    }
    return 2 * Math.hypot(s, c) / 960 / background.windowIntensity;
  };
  const [k2, k5] = WINDOW_FLICKER.harmonics;
  assert.ok(Math.abs(amplitude(k2) - WINDOW_FLICKER.first) < 1e-9 && Math.abs(amplitude(k5) - WINDOW_FLICKER.second) < 1e-9);
  // The rose window and the lancet pane are the background's own (its dormer and its arched windows).
  const artwork = renderToStaticMarkup(createElement('svg', null, createElement(HauntedMansionArtwork, {
    stone: '#25323A', trim: ROSE.colors.trim, roof: ROSE.colors.roof, windowColor: '#E8AF62', windowLevels: Array(12).fill(0.7),
  })));
  for (const r of [ROSE.disc, ROSE.glass, ROSE.ring, ROSE.hub]) assert.match(artwork, new RegExp(`<circle cx="290" cy="328" r="${r}"`));
  assert.match(artwork, new RegExp(`stroke-width="${ROSE.trim}" stroke-opacity="${ROSE.trimOpacity}"`));
  assert.ok(artwork.includes(`d="${lancetPanePath(34, 69)}"`), 'a lanceta é o vitral do fundo');
  // The overlay draws the background's lamp head: its paths and its iron colours; the lancet at 14×26 px.
  const {adapter, props} = layoutAt('chat-vertical');
  const markup = adapter.render(props, 0, framesOf(props));
  for (const d of [MANSION_LANTERN.housing, MANSION_LANTERN.glass, MANSION_LANTERN.cap, MANSION_LANTERN.hook, lancetPanePath(LANCET.width, LANCET.height)]) {
    assert.ok(markup.includes(`d="${d}"`), `desenha ${d}`);
  }
  for (const color of [MANSION_LANTERN.colors.housing, MANSION_LANTERN.colors.housingEdge, MANSION_LANTERN.colors.cap, MANSION_FENCE.colors.iron, ROSE.colors.roof]) {
    assert.ok(markup.includes(color), `usa ${color}`);
  }
  // Fence grades: 20 px pitch with 9 px spears from 26 px up, 15 px pitch with 7 px spears under it;
  // the top rail under the collars, the bottom one near 0.9·H with whole-pixel edges (tips on whole pixels).
  const large = fenceMeasures(30);
  assert.deepEqual([large.pitch, large.spearWidth, large.spearHeight, large.rails[0], large.rails[1]], [20, 9, 13, 14.5, 26.5]);
  for (const height of [16, 24, 25.5, 27, 30, 36]) {
    for (const rail of fenceMeasures(height).rails) assert.equal(rail - 1.5, Math.round(rail - 1.5), `trilho em pixel inteiro (${height})`);
  }
  const small = fenceMeasures(24);
  assert.deepEqual([small.pitch, small.spearWidth, small.spearHeight], [15, 7, 10]);
  // Colours: amber glass from ornamentColors[2], moonlit edges from ornamentColors[1].
  assert.ok(markup.includes('#D6DDC7') && /stop-color="#[0-9A-Fa-f]{6}"/.test(markup));
  const {frame, placements} = layoutAt('chat-vertical');
  const lamp = build(frame, placements, props, 0, framesOf(props)).find((element) => element.type === 'haunted-mansion-lantern')!;
  assert.equal(lamp.warm, '#E8AF62');
  assert.equal(lamp.lit, '#D6DDC7');
});

test('haunted-mansion: nada desenha sobre o texto nos tamanhos extremos', () => {
  for (const id of ['chat-compact', 'chat-vertical', 'label-sm', 'twitch-panel', 'circle-sm', 'list', 'lower-third']) {
    for (const ornamentSize of [12, 36, 256]) {
      const {frame, placements, props} = layoutAt(id, {ornamentSize});
      const n = framesOf(props);
      for (const at of [0, 0.37 * n, 0.81 * n, n - 1]) {
        for (const element of build(frame, placements, props, at, n)) {
          const where = `${id} @${ornamentSize} ${element.type}#${element.anchor}`;
          for (const area of frame.keepOut) assert.ok(rectDistance(area, element.x, element.y) >= element.reach + 1 - 1e-9, `${where}: longe do texto`);
          if (element.light > 0 && meetsKeepOut(frame, element.x, element.y, element.light)) {
            assert.ok(element.lightOpacity <= MAX_CONTENT_OPACITY + 1e-9, `${where}: luz sobre o texto ≤ ${MAX_CONTENT_OPACITY}`);
          }
        }
      }
    }
  }
});

test('haunted-mansion: o gancho de pastor sai da borda de cima, sobe e passa pelo gancho da lanterna', () => {
  for (const id of [...CHATS, ...RECT_BLOCKS, ...RECT_CAMS, ...ROUND_CAMS, 'circle-sm', 'circle', 'circle-lg', 'label-sm', 'label']) {
    const {frame, placements} = kitAt(id);
    for (const placement of motifs(placements, 'lantern')) {
      const {lantern, hook} = lanternMountOf(frame, placement);
      const where = `${id} ${placement.slot}`;
      assert.ok(hook, `${where}: gancho`);
      // Its plate sits on the outline's top edge, the stem rises above it, the bar runs level through the hook's crook.
      assert.ok(Math.abs(roundRectSdf(frame.outline, hook.sx, hook.fy)) < 1e-6, `${where}: pé na borda`);
      assert.ok(hook.barY < hook.fy - 4, where);
      assert.ok(Math.abs(hook.barY - (lantern.oy + LANTERN_UNITS.armY * lantern.scale)) < 1e-9, where);
      const crook = lantern.ox + lantern.side * LANTERN_UNITS.hookX * lantern.scale;
      assert.ok(hook.side * (crook - hook.split) >= 0 && hook.side * (hook.tipX - crook) > 0, `${where}: a barra atravessa o gancho`);
      // The lamp's circle is centred on the corner's best spot (it covers the round corner).
      const corner = cornerSlot(frame, placement.slot as 'TR');
      const {t} = roomAt(frame, corner, 'front');
      assert.ok(Math.hypot(placement.x - (corner.x + t * corner.dx), placement.y - (corner.y + t * corner.dy)) < 1e-9, `${where}: no melhor ponto`);
      // On a rect outline the stem rises 0.3 of the lamp's height (or more) in from the corner.
      if (!frame.circle) {
        const edge = hook.side > 0 ? frame.outline.x + frame.outline.width : frame.outline.x;
        assert.ok(hook.side * (edge - hook.sx) >= 0.3 * placement.size - 1e-9, `${where}: haste perto demais do canto`);
      }
    }
  }
});

// --- Ink: the points every element actually paints (its markup, stroke half-widths included: helpers/ink.ts). ---

/** Every element's placement and ink at a frame. */
const inkedElements = (frame: OrnamentFrame, placements: readonly OrnamentPlacement[], props: OrnamentProps, at: number) => {
  const elements = build(frame, placements, props, at, framesOf(props));
  return elements.map((element, key) => ({
    element, placement: placements[element.anchor]!,
    ink: inkOf(renderToStaticMarkup(createElement('svg', null, hauntedMansionSet.render(element as never, key, {idBase: 'test-ornament-front', frame, style: props})))),
  }));
};

/** The lamp's housing and roof cap, in its units (MANSION_LANTERN): what a bracket must never cross. */
const LAMP_BODY = {
  housing: [[-21, -20], [21, -20], [15, 27], [-15, 27]],
  cap: [[-22, -21], [-15, -30], [15, -30], [22, -21]],
} as const;
const insidePolygon = (polygon: readonly (readonly number[])[], x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]! as [number, number];
    const [xj, yj] = polygon[j]! as [number, number];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

test('haunted-mansion: o suporte (gancho ou braço) nunca atravessa a lanterna, também em paredes redondas', () => {
  const cases: [string, Record<string, unknown>][] = [];
  for (const id of ['circle-sm', 'circle', 'circle-lg', ...ROUND_CAMS, 'chat-standard', 'card', 'webcam-16x9', 'label-sm']) {
    for (const ornamentSize of [36, 128, 256]) cases.push([id, {ornamentSize}]);
  }
  cases.push(['webcam-16x9', {radius: 200}], ['card', {radius: 200}], ['circle', {accent: 'left'}], ['circle', {accent: 'top'}],
    ['chat-standard', {bleed: 16, glow: 8, halo: 0}]);
  for (const id of ['gameplay', 'webcam-16x9-lg', 'fullscreen', 'fullscreen-vertical']) cases.push([id, {radius: 48, thickness: 24, corners: 'none'}], [id, {corners: 'none'}]);
  let armed = 0;
  for (const [id, extra] of cases) {
    const {frame, placements, props} = layoutAt(id, extra);
    const drawn = inkedElements(frame, placements, props, 0);
    for (const placement of placements.filter((candidate) => ['lantern', 'lantern-wall', 'sconce'].includes(candidate.motif))) {
      const {lantern} = lanternMountOf(frame, placement);
      // Every arm follows its lamp.
      const arm = drawn.find(({placement: owner}) => owner === placements[placements.indexOf(placement) + 1] && owner.motif === 'arm')!;
      assert.ok(arm, `${id} ${placement.slot}: suporte da lanterna`);
      armed++;
      // The bracket is painted under its lamp (the hook over the bar).
      assert.ok(drawn.indexOf(arm) < drawn.findIndex(({element}) => element.anchor === placements.indexOf(placement)), `${id}: suporte antes da lanterna`);
      for (const {x, y, half} of arm.ink) {
        for (const [dx, dy] of [[0, 0], [half, 0], [-half, 0], [0, half], [0, -half]] as const) {
          const ux = (x + dx - lantern.ox) / (lantern.side * lantern.scale);
          const uy = (y + dy - lantern.oy) / lantern.scale;
          for (const [part, polygon] of Object.entries(LAMP_BODY)) {
            assert.ok(!insidePolygon(polygon, ux, uy), `${id} ${JSON.stringify(extra)} ${placement.slot}: o suporte entra no ${part} da lanterna (${x.toFixed(1)}, ${y.toFixed(1)})`);
          }
        }
      }
    }
  }
  assert.ok(armed >= 40, String(armed));
});

test('haunted-mansion: a tinta (traços inclusos) cabe no círculo de cada lugar, no arquivo e fora do buraco', () => {
  const cases: [string, Record<string, unknown>, boolean][] = [];
  for (const size of NAMED_SIZES) {
    for (const ornamentSize of [12, 36, 256]) cases.push([size.id, {ornamentSize}, false]);
    cases.push([size.id, {}, true]);
  }
  for (const size of NAMED_SIZES.filter((candidate) => candidate.kind === 'border')) for (const radius of [0, 200]) cases.push([size.id, {radius}, false]);
  for (const [id, extra, kit] of cases) {
    const {frame, placements, props} = kit ? kitAt(id, extra) : layoutAt(id, extra);
    const limit = frame.paintLimit;
    for (const {element, placement, ink} of inkedElements(frame, placements, props, 0)) {
      const where = `${id} ${kit ? 'kit' : JSON.stringify(extra)} ${element.type}@${placement.slot}#${element.anchor}`;
      for (const {x, y, half} of ink) {
        assert.ok(Math.hypot(x - placement.x, y - placement.y) + half <= placement.extent + 0.05, `${where}: tinta fora do círculo (${x.toFixed(1)}, ${y.toFixed(1)})`);
        assert.ok(Math.min(x - limit.x, limit.x + limit.width - x, y - limit.y, limit.y + limit.height - y) - half >= 0, `${where}: tinta fora do arquivo`);
        if (frame.hole) assert.ok(roundRectSdf(frame.hole, x, y) - half >= -0.05, `${where}: tinta no buraco`);
      }
    }
  }
});

test('haunted-mansion: na tela os enfeites ficam na faixa e no máximo `glow` px sobre a borda da imagem', () => {
  for (const id of ['fullscreen', 'fullscreen-vertical']) {
    for (const extra of [{}, {glow: 12, thickness: 12, lines: 2, radius: 10}, {glow: 16, ornamentSize: 48}, {radius: 48}, {thickness: 24}, SCREEN_PROPS]) {
      const {frame, placements, props} = layoutAt(id, extra);
      const {window} = getBorderGeometry(props as never).layout;
      const where = `${id} ${JSON.stringify(extra)}`;
      let deepest = -Infinity;
      for (const {ink} of inkedElements(frame, placements, props, 0)) {
        for (const {x, y, half} of ink) deepest = Math.max(deepest, half - roundRectSdf(window, x, y));
      }
      // Only the band and its inner glow margin (window minus holeShape), where the band's glow already paints.
      assert.ok(deepest <= frame.glow + 0.05, `${where}: ${deepest.toFixed(1)} px dentro da imagem (glow ${frame.glow})`);
      // The fence stands low on the file's bottom edge: its circle rests on the edge (1 px above
      // it), plus at most 1 px from snapping the tips to whole pixels.
      const bottom = frame.paintLimit.y + frame.paintLimit.height;
      for (const picket of fences(placements)) {
        const {centre} = fenceMeasures(picket.size);
        const base = picket.y - centre + picket.size;
        const rest = picket.extent - (picket.size - centre) + 1;
        assert.ok(bottom - base >= rest - 1e-9 && bottom - base <= rest + 1 + 1e-9, `${where}: base da cerca a ${bottom - base} px da borda`);
      }
    }
  }
});

test('haunted-mansion: sob cantos redondos grandes (até pílulas) a cerca começa onde as lanças alcançam o contorno', () => {
  const cases: [string, Record<string, unknown>][] = [];
  for (const id of ['webcam-16x9', 'gameplay', 'card', 'chat-standard', 'lower-third']) for (const radius of [0, 10, 40, 200]) cases.push([id, {radius}], [id, {radius, ornamentSize: 60}]);
  for (const [id, extra] of cases) {
    const {frame, placements} = layoutAt(id, extra);
    const {outline} = frame;
    const right = outline.x + outline.width;
    const fence = fences(placements);
    assert.ok(fence.length >= 6, `${id} ${JSON.stringify(extra)}: cerca`);
    for (const picket of fence) {
      const where = `${id} ${JSON.stringify(extra)}: estaca em x ${picket.x}`;
      const {pitch, centre} = fenceMeasures(picket.size);
      if (picket.x < outline.x || picket.x > right) {
        // Only the outer post stands past the side, and only beside a small corner.
        assert.ok((extra.radius as number) <= 10 && Math.min(outline.x - picket.x, picket.x - right) <= pitch, where);
        continue;
      }
      // The spear's tip reaches the outline: the railing never floats below a round corner.
      assert.ok(roundRectSdf(outline, picket.x, picket.y - centre) <= 1, `${where}: lança longe do contorno`);
    }
    const left = fences(placements, 'BL');
    const rightRun = fences(placements, 'BR');
    assert.ok(Math.max(...left.map((picket) => picket.x)) < Math.min(...rightRun.map((picket) => picket.x)), `${id}: as duas cercas não se cruzam`);
  }
});

test('haunted-mansion: as cercas BL e BR ficam ao menos um passo afastadas (cantos grandes, faixa grossa, pouca sangria)', () => {
  const cases: [string, Record<string, unknown>][] = [];
  const panels = ['chat-compact', 'chat-standard', 'square', 'list'];
  const frames = ['webcam-4x3', 'webcam-square', 'webcam-vertical', 'fullscreen-vertical'];
  for (const id of [...panels, ...frames]) {
    const extras: Record<string, unknown>[] = panels.includes(id) ? [{}, {bleed: 16, glow: 8, halo: 0}, {bleed: 24, glow: 12, halo: 0}] : [{corners: 'none'}, {corners: 'none', thickness: 24}];
    for (const radius of [10, 120, 160, 200, 300, 1000]) for (const ornamentSize of [36, 48, 80]) for (const extra of extras) {
      cases.push([id, {radius, ornamentSize, ...extra}]);
    }
  }
  let withFence = 0;
  for (const [id, extra] of cases) {
    const where = `${id} ${JSON.stringify(extra)}`;
    const {adapter, placements} = layoutAt(id, extra);
    assert.deepEqual(adapter.issues({...KIT, ...sizeProps(getSize(id)), ...extra}), [], `${where}: props válidos`);
    // A hung hero keeps a hung partner (the pair matches).
    const lamps = lanterns(placements);
    assert.ok(lamps.every((lamp) => (lamp.motif === 'lantern-hung') === (lamps[0]!.motif === 'lantern-hung')), `${where}: par de lanternas do mesmo tipo`);
    const left = fences(placements, 'BL');
    const right = fences(placements, 'BR');
    if (left.length === 0 || right.length === 0) continue;
    withFence++;
    const {pitch} = fenceMeasures(left[0]!.size);
    const gap = Math.min(...right.map((picket) => picket.x)) - Math.max(...left.map((picket) => picket.x));
    assert.ok(gap >= pitch, `${where}: cercas a ${gap} px (passo ${pitch})`);
    assert.equal(left.length, right.length, `${where}: cercas simétricas`);
  }
  assert.ok(withFence >= cases.length / 3, `cercas em ${withFence} de ${cases.length} casos`);
});

/** The rects of a path made of `M x y H x V y H x Z` pieces (the fence's and the gate's iron and lit lines). */
const rectsOf = (d: string) => [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)H(-?[\d.]+)V(-?[\d.]+)H-?[\d.]+Z/g)].map((match) => {
  const [x0, y0, x1, y1] = match.slice(1, 5).map(Number) as [number, number, number, number];
  return {x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1)};
});
type PathTag = {d: string; fill?: string; stroke?: string; opacity: number; transform?: string};
const pathsOf = (markup: string): PathTag[] => [...markup.matchAll(/<path ([^>]*?)\/?>/g)].map(([, text]) => {
  const attrs: Record<string, string> = {};
  for (const [, key, value] of text!.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[key!] = value!;
  return {d: attrs.d!, fill: attrs.fill, stroke: attrs.stroke, opacity: Number(attrs.opacity ?? 1), transform: attrs.transform};
});

test('haunted-mansion: toda estaca, poste e barra tem luar de 2 px (#D6DDC7 ≥ 0,55) do colar ao pé, sobre o ferro; trilhos só no lado da lua', () => {
  let members = 0;
  let rails = 0;
  for (const size of NAMED_SIZES) {
    const {frame, placements, props} = kitAt(size.id);
    const elements = build(frame, placements, props, 0, framesOf(props)).filter((element) => element.type === 'haunted-mansion-fence' || element.type === 'haunted-mansion-gate');
    for (const [key, element] of elements.entries()) {
      const markup = renderToStaticMarkup(createElement('svg', null, hauntedMansionSet.render(element as never, key, {idBase: 't-ornament-front', frame, style: props})));
      const paths = pathsOf(markup);
      const lastIron = paths.reduce((last, path, index) => (path.fill === '#080E16' || path.stroke === '#080E16' ? index : last), -1);
      const lineTags = paths.filter((path) => path.fill === '#D6DDC7' && !path.transform);
      const lines = lineTags.flatMap((path) => rectsOf(path.d).map((rect) => ({...rect, opacity: path.opacity})));
      const where = `${size.id} ${element.type}#${element.anchor}`;
      // Lines painted after all the iron (and the gate's arch), so the verticals cross both rails unbroken.
      for (const tag of lineTags) assert.ok(paths.indexOf(tag) > lastIron, `${where}: linha de luar sob o ferro`);
      const copies = paths.filter((path) => path.fill === '#D6DDC7' && path.transform === 'translate(0 -1)').flatMap((path) => rectsOf(path.d));
      for (const iron of paths.filter((path) => path.fill === '#080E16').flatMap((path) => rectsOf(path.d))) {
        const [w, h] = [iron.x1 - iron.x0, iron.y1 - iron.y0];
        // Collars and cap plates (2 px) carry the spear's and the finial's lit copy instead.
        if (Math.min(w, h) < 3 || Math.max(w, h) < 6) continue;
        if (h > w) {
          members++;
          // The iron's moon-side column and the one past it, from the collar (cap, arch) to the base.
          const line = lines.find((lit) => Math.abs(lit.x0 - (iron.x1 - 1)) < 1e-6 && lit.x1 - lit.x0 >= 2);
          assert.ok(line, `${where}: barra vertical em x ${iron.x0}–${iron.x1} sem linha de luar de 2 px`);
          assert.ok(line.opacity >= 0.5 - 1e-9 && (element.post || line.opacity >= 0.55 - 1e-9), `${where}: luar fraco (${line.opacity})`);
          assert.ok(Math.abs(line.y1 - iron.y1) < 1e-6 && line.y0 - iron.y0 <= 4 && line.y0 >= iron.y0 - 1e-6, `${where}: luar de ${line.y0} a ${line.y1}, ferro ${iron.y0}–${iron.y1}`);
          assert.ok(Number.isInteger(line.x0) && Number.isInteger(line.y0) && Number.isInteger(line.y1), `${where}: linha fora do pixel inteiro`);
        } else {
          rails++;
          const overlaps = (lit: {x0: number; x1: number}) => Math.min(lit.x1, iron.x1) - Math.max(lit.x0, iron.x0) >= 0.5 * w;
          // Top edge lit: a 1 px line over it, or the rail's copy moved up; never its underside.
          const top = lines.find((lit) => lit.y1 - lit.y0 === 1 && Math.abs(lit.y1 - iron.y0) < 1e-6 && overlaps(lit))
            ?? copies.find((lit) => Math.abs(lit.y0 - iron.y0) < 1e-6 && overlaps(lit));
          assert.ok(top, `${where}: trilho em y ${iron.y0}–${iron.y1} sem luar em cima`);
          assert.ok(!lines.some((lit) => lit.y1 - lit.y0 === 1 && Math.abs(lit.y0 - iron.y1) < 1e-6 && overlaps(lit)), `${where}: luar embaixo do trilho`);
        }
      }
      // The spear heads, finials and caps, the top rail and the gate's arch keep their lit copies (moved towards the moon).
      assert.ok(paths.some((path) => (path.fill === '#D6DDC7' || path.stroke === '#D6DDC7') && path.transform && path.opacity >= 0.5), `${where}: cópia iluminada`);
    }
  }
  assert.ok(members > 300 && rails > 600, `${members} barras, ${rails} trilhos`);
});

test('haunted-mansion: arandelas nas laterais das bordas grandes e o portão no meio de baixo', () => {
  // Sconces: 44 px on gameplay and webcam-16x9-lg, straddling the outline's side at its middle; on the telas
  // (pack props) as tall as the band allows (≥ 28), every 480 px: fullscreen at y 540, fullscreen-vertical at 480 / 960 / 1440.
  const expected: Record<string, number[]> = {'gameplay': [453], 'webcam-16x9-lg': [318], 'fullscreen': [540], 'fullscreen-vertical': [480, 960, 1440]};
  for (const [id, ys] of Object.entries(expected)) {
    const {frame, placements, props} = kitAt(id);
    const sconces = motifs(placements, 'sconce');
    assert.deepEqual(sconces.map((sconce) => `${sconce.slot}@${sconce.y}`), [...ys.map((y) => `left@${y}`), ...ys.map((y) => `right@${y}`)], id);
    for (const sconce of sconces) {
      const {lantern, arm} = lanternMountOf(frame, sconce);
      assert.ok(arm, `${id}: braço`);
      if (frame.fit === 'screen') assert.ok(sconce.size >= SCONCE_MIN && sconce.size <= SCONCE_HEIGHT, `${id}: ${sconce.size}`);
      else assert.equal(sconce.size, SCONCE_HEIGHT, id);
      const line = sconce.slot === 'left' ? frame.outline.x : frame.outline.x + frame.outline.width;
      if (frame.fit !== 'screen') assert.ok(Math.abs(lantern.cx - line) < lantern.reach, `${id}: a lanterna cavalga a linha de fora`);
      // The arm follows its lamp and rests level on the hook's crook.
      assert.equal(placements[placements.indexOf(sconce) + 1]!.motif, 'arm');
      assert.ok(Math.abs(arm!.hy - (lantern.oy + LANTERN_UNITS.armY * lantern.scale)) < 1e-9, id);
    }
    const elements = build(frame, placements, props, 0, framesOf(props));
    for (const element of elements.filter((candidate) => candidate.type === 'haunted-mansion-lantern' && placements[candidate.anchor]!.motif === 'sconce')) {
      assert.ok(element.light > 0 && element.light <= lightCap(lanternMountOf(frame, placements[element.anchor]!).lantern.reach) + 1e-9, id);
    }
  }
  // No sconce without glow's light: a copy with glow 0 keeps the sconces, unlit.
  {
    const {frame, placements, props} = kitAt('gameplay', {glow: 0, halo: 0});
    assert.equal(motifs(placements, 'sconce').length, 2);
    for (const element of build(frame, placements, props, 0, framesOf(props))) assert.equal(element.light, 0);
  }
  // The gate: at the outline's centre on the fence's base line, 7 + 22 + 22 + 7 px, the arch peaking at 36 (lower only where the band is short).
  for (const id of ['lower-third', 'title', 'gameplay', 'fullscreen', 'fullscreen-vertical']) {
    const {frame, placements, props} = kitAt(id);
    const gate = motifs(placements, 'gate');
    assert.equal(gate.length, 6, id);
    const strips = build(frame, placements, props, 0, framesOf(props)).filter((element) => element.type === 'haunted-mansion-gate');
    const gx = Math.round(frame.outline.x + frame.outline.width / 2);
    assert.deepEqual(strips.map((strip) => [strip.x0 as number - gx, strip.x1 as number - gx]),
      [[-GATE_LEAF - GATE_POST, -GATE_LEAF], [-GATE_LEAF, -GATE_LEAF / 2], [-GATE_LEAF / 2, 0], [0, GATE_LEAF / 2], [GATE_LEAF / 2, GATE_LEAF], [GATE_LEAF, GATE_LEAF + GATE_POST]]);
    const picket = fences(placements)[0]!;
    for (const strip of strips) {
      assert.equal(strip.base, picket.y - fenceMeasures(picket.size).centre + picket.size, `${id}: portão na linha da cerca`);
      assert.equal(strip.edge, picket.size, id);
    }
    const peak = gate[0]!.size;
    if (frame.fit === 'screen') assert.ok(peak >= picket.size + 2 && peak <= GATE_PEAK, `${id}: ${peak}`);
    else assert.equal(peak, GATE_PEAK, id);
    // Clear of the fence runs.
    for (const strip of gate) for (const other of fences(placements)) assert.ok(Math.abs(other.x - strip.x) >= other.extent + strip.extent, id);
  }
});
