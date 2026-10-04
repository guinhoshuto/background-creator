import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {parsePackManifest, planPack, realPackDeps} from '../scripts/pack-plan';
import {
  MAX_SHEET_WIDTH, buildKitJob, contactSheet, diffImages, mergeStillProps, parseJob, regionProblems, regionReport, resolveOutDir,
  seamVerdict, sheetGeometry, streamMockup, wrapFrame, type Rgba,
} from '../scripts/stills-job';

const solid = (width: number, height: number, rgba: [number, number, number, number]): Rgba => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return {width, height, data};
};

test('stills job: defaults, and every reference must name a still', () => {
  const job = parseJob({stills: [{name: 'a', id: 'ChatLoop'}], sheets: [{out: 'sheet.png', names: ['a']}]});
  assert.equal(job.stills[0]!.frame, 0);
  assert.deepEqual(job.sheets![0], {out: 'sheet.png', names: ['a'], cols: 2, width: 700, bg: 'checker'});
  assert.throws(() => parseJob({stills: [{name: 'a', id: 'X'}], sheets: [{out: 's.png', names: ['b']}]}), /sheets\.0 \(s\.png\) refers to "b"/);
  assert.throws(() => parseJob({stills: [{name: 'a', id: 'X'}], mockups: [{out: 'm.png', base: 'bg', layers: [{name: 'a', x: 0, y: 0}]}]}), /base refers to "bg"/);
  assert.throws(() => parseJob({stills: [{name: 'a', id: 'X'}, {name: 'a', id: 'Y'}]}), /"a" repeats/);
  assert.throws(() => parseJob({stills: [{name: 'a', id: 'X'}], seams: ['z']}), /seams\.0 refers to "z"/);
  assert.throws(() => parseJob({stills: [{name: 'a', id: 'X'}], sequences: [{name: 's', still: 'a', from: 5, to: 2}]}), /"to" comes before "from"/);
  assert.throws(() => parseJob({stills: [{name: 'a', id: 'X', typo: 1}]}), /Invalid stills job/);
  assert.throws(() => parseJob({stills: [{name: 'a', id: 'X'}], sheets: [{out: '../x.png', names: ['a']}]}), /Invalid stills job/);
  assert.throws(() => parseJob({stills: []}), /Invalid stills job/);
  assert.deepEqual(parseJob({stills: [{name: 'a', id: 'X'}], baseline: {}}).baseline, {ref: 'HEAD'});
  // Heatmaps are opt-in: 30 full-size PNGs per sequence would eat the disk floor (BGC-24).
  const sequence = {name: 's', still: 'a', from: 0, to: 29};
  assert.equal(parseJob({stills: [{name: 'a', id: 'X'}], sequences: [sequence]}).sequences![0]!.heatmaps, false);
  assert.equal(parseJob({stills: [{name: 'a', id: 'X'}], sequences: [{...sequence, heatmaps: true}]}).sequences![0]!.heatmaps, true);
});

test('stills job: outDir is relative to the job file, else out/review/<date>-<job>', () => {
  const job = parseJob({stills: [{name: 'a', id: 'X'}]});
  assert.equal(resolveOutDir(job, '/tmp/jobs/halloween.json', '/repo', '2026-09-27'), '/repo/out/review/2026-09-27-halloween');
  assert.equal(resolveOutDir({...job, outDir: 'here'}, '/tmp/jobs/halloween.json', '/repo', '2026-09-27'), '/tmp/jobs/here');
});

test('stills job: props merge like a pack, with PNG output and transparent overlays', () => {
  const merged = mergeStillProps({
    preset: {theme: 'midnight', bleed: 24, width: 1}, props: {width: 2, bleed: 72}, sizeProps: {width: 400, bleed: 32}, overlay: true,
  });
  assert.deepEqual(merged, {theme: 'midnight', bleed: 72, width: 400, outputFormat: 'png', transparent: true});
  assert.deepEqual(mergeStillProps({preset: {}, props: undefined, sizeProps: {}, overlay: false}), {outputFormat: 'png'});
  assert.equal(wrapFrame(-1, 720), 719);
  assert.equal(wrapFrame(720, 720), 0);
});

