import {createContext, useContext, type ReactNode} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {loopPhase, TAU} from '../../loop';
import {OverlayCanvas} from '../shared/render';
import {STACKED_LAYOUT_IDS} from './layouts';
import {z} from 'zod';
import {bandPath, getLiveFrameScene} from './LiveFrameLoop';
import {cornerRectPath} from './geometry';
import {liveFrameLoopSchema, verticalBaseFields} from './schema';

/** Three original code-drawn looks approved on the direction sheet. */
export const PRISMATIC_POP_LOOKS = ['electric-candy', 'night-signal', 'sugar-voltage'] as const;
export const prismaticPopSchema = z.object({
  ...verticalBaseFields(),
  look: z.enum(PRISMATIC_POP_LOOKS).describe('Prismatic Pop palette and artwork').default('electric-candy'),
  layout: z.enum(STACKED_LAYOUT_IDS).describe('Stacked windows: arched or rectangular, regular or compact gap').default('three-blocks'),
  chatMode: z.literal('open').describe('Open field for native LIVE comments').default('open'),
  ornaments: z.boolean().describe('Decorative ribbons, shapes, halftone and glints; off keeps the palette and rings').default(true),
}).strict();
export type PrismaticPopProps = z.infer<typeof prismaticPopSchema>;
/** Includes the outer ink keyline; the compact layout must leave two of these apart. */
export const PRISMATIC_RING_EXTENT = 19;

/** Four halftone tiles per loop, flexible ribbons and complete satellite orbits. */
export const getPrismaticPopMotion = (frame: number, durationInFrames: number, seed = 1) => {
  const phase = loopPhase(frame, durationInFrames) / TAU;
  const angle = phase * TAU + (seed - 1) * 0.37;
  const breath = (1 - Math.cos(angle)) / 2;
  return {
    phase, angle, dots: phase * 60,
    ribbonWave: Math.sin(angle), ribbonCounterWave: Math.sin(angle * 2 + 0.8),
    glintOpacity: 1 - breath * 0.2, glintScale: 1.08 - breath * 0.3,
  };
};
const Motion = createContext(getPrismaticPopMotion(0, 480));
const INK = '#121021';
const PAPER = '#FFF8E9';
const palettes = {
  'electric-candy': {ground: '#FF443B', chat: '#B53248', edge: '#FFE745', line: PAPER},
  'night-signal': {ground: '#18102E', chat: '#211838', edge: '#C8FF3C', line: '#FF65B8'},
  'sugar-voltage': {ground: '#EAE5FF', chat: '#665984', edge: '#FF93AF', line: '#F8F8FF'},
} as const;

/** Intersect screen-minus-hole clips; a combined evenodd path would refill overlapping windows. */
const Cutouts = ({holes, prefix, children}: {holes: string[]; prefix: string; children: ReactNode}) =>
  holes.reduceRight<ReactNode>((child, hole, index) => (
    <g key={`${prefix}-${index}`}>
      <defs><clipPath id={`${prefix}-${index}`}><path d={hole} clipRule="evenodd" /></clipPath></defs>
      <g clipPath={`url(#${prefix}-${index})`}>{child}</g>
    </g>
  ), children);

const Spark = ({x, y, size, color, turn = 0}: {x: number; y: number; size: number; color: string; turn?: number}) => {
  const {angle} = useContext(Motion);
  // Position-derived offsets keep neighboring glints from flashing in unison.
  const local = angle * 2 + x * 0.013 + y * 0.007;
  const breath = (1 - Math.cos(local)) / 2;
  return <path data-motion="glint" d="M0 -1 L.2 -.2 L1 0 L.2 .2 L0 1 L-.2 .2 L-1 0 L-.2 -.2 Z"
    transform={`translate(${x} ${y}) rotate(${turn + 18 * Math.sin(local)}) scale(${size * (1.08 - breath * 0.3)})`}
    opacity={1 - breath * 0.2} fill={color} />;
};

const Ribbon = ({d, color, width = 26, flow = false}: {d: string; color: string; width?: number; flow?: boolean}) => {
  const {phase} = useContext(Motion);
  return <g data-motion="ribbon" fill="none" strokeLinejoin="round">
    <path d={d} stroke={INK} strokeWidth={width + 10} />
    <path d={d} stroke={color} strokeWidth={width} />
    {flow ? <path d={d} pathLength={100} stroke={PAPER} strokeWidth={width * 0.3}
      strokeLinecap="round" strokeDasharray="3 17" strokeDashoffset={-phase * 100} /> : null}
  </g>;
};

