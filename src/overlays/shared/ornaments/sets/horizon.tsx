import {PALM_SWAY} from '../../../../backgrounds/vaporwave/Palm';
import {getSolidFaces, SOLID_GLOW} from '../../../../backgrounds/vaporwave/Polyhedron';
import {SPARKLE_GLOW} from '../../../../backgrounds/vaporwave/frame';
import {TAU} from '../../../../loop';
import {svgNumber} from '../../geometry';
import {MAX_CONTENT_OPACITY} from '../../legibility';
import {cycleOf} from '../../motion';
import {mixColor, ornamentPalette, ornamentPartId, paint, RadialLight, unitToward} from '../draw';
import {harmonics, meetsKeepOut, ornamentRandom} from '../place';
import type {OrnamentBase, OrnamentSet} from '../types';
import {
  horizonLit, PALM_INK, PALM_OUTLINE, PALM_REF, PALM_RIM, PALM_UNIT, placeHorizon, referencePalm, SOLID_BOB, solidBody, solidEdge, SPARKLE_INK,
  SPARKLE_MIN_EXTENT, sunShape,
} from './horizon-place';

/**
 * The 'horizon' ornaments (VaporwaveLoop, "neon horizon"): the background's palm rising behind the
 * top left corner, its sliced sun behind the top right one, its wireframe pyramid and icosahedron
 * floating on the lower corners and its four-point twinkles along the top edge, in the kit's
 * palette (ornamentColors: [0] neon cyan, [1] the sun's pale top, [2] neon pink) and the
 * background's rhythms at 16 s (palm sway on the loop's first and second harmonics, the sun's cuts
 * drifting down two steps per loop, one turn of the solids per loop, twinkles once or twice per
 * loop). Placement and sizes: horizon-place.ts (ornamentSize = palm height).
 *
 * Every field is a whole-harmonic sinusoid of the loop, or a cosine-sine pair where the drawing
 * wraps (the sun's cuts, the solids' spin), so the seam never jumps; the drawing itself (the palm's
 * fronds, the sun's slices, the solid's faces) is computed in render.
 */

/** The background's rhythms, in Hz (its loop is 16 s): the loop itself, and two steps of the sun's cuts per loop. */
const HZ = {cycle: 1 / 16, cuts: 2 / 16} as const;

/** The palm's ink: the background's night darkened (darken(#120C2E, 0.4) and 0.7, for the fronds behind). */
const PALM_INK_COLOR = '#07051A';
const PALM_BACK_INK_COLOR = '#0D0920';
/** The lit rim's alpha, brighter than the outline on the sun's side. */
const PALM_RIM_ALPHA = 0.9;
/** The outline's alpha all round. */
const PALM_OUTLINE_ALPHA = 0.7;

/** The sun's base, below the pink: the background's lilac haze. */
const SUN_DUSK = '#B967FF';
/** Its cuts: five, from 0.42 of the diameter down past the rim; the lowest at most 0.08 of the diameter thick. */
const SUN_CUTS = 5;
const SUN_CUT_START = 0.42;
const SUN_CUT_END = 1.04;
const SUN_CUT_MAX = 0.08;
/** The bloom's peak alpha, breathing 0.92 ± 0.08 once per loop as the background's. */
const SUN_LIGHT_ALPHA = 0.55;

/** The solids' dark backing (the background's night) and their glow's peak alpha. */
const SOLID_BACKING = '#120C2E';
const SOLID_BACKING_OPACITY = 0.55;
const SOLID_LIGHT_ALPHA = 0.5;

/** Twinkles: 0.6 + 0.4·cos(k·φ + ψ), |ψ| ≤ 0.6, so frame 0 is ≥ 0.93 (the pack's PNG shows them lit). */
const TWINKLE_MEAN = 0.6;
const TWINKLE_SWING = 0.4;
const TWINKLE_PHASE = 1.2;
const SPARKLE_LIGHT_ALPHA = 0.45;
/** A dark outline so a twinkle still reads over white footage. */
const SPARKLE_OUTLINE = {color: '#120C1C', opacity: 0.5, width: 0.8} as const;

