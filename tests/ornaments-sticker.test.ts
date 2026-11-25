import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {svgNumber} from '../src/overlays/shared/geometry';
import {scaleOrnamentFrame} from '../src/overlays/shared/ornaments/frame';
import {ornamentRandom} from '../src/overlays/shared/ornaments/place';
import {
  BOLT_POINTS, extentOf, LINE_THICK, LINE_THIN, lineOf, MOTIF_TILT, motifPath, motifPoints, reachOf, shapeHeight, sizeOf, SPAN,
} from '../src/overlays/shared/ornaments/sets/sticker-motifs';
import {
  minExtentOf, placeSticker, SCREEN_STAR_MIN, STICKER_MIN_EXTENT, STICKER_RIM, STICKER_SIZES, type StickerPlacement,
} from '../src/overlays/shared/ornaments/sets/sticker-place';
import {STICKER_POSES, stepAt, stepsPerLoop, stickerPoseAt, type StickerMotif} from '../src/overlays/shared/ornaments/sets/sticker-steps';
import {STICKER_INK, stickerSet, type StickerOrnamentElement} from '../src/overlays/shared/ornaments/sets/sticker';
import type {OrnamentFrame, OrnamentStyle} from '../src/overlays/shared/ornaments/types';
import {getSize, NAMED_SIZES, sizeProps} from '../src/sizes';
import {framesOf, ORNAMENT_KINDS, type OrnamentKindName, type OrnamentProps} from './helpers/ornament-kinds';
import {REFUSAL} from './helpers/ornament-harness';
import {borderLoopSchema} from '../src/overlays/border';
import {blockLoopSchema} from '../src/overlays/block';
import {chatLoopSchema} from '../src/overlays/chat';
import {readFileSync} from 'node:fs';

/**
 * The 'sticker' set (Sticker Pop, D-03) before it is registered: placed and built directly on the
 * frames the kinds build for the kit's presets (SPEC §5, as objects here; the preset files come
 * with the kit). Sizes and extents of the three motifs, the slots per kind, what drops out and the
 * refusal, the steps of the motion and the frame-0 pose, the rim and the light. Each test names, in
 * a comment, a mutation that makes it fail. Run with `npx tsx --test tests/ornaments-sticker.test.ts`.
 */

const COLORS = ['#F4A66C', '#F6E2E4', '#E9BA67'];
const BUTTONS = ['#9AC7F2', '#EE9DE6', '#F4A66C'];
const INDIGO = ['#4A3A69', '#4F3F70'];
const COMMON = {durationSeconds: 12, seed: 23, ornamentColors: COLORS, ornamentSize: 36, lightning: 0, halo: 0};
/** The kit's presets (SPEC §5). The frame is the kind's own, so they parse with ornaments 'none' until the set is registered. */
const PRESETS: Record<OrnamentKindName, Record<string, unknown>> = {
  chat: {
    ...COMMON, strokeWidth: 6, strokeMotion: 'gradient', strokeColors: INDIGO, strokeSpeed: 48, strokeCore: 0,
    fill: 'solid', fillColors: ['#F6E2E4'], fillOpacity: 1, radius: 15, strokeMargin: 3, strokeMarginColor: '#F6E2E4',
    headerHeight: 39, headerColor: '#F74CA9', headerOpacity: 1, headerLineWidth: 6,
    titleButtonSize: 24, titleButtonGap: 7, titleButtonInset: 12, titleButtonColors: BUTTONS,
    depth: 8, depthColor: '#F5A09E', padding: 24, glow: 2, glowStrength: 0.25,
  },
  block: {
    ...COMMON, strokeWidth: 6, strokeMotion: 'still', strokeColors: ['#4A3A69'],
    fill: 'gradient', fillColors: ['#F74CA9', '#EF6AA0'], fillSpeed: 16, fillOpacity: 1, radius: 12,
    strokeMargin: 3, strokeMarginColor: '#F6E2E4', accent: 'none', depth: 6, depthColor: '#C554A6', paddingX: 28, paddingY: 12, glow: 0,
  },
  border: {
    ...COMMON, strokeWidth: 6, lines: 1, corners: 'none', strokeMotion: 'gradient', strokeColors: INDIGO, strokeSpeed: 48, strokeCore: 0,
    thickness: 12, fill: 'solid', fillColors: ['#F6E2E4'], fillOpacity: 1, radius: 12,
    titleBarHeight: 24, titleBarColor: '#F74CA9', titleBarLineWidth: 6, titleButtonSize: 18, titleButtonGap: 5, titleButtonInset: 14,
    titleButtonColors: BUTTONS, depth: 8, depthColor: '#F5A09E', glow: 0,
  },
};

type Case = {label: string; sizeId: string; props: OrnamentProps; frame: OrnamentFrame};

