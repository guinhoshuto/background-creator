import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {baseBackgroundSchema} from '../../settings';

export const STICKER_MOTIFS = ['star', 'sparkle', 'bolt'] as const;

/**
 * One loose sticker: timing, alpha rule and format, without a box (the kind's canvas is fixed at
 * 304×304) and without a seed (it draws nothing at random: frame 0 is the rest pose).
 */
export const stickerLoopSchema = z.object({
  ...baseBackgroundSchema.omit({colors: true, seed: true}).shape,
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(12),
  transparent: z.boolean().describe('Alpha in WebM, MOV and PNG').default(true),
  motif: z.enum(STICKER_MOTIFS).describe('Sticker shape: a five-point star, a four-point sparkle or a lightning bolt').default('star'),
  fill: zColor().default('#F4A66C'),
  ink: zColor().default('#4A3A69'),
  rimColor: zColor().default('#F6E2E4'),
  rim: z.number().int().min(0).max(8)
    .describe('Cream rim round the sticker, in px, inside its 256 px; 0 draws none')
    .default(4),
});

export type StickerLoopProps = z.infer<typeof stickerLoopSchema>;
