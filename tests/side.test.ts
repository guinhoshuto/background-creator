import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BlockFrame, blockLoopSchema, getBlockLayers, getBlockLayout, getBlockScene} from '../src/overlays/block/BlockLoop';
import {BorderFrame} from '../src/overlays/border/BorderLoop';
import {borderLoopSchema, getBorderGeometry, getBorderScene, getBorderSceneParts} from '../src/overlays/border/scene';
import {ChatFrame, chatLoopSchema, getChatLayers, getChatLayout, getChatScene} from '../src/overlays/chat/ChatLoop';
import {roundRectPath, roundRectSdf} from '../src/overlays/shared/geometry';
import {perimeterLength, samplePerimeter} from '../src/overlays/shared/perimeter';
import {buildSideScene, sideBackOutset, sideHole, sideOutset, sideShape} from '../src/overlays/shared/side';
import {getSize, sizeProps, sizesForKind} from '../src/sizes';

/**
 * The side of a piece with thickness (`depth`), which the sticker-pop kit asked for (2026-11-21):
 * a flat copy of the outer outline of a chat, a block or a frame, moved down and to the right,
 * whole behind the piece and closed by a 3 px line. Off by default; the measures below are the
 * ones of the mock the owner approved. Run with `npx tsx --test tests/side.test.ts`; every test
 * here has a mutation that makes it fail (`npm run mutate`).
 */

const CORAL = '#F5A09E';
const INK = '#4A3A69';
/** A 6 px ink line, still, on an opaque piece: the side is refused under a translucent one. */
const PIECE = {strokeWidth: 6, radius: 12, strokeColors: [INK], strokeMotion: 'still', strokeCore: 0, glow: 0, halo: 0, fillOpacity: 1};
/** The pieces of the mock: 8 px of coral side. */
const SIDE = {depth: 8, depthColor: CORAL};
const CHAT_ON = {...PIECE, ...SIDE};
const BLOCK_ON = {...PIECE, ...SIDE};
/** The webcam of the mock: a 12 px band with the 6 px line in its middle. */
const FRAME = {...PIECE, thickness: 12, lines: 1, corners: 'none'};
const FRAME_ON = {...FRAME, ...SIDE};
/** Its title bar: 24 px over a 6 px line, so the top side is 42 px tall. */
const BAR = {titleBarHeight: 24, titleBarLineWidth: 6};

const chat = (input: object = {}, size = 'chat-standard') => chatLoopSchema.parse({...input, ...sizeProps(getSize(size))});
const block = (input: object = {}, size = 'card') => blockLoopSchema.parse({...input, ...sizeProps(getSize(size))});
const border = (input: object = {}, size = 'webcam-16x9') => borderLoopSchema.parse({...input, ...sizeProps(getSize(size))});
const chatMarkup = (input: object, frame = 0, size = 'chat-standard') =>
  renderToStaticMarkup(createElement(ChatFrame, {props: chat(input, size), frame, durationInFrames: 480}));
const blockMarkup = (input: object, frame = 0, size = 'card') =>
  renderToStaticMarkup(createElement(BlockFrame, {props: block(input, size), frame, durationInFrames: 480}));
const borderMarkup = (input: object, frame = 0, size = 'webcam-16x9') =>
  renderToStaticMarkup(createElement(BorderFrame, {props: border(input, size), frame, durationInFrames: 480}));

type Schema = typeof chatLoopSchema | typeof blockLoopSchema | typeof borderLoopSchema;

/** A refused input carries one issue, on `depth`, with the whole message. */
const refusal = (schema: Schema, input: object, message: string, label: string) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, false, `${label}: refused`);
  assert.deepEqual(result.error!.issues.map((issue) => [issue.path.join('.'), issue.message]), [['depth', message]], label);
};

const accepted = (schema: Schema, input: object, label: string) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, true, `${label}: ${result.error?.issues[0]?.message}`);
};