test('stills job: diffs, the loop seam verdict and sheets capped at 1600 px', () => {
  const a = solid(4, 2, [10, 10, 10, 255]);
  const b = solid(4, 2, [20, 10, 10, 255]);
  assert.deepEqual(diffImages(a, a), {sameSize: true, identical: true, mean: 0, max: 0, changedShare: 0});
  assert.deepEqual(diffImages(a, b), {sameSize: true, identical: false, mean: 2.5, max: 10, changedShare: 0.25});
  assert.equal(diffImages(a, solid(2, 2, [0, 0, 0, 0])).sameSize, false);
  assert.equal(seamVerdict(0.4, 0.1).ok, true); // invisible, whatever the ratio
  assert.equal(seamVerdict(3, 1).ok, true);
  assert.deepEqual(seamVerdict(8, 1), {seamMean: 8, stepMean: 1, ratio: 8, ok: false});
  const geometry = sheetGeometry(Array(5).fill({width: 1920, height: 1080}), 5, 700);
  assert.ok(geometry.width <= MAX_SHEET_WIDTH);
  assert.equal(geometry.cells[0]!.h, Math.round((geometry.cellW * 1080) / 1920));
  const sheet = contactSheet([a, b, a], {cols: 2, width: 700, bg: 'dark'});
  assert.equal(sheet.width, 4 + 6 + 4); // never upscaled
  assert.equal(sheet.height, 2 + 6 + 2);
});

test('stills job: regions parse, check their refs, fit each canvas and land in the report', () => {
  const two = [{name: 'a', id: 'X'}, {name: 'b', id: 'Y'}];
  const job = parseJob({stills: two, regions: [
    {name: 'content', box: {x: 1, y: 0, w: 2, h: 2}, lift: 2}, {name: 'corner', box: {x: 0, y: 0, w: 1, h: 1}, stills: ['b'], threshold: 10},
  ]});
  assert.equal(job.regions![0]!.threshold, 128);
  assert.throws(() => parseJob({stills: two, regions: [{name: 'r', box: {x: 0, y: 0, w: 1, h: 1}, stills: ['z']}]}), /regions\.0 \(r\) refers to "z"/);
  assert.throws(() => parseJob({stills: two, regions: [{name: 'r', box: {x: 0, y: 0, w: 1, h: 1}}, {name: 'r', box: {x: 0, y: 0, w: 2, h: 1}}]}), /region name "r" repeats/);
  assert.throws(() => parseJob({stills: two, regions: [{name: 'r', box: {x: 0, y: 0, w: 1601, h: 10}, lift: 1.5}]}), /1601×10 is over 1600×900/);
  assert.throws(() => parseJob({stills: two, regions: [{name: 'r', box: {x: 0, y: 0, w: 10, h: 901}, lift: 1.5}]}), /10×901 is over 1600×900/);
  assert.equal(parseJob({stills: two, regions: [{name: 'r', box: {x: 0, y: 0, w: 1920, h: 1080}}]}).regions!.length, 1); // no lift, no limit
  assert.throws(() => parseJob({stills: two, regions: [{name: 'r', box: {x: 0, y: 0, w: 0, h: 1}}]}), /Invalid stills job/);
  assert.throws(() => parseJob({stills: two, regions: [{name: 'r', box: {x: 0, y: 0, w: 1, h: 1}, lift: 5}]}), /Invalid stills job/);
  const fits = new Map([['a', {width: 4, height: 2}], ['b', {width: 4, height: 2}]]);
  assert.deepEqual(regionProblems(job, fits), []);
  assert.deepEqual(regionProblems(job, new Map([['a', {width: 2, height: 2}], ['b', {width: 2, height: 2}]])), [
    'content: the box 1,0,2,2 leaves the 2×2 image of a', 'content: the box 1,0,2,2 leaves the 2×2 image of b',
  ]);
  // A region restricted to one still is checked only against that still's canvas.
  const wide = parseJob({stills: two, regions: [{name: 'wide', box: {x: 2, y: 0, w: 2, h: 2}, stills: ['b']}]});
  assert.deepEqual(regionProblems(wide, new Map([['a', {width: 1, height: 1}], ['b', {width: 4, height: 2}]])), []);
  // Opaque gray 64 everywhere: luma 64.
  const png = {width: 4, height: 2, data: new Uint8Array(4 * 2 * 4).map((_, i) => (i % 4 === 3 ? 255 : 64))};
  const forA = regionReport(png, 'a', job.regions!);
  assert.deepEqual(Object.keys(forA.stats!), ['content']);
  assert.deepEqual(forA.stats!.content, {meanLuma: 64, stdLuma: 0, p99Luma: 64, meanLstar: 27.09, aboveShare: 0, meanAlpha: 255, alphaNonZeroShare: 1});
  assert.deepEqual(forA.crops.map((crop) => [crop.file, crop.png.width, crop.png.height]), [['regions/a-content.png', 2, 2]]);
  assert.deepEqual([...forA.crops[0]!.png.data.subarray(0, 4)], [128, 128, 128, 255]); // lift 2 turns 64 into 128
  const forB = regionReport(png, 'b', job.regions!);
  assert.deepEqual(Object.keys(forB.stats!), ['content', 'corner']);
  assert.equal(forB.stats!.corner!.aboveShare, 1); // its threshold 10, not the default 128
  assert.deepEqual(forB.crops.map((crop) => crop.file), ['regions/b-content.png']); // corner has no lift, so no crop
  assert.equal(regionReport(png, 'a', []).stats, undefined);
  // Two still/region pairs that name the same lifted crop are refused.
  assert.throws(() => parseJob({stills: [{name: 'a-b', id: 'X'}, {name: 'a', id: 'Y'}], regions: [
    {name: 'c', box: {x: 0, y: 0, w: 1, h: 1}, stills: ['a-b'], lift: 2}, {name: 'b-c', box: {x: 0, y: 0, w: 1, h: 1}, stills: ['a'], lift: 2},
  ]}), /write regions\/a-b-c\.png/);
  assert.equal(parseJob({stills: [{name: 'a-b', id: 'X'}, {name: 'a', id: 'Y'}], regions: [
    {name: 'c', box: {x: 0, y: 0, w: 1, h: 1}, stills: ['a-b'], lift: 2}, {name: 'b-c', box: {x: 0, y: 0, w: 1, h: 1}, stills: ['a']},
  ]}).regions!.length, 2); // without lift there is no crop to collide
});

