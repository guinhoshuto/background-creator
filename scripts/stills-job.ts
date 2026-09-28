// Pure half of `npm run stills`: the job format, the props each still renders with, the image
// operations (alpha stats, diffs, contact sheets, stream mockups) and the kit job that `npm run
// qa:kit` builds from a pack. No bundle, no browser, no disk writes: tests cover all of it.
import path from 'node:path';
import {PNG} from 'pngjs';
import {z} from 'zod';
import type {PlannedFile} from './pack-plan';

/** Sheets and mockups are for people and for agents that read images: never wider than this. */
export const MAX_SHEET_WIDTH = 1600;
/** The machine rule in HARNESS: no render starts with less free disk than this. */
export const STILLS_MIN_FREE_BYTES = 3 * 1024 ** 3;

const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Use letters, digits, dot, hyphen and underscore (it becomes a file name).');
const outFile = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*\.png$/, 'Use a relative .png path inside outDir.')
  .refine((value) => !value.split('/').includes('..'), 'Stay inside outDir: no "..".');
const backdrop = z.union([z.enum(['checker', 'dark', 'light']), z.string().regex(/^#[0-9a-fA-F]{6}$/)]);

export const stillSchema = z.object({
  name,
  id: z.string().min(1).describe('Composition id, e.g. ChatLoop or WebGLLoop'),
  preset: z.string().regex(/^[a-z0-9-]+$/).optional().describe('File in presets/, without .json'),
  size: z.string().min(1).optional().describe('Named size (chat, block and border only)'),
  props: z.record(z.string(), z.unknown()).optional().describe('Props applied over the preset'),
  frame: z.number().int().default(0).describe('Frame; negative counts from the end (-1 is the last)'),
}).strict();

export const jobSchema = z.object({
  outDir: z.string().min(1).optional()
    .describe('Relative to the job file; default out/review/<date>-<job file name>/ in the project'),
  stills: z.array(stillSchema).min(1),
  baseline: z.object({ref: z.string().min(1).default('HEAD')}).strict().optional()
    .describe('Also render every still at this git ref and diff it against the working tree'),
  seams: z.array(name).optional().describe('Stills whose loop seam (N−1 → 0) is compared with a normal step (0 → 1)'),
  sequences: z.array(z.object({name, still: name, from: z.number().int().min(0), to: z.number().int().min(0)}).strict()).optional()
    .describe('renderFrames in one tab, compared byte for byte with fresh stills (determinism)'),
  diffs: z.array(z.tuple([name, name])).optional(),
  sheets: z.array(z.object({
    out: outFile, names: z.array(name).min(1), cols: z.number().int().min(1).default(2),
    width: z.number().int().min(16).default(700).describe('Per cell; the sheet is capped at 1600 px'),
    bg: backdrop.default('checker'),
  }).strict()).optional(),
  mockups: z.array(z.object({
    out: outFile, base: z.union([name, z.string().regex(/^#[0-9a-fA-F]{6}$/)]),
    width: z.number().int().min(16).default(1920), height: z.number().int().min(16).default(1080),
    maxWidth: z.number().int().min(16).max(MAX_SHEET_WIDTH).default(MAX_SHEET_WIDTH),
    layers: z.array(z.object({name, x: z.number(), y: z.number()}).strict()).min(1)
      .describe('x/y place the overlay BOX; its bleed is subtracted automatically'),
  }).strict()).optional(),
  bench: z.array(name).optional().describe('Re-render on the CPU (swangle), 3 times each; the median is a shader cost proxy'),
}).strict();

export type StillsJob = z.infer<typeof jobSchema>;
export type StillSpec = z.infer<typeof stillSchema>;

const issuesText = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`).join('; ');

/** Parses a job and checks every cross reference, so a typo fails before any bundle. */
export const parseJob = (raw: unknown): StillsJob => {
  const result = jobSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid stills job: ${issuesText(result.error)}`);
  const job = result.data;
  const names = new Set<string>();
  for (const still of job.stills) {
    if (names.has(still.name)) throw new Error(`Invalid stills job: the still name "${still.name}" repeats.`);
    names.add(still.name);
  }
  const problems: string[] = [];
  const need = (where: string, ref: string) => { if (!names.has(ref)) problems.push(`${where} refers to "${ref}", which is not a still`); };
  job.seams?.forEach((ref, i) => need(`seams.${i}`, ref));
  job.sequences?.forEach((s, i) => {
    need(`sequences.${i}`, s.still);
    if (s.to < s.from) problems.push(`sequences.${i}: "to" comes before "from"`);
  });
  job.diffs?.forEach(([a, b], i) => { need(`diffs.${i}`, a); need(`diffs.${i}`, b); });
  job.sheets?.forEach((s, i) => s.names.forEach((ref) => need(`sheets.${i} (${s.out})`, ref)));
  job.mockups?.forEach((m, i) => {
    if (!m.base.startsWith('#')) need(`mockups.${i} (${m.out}) base`, m.base);
    m.layers.forEach((layer) => need(`mockups.${i} (${m.out})`, layer.name));
  });
  job.bench?.forEach((ref, i) => need(`bench.${i}`, ref));
  const outs = [...(job.sheets ?? []), ...(job.mockups ?? [])].map((entry) => entry.out);
  const repeated = outs.find((out, i) => outs.indexOf(out) !== i);
  if (repeated) problems.push(`two sheets or mockups write ${repeated}`);
  if (problems.length > 0) throw new Error(`Invalid stills job: ${problems.join('; ')}.`);
  return job;
};

/** Where the PNGs land: the job's outDir (relative to the job file) or out/review/<date>-<job>/. */
export const resolveOutDir = (job: StillsJob, jobFile: string, projectRoot: string, today: string) =>
  (job.outDir !== undefined
    ? path.resolve(path.dirname(jobFile), job.outDir)
    : path.join(projectRoot, 'out', 'review', `${today}-${path.basename(jobFile).replace(/\.json$/, '').replace(/^job$/, 'stills')}`));

/**
 * The props a still renders with, in the pack's order: preset < props < size < the props' own
 * bleed < PNG output (and transparency for overlays). Parsed by the catalog schema (strict) in
 * the runner, so a still renders exactly what a pack would.
 */
export const mergeStillProps = ({preset, props, sizeProps, overlay}: {
  preset: Record<string, unknown>; props: Record<string, unknown> | undefined; sizeProps: Record<string, unknown>; overlay: boolean;
}) => {
  const bleed = props?.bleed === undefined ? {} : {bleed: props.bleed};
  return {...preset, ...(props ?? {}), ...sizeProps, ...bleed, outputFormat: 'png', ...(overlay ? {transparent: true} : {})};
};

/** A frame index inside the loop: negative frames count from the end. */
export const wrapFrame = (frame: number, durationInFrames: number) =>
  ((frame % durationInFrames) + durationInFrames) % durationInFrames;

// ---------------------------------------------------------------------------------------------
// Image operations (pngjs, RGBA)

export type Rgba = {width: number; height: number; data: Uint8Array};

export const alphaStats = (png: Rgba) => {
  let min = 255, max = 0, sum = 0, partial = 0, zero = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    const a = png.data[i]!;
    min = Math.min(min, a); max = Math.max(max, a); sum += a;
    if (a > 0 && a < 255) partial++;
    if (a === 0) zero++;
  }
  const n = png.data.length / 4;
  return {minAlpha: min, maxAlpha: max, meanAlpha: +(sum / n).toFixed(2), partialShare: +(partial / n).toFixed(4), zeroShare: +(zero / n).toFixed(4)};
};

/** Mean luminance composed over black (0..255). */
export const meanLuma = (png: Rgba) => {
  let sum = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3]! / 255;
    sum += (0.2126 * png.data[i]! + 0.7152 * png.data[i + 1]! + 0.0722 * png.data[i + 2]!) * a;
  }
  return +(sum / (png.data.length / 4)).toFixed(2);
};

/** Mean and max absolute RGBA difference (0..255) and the share of channels that moved more than 2. */
export const diffImages = (a: Rgba, b: Rgba) => {
  if (a.width !== b.width || a.height !== b.height) {
    return {sameSize: false as const, a: `${a.width}×${a.height}`, b: `${b.width}×${b.height}`};
  }
  let total = 0, max = 0, changed = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i]! - b.data[i]!);
    total += d; if (d > max) max = d; if (d > 2) changed++;
  }
  return {
    sameSize: true as const, identical: total === 0,
    mean: +(total / a.data.length).toFixed(4), max, changedShare: +(changed / a.data.length).toFixed(4),
  };
};

