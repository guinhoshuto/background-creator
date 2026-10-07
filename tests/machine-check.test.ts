import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {MACHINE_CHECK_ENV, machineCheckScript, machineVerdict, parseVerdict} from '../scripts/machine-check';
import {busyOutsideSlot, busyProcesses} from '../scripts/render-turn';

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

test('scripts/render-slot.ts is the vault source, byte for byte', {skip: !existsSync(path.join(vault, 'render-slot.ts')) && 'no vault here'}, () => {
  const copy = readFileSync(path.join(root, 'scripts', 'render-slot.ts'));
  const source = readFileSync(path.join(vault, 'render-slot.ts'));
  assert.ok(copy.equals(source), 'scripts/render-slot.ts differs from ~/obsidian/AI/scripts/render-slot.ts: edit the source, then run python3 ~/obsidian/AI/scripts/render_slot_copias.py --write');
});
