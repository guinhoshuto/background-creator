import {clampRadius, svgNumber, type RoundRect} from './geometry';

/**
 * Arc-length geometry of a rounded rectangle's centreline, the track every perimeter effect
 * (marching ants, comets, flowing colours) runs on. Arc length `s` starts at the middle of the
 * top edge, a straight part, and grows clockwise on screen (y down), so `s = 0` never sits on a
 * join. Lengths are pixels along the centreline.
 */

type Piece =
  | {kind: 'line'; length: number; x0: number; y0: number; dx: number; dy: number}
  | {kind: 'arc'; length: number; cx: number; cy: number; r: number; a0: number};

const pieces = (track: RoundRect): Piece[] => {
  const {x, y, width: w, height: h} = track;
  const r = clampRadius(track.radius, w, h);
  const a = w - 2 * r;
  const b = h - 2 * r;
  const q = (Math.PI / 2) * r;
  const cx = x + w / 2;
  return [
    {kind: 'line', length: a / 2, x0: cx, y0: y, dx: 1, dy: 0},
    {kind: 'arc', length: q, cx: x + w - r, cy: y + r, r, a0: -Math.PI / 2},
    {kind: 'line', length: b, x0: x + w, y0: y + r, dx: 0, dy: 1},
    {kind: 'arc', length: q, cx: x + w - r, cy: y + h - r, r, a0: 0},
    {kind: 'line', length: a, x0: x + w - r, y0: y + h, dx: -1, dy: 0},
    {kind: 'arc', length: q, cx: x + r, cy: y + h - r, r, a0: Math.PI / 2},
    {kind: 'line', length: b, x0: x, y0: y + h - r, dx: 0, dy: -1},
    {kind: 'arc', length: q, cx: x + r, cy: y + r, r, a0: Math.PI},
    {kind: 'line', length: a / 2, x0: x + r, y0: y, dx: 1, dy: 0},
  ];
};

/** P = 2(w − 2r) + 2(h − 2r) + 2πr: the centreline's length, in pixels. */
export const perimeterLength = (track: RoundRect): number => {
  const r = clampRadius(track.radius, track.width, track.height);
  return 2 * (track.width - 2 * r) + 2 * (track.height - 2 * r) + 2 * Math.PI * r;
};

/** Arc length folded into [0, P): any real `s` names a place on the closed track. */
export const wrapArc = (s: number, perimeter: number) => {
  const wrapped = s - Math.floor(s / perimeter) * perimeter;
  // Float noise can land exactly on P; that place is the start.
  return wrapped >= perimeter ? 0 : wrapped;
};

type Located = {piece: Piece; t: number};

const locate = (track: RoundRect, s: number): Located => {
  const list = pieces(track);
  let rest = wrapArc(s, perimeterLength(track));
  for (const piece of list) {
    if (rest <= piece.length) return {piece, t: rest};
    rest -= piece.length;
  }
  // Only float noise ends up here: the last piece closes the loop at the start.
  const last = list[list.length - 1]!;
  return {piece: last, t: last.length};
};

const pointOf = ({piece, t}: Located) => {
  if (piece.kind === 'line') return {x: piece.x0 + piece.dx * t, y: piece.y0 + piece.dy * t};
  const angle = piece.a0 + (piece.r > 0 ? t / piece.r : 0);
  return {x: piece.cx + piece.r * Math.cos(angle), y: piece.cy + piece.r * Math.sin(angle)};
};

/** The point at arc length `s` (any real; wrapped). `pointAt(P)` is `pointAt(0)`. */
export const pointAt = (track: RoundRect, s: number) => pointOf(locate(track, s));

/**
 * The unit direction of travel at arc length `s`, clockwise on screen. Continuous around a
 * round corner; a square corner (radius 0) turns at once, and there the incoming side wins.
 */
export const tangentAt = (track: RoundRect, s: number) => {
  const {piece, t} = locate(track, s);
  if (piece.kind === 'line') return {x: piece.dx, y: piece.dy};
  const angle = piece.a0 + (piece.r > 0 ? t / piece.r : 0);
  return {x: -Math.sin(angle), y: Math.cos(angle)};
};

/**
 * Fits a repeating pattern to the closed track: `n` whole repeats, each `period = P / n` long,
 * as close to `wanted` as rounding allows (at least one). A pattern that tiles the loop exactly
 * has no seam where it starts.
 */
export const fitPeriod = (perimeter: number, wanted: number) => {
  if (!(perimeter > 0) || !(wanted > 0)) throw new Error('O contorno e o período precisam ser positivos.');
  const n = Math.max(1, Math.round(perimeter / wanted));
  return {n, period: perimeter / n};
};

/**
 * How many whole periods a pattern travels in one cycle to go about `speed` px/s: rounded, and
 * at least one whenever it moves at all, like the steps of the dot grid. A whole number is what
 * makes the frame after the last the first again.
 */
export const lapsFor = (speed: number, durationSeconds: number, period: number) =>
  (speed > 0 ? Math.max(1, Math.round((speed * durationSeconds) / period)) : 0);

/** Points along the track from `s0` to `s1` (s1 ≥ s0), every `step` px or closer, ends included. */
export const samplePerimeter = (track: RoundRect, s0: number, s1: number, step = 1) => {
  const count = Math.max(1, Math.ceil((s1 - s0) / step));
  return Array.from({length: count + 1}, (_, index) => pointAt(track, s0 + ((s1 - s0) * index) / count));
};

/**
 * An open SVG path along the track from `s0` to `s1` (s1 ≥ s0, at most one lap), crossing the
 * start of the loop when it needs to. Straight parts become `L` and corners exact `A` arcs, so a
 * dash is as crisp as the outline it sits on. A dash at `s = P − 3` of length 10 is drawn as one
 * piece through the start, with no doubled cap.
 */
export const perimeterPath = (track: RoundRect, s0: number, s1: number): string => {
  const perimeter = perimeterLength(track);
  const length = Math.min(Math.max(0, s1 - s0), perimeter);
  const f = svgNumber;
  const start = pointAt(track, s0);
  const parts = [`M${f(start.x)} ${f(start.y)}`];
  if (length <= 0) return parts.join('');
  // Unroll the loop twice and emit the covered part of every piece, in order.
  const list = pieces(track);
  const from = wrapArc(s0, perimeter);
  const to = from + length;
  let pieceStart = 0;
  for (let index = 0; index < 2 * list.length; index++) {
    const piece = list[index % list.length]!;
    const pieceEnd = pieceStart + piece.length;
    const a = Math.max(from, pieceStart);
    const b = Math.min(to, pieceEnd);
    if (b - a > 1e-9) {
      const end = pointOf({piece, t: b - pieceStart});
      if (piece.kind === 'line') parts.push(`L${f(end.x)} ${f(end.y)}`);
      else parts.push(`A${f(piece.r)} ${f(piece.r)} 0 0 1 ${f(end.x)} ${f(end.y)}`);
    }
    pieceStart = pieceEnd;
  }
  return parts.join('');
};
