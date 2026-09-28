import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {baseBackgroundSchema} from '../../settings';
import {overlayBoxFields, type BoxDefaults} from './box';

/**
 * Zod field groups shared by the overlay kinds. Each group is a factory of plain shape objects,
 * so a kind spreads the ones it needs into its own `z.object({...})` and overrides the defaults
 * that suit it (a border wants a thicker stroke than a label). User-facing text is English.
 */

export const FILL_STYLES = ['solid', 'gradient', 'dots', 'stripes', 'sparkles', 'glass', 'fog', 'damask'] as const;
export type FillStyleName = (typeof FILL_STYLES)[number];

export const STROKE_MOTIONS = ['still', 'pulse', 'dashes', 'comets', 'gradient'] as const;
export type StrokeMotionName = (typeof STROKE_MOTIONS)[number];

/**
 * What every overlay kind shares: timing, seed, alpha rule, format, box and guides. Overlays
 * default to transparent, since they sit on top of something else.
 */
export const overlayBaseFields = (size: BoxDefaults) => ({
  ...baseBackgroundSchema.omit({colors: true}).shape,
  transparent: z.boolean().describe('Alpha in WebM, MOV and PNG').default(true),
  ...overlayBoxFields(size),
  guides: guidesField(),
});

/** Studio-only outlines of box, content and hole; the exporter refuses them. */
export const guidesField = () => z.boolean()
  .describe('Shows the box, the text area and the window in the Studio; the export refuses guides turned on')
  .default(false);

/** The description goes in here, not after: `.describe()` on the returned default hides it in the Studio. */
export const radiusField = (
  defaultValue = 16,
  description = 'Corner radius, in px; capped at half the shorter side (becomes a pill or a circle)',
) => z.number().finite().min(0).max(1920)
  .describe(description)
  .default(defaultValue);

export const paddingField = (defaultValue = 16) => z.number().finite().min(0).max(512)
  .describe('Space between the outline and the content, in px')
  .default(defaultValue);

export type FillDefaults = Partial<{
  fill: FillStyleName;
  fillColors: string[];
  fillOpacity: number;
  fillScale: number;
  fillSpeed: number;
  fillAngle: number;
  fillRise: boolean;
  fillLight: number;
}>;

export const fillFields = (defaults: FillDefaults = {}) => ({
  fill: z.enum(FILL_STYLES)
    .describe('Fill: solid, gradient (colors swaying slowly), dots, stripes, sparkles (twinkling), glass (translucent, with a glint), fog (banks rolling along the bottom) or damask (wallpaper)')
    .default(defaults.fill ?? 'solid'),
  fillColors: z.array(zColor()).min(1).max(3)
    .describe('Fill colors: with one color, just the pattern; with more, the first is the base and the others form the pattern (in fog, the second is the fog and the third the bright core; in damask, the second is the ink and the third is left out)')
    .default(defaults.fillColors ?? ['#12162B', '#67E8F9', '#F472B6']),
  fillOpacity: z.number().finite().min(0).max(1)
    .describe('Fill opacity, from 0 to 1')
    .default(defaults.fillOpacity ?? 0.85),
  fillScale: z.number().finite().min(8).max(256)
    .describe('Pattern size, in px: distance between dots, width of each stripe with its gap, mean spacing between sparkles, height of each fog bank (one every 2.25 × fillScale), width of the damask tile (1.5 times as tall)')
    .default(defaults.fillScale ?? 32),
  fillSpeed: z.number().finite().min(0).max(480)
    .describe('Pattern speed in px/s, the same at every size: dots, stripes, damask, fog (period of 2.25 × fillScale) and the spin of sparkles round to a whole number of periods per cycle (at least one); gradient sways back and forth; in glass, a glint passes each point once per cycle; 0 holds it still')
    .default(defaults.fillSpeed ?? 16),
  fillAngle: z.number().finite().min(-180).max(180)
    .describe('Direction of motion of gradient, stripes and the glint, in degrees (0 = right, 90 = down); dots and damask follow the nearest axis or diagonal; fog only moves sideways (right if the angle points right or straight up or down, otherwise left)')
    .default(defaults.fillAngle ?? 45),
  fillRise: z.boolean()
    .describe('sparkles only: they rise like embers instead of twinkling in place')
    .default(defaults.fillRise ?? false),
  fillLight: z.number().finite().min(0).max(1)
    .describe('Top light: a white veil at the top of the fill that fades toward the bottom (gives glass volume), from 0 to 1; 0 turns it off')
    .default(defaults.fillLight ?? 0),
});

export type StrokeDefaults = Partial<{
  strokeMotion: StrokeMotionName;
  strokeColors: string[];
  strokeWidth: number;
  /** The smallest width a kind accepts (a border needs a band; a block may have none). */
  strokeWidthMin: number;
  dashLength: number;
  gapLength: number;
  cometSpacing: number;
  cometTail: number;
  gradientLength: number;
  strokeSpeed: number;
  strokePulses: number;
  strokeCore: number;
}>;

