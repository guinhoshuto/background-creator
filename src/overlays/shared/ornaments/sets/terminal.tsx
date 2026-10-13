import {TAU} from '../../../../loop';
import {svgNumber} from '../../geometry';
import {cycleOf} from '../../motion';
import {ornamentPalette} from '../draw';
import {harmonics, ornamentRandom} from '../place';
import type {OrnamentBase, OrnamentSet} from '../types';
import {DBAR, METER, ROW, placeTerminal, TERMINAL_MIN_EXTENT, type TerminalMotif, type TerminalPlacement} from './terminal-place';

/**
 * The 'terminal' ornaments (TerminalGridLoop, "sand terminal"): the old HTML pack's shape
 * vocabulary (v3) around the panels and frames. A row of ink squares above the top line (the
 * hero, everywhere), lock-on brackets and the accent lock diamond on the frames, the knocked-out
 * square on a chat's dark header and the signal meter on its footer, the double bar beside a
 * block's text. Placement and sizes: terminal-place.ts (ornamentSize = the row's pitch).
 *
 * ornamentColors: [0] the ink, [1] the light knock-out (the head square, and the rim under every
 * other motif that keeps the ink readable over dark footage), [2] the accent (the diamond; without
 * it, the ink).
 *
 * Motion, as in the pack: the squares, brackets and bars stand still (the panels' lines carry the
 * motion); the diamond pulses (2.6 s in the pack: 6 whole pulses per 16 s), and the meter's signal
 * drifts between two and five bars on a few whole cycles, every bar fading on and off. Frame 0 is
 * the pack's pose: the diamond bright, four bars of five lit. Every rim is drawn before any ink, so
 * the rim of one piece of a run never covers its neighbour.
 */

/** The diamond's pulses (the pack's 2.6 s) and the meter's two drifts, in Hz. */
const HZ = {diamond: 1 / 2.6, slow: 2 / 16, fast: 5 / 16} as const;
/** The diamond's opacity: .95 at the peak, .55 at the trough. */
const DIAMOND_ALPHA = {mid: 0.75, swing: 0.2} as const;
/** The meter: four bars lit at rest, and how far each drift moves the level. */
const METER_LEVEL = {rest: 4, slow: 0.9, fast: 0.5} as const;
/** An unlit bar is the pack's line colour: the ink at .5. */
const BAR_OFF = 0.5;
/**
 * The rim's opacity: enough to lift the ink off dark footage, low enough that on the sand the
 * squares read as the pack's plain ink squares, not framed ones (.85 did, 2026-10-12 mock).
 */
const RIM_ALPHA = 0.4;

type Fields = {
  /** 0 the rim, 1 the ink. */
  part: number;
  x0: number; y0: number; x1: number; y1: number; rim: number; rimBefore: number; rimAfter: number;
  /** 0 along x, 1 along y (the runs: bracket pieces, double bar). */
  along: number;
  color: string;
  alpha: number;
};
type SquareElement = OrnamentBase & Fields & {type: 'terminal-square'};
type BracketElement = OrnamentBase & Fields & {type: 'terminal-bracket'};
type DiamondElement = OrnamentBase & Fields & {type: 'terminal-diamond'};
type HeadElement = OrnamentBase & Fields & {type: 'terminal-head'};
type DoubleBarElement = OrnamentBase & Fields & {type: 'terminal-dbar'};
type MeterElement = OrnamentBase & Fields & {
  type: 'terminal-meter'; level0: number; level1: number; level2: number; level3: number; level4: number;
};
type TerminalOrnamentElement = SquareElement | BracketElement | DiamondElement | HeadElement | DoubleBarElement | MeterElement;

const TYPES: Record<TerminalMotif, TerminalOrnamentElement['type']> = {
  square: 'terminal-square', 'bracket-h': 'terminal-bracket', 'bracket-v': 'terminal-bracket', diamond: 'terminal-diamond',
  head: 'terminal-head', meter: 'terminal-meter', dbar: 'terminal-dbar',
};

const runsAlongY = (motif: TerminalMotif) => motif === 'dbar' || motif === 'bracket-v';

/** How far a part reaches round its centre: the rect (or the diamond's half diagonal), with the rim for the rim part. */
const reachOf = (spot: TerminalPlacement, rim: boolean) => {
  const halfW = (spot.x1 - spot.x0) / 2;
  const halfH = (spot.y1 - spot.y0) / 2;
  if (spot.motif === 'diamond') return halfW * Math.SQRT2 + (rim ? spot.rim : 0);
  if (!rim) return Math.hypot(halfW, halfH);
  const ends = Math.max(spot.rimBefore, spot.rimAfter, 0);
  return runsAlongY(spot.motif) ? Math.hypot(halfW + spot.rim, halfH + ends) : Math.hypot(halfW + ends, halfH + spot.rim);
};

