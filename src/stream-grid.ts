/**
 * The stream layout grid of the 16:9 overlay kits (the owner's pick of 2026-11-25, TL-05 and TL-06
 * of the review board `out/review/2026-11-25-twitch-layout/`): on a 1920×1080 scene, a thin even
 * margin and gutter, the biggest 16:9 game window at the top left, a right column with a 4:3 cam
 * over the chat (or a tall chat alone) and a row of three alert bars under the game, as wide as it.
 *
 * Like the two reference layouts it was measured on, the grid spaces the drawn frames, not the
 * boxes: a piece's frame reaches past its box (a window border's band and title bar, the side
 * depth), and GRID_REACH holds how far, per side, in the kit the grid was set on (sticker-pop, a
 * window with a 24 px title bar). A kit with a thinner frame keeps the same boxes and shows a few
 * px more gutter.
 *
 * The layout sizes (`layout-*` in src/sizes.ts) and the qa:kit scenes (scripts/stills-job.ts) read
 * this module. A token change resizes files buyers already have, so tests/stream-grid.test.ts pins
 * the sizes: change them only in a planned round.
 */

/** The tokens, in px of the 1920×1080 scene. */
export const STREAM_GRID = {
  width: 1920,
  height: 1080,
  /** Between the scene's edge and every frame. */
  margin: 40,
  /** Between two frames side by side or one above the other. */
  gutter: 24,
  /** The drawn height of the alert bars under the game. */
  barHeight: 120,
  barCount: 3,
} as const;

export type GridTokens = {width: number; height: number; margin: number; gutter: number; barHeight: number; barCount: number};
export type Sides = {readonly left: number; readonly top: number; readonly right: number; readonly bottom: number};
export type GridRect = {x: number; y: number; width: number; height: number};
export type GridPieceKind = 'border' | 'chat' | 'block';

/**
 * How far each kind's drawn frame reaches past its box, per side (measured on the sticker-pop
 * stills of 2026-11-23): the window border's 12 px band, its title bar above (42 with the band)
 * and its side depth right and below (22); the chat's and the block's depth (10 and 8).
 */
export const GRID_REACH: Readonly<Record<GridPieceKind, Sides>> = {
  border: {left: 12, top: 42, right: 22, bottom: 22},
  chat: {left: 0, top: 0, right: 10, bottom: 10},
  block: {left: 0, top: 0, right: 8, bottom: 8},
};

/** A piece of the grid: its box (what OBS receives, the file minus its bleed) and its drawn frame. */
export type GridSlot = {kind: GridPieceKind; box: GridRect; frame: GridRect};

export type StreamGrid = {
  game: GridSlot;
  /** The right column, margin to margin. */
  column: GridRect;
  cam: GridSlot;
  /** The chat under the cam. */
  chat: GridSlot;
  /** The chat alone in the column. */
  chatTall: GridSlot;
  bars: GridSlot[];
};

const slotFromFrame = (kind: GridPieceKind, frame: GridRect, reach: Readonly<Record<GridPieceKind, Sides>>): GridSlot => {
  const r = reach[kind];
  return {
    kind, frame,
    box: {x: frame.x + r.left, y: frame.y + r.top, width: frame.width - r.left - r.right, height: frame.height - r.top - r.bottom},
  };
};

const slotFromBox = (kind: GridPieceKind, box: GridRect, reach: Readonly<Record<GridPieceKind, Sides>>): GridSlot => {
  const r = reach[kind];
  return {
    kind, box,
    frame: {x: box.x - r.left, y: box.y - r.top, width: box.width + r.left + r.right, height: box.height + r.top + r.bottom},
  };
};

/**
 * The grid's pieces. The game's frame takes the height the margins, the bar row and its gutter
 * leave, and its window is the biggest 16:9 with even sides inside it (a multiple of 32×18); the
 * column takes the width that is left. The cam fills the column's width at 4:3, its height rounded
 * up to even; the chat takes the rest of the column. The bars split the game's width with the
 * gutter between them, each an even width, and the gaps absorb the remainder so the row ends on the
 * game's frame.
 */
export const streamGrid = (tokens: GridTokens = STREAM_GRID, reach: Readonly<Record<GridPieceKind, Sides>> = GRID_REACH): StreamGrid => {
  const {width, height, margin, gutter, barHeight, barCount} = tokens;
  const rb = reach.border;
  const right = width - margin;
  const bottom = height - margin;
  const barTop = bottom - barHeight;
  const gameFrameHeight = barTop - gutter - margin;
  const windowHeight = Math.floor((gameFrameHeight - rb.top - rb.bottom) / 18) * 18;
  const game = slotFromBox('border', {x: margin + rb.left, y: margin + rb.top, width: (windowHeight / 9) * 16, height: windowHeight}, reach);
  const gameRight = game.frame.x + game.frame.width;
  const column = {x: gameRight + gutter, y: margin, width: right - gameRight - gutter, height: bottom - margin};
  const camWidth = 2 * Math.floor((column.width - rb.left - rb.right) / 2);
  const cam = slotFromBox('border', {x: column.x + rb.left, y: margin + rb.top, width: camWidth, height: 2 * Math.ceil((camWidth * 3) / 8)}, reach);
  const chatTop = cam.frame.y + cam.frame.height + gutter;
  const chat = slotFromFrame('chat', {x: column.x, y: chatTop, width: column.width, height: bottom - chatTop}, reach);
  const chatTall = slotFromFrame('chat', {...column}, reach);
  const rowWidth = game.frame.width;
  const barWidth = 2 * Math.floor((rowWidth - (barCount - 1) * gutter) / barCount / 2);
  const gap = barCount > 1 ? (rowWidth - barCount * barWidth) / (barCount - 1) : 0;
  const bars = Array.from({length: barCount}, (_, index) =>
    slotFromFrame('block', {x: Math.round(margin + index * (barWidth + gap)), y: barTop, width: barWidth, height: barHeight}, reach));
  return {game, column, cam, chat, chatTall, bars};
};

