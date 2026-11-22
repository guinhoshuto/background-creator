import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BlockFrame, blockLoopSchema, getBlockLayers, getBlockLayout, getBlockScene} from '../src/overlays/block/BlockLoop';
import {BorderFrame} from '../src/overlays/border/BorderLoop';
import {borderLoopSchema, getBorderGeometry, getBorderScene, getBorderSceneParts} from '../src/overlays/border/scene';
import {ChatFrame, chatGlowSources, chatLoopSchema, getChatLayers, getChatLayout, getChatScene} from '../src/overlays/chat/ChatLoop';
import {offsetRoundRect, roundRectSdf} from '../src/overlays/shared/geometry';
import {growTop, layoutFrame, layoutPanel} from '../src/overlays/shared/layout';
import {titleButtonRow, titleButtonRowBox, titleButtonSquare, titleButtonsFit} from '../src/overlays/shared/title-buttons';
import {getSize, sizeProps, sizesForKind} from '../src/sizes';

/**
 * The title bar with three buttons (minimize, maximize, close), which the sticker-pop kit asked for
 * (2026-11-21): on a chat's header, on a block's top accent bar and as a taller top side of a
 * border. Off by default; the measures below are the ones of the mock the owner approved. Run with
 * `npx tsx --test tests/title-bar.test.ts`; every test here has a mutation that makes it fail
 * (`npm run mutate`).
 */

const COLORS = ['#9AC7F2', '#EE9DE6', '#F4A66C'];
/** A 6 px ink line with a glow faint enough for the title (the chat's default glow washes it out). */
const INK = {strokeWidth: 6, radius: 12, strokeColors: ['#4A3A69'], strokeMotion: 'still', strokeCore: 0, glow: 6, glowStrength: 1};
/** The chat of the mock: a 42 px header over a 6 px line, buttons of 24 px, 7 apart, 12 from the outline. */
const CHAT_ON = {
  ...INK, headerHeight: 42, headerLineWidth: 6, headerLineOpacity: 1, titleButtonSize: 24, titleButtonGap: 7, titleButtonInset: 12,
  titleButtonColors: COLORS,
};
/** A card as a window: a 24 px top bar over a 6 px line, buttons of 18 px, 5 apart, 14 from the outline. */
const BLOCK_ON = {
  ...INK, accent: 'top', accentSize: 24, accentLineWidth: 6, titleButtonSize: 18, titleButtonGap: 5, titleButtonInset: 14,
  titleButtonColors: COLORS,
};
/** The webcam of the mock: a 12 px band with the 6 px line in its middle, a 24 px bar and a 6 px line on top. */
const FRAME_ON = {
  ...INK, glow: 0, thickness: 12, lines: 1, corners: 'none', fillOpacity: 1, titleBarHeight: 24, titleBarColor: '#F74CA9',
  titleBarLineWidth: 6, titleButtonSize: 18, titleButtonGap: 5, titleButtonInset: 14, titleButtonColors: COLORS,
};
const OFF = {titleButtonSize: 0, titleBarHeight: 0, accentLineWidth: 0};

const chat = (input: object = {}, size = 'chat-standard') => chatLoopSchema.parse({...input, ...sizeProps(getSize(size))});
const block = (input: object = {}, size = 'card') => blockLoopSchema.parse({...input, ...sizeProps(getSize(size))});
const border = (input: object = {}, size = 'webcam-16x9') => borderLoopSchema.parse({...input, ...sizeProps(getSize(size))});
const chatMarkup = (input: object, frame = 0) =>
  renderToStaticMarkup(createElement(ChatFrame, {props: chat(input), frame, durationInFrames: 480}));
const blockMarkup = (input: object, frame = 0, size = 'card') =>
  renderToStaticMarkup(createElement(BlockFrame, {props: block(input, size), frame, durationInFrames: 480}));
const borderMarkup = (input: object, frame = 0, size = 'webcam-16x9') =>
  renderToStaticMarkup(createElement(BorderFrame, {props: border(input, size), frame, durationInFrames: 480}));

type Schema = typeof chatLoopSchema | typeof blockLoopSchema | typeof borderLoopSchema;

/** The one issue a refused input must carry on `path`, with its whole message. */
const refusal = (schema: Schema, input: object, path: string, message: RegExp, label: string) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, false, `${label}: refused`);
  const issue = result.error!.issues.find((entry) => entry.path.join('.') === path);
  assert.ok(issue, `${label}: issue on ${path}, got ${result.error!.issues.map((entry) => `${entry.path.join('.')}: ${entry.message}`).join(' | ')}`);
  assert.match(issue.message, message, label);
};

const accepted = (schema: Schema, input: object, label: string) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, true, `${label}: ${result.error?.issues[0]?.message}`);
};

const corners = (rect: {x: number; y: number; width: number; height: number}) =>
  [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]] as const;

/** How a title layer opens in the markup: its clip, with the path `d`, and the group that uses that clip. */
const titleLayer = (prefix: string, d: string) =>
  `<g id="${prefix}-title"><defs><clipPath id="${prefix}-title-clip" clipPathUnits="userSpaceOnUse"><path d="${d}"></path></clipPath></defs>`
  + `<g clip-path="url(#${prefix}-title-clip)">`;