/** Satellites stay attached to their own rail, including under its rotation. */
const Orbit = ({cx, cy, rx, ry, turn, width, offset = 0}: {
  cx: number; cy: number; rx: number; ry: number; turn: number; width: number; offset?: number;
}) => {
  const {angle} = useContext(Motion);
  return <g transform={`rotate(${turn} ${cx} ${cy})`}>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#2AE5EB" strokeWidth={width} />
    {[0, 0.44].map((spacing, index) => {
      const local = angle + (offset + spacing) * TAU;
      return <circle key={index} data-motion="satellite" cx={cx + rx * Math.cos(local)} cy={cy + ry * Math.sin(local)}
        r={index === 0 ? 13 : 9} fill={index === 0 ? '#C8FF3C' : PAPER} stroke={INK} strokeWidth={3} />;
    })}
  </g>;
};

const ElectricCandy = ({prefix}: {prefix: string}) => {
  const {ribbonWave: a, ribbonCounterWave: b} = useContext(Motion);
  return <g>
    {/* Large asymmetrical plates, with the frame windows cutting their inner edges. */}
    <path d="M-80 -30 H720 L420 126 L680 174 L236 382 L-80 500Z" fill="#FF7050" />
    <path d="M-40 200 L493 -45 L620 -45 L209 297 L-40 414Z" fill="#2637E9" stroke={INK} strokeWidth={8} />
    <path d="M440 -10 L661 -10 L528 96 L774 74 L528 230 L558 147 L354 192Z" fill="#FFE745" stroke={INK} strokeWidth={7} />
    <path d="M780 -20 L1100 -20 L1100 635 L972 458 L1039 219 L745 306 L913 105Z" fill="#242BCF" stroke={INK} strokeWidth={8} />
    <path d="M998 338 L1100 288 L1100 877 L1011 947 L990 638 L1049 603Z" fill="#FFAFCD" stroke={INK} strokeWidth={7} />
    <path d="M-40 485 L90 420 L79 720 L165 784 L53 842 L-40 776Z" fill="#FFE745" stroke={INK} strokeWidth={8} />
    <path d="M-30 864 L87 924 L38 1268 L198 1334 L-30 1370Z" fill="#2736EC" />
    <path d="M1004 1010 L1110 940 L1110 1940 L751 1940 L817 1768 L960 1796 L858 1585 L1000 1460 L931 1334Z" fill="#FF513E" stroke={INK} strokeWidth={10} />
    <path d="M818 1604 L992 1670 L1101 1605 L1101 1823 L902 1770Z" fill="#FFE745" stroke={INK} strokeWidth={8} />
    <path d="M-30 1847 L445 1801 L609 1880 L850 1838 L975 1950 H-30Z" fill="#2637E9" stroke={INK} strokeWidth={8} />
    <path d="M20 1848 L447 1815 L600 1878 L337 1859 L90 1922Z" fill={PAPER} />
    <path d="M0 46 L330 0 L254 99 L0 230Z M1044 480 L1110 430 V810 L998 864Z M863 1340 L1080 1285 V1490 L940 1540Z"
      fill={`url(#${prefix}-dots)`} />
    <Ribbon d={`M-80 102 C160 ${23 + 22 * a} 314 ${211 + 28 * b} 543 ${180 + 18 * a} S845 ${-46 + 20 * b} 1040 80 S${952 + 22 * a} ${364 + 18 * b} 1150 417`} color="#5BE8ED" width={28} flow />
    <Ribbon d={`M1110 790 C${988 + 16 * a} 808 ${988 - 16 * a} 1120 1110 1208`} color="#5BE8ED" width={20} flow />
    <Ribbon d={`M816 1960 C810 ${1850 + 12 * a} 985 ${1760 + 16 * b} 1120 1840`} color="#FFABD0" width={30} flow />
    <g stroke={PAPER} strokeWidth={5} fill="none">
      <ellipse cx={160} cy={234} rx={66} ry={117} transform="rotate(48 160 234)" />
      <path d="M20 541 L67 510 M18 558 L65 527 M1008 1391 L1049 1368 M1016 1410 L1057 1387" />
    </g>
    <Spark x={832} y={193} size={47} color={PAPER} turn={14} />
    <Spark x={58} y={770} size={26} color={PAPER} turn={12} />
    <Spark x={993} y={1560} size={42} color="#2637E9" turn={-12} />
    <circle cx={60} cy={1140} r={15} fill="#FFE745" stroke={INK} strokeWidth={5} />
  </g>;
};

