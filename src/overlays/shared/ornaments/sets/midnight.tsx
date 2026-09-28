import {
  BAT_BODY, BAT_WING_LEFT, BAT_WING_RIGHT, Pumpkin,
} from '../../../../backgrounds/halloween/HalloweenArtwork';
import {TAU} from '../../../../loop';
import {svgNumber} from '../../geometry';
import {MAX_CONTENT_OPACITY} from '../../legibility';
import {cycleOf} from '../../motion';
import {mixColor, ornamentPalette, ornamentPartId, paint, RadialLight, unitToward} from '../draw';
import {harmonics, meetsKeepOut, ornamentRandom} from '../place';
import type {OrnamentBase, OrnamentSet} from '../types';
import {
  BAT_INK, BAT_REACH, BAT_RIM, BAT_SWAY_X, BAT_SWAY_Y, EMBER, EMBER_REACH, MOON_MIN_EXTENT, moonShape, midnightLit, placeMidnight,
  PUMPKIN_CENTER, PUMPKIN_LIGHT, PUMPKIN_REACH, STAR_SIZES,
} from './midnight-place';

/**
 * The 'midnight' ornaments (HalloweenLoop, "Noite de lua"): bats flying by the TR corner, jack-o'-lanterns sitting on the lower corners and, along long
 * edges, the background's 4-point stars twinkling (plus a second flock on long top edges and the
 * background's embers orbiting in place along long bottom edges), in the
 * background's own palette (ornamentColors: [0] mist lavender, [1] moonlight cream, [2] pumpkin
 * orange) and rhythms (bats flap at 2 Hz on a small 1:2 figure-of-eight; the pumpkins' faces
 * flicker at the background's 3 and 7 harmonics of 12 s, i.e. 0.25 and 0.58 Hz). Placement and
 * sizes: midnight-place.ts (ornamentSize = moon diameter). The moon keeps its place and element (the
 * set's hero: the bats' corner, the side their moonlit rim faces, the refusal) but is never painted.
 */

/** The background's bat fill, #171021: the mist darkened this far towards #0A050F. */
const BAT_NIGHT = '#0A050F';
const BAT_DARKEN = 0.91;
/** The pumpkin's warm floor light (#fbb566 in the background). */
const PUMPKIN_GLOW = '#FBB566';

/** The background's rhythms, in Hz (its loop is 12 s): moon halo and bat flight 1/12, flap 2, flicker 3/12 and 7/12. */
const HZ = {cycle: 1 / 12, flap: 2, flickerSlow: 3 / 12, flickerFast: 7 / 12} as const;

/** Peak alpha of a pumpkin's warm light (under the text-area cap). */
const PUMPKIN_LIGHT_ALPHA = 0.18;
/** Bats: opacity nearest the moon first (the background's depth, kept readable over footage). */
const BAT_OPACITY = [1, 0.94, 0.88];
/** The alpha of a bat's lit rim (BAT_RIM px towards the moon; ≥ 0.45 in moonlight colour). */
const BAT_RIM_ALPHA = 0.62;
/** Pumpkins narrower than this (px) leave out the background's thin coloured line details. */
const PUMPKIN_FINE_FROM = 60;
/** Leans of the pumpkins (the background's ±2–3°). */
const PUMPKIN_LEAN = [-3, 2, 3];
/**
 * Wing flap of the overlay bats: 0.5–1.0 (never folded to a faint sliver on a paused frame or a
 * GIF frame), at 2 Hz.
 */
const FLAP_MEAN = 0.75;
const FLAP_SWING = 0.25;
/** Stars: a lit core fading to the moonlight, a dark outline for light footage, a soft light. */
const STAR_CORE = '#FFF7DE';
const STAR_OUTLINE = {color: '#120C1C', opacity: 0.6, width: 0.9} as const;
/** Half the outline's width counts in the star's reach (its tips reach 4·scale). */
const STAR_INK = STAR_OUTLINE.width / 2;
const STAR_LIGHT_ALPHA = 0.18;
/** Twinkle: 0.6 + 0.4·cos(k·φ + ψ), |ψ| ≤ 0.6 so frame 0 is ≥ 0.93 (the pack's PNG shows them lit). */
const TWINKLE_MEAN = 0.6;
const TWINKLE_SWING = 0.4;
const TWINKLE_PHASE = 1.2;
/**
 * Embers: the soft disc's peak alpha (0.2 where it meets the text) breathing 0.8 ± 0.2 twice per
 * loop like the background's (frame 0 near its peak); a dark disc under the core for light footage.
 */
