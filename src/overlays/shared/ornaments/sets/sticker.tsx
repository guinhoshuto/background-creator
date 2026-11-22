import {svgNumber} from '../../geometry';
import {ornamentPalette} from '../draw';
import {ornamentRandom} from '../place';
import type {OrnamentBase, OrnamentSet} from '../types';
import {lineOf, MOTIF_TILT, motifPath, reachOf, shapeHeight} from './sticker-motifs';
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

const MOTIF_OF: Record<StickerOrnamentElement['type'], StickerMotif> = {
  'sticker-star': 'star', 'sticker-sparkle': 'sparkle', 'sticker-bolt': 'bolt',
};

/**
 * The set, typed by hand until 'sticker' joins ORNAMENT_CHOICES (types.ts) with its kit: then it
 * is an OrnamentSet<StickerOrnamentElement> like the others.
 */
type StickerSet = Omit<OrnamentSet<StickerOrnamentElement>, 'name' | 'place'> & {
  name: 'sticker';
  place: (...args: Parameters<OrnamentSet['place']>) => StickerPlacement[];
};

const set: StickerSet = {
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
    const motif = MOTIF_OF[element.type];
    const d = motifPath(motif, shapeHeight(element.size, element.rim) * element.scale);
    const n = svgNumber;
    return (
      <g key={key} transform={`translate(${n(element.x)} ${n(element.y)}) rotate(${n(element.angle)})`}>
        {element.rim > 0 ? (
          <path d={d} fill={element.rimColor} stroke={element.rimColor} strokeWidth={n(element.line + 2 * element.rim)} strokeLinejoin="round" />
        ) : null}
        <path d={d} fill={element.fill} stroke={element.ink} strokeWidth={n(element.line)} strokeLinejoin="round" />
      </g>
    );
  },
};

export const stickerSet = set;
