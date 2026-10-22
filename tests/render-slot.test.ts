import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync} from 'node:fs';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
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
  const slot = await acquireRenderSlot({dir, command: 'second', pollMs: 50, waitLimitMs: 20_000, log: (message) => messages.push(message)});
  const takenAt = Date.now();
  try {
    // The order, not a duration (BGC-36): the holder prints "releasing at <ms>" before it lets go, and a
    // loaded machine may run the second waiter late, never early.
    await first.waitFor('released');
    const releasingAt = Number(/releasing at (\d+)/.exec(first.output())?.[1]);
    assert.ok(releasingAt > 0, `the holder never said when it released: ${first.output()}`);
    assert.ok(takenAt >= releasingAt, `took the slot at ${takenAt}, before the first run began to release it at ${releasingAt}`);
    assert.equal(ownerPid(dir), process.pid);
    // One message: the release never shows a slot "still writing its owner file" (BGC-36).
    assert.deepEqual(messages.length, 1, messages.join('\n'));
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

test('a name left aside by a dead process with the same pid never makes leaving the mutex fail', (t) => {
  const mutex = `${tempSlot(t)}.takeover`;
  // What a process with this pid left when it died between the move aside and the delete, for any
  // counter a per-process count would reach here.
  for (let n = 1; n <= 300; n += 1) mkdirSync(path.join(`${mutex}.stale-${process.pid}-${n}`, 'holder.json'), {recursive: true});
  const mine = takeMutex(mutex);
  assert.notEqual(mine, null);
  assert.equal(releaseMutex(mutex, mine!), true);
  assert.equal(existsSync(mutex), false);
  assert.equal(stranded(mutex).length, 300);
});

test('a name taken for the move aside is traded for another, and all of them taken is false, not an error', (t) => {
  const mutex = `${tempSlot(t)}.takeover`;
  const taken = `${mutex}.stale-taken`;
  mkdirSync(path.join(taken, 'holder.json'), {recursive: true});
  const mine = takeMutex(mutex);
  assert.notEqual(mine, null);
  assert.equal(releaseMutex(mutex, mine!, () => taken), false);
  assert.equal(statSync(mutex).ino, mine, 'the mutex left its path although it was not removed');
  let calls = 0;
  assert.equal(releaseMutex(mutex, mine!, () => (calls++ === 0 ? taken : `${mutex}.stale-free`)), true);
  assert.equal(existsSync(mutex), false);
  assert.deepEqual(stranded(mutex), ['render-slot.takeover.stale-taken']);
});

/** A mutex left 11 s old (past the 10 s grace) whose holder.json names `pid`. */
const agedMutexHeldBy = (mutex: string, pid: number) => {
  mkdirSync(mutex);
  writeFileSync(path.join(mutex, 'holder.json'), JSON.stringify({pid, token: 'held'}));
  return {ino: statSync(mutex).ino, ageMs: 11_000};
};

test('an old mutex whose holder still runs is not cleared, with or without an old claim in it', (t) => {
  const mutex = `${tempSlot(t)}.takeover`;
  // The parent of this test process runs while the test does (a holder stopped by a sleep of the Mac).
  const seen = agedMutexHeldBy(mutex, process.ppid);
  assert.equal(clearStaleMutex(mutex, seen), false);
  assert.equal(statSync(mutex).ino, seen.ino, 'cleared the mutex of a holder that still runs');
  assert.deepEqual(readdirSync(mutex), ['holder.json'], 'left a claim in the mutex of a holder that still runs');
  mkdirSync(path.join(mutex, 'clearing'));
  const old = new Date(Date.now() - 11_000);
  utimesSync(path.join(mutex, 'clearing'), old, old);
  assert.equal(clearStaleMutex(mutex, seen), false);
  assert.equal(statSync(mutex).ino, seen.ino, 'cleared, past an old claim, the mutex of a holder that still runs');
  assert.deepEqual(stranded(mutex), []);
});

test('a dead slot whose takeover mutex is held by a live pid names that pid and the rm of both, with no promise of a takeover', async (t) => {
  const dir = tempSlot(t);
  const gone = spawnSync(process.execPath, ['-e', '']).pid;
  writeOwner(dir, gone);
  // A pid reused after the taker died in the critical section: process.ppid runs and takes nothing over.
  agedMutexHeldBy(`${dir}.takeover`, process.ppid);
  const old = new Date(Date.now() - 11_000);
  utimesSync(`${dir}.takeover`, old, old);
  const wayOut = `rm -r ${dir} ${dir}.takeover`;
  const blocked = (error: Error) => error.message.includes(`pid ${process.ppid}`) && error.message.includes(wayOut)
    && !error.message.includes('taken over automatically');
  await assert.rejects(acquireRenderSlot({dir, command: 'no wait', wait: false, log: () => {}}), blocked);
  const messages: string[] = [];
  await assert.rejects(acquireRenderSlot({dir, command: 'waits', pollMs: 50, waitLimitMs: 300, log: (message) => messages.push(message)}), blocked);
  assert.ok(messages.some((message) => message.includes(`pid ${process.ppid}`) && message.includes(wayOut)), `no message named the way out: ${messages.join(' | ')}`);
  assert.equal(ownerPid(dir), gone);
  assert.equal(existsSync(`${dir}.takeover`), true);
});

test('an old mutex whose holder is gone, or is this process that holds no mutex, is cleared', (t) => {
  const base = tempSlot(t);
  const gone = spawnSync(process.execPath, ['-e', '']).pid;
  for (const [name, pid] of [['dead', gone], ['orphan', process.pid]] as const) {
    const mutex = `${base}-${name}.takeover`;
    const seen = agedMutexHeldBy(mutex, pid);
    assert.equal(clearStaleMutex(mutex, seen), true, `kept the old mutex of the ${name} holder`);
    assert.equal(existsSync(mutex), false);
    assert.deepEqual(stranded(mutex), []);
  }
});

/**
 * Swaps one node:fs function for the copy's named imports too (syncBuiltinESMExports) and puts it back in
 * t.after and through the returned function: the race of a waiter with a release, made to happen (BGC-36).
 */
const swapFs = <K extends 'mkdirSync' | 'rmSync'>(t: {after: (fn: () => void) => void}, name: K, make: (real: typeof fs[K]) => typeof fs[K]) => {
  const real = fs[name];
  fs[name] = make(real);
  syncBuiltinESMExports();
  const restore = () => { fs[name] = real; syncBuiltinESMExports(); };
  t.after(restore);
  return restore;
};

test('BGC-36: a slot freed between the mkdir and the read of its owner is taken at once, without a wait message', async (t) => {
  const dir = tempSlot(t);
  // A live holder (the test runner's parent) that releases right after the waiter's mkdir found the slot taken.
  writeOwner(dir, process.ppid);
  let freed = false;
  swapFs(t, 'mkdirSync', (real) => ((target: fs.PathLike, options?: fs.MakeDirectoryOptions) => {
    try {
      return real(target, options);
    } catch (error) {
      if (!freed && target === dir && (error as NodeJS.ErrnoException).code === 'EEXIST') { freed = true; rmSync(dir, {recursive: true, force: true}); }
      throw error;
    }
  }) as typeof fs.mkdirSync);
  const messages: string[] = [];
  const slot = await acquireRenderSlot({dir, command: 'freed meanwhile', pollMs: 50, waitLimitMs: 5000, log: (message) => messages.push(message)});
  assert.equal(freed, true, 'the waiter never found the slot taken: the race did not happen');
  assert.deepEqual(messages, []);
  assert.equal(ownerPid(dir), process.pid);
  slot.release();
});

test('BGC-36: a release takes the slot path away before deleting anything, and leaves nothing beside it', async (t) => {
  const dir = tempSlot(t);
  const slot = await acquireRenderSlot({dir, command: 'release', wait: false, log: () => {}});
  const removals: {target: string; slotThere: boolean}[] = [];
  const restore = swapFs(t, 'rmSync', (real) => ((target: fs.PathLike, options?: fs.RmOptions) => {
    removals.push({target: String(target), slotThere: existsSync(dir)});
    return real(target, options);
  }) as typeof fs.rmSync);
  slot.release();
  restore();
  assert.ok(removals.length > 0, 'the release deleted nothing');
  assert.deepEqual(removals.filter((removal) => removal.slotThere), [], `a removal ran with the slot path still there, where a waiter reads it ownerless: ${JSON.stringify(removals)}`);
  assert.equal(existsSync(dir), false);
  assert.deepEqual(readdirSync(path.dirname(dir)), []);
});

test('render-slot run stopped 200 ms under a SIGTERM: ends with 143, frees the slot and ends its command group', async (t) => {
  const dir = tempSlot(t);
  // The program package.json runs it with (build:tokyo): through the tsx CLI, a wrapper got the signal and
  // SIGKILLed the node child that had not answered within 30 + 30 ms, leaving the slot held and the command running.
  const scripts = (JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {scripts: Record<string, string>}).scripts;
  const program = scripts['build:tokyo']!.split(' ')[0]!;
  const command = program === 'node' ? process.execPath : path.join(root, 'node_modules', '.bin', program);
  const env: NodeJS.ProcessEnv = {...process.env, RENDER_SLOT_DIR: dir, RENDER_SLOT_CHECK: 'off'};
  // The tests above take slots in this process: a child that inherited one would skip the queue.
  delete env[HELD_ENV];
  const child = spawn(command, [path.join(root, 'scripts', 'render-slot.ts'), 'run', '--', '/bin/sleep', '37'], {cwd: root, env, stdio: 'ignore'});
  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  let owner: {pid: number; commandPgid?: number} | undefined;
  t.after(() => {
    for (const pid of [child.pid, owner?.pid]) if (pid !== undefined && pid > 1) try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
    if (owner?.commandPgid !== undefined && owner.commandPgid > 1) try { process.kill(-owner.commandPgid, 'SIGKILL'); } catch { /* gone */ }
  });
  // The owner file names the process running `run` once the command has started in its own group.
  for (let i = 0; i < 600 && owner?.commandPgid === undefined && child.exitCode === null; i += 1) {
    try { owner = JSON.parse(readFileSync(path.join(dir, 'owner.json'), 'utf8')) as typeof owner; } catch { /* not written yet */ }
    if (owner?.commandPgid === undefined) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(owner?.commandPgid !== undefined && owner.commandPgid > 1 && owner.pid > 1, `run never started its command: ${JSON.stringify(owner)}`);
  process.kill(owner.pid, 'SIGSTOP');
  process.kill(child.pid!, 'SIGTERM');
  // Stopped longer than the tsx CLI's 30 + 30 ms before its SIGKILL: on a loaded machine, a slow handler.
  await new Promise((resolve) => setTimeout(resolve, 200));
  try { process.kill(owner.pid, 'SIGCONT'); } catch { /* killed meanwhile */ }
  assert.equal(await exited, 143);
  assert.equal(existsSync(dir), false, 'the slot stayed held');
  assert.throws(() => process.kill(-owner!.commandPgid!, 0), {code: 'ESRCH'}, 'the command group still runs');
});
