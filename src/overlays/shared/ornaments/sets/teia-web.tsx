import type {ReactNode} from 'react';
import {
  buildWebGeometry, flexPoint, flexWeb, TIP_BEAD_REACH, TipBead, wrapAngle, type Point, type WebGeometry,
  type WebThreads as FlexedThreads,
} from '../../../../backgrounds/halloween/CobwebArtwork';
import {createSeededRandom} from '../../../../loop';
import {svgNumber} from '../../geometry';
import {paint} from '../draw';
import {FAN_MARGIN, FAN_REACH, FAN_SPREAD, fanJitter, sectorDistance} from './teia-fan';

/**
 * The teia web: the background's orb web (buildWebGeometry, the same seeded threads, sag, tear
 * and broken ends) at its pixel radius, scale 1, drawn with the passes of the background's OrbWeb
 * (dark outline, shadow away from the moon, flat silk weighted by structure, additive moonlight,
 * the travelling glint on the lit edge) plus its dew and tip beads. The fan's pieces (teia-fan.ts)
 * only fit it into the corner: the first piece draws the whole web once, clipped to the union of
 * the fan's cells, and the other pieces draw nothing.
 *
 * Differences from OrbWeb, all for a 12–170 px fan over footage: no sheen disc (a full disc would
 * leave the fan's envelope), the breeze bends the sheet by a few px (FLEX_PER_PX), the dark
 * outline is always on and stronger (DARK_EDGE: overlays are composited over unknown footage), the ember light is a separate soft
 * radial (teia.tsx) instead of a 1 px amber rim, and dew is at most ten beads on the knots
 * well inside the fan.
 */

/**
 * Flat silk opacities: the frame radials and the rim carry the web and stay ≥ 0.85 (over light
 * footage they, with the dark edge, draw the fan's shape), then the radials, then the capture spiral.
 */
const SILK = {frame: 0.88, rim: 0.86, spoke: 0.55, ring: 0.3, ringDepth: 0.16} as const;
/** Frame radials, plain radials, rim, capture rings: the background's widths in px (OrbWeb). */
const WIDTH = {frame: 2.1, spoke: 1.35, rim: 1.7, ring: 0.95, ringDepth: 0.35, stub: 1.1};
/**
 * Small webs thin their strokes (silk, dark outline, shadow) so the rings still read between the
 * radials: × 0.8 at 10 px, × 0.9 at 15, full width from 20 px. Widths only shrink, so the
 * envelope (webExcess, measured at full width) still holds them.
 */
export const webThinning = (radius: number) => Math.min(1, 0.6 + radius / 50);
/** The shadow's offset away from the moon and down (the background's 1.3 and 0.6, trimmed so the fan's envelope stays at FAN_MARGIN). */
const SHADOW = {away: 1, down: 0.4};
/** The lit edge's offset toward the moon (OrbWeb's 1.1). */
const LIT_SHIFT = 1.1;
/** The breeze's slide per px of web radius (the background slides 24 px on ~600 px webs: 4 %). */
export const FLEX_PER_PX = 1 / 600;
/**
 * The dark edge under every thread (and every garland and broken end) over unknown footage: `grow` px wider
 * than the silk it outlines. Stronger than the background's (#120C1C @0.2, tuned for its dark sky):
 * over light footage it is what keeps pale silk readable; over dark footage it does not show.
 */
export const DARK_EDGE = {color: '#120C1C', opacity: 0.45, grow: 1.6} as const;
/** The soft dark underline cast away from the moon. */
const SHADOW_OPACITY = 0.3;
/**
 * A dew bead, in px: glass radius (smaller on webs under `small` px), its growth while the
 * moonlight band crosses it, its soft halo at rest and flashing, the specular dot and the dark
 * underside cast away from the moon (so it reads over light footage too).
 */
export const DEW = {bead: 2.8, smallBead: 2.4, small: 40, flash: 0.25, halo: 5.6, haloFlash: 7, spark: 0.9, under: 0.8, rest: 0.75} as const;
/** Dew beads on a web: one per 9 px of radius, at most 10, on knots between these fractions of the radius. */
export const dewCount = (radius: number) => Math.min(10, Math.round(radius / 9));
export const DEW_BAND = {from: 0.35, to: 0.85} as const;
/** How far inside the fan's sector a bead's knot must sit: its flashing halo stays inside the envelope, with slack for the breeze. */
const DEW_INSET = DEW.haloFlash - FAN_MARGIN + 0.6;

