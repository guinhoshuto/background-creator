import {SPARKLE_GLOW} from '../../../../backgrounds/vaporwave/frame';
import {getPalmPoints, getPalmShape, PALM_SWAY, type PalmShape} from '../../../../backgrounds/vaporwave/Palm';
import {SOLID_GLOW, SOLID_REACH} from '../../../../backgrounds/vaporwave/Polyhedron';
import type {VaporwaveElement} from '../../../../backgrounds/VaporwaveLoop';
import {TAU} from '../../../../loop';
import {clampRadius} from '../../geometry';
import {ceilHalf, cornerSlots, enclosingCircle, fitMotif, fitsAt, floorHalf, scanAround, slotsOffAccent, type OrnamentCorner} from '../place';
import type {OrnamentCornerId, OrnamentFrame, OrnamentLayerName, OrnamentPlacement, OrnamentSlotId} from '../types';

/**
 * Where the 'horizon' set (VaporwaveLoop: "neon horizon") puts its motifs. Pure function of the
 * frame and ornamentSize: no seed, no frame index. The layout repeats the background's: palm
 * crowns at the top left, the sun at the top right, wireframe solids in the lower corners and
 * twinkles in the sky between them.
 *
 * `ornamentSize` is the PALM's height in px, from the foot of the trunk to the top of the crown
 * (the hero). The others keep fixed ratios to it up to fixed px caps: the sun's diameter 0.7 of it
 * (at most 64 px), the solids' radius 0.2 of it (at most 16 px). Each is then limited to the room
 * at its spot (never the box's size); a secondary below its minimum is left out.
 *
 *   - Palm (hero): the background's own palm (getPalmShape), with a fuller crown and leaning out,
 *     behind the TL corner, so its foot is hidden by the panel or the band and the crown rises
 *     above the corner. In front where the back has no room (a screen frame, a panel without
 *     bleed). Below PALM_MIN_HEIGHT a palm is a smudge: there a twinkle is the hero instead
 *     (labels, small circles), in the first corner of TL, TR, BR, BL that holds it.
 *   - Sun: behind the TR corner (TL when the palm took TR), rising behind it like the background's
 *     sun at the frame edge, with a bloom of 1.3 r when the frame has glow; in front where the back
 *     has no room.
 *   - Solids: in front, the background's pyramid at BR and icosahedron at BL, sitting on the corner.
 *   - Twinkles: in front, the background's four-point sparkles on the outline, every
 *     SPARKLE_PITCH px along the top edge between the palm and the sun and along long side edges;
 *     on circles, one at the top of the ring.
 *
 * A later motif whose circle comes closer to an earlier one than OVERLAP of their extents is left
 * out. On a round block with an accent, the front motifs keep off the accent arc's corner slots
 * (slotsOffAccent); the back ones (palm, sun) tuck under the ring like the midnight moon.
 */

/** The set's palm at its reference height, in px: a fuller crown than the background's (fronds half the height), leaning out. */
export const PALM_REF = {height: 200, frond: 100, lean: -0.22} as const;
/** The lit rim: the silhouette shifted this many px towards the sun, under the ink. */
export const PALM_RIM = 1.1;
/** The rim's shift, half the edge stroke and a pixel of antialiasing: what the palm paints past its outline. */
export const PALM_INK = PALM_RIM + 0.4 + 0.5;
/** Below this height a palm reads as a smudge: the twinkle stands in as the hero. */
export const PALM_MIN_HEIGHT = 30;

const palmElement = (side: 0 | 1, sway: number, swayTilt: number): VaporwaveElement => ({
  kind: 'palm', x: 0, y: 0, size: PALM_REF.height, length: PALM_REF.frond, angle: sway, tilt: swayTilt, lean: PALM_REF.lean,
  spinCos: 1, spinSin: 0, opacity: 1, glow: 0, warmth: 0, variant: side,
});

/**
 * The palm at the reference height and a sway (degrees, as the background's `angle` and `tilt`),
 * its foot at (0, 0). Side 0 leans left (the TL corner), side 1 is its mirror (TR).
 */