test('title row: three buttons end at the right, 86 px wide at 24 and 7', () => {
  const row = titleButtonRow({right: 382, cy: 27, size: 24, gap: 7});
  assert.deepEqual(row.map((button) => button.x), [296, 327, 358]);
  for (const button of row) assert.deepEqual([button.y, button.width, button.height], [15, 24, 24]);
  assert.deepEqual(titleButtonRowBox(row), {x: 296, y: 15, width: 86, height: 24});
  // The frame's row: 18 px buttons 5 px apart.
  const small = titleButtonRow({right: 100, cy: 20, size: 18, gap: 5});
  assert.deepEqual(small.map((button) => button.x), [36, 59, 82]);
  assert.deepEqual(titleButtonRowBox(small), {x: 36, y: 11, width: 64, height: 18});
});

test('title glyph: the maximize square is 10 px in a 24 px button and 7 px in an 18 px one, centered', () => {
  assert.deepEqual(titleButtonSquare({x: 296, y: 15, width: 24, height: 24}), {x: 303, y: 22, width: 10, height: 10});
  assert.deepEqual(titleButtonSquare({x: 36, y: 11, width: 18, height: 18}), {x: 41.5, y: 16.5, width: 7, height: 7});
});

test('title fit: the rows of the mock fit, a row in a round corner or wider than its bar is refused', () => {
  // The chat of the mock: 400 px wide, a 6 px line, radius 12; buttons 24/7/12 on a 42 px header.
  const {inner} = layoutPanel({width: 400, height: 600, bleed: 0, radius: 12, strokeWidth: 6, padding: 16});
  const chatRow = titleButtonRowBox(titleButtonRow({right: inner.x + inner.width - 12, cy: inner.y + 21, size: 24, gap: 7}));
  assert.equal(titleButtonsFit(chatRow, inner), true);
  // The frame of the mock: a 640×360 window of radius 12, band 12, line 6, bar 24 and line 6; buttons 18/5/14.
  const frame = layoutFrame({width: 640, height: 360, bleed: 48, radius: 12, thickness: 12, fit: 'window', extraTop: 30});
  const face = offsetRoundRect(frame.track, -3);
  const frameRow = titleButtonRowBox(titleButtonRow({right: face.x + face.width - 14, cy: face.y + 12, size: 18, gap: 5}));
  assert.equal(titleButtonsFit(frameRow, face), true);
  // No inset under a radius of 24: the last button's corner pokes through the round corner.
  const round = layoutPanel({width: 400, height: 600, bleed: 0, radius: 24, strokeWidth: 6, padding: 16}).inner;
  const roundRow = titleButtonRowBox(titleButtonRow({right: round.x + round.width, cy: round.y + 21, size: 24, gap: 7}));
  assert.equal(titleButtonsFit(roundRow, round), false);
  const message = /^The title buttons leave their bar: reduce titleButtonSize, titleButtonGap or radius, or increase titleButtonInset\.$/;
  const base = {...CHAT_ON, ...sizeProps(getSize('chat-standard'))};
  refusal(chatLoopSchema, {...base, radius: 24, titleButtonInset: 0}, 'titleButtonInset', message, 'chat');
  accepted(chatLoopSchema, {...base, radius: 24, titleButtonInset: 12}, 'chat: inset 12');
  accepted(chatLoopSchema, {...base, radius: 12, titleButtonInset: 0}, 'chat: radius 12');
  // The chat measures from the header's own band: with open sides it reaches the panel's sides, 6 px past the inside
  // of the line, so a row with no inset fits there (the inside of the line alone would refuse it).
  const open = {...base, strokeSides: 'top-bottom', titleButtonInset: 0};
  accepted(chatLoopSchema, open, 'chat: open sides');
  const openLayout = getChatLayout(chatLoopSchema.parse(open));
  assert.equal(titleButtonsFit(titleButtonRowBox(openLayout.titleButtons), openLayout.bandArea), true);
  assert.equal(titleButtonsFit(titleButtonRowBox(openLayout.titleButtons), openLayout.inner), false);
  // Wider than the bar: in the 320 px Twitch panel a row pushed 256 px in leaves by the left.
  const panel = {...BLOCK_ON, ...sizeProps(getSize('twitch-panel'))};
  refusal(blockLoopSchema, {...panel, titleButtonGap: 64, titleButtonInset: 256}, 'titleButtonInset', message, 'block');
  accepted(blockLoopSchema, panel, 'block');
  // The block measures from the inside of its line: with no inset the last button pokes through that corner (radius 6)
  // while still inside the line's middle (radius 9) and the box's outline (radius 12), which would both take it.
  const card = {...BLOCK_ON, ...sizeProps(getSize('card'))};
  refusal(blockLoopSchema, {...card, titleButtonInset: 0}, 'titleButtonInset', message, 'block: inside of the line');
  accepted(blockLoopSchema, {...card, titleButtonInset: 1}, 'block: inset 1');
  const cardLayout = getBlockLayout(blockLoopSchema.parse(card));
  const cardRow = titleButtonRowBox(cardLayout.titleButtons.map((button) => ({...button, x: button.x + 14})));
  assert.deepEqual([cardLayout.inner, cardLayout.track, cardLayout.shape].map((inside) => titleButtonsFit(cardRow, inside)), [false, true, true]);
  const cam = {...FRAME_ON, ...sizeProps(getSize('webcam-16x9'))};
  refusal(borderLoopSchema, {...cam, radius: 48, titleButtonInset: 0}, 'titleButtonInset', message, 'border');
  accepted(borderLoopSchema, cam, 'border');
  // The frame measures from the inner face of its main line (radius 15): 4 px from it the row is over the line, yet
  // inside the line's middle (radius 18) and the band (radius 24), which would both take it; 6 px is the first inset that fits.
  refusal(borderLoopSchema, {...cam, titleButtonInset: 4}, 'titleButtonInset', message, 'border: inner face of the line');
  accepted(borderLoopSchema, {...cam, titleButtonInset: 6}, 'border: inset 6');
  const camGeometry = getBorderGeometry(borderLoopSchema.parse(cam));
  const camRow = titleButtonRowBox(camGeometry.titleBar!.buttons.map((button) => ({...button, x: button.x + 10})));
  assert.deepEqual(
    [offsetRoundRect(camGeometry.tracks[0], -3), camGeometry.tracks[0], camGeometry.band].map((inside) => titleButtonsFit(camRow, inside)),
    [false, true, true],
  );
});

