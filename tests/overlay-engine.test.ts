import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement, Fragment} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {z} from 'zod';
import {
  CORE_MIN_WIDTH, FILL_STYLES, FOG_BODY_CAP, FOG_CORE_CAP, FOG_MAX_SIZE, FOG_SHAPE, FillLayer, FrameGroup, GLOW_GAIN, HaloLayer, MAX_FRAME_SHARE, OverlayCanvas, RimLayer, STROKE_MOTIONS,
  StrokeLayer, buildFillScene, buildGlowScene, buildHaloScene, buildRimScene, buildStrokeScene, contentClearance, clampRadius, fillFields, filletPath, fitContent,
  fitPeriod, getFillMotion, getStrokeMotion, glowFields, haloFields, lapsFor, layoutFrame, layoutPanel, maxSpeedFor,
  minBleedFor, offsetRoundRect, overlayBaseFields, paddingField, perimeterLength, perimeterPath, pointAt, radiusField,
  rectContains, refineContent, refineFill, refineHole, refineOutset, refineStroke, ringPath, roundRectPath, roundRectSdf,
  rimLightField, samplePerimeter, strokeFields, swayShare, tangentAt, type FrameLayout, type RoundRect, type StrokeElement,
} from '../src/overlays/shared';
import {blockLoopSchema, getBlockLayers, getBlockLayout} from '../src/overlays/block';
import {chatLoopSchema, getChatLayers, getChatLayout} from '../src/overlays/chat';
import {getCompositionMetadata} from '../src/settings';
import {NAMED_SIZES, sizeProps, sizesForKind} from '../src/sizes';
import {
  assertDeterministic, assertPeriodic, assertSeamVelocity, assertValidElements, type Sampler, type Scene, type SceneInput,
} from './helpers/scene-scans';

/** Every field the engine offers, as a kind would assemble them. */
const kitSchema = z.object({
  ...overlayBaseFields({width: 640, height: 360, bleed: 32}),
  radius: radiusField(),
  padding: paddingField(),
  ...fillFields(),
  ...strokeFields(),
  ...glowFields(),
  ...haloFields(),
  rimLight: rimLightField(),
});
type KitProps = z.infer<typeof kitSchema>;
const kit = (input: object): KitProps => kitSchema.parse(input);

const panelOf = (props: KitProps) => layoutPanel({...props, halo: props.halo});

// ── Perimeter ───────────────────────────────────────────────────────────────────────────────

const TRACKS: [string, RoundRect][] = [
  ['square', {x: 32, y: 32, width: 640, height: 360, radius: 0}],
  ['cantos 16', {x: 33, y: 33, width: 638, height: 358, radius: 15}],
  ['pílula', {x: 25, y: 25, width: 322, height: 66, radius: 33}],
  ['círculo', {x: 45, y: 45, width: 406, height: 406, radius: 203}],
  ['raio grande pedido', {x: 10.5, y: 7.25, width: 1500.5, height: 90, radius: 9999}],
];

const joinsOf = (track: RoundRect) => {
  const r = clampRadius(track.radius, track.width, track.height);
  const a = track.width - 2 * r;
  const b = track.height - 2 * r;
  const q = (Math.PI / 2) * r;
  const lengths = [a / 2, q, b, q, a, q, b, q];
  return lengths.map((_, index) => lengths.slice(0, index + 1).reduce((sum, value) => sum + value, 0));
};

test('Perímetro: a forma fechada bate com a poligonal fina (1e-6 relativo)', () => {
  for (const [name, track] of TRACKS) {
    const perimeter = perimeterLength(track);
    const points = samplePerimeter(track, 0, perimeter, 0.01);
    let polyline = 0;
    for (let i = 1; i < points.length; i++) polyline += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    assert.ok(Math.abs(polyline - perimeter) / perimeter < 1e-6, `${name}: ${polyline} vs ${perimeter}`);
  }
  // P = 2(w − 2r) + 2(h − 2r) + 2πr, written out.
  assert.ok(Math.abs(perimeterLength({x: 0, y: 0, width: 400, height: 200, radius: 20}) - (2 * 360 + 2 * 160 + 40 * Math.PI)) < 1e-9);
  assert.equal(perimeterLength({x: 0, y: 0, width: 400, height: 200, radius: 0}), 1200);
});

test('Perímetro: pointAt começa no meio do topo, fecha em P e é contínuo nas 8 junções', () => {
  for (const [name, track] of TRACKS) {
    const perimeter = perimeterLength(track);
    const start = pointAt(track, 0);
    assert.ok(Math.abs(start.x - (track.x + track.width / 2)) < 1e-9 && Math.abs(start.y - track.y) < 1e-9, name);
    const end = pointAt(track, perimeter);
    assert.ok(Math.hypot(end.x - start.x, end.y - start.y) < 1e-9, `${name}: pointAt(P) = pointAt(0)`);
    const wrapped = pointAt(track, perimeter + 37.5);
    const same = pointAt(track, 37.5);
    assert.ok(Math.hypot(wrapped.x - same.x, wrapped.y - same.y) < 1e-9, `${name}: s além de P dá a volta`);
    const negative = pointAt(track, -12);
    const positive = pointAt(track, perimeter - 12);
    assert.ok(Math.hypot(negative.x - positive.x, negative.y - positive.y) < 1e-9, `${name}: s negativo dá a volta`);
    const epsilon = 1e-7;
    for (const join of [...joinsOf(track), perimeter]) {
      const before = pointAt(track, join - epsilon);
      const after = pointAt(track, join + epsilon);
      assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 3 * epsilon, `${name}: ponto contínuo em s = ${join}`);
      if (track.radius > 0) {
        const t0 = tangentAt(track, join - epsilon);
        const t1 = tangentAt(track, join + epsilon);
        assert.ok(Math.hypot(t1.x - t0.x, t1.y - t0.y) < 1e-5, `${name}: tangente contínua em s = ${join}`);
      }
    }
    // Clockwise on screen: at the start, the middle of the top, the track heads right.
    const heading = tangentAt(track, 1e-9);
    assert.ok(Math.abs(heading.x - 1) < 1e-9 && Math.abs(heading.y) < 1e-9, `${name}: sentido horário`);
  }
});

const pathEnds = (d: string) => {
  const numbers = d.match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.map(Number);
  return {start: {x: numbers[0]!, y: numbers[1]!}, end: {x: numbers.at(-2)!, y: numbers.at(-1)!}};
};

test('Perímetro: um trecho vira path SVG exato, inclusive atravessando o início', () => {
  for (const [name, track] of TRACKS) {
    const perimeter = perimeterLength(track);
    for (const [s0, s1] of [[5, 60], [perimeter - 3, perimeter + 7], [0, perimeter], [perimeter * 0.3, perimeter * 0.95], [-20, 10]]) {
      const d = perimeterPath(track, s0!, s1!);
      const {start, end} = pathEnds(d);
      const a = pointAt(track, s0!);
      const b = pointAt(track, s1!);
      assert.ok(Math.hypot(start.x - a.x, start.y - a.y) < 2e-3, `${name}: começo de ${s0}–${s1}`);
      assert.ok(Math.hypot(end.x - b.x, end.y - b.y) < 2e-3, `${name}: fim de ${s0}–${s1}`);
      assert.doesNotMatch(d, /NaN|Infinity/);
    }
  }
  // A dash across the start is one piece: one move, no second M.
  const track = TRACKS[1]![1];
  assert.equal(perimeterPath(track, perimeterLength(track) - 3, perimeterLength(track) + 7).match(/M/g)!.length, 1);
});

test('Perímetro: fitPeriod fecha o contorno com n inteiro, inclusive com P/L perto de x,5', () => {
  for (const perimeter of [100, 1234.5678, 2 * Math.PI * 200, 5992.4]) {
    for (const wanted of [7, 28, 33.3, perimeter / 12.5, perimeter / 12.5 + 1e-9, perimeter / 12.5 - 1e-9, perimeter * 2]) {
      const {n, period} = fitPeriod(perimeter, wanted);
      assert.ok(Number.isInteger(n) && n >= 1);
      assert.ok(Math.abs(n * period - perimeter) <= 1e-9 * perimeter, `${perimeter}/${wanted}`);
      assert.ok(Math.abs(perimeter / wanted - n) <= 0.5 + 1e-6 || n === 1);
    }
  }
  assert.throws(() => fitPeriod(0, 10));
  assert.throws(() => fitPeriod(100, 0));
});

test('Perímetro: lapsFor dá voltas inteiras, no mínimo uma quando há movimento', () => {
  assert.equal(lapsFor(0, 8, 30), 0);
  assert.equal(lapsFor(0.001, 8, 3000), 1);
  assert.equal(lapsFor(60, 8, 30), 16);
  assert.equal(lapsFor(59, 8, 32), 15);
  for (const speed of [1, 13.7, 120, 999]) {
    for (const duration of [3.7, 8, 12.25]) {
      const laps = lapsFor(speed, duration, 41.3);
      assert.ok(Number.isInteger(laps) && laps >= 1);
    }
  }
});

// ── Layouts ─────────────────────────────────────────────────────────────────────────────────

const assertInside = (shape: RoundRect, rect: {x: number; y: number; width: number; height: number}, message: string) => {
  for (const [x, y] of [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]) {
    assert.ok(roundRectSdf(shape, x!, y!) <= 1e-9, `${message}: canto (${x}, ${y}) fora da forma`);
  }
};