/** Tip beads on the broken ends: the background's TipBead at this size (halo TIP_BEAD_REACH·size px). */
export const TIP_BEAD_SIZE = 0.55;
export const TIP_BEAD_HALO = TIP_BEAD_REACH * TIP_BEAD_SIZE;

/** What a web needs to be rebuilt anywhere (all numbers: elements are flat). */
export type WebSpec = {
  radius: number;
  spokes: number;
  rings: number;
  /** 1: the ageing hole with its broken ends; 0: whole. */
  tear: number;
  seed: number;
  /** The angle the fan opens around (inwards from its corner). */
  bisector: number;
  /** How many dew beads it carries (0–6). */
  dew: number;
};

const specKey = (spec: WebSpec) => `${spec.radius}|${spec.spokes}|${spec.rings}|${spec.tear}|${spec.seed}|${spec.bisector}|${spec.dew}`;

const GEOMETRY_LIMIT = 64;
const geometryCache = new Map<string, WebGeometry>();

/** The seeded web of a spec, memoised (placement never changes it; only the breeze bends it). */
export const webGeometry = (spec: WebSpec): WebGeometry => {
  const key = specKey(spec);
  const cached = geometryCache.get(key);
  if (cached) return cached;
  const geometry = buildWebGeometry({
    spokes: spec.spokes,
    rings: spec.rings,
    radius: spec.radius,
    spread: FAN_SPREAD,
    tilt: spec.bisector - FAN_SPREAD / 2,
    sag: 0.24,
    looseSpoke: null,
    frameShift: 0,
    // Placed by its hub: the tear may fall anywhere inside the fan.
    bounds: {minX: -1e4, minY: -1e4, maxX: 1e4, maxY: 1e4},
    draglines: [],
    seed: spec.seed,
    tear: spec.tear > 0,
  });
  if (geometryCache.size >= GEOMETRY_LIMIT) geometryCache.delete(geometryCache.keys().next().value!);
  geometryCache.set(key, geometry);
  return geometry;
};

/** Where the glass gradient and the specular put their light before a bead is turned to face the moon (degrees). */
const BEAD_LIGHT = Math.atan2(-0.4, 0.35) * 180 / Math.PI;

export type Bead = {x: number; y: number; depth: number; across: number};

/** The background's bent threads (flexWeb: radials, one path per ring, broken ends) and the web's dew this frame. */
export type WebThreads = FlexedThreads & {dew: Bead[]};

/**
 * The knots dew may gather on: where a ring meets a radial, between DEW_BAND of the radius out
 * from the hub and DEW_INSET px inside the fan's sector (so a flashing halo never leaves the
 * envelope), in a fixed order (ring by ring, first radial first).
 */
