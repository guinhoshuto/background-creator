import type {Rect} from '../../src/overlays/shared/box';
import {roundRectSdf, type RoundRect} from '../../src/overlays/shared/geometry';
import type {GlowSource} from '../../src/overlays/shared/legibility';
import {GLOW_CUT, GLOW_GAIN} from '../../src/overlays/shared/render';

/**
 * The glow's alpha at a point by brute force: every painted pixel of the sources (quarter-pixel
 * grid over ±5σ) weighted by the 2D Gaussian, then GlowFilter's gain (times `strength`, the
 * glowStrength prop) and cut. Slow and obvious,
 * so the fast measure of the legibility checks has something independent to agree with.
 */
export const bruteGlowAt = (sources: readonly GlowSource[], glow: number, px: number, py: number, step = 0.25, strength = 1) => {
  const sigma = glow / 3;
  const reach = 5 * sigma;
  const inside = (shape: RoundRect, x: number, y: number) => roundRectSdf(shape, x, y) <= 0;
  let sum = 0;
  for (let x = px - reach + step / 2; x < px + reach; x += step) {
    for (let y = py - reach + step / 2; y < py + reach; y += step) {
      let paint = 0;
      for (const source of sources) {
        if (inside(source.outer, x, y) && !(source.inner && inside(source.inner, x, y))) paint += source.opacity ?? 1;
      }
      if (paint > 0) sum += paint * Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * sigma * sigma));
    }
  }
  const blurred = (sum * step * step) / (2 * Math.PI * sigma * sigma);
  return Math.min(1, Math.max(0, GLOW_GAIN * strength * blurred - GLOW_CUT));
};

/** The corners of a rect, where the glow over it peaks. */
export const cornersOf = (rect: Rect): [number, number][] => [
  [rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height],
];
