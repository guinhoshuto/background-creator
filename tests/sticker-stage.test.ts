import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {
  getStickerStageScene, paperBackdrop, paperBurstProps, SCATTER, stageLine, StickerStageSvg, stickerStageLoopSchema,
  type StickerStageElement, type StickerStageEntry, type StickerStageLoopProps, type StickerStageSticker,
} from '../src/backgrounds/StickerStageLoop';
import {sunburstLoopSchema} from '../src/backgrounds/SunburstLoop';
import {STICKER_CREAM} from '../src/overlays/shared/ornaments/sets/sticker';
import {MOTIF_TILT, motifPoints} from '../src/overlays/shared/ornaments/sets/sticker-motifs';
import {stickerPoseAt, type StickerMotif} from '../src/overlays/shared/ornaments/sets/sticker-steps';
import {getCompositionMetadata} from '../src/settings';

// The Sticker Pop stage (src/backgrounds/StickerStageLoop.tsx): the mock's stickers over the pink
// gradient or the kit's paper. Every test names the mutation of
// .cache/illustration-inspired-overlay/mutations-bg-f2.json that makes it fail.

const preset = (name: string) => JSON.parse(readFileSync(`presets/${name}.json`, 'utf8')) as Record<string, unknown>;
const PINK_STAGE = stickerStageLoopSchema.parse(preset('sticker-pop-pink-stage'));
const PAPER_STICKERS = stickerStageLoopSchema.parse(preset('sticker-pop-paper-stickers'));
const {durationInFrames: N} = getCompositionMetadata({durationSeconds: 12, outputFormat: 'webm'});

const stickersOf = (scene: readonly StickerStageElement[]) =>
  scene.filter((element): element is StickerStageSticker => element.kind === 'sticker');
const stickersAt = (props: StickerStageLoopProps, frame: number, layout?: readonly StickerStageEntry[]) =>
  stickersOf(getStickerStageScene(props, frame, N, layout));
const markupAt = (props: StickerStageLoopProps, frame: number) =>
  renderToStaticMarkup(createElement(StickerStageSvg, {scene: getStickerStageScene(props, frame, N), ink: props.ink}));

/** The height of a path's vertices over the height of its shape (the star's lower tips sit above its line). */
const tallness = (motif: StickerMotif) => {
  const ys = motifPoints(motif, 1).map(([, y]) => y);
  return Math.max(...ys) - Math.min(...ys);
};
/** The shape's height a glyph's first path draws, back at scale 1. */
const shapeOf = (glyph: Glyph, item: StickerStageSticker) => {
  const ys = glyph.paths[0]!.points.map(([, y]) => y);
  return (Math.max(...ys) - Math.min(...ys)) / tallness(item.motif) / item.scale;
};

type Glyph = {x: number; y: number; angle: number; paths: {points: [number, number][]; width: number; fill: string; stroke: string}[]};
/** Every sticker glyph of the markup: its translate, its rotate and each path's points, fill, stroke and stroke width. */
const glyphsOf = (markup: string): Glyph[] =>
  [...markup.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)">(.*?)<\/g>/g)].map((match) => ({
    x: Number(match[1]), y: Number(match[2]), angle: Number(match[3]),
    paths: [...match[4]!.matchAll(/<path d="([^"]+)" fill="([^"]+)" stroke="([^"]+)" stroke-width="([\d.]+)"/g)].map((path) => {
      const numbers = path[1]!.match(/-?[\d.]+/g)!.map(Number);
      return {
        points: Array.from({length: numbers.length / 2}, (_, i): [number, number] => [numbers[2 * i]!, numbers[2 * i + 1]!]),
        fill: path[2]!, stroke: path[3]!, width: Number(path[4]),
      };
    }),
  }));

