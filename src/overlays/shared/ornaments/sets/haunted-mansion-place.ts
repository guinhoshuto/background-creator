import {MANSION_LANTERN} from '../../../../backgrounds/HauntedMansionLoop';
import {clampRadius, roundRectSdf} from '../../geometry';
import {
  ceilHalf, cornerSlot, enclosingCircle, fitMotif, fitsAt, floorHalf, maxExtentAt, ORNAMENT_EDGE, pointOnSlot, roomAt, slideRange, slotsOffAccent, type OrnamentCorner,
} from '../place';
import type {OrnamentCornerId, OrnamentFrame, OrnamentPlacement} from '../types';
import {LANCET_CIRCLE, roseScaleFor} from './haunted-mansion-glass';

/**
 * Where the 'haunted-mansion' ornaments go (seed- and frame-free). Motifs of the HauntedMansionLoop
 * background, in its colours:
 *
 *   - lanterns (the hero): the background's lamp head (hook, roof cap, housing, amber glass). At
 *     the top corners the lamp's circle is centred on the corner's best spot (roomAt), so the lamp
 *     covers the rounded corner in front of the stroke, and it hangs by its hook from a
 *     shepherd's-hook bracket ('lantern' + 'arm'): 2.5 px iron rising from the top edge (a rect:
 *     0.3 of the lamp's height in from the corner; a circle or a pill: just clear of the lamp) and
 *     curling over to the hook. The bracket's rise and bend are the 'arm' placement; the bar's end
 *     through the hook lies inside the lamp's own circle and is drawn with the lamp. At a bottom
 *     corner (round blocks whose accent takes the top) the lamp hangs from a wall arm beside the
 *     outline ('lantern-wall' + 'arm'). Where no bracket fits (a Twitch panel, a full-screen frame)
 *     the lamp hangs straight in the corner pocket or the band ('lantern-hung').
 *   - on outlines ≥ ROSE_MIN_WIDTH wide, the dormer's rose window as a keystone centred on the top
 *     edge ('rose'), and lit lancet windows at a fixed LANCET_SPACING either side of it ('lancet').
 *   - wrought-iron spear fence runs: one placement per picket (so each fits its circle), standing
 *     along the bottom from BL and BR inwards, spear tips just over the outline's bottom edge; on
 *     a full-screen frame they stand low on the file's bottom edge; a panel without bleed below
 *     (a Twitch panel) has none. On outlines ≥ GATE_WIDTH wide a gate stands at the bottom centre.
 *   - on big borders (≥ SCONCE_WIDTH wide) wall sconces straddle the side edges ('sconce' + 'arm').
 *     Not on circles; on a pill only under its straight bottom edge.
 *
 * A full-screen frame ('screen') keeps its motifs off frame.hole (the holeShape), like every set:
 * they lie over the band and may reach into its inner glow margin (window minus holeShape, at most
 * `glow` px into the picture's edge), where the band's own glow already paints.
 *
 * Sizes (fixed px; never scaled with the box): `ornamentSize` is the lantern's height, hook to
 * base (the background's 86.5 units), limited by the room at its corner (and on label strips
 * under 120 px tall to 0.6 of the strip). The second lantern equals the first. The rose window's
 * extent is min(the top edge's room, 0.45 of the placed lantern); lancets are 14×26 px panes. The
 * fence is as tall as its room allows, up to FENCE_MAX (and 0.6 of ornamentSize), in two grades:
 * from FENCE_LARGE a picket every 20 px with 9 px spears, under it every 15 px with 7 px spears.
 *
 * Lights never eat the room the bodies need: each motif's body is sized first, and its warm light
 * then grows only up to lightCap(body reach) = body + max(4, a quarter of it), within the room.
 */

/** The lantern's outline in its own units (MANSION_LANTERN: origin at the housing's centre). */
export const LANTERN_UNITS = {
  /** Hook top (−50) less half its stroke. */
  top: -51,
  /** Base bottom (34) plus half the cap stroke. */
  bottom: 35.5,
  /** The roof cap's half-width (22) plus half its stroke. */
  half: 23.5,
  /** The bracket passes through the hook's crook at this height. */
  armY: -46,
  /** The hook's crook (where the bracket rests) sits this far right of the lantern's axis. */
  hookX: 4,
  /** The glass's centre. */
  glassX: 0,
  glassY: 2.5,
} as const;

/** Height in units, hook to base: ornamentSize px of lantern ↔ this many units. */
export const LANTERN_HEIGHT_UNITS = LANTERN_UNITS.bottom - LANTERN_UNITS.top;

/**
 * The lantern's silhouette hull in its units (roof cap, housing, base, hook), for the clearance
 * check against the outline and the enclosing circle.
 */
const LANTERN_HULL: readonly (readonly [number, number])[] = [
  [-4, -32], [-7, -45], [3, -51], [13, -48], [10, -39],
  [-22, -21], [-15, -30], [15, -30], [22, -21], [15, 27], [12, 28], [8, 34], [-8, 34], [-12, 28], [-15, 27],
];

/** The lit edge's offset (px) towards the moon (up and to the right, like the background's moon). */
export const LIT_SHIFT = 1;
/** Moon side for every lit edge: up and to the right, a whole px on each axis. */
export const MOON = {x: 1, y: -1} as const;
/** How far a lit copy reaches past its shape (the diagonal of MOON), in px. */
const LIT_REACH = Math.SQRT2;

/** Iron widths, in px (fixed, never scaled): the brackets (a big lamp's a little heavier, as its hook), and the fence's pickets and rails. */
export const ARM_WIDTH = 2.5;
export const bracketWidth = (scale: number) => Math.max(ARM_WIDTH, 2.4 * scale);
export const PICKET_WIDTH = 3;
export const RAIL_WIDTH = 3;
/** The curl at a bracket's tip, in px. */
export const ARM_CURL = 1.8;
/** The plate that fixes a shepherd's-hook bracket to the top edge: width × height in px. */
export const PLATE = {width: 6, height: 2} as const;
/** A shepherd's-hook bracket rises this far in from the corner (per px of lantern height) on a rect outline. */
export const STEM_INSET = 0.3;
/** Largest radius of the bracket's bend, in px. */
const BEND_MAX = 6;
/** How far each bracket piece's iron runs into the next (it hides the joint), in px. */
export const ARM_OVERLAP = 0.75;
/** Gap between a lantern and the outline or its bracket, in px. */
const LANTERN_GAP = 1.5;

/** Lantern height limits, in px: the hero's (the set refuses below it) and the second lantern's. */
export const LANTERN_MIN = 20;
export const SECOND_LANTERN_MIN = 20;
/** Label strips (under this height, px) keep one lantern, at most COMPACT_LANTERN of their height tall. */
const COMPACT_HEIGHT = 120;
export const COMPACT_LANTERN = 0.6;

/** The rose window: shown on outlines at least this wide (px), extent ≥ ROSE_MIN px, ≤ ROSE_PER_HERO of the lantern. */
export const ROSE_MIN_WIDTH = 560;
export const ROSE_MIN = 14;
export const ROSE_PER_HERO = 0.45;
/** Lancets: every LANCET_SPACING px either side of the rose, none within LANCET_CLEAR px of a lantern's circle. */
export const LANCET_SPACING = 320;
export const LANCET_CLEAR = 100;

