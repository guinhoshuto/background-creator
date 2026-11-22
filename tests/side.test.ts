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
import {
  buildSideScene, roundRectWithin, sideBackOutset, sideHole, sideHoleFits, sideOutset, sideShape,
} from '../src/overlays/shared/side';
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
  // The default 10 px band around 16 px corners holds a side of 6 (6·√2 ≤ 9.5), not one of 8.
  accepted(borderLoopSchema, {depth: 6, fillOpacity: 1, lines: 1}, 'border, opaque');
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
  // A frame's outline is the outer edge of its band, beyond the box: 28 + 17 + 3 fills 48. Measured
  // from the window, 18 would pass. The bands are thick enough for the side's own hole (side refusal:
  // a frame side deeper), so the bleed is what refuses here.
  const camSize = sizeProps(getSize('webcam-16x9'));
  accepted(borderLoopSchema, {...FRAME_ON, thickness: 28, depth: 17, ...camSize}, 'webcam 17');
  refusal(borderLoopSchema, {...FRAME_ON, thickness: 28, depth: 18, ...camSize}, 'The side goes past the margin: use bleed ≥ 50, or depth ≤ 17.', 'webcam 18');
  // With a title bar, on a 64 px bleed: 32 + 29 + 3 fills it; measured with the bar's height, no side would.
  const barCam = {...FRAME_ON, ...BAR, thickness: 32, width: 640, height: 360, bleed: 64};
  accepted(borderLoopSchema, {...barCam, depth: 29}, 'webcam with a bar 29');
  refusal(borderLoopSchema, {...barCam, depth: 30}, 'The side goes past the margin: use bleed ≥ 66, or depth ≤ 29.', 'webcam with a bar 30');
  refusal(borderLoopSchema, {...FRAME_ON, thickness: 32, depth: 14, ...camSize}, 'The side goes past the margin: use bleed ≥ 50, or depth ≤ 13.', 'thick webcam 14');
});

test('side refusal: a shallow side above a title bar that fills the bleed', () => {
  // 12 + 30 + 6 = 48: the bar leaves no bleed above, and a side of 1 px peeks 2 px out there.
  const full = {...FRAME_ON, titleBarHeight: 30, titleBarLineWidth: 6, ...sizeProps(getSize('webcam-16x9'))};
  refusal(borderLoopSchema, {...full, depth: 1}, 'The side goes past the margin: use bleed ≥ 50, or depth ≤ 0.', 'depth 1');
  refusal(borderLoopSchema, {...full, depth: 2.5}, 'The side goes past the margin: use bleed ≥ 50, or depth ≤ 0.', 'depth 2.5');
  accepted(borderLoopSchema, {...full, depth: 3}, 'depth 3');
  // The deepest side this band holds (side refusal: a frame side deeper) fits the bleed too.
  accepted(borderLoopSchema, {...full, depth: 11}, 'depth 11');
  // Without the bar the same shallow side has the whole bleed above it.
  accepted(borderLoopSchema, {...full, titleBarHeight: 0, depth: 1}, 'depth 1, no bar');
});

test('side refusal: a frame with a side is one band of 3 px or more', () => {
  const message = 'The side needs one band of 3 px or more: use lines 1 and thickness ≥ 3, or depth 0.';
  const camSize = sizeProps(getSize('webcam-16x9'));
  refusal(borderLoopSchema, {...FRAME_ON, lines: 2, ...camSize}, message, 'two lines');
  refusal(borderLoopSchema, {...FRAME_ON, thickness: 2, strokeWidth: 2, ...camSize}, message, 'a 2 px band');
  refusal(borderLoopSchema, {...FRAME_ON, thickness: 2.5, strokeWidth: 2, ...camSize}, message, 'a 2.5 px band');
  // A 3 px band holds a side of 1 px around the 12 px corners (1·√2 ≤ 3 − 0.5), not one of 8.
  accepted(borderLoopSchema, {...FRAME_ON, thickness: 3, strokeWidth: 2, depth: 1, ...camSize}, 'a 3 px band');
  accepted(borderLoopSchema, {...FRAME, lines: 2, ...camSize}, 'two lines, flat');
  // A screen frame ignores the side, so its second line stays.
  accepted(borderLoopSchema, {...FRAME_ON, lines: 2, ...sizeProps(getSize('fullscreen'))}, 'screen, two lines');
});

// Mutations that fail it (mutations-b.json): `Math.hypot(` → `Math.max(` and `if (spare < 0)` → `if (spare < -1e9)`
// in roundRectWithin, `sideHole(window)` → `window` in sideHoleFits.
test('side hole fits: a rounded rect inside another, by the corners of its core or by its grown core', () => {
  const square = {x: 0, y: 0, width: 10, height: 10, radius: 0};
  // A rounder outer: the inner square's corner (0, 0) lies hypot(r − 2, r − 2) from the core of a 14 px square of radius r.
  for (const [radius, inside] of [[4, true], [6, true], [7, false]] as const) {
    assert.equal(roundRectWithin(square, {x: -2, y: -2, width: 14, height: 14, radius}), inside, `square in radius ${radius}`);
  }
  // A rounder inner: a circle fits the square it is inscribed in, and a square of radius 1, and not 0.1 px off.
  const circle = {...square, radius: 5};
  assert.equal(roundRectWithin(circle, square), true);
  assert.equal(roundRectWithin(circle, {...square, radius: 1}), true);
  assert.equal(roundRectWithin({...circle, x: 0.1}, square), false);
  // A frame's side holds its own hole while the copy has room for the window grown by 2 px.
  const window = {x: 100, y: 100, width: 400, height: 300, radius: 12};
  const outline = {x: 88, y: 88, width: 424, height: 324, radius: 24};
  assert.equal(sideHoleFits(outline, window, 8), true);
  assert.equal(sideHoleFits(outline, window, 8.14), false);
  assert.equal(sideHoleFits({...outline, radius: 0}, {...window, radius: 0}, 11.5), true);
  assert.equal(sideHoleFits({...outline, radius: 0}, {...window, radius: 0}, 11.6), false);
});

