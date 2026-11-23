// The Sticker Pop stage: the flat stickers of the approved mock (a 4 px cream rim, a 3/4/6 px ink
// line, a flat fill, no facet) over the pink stage gradient, or over the kit's paper sunburst with
// `backdrop: paper`. An original study of ours drawn in code: the layout (SCATTER) is ported from
// the mock draft (our own code); the illustration the kit answers to has no licence and gave only
// technique and measures.
//
// The gradient is still; the stickers move in steps, eight poses a second (sticker-steps.ts), from
// the frame and the seed only. 96 steps in 12 s turn every pose table whole times, so frame N draws
// frame 0. The line and the rim keep their px; the pose scales the shape only. Every sticker is the
// set's StickerGlyph, with the stage's own line (stageLine), not the kit's lineOf.
import {zColor} from '@remotion/zod-types';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom} from '../loop';
import {svgNumber} from '../overlays/shared/geometry';
import {STICKER_CREAM, StickerGlyph} from '../overlays/shared/ornaments/sets/sticker';
import {MOTIF_TILT, stickerLine} from '../overlays/shared/ornaments/sets/sticker-motifs';
import {STICKER_POSES, stickerPoseAt, type StickerMotif} from '../overlays/shared/ornaments/sets/sticker-steps';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';
import {SunburstLoop, sunburstLoopSchema, type SunburstLoopProps} from './SunburstLoop';

export const STICKER_STAGE_BACKDROPS = ['stage', 'paper'] as const;

export const stickerStageLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(12),
  seed: baseBackgroundSchema.shape.seed.default(23),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#F5A09E'),
  colors: z.array(zColor()).length(3)
    .describe('Stage gradient, top to bottom: the top stop, the middle stop (at stageMid) and the bottom stop')
    .default(['#F74CA9', '#EF6AA0', '#F5A09E']),
  stageMid: z.number().finite().min(0.2).max(0.8)
    .describe('Position of the gradient\'s middle stop, from the top (0) to the bottom (1)')
    .default(0.45),
  stickerColors: z.array(zColor()).length(5)
    .describe('Sticker fills: the layout gives every sticker one of these five, by index')
    .default(['#F4A66C', '#F6E2E4', '#E9BA67', '#9AC7F2', '#EE9DE6']),
  accent: z.boolean()
    .describe('Paints the three accent stickers of the layout in accentColor instead of their stickerColors fill')
    .default(false),
  accentColor: zColor().default('#F74CA9'),
  ink: zColor().default('#4A3A69'),
  rim: z.number().int().min(0).max(8)
    .describe('Cream rim round each sticker, in px, inside its height; 0 draws none')
    .default(4),
  backdrop: z.enum(STICKER_STAGE_BACKDROPS)
    .describe('What lies under the stickers: stage (the pink gradient of colors) or paper (the Sticker Pop paper sunburst)')
    .default('stage'),
});

export type StickerStageLoopProps = z.infer<typeof stickerStageLoopSchema>;

/**
 * One sticker of the layout: motif, whole height at rest (line and rim included), centre, index in
 * stickerColors, and `'accent'` on the stickers that take accentColor when `accent` is on.
 */
export type StickerStageEntry = readonly [StickerMotif, number, number, number, number, 'accent'?];

/**
 * The stage's stickers, largest first, the centre left free (the approved mock's scene). The three
 * accent stickers are hot pink in the mock; on the pink stage that pink would vanish, so they keep a
 * stickerColors fill there, and only the paper preset turns `accent` on.
 */
export const SCATTER: readonly StickerStageEntry[] = [
  ['star', 200, 250, 230, 0], ['bolt', 180, 1690, 250, 2], ['sparkle', 190, 1640, 850, 1],
  ['star', 150, 330, 860, 4], ['sparkle', 120, 620, 130, 4, 'accent'], ['bolt', 110, 120, 560, 3],
  ['star', 100, 1330, 130, 3], ['sparkle', 96, 1830, 560, 0], ['bolt', 120, 1010, 960, 2],
  ['star', 90, 1330, 940, 0], ['sparkle', 80, 660, 960, 1], ['star', 56, 960, 90, 2],
  ['sparkle', 48, 480, 400, 3], ['bolt', 60, 1440, 480, 4], ['sparkle', 44, 1100, 250, 1],
  ['star', 44, 560, 640, 3, 'accent'], ['sparkle', 40, 1480, 700, 3, 'accent'], ['star', 48, 1860, 80, 4],
  ['bolt', 52, 60, 1000, 2], ['sparkle', 56, 90, 80, 3],
];

/** The mock's line: 3 px below 64 px, 4 below 120, 6 from there (stickerLine, shared with the sticker kind; not the kit's lineOf). */
export const stageLine = stickerLine;

