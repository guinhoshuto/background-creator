import {offsetRoundRect} from '../../geometry';
import {ceilHalf, fitsAt} from '../place';
import type {OrnamentCornerId, OrnamentFrame, OrnamentPlacement} from '../types';

/**
 * Where the 'terminal' set (TerminalGridLoop, "sand terminal") puts its motifs: the old HTML pack's
 * shapes (v3, survey §7.1 in `.cache/sand-terminal-kit/old-pack-survey.md`), at the pack's px with
 * ornamentSize 14. Pure: the frame and ornamentSize, no seed, no frame index.
 *
 *   - Squares (hero): a row of squares half the pitch wide, one every `ornamentSize` px (7 px
 *     squares every 14 px in the pack), ROW.gap px above the top line, anchored at its left end with
 *     a square first; on a circle, centred over the top. Where the bleed has no room (a Twitch
 *     panel) the row sits in the top padding pocket over the text column, and on a screen frame in
 *     the top band. Every square is its own placement.
 *   - Brackets (borders with a rectangular window): an L on each corner, arms of 30 px and a 3 px
 *     stroke, its outer corner 1 px outside the frame line, cut into abutting pieces so each fits
 *     its room beside the window.
 *   - Diamond (borders): the accent lock diamond, a 12 px square at 45°, centred on the frame line's
 *     top midpoint; the row leaves a gap over it.
 *   - Head square (chat header band): 9 px, knocked out of the dark band, its left side 20 px from
 *     the panel's (moved left until it clears the title).
 *   - Meter (chat footer band): five bars 5 px wide, 3 px apart, 5 to 18 px tall, bottom-aligned,
 *     ending 20 px from the panel's right side.
 *   - Double bar (rectangular blocks): a 1 px line and a 4 px bar 4 px apart, 20 px left of the text,
 *     from its top down as tall as the text area (at most 88 px), cut into abutting pieces.
 *
 * The lines measured here are the kit's 2 px strokes: the frame line (a border's stroke on its
 * band) and a panel's top line both sit on `frame.track`, and LINE.half px out of it is their outer
 * edge. Squares, brackets and diamond follow ornamentSize (the pitch) in the pack's ratios; the
 * band and pocket furniture (head square, meter, double bar) keeps its own px. Every motif is drawn
 * over a RIM px light rim (ornamentColors[1]) that keeps the ink readable over dark footage (the
 * head square, knocked out of a dark band, has none); the rim counts in each extent. A placement
 * carries the rect it draws (x0, y0, x1, y1) and, for a piece of a run, how far its rim reaches
 * past each end along the run (rimBefore, rimAfter): only a run's ends get one, so abutting pieces
 * never draw a rim over each other.
 */

/** The light rim under every motif, in px. */
export const RIM = 1;
/** The kit's lines are 2 px: their outer edge is this far out of the track. */
export const LINE = {half: 1} as const;

/** Squares, per ornamentSize (the pitch): side, gap from the line's outer edge to the row; pitches tried, even so the squares sit on whole px. */
export const ROW = {side: 0.5, gap: 10 / 14, minPitch: 6, opacity: 0.75} as const;
/** On a circle the row spans at most the radius. */
const ROW_CIRCLE_SPAN = 1;
/** Brackets, per ornamentSize: arm and stroke (30 and 3 px at 14); the outer corner `out` px past the line's outer edge. */
export const BRACKET = {arm: 30 / 14, width: 3 / 14, minWidth: 2, out: 1} as const;
/** Diamond, per ornamentSize: the side of the square turned 45° (12 px at 14), and the row's gap around it. */
export const DIAMOND = {side: 12 / 14, clear: 3} as const;
/** Head square: side, left side from the panel's left edge. */
export const HEAD = {side: 9, left: 20} as const;
/** Meter: bar width, gap, heights left to right, right end from the panel's right edge. */
export const METER = {bar: 5, gap: 3, heights: [5, 8, 11, 14, 18], right: 20} as const;
/** Double bar: line, gap, bar, gap to the text, tallest run. */
export const DBAR = {line: 1, gap: 4, bar: 4, text: 20, max: 88} as const;

export type TerminalMotif = 'square' | 'bracket-h' | 'bracket-v' | 'diamond' | 'head' | 'meter' | 'dbar';

/**
 * A terminal placement: the rect it draws (the diamond's is the square before the turn), its rim
 * across (0 for the head square, knocked out of a dark band: a rim would only grow it) and, for a
 * piece of a run (bracket-h, bracket-v, dbar), the rim past each end along the run.
 */
