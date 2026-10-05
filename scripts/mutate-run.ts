/**
 * Proves that a test catches a change: swaps one literal in a file, runs the named test file with a
 * bounded runner, and puts the file back byte for byte. A mutation the test does not notice survived.
 * Ported from the se-dev-kit's scripts/mutate.mjs (BGC-27): a mutation undone by hand with git
 * checkout once took an uncommitted fix along.
 */
import {execFileSync, spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, rmSync, writeFileSync} from 'node:fs';
import {lstat, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path';

export const EXIT = {killed: 0, survived: 1, usage: 2, restore: 3} as const;
export const DEFAULT_TIMEOUT_MS = 120_000;
const KEYS = ['file', 'from', 'to', 'test', 'name', 'occurrences'];

export class UsageError extends Error {}
export class RestoreError extends Error {}
const usage: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new UsageError(message);
};

export const MUTATE_HELP = `Usage: npm run mutate -- <file> --from <old> --to <new> --test <test-file> [--name <pattern>] [--occurrences <n>]
       npm run mutate -- --plan <mutations.json>
Options: --timeout <ms>         per-test timeout (--test-timeout), default ${DEFAULT_TIMEOUT_MS}; a run is killed after 3x + 30 s
         --allow-live-checkout  allow src/ and scripts/ mutations outside a linked worktree (in the main checkout,
                                the Studio and the renders of every session read them)

Swaps a literal (split/join, so $ patterns stay literal), checks the swap landed, runs the test file with
--test-timeout and --test-force-exit, and restores the file, checked byte for byte, and git diff. The backup
sits in .cache/mutate/ while the file is mutated. The named test must be green before the swap. A mutation
is killed when the run is not green: a failure, a cancellation (a timeout), a crash or a hang.
A plan is a JSON array of {file, from, to, test, name?, occurrences?}, or {"mutations": [...]}: code with
quotes, $ or backticks needs no shell quoting there.
Never undo a mutation with git checkout or git restore: they take uncommitted work along.
Exit codes: 0 all killed, 1 some survived, 2 usage or setup error, 3 a file could not be restored.`;

export type Mutation = {file: string; from: string; to: string; test: string; name?: string; occurrences?: number};
type Checked = Mutation & {occurrences: number};
export type MutateOptions = {help?: boolean; timeoutMs: number; allowLiveCheckout: boolean; planPath?: string; mutations?: Mutation[]};

export function parseArgs(args: readonly string[]): MutateOptions {
  const options: MutateOptions = {timeoutMs: DEFAULT_TIMEOUT_MS, allowLiveCheckout: false};
  const values: Record<string, string> = {
    '--from': 'from', '--to': 'to', '--test': 'test', '--name': 'name', '--occurrences': 'occurrences', '--plan': 'plan', '--timeout': 'timeout',
  };
  const given: Record<string, string> = {};
  const positional: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--allow-live-checkout') options.allowLiveCheckout = true;
    else if (Object.hasOwn(values, arg)) {
      // The value is taken as is, even when it starts with "--": code to mutate often does.
      usage(index + 1 < args.length, `${arg} requires a value.`);
      usage(!Object.hasOwn(given, values[arg]!), `${arg} may only appear once.`);
      given[values[arg]!] = args[++index]!;
    } else if (arg.startsWith('--')) throw new UsageError(`Unknown option ${arg}. Run with --help.`);
    else positional.push(arg);
  }
  if (options.help) return options;
  if (given.timeout !== undefined) {
    options.timeoutMs = Number(given.timeout);
    usage(Number.isInteger(options.timeoutMs) && options.timeoutMs >= 1000 && options.timeoutMs <= 600_000, '--timeout takes milliseconds from 1000 to 600000.');
  }
  if (given.plan !== undefined) {
    usage(positional.length === 0 && ['from', 'to', 'test', 'name', 'occurrences'].every((key) => given[key] === undefined),
      '--plan takes every mutation from the file: drop <file>, --from, --to, --test, --name and --occurrences.');
    options.planPath = given.plan;
    return options;
  }
  usage(positional.length === 1, 'Name exactly one file to mutate, or pass --plan <mutations.json>.');
  usage(given.from !== undefined && given.to !== undefined && given.test !== undefined, '--from, --to and --test are required with a file.');
  options.mutations = [{
    file: positional[0]!, from: given.from, to: given.to, test: given.test, name: given.name,
    occurrences: given.occurrences === undefined ? undefined : Number(given.occurrences),
  }];
  return options;
}

