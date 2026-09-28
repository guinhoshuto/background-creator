import {enclosingCircle} from '../place';
import {FLAME_TIP, flameSegments} from '../../../../backgrounds/halloween/hauntedInteriorGeometry';
import {cubicAt, ellipsePoints, FLICKER, type Cubic, type Point} from './haunted-interior-candle';

/**
 * The haunted-interior set's brass fixtures (girandoles and a wall sconce), in units of their full height
 * H (ornamentSize, px): from the lowest point of the mount to the tip of the tallest flame at its
 * tallest flicker. Origin: the middle of the mount's bottom, on the axis; y grows downwards, so a
 * fixture rises into negative y, from 0 to −1. `dir` mirrors x (−1: fixtures on the left, whose
 * sconce arm reaches out to the left); the moonlit highlight stays on the right like the hall's moon.
 *
 *   - 'candelabra-3' (the hero): a stem with a knop, one symmetric curved arm to two outer cups at
 *     ±0.26 and a centre cup at the stem's top, three candles (the centre one the tallest).
 *   - 'candelabra-2': the same parts with two candles at ±0.17 on a U-arm and a ball finial.
 *   - 'sconce': a symmetric two-light wall girandole (AD round 3: the single candle on an S-arm
 *     read as a hook): candelabra-2's knop, U-arm, cups and candles on a vertical oval wall plate
 *     (0.20 × 0.40, from 0.04 to 0.44) with a boss (Ø0.09) at 0.24, and a small drop under the stem.
 *
 * Mount: a rosette on the frame's line ('rosette') or a domed foot standing on a rail ('foot').
 * Everything here is plain arithmetic on constants; bounds are memoised.
 */

export type FixtureKind = 'candelabra-3' | 'candelabra-2' | 'sconce';
export type FixtureMount = 'rosette' | 'foot';
export const FIXTURE_KINDS: readonly FixtureKind[] = ['candelabra-3', 'candelabra-2', 'sconce'];

/** One candle on a fixture: the cup's axis x, its bobeche's centre y, the wax length and the flame's scale (H per flame-path unit). */
export type FixtureCup = {x: number; bobeche: number; wax: number; flame: number};

/** The flame path's tallest reach above its origin, in path units, at the tallest flicker. */
const FLAME_TALL = FLAME_TIP * (FLICKER.scaleMean + FLICKER.scaleSwing);
/** The centre flame's scale: its tip at the tallest flicker is exactly the fixture's top (−1). */
const FLAME_CENTRE = (1 - 0.775) / FLAME_TALL;
/** The outer flames are 0.22/0.24 of the centre one. */
const FLAME_OUTER = (0.22 / 0.24) * FLAME_CENTRE;

/** Part sizes shared by the fixtures, in H. */
export const PART = {
  /** Stem half-width, and the arms' stroke width. */
  stem: 0.03, arm: 0.05,
  /** Bobeche (drip pan) radii. */
  bobecheRx: 0.075, bobecheRy: 0.02,
  /** The cup under a bobeche: half-widths at its top and bottom, and its height. */
  cupTop: 0.05, cupBottom: 0.03, cupHeight: 0.05,
  /** Wax half-width (0.075 wide), and the gap between the bobeche's centre and the wax's foot. */
  wax: 0.0375, waxFoot: 0.01,
  /** The wick above the wax, and the flame origin's gap above the wax top. */
  wick: 0.014, flameGap: 0.005,
  /** Domed foot: half-width and height. */
  footHalf: 0.17, footHeight: 0.08,
} as const;

