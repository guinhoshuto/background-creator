import type {ReactNode} from 'react';
import {strandCurve, STRAND} from '../../../../backgrounds/CobwebLoop';
import {TIP_BEAD_REACH} from '../../../../backgrounds/halloween/CobwebArtwork';
import {clampRadius, svgNumber} from '../../geometry';
import {paint} from '../draw';
import {ceilHalf, enclosingCircle, fitsAt, maxExtentAt} from '../place';
import type {OrnamentCornerId, OrnamentFrame} from '../types';
import {FAN_SPREAD, type Circle, type FanLayout, type Point} from './cobweb-fan';
import {DARK_EDGE, DEW, DewBead, DewGlass, DewHalo} from './cobweb-web';

/**
 * Silk garlands (the background's cobweb bunting): two or three threads draped side by side
 * between knots along a long edge, sagging as catenaries, with the webs' dew at their low points
 * and a few short broken ends. The top run hangs in the top bleed from the top-left web to the
 * hero web (or from where the outline's straight edge ends), its inner knots tied off above the
 * file like the background's loose silk; a bottom run (big frames and blocks) is knotted on the
 * frame itself and sags into the bottom bleed between the lower corners' webs.
 *
 * Fixed px everywhere: knots every run/n px with n = round(run/188) (whole swags, like the
 * comets), lows fixed per fit (over the panel's top edge, over a border's band), threads 1.6, 1.2
 * and 0.9 px. The circle bound is met as the fans meet it: each swag is cut into vertical strips
 * with whole-px boundaries, bisected until every strip's smallest circle (around everything the
 * swag can draw inside it, in any pose) fits; each strip is a placement of its own and draws the
 * swag clipped to itself, so the pieces join seamlessly. A run whose swags do not all fit at a
 * low of at least GARLAND.least px is left out whole (the count stays constant per size).
 *
 * Motion, whole harmonics of the cycle: the sag breathes at 1× (±1 px on the lowest thread, ±0.6
 * on the others), the low point slides ±2 px sideways at 2×, both with a phase that travels along
 * the run (a slow wave along the edge); the dew flashes as the hero web's moonlight band passes
 * the swag's place along the run. Pure placement: no seed, no frame.
 */

/** A thread's look: silk width and opacity, and its dark outline's width and opacity (DARK_EDGE's colour). */
type ThreadLook = {width: number; opacity: number; edge: number; edgeOpacity: number};

export const GARLAND = {
  /** Knots every run/n px, n = max(1, round(run / spacing)): whole swags. */
  spacing: 188,
  /** A run shorter than this is no garland. */
  shortest: 120,
  /** Inner knots of the top run hang this far under the file's top edge (tied off above it). */
  knotDrop: 6,
  /** The tie runs up to this far under the file's edge, fading in toward the knot. */
  tieTop: 1.5,
  /** End knots tie into a web on its edge radial (top run) or its rim (bottom run), at this fraction of its radius. */
  onWeb: 0.96,
  /** The knot: a silk dot (radius px, opacity) inside a DARK_EDGE ring (width px). */
  knot: {radius: 1.1, opacity: 0.9, ring: 0.8},
  /** Lowest to highest thread: C (the lowest), B, A. */
  threads: [
    {width: 1.6, opacity: 0.9, edge: 3.2, edgeOpacity: 0.45},
    {width: 1.2, opacity: 0.7, edge: 2.8, edgeOpacity: 0.4},
    {width: 0.9, opacity: 0.5, edge: 2.5, edgeOpacity: 0.35},
  ] satisfies ThreadLook[],
  /** C's moonlit edge (moonlight colour), shifted toward the moon. */
  lit: {width: 0.8, opacity: 0.5, shift: 0.8},
  /** The cross threads, from the highest thread down to C: two per swag, at these u (from → to). */
  cross: {width: 0.8, opacity: 0.5, edge: 2.4, edgeOpacity: 0.3, at: [[0.3, 0.36], [0.7, 0.64]]},
  /** The sag's breath (px, 1×) per thread and the skew of the low point (2×): y·(1 + k(2u − 1)), |k| ≤ skew. */
  breath: [1, 0.6, 0.6], skew: 0.05,
  /** Three threads from this sag of C (px); two below it; the run is dropped under `least`. */
  three: 28, least: 16,
  /** Strips: at least this wide (px), at most this many per swag. */
  strip: {least: 3, most: 12},
  /** The run stays this far clear of a spider's circle, px. */
  spiderGap: 4,
  /** Small dew: the beads on B's low point (odd swags) or on C at u 0.3 and 0.7 (even swags), radius px. */
  smallBead: 2,
  /** Where the smaller beads sit on C, on even swags. */
  smallAt: [0.3, 0.7],
} as const;