export const strokeFields = (defaults: StrokeDefaults = {}) => ({
  strokeMotion: z.enum(STROKE_MOTIONS)
    .describe('Outline motion: still, pulse (breathes), dashes (marching dashes), comets or gradient (colors running along the outline)')
    .default(defaults.strokeMotion ?? 'still'),
  strokeColors: z.array(zColor()).min(1).max(4)
    .describe('Outline colors, spread along it')
    .default(defaults.strokeColors ?? ['#67E8F9', '#F472B6']),
  strokeWidth: z.number().finite().min(defaults.strokeWidthMin ?? 0).max(64)
    .describe('Outline thickness, in px; 2 or more avoids color loss in WebM')
    .default(defaults.strokeWidth ?? 3),
  dashLength: z.number().finite().min(2).max(512)
    .describe('dashes: length of each dash, in px (adjusted to close the outline without a seam)')
    .default(defaults.dashLength ?? 16),
  gapLength: z.number().finite().min(2).max(512)
    .describe('dashes: gap between dashes, in px (adjusted together with the dash)')
    .default(defaults.gapLength ?? 12),
  cometSpacing: z.number().finite().min(32).max(4000)
    .describe('comets: distance from one comet to the next, in px along the outline; the count comes from the size (adjusted to close the outline, at least one), so every size has the same density')
    .default(defaults.cometSpacing ?? 480),
  cometTail: z.number().finite().min(8).max(4000)
    .describe('comets: tail length, in px along the outline (at most the gap between comets)')
    .default(defaults.cometTail ?? 160),
  gradientLength: z.number().finite().min(32).max(4000)
    .describe('Length in px along the outline over which the colors repeat (gradient, and still or pulse with several colors); adjusted to close the outline, so every size shows the colors at the same scale')
    .default(defaults.gradientLength ?? 480),
  strokeSpeed: z.number().finite().min(0).max(4000)
    .describe('Speed along the outline in px/s, rounded to a whole number of periods per cycle (at least one); 0 holds it still')
    .default(defaults.strokeSpeed ?? 120),
  strokePulses: z.number().int().min(1).max(16)
    .describe('pulse: how many times the outline breathes per cycle')
    .default(defaults.strokePulses ?? 1),
  strokeCore: z.number().finite().min(0).max(1)
    .describe('Bright core in the middle of the stroke, like a neon tube: opacity from 0 to 1 (only on strokes of 2.5 px or more); 0 turns it off')
    .default(defaults.strokeCore ?? 0),
});

/**
 * The dim full outline under `dashes` and `comets`, in the first stroke colour, so the edge
 * still reads between the moving pieces. Its own factory rather than part of strokeFields: a
 * kind may keep it as a fixed look (chat) instead of a prop.
 */
export const trackOpacityField = (defaultValue = 0.3) => z.number().finite().min(0).max(1)
  .describe('dashes and comets: opacity of the whole dimmed outline underneath them, in the first color; 0 draws nothing')
  .default(defaultValue);

export type GlowDefaults = Partial<{glow: number; glowPulses: number; glowStrength: number}>;

export const glowFields = (defaults: GlowDefaults = {}) => ({
  glow: z.number().finite().min(0).max(128)
    .describe('Reach of the outline glow, in px; outside the box it must fit in the bleed')
    .default(defaults.glow ?? 12),
  glowPulses: z.number().int().min(0).max(16)
    .describe('How many times the glow pulses per cycle; 0 keeps it steady')
    .default(defaults.glowPulses ?? 0),
  glowStrength: z.number().finite().min(0.25).max(3)
    .describe('Glow intensity: multiplies its opacity (1 = normal); the reach does not change')
    .default(defaults.glowStrength ?? 1),
});

export type HaloDefaults = Partial<{halo: number; haloColor: string}>;

/** An outer glow around the whole panel (chat, block) or frame (border); it lives in the bleed. */
export const haloFields = (defaults: HaloDefaults = {}) => ({
  halo: z.number().finite().min(0).max(128)
    .describe('Reach of the halo around the panel, in px; it must fit in the bleed')
    .default(defaults.halo ?? 0),
  haloColor: zColor().default(defaults.haloColor ?? '#67E8F9'),
});

/**
 * A 1 px highlight just inside the top edge, fading out down the sides: the bevel a sheet of
 * glass catches from above. It lies between the stroke and the padding, never over the content.
 */
export const rimLightField = (defaultValue = 0) => z.number().finite().min(0).max(1)
  .describe('1 px glint just inside the top edge, fading along the sides (glass), from 0 to 1; 0 turns it off')
  .default(defaultValue);
