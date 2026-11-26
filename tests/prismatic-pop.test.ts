import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parsePackManifest, planPack, realPackDeps} from '../scripts/pack-plan';
import {buildKitJob, mergeStillProps, parseJob} from '../scripts/stills-job';
import {getAsset} from '../src/catalog';
import {hasAlpha} from '../src/settings';
import {
  PRISMATIC_POP_LOOKS, PRISMATIC_RING_EXTENT, PrismaticPopFrame, STACKED_FRAME_REACH, STANDARD_LAYOUT_VARIANTS, VERTICAL_LAYOUTS,
  getLiveFrameScene, getPrismaticPopMotion, liveFrameLoopSchema, prismaticPopSchema, type LayoutWindow, type PrismaticPopProps,
} from '../src/overlays/vertical';

const json = (file: string) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')) as unknown;
const manifest = () => parsePackManifest(json('packs/prismatic-pop-vertical.json'));
const markup = (props: PrismaticPopProps, frame: number, durationInFrames = 480) =>
  renderToStaticMarkup(createElement(PrismaticPopFrame, {props, frame, durationInFrames}));
const rings = (html: string) => html.slice(html.indexOf('<g data-layer="window-rings">'));

const boxOf = (window: LayoutWindow) => [window.x, window.y, window.width, window.height];
const R56 = [56, 56, 56, 56];

test('standard variants: the file suffixes and their layouts, two stacked and two single', () => {
  assert.deepEqual(STANDARD_LAYOUT_VARIANTS.map(({id, layout}) => [id, layout]), [
    ['camera-game', 'three-blocks'], ['camera-game-compact', 'three-blocks-compact'],
    ['single-pill', 'single-stadium'], ['single-rounded', 'single-rounded'],
  ]);
  // The grid was set on this kit's ink: the layouts' frame reach is Prismatic Pop's.
  assert.equal(STACKED_FRAME_REACH, PRISMATIC_RING_EXTENT);
});

test('standard variants, stacked: camera and game are 16:9 twins on the grid, fused in the compact one', () => {
  for (const variant of STANDARD_LAYOUT_VARIANTS.filter(({id}) => id.startsWith('camera-game'))) {
    const [camera, game, chat] = VERTICAL_LAYOUTS[variant.layout].windows;
    assert.ok(camera && game && chat);
    const compact = variant.id === 'camera-game-compact';
    // Owner, 2026-11-26: 40 px sides, and a camera as wide and as tall as the game, both 16:9.
    assert.deepEqual(boxOf(camera), [40, 98, 1000, 562], `${variant.id}: camera`);
    assert.deepEqual(boxOf(game), [40, compact ? 684 : 722, 1000, 562], `${variant.id}: game`);
    assert.deepEqual(boxOf(chat), [40, 1346, 1000, 414], `${variant.id}: chat`);
    // 16:9 at 1000 px is 562.5 tall: the even 562 is the biggest that fits.
    for (const window of [camera, game]) {
      assert.ok(window.height <= window.width * 9 / 16 && window.width * 9 / 16 - window.height < 2, `${variant.id}/${window.id}: 16:9`);
      assert.deepEqual(window.radii, R56, `${variant.id}/${window.id}: uniformly rounded, no arch`);
    }
    // The ink keeps the grid's 40 px minus its reach at the sides, and stays on the screen above the camera.
    assert.equal(game.x - PRISMATIC_RING_EXTENT, 21);
    assert.equal(camera.y - PRISMATIC_RING_EXTENT, 79);
    const gap = game.y - camera.y - camera.height;
    const between = gap - 2 * PRISMATIC_RING_EXTENT;
    if (compact) {
      assert.equal(gap, 24, `${variant.id}: 24 px between the windows`);
      assert.equal(between, -14, `${variant.id}: the two inks fuse, overlapping 14 px`);
      assert.equal(game.y + game.height, 1246);
    } else {
      assert.equal(between, 24, `${variant.id}: 24 px between the inks`);
      assert.equal(game.y + game.height, 1284, `${variant.id}: the game ends where it ended`);
      assert.equal(chat.y - game.y - game.height - 2 * PRISMATIC_RING_EXTENT, 24, `${variant.id}: 24 px from the game's ink to the chat's`);
    }
  }
});