/** Broken ends: short loose threads hanging from the garland (the background's strand, shortened), each with a small bead. */
export const BROKEN_END = {
  /** Lengths, px: long (from C), short (from B, and from C on shallow runs), and the shortest kept. */
  long: 10, short: 7, least: 4,
  /** Swag i % 3 === 1: from C at u 0.62; i % 3 === 2: from B at u 0.38. */
  at: [0.62, 0.38],
  /** The run's C sag below which even C's broken end is the short one. */
  shallow: 24,
  /** TipBead size, its growth while flashing, its opacity at rest. */
  bead: 0.8, flash: 0.12, rest: 0.75,
  /** Swing ±degrees at 2×, and how far the bend lags it. */
  swing: 3, lag: 0.5,
  /** Moonlit edge. */
  lit: 0.8, litOpacity: 0.5, litShift: 0.8,
} as const;


/** A swag's resting shape: its two knots and each thread's sag (lowest first). */
export type SwagShape = {x0: number; y0: number; x1: number; y1: number; sags: number[]};

/**
 * A thread's point at u (0–1 along the swag): the chord between the knots plus the sag
 * s·4u(1−u), skewed by (1 + k(2u − 1)) so the low point slides sideways.
 */
export const swagPoint = (shape: Pick<SwagShape, 'x0' | 'y0' | 'x1' | 'y1'>, sag: number, skew: number, u: number): Point => ({
  x: shape.x0 + (shape.x1 - shape.x0) * u,
  y: shape.y0 + (shape.y1 - shape.y0) * u + sag * 4 * u * (1 - u) * (1 + skew * (2 * u - 1)),
});

/** Where a thread is lowest (0–1): the root of its slope, a quadratic in u. */
export const swagLow = (shape: Pick<SwagShape, 'y0' | 'y1'>, sag: number, skew: number) => {
  const d = shape.y1 - shape.y0;
  // p'(u) = d + 4s(1−k) + 8s(3k−1)u − 24sk u².
  const a = -24 * sag * skew;
  const b = 8 * sag * (3 * skew - 1);
  const c = d + 4 * sag * (1 - skew);
  if (Math.abs(a) < 1e-12) return Math.min(1, Math.max(0, -c / b));
  const root = Math.sqrt(Math.max(0, b * b - 4 * a * c));
  // The maximum of y (the low point): where the slope turns from rising to falling, p'' = b + 2au < 0.
  const roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter((u) => u >= 0 && u <= 1 && b + 2 * a * u < 0);
  return roots.length > 0 ? roots[0]! : Math.min(1, Math.max(0, -c / b));
};

/** The cubic Bézier (exact: the skewed sag is a cubic in u) of a thread, as an SVG path. */
export const swagPath = (shape: Pick<SwagShape, 'x0' | 'y0' | 'x1' | 'y1'>, sag: number, skew: number) => {
  const n = svgNumber;
  const {x0, y0, x1, y1} = shape;
  const d = y1 - y0;
  const start = d + 4 * sag * (1 - skew);
  const end = d - 4 * sag * (1 + skew);
  const dx = x1 - x0;
  return `M${n(x0)} ${n(y0)}C${n(x0 + dx / 3)} ${n(y0 + start / 3)} ${n(x0 + 2 * dx / 3)} ${n(y1 - end / 3)} ${n(x1)} ${n(y1)}`;
};

/** The sag that brings a thread between knots at y0 and y1 down to `low` at rest (no skew). */
const sagFor = (y0: number, y1: number, low: number) => {
  const middle = (y0 + y1) / 2;
  const depth = low - middle;
  const d = y1 - y0;
  return (depth + Math.sqrt(Math.max(0, depth * depth - d * d / 4))) / 2;
};

/** One strip of a swag: its whole-px x range and the circle around what the swag can draw in it. */
export type GarlandPiece = {xa: number; xb: number; circle: Circle};

/** A swag of a run, as placed: its shape, knots' ties, where it sits along the run, and its pieces. */
export type SwagPlan = SwagShape & {
  index: number;
  /** 0–1: the swag's centre along the run (the dew's flash and the wave along the edge). */
  across: number;
  /** Whether each knot carries a tie up to the file's edge (1) or sits on a web or the frame (0). */
  tie0: number; tie1: number;
  pieces: GarlandPiece[];
};

