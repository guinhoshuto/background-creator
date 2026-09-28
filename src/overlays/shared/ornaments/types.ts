import type {ReactNode} from 'react';
import type {z} from 'zod';
import type {Rect} from '../box';
import type {RoundRect} from '../geometry';

/**
 * Themed ornaments (enfeites) around a chat panel, a block or a border: a moon rising behind the
 * corner, lanterns, candles, cobwebs. Each theme is an OrnamentSet (sets/*.tsx); the registry
 * places it, builds its elements per frame and renders them in two layers:
 *
 *   - back: under the panel (clipped to the paint limit minus `frame.cover`, so nothing of it ever
 *     shows through a translucent fill or band);
 *   - front: over the stroke, clear of the text areas (keepOut) and the window (hole).
 *
 * Placement is a pure function of the layout, the set and ornamentSize (never of the seed nor the
 * frame): each motif takes min(nominal, room at its slot); a secondary motif below its minimum is
 * dropped, and a set whose hero fits nowhere places nothing, which the schema refuses.
 */

export const ORNAMENT_CHOICES = ['nenhum', 'noite', 'mansao', 'interior', 'teia'] as const;
export type OrnamentChoice = (typeof ORNAMENT_CHOICES)[number];
export type OrnamentSetId = Exclude<OrnamentChoice, 'nenhum'>;
export const ORNAMENT_SET_IDS = ORNAMENT_CHOICES.filter((choice): choice is OrnamentSetId => choice !== 'nenhum');

export type OrnamentKind = 'chat' | 'bloco' | 'borda';
/** 'painel': chat and bloco; 'janela' and 'tela': the border's fits. */
export type OrnamentFit = 'painel' | 'janela' | 'tela';
export type OrnamentLayerName = 'back' | 'front';

/**
 * Everything a set may read about where it is drawn, in canvas px. Built by the kinds from their
 * own layouts (panelOrnamentFrame / frameOrnamentFrame), so the sets never import a kind.
 */
export type OrnamentFrame = {
  kind: OrnamentKind;
  fit: OrnamentFit;
  /** The whole file: {0, 0, canvas.width, canvas.height}. */
  canvas: Rect;
  box: Rect;
  /** The outline motifs hang on: the panel shape; a border's outer edge (second line included). */
  outline: RoundRect;
  /** The stroke's centreline (the flash's edge runs on it). */
  track: RoundRect;
  /** The outline is a circle (round bloco, round webcam): the corner slots are its 45° points. */
  circle: boolean;
  /** A border's window (holeShape), which nothing may enter; null on panels. */
  hole: RoundRect | null;
  /** Text areas front motifs keep clear of (chat: messages and title; bloco: text; borda: none). */
  keepOut: readonly Rect[];
  /** Nothing may be drawn past it: the canvas (panels, janela), the box on tela. */
  paintLimit: Rect;
  /**
   * What hides the back layer: the panel; a border's outer edge (janela and tela alike, so back
   * motifs tuck under the band and never show in the window nor in its glow margin, the part of
   * the window outside `hole`). Every frame uses 'nonzero' today; 'evenodd' stays for a cover
   * with a cut-out.
   */
  cover: {path: string; fillRule: 'nonzero' | 'evenodd'};
  /** A block's accent side (round blocks: sets keep the hero off the accent arc's slots); null elsewhere. */
  accent: 'esquerda' | 'topo' | null;
  /** The kind's glow reach; 0 (a Twitch panel) means crisp motifs, no soft lights. */
  glow: number;
};

export type OrnamentCornerId = 'TR' | 'BR' | 'BL' | 'TL';
export type OrnamentSlotId = OrnamentCornerId | 'top' | 'bottom' | 'left' | 'right' | 'center';

/**
 * One motif's place: its centre (x, y) and `extent`, the radius of the circle that holds the
 * motif, its motion and its light in every frame. `size` is the motif's own size parameter (the
 * moon's diameter, the lantern's height…), which each set relates to the extent.
 */
