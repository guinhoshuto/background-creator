import {allCorners, type CornerRect, type Corners} from './geometry';

/**
 * The vertical kind's layouts (owner's spec §4.2) as data: transparent windows on the
 * 1080×1920 screen, each a rect with a radius per corner. Margins (§4.1): 110 px at the sides,
 * 210 px on top for one window and 260 px for the LIVE layouts (below the host card), 56 px
 * between blocks, radius 56 for blocks and 200 for the arcs that echo the oval window.
 */

/** What goes behind a window: the camera, the game capture or a chat widget. */
export type WindowRole = 'camera' | 'game' | 'chat';

/**
 * How a layout's chat block is drawn (spec names in brackets): `window` [overlay], a transparent
 * window for a chat widget placed behind (multistream); `panel` [chat-painel], an opaque panel the
 * app's native comments are drawn over; `open` [chat-livre], neither frame nor panel, only the
 * background: the default, for who streams to the one app only.
 */
export const CHAT_MODES = ['window', 'panel', 'open'] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

export type LayoutWindow = CornerRect & {readonly id: string; readonly role: WindowRole};

export type VerticalLayout = {
  readonly id: string;
  readonly label: string;
  readonly use: string;
  /** Every block, the chat block included; `windowsOf` picks the transparent ones for a chat mode. */
  readonly windows: readonly LayoutWindow[];
  /** The chat modes it accepts: a layout without a chat block only has `open`. */
  readonly chatModes: readonly ChatMode[];
};

const block = (id: string, role: WindowRole, x: number, y: number, width: number, height: number, radii: Corners | number): LayoutWindow =>
  ({id, role, x, y, width, height, radii: typeof radii === 'number' ? allCorners(radii) : radii});

export const VERTICAL_LAYOUT_IDS = ['single-stadium', 'single-rect', 'three-blocks', 'phone-game-bubble'] as const;
export type VerticalLayoutId = (typeof VERTICAL_LAYOUT_IDS)[number];

export const VERTICAL_LAYOUTS: Record<VerticalLayoutId, VerticalLayout> = {
  // A: one window, a pill whose top and bottom are half circles (radius = half the width).
  'single-stadium': {
    id: 'single-stadium', label: 'Single window, pill', use: 'chatting and IRL, feed videos',
    windows: [block('camera', 'camera', 110, 210, 860, 1310, 430)],
    chatModes: ['open'],
  },
  // A: one window with square corners.
  'single-rect': {
    id: 'single-rect', label: 'Single window, rectangle', use: 'chatting and IRL, feed videos',
    windows: [block('camera', 'camera', 100, 250, 880, 1230, 0)],
    chatModes: ['open'],
  },
  // B: camera, game and chat stacked, 16:9 blocks 860×484 with 56 px between them.
  'three-blocks': {
    id: 'three-blocks', label: 'Three blocks: camera, game, chat', use: 'PC gameplay',
    windows: [
      block('camera', 'camera', 110, 260, 860, 484, [200, 200, 56, 56]),
      block('game', 'game', 110, 800, 860, 484, 56),
      block('chat', 'chat', 110, 1340, 860, 420, [56, 56, 200, 200]),
    ],
    chatModes: ['window', 'panel', 'open'],
  },
  // C: a 9:16 phone game and the camera in a round bubble.
  // Deviation from the spec: its game is 760×1351, an odd height; every pixel size here is even
  // (Remotion rounds odd H.264 sizes down), so the window is 1352 tall, ending at y 1612.
  'phone-game-bubble': {
    id: 'phone-game-bubble', label: 'Phone game and camera bubble', use: 'mobile gameplay',
    windows: [
      block('game', 'game', 160, 260, 760, 1352, 56),
      block('camera', 'camera', 60, 1360, 300, 300, 150),
    ],
    chatModes: ['open'],
  },
};

export const getVerticalLayout = (id: string): VerticalLayout => {
  if (!(VERTICAL_LAYOUT_IDS as readonly string[]).includes(id)) {
    throw new Error(`Unknown layout: ${id}. Options: ${VERTICAL_LAYOUT_IDS.join(', ')}.`);
  }
  return VERTICAL_LAYOUTS[id as VerticalLayoutId];
};

/** The transparent windows for a chat mode: the chat block is one only in `window` mode. */
export const windowsOf = (layout: VerticalLayout, chatMode: ChatMode): LayoutWindow[] =>
  layout.windows.filter((window) => window.role !== 'chat' || chatMode === 'window');

/** The opaque chat panel, in `panel` mode only; null otherwise. */
export const panelOf = (layout: VerticalLayout, chatMode: ChatMode): LayoutWindow | null =>
  (chatMode === 'panel' ? layout.windows.find((window) => window.role === 'chat') ?? null : null);

/** Every layout with every chat mode it accepts, in table order. */
export const layoutModes = (): {layout: VerticalLayout; chatMode: ChatMode}[] =>
  VERTICAL_LAYOUT_IDS.flatMap((id) => VERTICAL_LAYOUTS[id].chatModes.map((chatMode) => ({layout: VERTICAL_LAYOUTS[id], chatMode})));
