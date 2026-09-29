// `npm run stills -- inspect <mode>`: measures PNGs by hand (region, profile, crop, diff) so no
// agent writes a measuring script. CPU only: no bundle, no browser, no render slot. stills.ts loads
// it through a dynamic import, so the render modules stay unloaded. The measures are pixel-stats.ts.
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {PNG} from 'pngjs';
import {contrast, cropImage, diffDetail, isBackdrop, measureRegion, profile, type Box, type Point} from './pixel-stats';
import {diffImages, type Rgba} from './stills-job';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export const INSPECT_HELP = `npm run stills -- inspect <mode> ...   (CPU only; prints one JSON object)

  region  <png> x,y,w,h [--vs x,y,w,h] [--threshold 0..255]   stats of a box, and contrast against --vs
  profile <png> x0,y0 x1,y1 [--step n]                          L* along a segment (at most 128 samples by default)
  crop    <png> x,y,w,h [--zoom n] [--lift 1..4] [--bg checker|dark|light|#rrggbb] [--out file.png]
  diff    <a.png> <b.png> [--gain n] [--out file.png]             diff stats, changedBox and a |Δ|·gain heatmap

Pixels are composed over black (c' = c·a/255). luma: Rec. 709 on the composed 8-bit values (0..255),
like meanLuma in report.json. L*: CIE lightness (0..100) of Y = 0.2126 R + 0.7152 G + 0.0722 B on
linearized sRGB. Region stats: meanLuma, stdLuma, p99Luma, meanLstar, aboveShare (luma > threshold,
default 128), meanAlpha, alphaNonZeroShare. Contrast: deltaLstar and the WCAG contrastRatio of the mean
luminances. Crops stay within 1600×900; --lift applies out = 255·(v/255)^(1/lift) after the backdrop.
Default outputs go to out/.scratch/inspect/. In a job, "regions" puts region stats in report.json.`;

const fail = (message: string): never => { throw new Error(message); };

const integers = (text: string, count: number, what: string) => {
  const parts = text.split(',');
  if (parts.length !== count || parts.some((part) => !/^\d+$/.test(part))) {
    fail(`Invalid ${what} "${text}": use ${count === 4 ? 'x,y,w,h' : 'x,y'} with non-negative integers.`);
  }
  return parts.map(Number);
};

/** `x,y,w,h` inside the image, w and h at least 1. */
export const parseBox = (text: string, size: {width: number; height: number}): Box => {
  const [x, y, w, h] = integers(text, 4, 'box') as [number, number, number, number];
  if (w < 1 || h < 1) fail(`Invalid box "${text}": w and h are at least 1.`);
  if (x + w > size.width || y + h > size.height) fail(`The box ${text} leaves the ${size.width}×${size.height} image: keep x + w ≤ ${size.width} and y + h ≤ ${size.height}.`);
  return {x, y, w, h};
};

/** `x,y` inside the image. */
export const parsePoint = (text: string, size: {width: number; height: number}): Point => {
  const [x, y] = integers(text, 2, 'point') as [number, number];
  if (x >= size.width || y >= size.height) fail(`The point ${text} is outside the ${size.width}×${size.height} image: x < ${size.width}, y < ${size.height}.`);
  return {x, y};
};

/** A numeric flag within [min, max]; integers only when asked. */
export const parseNumber = (flag: string, text: string | undefined, {min, max = Infinity, integer = false}: {min: number; max?: number; integer?: boolean}) => {
  if (text === undefined) return undefined;
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
    fail(`Invalid --${flag} "${text}": use ${integer ? 'an integer' : 'a number'} from ${min}${max === Infinity ? ' up' : ` to ${max}`}.`);
  }
  return value;
};

const readPng = (file: string): Rgba => {
  try { return PNG.sync.read(readFileSync(file)); } catch (error) {
    return fail(`Cannot read ${file} as a PNG: ${error instanceof Error ? error.message : String(error)}`);
  }
};
const stem = (file: string) => path.basename(file).replace(/\.png$/i, '');

const positionalsFor = (mode: string, positionals: string[], count: number, usage: string) => {
  if (positionals.length !== count) fail(`inspect ${mode} takes ${usage}. Use npm run stills -- inspect --help.`);
  return positionals;
};

