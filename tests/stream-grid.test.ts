import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {reachOrnamentFrame} from '../src/overlays/shared/ornaments/frame';
import type {OrnamentFrame} from '../src/overlays/shared/ornaments/types';
import {getSize, sizeProps} from '../src/sizes';
import {
  GRID_REACH, GRID_SCENES, LAYOUT_OPEN_SIDES, LAYOUT_ORNAMENT_REACH, LAYOUT_SIZES, STREAM_GRID, STREAM_LAYOUT, streamGrid,
  type GridRect, type GridSlot,
} from '../src/stream-grid';
import {ORNAMENT_KINDS, type OrnamentKindName} from './helpers/ornament-kinds';

const right = (rect: GridRect) => rect.x + rect.width;
const bottom = (rect: GridRect) => rect.y + rect.height;
const {margin, gutter} = STREAM_GRID;

// Dies with (.cache/twitch-layout/mutations.json): G-1 margin 40 → 48, G-2 the chat's top without the gutter.
test('stream grid: the sizes the owner approved on 2026-11-25 (they reach buyers: change them only in a planned round)', () => {
  assert.deepEqual(
    Object.entries(LAYOUT_SIZES).map(([id, size]) => [id, size.kind, size.width, size.height]),
    [
      ['layout-game', 'border', 1408, 792],
      ['layout-cam', 'border', 340, 256],
      ['layout-chat', 'chat', 364, 646],
      ['layout-chat-tall', 'chat', 364, 990],
      ['layout-bar', 'block', 456, 112],
    ],
  );
  // The named sizes are the grid's boxes.
  for (const [id, size] of Object.entries(LAYOUT_SIZES)) {
    const named = getSize(id);
    assert.deepEqual([named.kind, named.width, named.height], [size.kind, size.width, size.height], id);
  }
  assert.deepEqual(STREAM_GRID, {width: 1920, height: 1080, margin: 40, gutter: 24, barHeight: 120, barCount: 3});
  // The sides on the scene's margin, where the stickers keep their full size; each size sets its own.
  assert.deepEqual(LAYOUT_OPEN_SIDES, {
    'layout-game': ['left', 'top'], 'layout-cam': ['top', 'right'], 'layout-chat': ['right', 'bottom'],
    'layout-chat-tall': ['top', 'right', 'bottom'], 'layout-bar': ['bottom'],
  });
  for (const [id, sides] of Object.entries(LAYOUT_OPEN_SIDES)) assert.deepEqual(getSize(id).props?.ornamentOpenSides, sides, id);
});

// Dies with: G-3 the game window's 16:9 width, G-4 the bar gap, G-5 the cam's 4:3 height.
test('stream grid: thin even margin and gutters between the drawn frames, the game at 16:9 and the cam at 4:3', () => {
  const {game, column, cam, chat, chatTall, bars} = STREAM_LAYOUT;
  // Margin: the outermost frames sit on it, on all four sides.
  assert.deepEqual([game.frame.x, game.frame.y, cam.frame.y, right(chat.frame), bottom(chat.frame), bottom(bars[0]!.frame)],
    [margin, margin, margin, STREAM_GRID.width - margin, STREAM_GRID.height - margin, STREAM_GRID.height - margin]);
  assert.deepEqual([chatTall.frame.y, right(chatTall.frame), bottom(chatTall.frame)], [margin, STREAM_GRID.width - margin, STREAM_GRID.height - margin]);
  // Gutters: game ↔ column, cam ↔ chat, game ↔ bars, and between the bars (the row closes on the game's edge).
  assert.equal(column.x - right(game.frame), gutter);
  assert.equal(chat.frame.y - bottom(cam.frame), gutter);
  assert.equal(bars[0]!.frame.y - bottom(game.frame), gutter);
  for (let index = 1; index < bars.length; index++) {
    const gap = bars[index]!.frame.x - right(bars[index - 1]!.frame);
    assert.ok(gap >= gutter && gap <= gutter + 1, `bar gap ${gap}`);
  }
  assert.equal(bars[0]!.frame.x, game.frame.x);
  assert.equal(right(bars.at(-1)!.frame), right(game.frame));
  assert.equal(bars.length, STREAM_GRID.barCount);
  assert.ok(bars.every((bar) => bar.frame.height === STREAM_GRID.barHeight));
  // The column holds the cam's frame and the chat's, edge to edge.
  assert.deepEqual([cam.frame.x, chat.frame.x, chat.frame.width], [column.x, column.x, column.width]);
  assert.ok(right(cam.frame) <= right(column) && right(cam.frame) >= right(column) - 1, 'cam fills the column');
  // Proportions: the game window exactly 16:9, the cam 4:3 within one percent (340×256); every side even.
  assert.equal(game.box.width * 9, game.box.height * 16);
  assert.ok(Math.abs(cam.box.width / cam.box.height / (4 / 3) - 1) < 0.01);
  for (const slot of [game, cam, chat, chatTall, ...bars]) {
    assert.ok(slot.box.width % 2 === 0 && slot.box.height % 2 === 0, `${slot.kind} ${slot.box.width}×${slot.box.height}`);
  }
  // A frame is its box plus the kind's reach.
  const reach = GRID_REACH.border;
  assert.deepEqual(game.frame, {x: game.box.x - reach.left, y: game.box.y - reach.top,
    width: game.box.width + reach.left + reach.right, height: game.box.height + reach.top + reach.bottom});
});

