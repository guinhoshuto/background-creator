import {createSeededRandom} from '../../loop';

/**
 * The frosted pine boughs in the corners, built once at module load. Nothing here depends on the
 * frame or on the user's seed: a fixed PRNG lays the needles out, so every render draws the same
 * boughs and the scene only rotates them about their roots.
 */

export type Point = readonly [number, number];
type Cubic = readonly [Point, Point, Point, Point];

/** A bough's spine in art coordinates: a cubic, with the needle length at its base and at its tip. */
export type Spine = {readonly points: Cubic; readonly base: number; readonly tip: number};

export type PineCone = {x: number; y: number; rotation: number; length: number; width: number};
export type PineHolly = {x: number; y: number};

export type PineArt = {
  stems: string;
  back: string;
  mid: string;
  front: string;
  frost: string;
  /** Every needle tip, in art coordinates. */
  tips: readonly Point[];
  cones: readonly PineCone[];
  holly: readonly PineHolly[];
  /** The outermost points of the drawing (needle tips, frost, cone and holly boxes), for the edge-band test. */
  extent: readonly Point[];
};

const spine = (points: Cubic, base: number, tip: number): Spine => ({points, base, tip});

export const UPPER_SPINES: readonly Spine[] = [
  spine([[-30, 10], [120, 40], [280, 30], [440, 58]], 34, 20),
  spine([[-30, -10], [90, 80], [200, 140], [318, 196]], 36, 22),
  spine([[-20, 20], [40, 130], [100, 220], [150, 300]], 32, 20),
  spine([[-30, 40], [10, 160], [20, 260], [30, 340]], 30, 18),
  spine([[40, -20], [120, 20], [190, 60], [236, 110]], 26, 18),
];

export const LOWER_SPINES: readonly Spine[] = [
  spine([[-40, 1090], [120, 1060], [300, 1070], [470, 1030]], 34, 20),
  spine([[-40, 1110], [60, 1020], [180, 960], [300, 900]], 34, 20),
  spine([[-30, 1100], [0, 1000], [20, 900], [40, 800]], 30, 18),
  spine([[60, 1100], [140, 1030], [200, 1000], [250, 990]], 26, 18),
];

/**
 * Shorter secondary spines in the wedges between the lower spines (about −19° and −54°, where the
 * main ones run at −7°, −32° and −77°). They lay only back and mid needles, so the lower corners
 * gain mass without more bright needles or frost.
 */
export const LOWER_FILLERS: readonly Spine[] = [
  spine([[-30, 1100], [100, 1050], [240, 1010], [370, 975]], 30, 18),
  spine([[-34, 1104], [30, 1010], [100, 920], [160, 840]], 30, 18),
];

const cubicPoint = ([p0, p1, p2, p3]: Cubic, t: number): [number, number] => {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const c = 3 * s * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
};

/** The unit tangent of a cubic at t. */
const cubicTangent = ([p0, p1, p2, p3]: Cubic, t: number): [number, number] => {
  const s = 1 - t;
  const a = 3 * s * s;
  const b = 6 * s * t;
  const c = 3 * t * t;
  const x = a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]) + c * (p3[0] - p2[0]);
  const y = a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]) + c * (p3[1] - p2[1]);
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
};

/** The point of a spine at the curve parameter u (0 at the root, 1 at the tip), in art coordinates. */
export const spinePoint = (bough: Spine, u: number): [number, number] => cubicPoint(bough.points, u);

const ARC_STEPS = 64;

/** Walks a cubic by arc length: a 64-step table maps a distance along the curve to its parameter. */
const arcWalker = (curve: Cubic) => {
  const lengths = [0];
  let previous = cubicPoint(curve, 0);
  for (let i = 1; i <= ARC_STEPS; i++) {
    const point = cubicPoint(curve, i / ARC_STEPS);
    lengths.push(lengths[i - 1]! + Math.hypot(point[0] - previous[0], point[1] - previous[1]));
    previous = point;
  }
  const total = lengths[ARC_STEPS]!;
  const parameterAt = (distance: number) => {
    const s = Math.min(total, Math.max(0, distance));
    let i = 0;
    while (i < ARC_STEPS - 1 && lengths[i + 1]! < s) i++;
    const span = lengths[i + 1]! - lengths[i]!;
    return (i + (span > 0 ? (s - lengths[i]!) / span : 0)) / ARC_STEPS;
  };
  return {total, parameterAt};
};

