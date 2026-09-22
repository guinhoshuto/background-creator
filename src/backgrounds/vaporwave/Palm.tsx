import type {VaporwaveElement} from '../VaporwaveLoop';
import {HEIGHT, HORIZON_Y, WIDTH, type Point} from './frame';

/**
 * Where the palms stand on each side, measured from the frame edge. The first frames the
 * edge close to the camera; the second grows from the same clump and leans out of the frame,
 * so the pair opens in a V instead of running a trunk along the edge; the third stands far out
 * on the floor, small, so its size agrees with the grid's perspective.
 */
export const PALM_SLOTS = [
  {edge: 128, base: HEIGHT + 40, height: 780, lean: 0.07, frond: 290},
  {edge: 100, base: HEIGHT + 40, height: 560, lean: -0.15, frond: 232},
  {edge: 300, base: HORIZON_Y + 46, height: 226, lean: 0.05, frond: 100},
] as const;

/**
 * Which slots `palmCount` keeps, in order: one palm per side is the V partner, the lightest
 * footprint over a game's corners; two add the tall palm near the camera; three add the small
 * one on the horizon.
 */
export const PALM_ORDER: readonly number[] = [1, 0, 2];

/**
 * Over gameplay the trunks dissolve between these heights: the game's HUD sits along the bottom
 * edge, and a trunk crossing it would cover the health or ammo counters.
 */
export const PALM_ALPHA_FADE = {from: 860, to: 950} as const;

/** Sway of a whole palm, in degrees, for its first and second harmonics. */
export const PALM_SWAY = {first: 2.2, second: 0.7} as const;
/** How far the seed may nudge a slot: base (px), height and frond (shares) and lean. */
export const PALM_JITTER = {edge: 10, height: 0.03, frond: 0.04, lean: 0.01} as const;

type Frond = {
  /** Heading at rest, in degrees from the direction that faces the middle of the frame. */
  angle: number;
  length: number;
  /** How far the tip hangs below the line it was heading along, as a share of the length. */
  droop: number;
  /** Longest leaflet, as a share of the length. */
  width: number;
  back: boolean;
  /** How much of the palm's sway this frond takes, and how late the gust reaches it. */
  amp: number;
  lag: number;
};

/**
 * The crown, drawn back to front. The long fronds arch out and hang over the frame edge; the
 * ones that face the middle are shorter and fall steeply, so the crown frames the content
 * area without ever reaching into it.
 */
const FRONDS: Frond[] = [
  {angle: 112, length: 0.8, droop: 0.3, width: 0.24, back: true, amp: 0.8, lag: 0.9},
  {angle: 58, length: 0.72, droop: 0.34, width: 0.24, back: true, amp: 0.8, lag: 2.1},
  {angle: 204, length: 0.86, droop: 0.5, width: 0.24, back: true, amp: 1, lag: 3},
  {angle: 172, length: 1, droop: 0.78, width: 0.26, back: false, amp: 1.1, lag: 0},
  {angle: 140, length: 0.94, droop: 0.56, width: 0.26, back: false, amp: 1, lag: 0.7},
  {angle: 84, length: 0.74, droop: 0.4, width: 0.24, back: false, amp: 0.7, lag: 1.5},
  {angle: 34, length: 0.8, droop: 0.62, width: 0.25, back: false, amp: 0.9, lag: 2.4},
  {angle: 2, length: 0.7, droop: 0.82, width: 0.24, back: false, amp: 1.1, lag: 3.3},
];

const LEAFLETS = 15;

const quad = (a: Point, b: Point, c: Point, t: number): Point => [
  (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0],
  (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1],
];
const quadTangent = (a: Point, b: Point, c: Point, t: number): Point => {
  const dx = 2 * (1 - t) * (b[0] - a[0]) + 2 * t * (c[0] - b[0]);
  const dy = 2 * (1 - t) * (b[1] - a[1]) + 2 * t * (c[1] - b[1]);
  const length = Math.hypot(dx, dy) || 1;
  return [dx / length, dy / length];
};

/** Every outline turns the same way, so overlapping fronds merge under the nonzero rule. */
const clockwise = (points: Point[]): Point[] => {
  let area = 0;
  points.forEach(([x, y], index) => {
    const [nx, ny] = points[(index + 1) % points.length]!;
    area += x * ny - nx * y;
  });
  return area < 0 ? [...points].reverse() : points;
};

/**
 * One frond as a filled blade: a rib that arches and then hangs. Its top edge follows the
 * rib with short leaflets; underneath, long leaflets swept towards the tip hang by their own
 * weight and meet in shallow notches. The silhouette reads as a feathery crescent with a
 * fringe, not a comb or a fishbone.
 */