export type TerminalPlacement = OrnamentPlacement & {
  motif: TerminalMotif; x0: number; y0: number; x1: number; y1: number; rim: number; rimBefore: number; rimAfter: number;
};

type Box = {x0: number; y0: number; x1: number; y1: number};

/**
 * The extent of a rect drawn with its rim (and half a pixel of antialiasing), round its centre:
 * `rim` across the run, `rimBefore` and `rimAfter` past its ends along it.
 */
export const rectExtent = (box: Box, along: 'h' | 'v' = 'h', rim = RIM, rimBefore = rim, rimAfter = rim) => {
  const across = (along === 'h' ? box.y1 - box.y0 : box.x1 - box.x0) / 2 + rim;
  const length = (along === 'h' ? box.x1 - box.x0 : box.y1 - box.y0) / 2 + Math.max(rimBefore, rimAfter, 0);
  return ceilHalf(Math.hypot(length, across) + 0.5);
};

/** The diamond's extent: its half diagonal, the rim (as a diamond RIM px larger) and antialiasing. */
export const diamondExtent = (side: number) => ceilHalf(side / Math.SQRT2 + RIM + 0.5);

const placement = (
  motif: TerminalMotif, slot: TerminalPlacement['slot'], box: Box, extent: number, size: number, rim = RIM, rimBefore = rim, rimAfter = rim,
): TerminalPlacement => ({
  motif, slot, layer: 'front', x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, extent, size, ...box, rim, rimBefore, rimAfter,
});

const fits = (frame: OrnamentFrame, spot: TerminalPlacement) => fitsAt(frame, spot.x, spot.y, spot.extent, 'front');

/** The kit line's outer edge: a panel's outline (2 px stroke), a border's frame line. */
const lineEdge = (frame: OrnamentFrame) => offsetRoundRect(frame.track, LINE.half);

/** Even pitches from ornamentSize down to ROW.minPitch: whole-px squares. */
const pitches = (ornamentSize: number) => {
  const list: number[] = [];
  for (let pitch = 2 * Math.floor(ornamentSize / 2); pitch >= ROW.minPitch; pitch -= 2) list.push(pitch);
  return list;
};

const square = (cx: number, cy: number, side: number): Box => ({x0: cx - side / 2, y0: cy - side / 2, x1: cx + side / 2, y1: cy + side / 2});

/** The squares of a row of `count` from `x0` (left side of the first) with its centres on `cy`. */
const rowFrom = (x0: number, cy: number, count: number, pitch: number) =>
  Array.from({length: count}, (_, index) => square(x0 + index * pitch + (pitch * ROW.side) / 2, cy, pitch * ROW.side));

/** As many squares as fit between `left` and `right`, starting at `left`. */
const rowBetween = (left: number, right: number, cy: number, pitch: number) =>
  rowFrom(left, cy, Math.max(0, Math.floor((right - left + pitch * ROW.side) / pitch + 1e-9)), pitch);

/**
 * The candidate rows for a pitch, in order of preference, each a list of squares: above the line
 * (centred on a circle), then the top padding pocket over the text (panels), then the top band
 * (screen frames).
 */
const rowCandidates = (frame: OrnamentFrame, pitch: number): Box[][] => {
  const side = pitch * ROW.side;
  const edge = lineEdge(frame);
  const cy = Math.round(edge.y - pitch * ROW.gap) - side / 2;
  const candidates: Box[][] = [];
  if (frame.fit !== 'screen') {
    if (frame.circle) {
      const span = Math.min(edge.width, ROW_CIRCLE_SPAN * edge.width / 2);
      const count = Math.max(1, Math.floor((span + side) / pitch));
      const left = Math.round(edge.x + edge.width / 2 - ((count - 1) * pitch + side) / 2);
      candidates.push(rowFrom(left, cy, count, pitch));
    } else {
      candidates.push(rowBetween(edge.x, edge.x + edge.width, cy, pitch));
    }
  }
  const text = frame.keepOut[0];
  if (frame.fit === 'panel' && !frame.circle && text) {
    const inner = 2 * frame.track.y - frame.outline.y;
    const mid = Math.round((inner + text.y) / 2 - side / 2) + side / 2;
    candidates.push(rowBetween(Math.ceil(text.x), text.x + text.width, mid, pitch));
  }
  if (frame.fit === 'screen' && frame.hole) {
    const top = frame.paintLimit.y;
    const mid = Math.round((top + frame.hole.y) / 2 - side / 2) + side / 2;
    candidates.push(rowBetween(Math.ceil(frame.hole.x), frame.hole.x + frame.hole.width, mid, pitch));
  }
  return candidates;
};