/** A literal swap with split/join: `$$`, `$&` and friends in `to` stay literal, where String.replace expands them. */
export function applySwap(text: string, from: string, to: string, occurrences = 1) {
  const parts = text.split(from);
  usage(parts.length - 1 === occurrences, `"from" occurs ${parts.length - 1} time(s), expected ${occurrences}.`);
  return parts.join(to);
}

async function inside(root: string, value: unknown, label: string) {
  usage(typeof value === 'string' && value.length > 0, `${label} must be a path.`);
  const path = relative(root, resolve(root, value));
  usage(path && !path.startsWith('..') && !isAbsolute(path), `${label} must be inside ${root}.`);
  let info;
  try {
    info = await lstat(resolve(root, path));
  } catch {
    throw new UsageError(`${label} does not exist: ${path}.`);
  }
  usage(info.isFile(), `${label} must be a regular file, not a link or a folder: ${path}.`);
  return path.split(sep).join('/');
}

export async function checkMutation(raw: unknown, index: number, root: string): Promise<Checked> {
  const where = `Mutation ${index + 1}`;
  usage(raw !== null && typeof raw === 'object' && !Array.isArray(raw), `${where} must be an object.`);
  const entry = raw as Record<string, unknown>;
  const unknown = Object.keys(entry).filter((key) => !KEYS.includes(key));
  usage(unknown.length === 0, `${where} has unknown keys: ${unknown.join(', ')}.`);
  usage(typeof entry.from === 'string' && entry.from.length > 0, `${where}: "from" must be non-empty text.`);
  usage(typeof entry.to === 'string' && entry.to !== entry.from, `${where}: "to" must be text that differs from "from".`);
  usage(entry.name === undefined || (typeof entry.name === 'string' && entry.name.length > 0), `${where}: "name" must be a test name pattern.`);
  const occurrences = entry.occurrences ?? 1;
  usage(Number.isInteger(occurrences) && (occurrences as number) >= 1, `${where}: "occurrences" must be a positive integer.`);
  const file = await inside(root, entry.file, `${where}: "file"`);
  const test = await inside(root, entry.test, `${where}: "test"`);
  usage(/\.test\.(ts|mts|mjs|js|cjs)$/.test(test), `${where}: "test" must be a *.test.* file.`);
  return {file, from: entry.from, to: entry.to, test, name: entry.name as string | undefined, occurrences: occurrences as number};
}

export type RunSummary = {tests?: number; pass?: number; fail?: number; cancelled?: number; skipped?: number; failed: string[]};

/** The spec reporter's totals and the names of the tests that failed. */
export function summarize(output: string): RunSummary {
  const total = (name: string) => {
    const match = [...output.matchAll(new RegExp(`^ℹ ${name} (\\d+)$`, 'gm'))].at(-1);
    return match ? Number(match[1]) : undefined;
  };
  const failed = [...new Set([...output.matchAll(/^\s*✖ (.+?)(?: \([\d.]+ms\))?$/gm)].map((match) => match[1]!).filter((name) => name !== 'failing tests:'))];
  return {tests: total('tests'), pass: total('pass'), fail: total('fail'), cancelled: total('cancelled'), skipped: total('skipped'), failed: failed.slice(0, 5)};
}

export type TestRun = RunSummary & {exitCode: number; timedOut: boolean; output: string};

/** Green means: a test passed, none failed or was cancelled (a timeout), node exited 0 and no watchdog fired. */
export const isGreen = (run: TestRun) =>
  !run.timedOut && run.exitCode === 0 && (run.pass ?? 0) > 0 && !run.fail && !run.cancelled;

