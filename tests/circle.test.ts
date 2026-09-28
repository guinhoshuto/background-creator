import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {resolveExport} from '../scripts/export';
import {planPack, realPackDeps, type PackManifest} from '../scripts/pack-plan';
import {buildExportOptions, parseRenderArgs} from '../scripts/render-args';
import {
  ACCENT_ARC_SPREAD, BlocoFrame, blocoLoopSchema, contentGlowOpacity, getBlocoLayers, getBlocoLayout, getBlocoScene, type AccentArc,
  type BlocoLoopProps,
} from '../src/overlays/block';
import {
  BordaFrame, bordaLoopSchema, getBordaGeometry, getBordaLayout, getBordaMask, getBordaMaskElement, getBordaScene, getBordaSceneParts,
  type BordaLoopProps,
} from '../src/overlays/border';
import {
  MAX_CONTENT_OPACITY, PANEL_SHAPES, arcBandPath, contentClearance, fitPeriod, getStrokeMotion, inscribedRect, isCircle,
  lapsFor, perimeterLength, pointAt, rectContains, roundRectPath, roundRectSdf, samplePerimeter, shapeRadius,
  type Rect,
} from '../src/overlays/shared';
import {getCompositionMetadata} from '../src/settings';
import {
  NAMED_SIZES, assetFileName, canvasOf, getSize, matchNamedSize, sizeProps, sizeTag,
} from '../src/sizes';
import {cornersOf} from './helpers/glow-brute';
import {assertSeamVelocity, type Sampler} from './helpers/scene-scans';
import {OVERLAY_THEMES} from './helpers/themes';

/**
 * Round blocks and round webcam borders: the shape prop, the round named sizes, the text area in
 * a circle, the decorations that follow it, the round window's mask and the files a pack sells.
 * The generic scans (determinism, periodicity, seam velocity) run on them in backgrounds.test.ts.
 */

