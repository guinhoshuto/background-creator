import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {HELD_ENV, acquireRenderSlot, clearStaleMutex, markMutex, ownMutexInode, releaseMutex, releaseRenderSlot, takeMutex} from '../scripts/render-slot';

// Every test uses its own temporary slot (RENDER_SLOT_DIR / `dir`), never ~/.cache/render-slot.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const holderScript = path.join(root, 'tests', 'helpers', 'render-slot-holder.ts');

const tempSlot = (t: {after: (fn: () => void) => void}) => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'render-slot-test-'));
  t.after(() => rmSync(base, {recursive: true, force: true}));
  return path.join(base, 'render-slot');
};

const ownerPid = (dir: string) => (JSON.parse(readFileSync(path.join(dir, 'owner.json'), 'utf8')) as {pid: number}).pid;

const writeOwner = (dir: string, pid: number, startedAt = new Date().toISOString()) => {
  mkdirSync(dir, {recursive: true});
  writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({pid, repo: 'other-repo', command: 'npm run render', startedAt}));
};

/** Starts tests/helpers/render-slot-holder.ts with its own slot directory. */
const startHolder = (dir: string, args: string[], heldBy = '') => {
  const child = spawn(process.execPath, ['--import', 'tsx', holderScript, ...args], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, RENDER_SLOT_DIR: dir, [HELD_ENV]: heldBy},
  });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { errors += chunk.toString(); });
  const exited = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolve) => {
    child.on('exit', (code, signal) => resolve({code, signal}));
  });
  const waitFor = (text: string) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`holder never printed "${text}": ${output}${errors}`)), 20_000);
    const check = () => { if (output.includes(text)) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', check);
    void exited.then(() => { check(); clearTimeout(timer); reject(new Error(`holder exited before "${text}": ${output}${errors}`)); });
    check();
  });
  return {child, exited, waitFor, output: () => output, errors: () => errors};
};

test('a second run waits until the first one releases the slot', async (t) => {
  const dir = tempSlot(t);
  const first = startHolder(dir, ['1500']);
  await first.waitFor('held');
  const messages: string[] = [];
  const started = Date.now();
  const slot = await acquireRenderSlot({dir, command: 'second', pollMs: 50, waitLimitMs: 20_000, log: (message) => messages.push(message)});
  const waited = Date.now() - started;
  try {
    // The holder keeps the slot for 1.5 s after printing "held".
    assert.ok(waited >= 1000, `took the slot after ${waited} ms, while the first run still held it`);
    assert.equal(ownerPid(dir), process.pid);
    assert.equal(messages.length, 1);
    assert.match(messages[0]!, new RegExp(`^Waiting for the render slot, held by pid ${first.child.pid} \\(background-creator: render-slot test holder\\) since `));
  } finally {
    slot.release();
  }
  assert.equal(existsSync(dir), false);
  assert.equal((await first.exited).code, 0);
});

test('a slot whose pid is gone is taken over', (t) => {
  const dir = tempSlot(t);
  const gone = spawnSync(process.execPath, ['-e', '']).pid;
  writeOwner(dir, gone);
  return acquireRenderSlot({dir, command: 'after a crash', pollMs: 50, waitLimitMs: 2000, log: () => {}}).then((slot) => {
    assert.equal(ownerPid(dir), process.pid);
    slot.release();
    assert.equal(existsSync(dir), false);
  });
});

test('a slot written before the last boot is taken over even when its pid is alive again', async (t) => {
  const dir = tempSlot(t);
  // process.ppid is alive: only the boot time says this owner is gone (a pid reused after a reboot).
  writeOwner(dir, process.ppid, '2000-01-01T00:00:00.000Z');
  const slot = await acquireRenderSlot({dir, command: 'after a reboot', wait: false, log: () => {}});
  assert.equal(ownerPid(dir), process.pid);
  slot.release();
});