const running = new Set<ChildProcess>();
const killGroup = (child: ChildProcess) => {
  try {
    process.kill(-child.pid!, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch { /* already gone */ }
  }
};

function spawnBounded(command: string, args: string[], {cwd, limitMs}: {cwd: string; limitMs: number}) {
  return new Promise<{exitCode: number; timedOut: boolean; output: string}>((done, fail) => {
    // A nested `node --test` would otherwise talk its parent runner's protocol instead of printing.
    const env = {...process.env};
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(command, args, {cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
    running.add(child);
    let output = '';
    let timedOut = false;
    const collect = (chunk: string) => {
      output = (output + chunk).slice(-2_000_000);
    };
    child.stdout.setEncoding('utf8').on('data', collect);
    child.stderr.setEncoding('utf8').on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, limitMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      running.delete(child);
      fail(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      running.delete(child);
      done({exitCode: code ?? (signal ? 128 : 1), timedOut, output});
    });
  });
}

const tail = (output: string, lines = 30) => output.trimEnd().split('\n').slice(-lines).join('\n');

/** One bounded run of a test file; the watchdog kills its process group if the runner itself hangs. */
export async function runTest({root, test, name, timeoutMs}: {root: string; test: string; name?: string; timeoutMs: number}): Promise<TestRun> {
  const args = [
    ...(/\.m?ts$/.test(test) ? ['--import', 'tsx'] : []),
    '--test', '--test-reporter=spec', `--test-timeout=${timeoutMs}`, '--test-force-exit',
    ...(name ? [`--test-name-pattern=${name}`] : []), test,
  ];
  const run = await spawnBounded(process.execPath, args, {cwd: root, limitMs: timeoutMs * 3 + 30_000});
  return {...run, ...summarize(run.output)};
}

function gitDiff(root: string) {
  try {
    return createHash('sha256').update(execFileSync('git', ['-C', root, 'diff', '--binary', '--no-ext-diff', '--no-color'], {
      maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    })).digest('hex');
  } catch {
    throw new UsageError(`${root} is not a git checkout: mutate compares git diff before and after the run.`);
  }
}

function linkedWorktree(root: string) {
  try {
    const [directory, common] = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split('\n');
    return Boolean(directory && common && directory !== common);
  } catch {
    return false;
  }
}

export const backupPath = (root: string, file: string) => resolve(root, '.cache', 'mutate', `${file.replaceAll('/', '__')}.orig`);
type Active = {path: string; original: Buffer; backup: string};
let active: Active | undefined;

async function restore({path, original, backup}: Active) {
  await writeFile(path, original);
  if (!(await readFile(path)).equals(original)) {
    throw new RestoreError(`${path} still differs from its original after the restore; the original bytes are in ${backup}.`);
  }
  await rm(backup);
}

/** For signals: puts the file under mutation back synchronously and stops the test run. */
export function restoreNow() {
  for (const child of running) killGroup(child);
  if (!active) return;
  try {
    writeFileSync(active.path, active.original);
    rmSync(active.backup, {force: true});
  } catch { /* the backup stays for a manual restore */ }
}

const short = (text: string) => {
  const value = JSON.stringify(text);
  return value.length > 60 ? `${value.slice(0, 57)}…"` : value;
};

function describe(result: TestRun) {
  if (result.timedOut) return 'hung until the watchdog killed it';
  const parts: string[] = [];
  if (result.fail) parts.push(`${result.fail} failed`);
  if (result.cancelled) parts.push(`${result.cancelled} cancelled (timeout)`);
  if (parts.length === 0 && result.exitCode !== 0) parts.push(`node exited ${result.exitCode}`);
  if (parts.length === 0 && !result.tests) parts.push('no test ran');
  if (parts.length === 0) parts.push(`${result.pass} of ${result.tests} passed`);
  return `${parts.join(', ')}${result.failed.length > 0 ? `: ${result.failed.join(' | ')}` : ''}`;
}

export type MutationResult = Checked & {killed: boolean} & Omit<TestRun, 'output'>;

/**
 * Runs each mutation in turn: every `from` is found and every named test is green before any file
 * changes; each file is backed up under .cache/mutate/, mutated, tested, and restored before the next.
 * Returns {code, results}; throws UsageError for a setup problem or a refusal and RestoreError when a
 * file stays changed.
 */
export async function mutate(mutations: readonly unknown[], {
  root, allowLiveCheckout = false, timeoutMs = DEFAULT_TIMEOUT_MS, log = console.log,
}: {root: string; allowLiveCheckout?: boolean; timeoutMs?: number; log?: (line: string) => void}) {
  usage(Array.isArray(mutations) && mutations.length > 0, 'There are no mutations to run.');
  const checked: Checked[] = [];
  for (const [index, raw] of mutations.entries()) checked.push(await checkMutation(raw, index, root));
  const live = checked.some((mutation) => /^(src|scripts)\//.test(mutation.file));
  usage(!live || allowLiveCheckout || linkedWorktree(root),
    'In the main checkout, src/ and scripts/ are read by the Studio and the renders of every session: run mutate in a worktree (.claude/worktrees/<name>), or pass --allow-live-checkout when no session uses this checkout.');
  const originals = new Map<string, Buffer>();
  for (const {file, from, to, occurrences} of checked) {
    usage(!existsSync(backupPath(root, file)),
      `A previous run left ${relative(root, backupPath(root, file))}: compare it with ${file}, keep the right bytes, and delete the backup.`);
    if (!originals.has(file)) {
      const bytes = await readFile(resolve(root, file));
      usage(Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes), `${file} is not UTF-8 text.`);
      originals.set(file, bytes);
    }
    try {
      applySwap(originals.get(file)!.toString('utf8'), from, to, occurrences);
    } catch (error) {
      throw new UsageError(`${file}: ${(error as Error).message}`);
    }
  }
  const diff = gitDiff(root);
  const results: MutationResult[] = [];
  const baselines = new Set<string>();
  for (const {test, name} of checked) {
    const key = `${test}\0${name ?? ''}`;
    if (baselines.has(key)) continue;
    const run = await runTest({root, test, name, timeoutMs});
    usage(isGreen(run), `${test}${name ? ` (--name ${name})` : ''} is not green before any mutation, so a kill would prove nothing: ${describe(run)}.\n${tail(run.output)}`);
    baselines.add(key);
  }
  for (const mutation of checked) {
    const path = resolve(root, mutation.file);
    const original = originals.get(mutation.file)!;
    const mutant = Buffer.from(applySwap(original.toString('utf8'), mutation.from, mutation.to, mutation.occurrences), 'utf8');
    const backup = backupPath(root, mutation.file);
    await mkdir(dirname(backup), {recursive: true});
    await writeFile(backup, original, {flag: 'wx'});
    active = {path, original, backup};
    try {
      await writeFile(path, mutant);
      usage((await readFile(path)).equals(mutant), `The mutation of ${mutation.file} did not land.`);
      const run = await runTest({root, test: mutation.test, name: mutation.name, timeoutMs});
      const result: MutationResult = {
        ...mutation, killed: !isGreen(run), exitCode: run.exitCode, timedOut: run.timedOut,
        tests: run.tests, pass: run.pass, fail: run.fail, cancelled: run.cancelled, skipped: run.skipped, failed: run.failed,
      };
      results.push(result);
      log(`${result.killed ? 'KILLED  ' : 'SURVIVED'} ${mutation.file}: ${short(mutation.from)} -> ${short(mutation.to)} · ${describe(run)}`);
    } finally {
      await restore(active);
      active = undefined;
    }
  }
  if (gitDiff(root) !== diff) {
    throw new RestoreError('git diff changed during the run although every mutated file was restored: another process edited this checkout, or a test wrote to tracked files.');
  }
  return {code: results.some((result) => !result.killed) ? EXIT.survived : EXIT.killed, results};
}

export async function readPlan(path: string) {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8'));
  } catch (error) {
    throw new UsageError(`Cannot read the plan ${path}: ${(error as Error).message}`);
  }
  const list = Array.isArray(value) ? value : (value as {mutations?: unknown} | null)?.mutations;
  usage(Array.isArray(list) && list.length > 0, 'A plan is a non-empty JSON array of mutations, or {"mutations": [...]}.');
  return list as unknown[];
}
