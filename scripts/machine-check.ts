// The machine check every repo on this Mac shares: ~/obsidian/AI/scripts/maquina_livre.py, in the
// owner's vault. It looks at other renders, the render slot, the game, free memory, swap and disk,
// with the machine's limits in one place, and exits 0 when the machine is free and 3 when a render
// should wait, with the reasons in English under `reasons` of its --json. Where the vault is not
// (another machine), `machineVerdict` answers null and the caller falls back to its own check.
// MACHINE_CHECK overrides the script's path (the tests use a fake one).
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MACHINE_CHECK_ENV = 'MACHINE_CHECK';

export const machineCheckScript = () => process.env[MACHINE_CHECK_ENV] || path.join(os.homedir(), 'obsidian', 'AI', 'scripts', 'maquina_livre.py');

export type MachineVerdict = {free: boolean; reasons: string[]};

/** The check's --json answer, or null when `text` is not one. A busy answer always carries a reason. */
export const parseVerdict = (text: string): MachineVerdict | null => {
  let answer: {livre?: unknown; reasons?: unknown};
  try {
    answer = JSON.parse(text) as typeof answer;
  } catch {
    return null;
  }
  if (typeof answer.livre !== 'boolean' || !Array.isArray(answer.reasons)) return null;
  const reasons = answer.reasons.filter((reason): reason is string => typeof reason === 'string');
  if (answer.livre) return {free: true, reasons: []};
  return {free: false, reasons: reasons.length > 0 ? reasons : ['the machine check says to wait, without a reason']};
};

/**
 * The machine check's verdict, with `familyPid` and everything it started counted as this run's own
 * work, never as another render. Null when the check is not on this machine or gave no answer.
 */
export const machineVerdict = (familyPid = process.pid, script = machineCheckScript()): MachineVerdict | null => {
  if (!existsSync(script)) return null;
  let output: string;
  try {
    output = execFileSync('python3', [script, '--json', '--familia', String(familyPid)], {encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'ignore']});
  } catch (error) {
    // Exit 3 is the busy answer, with the JSON on stdout.
    output = String((error as {stdout?: unknown}).stdout ?? '');
  }
  return parseVerdict(output);
};
