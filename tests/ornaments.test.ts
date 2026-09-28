import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getHauntedInteriorScene, getWindowFlash, hauntedInteriorLoopSchema} from '../src/backgrounds/HauntedInteriorLoop';
import {
  buildFlashScene, cornerSlots, fitMotif, harmonics, ornamentOutset, roomAt, slideToFit, slotsOffAccent,
} from '../src/overlays/shared';
import {getCompositionMetadata} from '../src/settings';
import {getSize, sizeProps} from '../src/sizes';
import {REFUSAL, roundSize} from './helpers/ornament-harness';
import {ORNAMENT_KIND_NAMES, ORNAMENT_KINDS} from './helpers/ornament-kinds';
import {CLASSIC_THEMES} from './helpers/themes';

/**
 * The ornament engine's own rules: the classic themes untouched, the flash in step with the
 * interior background, the documented refusals and their ways out, and the placement helpers.
 * The per-set harness (every kind, size and kit preset) lives in tests/helpers/ornament-harness.ts
 * and runs from tests/ornaments-harness-<set>.test.ts.
 */

// ── Engine rules ────────────────────────────────────────────────────────────────────────────────

test('ornaments: com nenhum e lightning 0 os temas antigos não ganham camada, grupo nem outset', () => {
  for (const kindName of ORNAMENT_KIND_NAMES) {
    const adapter = ORNAMENT_KINDS[kindName];
    for (const theme of CLASSIC_THEMES) {
      for (const size of [adapter.sizes[0]!, roundSize(adapter)]) {
        const props = adapter.parse({...adapter.preset(theme), ...sizeProps(size)});
        assert.equal(props.ornaments, 'nenhum');
        assert.equal(props.lightning, 0);
        assert.deepEqual(adapter.ornamentLayout(props).placements, [], `${theme} ${size.id}`);
        assert.deepEqual(adapter.layers(props, 37, 480), {back: [], front: [], flash: []}, `${theme} ${size.id}`);
        assert.doesNotMatch(adapter.render(props, 37), /data-ornaments|data-flash|-ornament-|-flash-/, `${theme} ${size.id}`);
      }
    }
  }
});

test('ornaments: o clarão segue as janelas do fundo Salão assombrado (mesma seed e duração)', () => {
  for (const [seed, durationSeconds, outputFormat] of [[113, 16, 'webm'], [7, 12, 'webm'], [-3, 3.7, 'gif'], [2026, 8, 'mp4']] as const) {
    const background = hauntedInteriorLoopSchema.parse({seed, durationSeconds, outputFormat, lightningIntensity: 0.5});
    const n = getCompositionMetadata(background).durationInFrames;
    let lit = 0;
    for (let at = 0; at < n; at++) {
      const windows = getHauntedInteriorScene(background, at, n).filter((element) => element.kind === 'lightning');
      const [flash] = buildFlashScene({lightning: 0.7, seed, durationSeconds}, at, n);
      assert.ok(flash);
      assert.ok(Math.abs(flash.left - windows[0]!.opacity / 0.5) < 1e-12, `seed ${seed} frame ${at}: janela esquerda`);
      assert.ok(Math.abs(flash.right - windows[1]!.opacity / 0.5) < 1e-12, `seed ${seed} frame ${at}: janela direita`);
      assert.deepEqual([flash.left, flash.right], getWindowFlash({seed, durationSeconds}, at, n));
      if (flash.left > 0 || flash.right > 0) lit++;
    }
    assert.ok(lit > 0, `seed ${seed}: há clarões`);
    assert.deepEqual(buildFlashScene({lightning: 0, seed, durationSeconds}, 10, n), []);
  }
});

