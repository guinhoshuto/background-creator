import type {z} from 'zod';
import {getBoxCanvas, type AssetLayout, type Rect} from './box';
import {
  fitContent, inscribedRect, insetRect, isCircle, offsetRoundRect, rectPath, roundRect, roundRectPath, type Insets, type RoundRect,
} from './geometry';
import {shapeRadius, type PanelShape} from './shape';

/**
 * Glow and halo sizes are given as their visible reach, in px. A Gaussian blur fades to almost
 * nothing at three standard deviations, so the reach is 3σ and the filter uses σ = reach / 3.
 */
export const glowSigma = (reach: number) => reach / 3;

export type PanelLayoutInput = {
  width: number;
  height: number;
  bleed: number;
  /** Requested corner radius; clamped to half the smaller side. */
  radius: number;
  /** 'circulo' makes the radius half the side (the box must be square, see refineShape). */
  shape?: PanelShape;
  /** The stroke sits inside the box edge: its outer edge is the box edge. 0 = no stroke. */
  strokeWidth: number;
  /** Space between the inside of the stroke and the content, in px (one value or per axis). */
  padding: number | {x: number; y: number};
  /** Reach of the stroke's glow, outwards from the box edge (and inwards over the fill). */
  glow?: number;
  /** Reach of an outer halo around the whole panel. */
  halo?: number;
  /** Kind-specific space taken from the content, on top of the padding (a chat header, an accent bar). */
  insets?: Partial<Insets>;
  /** Anything else a kind draws beyond the box, in px. */
  extraOutset?: number;
};

/** The panel of a chat background or a text block: fill, stroke inside the edge, content inside that. */
export type PanelLayout = AssetLayout & {
  /** The panel itself: the box with its clamped radius. The fill is clipped to it. */
  shape: RoundRect;
  /** The stroke's centreline: perimeter effects run on it. */
  track: RoundRect;
  /** Inside the stroke: where the content and the kind's inner decorations live. */
  inner: RoundRect;
  strokeWidth: number;
  /**
   * The panel is a circle ('circulo', or a square box with a radius of half its side): the shapes
   * above are concentric circles, and a kind lays its text and decorations out around the centre.
   */
  circle: boolean;
};

/**
 * The single source of truth for a panel's geometry, in canvas pixels. The stroke is drawn inside
 * the box, so a 2 px stroke on a 640 px card leaves the card 640 px wide; its glow and the halo
 * are what reach into the bleed. The content keeps clear of the stroke, the padding, the kind's
 * insets and the round corners, and is whole pixels.
 */
export const layoutPanel = (input: PanelLayoutInput): PanelLayout => {
  const {canvas, box} = getBoxCanvas(input);
  const shape = roundRect(box, shapeRadius({shape: input.shape ?? 'retangulo', radius: input.radius, width: box.width, height: box.height}));
  const strokeWidth = Math.min(input.strokeWidth, Math.min(box.width, box.height) / 2);
  const track = offsetRoundRect(shape, -strokeWidth / 2);
  const inner = offsetRoundRect(shape, -strokeWidth);
  const padding = typeof input.padding === 'number' ? {x: input.padding, y: input.padding} : input.padding;
  const extra = input.insets ?? {};
  const content = fitContent(inner, {
    top: padding.y + (extra.top ?? 0),
    right: padding.x + (extra.right ?? 0),
    bottom: padding.y + (extra.bottom ?? 0),
    left: padding.x + (extra.left ?? 0),
  });
  return {
    canvas,
    box,
    content,
    outset: Math.max(0, input.glow ?? 0, input.halo ?? 0, input.extraOutset ?? 0),
    shape,
    track,
    inner,
    strokeWidth,
    circle: isCircle(shape),
  };
};

export const FRAME_FITS = ['janela', 'tela'] as const;
export type FrameFit = (typeof FRAME_FITS)[number];

export type FrameLayoutInput = {
  width: number;
  height: number;
  bleed: number;
  /** Corner radius of the window; clamped to half its smaller side. */
  radius: number;
  /** 'circulo' makes the window a circle, its radius half the side ('janela' only, see refineShape). */
  shape?: PanelShape;
  /** Total width of the frame band (both lines and their gap, for a double line). */
  thickness: number;
  /** Reach of the band's glow. */
  glow?: number;
  /** 'janela': the box is the window, the band goes out into the bleed. 'tela': the box is the file. */
  fit: FrameFit;
  /** Anything else a kind draws beyond the band (outer ornaments), in px; 'janela' only. */
  extraOutset?: number;
};

