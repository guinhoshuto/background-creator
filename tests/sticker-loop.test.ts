import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {kindPolicies} from '../src/kinds';
import {lineOf, MOTIF_TILT, reachOf, reachWithLine} from '../src/overlays/shared/ornaments/sets/sticker-motifs';
import {STICKER_POSES, stepAt, stepsPerLoop, type StickerMotif} from '../src/overlays/shared/ornaments/sets/sticker-steps';
import {STICKER_CANVAS, StickerFrame, stickerLoopSchema, type StickerLoopProps} from '../src/overlays/stickers';
import {getCompositionMetadata, type OutputFormat} from '../src/settings';

// The loose sticker (src/overlays/stickers/StickerLoop.tsx): one StickerGlyph on the kind's square.
// Every test names the mutation of .cache/illustration-inspired-overlay/mutations-stickers-f1.json
// that makes it fail, by its place in the plan (F1-1 is the first).

const MOTIFS: readonly StickerMotif[] = ['star', 'sparkle', 'bolt'];
const DEFAULTS = stickerLoopSchema.parse({});
const {durationInFrames: N} = getCompositionMetadata({durationSeconds: DEFAULTS.durationSeconds, outputFormat: 'webm'});
const STEPS = stepsPerLoop(DEFAULTS.durationSeconds);

const propsOf = (patch: Partial<StickerLoopProps>): StickerLoopProps => stickerLoopSchema.parse({...DEFAULTS, ...patch});
const markupAt = (props: StickerLoopProps, frame: number) =>
  renderToStaticMarkup(createElement(StickerFrame, {props, frame, durationInFrames: N}));

type Path = {points: [number, number][]; fill: string; stroke: string; width: number};
type Glyph = {x: number; y: number; angle: number; paths: Path[]};
/** The one glyph of the markup: its translate, its rotate and each path's points, fill, stroke and stroke width. */
const glyphOf = (markup: string): Glyph => {
  const matches = [...markup.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)">(.*?)<\/g>/g)];
  assert.equal(matches.length, 1, 'one sticker per file');
  const match = matches[0]!;
  return {
    x: Number(match[1]), y: Number(match[2]), angle: Number(match[3]),
    paths: [...match[4]!.matchAll(/<path d="([^"]+)" fill="([^"]+)" stroke="([^"]+)" stroke-width="([\d.]+)"/g)].map((path) => {
      const numbers = path[1]!.match(/-?[\d.]+/g)!.map(Number);
      return {
        points: Array.from({length: numbers.length / 2}, (_, i): [number, number] => [numbers[2 * i]!, numbers[2 * i + 1]!]),
        fill: path[2]!, stroke: path[3]!, width: Number(path[4]),
      };
    }),
  };
};

/** The first whole frame of a step. */
const frameOfStep = (step: number) => Math.ceil((step * N) / STEPS);

/**
 * The room the drawn sticker leaves inside the canvas, from every vertex (and the sparkle's control
 * points, which lie inside its tips) as the markup draws it, plus half the widest stroke (the rim's,
 * or the line's at rim 0; round joins reach that far from a vertex):
 *   - `edge`, to the nearest canvas edge, with the glyph's own rotate and translate;
 *   - `turn`, to the circle inscribed in the canvas, at any turn: the square is sized to hold every
 *     pose turned any way (the kit's extent rule), so this is the margin the canvas was chosen by.
 */
const roomOf = (glyph: Glyph) => {
  const radians = (glyph.angle * Math.PI) / 180;
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  const half = Math.max(...glyph.paths.map((path) => path.width)) / 2;
  let edge = Infinity;
  let reach = 0;
  for (const [px, py] of glyph.paths[0]!.points) {
    const x = glyph.x + px * cos - py * sin;
    const y = glyph.y + px * sin + py * cos;
    edge = Math.min(edge, x - half, y - half, STICKER_CANVAS.width - x - half, STICKER_CANVAS.height - y - half);
    reach = Math.max(reach, Math.hypot(px, py) + half);
  }
  return {edge, turn: Math.min(glyph.x, glyph.y, STICKER_CANVAS.width - glyph.x, STICKER_CANVAS.height - glyph.y) - reach};
};

// Dies with: F1-2 (STICKER_SIZE 256 → 272: the sticker's turned corners leave the canvas); F1-3 (256 → 240: more than
// 4 px of empty square round the widest pose).
test('sticker loop: every motif and pose stays 1.5 to 4 px inside the canvas', () => {
  assert.deepEqual(STICKER_CANVAS, kindPolicies.sticker.fixedSize);
  const widest: Record<StickerMotif, number> = {star: Infinity, sparkle: Infinity, bolt: Infinity};
  for (const motif of MOTIFS) {
    for (let rim = 0; rim <= 8; rim += 1) {
      const props = propsOf({motif, rim});
      for (let pose = 0; pose < STICKER_POSES[motif].length; pose += 1) {
        const {edge, turn} = roomOf(glyphOf(markupAt(props, frameOfStep(pose))));
        assert.ok(edge >= 1.5, `${motif} pose ${pose} rim ${rim}: only ${edge.toFixed(2)} px to the canvas edge`);
        assert.ok(turn >= 1.5, `${motif} pose ${pose} rim ${rim}: turned, only ${turn.toFixed(2)} px inside the canvas`);
        if (rim === DEFAULTS.rim) widest[motif] = Math.min(widest[motif], turn);
      }
    }
  }
  const tightest = Math.min(...Object.values(widest));
  assert.ok(tightest <= 4, `the widest motif leaves ${tightest.toFixed(2)} px at rim ${DEFAULTS.rim}, turned: the square is too large`);
});

