import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {parsePackManifest, planPack, realPackDeps} from '../scripts/pack-plan';
import {HELD_ENV, acquireRenderSlot, renderSlotHolder} from '../scripts/render-slot';

// The real scripts/pack.ts on a fake disk (tests/helpers/fake-disk.ts), with a slot of its own. Its one planned
// file already exists, so nothing renders: these cover the flag, the exit codes and the slot, which only the script
// has. The waits themselves, file by file, are in tests/pack.test.ts.
const root = fileURLToPath(new URL('../', import.meta.url));
const GiB = 1024 ** 3;

const packRun = async (t: {after: (fn: () => void) => void}, name: string, args: string[]) => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'pack-wait-disk-'));
  const packFolder = path.join(root, 'out', 'packs', name);
  t.after(() => {
    rmSync(scratch, {recursive: true, force: true});
    rmSync(packFolder, {recursive: true, force: true});
    rmSync(path.join(root, 'out', '.scratch', 'packs', name), {recursive: true, force: true});
  });
  const manifest = {name, items: [{composition: 'ChatLoop', formats: ['png']}]};
  const manifestFile = path.join(scratch, `${name}.json`);
  writeFileSync(manifestFile, JSON.stringify(manifest));
  const output = path.join(root, planPack(parsePackManifest(manifest), realPackDeps)[0]!.output);
  mkdirSync(path.dirname(output), {recursive: true});
  writeFileSync(output, 'a file a finished run left');
  const freeFile = path.join(scratch, 'free');
  const setFree = (bytes: number) => writeFileSync(freeFile, String(bytes));
  setFree(1 * GiB);
  const slotDir = path.join(scratch, 'render-slot');
  const env: NodeJS.ProcessEnv = {...process.env, RENDER_SLOT_DIR: slotDir, FAKE_FREE_FILE: freeFile};
  // A slot this process held would be inherited: the child could not give it back.
  delete env[HELD_ENV];
  const child = spawn(process.execPath, ['--import', 'tsx', '--import', path.join(root, 'tests/helpers/fake-disk.ts'), 'scripts/pack.ts', manifestFile, ...args], {cwd: root, env, stdio: ['ignore', 'pipe', 'pipe']});
  t.after(() => { child.kill('SIGKILL'); });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  const lineSeen = async (pattern: RegExp) => {
    // Up to a minute: before its first line the script loads the catalog, slow under the full npm test.
    for (let i = 0; i < 1200; i += 1) {
      if (pattern.test(stdout)) return;
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail(`no ${pattern} in the output.\nstdout: ${stdout}\nstderr: ${stderr}`);
  };
  return {child, setFree, slotDir, packFolder, lineSeen, exited: exitOf(child), output: () => ({stdout, stderr})};
};

const exitOf = (child: ChildProcess) => new Promise<number | null>((resolve) => {
  child.on('exit', (code) => resolve(code));
});

const WAIT_LINE = /^waiting for disk: 1\.0 GiB free, a render needs at least 3\.0 GiB to start$/m;

test('render:pack without --wait-disk: below the floor it exits 1 with the floor\'s message and frees the slot', async (t) => {
  const run = await packRun(t, 'bgc-wait-disk-off', []);
  assert.equal(await run.exited, 1, run.output().stderr);
  assert.match(run.output().stderr, /Not enough free disk in .*: 1\.0 GiB free, and a render needs at least 3\.0 GiB to start\. Free space \(npm run clean -- --apply\) and run the same command again; finished files will be skipped\./);
  assert.doesNotMatch(run.output().stdout, /waiting for disk/);
  assert.equal(renderSlotHolder(run.slotDir), undefined);
});

test('render:pack --wait-disk: logs the wait once, leaves the slot free for it, and goes on when space returns', async (t) => {
  const run = await packRun(t, 'bgc-wait-disk-on', ['--wait-disk']);
  await run.lineSeen(WAIT_LINE);
  // What `npm run clean -- --apply` does, the way out of a full disk: it takes the slot, at once since the run left it free.
  const slot = await acquireRenderSlot({dir: run.slotDir, command: 'npm run clean -- --apply', wait: false, repo: 'test', log: () => undefined});
  // Several polls go by: still one line.
  await new Promise((resolve) => setTimeout(resolve, 300));
  // The slot held here is what the run asks for next: it queues, and runs once this one lets go.
  run.setFree(10 * GiB);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.doesNotMatch(run.output().stdout, /\[1\/1\]/, 'it went on without the slot');
  slot.release();
  assert.equal(await run.exited, 0, run.output().stderr);
  assert.equal(run.output().stdout.split('\n').filter((line) => WAIT_LINE.test(line)).length, 1);
  assert.match(run.output().stdout, /\[1\/1\] .*: already exists, skipping\./);
  assert.ok(existsSync(path.join(run.packFolder, 'manifest.json')));
  assert.equal(JSON.parse(readFileSync(path.join(run.packFolder, 'manifest.json'), 'utf8')).files.length, 1);
  assert.equal(renderSlotHolder(run.slotDir), undefined);
});

test('render:pack --wait-disk: a SIGTERM during the wait logs the signal and ends with 143', async (t) => {
  const run = await packRun(t, 'bgc-wait-disk-signal', ['--wait-disk']);
  await run.lineSeen(WAIT_LINE);
  run.child.kill('SIGTERM');
  assert.equal(await run.exited, 143, run.output().stderr);
  assert.match(run.output().stderr, /received SIGTERM at /);
  assert.equal(renderSlotHolder(run.slotDir), undefined);
});
