import {createSeededRandom, TAU} from '../../loop';

export type Point = {x: number; y: number};
/** A quadratic thread: where it starts, the point it bows toward and where it ends. */
export type Curve = {from: Point; control: Point; to: Point};

export interface WebGeometryInput {
  /** Radial threads that carry the web, fanned across `spread`. */
  spokes: number;
  /** Sticky spiral rings, denser near the rim like a real orb web. */
  rings: number;
  radius: number;
  spread: number;
  tilt: number;
  /** How deep each capture-ring cell scallops toward the hub, as a fraction of its chord. */
  sag: number;
  /** Rim crossing the snapped thread hangs from; null where only silk lies below the rim. */
  looseSpoke: number | null;
  /** Moves the middle frame radial off the corner diagonal, so the four webs never draw an X. */
  frameShift: number;
  /** The canvas relative to the resting hub, so the tear lands where it can be seen. */
  bounds: {minX: number; minY: number; maxX: number; maxY: number};
  /** Spider lines relative to the resting hub, each down to the lowest point its spider reaches. */
  draglines: {x: number; bottom: number}[];
  seed: number;
  /**
   * Whether the web carries its ageing hole (default true, as every background web does). A
   * small overlay fan leaves it out where the broken ends would hang past its edge radials.
   */
  tear?: boolean;
}

export interface WebGeometry {
  /** Radial threads; the three marked `frame` are the thick ones the web is built on. */
  spokes: {d: string; frame: boolean}[];
  rings: {d: string; depth: number}[];
  /** Broken ends hanging in the tear, kept apart from the rings so the rim stays whole. */
  tearStubs: {d: string; bead: boolean}[];
  /** A thread that snapped and hangs loose from the rim, or '' when the web has none. */
  loose: string;
  nodes: {x: number; y: number; depth: number}[];
  /** Radius of the silk sheen behind the threads, in local units. */
  sheen: number;
  /** The fan: its first radial's angle and the angle it spans, which the moonlight band sweeps. */
  tilt: number;
  spread: number;
  /** Radius of the outer ring, where every radial stops. */
  rim: number;
  /**
   * The points every thread above is drawn through, in the same order, so the breeze can
   * bend them each frame; the paths themselves keep the resting shape.
   */
  structure: {spokes: Curve[]; rings: Curve[][]; tearStubs: Curve[]; loose: Curve | null};
}

const round = (value: number) => Math.round(value * 10) / 10;
const polar = (angle: number, radius: number): [number, number] => [
  round(Math.cos(angle) * radius),
  round(Math.sin(angle) * radius),
];
/** A thread as an SVG path; the resting shape prints its already rounded points as they are. */
const pathOf = ({from, control, to}: Curve, at = ({x, y}: Point) => `${x} ${y}`) =>
  `M${at(from)} Q${at(control)} ${at(to)}`;

/**
 * Hub-centred orb web. Geometry depends only on the input, never on the frame:
 * the scene animates the group transform, the opacities and the dew instead, and
 * `flexWeb` bends these resting threads with the breeze as they are drawn.
 */
