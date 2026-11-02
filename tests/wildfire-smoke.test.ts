import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {catalogFixtureAssets, planFixtures} from '../scripts/validate-fixtures';
import {
  BUILD_FIX, MISSING_FRAMES_MESSAGE, WILDFIRE_SEQUENCE, frameFileOf, manifestProblems, parseManifest, sequenceFrame,
  type SequenceExpectation, type WildfireManifest,
} from '../src/backgrounds/wildfire/manifest';
import {DURATION_MESSAGE, LOOP_SECONDS, OPAQUE_MESSAGE, wildfireFrameFile, wildfireSmokeLoopSchema} from '../src/backgrounds/WildfireSmokeLoop';
import {SPARK_CORNERS, emberColor, getSparkScene, type Spark} from '../src/backgrounds/wildfire/sparks';
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
  assert.equal(defaults.tint, 0, 'the red of the frames, untouched');
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

const sparkProps = (over: Record<string, unknown> = {}) => wildfireSmokeLoopSchema.parse({sparks: 'bottom-right', ...over});
const scene = (over: Record<string, unknown>, frame: number, length = 480) => getSparkScene(sparkProps(over), frame, length);

test('WildfireSmokeLoop sparks: off by default, and a scene only with a corner and slots', () => {
  assert.equal(wildfireSmokeLoopSchema.parse({}).sparks, 'none');
  assert.deepEqual(SPARK_CORNERS, ['none', 'bottom-left', 'bottom-right', 'bottom']);
  assert.deepEqual(getSparkScene(wildfireSmokeLoopSchema.parse({}), 200, 480), []);
  assert.deepEqual(scene({sparkCount: 0}, 200), []);
  assert.ok(scene({}, 200).length > 0);
  for (const bad of [{sparks: 'top'}, {sparkCount: -1}, {sparkCount: 401}, {sparkSize: 0}, {sparkRise: 10}, {sparkTrail: -1}, {sparkAngle: -1}, {sparkAngle: 71}, {tint: -1}, {tint: 361}]) {
    assert.equal(wildfireSmokeLoopSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test('WildfireSmokeLoop sparks: the same seed draws the same embers, another seed others, and frame 480 is frame 0', () => {
  const first = scene({seed: 42}, 137);
  assert.deepEqual(scene({seed: 42}, 137), first);
  assert.notDeepEqual(scene({seed: 43}, 137), first);
  assert.notDeepEqual(scene({seed: 42}, 180), first);
  // One pass, two passes and the 50 fps GIF all close on frame 0 and repeat the sequence frame.
  assert.deepEqual(scene({seed: 42}, 480), scene({seed: 42}, 0));
  assert.deepEqual(scene({seed: 42}, 497, 960), scene({seed: 42}, 17, 960));
  assert.deepEqual(scene({seed: 42}, 17, 960), scene({seed: 42}, 17, 480));
  assert.deepEqual(scene({seed: 42}, 400, 400), scene({seed: 42}, 0, 400));
  assert.deepEqual(scene({seed: 42}, 479), scene({seed: 42}, -1));
});

test('WildfireSmokeLoop sparks: embers are born in the chosen corner strip, rise, drift inwards and fade', () => {
  const alive: Spark[] = [];
  for (let frame = 0; frame < 480; frame += 7) alive.push(...scene({seed: 7, sparkCount: 120}, frame));
  assert.ok(alive.length > 120 * 10, `${alive.length} embers seen in 69 frames`);
  for (const spark of alive) {
    assert.ok(spark.x > 1920 - 320 - 90 * 8 - 40 && spark.x <= 1920 + 40, `x ${spark.x} stays near the right corner`);
    assert.ok(spark.y <= 1080 + 90 && spark.y > -200, `y ${spark.y}`);
    assert.ok(spark.opacity >= 0 && spark.opacity <= 1, `opacity ${spark.opacity}`);
    assert.ok(spark.radius > 0);
    assert.match(spark.color, /^#[0-9a-f]{6}$/);
    assert.ok(spark.tail !== null && spark.tail.y > spark.y, 'the streak hangs below the ember');
  }
  const left = scene({seed: 7, sparks: 'bottom-left'}, 100);
  assert.ok(left.length > 0 && left.every((spark) => spark.x < 320 + 90 * 8 + 40 && spark.x >= -40));
  assert.ok(scene({seed: 7, sparkTrail: 0}, 100).every((spark) => spark.tail === null));
  // Along the whole bottom, the embers come from everywhere and drift either way.
  const bottom: Spark[] = [];
  for (let frame = 0; frame < 480; frame += 7) bottom.push(...scene({seed: 7, sparks: 'bottom', sparkCount: 300}, frame));
  assert.ok(bottom.some((spark) => spark.x < 400) && bottom.some((spark) => spark.x > 1500) && bottom.some((spark) => spark.x > 800 && spark.x < 1100), 'the whole width');
  assert.ok(bottom.every((spark) => spark.x >= -200 && spark.x <= 2120 && spark.y <= 1080 + 90));
  // An ember with no fade room is never shown at full brightness in its first frame of life.
  assert.ok(alive.some((spark) => spark.opacity < 0.5) && alive.some((spark) => spark.opacity > 0.5));
});

test('WildfireSmokeLoop sparks: an ember cools from white-yellow to deep red', () => {
  assert.equal(emberColor(0), '#ffe8a0');
  assert.equal(emberColor(0.5), '#ff9628');
  assert.equal(emberColor(1), '#ff3a1a');
  assert.equal(emberColor(-3), emberColor(0));
  assert.equal(emberColor(9), emberColor(1));
});

test('WildfireSmokeLoop sparks: the embers cross the loop seam at the speed of any other frame', () => {
  // Frame 480 is frame 0: an ember alive on both sides moves there by the same step as between two
  // ordinary frames. A period that does not divide the loop would make it jump (or vanish) at the seam.
  const at = (frame: number) => new Map(scene({seed: 11, sparkCount: 200}, frame).map((spark) => [spark.slot, spark] as const));
  const steps = (a: Map<number, Spark>, b: Map<number, Spark>) => {
    const deltas = new Map<number, {dx: number; dy: number}>();
    for (const [slot, spark] of b) {
      const before = a.get(slot);
      if (before) deltas.set(slot, {dx: spark.x - before.x, dy: spark.y - before.y});
    }
    return deltas;
  };
  const regular = steps(at(477), at(478));
  const seam = steps(at(479), at(480));
  assert.ok(seam.size > 20, `${seam.size} embers alive across the seam`);
  let compared = 0;
  for (const [slot, step] of seam) {
    const usual = regular.get(slot);
    if (!usual) continue;
    compared++;
    assert.ok(step.dy < 0, `slot ${slot} rises across the seam`);
    assert.ok(Math.abs(step.dy - usual.dy) < 1 && Math.abs(step.dx - usual.dx) < 2,
      `slot ${slot}: seam step ${step.dx.toFixed(2)}, ${step.dy.toFixed(2)} against ${usual.dx.toFixed(2)}, ${usual.dy.toFixed(2)}`);
  }
  assert.ok(compared > 20, `${compared} embers compared`);
});

test('WildfireSmokeLoop sparks: sparkAngle tilts the embers of a corner towards the middle, and the bottom ignores it', () => {
  const slopeOf = (over: Record<string, unknown>) => {
    const before = new Map(scene({seed: 5, sparkCount: 200, sparkTrail: 0, ...over}, 100).map((spark) => [spark.slot, spark] as const));
    let dx = 0;
    let dy = 0;
    let seen = 0;
    for (const spark of scene({seed: 5, sparkCount: 200, sparkTrail: 0, ...over}, 101)) {
      const was = before.get(spark.slot);
      if (!was) continue;
      dx += spark.x - was.x;
      dy += was.y - spark.y;
      seen++;
    }
    assert.ok(seen > 20, `${seen} embers followed`);
    return dx / dy;
  };
  const straight = slopeOf({});
  assert.ok(straight < 0 && straight > -0.3, `straight up from the right corner, slope ${straight.toFixed(3)}`);
  const tilted = slopeOf({sparkAngle: 40});
  assert.ok(tilted < -0.65 && tilted > -1.15, `40 degrees towards the left, slope ${tilted.toFixed(3)} (tan 40 is 0.84)`);
  const mirrored = slopeOf({sparks: 'bottom-left', sparkAngle: 40});
  assert.ok(mirrored > 0.65 && mirrored < 1.15, `the left corner tilts right, slope ${mirrored.toFixed(3)}`);
  const bottom = slopeOf({sparks: 'bottom', sparkCount: 300, sparkAngle: 40});
  assert.ok(Math.abs(bottom) < 0.1, `the bottom keeps rising straight, slope ${bottom.toFixed(3)}`);
});
