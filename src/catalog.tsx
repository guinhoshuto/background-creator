import {GeometricLoop, geometricLoopSchema} from './backgrounds/GeometricLoop';
import {GradientLoop, gradientLoopSchema} from './backgrounds/GradientLoop';
import {ParticleLoop, particleLoopSchema} from './backgrounds/ParticleLoop';
import {HalloweenLoop, halloweenLoopSchema} from './backgrounds/HalloweenLoop';
import {HauntedMansionLoop, hauntedMansionLoopSchema} from './backgrounds/HauntedMansionLoop';
import {HauntedInteriorLoop, hauntedInteriorLoopSchema} from './backgrounds/HauntedInteriorLoop';
import {KawaiiLoop, kawaiiLoopSchema} from './backgrounds/KawaiiLoop';
import {CobwebLoop, cobwebLoopSchema} from './backgrounds/CobwebLoop';
import {ChristmasLoop, christmasLoopSchema} from './backgrounds/ChristmasLoop';
import {DotGridLoop, dotGridLoopSchema} from './backgrounds/DotGridLoop';
import {CheckerboardLoop, checkerboardLoopSchema} from './backgrounds/CheckerboardLoop';
import {TerminalGridLoop, terminalGridLoopSchema} from './backgrounds/TerminalGridLoop';
import {SunburstLoop, sunburstLoopSchema} from './backgrounds/SunburstLoop';
import {VaporwaveLoop, vaporwaveLoopSchema} from './backgrounds/VaporwaveLoop';
import {WebGLLoop, webglLoopSchema} from './backgrounds/WebGLLoop';
import {WatercolorLoop, watercolorLoopSchema} from './backgrounds/WatercolorLoop';
import {GalaxyLoop, galaxyLoopSchema} from './backgrounds/GalaxyLoop';
import {TokyoFutureLoop, tokyoFutureLoopSchema} from './backgrounds/TokyoFutureLoop';
import {WutheringWavesLoop, wutheringWavesLoopSchema} from './backgrounds/WutheringWavesLoop';
import type {AssetKind} from './kinds';
import {blockCatalogEntry} from './overlays/block';
import {borderCatalogEntry} from './overlays/border';
import {chatCatalogEntry} from './overlays/chat';
import type {AssetLayout} from './overlays/shared/box';
import type {AssetMotion} from './overlays/shared/motion';
import {
  feedUiMockCatalogEntry, liveFrameCatalogEntry, liveUiMockCatalogEntry, safeZoneGuideCatalogEntry,
} from './overlays/vertical';
import {y2kDirectionDraftCatalogEntry} from './overlays/vertical/Y2KDirectionDraft';

