import {FLAME_TIP, flameCorePathOf, flamePathOf, flameSegments} from '../../../../backgrounds/halloween/hauntedInteriorGeometry';
import {svgNumber} from '../../geometry';
import {enclosingCircle} from '../place';
/**
 * The haunted-interior set's candle, in its own units (u = 1): a brass chamberstick dish, a flared socket,
 * a wax stick with a drip and a molten top, the wick, and the background's own flame
 * (HauntedInteriorLoop's Flame: flameSegments, scaled).
 * Origin: the middle of the dish's foot, on the surface the candle stands on; y grows downwards,
 * so the candle rises into negative y. `dir` mirrors the drip and the bracket (−1: left-hand
 * candles), never the moonlit rim, which stays on the right like the background's moon.
 *
 * Everything here is plain arithmetic on constants: the bounds of each candle kind are computed
 * once and memoised, so placement and the per-frame build stay cheap.
 */

export type CandleKind = 'tall' | 'medium' | 'short';
/** 'edge': standing on a surface (the top edge, a Twitch panel's sill, a screen frame's rail); 'bracket': on an arm from a ring. */
export type CandleMount = 'edge' | 'bracket';
export type Point = {x: number; y: number};

/**
 * Wax length per kind, in units: the tall hero, the medium single and the short partner. About half
 * of the hero's height is its flame (visual.md: a 16 px flame on 14 px of wax at ~33 px), so the
 * flame, the part that reads as a candle, stays identifiable at 50 % zoom.
 */
export const WAX_LENGTH: Record<CandleKind, number> = {tall: 10.8, medium: 8.3, short: 5.4};

/** The dish: its top face (an ellipse) and the foot it stands on. */
export const DISH = {rx: 7, ry: 1.7, top: -2, foot: 0} as const;
/** The flared socket (bobeche) the wax sits in. */
export const SOCKET = {bottom: -2.4, top: -3.9, bottomHalf: 2.4, topHalf: 3.4, rimRy: 0.7} as const;
/** The wax stick: half its width and where it starts. */
export const WAX = {half: 2.8, bottom: -3.7} as const;
/** The drip's length at full size, in units below the wax top (it shrinks to `share` of a shorter stick). */
export const DRIP = {length: 5.3, share: 0.8} as const;
/** The drip's vertical scale on a kind's stick: 1, or less so it stays on a short stick. */
export const dripScale = (kind: CandleKind) => Math.min(1, (DRIP.share * WAX_LENGTH[kind]) / DRIP.length);
/** The wick above the wax, and where the flame's own origin (its path's 0,0) sits above the wax top. */
export const WICK = {length: 1.6, flameGap: 0.9} as const;

/**
 * The background's flame path, in its own units (HauntedInteriorLoop's Flame): base at y 2, tip at
 * (lean, −FLAME_TIP). FLAME_SCALE converts it to candle units (the flame is 16.8 u tall at scale 1: 14.1 u at its mean
 * flicker, 15.4 u at its tallest, about 9.3 u wide, inside the 14 u dish).
 */
export const FLAME_SCALE = 0.56;
export const flamePath = (lean: number) => flamePathOf(lean, num);
export const flameCorePath = (lean: number) => flameCorePathOf(lean, num);
/**
 * Flicker ranges (the background's rhythms, Hz-scaled): vertical scale 0.9 ± 0.08 (11 harmonics at
 * 16 s), lean ±(2.4 + 0.9) path units at the tip (5 and 13), glow 0.7 ± 0.12 ± 0.06 (7 and 19).
 */
export const FLICKER = {scaleMean: 0.9, scaleSwing: 0.08, leanSlow: 2.4, leanFast: 0.9, glowMean: 0.7, glowSlow: 0.12, glowFast: 0.06} as const;
const SCALE_MAX = FLICKER.scaleMean + FLICKER.scaleSwing;
const SCALE_MIN = FLICKER.scaleMean - FLICKER.scaleSwing;
const LEAN_MAX = FLICKER.leanSlow + FLICKER.leanFast;
/**
 * Where the candle's light is centred, above the flame's origin, as a share of the flame's resting
 * height: low in the flame, where the background's flame gradient is brightest, so it also warms
 * the molten top of the wax.
 */
const LIGHT_RISE = 0.3;

