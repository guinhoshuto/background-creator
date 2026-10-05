import assert from 'node:assert/strict';
import {test} from 'node:test';
import {testKitPlan} from '../scripts/test-kit-plan';
import {ORNAMENT_SET_IDS} from '../src/overlays/shared';
import {harnessScope} from './helpers/ornament-harness';

const FILES = [
  'ornaments-harness-cobweb.test.ts', 'ornaments-harness-cobweb-border.test.ts', 'ornaments-harness-cobweb-border-extremes.test.ts',
  'ornaments-harness-midnight.test.ts', 'ornaments-harness-haunted-mansion.test.ts', 'ornaments-harness-haunted-interior.test.ts',
  'ornaments-cobweb.test.ts', 'kinds.test.ts',
];

test('harness scope: unset, the full suite (radii 0/16/200, ornamentSize 48 and the extremes, every frame)', () => {
  const scope = harnessScope({});
  assert.deepEqual(scope.radii, [0, 16, 200]);
  assert.deepEqual(scope.ornamentSizes, [48, 12, 256]);
  assert.equal(scope.dense, true);
});

test('harness scope: the environment narrows radii, sizes and the dense check', () => {
  const scope = harnessScope({ORNAMENT_HARNESS_RADII: '16', ORNAMENT_HARNESS_SIZES: '48, 8', ORNAMENT_HARNESS_DENSE: 'off'});
  assert.deepEqual(scope.radii, [16]);
  assert.deepEqual(scope.ornamentSizes, [48, 8]);
  assert.equal(scope.dense, false);
  assert.equal(harnessScope({ORNAMENT_HARNESS_DENSE: 'on'}).dense, true);
});

test('harness scope: a bad value fails loudly instead of checking less', () => {
  assert.throws(() => harnessScope({ORNAMENT_HARNESS_RADII: ''}), /ORNAMENT_HARNESS_RADII/);
  assert.throws(() => harnessScope({ORNAMENT_HARNESS_SIZES: '48,x'}), /ORNAMENT_HARNESS_SIZES/);
  assert.throws(() => harnessScope({ORNAMENT_HARNESS_RADII: '-1'}), /ORNAMENT_HARNESS_RADII/);
  assert.throws(() => harnessScope({ORNAMENT_HARNESS_DENSE: 'no'}), /ORNAMENT_HARNESS_DENSE/);
});

test('test:kit: a set runs its own harness files, every one of them and no other set\'s', () => {
  const plan = testKitPlan(['cobweb'], FILES);
  assert.deepEqual(plan.files, [
    'tests/ornaments-harness-cobweb-border-extremes.test.ts', 'tests/ornaments-harness-cobweb-border.test.ts', 'tests/ornaments-harness-cobweb.test.ts',
  ]);
  assert.deepEqual(plan.env, {});
  assert.deepEqual(plan.narrowed, []);
  assert.deepEqual(plan.nodeArgs, ['--import', 'tsx', '--test', ...plan.files]);
  assert.deepEqual(testKitPlan(['haunted-mansion'], FILES).files, ['tests/ornaments-harness-haunted-mansion.test.ts']);
  // The file match leans on this: no set id is another's followed by "-" (a set "haunted" would take haunted-mansion's files).
  for (const set of ORNAMENT_SET_IDS) {
    for (const other of ORNAMENT_SET_IDS) assert.ok(!other.startsWith(`${set}-`), `${other} starts with ${set}-`);
  }
});

test('test:kit: --kind, --radii, --sizes and --sparse narrow the run', () => {
  const plan = testKitPlan(['midnight', '--kind', 'border', '--radii', '0,16', '--sizes', '48', '--sparse'], FILES);
  assert.deepEqual(plan.env, {ORNAMENT_HARNESS_RADII: '0,16', ORNAMENT_HARNESS_SIZES: '48', ORNAMENT_HARNESS_DENSE: 'off'});
  assert.deepEqual(plan.nodeArgs, ['--import', 'tsx', '--test', '--test-name-pattern=\\] border:', 'tests/ornaments-harness-midnight.test.ts']);
  assert.deepEqual(plan.narrowed, ['kind border', 'radii 0,16', 'sizes 48', 'sample frames only']);
});

test('test:kit: refuses what it cannot run, naming the way out', () => {
  assert.throws(() => testKitPlan([], FILES), /exactly one set/);
  assert.throws(() => testKitPlan(['cobweb', 'midnight'], FILES), /exactly one set/);
  assert.throws(() => testKitPlan(['spiders'], FILES), /Unknown set "spiders"\. Sets: /);
  assert.throws(() => testKitPlan(['cobweb', '--kind', 'panel'], FILES), /--kind takes chat, block, border/);
  assert.throws(() => testKitPlan(['cobweb', '--radii'], FILES), /--radii requires a value/);
  assert.throws(() => testKitPlan(['cobweb', '--radii', '0;16'], FILES), /--radii takes numbers/);
  assert.throws(() => testKitPlan(['cobweb', '--fast'], FILES), /Unknown option --fast/);
  assert.throws(() => testKitPlan(['cobweb'], ['kinds.test.ts']), /No harness file for "cobweb"/);
});
