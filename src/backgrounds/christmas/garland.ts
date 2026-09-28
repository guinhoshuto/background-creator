import {createSeededRandom, TAU} from '../../loop';
import {buildPine, fmt, type Point, type Spine} from './pine';

/**
 * The pine garland across the top edge, built once at module load: two shallow swags meeting at
 * the bow, a short swag into each corner, overlapping pine sprigs in three needle depths, the gold
 * ribbon spiralling around it and the 22 light slots. A fixed PRNG lays the sprigs and needles
 * out; the user's seed never reaches this file.
 */

type Quadratic = {readonly p0: Point; readonly c: Point; readonly p1: Point};

export const SWAGS = {
  cornerLeft: {p0: [-40, 70], c: [140, 150], p1: [300, 40]},
  // x = 300 + 660t and y = 40 + 256t − 262t², lowest at y 102.5 near x 622.
  A: {p0: [300, 40], c: [630, 168], p1: [960, 34]},
  // x = 960 + 660t and y = 34 + 268t − 262t², the mirror of A.
  B: {p0: [960, 34], c: [1290, 168], p1: [1620, 40]},
  cornerRight: {p0: [1620, 40], c: [1780, 150], p1: [1960, 70]},
} as const satisfies Record<string, Quadratic>;

export type SwagId = keyof typeof SWAGS;
const SWAG_ORDER: readonly SwagId[] = ['cornerLeft', 'A', 'B', 'cornerRight'];

/**
 * The point of a swag at t and its unit tangent (tx, ty). The normal (−ty, tx) points down for a
 * rightward tangent.
 */
export const swagPoint = (id: SwagId, t: number) => {
  const {p0, c, p1} = SWAGS[id];
  const s = 1 - t;
  const x = s * s * p0[0] + 2 * s * t * c[0] + t * t * p1[0];
  const y = s * s * p0[1] + 2 * s * t * c[1] + t * t * p1[1];
  const dx = 2 * s * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]);
  const dy = 2 * s * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]);
  const length = Math.hypot(dx, dy) || 1;
  return {x, y, tx: dx / length, ty: dy / length};
};

const ARC_STEPS = 256;

/** A 256-step arc-length table per swag: the distance along it to its parameter. */
const swagWalker = (id: SwagId) => {
  const lengths = [0];
  let previous = swagPoint(id, 0);
  for (let i = 1; i <= ARC_STEPS; i++) {
    const point = swagPoint(id, i / ARC_STEPS);
    lengths.push(lengths[i - 1]! + Math.hypot(point.x - previous.x, point.y - previous.y));
    previous = point;
  }
  const total = lengths[ARC_STEPS]!;
  const at = (distance: number) => {
    const s = Math.min(total, Math.max(0, distance));
    let i = 0;
    while (i < ARC_STEPS - 1 && lengths[i + 1]! < s) i++;
    const span = lengths[i + 1]! - lengths[i]!;
    return swagPoint(id, (i + (span > 0 ? (s - lengths[i]!) / span : 0)) / ARC_STEPS);
  };
  return {total, at};
};

const DEG = Math.PI / 180;

/** The x where the swags meet, under the bow's knot. */
export const GARLAND_CENTRE = SWAGS.A.p1[0];

/**
 * The pine sprigs the garland is bundled from: one every 18–22 px along each swag, alternately
 * above and below the centreline, leaning 10–30° off it and pointing away from the bow, as a real
 * garland is wired from the middle out. Each is a short bough (buildPine, without twigs) with
 * needles 18 px at the root and 11 px at the tip, so the band is about 80 px thick. Their stems
 * would hide under the back needles, so the garland leaves them out.
 */
export const SPRIG = {gap: [18, 22], length: [52, 74], angle: [10, 30], lift: 4, droop: 3, needles: [18, 11]} as const;

/**
 * The ribbon spiral: amplitude and pitch along the garland, in px. Within `taper` px of the centre
 * it flattens onto the centreline, and within `gap` px it stops, so it runs under the bow's loops
 * and never shows above the knot.
 */
export const RIBBON = {amplitude: 24, pitch: 150, step: 2, gap: 36, taper: 84} as const;

