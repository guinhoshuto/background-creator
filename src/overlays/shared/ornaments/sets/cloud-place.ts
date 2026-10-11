import {CLOUD_BODIES} from '../../../../backgrounds/kawaii/Cloud';
import {HEART_SHAPE} from '../../../../backgrounds/kawaii/Heart';
import {TWINKLE_SHAPE} from '../../../../backgrounds/kawaii/Star';
import {clampRadius} from '../../geometry';
import {ceilHalf, fitMotif, fitsAt, floorHalf, maxExtentAt, scanAround, slotsOffAccent, type OrnamentCorner} from '../place';
import type {OrnamentCornerId, OrnamentFrame, OrnamentLayerName, OrnamentPlacement, OrnamentSlotId} from '../types';

/**
 * Where the 'cloud' set (KawaiiLoop: "pastel constellation", the pastel-cloud kit) puts its
 * motifs. Pure function of the frame and ornamentSize: no seed, no frame index. The layout follows
 * the background's chord (a cloud, a heart beside it, twinkles around): a cloud sits on the top
 * edge of every piece, its lower half tucked behind the panel or the band.
 *
 * `ornamentSize` is the hero CLOUD's drawn width in px. The others keep fixed ratios to it up to
 * fixed px caps: the second cloud 0.618 of it, the heart's half-height 0.207 of it (the
 * background's chord: half the group radius, 5 to 16 px), the hollow heart 0.7 of the heart. Each
 * is then limited to the room at its spot (never the box's size); a secondary below its minimum is
 * left out.
 *
 *   - Cloud (hero): the background's own cloud (variant 0; variant 2, the rounder one, on circles),
 *     behind the top edge near the left (behind the top of the ring on circles), centred on the
 *     edge so its top half rises over it; it sinks at most MAX_SINK of its extent, only where it fits
 *     nowhere on or above the edge, and, where the edge has no room (a border's band), takes the
 *     roomiest spot nearby, the corner outside the window. In front where the back has no room (a screen frame). Below CLOUD_MIN_WIDTH a
 *     cloud is a smudge: there a twinkle is the hero instead (in the first corner of TL, TR, BR, BL
 *     that holds it).
 *   - Heart: in front, beside the hero cloud, up and to its right, where the background's chord
 *     puts it (along 2.08 and across −0.5 group radii).
 *   - Second cloud: the flat one (variant 1), behind the top edge near the right, on rectangles.
 *   - Hollow heart: in front, sitting on the BR corner, across from the hero.
 *   - Glint: on circles, a soap-bubble highlight along the ring at TL: the circles are bubbles.
 *   - Twinkles: in front, the background's four-needle twinkle every TWINKLE_PITCH px along the top
 *     edge between the clouds and along long side edges (rectangles only).
 *
 * A later motif whose circle comes closer to an earlier one than OVERLAP of their extents is left
 * out. On a round block with an accent, the front corner motifs keep off the accent arc's slots
 * (slotsOffAccent).
 */

type Point = {x: number; y: number};

/** Samples per cubic: far below a pixel at every size the set draws. */
const CURVE_SAMPLES = 24;

/**
 * Points along an outline made of absolute M, L, C and Z commands (the kawaii drawings use only
 * these). Any other command throws, so a redrawn silhouette fails the tests instead of being
 * measured wrong.
 */