// Dies with: steps-off-by-one (the stage reads one more second of steps, 104 in 12 s).
test('palco: o frame N desenha o frame 0 e cada adesivo troca de pose 96 vezes em 12 s, a emenda inclusive', () => {
  assert.deepEqual(getStickerStageScene(PINK_STAGE, N, N), getStickerStageScene(PINK_STAGE, 0, N));
  assert.deepEqual(getStickerStageScene(PINK_STAGE, -1, N), getStickerStageScene(PINK_STAGE, N - 1, N));
  const frames = Array.from({length: N + 1}, (_, frame) => stickersAt(PINK_STAGE, frame));
  for (let i = 0; i < SCATTER.length; i++) {
    let changes = 0;
    for (let frame = 1; frame <= N; frame++) {
      const [before, after] = [frames[frame - 1]![i]!, frames[frame]![i]!];
      if (before.angle !== after.angle || before.scale !== after.scale) changes++;
    }
    assert.equal(changes, 96, `sticker ${i}`);
    // The seam is a step like any other: N−1 → N changes the pose, and the half frame is the exact mean.
    const [last, first, half] = [frames[N - 1]![i]!, frames[N]![i]!, stickersAt(PINK_STAGE, N - 0.5)[i]!];
    assert.notDeepEqual([last.angle, last.scale], [first.angle, first.scale], `sticker ${i} at the seam`);
    assert.ok(Math.abs(half.angle - (last.angle + first.angle) / 2) < 1e-9 && Math.abs(half.scale - (last.scale + first.scale) / 2) < 1e-9);
  }
});

// Dies with: rim-not-in-extent (the shape's height leaves the 2·rim out, so the rim grows the sticker past its size);
// glyph-angle-zero (the stage draws every glyph at angle 0, so the markup leaves the scene's tilt and turn out).
test('palco: todo adesivo tem a altura inteira com o aro e fica a 8 px da borda em todas as poses', () => {
  for (const rim of [0, 4, 8]) {
    const props = stickerStageLoopSchema.parse({...PINK_STAGE, rim});
    for (let frame = 0; frame < N; frame++) {
      const items = stickersAt(props, frame);
      const glyphs = glyphsOf(markupAt(props, frame));
      assert.equal(glyphs.length, items.length);
      glyphs.forEach((glyph, i) => {
        const item = items[i]!;
        // The markup draws the scene's sticker: its centre and its angle.
        assert.ok(Math.abs(glyph.x - item.x) < 1e-3 && Math.abs(glyph.y - item.y) < 1e-3, `rim ${rim} frame ${frame} sticker ${i}: centre`);
        assert.ok(Math.abs(glyph.angle - item.angle) < 1e-3, `rim ${rim} frame ${frame} sticker ${i}: ${glyph.angle} vs ${item.angle}`);
        const outer = Math.max(...glyph.paths.map((path) => path.width));
        // The pose scales the shape, never the line or the rim.
        const height = shapeOf(glyph, item) + outer;
        assert.ok(Math.abs(height - item.size) < 0.01, `rim ${rim} frame ${frame} sticker ${i}: ${height} vs ${item.size}`);
        const turn = (glyph.angle * Math.PI) / 180;
        for (const [px, py] of glyph.paths[0]!.points) {
          const x = glyph.x + px * Math.cos(turn) - py * Math.sin(turn);
          const y = glyph.y + px * Math.sin(turn) + py * Math.cos(turn);
          const room = Math.min(x, y, 1920 - x, 1080 - y) - outer / 2;
          assert.ok(room >= 8, `rim ${rim} frame ${frame} sticker ${i}: ${room.toFixed(2)} px from the edge`);
        }
      });
    }
  }
});

