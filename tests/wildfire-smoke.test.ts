import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {catalogFixtureAssets, planFixtures} from '../scripts/validate-fixtures';
import {
  BUILD_FIX, MISSING_FRAMES_MESSAGE, WILDFIRE_SEQUENCE, frameFileOf, manifestProblems, parseManifest, sequenceFrame,
  type SequenceExpectation, type WildfireManifest,
} from '../src/backgrounds/wildfire/manifest';
import {DURATION_MESSAGE, LOOP_SECONDS, OPAQUE_MESSAGE, wildfireFrameFile, wildfireSmokeLoopSchema} from '../src/backgrounds/WildfireSmokeLoop';
import {backgroundCatalog, getOpenGlRenderer} from '../src/catalog';
import {getCompositionMetadata} from '../src/settings';

// No frame on disk and no Blender here: the manifest below is what scripts/create-wildfire-smoke.py writes.
const SHA = 'a'.repeat(64);
const FULL: WildfireManifest = {
  name: 'wildfire-smoke', version: 1, width: 1920, height: 1080, fps: 60, frames: 480, loop: true, direction: 'D-06',
  blender: '5.2.2', script_sha256: SHA, samples: 16, percent: 100, complete: true, rendered: [[0, 479]],
};
const EXPECTED: SequenceExpectation = {frames: 480, width: 1920, height: 1080, fps: 60};
const defaults = wildfireSmokeLoopSchema.parse({});

test('WildfireSmokeLoop: a frame is a four-digit WebP, and only a frame of the sequence has a file', () => {
  assert.equal(frameFileOf(0, 480), '0000.webp');
  assert.equal(frameFileOf(7, 480), '0007.webp');
  assert.equal(frameFileOf(479, 480), '0479.webp');
  assert.equal(frameFileOf(12000, 12001), '12000.webp', 'a longer sequence widens the number');
  for (const frame of [480, -1, 1.5, Number.NaN]) {
    assert.throws(() => frameFileOf(frame, 480), /outside the sequence 0\.\.479/, String(frame));
  }
  assert.throws(() => frameFileOf(0, 0), /whole number of frames from 1/);
});

test('WildfireSmokeLoop: frame 480 shows frame 0, at 60 fps, over 16 s and in a 50 fps GIF', () => {
  // 60 fps, 8 s: the clock is the frame itself.
  for (const frame of [0, 1, 137, 479]) assert.equal(sequenceFrame(frame, 480), frame);
  assert.equal(sequenceFrame(480, 480), 0);
  assert.equal(wildfireFrameFile(480, 480), wildfireFrameFile(0, 480));
  assert.equal(wildfireFrameFile(0, 480), 'wildfire-smoke/0000.webp');
  assert.equal(wildfireFrameFile(479, 480), 'wildfire-smoke/0479.webp');
  // 16 s: the sequence plays twice, whole.
  assert.equal(sequenceFrame(480, 960), 0);
  assert.equal(sequenceFrame(959, 960), 479);
  assert.equal(sequenceFrame(960, 960), 0);
  assert.deepEqual([0, 1, 2].map((frame) => sequenceFrame(frame, 960)), [0, 1, 2]);
  // GIF, 50 fps, 8 s = 400 frames: one pass, every fifth frame skipped, closing on frame 0.
  assert.equal(sequenceFrame(0, 400), 0);
  assert.equal(sequenceFrame(400, 400), 0);
  assert.equal(sequenceFrame(399, 400), 478);
  for (let frame = 1; frame <= 400; frame++) {
    const step = (sequenceFrame(frame, 400) - sequenceFrame(frame - 1, 400) + 480) % 480;
    assert.ok(step === 1 || step === 2, `GIF frame ${frame}: step ${step}`);
  }
  assert.throws(() => sequenceFrame(0, 0), /whole numbers/);
  assert.throws(() => sequenceFrame(0.5, 480), /whole numbers/);
});