/** The two paths of a side in the markup: the flat copy (with a frame's hole, evenodd), then its line. */
const sideMarkup = (prefix: string, shape: string, color: string, line: string, hole = '') =>
  `<g><path id="${prefix}-side" d="${shape}${hole}"${hole ? ' fill-rule="evenodd"' : ''} fill="${color}"></path>`
  + `<path id="${prefix}-side-line" d="${shape}" fill="none" stroke="${line}" stroke-width="3"></path></g>`;

test('side outset: 8, 6 and 0 px of depth reach 11, 9 and 0 px beyond the outline', () => {
  assert.equal(sideOutset(8), 11);
  assert.equal(sideOutset(6), 9);
  assert.equal(sideOutset(0), 0);
});

test('side back outset: a side shallower than 3 px peeks out above and on the left, a deeper one does not', () => {
  assert.equal(sideBackOutset(1), 2);
  assert.equal(sideBackOutset(2.5), 0.5);
  assert.equal(sideBackOutset(3), 0);
  assert.equal(sideBackOutset(8), 0);
  assert.equal(sideBackOutset(0), 0);
});

test('side shape: a 400×600 outline of radius 12 at depth 8 is 403×603 of radius 13.5, moved 6.5 px on both axes', () => {
  assert.deepEqual(sideShape({x: 32, y: 40, width: 400, height: 600, radius: 12}, 8), {x: 38.5, y: 46.5, width: 403, height: 603, radius: 13.5});
  // A circle stays a circle: the radius grows with the side.
  assert.deepEqual(sideShape({x: 32, y: 32, width: 320, height: 320, radius: 160}, 6), {x: 36.5, y: 36.5, width: 323, height: 323, radius: 161.5});
});

test('side hole: the window grown by 2 px on every side, radius included', () => {
  assert.deepEqual(sideHole({x: 48, y: 48, width: 640, height: 360, radius: 12}), {x: 46, y: 46, width: 644, height: 364, radius: 14});
});

test('side panel layout: the outset of a chat and of a block is 11 px with glow and halo off, the rest of the layout stays', () => {
  const chatOn = getChatLayout(chat(CHAT_ON));
  const chatOff = getChatLayout(chat(PIECE));
  assert.equal(chatOn.outset, 11);
  assert.equal(chatOff.outset, 0);
  assert.deepEqual({...chatOn, outset: 0}, chatOff);
  const blockOn = getBlockLayout(block(BLOCK_ON));
  const blockOff = getBlockLayout(block(PIECE));
  assert.equal(blockOn.outset, 11);
  assert.equal(blockOff.outset, 0);
  assert.deepEqual({...blockOn, outset: 0}, blockOff);
  // The outset is a maximum, never a sum: a wider halo keeps its own reach.
  assert.equal(getChatLayout(chat({...CHAT_ON, halo: 20})).outset, 20);
  assert.equal(getBlockLayout(block({...BLOCK_ON, depth: 6}, 'label')).outset, 9);
});

test('side frame layout: the side adds to the band, 23 px without a title bar and 42 with it; the window stays', () => {
  const flat = getBorderGeometry(border(FRAME)).layout;
  const plain = getBorderGeometry(border(FRAME_ON)).layout;
  assert.equal(flat.outset, 12);
  assert.equal(plain.outset, 23);
  assert.deepEqual({...plain, outset: 12}, flat);
  // With the bar the top side is the tall one: max(12 + 30, 12 + 11).
  const barred = getBorderGeometry(border({...FRAME_ON, ...BAR})).layout;
  assert.equal(barred.outset, 42);
  assert.deepEqual(barred, getBorderGeometry(border({...FRAME, ...BAR})).layout);
  // A side of 1 px peeks 2 px out above the bar: 12 + 36 + 2.
  const shallow = borderLoopSchema.parse({...FRAME_ON, depth: 1, titleBarHeight: 30, titleBarLineWidth: 6, width: 640, height: 360, bleed: 64});
  assert.equal(getBorderGeometry(shallow).layout.outset, 50);
});

