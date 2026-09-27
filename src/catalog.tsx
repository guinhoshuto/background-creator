import {GeometricLoop, geometricLoopSchema} from './backgrounds/GeometricLoop';
import {GradientLoop, gradientLoopSchema} from './backgrounds/GradientLoop';
import {ParticleLoop, particleLoopSchema} from './backgrounds/ParticleLoop';
import {HalloweenLoop, halloweenLoopSchema} from './backgrounds/HalloweenLoop';
import {HauntedMansionLoop, hauntedMansionLoopSchema} from './backgrounds/HauntedMansionLoop';
import {HauntedInteriorLoop, hauntedInteriorLoopSchema} from './backgrounds/HauntedInteriorLoop';
import {KawaiiLoop, kawaiiLoopSchema} from './backgrounds/KawaiiLoop';
import {CobwebLoop, cobwebLoopSchema} from './backgrounds/CobwebLoop';
import {DotGridLoop, dotGridLoopSchema} from './backgrounds/DotGridLoop';
import {CheckerboardLoop, checkerboardLoopSchema} from './backgrounds/CheckerboardLoop';
import {SunburstLoop, sunburstLoopSchema} from './backgrounds/SunburstLoop';
import {VaporwaveLoop, vaporwaveLoopSchema} from './backgrounds/VaporwaveLoop';
import {WebGLLoop, webglLoopSchema} from './backgrounds/WebGLLoop';
import type {AssetKind} from './kinds';
import {blocoCatalogEntry} from './overlays/bloco';
import {bordaCatalogEntry} from './overlays/borda';
import {chatCatalogEntry} from './overlays/chat';
import type {AssetLayout} from './overlays/shared/box';
import type {AssetMotion} from './overlays/shared/motion';

/** The 1920×1080 backgrounds: one registry shared by the Studio, renderer, validation, and documentation. */
export const backgroundCatalog = {
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
};

export type BackgroundId = keyof typeof backgroundCatalog;
export type Background = (typeof backgroundCatalog)[BackgroundId];

/** The sized overlay kinds: one parametric composition each for now; a kind may register more. */
export const overlayCatalog = {
  ChatLoop: chatCatalogEntry,
  BlocoLoop: blocoCatalogEntry,
  BordaLoop: bordaCatalogEntry,
} as const satisfies Record<string, CatalogEntry>;

/** Every composition of every kind: the backgrounds, then the overlays. */
export const assetCatalog = {
  ...backgroundCatalog,
  ...overlayCatalog,
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

export const getAsset = (id: string): Asset => {
  if (!Object.prototype.hasOwnProperty.call(assetCatalog, id)) {
    throw new Error(`Composição desconhecida: ${id}. Opções: ${Object.keys(assetCatalog).join(', ')}.`);
  }
  return assetCatalog[id as AssetId];
};

export const getBackground = (id: string) => {
  if (!Object.prototype.hasOwnProperty.call(backgroundCatalog, id)) {
    throw new Error(`Background desconhecido: ${id}. Opções: ${Object.keys(backgroundCatalog).join(', ')}.`);
  }
  return backgroundCatalog[id as BackgroundId];
};
