/**
 * The overlay themes the tests loop over: each has presets/{chat,bloco,borda}-<theme>.json and
 * packs/<theme>.json, all mandatory (a missing file fails the tests). The four original themes use
 * no ornaments nor lightning; each Halloween kit theme is named `halloween-<set>` and wears that
 * ornament set.
 */

export const CLASSIC_THEMES = ['neon', 'pastel', 'vidro', 'halloween'] as const;
export const KIT_THEMES = ['halloween-noite', 'halloween-mansao', 'halloween-interior', 'halloween-teia'] as const;
export type ClassicTheme = (typeof CLASSIC_THEMES)[number];
export type KitTheme = (typeof KIT_THEMES)[number];
export type OverlayTheme = ClassicTheme | KitTheme;

export const PRESET_KINDS = ['chat', 'bloco', 'borda'] as const;
export type PresetKind = (typeof PRESET_KINDS)[number];

/** The themes every overlay, preset and pack test covers. */
export const OVERLAY_THEMES: readonly OverlayTheme[] = [...CLASSIC_THEMES, ...KIT_THEMES];

/** presets/{chat,bloco,borda}-*.json the file list must hold, sorted: every theme's three presets, exactly. */
export const expectedPresetFiles = (): string[] => PRESET_KINDS.flatMap((kind) => OVERLAY_THEMES.map((theme) => `${kind}-${theme}.json`)).sort();

/** packs/*.json the file list must hold, sorted: every theme's pack, exactly. */
export const expectedPackFiles = (): string[] => OVERLAY_THEMES.map((theme) => `${theme}.json`).sort();