/** The kind's frame for a named size under the kit's preset, in the set's own space (shrunk by 1/ornamentScale, as layoutOrnaments does). */
const caseOf = (sizeId: string, extra: Record<string, unknown> = {}): Case => {
  const size = getSize(sizeId);
  const kind = size.kind as OrnamentKindName;
  const adapter = ORNAMENT_KINDS[kind];
  const props = adapter.parse({...PRESETS[kind], ...sizeProps(size), ...extra, ornaments: 'none'});
  const frame = adapter.ornamentLayout(props).frame;
  const scale = props.ornamentScale;
  const label = Object.keys(extra).length > 0 ? `${sizeId} ${JSON.stringify(extra)}` : sizeId;
  return {label, sizeId, props, frame: scale === 1 ? frame : scaleOrnamentFrame(frame, 1 / scale)};
};

const ORNAMENT_SIZE_IDS = NAMED_SIZES.filter((size) => size.kind in ORNAMENT_KINDS).map((size) => size.id);
/** Every named size of the three kinds, and the pack's two scaled webcams. */
const CASES: Case[] = [
  ...ORNAMENT_SIZE_IDS.map((id) => caseOf(id)),
  caseOf('webcam-16x9-lg', {bleed: 72, ornamentScale: 1.5}),
  caseOf('gameplay', {bleed: 96, ornamentScale: 2}),
];

const styleOf = (props: OrnamentProps, extra: Partial<OrnamentStyle> = {}): OrnamentStyle => ({
  ornaments: 'none', ornamentColors: props.ornamentColors, ornamentSize: props.ornamentSize, ornamentScale: props.ornamentScale,
  lightning: 0, seed: props.seed, durationSeconds: props.durationSeconds, transparent: true, ...extra,
});

const place = (item: Case, ornamentSize = 36) => stickerSet.place(item.frame, {ornamentSize});
const build = (item: Case, frameIndex: number, extra: Partial<OrnamentStyle> = {}) =>
  stickerSet.build(item.frame, place(item), styleOf(item.props, extra), frameIndex, framesOf(item.props));

const groupOf = (item: Case) => {
  const size = getSize(item.sizeId);
  if (size.kind === 'chat') return 'chat';
  if (size.kind === 'block') {
    if (size.id === 'twitch-panel') return 'twitch';
    if (size.props?.shape === 'circle') return 'round block';
    return size.height <= 96 ? 'label' : 'tall block';
  }
  if (size.props?.fit === 'screen') return 'screen';
  return size.props?.shape === 'circle' ? 'round border' : 'border';
};

// --- 3.2 sizes and extents -------------------------------------------------------------------

// Dies with: the sparkle's 1.1 blink → 1.0 in STICKER_POSES (`[1, 0.8, 1, 1.1]` → `[1, 0.8, 1, 1.0]`), the bolt's
// box 0.62 → 0.5, the 3 px line from 24 px → from 20 px (`size < LINE_STEP` → `size <= 20`).
test('sticker: o alcance de cada motivo pela tabela (estrela size/2, brilho 1,1·h/2 + linha/2, raio 0,588·h + linha/2)', () => {
  assert.equal(lineOf(23.5), LINE_THIN);
  assert.equal(lineOf(24), LINE_THICK);
  assert.equal(lineOf(20), 2);
  assert.ok(Math.abs(extentOf('star', 36, 0) - 18) < 1e-9);
  assert.ok(Math.abs(extentOf('star', 20, 0) - 10) < 1e-9);
  assert.ok(Math.abs(extentOf('sparkle', 36, 0) - (1.1 * 33 / 2 + 1.5)) < 1e-9);
  assert.ok(Math.abs(extentOf('sparkle', 20, 0) - (1.1 * 18 / 2 + 1)) < 1e-9);
  assert.ok(Math.abs(SPAN.bolt - Math.hypot(0.31, 0.5)) < 1e-9);
  assert.ok(Math.abs(extentOf('bolt', 39.6, 0) - (Math.hypot(0.31, 0.5) * 36.6 + 1.5)) < 1e-9);
  // The rim adds itself to the reach and takes twice itself off the shape's height.
  assert.ok(Math.abs(extentOf('star', 36, 4) - ((36 - 3 - 8) / 2 + 1.5 + 4)) < 1e-9);
});

// Dies with: the sparkle's minimum 20 → 16 in STICKER_SIZES, `ceilHalf` → `floorHalf` in minExtentOf, the bolt's 30 → 20.
test('sticker: os mínimos do dono como extent (estrela 20 → 10, brilho 20 → 11, raio 30 → 17,5; estrela 16 → 8 nas telas)', () => {
  assert.deepEqual({star: STICKER_SIZES.star.min, sparkle: STICKER_SIZES.sparkle.min, bolt: STICKER_SIZES.bolt.min}, {star: 20, sparkle: 20, bolt: 30});
  assert.equal(minExtentOf('star'), 10);
  assert.equal(minExtentOf('sparkle'), 11);
  assert.equal(minExtentOf('bolt'), 17.5);
  assert.equal(minExtentOf('star', SCREEN_STAR_MIN), 8);
  assert.equal(STICKER_MIN_EXTENT, 8);
  assert.equal(stickerSet.minExtent, minExtentOf('star', SCREEN_STAR_MIN));
  assert.equal(stickerSet.seedOffset, 100);
});