export const buildWebGeometry = ({
  spokes,
  rings,
  radius,
  spread,
  tilt,
  sag,
  looseSpoke,
  frameShift,
  bounds,
  draglines,
  seed,
  tear = true,
}: WebGeometryInput): WebGeometry => {
  const random = createSeededRandom(seed);
  // Hand-made variation has its own stream, so adding or tuning a craft draw never moves
  // the tear, fray and dew picks that `random` makes.
  const craft = createSeededRandom(seed * 7919 + 104729);
  const jitter = spread / (spokes * 2.6);
  const angles = Array.from({length: spokes}, (_, index) => {
    const step = spokes > 1 ? index / (spokes - 1) : 0.5;
    return tilt + spread * step + (random() - 0.5) * jitter;
  });
  // Below 1: the capture rings tighten toward the rim, as an orb web does.
  const radii = Array.from({length: rings}, (_, index) => {
    const step = (index + 1) / rings;
    return radius * (0.17 + 0.83 * step ** 0.86) * (1 + (random() - 0.5) * 0.05);
  });
  // The outer ring is the rim, and every radial stops exactly on it: a thread that
  // carries on past the last ring leaves a loose tip hanging in open canvas.
  const rim = radii[radii.length - 1] ?? radius;
  // The frame threads lie on real radials, so they never double a neighbouring thread.
  const frameSpokes = new Set([0, Math.floor((angles.length - 1) / 2) + frameShift, angles.length - 1]);
  const spokeCurves = angles.map((angle): Curve => {
    const [x, y] = polar(angle, rim);
    // A slight bow keeps the thread from reading as a ruler-straight line.
    const [cx, cy] = polar(angle + (random() - 0.5) * 0.03, radius * 0.5);
    return {from: {x: 0, y: 0}, control: {x: cx, y: cy}, to: {x, y}};
  });

  // One ageing hole per web, two cells wide and two rings deep, plus a little fraying
  // elsewhere: a single readable tear reads as age, a scatter of dropouts reads as a bug.
  // It only goes where all four torn segments sit well inside the canvas, with extra room
  // at the bottom for the broken ends that hang below them. The rim is never touched: it
  // caps every radial, and a gap there would leave a thread in open air.
  const inView = (ring: number, index: number) => {
    const x = (Math.cos(angles[index]!) + Math.cos(angles[index + 1]!)) * radii[ring]! / 2;
    const y = (Math.sin(angles[index]!) + Math.sin(angles[index + 1]!)) * radii[ring]! / 2;
    return x > bounds.minX + 50 && x < bounds.maxX - 50 && y > bounds.minY + 50 && y < bounds.maxY - 90;
  };
  // Broken ends hang as straight down as a spider line; beside a real one they read as a
  // tangle. So the six knots the tear frees stay 40 px to either side of every line
  // that reaches their height.
  const clearOfLines = (ring: number, index: number) => {
    const knots = [ring, ring + 1].flatMap((r) => [index, index + 1, index + 2].map((i) => polar(angles[i]!, radii[r]!)));
    const left = Math.min(...knots.map(([x]) => x)) - 40;
    const right = Math.max(...knots.map(([x]) => x)) + 40;
    const top = Math.min(...knots.map(([, y]) => y));
    return draglines.every(({x, bottom}) => top > bottom || x < left || x > right);
  };
  const candidates: [number, number][] = [];
  for (let ring = 2; ring <= rings - 3; ring++) {
    for (let index = 1; index <= angles.length - 3; index++) {
      if (inView(ring, index) && inView(ring, index + 1) && inView(ring + 1, index) && inView(ring + 1, index + 1)
        && clearOfLines(ring, index)) {
        candidates.push([ring, index]);
      }
    }
  }
  // Always two draws, whichever branch is taken, so the dew picks never move.
  const first = random();
  const second = random();
  const [tearRing, tearSpoke] = candidates.length > 0
    ? candidates[Math.floor(first * candidates.length)]!
    : [1 + Math.floor(first * Math.max(1, rings - 3)), Math.floor(second * Math.max(1, angles.length - 2))];
  // Torn segments keep both of their knots, keyed by ring and radial, so the broken
  // ends below can tell which knots already hold one.
  type Knot = {key: string; x: number; y: number};
  const torn: [Knot, Knot][] = [];
  const ringCurves = radii.map((ringRadius, ringIndex) => {
    // The rim pulls a little deeper than the capture rings: it carries the scalloped outline.
    const tension = sag * (ringIndex === rings - 1 ? 1.25 : 1);
    const segments: Curve[] = [];
    for (let index = 0; index < angles.length - 1; index++) {
      const [x1, y1] = polar(angles[index]!, ringRadius);
      const [x2, y2] = polar(angles[index + 1]!, ringRadius);
      // Each cell is pulled toward the hub by tension and down by its own weight, with a
      // little variation so no two cells match. Drawn for every cell, torn or not, so a
      // cell keeps its shape wherever the tear falls.
      const chord = Math.hypot(x2 - x1, y2 - y1);
      const pull = chord * tension * (0.88 + 0.24 * craft());
      const weight = chord * 0.025 * (0.6 + 0.8 * craft());
      const inTear = tear && ringIndex >= tearRing && ringIndex <= Math.min(tearRing + 1, rings - 2)
        && index >= tearSpoke && index <= tearSpoke + 1;
      const fray = ringIndex > 1 && random() < 0.03;
      const frayed = fray && ringIndex < rings - 1;
      if (inTear) torn.push([{key: `${ringIndex}:${index}`, x: x1, y: y1}, {key: `${ringIndex}:${index + 1}`, x: x2, y: y2}]);
      if (inTear || frayed) continue;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const length = Math.hypot(mx, my) || 1;
      const cx = round(mx - (mx / length) * 2 * pull);
      const cy = round(my - (my / length) * 2 * pull + 2 * weight);
      segments.push({from: {x: x1, y: y1}, control: {x: cx, y: cy}, to: {x: x2, y: y2}});
    }
    return segments;
  });

  // Most torn segments leave one broken end on a random side. Each end runs a short way
  // along its chord, then falls under its own weight, so it hangs almost straight down
  // instead of curling into a hook. A knot holds at most one end: two ends from the same
  // knot close into an arch. The side flips instead of redrawing, so `craft` keeps the
  // same draws in the same order.
  const holding = new Set<string>();
  const stubs = torn.flatMap(([a, b]) => {
    if (craft() >= 0.75) return [];
    let [from, to] = craft() < 0.5 ? [a, b] : [b, a];
    if (holding.has(from.key)) [from, to] = [to, from];
    holding.add(from.key);
    const {x: sx, y: sy} = from;
    const {x: ex, y: ey} = to;
    const along = 0.08 + craft() * 0.06;
    const hang = Math.hypot(ex - sx, ey - sy) * (0.3 + craft() * 0.2);
    const tip = {x: round(sx + (ex - sx) * along), y: round(sy + (ey - sy) * along + hang)};
    const cx = round(sx + (ex - sx) * along * 1.4);
    const cy = round(sy + (ey - sy) * along * 1.4 + hang * 0.35);
    return [{curve: {from: {x: sx, y: sy}, control: {x: cx, y: cy}, to: tip}, bead: craft() < 0.5}];
  });

  // Dew scatters: a modular filter would line the beads up in diagonal chains.
  const nodes = radii.flatMap((ringRadius, ringIndex) =>
    angles.flatMap((angle) => {
      if (random() >= 0.24) return [];
      const [x, y] = polar(angle, ringRadius);
      return [{x, y, depth: (ringIndex + 1) / rings}];
    }),
  );

  // One snapped thread, from a fixed rim crossing that hangs over open air, clear of the
  // spider lines. It falls in a single curve and ends on its bead: a hook at the tip
  // would argue with the bead's weight. Both draws happen even without the thread.
  const drop = radius * (0.14 + random() * 0.09);
  const drift = radius * 0.04 * (random() - 0.5);
  const looseAngle = looseSpoke === null ? undefined : angles[looseSpoke];
  const [lx, ly] = polar(looseAngle ?? 0, rim);
  const looseCurve = looseAngle === undefined ? null : {
    from: {x: lx, y: ly},
    control: {x: round(lx + drift * 0.7), y: round(ly + drop * 0.6)},
    to: {x: round(lx + drift * 1.4), y: round(ly + drop)},
  };

  return {
    spokes: spokeCurves.map((curve, index) => ({d: pathOf(curve), frame: frameSpokes.has(index)})),
    rings: ringCurves.map((segments, index) => ({d: segments.map((curve) => pathOf(curve)).join(''), depth: (index + 1) / rings})),
    tearStubs: stubs.map(({curve, bead}) => ({d: pathOf(curve), bead})),
    loose: looseCurve ? pathOf(looseCurve) : '',
    nodes,
    // A full disc, not a sector: the gradient fades to nothing before any edge shows.
    sheen: round(rim * 1.04),
    tilt,
    spread,
    rim,
    structure: {spokes: spokeCurves, rings: ringCurves, tearStubs: stubs.map(({curve}) => curve), loose: looseCurve},
  };
};