test('title markup: three rounded squares with rx 5.28 at 24 px and 3.96 at 18 px, glyphs drawn as lines', () => {
  const buttons = (markup: string) => [...markup.matchAll(
    /<g fill="none" stroke="([^"]+)" stroke-width="([^"]+)" stroke-linecap="round" stroke-linejoin="round" data-title="button"><rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="([^"]+)" fill="([^"]+)"><\/rect>(.*?)<\/g>/g,
  )].map((match) => match.slice(1));
  // chat-standard: the inside of the 6 px line ends at x 426, the header is centered on y 59.
  assert.deepEqual(buttons(chatMarkup(CHAT_ON)), [
    ['#4A3A69', '2', '329', '48', '22', '22', '5.28', '#9AC7F2', '<path d="M334 59H346" data-glyph="minimize"></path>'],
    ['#4A3A69', '2', '360', '48', '22', '22', '5.28', '#EE9DE6', '<rect x="366" y="54" width="10" height="10" data-glyph="maximize"></rect>'],
    ['#4A3A69', '2', '391', '48', '22', '22', '5.28', '#F4A66C', '<path d="M396 53L408 65M408 53L396 65" data-glyph="close"></path>'],
  ]);
  // card: the 24 px bar starts at y 38, so the 18 px buttons are centered on y 50.
  assert.deepEqual(buttons(blockMarkup(BLOCK_ON)), [
    ['#4A3A69', '2', '589', '42', '16', '16', '3.96', '#9AC7F2', '<path d="M592.5 50H601.5" data-glyph="minimize"></path>'],
    ['#4A3A69', '2', '612', '42', '16', '16', '3.96', '#EE9DE6', '<rect x="616.5" y="46.5" width="7" height="7" data-glyph="maximize"></rect>'],
    ['#4A3A69', '2', '635', '42', '16', '16', '3.96', '#F4A66C', '<path d="M638.5 45.5L647.5 54.5M647.5 45.5L638.5 54.5" data-glyph="close"></path>'],
  ]);
  const frame = buttons(borderMarkup(FRAME_ON));
  assert.deepEqual(frame.map((button) => button.slice(0, 8)), [
    ['#4A3A69', '2', '614', '19', '16', '16', '3.96', '#9AC7F2'],
    ['#4A3A69', '2', '637', '19', '16', '16', '3.96', '#EE9DE6'],
    ['#4A3A69', '2', '660', '19', '16', '16', '3.96', '#F4A66C'],
  ]);
  // The frame's bar and its line, flat, clipped to the main line's track.
  const markup = borderMarkup(FRAME_ON);
  assert.ok(markup.includes('<rect x="42" y="12" width="652" height="30" fill="#F74CA9" data-title="title-bar"></rect>'
    + '<rect x="42" y="39" width="652" height="6" fill="#4A3A69" data-title="title-line"></rect>'), 'bar and line');
  assert.ok(markup.includes('<clipPath id="border-title-clip" clipPathUnits="userSpaceOnUse">'
    + '<path d="M60 12H676A18 18 0 0 1 694 30V396A18 18 0 0 1 676 414H60A18 18 0 0 1 42 396V30A18 18 0 0 1 60 12Z"></path></clipPath>'), 'clip');
  // Every layer draws inside the clip it declares: the frame's is the middle of its main line.
  assert.ok(markup.includes(titleLayer('border', 'M60 12H676A18 18 0 0 1 694 30V396A18 18 0 0 1 676 414H60A18 18 0 0 1 42 396V30A18 18 0 0 1 60 12Z')), 'border layer');
  // card: the inside of the 6 px line, (38, 38) to (666, 386) with radius 6; the box's outline would be (32, 32) with radius 12.
  assert.ok(blockMarkup(BLOCK_ON).includes(
    titleLayer('block', 'M44 38H660A6 6 0 0 1 666 44V380A6 6 0 0 1 660 386H44A6 6 0 0 1 38 380V44A6 6 0 0 1 44 38Z')), 'block layer');
  // chat-standard: the inside of the line too, and with open sides the header's band, which reaches the panel's sides (x 32 to 432).
  assert.ok(chatMarkup(CHAT_ON).includes(
    titleLayer('chat', 'M44 38H420A6 6 0 0 1 426 44V620A6 6 0 0 1 420 626H44A6 6 0 0 1 38 620V44A6 6 0 0 1 44 38Z')), 'chat layer');
  assert.ok(chatMarkup({...CHAT_ON, strokeSides: 'top-bottom', titleButtonInset: 0}).includes(
    titleLayer('chat', 'M38 38H426A6 6 0 0 1 432 44V620A6 6 0 0 1 426 626H38A6 6 0 0 1 32 620V44A6 6 0 0 1 38 38Z')), 'chat layer, open sides');
});

