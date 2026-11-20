import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {MACHINE_CHECK_ENV, machineCheckScript, machineVerdict, parseVerdict} from '../scripts/machine-check';
import {COPY_PATH, RECORD_PATH, WRITE_COMMAND, checkCopy, parseRecord, sha256} from '../scripts/render-slot-copy';
import {HEAVY_PATTERNS, WRAPPERS, busyOutsideSlot, busyProcesses} from '../scripts/render-turn';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A stand-in for maquina_livre.py that answers `answer` with `exit` and puts its argv in the reasons. */
const fakeCheck = (t: {after: (fn: () => void) => void}, answer: object, exit: number) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'machine-check-test-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const script = path.join(dir, 'maquina_livre.py');
  writeFileSync(script, [
    'import json, sys',
    `answer = json.loads(${JSON.stringify(JSON.stringify(answer))})`,
    'if not answer["livre"]: answer["reasons"].append("argv " + " ".join(sys.argv[1:]))',
    'print(json.dumps(answer))',
    `sys.exit(${exit})`,
  ].join('\n'));
  return script;
};

test('a busy answer (exit 3) gives its reasons, and the check is asked for this run\'s family', (t) => {
  const script = fakeCheck(t, {livre: false, motivos: ['o jogo está aberto'], reasons: ['the game (Client-Mac-Shipping) is open']}, 3);
  const verdict = machineVerdict(4242, script);
  assert.deepEqual(verdict, {free: false, reasons: ['the game (Client-Mac-Shipping) is open', 'argv --json --familia 4242']});
});

test('outsideSlot asks the check only for what the render slot does not cover (--fora-da-trava)', (t) => {
  const script = fakeCheck(t, {livre: false, motivos: [], reasons: []}, 3);
  assert.deepEqual(machineVerdict(4242, script, {outsideSlot: true})?.reasons, ['argv --json --familia 4242 --fora-da-trava']);
  assert.deepEqual(machineVerdict(4242, script, {outsideSlot: false})?.reasons, ['argv --json --familia 4242']);
});

test('busyOutsideSlot asks --fora-da-trava and busyProcesses the whole check, both for this run\'s family', (t) => {
  const script = fakeCheck(t, {livre: false, motivos: [], reasons: []}, 3);
  const previous = process.env[MACHINE_CHECK_ENV];
  process.env[MACHINE_CHECK_ENV] = script;
  t.after(() => { if (previous === undefined) delete process.env[MACHINE_CHECK_ENV]; else process.env[MACHINE_CHECK_ENV] = previous; });
  assert.deepEqual(busyOutsideSlot(), [`argv --json --familia ${process.pid} --fora-da-trava`]);
  assert.deepEqual(busyProcesses(), [`argv --json --familia ${process.pid}`]);
});

test('without the check, busyOutsideSlot falls back to the process list and asks who holds the slot', () => {
  let asked = 0;
  const fallback = busyOutsideSlot(() => null, () => { asked += 1; return undefined; });
  assert.equal(asked, 1);
  assert.ok(Array.isArray(fallback) && fallback.every((line) => /^\d+ /.test(line)), JSON.stringify(fallback));
  assert.deepEqual(busyOutsideSlot(() => ({free: true, reasons: []}), () => { asked += 1; return undefined; }), []);
  assert.equal(asked, 1, 'asked for the slot holder although the check answered');
});

test('a free answer (exit 0) has no reason', (t) => {
  assert.deepEqual(machineVerdict(1, fakeCheck(t, {livre: true, motivos: [], reasons: []}, 0)), {free: true, reasons: []});
});

test('no check on this machine, or no answer from it, is null: the caller falls back to its own check', (t) => {
  assert.equal(machineVerdict(1, path.join(os.tmpdir(), 'no-such-dir', 'maquina_livre.py')), null);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'machine-check-test-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const broken = path.join(dir, 'maquina_livre.py');
  writeFileSync(broken, 'raise SystemExit(1)\n');
  assert.equal(machineVerdict(1, broken), null);
  assert.equal(parseVerdict('livre'), null);
  assert.equal(parseVerdict('{"livre": "no", "reasons": []}'), null);
  assert.deepEqual(parseVerdict('{"livre": false, "reasons": []}'), {free: false, reasons: ['the machine check says to wait, without a reason']});
});

test('stills waits for what the machine check says, and uses the process list only without it', () => {
  assert.deepEqual(busyProcesses(() => ({free: false, reasons: ['12% of memory free, below 30%']})), ['12% of memory free, below 30%']);
  assert.deepEqual(busyProcesses(() => ({free: true, reasons: []})), []);
  const fallback = busyProcesses(() => null);
  assert.ok(Array.isArray(fallback) && fallback.every((line) => /^\d+ /.test(line)), JSON.stringify(fallback));
});

const vault = path.join(os.homedir(), 'obsidian', 'AI', 'scripts');

test('the real machine check answers on this machine', {skip: !existsSync(machineCheckScript()) && 'no maquina_livre.py here'}, () => {
  assert.notEqual(machineVerdict(), null);
});

test('the fallback looks for the same renders and wrappers as the machine check', {skip: !existsSync(path.join(vault, 'maquina_livre.py')) && 'no vault here'}, () => {
  // The fallback saw neither a still, the compositor nor Blender long after the check did (HAR-32).
  const read = 'import json, sys; sys.path.insert(0, sys.argv[1]); import maquina_livre as m; print(json.dumps({"heavy": [p.pattern for p in m.PESADO], "wrappers": sorted(m.EMBRULHO)}))';
  const check = JSON.parse(execFileSync('python3', ['-c', read, vault], {encoding: 'utf8'})) as {heavy: string[]; wrappers: string[]};
  const fix = 'edit HEAVY_PATTERNS and WRAPPERS in scripts/render-turn.ts to match PESADO and EMBRULHO in ~/obsidian/AI/scripts/maquina_livre.py';
  assert.ok(check.heavy.length > 0 && check.wrappers.length > 0, `read nothing from the check: ${JSON.stringify(check)}`);
  assert.deepEqual(HEAVY_PATTERNS, check.heavy, fix);
  assert.deepEqual([...WRAPPERS].sort(), check.wrappers, fix);
});

