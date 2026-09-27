import {zColor} from '@remotion/zod-types';
import {z} from 'zod';

z.config(z.locales.ptBR());

export const outputFormatSchema = z.enum(['mp4', 'webm', 'gif', 'mov', 'png']);
export type OutputFormat = z.infer<typeof outputFormatSchema>;

/** Formats whose files carry an alpha channel; MP4 and GIF always composite over backgroundColor. */
export const ALPHA_FORMATS: readonly OutputFormat[] = ['webm', 'mov', 'png'];

/** Every composition renders at 1920×1080 unless its props carry their own canvas size. */
export const DEFAULT_SIZE = {width: 1920, height: 1080} as const;

export const baseBackgroundSchema = z.object({
  durationSeconds: z.number().finite().positive().default(8).describe('Duração do ciclo, em segundos'),
  seed: z.number().int().safe().default(1).describe('Seed da distribuição'),
  transparent: z.boolean().default(false).describe('Alpha no WebM, MOV e PNG'),
  backgroundColor: zColor().regex(/^#[0-9a-f]{6}$/i, 'Use uma cor opaca no formato #RRGGBB.').default('#0B0F19'),
  colors: z.array(zColor()).min(2).max(6).default(['#67E8F9', '#818CF8', '#F472B6']),
  outputFormat: outputFormatSchema.default('webm').describe('Formato do preview e do export'),
});

export type BaseBackgroundProps = z.infer<typeof baseBackgroundSchema>;

/** The one alpha rule shared by the Studio preview and every exporter. */
export const hasAlpha = (
  props: Pick<BaseBackgroundProps, 'transparent' | 'outputFormat'>,
) => props.transparent && ALPHA_FORMATS.includes(props.outputFormat);

/** Historical name kept for the backgrounds; same rule as hasAlpha. */
export const hasTransparentBackground = hasAlpha;

/**
 * Remotion rounds odd H.264 sizes down without a warning, which would shrink the file behind
 * the user's back; every pixel dimension is therefore an even integer, for every format.
 */
export const evenPx = (field: string, {min, max}: {min: number; max: number}) =>
  z.number()
    .int()
    .min(min)
    .max(max)
    .multipleOf(2, `${field} precisa ser par: o H.264 corta 1 px de dimensões ímpares sem avisar.`);

export const getCompositionMetadata = (
  props: Pick<BaseBackgroundProps, 'durationSeconds' | 'outputFormat'>,
  // Overlays pass their canvas (box + 2·bleed); backgrounds keep the full-HD default.
  size: {width: number; height: number} = DEFAULT_SIZE,
) => {
  const fps = props.outputFormat === 'gif' ? 50 : 60;
  const durationInFrames = Math.max(1, Math.round(props.durationSeconds * fps));
  if (!Number.isFinite(props.durationSeconds) || props.durationSeconds <= 0 || !Number.isSafeInteger(durationInFrames)) {
    throw new Error('A duração deve ser positiva e produzir um número seguro de frames.');
  }
  return {width: size.width, height: size.height, fps, durationInFrames};
};

/** One source of truth for Studio codec defaults and the official exporter. */
export const getExportPreset = (
  props: Pick<BaseBackgroundProps, 'outputFormat' | 'transparent'>,
) => {
  const imageFormat = 'png' as const;
  switch (props.outputFormat) {
    case 'mp4':
      return {codec: 'h264', imageFormat, pixelFormat: 'yuv420p', crf: 1, x264Preset: 'veryslow'} as const;
    case 'webm':
      return {codec: 'vp9', imageFormat, pixelFormat: hasAlpha(props) ? 'yuva420p' : 'yuv420p', crf: 0} as const;
    case 'gif':
      return {codec: 'gif', imageFormat, numberOfGifLoops: null} as const;
    case 'mov':
      // ProRes 4444 keeps full chroma and a 10-bit alpha plane for video editors.
      return {codec: 'prores', imageFormat, proResProfile: '4444', pixelFormat: hasAlpha(props) ? 'yuva444p10le' : 'yuv444p10le'} as const;
    case 'png':
      // A single still rendered with renderStill: there is no video codec to choose.
      return {codec: null, imageFormat} as const;
  }
};

