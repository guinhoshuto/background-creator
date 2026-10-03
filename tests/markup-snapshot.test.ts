import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {after, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createElement, type ComponentType, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Internals} from 'remotion';
import {parsePackManifest, planPack, realPackDeps, type PlannedFile} from '../scripts/pack-plan';
import {CobwebFrame, CobwebLoop, cobwebLoopSchema, getCobwebScene} from '../src/backgrounds/CobwebLoop';
import {getHalloweenScene, HalloweenLoop, halloweenLoopSchema} from '../src/backgrounds/HalloweenLoop';
import {
  getActiveStrike, getHauntedInteriorScene, HauntedInteriorLoop, hauntedInteriorLoopSchema, HauntedInteriorPicture,
} from '../src/backgrounds/HauntedInteriorLoop';
import {getHauntedMansionScene, HauntedMansionLoop, hauntedMansionLoopSchema} from '../src/backgrounds/HauntedMansionLoop';
import {getAsset} from '../src/catalog';
import {BlockFrame} from '../src/overlays/block';
import {BorderFrame} from '../src/overlays/border';
import {ChatFrame} from '../src/overlays/chat';
import {getCompositionMetadata} from '../src/settings';

/**
 * Regression guard for drawings: one hash per scene and per rendered markup, compared with the
 * versioned baseline in tests/__snapshots__/markup.json. Any change to what a background or a pack
 * file draws (shape, colour, placement, motion) fails here, naming the entries that changed.
 *
 * Covered:
 *   - the four Halloween backgrounds: their scene (JSON) at frames 0, 37, 137, 211 and N−1 with
 *     the defaults and their preset, and their markup at frames 0 and 137, transparent and opaque;
 *   - every file of every pack in packs/ (what the buyer gets): its markup at frames 0 and 123
 *     (one format per file name, masks at frame 0), with the props the pack plan exports.
 *
 * An intended change regenerates the baseline, and the diff of markup.json goes in the same commit:
 *   UPDATE_SNAPSHOTS=1 npx tsx --test tests/markup-snapshot.test.ts
 *
 * Ported from the Halloween kits' hash-backgrounds guard (BGC-11), which lived in a gitignored folder.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join(ROOT, 'tests', '__snapshots__', 'markup.json');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';
const UPDATE_COMMAND = 'UPDATE_SNAPSHOTS=1 npx tsx --test tests/markup-snapshot.test.ts';

/** 64 bits of sha256: plenty to tell drawings apart, and short enough for a readable baseline diff. */
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);

const readJson = (relative: string) => JSON.parse(readFileSync(path.join(ROOT, relative), 'utf8')) as Record<string, unknown>;

const baseline: Record<string, string> = existsSync(BASELINE_FILE)
  ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Record<string, string>
  : {};
const current: Record<string, string> = {};

type AnyProps = Record<string, unknown>;
type Schema = {parse: (input: unknown) => AnyProps};
type SceneFn = (props: AnyProps, frame: number, durationInFrames: number) => unknown;

/**
 * Renders a component that calls useCurrentFrame/useVideoConfig at `frame`, inside the minimum
 * Remotion context those hooks read (one composition, the timeline at `frame`).
 */
const withRemotion = (component: ComponentType<AnyProps>, props: AnyProps, frame: number, durationInFrames: number, fps: number) => {
  const id = 'markup-snapshot';
  const width = 1920;
  const height = 1080;
  const composition = {
    id, component, defaultProps: {}, width, height, fps, durationInFrames, nonce: 0, folderName: null,
    parentFolderName: null, schema: null, calculateMetadata: null,
  };
  const metadata = {
    width, height, fps, durationInFrames, props, defaultCodec: null, defaultOutName: null,
    defaultVideoImageFormat: null, defaultPixelFormat: null, defaultProResProfile: null, defaultSampleRate: null,
  };
  const manager = {
    compositions: [composition], folders: [], currentCompositionMetadata: metadata, canvasContent: {type: 'composition', compositionId: id},
    currentAssetMetadata: null,
  };
  const timeline = {
    frame: {[id]: frame}, playing: false, rootId: '', playbackRate: 1, imperativePlaying: {current: false},
    setPlaybackRate: () => undefined, audioAndVideoTags: {current: []}, isInsideFreeze: false,
  };
  const internals = Internals as unknown as Record<string, {Provider: ComponentType<{value: unknown; children?: ReactNode}>}> & {
    CanUseRemotionHooksProvider: ComponentType<{children?: ReactNode}>;
  };
  return renderToStaticMarkup(
    createElement(internals.CompositionManager!.Provider, {value: manager},
      createElement(internals.TimelineContext!.Provider, {value: timeline},
        createElement(internals.CanUseRemotionHooksProvider, null, createElement(component, props)))),
  );
};

/** Hashes the entries, records them, and fails with the names that differ from the baseline. */
const check = (entries: readonly [name: string, value: () => string][]) => {
  const changed: string[] = [];
  for (const [name, value] of entries) {
    assert.ok(!(name in current), `two entries are named "${name}"`);
    current[name] = hash(value());
    if (!UPDATE && baseline[name] !== current[name]) changed.push(`${name in baseline ? 'changed' : 'new (no baseline)'}: ${name}`);
  }
  assert.deepEqual(changed, [], `${changed.length} drawing(s) differ from tests/__snapshots__/markup.json. `
    + `If the change is intended, regenerate the baseline and commit its diff: ${UPDATE_COMMAND}`);
};

