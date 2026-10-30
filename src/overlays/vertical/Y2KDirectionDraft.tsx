import type {ReactNode} from 'react';
import {Img, staticFile} from 'remotion';
import {z} from 'zod';
import {OverlayCanvas} from '../shared/render';
import {bandPath, getLiveFrameScene, LiveFrameFrame} from './LiveFrameLoop';
import {liveFrameLoopSchema, verticalBaseFields} from './schema';

/**
 * Static art-direction board only. The owner chooses a direction before a product theme exists.
 * Sprites are local, ignored Blender renders made from our own code, never external/AI images.
 * Their manifests are incomplete: use only 0000.webp, not a purported animated sprite sequence.
 * Source record: .cache/y2k-vertical/brief.md; motifs selected from the owner's Y2K brief.
 */
export const y2kDirectionDraftSchema = z.object({
  ...verticalBaseFields(),
  direction: z.enum(['candy-charms', 'blue-bubble', 'digital-diary'])
    .describe('Static direction to compare before building the final vertical theme')
    .default('candy-charms'),
});
type DraftProps = z.infer<typeof y2kDirectionDraftSchema>;
type Direction = DraftProps['direction'];

const PALETTES = {
  'candy-charms': {top: '#FFE3F2', middle: '#E5C8FA', bottom: '#D6C7E0', ink: '#9B5489', edge: '#EB9BCB', pearl: '#FFF5FF', shade: '#B995DA'},
  'blue-bubble': {top: '#C8E7FF', middle: '#DDEAFB', bottom: '#C3D5E6', ink: '#628BAA', edge: '#A8CBEB', pearl: '#F7FDFF', shade: '#9DB7D8'},
  'digital-diary': {top: '#CCC4F6', middle: '#E9D4ED', bottom: '#D1C6DF', ink: '#7B65AC', edge: '#B9A8E6', pearl: '#FFF1FF', shade: '#9684BE'},
} as const;

const Sprite = ({name, x, y, size, angle = 0}: {
  name: 'phone' | 'bow' | 'cassette' | 'cursor' | 'soap'; x: number; y: number; size: number; angle?: number;
}) => (
  <foreignObject x={x} y={y} width={size} height={size} transform={`rotate(${angle} ${x + size / 2} ${y + size / 2})`}>
    <Img src={staticFile(`sprites/y2k/${name}/0000.webp`)} style={{width: size, height: size, display: 'block'}} />
  </foreignObject>
);

/** Use the engine's individual holes as nested clips, including every decoration and sprite. */
const OutsideWindows = ({holes, prefix, children}: {holes: string[]; prefix: string; children: ReactNode}) =>
  holes.reduceRight<ReactNode>((content, hole, index) => (
    <g>
      <defs><clipPath id={`${prefix}-hole-${index}`}><path d={hole} clipRule="evenodd" /></clipPath></defs>
      <g clipPath={`url(#${prefix}-hole-${index})`}>{content}</g>
    </g>
  ), children);

const Pearl = ({x, y, r, paint, outline = '#FFFFFF'}: {x: number; y: number; r: number; paint: string; outline?: string}) => (
  <g>
    <circle cx={x + 1} cy={y + 3} r={r} fill="#A087B0" opacity={0.14} />
    <circle cx={x} cy={y} r={r} fill={paint} stroke={outline} strokeWidth={1.5} />
    <ellipse cx={x - r * 0.25} cy={y - r * 0.33} rx={r * 0.33} ry={r * 0.18} fill="#FFFFFF" opacity={0.82} transform={`rotate(-30 ${x} ${y})`} />
  </g>
);

