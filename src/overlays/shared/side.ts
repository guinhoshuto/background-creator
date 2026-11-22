import type {z} from 'zod';
import {offsetRoundRect, type RoundRect} from './geometry';
import {growTop, minBleedFor} from './layout';

/**
 * The side of a piece with thickness (`depth`): a flat copy of its outer outline, moved down and
 * to the right by `depth` px and drawn whole behind the piece, closed by a line of its own. It is
 * what makes a chat, a block or a frame read as a cut-out sticker lying on the page. Fixed px,
 * frame- and seed-free; off (no element, no markup) at depth 0.
 *
 * The copy is a little larger than the outline (SIDE_GROW), so its fill never ends under the
 * antialiased edge of the piece, and its line is centred on that larger path: the side reaches
 * `sideOutset(depth)` px beyond the outline on the right and at the bottom. It is never clipped
 * to the edge of the piece (two antialiased edges on one path leave a thread of the side's colour
 * around the piece), which is why a translucent piece is refused: the side would show through it.
 */

/** How much larger than the outline the copy is, on every side, in px. */
export const SIDE_GROW = 1.5;
/** Width of the line that closes the side, centred on its path, in px. */
export const SIDE_LINE_WIDTH = 3;
/** How much larger than a frame's window the side's own hole is, in px: its edge stays under the band. */
export const SIDE_HOLE_GROW = 2;

/** The path of the side: the outline grown by SIDE_GROW and moved `depth` px down and to the right. */
export const sideShape = (outline: RoundRect, depth: number): RoundRect => {
  const grown = offsetRoundRect(outline, SIDE_GROW);
  return {
    ...grown,
    x: grown.x + depth,
    y: grown.y + depth,
  };
};

/** How far the side and its line reach beyond the outline, on the right and at the bottom, in px; 0 while it is off. */
export const sideOutset = (depth: number): number => (depth > 0 ? depth + SIDE_GROW + SIDE_LINE_WIDTH / 2 : 0);

/**
 * How far they reach beyond the outline on the top and on the left: a side shallower than its own
 * growth and half its line peeks out there too (never further than on the other two sides).
 */
export const sideBackOutset = (depth: number): number => (depth > 0 ? Math.max(0, SIDE_GROW + SIDE_LINE_WIDTH / 2 - depth) : 0);

/**
 * The hole of a frame's side: the window grown by SIDE_HOLE_GROW, so the side ends under the band
 * and never along the window's own edge, where it would show as a thread of its colour.
 */
export const sideHole = (window: RoundRect): RoundRect => offsetRoundRect(window, SIDE_HOLE_GROW);

/**
 * Whether the rounded rect `inner` lies wholly inside `outer`. Each is its core (the rect pulled in
 * by its radius) grown by a disc of that radius, and taking the same disc off two convex shapes
 * keeps one inside the other or not. So with the smaller radius taken off both: a rounder outer
 * holds the inner one when the four corners of the inner core lie within the difference of the
 * outer core, and a rounder inner fits when its core, grown by the difference, lies in the outer core.
 */
export const roundRectWithin = (inner: RoundRect, outer: RoundRect): boolean => {
  const core = (shape: RoundRect) => ({
    left: shape.x + shape.radius, top: shape.y + shape.radius,
    right: shape.x + shape.width - shape.radius, bottom: shape.y + shape.height - shape.radius,
  });
  const a = core(inner);
  const b = core(outer);
  const spare = outer.radius - inner.radius;
  if (spare < 0) {
    return a.left + spare >= b.left - 1e-9 && a.top + spare >= b.top - 1e-9
      && a.right - spare <= b.right + 1e-9 && a.bottom - spare <= b.bottom + 1e-9;
  }
  const corners = [[a.left, a.top], [a.right, a.top], [a.left, a.bottom], [a.right, a.bottom]] as const;
  return corners.every(([x, y]) => Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom)) <= spare + 1e-9);
};

/**
 * Whether a frame's side keeps its own hole inside it: the copy moves down and to the right while
 * the hole stays on the window, so a side deeper than the band lets the hole out of the copy's top
 * left, where the even-odd fill turns inside out and the line crosses the window. On a straight
 * side the band holds a depth up to its thickness + SIDE_GROW − SIDE_HOLE_GROW; a round corner
 * moves along the diagonal, √2 times further. Inside the copy, the hole keeps the line
 * SIDE_HOLE_GROW − SIDE_LINE_WIDTH / 2 px clear of the window, so the line needs nothing of its own.
 */
