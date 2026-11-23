import {svgNumber} from '../../geometry';
import {ornamentPalette} from '../draw';
import {ornamentRandom} from '../place';
import type {OrnamentBase, OrnamentSet} from '../types';
import {lineOf, MOTIF_TILT, motifPath, reachOf} from './sticker-motifs';
import {placeSticker, STICKER_MIN_EXTENT, STICKER_RIM, type StickerPlacement} from './sticker-place';
import {STICKER_POSES, stickerPoseAt, type StickerMotif} from './sticker-steps';

/**
 * The 'sticker' ornaments (Sticker Pop, D-03): flat stickers round the paper pieces, a star (the
 * hero, everywhere), a four-point sparkle and a lightning bolt, each a flat fill inside the ink line
 * of the pieces, all in front, none to the right, below or at BR (the side depth's corner). Motifs:
 * sticker-motifs.ts; slots and sizes: sticker-place.ts (ornamentSize = the star's height); poses on
 * steps, eight a second: sticker-steps.ts.
 *
 * ornamentColors: [0] the star (orange), [1] the sparkle (cream), [2] the bolt (amber; with one or
 * two colours, the star's). The line is the pieces' ink, a constant of the set (STICKER_INK): the
 * kit never changes it, and the palette holds three colours at most.
 *
 * Crisp stickers: no soft light anywhere (light 0), with or without the kind's glow. The cream rim
 * (`rim`, px) is drawn round the line when above 0; the kit keeps it at 0 (STICKER_RIM).
 *
 * Frame 0 is the hero's rest pose (the pack's PNG): the star reads its table from step 0. Every
 * other motif starts its table at an offset the set's stream gives it, and half of the stars turn
 * the other way; every placement draws both values, used or not.
 */

/** The pieces' ink line. */
export const STICKER_INK = '#4A3A69';
/** The rim's cream (the pieces' cream). */
export const STICKER_CREAM = '#F6E2E4';

type Fields = {
  /** The motif's height at rest, line and rim included. */
  size: number;
  line: number;
  rim: number;
  /** The tilt plus the pose's turn, in degrees. */
  angle: number;
  /** The pose's scale of the shape. */
  scale: number;
  fill: string;
  ink: string;
  rimColor: string;
};
type StarElement = OrnamentBase & Fields & {type: 'sticker-star'};
type SparkleElement = OrnamentBase & Fields & {type: 'sticker-sparkle'};
type BoltElement = OrnamentBase & Fields & {type: 'sticker-bolt'};
export type StickerOrnamentElement = StarElement | SparkleElement | BoltElement;

/** What a sticker glyph needs: the motif, its whole height at rest and its line and rim in px, the pose, the colours and its centre. */
export type StickerGlyphProps = {
  motif: StickerMotif;
  /** The whole height at rest, line and rim included. */
  size: number;
  line: number;
  rim: number;
  /** The tilt plus the pose's turn, in degrees. */
  angle: number;
  /** The pose's scale of the shape (the line and the rim keep their px). */
  scale: number;
  fill: string;
  ink: string;
  rimColor: string;
  x: number;
  y: number;
};

/** The height of the line's path of a glyph at rest: its whole height less the line and the rim on both sides. */
export const glyphHeight = (size: number, line: number, rim: number) => size - line - 2 * rim;

/**
 * One sticker: the cream rim under the line (a stroke of line + 2·rim round the shape, only when
 * the rim is above 0), then the fill inside the ink line with round joins. The set's render and
 * the StickerStageLoop background both draw it; the line is a parameter (the kit's lineOf, the
 * stage's own steps).
 */
export const StickerGlyph = ({motif, size, line, rim, angle, scale, fill, ink, rimColor, x, y}: StickerGlyphProps) => {
  const d = motifPath(motif, glyphHeight(size, line, rim) * scale);
  const n = svgNumber;
  return (
    <g transform={`translate(${n(x)} ${n(y)}) rotate(${n(angle)})`}>
      {rim > 0 ? (
        <path d={d} fill={rimColor} stroke={rimColor} strokeWidth={n(line + 2 * rim)} strokeLinejoin="round" />
      ) : null}
      <path d={d} fill={fill} stroke={ink} strokeWidth={n(line)} strokeLinejoin="round" />
    </g>
  );
};

const MOTIF_OF: Record<StickerOrnamentElement['type'], StickerMotif> = {
  'sticker-star': 'star', 'sticker-sparkle': 'sparkle', 'sticker-bolt': 'bolt',
};

const set: OrnamentSet<StickerOrnamentElement> = {
  name: 'sticker',
  seedOffset: 100,
  minExtent: STICKER_MIN_EXTENT,
  place(frame, style) {
    return placeSticker(frame, style.ornamentSize);
  },
  build(_frame, placements, style, frameIndex, durationInFrames) {
    const random = ornamentRandom(style.seed, set);
    const {cool: star, light: sparkle, warm: bolt} = ornamentPalette(style);
    const fills: Record<StickerMotif, string> = {star, sparkle, bolt};
    return placements.map((placement, anchor): StickerOrnamentElement => {
      const motif = (placement as StickerPlacement).motif;
      // Both drawn for every placement, used or not, so one motif never shifts another's.
      const offsetDraw = random();
      const mirrorDraw = random();
      const offset = anchor === 0 ? 0 : Math.floor(offsetDraw * STICKER_POSES[motif].length);
      const mirror = motif === 'star' && mirrorDraw < 0.5;
      const pose = stickerPoseAt(motif, frameIndex, durationInFrames, style.durationSeconds, offset, mirror);
      const {size} = placement;
      const rim = STICKER_RIM;
      return {
        type: `sticker-${motif}`, layer: 'front', anchor, x: placement.x, y: placement.y,
        reach: reachOf(motif, size, rim, pose.scale), light: 0, lightOpacity: 0, opacity: 1,
        size, line: lineOf(size), rim, angle: MOTIF_TILT[motif] + pose.turn, scale: pose.scale,
        fill: fills[motif], ink: STICKER_INK, rimColor: STICKER_CREAM,
      };
    });
  },
  render(element, key) {
    return (
      <StickerGlyph
        key={key} motif={MOTIF_OF[element.type]} size={element.size} line={element.line} rim={element.rim}
        angle={element.angle} scale={element.scale} fill={element.fill} ink={element.ink} rimColor={element.rimColor}
        x={element.x} y={element.y}
      />
    );
  },
};

export const stickerSet = set;