type PalmElement = OrnamentBase & {
  type: 'horizon-palm'; height: number; side: number; sway: number; swayTilt: number; rimX: number; rimY: number;
  inkColor: string; backInkColor: string; rimColor: string;
};
type SunElement = OrnamentBase & {
  type: 'horizon-sun'; disc: number; cutCos: number; cutSin: number; topColor: string; midColor: string; baseColor: string; glowColor: string;
};
type SolidElement = OrnamentBase & {
  type: 'horizon-solid'; size: number; spinCos: number; spinSin: number; tilt: number; variant: number; edge: number;
  edgeColor: string; faceColor: string;
};
type SparkleElement = OrnamentBase & {
  type: 'horizon-sparkle'; tip: number; color: string; glowColor: string;
};
type HorizonOrnamentElement = PalmElement | SunElement | SolidElement | SparkleElement;

const set: OrnamentSet<HorizonOrnamentElement> = {
  name: 'horizon',
  seedOffset: 80,
  minExtent: SPARKLE_MIN_EXTENT,
  place(frame, style) {
    return placeHorizon(frame, style.ornamentSize);
  },
  build(frame, placements, style, frameIndex, durationInFrames) {
    const random = ornamentRandom(style.seed, set);
    const angle = TAU * cycleOf(frameIndex, durationInFrames);
    const loop = harmonics(HZ.cycle, style.durationSeconds);
    const cuts = harmonics(HZ.cuts, style.durationSeconds);
    const lit = horizonLit(frame);
    const {cool, light, warm} = ornamentPalette(style);
    const sun = placements.find((placement) => placement.motif === 'sun');
    let sparkle = 0;
    return placements.map((placement, anchor): HorizonOrnamentElement => {
      // Every element draws its phases, used or not, so one motif never shifts another's.
      const phase = random() * TAU;
      const second = random() * TAU;
      const jitter = random() - 0.5;
      const base = {layer: placement.layer, anchor, opacity: 1, x: placement.x, y: placement.y};
      // A front light over a text area stays under the legibility cap, for its whole motion.
      const cap = placement.layer === 'front' && meetsKeepOut(frame, placement.x, placement.y, placement.extent) ? MAX_CONTENT_OPACITY : 1;
      if (placement.motif === 'palm') {
        const side = placement.slot === 'TR' ? 1 : 0;
        // The rim faces the sun; with no sun, the top corner across.
        const toward = sun ? unitToward(placement.x, placement.y, sun.x, sun.y) : {x: side === 0 ? Math.SQRT1_2 : -Math.SQRT1_2, y: -Math.SQRT1_2};
        return {
          ...base, type: 'horizon-palm', reach: PALM_UNIT.r * placement.size + PALM_INK, light: 0, lightOpacity: 0,
          height: placement.size, side,
          sway: PALM_SWAY.first * Math.sin(loop * angle + phase) + PALM_SWAY.second * Math.sin(2 * loop * angle + second),
          swayTilt: PALM_SWAY.first * Math.cos(loop * angle + phase) + PALM_SWAY.second * Math.cos(2 * loop * angle + second),
          rimX: toward.x, rimY: toward.y, inkColor: PALM_INK_COLOR, backInkColor: PALM_BACK_INK_COLOR, rimColor: warm,
        };
      }
      if (placement.motif === 'sun') {
        const shape = sunShape(placement.extent, placement.size, lit);
        const glow = 0.92 + 0.08 * Math.sin(loop * angle + phase);
        return {
          ...base, type: 'horizon-sun', reach: shape.r, light: shape.light, lightOpacity: shape.light > 0 ? Math.min(cap, SUN_LIGHT_ALPHA * glow) : 0,
          disc: shape.r, cutCos: Math.cos(cuts * angle + second), cutSin: Math.sin(cuts * angle + second),
          topColor: light, midColor: warm, baseColor: mixColor(warm, SUN_DUSK, 0.7), glowColor: warm,
        };
      }
      if (placement.motif === 'pyramid' || placement.motif === 'icosahedron') {
        const size = placement.size;
        const turn = jitter < 0 ? -1 : 1;
        const spin = second + turn * loop * angle;
        const glow = 0.85 + 0.15 * Math.sin(2 * loop * angle + phase);
        const lightRadius = lit ? SOLID_GLOW * size : 0;
        const edgeColor = placement.motif === 'pyramid' ? warm : cool;
        return {
          ...base, type: 'horizon-solid',
          x: placement.x + SOLID_BOB.x * size * Math.cos(loop * angle + phase),
          y: placement.y + SOLID_BOB.y * size * Math.sin(loop * angle + phase),
          reach: solidBody(size), light: lightRadius, lightOpacity: lightRadius > 0 ? Math.min(cap, SOLID_LIGHT_ALPHA * glow) : 0,
          size, spinCos: Math.cos(spin), spinSin: Math.sin(spin),
          tilt: (0.3 + 0.5 * Math.abs(jitter)) * turn + 0.12 * Math.sin(loop * angle + 1.7 * phase),
          variant: placement.motif === 'pyramid' ? 2 : 1, edge: solidEdge(size), edgeColor, faceColor: mixColor(edgeColor, SUN_DUSK, 0.5),
        };
      }
      // Twinkles: every other one twice per loop; frame 0 is near full brightness.
      const k = (sparkle++ % 2 === 0 ? 1 : 2) * loop;
      const twinkle = TWINKLE_MEAN + TWINKLE_SWING * Math.cos(k * angle + TWINKLE_PHASE * jitter);
      const tip = placement.size;
      const lightRadius = lit ? Math.min(placement.extent, SPARKLE_GLOW * tip) : 0;
      return {
        ...base, type: 'horizon-sparkle', reach: tip + SPARKLE_INK, light: lightRadius,
        lightOpacity: lightRadius > 0 ? Math.min(cap, SPARKLE_LIGHT_ALPHA * twinkle) : 0,
        opacity: twinkle, tip: tip * (0.85 + 0.15 * twinkle), color: phase < Math.PI ? light : '#FFFFFF', glowColor: cool,
      };
    });
  },
  render(element, key, context) {
    if (element.type === 'horizon-palm') return <HorizonPalm key={key} element={element} />;
    if (element.type === 'horizon-sun') return <HorizonSun key={key} element={element} id={ornamentPartId(context, key, 'sun')} />;
    if (element.type === 'horizon-solid') return <HorizonSolid key={key} element={element} id={ornamentPartId(context, key, 'solid')} />;
    return <HorizonSparkle key={key} element={element} id={ornamentPartId(context, key, 'sparkle')} />;
  },
};