/**
 * The loop seam against a normal step: the jump N−1 → 0 should look like 0 → 1. A seam more than
 * three times the normal step (and visible, over 0.5 mean) is flagged.
 */
export const seamVerdict = (seamMean: number, stepMean: number) => {
  const ratio = stepMean === 0 ? (seamMean === 0 ? 1 : Infinity) : seamMean / stepMean;
  return {seamMean, stepMean, ratio: Number.isFinite(ratio) ? +ratio.toFixed(2) : null, ok: seamMean <= 0.5 || ratio <= 3};
};

const hex = (value: string) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
const solidOf = (bg: string): [number, number, number] | null =>
  (bg.startsWith('#') ? hex(bg) : bg === 'dark' ? [24, 22, 30] : bg === 'light' ? [236, 236, 240] : null);

/** Box-filter downscale of one image into a cell, composed over a backdrop so alpha stays visible. */
const drawCell = (target: PNG, img: Rgba, ox: number, oy: number, w: number, h: number, bg: string) => {
  const fx = img.width / w, fy = img.height / h;
  const solid = solidOf(bg);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const acc = [0, 0, 0]; let count = 0;
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
    for (let sy = y0; sy < Math.min(img.height, y1); sy++) for (let sx = x0; sx < Math.min(img.width, x1); sx++) {
      const i = (sy * img.width + sx) * 4; const a = img.data[i + 3]! / 255;
      const checker = ((Math.floor(sx / 16) + Math.floor(sy / 16)) % 2) ? 205 : 150;
      for (let c = 0; c < 3; c++) acc[c]! += img.data[i + c]! * a + (solid ? solid[c]! : checker) * (1 - a);
      count++;
    }
    const o = ((oy + y) * target.width + ox + x) * 4;
    for (let c = 0; c < 3; c++) target.data[o + c] = Math.round(acc[c]! / Math.max(1, count));
    target.data[o + 3] = 255;
  }
};

