import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {PNG} from 'pngjs';
import {contrast, cropImage, diffDetail, measureRegion, pixelLight, profile, regionStats} from '../scripts/pixel-stats';
import {inspect, parseBox, parseNumber, parsePoint} from '../scripts/stills-inspect';
import type {Rgba} from '../scripts/stills-job';

const image = (width: number, height: number, at: (x: number, y: number) => [number, number, number, number]): Rgba => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(at(x, y), (y * width + x) * 4);
  return {width, height, data};
};
const light = (rgba: [number, number, number, number]) => pixelLight(rgba, 0);
// Left half black, right half white.
const halves = image(4, 2, (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));

test('inspect: luma and L* are composed over black', () => {
  assert.ok(Math.abs(light([255, 255, 255, 255]).luma - 255) < 1e-9);
  assert.ok(Math.abs(light([255, 255, 255, 255]).lstar - 100) < 1e-9);
  assert.equal(light([0, 0, 0, 255]).luma, 0);
  assert.equal(light([0, 0, 0, 255]).lstar, 0);
  assert.ok(Math.abs(light([119, 119, 119, 255]).lstar - 50) <= 0.5);
  assert.equal(light([255, 255, 255, 0]).luma, 0); // white at alpha 0 is composed black
  assert.equal(light([255, 255, 255, 0]).lstar, 0);
});

test('inspect: region stats of half black, half white, and a box outside refused', () => {
  assert.deepEqual(regionStats(halves, {x: 0, y: 0, w: 4, h: 2}, 128), {
    meanLuma: 127.5, stdLuma: 127.5, p99Luma: 255, meanLstar: 50, aboveShare: 0.5, meanAlpha: 255, alphaNonZeroShare: 1,
  });
  const faint = image(2, 1, (x) => (x === 0 ? [200, 200, 200, 0] : [200, 200, 200, 51]));
  const stats = regionStats(faint, {x: 0, y: 0, w: 2, h: 1});
  assert.equal(stats.meanAlpha, 25.5);
  assert.equal(stats.alphaNonZeroShare, 0.5);
  assert.throws(() => regionStats(halves, {x: 2, y: 0, w: 3, h: 1}), /leaves the 4×2 image/);
  // p99 by nearest rank: 200 grays of luma 0..199, rank ceil(0.99 · 200) = 198 holds 197 (the max is 199).
  const grays = image(200, 1, (x) => [x, x, x, 255]);
  assert.equal(regionStats(grays, {x: 0, y: 0, w: 200, h: 1}).p99Luma, 197);
});

test('inspect: contrast of white against black', () => {
  const white = measureRegion(halves, {x: 2, y: 0, w: 2, h: 2}), black = measureRegion(halves, {x: 0, y: 0, w: 2, h: 2});
  assert.deepEqual(contrast(white, black), {deltaLstar: 100, contrastRatio: 21});
  assert.deepEqual(contrast(black, white), {deltaLstar: -100, contrastRatio: 21});
});