test('Layout de painel: tamanhos nomeados de chat e bloco, conteúdo dentro do traço e dos cantos', () => {
  for (const size of [...sizesForKind('chat'), ...sizesForKind('block')]) {
    for (const radius of [0, 16, 1920]) {
      const props = kit({...sizeProps(size), radius, strokeWidth: 3, padding: 12, glow: size.bleed > 0 ? 12 : 0});
      const layout = panelOf(props);
      assert.deepEqual(layout.canvas, {width: size.width + 2 * size.bleed, height: size.height + 2 * size.bleed}, size.id);
      assert.deepEqual(layout.box, {x: size.bleed, y: size.bleed, width: size.width, height: size.height});
      assert.ok(rectContains(layout.box, layout.content), `${size.id}: conteúdo dentro da caixa`);
      assert.ok(layout.content.width >= 1 && layout.content.height >= 1, `${size.id} r${radius}: há conteúdo`);
      for (const value of Object.values(layout.content)) assert.ok(Number.isInteger(value));
      assertInside(layout.inner, layout.content, `${size.id} r${radius}`);
      assert.ok(layout.content.x >= layout.box.x + 3 + 12 && layout.content.y >= layout.box.y + 3 + 12);
      assert.ok(layout.outset <= size.bleed, `${size.id}: o brilho cabe no bleed`);
      // The stroke's outer edge is the box edge: its centreline is half a stroke in.
      assert.deepEqual(layout.track, offsetRoundRect(layout.shape, -1.5));
    }
  }
  // Kind insets push the content (a chat header takes the top).
  const plain = layoutPanel({width: 400, height: 600, bleed: 32, radius: 16, strokeWidth: 2, padding: 16});
  const header = layoutPanel({width: 400, height: 600, bleed: 32, radius: 16, strokeWidth: 2, padding: 16, insets: {top: 56}});
  assert.equal(header.content.y, plain.content.y + 56);
  assert.equal(header.content.height, plain.content.height - 56);
  // In a pill with little padding the content pulls in sideways, never through the curve.
  const pill = layoutPanel({width: 320, height: 64, bleed: 24, radius: 999, strokeWidth: 2, padding: 4});
  assertInside(pill.inner, pill.content, 'pílula');
  assert.ok(pill.content.x - pill.inner.x > 4);
  assert.deepEqual(fitContent({x: 0, y: 0, width: 100, height: 50, radius: 0}, {top: 2, left: 3}), {x: 3, y: 2, width: 97, height: 48});
});

test('Layout de moldura: janela vazia para fora, tela do tamanho do arquivo', () => {
  for (const size of sizesForKind('border')) {
    const fit = size.props?.fit ?? 'window';
    for (const radius of [0, 24, 200]) {
      const glow = fit === 'window' ? 16 : 24;
      const layout = layoutFrame({...size, radius, thickness: 8, glow, fit});
      assert.deepEqual(layout.canvas, {width: size.width + 2 * size.bleed, height: size.height + 2 * size.bleed}, size.id);
      assert.ok(rectContains(layout.box, layout.hole), `${size.id}: buraco dentro da caixa`);
      assert.ok(layout.hole.width >= 1 && layout.hole.height >= 1);
      assertInside(layout.holeShape, layout.hole, `${size.id} r${radius}`);
      assert.ok(rectContains(layout.box, layout.content));
      if (fit === 'window') {
        assert.deepEqual(layout.window, {...layout.box, radius: clampRadius(radius, size.width, size.height)});
        assert.deepEqual(layout.content, layout.box);
        assert.equal(layout.outset, 8 + glow);
        assert.ok(layout.outset <= size.bleed, `${size.id}: a banda e o brilho cabem no bleed`);
        assert.equal(layout.outer.x, layout.box.x - 8);
      } else {
        // The file keeps the screen size; nothing is drawn outside it and the glow eats into the hole.
        assert.deepEqual(layout.canvas, {width: size.width, height: size.height});
        assert.equal(layout.outset, 0);
        assert.deepEqual(layout.outer, {...layout.box, radius: radius > 0 ? layout.window.radius + 8 : 0});
        assert.equal(layout.holeShape.x, layout.window.x + glow);
      }
    }
  }
  const round = layoutFrame({width: 400, height: 400, bleed: 48, radius: 200, thickness: 6, fit: 'window'});
  assert.equal(round.window.radius, 200);
  assert.match(ringPath(round), /Z.*Z/);
  assert.match(filletPath(round), /^M48 48H448V448H48Z/);
});

test('Margem: refineOutset aceita o bleed par que a mensagem pede e recusa o de baixo', () => {
  const schema = z.object({bleed: z.number(), glow: z.number(), thickness: z.number()})
    .superRefine((props, context) => refineOutset(props, props.thickness + props.glow, context));
  for (const [thickness, glow] of [[6, 17], [8, 16], [3, 0.5], [10, 30]]) {
    const outset = thickness! + glow!;
    const refused = schema.safeParse({bleed: 0, glow, thickness});
    assert.equal(refused.success, false);
    const message = refused.error!.issues[0]!.message;
    const wanted = Number(/bleed ≥ (\d+)/.exec(message)![1]);
    assert.equal(message, `The glow goes past the margin: use bleed ≥ ${wanted} or reduce the glow.`);
    assert.equal(wanted % 2, 0);
    assert.equal(wanted, minBleedFor(outset));
    assert.equal(schema.safeParse({bleed: wanted, glow, thickness}).success, true, `${outset}: bleed ${wanted}`);
    assert.equal(schema.safeParse({bleed: wanted - 2, glow, thickness}).success, false, `${outset}: bleed ${wanted - 2}`);
  }
  assert.equal(schema.safeParse({bleed: 0, glow: 0, thickness: 0}).success, true, 'bleed 0 sem nada fora da caixa');
});

test('Recusas de layout: conteúdo sem espaço e moldura sem janela', () => {
  const content = z.object({padding: z.number()}).superRefine((props, context) =>
    refineContent(layoutPanel({width: 64, height: 32, bleed: 0, radius: 0, strokeWidth: 2, padding: props.padding}), context));
  assert.equal(content.safeParse({padding: 10}).success, true);
  assert.match(content.safeParse({padding: 16}).error!.issues[0]!.message, /padding leaves no room/);
  const hole = z.object({thickness: z.number()}).superRefine((props, context) =>
    refineHole(layoutFrame({width: 200, height: 100, bleed: 0, radius: 0, thickness: props.thickness, glow: 10, fit: 'screen'}), context));
  assert.equal(hole.safeParse({thickness: 20}).success, true);
  assert.match(hole.safeParse({thickness: 45}).error!.issues[0]!.message, /leaves no window/);
});

// ── Scenes ──────────────────────────────────────────────────────────────────────────────────

type Case = {id: string; sample: Sampler; moving?: boolean; seeded?: boolean};

const fillCase = (id: string, input: object, flags: Partial<Case> = {}): Case => ({
  id: `preenchimento ${id}`,
  sample: (scene: SceneInput, frame: number, length: number): Scene => {
    const props = kit({...input, ...scene});
    const layout = panelOf(props);
    return buildFillScene(props, layout.box, frame, length, {corner: layout.shape.radius});
  },
  ...flags,
});

const PANEL_TRACK = layoutPanel({width: 640, height: 360, bleed: 32, radius: 16, strokeWidth: 3, padding: 16}).track;
const FRAME = layoutFrame({width: 640, height: 360, bleed: 48, radius: 0, thickness: 8, glow: 16, fit: 'window'});
const PILL_TRACK = layoutPanel({width: 320, height: 64, bleed: 24, radius: 999, strokeWidth: 2, padding: 8}).track;

const strokeCase = (id: string, input: object, track: RoundRect, flags: Partial<Case> = {}, options = {}): Case => ({
  id: `contorno ${id}`,
  sample: (scene: SceneInput, frame: number, length: number): Scene => {
    const props = kit({...input, ...scene});
    return [
      ...buildStrokeScene(props, track, frame, length, options),
      ...buildGlowScene(props, frame, length),
      ...buildHaloScene(props, frame, length),
    ];
  },
  ...flags,
});