const CandyCharms = ({prefix}: {prefix: string}) => (
  <g>
    {/* A beaded wrist strap, attached at both ends to the side of the frame. */}
    <path d="M132 287 C23 276 25 365 46 440 C83 554 22 650 53 718 C70 751 98 746 110 722" fill="none" stroke="#C38EB9" strokeWidth={3} />
    {[
      [105, 285], [81, 286], [59, 297], [44, 315], [37, 337], [36, 360], [38, 384],
      [44, 408], [51, 432], [57, 456], [62, 480], [64, 505], [64, 530], [61, 555],
      [56, 579], [50, 603], [46, 627], [43, 651], [43, 675], [49, 698], [61, 719], [81, 734],
    ].map(([x, y], index) => <Pearl key={index} x={x!} y={y!} r={index % 5 === 0 ? 11 : 8} paint={`url(#${prefix}-${index % 3 === 0 ? 'bead-pink' : 'pearl'})`} />)}
    <Sprite name="phone" x={850} y={345} size={330} angle={-4} />
    <ellipse cx={1004} cy={336} rx={19} ry={26} fill="none" stroke="#E4B0D7" strokeWidth={7} />
    <ellipse cx={1002} cy={333} rx={18} ry={25} fill="none" stroke="#FFF7FF" strokeWidth={3} />
    <path d="M998 356 Q993 376 1007 395" fill="none" stroke="#C59ACD" strokeWidth={3} />
    <g transform="rotate(11 937 243)">
      <rect x={885} y={211} width={104} height={66} rx={30} fill={`url(#${prefix}-bead-pink)`} stroke="#FFF5FD" strokeWidth={3} />
      <ellipse cx={917} cy={224} rx={18} ry={5} fill="#FFFFFF" opacity={0.9} />
      <text x={937} y={254} textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight={700} fontSize={24} fill="#A6669F">hi!</text>
    </g>
    <Pearl x={44} y={1002} r={16} paint={`url(#${prefix}-bead-pink)`} />
    <Pearl x={66} y={1040} r={10} paint={`url(#${prefix}-pearl)`} />
    <Pearl x={1008} y={1063} r={12} paint={`url(#${prefix}-pearl)`} />
  </g>
);

const BlueBubble = ({prefix}: {prefix: string}) => (
  <g>
    {/* Broad, low-contrast curves feel molded into the plastic, not like a UI grid. */}
    <path d="M-160 280 C155 60 340 80 514 214 S958 382 1200 120" fill="none" stroke="#F8FCFF" strokeWidth={35} opacity={0.38} />
    <path d="M-160 324 C155 104 340 124 514 258 S958 426 1200 164" fill="none" stroke="#A9CFEA" strokeWidth={8} opacity={0.28} />
    <Sprite name="bow" x={883} y={192} size={216} angle={14} />
    <Sprite name="soap" x={-26} y={348} size={164} />
    <Sprite name="soap" x={913} y={584} size={184} />
    <Sprite name="soap" x={-22} y={930} size={156} />
    <Pearl x={76} y={317} r={16} paint={`url(#${prefix}-pearl)`} />
    <Pearl x={35} y={521} r={11} paint={`url(#${prefix}-pearl)`} />
    <Pearl x={1010} y={531} r={17} paint={`url(#${prefix}-pearl)`} />
    <Pearl x={1001} y={1152} r={26} paint={`url(#${prefix}-pearl)`} />
    <Pearl x={1033} y={1204} r={9} paint={`url(#${prefix}-pearl)`} />
    <path d="M22 787 C42 769 71 769 90 785 M990 921 C1007 902 1030 899 1049 910" fill="none" stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" opacity={0.7} />
  </g>
);

const DigitalDiary = ({prefix}: {prefix: string}) => (
  <g>
    {/* The little tabs and stationery cues belong to a personal diary, not a dashboard. */}
    <Sprite name="cassette" x={416} y={61} size={258} angle={-8} />
    <Sprite name="cursor" x={880} y={596} size={210} angle={9} />
    <g transform="rotate(-11 59 343)">
      <rect x={20} y={280} width={78} height={138} rx={25} fill={`url(#${prefix}-plastic)`} stroke="#FCEEFF" strokeWidth={3} />
      <rect x={33} y={294} width={52} height={17} rx={8} fill="#F2D5ED" />
      {[0, 1, 2].map((row) => <rect key={row} x={36} y={326 + row * 23} width={46 - row * 8} height={7} rx={3} fill="#9F8CC4" opacity={0.5} />)}
    </g>
    <g transform="rotate(8 972 237)">
      <rect x={902} y={214} width={128} height={45} rx={22} fill="#F2CCE6" stroke="#FFF4FD" strokeWidth={3} />
      <text x={966} y={244} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize={20} fontWeight={700} fill="#9670AE">play / pause</text>
    </g>
    {[0, 1, 2, 3, 4].map((index) => (
      <g key={index}>
        <rect x={32} y={862 + index * 42} width={54} height={25} rx={12} fill="#AF9DD8" />
        <rect x={30} y={858 + index * 42} width={54} height={25} rx={12} fill={`url(#${prefix}-plastic)`} stroke="#F9EAFC" strokeWidth={2} />
      </g>
    ))}
    <g fill="#FFF2FC" opacity={0.8}>
      <rect x={1001} y={970} width={8} height={8} /><rect x={1017} y={970} width={8} height={8} />
      <rect x={1001} y={986} width={8} height={8} /><rect x={1017} y={986} width={8} height={8} />
    </g>
    <path d="M39 1130 H80 M39 1141 H70" stroke="#A38BC0" strokeWidth={4} opacity={0.38} strokeLinecap="round" />
  </g>
);