/** The 1920×1080 backgrounds: one registry shared by the Studio, renderer, validation, and documentation. */
export const backgroundCatalog = {
  WutheringWavesLoop: {
    id: 'WutheringWavesLoop',
    kind: 'background',
    component: WutheringWavesLoop,
    schema: wutheringWavesLoopSchema,
    defaultProps: wutheringWavesLoopSchema.parse({}),
    gl: 'angle',
  },
  KawaiiLoop: {
    id: 'KawaiiLoop',
    kind: 'background',
    component: KawaiiLoop,
    schema: kawaiiLoopSchema,
    defaultProps: kawaiiLoopSchema.parse({}),
  },
  HalloweenLoop: {
    id: 'HalloweenLoop',
    kind: 'background',
    component: HalloweenLoop,
    schema: halloweenLoopSchema,
    defaultProps: halloweenLoopSchema.parse({}),
  },
  HauntedMansionLoop: {
    id: 'HauntedMansionLoop',
    kind: 'background',
    component: HauntedMansionLoop,
    schema: hauntedMansionLoopSchema,
    defaultProps: hauntedMansionLoopSchema.parse({}),
  },
  HauntedInteriorLoop: {
    id: 'HauntedInteriorLoop',
    kind: 'background',
    component: HauntedInteriorLoop,
    schema: hauntedInteriorLoopSchema,
    defaultProps: hauntedInteriorLoopSchema.parse({}),
  },
  CobwebLoop: {
    id: 'CobwebLoop',
    kind: 'background',
    component: CobwebLoop,
    schema: cobwebLoopSchema,
    defaultProps: cobwebLoopSchema.parse({}),
  },
  ChristmasLoop: {
    id: 'ChristmasLoop',
    kind: 'background',
    component: ChristmasLoop,
    schema: christmasLoopSchema,
    defaultProps: christmasLoopSchema.parse({}),
  },
  SunburstLoop: {
    id: 'SunburstLoop',
    kind: 'background',
    component: SunburstLoop,
    schema: sunburstLoopSchema,
    defaultProps: sunburstLoopSchema.parse({}),
  },
  VaporwaveLoop: {
    id: 'VaporwaveLoop',
    kind: 'background',
    component: VaporwaveLoop,
    schema: vaporwaveLoopSchema,
    defaultProps: vaporwaveLoopSchema.parse({}),
  },
  WebGLLoop: {
    id: 'WebGLLoop',
    kind: 'background',
    component: WebGLLoop,
    schema: webglLoopSchema,
    defaultProps: webglLoopSchema.parse({}),
    // Chrome Headless has no WebGL2 with its default OpenGL backend; ANGLE draws on the GPU.
    // The SVG scenes keep the default backend: ANGLE changes their antialiasing.
    gl: 'angle',
  },
  TokyoFutureLoop: {
    id: 'TokyoFutureLoop',
    kind: 'background',
    component: TokyoFutureLoop,
    schema: tokyoFutureLoopSchema,
    defaultProps: tokyoFutureLoopSchema.parse({}),
    gl: 'angle',
  },
  DotGridLoop: {
    id: 'DotGridLoop',
    kind: 'background',
    component: DotGridLoop,
    schema: dotGridLoopSchema,
    defaultProps: dotGridLoopSchema.parse({}),
  },
  CheckerboardLoop: {
    id: 'CheckerboardLoop',
    kind: 'background',
    component: CheckerboardLoop,
    schema: checkerboardLoopSchema,
    defaultProps: checkerboardLoopSchema.parse({}),
  },
  TerminalGridLoop: {
    id: 'TerminalGridLoop',
    kind: 'background',
    component: TerminalGridLoop,
    schema: terminalGridLoopSchema,
    defaultProps: terminalGridLoopSchema.parse({}),
  },
  GradientLoop: {
    id: 'GradientLoop',
    kind: 'background',
    component: GradientLoop,
    schema: gradientLoopSchema,
    defaultProps: gradientLoopSchema.parse({}),
  },
  ParticleLoop: {
    id: 'ParticleLoop',
    kind: 'background',
    component: ParticleLoop,
    schema: particleLoopSchema,
    defaultProps: particleLoopSchema.parse({}),
  },
  GeometricLoop: {
    id: 'GeometricLoop',
    kind: 'background',
    component: GeometricLoop,
    schema: geometricLoopSchema,
    defaultProps: geometricLoopSchema.parse({}),
  },
  WatercolorLoop: {
    id: 'WatercolorLoop',
    kind: 'background',
    component: WatercolorLoop,
    schema: watercolorLoopSchema,
    defaultProps: watercolorLoopSchema.parse({}),
    // A shader painting: WebGL2 needs ANGLE in Chrome Headless, like WebGLLoop.
    gl: 'angle',
  },
  GalaxyLoop: {
    id: 'GalaxyLoop',
    kind: 'background',
    component: GalaxyLoop,
    schema: galaxyLoopSchema,
    defaultProps: galaxyLoopSchema.parse({}),
    // Drawn whole by one shader: WebGL2 needs ANGLE in Chrome Headless, like WebGLLoop.
    gl: 'angle',
  },
} as const satisfies Record<string, CatalogEntry>;

/**
 * What every registered composition provides. `gl` picks Chrome's OpenGL backend; `getLayout`
 * (sized kinds) reports canvas/box/content/hole for the export sidecar, and `getMotion` the
 * speeds the file actually shows (rounded to whole periods per cycle).
 */
