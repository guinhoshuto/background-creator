import {MANSION_FENCE, MANSION_LANTERN, MANSION_LANTERN_FLICKER} from '../../../../backgrounds/HauntedMansionLoop';
import {TAU} from '../../../../loop';
import {svgNumber} from '../../geometry';
import {MAX_CONTENT_OPACITY} from '../../legibility';
import {cycleOf} from '../../motion';
import {mixColor, ornamentPalette, ornamentPartId, paint, RadialLight} from '../draw';
import {harmonics, meetsKeepOut, ornamentRandom} from '../place';
import type {OrnamentBase, OrnamentFrame, OrnamentPlacement, OrnamentSet} from '../types';
import {LANCET, LANCET_CIRCLE, lancetPanePath, ROSE, roseReach, roseStrokes, WINDOW_FLICKER} from './haunted-mansion-glass';
import {
  ARM_CURL, ARM_OVERLAP, ARM_WIDTH, fenceMeasures, FENCE_POST, GATE_BARS, GATE_LEAF, GATE_STRIPS, gateArch, LANTERN_HEIGHT_UNITS, lanternMountOf,
  lanternStrokes, LIT_SHIFT, MOON, PICKET_WIDTH, placeHauntedMansion, PLATE, RAIL_WIDTH,
} from './haunted-mansion-place';

/**
 * 'haunted-mansion': the HauntedMansionLoop background's porch lanterns, facade windows and wrought-iron
 * fence and gate around a panel or a frame, with wall sconces along a big frame's sides
 * (placement in haunted-mansion-place.ts, window geometry in haunted-mansion-glass.ts).
 *
 *   - ornamentSize = the lantern's height in px, hook to base (the background's lamp head, 86.5 of
 *     its units), limited by its corner's room. Brackets are 2.5 px iron; the fence's pickets and
 *     rails 3 px; lit edges 1 px.
 *   - Lantern glass: ornamentColors[2] (amber), flickering like the background's lanterns,
 *     0.79 + 0.12·sin(3φ) + 0.04·sin(7φ) at 16 s; the rose window and the lancets glow like its
 *     windows, 0.72 + 0.14·sin(2φ) + 0.06·sin(5φ) (the harmonics follow the Hz at any duration).
 *     Their warm light is none on a Twitch panel (glow 0) and at most MAX_CONTENT_OPACITY where
 *     it meets text. Iron: the background's colours, with a lit edge in ornamentColors[1] on the
 *     moon side (up and to the right): lamps, brackets, the rose's disc, the lancets' surrounds;
 *     on the fence and the gate the spear heads, finials and caps (@0.7), the top rail's top edge
 *     (@0.5), every post's right side (@0.5) and every picket's and bar's (@0.55) as a 2 px line
 *     (the iron's moon-side column and the one past it) from its collar (cap, arch) down to the
 *     base, unbroken over both rails, and the bottom rail's top edge (1 px @0.55); lines on whole
 *     pixels, painted over the iron, so the iron reads over dark footage below the glow.
 *     The fence and the gate are still.
 *   - Frame 0 is the hero pose: every glass starts lit (lanterns ≥ 0.81, windows ≥ 0.8).
 */

type Bar = {
  /** 1 when the lamp draws the end of its shepherd's-hook bracket (the bar through its hook), else 0. */
  bar: number;
  /** The bracket's iron width, in px. */
  barWidth: number;
  barFrom: number;
  barY: number;
  tipX: number;
};

export type HauntedMansionOrnamentLanternElement = OrnamentBase & Bar & {
  type: 'haunted-mansion-lantern';
  side: number;
  ox: number;
  oy: number;
  scale: number;
  gx: number;
  gy: number;
  /** Glass brightness (0–1): the flicker. */
  glass: number;
  warm: string;
  core: string;
  ember: string;
  lit: string;
};

/** A wall arm (see ArmMount): wall → knee → tip along (ux, uy), with its brace. Still. */
export type HauntedMansionOrnamentArmElement = OrnamentBase & {
  type: 'haunted-mansion-arm';
  wx: number;
  wy: number;
  kx: number;
  ky: number;
  ux: number;
  uy: number;
  tx: number;
  ty: number;
  bx: number;
  by: number;
  ax: number;
  ay: number;
  lit: string;
};