export const outlinePoints = (d: string): Point[] => {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const points: Point[] = [];
  let at: Point = {x: 0, y: 0};
  let command = '';
  let index = 0;
  const number = () => {
    const token = tokens[index++];
    const value = Number(token);
    if (token === undefined || !Number.isFinite(value)) throw new Error(`outlinePoints: expected a number at token ${index - 1} of "${d}"`);
    return value;
  };
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (/[A-Za-z]/.test(token)) {
      command = token;
      index++;
      if (command === 'Z') continue;
      if (!'MLC'.includes(command)) throw new Error(`outlinePoints: command ${command} is not measured`);
    }
    if (command === 'M' || command === 'L') {
      at = {x: number(), y: number()};
      points.push(at);
    } else if (command === 'C') {
      const [x1, y1, x2, y2, x, y] = [number(), number(), number(), number(), number(), number()];
      for (let step = 1; step <= CURVE_SAMPLES; step++) {
        const t = step / CURVE_SAMPLES;
        const u = 1 - t;
        points.push({
          x: u * u * u * at.x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          y: u * u * u * at.y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
        });
      }
      at = {x, y};
    } else {
      throw new Error(`outlinePoints: no command before token ${index} of "${d}"`);
    }
  }
  return points;
};

/** What a sampled curve may miss, as a share of the farthest point. */
const SAMPLE_MARGIN = 0.005;
/** The antialiasing past every drawn edge, in px. */
export const INK = 0.5;

const farthest = (points: readonly Point[]) => Math.max(...points.map((point) => Math.hypot(point.x, point.y))) * (1 + SAMPLE_MARGIN);

/**
 * Each cloud silhouette (variant 0, 1, 2): its drawn width in the drawing's units and the farthest
 * point from its origin (the Cloud's centre of rotation and squash) per px of that width.
 */
export const CLOUD_UNITS = CLOUD_BODIES.map((body) => {
  const points = outlinePoints(body);
  const xs = points.map((point) => point.x);
  const width = Math.max(...xs) - Math.min(...xs);
  return {width, reach: farthest(points) / width};
});
/** The cloud breathes as the background's (squash 1 ± 0.045) and floats by these shares of its width. */
export const CLOUD_BREATH = 0.045;
export const CLOUD_BOB = {x: 0.03, y: 0.02} as const;
/** Below this width a cloud reads as a smudge. */
export const CLOUD_MIN_WIDTH = 28;
/** The second cloud's width per px of the hero's: the background's golden ladder. */
export const SECOND_CLOUD_RATIO = 0.618;

/** A cloud's body radius around its centre this frame (squash at its widest), and its extent with the float. */
export const cloudReach = (width: number, variant: number) => CLOUD_UNITS[variant]!.reach * width * (1 + CLOUD_BREATH) + INK;
export const cloudExtent = (width: number, variant: number) => Math.hypot(CLOUD_BOB.x, CLOUD_BOB.y) * width + cloudReach(width, variant);
export const cloudWidth = (extent: number, variant: number) =>
  (extent - INK) / (Math.hypot(CLOUD_BOB.x, CLOUD_BOB.y) + CLOUD_UNITS[variant]!.reach * (1 + CLOUD_BREATH));

/** The heart's farthest point from its centre, in the drawing's units (filled; the hollow one adds half its band). */
const HEART_FARTHEST = farthest(outlinePoints(HEART_SHAPE.body));
/** The heart's half-height per px of hero width (the background's: half the group radius, a cloud being 2.42 radii wide) and its caps. */
export const HEART_RATIO = 0.207;
export const HEART_MAX = 16;
export const HEART_MIN = 5;
export const HOLLOW_HEART_RATIO = 0.7;
/** The heart floats by this share of its half-height on each axis. */
export const HEART_BOB = 0.12;
/** A heart's body radius for a half-height (the Heart scales the hollow one down so its band keeps `size`). */
export const heartReach = (size: number, hollow: boolean) =>
  (hollow ? (HEART_FARTHEST + HEART_SHAPE.band / 2) / (HEART_SHAPE.unit + HEART_SHAPE.band / 2) : HEART_FARTHEST / HEART_SHAPE.unit) * size + INK;
export const heartExtent = (size: number, hollow: boolean) => HEART_BOB * Math.SQRT2 * size + heartReach(size, hollow);
export const heartSize = (extent: number, hollow: boolean) => {
  // heartExtent grows with the size: bisect it.
  let [lo, hi] = [0, extent];
  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (lo + hi) / 2;
    if (heartExtent(middle, hollow) <= extent) lo = middle;
    else hi = middle;
  }
  return lo;
};

