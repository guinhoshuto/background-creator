import {svgNumber} from '../../geometry';
import {maxPoseScale, type StickerMotif} from './sticker-steps';

/**
 * The three sticker motifs (Sticker Pop, D-03): a ten-point star, a four-point sparkle with curved
 * sides and a seven-point lightning bolt, each a flat fill inside one ink line with round joins,
 * tilted by its own angle. Measures from the approved mock (our own code); the illustration it
 * answers to has no licence and gave only technique and measures.
 *
 * A motif's `size` is its whole height at rest, the line (and the rim, when there is one) included,
 * so the room check reads one number. The line is 2 px below 24 px and 3 px from 24 px up (a 3 px
 * line left a 20 px star with almost no fill). The pose scales the shape only: the line and the
 * rim keep their px.
 *
 * The extent is the radius of the circle round the motif's centre that holds every pose at any
 * turn: the farthest vertex of the unit shape (SPAN) times the table's largest scale times the
 * shape's height, plus half the line and the rim. Star 0.5 (scale 1), sparkle 0.5 (its 1.1 blink),
 * bolt 0.588 (its corner, scale 1).
 */

/** The tilt each motif is drawn at, in degrees (the pose turns on top of it). */
export const MOTIF_TILT: Record<StickerMotif, number> = {sparkle: 12, star: -14, bolt: 18};
/** The bolt's outline on its 0.62 × 1 box, top left to bottom. */
export const BOLT_POINTS: readonly (readonly [number, number])[] = [
  [0.48, 0], [1, 0], [0.66, 0.4], [0.96, 0.4], [0.2, 1], [0.4, 0.54], [0.04, 0.54],
];
/** The bolt's box: 0.62 of its height wide. */
const BOLT_WIDTH = 0.62;
/** The star's inner vertices, at 0.52 of the outer radius. */
const STAR_INNER = 0.52;
/** The sparkle's side tips, at 0.74 of the vertical radius. */
const SPARKLE_SIDE = 0.74;
/** How far a sparkle's side curve is pulled towards the centre: its control point, at 0.15 of the radius. */
const SPARKLE_PULL = 0.15;
/** Below this size the line is 2 px; from it up, 3 px. */
export const LINE_STEP = 24;
export const LINE_THIN = 2;
export const LINE_THICK = 3;

/** The line of a motif of `size` px. */
export const lineOf = (size: number) => (size < LINE_STEP ? LINE_THIN : LINE_THICK);

/** The shape's vertices round its centre before the tilt; `h` is the height of the line's path. */
export const motifPoints = (motif: StickerMotif, h: number): [number, number][] => {
  const r = h / 2;
  if (motif === 'sparkle') return [[0, -r], [SPARKLE_SIDE * r, 0], [0, r], [-SPARKLE_SIDE * r, 0]];
  if (motif === 'star') {
    return Array.from({length: 10}, (_, index) => {
      const angle = ((-90 + 36 * index) * Math.PI) / 180;
      const radius = index % 2 === 0 ? r : STAR_INNER * r;
      return [radius * Math.cos(angle), radius * Math.sin(angle)];
    });
  }
  return BOLT_POINTS.map(([fx, fy]) => [(fx - 0.5) * BOLT_WIDTH * h, (fy - 0.5) * h]);
};

/** The farthest vertex of the shape of height 1 from its centre (the sparkle's control points lie inside its tips). */
export const SPAN: Record<StickerMotif, number> = {
  star: Math.max(...motifPoints('star', 1).map(([x, y]) => Math.hypot(x, y))),
  sparkle: Math.max(...motifPoints('sparkle', 1).map(([x, y]) => Math.hypot(x, y))),
  bolt: Math.max(...motifPoints('bolt', 1).map(([x, y]) => Math.hypot(x, y))),
};

/** The height of the line's path of a motif of `size` px at rest. */
export const shapeHeight = (size: number, rim: number) => size - lineOf(size) - 2 * rim;

/** How far a motif of `size` reaches from its centre at a pose `scale` (any turn). */
export const reachOf = (motif: StickerMotif, size: number, rim: number, scale: number) =>
  SPAN[motif] * scale * shapeHeight(size, rim) + lineOf(size) / 2 + rim;

/** The extent of a motif of `size`: its reach at the table's largest scale. */
export const extentOf = (motif: StickerMotif, size: number, rim: number) => reachOf(motif, size, rim, maxPoseScale(motif));

/**
 * The largest size whose extent is at most `extent` (the inverse of extentOf, with the line's step:
 * the 3 px line where that size is 24 px or more, else the 2 px one).
 */
export const sizeOf = (motif: StickerMotif, extent: number, rim: number) => {
  const span = SPAN[motif] * maxPoseScale(motif);
  const withLine = (line: number) => (extent - line / 2 - rim) / span + line + 2 * rim;
  const thick = withLine(LINE_THICK);
  return thick >= LINE_STEP ? thick : withLine(LINE_THIN);
};

const point = ([x, y]: readonly [number, number]) => `${svgNumber(x)} ${svgNumber(y)}`;

/** The motif's path round (0, 0), before the tilt, for a shape of height `h`. */
export const motifPath = (motif: StickerMotif, h: number) => {
  const points = motifPoints(motif, h);
  if (motif !== 'sparkle') return `M${points.map(point).join('L')}Z`;
  // Between two neighbouring tips, a quadratic curve pulled towards the centre of their quadrant.
  const pull = SPARKLE_PULL * (h / 2);
  return `M${point(points[0]!)}${points.map((tip, index) => {
    const next = points[(index + 1) % points.length]!;
    return `Q${point([Math.sign(tip[0] + next[0]) * pull, Math.sign(tip[1] + next[1]) * pull])} ${point(next)}`;
  }).join('')}Z`;
};
