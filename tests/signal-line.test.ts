import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {MACHINE_CHECK_ENV} from '../scripts/machine-check';
import {HELD_ENV, queueDir} from '../scripts/render-slot';
import {watchSignalLine} from '../scripts/signal-line';

// The signal line of render:pack (BGC-38): the helper against a fake process, then the real script, stopped
// in the render slot's queue while a SIGTERM waits for it. The same stop for every script that queues for the
// slot (BGC-39): run as node --import tsx, each one's own handlers leave the queue.

const root = fileURLToPath(new URL('../', import.meta.url));
const holderScript = path.join(root, 'tests', 'helpers', 'render-slot-holder.ts');

const PS = [
  '  500     1   500 -zsh',
  '  610   500   610 node --import tsx scripts/pack.ts neon',
  '  700   650   700 /bin/sh -c kill -TERM 610; read line',
].join('\n');

const fakeProcess = () => {
  const exits: number[] = [];
  const lines: string[] = [];
  const target = Object.assign(new EventEmitter(), {pid: 610, ppid: 500, exit: (code: number) => { exits.push(code); }});
  watchSignalLine({target, startParent: {pid: 500, command: '-zsh'}, write: (line) => { lines.push(line); }, ps: () => PS, now: () => new Date(2026, 9, 22, 9, 5, 7)});
  return {target, exits, lines};
};

test('signal line: alone, it writes the line and exits with 128 + the signal', () => {
  for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]] as const) {
    const {target, exits, lines} = fakeProcess();
    target.emit(signal, signal);
    assert.deepEqual(exits, [code], signal);
    assert.deepEqual(lines, [`received ${signal} at 2026-10-22 09:05:07: pid 610, ppid 500 (\`-zsh\`), pgid 610; possible senders: 700 \`/bin/sh -c kill -TERM 610; read line\` (ppid 650)\n`]);
    // Registered with once: a second signal finds Node's default again, not a second line.
    assert.equal(target.listenerCount(signal), 0);
  }
});

test('signal line: with another listener after it, it writes the line and leaves the exit to that one', () => {
  const {target, exits, lines} = fakeProcess();
  const later: string[] = [];
  target.once('SIGTERM', () => { later.push(`after the line: ${lines.length}`); });
  target.emit('SIGTERM', 'SIGTERM');
  assert.deepEqual(exits, []);
  assert.deepEqual(later, ['after the line: 1']);
  assert.match(lines[0]!, /^received SIGTERM at /);
});

const exitOf = (child: ChildProcess) => new Promise<number | null>((resolve) => {
  if (child.exitCode !== null || child.signalCode !== null) resolve(child.exitCode);
  else child.on('exit', (code) => resolve(code));
});

const killQuietly = (pid: number | undefined, signal: NodeJS.Signals) => {
  if (pid === undefined || pid <= 1) return;
  try { process.kill(pid, signal); } catch { /* gone */ }
};

const packageScripts = () => (JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {scripts: Record<string, string>}).scripts;

test('the scripts the issue named run as node --import tsx, never through the tsx CLI (BGC-39)', () => {
  const scripts = packageScripts();
  const named = ['render', 'render:mp4', 'render:webm', 'render:gif', 'render:mov', 'render:png', 'render:pack', 'validate:pack', 'ship:pack', 'validate:exports', 'stills', 'qa:kit'];
  assert.deepEqual(named.filter((name) => !scripts[name]?.startsWith('node --import tsx scripts/')), []);
});

// The scripts that wait in the render slot's queue, each started from its package.json line, as npm starts it.
type QueueProbe = {
  script: string;
  /** After the line's own arguments. */
  args: (scratch: string, name: string) => string[];
  /** What only a run holding the slot writes: none of it may exist, before or after. */
  written: (scratch: string, name: string) => string[];
  /** Folders it writes before it queues (qa:kit's job.json), each with only job.json, deleted at the end. */
  staged?: (name: string) => string[];
  /** It writes the signal line (render:pack, BGC-38). */
  signalLine?: boolean;
};

const review = path.join(root, 'out', 'review');

const PROBES: QueueProbe[] = [
  {
    script: 'render:pack', signalLine: true,
    args: (scratch, name) => [path.join(scratch, `${name}.json`)],
    written: (_, name) => [path.join(root, 'out', 'packs', name), path.join(root, 'out', '.scratch', 'packs', name)],
  },
  {script: 'render:png', args: (scratch) => ['ChatLoop', '--out', path.join(scratch, 'chat.png')], written: (scratch) => [path.join(scratch, 'chat.png')]},
  {
    script: 'validate:exports',
    args: (scratch) => ['--composition', 'ChatLoop', '--out', path.join(scratch, 'validation')],
    written: (scratch) => [path.join(scratch, 'validation')],
  },
  {script: 'stills', args: (scratch) => [path.join(scratch, 'job.json')], written: (scratch) => [path.join(scratch, 'stills')]},
  {
    script: 'qa:kit',
    args: (scratch, name) => [path.join(scratch, `${name}.json`)],
    written: () => [],
    staged: (name) => (existsSync(review) ? readdirSync(review) : []).filter((entry) => entry.endsWith(`-qa-${name}`)).map((entry) => path.join(review, entry)),
  },
];

