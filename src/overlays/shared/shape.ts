import {z} from 'zod';

/**
 * The outline of a box: a rounded rectangle (the `radius` prop) or a circle. A circle is a square
 * box whose radius is half its side, whatever `radius` asks, so every piece of the engine that
 * reads a RoundRect (clips, tracks, halo, perimeter, glow) follows it with no special case; the
 * kinds only add what a circle changes (the text area, the accent, the rim light).
 */
export const PANEL_SHAPES = ['retangulo', 'circulo'] as const;
export type PanelShape = (typeof PANEL_SHAPES)[number];

export const shapeField = (describe: string) => z.enum(PANEL_SHAPES).describe(describe).default('retangulo');

type ShapeProps = {shape: PanelShape; radius: number; width: number; height: number};

/** The radius the layout uses: the requested one, or half the side for a circle. */
export const shapeRadius = ({shape, radius, width, height}: ShapeProps) =>
  (shape === 'circulo' ? Math.min(width, height) / 2 : radius);

/**
 * A circle needs a square box: a 400×300 "circle" would be a pill, a different product. Refused
 * with the way out, naming the kind's round sizes (`sizes`, e.g. "circulo-p, circulo or
 * circulo-g"). Returns whether the shape is valid, so the kind can stop before laying it out.
 */
export const refineShape = (props: ShapeProps, sizes: string, context: z.RefinementCtx) => {
  if (props.shape !== 'circulo' || props.width === props.height) return true;
  context.addIssue({
    code: 'custom',
    path: ['shape'],
    message: `A circle needs equal width and height (the box is ${props.width}×${props.height}): use --size ${sizes}, make width and height equal or use shape retangulo.`,
  });
  return false;
};