export type FixtureShape = {
  cups: readonly FixtureCup[];
  /** The stem, from the mount up to `top` (y, negative). */
  stemTop: number;
  /** A thinner neck above the stem (candelabra-2's finial) and its ball: y from, y to, ball centre, ball radius; null for none. */
  finial: {from: number; to: number; ball: number; radius: number} | null;
  /** Knops on the stem: centre y and radii. */
  knops: readonly {y: number; rx: number; ry: number}[];
  /** The arms' centrelines (right half and left half, or the sconce's single S). */
  arms: readonly (readonly Cubic[])[];
  /** The rosette's radius (its centre is (0, −radius)); with a backplate, the boss at the arm's root. */
  rosette: number;
  /** The arms' stroke width, when not PART.arm. */
  arm?: number;
  /** The bobeches' half-width, when not PART.bobecheRx. */
  bobecheRx?: number;
  /** A wall plate behind the stem (the sconce): an oval centred on the axis at `cy`, half-axes rx × ry, with the boss (the rosette) at `boss`. */
  backplate?: {cy: number; rx: number; ry: number; boss: Point};
  /** A drop under the stem (the sconce): centre y and radii; the stem then starts at its centre. */
  drop?: {y: number; rx: number; ry: number};
};

/** A fixture's arm stroke and bobeche half-width. */
export const armOf = (shape: FixtureShape) => shape.arm ?? PART.arm;
export const bobecheOf = (shape: FixtureShape) => shape.bobecheRx ?? PART.bobecheRx;

const P = (x: number, y: number): Point => ({x, y});
const mirror = (segments: readonly Cubic[]): Cubic[] => segments.map((segment) => segment.map((point) => P(-point.x, point.y)) as unknown as Cubic);

const CANDELABRO_3_ARM: Cubic[] = [
  [P(0.02, -0.4), P(0.08, -0.345), P(0.2, -0.33), P(0.24, -0.385)],
  [P(0.24, -0.385), P(0.255, -0.405), P(0.26, -0.44), P(0.26, -0.47)],
];
const CANDELABRO_2_ARM: Cubic[] = [
  [P(0, -0.375), P(0.1, -0.375), P(0.17, -0.39), P(0.17, -0.45)],
  [P(0.17, -0.45), P(0.17, -0.47), P(0.17, -0.5), P(0.17, -0.52)],
];

export const FIXTURES: Record<FixtureKind, FixtureShape> = {
  'candelabra-3': {
    cups: [
      {x: -0.26, bobeche: -0.52, wax: 0.165, flame: FLAME_OUTER},
      {x: 0, bobeche: -0.575, wax: 0.185, flame: FLAME_CENTRE},
      {x: 0.26, bobeche: -0.52, wax: 0.165, flame: FLAME_OUTER},
    ],
    stemTop: -0.575 + PART.cupHeight,
    finial: null,
    knops: [{y: -0.3, rx: 0.065, ry: 0.04}, {y: -0.4, rx: 0.045, ry: 0.025}],
    arms: [CANDELABRO_3_ARM, mirror(CANDELABRO_3_ARM)],
    rosette: 0.08,
  },
  'candelabra-2': {
    cups: [
      {x: -0.17, bobeche: -0.57, wax: 0.19, flame: FLAME_CENTRE},
      {x: 0.17, bobeche: -0.57, wax: 0.19, flame: FLAME_CENTRE},
    ],
    stemTop: -0.375,
    finial: {from: -0.375, to: -0.46, ball: -0.485, radius: 0.03},
    knops: [{y: -0.24, rx: 0.065, ry: 0.04}],
    arms: [CANDELABRO_2_ARM, mirror(CANDELABRO_2_ARM)],
    rosette: 0.08,
  },
  // candelabra-2 on a wall plate (AD round 3): the same cups, arm and knop; no rosette, no finial.
  sconce: {
    cups: [
      {x: -0.17, bobeche: -0.57, wax: 0.19, flame: FLAME_CENTRE},
      {x: 0.17, bobeche: -0.57, wax: 0.19, flame: FLAME_CENTRE},
    ],
    stemTop: -0.375,
    finial: null,
    knops: [{y: -0.24, rx: 0.065, ry: 0.04}],
    arms: [CANDELABRO_2_ARM, mirror(CANDELABRO_2_ARM)],
    rosette: 0.045,
    backplate: {cy: -0.24, rx: 0.1, ry: 0.2, boss: {x: 0, y: -0.24}},
    drop: {y: -0.025, rx: 0.03, ry: 0.025},
  },
};

