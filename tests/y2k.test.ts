import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {parseSpriteRegistry, spriteHash, spriteProblems} from '../scripts/blender-sprites-plan';
import {spriteNeedsOf} from '../scripts/sprite-check';
import {getY2KScene, y2kLoopSchema, type Y2KLoopRenderProps} from '../src/backgrounds/Y2KLoop';
import {buildY2KLayout} from '../src/backgrounds/y2k/layout';
import {bloomGradient, plateGradient, shadowFilter} from '../src/backgrounds/y2k/plate';
import {loadY2KSprites, parseSpriteManifest, spriteClock, spriteFrameIndex, type Y2KSprite} from '../src/backgrounds/y2k/sprites';

const ROOT = process.cwd();
const FULL: Y2KSprite = {period: 480, start: 0, count: 480, complete: true};
const defaults = y2kLoopSchema.parse({});
const allSprites = (layout: readonly {asset: string}[], sprite: Y2KSprite = FULL) =>
  Object.fromEntries(layout.map((layer) => [layer.asset, sprite]));
const scene = (props: Y2KLoopRenderProps, frame: number) => getY2KScene(props, frame, 480);
const LAYER = {x: 960, y: 540, size: 300, blur: 0, shadow: false, phase: 0, floatPx: 0, floatCycles: 1};

// .cache/y2k-background/layout-r2.json, the composite the owner approved on 2026-10-07, copied by hand.
const APPROVED_R2 = [
  ['soap', 170, 1320, 470, 4, false], ['pixel-sparkle', 120, 1080, 300, 3, false], ['soap', 150, 850, 960, 4, false],
  ['gum', 230, 260, 250, 3, false], ['cassette', 520, 640, 200, 0, true], ['camcorder', 700, 1500, 290, 0, true],
  ['pouch', 640, 360, 760, 0, true], ['gum', 420, 1560, 850, 0, true], ['cursor', 330, 1150, 820, 0, true],
  ['soap', 270, 1010, 150, 0, false], ['soap', 230, 1830, 560, 0, false], ['soap', 200, 120, 470, 0, false],
  ['pixel-sparkle', 150, 760, 520, 0, true], ['pixel-sparkle', 120, 1780, 110, 0, true], ['pixel-sparkle', 130, 110, 990, 0, true],
];

test('Y2KLoop: the default layout is the approved composite plus the phone and the bow, with a seeded float', () => {
  const layout = buildY2KLayout();
  assert.deepEqual(buildY2KLayout(), layout, 'same seed, same layout');
  assert.deepEqual(defaults.layout, layout);
  assert.deepEqual(layout.slice(0, 15).map(({asset, size, x, y, blur, shadow}) => [asset, size, x, y, blur, shadow]), APPROVED_R2);
  assert.deepEqual(layout.slice(15).map((layer) => layer.asset), ['phone', 'bow']);
  for (const layer of layout.slice(15)) {
    assert.ok(layer.size >= 300 && layer.size <= 460, `${layer.asset}: ${layer.size} px`);
    assert.equal(layer.shadow, true, layer.asset);
    assert.equal(layer.blur, 0, layer.asset);
    // Off the calm middle, where the overlay sits: the sprite's square stays out of x 640..1280, y 360..720.
    const half = layer.size / 2;
    const clear = layer.x + half <= 640 || layer.x - half >= 1280 || layer.y + half <= 360 || layer.y - half >= 720;
    assert.ok(clear, `${layer.asset} at (${layer.x}, ${layer.y}) covers the calm middle`);
  }
  for (const layer of layout) {
    assert.ok(Number.isInteger(layer.phase) && layer.phase >= 0 && layer.phase < 480, `${layer.asset}: phase ${layer.phase}`);
    assert.ok(Number.isInteger(layer.floatCycles) && layer.floatCycles >= 1 && layer.floatCycles <= 2, `${layer.asset}: ${layer.floatCycles} cycles`);
    assert.ok(layer.floatPx >= 4 && layer.floatPx <= 18, `${layer.asset}: ${layer.floatPx} px`);
  }
  assert.ok(layout.some((layer) => layer.floatCycles === 2), 'some small pieces bob twice per loop');
  // Another seed moves the float, never the composite.
  const other = buildY2KLayout(7);
  assert.notDeepEqual(other.map((layer) => layer.phase), layout.map((layer) => layer.phase));
  assert.deepEqual(other.map(({asset, x, y, size}) => [asset, x, y, size]), layout.map(({asset, x, y, size}) => [asset, x, y, size]));
});