test('side markup: the flat copy in the depth color and its 3 px line in the first outline color', () => {
  const chatShape = roundRectPath({x: 38.5, y: 38.5, width: 403, height: 603, radius: 13.5});
  assert.ok(chatMarkup(CHAT_ON).includes(sideMarkup('chat', chatShape, CORAL, INK)), 'chat');
  const cardShape = roundRectPath({x: 38.5, y: 38.5, width: 643, height: 363, radius: 13.5});
  assert.ok(blockMarkup(BLOCK_ON).includes(sideMarkup('block', cardShape, CORAL, INK)), 'card');
  const labelShape = roundRectPath({x: 28.5, y: 28.5, width: 483, height: 99, radius: 13.5});
  assert.ok(blockMarkup({...BLOCK_ON, depth: 6, depthColor: '#C554A6'}, 0, 'label').includes(sideMarkup('block', labelShape, '#C554A6', INK)), 'label');
  const circleShape = roundRectPath({x: 38.5, y: 38.5, width: 323, height: 323, radius: 161.5});
  assert.ok(blockMarkup(BLOCK_ON, 0, 'circle').includes(sideMarkup('block', circleShape, CORAL, INK)), 'circle');
  // The frame's side copies the finished outer edge, 42 px tall on top with the bar, and leaves its own hole.
  const frameShape = roundRectPath({x: 42.5, y: 12.5, width: 667, height: 417, radius: 25.5});
  const frameHole = roundRectPath({x: 46, y: 46, width: 644, height: 364, radius: 14});
  assert.ok(borderMarkup({...FRAME_ON, ...BAR}).includes(sideMarkup('border', frameShape, CORAL, INK, frameHole)), 'webcam');
  const roundShape = roundRectPath({x: 42.5, y: 42.5, width: 427, height: 427, radius: 213.5});
  const roundHole = roundRectPath({x: 46, y: 46, width: 404, height: 404, radius: 202});
  assert.ok(borderMarkup(FRAME_ON, 0, 'webcam-round').includes(sideMarkup('border', roundShape, CORAL, INK, roundHole)), 'round webcam');
});

test('side order: halo, side, back ornaments, fill, and the side before the stroke glow, with the horizon set', () => {
  const places = (markup: string, marks: readonly string[]) => marks.map((mark) => {
    const at = markup.indexOf(mark);
    assert.ok(at >= 0, `${mark} in the markup`);
    return at;
  });
  const rising = (list: readonly number[]) => list.every((at, index) => index === 0 || at > list[index - 1]!);
  // The horizon set draws behind the piece in the three kinds (the terminal set has no back layer).
  const dressed = {ornaments: 'horizon', halo: 8, glow: 6, glowStrength: 1};
  const marks = (prefix: string, fill: string) =>
    [`id="${prefix}-halo-blur"`, `id="${prefix}-side"`, `id="${prefix}-side-line"`, 'data-ornaments="back"', `id="${prefix}-${fill}-clip"`, `id="${prefix}-stroke-glow"`];
  const chatDressed = chatMarkup({...CHAT_ON, ...dressed});
  assert.ok(rising(places(chatDressed, marks('chat', 'fill'))), marks('chat', 'fill').join(' < '));
  const blockDressed = blockMarkup({...BLOCK_ON, ...dressed});
  assert.ok(rising(places(blockDressed, marks('block', 'fill'))), marks('block', 'fill').join(' < '));
  const borderDressed = borderMarkup({...FRAME_ON, ...dressed, glow: 4});
  assert.ok(rising(places(borderDressed, ['id="border-frame-hole"', ...marks('border', 'band')])), marks('border', 'band').join(' < '));
  // Drawn once: never again under the stroke's glow.
  for (const [markup, prefix] of [[chatDressed, 'chat'], [blockDressed, 'block'], [borderDressed, 'border']] as const) {
    assert.equal(markup.split(`id="${prefix}-side"`).length, 2, prefix);
    assert.equal(markup.split(`id="${prefix}-side-line"`).length, 2, prefix);
  }
});

