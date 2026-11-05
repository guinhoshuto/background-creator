// scripts/mutate-run.ts on a throwaway git checkout with tiny node:test files: no render, no network.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test, type TestContext} from 'node:test';
import {fileURLToPath} from 'node:url';
import {EXIT, RestoreError, UsageError, applySwap, failure, isGreen, mutate, parseArgs, type TestRun} from '../scripts/mutate-run';
import {HELD_ENV, RenderSlotError, acquireRenderSlot, renderSlotHolder, renderSlotQueue, slotDir} from '../scripts/render-slot';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const FILES: Record<string, string> = {
  'lib/math.mjs': 'export const sum = (a, b) => a + b;\nexport const unused = 1;\n',
  'lib/wait.mjs': 'export const ready = () => Promise.resolve(true);\n',
  'src/answer.mjs': 'export const answer = 42;\n',
  'scripts/tool.mjs': 'export const tool = 1;\n',
  'tests/math.test.mjs': "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport {sum} from '../lib/math.mjs';\ntest('adds', () => assert.equal(sum(2, 3), 5));\n",
  'tests/wait.test.mjs': "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport {ready} from '../lib/wait.mjs';\ntest('is ready', async () => assert.equal(await ready(), true));\n",
  'tests/answer.test.mjs': "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport {answer} from '../src/answer.mjs';\ntest('answers', () => assert.equal(answer, 42));\n",
  'tests/red.test.mjs': "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('always fails', () => assert.fail('red'));\n",
  // A test that writes to a tracked file: the run must not pass that off as restored.
  // Logs who owns the render slot and whose slot this process inherits: it fails with no slot held.
  'tests/held.test.mjs': "import assert from 'node:assert/strict';\nimport {appendFileSync, readFileSync} from 'node:fs';\nimport {join} from 'node:path';\nimport test from 'node:test';\nimport {sum} from '../lib/math.mjs';\ntest('runs under the slot', () => {\n  const {pid} = JSON.parse(readFileSync(join(process.env.RENDER_SLOT_DIR, 'owner.json'), 'utf8'));\n  appendFileSync(process.env.HELD_LOG, `${pid} ${process.env.RENDER_SLOT_HELD}\\n`);\n  assert.equal(sum(2, 3), 5);\n});\n",
  'tests/writes.test.mjs': "import {appendFileSync} from 'node:fs';\nimport test from 'node:test';\nimport {ready} from '../lib/wait.mjs';\ntest('writes', async () => {\n  await ready();\n  appendFileSync(new URL('../lib/wait.mjs', import.meta.url), '// written by a test\\n');\n});\n",
};
// Uncommitted work under test, like the code a new test is written for: git diff must come back as it was.
const WORK_IN_PROGRESS = '// work in progress\n';
const quiet = () => {};

