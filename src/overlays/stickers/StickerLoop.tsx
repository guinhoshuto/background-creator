// One loose Sticker Pop sticker per file, as the approved mock showed them «as they would ship in
// the pack»: a star, a sparkle or a bolt alone, centred on the kind's 304×304 transparent square.
// The drawing is the ornament set's StickerGlyph and the motion its step table (stickerPoseAt, eight
// poses a second, frame N draws frame 0), read from step 0 without a mirror: frame 0 and the PNG are
// the rest pose, and nothing is drawn at random, so the schema has no seed. The line is the mock's
// 6 px at 256 px (stickerLine), not the kit's lineOf; the rim and the line keep their px while the
// pose scales the shape. The square holds the largest pose at any turn with 1.9 px to spare (the
// bolt's corner, rim 0) and 2.6 px at the pack's rim 4.
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {svgNumber} from '../shared/geometry';
import {StickerGlyph} from '../shared/ornaments/sets/sticker';
import {MOTIF_TILT, stickerLine} from '../shared/ornaments/sets/sticker-motifs';
import {stickerPoseAt} from '../shared/ornaments/sets/sticker-steps';
import {OverlayCanvas} from '../shared/render';
import {stickerLoopSchema, type StickerLoopProps} from './schema';

/** The kind's canvas, fixed (src/kinds.ts). */
export const STICKER_CANVAS = {width: 304, height: 304} as const;
/** The sticker's whole height at rest, line and rim included. */
export const STICKER_SIZE = 256;

/** What one frame draws: the glyph's centre, size, line, angle and scale; pure, so tests read it without rendering. */
export const getStickerScene = (props: StickerLoopProps, frame: number, durationInFrames: number) => {
  const pose = stickerPoseAt(props.motif, frame, durationInFrames, props.durationSeconds, 0, false);
  return {
    x: STICKER_CANVAS.width / 2, y: STICKER_CANVAS.height / 2, size: STICKER_SIZE, line: stickerLine(STICKER_SIZE),
    angle: MOTIF_TILT[props.motif] + pose.turn, scale: pose.scale,
  };
};

/** One frame of the sticker, pure, so the tests can render it to markup. */
export const StickerFrame = ({props, frame, durationInFrames}: {props: StickerLoopProps; frame: number; durationInFrames: number}) => {
  const scene = getStickerScene(props, frame, durationInFrames);
  return (
    <OverlayCanvas props={props} width={STICKER_CANVAS.width} height={STICKER_CANVAS.height} idPrefix="sticker">
      <g data-layer="sticker" data-scale={svgNumber(scene.scale)}>
        <StickerGlyph
          motif={props.motif} size={scene.size} line={scene.line} rim={props.rim} angle={scene.angle} scale={scene.scale}
          fill={props.fill} ink={props.ink} rimColor={props.rimColor} x={scene.x} y={scene.y}
        />
      </g>
    </OverlayCanvas>
  );
};

export const StickerLoop = (props: StickerLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return <StickerFrame props={props} frame={frame} durationInFrames={durationInFrames} />;
};

/** The catalog entry: the kind's canvas is fixed, so it has no getLayout. */
export const stickerCatalogEntry = {
  id: 'StickerLoop',
  kind: 'sticker',
  component: StickerLoop,
  schema: stickerLoopSchema,
  defaultProps: stickerLoopSchema.parse({}),
} as const;