// Dies with: the 3 px line tried first in sizeOf → the 2 px one first (`thick >= LINE_STEP ? thick` → `thick >= 999 ? thick`),
// `- line / 2` → `+ line / 2` in sizeOf.
test('sticker: sizeOf é o inverso de extentOf, o maior tamanho que cabe no extent, dos dois lados do degrau da linha', () => {
  for (const motif of ['star', 'sparkle', 'bolt'] as const) {
    for (let size = 12; size <= 96; size += 0.5) {
      const extent = extentOf(motif, size, 0);
      assert.ok(Math.abs(sizeOf(motif, extent, 0) - size) < 1e-6, `${motif} ${size}`);
      // Half a pixel more room never yields a smaller sticker, and the size always fits its room.
      assert.ok(sizeOf(motif, extent + 0.5, 0) >= size - 1e-6, `${motif} ${size} +0.5`);
      assert.ok(extentOf(motif, sizeOf(motif, extent + 0.25, 0), 0) <= extent + 0.25 + 1e-9, `${motif} ${size} fits`);
    }
  }
});

// Dies with: the sparkle's pull 0.15 → 0.9 (its control points then leave the tips' circle), SPAN's `star: Math.max(` →
// `star: Math.min(` (the reach then misses the outer tips), the star's inner vertices 0.52 → 0.6.
test('sticker: todo ponto do caminho desenhado, em toda pose, fica dentro do alcance menos meia linha', () => {
  for (const motif of ['star', 'sparkle', 'bolt'] as const) {
    for (const size of [17, 20, 23.5, 24, 36, 39.6, 72]) {
      for (const pose of STICKER_POSES[motif]) {
        const d = motifPath(motif, shapeHeight(size, 0) * pose.scale);
        const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
        assert.ok(numbers.length >= 8, d);
        let far = 0;
        for (let index = 0; index + 1 < numbers.length; index += 2) far = Math.max(far, Math.hypot(numbers[index]!, numbers[index + 1]!));
        const reach = reachOf(motif, size, 0, pose.scale);
        assert.ok(far <= reach - lineOf(size) / 2 + 0.01, `${motif} ${size} ${pose.scale}: ${far} > ${reach}`);
        // And the reach is tight: the farthest vertex is the shape's own (within the path's rounding).
        assert.ok(far >= reach - lineOf(size) / 2 - 0.02, `${motif} ${size} ${pose.scale}: reach ${reach} not met (${far})`);
      }
    }
    // The extent holds the largest pose.
    const largest = Math.max(...STICKER_POSES[motif].map((pose) => pose.scale));
    assert.equal(extentOf(motif, 36, 0), reachOf(motif, 36, 0, largest), motif);
  }
  assert.equal(motifPoints('star', 1).length, 10);
  // The mock's shapes: the star's inner vertices at 0.52 of its radius, the sparkle's side tips at 0.74.
  assert.ok(Math.abs(Math.hypot(...motifPoints('star', 2)[1]!) - 0.52) < 1e-9);
  assert.deepEqual(motifPoints('sparkle', 2).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]), [[0, -1], [0.74, 0], [0, 1], [-0.74, 0]]);
  assert.equal(motifPoints('bolt', 1).length, 7);
});

// --- 3.3 slots ---------------------------------------------------------------------------------

const EXPECTED: Record<string, string[]> = {
  chat: ['star@BL', 'sparkle@TL', 'bolt@left'],
  label: ['star@BL', 'sparkle@TR'],
  'tall block': ['star@top', 'sparkle@TL', 'bolt@left'],
  'round block': ['star@BL', 'sparkle@TL'],
  // Not sold: the bolt fits the 28 px padding pocket at its 30 px floor (17.5 of room), so it stays.
  twitch: ['star@BL', 'sparkle@TL', 'bolt@left'],
  border: ['star@left', 'sparkle@BL'],
  'round border': ['star@TL', 'sparkle@BL'],
  screen: ['star@TL'],
};

// Dies with: the chat's bolt share 0.6 → 0.4 (EDGE_SHARE), the label's sparkle 'TR' → 'BR', the border's star edge
// 'left' → corner 'TL', the round border's sparkle 'BL' → 'BR', the label threshold 96 → 64, the block's star share 0.86 → 0.5.
test('sticker: os slots de cada tipo no preset do kit, em todo tamanho e nos dois itens escalados do pack', () => {
  assert.equal(CASES.length, 34);
  for (const item of CASES) {
    const placements = place(item) as StickerPlacement[];
    assert.deepEqual(placements.map((placement) => `${placement.motif}@${placement.slot}`), EXPECTED[groupOf(item)], item.label);
    const {outline} = item.frame;
    for (const placement of placements) {
      // Edge slots sit at their share of the side.
      if (placement.slot === 'left') {
        const share = groupOf(item) === 'chat' ? 0.6 : groupOf(item) === 'border' ? 0.35 : 0.5;
        assert.ok(Math.abs(placement.y - (outline.y + share * outline.height)) < 1e-9, `${item.label} ${placement.motif}`);
        // The Twitch panel has no bleed: its stickers live in the padding pockets.
        if (groupOf(item) !== 'twitch') assert.ok(placement.x < outline.x, `${item.label} ${placement.motif}: outside the left side`);
      }
      if (placement.slot === 'top') {
        assert.ok(Math.abs(placement.x - (outline.x + 0.86 * outline.width)) < 1e-9, item.label);
        assert.ok(placement.y < outline.y, `${item.label}: above the top side`);
      }
    }
  }
});