test('a stuck slot tells how to remove it by hand', async (t) => {
  const dir = tempSlot(t);
  writeOwner(dir, process.ppid);
  await assert.rejects(
    acquireRenderSlot({dir, command: 'no wait', wait: false, log: () => {}}),
    (error: Error) => error.message.includes(`rm -r ${dir}`),
  );
});

test('a takeover in progress is left alone: the dead slot is not taken twice', async (t) => {
  const dir = tempSlot(t);
  const gone = spawnSync(process.execPath, ['-e', '']).pid;
  writeOwner(dir, gone);
  mkdirSync(`${dir}.takeover`);
  await assert.rejects(acquireRenderSlot({dir, command: 'second taker', wait: false, log: () => {}}), /Another render holds the render slot/);
  assert.equal(ownerPid(dir), gone);
  assert.equal(existsSync(`${dir}.takeover`), true);
});

test('a takeover mutex left by a dead taker is cleared after 10 seconds', async (t) => {
  const dir = tempSlot(t);
  const gone = spawnSync(process.execPath, ['-e', '']).pid;
  writeOwner(dir, gone);
  mkdirSync(`${dir}.takeover`);
  const old = new Date(Date.now() - 11_000);
  utimesSync(`${dir}.takeover`, old, old);
  const slot = await acquireRenderSlot({dir, command: 'after a dead taker', wait: false, log: () => {}});
  assert.equal(ownerPid(dir), process.pid);
  assert.equal(existsSync(`${dir}.takeover`), false);
  slot.release();
});

test('--no-wait fails at once when another process holds the slot', async (t) => {
  const dir = tempSlot(t);
  writeOwner(dir, process.ppid);
  const started = Date.now();
  await assert.rejects(
    acquireRenderSlot({dir, command: 'no wait', wait: false, pollMs: 50, waitLimitMs: 5000, log: () => {}}),
    new RegExp(`held by pid ${process.ppid} \\(other-repo: npm run render\\)`),
  );
  assert.ok(Date.now() - started < 1000, 'waited for the slot despite wait: false');
  assert.equal(ownerPid(dir), process.ppid);
});

test('a process that does not own the slot never releases it', (t) => {
  const dir = tempSlot(t);
  writeOwner(dir, process.ppid);
  assert.equal(releaseRenderSlot(dir), false);
  assert.equal(ownerPid(dir), process.ppid);
});

test('a child of the owner runs under the parent slot instead of waiting', async (t) => {
  const dir = tempSlot(t);
  const slot = await acquireRenderSlot({dir, command: 'parent', pollMs: 50, waitLimitMs: 2000, log: () => {}});
  try {
    // The child may wait 2 s; without the handoff it gives up and exits with 1.
    const child = startHolder(dir, ['0', '2000'], String(process.pid));
    const {code} = await child.exited;
    assert.equal(code, 0, child.errors());
    assert.match(child.output(), /^inherited\n/);
    assert.equal(ownerPid(dir), process.pid, 'the child released the parent slot');
  } finally {
    slot.release();
  }
  assert.equal(existsSync(dir), false);
});

test('SIGINT releases the slot', async (t) => {
  const dir = tempSlot(t);
  const holder = startHolder(dir, ['forever']);
  await holder.waitFor('held');
  assert.equal(ownerPid(dir), holder.child.pid);
  holder.child.kill('SIGINT');
  const {code} = await holder.exited;
  assert.equal(existsSync(dir), false);
  assert.equal(code, 130);
});

// Takeover mutex: a mutex is its directory's inode. The sightings below are what a process saw at
// the path; 11 s is past the 10 s grace after which a mutex counts as left by a dead taker.
const stranded = (mutex: string) => readdirSync(path.dirname(mutex)).filter((name) => name.includes('.stale-'));

