import {bundle} from '@remotion/bundler';
import {renderFrames, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {rmSync} from 'node:fs';
import {access, link, mkdir, mkdtemp, readdir, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getAsset, getLayoutOf, getMotionOf, getOpenGlRenderer, type CatalogEntry} from '../src/catalog';
import {kindPolicies} from '../src/kinds';
import type {AssetLayout} from '../src/overlays/shared/box';
import type {AssetMotion} from '../src/overlays/shared/motion';
import {getCompositionMetadata, getExportPreset, hasAlpha, type OutputFormat} from '../src/settings';
import {assetFileName, sizeTag} from '../src/sizes';
import {pruneWebpackCache} from './clean-plan';
import {ffmpegPath, runProcess} from './process';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const createBundle = () => {
  pruneWebpackCache(projectRoot);
  return bundle({
    entryPoint: path.join(projectRoot, 'src/index.ts'),
    outDir: path.join(projectRoot, '.cache/bundle'),
  });
};

/** Prefix of the per-export scratch directory; cleanup only ever removes a directory with it. */
export const SCRATCH_PREFIX = '.asset-render-';

/** Every scratch directory under `root`, at any depth: an interrupted export's partial files, never valid output. */
export const findScratchDirectories = async (root: string): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(root, {withFileTypes: true});
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    if (entry.name.startsWith(SCRATCH_PREFIX)) found.push(full);
    else found.push(...await findScratchDirectories(full));
  }
  return found;
};

/** Removes the scratch directories interrupted exports left under each root; returns what it removed. */
export const removeScratchDirectories = async (roots: readonly string[]) => {
  const found = (await Promise.all(roots.map(findScratchDirectories))).flat();
  for (const directory of found) await rm(directory, {recursive: true, force: true});
  return found;
};

type ExitTarget = {
  on: (event: 'exit' | 'SIGINT' | 'SIGTERM', listener: () => void) => unknown;
  off: (event: 'exit' | 'SIGINT' | 'SIGTERM', listener: () => void) => unknown;
  exit: (code: number) => void;
};

/**
 * Ctrl+C exits without unwinding (Remotion's SIGINT handler calls process.exit mid-render; Node's
 * default does the same elsewhere), so a `finally` never runs: remove the scratch directory
 * synchronously on exit instead, and turn SIGINT/SIGTERM into a normal exit. Returns the undo.
 */
export const guardScratch = (scratch: string, target: ExitTarget = process) => {
  const cleanup = () => rmSync(scratch, {recursive: true, force: true});
  const onInterrupt = () => target.exit(130);
  const onTerminate = () => target.exit(143);
  target.on('exit', cleanup);
  target.on('SIGINT', onInterrupt);
  target.on('SIGTERM', onTerminate);
  return () => {
    target.off('exit', cleanup);
    target.off('SIGINT', onInterrupt);
    target.off('SIGTERM', onTerminate);
  };
};

export type ExportOptions = {
  compositionId: string;
  format: OutputFormat;
  props?: Record<string, unknown>;
  output?: string;
  /** The --props file's name without .json: a background without --out is named after it. */
  propsName?: string;
  overwrite?: boolean;
  serveUrl?: string;
  /** PNG only: which frame of the loop becomes the still (default 0). */
  frame?: number;
  /**
   * Where the scratch directory is made (default: next to the output). Packs keep it out of the
   * pack folder; it must be on the output's filesystem, since the result is linked or renamed.
   */
  scratchDirectory?: string;
  onProgress?: (message: string) => void;
};

/** Guides are a Studio aid; a sold file must never carry them. */
export const assertExportable = (props: Record<string, unknown>) => {
  if (props.guides === true) throw new Error('Turn guides off to export.');
};

/** The still's frame: only PNG takes one, and it must exist inside the loop (0…N−1). */
export const resolveFrame = (format: OutputFormat, frame: number | undefined, durationInFrames: number) => {
  if (format !== 'png') {
    if (frame !== undefined) throw new Error('Use --frame only with --format png.');
    return null;
  }
  const still = frame ?? 0;
  if (!Number.isInteger(still) || still < 0 || still >= durationInFrames) {
    throw new Error(`The frame must be an integer from 0 to ${durationInFrames - 1}.`);
  }
  return still;
};

const defaultOutput = (asset: CatalogEntry, props: Record<string, unknown>, format: OutputFormat, preset?: string) =>
  path.join(projectRoot, 'out', assetFileName({id: asset.id, kind: asset.kind, props, format, preset}));

/** The sidecar lives next to the file and names it, so each format gets its own. */
export const sidecarPath = (output: string) => `${output}.json`;

