import {TAU} from '../../../../loop';
import {svgNumber} from '../../geometry';
import {cycleOf} from '../../motion';
import {ornamentPalette} from '../draw';
import {harmonics, ornamentRandom} from '../place';
import type {OrnamentBase, OrnamentCornerId, OrnamentSet} from '../types';
import {
  BLOCKS_MIN_ARM, BRACKET, HERO_FORMS, heroCells, heroCircle, placeTerminal, RETICLE, RIM, RULE, RULE_PERIOD, slotSigns,
} from './terminal-place';

/**
 * The 'terminal' ornaments (DotGridLoop, "sand terminal"): an L of squares on the TL corner, L
 * brackets on the TR and BL corners, a reticle off the BR corner and a hairline rule with ruler
 * marks along the top edge, in the kit's ink on sand (ornamentColors: [0] ink, [1] the sand rim that
 * keeps the ink readable over dark footage; a third colour is not used). Placement and sizes:
 * terminal-place.ts (ornamentSize = the blocks' arm).
 *
 * Rhythms from the background: the rule's marks drift left at the sand-terminal background's dot
 * speed (7.5 px/s at 16 s), a whole number of mark periods per loop; a scan runs out of the corner
 * through the blocks twice per loop; the reticle's arcs turn once per loop. Wrapping fields are
 * cosine-sine pairs, so the seam never jumps.
 */

/** The sand-terminal background's dots: 3 steps of 40 px per 16 s loop. */
const DOT_SPEED = 7.5;
/** The scan through the blocks, in Hz (twice per 16 s loop). */
const HZ = {scan: 2 / 16, spin: 1 / 16} as const;
/** The scan's lag from one square of an arm to the next, in radians. */
const SCAN_LAG = 0.9;
/** Fill opacity of each square of an arm at the scan's trough and its swing: the corner one barely moves. */
const BLOCK_FILL = [[0.85, 0.15], [0.55, 0.45], [0.35, 0.65], [0.25, 0.75], [0.2, 0.8]] as const;
/** A hollow square's outline, in px. */
const HOLLOW_WIDTH = 1.25;
/** The sand rim's opacity under every motif. */
const RIM_ALPHA = 0.85;
/** The rule's short marks, lighter than the long ones. */
const MINOR_ALPHA = 0.6;
/** The reticle's four arcs: each spans this share of a quarter turn. */
const RETICLE_ARC = 0.62;

type BlocksElement = OrnamentBase & {
  type: 'terminal-blocks'; form: number; arm: number; sx: number; sy: number; cornerX: number; cornerY: number;
  level0: number; level1: number; level2: number; level3: number; level4: number; ink: string; rim: string;
};
type BracketElement = OrnamentBase & {type: 'terminal-bracket'; arm: number; sx: number; sy: number; ink: string; rim: string};
type ReticleElement = OrnamentBase & {type: 'terminal-reticle'; radius: number; spinCos: number; spinSin: number; ink: string; rim: string};
type RuleElement = OrnamentBase & {
  type: 'terminal-rule'; from: number; to: number; line: number; origin: number; shiftCos: number; shiftSin: number; ink: string; minor: string; rim: string;
};
type TerminalOrnamentElement = BlocksElement | BracketElement | ReticleElement | RuleElement;

const form = (motif: string) => motif.slice('blocks-'.length) as (typeof HERO_FORMS)[number];

