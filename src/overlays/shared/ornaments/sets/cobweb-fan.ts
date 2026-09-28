import {svgNumber} from '../../geometry';
import {ceilHalf, enclosingCircle, fitsAt, floorHalf, scanAround, type OrnamentCorner} from '../place';
import type {OrnamentFrame, OrnamentLayerName} from '../types';

/**
 * The geometry of a cobweb web fan: an orb-web sector whose hub sits near a corner of the paint limit
 * (like the background's hubs, tied off in the frame's corners) and opens inwards over the corner of
 * the panel or the frame.
 *
 * A fan is not a circle: hung in a corner, the smallest circle around a 78° sector pokes out of the
 * file long before the fan itself does, so a single circle bound would shrink every fan to about
 * two thirds of what the corner holds. The foundation bounds every element by a circle (placement
 * `extent`), so a fan is placed as PIECES: a polar partition around the hub, found by splitting the
 * whole fan in two across its longer side (radially, or across its opening) wherever a cell's
 * circle does not fit, down to cells a few px wide (fitCells), so the pieces hug the corner and cost
 * the fan only a few px of radius. Each piece is bounded by the smallest circle around what the
 * fan can draw inside its cell. Every piece is a placement of its own and passes the same checks as
 * any motif (inside the file, clear of the window and, in front, of the text). The cells are
 * disjoint and cover the whole fan: the fan's first piece draws the web once, clipped to their
 * union, so nothing leaves the pieces' circles, and the other pieces draw nothing.
 *
 * Nothing here reads the seed or the frame: the envelope (FAN_REACH, FAN_MARGIN, fanJitter) holds
 * every seeded web of that radius and all of its motion.
 */

/** The fan's opening, in radians (the background's 1.33–1.46): its edge radials lie ~0.1 rad inside the corner's two edges. */
export const FAN_SPREAD = 1.37;
/** Radials and capture rings for a web radius: 7/6 at 58 px, 4/2 under 18 (never denser than ~8 px between rings). */
export const webThreadsFor = (radius: number) => ({
  spokes: radius < 18 ? 4 : Math.min(9, Math.max(5, Math.round(4 + radius / 20))),
  rings: radius < 18 ? 2 : Math.min(10, Math.max(3, Math.round(radius / 9))),
});
/**
 * How far past its edge radials a seeded web's radial may lie: buildWebGeometry jitters each
 * radial by ±spread/(spokes·5.2), plus a hundredth for the thread's bow.
 */
export const fanJitter = (radius: number) => FAN_SPREAD / (webThreadsFor(radius).spokes * 5.2) + 0.01;
/** The rim's radius per unit of the web's radius: the rings' ±2.5 % jitter, plus the breath's and the flex's slack. */
export const FAN_REACH = 1.03;
/**
 * What the fan draws past its silk, in px: the widest pass around a thread is the frame radials'
 * shadow (1.08 px away from the moon, 2.9 px wide: 2.53), then the dark outline (4.6 px wide:
 * 2.3); the turn adds at most FAN_SWAY. Measured over seeds, radii 10–250 and the breeze's range
 * (tests/ornaments-cobweb.test.ts): ≤ 2.93. Beads sit on inner knots and broken ends hang inside
 * a downward fan, so neither reaches further.
 */
export const FAN_MARGIN = 3;
/** The farthest the web's slow turn moves its rim, in px (the background turns ±0.3°, 3.3 px at 630). */
export const FAN_SWAY = 0.4;
/** The turn's amplitude in degrees for a web radius: ±0.3° at most, never more than FAN_SWAY px at the rim. */
export const fanTurn = (radius: number) => Math.min(0.3, FAN_SWAY / (FAN_REACH * radius) * 180 / Math.PI);
/** Added to every enclosing circle: the sampled arcs' sagitta and rounding. */
const CIRCLE_SLACK = 0.25;

export type Point = {x: number; y: number};
export type Circle = {x: number; y: number; r: number};