const CASES: Case[] = [
  fillCase('sólido', {fill: 'solido'}, {moving: false, seeded: false}),
  fillCase('gradiente de 2 cores', {fill: 'gradiente', fillColors: ['#101020', '#F472B6']}),
  fillCase('gradiente de 3 cores, inclinado', {fill: 'gradiente', fillAngle: -30, fillSpeed: 90}),
  fillCase('gradiente de uma cor', {fill: 'gradiente', fillColors: ['#101020']}, {moving: false, seeded: false}),
  fillCase('pontos de uma cor', {fill: 'pontos', fillColors: ['#FFFFFF'], fillAngle: 0}),
  fillCase('pontos na diagonal', {fill: 'pontos', fillAngle: -135, fillSpeed: 40, fillScale: 20}),
  fillCase('listras de 2 cores', {fill: 'listras', fillColors: ['#101020', '#F472B6']}),
  fillCase('listras de 3 cores', {fill: 'listras', fillAngle: 100, fillSpeed: 70}),
  fillCase('brilhos', {fill: 'brilhos'}),
  fillCase('brilhos parados no lugar', {fill: 'brilhos', fillSpeed: 0}),
  fillCase('brasas subindo', {fill: 'brilhos', fillRise: true, fillSpeed: 60, fillColors: ['#1A0B2E', '#FB923C', '#FDE68A']}),
  fillCase('vidro', {fill: 'vidro', fillColors: ['#FFFFFF'], fillOpacity: 0.16, fillSpeed: 120}),
  fillCase('vidro parado', {fill: 'vidro', fillSpeed: 0}, {moving: false, seeded: false}),
  fillCase('nevoa', {fill: 'nevoa', fillColors: ['#0E1520', '#688789', '#D6DDC7'], fillScale: 48, fillSpeed: 27}),
  fillCase('nevoa para a esquerda, 2 cores', {fill: 'nevoa', fillColors: ['#0E1520', '#688789'], fillAngle: 135, fillScale: 24, fillSpeed: 40}),
  fillCase('nevoa de uma cor', {fill: 'nevoa', fillColors: ['#FFFFFF']}),
  fillCase('nevoa parada', {fill: 'nevoa', fillSpeed: 0, fillScale: 64}, {moving: false}),
  fillCase('damasco', {fill: 'damasco', fillColors: ['#0C1412', '#1F2B25'], fillAngle: 0, fillSpeed: 20}),
  fillCase('damasco na diagonal, 3 cores', {fill: 'damasco', fillAngle: 135, fillScale: 24, fillSpeed: 40}),
  fillCase('damasco de uma cor', {fill: 'damasco', fillColors: ['#9FB095'], fillAngle: 90}),
  fillCase('damasco parado', {fill: 'damasco', fillColors: ['#0C1412', '#1F2B25'], fillScale: 56, fillSpeed: 0}, {moving: false}),
  strokeCase('parado', {strokeMotion: 'parado', strokeColors: ['#67E8F9'], glow: 0}, PANEL_TRACK, {moving: false, seeded: false}),
  strokeCase('parado com cores', {strokeMotion: 'parado', glow: 0}, PANEL_TRACK, {moving: false}),
  strokeCase('pulso', {strokeMotion: 'pulso', strokeColors: ['#67E8F9'], strokePulses: 2}, PANEL_TRACK, {}, {pulseWidth: 0.3}),
  strokeCase('pulso com cores e halo', {strokeMotion: 'pulso', strokeColors: ['#67E8F9', '#F472B6', '#FDE68A'], halo: 20, glowPulses: 2}, PILL_TRACK),
  strokeCase('formigas', {strokeMotion: 'formigas', strokeColors: ['#FFFFFF']}, PANEL_TRACK, {}, {trackOpacity: 0.25}),
  strokeCase('formigas de 3 cores na moldura', {strokeMotion: 'formigas', strokeColors: ['#F00', '#0F0', '#00F'], strokeSpeed: 200, strokeWidth: 8}, FRAME.track),
  strokeCase('cometas a cada 600 px, 2 cores', {strokeMotion: 'cometas', cometSpacing: 600, cometTail: 900}, PANEL_TRACK),
  strokeCase('cometas a cada 180 px na pílula, 3 cores', {strokeMotion: 'cometas', cometSpacing: 180, strokeSpeed: 300, strokeColors: ['#67E8F9', '#F472B6', '#FDE68A']}, PILL_TRACK),
  strokeCase('gradiente', {strokeMotion: 'gradiente', strokeColors: ['#67E8F9', '#818CF8', '#F472B6'], glowPulses: 3}, FRAME.track, {}, {colorRepeats: 2}),
  strokeCase('gradiente parado no lugar', {strokeMotion: 'gradiente', strokeSpeed: 0, glow: 0}, PANEL_TRACK, {moving: false}),
];

test('Cenas: cada fill e cada movimento de contorno é coberto', () => {
  for (const fill of FILL_STYLES) assert.ok(CASES.some((entry) => entry.id.includes(fill === 'solido' ? 'sólido' : fill)), fill);
  for (const motion of STROKE_MOTIONS) assert.ok(CASES.some((entry) => entry.id.startsWith(`contorno ${motion}`)), motion);
});

for (const {id, sample, moving = true, seeded = true} of CASES) {
  test(`${id}: seed e frame determinam a cena`, () => assertDeterministic(id, sample, {seeded}));
  test(`${id}: o ciclo fecha em N para 50/60 fps e durações quebradas`, () => assertPeriodic(id, sample, {moving}));
  test(`${id}: velocidade contínua na emenda`, () => assertSeamVelocity(id, sample));
  test(`${id}: dimensões e opacidades válidas`, () => assertValidElements(id, sample));
}

test('Cenas: tamanhos nomeados fecham o ciclo com fill e contorno em movimento', () => {
  for (const size of NAMED_SIZES) {
    const props = kit({...sizeProps(size), fill: 'listras', strokeMotion: 'cometas', strokeSpeed: 240, fillSpeed: 30});
    const layout = panelOf(props);
    for (const outputFormat of ['webm', 'gif'] as const) {
      const {durationInFrames} = getCompositionMetadata({durationSeconds: 7.3, outputFormat});
      const at = (frame: number) => [
        ...buildFillScene({...props, durationSeconds: 7.3}, layout.box, frame, durationInFrames),
        ...buildStrokeScene({...props, durationSeconds: 7.3}, layout.track, frame, durationInFrames),
      ];
      assert.deepEqual(at(durationInFrames), at(0), size.id);
    }
  }
});

test('Movimento: a velocidade real é arredondada para períodos inteiros e exposta', () => {
  const props = kit({strokeMotion: 'formigas', strokeColors: ['#FFF', '#000'], strokeSpeed: 100, durationSeconds: 8});
  const motion = getStrokeMotion(props, PANEL_TRACK);
  assert.equal(motion.count % 2, 0, 'as cores alternadas fecham o contorno');
  assert.ok(Math.abs(motion.count * motion.period - perimeterLength(PANEL_TRACK)) < 1e-9);
  assert.ok(Number.isInteger(motion.laps) && motion.laps >= 1);
  assert.ok(Math.abs(motion.speed - (motion.laps * motion.period * 2) / 8) < 1e-9);
  assert.ok(Math.abs(motion.speed - 100) <= (motion.period * 2) / 8 / 2 + 1e-9, 'arredonda para o período mais próximo');
  const fill = getFillMotion(kit({fill: 'pontos', fillAngle: 0, fillScale: 30, fillSpeed: 50, durationSeconds: 8}), {x: 0, y: 0, width: 100, height: 100});
  assert.deepEqual(fill, {period: 30, laps: 13, unitsPerPeriod: 1, speed: 48.75, sway: 0});
});

test('Movimento: cometas, gradientes, vidro e brasas têm períodos em px fixos, não em frações da caixa', () => {
  const small = layoutPanel({width: 320, height: 64, bleed: 24, radius: 16, strokeWidth: 2, padding: 8}).track;
  const large = layoutFrame({width: 1920, height: 1080, bleed: 0, radius: 16, thickness: 12, fit: 'screen'}).track;
  for (const track of [small, PANEL_TRACK, large]) {
    const perimeter = perimeterLength(track);
    // Comets: as many as fit cometSpacing (at least one), travelling whole spacings.
    const comets = getStrokeMotion(kit({strokeMotion: 'cometas', cometSpacing: 300, strokeSpeed: 160, durationSeconds: 8}), track);
    assert.equal(comets.count, Math.max(1, Math.round(perimeter / 300)));
    assert.equal(comets.unitsPerPeriod, 1);
    assert.equal(comets.laps, Math.max(1, Math.round((160 * 8) / comets.period)));
    // The colour flow: the palette repeats about every gradientLength px.
    const flow = getStrokeMotion(kit({strokeMotion: 'gradiente', gradientLength: 400, strokeSpeed: 60, durationSeconds: 8}), track);
    assert.equal(flow.count, Math.max(1, Math.round(perimeter / 400)));
    assert.ok(Math.abs(flow.period - perimeter / flow.count) < 1e-9);
  }
  // A comet wears the colour of its place: neighbours differ, and one spacing later a comet has
  // the colour its neighbour had, so the places can wrap unseen.
  const props = kit({strokeMotion: 'cometas', cometSpacing: 200, strokeColors: ['#FF0000', '#00FF00', '#0000FF'], strokeSpeed: 100});
  const cometsAt = (frame: number) => buildStrokeScene(props, PANEL_TRACK, frame, 480).filter((element) => element.type === 'comet');
  const first = cometsAt(0);
  assert.ok(new Set(first.map((comet) => comet.color)).size >= 3);
  // The fills: the gradient sways by fillSpeed·T/4 (exact mean speed), whatever the area.
  for (const area of [{x: 0, y: 0, width: 320, height: 64}, {x: 0, y: 0, width: 960, height: 640}]) {
    const gradient = getFillMotion(kit({fill: 'gradiente', fillSpeed: 16, durationSeconds: 8}), area);
    assert.deepEqual([gradient.laps, gradient.sway, gradient.speed], [0, 32, 16]);
    const glass = getFillMotion(kit({fill: 'vidro', fillSpeed: 60, durationSeconds: 10}), area);
    assert.deepEqual([glass.period, glass.laps, glass.speed], [600, 1, 60]);
    const embers = getFillMotion(kit({fill: 'brilhos', fillRise: true, fillSpeed: 20, durationSeconds: 12}), area);
    assert.equal(embers.speed, 20);
  }
  // Sheens closer than two widths would merge: the spacing stays, the speed goes up (documented minimum).
  const glass = getFillMotion(kit({fill: 'vidro', fillSpeed: 10, durationSeconds: 8}), {x: 0, y: 0, width: 1920, height: 1080});
  assert.deepEqual([glass.period, glass.speed], [2 * 324, (2 * 324) / 8]);
});