const dewKnots = (geometry: WebGeometry, spec: WebSpec): {point: Point; depth: number}[] => {
  const rings = geometry.structure.rings;
  const half = FAN_SPREAD / 2 + fanJitter(spec.radius);
  const knots: {point: Point; depth: number}[] = [];
  const seen = new Set<string>();
  rings.forEach((segments, ring) => {
    for (const segment of segments) {
      for (const point of [segment.from, segment.to]) {
        const key = `${point.x.toFixed(3)}|${point.y.toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const r = Math.hypot(point.x, point.y);
        if (r < DEW_BAND.from * spec.radius || r > DEW_BAND.to * spec.radius) continue;
        if (-sectorDistance(r, Math.atan2(point.y, point.x) - spec.bisector, half, FAN_REACH * spec.radius) < DEW_INSET) continue;
        knots.push({point, depth: (ring + 1) / spec.rings});
      }
    }
  });
  return knots;
};

const DEW_LIMIT = 64;
const dewCache = new Map<string, {point: Point; depth: number; nudge: number}[]>();

/** The web's dew: `spec.dew` knots picked by its own seed stream, fixed for the web. */
const dewOf = (geometry: WebGeometry, spec: WebSpec) => {
  const key = specKey(spec);
  const cached = dewCache.get(key);
  if (cached) return cached;
  const random = createSeededRandom(spec.seed * 31 + 977);
  const pool = dewKnots(geometry, spec);
  const picked: {point: Point; depth: number; nudge: number}[] = [];
  for (let index = 0; index < spec.dew && pool.length > 0; index++) {
    const [knot] = pool.splice(Math.floor(random() * pool.length), 1);
    picked.push({...knot!, nudge: random() - 0.5});
  }
  if (dewCache.size >= DEW_LIMIT) dewCache.delete(dewCache.keys().next().value!);
  dewCache.set(key, picked);
  return picked;
};

const THREADS_LIMIT = 48;
const threadsCache = new Map<string, WebThreads>();

/**
 * The web's threads as the breeze bends them this frame, in the hub's frame, memoised per web and
 * breeze: the background's flexWeb with the slide scaled to the web (FLEX_PER_PX), and the dew's
 * knots bent by the same field.
 */
export const webThreads = (spec: WebSpec, billow: number): WebThreads => {
  const key = `${specKey(spec)}|${billow}`;
  const cached = threadsCache.get(key);
  if (cached) return cached;
  const geometry = webGeometry(spec);
  const amplitude = spec.radius * FLEX_PER_PX;
  const tilt = spec.bisector - FAN_SPREAD / 2;
  const dew = dewOf(geometry, spec).map(({point, depth, nudge}) => {
    const bent = flexPoint(geometry, point, billow, amplitude);
    return {x: bent.x, y: bent.y, depth, across: wrapAngle(Math.atan2(point.y, point.x) - tilt) / FAN_SPREAD + nudge * 0.3};
  });
  const threads = {...flexWeb(geometry, billow, amplitude), dew};
  if (threadsCache.size >= THREADS_LIMIT) threadsCache.delete(threadsCache.keys().next().value!);
  threadsCache.set(key, threads);
  return threads;
};

/** The fan's lighting and motion this frame. */
export type WebLook = {
  rotation: number;
  breath: number;
  opacity: number;
  glow: number;
  glint: number;
  billow: number;
  /** The one light (the moon), in frame coordinates. */
  moonX: number;
  moonY: number;
  silk: string;
  moonlight: string;
};

/** The dew's soft halo gradient (moonlight core fading through the silk colour). */
export const DewHalo = ({id, silk, moonlight}: {id: string; silk: string; moonlight: string}) => (
  <radialGradient id={id}>
    <stop offset="0" stopColor={moonlight} stopOpacity="0.55" />
    <stop offset="0.45" stopColor={silk} stopOpacity="0.22" />
    <stop offset="1" stopColor={silk} stopOpacity="0" />
  </radialGradient>
);

/** Glass: bright where the moon enters, darker through the middle, a refracted rim (the background's bead). */
export const DewGlass = ({id, silk, moonlight}: {id: string; silk: string; moonlight: string}) => (
  <radialGradient id={id} cx="50%" cy="50%" r="50%" fx="68%" fy="30%">
    <stop offset="0" stopColor="#FFFFFF" />
    <stop offset="0.3" stopColor={moonlight} stopOpacity="0.95" />
    <stop offset="0.75" stopColor={silk} stopOpacity="0.7" />
    <stop offset="1" stopColor={silk} stopOpacity="1" />
  </radialGradient>
);

/**
 * A dew bead (the webs' and the garlands'): the soft halo, the dark underside away from the moon,
 * the glass turned to face it and its white specular. `radius` is the bead at rest; `scale` sizes
 * the halo, the underside's offset and the specular with it (1: the webs' DEW). While the moonlight
 * band crosses it (`flash` 0–1) it grows DEW.flash, its halo widens and it goes fully opaque.
 */
export const DewBead = ({x, y, radius: rest, scale = 1, flash, toward, halo, glass}: {
  x: number; y: number; radius: number; scale?: number; flash: number; toward: Point; halo: string; glass: string;
}) => {
  const n = svgNumber;
  const radius = rest * (1 + DEW.flash * flash);
  const reach = scale * (DEW.halo + (DEW.haloFlash - DEW.halo) * flash);
  const turn = Math.atan2(toward.y, toward.x);
  return (
    <g opacity={n(DEW.rest + (1 - DEW.rest) * flash)}>
      <circle cx={n(x)} cy={n(y)} r={n(reach)} fill={halo} />
      <circle cx={n(x - toward.x * DEW.under * scale)} cy={n(y - toward.y * DEW.under * scale)} r={n(radius)} fill="#0A0814" opacity="0.35" />
      <g transform={`rotate(${n(turn * 180 / Math.PI - BEAD_LIGHT)} ${n(x)} ${n(y)})`}>
        <circle cx={n(x)} cy={n(y)} r={n(radius)} fill={glass} />
        <circle cx={n(x + radius * 0.35)} cy={n(y - radius * 0.4)} r={n(DEW.spark * scale)} fill="#FFFFFF" opacity="0.9" />
      </g>
    </g>
  );
};

/**
 * A whole fan's web, drawn once: clipped to `clipPath` (the union of the fan's cells, in frame
 * coordinates), turned and breathing about its hub.
 */
export const FanWeb = ({id, hubX, hubY, spec, clipPath, look}: {
  id: string; hubX: number; hubY: number; spec: WebSpec; clipPath: string; look: WebLook;
}): ReactNode => {
  const threads = webThreads(spec, look.billow);
  const geometry = webGeometry(spec);
  const {silk, moonlight} = look;
  const radians = -look.rotation * Math.PI / 180;
  const toLocal = (point: Point): Point => {
    const dx = (point.x - hubX) / look.breath;
    const dy = (point.y - hubY) / look.breath;
    return {x: dx * Math.cos(radians) - dy * Math.sin(radians), y: dx * Math.sin(radians) + dy * Math.cos(radians)};
  };
  const moon = toLocal({x: look.moonX, y: look.moonY});
  const toward = (() => {
    const length = Math.hypot(moon.x, moon.y) || 1;
    return {x: moon.x / length, y: moon.y / length};
  })();
  const {spokes, tearStubs: stubs, dew} = threads;
  // The rings draw as one path per ring (its segments as subpaths, as flexWeb joins them):
  // overlapping caps at the knots never double up, as in the background.
  const ringPaths = threads.rings.map(({d, depth}, ring) => ({ring, d, depth})).filter(({d}) => d !== '');
  const lastRing = spec.rings - 1;
  const thin = webThinning(spec.radius);
  const ringWidth = (depth: number, ring: number) => thin * (ring === lastRing ? WIDTH.rim : WIDTH.ring + depth * WIDTH.ringDepth);
  const spokeWidth = (frame: boolean) => thin * (frame ? WIDTH.frame : WIDTH.spoke);
  const stubWidth = svgNumber(thin * WIDTH.stub);
  const catchLight = 0.75 + look.glow * 0.25;
  const beadOpacity = 0.45 + look.glow * 0.4;
  const band = spec.bisector - FAN_SPREAD / 2 + FAN_SPREAD * look.glint;
  const rim = geometry.rim;
  const n = svgNumber;
  const moonlit = `${id}-moonlit`;
  const glint = `${id}-glint`;
  const halo = `${id}-halo`;
  const glass = `${id}-glass`;
  const shadow = `translate(${n(-toward.x * SHADOW.away)} ${n(-toward.y * SHADOW.away + SHADOW.down)})`;
  const lit = `translate(${n(toward.x * LIT_SHIFT)} ${n(toward.y * LIT_SHIFT)})`;
  const beadRadius = spec.radius < DEW.small ? DEW.smallBead : DEW.bead;

  return (
    <g>
      <defs>
        <clipPath id={`${id}-clip`} clipPathUnits="userSpaceOnUse"><path d={clipPath} /></clipPath>
        <radialGradient id={moonlit} gradientUnits="userSpaceOnUse" cx={n(moon.x)} cy={n(moon.y)} r={n(1000 / look.breath)}>
          <stop offset="0" stopColor={moonlight} stopOpacity="0.55" />
          <stop offset="0.4" stopColor={moonlight} stopOpacity="0.2" />
          <stop offset="1" stopColor={moonlight} stopOpacity="0" />
        </radialGradient>
        {/* Faded, not gone, outside the pool: every thread keeps a dim lit edge. */}
        <radialGradient id={glint} gradientUnits="userSpaceOnUse" r={n(rim * 0.35)}
          cx={n(Math.cos(band) * rim * 0.62)} cy={n(Math.sin(band) * rim * 0.62)}>
          <stop offset="0" stopColor={moonlight} stopOpacity="1" />
          <stop offset="0.45" stopColor={moonlight} stopOpacity="0.4" />
          <stop offset="1" stopColor={moonlight} stopOpacity="0.15" />
        </radialGradient>
        {dew.length + stubs.length > 0 ? <DewHalo id={halo} silk={silk} moonlight={moonlight} /> : null}
        {dew.length > 0 ? <DewGlass id={glass} silk={silk} moonlight={moonlight} /> : null}
      </defs>
      <g clipPath={paint(`${id}-clip`)} opacity={n(look.opacity)}>
        <g transform={`translate(${n(hubX)} ${n(hubY)}) rotate(${n(look.rotation)}) scale(${n(look.breath)})`}>
          {/* Over footage: a soft dark edge under every thread (the background's transparent export). */}
          <g fill="none" stroke={DARK_EDGE.color} strokeLinecap="round" opacity={DARK_EDGE.opacity}>
            {ringPaths.map(({ring, d, depth}) => <path key={`r${ring}`} d={d} strokeWidth={n(ringWidth(depth, ring) + DARK_EDGE.grow)} />)}
            {spokes.map(({d, frame}, index) => <path key={`s${index}`} d={d} strokeWidth={n(spokeWidth(frame) + DARK_EDGE.grow)} />)}
            {stubs.map(({d}, index) => <path key={`t${index}`} d={d} strokeWidth={n(thin * WIDTH.stub + DARK_EDGE.grow)} />)}
          </g>
          {/* A soft dark underline cast away from the moon: it keeps pale silk legible over light footage. */}
          <g transform={shadow} fill="none" stroke="#17121F" strokeLinecap="round">
            {ringPaths.map(({ring, d, depth}) => <path key={`r${ring}`} d={d} strokeWidth={n(thin * (1.2 + depth * 0.7))} opacity={SHADOW_OPACITY} />)}
            {spokes.map(({d, frame}, index) => <path key={`s${index}`} d={d} strokeWidth={n(thin * (frame ? 2.9 : 1.7))} opacity={SHADOW_OPACITY} />)}
            {stubs.map(({d}, index) => <path key={`t${index}`} d={d} strokeWidth={n(thin * 1.5)} opacity={SHADOW_OPACITY} />)}
          </g>
          {/* Weight follows structure: rim and frame radials carry the web, then the radials, then the capture spiral. */}
          <g fill="none" strokeLinecap="round">
            {spokes.map(({d, frame}, index) => (
              <path key={`s${index}`} d={d} stroke={silk} strokeWidth={n(spokeWidth(frame))} opacity={frame ? SILK.frame : SILK.spoke} />
            ))}
            {ringPaths.map(({ring, d, depth}) => (
              <path key={`r${ring}`} d={d} stroke={silk} strokeWidth={n(ringWidth(depth, ring))}
                opacity={n(ring === lastRing ? SILK.rim : SILK.ring + depth * SILK.ringDepth)} />
            ))}
            {stubs.map(({d}, index) => <path key={`t${index}`} d={d} stroke={silk} strokeWidth={stubWidth} opacity="0.36" />)}
            {/* Moonlight added on top of the flat silk: the silk nearest the moon brightens. */}
            <g stroke={paint(moonlit)}>
              {spokes.map(({d, frame}, index) => <path key={`s${index}`} d={d} strokeWidth={n(spokeWidth(frame))} />)}
              {ringPaths.map(({ring, d, depth}) => <path key={`r${ring}`} d={d} strokeWidth={n(ringWidth(depth, ring))} />)}
              {stubs.map(({d}, index) => <path key={`t${index}`} d={d} strokeWidth={stubWidth} />)}
            </g>
            {/* The lit edge toward the moon, brightest where the travelling band crosses the silk. */}
            <g transform={lit} stroke={paint(glint)} strokeWidth="1.2">
              {ringPaths.map(({ring, d, depth}) => <path key={`r${ring}`} d={d} opacity={n((0.45 + depth * 0.38) * catchLight)} />)}
              {spokes.map(({d}, index) => <path key={`s${index}`} d={d} opacity={n(0.45 * catchLight)} />)}
            </g>
          </g>
          {stubs.filter(({bead}) => bead).map(({tip}, index) => (
            <TipBead key={`b${index}`} {...tip} light={toward} size={TIP_BEAD_SIZE} opacity={beadOpacity}
              moonlight={moonlight} halo={paint(halo)} />
          ))}
          {dew.map((bead, index) => (
            // A drop flashes briefly as the band crosses it (the background's law), steady between passes.
            <DewBead key={`d${index}`} x={bead.x} y={bead.y} radius={beadRadius} flash={Math.exp(10 * (Math.cos(Math.PI * (bead.across - look.glint)) - 1))}
              toward={toward} halo={paint(halo)} glass={paint(glass)} />
          ))}
        </g>
      </g>
    </g>
  );
};

/**
 * How far past the ideal fan (the sector of radius FAN_REACH·radius and half-opening
 * FAN_SPREAD/2 + fanJitter around the hub) anything this web draws may reach, in px, for one
 * breeze, turn and breath: thread strokes with their widest pass (outline, shadow, lit edge), bead
 * halos and tip beads. The envelope's margin (FAN_MARGIN) must hold it: tests check it over seeds and frames.
 */
export const webExcess = (spec: WebSpec, billow: number, rotation: number, breath: number): number => {
  const threads = webThreads(spec, billow);
  const half = FAN_SPREAD / 2 + fanJitter(spec.radius);
  const reach = FAN_REACH * spec.radius;
  const turn = rotation * Math.PI / 180;
  const place = ({x, y}: Point): Point => ({
    x: breath * (x * Math.cos(turn) - y * Math.sin(turn)), y: breath * (x * Math.sin(turn) + y * Math.cos(turn)),
  });
  // Signed distance from a point to the sector's edge (negative inside).
  const outside = (point: Point) => {
    const {x, y} = place(point);
    const r = Math.hypot(x, y);
    const angle = Math.abs(wrapAngle(Math.atan2(y, x) - spec.bisector));
    if (angle <= half) return r > reach ? r - reach : -Math.min(reach - r, r * Math.sin(Math.min(Math.PI / 2, half - angle)));
    // Beyond an edge radial: distance to that ray (or to its end past the rim).
    const off = angle - half;
    if (off >= Math.PI / 2) return r;
    const along = r * Math.cos(off);
    const across = r * Math.sin(off);
    return along <= reach ? across : Math.hypot(along - reach, across);
  };
  const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const pointsOf = (d: string) => {
    const values = numbers(d);
    const points: Point[] = [];
    for (let index = 0; index + 1 < values.length; index += 2) points.push({x: values[index]!, y: values[index + 1]!});
    return points;
  };
  // What each pass adds around a thread's centreline: the outline's half width, or the shadow's offset
  // plus half its width, or the lit edge's offset plus half its width, whichever is widest.
  const shadowShift = Math.hypot(SHADOW.away, SHADOW.down);
  const around = (silk: number, shade: number) => Math.max((silk + DARK_EDGE.grow) / 2, shadowShift + shade / 2, LIT_SHIFT + 0.6);
  let worst = -Infinity;
  // Sample every quadratic finely (a control point lies off the curve).
  const sampled = (d: string) => {
    const points = pointsOf(d);
    if (!d.includes('Q')) return points;
    const out: Point[] = [];
    for (let index = 0; index + 2 < points.length; index += 3) {
      const [p0, p1, p2] = [points[index]!, points[index + 1]!, points[index + 2]!];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        const u = 1 - t;
        out.push({x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y});
      }
    }
    return out;
  };
  for (const spoke of threads.spokes) {
    const pad = around(spoke.frame ? WIDTH.frame : WIDTH.spoke, spoke.frame ? 2.9 : 1.7);
    for (const point of sampled(spoke.d)) worst = Math.max(worst, outside(point) + pad);
  }
  for (const ring of threads.rings) {
    const pad = around(Math.max(WIDTH.rim, WIDTH.ring + ring.depth * WIDTH.ringDepth), 1.2 + ring.depth * 0.7);
    for (const point of sampled(ring.d)) worst = Math.max(worst, outside(point) + pad);
  }
  for (const stub of threads.tearStubs) {
    for (const point of sampled(stub.d)) worst = Math.max(worst, outside(point) + around(WIDTH.stub, 1.5));
    if (stub.bead) worst = Math.max(worst, outside(stub.tip) + TIP_BEAD_HALO);
  }
  for (const bead of threads.dew) {
    worst = Math.max(worst, outside(bead) + DEW.haloFlash);
  }
  return worst;
};
