import type {Rect} from '../shared/box';

/**
 * Rounded rectangles with a radius per corner, for the vertical kind's windows. Local on purpose:
 * the landscape kinds' RoundRect (shared/geometry.ts) has one radius, and the 13 kits rely on it.
 */

/** Corner radii in px, clockwise from the top left: [top-left, top-right, bottom-right, bottom-left]. */
export type Corners = readonly [tl: number, tr: number, br: number, bl: number];

/** A rect with four corner radii, in canvas pixels. */
export type CornerRect = Rect & {readonly radii: Corners};

/** Each radius capped at half the shorter side, as one-radius shapes are: the path and the SDF agree. */
export const clampCorners = (rect: Rect, radii: Corners): Corners => {
  const cap = Math.max(0, Math.min(rect.width, rect.height) / 2);
  return radii.map((radius) => Math.max(0, Math.min(radius, cap))) as unknown as Corners;
};

/** The same radius on all four corners. */
export const allCorners = (radius: number): Corners => [radius, radius, radius, radius];

const f = (value: number) => String(Math.round(value * 1000) / 1000);

/**
 * A closed path of the shape, clockwise on screen, from arcs (a radius of 0 is a square corner).
 * Plain path data, so several shapes combine under `fill-rule="evenodd"`: the screen minus its windows.
 */
export const cornerRectPath = (shape: CornerRect): string => {
  const {x, y, width, height} = shape;
  if (width <= 0 || height <= 0) return '';
  const [tl, tr, br, bl] = clampCorners(shape, shape.radii);
  const arc = (r: number, toX: number, toY: number) => (r > 0 ? `A${f(r)} ${f(r)} 0 0 1 ${f(toX)} ${f(toY)}` : '');
  return [
    `M${f(x + tl)} ${f(y)}`,
    `H${f(x + width - tr)}`, arc(tr, x + width, y + tr),
    `V${f(y + height - br)}`, arc(br, x + width - br, y + height),
    `H${f(x + bl)}`, arc(bl, x, y + height - bl),
    `V${f(y + tl)}`, arc(tl, x + tl, y),
    'Z',
  ].join('');
};

/**
 * Signed distance from a point to the shape's edge, in px: negative inside, positive outside.
 * Each quadrant uses its own corner's radius (the rounded box of Inigo Quilez, per corner).
 */
export const cornerRectSdf = (shape: CornerRect, px: number, py: number): number => {
  const [tl, tr, br, bl] = clampCorners(shape, shape.radii);
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const r = px >= cx ? (py >= cy ? br : tr) : (py >= cy ? bl : tl);
  const qx = Math.abs(px - cx) - (shape.width / 2 - r);
  const qy = Math.abs(py - cy) - (shape.height / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

/**
 * The shape moved `distance` px outwards (negative: inwards). A round corner keeps its centre, so
 * a band between two offsets is as wide at the corners as along the sides; a square corner stays square.
 */
export const offsetCornerRect = (shape: CornerRect, distance: number): CornerRect => {
  const radii = clampCorners(shape, shape.radii);
  const width = Math.max(0, shape.width + 2 * distance);
  const height = Math.max(0, shape.height + 2 * distance);
  const next = {x: shape.x - distance, y: shape.y - distance, width, height};
  return {...next, radii: clampCorners(next, radii.map((r) => (r > 0 ? Math.max(0, r + distance) : 0)) as unknown as Corners)};
};

/** A plain rect as a path (the whole screen, a zone). */
export const rectPathOf = ({x, y, width, height}: Rect): string =>
  `M${f(x)} ${f(y)}H${f(x + width)}V${f(y + height)}H${f(x)}Z`;

/** The vertical centre of a rect. */
export const centerOf = ({x, y, width, height}: Rect) => ({x: x + width / 2, y: y + height / 2});

/** Whether a rect lies wholly inside another. */
export const rectInside = (inner: Rect, outer: Rect) => inner.x >= outer.x && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/**
 * The smallest signed distance from the shape's edge to any point of `area` (negative: the shape
 * covers part of it), sampled every `step` px plus the area's edges; the shape is convex, so a
 * fine grid finds the true minimum within the step. Pure arithmetic, for tests and layout checks.
 */
export const minDistanceOver = (shape: CornerRect, area: Rect, step = 2): number => {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = area.x; x < area.x + area.width; x += step) xs.push(x);
  for (let y = area.y; y < area.y + area.height; y += step) ys.push(y);
  xs.push(area.x + area.width);
  ys.push(area.y + area.height);
  let best = Infinity;
  for (const x of xs) for (const y of ys) best = Math.min(best, cornerRectSdf(shape, x, y));
  return best;
};