test('ornaments: quando nem o motivo principal cabe, a combinação é recusada com a saída', () => {
  // A block whose text fills the whole file: no corner has room in front of it.
  const input = {
    width: 320, height: 100, bleed: 0, radius: 0, strokeWidth: 0, paddingX: 0, paddingY: 0, glow: 0, halo: 0, ornaments: 'midnight',
  };
  const issues = ORNAMENT_KINDS.block.issues(input);
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0]!.path, ['ornaments']);
  assert.match(issues[0]!.message, REFUSAL);
  assert.deepEqual(ORNAMENT_KINDS.block.issues({...input, ornaments: 'nenhum'}), []);
  assert.equal(issues[0]!.message, 'The "midnight" ornaments do not fit this size: increase bleed, paddingX, paddingY or radius or use ornaments nenhum.');
  assert.deepEqual(ORNAMENT_KINDS.block.issues({...input, paddingX: 40, paddingY: 30}), [], 'bloco: a saída indicada resolve');
  // A border has no padding, and a screen frame no bleed: each names its own way out, which works.
  const border = {width: 200, height: 120, radius: 0, thickness: 2, strokeWidth: 2, glow: 0, halo: 0, corners: 'nenhum', ornaments: 'midnight'};
  for (const [input, wayOut, fixed] of [
    [{...border, fit: 'screen', bleed: 0}, 'increase thickness, glow or radius or use ornaments nenhum.', {radius: 60}],
    [{...border, fit: 'window', bleed: 8}, 'increase bleed or radius or use ornaments nenhum.', {bleed: 24}],
  ] as const) {
    const refused = ORNAMENT_KINDS.border.issues(input);
    assert.deepEqual(refused.map((issue) => [issue.path, issue.message]), [[['ornaments'], `The "midnight" ornaments do not fit this size: ${wayOut}`]], input.fit);
    assert.deepEqual(ORNAMENT_KINDS.border.issues({...input, ...fixed}), [], `${input.fit}: a saída indicada resolve`);
  }
  // A radius already at its maximum (a pill, a round screen frame) is not offered: raising it changes nothing.
  const pill = {width: 240, height: 64, radius: 32, bleed: 0, padding: 8, headerHeight: 0, glow: 0, halo: 0, ornaments: 'midnight'};
  const round = {
    width: 64, height: 64, fit: 'screen', shape: 'rectangle', bleed: 0, radius: 32, thickness: 4, glow: 0, strokeWidth: 0, lines: 1, corners: 'nenhum', ornaments: 'midnight',
  };
  for (const [adapter, input, wayOut, fixes] of [
    [ORNAMENT_KINDS.chat, pill, 'increase bleed or padding or use ornaments nenhum.', [{bleed: 64}, {padding: 20}]],
    [ORNAMENT_KINDS.border, round, 'increase thickness or glow or use ornaments nenhum.', [{thickness: 12}, {glow: 8}]],
  ] as const) {
    const message = [[['ornaments'], `The "midnight" ornaments do not fit this size: ${wayOut}`]];
    assert.deepEqual(adapter.issues(input).map((issue) => [issue.path, issue.message]), message, adapter.kind);
    assert.deepEqual(adapter.issues({...input, radius: 1920}).map((issue) => [issue.path, issue.message]), message, `${adapter.kind}: radius maior não muda nada`);
    for (const fixed of fixes) assert.deepEqual(adapter.issues({...input, ...fixed}), [], `${adapter.kind} ${JSON.stringify(fixed)}: a saída indicada resolve`);
  }
});

test('ornaments: relâmpago num ciclo curto demais para um raio é recusado com a saída', () => {
  const message = 'With durationSeconds below 1.5 s there is no lightning: use durationSeconds ≥ 1.5 or lightning 0.';
  for (const kindName of ORNAMENT_KIND_NAMES) {
    const adapter = ORNAMENT_KINDS[kindName];
    for (const ornaments of ['nenhum', 'midnight']) {
      for (const durationSeconds of [0.5, 1, 1.4]) {
        const input = {durationSeconds, lightning: 0.8, ornaments};
        assert.deepEqual(adapter.issues(input).map((issue) => [issue.path, issue.message]), [[['lightning'], message]], `${kindName} ${durationSeconds}s`);
        assert.deepEqual(adapter.issues({...input, lightning: 0}), [], `${kindName} ${durationSeconds}s: lightning 0 resolve`);
      }
      assert.deepEqual(adapter.issues({durationSeconds: 1.5, lightning: 0.8, ornaments}), [], `${kindName}: 1,5 s tem um relâmpago`);
    }
  }
});

