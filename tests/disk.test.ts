import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {assertCanGoOn, assertCanStart, gibibytes} from '../scripts/disk';
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

test('disk: sizes read in GiB, computed in 1024 ** 3', () => {
  assert.equal(gibibytes(1.5 * 1024 * 1024 * 1024), '1.5 GiB');
});

const render = (free: number) => {
  const exported: ExportOptions[] = [];
  const asked: string[] = [];
  const run = runRender(['ParticleLoop', '--out', '/nowhere/renders/clip.webm'], {
    defaultOutDirectory: '/nowhere/out',
    effects: {
      readProps: async () => ({}),
      freeBytes: (directory) => {asked.push(directory); return free;},
      exportAsset: async (options) => {exported.push(options);},
      log: () => undefined,
    },
  });
  return {run, exported, asked};
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

test('validate:exports: --out picks the folder, and the default is scratch', () => {
  const root = '/repo';
  assert.equal(parseValidateArgs([], root).destination, path.join('/repo', 'out', '.scratch', 'validation'));
  assert.equal(parseValidateArgs(['--out', 'out/review/today'], root).destination, path.join('/repo', 'out', 'review', 'today'));
  assert.equal(parseValidateArgs(['--out', '/elsewhere/validation'], root).destination, '/elsewhere/validation');
  assert.equal(parseValidateArgs(['--kind', 'chat', '--only', 'label-sm'], root).values.only, 'label-sm');
  assert.throws(() => parseValidateArgs(['--out', ' '], root), /Use --out <dir>/);
});