test('inspect: a profile samples the segment, 128 samples at most, last point kept', () => {
  const ramp = image(300, 3, (x) => { const v = Math.round((x * 255) / 299); return [v, v, v, 255]; });
  const short = profile(ramp, {x: 0, y: 1}, {x: 9, y: 1});
  assert.equal(short.points, 10);
  assert.equal(short.step, 1);
  assert.equal(short.lstar.length, 10);
  const long = profile(ramp, {x: 0, y: 0}, {x: 299, y: 0});
  assert.equal(long.points, 300);
  assert.ok(long.lstar.length <= 128, `${long.lstar.length} samples`);
  assert.ok(long.lstar.every((value, i) => i === 0 || value > long.lstar[i - 1]!), 'monotonic');
  assert.equal(long.lstar.at(-1), 100); // the last point, x = 299, is white
  assert.equal(long.min, 0);
  assert.equal(long.max, 100);
  const stepped = profile(ramp, {x: 0, y: 0}, {x: 299, y: 0}, 100);
  assert.equal(stepped.lstar.length, 4); // 0, 100, 200 and the last
  // Steep diagonal: n = max(|dx|, |dy|) + 1; the midpoint and the far end are white.
  const steep = image(3, 5, (x, y) => ((x === 1 && y === 2) || (x === 2 && y === 4) ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  const diagonal = profile(steep, {x: 0, y: 0}, {x: 2, y: 4});
  assert.equal(diagonal.points, 5);
  assert.deepEqual(diagonal.lstar, [0, 0, 100, 0, 100]);
  // Coordinates round (not floor): from (0,0) to (4,1) the midpoint has y = 0.5, which is pixel (2,1).
  const flat = image(5, 2, (x, y) => (x === 2 && y === 1 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  assert.deepEqual(profile(flat, {x: 0, y: 0}, {x: 4, y: 1}).lstar, [0, 0, 100, 0, 0]);
  const upright = image(2, 5, (x, y) => (x === 1 && y === 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  assert.deepEqual(profile(upright, {x: 0, y: 0}, {x: 1, y: 4}).lstar, [0, 0, 100, 0, 0]);
});

test('inspect: crops zoom by nearest pixel, lift, compose alpha and stay within 1600×900', () => {
  const pair = image(3, 1, (x) => [[10, 20, 30, 255], [200, 100, 50, 255], [0, 0, 0, 255]][x] as [number, number, number, number]);
  const zoomed = cropImage(pair, {x: 0, y: 0, w: 2, h: 1}, {zoom: 2});
  assert.equal(zoomed.width, 4);
  assert.equal(zoomed.height, 2);
  const at = (png: PNG, x: number, y: number) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];
  assert.deepEqual(at(zoomed, 1, 1), [10, 20, 30, 255]);
  assert.deepEqual(at(zoomed, 2, 0), [200, 100, 50, 255]);
  const gray = image(1, 1, () => [64, 64, 64, 255]);
  assert.deepEqual(at(cropImage(gray, {x: 0, y: 0, w: 1, h: 1}, {lift: 2}), 0, 0), [128, 128, 128, 255]);
  const clear = image(1, 1, () => [255, 255, 255, 0]);
  assert.deepEqual(at(cropImage(clear, {x: 0, y: 0, w: 1, h: 1}, {bg: 'dark'}), 0, 0), [24, 22, 30, 255]);
  const wide = image(900, 10, () => [0, 0, 0, 255]);
  assert.equal(cropImage(wide, {x: 0, y: 0, w: 800, h: 10}, {zoom: 2}).width, 1600);
  assert.throws(() => cropImage(wide, {x: 0, y: 0, w: 801, h: 10}, {zoom: 2}), /Crop would be 1602×20, over 1600×900/);
  const tall = image(10, 500, () => [0, 0, 0, 255]);
  assert.throws(() => cropImage(tall, {x: 0, y: 0, w: 10, h: 451}, {zoom: 2}), /over 1600×900/);
});

test('inspect: diff finds the changed box, scales the heatmap and refuses other sizes', () => {
  const a = image(5, 4, () => [100, 100, 100, 255]);
  const b = image(5, 4, (x, y) => (x === 3 && y === 2 ? [110, 100, 100, 255] : [100, 100, 100, 255]));
  const {changedBox, heatmap} = diffDetail(a, b);
  assert.deepEqual(changedBox, {x: 3, y: 2, w: 1, h: 1});
  const o = (2 * 5 + 3) * 4;
  assert.deepEqual([...heatmap.data.subarray(o, o + 4)], [60, 0, 0, 255]); // |10| · gain 6
  assert.equal(diffDetail(a, b, 30).heatmap.data[o], 255); // capped
  assert.equal(diffDetail(a, a).changedBox, null);
  assert.equal(diffDetail(a, image(5, 4, () => [102, 100, 100, 255])).changedBox, null); // 2 is not a move
  assert.throws(() => diffDetail(a, image(4, 4, () => [0, 0, 0, 255])), /5×4 and 4×4/);
});

test('inspect: boxes, points and flags are parsed strictly', () => {
  const size = {width: 1920, height: 1080};
  assert.deepEqual(parseBox('10,20,30,40', size), {x: 10, y: 20, w: 30, h: 40});
  assert.deepEqual(parseBox('1900,1000,20,80', size), {x: 1900, y: 1000, w: 20, h: 80});
  assert.throws(() => parseBox('1901,0,20,1', size), /leaves the 1920×1080 image/);
  assert.throws(() => parseBox('0,0,0,5', size), /at least 1/);
  assert.throws(() => parseBox('-1,0,5,5', size), /non-negative integers/);
  assert.throws(() => parseBox('0,0,5', size), /x,y,w,h/);
  assert.throws(() => parseBox('0,0,5.5,5', size), /non-negative integers/);
  assert.deepEqual(parsePoint('1919,1079', size), {x: 1919, y: 1079});
  assert.throws(() => parsePoint('1920,0', size), /outside the 1920×1080 image/);
  assert.equal(parseNumber('threshold', '200', {min: 0, max: 255}), 200);
  assert.equal(parseNumber('threshold', undefined, {min: 0, max: 255}), undefined);
  assert.throws(() => parseNumber('threshold', '256', {min: 0, max: 255}), /--threshold "256"/);
  assert.throws(() => parseNumber('zoom', '1.5', {min: 1, integer: true}), /an integer/);
  assert.throws(() => parseNumber('lift', 'x', {min: 1, max: 4}), /--lift/);
  assert.match(inspect(['--help']), /region {2}<png> x,y,w,h/);
  assert.throws(() => inspect(['region', 'a.png', '0,0,1,1', '--typo', '1']), /Unknown option '--typo'/);
  assert.throws(() => inspect(['blur', 'a.png']), /Unknown inspect mode "blur"/);
});

test('inspect: crop and diff write where they say, relative to the current directory', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'inspect-'));
  try {
    writeFileSync(path.join(dir, 'a.png'), PNG.sync.write(Object.assign(new PNG({width: 4, height: 2}), {data: Buffer.from(halves.data)})));
    const crop = JSON.parse(inspect(['crop', 'a.png', '1,0,2,2', '--zoom', '3', '--out', 'c.png'], dir)) as {out: string; size: string};
    assert.deepEqual(crop, {file: 'a.png', box: {x: 1, y: 0, w: 2, h: 2}, out: 'c.png', size: '6×6'});
    assert.equal(PNG.sync.read(readFileSync(path.join(dir, 'c.png'))).width, 6);
    const diff = JSON.parse(inspect(['diff', 'a.png', 'a.png', '--out', 'd.png'], dir)) as Record<string, unknown>;
    assert.deepEqual(diff, {a: 'a.png', b: 'a.png', identical: true, mean: 0, max: 0, changedShare: 0, changedBox: null, out: 'd.png'});
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('inspect: crop and diff default to out/.scratch/inspect/, never next to the source', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'inspect-default-'));
  const scratch = path.join(import.meta.dirname, '..', 'out', '.scratch', 'inspect');
  const cropFile = path.join(scratch, 'inspect-test-a-1-0-2-2-z2-lift2.png');
  const diffFile = path.join(scratch, 'diff-inspect-test-a-inspect-test-b.png');
  try {
    const bytes = PNG.sync.write(Object.assign(new PNG({width: 4, height: 2}), {data: Buffer.from(halves.data)}));
    writeFileSync(path.join(dir, 'inspect-test-a.png'), bytes);
    writeFileSync(path.join(dir, 'inspect-test-b.png'), bytes);
    const crop = JSON.parse(inspect(['crop', 'inspect-test-a.png', '1,0,2,2', '--zoom', '2', '--lift', '2'], dir)) as {out: string};
    assert.equal(crop.out, path.relative(dir, cropFile));
    assert.ok(existsSync(cropFile), cropFile);
    const diff = JSON.parse(inspect(['diff', 'inspect-test-a.png', 'inspect-test-b.png'], dir)) as {out: string};
    assert.equal(diff.out, path.relative(dir, diffFile));
    assert.ok(existsSync(diffFile), diffFile);
    assert.deepEqual(readdirSync(dir).sort(), ['inspect-test-a.png', 'inspect-test-b.png']); // nothing next to the source
  } finally {
    rmSync(dir, {recursive: true, force: true});
    rmSync(cropFile, {force: true});
    rmSync(diffFile, {force: true});
  }
});

test('inspect: the CLI prints one JSON object', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'inspect-cli-'));
  const file = path.join(dir, 'still.png');
  try {
    writeFileSync(file, PNG.sync.write(Object.assign(new PNG({width: 4, height: 2}), {data: Buffer.from(halves.data)})));
    const root = path.join(import.meta.dirname, '..');
    const out = execFileSync('npx', ['tsx', path.join(root, 'scripts/stills.ts'), 'inspect', 'region', file, '0,0,2,2'], {cwd: root, encoding: 'utf8'});
    const result = JSON.parse(out) as {size: string; stats: {meanLuma: number; meanLstar: number}};
    assert.equal(result.size, '4×2');
    assert.equal(result.stats.meanLuma, 0);
    assert.equal(result.stats.meanLstar, 0);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