/**
 * The fence: at most FENCE_MAX px tall (and FENCE_PER_SIZE of ornamentSize), never under FENCE_MIN
 * (under it the iron reads as a comb of ticks). From FENCE_LARGE px up it takes the large grade.
 */
export const FENCE_MAX = 30;
export const FENCE_PER_SIZE = 0.6;
export const FENCE_MIN = 16;
export const FENCE_LARGE = 26;
/** A run holds FENCE_SHARE of the outline's width, FENCE_MOST pickets at most, a post every FENCE_POST pickets. */
export const FENCE_SHARE = 0.22;
export const FENCE_MOST = 16;
export const FENCE_POST = 5;
/** A run needs this many pickets or it is dropped. */
const FENCE_LEAST = 3;
/** How far the spear tips rise over the outline's bottom edge, per px of fence height, and how far (px) a run may stand lower where the room allows. */
const FENCE_OVERLAP = 0.2;
export const FENCE_SHIFT = 4;

/** The lantern's scale (px per unit) for a height in px. */
export const lanternScale = (height: number) => height / LANTERN_HEIGHT_UNITS;

/** Smallest stroke widths of the lamp's parts, in px (so a small lamp keeps crisp iron). */
export const LANTERN_STROKE_FLOOR = {housing: 1, cap: 1.1, hook: 1.4} as const;

/** The lamp's stroke widths in its units at a scale: the background's, never under the px floors. */
export const lanternStrokes = (scale: number) => ({
  housing: Math.max(MANSION_LANTERN.strokes.housing, LANTERN_STROKE_FLOOR.housing / scale),
  cap: Math.max(MANSION_LANTERN.strokes.cap, LANTERN_STROKE_FLOOR.cap / scale),
  hook: Math.max(MANSION_LANTERN.strokes.hook, LANTERN_STROKE_FLOOR.hook / scale),
});

/** Half the widest stroke of the lamp, in px: its ink reaches this far past the hull's vertices. */
const lanternInk = (scale: number) => {
  const strokes = lanternStrokes(scale);
  return Math.max(strokes.housing, strokes.cap, strokes.hook) * scale / 2;
};

export {ceilHalf};

/**
 * How far a motif's warm light may reach from its centre: its body's reach plus max(4, a quarter
 * of it), to the half px. The body is sized against the room first; the light never takes room
 * from it.
 */
export const lightCap = (reach: number) => ceilHalf(reach + Math.max(4, 0.25 * reach));

/** A body of extent `body` at (x, y), its extent grown (0.5 px steps, while it fits) up to its light's cap. */
const growLight = (frame: OrnamentFrame, x: number, y: number, body: number, reach: number) => {
  if (frame.glow <= 0) return body;
  const cap = lightCap(reach);
  let grown = body;
  while (grown + 0.5 <= cap && fitsAt(frame, x, y, grown + 0.5, 'front')) grown += 0.5;
  return grown;
};

/** Whether the outline has round ends (a circle, a pill): its corners are arcs, with no plain side under them. */
const roundEnded = (frame: Pick<OrnamentFrame, 'outline' | 'circle'>) => {
  const {outline} = frame;
  return frame.circle || clampRadius(outline.radius, outline.width, outline.height) > 0.3 * Math.min(outline.width, outline.height);
};

/** The outline's x at height y on one side (+1 right, −1 left), following its round corners. */
const outlineX = (outline: OrnamentFrame['outline'], y: number, side: number) => {
  const r = clampRadius(outline.radius, outline.width, outline.height);
  const top = outline.y;
  const bottom = outline.y + outline.height;
  const clamped = Math.min(bottom, Math.max(top, y));
  const dy = clamped < top + r ? top + r - clamped : clamped > bottom - r ? clamped - (bottom - r) : 0;
  const inset = r - Math.sqrt(Math.max(0, r * r - dy * dy));
  return side > 0 ? outline.x + outline.width - inset : outline.x + inset;
};

/** The outline's top edge at x (following its round corners); null outside its width. */
const outlineTopY = (outline: OrnamentFrame['outline'], x: number) => {
  const r = clampRadius(outline.radius, outline.width, outline.height);
  if (x < outline.x || x > outline.x + outline.width) return null;
  const dx = x < outline.x + r ? outline.x + r - x : x > outline.x + outline.width - r ? x - (outline.x + outline.width - r) : 0;
  return outline.y + r - Math.sqrt(Math.max(0, r * r - dx * dx));
};

type Point = readonly [number, number];
type Circle = {cx: number; cy: number; reach: number};

/** Enclosing circle of a point cloud, centred on its bounding box. */
const enclose = (points: readonly Point[]): Circle => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  let reach = 0;
  for (const [x, y] of points) reach = Math.max(reach, Math.hypot(x - cx, y - cy));
  return {cx, cy, reach};
};

/** The smallest enclosing circle of a point cloud (Welzl's incremental construction, in input order: deterministic). */
const smallestCircle = (points: readonly Point[]): Circle => {
  const circle = enclosingCircle(points.map(([x, y]) => ({x, y})));
  return {cx: circle.x, cy: circle.y, reach: circle.r};
};

/** A point cloud with its lit copy (shifted towards the moon). */
const withLit = (points: readonly Point[]): Point[] => points.flatMap(([x, y]) => [[x, y], [x + MOON.x * LIT_SHIFT, y + MOON.y * LIT_SHIFT]] as Point[]);

/** A bracket's tip runs this far past the hook's crook: `perUnit` lantern units, never under `least` px. */
const ARM_TIP = {least: 2.5, perUnit: 8} as const;
const armTip = (scale: number) => Math.max(ARM_TIP.least, ARM_TIP.perUnit * scale);
/**
 * A wall arm's brace: its foot drops share·length + extra px down the wall (at most `most` of the
 * lantern's height) and it meets the arm at `at` of the arm's length.
 */
const BRACE = {share: 0.45, extra: 2, most: 0.3, at: 0.62} as const;
const braceDrop = (length: number, height: number) => Math.min(BRACE.share * length + BRACE.extra, BRACE.most * height);
/** The enclosing circle of a wall arm's key points (with their lit copy), each widened to a square of the iron's half-width plus 0.5 px. */
const armCircle = (points: readonly Point[]): Circle => {
  const edge = ARM_WIDTH / 2 + 0.5;
  return enclose(withLit(points).flatMap(([x, y]): Point[] => [[x - edge, y - edge], [x + edge, y + edge], [x - edge, y + edge], [x + edge, y - edge]]));
};

/** A lamp head: origin (its housing centre), scale, the enclosing circle of its hull and its glass. */
export type LanternMount = {
  /** +1: drawn as in the background (the bracket comes from the left); −1: mirrored. */
  side: number;
  ox: number;
  oy: number;
  scale: number;
  cx: number;
  cy: number;
  reach: number;
  gx: number;
  gy: number;
};