test('title chat layout: the title ends one gap before the buttons, 227 px wide in chat-compact', () => {
  // chat-compact, 360 px wide: 348 px inside the 6 px line, 316 px of title between the paddings.
  const off = getChatLayout(chat({...CHAT_ON, titleButtonSize: 0}, 'chat-compact'));
  assert.deepEqual(off.header, {x: 54, y: 49, width: 316, height: 20});
  assert.deepEqual(off.titleButtons, []);
  // On: the row takes 12 + 86 px at the right, and one gap of 7 px stays between it and the title.
  const on = getChatLayout(chat(CHAT_ON, 'chat-compact'));
  assert.deepEqual(on.titleButtons.map((button) => [button.x, button.y, button.width]), [[288, 47, 24], [319, 47, 24], [350, 47, 24]]);
  assert.deepEqual(on.header, {x: 54, y: 49, width: 227, height: 20});
  assert.deepEqual(on.content, off.content);
  // With the 3 px margin band the inside is 6 px narrower, and so is the title: 221 px.
  const margin = getChatLayout(chat({...CHAT_ON, strokeMargin: 3}, 'chat-compact'));
  assert.deepEqual(margin.titleButtons.map((button) => button.x), [285, 316, 347]);
  assert.deepEqual(margin.header, {x: 57, y: 52, width: 221, height: 20});
});

test('title keep-out: the row is one more area the ornaments avoid, only while it is on', () => {
  const chatOn = getChatLayout(chat(CHAT_ON, 'chat-compact'));
  assert.deepEqual(chatOn.ornamentLayout.frame.keepOut, [chatOn.content, chatOn.header, {x: 288, y: 47, width: 86, height: 24}]);
  const chatOff = getChatLayout(chat({...CHAT_ON, titleButtonSize: 0}, 'chat-compact'));
  assert.deepEqual(chatOff.ornamentLayout.frame.keepOut, [chatOff.content, chatOff.header]);
  const blockOn = getBlockLayout(block(BLOCK_ON));
  assert.deepEqual(blockOn.ornamentLayout.frame.keepOut, [blockOn.content, {x: 588, y: 41, width: 64, height: 18}]);
  const blockOff = getBlockLayout(block({...BLOCK_ON, titleButtonSize: 0}));
  assert.deepEqual(blockOff.ornamentLayout.frame.keepOut, [blockOff.content]);
});

test('title chat line: headerLineOpacity is the opacity the header line is drawn at', () => {
  const lineOf = (markup: string) => /fill="url\(#chat-divider-0\)" opacity="([^"]+)"/.exec(markup)?.[1];
  assert.equal(chat().headerLineOpacity, 0.9);
  assert.equal(lineOf(chatMarkup({})), '0.9');
  assert.equal(lineOf(chatMarkup({headerLineOpacity: 1})), '1');
  assert.equal(lineOf(chatMarkup({headerLineOpacity: 0.5})), '0.5');
  assert.equal(getChatLayers(chat({headerLineOpacity: 1}), 0, 480).divider[0]!.opacity, 1);
});

test('title chat glow: the header line counts in the glow at headerLineOpacity, not at a fixed 0.9', () => {
  // chat-standard, a 12 px line under a 42 px header, glow 26: over the title the glow reaches 19% with the line
  // at 0.9 and 21% with it at 1, on either side of the 20% limit.
  const input = {...INK, headerHeight: 42, headerLineWidth: 12, glow: 26, ...sizeProps(getSize('chat-standard'))};
  accepted(chatLoopSchema, input, 'the default, 0.9');
  accepted(chatLoopSchema, {...input, headerLineOpacity: 0.9}, 'line at 0.9');
  refusal(chatLoopSchema, {...input, headerLineOpacity: 1}, 'glow',
    /^The glow would reach 21% opacity over the title area \(the limit is 20%\): increase headerHeight and padding, or reduce glow or headerLineWidth\.$/,
    'line at 1');
  const layout = getChatLayout(chatLoopSchema.parse(input));
  assert.deepEqual(chatGlowSources(layout).map((source) => source.opacity), [undefined, 0.9]);
  assert.deepEqual(chatGlowSources(layout, 0.9, 1).map((source) => source.opacity), [undefined, 1]);
  assert.deepEqual(chatGlowSources(layout, 0.9, 0.5).map((source) => source.opacity), [undefined, 0.5]);
});

test('title block line: accentLineWidth draws a line under a top bar and moves the content down by it', () => {
  // card: the inside of the 6 px line starts at (38, 38); the 24 px bar ends at y 62.
  const off = getBlockLayout(block({...BLOCK_ON, accentLineWidth: 0}));
  assert.equal(off.accentLine, null);
  assert.deepEqual(off.content, {x: 62, y: 78, width: 580, height: 292});
  const on = getBlockLayout(block(BLOCK_ON));
  assert.deepEqual(on.accentLine, {x: 38, y: 62, width: 628, height: 6});
  assert.deepEqual(on.content, {x: 62, y: 84, width: 580, height: 286});
  assert.deepEqual(on.titleButtons.map((button) => [button.x, button.y, button.width]), [[588, 41, 18], [611, 41, 18], [634, 41, 18]]);
  assert.ok(blockMarkup(BLOCK_ON).includes('<rect x="38" y="62" width="628" height="6" fill="#4A3A69" data-title="title-line"></rect>'));
  // Under a thin bar on a round card the line's ends lie outside the outline (10 px past the inside of the line, 4 px
  // past the box): the layer's clip, the inside of the line, is what cuts them.
  const round = {...BLOCK_ON, radius: 40, accentSize: 6, titleButtonSize: 0};
  const roundLayout = getBlockLayout(block(round));
  assert.deepEqual(roundLayout.accentLine, {x: 38, y: 44, width: 628, height: 6});
  for (const [x, y] of [[38, 44], [666, 44]] as const) {
    assert.ok(roundRectSdf(roundLayout.inner, x, y) > 10, `(${x}, ${y}) outside the inside of the line`);
    assert.ok(roundRectSdf(roundLayout.shape, x, y) > 4, `(${x}, ${y}) outside the box`);
  }
  assert.ok(blockMarkup(round).includes(
    titleLayer('block', 'M72 38H632A34 34 0 0 1 666 72V352A34 34 0 0 1 632 386H72A34 34 0 0 1 38 352V72A34 34 0 0 1 72 38Z')
    + '<rect x="38" y="44" width="628" height="6" fill="#4A3A69" data-title="title-line"></rect>'), 'round card: the line inside its clip');
  // A left bar has no line under it: the width is ignored, the layout is the one without it.
  const left = {...INK, accent: 'left', accentSize: 24};
  assert.deepEqual(getBlockLayout(block({...left, accentLineWidth: 6})), getBlockLayout(block(left)));
  assert.equal(blockMarkup({...left, accentLineWidth: 6}), blockMarkup(left));
});

