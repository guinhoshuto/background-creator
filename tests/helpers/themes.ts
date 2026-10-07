/**
 * The overlay themes the tests loop over: each has presets/{chat,block,border}-<theme>.json and
 * packs/<theme>.json, all mandatory (a missing file fails the tests). The four original themes use
 * no ornaments nor lightning; each Halloween kit theme is named `halloween-<set>` and wears that
 * ornament set.
 */

export const CLASSIC_THEMES = ['neon', 'pastel', 'glass', 'halloween'] as const;
export const KIT_THEMES = ['halloween-midnight', 'halloween-haunted-mansion', 'halloween-haunted-interior', 'halloween-cobweb'] as const;
export type ClassicTheme = (typeof CLASSIC_THEMES)[number];
export type KitTheme = (typeof KIT_THEMES)[number];
export type OverlayTheme = ClassicTheme | KitTheme;

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

/** Packs of backgrounds only, sold apart from the kits: `halloween-backgrounds` holds the four kits' backgrounds. */
export const BACKGROUND_PACKS = ['halloween-backgrounds'] as const;

/** packs/*.json the file list must hold, sorted: every theme's pack and every background pack, exactly. */
export const expectedPackFiles = (): string[] => [...OVERLAY_THEMES, ...BACKGROUND_PACKS].map((name) => `${name}.json`).sort();