const NightSignal = ({prefix}: {prefix: string}) => (
  <g>
    <path d="M-20 -20 H512 L324 159 L441 198 L120 407 L-20 320Z" fill="#33215A" />
    <path d="M574 -30 L1090 -30 V404 L955 514 L989 291 L768 352 L881 167 L591 237 L695 112 L500 118Z"
      fill="#FA46AA" stroke={INK} strokeWidth={9} />
    <path d="M858 38 L1000 12 L932 130 L1075 106 L875 321 L920 186 L791 223Z" fill="#C8FF3C" stroke={INK} strokeWidth={8} />
    <path d="M-20 317 L82 236 L48 598 L109 632 L34 758 L-20 725Z" fill="#C8FF3C" />
    <path d="M1016 491 L1100 435 V1296 L993 1388 L1020 1155 L970 1104 L1052 927 L989 827Z" fill="#352564" />
    <path d="M-30 990 L79 892 L43 1058 L92 1124 L-30 1282Z" fill="#FD4DB3" />
    <path d="M1003 1239 L1110 1133 V1925 H794 L874 1820 L806 1732 L995 1594 L888 1500 L1055 1404Z"
      fill="#C8FF3C" stroke={INK} strokeWidth={9} />
    <path d="M861 1744 L1102 1535 V1655 L954 1783 L1104 1852 L1034 1938 L831 1814Z" fill="#2AE5EB" stroke={INK} strokeWidth={8} />
    <path d="M-20 1824 L250 1788 L433 1872 L689 1791 L876 1936 H-20Z" fill="#392066" />
    <path d="M-20 1879 L311 1835 L406 1888 L661 1830 L774 1935 H-20Z" fill="#FA46AA" />
    <path d="M0 105 L504 0 L308 227 L0 413Z M1009 602 L1100 541 V975 L994 1001Z M810 1835 L1080 1770 V1920 H810Z"
      fill={`url(#${prefix}-dots)`} />
    <g fill="none" stroke="#2AE5EB">
      <Orbit cx={312} cy={119} rx={330} ry={88} width={13} turn={-17} />
      <ellipse cx={312} cy={119} rx={301} ry={62} strokeWidth={3} transform="rotate(-17 312 119)" />
      <Orbit cx={1043} cy={758} rx={54} ry={184} width={9} turn={20} offset={0.27} />
      <path d="M37 937 L62 829 L23 853 L70 718" strokeWidth={8} />
    </g>
    <g fill="none" stroke={PAPER} strokeWidth={4}>
      <path d="M77 191 L140 159 M88 210 L151 178 M99 229 L162 197 M985 1483 L1055 1446 M998 1503 L1068 1466" />
      <circle cx={63} cy={1164} r={22} />
    </g>
    <Spark x={705} y={177} size={50} color={PAPER} turn={19} />
    <Spark x={998} y={475} size={29} color="#2AE5EB" turn={-11} />
    <Spark x={831} y={1811} size={34} color="#FD4DB3" turn={22} />
    <Spark x={196} y={1858} size={29} color="#C8FF3C" turn={-9} />
  </g>
);

