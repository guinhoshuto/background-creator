import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, symlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {busyProcesses, otherRenders, parseProcessList} from '../scripts/render-turn';

const root = fileURLToPath(new URL('../', import.meta.url));

const SELF = 4000;

/** A fake `ps -Ao pid=,ppid=,command=` listing, padded the way ps pads it. */
const ps = (rows: Array<[number, number, string]>) => rows.map(([pid, ppid, command]) => `${String(pid).padStart(5)} ${String(ppid).padStart(5)} ${command}`).join('\n') + '\n';

// This run: the agent's shell chains the machine check before stills, under /usr/bin/time (which
// stays the parent of what it runs) and caffeinate (which runs it in its own pid, watching from a
// child); stills then starts a headless Chrome and its helper.
const CHECK = 'pgrep -fl \'Chrome.*--headless|remotion render|dist/cli/index.js\' && npm run stills -- job.json';
const OWN: Array<[number, number, string]> = [
  [1, 0, '/sbin/launchd'],
  [3000, 1, '/Users/me/.local/bin/claude'],
  [3100, 3000, `/usr/bin/time -l caffeinate -i zsh -c ${CHECK}`],
  [3200, 3100, `zsh -c ${CHECK}`],
  [3250, 3200, `caffeinate -i zsh -c ${CHECK}`],
  [3300, 3200, 'npm run stills -- job.json'],
  [3400, 3300, 'node /repo/node_modules/tsx/dist/cli.mjs scripts/stills.ts job.json'],
  [SELF, 3400, 'node --require /repo/node_modules/tsx/dist/preflight.cjs scripts/stills.ts job.json'],
  [4100, SELF, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --remote-debugging-pipe'],
  [4200, 4100, '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer) --type=renderer --headless'],
];

// Another session: its shell mentions the render, its child is the render, and a Chrome it drives.
const OTHER: Array<[number, number, string]> = [
  [5000, 1, '/bin/zsh -c cd ~/dev/thumbs && npx remotion render Thumb out/thumb.mp4'],
  [5100, 5000, 'node /Users/me/dev/thumbs/node_modules/.bin/remotion render Thumb out/thumb.mp4'],
  [5200, 1, '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --headless=new --remote-debugging-pipe'],
];

test('this run\'s own tree is never busy: time, shell and npm above it, caffeinate beside it, its Chrome below it', () => {
  assert.deepEqual(otherRenders(parseProcessList(ps(OWN)), SELF), []);
});

test('an ancestor that is not a shell but whose command line carries the pattern is not busy', () => {
  // time is no wrapper: only the ancestor walk keeps it out.
  const list = parseProcessList(ps(OWN));
  assert.deepEqual(otherRenders(list, SELF).filter((line) => line.startsWith('3100 ')), []);
  // Seen from an unrelated pid, the same process is a render.
  assert.equal(otherRenders(list, 9999).filter((line) => line.startsWith('3100 ')).length, 1);
});

test('a headless Chrome this run started, and its helper, are not busy; the same Chrome from another run is', () => {
  const list = parseProcessList(ps(OWN));
  assert.deepEqual(otherRenders(list, SELF), []);
  assert.deepEqual(otherRenders(list, 3000 + 7).map((line) => line.split(' ')[0]), ['3100', '4100', '4200']);
});

test('another session: its shell is not busy, its remotion render and its headless Chrome are', () => {
  assert.deepEqual(otherRenders(parseProcessList(ps([...OWN, ...OTHER])), SELF), [
    '5100 node /Users/me/dev/thumbs/node_modules/.bin/remotion render Thumb out/thumb.mp4',
    '5200 /Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --headless=new --remote-debugging-pipe',
  ]);
});

test('with the slot owner\'s pid, its tree is left out (waited for in the queue), a render outside it is not', () => {
  // A pack chain holds the slot: its node process, the Chrome it renders with and that Chrome's helper.
  // Above it, a time wrapper whose command line carries the pattern; beside it, a waiter's Chrome.
  const CHAIN: Array<[number, number, string]> = [
    [8000, 1, '/usr/bin/time node node_modules/.bin/remotion render chain-parent'],
    [8100, 8000, 'node /repo/node_modules/tsx/dist/cli.mjs scripts/pack.ts halloween'],
    [8200, 8100, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --remote-debugging-pipe'],
    [8300, 8200, '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer) --type=renderer --headless'],
  ];
  const list = parseProcessList(ps([...OWN, ...OTHER, ...CHAIN]));
  const pids = (lines: string[]) => lines.map((line) => line.split(' ')[0]);
  assert.deepEqual(pids(otherRenders(list, SELF, 8100)), ['5100', '5200', '8000']);
  assert.deepEqual(pids(otherRenders(list, SELF)), ['5100', '5200', '8000', '8200', '8300']);
  // An owner pid that no longer runs leaves everything counted.
  assert.deepEqual(pids(otherRenders(list, SELF, 9999)), ['5100', '5200', '8000', '8200', '8300']);
});

test('shells and searches that only mention the pattern are wrappers, whatever the path or a login dash', () => {
  const wrappers: Array<[number, number, string]> = [
    [6000, 1, '/usr/bin/pgrep -fl Chrome.*--headless|remotion render|dist/cli/index.js'],
    [6100, 1, 'pkill -f npx remotion render'],
    [6200, 1, 'grep -E Chrome.*--headless log.txt'],
    [6300, 1, 'egrep npx remotion render notes.md'],
    [6400, 1, '/opt/homebrew/bin/rg dist/cli/index.js render'],
    [6500, 1, '-zsh -c until ! pgrep -f \'Chrome.*--headless\'; do sleep 10; done'],
    [6600, 1, '/bin/bash -c sleep 1; npx remotion render A'],
    [6700, 1, 'sh -c npx remotion render A'],
    [6750, 6700, 'caffeinate -i sh -c npx remotion render A'],
    [6760, 1, '/opt/homebrew/bin/ugrep -rn npx remotion still src'],
  ];
  assert.deepEqual(otherRenders(parseProcessList(ps(wrappers)), SELF), []);
  // Each line names a render: run by a program that is no wrapper, every one would be busy.
  const asProgram = wrappers.map(([pid, ppid, command]): [number, number, string] => [pid, ppid, `/usr/local/bin/tool ${command}`]);
  assert.equal(otherRenders(parseProcessList(ps(asProgram)), SELF).length, wrappers.length);
  // A program whose name only starts like a shell is no wrapper.
  assert.deepEqual(otherRenders(parseProcessList(ps([[6800, 1, '/usr/local/bin/zshrender npx remotion render A']])), SELF), ['6800 /usr/local/bin/zshrender npx remotion render A']);
});

/** Each command as another session's process (ppid 1), and the lines otherRenders gives for them. */
const busyAmong = (commands: string[]) => otherRenders(parseProcessList(ps(commands.map((command, index): [number, number, string] => [9000 + index, 1, command]))), SELF);
const lines = (commands: string[], first: number) => commands.map((command, index) => `${first + index} ${command}`);

test('Remotion counts while it renders: the CLI\'s render, still and benchmark, its compositor and its own Chrome', () => {
  const busy = [
    'node /Users/me/dev/thumbs/node_modules/.bin/remotion still Thumb out/thumb.png',
    'npm exec remotion benchmark',
    'node /Users/me/dev/thumbs/node_modules/@remotion/cli/remotion-cli.js render Thumb out/thumb.mp4',
    '/Users/me/dev/thumbs/node_modules/@remotion/compositor-darwin-arm64/remotion {"type":"StartLongRunningProcess","params":{"concurrency":4}}',
    // Remotion's Chrome: no capital C in its path, and --headless=old.
    '/Users/me/dev/thumbs/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell --headless=old --no-sandbox',
  ];
  const idle = [
    'node /Users/me/dev/thumbs/node_modules/.bin/remotion studio',
    'npx remotion bundle',
    'npx remotion compositions src/index.ts',
    // The wrapper that only carries the word (HAR-32, 2026-10-06), a log and a still that is a file name.
    'node .cache/remotion-mock/slot-run.mts',
    'less /Users/me/notes/remotion render.md',
    'node scripts/stills.ts .cache/remotion still.json',
  ];
  assert.deepEqual(busyAmong([...busy, ...idle]), lines(busy, 9000));
});

test('Blender counts in the background (-b, --background), never from its window', () => {
  const busy = [
    '/Volumes/Sandisk/Applications/Blender.app/Contents/MacOS/Blender -b scene.blend -o //frames/ -a',
    '/Volumes/Sandisk/Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b scene.blend -f 1',
    'blender --background --python render.py',
  ];
  const idle = [
    '/Volumes/Sandisk/Applications/Blender.app/Contents/MacOS/Blender',
    '/Volumes/Sandisk/Applications/Blender.app/Contents/MacOS/Blender scene.blend',
    // Only names Blender: the work is the Blender process it starts.
    'python3 /Users/me/tools/launch.py /Volumes/Sandisk/Applications/Blender.app/Contents/MacOS/Blender -b scene.blend',
  ];
  assert.deepEqual(busyAmong([...busy, ...idle]), lines(busy, 9000));
});

test('ffmpeg counts when it encodes video or writes many frames, not for one frame nor ffprobe', () => {
  const busy = [
    '/opt/homebrew/bin/ffmpeg -y -i in.mov -c:v libx264 -crf 18 out.mp4',
    'ffmpeg -i in.mov -c:v prores_ks -profile:v 4444 out.mov',
    'ffmpeg -i in.webm -c:v libvpx-vp9 out.webm',
    'ffmpeg -i in.mp4 -c:v hevc_videotoolbox out.mp4',
    'ffmpeg -i in.webm frames/%06d.png',
    'ffmpeg -i in.mp4 -r 1 -f image2 thumbs/t.png',
  ];
  const idle = [
    '/opt/homebrew/bin/ffmpeg -ss 3 -i in.mp4 -frames:v 1 -f image2 frame.png',
    'ffmpeg -i in.mp4 -vframes 1 -f image2 thumb.png',
    '/opt/homebrew/bin/ffprobe -v error -show_streams out.mp4',
    '/usr/local/bin/myffmpeg -c:v libx264 out.mp4',
  ];
  assert.deepEqual(busyAmong([...busy, ...idle]), lines(busy, 9000));
});

test('a Chrome driven over a pipe counts, headless or not, and SE Widget Studio\'s CLI when it renders', () => {
  const busy = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-pipe --user-data-dir=/tmp/se-capture',
    'node /Users/me/dev/firulas/se-dev-kit/dist/cli/index.js render widget.json',
    'node /Users/me/dev/firulas/se-dev-kit/dist/cli/index.js record widget.json',
    'node /Users/me/dev/firulas/se-dev-kit/dist/cli/index.js capture widget.json',
  ];
  const idle = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'node /Users/me/dev/firulas/se-dev-kit/dist/cli/index.js serve',
  ];
  assert.deepEqual(busyAmong([...busy, ...idle]), lines(busy, 9000));
});

