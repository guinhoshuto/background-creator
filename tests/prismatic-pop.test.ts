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
  PRISMATIC_POP_LOOKS, PRISMATIC_RING_EXTENT, PrismaticPopFrame, STACKED_LAYOUT_VARIANTS, VERTICAL_LAYOUTS,
  getPrismaticPopMotion, prismaticPopSchema, type PrismaticPopProps,
} from '../src/overlays/vertical';

const json = (file: string) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')) as unknown;
const manifest = () => parsePackManifest(json('packs/prismatic-pop-vertical.json'));
const markup = (props: PrismaticPopProps, frame: number, durationInFrames = 480) =>
  renderToStaticMarkup(createElement(PrismaticPopFrame, {props, frame, durationInFrames}));
const rings = (html: string) => html.slice(html.indexOf('<g data-layer="window-rings">'));

test('stacked standard: four combinations preserve source sizes and leave ink outlines apart', () => {
  assert.equal(STACKED_LAYOUT_VARIANTS.length, 4);
  const pairs: string[] = [];
  for (const variant of STACKED_LAYOUT_VARIANTS) {
    const [camera, game, chat] = VERTICAL_LAYOUTS[variant.layout].windows;
    assert.ok(camera && game && chat);
    for (const window of [camera, game]) assert.deepEqual([window.x, window.width, window.height], [110, 860, 484]);
    assert.equal(camera.y, 260);
    assert.equal(chat.y, 1340);
    const gap = game.y - camera.y - camera.height;
    assert.ok(gap - 2 * PRISMATIC_RING_EXTENT >= 2, `${variant.id}: decorated rings must not touch`);
    assert.equal(gap, variant.id.includes('compact') ? 40 : 56);
    assert.deepEqual(game.radii, [56, 56, 56, 56]);
    assert.deepEqual(camera.radii, variant.id.startsWith('rect') ? game.radii : [200, 200, 56, 56]);
    pairs.push(`${camera.radii[0]}/${gap}`);
  }
  assert.equal(new Set(pairs).size, 4, 'shape and gap must vary independently');
});

test('Prismatic Pop: motion closes in phase and velocity and is independent of render order', () => {
  for (const duration of [240, 480, 750]) for (const seed of [1, 9]) {
    for (const frame of [0, 0.5, 37, 123]) {
      const before = getPrismaticPopMotion(frame, duration, seed);
      getPrismaticPopMotion(211, duration, 999);
      assert.deepEqual(getPrismaticPopMotion(frame, duration, seed), before);
      assert.deepEqual(getPrismaticPopMotion(frame + duration, duration, seed), before);
    }
    // Translate is periodic modulo one 15 px tile, with constant speed on both sides.
    const e = 0.001;
    const a = getPrismaticPopMotion(-e, duration, seed);
    const b = getPrismaticPopMotion(0, duration, seed);
    const c = getPrismaticPopMotion(e, duration, seed);
    assert.ok(Math.abs((15 - a.dots) / e - c.dots / e) < 1e-8);
    for (const key of ['glintOpacity', 'glintScale'] as const) {
      assert.ok(Math.abs((b[key] - a[key]) / e - (c[key] - b[key]) / e) < 1e-6, key);
    }
    assert.notDeepEqual(getPrismaticPopMotion(0, duration, seed), getPrismaticPopMotion(duration / 2, duration, seed));
  }
});

test('Prismatic Pop: every look/layout keeps its rings fixed, plain removes art, and MP4 composites green', () => {
  for (const look of PRISMATIC_POP_LOOKS) for (const {layout} of STACKED_LAYOUT_VARIANTS) {
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
  assert.equal(prismaticPopSchema.safeParse({layout: 'single-stadium'}).success, false);
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
    for (const variant of STACKED_LAYOUT_VARIANTS) for (const ornaments of [true, false]) {
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
  assert.deepEqual(guides.map((file) => file.exportProps.layout), STACKED_LAYOUT_VARIANTS.map(({layout}) => layout));
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