/** A shepherd's-hook bracket's own piece (see Gooseneck): plate, stem, bend and the bar up to the lamp's piece. Still. */
export type HauntedMansionOrnamentBracketElement = OrnamentBase & {
  type: 'haunted-mansion-bracket';
  side: number;
  width: number;
  sx: number;
  fy: number;
  barY: number;
  bend: number;
  /** Where the bracket's iron ends on the bar (the lamp draws on from there). */
  to: number;
  lit: string;
};

export type HauntedMansionOrnamentRoseElement = OrnamentBase & {
  type: 'haunted-mansion-rose';
  scale: number;
  glass: number;
  warm: string;
  core: string;
  ember: string;
  lit: string;
};

export type HauntedMansionOrnamentLancetElement = OrnamentBase & {
  type: 'haunted-mansion-lancet';
  /** The pane's top-left corner. */
  px: number;
  py: number;
  glass: number;
  warm: string;
  core: string;
  ember: string;
  lit: string;
};

export type HauntedMansionOrnamentFenceElement = OrnamentBase & {
  type: 'haunted-mansion-fence';
  /** The spear tips' line (the finials rise over it) and the fence's height, tip to base. */
  top: number;
  height: number;
  railLeft: number;
  railRight: number;
  /** 1 for a square post with a cap plate and a ball finial (a run's ends and every FENCE_POST pickets), 0 for a spear picket. */
  post: number;
  lit: string;
};

/** A strip of the gate (see GATE_STRIPS): a post, or half a leaf with its bars, rails and arch. Still. */
export type HauntedMansionOrnamentGateElement = OrnamentBase & {
  type: 'haunted-mansion-gate';
  /** The strip's span, in canvas px. */
  x0: number;
  x1: number;
  /** The gate's centre and base line, the leaves' outer height and the arch's (and posts') peak, in px. */
  gx: number;
  base: number;
  edge: number;
  peak: number;
  post: number;
  lit: string;
};

export type HauntedMansionOrnamentElement =
  | HauntedMansionOrnamentLanternElement | HauntedMansionOrnamentArmElement | HauntedMansionOrnamentBracketElement | HauntedMansionOrnamentRoseElement | HauntedMansionOrnamentLancetElement | HauntedMansionOrnamentFenceElement
  | HauntedMansionOrnamentGateElement;

/** The lanterns' flicker in Hz (3 and 7 per 16 s loop), and the windows' (2 and 5). */
const FLICKER_HZ = MANSION_LANTERN_FLICKER.harmonics.map((count) => count / MANSION_LANTERN_FLICKER.seconds);
const WINDOW_HZ = WINDOW_FLICKER.harmonics.map((count) => count / WINDOW_FLICKER.seconds);
/** Peak alpha of a glass's warm light (times the glass's level), capped at MAX_CONTENT_OPACITY over text. */
const LIGHT_PEAK = 0.5;
const WINDOW_LIGHT_PEAK = 0.3;
/** Opacity of the lit edges (moonlight on iron), of the spears' and finials', and of the pickets' and bars' 2 px lines (posts: LIT_OPACITY). */
const LIT_OPACITY = 0.5;
const FENCE_LIT_OPACITY = 0.7;
const LINE_LIT_OPACITY = 0.55;
/** The bloom over the lamp, per unit of its light's opacity. */
const BLOOM = 0.45;
/** The iron of the fence (the background's fence colour) and of the brackets (the lamp's cap). */
const FENCE_IRON = MANSION_FENCE.colors.iron;
const BRACKET_IRON = MANSION_LANTERN.colors.cap;
/** The windows' glass level at frame 0 is at least this (their phase keeps sin ≥ 0.4). */
const WINDOW_PHASE_MIN = 0.45;

/** The lantern's warm light: its level (capped where the light circle meets text). */
const lightOf = (frame: OrnamentFrame, placement: OrnamentPlacement, peak: number) => {
  const light = frame.glow > 0 ? placement.extent : 0;
  const opacity = light > 0 ? (meetsKeepOut(frame, placement.x, placement.y, light) ? Math.min(MAX_CONTENT_OPACITY, peak) : peak) : 0;
  return {light, lightOpacity: opacity};
};