test('ornaments: lugares nos cantos, espaço livre e deslize ao longo da diagonal', () => {
  const adapter = ORNAMENT_KINDS.block;
  const round = adapter.ornamentLayout(adapter.parse({...sizeProps(getSize('circle')), ornaments: 'midnight', accent: 'esquerda'})).frame;
  const {outline} = round;
  const [cx, cy, r] = [outline.x + outline.width / 2, outline.y + outline.height / 2, outline.width / 2];
  // A circle's slots are its 45° points, in the order TR, BR, BL, TL.
  assert.deepEqual(cornerSlots(round).map((slot) => slot.slot), ['TR', 'BR', 'BL', 'TL']);
  for (const slot of cornerSlots(round)) {
    assert.ok(Math.abs(Math.hypot(slot.x - cx, slot.y - cy) - r) < 1e-9, slot.slot);
    assert.ok(Math.abs(Math.abs(slot.x - cx) - Math.abs(slot.y - cy)) < 1e-9, slot.slot);
  }
  assert.deepEqual(slotsOffAccent(round).map((slot) => slot.slot), ['TR', 'BR']);
  assert.deepEqual(slotsOffAccent({...round, accent: 'topo'}).map((slot) => slot.slot), ['BR', 'BL']);
  assert.equal(slotsOffAccent({...round, circle: false}).length, 4);

  const chat = ORNAMENT_KINDS.chat;
  const frame = chat.ornamentLayout(chat.parse({ornaments: 'midnight'})).frame;
  const tr = cornerSlots(frame)[0]!;
  const room = roomAt(frame, tr, 'front');
  assert.ok(room.extent > 20 && room.extent < 40, `espaço do canto do chat: ${room.extent}`);
  // Asked for less than the room: the motif keeps its size, centred as near the preference as it fits.
  const small = fitMotif(frame, tr, {motif: 'x', layer: 'front', nominal: 10, min: 4, ratio: 2})!;
  assert.equal(small.extent, 10);
  assert.equal(small.size, 20);
  // Asked for more: clamped to the room; below its minimum: dropped.
  assert.equal(fitMotif(frame, tr, {motif: 'x', layer: 'front', nominal: 500, min: 4})!.extent, room.extent);
  assert.equal(fitMotif(frame, tr, {motif: 'x', layer: 'front', nominal: 500, min: room.extent + 1}), null);
  // The hero (SPEC §2.3): a nominal under its minimum still places, at the nominal, where the room
  // holds it; it is dropped only when the room cuts it below both.
  assert.equal(fitMotif(frame, tr, {motif: 'x', layer: 'front', nominal: 3, min: 6}), null);
  assert.equal(fitMotif(frame, tr, {motif: 'x', layer: 'front', nominal: 3.2, min: 6, hero: true})!.extent, 3);
  assert.equal(fitMotif(frame, tr, {motif: 'x', layer: 'front', nominal: 500, min: 6, hero: true})!.extent, room.extent);
  assert.equal(fitMotif(frame, tr, {motif: 'x', layer: 'front', nominal: 500, min: room.extent + 1, hero: true}), null);
  // The fitting slide nearest the preference.
  const near = slideToFit(frame, tr, 10, 'front', undefined, 0)!;
  assert.ok(near.t >= 0);
  assert.equal(slideToFit(frame, tr, room.extent + 5, 'front'), null);
  // Behind, the centre stays at or beyond the corner.
  const back = fitMotif(frame, cornerSlots(frame)[2]!, {motif: 'x', layer: 'back', nominal: 500, min: 4})!;
  assert.ok((back.x - cornerSlots(frame)[2]!.x) * -1 >= -1e-9 && back.y - cornerSlots(frame)[2]!.y >= -1e-9);
  assert.equal(ornamentOutset(frame, [{...small, x: frame.box.x, y: frame.box.y}]), 10);
  assert.equal(ornamentOutset(frame, []), 0);
  // A screen frame has no back room (the rest of its box is the band's fillet, under the band fill).
  const borderKind = ORNAMENT_KINDS.border;
  for (const size of ['fullscreen', 'fullscreen-vertical']) {
    for (const extra of [{}, {radius: 48}]) {
      const screen = borderKind.ornamentLayout(borderKind.parse({...sizeProps(getSize(size)), ...extra, ornaments: 'midnight'}));
      for (const corner of cornerSlots(screen.frame)) {
        assert.equal(roomAt(screen.frame, corner, 'back').extent, 0, `${size} ${corner.slot}`);
        assert.equal(fitMotif(screen.frame, corner, {motif: 'x', layer: 'back', nominal: 500, min: 0.5}), null, `${size} ${corner.slot}`);
      }
      assert.ok(screen.placements.length > 0 && screen.placements.every((placement) => placement.layer === 'front'), size);
    }
  }
  assert.equal(harmonics(2, 12), 24);
  assert.equal(harmonics(0.01, 12), 1);
});
