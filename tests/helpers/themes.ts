import type {OrnamentSetId} from '../../src/overlays/shared';

/**
 * The overlay themes the tests loop over: each has presets/{chat,block,border}-<theme>.json and
 * packs/<theme>.json, all mandatory (a missing file fails the tests). The four original themes use
 * no ornaments nor lightning; each kit theme wears one ornament set (KIT_SETS), whatever its name.
 */

export const CLASSIC_THEMES = ['neon', 'pastel', 'glass', 'halloween'] as const;
export const KIT_THEMES = [
  'halloween-midnight', 'halloween-haunted-mansion', 'halloween-haunted-interior', 'halloween-cobweb', 'vaporwave-horizon',
  'sand-terminal',
] as const;
export type ClassicTheme = (typeof CLASSIC_THEMES)[number];
export type KitTheme = (typeof KIT_THEMES)[number];
export type OverlayTheme = ClassicTheme | KitTheme;

/** The ornament set each kit's presets wear (`ornaments`): one kit per set, one set per kit. */
export const KIT_SETS: Readonly<Record<KitTheme, OrnamentSetId>> = {
  'halloween-midnight': 'midnight',
  'halloween-haunted-mansion': 'haunted-mansion',
  'halloween-haunted-interior': 'haunted-interior',
  'halloween-cobweb': 'cobweb',
  'vaporwave-horizon': 'horizon',
  'sand-terminal': 'terminal',
};

/** The kit theme that wears `set`; a set without its kit fails here, before any harness runs. */
export const kitThemeOf = (set: OrnamentSetId): KitTheme => {
  const themes = KIT_THEMES.filter((theme) => KIT_SETS[theme] === set);
  if (themes.length !== 1) throw new Error(`Ornament set "${set}" is worn by ${themes.length} kit themes (KIT_SETS), not 1.`);
  return themes[0]!;
};

export const PRESET_KINDS = ['chat', 'block', 'border'] as const;
export type PresetKind = (typeof PRESET_KINDS)[number];

/** The themes every overlay, preset and pack test covers. */
export const OVERLAY_THEMES: readonly OverlayTheme[] = [...CLASSIC_THEMES, ...KIT_THEMES];

/** presets/{chat,block,border}-*.json the file list must hold, sorted: every theme's three presets, exactly. */
export const expectedPresetFiles = (): string[] => PRESET_KINDS.flatMap((kind) => OVERLAY_THEMES.map((theme) => `${kind}-${theme}.json`)).sort();

/**
 * Overlay compositions a kit ships as a still PNG only, with no WebM: in Haunted Interior the
 * animated chat and borders added little and aliased badly (owner, 2026-10-07).
 */
export const STATIC_ONLY: Readonly<Partial<Record<KitTheme, readonly string[]>>> = {
  'halloween-haunted-interior': ['ChatLoop', 'BorderLoop'],
};

/** Whether a pack ships that composition as a still PNG only. */
export const isStaticOnly = (pack: string, composition: string): boolean =>
  (STATIC_ONLY[pack as KitTheme] ?? []).includes(composition);

/** WebMs a kit drops for its static-only compositions: chat 5 + 5 sizes, borders 9 + 11 (with and without ornaments). */
export const droppedWebms = (pack: string): number =>
  (STATIC_ONLY[pack as KitTheme] ?? []).reduce((sum, composition) => sum + ({ChatLoop: 5 + 5, BorderLoop: 9 + 11}[composition] ?? 0), 0);

/**
 * Packs of backgrounds only, sold apart from the kits, found by file name, so a new one needs no list:
 * `<name>-backgrounds` (a kit series' backgrounds, like `halloween-backgrounds`, or one print in its palettes,
 * like `galaxy-backgrounds`), `background-<name>` (one standalone background) and `series-<name>` (a series of
 * backgrounds). Every one is 1920×1080, the catalog's size by decision (docs/packs.md).
 */
export const BACKGROUND_PACK_FILE = /^(?:(?:background|series)-[a-z0-9-]+|[a-z0-9-]+-backgrounds)\.json$/;

/** The background packs among `files` (the names in packs/), without `.json`. */
export const backgroundPacksIn = (files: readonly string[]): string[] =>
  files.filter((file) => BACKGROUND_PACK_FILE.test(file)).map((file) => file.slice(0, -'.json'.length));

/**
 * The kits whose backgrounds a background pack sells, in its order; each one's variant is the theme minus
 * `halloween-`. A pack of a background with no kit (galaxy-backgrounds) is absent.
 */
export const BACKGROUND_PACK_KITS: Readonly<Record<string, readonly KitTheme[]>> = {
  'halloween-backgrounds': ['halloween-midnight', 'halloween-haunted-mansion', 'halloween-haunted-interior', 'halloween-cobweb'],
};

/**
 * packs/*.json `files` (the names in packs/) must hold, sorted: every theme's pack, exactly, and the background
 * packs among them (BACKGROUND_PACK_FILE); any other file is unexpected.
 */
export const expectedPackFiles = (files: readonly string[]): string[] =>
  [...new Set([...OVERLAY_THEMES.map((name) => `${name}.json`), ...files.filter((file) => BACKGROUND_PACK_FILE.test(file))])].sort();