test('side off: the defaults draw no side and no id, whatever the depth color', () => {
  assert.deepEqual(buildSideScene({depth: 0, depthColor: CORAL, strokeColors: [INK]}), []);
  assert.deepEqual(getChatLayers(chat(), 0, 480).side, []);
  assert.deepEqual(getBlockLayers(block(), 0, 480).side, []);
  assert.deepEqual(getBorderSceneParts(border(), 0, 480).side, []);
  for (const [off, recolored] of [
    [chatMarkup({}), chatMarkup({depthColor: CORAL})],
    [blockMarkup({}), blockMarkup({depthColor: CORAL})],
    [borderMarkup({}), borderMarkup({depthColor: CORAL})],
  ] as const) {
    assert.equal(off.includes('-side'), false);
    assert.equal(recolored, off);
  }
});

test('side still: one element on every frame, listed right after the halo, before the back ornaments and the fill', () => {
  const element = {type: 'side', depth: 8, color: CORAL, line: INK};
  const dressed = {ornaments: 'horizon', halo: 8};
  const chatProps = chat({...CHAT_ON, ...dressed});
  const blockProps = block({...BLOCK_ON, ...dressed});
  const borderProps = border({...FRAME_ON, ...dressed});
  for (const frame of [0, 200]) {
    const chatLayers = getChatLayers(chatProps, frame, 480);
    assert.deepEqual(chatLayers.side, [element]);
    assert.ok(chatLayers.halo.length > 0 && chatLayers.ornamentBack.length > 0, 'chat: a halo and back ornaments around the side');
    assert.deepEqual(getChatScene(chatProps, frame, 480)[chatLayers.halo.length], element);
    const blockLayers = getBlockLayers(blockProps, frame, 480);
    assert.deepEqual(blockLayers.side, [element]);
    assert.ok(blockLayers.halo.length > 0 && blockLayers.ornamentBack.length > 0, 'block: a halo and back ornaments around the side');
    assert.deepEqual(getBlockScene(blockProps, frame, 480)[blockLayers.halo.length], element);
    const parts = getBorderSceneParts(borderProps, frame, 480);
    assert.deepEqual(parts.side, [element]);
    assert.ok(parts.halo.length > 0 && parts.ornamentBack.length > 0, 'border: a halo and back ornaments around the side');
    assert.deepEqual(getBorderScene(borderProps, frame, 480)[parts.halo.length], element);
  }
});