/** The lantern's hull points in canvas px (with the lit edge's shift), from its origin and scale. */
const hullPoints = (ox: number, oy: number, scale: number, side: number) =>
  withLit(LANTERN_HULL.map(([ux, uy]): Point => [ox + side * ux * scale, oy + uy * scale]));

/** A lamp head at origin (ox, oy): its hull's enclosing circle (grown by half its widest stroke) and its glass. */
export const lanternAt = (ox: number, oy: number, height: number, side: number): LanternMount => {
  const scale = lanternScale(height);
  const {cx, cy, reach} = enclose(hullPoints(ox, oy, scale, side));
  return {
    side, ox, oy, scale, cx, cy, reach: reach + lanternInk(scale),
    gx: ox + side * LANTERN_UNITS.glassX * scale, gy: oy + LANTERN_UNITS.glassY * scale,
  };
};

/** A lamp head whose enclosing circle is centred on (cx, cy) (the hull's box is symmetric enough to centre by its middle). */
export const lanternCentredAt = (cx: number, cy: number, height: number, side: number): LanternMount => {
  const probe = lanternAt(0, 0, height, side);
  const mount = lanternAt(cx - probe.cx, cy - probe.cy, height, side);
  return {...mount, cx, cy, reach: mount.reach + Math.hypot(mount.cx - cx, mount.cy - cy)};
};

/**
 * A shepherd's-hook bracket: a plate on the top edge at (sx, fy), a stem rising to the bar's
 * height `barY`, a bend of radius `bend` turning towards the lamp (side), and a level bar through
 * the hook's crook to its tip (tipX) with a downward curl. The 'arm' piece (plate, stem, bend and
 * the bar up to `split`, plus ARM_OVERLAP) fits its own circle (cx, cy, reach); the bar from
 * `split` on through the hook to the curl lies inside the lamp's circle and is drawn by the lamp
 * (`lampReach`: its farthest ink from the lamp's centre).
 */
export type Gooseneck = {
  side: number;
  /** The iron's width, in px. */
  width: number;
  sx: number;
  fy: number;
  barY: number;
  bend: number;
  split: number;
  tipX: number;
  cx: number;
  cy: number;
  reach: number;
  lampReach: number;
};

/** Points along the bracket's arm piece (plate, stem, bend, bar up to the split plus the overlap), with their lit copy. */
const armPiecePoints = (g: Pick<Gooseneck, 'side' | 'sx' | 'fy' | 'barY' | 'bend' | 'split' | 'width'>): Point[] => {
  const {side, sx, fy, barY, bend, split, width} = g;
  const plate = {width: PLATE.width + width - ARM_WIDTH, height: PLATE.height};
  const points: Point[] = [
    [sx - plate.width / 2, fy - plate.height / 2], [sx + plate.width / 2, fy - plate.height / 2],
    [sx - plate.width / 2, fy + plate.height / 2], [sx + plate.width / 2, fy + plate.height / 2],
  ];
  for (let k = 0; k <= 8; k++) points.push([sx, fy + (barY + bend - fy) * k / 8]);
  for (let k = 0; k <= 8; k++) {
    const angle = Math.PI / 2 * k / 8;
    points.push([sx + side * bend * (1 - Math.cos(angle)), barY + bend * (1 - Math.sin(angle))]);
  }
  const end = split + side * ARM_OVERLAP;
  for (let k = 0; k <= 8; k++) points.push([sx + side * bend + (end - (sx + side * bend)) * k / 8, barY]);
  return withLit(points);
};

/** Points along the lamp's piece of the bracket: the bar from the split to the tip and its curl, with their lit copy. */
const lampPiecePoints = (g: Pick<Gooseneck, 'side' | 'barY' | 'split' | 'tipX'>): Point[] => {
  const {side, barY, split, tipX} = g;
  const points: Point[] = [];
  for (let k = 0; k <= 8; k++) points.push([split + (tipX - split) * k / 8, barY]);
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    // Q (tip + side·curl, barY) → (tip + side·curl, barY + curl)
    const [x0, y0, x1, y1, x2, y2] = [tipX, barY, tipX + side * ARM_CURL, barY, tipX + side * ARM_CURL, barY + ARM_CURL];
    points.push([(1 - t) ** 2 * x0 + 2 * (1 - t) * t * x1 + t * t * x2, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * y1 + t * t * y2]);
  }
  return withLit(points);
};

/**
 * The shepherd's-hook bracket for a lamp whose circle (its centre, radius `extent`) is fixed; null
 * when the arm piece's circle does not fit, or the lamp's piece does not fit the lamp's circle.
 */
export const gooseneck = (frame: OrnamentFrame, lamp: LanternMount, height: number, extent: number): Gooseneck | null => {
  const {outline} = frame;
  const {side, scale} = lamp;
  const width = bracketWidth(scale);
  const crookX = lamp.ox + side * LANTERN_UNITS.hookX * scale;
  const barY = lamp.oy + LANTERN_UNITS.armY * scale;
  // The stem keeps LANTERN_GAP px off the lamp's widest part (the roof cap), its ink included.
  const clear = LANTERN_UNITS.half * scale + lanternInk(scale) + LANTERN_GAP + width / 2;
  let sx = lamp.ox - side * clear;
  if (!roundEnded(frame)) {
    const inset = (side > 0 ? outline.x + outline.width : outline.x) - side * STEM_INSET * height;
    sx = side > 0 ? Math.min(sx, inset) : Math.max(sx, inset);
  }
  const fy = outlineTopY(outline, sx);
  if (fy === null) return null;
  const rise = fy - barY;
  const run = side * (crookX - sx);
  if (rise < 4 || run < 2) return null;
  const bend = Math.min(BEND_MAX, 0.45 * run, 0.45 * rise);
  const tipX = crookX + side * armTip(scale);
  // The lamp's piece: as far towards the stem as the lamp's circle holds it (never into the bend).
  const margin = width / 2 + 0.05;
  const room = (extent - margin - LIT_REACH) ** 2 - (barY - lamp.cy) ** 2;
  if (room <= 0) return null;
  const bendEnd = sx + side * bend;
  let split = lamp.cx - side * Math.sqrt(room);
  if (side * (split - bendEnd) < 0) split = bendEnd;
  if (side * (crookX - split) < 0) return null;
  const lampPiece = lampPiecePoints({side, barY, split, tipX});
  let lampReach = 0;
  for (const [x, y] of lampPiece) lampReach = Math.max(lampReach, Math.hypot(x - lamp.cx, y - lamp.cy) + margin);
  if (lampReach > extent + 1e-9) return null;
  const circle = smallestCircle(armPiecePoints({side, sx, fy, barY, bend, split, width}));
  const reach = circle.reach + margin;
  if (!fitsAt(frame, circle.cx, circle.cy, ceilHalf(reach), 'front')) return null;
  return {side, width, sx, fy, barY, bend, split, tipX, cx: circle.cx, cy: circle.cy, reach, lampReach};
};