const set: OrnamentSet<TerminalOrnamentElement> = {
  name: 'terminal',
  seedOffset: 120,
  minExtent: heroCircle('l', BLOCKS_MIN_ARM, 1, 1).extent,
  place(frame, style) {
    return placeTerminal(frame, style.ornamentSize);
  },
  build(_frame, placements, style, frameIndex, durationInFrames) {
    const random = ornamentRandom(style.seed, set);
    const angle = TAU * cycleOf(frameIndex, durationInFrames);
    const scan = harmonics(HZ.scan, style.durationSeconds);
    const spin = harmonics(HZ.spin, style.durationSeconds);
    const drift = Math.max(1, Math.round((DOT_SPEED * style.durationSeconds) / RULE_PERIOD));
    const {cool: ink, light: rim} = ornamentPalette(style);
    const minor = ink;
    const start = placements.find((placement) => placement.motif === 'rule-start');
    const origin = start ? start.x - start.size / 2 : 0;
    return placements.map((placement, anchor): TerminalOrnamentElement => {
      // Every element draws its phases, used or not, so one motif never shifts another's.
      const phase = random() * TAU;
      const turn = random() < 0.5 ? -1 : 1;
      const base = {layer: placement.layer, anchor, opacity: 1, x: placement.x, y: placement.y, reach: placement.extent, light: 0, lightOpacity: 0};
      if (placement.motif.startsWith('blocks-')) {
        const [sx, sy] = slotSigns(placement.slot as OrnamentCornerId);
        // Frame 0 is the hero pose: the corner square full, the scan just leaving it.
        const level = (step: number) => 0.5 + 0.5 * Math.cos(scan * angle - step * SCAN_LAG);
        // The placement is centred on the corner point or on the hero's smallest circle: whichever its extent matches.
        const smallest = heroCircle(form(placement.motif), placement.size, sx, sy);
        const centre = smallest.extent === placement.extent ? smallest : {dx: 0, dy: 0};
        return {
          ...base, type: 'terminal-blocks', form: HERO_FORMS.indexOf(form(placement.motif)),
          arm: placement.size, sx, sy, cornerX: placement.x - centre.dx, cornerY: placement.y - centre.dy,
          level0: level(0), level1: level(1), level2: level(2), level3: level(3), level4: level(4), ink, rim,
        };
      }
      if (placement.motif === 'bracket') {
        const [sx, sy] = slotSigns(placement.slot as OrnamentCornerId);
        return {...base, type: 'terminal-bracket', arm: placement.size, sx, sy, ink, rim};
      }
      if (placement.motif === 'reticle') {
        const a = phase + turn * spin * angle;
        return {...base, type: 'terminal-reticle', radius: placement.size, spinCos: Math.cos(a), spinSin: Math.sin(a), ink, rim};
      }
      const shift = drift * angle;
      return {
        ...base, type: 'terminal-rule', from: placement.x - placement.size / 2, to: placement.x + placement.size / 2,
        line: placement.y - RULE.major / 2, origin, shiftCos: Math.cos(shift), shiftSin: Math.sin(shift), ink, minor, rim,
      };
    });
  },
  render(element, key) {
    if (element.type === 'terminal-blocks') return <TerminalBlocks key={key} element={element} />;
    if (element.type === 'terminal-bracket') return <TerminalBracket key={key} element={element} />;
    if (element.type === 'terminal-reticle') return <TerminalReticle key={key} element={element} />;
    return <TerminalRule key={key} element={element} />;
  },
};

const n = svgNumber;

/** The ink drawn twice: the sand rim RIM px wider underneath, then the ink. */
const Inked = ({d, width, ink, rim, fill}: {d: string; width: number; ink: string; rim: string; fill?: boolean}) => (
  <g>
    <path d={d} fill={fill ? rim : 'none'} stroke={rim} strokeOpacity={RIM_ALPHA} fillOpacity={RIM_ALPHA} strokeWidth={n(width + 2 * RIM)}
      strokeLinejoin="miter" strokeLinecap="square" />
    <path d={d} fill={fill ? ink : 'none'} stroke={fill ? 'none' : ink} strokeWidth={fill ? undefined : n(width)} strokeLinejoin="miter"
      strokeLinecap="square" />
  </g>
);

const square = (cx: number, cy: number, side: number) => `M${n(cx - side / 2)} ${n(cy - side / 2)}h${n(side)}v${n(side)}h${n(-side)}Z`;

/** The hero's squares (heroCells), each fill riding the scan; a hollow one keeps its outline. */
const TerminalBlocks = ({element}: {element: BlocksElement}) => {
  const levels = [element.level0, element.level1, element.level2, element.level3, element.level4];
  const cells = heroCells(HERO_FORMS[element.form]!, element.arm, element.sx, element.sy)
    .map((cell) => ({...cell, d: square(element.cornerX + cell.dx, element.cornerY + cell.dy, cell.side)}));
  return (
    <g>
      <path d={cells.map((cell) => cell.d).join('')} fill={element.rim} fillOpacity={RIM_ALPHA} stroke={element.rim} strokeOpacity={RIM_ALPHA}
        strokeWidth={n(2 * RIM)} strokeLinejoin="miter" />
      {cells.map((cell, index) => {
        const [trough, swing] = BLOCK_FILL[cell.step]!;
        const fill = trough + swing * levels[cell.step]!;
        return cell.hollow ? (
          <g key={index}>
            <path d={cell.d} fill={element.ink} fillOpacity={n(0.6 * levels[cell.step]!)} />
            <path d={cell.d} fill="none" stroke={element.ink} strokeWidth={n(HOLLOW_WIDTH)} strokeLinejoin="miter" />
          </g>
        ) : <path key={index} d={cell.d} fill={element.ink} fillOpacity={n(fill)} />;
      })}
    </g>
  );
};

