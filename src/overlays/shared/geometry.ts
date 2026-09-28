import type {Rect} from './box';

/**
 * A rectangle with four equal round corners, in canvas pixels. Every shape of the overlay
 * engine is one of these: the panel, the stroke centreline, a frame's window and its outer edge.
 * The radius is always clamped (see `clampRadius`), so `radius ≤ min(width, height) / 2`.
 */
export type RoundRect = Rect & {radius: number};

/** Distances from each side, in pixels (e.g. a chat header pushes `top` down). */
export type Insets = {top: number; right: number; bottom: number; left: number};

/**
 * The largest radius the shape can take is half its smaller side: beyond it the corners would
 * overlap. A bigger request reads as "as round as possible", a pill or a circle, like CSS.
 */
export const clampRadius = (radius: number, width: number, height: number) =>
  Math.max(0, Math.min(radius, Math.min(width, height) / 2));

/** A rounded rectangle from a rect and a requested radius, clamped. */
export const roundRect = (rect: Rect, radius: number): RoundRect => ({
  x: rect.x, y: rect.y, width: rect.width, height: rect.height,
  radius: clampRadius(radius, rect.width, rect.height),
});

/**
 * The same shape moved `distance` px outwards (negative: inwards). Offsetting a round corner
 * keeps its centre, so the radius grows or shrinks by the same distance, which keeps a stroke
 * band exactly as wide at the corners as along the sides. A square corner stays square, as a
 * CSS outline around `border-radius: 0` does. Inwards, the shape never turns inside out.
 */
export const offsetRoundRect = (shape: RoundRect, distance: number): RoundRect => {
  const width = Math.max(0, shape.width + 2 * distance);
  const height = Math.max(0, shape.height + 2 * distance);
  return {
    x: shape.x - distance,
    y: shape.y - distance,
    width,
    height,
    radius: shape.radius > 0 ? clampRadius(shape.radius + distance, width, height) : 0,
  };
};

/** A rect with each side moved inwards by its inset (negative insets grow it). */
export const insetRect = (rect: Rect, insets: Partial<Insets> | number): Rect => {
  const {top = 0, right = 0, bottom = 0, left = 0} = typeof insets === 'number'
    ? {top: insets, right: insets, bottom: insets, left: insets}
    : insets;
  return {x: rect.x + left, y: rect.y + top, width: rect.width - left - right, height: rect.height - top - bottom};
};