const unit = ({x, y}: Point): Point => {
  const length = Math.hypot(x, y) || 1;
  return {x: x / length, y: y / length};
};
const shift = ({x, y}: Point, by: number, down = 0) => `translate(${(x * by).toFixed(2)} ${(y * by + down).toFixed(2)})`;
/** An angle folded into [−π, π]. */
export const wrapAngle = (angle: number) => angle - TAU * Math.round(angle / TAU);

/** Where the breeze blows in the frame: to the right, lifting a little as a draught does along a wall. */
const DOWNWIND = unit({x: 1, y: -0.15});

/**
 * Where a point of a web sits when the breeze bends it by `billow`. The sheet is held at
 * the hub and along its two edge radials, so it gives most at mid-rim. It slides along
 * the rings, never across them, and only as far as the wind runs along each one, so all
 * four webs bow downwind together without pushing their rims toward the content area; any
 * gust also draws the sheet in toward the hub. The pull takes a smooth magnitude of the
 * wind, never its absolute value, which would kink every time the wind turns.
 */
export const flexPoint = (
  {tilt, spread, rim}: Pick<WebGeometry, 'tilt' | 'spread' | 'rim'>, {x, y}: Point, billow: number,
  /** Scales the slide (24 px) and the pull (7.2 px), tuned for ~600 px webs; a small overlay fan passes far less. */
  amplitude = 1,
): Point => {
  const angle = Math.atan2(y, x);
  const across = Math.min(1, Math.max(0, wrapAngle(angle - tilt) / spread));
  const give = Math.sin(Math.PI * across) ** 1.3 * Math.min(1, Math.hypot(x, y) / rim) ** 1.6;
  const along = {x: -Math.sin(angle), y: Math.cos(angle)};
  const slide = 24 * amplitude * billow * give * (along.x * DOWNWIND.x + along.y * DOWNWIND.y);
  const pull = -7.2 * amplitude * give * (Math.sqrt(billow ** 2 + 0.0025) - 0.05);
  return {x: x + along.x * slide + Math.cos(angle) * pull, y: y + along.y * slide + Math.sin(angle) * pull};
};