export const referencePalm = (side: 0 | 1, sway: number, swayTilt: number): PalmShape => getPalmShape(palmElement(side, sway, swayTilt));

/** The farthest sway of a palm, in degrees (the background's two harmonics in step). */
export const PALM_SWAY_REACH = PALM_SWAY.first + PALM_SWAY.second;
/** What the sampled poses and the support directions may miss, as a share of the radius. */
const PALM_BOUNDS_MARGIN = 0.015;

/**
 * The circle that holds the side-0 palm in every pose, in reference px with the foot at (0, 0):
 * every painted point at rest and at the farthest sway in 32 directions (a frond's heading is
 * linear in the sway), reduced to its support points in 360 directions, then the smallest
 * enclosing circle, widened by PALM_BOUNDS_MARGIN.
 */
const PALM_BOUNDS = (() => {
  const points: {x: number; y: number}[] = [];
  const poses: [number, number][] = [[0, 0]];
  for (let index = 0; index < 32; index++) {
    const theta = (index / 32) * TAU;
    poses.push([PALM_SWAY_REACH * Math.cos(theta), PALM_SWAY_REACH * Math.sin(theta)]);
  }
  for (const [sway, swayTilt] of poses) {
    for (const outline of getPalmPoints(referencePalm(0, sway, swayTilt))) for (const [x, y] of outline) points.push({x, y});
  }
  const support: {x: number; y: number}[] = [];
  for (let index = 0; index < 360; index++) {
    const angle = (index / 360) * TAU;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    let best = points[0]!;
    let reach = -Infinity;
    for (const point of points) {
      const along = point.x * ux + point.y * uy;
      if (along > reach) {
        reach = along;
        best = point;
      }
    }
    support.push(best);
  }
  const circle = enclosingCircle(support);
  return {x: circle.x, y: circle.y, r: circle.r * (1 + PALM_BOUNDS_MARGIN)};
})();

/** The palm's holding circle per px of height: its radius, and its centre from the foot (side 0; side 1 mirrors x). */
export const PALM_UNIT = {
  r: PALM_BOUNDS.r / PALM_REF.height, x: PALM_BOUNDS.x / PALM_REF.height, y: PALM_BOUNDS.y / PALM_REF.height,
} as const;
/** A palm's extent for a height, and the height an extent allows. */
export const palmExtent = (height: number) => PALM_UNIT.r * height + PALM_INK;
export const palmHeight = (extent: number) => (extent - PALM_INK) / PALM_UNIT.r;

/** The sun: diameter per px of palm height, its caps, and the bloom around it (a share of the radius). */
export const SUN_RATIO = 0.7;
export const SUN_MAX_DIAMETER = 64;
export const SUN_MIN_DIAMETER = 14;
export const SUN_HALO = 1.3;
/** The sun's disc and bloom radii for a placement of `extent` and the diameter asked for. */
export const sunShape = (extent: number, diameter: number, lit: boolean) => {
  const r = Math.min(diameter / 2, extent / (lit ? SUN_HALO : 1));
  return {r, light: lit ? Math.min(extent, SUN_HALO * r) : 0};
};

/** The solids: radius per px of palm height and its caps (the background's are 46–54 px, far from the panel). */
export const SOLID_RATIO = 0.2;
export const SOLID_MAX_RADIUS = 16;
export const SOLID_MIN_RADIUS = 6;
/** Their float, as shares of the radius (the background's 7 × 9 px for a 50 px solid). */
export const SOLID_BOB = {x: 0.14, y: 0.18} as const;
/** The neon edge's width for a radius: the background's 2.6 px at 50, never under 1.2. */
export const solidEdge = (radius: number) => Math.max(1.2, (2.6 * radius) / 50);
/** The farthest any vertex reaches from the centre (SOLID_REACH radii), plus half the edge and antialiasing. */
export const solidBody = (radius: number) => SOLID_REACH * radius + solidEdge(radius) / 2 + 0.5;
/** A solid's extent for a radius (body or glow, plus the float), and the radius an extent allows. */
export const solidExtent = (radius: number, lit: boolean) =>
  Math.hypot(SOLID_BOB.x, SOLID_BOB.y) * radius + Math.max(solidBody(radius), lit ? SOLID_GLOW * radius : 0);