/**
 * One piece of a fan: its cell (distances `inner`–`outer` from the hub, angles `from`–`to`; the
 * inner disc has inner 0 and spans every angle) and the circle that bounds what the fan draws in it.
 */
export type FanCell = {inner: number; outer: number; from: number; to: number; circle: Circle};

/** A placed fan: hub, the angle of its bisector (pointing inwards), the web's radius and its cells. */
export type FanLayout = {hubX: number; hubY: number; bisector: number; radius: number; cells: FanCell[]};


/** Points along an arc of radius r around (cx, cy), from angle a0 to a1, both ends included. */
const arcPoints = (cx: number, cy: number, r: number, a0: number, a1: number, steps: number): Point[] =>
  Array.from({length: steps + 1}, (_, index) => {
    const angle = a0 + (a1 - a0) * index / steps;
    return {x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle)};
  });

// ── Cells ────────────────────────────────────────────────────────────────────────────────────────

/** Signed distance from a point (polar around the hub, angle from the bisector) to the fan's sector before the margin (negative inside). */
export const sectorDistance = (r: number, angle: number, half: number, reach: number) => {
  const a = Math.abs(angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI)));
  if (a <= half) return r > reach ? r - reach : -Math.min(reach - r, r * Math.sin(Math.min(Math.PI / 2, half - a)));
  const off = a - half;
  if (off >= Math.PI / 2) return r;
  const along = r * Math.cos(off);
  const across = r * Math.sin(off);
  return along <= reach ? across : Math.hypot(along - reach, across);
};

/** Points every ~0.4 px along a segment, both ends included. */
const segmentPoints = (a: Point, b: Point): Point[] => {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.4));
  return Array.from({length: steps + 1}, (_, index) => ({x: a.x + (b.x - a.x) * index / steps, y: a.y + (b.y - a.y) * index / steps}));
};
/** Points every ~0.4 px along an arc. */
const arcAround = (cx: number, cy: number, r: number, a0: number, a1: number) =>
  arcPoints(cx, cy, r, a0, a1, Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / 0.4)));

/** A cell in the hub's polar frame (angles relative to the bisector) and the circle around the envelope's part in it. */
type RelativeCell = Omit<FanCell, 'circle'> & {circle: Circle};
/** A node of a fan's cell tree: split lazily, in two across its longer side, while its circle does not fit. */
type CellNode = {cell: RelativeCell; depth: number; kids?: CellNode[]};

/** The deepest a cell is split (a cell of a 60 px fan is then a few px on a side), and the most pieces a fan is drawn in. */
const TREE = {depth: 9, leaves: 32, least: 3.5};

/** The envelope of a fan of this radius: its half opening, rim, the membership test and its outline sampled every 0.4 px. */
type Envelope = {half: number; rim: number; reach: number; inside: (point: Point) => boolean; outline: Point[]};

const envelopeOf = (radius: number): Envelope => {
  const half = FAN_SPREAD / 2 + fanJitter(radius);
  const rim = FAN_REACH * radius;
  const reach = rim + FAN_MARGIN;
  const polar = (r: number, angle: number): Point => ({x: r * Math.cos(angle), y: r * Math.sin(angle)});
  const outline: Point[] = [
    ...arcAround(0, 0, reach, -half, half),
    ...[-1, 1].flatMap((side) => {
      const edge = side * half;
      const normal = edge + side * Math.PI / 2;
      const start = polar(FAN_MARGIN, normal);
      const tip = polar(rim, edge);
      return [
        ...segmentPoints(start, {x: tip.x + start.x, y: tip.y + start.y}),
        ...arcAround(tip.x, tip.y, FAN_MARGIN, side > 0 ? edge : edge - Math.PI / 2, side > 0 ? edge + Math.PI / 2 : edge),
      ];
    }),
    ...arcAround(0, 0, FAN_MARGIN, half + Math.PI / 2, 2 * Math.PI - half - Math.PI / 2),
  ];
  return {half, rim, reach, outline, inside: ({x, y}) => sectorDistance(Math.hypot(x, y), Math.atan2(y, x), half, rim) <= FAN_MARGIN + 1e-6};
};

