import {createSeededRandom} from '../../../loop';
import type {Rect} from '../box';
import {clampRadius, roundRectSdf} from '../geometry';
import type {OrnamentCornerId, OrnamentFrame, OrnamentLayerName, OrnamentPlacement} from './types';

/**
 * Placement helpers. Every motif is a circle of radius `extent` (body, motion and light) that must
 * lie inside the paint limit (ORNAMENT_EDGE px in), never enter the hole and, on the front layer,
 * keep ORNAMENT_CLEARANCE px from the text areas. A corner motif slides along its slot's outward
 * diagonal (t px from the outline's corner point; negative is inwards) to the spot nearest where
 * the set prefers it that holds it. Nothing here reads the seed or the frame.
 */

/** Gap between a motif's circle and the paint limit (the file's edge), in px. */
export const ORNAMENT_EDGE = 1;
/** Gap between a front motif's circle and a text area, in px. */
export const ORNAMENT_CLEARANCE = 1;
/**
 * The ornaments' seed stream: seed + 503 + the set's offset (0, 20, 40, 60). Taken elsewhere:
 * fill +101, stroke +211, glow/halo +307, corners/accent +401, lightning +509.
 */
export const ORNAMENT_SEED = 503;
/** How far out a corner motif may slide, in px (far beyond any bleed). */
export const ORNAMENT_MAX_SLIDE = 512;

/** Corners in the order the arc length meets them (border's CORNER_SIGNS): TR, BR, BL, TL. */
const CORNERS: readonly [OrnamentCornerId, number, number][] = [['TR', 1, -1], ['BR', 1, 1], ['BL', -1, 1], ['TL', -1, -1]];

/** A corner slot: the middle of the outline's corner (x, y) and the unit diagonal (dx, dy) out of it. */
export type OrnamentCorner = {slot: OrnamentCornerId; index: number; x: number; y: number; dx: number; dy: number};

export type SlideRange = {min: number; max: number};

/**
 * The four corner slots of the outline, TR, BR, BL, TL: the middle of each round corner (the
 * corner itself when square), with the same formula as the border's corner points, so a circle's
 * slots are its 45° points.
 */
export const cornerSlots = (frame: Pick<OrnamentFrame, 'outline'>): OrnamentCorner[] => {
  const {outline} = frame;
  const r = clampRadius(outline.radius, outline.width, outline.height);
  return CORNERS.map(([slot, sx, sy], index) => {
    const dx = sx * Math.SQRT1_2;
    const dy = sy * Math.SQRT1_2;
    const cx = outline.x + outline.width / 2 + sx * (outline.width / 2 - r);
    const cy = outline.y + outline.height / 2 + sy * (outline.height / 2 - r);
    return {slot, index, x: cx + r * dx, y: cy + r * dy, dx, dy};
  });
};

/** One corner slot by name. */
export const cornerSlot = (frame: Pick<OrnamentFrame, 'outline'>, slot: OrnamentCornerId): OrnamentCorner =>
  cornerSlots(frame).find((corner) => corner.slot === slot)!;

/** The point `t` px along the slot's outward diagonal. */
export const pointOnSlot = (corner: OrnamentCorner, t: number) => ({x: corner.x + t * corner.dx, y: corner.y + t * corner.dy});

/** Signed distance from a point to a plain rect (negative inside). */
export const rectDistance = (rect: Rect, x: number, y: number) => roundRectSdf({...rect, radius: 0}, x, y);

/**
 * The largest extent a motif centred on (x, y) may take on `layer`: inside the paint limit by
 * ORNAMENT_EDGE, clear of the hole and, in front, ORNAMENT_CLEARANCE from every text area.
 * Negative when the centre itself is off limits. On a screen frame ('screen') the back layer has no
 * room at all (−∞): what the outer edge leaves of the box is the band's fillet, which the band
 * fill paints over right after, so a back motif there would only show through the fill's
 * transparency. A screen set puts its motifs (its hero included) in front.
 */
