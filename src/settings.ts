import {zColor} from '@remotion/zod-types';
import {z} from 'zod';

z.config(z.locales.ptBR());

export const outputFormatSchema = z.enum(['mp4', 'webm', 'gif']);
export type OutputFormat = z.infer<typeof outputFormatSchema>;

export const baseBackgroundSchema = z.object({
  durationSeconds: z.number().finite().positive().default(8).describe('Duração do ciclo, em segundos'),
  seed: z.number().int().safe().default(1).describe('Seed da distribuição'),
  transparent: z.boolean().default(false).describe('Alpha no WebM'),
  backgroundColor: zColor().regex(/^#[0-9a-f]{6}$/i, 'Use uma cor opaca no formato #RRGGBB.').default('#0B0F19'),
  colors: z.array(zColor()).min(2).max(6).default(['#67E8F9', '#818CF8', '#F472B6']),
  outputFormat: outputFormatSchema.default('webm').describe('Formato do preview e do export'),
});

export type BaseBackgroundProps = z.infer<typeof baseBackgroundSchema>;

export const hasTransparentBackground = (
  props: Pick<BaseBackgroundProps, 'transparent' | 'outputFormat'>,
) => props.transparent && props.outputFormat === 'webm';

export const getCompositionMetadata = (
  props: Pick<BaseBackgroundProps, 'durationSeconds' | 'outputFormat'>,
) => {
  const fps = props.outputFormat === 'gif' ? 50 : 60;
  const durationInFrames = Math.max(1, Math.round(props.durationSeconds * fps));
  if (!Number.isFinite(props.durationSeconds) || props.durationSeconds <= 0 || !Number.isSafeInteger(durationInFrames)) {
    throw new Error('A duração deve ser positiva e produzir um número seguro de frames.');
  }
  return {width: 1920, height: 1080, fps, durationInFrames};
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
      return {codec: 'vp9', imageFormat, pixelFormat: hasTransparentBackground(props) ? 'yuva420p' : 'yuv420p', crf: 0} as const;
    case 'gif':
      return {codec: 'gif', imageFormat, numberOfGifLoops: null} as const;
  }
};