/**
 * The smallest circle around the envelope's part inside a cell: that part's outline is made of
 * the cell's own sides where they lie inside the envelope and the envelope's outline where it
 * lies inside the cell, both sampled every 0.4 px (CIRCLE_SLACK covers the sampling).
 */
const cellCircle = (envelope: Envelope, cell: Omit<FanCell, 'circle'>): Circle | null => {
  const {inner, outer, from, to} = cell;
  const whole = to - from >= 2 * Math.PI - 1e-9;
  const polar = (r: number, angle: number): Point => ({x: r * Math.cos(angle), y: r * Math.sin(angle)});
  const inCell = ({x, y}: Point) => {
    const r = Math.hypot(x, y);
    if (r < inner - 1e-9 || r > outer + 1e-9) return false;
    if (whole || r < 1e-9) return true;
    const angle = Math.atan2(y, x);
    return angle >= from - 1e-9 && angle <= to + 1e-9;
  };
  const sides: Point[] = [
    ...arcAround(0, 0, outer, from, to),
    ...(inner > 0 ? arcAround(0, 0, inner, from, to) : [{x: 0, y: 0}]),
    ...(whole ? [] : [...segmentPoints(polar(inner, from), polar(outer, from)), ...segmentPoints(polar(inner, to), polar(outer, to))]),
  ];
  const points = [...sides.filter(envelope.inside), ...envelope.outline.filter(inCell)];
  if (points.length === 0) return null;
  const circle = enclosingCircle(points);
  return {...circle, r: ceilHalf(circle.r + CIRCLE_SLACK)};
};

/** A fan's envelope and the root of its cell tree (one cell: the whole fan), memoised per radius. */
type FanTree = {envelope: Envelope; root: CellNode};
const TREES_LIMIT = 256;
const treeCache = new Map<number, FanTree>();

const treeOf = (radius: number): FanTree => {
  const cached = treeCache.get(radius);
  if (cached) return cached;
  const envelope = envelopeOf(radius);
  const cell = {inner: 0, outer: envelope.reach, from: -Math.PI, to: Math.PI};
  const tree = {envelope, root: {cell: {...cell, circle: cellCircle(envelope, cell)!}, depth: 0}};
  if (treeCache.size >= TREES_LIMIT) treeCache.delete(treeCache.keys().next().value!);
  treeCache.set(radius, tree);
  return tree;
};

/**
 * A cell's two halves, across its longer side: radially (inner and outer half) or across the
 * fan's opening (the part of its angles inside the fan cut in two; a side cell keeps what lies
 * past the edge radial, the hub's cell the whole turn). Empty halves (outside the envelope) drop.
 */
const kidsOf = (tree: FanTree, node: CellNode): CellNode[] => {
  if (node.kids) return node.kids;
  const {inner, outer, from, to} = node.cell;
  const {half} = tree.envelope;
  const core = [Math.max(from, -half), Math.min(to, half)] as const;
  const across = (core[1] - core[0]) * outer;
  const halves: Omit<FanCell, 'circle'>[] = outer - inner >= across
    ? [{inner, outer: (inner + outer) / 2, from, to}, {inner: (inner + outer) / 2, outer, from, to}]
    : [{inner, outer, from, to: (core[0] + core[1]) / 2}, {inner, outer, from: (core[0] + core[1]) / 2, to}];
  node.kids = halves.flatMap((cell) => {
    const circle = cellCircle(tree.envelope, cell);
    return circle ? [{cell: {...cell, circle}, depth: node.depth + 1}] : [];
  });
  return node.kids;
};