test('stream grid: the tokens drive the layout (a wider gutter moves every piece, the margin still holds)', () => {
  const wide = streamGrid({...STREAM_GRID, gutter: 40});
  assert.equal(wide.column.x - right(wide.game.frame), 40);
  assert.equal(wide.chat.frame.y - bottom(wide.cam.frame), 40);
  assert.equal(right(wide.chat.frame), STREAM_GRID.width - margin);
  assert.ok(wide.game.box.width < STREAM_LAYOUT.game.box.width);
});

// Dies with: G-6 a scene's layer off its slot.
test('stream grid: the qa:kit scenes put each piece on its slot, one ornamented piece per scene', () => {
  const slotOf = (size: string, x: number, y: number) =>
    [STREAM_LAYOUT.game, STREAM_LAYOUT.cam, STREAM_LAYOUT.chat, STREAM_LAYOUT.chatTall, ...STREAM_LAYOUT.bars]
      .find((slot) => slot.box.x === x && slot.box.y === y && slot.box.width === getSize(size).width && slot.box.height === getSize(size).height);
  assert.deepEqual(GRID_SCENES.map((scene) => scene.out), ['mock-chatting', 'mock-gameplay']);
  for (const scene of GRID_SCENES) {
    for (const layer of scene.layers) assert.ok(slotOf(layer.size, layer.x, layer.y), `${scene.out}: ${layer.size} at ${layer.x},${layer.y}`);
    assert.equal(scene.layers.filter((layer) => layer.variant === undefined).length, 1, scene.out);
    assert.equal(scene.layers.filter((layer) => layer.size === 'layout-bar').length, STREAM_GRID.barCount);
  }
});

// Dies with: G-12 the limit's left side moved out by the reach instead of in, G-15 the top band starting at the outline,
// G-16 the left band starting further in.
test('ornamentReach: the paint limit comes in to the reach past the outline, never past the old limit', () => {
  const frame = {
    outline: {x: 48, y: 48, width: 200, height: 100, radius: 8},
    paintLimit: {x: 0, y: 0, width: 296, height: 156},
    keepOut: [],
  } as unknown as OrnamentFrame;
  assert.equal(reachOrnamentFrame(frame, 0), frame);
  assert.deepEqual(reachOrnamentFrame(frame, 12).paintLimit, {x: 36, y: 36, width: 224, height: 120});
  // A reach wider than the bleed keeps the canvas.
  assert.deepEqual(reachOrnamentFrame(frame, 100).paintLimit, {x: 0, y: 0, width: 296, height: 156});
  // Open sides keep the old limit: left and bottom here.
  assert.deepEqual(reachOrnamentFrame(frame, 12, ['left', 'bottom']).paintLimit, {x: 0, y: 36, width: 260, height: 120});
  // A closed side keeps a band clear inside the outline, from the reach to the middle: motifs there stay small.
  assert.deepEqual(reachOrnamentFrame(frame, 12, ['top', 'right', 'bottom']).keepOut, [{x: 60, y: 48, width: 88, height: 100}]);
  assert.deepEqual(reachOrnamentFrame(frame, 12, ['left', 'bottom']).keepOut, [
    {x: 48, y: 60, width: 200, height: 38}, {x: 148, y: 48, width: 88, height: 100},
  ]);
});

const STYLES = [undefined, 'cream-soda', 'fine-line', 'indigo-pop'] as const;
type PackItem = {composition: string; preset: string; sizes?: string[]; props?: Record<string, unknown>; variant?: string};
const pack = JSON.parse(readFileSync(new URL('../packs/sticker-pop.json', import.meta.url), 'utf8')) as {items: PackItem[]};
const slotsBySize: Record<keyof typeof LAYOUT_SIZES, GridSlot[]> = {
  'layout-game': [STREAM_LAYOUT.game], 'layout-cam': [STREAM_LAYOUT.cam], 'layout-chat': [STREAM_LAYOUT.chat],
  'layout-chat-tall': [STREAM_LAYOUT.chatTall], 'layout-bar': STREAM_LAYOUT.bars,
};