/** The threads as OrbWeb draws them, with the free ends where their beads hang. */
export type WebThreads = Pick<WebGeometry, 'spokes' | 'rings' | 'loose'> & {
  tearStubs: {d: string; tip: Point; bead: boolean}[];
  /** Where the snapped thread ends, so a bead can finish it instead of a bare stub. */
  looseTip: Point | null;
};

/** How many straight segments draw a bent radial; fixed, so the markup keeps its shape on every frame. */
export const SPOKE_SEGMENTS = 12;

/**
 * The web's threads as the breeze bends them. Only these carry the tips: a bead placed from
 * the resting geometry would part from its thread at every gust. The sheet bends point by
 * point; a broken end or the snapped thread hangs free from its knot, so it keeps its shape
 * and follows the knot, bead included. Radials are drawn as polylines: their control point
 * moves every frame, and Chrome flattens a moving quadratic into different segments from one
 * frame to the next, so a long radial would jump a pixel at a time.
 */
export const flexWeb = (geometry: WebGeometry, billow: number, amplitude = 1): WebThreads => {
  const {structure} = geometry;
  const bend = (point: Point) => flexPoint(geometry, point, billow, amplitude);
  const at = ({x, y}: Point) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const print = (curve: Curve) => pathOf(curve, at);
  // A thread of the sheet bends through its own bent midpoint: its control point lies off
  // the thread, where the field differs, and bending that instead would pull a radial off
  // the knots the rings meet it at.
  const bendCurve = ({from, control, to}: Curve): Curve => {
    const [start, end] = [bend(from), bend(to)];
    const middle = bend({x: (from.x + 2 * control.x + to.x) / 4, y: (from.y + 2 * control.y + to.y) / 4});
    return {from: start, control: {x: 2 * middle.x - (start.x + end.x) / 2, y: 2 * middle.y - (start.y + end.y) / 2}, to: end};
  };
  const sheet = (curve: Curve) => print(bendCurve(curve));
  // Sampled from the same bent quadratic, ends included, so it meets the hub and the rim exactly.
  const radial = (curve: Curve) => {
    const {from, control, to} = bendCurve(curve);
    const points = Array.from({length: SPOKE_SEGMENTS + 1}, (_, k) => {
      const t = k / SPOKE_SEGMENTS;
      const u = 1 - t;
      return at({x: u * u * from.x + 2 * u * t * control.x + t * t * to.x, y: u * u * from.y + 2 * u * t * control.y + t * t * to.y});
    });
    return `M${points[0]} L${points.slice(1).join(' ')}`;
  };
  const hangFrom = ({from}: Curve) => {
    const knot = bend(from);
    return (point: Point) => ({x: point.x + knot.x - from.x, y: point.y + knot.y - from.y});
  };
  const draw = ({from, control, to}: Curve, move: (point: Point) => Point) => print({from: move(from), control: move(control), to: move(to)});
  const loose = structure.loose && {curve: structure.loose, move: hangFrom(structure.loose)};
  return {
    spokes: geometry.spokes.map(({frame}, index) => ({d: radial(structure.spokes[index]!), frame})),
    rings: geometry.rings.map(({depth}, index) => ({d: structure.rings[index]!.map(sheet).join(''), depth})),
    tearStubs: geometry.tearStubs.map(({bead}, index) => {
      const curve = structure.tearStubs[index]!;
      const move = hangFrom(curve);
      return {d: draw(curve, move), tip: move(curve.to), bead};
    }),
    loose: loose ? draw(loose.curve, loose.move) : '',
    looseTip: loose ? loose.move(loose.curve.to) : null,
  };
};

export interface TipBeadProps extends Point {
  /** Unit direction toward the moon, in the same units as the bead: the glint sits on that side. */
  light: Point;
  size?: number;
  opacity: number;
  moonlight: string;
  /** Fill of the soft glow around the drop. */
  halo: string;
}

/** How far a tip bead draws from its centre at size 1: the halo, wider than the drop itself. */
export const TIP_BEAD_REACH = 6.5;

/** A drop gathered at a thread's free end: heavier below, with a dark underside and a glint facing the moon. */
export const TipBead = ({x, y, light, size = 1, opacity, moonlight, halo}: TipBeadProps) => (
  <g opacity={opacity} stroke="none">
    <circle cx={x} cy={y} r={TIP_BEAD_REACH * size} fill={halo} />
    <ellipse cx={x + 0.8 * size} cy={y + 0.8 * size} rx={2.1 * size} ry={2.7 * size} fill="#0A0814" opacity="0.25" />
    <ellipse cx={x} cy={y} rx={1.9 * size} ry={2.5 * size} fill={moonlight} opacity="0.75" />
    <circle cx={x + light.x * 0.9 * size} cy={y + light.y * 1.2 * size} r={0.7 * size} fill="#FFFFFF" opacity="0.9" />
  </g>
);