test('title frame layout: the top side grows by the bar and its line, the window stays where it is', () => {
  assert.deepEqual(growTop({x: 10, y: 50, width: 30, height: 40, radius: 8}, 30), {x: 10, y: 20, width: 30, height: 70, radius: 8});
  // A 640×360 window of radius 12 at (48, 48), band 12: 30 px more on top (bar 24, line 6).
  const input = {width: 640, height: 360, bleed: 48, radius: 12, thickness: 12, fit: 'window'} as const;
  const plain = layoutFrame(input);
  const tall = layoutFrame({...input, extraTop: 30});
  assert.deepEqual(plain.outer, {x: 36, y: 36, width: 664, height: 384, radius: 24});
  assert.deepEqual(tall.outer, {x: 36, y: 6, width: 664, height: 414, radius: 24});
  assert.deepEqual(tall.track, {x: 42, y: 12, width: 652, height: 402, radius: 18});
  assert.equal(plain.outset, 12);
  assert.equal(tall.outset, 42);
  assert.equal(layoutFrame({...input, extraTop: 30, glow: 4}).outset, 46);
  for (const key of ['window', 'holeShape', 'hole', 'content', 'box', 'canvas'] as const) assert.deepEqual(tall[key], plain[key], key);
  // The kind: the same numbers from the props, plus the bar, its line and the row.
  const geometry = getBorderGeometry(border(FRAME_ON));
  assert.deepEqual(geometry.layout.outer, tall.outer);
  assert.equal(geometry.layout.outset, 42);
  assert.deepEqual(geometry.band, tall.outer);
  assert.deepEqual(geometry.tracks[0], tall.track);
  assert.deepEqual(geometry.titleBar, {
    bar: {x: 42, y: 12, width: 652, height: 30},
    line: {x: 42, y: 39, width: 652, height: 6},
    buttons: [{x: 613, y: 18, width: 18, height: 18}, {x: 636, y: 18, width: 18, height: 18}, {x: 659, y: 18, width: 18, height: 18}],
  });
  assert.deepEqual(geometry.layout.window, plain.window);
  assert.deepEqual(geometry.layout.hole, plain.hole);
  // The halo starts at the taller outer edge.
  assert.equal(getBorderGeometry(border({...FRAME_ON, halo: 4})).layout.outset, 46);
  // Without a line the bar still stands, 24 px tall.
  const bare = getBorderGeometry(border({...FRAME_ON, titleBarLineWidth: 0}));
  assert.deepEqual(bare.layout.outer, {x: 36, y: 12, width: 664, height: 408, radius: 24});
  assert.deepEqual(bare.titleBar!.line, null);
});

test('title frame round: a round window ignores the bar and keeps the layout it has without it', () => {
  for (const size of ['webcam-round-sm', 'webcam-round', 'webcam-round-lg']) {
    const on = getBorderGeometry(border(FRAME_ON, size));
    const off = getBorderGeometry(border({...FRAME_ON, ...OFF}, size));
    assert.equal(on.titleBar, null, size);
    assert.deepEqual(on, off, size);
    assert.equal(borderMarkup(FRAME_ON, 0, size), borderMarkup({...FRAME_ON, ...OFF}, 0, size), size);
  }
});

test('title frame screen: a screen border ignores the bar and keeps the layout it has without it', () => {
  for (const size of ['fullscreen', 'fullscreen-vertical']) {
    const on = getBorderGeometry(border(FRAME_ON, size));
    const off = getBorderGeometry(border({...FRAME_ON, ...OFF}, size));
    assert.equal(on.titleBar, null, size);
    assert.deepEqual(on, off, size);
    assert.equal(borderMarkup(FRAME_ON, 0, size), borderMarkup({...FRAME_ON, ...OFF}, 0, size), size);
  }
});

test('title block round: a round block ignores the buttons and the line, whatever its accent', () => {
  for (const accent of ['top', 'left', 'none']) {
    for (const size of ['circle-sm', 'circle', 'circle-lg']) {
      const input = {...BLOCK_ON, accent, accentSize: 6};
      accepted(blockLoopSchema, {...input, ...sizeProps(getSize(size))}, `${size} ${accent}`);
      const on = getBlockLayout(block(input, size));
      assert.deepEqual(on.titleButtons, [], size);
      assert.equal(on.accentLine, null, size);
      assert.deepEqual(on, getBlockLayout(block({...input, ...OFF}, size)), size);
      assert.equal(blockMarkup(input, 0, size), blockMarkup({...input, ...OFF}, 0, size), size);
    }
  }
});

