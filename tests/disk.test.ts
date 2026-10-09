import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {assertCanGoOn, assertCanStart, frameScratchBytes, gibibytes} from '../scripts/disk';
import type {ExportOptions} from '../scripts/export';
import {runRender} from '../scripts/render-args';
import {parseValidateArgs} from '../scripts/validate-args';

// The floors are the owner's rule (3 GiB to start, 2 GiB kept while running), written here as literals.
const GiB = 1024 ** 3;
const hint = 'Free space and run again.';

test('disk: a job starts with 3 GiB free and keeps 2 GiB after its estimate', () => {
  assert.doesNotThrow(() => assertCanStart({free: 3 * GiB, where: 'out', then: hint}));
  assert.throws(() => assertCanStart({free: 3 * GiB - 1, where: 'out', then: hint}), /Not enough free disk in out: 3\.0 GiB free, and a render needs at least 3\.0 GiB to start\. Free space and run again\./);
  assert.doesNotThrow(() => assertCanStart({free: 3 * GiB, estimate: 1 * GiB, where: 'out', then: hint}));
  assert.throws(() => assertCanStart({free: 3 * GiB, estimate: 1 * GiB + 1, where: 'out', then: hint}), /this job needs up to 1\.0 GiB and 2\.0 GiB must stay free/);
});

test('disk: a 0.2 GiB stills job with 3.1 GiB free now runs (the old rule kept 3 GiB after it)', () => {
  assert.doesNotThrow(() => assertCanStart({free: 3.1 * GiB, estimate: 0.2 * GiB, where: 'out/review', then: hint}));
});

test('disk: a running render goes on at 2 GiB and stops below it', () => {
  assert.doesNotThrow(() => assertCanGoOn({free: 2 * GiB, where: 'out', then: hint}));
  assert.throws(() => assertCanGoOn({free: 2 * GiB - 1, where: 'out', then: hint}), /below the 2\.0 GiB a running render keeps\. Free space and run again\./);
});

test('disk: between files, the next file\'s estimate must leave 2 GiB', () => {
  assert.doesNotThrow(() => assertCanGoOn({free: 3 * GiB, estimate: 1 * GiB, where: 'out', then: hint}));
  assert.throws(() => assertCanGoOn({free: 3 * GiB, estimate: 1 * GiB + 1, where: 'out', then: hint}), /3\.0 GiB free, the next file needs up to 1\.0 GiB and 2\.0 GiB must stay free\. Free space and run again\./);
});

test('disk: a video keeps every frame before its encode, a still keeps one', () => {
  // Measured on 2026-10-05 (BGC-2, BGC-28): 1920×1080 for 720 frames kept 1.31 GiB as PNG for an mp4.
  const video = {canvas: {width: 1920, height: 1080}, frames: 720};
  assert.ok(frameScratchBytes({format: 'webm', ...video}) >= 1.31 * GiB);
  assert.ok(frameScratchBytes({format: 'mp4', ...video}) >= 1.31 * GiB);
  assert.ok(frameScratchBytes({format: 'gif', ...video}) >= 1.31 * GiB);
  assert.ok(frameScratchBytes({format: 'png', ...video}) < 0.01 * GiB);
});

test('disk: sizes read in GiB, computed in 1024 ** 3', () => {
  assert.equal(gibibytes(1.5 * 1024 * 1024 * 1024), '1.5 GiB');
});

const render = (free: number) => {
  const exported: ExportOptions[] = [];
  const asked: string[] = [];
  const events: string[] = [];
  const run = runRender(['ParticleLoop', '--out', '/nowhere/renders/clip.webm'], {
    defaultOutDirectory: '/nowhere/out',
    effects: {
      readProps: async () => ({}),
      freeBytes: (directory) => {asked.push(directory); events.push('disk'); return free;},
      exportAsset: async (options) => {exported.push(options); events.push('export');},
      withRenderSlot: async (task) => {events.push('slot'); try { await task(); } finally { events.push('release'); }},
      log: () => undefined,
    },
  });
  return {run, exported, asked, events};
};

test('render: refuses below 3 GiB before anything renders, pointing at the way out', async () => {
  const low = render(3 * GiB - 1);
  await assert.rejects(low.run, /a render needs at least 3\.0 GiB to start\. Free space \(npm run clean -- --apply\) and run again\./);
  assert.deepEqual(low.exported, []);
  assert.deepEqual(low.asked, ['/nowhere/renders']);
  const enough = render(3 * GiB);
  await enough.run;
  assert.equal(enough.exported.length, 1);
});