/** The row: the largest pitch at which a whole candidate row fits, its squares as placements. */
const placeRow = (frame: OrnamentFrame, ornamentSize: number): TerminalPlacement[] => {
  for (const pitch of pitches(ornamentSize)) {
    for (const row of rowCandidates(frame, pitch)) {
      if (row.length === 0) continue;
      const squares = row.map((box) => placement('square', 'top', box, rectExtent(box), pitch));
      if (squares.every((spot) => fits(frame, spot))) return squares;
    }
  }
  return [];
};

/** The lock diamond centred on the frame line's top midpoint (borders around a window). */
const placeDiamond = (frame: OrnamentFrame, ornamentSize: number): TerminalPlacement | null => {
  if (frame.kind !== 'border' || frame.fit !== 'window') return null;
  const side = Math.round(DIAMOND.side * ornamentSize);
  const cx = frame.track.x + frame.track.width / 2;
  const spot = placement('diamond', 'top', square(cx, frame.track.y, side), diamondExtent(side), side);
  return fits(frame, spot) ? spot : null;
};

/**
 * A run from `from` to `to` along one axis, its other side fixed (`across`), cut into the fewest
 * abutting whole-px pieces that all fit; null when even 1 px pieces do not. `rimBefore` and
 * `rimAfter` are the run's own ends.
 */
const placeRun = (
  frame: OrnamentFrame, motif: 'bracket-h' | 'bracket-v' | 'dbar', slot: TerminalPlacement['slot'], along: 'h' | 'v',
  from: number, to: number, across: readonly [number, number], ends: readonly [number, number],
): TerminalPlacement[] | null => {
  const length = Math.abs(to - from);
  const sign = Math.sign(to - from) || 1;
  for (let count = 1; count <= Math.ceil(length); count++) {
    const pieces: TerminalPlacement[] = [];
    for (let index = 0; index < count; index++) {
      const a = from + sign * Math.round((length * index) / count);
      const b = from + sign * Math.round((length * (index + 1)) / count);
      // Rims along the run: the run's own ends only, read in the drawing's direction (before = smaller coordinate).
      const startEnd = index === 0 ? ends[0] : 0;
      const finishEnd = index === count - 1 ? ends[1] : 0;
      const [lo, hi] = sign > 0 ? [a, b] : [b, a];
      const [rimBefore, rimAfter] = sign > 0 ? [startEnd, finishEnd] : [finishEnd, startEnd];
      const box = along === 'h' ? {x0: lo, x1: hi, y0: across[0], y1: across[1]} : {x0: across[0], x1: across[1], y0: lo, y1: hi};
      pieces.push(placement(motif, slot, box, rectExtent(box, along, RIM, rimBefore, rimAfter), Math.abs(b - a), RIM, rimBefore, rimAfter));
    }
    if (pieces.every((spot) => fits(frame, spot))) return pieces;
  }
  return null;
};

const CORNER_SIGNS: Record<OrnamentCornerId, readonly [number, number]> = {TL: [-1, -1], TR: [1, -1], BR: [1, 1], BL: [-1, 1]};

/**
 * The lock-on brackets: on each corner an L whose outer corner is BRACKET.out px past the frame
 * line's outer edge, its arms back along the line. The horizontal arm holds the corner; the
 * vertical one starts under it, its rim RIM px later (the horizontal arm's rim covers that pixel).
 * All four corners or none: a frame with a bracket missing would read as broken.
 */
const placeBrackets = (frame: OrnamentFrame, ornamentSize: number): TerminalPlacement[] => {
  if (frame.kind !== 'border' || frame.fit !== 'window' || frame.circle) return [];
  const arm = Math.round(BRACKET.arm * ornamentSize);
  const width = Math.max(BRACKET.minWidth, Math.round(BRACKET.width * ornamentSize));
  const edge = lineEdge(frame);
  const pieces: TerminalPlacement[] = [];
  for (const slot of ['TL', 'TR', 'BR', 'BL'] as const) {
    const [sx, sy] = CORNER_SIGNS[slot];
    const vx = (sx < 0 ? edge.x : edge.x + edge.width) + sx * BRACKET.out;
    const vy = (sy < 0 ? edge.y : edge.y + edge.height) + sy * BRACKET.out;
    const acrossH = [Math.min(vy, vy - sy * width), Math.max(vy, vy - sy * width)] as const;
    const acrossV = [Math.min(vx, vx - sx * width), Math.max(vx, vx - sx * width)] as const;
    const h = placeRun(frame, 'bracket-h', slot, 'h', vx, vx - sx * arm, acrossH, [RIM, RIM]);
    const v = placeRun(frame, 'bracket-v', slot, 'v', vy - sy * width, vy - sy * arm, acrossV, [-RIM, RIM]);
    if (!h || !v) return [];
    pieces.push(...h, ...v);
  }
  return pieces;
};