/** Path coordinates keep one decimal: plenty for needles, and the static paths stay compact. */
export const fmt = (value: number) => (Math.round(value * 10) / 10).toString();

/** A filled needle: a thin triangle from a base 2·1.2 px wide to its tip. */
export const needlePath = (base: Point, tip: Point) => {
  const dx = tip[0] - base[0];
  const dy = tip[1] - base[1];
  const length = Math.hypot(dx, dy) || 1;
  const px = (-dy / length) * 1.2;
  const py = (dx / length) * 1.2;
  return `M${fmt(base[0] + px)} ${fmt(base[1] + py)}L${fmt(tip[0])} ${fmt(tip[1])}L${fmt(base[0] - px)} ${fmt(base[1] - py)}Z`;
};

/** A filled dot written as two arcs, so many of them share one path. */
export const dotPath = ([x, y]: Point, r: number) =>
  `M${fmt(x - r)} ${fmt(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const DEG = Math.PI / 180;

type Layer = {step: number; start: number; minU: number; mul: number; angle: number};
const LAYERS: Record<'back' | 'mid' | 'front', Layer> = {
  back: {step: 6, start: 0, minU: 0, mul: 1.15, angle: 48},
  // The front layer skips the root, which stays darker for depth.
  mid: {step: 6, start: 3, minU: 0, mul: 1, angle: 42},
  front: {step: 9, start: 0, minU: 0.2, mul: 0.78, angle: 36},
};

type Branch = {curve: Cubic; base: number; tip: number; stem: readonly [number, number]};

const rotate = ([x, y]: Point, degrees: number): [number, number] => {
  const a = degrees * DEG;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

/**
 * Lays needles along each spine and its two twigs: three layers (back, mid, front) on both sides,
 * leaning toward the tip, with a tapered stem underneath and frost on every third front tip.
 * `twigs: false` lays the spines alone, as the garland's short sprigs do; it draws nothing from
 * `random` for the twigs, so the boughs, which keep them, lay out exactly as before.
 */
export const buildPine = (spines: readonly Spine[], random: () => number, {twigs = true}: {twigs?: boolean} = {}) => {
  const between = (min: number, max: number) => min + random() * (max - min);
  const branches: Branch[] = [];
  for (const bough of spines) {
    branches.push({curve: bough.points, base: bough.base, tip: bough.tip, stem: [7, 2]});
    if (!twigs) continue;
    for (const [u, side] of [[0.45, 1], [0.7, -1]] as const) {
      const start = cubicPoint(bough.points, u);
      const direction = rotate(cubicTangent(bough.points, u), side * 35);
      const length = between(60, 110);
      const along = (share: number): Point => [start[0] + direction[0] * length * share, start[1] + direction[1] * length * share];
      const third = along(2 / 3);
      branches.push({
        curve: [start, along(1 / 3), [third[0], third[1] + 6], along(1)],
        base: bough.base * 0.75,
        tip: bough.tip * 0.75,
        stem: [3, 1.2],
      });
    }
  }

  const stems: string[] = [];
  const paths = {back: [] as string[], mid: [] as string[], front: [] as string[]};
  const frost: string[] = [];
  const tips: Point[] = [];
  let frontCount = 0;
  for (const branch of branches) {
    const walker = arcWalker(branch.curve);
    // The stem: a tapered polygon sampled at 24 points along the arc.
    const left: string[] = [];
    const right: string[] = [];
    for (let i = 0; i < 24; i++) {
      const t = walker.parameterAt((walker.total * i) / 23);
      const [x, y] = cubicPoint(branch.curve, t);
      const [tx, ty] = cubicTangent(branch.curve, t);
      const half = lerp(branch.stem[0], branch.stem[1], i / 23) / 2;
      left.push(`${fmt(x - ty * half)} ${fmt(y + tx * half)}`);
      right.unshift(`${fmt(x + ty * half)} ${fmt(y - tx * half)}`);
    }
    stems.push(`M${[...left, ...right].join('L')}Z`);

    for (const name of ['back', 'mid', 'front'] as const) {
      const layer = LAYERS[name];
      for (let s = layer.start; s <= walker.total; s += layer.step) {
        const u = s / walker.total;
        if (u < layer.minU) continue;
        const t = walker.parameterAt(s);
        const [px, py] = cubicPoint(branch.curve, t);
        const [tx, ty] = cubicTangent(branch.curve, t);
        const heading = Math.atan2(ty, tx);
        for (const side of [1, -1]) {
          const offset = between(0, 2);
          const jitter = between(-6, 6);
          const length = lerp(branch.base, branch.tip, u) * between(0.85, 1.1) * layer.mul;
          const base: Point = [px - ty * side * offset, py + tx * side * offset];
          const angle = heading + side * (layer.angle + jitter) * DEG;
          const tip: Point = [base[0] + Math.cos(angle) * length, base[1] + Math.sin(angle) * length];
          paths[name].push(needlePath(base, tip));
          tips.push(tip);
          if (name === 'front' && ++frontCount % 3 === 0) frost.push(dotPath(tip, 1.2));
        }
      }
    }
  }
  return {
    stems: stems.join(''),
    back: paths.back.join(''),
    mid: paths.mid.join(''),
    front: paths.front.join(''),
    frost: frost.join(''),
    tips,
  };
};

/** The four corners of a box (±halfWidth, ±halfLength) turned by `rotation` about (x, y). */
const boxCorners = (x: number, y: number, halfWidth: number, halfLength: number, rotation: number): Point[] =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const [dx, dy] = rotate([sx! * halfWidth, sy! * halfLength], rotation);
    return [x + dx, y + dy];
  });

const withOrnaments = (
  pine: ReturnType<typeof buildPine>,
  cones: readonly PineCone[],
  holly: readonly PineHolly[],
): PineArt => ({
  ...pine,
  cones,
  holly,
  extent: [
    ...pine.tips,
    ...cones.flatMap((cone) => boxCorners(cone.x, cone.y, cone.width / 2, cone.length / 2, cone.rotation)),
    ...holly.flatMap((sprig) => boxCorners(sprig.x, sprig.y, 46, 46, 0)),
  ],
});

const pineRandom = createSeededRandom(1712);

/**
 * The top boughs' cones sit clear of every ribbon that hangs from those boughs (layout.ts), so no
 * bauble seems to hang from a cone or to be threaded on one: one in the crown between spines 0 and
 * 4, one on spine 2 left of the long outer ribbon. A test holds the clearance at full swing.
 */
export const PINE_UPPER: PineArt = withOrnaments(
  buildPine(UPPER_SPINES, pineRandom),
  [{x: 182, y: 42, rotation: 16, length: 64, width: 34}, {x: 42, y: 128, rotation: -8, length: 52, width: 28}],
  [{x: 338, y: 58}],
);

/**
 * The lower boughs, thickened by the fillers' back and mid needles (built after the main spines, so
 * those lay out as before). The cone hangs tip down from spine 3, its stem end on the branch.
 */
export const PINE_LOWER: PineArt = (() => {
  const main = buildPine(LOWER_SPINES, pineRandom);
  const fill = buildPine(LOWER_FILLERS, pineRandom);
  return withOrnaments(
    {
      ...main,
      stems: `${fill.stems}${main.stems}`,
      back: `${fill.back}${main.back}`,
      mid: `${fill.mid}${main.mid}`,
      tips: [...main.tips, ...fill.tips],
    },
    [{x: 196, y: 1034, rotation: -25, length: 60, width: 32}],
    [{x: 400, y: 1040}],
  );
})();