/** A broken end: which swag and thread it hangs from, where (u), how long, which way it bows, its circle. */
export type BrokenEndPlan = {swag: number; thread: number; u: number; length: number; side: number; circle: Circle};

export type GarlandRun = {
  slot: 'top' | 'bottom';
  /** Threads drawn (2 or 3), the knots' y for the ties' top, and the swags. */
  threads: number; tieTop: number;
  swags: SwagPlan[];
  ends: BrokenEndPlan[];
};

/** A run's ends and its target lows (absolute y, lowest thread first). */
type RunSpec = {
  slot: 'top' | 'bottom';
  left: {x: number; y: number; tie: boolean};
  right: {x: number; y: number; tie: boolean};
  knotY: number; tieTop: number; lows: number[]; most: number;
  avoid: readonly Circle[];
};

/** A convex polygon (its vertices in order): the envelope is a union of them. */
type Polygon = Point[];

const MOTION_SLACK = 0.05;

/**
 * A box grown by a radius with rounded corners, as a convex polygon that holds it: `sides`
 * vertices per turn on the circumscribed polygon (edges tangent to the rounding), each moved to
 * the box corner on its side.
 */
const roundedBox = (x0: number, x1: number, y0: number, y1: number, radius: number, sides = 8): Polygon => {
  const out = radius / Math.cos(Math.PI / sides);
  return Array.from({length: sides}, (_, index) => {
    const angle = (index + 0.5) * 2 * Math.PI / sides;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    return {x: (cos > 0 ? x1 : x0) + out * cos, y: (sin > 0 ? y1 : y0) + out * sin};
  });
};

/** A convex polygon clipped to the vertical strip [xa, xb] (Sutherland–Hodgman on its two sides). */
const clipToStrip = (polygon: Polygon, xa: number, xb: number): Polygon => {
  const clip = (points: Polygon, inside: (p: Point) => boolean, edge: number) => {
    const out: Point[] = [];
    points.forEach((current, index) => {
      const previous = points[(index + points.length - 1) % points.length]!;
      const [inCurrent, inPrevious] = [inside(current), inside(previous)];
      if (inCurrent !== inPrevious) {
        const t = (edge - previous.x) / (current.x - previous.x);
        out.push({x: edge, y: previous.y + (current.y - previous.y) * t});
      }
      if (inCurrent) out.push(current);
    });
    return out;
  };
  const left = clip(polygon, (p) => p.x >= xa, xa);
  return left.length > 0 ? clip(left, (p) => p.x <= xb, xb) : [];
};

/** A bead's outer reach at full flash, for a bead radius (the webs' dew, scaled). */
const beadReach = (radius: number) => DEW.haloFlash * radius / DEW.bead;

/**
 * The swag's envelope as convex polygons: every thread (both breath extremes, both skew extremes,
 * plus the widest pass around it: outline or C's lit edge), the beads with their flash halo over
 * the low point's whole travel, the knots with their ring and the ties.
 */