test('Movimento: cada brasa sobe exatamente fillSpeed × o seu ritmo, em caixas baixas e altas', () => {
  for (const area of [{x: 10, y: 20, width: 320, height: 64}, {x: 0, y: 0, width: 448, height: 1016}]) {
    const props = kit({fill: 'brilhos', fillRise: true, fillSpeed: 20, fillScale: 40, durationSeconds: 12});
    const at = (frame: number) => buildFillScene(props, area, frame, 720).filter((element) => element.type === 'spark');
    const a = at(100);
    const b = at(100.01);
    const speeds = a.map((spark, index) => (spark.y - b[index]!.y) / (0.01 / 60));
    // Every ember rises (y decreases) at 0.7–1.3 × fillSpeed, whatever the area's height.
    for (const speed of speeds) assert.ok(speed >= 0.7 * 20 - 1e-6 && speed <= 1.3 * 20 + 1e-6, String(speed));
  }
});

// ── Aliasing ────────────────────────────────────────────────────────────────────────────────

const strokeSchema = (track: RoundRect) => kitSchema.superRefine((props, context) => refineStroke(props, track, context));
const fillSchema = kitSchema.superRefine((props, context) => refineFill(props, panelOf(props).box, context));

const assertLimit = (schema: z.ZodType, input: Record<string, unknown>, field: string) => {
  const refused = schema.safeParse(input);
  assert.equal(refused.success, false, JSON.stringify(input));
  const issue = refused.error!.issues[0]!;
  assert.deepEqual(issue.path, [field]);
  const limit = Number(new RegExp(`Use ${field} up to ([\\d.]+) px/s`).exec(issue.message)![1]);
  assert.match(issue.message, /seem to go backwards or flicker/);
  assert.equal(schema.safeParse({...input, [field]: limit}).success, true, `${field} ${limit} aceito`);
  assert.equal(schema.safeParse({...input, [field]: limit + 1}).success, false, `${field} ${limit + 1} recusado`);
  return limit;
};

test('Aliasing: contornos rápidos demais são recusados com a velocidade máxima, que é aceita', () => {
  const ants = {strokeMotion: 'formigas', dashLength: 4, gapLength: 4, strokeSpeed: 4000};
  for (const outputFormat of ['webm', 'gif'] as const) {
    for (const durationSeconds of [3.7, 8]) {
      assertLimit(strokeSchema(PANEL_TRACK), {...ants, strokeColors: ['#FFF'], outputFormat, durationSeconds}, 'strokeSpeed');
      assertLimit(strokeSchema(PANEL_TRACK), {...ants, strokeColors: ['#FFF', '#000', '#F00'], outputFormat, durationSeconds}, 'strokeSpeed');
      assertLimit(strokeSchema(PILL_TRACK), {strokeMotion: 'cometas', cometSpacing: 32, strokeSpeed: 4000, outputFormat, durationSeconds}, 'strokeSpeed');
    }
  }
  // At the limit the share is at most MAX_FRAME_SHARE of the way to the next dash.
  const limit = assertLimit(strokeSchema(PANEL_TRACK), {...ants, durationSeconds: 8}, 'strokeSpeed');
  const motion = getStrokeMotion(kit({...ants, strokeSpeed: limit, durationSeconds: 8}), PANEL_TRACK);
  assert.ok((motion.laps * motion.unitsPerPeriod) / 480 <= MAX_FRAME_SHARE);
  assert.equal(maxSpeedFor(motion.period * motion.unitsPerPeriod, 8, 480, motion.unitsPerPeriod), limit);
  // Motions that do not travel are never refused, and a cycle too short says so.
  assert.equal(strokeSchema(PANEL_TRACK).safeParse({strokeMotion: 'pulso', strokeSpeed: 4000, strokePulses: 16}).success, true);
  const short = strokeSchema(PANEL_TRACK).safeParse({...ants, durationSeconds: 0.03});
  assert.match(short.error!.issues[0]!.message, /Cycle too short for the dashes/);
});

test('Aliasing: pontos e listras rápidos demais são recusados com a velocidade máxima, que é aceita', () => {
  assertLimit(fillSchema, {fill: 'pontos', fillScale: 8, fillSpeed: 480, fillAngle: 45}, 'fillSpeed');
  assertLimit(fillSchema, {fill: 'pontos', fillScale: 8, fillSpeed: 480, fillAngle: 0, outputFormat: 'gif'}, 'fillSpeed');
  assertLimit(fillSchema, {fill: 'listras', fillScale: 8, fillSpeed: 480}, 'fillSpeed');
  assertLimit(fillSchema, {fill: 'listras', fillScale: 8, fillSpeed: 480, fillColors: ['#000', '#FFF']}, 'fillSpeed');
  // The sparkles' orbits are periodic too: past the limit they crawl or turn backwards (the review
  // measured 1.06 turns per frame here, seen as a 0.06 turn crawl).
  const orbit = assertLimit(fillSchema, {fill: 'brilhos', fillScale: 8, fillSpeed: 480}, 'fillSpeed');
  assert.match(fillSchema.safeParse({fill: 'brilhos', fillScale: 8, fillSpeed: 480}).error!.issues[0]!.message, /for the sparkles: .* or increase fillScale\./);
  assertLimit(fillSchema, {fill: 'brilhos', fillScale: 8, fillSpeed: 200, outputFormat: 'gif'}, 'fillSpeed');
  assertLimit(fillSchema, {fill: 'brilhos', fillScale: 16, fillSpeed: 400}, 'fillSpeed');
  const turns = getFillMotion(kit({fill: 'brilhos', fillScale: 8, fillSpeed: orbit}), {x: 0, y: 0, width: 100, height: 100});
  assert.deepEqual([turns.period, turns.laps / 480 <= MAX_FRAME_SHARE], [2 * Math.PI * 0.15 * 8, true]);
  // A bigger pattern has a wider orbit, so it may go faster.
  assert.equal(fillSchema.safeParse({fill: 'brilhos', fillScale: 64, fillSpeed: 480}).success, true);
  // Rising embers and the glass sheen are not periodic lattices: never refused for speed.
  assert.equal(fillSchema.safeParse({fill: 'brilhos', fillRise: true, fillScale: 8, fillSpeed: 480}).success, true);
  assert.equal(fillSchema.safeParse({fill: 'vidro', fillScale: 8, fillSpeed: 480}).success, true);
});

// ── Holes and invisible jumps ───────────────────────────────────────────────────────────────

/** Points on the centreline of what a stroke element draws, with its half width. */
const strokeSamples = (element: StrokeElement, track: RoundRect) => {
  switch (element.type) {
    case 'outline':
      return samplePerimeter(track, 0, perimeterLength(track), 2);
    case 'dash':
    case 'segment':
      return samplePerimeter(track, element.s, element.s + element.length, 1);
    case 'comet':
      return samplePerimeter(track, element.s - element.tail - 0.5, element.s, 1);
  }
};

test('Molduras: nada do contorno entra no buraco (janela e tela, cantos retos e redondos)', () => {
  const frames: FrameLayout[] = [];
  for (const radius of [0, 24, 200]) {
    frames.push(layoutFrame({width: 400, height: 400, bleed: 48, radius, thickness: 10, glow: 16, fit: 'window'}));
    frames.push(layoutFrame({width: 1920, height: 1080, bleed: 0, radius, thickness: 12, glow: 20, fit: 'screen'}));
  }
  for (const layout of frames) {
    for (const strokeMotion of STROKE_MOTIONS) {
      const props = kit({strokeMotion, strokeWidth: layout.thickness, cometSpacing: 400, strokeColors: ['#FFF', '#F0F']});
      for (const frame of [0, 97, 250, 479]) {
        for (const element of buildStrokeScene(props, layout.track, frame, 480, {trackOpacity: 0.2, pulseWidth: 0.3})) {
          for (const point of strokeSamples(element, layout.track)) {
            const distance = roundRectSdf(layout.holeShape, point.x, point.y);
            assert.ok(distance >= element.width / 2 - 1e-6, `${layout.fit} r${layout.window.radius} ${strokeMotion}: (${point.x}, ${point.y}) a ${distance} do buraco`);
          }
        }
      }
    }
  }
});

/** Frames where a field jumps, sampling the cycle finely. */
const jumps = (sample: (frame: number) => Scene, key: string, threshold: number) => {
  const found: {frame: number; before: Scene; after: Scene; index: number}[] = [];
  let previous = sample(0);
  for (let frame = 0.05; frame <= 480; frame += 0.05) {
    const next = sample(frame);
    previous.forEach((element, index) => {
      if (Math.abs((next[index]![key] as number) - (element[key] as number)) > threshold) found.push({frame, before: previous, after: next, index});
    });
    previous = next;
  }
  return found;
};