export interface OrbWebProps {
  geometry: WebGeometry;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  /** How strongly the moonlight catches the silk, 0 to 1. */
  glow: number;
  /** Where the moonlight band sits across the fan: 0 on the first radial, 1 on the last. */
  glint: number;
  /** How far the breeze bends the sheet this frame; see `flexPoint`. */
  billow: number;
  silk: string;
  moonlight: string;
  /** The ember's colour, for the warm rim on the web it reaches. */
  accent: string;
  /** The one light source, in frame coordinates. */
  moon: Point;
  /** The low ember, in frame coordinates, on the web it rims; null on the others. */
  warm: Point | null;
  /** A soft dark edge under every thread, for transparent exports over light footage. */
  outline: boolean;
  /** Fill of the glow around the beads at thread ends, shared with the dew. */
  beadHalo: string;
  id: string;
}

export const OrbWeb = ({
  geometry,
  x,
  y,
  scale,
  rotation,
  opacity,
  glow,
  glint,
  billow,
  silk,
  moonlight,
  accent,
  moon,
  warm,
  outline,
  beadHalo,
  id,
}: OrbWebProps) => {
  // Lights are placed in frame coordinates; the threads live in the web's own units.
  const radians = -rotation * Math.PI / 180;
  const toLocal = (point: Point): Point => {
    const dx = (point.x - x) / scale;
    const dy = (point.y - y) / scale;
    return {x: dx * Math.cos(radians) - dy * Math.sin(radians), y: dx * Math.sin(radians) + dy * Math.cos(radians)};
  };
  // Every pass below draws these same bent threads, so the lit edges, shadows and beads never part from the silk.
  const threads = flexWeb(geometry, billow);
  const localMoon = toLocal(moon);
  const localEmber = warm ? toLocal(warm) : null;
  const towardMoon = unit(localMoon);
  const lastRing = threads.rings.length - 1;
  const ringWidth = (depth: number, index: number) => (index === lastRing ? 1.7 : 0.95 + depth * 0.35);
  const spokeWidth = (frame: boolean) => (frame ? 2.1 : 1.35);
  // Beads sit on top of every pass, with their own opacity: the thread's faintness is not the drop's.
  const beadOpacity = 0.45 + glow * 0.4;
  const glintToward = (tip: Point) => unit({x: localMoon.x - tip.x, y: localMoon.y - tip.y});
  // The band is a pool of moonlight partway out along the fan; it slides from radial to
  // radial with `glint`, and past the fan's edges at both ends of its sweep.
  const band = geometry.tilt + geometry.spread * glint;
  const catchLight = 0.75 + glow * 0.25;

  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`} opacity={opacity}>
      <defs>
        <radialGradient id={`${id}-sheen`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={geometry.sheen}>
          <stop offset="0" stopColor={moonlight} stopOpacity="0.075" />
          <stop offset="0.45" stopColor={silk} stopOpacity="0.032" />
          <stop offset="1" stopColor={silk} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-moonlit`} gradientUnits="userSpaceOnUse" cx={localMoon.x} cy={localMoon.y} r={1000 / scale}>
          <stop offset="0" stopColor={moonlight} stopOpacity="0.55" />
          <stop offset="0.4" stopColor={moonlight} stopOpacity="0.2" />
          <stop offset="1" stopColor={moonlight} stopOpacity="0" />
        </radialGradient>
        {/* Faded, not gone, outside the pool: every thread keeps a dim lit edge. */}
        <radialGradient id={`${id}-glint`} gradientUnits="userSpaceOnUse" r={(geometry.rim * 0.35).toFixed(1)}
          cx={(Math.cos(band) * geometry.rim * 0.62).toFixed(1)} cy={(Math.sin(band) * geometry.rim * 0.62).toFixed(1)}>
          <stop offset="0" stopColor={moonlight} stopOpacity="1" />
          <stop offset="0.45" stopColor={moonlight} stopOpacity="0.4" />
          <stop offset="1" stopColor={moonlight} stopOpacity="0.15" />
        </radialGradient>
        {localEmber && (
          <radialGradient id={`${id}-ember`} gradientUnits="userSpaceOnUse" cx={localEmber.x} cy={localEmber.y} r={720 / scale}>
            <stop offset="0" stopColor={accent} stopOpacity="1" />
            <stop offset="0.45" stopColor={accent} stopOpacity="0.4" />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        )}
      </defs>

      <circle r={geometry.sheen} fill={`url(#${id}-sheen)`} />
      {/* Transparent exports only: on the night sky this edge would just dull the silk. */}
      {outline && (
        <g fill="none" stroke="#120C1C" strokeLinecap="round" opacity="0.2">
          {threads.rings.map(({d, depth}, index) => (
            <path key={index} d={d} strokeWidth={3.4 + depth * 0.7} />
          ))}
          {threads.spokes.map(({d, frame}, index) => (
            <path key={index} d={d} strokeWidth={frame ? 4.6 : 3.6} />
          ))}
          {threads.loose && <path d={threads.loose} strokeWidth="3.4" />}
          {threads.tearStubs.map(({d}, index) => (
            <path key={index} d={d} strokeWidth="3.2" />
          ))}
        </g>
      )}
      {/* A soft dark underline, cast away from the moon: invisible on night sky, it keeps
          pale silk legible when a transparent export is composited over a light background. */}
      <g transform={shift(towardMoon, -1.3, 0.6)} fill="none" stroke="#17121F" strokeLinecap="round">
        {threads.rings.map(({d, depth}, index) => (
          <path key={index} d={d} strokeWidth={1.2 + depth * 0.7} opacity="0.17" />
        ))}
        {threads.spokes.map(({d, frame}, index) => (
          <path key={index} d={d} strokeWidth={frame ? 2.9 : 1.7} opacity="0.16" />
        ))}
        {threads.loose && <path d={threads.loose} strokeWidth="1.7" opacity="0.15" />}
        {threads.tearStubs.map(({d}, index) => (
          <path key={index} d={d} strokeWidth="1.5" opacity="0.15" />
        ))}
      </g>
      {/* Weight follows structure: the rim and frame radials carry the web, the plain
          radials come next, and the capture spiral is the finest thread of all. */}
      <g fill="none" strokeLinecap="round">
        {threads.spokes.map(({d, frame}, index) => (
          <path key={index} d={d} stroke={silk} strokeWidth={spokeWidth(frame)} opacity={frame ? 0.5 : 0.42} />
        ))}
        {threads.rings.map(({d, depth}, index) => (
          <path key={index} d={d} stroke={silk} strokeWidth={ringWidth(depth, index)}
            opacity={index === lastRing ? 0.5 : 0.24 + depth * 0.12} />
        ))}
        {threads.loose && <path d={threads.loose} stroke={silk} strokeWidth="1.3" opacity="0.38" />}
        {threads.tearStubs.map(({d}, index) => (
          <path key={index} d={d} stroke={silk} strokeWidth="1.1" opacity="0.36" />
        ))}
        {/* Moonlight added on top of the flat silk, never multiplied into it: the silk
            nearest the moon brightens and the far webs keep their full value. */}
        <g stroke={`url(#${id}-moonlit)`}>
          {threads.spokes.map(({d, frame}, index) => (
            <path key={index} d={d} strokeWidth={spokeWidth(frame)} />
          ))}
          {threads.rings.map(({d, depth}, index) => (
            <path key={index} d={d} strokeWidth={ringWidth(depth, index)} />
          ))}
          {threads.loose && <path d={threads.loose} strokeWidth="1.3" />}
          {threads.tearStubs.map(({d}, index) => (
            <path key={index} d={d} strokeWidth="1.1" />
          ))}
        </g>
        {/* Offset rim-light pass on the side facing the moon: the lit edge of each thread,
            never a full redraw. It is brightest where the travelling band crosses the silk;
            any fainter and the band vanishes under the moonlit pass. */}
        <g transform={shift(towardMoon, 1.1)} stroke={`url(#${id}-glint)`} strokeWidth="1.2">
          {threads.rings.map(({d, depth}, index) => (
            <path key={index} d={d} opacity={(0.45 + depth * 0.38) * catchLight} />
          ))}
          {threads.spokes.map(({d}, index) => (
            <path key={index} d={d} opacity={0.45 * catchLight} />
          ))}
          {threads.loose && <path d={threads.loose} opacity={0.52 * catchLight} />}
        </g>
        {/* The ember lights the web it reaches from below: a warm edge on the side facing it. */}
        {localEmber && (
          <g transform={shift(unit(localEmber), 1.1)} stroke={`url(#${id}-ember)`} strokeWidth="1" opacity="0.7">
            {[...threads.rings, ...threads.spokes, ...threads.tearStubs].map(({d}, index) => (
              <path key={index} d={d} />
            ))}
            {threads.loose && <path d={threads.loose} />}
          </g>
        )}
      </g>
      {threads.tearStubs.filter(({bead}) => bead).map(({tip}, index) => (
        <TipBead key={index} {...tip} light={glintToward(tip)} size={0.7} opacity={beadOpacity}
          moonlight={moonlight} halo={beadHalo} />
      ))}
      {/* A bead finishes the snapped thread, the way the hanging filaments end. */}
      {threads.looseTip && (
        <TipBead {...threads.looseTip} light={glintToward(threads.looseTip)} opacity={beadOpacity}
          moonlight={moonlight} halo={beadHalo} />
      )}
    </g>
  );
};

