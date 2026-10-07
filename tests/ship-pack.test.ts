import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {packCounter} from '../scripts/pack-plan';
import {
  MACHINE_WAIT_MS, parseLsjson, parsePs, publicUrlOf, shipPacks, signalReport, signalSuspects, uploadArgs, watchEntryOf,
  type RemoteFile, type ShipEffects, type ShipState,
} from '../scripts/ship-plan';

// The whole chain against a fake npm, a fake machine check and a fake R2 kept in memory; no render, no upload.

const root = fileURLToPath(new URL('../', import.meta.url));
const SHA = 'abcdef0123456789'.repeat(4);
const OTHER_SHA = '99999999'.repeat(8);

type World = {
  calls: string[];
  /** Step logs and watch-band updates, in order: `log <name>` and `watch <pack>`. */
  trail: string[];
  logs: string[];
  local: Map<string, {bytes: number; sha256: string}>;
  remote: Map<string, RemoteFile[]>;
  state: ShipState;
  sleeps: number[];
  effects: ShipEffects;
};

/** A fake world. `npmCodes` fails a step by name; `uploadBytes` makes R2 keep another size; `busy` checks say wait first. */
const world = ({npmCodes = {}, uploadBytes, busy = [], state = {}}: {
  npmCodes?: Record<string, number>; uploadBytes?: number; busy?: string[][]; state?: ShipState;
} = {}): World => {
  const w: World = {calls: [], trail: [], logs: [], local: new Map(), remote: new Map(), state: {...state}, sleeps: [], effects: undefined as unknown as ShipEffects};
  const verdicts = [...busy];
  w.effects = {
    npm: async (script, args, logName) => {
      w.calls.push(`npm ${script} ${args.join(' ')}`);
      w.trail.push(`log ${logName}`);
      const code = npmCodes[script] ?? 0;
      // The real zip:pack writes the zip; the fake one only when it succeeds.
      if (script === 'zip:pack' && code === 0) w.local.set(`out/deliveries/${args[0]}-overlay-pack.zip`, {bytes: 1000, sha256: SHA});
      if (script === 'render:pack' && code === 0) w.local.set(`out/packs/${args[0]}`, {bytes: 0, sha256: ''});
      return code;
    },
    machine: () => {
      const reasons = verdicts.shift();
      return reasons ? {free: false, reasons} : {free: true, reasons: []};
    },
    sleep: async (ms) => {w.sleeps.push(ms);},
    localSize: async (relative) => w.local.get(relative)?.bytes ?? null,
    sha256: async (relative) => {
      const file = w.local.get(relative);
      assert(file, `sha256 of a missing file: ${relative}`);
      return file.sha256;
    },
    remoteList: async (directory) => [...(w.remote.get(directory) ?? [])],
    upload: async (relative, key) => {
      w.calls.push(`upload ${relative} ${key}`);
      const directory = key.slice(0, key.lastIndexOf('/'));
      const name = key.slice(key.lastIndexOf('/') + 1);
      w.remote.set(directory, [...(w.remote.get(directory) ?? []), {name, size: uploadBytes ?? w.local.get(relative)!.bytes}]);
    },
    removeLocal: async (relative) => {w.calls.push(`rm ${relative}`); w.local.delete(relative);},
    readState: async () => ({...w.state}),
    writeState: async (next) => {w.state = next;},
    now: () => new Date('2026-10-04T12:00:00Z'),
    log: (message) => {w.logs.push(message);},
    rendering: async (pack) => {w.trail.push(`watch ${pack}`);},
  };
  return w;
};

const options = {remote: 'cf-r2:etsy', deleteLocal: false};
const KEY = 'cf-r2:etsy/packs/kit/abcdef01/kit-overlay-pack.zip';

test('a pack goes through render, validate, zip, upload under its sha8, and is recorded', async () => {
  const w = world();
  const {code, shipped} = await shipPacks(['kit'], options, w.effects);
  assert.equal(code, 0);
  assert.deepEqual(w.calls, ['npm render:pack kit', 'npm validate:pack kit', 'npm zip:pack kit', `upload out/deliveries/kit-overlay-pack.zip ${KEY}`]);
  assert.equal(shipped[0]!.url, 'https://cacare.co/packs/kit/abcdef01/kit-overlay-pack.zip');
  assert.deepEqual(w.state.kit, {sha256: SHA, key: KEY, url: shipped[0]!.url, bytes: 1000, shippedAt: '2026-10-04T12:00:00.000Z'});
  // Without --delete-local nothing local goes.
  assert(w.local.has('out/deliveries/kit-overlay-pack.zip') && w.local.has('out/packs/kit'));
});