const swagParts = (shape: SwagShape, threads: number, odd: boolean, tie0: boolean, tie1: boolean, tieTop: number): Polygon[] => {
  const parts: Polygon[] = [];
  const corners = (thread: number) => {
    const amplitude = GARLAND.breath[thread]!;
    return [-1, 1].flatMap((s) => [-GARLAND.skew, GARLAND.skew].map((k) => ({sag: shape.sags[thread]! + s * amplitude, skew: k})));
  };
  const pads = GARLAND.threads.map((look, thread) => Math.max(look.edge / 2, thread === 0 ? GARLAND.lit.shift + GARLAND.lit.width / 2 : 0));
  // Per x: the highest and lowest centreline over the threads and their motion, less and plus the thread's pad.
  const yAt = (x: number) => {
    const u = (x - shape.x0) / (shape.x1 - shape.x0);
    let top = Infinity;
    let bottom = -Infinity;
    for (let thread = 0; thread < threads; thread++) {
      for (const {sag, skew} of corners(thread)) {
        const {y} = swagPoint(shape, sag, skew, u);
        top = Math.min(top, y - pads[thread]! + pads[0]!);
        bottom = Math.max(bottom, y + pads[thread]! - pads[0]!);
      }
    }
    return [top, bottom] as const;
  };
  // Columns a px wide (the curves are nearly straight over a px: the slack covers the bow), rounded by C's pad.
  const [from, to] = [shape.x0, shape.x1];
  for (let x = from; x < to; x = Math.min(to, Math.floor(x) + 1)) {
    const next = Math.min(to, Math.floor(x) + 1);
    const [ta, ba] = yAt(x);
    const [tb, bb] = yAt(next);
    parts.push(roundedBox(x, next, Math.min(ta, tb) - MOTION_SLACK, Math.max(ba, bb) + MOTION_SLACK, pads[0]!));
  }
  // Beads: C's low point over its whole travel, and the small beads.
  const beadPart = (points: Point[], radius: number) => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    parts.push(roundedBox(Math.min(...xs) - 0.1, Math.max(...xs) + 0.1, Math.min(...ys) - 0.1, Math.max(...ys) + 0.1, beadReach(radius), 16));
  };
  const grid = (thread: number, at: (sag: number, skew: number) => number) => {
    const points: Point[] = [];
    const amplitude = GARLAND.breath[thread]!;
    for (const s of [-1, -0.5, 0, 0.5, 1]) {
      for (let step = -4; step <= 4; step++) {
        const skew = GARLAND.skew * step / 4;
        const sag = shape.sags[thread]! + s * amplitude;
        points.push(swagPoint(shape, sag, skew, at(sag, skew)));
      }
    }
    return points;
  };
  beadPart(grid(0, (sag, skew) => swagLow(shape, sag, skew)), DEW.bead);
  if (odd) beadPart(grid(1, (sag, skew) => swagLow(shape, sag, skew)), GARLAND.smallBead);
  else for (const u of GARLAND.smallAt) beadPart(grid(0, () => u), GARLAND.smallBead);
  // Knots, and their ties up to the file's edge (square ends).
  const knot = GARLAND.knot.radius + GARLAND.knot.ring;
  const tieHalf = GARLAND.threads[0].edge / 2;
  for (const [x, y, tie] of [[shape.x0, shape.y0, tie0], [shape.x1, shape.y1, tie1]] as const) {
    parts.push(roundedBox(x, x, y, y, knot, 16));
    if (tie) parts.push([{x: x - tieHalf, y: tieTop}, {x: x + tieHalf, y: tieTop}, {x: x + tieHalf, y}, {x: x - tieHalf, y}]);
  }
  return parts;
};

/** The convex hull of some points (Andrew's monotone chain): all a circle needs to hold. */
const hullOf = (points: readonly Point[]): Point[] => {
  if (points.length <= 3) return [...points];
  const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, point) <= 0) out.pop();
      out.push(point);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
};

/** The vertices of the parts' pieces inside the strip [xa, xb]. */
const stripPoints = (parts: readonly Polygon[], xa: number, xb: number): Point[] => {
  const points: Point[] = [];
  for (const part of parts) {
    let [low, high] = [Infinity, -Infinity];
    for (const {x} of part) {
      low = Math.min(low, x);
      high = Math.max(high, x);
    }
    if (high <= xa || low >= xb) continue;
    points.push(...(low >= xa && high <= xb ? part : clipToStrip(part, xa, xb)));
  }
  return points;
};

const SEARCH = [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]] as const;

/**
 * A circle (radius on the 0.5 px grid) that holds the points and fits on the front layer: not
 * the smallest one, but one whose room holds it. A wide, flat part of a swag close to an edge or
 * the text fits a large circle centred away from that edge where the smallest circle, bulging
 * past the corners, would not. Pattern search from the smallest circle's centre on the room left
 * (maxExtentAt less the radius the points need there). Null when none is found.
 */
const placeCircle = (frame: OrnamentFrame, points: readonly Point[]): Circle | null => {
  if (points.length === 0) return null;
  const hull = hullOf(points);
  const need = (x: number, y: number) => {
    let r = 0;
    for (const point of hull) r = Math.max(r, Math.hypot(point.x - x, point.y - y));
    return r;
  };
  const result = (x: number, y: number) => {
    const r = ceilHalf(need(x, y) + 1e-3);
    return fitsAt(frame, x, y, r, 'front') ? {x, y, r} : null;
  };
  const start = enclosingCircle(hull);
  let best = {x: start.x, y: start.y, score: maxExtentAt(frame, start.x, start.y, 'front') - start.r};
  const found = result(best.x, best.y);
  if (found) return found;
  let step = Math.max(1, start.r / 2);
  while (step > 0.05) {
    let moved = false;
    for (const [dx, dy] of SEARCH) {
      const x = best.x + dx * step;
      const y = best.y + dy * step;
      const score = maxExtentAt(frame, x, y, 'front') - need(x, y);
      if (score > best.score + 1e-9) {
        best = {x, y, score};
        moved = true;
        const hit = result(x, y);
        if (hit) return hit;
      }
    }
    if (!moved) step /= 2;
  }
  return null;
};

