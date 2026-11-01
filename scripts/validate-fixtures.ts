// What `npm run validate:exports` renders, apart from the script so tests read it without rendering:
// one fixture per composition, size and profile, with the defaults, a --props file or every preset a pack ships.
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {assetCatalog} from '../src/catalog';
import type {AssetKind} from '../src/kinds';
import type {OutputFormat} from '../src/settings';
import {canvasOf, sizesForKind, type NamedSize} from '../src/sizes';
import {issuesText, parsePackManifest} from './pack-plan';

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

/**
 * The profiles of a composition whose schema refuses alpha (an opaque scene, as a rendered frame
 * sequence): each format once, opaque, so every file it can export is still read back.
 */
export const opaqueProfiles = (profiles: readonly Profile[]): Profile[] => {
  const seen = new Set<OutputFormat>();
  return profiles.flatMap((profile) => {
    if (seen.has(profile.format)) return [];
    seen.add(profile.format);
    return [{format: profile.format, transparent: false, label: 'opaque'}];
  });
};

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

/** The real catalog as the planner sees it: strict, so a misspelt key is named, with zod's issues on one line. */
export const catalogFixtureAssets = (): FixtureAsset[] => Object.values(assetCatalog).map((asset) => ({
  id: asset.id, kind: asset.kind, defaultProps: asset.defaultProps as Record<string, unknown>,
  parse: (props) => {
    try {
      return asset.schema.strict().parse(props);
    } catch (error) {
      throw error instanceof z.ZodError ? new Error(issuesText(error)) : error;
    }
  },
}));

/** Where the props come from: the defaults (label null), a --props file or a preset, named in the file. */
export type PropsSource = {label: string | null; props: Record<string, unknown>};

/** A composition and a preset some pack ships together. */
export type PresetPair = {composition: string; preset: string; props: Record<string, unknown>};

export type Fixture = {
  asset: FixtureAsset; size: NamedSize | null; profile: Profile; source: PropsSource; stem: string; file: string;
  /** The sample's length: --duration, or the composition's own duration when its schema refuses that. */
  durationSeconds: number;
  /** How the sample bent to the composition's schema (its own duration, opaque), one line each; empty when it did not. */
  notes: readonly string[];
};

/** The props of one fixture: fixed seed and colour unless the source sets them, the sample's duration, alpha and size always. */
export const fixtureProps = (fixture: Fixture, sizeProps: (size: NamedSize) => Record<string, unknown>): Record<string, unknown> => ({
  ...fixture.asset.defaultProps, seed: 17, backgroundColor: '#18304C', ...fixture.source.props,
  durationSeconds: fixture.durationSeconds, transparent: fixture.profile.transparent,
  ...(fixture.size ? sizeProps(fixture.size) : {}),
});

const sourcesFor = (asset: FixtureAsset, options: {props?: PropsSource; presets: boolean; pairs: readonly PresetPair[]}): PropsSource[] => {
  if (options.props) return [options.props];
  if (!options.presets) return [{label: null, props: {}}];
  return options.pairs.filter((pair) => pair.composition === asset.id).map((pair) => ({label: pair.preset, props: pair.props}));
};

/** Why the schema refuses these props, on one line; null when it takes them. */
const refusal = (asset: FixtureAsset, props: Record<string, unknown>): string | null => {
  try {
    asset.parse(props);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/**
 * Every fixture, in render order. Refuses before any render: an unknown --composition and props or
 * presets the composition's schema rejects (strict, so a misspelt key is named). A composition whose
 * schema refuses the sample length (a frame sequence that loops in whole passes) is sampled over its
 * own duration, and one that refuses alpha (an opaque scene) opaque in every format: each goes in the
 * fixture's notes, one line, with the schema's reason.
 */
export const planFixtures = ({assets, kinds, only, composition, props, presets, pairs, durationSeconds}: {
  assets: readonly FixtureAsset[]; kinds: readonly AssetKind[]; only?: string; composition?: string;
  props?: PropsSource; presets: boolean; pairs: readonly PresetPair[]; durationSeconds: number;
}): Fixture[] => {
  if (composition !== undefined && !assets.some((asset) => asset.id === composition)) {
    throw new Error(`Unknown composition: ${composition}. Options: ${assets.map((asset) => asset.id).join(', ')}.`);
  }
  const fixtures: Fixture[] = [];
  for (const kind of kinds) {
    for (const asset of assets.filter((entry) => entry.kind === kind && (composition === undefined || entry.id === composition))) {
      for (const source of sourcesFor(asset, {props, presets, pairs})) {
        const own = {...asset.defaultProps, ...source.props};
        const refused = refusal(asset, own);
        if (refused !== null) throw new Error(`${asset.id} refuses ${source.label ?? 'its defaults'}: ${refused}`);
        const who = source.label === null ? asset.id : `${asset.id} (${source.label})`;
        const notes: string[] = [];
        let sampleSeconds = durationSeconds;
        const lengthRefusal = refusal(asset, {...own, durationSeconds});
        if (lengthRefusal !== null) {
          const ownSeconds = own.durationSeconds;
          if (typeof ownSeconds !== 'number' || !Number.isFinite(ownSeconds) || ownSeconds <= 0) {
            throw new Error(`${who} refuses a ${durationSeconds} s sample (${lengthRefusal}) and has no duration of its own to sample over.`);
          }
          sampleSeconds = ownSeconds;
          notes.push(`${who}: sampled over ${sampleSeconds} s, its own duration, not ${durationSeconds} s: ${lengthRefusal}`);
        }
        const alphaRefusal = refusal(asset, {...own, transparent: true});
        const profiles = alphaRefusal === null ? profilesFor(kind) : opaqueProfiles(profilesFor(kind));
        if (alphaRefusal !== null) notes.push(`${who}: sampled opaque in every format, with no alpha profile: ${alphaRefusal}`);
        for (const size of fixtureSizes(kind)) {
          for (const profile of profiles) {
            const stem = [asset.id, source.label, size?.id, profile.label].filter(Boolean).join('-');
            const file = `${stem}.${profile.format}`;
            if (only !== undefined && !file.includes(only)) continue;
            fixtures.push({asset, size, profile, source, stem, file, durationSeconds: sampleSeconds, notes});
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
