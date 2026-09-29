import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {planClean, pruneWebpackCache, runClean, webpackCacheTooBig} from '../scripts/clean-plan';
import {slotHolder} from '../scripts/render-slot';

// A fake tree: everything that can sit under out/ and .cache/, plus the webpack cache.
const TREE = [
  'out/.scratch', 'out/review', 'out/packs', 'out/deliveries', 'out/wuthering-waves',
  '.cache/bundle', '.cache/stills-bundle-head-123', '.cache/vapor-bundle', '.cache/wave-3', '.cache/locks',
  'node_modules/.cache/webpack',
];
const paths = (review: boolean) => planClean(TREE, {review}).map((target) => target.path);

test('clean never lists out/packs or out/deliveries, with any flag', () => {
  for (const review of [false, true]) {
    const listed = paths(review);
    assert.ok(!listed.some((p) => p === 'out/packs' || p.startsWith('out/packs/')), `out/packs listed (review=${review})`);
    assert.ok(!listed.some((p) => p === 'out/deliveries' || p.startsWith('out/deliveries/')), `out/deliveries listed (review=${review})`);
    assert.ok(!listed.includes('out'), `out itself listed (review=${review})`);
  }
});

test('clean lists out/review only with --review', () => {
  assert.ok(!paths(false).includes('out/review'));
  assert.ok(paths(true).includes('out/review'));
});

test('clean lists scratch, old bundles and the webpack cache, and keeps the rest', () => {
  assert.deepEqual(paths(false), ['out/.scratch', '.cache/bundle', '.cache/stills-bundle-head-123', '.cache/vapor-bundle', 'node_modules/.cache/webpack']);
});

test('clean deletes nothing without --apply, and everything listed with it', () => {
  const removed: string[] = [];
  const effects = {list: () => TREE, size: () => 1024, remove: (target: string) => { removed.push(target); }, holder: () => null};
  const dry = runClean({root: '/repo', review: true, apply: false}, effects);
  assert.equal(removed.length, 0);
  assert.ok(dry.targets.length > 0);
  assert.match(dry.text, /Would delete/);
  runClean({root: '/repo', review: false, apply: true}, effects);
  assert.deepEqual(removed, ['/repo/out/.scratch', '/repo/.cache/bundle', '/repo/.cache/stills-bundle-head-123', '/repo/.cache/vapor-bundle', '/repo/node_modules/.cache/webpack']);
});

test('clean --apply refuses while a render holds the slot, and says who holds it', (t) => {
  // A temporary slot, never ~/.cache/render-slot: this process is its live owner.
  const base = mkdtempSync(path.join(os.tmpdir(), 'clean-slot-test-'));
  t.after(() => rmSync(base, {recursive: true, force: true}));
  const dir = path.join(base, 'render-slot');
  mkdirSync(dir);
  writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({pid: process.pid, repo: 'other-repo', command: 'npm run render:pack -- halloween', startedAt: '2026-09-28T12:00:00.000Z'}));
  const removed: string[] = [];
  const effects = {list: () => TREE, size: () => 1, remove: (target: string) => { removed.push(target); }, holder: () => slotHolder(dir)};
  assert.throws(() => runClean({root: '/repo', review: false, apply: true}, effects), /render slot is held by pid \d+ \(other-repo: npm run render:pack -- halloween\)/);
  assert.equal(removed.length, 0);
});

test('the webpack cache limit is 1 GiB', () => {
  assert.equal(webpackCacheTooBig(1073741824), false);
  assert.equal(webpackCacheTooBig(1073741825), true);
});

test('a bundle drops the webpack cache above the limit, in one line, and leaves it below', () => {
  const removed: string[] = [];
  const lines: string[] = [];
  const effects = (bytes: number) => ({size: () => bytes, remove: (target: string) => { removed.push(target); }, log: (line: string) => { lines.push(line); }});
  assert.equal(pruneWebpackCache('/repo', effects(500 * 1024 ** 2)), false);
  assert.deepEqual(removed, []);
  assert.equal(pruneWebpackCache('/repo', effects(5 * 1024 ** 3)), true);
  assert.deepEqual(removed, ['/repo/node_modules/.cache/webpack']);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /5\.0 GiB, over the 1\.0 GiB limit/);
});
