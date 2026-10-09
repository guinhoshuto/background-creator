import path from 'node:path';
import {parseArgs} from 'node:util';
import {assetCatalog, getAsset, getLayoutOf} from '../src/catalog';
import {ASSET_KINDS, getKindPolicy, kindPolicies, type AssetKind} from '../src/kinds';
import {exportProfileSchema, getCompositionMetadata, outputFormatSchema} from '../src/settings';
import {canvasOf, getSize, sizeProps, sizesForKind} from '../src/sizes';
import {FREE_SPACE_HINT, assertCanStart, frameScratchBytes, gibibytes} from './disk';
import type {ExportOptions} from './export';
import {diskNeed, estimateFile, sizeText} from './pack-estimate';

export const HELP_TEXT = `usage: npm run render:<webm|mov|png|mp4|gif> -- <composition> [options]

Options:
  --props file.json      saved parameters (the command's format wins over the JSON)
  --size <id>            catalog size (chat, text boxes and borders); see --list
  --width <px>           box width, even (chat, text boxes and borders)
  --height <px>          box height, even (chat, text boxes and borders)
  --bleed <px>           transparent margin for the glow, even (chat, text boxes and borders)
  --frame <n>            PNG frame (default 0)
  --profile <name>       master (default: near lossless, heavy) or delivery (smaller WebM and MP4;
                         MOV, GIF and PNG are the same in both)
  --duration <seconds>   loop duration
  --seed <integer>       distribution seed
  --out <path>           output file
  --overwrite            replaces an existing file
  --dry-run              prints the file, its estimated size and the disk it needs, and says whether
                         the disk floor would refuse it; renders nothing and does not wait for the slot
  --list                 lists the compositions and the sizes by kind

The command's format wins over the JSON.`;

export const renderCliOptions = {
  format: {type: 'string', default: 'webm'},
  props: {type: 'string'}, out: {type: 'string'},
  duration: {type: 'string'}, seed: {type: 'string'},
  size: {type: 'string'}, width: {type: 'string'}, height: {type: 'string'}, bleed: {type: 'string'},
  frame: {type: 'string'}, profile: {type: 'string', default: 'master'},
  overwrite: {type: 'boolean', default: false}, 'dry-run': {type: 'boolean', default: false},
  list: {type: 'boolean'}, help: {type: 'boolean', short: 'h'},
} as const;

export const parseRenderArgs = (args: string[]) =>
  parseArgs({args, allowPositionals: true, options: renderCliOptions});

export type RenderValues = ReturnType<typeof parseRenderArgs>['values'];

/** Compositions and sizes grouped by kind, headed by the kind labels. */
export const listText = () => ASSET_KINDS.map((kind) => {
  const policy = kindPolicies[kind];
  const ids = Object.values(assetCatalog).filter((entry) => entry.kind === kind).map((entry) => `  ${entry.id}`);
  const lines = [`${policy.label} (${kind}):`, ...(ids.length > 0 ? ids : ['  (no compositions yet)'])];
  if (policy.fixedSize) {
    lines.push(`  Fixed size: ${policy.fixedSize.width}×${policy.fixedSize.height}.`);
  } else {
    lines.push('  Sizes (--size):');
    for (const size of sizesForKind(kind)) {
      const canvas = canvasOf(size);
      lines.push(`    ${size.id}: box ${size.width}×${size.height}, file ${canvas.width}×${canvas.height}; ${size.use}`);
    }
  }
  return lines.join('\n');
}).join('\n\n');

/** The props patch a named size stands for; refuses sizes of another kind and fixed-size kinds. */
export const expandSize = (kind: AssetKind, sizeId: string): Record<string, unknown> => {
  const policy = getKindPolicy(kind);
  if (policy.fixedSize) {
    throw new Error(`${policy.label} have a fixed size (${policy.fixedSize.width}×${policy.fixedSize.height}): --size, --width, --height and --bleed only apply to chat, text boxes and borders.`);
  }
  const size = getSize(sizeId);
  if (size.kind !== kind) {
    const options = sizesForKind(kind).map((entry) => entry.id).join(', ');
    throw new Error(`Size ${sizeId} is for ${kindPolicies[size.kind].label.toLowerCase()}, not ${policy.label.toLowerCase()}. Options: ${options}.`);
  }
  return sizeProps(size);
};

/** The --profile value, refused with the options when unknown. */
export const parseProfile = (value: string | undefined) => {
  const result = exportProfileSchema.safeParse(value ?? 'master');
  if (!result.success) {
    throw new Error(`Unknown --profile ${value}. Use ${exportProfileSchema.options.join(' or ')} (default master).`);
  }
  return result.data;
};

const numeric = (value: string | undefined, key: string) => (value === undefined ? {} : {[key]: Number(value)});