/** 0 up to a, 1 from b, smooth between. */
const smoothstep = (a: number, b: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const buildGarland = () => {
  const random = createSeededRandom(2512);
  const between = ([min, max]: readonly [number, number]) => min + random() * (max - min);

  const sprigs: Spine[] = [];
  for (const id of SWAG_ORDER) {
    const walker = swagWalker(id);
    let side = 1;
    for (let s = between([0, 10]); s <= walker.total; s += between(SPRIG.gap)) {
      const {x, y, tx, ty} = walker.at(s);
      // Every swag runs left to right, so the left half points back along it and the right half forward.
      const outward = x < GARLAND_CENTRE ? -1 : 1;
      // The normal (−ty, tx) points down: side 1 is below the centreline, −1 above.
      const [nx, ny] = [-ty * side, tx * side];
      const angle = between(SPRIG.angle) * DEG;
      const length = between(SPRIG.length);
      const lift = between([0, SPRIG.lift]);
      const dx = outward * tx * Math.cos(angle) + nx * Math.sin(angle);
      const dy = outward * ty * Math.cos(angle) + ny * Math.sin(angle);
      const root: Point = [x + nx * lift, y + ny * lift];
      // The tip droops a few px under its own weight.
      const at = (share: number, droop: number): Point => [root[0] + dx * length * share, root[1] + dy * length * share + droop];
      sprigs.push({
        points: [root, at(1 / 3, 0), at(2 / 3, SPRIG.droop * 0.6), at(1, SPRIG.droop)],
        base: SPRIG.needles[0],
        tip: SPRIG.needles[1],
      });
      side = -side;
    }
  }
  const pine = buildPine(sprigs, random, {twigs: false});

  // The ribbon: all four swags sampled every 2 px with a running arc length S, offset along the
  // normal by a sine; where its cosine is positive the ribbon passes in front of the greenery.
  const runs: {front: boolean; points: string[]}[] = [];
  let travelled = 0;
  let broken = false;
  for (const id of SWAG_ORDER) {
    const walker = swagWalker(id);
    for (let s = 0; s <= walker.total; s += RIBBON.step) {
      const {x, y, tx, ty} = walker.at(s);
      const away = Math.abs(x - GARLAND_CENTRE);
      if (away < RIBBON.gap) {
        broken = true;
        continue;
      }
      const S = travelled + s;
      const wave = (S * TAU) / RIBBON.pitch;
      const offset = RIBBON.amplitude * Math.sin(wave) * smoothstep(RIBBON.gap, RIBBON.taper, away);
      const front = Math.cos(wave) > 0;
      const point = `${fmt(x - ty * offset)} ${fmt(y + tx * offset)}`;
      const last = runs[runs.length - 1];
      if (last && last.front === front && !broken) {
        last.points.push(point);
      } else {
        // Each run starts where the previous one ended, so the halves meet without a gap; after the
        // opening under the knot, a new run starts on its own.
        const joint = broken ? undefined : last?.points[last.points.length - 1];
        runs.push({front, points: joint ? [joint, point] : [point]});
      }
      broken = false;
    }
    travelled += walker.total;
  }
  const ribbon = (front: boolean) => runs
    .filter((run) => run.front === front && run.points.length > 1)
    .map((run) => `M${run.points.join('L')}`)
    .join('');

  return {
    back: pine.back,
    mid: pine.mid,
    front: pine.front,
    sprigs: sprigs.length,
    tips: pine.tips,
    maxY: Math.max(...pine.tips.map(([, y]) => y)),
    ribbonFront: ribbon(true),
    ribbonBack: ribbon(false),
  };
};

export const GARLAND = buildGarland();

/**
 * The 22 bulbs along swags A and B, 11 each at t = (i + 0.5)/11 (x = 330 + 60i and 990 + 60i),
 * nudged off the centreline alternately below (+7) and above (−5).
 */
export const LIGHT_SLOTS: readonly {swag: 'A' | 'B'; index: number; x: number; y: number}[] =
  (['A', 'B'] as const).flatMap((swag) => Array.from({length: 11}, (_, index) => {
    const {x, y, tx, ty} = swagPoint(swag, (index + 0.5) / 11);
    const offset = index % 2 ? -5 : 7;
    return {swag, index, x: x - ty * offset, y: y + tx * offset};
  }));
