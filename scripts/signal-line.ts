// The signal line of a script that holds the render slot (BGC-38): `render:pack` writes on stderr the
// line ship:pack logs (signalReport, BGC-29) when a SIGTERM, SIGINT or SIGHUP comes from outside, then
// leaves the exit to the handlers registered after it (the slot's, the queue's, guardScratch's). Apart
// from the script, so a test imports it without running a pack, with the process injectable.
import {spawnSync} from 'node:child_process';
import {writeSync} from 'node:fs';
import os from 'node:os';
import {parsePs, signalReport} from './ship-plan';

export const WATCHED_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const;
type WatchedSignal = typeof WATCHED_SIGNALS[number];

/** What the watcher uses of the process, like guardScratch's ExitTarget: the tests pass an EventEmitter. */
export type SignalTarget = {
  readonly pid: number;
  readonly ppid: number;
  once(event: WatchedSignal, listener: (signal: NodeJS.Signals) => void): unknown;
  listenerCount(event: WatchedSignal): number;
  exit(code: number): void;
};

const stamp = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const commandOf = (pid: number) => spawnSync('ps', ['-o', 'command=', '-p', String(pid)], {encoding: 'utf8'}).stdout?.trim() || '?';

const readPs = () => spawnSync('ps', ['-axo', 'pid=,ppid=,pgid=,command='], {encoding: 'utf8'}).stdout ?? '';

/**
 * Registers, with `once`, the line of an outside signal. Register it first: it exits (128 + the signal)
 * only when no other listener is left, so the slot's and the queue's still run after it, and a SIGHUP,
 * which none of them takes, ends through the 'exit' handlers that release the slot. Written with
 * writeSync: on macOS, console.error to a pipe is asynchronous, and the exit that follows would drop it.
 * Synchronous ps: the sender's shell may end a moment later.
 */
export const watchSignalLine = ({
  target = process,
  startParent = {pid: target.ppid, command: commandOf(target.ppid)},
  write = (line: string) => { writeSync(2, line); },
  ps = readPs,
  now = () => new Date(),
}: {
  target?: SignalTarget;
  startParent?: {pid: number; command: string};
  write?: (line: string) => void;
  ps?: () => string;
  now?: () => Date;
} = {}) => {
  const onSignal = (signal: NodeJS.Signals) => {
    write(`${signalReport({signal, pid: target.pid, ppid: target.ppid, startParent, rows: parsePs(ps()), at: stamp(now())})}\n`);
    // Without another handler, Node would keep running once this one returns.
    if (target.listenerCount(signal as WatchedSignal) === 0) target.exit(128 + os.constants.signals[signal]);
  };
  for (const signal of WATCHED_SIGNALS) target.once(signal, onSignal);
};
