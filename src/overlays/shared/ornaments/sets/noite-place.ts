import {insetRect} from '../../geometry';
import {cornerSlots, floorHalf, fitMotif, maxExtentAt, scanAround, slotsOffAccent, type OrnamentCorner} from '../place';
import type {OrnamentCornerId, OrnamentFrame, OrnamentLayerName, OrnamentPlacement} from '../types';

/**
 * Where the 'noite' set (HalloweenLoop: "Noite de lua") puts its motifs. Pure function of the
 * frame and ornamentSize: no seed, no frame index.
 *
 * `ornamentSize` is the MOON's diameter in px (the hero). The other motifs keep fixed ratios to it
 * (NOITE_RATIOS) up to fixed px caps: bats of 0.85, 0.7 and 0.6 of it in wingspan (at most 40, 34
 * and 30 px), a large jack-o'-lantern as wide as the moon (at most 48 px), its small companion 0.72
 * of it (at most 36) and a single one 0.8 of it (at most 42). Each is then limited to the room at
 * its spot (never the box's size); a secondary below its minimum is left out.
 *
 *   - Moon (hero): behind the panel or frame, centred just outside the TR corner so it rises
 *     behind it, with a halo of 1.25 r (the halo shrinks first, down to 1.1 r, when room is short).
 *     In front where the back has no room: screen (the band covers the rest of the box) and a panel
 *     without bleed (twitch-panel), where it sits in the padding pocket, with no halo.
 *   - Bats: in front, 1–3 in the sky next to the moon (the top bleed on rectangles, along the ring
 *     on circles), one crossing the moon's limb as in the background; on top edges of 900 px or
 *     more, a second flock of two (32 and 28 px) in the middle of the free run.
 *   - Pumpkins: in front, a pair (large + small) at BL and a single one at BR, sitting on the
 *     corner like the background's pairs at its lower corners.
 *   - Stars: in front, the background's 4-point stars along long edges at a fixed 168 px pitch
 *     (more stars on longer edges, never bigger ones), so big frames never look bare. Along the
 *     bottom edge, between the pumpkins, the background's embers (its ground third has embers,
 *     not stars) alternate with small stars at the same pitch.
 *
 * On a round block the accent arc covers 120° of the ring (two corner slots). The moon is a back
 * motif, which the ring's stroke and the arc paint over, so it keeps its TR corner (the first of
 * TR, TL, BR, BL that fits) with any accent. Only the front motifs avoid the arc: the pumpkins take
 * the free bottom slots (slotsOffAccent) and the bats go along the ring away from the arc
 * (clockwise from the moon when the arc is on top), dropping any whose circle would meet it.
 */

/** Motif ratios to ornamentSize (the moon's diameter). */
export const NOITE_RATIOS = {
  /** Wingspans of the bats, nearest the moon first. */
  bats: [0.85, 0.7, 0.6],
  /** The pair's large pumpkin, its small companion, the single one (body width). */
  pumpkinLarge: 1,
  pumpkinSmall: 0.72,
  pumpkinSingle: 0.8,
} as const;

/**
 * The moon's halo reaches 1.25 r (the background's is wider, but a light may not eat the room the
 * body needs: light ≤ reach + max(4, 0.25·reach)); at least 1.1 r when room is short.
 */
export const MOON_HALO = 1.25;
export const MOON_HALO_MIN = 1.1;
/** The hero's minimum extent (px): a moon of Ø ≥ 15 with its halo, Ø 18 without. */
export const MOON_MIN_EXTENT = 9;

/** A bat's body reaches 0.54 of its wingspan from its centre (wing tip at (40, −16) of 80). */
export const BAT_REACH = 0.54;
/** Its small figure-of-eight flight: ±0.07 of the span across, ±0.035 up and down (the body gets the room). */
export const BAT_SWAY_X = 0.07;
export const BAT_SWAY_Y = 0.035;
/** The whole bat (body and flight) fits a circle of this share of its span. */
export const BAT_EXTENT = BAT_REACH + Math.hypot(BAT_SWAY_X, BAT_SWAY_Y);
/** Smallest bat wingspan worth drawing, in px. */
export const BAT_MIN_SPAN = 22;
/** The trio's wingspans never exceed these px (room still decides below them), nearest the moon first. */
export const BAT_MAX_SPANS = [40, 34, 30] as const;
/**
 * The second flock (top edges of FLOCK_FROM px or more): fixed wingspans, 64 px apart. They are
 * asked 2 px above the 32/28 px targets because placement floors the extent to 0.5 px, which
 * costs a bat up to 0.8 px of span (34 → 33.2, 30 → 29.2).
 */