/** Whether a node can still be split (not too deep, both sides above TREE.least px). */
const splittable = (tree: FanTree, node: CellNode) => {
  const {inner, outer, from, to} = node.cell;
  const {half} = tree.envelope;
  const across = (Math.min(to, half) - Math.max(from, -half)) * outer;
  return node.depth < TREE.depth && Math.max(outer - inner, across) >= 2 * TREE.least;
};

/**
 * The fewest cells of the fan's tree that fit with the hub at (hx, hy) opening around
 * `bisector`: a cell whose circle does not fit is split, and so on down the tree; null when a
 * cell that cannot be split further still does not fit, or when it takes more than TREE.leaves.
 */
const fitCells = (
  frame: OrnamentFrame, tree: FanTree, hx: number, hy: number, bisector: number, layer: OrnamentLayerName,
): RelativeCell[] | null => {
  const [cos, sin] = [Math.cos(bisector), Math.sin(bisector)];
  const leaves: RelativeCell[] = [];
  const stack: CellNode[] = [tree.root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const {circle} = node.cell;
    if (fitsAt(frame, hx + circle.x * cos - circle.y * sin, hy + circle.x * sin + circle.y * cos, circle.r, layer)) {
      leaves.push(node.cell);
      if (leaves.length > TREE.leaves) return null;
      continue;
    }
    if (!splittable(tree, node)) return null;
    // Depth first, the second half on top: the leaves come out in polar order (inner before outer, first radial first).
    const kids = kidsOf(tree, node);
    for (let index = kids.length - 1; index >= 0; index--) stack.push(kids[index]!);
    if (leaves.length + stack.length > TREE.leaves) return null;
  }
  return leaves;
};

/** Relative cells moved to a hub and turned to a bisector. */
const placeCells = (cells: readonly RelativeCell[], hx: number, hy: number, bisector: number): FanCell[] => {
  const [cos, sin] = [Math.cos(bisector), Math.sin(bisector)];
  return cells.map((cell) => ({
    ...cell, from: cell.from + bisector, to: cell.to + bisector,
    circle: {x: hx + cell.circle.x * cos - cell.circle.y * sin, y: hy + cell.circle.x * sin + cell.circle.y * cos, r: cell.circle.r},
  }));
};

/** The clip path of a cell around the hub: a disc, a pie slice (the hub's band) or an annular sector. */
export const cellPath = (hx: number, hy: number, cell: Pick<FanCell, 'inner' | 'outer' | 'from' | 'to'>) => {
  const n = svgNumber;
  const {inner, outer, from, to} = cell;
  if (inner <= 0 && to - from >= 2 * Math.PI - 1e-9) {
    return `M${n(hx - outer)} ${n(hy)}A${n(outer)} ${n(outer)} 0 1 0 ${n(hx + outer)} ${n(hy)}A${n(outer)} ${n(outer)} 0 1 0 ${n(hx - outer)} ${n(hy)}Z`;
  }
  const large = to - from > Math.PI ? 1 : 0;
  const at = (r: number, angle: number) => `${n(hx + r * Math.cos(angle))} ${n(hy + r * Math.sin(angle))}`;
  if (inner <= 0) return `M${n(hx)} ${n(hy)}L${at(outer, from)}A${n(outer)} ${n(outer)} 0 ${large} 1 ${at(outer, to)}Z`;
  return `M${at(inner, from)}L${at(outer, from)}A${n(outer)} ${n(outer)} 0 ${large} 1 ${at(outer, to)}`
    + `L${at(inner, to)}A${n(inner)} ${n(inner)} 0 ${large} 0 ${at(inner, from)}Z`;
};

// ── Fitting a fan into a corner ─────────────────────────────────────────────────────────────────

/** The paint limit's corner on the slot's side, and the unit vector pointing inwards along its diagonal. */
export const limitCorner = (frame: OrnamentFrame, corner: OrnamentCorner) => {
  const limit = frame.paintLimit;
  const x = corner.dx > 0 ? limit.x + limit.width : limit.x;
  const y = corner.dy > 0 ? limit.y + limit.height : limit.y;
  return {x, y, ux: -Math.sign(corner.dx), uy: -Math.sign(corner.dy)};
};

