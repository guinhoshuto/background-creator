import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {listCandidates, planClean, pruneWebpackCache, runClean, takeCleanSlot, webpackCacheTooBig} from '../scripts/clean-plan';
import {HELD_ENV, queueDir} from '../scripts/render-slot';

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

type After = {after: (fn: () => void | Promise<void>) => void};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (what: string, done: () => boolean) => {
  for (const end = Date.now() + 30_000; !done(); await pause(20)) if (Date.now() > end) assert.fail(`never saw ${what}`);
};

const holderScript = fileURLToPath(new URL('./helpers/render-slot-holder.ts', import.meta.url));

/** Another process that takes the slot in `dir` and keeps it until `end()`, which ends it with SIGTERM. */
const holdElsewhere = async (t: After, dir: string) => {
  const env: NodeJS.ProcessEnv = {...process.env, RENDER_SLOT_DIR: dir};
  // A slot this process held would be inherited: the holder would not take the slot.
  delete env[HELD_ENV];
  const holder = spawn(process.execPath, ['--import', 'tsx', holderScript, 'forever'], {env, stdio: ['ignore', 'pipe', 'ignore']});
  const exited = new Promise<void>((resolve) => { holder.on('exit', () => resolve()); });
  t.after(async () => {
    if (holder.exitCode === null && holder.signalCode === null) holder.kill('SIGKILL');
    await exited;
  });
  await new Promise<void>((resolve, reject) => {
    let output = '';
    holder.stdout!.on('data', (chunk: Buffer) => { output += chunk.toString(); if (output.includes('held')) resolve(); });
    holder.on('exit', () => reject(new Error(`the holder exited before holding the slot: ${output}`)));
  });
  return {pid: holder.pid!, end: async () => { holder.kill('SIGTERM'); await exited; }};
};

/** A checkout on disk with what clean deletes (scratch, a bundle) and what it never deletes (a pack, a delivery). */
const checkoutOnDisk = (t: After) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'clean-root-test-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  for (const folder of ['out/.scratch/session', '.cache/bundle', 'out/packs/neon', 'out/deliveries']) {
    mkdirSync(path.join(root, folder), {recursive: true});
    writeFileSync(path.join(root, folder, 'file.bin'), 'x');
  }
  return root;
};
const tickets = (dir: string) => (existsSync(queueDir(dir)) ? readdirSync(queueDir(dir)) : []).filter((name) => /^\d{15}-\d{7}\.json$/.test(name));

// Issue #12: on 2026-11-03, with the disk below the floor, clean --apply refused at once because another project's
// job held the slot, exactly when the disk needed it.
test('clean --apply waits in the queue while another process holds the slot, says so once, and deletes once it gets it', async (t) => {
  const dir = tempSlot(t);
  const root = checkoutOnDisk(t);
  const holder = await holdElsewhere(t, dir);
  const lines: string[] = [];
  const cleaning = runClean({root, review: false, apply: true}, {takeSlot: () => takeCleanSlot({dir, pollMs: 50, log: (line) => { lines.push(line); }})});
  await until('the waiting line', () => lines.length > 0);
  // Several rounds in the queue: still one line, one ticket, nothing deleted.
  await pause(400);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0]!, new RegExp(`^Waiting for the render slot, held by pid ${holder.pid} \\(background-creator: render-slot test holder\\) since `));
  assert.equal(tickets(dir).length, 1);
  assert.ok(existsSync(path.join(root, 'out/.scratch/session/file.bin')), 'it deleted while another process held the slot');
  await holder.end();
  const {targets, text} = await cleaning;
  assert.deepEqual(targets.map((target) => target.path), ['out/.scratch', '.cache/bundle']);
  assert.match(text, /^Deleted:/);
  assert.equal(existsSync(path.join(root, 'out/.scratch')), false);
  assert.equal(existsSync(path.join(root, '.cache/bundle')), false);
  assert.ok(existsSync(path.join(root, 'out/packs/neon/file.bin')));
  assert.ok(existsSync(path.join(root, 'out/deliveries/file.bin')));
  assert.equal(existsSync(dir), false, 'clean kept the slot');
  assert.deepEqual(tickets(dir), [], 'its ticket stayed in the queue');
});

test('clean --apply that gets no turn within its wait limit deletes nothing, and says who held the slot', async (t) => {
  const dir = tempSlot(t);
  const root = checkoutOnDisk(t);
  const holder = await holdElsewhere(t, dir);
  const cleaning = runClean({root, review: false, apply: true}, {takeSlot: () => takeCleanSlot({dir, pollMs: 20, waitLimitMs: 300, log: () => {}})});
  await assert.rejects(cleaning, new RegExp(`^Error: Nothing deleted: Gave up after \\d+ minutes waiting for the render slot \\(.*\\), held by pid ${holder.pid} `));
  assert.ok(existsSync(path.join(root, 'out/.scratch/session/file.bin')));
  assert.ok(existsSync(path.join(root, '.cache/bundle/file.bin')));
  assert.equal((JSON.parse(readFileSync(path.join(dir, 'owner.json'), 'utf8')) as {pid: number}).pid, holder.pid);
  assert.deepEqual(tickets(dir), []);
});

// `render-slot run` asks the machine check with the slot in hand, and a disk below the floor makes it give the slot
// back every 20 s for up to 4 hours: the cleanup that frees the disk would wait for the disk (issue #12, seen 2026-11-05).
test('npm run clean runs clean.ts itself, outside render-slot run and its disk check, as node --import tsx', () => {
  const {scripts} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {scripts: Record<string, string>};
  assert.equal(scripts.clean, 'node --import tsx scripts/clean.ts');
});

// The Codex sandbox, 2026-10-16 and 2026-10-19: no render ran, the mkdir was not allowed (HAR-68).
test('clean --apply says the sandbox denied the render slot, not that a render runs, on EPERM', async () => {
  const removed: string[] = [];
  const denied = Object.assign(new Error("EPERM: operation not permitted, mkdir '/x/.cache/render-slot'"), {code: 'EPERM'});
  const effects = {list: () => TREE, size: () => 1, remove: (target: string) => { removed.push(target); }, takeSlot: () => Promise.reject(denied)};
  const error = await runClean({root: '/repo', review: false, apply: true}, effects).then(() => null, (caught: unknown) => caught);
  assert.ok(error instanceof Error, 'clean --apply went on without the render slot');
  assert.match(error.message, /^No permission for the render slot \(sandbox\): run again with escalation\. EPERM: operation not permitted, mkdir '\/x\/\.cache\/render-slot'$/);
  assert.equal(removed.length, 0);
});

test('clean --apply says so too when the slot directory cannot be created (EACCES from the real slot code)', async (t) => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'clean-slot-denied-'));
  chmodSync(base, 0o555);
  t.after(() => { chmodSync(base, 0o755); rmSync(base, {recursive: true, force: true}); });
  const removed: string[] = [];
  const takeSlot = () => takeCleanSlot({dir: path.join(base, 'render-slot'), log: () => {}});
  const effects = {list: () => TREE, size: () => 1, remove: (target: string) => { removed.push(target); }, takeSlot};
  await assert.rejects(runClean({root: '/repo', review: false, apply: true}, effects), /^Error: No permission for the render slot \(sandbox\): run again with escalation\. EACCES/);
  assert.equal(removed.length, 0);
});

test('clean --apply holds the render slot from the listing to the last delete, then frees it', async (t) => {
  const dir = tempSlot(t);
  const heldDuring: boolean[] = [];
  const held = () => existsSync(path.join(dir, 'owner.json'));
  const takeSlot = () => takeCleanSlot({dir, log: () => {}});
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