const frondOutline = (crown: Point, heading: number, length: number, droop: number, width: number): Point[] => {
  const radians = (heading * Math.PI) / 180;
  const direction: Point = [Math.cos(radians), -Math.sin(radians)];
  const control: Point = [crown[0] + direction[0] * length * 0.55, crown[1] + direction[1] * length * 0.55 - length * 0.2];
  const tip: Point = [crown[0] + direction[0] * length * 0.86, crown[1] + direction[1] * length * 0.86 + length * droop];
  const leaflet = (t: number) => width * length * Math.sin(Math.PI * t ** 0.8) ** 0.6 * (1 - 0.4 * t);
  const side = (sign: number) => {
    const points: Point[] = [];
    for (let index = 0; index < LEAFLETS; index++) {
      for (const [share, isTip] of [[0, false], [0.55, true]] as const) {
        const t = 0.05 + (0.92 * (index + share)) / LEAFLETS;
        const [sx, sy] = quad(crown, control, tip, t);
        const [tx, ty] = quadTangent(crown, control, tip, t);
        let normal: Point = [-ty * sign, tx * sign];
        // The side whose normal points down carries the long, hanging fringe.
        const lower = normal[1] > 0 || (Math.abs(normal[1]) < 1e-6 && sign > 0);
        const size = leaflet(t) * (lower ? 1 : 0.5);
        if (!isTip) {
          points.push([sx + normal[0] * size * 0.42, sy + normal[1] * size * 0.42]);
          continue;
        }
        // A leaflet leaves the rib sideways, leans towards the tip and hangs.
        const gravity = lower ? 0.85 : 0.3;
        let dx = normal[0] * 0.55 + tx * 0.55;
        let dy = normal[1] * 0.55 + ty * 0.55 + gravity;
        const reach = Math.hypot(dx, dy) || 1;
        dx /= reach;
        dy /= reach;
        normal = [dx, dy];
        points.push([sx + normal[0] * size, sy + normal[1] * size]);
      }
    }
    return points;
  };
  return clockwise([crown, ...side(1), tip, ...side(-1).reverse()]);
};

export type PalmShape = {
  /** Fronds behind the trunk, drawn a little lighter so the crown has depth. */
  back: Point[][];
  trunk: Point[];
  front: Point[][];
  /** Growth rings across the trunk: start, bulge and end of each arc. */
  rings: [Point, Point, Point][];
  knot: Point[];
  coconuts: {x: number; y: number; r: number}[];
  crown: Point;
  /** Size relative to the tallest slot, for strokes that follow the palm. */
  scale: number;
};

/**
 * The drawn geometry of one palm at the sway the scene gives it, in frame pixels. The tests
 * measure these very points against the content area.
 */
export const getPalmShape = (palm: VaporwaveElement): PalmShape => {
  const side = palm.variant % 2;
  const inward = side === 0 ? 1 : -1;
  const height = palm.size;
  const scale = height / PALM_SLOTS[0].height;
  const base: Point = [palm.x, palm.y];
  const crown: Point = [palm.x + inward * palm.lean * height, palm.y - height];
  const bend: Point = [palm.x + inward * (palm.lean * 0.15 - 0.04) * height, palm.y - height * 0.55];

  const halfBase = 17 * scale ** 0.85;
  const halfTop = 8.5 * scale ** 0.85;
  const left: Point[] = [];
  const right: Point[] = [];
  const steps = 22;
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const [px, py] = quad(base, bend, crown, t);
    const [tx, ty] = quadTangent(base, bend, crown, t);
    const half = halfBase * (1 - t) + halfTop * t + halfBase * 0.6 * (1 - t) ** 8;
    left.push([px - ty * half, py + tx * half]);
    right.push([px + ty * half, py - tx * half]);
  }
  const rings: [Point, Point, Point][] = [];
  const ringCount = Math.max(6, Math.round(height / 30));
  for (let index = 1; index < ringCount; index++) {
    const t = 0.03 + (0.94 * index) / ringCount;
    const [px, py] = quad(base, bend, crown, t);
    const [tx, ty] = quadTangent(base, bend, crown, t);
    const half = (halfBase * (1 - t) + halfTop * t) * 0.9;
    // The tangent points up the trunk, so the bulge hangs towards the base.
    const sag = half * 0.4;
    rings.push([[px - ty * half, py + tx * half], [px - tx * sag, py - ty * sag], [px + ty * half, py - tx * half]]);
  }

  const sway = (frond: Frond) =>
    frond.amp * (palm.angle * Math.cos(frond.lag) + palm.tilt * Math.sin(frond.lag));
  const fronds = FRONDS.map((frond) => {
    // Mirrored for the right side: an angle of zero always faces the middle of the frame.
    const heading = (side === 0 ? frond.angle : 180 - frond.angle) + sway(frond);
    return {back: frond.back, outline: frondOutline(crown, heading, palm.length * frond.length, frond.droop, frond.width)};
  });

  const knot = Array.from({length: 14}, (_, index): Point => {
    const angle = (index / 14) * Math.PI * 2;
    return [crown[0] + Math.cos(angle) * 17 * scale, crown[1] + 2 * scale + Math.sin(angle) * 11 * scale];
  });
  const coconuts = [[-9, 13], [8, 15], [-1, 23]].map(([dx, dy]) => ({
    x: crown[0] + inward * dx! * scale, y: crown[1] + dy! * scale, r: 8 * scale,
  }));

  return {
    back: fronds.filter((frond) => frond.back).map((frond) => frond.outline),
    trunk: clockwise([...left, ...right.reverse()]),
    front: fronds.filter((frond) => !frond.back).map((frond) => frond.outline),
    rings, knot: clockwise(knot), coconuts, crown, scale,
  };
};