/** Turns the parsed command line (and the JSON file's content) into export options, without I/O. */
export const buildExportOptions = (
  {values, positionals}: {values: RenderValues; positionals: string[]},
  rawProps: unknown = {},
): ExportOptions => {
  if (positionals.length === 0) throw new Error('Name the composition. Use --list to see the options.');
  if (positionals.length > 1) throw new Error('Name only one composition. Use --help.');
  if (rawProps === null || Array.isArray(rawProps) || typeof rawProps !== 'object') {
    throw new Error('The parameters file must hold a JSON object.');
  }
  const asset = getAsset(positionals[0]!);
  const policy = getKindPolicy(asset.kind);
  const sizeFlags = [values.size, values.width, values.height, values.bleed].some((value) => value !== undefined);
  if (policy.fixedSize && sizeFlags) expandSize(asset.kind, values.size ?? '');
  return {
    compositionId: asset.id,
    format: outputFormatSchema.parse(values.format),
    // Precedence: JSON file < named size < explicit numeric flags.
    props: {
      ...rawProps,
      ...(values.size === undefined ? {} : expandSize(asset.kind, values.size)),
      ...numeric(values.width, 'width'),
      ...numeric(values.height, 'height'),
      ...numeric(values.bleed, 'bleed'),
      ...numeric(values.duration, 'durationSeconds'),
      ...numeric(values.seed, 'seed'),
    },
    ...(values.frame === undefined ? {} : {frame: Number(values.frame)}),
    profile: parseProfile(values.profile),
    output: values.out, overwrite: values.overwrite,
    ...(values.props === undefined ? {} : {propsName: path.basename(values.props, path.extname(values.props))}),
  };
};

/**
 * The file a render writes, as the disk floor needs it (format, canvas, frames), from the requested
 * props and the schema defaults, without opening the bundle. Saved Studio defaults may still change
 * it inside the render; the floor is checked before that.
 */
export const plannedRender = (options: ExportOptions) => {
  const asset = getAsset(options.compositionId);
  const props = asset.schema.strict().parse({...options.props, outputFormat: options.format});
  const canvas = getLayoutOf(asset)?.(props).canvas ?? getKindPolicy(asset.kind).fixedSize;
  if (!canvas) throw new Error(`${asset.id} does not report its file size.`);
  const {durationInFrames} = getCompositionMetadata({durationSeconds: props.durationSeconds as number, outputFormat: options.format});
  return {format: options.format, canvas, frames: durationInFrames};
};

/**
 * What --dry-run prints: the file, its size estimate and what the render takes from the disk.
 * The size comes from the master render measured for packs (pack-estimate.ts), so under delivery
 * it reads as an upper bound; a format never measured says so and counts only its frames.
 */
export const renderDryRunText = (
  {options, planned, directory}: {options: ExportOptions; planned: ReturnType<typeof plannedRender>; directory: string},
) => {
  const file = estimateFile(planned);
  const profile = options.profile ?? 'master';
  const sizeLine = file === null
    ? `  file size: not estimated (no measured ${planned.format} render yet)`
    : `  file size: ${sizeText(file.bytes)}${profile === 'master' || !['webm', 'mp4'].includes(planned.format) ? '' : ' at most (measured on master renders)'}`;
  return [
    `${options.compositionId}: ${planned.format}, ${planned.canvas.width}×${planned.canvas.height}, ${planned.frames} ${planned.frames === 1 ? 'frame' : 'frames'}, profile ${profile}`,
    `  output: ${options.output ?? `${directory}/ (named when it renders)`}`,
    sizeLine,
    `  disk while rendering: up to ${gibibytes(diskNeed(planned))} (frames before the encode: ${gibibytes(frameScratchBytes(planned))})`,
  ].join('\n');
};

/** Every side effect of `npm run render:*`, injected so the flow is tested without rendering. */
export type RenderEffects = {
  readProps: (file: string) => Promise<unknown>;
  /** Free bytes on the disk that holds `directory`. */
  freeBytes: (directory: string) => number;
  exportAsset: (options: ExportOptions) => Promise<unknown>;
  /** Runs `task` holding the machine-wide render slot. */
  withRenderSlot: (task: () => Promise<void>) => Promise<void>;
  log: (message: string) => void;
};

/**
 * The whole `npm run render:*` command. The disk is checked once the render slot is held, before
 * the bundle opens: a render
 * that fills the disk halfway leaves a broken file on a Mac that barely answers.
 * `defaultOutDirectory` is where the file goes without --out.
 */
export const runRender = async (args: string[], {defaultOutDirectory, effects}: {defaultOutDirectory: string; effects: RenderEffects}) => {
  const {values, positionals} = parseRenderArgs(args);
  if (values.help) {effects.log(HELP_TEXT); return;}
  if (values.list) {effects.log(listText()); return;}
  const rawProps = values.props ? await effects.readProps(values.props) : {};
  const options = buildExportOptions({values, positionals}, rawProps);
  const directory = options.output === undefined ? defaultOutDirectory : path.dirname(path.resolve(options.output));
  // The frames kept before the encode count, not only the file: 1080p for 12 s keeps over 1 GiB.
  const need = diskNeed(plannedRender(options));
  const where = path.relative(process.cwd(), directory) || '.';
  if (values['dry-run']) {
    effects.log(renderDryRunText({options, planned: plannedRender(options), directory: where}));
    const free = effects.freeBytes(directory);
    try {
      assertCanStart({free, estimate: need, where, then: FREE_SPACE_HINT});
    } catch (error) {
      throw new Error(`Dry run: this render would be refused. ${error instanceof Error ? error.message : String(error)}`);
    }
    effects.log(`  free in ${where}: ${gibibytes(free)}; the disk floor lets it start.`);
    return;
  }
  // Measured inside the slot: a render that waited hours for another one sees the disk it left.
  await effects.withRenderSlot(async () => {
    assertCanStart({free: effects.freeBytes(directory), estimate: need, where, then: FREE_SPACE_HINT});
    await effects.exportAsset(options);
  });
};