/**
 * The bracket on a ring (round blocks and webcams): the arm leaves the ring at `root` (candle units
 * from the dish's foot, before mirroring) and rises into the dish from below. `angle` is where on
 * the ring: 45° (the upper diagonal) or 0° (the side, when a round block's accent takes the top).
 */
export const BRACKETS = {
  diagonal: {root: {x: -5.5, y: 7.5}, out: {x: Math.SQRT1_2, y: -Math.SQRT1_2}},
  side: {root: {x: -7, y: 5}, out: {x: 1, y: 0}},
} as const;
export type BracketId = keyof typeof BRACKETS;
/** The arm's width, its outline's extra half-width on each side, and the rosette where it meets the ring, in units. */
export const ARM = {width: 2.2, outline: 0.7, rosette: 2.3} as const;

/** SVG path numbers: the shared formatter (three decimals at most, never "-0"). */
export const num = svgNumber;

/** A cubic segment: start, two controls, end. */
export type Cubic = readonly [Point, Point, Point, Point];
/** A cubic's point at t. */
export const cubicAt = ([a, b, c, d]: Cubic, t: number): Point => {
  const m = 1 - t;
  return {
    x: m * m * m * a.x + 3 * m * m * t * b.x + 3 * m * t * t * c.x + t * t * t * d.x,
    y: m * m * m * a.y + 3 * m * m * t * b.y + 3 * m * t * t * c.y + t * t * t * d.y,
  };
};

/** The wax top (its highest point) of a kind, in units. */
export const waxTop = (kind: CandleKind) => WAX.bottom - WAX_LENGTH[kind];
/** The flame's origin (the path's 0,0) of a kind. */
export const flameOrigin = (kind: CandleKind): Point => ({x: 0, y: waxTop(kind) - WICK.flameGap});
/** The centre of the candle's light (and the flame element's point). */
export const lightCentre = (kind: CandleKind): Point => {
  const origin = flameOrigin(kind);
  return {x: 0, y: origin.y - LIGHT_RISE * FLAME_TIP * FLAME_SCALE * FLICKER.scaleMean};
};
/** A kind's full height: the dish's foot to the flame's tip at its tallest, in units (ornamentSize is this, in px, for 'tall'). */
export const candleHeight = (kind: CandleKind) => -(flameOrigin(kind).y - FLAME_TIP * FLAME_SCALE * SCALE_MAX);

/** The cubic Bezier of the flame's outline, sampled, at a given lean and vertical scale, in candle units. */
const flamePoints = (kind: CandleKind, lean: number, scale: number): Point[] => {
  const origin = flameOrigin(kind);
  const points: Point[] = [];
  for (const segment of flameSegments(lean)) {
    for (let step = 0; step <= 24; step++) {
      const {x, y} = cubicAt(segment, step / 24);
      points.push({x: origin.x + FLAME_SCALE * x, y: origin.y + FLAME_SCALE * scale * y});
    }
  }
  return points;
};

/**
 * Every point the flame may reach while it flickers: the outline's distance to a fixed point is
 * convex in (lean, scale), so the four corners of their ranges bound it.
 */
const flameEnvelope = (kind: CandleKind): Point[] => [
  ...flamePoints(kind, -LEAN_MAX, SCALE_MAX), ...flamePoints(kind, LEAN_MAX, SCALE_MAX),
  ...flamePoints(kind, -LEAN_MAX, SCALE_MIN), ...flamePoints(kind, LEAN_MAX, SCALE_MIN),
];

export const ellipsePoints = (cx: number, cy: number, rx: number, ry: number, count = 24): Point[] =>
  Array.from({length: count}, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    // Circumscribed polygon: every point of the true ellipse lies inside it.
    const grow = 1 / Math.cos(Math.PI / count);
    return {x: cx + rx * grow * Math.cos(angle), y: cy + ry * grow * Math.sin(angle)};
  });

/** The wax's outline points: the stick, its rounded shoulders and the drip, on the inner side (x < 0 before mirroring). */
const waxPoints = (kind: CandleKind): Point[] => {
  const top = waxTop(kind);
  const drip = dripScale(kind);
  return [
    {x: -WAX.half, y: WAX.bottom}, {x: WAX.half, y: WAX.bottom}, {x: -WAX.half, y: top}, {x: WAX.half, y: top},
    // The drip bulges 0.6 u past the stick on its side.
    {x: -WAX.half - 0.6, y: top + 3.6 * drip}, {x: -WAX.half - 0.6, y: top + 4.8 * drip},
  ];
};

