import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BlockFrame, blockLoopSchema} from '../src/overlays/block/BlockLoop';
import {ChatFrame, chatLoopSchema, getChatLayers, getChatLayout} from '../src/overlays/chat/ChatLoop';
import {getSize, sizeProps} from '../src/sizes';

/**
 * Two panel pieces the sand-terminal kit brought (2026-10-12): an outline open at the sides
 * (`strokeSides: 'top-bottom'`, chat and block) and the chat's footer (`footerHeight`), the mirror
 * of its header. Run with `npx tsx --test tests/panel-sides-footer.test.ts`.
 */

const chat = (input: object = {}) => chatLoopSchema.parse({...sizeProps(getSize('chat-standard')), ...input});
const block = (input: object = {}) => blockLoopSchema.parse({...sizeProps(getSize('label')), ...input});
const chatMarkup = (input: object) => renderToStaticMarkup(createElement(ChatFrame, {props: chat(input), frame: 123, durationInFrames: 480}));
const blockMarkup = (input: object) => renderToStaticMarkup(createElement(BlockFrame, {props: block(input), frame: 123, durationInFrames: 480}));

/** The rects of the open-sides clip path in a markup: [y, height] of each `M…` rect. */
const sideBands = (markup: string, prefix: string) => {
  const match = new RegExp(`<clipPath id="${prefix}-stroke-sides"[^>]*><path d="([^"]+)"`).exec(markup);
  if (!match) return null;
  return [...match[1]!.matchAll(/M(-?[\d.]+) (-?[\d.]+)H(-?[\d.]+)V(-?[\d.]+)/g)].map(([, , y0, , y1]) => [Number(y0), Number(y1) - Number(y0)]);
};

test('strokeSides: o padrão desenha os quatro lados, sem recorte', () => {
  assert.equal(chat().strokeSides, 'all');
  assert.equal(block().strokeSides, 'all');
  assert.equal(sideBands(chatMarkup({}), 'chat'), null);
  assert.equal(sideBands(blockMarkup({}), 'block'), null);
});

test('strokeSides top-bottom: o traço fica recortado em duas faixas, nas linhas de cima e de baixo da trilha', () => {
  for (const [markup, prefix, props] of [
    [chatMarkup({strokeSides: 'top-bottom', strokeWidth: 2}), 'chat', chat({strokeSides: 'top-bottom', strokeWidth: 2})],
    [blockMarkup({strokeSides: 'top-bottom', strokeWidth: 2}), 'block', block({strokeSides: 'top-bottom', strokeWidth: 2})],
  ] as const) {
    const bands = sideBands(markup, prefix);
    assert.ok(bands, `${prefix}: clip das faixas`);
    assert.equal(bands.length, 2, prefix);
    const box = {y: props.bleed, height: props.height};
    const track = {top: box.y + props.strokeWidth / 2, bottom: box.y + box.height - props.strokeWidth / 2};
    const [top, bottom] = bands as [number, number][];
    // Each band holds its line (centre on the track) and is no taller than the stroke plus 1 px a side.
    assert.ok(Math.abs(top[0] + top[1] / 2 - track.top) < 1e-6, `${prefix}: faixa de cima no traço de cima`);
    assert.ok(Math.abs(bottom[0] + bottom[1] / 2 - track.bottom) < 1e-6, `${prefix}: faixa de baixo no traço de baixo`);
    for (const [, height] of bands) assert.ok(height >= props.strokeWidth && height <= props.strokeWidth + 2 + 1e-9, `${prefix}: altura ${height}`);
  }
});

test('strokeSides top-bottom: o movimento ao longo do contorno não muda, só o que se desenha dele', () => {
  const open = getChatLayers(chat({strokeSides: 'top-bottom', strokeMotion: 'comets'}), 200, 960);
  const closed = getChatLayers(chat({strokeMotion: 'comets'}), 200, 960);
  assert.deepEqual(open.stroke, closed.stroke);
});

test('rodapé: o padrão é sem rodapé, e o layout fica o de antes', () => {
  const plain = getChatLayout(chat());
  assert.equal(plain.footer, null);
  assert.equal(plain.footerDivider, null);
  assert.deepEqual(getChatLayout(chat({footerHeight: 0, footerLineWidth: 3})).content, plain.content);
});

test('rodapé: tira a altura dele e da linha do fim das mensagens, e a linha fica logo acima dele', () => {
  const plain = getChatLayout(chat({headerHeight: 40, headerLineWidth: 0, glow: 2}));
  const layout = getChatLayout(chat({headerHeight: 40, headerLineWidth: 0, glow: 2, footerHeight: 45, footerLineWidth: 1}));
  const inner = layout.inner;
  assert.deepEqual(layout.footer, {x: inner.x, y: inner.y + inner.height - 45, width: inner.width, height: 45});
  assert.deepEqual(layout.footerDivider, {x: inner.x, y: inner.y + inner.height - 46, width: inner.width, height: 1});
  assert.equal(layout.content.y, plain.content.y);
  assert.equal(layout.content.y + layout.content.height, plain.content.y + plain.content.height - 46);
  // The ornaments may use the footer: it is not one of their text areas.
  assert.equal(layout.ornamentLayout.frame.keepOut.some((area) => area.y + area.height > layout.footerDivider!.y), false);
});

test('rodapé: a linha entra com a opacidade dela, e sem linha nenhuma com opacidade 0', () => {
  const layers = getChatLayers(chat({headerHeight: 40, glow: 2, footerHeight: 45, footerLineWidth: 1, footerLineOpacity: 0.22}), 0, 960);
  const lines = layers.divider.map((element) => element.opacity);
  assert.deepEqual(lines, [0.9, 0.22]);
  assert.equal(getChatLayers(chat({headerHeight: 40, glow: 2, footerHeight: 45, footerLineOpacity: 0}), 0, 960).divider.length, 1);
});

test('rodapé: alto demais para as mensagens é recusado com a saída', () => {
  const result = chatLoopSchema.safeParse({...sizeProps(getSize('chat-standard')), footerHeight: 512});
  assert.equal(result.success, false);
  const issue = result.error!.issues.find((entry) => entry.path[0] === 'footerHeight');
  assert.ok(issue, 'recusa em footerHeight');
  assert.match(issue.message, /reduce footerHeight/);
});

test('strokeSides top-bottom: o cabeçalho, o rodapé e as linhas vão de lado a lado, sem a fresta do traço que não é desenhado', () => {
  const input = {strokeWidth: 3, glow: 2, headerHeight: 40, headerLineWidth: 1, footerHeight: 45, footerLineWidth: 1};
  const open = getChatLayout(chat({...input, strokeSides: 'top-bottom'}));
  for (const rect of [open.headerBand, open.divider, open.footer, open.footerDivider]) {
    assert.ok(rect);
    assert.equal(rect.x, open.shape.x);
    assert.equal(rect.width, open.shape.width);
  }
  assert.deepEqual({x: open.bandArea.x, width: open.bandArea.width}, {x: open.shape.x, width: open.shape.width});
  assert.equal(open.bandArea.y, open.inner.y);
  // Closed sides keep the bands inside the stroke, as before.
  const closed = getChatLayout(chat(input));
  assert.equal(closed.headerBand!.x, closed.inner.x);
  assert.equal(closed.footer!.width, closed.inner.width);
  assert.deepEqual(closed.bandArea, closed.inner);
});