const set: OrnamentSet<TerminalOrnamentElement> = {
  name: 'terminal',
  seedOffset: 120,
  minExtent: TERMINAL_MIN_EXTENT,
  place(frame, style) {
    return placeTerminal(frame, style.ornamentSize);
  },
  build(_frame, placements, style, frameIndex, durationInFrames) {
    const random = ornamentRandom(style.seed, set);
    const angle = TAU * cycleOf(frameIndex, durationInFrames);
    const pulses = harmonics(HZ.diamond, style.durationSeconds);
    const slow = harmonics(HZ.slow, style.durationSeconds);
    const fast = harmonics(HZ.fast, style.durationSeconds);
    const {cool: inkColor, light: knock, warm: accent} = ornamentPalette(style);
    const rims: TerminalOrnamentElement[] = [];
    const inks: TerminalOrnamentElement[] = [];
    placements.forEach((placement, anchor) => {
      const spot = placement as TerminalPlacement;
      // Every placement draws its phases, used or not, so one motif never shifts another's.
      const phaseSlow = random() * TAU;
      const phaseFast = random() * TAU;
      const base = {
        layer: spot.layer, anchor, opacity: 1, x: spot.x, y: spot.y, light: 0, lightOpacity: 0,
        x0: spot.x0, y0: spot.y0, x1: spot.x1, y1: spot.y1, rim: spot.rim, rimBefore: spot.rimBefore, rimAfter: spot.rimAfter,
        along: runsAlongY(spot.motif) ? 1 : 0,
      };
      const type = TYPES[spot.motif];
      if (spot.rim > 0) {
        rims.push({...base, type, part: 0, reach: reachOf(spot, true), color: knock, alpha: RIM_ALPHA, ...(type === 'terminal-meter' ? QUIET : {})} as TerminalOrnamentElement);
      }
      const ink = {...base, part: 1, reach: reachOf(spot, false)};
      if (type === 'terminal-meter') {
        // Sines through 0 at frame 0: the level rests at four bars there.
        const level = METER_LEVEL.rest
          + METER_LEVEL.slow * (Math.sin(slow * angle + phaseSlow) - Math.sin(phaseSlow))
          + METER_LEVEL.fast * (Math.sin(fast * angle + phaseFast) - Math.sin(phaseFast));
        // Eased, not clamped: a clamp's corner would break the bar's speed wherever the level crosses it, the seam included.
        const lit = (bar: number) => {
          const t = Math.min(1, Math.max(0, level - bar));
          return t * t * (3 - 2 * t);
        };
        inks.push({...ink, type, color: inkColor, alpha: 1, level0: lit(0), level1: lit(1), level2: lit(2), level3: lit(3), level4: lit(4)});
      } else if (type === 'terminal-diamond') {
        inks.push({...ink, type, color: accent, alpha: DIAMOND_ALPHA.mid + DIAMOND_ALPHA.swing * Math.cos(pulses * angle)});
      } else if (type === 'terminal-head') {
        inks.push({...ink, type, color: knock, alpha: 1});
      } else {
        inks.push({...ink, type, color: inkColor, alpha: type === 'terminal-square' ? ROW.opacity : 1});
      }
    });
    return [...rims, ...inks];
  },
  render(element, key) {
    if (element.type === 'terminal-meter' && element.part === 1) return <MeterInk key={key} element={element} />;
    return <path key={key} d={pathOf(element)} fill={element.color} opacity={n(element.alpha)} />;
  },
};

/** A meter's rim carries levels too (every meter element has the same fields), unused. */
const QUIET = {level0: 0, level1: 0, level2: 0, level3: 0, level4: 0} as const;

const n = svgNumber;

const rect = (x0: number, y0: number, x1: number, y1: number) => `M${n(x0)} ${n(y0)}H${n(x1)}V${n(y1)}H${n(x0)}Z`;

/** A rect grown by `rim` across its run and by `before` and `after` past its ends along it (along: 0 x, 1 y). */
const grown = (x0: number, y0: number, x1: number, y1: number, along: number, rim: number, before: number, after: number) =>
  (along === 0 ? rect(x0 - before, y0 - rim, x1 + after, y1 + rim) : rect(x0 - rim, y0 - before, x1 + rim, y1 + after));

/** The double bar's two rects across [x0, x1]: the 1 px line, then the 4 px bar DBAR.gap px right of it. */
const doubleBar = (x0: number, x1: number) => [[x0, x0 + DBAR.line], [x1 - DBAR.bar, x1]] as const;

/** The meter's bars: left to right, bottom-aligned on y1. */
const meterBars = (x0: number, y1: number) =>
  METER.heights.map((height, index) => ({x0: x0 + index * (METER.bar + METER.gap), x1: x0 + index * (METER.bar + METER.gap) + METER.bar, y0: y1 - height}));

const pathOf = (element: TerminalOrnamentElement): string => {
  const {x0, y0, x1, y1, along, part} = element;
  const rim = part === 0 ? element.rim : 0;
  const before = part === 0 ? element.rimBefore : 0;
  const after = part === 0 ? element.rimAfter : 0;
  switch (element.type) {
    case 'terminal-diamond': {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const r = ((x1 - x0) / 2) * Math.SQRT2 + rim;
      return `M${n(cx)} ${n(cy - r)}L${n(cx + r)} ${n(cy)}L${n(cx)} ${n(cy + r)}L${n(cx - r)} ${n(cy)}Z`;
    }
    case 'terminal-dbar':
      return doubleBar(x0, x1).map(([a, b]) => grown(a, y0, b, y1, along, rim, before, after)).join('');
    case 'terminal-meter':
      // The rim round every bar (the ink is MeterInk's: one opacity per bar).
      return meterBars(x0, y1).map((bar) => grown(bar.x0, bar.y0, bar.x1, y1, 1, rim, rim, rim)).join('');
    default:
      return grown(x0, y0, x1, y1, along, rim, before, after);
  }
};

/** The meter's bars, each from the pack's unlit line colour (the ink at BAR_OFF) to the full ink as it lights. */
const MeterInk = ({element}: {element: MeterElement}) => {
  const levels = [element.level0, element.level1, element.level2, element.level3, element.level4];
  return (
    <g fill={element.color}>
      {meterBars(element.x0, element.y1).map((bar, index) => (
        <path key={index} d={rect(bar.x0, bar.y0, bar.x1, element.y1)} opacity={n(BAR_OFF + (1 - BAR_OFF) * levels[index]!)} />
      ))}
    </g>
  );
};

export const terminalSet: OrnamentSet = set;
