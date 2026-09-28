import type {z} from 'zod';
import {getLightningStrikes, getWindowFlash, LIGHTNING, LIGHTNING_COLOR} from '../../../backgrounds/halloween/lightning';
import {clampRadius} from '../geometry';
import {scaleOrnamentFrame} from './frame';
import {ornamentOutset} from './place';
import {hauntedInteriorSet} from './sets/haunted-interior';
import {hauntedMansionSet} from './sets/haunted-mansion';
import {midnightSet} from './sets/midnight';
import {cobwebSet} from './sets/cobweb';
import type {
  FlashElement, OrnamentElement, OrnamentFrame, OrnamentLayout, OrnamentPlacement, OrnamentSet, OrnamentSetId, OrnamentStyle,
} from './types';

/** Every set by name. Sets never import this file (nor render.tsx or index.ts): no import cycles. */
export const ORNAMENT_REGISTRY: Record<OrnamentSetId, OrnamentSet> = {
  midnight: midnightSet,
  'haunted-mansion': hauntedMansionSet,
  'haunted-interior': hauntedInteriorSet,
  cobweb: cobwebSet,
};

/** The set a style names, or null for 'none'. */
export const ornamentSetOf = (style: Pick<OrnamentStyle, 'ornaments'>): OrnamentSet | null =>
  (style.ornaments === 'none' ? null : ORNAMENT_REGISTRY[style.ornaments]);

/** Layouts run several times per frame (schema, layers, component, motion): placements are memoised. */
const PLACEMENT_CACHE_LIMIT = 256;
const placementCache = new Map<string, readonly OrnamentPlacement[]>();

const NONE: readonly OrnamentPlacement[] = Object.freeze([]);

/**
 * Where the style's set puts its motifs on this frame: a pure function of the frame, the set and
 * ornamentSize (no seed, no frame index), memoised. [] for 'none' and when the hero fits nowhere.
 */
export const placeOrnaments = (
  frame: OrnamentFrame, style: Pick<OrnamentStyle, 'ornaments' | 'ornamentSize'>,
): readonly OrnamentPlacement[] => {
  const set = ornamentSetOf(style);
  if (!set) return NONE;
  const key = `${set.name}|${style.ornamentSize}|${JSON.stringify(frame)}`;
  const cached = placementCache.get(key);
  if (cached) return cached;
  const placements = Object.freeze(set.place(frame, {ornamentSize: style.ornamentSize}).map((placement) => Object.freeze({...placement})));
  if (placementCache.size >= PLACEMENT_CACHE_LIMIT) placementCache.delete(placementCache.keys().next().value!);
  placementCache.set(key, placements);
  return placements;
};

/**
 * The kind's ornament layout: the style's set placed on its frame. With an ornamentScale s other
 * than 1 the set is placed on the frame shrunk by 1/s and the layout stays in that space (see
 * OrnamentLayout), so the room of every slot, the caps and the strokes all grow by s together.
 */
export const layoutOrnaments = (
  frame: OrnamentFrame, style: Pick<OrnamentStyle, 'ornaments' | 'ornamentSize' | 'ornamentScale'>,
): OrnamentLayout => {
  const scale = style.ornamentScale;
  if (scale === 1 || style.ornaments === 'none') return {frame, placements: placeOrnaments(frame, style)};
  const scaled = scaleOrnamentFrame(frame, 1 / scale);
  return {frame: scaled, placements: placeOrnaments(scaled, style), scale};
};

/** How far the layout's motifs reach beyond the box, in the kind's px. */
export const layoutOutset = (layout: OrnamentLayout) => ornamentOutset(layout.frame, layout.placements) * (layout.scale ?? 1);

/** The ornament elements of one frame, split by layer, each in placement order. Empty for 'none'. */
export const buildOrnamentScene = (
  layout: OrnamentLayout, style: OrnamentStyle, frameIndex: number, durationInFrames: number,
): {back: OrnamentElement[]; front: OrnamentElement[]} => {
  const set = ornamentSetOf(style);
  if (!set || layout.placements.length === 0) return {back: [], front: []};
  const elements = set.build(layout.frame, layout.placements, style, frameIndex, durationInFrames);
  return {
    back: elements.filter((element) => element.layer === 'back'),
    front: elements.filter((element) => element.layer === 'front'),
  };
};