/** The wax top of a cup (its highest point), in H. */
export const waxTop = (cup: FixtureCup) => cup.bobeche - PART.waxFoot - cup.wax;
/** The flame's origin (its path's 0,0) on a cup. */
export const flameOriginOf = (cup: FixtureCup): Point => ({x: cup.x, y: waxTop(cup) - PART.flameGap});
/** A flame's height (base to tip) at a vertical flicker scale, in H. */
export const flameHeight = (cup: FixtureCup, scale: number = FLICKER.scaleMean) => cup.flame * (2 + FLAME_TIP * scale);

/** The domed foot's outline, in H (for the path and the bounds). */
export const FOOT: Cubic[] = [
  [P(-PART.footHalf, 0), P(-0.16, -0.045), P(-0.09, -0.075), P(-0.035, -0.08)],
  [P(0.035, -0.08), P(0.09, -0.075), P(0.16, -0.045), P(PART.footHalf, 0)],
];

/** The body's points in H (before mirroring): mount, stem, knops, arms (with their half-width), cups, bobeches, wax, wicks. */
const bodyPoints = (kind: FixtureKind, mount: FixtureMount): Point[] => {
  const shape = FIXTURES[kind];
  const points: Point[] = [];
  if (mount === 'foot') {
    for (const segment of FOOT) for (let step = 0; step <= 8; step++) points.push(cubicAt(segment, step / 8));
  } else if (shape.backplate) {
    const {boss} = shape.backplate;
    points.push(...ellipsePoints(0, shape.backplate.cy, shape.backplate.rx, shape.backplate.ry, 32), ...ellipsePoints(boss.x, boss.y, shape.rosette, shape.rosette, 12));
    if (shape.drop) points.push(...ellipsePoints(0, shape.drop.y, shape.drop.rx, shape.drop.ry, 12));
  } else {
    points.push(...ellipsePoints(0, -shape.rosette, shape.rosette, shape.rosette, 24));
  }
  if (shape.stemTop < 0) {
    points.push(P(-PART.stem, 0), P(PART.stem, 0), P(-PART.stem, shape.stemTop), P(PART.stem, shape.stemTop));
  }
  if (shape.finial) {
    points.push(P(-0.02, shape.finial.to), P(0.02, shape.finial.to), ...ellipsePoints(0, shape.finial.ball, shape.finial.radius, shape.finial.radius, 12));
  }
  for (const knop of shape.knops) points.push(...ellipsePoints(0, knop.y, knop.rx, knop.ry, 16));
  const half = armOf(shape) / 2;
  for (const arm of shape.arms) {
    for (const segment of arm) {
      for (let step = 0; step <= 12; step++) {
        const point = cubicAt(segment, step / 12);
        points.push(...ellipsePoints(point.x, point.y, half, half, 8));
      }
    }
  }
  for (const cup of shape.cups) {
    points.push(
      P(cup.x - PART.cupTop, cup.bobeche), P(cup.x + PART.cupTop, cup.bobeche),
      P(cup.x - PART.cupBottom, cup.bobeche + PART.cupHeight), P(cup.x + PART.cupBottom, cup.bobeche + PART.cupHeight),
      ...ellipsePoints(cup.x, cup.bobeche, bobecheOf(shape), PART.bobecheRy, 16),
    );
    const top = waxTop(cup);
    // The wax, its drip (bulging 0.012 past the stick on its left) and the wick.
    points.push(P(cup.x - PART.wax - 0.012, top + 0.05), P(cup.x - PART.wax, top), P(cup.x + PART.wax, top), P(cup.x + 0.01, top - PART.wick));
  }
  return points;
};

/** The flame's outline sampled at a lean and a vertical scale, in H. */
const flamePoints = (cup: FixtureCup, lean: number, scale: number): Point[] => {
  const origin = flameOriginOf(cup);
  const points: Point[] = [];
  for (const segment of flameSegments(lean)) {
    for (let step = 0; step <= 24; step++) {
      const point = cubicAt(segment, step / 24);
      points.push({x: origin.x + cup.flame * point.x, y: origin.y + cup.flame * scale * point.y});
    }
  }
  return points;
};

