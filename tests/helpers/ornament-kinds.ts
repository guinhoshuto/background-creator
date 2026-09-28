import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BlockFrame, blockLoopSchema, getBlockLayers, getBlockLayout, getBlockScene} from '../../src/overlays/block';
import {BorderFrame, borderLoopSchema, getBorderGeometry, getBorderSceneParts, getBorderScene} from '../../src/overlays/border';
import {ChatFrame, chatLoopSchema, getChatLayers, getChatLayout, getChatScene} from '../../src/overlays/chat';
import type {FlashElement, OrnamentElement, OrnamentLayout, OrnamentStyle} from '../../src/overlays/shared';
import {getCompositionMetadata} from '../../src/settings';
import {sizeProps, sizesForKind, type NamedSize} from '../../src/sizes';
import type {Scene} from './scene-scans';

/**
 * One adapter per overlay kind, so the ornament harness (helpers/ornament-harness.ts) runs the same
 * checks on chat, block and border: parse, the ornament layout, the ornament and flash layers of a
 * frame, the full flat scene and the rendered markup.
 */

export type OrnamentKindName = 'chat' | 'block' | 'border';
export type OrnamentProps = OrnamentStyle & Record<string, unknown> & {bleed: number; width: number; height: number};

type Issue = {path: PropertyKey[]; message: string};

export type OrnamentKindAdapter = {
  kind: OrnamentKindName;
  sizes: NamedSize[];
  /** Strict parse (throws on unknown keys or a refusal). */
  parse: (input: Record<string, unknown>) => OrnamentProps;
  /** Strict parse's issues, [] when accepted. */
  issues: (input: Record<string, unknown>) => Issue[];
  ornamentLayout: (props: OrnamentProps) => OrnamentLayout;
  /** The layout's outset (a border's frame layout). */
  outset: (props: OrnamentProps) => number;
  layers: (props: OrnamentProps, frame: number, durationInFrames: number) => {back: OrnamentElement[]; front: OrnamentElement[]; flash: FlashElement[]};
  scene: (props: OrnamentProps, frame: number, durationInFrames: number) => Scene;
  render: (props: OrnamentProps, frame: number, durationInFrames?: number) => string;
  /** The kind's preset of a theme, as JSON. */
  preset: (theme: string) => Record<string, unknown>;
};

const readPreset = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../../presets/${name}.json`, import.meta.url), 'utf8')) as Record<string, unknown>;

const issuesOf = (result: {success: boolean; error?: {issues: Issue[]}}) => (result.success ? [] : result.error!.issues);

export const ORNAMENT_KINDS: Record<OrnamentKindName, OrnamentKindAdapter> = {
  chat: {
    kind: 'chat',
    sizes: sizesForKind('chat'),
    parse: (input) => chatLoopSchema.strict().parse(input) as OrnamentProps,
    issues: (input) => issuesOf(chatLoopSchema.strict().safeParse(input)),
    ornamentLayout: (props) => getChatLayout(props as never).ornamentLayout,
    outset: (props) => getChatLayout(props as never).outset,
    layers: (props, frame, n) => {
      const layers = getChatLayers(props as never, frame, n);
      return {back: layers.ornamentBack, front: layers.ornamentFront, flash: layers.flash};
    },
    scene: (props, frame, n) => getChatScene(props as never, frame, n) as unknown as Scene,
    render: (props, frame, n = 480) => renderToStaticMarkup(createElement(ChatFrame, {props: props as never, frame, durationInFrames: n})),
    preset: (theme) => readPreset(`chat-${theme}`),
  },
  block: {
    kind: 'block',
    sizes: sizesForKind('block'),
    parse: (input) => blockLoopSchema.strict().parse(input) as OrnamentProps,
    issues: (input) => issuesOf(blockLoopSchema.strict().safeParse(input)),
    ornamentLayout: (props) => getBlockLayout(props as never).ornamentLayout,
    outset: (props) => getBlockLayout(props as never).outset,
    layers: (props, frame, n) => {
      const layers = getBlockLayers(props as never, frame, n);
      return {back: layers.ornamentBack, front: layers.ornamentFront, flash: layers.flash};
    },
    scene: (props, frame, n) => getBlockScene(props as never, frame, n) as unknown as Scene,
    render: (props, frame, n = 480) => renderToStaticMarkup(createElement(BlockFrame, {props: props as never, frame, durationInFrames: n})),
    preset: (theme) => readPreset(`block-${theme}`),
  },
  border: {
    kind: 'border',
    sizes: sizesForKind('border'),
    parse: (input) => borderLoopSchema.strict().parse(input) as OrnamentProps,
    issues: (input) => issuesOf(borderLoopSchema.strict().safeParse(input)),
    ornamentLayout: (props) => getBorderGeometry(props as never).ornamentLayout,
    outset: (props) => getBorderGeometry(props as never).layout.outset,
    layers: (props, frame, n) => {
      const parts = getBorderSceneParts(props as never, frame, n);
      return {back: parts.ornamentBack, front: parts.ornamentFront, flash: parts.flash};
    },
    scene: (props, frame, n) => getBorderScene(props as never, frame, n) as unknown as Scene,
    render: (props, frame, n = 480) => renderToStaticMarkup(createElement(BorderFrame, {props: props as never, frame, durationInFrames: n})),
    preset: (theme) => readPreset(`border-${theme}`),
  },
};

export const ORNAMENT_KIND_NAMES = ['chat', 'block', 'border'] as const;

/** The cycle's frame count of an overlay's props. */
export const framesOf = (props: OrnamentProps) => getCompositionMetadata(props as never).durationInFrames;

type PackItems = {items: {sizes?: string[]; props?: Record<string, unknown>; variant?: string}[]};
const packCache = new Map<string, PackItems>();

/**
 * The props of the pack item (packs/<theme>.json) that renders a named size with the kit's
 * ornaments (never a variant such as sem-enfeites); {} when it has none or only a variant has it.
 */
export const packItemProps = (theme: string, sizeId: string): Record<string, unknown> => {
  let pack = packCache.get(theme);
  if (!pack) {
    pack = JSON.parse(readFileSync(new URL(`../../packs/${theme}.json`, import.meta.url), 'utf8')) as PackItems;
    packCache.set(theme, pack);
  }
  return pack.items.find((item) => item.variant === undefined && item.sizes?.includes(sizeId))?.props ?? {};
};

/**
 * The pack item's props at the kit's own px: without the scale of the large frames (ornamentScale
 * and the wider bleed that makes its room).
 */
export const unscaledItemProps = (theme: string, sizeId: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(packItemProps(theme, sizeId)).filter(([key]) => key !== 'bleed' && key !== 'ornamentScale'));

/** The named sizes the theme's pack renders with the kit's ornaments (its items without a variant). */
export const kitSizeIds = (theme: string): string[] => {
  packItemProps(theme, '');
  return packCache.get(theme)!.items.filter((item) => item.variant === undefined).flatMap((item) => item.sizes ?? []);
};

/**
 * A kit at a named size as its pack renders it (scripts/pack-plan.ts: preset < item props < size,
 * the item's bleed over the size's), then `extra`: the raw input, for the kind's parse.
 */
export const kitProps = (theme: string, size: NamedSize, extra: Record<string, unknown> = {}): Record<string, unknown> => {
  const item = packItemProps(theme, size.id);
  const bleed = item.bleed === undefined ? {} : {bleed: item.bleed};
  return {...ORNAMENT_KINDS[size.kind as OrnamentKindName].preset(theme), ...item, ...sizeProps(size), ...bleed, ...extra};
};