export type OrnamentPlacement = {
  motif: string;
  slot: OrnamentSlotId;
  layer: OrnamentLayerName;
  x: number;
  y: number;
  extent: number;
  size: number;
};

/**
 * The fields every ornament element carries. Elements are flat (numbers and strings only), listed
 * by place, with a constant count per props and size. `type` starts with '<set>-'; `anchor`
 * indexes the placement; (x, y) is the body's centre this frame, `reach` the body's radius around
 * it and `light` the soft light's radius (0 when none): hypot(x − px, y − py) + max(reach, light)
 * never exceeds the placement's extent. `lightOpacity` is the light's peak alpha, at most
 * MAX_CONTENT_OPACITY wherever a front element's light circle meets a text area (the back layer
 * is clipped to outside the cover, which holds every text area). With frame.glow 0 (a Twitch
 * panel) `light` is 0: crisp motifs.
 */
export type OrnamentBase = {
  type: string;
  layer: OrnamentLayerName;
  anchor: number;
  x: number;
  y: number;
  reach: number;
  light: number;
  lightOpacity: number;
  opacity: number;
};

/** Any set's element: the base plus the set's own flat fields. Declare set elements with `type`, never `interface`. */
export type OrnamentElement = OrnamentBase & Record<string, string | number>;

/**
 * The lightning flash over the panel or the band: one per frame while lightning > 0, the two
 * windows' flash levels (0–1, see getWindowFlash) as the left and right ends of a cold wash.
 */
export type FlashElement = {type: 'flash'; left: number; right: number; color: string; opacity: number};

/** The props the ornaments read (every kind has them). */
export type OrnamentStyle = {
  ornaments: OrnamentChoice;
  /** [0] cool (fog, silk), [1] light (moonlight), [2] warm (candles, pumpkins; falls back to [0]). */
  ornamentColors: readonly string[];
  ornamentSize: number;
  /** Scales every motif together (sizes, caps, strokes, spacing); 1 draws them at their own px. */
  ornamentScale: number;
  lightning: number;
  seed: number;
  durationSeconds: number;
  transparent: boolean;
};

/**
 * Where a kind's ornaments go: its frame and the (memoised) placements. With an ornamentScale s
 * other than 1 both are in the set's own space, the kind's frame shrunk by 1/s (layoutOrnaments),
 * and `scale` is s: the layers draw that space scaled by s, so every motif grows by s together.
 */
export type OrnamentLayout = {frame: OrnamentFrame; placements: readonly OrnamentPlacement[]; scale?: number};

export type OrnamentRenderContext = {
  /** `${idPrefix}-ornament-${layer}`: a set's defs use `${idBase}-${key}-<part>`. */
  idBase: string;
  frame: OrnamentFrame;
  style: OrnamentStyle;
};

/**
 * A theme's ornaments. Method syntax on purpose: a set typed with its own element union still
 * assigns to OrnamentSet (the registry's type) under strictFunctionTypes.
 */
export interface OrnamentSet<E extends OrnamentElement = OrnamentElement> {
  name: OrnamentSetId;
  /** Added to ORNAMENT_SEED (503) for the set's random stream: 0, 20, 40, 60. */
  seedOffset: number;
  /** The hero's smallest extent, in px (≤ 12, so every named size keeps it). */
  minExtent: number;
  /** Seed- and frame-free. Hero first; returns [] when the hero fits no slot (the schema refuses). */
  place(frame: OrnamentFrame, style: Pick<OrnamentStyle, 'ornamentSize'>): OrnamentPlacement[];
  /** The elements of one frame (any real frame, fractional too), periodic in the cycle. */
  build(frame: OrnamentFrame, placements: readonly OrnamentPlacement[], style: OrnamentStyle, frameIndex: number, durationInFrames: number): E[];
  render(element: E, key: number, context: OrnamentRenderContext): ReactNode;
  /** Extra refusals of the set (naming the way out). */
  refine?(frame: OrnamentFrame, placements: readonly OrnamentPlacement[], style: OrnamentStyle, context: z.RefinementCtx): void;
}