/** The flame's lean range (path units at the tip) and its vertical scale range, the lightning's dip included. */
export const LEAN_MAX = FLICKER.leanSlow + FLICKER.leanFast;
/** How much a strike shortens the flames (vertical scale × (1 − DIP·flash)). */
export const STRIKE_DIP = 0.1;
const SCALE_RANGE = [(FLICKER.scaleMean - FLICKER.scaleSwing) * (1 - STRIKE_DIP), FLICKER.scaleMean + FLICKER.scaleSwing] as const;

/** Every point a cup's flame may reach while it flickers (the four corners of lean × scale bound it). */
const flameEnvelope = (cup: FixtureCup): Point[] =>
  SCALE_RANGE.flatMap((scale) => [-LEAN_MAX, LEAN_MAX].flatMap((lean) => flamePoints(cup, lean, scale)));

/** The outlines' reach past the drawn geometry, px (1 px strokes; the arms' dark outline is 1 px wider on each side). */
export const FIXTURE_MARGIN = 1;

/**
 * A fixture's bounds in H (dir +1; mirror x for −1): the smallest circle holding the body and the
 * flickering flames (centre and radius), the body's and the flames' farthest points from that
 * centre, where the light's focus sits (the flames' middle), and each flame's halo (centre and
 * radius, inside the circle).
 */
export type FixtureBounds = {
  centre: Point; radius: number; body: number; flames: number; focus: Point;
  halos: readonly {x: number; y: number; radius: number}[];
};

const boundsCache = new Map<string, FixtureBounds>();

export const fixtureBounds = (kind: FixtureKind, mount: FixtureMount): FixtureBounds => {
  const key = `${kind}|${mount}`;
  const cached = boundsCache.get(key);
  if (cached) return cached;
  const shape = FIXTURES[kind];
  const body = bodyPoints(kind, mount);
  const flames = shape.cups.flatMap(flameEnvelope);
  const circle = enclosingCircle([...body, ...flames]);
  const centre = {x: circle.x, y: circle.y};
  const far = (points: readonly Point[]) => Math.max(...points.map((point) => Math.hypot(point.x - centre.x, point.y - centre.y)));
  // Each flame's halo: centred a third of the way up the flame, as large as 1.1 × its height allows
  // inside the circle (the margin is added in px when drawn).
  const halos = shape.cups.map((cup) => {
    const origin = flameOriginOf(cup);
    const height = flameHeight(cup);
    const at = {x: origin.x, y: origin.y - 0.3 * height};
    const room = circle.r - Math.hypot(at.x - centre.x, at.y - centre.y);
    return {x: at.x, y: at.y, radius: Math.max(0, Math.min(1.1 * height, room))};
  });
  const focus = {
    x: shape.cups.reduce((sum, cup) => sum + cup.x, 0) / shape.cups.length,
    y: shape.cups.reduce((sum, cup) => sum + flameOriginOf(cup).y - 0.3 * flameHeight(cup), 0) / shape.cups.length,
  };
  const bounds: FixtureBounds = {centre, radius: circle.r, body: far(body), flames: far(flames), focus, halos};
  boundsCache.set(key, bounds);
  return bounds;
};

/** The extent (px) a fixture of height H needs, and the height an extent holds. */
export const fixtureExtent = (kind: FixtureKind, mount: FixtureMount, height: number) => fixtureBounds(kind, mount).radius * height + FIXTURE_MARGIN;
export const fixtureHeight = (kind: FixtureKind, mount: FixtureMount, extent: number) => (extent - FIXTURE_MARGIN) / fixtureBounds(kind, mount).radius;

const pointsCache = new Map<string, {body: readonly Point[]; flames: readonly Point[]}>();
/** Everything a fixture draws, in H before mirroring (tests check these in place); memoised, never mutate. */
export const fixturePoints = (kind: FixtureKind, mount: FixtureMount): {body: readonly Point[]; flames: readonly Point[]} => {
  const key = `${kind}|${mount}`;
  const cached = pointsCache.get(key);
  if (cached) return cached;
  const points = {body: bodyPoints(kind, mount), flames: FIXTURES[kind].cups.flatMap(flameEnvelope)};
  pointsCache.set(key, points);
  return points;
};