export const maxExtentAt = (frame: OrnamentFrame, x: number, y: number, layer: OrnamentLayerName) => {
  if (layer === 'back' && frame.fit === 'screen') return -Infinity;
  const limit = frame.paintLimit;
  let room = Math.min(x - limit.x, limit.x + limit.width - x, y - limit.y, limit.y + limit.height - y) - ORNAMENT_EDGE;
  if (frame.hole) room = Math.min(room, roundRectSdf(frame.hole, x, y));
  if (layer === 'front') for (const area of frame.keepOut) room = Math.min(room, rectDistance(area, x, y) - ORNAMENT_CLEARANCE);
  return room;
};

/** Whether a motif of `extent` centred on (x, y) fits on `layer` (see maxExtentAt). Sets validate non-corner spots with it. */
export const fitsAt = (frame: OrnamentFrame, x: number, y: number, extent: number, layer: OrnamentLayerName) =>
  extent > 0 && extent <= maxExtentAt(frame, x, y, layer) + 1e-9;

/** Whether a circle (a light) around (x, y) reaches into a text area. */
export const meetsKeepOut = (frame: Pick<OrnamentFrame, 'keepOut'>, x: number, y: number, radius: number) =>
  frame.keepOut.some((area) => rectDistance(area, x, y) < radius);

/**
 * How far along its diagonal a motif may slide: in front from a quarter of the outline's smaller
 * side inwards (so a circle's slot never slides through the centre to the other side); behind,
 * only outwards (its centre at or beyond the corner, so the panel hides at most half of it).
 */
export const slideRange = (frame: Pick<OrnamentFrame, 'outline'>, layer: OrnamentLayerName): SlideRange => ({
  min: layer === 'front' ? -Math.min(frame.outline.width, frame.outline.height) / 4 : 0,
  max: ORNAMENT_MAX_SLIDE,
});

/** Down to the half pixel: sizes and rooms are reported in steps of 0.5 px. */
export const floorHalf = (value: number) => Math.floor(value * 2 + 1e-9) / 2;
/** Up to the half pixel: extents that must hold something are rounded outwards, on the same grid. */
export const ceilHalf = (value: number) => Math.ceil(value * 2 - 1e-9) / 2;

type CirclePoint = {readonly x: number; readonly y: number};
export type EnclosingCircle = {x: number; y: number; r: number};
const circleOf2 = (a: CirclePoint, b: CirclePoint): EnclosingCircle =>
  ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: Math.hypot(a.x - b.x, a.y - b.y) / 2});
const circleOf3 = (a: CirclePoint, b: CirclePoint, c: CirclePoint): EnclosingCircle => {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return [circleOf2(a, b), circleOf2(a, c), circleOf2(b, c)].reduce((best, circle) => (circle.r > best.r ? circle : best));
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return {x, y, r: Math.max(Math.hypot(a.x - x, a.y - y), Math.hypot(b.x - x, b.y - y), Math.hypot(c.x - x, c.y - y))};
};
const insideCircle = (circle: EnclosingCircle, point: CirclePoint) => Math.hypot(point.x - circle.x, point.y - circle.y) <= circle.r + 1e-7;

/** The smallest circle holding every point (Welzl's incremental form, in input order: deterministic). */
export const enclosingCircle = (points: readonly CirclePoint[]): EnclosingCircle => {
  if (points.length === 0) return {x: 0, y: 0, r: 0};
  let circle: EnclosingCircle = {x: points[0]!.x, y: points[0]!.y, r: 0};
  for (let i = 1; i < points.length; i++) {
    if (insideCircle(circle, points[i]!)) continue;
    circle = {x: points[i]!.x, y: points[i]!.y, r: 0};
    for (let j = 0; j < i; j++) {
      if (insideCircle(circle, points[j]!)) continue;
      circle = circleOf2(points[i]!, points[j]!);
      for (let k = 0; k < j; k++) if (!insideCircle(circle, points[k]!)) circle = circleOf3(points[i]!, points[j]!, points[k]!);
    }
  }
  return circle;
};