test('side kinds: depth 8 parses at every size of the kind; twitch-panel and the screens draw no side', () => {
  for (const size of sizesForKind('chat')) {
    const result = chatLoopSchema.strict().safeParse({...CHAT_ON, ...sizeProps(size)});
    assert.equal(result.success, true, `chat ${size.id}: ${result.error?.issues[0]?.message}`);
    assert.equal(getChatLayout(result.data!).outset, 11, size.id);
    assert.ok(chatMarkup(CHAT_ON, 0, size.id).includes('id="chat-side"'), size.id);
  }
  for (const size of sizesForKind('block')) {
    // The size's own props win, as in a pack: twitch-panel, the file with no bleed, sets the depth to 0.
    const result = blockLoopSchema.strict().safeParse({...BLOCK_ON, ...sizeProps(size)});
    assert.equal(result.success, true, `block ${size.id}: ${result.error?.issues[0]?.message}`);
    const flat = size.id === 'twitch-panel';
    assert.equal(size.bleed === 0, flat, size.id);
    assert.equal(getBlockLayout(result.data!).outset, flat ? 0 : 11, size.id);
    assert.equal(blockMarkup(BLOCK_ON, 0, size.id).includes('id="block-side"'), !flat, size.id);
  }
  for (const size of sizesForKind('border')) {
    const result = borderLoopSchema.strict().safeParse({...FRAME_ON, ...BAR, ...sizeProps(size)});
    assert.equal(result.success, true, `border ${size.id}: ${result.error?.issues[0]?.message}`);
    const props = result.data!;
    const {layout} = getBorderGeometry(props);
    const screen = props.fit === 'screen';
    assert.equal(getBorderSceneParts(props, 0, 480).side.length, screen ? 0 : 1, size.id);
    assert.equal(borderMarkup({...FRAME_ON, ...BAR}, 0, size.id).includes('id="border-side"'), !screen, size.id);
    assert.ok(layout.outset <= size.bleed, `border ${size.id}: outset`);
    if (screen) continue;
    // A round window ignores the bar and keeps the side: 12 + 11; a rectangular one has the bar's 42.
    assert.equal(layout.outset, props.shape === 'circle' ? 23 : 42, size.id);
    const shape = sideShape(layout.outer, 8);
    assert.ok(shape.x - 1.5 >= 0 && shape.y - 1.5 >= 0 && shape.x + shape.width + 1.5 <= layout.canvas.width
      && shape.y + shape.height + 1.5 <= layout.canvas.height, `border ${size.id}: the side and its line inside the file`);
    // The side's own hole ends under the band: 2 px clear of the window, 10 px inside the outer edge.
    const hole = sideHole(layout.window);
    for (const point of samplePerimeter(hole, 0, perimeterLength(hole), 16)) {
      assert.ok(roundRectSdf(layout.holeShape, point.x, point.y) >= 2 - 1e-6, `border ${size.id}: the hole clear of the window`);
      assert.ok(roundRectSdf(layout.outer, point.x, point.y) <= -10 + 1e-6, `border ${size.id}: the hole under the band`);
    }
  }
});

test('side refusal: a translucent fill, in the three kinds', () => {
  const message = 'The side shows through a translucent fill: use fillOpacity 1, or depth 0.';
  // The defaults are translucent (0.9): turning the side on asks for an opaque piece.
  refusal(chatLoopSchema, {depth: 8}, message, 'chat');
  refusal(blockLoopSchema, {depth: 8}, message, 'block');
  refusal(borderLoopSchema, {depth: 8}, message, 'border');
  refusal(chatLoopSchema, {depth: 8, fillOpacity: 0.99}, message, 'chat at 0.99');
  accepted(chatLoopSchema, {depth: 8, fillOpacity: 1}, 'chat, opaque');
  accepted(blockLoopSchema, {depth: 8, fillOpacity: 1}, 'block, opaque');
  accepted(borderLoopSchema, {depth: 8, fillOpacity: 1, lines: 1}, 'border, opaque');
  // A screen frame ignores the side, so its translucent band is no reason to refuse.
  accepted(borderLoopSchema, {depth: 8, ...sizeProps(getSize('fullscreen'))}, 'screen');
});