/** The twinkle (Star variant 1) reaches its `size` from its centre: the needles after the drop. */
const TWINKLE_REACH = Math.max(TWINKLE_SHAPE.up - TWINKLE_SHAPE.drop, TWINKLE_SHAPE.down + TWINKLE_SHAPE.drop) / TWINKLE_SHAPE.unit;
/** Twinkles along an edge (half-heights) and their soft glow, in sizes. */
export const TWINKLE_SIZES = {big: 7, small: 5} as const;
export const TWINKLE_GLOW = 1.8;
/** The hero twinkle (where no cloud fits): its size per px of cloud width, between these px. */
export const HERO_TWINKLE = {ratio: 0.12, min: 3, max: 8} as const;
/** The hero's smallest extent: a 2.5 px twinkle and its glow. */
export const TWINKLE_MIN_EXTENT = 4.5;
export const twinkleReach = (size: number) => TWINKLE_REACH * size + INK;
export const twinkleExtent = (size: number, lit: boolean) => ceilHalf(lit ? Math.max(TWINKLE_GLOW * size, twinkleReach(size)) : twinkleReach(size));
export const twinkleSize = (extent: number, lit: boolean) => (lit ? extent / TWINKLE_GLOW : (extent - INK) / TWINKLE_REACH);
/** Twinkles along an edge: one every TWINKLE_PITCH px, this far clear of the other motifs, sliding up to TWINKLE_SLIDE px off the line. */
export const TWINKLE_PITCH = 160;
const TWINKLE_MARGIN = 24;
const TWINKLE_SLIDE = 12;

/** The glint: an arc along the ring, this share of the ring's radius long (between these px), this wide. */
export const GLINT = {ratio: 0.22, min: 10, max: 44, width: 3} as const;
export const glintExtent = (length: number) => length / 2 + GLINT.width / 2 + INK;

/** A later motif keeps its centre at least this share of the two extents away from an earlier one's. */
const OVERLAP = 0.8;
/** How far a cloud may sink below the edge it sits on, as a share of its extent. */
const MAX_SINK = 0.1;
/** The search grid for the clouds and the heart, in px. */
const STEP = {x: 2, y: 1} as const;

/** Whether the set's motifs carry soft lights here (not on a panel without glow: crisp motifs). */
export const cloudLit = (frame: Pick<OrnamentFrame, 'glow'>) => frame.glow > 0;

const clear = (spot: Pick<OrnamentPlacement, 'x' | 'y' | 'extent'>, taken: readonly OrnamentPlacement[]) =>
  taken.every((other) => Math.hypot(spot.x - other.x, spot.y - other.y) >= OVERLAP * (spot.extent + other.extent));

const LAYERS: readonly OrnamentLayerName[] = ['back', 'front'];
const HERO_TWINKLE_SLOTS: readonly OrnamentCornerId[] = ['TL', 'TR', 'BR', 'BL'];

const cornerOf = (corners: readonly OrnamentCorner[], slot: OrnamentCornerId) => corners.find((corner) => corner.slot === slot);

type Area = {x0: number; x1: number; y0: number; y1: number; prefer: Point};

/** The grid points of an area, nearest its preferred point first (the upper and then the left one on ties). */
const gridOf = (area: Area): Point[] => {
  const points: Point[] = [];
  for (let x = area.x0; x <= area.x1 + 1e-9; x += STEP.x) for (let y = area.y0; y <= area.y1 + 1e-9; y += STEP.y) points.push({x, y});
  const distance = (point: Point) => Math.hypot(point.x - area.prefer.x, point.y - area.prefer.y);
  return points.sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x);
};

/**
 * The spot of an area that holds the largest extent up to `nominal` on `layer`, nearest the
 * preferred point among equals and clear of the motifs already placed; null when no spot holds
 * `min`.
 */