// Dies with: the border's sparkle corner 'BL' → 'BR', the label's sparkle 'TR' → 'BR' (BR), the round block's star
// list `['BL', 'TL', 'TR']` → `['BR', 'TL', 'TR']`; the slide's preference for the outside (`range, extent)` → `range, -extent)`).
test('sticker: nada em BR, à direita nem embaixo; nada em cima nem em TL/TR na moldura retangular; tudo na frente, fora do contorno onde cabe', () => {
  for (const item of CASES) {
    const placements = place(item);
    const {outline} = item.frame;
    for (const placement of placements) {
      assert.ok(!['BR', 'right', 'bottom'].includes(placement.slot), `${item.label} ${placement.motif}@${placement.slot}`);
      assert.equal(placement.layer, 'front', item.label);
      // Not right of the outline's middle on the right half below the top, nor below it: the side depth's quarter.
      const right = placement.x > outline.x + outline.width / 2;
      const low = placement.y > outline.y + outline.height / 2;
      assert.ok(!(right && low), `${item.label} ${placement.motif} in the BR quarter`);
    }
    if (groupOf(item) === 'border') {
      for (const placement of placements) assert.ok(!['top', 'TL', 'TR'].includes(placement.slot), `${item.label} ${placement.slot}`);
    }
    // No two stickers overlap.
    for (let a = 0; a < placements.length; a++) {
      for (let b = a + 1; b < placements.length; b++) {
        const [p, q] = [placements[a]!, placements[b]!];
        assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= p.extent + q.extent, `${item.label}: ${p.motif} meets ${q.motif}`);
      }
    }
  }
  // With room to spare (a round webcam's 48 px bleed) the sticker's circle sits outside the outline, tangent to it.
  const round = caseOf('webcam-round');
  const [star] = place(round);
  const r = round.frame.outline.width / 2;
  const centre = {x: round.frame.outline.x + r, y: round.frame.outline.y + r};
  assert.ok(Math.abs(Math.hypot(star!.x - centre.x, star!.y - centre.y) - (r + star!.extent)) < 1e-6);
});

// Dies with: the round block's free slots taken from cornerSlots instead of slotsOffAccent.
test('sticker: no bloco redondo com acento, a estrela sai dos slots do arco', () => {
  const left = place(caseOf('circle', {accent: 'left'}));
  assert.deepEqual(left.map((placement) => `${placement.motif}@${placement.slot}`), ['star@TR']);
  const top = place(caseOf('circle', {accent: 'top'}));
  assert.deepEqual(top.map((placement) => `${placement.motif}@${placement.slot}`), ['star@BL']);
});

// Dies with: the star's nominal per ornamentSize 1 → 0.9, the bolt's 1.1 → 1.0 (STICKER_SIZES), `Math.min(nominalSize, sizeOf(...))`
// → `sizeOf(...)` (the sparkle at 36.6 px, its 20 px extent's whole size).
test('sticker: os tamanhos do kit (estrela 36, brilho 36, raio 39,6; a sala corta: 35 no painel da Twitch, 17 nas telas)', () => {
  const sizes = (sizeId: string, extra?: Record<string, unknown>) =>
    Object.fromEntries(place(caseOf(sizeId, extra)).map((placement) => [placement.motif, Math.round(placement.size * 10) / 10]));
  assert.deepEqual(sizes('chat-standard'), {star: 36, sparkle: 36, bolt: 39.6});
  assert.deepEqual(sizes('lower-third'), {star: 36, sparkle: 36, bolt: 39.6});
  assert.deepEqual(sizes('label-sm'), {star: 36, sparkle: 36});
  assert.deepEqual(sizes('twitch-panel'), {star: 35, sparkle: 32.1, bolt: 30.2});
  assert.deepEqual(sizes('fullscreen'), {star: 17});
  assert.deepEqual(sizes('gameplay', {bleed: 96, ornamentScale: 2}), {star: 36, sparkle: 36});
  for (const item of CASES) {
    for (const placement of place(item)) {
      const motif = placement.motif as StickerMotif;
      assert.ok(extentOf(motif, placement.size, STICKER_RIM) <= placement.extent + 1e-9, `${item.label} ${motif}`);
    }
  }
});

// --- 3.4 what drops out, and the refusal -----------------------------------------------------