const GAP = 6;

/** Cell width and each image's cell size: aspect kept, never upscaled, sheet capped at 1600 px. */
export const sheetGeometry = (sizes: readonly {width: number; height: number}[], cols: number, width: number) => {
  const widest = Math.max(...sizes.map((size) => size.width));
  const cellW = Math.max(1, Math.min(width, widest, Math.floor((MAX_SHEET_WIDTH - GAP * (cols - 1)) / cols)));
  const cells = sizes.map((size) => {
    const w = Math.min(cellW, size.width);
    return {w, h: Math.max(1, Math.round((w * size.height) / size.width))};
  });
  const rows = Math.ceil(sizes.length / cols);
  const rowH = Array.from({length: rows}, (_, r) => Math.max(...cells.slice(r * cols, r * cols + cols).map((cell) => cell.h)));
  return {cellW, cells, rowH, width: cellW * cols + GAP * (cols - 1), height: rowH.reduce((a, b) => a + b, 0) + GAP * (rows - 1)};
};

export const contactSheet = (images: readonly Rgba[], {cols, width, bg}: {cols: number; width: number; bg: string}) => {
  const geometry = sheetGeometry(images, cols, width);
  const target = new PNG({width: geometry.width, height: geometry.height});
  for (let i = 0; i < target.data.length; i += 4) { target.data[i] = 60; target.data[i + 1] = 60; target.data[i + 2] = 64; target.data[i + 3] = 255; }
  let oy = 0;
  geometry.rowH.forEach((rowHeight, r) => {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c; if (k >= images.length) break;
      drawCell(target, images[k]!, c * (geometry.cellW + GAP), oy, geometry.cells[k]!.w, geometry.cells[k]!.h, bg);
    }
    oy += rowHeight + GAP;
  });
  return target;
};