export const FLOCK_SPANS = [34, 30] as const;
export const FLOCK_GAP = 64;
export const FLOCK_FROM = 900;
/** The bat's moonlit rim: its silhouette shifted this many px towards the moon. */
export const BAT_RIM = 1.1;
/**
 * Ink beyond the silhouette's own reach, in px (the rim's shift plus half the 0.7 px non-scaling
 * edge stroke): part of the element's reach and of the placement's extent.
 */
export const BAT_INK = BAT_RIM + 0.35;
/** A bat's extent for a wingspan, and the wingspan an extent allows. */
export const batExtent = (span: number) => BAT_EXTENT * span + BAT_INK;
export const batSpan = (extent: number) => (extent - BAT_INK) / BAT_EXTENT;

/**
 * A pumpkin (the background's Pumpkin, width 200 at scale 1) fits a circle of 0.55 of its width
 * centred 0.39 of its width above its base, leaning ±3°. Its warm glow reaches 1.2 times that.
 */
export const PUMPKIN_REACH = 0.55;
export const PUMPKIN_CENTER = 0.39;
export const PUMPKIN_LIGHT = 1.12;
/** Smallest pumpkin width worth drawing, in px. */
export const PUMPKIN_MIN_WIDTH = 20;
/** The pumpkins' widths never exceed these px (large, small companion, single); room decides below. */
export const PUMPKIN_MAX = {large: 48, small: 36, single: 42} as const;

/** Whether the set's motifs carry a soft light here (not on a panel without glow: crisp GIF). */
export const noiteLit = (frame: Pick<OrnamentFrame, 'glow'>) => frame.glow > 0;

/** The moon's disc radius and halo radius for a placement of `extent` (light 0 when unlit). */
export const moonShape = (extent: number, diameter: number, lit: boolean) => {
  if (!lit) {
    const r = Math.min(diameter / 2, extent);
    return {r, halo: 0};
  }
  const r = Math.min(diameter / 2, extent / MOON_HALO_MIN);
  return {r, halo: Math.min(extent, MOON_HALO * r)};
};

/** Half the accent arc of a round block (BlockLoop's ACCENT_ARC_SPREAD), around the left or the top. */
const ACCENT_SPREAD = Math.PI / 3;

/** How far (radians) a bat on a ring may move on to clear the accent arc, and in what steps. */
const BAT_ARC_SEARCH = Math.PI / 3;
const BAT_ARC_STEP = Math.PI / 90;

/**
 * On a panel without bleed (twitch-panel) the front moon's disc fills its extent, so it would
 * touch the image's edge and cover the frame stroke's corner: there (and only for the moon, whose
 * disc fills its circle) the paint limit is taken this many px further in.
 */
export const PANEL_MOON_INSET = 6;

/** A panel whose file is its box (no bleed): twitch-panel. */
const bleedless = (frame: OrnamentFrame) => frame.fit === 'panel'
  && frame.box.x === frame.canvas.x && frame.box.y === frame.canvas.y
  && frame.box.width === frame.canvas.width && frame.box.height === frame.canvas.height;

/** Order the moon tries the corners in. */
const MOON_SLOTS: readonly OrnamentCornerId[] = ['TR', 'TL', 'BR', 'BL'];
const BOTTOM_SLOTS: readonly OrnamentCornerId[] = ['BL', 'BR'];

type Spot = {x: number; y: number; extent: number};

/**
 * The best of `points` for a motif asking for `nominal`: the largest min(nominal, room), floored
 * to 0.5 px, and among equals the earliest (callers order points by preference). Null below `min`.
 */