const set: OrnamentSet<HauntedMansionOrnamentElement> = {
  name: 'haunted-mansion',
  seedOffset: 20,
  // A 20 px lantern hanging in a corner pocket.
  minExtent: 10,
  place(frame, style) {
    return placeHauntedMansion(frame, style.ornamentSize);
  },
  build(frame, placements, style, frameIndex, durationInFrames) {
    const random = ornamentRandom(style.seed, set);
    const phase = TAU * cycleOf(frameIndex, durationInFrames);
    const [first, second] = FLICKER_HZ.map((hz) => harmonics(hz, style.durationSeconds));
    const [slow, quick] = WINDOW_HZ.map((hz) => harmonics(hz, style.durationSeconds));
    const {light, warm} = ornamentPalette(style);
    const core = mixColor(warm, '#FFF6E2', 0.62);
    const ember = mixColor(warm, '#6B3208', 0.4);
    const windowLevel = () => {
      // One phase for both harmonics, like the background's windows, drawn so the glass is lit at the seam.
      const offset = WINDOW_PHASE_MIN + random() * (Math.PI - 2 * WINDOW_PHASE_MIN);
      return WINDOW_FLICKER.base + WINDOW_FLICKER.first * Math.sin(slow! * phase + offset) + WINDOW_FLICKER.second * Math.sin(quick! * phase + offset);
    };
    const elements = placements.map((placement, anchor): HauntedMansionOrnamentElement => {
      const base = {layer: placement.layer, anchor, x: placement.x, y: placement.y, opacity: 1};
      if (placement.motif === 'fence') return fenceElement(placements, placement, anchor, light);
      if (placement.motif === 'gate') return gateElement(frame, placements, placement, anchor, light);
      if (placement.motif === 'arm') {
        // Every arm follows its lamp.
        const owner = placements[anchor - 1]!;
        const {arm, hook} = lanternMountOf(frame, owner);
        if (hook) {
          return {
            ...base, type: 'haunted-mansion-bracket', reach: hook.reach, light: 0, lightOpacity: 0,
            side: hook.side, width: hook.width, sx: hook.sx, fy: hook.fy, barY: hook.barY, bend: hook.bend, to: hook.split + hook.side * ARM_OVERLAP, lit: light,
          };
        }
        return {
          ...base, type: 'haunted-mansion-arm', reach: arm!.reach, light: 0, lightOpacity: 0,
          wx: arm!.wx, wy: arm!.wy, kx: arm!.kx, ky: arm!.ky, ux: arm!.ux, uy: arm!.uy, tx: arm!.tx, ty: arm!.ty, bx: arm!.bx, by: arm!.by,
          ax: arm!.ax, ay: arm!.ay, lit: light,
        };
      }
      if (placement.motif === 'rose') {
        const glass = windowLevel();
        return {
          ...base, type: 'haunted-mansion-rose', reach: roseReach(placement.size), ...lightOf(frame, placement, WINDOW_LIGHT_PEAK * glass),
          scale: placement.size, glass, warm, core, ember, lit: light,
        };
      }
      if (placement.motif === 'lancet') {
        const glass = windowLevel();
        return {
          ...base, type: 'haunted-mansion-lancet', reach: LANCET_CIRCLE.reach, ...lightOf(frame, placement, WINDOW_LIGHT_PEAK * glass),
          px: placement.x - LANCET_CIRCLE.x, py: placement.y - LANCET_CIRCLE.y, glass, warm, core, ember, lit: light,
        };
      }
      // Phases drawn for every lantern (placement order), each one lit at the seam (frame 0 is the pack's still).
      const offset = Math.PI / 6 + random() * (2 * Math.PI / 3);
      const offset2 = random() * TAU;
      const glass = MANSION_LANTERN_FLICKER.base + MANSION_LANTERN_FLICKER.first * Math.sin(first! * phase + offset)
        + MANSION_LANTERN_FLICKER.second * Math.sin(second! * phase + offset2);
      const {lantern, hook} = lanternMountOf(frame, placement);
      return {
        ...base, type: 'haunted-mansion-lantern', reach: Math.max(lantern.reach, hook ? hook.lampReach : 0),
        ...lightOf(frame, placement, LIGHT_PEAK * glass),
        side: lantern.side, ox: lantern.ox, oy: lantern.oy, scale: lantern.scale, gx: lantern.gx, gy: lantern.gy,
        bar: hook ? 1 : 0, barWidth: hook ? hook.width : 0, barFrom: hook ? hook.split : 0, barY: hook ? hook.barY : 0, tipX: hook ? hook.tipX : 0,
        glass, warm, core, ember, lit: light,
      };
    });
    // Brackets first (a stable sort; `anchor` keeps each element's placement): every lamp is painted
    // over its bracket, its hook over the bar it hangs from.
    const isArm = (element: HauntedMansionOrnamentElement) => Number(element.type === 'haunted-mansion-arm' || element.type === 'haunted-mansion-bracket');
    return elements.sort((a, b) => isArm(b) - isArm(a));
  },
  render(element, key, context) {
    const id = (part: string) => ornamentPartId(context, key, part);
    switch (element.type) {
      case 'haunted-mansion-lantern': return <Lantern key={key} element={element} id={id} />;
      case 'haunted-mansion-arm': return <Arm key={key} element={element} />;
      case 'haunted-mansion-bracket': return <Bracket key={key} element={element} />;
      case 'haunted-mansion-rose': return <Rose key={key} element={element} id={id} />;
      case 'haunted-mansion-lancet': return <Lancet key={key} element={element} id={id} />;
      case 'haunted-mansion-gate': return <GateStrip key={key} element={element} />;
      default: return <FencePicket key={key} element={element} />;
    }
  },
};

