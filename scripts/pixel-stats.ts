// Pure pixel measures for `npm run stills -- inspect` and the job's `regions`: region stats,
// contrast, a lightness profile, crops and diff heatmaps. No disk, no browser: tests cover all of it.
//
// Definitions (also in the inspect help):
// - A pixel is composed over black first: c' = c · a / 255 (the same as meanLuma in stills-job.ts).
// - luma: Rec. 709 weights on the composed 8-bit values, 0..255.
// - L* (CIE lightness, 0..100): linearize the composed sRGB values, Y = 0.2126 R + 0.7152 G + 0.0722 B,
//   L* = 116 f(Y) − 16, f(Y) = cbrt(Y) when Y > 216/24389, else (24389/27 · Y + 16) / 116.
import {PNG} from 'pngjs';
import type {Rgba} from './stills-job';

/** Crops (and lifted region crops) are for agents that read images: never over this. */
export const MAX_CROP = {width: 1600, height: 900};

export type Box = {x: number; y: number; w: number; h: number};
export type Point = {x: number; y: number};

const round = (value: number, digits: number) => +value.toFixed(digits);
const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lstarOf = (y: number) => 116 * (y > 216 / 24389 ? Math.cbrt(y) : ((24389 / 27) * y + 16) / 116) - 16;

/** Luma (0..255), relative luminance Y (0..1) and L* (0..100) of one pixel, composed over black. */
export const pixelLight = (data: ArrayLike<number>, i: number) => {
  const a = data[i + 3]! / 255;
  const r = data[i]! * a, g = data[i + 1]! * a, b = data[i + 2]! * a;
  const y = 0.2126 * linear(r / 255) + 0.7152 * linear(g / 255) + 0.0722 * linear(b / 255);
  return {luma: 0.2126 * r + 0.7152 * g + 0.0722 * b, y, lstar: lstarOf(y)};
};

/** Why a box does not fit the image, or null. */
export const boxProblem = (box: Box, size: {width: number; height: number}) =>
  (box.x + box.w > size.width || box.y + box.h > size.height
    ? `the box ${box.x},${box.y},${box.w},${box.h} leaves the ${size.width}×${size.height} image` : null);

const assertInside = (png: Rgba, box: Box) => {
  const problem = boxProblem(box, png);
  if (problem) throw new Error(`${problem[0]!.toUpperCase()}${problem.slice(1)}: keep x + w ≤ ${png.width} and y + h ≤ ${png.height}.`);
};

export type RegionStats = {
  meanLuma: number; stdLuma: number; p99Luma: number; meanLstar: number; aboveShare: number; meanAlpha: number; alphaNonZeroShare: number;
};

/** Region stats plus the mean relative luminance that contrast needs. */
export const measureRegion = (png: Rgba, box: Box, threshold = 128) => {
  assertInside(png, box);
  const n = box.w * box.h;
  const lumas = new Float64Array(n);
  let sum = 0, sumSq = 0, sumY = 0, sumL = 0, above = 0, alpha = 0, nonZero = 0, k = 0;
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    const i = (y * png.width + x) * 4;
    const light = pixelLight(png.data, i);
    lumas[k++] = light.luma;
    sum += light.luma; sumSq += light.luma ** 2; sumY += light.y; sumL += light.lstar;
    if (light.luma > threshold) above++;
    alpha += png.data[i + 3]!; if (png.data[i + 3]! > 0) nonZero++;
  }
  lumas.sort();
  const mean = sum / n;
  const stats: RegionStats = {
    meanLuma: round(mean, 2), stdLuma: round(Math.sqrt(Math.max(0, sumSq / n - mean ** 2)), 2),
    p99Luma: round(lumas[Math.ceil(0.99 * n) - 1]!, 2), meanLstar: round(sumL / n, 2), aboveShare: round(above / n, 4),
    meanAlpha: round(alpha / n, 2), alphaNonZeroShare: round(nonZero / n, 4),
  };
  return {stats, meanY: sumY / n, meanLstar: sumL / n};
};

export const regionStats = (png: Rgba, box: Box, threshold = 128) => measureRegion(png, box, threshold).stats;