const bestSpot = (
  frame: OrnamentFrame, points: readonly {x: number; y: number}[], nominal: number, min: number, layer: OrnamentLayerName,
): Spot | null => {
  let best: Spot | null = null;
  for (const {x, y} of points) {
    const extent = floorHalf(Math.min(nominal, maxExtentAt(frame, x, y, layer)));
    if (!(extent > 0)) continue;
    if (!best || extent > best.extent + 1e-9) best = {x, y, extent};
  }
  return best && best.extent >= min - 1e-9 ? best : null;
};

const center = (frame: OrnamentFrame) => ({x: frame.outline.x + frame.outline.width / 2, y: frame.outline.y + frame.outline.height / 2});
/** A point at `angle` (radians, counter-clockwise from the right, y up on screen) and distance `rho` from the outline's centre. */
const polar = (frame: OrnamentFrame, angle: number, rho: number) => {
  const c = center(frame);
  return {x: c.x + rho * Math.cos(angle), y: c.y - rho * Math.sin(angle)};
};
const angleOf = (frame: OrnamentFrame, x: number, y: number) => {
  const c = center(frame);
  return Math.atan2(c.y - y, x - c.x);
};

const placement = (motif: string, slot: OrnamentPlacement['slot'], spot: Spot, size: number): OrnamentPlacement => ({
  motif, slot, layer: 'front', x: spot.x, y: spot.y, extent: spot.extent, size,
});

/**
 * The accent arc's angular span on a round block, [from, to] in radians (counter-clockwise from
 * the right, y up): 30°–150° for topo, 120°–240° for esquerda. Null without one.
 */
export const accentSpan = (frame: Pick<OrnamentFrame, 'circle' | 'accent'>): readonly [number, number] | null => {
  if (!frame.circle || !frame.accent) return null;
  const middle = frame.accent === 'topo' ? Math.PI / 2 : Math.PI;
  return [middle - ACCENT_SPREAD, middle + ACCENT_SPREAD];
};

