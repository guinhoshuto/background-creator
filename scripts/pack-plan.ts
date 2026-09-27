import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {getAsset, getLayoutOf, getMaskOf, getMotionOf} from '../src/catalog';
import {getKindPolicy, type AssetKind} from '../src/kinds';
import type {AssetLayout, Rect} from '../src/overlays/shared/box';
import type {AssetMotion} from '../src/overlays/shared/motion';
import {getCompositionMetadata, hasAlpha, outputFormatSchema, type OutputFormat} from '../src/settings';
import {assetFileName, getSize} from '../src/sizes';
import {expandSize} from './render-args';

/** Pack builds refuse to start (and to go on) below this much free disk: renders fill it fast. */
export const MIN_FREE_BYTES = 2 * 1024 ** 3;

/** Names become folder and file names, so they stay ASCII and shell-safe. */
const slug = /^[a-z0-9-]+$/;

// Keys in English, like the preset props they sit next to and the manifest.json the build writes;
// the descriptions and every message stay in pt-BR.
export const packItemSchema = z.object({
  composition: z.string().min(1).describe('Id da composição, por exemplo ChatLoop'),
  preset: z.string().regex(slug, 'Use o nome do preset sem pasta nem extensão, por exemplo chat-neon.').optional()
    .describe('Nome do arquivo em presets/, sem .json'),
  props: z.record(z.string(), z.unknown()).optional().describe('Parâmetros aplicados sobre o preset'),
  sizes: z.array(z.string().min(1)).min(1).optional().describe('Tamanhos do catálogo (só chat, blocos e bordas)'),
  formats: z.array(outputFormatSchema).min(1).describe('Formatos exportados para cada tamanho'),
  frame: z.number().int().min(0).optional().describe('Frame do PNG (padrão 0)'),
  variant: z.string().regex(slug, 'A variante vira parte do nome do arquivo: use letras minúsculas, números e hífen.').optional()
    .describe('Sufixo dos arquivos deste item, por exemplo sem-enfeites: <Id>-<tamanho>-<variante>.<ext>'),
}).strict();

export const packManifestSchema = z.object({
  name: z.string().regex(slug, 'O nome do pack vira pasta: use letras minúsculas, números e hífen.'),
  title: z.string().min(1).describe('Título do pack, para as pessoas'),
  items: z.array(packItemSchema).min(1).describe('O que o pack exporta, na ordem'),
}).strict();

export type PackItem = z.infer<typeof packItemSchema>;
export type PackManifest = z.infer<typeof packManifestSchema>;

/** What the planner needs from one composition; the CLI wires the real catalog, tests wire fakes. */
export type PackAsset = {
  id: string;
  kind: AssetKind;
  /** Strict schema parse: unknown keys and invalid combos are refused before any render. */
  parse: (props: Record<string, unknown>) => Record<string, unknown>;
  /** Sized kinds report their layout; backgrounds return null and use the kind's fixed canvas. */
  layout: ((props: Record<string, unknown>) => AssetLayout) | null;
  /** Sized kinds report the speeds they actually show; null otherwise. */
  motion?: ((props: Record<string, unknown>) => AssetMotion) | null;
  /** The props of the still mask that goes with a file (a window border's OBS mask), or null. */
  mask?: ((props: Record<string, unknown>) => Record<string, unknown> | null) | null;
};

export type PackDeps = {
  getAsset: (id: string) => PackAsset;
  readPreset: (name: string) => unknown;
};