// Dies with: the bolt's minimum 30 → 20 (bolt kept at ornamentSize 26), the sparkle's 20 → 16 (kept at 19), the hero rule
// `Math.min(heroFloor, …)` → `heroFloor` (the star dropped at 19).
test('sticker: o secundário abaixo do mínimo sai; a estrela fica com o tamanho dela', () => {
  const chat = caseOf('chat-standard');
  const motifs = (ornamentSize: number) => place(chat, ornamentSize).map((placement) => `${placement.motif}:${Math.round(placement.size * 1e6) / 1e6}`);
  // 26 px: the bolt asks 28.6 px (< 30) and drops; the sparkle keeps its 26.
  assert.deepEqual(place(chat, 26).map((placement) => placement.motif), ['star', 'sparkle']);
  // 28 px: the bolt asks 30.8 px and stays.
  assert.deepEqual(place(chat, 28).map((placement) => placement.motif), ['star', 'sparkle', 'bolt']);
  // 20 px: the sparkle at its floor stays; 19 px: it drops, and the star stays at 19.
  assert.deepEqual(place(chat, 20).map((placement) => placement.motif), ['star', 'sparkle']);
  assert.deepEqual(motifs(19), ['star:19']);
  assert.deepEqual(motifs(12), ['star:12']);
  // The count is a function of the props and the size alone: the same at every seed and frame.
  for (const seed of [0, 1, 99]) assert.equal(build(chat, 37, {seed}).length, 3);
});

// Dies with: the screen's floor SCREEN_STAR_MIN 16 → 20 (fullscreen refused), the tall block's fallback to BL removed
// (`corner(frame, 'BL')],` dropped from its hero list), `if (!hero) return [];` → `if (!hero && false) return [];`.
test('sticker: sem lugar para a estrela, place devolve []; a estrela do bloco alto cai para BL quando a borda de cima não cabe', () => {
  const chat = caseOf('chat-standard');
  assert.deepEqual(placeSticker({...chat.frame, keepOut: [chat.frame.canvas]}, 36), []);
  // The screens keep their 17 px star (8.5 of room, over the 16 px floor).
  assert.equal(place(caseOf('fullscreen'))[0]?.extent, 8.5);
  // A text area over the whole top bleed of a banner: the star falls back to BL, the rest stays.
  const banner = caseOf('lower-third');
  const {canvas, outline} = banner.frame;
  const shut = {...banner.frame, keepOut: [...banner.frame.keepOut, {x: outline.x + outline.width / 2, y: 0, width: canvas.width, height: outline.y + 40}]};
  assert.deepEqual(placeSticker(shut, 36).map((placement) => `${placement.motif}@${placement.slot}`), ['star@BL', 'sparkle@TL', 'bolt@left']);
});

// --- 4 motion in steps -----------------------------------------------------------------------

// Dies with: `STEPS_PER_SECOND = 8` → `6`, `Math.floor((inLoop * steps) / durationInFrames)` → `Math.round(…)`,
// `((frame % durationInFrames) + durationInFrames) % durationInFrames` → `frame % durationInFrames`.
test('sticker: o passo k(f) = floor(f·S/n), S = 96 a 12 s; 8 e 7 quadros por passo em alternância, também na emenda', () => {
  const n = 720;
  const steps = stepsPerLoop(12);
  assert.equal(steps, 96);
  assert.equal(stepsPerLoop(0.4), 8);
  assert.equal(stepsPerLoop(12.4), 96);
  const frames = [0, 7, 8, 14, 15, 712, 713, 719, 720];
  assert.deepEqual(frames.map((frame) => stepAt(frame, n, steps)), [0, 0, 1, 1, 2, 94, 95, 95, 0]);
  assert.equal(stepAt(-1, n, steps), 95);
  assert.equal(stepAt(-8, n, steps), 94);
  // Whole frames per step over the loop: 8, 7, 8, 7… (7.5 on average), the last step 7 and step 0 again 8.
  const lengths = Array.from({length: steps}, () => 0);
  for (let frame = 0; frame < n; frame++) lengths[stepAt(frame, n, steps)]!++;
  assert.deepEqual(lengths, Array.from({length: steps}, (_, step) => (step % 2 === 0 ? 8 : 7)));
  // Every table's length divides S, so step S is step 0 in every table.
  for (const table of Object.values(STICKER_POSES)) assert.equal(steps % table.length, 0);
});

