/**
 * Shared frame geometry for VaporwaveLoop: the camera, the horizon, the content area a stream
 * keeps free and the small math helpers every layer uses. No React here, so the scene, the
 * artwork and the tests can all import it without a cycle.
 */
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const CENTER_X = 960;
export const HORIZON_Y = 744;
export const GROUND_SPAN = HEIGHT - HORIZON_Y;

/**
 * The 16:9 area (1100×620) a stream keeps for its webcam, game capture or title. Palms,
 * solids, sparkles and meteors never enter it; tests/vaporwave.test.ts measures their drawn
 * geometry against it at every sampled phase.
 */
export const CONTENT_BOX = {left: 410, top: 230, right: 1510, bottom: 850} as const;

/**
 * The sun: its radius, and where its centre sits. `sunPosition` 0.1 and 0.9 crop 60 px of the
 * disc at the frame edge on purpose (never a near-tangent to the edge) and keep it 70 px clear
 * of the content area. Near the middle the sun sinks until it sits half set on the horizon,
 * below the title band (getSunY), so a centred sun stays a vivid postcard sun instead of a
 * dimmed disc behind the text.
 */
export const SUN_RADIUS = 200;
export const SUN_Y = 598;
/** Near the middle the centre sinks right onto the horizon: a half-set sun. */
export const SUN_SINK = HORIZON_Y - SUN_Y;
const SUN_EDGE_SHIFT = 820;
export const getSunX = (sunPosition: number) => CENTER_X + ((sunPosition - 0.5) / 0.4) * SUN_EDGE_SHIFT;

/** The soft glow around a four-point sparkle, in units of its size. */
export const SPARKLE_GLOW = 2.2;

export type Point = readonly [number, number];

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** Hermite ramp from `from` to `to`; zero slope at both ends. */
export const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};
export const fract = (value: number) => value - Math.floor(value);

/** How far the sun's centre sinks towards the horizon (0 at the edges, 1 in the middle). */
export const getSunSink = (sunPosition: number) => 1 - smoothstep(0.15, 0.3, Math.abs(sunPosition - 0.5));
export const getSunY = (sunPosition: number) => SUN_Y + SUN_SINK * getSunSink(sunPosition);

export const pathOf = (points: readonly Point[], close = false) =>
  points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + (close ? ' Z' : '');

/**
 * The content plate: fully on over the inner rectangle, then a soft ramp to zero at the outer
 * one. Both are 16:9 rectangles derived from CONTENT_BOX, so the half-strength contour runs
 * close to the box edges and even the box corners stay above half strength: the corners of a
 * webcam or a game capture are never left uncovered. The corners are elliptical ramps.
 */
const PLATE_INSET = {x: 60, y: 34};
const PLATE_RAMP = 150;
export const PLATE = {
  inner: {
    left: CONTENT_BOX.left + PLATE_INSET.x, top: CONTENT_BOX.top + PLATE_INSET.y,
    right: CONTENT_BOX.right - PLATE_INSET.x, bottom: CONTENT_BOX.bottom - PLATE_INSET.y,
  },
  outer: {
    left: CONTENT_BOX.left + PLATE_INSET.x - PLATE_RAMP, top: CONTENT_BOX.top + PLATE_INSET.y - PLATE_RAMP,
    right: CONTENT_BOX.right - PLATE_INSET.x + PLATE_RAMP, bottom: CONTENT_BOX.bottom - PLATE_INSET.y + PLATE_RAMP,
  },
} as const;

/** How much of the plate covers a point: 1 inside, 0 outside, a smooth ramp in between. */
export const getPlateWeight = (x: number, y: number) => {
  const {outer, inner} = PLATE;
  const dx = x < inner.left ? (inner.left - x) / (inner.left - outer.left)
    : x > inner.right ? (x - inner.right) / (outer.right - inner.right) : 0;
  const dy = y < inner.top ? (inner.top - y) / (inner.top - outer.top)
    : y > inner.bottom ? (y - inner.bottom) / (outer.bottom - inner.bottom) : 0;
  return 1 - smoothstep(0, 1, Math.hypot(dx, dy));
};

/**
 * A darker version of a #RRGGBB colour, so the silhouettes keep the night's hue. The schema
 * only admits #RRGGBB for `backgroundColor`, but any other CSS colour comes back unchanged
 * instead of turning into `rgb(NaN, …)`.
 */
export const darken = (color: string, factor: number) => {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const channels = [1, 3, 5].map((start) =>
    Math.round(Number.parseInt(color.slice(start, start + 2), 16) * clamp01(factor)));
  return `rgb(${channels.join(', ')})`;
};