/** A picket of a fence run: rails towards its neighbours in the run, a post at either end and every FENCE_POST pickets. */
const fenceElement = (placements: readonly OrnamentPlacement[], placement: OrnamentPlacement, anchor: number, lit: string): HauntedMansionOrnamentFenceElement => {
  const height = placement.size;
  const {pitch, reach, centre} = fenceMeasures(height);
  const run = placements.filter((other) => other.motif === 'fence' && other.slot === placement.slot);
  const index = run.indexOf(placement);
  const neighbour = (dx: number) => run.some((other) => Math.abs(other.x - (placement.x + dx)) < 0.5);
  // Rails overlap half a px into the neighbour's, so no seam shows between two pickets.
  const railLeft = neighbour(-pitch) ? pitch / 2 + 0.5 : 0;
  const railRight = neighbour(pitch) ? pitch / 2 + 0.5 : 0;
  return {
    type: 'haunted-mansion-fence', layer: placement.layer, anchor, x: placement.x, y: placement.y, reach, light: 0, lightOpacity: 0, opacity: 1,
    top: placement.y - centre, height, railLeft, railRight,
    post: index === 0 || index === run.length - 1 || index % FENCE_POST === 0 ? 1 : 0, lit,
  };
};

const n = svgNumber;

const rect = (x0: number, y0: number, x1: number, y1: number) => `M${n(x0)} ${n(y0)}H${n(x1)}V${n(y1)}H${n(x0)}Z`;

/**
 * A picket's parts (canvas px): its iron as one path; what carries a lit copy moved towards the
 * moon (spear head, or finial and cap); the top rail's lit copy (moved up); and its lit lines on
 * the moon side, painted over the iron: the shaft's (a post's) right column and the one past it
 * (2 px) from the collar (the cap) down to the base, and the bottom rail's top edge (1 px). Only
 * moon-side edges are lit, so no bay reads as a closed box. `railLeft`/`railRight` 0: no rail that way.
 */