test('Vidro: o reflexo só salta quando está todo fora da caixa, longe da emenda', () => {
  const props = kit({fill: 'vidro', fillSpeed: 300, fillAngle: 30});
  const layout = panelOf(props);
  const box = layout.box;
  const sample = (frame: number) => buildFillScene(props, box, frame, 480);
  const found = jumps(sample, 'cx', 50);
  assert.ok(found.length >= 1, 'o reflexo passa mais de uma vez');
  for (const {before, after, index, frame} of found) {
    assert.ok(frame > 1 && frame < 479, 'o salto não cai na emenda');
    for (const scene of [before, after]) {
      const sheen = scene[index]!;
      const u = {x: sheen.nx as number, y: sheen.ny as number};
      const along = ((sheen.cx as number) - (box.x + box.width / 2)) * u.x + ((sheen.cy as number) - (box.y + box.height / 2)) * u.y;
      const extent = Math.abs(box.width * u.x) + Math.abs(box.height * u.y);
      assert.ok(Math.abs(along) >= extent / 2 + (sheen.width as number) / 2, `reflexo dentro da caixa no salto (${along})`);
    }
  }
});

test('Brasas: só saltam invisíveis (apagadas, ou fora da caixa) e fora da emenda', () => {
  for (const fillSpeed of [80, 12]) {
    const props = kit({fill: 'brilhos', fillRise: true, fillSpeed, fillColors: ['#FB923C']});
    const box = panelOf(props).box;
    const found = jumps((frame) => buildFillScene(props, box, frame, 480), 'y', 4);
    assert.ok(found.length > 10);
    let dropped = 0;
    let wrapped = 0;
    for (const {before, after, index, frame} of found) {
      assert.ok(frame > 0.05 && frame < 479.95, 'nenhum salto na emenda');
      const from = before[index]!;
      const to = after[index]!;
      const reach = (from.radius as number) * 2.5;
      // A life ends: the ember drops back down (or wraps round while dropping), faded out.
      if ((from.opacity as number) < 1e-3 && (to.opacity as number) < 1e-3) {
        dropped += 1;
        continue;
      }
      // Or it wraps from above the box to below it, its whole disc out of sight on both sides.
      assert.ok((from.y as number) + reach < box.y && (to.y as number) - reach > box.y + box.height, `salto visível em ${frame}`);
      wrapped += 1;
    }
    assert.ok(dropped > 0 && wrapped > 0, `${dropped} quedas, ${wrapped} voltas`);
  }
});

test('Vidro: com vários reflexos na caixa, a volta das posições não muda a imagem', () => {
  // 40 px/s over 8 s: sheens 320 px apart, so a 640 px panel shows two or three at once.
  const props = kit({fill: 'vidro', fillSpeed: 40, fillAngle: 0});
  const box = panelOf(props).box;
  const visible = (scene: Scene) => scene.filter((element) => element.type === 'sheen')
    .map((sheen) => ({cx: sheen.cx as number, width: sheen.width as number}))
    .filter(({cx, width}) => cx + width / 2 > box.x && cx - width / 2 < box.x + box.width)
    .map(({cx}) => cx).sort((a, b) => a - b);
  const found = jumps((frame) => buildFillScene(props, box, frame, 480), 'cx', 50);
  assert.ok(found.length >= 1);
  for (const {before, after, frame} of found) {
    assert.ok(frame > 1 && frame < 479, 'a volta não cai na emenda');
    const a = visible(before);
    const b = visible(after);
    assert.ok(a.length >= 2, 'mais de um reflexo à vista');
    assert.equal(a.length, b.length, `em ${frame}`);
    a.forEach((cx, index) => assert.ok(Math.abs(cx - b[index]!) < 1, `em ${frame}: ${cx} → ${b[index]}`));
  }
});

// ── Fog and damask ──────────────────────────────────────────────────────────────────────────

const MANSION_FOG = {fill: 'nevoa', fillColors: ['#0E1520', '#688789', '#D6DDC7']} as const;
const fogBanks = (scene: Scene) => scene.filter((element) => element.type === 'fog');

test('Névoa: anda S·voltas por ciclo (S = 2,25 × fillScale), igual em toda caixa e sem depender das opções', () => {
  const areas = [{x: 0, y: 0, width: 320, height: 64}, {x: 40, y: 40, width: 640, height: 360}, {x: 0, y: 0, width: 1920, height: 1080}];
  const options = {corner: 12, maxSparks: 1, keepSpark: () => false, sheenWidth: 7, sparkOrbit: 3, seedOffset: 5};
  for (const fillScale of [24, 56, 96]) {
    const spacing = 2.25 * fillScale;
    for (const k of [1, 2, 3]) {
      // A preset picks fillSpeed = k·S/T: the speed is then exact on every size.
      const props = kit({...MANSION_FOG, fillScale, fillSpeed: (k * spacing) / 16, durationSeconds: 16});
      for (const area of areas) {
        const motion = getFillMotion(props, area);
        assert.deepEqual(motion, {period: spacing, laps: k, unitsPerPeriod: 1, speed: (k * spacing) / 16, sway: 0});
        assert.deepEqual(getFillMotion(props, area, options), motion, 'as opções do tipo não mudam a velocidade');
      }
    }
  }
  assert.deepEqual(getFillMotion(kit({...MANSION_FOG, fillSpeed: 0}), areas[1]!).speed, 0);
});

test('Névoa: os bancos andam de lado no sentido do cosseno de fillAngle (nunca parados), nas duas fileiras juntos', () => {
  const box = panelOf(kit({})).box;
  for (const [fillAngle, sign] of [[0, 1], [45, 1], [90, 1], [-90, 1], [89, 1], [91, -1], [180, -1], [-135, -1]] as const) {
    const props = kit({...MANSION_FOG, fillAngle, fillSpeed: 27, fillScale: 48});
    const a = fogBanks(buildFillScene(props, box, 100, 480));
    const b = fogBanks(buildFillScene(props, box, 100.01, 480));
    const velocities = a.map((bank, index) => ((b[index]!.cx as number) - (bank.cx as number)) / (0.01 / 60));
    // Every bank, in both rows, moves at the one reported speed (8 s at 60 fps here).
    const {speed} = getFillMotion(props, box);
    for (const velocity of velocities) assert.ok(Math.abs(velocity - sign * speed) < 1e-3 * speed, `${fillAngle}°: ${velocity} vs ${sign * speed}`);
  }
});

test('Névoa: dois bancos por lugar, na parte de baixo da área, a mesma quantidade em todo frame', () => {
  for (const [width, height, fillScale] of [[640, 360, 48], [320, 64, 56], [1920, 1080, 24], [448, 1016, 96]] as const) {
    const area = {x: 10, y: 20, width, height};
    const props = kit({...MANSION_FOG, fillScale, fillSpeed: 30});
    const counts = new Set<number>();
    for (const frame of [0, 77, 240.5, 479]) {
      const scene = buildFillScene(props, area, frame, 480);
      assert.deepEqual(scene[0], {type: 'rect', ...area, corner: 0, color: '#0E1520', opacity: props.fillOpacity});
      const banks = fogBanks(scene);
      assert.equal(banks.length, scene.length - 1);
      assert.equal(banks.length % 2, 0, 'duas fileiras iguais');
      counts.add(banks.length);
      for (const bank of banks) {
        // Low fog: every centre between 0.25 H and 1.4 H above the bottom edge.
        const cy = bank.cy as number;
        assert.ok(cy >= area.y + height - 1.4 * fillScale && cy <= area.y + height - 0.25 * fillScale, `${cy}`);
        assert.deepEqual([bank.color, bank.coreColor], ['#688789', '#D6DDC7']);
      }
    }
    assert.equal(counts.size, 1);
  }
  // One colour: no base, the fog in that colour, its core too; two: the core is the fog's colour.
  const box = {x: 0, y: 0, width: 640, height: 360};
  const one = buildFillScene(kit({fill: 'nevoa', fillColors: ['#ABCDEF']}), box, 0, 480);
  assert.ok(one.every((element) => element.type === 'fog' && element.color === '#ABCDEF' && element.coreColor === '#ABCDEF'));
  const two = buildFillScene(kit({fill: 'nevoa', fillColors: ['#000000', '#ABCDEF']}), box, 0, 480);
  assert.ok(fogBanks(two).every((element) => element.coreColor === '#ABCDEF'));
});

