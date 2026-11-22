import {ceilHalf, cornerSlot, floorHalf, roomAt, slideRange, slideToFit, slotsOffAccent, type OrnamentCorner} from '../place';
import type {OrnamentCornerId, OrnamentFrame, OrnamentPlacement, OrnamentSlotId} from '../types';
import {extentOf, sizeOf} from './sticker-motifs';
import type {StickerMotif} from './sticker-steps';

/**
 * Where the sticker motifs go and how big. ornamentSize is the star's height at rest (line
 * included); the sparkle asks for 1.0 and the bolt for 1.1 times that. Each takes min(nominal, the
 * room of its slot); below the owner's smallest readable size (20 px for the star and the
 * sparkle, 30 px for the bolt) a secondary is left out, and the star (the hero) is only refused
 * where it fits no slot. On a screen frame the hero's floor is 16 px: the room there is 8.5 px, and
 * those files ship plain.
 *
 * Every motif is in front and sits outside the outline where the room allows (the slide prefers
 * the circle tangent to the outline from outside), else slides in over the line. None goes right,
 * down or to the BR corner (the side depth fills the right and the bottom, and a motif would paint
 * over it), and on a rectangular border none goes to the top or its corners (the title bar and its
 * buttons). Slots, as in the approved mock:
 *
 *   - chat: star BL, sparkle TL, bolt on the left edge at 60 %;
 *   - block up to 96 px high (label-sm, label): star BL, sparkle TR;
 *   - taller block: star on the top edge at 86 % (BL when it does not fit there), sparkle TL, bolt
 *     on the left edge at 50 %;
 *   - round block: star 45° BL, sparkle 45° TL, both off the accent arc's slots;
 *   - rectangular border: star on the left edge at 35 %, sparkle BL;
 *   - round border: star 45° TL, sparkle 45° BL;
 *   - screen: the star TL alone.
 *
 * Seed- and frame-free; on a scaled frame (ornamentScale) the rules read the set's own space.
 */

/** The cream rim round each motif, in px: a capability of the motifs, off in the kit (the overlay cannot know it sits on paper). */
export const STICKER_RIM = 0;
/** The hero's smallest extent anywhere: the 16 px star of the screens. */
export const STICKER_MIN_EXTENT = 8;
/** Blocks up to this outline height are labels: star BL, sparkle TR, no bolt. */
export const LABEL_MAX_HEIGHT = 96;
/** Where along an edge the edge slots sit, as a share of the side from its top or left end. */
export const EDGE_SHARE = {chatBolt: 0.6, blockStar: 0.86, blockBolt: 0.5, borderStar: 0.35} as const;

/** Each motif's nominal size per ornamentSize and its smallest size, in px (the star's on a screen apart). */
export const STICKER_SIZES: Record<StickerMotif, {nominal: number; min: number}> = {
  star: {nominal: 1, min: 20},
  sparkle: {nominal: 1, min: 20},
  bolt: {nominal: 1.1, min: 30},
};
export const SCREEN_STAR_MIN = 16;

export type StickerPlacement = OrnamentPlacement & {motif: StickerMotif};

/** The smallest extent of a motif (its smallest size, the line and the largest pose held), up to the half pixel. */
export const minExtentOf = (motif: StickerMotif, minSize = STICKER_SIZES[motif].min) => ceilHalf(extentOf(motif, minSize, STICKER_RIM));

type Slot = {id: OrnamentSlotId; corner: OrnamentCorner};

const corner = (frame: OrnamentFrame, id: OrnamentCornerId): Slot => ({id, corner: cornerSlot(frame, id)});

/**
 * An edge slot as a diagonal roomAt and slideToFit can walk (they read only its point and
 * direction): the point `share` along the outline's top or left side, sliding out along its
 * normal.
 */
const edge = (frame: OrnamentFrame, side: 'top' | 'left', share: number): Slot => {
  const {outline} = frame;
  const point = side === 'top'
    ? {x: outline.x + share * outline.width, y: outline.y, dx: 0, dy: -1}
    : {x: outline.x, y: outline.y + share * outline.height, dx: -1, dy: 0};
  return {id: side, corner: {slot: side === 'top' ? 'TL' : 'BL', index: -1, ...point}};
};