export const solidRadius = (extent: number, lit: boolean) => {
  // solidExtent grows with the radius: bisect it.
  let [lo, hi] = [0, extent];
  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (lo + hi) / 2;
    if (solidExtent(middle, lit) <= extent) lo = middle;
    else hi = middle;
  }
  return lo;
};

/** Twinkles: tip radius (the four points reach it) of the big and small ones; the ink is the edge's antialiasing. */
export const SPARKLE_TIPS = {big: 6.5, small: 4.5} as const;
export const SPARKLE_INK = 0.6;
/** The hero twinkle (where no palm fits): its tip per px of palm height, between these px. */
export const HERO_SPARKLE = {ratio: 0.14, min: 3, max: 8} as const;
/** The hero's smallest extent: a 2 px twinkle and its glow. */
export const SPARKLE_MIN_EXTENT = 4.5;
/** A twinkle's extent for a tip (its glow, SPARKLE_GLOW tips wide, when lit), and the tip an extent allows. */
export const sparkleExtent = (tip: number, lit: boolean) => ceilHalf(lit ? Math.max(SPARKLE_GLOW * tip, tip + SPARKLE_INK) : tip + SPARKLE_INK);
export const sparkleTip = (extent: number, lit: boolean) => (lit ? extent / SPARKLE_GLOW : extent - SPARKLE_INK);
/** Twinkles along an edge: one every SPARKLE_PITCH px, this far clear of the corner motifs, sliding up to SPARKLE_SLIDE px off the line. */
export const SPARKLE_PITCH = 160;
const SPARKLE_MARGIN = 24;
const SPARKLE_SLIDE = 12;

/** A later motif keeps its centre at least this share of the two extents away from an earlier one's. */
const OVERLAP = 0.8;

/** Whether the set's motifs carry soft lights here (not on a panel without glow: crisp motifs). */
export const horizonLit = (frame: Pick<OrnamentFrame, 'glow'>) => frame.glow > 0;

const clear = (spot: Pick<OrnamentPlacement, 'x' | 'y' | 'extent'>, taken: readonly OrnamentPlacement[]) =>
  taken.every((other) => Math.hypot(spot.x - other.x, spot.y - other.y) >= OVERLAP * (spot.extent + other.extent));

/** How far beyond the outline's corner point a back motif sits, to rise from behind the corner rather than over it. */
const behindCorner = (frame: OrnamentFrame, extra: number) => {
  const radius = clampRadius(frame.outline.radius, frame.outline.width, frame.outline.height);
  return (frame.circle ? 0 : radius * (Math.SQRT2 - 1)) + extra;
};

const PALM_SLOTS: readonly OrnamentCornerId[] = ['TL', 'TR'];
const HERO_SPARKLE_SLOTS: readonly OrnamentCornerId[] = ['TL', 'TR', 'BR', 'BL'];
const LAYERS: readonly OrnamentLayerName[] = ['back', 'front'];

const cornerOf = (corners: readonly OrnamentCorner[], slot: OrnamentCornerId) => corners.find((corner) => corner.slot === slot);

/** The hero palm: behind TL (or TR), else in front there; null when it is under PALM_MIN_HEIGHT or fits nowhere. */
const placePalm = (frame: OrnamentFrame, height: number): OrnamentPlacement | null => {
  const nominal = palmExtent(height);
  // On the extents' 0.5 px grid, so a palm asked at exactly PALM_MIN_HEIGHT still fits.
  const min = floorHalf(palmExtent(PALM_MIN_HEIGHT));
  if (nominal < min - 1e-9) return null;
  for (const layer of LAYERS) {
    const corners = layer === 'back' ? cornerSlots(frame) : slotsOffAccent(frame);
    for (const slot of PALM_SLOTS) {
      const corner = cornerOf(corners, slot);
      if (!corner) continue;
      const fit = fitMotif(frame, corner, {motif: 'palm', layer, nominal, min, prefer: layer === 'back' ? behindCorner(frame, 0) : 0});
      if (fit) return {...fit, size: Math.min(height, palmHeight(fit.extent))};
    }
  }
  return null;
};