/** Placement data for tools and pack manifests (keys in English/CSS style). */
export const buildSidecar = ({output, asset, props, layout, fps, durationInFrames, format, frame}: {
  output: string; asset: CatalogEntry; props: Record<string, unknown> & {transparent: boolean; outputFormat: OutputFormat};
  layout: AssetLayout; fps: number; durationInFrames: number; format: OutputFormat; frame: number | null;
}) => {
  const motion = getMotionOf(asset)?.(props) ?? null;
  return {
    file: path.basename(output),
    kind: asset.kind,
    size: sizeTag(asset.kind, props),
    canvas: layout.canvas,
    box: layout.box,
    content: layout.content,
    hole: layout.hole ?? null,
    // Only kinds with a title area report one, so the other sidecars keep their exact shape.
    ...(layout.header ? {header: layout.header} : {}),
    bleed: typeof props.bleed === 'number' ? props.bleed : 0,
    fps,
    frames: format === 'png' ? 1 : durationInFrames,
    ...(frame === null ? {} : {frame}),
    format,
    alpha: hasAlpha(props),
    // The speeds the file shows, rounded to whole periods per cycle: they can differ from the props.
    ...(motion ? {motion} : {}),
    // No `mask` here: a single export never renders the OBS mask. The pack plans each mask and links it in its manifest.
    props,
  };
};

/** The speeds actually shown, since whole periods per cycle round the requested ones. */
export const motionText = ({strokeSpeed, fillSpeed}: AssetMotion) =>
  `Actual speed: stroke ${strokeSpeed} px/s, fill ${fillSpeed} px/s (rounded to whole periods per cycle).`;

export const resolveExport = (options: ExportOptions) => {
  const asset = getAsset(options.compositionId);
  const requestedProps = {...options.props, outputFormat: options.format};
  const props = asset.schema.strict().parse(requestedProps);
  assertExportable(props);
  const frame = resolveFrame(options.format, options.frame, getCompositionMetadata(props).durationInFrames);
  // Keep defaults out of inputProps so saved Studio defaults can take effect.
  const inputProps = Object.fromEntries(Object.entries(props).filter(([key]) => key in requestedProps));
  const output = path.resolve(options.output ?? defaultOutput(asset, props, options.format, options.propsName));
  if (path.extname(output).toLowerCase() !== `.${options.format}`) {
    throw new Error(`The output needs the .${options.format} extension.`);
  }
  const chromiumOptions = {gl: getOpenGlRenderer(asset)};
  const sidecar = getLayoutOf(asset) ? sidecarPath(output) : null;
  return {asset, props, inputProps, output, sidecar, frame, preset: getExportPreset(props), chromiumOptions};
};

/**
 * Publishes each [from, to] pair in order and removes the ones already published if a later one
 * fails. Callers put the video last: its presence is what resumable builds take as "done", so an
 * existing video always has its sidecar next to it.
 */
export const publishInOrder = async (
  pairs: readonly (readonly [string, string])[],
  publish: (from: string, to: string) => Promise<void>,
  remove: (file: string) => Promise<void> = (file) => rm(file, {force: true}),
) => {
  const published: string[] = [];
  try {
    for (const [from, to] of pairs) {
      await publish(from, to);
      published.push(to);
    }
  } catch (error) {
    for (const file of published.reverse()) await remove(file).catch(() => undefined);
    throw error;
  }
};