/** The cold white of the flash (the interior's lightning). */
export const FLASH_COLOR = LIGHTNING_COLOR;

/**
 * The lightning flash of one frame: none at lightning 0; otherwise exactly one element whose left
 * and right levels are the interior background's two windows (getWindowFlash, same seed and
 * duration), so an overlay flashes with the background when both start together.
 */
export const buildFlashScene = (
  style: Pick<OrnamentStyle, 'lightning' | 'seed' | 'durationSeconds'>, frameIndex: number, durationInFrames: number,
): FlashElement[] => {
  if (!(style.lightning > 0)) return [];
  const [left, right] = getWindowFlash(style, frameIndex, durationInFrames);
  return [{type: 'flash', left, right, color: FLASH_COLOR, opacity: style.lightning}];
};

/**
 * The ways out of a refusal, per frame: what gives the corners more room there (measured with
 * roomAt on the chat defaults, a 320×120 block, a 320×180 window and a 640×360 screen).
 *   - Panels: a larger bleed, padding or radius (a rounder corner sits further in and pushes the
 *     text inward; a smaller radius never gains room).
 *   - Border around a window ('window'): no padding; a larger bleed or a rounder window. The band's
 *     thickness and the glow do not help: the window and the canvas stay put.
 *   - Screen frame ('screen'): no bleed (always 0); a thicker band, more glow or a larger radius moves
 *     the window's corner inward, away from the box's.
 * A radius already at its maximum (a circle, a pill, a round screen frame) is never offered: every
 * outline is the clamped shape (window/screen: the window offset by the band, maxed exactly when the
 * window is), so a larger radius prop changes nothing there.
 */
export const ornamentWayOut = (frame: Pick<OrnamentFrame, 'kind' | 'fit' | 'circle' | 'outline'>): string => {
  const {outline} = frame;
  const rounder = !frame.circle
    && clampRadius(outline.radius, outline.width, outline.height) < Math.min(outline.width, outline.height) / 2 - 1e-9;
  if (frame.kind === 'chat') return rounder ? 'increase bleed, padding or radius or use ornaments none.' : 'increase bleed or padding or use ornaments none.';
  if (frame.kind === 'block') {
    return rounder
      ? 'increase bleed, paddingX, paddingY or radius or use ornaments none.'
      : 'increase bleed, paddingX or paddingY or use ornaments none.';
  }
  if (frame.fit === 'screen') return rounder ? 'increase thickness, glow or radius or use ornaments none.' : 'increase thickness or glow or use ornaments none.';
  return rounder ? 'increase bleed or radius or use ornaments none.' : 'increase bleed or use ornaments none.';
};

/**
 * Refuses a set whose hero fits nowhere (the placement is then empty), naming the way out for the
 * kind (ornamentWayOut), then runs the set's own refusals. Nothing for 'none'.
 */
export const refineOrnaments = (layout: OrnamentLayout, style: OrnamentStyle, context: z.RefinementCtx) => {
  const set = ornamentSetOf(style);
  if (!set) return;
  if (layout.placements.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['ornaments'],
      message: `The "${set.name}" ornaments do not fit this size: ${ornamentWayOut(layout.frame)}`,
    });
    return;
  }
  set.refine?.(layout.frame, layout.placements, style, context);
};

/**
 * Refuses a lightning a cycle too short to hold a strike (under LIGHTNING.oneFrom s the interior's
 * lightning has none, so the flash would never light), naming the way out. Independent of the
 * ornaments: the kinds call it next to refineOrnaments.
 */
export const refineLightning = (style: Pick<OrnamentStyle, 'lightning' | 'seed' | 'durationSeconds'>, context: z.RefinementCtx) => {
  if (!(style.lightning > 0) || getLightningStrikes(style).length > 0) return;
  const least = String(LIGHTNING.oneFrom);
  context.addIssue({
    code: 'custom',
    path: ['lightning'],
    message: `With durationSeconds below ${least} s there is no lightning: use durationSeconds ≥ ${least} or lightning 0.`,
  });
};