// Dies with: G-7 the registry ignoring ornamentReach, G-8 the pack's reach 12 → 24, G-13 the registry ignoring
// ornamentOpenSides (the game's star shrinks), G-16 the left band starting further in (the cam's star grows).
test('sticker-pop: every ornamented layout piece keeps its stickers within half the gutter on the sides that face a neighbour, full size on the margin, so no neighbour is ever touched', () => {
  const others = (slot: GridSlot, all: GridSlot[]) => all.filter((other) => other !== slot);
  for (const style of STYLES) {
    for (const [id, slots] of Object.entries(slotsBySize)) {
      const item = pack.items.find((entry) => entry.variant === style && entry.sizes?.includes(id) && entry.props?.ornaments !== 'none');
      assert.ok(item, `${style ?? 'base'} ${id}: ornamented item`);
      assert.equal(item.props?.ornamentReach, LAYOUT_ORNAMENT_REACH, `${style ?? 'base'} ${id}`);
      const size = getSize(id);
      const adapter = ORNAMENT_KINDS[size.kind as OrnamentKindName];
      const preset = JSON.parse(readFileSync(new URL(`../presets/${item.preset}.json`, import.meta.url), 'utf8')) as Record<string, unknown>;
      const props = adapter.parse({...preset, ...item.props, ...sizeProps(size)});
      const layout = adapter.ornamentLayout(props);
      assert.ok(layout.placements.length > 0, `${style ?? 'base'} ${id}: the star is placed`);
      // The game's star sits on its left side, on the margin: it keeps the kit's full size (owner, 2026-11-25).
      if (id === 'layout-game') {
        const star = (layout.placements[0] as {size?: number}).size ?? 0;
        assert.ok(Math.abs(star - props.ornamentSize) < 1e-6, `${style ?? 'base'} game star ${star}`);
      }
      const scale = layout.scale ?? 1;
      for (const slot of slots) {
        const fileX = slot.box.x - props.bleed;
        const fileY = slot.box.y - props.bleed;
        // The tall chat replaces the cam and the chat: its neighbours are the game and the bars.
        const scene = slot === STREAM_LAYOUT.chatTall
          ? [STREAM_LAYOUT.game, ...STREAM_LAYOUT.bars]
          : [STREAM_LAYOUT.game, STREAM_LAYOUT.cam, STREAM_LAYOUT.chat, ...STREAM_LAYOUT.bars];
        const neighbours = others(slot, scene);
        for (const placement of layout.placements) {
          const cx = fileX + placement.x * scale;
          const cy = fileY + placement.y * scale;
          const r = placement.extent * scale;
          const label = `${style ?? 'base'} ${id} ${String((placement as {motif?: string}).motif ?? '')} at ${cx.toFixed(1)},${cy.toFixed(1)} r ${r}`;
          // Within half the gutter of the piece's own outline (its drawn edge in this box style) on the sides
          // that face a neighbour; the sides on the scene's margin are open. Inside the scene either way.
          const outline = layout.frame.outline;
          const ox = fileX + outline.x * scale;
          const oy = fileY + outline.y * scale;
          const open = LAYOUT_OPEN_SIDES[id as keyof typeof LAYOUT_SIZES];
          const reach = LAYOUT_ORNAMENT_REACH + 1e-6;
          if (!open.includes('left')) assert.ok(cx - r >= ox - reach, `${label}: past the left side`);
          if (!open.includes('top')) assert.ok(cy - r >= oy - reach, `${label}: past the top side`);
          if (!open.includes('right')) assert.ok(cx + r <= ox + outline.width * scale + reach, `${label}: past the right side`);
          if (!open.includes('bottom')) assert.ok(cy + r <= oy + outline.height * scale + reach, `${label}: past the bottom side`);
          // A sticker on a side that faces a neighbour (its circle crosses that side's line) stays small.
          const crosses = (!open.includes('left') && cx - r < ox) || (!open.includes('top') && cy - r < oy)
            || (!open.includes('right') && cx + r > ox + outline.width * scale) || (!open.includes('bottom') && cy + r > oy + outline.height * scale);
          if (crosses) assert.ok(2 * r <= 2 * LAYOUT_ORNAMENT_REACH + 1e-6, `${label}: a big sticker on a side that faces a neighbour`);
          assert.ok(cx - r >= 0 && cy - r >= 0 && cx + r <= STREAM_GRID.width && cy + r <= STREAM_GRID.height, `${label} leaves the scene`);
          for (const other of neighbours) {
            const inside = cx + r > other.frame.x && cx - r < right(other.frame) && cy + r > other.frame.y && cy - r < bottom(other.frame);
            assert.ok(!inside, `${label} enters the frame of the ${other.kind} at ${other.frame.x},${other.frame.y}`);
          }
        }
      }
    }
  }
});