test('scripts/render-slot.ts is the vault source, or the source its record says the last sync copied', {skip: !existsSync(path.join(vault, 'render-slot.ts')) && 'no vault here'}, (t) => {
  const verdict = checkCopy({root, vault});
  if (verdict.state === 'behind') {
    t.skip(verdict.message);
    return;
  }
  if (verdict.state === 'same' && verdict.note) t.diagnostic(verdict.note);
  assert.equal(verdict.state, 'same', verdict.state === 'same' ? '' : verdict.message);
});

const SOURCE = 'export const protocol = 3;\n';
const STALE = 'export const protocol = 2;\n';
const record = (text: string) => `${sha256(Buffer.from(text))}  render-slot.ts\n`;

/** A repo and a vault in a temp dir: the copy, its record (null: no file) and the source. */
const fixture = (t: {after: (fn: () => void) => void}, copy: string, recordText: string | null) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'render-slot-copy-test-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const repo = path.join(dir, 'repo');
  const vaultDir = path.join(dir, 'vault');
  mkdirSync(path.join(repo, 'scripts'), {recursive: true});
  mkdirSync(vaultDir);
  writeFileSync(path.join(repo, COPY_PATH), copy);
  if (recordText !== null) writeFileSync(path.join(repo, RECORD_PATH), recordText);
  writeFileSync(path.join(vaultDir, 'render-slot.ts'), SOURCE);
  return checkCopy({root: repo, vault: vaultDir});
};

test('a copy equal to the source passes, with its record or without one', (t) => {
  assert.deepEqual(fixture(t, SOURCE, record(SOURCE)), {state: 'same'});
  assert.deepEqual(fixture(t, SOURCE, null), {state: 'same'});
  assert.deepEqual(fixture(t, SOURCE, record(SOURCE).trimEnd()), {state: 'same'}, 'a record without its trailing newline');
});

test('a copy equal to the source with a stale or malformed record passes with a note naming --write', (t) => {
  for (const recordText of [record(STALE), 'not a record\n']) {
    const verdict = fixture(t, SOURCE, recordText);
    assert.equal(verdict.state, 'same');
    assert.ok(verdict.state === 'same' && verdict.note, `no note for ${JSON.stringify(recordText)}`);
    assert.ok(verdict.note.includes(RECORD_PATH) && verdict.note.includes('NOT COVERED'), verdict.note);
    assert.ok(verdict.note.endsWith(WRITE_COMMAND), verdict.note);
  }
});

test('a copy behind the source, matching its record, is NOT COVERED and names --write', (t) => {
  const verdict = fixture(t, STALE, record(STALE));
  assert.equal(verdict.state, 'behind');
  assert.ok(verdict.state === 'behind' && verdict.message.startsWith('NOT COVERED: '), JSON.stringify(verdict));
  assert.ok(verdict.message.includes(WRITE_COMMAND), verdict.message);
  assert.ok(verdict.message.includes(sha256(Buffer.from(STALE)).slice(0, 8)), verdict.message);
});

test('a copy that differs from the source fails: edited by hand, without a record, or with a malformed one', (t) => {
  const cases: [string, string, string | null, string][] = [
    ['by hand', `${STALE}// edited\n`, record(STALE), 'matches neither'],
    ['no record', STALE, null, 'is missing'],
    ['malformed record', STALE, `${sha256(Buffer.from(STALE))}  other.ts\n`, 'is not one'],
  ];
  for (const [label, copy, recordText, key] of cases) {
    const verdict = fixture(t, copy, recordText);
    assert.equal(verdict.state, 'differs', label);
    assert.ok(verdict.state === 'differs' && verdict.message.includes(key), `${label}: ${JSON.stringify(verdict)}`);
    assert.ok(verdict.message.includes(WRITE_COMMAND), `${label}: ${verdict.message}`);
    assert.ok(!verdict.message.startsWith('NOT COVERED'), `${label}: ${verdict.message}`);
  }
});

test('the --write command names this repo', () => {
  assert.equal(WRITE_COMMAND, 'python3 ~/obsidian/AI/scripts/render_slot_copias.py --write --repo background-creator');
});

test('parseRecord takes one `<sha256>  render-slot.ts` line and nothing else', () => {
  const sha = sha256(Buffer.from(SOURCE));
  assert.equal(parseRecord(`${sha}  render-slot.ts\n`), sha);
  assert.equal(parseRecord(`${sha}  render-slot.ts`), sha);
  for (const bad of [`${sha}  other.ts\n`, `${sha.slice(1)}  render-slot.ts\n`, `${sha.toUpperCase()}  render-slot.ts\n`, `${sha} render-slot.ts\n`, `${sha}  render-slot.ts\n${sha}  render-slot.ts\n`, '']) {
    assert.equal(parseRecord(bad), null, JSON.stringify(bad));
  }
});

test('the committed record is one well-formed line for render-slot.ts', () => {
  // Format only: the copy's sha would turn red after a sync by a vault script that does not write the record yet.
  const text = readFileSync(path.join(root, RECORD_PATH), 'utf8');
  assert.notEqual(parseRecord(text), null, `${RECORD_PATH}: ${JSON.stringify(text)}`);
  assert.ok(text.trimEnd().endsWith('  render-slot.ts'), text);
});