test('render: a 1080p WebM of 12 s is refused before Chrome opens when its frames would leave less than 2 GiB', async () => {
  // 1920×1080 × 720 frames keeps over 1.3 GiB before the encode: 3.2 GiB free passes the start floor but not the run floor.
  const run = (free: number) => {
    const exported: ExportOptions[] = [];
    const done = runRender(['ParticleLoop', '--duration', '12', '--out', '/nowhere/renders/clip.webm'], {
      defaultOutDirectory: '/nowhere/out',
      effects: {
        readProps: async () => ({}), freeBytes: () => free,
        exportAsset: async (options) => {exported.push(options);},
        withRenderSlot: async (task) => task(), log: () => undefined,
      },
    });
    return {done, exported};
  };
  const low = run(3.2 * GiB);
  await assert.rejects(low.done, /3\.2 GiB free, this job needs up to 1\.[3-9] GiB and 2\.0 GiB must stay free\. Free space \(npm run clean -- --apply\)/);
  assert.deepEqual(low.exported, []);
  const tight = run(2.5 * GiB);
  await assert.rejects(tight.done, /2\.5 GiB free/);
  assert.deepEqual(tight.exported, []);
  const enough = run(3.5 * GiB);
  await enough.done;
  assert.equal(enough.exported.length, 1);
});

test('render: measures the disk after taking the render slot, not before waiting for it', async () => {
  const enough = render(3 * GiB);
  await enough.run;
  assert.deepEqual(enough.events, ['slot', 'disk', 'export', 'release']);
});

test('validate:exports: --out picks the folder, and the default is scratch', () => {
  const root = '/repo';
  assert.equal(parseValidateArgs([], root).destination, path.join('/repo', 'out', '.scratch', 'validation'));
  assert.equal(parseValidateArgs(['--out', 'out/review/today'], root).destination, path.join('/repo', 'out', 'review', 'today'));
  assert.equal(parseValidateArgs(['--out', '/elsewhere/validation'], root).destination, '/elsewhere/validation');
  assert.equal(parseValidateArgs(['--kind', 'chat', '--only', 'label-sm'], root).values.only, 'label-sm');
  assert.throws(() => parseValidateArgs(['--out', ' '], root), /Use --out <dir>/);
});

const dryRun = (args: string[], free: number) => {
  const events: string[] = [];
  const logs: string[] = [];
  const done = runRender(['ParticleLoop', '--dry-run', '--out', '/nowhere/renders/clip.webm', ...args], {
    defaultOutDirectory: '/nowhere/out',
    effects: {
      readProps: async () => ({}), freeBytes: () => {events.push('disk'); return free;},
      exportAsset: async () => {events.push('export');},
      withRenderSlot: async (task) => {events.push('slot'); await task();},
      log: (message) => logs.push(message),
    },
  });
  return {done, events, logs};
};

test('render --dry-run: prints the file, its size and its disk need, and neither waits for the slot nor renders', async () => {
  const run = dryRun(['--duration', '12', '--profile', 'delivery'], 40 * GiB);
  await run.done;
  assert.deepEqual(run.events, ['disk']);
  const text = run.logs.join('\n');
  assert.match(text, /^ParticleLoop: webm, 1920×1080, 720 frames, profile delivery$/m);
  assert.match(text, /^ {2}output: \/nowhere\/renders\/clip\.webm$/m);
  assert.match(text, /^ {2}file size: ~\d+ MiB at most \(measured on master renders\)$/m);
  // 1920 × 1080 × 720 frames at 1 B per pixel is 1.39 GiB before the encode.
  assert.match(text, /^ {2}disk while rendering: up to 1\.[4-9] GiB \(frames before the encode: 1\.4 GiB\)$/m);
  assert.match(text, /^ {2}free in .*: 40\.0 GiB; the disk floor lets it start\.$/m);
  const master = dryRun(['--duration', '12'], 40 * GiB);
  await master.done;
  assert.match(master.logs.join('\n'), /^ {2}file size: ~\d+ MiB$/m);
});

test('render --dry-run: a render the disk floor would refuse fails with the floor\'s message and the way out', async () => {
  const run = dryRun(['--duration', '12'], 3.2 * GiB);
  await assert.rejects(run.done, /^Error: Dry run: this render would be refused\. Not enough free disk in .*: 3\.2 GiB free, this job needs up to 1\.[4-9] GiB and 2\.0 GiB must stay free\. Free space \(npm run clean -- --apply\)/);
  assert.deepEqual(run.events, ['disk']);
  assert.equal(run.logs.length, 1, 'the plan is printed before the refusal');
});

test('render --dry-run: an MP4 says its size was never measured and counts only its frames', async () => {
  const run = dryRun([], 40 * GiB);
  const mp4 = runRender(['ParticleLoop', '--format', 'mp4', '--dry-run', '--out', '/nowhere/renders/clip.mp4'], {
    defaultOutDirectory: '/nowhere/out',
    effects: {
      readProps: async () => ({}), freeBytes: () => 40 * GiB, exportAsset: async () => undefined,
      withRenderSlot: async (task) => task(), log: (message) => run.logs.push(message),
    },
  });
  await run.done;
  await mp4;
  assert.match(run.logs.join('\n'), /^ {2}file size: not estimated \(no measured mp4 render yet\)$/m);
});