const SAMPLE_STEP = 0.5;

/** Values from `from` to `to` every `step` px, nearest `prefer` first (the lower on ties). */
export const scanAround = (from: number, to: number, prefer: number, step = SAMPLE_STEP) => {
  const values: number[] = [];
  for (let value = from; value <= to + 1e-9; value += step) values.push(value);
  return values.sort((a, b) => Math.abs(a - prefer) - Math.abs(b - prefer) || a - b);
};

/**
 * The largest extent that fits somewhere on the slot's diagonal within `range`, floored to 0.5 px,
 * and the slide `t` where it does (the nearest to 0 among equals). Sampled every 0.5 px, then
 * refined around the best sample.
 */
export const roomAt = (
  frame: OrnamentFrame, corner: OrnamentCorner, layer: OrnamentLayerName, range: SlideRange = slideRange(frame, layer),
): {extent: number; t: number} => {
  const at = (t: number) => {
    const {x, y} = pointOnSlot(corner, t);
    return maxExtentAt(frame, x, y, layer);
  };
  let best = {room: -Infinity, t: range.min};
  const steps = Math.max(0, Math.floor((range.max - range.min) / SAMPLE_STEP + 1e-9));
  for (let index = 0; index <= steps; index++) {
    const t = range.min + index * SAMPLE_STEP;
    const room = at(t);
    if (room > best.room + 1e-9 || (Math.abs(room - best.room) <= 1e-9 && Math.abs(t) < Math.abs(best.t))) best = {room, t};
  }
  // The room is 1-Lipschitz along t: refine within half a step of the best sample (ternary search).
  let [lo, hi] = [Math.max(range.min, best.t - SAMPLE_STEP), Math.min(range.max, best.t + SAMPLE_STEP)];
  for (let iteration = 0; iteration < 40; iteration++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (at(a) < at(b)) lo = a;
    else hi = b;
  }
  const refined = (lo + hi) / 2;
  if (at(refined) > best.room) best = {room: at(refined), t: refined};
  return {extent: Math.max(0, floorHalf(best.room)), t: best.t};
};

/**
 * The slide nearest `prefer` (clamped to the range) where a motif of `extent` fits on the slot's
 * diagonal, and its centre; null when it fits nowhere in the range. Scans outwards from `prefer`
 * every 0.5 px, then bisects to the exact edge of the fitting stretch. A stretch narrower than the
 * scan step (an extent right at the slot's room) is found through roomAt's best slide.
 */
export const slideToFit = (
  frame: OrnamentFrame, corner: OrnamentCorner, extent: number, layer: OrnamentLayerName,
  range: SlideRange = slideRange(frame, layer), prefer = 0,
): {x: number; y: number; t: number} | null => {
  const fits = (t: number) => {
    const {x, y} = pointOnSlot(corner, t);
    return fitsAt(frame, x, y, extent, layer);
  };
  const start = Math.min(range.max, Math.max(range.min, prefer));
  const result = (t: number) => ({...pointOnSlot(corner, t), t});
  if (fits(start)) return result(start);
  const refine = (outside: number, inside: number) => {
    for (let iteration = 0; iteration < 40; iteration++) {
      const middle = (outside + inside) / 2;
      if (fits(middle)) inside = middle;
      else outside = middle;
    }
    return inside;
  };
  const reach = Math.max(start - range.min, range.max - start);
  for (let distance = SAMPLE_STEP; distance <= reach + SAMPLE_STEP; distance += SAMPLE_STEP) {
    const found: number[] = [];
    for (const sign of [1, -1]) {
      const t = Math.min(range.max, Math.max(range.min, start + sign * distance));
      if (fits(t)) found.push(refine(Math.min(range.max, Math.max(range.min, start + sign * (distance - SAMPLE_STEP))), t));
    }
    if (found.length > 0) {
      found.sort((a, b) => Math.abs(a - start) - Math.abs(b - start) || b - a);
      return result(found[0]!);
    }
  }
  const best = roomAt(frame, corner, layer, range).t;
  if (!fits(best)) return null;
  // The stretch around the best slide is under one step wide: its end nearest `prefer`.
  const towards = best > start ? -1 : 1;
  return result(refine(Math.min(range.max, Math.max(range.min, best + towards * SAMPLE_STEP)), best));
};