/** Overlays placed by their box on a base still (or a solid color), then downscaled to maxWidth. */
export const streamMockup = (
  {base, width: W, height: H, maxWidth, layers}: {base: Rgba | string; width: number; height: number; maxWidth: number;
    layers: readonly {image: Rgba; x: number; y: number; bleed: number}[]},
) => {
  const canvas = new Float64Array(W * H * 3);
  if (typeof base === 'string') {
    const [r, g, b] = hex(base);
    for (let i = 0; i < W * H; i++) { canvas[i * 3] = r; canvas[i * 3 + 1] = g; canvas[i * 3 + 2] = b; }
  } else {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = (Math.min(base.height - 1, y) * base.width + Math.min(base.width - 1, x)) * 4, a = base.data[s + 3]! / 255;
      for (let c = 0; c < 3; c++) canvas[(y * W + x) * 3 + c] = base.data[s + c]! * a + 20 * (1 - a);
    }
  }
  for (const {image, x: lx, y: ly, bleed} of layers) {
    const ox = Math.round(lx - bleed), oy = Math.round(ly - bleed);
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const tx = ox + x, ty = oy + y; if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const s = (y * image.width + x) * 4, a = image.data[s + 3]! / 255; if (a === 0) continue;
      for (let c = 0; c < 3; c++) { const t = (ty * W + tx) * 3 + c; canvas[t] = image.data[s + c]! * a + canvas[t]! * (1 - a); }
    }
  }
  const scale = Math.min(1, maxWidth / W);
  const w = Math.round(W * scale), h = Math.round(H * scale);
  const target = new PNG({width: w, height: h});
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const acc = [0, 0, 0]; let n = 0;
    const y0 = Math.floor(y / scale), y1 = Math.max(y0 + 1, Math.floor((y + 1) / scale));
    const x0 = Math.floor(x / scale), x1 = Math.max(x0 + 1, Math.floor((x + 1) / scale));
    for (let sy = y0; sy < Math.min(H, y1); sy++) for (let sx = x0; sx < Math.min(W, x1); sx++) {
      for (let c = 0; c < 3; c++) acc[c]! += canvas[(sy * W + sx) * 3 + c]!; n++;
    }
    const o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) target.data[o + c] = Math.round(acc[c]! / Math.max(1, n));
    target.data[o + 3] = 255;
  }
  return target;
};

// ---------------------------------------------------------------------------------------------
// The kit job (`npm run qa:kit`)

/** The default stream layouts, in 1920×1080 box coordinates, from the Halloween kits' art direction. */
const MOCK_LAYOUTS: {out: string; base: 'background' | string; layers: {size: string; x: number; y: number}[]}[] = [
  {out: 'mock-chatting', base: 'background', layers: [
    {size: 'webcam-16x9-lg', x: 80, y: 100}, {size: 'chat-standard', x: 1440, y: 100},
    {size: 'lower-third', x: 80, y: 820}, {size: 'label', x: 1400, y: 780}, {size: 'circle-sm', x: 1680, y: 880}]},
  {out: 'mock-gameplay', base: '#3A4150', layers: [
    {size: 'gameplay', x: 48, y: 48}, {size: 'chat-standard', x: 1496, y: 32},
    {size: 'webcam-round-sm', x: 1556, y: 700}, {size: 'label', x: 40, y: 910}]},
  {out: 'mock-screen', base: '#8E9AAB', layers: [{size: 'fullscreen', x: 0, y: 0}, {size: 'label-sm', x: 80, y: 960}]},
];

