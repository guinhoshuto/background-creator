import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BlockFrame, blockLoopSchema, getBlockLayers, getBlockLayout, getBlockScene} from '../src/overlays/block/BlockLoop';
import {ChatFrame, chatLoopSchema, getChatLayers, getChatLayout, getChatScene} from '../src/overlays/chat/ChatLoop';
import {layoutPanel} from '../src/overlays/shared/layout';
import {getSize, sizeProps, sizesForKind} from '../src/sizes';
import {chatStrokeWidthFits} from './helpers/themes';

/**
 * The flat band between the edge of a panel and its outline (`strokeMargin`, chat and block), which
 * the sticker-pop kit asked for (2026-11-21): the outline and the content move inwards, the box
 * keeps its size, and at 0 nothing changes. Plus the chat's stroke weight rule with its named
 * exception. Run with `npx tsx --test tests/panel-margin.test.ts`; every test here has a mutation
 * that makes it fail (`npm run mutate`).
 */

/** The margin as the kit wears it: 3 px of cream outside a 6 px line, with a glow faint enough for the title. */
const ON = {strokeMargin: 3, strokeMarginColor: '#F6E2E4', strokeWidth: 6, radius: 12, glow: 6, glowStrength: 1};
const OFF = {...ON, strokeMargin: 0};

const chat = (input: object = {}, size = 'chat-standard') => chatLoopSchema.parse({...input, ...sizeProps(getSize(size))});
const block = (input: object = {}, size = 'label') => blockLoopSchema.parse({...input, ...sizeProps(getSize(size))});
const chatMarkup = (input: object, frame = 0) =>
  renderToStaticMarkup(createElement(ChatFrame, {props: chat(input), frame, durationInFrames: 480}));
const blockMarkup = (input: object, frame = 0) =>
  renderToStaticMarkup(createElement(BlockFrame, {props: block(input), frame, durationInFrames: 480}));

/** The `d` of the band's path in a markup, or null without the band. */
const bandOf = (markup: string, prefix: string) =>
  new RegExp(`<path id="${prefix}-margin" d="([^"]+)" fill-rule="([^"]+)" fill="([^"]+)"></path>`).exec(markup);

const panel = (strokeMargin?: number) =>
  layoutPanel({width: 400, height: 600, bleed: 32, radius: 12, strokeWidth: 6, padding: 16, glow: 20, halo: 24, strokeMargin});

test('margin layout: track and inner stay put at 0 and move in by the margin', () => {
  // A 400×600 box at (32, 32) with a 6 px stroke: the track is 3 px in, the inside 6 px in.
  for (const off of [panel(), panel(0)]) {
    assert.deepEqual(off.track, {x: 35, y: 35, width: 394, height: 594, radius: 9});
    assert.deepEqual(off.inner, {x: 38, y: 38, width: 388, height: 588, radius: 6});
  }
  // With 3 px of margin: 6 and 9 px in, the corners concentric with the box's.
  const on = panel(3);
  assert.deepEqual(on.track, {x: 38, y: 38, width: 388, height: 588, radius: 6});
  assert.deepEqual(on.inner, {x: 41, y: 41, width: 382, height: 582, radius: 3});
  assert.equal(on.strokeWidth, 6);
});

test('margin layout: shape and outset stay the box, the content loses twice the margin per axis', () => {
  const off = panel(0);
  const on = panel(3);
  assert.deepEqual(on.shape, {x: 32, y: 32, width: 400, height: 600, radius: 12});
  assert.deepEqual(on.shape, off.shape);
  assert.deepEqual(on.box, off.box);
  assert.deepEqual(on.canvas, off.canvas);
  assert.equal(on.outset, 24);
  assert.equal(on.outset, off.outset);
  assert.deepEqual(on.content, {x: off.content.x + 3, y: off.content.y + 3, width: off.content.width - 6, height: off.content.height - 6});
});

