import {MANSION_BAT} from '../../../../backgrounds/HauntedMansionLoop';
import {TAU} from '../../../../loop';
import {clampRadius, svgNumber} from '../../geometry';
import {cycleOf} from '../../motion';
import {ornamentPalette} from '../draw';
import {cornerSlot, fitMotif, floorHalf, harmonics, maxExtentAt, ornamentRandom, scanAround} from '../place';
import type {OrnamentBase, OrnamentCornerId, OrnamentFrame, OrnamentPlacement, OrnamentSet} from '../types';
import {meetsAccentSpan} from './midnight-place';

/**
 * 'haunted-mansion': one bat per file, the HauntedMansionLoop background's own bat (MANSION_BAT),
 * flying by the TR corner, the side of the background's moon. The owner chose it over the
 * lanterns, rose window and fence (2026-10-04): a single motif reads, several small ones get lost.
 *
 *   - ornamentSize = the bat's wingspan in px, tip to tip, limited by the room at its spot; below
 *     BAT_MIN_SPAN there is no bat and the schema refuses.
 *   - Rectangles: on the top edge, right of centre, as near the TR corner as the room allows (its
 *     centre a little above the edge, in the bleed). Circles: on the ring at 45° (up and right),
 *     moving along the ring towards the top until it clears a round block's accent arc. Where the
 *     whole bat does not fit there, the roomiest corner slot (TR first) takes it, smaller.
 *   - In front, clear of the text and the window. The fill is the background's (#080F18) with a
 *     lit rim in ornamentColors[1] (moonlight) towards the moon, up and to the right, and a thin
 *     edge in ornamentColors[0], so it reads over dark footage.
 *   - Motion at the background's rhythms: a small 1:2 figure-of-eight once per loop and a 2 Hz
 *     flap (the background's 32 per 16 s), between 0.5 and 1 so a paused frame never shows a sliver;
 *     the wings are open at frame 0.
 */

/** The bat's body reaches this share of its span from its centre (wing tip at (43, −16) of 86). */
export const BAT_REACH = Math.hypot(43, 16) / MANSION_BAT.span + 0.002;
/** The figure-of-eight's half-widths, as shares of the span. */
const SWAY_X = 0.07;
const SWAY_Y = 0.035;
/** The lit rim: the silhouette shifted this many px towards the moon; the edge's half-width rides on it. */
const RIM = 1.1;
const RIM_ALPHA = 0.62;
const INK = RIM + 0.35;
/** The smallest wingspan worth drawing, in px. */
export const BAT_MIN_SPAN = 12;
/** Where the moonlight comes from: up and to the right. */
const MOON = {x: Math.SQRT1_2, y: -Math.SQRT1_2} as const;
const HZ = {cycle: 1 / 16, flap: 2} as const;
const FLAP_MEAN = 0.75;
const FLAP_SWING = 0.25;

/** The circle that holds the bat in every frame, for a wingspan, and the wingspan an extent allows. */
export const batExtent = (span: number) => (BAT_REACH + Math.hypot(SWAY_X, SWAY_Y)) * span + INK;
export const batSpan = (extent: number) => (extent - INK) / (BAT_REACH + Math.hypot(SWAY_X, SWAY_Y));

type Spot = {x: number; y: number; extent: number};

/** The first of `points` with room for the whole bat, else the roomiest (earliest among equals); null when none has room. */
const firstFit = (frame: OrnamentFrame, points: readonly {x: number; y: number}[], nominal: number, accept: (spot: Spot) => boolean): Spot | null => {
  let best: Spot | null = null;
  for (const {x, y} of points) {
    const extent = floorHalf(Math.min(nominal, maxExtentAt(frame, x, y, 'front')));
    if (!(extent > 0)) continue;
    const spot = {x, y, extent};
    if (!accept(spot)) continue;
    if (extent >= nominal - 1e-9) return spot;
    if (!best || extent > best.extent + 1e-9) best = spot;
  }
  return best;
};

const ANGLE_STEP = Math.PI / 90;
/** Where the bat may go when its edge has no room for it: the corner slots (padding pockets on a Twitch panel), TR first. */
const FALLBACK: readonly OrnamentCornerId[] = ['TR', 'TL', 'BR', 'BL'];

/** The bat's preferred spot: the top edge near TR, or the ring from 45° towards the top. */
const edgeSpot = (frame: OrnamentFrame, ornamentSize: number, nominal: number, clear: (spot: Spot) => boolean): Spot | null => {
  const {outline} = frame;
  const points: {x: number; y: number}[] = [];
  if (frame.circle) {
    // y up: π/4 is up and to the right.
    const cx = outline.x + outline.width / 2;
    const cy = outline.y + outline.height / 2;
    const ring = outline.width / 2;
    const rhos = scanAround(ring - 24, ring + 72, ring + 10);
    for (let angle = Math.PI / 4; angle <= Math.PI / 2 + 1e-9; angle += ANGLE_STEP) {
      for (const rho of rhos) points.push({x: cx + rho * Math.cos(angle), y: cy - rho * Math.sin(angle)});
    }
  } else {
    // From just inside the TR corner's curve leftwards to the centre, a little above the top edge.
    const radius = clampRadius(outline.radius, outline.width, outline.height);
    const start = outline.x + outline.width - radius - 0.6 * ornamentSize;
    const middle = outline.x + outline.width / 2;
    const ys = scanAround(outline.y - 48, outline.y + 24, outline.y - 6);
    for (let x = Math.max(start, middle); x >= middle - 1e-9; x -= 4) for (const y of ys) points.push({x, y});
  }
  return firstFit(frame, points, nominal, clear);
};