const SHEETS: {out: string; kind: string; cols: number; width: number; bg: string}[] = [
  {out: 'sheet-chat', kind: 'chat', cols: 5, width: 320, bg: 'dark'},
  {out: 'sheet-block', kind: 'block', cols: 3, width: 520, bg: 'dark'},
  {out: 'sheet-border', kind: 'border', cols: 4, width: 390, bg: 'checker'},
];

/**
 * The QA job for one pack: every file the pack plans (one still per composition, size and
 * variant; masks and repeated formats skipped) at each frame, a sheet per kind, a light sheet,
 * and the stream mockups whose sizes the pack has. Frames wrap per asset, like any still.
 */
export const buildKitJob = (plan: readonly PlannedFile[], {frames}: {frames?: readonly number[]} = {}) => {
  const seen = new Set<string>();
  const files: {stem: string; file: PlannedFile}[] = [];
  for (const file of plan) {
    if (file.role === 'mask') continue;
    // Buyer names are out/packs/<pack>/<folder>/<pack>-<piece>[-<variant>].<ext>: the stem is what follows the pack.
    const pack = file.output.split('/')[2]!;
    const base = path.posix.basename(file.output).replace(/\.[a-z0-9]+$/, '');
    const stem = file.kind === 'background'
      ? `bg-${file.composition}${file.variant === undefined ? '' : `-${file.variant}`}`
      : base.slice(pack.length + 1);
    if (seen.has(stem)) continue;
    seen.add(stem);
    files.push({stem, file});
  }
  const background = files.find(({file}) => file.kind === 'background');
  const loopFrames = background?.file.frames ?? files[0]?.file.frames ?? 1;
  const at = frames ?? [0, Math.round(loopFrames * 0.43)];
  const stills: StillSpec[] = [];
  const sheets: NonNullable<StillsJob['sheets']> = [];
  const mockups: NonNullable<StillsJob['mockups']> = [];
  for (const frame of at) {
    const bySize = new Map<string, string>();
    for (const {stem, file} of files) {
      const stillName = `${stem}-${frame}`;
      // The request as the pack makes it; the runner swaps the format for PNG.
      const {outputFormat: _format, ...props} = file.props;
      void _format;
      stills.push({name: stillName, id: file.composition, props, frame});
      // Mockups use the plain size, not a variant (plain and the like).
      if (file.size !== undefined && file.variant === undefined) bySize.set(file.size, stillName);
    }
    for (const sheet of SHEETS) {
      const names = files.filter(({file}) => file.kind === sheet.kind).map(({stem}) => `${stem}-${frame}`);
      if (names.length > 0) sheets.push({out: `${sheet.out}-${frame}.png`, names, cols: Math.min(sheet.cols, names.length), width: sheet.width, bg: sheet.bg});
    }
    const light = ['chat-standard', 'card', 'webcam-16x9', 'webcam-round-sm'].flatMap((size) => bySize.get(size) ?? []);
    if (light.length > 0) sheets.push({out: `sheet-light-${frame}.png`, names: light, cols: light.length, width: 390, bg: 'light'});
    const backgroundStill = background ? `${background.stem}-${frame}` : null;
    for (const layout of MOCK_LAYOUTS) {
      const layers = layout.layers.flatMap(({size, x, y}) => (bySize.has(size) ? [{name: bySize.get(size)!, x, y}] : []));
      if (layers.length === 0) continue;
      const base = layout.base === 'background' ? backgroundStill : layout.base;
      if (base === null) continue;
      mockups.push({out: `${layout.out}-${frame}.png`, base, width: 1920, height: 1080, maxWidth: MAX_SHEET_WIDTH, layers});
    }
  }
  return {outDir: '.', stills, sheets, mockups} satisfies Omit<StillsJob, 'stills'> & {stills: StillSpec[]};
};