test('margin kinds: chat and block hand the margin to the layout at every size', () => {
  const kinds = [
    ['chat', chatLoopSchema, getChatLayout],
    ['block', blockLoopSchema, getBlockLayout],
  ] as const;
  for (const [kind, schema, layoutOf] of kinds) {
    for (const size of sizesForKind(kind)) {
      // The size's own props win (twitch-panel forces glow and halo to 0), as in a pack.
      const parsed = [ON, OFF].map((input) => schema.strict().safeParse({...input, ...sizeProps(size)}));
      for (const result of parsed) assert.equal(result.success, true, `${kind} ${size.id}: ${result.error?.issues[0]?.message}`);
      const [on, off] = parsed.map((result) => layoutOf(result.data as never));
      const id = `${kind} ${size.id}`;
      assert.deepEqual(on!.shape, off!.shape, id);
      assert.equal(on!.outset, off!.outset, id);
      assert.ok(on!.outset <= size.bleed, id);
      for (const key of ['track', 'inner'] as const) {
        assert.equal(on![key].x, off![key].x + 3, `${id}: ${key}.x`);
        assert.equal(on![key].y, off![key].y + 3, `${id}: ${key}.y`);
        assert.equal(on![key].width, off![key].width - 6, `${id}: ${key}.width`);
        assert.equal(on![key].height, off![key].height - 6, `${id}: ${key}.height`);
      }
      // The text area shrinks with the inside and never grows past it.
      assert.ok(on!.content.width < off!.content.width && on!.content.height < off!.content.height, `${id}: content`);
      assert.ok(on!.content.x >= on!.inner.x && on!.content.x + on!.content.width <= on!.inner.x + on!.inner.width, `${id}: content inside`);
    }
  }
});

test('margin bounds: 0 to 32 px, refused below and above', () => {
  // Roomy sizes, so the only thing that can refuse the band is its own range.
  for (const [kind, schema, size] of [['chat', chatLoopSchema, 'chat-standard'], ['block', blockLoopSchema, 'card']] as const) {
    const base = {...ON, ...sizeProps(getSize(size))};
    for (const strokeMargin of [-1, 33]) {
      const refused = schema.safeParse({...base, strokeMargin});
      assert.equal(refused.success, false, `${kind}: ${strokeMargin}`);
      assert.deepEqual(refused.error!.issues.map((issue) => issue.path.join('.')), ['strokeMargin'], `${kind}: ${strokeMargin}`);
    }
    for (const strokeMargin of [0, 32]) {
      const accepted = schema.safeParse({...base, strokeMargin});
      assert.equal(accepted.success, true, `${kind}: ${strokeMargin}: ${accepted.error?.issues[0]?.message}`);
    }
  }
});

test('margin refusal: open sides are refused with the way out in chat and block', () => {
  const message = /^The margin runs round the whole outline: use strokeSides all, or strokeMargin 0\.$/;
  for (const [kind, schema, size] of [['chat', chatLoopSchema, 'chat-standard'], ['block', blockLoopSchema, 'label']] as const) {
    const base = {...ON, ...sizeProps(getSize(size))};
    const refused = schema.safeParse({...base, strokeSides: 'top-bottom'});
    assert.equal(refused.success, false, kind);
    const issue = refused.error!.issues.find((entry) => entry.path.join('.') === 'strokeMargin');
    assert.ok(issue, `${kind}: issue on strokeMargin`);
    assert.match(issue.message, message);
    // Both ways out are accepted.
    assert.equal(schema.safeParse({...base, strokeSides: 'all'}).success, true, `${kind}: strokeSides all`);
    assert.equal(schema.safeParse({...base, strokeSides: 'top-bottom', strokeMargin: 0}).success, true, `${kind}: strokeMargin 0`);
  }
  // A round block keeps its whole outline with open sides, and the band is refused there all the same.
  const round = {...ON, ...sizeProps(getSize('circle'))};
  const refused = blockLoopSchema.safeParse({...round, strokeSides: 'top-bottom'});
  assert.equal(refused.success, false, 'circle');
  assert.match(refused.error!.issues.find((entry) => entry.path.join('.') === 'strokeMargin')?.message ?? '', message);
  assert.equal(blockLoopSchema.safeParse({...round, strokeSides: 'all'}).success, true, 'circle: strokeSides all');
});

test('margin off: the default draws no band, no element and no id', () => {
  assert.equal(chat().strokeMargin, 0);
  assert.equal(block().strokeMargin, 0);
  assert.equal(chat().strokeMarginColor, '#FFFFFF');
  assert.equal(block().strokeMarginColor, '#FFFFFF');
  for (const input of [{}, OFF]) {
    assert.deepEqual(getChatLayers(chat(input), 0, 480).margin, []);
    assert.deepEqual(getBlockLayers(block(input), 0, 480).margin, []);
    assert.equal(getChatScene(chat(input), 0, 480).some((element) => element.type === 'margin'), false);
    assert.equal(getBlockScene(block(input), 0, 480).some((element) => element.type === 'margin'), false);
    assert.equal(chatMarkup(input).includes('-margin'), false);
    assert.equal(blockMarkup(input).includes('-margin'), false);
  }
});

