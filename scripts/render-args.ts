import {parseArgs} from 'node:util';
import {assetCatalog, getAsset} from '../src/catalog';
import {ASSET_KINDS, getKindPolicy, kindPolicies, type AssetKind} from '../src/kinds';
import {outputFormatSchema} from '../src/settings';
import {canvasOf, getSize, sizeProps, sizesForKind} from '../src/sizes';
import type {ExportOptions} from './export';

export const HELP_TEXT = `usage: npm run render:<webm|mov|png|mp4|gif> -- <composition> [options]

Options:
  --props file.json      saved parameters (the command's format wins over the JSON)
  --size <id>            catalog size (chat, text boxes and borders); see --list
  --width <px>           box width, even (chat, text boxes and borders)
  --height <px>          box height, even (chat, text boxes and borders)
  --bleed <px>           transparent margin for the glow, even (chat, text boxes and borders)
  --frame <n>            PNG frame (default 0)
  --duration <seconds>   loop duration
  --seed <integer>       distribution seed
  --out <path>           output file
  --overwrite            replaces an existing file
  --list                 lists the compositions and the sizes by kind

The command's format wins over the JSON.`;

export const renderCliOptions = {
  format: {type: 'string', default: 'webm'},
  props: {type: 'string'}, out: {type: 'string'},
  duration: {type: 'string'}, seed: {type: 'string'},
  size: {type: 'string'}, width: {type: 'string'}, height: {type: 'string'}, bleed: {type: 'string'},
  frame: {type: 'string'},
  overwrite: {type: 'boolean', default: false},
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
    output: values.out, overwrite: values.overwrite,
  };
};
