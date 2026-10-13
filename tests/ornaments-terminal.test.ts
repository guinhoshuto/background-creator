import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getChatLayers} from '../src/overlays/chat/ChatLoop';
import {type OrnamentElement} from '../src/overlays/shared';
import {LINE, STAFF, TICKS, type TerminalPlacement} from '../src/overlays/shared/ornaments/sets/terminal-place';
import {getSize} from '../src/sizes';
import {framesOf, kitProps, kitSizeIds, ORNAMENT_KINDS, type OrnamentKindName} from './helpers/ornament-kinds';

/**
 * The terminal set (TerminalGridLoop, the old HTML pack's v3 shapes) beyond the shared harness:
 * the motifs each file of the kit carries, the pack's measures (7 px squares every 14 px at .75,
 * 24 dial ticks, a five-line staff), the lock diamond kept whole on the scaled frames, the pack's
 * rhythms and frame-0 pose, and the kit's colours. Run with `npx tsx --test tests/ornaments-terminal.test.ts`.
 */

const THEME = 'sand-terminal';
const INK = '#45423A';

const kitCase = (sizeId: string, extra: Record<string, unknown> = {}) => {
  const size = getSize(sizeId);
  const adapter = ORNAMENT_KINDS[size.kind as OrnamentKindName];
  const props = adapter.parse(kitProps(THEME, size, extra));
  const layout = adapter.ornamentLayout(props);
  return {adapter, props, frame: layout.frame, placements: layout.placements as readonly TerminalPlacement[]};
};

/** The ink elements (part 1) of a file at a frame; the rims are part 0. */
const inksAt = (sizeId: string, frame: number) => {
  const {adapter, props} = kitCase(sizeId);
  const {back, front} = adapter.layers(props, frame, framesOf(props));
  return [...back, ...front].filter((element) => element.part === 1);
};

const motifsOf = (sizeId: string) => [...new Set(kitCase(sizeId).placements.map((placement) => placement.motif))].sort();

test('terminal: em todo arquivo com enfeites do kit, os motivos do pack no lugar deles', () => {
  const expected: Record<string, string[]> = {
    chat: ['head', 'meter', 'square'],
    block: ['dbar', 'square'],
    wide: ['dbar', 'square', 'staff'],
    roundBlock: ['square', 'tick'],
    frame: ['bracket-h', 'bracket-v', 'diamond', 'square'],
    roundFrame: ['diamond', 'square', 'tick'],
  };
  const sizes = kitSizeIds(THEME);
  assert.equal(sizes.length, 24);
  for (const id of sizes) {
    const size = getSize(id);
    const round = size.props?.shape === 'circle';
    const group = size.kind === 'chat' ? 'chat'
      : size.kind === 'block' ? (round ? 'roundBlock' : size.width >= STAFF.minWidth ? 'wide' : 'block')
        : (round ? 'roundFrame' : 'frame');
    assert.deepEqual(motifsOf(id), expected[group], id);
    // The row of squares is the hero: listed first, on the top edge.
    const [first] = kitCase(id).placements;
    assert.deepEqual([first!.motif, first!.slot], ['square', 'top'], id);
  }
});

test('terminal: a fileira do pack, quadrados de 7 px a cada 14 px em px inteiro, a .75 de tinta, a 10 px da linha', () => {
  for (const id of ['chat-standard', 'label', 'title', 'webcam-16x9', 'circle']) {
    const {frame, placements} = kitCase(id);
    const squares = placements.filter((placement) => placement.motif === 'square');
    assert.ok(squares.length >= 5, id);
    for (const [index, square] of squares.entries()) {
      assert.deepEqual([square.x1 - square.x0, square.y1 - square.y0], [7, 7], id);
      assert.ok(Number.isInteger(square.x0) && Number.isInteger(square.y0), `${id}: px inteiro`);
      assert.equal(square.y0, squares[0]!.y0, id);
      // Every 14 px from the first, the row's gap over a frame's diamond aside.
      if (index > 0) assert.ok(square.x0 - squares[index - 1]!.x0 >= 14 && (square.x0 - squares[0]!.x0) % 14 === 0, `${id}: passo de 14`);
    }
    // The row's bottom 10 px above the line's outer edge (the pack's 7 px squares 25 px over a 40 px head row, re-measured on a line).
    const edge = frame.track.y - LINE.half;
    assert.equal(Math.round(edge - squares[0]!.y1), 10, id);
    for (const ink of inksAt(id, 0).filter((element) => element.type === 'terminal-square')) {
      assert.deepEqual([ink.color, ink.alpha], [INK, 0.75], id);
    }
  }
});