const picketPaths = (p: Pick<HauntedMansionOrnamentFenceElement, 'x' | 'top' | 'height' | 'railLeft' | 'railRight' | 'post'>) => {
  const {x, top, height} = p;
  const m = fenceMeasures(height);
  const base = top + height;
  const [upper, lower] = m.rails.map((share) => top + share) as [number, number];
  const half = RAIL_WIDTH / 2;
  const railPath = (y: number) => (p.railLeft + p.railRight > 0 ? rect(x - p.railLeft, y - half, x + p.railRight, y + half) : '');
  // Lit lines on the rails abut their neighbours' (half a pitch each way), so no brighter seam shows.
  const litLeft = p.railLeft > 0 ? m.pitch / 2 : 0;
  const litRight = p.railRight > 0 ? m.pitch / 2 : 0;
  const litRail = (y0: number, y1: number) => (litLeft + litRight > 0 ? rect(x - litLeft, y0, x + litRight, y1) : '');
  const railLines = litRail(lower - half - LIT_SHIFT, lower - half);
  const topRail = litRail(upper - half, upper + half);
  const rails = railPath(upper) + railPath(lower);
  if (p.post) {
    // A square post under a cap plate and a ball finial rising `rise` px over the spear tips.
    const ball = m.finial;
    const cy = top - m.rise + ball;
    const capTop = cy + ball;
    const finial = `M${n(x - ball)} ${n(cy)}a${n(ball)} ${n(ball)} 0 1 0 ${n(2 * ball)} 0a${n(ball)} ${n(ball)} 0 1 0 ${n(-2 * ball)} 0Z`;
    const cap = rect(x - m.cap / 2, capTop, x + m.cap / 2, capTop + 2);
    return {
      iron: finial + cap + rect(x - m.post / 2, capTop + 2, x + m.post / 2, base) + rails,
      head: finial + cap,
      rail: topRail,
      lines: rect(x + m.post / 2 - 1, capTop + 2, x + m.post / 2 + LIT_SHIFT, base) + railLines,
      linesOpacity: LIT_OPACITY,
    };
  }
  // An arrowhead with barbs, a collar under it, and the shaft.
  const shaft = PICKET_WIDTH / 2;
  const head = `M${n(x)} ${n(top)}L${n(x + m.spearWidth / 2)} ${n(top + m.barb)}L${n(x + shaft)} ${n(top + m.notch)}`
    + `L${n(x - shaft)} ${n(top + m.notch)}L${n(x - m.spearWidth / 2)} ${n(top + m.barb)}Z`;
  const collar = rect(x - m.collarWidth / 2, top + m.barb, x + m.collarWidth / 2, top + m.barb + m.collar);
  return {
    iron: head + collar + rect(x - shaft, top + m.notch, x + shaft, base) + rails,
    head,
    rail: topRail,
    lines: rect(x + shaft - 1, top + m.spearHeight, x + shaft + LIT_SHIFT, base) + railLines,
    linesOpacity: LINE_LIT_OPACITY,
  };
};

/** Lit copies (under the iron), the iron, then the lit lines over it (one path, so the verticals cross the rails unbroken and undoubled). */
const LitIron = ({paths, lit}: {paths: ReturnType<typeof picketPaths>; lit: string}) => (
  <>
    <path d={paths.head} fill={lit} opacity={FENCE_LIT_OPACITY} transform={`translate(${MOON.x * LIT_SHIFT} ${MOON.y * LIT_SHIFT})`} />
    {paths.rail && <path d={paths.rail} fill={lit} opacity={LIT_OPACITY} transform={`translate(0 ${MOON.y * LIT_SHIFT})`} />}
    <path d={paths.iron} fill={FENCE_IRON} />
    {paths.lines && <path d={paths.lines} fill={lit} opacity={paths.linesOpacity} />}
  </>
);

const FencePicket = ({element}: {element: HauntedMansionOrnamentFenceElement}) => (
  <g opacity={element.opacity}>
    <LitIron paths={picketPaths(element)} lit={element.lit} />
  </g>
);

/** The gate's strip: its measures from the gate's placements (every strip shares the fence's base line and the peak). */
const gateElement = (
  frame: OrnamentFrame, placements: readonly OrnamentPlacement[], placement: OrnamentPlacement, anchor: number, lit: string,
): HauntedMansionOrnamentGateElement => {
  const gate = placements.filter((other) => other.motif === 'gate');
  const [x0, x1, post] = GATE_STRIPS[gate.indexOf(placement)]!;
  const picket = placements.find((other) => other.motif === 'fence')!;
  const edge = picket.size;
  const base = picket.y - fenceMeasures(edge).centre + edge;
  const gx = Math.round(frame.outline.x + frame.outline.width / 2);
  return {
    type: 'haunted-mansion-gate', layer: placement.layer, anchor, x: placement.x, y: placement.y, reach: placement.extent, light: 0, lightOpacity: 0, opacity: 1,
    x0: gx + x0, x1: gx + x1, gx, base, edge, peak: placement.size, post, lit,
  };
};

/**
 * A strip of the gate. A post: the fence's post as tall as the peak. Half a leaf: its bars (from
 * the base up to the arch), the rails on the fence's lines, and its piece of the arch (a parabola,
 * so exactly one quadratic), each with the fence's lit edges (the bars' and the bottom rail's
 * lines painted over the iron and the arch).
 */
