import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {otherRenders, parseProcessList} from '../scripts/render-turn';

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
    [8000, 1, '/usr/bin/time node remotion render chain-parent'],
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
    [6100, 1, 'pkill -f remotion render'],
    [6200, 1, 'grep -E Chrome.*--headless log.txt'],
    [6300, 1, 'egrep remotion render notes.md'],
    [6400, 1, '/opt/homebrew/bin/rg dist/cli/index.js'],
    [6500, 1, '-zsh -c until ! pgrep -f \'Chrome.*--headless\'; do sleep 10; done'],
    [6600, 1, '/bin/bash -c sleep 1; npx remotion render A'],
    [6700, 1, 'sh -c remotion render A'],
    [6750, 6700, 'caffeinate -i sh -c remotion render A'],
  ];
  assert.deepEqual(otherRenders(parseProcessList(ps(wrappers)), SELF), []);
  // A program whose name only starts like a shell is no wrapper.
  assert.deepEqual(otherRenders(parseProcessList(ps([[6800, 1, '/usr/local/bin/zshrender remotion render A']])), SELF), ['6800 /usr/local/bin/zshrender remotion render A']);
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
    [7000, 7100, 'node remotion render cycle-above-a'],
    [7100, 7000, 'node remotion render cycle-above-b'],
    [SELF, 7000, 'node scripts/stills.ts'],
    [7200, SELF, 'node remotion render child'],
    [7300, 7200, 'node remotion render grandchild'],
    [7200, 7300, 'node remotion render duplicate row closing a loop'],
    [7400, 7400, 'node remotion render its own parent'],
  ]))});
    console.log(JSON.stringify(otherRenders(list, ${SELF})));
  `;
  const run = spawnSync(process.execPath, ['--max-old-space-size=256', '--import', 'tsx', '--input-type=module', '-e', cycle], {cwd: root, encoding: 'utf8', timeout: 10_000});
  assert.equal(run.error, undefined, 'the cycle walk did not end within 10 s');
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), ['7400 node remotion render its own parent']);
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