const n = svgNumber;
const outline = (points: readonly (readonly [number, number])[]) => `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
const disc = ({x, y, r}: {x: number; y: number; r: number}) => `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 1 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 1 ${n(-2 * r)} 0Z`;

/**
 * The background's palm at the reference height, scaled to the element's: the lit rim (the whole
 * silhouette shifted PALM_RIM px towards the sun), the neon outline (the silhouette stroked twice
 * PALM_OUTLINE wide under the ink, which covers the inner half and every edge inside another
 * frond, so only the outer contour shows), the fronds behind, the trunk, the fronds in front and
 * the knot with its coconuts. One path per frond, as in the background, so a frond folding over
 * itself never opens a hole in a neighbour.
 */
const HorizonPalm = ({element}: {element: PalmElement}) => {
  const shape = referencePalm(element.side === 1 ? 1 : 0, element.sway, element.swayTilt);
  const scale = element.height / PALM_REF.height;
  const mirror = element.side === 1 ? -1 : 1;
  const footX = element.x - mirror * PALM_UNIT.x * element.height;
  const footY = element.y - PALM_UNIT.y * element.height;
  const place = `translate(${n(footX)} ${n(footY)}) scale(${n(scale)})`;
  const silhouette = [...shape.back, shape.trunk, ...shape.front, shape.knot].map(outline).join('') + shape.coconuts.map(disc).join('');
  return (
    <g strokeLinejoin="round">
      <g transform={`translate(${n(element.rimX * PALM_RIM)} ${n(element.rimY * PALM_RIM)})`} opacity={PALM_RIM_ALPHA}>
        <path transform={place} d={silhouette} fill={element.rimColor} />
      </g>
      <path transform={place} d={silhouette} fill="none" stroke={element.rimColor} strokeOpacity={PALM_OUTLINE_ALPHA}
        strokeWidth={n((2 * PALM_OUTLINE) / scale)} />
      <g transform={place}>
        {shape.back.map((points, index) => <path key={`b${index}`} d={outline(points)} fill={element.backInkColor} />)}
        <path d={outline(shape.trunk)} fill={element.inkColor} />
        {shape.front.map((points, index) => <path key={`f${index}`} d={outline(points)} fill={element.inkColor} />)}
        <path d={outline(shape.knot) + shape.coconuts.map(disc).join('')} fill={element.inkColor} />
      </g>
    </g>
  );
};

/** The cuts' bands (top and bottom y) over a sun of radius r centred at cy, at the drift `shift` ∈ [0, 1). */
export const sunCutBands = (cy: number, r: number, shift: number): [number, number][] => {
  const top = cy - r;
  const span = 2 * r;
  const step = (SUN_CUT_END - SUN_CUT_START) / SUN_CUTS;
  const bands: [number, number][] = [];
  for (let index = 0; index < SUN_CUTS; index++) {
    const place = SUN_CUT_START + (index + shift) * step;
    // Born with no thickness, growing as it drifts down; the last one leaves past the rim.
    const thickness = SUN_CUT_MAX * span * ((place - SUN_CUT_START) / (SUN_CUT_END - SUN_CUT_START));
    const middle = top + place * span;
    const from = Math.max(top, middle - thickness / 2);
    const to = Math.min(cy + r, middle + thickness / 2);
    if (to - from > 0.01) bands.push([from, to]);
  }
  return bands;
};

/** The disc between two heights, as a closed path: two chords and the arcs between them. */
const slicePath = (cx: number, cy: number, r: number, y0: number, y1: number) => {
  const w = (y: number) => Math.sqrt(Math.max(0, r * r - (y - cy) ** 2));
  const [w0, w1] = [w(y0), w(y1)];
  return `M${n(cx - w0)} ${n(y0)}L${n(cx + w0)} ${n(y0)}A${n(r)} ${n(r)} 0 0 1 ${n(cx + w1)} ${n(y1)}`
    + `L${n(cx - w1)} ${n(y1)}A${n(r)} ${n(r)} 0 0 1 ${n(cx - w0)} ${n(y0)}Z`;
};

/**
 * The background's sliced sun, small: a pale top through the pink to the lilac base, cut by bands
 * that drift down and widen (the slices are drawn as paths, so nothing is masked), over a bloom
 * that peaks at the rim.
 */
const HorizonSun = ({element, id}: {element: SunElement; id: string}) => {
  const {x, y, disc: r} = element;
  const turn = Math.atan2(element.cutSin, element.cutCos) / TAU;
  const shift = turn - Math.floor(turn);
  const bands = sunCutBands(y, r, shift);
  const slices: string[] = [];
  let from = y - r;
  for (const [top, bottom] of bands) {
    if (top - from > 0.01) slices.push(slicePath(x, y, r, from, top));
    from = Math.max(from, bottom);
  }
  if (y + r - from > 0.01) slices.push(slicePath(x, y, r, from, y + r));
  const rim = element.light > 0 ? r / element.light : 1;
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-fill`} gradientUnits="userSpaceOnUse" x1={0} y1={y - r} x2={0} y2={y + r}>
          <stop offset={0} stopColor={element.topColor} />
          <stop offset={0.5} stopColor={element.midColor} />
          <stop offset={0.9} stopColor={element.baseColor} />
        </linearGradient>
        {element.light > 0 ? (
          <radialGradient id={`${id}-bloom`} gradientUnits="userSpaceOnUse" cx={x} cy={y} r={element.light}>
            <stop offset={0} stopColor={element.glowColor} stopOpacity={0.12} />
            <stop offset={0.85 * rim} stopColor={element.glowColor} stopOpacity={0.35} />
            <stop offset={rim} stopColor={element.glowColor} stopOpacity={1} />
            <stop offset={1} stopColor={element.glowColor} stopOpacity={0} />
          </radialGradient>
        ) : null}
      </defs>
      {element.light > 0 ? <circle cx={n(x)} cy={n(y)} r={n(element.light)} fill={paint(`${id}-bloom`)} opacity={element.lightOpacity} /> : null}
      <path d={slices.join('')} fill={paint(`${id}-fill`)} />
    </g>
  );
};