/** The swag cut into the fewest strips (bisecting the widest failing one) whose circles fit; null past GARLAND.strip.most. */
const fitStrips = (frame: OrnamentFrame, parts: readonly Polygon[], xa: number, xb: number): GarlandPiece[] | null => {
  const strips: {xa: number; xb: number; circle: Circle | null}[] = [];
  const measure = (a: number, b: number) => {
    const points = stripPoints(parts, a, b);
    return {xa: a, xb: b, circle: points.length > 0 ? placeCircle(frame, points) : null, empty: points.length === 0};
  };
  const first = measure(xa, xb);
  if (first.empty) return null;
  strips.push(first);
  for (;;) {
    const failing = strips.filter((strip) => !strip.circle).sort((p, q) => (q.xb - q.xa) - (p.xb - p.xa) || p.xa - q.xa);
    if (failing.length === 0) break;
    const strip = failing[0]!;
    if (strip.xb - strip.xa < 2 * GARLAND.strip.least || strips.length >= GARLAND.strip.most) return null;
    const middle = Math.floor((strip.xa + strip.xb) / 2);
    const halves = [measure(strip.xa, middle), measure(middle, strip.xb)].filter((half) => !half.empty);
    strips.splice(strips.indexOf(strip), 1, ...halves);
  }
  return strips.sort((p, q) => p.xa - q.xa).map((strip) => ({xa: strip.xa, xb: strip.xb, circle: strip.circle!}));
};