test('stills job: a mockup places overlays by their box, bleed subtracted', () => {
  const overlay = solid(4, 4, [255, 0, 0, 255]);
  const mock = streamMockup({base: '#000000', width: 8, height: 8, maxWidth: 8, layers: [{image: overlay, x: 2, y: 2, bleed: 1}]});
  const at = (x: number, y: number) => mock.data[(y * 8 + x) * 4];
  assert.equal(at(0, 0), 0);
  assert.equal(at(1, 1), 255); // bleed starts one pixel before the box
  assert.equal(at(4, 4), 255);
  assert.equal(at(5, 5), 0);
});

test('qa:kit: the Halloween night pack becomes one job with sheets and mockups', () => {
  const manifest = parsePackManifest(JSON.parse(readFileSync(path.join(import.meta.dirname, '../packs/halloween-midnight.json'), 'utf8')));
  const job = parseJob(buildKitJob(planPack(manifest, realPackDeps), {frames: [0, 309]}));
  const names = job.stills.map((still) => still.name);
  assert.ok(names.includes('bg-HalloweenLoop-0'));
  assert.ok(names.includes('chat-standard-309'));
  assert.ok(names.includes('webcam-16x9-lg-0'));
  // Stems are the buyer name after the pack: the plain twin keeps its variant, the mask never shows up.
  assert.ok(names.includes('chat-standard-plain-0'));
  assert.ok(!names.some((still) => still.includes('mask') || still.includes('halloween-midnight')));
  assert.equal(new Set(names).size, names.length);
  assert.ok(job.stills.every((still) => still.props?.outputFormat === undefined));
  assert.deepEqual(job.sheets!.map((sheet) => sheet.out).filter((out) => out.endsWith('-0.png')),
    ['sheet-chat-0.png', 'sheet-block-0.png', 'sheet-border-0.png', 'sheet-light-0.png']);
  const chatting = job.mockups!.find((mockup) => mockup.out === 'mock-chatting-0.png')!;
  assert.equal(chatting.base, 'bg-HalloweenLoop-0');
  assert.ok(chatting.layers.some((layer) => layer.name === 'chat-standard-0'));
  // Three backgrounds in one pack: one still each, told apart by their variant.
  const halloween = parsePackManifest(JSON.parse(readFileSync(path.join(import.meta.dirname, '../packs/halloween.json'), 'utf8')));
  const backgrounds = parseJob(buildKitJob(planPack(halloween, realPackDeps), {frames: [0]})).stills.map((still) => still.name).filter((still) => still.startsWith('bg-'));
  assert.deepEqual(backgrounds, ['bg-HalloweenLoop-midnight-0', 'bg-HauntedMansionLoop-haunted-mansion-0', 'bg-CobwebLoop-cobweb-0']);
});
