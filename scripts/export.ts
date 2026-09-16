import {bundle} from '@remotion/bundler';
import {renderFrames, renderMedia, selectComposition} from '@remotion/renderer';
import {access, link, mkdir, mkdtemp, readdir, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getBackground} from '../src/catalog';
import {getExportPreset, type OutputFormat} from '../src/settings';
import {ffmpegPath, runProcess} from './process';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const createBundle = () => bundle({
  entryPoint: path.join(projectRoot, 'src/index.ts'),
  outDir: path.join(projectRoot, '.cache/bundle'),
});

export type ExportOptions = {
  compositionId: string;
  format: OutputFormat;
  props?: Record<string, unknown>;
  output?: string;
  overwrite?: boolean;
  serveUrl?: string;
  onProgress?: (message: string) => void;
};

export const resolveExport = (options: ExportOptions) => {
  const background = getBackground(options.compositionId);
  if (!background) throw new Error(`Composição desconhecida: ${options.compositionId}. Use --list.`);
  const requestedProps = {...options.props, outputFormat: options.format};
  const props = background.schema.strict().parse(requestedProps);
  // Keep defaults out of inputProps so saved Studio defaults can take effect.
  const inputProps = Object.fromEntries(Object.entries(props).filter(([key]) => key in requestedProps));
  const output = path.resolve(options.output ?? path.join(projectRoot, 'out', `${background.id}.${options.format}`));
  if (path.extname(output).toLowerCase() !== `.${options.format}`) {
    throw new Error(`O destino precisa ter a extensão .${options.format}.`);
  }
  return {background, props, inputProps, output, preset: getExportPreset(props)};
};

export const exportBackground = async (options: ExportOptions) => {
  const {background, inputProps, output} = resolveExport(options);
  const log = options.onProgress ?? console.log;
  if (!options.overwrite) {
    try {
      await access(output);
      throw new Error(`O arquivo já existe: ${output}. Use --overwrite para substituí-lo.`);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  // Detect missing GIF encoder before spending time rendering hundreds of PNGs.
  if (options.format === 'gif') await runProcess(ffmpegPath(), ['-version']);
  const serveUrl = options.serveUrl ?? await createBundle();
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE;
  const composition = await selectComposition({serveUrl, id: background.id, inputProps, browserExecutable});
  const props = background.schema.strict().parse(composition.props);
  const preset = getExportPreset(props);
  log(`${background.id}: ${composition.width}×${composition.height}, ${composition.fps} fps, ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(3)} s).`);
  if (props.transparent && options.format !== 'webm') log(`Transparência composta sobre ${props.backgroundColor}.`);
  await mkdir(path.dirname(output), {recursive: true});
  // This isolated directory lives beside the final output; partial exports are never published.
  const scratch = await mkdtemp(path.join(path.dirname(output), '.background-render-'));
  const temporaryOutput = path.join(scratch, `render.${options.format}`);
  let lastProgress = -1;
  const progress = (fraction: number) => {
    const percent = Math.min(100, Math.floor(fraction * 10) * 10);
    if (percent > lastProgress) {lastProgress = percent; log(`Render: ${percent}%`);}
  };
  try {
    if (preset.codec === 'gif') {
      const framesDirectory = path.join(scratch, 'frames');
      await renderFrames({
        serveUrl, composition, inputProps: props, browserExecutable,
        outputDir: framesDirectory, imageFormat: 'png', muted: true,
        concurrency: 2, logLevel: 'error',
        onStart: () => undefined,
        onFrameUpdate: (count) => progress(count / composition.durationInFrames),
      });
      const frames = (await readdir(framesDirectory)).filter((name) => name.endsWith('.png')).sort();
      const match = /^(.*?)(\d+)\.png$/.exec(frames[0] ?? '');
      if (!match || frames.length !== composition.durationInFrames) throw new Error('A sequência PNG está incompleta.');
      const inputPattern = path.join(framesDirectory, `${match[1]}%0${match[2].length}d.png`);
      const palette = path.join(scratch, 'palette.png');
      const input = ['-framerate', String(composition.fps), '-start_number', String(Number(match[2])), '-i', inputPattern];
      log('GIF: calculando paleta global de 256 cores…');
      await runProcess(ffmpegPath(), [
        '-hide_banner', '-loglevel', 'error', '-y', ...input,
        '-vf', 'palettegen=stats_mode=full:max_colors=256:reserve_transparent=0',
        '-frames:v', '1', '-update', '1', palette,
      ]);
      log('GIF: aplicando dithering e repetição infinita…');
      await runProcess(ffmpegPath(), [
        '-hide_banner', '-loglevel', 'error', '-y', ...input, '-i', palette,
        '-lavfi', 'paletteuse=dither=sierra2_4a', '-an', '-loop', '0',
        '-frames:v', String(composition.durationInFrames), temporaryOutput,
      ]);
    } else {
      await renderMedia({
        serveUrl, composition, inputProps: props, browserExecutable,
        ...preset, outputLocation: temporaryOutput, muted: true,
        hardwareAcceleration: 'disable', concurrency: 2,
        // One encoding pass also avoids alpha differences across independently encoded chunks.
        disallowParallelEncoding: true, logLevel: 'error',
        onProgress: ({progress: fraction}) => progress(fraction),
      });
    }
    if (options.overwrite) await rename(temporaryOutput, output);
    else await link(temporaryOutput, output);
    log(`Exportado: ${output}`);
    return {output, props, composition};
  } finally {
    // Only remove the exact mkdtemp directory created by this invocation.
    const relative = path.relative(path.dirname(output), scratch);
    if (relative.startsWith('.background-render-') && !relative.includes(path.sep)) {
      await rm(scratch, {recursive: true, force: true});
    }
  }
};