/** The hero twinkle, where no palm fits: the first corner of TL, TR, BR, BL that holds it. */
const placeHeroSparkle = (frame: OrnamentFrame, height: number): OrnamentPlacement | null => {
  const lit = horizonLit(frame);
  const tip = Math.min(HERO_SPARKLE.max, Math.max(HERO_SPARKLE.min, HERO_SPARKLE.ratio * height));
  const nominal = sparkleExtent(tip, lit);
  const corners = slotsOffAccent(frame);
  for (const slot of HERO_SPARKLE_SLOTS) {
    const corner = cornerOf(corners, slot);
    if (!corner) continue;
    const fit = fitMotif(frame, corner, {motif: 'sparkle', layer: 'front', nominal, min: SPARKLE_MIN_EXTENT, hero: true});
    if (fit) return {...fit, size: Math.min(tip, sparkleTip(fit.extent, lit))};
  }
  return null;
};

/** The sun behind the top corner the palm left free, else in front there; null when it is too small or meets the palm. */
const placeSun = (frame: OrnamentFrame, height: number, taken: readonly OrnamentPlacement[]): OrnamentPlacement | null => {
  const lit = horizonLit(frame);
  const diameter = Math.min(SUN_MAX_DIAMETER, SUN_RATIO * height);
  if (diameter < SUN_MIN_DIAMETER - 1e-9) return null;
  const halo = lit ? SUN_HALO : 1;
  const nominal = (halo * diameter) / 2;
  const min = (halo * SUN_MIN_DIAMETER) / 2;
  const slot: OrnamentCornerId = taken.some((placement) => placement.slot === 'TR') ? 'TL' : 'TR';
  for (const layer of LAYERS) {
    const corner = cornerOf(layer === 'back' ? cornerSlots(frame) : slotsOffAccent(frame), slot);
    if (!corner) continue;
    const fit = fitMotif(frame, corner, {motif: 'sun', layer, nominal, min, prefer: layer === 'back' ? behindCorner(frame, diameter / 8) : 0});
    if (fit && clear(fit, taken)) return {...fit, size: 2 * sunShape(fit.extent, diameter, lit).r};
  }
  return null;
};

/** The two solids in front of the lower corners: the pyramid at BR, the icosahedron at BL. */
const placeSolids = (frame: OrnamentFrame, height: number, taken: readonly OrnamentPlacement[]): OrnamentPlacement[] => {
  const lit = horizonLit(frame);
  const radius = Math.min(SOLID_MAX_RADIUS, SOLID_RATIO * height);
  if (radius < SOLID_MIN_RADIUS - 1e-9) return [];
  const corners = slotsOffAccent(frame);
  const solids: OrnamentPlacement[] = [];
  for (const [slot, motif] of [['BR', 'pyramid'], ['BL', 'icosahedron']] as const) {
    const corner = cornerOf(corners, slot);
    if (!corner) continue;
    const fit = fitMotif(frame, corner, {motif, layer: 'front', nominal: solidExtent(radius, lit), min: solidExtent(SOLID_MIN_RADIUS, lit)});
    if (fit && clear(fit, [...taken, ...solids])) solids.push({...fit, size: Math.min(radius, solidRadius(fit.extent, lit))});
  }
  return solids;
};

type Run = {slot: OrnamentSlotId; from: number; to: number; at: (along: number, offset: number) => {x: number; y: number}};