export type PlannedFile = {
  composition: string;
  kind: AssetKind;
  /** The kind's Studio folder, reused as the buyer-facing folder inside the pack. */
  folder: string;
  size?: string;
  format: OutputFormat;
  /** The merged request: preset < item props < size < format. */
  props: Record<string, unknown>;
  /**
   * What exportAsset receives: the request parsed by the schema, every key spelled out. The
   * exporter leaves unrequested keys to the Studio's saved defaults (Root.tsx), which "Save
   * default props" rewrites; a pack must render what its plan and --dry-run describe.
   */
  exportProps: Record<string, unknown>;
  /** The speeds the file actually shows (sized kinds). */
  motion?: AssetMotion;
  /** Relative to the project root, POSIX separators: out/packs/<name>/<folder>/<file>. */
  output: string;
  canvas: {width: number; height: number};
  fps: number;
  frames: number;
  frame?: number;
  /** 'mask': the OBS mask of a window border's size (planned once per size and radius). */
  role?: 'mask';
  /** For a window border: the output of its mask, relative to the project root like `output`. */
  mask?: string;
};

/** A radius as a file-name tag: whole pixels as they are, fractions with "p" for the point (12p5). */
const radiusTag = (radius: number) => String(Math.round(radius * 100) / 100).replace('.', 'p');

/**
 * One mask the pack needs: its props, the item that first asked for it (`where`), how many planned
 * files come before it (`after`) and every file that uses it.
 */