test('standard variants, single: one 1000×1310 window on the grid, a pill or with the blocks\' radius', () => {
  const radii: Record<string, number[]> = {'single-pill': [500, 500, 500, 500], 'single-rounded': R56};
  for (const variant of STANDARD_LAYOUT_VARIANTS.filter(({id}) => id.startsWith('single'))) {
    const layout = VERTICAL_LAYOUTS[variant.layout];
    assert.equal(layout.windows.length, 1, variant.id);
    const [container] = layout.windows;
    assert.ok(container);
    // Owner, 2026-11-26: the same 40 px sides as the stacked windows, y 210 to 1520.
    assert.deepEqual(boxOf(container), [40, 210, 1000, 1310], variant.id);
    assert.deepEqual(container.radii, radii[variant.id], variant.id);
    assert.equal(container.role, 'camera');
    assert.deepEqual(layout.chatModes, ['open']);
    assert.equal(container.x - PRISMATIC_RING_EXTENT, 21);
  }
});

test('Prismatic Pop: the frame cuts exactly the layout\'s windows, with one ring per window', () => {
  const ringPaths = (html: string) => [...rings(html).matchAll(/<path d="[^"]+" fill="([^"]+)" fill-rule="evenodd"/g)].map((match) => match[1]);
  const holes = (html: string) => [...html.matchAll(/<clipPath id="prismatic-[a-z-]+-windows-\d+"><path d="([^"]+)" clip-rule="evenodd"/g)].map((match) => match[1]);
  for (const {id, layout} of STANDARD_LAYOUT_VARIANTS) {
    const props = prismaticPopSchema.parse({layout});
    const scene = getLiveFrameScene(liveFrameLoopSchema.parse({layout, chatMode: 'open'}), 0, 480);
    const html = markup(props, 0);
    assert.equal(scene.windows.length, id.startsWith('single') ? 1 : 2, id);
    assert.deepEqual(holes(html), scene.holes, `${id}: every window is a hole of the art`);
    // Each window gets an ink, an edge and a line.
    assert.equal(ringPaths(html).length, 3 * scene.windows.length, id);
  }
});

test('Prismatic Pop: the rings draw every ink, then every edge, then every line, so a fused bridge is one frame', () => {
  const props = prismaticPopSchema.parse({layout: 'three-blocks-compact'});
  const layers = [...rings(markup(props, 0)).matchAll(/<path d="[^"]+" fill="([^"]+)" fill-rule="evenodd"/g)].map((match) => match[1]);
  const {edge, line} = {edge: '#FFE745', line: '#FFF8E9'};
  // Two windows in open mode: both inks, both edges, both lines.
  assert.deepEqual(layers, ['#121021', '#121021', edge, edge, line, line]);
});

test('Prismatic Pop: motion closes in phase and velocity and is independent of render order', () => {
  for (const duration of [240, 480, 750]) for (const seed of [1, 9]) {
    for (const frame of [0, 0.5, 37, 123]) {
      const before = getPrismaticPopMotion(frame, duration, seed);
      getPrismaticPopMotion(211, duration, 999);
      assert.deepEqual(getPrismaticPopMotion(frame, duration, seed), before);
      assert.deepEqual(getPrismaticPopMotion(frame + duration, duration, seed), before);
    }
    // Four complete 15 px tiles per cycle, with constant speed on both sides.
    const e = 0.001;
    const a = getPrismaticPopMotion(-e, duration, seed);
    const b = getPrismaticPopMotion(0, duration, seed);
    const c = getPrismaticPopMotion(e, duration, seed);
    assert.ok(Math.abs((60 - a.dots) / e - c.dots / e) < 1e-8);
    for (const key of ['glintOpacity', 'glintScale', 'ribbonWave', 'ribbonCounterWave'] as const) {
      assert.ok(Math.abs((b[key] - a[key]) / e - (c[key] - b[key]) / e) < 1e-5, key);
    }
    assert.notDeepEqual(getPrismaticPopMotion(0, duration, seed), getPrismaticPopMotion(duration / 2, duration, seed));
  }
});

test('Prismatic Pop: visible motifs move, with ribbon ends fixed off canvas and satellites on their rails', () => {
  const numbers = (value: string) => [...value.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)].map(([number]) => Number(number));
  const ribbonPaths = (html: string) => [...html.matchAll(/<g data-motion="ribbon"[^>]*><path d="([^"]+)"/g)].map((match) => numbers(match[1]!));
  for (const look of ['electric-candy', 'sugar-voltage'] as const) {
    const props = prismaticPopSchema.parse({look});
    const samples = Array.from({length: 8}, (_, index) => ribbonPaths(markup(props, index * 60)));
    assert.ok(samples[0]!.length >= 3, look);
    for (const [index, start] of samples[0]!.entries()) {
      const endpoints = [start.slice(0, 2), start.slice(-2)];
      for (const [x, y] of endpoints) assert.ok(x! < 0 || x! >= 1080 || y! < 0 || y! >= 1920, `${look}: end stays outside canvas`);
      for (const sample of samples) {
        const path = sample[index]!;
        assert.deepEqual([path.slice(0, 2), path.slice(-2)], endpoints, `${look}: ribbon ends remain anchored`);
      }
      const travel = Math.max(...start.map((_, coordinate) => {
        const values = samples.map((sample) => sample[index]![coordinate]!);
        return Math.max(...values) - Math.min(...values);
      }));
      assert.ok(travel >= 20, `${look} ribbon ${index}: geometry must visibly flex, not just change its texture (${travel}px)`);
    }
  }
  const props = prismaticPopSchema.parse({look: 'night-signal'});
  const satellites = (frame: number) => [...markup(props, frame).matchAll(/data-motion="satellite" cx="([^"]+)" cy="([^"]+)"/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  const start = satellites(0);
  assert.equal(start.length, 4);
  for (let frame = 0; frame < 480; frame += 15) {
    for (const [index, [x, y]] of satellites(frame).entries()) {
      const [cx, cy, rx, ry] = index < 2 ? [312, 119, 330, 88] : [1043, 758, 54, 184];
      assert.ok(Math.abs(((x! - cx!) / rx!) ** 2 + ((y! - cy!) / ry!) ** 2 - 1) < 1e-9, 'satellite stays on the ellipse');
    }
  }
  for (const [index, [x, y]] of satellites(120).entries()) {
    assert.ok(Math.hypot(x! - start[index]![0]!, y! - start[index]![1]!) > 50, 'satellites visibly travel');
  }
});

test('Prismatic Pop: every look/layout keeps its rings fixed, plain removes art, and MP4 composites green', () => {
  for (const look of PRISMATIC_POP_LOOKS) for (const {layout} of STANDARD_LAYOUT_VARIANTS) {
    const props = prismaticPopSchema.parse({look, layout, backgroundColor: '#00FF00'});
    const start = markup(props, 0);
    assert.equal(markup(props, 480), start);
    assert.notEqual(markup(props, 120), start, 'approved motion remains visible');
    assert.equal(rings(start), rings(markup(props, 120)));
    const plain = markup({...props, ornaments: false}, 120);
    assert.equal(rings(start), rings(plain));
    assert.doesNotMatch(plain, /fill="url\(#prismatic-.*-dots\)"/);
    assert.match(start, /fill="url\(#prismatic-.*-dots\)"/);
    assert.ok(start.includes('background-color:transparent'), 'PNG/WebM must keep the source windows transparent');
    assert.ok(markup({...props, outputFormat: 'mp4'}, 0).includes('background-color:#00FF00'), 'MP4 must composite over the preset green');
    assert.doesNotMatch(start, /<image|<video|mix-blend-mode/);
  }
  // Only the four standard layouts: the discarded ones and the removed id of pack v4 stay out.
  for (const layout of ['single-rect', 'phone-game-bubble', 'three-blocks-left']) {
    assert.equal(prismaticPopSchema.safeParse({layout}).success, false, layout);
  }
  assert.equal(prismaticPopSchema.safeParse({chatMode: 'panel'}).success, false);
  assert.equal(prismaticPopSchema.safeParse({width: 720}).success, false);
});

test('vertical pack: every approved look has all four layouts, plain twins, three formats and four guides', () => {
  const pack = manifest();
  const plan = planPack(pack, realPackDeps);
  assert.equal(plan.length, 76);
  assert.equal(new Set(plan.map((file) => file.output.toLowerCase())).size, plan.length);
  const frames = plan.filter((file) => file.composition === 'PrismaticPopLoop');
  for (const look of PRISMATIC_POP_LOOKS) {
    const preset = prismaticPopSchema.strict().parse(json(`presets/vertical-prismatic-pop-${look}.json`));
    assert.equal(preset.look, look);
    assert.equal(preset.backgroundColor, '#00FF00');
    for (const variant of STANDARD_LAYOUT_VARIANTS) for (const ornaments of [true, false]) {
      const files = frames.filter((file) => file.exportProps.look === look && file.exportProps.layout === variant.layout && file.exportProps.ornaments === ornaments);
      assert.deepEqual(files.map((file) => file.format).sort(), ['mp4', 'png', 'webm']);
      for (const file of files) {
        const props = prismaticPopSchema.parse(file.exportProps);
        assert.equal(file.variant, `${look}-${variant.id}${ornaments ? '' : '-plain'}`);
        assert.deepEqual(file.canvas, {width: 1080, height: 1920});
        assert.equal(file.fps, 60);
        assert.equal(file.frames, 480);
        assert.equal(hasAlpha(props), file.format !== 'mp4');
        assert.match(file.output, /^out\/packs\/prismatic-pop-vertical\/vertical\/[a-z0-9-]+\.(webm|mp4|png)$/);
      }
    }
  }
  const guides = plan.filter((file) => file.composition === 'SafeZoneGuide');
  assert.deepEqual(guides.map((file) => file.exportProps.layout), STANDARD_LAYOUT_VARIANTS.map(({layout}) => layout));
  assert.deepEqual(guides.map((file) => file.variant), ['guide-camera-game', 'guide-camera-game-compact', 'guide-single-pill', 'guide-single-rounded']);
  assert.ok(guides.every((file) => file.format === 'png' && file.exportProps.view === 'live'));
});

test('vertical QA: every layout gets a portrait LIVE mock and MP4 gets a separate opaque proof', () => {
  const plan = planPack(manifest(), realPackDeps);
  const job = parseJob(buildKitJob(plan, {frames: [0]}));
  assert.equal(job.mockups!.length, 24);
  assert.equal(job.sheets!.length, 6);
  assert.ok(job.sheets!.every((sheet) => sheet.names.length === 4 && sheet.cols === 4));
  for (const mock of job.mockups!) {
    assert.deepEqual([mock.width, mock.height], [1080, 1920]);
    assert.equal(mock.layers.at(-1)!.name, 'vertical-live-ui-0');
  }
  const opaque = job.stills.filter((still) => still.previewFormat === 'mp4');
  assert.equal(opaque.length, 24, 'format deduplication must not hide green-screen validation');
  for (const still of opaque) {
    const props = getAsset(still.id).schema.parse(mergeStillProps({preset: {}, props: still.props, sizeProps: {}, overlay: true, previewFormat: still.previewFormat})) as PrismaticPopProps;
    assert.equal(hasAlpha(props), false);
    assert.equal(props.backgroundColor, '#00FF00');
  }
});