// Dies with: seed-moves-centers (the seed nudges every centre by up to 8 px); phase-zero (every sticker of a
// motif starts its table at 0); no-mirror (no star leans the other way).
test('palco: a disposição não depende do seed, a fase sim', () => {
  assert.ok(SCATTER.every(([, size]) => size >= 30));
  const at = (seed: number, frame: number) => stickersAt({...PINK_STAGE, seed}, frame);
  const place = (items: StickerStageSticker[]) => items.map(({motif, size, x, y, fill, line, rim}) => ({motif, size, x, y, fill, line, rim}));
  assert.deepEqual(place(at(23, 0)), place(at(24, 0)));
  assert.deepEqual(place(at(23, 0)), SCATTER.map(([motif, size, x, y, color]) => ({
    motif, size, x, y, fill: PINK_STAGE.stickerColors[color], line: stageLine(size), rim: PINK_STAGE.rim,
  })));
  const phases = (seed: number) => at(seed, 0).map(({phase, mirror}) => [phase, mirror]);
  assert.notDeepEqual(phases(23), phases(24));
  assert.notDeepEqual(at(23, 100).map(({angle, scale}) => [angle, scale]), at(24, 100).map(({angle, scale}) => [angle, scale]));
  // The phase alone moves with the seed, and no motif walks in step.
  assert.notDeepEqual(at(23, 0).map(({phase}) => phase), at(24, 0).map(({phase}) => phase));
  for (const motif of ['star', 'bolt', 'sparkle'] as const) {
    assert.ok(new Set(at(23, 0).filter((item) => item.motif === motif).map(({phase}) => phase)).size > 1, motif);
  }
  // Only stars lean the other way, some of them, and a mirrored star turns against its tilt.
  const mirrors = (motif: StickerMotif) => new Set(at(23, 0).filter((item) => item.motif === motif).map(({mirror}) => mirror));
  assert.deepEqual([...mirrors('star')].sort(), [0, 1]);
  assert.deepEqual([[...mirrors('bolt')], [...mirrors('sparkle')]], [[0], [0]]);
  let leaned = 0;
  for (let frame = 0; frame < N; frame += 4) {
    for (const item of at(23, frame).filter((sticker) => sticker.motif === 'star')) {
      const {turn} = stickerPoseAt('star', frame, N, PINK_STAGE.durationSeconds, item.phase, false);
      assert.ok(Math.abs(item.angle - (MOTIF_TILT.star + (item.mirror ? -turn : turn))) < 1e-9, `frame ${frame}`);
      if (item.mirror && turn !== 0) leaned++;
    }
  }
  assert.ok(leaned > 0);
});

// Dies with: draw-only-stars (only stars draw the mirror, so a sticker that stops being a star shifts every phase after it).
test('palco: dois sorteios por adesivo sempre, e trocar o motivo de um não muda a fase dos outros', () => {
  assert.equal(SCATTER[0]![0], 'star');
  const swapped = SCATTER.map((entry, i): StickerStageEntry => (i === 0 ? ['sparkle', ...entry.slice(1)] as unknown as StickerStageEntry : entry));
  for (const seed of [23, 24, -7]) {
    const phases = (layout: readonly StickerStageEntry[]) => stickersAt({...PINK_STAGE, seed}, 0, layout).slice(1).map(({phase, mirror}) => [phase, mirror]);
    assert.deepEqual(phases(swapped), phases(SCATTER), `seed ${seed}`);
  }
});

// Dies with: rim-always (a rim path is drawn even at rim 0).
test('palco: com rim 0 não há caminho de aro e a forma ocupa a altura inteira; com aro, o creme vem por baixo', () => {
  const bare = stickerStageLoopSchema.parse({...PINK_STAGE, rim: 0});
  for (const glyph of glyphsOf(markupAt(bare, 0))) assert.equal(glyph.paths.length, 1);
  stickersAt(bare, 0).forEach((item, i) => {
    const glyph = glyphsOf(markupAt(bare, 0))[i]!;
    assert.ok(Math.abs(shapeOf(glyph, item) - (item.size - item.line)) < 0.01, `sticker ${i}`);
  });
  glyphsOf(markupAt(PINK_STAGE, 0)).forEach((glyph, i) => {
    const item = stickersAt(PINK_STAGE, 0)[i]!;
    assert.deepEqual(glyph.paths.map(({width, fill}) => [width, fill]), [[item.line + 8, STICKER_CREAM], [item.line, item.fill]]);
  });
});

// Dies with: line-step-64 (64 px takes the 3 px line); ink-ignored (the stage draws the line cream, whatever ink says).
test('palco: linha de 3 px abaixo de 64, 4 abaixo de 120 e 6 dali para cima', () => {
  assert.deepEqual([40, 63, 64, 119, 120, 200].map(stageLine), [3, 3, 4, 4, 6, 6]);
  const glyphs = glyphsOf(markupAt(PINK_STAGE, 0));
  stickersAt(PINK_STAGE, 0).forEach((item, i) => {
    assert.equal(item.line, stageLine(item.size));
    assert.equal(glyphs[i]!.paths.at(-1)!.width, item.line);
  });
  // The line takes the ink prop, and the rim under it is cream all through.
  for (const props of [PINK_STAGE, {...PINK_STAGE, ink: '#112233'}]) {
    for (const glyph of glyphsOf(markupAt(props, 0))) {
      assert.equal(glyph.paths.at(-1)!.stroke, props.ink);
      assert.deepEqual(glyph.paths.slice(0, -1).map(({stroke}) => stroke), [STICKER_CREAM]);
    }
  }
});