const format = (value: number) => {
  // Three decimals are far below a pixel and keep the markup short and stable across platforms.
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** Formats a number for SVG path data: stable, short and never "-0". */
export const svgNumber = format;

/**
 * A closed SVG path of the rounded rectangle, drawn clockwise on screen. Built from arcs rather
 * than `<rect rx>` so the same path can be combined with others under `fill-rule="evenodd"`
 * (a frame's ring is its outer edge plus its window).
 */
export const roundRectPath = ({x, y, width, height, radius}: RoundRect): string => {
  if (width <= 0 || height <= 0) return '';
  const r = clampRadius(radius, width, height);
  const f = format;
  if (r === 0) return `M${f(x)} ${f(y)}H${f(x + width)}V${f(y + height)}H${f(x)}Z`;
  return [
    `M${f(x + r)} ${f(y)}`,
    `H${f(x + width - r)}`,
    `A${f(r)} ${f(r)} 0 0 1 ${f(x + width)} ${f(y + r)}`,
    `V${f(y + height - r)}`,
    `A${f(r)} ${f(r)} 0 0 1 ${f(x + width - r)} ${f(y + height)}`,
    `H${f(x + r)}`,
    `A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + height - r)}`,
    `V${f(y + r)}`,
    `A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}`,
    'Z',
  ].join('');
};

/**
 * Whether the rounded rect is a circle: square, with corners that meet. A box 'circle' lays out
 * this way, and so does a square with a radius of half its side; the finish (the rim light) and
 * the decorations treat both alike.
 */
export const isCircle = (shape: RoundRect) =>
  shape.width > 0 && Math.abs(shape.width - shape.height) < 1e-9
  && clampRadius(shape.radius, shape.width, shape.height) >= shape.width / 2 - 1e-9;

/**
 * A closed SVG path of a band along a circle: between radii `outer - width` and `outer` around
 * (cx, cy), `spread` radians to each side of the unit direction (nx, ny). Drawn clockwise along
 * the outer arc and back along the inner one, so it can clip as well as fill. A spread of π or
 * more is a whole ring.
 */
export const arcBandPath = ({cx, cy, outer, width, nx, ny, spread}: {
  cx: number; cy: number; outer: number; width: number; nx: number; ny: number; spread: number;
}): string => {
  const inner = Math.max(0, outer - width);
  if (!(outer > 0) || !(spread > 0)) return '';
  const f = format;
  const middle = Math.atan2(ny, nx);
  const half = Math.min(spread, Math.PI - 1e-6);
  const at = (radius: number, angle: number) => `${f(cx + radius * Math.cos(angle))} ${f(cy + radius * Math.sin(angle))}`;
  const large = 2 * half > Math.PI ? 1 : 0;
  const [a0, a1] = [middle - half, middle + half];
  const outerArc = `M${at(outer, a0)}A${f(outer)} ${f(outer)} 0 ${large} 1 ${at(outer, a1)}`;
  if (!(inner > 0)) return `${outerArc}L${f(cx)} ${f(cy)}Z`;
  return `${outerArc}L${at(inner, a1)}A${f(inner)} ${f(inner)} 0 ${large} 0 ${at(inner, a0)}Z`;
};

/** A closed SVG path of a plain rect. */
export const rectPath = (rect: Rect) => roundRectPath({...rect, radius: 0});

/**
 * Signed distance from a point to the rounded rectangle's edge: negative inside, positive
 * outside, in pixels. The tests use it to prove that nothing is drawn into a frame's hole.
 */
export const roundRectSdf = (shape: RoundRect, px: number, py: number): number => {
  const r = clampRadius(shape.radius, shape.width, shape.height);
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const qx = Math.abs(px - cx) - (shape.width / 2 - r);
  const qy = Math.abs(py - cy) - (shape.height / 2 - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
};

/**
 * The rect a payload (text, a camera) can use inside a rounded shape, after the insets. It is the
 * inset rect, pulled further in sideways where its corners would poke out through a round corner,
 * so text in a pill never touches the curve. Rounded inwards to whole pixels.
 */
export const fitContent = (shape: RoundRect, insets: Partial<Insets> = {}): Rect => {
  const {top = 0, right = 0, bottom = 0, left = 0} = insets;
  const r = clampRadius(shape.radius, shape.width, shape.height);
  // How far in the corner of the content must sit sideways, given how far down it already is.
  const sideways = (down: number) => (down >= r ? 0 : r - Math.sqrt(r * r - (r - down) ** 2));
  const across = Math.max(sideways(top), sideways(bottom));
  const x0 = Math.ceil(shape.x + Math.max(left, across) - 1e-9);
  const y0 = Math.ceil(shape.y + top - 1e-9);
  const x1 = Math.floor(shape.x + shape.width - Math.max(right, across) + 1e-9);
  const y1 = Math.floor(shape.y + shape.height - bottom + 1e-9);
  return {x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0)};
};

/**
 * An axis-aligned rect wholly inside the rounded rectangle: the shape pulled in by the part of
 * each corner the arc cuts off at 45°. Rounded inwards to whole pixels; equals the shape when
 * its corners are square. A frame reports its hole this way.
 */
export const inscribedRect = (shape: RoundRect): Rect => {
  const r = clampRadius(shape.radius, shape.width, shape.height);
  const cut = r * (1 - Math.SQRT1_2);
  const x0 = Math.ceil(shape.x + cut - 1e-9);
  const y0 = Math.ceil(shape.y + cut - 1e-9);
  const x1 = Math.floor(shape.x + shape.width - cut + 1e-9);
  const y1 = Math.floor(shape.y + shape.height - cut + 1e-9);
  return {x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0)};
};

/** Whether `inner` lies within `outer` (edges may touch). */
export const rectContains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
