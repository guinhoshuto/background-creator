import type {OutputFormat} from './settings';

/** Every asset kind the studio produces; backgrounds are the original 1920×1080 loops. */
export const ASSET_KINDS = ['background', 'chat', 'block', 'border'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Kinds whose box size comes from props (named sizes or free even sizes). */
export type OverlayKind = Exclude<AssetKind, 'background'>;
export const OVERLAY_KINDS = ASSET_KINDS.filter((kind): kind is OverlayKind => kind !== 'background');

export type KindPolicy = {
  kind: AssetKind;
  /** Studio <Folder> name: Remotion only accepts a-z, A-Z, 0-9 and "-". */
  folder: string;
  /** Name shown by the CLI and the docs. */
  label: string;
  /** Kinds with a fixed canvas have no width/height props at all. */
  fixedSize: {width: number; height: number} | null;
  /** Named size used by the kind's defaults when the size is free. */
  defaultSizeId: string | null;
  transparent: boolean;
  format: OutputFormat;
};

export const kindPolicies: Record<AssetKind, KindPolicy> = {
  background: {
    kind: 'background', folder: 'backgrounds', label: 'Backgrounds',
    fixedSize: {width: 1920, height: 1080}, defaultSizeId: null, transparent: false, format: 'webm',
  },
  chat: {
    kind: 'chat', folder: 'chat', label: 'Chat backgrounds',
    fixedSize: null, defaultSizeId: 'chat-standard', transparent: true, format: 'webm',
  },
  block: {
    kind: 'block', folder: 'text-boxes', label: 'Text boxes',
    fixedSize: null, defaultSizeId: 'card', transparent: true, format: 'webm',
  },
  border: {
    kind: 'border', folder: 'borders', label: 'Borders and frames',
    fixedSize: null, defaultSizeId: 'webcam-16x9', transparent: true, format: 'webm',
  },
};

export const isAssetKind = (value: unknown): value is AssetKind =>
  typeof value === 'string' && (ASSET_KINDS as readonly string[]).includes(value);

export const isOverlayKind = (kind: AssetKind): kind is OverlayKind => kind !== 'background';

export const getKindPolicy = (kind: string): KindPolicy => {
  if (!isAssetKind(kind)) throw new Error(`Tipo desconhecido: ${kind}. Opções: ${ASSET_KINDS.join(', ')}.`);
  return kindPolicies[kind];
};