/** The Sticker Pop paper sunburst (presets/sticker-pop.json, the kit's background), under the stickers with backdrop paper. */
export const PAPER_BURST = {
  seed: 23, backgroundColor: '#F5DCD1', colors: ['#F6E2E4', '#F5DCD1'], rayCount: 16, rayWidth: 0.5,
  swirl: 0, spin: 2, coreFade: 0, coreShade: 0,
};

/** The paper sunburst's props for a loop of `durationSeconds`, opaque. */
export const paperBurstProps = (durationSeconds: number) =>
  sunburstLoopSchema.parse({...PAPER_BURST, durationSeconds, transparent: false});

/** The sunburst drawn under the stickers: the paper's, for the props' loop, with backdrop paper and opaque only. */
export const paperBackdrop = (props: StickerStageLoopProps): SunburstLoopProps | null =>
  (props.backdrop === 'paper' && !hasTransparentBackground(props) ? paperBurstProps(props.durationSeconds) : null);

export type StickerStageGradient = {kind: 'stage'; top: string; mid: string; bottom: string; stop: number; opacity: number};
export type StickerStageSticker = {
  kind: 'sticker'; motif: StickerMotif; size: number; x: number; y: number; fill: string;
  line: number; rim: number; angle: number; scale: number;
  /** The drawn offset into the pose table, and 1 when a star leans the other way. */
  phase: number; mirror: number; opacity: number;
};
export type StickerStageElement = StickerStageGradient | StickerStageSticker;

/**
 * The scene at a frame: the still gradient (only on the opaque stage) and the stickers. The layout
 * is fixed (the approved scene); the seed draws, for every sticker, the phase of its pose table and
 * whether a star leans the other way, always two draws per sticker, so one sticker never shifts
 * another. `layout` is for tests; the background always draws SCATTER.
 */
export const getStickerStageScene = (
  props: StickerStageLoopProps, frame: number, durationInFrames: number, layout: readonly StickerStageEntry[] = SCATTER,
): StickerStageElement[] => {
  const random = createSeededRandom(props.seed);
  const [top, mid, bottom] = props.colors;
  const stage: StickerStageElement[] = props.backdrop === 'stage' && !hasTransparentBackground(props)
    ? [{kind: 'stage', top: top!, mid: mid!, bottom: bottom!, stop: props.stageMid, opacity: 1}]
    : [];
  return [...stage, ...layout.map(([motif, size, x, y, colorIndex, accent]): StickerStageSticker => {
    const offsetDraw = random();
    const mirrorDraw = random();
    const phase = Math.floor(offsetDraw * STICKER_POSES[motif].length);
    const mirror = motif === 'star' && mirrorDraw < 0.5;
    const pose = stickerPoseAt(motif, frame, durationInFrames, props.durationSeconds, phase, mirror);
    return {
      kind: 'sticker', motif, size, x, y, fill: props.accent && accent === 'accent' ? props.accentColor : props.stickerColors[colorIndex]!, line: stageLine(size), rim: props.rim,
      angle: MOTIF_TILT[motif] + pose.turn, scale: pose.scale, phase, mirror: mirror ? 1 : 0, opacity: 1,
    };
  })];
};

const n = svgNumber;

/** The scene as one 1920×1080 SVG: the gradient, then every sticker, in order. No blend, filter or shadow. */
export const StickerStageSvg = ({scene, ink}: {scene: readonly StickerStageElement[]; ink: string}) => (
  <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
    {scene.map((element, index) => (element.kind === 'stage'
      ? (
        <g key={index}>
          <linearGradient id="sticker-stage-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={element.top} /><stop offset={n(element.stop)} stopColor={element.mid} />
            <stop offset="1" stopColor={element.bottom} />
          </linearGradient>
          <rect width="1920" height="1080" fill="url(#sticker-stage-gradient)" />
        </g>
      )
      : (
        <StickerGlyph
          key={index} motif={element.motif} size={element.size} line={element.line} rim={element.rim}
          angle={element.angle} scale={element.scale} fill={element.fill} ink={ink} rimColor={STICKER_CREAM}
          x={element.x} y={element.y}
        />
      )))}
  </svg>
);

export const StickerStageLoop = (props: StickerStageLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scene = getStickerStageScene(props, frame, durationInFrames);
  const backdrop = paperBackdrop(props);
  return (
    <Canvas {...props}>
      {backdrop ? <SunburstLoop {...backdrop} /> : null}
      <AbsoluteFill>
        <StickerStageSvg scene={scene} ink={props.ink} />
      </AbsoluteFill>
    </Canvas>
  );
};
