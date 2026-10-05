// What `npm run validate:exports` renders, apart from the script so tests read it without rendering:
// one fixture per composition, size and profile, with the defaults, a --props file or every preset a pack ships.
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import type {AssetKind} from '../src/kinds';
import type {OutputFormat} from '../src/settings';
import {canvasOf, sizesForKind, type NamedSize} from '../src/sizes';
import {parsePackManifest} from './pack-plan';

export type Profile = {format: OutputFormat; transparent: boolean; label: string};

/** Backgrounds keep their four historical profiles; overlays are alpha-first plus one flattened MP4. */
export const profilesFor = (kind: AssetKind): Profile[] => kind === 'background'
  ? [
    {format: 'mp4', transparent: true, label: 'flattened'},
    {format: 'webm', transparent: false, label: 'opaque'},
    {format: 'webm', transparent: true, label: 'alpha'},
    {format: 'gif', transparent: true, label: 'flattened'},
  ]
  : [
    {format: 'webm', transparent: true, label: 'alpha'},
    {format: 'mov', transparent: true, label: 'alpha'},
    {format: 'png', transparent: true, label: 'alpha'},
    {format: 'mp4', transparent: true, label: 'flattened'},
  ];

/** A few sizes per sized kind, not every product size: the smallest file and the tallest one. */
export const fixtureSizes = (kind: AssetKind): (NamedSize | null)[] => {
  if (kind === 'background') return [null];
  const sizes = sizesForKind(kind);
  if (sizes.length === 0) return [];
  const area = (size: NamedSize) => canvasOf(size).width * canvasOf(size).height;
  const smallest = sizes.reduce((best, size) => (area(size) < area(best) ? size : best));
  const tallest = sizes.reduce((best, size) => (canvasOf(size).height > canvasOf(best).height ? size : best));
  return smallest === tallest ? [smallest] : [smallest, tallest];
};

/** What the planner needs from one composition; the script wires the real catalog, tests wire fakes. */
export type FixtureAsset = {id: string; kind: AssetKind; defaultProps: Record<string, unknown>; parse: (props: Record<string, unknown>) => unknown};

/** Where the props come from: the defaults (label null), a --props file or a preset, named in the file. */
export type PropsSource = {label: string | null; props: Record<string, unknown>};

/** A composition and a preset some pack ships together. */
export type PresetPair = {composition: string; preset: string; props: Record<string, unknown>};

export type Fixture = {asset: FixtureAsset; size: NamedSize | null; profile: Profile; source: PropsSource; stem: string; file: string};

/** The props of one fixture: fixed seed and colour unless the source sets them, the sample's duration, alpha and size always. */
export const fixtureProps = (fixture: Fixture, durationSeconds: number, sizeProps: (size: NamedSize) => Record<string, unknown>): Record<string, unknown> => ({
  ...fixture.asset.defaultProps, seed: 17, backgroundColor: '#18304C', ...fixture.source.props,
  durationSeconds, transparent: fixture.profile.transparent,
  ...(fixture.size ? sizeProps(fixture.size) : {}),
});

const sourcesFor = (asset: FixtureAsset, options: {props?: PropsSource; presets: boolean; pairs: readonly PresetPair[]}): PropsSource[] => {
  if (options.props) return [options.props];
  if (!options.presets) return [{label: null, props: {}}];
  return options.pairs.filter((pair) => pair.composition === asset.id).map((pair) => ({label: pair.preset, props: pair.props}));
};

/**
 * Every fixture, in render order. Refuses before any render: an unknown --composition and props or
 * presets the composition's schema rejects (strict, so a misspelt key is named).
 */
export const planFixtures = ({assets, kinds, only, composition, props, presets, pairs}: {
  assets: readonly FixtureAsset[]; kinds: readonly AssetKind[]; only?: string; composition?: string;
  props?: PropsSource; presets: boolean; pairs: readonly PresetPair[];
}): Fixture[] => {
  if (composition !== undefined && !assets.some((asset) => asset.id === composition)) {
    throw new Error(`Unknown composition: ${composition}. Options: ${assets.map((asset) => asset.id).join(', ')}.`);
  }
  const fixtures: Fixture[] = [];
  for (const kind of kinds) {
    for (const asset of assets.filter((entry) => entry.kind === kind && (composition === undefined || entry.id === composition))) {
      for (const source of sourcesFor(asset, {props, presets, pairs})) {
        try {
          asset.parse({...asset.defaultProps, ...source.props});
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`${asset.id} refuses ${source.label ?? 'its defaults'}: ${message}`);
        }
        for (const size of fixtureSizes(kind)) {
          for (const profile of profilesFor(kind)) {
            const stem = [asset.id, source.label, size?.id, profile.label].filter(Boolean).join('-');
            const file = `${stem}.${profile.format}`;
            if (only !== undefined && !file.includes(only)) continue;
            fixtures.push({asset, size, profile, source, stem, file});
          }
        }
      }
    }
  }
  if (presets && fixtures.length === 0) throw new Error('No pack ships a preset for what --kind, --composition and --only select.');
  return fixtures;
};

/** Every (composition, preset) pair the manifests in packs/ ship, once each, with the preset's props. */
export const shippedPresetPairs = (root: string): PresetPair[] => {
  const pairs = new Map<string, PresetPair>();
  const packs = readdirSync(path.join(root, 'packs')).filter((file) => file.endsWith('.json')).sort();
  for (const file of packs) {
    const manifest = parsePackManifest(JSON.parse(readFileSync(path.join(root, 'packs', file), 'utf8')));
    for (const item of manifest.items) {
      if (item.preset === undefined) continue;
      const key = `${item.composition}\0${item.preset}`;
      if (pairs.has(key)) continue;
      const props = JSON.parse(readFileSync(path.join(root, 'presets', `${item.preset}.json`), 'utf8')) as Record<string, unknown>;
      pairs.set(key, {composition: item.composition, preset: item.preset, props});
    }
  }
  return [...pairs.values()];
};
