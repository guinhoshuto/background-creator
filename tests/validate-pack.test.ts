import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {PNG} from 'pngjs';
import type {PlannedFile} from '../scripts/pack-plan';
import {TWITCH_PANEL_MAX_BYTES, mediaIssues, probeMedia, type MediaProbe} from '../scripts/pack-validate';
import {assertFullFfmpeg, ffmpegPath, missingCodecs, runProcess} from '../scripts/process';

// The pure check against literal probes, then tiny real files made by ffmpeg (no render).

const planned = (extra: Partial<PlannedFile> = {}): PlannedFile => ({
  composition: 'BlockLoop', kind: 'block', folder: 'text-boxes', size: 'card', format: 'webm',
  props: {}, exportProps: {transparent: true}, output: 'out/packs/test/text-boxes/test-card.webm',
  canvas: {width: 16, height: 16}, fps: 30, frames: 3, ...extra,
});

const GOOD: MediaProbe = {
  bytes: 1000, codec: 'vp9', width: 16, height: 16, fps: 30, frames: 3, duration: 0.1,
  audio: false, alphaTag: true, minAlpha: 0, loopsForever: null,
};

test('a file that is what the plan says has no issue', () => {
  assert.deepEqual(mediaIssues(planned(), GOOD), []);
});

test('each difference from the plan is named', () => {
  const cases: [Partial<MediaProbe>, RegExp][] = [
    [{codec: 'h264'}, /codec h264, expected vp9/],
    [{width: 18}, /18×16, expected 16×16/],
    [{frames: 2}, /2 frames, expected 3/],
    [{fps: 25}, /25 fps, expected 30/],
    [{duration: 0.2}, /lasts 0\.200 s/],
    [{audio: true}, /audio/],
    [{alphaTag: false}, /ALPHA_MODE/],
    [{minAlpha: 255}, /fully opaque/],
  ];
  for (const [patch, pattern] of cases) {
    const issues = mediaIssues(planned(), {...GOOD, ...patch});
    assert.equal(issues.length, 1, `${JSON.stringify(patch)} → ${issues.join('; ')}`);
    assert.match(issues[0]!, pattern);
  }
});

test('an opaque file must have no transparent pixel', () => {
  const file = planned({exportProps: {transparent: false}});
  assert.deepEqual(mediaIssues(file, {...GOOD, alphaTag: false, minAlpha: 255}), []);
  assert.match(mediaIssues(file, {...GOOD, alphaTag: false, minAlpha: 254}).join(), /has transparency \(alpha 254\)/);
});

test('a GIF never keeps alpha, must loop forever and the Twitch panel stays under 2.9 MB', () => {
  const panel = planned({format: 'gif', size: 'twitch-panel', folder: 'twitch-panels', exportProps: {transparent: true}});
  const gif = {...GOOD, codec: 'gif', alphaTag: false, minAlpha: 255, loopsForever: true};
  assert.equal(TWITCH_PANEL_MAX_BYTES, 2_900_000);
  assert.deepEqual(mediaIssues(panel, {...gif, bytes: 2_900_000}), []);
  // The ornamented panel measured on 2026-09-30: 2,972,501 B, over the limit.
  assert.match(mediaIssues(panel, {...gif, bytes: 2_972_501}).join(), /2972501 B, over the 2900000 B/);
  assert.match(mediaIssues(panel, {...gif, loopsForever: false}).join(), /does not loop forever/);
  // The ceiling is the panel's: another GIF may be larger.
  assert.deepEqual(mediaIssues({...panel, size: 'card'}, {...gif, bytes: 5_000_000}), []);
});

test('a still is not held to a rate, frame count or duration', () => {
  const still = planned({format: 'png', frames: 3, frame: 0});
  assert.deepEqual(mediaIssues(still, {...GOOD, codec: 'png', fps: null, frames: 1, duration: null, alphaTag: false}), []);
});

const withDirectory = async (body: (directory: string) => Promise<void>) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'validate-pack-'));
  try {await body(directory);} finally {await rm(directory, {recursive: true, force: true});}
};

const ffmpeg = (args: string[]) => runProcess(ffmpegPath(), ['-v', 'error', '-y', ...args]);
// A half-transparent 16×16 square, 3 frames at 30 fps.
const SOURCE = ['-f', 'lavfi', '-i', 'color=c=red@0.5:s=16x16:r=30:d=0.1,format=rgba'];
// GIF delays are in hundredths of a second: the exporter renders GIF at 50 fps, which they hold exactly.
const GIF_SOURCE = ['-f', 'lavfi', '-i', 'color=c=red:s=16x16:r=50:d=0.06'];

test('real files read back: VP9 alpha, opaque VP9, a looping GIF and a PNG', async () => {
  await withDirectory(async (directory) => {
    const alpha = path.join(directory, 'alpha.webm');
    await ffmpeg([...SOURCE, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', alpha]);
    const alphaProbe = await probeMedia(alpha, 'webm');
    assert.deepEqual(mediaIssues(planned(), alphaProbe), []);
    assert.equal(alphaProbe.frames, 3);

    const opaque = path.join(directory, 'opaque.webm');
    await ffmpeg([...SOURCE, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', opaque]);
    const issues = mediaIssues(planned(), await probeMedia(opaque, 'webm'));
    assert.ok(issues.some((issue) => /ALPHA_MODE/.test(issue)) && issues.some((issue) => /fully opaque/.test(issue)), issues.join('; '));

    const gifFile = planned({format: 'gif', fps: 50, exportProps: {transparent: false}});
    const looping = path.join(directory, 'loop.gif');
    await ffmpeg([...GIF_SOURCE, '-loop', '0', looping]);
    assert.deepEqual(mediaIssues(gifFile, await probeMedia(looping, 'gif')), []);
    const once = path.join(directory, 'once.gif');
    await ffmpeg([...GIF_SOURCE, '-loop', '-1', once]);
    assert.match(mediaIssues(gifFile, await probeMedia(once, 'gif')).join(), /does not loop forever/);

    const png = new PNG({width: 16, height: 16});
    png.data.fill(255);
    png.data[3] = 0;
    const still = path.join(directory, 'still.png');
    await writeFile(still, PNG.sync.write(png));
    const stillFile = planned({format: 'png', frame: 0});
    assert.deepEqual(mediaIssues(stillFile, await probeMedia(still, 'png')), []);
    assert.match(mediaIssues({...stillFile, canvas: {width: 32, height: 16}}, await probeMedia(still, 'png')).join(), /16×16, expected 32×16/);
  });
});

test('the validators refuse an FFmpeg that cannot read every shipped format back', async () => {
  const encoders = ' V....D libvpx-vp9           libvpx VP9 (codec vp9)\n V..... prores_ks            Apple ProRes (iCodec Pro) (codec prores)\n V....D gif                  GIF (Graphics Interchange Format)\n';
  const decoders = ' V....D libvpx-vp9           libvpx VP9 (codec vp9)\n VFS..D prores               Apple ProRes (iCodec Pro)\n V....D gif                  GIF (Graphics Interchange Format)\n VFS..D png                  PNG (Portable Network Graphics) image\n';
  assert.deepEqual(missingCodecs(encoders, decoders), []);
  assert.deepEqual(missingCodecs(encoders, decoders.replace('libvpx-vp9', 'vp9')), ['decoder libvpx-vp9']);
  assert.deepEqual(missingCodecs(encoders.replace('prores_ks', 'prores_aw'), decoders), ['encoder prores_ks']);
  // The FFmpeg this machine runs the validators with has them all.
  await assertFullFfmpeg();
});