/**
 * One motif at a slot: extent = min(nominal, the slot's room) floored to 0.5 px, at the slide
 * nearest the circle tangent to the outline from outside; null below `least`.
 */
const fit = (frame: OrnamentFrame, slot: Slot, motif: StickerMotif, nominalSize: number, least: number): StickerPlacement | null => {
  const nominal = ceilHalf(extentOf(motif, nominalSize, STICKER_RIM));
  const range = slideRange(frame, 'front');
  const room = roomAt(frame, slot.corner, 'front', range);
  const extent = floorHalf(Math.min(nominal, room.extent));
  if (!(extent > 0) || extent < least - 1e-9) return null;
  const spot = slideToFit(frame, slot.corner, extent, 'front', range, extent);
  if (!spot) return null;
  const size = Math.min(nominalSize, sizeOf(motif, extent, STICKER_RIM));
  return {motif, slot: slot.id, layer: 'front', x: spot.x, y: spot.y, extent, size};
};

/** The slots of a frame: the hero's in the order it tries them, then each secondary's. */
const slotsOf = (frame: OrnamentFrame): {hero: Slot[]; sparkle: Slot | null; bolt: Slot | null} => {
  if (frame.kind === 'border') {
    if (frame.fit === 'screen') return {hero: [corner(frame, 'TL')], sparkle: null, bolt: null};
    if (frame.circle) return {hero: [corner(frame, 'TL')], sparkle: corner(frame, 'BL'), bolt: null};
    return {hero: [edge(frame, 'left', EDGE_SHARE.borderStar)], sparkle: corner(frame, 'BL'), bolt: null};
  }
  if (frame.kind === 'chat') {
    return {hero: [corner(frame, 'BL')], sparkle: corner(frame, 'TL'), bolt: edge(frame, 'left', EDGE_SHARE.chatBolt)};
  }
  if (frame.circle) {
    const free = slotsOffAccent(frame).map((slot) => slot.slot);
    const hero = (['BL', 'TL', 'TR'] as const).find((id) => free.includes(id));
    const sparkle = (['TL', 'BL', 'TR'] as const).find((id) => id !== hero && free.includes(id));
    return {hero: hero ? [corner(frame, hero)] : [], sparkle: sparkle ? corner(frame, sparkle) : null, bolt: null};
  }
  if (frame.outline.height <= LABEL_MAX_HEIGHT + 1e-9) return {hero: [corner(frame, 'BL')], sparkle: corner(frame, 'TR'), bolt: null};
  return {
    hero: [edge(frame, 'top', EDGE_SHARE.blockStar), corner(frame, 'BL')],
    sparkle: corner(frame, 'TL'),
    bolt: edge(frame, 'left', EDGE_SHARE.blockBolt),
  };
};

/** The placements: the star first, then the sparkle and the bolt where they fit; [] when the star fits nowhere. */
export const placeSticker = (frame: OrnamentFrame, ornamentSize: number): StickerPlacement[] => {
  const slots = slotsOf(frame);
  const heroSize = STICKER_SIZES.star.nominal * ornamentSize;
  const heroFloor = minExtentOf('star', frame.fit === 'screen' ? SCREEN_STAR_MIN : STICKER_SIZES.star.min);
  // The hero is dropped only below both its floor and its own nominal (a small ornamentSize still places it).
  const heroLeast = Math.min(heroFloor, floorHalf(ceilHalf(extentOf('star', heroSize, STICKER_RIM))));
  let hero: StickerPlacement | null = null;
  for (const slot of slots.hero) {
    hero = fit(frame, slot, 'star', heroSize, heroLeast);
    if (hero) break;
  }
  if (!hero) return [];
  const placements = [hero];
  for (const motif of ['sparkle', 'bolt'] as const) {
    const slot = slots[motif];
    if (!slot) continue;
    const placement = fit(frame, slot, motif, STICKER_SIZES[motif].nominal * ornamentSize, minExtentOf(motif));
    if (placement) placements.push(placement);
  }
  return placements;
};