type MaskRequest = {
  asset: PackAsset; sizeId: string; radius: number; props: Record<string, unknown>; after: number; users: PlannedFile[]; where: string;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const describeItem = (item: PackItem, index: number) => `Item ${index + 1} (${item.composition})`;

/** zod issues flattened into one pt-BR line per problem, with the field path. */
const issuesText = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`).join('; ');

export const parsePackManifest = (raw: unknown): PackManifest => {
  const result = packManifestSchema.safeParse(raw);
  if (!result.success) throw new Error(`Manifesto de pack inválido: ${issuesText(result.error)}`);
  return result.data;
};

/** The size patch for one item, with the pack's own wording for kinds of fixed size. */
const itemSizePatch = (asset: PackAsset, sizeId: string) => {
  const policy = getKindPolicy(asset.kind);
  if (policy.fixedSize) {
    throw new Error(`${asset.id} é de ${policy.label.toLowerCase()}, com tamanho fixo (${policy.fixedSize.width}×${policy.fixedSize.height}): remova "sizes" deste item.`);
  }
  return expandSize(asset.kind, sizeId);
};

/**
 * Expands a pack manifest into the ordered list of files to export: items in manifest order,
 * sizes in item order, formats in item order. Props merge as preset < item props < size < format,
 * so a named size always fixes the product and the format always matches the file extension. The
 * one exception is an item's `bleed`, which wins over the size's: the box stays the product, and
 * the wider margin only makes room (bigger ornaments on a large frame). An item's `variant` tags
 * its file names, so one pack can hold the same size twice (with and without ornaments).
 *
 * A window border (a named size with fit 'janela') also needs its OBS mask. The mask depends only
 * on the window (box and clamped radius), so the pack plans it once per size and radius, right
 * after the first file that needs it, as `<folder>/mascara-<size>.png`; when one pack holds the
 * same size with several radii, each mask is tagged with its radius: `mascara-<size>-r<radius>.png`.
 */
export const planPack = (manifest: PackManifest, deps: PackDeps): PlannedFile[] => {
  const planned: PlannedFile[] = [];
  const seen = new Map<string, string>();
  const masks = new Map<string, MaskRequest>();
  manifest.items.forEach((item, index) => {
    const where = describeItem(item, index);
    const withContext = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        const message = error instanceof z.ZodError ? issuesText(error) : error instanceof Error ? error.message : String(error);
        throw new Error(`${where}: ${message}`);
      }
    };
    if (item.frame !== undefined && !item.formats.includes('png')) {
      throw new Error(`${where}: "frame" vale só para PNG; inclua png em "formats" ou remova "frame".`);
    }
    const asset = withContext(() => deps.getAsset(item.composition));
    const policy = getKindPolicy(asset.kind);
    const presetName = item.preset;
    const preset = presetName === undefined ? {} : withContext(() => deps.readPreset(presetName));
    if (!isPlainObject(preset)) throw new Error(`${where}: o preset ${item.preset} deve conter um objeto JSON.`);
    const sizes: (string | undefined)[] = item.sizes ?? [undefined];
    for (const sizeId of sizes) {
      const sizePatch = sizeId === undefined ? {} : withContext(() => itemSizePatch(asset, sizeId));
      for (const format of item.formats) {
        const bleed = item.props?.bleed === undefined ? {} : {bleed: item.props.bleed};
        const props = {...preset, ...item.props, ...sizePatch, ...bleed, outputFormat: format};
        const parsed = withContext(() => asset.parse(props));
        if (parsed.guides === true) throw new Error(`${where}: desligue guides para exportar.`);
        const layout = asset.layout?.(parsed) ?? null;
        const canvas = layout?.canvas ?? policy.fixedSize;
        if (!canvas) throw new Error(`${where}: a composição não informa o tamanho do arquivo.`);
        const {fps, durationInFrames} = getCompositionMetadata({
          durationSeconds: parsed.durationSeconds as number, outputFormat: format,
        });
        const frame = format === 'png' ? item.frame ?? 0 : undefined;
        if (frame !== undefined && frame >= durationInFrames) {
          throw new Error(`${where}: o quadro precisa ser um inteiro entre 0 e ${durationInFrames - 1}.`);
        }
        // A named size is the product tag even when the schema would match another table entry.
        const tag = item.variant === undefined ? '' : `-${item.variant}`;
        const file = sizeId === undefined
          ? assetFileName({id: asset.id, kind: asset.kind, props: parsed, format}).replace(/(\.[a-z0-9]+)$/, `${tag}$1`)
          : `${asset.id}-${getSize(sizeId).id}${tag}.${format}`;
        const output = path.posix.join('out', 'packs', manifest.name, policy.folder, file);
        const previous = seen.get(output);
        if (previous) {
          throw new Error(`${where} repete o arquivo ${output}, já gerado por ${previous}: mude o tamanho, o formato ou separe em outro pack.`);
        }
        seen.set(output, where);
        const motion = asset.motion?.(parsed) ?? null;
        const entry: PlannedFile = {
          composition: asset.id, kind: asset.kind, folder: policy.folder,
          ...(sizeId === undefined ? {} : {size: sizeId}),
          format, props, exportProps: parsed, ...(motion ? {motion} : {}),
          output, canvas: {...canvas}, fps, frames: durationInFrames,
          ...(frame === undefined ? {} : {frame}),
        };
        planned.push(entry);
        const maskProps = sizeId === undefined ? null : asset.mask?.(parsed) ?? null;
        if (sizeId !== undefined && maskProps) {
          const radius = Number(maskProps.radius);
          const key = `${sizeId}|${radius}`;
          const request = masks.get(key) ?? {asset, sizeId, radius, props: maskProps, after: 0, users: [], where};
          // The mask comes right after the last format of the first item and size that need it.
          if (request.where === where) request.after = planned.length;
          request.users.push(entry);
          masks.set(key, request);
        }
      }
    }
  });
  if (masks.size === 0) return planned;

  const radiiBySize = new Map<string, Set<number>>();
  for (const {sizeId, radius} of masks.values()) radiiBySize.set(sizeId, (radiiBySize.get(sizeId) ?? new Set()).add(radius));
  const inserts = new Map<number, PlannedFile[]>();
  for (const request of masks.values()) {
    const {asset, sizeId, radius, where} = request;
    const policy = getKindPolicy(asset.kind);
    const exportProps = (() => {
      try {
        return asset.parse(request.props);
      } catch (error) {
        const message = error instanceof z.ZodError ? issuesText(error) : error instanceof Error ? error.message : String(error);
        throw new Error(`${where}: a máscara de ${sizeId} é inválida: ${message}`);
      }
    })();
    const canvas = asset.layout?.(exportProps).canvas;
    if (!canvas) throw new Error(`${where}: a composição não informa o tamanho da máscara.`);
    const tag = radiiBySize.get(sizeId)!.size > 1 ? `-r${radiusTag(radius)}` : '';
    const output = path.posix.join('out', 'packs', manifest.name, policy.folder, `mascara-${getSize(sizeId).id}${tag}.png`);
    const previous = seen.get(output);
    if (previous) throw new Error(`${where}: a máscara ${output} repete um arquivo de ${previous}: renomeie o item ou separe em outro pack.`);
    seen.set(output, where);
    const {fps, durationInFrames} = getCompositionMetadata({durationSeconds: exportProps.durationSeconds as number, outputFormat: 'png'});
    const mask: PlannedFile = {
      composition: asset.id, kind: asset.kind, folder: policy.folder, size: sizeId, format: 'png',
      props: request.props, exportProps, output, canvas: {...canvas}, fps, frames: durationInFrames, frame: 0, role: 'mask',
    };
    for (const user of request.users) user.mask = output;
    inserts.set(request.after, [...(inserts.get(request.after) ?? []), mask]);
  }
  return planned.flatMap((file, index) => [file, ...(inserts.get(index + 1) ?? [])]);
};

/** `--only`: keeps the files whose path contains the text (case-insensitive); an empty match is an error. */
export const filterPlan = (plan: readonly PlannedFile[], only: string | undefined) => {
  if (only === undefined) return [...plan];
  const needle = only.toLowerCase();
  const kept = plan.filter((file) => file.output.toLowerCase().includes(needle));
  if (kept.length === 0) throw new Error(`Nenhum arquivo do pack contém "${only}". Use --dry-run para ver a lista.`);
  return kept;
};

const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;

/** Refuses to render when the disk is nearly full: a crashed render run once took this Mac down. */
export const assertFreeSpace = (freeBytes: number, where: string) => {
  if (freeBytes < MIN_FREE_BYTES) {
    throw new Error(`Espaço livre insuficiente em ${where}: há ${gigabytes(freeBytes)} livres e o pack precisa de pelo menos ${gigabytes(MIN_FREE_BYTES)}. Libere espaço e rode de novo; os arquivos prontos serão pulados.`);
  }
};

/**
 * One line per file for --dry-run: path, file (canvas) dimensions, timing and, for sized kinds,
 * the speeds the file actually shows (rounded to whole periods per cycle, so they vary by size).
 */
export const dryRunText = (plan: readonly PlannedFile[], existing: ReadonlySet<string> = new Set()) => [
  ...plan.map((file) => {
    const still = file.frame === undefined ? `${file.fps} fps, ${file.frames} frames` : `quadro ${file.frame}`;
    // A still does not move: its speeds would only be noise there.
    const speeds = file.motion && file.frame === undefined ? `, contorno ${file.motion.strokeSpeed} px/s, preenchimento ${file.motion.fillSpeed} px/s` : '';
    const note = existing.has(file.output) ? ' (já existe)' : '';
    return `${file.output}  ${file.canvas.width}×${file.canvas.height}, ${still}${speeds}${note}`;
  }),
  `Total: ${plan.length} ${plan.length === 1 ? 'arquivo' : 'arquivos'}.`,
].join('\n');

/** Pack manifest entry for one file (keys in English/CSS style, for tools). */
export type PackFileEntry = {
  file: string;
  composition: string;
  kind: AssetKind;
  size: string | null;
  format: OutputFormat;
  canvas: {width: number; height: number};
  box: Rect;
  content: Rect;
  hole: Rect | null;
  /** The chat's title area, when it has a header. */
  header?: Rect;
  bleed: number;
  fps: number;
  frames: number;
  frame?: number;
  alpha: boolean;
  /** The speeds the file actually shows, in px/s (sized kinds that move). */
  motion?: AssetMotion;
  /** 'mask': this file is the OBS mask of a window border's size. */
  role?: 'mask';
  /** For a window border: its OBS mask, relative to the pack like `file`. */
  mask?: string;
};

/** The subset of exportAsset's sidecar the pack manifest keeps. */
type Sidecar = {
  canvas: {width: number; height: number}; box: Rect; content: Rect; hole: Rect | null; header?: Rect;
  bleed: number; fps: number; frames: number; frame?: number; format: OutputFormat; alpha: boolean; motion?: AssetMotion;
};

/**
 * Entry for a file: the sidecar exportAsset published is the truth (it saw the Studio's saved
 * defaults); without one (backgrounds, or a file skipped on a resumed run) the planned layout is used.
 */
export const packFileEntry = (
  file: PlannedFile, packRoot: string, asset: PackAsset, sidecar: Sidecar | null,
): PackFileEntry => {
  const base = {
    file: path.posix.relative(packRoot, file.output),
    composition: file.composition, kind: file.kind, size: file.size ?? null, format: file.format,
  };
  // The pack's own references win over the sidecar's: a mask is named per pack, not per export.
  const links = {
    ...(file.role ? {role: file.role} : {}),
    ...(file.mask ? {mask: path.posix.relative(packRoot, file.mask)} : {}),
  };
  // A mask never moves: its zero speeds would only be noise.
  const moving = file.role !== 'mask';
  if (sidecar) {
    return {
      ...base, canvas: sidecar.canvas, box: sidecar.box, content: sidecar.content, hole: sidecar.hole ?? null,
      ...(sidecar.header ? {header: sidecar.header} : {}),
      bleed: sidecar.bleed, fps: sidecar.fps, frames: sidecar.frames,
      ...(sidecar.frame === undefined ? {} : {frame: sidecar.frame}), alpha: sidecar.alpha,
      ...(sidecar.motion && moving ? {motion: sidecar.motion} : {}),
      ...links,
    };
  }
  const parsed = asset.parse(file.props);
  const motion = moving ? asset.motion?.(parsed) ?? null : null;
  const layout = asset.layout?.(parsed) ?? null;
  const whole = {x: 0, y: 0, ...file.canvas};
  return {
    ...base,
    canvas: file.canvas,
    box: layout?.box ?? whole,
    content: layout?.content ?? whole,
    hole: layout?.hole ?? null,
    ...(layout?.header ? {header: layout.header} : {}),
    bleed: typeof parsed.bleed === 'number' ? parsed.bleed : 0,
    fps: file.fps,
    frames: file.format === 'png' ? 1 : file.frames,
    ...(file.frame === undefined ? {} : {frame: file.frame}),
    alpha: hasAlpha(parsed as {transparent: boolean; outputFormat: OutputFormat}),
    ...(motion ? {motion} : {}),
    ...links,
  };
};

/** pt-BR: how many scratch directories of interrupted exports were (or will be) removed. */
export const scratchText = (count: number, done: 'removida' | 'será removida') => {
  const plural = count === 1 ? '' : 's';
  const verb = done === 'removida' ? `removida${plural}` : `ser${count === 1 ? 'á' : 'ão'} removida${plural}`;
  return `${count} pasta${plural} temporária${plural} de exports interrompidos ${verb}${done === 'removida' ? '.' : ' ao montar o pack.'}`;
};

/** Every side effect of a pack run, injected so the run loop is tested without rendering. */
export type PackRunEffects = {
  exists: (file: string) => Promise<boolean>;
  freeBytes: () => Promise<number>;
  /** Renders one file; resolves once the file (and its sidecar, for sized kinds) is published. */
  exportFile: (file: PlannedFile, overwrite: boolean) => Promise<void>;
  readJson: (file: string) => Promise<unknown | null>;
  remove: (file: string) => Promise<void>;
  writeManifest: (file: string, data: unknown) => Promise<void>;
  /** Removes the scratch directories interrupted exports left behind; returns what it removed. */
  sweepScratch: () => Promise<string[]>;
  log: (message: string) => void;
};

/**
 * Renders the plan strictly one file at a time. Existing files are skipped unless `overwrite`,
 * so an interrupted build resumes where it stopped. The pack manifest is rewritten after every
 * file: the per-file sidecars are deleted once read, so their data must already be on disk.
 */
export const runPack = async ({manifest, plan, overwrite, deps, effects, diskLabel}: {
  manifest: PackManifest; plan: readonly PlannedFile[]; overwrite: boolean;
  deps: PackDeps; effects: PackRunEffects; diskLabel: string;
}) => {
  const packRoot = path.posix.join('out', 'packs', manifest.name);
  const manifestPath = path.posix.join(packRoot, 'manifest.json');
  const previous = await effects.readJson(manifestPath);
  const previousFiles = new Map<string, PackFileEntry>();
  if (isPlainObject(previous) && Array.isArray(previous.files)) {
    for (const entry of previous.files as PackFileEntry[]) previousFiles.set(entry.file, entry);
  }
  // Files outside this run (another --only slice) keep their entries.
  const entries = new Map(previousFiles);
  const save = () => effects.writeManifest(manifestPath, {
    name: manifest.name, title: manifest.title,
    files: [...entries.values()].sort((a, b) => a.file.localeCompare(b.file)),
  });
  // Partial renders of an interrupted run are never valid output: gone before anything else, freeing their space.
  const swept = await effects.sweepScratch();
  if (swept.length > 0) effects.log(scratchText(swept.length, 'removida'));
  assertFreeSpace(await effects.freeBytes(), diskLabel);
  let rendered = 0;
  let skipped = 0;
  for (const [index, file] of plan.entries()) {
    const counter = `[${index + 1}/${plan.length}]`;
    const relative = path.posix.relative(packRoot, file.output);
    const sidecar = `${file.output}.json`;
    const asset = deps.getAsset(file.composition);
    if (!overwrite && await effects.exists(file.output)) {
      effects.log(`${counter} ${file.output}: já existe, pulando.`);
      skipped += 1;
    } else {
      // Checked again per file: one pack can take many gigabytes.
      assertFreeSpace(await effects.freeBytes(), diskLabel);
      effects.log(`${counter} ${file.output}`);
      await effects.exportFile(file, overwrite);
      rendered += 1;
    }
    // A leftover sidecar (fresh render or an interrupted run) wins over older data, then leaves the buyer's folder.
    const data = await effects.readJson(sidecar);
    const known = previousFiles.get(relative);
    entries.set(relative, data !== null
      ? packFileEntry(file, packRoot, asset, data as Sidecar)
      : known ?? packFileEntry(file, packRoot, asset, null));
    await save();
    if (data !== null) await effects.remove(sidecar);
  }
  await save();
  effects.log(`Pack ${manifest.name}: ${rendered} exportados, ${skipped} pulados. Manifesto: ${manifestPath}`);
  return {rendered, skipped, manifestPath};
};

/** Same root as scripts/export.ts, without importing the renderer into the planner. */
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** The real catalog and presets/ folder behind the planner's injectable dependencies. */
export const realPackDeps: PackDeps = {
  getAsset: (id): PackAsset => {
    const asset = getAsset(id);
    return {
      id: asset.id,
      kind: asset.kind,
      parse: (props) => asset.schema.strict().parse(props) as Record<string, unknown>,
      layout: getLayoutOf(asset),
      motion: getMotionOf(asset),
      mask: getMaskOf(asset),
    };
  },
  readPreset: (name) => {
    const file = path.join(PROJECT_ROOT, 'presets', `${name}.json`);
    if (!existsSync(file)) throw new Error(`Preset não encontrado: presets/${name}.json.`);
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  },
};