test('title refusal: chat buttons need a header', () => {
  const base = {...CHAT_ON, ...sizeProps(getSize('chat-standard'))};
  refusal(chatLoopSchema, {...base, headerHeight: 0}, 'titleButtonSize',
    /^The title buttons need a header: use headerHeight ≥ 24, or titleButtonSize 0\.$/, 'chat');
  accepted(chatLoopSchema, {...base, headerHeight: 24}, 'headerHeight 24');
  accepted(chatLoopSchema, {...base, headerHeight: 0, titleButtonSize: 0}, 'titleButtonSize 0');
});

test('title refusal: block buttons need a top accent bar', () => {
  const base = {...BLOCK_ON, ...sizeProps(getSize('card'))};
  const message = /^The title buttons sit on a top accent bar: use accent top, or titleButtonSize 0\.$/;
  for (const accent of ['left', 'none']) {
    refusal(blockLoopSchema, {...base, accent}, 'titleButtonSize', message, accent);
    accepted(blockLoopSchema, {...base, accent, titleButtonSize: 0}, `${accent}: titleButtonSize 0`);
  }
  accepted(blockLoopSchema, {...base, accent: 'top'}, 'accent top');
});

test('title refusal: buttons taller than their bar, in the three kinds', () => {
  const kinds = [
    ['headerHeight', chatLoopSchema, {...CHAT_ON, ...sizeProps(getSize('chat-standard'))}, 42],
    ['accentSize', blockLoopSchema, {...BLOCK_ON, ...sizeProps(getSize('card'))}, 24],
    ['titleBarHeight', borderLoopSchema, {...FRAME_ON, ...sizeProps(getSize('webcam-16x9'))}, 24],
  ] as const;
  for (const [bar, schema, base, height] of kinds) {
    const message = new RegExp(`^The title buttons are taller than their bar: use titleButtonSize ≤ ${height}, or a taller bar \\(${bar}\\)\\.$`);
    refusal(schema, {...base, titleButtonSize: height + 1}, 'titleButtonSize', message, bar);
    accepted(schema, {...base, titleButtonSize: height, titleButtonGap: 2, titleButtonInset: 24}, `${bar}: as tall as the bar`);
  }
});

test('title refusal: frame buttons need a title bar', () => {
  const base = {...FRAME_ON, ...sizeProps(getSize('webcam-16x9'))};
  refusal(borderLoopSchema, {...base, titleBarHeight: 0}, 'titleButtonSize',
    /^The title buttons need a title bar: use titleBarHeight ≥ 18, or titleButtonSize 0\.$/, 'no bar');
  // A bar as tall as the buttons puts their top on the line's inner face: 24 px in, the row is clear of its corner.
  accepted(borderLoopSchema, {...base, titleBarHeight: 18, titleButtonInset: 24}, 'titleBarHeight 18');
  accepted(borderLoopSchema, {...base, titleBarHeight: 0, titleButtonSize: 0}, 'titleButtonSize 0');
  // A round window and a screen border ignore the bar, so buttons without one are ignored there too.
  accepted(borderLoopSchema, {...FRAME_ON, titleBarHeight: 0, ...sizeProps(getSize('webcam-round'))}, 'round');
  accepted(borderLoopSchema, {...FRAME_ON, titleBarHeight: 0, ...sizeProps(getSize('fullscreen'))}, 'screen');
});

test('title refusal: chat title with no room beside the buttons', () => {
  // chat-compact: 348 px inside the line; a row of 12 + 3·64 + 2·48 = 300 px fits, the title beside it has no pixel left.
  const base = {...CHAT_ON, ...sizeProps(getSize('chat-compact')), headerHeight: 64, titleButtonSize: 64, titleButtonGap: 48};
  refusal(chatLoopSchema, base, 'headerHeight',
    /^A header of 64 px leaves no room for the title beside the buttons: reduce titleButtonSize or padding, or enlarge the box\.$/, 'chat');
  accepted(chatLoopSchema, {...base, titleButtonSize: 24}, 'titleButtonSize 24');
  accepted(chatLoopSchema, {...base, ...sizeProps(getSize('chat-vertical'))}, 'a wider box');
});

test('title refusal: a frame with a bar is a plain frame', () => {
  const base = {...FRAME_ON, ...sizeProps(getSize('webcam-16x9'))};
  const message = /^The title bar needs a plain frame: use corners none and lines 1, or titleBarHeight 0\.$/;
  refusal(borderLoopSchema, {...base, corners: 'brackets'}, 'titleBarHeight', message, 'brackets');
  refusal(borderLoopSchema, {...base, corners: 'jewels'}, 'titleBarHeight', message, 'jewels');
  refusal(borderLoopSchema, {...base, lines: 2, thickness: 6}, 'titleBarHeight', message, 'lines 2');
  accepted(borderLoopSchema, {...base, corners: 'brackets', ...OFF}, 'titleBarHeight 0');
  accepted(borderLoopSchema, base, 'plain');
});