/** A against B: the L* difference and the WCAG contrast ratio of their mean relative luminances. */
export const contrast = (a: {meanY: number; meanLstar: number}, b: {meanY: number; meanLstar: number}) => ({
  deltaLstar: round(a.meanLstar - b.meanLstar, 2),
  contrastRatio: round((Math.max(a.meanY, b.meanY) + 0.05) / (Math.min(a.meanY, b.meanY) + 0.05), 2),
});

/**
 * L* along a segment: n = max(|dx|, |dy|) + 1 points, every `step`-th one sampled and the last
 * always kept. The default step keeps it at 128 samples at most.
 */
export const profile = (png: Rgba, from: Point, to: Point, step?: number) => {
  for (const point of [from, to]) assertInside(png, {...point, w: 1, h: 1});
  const dx = to.x - from.x, dy = to.y - from.y;
  const points = Math.max(Math.abs(dx), Math.abs(dy)) + 1;
  const s = step ?? Math.max(1, Math.ceil((points - 1) / 127));
  const indices: number[] = [];
  for (let i = 0; i < points - 1; i += s) indices.push(i);
  indices.push(points - 1);
  const lstar = indices.map((i) => {
    const t = points === 1 ? 0 : i / (points - 1);
    const x = Math.round(from.x + dx * t), y = Math.round(from.y + dy * t);
    return round(pixelLight(png.data, (y * png.width + x) * 4).lstar, 1);
  });
  return {points, step: s, lstar, min: Math.min(...lstar), max: Math.max(...lstar), mean: round(lstar.reduce((a, b) => a + b, 0) / lstar.length, 2)};
};

const hex = (value: string) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];

/** A backdrop's solid color, or null for the 16 px checker (150 / 205) of the sheets. */
export const backdropColor = (bg: string): [number, number, number] | null =>
  (bg.startsWith('#') ? hex(bg) : bg === 'dark' ? [24, 22, 30] : bg === 'light' ? [236, 236, 240] : null);

export const isBackdrop = (bg: string) => ['checker', 'dark', 'light'].includes(bg) || /^#[0-9a-fA-F]{6}$/.test(bg);

/**
 * The box as a new opaque PNG: nearest-neighbour zoom, composed over a backdrop so alpha stays
 * visible, then an optional gamma lift out = 255 · (v / 255)^(1 / lift) (above 1 brightens shadows).
 */
export const cropImage = (png: Rgba, box: Box, {zoom = 1, lift = 1, bg = 'checker'}: {zoom?: number; lift?: number; bg?: string} = {}) => {
  assertInside(png, box);
  const width = box.w * zoom, height = box.h * zoom;
  if (width > MAX_CROP.width || height > MAX_CROP.height) {
    throw new Error(`Crop would be ${width}×${height}, over ${MAX_CROP.width}×${MAX_CROP.height}: lower --zoom or the box.`);
  }
  const solid = backdropColor(bg);
  const target = new PNG({width, height});
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const s = ((box.y + Math.floor(y / zoom)) * png.width + box.x + Math.floor(x / zoom)) * 4, a = png.data[s + 3]! / 255;
    const checker = ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) ? 205 : 150;
    const o = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) {
      const v = png.data[s + c]! * a + (solid ? solid[c]! : checker) * (1 - a);
      target.data[o + c] = Math.round(lift === 1 ? v : 255 * (v / 255) ** (1 / lift));
    }
    target.data[o + 3] = 255;
  }
  return target;
};

/** Bounding box of the pixels where any channel moved more than 2 (null when none), and a full-size heatmap. */
export const diffDetail = (a: Rgba, b: Rgba, gain = 6) => {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`The images differ in size: ${a.width}×${a.height} and ${b.width}×${b.height}. Diff same-size images.`);
  }
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  const heatmap = new PNG({width: a.width, height: a.height});
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4;
    let moved = false;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a.data[i + c]! - b.data[i + c]!);
      if (d > 2) moved = true;
      if (c < 3) heatmap.data[i + c] = Math.min(255, Math.round(d * gain));
    }
    heatmap.data[i + 3] = 255;
    if (moved) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return {changedBox: x1 < 0 ? null : {x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1}, heatmap};
};