const assertMissing = async (file: string) => {
  try {
    await access(file);
    throw new Error(`The file already exists: ${file}. Use --overwrite to replace it.`);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
};

export const exportAsset = async (options: ExportOptions) => {
  const resolved = resolveExport(options);
  const {asset, inputProps, chromiumOptions} = resolved;
  const log = options.onProgress ?? console.log;
  // Sized names depend on props the saved Studio defaults may still change: check those after selectComposition.
  const nameIsFinal = options.output !== undefined || kindPolicies[asset.kind].fixedSize !== null;
  if (!options.overwrite && nameIsFinal) {
    await assertMissing(resolved.output);
    if (resolved.sidecar) await assertMissing(resolved.sidecar);
  }
  // Detect missing GIF encoder before spending time rendering hundreds of PNGs.
  if (options.format === 'gif') await runProcess(ffmpegPath(), ['-version']);
  const serveUrl = options.serveUrl ?? await createBundle();
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE;
  const composition = await selectComposition({serveUrl, id: asset.id, inputProps, browserExecutable, chromiumOptions});
  const props = asset.schema.strict().parse(composition.props);
  // Saved Studio defaults take part only now: check them like the requested props.
  assertExportable(props);
  const frame = resolveFrame(options.format, options.frame, composition.durationInFrames);
  const preset = getExportPreset(props);
  // A saved Studio size can differ from the schema default the early name was based on.
  const output = options.output ? resolved.output : path.resolve(defaultOutput(asset, props, options.format, options.propsName));
  const layout = getLayoutOf(asset)?.(props) ?? null;
  const sidecar = layout ? sidecarPath(output) : null;
  if (layout && (layout.canvas.width !== composition.width || layout.canvas.height !== composition.height)) {
    throw new Error(`The layout describes ${layout.canvas.width}×${layout.canvas.height}, but the composition is ${composition.width}×${composition.height}.`);
  }
  if (!options.overwrite && !nameIsFinal) {
    await assertMissing(output);
    if (sidecar) await assertMissing(sidecar);
  }
  log(`${asset.id}: ${composition.width}×${composition.height}, ${composition.fps} fps, ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(3)} s).`);
  if (props.transparent && !hasAlpha(props)) log(`Transparency composited over ${props.backgroundColor}.`);
  const motion = getMotionOf(asset)?.(props) ?? null;
  if (motion) log(motionText(motion));
  await mkdir(path.dirname(output), {recursive: true});
  // An isolated directory (beside the output unless told otherwise); partial exports are never published.
  const scratchParent = options.scratchDirectory ? path.resolve(options.scratchDirectory) : path.dirname(output);
  await mkdir(scratchParent, {recursive: true});
  const scratch = await mkdtemp(path.join(scratchParent, SCRATCH_PREFIX));
  const releaseScratch = guardScratch(scratch);
  const temporaryOutput = path.join(scratch, `render.${options.format}`);
  let lastProgress = -1;
  const progress = (fraction: number) => {
    const percent = Math.min(100, Math.floor(fraction * 10) * 10);
    if (percent > lastProgress) {lastProgress = percent; log(`Render: ${percent}%`);}
  };
  const publish = async (from: string, to: string) => {
    if (options.overwrite) await rename(from, to);
    else await link(from, to);
  };
  try {
    // Everything the sidecar needs is known now; writing it first means a full disk fails before rendering.
    const temporarySidecar = path.join(scratch, 'render.json');
    if (layout) {
      const data = buildSidecar({
        output, asset, props, layout, fps: composition.fps, durationInFrames: composition.durationInFrames,
        format: options.format, frame,
      });
      await writeFile(temporarySidecar, `${JSON.stringify(data, null, 2)}\n`);
    }
    if (frame !== null) {
      // The still keeps alpha exactly when the shared rule says so: Canvas paints no backdrop then.
      await renderStill({
        serveUrl, composition, inputProps: props, browserExecutable, chromiumOptions,
        frame, imageFormat: 'png', output: temporaryOutput, logLevel: 'error',
      });
      progress(1);
    } else if (preset.codec === 'gif') {
      const framesDirectory = path.join(scratch, 'frames');
      await renderFrames({
        serveUrl, composition, inputProps: props, browserExecutable, chromiumOptions,
        outputDir: framesDirectory, imageFormat: 'png', muted: true,
        concurrency: 2, logLevel: 'error',
        onStart: () => undefined,
        onFrameUpdate: (count) => progress(count / composition.durationInFrames),
      });
      const frames = (await readdir(framesDirectory)).filter((name) => name.endsWith('.png')).sort();
      const match = /^(.*?)(\d+)\.png$/.exec(frames[0] ?? '');
      if (!match || frames.length !== composition.durationInFrames) throw new Error('The PNG sequence is incomplete.');
      const inputPattern = path.join(framesDirectory, `${match[1]}%0${match[2].length}d.png`);
      const palette = path.join(scratch, 'palette.png');
      const input = ['-framerate', String(composition.fps), '-start_number', String(Number(match[2])), '-i', inputPattern];
      log('GIF: computing a global 256-color palette…');
      await runProcess(ffmpegPath(), [
        '-hide_banner', '-loglevel', 'error', '-y', ...input,
        '-vf', 'palettegen=stats_mode=full:max_colors=256:reserve_transparent=0',
        '-frames:v', '1', '-update', '1', palette,
      ]);
      log('GIF: applying dithering and infinite looping…');
      await runProcess(ffmpegPath(), [
        '-hide_banner', '-loglevel', 'error', '-y', ...input, '-i', palette,
        '-lavfi', 'paletteuse=dither=sierra2_4a', '-an', '-loop', '0',
        '-frames:v', String(composition.durationInFrames), temporaryOutput,
      ]);
    } else if (preset.codec !== null) {
      await renderMedia({
        serveUrl, composition, inputProps: props, browserExecutable, chromiumOptions,
        ...preset, outputLocation: temporaryOutput, muted: true,
        // Also required for ProRes: the VideoToolbox encoder cannot write yuva444p10le.
        hardwareAcceleration: 'disable', concurrency: 2,
        // One encoding pass also avoids alpha differences across independently encoded chunks.
        disallowParallelEncoding: true, logLevel: 'error',
        onProgress: ({progress: fraction}) => progress(fraction),
      });
    }
    await publishInOrder([
      ...(sidecar ? [[temporarySidecar, sidecar] as const] : []),
      [temporaryOutput, output] as const,
    ], publish);
    log(`Exported: ${output}`);
    return {output, sidecar, props, composition};
  } finally {
    releaseScratch();
    // Only remove the exact mkdtemp directory created by this invocation.
    const relative = path.relative(scratchParent, scratch);
    if (relative.startsWith(SCRATCH_PREFIX) && !relative.includes(path.sep)) {
      await rm(scratch, {recursive: true, force: true});
    }
  }
};