test('Y2KLoop: frame f + 480 is frame f, and the float keeps its speed across the seam', () => {
  const props: Y2KLoopRenderProps = {...defaults, sprites: allSprites(defaults.layout)};
  for (const frame of [0, 1, 137, 240, 479]) {
    assert.deepEqual(scene(props, frame + 480), scene(props, frame), `frame ${frame}`);
  }
  const tops = (frame: number) => scene(props, frame).map((sprite) => sprite.top);
  const [before, last, first, after] = [tops(478), tops(479), tops(480), tops(481)];
  last.forEach((_, index) => {
    // The step over the seam sits between its neighbours, as anywhere else on a sine.
    const seam = first[index]! - last[index]!;
    const mean = (last[index]! - before[index]! + after[index]! - first[index]!) / 2;
    assert.ok(Math.abs(seam - mean) < 0.01, `layer ${index}: seam step ${seam}, neighbours ${mean}`);
  });
  assert.ok(tops(0).some((top, index) => top !== tops(120)[index]), 'the sprites float');
});

test('Y2KLoop: the sprite shows (clock + phase) % period; a smoke render cycles through the frames it has', () => {
  assert.equal(spriteClock(137, 480), 137);
  assert.equal(spriteClock(200, 400), 240, 'GIF: 8 s at 50 fps');
  assert.equal(spriteClock(500, 960), 500, '16 s: the sprites play twice');
  const quarter: Y2KSprite = {period: 120, start: 0, count: 120, complete: true};
  assert.equal(spriteFrameIndex(quarter, 0, 30), 30);
  assert.equal(spriteFrameIndex(quarter, 100, 30), 10);
  assert.equal(spriteFrameIndex(quarter, 479, 1), 0);
  assert.equal(spriteFrameIndex(FULL, 479, 1), 0);
  assert.equal(spriteFrameIndex(FULL, 200, 300), 20);
  const smoke: Y2KSprite = {period: 480, start: 0, count: 4, complete: false};
  assert.deepEqual([0, 1, 2, 3, 4, 5, 240].map((clock) => spriteFrameIndex(smoke, clock, 0)), [0, 1, 2, 3, 0, 1, 0]);
  assert.deepEqual([0, 1, 2, 3].map((clock) => spriteFrameIndex({...smoke, start: 8}, clock, 1)), [9, 10, 11, 8]);
  // The scene names the file of that frame.
  const props: Y2KLoopRenderProps = {...defaults, layout: [{...LAYER, asset: 'heart', phase: 2}], sprites: {heart: smoke}};
  assert.equal(scene(props, 3)[0]!.file, 'sprites/y2k/heart/0001.webp');
  assert.equal(scene({...props, sprites: {heart: quarter}}, 3)[0]!.file, 'sprites/y2k/heart/0005.webp');
  // Manifests: what the Blender runner writes, and nothing else.
  assert.deepEqual(parseSpriteManifest('heart', {asset: 'heart', frames: 4, frameRange: [0, 4], period: 480, complete: false}), smoke);
  assert.deepEqual(parseSpriteManifest('heart', {frameRange: [0, 120], period: 120, complete: true}), quarter);
  for (const bad of [{period: 7, frameRange: [0, 7], complete: true}, {period: 480, frameRange: [0, 4], complete: true},
    {period: 480, frameRange: [4, 4], complete: false}, 'not json']) {
    assert.throws(() => parseSpriteManifest('heart', bad),
      /public\/sprites\/y2k\/heart\/manifest\.json is not a sprite manifest.*npm run blender:sprites -- y2k --only heart/, JSON.stringify(bad));
  }
});

test('Y2KLoop: a missing manifest names the asset and the command that renders it', async () => {
  const manifests: Record<string, unknown> = {'sprites/y2k/heart/manifest.json': {period: 480, frameRange: [0, 480], complete: true}};
  const asked: string[] = [];
  const loaded = await loadY2KSprites(['heart', 'phone', 'heart'], async (file) => {
    asked.push(file);
    return manifests[file] ?? null;
  });
  assert.deepEqual(asked, ['sprites/y2k/heart/manifest.json', 'sprites/y2k/phone/manifest.json'], 'each manifest once');
  assert.deepEqual(loaded, {heart: FULL});
  const props: Y2KLoopRenderProps = {...defaults, layout: [{...LAYER, asset: 'heart'}, {...LAYER, asset: 'phone'}], sprites: loaded};
  assert.throws(() => scene(props, 0),
    /no sprites for "phone" \(public\/sprites\/y2k\/phone\/manifest\.json is missing\)\. Render them: npm run blender:sprites -- y2k --only phone/);
  // Without calculateMetadata nothing is loaded, and a name like "constructor" is no sprite either.
  assert.throws(() => scene(defaults, 0), /no sprites for "soap"/);
  assert.throws(() => scene({...props, layout: [{...LAYER, asset: 'constructor'}]}, 0), /no sprites for "constructor"/);
  await assert.rejects(loadY2KSprites(['heart'], async () => 'not json'), /heart\/manifest\.json is not a sprite manifest/);
});