test('WildfireSmokeLoop: the manifest is what the Blender script writes, and nothing else', () => {
  assert.deepEqual(parseManifest(FULL), FULL);
  assert.deepEqual(parseManifest({...FULL, extra: 'ignored'}), FULL);
  for (const [bad, why] of [
    ['not json', /not a JSON object but "not json"/],
    [null, /not a JSON object but null/],
    [{}, /name: expected a name, got nothing/],
    [{...FULL, frames: '480'}, /frames: expected a whole number from 1, got "480"/],
    [{...FULL, rendered: [[0]]}, /rendered: expected a list of \[first, last\] frame ranges/],
    [{...FULL, rendered: [[10, 2]]}, /rendered: expected a list/],
    [{...FULL, script_sha256: 'abc'}, /script_sha256: expected a hex SHA-256, got "abc"/],
    [{...FULL, complete: 'yes'}, /complete: expected true or false, got "yes"/],
  ] as const) {
    assert.throws(() => parseManifest(bad), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^public\/wildfire-smoke\/manifest\.json is not a wildfire smoke manifest/);
      assert.match(error.message, why);
      assert.match(error.message, /run npm run build:wildfire with the Sandisk connected\.$/);
      return true;
    }, JSON.stringify(bad));
  }
});

test('WildfireSmokeLoop: a missing, incomplete, resized or stale sequence is refused with the reason', () => {
  assert.deepEqual(manifestProblems(FULL, EXPECTED), []);
  assert.deepEqual(manifestProblems(FULL, {...EXPECTED, scriptSha256: SHA}), []);
  assert.deepEqual(manifestProblems(FULL, {...EXPECTED, scriptSha256: SHA.toUpperCase()}), [], 'the sha compares case-insensitively');
  assert.deepEqual(manifestProblems({...FULL, rendered: [[240, 479], [0, 239]]}, EXPECTED), [], 'ranges in any order');
  assert.deepEqual(manifestProblems(null, EXPECTED), ['public/wildfire-smoke/manifest.json is missing: no frames were rendered']);
  assert.deepEqual(manifestProblems(undefined, EXPECTED), manifestProblems(null, EXPECTED));
  const one = (manifest: WildfireManifest, expected = EXPECTED) => {
    const problems = manifestProblems(manifest, expected);
    assert.equal(problems.length, 1, problems.join('; '));
    return problems[0]!;
  };
  assert.equal(one({...FULL, complete: false, rendered: [[0, 59]]}), 'incomplete: rendered 0-59 of 0-479 (complete: false)');
  assert.equal(one({...FULL, complete: false, rendered: []}), 'incomplete: rendered nothing of 0-479 (complete: false)');
  assert.match(one({...FULL, rendered: [[0, 239], [300, 479]]}), /^incomplete: rendered 0-239, 300-479 of 0-479 \(complete: true\)$/, 'a gap is incomplete even when the script says complete');
  assert.equal(one(FULL, {...EXPECTED, scriptSha256: 'f'.repeat(64)}), `stale: rendered by script ${'a'.repeat(8)}, the current script is ffffffff`);
  assert.equal(one({...FULL, fps: 50}), 'fps: 50, expected 60');
  assert.equal(one({...FULL, width: 960, height: 540}), 'size: 960×540, expected 1920×1080');
  assert.equal(one({...FULL, frames: 240, rendered: [[0, 239]]}), 'frames: 240, expected 480');
  assert.equal(one({...FULL, loop: false}), 'loop: false, expected a sequence that closes on itself');
  assert.equal(one({...FULL, name: 'tokyo'}), 'name: "tokyo", expected "wildfire-smoke"');
  // Every reason at once, in one list.
  assert.equal(manifestProblems({...FULL, fps: 50, complete: false, rendered: [[0, 10]]}, {...EXPECTED, scriptSha256: 'f'.repeat(64)}).length, 3);
  assert.equal(MISSING_FRAMES_MESSAGE, 'The wildfire smoke frames are missing, incomplete or stale: run npm run build:wildfire with the Sandisk connected.');
  assert.ok(MISSING_FRAMES_MESSAGE.endsWith(`${BUILD_FIX}.`));
});

