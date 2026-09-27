import {parseArgs} from 'node:util';
import {assetCatalog, getAsset} from '../src/catalog';
import {ASSET_KINDS, getKindPolicy, kindPolicies, type AssetKind} from '../src/kinds';
import {outputFormatSchema} from '../src/settings';
import {canvasOf, getSize, sizeProps, sizesForKind} from '../src/sizes';
import type {ExportOptions} from './export';

export const HELP_TEXT = `npm run render:<webm|mov|png|mp4|gif> -- <composição> [opções]

Opções:
  --props arquivo.json   parâmetros salvos (o formato do comando prevalece sobre o JSON)
  --size <id>            tamanho do catálogo (chat, blocos e bordas); veja --list
  --width <px>           largura da caixa, par (chat, blocos e bordas)
  --height <px>          altura da caixa, par (chat, blocos e bordas)
  --bleed <px>           margem transparente para brilho, par (chat, blocos e bordas)
  --frame <n>            frame do PNG (padrão 0)
  --duration <segundos>  duração do ciclo
  --seed <inteiro>       seed da distribuição
  --out <destino>        arquivo de saída
  --overwrite            substitui um arquivo existente
  --list                 lista as composições e os tamanhos por tipo

O formato do comando prevalece sobre o JSON.`;

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

/** Compositions and sizes grouped by kind, with pt-BR headers. */
export const listText = () => ASSET_KINDS.map((kind) => {
  const policy = kindPolicies[kind];
  const ids = Object.values(assetCatalog).filter((entry) => entry.kind === kind).map((entry) => `  ${entry.id}`);
  const lines = [`${policy.label} (${kind}):`, ...(ids.length > 0 ? ids : ['  (nenhuma composição ainda)'])];
  if (policy.fixedSize) {
    lines.push(`  Tamanho fixo: ${policy.fixedSize.width}×${policy.fixedSize.height}.`);
  } else {
    lines.push('  Tamanhos (--size):');
    for (const size of sizesForKind(kind)) {
      const canvas = canvasOf(size);
      lines.push(`    ${size.id}: caixa ${size.width}×${size.height}, arquivo ${canvas.width}×${canvas.height}; ${size.use}`);
    }
  }
  return lines.join('\n');
}).join('\n\n');

/** The props patch a named size stands for; refuses sizes of another kind and fixed-size kinds. */
export const expandSize = (kind: AssetKind, sizeId: string): Record<string, unknown> => {
  const policy = getKindPolicy(kind);
  if (policy.fixedSize) {
    throw new Error(`${policy.label} têm tamanho fixo (${policy.fixedSize.width}×${policy.fixedSize.height}): --size, --width, --height e --bleed valem só para chat, blocos e bordas.`);
  }
  const size = getSize(sizeId);
  if (size.kind !== kind) {
    const options = sizesForKind(kind).map((entry) => entry.id).join(', ');
    throw new Error(`O tamanho ${sizeId} é de ${kindPolicies[size.kind].label.toLowerCase()}, não de ${policy.label.toLowerCase()}. Opções: ${options}.`);
  }
  return sizeProps(size);
};

const numeric = (value: string | undefined, key: string) => (value === undefined ? {} : {[key]: Number(value)});

/** Turns the parsed command line (and the JSON file's content) into export options, without I/O. */
export const buildExportOptions = (
  {values, positionals}: {values: RenderValues; positionals: string[]},
  rawProps: unknown = {},
): ExportOptions => {
  if (positionals.length === 0) throw new Error('Informe a composição. Use --list para ver as opções.');
  if (positionals.length > 1) throw new Error('Informe somente uma composição. Use --help.');
  if (rawProps === null || Array.isArray(rawProps) || typeof rawProps !== 'object') {
    throw new Error('O arquivo de parâmetros deve conter um objeto JSON.');
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