// Dies with: the half-frame blend `from.turn + (to.turn - from.turn) * blend` → `from.turn`, `Math.floor(frameIndex)` →
// `Math.round(frameIndex)` (frame 7.5 then blends from frame 8). Frames 6 and 718 sit just before a step: the blend's `stepAt(whole + 1` →
// `stepAt(whole + 2` blends toward the step after the next one.
test('sticker: no meio quadro, cada campo é a média exata dos dois quadros inteiros; nos inteiros, a pose pura', () => {
  const item = caseOf('chat-standard');
  for (const seed of [23, 4, 77]) {
    for (const whole of [0, 6, 7, 14, 22, 300, 712, 718, 719]) {
      const [a, b, mid] = [build(item, whole, {seed}), build(item, whole + 1, {seed}), build(item, whole + 0.5, {seed})];
      mid.forEach((element, index) => {
        for (const field of ['angle', 'scale', 'reach'] as const) {
          const mean = ((a[index]![field] as number) + (b[index]![field] as number)) / 2;
          assert.ok(Math.abs((element[field] as number) - mean) < 1e-9, `seed ${seed} frame ${whole}.5 ${element.type} ${field}`);
        }
      });
    }
  }
  // Frame 7 and 8 straddle the first step: some motif changes pose there, and frame 7.5 is halfway.
  const changed = build(item, 7).some((element, index) => element.angle !== build(item, 8)[index]!.angle || element.scale !== build(item, 8)[index]!.scale);
  assert.ok(changed);
  // On whole frames the pose is a table entry, never a blend.
  for (const frame of [0, 7, 8, 15, 713]) {
    for (const element of build(item, frame)) {
      const motif = element.type.replace('sticker-', '') as StickerMotif;
      const turn = element.angle - MOTIF_TILT[motif];
      assert.ok(STICKER_POSES[motif].some((pose) => Math.abs(Math.abs(pose.turn) - Math.abs(turn)) < 1e-9 && pose.scale === element.scale),
        `${frame} ${element.type}`);
    }
  }
});

// Dies with: the table's `% table.length` removed (frame 720 reads past the table), the stepAt modulo removed (frame
// −711 reads step −95).
test('sticker: o quadro n é o quadro 0, e a tabela segue para o sucessor de sempre na emenda', () => {
  for (const item of [caseOf('chat-standard'), caseOf('lower-third'), caseOf('webcam-16x9')]) {
    const n = framesOf(item.props);
    assert.deepEqual(build(item, n), build(item, 0), item.label);
    assert.deepEqual(build(item, -n + 9), build(item, 9), item.label);
    for (const element of build(item, n - 1)) {
      const motif = element.type.replace('sticker-', '') as StickerMotif;
      assert.ok(STICKER_POSES[motif].length > 0);
    }
  }
  // Seam: the star of the last step goes on to the pose of step 0, as step 7 of its table goes on to step 0.
  for (const offset of [0, 1, 5]) {
    const last = stickerPoseAt('star', 719, 720, 12, offset, false);
    const first = stickerPoseAt('star', 720, 720, 12, offset, false);
    assert.deepEqual(last, STICKER_POSES.star[(95 + offset) % 8]);
    assert.deepEqual(first, STICKER_POSES.star[offset % 8]);
    assert.deepEqual(stickerPoseAt('star', 0, 720, 12, offset, false), first);
  }
});

// Dies with: the hero's offset `anchor === 0 ? 0 :` removed (the star reads a seeded offset), the tables' first pose
// changed (`{turn: 0, scale: 1}, {turn: 5` → `{turn: 5, scale: 0.95}, {turn: 0`).
test('sticker: no quadro 0 a estrela está em repouso, em todo tamanho e semente; os outros saem do sorteio', () => {
  const offsets = new Set<string>();
  const mirrored = new Set<number>();
  for (const item of CASES) {
    for (const seed of [0, 1, 2, 3, 23, 41]) {
      const [hero, ...rest] = build(item, 0, {seed});
      assert.equal(hero!.type, 'sticker-star', item.label);
      assert.equal(hero!.angle, MOTIF_TILT.star, `${item.label} seed ${seed}`);
      assert.equal(hero!.scale, 1, `${item.label} seed ${seed}`);
      for (const element of rest) offsets.add(`${element.type}:${element.angle}:${element.scale}`);
      // Step 3 of the star (frame 23 at 12 s): turn ±6.
      mirrored.add(Math.sign(build(item, 23, {seed})[0]!.angle - MOTIF_TILT.star));
    }
  }
  // The secondaries start their tables at seeded offsets: more than one pose at frame 0.
  assert.ok([...offsets].filter((key) => key.startsWith('sticker-sparkle')).length > 1, [...offsets].join(' '));
  assert.ok([...offsets].filter((key) => key.startsWith('sticker-bolt')).length > 1, [...offsets].join(' '));
  // Half of the stars turn the other way: both signs appear across the seeds.
  assert.deepEqual([...mirrored].sort(), [-1, 1]);
});

// Dies with: the mirror drawn for stars only (`const mirrorDraw = random();` → `const mirrorDraw = motif === 'star' ? random() : 0;`:
// the bolt then reads the sparkle's spare value), seedOffset 100 → 120.
test('sticker: o sorteio, dois valores por enfeite (deslocamento e espelho), usados ou não, do fluxo seed + 503 + 100', () => {
  const item = caseOf('chat-standard');
  for (const seed of [0, 5, 23, 61, 200]) {
    const random = ornamentRandom(seed, {seedOffset: 100});
    const draws = place(item).map(() => ({offset: random(), mirror: random()}));
    const elements = build(item, 0, {seed});
    elements.forEach((element, anchor) => {
      if (anchor === 0) return;
      const motif = element.type.replace('sticker-', '') as StickerMotif;
      const pose = STICKER_POSES[motif][Math.floor(draws[anchor]!.offset * STICKER_POSES[motif].length)]!;
      assert.deepEqual({angle: element.angle, scale: element.scale}, {angle: MOTIF_TILT[motif] + pose.turn, scale: pose.scale}, `seed ${seed} ${motif}`);
    });
    // The star's mirror is the first placement's second value: step 1 turns it by +5 or −5.
    const turn = build(item, 8, {seed})[0]!.angle - MOTIF_TILT.star;
    assert.equal(turn, draws[0]!.mirror < 0.5 ? -5 : 5, `seed ${seed}`);
  }
});

