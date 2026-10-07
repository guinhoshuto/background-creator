import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {
  BLENDER_BIN_ENV, DEFAULT_BLENDER_BIN, decideSprite, dryRunText, parseFrameRange, parseSpriteRegistry, planSprites,
  readWebpInfo, resolveBlender, runSprites, spriteHash, type SpriteAsset, type SpriteChoice, type SpriteEffects, type SpriteManifest,
  type SpriteRegistry,
} from '../scripts/blender-sprites-plan';

const heart = () => ({
  module: 'heart', size: 640, samples: 96, transparentGlass: false, pose: [-6, 0, 24],
  motion: {kind: 'sway', axis: 'Z', degrees: 18, cycles: 1}, period: 480,
});
const registryWith = (assets: Record<string, unknown>) => ({set: 'y2k', fps: 60, loopFrames: 480, assets});
const parsed = (assets: Record<string, unknown>) => parseSpriteRegistry(registryWith(assets), 'y2k');
const PYTHON = ['heart.py', 'sparkle.py', 'sprites.py', 'studio.py'];

test('registry: the committed sprites.json is valid', () => {
  const data: unknown = JSON.parse(readFileSync(new URL('../scripts/blender/y2k/sprites.json', import.meta.url), 'utf8'));
  const registry = parseSpriteRegistry(data, 'y2k');
  assert.deepEqual(registry.assets.heart?.motion, {kind: 'sway', axis: 'Z', degrees: 18, cycles: 1});
  assert.equal(registry.assets.heart?.period, 480);
});

test('registry: a period that does not divide 480 is refused, with the field and the way out', () => {
  assert.throws(() => parsed({heart: {...heart(), period: 100}}), /assets\.heart\.period: 100 must be a whole number of frames that divides 480/);
  assert.throws(() => parsed({heart: {...heart(), period: 0}}), /assets\.heart\.period: 0 must be a whole number/);
});

test('registry: cycles and turns must be whole numbers', () => {
  assert.throws(() => parsed({heart: {...heart(), motion: {kind: 'sway', axis: 'Z', degrees: 18, cycles: 1.5}}}),
    /assets\.heart\.motion\.cycles: 1\.5 must be a whole number of swings per 480 frames/);
  assert.throws(() => parsed({star: {...heart(), module: 'sparkle', motion: {kind: 'spin', axis: 'Z', turns: 0.5}}}),
    /assets\.star\.motion\.turns: 0\.5 must be a whole number of turns per 480 frames/);
});

test('registry: the period must bring the motion back to frame 0', () => {
  // One swing per 480 frames is mid-swing at 240; two swings are back at 240.
  assert.throws(() => parsed({heart: {...heart(), period: 240}}), /assets\.heart\.period: 240 frames stop the sway mid-swing .*use 480/);
  assert.doesNotThrow(() => parsed({heart: {...heart(), period: 240, motion: {kind: 'sway', axis: 'Z', degrees: 18, cycles: 2}}}));
  // A quarter turn (120 frames of one turn per loop) repeats only for a shape that says it is four-fold.
  const star = (motion: object) => ({star: {...heart(), module: 'sparkle', period: 120, motion}});
  assert.throws(() => parsed(star({kind: 'spin', axis: 'Z', turns: 1})), /assets\.star\.period: after 120 frames the spin has turned 90°.*use 480/);
  assert.doesNotThrow(() => parsed(star({kind: 'spin', axis: 'Z', turns: 1, symmetry: 4})));
});

test('registry: a typo, a wrong set and a wrong loop are named in one message', () => {
  const data = {...registryWith({heart: {...heart(), cycle: 1}}), set: 'kawaii', loopFrames: 240};
  assert.throws(() => parseSpriteRegistry(data, 'y2k'), (error: Error) => {
    assert.match(error.message, /set: "kawaii" must be "y2k", the name of its folder/);
    assert.match(error.message, /loopFrames: 240 must be 480/);
    assert.match(error.message, /assets\.heart\.cycle: unknown field/);
    return true;
  });
});