const GateStrip = ({element: e}: {element: HauntedMansionOrnamentGateElement}) => {
  if (e.post) {
    const paths = picketPaths({x: (e.x0 + e.x1) / 2, top: e.base - e.peak, height: e.peak, railLeft: 0, railRight: 0, post: 1});
    return <g opacity={e.opacity}><LitIron paths={paths} lit={e.lit} /></g>;
  }
  const m = fenceMeasures(e.edge);
  const tip = e.base - e.edge;
  const [upper, lower] = m.rails.map((share) => tip + share) as [number, number];
  const half = RAIL_WIDTH / 2;
  const arch = (x: number) => e.base - gateArch(e.edge, e.peak, x - e.gx);
  const slope = (x: number) => 2 * (e.peak - e.edge) * (x - e.gx) / GATE_LEAF ** 2;
  const [a0, a1] = [arch(e.x0), arch(e.x1)];
  const archPath = `M${n(e.x0)} ${n(a0)}Q${n((e.x0 + e.x1) / 2)} ${n(a0 + slope(e.x0) * (e.x1 - e.x0) / 2)} ${n(e.x1)} ${n(a1)}`;
  let iron = rect(e.x0, upper - half, e.x1, upper + half) + rect(e.x0, lower - half, e.x1, lower + half);
  let lines = rect(e.x0, lower - half - LIT_SHIFT, e.x1, lower - half);
  for (const [b0, b1] of GATE_BARS) {
    const [x0, x1] = [e.gx + b0, e.gx + b1];
    if (x0 < e.x0 - 1e-9 || x1 > e.x1 + 1e-9) continue;
    const top = arch((x0 + x1) / 2);
    iron += rect(x0, top, x1, e.base);
    // The bar's right column and the one past it, from under the arch (on a whole pixel) down to the base.
    lines += rect(x1 - 1, Math.ceil(top + half), x1 + LIT_SHIFT, e.base);
  }
  return (
    <g opacity={e.opacity}>
      <path d={archPath} fill="none" stroke={e.lit} strokeWidth={RAIL_WIDTH} opacity={LIT_OPACITY} transform={`translate(${MOON.x * LIT_SHIFT} ${MOON.y * LIT_SHIFT})`} />
      <path d={rect(e.x0, upper - half, e.x1, upper + half)} fill={e.lit} opacity={LIT_OPACITY} transform={`translate(0 ${MOON.y * LIT_SHIFT})`} />
      <path d={iron} fill={FENCE_IRON} />
      <path d={archPath} fill="none" stroke={FENCE_IRON} strokeWidth={RAIL_WIDTH} />
      <path d={lines} fill={e.lit} opacity={LINE_LIT_OPACITY} />
    </g>
  );
};

/** Iron drawn twice: its lit copy (moved towards the moon) and the iron over it. */
const Iron = ({d, lit, width = ARM_WIDTH, cap = 'butt'}: {d: string; lit: string; width?: number; cap?: 'butt' | 'round'}) => (
  <g fill="none" strokeLinecap={cap} strokeLinejoin="round" strokeWidth={width}>
    <path d={d} stroke={lit} strokeOpacity={LIT_OPACITY} transform={`translate(${n(MOON.x * LIT_SHIFT)} ${n(MOON.y * LIT_SHIFT)})`} />
    <path d={d} stroke={BRACKET_IRON} />
  </g>
);

/** The wall arm: an iron bar out of the wall (bent level at its knee on a round wall) with a curled tip, and its brace. */
const Arm = ({element: e}: {element: HauntedMansionOrnamentArmElement}) => {
  const curl = ARM_CURL;
  const d = `M${n(e.wx)} ${n(e.wy)}L${n(e.kx)} ${n(e.ky)}L${n(e.tx)} ${n(e.ty)}`
    + `Q${n(e.tx + e.ux * curl)} ${n(e.ty + e.uy * curl)} ${n(e.tx + e.ux * curl)} ${n(e.ty + e.uy * curl + curl)}`
    + `M${n(e.bx)} ${n(e.by)}Q${n(e.wx)} ${n(e.wy)} ${n(e.ax)} ${n(e.ay)}`;
  return <g opacity={e.opacity}><Iron d={d} lit={e.lit} cap="round" /></g>;
};

