import type {z} from 'zod';
import type {Rect} from './box';
import {clampRadius, roundRectSdf, type RoundRect} from './geometry';
import {glowSigma} from './layout';
import {GLOW_CUT, GLOW_GAIN} from './render';

/**
 * Most opacity any decoration drawn above the fill may reach over a text area. The fill itself is
 * under the text by definition; the stroke, its glow and the kinds' ornaments are not, so they
 * either keep out of the text areas or stay this faint over them.
 */
export const MAX_CONTENT_OPACITY = 0.2;

/** Width of the rim light in px: it runs from the inside of the stroke this far in (see buildRimScene). */
export const RIM_WIDTH = 1;

/** Abramowitz & Stegun 7.1.26: |error| < 1.5e-7, far below one step of 8-bit alpha. */
export const erf = (x: number) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return Math.sign(x) * (1 - poly * Math.exp(-x * x));
};

/**
 * How close a rect comes to the inside edge of a shape, in px. The distance to the edge of a
 * convex shape is concave inside it, so over a rect it is smallest at one of the corners: in a
 * pill, that is where the text sits nearest the curve.
 */
export const contentClearance = (inner: RoundRect, content: Rect) => {
  const corners = [
    [content.x, content.y], [content.x + content.width, content.y],
    [content.x, content.y + content.height], [content.x + content.width, content.y + content.height],
  ] as const;
  return Math.max(0, Math.min(...corners.map(([x, y]) => -roundRectSdf(inner, x, y))));
};

/**
 * Something the glow filter blurs: the shape `outer`, minus `inner` when given (a stroke band is
 * the panel minus the inside of the stroke), painted at `opacity`. Sources must not overlap:
 * their blurs are summed.
 */
export type GlowSource = {outer: RoundRect; inner?: RoundRect; opacity?: number};

/** The horizontal extent of a rounded rect at height y, or null above and below it. */
const rowSpan = (shape: RoundRect, y: number): [number, number] | null => {
  if (y < shape.y || y > shape.y + shape.height) return null;
  const r = clampRadius(shape.radius, shape.width, shape.height);
  // How far into a corner's arc this row is, measured up from the arc's centre.
  const into = Math.max(shape.y + r - y, y - (shape.y + shape.height - r));
  const inset = into > 0 ? r - Math.sqrt(Math.max(0, r * r - into * into)) : 0;
  return [shape.x + inset, shape.x + shape.width - inset];
};

/**
 * The share of a unit-mass 2D Gaussian (σ, centred on the point) that falls inside the shape.
 * Across each row the Gaussian integrates exactly (erf); down the rows a midpoint rule with steps
 * of at most σ/4 and half a pixel, over ±6σ clipped to the shape, so the rows start and end on the
 * shape's own edges and no step straddles one.
 */
const blurredCover = (shape: RoundRect, px: number, py: number, sigma: number) => {
  const y0 = Math.max(shape.y, py - 6 * sigma);
  const y1 = Math.min(shape.y + shape.height, py + 6 * sigma);
  if (!(y1 > y0)) return 0;
  const steps = Math.max(8, Math.ceil((y1 - y0) / Math.min(0.5, sigma / 4)));
  const dy = (y1 - y0) / steps;
  const scale = sigma * Math.SQRT2;
  let sum = 0;
  for (let index = 0; index < steps; index++) {
    const y = y0 + (index + 0.5) * dy;
    const span = rowSpan(shape, y);
    if (!span) continue;
    const across = 0.5 * (erf((span[1] - px) / scale) - erf((span[0] - px) / scale));
    sum += Math.exp(-((y - py) ** 2) / (2 * sigma * sigma)) * across;
  }
  return (sum * dy) / (sigma * Math.sqrt(2 * Math.PI));
};

/**
 * The glow's alpha at one point: every source blurred with σ = glow / 3, then GlowFilter's gain
 * (GLOW_GAIN times the glowStrength) and cut.
 */
export const glowAlphaAt = (sources: readonly GlowSource[], glow: number, x: number, y: number, strength = 1) => {
  if (!(glow > 0)) return 0;
  const sigma = glowSigma(glow);
  const blurred = sources.reduce((total, source) => {
    const cover = blurredCover(source.outer, x, y, sigma) - (source.inner ? blurredCover(source.inner, x, y, sigma) : 0);
    return total + (source.opacity ?? 1) * Math.max(0, cover);
  }, 0);
  return Math.min(1, Math.max(0, GLOW_GAIN * strength * blurred - GLOW_CUT));
};

/**
 * The brightest the glow gets over a text area, at its brightest pulse. The glow falls away from
 * the painted edges, so it peaks on the area's border, nearest them: at a corner, where two sides
 * of a band (or the curve of a round corner) add up, which a one-sided estimate misses by about
 * half. The corners and a few points along each side are measured with the real 2D blur.
 * `strength` is the glowStrength prop: a stronger glow washes over the text more.
 */
export const glowOverArea = (sources: readonly GlowSource[], glow: number, area: Rect, strength = 1) => {
  if (!(glow > 0) || sources.length === 0 || area.width <= 0 || area.height <= 0) return 0;
  const stops = [0, 0.25, 0.5, 0.75, 1];
  let peak = 0;
  for (const t of stops) {
    for (const [x, y] of [
      [area.x + t * area.width, area.y], [area.x + t * area.width, area.y + area.height],
      [area.x, area.y + t * area.height], [area.x + area.width, area.y + t * area.height],
    ] as const) {
      peak = Math.max(peak, glowAlphaAt(sources, glow, x, y, strength));
    }
  }
  return peak;
};

/**
 * The rim light is drawn above the fill at up to full opacity, so brighter than
 * MAX_CONTENT_OPACITY it must keep off every text area: each area has to keep RIM_WIDTH px from
 * the inside of the stroke (touching the line's inner edge covers nothing). Each area comes with
 * its name and the way out for the message; an empty area is left to the kind's own refusals.
 */
export const refineRim = (
  rimLight: number, inner: RoundRect, areas: readonly [Rect | null, string, string][], context: z.RefinementCtx,
) => {
  if (!(rimLight > MAX_CONTENT_OPACITY)) return;
  for (const [area, name, fix] of areas) {
    if (!area || area.width < 1 || area.height < 1) continue;
    if (contentClearance(inner, area) >= RIM_WIDTH - 1e-9) continue;
    context.addIssue({
      code: 'custom',
      path: ['rimLight'],
      message: `The top rim light would touch the ${name} area: ${fix}, or use rimLight up to ${MAX_CONTENT_OPACITY}.`,
    });
  }
};