test('WildfireSmokeLoop: the duration is a whole number of 8 s passes, the scene is opaque and full HD', () => {
  assert.equal(LOOP_SECONDS, 8);
  assert.equal(defaults.durationSeconds, 8);
  assert.equal(defaults.transparent, false);
  assert.equal(defaults.backgroundColor, '#260401');
  assert.ok(!('colors' in defaults), 'the sequence does not recolour');
  for (const durationSeconds of [8, 16, 24]) {
    assert.equal(wildfireSmokeLoopSchema.safeParse({durationSeconds}).success, true, `${durationSeconds} s`);
  }
  for (const durationSeconds of [12, 4, 8.5, 20]) {
    const result = wildfireSmokeLoopSchema.safeParse({durationSeconds});
    assert.equal(result.success, false, `${durationSeconds} s`);
    assert.ok(result.error!.issues.some((issue) => issue.message === DURATION_MESSAGE), `${durationSeconds} s: ${result.error!.message}`);
  }
  assert.equal(DURATION_MESSAGE, 'The wildfire smoke frames loop every 8 s: use 8, 16 or 24 s.');
  for (const input of [{durationSeconds: 0}, {durationSeconds: -8}, {transparent: true}, {colors: ['#000000', '#ffffff']}]) {
    assert.equal(wildfireSmokeLoopSchema.strict().safeParse(input).success, false, JSON.stringify(input));
  }
  const alpha = wildfireSmokeLoopSchema.safeParse({transparent: true});
  assert.equal(alpha.success, false);
  assert.ok(alpha.error!.issues.some((issue) => issue.message === OPAQUE_MESSAGE), alpha.error!.message);
  assert.equal(OPAQUE_MESSAGE, 'The smoke is an opaque scene: choose a different background for alpha.');
  assert.deepEqual(getCompositionMetadata(defaults), {width: 1920, height: 1080, fps: 60, durationInFrames: 480});
  assert.deepEqual(getCompositionMetadata({...defaults, durationSeconds: 16}).durationInFrames, 960);
  assert.deepEqual(getCompositionMetadata({...defaults, outputFormat: 'gif'}), {width: 1920, height: 1080, fps: 50, durationInFrames: 400});
  assert.deepEqual([WILDFIRE_SEQUENCE.width, WILDFIRE_SEQUENCE.height, WILDFIRE_SEQUENCE.fps, WILDFIRE_SEQUENCE.frames], [1920, 1080, 60, 480]);
});

test('WildfireSmokeLoop: the catalog entry has no WebGL backend, and the preset is the defaults', () => {
  const entry = backgroundCatalog.WildfireSmokeLoop;
  assert.equal(entry.kind, 'background');
  assert.deepEqual(entry.defaultProps, defaults);
  assert.equal(getOpenGlRenderer(entry), null);
  const preset: unknown = JSON.parse(readFileSync(new URL('../presets/wildfire-smoke.json', import.meta.url), 'utf8'));
  assert.deepEqual(wildfireSmokeLoopSchema.strict().parse(preset), defaults);
  assert.deepEqual(preset, defaults, 'the preset spells every default out');
});

test('WildfireSmokeLoop: validate:exports samples it opaque in every format, over one 8 s pass, and says why', () => {
  const fixtures = planFixtures({
    assets: catalogFixtureAssets(), kinds: ['background'], composition: 'WildfireSmokeLoop', presets: false, pairs: [], durationSeconds: 0.4,
  });
  assert.deepEqual(fixtures.map((fixture) => fixture.file), ['WildfireSmokeLoop-opaque.mp4', 'WildfireSmokeLoop-opaque.webm', 'WildfireSmokeLoop-opaque.gif']);
  assert.ok(fixtures.every((fixture) => fixture.durationSeconds === LOOP_SECONDS && !fixture.profile.transparent));
  assert.deepEqual(fixtures[0]!.notes, [
    `WildfireSmokeLoop: sampled over 8 s, its own duration, not 0.4 s: durationSeconds: ${DURATION_MESSAGE}`,
    `WildfireSmokeLoop: sampled opaque in every format, with no alpha profile: transparent: ${OPAQUE_MESSAGE}`,
  ]);
});