/** Whether a circle of radius `extent` at (x, y) meets the angular span (as seen from the outline's centre). */
export const meetsAccentSpan = (frame: OrnamentFrame, x: number, y: number, extent: number) => {
  const span = accentSpan(frame);
  if (!span) return false;
  const c = center(frame);
  const distance = Math.hypot(x - c.x, y - c.y);
  if (distance <= extent) return true;
  const half = Math.asin(extent / distance);
  const middle = (span[0] + span[1]) / 2;
  // Angular distance from the span's middle, wrapped to [0, π].
  const offset = Math.abs(((Math.atan2(c.y - y, x - c.x) - middle) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
  return offset - half < (span[1] - span[0]) / 2;
};

/** The moon: behind at the first corner that fits (in front on screen and without bleed); null when it fits nowhere. */
const placeMoon = (frame: OrnamentFrame, corners: readonly OrnamentCorner[], diameter: number): OrnamentPlacement | null => {
  const lit = noiteLit(frame);
  const nominal = (lit ? MOON_HALO : 1) * diameter / 2;
  for (const slot of MOON_SLOTS) {
    const corner = corners.find((entry) => entry.slot === slot);
    if (!corner) continue;
    // Rising behind the corner: its centre a quarter radius beyond the outline's own corner.
    const radius = Math.min(frame.outline.radius, frame.outline.width / 2, frame.outline.height / 2);
    const prefer = (frame.circle ? 0 : radius * (Math.SQRT2 - 1)) + diameter / 8;
    const back = fitMotif(frame, corner, {motif: 'moon', layer: 'back', nominal, min: MOON_MIN_EXTENT, prefer, hero: true});
    // Behind wherever it fits; otherwise (screen, a panel without bleed) in front, tucked into the
    // corner (PANEL_MOON_INSET px clear of the edge on a panel without bleed).
    if (back) return {...back, size: 2 * moonShape(back.extent, diameter, lit).r};
    const room = bleedless(frame) ? {...frame, paintLimit: insetRect(frame.paintLimit, PANEL_MOON_INSET)} : frame;
    const front = fitMotif(room, corner, {motif: 'moon', layer: 'front', nominal, min: MOON_MIN_EXTENT, hero: true});
    if (front) return {...front, size: 2 * moonShape(front.extent, diameter, lit).r};
  }
  return null;
};

/** Whether a bat at `spot` (its whole flight) would meet a pumpkin's body. */
const meetsPumpkin = (spot: Spot, pumpkins: readonly OrnamentPlacement[]) =>
  pumpkins.some((pumpkin) => Math.hypot(spot.x - pumpkin.x, spot.y - pumpkin.y) < spot.extent + PUMPKIN_REACH * pumpkin.size);

/** The trio's wingspans for a moon of `diameter`: its ratios, capped at BAT_MAX_SPANS px. */
export const trioSpans = (diameter: number) => NOITE_RATIOS.bats.map((ratio, index) => Math.min(ratio * diameter, BAT_MAX_SPANS[index]!));

/**
 * 1–3 bats next to the moon: along the top edge on rectangles, along the ring on circles. A bat
 * that would meet a pumpkin is left out (on a small ring, the ones after it too).
 */
const placeBats = (
  frame: OrnamentFrame, moon: OrnamentPlacement, diameter: number, pumpkins: readonly OrnamentPlacement[],
): OrnamentPlacement[] => {
  const spans = trioSpans(diameter);
  const count = frame.circle ? (frame.kind === 'border' ? 3 : 2) : frame.box.width >= 1000 ? 3 : frame.box.width >= 360 ? 2 : 1;
  const bats: OrnamentPlacement[] = [];
  const moonR = moon.size / 2;
  const minExtent = batExtent(BAT_MIN_SPAN);
  if (!frame.circle) {
    // Leftwards from the moon (always at TR on a rectangle), the first crossing its limb.
    const top = frame.outline.y;
    let x = moon.x - 0.9 * moonR - 0.3 * spans[0]!;
    for (let index = 0; index < count; index++) {
      const span = spans[index]!;
      if (index > 0) x -= 0.75 * (spans[index - 1]! + span);
      const prefer = top - [8, 13, 6][index]!;
      const ys = scanAround(top - 48, top + 48, prefer);
      const spot = bestSpot(frame, ys.map((y) => ({x, y})), batExtent(span), minExtent, 'front');
      if (spot && !meetsPumpkin(spot, pumpkins)) bats.push(placement('bat', 'top', spot, batSpan(spot.extent)));
    }
    return bats;
  }
  // Along the ring from the moon: counter-clockwise (towards the top from TR), or clockwise when
  // the accent arc is on top, so the bats fly away from it. A bat that would meet the arc moves on
  // along the ring (up to BAT_ARC_SEARCH) until it clears it, and is left out if it never does.
  const ring = frame.outline.width / 2;
  const turn = frame.accent === 'topo' ? -1 : 1;
  const rhos = scanAround(ring - 24, ring + 72, ring + 10);
  const moonAngle = angleOf(frame, moon.x, moon.y);
  let angle = moonAngle;
  bats: for (let index = 0; index < count; index++) {
    const span = spans[index]!;
    const step = index === 0 ? 0.9 * moonR + 0.45 * span : 0.75 * (spans[index - 1]! + span);
    const from = angle + turn * step / (ring + 12);
    for (let moved = 0; moved <= BAT_ARC_SEARCH + 1e-9; moved += BAT_ARC_STEP) {
      const at = from + turn * moved;
      const spot = bestSpot(frame, rhos.map((rho) => polar(frame, at, rho)), batExtent(span), minExtent, 'front');
      if (!spot || meetsAccentSpan(frame, spot.x, spot.y, spot.extent)) continue;
      if (meetsPumpkin(spot, pumpkins)) break bats;
      bats.push(placement('bat', 'top', spot, batSpan(spot.extent)));
      angle = at;
      break;
    }
  }
  return bats;
};

/**
 * The second flock on long top edges (box width ≥ FLOCK_FROM): two bats of fixed wingspans,
 * FLOCK_GAP px apart, centred in the free run between TL + 96 and the trio − 96.
 */
const placeFlock = (frame: OrnamentFrame, moon: OrnamentPlacement, trio: readonly OrnamentPlacement[]): OrnamentPlacement[] => {
  if (frame.circle || frame.box.width < FLOCK_FROM) return [];
  const top = frame.outline.y;
  const from = frame.outline.x + 96;
  const to = Math.min(moon.x - moon.extent, ...trio.map((bat) => bat.x)) - 96;
  if (to - from < FLOCK_GAP + 2 * batExtent(FLOCK_SPANS[0])) return [];
  const middle = (from + to) / 2;
  const flock: OrnamentPlacement[] = [];
  FLOCK_SPANS.forEach((span, index) => {
    const x = middle + (index === 0 ? -1 : 1) * FLOCK_GAP / 2;
    const ys = scanAround(top - 48, top + 48, top - [10, 4][index]!);
    const spot = bestSpot(frame, ys.map((y) => ({x, y})), batExtent(span), batExtent(BAT_MIN_SPAN), 'front');
    if (spot) flock.push(placement('bat', 'top', spot, batSpan(spot.extent)));
  });
  return flock;
};

/** The pumpkins: a large + small pair at the first free bottom corner, a single one at the other. */
const placePumpkins = (frame: OrnamentFrame, corners: readonly OrnamentCorner[], moon: OrnamentPlacement, diameter: number) => {
  const reach = PUMPKIN_REACH * (noiteLit(frame) ? PUMPKIN_LIGHT : 1);
  const free = BOTTOM_SLOTS.map((slot) => corners.find((corner) => corner.slot === slot && slot !== moon.slot))
    .filter((corner): corner is OrnamentCorner => !!corner);
  const result: OrnamentPlacement[] = [];
  const min = reach * PUMPKIN_MIN_WIDTH;
  free.forEach((corner, index) => {
    const width = index === 0
      ? Math.min(NOITE_RATIOS.pumpkinLarge * diameter, PUMPKIN_MAX.large)
      : Math.min(NOITE_RATIOS.pumpkinSingle * diameter, PUMPKIN_MAX.single);
    const large = fitMotif(frame, corner, {motif: 'pumpkin', layer: 'front', nominal: reach * width, min, ratio: 1 / reach});
    if (!large) return;
    result.push(large);
    if (index > 0) return;
    // The small companion, inwards along the bottom (the ring on a circle), standing on the same ground.
    const smallWidth = Math.min(NOITE_RATIOS.pumpkinSmall * diameter, PUMPKIN_MAX.small);
    const nominal = reach * smallWidth;
    const inward = corner.dx > 0 ? -1 : 1;
    const baseY = large.y + PUMPKIN_CENTER * large.size;
    let spot: Spot | null = null;
    for (const gap of [0.8, 0.95, 1.1, 1.3]) {
      const distance = gap * (large.extent + nominal);
      let points: {x: number; y: number}[];
      if (frame.circle) {
        const ring = frame.outline.width / 2;
        // Towards the bottom point of the ring (−90°).
        const angle = angleOf(frame, large.x, large.y) + (inward > 0 ? 1 : -1) * distance / (ring + 10);
        const rho = Math.hypot(large.x - center(frame).x, large.y - center(frame).y);
        points = scanAround(ring - 30, ring + 90, rho).map((value) => polar(frame, angle, value));
      } else {
        const x = large.x + inward * distance;
        const prefer = baseY - PUMPKIN_CENTER * (nominal / reach);
        points = scanAround(frame.outline.y + frame.outline.height - 40, frame.outline.y + frame.outline.height + 48, prefer).map((y) => ({x, y}));
      }
      const found = bestSpot(frame, points, nominal, min, 'front');
      if (found && (!spot || found.extent > spot.extent + 1e-9)) spot = found;
      if (spot && spot.extent >= nominal - 1e-9) break;
    }
    if (spot) result.push(placement('pumpkin-small', corner.slot, spot, spot.extent / reach));
  });
  return result;
};

/**
 * The background's own 4-point stars along the long edges, so big frames never look bare: at a
 * fixed STAR_PITCH, centred on the outline line (the band's centreline on screen), alternating a
 * big and a small one. Runs: the top edge from TL + 48 to 64 px short of the moon and its trio;
 * the sides from 64 px below the top corner's motifs to 64 px above the pumpkins; the bottom edge
 * between the pumpkins, 64 px clear of the inner one on each side (embers alternating with small
 * stars there, an ember first); on circles, the ring's arcs 64 px clear of every motif and of the
 * accent arc. Only runs of STAR_RUN_MIN px or
 * more get stars (floor(run / pitch) of them, centred); a spot closer than both extents + 16 px to
 * a moon, bat or pumpkin is skipped, and so is one whose star does not fit (maxExtentAt, front).
 */
export const STAR_PITCH = 168;
export const STAR_RUN_MIN = 336;
/**
 * The two star sizes: `scale` of the background's star path (tips at 4·scale, 18 and 12 px tall)
 * and the extent, which its soft light fills (reach + about 3.5 px, within reach + max(4, 0.25·reach)).
 */
export const STAR_SIZES = [{scale: 2.25, extent: 13}, {scale: 1.5, extent: 10}] as const;
/**
 * The background's ember (HalloweenLoop's ground embers): a moonlight core of radius `core` on
 * a dark disc `outline` px wider (it keeps the dot over white footage), a soft disc
 * of radius `disc` (moonlight → warm @0.75 at 0.2 → 0: its light) and an in-place orbit of
 * radius `orbit`, one turn per loop. The body reaches core + outline; unlit (glow 0) the disc is
 * off and the extent shrinks to the orbit plus the body. As in the background, the soft disc is
 * what reads as the ember (a 20 px warm point, mid-range of the background's r 6–14 discs, wide
 * enough to survive 4:2:0 chroma), so it may exceed the other motifs' light budget: its extent
 * (orbit + disc) is a big star's.
 */
export const EMBER = {core: 1.8, outline: 1.0, disc: 10, orbit: 3} as const;
export const EMBER_REACH = EMBER.core + EMBER.outline;
export const emberExtent = (lit: boolean) => Math.ceil(2 * (EMBER.orbit + (lit ? EMBER.disc : EMBER_REACH))) / 2;
/** Clearance of the runs from the corner motifs, and of a star from any other motif (beyond both extents). */
const STAR_RUN_MARGIN = 64;
const STAR_SKIP_GAP = 16;
/** How far (px) a star may leave its line, inwards or outwards, to fit. */
const STAR_SLIDE = 16;

type RunMotif = {motif: 'star' | 'star-small' | 'ember'; extent: number; size: number};
type Run = {
  points: (s: number) => {x: number; y: number}[]; from: number; to: number; slot: (spot: Spot) => OrnamentPlacement['slot'];
  /** The motif for the run's `index`-th spot (default: the stars' big/small alternation, counted over every run). */
  pick?: (index: number) => RunMotif;
};

const placeStars = (frame: OrnamentFrame, motifs: readonly OrnamentPlacement[], corners: readonly OrnamentPlacement[]): OrnamentPlacement[] => {
  const stars: OrnamentPlacement[] = [];
  const line = frame.fit === 'screen' ? frame.track : frame.outline;
  const offsets = scanAround(-STAR_SLIDE, STAR_SLIDE, 0);
  const runs: Run[] = [];
  if (!frame.circle) {
    const {x, y, width, height} = line;
    const right = x + width;
    const bottom = y + height;
    const rr = Math.min(line.radius, width / 2, height / 2);
    const inset = Math.max(48, rr);
    // Corner motifs near a line (within their extent + the margin): they end the run.
    const near = (p: OrnamentPlacement, distance: number) => distance < p.extent + STAR_RUN_MARGIN;
    const topBlock = corners.filter((p) => near(p, Math.abs(p.y - y)));
    runs.push({
      slot: () => 'top', from: x + inset,
      to: Math.min(right - inset, ...topBlock.filter((p) => p.x > x + width / 2).map((p) => p.x - p.extent - STAR_RUN_MARGIN)),
      points: (s) => offsets.map((offset) => ({x: s, y: y + offset})),
    });
    for (const [slot, sideX] of [['left', x], ['right', right]] as const) {
      const block = corners.filter((p) => near(p, Math.abs(p.x - sideX)));
      runs.push({
        slot: () => slot,
        from: Math.max(y + rr, ...block.filter((p) => p.y < y + height / 2).map((p) => p.y + p.extent)) + STAR_RUN_MARGIN,
        to: Math.min(bottom - rr, ...block.filter((p) => p.y >= y + height / 2).map((p) => p.y - p.extent)) - STAR_RUN_MARGIN,
        points: (s) => offsets.map((offset) => ({x: sideX + offset, y: s})),
      });
    }
    // The bottom edge, between the pumpkins (64 px clear of the inner one on each side): embers
    // alternating with small stars.
    const bottomBlock = corners.filter((p) => near(p, Math.abs(p.y - bottom)));
    const ember: RunMotif = {motif: 'ember', extent: emberExtent(noiteLit(frame)), size: 2 * EMBER.disc};
    const small: RunMotif = {motif: 'star-small', extent: STAR_SIZES[1].extent, size: 8 * STAR_SIZES[1].scale};
    runs.push({
      slot: () => 'bottom',
      from: Math.max(x + inset, ...bottomBlock.filter((p) => p.x < x + width / 2).map((p) => p.x + p.extent + STAR_RUN_MARGIN)),
      to: Math.min(right - inset, ...bottomBlock.filter((p) => p.x >= x + width / 2).map((p) => p.x - p.extent - STAR_RUN_MARGIN)),
      points: (s) => offsets.map((offset) => ({x: s, y: bottom + offset})),
      pick: (index) => (index % 2 === 0 ? ember : small),
    });
  } else {
    // The ring's free arcs, in arc length (px) at its radius, sampled every degree.
    const ring = line.width / 2;
    const step = Math.PI / 180;
    const free = (angle: number) => {
      const at = polar(frame, angle, ring);
      if (meetsAccentSpan(frame, at.x, at.y, STAR_SIZES[0].extent)) return false;
      return !corners.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < p.extent + STAR_SIZES[0].extent + STAR_RUN_MARGIN);
    };
    const flags = Array.from({length: 360}, (_, index) => free(index * step));
    const start = flags.indexOf(false);
    if (start >= 0) {
      // Walk once around from a blocked degree, collecting the free stretches.
      let begin = -1;
      for (let offset = 1; offset <= 360; offset++) {
        const index = start + offset;
        const open = flags[index % 360]!;
        if (open && begin < 0) begin = index;
        if (!open && begin >= 0) {
          const [a, b] = [begin * step, (index - 1) * step];
          runs.push({slot: (spot) => (spot.x < center(frame).x ? 'left' : 'right'), from: a * ring, to: b * ring, points: (s) => offsets.map((offset) => polar(frame, s / ring, ring + offset))});
          begin = -1;
        }
      }
    }
  }
  for (const run of runs) {
    const length = run.to - run.from;
    if (length < STAR_RUN_MIN - 1e-9) continue;
    const count = Math.floor(length / STAR_PITCH + 1e-9);
    const first = run.from + (length - (count - 1) * STAR_PITCH) / 2;
    for (let index = 0; index < count; index++) {
      const big = stars.filter((p) => p.motif.startsWith('star')).length % 2 === 0;
      const star = STAR_SIZES[big ? 0 : 1];
      const want: RunMotif = run.pick?.(index) ?? {motif: big ? 'star' : 'star-small', extent: star.extent, size: 8 * star.scale};
      const spot = bestSpot(frame, run.points(first + index * STAR_PITCH), want.extent, want.extent, 'front');
      if (!spot) continue;
      if (motifs.some((p) => Math.hypot(p.x - spot.x, p.y - spot.y) < p.extent + spot.extent + STAR_SKIP_GAP)) continue;
      stars.push(placement(want.motif, run.slot(spot), spot, want.size));
    }
  }
  return stars;
};

/**
 * The whole set, hero first: the moon, the trio of bats, the pumpkins, then the second flock and
 * the stars of long edges; [] when the moon fits nowhere.
 */
export const placeNoite = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement[] => {
  const moon = placeMoon(frame, cornerSlots(frame), ornamentSize);
  if (!moon) return [];
  const pumpkins = placePumpkins(frame, slotsOffAccent(frame), moon, ornamentSize);
  const trio = placeBats(frame, moon, ornamentSize, pumpkins);
  const corners = [moon, ...trio, ...pumpkins];
  const flock = placeFlock(frame, moon, trio);
  const stars = placeStars(frame, [...corners, ...flock], corners);
  return [moon, ...trio, ...pumpkins, ...flock, ...stars];
};