test('--delete-local removes the zip and the pack folder only after the upload is checked', async () => {
  const w = world();
  assert.equal((await shipPacks(['kit'], {...options, deleteLocal: true}, w.effects)).code, 0);
  assert.deepEqual(w.calls.slice(-2), ['rm out/deliveries/kit-overlay-pack.zip', 'rm out/packs/kit']);
  assert(!w.local.has('out/deliveries/kit-overlay-pack.zip') && !w.local.has('out/packs/kit'));
});

test('a size on R2 that differs from the local zip stops the chain and keeps every local file', async () => {
  const w = world({uploadBytes: 999});
  const {code} = await shipPacks(['kit', 'next'], {...options, deleteLocal: true}, w.effects);
  assert.equal(code, 1);
  assert(!w.calls.some((call) => call.startsWith('rm ')));
  assert(w.local.has('out/deliveries/kit-overlay-pack.zip'));
  assert.equal(w.state.kit, undefined);
  assert(w.logs.some((line) => /FAILED kit: .*999 B on R2 and 1000 B here/.test(line)));
  assert(w.logs.includes('not started: next'));
  assert(!w.calls.some((call) => call.includes(' next')));
});

test('a failed step stops before the next one and before the next pack', async () => {
  const w = world({npmCodes: {'validate:pack': 1}});
  const {code} = await shipPacks(['kit', 'next'], options, w.effects);
  assert.equal(code, 1);
  assert.deepEqual(w.calls, ['npm render:pack kit', 'npm validate:pack kit']);
  assert(w.logs.some((line) => /FAILED kit: validate:pack kit failed \(exit 1\); see \.cache\/ship-pack\/kit-validate-pack\.log/.test(line)));
});

test('a remote folder that already holds something else is never written to', async () => {
  const w = world();
  w.remote.set('cf-r2:etsy/packs/kit/abcdef01', [{name: 'other.zip', size: 5}]);
  assert.equal((await shipPacks(['kit'], options, w.effects)).code, 1);
  assert(!w.calls.some((call) => call.startsWith('upload')));
  assert(w.logs.some((line) => /already holds other\.zip \(5 B\); nothing was uploaded/.test(line)));
});

test('resume: the same bytes already on R2 are not uploaded again', async () => {
  const w = world();
  w.remote.set('cf-r2:etsy/packs/kit/abcdef01', [{name: 'kit-overlay-pack.zip', size: 1000}]);
  assert.equal((await shipPacks(['kit'], options, w.effects)).code, 0);
  assert(!w.calls.some((call) => call.startsWith('upload')));
  assert.equal(w.state.kit?.key, KEY);
});

test('resume: the same name with another size on R2 is refused, not taken as shipped', async () => {
  const w = world();
  w.remote.set('cf-r2:etsy/packs/kit/abcdef01', [{name: 'kit-overlay-pack.zip', size: 400}]);
  assert.equal((await shipPacks(['kit'], {...options, deleteLocal: true}, w.effects)).code, 1);
  assert(!w.calls.some((call) => call.startsWith('upload') || call.startsWith('rm ')));
  assert.equal(w.state.kit, undefined);
});

test('resume: a local zip this run already shipped skips the build and only checks R2 and cleans up', async () => {
  const w = world({state: {kit: {sha256: SHA, key: KEY, url: publicUrlOf('kit', SHA), bytes: 1000, shippedAt: 'x'}}});
  w.local.set('out/deliveries/kit-overlay-pack.zip', {bytes: 1000, sha256: SHA});
  w.remote.set('cf-r2:etsy/packs/kit/abcdef01', [{name: 'kit-overlay-pack.zip', size: 1000}]);
  assert.equal((await shipPacks(['kit'], {...options, deleteLocal: true}, w.effects)).code, 0);
  assert(!w.calls.some((call) => call.startsWith('npm') || call.startsWith('upload')));
  assert(w.calls.includes('rm out/deliveries/kit-overlay-pack.zip'));
});

test('a changed pack is built again even when an older zip was shipped', async () => {
  const w = world({state: {kit: {sha256: OTHER_SHA, key: 'old', url: 'old', bytes: 1, shippedAt: 'x'}}});
  w.local.set('out/deliveries/kit-overlay-pack.zip', {bytes: 1000, sha256: SHA});
  assert.equal((await shipPacks(['kit'], options, w.effects)).code, 0);
  assert(w.calls.includes('npm render:pack kit'));
  assert.equal(w.state.kit?.sha256, SHA);
});