export interface SpiderProps {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** Leg reach, 0 tucked to 1 stretched. */
  legCurl: number;
  /** The gait as a sine and cosine scaled by the stride: the legs read its angle, never a raw phase. */
  stepSin: number;
  stepCos: number;
  /** Moonlight on the body, 0 to 1. */
  glow: number;
  /** Direction of the moon from where the spider hangs, in frame radians: the body turns, the light does not. */
  light: number;
  opacity: number;
  /** Silk line the spider hangs from, in local units above the body. */
  thread: number;
  /** Where that line is tied, in frame coordinates: the body swings, the knot does not. */
  anchorX: number;
  silk: string;
  moonlight: string;
  body: string;
  mark: string;
  id: string;
  /**
   * The thinnest a leg segment (and its moonlit edge) may draw, in frame px. Undefined keeps the
   * drawn widths (LEG_WIDTHS × scale); a small overlay spider (scale 0.3) passes about 1.2 so its
   * tarsi do not vanish.
   */
  minLegWidth?: number;
}

type Joint = [number, number];

/** Right-hand legs I to IV of a spider hanging head up: hip, knee, ankle and tip. The left side mirrors them. */
const LEGS: Joint[][] = [
  [[5, 0], [26, -20], [47, -8], [53, 4]],
  [[6, 2], [31, -9], [52, 6], [58, 19]],
  [[6, 5], [29, 6], [46, 22], [50, 33]],
  [[5, 7.5], [22, 17], [34, 33], [39, 45]],
];
/** Femur, tibia and tarsus: each segment thinner than the one it hangs from. */
export const LEG_WIDTHS = [3.3, 2.4, 1.5];
/** The moonlit edge under each leg: this much wider than the leg, nudged this far toward the moon. */
export const LEG_HALO = {grow: 1.3, shift: 0.7};
const DEG = Math.PI / 180;