test('terminal: o mostrador do radar nos redondos, 24 marcas de 15° em 15° (4 px, as quatro cardeais de 7), de pé na linha, menos a que o losango cobre', () => {
  for (const id of ['circle-sm', 'circle', 'circle-lg', 'webcam-round-sm', 'webcam-round', 'webcam-round-lg']) {
    const {frame, placements} = kitCase(id);
    const ticks = placements.filter((placement) => placement.motif === 'tick');
    // A round frame's diamond stands on the top tick (index 18, at 270°), which goes; the rest are all there.
    const diamond = placements.find((placement) => placement.motif === 'diamond');
    const indices = Array.from({length: TICKS.count}, (_, index) => index).filter((index) => !diamond || index !== 18);
    assert.deepEqual(ticks.map((tick) => Math.round((tick.angle * 12) / Math.PI)), indices, id);
    if (diamond) {
      for (const tick of ticks) assert.ok(Math.hypot(tick.x - diamond.x, tick.y - diamond.y) >= diamond.extent + tick.extent, `${id}: marca sob o losango`);
    }
    const radius = frame.track.width / 2 + LINE.half;
    const cx = frame.track.x + frame.track.width / 2;
    const cy = frame.track.y + frame.track.height / 2;
    for (const [at, tick] of ticks.entries()) {
      const index = indices[at]!;
      assert.ok(Math.abs(tick.angle - (index * Math.PI) / 12) < 1e-9, `${id}: ângulo da marca ${index}`);
      assert.ok(Math.abs(tick.x1 - tick.x0 - (index % 6 === 0 ? 7 : 4)) < 1e-9, `${id}: comprimento da marca ${index}`);
      assert.ok(Math.abs(tick.y1 - tick.y0 - 2) < 1e-9, id);
      // Its foot on the line's outer edge, its tip outward.
      const foot = Math.hypot(tick.x - cx, tick.y - cy) - (tick.x1 - tick.x0) / 2;
      assert.ok(Math.abs(foot - radius) < 1e-9, `${id}: pé da marca ${index} a ${foot}, linha a ${radius}`);
    }
  }
});

test('terminal: a pauta do pack sob um título, cinco linhas de 1 px a cada 6 px, 384 px desde a ponta direita, em pedaços que se encostam', () => {
  for (const id of ['title', 'lower-third']) {
    const {frame, placements} = kitCase(id);
    const pieces = placements.filter((placement) => placement.motif === 'staff').sort((a, b) => a.x0 - b.x0);
    assert.ok(pieces.length > 1, id);
    const edge = {right: frame.track.x + frame.track.width + LINE.half, bottom: frame.track.y + frame.track.height + LINE.half};
    assert.equal(pieces.at(-1)!.x1, Math.round(edge.right), id);
    assert.equal(pieces.at(-1)!.x1 - pieces[0]!.x0, 384, id);
    for (const [index, piece] of pieces.entries()) {
      if (index > 0) assert.equal(piece.x0, pieces[index - 1]!.x1, `${id}: pedaços encostados`);
      // Five 1 px lines on whole rows: the band is 4 pitches of 6 plus the last line.
      assert.equal(piece.y1 - piece.y0, 25, id);
      assert.ok(Number.isInteger(piece.y0), `${id}: linhas em px inteiro`);
      assert.equal(piece.y0, Math.round(edge.bottom + STAFF.gap), id);
    }
    for (const ink of inksAt(id, 0).filter((element) => element.type === 'terminal-staff')) {
      assert.deepEqual([ink.color, ink.alpha], [INK, 0.5], id);
    }
  }
  for (const id of ['label', 'card', 'list']) assert.ok(!motifsOf(id).includes('staff'), `${id}: estreito demais`);
});

test('terminal: nas molduras com ornamentScale (gameplay, câmera grande) o losango fica inteiro, subindo com a linha ainda nele', () => {
  for (const id of ['webcam-16x9', 'webcam-16x9-lg', 'gameplay']) {
    const {frame, placements} = kitCase(id);
    const diamond = placements.find((placement) => placement.motif === 'diamond');
    assert.ok(diamond, `${id}: losango`);
    // The nominal side (12 px at ornamentSize 14, in the frame's own scale), never shrunk.
    assert.equal(diamond.x1 - diamond.x0, 12, id);
    assert.equal(diamond.x, frame.track.x + frame.track.width / 2, id);
    // The frame line crosses it, at least 1 px inside its lower tip.
    const half = (diamond.x1 - diamond.x0) / Math.SQRT2;
    assert.ok(frame.track.y > diamond.y - half && frame.track.y <= diamond.y + half - 1, `${id}: linha em ${frame.track.y}, losango ${diamond.y} ± ${half}`);
  }
  // Where there is room it sits centred on the line.
  const plain = kitCase('webcam-16x9');
  assert.equal(plain.placements.find((placement) => placement.motif === 'diamond')!.y, plain.frame.track.y);
});