/** The grid of the 16:9 kits, as the owner approved it. */
export const STREAM_LAYOUT = streamGrid();

/**
 * The named sizes the grid asks for (src/sizes.ts), by id: the game window, the column's cam, the
 * chat under it, the tall chat and an alert bar. Boxes, as every named size.
 */
export const LAYOUT_SIZES = {
  'layout-game': {kind: 'border', width: STREAM_LAYOUT.game.box.width, height: STREAM_LAYOUT.game.box.height},
  'layout-cam': {kind: 'border', width: STREAM_LAYOUT.cam.box.width, height: STREAM_LAYOUT.cam.box.height},
  'layout-chat': {kind: 'chat', width: STREAM_LAYOUT.chat.box.width, height: STREAM_LAYOUT.chat.box.height},
  'layout-chat-tall': {kind: 'chat', width: STREAM_LAYOUT.chatTall.box.width, height: STREAM_LAYOUT.chatTall.box.height},
  'layout-bar': {kind: 'block', width: STREAM_LAYOUT.bars[0]!.box.width, height: STREAM_LAYOUT.bars[0]!.box.height},
} as const;

/**
 * How far a layout piece's ornaments may reach past its outline (`ornamentReach`) on the sides that
 * face another piece across a gutter: half the gutter, so two pieces side by side never touch,
 * whichever of them carries ornaments.
 */
export const LAYOUT_ORNAMENT_REACH = STREAM_GRID.gutter / 2;

export type GridSide = 'left' | 'top' | 'right' | 'bottom';
const SIDES: readonly GridSide[] = ['left', 'top', 'right', 'bottom'];

/** Whether the slot's frame sits on the scene's margin on that side. */
const onMargin = (slot: GridSlot, side: GridSide, tokens: GridTokens = STREAM_GRID) => {
  const {frame} = slot;
  if (side === 'left') return frame.x === tokens.margin;
  if (side === 'top') return frame.y === tokens.margin;
  if (side === 'right') return frame.x + frame.width === tokens.width - tokens.margin;
  return frame.y + frame.height === tokens.height - tokens.margin;
};

const LAYOUT_SLOTS: Record<keyof typeof LAYOUT_SIZES, GridSlot[]> = {
  'layout-game': [STREAM_LAYOUT.game], 'layout-cam': [STREAM_LAYOUT.cam], 'layout-chat': [STREAM_LAYOUT.chat],
  'layout-chat-tall': [STREAM_LAYOUT.chatTall], 'layout-bar': STREAM_LAYOUT.bars,
};

/**
 * The sides of each layout size that face the scene's outer margin in every slot it takes
 * (`ornamentOpenSides`, set by the size itself): there its ornaments keep their full size, in the
 * bleed and the margin (owner, 2026-11-25); the other sides face a neighbour across a gutter and
 * take LAYOUT_ORNAMENT_REACH. The bar serves three slots, so only the bottom is open to all of them.
 */
export const LAYOUT_OPEN_SIDES = Object.fromEntries(Object.entries(LAYOUT_SLOTS).map(([id, slots]) =>
  [id, SIDES.filter((side) => slots.every((slot) => onMargin(slot, side)))])) as Record<keyof typeof LAYOUT_SIZES, GridSide[]>;

/** One overlay of a scene: a named size (and the pack variant, when not the ornamented piece) at its box's top-left corner. */
export type SceneLayer = {size: string; variant?: string; x: number; y: number};
export type StreamScene = {out: string; layers: SceneLayer[]};

const at = (size: keyof typeof LAYOUT_SIZES, slot: GridSlot, variant?: string): SceneLayer =>
  ({size, ...(variant === undefined ? {} : {variant}), x: slot.box.x, y: slot.box.y});

/**
 * The qa:kit scenes on the grid. One piece keeps its ornaments, the big window (the game, or the
 * camera of a Just Chatting stream), whose star faces the margin at full size, and the others are
 * plain, so a scene never stacks ornaments on every frame.
 */
export const GRID_SCENES: StreamScene[] = [
  {out: 'mock-chatting', layers: [
    at('layout-game', STREAM_LAYOUT.game), at('layout-chat-tall', STREAM_LAYOUT.chatTall, 'plain'),
    ...STREAM_LAYOUT.bars.map((bar) => at('layout-bar', bar, 'plain')),
  ]},
  {out: 'mock-gameplay', layers: [
    at('layout-game', STREAM_LAYOUT.game), at('layout-cam', STREAM_LAYOUT.cam, 'plain'), at('layout-chat', STREAM_LAYOUT.chat, 'plain'),
    ...STREAM_LAYOUT.bars.map((bar) => at('layout-bar', bar, 'plain')),
  ]},
];