/** Every point that paints, coconuts included, for bounds checks. */
export const getPalmPoints = (shape: PalmShape): Point[][] => [
  ...shape.back, shape.trunk, ...shape.front, shape.knot,
  ...shape.coconuts.map(({x, y, r}) => [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]] as Point[]),
];

/** The rim light is the silhouette nudged this far towards the sun, scaled with the palm. */
const PALM_RIM_NUDGE = 1.5;
const rimOffset = (scale: number) => PALM_RIM_NUDGE * Math.max(0.6, scale);
/**
 * How far a palm's paint reaches beyond its outline: the rim at the largest seeded palm, plus
 * a pixel of antialiasing. The rings stay inside the trunk and there is no stroke around it.
 */
export const PALM_PAINT_MARGIN = rimOffset(1 + PALM_JITTER.height) + 1;

const outline = (points: readonly Point[]) =>
  `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
const circle = ({x, y, r}: {x: number; y: number; r: number}) =>
  `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(2 * r).toFixed(2)} 0` +
  `a${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(-2 * r).toFixed(2)} 0Z`;

/**
 * A dark ink silhouette. The rim light is the same silhouette nudged towards the sun and
 * painted in neon underneath: only the sliver on the sun side stays visible, and the side
 * away from the sun keeps a clean edge. Every frond is its own path: a drooping frond's
 * fringe can fold over itself, and inside one shared path that fold would cancel a
 * neighbour's winding and open a hole in the ink. `trunkPaint` replaces the trunk's ink, rim
 * and rings with paints that fade out (PALM_ALPHA_FADE) over gameplay; the crown never reaches
 * that low, so the knot shares the trunk's rim paint.
 */
export const Palm = ({shape, sunX, sunY, ink, backInk, rim, ringColor, glow, trunkPaint}: {
  shape: PalmShape; sunX: number; sunY: number; ink: string; backInk: string; rim: string; ringColor: string; glow: number;
  trunkPaint?: {ink: string; rim: string; ring: string};
}) => {
  const trunk = trunkPaint ?? {ink, rim, ring: ringColor};
  const toSun = [sunX - shape.crown[0], sunY - shape.crown[1]] as const;
  const distance = Math.hypot(...toSun) || 1;
  const nudge = rimOffset(shape.scale);
  const fronds = (list: Point[][], fill?: string) => list.map((points, index) => (
    <path key={index} d={outline(points)} fill={fill} />
  ));
  return (
    <g strokeLinejoin="round">
      {/* The trunk takes a clear rim; on the fronds it stays a whisper, so the leaflets never
          turn into a comb of neon hairs. One group per layer, so overlaps never add up. */}
      <g transform={`translate(${((toSun[0] / distance) * nudge).toFixed(2)} ${((toSun[1] / distance) * nudge).toFixed(2)})`} fill={rim}>
        <path d={outline(shape.trunk) + outline(shape.knot)} fill={trunk.rim} opacity={0.35 + 0.35 * glow} />
        <g opacity={0.16 + 0.16 * glow}>{fronds([...shape.back, ...shape.front])}</g>
      </g>
      {fronds(shape.back, backInk)}
      <path d={outline(shape.trunk)} fill={trunk.ink} />
      <path d={shape.rings.map(([a, b, c]) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${b[0].toFixed(1)} ${b[1].toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join('')}
        fill="none" stroke={trunk.ring} strokeOpacity="0.28" strokeWidth={Math.max(1.1, 2.2 * shape.scale)} strokeLinecap="round" />
      {fronds(shape.front, ink)}
      <path d={outline(shape.knot) + shape.coconuts.map(circle).join('')} fill={ink} />
    </g>
  );
};

/** The palm's x at the frame edge it frames, mirrored for the right side. */
export const palmBaseX = (side: number, edge: number) => (side === 0 ? edge : WIDTH - edge);