export type FitMotifOptions = {
  motif: string;
  layer: OrnamentLayerName;
  /** The extent the motif asks for, in px. */
  nominal: number;
  /** Below this extent the motif is dropped (the hero's minimum: ≤ 12 px). */
  min: number;
  range?: SlideRange;
  /** The slide the set would like (default 0: centred on the outline's corner point). */
  prefer?: number;
  /** The motif's size parameter per px of extent (size = extent·ratio); 1 by default. */
  ratio?: number;
  /**
   * The set's hero (SPEC §2.3: refused only when it fits no slot at its minimum): dropped only
   * when the room cuts it below both `min` and its own nominal, so a small ornamentSize whose
   * nominal is under `min` still places it (at the nominal) wherever the room allows.
   */
  hero?: boolean;
};

/**
 * One motif at a corner slot: extent = min(nominal, the slot's room), floored to 0.5 px, at the
 * slide nearest `prefer` that holds it; null (dropped) when that is below `min` (for the hero,
 * below min(min, nominal floored)).
 */
export const fitMotif = (frame: OrnamentFrame, corner: OrnamentCorner, options: FitMotifOptions): OrnamentPlacement | null => {
  const range = options.range ?? slideRange(frame, options.layer);
  const room = roomAt(frame, corner, options.layer, range);
  const extent = floorHalf(Math.min(options.nominal, room.extent));
  const least = options.hero ? Math.min(options.min, floorHalf(options.nominal)) : options.min;
  if (!(extent > 0) || extent < least - 1e-9) return null;
  const spot = slideToFit(frame, corner, extent, options.layer, range, options.prefer ?? 0);
  if (!spot) return null;
  return {
    motif: options.motif, slot: corner.slot, layer: options.layer, x: spot.x, y: spot.y, extent, size: extent * (options.ratio ?? 1),
  };
};

/** How far the placements reach beyond the box, in px (0 when all are inside): the layout's outset folds it. */
export const ornamentOutset = (frame: Pick<OrnamentFrame, 'box'>, placements: readonly OrnamentPlacement[]) => {
  const {box} = frame;
  let outset = 0;
  for (const {x, y, extent} of placements) {
    outset = Math.max(outset, box.x - (x - extent), x + extent - (box.x + box.width), box.y - (y - extent), y + extent - (box.y + box.height));
  }
  return outset;
};

/** Whole cycles per loop for a motion of `hz` over `durationSeconds` (at least one). */
export const harmonics = (hz: number, durationSeconds: number) => Math.max(1, Math.round(hz * durationSeconds));

/** The set's own random stream (seed + 503 + seedOffset): phases only, never placement. */
export const ornamentRandom = (seed: number, set: {seedOffset: number}) => createSeededRandom(seed + ORNAMENT_SEED + set.seedOffset);

/**
 * The corner slots a round block's accent arc leaves free: the arc spans 120° around the left
 * ('left': TL and BL) or the top ('top': TL and TR). Every slot elsewhere.
 */
export const slotsOffAccent = (frame: Pick<OrnamentFrame, 'outline' | 'circle' | 'accent'>): OrnamentCorner[] => {
  const corners = cornerSlots(frame);
  if (!frame.circle || !frame.accent) return corners;
  const free = frame.accent === 'left' ? ['TR', 'BR'] : ['BR', 'BL'];
  return corners.filter((corner) => free.includes(corner.slot));
};