/** The distance from a point to a segment. */
const segmentDistance = (p: Point, a: Point, b: Point) => {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

/** Whether every part stays GARLAND.spiderGap px clear of each circle (a spider and its line). */
const clearOf = (parts: readonly Polygon[], avoid: readonly Circle[]) => avoid.every((circle) => parts.every((part) =>
  part.every((point, index) => segmentDistance(circle, point, part[(index + 1) % part.length]!) >= circle.r + GARLAND.spiderGap)));

/**
 * A broken end's circle: the strand (knot at u on its thread, over the thread's whole motion;
 * bend ± lag; turn ±swing) with its outline and its bead at full flash. Null when it does not fit.
 */
const brokenEndCircle = (frame: OrnamentFrame, shape: SwagShape, thread: number, u: number, length: number, side: number, width: number): Circle | null => {
  const amplitude = GARLAND.breath[thread]!;
  const knots = [-1, 1].flatMap((s) => [-GARLAND.skew, GARLAND.skew].map((k) => swagPoint(shape, shape.sags[thread]! + s * amplitude, k, u)));
  const outline = Math.max((width + DARK_EDGE.grow) / 2, BROKEN_END.litShift + BROKEN_END.lit / 2);
  const bead = TIP_BEAD_REACH * BROKEN_END.bead * (1 + BROKEN_END.flash);
  const points: Point[] = [];
  for (const bend of [side - BROKEN_END.lag, side + BROKEN_END.lag]) {
    const {control, tip} = strandCurve({scale: length / STRAND.length, bend});
    for (const degrees of [-BROKEN_END.swing, BROKEN_END.swing]) {
      const turn = degrees * Math.PI / 180;
      const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
      for (let index = 0; index <= 12; index++) {
        const t = index / 12;
        const x = 2 * (1 - t) * t * control.x + t * t * tip.x;
        const y = 2 * (1 - t) * t * control.y + t * t * tip.y;
        const pad = (index === 12 ? bead : outline) + MOTION_SLACK;
        for (const knot of knots) {
          const px = knot.x + x * cos - y * sin;
          const py = knot.y + x * sin + y * cos;
          points.push(...roundedBox(px, px, py, py, pad, index === 12 ? 16 : 8));
        }
      }
    }
  }
  return placeCircle(frame, points);
};

/** The run's broken ends: swag i % 3 === 1 from C, i % 3 === 2 from B; moved up a thread or shortened where they would not fit. */
const fitBrokenEnds = (frame: OrnamentFrame, swags: readonly SwagPlan[], threads: number, sagC: number): BrokenEndPlan[] => {
  const ends: BrokenEndPlan[] = [];
  for (const swag of swags) {
    const kind = swag.index % 3;
    if (kind === 0) continue;
    const u = BROKEN_END.at[kind - 1]!;
    const first = kind === 1 ? 0 : 1;
    if (first >= threads) continue;
    const nominal = kind === 1 && sagC >= BROKEN_END.shallow ? BROKEN_END.long : BROKEN_END.short;
    const side = swag.index % 2 === 0 ? 1 : -1;
    let best: BrokenEndPlan | null = null;
    for (let thread = first; thread < threads; thread++) {
      const width = GARLAND.threads[thread]!.width;
      for (let length = nominal; length >= BROKEN_END.least; length -= 0.5) {
        const circle = brokenEndCircle(frame, swag, thread, u, length, side, width);
        if (!circle) continue;
        if (!best || length > best.length) best = {swag: swag.index, thread, u, length, side, circle};
        break;
      }
      if (best && best.length >= nominal) break;
    }
    if (best) ends.push(best);
  }
  return ends;
};

/** Fits a run: whole swags, lows lifted 0.5 px at a time until every swag fits; null under GARLAND.least. */
const fitRun = (frame: OrnamentFrame, spec: RunSpec): GarlandRun | null => {
  const run = spec.right.x - spec.left.x;
  if (!(run >= GARLAND.shortest)) return null;
  const count = Math.max(1, Math.round(run / GARLAND.spacing));
  const knots = Array.from({length: count + 1}, (_, index) => ({
    x: spec.left.x + run * index / count,
    y: index === 0 ? spec.left.y : index === count ? spec.right.y : spec.knotY,
    tie: index === 0 ? spec.left.tie : index === count ? spec.right.tie : spec.slot === 'top',
  }));
  // Strip bounds: whole px at the inner knots; the run's ends reach past their knot by its ring and tie.
  const reach = Math.max(GARLAND.knot.radius + GARLAND.knot.ring, GARLAND.threads[0].edge / 2) + 1;
  const bounds = knots.map((knot, index) => (index === 0 ? Math.floor(knot.x - reach) : index === count ? Math.ceil(knot.x + reach) : Math.round(knot.x)));
  for (let lift = 0; ; lift += 0.5) {
    const lows = spec.lows.map((low) => low - lift);
    const sagC = lows[0]! - spec.knotY;
    if (sagC < GARLAND.least) return null;
    const threads = Math.min(spec.most, lows.length, sagC >= GARLAND.three ? 3 : 2);
    const swags: SwagPlan[] = [];
    for (let index = 0; index < count; index++) {
      const [a, b] = [knots[index]!, knots[index + 1]!];
      const shape: SwagShape = {x0: a.x, y0: a.y, x1: b.x, y1: b.y, sags: lows.slice(0, threads).map((low) => sagFor(a.y, b.y, low))};
      const parts = swagParts(shape, threads, index % 2 === 1, a.tie, b.tie, spec.tieTop);
      // Necessary first (cheap): every point of the envelope lies where a circle may reach.
      if (!parts.every((part) => part.every((point) => maxExtentAt(frame, point.x, point.y, 'front') >= 0))) break;
      if (!clearOf(parts, spec.avoid)) break;
      const pieces = fitStrips(frame, parts, bounds[index]!, bounds[index + 1]!);
      if (!pieces) break;
      swags.push({...shape, index, across: (index + 0.5) / count, tie0: a.tie ? 1 : 0, tie1: b.tie ? 1 : 0, pieces});
    }
    if (swags.length < count) continue;
    return {slot: spec.slot, threads, tieTop: spec.tieTop, swags, ends: fitBrokenEnds(frame, swags, threads, sagC)};
  }
};

/** A web by its corner, as the set placed it. */
export type CornerWeb = {slot: OrnamentCornerId; fan: FanLayout};

/** The point on a web's upper edge radial at GARLAND.onWeb of its radius (a top run's end knot). */
const onEdgeRadial = (fan: FanLayout) => {
  const edges = [fan.bisector - FAN_SPREAD / 2, fan.bisector + FAN_SPREAD / 2];
  const angle = Math.sin(edges[0]!) <= Math.sin(edges[1]!) ? edges[0]! : edges[1]!;
  const r = GARLAND.onWeb * fan.radius;
  return {x: fan.hubX + r * Math.cos(angle), y: fan.hubY + r * Math.sin(angle)};
};

/** Where the line y crosses a web's rim (GARLAND.onWeb of its radius), on its inner side; null when it does not. */
const onRim = (fan: FanLayout, y: number) => {
  const r = GARLAND.onWeb * fan.radius;
  const dy = y - fan.hubY;
  if (Math.abs(dy) >= r) return null;
  const dx = Math.sqrt(r * r - dy * dy);
  return fan.hubX + (Math.cos(fan.bisector) > 0 ? dx : -dx);
};

/**
 * The garland runs a frame keeps (none on circles): along the top, from the top-left web (or
 * where the outline's straight top begins) to the hero web; along the bottom of a block or a
 * border's window (never a chat's message edge, nor a screen's thin band), between the lower webs.
 */
export const fitGarlands = (frame: OrnamentFrame, webs: readonly CornerWeb[], avoid: readonly Circle[]): GarlandRun[] => {
  if (frame.circle) return [];
  const {outline, paintLimit, hole} = frame;
  const corner = clampRadius(outline.radius, outline.width, outline.height);
  const web = (slot: OrnamentCornerId) => webs.find((entry) => entry.slot === slot)?.fan ?? null;
  const runs: GarlandRun[] = [];

  const knotY = paintLimit.y + GARLAND.knotDrop;
  const topLows = frame.fit === 'panel'
    ? [outline.y + 5, outline.y - 2, outline.y - 9]
    : hole ? (frame.fit === 'screen' ? [hole.y - 7, hole.y - 13] : [hole.y - 10, hole.y - 17, hole.y - 24]) : [];
  const end = (fan: FanLayout | null, x: number) => (fan ? {...onEdgeRadial(fan), tie: false} : {x, y: knotY, tie: true});
  if (topLows.length > 0) {
    const top = fitRun(frame, {
      slot: 'top', left: end(web('TL'), outline.x + corner), right: end(web('TR'), outline.x + outline.width - corner),
      knotY, tieTop: paintLimit.y + GARLAND.tieTop, lows: topLows, most: 3, avoid,
    });
    if (top) runs.push(top);
  }

  // The bottom: a block's outline or a border's main stroke line, knotted on the frame itself.
  const bottomY = frame.kind === 'block' ? outline.y + outline.height : frame.fit === 'window' ? frame.track.y + frame.track.height : null;
  if (bottomY !== null) {
    const lows = frame.kind === 'block' ? [bottomY + 22, bottomY + 15] : [bottomY + 32, bottomY + 25];
    const side = (slot: OrnamentCornerId, x: number) => {
      const fan = web(slot);
      const at = fan ? onRim(fan, bottomY) : null;
      return {x: at ?? x, y: bottomY, tie: false};
    };
    const bottom = fitRun(frame, {
      slot: 'bottom', left: side('BL', outline.x + corner), right: side('BR', outline.x + outline.width - corner),
      knotY: bottomY, tieTop: bottomY, lows, most: 2, avoid,
    });
    if (bottom) runs.push(bottom);
  }
  return runs;
};

/** What a garland piece draws this frame: its swag (knots, sags, skew), its look and its strip. */
export type GarlandDraw = {
  x0: number; y0: number; x1: number; y1: number;
  /** Current sags, lowest thread first (sagA is unused on two-thread runs). */
  sagC: number; sagB: number; sagA: number; skew: number; threads: number;
  /** 1: small beads on B's low point; 0: on C at u 0.3 and 0.7. */
  odd: number;
  tie0: number; tie1: number; tieTop: number;
  /** The dew's flash, 0–1. */
  flash: number;
  /** Unit vector toward the moon. */
  lightX: number; lightY: number;
  /** This piece's strip (the swag draws once, at its first strip, clipped to all of them: GarlandFigure). */
  clipX: number; clipY: number; clipWidth: number; clipHeight: number;
  silk: string; moonlight: string;
};

/** A clip rectangle, px. */
export type ClipRect = {x: number; y: number; width: number; height: number};

/**
 * A whole swag (threads, cross threads, knots, ties, dew), drawn once at its first strip and
 * clipped to the union of its strips (`rects`, one per strip: their x bounds are whole px and never
 * overlap, so each column is clipped exactly as its own strip would clip it).
 */
export const GarlandFigure = ({id, draw, rects}: {id: string; draw: GarlandDraw; rects: readonly ClipRect[]}): ReactNode => {
  const n = svgNumber;
  const shape = {x0: draw.x0, y0: draw.y0, x1: draw.x1, y1: draw.y1};
  const sags = [draw.sagC, draw.sagB, draw.sagA].slice(0, draw.threads);
  const paths = sags.map((sag) => swagPath(shape, sag, draw.skew));
  const highest = sags.length - 1;
  const cross = GARLAND.cross.at.map(([from, to]) => {
    const a = swagPoint(shape, sags[highest]!, draw.skew, from);
    const b = swagPoint(shape, sags[0]!, draw.skew, to);
    return `M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}`;
  });
  const toward = {x: draw.lightX, y: draw.lightY};
  const lowC = swagPoint(shape, draw.sagC, draw.skew, swagLow(shape, draw.sagC, draw.skew));
  const small = draw.odd > 0
    ? [swagPoint(shape, draw.sagB, draw.skew, swagLow(shape, draw.sagB, draw.skew))]
    : GARLAND.smallAt.map((u) => swagPoint(shape, draw.sagC, draw.skew, u));
  const knots = [[draw.x0, draw.y0, draw.tie0], [draw.x1, draw.y1, draw.tie1]] as const;
  const tie = `${id}-tie`;
  const tieEdge = `${id}-tie-edge`;
  const halo = `${id}-halo`;
  const glass = `${id}-glass`;
  const look = GARLAND.threads;
  const fade = (gradient: string, color: string, y: number) => (
    <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1={n(draw.tieTop)} x2="0" y2={n(y)}>
      <stop offset="0" stopColor={color} stopOpacity="0" />
      <stop offset="1" stopColor={color} stopOpacity="1" />
    </linearGradient>
  );
  const tied = knots.filter(([, , on]) => on > 0);
  return (
    <g>
      <defs>
        <clipPath id={`${id}-clip`} clipPathUnits="userSpaceOnUse">
          {rects.map((rect, index) => <rect key={index} x={n(rect.x)} y={n(rect.y)} width={n(rect.width)} height={n(rect.height)} />)}
        </clipPath>
        {/* Tied knots all hang at the run's knot line: one fade serves both. */}
        {tied.length > 0 ? fade(tie, draw.silk, tied[0]![1]) : null}
        {tied.length > 0 ? fade(tieEdge, DARK_EDGE.color, tied[0]![1]) : null}
        <DewHalo id={halo} silk={draw.silk} moonlight={draw.moonlight} />
        <DewGlass id={glass} silk={draw.silk} moonlight={draw.moonlight} />
      </defs>
      <g clipPath={paint(`${id}-clip`)}>
        {/* The ties first: the knot covers their foot. */}
        {tied.map(([x, y], index) => (
          <g key={`t${index}`} fill="none" strokeLinecap="butt">
            <path d={`M${n(x)} ${n(draw.tieTop)}L${n(x)} ${n(y)}`} stroke={paint(tieEdge)} strokeWidth={n(look[0].edge)} opacity={DARK_EDGE.opacity} />
            <path d={`M${n(x)} ${n(draw.tieTop)}L${n(x)} ${n(y)}`} stroke={paint(tie)} strokeWidth={n(look[0].width)} opacity={look[0].opacity} />
          </g>
        ))}
        <g fill="none" stroke={DARK_EDGE.color} strokeLinecap="round">
          {cross.map((d, index) => <path key={`x${index}`} d={d} strokeWidth={n(GARLAND.cross.edge)} opacity={GARLAND.cross.edgeOpacity} />)}
          {paths.map((d, thread) => <path key={`e${thread}`} d={d} strokeWidth={n(look[thread]!.edge)} opacity={look[thread]!.edgeOpacity} />).reverse()}
        </g>
        <g fill="none" stroke={draw.silk} strokeLinecap="round">
          {cross.map((d, index) => <path key={`x${index}`} d={d} strokeWidth={n(GARLAND.cross.width)} opacity={GARLAND.cross.opacity} />)}
          {paths.map((d, thread) => <path key={`s${thread}`} d={d} strokeWidth={n(look[thread]!.width)} opacity={look[thread]!.opacity} />).reverse()}
          <path d={paths[0]} stroke={draw.moonlight} strokeWidth={n(GARLAND.lit.width)} opacity={GARLAND.lit.opacity}
            transform={`translate(${n(toward.x * GARLAND.lit.shift)} ${n(toward.y * GARLAND.lit.shift)})`} />
        </g>
        {knots.map(([x, y], index) => (
          <g key={`k${index}`}>
            <circle cx={n(x)} cy={n(y)} r={n(GARLAND.knot.radius + GARLAND.knot.ring)} fill={DARK_EDGE.color} opacity={DARK_EDGE.opacity} />
            <circle cx={n(x)} cy={n(y)} r={n(GARLAND.knot.radius)} fill={draw.silk} opacity={GARLAND.knot.opacity} />
          </g>
        ))}
        {[{point: lowC, radius: DEW.bead}, ...small.map((point) => ({point, radius: GARLAND.smallBead}))].map(({point, radius}, index) => (
          <DewBead key={`d${index}`} x={point.x} y={point.y} radius={radius} scale={radius / DEW.bead} flash={draw.flash} toward={toward} halo={paint(halo)} glass={paint(glass)} />
        ))}
      </g>
    </g>
  );
};