/**
 * Twinkles every SPARKLE_PITCH px, big and small in turn, on the outline (the band's centreline on
 * a screen): along the top edge between the corner motifs near it, and along each side edge between
 * the motifs near that side; on a circle, one at the top of the ring. Each slides up to SPARKLE_SLIDE
 * px off the line to fit, and a big one that does not fit tries the small size.
 */
const placeSparkles = (frame: OrnamentFrame, taken: readonly OrnamentPlacement[]): OrnamentPlacement[] => {
  const lit = horizonLit(frame);
  const big = {motif: 'sparkle', tip: SPARKLE_TIPS.big, extent: sparkleExtent(SPARKLE_TIPS.big, lit)};
  const small = {motif: 'sparkle-small', tip: SPARKLE_TIPS.small, extent: sparkleExtent(SPARKLE_TIPS.small, lit)};
  const line = frame.fit === 'screen' ? frame.track : frame.outline;
  const offsets = scanAround(-SPARKLE_SLIDE, SPARKLE_SLIDE, 0);
  const gap = SPARKLE_MARGIN + big.extent;
  const runs: Run[] = [];
  if (frame.circle) {
    const cx = line.x + line.width / 2;
    const top = line.y;
    runs.push({slot: 'top', from: cx, to: cx, at: (along, offset) => ({x: along, y: top + offset})});
  } else {
    const {x, y, width, height} = line;
    const rr = clampRadius(line.radius, width, height);
    const nearTop = taken.filter((placement) => Math.abs(placement.y - y) < placement.extent + gap);
    runs.push({
      slot: 'top',
      from: Math.max(x + rr, ...nearTop.filter((placement) => placement.x < x + width / 2).map((placement) => placement.x + placement.extent + gap)),
      to: Math.min(x + width - rr, ...nearTop.filter((placement) => placement.x >= x + width / 2).map((placement) => placement.x - placement.extent - gap)),
      at: (along, offset) => ({x: along, y: y + offset}),
    });
    for (const [slot, side] of [['left', x], ['right', x + width]] as const) {
      const near = taken.filter((placement) => Math.abs(placement.x - side) < placement.extent + gap);
      runs.push({
        slot,
        from: Math.max(y + rr, ...near.filter((placement) => placement.y < y + height / 2).map((placement) => placement.y + placement.extent + gap)),
        to: Math.min(y + height - rr, ...near.filter((placement) => placement.y >= y + height / 2).map((placement) => placement.y - placement.extent - gap)),
        at: (along, offset) => ({x: side + offset, y: along}),
      });
    }
  }
  const sparkles: OrnamentPlacement[] = [];
  for (const run of runs) {
    const length = run.to - run.from;
    if (length < -1e-9) continue;
    const count = 1 + Math.floor(length / SPARKLE_PITCH + 1e-9);
    const first = run.from + (length - (count - 1) * SPARKLE_PITCH) / 2;
    for (let index = 0; index < count; index++) {
      const along = first + index * SPARKLE_PITCH;
      for (const spec of index % 2 === 0 ? [big, small] : [small]) {
        const spot = offsets.map((offset) => run.at(along, offset))
          .find((point) => fitsAt(frame, point.x, point.y, spec.extent, 'front') && clear({...point, extent: spec.extent}, [...taken, ...sparkles]));
        if (!spot) continue;
        sparkles.push({motif: spec.motif, slot: run.slot, layer: 'front', x: spot.x, y: spot.y, extent: spec.extent, size: spec.tip});
        break;
      }
    }
  }
  return sparkles;
};

/** Every motif of the set on this frame, hero first; [] when neither a palm nor the hero twinkle fits. */
export const placeHorizon = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement[] => {
  const hero = placePalm(frame, ornamentSize) ?? placeHeroSparkle(frame, ornamentSize);
  if (!hero) return [];
  const placed: OrnamentPlacement[] = [hero];
  const sun = placeSun(frame, ornamentSize, placed);
  if (sun) placed.push(sun);
  placed.push(...placeSolids(frame, ornamentSize, placed));
  placed.push(...placeSparkles(frame, placed));
  return placed;
};