/** The shepherd's-hook bracket: its plate on the top edge, the stem, the bend and the bar up to the lamp's piece. */
const Bracket = ({element: e}: {element: HauntedMansionOrnamentBracketElement}) => {
  const bendEnd = e.sx + e.side * e.bend;
  const d = `M${n(e.sx)} ${n(e.fy)}V${n(e.barY + e.bend)}`
    + `A${n(e.bend)} ${n(e.bend)} 0 0 ${e.side > 0 ? 1 : 0} ${n(bendEnd)} ${n(e.barY)}H${n(e.to)}`;
  const plateWidth = PLATE.width + e.width - ARM_WIDTH;
  const plate = rect(e.sx - plateWidth / 2, e.fy - PLATE.height / 2, e.sx + plateWidth / 2, e.fy + PLATE.height / 2);
  return (
    <g opacity={e.opacity}>
      <path d={plate} fill={e.lit} opacity={LIT_OPACITY} transform={`translate(${n(MOON.x * LIT_SHIFT)} ${n(MOON.y * LIT_SHIFT)})`} />
      <Iron d={d} lit={e.lit} width={e.width} />
      <path d={plate} fill={BRACKET_IRON} />
    </g>
  );
};

/** The amber glass gradient (cream core, amber, ember edge), in the drawing's own units. */
const GlassGradient = ({id, cx, cy, r, core, warm, ember}: {id: string; cx: number; cy: number; r: number; core: string; warm: string; ember: string}) => (
  <defs>
    <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={n(cx)} cy={n(cy)} r={n(r)}>
      <stop offset={0} stopColor={core} />
      <stop offset={0.5} stopColor={warm} />
      <stop offset={1} stopColor={ember} />
    </radialGradient>
  </defs>
);

/** A lantern: its warm light, the end of its bracket (the bar through its hook), and the background's lamp head. */
const Lantern = ({element: e, id}: {element: HauntedMansionOrnamentLanternElement; id: (part: string) => string}) => {
  const s = e.scale;
  const lx = MOON.x * LIT_SHIFT;
  const ly = MOON.y * LIT_SHIFT;
  const glassId = id('glass');
  const lightRadius = e.light > 0 ? Math.max(0, e.light - Math.hypot(e.gx - e.x, e.gy - e.y)) : 0;
  const {colors} = MANSION_LANTERN;
  const {housing: housingStroke, cap: capStroke, hook: hookStroke} = lanternStrokes(s);
  const body = (fill: string, edge: string, cap: string, hook: string) => (
    <>
      <path d={MANSION_LANTERN.housing} fill={fill} stroke={edge} strokeWidth={n(housingStroke)} />
      <path d={MANSION_LANTERN.cap} fill={cap} stroke={cap} strokeWidth={n(capStroke)} strokeLinejoin="round" />
      <path d={MANSION_LANTERN.hook} fill="none" stroke={hook} strokeWidth={n(hookStroke)} strokeLinecap="round" />
    </>
  );
  const curl = ARM_CURL * e.side;
  const bar = e.bar ? `M${n(e.barFrom)} ${n(e.barY)}H${n(e.tipX)}Q${n(e.tipX + curl)} ${n(e.barY)} ${n(e.tipX + curl)} ${n(e.barY + ARM_CURL)}` : '';
  return (
    <g opacity={e.opacity}>
      <RadialLight id={id('light')} x={e.gx} y={e.gy} radius={lightRadius} color={e.warm} opacity={e.lightOpacity} falloff={0.65} />
      {bar && <Iron d={bar} lit={e.lit} width={e.barWidth} />}
      <g transform={`translate(${n(e.ox)} ${n(e.oy)}) scale(${n(e.side * s)} ${n(s)})`}>
        <GlassGradient id={glassId} cx={0} cy={4} r={22} core={e.core} warm={e.warm} ember={e.ember} />
        <g opacity={LIT_OPACITY} transform={`translate(${n(e.side * lx / s)} ${n(ly / s)})`}>
          {body(e.lit, e.lit, e.lit, e.lit)}
        </g>
        {body(colors.housing, colors.housingEdge, colors.cap, colors.hook)}
        <path d={MANSION_LANTERN.glass} fill={paint(glassId)} opacity={n(e.glass)} />
        {/* The centre mullion over the glass. */}
        <path d="M0-16V21" stroke={colors.cap} strokeWidth={n(capStroke * 0.8)} />
      </g>
      {/* A faint bloom over the lamp itself: the glass warms its own iron, as the background's lamp glow does. */}
      <RadialLight id={id('bloom')} x={e.gx} y={e.gy} radius={Math.min(lightRadius, 1.1 * s * LANTERN_HEIGHT_UNITS / 2)} color={e.core}
        opacity={BLOOM * e.lightOpacity} falloff={0.3} />
    </g>
  );
};