test('hash: follows the asset entry and every Python file, not the key order or the other assets', () => {
  const files = [{name: 'studio.py', content: 'studio'}, {name: 'heart.py', content: 'heart'}];
  const base = spriteHash(parsed({heart: heart()}), 'heart', files);
  assert.match(base, /^[0-9a-f]{64}$/);
  // Parsing writes the fields in one fixed order; the hash must not lean on it (a refactor would re-render every asset).
  const entry = parsed({heart: heart()}).assets.heart!;
  const reversed = {...Object.fromEntries(Object.entries(entry).reverse()), motion: Object.fromEntries(Object.entries(entry.motion).reverse())} as SpriteAsset;
  const reordered: SpriteRegistry = {...parsed({heart: heart()}), assets: {star: {...entry, module: 'sparkle'}, heart: reversed}};
  assert.equal(spriteHash(reordered, 'heart', [...files].reverse()), base);
  assert.notEqual(spriteHash(parsed({heart: {...heart(), size: 512}}), 'heart', files), base);
  assert.notEqual(spriteHash(parsed({heart: heart()}), 'heart', [{name: 'studio.py', content: 'studio, edited'}, files[1]!]), base);
  assert.notEqual(spriteHash(parsed({heart: heart()}), 'heart', [...files, {name: 'pillow.py', content: 'pillow'}]), base);
});

test('plan: --only names known assets, the module must exist, and overrides mark a smoke render incomplete', () => {
  const registry = parsed({heart: heart()});
  assert.throws(() => planSprites(registry, {only: 'hart'}, PYTHON), /--only hart: no such asset in y2k; it has heart/);
  assert.throws(() => planSprites(parsed({cd: {...heart(), module: 'cd'}}), {}, PYTHON), /assets\.cd\.module: scripts\/blender\/y2k\/cd\.py does not exist/);
  const [full] = planSprites(registry, {}, PYTHON);
  assert.deepEqual(
    {range: full!.range, size: full!.size, samples: full!.samples, complete: full!.complete, output: full!.output, partial: full!.partial},
    {range: {start: 0, end: 480}, size: 640, samples: 96, complete: true, output: 'public/sprites/y2k/heart', partial: 'public/sprites/y2k/heart.partial'},
  );
  const [smoke] = planSprites(registry, {frames: '0:4', size: 128, samples: 8}, PYTHON);
  assert.deepEqual({range: smoke!.range, size: smoke!.size, samples: smoke!.samples, complete: smoke!.complete}, {range: {start: 0, end: 4}, size: 128, samples: 8, complete: false});
  assert.throws(() => planSprites(registry, {size: 127}, PYTHON), /--size 127: an even number of px/);
});

test('frames: start:end inside the period, or the way out', () => {
  assert.deepEqual(parseFrameRange('476:480', 480, 'heart'), {start: 476, end: 480});
  assert.throws(() => parseFrameRange('4:4', 480, 'heart'), /pick start < end ≤ 480/);
  assert.throws(() => parseFrameRange('0:481', 480, 'heart'), /heart renders frames 0 to 479/);
  assert.throws(() => parseFrameRange('0-4', 480, 'heart'), /write start:end/);
});

const manifestFor = (extra: Partial<SpriteManifest> = {}): SpriteManifest => ({
  asset: 'heart', set: 'y2k', frames: 480, frameRange: [0, 480], period: 480, size: 640, fps: 60, format: 'webp', samples: 96,
  complete: true, blender: '5.2.2 LTS', scriptHash: 'h1', createdAt: '2026-10-07T00:00:00.000Z', ...extra,
});

test('manifest: skip only what this run would render again; --overwrite always renders', () => {
  const registry = parsed({heart: heart()});
  const [full] = planSprites(registry, {}, PYTHON);
  assert.deepEqual(decideSprite(full!, 'h1', manifestFor(), false), {render: false, reason: 'up to date'});
  assert.deepEqual(decideSprite(full!, 'h1', manifestFor(), true), {render: true, reason: '--overwrite'});
  assert.deepEqual(decideSprite(full!, 'h1', null, false), {render: true, reason: 'not rendered yet'});
  assert.match(decideSprite(full!, 'h2', manifestFor(), false).reason, /the registry entry or the Python changed since the last render/);
  // A smoke test's sprites never stand for the full render; the smoke itself resumes.
  const smokeManifest = manifestFor({frames: 4, frameRange: [0, 4], size: 128, samples: 8, complete: false});
  assert.deepEqual(decideSprite(full!, 'h1', smokeManifest, false), {render: true, reason: 'rendered with other settings (frames 0:4, 128 px, 8 samples)'});
  const [smoke] = planSprites(registry, {frames: '0:4', size: 128, samples: 8}, PYTHON);
  assert.equal(decideSprite(smoke!, 'h1', smokeManifest, false).render, false);
  // Each setting on its own.
  assert.equal(decideSprite(full!, 'h1', manifestFor({size: 512}), false).render, true);
  assert.equal(decideSprite(full!, 'h1', manifestFor({samples: 64}), false).render, true);
  assert.equal(decideSprite(full!, 'h1', manifestFor({frames: 240, frameRange: [0, 240]}), false).render, true);
});