/**
 * A wall arm (a bottom corner of a round block, or where no shepherd's hook fits): from the wall
 * point (wx, wy) out along the wall's normal (nx, ny) to a knee (kx, ky), then along (ux, uy) to
 * the tip (tx, ty) (the hook rests on it at (hx, hy)); a brace from its foot on the wall (bx, by)
 * to (ax, ay) on the arm; and the enclosing circle of all of it. On a plain side the arm is
 * straight (knee = hook point, u = n); on a round wall (a circle, a pill) it is an L: diagonal out
 * of the wall, then level to the hook, so the lamp hangs clear of its bracket.
 */
export type ArmMount = {
  side: number;
  wx: number;
  wy: number;
  nx: number;
  ny: number;
  kx: number;
  ky: number;
  ux: number;
  uy: number;
  hx: number;
  hy: number;
  tx: number;
  ty: number;
  bx: number;
  by: number;
  ax: number;
  ay: number;
  cx: number;
  cy: number;
  reach: number;
};

/**
 * Where a wall arm meets the wall and the wall's outward normal: on a plain side just inside a
 * small corner (the arm level), on a round outline (a circle, a pill) the corner's 45° point.
 */
const wallPoint = (frame: OrnamentFrame, corner: OrnamentCorner) => {
  const {outline} = frame;
  const r = clampRadius(outline.radius, outline.width, outline.height);
  const side = corner.dx > 0 ? 1 : -1;
  if (roundEnded(frame)) return {x: corner.x, y: corner.y, nx: corner.dx, ny: corner.dy, side};
  const y = corner.dy < 0 ? outline.y + Math.max(6, 0.5 * r) : outline.y + outline.height - Math.max(6, 0.5 * r);
  return {x: outlineX(outline, y, side), y, nx: side, ny: 0, side};
};

/** Whether the lantern's hull keeps `gap` px off the outline (sampled along its edges). */
const clearOfOutline = (frame: OrnamentFrame, ox: number, oy: number, scale: number, side: number, gap: number) => {
  for (let index = 0; index < LANTERN_HULL.length; index++) {
    const [ax, ay] = LANTERN_HULL[index]!;
    const [bx, by] = LANTERN_HULL[(index + 1) % LANTERN_HULL.length]!;
    for (let step = 0; step < 4; step++) {
      const u = step / 4;
      const x = ox + side * (ax + (bx - ax) * u) * scale;
      const y = oy + (ay + (by - ay) * u) * scale;
      if (roundRectSdf(frame.outline, x, y) < gap) return false;
    }
  }
  return true;
};

/**
 * A lantern `height` px tall hung by its hook from a wall arm fixed to the outline at `corner`, as
 * short as holds the lantern LANTERN_GAP px off the outline; null when no arm up to three lantern
 * heights long does. Plain side: straight out of the wall, the brace's foot below it. Round wall:
 * an L (diagonal out of the wall to a knee level with the hook's crook, then level to the hook;
 * the knee the lamp's half-width plus its ink and LANTERN_GAP from its axis), the brace's foot on
 * the wall's tangent that points away from the lamp.
 */
export const armMount = (frame: OrnamentFrame, corner: OrnamentCorner, height: number): {lantern: LanternMount; arm: ArmMount} | null => {
  const scale = lanternScale(height);
  const wall = wallPoint(frame, corner);
  const {side, nx, ny} = wall;
  const hookX = LANTERN_UNITS.hookX * scale;
  const diagonal = ny !== 0;
  const level = diagonal ? hookX + LANTERN_UNITS.half * scale + lanternInk(scale) + LANTERN_GAP : 0;
  const least = diagonal ? 3 : Math.max(3, (LANTERN_UNITS.half * scale + LANTERN_GAP - hookX) - 4);
  for (let length = least; length <= least + 3 * height; length += 0.5) {
    const kx = wall.x + nx * length;
    const ky = wall.y + ny * length;
    const [ux, uy] = diagonal ? [side, 0] : [nx, ny];
    const hx = kx + ux * level;
    const hy = ky;
    const ox = hx - side * hookX;
    const oy = hy - LANTERN_UNITS.armY * scale;
    if (!clearOfOutline(frame, ox, oy, scale, side, LANTERN_GAP)) continue;
    const lantern = lanternAt(ox, oy, height, side);
    const tx = hx + ux * armTip(scale);
    const ty = hy + uy * armTip(scale);
    const drop = braceDrop(length, height);
    let [dx, dy] = nx >= 0 ? [-ny, nx] : [ny, -nx];
    if (diagonal) {
      const away = (sx: number, sy: number) => Math.hypot(wall.x + sx * drop - lantern.cx, wall.y + sy * drop - lantern.cy);
      if (away(-dx, -dy) > away(dx, dy)) [dx, dy] = [-dx, -dy];
    }
    let bx = wall.x + dx * drop;
    let by = wall.y + dy * drop;
    for (let pass = 0; pass < 3; pass++) {
      const distance = roundRectSdf(frame.outline, bx, by);
      bx -= nx * distance;
      by -= ny * distance;
    }
    const ax = wall.x + nx * BRACE.at * length;
    const ay = wall.y + ny * BRACE.at * length;
    const circle = armCircle([[wall.x, wall.y], [kx, ky], [tx, ty], [tx + ux * ARM_CURL, ty + uy * ARM_CURL + ARM_CURL], [bx, by], [hx, hy]]);
    return {lantern, arm: {side, wx: wall.x, wy: wall.y, nx, ny, kx, ky, ux, uy, hx, hy, tx, ty, bx, by, ax, ay, ...circle}};
  }
  return null;
};

/** A hung lantern's extent for a height (its hull's enclosing radius, the lit edge included). */
const hungExtent = (height: number) => ceilHalf(lanternAt(0, 0, height, 1).reach);

/** Label strips (under COMPACT_HEIGHT px tall): one lantern (TR) and one fence run (BL), the lantern ≤ 0.6 of the strip. */
const compact = (frame: OrnamentFrame) => frame.fit === 'panel' && !frame.circle && frame.outline.height < COMPACT_HEIGHT;

/**
 * One lantern at `corner`: the tallest height from the nominal down (0.5 px steps, not under
 * `min`) that holds. At a top corner (not on a full-screen frame) its circle is centred on the
 * corner's best spot and it hangs from a shepherd's-hook bracket ('lantern' + 'arm'); failing
 * that (and at a bottom corner) from a wall arm ('lantern-wall' + 'arm'); failing that it hangs
 * straight in the corner ('lantern-hung', no arm). `armed` false goes straight to the last (the
 * second lantern of a hung hero hangs too). Size = the lantern's height; the arm's, its length.
 */