const seat = (
  frame: OrnamentFrame, layer: OrnamentLayerName, area: Area, nominal: number, min: number, taken: readonly OrnamentPlacement[],
): (Point & {extent: number}) | null => {
  // Extents live on the 0.5 px grid: the nominal one rounded up, so it still holds the motif asked for.
  const full = ceilHalf(nominal);
  let best: (Point & {extent: number}) | null = null;
  for (const point of gridOf(area)) {
    const extent = Math.min(full, floorHalf(maxExtentAt(frame, point.x, point.y, layer)));
    if (extent < min - 1e-9 || (best && extent <= best.extent + 1e-9)) continue;
    if (!clear({...point, extent}, taken)) continue;
    best = {...point, extent};
    if (extent >= full - 1e-9) break;
  }
  return best;
};

/**
 * Where a cloud of `nominal` extent may sit along the top of the outline: from the paint limit's
 * top down to the edge, or down to MAX_SINK below it. Sinking buys a little width and hides more of
 * the cloud than it buys, so a cloud sinks only where it fits nowhere on or above the edge.
 */
const topRows = (frame: OrnamentFrame, nominal: number, sink: number) => ({
  y0: Math.max(frame.paintLimit.y, frame.outline.y - nominal),
  y1: frame.outline.y + sink * nominal,
});

/** A cloud's spot along the top of an area: on or above the edge first, then sunk. */
const seatCloud = (
  frame: OrnamentFrame, layer: OrnamentLayerName, area: Omit<Area, 'y0' | 'y1'>, nominal: number, min: number, taken: readonly OrnamentPlacement[],
) => seat(frame, layer, {...area, ...topRows(frame, nominal, 0)}, nominal, min, taken)
  ?? seat(frame, layer, {...area, ...topRows(frame, nominal, MAX_SINK)}, nominal, min, taken);

/** The hero cloud: behind the top edge (or the top of the ring), else in front; null under CLOUD_MIN_WIDTH or where it fits nowhere. */
const placeHeroCloud = (frame: OrnamentFrame, width: number): OrnamentPlacement | null => {
  const variant = frame.circle ? 2 : 0;
  const nominal = cloudExtent(width, variant);
  // On the extents' 0.5 px grid, so a cloud asked at exactly CLOUD_MIN_WIDTH still fits.
  const min = floorHalf(cloudExtent(CLOUD_MIN_WIDTH, variant));
  if (nominal < min - 1e-9) return null;
  const {x, width: w} = frame.outline;
  const area = frame.circle
    ? {x0: x + 0.2 * w, x1: x + 0.8 * w, prefer: {x: x + w / 2, y: frame.outline.y}}
    : {x0: Math.max(frame.paintLimit.x, x - nominal), x1: x + w / 2, prefer: {x: x + 0.22 * w, y: frame.outline.y}};
  for (const layer of LAYERS) {
    const spot = seatCloud(frame, layer, area, nominal, min, []);
    if (spot) return {motif: frame.circle ? 'cloud-round' : 'cloud', slot: 'top', layer, ...spot, size: Math.min(width, cloudWidth(spot.extent, variant))};
  }
  return null;
};

/** The hero twinkle, where no cloud fits: the first corner of TL, TR, BR, BL that holds it. */
const placeHeroTwinkle = (frame: OrnamentFrame, width: number): OrnamentPlacement | null => {
  const lit = cloudLit(frame);
  const size = Math.min(HERO_TWINKLE.max, Math.max(HERO_TWINKLE.min, HERO_TWINKLE.ratio * width));
  const nominal = twinkleExtent(size, lit);
  const corners = slotsOffAccent(frame);
  for (const slot of HERO_TWINKLE_SLOTS) {
    const corner = cornerOf(corners, slot);
    if (!corner) continue;
    const fit = fitMotif(frame, corner, {motif: 'twinkle', layer: 'front', nominal, min: TWINKLE_MIN_EXTENT, hero: true});
    if (fit) return {...fit, size: Math.min(size, twinkleSize(fit.extent, lit))};
  }
  return null;
};