for (const probe of PROBES) {
  test(`${probe.script} stopped 200 ms in the queue under a SIGTERM: ${probe.signalLine ? 'logs the signal, ' : ''}leaves the queue, ends with 143`, async () => {
    const scratch = mkdtempSync(path.join(os.tmpdir(), 'queue-signal-'));
    const dir = path.join(scratch, 'render-slot');
    const queue = queueDir(dir);
    const name = 'bgc-signal-probe';
    writeFileSync(path.join(scratch, `${name}.json`), JSON.stringify({name, items: [{composition: 'ChatLoop', formats: ['png']}]}));
    writeFileSync(path.join(scratch, 'job.json'), JSON.stringify({outDir: 'stills', stills: [{name: 'chat', id: 'ChatLoop'}]}));
    // stills and qa:kit ask the machine check before they queue: a fake one that finds the machine free.
    const check = path.join(scratch, 'machine-check.py');
    writeFileSync(check, `print('{"livre": true, "reasons": []}')\n`);
    const written = probe.written(scratch, name);
    assert.deepEqual(written.filter((file) => existsSync(file)), []);
    assert.deepEqual(probe.staged?.(name) ?? [], []);
    // qa:kit creates out/review on its way; in a fresh checkout the folders it made go when empty.
    const missing = [review, path.dirname(review)].filter((folder) => !existsSync(folder));
    const env: NodeJS.ProcessEnv = {...process.env, RENDER_SLOT_DIR: dir, RENDER_SLOT_CHECK: 'off', [MACHINE_CHECK_ENV]: check};
    // A slot this process held would be inherited: the child would skip the queue.
    delete env[HELD_ENV];
    // Another process holds the slot, so the script waits in the queue, before its disk check and its bundle.
    const holder = spawn(process.execPath, ['--import', 'tsx', holderScript, 'forever', '20000'], {cwd: root, env, stdio: ['ignore', 'pipe', 'ignore']});
    let child: ChildProcess | undefined;
    let sender: ChildProcess | undefined;
    let stopped: number | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        let output = '';
        holder.stdout!.on('data', (chunk: Buffer) => { output += chunk.toString(); if (output.includes('held')) resolve(); });
        holder.on('exit', () => reject(new Error(`the holder exited before holding the slot: ${output}`)));
      });
      // Through the tsx CLI, a wrapper got the signal and SIGKILLed the node child that had not answered within
      // 30 + 30 ms: its handlers never ran, and its ticket stayed in the queue.
      const [program, ...line] = packageScripts()[probe.script]!.split(' ');
      const command = program === 'node' ? process.execPath : path.join(root, 'node_modules', '.bin', program!);
      child = spawn(command, [...line, ...probe.args(scratch, name)], {cwd: root, env, stdio: ['ignore', 'ignore', 'pipe']});
      let errors = '';
      child.stderr!.on('data', (chunk: Buffer) => { errors += chunk.toString(); });
      const exited = exitOf(child);
      // Its ticket names the process that runs the script, whatever wrapper started it.
      let ticket: string | undefined;
      // Up to a minute: before it queues, the script loads the catalog, slow under the full npm test.
      for (let i = 0; i < 1200 && ticket === undefined && child.exitCode === null; i += 1) {
        ticket = (existsSync(queue) ? readdirSync(queue) : []).find((file) => /^\d{15}-\d{7}\.json$/.test(file));
        if (ticket === undefined) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.ok(ticket !== undefined, `${probe.script} never queued: ${errors}`);
      stopped = Number(/-(\d{7})\.json$/.exec(ticket)![1]);
      assert.ok(stopped > 1, ticket);
      process.kill(stopped, 'SIGSTOP');
      sender = spawn('/bin/sh', ['-c', `kill -TERM ${child.pid}; echo sent; read line`], {stdio: ['pipe', 'pipe', 'ignore']});
      await new Promise<void>((resolve) => {
        sender!.stdout!.on('data', (chunk: Buffer) => { if (chunk.toString().includes('sent')) resolve(); });
      });
      // Stopped longer than the tsx CLI's 30 + 30 ms before its SIGKILL: on a loaded machine, a slow handler.
      await new Promise((resolve) => setTimeout(resolve, 200));
      killQuietly(stopped, 'SIGCONT');
      assert.equal(await exited, 143, errors);
      if (probe.signalLine) {
        // The process that got the signal logs it itself, the test as its parent: no wrapper in between.
        assert.match(errors, new RegExp(`received SIGTERM at \\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d: pid ${child.pid}, ppid ${process.pid} .*possible senders: .*\\b${sender.pid} \`/bin/sh -c kill -TERM ${child.pid}; echo sent; read line\``));
      }
      assert.equal(existsSync(path.join(queue, ticket)), false, 'the ticket stayed in the queue');
      const owner = JSON.parse(readFileSync(path.join(dir, 'owner.json'), 'utf8')) as {pid: number};
      assert.equal(owner.pid, holder.pid, 'the holder lost the slot');
      assert.equal(holder.exitCode, null);
      assert.deepEqual(written.filter((file) => existsSync(file)), []);
      if (probe.staged) {
        const staged = probe.staged(name);
        assert.equal(staged.length, 1, staged.join(', '));
        assert.deepEqual(readdirSync(staged[0]!), ['job.json']);
      }
    } finally {
      killQuietly(sender?.pid, 'SIGKILL');
      killQuietly(child?.pid, 'SIGKILL');
      killQuietly(stopped, 'SIGKILL');
      killQuietly(holder.pid, 'SIGKILL');
      await Promise.all([holder, child, sender].flatMap((proc) => (proc ? [exitOf(proc)] : [])));
      for (const folder of probe.staged?.(name) ?? []) rmSync(folder, {recursive: true, force: true});
      for (const folder of missing) try { rmdirSync(folder); } catch { /* not empty, or never made */ }
      rmSync(scratch, {recursive: true, force: true});
    }
  });
}