// Dies with: stage-drifts (the middle stop slides with the frame); stage-in-alpha (the gradient stays with transparent);
// stops-swapped (the top stop takes the bottom colour).
test('palco: o degradê não lê o frame e só existe no palco opaco', () => {
  const gradient = (props: StickerStageLoopProps, frame: number) =>
    getStickerStageScene(props, frame, N).filter((element) => element.kind === 'stage');
  assert.deepEqual(gradient(PINK_STAGE, 0), [{kind: 'stage', top: '#F74CA9', mid: '#EF6AA0', bottom: '#F5A09E', stop: 0.45, opacity: 1}]);
  for (const frame of [1, 359, 368, N - 1]) assert.deepEqual(gradient(PINK_STAGE, frame), gradient(PINK_STAGE, 0), `frame ${frame}`);
  assert.deepEqual(gradient({...PINK_STAGE, transparent: true}, 0), []);
  const stops = (frame: number) => markupAt(PINK_STAGE, frame).match(/<linearGradient.*?<\/linearGradient>/)![0];
  assert.equal(stops(359), stops(0));
  // Top to bottom, the strong pink first, in the stops' order.
  assert.match(stops(0), /^<linearGradient id="sticker-stage-gradient" x1="0" y1="0" x2="0" y2="1">/);
  assert.deepEqual([...stops(0).matchAll(/<stop offset="([^"]+)" stop-color="([^"]+)"/g)].map(([, offset, color]) => [offset, color]),
    [['0', '#F74CA9'], ['0.45', '#EF6AA0'], ['1', '#F5A09E']]);
});

// Dies with: preset-seed (the pink stage preset takes seed 24).
test('palco: o preset sticker-pop-pink-stage traz as cores da D-01, 12 s e seed 23', () => {
  assert.equal(stickerStageLoopSchema.strict().safeParse(preset('sticker-pop-pink-stage')).success, true);
  assert.deepEqual(PINK_STAGE, stickerStageLoopSchema.parse({
    durationSeconds: 12, seed: 23, backgroundColor: '#F5A09E', colors: ['#F74CA9', '#EF6AA0', '#F5A09E'], stageMid: 0.45,
    stickerColors: ['#F4A66C', '#F6E2E4', '#E9BA67', '#9AC7F2', '#EE9DE6'], ink: '#4A3A69', rim: 4, backdrop: 'stage',
  }));
});

// Dies with: paper-not-kit (the paper's two ray colours swap); paper-draws-gradient (the gradient is drawn over the paper).
test('palco: backdrop paper põe o papel do kit por baixo e nenhum degradê', () => {
  const kitPaper = preset('sticker-pop');
  assert.deepEqual(paperBurstProps(12), sunburstLoopSchema.parse(kitPaper));
  assert.deepEqual(paperBurstProps(8).durationSeconds, 8);
  const scene = getStickerStageScene(PAPER_STICKERS, 0, N);
  assert.equal(scene.some((element) => element.kind === 'stage'), false);
  assert.equal(stickersOf(scene).length, SCATTER.length);
  assert.doesNotMatch(markupAt(PAPER_STICKERS, 0), /linearGradient/);
});

// Dies with: paper-rim (the paper stickers preset takes the 4 px rim).
test('palco: o preset sticker-pop-paper-stickers é o papel sem aro, com a cor do papel no MP4', () => {
  assert.equal(stickerStageLoopSchema.strict().safeParse(preset('sticker-pop-paper-stickers')).success, true);
  assert.equal(PAPER_STICKERS.backdrop, 'paper');
  assert.equal(PAPER_STICKERS.rim, 0);
  assert.equal(PAPER_STICKERS.backgroundColor, preset('sticker-pop').backgroundColor);
  assert.deepEqual([PAPER_STICKERS.durationSeconds, PAPER_STICKERS.seed], [12, 23]);
  assert.deepEqual([PAPER_STICKERS.stickerColors, PAPER_STICKERS.ink], [PINK_STAGE.stickerColors, PINK_STAGE.ink]);
  for (const glyph of glyphsOf(markupAt(PAPER_STICKERS, 0))) assert.equal(glyph.paths.length, 1);
});