test('margin on: the band is the path of the shape plus the path of the track, evenodd, in its color', () => {
  // chat-standard: the 400×600 box at (32, 32), radius 12; the track of a 6 px line 3 px in is 6 px in, radius 6.
  const chatBand = bandOf(chatMarkup(ON), 'chat');
  assert.ok(chatBand, 'chat: band');
  assert.equal(chatBand[1],
    'M44 32H420A12 12 0 0 1 432 44V620A12 12 0 0 1 420 632H44A12 12 0 0 1 32 620V44A12 12 0 0 1 44 32Z'
    + 'M44 38H420A6 6 0 0 1 426 44V620A6 6 0 0 1 420 626H44A6 6 0 0 1 38 620V44A6 6 0 0 1 44 38Z');
  assert.deepEqual([chatBand[2], chatBand[3]], ['evenodd', '#F6E2E4']);
  // label: the 480×96 box at (24, 24).
  const blockBand = bandOf(blockMarkup(ON), 'block');
  assert.ok(blockBand, 'block: band');
  assert.equal(blockBand[1],
    'M36 24H492A12 12 0 0 1 504 36V108A12 12 0 0 1 492 120H36A12 12 0 0 1 24 108V36A12 12 0 0 1 36 24Z'
    + 'M36 30H492A6 6 0 0 1 498 36V108A6 6 0 0 1 492 114H36A6 6 0 0 1 30 108V36A6 6 0 0 1 36 30Z');
  assert.deepEqual([blockBand[2], blockBand[3]], ['evenodd', '#F6E2E4']);
  // One band, once: it is not drawn again under the stroke's glow.
  assert.equal(chatMarkup(ON).split('-margin').length, 2);
  assert.equal(blockMarkup(ON).split('-margin').length, 2);
});

test('margin order: the band comes after the fill and before the rim light and the stroke', () => {
  const places = (markup: string, ids: readonly string[]) => ids.map((id) => {
    const at = markup.indexOf(`id="${id}"`);
    assert.ok(at >= 0, `${id} in the markup`);
    return at;
  });
  const rising = (list: readonly number[]) => list.every((at, index) => index === 0 || at > list[index - 1]!);
  const chatIds = ['chat-fill-clip', 'chat-header-clip', 'chat-margin', 'chat-rim-rim-0', 'chat-stroke-glow'];
  assert.ok(rising(places(chatMarkup({...ON, rimLight: 0.5}), chatIds)), chatIds.join(' < '));
  const blockIds = ['block-fill-clip', 'block-accent-clip', 'block-margin', 'block-rim-rim-0', 'block-stroke-glow'];
  assert.ok(rising(places(blockMarkup({...ON, rimLight: 0.5, accent: 'top'}), blockIds)), blockIds.join(' < '));
});

test('margin still: the same band on every frame, outside the stroke elements', () => {
  const band = [{type: 'margin', color: '#F6E2E4'}];
  const input = {...ON, rimLight: 0.5};
  for (const frame of [0, 200]) {
    const chatLayers = getChatLayers(chat(input), frame, 480);
    const blockLayers = getBlockLayers(block(input), frame, 480);
    assert.deepEqual(chatLayers.margin, band);
    assert.deepEqual(blockLayers.margin, band);
    // Never among what the stroke layer draws (and blurs for the glow).
    for (const element of [...chatLayers.stroke, ...chatLayers.divider, ...blockLayers.stroke, ...blockLayers.glow]) {
      assert.notEqual(element.type, 'margin');
    }
    // Listed by place in the flat scene: once, right before the rim light.
    for (const scene of [getChatScene(chat(input), frame, 480), getBlockScene(block(input), frame, 480)]) {
      const types = scene.map((element) => element.type);
      assert.equal(types.filter((type) => type === 'margin').length, 1);
      assert.equal(types[types.indexOf('margin') + 1], 'rim');
    }
  }
  assert.equal(bandOf(chatMarkup(ON, 0), 'chat')![0], bandOf(chatMarkup(ON, 200), 'chat')![0]);
  assert.equal(bandOf(blockMarkup(ON, 0), 'block')![0], bandOf(blockMarkup(ON, 200), 'block')![0]);
});

test('chat stroke weight: 2 to 3 px, or exactly the weight a named exception gives', () => {
  // The kind's rule.
  assert.equal(chatStrokeWidthFits(2), true);
  assert.equal(chatStrokeWidthFits(3), true);
  assert.equal(chatStrokeWidthFits(1.5), false);
  assert.equal(chatStrokeWidthFits(6), false);
  // A named exception is one exact weight, never a wider range.
  assert.equal(chatStrokeWidthFits(6, 6), true);
  assert.equal(chatStrokeWidthFits(3, 6), false);
  assert.equal(chatStrokeWidthFits(5, 6), false);
  assert.equal(chatStrokeWidthFits(7, 6), false);
});