// Mutations that fail it (mutations-b.json): the refineSideHole line dropped from the frame's refine,
// the title bar's height left out of it, `Math.floor(props.thickness) + 1` → `+ 2`, the bleed left out of
// the deepest side, its back half (behind a title bar) left out, and the thickness way out kept when that
// band no longer fits the bleed.
test('side refusal: a frame side deeper than its band lets its own hole out, straight, round and circle', () => {
  const message = (way: string) => `The side goes past the band into the window: use ${way}.`;
  const cam = sizeProps(getSize('webcam-16x9'));
  const round = sizeProps(getSize('webcam-round'));
  // The side's own hole (the window + 2) stays inside the copy (the outline + 1.5, moved `depth` down and
  // right) while depth ≤ thickness + 1.5 − 2 on a straight side, and depth·√2 ≤ 11.5 around a round corner.
  const cases = [
    ['straight sides', {...FRAME_ON, radius: 0, ...cam}, 11.5, 11.6, 'thickness ≥ 13, or depth ≤ 11'],
    ['round corners', {...FRAME_ON, ...cam}, 8.13, 8.14, 'thickness ≥ 13, or depth ≤ 8'],
    ['round corners, 9', {...FRAME_ON, ...cam}, 8, 9, 'thickness ≥ 14, or depth ≤ 8'],
    // The bar raises the copy's top: only the straight left side is left to hold the hole.
    ['round corners under a bar', {...FRAME_ON, ...BAR, ...cam}, 11.5, 11.6, 'thickness ≥ 13, or depth ≤ 11'],
    ['circle', {...FRAME_ON, ...round}, 8.13, 8.14, 'thickness ≥ 13, or depth ≤ 8'],
    ['circle, which ignores the bar', {...FRAME_ON, ...BAR, ...round}, 8.13, 8.14, 'thickness ≥ 13, or depth ≤ 8'],
  ] as const;
  for (const [label, input, deepest, refused, way] of cases) {
    const props = borderLoopSchema.parse({...input, depth: deepest});
    refusal(borderLoopSchema, {...input, depth: refused}, message(way), `${label} ${refused}`);
    // The same line, read on the geometry: every point of the hole inside the copy, and one outside it past the line.
    const {layout} = getBorderGeometry(props);
    const hole = sideHole(layout.window);
    const points = samplePerimeter(hole, 0, perimeterLength(hole), 0.25);
    const out = (depth: number) => Math.max(...points.map((point) => roundRectSdf(sideShape(layout.outer, depth), point.x, point.y)));
    assert.ok(out(deepest) <= 1e-6, `${label}: the hole inside the copy at ${deepest}`);
    assert.ok(out(refused) > 0, `${label}: the hole out of the copy at ${refused}`);
  }
  // The D-03 frames: 3.5 px to spare under the bar, 11.5 − 8·√2 ≈ 0.19 px on the circle.
  const d03 = {...FRAME_ON, ...BAR, depth: 8};
  accepted(borderLoopSchema, {...d03, ...cam}, 'D-03 webcam-16x9');
  accepted(borderLoopSchema, {...d03, ...round}, 'D-03 webcam-round');
  // A band too thick for the bleed to take one more px is no way out; nor a side the bleed does not hold.
  refusal(borderLoopSchema, {...FRAME_ON, depth: 33, ...cam}, message('depth ≤ 8'), 'no thicker band in the bleed');
  refusal(borderLoopSchema, {...FRAME_ON, radius: 0, thickness: 40, depth: 40, ...cam}, message('depth ≤ 5'), 'the deepest side the bleed holds');
  // A 3 px band under a bar in a 32 px bleed: depth 2 holds the hole (≤ 2.5) but shows above the bar
  // (3 + 30 + 1 = 34 px), and a side deep enough to hide behind it lets the hole out: no depth is offered.
  refusal(borderLoopSchema, {...FRAME_ON, ...BAR, thickness: 3, strokeWidth: 2, depth: 5, ...cam, bleed: 32}, message('depth ≤ 0'),
    'no depth the bleed holds behind a bar');
});

// Mutations that fail it (mutations-b.json): `.max(64)` → `.max(640)` and `.min(0)` → `.min(-10)` on depth.
test('side range: depth runs from 0 to 64 px; 65 and −1 are refused by the field', () => {
  const roomy = {...CHAT_ON, ...sizeProps(getSize('chat-standard')), bleed: 70};
  accepted(chatLoopSchema, {...roomy, depth: 64}, 'depth 64');
  accepted(chatLoopSchema, {...roomy, depth: 0}, 'depth 0');
  for (const [depth, code] of [[65, 'too_big'], [-1, 'too_small']] as const) {
    const result = chatLoopSchema.safeParse({...roomy, depth});
    assert.equal(result.success, false, `depth ${depth}`);
    assert.deepEqual(result.error!.issues.map((issue) => [issue.path, issue.code]), [[['depth'], code]], `depth ${depth}`);
  }
});