export const sideHoleFits = (outline: RoundRect, window: RoundRect, depth: number): boolean =>
  roundRectWithin(sideHole(window), sideShape(outline, depth));

/**
 * Refuses a frame's side that lets its own hole out (sideHoleFits), naming the thickness that holds
 * it and the deepest side that does, within the bleed too. `top` is how much taller the band's top
 * side is (a title bar), as in refineSideOutset: the outline is the window grown by the band, then raised.
 * Returns whether the side may stay.
 */
export const refineSideHole = (
  props: {depth: number; thickness: number; bleed: number}, context: z.RefinementCtx, window: RoundRect, top = 0,
): boolean => {
  if (!(props.depth > 0)) return true;
  const holds = (band: number, depth: number) => {
    const outline = offsetRoundRect(window, band);
    return sideHoleFits(top > 0 ? growTop(outline, top) : outline, window, depth);
  };
  if (holds(props.thickness, props.depth)) return true;
  const inBleed = (band: number, depth: number) => band + sideOutset(depth) <= props.bleed + 1e-9
    && band + top + sideBackOutset(depth) <= props.bleed + 1e-9;
  let deepest = Math.ceil(props.depth) - 1;
  while (deepest > 0 && !(holds(props.thickness, deepest) && inBleed(props.thickness, deepest))) deepest--;
  let needed = Math.floor(props.thickness) + 1;
  while (!holds(needed, props.depth)) needed++;
  context.addIssue({
    code: 'custom',
    path: ['depth'],
    message: `The side goes past the band into the window: use ${inBleed(needed, props.depth) ? `thickness ≥ ${needed}, or ` : ''}depth ≤ ${Math.max(0, deepest)}.`,
  });
  return false;
};

/** The side as one still element of the scene: its depth, its flat colour and the colour of its line. */
export type SideElement = {type: 'side'; depth: number; color: string; line: string};

/** One element while the side is on, none at depth 0; the line wears the first outline colour. */
export const buildSideScene = (style: {depth: number; depthColor: string; strokeColors: readonly string[]}): SideElement[] => {
  if (!(style.depth > 0)) return [];
  return [{type: 'side', depth: style.depth, color: style.depthColor, line: style.strokeColors[0]!}];
};

/**
 * Refuses a side under a translucent piece: it is drawn whole behind it, so it would show through.
 * Returns whether the side may stay.
 */
export const refineSideFill = (props: {depth: number; fillOpacity: number}, context: z.RefinementCtx): boolean => {
  if (!(props.depth > 0) || props.fillOpacity >= 1) return true;
  context.addIssue({
    code: 'custom',
    path: ['depth'],
    message: 'The side shows through a translucent fill: use fillOpacity 1, or depth 0.',
  });
  return false;
};

/**
 * Refuses a side the bleed cannot hold, naming the bleed that holds it and the deepest side that
 * fits. `band` is what lies between the box and the outline the side copies (0 for a panel, whose
 * outline is the box; the band of a frame), and `top` how much taller that outline's top side is
 * (a frame's title bar): only a side shallow enough to peek out above (sideBackOutset) adds to it.
 * Returns whether the side fits, so the caller keeps the glow's own message for the glow.
 */
export const refineSideOutset = (props: {depth: number; bleed: number}, context: z.RefinementCtx, band = 0, top = 0): boolean => {
  if (!(props.depth > 0)) return true;
  const fits = (reach: number) => reach <= props.bleed + 1e-9;
  const ahead = band + sideOutset(props.depth);
  const behind = band + top + sideBackOutset(props.depth);
  if (fits(ahead) && fits(behind)) return true;
  // The deepest side the right and the bottom hold; it is the way out only when it is shallower
  // than this one and fits above too. Otherwise the way out by depth is the flat piece.
  const most = Math.floor(props.bleed - band - SIDE_GROW - SIDE_LINE_WIDTH / 2 + 1e-9);
  const deepest = most > 0 && most < props.depth && fits(band + top + sideBackOutset(most)) ? most : 0;
  context.addIssue({
    code: 'custom',
    path: ['depth'],
    message: `The side goes past the margin: use bleed ≥ ${minBleedFor(Math.max(ahead, behind))}, or depth ≤ ${deepest}.`,
  });
  return false;
};