// Dies with: accent-default-on (accent defaults to true, so the pink stage, whose preset leaves it out, paints the
// three in hot pink); accent-ignores-switch (the fill reads the mark alone, without props.accent).
test('palco: o preset do palco pinta os 20 adesivos como antes da cor de destaque, em todo frame', () => {
  // The fills of the stage before the accent existed (46c3ee9), sticker by sticker, in SCATTER order.
  const [orange, blush, gold, blue, orchid] = PINK_STAGE.stickerColors;
  const before = [
    orange, gold, blush, orchid, orchid, blue, blue, orange, gold, orange,
    blush, gold, blue, orchid, blush, blue, blue, orchid, gold, blue,
  ];
  assert.equal(PINK_STAGE.accent, false);
  for (const frame of [0, 37, N - 1]) assert.deepEqual(stickersAt(PINK_STAGE, frame).map(({fill}) => fill), before, `frame ${frame}`);
  assert.deepEqual(glyphsOf(markupAt(PINK_STAGE, 0)).map((glyph) => glyph.paths.at(-1)!.fill), before);
  // Off, the marks change nothing: the scene is the one of the layout without them.
  const unmarked = SCATTER.map(([motif, size, x, y, color]): StickerStageEntry => [motif, size, x, y, color]);
  assert.deepEqual(getStickerStageScene(PINK_STAGE, 0, N), getStickerStageScene(PINK_STAGE, 0, N, unmarked));
});

// Dies with: accent-mark-dropped (the 40 px sparkle at (1480,700) loses its mark); paper-accent-off (the paper preset
// turns accent off); accent-color-ignored (the marked fill takes the first stickerColors colour instead of accentColor).
test('palco: no papel, os três adesivos rosa-choque do mock voltam ao #F74CA9 e o resto não muda', () => {
  const accented = SCATTER.flatMap(([motif, size, x, y,, mark]) => (mark === 'accent' ? [[motif, size, x, y]] : []));
  assert.deepEqual(accented, [['sparkle', 120, 620, 130], ['star', 44, 560, 640], ['sparkle', 40, 1480, 700]]);
  assert.deepEqual([PAPER_STICKERS.accent, PAPER_STICKERS.accentColor], [true, '#F74CA9']);
  const fills = stickersAt(PAPER_STICKERS, 0).map(({fill}) => fill);
  SCATTER.forEach(([, , , , color, mark], i) => {
    assert.equal(fills[i], mark === 'accent' ? '#F74CA9' : PAPER_STICKERS.stickerColors[color], `sticker ${i}`);
  });
  assert.deepEqual(glyphsOf(markupAt(PAPER_STICKERS, 0)).map((glyph) => glyph.paths.at(-1)!.fill), fills);
  // The accent is its own colour, not one of the five.
  const lilac = stickerStageLoopSchema.parse({...PAPER_STICKERS, accentColor: '#C8A2F0'});
  assert.deepEqual(stickersAt(lilac, 0).filter((_, i) => SCATTER[i]![5] === 'accent').map(({fill}) => fill), ['#C8A2F0', '#C8A2F0', '#C8A2F0']);
});

// Dies with: f, backdrop-fixed-12s (the paper is drawn with paperBurstProps(12) whatever the loop's length);
// g, backdrop-in-alpha (the paper is drawn with transparent as well).
test('palco: paperBackdrop dá o papel do loop pedido, só com backdrop paper e opaco', () => {
  assert.deepEqual(paperBackdrop(PAPER_STICKERS), paperBurstProps(12));
  const eight = paperBackdrop(stickerStageLoopSchema.parse({...PAPER_STICKERS, durationSeconds: 8}));
  assert.deepEqual(eight, paperBurstProps(8));
  assert.equal(eight!.durationSeconds, 8);
  assert.equal(paperBackdrop({...PAPER_STICKERS, transparent: true}), null);
  assert.equal(paperBackdrop(PINK_STAGE), null);
});

// Dies with: colors-undescribed (colors loses its .describe()); sticker-colors-undescribed (stickerColors loses it).
// accentColor is a colour: tests/schema-descriptions.test.ts keeps it without a description.
test('palco: colors, stickerColors e accent têm descrição no Studio', () => {
  const {colors, stickerColors, accent} = stickerStageLoopSchema.shape;
  assert.match(colors.unwrap().description ?? '', /gradient/i);
  assert.match(stickerColors.unwrap().description ?? '', /sticker/i);
  assert.match(accent.unwrap().description ?? '', /accentColor/);
});