const placeLantern = (
  frame: OrnamentFrame, corner: OrnamentCorner, nominal: number, min: number, hero: boolean, armed = true,
): OrnamentPlacement[] => {
  const least = hero ? Math.min(min, floorHalf(nominal)) : min;
  const room = roomAt(frame, corner, 'front');
  // An upper bound for the search: no lantern is taller than about twice the corner's best room.
  const top = Math.min(floorHalf(nominal), floorHalf(2.2 * room.extent + 4));
  const side = corner.dx > 0 ? 1 : -1;
  if (armed && frame.fit !== 'screen' && corner.dy < 0) {
    const {min: inmost} = slideRange(frame, 'front');
    for (let height = top; height >= least - 1e-9; height -= 0.5) {
      // A lamp smaller than the room slides from the best spot towards the corner (1 px steps)
      // until its bracket fits: a short stem rather than a long one.
      for (let t = room.t; t >= inmost - 1e-9; t -= 1) {
        const spot = pointOnSlot(corner, t);
        const lantern = lanternCentredAt(spot.x, spot.y, height, side);
        const body = ceilHalf(lantern.reach);
        if (body > room.extent || !fitsAt(frame, spot.x, spot.y, body, 'front')) break;
        const extent = growLight(frame, spot.x, spot.y, body, lantern.reach);
        const hook = gooseneck(frame, lantern, height, extent);
        if (!hook) continue;
        return [
          {motif: 'lantern', slot: corner.slot, layer: 'front', x: spot.x, y: spot.y, extent, size: height},
          {motif: 'arm', slot: corner.slot, layer: 'front', x: hook.cx, y: hook.cy, extent: ceilHalf(hook.reach), size: hook.fy - hook.barY},
        ];
      }
    }
  }
  for (let height = top; armed && height >= least - 1e-9; height -= 0.5) {
    const mount = armMount(frame, corner, height);
    if (!mount) continue;
    const {lantern, arm} = mount;
    const body = ceilHalf(lantern.reach);
    const armExtent = ceilHalf(arm.reach);
    if (fitsAt(frame, lantern.cx, lantern.cy, body, 'front') && fitsAt(frame, arm.cx, arm.cy, armExtent, 'front')) {
      return [
        {motif: 'lantern-wall', slot: corner.slot, layer: 'front', x: lantern.cx, y: lantern.cy,
          extent: growLight(frame, lantern.cx, lantern.cy, body, lantern.reach), size: height},
        {motif: 'arm', slot: corner.slot, layer: 'front', x: arm.cx, y: arm.cy, extent: armExtent, size: Math.hypot(arm.hx - arm.wx, arm.hy - arm.wy)},
      ];
    }
  }
  const ratio = nominal / hungExtent(nominal);
  const placed = fitMotif(frame, corner, {motif: 'lantern-hung', layer: 'front', nominal: hungExtent(nominal), min: hungExtent(min), hero, ratio});
  if (!placed) return [];
  // The tallest height (up to nominal) whose hull fits the extent found (the ratio is nearly constant; step to be exact).
  let height = Math.min(nominal, floorHalf(placed.extent * ratio));
  while (height > 0.5 && hungExtent(height) > placed.extent) height -= 0.5;
  while (height + 0.5 <= nominal + 1e-9 && hungExtent(height + 0.5) <= placed.extent) height += 0.5;
  if (!hero && height < min - 1e-9) return [];
  const lantern = lanternCentredAt(placed.x, placed.y, height, side);
  return [{...placed, extent: growLight(frame, placed.x, placed.y, placed.extent, lantern.reach), size: height}];
};

/**
 * A side sconce: a lamp whose circle is centred at (cx, cy) on a side edge (edge −1 left, +1
 * right), hung by its hook from a straight wall arm (the 'lantern-wall' drawing) coming from the
 * box's side (`side` = edge) or, failing that, from the file's side: the arm starts
 * LANTERN_GAP px clear of the lamp's roof cap and runs level through the hook's crook, with a
 * brace under it. Null when the arm's circle does not fit.
 */
export const sconceArm = (frame: OrnamentFrame, lantern: LanternMount, height: number): ArmMount | null => {
  const {side, scale} = lantern;
  const hookX = LANTERN_UNITS.hookX * scale;
  const hx = lantern.ox + side * hookX;
  const hy = lantern.oy + LANTERN_UNITS.armY * scale;
  const clear = LANTERN_UNITS.half * scale + lanternInk(scale) + LANTERN_GAP + ARM_WIDTH / 2;
  const wx = lantern.ox - side * clear;
  const wy = hy;
  const length = side * (hx - wx);
  const tx = hx + side * armTip(scale);
  const [bx, by] = [wx, wy + braceDrop(length, height)];
  const [ax, ay] = [wx + side * BRACE.at * length, wy];
  const circle = armCircle([[wx, wy], [hx, hy], [tx, hy], [tx + side * ARM_CURL, hy + ARM_CURL], [bx, by], [ax, ay]]);
  if (!fitsAt(frame, circle.cx, circle.cy, ceilHalf(circle.reach), 'front')) return null;
  return {side, wx, wy, nx: side, ny: 0, kx: hx, ky: hy, ux: side, uy: 0, hx, hy, tx, ty: hy, bx, by, ax, ay, ...circle};
};

/** A sconce's lamp and arm from its placement (slot 'left' or 'right', centre, height). */
const sconceMount = (frame: OrnamentFrame, placement: Pick<OrnamentPlacement, 'slot' | 'x' | 'y' | 'size'>) => {
  const edge = placement.slot === 'left' ? -1 : 1;
  for (const side of [edge, -edge]) {
    const lantern = lanternCentredAt(placement.x, placement.y, placement.size, side);
    const arm = sconceArm(frame, lantern, placement.size);
    if (arm) return {lantern, arm};
  }
  return null;
};

/**
 * Side sconces on big frames (a border ≥ SCONCE_WIDTH px wide, not round): lamps SCONCE_HEIGHT px
 * tall (never over the hero's height; on a full-screen frame as tall as the band's room allows),
 * none under SCONCE_MIN, straddling the outline's side at the spot with the most room, every
 * SCONCE_SPACING px along it from its middle and at least half that from its ends (and off the
 * other motifs' circles).
 */
export const SCONCE_HEIGHT = 44;
export const SCONCE_MIN = 28;
export const SCONCE_SPACING = 480;
export const SCONCE_WIDTH = 900;
const placeSconces = (frame: OrnamentFrame, heroHeight: number, taken: readonly OrnamentPlacement[]): OrnamentPlacement[] => {
  const {outline, paintLimit} = frame;
  if (frame.kind !== 'border' || frame.circle || outline.width < SCONCE_WIDTH - 1e-9) return [];
  const nominal = floorHalf(Math.min(SCONCE_HEIGHT, heroHeight));
  if (nominal < SCONCE_MIN - 1e-9) return [];
  const middle = outline.y + outline.height / 2;
  const ys: number[] = [];
  for (let k = -Math.floor(outline.height / SCONCE_SPACING); k * SCONCE_SPACING <= outline.height; k++) {
    const y = middle + k * SCONCE_SPACING;
    if (y - outline.y >= SCONCE_SPACING / 2 - 1e-9 && outline.y + outline.height - y >= SCONCE_SPACING / 2 - 1e-9) ys.push(y);
  }
  const placements: OrnamentPlacement[] = [];
  for (const edge of [-1, 1]) {
    const slot = edge < 0 ? 'left' : 'right';
    const side = edge < 0 ? outline.x : outline.x + outline.width;
    for (const y of ys) {
      // The spot with the most room on the level through y, from the file's edge to 60 px inside the outline.
      let best = {x: side, room: -Infinity};
      const [from, to] = edge < 0 ? [paintLimit.x, side + 60] : [side - 60, paintLimit.x + paintLimit.width];
      for (let x = from; x <= to + 1e-9; x += 0.5) {
        const room = maxExtentAt(frame, x, y, 'front');
        if (room > best.room + 1e-9) best = {x, room};
      }
      for (let height = nominal; height >= SCONCE_MIN - 1e-9; height -= 0.5) {
        const lantern = lanternCentredAt(best.x, y, height, edge);
        const body = ceilHalf(lantern.reach);
        if (body > best.room || !fitsAt(frame, best.x, y, body, 'front')) continue;
        const mount = sconceMount(frame, {slot, x: best.x, y, size: height});
        if (!mount) continue;
        const extent = growLight(frame, best.x, y, body, lantern.reach);
        const arm = ceilHalf(mount.arm.reach);
        const clash = [...taken, ...placements].some((other) => Math.hypot(other.x - best.x, other.y - y) < other.extent + extent
          || Math.hypot(other.x - mount.arm.cx, other.y - mount.arm.cy) < other.extent + arm);
        if (clash) break;
        placements.push(
          {motif: 'sconce', slot, layer: 'front', x: best.x, y, extent, size: height},
          {motif: 'arm', slot, layer: 'front', x: mount.arm.cx, y: mount.arm.cy, extent: arm, size: mount.arm.reach},
        );
        break;
      }
    }
  }
  return placements;
};