const HALLOWEEN_BACKGROUNDS: {name: string; schema: Schema; scene: SceneFn; preset: string; render: (p: AnyProps, f: number, n: number, fps: number) => string}[] = [
  {
    name: 'HalloweenLoop', schema: halloweenLoopSchema as unknown as Schema, scene: getHalloweenScene as unknown as SceneFn,
    preset: 'presets/halloween-midnight.json',
    render: (p, f, n, fps) => withRemotion(HalloweenLoop as unknown as ComponentType<AnyProps>, p, f, n, fps),
  },
  {
    name: 'HauntedMansionLoop', schema: hauntedMansionLoopSchema as unknown as Schema, scene: getHauntedMansionScene as unknown as SceneFn,
    preset: 'presets/halloween-haunted-mansion.json',
    render: (p, f, n, fps) => withRemotion(HauntedMansionLoop as unknown as ComponentType<AnyProps>, p, f, n, fps),
  },
  {
    name: 'HauntedInteriorLoop', schema: hauntedInteriorLoopSchema as unknown as Schema, scene: getHauntedInteriorScene as unknown as SceneFn,
    preset: 'presets/halloween-haunted-interior.json',
    render: (p, f, n, fps) => {
      const picture = HauntedInteriorPicture as unknown as ComponentType<AnyProps>;
      const scene = (getHauntedInteriorScene as unknown as SceneFn)(p, f, n);
      const strike = (getActiveStrike as unknown as SceneFn)(p, f, n);
      // The picture pins the drawing; the hook component pins the Canvas wrapper around it.
      return renderToStaticMarkup(createElement(picture, {props: p, scene, strike}))
        + withRemotion(HauntedInteriorLoop as unknown as ComponentType<AnyProps>, p, f, n, fps);
    },
  },
  {
    name: 'CobwebLoop', schema: cobwebLoopSchema as unknown as Schema, scene: getCobwebScene as unknown as SceneFn,
    preset: 'presets/halloween-cobweb.json',
    render: (p, f, n, fps) => renderToStaticMarkup(createElement(CobwebFrame as unknown as ComponentType<AnyProps>, {props: p, frame: f, durationInFrames: n}))
      + withRemotion(CobwebLoop as unknown as ComponentType<AnyProps>, p, f, n, fps),
  },
];

for (const background of HALLOWEEN_BACKGROUNDS) {
  test(`markup snapshot: ${background.name}`, () => {
    const entries: [string, () => string][] = [];
    for (const [label, input] of [['defaults', {}], ['preset', readJson(background.preset)]] as const) {
      const props = background.schema.parse(input);
      const {durationInFrames: n} = getCompositionMetadata(props as Parameters<typeof getCompositionMetadata>[0]);
      for (const frame of [0, 37, 137, 211, n - 1]) {
        entries.push([`${background.name} ${label} scene f${frame}`, () => JSON.stringify(background.scene(props, frame, n))]);
      }
    }
    for (const transparent of [true, false]) {
      const props = background.schema.parse({...readJson(background.preset), transparent});
      const {durationInFrames: n, fps} = getCompositionMetadata(props as Parameters<typeof getCompositionMetadata>[0]);
      for (const frame of [0, 137]) {
        entries.push([`${background.name} preset markup transparent=${transparent} f${frame}`, () => background.render(props, frame, n, fps)]);
      }
    }
    check(entries);
  });
}

const OVERLAY_FRAMES: Record<string, ComponentType<{props: never; frame: number; durationInFrames: number}>> = {
  ChatLoop: ChatFrame, BlockLoop: BlockFrame, BorderLoop: BorderFrame,
};

/** One drawing of a pack file: overlays through their pure Frame, backgrounds through their hook component. */
const renderPlanned = (file: PlannedFile, frame: number) => {
  const Frame = OVERLAY_FRAMES[file.composition];
  if (Frame) return renderToStaticMarkup(createElement(Frame, {props: file.exportProps as never, frame, durationInFrames: file.frames}));
  const component = getAsset(file.composition).component as ComponentType<AnyProps>;
  return withRemotion(component, file.exportProps, frame, file.frames, file.fps);
};

const PACKS = readdirSync(path.join(ROOT, 'packs')).filter((name) => name.endsWith('.json')).sort();

for (const packFile of PACKS) {
  test(`markup snapshot: pack ${packFile}`, () => {
    const manifest = parsePackManifest(readJson(`packs/${packFile}`));
    const entries: [string, () => string][] = [];
    const seen = new Set<string>();
    for (const file of planPack(manifest, realPackDeps)) {
      // One format per file name: webm, png and gif of a size draw the same picture.
      const name = file.output.replace(/^out\/packs\//, '').replace(/\.[a-z0-9]+$/, '');
      if (seen.has(name)) continue;
      seen.add(name);
      const frames = file.role === 'mask' ? [0] : [0, 123].filter((frame) => frame < file.frames);
      for (const frame of frames) entries.push([`${name} f${frame}`, () => renderPlanned(file, frame)]);
    }
    assert.ok(entries.length > 0, `${packFile} plans no file`);
    check(entries);
  });
}

test('markup snapshot: the baseline has no stale entries', () => {
  if (UPDATE) return;
  const stale = Object.keys(baseline).filter((name) => !(name in current));
  assert.deepEqual(stale, [], `entries in the baseline that nothing draws any more; regenerate it: ${UPDATE_COMMAND}`);
});

after(() => {
  if (!UPDATE) return;
  mkdirSync(path.dirname(BASELINE_FILE), {recursive: true});
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeFileSync(BASELINE_FILE, `${JSON.stringify(sorted, null, 1)}\n`);
  console.log(`markup snapshot: ${Object.keys(sorted).length} hashes written to ${path.relative(ROOT, BASELINE_FILE)}`);
});
