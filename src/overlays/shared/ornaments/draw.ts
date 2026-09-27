import {createElement, type ReactNode} from 'react';
import {interpolateColors} from 'remotion';
import type {OrnamentRenderContext, OrnamentStyle} from './types';

/**
 * Small SVG helpers the sets share. Every def is the element's own, with an id under the layer's
 * id base (`${idBase}-${key}-<part>`), so two elements, two layers or two kinds never collide.
 * No filters and no blend modes: soft light is a radial gradient.
 */

/** The id of one of an element's defs. */
export const ornamentPartId = (context: Pick<OrnamentRenderContext, 'idBase'>, key: number, part: string) => `${context.idBase}-${key}-${part}`;

/** `url(#id)`. */
export const paint = (id: string) => `url(#${id})`;

/** The palette's roles, never undefined: cool [0], light [1] (falls back to [0]), warm [2] (falls back to [0]). */
export const ornamentPalette = (style: Pick<OrnamentStyle, 'ornamentColors'>) => {
  const colors = style.ornamentColors;
  const cool = colors[0] ?? '#CFC6E4';
  return {cool, light: colors[1] ?? cool, warm: colors[2] ?? cool};
};

/** `a` mixed towards `b` by t ∈ [0, 1]. */
export const mixColor = (a: string, b: string, t: number) => interpolateColors(Math.min(1, Math.max(0, t)), [0, 1], [a, b]);

/** The dark outline light line-work keeps (webs, rims): #120C1C at 0.2. */
export const DARK_OUTLINE = {color: '#120C1C', opacity: 0.2} as const;

/**
 * A soft light: a disc of `radius` around (x, y) in `color`, `opacity` at the centre fading to
 * nothing at the rim through a radial gradient (the element's light, whose radius counts in its
 * extent), optionally focused on (fx, fy). Null when there is nothing to draw.
 */
export const RadialLight = ({id, x, y, radius, color, opacity, falloff = 0.4, mid = 0.33, fx, fy}: {
  id: string; x: number; y: number; radius: number; color: string; opacity: number;
  /** Where the light has fallen to `mid`, as a share of the radius. */
  falloff?: number;
  /** The light's level at `falloff` (a third by default). */
  mid?: number;
  /** The gradient's focal point (the brightest spot), when not the centre. */
  fx?: number; fy?: number;
}): ReactNode => {
  if (!(radius > 0) || !(opacity > 0)) return null;
  return createElement('g', null,
    createElement('defs', null,
      createElement('radialGradient', {id, gradientUnits: 'userSpaceOnUse', cx: x, cy: y, r: radius, fx, fy},
        createElement('stop', {offset: 0, stopColor: color, stopOpacity: 1}),
        createElement('stop', {offset: falloff, stopColor: color, stopOpacity: mid}),
        createElement('stop', {offset: 1, stopColor: color, stopOpacity: 0}))),
    createElement('circle', {cx: x, cy: y, r: radius, fill: paint(id), opacity}));
};

/** The unit vector from (x0, y0) towards (x1, y1); straight up when they coincide. */
export const unitToward = (x0: number, y0: number, x1: number, y1: number) => {
  const length = Math.hypot(x1 - x0, y1 - y0);
  return length > 1e-9 ? {x: (x1 - x0) / length, y: (y1 - y0) / length} : {x: 0, y: -1};
};