/**
 * One bat: on its edge when the whole bat fits there; otherwise the roomiest of that spot and the
 * corner slots (TR, TL, BR, BL, earliest among equals), so a tight size still gets it, smaller.
 * None (the schema refuses) when even BAT_MIN_SPAN, or the nominal when smaller, fits nowhere.
 */
export const placeHauntedMansion = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement[] => {
  const nominal = batExtent(ornamentSize);
  const least = Math.min(batExtent(BAT_MIN_SPAN), floorHalf(nominal));
  const clear = (spot: Spot) => !meetsAccentSpan(frame, spot.x, spot.y, spot.extent);
  let best = edgeSpot(frame, ornamentSize, nominal, clear);
  if (!best || best.extent < nominal - 1e-9) {
    for (const slot of FALLBACK) {
      const fit = fitMotif(frame, cornerSlot(frame, slot), {motif: 'bat', layer: 'front', nominal, min: least, hero: true});
      if (fit && clear(fit) && (!best || fit.extent > best.extent + 1e-9)) best = fit;
    }
  }
  if (!best || best.extent < least - 1e-9) return [];
  return [{motif: 'bat', slot: 'TR', layer: 'front', x: best.x, y: best.y, extent: best.extent, size: Math.min(ornamentSize, batSpan(best.extent))}];
};

export type HauntedMansionOrnamentBatElement = OrnamentBase & {
  type: 'haunted-mansion-bat';
  span: number;
  flap: number;
  rotation: number;
  bodyColor: string;
  rimColor: string;
  edgeColor: string;
};

const set: OrnamentSet<HauntedMansionOrnamentBatElement> = {
  name: 'haunted-mansion',
  seedOffset: 20,
  minExtent: batExtent(BAT_MIN_SPAN),
  place(frame, style) {
    return placeHauntedMansion(frame, style.ornamentSize);
  },
  build(_frame, placements, style, frameIndex, durationInFrames) {
    const random = ornamentRandom(style.seed, set);
    const angle = TAU * cycleOf(frameIndex, durationInFrames);
    const loop = harmonics(HZ.cycle, style.durationSeconds);
    const flap = harmonics(HZ.flap, style.durationSeconds);
    const {cool, light} = ornamentPalette(style);
    return placements.map((placement, anchor) => {
      const phase = random() * TAU;
      // Wings open at frame 0 (flap ≥ 0.96): the flap's phase is a quarter turn, ±0.25 rad.
      const flapPhase = Math.PI / 2 + 0.5 * (random() - 0.5);
      const span = placement.size;
      return {
        type: 'haunted-mansion-bat', layer: placement.layer, anchor, opacity: 1,
        x: placement.x + SWAY_X * span * Math.cos(loop * angle + phase),
        y: placement.y + SWAY_Y * span * Math.sin(2 * loop * angle + phase),
        reach: BAT_REACH * span + INK, light: 0, lightOpacity: 0,
        span,
        flap: FLAP_MEAN + FLAP_SWING * Math.sin(flap * angle + flapPhase),
        rotation: -6 + 6 * Math.sin(loop * angle + phase),
        bodyColor: MANSION_BAT.fill, rimColor: light, edgeColor: cool,
      };
    });
  },
  render(element, key) {
    return <MansionBat key={key} element={element} />;
  },
};

const BatShape = ({element, fill, opacity, stroke}: {element: HauntedMansionOrnamentBatElement; fill: string; opacity: number; stroke?: string}) => {
  const n = svgNumber;
  const edge = stroke ? {stroke, strokeWidth: 0.7, strokeOpacity: 0.55, vectorEffect: 'non-scaling-stroke' as const, strokeLinejoin: 'round' as const} : {};
  return (
    <g transform={`translate(${n(element.x)} ${n(element.y)}) rotate(${n(element.rotation)}) scale(${n(element.span / MANSION_BAT.span)})`} fill={fill} opacity={opacity}>
      <g transform={`scale(1 ${n(element.flap)})`}>
        <path d={MANSION_BAT.wings} {...edge} />
      </g>
      <path d={MANSION_BAT.body} {...edge} />
    </g>
  );
};

const MansionBat = ({element}: {element: HauntedMansionOrnamentBatElement}) => {
  const n = svgNumber;
  return (
    <g opacity={element.opacity}>
      {/* Moonlit rim: the silhouette in moonlight, shifted towards the moon, under the body. */}
      <g transform={`translate(${n(MOON.x * RIM)} ${n(MOON.y * RIM)})`}>
        <BatShape element={element} fill={element.rimColor} opacity={RIM_ALPHA} />
      </g>
      <BatShape element={element} fill={element.bodyColor} opacity={1} stroke={element.edgeColor} />
    </g>
  );
};

export const hauntedMansionSet = set;