const bracketGeometry = (bracket: BracketId) => {
  const {root, out} = BRACKETS[bracket];
  // Control points: out of the ring along its normal, then up into the dish from below.
  const c1 = {x: root.x + 3 * out.x, y: root.y + 3 * out.y};
  const c2 = {x: 0, y: 4.2};
  const end = {x: 0, y: 0.2};
  return {root, c1, c2, end};
};

/** The arm's centreline, sampled. */
const armPoints = (bracket: BracketId): Point[] => {
  const {root, c1, c2, end} = bracketGeometry(bracket);
  return Array.from({length: 17}, (_, step) => cubicAt([root, c1, c2, end], step / 16));
};

/** The bracket arm as an SVG path in candle units (before mirroring). */
export const armPath = (bracket: BracketId, map: (point: Point) => Point) => {
  const {root, c1, c2, end} = bracketGeometry(bracket);
  const [a, b, c, d] = [root, c1, c2, end].map(map) as [Point, Point, Point, Point];
  return `M${num(a.x)} ${num(a.y)}C${num(b.x)} ${num(b.y)} ${num(c.x)} ${num(c.y)} ${num(d.x)} ${num(d.y)}`;
};

/** The body's points (dish, socket, wax, and the bracket when there is one), before mirroring. */
const bodyPoints = (kind: CandleKind, bracket: BracketId | null): Point[] => {
  const points = [
    ...ellipsePoints(0, DISH.top, DISH.rx, DISH.ry),
    {x: -DISH.rx, y: DISH.foot}, {x: DISH.rx, y: DISH.foot},
    ...ellipsePoints(0, SOCKET.top, SOCKET.topHalf + 0.2, SOCKET.rimRy),
    ...waxPoints(kind),
    {x: 0.4, y: waxTop(kind) - WICK.length},
  ];
  if (bracket) {
    // The arm's half-width plus its outline's (the outline stroke is 0.7 u wider on each side).
    const half = ARM.width / 2 + ARM.outline;
    for (const point of armPoints(bracket)) points.push(...ellipsePoints(point.x, point.y, half, half, 8));
    const {root} = BRACKETS[bracket];
    points.push(...ellipsePoints(root.x, root.y, ARM.rosette, ARM.rosette, 12));
  }
  return points;
};


/**
 * A candle kind's bounds, in units, relative to the dish's foot, for `dir` +1 (mirror x for −1):
 *   - centre: the placement's centre (the smallest circle holding the body and the flickering flame);
 *   - radius: that circle's radius;
 *   - body: the farthest body point from the centre;
 *   - light: the flame element's point (the light's centre), its distance from the centre, and
 *     `flame`, the farthest the flickering flame reaches from it.
 */
export type CandleBounds = {centre: Point; radius: number; body: number; light: Point; lightOffset: number; flame: number};

const boundsCache = new Map<string, CandleBounds>();

export const candleBounds = (kind: CandleKind, bracket: BracketId | null): CandleBounds => {
  const key = `${kind}|${bracket ?? 'edge'}`;
  const cached = boundsCache.get(key);
  if (cached) return cached;
  const body = bodyPoints(kind, bracket);
  const flame = flameEnvelope(kind);
  const light = lightCentre(kind);
  const flameReach = Math.max(...flame.map((point) => Math.hypot(point.x - light.x, point.y - light.y)));
  // The centre holds the body's points and the flame's whole disc around the light's centre, so
  // both elements' conservative circles (point + reach) fit inside the placement.
  const circle = enclosingCircle([...body, ...ellipsePoints(light.x, light.y, flameReach, flameReach, 96)]);
  const centre = {x: circle.x, y: circle.y};
  const bounds: CandleBounds = {
    centre,
    radius: circle.r,
    body: Math.max(...body.map((point) => Math.hypot(point.x - centre.x, point.y - centre.y))),
    light,
    lightOffset: Math.hypot(light.x - centre.x, light.y - centre.y),
    flame: flameReach,
  };
  boundsCache.set(key, bounds);
  return bounds;
};

/** Every point the drawing may reach, in candle units before mirroring: the body's and the flickering flame's (tests check them in place). */
export const candlePoints = (kind: CandleKind, bracket: BracketId | null) => ({body: bodyPoints(kind, bracket), flame: flameEnvelope(kind)});