const SugarVoltage = ({prefix}: {prefix: string}) => {
  const {ribbonWave: a, ribbonCounterWave: b} = useContext(Motion);
  return <g>
    <path d="M-40 -30 H604 C551 97 327 100 217 235 C111 363 88 470 -40 507Z" fill="#FFB6A9" />
    <path d="M879 -30 H1100 V741 C955 671 1014 505 906 369 C845 294 697 254 735 164 C760 109 870 89 879 -30Z" fill="#FFAACD" />
    <path d="M-35 436 C80 417 108 581 57 696 C29 760 71 805 131 829 L49 898 L-35 861Z" fill="#A8E8EE" />
    <path d="M994 913 C1053 816 1140 863 1120 1010 V1365 L999 1426 L958 1325 L1024 1210Z" fill="#FFB6A9" />
    <ellipse cx={1170} cy={1610} rx={238} ry={320} fill="#FFAACD" />
    <path d="M-40 1835 C142 1748 206 1876 388 1817 C610 1741 688 1838 824 1808 L1009 1950 H-40Z" fill="#FFB6A9" />
    <path d="M-15 99 C159 37 229 118 288 183 L213 265 C159 176 53 191 -15 209Z M1005 442 L1100 466 V739 L1019 677Z"
      fill={`url(#${prefix}-dots)`} />
    <Ribbon d={`M-90 175 C34 ${-63 + 18 * a} 459 ${1 + 26 * b} 505 ${93 + 20 * a} C564 ${207 + 18 * b} ${215 + 20 * a} ${252 + 16 * b} 216 ${149 + 12 * a} C217 ${46 + 16 * b} 700 ${112 + 22 * a} 824 -50`} color="#FA6EA7" width={44} />
    <Ribbon d={`M878 -70 C${1039 + 22 * a} 27 ${771 + 28 * b} 207 930 ${277 + 14 * a} C1025 ${319 + 18 * b} ${1040 - 18 * a} 179 981 ${165 + 12 * b} C${914 - 16 * a} 151 ${967 + 16 * b} 402 1133 464`} color="#353BDB" width={37} />
    <Ribbon d={`M1110 660 C${970 + 22 * a} 720 ${970 - 22 * a} 966 1110 1040`} color="#4DE0E8" width={23} />
    <Ribbon d={`M1098 1376 C${970 + 18 * b} 1450 ${958 - 18 * b} 1710 1098 1790`} color="#353BDB" width={26} />
    <Ribbon d={`M-55 1910 C100 ${1778 + 18 * a} 215 ${1927 + 20 * b} 413 ${1869 + 12 * a} S670 ${1795 + 16 * b} 834 1970`} color="#4DE0E8" width={24} />
    <path d="M49 1004 L83 1051 L49 1158 L11 1120Z" fill="#353BDB" />
    <path d="M965 1370 L1051 1313 L1089 1376 L1005 1432Z" fill="#353BDB" />
    <g stroke="#353BDB" fill="none" strokeWidth={4}>
      <ellipse cx={167} cy={284} rx={47} ry={104} transform="rotate(38 167 284)" />
      <path d="M62 578 L62 646 M46 594 L78 625 M960 1169 L1039 1133 M970 1191 L1049 1155" />
    </g>
    <Spark x={628} y={172} size={35} color="#353BDB" turn={15} />
    <Spark x={998} y={540} size={37} color={PAPER} turn={-8} />
    <Spark x={998} y={1600} size={21} color={PAPER} turn={12} />
    <circle cx={60} cy={1229} r={12} fill="#FA6EA7" stroke="#353BDB" strokeWidth={4} />
  </g>;
};

export const PrismaticPopFrame = ({props, frame, durationInFrames}: {props: PrismaticPopProps; frame: number; durationInFrames: number}) => {
  const motion = getPrismaticPopMotion(frame, durationInFrames, props.seed);
  const palette = palettes[props.look];
  const prefix = `prismatic-${props.look}`;
  const scene = getLiveFrameScene(liveFrameLoopSchema.parse({layout: props.layout, chatMode: props.chatMode}), frame, durationInFrames);
  // The whole lower background settles into a readable palette tone, without a separate chat panel.
  const art = props.look === 'electric-candy' ? <ElectricCandy prefix={prefix} />
    : props.look === 'night-signal' ? <NightSignal prefix={prefix} /> : <SugarVoltage prefix={prefix} />;
  return (
    <OverlayCanvas key={frame} props={props} width={1080} height={1920} idPrefix={prefix}>
        <defs>
          <linearGradient id={`${prefix}-ground`} x1={0} y1={1060} x2={0} y2={1360} gradientUnits="userSpaceOnUse">
            <stop offset={0} stopColor={palette.ground} />
            <stop offset={1} stopColor={palette.chat} />
          </linearGradient>
          <pattern id={`${prefix}-dots`} width={15} height={15} patternUnits="userSpaceOnUse" patternTransform={`rotate(16) translate(${motion.dots} 0)`}>
            <circle cx={4} cy={4} r={3.1} fill={props.look === 'night-signal' ? '#8E59BD' : INK} />
          </pattern>
        </defs>
        <Cutouts holes={scene.holes} prefix={`${prefix}-windows`}>
          <rect width={1080} height={1920} fill={`url(#${prefix}-ground)`} />
          {props.ornaments ? <Motion.Provider value={motion}>{art}</Motion.Provider> : null}
          <g data-layer="window-rings">
            {scene.windows.map((window) => (
              <g key={window.id}>
                <path d={bandPath(window, 0, PRISMATIC_RING_EXTENT)} fill={INK} fillRule="evenodd" />
                <path d={bandPath(window, 3, 13)} fill={palette.edge} fillRule="evenodd" />
                <path d={bandPath(window, 0, 3)} fill={palette.line} fillRule="evenodd" />
                <path d={cornerRectPath(window)} fill="none" stroke={palette.line} strokeWidth={1} />
              </g>
            ))}
          </g>
        </Cutouts>
    </OverlayCanvas>
  );
};

export const PrismaticPopLoop = (props: PrismaticPopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return <PrismaticPopFrame props={props} frame={frame} durationInFrames={durationInFrames} />;
};

export const prismaticPopCatalogEntry = {
  id: 'PrismaticPopLoop', kind: 'vertical', component: PrismaticPopLoop,
  schema: prismaticPopSchema, defaultProps: prismaticPopSchema.parse({}),
} as const;