test('title refusal: a bar past the bleed names the bleed that holds it', () => {
  // Band 12 + bar 24 + line 6 = 42 of the 48 px bleed: 6 px are left for the glow or the halo.
  const base = {...FRAME_ON, ...sizeProps(getSize('webcam-16x9'))};
  const message = /^The title bar goes past the margin: use bleed ≥ 50 or reduce titleBarHeight or the glow\.$/;
  refusal(borderLoopSchema, {...base, glow: 8}, 'bleed', message, 'glow 8');
  refusal(borderLoopSchema, {...base, halo: 8}, 'bleed', message, 'halo 8');
  accepted(borderLoopSchema, {...base, glow: 6}, 'glow 6');
  accepted(borderLoopSchema, {...base, glow: 8, bleed: 50}, 'bleed 50');
  accepted(borderLoopSchema, {...base, glow: 8, titleBarHeight: 22}, 'titleBarHeight 22');
});

test('title order: the row comes after the header, the accent and the band fill, before the margin, the rim and the stroke', () => {
  const places = (markup: string, ids: readonly string[]) => ids.map((id) => {
    const at = markup.indexOf(`id="${id}"`);
    assert.ok(at >= 0, `${id} in the markup`);
    return at;
  });
  const rising = (list: readonly number[]) => list.every((at, index) => index === 0 || at > list[index - 1]!);
  const chatIds = ['chat-fill-clip', 'chat-header-clip', 'chat-title', 'chat-margin', 'chat-rim-rim-0', 'chat-stroke-glow'];
  assert.ok(rising(places(chatMarkup({...CHAT_ON, strokeMargin: 3, rimLight: 0.5}), chatIds)), chatIds.join(' < '));
  const blockIds = ['block-fill-clip', 'block-accent-clip', 'block-title', 'block-margin', 'block-rim-rim-0', 'block-stroke-glow'];
  assert.ok(rising(places(blockMarkup({...BLOCK_ON, strokeMargin: 3, rimLight: 0.5}), blockIds)), blockIds.join(' < '));
  const borderIds = ['border-frame-hole', 'border-band-clip', 'border-title', 'border-rim-rim-0', 'border-stroke-glow'];
  assert.ok(rising(places(borderMarkup({...FRAME_ON, glow: 4, rimLight: 0.5}), borderIds)), borderIds.join(' < '));
  // One group each, drawn once: never again under the stroke's glow.
  assert.equal(chatMarkup(CHAT_ON).split('id="chat-title"').length, 2);
  assert.equal(blockMarkup(BLOCK_ON).split('id="block-title"').length, 2);
  assert.equal(borderMarkup({...FRAME_ON, glow: 4}).split('id="border-title"').length, 2);
});

test('title off: the defaults draw no row, no bar, no line and no id', () => {
  assert.deepEqual(
    [chat().titleButtonSize, chat().titleButtonGap, chat().titleButtonInset, chat().titleButtonColors],
    [0, 7, 12, ['#22D3EE', '#E879F9', '#A78BFA']],
  );
  assert.deepEqual([block().titleButtonSize, block().accentLineWidth], [0, 0]);
  assert.deepEqual(
    [border().titleButtonSize, border().titleBarHeight, border().titleBarColor, border().titleBarLineWidth],
    [0, 0, '#E879F9', 2],
  );
  for (const input of [{}, {...CHAT_ON, titleButtonSize: 0}]) {
    assert.deepEqual(getChatLayers(chat(input), 0, 480).titleButtons, []);
    assert.equal(getChatScene(chat(input), 0, 480).some((element) => element.type === 'title-button'), false);
    assert.equal(chatMarkup(input).includes('-title'), false);
  }
  for (const input of [{}, {accent: 'top'}, {...BLOCK_ON, ...OFF}]) {
    const layers = getBlockLayers(block(input), 0, 480);
    assert.deepEqual([layers.accentLine, layers.titleButtons], [[], []]);
    assert.equal(getBlockScene(block(input), 0, 480).some((element) => element.type.startsWith('title-')), false);
    assert.equal(blockMarkup(input).includes('-title'), false);
  }
  for (const input of [{}, {...FRAME_ON, ...OFF}]) {
    const parts = getBorderSceneParts(border(input), 0, 480);
    assert.deepEqual([parts.geometry.titleBar, parts.titleBar, parts.titleButtons], [null, [], []]);
    assert.equal(getBorderScene(border(input), 0, 480).some((element) => element.type.startsWith('title-')), false);
    assert.equal(borderMarkup(input).includes('-title'), false);
  }
});

