import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {ORNAMENT_CHOICES} from './types';

/** The default palette: silver silk, moonlight cream and a warm amber (the cobweb kit's). */
export const ORNAMENT_DEFAULT_COLORS = ['#CFC6E4', '#F6EFD8', '#E8963C'];

/** Smallest and largest ornamentSize, in px. */
export const ORNAMENT_SIZE_RANGE = {min: 12, max: 256, default: 48} as const;

/** Smallest and largest ornamentScale. */
export const ORNAMENT_SCALE_RANGE = {min: 1, max: 4, default: 1} as const;

/**
 * The ornament field group, shared by chat, block and border. The defaults ('none', lightning 0)
 * draw nothing, so every existing theme stays exactly as it was.
 */
export const ornamentFields = () => ({
  ornaments: z.enum(ORNAMENT_CHOICES)
    .describe('Themed ornaments around the panel or the border: none; midnight (bats, pumpkins, stars and embers); haunted-mansion (one bat by the top right corner); haunted-interior (brass candelabras with candles, sconces and velvet valances); cobweb (dewy webs, thread garlands and a spider); horizon (a palm, a sliced sun, wireframe solids and twinkles); terminal (a row of small squares above the top line, lock-on brackets and an accent diamond on frames, a square on the chat header and a signal meter on its footer, a double bar beside the text of a block); sticker (flat stickers in the ink line of the pieces: a star, a four-point sparkle and a lightning bolt, stepping through their poses eight times a second). Each motif fits the free space of its slot (bleed, padding pockets, band) and never covers the text or the window')
    .default('none'),
  ornamentColors: z.array(zColor()).min(1).max(3)
    .describe('Ornament colors: fog or silk (cool), moonlight (light) and warm light (candles, pumpkins, lanterns); the third is optional and falls back to the first')
    .default([...ORNAMENT_DEFAULT_COLORS]),
  ornamentSize: z.number().finite().min(ORNAMENT_SIZE_RANGE.min).max(ORNAMENT_SIZE_RANGE.max)
    .describe('Size of the main ornament, in fixed px (it does not follow the box): moon diameter, bat wingspan, candelabra height to the flame tip, web radius, palm height, the pitch of the terminal squares (each half as wide) or the height of the sticker star, line included; the others follow up to a cap or have a fixed size. Capped at the free space of its slot (bleed, padding, band)')
    .default(ORNAMENT_SIZE_RANGE.default),
  ornamentScale: z.number().finite().min(ORNAMENT_SCALE_RANGE.min).max(ORNAMENT_SCALE_RANGE.max)
    .describe('Scale of all ornaments together (sizes, caps, strokes and spacing), from 1 to 4, for large borders; free space is measured at the same scale too, so larger ornaments need proportionally more bleed (or padding, or band)')
    .default(ORNAMENT_SCALE_RANGE.default),
  ornamentReach: z.number().int().min(0).max(ORNAMENT_SIZE_RANGE.max)
    .describe('How far ornaments may reach past the outline (the panel\'s edge, a border\'s outer edge), in px; 0 lets them use the whole bleed. The stream layout grid sets half its gutter, so pieces side by side never touch; a motif short of room slides in over the line or shrinks to its floor')
    .default(0),
  ornamentOpenSides: z.array(z.enum(['left', 'top', 'right', 'bottom'])).max(4)
    .describe('Sides where ornamentReach does not apply and ornaments use the whole bleed: a layout size sets the sides that face the scene\'s outer margin, so its stickers keep their full size there')
    .default([]),
  lightning: z.number().finite().min(0).max(1)
    .describe('Lightning flash over the panel or the border, from 0 to 1, at the same moments as the HauntedInteriorLoop background with the same seed and duration; 0 turns it off')
    .default(0),
});
