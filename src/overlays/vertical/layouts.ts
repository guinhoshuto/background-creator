import {allCorners, type CornerRect, type Corners} from './geometry';

/**
 * The vertical kind's layouts (owner's spec §4.2) as data: transparent windows on the
 * 1080×1920 screen, each a rect with a radius per corner. The kept layouts sit on the LIVE grid
 * (owner, 2026-11-25 and 2026-11-26), the 16:9 kits' spacing: 40 px at the sides and 24 px between
 * the drawn frames, with the single window's top at y 210 and the stacked camera's at y 98. Radius 56
 * for blocks, half the width for the pill and 200 for the arcs under the chat block. The two
 * discarded layouts keep the spec's own margins (§4.1).
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

/**
 * The four standard variants a themed look ships (owner, 2026-11-26), shared by presets, packs and
 * review jobs: camera and game stacked, regular or compact, and one window, a pill or rounded.
 * `id` is the file suffix the buyer sees.
 */
export const STANDARD_LAYOUT_VARIANTS = [
  {id: 'camera-game', layout: 'three-blocks', label: 'Camera and game / regular gap'},
  {id: 'camera-game-compact', layout: 'three-blocks-compact', label: 'Camera and game / compact gap'},
  {id: 'single-pill', layout: 'single-stadium', label: 'Single window / pill'},
  {id: 'single-rounded', layout: 'single-rounded', label: 'Single window / rounded corners'},
] as const;
export const STANDARD_LAYOUT_IDS = STANDARD_LAYOUT_VARIANTS.map(({layout}) => layout) as [
  'three-blocks', 'three-blocks-compact', 'single-stadium', 'single-rounded',
];
export const VERTICAL_LAYOUT_IDS = ['single-stadium', 'single-rect', 'three-blocks', 'phone-game-bubble',
  'three-blocks-compact', 'single-rounded'] as const;

/**
 * The LIVE grid (owner, 2026-11-25), spaced like the 16:9 kits' stream grid (src/stream-grid.ts):
 * 40 px from the screen's sides and 24 px between the drawn frames, not the windows. The frame it
 * was set on is Prismatic Pop's 19 px ink (`PRISMATIC_RING_EXTENT`), the thickest vertical frame; the
 * shared 13 px ring shows a few px more gutter, as a thinner kit does on the grid. The game is the
 * biggest 16:9 at that width (1000×562.5, even: 562) and ends at y 1284 as before, so the native
 * comments' keep-clear zone sees what it saw before. The camera is the game's twin (owner,
 * 2026-11-26): 16:9, as wide and as tall as the game and rounded like it. Two of them and the regular
 * gap above y 1284 put the top at y 98, under the app's host card and viewers: the owner took that
 * for a camera this size, after the 400 px square of 2026-11-25 read too small. The compact variant
 * fuses the two frames: 24 px between the windows, the camera unchanged and the game moved up.
 */
export const STACKED_SIDE = 40;
export const STACKED_GUTTER = 24;
export const STACKED_FRAME_REACH = 19;
export const STACKED_WIDTH = 1080 - 2 * STACKED_SIDE;
export const STACKED_GAME_HEIGHT = 562;
const STACKED_GAME_BOTTOM = 1284;
const STACKED_CHAT_BOTTOM = 1760;
/** Camera/game sizes and chat position stay fixed; only the raw gap varies. */
export const STACKED_REGULAR_GAP = STACKED_GUTTER + 2 * STACKED_FRAME_REACH;
export const STACKED_COMPACT_GAP = STACKED_GUTTER;
export const STACKED_CAMERA_HEIGHT = STACKED_GAME_HEIGHT;
export const STACKED_TOP = STACKED_GAME_BOTTOM - STACKED_GAME_HEIGHT - STACKED_REGULAR_GAP - STACKED_CAMERA_HEIGHT;
export const STACKED_RADIUS = 56;
const STACKED_CHAT_TOP = STACKED_GAME_BOTTOM + STACKED_REGULAR_GAP;
const stackedLayout = (id: string, label: string, compact: boolean): VerticalLayout => ({
  id, label, use: 'PC gameplay',
  windows: [
    block('camera', 'camera', STACKED_SIDE, STACKED_TOP, STACKED_WIDTH, STACKED_CAMERA_HEIGHT, STACKED_RADIUS),
    block('game', 'game', STACKED_SIDE, STACKED_TOP + STACKED_CAMERA_HEIGHT + (compact ? STACKED_COMPACT_GAP : STACKED_REGULAR_GAP),
      STACKED_WIDTH, STACKED_GAME_HEIGHT, STACKED_RADIUS),
    block('chat', 'chat', STACKED_SIDE, STACKED_CHAT_TOP, STACKED_WIDTH, STACKED_CHAT_BOTTOM - STACKED_CHAT_TOP, [STACKED_RADIUS, STACKED_RADIUS, 200, 200]),
  ],
  chatModes: ['window', 'panel', 'open'],
});
/**
 * One window on the same grid (owner, 2026-11-26): the grid's 40 px sides, with the top and the
 * height the spec gives one window (§4.1), y 210 to 1520. A pill when the radius is half the width,
 * or the same container with the blocks' radius.
 */
export const SINGLE_TOP = 210;
export const SINGLE_HEIGHT = 1310;
const singleLayout = (id: string, label: string, radius: number): VerticalLayout => ({
  id, label, use: 'chatting and IRL, feed videos',
  windows: [block('camera', 'camera', STACKED_SIDE, SINGLE_TOP, STACKED_WIDTH, SINGLE_HEIGHT, radius)],
  chatModes: ['open'],
});
export type VerticalLayoutId = (typeof VERTICAL_LAYOUT_IDS)[number];

export const VERTICAL_LAYOUTS: Record<VerticalLayoutId, VerticalLayout> = {
  'three-blocks-compact': stackedLayout('three-blocks-compact', 'Three blocks, compact gap', true),
  // A: one window, a pill whose top and bottom are half circles (radius = half the width).
  'single-stadium': singleLayout('single-stadium', 'Single window, pill', STACKED_WIDTH / 2),
  // A, squarer: the same container with the blocks' radius on every corner.
  'single-rounded': singleLayout('single-rounded', 'Single window, rounded corners', STACKED_RADIUS),
  // A: one window with square corners.
  'single-rect': {
    id: 'single-rect', label: 'Single window, rectangle', use: 'chatting and IRL, feed videos',
    windows: [block('camera', 'camera', 100, 250, 880, 1230, 0)],
    chatModes: ['open'],
  },
  // B: camera, game and chat stacked: a 16:9 1000×562 camera over its twin, the game.
  'three-blocks': stackedLayout('three-blocks', 'Three blocks: camera, game, chat', false),
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

/**
 * Layouts the owner discarded for every theme on 2026-11-13. Their code stays, so they still
 * render, but they go into no new proposal or pack unless the owner asks for one by name:
 * `planPack` refuses an item on one of them unless the manifest names it in `discardedLayouts`.
 */
export const DISCARDED_LAYOUT_IDS = ['single-rect', 'phone-game-bubble'] as const satisfies readonly VerticalLayoutId[];
export type DiscardedLayoutId = (typeof DISCARDED_LAYOUT_IDS)[number];

export const isDiscardedLayout = (id: string): id is DiscardedLayoutId => (DISCARDED_LAYOUT_IDS as readonly string[]).includes(id);