/** A border: a band around a transparent window. */
export type FrameLayout = AssetLayout & {
  fit: FrameFit;
  /** The rounded window the camera or game shows through. */
  window: RoundRect;
  /** The outer edge of the band. */
  outer: RoundRect;
  /** The band's centreline: perimeter effects run on it. */
  track: RoundRect;
  /** The region guaranteed to stay alpha 0: the renderer masks it out of every frame layer. */
  holeShape: RoundRect;
  /** The whole-pixel rect inside `holeShape`, reported as `hole`. */
  hole: Rect;
  thickness: number;
};

/**
 * The single source of truth for a border's geometry, in canvas pixels.
 *
 * 'janela' (window): the box is the window, with the requested radius (half the side for a
 * circle). The band of `thickness`
 * goes outwards into the bleed, and the corners of the box outside the window's arcs belong to
 * the frame too (`filletPath`) as far as the band reaches: a kind paints them opaque inside the
 * band, so a rectangular camera placed on the box shows round corners while the radius is at most
 * (1 + √2)·thickness, and the frame never pokes out of its own outline. Nothing is drawn inside
 * the window: the glow is masked out of it.
 * `content` is the box, where the camera goes; `hole` is the whole-pixel rect inside the window.
 *
 * 'tela' (screen): the box is the whole file (use bleed 0). The band is drawn inwards from the
 * box edge, the glow reaches only inwards, and the hole is the window pulled in by the glow.
 */
export const layoutFrame = (input: FrameLayoutInput): FrameLayout => {
  const {canvas, box} = getBoxCanvas(input);
  const glow = Math.max(0, input.glow ?? 0);
  const thickness = input.thickness;
  if (input.fit === 'janela') {
    const window = roundRect(box, shapeRadius({shape: input.shape ?? 'retangulo', radius: input.radius, width: box.width, height: box.height}));
    return {
      canvas,
      box,
      content: {...box},
      hole: inscribedRect(window),
      outset: Math.max(0, thickness + glow, input.extraOutset ?? 0),
      fit: 'janela',
      window,
      outer: offsetRoundRect(window, thickness),
      track: offsetRoundRect(window, thickness / 2),
      holeShape: window,
      thickness,
    };
  }
  const window = roundRect(insetRect(box, thickness), input.radius);
  const holeShape = offsetRoundRect(window, -glow);
  return {
    canvas,
    box,
    content: {x: window.x, y: window.y, width: window.width, height: window.height},
    hole: inscribedRect(holeShape),
    outset: 0,
    fit: 'tela',
    window,
    outer: offsetRoundRect(window, thickness),
    track: offsetRoundRect(window, thickness / 2),
    holeShape,
    thickness,
  };
};

/** The band itself: between its outer edge and the window (draw with `fill-rule="evenodd"`). */
export const ringPath = (layout: FrameLayout) => `${roundRectPath(layout.outer)}${roundRectPath(layout.window)}`;

/**
 * The box's corners outside the window or the band (draw with `fill-rule="evenodd"`). In 'janela',
 * the part of the box outside the window: the fillets that round a rectangular camera off, to be
 * clipped to the band (a large radius would otherwise leave square corners around the frame). In
 * 'tela', the file's square corners outside the band's rounded outer edge, so the screen's corners
 * are covered but a gap between the band and an outer line stays as empty as around a window.
 * Empty-looking when the corners are square.
 */
export const filletPath = (layout: FrameLayout) =>
  `${rectPath(layout.box)}${roundRectPath(layout.fit === 'janela' ? layout.window : layout.outer)}`;

/** The smallest even bleed that holds `outset` (bleed must be even for H.264). */
export const minBleedFor = (outset: number) => 2 * Math.ceil(outset / 2 - 1e-9);

/**
 * Refuses anything drawn beyond the box that the bleed cannot hold: the canvas edge would cut
 * it straight off. The message names the smallest even bleed that fits, which is accepted.
 */
export const refineOutset = (props: {bleed: number}, outset: number, context: z.RefinementCtx) => {
  if (outset <= props.bleed + 1e-9) return;
  context.addIssue({
    code: 'custom',
    path: ['bleed'],
    message: `The glow goes past the margin: use bleed ≥ ${minBleedFor(outset)} or reduce the glow.`,
  });
};

/** Refuses a panel whose stroke, padding and insets leave no room for the content. */
export const refineContent = (layout: AssetLayout, context: z.RefinementCtx) => {
  if (layout.content.width >= 1 && layout.content.height >= 1) return;
  context.addIssue({
    code: 'custom',
    path: ['padding'],
    message: 'The padding leaves no room for the content: reduce padding or strokeWidth, or enlarge the box.',
  });
};

/** Refuses a full-screen frame whose band and glow cover the whole screen. */
export const refineHole = (layout: FrameLayout, context: z.RefinementCtx) => {
  if (layout.holeShape.width >= 1 && layout.holeShape.height >= 1) return;
  context.addIssue({
    code: 'custom',
    path: ['strokeWidth'],
    message: 'The frame leaves no window: reduce the thickness or the glow, or enlarge the screen.',
  });
};