/**
 * Every leg's hip, knee, ankle and tip, in the spider's own units. Reach stretches the
 * legs; the gait swings each one about its hip and bends it at the knee.
 */
export const spiderLegs = (curl: number, stepSin: number, stepCos: number): Joint[][] => {
  const reach = 0.9 + 0.2 * Math.min(1, Math.max(0, curl));
  const gait = Math.atan2(stepSin, stepCos);
  const stride = Math.hypot(stepSin, stepCos);
  return LEGS.flatMap((joints, index) => [1, -1].map((side) => {
    // Alternating tetrapod: I and III on one side step together with II and IV on the other.
    const phase = gait + index * Math.PI + (side > 0 ? 0 : Math.PI);
    // The back pair pushes while the front pair reaches.
    const sense = index < 2 ? stride : -stride;
    const flex = Math.sin(phase) * 7 * DEG * sense;
    const knee = Math.sin(phase + 0.9) * 9 * DEG * sense;
    // The two halves never match exactly; a perfect mirror reads as a stamp.
    const length = side > 0 ? reach : reach * 0.93;
    const points: Joint[] = [joints[0]!];
    [flex, flex + knee, flex + knee * 1.4].forEach((turn, segment) => {
      const [x0, y0] = joints[segment]!;
      const [x1, y1] = joints[segment + 1]!;
      const [px, py] = points[segment]!;
      const dx = (x1 - x0) * length;
      const dy = (y1 - y0) * length;
      points.push([px + dx * Math.cos(turn) - dy * Math.sin(turn), py + dx * Math.sin(turn) + dy * Math.cos(turn)]);
    });
    return points.map(([px, py]): Joint => [side * px, py]);
  }));
};

/**
 * How far a spider draws around its tie point at scale 1, at any reach and stride, leg
 * strokes and halo included. A stepping leg straightens, so it reaches past its rest pose.
 */
export const SPIDER_REACH = {side: 72, top: 28, bottom: 57};