// Dies with: F1-4 (the pose table read from offset 1, so frame 0 and the PNG are not at rest).
test('sticker loop: frame 0 is the rest pose and frame 720 draws frame 0', () => {
  assert.equal(N, 720);
  for (const motif of MOTIFS) {
    const props = propsOf({motif});
    const first = markupAt(props, 0);
    const glyph = glyphOf(first);
    assert.deepEqual([glyph.x, glyph.y, glyph.angle], [152, 152, MOTIF_TILT[motif]], motif);
    assert.match(first, /data-scale="1"/, motif);
    assert.equal(markupAt(props, N), first, `${motif}: the seam`);
  }
});

// Dies with: F1-5 (stickerPoseAt reads frame 0 always, so the sticker never moves).
test('sticker loop: the pose changes on the step frames only, eight a second', () => {
  assert.equal(STEPS, 96);
  for (const motif of MOTIFS) {
    const table = STICKER_POSES[motif];
    // No table repeats a pose on neighbouring steps (the seam included), so every step shows.
    table.forEach((pose, index) => assert.notDeepEqual(pose, table[(index + 1) % table.length], `${motif} ${index}`));
    const props = propsOf({motif});
    const markups = Array.from({length: N + 1}, (_, frame) => markupAt(props, frame));
    const changes: number[] = [];
    for (let frame = 0; frame < N; frame += 1) if (markups[frame] !== markups[frame + 1]) changes.push(frame + 1);
    assert.equal(changes.length, STEPS, `${motif}: 95 changes inside the loop and the seam's`);
    assert.equal(changes.at(-1), N, `${motif}: the seam changes too`);
    for (const frame of changes) assert.notEqual(stepAt(frame, N, STEPS), stepAt(frame - 1, N, STEPS), `${motif} ${frame}`);
  }
});

// The pose each step draws, read from the markup against the pose table: the rotate is the motif's tilt plus the
// step's turn, and the scale goes both into data-scale and into the drawn path (the shape height times the scale).
// Dies with: F1-13 (`+ pose.turn` → `- pose.turn` in getStickerScene); F1-14 (the pose's turn dropped from the angle).
test('sticker loop: every step draws its pose from the table, turn and scale', () => {
  for (const motif of MOTIFS) {
    const table = STICKER_POSES[motif];
    const props = propsOf({motif});
    for (let step = 0; step < STEPS; step += 1) {
      const pose = table[step % table.length]!;
      const markup = markupAt(props, frameOfStep(step));
      const glyph = glyphOf(markup);
      assert.ok(Math.abs(glyph.angle - (MOTIF_TILT[motif] + pose.turn)) < 1e-3, `${motif} step ${step}: angle ${glyph.angle}`);
      const scale = Number(/data-scale="([-\d.]+)"/.exec(markup)![1]);
      assert.ok(Math.abs(scale - pose.scale) < 1e-3, `${motif} step ${step}: scale ${scale}`);
    }
  }
});

// Dies with: F1-6 (stickerLine gives 5 px from 120 px up); F1-8 (the schema's rim defaults to 3 px).
test('sticker loop: a 6 px ink line inside a 4 px cream rim', () => {
  const markup = markupAt(DEFAULTS, 0);
  const glyph = glyphOf(markup);
  assert.deepEqual(glyph.paths.map(({fill, stroke, width}) => [fill, stroke, width]), [
    ['#F6E2E4', '#F6E2E4', 14],
    ['#F4A66C', '#4A3A69', 6],
  ]);
  assert.equal(markup.match(/stroke-linejoin="round"/g)?.length, 2);
  for (const banned of [/filter/, /mix-blend/i, /opacity/, /animation/, /transition/]) assert.doesNotMatch(markup, banned);
});

// Dies with: F1-7 (the shared Canvas paints backgroundColor whatever the format and transparent say).
test('sticker loop: alpha formats keep the canvas clear, MP4 and GIF sit on backgroundColor', () => {
  const backgroundOf = (patch: Partial<StickerLoopProps>) => markupAt(propsOf(patch), 0).match(/background-color:([^;"]+)/)?.[1];
  for (const outputFormat of ['webm', 'png', 'mov'] as const satisfies readonly OutputFormat[]) {
    assert.equal(backgroundOf({outputFormat}), 'transparent', outputFormat);
    assert.equal(backgroundOf({outputFormat, transparent: false}), DEFAULTS.backgroundColor, `${outputFormat} opaque`);
  }
  for (const outputFormat of ['mp4', 'gif'] as const satisfies readonly OutputFormat[]) {
    assert.equal(backgroundOf({outputFormat}), DEFAULTS.backgroundColor, outputFormat);
  }
});

// Dies with: F1-9 (reachOf takes the loose sticker's 6 px line, so the kit's room checks grow).
test('sticker motifs: reachOf keeps the kit\'s line and reachWithLine takes any line', () => {
  for (const motif of MOTIFS) {
    for (const size of [20, 24, 30, 44]) {
      for (const [rim, scale] of [[0, 1], [2, 1.1], [3, 0.92]] as const) {
        assert.equal(reachOf(motif, size, rim, scale), reachWithLine(motif, size, lineOf(size), rim, scale), `${motif} ${size}`);
      }
    }
    // At scale 1 a span of 0.5 (the star) cancels the line out; the sparkle's blink scale does not.
    assert.notEqual(reachWithLine(motif, 256, 6, 4, 1.1), reachWithLine(motif, 256, lineOf(256), 4, 1.1), motif);
  }
});