/**
 * The background's wireframe solid (getSolidFaces): faint back edges, dark-backed front faces
 * shaded by the light, bold neon front edges, over a soft glow.
 */
const HorizonSolid = ({element, id}: {element: SolidElement; id: string}) => {
  const faces = getSolidFaces({
    x: element.x, y: element.y, size: element.size, spinCos: element.spinCos, spinSin: element.spinSin, tilt: element.tilt, variant: element.variant,
  });
  const back = faces.filter((face) => !face.front);
  const front = faces.filter((face) => face.front);
  return (
    <g strokeLinejoin="round">
      <RadialLight id={`${id}-light`} x={element.x} y={element.y} radius={element.light} color={element.edgeColor} opacity={element.lightOpacity}
        falloff={0.55} mid={0.3} />
      <path d={back.map((face) => outline(face.points)).join('')} fill="none" stroke={element.edgeColor} strokeOpacity={0.32} strokeWidth={n(0.7 * element.edge)} />
      {front.map((face, index) => (
        <g key={index}>
          <path d={outline(face.points)} fill={SOLID_BACKING} fillOpacity={SOLID_BACKING_OPACITY} />
          <path d={outline(face.points)} fill={element.faceColor} fillOpacity={n(0.1 + 0.52 * face.light)} />
        </g>
      ))}
      <path d={front.map((face) => outline(face.points)).join('')} fill="none" stroke={element.edgeColor} strokeWidth={n(element.edge)} />
    </g>
  );
};

/** The background's four-point twinkle (waist at a fifth of the tip), with its soft glow and a dark edge. */
const HorizonSparkle = ({element, id}: {element: SparkleElement; id: string}) => {
  const {x, y, tip} = element;
  const waist = tip * 0.2;
  const path = `M${n(x)} ${n(y - tip)}L${n(x + waist)} ${n(y - waist)}L${n(x + tip)} ${n(y)}L${n(x + waist)} ${n(y + waist)}`
    + `L${n(x)} ${n(y + tip)}L${n(x - waist)} ${n(y + waist)}L${n(x - tip)} ${n(y)}L${n(x - waist)} ${n(y - waist)}Z`;
  return (
    <g>
      <RadialLight id={`${id}-light`} x={x} y={y} radius={element.light} color={element.glowColor} opacity={element.lightOpacity} falloff={0.4} mid={0.35} />
      <g opacity={element.opacity}>
        <path d={path} fill={element.color} stroke={SPARKLE_OUTLINE.color} strokeOpacity={SPARKLE_OUTLINE.opacity}
          strokeWidth={SPARKLE_OUTLINE.width} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
    </g>
  );
};

export const horizonSet: OrnamentSet = set;
