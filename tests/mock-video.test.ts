import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {MOCK_NAMES, listingCutArgs, mockVideoArgs, parseMockNames, planMockVideos} from '../scripts/mock-video';
import {parsePackManifest, planPack, realPackDeps} from '../scripts/pack-plan';

const plan = (pack: string) => planPack(
  parsePackManifest(JSON.parse(readFileSync(path.join(import.meta.dirname, '../packs', `${pack}.json`), 'utf8'))), realPackDeps,
);

test('mock video: names are "all" or known mockups', () => {
  assert.deepEqual(parseMockNames('all'), MOCK_NAMES);
  assert.deepEqual(parseMockNames('mock-chatting, mock-screen'), ['mock-chatting', 'mock-screen']);
  assert.throws(() => parseMockNames('mock-chat'), /--video takes "all" or mockup names.*mock-chatting/);
  assert.throws(() => parseMockNames(' , '), /--video takes/);
});

test('mock video: the chatting scene of a pack, each file at its box minus its own bleed', () => {
  const [video] = planMockVideos(plan('halloween-midnight'), ['mock-chatting']);
  assert.deepEqual(video, {
    name: 'mock-chatting', fps: 60, frames: 720,
    base: 'out/packs/halloween-midnight/backgrounds/halloween-midnight-background.webm',
    layers: [
      // The pack widens this border's bleed to 72; the others keep their size's 32.
      {file: 'out/packs/halloween-midnight/borders/halloween-midnight-webcam-16x9-lg.webm', x: 8, y: 28},
      {file: 'out/packs/halloween-midnight/chat/halloween-midnight-chat-standard-plain.webm', x: 1408, y: 68},
      {file: 'out/packs/halloween-midnight/text-boxes/halloween-midnight-lower-third-plain.webm', x: 48, y: 788},
    ],
  });
  assert.equal(planMockVideos(plan('halloween-haunted-mansion'), ['mock-chatting'])[0]!.frames, 960);
});

test('mock video: a scene the pack cannot fill, or a loop that differs, is refused', () => {
  const full = plan('halloween-midnight');
  assert.throws(() => planMockVideos(full.filter((file) => file.size !== 'chat-standard'), ['mock-chatting']),
    /mock-chatting needs chat-standard \(plain\) as \.webm/);
  assert.throws(() => planMockVideos(full.filter((file) => file.kind !== 'background'), ['mock-chatting']), /no \.webm background/);
  const shorter = full.map((file) => (file.size === 'lower-third' ? {...file, frames: 480} : file));
  assert.throws(() => planMockVideos(shorter, ['mock-chatting']), /lower-third \(plain\) runs 480 frames.*background 720.*jump/);
});

test('mock video: FFmpeg composites one loop, VP9 decoded with alpha', () => {
  const [video] = planMockVideos(plan('halloween-midnight'), ['mock-chatting']);
  const args = mockVideoArgs(video!, (relative) => `/r/${relative}`, '/o/m.mp4');
  assert.equal(args.filter((arg) => arg === 'libvpx-vp9').length, 3);
  assert.equal(args[args.indexOf('-frames:v') + 1], '720');
  assert.equal(args[args.indexOf('-filter_complex') + 1],
    '[0:v]format=rgb24[s0];[s0][1:v]overlay=8:28:format=auto[s1];[s1][2:v]overlay=1408:68:format=auto[s2];'
    + '[s2][3:v]overlay=48:788:format=auto[s3];[s3]format=yuv420p[v]');
  assert.equal(args.at(-1), '/o/m.mp4');
});

test('mock video: a loop over 14.5 s gets a listing cut faded into its own last second', () => {
  assert.equal(listingCutArgs({fps: 60, frames: 720}, 'in.mp4', 'out.mp4'), null);
  assert.equal(listingCutArgs({fps: 60, frames: 870}, 'in.mp4', 'out.mp4'), null);
  const args = listingCutArgs({fps: 60, frames: 960}, 'in.mp4', 'out.mp4')!;
  assert.equal(args[args.indexOf('-filter_complex') + 1],
    '[0:v]trim=end_frame=870,setpts=PTS-STARTPTS[a];[1:v]trim=start_frame=900,setpts=PTS-STARTPTS[b];'
    + '[a][b]xfade=transition=fade:duration=1:offset=13.5,format=yuv420p[v]');
});