/** The heart beside the hero cloud, up and to its right, in front. */
const placeHeart = (frame: OrnamentFrame, hero: OrnamentPlacement, taken: readonly OrnamentPlacement[]): OrnamentPlacement | null => {
  const size = Math.min(HEART_MAX, HEART_RATIO * hero.size);
  if (size < HEART_MIN - 1e-9) return null;
  const nominal = heartExtent(size, false);
  const reach = 0.25 * hero.size;
  const prefer = {x: hero.x + 0.86 * hero.size, y: hero.y - 0.21 * hero.size};
  const area: Area = {x0: prefer.x - reach, x1: prefer.x + reach, y0: prefer.y - reach, y1: prefer.y + reach, prefer};
  const spot = seat(frame, 'front', area, nominal, heartExtent(HEART_MIN, false), taken);
  return spot ? {motif: 'heart', slot: 'top', layer: 'front', ...spot, size: Math.min(size, heartSize(spot.extent, false))} : null;
};

/** The flat cloud behind the top edge near the right, on rectangles. */
const placeSecondCloud = (frame: OrnamentFrame, hero: OrnamentPlacement, taken: readonly OrnamentPlacement[]): OrnamentPlacement | null => {
  const width = SECOND_CLOUD_RATIO * hero.size;
  if (width < CLOUD_MIN_WIDTH - 1e-9) return null;
  const nominal = cloudExtent(width, 1);
  const min = floorHalf(cloudExtent(CLOUD_MIN_WIDTH, 1));
  const {x, width: w} = frame.outline;
  const area = {x0: x + w / 2, x1: Math.min(frame.paintLimit.x + frame.paintLimit.width, x + w + nominal), prefer: {x: x + 0.8 * w, y: frame.outline.y}};
  for (const layer of LAYERS) {
    const spot = seatCloud(frame, layer, area, nominal, min, taken);
    if (spot) return {motif: 'cloud-flat', slot: 'top', layer, ...spot, size: Math.min(width, cloudWidth(spot.extent, 1))};
  }
  return null;
};

/** The hollow heart in front of the BR corner. */
const placeHollowHeart = (frame: OrnamentFrame, hero: OrnamentPlacement, taken: readonly OrnamentPlacement[]): OrnamentPlacement | null => {
  const size = Math.min(HEART_MAX, HEART_RATIO * hero.size) * HOLLOW_HEART_RATIO;
  if (size < HEART_MIN - 1e-9) return null;
  const corner = cornerOf(slotsOffAccent(frame), 'BR');
  if (!corner) return null;
  const fit = fitMotif(frame, corner, {motif: 'heart-hollow', layer: 'front', nominal: heartExtent(size, true), min: heartExtent(HEART_MIN, true)});
  return fit && clear(fit, taken) ? {...fit, size: Math.min(size, heartSize(fit.extent, true))} : null;
};

/** The bubble's glint along the ring at TL, on circles; `size` is its length. */
const placeGlint = (frame: OrnamentFrame, taken: readonly OrnamentPlacement[]): OrnamentPlacement | null => {
  const length = Math.min(GLINT.max, GLINT.ratio * (frame.outline.width / 2));
  if (length < GLINT.min - 1e-9) return null;
  const corner = cornerOf(slotsOffAccent(frame), 'TL');
  if (!corner) return null;
  const fit = fitMotif(frame, corner, {motif: 'glint', layer: 'front', nominal: glintExtent(length), min: glintExtent(GLINT.min)});
  return fit && clear(fit, taken) ? {...fit, size: Math.min(length, 2 * (fit.extent - GLINT.width / 2 - INK))} : null;
};

type Run = {slot: OrnamentSlotId; from: number; to: number; at: (along: number, offset: number) => Point};