test('pack: Y2KLoop refuses a missing, smoke or stale sprite, and says how to render it', () => {
  const registry = parseSpriteRegistry(JSON.parse(readFileSync(path.join(ROOT, 'scripts/blender/y2k/sprites.json'), 'utf8')), 'y2k');
  const pythonFiles = [{name: 'sprites.py', content: 'print("sprites")'}];
  const scriptHash = spriteHash(registry, 'heart', pythonFiles);
  const manifest = (over: Record<string, unknown> = {}) => ({
    asset: 'heart', set: 'y2k', frames: 480, frameRange: [0, 480], period: 480, size: 640, fps: 60, format: 'webp',
    samples: 96, complete: true, blender: '5.2.0', scriptHash, createdAt: '2026-10-07T12:00:00.000Z', ...over,
  });
  const check = (found: unknown, ship = true, assets = ['heart']) => spriteProblems({
    need: {set: 'y2k', assets}, registry, pythonFiles, readManifest: () => found, ship,
  }).join('\n');
  assert.equal(check(manifest()), '');
  for (const [found, why] of [
    [null, /heart: no sprites \(public\/sprites\/y2k\/heart\/manifest\.json is missing\)/],
    [manifest({complete: false, frameRange: [0, 4], frames: 4}), /heart: a smoke render \(complete: false, frames 0:4\)/],
    [manifest({scriptHash: 'f'.repeat(64)}), /heart: stale sprite/],
    ['unreadable', /heart: public\/sprites\/y2k\/heart\/manifest\.json is unreadable/],
  ] as const) {
    const text = check(found);
    assert.match(text, why);
    assert.match(text, /npm run blender:sprites -- y2k --only heart/);
  }
  // An asset sprites.json does not list has no current hash to compare with.
  assert.match(check(manifest({asset: 'phone'}), true, ['phone']),
    /phone: not in scripts\/blender\/y2k\/sprites\.json.*npm run blender:sprites -- y2k --only phone/);
  // A preview or validate:exports only needs the manifest: a smoke render will do.
  assert.equal(check(manifest({complete: false, frameRange: [0, 4]}), false), '');
  assert.match(check(null, false), /heart: no sprites/);
  // The pack wiring: a planned Y2KLoop file needs every asset of its layout, once each; GradientLoop none.
  const needs = spriteNeedsOf([
    {composition: 'Y2KLoop', exportProps: defaults},
    {composition: 'GradientLoop', exportProps: {}},
    {composition: 'Y2KLoop', exportProps: {...defaults, layout: [{...LAYER, asset: 'heart'}]}},
  ]);
  assert.deepEqual(needs, [{set: 'y2k', assets: ['bow', 'camcorder', 'cassette', 'cursor', 'gum', 'heart', 'phone', 'pixel-sparkle', 'pouch', 'soap']}]);
});

test('every bundle links public/ instead of copying the sprites into it', () => {
  let calls = 0;
  for (const name of readdirSync(path.join(ROOT, 'scripts')).filter((file) => file.endsWith('.ts'))) {
    const source = readFileSync(path.join(ROOT, 'scripts', name), 'utf8');
    for (let at = source.indexOf('bundle({'); at !== -1; at = source.indexOf('bundle({', at + 1)) {
      let depth = 0;
      let end = at + 'bundle('.length;
      for (; end < source.length; end++) {
        if (source[end] === '{') depth++;
        if (source[end] === '}' && --depth === 0) break;
      }
      assert.match(source.slice(at, end), /\bsymlinkPublicDir: true\b/, `${name}: this bundle() copies public/`);
      calls++;
    }
  }
  assert.ok(calls >= 2, `only ${calls} bundle() calls found in scripts/`);
});

test('Y2KLoop: the YN-02 plate, bloom and tinted shadow match the approved mock', () => {
  assert.equal(plateGradient(1920, 1080, ['#A9D6FF', '#C9A8F0', '#FF8EC4'], -35),
    'linear-gradient(145deg, #A9D6FF -5.54%, #C9A8F0 50%, #FF8EC4 105.54%)');
  assert.equal(bloomGradient(1920, 1080, {x: 0.38, y: 0.52, radius: 0.62, opacity: 0.4}),
    'radial-gradient(circle 669.6px at 729.6px 561.6px, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 100%)');
  assert.equal(shadowFilter(520, '#5A3A7A', 0.34), 'drop-shadow(0px 20px 32px rgba(90, 58, 122, 0.34))');
  assert.equal(shadowFilter(120, '#5A3A7A', 0.34), 'drop-shadow(0px 6px 8px rgba(90, 58, 122, 0.34))');
  assert.deepEqual([defaults.plateColors, defaults.plateAngle, defaults.shadowColor, defaults.shadowOpacity, defaults.bloom],
    [['#A9D6FF', '#C9A8F0', '#FF8EC4'], -35, '#5A3A7A', 0.34, 0.4]);
  // Blur first, then the shadow: the first soap is blurred and bare, the cassette sharp and shadowed.
  const placed = scene({...defaults, sprites: allSprites(defaults.layout)}, 0);
  assert.equal(placed[0]!.filter, 'blur(4px)');
  assert.equal(placed[4]!.filter, 'drop-shadow(0px 20px 32px rgba(90, 58, 122, 0.34))');
  assert.equal(placed[9]!.filter, undefined);
});