test('blender: a missing executable is refused with the way out', () => {
  assert.throws(() => resolveBlender({}, () => false), /Blender is not at \/Volumes\/Sandisk\/.*: connect the Sandisk drive, or set BLENDER_BIN/);
  assert.throws(() => resolveBlender({[BLENDER_BIN_ENV]: '/nowhere/Blender'}, () => false), /BLENDER_BIN=\/nowhere\/Blender does not exist/);
  assert.equal(resolveBlender({}, (file) => file === DEFAULT_BLENDER_BIN), DEFAULT_BLENDER_BIN);
  assert.equal(resolveBlender({[BLENDER_BIN_ENV]: '/opt/Blender'}, (file) => file === '/opt/Blender'), '/opt/Blender');
});

test('dry run: one line per asset and the total of what renders, in MiB and minutes', () => {
  const registry = parsed({heart: heart(), star: {...heart(), module: 'sparkle', period: 120, motion: {kind: 'spin', axis: 'Z', turns: 1, symmetry: 4}}});
  const [first, second] = planSprites(registry, {}, PYTHON);
  const text = dryRunText('y2k', [
    {plan: first!, hash: 'a', decision: {render: true, reason: 'not rendered yet'}},
    {plan: second!, hash: 'b', decision: {render: false, reason: 'up to date'}},
  ], 'Blender: /b.');
  assert.match(text, /render heart: heart\.py, frames 0:480 of 480, 640 px, 96 samples, sway Z ±18° ×1 -> public\/sprites\/y2k\/heart\/ \(not rendered yet\), ~56\.3 MiB, ~1 h 14 min/);
  assert.match(text, /^ {2}skip {3}star: sparkle\.py, frames 0:120 of 120, .*spin Z ×1 \(symmetry 4\).*\(up to date\)$/m);
  // Only heart counts: 480 × 640² × 0.3 B = 56.3 MiB; 100 s of Metal kernels + 15 s to start + 480 × (1 + 8) s = 74 min.
  assert.match(text, /To render: 1 asset\(s\), 480 frames, ~56\.3 MiB, ~1 h 14 min/);
});

const SCRIPT = '/repo/scripts/blender/y2k/sprites.py';
const runEffects = (events: string[], overrides: Partial<SpriteEffects> = {}): SpriteEffects => ({
  findBlender: () => '/b/Blender',
  takeTurn: async (plan) => {
    events.push(`take ${plan.id}`);
    return {release: () => events.push(`release ${plan.id}`)};
  },
  resetDirectory: async (relative) => { events.push(`reset ${relative}`); },
  runBlender: async (_blender, args) => {
    events.push(`blender ${args[args.indexOf('--asset') + 1]}`);
    return {blender: '5.2.2 LTS', device: 'GPU', seconds: [101, 1]};
  },
  readFrame: async () => ({info: {width: 128, height: 128, alpha: true}, bytes: 2048}),
  writeJson: async (relative, data) => { events.push(`json ${relative} ${JSON.stringify(data)}`); },
  publish: async (from, to) => { events.push(`publish ${from} -> ${to}`); },
  log: () => {},
  now: () => new Date('2026-10-07T12:00:00Z'),
  ...overrides,
});
const smokeChoices = (): SpriteChoice[] => {
  const registry = parsed({heart: heart(), cd: {...heart(), module: 'cd'}, star: {...heart(), module: 'sparkle'}});
  return planSprites(registry, {frames: '0:2', size: 128, samples: 8}, ['cd.py', ...PYTHON]).map((plan) => ({
    plan, hash: `hash-${plan.id}`, decision: plan.id === 'cd' ? {render: false, reason: 'up to date'} : {render: true, reason: 'not rendered yet'},
  }));
};

test('run: each asset takes its own render turn and releases it before the next; a skipped asset takes none', async () => {
  const events: string[] = [];
  await runSprites({choices: smokeChoices(), root: '/repo', script: SCRIPT, effects: runEffects(events)});
  const order = events.filter((event) => /^(take|release|blender|publish) /.test(event)).map((event) => event.replace(/ -> .*/, ''));
  assert.deepEqual(order, [
    'take heart', 'blender heart', 'publish public/sprites/y2k/heart.partial', 'release heart',
    'take star', 'blender star', 'publish public/sprites/y2k/star.partial', 'release star',
  ]);
});