const EMBER_LIGHT_ALPHA = 0.85;
const EMBER_BREATH_MEAN = 0.8;
const EMBER_BREATH_SWING = 0.2;
const EMBER_OUTLINE = {color: '#120C1C', opacity: 0.6} as const;

/** The moon's place, kept as an element (the set's hero) but never painted. */
type MoonElement = OrnamentBase & {type: 'midnight-moon'};
type BatElement = OrnamentBase & {
  type: 'midnight-bat'; span: number; flap: number; rotation: number; ux: number; uy: number; bodyColor: string; rimColor: string; edgeColor: string;
};
type PumpkinElement = OrnamentBase & {
  type: 'midnight-pumpkin'; width: number; glow: number; rotation: number; color: string; glowColor: string;
};
type StarElement = OrnamentBase & {
  type: 'midnight-star'; scale: number; color: string; coreColor: string;
};
type EmberElement = OrnamentBase & {
  type: 'midnight-ember'; core: number; color: string; warmColor: string;
};
type MidnightOrnamentElement = MoonElement | BatElement | PumpkinElement | StarElement | EmberElement;

const set: OrnamentSet<MidnightOrnamentElement> = {
  name: 'midnight',
  seedOffset: 0,
  minExtent: MOON_MIN_EXTENT,
  place(frame, style) {
    return placeMidnight(frame, style.ornamentSize);
  },
  build(frame, placements, style, frameIndex, durationInFrames) {
    const random = ornamentRandom(style.seed, set);
    const cycle = cycleOf(frameIndex, durationInFrames);
    const seconds = style.durationSeconds;
    const loop = harmonics(HZ.cycle, seconds);
    const flap = harmonics(HZ.flap, seconds);
    const slow = harmonics(HZ.flickerSlow, seconds);
    const fast = harmonics(HZ.flickerFast, seconds);
    const lit = midnightLit(frame);
    const {cool, light, warm} = ornamentPalette(style);
    const moon = placements[0]!;
    const angle = TAU * cycle;
    let bat = 0;
    let pumpkin = 0;
    let star = 0;
    return placements.map((placement, anchor): MidnightOrnamentElement => {
      // Every element draws its phases, used or not, so one motif never shifts another's.
      const phase = random() * TAU;
      const jitter = random() - 0.5;
      const base = {layer: placement.layer, anchor, opacity: 1};
      if (placement.motif === 'moon') {
        return {...base, type: 'midnight-moon', x: placement.x, y: placement.y, reach: moonShape(placement.extent, placement.size, lit).r, light: 0, lightOpacity: 0};
      }
      if (placement.motif === 'bat') {
        const index = bat++;
        const span = placement.size;
        // Wings open at frame 0 (flap ≥ 0.96): the flap's phase is a quarter turn, ±0.25 rad.
        const flapPhase = Math.PI / 2 + 0.5 * jitter;
        const x = placement.x + BAT_SWAY_X * span * Math.cos(loop * angle + phase);
        const y = placement.y + BAT_SWAY_Y * span * Math.sin(2 * loop * angle + phase);
        const toward = unitToward(x, y, moon.x, moon.y);
        return {
          ...base, type: 'midnight-bat', x, y, reach: BAT_REACH * span + BAT_INK, light: 0, lightOpacity: 0,
          opacity: BAT_OPACITY[index] ?? 0.88,
          span,
          flap: FLAP_MEAN + FLAP_SWING * Math.sin(flap * angle + flapPhase),
          rotation: -4 + 8 * Math.sin(loop * angle + phase),
          ux: toward.x, uy: toward.y,
          bodyColor: mixColor(cool, BAT_NIGHT, BAT_DARKEN), rimColor: light, edgeColor: cool,
        };
      }
      if (placement.motif === 'ember') {
        // An in-place orbit, one turn per loop; its disc breathes twice per loop, near its peak at frame 0.
        const orbit = loop * angle + phase;
        const breath = EMBER_BREATH_MEAN + EMBER_BREATH_SWING * Math.cos(2 * loop * angle + TWINKLE_PHASE * jitter);
        const lightRadius = lit ? EMBER.disc : 0;
        // Capped once per placement (its whole orbit), so the cap never switches on and off as it moves.
        const cap = meetsKeepOut(frame, placement.x, placement.y, placement.extent) ? MAX_CONTENT_OPACITY : 1;
        return {
          ...base, type: 'midnight-ember', x: placement.x + EMBER.orbit * Math.cos(orbit), y: placement.y + EMBER.orbit * Math.sin(orbit),
          reach: EMBER_REACH, light: lightRadius, lightOpacity: lightRadius > 0 ? Math.min(cap, EMBER_LIGHT_ALPHA * breath) : 0,
          core: EMBER.core, color: light, warmColor: warm,
        };
      }
      if (placement.motif.startsWith('star')) {
        // Every other star twinkles twice per loop; frame 0 is near full brightness.
        const k = (star++ % 2 === 0 ? 1 : 2) * loop;
        const twinkle = TWINKLE_MEAN + TWINKLE_SWING * Math.cos(k * angle + TWINKLE_PHASE * jitter);
        const size = STAR_SIZES[placement.motif === 'star' ? 0 : 1];
        const lightRadius = lit ? placement.extent : 0;
        return {
          ...base, type: 'midnight-star', x: placement.x, y: placement.y, reach: 4 * size.scale + STAR_INK, light: lightRadius,
          lightOpacity: lightRadius > 0 ? Math.min(MAX_CONTENT_OPACITY, STAR_LIGHT_ALPHA * twinkle) : 0,
          opacity: twinkle, scale: size.scale, color: light, coreColor: STAR_CORE,
        };
      }
      const index = pumpkin++;
      // The flicker sits near its mean at frame 0 (the pack's PNG): both phases within ±0.25 rad of 0 or π.
      const slowPhase = (phase < Math.PI ? 0 : Math.PI) + 0.5 * jitter;
      const fastPhase = (phase < Math.PI ? Math.PI : 0) - 0.5 * jitter;
      const glow = 0.78 + 0.13 * Math.sin(slow * angle + slowPhase) + 0.06 * Math.sin(fast * angle + fastPhase);
      const width = placement.size;
      const lightRadius = lit ? Math.min(placement.extent, PUMPKIN_LIGHT * PUMPKIN_REACH * width) : 0;
      const lightOpacity = lightRadius > 0 ? PUMPKIN_LIGHT_ALPHA * glow / 0.97 : 0;
      return {
        ...base, type: 'midnight-pumpkin', x: placement.x, y: placement.y, reach: PUMPKIN_REACH * width,
        light: lightRadius,
        lightOpacity: meetsKeepOut(frame, placement.x, placement.y, lightRadius) ? Math.min(MAX_CONTENT_OPACITY, lightOpacity) : lightOpacity,
        width, glow, rotation: PUMPKIN_LEAN[index % PUMPKIN_LEAN.length]!, color: warm, glowColor: mixColor(PUMPKIN_GLOW, warm, 0.35),
      };
    });
  },
  render(element, key, context) {
    if (element.type === 'midnight-moon') return null;
    if (element.type === 'midnight-bat') return <MidnightBat key={key} element={element} />;
    if (element.type === 'midnight-star') return <MidnightStar key={key} element={element} id={ornamentPartId(context, key, 'star')} />;
    if (element.type === 'midnight-ember') return <MidnightEmber key={key} element={element} id={ornamentPartId(context, key, 'ember')} />;
    return <MidnightPumpkin key={key} element={element} id={ornamentPartId(context, key, 'pumpkin')} />;
  },
};