test('Névoa: a volta das posições só troca bancos fora da área (com todo o alcance) e não muda a imagem', () => {
  for (const fillAngle of [0, 180]) {
    const props = kit({...MANSION_FOG, fillAngle, fillSpeed: 60, fillScale: 40});
    const box = panelOf(props).box;
    const spacing = 2.25 * 40;
    const sample = (frame: number) => fogBanks(buildFillScene(props, box, frame, 480));
    const visible = (scene: Scene) => scene
      .filter((bank) => (bank.cx as number) + (bank.width as number) / 2 > box.x && (bank.cx as number) - (bank.width as number) / 2 < box.x + box.width)
      .map((bank) => [bank.cx, bank.cy, bank.width, bank.height, bank.opacity, bank.coreOpacity] as number[])
      .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    const found = jumps(sample, 'cx', spacing / 2);
    const frames = [...new Set(found.map((entry) => entry.frame))];
    assert.ok(frames.length >= 2, 'a névoa dá mais de uma volta de posições');
    for (const frame of frames) {
      assert.ok(frame > 1 && frame < 479, 'a volta não cai na emenda');
      // Pin the wrap down, then compare the picture just before and just after it.
      let [low, high] = [frame - 0.05, frame];
      for (let step = 0; step < 40; step++) {
        const middle = (low + high) / 2;
        if (Math.abs((sample(middle)[0]!.cx as number) - (sample(low)[0]!.cx as number)) > spacing / 2) high = middle;
        else low = middle;
      }
      const before = visible(sample(low));
      const after = visible(sample(high));
      assert.equal(before.length, after.length, `em ${frame}`);
      before.forEach((bank, index) => bank.forEach((value, key) =>
        assert.ok(Math.abs(value - after[index]![key]!) < 1e-4 * (1 + Math.abs(value)), `em ${frame}: ${value} → ${after[index]![key]}`)));
      // The places that swap (one leaves at an end of each row, one comes in at the other) are
      // wholly out of the area, soft reach included.
      const [a, b] = [sample(low), sample(high)];
      for (const [from, to] of [[a, b], [b, a]] as const) {
        const unmatched = from.filter((bank) => !to.some((other) => Math.abs((other.cx as number) - (bank.cx as number)) < 1e-3
          && Math.abs((other.cy as number) - (bank.cy as number)) < 1e-3));
        assert.equal(unmatched.length, 2, 'um lugar por fileira');
        for (const bank of unmatched) {
          const [cx, reach] = [bank.cx as number, (bank.width as number) / 2];
          assert.ok(cx + reach <= box.x + 1e-6 || cx - reach >= box.x + box.width - 1e-6, `banco à vista na volta: ${cx}`);
        }
      }
    }
  }
});

/** sRGB relative luminance of #RRGGBB. */
const luminanceOf = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

/** Piecewise-linear gradient opacity, as SVG draws the stops. */
const stopShare = (stops: readonly (readonly [number, number])[], r: number) => {
  if (r >= 1) return 0;
  for (let index = 1; index < stops.length; index++) {
    const [o0, v0] = stops[index - 1]!;
    const [o1, v1] = stops[index]!;
    if (r <= o1) return v0 + ((r - o0) / (o1 - o0)) * (v1 - v0);
  }
  return 0;
};

type FogScan = {width: number; height: number; fillScale: number; fillSpeed: number; seed: number; frames: readonly number[]; stepX: number; stepY: number};

