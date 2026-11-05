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

test('Prismatic Pop: ribbons have no internal marks and polygons move in rigid steps at a constant cadence', () => {
  for (const look of PRISMATIC_POP_LOOKS) {
    const props = prismaticPopSchema.parse({look});
    const poses = (frame: number) => [...markup(props, frame).matchAll(/data-motion="polygon-shake" transform="translate\(([^)]+)\)"/g)]
      .map((match) => match[1]!.split(' ').map(Number));
    const start = poses(0);
    assert.ok(start.length >= 2, `${look}: polygons must participate`);
    assert.deepEqual(poses(480), start);
    const samples = Array.from({length: 480}, (_, frame) => poses(frame));
    for (const [index] of start.entries()) {
      const distances = samples.map((sample, frame) => {
        const [x, y] = sample[index]!;
        const [nextX, nextY] = samples[(frame + 1) % samples.length]![index]!;
        assert.ok(Math.hypot(x!, y!) <= 2 + 1e-12, 'motion stays within a 2 px radius');
        assert.ok(Number.isInteger(x) && Number.isInteger(y), 'poses remain crisp, without smooth drift');
        return Math.hypot(nextX! - x!, nextY! - y!);
      });
      for (const [frame, distance] of distances.entries()) {
        const expected = (frame + 1) % 5 === 0 ? Math.SQRT2 : 0;
        assert.ok(Math.abs(distance - expected) < 1e-12, `${look} frame ${frame}: identical steps every five frames, including the seam; no long rest`);
      }
    }
    assert.ok(samples.some((sample) => new Set(sample.map((pose) => pose.join(','))).size > 1), 'polygons are staggered');
    for (const frame of [0, 45, 120, 315]) {
      for (const [, ribbon] of markup(props, frame).matchAll(/<g data-motion="ribbon"[^>]*>(.*?)<\/g>/g)) {
        assert.equal((ribbon!.match(/<path /g) ?? []).length, 2, 'ribbons contain only outline and solid color');
        assert.doesNotMatch(ribbon!, /stroke-dash|<circle|<ellipse/);
      }
    }
    assert.doesNotMatch(markup({...props, ornaments: false}, 45), /polygon-shake/);
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