test('side refusal: a side past the bleed names the bleed that holds it and the deepest side that fits', () => {
  // A panel's outline is its box: 29 + 3 fills a bleed of 32, 30 + 3 does not.
  const chatSize = sizeProps(getSize('chat-standard'));
  accepted(chatLoopSchema, {...CHAT_ON, depth: 29, ...chatSize}, 'chat 29');
  refusal(chatLoopSchema, {...CHAT_ON, depth: 30, ...chatSize}, 'The side goes past the margin: use bleed ≥ 34, or depth ≤ 29.', 'chat 30');
  refusal(chatLoopSchema, {...CHAT_ON, depth: 29.5, ...chatSize}, 'The side goes past the margin: use bleed ≥ 34, or depth ≤ 29.', 'chat 29.5');
  const labelSize = sizeProps(getSize('label'));
  accepted(blockLoopSchema, {...BLOCK_ON, depth: 21, ...labelSize}, 'label 21');
  refusal(blockLoopSchema, {...BLOCK_ON, depth: 22, ...labelSize}, 'The side goes past the margin: use bleed ≥ 26, or depth ≤ 21.', 'label 22');
  // A frame's outline is the outer edge of its band, 12 px beyond the box: 12 + 33 + 3 fills 48.
  // Measured from the window, 34 would pass; measured with the title bar's height, 8 would not.
  const camSize = sizeProps(getSize('webcam-16x9'));
  accepted(borderLoopSchema, {...FRAME_ON, depth: 33, ...camSize}, 'webcam 33');
  refusal(borderLoopSchema, {...FRAME_ON, depth: 34, ...camSize}, 'The side goes past the margin: use bleed ≥ 50, or depth ≤ 33.', 'webcam 34');
  accepted(borderLoopSchema, {...FRAME_ON, ...BAR, depth: 33, ...camSize}, 'webcam with a bar 33');
  refusal(borderLoopSchema, {...FRAME_ON, ...BAR, depth: 34, ...camSize}, 'The side goes past the margin: use bleed ≥ 50, or depth ≤ 33.', 'webcam with a bar 34');
  refusal(borderLoopSchema, {...FRAME_ON, thickness: 20, depth: 26, ...camSize}, 'The side goes past the margin: use bleed ≥ 50, or depth ≤ 25.', 'thick webcam 26');
});

test('side refusal: a shallow side above a title bar that fills the bleed', () => {
  // 12 + 30 + 6 = 48: the bar leaves no bleed above, and a side of 1 px peeks 2 px out there.
  const full = {...FRAME_ON, titleBarHeight: 30, titleBarLineWidth: 6, ...sizeProps(getSize('webcam-16x9'))};
  refusal(borderLoopSchema, {...full, depth: 1}, 'The side goes past the margin: use bleed ≥ 50, or depth ≤ 0.', 'depth 1');
  refusal(borderLoopSchema, {...full, depth: 2.5}, 'The side goes past the margin: use bleed ≥ 50, or depth ≤ 0.', 'depth 2.5');
  accepted(borderLoopSchema, {...full, depth: 3}, 'depth 3');
  accepted(borderLoopSchema, {...full, depth: 33}, 'depth 33');
  refusal(borderLoopSchema, {...full, depth: 40}, 'The side goes past the margin: use bleed ≥ 56, or depth ≤ 33.', 'depth 40');
  // Without the bar the same shallow side has the whole bleed above it.
  accepted(borderLoopSchema, {...full, titleBarHeight: 0, depth: 1}, 'depth 1, no bar');
});

test('side refusal: a frame with a side is one band of 3 px or more', () => {
  const message = 'The side needs one band of 3 px or more: use lines 1 and thickness ≥ 3, or depth 0.';
  const camSize = sizeProps(getSize('webcam-16x9'));
  refusal(borderLoopSchema, {...FRAME_ON, lines: 2, ...camSize}, message, 'two lines');
  refusal(borderLoopSchema, {...FRAME_ON, thickness: 2, strokeWidth: 2, ...camSize}, message, 'a 2 px band');
  refusal(borderLoopSchema, {...FRAME_ON, thickness: 2.5, strokeWidth: 2, ...camSize}, message, 'a 2.5 px band');
  accepted(borderLoopSchema, {...FRAME_ON, thickness: 3, strokeWidth: 2, ...camSize}, 'a 3 px band');
  accepted(borderLoopSchema, {...FRAME, lines: 2, ...camSize}, 'two lines, flat');
  // A screen frame ignores the side, so its second line stays.
  accepted(borderLoopSchema, {...FRAME_ON, lines: 2, ...sizeProps(getSize('fullscreen'))}, 'screen, two lines');
});
