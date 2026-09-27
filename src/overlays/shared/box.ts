import {z} from 'zod';
import {evenPx} from '../../settings';

/** The biggest file any overlay may produce: 4K UHD in area, 3840 px on either side. */
export const MAX_CANVAS = {width: 3840, height: 2160} as const;
export const MAX_SIDE = 3840;
export const MIN_BOX_SIDE = 16;
export const MAX_BLEED = 256;

export type Rect = {x: number; y: number; width: number; height: number};

/** The pure layout every overlay reports: canvas, box, text area, guaranteed-empty hole, drawn outset. */
export type AssetLayout = {
  canvas: {width: number; height: number};
  box: Rect;
  content: Rect;
  hole?: Rect;
  /** A second text area some kinds have (the chat's title band); null or absent otherwise. */
  header?: Rect | null;
  /** How far anything is drawn outside the box; never more than bleed. */
  outset: number;
};

export type BoxDefaults = {width: number; height: number; bleed: number};

/** Width/height/bleed fields shared by every sized kind; defaults come from the kind's default size. */
export const overlayBoxFields = (defaults: BoxDefaults) => ({
  width: evenPx('width', {min: MIN_BOX_SIDE, max: MAX_SIDE}).default(defaults.width)
    .describe('Largura da caixa, em px (par)'),
  height: evenPx('height', {min: MIN_BOX_SIDE, max: MAX_SIDE}).default(defaults.height)
    .describe('Altura da caixa, em px (par)'),
  bleed: evenPx('bleed', {min: 0, max: MAX_BLEED}).default(defaults.bleed)
    .describe('Margem transparente em volta da caixa para brilho, em px (par)'),
});

type BoxProps = {width: number; height: number; bleed: number};

/** The file is the box centred inside the bleed on every side. */
export const getBoxCanvas = ({width, height, bleed}: BoxProps) => ({
  canvas: {width: width + 2 * bleed, height: height + 2 * bleed},
  box: {x: bleed, y: bleed, width, height},
});

/** Refuses files beyond 4K instead of silently shrinking them (use with superRefine). */
export const refineCanvas = (props: BoxProps, context: z.RefinementCtx) => {
  const {canvas} = getBoxCanvas(props);
  if (canvas.width > MAX_SIDE || canvas.height > MAX_SIDE || canvas.width * canvas.height > MAX_CANVAS.width * MAX_CANVAS.height) {
    context.addIssue({
      code: 'custom',
      path: ['width'],
      message: `O arquivo final teria ${canvas.width}×${canvas.height} px (caixa + 2·bleed), acima do limite de ${MAX_CANVAS.width}×${MAX_CANVAS.height}: diminua width, height ou bleed.`,
    });
  }
};

/** Minimal schema for the shared box fields; the kinds extend it with their own visual props. */
export const overlayBoxSchema = (defaults: BoxDefaults) => z.object(overlayBoxFields(defaults)).superRefine(refineCanvas);