const checkout = async (t: TestContext) => {
  const root = await mkdtemp(join(tmpdir(), 'bgc-mutate-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const [path, text] of Object.entries(FILES)) {
    await mkdir(dirname(join(root, path)), {recursive: true});
    await writeFile(join(root, path), text);
  }
  await writeFile(join(root, 'package.json'), JSON.stringify({type: 'module'}));
  execFileSync('git', ['init', '-q'], {cwd: root, stdio: 'ignore'});
  execFileSync('git', ['add', 'lib', 'src', 'scripts', 'tests'], {cwd: root, stdio: 'ignore'});
  await writeFile(join(root, 'lib/math.mjs'), FILES['lib/math.mjs'] + WORK_IN_PROGRESS);
  const diff = () => createHash('sha256').update(execFileSync('git', ['diff', '--binary'], {cwd: root})).digest('hex');
  return {root, diff, read: (path: string) => readFile(join(root, path), 'utf8')};
};

test('mutate: a swap is literal, so $ patterns in the new text survive, and it must match the expected count', () => {
  assert.equal(applySwap("label = 'A'", "'A'", "'$$'"), "label = '$$'");
  assert.equal(applySwap('a-b', 'a', '$&$1$`'), '$&$1$`-b');
  assert.equal(applySwap('aa', 'a', 'b', 2), 'bb');
  assert.throws(() => applySwap('x', 'y', 'z'), /occurs 0 time\(s\), expected 1/);
  assert.throws(() => applySwap('aa', 'a', 'b'), /occurs 2 time\(s\), expected 1/);
});

test('mutate: green needs a pass and no failure, cancellation, crash or hang, each on its own', () => {
  const green: TestRun = {exitCode: 0, timedOut: false, output: '', tests: 2, pass: 2, fail: 0, cancelled: 0, failed: []};
  assert.equal(isGreen(green), true);
  // Each counter alone, with the exit code still 0: a reporter total is not left to the exit code.
  assert.equal(isGreen({...green, cancelled: 1}), false, 'a cancelled test (a timeout) is not green');
  assert.equal(isGreen({...green, fail: 1}), false);
  assert.equal(isGreen({...green, exitCode: 1}), false);
  assert.equal(isGreen({...green, timedOut: true}), false);
  assert.equal(isGreen({...green, tests: 0, pass: 0}), false, 'no test ran');
});

test('mutate: the CLI takes values that start with -- as code, and keeps --plan apart from a single mutation', () => {
  assert.deepEqual(parseArgs(['lib/x.ts', '--from', '--test-force-exit', '--to', '', '--test', 'tests/x.test.ts']).mutations,
    [{file: 'lib/x.ts', from: '--test-force-exit', to: '', test: 'tests/x.test.ts', name: undefined, occurrences: undefined}]);
  assert.equal(parseArgs(['--plan', 'plan.json', '--timeout', '5000']).timeoutMs, 5000);
  assert.equal(parseArgs(['--plan', 'plan.json']).timeoutMs, 120000);
  assert.equal(parseArgs(['--help']).help, true);
  assert.throws(() => parseArgs(['--plan', 'plan.json', 'lib/x.ts']), /--plan takes every mutation from the file/);
  assert.throws(() => parseArgs(['lib/x.ts', '--from', 'a', '--to', 'b']), /--from, --to and --test are required/);
  assert.throws(() => parseArgs(['lib/x.ts', '--from', 'a', '--from', 'b']), /only appear once/);
  assert.throws(() => parseArgs(['--plan', 'plan.json', '--timeout', '999']), /--timeout takes milliseconds/);
  assert.throws(() => parseArgs(['--bogus']), /Unknown option --bogus/);
});

test('mutate: a caught mutation is killed, an unchecked one survives, a hang counts as cancelled, and files and git diff come back', async (t) => {
  const {root, diff, read} = await checkout(t);
  const before = {math: await read('lib/math.mjs'), wait: await read('lib/wait.mjs'), diff: diff()};
  const {code, results} = await mutate([
    {file: 'lib/math.mjs', from: 'a + b', to: 'a - b', test: 'tests/math.test.mjs'},
    {file: 'lib/math.mjs', from: 'unused = 1', to: 'unused = 2', test: 'tests/math.test.mjs'},
    {file: 'lib/wait.mjs', from: 'Promise.resolve(true)', to: 'new Promise(() => {})', test: 'tests/wait.test.mjs'},
  ], {root, timeoutMs: 1000, log: quiet});
  assert.equal(code, 1, 'exit code 1: a mutation survived');
  assert.deepEqual(results.map((result) => result.killed), [true, false, true]);
  assert.equal(results[0]!.fail, 1);
  assert.equal(results[1]!.pass, 1);
  assert.equal(results[2]!.cancelled, 1, 'a test that never settles is cancelled by --test-timeout');
  assert.equal(results[2]!.timedOut, false, 'the test timeout ends the run, not the watchdog');
  assert.equal(await read('lib/math.mjs'), before.math, 'the uncommitted work is still there');
  assert.equal(await read('lib/wait.mjs'), before.wait);
  assert.equal(diff(), before.diff, 'git diff is as it was');
  assert.deepEqual(await readdir(join(root, '.cache/mutate')), [], 'no backup is left behind');
});

test('mutate: src/ and scripts/ outside a worktree need --allow-live-checkout', async (t) => {
  const {root, read} = await checkout(t);
  const mutation = {file: 'src/answer.mjs', from: '42', to: '41', test: 'tests/answer.test.mjs'};
  await assert.rejects(mutate([mutation], {root, log: quiet}), /read by the Studio and the renders of every session/);
  await assert.rejects(mutate([{file: 'scripts/tool.mjs', from: '1', to: '2', test: 'tests/math.test.mjs'}], {root, log: quiet}),
    /read by the Studio and the renders of every session/, 'scripts/ is live too');
  const {code, results} = await mutate([mutation], {root, allowLiveCheckout: true, timeoutMs: 5000, log: quiet});
  assert.equal(code, 0, 'exit code 0: every mutation was killed');
  assert.equal(results[0]!.killed, true);
  assert.equal(await read('src/answer.mjs'), FILES['src/answer.mjs']);
});

test('mutate: inside a linked worktree, src/ needs no flag', async (t) => {
  const {root} = await checkout(t);
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'], {cwd: root, stdio: 'ignore'});
  const tree = join(root, '.claude/worktrees/probe');
  execFileSync('git', ['worktree', 'add', '-q', tree], {cwd: root, stdio: 'ignore'});
  await writeFile(join(tree, 'package.json'), JSON.stringify({type: 'module'}));
  const {code} = await mutate([{file: 'src/answer.mjs', from: '42', to: '41', test: 'tests/answer.test.mjs'}], {root: tree, timeoutMs: 5000, log: quiet});
  assert.equal(code, 0);
});

test('mutate: setup errors change nothing: a missing literal, a red baseline, a backup left by a crashed run', async (t) => {
  const {root, read} = await checkout(t);
  const math = await read('lib/math.mjs');
  await assert.rejects(mutate([{file: 'lib/math.mjs', from: 'a * b', to: 'a / b', test: 'tests/math.test.mjs'}], {root, log: quiet}),
    /lib\/math\.mjs: "from" occurs 0 time/);
  await assert.rejects(mutate([{file: 'lib/math.mjs', from: 'a + b', to: 'a - b', test: 'tests/red.test.mjs'}], {root, timeoutMs: 5000, log: quiet}),
    /is not green before any mutation/);
  await mkdir(join(root, '.cache/mutate'), {recursive: true});
  await writeFile(join(root, '.cache/mutate/lib__math.mjs.orig'), 'crashed run');
  await assert.rejects(mutate([{file: 'lib/math.mjs', from: 'a + b', to: 'a - b', test: 'tests/math.test.mjs'}], {root, log: quiet}), /A previous run left/);
  assert.equal(await read('lib/math.mjs'), math);
});

test('mutate: a name that matches no test is refused before any swap, and one that matches still runs', async (t) => {
  const {root, read} = await checkout(t);
  const math = await read('lib/math.mjs');
  // A label in "name": node --test then runs none of the file's tests and reports the file itself as passed.
  await assert.rejects(mutate([{file: 'lib/math.mjs', from: 'a + b', to: 'a - b', test: 'tests/math.test.mjs', name: 'M1 sum flipped'}], {root, timeoutMs: 5000, log: quiet}),
    /tests\/math\.test\.mjs \(--name M1 sum flipped\) ran none of its tests, so a kill would prove nothing: the pattern matches no test name/);
  assert.equal(await read('lib/math.mjs'), math);
  const {code, results} = await mutate([{file: 'lib/math.mjs', from: 'a + b', to: 'a - b', test: 'tests/math.test.mjs', name: 'adds'}], {root, timeoutMs: 5000, log: quiet});
  assert.equal(code, 0, 'the one test named "adds" ran and caught the swap');
  assert.equal(results[0]!.fail, 1);
});

test('mutate: a test that writes to a tracked file fails the run, even with every mutated file restored', async (t) => {
  const {root} = await checkout(t);
  await assert.rejects(mutate([{file: 'lib/math.mjs', from: 'a + b', to: 'a - b', test: 'tests/writes.test.mjs'}], {root, timeoutMs: 5000, log: quiet}),
    /git diff changed during the run/);
});

// The real CLI: its root is where the script sits, so it runs from a copy in the throwaway checkout, on a private slot.
const cliCheckout = async (t: TestContext) => {
  const box = await checkout(t);
  for (const script of ['mutate.ts', 'mutate-run.ts', 'render-slot.ts']) await copyFile(join(REPO, 'scripts', script), join(box.root, 'scripts', script));
  const dir = join(box.root, '.slot', 'render-slot');
  const heldLog = join(box.root, '.slot', 'held.log');
  await mkdir(dirname(dir));
  const plan = join(box.root, '.slot', 'plan.json');
  const start = (args: string[]) => {
    const env: NodeJS.ProcessEnv = {...process.env, RENDER_SLOT_DIR: dir, HELD_LOG: heldLog};
    // A slot this process held would be inherited: the run would skip the queue.
    delete env[HELD_ENV];
    // --import tsx resolves from the working directory, the repo's; the script's root is still the copy's folder.
    const child = spawn(process.execPath, ['--import', 'tsx', join(box.root, 'scripts/mutate.ts'), ...args], {cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe']});
    t.after(() => { child.kill('SIGKILL'); });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    const exited = new Promise<number | null>((done) => { child.on('exit', (code) => done(code)); });
    return {child, exited, output: () => output};
  };
  type Run = ReturnType<typeof start>;
  /** Up to a minute: under the full npm test the script takes seconds to load. */
  const until = async (done: () => boolean | Promise<boolean>, run: Run, what: string) => {
    for (const started = Date.now(); !(await done()); await new Promise((resolve) => setTimeout(resolve, 20))) {
      assert.ok(run.child.exitCode === null && Date.now() - started < 60_000, `${what}: ${run.output()}`);
    }
  };
  const queued = (run: Run) => until(() => renderSlotQueue(dir).some(({pid}) => pid === run.child.pid), run, 'it never joined the queue');
  /** Another process holds the slot: this test's, as `npm run clean` holds it in tests/pack-wait-disk.test.ts. */
  const holdSlot = async () => {
    const slot = await acquireRenderSlot({dir, command: 'another render', wait: false, repo: 'test', log: quiet});
    t.after(() => slot.release());
    return slot;
  };
  const writePlan = async (mutations: unknown[]) => {
    await writeFile(plan, JSON.stringify(mutations));
    return ['--plan', plan];
  };
  const heldLines = async () => (await readFile(heldLog, 'utf8')).trim().split('\n');
  return {...box, dir, heldLog, start, until, queued, holdSlot, writePlan, heldLines};
};

const SUM = {file: 'lib/math.mjs', from: 'a + b', to: 'a - b', test: 'tests/held.test.mjs'};
const FORMS: [string, (box: Awaited<ReturnType<typeof cliCheckout>>) => Promise<string[]> | string[]][] = [
  ['a plan', (box) => box.writePlan([SUM])],
  ['one mutation', () => [SUM.file, '--from', SUM.from, '--to', SUM.to, '--test', SUM.test]],
];

for (const [form, argsOf] of FORMS) {
  test(`mutate CLI: with the render slot held by another process, ${form} waits in its queue, starts only when it gets the slot and holds it until it ends`, async (t) => {
    const box = await cliCheckout(t);
    const before = {math: await box.read('lib/math.mjs'), diff: box.diff()};
    const slot = await box.holdSlot();
    const run = box.start(await argsOf(box));
    await box.queued(run);
    await box.until(() => /Waiting for the render slot/.test(run.output()), run, 'it never said it waits');
    // Long enough for a baseline to have run, had it not waited.
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(existsSync(box.heldLog), false, 'a test ran while another process held the slot');
    assert.equal(existsSync(join(box.root, '.cache/mutate')), false, 'it touched a file while another process held the slot');
    assert.equal(run.child.exitCode, null);
    assert.equal(renderSlotHolder(box.dir)?.owner?.command, 'another render');
    slot.release();
    assert.equal(await run.exited, EXIT.killed, run.output());
    // The baseline and the mutated run: both under this run's slot, which each test inherits.
    const pid = run.child.pid;
    assert.deepEqual(await box.heldLines(), [`${pid} ${pid}`, `${pid} ${pid}`]);
    assert.equal(renderSlotHolder(box.dir), undefined, 'the slot is free once it ends');
    assert.deepEqual(renderSlotQueue(box.dir), []);
    assert.equal(await box.read('lib/math.mjs'), before.math);
    assert.equal(box.diff(), before.diff);
  });
}

test('mutate CLI: what runs no mutation stays outside the slot: --help and a refused plan answer at once, with the slot held', async (t) => {
  const box = await cliCheckout(t);
  await box.holdSlot();
  const missing = await box.writePlan([{...SUM, from: 'a * b'}]);
  const runs: [string[], number, RegExp][] = [
    [['--help'], EXIT.killed, /Usage: npm run mutate/],
    [['--bogus'], EXIT.usage, /Unknown option --bogus/],
    [missing, EXIT.usage, /lib\/math\.mjs: "from" occurs 0 time/],
  ];
  for (const [args, code, said] of runs) {
    const run = box.start(args);
    await box.until(() => run.child.exitCode !== null || renderSlotQueue(box.dir).length > 0 || /Waiting/.test(run.output()), run, 'it never answered');
    assert.equal(await Promise.race([run.exited, new Promise((resolve) => setTimeout(() => resolve('still running'), 500))]), code, `${args.join(' ')}: ${run.output()}`);
    assert.match(run.output(), said);
    assert.doesNotMatch(run.output(), /Waiting for the render slot/);
  }
  assert.equal(existsSync(box.heldLog), false);
});

test('mutate CLI: an edit made during the wait is kept: the run reads the file with the slot in hand, and judges and restores that', async (t) => {
  const box = await cliCheckout(t);
  const slot = await box.holdSlot();
  const run = box.start(await box.writePlan([SUM]));
  await box.queued(run);
  const edited = `${await box.read('lib/math.mjs')}// edited during the wait\n`;
  await writeFile(join(box.root, 'lib/math.mjs'), edited);
  const diff = box.diff();
  slot.release();
  assert.equal(await run.exited, EXIT.killed, run.output());
  assert.equal(await box.read('lib/math.mjs'), edited, 'the restore dropped the edit');
  assert.equal(box.diff(), diff);
});

test('mutate CLI: a SIGTERM with a mutant on disk puts the file back, frees the slot and ends with 143', async (t) => {
  const box = await cliCheckout(t);
  const wait = await box.read('lib/wait.mjs');
  const to = 'new Promise(() => {})';
  const run = box.start(await box.writePlan([{file: 'lib/wait.mjs', from: 'Promise.resolve(true)', to, test: 'tests/wait.test.mjs'}]));
  await box.until(async () => (await box.read('lib/wait.mjs')).includes(to), run, 'the mutant never landed');
  assert.equal(renderSlotHolder(box.dir)?.owner?.pid, run.child.pid);
  run.child.kill('SIGTERM');
  assert.equal(await run.exited, 143, run.output());
  assert.equal(await box.read('lib/wait.mjs'), wait);
  assert.deepEqual(await readdir(join(box.root, '.cache/mutate')), []);
  assert.equal(renderSlotHolder(box.dir), undefined);
});

test('mutate: a run with no turn in the slot exits 75; each failure keeps its code, and a denied slot points to the way out', () => {
  assert.deepEqual(failure(new RenderSlotError('RENDER_SLOT_TIMEOUT', 'Gave up after 240 minutes.', 'Run again.')), {code: 75, message: 'Gave up after 240 minutes. Run again.'});
  assert.deepEqual(failure(new RestoreError('x differs')), {code: 3, message: 'RESTORE FAILED: x differs'});
  assert.deepEqual(failure(new UsageError('bad plan')), {code: 2, message: 'bad plan'});
  const denied = Object.assign(new Error('EPERM: operation not permitted'), {code: 'EPERM', path: slotDir()});
  assert.deepEqual(failure(denied), {code: 2, message: 'No permission for the render slot (sandbox): run again with escalation. EPERM: operation not permitted'});
  // The same error on another file is not the sandbox's slot: it keeps its stack.
  const elsewhere = Object.assign(new Error('EPERM: operation not permitted'), {code: 'EPERM', path: '/x/lib/math.mjs'});
  assert.deepEqual(failure(elsewhere), {code: 2, message: elsewhere.stack});
});