export type CatalogEntry = {
  id: string;
  kind: AssetKind;
  component: unknown;
  schema: unknown;
  defaultProps: Record<string, unknown>;
  gl?: 'angle';
  // Method syntax keeps each entry's own props type assignable here.
  getLayout?(props: never): AssetLayout;
  getMotion?(props: never): AssetMotion;
  /** The props of the still mask that goes with a file (a window border's OBS mask), or null. */
  getMask?(props: never): Record<string, unknown> | null;
  /** A QA aid (an app interface mock), never a product: the pack planner refuses it. */
  qaOnly?: true;
};

export type BackgroundId = keyof typeof backgroundCatalog;
export type Background = (typeof backgroundCatalog)[BackgroundId];

/**
 * The overlay kinds: one parametric composition per sized kind; the vertical kind (fixed
 * 1080×1920) has its frame, its safe-zone guide and two QA-only interface mocks.
 */
export const overlayCatalog = {
  ChatLoop: chatCatalogEntry,
  BlockLoop: blockCatalogEntry,
  BorderLoop: borderCatalogEntry,
  LiveFrameLoop: liveFrameCatalogEntry,
  SafeZoneGuide: safeZoneGuideCatalogEntry,
  LiveUiMock: liveUiMockCatalogEntry,
  FeedUiMock: feedUiMockCatalogEntry,
} as const satisfies Record<string, CatalogEntry>;

/** Temporary, unshipped direction boards; separate from the production overlay registry. */
export const draftCatalog = {
  Y2KDirectionDraft: y2kDirectionDraftCatalogEntry,
} as const satisfies Record<string, CatalogEntry>;

/** Every composition of every kind, including temporary QA direction boards. */
export const assetCatalog = {
  ...backgroundCatalog,
  ...overlayCatalog,
  ...draftCatalog,
} as const satisfies Record<string, CatalogEntry>;

export type AssetId = keyof typeof assetCatalog;
export type Asset = (typeof assetCatalog)[AssetId];

/** The OpenGL backend Chrome needs for a composition; null keeps Chrome's default. */
export const getOpenGlRenderer = (asset: CatalogEntry): 'angle' | null => asset.gl ?? null;

/** The pure layout function of a sized composition; null for backgrounds. */
export const getLayoutOf = (asset: CatalogEntry): ((props: Record<string, unknown>) => AssetLayout) | null =>
  asset.getLayout ? (asset.getLayout as (props: Record<string, unknown>) => AssetLayout) : null;

/** The effective speeds of a sized composition; null for backgrounds. */
export const getMotionOf = (asset: CatalogEntry): ((props: Record<string, unknown>) => AssetMotion) | null =>
  asset.getMotion ? (asset.getMotion as (props: Record<string, unknown>) => AssetMotion) : null;

/** The mask props that go with a composition's file (see CatalogEntry.getMask); null when it has none. */
export const getMaskOf = (asset: CatalogEntry): ((props: Record<string, unknown>) => Record<string, unknown> | null) | null =>
  asset.getMask ? (asset.getMask as (props: Record<string, unknown>) => Record<string, unknown> | null) : null;

/** Whether a composition is a QA aid that never ships (see CatalogEntry.qaOnly). */
export const isQaOnly = (asset: CatalogEntry): boolean => asset.qaOnly === true;

export const getAsset = (id: string): Asset => {
  if (!Object.prototype.hasOwnProperty.call(assetCatalog, id)) {
    throw new Error(`Unknown composition: ${id}. Options: ${Object.keys(assetCatalog).join(', ')}.`);
  }
  return assetCatalog[id as AssetId];
};

export const getBackground = (id: string) => {
  if (!Object.prototype.hasOwnProperty.call(backgroundCatalog, id)) {
    throw new Error(`Unknown background: ${id}. Options: ${Object.keys(backgroundCatalog).join(', ')}.`);
  }
  return backgroundCatalog[id as BackgroundId];
};