// --- elements and render ---------------------------------------------------------------------

// Dies with: `light: 0` → `light: 2`, STICKER_RIM 0 → 4 (the kit's rim), `layer: 'front'` → `layer: 'back'`, the reach at
// the pose's scale → at scale 1, the bolt's fill `bolt` → `sparkle`.
test('sticker: todo elemento na frente, sem luz, aro 0, linha de tinta, dentro do extent; cores pela paleta (1, 2 e 3 cores)', () => {
  for (const item of CASES) {
    const placements = place(item);
    for (const frame of [0, 3.5, 7.5, 100, 359.25, 719]) {
      const elements = build(item, frame);
      assert.equal(elements.length, placements.length, item.label);
      elements.forEach((element, anchor) => {
        const placement = placements[element.anchor]!;
        assert.equal(element.anchor, anchor);
        assert.equal(element.type, `sticker-${placement.motif}`);
        assert.equal(element.layer, 'front', item.label);
        assert.equal(element.light, 0);
        assert.equal(element.lightOpacity, 0);
        assert.equal(element.opacity, 1);
        assert.equal(element.rim, 0, item.label);
        assert.equal(element.ink, STICKER_INK);
        assert.equal(element.line, lineOf(placement.size));
        assert.equal(element.size, placement.size);
        assert.ok(element.reach > 0);
        assert.ok(Math.abs(element.reach - reachOf(placement.motif as StickerMotif, placement.size, 0, element.scale)) < 1e-9, element.type);
        assert.ok(Math.hypot(element.x - placement.x, element.y - placement.y) + element.reach <= placement.extent + 1e-9, `${item.label} ${element.type}`);
      });
    }
  }
  const chat = caseOf('chat-standard');
  const fills = (colors: string[]) => Object.fromEntries(build(chat, 0, {ornamentColors: colors}).map((element) => [element.type, element.fill]));
  assert.deepEqual(fills(COLORS), {'sticker-star': '#F4A66C', 'sticker-sparkle': '#F6E2E4', 'sticker-bolt': '#E9BA67'});
  assert.deepEqual(fills(['#111111', '#222222']), {'sticker-star': '#111111', 'sticker-sparkle': '#222222', 'sticker-bolt': '#111111'});
  assert.deepEqual(fills(['#111111']), {'sticker-star': '#111111', 'sticker-sparkle': '#111111', 'sticker-bolt': '#111111'});
});

const renderOf = (element: StickerOrnamentElement) => {
  const item = caseOf('chat-standard');
  const node = stickerSet.render(element, 0, {idBase: 'test', frame: item.frame, style: styleOf(item.props)});
  return renderToStaticMarkup(createElement('svg', null, node));
};

// Dies with: the rim drawn only `element.rim > 99`, its width `element.line + 2 * element.rim` → `element.line`, the turn
// left out of the transform (`rotate(${n(element.angle)})` → `rotate(0)`), the stroke `element.ink` → `element.fill`.
test('sticker: o desenho de um elemento, com a linha de tinta por cima e o aro creme por baixo quando rim > 0', () => {
  const [star] = build(caseOf('chat-standard'), 23);
  const plain = renderOf(star!);
  assert.match(plain, new RegExp(`transform="translate\\(${svgNumber(star!.x)} ${svgNumber(star!.y)}\\) rotate\\(${svgNumber(star!.angle)}\\)"`));
  assert.equal((plain.match(/<path /g) ?? []).length, 1);
  assert.match(plain, /fill="#F4A66C" stroke="#4A3A69" stroke-width="3" stroke-linejoin="round"/);
  assert.ok(plain.includes(`d="${motifPath('star', shapeHeight(star!.size, 0) * star!.scale)}"`));
  assert.doesNotMatch(plain, /filter=|mix-blend-mode/);
  const rimmed = renderOf({...star!, rim: 4});
  const paths = rimmed.match(/<path [^>]*>/g) ?? [];
  assert.equal(paths.length, 2);
  assert.match(paths[0]!, /fill="#F6E2E4" stroke="#F6E2E4" stroke-width="11"/);
  assert.match(paths[1]!, /stroke="#4A3A69" stroke-width="3"/);
  // With a rim the shape shrinks by twice the rim: the size stays the whole height.
  assert.ok(paths[1]!.includes(`d="${motifPath('star', shapeHeight(star!.size, 4) * star!.scale)}"`));
});

