import type {Rect} from '../box';
import {isCircle, roundRectPath, type RoundRect} from '../geometry';
import type {FrameLayout, PanelLayout} from '../layout';
import type {OrnamentFrame} from './types';

const canvasRect = (canvas: {width: number; height: number}): Rect => ({x: 0, y: 0, width: canvas.width, height: canvas.height});

/** Text areas worth keeping clear of: the null and empty ones are dropped. */
const areas = (keepOut: readonly (Rect | null | undefined)[]): Rect[] =>
  keepOut.filter((rect): rect is Rect => !!rect && rect.width > 0 && rect.height > 0).map((rect) => ({...rect}));

/**
 * The frame of a chat panel or a block: motifs hang on the panel's outline and may use the whole
 * canvas (the bleed, and on a Twitch panel with no bleed the padding pockets inside the box); the
 * panel hides the back layer. Built from the kind's layout before the ornaments fold their outset.
 */
export const panelOrnamentFrame = (input: {
  kind: 'chat' | 'block'; layout: PanelLayout; keepOut: readonly (Rect | null | undefined)[];
  accent?: 'esquerda' | 'topo' | null; glow: number;
}): OrnamentFrame => {
  const {layout} = input;
  const canvas = canvasRect(layout.canvas);
  return {
    kind: input.kind,
    fit: 'painel',
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
  };
};

/**
 * The frame of a border: motifs hang on its outer edge (the second line included) and never enter
 * the window. Around a window ('janela') they use the bleed; on a screen ('tela') nothing leaves
 * the file. On both the outer edge hides the back layer (tucked under the band).
 */
export const frameOrnamentFrame = (input: {layout: FrameLayout; track: RoundRect; glow: number}): OrnamentFrame => {
  const {layout} = input;
  const canvas = canvasRect(layout.canvas);
  const tela = layout.fit === 'tela';
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
    paintLimit: tela ? {...layout.box} : canvas,
    // Janela and tela alike, the outer edge hides the back layer, so it never shows in the window
    // or its glow margin (window minus holeShape), which the hole mask leaves in. Around a window
    // back motifs show in the bleed; on a screen the rest of the box is the band's fillet, which
    // the band fill covers, so tela has no back room at all (maxExtentAt) and its sets use front.
    cover: {path: roundRectPath(layout.outer), fillRule: 'nonzero'},
    accent: null,
    glow: input.glow,
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
  };
};