/** The head square on a chat's header band, its left side HEAD.left px in, moved left (whole px) until it clears the title. */
const placeHead = (frame: OrnamentFrame): TerminalPlacement | null => {
  const band = frame.bands.header;
  if (!band || band.height < HEAD.side + 2 * RIM) return null;
  const top = Math.round(band.y + (band.height - HEAD.side) / 2);
  for (let left = frame.outline.x + HEAD.left; left >= band.x + RIM; left--) {
    const box = {x0: left, y0: top, x1: left + HEAD.side, y1: top + HEAD.side};
    const spot = placement('head', 'top', box, rectExtent(box, 'h', 0), HEAD.side, 0);
    if (fits(frame, spot)) return spot;
  }
  return null;
};

/** The meter's span: five bars and four gaps. */
export const METER_WIDTH = METER.heights.length * METER.bar + (METER.heights.length - 1) * METER.gap;
export const METER_HEIGHT = Math.max(...METER.heights);

/** The signal meter on a chat's footer band, centred in its height, ending METER.right px from the right side. */
const placeMeter = (frame: OrnamentFrame): TerminalPlacement | null => {
  const band = frame.bands.footer;
  if (!band || band.height < METER_HEIGHT + 2 * RIM) return null;
  const x1 = frame.outline.x + frame.outline.width - METER.right;
  const y1 = Math.round(band.y + (band.height + METER_HEIGHT) / 2);
  const box = {x0: x1 - METER_WIDTH, y0: y1 - METER_HEIGHT, x1, y1};
  const spot = placement('meter', 'bottom', box, rectExtent(box), METER_WIDTH);
  return box.x0 >= band.x + RIM && fits(frame, spot) ? spot : null;
};

/** The double bar beside a rectangular block's text, inside the box; [] when the left pocket cannot hold it. */
const placeDoubleBar = (frame: OrnamentFrame): TerminalPlacement[] => {
  const text = frame.keepOut[0];
  if (frame.kind !== 'block' || frame.circle || !text) return [];
  const x1 = Math.floor(text.x) - DBAR.text;
  const x0 = x1 - (DBAR.line + DBAR.gap + DBAR.bar);
  if (x0 < frame.outline.x + RIM) return [];
  const top = Math.ceil(text.y);
  const bottom = top + Math.min(DBAR.max, Math.floor(text.y + text.height) - top);
  if (bottom - top < 2 * HEAD.side) return [];
  return placeRun(frame, 'dbar', 'left', 'v', top, bottom, [x0, x1], [RIM, RIM]) ?? [];
};

/** The squares' gap round the diamond: those within its half diagonal and DIAMOND.clear px of its centre on x go. */
const clearOf = (diamond: TerminalPlacement | null) => (box: TerminalPlacement) => {
  if (!diamond) return true;
  const reach = (diamond.x1 - diamond.x0) / Math.SQRT2 + DIAMOND.clear;
  return box.x1 <= diamond.x - reach || box.x0 >= diamond.x + reach;
};

/** Every motif of the set on this frame, the row's squares first; [] when the row fits nowhere. */
export const placeTerminal = (frame: OrnamentFrame, ornamentSize: number): TerminalPlacement[] => {
  const diamond = placeDiamond(frame, ornamentSize);
  const row = placeRow(frame, ornamentSize).filter(clearOf(diamond));
  if (row.length === 0) return [];
  const head = frame.kind === 'chat' ? placeHead(frame) : null;
  const meter = frame.kind === 'chat' ? placeMeter(frame) : null;
  return [
    ...row,
    ...placeBrackets(frame, ornamentSize),
    ...(diamond ? [diamond] : []),
    ...(head ? [head] : []),
    ...(meter ? [meter] : []),
    ...placeDoubleBar(frame),
  ];
};

/** The smallest hero: a square of the smallest pitch with its rim. */
export const TERMINAL_MIN_EXTENT = rectExtent(square(0, 0, ROW.minPitch * ROW.side));