test('title still: the same row on every frame, listed by place, outside the stroke elements', () => {
  const row = (xs: readonly number[], y: number, size: number) =>
    xs.map((x, index) => ({type: 'title-button', index, x, y, size, color: COLORS[index], line: '#4A3A69'}));
  const types = (scene: readonly {type: string}[]) => scene.map((element) => element.type);
  for (const frame of [0, 200]) {
    const chatProps = chat({...CHAT_ON, strokeMargin: 3, headerOpacity: 0.5});
    const chatLayers = getChatLayers(chatProps, frame, 480);
    assert.deepEqual(chatLayers.titleButtons, row([325, 356, 387], 50, 24));
    for (const element of [...chatLayers.stroke, ...chatLayers.divider]) assert.notEqual(element.type, 'title-button');
    const chatTypes = types(getChatScene(chatProps, frame, 480));
    const chatAt = chatTypes.indexOf('title-button');
    assert.deepEqual(chatTypes.slice(chatAt - 1, chatAt + 4), ['chat-header', 'title-button', 'title-button', 'title-button', 'margin']);

    const blockProps = block({...BLOCK_ON, strokeMargin: 3});
    const blockLayers = getBlockLayers(blockProps, frame, 480);
    assert.deepEqual(blockLayers.accentLine, [{type: 'title-line', x: 41, y: 65, width: 622, height: 6, color: '#4A3A69'}]);
    assert.deepEqual(blockLayers.titleButtons, row([585, 608, 631], 44, 18));
    for (const element of [...blockLayers.stroke, ...blockLayers.glow]) assert.notEqual(element.type, 'title-button');
    const blockTypes = types(getBlockScene(blockProps, frame, 480));
    const blockAt = blockTypes.indexOf('title-line');
    assert.deepEqual(blockTypes.slice(blockAt - 1, blockAt + 5), ['rect', 'title-line', 'title-button', 'title-button', 'title-button', 'margin']);

    const borderProps = border({...FRAME_ON, rimLight: 0.5});
    const parts = getBorderSceneParts(borderProps, frame, 480);
    assert.deepEqual(parts.titleBar, [
      {type: 'title-bar', x: 42, y: 12, width: 652, height: 30, color: '#F74CA9'},
      {type: 'title-line', x: 42, y: 39, width: 652, height: 6, color: '#4A3A69'},
    ]);
    assert.deepEqual(parts.titleButtons, row([613, 636, 659], 18, 18));
    for (const element of [...parts.stroke, ...parts.glow]) assert.notEqual(element.type, 'title-button');
    const borderTypes = types(getBorderScene(borderProps, frame, 480));
    const borderAt = borderTypes.indexOf('title-bar');
    assert.deepEqual(borderTypes.slice(borderAt - 1, borderAt + 6),
      ['rect', 'title-bar', 'title-line', 'title-button', 'title-button', 'title-button', 'rim']);
  }
  const group = (markup: string, prefix: string) => markup.slice(markup.indexOf(`<g id="${prefix}-title"`), markup.indexOf('</g></g></g>', markup.indexOf(`<g id="${prefix}-title"`)));
  assert.equal(group(chatMarkup(CHAT_ON, 0), 'chat'), group(chatMarkup(CHAT_ON, 200), 'chat'));
  assert.equal(group(blockMarkup(BLOCK_ON, 0), 'block'), group(blockMarkup(BLOCK_ON, 200), 'block'));
  assert.equal(group(borderMarkup(FRAME_ON, 0), 'border'), group(borderMarkup(FRAME_ON, 200), 'border'));
});

test('title kinds: on at every size of the kind, inside the outline, out of the window and inside the file', () => {
  for (const size of sizesForKind('chat')) {
    const result = chatLoopSchema.strict().safeParse({...CHAT_ON, ...sizeProps(size)});
    assert.equal(result.success, true, `chat ${size.id}: ${result.error?.issues[0]?.message}`);
    const layout = getChatLayout(result.data!);
    assert.equal(layout.titleButtons.length, 3, size.id);
    assert.ok(titleButtonsFit(titleButtonRowBox(layout.titleButtons), layout.inner), `chat ${size.id}: inside the outline`);
    assert.ok(layout.header!.x + layout.header!.width <= layout.titleButtons[0]!.x - 7, `chat ${size.id}: title clear of the row`);
    assert.ok(layout.outset <= size.bleed, `chat ${size.id}: outset`);
  }
  for (const size of sizesForKind('block')) {
    // The size's own props win (a round size stays round, twitch-panel has no glow), as in a pack.
    const result = blockLoopSchema.strict().safeParse({...BLOCK_ON, paddingY: 4, ...sizeProps(size)});
    assert.equal(result.success, true, `block ${size.id}: ${result.error?.issues[0]?.message}`);
    const layout = getBlockLayout(result.data!);
    assert.equal(layout.titleButtons.length, layout.circle ? 0 : 3, size.id);
    if (layout.circle) continue;
    assert.ok(titleButtonsFit(titleButtonRowBox(layout.titleButtons), layout.inner), `block ${size.id}: inside the outline`);
    assert.ok(layout.content.y >= layout.accentLine!.y + layout.accentLine!.height, `block ${size.id}: content under the line`);
    assert.ok(layout.outset <= size.bleed, `block ${size.id}: outset`);
  }
  for (const size of sizesForKind('border')) {
    const result = borderLoopSchema.strict().safeParse({...FRAME_ON, ...sizeProps(size)});
    assert.equal(result.success, true, `border ${size.id}: ${result.error?.issues[0]?.message}`);
    const props = result.data!;
    const {layout, titleBar, tracks} = getBorderGeometry(props);
    const applies = props.fit === 'window' && props.shape === 'rectangle';
    assert.equal(titleBar !== null, applies, size.id);
    assert.ok(layout.outset <= size.bleed, `border ${size.id}: outset`);
    if (!titleBar) continue;
    assert.equal(layout.outset, 42, size.id);
    assert.ok(titleButtonsFit(titleButtonRowBox(titleBar.buttons), offsetRoundRect(tracks[0], -3)), `border ${size.id}: inside the outline`);
    for (const rect of [titleBar.bar, titleBar.line!, ...titleBar.buttons]) {
      // The four corners and the middle of the bottom edge, the point nearest the window.
      for (const [x, y] of [...corners(rect), [rect.x + rect.width / 2, rect.y + rect.height] as const]) {
        assert.ok(roundRectSdf(layout.holeShape, x, y) >= -1e-9, `border ${size.id}: (${x}, ${y}) out of the window`);
        assert.ok(x >= 0 && y >= 0 && x <= layout.canvas.width && y <= layout.canvas.height, `border ${size.id}: (${x}, ${y}) inside the file`);
        assert.ok(roundRectSdf(layout.outer, x, y) <= 1e-9 || rect === titleBar.bar, `border ${size.id}: (${x}, ${y}) inside the frame`);
      }
    }
  }
});