test('run: Blender runs headless on the planned frames, and the manifest says what was rendered', async () => {
  const events: string[] = [];
  let args: string[] = [];
  await runSprites({choices: smokeChoices().slice(0, 1), root: '/repo', script: SCRIPT, effects: runEffects(events, {
    runBlender: async (_blender, given) => {
      args = given;
      return {blender: '5.2.2 LTS', device: 'GPU', seconds: [101, 1]};
    },
  })});
  // --python-exit-code before --python, or a Python error would exit 0.
  assert.deepEqual(args, [
    '--factory-startup', '-b', '--python-exit-code', '1', '--python', SCRIPT, '--',
    '--asset', 'heart', '--out', '/repo/public/sprites/y2k/heart.partial', '--frames', '0:2', '--size', '128', '--samples', '8',
  ]);
  const json = events.find((event) => event.startsWith('json '))!;
  assert.ok(json.startsWith('json public/sprites/y2k/heart.partial/manifest.json {'), json);
  assert.deepEqual(JSON.parse(json.slice(json.indexOf('{'))), {
    asset: 'heart', set: 'y2k', frames: 2, frameRange: [0, 2], period: 480, size: 128, fps: 60, format: 'webp', samples: 8,
    complete: false, blender: '5.2.2 LTS', scriptHash: 'hash-heart', createdAt: '2026-10-07T12:00:00.000Z',
  });
});

test('run: a frame without alpha or a missing frame stops the asset unpublished and releases the slot', async () => {
  const events: string[] = [];
  await assert.rejects(runSprites({choices: smokeChoices().slice(0, 1), root: '/repo', script: SCRIPT, effects: runEffects(events, {
    readFrame: async () => ({info: {width: 128, height: 128, alpha: false}, bytes: 10}),
  })}), /heart: public\/sprites\/y2k\/heart\.partial\/0000\.webp is not a 128×128 WEBP with alpha \(128×128, without alpha\)/);
  await assert.rejects(runSprites({choices: smokeChoices().slice(0, 1), root: '/repo', script: SCRIPT, effects: runEffects(events, {
    readFrame: async (relative) => (relative.endsWith('0001.webp') ? null : {info: {width: 128, height: 128, alpha: true}, bytes: 10}),
  })}), /heart: Blender wrote no public\/sprites\/y2k\/heart\.partial\/0001\.webp/);
  assert.deepEqual(events.filter((event) => /^(take|release|publish) /.test(event)), ['take heart', 'release heart', 'take heart', 'release heart']);
});

test('run: a missing Blender is refused before any turn; nothing to render asks for no Blender', async () => {
  const events: string[] = [];
  const missing = () => {
    throw new Error(`Blender is not at ${DEFAULT_BLENDER_BIN}: connect the Sandisk drive, or set BLENDER_BIN`);
  };
  await assert.rejects(runSprites({choices: smokeChoices(), root: '/repo', script: SCRIPT, effects: runEffects(events, {findBlender: missing})}), /connect the Sandisk drive/);
  assert.deepEqual(events, []);
  const upToDate = smokeChoices().map((choice) => ({...choice, decision: {render: false, reason: 'up to date'}}));
  assert.deepEqual(await runSprites({choices: upToDate, root: '/repo', script: SCRIPT, effects: runEffects(events, {findBlender: missing})}), []);
});

const webpHeader = (chunk: string, payload: number[]) => {
  const data = Buffer.alloc(32);
  data.write('RIFF', 0, 'latin1');
  data.writeUInt32LE(24, 4);
  data.write('WEBP', 8, 'latin1');
  data.write(chunk, 12, 'latin1');
  data.writeUInt32LE(10, 16);
  payload.forEach((value, index) => { data[20 + index] = value; });
  return data;
};

test('webp header: size and alpha from VP8X (what Blender writes with alpha) and VP8L; anything else is no WEBP', () => {
  // Flags 0x10 (alpha), then width - 1 = 639 and height - 1 = 479, 24-bit little endian.
  assert.deepEqual(readWebpInfo(webpHeader('VP8X', [0x10, 0, 0, 0, 0x7f, 0x02, 0, 0xdf, 0x01, 0])), {width: 640, height: 480, alpha: true});
  assert.deepEqual(readWebpInfo(webpHeader('VP8X', [0x00, 0, 0, 0, 0x7f, 0, 0, 0x7f, 0, 0])), {width: 128, height: 128, alpha: false});
  // VP8L: signature 0x2f, then (width - 1) | (height - 1) << 14 | alpha << 28.
  const bits = 127 | (127 << 14) | (1 << 28);
  assert.deepEqual(readWebpInfo(webpHeader('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff])), {width: 128, height: 128, alpha: true});
  assert.equal(readWebpInfo(Buffer.from('\x89PNG\r\n\x1a\n000000000000000000000000', 'latin1')), null);
});