/** Hangs head up from a single thread tied between its eyes, at (0, 0). */
export const Spider = ({
  x,
  y,
  scale,
  rotation,
  legCurl,
  stepSin,
  stepCos,
  glow,
  light,
  opacity,
  thread,
  anchorX,
  silk,
  moonlight,
  body,
  mark,
  id,
  minLegWidth,
}: SpiderProps) => {
  const lit = Math.min(1, Math.max(0, glow));
  // The moon stays put in the frame while the body turns under it.
  const angle = light - rotation * DEG;
  const lx = Math.cos(angle);
  const ly = Math.sin(angle);
  // Which side faces the moon, from the frame angle, so nothing flips as the body sways.
  const moonSide = Math.cos(light) < 0 ? -1 : 1;
  const legs = spiderLegs(legCurl, stepSin, stepCos);
  // In the spider's own units (the group scales them): a floor in frame px is minLegWidth / scale.
  const floor = minLegWidth === undefined ? 0 : minLegWidth / scale;
  const segments = (grow: number) => legs.flatMap((points, leg) => LEG_WIDTHS.map((width, segment) => (
    <path key={`${leg}-${segment}`} d={`M${points[segment]!.join(' ')} L${points[segment + 1]!.join(' ')}`}
      strokeWidth={minLegWidth === undefined ? width + grow : Math.max(width, floor) + grow} />
  )));
  const line = `M${anchorX - x} ${-thread} L0 0`;
  // A small, sharp specular on the abdomen's moonlit shoulder.
  const shine = {x: lx * 10, y: 29 + ly * 10.5};

  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      {/* A dark underline on the side away from the moon keeps the line visible over light footage. */}
      <path d={line} stroke="#17121F" strokeWidth="1.8" opacity="0.2" fill="none" transform={`translate(${-1.2 * moonSide} 0)`} />
      <path d={line} stroke={silk} strokeWidth="1.5" opacity="0.5" fill="none" />
      <path d={line} stroke={moonlight} strokeWidth="0.6" opacity="0.22" fill="none" />
      <g transform={`rotate(${rotation}) scale(${scale})`}>
        <defs>
          {/* Opaque all the way through: a translucent belly lets footage show through a transparent export. */}
          <radialGradient id={`${id}-abdomen`} cx={`${50 + lx * 22}%`} cy={`${50 + ly * 26}%`} r="78%">
            <stop offset="0" stopColor="#3A2F4A" />
            <stop offset="0.42" stopColor={body} />
            <stop offset="1" stopColor="#07060C" />
          </radialGradient>
        </defs>

        {/* Every leg twice: a moonlit edge nudged toward the moon, then the dark leg on top.
            On night sky the edge outlines all eight legs; over light footage the dark leg carries the shape. */}
        <g fill="none" stroke={moonlight} strokeLinecap="round" opacity={0.2 + lit * 0.16}
          transform={`translate(${lx * LEG_HALO.shift} ${ly * LEG_HALO.shift})`}>
          {segments(LEG_HALO.grow)}
        </g>
        <g fill="none" stroke={body} strokeLinecap="round">{segments(0)}</g>
        <g fill={moonlight} opacity={0.3 + lit * 0.2}>
          {legs.map(([, [kx, ky]], leg) => <circle key={leg} cx={kx + lx * 0.6} cy={ky + ly * 0.6} r="0.8" />)}
        </g>

        {/* The rim: a moonlit ellipse that the abdomen, drawn over it, leaves showing as a crescent. */}
        <ellipse cx={lx * 1.1} cy={29 + ly * 1.1} rx="16.5" ry="17.5" fill={moonlight} opacity={0.3 + lit * 0.25} />
        <ellipse cx="0" cy="29" rx="16.5" ry="17.5" fill={`url(#${id}-abdomen)`} />
        {/* Two triangles nearly touching at a pinched waist: the hourglass reads even at small sizes. */}
        <path d="M-4.6 19.5 L4.6 19.5 L0.5 26.4 L-0.5 26.4Z M-0.5 27.4 L0.5 27.4 L5 35 L-5 35Z" fill={mark} opacity="0.9" />
        <path d="M1.2 20.3 L3.5 20.3 L2.6 21.7Z" fill="#FFF3D8" opacity="0.45" transform={`scale(${moonSide} 1)`} />
        <ellipse cx={shine.x} cy={shine.y} rx="3.4" ry="1.9" fill={moonlight} opacity={0.2 + lit * 0.25}
          transform={`rotate(${(angle / DEG + 90).toFixed(2)} ${shine.x} ${shine.y})`} />
        <circle cx={shine.x} cy={shine.y} r="0.9" fill={moonlight} opacity={0.5 + lit * 0.3} />

        {/* A narrow waist between abdomen and head, so the body never reads as a snowman. The
            head gets a fainter rim of its own: without it, it vanishes against the night sky. */}
        <ellipse cx="0" cy="11" rx="2.4" ry="2" fill={body} />
        <ellipse cx={lx * 0.9} cy={2 + ly * 0.9} rx="9.5" ry="8" fill={moonlight} opacity={0.18 + lit * 0.14} />
        <ellipse cx="0" cy="2" rx="9.5" ry="8" fill={body} />
        <g fill="none" stroke={body} strokeWidth="1.6" strokeLinecap="round">
          <path d="M3 -5 Q6.5 -8 5.5 -11.5" />
          <path d="M-3 -5 Q-6.5 -8 -5.5 -11.5" />
        </g>
        <circle cx="-3.2" cy="-0.6" r="1.6" fill={moonlight} opacity="0.75" />
        <circle cx="3.2" cy="-0.6" r="1.6" fill={moonlight} opacity="0.75" />
      </g>
    </g>
  );
};
