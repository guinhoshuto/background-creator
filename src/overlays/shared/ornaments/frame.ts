import type {Rect} from '../box';
import {isCircle, roundRectPath, type RoundRect} from '../geometry';
import type {FrameLayout, PanelLayout} from '../layout';
import type {OrnamentFrame} from './types';

const canvasRect = (canvas: {width: number; height: number}): Rect => ({x: 0, y: 0, width: canvas.width, height: canvas.height});

/** Text areas worth keeping clear of: the null and empty ones are dropped. */
const areas = (keepOut: readonly (Rect | null | undefined)[]): Rect[] =>
  keepOut.filter((rect): rect is Rect => !!rect && rect.width > 0 && rect.height > 0).map((rect) => ({...rect}));

/** A band worth drawing on: null when missing or empty. */
const band = (rect: Rect | null | undefined): Rect | null => (rect && rect.width > 0 && rect.height > 0 ? {...rect} : null);

/**
 * The frame of a chat panel or a block: motifs hang on the panel's outline and may use the whole
 * canvas (the bleed, and on a Twitch panel with no bleed the padding pockets inside the box); the
 * panel hides the back layer. Built from the kind's layout before the ornaments fold their outset.
 */
export const panelOrnamentFrame = (input: {
  kind: 'chat' | 'block'; layout: PanelLayout; keepOut: readonly (Rect | null | undefined)[];
  accent?: 'left' | 'top' | null; glow: number; bands?: {header?: Rect | null; footer?: Rect | null};
}): OrnamentFrame => {
  const {layout} = input;
  const canvas = canvasRect(layout.canvas);
  return {
    kind: input.kind,
    fit: 'panel',
    canvas,
    box: {...layout.box},
    outline: {...layout.shape},
    track: {...layout.track},
    circle: layout.circle,
    hole: null,
    keepOut: areas(input.keepOut),
    paintLimit: canvas,
    cover: {path: roundRectPath(layout.shape), fillRule: 'nonzero'},
    accent: input.accent ?? null,
    glow: input.glow,
    bands: {header: band(input.bands?.header), footer: band(input.bands?.footer)},
  };
};

/**
 * The frame of a border: motifs hang on its outer edge (the second line included) and never enter
 * the window. Around a window ('window') they use the bleed; on a screen ('screen') nothing leaves
 * the file. On both the outer edge hides the back layer (tucked under the band).
 */
export const frameOrnamentFrame = (input: {layout: FrameLayout; track: RoundRect; glow: number}): OrnamentFrame => {
  const {layout} = input;
  const canvas = canvasRect(layout.canvas);
  const screen = layout.fit === 'screen';
  return {
    kind: 'border',
    fit: layout.fit,
    canvas,
    box: {...layout.box},
    outline: {...layout.outer},
    track: {...input.track},
    circle: isCircle(layout.outer),
    hole: {...layout.holeShape},
    keepOut: [],
    paintLimit: screen ? {...layout.box} : canvas,
    // Window and screen alike, the outer edge hides the back layer, so it never shows in the window
    // or its glow margin (window minus holeShape), which the hole mask leaves in. Around a window
    // back motifs show in the bleed; on a screen the rest of the box is the band's fillet, which
    // the band fill covers, so screen has no back room at all (maxExtentAt) and its sets use front.
    cover: {path: roundRectPath(layout.outer), fillRule: 'nonzero'},
    accent: null,
    glow: input.glow,
    bands: {header: null, footer: null},
  };
};

/**
 * The frame with its paint limit pulled in to `reach` px past the outline (and never past the old
 * limit) on every side but the `open` ones, so every motif placed on it keeps within that distance
 * of the piece there: the stream layout grid gives half its gutter on the sides that face another
 * piece, and two pieces side by side never touch; the sides on the scene's margin stay open. On a
 * closed side a front motif may not slide in either: a band from `reach` inside the outline to the
 * piece's middle is kept clear, so a motif there stays small (about 2·reach, straddling the line,
 * or left out below its floor) instead of growing over the panel (owner, 2026-11-25: full size on
 * the margin only). 0 leaves the frame as it is.
 */
export const reachOrnamentFrame = (
  frame: OrnamentFrame, reach: number, open: readonly ('left' | 'top' | 'right' | 'bottom')[] = [],
): OrnamentFrame => {
  if (!(reach > 0)) return frame;
  const {outline, paintLimit: limit} = frame;
  const x0 = open.includes('left') ? limit.x : Math.max(limit.x, outline.x - reach);
  const y0 = open.includes('top') ? limit.y : Math.max(limit.y, outline.y - reach);
  const x1 = open.includes('right') ? limit.x + limit.width : Math.min(limit.x + limit.width, outline.x + outline.width + reach);
  const y1 = open.includes('bottom') ? limit.y + limit.height : Math.min(limit.y + limit.height, outline.y + outline.height + reach);
  const halfW = Math.max(0, outline.width / 2 - reach);
  const halfH = Math.max(0, outline.height / 2 - reach);
  const bands: Rect[] = [
    ...(open.includes('left') ? [] : [{x: outline.x + reach, y: outline.y, width: halfW, height: outline.height}]),
    ...(open.includes('top') ? [] : [{x: outline.x, y: outline.y + reach, width: outline.width, height: halfH}]),
    ...(open.includes('right') ? [] : [{x: outline.x + outline.width / 2, y: outline.y, width: halfW, height: outline.height}]),
    ...(open.includes('bottom') ? [] : [{x: outline.x, y: outline.y + outline.height / 2, width: outline.width, height: halfH}]),
  ].filter((band) => band.width > 0 && band.height > 0);
  return {
    ...frame,
    paintLimit: {x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0)},
    keepOut: [...frame.keepOut, ...bands],
  };
};

const scaleRect = <T extends Rect>(rect: T, k: number): T => {
  const scaled = {...rect, x: rect.x * k, y: rect.y * k, width: rect.width * k, height: rect.height * k};
  return 'radius' in rect ? {...scaled, radius: (rect as T & {radius: number}).radius * k} : scaled;
};

/**
 * The frame scaled by `k` about the origin: every rect, the glow and the cover (the outline's path,
 * as both builders make it). Placing a set on the frame scaled by 1/s and drawing the result
 * scaled by s grows every motif by s while keeping each inside its room of the real frame.
 */
export const scaleOrnamentFrame = (frame: OrnamentFrame, k: number): OrnamentFrame => {
  const outline = scaleRect(frame.outline, k);
  return {
    ...frame,
    canvas: scaleRect(frame.canvas, k),
    box: scaleRect(frame.box, k),
    outline,
    track: scaleRect(frame.track, k),
    hole: frame.hole ? scaleRect(frame.hole, k) : null,
    keepOut: frame.keepOut.map((rect) => scaleRect(rect, k)),
    paintLimit: scaleRect(frame.paintLimit, k),
    cover: {path: roundRectPath(outline), fillRule: frame.cover.fillRule},
    glow: frame.glow * k,
    bands: {header: frame.bands.header && scaleRect(frame.bands.header, k), footer: frame.bands.footer && scaleRect(frame.bands.footer, k)},
  };
};
