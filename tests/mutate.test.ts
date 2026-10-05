// scripts/mutate-run.ts on a throwaway git checkout with tiny node:test files: no render, no network.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test, type TestContext} from 'node:test';
import {applySwap, isGreen, mutate, parseArgs, type TestRun} from '../scripts/mutate-run';

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

test('mutate: a test that writes to a tracked file fails the run, even with every mutated file restored', async (t) => {
  const {root} = await checkout(t);
  await assert.rejects(mutate([{file: 'lib/math.mjs', from: 'a + b', to: 'a - b', test: 'tests/writes.test.mjs'}], {root, timeoutMs: 5000, log: quiet}),
    /git diff changed during the run/);
});
