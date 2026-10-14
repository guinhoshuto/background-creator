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
 * Packs of backgrounds only, sold apart from the kits: `halloween-backgrounds` holds the four Halloween kits'
 * backgrounds, `galaxy-backgrounds` the galaxy print in its three palettes.
 */
export const BACKGROUND_PACKS = ['halloween-backgrounds', 'galaxy-backgrounds'] as const;
export type BackgroundPack = (typeof BACKGROUND_PACKS)[number];

/**
 * The kits whose backgrounds a background pack sells, in its order; each one's variant is the theme minus
 * `halloween-`. A pack of a background with no kit (galaxy-backgrounds) is absent.
 */
export const BACKGROUND_PACK_KITS: Readonly<Partial<Record<BackgroundPack, readonly KitTheme[]>>> = {
  'halloween-backgrounds': ['halloween-midnight', 'halloween-haunted-mansion', 'halloween-haunted-interior', 'halloween-cobweb'],
};

/** packs/*.json the file list must hold, sorted: every theme's pack and every background pack, exactly. */
export const expectedPackFiles = (): string[] => [...OVERLAY_THEMES, ...BACKGROUND_PACKS].map((name) => `${name}.json`).sort();