/** Runs one inspect command and returns what to print: the help or one JSON object. */
export const inspect = (args: readonly string[], cwd = process.cwd()): string => {
  const [mode, ...rest] = args;
  if (mode === undefined || mode === '--help' || mode === '-h' || rest.includes('--help') || rest.includes('-h')) return INSPECT_HELP;
  const shown = (file: string) => path.relative(cwd, path.resolve(cwd, file)) || '.';
  const write = (file: string, png: PNG) => {
    mkdirSync(path.dirname(file), {recursive: true});
    writeFileSync(file, PNG.sync.write(png));
    return shown(file);
  };
  const scratch = path.join(projectRoot, 'out', '.scratch', 'inspect');
  const parse = <T extends Record<string, {type: 'string'}>>(options: T) => parseArgs({args: [...rest], allowPositionals: true, strict: true, options});
  let result: Record<string, unknown>;
  if (mode === 'region') {
    const {values, positionals} = parse({vs: {type: 'string'}, threshold: {type: 'string'}});
    const [file, boxText] = positionalsFor(mode, positionals, 2, '<png> x,y,w,h') as [string, string];
    const png = readPng(path.resolve(cwd, file));
    const threshold = parseNumber('threshold', values.threshold, {min: 0, max: 255}) ?? 128;
    const box = parseBox(boxText, png);
    const main = measureRegion(png, box, threshold);
    result = {file: shown(file), size: `${png.width}×${png.height}`, box, stats: main.stats};
    if (values.vs !== undefined) {
      const vsBox = parseBox(values.vs, png);
      const other = measureRegion(png, vsBox, threshold);
      result = {...result, vs: {box: vsBox, stats: other.stats}, contrast: contrast(main, other)};
    }
  } else if (mode === 'profile') {
    const {values, positionals} = parse({step: {type: 'string'}});
    const [file, fromText, toText] = positionalsFor(mode, positionals, 3, '<png> x0,y0 x1,y1') as [string, string, string];
    const png = readPng(path.resolve(cwd, file));
    const from = parsePoint(fromText, png), to = parsePoint(toText, png);
    result = {file: shown(file), from, to, ...profile(png, from, to, parseNumber('step', values.step, {min: 1, integer: true}))};
  } else if (mode === 'crop') {
    const {values, positionals} = parse({zoom: {type: 'string'}, lift: {type: 'string'}, bg: {type: 'string'}, out: {type: 'string'}});
    const [file, boxText] = positionalsFor(mode, positionals, 2, '<png> x,y,w,h') as [string, string];
    const png = readPng(path.resolve(cwd, file));
    const box = parseBox(boxText, png);
    const zoom = parseNumber('zoom', values.zoom, {min: 1, integer: true}) ?? 1;
    const lift = parseNumber('lift', values.lift, {min: 1, max: 4});
    const bg = values.bg ?? 'checker';
    if (!isBackdrop(bg)) fail(`Invalid --bg "${bg}": use checker, dark, light or #rrggbb.`);
    const crop = cropImage(png, box, {zoom, lift, bg});
    const name = `${stem(file)}-${box.x}-${box.y}-${box.w}-${box.h}${zoom === 1 ? '' : `-z${zoom}`}${lift === undefined ? '' : `-lift${lift}`}.png`;
    const out = values.out === undefined ? path.join(scratch, name) : path.resolve(cwd, values.out);
    result = {file: shown(file), box, out: write(out, crop), size: `${crop.width}×${crop.height}`};
  } else if (mode === 'diff') {
    const {values, positionals} = parse({gain: {type: 'string'}, out: {type: 'string'}});
    const [fileA, fileB] = positionalsFor(mode, positionals, 2, '<a.png> <b.png>') as [string, string];
    const a = readPng(path.resolve(cwd, fileA)), b = readPng(path.resolve(cwd, fileB));
    const {changedBox, heatmap} = diffDetail(a, b, parseNumber('gain', values.gain, {min: 0}) ?? 6);
    const {sameSize: _sameSize, ...stats} = diffImages(a, b);
    void _sameSize;
    const out = values.out === undefined ? path.join(scratch, `diff-${stem(fileA)}-${stem(fileB)}.png`) : path.resolve(cwd, values.out);
    result = {a: shown(fileA), b: shown(fileB), ...stats, changedBox, out: write(out, heatmap)};
  } else {
    return fail(`Unknown inspect mode "${mode}": use region, profile, crop or diff. Use npm run stills -- inspect --help.`);
  }
  return JSON.stringify(result, null, 1);
};
