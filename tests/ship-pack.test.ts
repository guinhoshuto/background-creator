import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  MACHINE_WAIT_MS, parseLsjson, publicUrlOf, shipPacks, uploadArgs, type RemoteFile, type ShipEffects, type ShipState,
} from '../scripts/ship-plan';

// The whole chain against a fake npm, a fake machine check and a fake R2 kept in memory; no render, no upload.

const root = fileURLToPath(new URL('../', import.meta.url));
const SHA = 'abcdef0123456789'.repeat(4);
const OTHER_SHA = '99999999'.repeat(8);

type World = {
  calls: string[];
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
  const w: World = {calls: [], logs: [], local: new Map(), remote: new Map(), state: {...state}, sleeps: [], effects: undefined as unknown as ShipEffects};
  const verdicts = [...busy];
  w.effects = {
    npm: async (script, args) => {
      w.calls.push(`npm ${script} ${args.join(' ')}`);
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