/** An L out of the corner: its vertex outside, the two arms back along the edges. */
const TerminalBracket = ({element}: {element: BracketElement}) => {
  const {arm, sx, sy} = element;
  const vx = element.x + sx * arm / 2;
  const vy = element.y + sy * arm / 2;
  const d = `M${n(vx - sx * arm)} ${n(vy)}L${n(vx)} ${n(vy)}L${n(vx)} ${n(vy - sy * arm)}`;
  return <Inked d={d} width={BRACKET.width} ink={element.ink} rim={element.rim} />;
};

/** The reticle: four arcs turning round a fixed cross with a gap at its middle, and a centre dot. */
const TerminalReticle = ({element}: {element: ReticleElement}) => {
  const {x, y, radius: r} = element;
  const start = Math.atan2(element.spinSin, element.spinCos);
  const sweep = (RETICLE_ARC * TAU) / 4;
  const arcs = [0, 1, 2, 3].map((index) => {
    const a0 = start + (index * TAU) / 4 - sweep / 2;
    const a1 = a0 + sweep;
    return `M${n(x + r * Math.cos(a0))} ${n(y + r * Math.sin(a0))}A${n(r)} ${n(r)} 0 0 1 ${n(x + r * Math.cos(a1))} ${n(y + r * Math.sin(a1))}`;
  }).join('');
  const inner = 0.45 * r;
  const outer = RETICLE.cross * r;
  const cross = `M${n(x - outer)} ${n(y)}H${n(x - inner)}M${n(x + inner)} ${n(y)}H${n(x + outer)}`
    + `M${n(x)} ${n(y - outer)}V${n(y - inner)}M${n(x)} ${n(y + inner)}V${n(y + outer)}`;
  const dot = square(x, y, 1.5 * RETICLE.width);
  return (
    <g>
      <Inked d={arcs + cross} width={RETICLE.width} ink={element.ink} rim={element.rim} />
      <Inked d={dot} width={0} ink={element.ink} rim={element.rim} fill />
    </g>
  );
};

/**
 * One piece of the rule: the hairline from `from` to `to` and the marks that fall in [from, to),
 * every RULE.pitch px from the run's origin, drifting left by `shift` (a long one every
 * RULE.majorEvery). The marks point down, at the panel.
 */
const TerminalRule = ({element}: {element: RuleElement}) => {
  const {from, to, line} = element;
  const turn = Math.atan2(element.shiftSin, element.shiftCos) / TAU;
  const shift = (turn - Math.floor(turn)) * RULE_PERIOD;
  const first = Math.ceil((from - element.origin + shift) / RULE.pitch - 1e-9);
  let major = '';
  let minor = '';
  // The marks' rim starts under the hairline's ink: a mark by a piece's left end must not eat into
  // the previous piece's hairline, drawn before it.
  let rim = '';
  for (let k = first; ; k++) {
    const at = element.origin - shift + k * RULE.pitch;
    if (at >= to - 1e-9) break;
    const long = ((k % RULE.majorEvery) + RULE.majorEvery) % RULE.majorEvery === 0;
    const end = line + (long ? RULE.major : RULE.minor);
    const mark = `M${n(at)} ${n(line)}V${n(end)}`;
    rim += `M${n(at)} ${n(line + RULE.width / 2)}V${n(end + RIM)}`;
    if (long) major += mark;
    else minor += mark;
  }
  const hairline = `M${n(from)} ${n(line)}H${n(to)}`;
  return (
    <g strokeLinecap="butt">
      <path d={hairline + rim} fill="none" stroke={element.rim} strokeOpacity={RIM_ALPHA} strokeWidth={n(RULE.width + 2 * RIM)} />
      <path d={hairline + major} fill="none" stroke={element.ink} strokeWidth={n(RULE.width)} />
      {minor ? <path d={minor} fill="none" stroke={element.minor} strokeOpacity={MINOR_ALPHA} strokeWidth={n(RULE.width)} /> : null}
    </g>
  );
};

export const terminalSet: OrnamentSet = set;
