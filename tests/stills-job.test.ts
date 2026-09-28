import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {parsePackManifest, planPack, realPackDeps} from '../scripts/pack-plan';
import {
  MAX_SHEET_WIDTH, buildKitJob, contactSheet, diffImages, mergeStillProps, parseJob, resolveOutDir, seamVerdict,
  sheetGeometry, streamMockup, wrapFrame, type Rgba,
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
  assert.equal(new Set(names).size, names.length);
  assert.ok(job.stills.every((still) => still.props?.outputFormat === undefined));
  assert.deepEqual(job.sheets!.map((sheet) => sheet.out).filter((out) => out.endsWith('-0.png')),
    ['sheet-chat-0.png', 'sheet-block-0.png', 'sheet-border-0.png', 'sheet-light-0.png']);
  const chatting = job.mockups!.find((mockup) => mockup.out === 'mock-chatting-0.png')!;
  assert.equal(chatting.base, 'bg-HalloweenLoop-0');
  assert.ok(chatting.layers.some((layer) => layer.name === 'chat-standard-0'));
});