// The drawing constants are the approved mock's (StickerPopMockDraft.tsx: MOTIF_TILT, BOLT_POINTS, WOBBLE and the bolt's
// two poses), written here as literals so that no snapshot rewritten in the same phase stands in for them.
// Dies with: `star: -14` → `star: 14` in MOTIF_TILT, `[0.96, 0.4]` → `[0.9, 0.4]` in BOLT_POINTS,
// `{turn: 6, scale: 0.92}` → `{turn: 6, scale: 0.8}` in the star's poses.
test('sticker: as constantes de desenho são as do mock aprovado (inclinação, contorno do raio, poses)', () => {
  assert.deepEqual(MOTIF_TILT, {sparkle: 12, star: -14, bolt: 18});
  assert.deepEqual(BOLT_POINTS, [[0.48, 0], [1, 0], [0.66, 0.4], [0.96, 0.4], [0.2, 1], [0.4, 0.54], [0.04, 0.54]]);
  assert.deepEqual(STICKER_POSES.star, [
    {turn: 0, scale: 1}, {turn: 5, scale: 0.95}, {turn: -3, scale: 1}, {turn: 6, scale: 0.92},
    {turn: -6, scale: 0.97}, {turn: 2, scale: 1}, {turn: -4, scale: 0.93}, {turn: 3, scale: 0.98},
  ]);
  assert.deepEqual(STICKER_POSES.sparkle, [1, 0.8, 1, 1.1].map((scale) => ({turn: 0, scale})));
  assert.deepEqual(STICKER_POSES.bolt, [{turn: 0, scale: 1}, {turn: -8, scale: 0.96}]);
});

// No input of the harness makes this set refuse, so its REFUSAL entry was never read there: a webcam with a 16 px bleed
// and no title bar has no room for the star (tangent outside a 12 px band), and the schema says so in the harness's words.
// Dies with: `|terminal|sticker)` → `|terminal)` in the harness's REFUSAL.
test('sticker: sem lugar para a estrela, a moldura recusa com a frase que o harness documenta', () => {
  const input = {
    ...PRESETS.border, ...sizeProps(getSize('webcam-16x9')), ornaments: 'sticker', bleed: 16, depth: 0, titleBarHeight: 0, titleButtonSize: 0,
  };
  const result = borderLoopSchema.safeParse(input);
  assert.equal(result.success, false);
  const issues = result.error!.issues.map((issue) => [issue.path.join('.'), issue.message]);
  assert.deepEqual(issues, [['ornaments', 'The "sticker" ornaments do not fit this size: increase bleed or radius or use ornaments none.']]);
  assert.match(issues[0]![1]!, REFUSAL);
});

// The approved mock draws a solid indigo line: no light core (BlockLoop's default strokeCore is 0.9) and a header line as
// dark as the outline (ChatLoop's default headerLineOpacity is 0.9). Read from the kit's own preset files.
// Dies with: `"strokeCore": 0,` removed from presets/block-sticker-pop.json; `"headerLineOpacity": 1,` removed from
// presets/chat-sticker-pop.json.
test('sticker: os presets do kit desenham a linha índigo cheia, sem núcleo claro e com o divisor do chat opaco', () => {
  const preset = (kind: string) => JSON.parse(readFileSync(`presets/${kind}-sticker-pop.json`, 'utf8')) as Record<string, unknown>;
  const chat = chatLoopSchema.parse(preset('chat'));
  const block = blockLoopSchema.parse(preset('block'));
  const border = borderLoopSchema.parse(preset('border'));
  for (const [kind, props] of [['chat', chat], ['block', block], ['border', border]] as const) assert.equal(props.strokeCore, 0, kind);
  assert.equal(chat.headerLineOpacity, 1);
});

// The owner's checkpoint (2026-11-22): the labels carry a 24 px star and sparkle (36 covered the label's corner), and the
// block's gradient runs top to bottom like the approved mock's (strong pink on top), still moving for the speed rule.
// Dies with: `"props": {"ornamentSize": 24}` → `"props": {"ornamentSize": 36}` in packs/sticker-pop.json; `"fillAngle": 90,`
// removed from presets/block-sticker-pop.json; the two fill colours swapped back.
test('sticker: no checkpoint do dono, etiquetas com enfeite de 24 px e o degradê da caixa de cima para baixo', () => {
  const pack = JSON.parse(readFileSync('packs/sticker-pop.json', 'utf8')) as {items: {preset: string; sizes?: string[]; variant?: string; props?: Record<string, unknown>}[]};
  const blocks = pack.items.filter((item) => item.preset === 'block-sticker-pop' && item.variant === undefined);
  const sized = blocks.filter((item) => item.props?.ornamentSize !== undefined);
  assert.deepEqual(sized.map((item) => [item.sizes, item.props]), [[['label-sm', 'label'], {ornamentSize: 24}]]);
  const block = blockLoopSchema.parse(JSON.parse(readFileSync('presets/block-sticker-pop.json', 'utf8')));
  assert.equal(block.fillAngle, 90);
  // Salmon first: frame 0, the pack's PNG, then shows the strong pink on top, as the mock does.
  assert.deepEqual(block.fillColors, ['#EF6AA0', '#F74CA9']);
  assert.ok(block.fillSpeed > 0, 'the gradient still moves');
});