/** The bat's silhouette at its pose: wings scaled by the flap around the shoulder line. */
const BatShape = ({element, fill, opacity, stroke}: {element: BatElement; fill: string; opacity: number; stroke?: string}) => {
  const n = svgNumber;
  const scale = element.span / 80;
  const edge = stroke ? {stroke, strokeWidth: 0.7, strokeOpacity: 0.55, vectorEffect: 'non-scaling-stroke' as const, strokeLinejoin: 'round' as const} : {};
  return (
    <g transform={`translate(${n(element.x)} ${n(element.y)}) rotate(${n(element.rotation)}) scale(${n(scale)})`} fill={fill} opacity={opacity}>
      <g transform={`scale(1 ${n(element.flap)})`}>
        <path d={BAT_WING_LEFT} {...edge} />
        <path d={BAT_WING_RIGHT} {...edge} />
      </g>
      <path d={BAT_BODY} {...edge} />
    </g>
  );
};

const MidnightBat = ({element}: {element: BatElement}) => {
  const n = svgNumber;
  return (
    <g opacity={element.opacity}>
      {/* Moonlit rim: the silhouette in moonlight, shifted towards the moon, under the body. */}
      <g transform={`translate(${n(element.ux * BAT_RIM)} ${n(element.uy * BAT_RIM)})`}>
        <BatShape element={element} fill={element.rimColor} opacity={BAT_RIM_ALPHA} />
      </g>
      <BatShape element={element} fill={element.bodyColor} opacity={1} stroke={element.edgeColor} />
    </g>
  );
};