/**
 * Twinkles every TWINKLE_PITCH px, big and small in turn, on the outline (the band's centreline on
 * a screen): along the top edge between the motifs near it, and along each side edge between the
 * motifs near that side. Each slides up to TWINKLE_SLIDE px off the line to fit, and a big one that
 * does not fit tries the small size.
 */
const placeTwinkles = (frame: OrnamentFrame, taken: readonly OrnamentPlacement[]): OrnamentPlacement[] => {
  const lit = cloudLit(frame);
  const big = {size: TWINKLE_SIZES.big, extent: twinkleExtent(TWINKLE_SIZES.big, lit)};
  const small = {size: TWINKLE_SIZES.small, extent: twinkleExtent(TWINKLE_SIZES.small, lit)};
  const line = frame.fit === 'screen' ? frame.track : frame.outline;
  const offsets = scanAround(-TWINKLE_SLIDE, TWINKLE_SLIDE, 0);
  const gap = TWINKLE_MARGIN + big.extent;
  const {x, y, width, height} = line;
  const rr = clampRadius(line.radius, width, height);
  const nearTop = taken.filter((placement) => Math.abs(placement.y - y) < placement.extent + gap);
  const runs: Run[] = [{
    slot: 'top',
    from: Math.max(x + rr, ...nearTop.filter((placement) => placement.x < x + width / 2).map((placement) => placement.x + placement.extent + gap)),
    to: Math.min(x + width - rr, ...nearTop.filter((placement) => placement.x >= x + width / 2).map((placement) => placement.x - placement.extent - gap)),
    at: (along, offset) => ({x: along, y: y + offset}),
  }];
  for (const [slot, side] of [['left', x], ['right', x + width]] as const) {
    const near = taken.filter((placement) => Math.abs(placement.x - side) < placement.extent + gap);
    runs.push({
      slot,
      from: Math.max(y + rr, ...near.filter((placement) => placement.y < y + height / 2).map((placement) => placement.y + placement.extent + gap)),
      to: Math.min(y + height - rr, ...near.filter((placement) => placement.y >= y + height / 2).map((placement) => placement.y - placement.extent - gap)),
      at: (along, offset) => ({x: side + offset, y: along}),
    });
  }
  const twinkles: OrnamentPlacement[] = [];
  for (const run of runs) {
    const length = run.to - run.from;
    if (length < -1e-9) continue;
    const count = 1 + Math.floor(length / TWINKLE_PITCH + 1e-9);
    const first = run.from + (length - (count - 1) * TWINKLE_PITCH) / 2;
    for (let index = 0; index < count; index++) {
      const along = first + index * TWINKLE_PITCH;
      for (const spec of index % 2 === 0 ? [big, small] : [small]) {
        const spot = offsets.map((offset) => run.at(along, offset))
          .find((point) => fitsAt(frame, point.x, point.y, spec.extent, 'front') && clear({...point, extent: spec.extent}, [...taken, ...twinkles]));
        if (!spot) continue;
        twinkles.push({motif: 'twinkle', slot: run.slot, layer: 'front', x: spot.x, y: spot.y, extent: spec.extent, size: spec.size});
        break;
      }
    }
  }
  return twinkles;
};

/** Every motif of the set on this frame, hero first; [] when neither a cloud nor the hero twinkle fits. */
export const placeCloud = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement[] => {
  const cloud = placeHeroCloud(frame, ornamentSize);
  const hero = cloud ?? placeHeroTwinkle(frame, ornamentSize);
  if (!hero) return [];
  const placed: OrnamentPlacement[] = [hero];
  const add = (placement: OrnamentPlacement | null) => {
    if (placement) placed.push(placement);
  };
  if (cloud) {
    add(placeHeart(frame, cloud, placed));
    if (!frame.circle) add(placeSecondCloud(frame, cloud, placed));
    add(placeHollowHeart(frame, cloud, placed));
  }
  if (frame.circle) add(placeGlint(frame, placed));
  else placed.push(...placeTwinkles(frame, placed));
  return placed;
};