/** The smallest hub inset from the paint limit's corner, per axis, in px, and the scan's step. */
/** `pocket`: however small the fan, the hub may go this far past the corner point (a Twitch panel's padding pocket). */
const HUB_INSET = {min: 3, step: 0.5, pocket: 12};
/** How far past the outline's corner point the hub may slide inwards, per px of the nominal radius. */
const HUB_PAST = 0.4;
/**
 * How far past the outline's corner point the rim reaches, per px of radius, where the corner
 * allows: the web drapes over the panel's corner (or tucks under the band) instead of floating in
 * the bleed. On a circle the hub slides in from the file's corner toward the ring.
 */
export const FAN_DRAPE = 0.3;

/**
 * The largest fan (web radius ≤ nominal, in 0.5 px steps) that fits at this corner on `layer`
 * with the hub somewhere on the corner's diagonal, drawn in the fewest cells of its tree; among
 * hubs that hold that radius, the one nearest where the rim drapes FAN_DRAPE·radius past the
 * outline's corner point, then the fewest cells. Null when not even `min` fits. Pure: no seed, no frame.
 */
export const fitFan = (
  frame: OrnamentFrame, corner: OrnamentCorner, layer: OrnamentLayerName, nominal: number, min: number,
): FanLayout | null => {
  const origin = limitCorner(frame, corner);
  const bisector = Math.atan2(origin.uy, origin.ux);
  // The outline's corner point, as a per-axis inset from the paint limit's corner (along the diagonal).
  const reachInset = Math.max(0, ((corner.x - origin.x) * origin.ux + (corner.y - origin.y) * origin.uy) / 2);
  // The hub may slide past the corner point by up to HUB_PAST of the nominal radius (a tight
  // pocket, as on a Twitch panel, holds the fan only there).
  const deepestFor = (radius: number) => Math.max(HUB_INSET.min, reachInset) + Math.max(HUB_INSET.pocket, HUB_PAST * radius * Math.SQRT1_2);
  /** The inset where a fan of this radius drapes as asked, clamped to the scan. */
  const preferred = (radius: number) => Math.min(deepestFor(radius), Math.max(HUB_INSET.min, reachInset - (1 - FAN_DRAPE) * radius * Math.SQRT1_2));
  const place = (radius: number): FanLayout | null => {
    const tree = treeOf(radius);
    const want = preferred(radius);
    const insets = scanAround(HUB_INSET.min, deepestFor(radius), want, HUB_INSET.step);
    let best: {cells: RelativeCell[]; inset: number} | null = null;
    for (const inset of insets) {
      // Farther from the drape than a fit already found: only fewer cells would win, and the drape comes first.
      if (best && Math.abs(inset - want) > Math.abs(best.inset - want) + 1e-9) break;
      const cells = fitCells(frame, tree, origin.x + origin.ux * inset, origin.y + origin.uy * inset, bisector, layer);
      if (cells && (!best || cells.length < best.cells.length)) best = {cells, inset};
    }
    if (!best) return null;
    const hx = origin.x + origin.ux * best.inset;
    const hy = origin.y + origin.uy * best.inset;
    return {hubX: hx, hubY: hy, bisector, radius, cells: placeCells(best.cells, hx, hy, bisector)};
  };
  const top = floorHalf(nominal);
  if (min > top) return null;
  const atTop = place(top);
  if (atTop) return atTop;
  let found = place(min);
  if (!found) return null;
  // Room shrinks as the fan grows: bisect on the 0.5 px grid.
  let lo = min;
  let hi = top;
  while (hi - lo > 0.5) {
    const mid = floorHalf((lo + hi) / 2);
    if (mid <= lo) break;
    const at = place(mid);
    if (at) {
      lo = mid;
      found = at;
    } else hi = mid;
  }
  return found;
};
