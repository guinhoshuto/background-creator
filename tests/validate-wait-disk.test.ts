import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {HELD_ENV, acquireRenderSlot, queueDir, renderSlotHolder} from '../scripts/render-slot';

// The real scripts/validate-exports.ts on a fake disk (tests/helpers/fake-disk.ts), with a slot of its own. Its --out
// sits under a plain file, so the mkdir right after the floor refuses it: a run past the floor ends there, with that
// refusal as the proof, and nothing bundled or rendered. The wait itself, poll by poll, is in tests/pack.test.ts.
const root = fileURLToPath(new URL('../', import.meta.url));
const GiB = 1024 ** 3;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PAST_THE_FLOOR = /ENOTDIR/;
const WAIT_LINE = /^waiting for disk: 1\.0 GiB free, a render needs at least 3\.0 GiB to start$/;
const FLOOR_MESSAGE = /Not enough free disk in .*: 1\.0 GiB free, and a render needs at least 3\.0 GiB to start\. Free space \(npm run clean -- --apply\) and run again\./;

const validateRun = (t: {after: (fn: () => void) => void}, args: string[], {free, env: extraEnv = {}}: {free: number; env?: NodeJS.ProcessEnv}) => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'validate-wait-disk-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));
  writeFileSync(path.join(scratch, 'a-file'), '');
  const freeFile = path.join(scratch, 'free');
  const setFree = (bytes: number) => writeFileSync(freeFile, String(bytes));
  setFree(free);
  const slotDir = path.join(scratch, 'render-slot');
  const env: NodeJS.ProcessEnv = {...process.env, RENDER_SLOT_DIR: slotDir, FAKE_FREE_FILE: freeFile, ...extraEnv};
  // A slot this process held would be inherited: the child could not give it back.
  delete env[HELD_ENV];
  const child = spawn(process.execPath, [
    '--import', 'tsx', '--import', path.join(root, 'tests/helpers/fake-disk.ts'), 'scripts/validate-exports.ts',
    '--composition', 'ChatLoop', '--out', path.join(scratch, 'a-file', 'validation'), ...args,
  ], {cwd: root, env, stdio: ['ignore', 'pipe', 'pipe']});
  t.after(() => { child.kill('SIGKILL'); });
  let stdout = '';
  let stderr = '';
  let exitCode: number | null | undefined;
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  // 'close', not 'exit': the output is all in by then.
  child.on('close', (code) => { exitCode = code; });
  const until = async (what: string, holds: () => boolean) => {
    // Up to a minute: before its first line the script loads the catalog, slow under the full npm test.
    for (let i = 0; i < 1200; i += 1) {
      if (holds()) return;
      if (exitCode !== undefined) break;
      await pause(50);
    }
    assert.fail(`${what}: not seen (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`);
  };
  const exited = async () => {
    await until('the end of the run', () => exitCode !== undefined);
    return exitCode;
  };
  const waitLines = () => stdout.split('\n').filter((line) => line.startsWith('waiting for disk'));
  return {setFree, slotDir, until, exited, waitLines, stdout: () => stdout, stderr: () => stderr};
};

/** A ticket in the slot's queue: only a run asking for the slot writes one. */
const queued = (slotDir: string) => existsSync(queueDir(slotDir)) && readdirSync(queueDir(slotDir)).some((file) => /^\d{15}-\d{7}\.json$/.test(file));

test('validate:exports without --wait-disk: below the floor it exits 1 with the floor\'s message and frees the slot', async (t) => {
  const run = validateRun(t, [], {free: 1 * GiB});
  assert.equal(await run.exited(), 1, run.stderr());
  assert.match(run.stderr(), FLOOR_MESSAGE);
  assert.doesNotMatch(run.stderr(), PAST_THE_FLOOR);
  assert.deepEqual(run.waitLines(), []);
  assert.equal(renderSlotHolder(run.slotDir), undefined);
});

test('validate:exports --wait-disk: with the floor holding it goes on at once, with no line', async (t) => {
  const run = validateRun(t, ['--wait-disk'], {free: 10 * GiB});
  assert.equal(await run.exited(), 1, run.stderr());
  assert.match(run.stderr(), PAST_THE_FLOOR);
  assert.deepEqual(run.waitLines(), []);
  assert.equal(renderSlotHolder(run.slotDir), undefined);
});

test('validate:exports --wait-disk: logs the wait once, leaves the slot free for it, and goes on when space returns', async (t) => {
  const run = validateRun(t, ['--wait-disk'], {free: 1 * GiB});
  await run.until('the waiting line', () => run.waitLines().length > 0);
  assert.match(run.waitLines()[0]!, WAIT_LINE);
  await run.until('the slot given back', () => renderSlotHolder(run.slotDir) === undefined);
  // What `npm run clean -- --apply` does, the way out of a full disk: it takes the slot, at once since the run left it free.
  const slot = await acquireRenderSlot({dir: run.slotDir, command: 'npm run clean -- --apply', wait: false, repo: 'test', log: () => undefined});
  // Several polls go by: still waiting, with one line.
  await pause(300);
  assert.doesNotMatch(run.stderr(), PAST_THE_FLOOR, 'it went on below the floor');
  // With space back, the slot held here is what the run asks for next: it queues, and goes on once this one lets go.
  run.setFree(10 * GiB);
  await run.until('the run in the slot\'s queue', () => queued(run.slotDir));
  assert.doesNotMatch(run.stderr(), PAST_THE_FLOOR, 'it went on without the slot');
  slot.release();
  assert.equal(await run.exited(), 1, run.stderr());
  assert.match(run.stderr(), PAST_THE_FLOOR);
  assert.doesNotMatch(run.stderr(), /Not enough free disk/);
  assert.equal(run.waitLines().length, 1, run.stdout());
  assert.equal(renderSlotHolder(run.slotDir), undefined);
});

test('validate:exports --wait-disk: past 6 h it exits 1 with the floor\'s message, with the slot free', async (t) => {
  const run = validateRun(t, ['--wait-disk'], {free: 1 * GiB, env: {FAKE_POLL_MOVES_CLOCK: '1'}});
  assert.equal(await run.exited(), 1, run.stderr());
  assert.match(run.stderr(), FLOOR_MESSAGE);
  assert.doesNotMatch(run.stderr(), PAST_THE_FLOOR);
  assert.equal(run.waitLines().length, 1, run.stdout());
  assert.equal(renderSlotHolder(run.slotDir), undefined);
});