/**
 * The gate (bottom centre of outlines ≥ GATE_WIDTH px wide, standing on the fence's base line):
 * two leaves GATE_LEAF px wide, as tall as the fence at their outer edge, under an arched top
 * rising to GATE_PEAK px at the centre (lower where the room is short, never under the fence + 2),
 * between two GATE_POST px posts with the fence's cap and finial, as tall as the peak. Each leaf
 * has four 3 px bars (stiles and two inner bars); the rails run on the fence's lines. One
 * placement per strip (post, half a leaf, half a leaf, …), so each fits its own circle.
 */
export const GATE_WIDTH = 1000;
export const GATE_LEAF = 22;
export const GATE_PEAK = 36;
export const GATE_POST = 7;
/** The gate's strips, in px from its centre: [x0, x1, post]. */
export const GATE_STRIPS: readonly (readonly [number, number, number])[] = [
  [-GATE_LEAF - GATE_POST, -GATE_LEAF, 1], [-GATE_LEAF, -GATE_LEAF / 2, 0], [-GATE_LEAF / 2, 0, 0],
  [0, GATE_LEAF / 2, 0], [GATE_LEAF / 2, GATE_LEAF, 0], [GATE_LEAF, GATE_LEAF + GATE_POST, 1],
];
/** The bars of a leaf, [x0, x1] in px from the gate's centre (the left leaf; the right one mirrors it). */
export const GATE_BARS: readonly (readonly [number, number])[] = [[-22, -19], [-16, -13], [-9, -6], [-3, 0], [0, 3], [6, 9], [13, 16], [19, 22]];

/** The arch's centreline height over the base at dx px from the gate's centre (a parabola: `edge` at the leaves' outer edges, peak − 1.5 at the centre). */
export const gateArch = (edge: number, peak: number, dx: number) => edge - RAIL_WIDTH / 2 + (peak - edge) * (1 - (dx / GATE_LEAF) ** 2);

/** A gate strip's circle (its ink with the lit edges: +1 px right, 1 px up), from the gate's centre gx and base line. */
export const gateStripCircle = (gx: number, base: number, edge: number, peak: number, strip: readonly [number, number, number]): Circle => {
  const [x0, x1, post] = strip;
  const points: Point[] = [];
  if (post) {
    const m = fenceMeasures(peak);
    const cx = gx + (x0 + x1) / 2;
    for (const [px, py] of [[cx - m.cap / 2, base - peak - m.rise - LIT_SHIFT], [cx + m.cap / 2 + LIT_SHIFT, base - peak - m.rise - LIT_SHIFT],
      [cx - m.cap / 2, base], [cx + m.cap / 2 + LIT_SHIFT, base]] as Point[]) points.push([px, py]);
  } else {
    // The arch's stroke (half its width over the centreline, its butt ends a px wide of the strip) and its lit copy.
    for (let k = 0; k <= 8; k++) {
      const dx = x0 + (x1 - x0) * k / 8;
      points.push([gx + dx, base - gateArch(edge, peak, dx) - RAIL_WIDTH / 2 - LIT_SHIFT]);
    }
    points.push([gx + x0 - 1, base - gateArch(edge, peak, x0) - RAIL_WIDTH / 2 - LIT_SHIFT], [gx + x1 + 1 + LIT_SHIFT, base - gateArch(edge, peak, x1) - RAIL_WIDTH / 2 - LIT_SHIFT]);
    points.push([gx + x0 - 1, base], [gx + x1 + 1 + LIT_SHIFT, base]);
  }
  const circle = smallestCircle(points);
  return {...circle, reach: circle.reach + 0.05};
};

/** The gate's strips on the fence's base line; [] when it does not fit (peak lowered a whole px at a time down to the fence + 2). */
const placeGate = (frame: OrnamentFrame, fence: readonly OrnamentPlacement[]): OrnamentPlacement[] => {
  const {outline} = frame;
  const first = fence[0];
  if (!first || outline.width < GATE_WIDTH - 1e-9) return [];
  const edge = first.size;
  const measures = fenceMeasures(edge);
  const base = first.y - measures.centre + edge;
  const gx = Math.round(outline.x + outline.width / 2);
  for (let peak = GATE_PEAK; peak >= edge + 2 - 1e-9; peak -= 1) {
    const strips = GATE_STRIPS.map((strip) => {
      const circle = gateStripCircle(gx, base, edge, peak, strip);
      return {motif: 'gate', slot: 'bottom', layer: 'front', x: circle.cx, y: circle.cy, extent: ceilHalf(circle.reach), size: peak} as OrnamentPlacement;
    });
    const clear = strips.every((strip) => fitsAt(frame, strip.x, strip.y, strip.extent, 'front')
      && fence.every((picket) => Math.abs(picket.x - strip.x) >= picket.extent + strip.extent));
    if (clear) return strips;
  }
  return [];
};

/** The mounts of a lantern placement (recomputed from the frame; memoised per placement object). */
type Mounts = {lantern: LanternMount; arm: ArmMount | null; hook: Gooseneck | null};
const mounts = new WeakMap<OrnamentPlacement, Mounts>();
export const lanternMountOf = (frame: OrnamentFrame, placement: OrnamentPlacement): Mounts => {
  const cached = mounts.get(placement);
  if (cached) return cached;
  if (placement.motif === 'sconce') {
    const mount = sconceMount(frame, placement)!;
    const result = {...mount, hook: null};
    mounts.set(placement, result);
    return result;
  }
  const corner = cornerSlot(frame, placement.slot as OrnamentCornerId);
  const side = corner.dx > 0 ? 1 : -1;
  let result: Mounts;
  if (placement.motif === 'lantern-wall') {
    const mount = armMount(frame, corner, placement.size)!;
    result = {...mount, hook: null};
  } else {
    const lantern = lanternCentredAt(placement.x, placement.y, placement.size, side);
    result = {lantern, arm: null, hook: placement.motif === 'lantern' ? gooseneck(frame, lantern, placement.size, placement.extent) : null};
  }
  mounts.set(placement, result);
  return result;
};