test('without the machine check, a Blender rendering in the background shows up in the real process list', async (t) => {
  // Two stand-ins named Blender (links to node, which ps lists by the name it ran as): one with -b, one
  // as from its window. Started through a shell that exits at once, so they are no child of this run.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'busy-processes-test-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const blender = path.join(dir, 'Blender');
  symlinkSync(process.execPath, blender);
  const marker = `har32-blender-${process.pid}`;
  const start = (...args: string[]) => Number(execFileSync('/bin/sh', ['-c', '"$0" -e "setTimeout(() => {}, 30000)" -- "$@" > /dev/null 2>&1 & echo $!', blender, ...args], {encoding: 'utf8'}).trim());
  const background = start(`${marker}-scene.blend`, '-b');
  t.after(() => { try { process.kill(background, 'SIGKILL'); } catch { /* already gone */ } });
  const window = start(`${marker}-window.blend`);
  t.after(() => { try { process.kill(window, 'SIGKILL'); } catch { /* already gone */ } });
  assert.ok(background > 1 && window > 1, `pids ${background} and ${window}`);
  const listed = () => execFileSync('ps', ['-Aww', '-o', 'pid=,command='], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  for (const started = Date.now(); ; await new Promise((resolve) => setTimeout(resolve, 50))) {
    const text = listed();
    if (text.includes(`${marker}-scene.blend`) && text.includes(`${marker}-window.blend`)) break;
    assert.ok(Date.now() - started < 10_000, 'the stand-ins never showed up in ps');
  }
  const busy = busyProcesses(() => null).filter((line) => line.includes(marker));
  assert.deepEqual(busy, [`${background} ${blender} -e setTimeout(() => {}, 30000) -- ${marker}-scene.blend -b`]);
});

test('a render beside this run is busy: another session under the same agent, a sibling under this run\'s shell or parent', () => {
  // Only the ancestors themselves and what this run started are its family, not every tree they hold.
  const list = parseProcessList(ps([
    ...OWN,
    [3500, 3000, 'zsh -c npx remotion render X out/x.mp4'],
    [3600, 3500, 'node /Users/me/dev/thumbs/node_modules/.bin/remotion render X out/x.mp4'],
    [3450, 3200, 'node /Users/me/dev/thumbs/node_modules/.bin/remotion render Y out/y.mp4'],
    [3420, 3400, 'node /Users/me/dev/thumbs/node_modules/.bin/remotion render Z out/z.mp4'],
  ]));
  assert.deepEqual(otherRenders(list, SELF), [
    '3600 node /Users/me/dev/thumbs/node_modules/.bin/remotion render X out/x.mp4',
    '3450 node /Users/me/dev/thumbs/node_modules/.bin/remotion render Y out/y.mp4',
    '3420 node /Users/me/dev/thumbs/node_modules/.bin/remotion render Z out/z.mp4',
  ]);
});

test('a ppid cycle, above or below this run, ends and keeps the rest right', () => {
  // The walks are synchronous: a missing cycle guard would spin forever, out of reach of a test
  // timeout. So the case runs in a child process that is killed after 10 s, and a hang fails.
  const cycle = `
    import {otherRenders, parseProcessList} from './scripts/render-turn.ts';
    const list = parseProcessList(${JSON.stringify(ps([
    [7000, 7100, 'node node_modules/.bin/remotion render cycle-above-a'],
    [7100, 7000, 'node node_modules/.bin/remotion render cycle-above-b'],
    [SELF, 7000, 'node scripts/stills.ts'],
    [7200, SELF, 'node node_modules/.bin/remotion render child'],
    [7300, 7200, 'node node_modules/.bin/remotion render grandchild'],
    [7200, 7300, 'node node_modules/.bin/remotion render duplicate row closing a loop'],
    [7400, 7400, 'node node_modules/.bin/remotion render its own parent'],
  ]))});
    console.log(JSON.stringify(otherRenders(list, ${SELF})));
  `;
  const run = spawnSync(process.execPath, ['--max-old-space-size=256', '--import', 'tsx', '--input-type=module', '-e', cycle], {cwd: root, encoding: 'utf8', timeout: 10_000});
  assert.equal(run.error, undefined, 'the cycle walk did not end within 10 s');
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), ['7400 node node_modules/.bin/remotion render its own parent']);
});

test('parseProcessList reads padded ps rows and skips what is not one', () => {
  assert.deepEqual(parseProcessList([
    '  PID  PPID COMMAND',
    '    1     0 /sbin/launchd',
    '  812   811 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless  --flag',
    '',
    '  900   812',
    '  901   812   ',
    'abc 1 x',
    '77 12 -zsh',
  ].join('\n') + '\n'), [
    {pid: 1, ppid: 0, command: '/sbin/launchd'},
    {pid: 812, ppid: 811, command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless  --flag'},
    {pid: 77, ppid: 12, command: '-zsh'},
  ]);
  assert.deepEqual(parseProcessList(''), []);
});