test('a pack shipped before with nothing local left is skipped', async () => {
  const w = world({state: {kit: {sha256: SHA, key: KEY, url: publicUrlOf('kit', SHA), bytes: 1000, shippedAt: 'x'}}});
  assert.equal((await shipPacks(['kit'], options, w.effects)).code, 0);
  assert.deepEqual(w.calls, []);
  assert(w.logs.some((line) => /already shipped .* skipped/.test(line)));
});

test('a busy machine waits, logging each new reason once', async () => {
  const w = world({busy: [['game open'], ['game open'], ['low disk']]});
  assert.equal((await shipPacks(['kit'], options, w.effects)).code, 0);
  assert.deepEqual(w.sleeps, [MACHINE_WAIT_MS, MACHINE_WAIT_MS, MACHINE_WAIT_MS]);
  assert.deepEqual(w.logs.filter((line) => line.startsWith('waiting')), ['waiting before kit: game open', 'waiting before kit: low disk']);
  assert.equal(w.calls[0], 'npm render:pack kit');
});

test('rclone: copyto with the bucket check off, and lsjson read without folders', () => {
  assert.deepEqual(uploadArgs('/a/kit.zip', 'cf-r2:etsy/packs/kit/abcdef01/kit.zip'), ['copyto', '--s3-no-check-bucket', '/a/kit.zip', 'cf-r2:etsy/packs/kit/abcdef01/kit.zip']);
  const answer = '[\n{"Path":"kit.zip","Name":"kit.zip","Size":1080722880,"MimeType":"application/zip","IsDir":false},\n{"Path":"5965039d","Name":"5965039d","Size":-1,"IsDir":true}\n]';
  assert.deepEqual(parseLsjson(answer), [{name: 'kit.zip', size: 1080722880}]);
});

test('the command refuses before any step: --help lists the options, files and unknown packs are refused', () => {
  const cli = (...args: string[]) => spawnSync('npx', ['tsx', 'scripts/ship-pack.ts', ...args], {cwd: root, encoding: 'utf8'});
  const help = cli('--help');
  assert.equal(help.status, 0);
  for (const option of ['--delete-local', '--remote', '--dry-run']) assert.match(help.stdout, new RegExp(`^  ${option}\\b`, 'm'));
  assert.match(cli('packs/x.json').stderr, /not files/);
  assert.match(cli('no-such-pack').stderr, /Unknown pack: no-such-pack/);
  assert.match(cli().stderr, /Name at least one pack/);
});

/** The watch band's choice of file (hooks/rows.ts in ~/.claude/skills/watch-band): name and newest. */
const bandReads = (entry: ReturnType<typeof watchEntryOf>, names: string[]) =>
  names.filter((name) => name.startsWith(entry.progress.prefix) && name.endsWith(entry.progress.suffix));

test('the watch band follows the render log of the pack being rendered, and finds its [n/m]', async () => {
  const w = world();
  assert.equal((await shipPacks(['kit', 'next'], options, w.effects)).code, 0);
  const paths = {pid: 7, logDirectory: '/r/.cache/ship-pack', progressLog: '/r/.cache/ship-pack/progress.log'};
  // Each pack points the band at its own render log before render:pack writes to it.
  for (const pack of ['kit', 'next']) {
    const at = w.trail.indexOf(`watch ${pack}`);
    assert(at >= 0 && w.trail[at + 1] === `log ${pack}-render-pack.log`, `watch ${pack} right before its render: ${w.trail.join(', ')}`);
  }
  const logs = w.trail.filter((item) => item.startsWith('log ')).map((item) => item.slice(4));
  const entry = watchEntryOf(['kit', 'next'], 'next', paths);
  assert.deepEqual(bandReads(entry, [...logs, 'progress.log', 'rclone.log']), ['next-render-pack.log']);
  assert.equal(entry.progress.dir, paths.logDirectory);
  // The band strips prefix and suffix from the name: together they are the whole render log name.
  assert.equal(entry.progress.prefix + entry.progress.suffix, 'next-render-pack.log');
  assert.deepEqual({id: entry.id, label: entry.label, pid: entry.pid, cmd: entry.cmd, log: entry.log},
    {id: 'ship-pack-kit-next', label: 'ship:pack next (2/2 packs)', pid: 7, cmd: 'ship-pack.ts', log: paths.progressLog});
  assert.equal(watchEntryOf(['kit'], 'kit', paths).label, 'ship:pack kit');
  // The band keeps the last match of the pattern in the log render:pack writes.
  const renderLog = `${packCounter(5, 113)} out/packs/next/a.webm\n  Render: 90%\n${packCounter(6, 113)} out/packs/next/b.webm\n`;
  const found = [...renderLog.matchAll(new RegExp(entry.progress.pattern, 'g'))].map((match) => `${match[1]}/${match[2]}`);
  assert.deepEqual(found, ['6/113', '7/113']);
});