/**
 * The fence's measures for a height H (px), in two grades (large from FENCE_LARGE up): pitch,
 * spear (an arrowhead with barbs and a collar), posts (square, with a cap plate and a ball finial
 * rising `rise` px over the spear tips), rails (under the collars, and low near the base, each with
 * whole-pixel edges when the tips are on a whole pixel). Lengths down from the spear tips' line.
 * A picket's circle is the smallest one holding the ink of any picket (a post with its finial, a
 * spear picket, half a pitch of both rails either side, and every lit edge), mirrored about its
 * axis so it is centred on it: `centre` px under the tips, radius `reach`.
 */
const fenceCache = new Map<number, ReturnType<typeof measureFence>>();
const measureFence = (height: number) => {
  const large = height >= FENCE_LARGE - 1e-9;
  const grade = large
    ? {pitch: 20, spearWidth: 9, barb: 11, notch: 9.5, collar: 2, collarWidth: 5, post: 7, cap: 11, finial: 3.5, rise: 4}
    : {pitch: 15, spearWidth: 7, barb: 8.5, notch: 7, collar: 1.5, collarWidth: 4, post: 5, cap: 9, finial: 3, rise: 3};
  const spearHeight = grade.barb + grade.collar;
  const half = RAIL_WIDTH / 2;
  const rails = [spearHeight + half, Math.floor(0.9 * height - half) + half] as const;
  const capTop = -grade.rise + 2 * grade.finial;
  const railEnd = grade.pitch / 2 + 0.5;
  // Boxes (x0, y0, x1, y1) of every part's ink with its lit edge (moon side: +x, and up).
  const boxes: [number, number, number, number][] = [
    [-grade.spearWidth / 2, -LIT_SHIFT, grade.spearWidth / 2 + LIT_SHIFT, grade.notch],
    [-grade.cap / 2, -grade.rise - LIT_SHIFT, grade.cap / 2 + LIT_SHIFT, capTop + 2],
    [-grade.post / 2, capTop + 2, grade.post / 2 + LIT_SHIFT, height],
    // A spear picket's shaft with its lit line (x + 2.5) down to the base.
    [-PICKET_WIDTH / 2, grade.notch, PICKET_WIDTH / 2 + LIT_SHIFT, height],
    [-railEnd, rails[0] - half - LIT_SHIFT, railEnd, rails[0] + half + LIT_SHIFT],
    [-railEnd, rails[1] - half - LIT_SHIFT, railEnd, rails[1] + half],
  ];
  const points: Point[] = boxes.flatMap(([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [-x0, y0], [-x1, y0], [-x0, y1], [-x1, y1]] as Point[]);
  const circle = smallestCircle(points);
  const reach = circle.reach + 0.05;
  return {...grade, spearHeight, rails, capTop, centre: circle.cy, reach, extent: ceilHalf(reach)};
};
export const fenceMeasures = (height: number) => {
  let measures = fenceCache.get(height);
  if (!measures) {
    measures = measureFence(height);
    fenceCache.set(height, measures);
  }
  return measures;
};

/**
 * How far in from the outline's side (px) its round bottom corner has come down to within
 * `overlap` px (how far the spear tips rise over the bottom edge) of the bottom edge: from there
 * on a standing picket's tip reaches the outline. 0 for a square corner; most of the radius on a pill.
 */
const fenceSettle = (frame: OrnamentFrame, overlap: number) => {
  const {outline} = frame;
  const r = clampRadius(outline.radius, outline.width, outline.height);
  return r > overlap ? r - Math.sqrt(r * r - (r - overlap) ** 2) : 0;
};

/**
 * The pickets of one run (outer end first): from `corner` inwards along the bottom, each validated
 * with fitsAt; the run stops at the first that does not fit and is dropped under FENCE_LEAST.
 * Standing: spear tips FENCE_OVERLAP·H over the outline's bottom edge, lowered up to FENCE_SHIFT px
 * (whole px) where the room allows, so the top rail clears the stroke's glow (the lowest that
 * holds as many pickets as the highest); the outer post just past the outline's side where the
 * corner is small; under a larger round corner (up to a pill's) from where the tips reach it
 * (fenceSettle). Failing that, from where the straight bottom edge starts, and on the floor (no
 * bleed below) as low as the picket's circle keeps ORNAMENT_EDGE off the paint limit's bottom.
 * `raised` false keeps to the runs that stand at the outline's bottom edge. Every run stops half a
 * pitch short of the outline's middle, so a BL and a BR run keep at least a pitch apart.
 * A placement's y is its circle's centre: `centre` px under the spear tips.
 */
const fenceRun = (frame: OrnamentFrame, corner: OrnamentCorner, height: number, count: number, raised: boolean): OrnamentPlacement[] => {
  const {outline, paintLimit} = frame;
  const {pitch, extent, centre} = fenceMeasures(height);
  const inward = corner.dx > 0 ? -1 : 1;
  const bottom = outline.y + outline.height;
  const standing = Math.round(bottom - FENCE_OVERLAP * height);
  const floor = Math.floor(paintLimit.y + paintLimit.height - ORNAMENT_EDGE - extent - centre);
  const r = clampRadius(outline.radius, outline.width, outline.height);
  const from = (inset: number) => (corner.dx > 0 ? outline.x + outline.width - inset : outline.x + inset);
  const runs: {tip: number; start: number}[] = [];
  for (let shift = FENCE_SHIFT; shift >= 0; shift--) {
    const settle = fenceSettle(frame, bottom - (standing + shift));
    runs.push({tip: standing + shift, start: from(settle <= pitch / 2 ? -pitch / 2 : settle)});
  }
  const straight = {tip: Math.min(standing, floor), start: from(r + pitch / 2)};
  const half = outline.width / 2;
  const pickets = (run: {tip: number; start: number}) => {
    const first = (corner.dx > 0 ? Math.floor(run.start) : Math.ceil(run.start)) + 0.5 * -inward;
    const inset = corner.dx > 0 ? outline.x + outline.width - first : first - outline.x;
    const most = Math.min(count, 1 + Math.floor((half - pitch / 2 - inset) / pitch + 1e-9));
    const placements: OrnamentPlacement[] = [];
    for (let index = 0; index < most; index++) {
      // Whole-pixel spear tips; picket axes on half pixels, so the 3 px iron is crisp.
      const x = first + inward * index * pitch;
      if (!fitsAt(frame, x, run.tip + centre, extent, 'front')) break;
      placements.push({motif: 'fence', slot: corner.slot, layer: 'front', x, y: run.tip + centre, extent, size: height});
    }
    return placements;
  };
  let best: OrnamentPlacement[] = [];
  for (const run of runs) {
    const placements = pickets(run);
    if (placements.length > best.length) best = placements;
  }
  if (best.length >= FENCE_LEAST) return best;
  if (!raised && straight.tip !== standing) return [];
  const low = pickets(straight);
  return low.length >= FENCE_LEAST ? low : [];
};

/** How many pickets a run holds: FENCE_SHARE of the outline's width, at most FENCE_MOST. */
const fenceCount = (frame: OrnamentFrame, height: number) =>
  Math.min(FENCE_MOST, 1 + Math.floor(FENCE_SHARE * frame.outline.width / fenceMeasures(height).pitch + 1e-9));

/** The fence runs (BL, then BR as long as BL): the tallest whole-px height (so every edge of the iron and its lit lines is on a whole pixel) whose BL run holds FENCE_LEAST pickets. */
const placeFence = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement[] => {
  // A panel with no bleed under it (a Twitch panel) keeps no fence: it would stand inside the
  // panel's padding over its fill, a comb of ticks rather than a railing along its edge.
  if (frame.fit === 'panel' && frame.paintLimit.y + frame.paintLimit.height - (frame.outline.y + frame.outline.height) < FENCE_MIN) return [];
  const bl = cornerSlot(frame, 'BL');
  const br = cornerSlot(frame, 'BR');
  // On a full-screen frame no taller than the band (+2 px). Standing on the floor, the pickets'
  // circles keep off frame.hole, so the spears rise at most into the band's inner glow margin.
  let fenceTop = Math.min(FENCE_MAX, FENCE_PER_SIZE * ornamentSize);
  if (frame.fit === 'screen' && frame.hole) {
    const band = frame.paintLimit.y + frame.paintLimit.height - (frame.hole.y + frame.hole.height) - frame.glow;
    fenceTop = Math.min(fenceTop, Math.max(0, band) + 2);
  }
  for (const raised of [false, true]) {
    for (let height = Math.floor(fenceTop + 1e-9); height >= FENCE_MIN - 1e-9; height -= 1) {
      const count = fenceCount(frame, height);
      const left = fenceRun(frame, bl, height, count, raised);
      if (left.length === 0) continue;
      const right = compact(frame) ? [] : fenceRun(frame, br, height, left.length, true);
      // Both runs as long as the shorter one, so the box stays symmetric.
      const pickets = right.length > 0 ? Math.min(left.length, right.length) : left.length;
      return [...left.slice(0, pickets), ...right.slice(0, pickets)];
    }
  }
  return [];
};

/**
 * The rose window, centred on the top edge (the spot nearest the outline's top line where its
 * extent fits), and the lancets along the same line every LANCET_SPACING px either side of it,
 * each validated with fitsAt and none within LANCET_CLEAR px of a lantern's circle.
 */
const placeTopLine = (frame: OrnamentFrame, heroHeight: number, lanterns: readonly OrnamentPlacement[]): OrnamentPlacement[] => {
  const {outline, paintLimit} = frame;
  if (outline.width < ROSE_MIN_WIDTH - 1e-9) return [];
  const cx = outline.x + outline.width / 2;
  // The best room on the vertical through the top edge's middle (from the file's top to a little inside).
  const lowest = outline.y + Math.min(60, outline.height / 4);
  let best = -Infinity;
  for (let y = paintLimit.y; y <= lowest; y += 0.5) best = Math.max(best, maxExtentAt(frame, cx, y, 'front'));
  const extent = floorHalf(Math.min(best, ROSE_PER_HERO * heroHeight));
  if (!(extent >= ROSE_MIN - 1e-9)) return [];
  const lancet = ceilHalf(LANCET_CIRCLE.reach);
  // The line: the fitting spot nearest the outline's top (the keystone straddles the frame's line
  // where it can), where the lancets fit too when the rose is the smaller.
  const lineAt = (need: number) => {
    for (let step = 0; step <= 2 * (lowest - paintLimit.y); step++) {
      for (const candidate of [outline.y - step / 2, outline.y + step / 2]) {
        if (candidate >= paintLimit.y && candidate <= lowest && fitsAt(frame, cx, candidate, need, 'front')) return candidate;
      }
    }
    return null;
  };
  const y = lineAt(Math.max(extent, lancet)) ?? lineAt(extent);
  if (y === null) return [];
  const placements: OrnamentPlacement[] = [{motif: 'rose', slot: 'top', layer: 'front', x: cx, y, extent, size: roseScaleFor(extent)}];
  const clear = (x: number) => lanterns.every((lamp) => Math.hypot(lamp.x - x, lamp.y - y) - lamp.extent - lancet >= LANCET_CLEAR - 1e-9);
  for (let k = 1; k * LANCET_SPACING < outline.width / 2; k++) {
    for (const sign of [-1, 1]) {
      const x = cx + sign * k * LANCET_SPACING;
      if (fitsAt(frame, x, y, lancet, 'front') && clear(x)) placements.push({motif: 'lancet', slot: 'top', layer: 'front', x, y, extent: lancet, size: 1});
    }
  }
  return placements;
};

/** The placements: hero lantern (+ its bracket), second lantern (+ bracket), the rose window and lancets, the side sconces (+ arms), then the BL and BR fence runs and the gate. */
export const placeHauntedMansion = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement[] => {
  const free = slotsOffAccent(frame);
  const order: OrnamentCornerId[] = ['TR', 'TL', 'BR', 'BL'];
  const slots = order.map((id) => free.find((corner) => corner.slot === id)).filter((corner): corner is OrnamentCorner => !!corner);
  const nominal = compact(frame) ? Math.min(ornamentSize, Math.round(2 * COMPACT_LANTERN * frame.outline.height) / 2) : ornamentSize;
  let heroParts: OrnamentPlacement[] = [];
  let rest = slots;
  for (const [index, corner] of slots.entries()) {
    heroParts = placeLantern(frame, corner, nominal, LANTERN_MIN, true);
    if (heroParts.length > 0) {
      rest = slots.slice(index + 1);
      break;
    }
  }
  const hero = heroParts[0];
  if (!hero) return [];
  const placements = [...heroParts];
  // The second lantern mirrors the hero across the box (TR ↔ TL, BR ↔ BL) where the slot is free.
  const mirror: Record<OrnamentCornerId, OrnamentCornerId> = {TR: 'TL', TL: 'TR', BR: 'BL', BL: 'BR'};
  const partner = rest.find((corner) => corner.slot === mirror[hero.slot as OrnamentCornerId]) ?? (frame.circle ? rest[0] : undefined);
  if (partner && !compact(frame)) {
    // As tall as the hero, and hung like it when the hero hangs (no arm), so the pair matches.
    placements.push(...placeLantern(frame, partner, hero.size, SECOND_LANTERN_MIN, false, hero.motif !== 'lantern-hung'));
  }
  const lanterns = placements.filter((placement) => placement.motif.startsWith('lantern'));
  placements.push(...placeTopLine(frame, hero.size, lanterns));
  placements.push(...placeSconces(frame, hero.size, placements));
  if (!frame.circle) {
    const fence = placeFence(frame, ornamentSize);
    placements.push(...fence, ...placeGate(frame, fence));
  }
  return placements;
};
