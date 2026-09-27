import type {Rect} from '../shared/box';
import {offsetRoundRect, type RoundRect} from '../shared/geometry';
import {glowOverArea} from '../shared/legibility';

/**
 * The glow's opacity where it is brightest over the content, at its brightest pulse. The glow is
 * the stroke blurred with σ = glow / 3 and its alpha amplified by GLOW_GAIN × glowStrength, then cut below
 * GLOW_CUT (see GlowFilter). The stroke is the band between `inner` and `inner` grown by the
 * stroke width; near a corner of the content both of its sides (or the curve) add up, so the
 * shared 2D measure is used rather than the blur of one straight side.
 */
export const contentGlowOpacity = ({inner, content, strokeWidth, glow, glowStrength = 1}: {
  inner: RoundRect; content: Rect; strokeWidth: number; glow: number; glowStrength?: number;
}) => {
  if (!(glow > 0) || !(strokeWidth > 0) || content.width <= 0 || content.height <= 0) return 0;
  // Growing the inside back by the stroke gives the panel (or, when the corner radius is below the
  // stroke width, a square-cornered panel around it: a little more stroke, never less).
  return glowOverArea([{outer: offsetRoundRect(inner, strokeWidth), inner}], glow, content, glowStrength);
};