test('terminal: ritmos do pack (6 pulsos do losango, uma volta da varredura e o sinal entre duas e cinco barras por loop)', () => {
  const n = framesOf(kitCase('webcam-round').props);
  assert.equal(n, 960);
  const diamond: number[] = [];
  // The round webcam's 23 ticks (its diamond covers the top one).
  const tickPeaks = new Array<number>(TICKS.count - 1).fill(0);
  for (let at = 0; at < n; at++) {
    const inks = inksAt('webcam-round', at);
    diamond.push(inks.find((element) => element.type === 'terminal-diamond')!.alpha as number);
    inks.filter((element) => element.type === 'terminal-tick').forEach((tick, index) => {
      const previous = inksAt('webcam-round', (at + n - 1) % n).filter((element) => element.type === 'terminal-tick')[index]!;
      if ((tick.alpha as number) > 0.99 && (previous.alpha as number) <= 0.99) tickPeaks[index]! += 1;
    });
  }
  const peaks = diamond.filter((value, at) => value > diamond[(at + n - 1) % n]! && value >= diamond[(at + 1) % n]!).length;
  assert.equal(peaks, 6, 'pulsos do losango');
  assert.ok(Math.abs(Math.max(...diamond) - 0.95) < 1e-3 && Math.abs(Math.min(...diamond) - 0.55) < 1e-3);
  // Each tick lights once per loop.
  assert.deepEqual(tickPeaks, new Array<number>(TICKS.count - 1).fill(1));
  let low = 5;
  let high = 0;
  for (let at = 0; at < n; at += 4) {
    const meter = inksAt('chat-standard', at).find((element) => element.type === 'terminal-meter')!;
    const level = [0, 1, 2, 3, 4].reduce((sum, bar) => sum + (meter[`level${bar}`] as number), 0);
    low = Math.min(low, level);
    high = Math.max(high, level);
  }
  assert.ok(low >= 2 && low < 3 && high > 4.5 && high <= 5, `sinal de ${low} a ${high}`);
});

test('terminal: no quadro 0 (o PNG do pack) o losango aceso, quatro barras de cinco e a varredura em baixo à direita', () => {
  const at0 = inksAt('webcam-round', 0);
  assert.ok(Math.abs((at0.find((element) => element.type === 'terminal-diamond')!.alpha as number) - 0.95) < 1e-9);
  const ticks = at0.filter((element) => element.type === 'terminal-tick');
  // The sweep on the 45° tick (index 3): fully lit, the one ahead at rest, the ones behind fading.
  assert.equal(ticks[3]!.alpha, 1);
  assert.equal(ticks[4]!.alpha, 0.6);
  assert.ok((ticks[2]!.alpha as number) < 1 && (ticks[2]!.alpha as number) > (ticks[0]!.alpha as number));
  const meter = inksAt('chat-standard', 0).find((element) => element.type === 'terminal-meter')!;
  assert.deepEqual([0, 1, 2, 3, 4].map((bar) => meter[`level${bar}`]), [1, 1, 1, 1, 0]);
});

test('terminal: as cores do kit (tinta, acento no losango, claro no quadradinho do cabeçalho e no aro) e a linha do rodapé', () => {
  const of = (elements: OrnamentElement[], type: string) => elements.find((element) => element.type === type)!;
  const cam = inksAt('webcam-16x9', 0);
  assert.equal(of(cam, 'terminal-bracket').color, INK);
  assert.equal(of(cam, 'terminal-diamond').color, '#C05B41');
  const {adapter, props} = kitCase('chat-standard');
  const {front} = adapter.layers(props, 0, framesOf(props));
  assert.equal(of(front.filter((element) => element.part === 1), 'terminal-head').color, '#DCD8C4');
  const rims = front.filter((element) => element.part === 0);
  assert.ok(rims.length > 0 && rims.every((element) => element.color === '#DCD8C4' && element.alpha === 0.4));
  // The footer's line is the pack's line-2: the ink at .22, in its own colour (not the outline's glint), 2 px.
  const footer = getChatLayers(props as never, 0, framesOf(props)).divider.at(-1)!;
  assert.deepEqual([footer.color0, footer.colorCount, footer.opacity, footer.width], [INK, 1, 0.22, 2]);
});