/** Composites the mansão fog pixel by pixel (as SVG draws the gradients) and returns the worst coverage and luminance. */
const worstFog = (scans: readonly FogScan[]) => {
  const rgb = (hex: string) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const [base, body, core] = MANSION_FOG.fillColors.map(rgb);
  let worst = {body: 0, core: 0, luminance: 0};
  for (const {width, height, fillScale, fillSpeed, seed, frames, stepX, stepY} of scans) {
    const props = kit({...MANSION_FOG, fillOpacity: 1, fillScale, fillSpeed, seed, durationSeconds: 16});
    const area = {x: 0, y: 0, width, height};
    for (const frame of frames) {
      const banks = fogBanks(buildFillScene(props, area, frame, 960));
      for (let y = Math.max(0, height - 2.5 * fillScale); y <= height; y += stepY) {
        for (let x = 0; x <= width; x += stepX) {
          let [clearBody, clearCore] = [1, 1];
          let color = base!;
          for (const bank of banks) {
            const [cx, cy, w, h] = [bank.cx, bank.cy, bank.width, bank.height] as number[];
            // Outside the bank's box both gradients are 0 (the core sits inside the body).
            if (Math.abs(x - cx!) >= w! / 2 || Math.abs(y - cy!) >= h! / 2) continue;
            const a = (bank.opacity as number) * stopShare(FOG_SHAPE.bodyStops, Math.hypot((x - cx!) / (w! / 2), (y - cy!) / (h! / 2)));
            const coreY = cy! - FOG_SHAPE.coreRise * h!;
            const c = (bank.coreOpacity as number) * stopShare(FOG_SHAPE.coreStops,
              Math.hypot((x - cx!) / ((FOG_SHAPE.coreWidth * w!) / 2), (y - coreY) / ((FOG_SHAPE.coreHeight * h!) / 2)));
            clearBody *= 1 - a;
            clearCore *= 1 - c;
            color = color.map((channel, index) => channel * (1 - a) + body![index]! * a);
            color = color.map((channel, index) => channel * (1 - c) + core![index]! * c);
          }
          const hex = `#${color.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
          worst = {
            body: Math.max(worst.body, 1 - clearBody), core: Math.max(worst.core, 1 - clearCore),
            luminance: Math.max(worst.luminance, luminanceOf(hex)),
          };
        }
      }
    }
  }
  return worst;
};

test('Névoa: legibilidade: no pior pixel o corpo cobre ≤ 0,30 e o miolo ≤ 0,10, e o kit da mansão não clareia além de #39474B', () => {
  const limit = luminanceOf('#39474B');
  const fine: FogScan[] = [[640, 360], [320, 64]].flatMap(([width, height]) => [24, 96].flatMap((fillScale) => [1, 81].map((seed) => ({
    width: width!, height: height!, fillScale, fillSpeed: 27, seed, frames: [0, 211, 611], stepX: fillScale / 8, stepY: fillScale / 16,
  }))));
  // Wider and coarser: 41 seeds, still, slow (laps 2: some waves stand) and fast (laps 8), on a wide area.
  const wide: FogScan[] = [0, 11.25, 45].flatMap((fillSpeed) => Array.from({length: 41}, (_, seed) => ({
    width: 1000, height: 300, fillScale: 40, fillSpeed, seed, frames: [0, 211, 611, 877], stepX: 10, stepY: 10,
  })));
  const worst = worstFog([...fine, ...wide]);
  assert.ok(worst.body <= FOG_BODY_CAP && worst.body > 0.15, `corpo ${worst.body}`);
  assert.ok(worst.core <= FOG_CORE_CAP && worst.core > 0.05, `miolo ${worst.core}`);
  assert.ok(worst.luminance <= limit, `luminância ${worst.luminance} > ${limit}`);
  // Below fillOpacity 1 the footage shows through the base. Over white footage, at the preset's
  // fillOpacity 0.95, the worst pile-up (body and core scaled by fillOpacity) keeps amber ≥ 4.5:1;
  // at 0.9 it would drop to ≈ 4.3:1.
  const amber = luminanceOf('#E8AF62');
  const overWhite = (fillOpacity: number) => {
    const mix = (from: number[], to: number[], share: number) => from.map((channel, index) => channel * (1 - share) + to[index]! * share);
    const [base, body, core] = MANSION_FOG.fillColors.map((hex) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)));
    const pixel = mix(mix(mix([255, 255, 255], base!, fillOpacity), body!, worst.body * fillOpacity), core!, worst.core * fillOpacity);
    return (amber + 0.05) / (luminanceOf(`#${pixel.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`) + 0.05);
  };
  assert.ok(overWhite(0.95) >= 4.5, `âmbar sobre imagem branca a 0,95: ${overWhite(0.95)}`);
});

test('Damasco: um só padrão sobre a base, ladrilho fillScale × 1,5·fillScale, andando como os pontos', () => {
  const area = {x: 32, y: 32, width: 640, height: 360};
  const props = kit({fill: 'damasco', fillColors: ['#0C1412', '#1F2B25', '#FF0000'], fillScale: 56, fillSpeed: 0});
  const scene = buildFillScene(props, area, 0, 480);
  // One element: the base is inside the tile, so ink and ground share one alpha (fillOpacity).
  assert.equal(scene.length, 1);
  const damask = scene[0]! as Scene[number];
  assert.deepEqual(
    [damask.type, damask.x, damask.y, damask.width, damask.height, damask.tileWidth, damask.tileHeight, damask.color, damask.baseColor, damask.opacity],
    ['damask', 32, 32, 640, 360, 56, 84, '#1F2B25', '#0C1412', props.fillOpacity],
  );
  assert.deepEqual(buildFillScene(props, area, 313, 480), scene, 'parado quando fillSpeed é 0');
  // One colour: no base ('none'). A 1920×1080 area is still one element.
  const single = buildFillScene(kit({fill: 'damasco', fillColors: ['#9FB095']}), {x: 0, y: 0, width: 1920, height: 1080}, 0, 480);
  assert.deepEqual(single.map((element) => [element.type, (element as Scene[number]).baseColor, (element as Scene[number]).color]), [['damask', 'none', '#9FB095']]);
  // The period: one tile per axis along the nearest axis or diagonal.
  const at = (fillAngle: number) => getFillMotion(kit({fill: 'damasco', fillScale: 40, fillAngle, fillSpeed: 30, durationSeconds: 8}), area);
  assert.deepEqual([at(0).period, at(0).unitsPerPeriod], [40, 1]);
  assert.deepEqual([at(90).period, at(90).unitsPerPeriod], [60, 2]);
  assert.deepEqual([at(-45).period, at(-45).unitsPerPeriod], [Math.hypot(40, 60), 2]);
  assert.equal(at(0).speed, (at(0).laps * 40) / 8);
  // Moving right and down: the offsets grow (between wraps) by the reported speed per axis.
  const moving = kit({fill: 'damasco', fillScale: 40, fillAngle: 45, fillSpeed: 30, durationSeconds: 8});
  const [a, b] = [100, 100.01].map((frame) => buildFillScene(moving, area, frame, 480).at(-1)! as Scene[number]);
  const {laps} = getFillMotion(moving, area);
  assert.ok(Math.abs(((b!.offsetX as number) - (a!.offsetX as number)) / (0.01 / 60) - (laps * 40) / 8) < 1e-6);
  assert.ok(Math.abs(((b!.offsetY as number) - (a!.offsetY as number)) / (0.01 / 60) - (laps * 60) / 8) < 1e-6);
  const markup = renderPanel({fill: 'damasco', fillColors: ['#0C1412', '#1F2B25'], fillScale: 56, fillSpeed: 0});
  assert.equal(markup.match(/<pattern /g)?.length, 1);
  assert.match(markup, /<pattern id="ov-fill-damasco-0" patternUnits="userSpaceOnUse" x="0" y="0" width="56" height="84" patternTransform="translate\([\d.]+ [\d.]+\)">/);
  assert.match(markup, /fill="url\(#ov-fill-damasco-0\)"/);
  // The base fills the tile under the ink; only the area rect carries the opacity.
  assert.match(markup, /patternTransform="translate\([\d.]+ [\d.]+\)"><rect x="0" y="0" width="56" height="84" fill="#0C1412"><\/rect><g transform="scale\([\d.]+ [\d.]+\)" fill="#1F2B25">/);
  assert.equal(markup.match(/fill="#0C1412"/g)?.length, 1, 'sem retângulo de base fora do ladrilho');
});

test('Aliasing: o damasco rápido demais é recusado como os pontos; a névoa nunca', () => {
  assertLimit(fillSchema, {fill: 'damasco', fillScale: 8, fillSpeed: 480, fillAngle: 0}, 'fillSpeed');
  assertLimit(fillSchema, {fill: 'damasco', fillScale: 8, fillSpeed: 480, fillAngle: 90, outputFormat: 'gif'}, 'fillSpeed');
  assertLimit(fillSchema, {fill: 'damasco', fillScale: 12, fillSpeed: 480, fillAngle: 45}, 'fillSpeed');
  assert.match(fillSchema.safeParse({fill: 'damasco', fillScale: 8, fillSpeed: 480}).error!.issues[0]!.message, /for the damask: .* or increase fillScale\./);
  assert.equal(fillSchema.safeParse({fill: 'damasco', fillScale: 56, fillSpeed: 0}).success, true);
  // The fog's banks overlap into one soft band and wrap unseen: nothing to alias.
  assert.equal(fillSchema.safeParse({fill: 'nevoa', fillScale: 8, fillSpeed: 480, outputFormat: 'gif'}).success, true);
  assert.equal(fillSchema.safeParse({fill: 'nevoa', fillScale: 8, fillSpeed: 480, durationSeconds: 0.5}).success, true);
});

test('Névoa e damasco: poucos elementos numa tela 1920×1080, com fillScale mínimo', () => {
  const screen = {x: 0, y: 0, width: 1920, height: 1080};
  const fog = buildFillScene(kit({fill: 'nevoa', fillScale: 8, fillSpeed: 40}), screen, 77, 480);
  // Two rows of (1920 + a reach on each side) / S banks, plus two places each, plus the base.
  const reach = (FOG_SHAPE.width * 8 * FOG_MAX_SIZE) / 2;
  assert.equal(fog.length, 1 + 2 * (Math.ceil((1920 + 2 * reach) / 18) + 2));
  assert.ok(fog.length < 250);
  const started = performance.now();
  for (let frame = 0; frame < 60; frame++) buildFillScene(kit({fill: 'nevoa', fillScale: 8, fillSpeed: 40}), screen, frame, 480);
  assert.ok(performance.now() - started < 1000, 'monta 60 frames da tela em menos de 1 s');
  assert.equal(buildFillScene(kit({fill: 'damasco', fillScale: 8}), screen, 77, 480).length, 1);
});

test('Aliasing: o gradiente balançando é recusado no ponto mais rápido, com a velocidade máxima, que é aceita', () => {
  // Only a tiny box at a high speed gets there: 16 px wide, two colours, 480 px/s at 50 fps.
  const tiny = {fill: 'gradiente', fillColors: ['#000', '#FFF'], fillAngle: 0, width: 16, height: 16, fillSpeed: 480, outputFormat: 'gif'};
  const limit = assertLimit(fillSchema, tiny, 'fillSpeed');
  assert.match(fillSchema.safeParse(tiny).error!.issues[0]!.message, /for the gradient: .* or enlarge the box\./);
  const motion = getFillMotion(kit({...tiny, fillSpeed: limit}), panelOf(kit(tiny)).box);
  assert.ok(swayShare(motion, 400) <= MAX_FRAME_SHARE);
  // Every named size is far from it, even at the fastest speed and the slowest frame rate.
  for (const size of NAMED_SIZES) {
    assert.equal(fillSchema.safeParse({...sizeProps(size), fill: 'gradiente', fillSpeed: 480, outputFormat: 'gif'}).success, true, size.id);
  }
});

// ── Rendering ───────────────────────────────────────────────────────────────────────────────

const renderPanel = (input: object, frame = 0) => {
  const props = kit(input);
  const layout = panelOf(props);
  const fill = buildFillScene(props, layout.box, frame, 480, {corner: layout.shape.radius});
  const stroke = [...buildStrokeScene(props, layout.track, frame, 480), ...buildGlowScene(props, frame, 480)];
  const halo = buildHaloScene(props, frame, 480);
  return renderToStaticMarkup(createElement(OverlayCanvas, {
    props, width: layout.canvas.width, height: layout.canvas.height, layout, guides: props.guides,
    children: createElement(Fragment, null,
      createElement(HaloLayer, {elements: halo, shape: layout.shape}),
      createElement(FillLayer, {elements: fill, clip: layout.shape}),
      createElement(StrokeLayer, {elements: stroke, tracks: [layout.track], core: props.strokeCore})),
  }));
};

test('Render: SVG do tamanho do arquivo, brilho sobre o canvas inteiro, sem blend mode', () => {
  for (const fill of FILL_STYLES) {
    for (const strokeMotion of STROKE_MOTIONS) {
      const markup = renderPanel({fill, strokeMotion, glow: 12, halo: 8, glowPulses: 1}, 123);
      assert.match(markup, /<svg width="704" height="424" viewBox="0 0 704 424"/);
      assert.match(markup, /<filter id="ov-stroke-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="704" height="424"/);
      assert.match(markup, /clip-path="url\(#ov-fill-clip\)"/);
      assert.doesNotMatch(markup, /mix-blend-mode|NaN|Infinity|undefined/);
      assert.doesNotMatch(markup, /data-guides/);
    }
  }
  // Transparent by default on the alpha formats; MP4 composites over backgroundColor.
  assert.match(renderPanel({}), /background-color:transparent/);
  assert.match(renderPanel({outputFormat: 'mp4', backgroundColor: '#123456'}), /background-color:#123456/);
  assert.match(renderPanel({guides: true}), /data-guides/);
  assert.match(renderPanel({strokeMotion: 'formigas'}), /stroke-linecap="butt"/);
  assert.match(renderPanel({fill: 'gradiente'}), /spreadMethod="repeat"/);
  assert.match(renderPanel({fill: 'gradiente'}), /gradientUnits="userSpaceOnUse"/);
});

test('Render: a moldura mascara o buraco e, em tela, recorta na caixa', () => {
  for (const fit of ['window', 'screen'] as const) {
    const layout = layoutFrame(fit === 'window'
      ? {width: 640, height: 360, bleed: 48, radius: 24, thickness: 8, glow: 16, fit}
      : {width: 1920, height: 1080, bleed: 0, radius: 24, thickness: 12, glow: 16, fit});
    const props = kit({strokeMotion: 'cometas', strokeWidth: layout.thickness, width: layout.box.width, height: layout.box.height, bleed: layout.box.x});
    const markup = renderToStaticMarkup(createElement(OverlayCanvas, {
      props, width: layout.canvas.width, height: layout.canvas.height, layout, guides: true,
      children: createElement(FrameGroup, {layout, children: createElement(StrokeLayer, {
        elements: [...buildStrokeScene(props, layout.track, 60, 480), ...buildGlowScene(props, 60, 480)], tracks: [layout.track],
      })}),
    }));
    assert.match(markup, /<mask id="ov-frame-hole" maskUnits="userSpaceOnUse" x="0" y="0"/);
    assert.ok(markup.includes(`d="${roundRectPath(layout.holeShape)}" fill="#000000"`), 'o buraco é preto na máscara');
    assert.match(markup, /mask="url\(#ov-frame-hole\)"/);
    assert.equal(markup.includes('clip-path="url(#ov-frame-box)"'), fit === 'screen');
    assert.match(markup, /data-guides/);
  }
});

// ── Finish: light, rim, core, glow strength ─────────────────────────────────────────────────

test('Acabamento: os campos novos começam desligados, então o visual de antes continua igual', () => {
  const props = kit({});
  assert.deepEqual([props.fillLight, props.rimLight, props.strokeCore, props.glowStrength], [0, 0, 0, 1]);
  const layout = panelOf(props);
  for (const fill of FILL_STYLES) {
    assert.ok(!buildFillScene(kit({fill}), layout.box, 99, 480).some((element) => element.type === 'shade'), fill);
  }
  assert.deepEqual(buildRimScene(props, layout.inner), []);
  assert.deepEqual(buildGlowScene(props, 0, 480).map((element) => element.gain), [GLOW_GAIN]);
  assert.doesNotMatch(renderPanel({}), /data-core/);
});

test('Acabamento: a luz de cima é um véu parado sobre o preenchimento inteiro, por último', () => {
  for (const fill of FILL_STYLES) {
    const props = kit({fill, fillLight: 0.2});
    const {box} = panelOf(props);
    const at = (frame: number) => buildFillScene(props, box, frame, 480);
    const shade = at(0).at(-1)!;
    assert.deepEqual(shade, {type: 'shade', ...box, color: '#FFFFFF', opacity: 0.2}, fill);
    assert.deepEqual(at(313).at(-1), shade, `${fill}: a luz não anda`);
    // It only adds itself: the pattern under it is the one without the light.
    assert.deepEqual(at(313).slice(0, -1), buildFillScene(kit({fill}), box, 313, 480), fill);
  }
  const markup = renderPanel({fillLight: 0.2});
  assert.match(markup, /<linearGradient id="ov-fill-shade-\d+" gradientUnits="userSpaceOnUse" x1="0" y1="32" x2="0" y2="392">/);
});

test('Acabamento: o reflexo de 1 px corre por dentro do contorno e nunca chega ao texto', () => {
  // The kinds' real layouts: their text areas keep clear of the round corners, the kit's do not.
  const panels = [
    ...sizesForKind('chat').flatMap((size) => [0, 16, 999].flatMap((radius) => [0, 2, 8].map((strokeWidth) => {
      const props = chatLoopSchema.parse({...sizeProps(size), radius, strokeWidth, rimLight: 0.8, glow: 0});
      const layout = getChatLayout(props);
      return {label: `chat ${size.id} r${radius} s${strokeWidth}`, layout, areas: [layout.content, layout.header!],
        rim: getChatLayers(props, 0, 480).rim};
    }))),
    ...sizesForKind('block').flatMap((size) => [0, 16, 999].flatMap((radius) => [0, 2, 8].map((strokeWidth) => {
      const props = blockLoopSchema.parse({...sizeProps(size), radius, strokeWidth, rimLight: 0.8, glow: 0, halo: 0});
      const layout = getBlockLayout(props);
      return {label: `bloco ${size.id} r${radius} s${strokeWidth}`, layout, areas: [layout.content], rim: getBlockLayers(props, 0, 480).rim};
    }))),
  ];
  for (const {label, layout, areas, rim: [rim, ...rest]} of panels) {
    assert.ok(rim && rest.length === 0, label);
    assert.equal(rim.lineWidth, 1);
    assert.ok(rim.fade > 0 && rim.fade <= rim.height / 2 + 1e-9, label);
    // The line's outer edge is the inside of the stroke; the text keeps clear of its inner edge.
    assert.ok(Math.abs(roundRectSdf(layout.inner, rim.x + rim.width / 2, rim.y - 0.5)) < 1e-9, label);
    for (const area of areas) assert.ok(contentClearance(offsetRoundRect(layout.inner, -1), area) > 0, label);
  }
  const layout = panelOf(kit({}));
  const markup = renderToStaticMarkup(createElement(OverlayCanvas, {
    props: kit({}), width: layout.canvas.width, height: layout.canvas.height,
    children: createElement(RimLayer, {elements: buildRimScene({rimLight: 0.5}, offsetRoundRect(layout.inner, -0.5))}),
  }));
  assert.match(markup, /stroke="url\(#ov-rim-rim-0\)" stroke-width="1" opacity="0.5"/);
});

test('Acabamento: um reflexo forte colado no texto é recusado, e a saída da mensagem resolve', () => {
  const rimIssues = (result: z.ZodSafeParseResult<unknown>) =>
    result.success ? [] : result.error.issues.filter((issue) => issue.path[0] === 'rimLight');
  const cases = [
    {
      label: 'chat sem padding', schema: chatLoopSchema, input: {padding: 0, glow: 0, rimLight: 1},
      fixes: [{padding: 1}, {rimLight: 0.2}], areas: [/messages/, /title/],
    },
    {
      label: 'chat sem título nem padding', schema: chatLoopSchema, input: {padding: 0, headerHeight: 0, glow: 0, rimLight: 1},
      fixes: [{padding: 1}, {rimLight: 0.2}], areas: [/messages/],
    },
    {
      label: 'bloco sem padding', schema: blockLoopSchema, input: {paddingX: 0, paddingY: 0, glow: 0, halo: 0, rimLight: 1},
      fixes: [{paddingX: 1, paddingY: 1}, {rimLight: 0.2}], areas: [/text/],
    },
    {
      label: 'bloco sem padding dos lados', schema: blockLoopSchema, input: {paddingX: 0, paddingY: 16, glow: 0, halo: 0, rimLight: 1},
      fixes: [{paddingX: 1}, {rimLight: 0.2}], areas: [/text/],
    },
  ] as const;
  for (const {label, schema, input, fixes, areas} of cases) {
    const issues = rimIssues(schema.safeParse(input));
    assert.equal(issues.length, areas.length, `${label}: recusado uma vez por área`);
    for (const issue of issues) assert.match(issue.message, /^The top rim light would touch the .*, or use rimLight up to 0\.2\.$/, label);
    for (const area of areas) assert.ok(issues.some((issue) => area.test(issue.message)), label);
    for (const fix of fixes) assert.equal(schema.safeParse({...input, ...fix}).success, true, `${label} com ${JSON.stringify(fix)}`);
  }
  // Every accepted panel with a bright rim keeps each text area off the 1 px line, at the edge
  // of what the refusal lets through and in every named size.
  const accepted = [
    ...sizesForKind('chat').flatMap((size) => [1, 1.5, 16].flatMap((padding) => [0, 8, 48].map((headerHeight) => {
      const props = chatLoopSchema.parse({...sizeProps(size), padding, headerHeight, radius: 999, rimLight: 1, glow: 0});
      const layout = getChatLayout(props);
      return {label: `chat ${size.id} p${padding} h${headerHeight}`, inner: layout.inner, areas: [layout.content, layout.header]};
    }))),
    ...sizesForKind('block').flatMap((size) => [1, 1.5, 16].flatMap((paddingX) => [1, 2].map((paddingY) => {
      const props = blockLoopSchema.parse({...sizeProps(size), paddingX, paddingY, radius: 999, rimLight: 1, glow: 0, halo: 0});
      const layout = getBlockLayout(props);
      return {label: `bloco ${size.id} px${paddingX} py${paddingY}`, inner: layout.inner, areas: [layout.content]};
    }))),
  ];
  for (const {label, inner, areas} of accepted) {
    for (const area of areas) if (area) assert.ok(contentClearance(inner, area) >= 1 - 1e-9, label);
  }
});

test('Acabamento: o miolo claro só pinta por dentro de traços largos, e a cena não muda', () => {
  for (const strokeMotion of STROKE_MOTIONS) {
    const plain = kit({strokeMotion, strokeColors: ['#22D3EE', '#E879F9'], trackOpacity: 0.4});
    const cored = kit({strokeMotion, strokeColors: ['#22D3EE', '#E879F9'], trackOpacity: 0.4, strokeCore: 0.8});
    const {track} = panelOf(plain);
    // The core is drawn by the renderer from the same elements: the scans see the same scene.
    assert.deepEqual(buildStrokeScene(cored, track, 77, 480), buildStrokeScene(plain, track, 77, 480), strokeMotion);
  }
  const coreStrokes = (input: object) => (renderPanel(input).match(/data-core="true"/g) ?? []).length;
  // A 4 px tube gets a core; below CORE_MIN_WIDTH it stays a plain line (a 1 px white line would whiten it).
  assert.ok(coreStrokes({strokeMotion: 'parado', strokeColors: ['#22D3EE'], strokeWidth: 4, strokeCore: 0.9}) > 0);
  assert.ok(CORE_MIN_WIDTH > 2);
  assert.equal(coreStrokes({strokeMotion: 'parado', strokeColors: ['#22D3EE'], strokeWidth: 2, strokeCore: 0.9}), 0);
  assert.equal(coreStrokes({strokeMotion: 'parado', strokeColors: ['#22D3EE'], strokeWidth: 4, strokeCore: 0}), 0);
});

test('Acabamento: a força do brilho multiplica só o ganho; o alcance e a pulsação não mudam', () => {
  for (const glowStrength of [0.25, 1, 2.6, 3]) {
    const [plain] = buildGlowScene(kit({glowPulses: 2}), 123, 480);
    const [strong] = buildGlowScene(kit({glowPulses: 2, glowStrength}), 123, 480);
    assert.deepEqual({...strong, gain: plain!.gain}, plain);
    assert.equal(strong!.gain, GLOW_GAIN * glowStrength);
  }
  assert.equal(kitSchema.safeParse({glowStrength: 3.5}).success, false);
  assert.match(renderPanel({glow: 12, glowStrength: 2}), new RegExp(`<feFuncA type="linear" slope="${GLOW_GAIN * 2}"`));
});