/** The dormer's rose window: dark disc with its trim (lit on the moon side), amber glass, eight spokes, hub and outer ring. */
const Rose = ({element: e, id}: {element: HauntedMansionOrnamentRoseElement; id: (part: string) => string}) => {
  const s = e.scale;
  const {spoke, ring} = roseStrokes(s);
  const {colors} = ROSE;
  const glassId = id('glass');
  const r = ROSE.glass;
  const spokes = `M0 ${-r}V${r}M${-r} 0H${r}M${n(-r * Math.SQRT1_2)} ${n(-r * Math.SQRT1_2)}L${n(r * Math.SQRT1_2)} ${n(r * Math.SQRT1_2)}`
    + `M${n(-r * Math.SQRT1_2)} ${n(r * Math.SQRT1_2)}L${n(r * Math.SQRT1_2)} ${n(-r * Math.SQRT1_2)}`;
  return (
    <g opacity={e.opacity}>
      <RadialLight id={id('light')} x={e.x} y={e.y} radius={e.light} color={e.warm} opacity={e.lightOpacity} falloff={0.7} />
      <g transform={`translate(${n(e.x)} ${n(e.y)}) scale(${n(s)})`}>
        <GlassGradient id={glassId} cx={0} cy={0} r={r} core={e.core} warm={e.warm} ember={e.ember} />
        <circle r={ROSE.ring} fill="none" stroke={colors.trim} strokeWidth={n(ring)} opacity={0.45} />
        <circle cx={n(MOON.x * LIT_SHIFT / s)} cy={n(MOON.y * LIT_SHIFT / s)} r={ROSE.disc + ROSE.trim / 2} fill={e.lit} opacity={LIT_OPACITY} />
        <circle r={ROSE.disc + ROSE.trim / 2} fill={colors.roof} />
        <circle r={ROSE.disc} fill="none" stroke={colors.trim} strokeWidth={ROSE.trim} opacity={ROSE.trimOpacity} />
        <circle r={r} fill={paint(glassId)} opacity={n(0.91 * e.glass)} />
        <path d={spokes} stroke={colors.roof} strokeWidth={n(spoke)} />
        <circle r={ROSE.hub} fill={colors.roof} />
      </g>
    </g>
  );
};

/** A lit lancet: the background's arched pane in a dark surround (lit on the moon side), trim, mullion and transom. */
const Lancet = ({element: e, id}: {element: HauntedMansionOrnamentLancetElement; id: (part: string) => string}) => {
  const {width, height, colors} = LANCET;
  const pane = lancetPanePath(width, height);
  const glassId = id('glass');
  const surround = 2 * LANCET.surround;
  return (
    <g opacity={e.opacity}>
      <RadialLight id={id('light')} x={e.x} y={e.y} radius={e.light} color={e.warm} opacity={e.lightOpacity} falloff={0.7} />
      <g transform={`translate(${n(e.px)} ${n(e.py)})`} strokeLinejoin="round">
        <GlassGradient id={glassId} cx={width / 2} cy={height * 0.55} r={height * 0.6} core={e.core} warm={e.warm} ember={e.ember} />
        <path d={pane} fill={e.lit} stroke={e.lit} strokeWidth={surround} opacity={LIT_OPACITY} transform={`translate(${MOON.x * LIT_SHIFT} ${MOON.y * LIT_SHIFT})`} />
        <path d={pane} fill={colors.surround} stroke={colors.surround} strokeWidth={surround} />
        <path d={pane} fill={paint(glassId)} opacity={n(e.glass)} />
        <path d={`M${width / 2} 1V${height}M0 ${n(height * LANCET.transom)}H${width}`} stroke={colors.mullion} strokeWidth={LANCET.mullion} />
        <path d={pane} fill="none" stroke={colors.trim} strokeWidth={LANCET.trim} opacity={LANCET.trimOpacity} />
      </g>
    </g>
  );
};

export const hauntedMansionSet: OrnamentSet = set;
