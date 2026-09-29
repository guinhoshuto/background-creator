import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {listCandidates, planClean, pruneWebpackCache, runClean, webpackCacheTooBig} from '../scripts/clean-plan';
import {acquireRenderSlot} from '../scripts/render-slot';

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

const noSlot = async () => ({release: () => {}, inherited: false});

test('clean deletes nothing without --apply, and everything listed with it', async () => {
  const removed: string[] = [];
  const effects = {list: () => TREE, size: () => 1024, remove: (target: string) => { removed.push(target); }, takeSlot: noSlot};
  const dry = await runClean({root: '/repo', review: true, apply: false}, effects);
  assert.equal(removed.length, 0);
  assert.ok(dry.targets.length > 0);
  assert.match(dry.text, /Would delete/);
  await runClean({root: '/repo', review: false, apply: true}, effects);
  assert.deepEqual(removed, ['/repo/out/.scratch', '/repo/.cache/bundle', '/repo/.cache/stills-bundle-head-123', '/repo/.cache/vapor-bundle', '/repo/node_modules/.cache/webpack']);
});

/** A temporary slot, never ~/.cache/render-slot. */
const tempSlot = (t: {after: (fn: () => void) => void}) => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'clean-slot-test-'));
  t.after(() => rmSync(base, {recursive: true, force: true}));
  return path.join(base, 'render-slot');
};

test('clean --apply refuses while a render holds the slot, and says who holds it', async (t) => {
  const dir = tempSlot(t);
  mkdirSync(dir);
  // process.ppid: a live process other than this one.
  writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({pid: process.ppid, repo: 'other-repo', command: 'npm run render:pack -- halloween', startedAt: new Date().toISOString()}));
  const removed: string[] = [];
  const takeSlot = () => acquireRenderSlot({dir, command: 'clean', wait: false, log: () => {}});
  const effects = {list: () => TREE, size: () => 1, remove: (target: string) => { removed.push(target); }, takeSlot};
  await assert.rejects(runClean({root: '/repo', review: false, apply: true}, effects), /Refusing to delete while a render runs\. .*held by pid \d+ \(other-repo: npm run render:pack -- halloween\)/);
  assert.equal(removed.length, 0);
});

test('clean --apply holds the render slot from the listing to the last delete, then frees it', async (t) => {
  const dir = tempSlot(t);
  const heldDuring: boolean[] = [];
  const held = () => existsSync(path.join(dir, 'owner.json'));
  const takeSlot = () => acquireRenderSlot({dir, command: 'clean', wait: false, log: () => {}});
  const effects = {
    list: () => { heldDuring.push(held()); return TREE; },
    size: () => { heldDuring.push(held()); return 1; },
    remove: () => { heldDuring.push(held()); },
    takeSlot,
  };
  await runClean({root: '/repo', review: false, apply: true}, effects);
  assert.ok(heldDuring.length > 0);
  assert.deepEqual(heldDuring.filter((h) => !h), []);
  assert.equal(existsSync(dir), false);
});

/** A repo whose node_modules is a symlink to another checkout, as in a worktree. */
const worktreeLike = (t: {after: (fn: () => void) => void}) => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'clean-worktree-test-'));
  t.after(() => rmSync(base, {recursive: true, force: true}));
  const main = path.join(base, 'main');
  const worktree = path.join(base, 'worktree');
  mkdirSync(path.join(main, 'node_modules', '.cache', 'webpack'), {recursive: true});
  mkdirSync(path.join(worktree, 'out', '.scratch'), {recursive: true});
  symlinkSync(path.join(main, 'node_modules'), path.join(worktree, 'node_modules'));
  return {main, worktree};
};

test('clean never reaches another checkout through a symlinked node_modules', (t) => {
  const {main, worktree} = worktreeLike(t);
  assert.deepEqual(listCandidates(worktree), ['out/.scratch']);
  assert.deepEqual(listCandidates(main), ['node_modules/.cache/webpack']);
});

test('the webpack cache limit is 1 GiB', () => {
  assert.equal(webpackCacheTooBig(1073741824), false);
  assert.equal(webpackCacheTooBig(1073741825), true);
});

test('a bundle drops the webpack cache above the limit, in one line, and leaves it below', (t) => {
  const {main} = worktreeLike(t);
  const removed: string[] = [];
  const lines: string[] = [];
  const effects = (bytes: number) => ({size: () => bytes, remove: (target: string) => { removed.push(target); }, log: (line: string) => { lines.push(line); }});
  assert.equal(pruneWebpackCache(main, effects(500 * 1024 ** 2)), false);
  assert.deepEqual(removed, []);
  assert.equal(pruneWebpackCache(main, effects(5 * 1024 ** 3)), true);
  assert.deepEqual(removed, [path.join(main, 'node_modules/.cache/webpack')]);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /5\.0 GiB, over the 1\.0 GiB limit/);
});

test('a bundle in a worktree leaves the webpack cache of the main checkout alone', (t) => {
  const {worktree} = worktreeLike(t);
  const removed: string[] = [];
  assert.equal(pruneWebpackCache(worktree, {size: () => 5 * 1024 ** 3, remove: (target) => { removed.push(target); }, log: () => {}}), false);
  assert.deepEqual(removed, []);
});