test('two clearers of one stale mutex: exactly one clears it, and the new mutex survives the other', (t) => {
  const mutex = `${tempSlot(t)}.takeover`;
  mkdirSync(mutex);
  const seen = {ino: statSync(mutex).ino, ageMs: 11_000};
  assert.equal(clearStaleMutex(mutex, seen), true);
  // The loser comes before the winner has made a new mutex, then after.
  assert.equal(clearStaleMutex(mutex, seen), false);
  const fresh = takeMutex(mutex);
  assert.notEqual(fresh, null);
  assert.equal(clearStaleMutex(mutex, seen), false);
  assert.equal(statSync(mutex).ino, fresh, 'the other clearer removed the new mutex');
  // Its claim landed in the new mutex and came back out, without moving that mutex.
  assert.deepEqual(readdirSync(mutex), ['holder.json'], 'the other clearer left its claim in the new mutex or moved it');
  assert.deepEqual(stranded(mutex), []);
});

test('a mutex replaced between the sighting and the clearing is not removed', (t) => {
  const mutex = `${tempSlot(t)}.takeover`;
  mkdirSync(mutex);
  const seen = {ino: statSync(mutex).ino, ageMs: 11_000};
  rmSync(mutex, {recursive: true});
  const fresh = takeMutex(mutex);
  assert.ok(fresh !== null && fresh !== seen.ino, 'the file system gave the new mutex the old inode');
  assert.equal(clearStaleMutex(mutex, seen), false);
  assert.equal(statSync(mutex).ino, fresh);
  assert.deepEqual(stranded(mutex), []);
});

test('leaving the critical section never removes a mutex that is not this one', (t) => {
  const mutex = `${tempSlot(t)}.takeover`;
  const mine = takeMutex(mutex);
  assert.notEqual(mine, null);
  rmSync(mutex, {recursive: true});
  const other = takeMutex(mutex);
  assert.ok(other !== null && other !== mine);
  assert.equal(releaseMutex(mutex, mine!), false);
  assert.equal(statSync(mutex).ino, other, 'released the mutex of another process');
  assert.equal(releaseMutex(mutex, other), true);
  assert.equal(existsSync(mutex), false);
  assert.deepEqual(stranded(mutex), []);
});

test('a stale mutex claimed by another clearer is left to it until the claim is older than 10 seconds', (t) => {
  const mutex = `${tempSlot(t)}.takeover`;
  mkdirSync(path.join(mutex, 'clearing'), {recursive: true});
  const seen = {ino: statSync(mutex).ino, ageMs: 11_000};
  assert.equal(clearStaleMutex(mutex, seen), false);
  assert.equal(statSync(mutex).ino, seen.ino, 'cleared a mutex that another clearer had claimed');
  // That clearer died holding the claim.
  const old = new Date(Date.now() - 11_000);
  utimesSync(path.join(mutex, 'clearing'), old, old);
  assert.equal(clearStaleMutex(mutex, seen), true);
  assert.equal(existsSync(mutex), false);
  assert.deepEqual(stranded(mutex), []);
});

test('a directory at the mutex path is this process mutex only while holder.json holds its token', (t) => {
  const mutex = `${tempSlot(t)}.takeover`;
  mkdirSync(mutex);
  writeFileSync(path.join(mutex, 'holder.json'), JSON.stringify({pid: process.ppid, token: 'theirs'}));
  assert.equal(ownMutexInode(mutex, 'mine'), null, 'took a mutex whose holder.json names another token');
  assert.equal(ownMutexInode(mutex, 'theirs'), statSync(mutex).ino);
  // Created by another taker and not written yet.
  writeFileSync(path.join(mutex, 'holder.json'), '');
  assert.equal(ownMutexInode(mutex, 'theirs'), null);
  // A directory that already has a holder.json is not the one just made.
  assert.equal(markMutex(mutex), null);
});

test('any error after the mutex mkdir means the mutex is not this one, never a crash', (t) => {
  const mutex = `${tempSlot(t)}.takeover`;
  // Removed right after the mkdir (ENOENT), then replaced by a file (ENOTDIR). On APFS the same race
  // answers EINVAL, which no test can provoke on demand.
  assert.equal(markMutex(mutex), null);
  writeFileSync(mutex, '');
  assert.equal(markMutex(mutex), null);
  assert.equal(ownMutexInode(mutex, 'any'), null);
});