const MidnightPumpkin = ({element, id}: {element: PumpkinElement; id: string}) => {
  const n = svgNumber;
  const scale = element.width / 200;
  const baseY = element.y + PUMPKIN_CENTER * element.width;
  return (
    <g>
      <RadialLight id={`${id}-light`} x={element.x} y={element.y} radius={element.light} color={element.glowColor} opacity={element.lightOpacity}
        falloff={0.55} mid={0.45} />
      <ellipse cx={n(element.x)} cy={n(baseY - scale)} rx={n(57 * scale)} ry={n(5 * scale)} fill="#06050A" opacity={0.55} />
      <Pumpkin x={element.x} y={baseY} scale={scale} rotation={element.rotation} glow={element.glow} color={element.color} id={id} ground={false}
        fine={element.width >= PUMPKIN_FINE_FROM} />
    </g>
  );
};

/** The background's 4-point star (tips at 4·scale, the waist's control points fixed at ±1 px), at (x, y). */
const starPath = (x: number, y: number, scale: number) => {
  const n = svgNumber;
  const [tip, arm] = [4 * scale, 3 * scale];
  return `M${n(x)} ${n(y - tip)} Q${n(x + 1)} ${n(y - 1)} ${n(x + arm)} ${n(y)} Q${n(x + 1)} ${n(y + 1)} ${n(x)} ${n(y + tip)} `
    + `Q${n(x - 1)} ${n(y + 1)} ${n(x - arm)} ${n(y)} Q${n(x - 1)} ${n(y - 1)} ${n(x)} ${n(y - tip)}Z`;
};

const MidnightStar = ({element, id}: {element: StarElement; id: string}) => (
  <g opacity={element.opacity}>
    <defs>
      <radialGradient id={`${id}-fill`} gradientUnits="userSpaceOnUse" cx={element.x} cy={element.y} r={4 * element.scale}>
        <stop offset={0} stopColor={element.coreColor} />
        <stop offset={1} stopColor={element.color} />
      </radialGradient>
    </defs>
    <RadialLight id={`${id}-light`} x={element.x} y={element.y} radius={element.light} color={element.color} opacity={element.lightOpacity}
      falloff={0.45} mid={0.45} />
    <path d={starPath(element.x, element.y, element.scale)} fill={paint(`${id}-fill`)} stroke={STAR_OUTLINE.color}
      strokeOpacity={STAR_OUTLINE.opacity} strokeWidth={STAR_OUTLINE.width} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </g>
);

/**
 * The background's ember: a dark disc (under everything, so the glow is not ringed on dark footage
 * but the dot still reads on white), its soft disc (moonlight → warm @0.75 at 0.2 → 0), and the
 * moonlight core.
 */
const MidnightEmber = ({element, id}: {element: EmberElement; id: string}) => (
  <g>
    <circle cx={element.x} cy={element.y} r={element.core + EMBER.outline} fill={EMBER_OUTLINE.color} opacity={EMBER_OUTLINE.opacity} />
    {element.light > 0 ? (
      <>
        <defs>
          <radialGradient id={`${id}-light`} gradientUnits="userSpaceOnUse" cx={element.x} cy={element.y} r={element.light}>
            <stop offset={0} stopColor={element.color} stopOpacity={1} />
            <stop offset={0.2} stopColor={element.warmColor} stopOpacity={0.75} />
            <stop offset={1} stopColor={element.warmColor} stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle cx={element.x} cy={element.y} r={element.light} fill={paint(`${id}-light`)} opacity={element.lightOpacity} />
      </>
    ) : null}
    <circle cx={element.x} cy={element.y} r={element.core} fill={element.color} />
  </g>
);

export const midnightSet: OrnamentSet = set;