const PS = [
  '    1     0     1 /sbin/launchd',
  '  500   400   500 -zsh',
  '  610   500   610 node /x/node_modules/.bin/tsx scripts/ship-pack.ts kit',
  '  611   610   610 npm run -s render:pack -- kit',
  '  612   610   610 /bin/kill -0 611',
  `  720   700   720 /bin/zsh -c source /tmp/snap && setopt ${'X'.repeat(80)} && eval 'pkill -f tsx; sleep 1'`,
  '  721   700   721 /bin/zsh -c eval \'npm run killall-tests\'',
  '  730   700   730 /usr/bin/killall node',
  '',
].join('\n');

test('ps rows: the kill, pkill or killall running then are the suspects, never children of the run or a name that only contains kill', () => {
  const rows = parsePs(PS);
  assert.equal(rows.length, 8);
  assert.deepEqual(rows[2], {pid: 610, ppid: 500, pgid: 610, command: 'node /x/node_modules/.bin/tsx scripts/ship-pack.ts kit'});
  assert.deepEqual(signalSuspects(rows, 610).map((row) => row.pid), [720, 730]);
});

test('a signal line names the signal, the time, the parent then and at the start, the group and the suspects', () => {
  const rows = parsePs(PS);
  const line = signalReport({signal: 'SIGTERM', pid: 610, ppid: 500, startParent: {pid: 500, command: '-zsh'}, rows, at: '2026-10-06 19:37:48'});
  assert.match(line, /^received SIGTERM at 2026-10-06 19:37:48: pid 610, ppid 500 \(`-zsh`\), pgid 610; possible senders: 720 `…X+ && eval 'pkill -f tsx; sleep 1'` \(ppid 700\); 730 `\/usr\/bin\/killall node` \(ppid 700\)$/);
  // The parent died first (the shell that started the run): ppid is launchd now, and the line says so.
  const orphan = signalReport({signal: 'SIGHUP', pid: 610, ppid: 1, startParent: {pid: 500, command: '-zsh'}, rows: rows.filter((row) => row.pid < 612), at: 't'});
  assert.match(orphan, /ppid 1, was 500 `-zsh` at the start \(that parent is gone\), pgid 610; no kill, pkill or killall was running/);
});

test('kill -TERM from outside: the run logs the signal with the sender and ends with 143', async () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'ship-signal-'));
  try {
    // A fake npm that only waits: no step renders, whatever stage the signal finds the run in.
    const bin = path.join(scratch, 'bin');
    spawnSync('mkdir', [bin]);
    writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nexec sleep 30\n');
    chmodSync(path.join(bin, 'npm'), 0o755);
    const logDir = path.join(scratch, 'logs');
    const pack = 'halloween-cobweb';
    const child = spawn(path.join(root, 'node_modules', '.bin', 'tsx'), ['scripts/ship-pack.ts', pack], {
      cwd: root, env: {...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: scratch, SHIP_PACK_LOG_DIR: logDir}, stdio: 'ignore',
    });
    const progress = path.join(logDir, 'progress.log');
    for (let i = 0; i < 300 && !(existsSync(progress) && readFileSync(progress, 'utf8').includes('start ship:pack')); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // The sender: a shell that stays on its line a moment, like another session's Bash running pkill then more.
    const sender = spawn('/bin/sh', ['-c', `kill -TERM ${child.pid}; sleep 2`]);
    const code = await new Promise<number | null>((resolve) => child.on('exit', (exit) => resolve(exit)));
    sender.kill();
    assert.equal(code, 143);
    // The step it was running got the signal too: no orphan keeps rendering (here, the fake npm's sleep).
    const orphans = spawnSync('pgrep', ['-f', `^sleep 30$`], {encoding: 'utf8'}).stdout.trim().split('\n').filter(Boolean)
      .filter((pid) => spawnSync('ps', ['-o', 'ppid=', '-p', pid], {encoding: 'utf8'}).stdout.trim() === '1');
    assert.deepEqual(orphans, []);
    const log = readFileSync(progress, 'utf8');
    // tsx relays the signal to the node process it runs: that one logs it, the tsx wrapper as its parent.
    assert.match(log, new RegExp(`received SIGTERM at \\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d: pid \\d+, ppid ${child.pid} .*possible senders: .*\\b${sender.pid} \`/bin/sh -c kill -TERM ${child.pid}; sleep 2\``));
    assert.match(log, /ps snapshot .*signal-.*\.ps\.txt/);
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
});