const MOTIFS: Record<Direction, typeof CandyCharms> = {
  'candy-charms': CandyCharms,
  'blue-bubble': BlueBubble,
  'digital-diary': DigitalDiary,
};

export const Y2KDirectionDraft = (props: DraftProps) => {
  const palette = PALETTES[props.direction];
  const prefix = `y2k-${props.direction}`;
  const frameProps = liveFrameLoopSchema.parse({
    ...props, layout: 'three-blocks', chatMode: 'open', fillColors: [palette.bottom],
    ringColor: palette.edge, ringLineColor: palette.pearl,
  });
  const scene = getLiveFrameScene(frameProps, 0, 480);
  const Motifs = MOTIFS[props.direction];
  const url = (name: string) => `url(#${prefix}-${name})`;
  return (
    <>
      <LiveFrameFrame props={frameProps} frame={0} durationInFrames={480} />
      <OverlayCanvas props={props} width={1080} height={1920} idPrefix={prefix}>
        <defs>
          <linearGradient id={`${prefix}-surface`} x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0" stopColor={palette.top} /><stop offset="0.48" stopColor={palette.middle} />
            <stop offset="0.72" stopColor={palette.bottom} /><stop offset="1" stopColor={palette.bottom} />
          </linearGradient>
          <linearGradient id={`${prefix}-plastic`} x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor={palette.pearl} /><stop offset="0.25" stopColor={palette.top} />
            <stop offset="0.55" stopColor={palette.edge} /><stop offset="0.8" stopColor={palette.pearl} />
            <stop offset="1" stopColor={palette.shade} />
          </linearGradient>
          <radialGradient id={`${prefix}-pearl`} cx="0.33" cy="0.25" r="0.75">
            <stop offset="0" stopColor="#FFFFFF" /><stop offset="0.36" stopColor="#EDF5FF" />
            <stop offset="0.72" stopColor="#C5C4EB" /><stop offset="1" stopColor="#A8CBE3" />
          </radialGradient>
          <radialGradient id={`${prefix}-bead-pink`} cx="0.3" cy="0.2" r="0.8">
            <stop offset="0" stopColor="#FFF6FF" /><stop offset="0.4" stopColor="#FFCAEA" />
            <stop offset="1" stopColor="#D790C5" />
          </radialGradient>
        </defs>
        <OutsideWindows holes={scene.holes} prefix={prefix}>
          <rect width={1080} height={1920} fill={url('surface')} />
          {/* Restrict surface decoration to the upper area; native comments get a quiet field. */}
          <path d="M-65 70 C260 -90 650 280 1130 10" fill="none" stroke="#FFFFFF" strokeWidth={110} opacity={0.19} />
          <path d="M-50 150 C300 10 560 330 1110 115" fill="none" stroke={palette.pearl} strokeWidth={18} opacity={0.34} />
          {scene.windows.map((window) => (
            <g key={window.id}>
              <path d={bandPath(window, 3, 13)} fill={url('plastic')} fillRule="evenodd" />
              <path d={bandPath(window, 12, 13)} fill={palette.pearl} fillRule="evenodd" opacity={0.83} />
              <path d={bandPath(window, 0, 3)} fill={palette.pearl} fillRule="evenodd" />
              <path d={bandPath(window, 10, 12)} fill={palette.pearl} fillRule="evenodd" opacity={0.5} />
            </g>
          ))}
          <Motifs prefix={prefix} />
          <rect x={382} y={756} width={316} height={34} rx={17} fill={url('plastic')} stroke={palette.pearl} strokeWidth={2} />
          <text x={540} y={780} textAnchor="middle" fill={palette.ink} fontFamily="Arial, Helvetica, sans-serif" fontSize={20} fontWeight={700} letterSpacing={4}>YOUR NAME</text>
        </OutsideWindows>
      </OverlayCanvas>
    </>
  );
};

export const y2kDirectionDraftCatalogEntry = {
  id: 'Y2KDirectionDraft',
  kind: 'vertical',
  component: Y2KDirectionDraft,
  schema: y2kDirectionDraftSchema,
  defaultProps: y2kDirectionDraftSchema.parse({}),
  qaOnly: true,
} as const;