const THEMES = OVERLAY_THEMES;
const presetOf = (kind: 'block' | 'border', theme: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../presets/${kind}-${theme}.json`, import.meta.url), 'utf8'));

const parseBlock = (input: object): BlocoLoopProps => blocoLoopSchema.parse(input);
const parseBorder = (input: object): BordaLoopProps => bordaLoopSchema.parse(input);
const messagesOf = (schema: typeof blocoLoopSchema | typeof bordaLoopSchema, input: object) =>
  schema.safeParse(input).error?.issues.map((issue) => [issue.path.join('.'), issue.message]) ?? [];

const ROUND_BLOCOS = ['circulo-p', 'circulo', 'circulo-g'] as const;
const ROUND_BORDAS = ['webcam-redonda-p', 'webcam-redonda', 'webcam-redonda-g'] as const;
const sized = (id: string) => sizeProps(getSize(id));

/** Every corner of the rect lies within the inner edge of the arc's band. */
const arcClearOf = (arc: AccentArc, area: Rect) =>
  cornersOf(area).every(([x, y]) => Math.hypot(x - arc.cx, y - arc.cy) <= arc.outer - arc.width + 1e-9);

// ── The shape prop ──────────────────────────────────────────────────────────────────────────

test('Forma: bloco e borda começam retangulares; circulo é uma opção do schema, com descrição em inglês', () => {
  assert.deepEqual(PANEL_SHAPES, ['retangulo', 'circulo']);
  for (const schema of [blocoLoopSchema, bordaLoopSchema]) {
    assert.equal(schema.parse({}).shape, 'retangulo');
    assert.equal(schema.safeParse({shape: 'oval'}).success, false);
  }
  for (const schema of [blocoLoopSchema, bordaLoopSchema]) {
    assert.match(schema.shape.shape.unwrap().description ?? '', /circulo.*must be square/);
    assert.match(schema.shape.radius.unwrap().description ?? '', /with shape circulo it is ignored, the radius is half the side/);
  }
});

test('Forma: o círculo pede largura igual à altura, com a saída na mensagem', () => {
  assert.deepEqual(messagesOf(blocoLoopSchema, {shape: 'circulo'}), [[
    'shape', 'A circle needs equal width and height (the box is 640×360): use --size circulo-p, circulo or circulo-g, make width and height equal or use shape retangulo.',
  ]]);
  assert.deepEqual(messagesOf(bordaLoopSchema, {shape: 'circulo'}), [[
    'shape', 'A circle needs equal width and height (the box is 640×360): use --size webcam-redonda-p, webcam-redonda or webcam-redonda-g, make width and height equal or use shape retangulo.',
  ]]);
  // Each way out is accepted.
  assert.equal(blocoLoopSchema.safeParse({shape: 'circulo', width: 360}).success, true);
  assert.equal(blocoLoopSchema.safeParse({...sized('circulo'), shape: 'circulo'}).success, true);
  assert.equal(blocoLoopSchema.safeParse({shape: 'retangulo'}).success, true);
  assert.equal(bordaLoopSchema.safeParse({shape: 'circulo', width: 360}).success, true);
  // Even a mask needs a square for a circle.
  assert.deepEqual(messagesOf(bordaLoopSchema, {shape: 'circulo', mascara: true, bleed: 0, outputFormat: 'png'})[0]![0], 'shape');
});

test('Forma: moldura de tela não pode ser círculo; a mensagem aponta a câmera redonda', () => {
  const screen = {...sized('tela-cheia'), width: 1080, height: 1080, shape: 'circulo'};
  assert.deepEqual(messagesOf(bordaLoopSchema, screen), [[
    'shape', 'A screen frame follows the screen, which is rectangular: use shape retangulo with fit tela, or fit janela for a round camera (--size webcam-redonda).',
  ]]);
  assert.equal(bordaLoopSchema.safeParse({...screen, shape: 'retangulo'}).success, true);
  assert.equal(bordaLoopSchema.safeParse({...sized('webcam-redonda')}).success, true);
  // A round screen frame in a wide box gets only this refusal, not first the square-box one whose
  // way out (square the box) would lead straight back here.
  const wide = {...sized('tela-cheia'), shape: 'circulo'};
  assert.deepEqual(messagesOf(bordaLoopSchema, wide), messagesOf(bordaLoopSchema, screen));
  assert.equal(bordaLoopSchema.safeParse({...wide, shape: 'retangulo'}).success, true);
});

test('Forma: no círculo o raio é metade do lado, diga o radius o que disser', () => {
  for (const radius of [0, 16, 200, 1920]) {
    assert.equal(shapeRadius({shape: 'circulo', radius, width: 400, height: 400}), 200);
    assert.equal(shapeRadius({shape: 'retangulo', radius, width: 400, height: 400}), radius);
    const round = getBlocoLayout(parseBlock({...sized('circulo'), radius}));
    assert.equal(round.shape.radius, 160);
    assert.ok(round.circle && isCircle(round.shape) && isCircle(round.inner) && isCircle(round.track));
    assert.deepEqual(round, getBlocoLayout(parseBlock({...sized('circulo'), radius: 7})), 'o raio pedido não muda nada');
    const window = getBordaGeometry(parseBorder({...sized('webcam-redonda'), radius})).layout;
    assert.deepEqual([window.window.radius, window.holeShape.radius], [200, 200]);
  }
  // A square with the old trick (radius ≥ half the side) is a circle too, laid out the same way.
  const trick = getBlocoLayout(parseBlock({...sized('circulo'), shape: 'retangulo', radius: 999}));
  assert.ok(trick.circle);
  assert.deepEqual(trick.content, getBlocoLayout(parseBlock(sized('circulo'))).content);
  assert.equal(getBlocoLayout(parseBlock(sized('quadrado'))).circle, false);
});

// ── Named sizes ─────────────────────────────────────────────────────────────────────────────

test('Tamanhos redondos: caixa quadrada, bleed, arquivo = caixa + 2·bleed e forma fixada pelo tamanho', () => {
  const expected = {
    'circulo-p': [160, 24, 208], circulo: [320, 32, 384], 'circulo-g': [480, 32, 544],
    'webcam-redonda-p': [280, 48, 376], 'webcam-redonda': [400, 48, 496], 'webcam-redonda-g': [560, 48, 656],
  } as const;
  for (const [id, [side, bleed, file]] of Object.entries(expected)) {
    const size = getSize(id);
    assert.deepEqual([size.width, size.height, size.bleed], [side, side, bleed], id);
    assert.deepEqual(canvasOf(size), {width: file, height: file}, id);
    assert.equal(size.props?.shape, 'circulo', id);
    if (size.kind === 'border') assert.equal(size.props?.fit, 'janela', id);
  }
  // Every block and border size spells its shape out, so a size id alone fixes the product; the chat has none.
  for (const size of NAMED_SIZES) {
    if (size.kind === 'chat') {
      assert.equal(size.props?.shape, undefined, size.id);
      continue;
    }
    assert.ok(size.props?.shape, size.id);
    assert.equal(size.props.shape === 'circulo', size.id.startsWith('circulo') || size.id.startsWith('webcam-redonda'), size.id);
    if (size.props.shape === 'circulo') assert.equal(size.width, size.height, size.id);
  }
  assert.match(getSize('webcam-quadrada').use, /webcam-redonda/);
  assert.doesNotMatch(getSize('webcam-quadrada').use, /radius 200/);
});

test('Tamanhos redondos: um tamanho retangular desenha retângulo mesmo sobre um preset redondo, e vice-versa', () => {
  const roundPreset = {...presetOf('border', 'neon'), shape: 'circulo'};
  const rect = parseBorder({...roundPreset, ...sized('webcam-16x9')});
  assert.equal(rect.shape, 'retangulo');
  assert.equal(getBordaGeometry(rect).layout.window.radius, 16);
  const square = parseBorder({...roundPreset, ...sized('webcam-quadrada')});
  assert.equal(square.shape, 'retangulo');
  const round = parseBorder({...presetOf('border', 'neon'), ...sized('webcam-redonda')});
  assert.equal(round.shape, 'circulo');
  const card = parseBlock({...presetOf('block', 'neon'), shape: 'circulo', ...sized('cartao')});
  assert.equal(card.shape, 'retangulo');
});

test('Tamanhos redondos: quadrado e círculo da mesma caixa são produtos diferentes, também no nome', () => {
  const box = {width: 400, height: 400, bleed: 48, fit: 'janela'};
  assert.equal(matchNamedSize('border', box)?.id, 'webcam-quadrada');
  assert.equal(matchNamedSize('border', {...box, shape: 'retangulo'})?.id, 'webcam-quadrada');
  assert.equal(matchNamedSize('border', {...box, shape: 'circulo'})?.id, 'webcam-redonda');
  assert.equal(matchNamedSize('block', {width: 480, height: 480, bleed: 32, shape: 'retangulo'})?.id, 'quadrado');
  assert.equal(matchNamedSize('block', {width: 480, height: 480, bleed: 32, shape: 'circulo'})?.id, 'circulo-g');
  // Masks match by the box and the shape.
  assert.equal(matchNamedSize('border', {...box, bleed: 0, mascara: true, shape: 'circulo'})?.id, 'webcam-redonda');
  assert.equal(matchNamedSize('border', {...box, bleed: 0, mascara: true})?.id, 'webcam-quadrada');
  // A free circle never takes the square's name.
  assert.equal(sizeTag('block', {width: 300, height: 300, bleed: 24, shape: 'circulo'}), '300x300-circulo');
  assert.equal(sizeTag('block', {width: 300, height: 300, bleed: 24, shape: 'retangulo'}), '300x300');
  assert.equal(assetFileName({id: 'BorderLoop', kind: 'border', props: {...box, shape: 'circulo'}, format: 'webm'}), 'BorderLoop-webcam-redonda.webm');
  assert.equal(
    assetFileName({id: 'BorderLoop', kind: 'border', props: {...box, bleed: 0, shape: 'circulo', mascara: true}, format: 'png'}),
    'BorderLoop-webcam-redonda-mascara.png',
  );
});

// ── The text area in a circle ───────────────────────────────────────────────────────────────

test('Bloco redondo: o texto vai no quadrado centralizado, em px inteiros, com o maior padding até o contorno', () => {
  const inputs = [{}, ...THEMES.map((theme) => presetOf('block', theme)), {accent: 'topo', accentSize: 20, paddingX: 4, paddingY: 30}];
  for (const input of inputs) {
    for (const id of ROUND_BLOCOS) {
      const props = parseBlock({...input, ...sized(id)});
      const layout = getBlocoLayout(props);
      const label = `${JSON.stringify(input).slice(0, 30)} ${id}`;
      const {inner, content} = layout;
      const centre = {x: layout.box.x + layout.box.width / 2, y: layout.box.y + layout.box.height / 2};
      for (const value of Object.values(content)) assert.ok(Number.isInteger(value), `${label}: px inteiros`);
      assert.equal(content.width, content.height, `${label}: quadrado`);
      assert.equal(content.width % 2, 0, `${label}: lado par, centrado em px inteiros`);
      assert.deepEqual([content.x + content.width / 2, content.y + content.height / 2], [centre.x, centre.y], `${label}: centralizado`);
      // Every corner keeps the accent and the larger padding from the inside of the stroke…
      const inset = (props.accent === 'nenhum' ? 0 : props.accentSize) + Math.max(props.paddingX, props.paddingY);
      assert.ok(contentClearance(inner, content) >= inset - 1e-9, `${label}: folga até o contorno`);
      assert.ok(rectContains(layout.box, content));
      // …and it is the largest such square: two more pixels would cross that line.
      const bigger = {x: content.x - 1, y: content.y - 1, width: content.width + 2, height: content.height + 2};
      assert.ok(contentClearance(inner, bigger) < inset, `${label}: o maior quadrado que cabe`);
      // The glow stays under the legibility limit over it.
      assert.ok(contentGlowOpacity({...layout, glow: props.glow, glowStrength: props.glowStrength}) <= MAX_CONTENT_OPACITY, label);
    }
  }
  // The sizes the buyer gets, for the default neon look (accent off): the square of the text.
  assert.deepEqual(ROUND_BLOCOS.map((id) => getBlocoLayout(parseBlock(sized(id))).content.width), [72, 186, 298]);
});

test('Bloco redondo: padding ou barra que não deixam espaço são recusados com a saída', () => {
  const small = sized('circulo-p');
  assert.deepEqual(messagesOf(blocoLoopSchema, {...small, paddingX: 80}), [
    ['padding', 'The padding leaves no room for the content: reduce padding or strokeWidth, or enlarge the box.'],
  ]);
  assert.equal(blocoLoopSchema.safeParse({...small, paddingX: 60}).success, true);
  // A bright rim light needs a pixel between the text and the line, as on a rectangle. With a 3 px
  // stroke and no padding the whole-pixel square comes within 0.64 px of it.
  const rim = {...small, paddingX: 0, paddingY: 0, strokeWidth: 3, glow: 0, halo: 0, rimLight: 1};
  assert.match(messagesOf(blocoLoopSchema, rim).map(([, message]) => message).join(), /The top rim light would touch the text area/);
  assert.equal(blocoLoopSchema.safeParse({...rim, paddingX: 1}).success, true);
});

// ── Decorations on a circle ─────────────────────────────────────────────────────────────────

test('Bloco redondo: o destaque é um arco de 120° por dentro do contorno, à esquerda ou no topo, fora do texto', () => {
  assert.equal(ACCENT_ARC_SPREAD, Math.PI / 3);
  for (const id of ROUND_BLOCOS) {
    for (const accent of ['esquerda', 'topo'] as const) {
      for (const accentSize of [2, 6, 24]) {
        const props = parseBlock({...sized(id), accent, accentSize});
        const layout = getBlocoLayout(props);
        const label = `${id} ${accent} ${accentSize}`;
        const arc = layout.accentArc!;
        assert.equal(layout.accent, null, label);
        assert.deepEqual([arc.nx, arc.ny], accent === 'esquerda' ? [-1, 0] : [0, -1], label);
        assert.equal(arc.width, accentSize, `${label}: espessura fixa em px`);
        // Its outer edge is the inside of the stroke, concentric with the panel.
        assert.equal(arc.outer, layout.inner.width / 2);
        assert.deepEqual([arc.cx, arc.cy], [layout.inner.x + arc.outer, layout.inner.y + arc.outer]);
        assert.ok(arcClearOf(arc, layout.content), `${label}: o arco não chega ao texto`);
        const [element] = getBlocoLayers(props, 0, 480).accent;
        assert.deepEqual(element, {type: 'arc', ...arc, color: props.accentColor, opacity: 1});
        // The band's path: two arcs of the circle and the two radial ends, 120° apart.
        const d = arcBandPath(arc);
        assert.equal((d.match(/A/g) ?? []).length, 2, label);
        const at = (angle: number, radius: number) => [arc.cx + radius * Math.cos(angle), arc.cy + radius * Math.sin(angle)];
        const middle = Math.atan2(arc.ny, arc.nx);
        const [x0, y0] = at(middle - ACCENT_ARC_SPREAD, arc.outer);
        assert.ok(d.startsWith(`M${Math.round(x0! * 1000) / 1000} ${Math.round(y0! * 1000) / 1000}A${arc.outer} ${arc.outer} 0 0 1 `), `${label}: ${d}`);
      }
    }
  }
  // The rendered layer is clipped to the arc band, not to the panel.
  const props = parseBlock({...sized('circulo'), accent: 'esquerda', accentSheen: 1});
  const markup = renderToStaticMarkup(createElement(BlocoFrame, {props, frame: 0, durationInFrames: 480}));
  const clip = /<clipPath id="block-accent-clip"[^>]*><path d="([^"]+)"/.exec(markup)!;
  assert.equal(clip[1], arcBandPath(getBlocoLayout(props).accentArc!));
  assert.match(markup, new RegExp(`<path d="${arcBandPath(getBlocoLayout(props).accentArc!).replace(/[.]/g, '\\.')}" fill="${props.accentColor}" opacity="1"></path>`));
});

test('Bloco redondo: o reflexo do destaque dá voltas inteiras pelo meio do arco, tangente a ele, sem pulo', () => {
  for (const accent of ['esquerda', 'topo'] as const) {
    for (const seed of [-7, 1, 2026]) {
      const props = parseBlock({...sized('circulo'), accent, accentSize: 10, accentSheen: 2, seed});
      const arc = getBlocoLayout(props).accentArc!;
      const middle = arc.outer - arc.width / 2;
      let visible = 0;
      let previous: {cx: number; cy: number} | null = null;
      for (let frame = 0; frame <= 480; frame++) {
        const sheen = getBlocoLayers(props, frame, 480).accent[1]!;
        assert.equal(sheen.type, 'sheen');
        if (sheen.type !== 'sheen') continue;
        const radius = Math.hypot(sheen.cx - arc.cx, sheen.cy - arc.cy);
        assert.ok(Math.abs(radius - middle) < 1e-9, 'no meio da faixa');
        // Tangent: its motion direction is perpendicular to the radius.
        assert.ok(Math.abs((sheen.cx - arc.cx) * sheen.nx + (sheen.cy - arc.cy) * sheen.ny) < 1e-6, 'tangente');
        assert.equal(sheen.length, arc.width, 'tão largo quanto a faixa');
        // Never a jump: one frame moves it 2 turns / 480 frames of the circle at most.
        if (previous) assert.ok(Math.hypot(sheen.cx - previous.cx, sheen.cy - previous.cy) <= (2 * 2 * Math.PI * middle) / 480 + 1e-9);
        previous = sheen;
        const angle = Math.atan2(sheen.cy - arc.cy, sheen.cx - arc.cx) - Math.atan2(arc.ny, arc.nx);
        const off = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
        if (off < ACCENT_ARC_SPREAD) visible++;
      }
      // Two crossings of a third of the circle per cycle: about two thirds of 480 frames × 1/3.
      assert.ok(visible > 0.25 * 480 && visible < 0.42 * 480, `${accent} seed ${seed}: ${visible}`);
      assert.deepEqual(getBlocoLayers(props, 480, 480).accent, getBlocoLayers(props, 0, 480).accent);
    }
  }
});

test('Redondo: o reflexo de cima acende só o arco de cima do círculo, sumindo até o meio', () => {
  const props = parseBlock({...sized('circulo'), rimLight: 0.9, paddingX: 24, paddingY: 24});
  const [rim] = getBlocoLayers(props, 0, 480).rim;
  const inner = getBlocoLayout(props).inner;
  assert.ok(rim);
  assert.equal(rim.corner, rim.width / 2, 'o traço é o próprio círculo');
  assert.equal(rim.hold, 0, 'nenhum trecho reto para segurar a luz');
  assert.equal(rim.fade, rim.height / 2, 'some até o meio da altura');
  assert.ok(Math.abs(roundRectSdf(inner, rim.x + rim.width / 2, rim.y - 0.5)) < 1e-9);
  const markup = renderToStaticMarkup(createElement(BlocoFrame, {props, frame: 0, durationInFrames: 480}));
  const gradient = /<linearGradient id="block-rim-rim-0"[^>]*y1="([\d.]+)"[^>]*y2="([\d.]+)">([\s\S]*?)<\/linearGradient>/.exec(markup)!;
  assert.equal(Number(gradient[2]) - Number(gradient[1]), rim.height / 2);
  assert.equal((gradient[3]!.match(/<stop/g) ?? []).length, 2, 'do topo aceso ao meio apagado, sem patamar');
  // A rectangle keeps its hold over the top corners.
  const [flat] = getBlocoLayers(parseBlock({rimLight: 0.9}), 0, 480).rim;
  assert.ok(flat && flat.hold === flat.corner && flat.hold > 0);
  // The border's glass rim follows its round band the same way.
  const round = parseBorder({...presetOf('border', 'vidro'), ...sized('webcam-redonda')});
  const [bandRim] = getBordaSceneParts(round, 0, 480).rim;
  assert.ok(bandRim && bandRim.hold === 0 && bandRim.corner === bandRim.width / 2);
});

test('Bloco redondo: fundo, halo e reflexo do vidro seguem o círculo (recorte e halo pelo mesmo contorno)', () => {
  for (const theme of THEMES) {
    const props = parseBlock({...presetOf('block', theme), ...sized('circulo')});
    const layout = getBlocoLayout(props);
    const markup = renderToStaticMarkup(createElement(BlocoFrame, {props, frame: 100, durationInFrames: 480}));
    const circle = roundRectPath(layout.shape);
    assert.match(markup, new RegExp(`<clipPath id="block-fill-clip"[^>]*><path d="${circle.replace(/[.]/g, '\\.')}"`), theme);
    if (props.halo > 0) assert.ok(markup.includes(`<path d="${circle}" fill="#000000">`), `${theme}: o halo é mascarado pelo círculo`);
  }
});

// ── Round borders ───────────────────────────────────────────────────────────────────────────

test('Borda redonda: a janela é um disco transparente, e tudo o que sai da caixa cabe no bleed', () => {
  for (const theme of THEMES) {
    for (const id of ROUND_BORDAS) {
      for (const corners of ['nenhum', 'colchetes', 'joias'] as const) {
        const props = parseBorder({...presetOf('border', theme), corners, ...sized(id)});
        const geometry = getBordaGeometry(props);
        const {layout} = geometry;
        const label = `${theme} ${id} ${corners}`;
        const side = getSize(id).width;
        // The hole is the whole disc, the window itself, and its reported rect lies inside it.
        assert.deepEqual(layout.holeShape, {...layout.box, radius: side / 2}, label);
        assert.deepEqual(layout.hole, inscribedRect(layout.holeShape), label);
        assert.ok(isCircle(geometry.band) && isCircle(layout.outer) && geometry.tracks.every(isCircle), `${label}: concêntricos`);
        assert.ok(layout.outset <= props.bleed, `${label}: outset ${layout.outset} ≤ bleed ${props.bleed}`);
        // Brackets: four arcs outside the band, centred on the diagonals, their outer edge within the outset.
        const centre = {x: layout.box.x + side / 2, y: layout.box.y + side / 2};
        for (const {s, half} of corners === 'colchetes' ? geometry.brackets : []) {
          const track = geometry.tracks[2];
          const mid = pointAt(track, s);
          const angle = Math.atan2(mid.y - centre.y, mid.x - centre.x);
          assert.ok(Math.abs(Math.abs(Math.cos(angle)) - Math.SQRT1_2) < 1e-9, `${label}: na diagonal`);
          assert.ok(half < (Math.PI / 4) * (track.width / 2), `${label}: não fecham um anel`);
          const edge = track.width / 2 + geometry.cornerWidth / 2;
          assert.ok(edge - side / 2 <= geometry.cornerOutset + 1e-9, label);
          for (const point of samplePerimeter(track, s - half, s + half, 2)) {
            assert.ok(Math.abs(roundRectSdf(layout.outer, point.x, point.y) - props.cornerGap - geometry.cornerWidth / 2) < 1e-6, `${label}: por fora da moldura`);
            const reach = Math.max(layout.box.x - point.x, point.x - (layout.box.x + side), layout.box.y - point.y, point.y - (layout.box.y + side));
            assert.ok(reach + geometry.cornerWidth / 2 <= geometry.cornerOutset + 1e-9, `${label}: dentro do outset`);
          }
        }
        // Gems: on the ring at the diagonals, never touching the hole.
        for (const gem of corners === 'joias' ? geometry.gems : []) {
          const angle = Math.atan2(gem.y - centre.y, gem.x - centre.x);
          assert.ok(Math.abs(Math.abs(Math.cos(angle)) - Math.SQRT1_2) < 1e-9, `${label}: joia na diagonal`);
          assert.ok(roundRectSdf(layout.holeShape, gem.x, gem.y) >= props.gemSize / 2 - 1e-9, `${label}: joia fora do buraco`);
          assert.ok(roundRectSdf(geometry.band, gem.x, gem.y) <= props.gemSize / 2, `${label}: joia sobre o anel`);
        }
      }
    }
  }
});

test('Borda redonda: os colchetes têm o mesmo comprimento em px em todo tamanho redondo, e cornerSize o controla', () => {
  const bracketLength = (id: string, cornerSize: number) => {
    const geometry = getBordaGeometry(parseBorder({...presetOf('border', 'neon'), corners: 'colchetes', cornerSize, ...sized(id)}));
    const lengths = geometry.brackets.map(({half}) => 2 * half);
    assert.ok(lengths.every((length) => length === lengths[0]));
    return lengths[0]!;
  };
  for (const cornerSize of [4, 28]) {
    // An arc of 4·cornerSize px (112 px at the default), whatever the circle's size.
    for (const id of ROUND_BORDAS) assert.ok(Math.abs(bracketLength(id, cornerSize) - 4 * cornerSize) < 1e-9, `${id} ${cornerSize}`);
  }
  assert.ok(bracketLength('webcam-redonda', 40) > bracketLength('webcam-redonda', 28), 'cornerSize muda o colchete redondo');
  // A long bracket stops at 70% of a quarter, so the four never close into a ring.
  for (const id of ROUND_BORDAS) {
    const geometry = getBordaGeometry(parseBorder({...presetOf('border', 'neon'), corners: 'colchetes', cornerSize: 512, ...sized(id)}));
    const quarter = perimeterLength(geometry.tracks[2]) / 4;
    for (const {half} of geometry.brackets) assert.ok(Math.abs(2 * half - 0.7 * quarter) < 1e-9, id);
  }
  // A square box with the radius trick is a circle too, and so are its brackets.
  const trick = getBordaGeometry(parseBorder({...sized('webcam-quadrada'), radius: 200, corners: 'colchetes', cornerSize: 28}));
  assert.ok(trick.brackets.every(({half}) => Math.abs(2 * half - 112) < 1e-9));
  // A rectangular window keeps its arms: the corner's curve plus cornerSize on each side.
  assert.ok(Math.abs(bracketLength('webcam-quadrada', 40) - bracketLength('webcam-quadrada', 28) - 24) < 1e-9);
});

test('Borda redonda: nada é desenhado dentro do disco, em nenhum frame', () => {
  for (const theme of THEMES) {
    const props = parseBorder({...presetOf('border', theme), ...sized('webcam-redonda-p')});
    const markup = renderToStaticMarkup(createElement(BordaFrame, {props, frame: 123, durationInFrames: 480}));
    // The frame group hides the disc from every layer.
    const {layout} = getBordaGeometry(props);
    assert.ok(markup.includes(`<mask id="border-frame-hole"`), theme);
    assert.ok(markup.includes(`<path d="${roundRectPath(layout.holeShape)}" fill="#000000">`), theme);
    const {stroke} = getBordaSceneParts(props, 123, 480);
    for (const element of stroke) assert.ok(element.width <= props.thickness);
  }
});

test('Borda redonda: formigas, cometas e gradiente em P = 2πr, voltas inteiras, e recusa de aliasing no limite', () => {
  for (const id of ROUND_BORDAS) {
    const track = getBordaGeometry(parseBorder(sized(id))).tracks[0];
    const r = track.width / 2;
    const perimeter = perimeterLength(track);
    assert.ok(Math.abs(perimeter - 2 * Math.PI * r) < 1e-9, id);
    // The closed form matches the sampled polyline, and the track closes on itself.
    const points = samplePerimeter(track, 0, perimeter, 0.5);
    const polyline = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0);
    assert.ok(Math.abs(polyline - perimeter) / perimeter < 1e-4, id);
    const [start, end] = [pointAt(track, 0), pointAt(track, perimeter)];
    assert.ok(Math.hypot(start.x - end.x, start.y - end.y) < 1e-9, id);
    for (const [strokeMotion, extra] of [
      ['formigas', {dashLength: 18, gapLength: 12}], ['cometas', {cometSpacing: 640}], ['gradiente', {gradientLength: 480}],
    ] as const) {
      const props = parseBorder({...sized(id), strokeMotion, strokeColors: ['#22D3EE', '#E879F9', '#A78BFA'], ...extra});
      const motion = getStrokeMotion(props, track);
      assert.ok(Number.isInteger(motion.count) && motion.count >= 1, `${id} ${strokeMotion}`);
      assert.ok(Math.abs(motion.count * motion.period - perimeter) < 1e-6, `${id} ${strokeMotion}: n·período = P`);
      assert.equal(motion.laps, lapsFor(props.strokeSpeed, props.durationSeconds, motion.period * motion.unitsPerPeriod));
      assert.ok(Number.isInteger(motion.laps) && motion.laps >= 1);
    }
    assert.equal(fitPeriod(perimeter, 640).n, Math.max(1, Math.round(perimeter / 640)));
    // Aliasing: the limit the message names is accepted, one px/s more is refused.
    const ants = {...sized(id), strokeMotion: 'formigas', dashLength: 4, gapLength: 4, strokeColors: ['#FFFFFF']};
    const [, message] = messagesOf(bordaLoopSchema, {...ants, strokeSpeed: 4000})[0]!;
    assert.match(message!, /Speed too high for the dashes/);
    const limit = Number(/strokeSpeed up to ([\d.]+) px\/s/.exec(message!)![1]);
    assert.equal(bordaLoopSchema.safeParse({...ants, strokeSpeed: limit}).success, true, id);
    assert.equal(bordaLoopSchema.safeParse({...ants, strokeSpeed: limit + 1}).success, false, id);
  }
});

test('Redondos: o ciclo fecha em N para cada tema e tamanho redondo, em WebM e GIF', () => {
  for (const theme of THEMES) {
    for (const outputFormat of ['webm', 'gif'] as const) {
      const {durationInFrames} = getCompositionMetadata({durationSeconds: 7.3, outputFormat});
      for (const id of ROUND_BLOCOS) {
        const props = parseBlock({...presetOf('block', theme), ...sized(id), durationSeconds: 7.3, outputFormat, accentSheen: 1});
        assert.deepEqual(getBlocoLayers(props, durationInFrames, durationInFrames), getBlocoLayers(props, 0, durationInFrames), `${theme} ${id}`);
      }
      for (const id of ROUND_BORDAS) {
        const props = parseBorder({...presetOf('border', theme), ...sized(id), durationSeconds: 7.3, outputFormat});
        const at = (frame: number) => getBordaSceneParts(props, frame, durationInFrames);
        assert.deepEqual(at(durationInFrames), at(0), `${theme} ${id}`);
      }
    }
  }
});

test('Redondos: a velocidade continua na emenda também no círculo grande, com o reflexo do destaque a toda', () => {
  // The glint turns round the biggest circle four times a cycle; near the top of its circle one
  // coordinate barely moves while it accelerates hard, which the scan must not take for a seam.
  const blocoSample: Sampler = (input, frame, length) => getBlocoScene(parseBlock({
    ...sized('circulo-g'), fill: 'listras', fillSpeed: 48, strokeMotion: 'formigas', accent: 'esquerda', accentSheen: 4,
    glowPulses: 4, halo: 32, ...input,
  }), frame, length);
  assertSeamVelocity('BlockLoop (círculo-g, máximos)', blocoSample);
  for (const theme of THEMES) {
    for (const accent of ['esquerda', 'topo'] as const) {
      assertSeamVelocity(`BlockLoop ${theme} circulo-g ${accent}`, (input, frame, length) =>
        getBlocoScene(parseBlock({...presetOf('block', theme), ...sized('circulo-g'), accent, accentSheen: 4, ...input}), frame, length));
    }
  }
  assertSeamVelocity('BorderLoop (webcam-redonda-g, máximos)', (input, frame, length) => getBordaScene(parseBorder({
    ...sized('webcam-redonda-g'), fill: 'pontos', fillColors: ['#0B0620', '#E879F9'], strokeMotion: 'gradiente', lines: 2,
    corners: 'joias', cornerPulses: 4, glowPulses: 4, ...input,
  }), frame, length));
  // The scan still catches a real seam: a point turning round a circle whose speed jumps there.
  const kinked: Sampler = (_input, frame, length) => {
    const t = ((frame % length) + length) % length / length;
    const angle = 2 * Math.PI * (t + 0.05 * Math.sin(Math.PI * t));
    return [{x: 200 * Math.cos(angle), y: 200 * Math.sin(angle), opacity: 1}];
  };
  assert.throws(() => assertSeamVelocity('quebra', kinked), /velocidade/);
});

// ── The round webcam's mask ─────────────────────────────────────────────────────────────────

test('Máscara redonda: um disco branco do tamanho da câmera, com a forma no nome', () => {
  for (const id of ROUND_BORDAS) {
    const side = getSize(id).width;
    for (const theme of THEMES) {
      const maskProps = getBordaMask(parseBorder({...presetOf('border', theme), ...sized(id)}))!;
      assert.deepEqual(maskProps, {
        width: side, height: side, shape: 'circulo', radius: side / 2, fit: 'janela', mascara: true, bleed: 0,
        outputFormat: 'png', transparent: true,
      }, `${theme} ${id}: a mesma em todos os temas`);
      const mask = parseBorder(maskProps);
      assert.deepEqual(getBordaMaskElement(mask), {
        type: 'mask-window', x: 0, y: 0, width: side, height: side, corner: side / 2, color: '#FFFFFF', opacity: 1,
      });
      assert.deepEqual(getBordaLayout(mask).canvas, {width: side, height: side});
      assert.equal(matchNamedSize('border', mask)?.id, id);
      assert.equal(sizeTag('border', mask), id);
    }
  }
});

test('CLI: --size webcam-redonda e circulo nomeiam o arquivo, e a máscara sai com --bleed 0', () => {
  const cli = (...args: string[]) => parseRenderArgs(args);
  for (const [composition, id] of [['BorderLoop', 'webcam-redonda'], ['BorderLoop', 'webcam-redonda-g'], ['BlockLoop', 'circulo'], ['BlockLoop', 'circulo-p']] as const) {
    const kind = composition === 'BorderLoop' ? 'border' : 'block';
    for (const format of ['webm', 'png', 'mov'] as const) {
      const {output, props} = resolveExport(buildExportOptions(cli(composition, '--size', id, '--format', format), presetOf(kind, 'neon')));
      assert.equal(path.basename(output), `${composition}-${id}.${format}`);
      assert.equal((props as {shape: string}).shape, 'circulo');
    }
  }
  const mask = resolveExport(buildExportOptions(cli('BorderLoop', '--size', 'webcam-redonda', '--bleed', '0', '--format', 'png'), {mascara: true}));
  assert.equal(path.basename(mask.output), 'BorderLoop-webcam-redonda-mascara.png');
  assert.equal((mask.props as {radius: number}).radius, 16, 'o radius pedido fica nas props…');
  assert.equal(getBordaMaskElement(mask.props as BordaLoopProps).corner, 200, '…mas a máscara é o disco');
  assert.throws(() => resolveExport(buildExportOptions(cli('BorderLoop', '--size', 'webcam-redonda', '--format', 'png'), {mascara: true})),
    /use bleed 0 \(with --size, add --bleed 0\)/);
});

// ── Packs ───────────────────────────────────────────────────────────────────────────────────

test('Packs: os tamanhos redondos entram em webm e png, e cada câmera redonda leva a sua máscara', () => {
  for (const name of THEMES) {
    const manifest = JSON.parse(readFileSync(new URL(`../packs/${name}.json`, import.meta.url), 'utf8')) as PackManifest;
    const plan = planPack(manifest, realPackDeps);
    const files = plan.map((file) => path.posix.relative(`out/packs/${name}`, file.output));
    for (const id of ROUND_BLOCOS) {
      for (const format of ['webm', 'png']) assert.ok(files.includes(`text-boxes/BlockLoop-${id}.${format}`), `${name}: ${id}.${format}`);
    }
    // The Halloween kits also ship every size without ornaments (variant sem-enfeites).
    const kit = name.startsWith('halloween-');
    for (const id of ROUND_BLOCOS.filter(() => kit)) {
      for (const format of ['webm', 'png']) assert.ok(files.includes(`text-boxes/BlockLoop-${id}-sem-enfeites.${format}`), `${name}: ${id} sem enfeites`);
    }
    for (const id of ROUND_BORDAS) {
      for (const format of ['webm', 'png']) assert.ok(files.includes(`borders/BorderLoop-${id}.${format}`), `${name}: ${id}.${format}`);
      if (kit) for (const format of ['webm', 'png']) assert.ok(files.includes(`borders/BorderLoop-${id}-sem-enfeites.${format}`), `${name}: ${id} sem enfeites`);
      const mask = plan.find((file) => file.output.endsWith(`borders/mascara-${id}.png`))!;
      assert.ok(mask, `${name}: máscara de ${id}`);
      assert.deepEqual([mask.exportProps.shape, mask.exportProps.radius, mask.canvas.width], ['circulo', getSize(id).width / 2, getSize(id).width]);
      for (const file of plan.filter((entry) => entry.size === id && entry.role !== 'mask')) assert.equal(file.mask, mask.output);
    }
    // The square webcam keeps its own (rounded-rect) mask.
    const square = plan.find((file) => file.output.endsWith('borders/mascara-webcam-quadrada.png'))!;
    assert.equal(square.exportProps.shape, 'retangulo');
    // Kits: the background, 25 sizes with ornaments (no screens) and 27 without, in two formats, plus the nine masks, shared by both.
    assert.equal(plan.length, name === 'halloween' ? 69 : kit ? 2 + 2 * 25 + 2 * 27 + 9 : 65, name);
  }
});

test('Packs: dois temas com raios diferentes dividem a mesma máscara redonda', () => {
  const border = (preset: string, format: 'webm' | 'png') => ({composition: 'BorderLoop', preset, sizes: ['webcam-redonda'], formats: [format]});
  const plan = planPack({name: 'teste', items: [border('border-neon', 'webm'), border('border-pastel', 'png')]}, realPackDeps);
  assert.deepEqual(plan.filter((file) => file.role === 'mask').map((file) => path.posix.basename(file.output)), ['mascara-webcam-redonda.png']);
});
