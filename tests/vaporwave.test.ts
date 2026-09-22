import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Children, createElement, isValidElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {resolveExport} from '../scripts/export';
import {
  ALPHA_MOUNTAIN_OPACITY, ALPHA_ROW_BOTTOM, CONTENT_BOX, getMountainRidges, getPlateWeight, getRowField, getSunCutField,
  getSunCutScale, getSunX, getSunY, getVaporwaveScene, groundY, HEIGHT, HORIZON_Y, METEOR_HALO, ROW_COUNT, ROW_FAR,
  ROW_NEAR, ROW_STEP, SHAPE_BOB, SHAPE_JITTER, SHAPE_SIZE, SHAPE_SLOTS, SHAPE_TURNS, SPARKLE_GLOW, SPARKLE_MAX,
  SPARKLE_SKY, SUN_CUT_DRIFT, SUN_CUT_END, SUN_CUT_START, SUN_RADIUS, VaporwaveArtwork, vaporwaveLoopSchema, WIDTH,
  type VaporwaveElement, type VaporwaveLoopProps,
} from '../src/backgrounds/VaporwaveLoop';
import {darken, PLATE, type Point} from '../src/backgrounds/vaporwave/frame';
import {
  APEX_CLEARANCE, CROWN_CLEARANCE, CROWN_COLUMNS, getMountainOutline,
} from '../src/backgrounds/vaporwave/Mountains';
import {
  getPalmPoints, getPalmShape, PALM_ALPHA_FADE, PALM_JITTER, PALM_ORDER, PALM_PAINT_MARGIN, PALM_SLOTS, PALM_SWAY,
  palmBaseX,
} from '../src/backgrounds/vaporwave/Palm';
import {getSolidFaces, SOLID_EDGE, SOLID_GLOW, SOLID_REACH} from '../src/backgrounds/vaporwave/Polyhedron';
import {backgroundCatalog} from '../src/catalog';
import {TAU} from '../src/loop';
import {RemotionRoot} from '../src/Root';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

const LENGTH = 960;
const FRAMES = [0, 1, 97, 240, 481, 719, 959];
const KINDS = ['star', 'sparkle', 'meteor', 'sun', 'sunCut', 'ridge', 'horizon', 'row', 'palm', 'shape'] as const;
const pick = (scene: VaporwaveElement[], kind: VaporwaveElement['kind']) => scene.filter((item) => item.kind === kind);
const scene = (input: Record<string, unknown>, frame: number, length = LENGTH) =>
  getVaporwaveScene(vaporwaveLoopSchema.parse(input), frame, length);
const readPreset = (filename: string): unknown =>
  JSON.parse(readFileSync(new URL(`../presets/${filename}`, import.meta.url), 'utf8'));
const markupOf = (input: Record<string, unknown>, frame = 0) => renderToStaticMarkup(createElement(VaporwaveArtwork, {
  props: vaporwaveLoopSchema.parse(input), frame, durationInFrames: LENGTH,
}));
/** The README's title band: where a stream puts a centred title. */
const TITLE_BAND = {left: 610, top: 470, right: 1310, bottom: 560} as const;
/** The stops of a gradient in the rendered markup; SVG's defaults fill in what is omitted. */
const gradientStops = (markup: string, id: string) => {
  const body = new RegExp(`<(?:linear|radial)Gradient id="${id}"[^>]*>([\\s\\S]*?)</(?:linear|radial)Gradient>`).exec(markup);
  assert.ok(body, `${id} não está no desenho`);
  return [...body[1]!.matchAll(/<stop([^>]*)>/g)].map(([, attributes]) => ({
    offset: Number(/offset="([^"]+)"/.exec(attributes!)?.[1] ?? 0),
    opacity: Number(/stop-opacity="([^"]+)"/.exec(attributes!)?.[1] ?? 1),
  }));
};
/** A gradient's opacity at an offset, interpolated between its stops as SVG does. */
const opacityAt = (stops: ReturnType<typeof gradientStops>, offset: number) => {
  const next = stops.findIndex((stop) => stop.offset >= offset);
  if (next === -1) return stops.at(-1)!.opacity;
  if (next === 0 || stops[next]!.offset === offset) return stops[next]!.opacity;
  const [low, high] = [stops[next - 1]!, stops[next]!];
  return low.opacity + ((high.opacity - low.opacity) * (offset - low.offset)) / (high.offset - low.offset);
};

/** Whether a segment crosses the content area grown by `margin` (Liang–Barsky clipping). */
const segmentEntersBox = ([x0, y0]: Point, [x1, y1]: Point, margin: number) => {
  const box = {
    left: CONTENT_BOX.left - margin, right: CONTENT_BOX.right + margin,
    top: CONTENT_BOX.top - margin, bottom: CONTENT_BOX.bottom + margin,
  };
  let low = 0;
  let high = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - box.left], [dx, box.right - x0], [-dy, y0 - box.top], [dy, box.bottom - y0]] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low > high) return false;
  }
  return true;
};
const polygonEntersBox = (points: readonly Point[], margin: number) =>
  points.some((point, index) => segmentEntersBox(point, points[(index + 1) % points.length]!, margin));
const discEntersBox = (x: number, y: number, radius: number) => {
  const nearestX = Math.max(CONTENT_BOX.left, Math.min(CONTENT_BOX.right, x));
  const nearestY = Math.max(CONTENT_BOX.top, Math.min(CONTENT_BOX.bottom, y));
  return Math.hypot(x - nearestX, y - nearestY) < radius;
};

test('Vaporwave: Studio, catálogo, schema e preset abrem o mesmo horizonte de dezesseis segundos', () => {
  const defaults = vaporwaveLoopSchema.parse({});
  assert.deepEqual(defaults, {
    durationSeconds: 16, seed: 88, transparent: false, backgroundColor: '#120C2E',
    colors: ['#FF71CE', '#01CDFE', '#FFFB96', '#B967FF'], outputFormat: 'webm',
    speed: 4, sunPosition: 0.9, neonGlow: 0.7, starCount: 90, shootingStars: 1,
    palmCount: 2, shapeCount: 2, centerShade: 0.6,
  });
  const metadata = getCompositionMetadata(defaults);
  assert.deepEqual(metadata, {width: 1920, height: 1080, fps: 60, durationInFrames: 960});
  assert.deepEqual(backgroundCatalog.VaporwaveLoop.defaultProps, defaults);
  assert.deepEqual(vaporwaveLoopSchema.strict().parse(readPreset('vaporwave-horizonte.json')), defaults);

  type CompositionProps = typeof metadata & {
    id: string;
    defaultProps: typeof defaults;
    schema: typeof vaporwaveLoopSchema;
    calculateMetadata: (options: {props: typeof defaults}) => typeof metadata & {props: typeof defaults};
  };
  const composition = Children.toArray(RemotionRoot().props.children).find((child) =>
    isValidElement<CompositionProps>(child) && child.props.id === 'VaporwaveLoop');
  assert.ok(isValidElement<CompositionProps>(composition), 'o horizonte neon precisa estar registrado no Studio');
  assert.equal(composition.props.schema, vaporwaveLoopSchema);
  assert.deepEqual(composition.props.defaultProps, defaults);
  for (const key of ['width', 'height', 'fps', 'durationInFrames'] as const) {
    assert.equal(composition.props[key], metadata[key]);
  }
  const custom = vaporwaveLoopSchema.parse({durationSeconds: 3.7, outputFormat: 'gif'});
  const calculated = composition.props.calculateMetadata({props: custom});
  assert.deepEqual(calculated.props, custom);
  assert.equal(calculated.durationInFrames, 185);
  assert.equal(calculated.fps, 50);
  for (const key of [
    'colors', 'speed', 'sunPosition', 'neonGlow', 'starCount', 'shootingStars', 'palmCount', 'shapeCount', 'centerShade',
  ] as const) {
    assert.ok(vaporwaveLoopSchema.shape[key].description, `${key}: o Studio precisa de uma descrição`);
  }
});

test('Vaporwave: os controles rejeitam valores inválidos e aceitam seus extremos', () => {
  for (const input of [
    {speed: -1}, {speed: 13}, {speed: 2.5}, {speed: '4'},
    {sunPosition: 0.09}, {sunPosition: 0.91}, {sunPosition: Number.NaN},
    {neonGlow: -0.01}, {neonGlow: 1.01}, {neonGlow: Number.POSITIVE_INFINITY},
    {starCount: -1}, {starCount: 201}, {starCount: 1.5},
    {shootingStars: -1}, {shootingStars: 4}, {shootingStars: 0.5},
    {palmCount: -1}, {palmCount: 4}, {palmCount: 1.5},
    {shapeCount: -1}, {shapeCount: 5}, {shapeCount: 2.5},
    {centerShade: -0.01}, {centerShade: 1.01}, {centerShade: Number.NaN},
    {colors: ['#FF71CE']}, {colors: ['#FF71CE', 'não é cor']}, {backgroundColor: 'red'},
  ]) {
    assert.equal(vaporwaveLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {speed: 0, sunPosition: 0.1, neonGlow: 0, starCount: 0, shootingStars: 0, palmCount: 0, shapeCount: 0, centerShade: 0},
    {speed: 12, sunPosition: 0.9, neonGlow: 1, starCount: 200, shootingStars: 3, palmCount: 3, shapeCount: 4, centerShade: 1},
  ]) {
    assert.equal(vaporwaveLoopSchema.safeParse(input).success, true);
  }
});

test('Vaporwave: a cena mantém contagens e valores válidos durante o ciclo inclusive nos extremos', () => {
  for (const controls of [
    {speed: 0, sunPosition: 0.1, neonGlow: 0, starCount: 0, shootingStars: 0, palmCount: 0, shapeCount: 0, centerShade: 0},
    {speed: 4, sunPosition: 0.9, neonGlow: 0.7, starCount: 90, shootingStars: 1, palmCount: 2, shapeCount: 2, centerShade: 0.6},
    {speed: 12, sunPosition: 0.5, neonGlow: 1, starCount: 200, shootingStars: 3, palmCount: 3, shapeCount: 4, centerShade: 1},
  ]) {
    for (const transparent of [false, true]) {
      for (const frame of FRAMES) {
        const items = scene({...controls, transparent}, frame);
        const counts = Object.fromEntries(KINDS.map((kind) => [kind, pick(items, kind).length]));
        const sparkles = Math.min(SPARKLE_MAX, Math.floor(controls.starCount / 10));
        assert.deepEqual(counts, {
          star: controls.starCount, sparkle: sparkles, meteor: controls.shootingStars, sun: 1, sunCut: 8,
          ridge: 3, horizon: 1, row: ROW_COUNT, palm: controls.palmCount * 2, shape: controls.shapeCount,
        });
        for (const item of items) {
          for (const [key, value] of Object.entries(item)) {
            if (typeof value === 'number') assert.ok(Number.isFinite(value), `${item.kind}.${key}`);
          }
          assert.ok(item.opacity >= 0 && item.opacity <= 1, `${item.kind}: opacidade válida`);
          assert.ok(item.glow >= 0 && item.glow <= 1, `${item.kind}: brilho válido`);
          assert.ok(item.warmth >= 0 && item.warmth <= 1, `${item.kind}: calor válido`);
          assert.ok(item.size >= 0, `${item.kind}: tamanho válido`);
        }
        for (const row of pick(items, 'row')) assert.ok(row.size >= 2, 'nenhuma linha da grade vira fio de cabelo');
      }
    }
  }
});

test('Vaporwave: cada controle mexe só na própria camada', () => {
  const base = {seed: 2026};
  const layersOf = (items: VaporwaveElement[], kinds: readonly VaporwaveElement['kind'][]) =>
    kinds.map((kind) => pick(items, kind));
  const cases: {change: Record<string, unknown>; touches: VaporwaveElement['kind'][]}[] = [
    {change: {speed: 11}, touches: ['row']},
    {change: {starCount: 200}, touches: ['star', 'sparkle']},
    {change: {shootingStars: 3}, touches: ['meteor']},
    {change: {palmCount: 3}, touches: ['palm']},
    {change: {shapeCount: 4}, touches: ['shape']},
    // The sun sets the meteors' heading, the cuts follow the disc and nothing else moves.
    {change: {sunPosition: 0.3}, touches: ['sun', 'sunCut', 'meteor']},
    // Glow is drawn, not positioned; the plate only dims what sits behind the content.
    {change: {neonGlow: 0}, touches: []},
    {change: {centerShade: 1, sunPosition: 0.5}, touches: ['sun', 'sunCut', 'meteor']},
  ];
  for (const frame of [0, 173, 721]) {
    const reference = scene(base, frame);
    for (const {change, touches} of cases) {
      const changed = scene({...base, ...change}, frame);
      const untouched = KINDS.filter((kind) => !touches.includes(kind));
      assert.deepEqual(layersOf(changed, untouched), layersOf(reference, untouched), `${JSON.stringify(change)} mexeu em outra camada`);
    }
  }
});

test('Vaporwave: contagens preservam os elementos existentes e as outras camadas', () => {
  for (const frame of [0, 173, 959]) {
    const few = scene({starCount: 30, shootingStars: 1, palmCount: 1, shapeCount: 1}, frame);
    const many = scene({starCount: 200, shootingStars: 1, palmCount: 3, shapeCount: 4}, frame);
    assert.deepEqual(pick(many, 'star').slice(0, 30), pick(few, 'star'));
    assert.deepEqual(pick(many, 'sparkle').slice(0, 3), pick(few, 'sparkle'));
    assert.deepEqual(pick(many, 'shape').slice(0, 1), pick(few, 'shape'));
    // A count adds whole slots in PALM_ORDER: the palms already there stay exactly as they were.
    const manyPalms = pick(many, 'palm');
    for (const palm of pick(few, 'palm')) {
      assert.deepEqual(manyPalms.find((other) => other.variant === palm.variant), palm, `palmeira ${palm.variant} mudou`);
    }
    for (const kind of ['meteor', 'sun', 'sunCut', 'ridge', 'horizon', 'row'] as const) {
      assert.deepEqual(pick(many, kind), pick(few, kind), `${kind} mudou com as contagens`);
    }
  }
});

test('Vaporwave: palmCount soma primeiro a palmeira em V, depois a grande e por fim a do horizonte', () => {
  assert.deepEqual([...PALM_ORDER].sort(), [0, 1, 2], 'cada vaga entra uma vez');
  const slotsOf = (palmCount: number) => [...new Set(pick(scene({palmCount}, 0), 'palm')
    .map((palm) => Math.floor(palm.variant / 2)))].sort();
  assert.deepEqual(slotsOf(0), []);
  assert.deepEqual(slotsOf(1), [1], 'uma palmeira por lado: só a que se inclina para fora');
  assert.deepEqual(slotsOf(2), [0, 1], 'duas: soma a grande, perto da câmera');
  assert.deepEqual(slotsOf(3), [0, 1, 2], 'três: soma a pequena no horizonte');
  // The V partner leans out of the frame and its crown stays inside the outer 60 px on each side.
  for (const palm of pick(scene({palmCount: 1}, 0), 'palm')) {
    const {crown} = getPalmShape(palm);
    assert.ok(Math.min(crown[0], WIDTH - crown[0]) < 60 && Math.abs(palm.x - crown[0]) > 60, `coroa em ${crown[0]}`);
  }
});

test('Vaporwave: a grade avança um número inteiro de linhas por ciclo, sempre na mesma velocidade', () => {
  const depthOf = (y: number) => (HEIGHT - HORIZON_Y) / (y - HORIZON_Y);
  for (const speed of [0, 1, 4, 12]) {
    const props = {speed};
    let wraps = 0;
    const steps: number[] = [];
    for (let frame = 0; frame < LENGTH; frame++) {
      const now = depthOf(pick(scene(props, frame), 'row')[0]!.y);
      const next = depthOf(pick(scene(props, frame + 1), 'row')[0]!.y);
      // A wrap re-lists the rows: the nearest place is taken by the row that was behind it.
      if (next > now + ROW_STEP / 2) {
        wraps++;
        steps.push(next - now - ROW_STEP);
      } else {
        steps.push(next - now);
      }
    }
    assert.equal(wraps, speed, `${speed}: linhas por ciclo`);
    const expected = -speed * ROW_STEP / LENGTH;
    for (const step of steps) assert.ok(Math.abs(step - expected) < 1e-9, `${speed}: passo ${step} contra ${expected}`);
  }
});

test('Vaporwave: linhas e cortes do sol nascem e morrem invisíveis, e cada lugar entrega a mesma forma', () => {
  for (const transparent of [false, true]) {
    const far = getRowField(ROW_FAR, transparent);
    assert.equal(far.opacity, 0, 'uma linha nasce transparente');
    const slope = (getRowField(ROW_FAR - 1e-6, transparent).opacity - far.opacity) / 1e-6;
    assert.ok(Math.abs(slope) < 1e-6, 'e sem velocidade de opacidade');
    const near = getRowField(ROW_NEAR, transparent);
    assert.ok(near.y - Math.max(near.size / 2, near.length) > HEIGHT, `uma linha morre abaixo do quadro (${near.y})`);
  }
  assert.equal(getSunCutField(SUN_CUT_START), 0, 'um corte nasce sem altura');
  assert.ok(getSunCutField(SUN_CUT_START + 1e-6) < 1e-9, 'e sem velocidade');
  for (const sunPosition of [0.1, 0.35, 0.5, 0.9]) {
    const sunY = getSunY(sunPosition);
    const span = 2 * SUN_RADIUS * getSunCutScale(sunY);
    const bottom = sunY - SUN_RADIUS + (SUN_CUT_END - getSunCutField(SUN_CUT_END) / 2) * span;
    assert.ok(bottom > HORIZON_Y, `${sunPosition}: um corte morre abaixo do horizonte, onde o sol já foi cortado`);
  }

  // Every hand-over in the middle of the cycle: the visible lines match one to one.
  const visible = (items: VaporwaveElement[], kind: 'row' | 'sunCut') => pick(items, kind).filter((line) =>
    kind === 'row' ? line.opacity > 1e-9 && line.y - Math.max(line.size / 2, line.length) < HEIGHT
      : line.size > 1e-9 && line.y - line.size / 2 < HORIZON_Y).sort((a, b) => a.y - b.y);
  for (const props of [{}, {speed: 1}, {speed: 12, transparent: true}]) {
    for (const kind of ['row', 'sunCut'] as const) {
      let handovers = 0;
      for (let frame = 0; frame < LENGTH; frame++) {
        const a = pick(scene(props, frame), kind)[0]!;
        const b = pick(scene(props, frame + 1), kind)[0]!;
        // Rows move down the frame and cuts down the disc; a hand-over re-lists them upwards.
        if (b.y >= a.y) continue;
        let low = frame;
        let high = frame + 1;
        for (let step = 0; step < 50; step++) {
          const middle = (low + high) / 2;
          if (pick(scene(props, middle), kind)[0]!.y < pick(scene(props, low), kind)[0]!.y) high = middle;
          else low = middle;
        }
        const left = visible(scene(props, low - 1e-4), kind);
        const right = visible(scene(props, high + 1e-4), kind);
        assert.equal(left.length, right.length, `${kind}: linhas visíveis na troca`);
        left.forEach((line, index) => {
          for (const key of ['y', 'size', 'length', 'opacity'] as const) {
            assert.ok(Math.abs(line[key] - right[index]![key]) <= 5e-3 * Math.max(1, Math.abs(line[key])),
              `${JSON.stringify(props)} ${kind} ${index}.${key}: ${line[key]} contra ${right[index]![key]}`);
          }
        });
        handovers++;
      }
      assert.ok(handovers > 0, `${kind}: nenhuma troca encontrada`);
    }
  }
});

test('Vaporwave: os sólidos giram voltas inteiras por ciclo, sem saltos', () => {
  const props = {shapeCount: 4, seed: 7};
  const angleOf = (shape: VaporwaveElement) => Math.atan2(shape.spinSin, shape.spinCos);
  const start = pick(scene(props, 0), 'shape');
  const turned = start.map(() => 0);
  let previous = start;
  for (let frame = 1; frame <= LENGTH; frame++) {
    const current = pick(scene(props, frame), 'shape');
    current.forEach((shape, index) => {
      assert.ok(Math.abs(Math.hypot(shape.spinCos, shape.spinSin) - 1) < 1e-12, 'direção unitária');
      let delta = angleOf(shape) - angleOf(previous[index]!);
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      assert.ok(Math.abs(delta) < 0.05, `sólido ${index}: salto de ${delta} rad`);
      turned[index]! += delta;
    });
    previous = current;
  }
  for (const total of turned) assert.ok(Math.abs(Math.abs(total) - SHAPE_TURNS * TAU) < 1e-6, `volta inteira: ${total}`);
  assert.deepEqual(pick(scene(props, LENGTH), 'shape'), start);
});

test('Vaporwave: estrelas cadentes ficam na faixa de cima, voam para o lado oposto ao do sol e somem na emenda', () => {
  // README: they always fly towards the side away from the sun; with the sun near an edge they
  // move away from the disc the whole way, and with it near the middle they pass high above it.
  for (const sunPosition of [0.1, 0.2, 0.3, 0.45, 0.5, 0.55, 0.7, 0.8, 0.9]) {
    const sunX = getSunX(sunPosition);
    for (const length of [185, 960]) {
      const props = {shootingStars: 3, sunPosition, durationSeconds: length / 60, starCount: 0, palmCount: 0, shapeCount: 0};
      for (const meteor of pick(scene(props, 0, length), 'meteor')) assert.equal(meteor.opacity, 0, 'nenhuma estrela cadente na emenda');
      let seen = 0;
      let previous = pick(scene(props, 0, length), 'meteor');
      for (let frame = 0; frame < length; frame++) {
        const meteors = pick(scene(props, frame, length), 'meteor');
        meteors.forEach((meteor, index) => {
          if (meteor.opacity === 0) return;
          seen++;
          assert.ok(meteor.y + meteor.size * METEOR_HALO < CONTENT_BOX.top, `cabeça em y ${meteor.y}`);
          assert.ok(meteor.y + meteor.size * METEOR_HALO < getSunY(sunPosition) - SUN_RADIUS - 150, 'bem acima do sol');
          assert.equal(Math.sign(Math.cos((meteor.angle * Math.PI) / 180)), sunPosition > 0.5 ? -1 : 1,
            `${sunPosition}: rumo ao lado oposto ao do sol`);
          const before = previous[index]!;
          if (Math.abs(sunPosition - 0.5) >= 0.3 && before.opacity > 0) {
            assert.ok(Math.abs(meteor.x - sunX) >= Math.abs(before.x - sunX), `${sunPosition}: voltou em direção ao sol`);
          }
        });
        previous = meteors;
      }
      assert.ok(seen > 0, 'as estrelas cadentes precisam aparecer');
    }
  }
});

test('Vaporwave: palmeiras, sólidos, cintilos e estrelas cadentes nunca entram na área de conteúdo', () => {
  // Palms, solids and sparkles ignore the sun, so each seed is sampled once; sway and bob are
  // harmonics 1 and 2 of the cycle, well covered every 8 frames (the budget test below proves
  // every phase). Meteors follow the sun, so they are scanned for each position.
  for (const seed of [-7, 1, 88, 2026, 31337]) {
    const props = {seed, palmCount: 3, shapeCount: 4, starCount: 200, shootingStars: 0};
    for (let frame = 0; frame < LENGTH; frame += 8) {
      for (const item of scene(props, frame)) {
        if (item.kind === 'palm') {
          // The drawn outline at this very sway, plus the rim light.
          for (const points of getPalmPoints(getPalmShape(item))) {
            assert.ok(!polygonEntersBox(points, PALM_PAINT_MARGIN),
              `palmeira ${item.variant} (seed ${seed}, frame ${frame}) invadiu a área de conteúdo`);
          }
        } else if (item.kind === 'shape') {
          for (const face of getSolidFaces(item)) {
            assert.ok(!polygonEntersBox(face.points, SOLID_EDGE / 2), `sólido (seed ${seed}, frame ${frame}) invadiu`);
          }
          assert.ok(!discEntersBox(item.x, item.y, item.size * SOLID_GLOW), `brilho do sólido (seed ${seed}) invadiu`);
        } else if (item.kind === 'sparkle') {
          assert.ok(!discEntersBox(item.x, item.y, item.size * SPARKLE_GLOW), `cintilo (seed ${seed}) invadiu`);
        }
      }
    }
    for (const sunPosition of [0.1, 0.5, 0.9]) {
      const meteors = {seed, sunPosition, palmCount: 0, shapeCount: 0, starCount: 0, shootingStars: 3};
      for (let frame = 0; frame < LENGTH; frame += 2) {
        for (const item of pick(scene(meteors, frame), 'meteor')) {
          if (item.opacity > 0) {
            assert.ok(!discEntersBox(item.x, item.y, item.size * METEOR_HALO), `estrela cadente (seed ${seed}) invadiu`);
          }
        }
      }
    }
  }
});

test('Vaporwave: o orçamento de alcance garante a área de conteúdo livre em qualquer seed e fase', () => {
  // Palms: every seeded nudge at its extreme, and the sway pushed to its full reach in every
  // direction. Each frond's sway is a linear mix of `angle` and `tilt`, so the circle of radius
  // first + second holds the extreme of every frond.
  const reach = PALM_SWAY.first + PALM_SWAY.second;
  for (const [slotIndex, slot] of PALM_SLOTS.entries()) {
    for (const side of [0, 1]) {
      for (const edge of [slot.edge - PALM_JITTER.edge, slot.edge + PALM_JITTER.edge]) {
        for (const height of [1 - PALM_JITTER.height, 1 + PALM_JITTER.height]) {
          for (const lean of [slot.lean - PALM_JITTER.lean, slot.lean + PALM_JITTER.lean]) {
            for (let step = 0; step < 72; step++) {
              const direction = (step / 72) * TAU;
              const palm: VaporwaveElement = {
                kind: 'palm', x: palmBaseX(side, edge), y: slot.base, size: slot.height * height,
                length: slot.frond * (1 + PALM_JITTER.frond), lean, angle: reach * Math.cos(direction),
                tilt: reach * Math.sin(direction), spinCos: 1, spinSin: 0, opacity: 1, glow: 1, warmth: 1,
                variant: slotIndex * 2 + side,
              };
              for (const points of getPalmPoints(getPalmShape(palm))) {
                assert.ok(!polygonEntersBox(points, PALM_PAINT_MARGIN), `palmeira ${slotIndex}/${side} no pior caso`);
              }
            }
          }
        }
      }
    }
  }
  // Solids: the farthest vertex (or the glow, whichever reaches further) of the largest solid,
  // at the extreme nudge and bob, stays above the area (first two) or below it (last two).
  const solidReach = SHAPE_SIZE.max * Math.max(SOLID_GLOW, SOLID_REACH) + SOLID_EDGE / 2;
  for (const [index, slot] of SHAPE_SLOTS.entries()) {
    const low = slot.y - SHAPE_JITTER.y - SHAPE_BOB.y - solidReach;
    const high = slot.y + SHAPE_JITTER.y + SHAPE_BOB.y + solidReach;
    if (index < 2) assert.ok(high < CONTENT_BOX.top && low > 0, `sólido ${index}: ${low}–${high}`);
    else assert.ok(low > CONTENT_BOX.bottom && high < HEIGHT, `sólido ${index}: ${low}–${high}`);
  }
});

/** Distance from a point to a closed outline, 0 when the point is inside it (nonzero rule). */
const distanceToOutline = ([x, y]: Point, points: readonly Point[]) => {
  let winding = 0;
  let nearest = Infinity;
  points.forEach(([x0, y0], index) => {
    const [x1, y1] = points[(index + 1) % points.length]!;
    const cross = (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0);
    if (y0 <= y && y1 > y && cross > 0) winding++;
    if (y0 > y && y1 <= y && cross < 0) winding--;
    const [dx, dy] = [x1 - x0, y1 - y0];
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
    nearest = Math.min(nearest, Math.hypot(x - x0 - t * dx, y - y0 - t * dy));
  });
  return winding === 0 ? nearest : 0;
};
const boundsOf = (points: readonly Point[]) => ({
  left: Math.min(...points.map(([x]) => x)), right: Math.max(...points.map(([x]) => x)),
  top: Math.min(...points.map(([, y]) => y)), bottom: Math.max(...points.map(([, y]) => y)),
});

test('Vaporwave: os cintilos ficam no céu aberto, nunca atrás do sol, das montanhas ou das palmeiras', () => {
  // Every sparkle the count promises is seen: its glow stays clear of every sun disc, every
  // mountain and every palm (three per side, at every sampled phase of the sway).
  const sunTop = Math.min(...[0.1, 0.3, 0.5, 0.7, 0.9].map((sunPosition) => getSunY(sunPosition) - SUN_RADIUS));
  assert.ok(SPARKLE_SKY.bottom <= sunTop && SPARKLE_SKY.bottom <= CONTENT_BOX.top, 'o céu dos cintilos acaba acima do sol e da área de conteúdo');
  let checked = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const peak = Math.min(...[0.1, 0.5, 0.9].flatMap((sunPosition) =>
      getMountainRidges({seed, sunPosition}).ranges.flatMap((range) => range.ridge.map(([, y]) => y))));
    for (let frame = 0; frame < LENGTH; frame += 40) {
      const items = scene({seed, starCount: 200, palmCount: 3}, frame);
      const outlines = pick(items, 'palm').flatMap((palm) => getPalmPoints(getPalmShape(palm)))
        .map((points) => ({points, bounds: boundsOf(points)}));
      const sparkles = pick(items, 'sparkle');
      assert.equal(sparkles.length, SPARKLE_MAX);
      for (const sparkle of sparkles) {
        const reach = sparkle.size * SPARKLE_GLOW;
        assert.ok(sparkle.y + reach < Math.min(sunTop, peak), `cintilo (seed ${seed}) atrás do sol ou das montanhas`);
        for (const {points, bounds} of outlines) {
          const margin = reach + PALM_PAINT_MARGIN;
          if (sparkle.x < bounds.left - margin || sparkle.x > bounds.right + margin ||
            sparkle.y < bounds.top - margin || sparkle.y > bounds.bottom + margin) continue;
          assert.ok(distanceToOutline([sparkle.x, sparkle.y], points) > margin,
            `cintilo em (${sparkle.x.toFixed(0)}, ${sparkle.y.toFixed(0)}) encosta numa palmeira (seed ${seed}, frame ${frame})`);
        }
        checked++;
      }
    }
  }
  assert.ok(checked > 2000, `poucos cintilos conferidos: ${checked}`);
});

test('Vaporwave: nenhum pico aparece atrás da copa das palmeiras do horizonte', () => {
  // A peak right behind the crown of a small horizon palm reads as if the palm stood on it. The
  // ranges keep their peaks away from those crowns for every seed and sun position, whatever
  // palmCount is, since the mountains depend only on the seed and the sun.
  const {edge, lean, height} = PALM_SLOTS[2];
  assert.deepEqual(CROWN_COLUMNS, [edge + lean * height, WIDTH - edge - lean * height]);
  let crowns = 0;
  for (const sunPosition of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    for (let seed = 1; seed <= 40; seed++) {
      const apexes = getMountainRidges({seed, sunPosition}).ranges.flatMap((range) => range.apexes)
        .filter(([, y]) => HORIZON_Y - y > 20);
      for (const frame of [0, 240, 480, 720]) {
        for (const palm of pick(scene({seed, sunPosition, palmCount: 3}, frame), 'palm')) {
          if (Math.floor(palm.variant / 2) !== 2) continue;
          const shape = getPalmShape(palm);
          const crown = boundsOf([...shape.back, ...shape.front, shape.knot].flat());
          for (const [x, y] of apexes) {
            assert.ok(x < crown.left - 10 || x > crown.right + 10 || y < crown.top - 10 || y > crown.bottom + 10,
              `seed ${seed}, sol ${sunPosition}: pico em (${x.toFixed(0)}, ${y.toFixed(0)}) atrás da copa`);
          }
          crowns++;
        }
      }
    }
  }
  assert.equal(crowns, 5 * 40 * 4 * 2);
  assert.ok(CROWN_CLEARANCE >= 100, 'folga mínima entre picos e copas');
});

test('Vaporwave: o sol padrão fica fora da área de conteúdo e o clássico se põe no centro', () => {
  const [sun] = pick(scene({}, 0), 'sun');
  // README: at 0.9 the disc spans x 1580–1980, 70 px clear of the content area, 60 px cropped.
  assert.deepEqual([sun!.x - sun!.size, sun!.x + sun!.size], [1580, 1980]);
  assert.equal(sun!.x - sun!.size - CONTENT_BOX.right, 70);
  assert.equal(getSunX(0.1) + SUN_RADIUS, CONTENT_BOX.left - 70);
  assert.equal(getSunX(0.1) - SUN_RADIUS, -60, 'na borda esquerda o corte também é deliberado');
  assert.equal(sun!.y, 598);
  assert.equal(sun!.opacity, 1, 'fora da placa o sol não escurece');
  assert.equal(sun!.warmth, 1);
  const classic = vaporwaveLoopSchema.strict().parse(readPreset('vaporwave-classico.json'));
  for (const frame of [0, 320, 640]) {
    const items = getVaporwaveScene(classic, frame, LENGTH);
    const [centred] = pick(items, 'sun');
    // Centred, the sun sinks until it sits half set on the horizon: only its top reaches the
    // bottom rows of the title band, and it stays a vivid pale-yellow-to-pink postcard sun.
    assert.deepEqual([centred!.x, centred!.y], [960, HORIZON_Y]);
    assert.ok(centred!.y - centred!.size > TITLE_BAND.bottom - 20, `o topo do sol em ${centred!.y - centred!.size}`);
    assert.ok(centred!.opacity >= 0.9 && centred!.warmth >= 0.8, 'o sol do cartão-postal não vira um disco apagado');
    const cuts = pick(items, 'sunCut').filter((cut) => cut.size > 1 && cut.y - cut.size / 2 < HORIZON_Y);
    assert.ok(cuts.length >= 4, `só ${cuts.length} cortes acima do horizonte`);
  }
  // The sun only sinks near the middle, gradually: at the edges it stays high.
  assert.equal(getSunY(0.2), 598);
  assert.equal(getSunY(0.8), 598);
  assert.equal(getSunY(0.4), HORIZON_Y);
  assert.ok(getSunY(0.28) > 598 && getSunY(0.28) < HORIZON_Y, 'entre 0,2 e 0,35 o sol desce aos poucos');
});

test('Vaporwave: os cortes mostram o céu através do sol e o halo para no horizonte', () => {
  for (const input of [{}, {transparent: true}, readPreset('vaporwave-classico.json') as Record<string, unknown>]) {
    const props = vaporwaveLoopSchema.parse(input);
    const transparent = hasTransparentBackground(props);
    const bloomRadius = SUN_RADIUS * (transparent ? 2.1 : 2.6);
    const bloomId = transparent ? 'vw-sun-bloom-alpha' : 'vw-sun-bloom';
    const discs = new Set<string>();
    for (const frame of [0, 97, 321]) {
      const markup = markupOf(input, frame);
      // The bloom is the part of its circle above the horizon: under it the floor only takes
      // the flat reflection, not a ghost of the sun's lower half.
      const bloom = new RegExp(`<path d="M([\\d.-]+) ([\\d.]+)A([\\d.]+) [\\d.]+ 0 [01] 1 ([\\d.-]+) ([\\d.]+)Z" fill="url\\(#${bloomId}\\)"`).exec(markup);
      assert.ok(bloom, 'o halo do sol precisa ser cortado no horizonte');
      assert.deepEqual([Number(bloom[2]), Number(bloom[3]), Number(bloom[5])], [HORIZON_Y, bloomRadius, HORIZON_Y]);
      assert.ok(markup.includes('fill="url(#vw-sun-reflect)"') && !/<ellipse[^>]*url\(#vw-sun-bloom/.test(markup), 'o reflexo tem o próprio degradê');
      // Inside the disc the bloom is faint, so a cut shows the night through the sun; just past
      // the rim it is as bright as ever.
      const stops = gradientStops(markup, bloomId);
      assert.ok(opacityAt(stops, (0.75 * SUN_RADIUS) / bloomRadius) <= 0.15, 'halo dentro do disco');
      assert.ok(opacityAt(stops, (1.02 * SUN_RADIUS) / bloomRadius) >= 0.5, 'halo em volta do disco');
      // The disc stays put and the cuts move over it as rectangles in a mask, whose edges are
      // antialiased continuously: no clip path steps them in quarter pixels.
      discs.add(/<g mask="url\(#vw-sun-cuts\)"><path d="([^"]+)"/.exec(markup)![1]!);
      const rects = [.../<mask id="vw-sun-cuts"[^>]*>([\s\S]*?)<\/mask>/.exec(markup)![1]!
        .matchAll(/<rect [^>]*y="([\d.]+)" [^>]*height="([\d.]+)" fill="#000000"/g)].map((match) => [Number(match[1]), Number(match[2])]);
      const cuts = pick(getVaporwaveScene(props, frame, LENGTH), 'sunCut').filter((cut) => cut.size > 0);
      assert.equal(rects.length, cuts.length);
      cuts.forEach((cut, index) => {
        assert.ok(Math.abs(rects[index]![0]! - (cut.y - cut.size / 2)) < 0.006 && Math.abs(rects[index]![1]! - cut.size) < 0.006,
          `corte ${index}: o retângulo precisa seguir o corte sem arredondar (${rects[index]!.join(', ')})`);
      });
      assert.ok(!/clip-path="url\(#vw-sun/.test(markup), 'nenhum clip path recorta o sol em quartos de pixel');
    }
    assert.equal(discs.size, 1, 'o disco do sol não se move');
  }
});

test('Vaporwave: MP4 e GIF com transparent: true desenham a mesma cena opaca', () => {
  // The alpha rule: only WebM keeps transparency, so an MP4 or GIF export of the alpha preset
  // draws exactly the opaque scene over backgroundColor.
  for (const outputFormat of ['mp4', 'gif'] as const) {
    for (const frame of [0, 321]) {
      assert.equal(markupOf({transparent: true, outputFormat}, frame), markupOf({transparent: false, outputFormat}, frame), outputFormat);
      assert.deepEqual(scene({transparent: true, outputFormat}, frame), scene({transparent: false, outputFormat}, frame), outputFormat);
    }
  }
  assert.notEqual(markupOf({transparent: true}), markupOf({}), 'o WebM transparente precisa mudar o desenho');
});

test('Vaporwave: a placa escurece o centro no opaco e limpa sol e estrelas no WebM transparente', () => {
  assert.equal(getPlateWeight(960, 540), 1);
  assert.equal(getPlateWeight(40, 540), 0);
  assert.equal(getPlateWeight(960, 1040), 0);
  // A 16:9 plate matched to the content area: full over the title band, and still more than
  // half strength at the corners of the area, so a webcam's corners are never left uncovered.
  const {inner, outer} = PLATE;
  assert.ok(Math.abs((inner.right - inner.left) / (inner.bottom - inner.top) - 16 / 9) < 0.01, 'a placa cheia é 16:9');
  assert.deepEqual([(inner.left + inner.right) / 2, (inner.top + inner.bottom) / 2], [960, 540]);
  assert.deepEqual([(outer.left + outer.right) / 2, (outer.top + outer.bottom) / 2], [960, 540]);
  for (const x of [TITLE_BAND.left, TITLE_BAND.right]) {
    for (const y of [TITLE_BAND.top, TITLE_BAND.bottom]) assert.equal(getPlateWeight(x, y), 1);
  }
  for (const x of [CONTENT_BOX.left, CONTENT_BOX.right]) {
    for (const y of [CONTENT_BOX.top, CONTENT_BOX.bottom]) assert.ok(getPlateWeight(x, y) >= 0.5, `quina (${x}, ${y})`);
  }
  // The default sun, at either edge, stays outside the plate.
  assert.equal(getPlateWeight(getSunX(0.9), getSunY(0.9)), 0);
  assert.equal(getPlateWeight(getSunX(0.1), getSunY(0.1)), 0);
  const opaque = (centerShade: number) => pick(scene({centerShade, starCount: 200}, 120), 'star');
  assert.deepEqual(opaque(0), opaque(1), 'no opaco quem escurece é a placa desenhada, não as estrelas');
  const alpha = (centerShade: number) => scene({centerShade, starCount: 200, transparent: true, sunPosition: 0.5}, 120);
  const clear = alpha(0);
  const cleared = alpha(1);
  pick(clear, 'star').forEach((star, index) => {
    const other = pick(cleared, 'star')[index]!;
    assert.equal(other.x, star.x);
    const weight = getPlateWeight(star.x, star.y);
    if (weight === 0) assert.equal(other.opacity, star.opacity);
    if (weight > 0.5) assert.ok(other.opacity < star.opacity * 0.6, 'estrela atrás do conteúdo continua acesa');
  });
  assert.ok(pick(cleared, 'sun')[0]!.opacity < 0.4 && pick(clear, 'sun')[0]!.opacity === 1);
  // Sparkles too: the same share of the plate clears them.
  let sparklesBehind = 0;
  for (const seed of [1, 7, 88, 2026]) {
    const sparkles = (centerShade: number) =>
      pick(scene({seed, centerShade, starCount: 200, transparent: true}, 120), 'sparkle');
    const lit = sparkles(0);
    sparkles(1).forEach((sparkle, index) => {
      const weight = getPlateWeight(sparkle.x, sparkle.y);
      if (weight > 0.2) sparklesBehind++;
      assert.ok(Math.abs(sparkle.opacity - lit[index]!.opacity * (1 - 0.85 * weight)) < 1e-12, 'a placa apaga o cintilo');
    });
  }
  assert.ok(sparklesBehind > 0, 'nenhum cintilo atrás da placa para conferir');
  // Over gameplay the far grid dissolves sooner than over the opaque night.
  assert.ok(getRowField(2.5, true).opacity < getRowField(2.5, false).opacity * 0.6, 'a grade some antes sobre o jogo');
});

test('Vaporwave: no WebM transparente a placa apaga as colinas distantes e o meio da linha do horizonte', () => {
  const at = (input: Record<string, unknown>, id: string, offset: number) => opacityAt(gradientStops(markupOf(input), id), offset);
  const alpha = (centerShade: number) => ({transparent: true, centerShade});
  assert.equal(at(alpha(0), 'vw-far-clear', 0.5), 1);
  assert.ok(at(alpha(1), 'vw-far-clear', 0.5) < 0.3, 'colinas distantes atrás do conteúdo');
  // The line keeps its ends and fades behind the content: at most 0.1 across x 800–1120.
  for (const x of [800, 900, 960, 1040, 1120]) {
    assert.ok(at(alpha(1), 'vw-horizon-line', x / WIDTH) <= 0.1, `linha do horizonte em x ${x}`);
    assert.ok(at(alpha(0), 'vw-horizon-line', x / WIDTH) > 0.3);
  }
  for (const offset of [0, 1]) assert.equal(at(alpha(1), 'vw-horizon-line', offset), 1, 'as pontas da linha continuam acesas');
  // In the opaque render the plate darkens instead: the line itself stays the same.
  assert.equal(at({centerShade: 0}, 'vw-horizon-line', 0.5), 0.36);
  assert.equal(at({centerShade: 1}, 'vw-horizon-line', 0.5), 0.36);
});

test('Vaporwave: sobre o jogo, a borda de baixo fica livre para o HUD', () => {
  // The nearest rows keep at most ALPHA_ROW_BOTTOM.floor of their opacity below y 976, and the
  // opaque floor is untouched.
  const {from, to, floor} = ALPHA_ROW_BOTTOM;
  assert.equal(Math.round(groundY(from)), 976);
  assert.equal(groundY(to), 912);
  for (let depth = ROW_NEAR; depth <= from; depth += 0.01) {
    assert.ok(getRowField(depth, true).opacity <= floor + 1e-12, `linha em y ${groundY(depth).toFixed(0)}`);
    assert.equal(getRowField(depth, false).opacity, 1);
  }
  // Columns: the bottom stops of the alpha fade stay below half.
  const columns = gradientStops(markupOf({transparent: true}), 'vw-column-fade');
  assert.ok(columns.every((stop) => stop.opacity < 0.5), 'colunas fracas sobre o HUD');
  assert.ok(gradientStops(markupOf({}), 'vw-column-fade').at(-1)!.opacity > 0.8, 'o chão opaco continua aceso');
  // Palm trunks dissolve before the HUD band (y 960 and below); the opaque ones stay solid ink.
  assert.ok(PALM_ALPHA_FADE.to < 960 && PALM_ALPHA_FADE.from < PALM_ALPHA_FADE.to, 'os troncos somem antes da faixa do HUD');
  const alpha = markupOf({transparent: true, palmCount: 3});
  for (const paint of ['ink', 'rim', 'ring']) {
    const stops = gradientStops(alpha, `vw-trunk-${paint}`);
    assert.deepEqual(stops.map((stop) => stop.opacity), [1, 0], paint);
    assert.equal(alpha.split(`url(#vw-trunk-${paint})`).length - 1, 6, `${paint}: um tronco por palmeira`);
  }
  assert.ok(new RegExp(`id="vw-trunk-ink" x1="0" y1="${PALM_ALPHA_FADE.from}" x2="0" y2="${PALM_ALPHA_FADE.to}"`).test(alpha), 'o degradê do tronco segue PALM_ALPHA_FADE');
  assert.ok(!markupOf({palmCount: 3}).includes('vw-trunk-'), 'no opaco o tronco não se desfaz');
});

test('Vaporwave: as montanhas são estáticas, determinísticas por seed e seguem curvas de nível', () => {
  const first = getMountainRidges({seed: 88, sunPosition: 0.9});
  getMountainRidges({seed: 3, sunPosition: 0.2});
  assert.deepEqual(getMountainRidges({seed: 88, sunPosition: 0.9}), first);
  assert.notDeepEqual(getMountainRidges({seed: 89, sunPosition: 0.9}), first);
  assert.equal(first.ranges.length, 4);
  for (const range of first.ranges) {
    // Ridge, two contour rows and the foot, all with one vertex per skyline vertex.
    assert.equal(range.rows.length, 4);
    for (const row of range.rows) assert.equal(row.length, range.ridge.length);
    for (let index = 0; index < range.ridge.length; index++) {
      const heights = range.rows.map((row) => HORIZON_Y - row[index]![1]);
      assert.ok(heights.every((height, level) => level === 0 || height <= heights[level - 1]! + 1e-9), 'curvas de nível descem até o pé');
      assert.equal(heights[3], 0);
    }
    assert.ok(range.facets.length > range.ridge.length, 'a malha precisa de faces');
    for (const facet of range.facets) {
      assert.ok(facet.light >= 0 && facet.light <= 1, `luz da face: ${facet.light}`);
      for (const [x, y] of facet.points) assert.ok(Number.isFinite(x) && y <= HORIZON_Y + 1e-9, `face abaixo do horizonte em (${x}, ${y})`);
    }
    const xs = range.ridge.map(([x]) => x);
    assert.deepEqual(xs, [...xs].sort((a, b) => a - b), 'a crista vai da esquerda para a direita');
  }
  // The ranges open a valley under the sun, wherever it sets.
  const peakNear = (sunPosition: number) => Math.max(...getMountainRidges({seed: 88, sunPosition}).ranges
    .flatMap((range) => range.ridge).filter(([x]) => Math.abs(x - getSunX(sunPosition)) < 60).map(([, y]) => HORIZON_Y - y));
  assert.ok(peakNear(0.2) < 120 && peakNear(0.8) < 120, 'um vale se abre embaixo do sol');
});

test('Vaporwave: nenhum pico encosta na borda do sol', () => {
  // A tip that grazes the disc reads as a tangent, as if the sun grew out of the peak: every
  // visible peak is either clearly outside the disc or clearly overlapping it.
  let checked = 0;
  for (const sunPosition of [0.1, 0.5, 0.9]) {
    for (let seed = 1; seed <= 40; seed++) {
      for (const range of getMountainRidges({seed, sunPosition}).ranges) {
        for (const [x, y] of range.apexes) {
          assert.ok(range.ridge.some(([rx, ry]) => rx === x && ry === y), 'a ponta está na crista');
          if (HORIZON_Y - y <= 40) continue;
          const gap = Math.hypot(x - getSunX(sunPosition), y - getSunY(sunPosition)) - SUN_RADIUS;
          assert.ok(Math.abs(gap) >= 30, `seed ${seed}, sol ${sunPosition}: ponta a ${gap.toFixed(1)} px da borda`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 400, `poucos picos conferidos: ${checked}`);
  assert.ok(APEX_CLEARANCE >= 30, 'folga mínima entre picos e a borda do sol');
});

test('Vaporwave: no WebM transparente as montanhas ficam translúcidas sem raio X', () => {
  // The sky layers are clipped out of every mountain: the outline sits on or above each ridge.
  for (const sunPosition of [0.1, 0.5, 0.9]) {
    const mountains = getMountainRidges({seed: 88, sunPosition});
    const outline = getMountainOutline(mountains);
    // The highest point of the outline over x (it can rise straight up at a range's end).
    const outlineAt = (x: number) => Math.min(...outline.slice(1).flatMap(([x1, y1], index) => {
      const [x0, y0] = outline[index]!;
      if (x < x0 || x > x1) return [];
      return [x1 === x0 ? Math.min(y0, y1) : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)];
    }));
    for (const line of [...mountains.ranges.map((range) => range.ridge), mountains.far]) {
      for (const [x, y] of line) assert.ok(outlineAt(x) <= y + 1e-6, `contorno abaixo da crista em x ${x}`);
    }
  }
  // Over gameplay the ranges are opaque inside one translucent group: the bodies never stack.
  assert.ok(ALPHA_MOUNTAIN_OPACITY <= 0.5, 'o jogo aparece através das montanhas');
  const alpha = markupOf({transparent: true});
  const opaque = markupOf({});
  assert.equal(alpha.split(`<g opacity="${ALPHA_MOUNTAIN_OPACITY}">`).length - 1, 1);
  assert.ok(!alpha.includes('fill="#120C2E" fill-opacity'), 'nenhum corpo de montanha soma transparência própria');
  for (const markup of [alpha, opaque]) {
    const sky = markup.indexOf('clip-path="url(#vw-sky-clip)"');
    assert.ok(sky > 0 && sky < markup.indexOf('mask="url(#vw-sun-cuts)"'), 'o sol fica recortado atrás das montanhas');
  }
  // The sky, the ground, the plate and the uniform haze and horizon bands stay out of the alpha.
  for (const paint of ['url(#vw-sky)', 'url(#vw-ground)', 'url(#vw-haze-band)', 'url(#vw-horizon-band)', 'url(#vw-plate-']) {
    assert.ok(!alpha.includes(paint), `${paint} no WebM transparente`);
    assert.ok(opaque.includes(paint), `${paint} some do opaco`);
  }
});

test('Vaporwave: cada camada continua se movendo', () => {
  const props = {palmCount: 3, shapeCount: 4, starCount: 200};
  const start = scene(props, 0);
  const moved = (now: VaporwaveElement[], kind: VaporwaveElement['kind'], key: keyof VaporwaveElement) =>
    pick(now, kind).every((item, index) => Math.abs((item[key] as number) - (pick(start, kind)[index]![key] as number)) > 1e-6);
  for (const frame of [173, 481, 719]) {
    const now = scene(props, frame);
    for (const [kind, key] of [
      ['palm', 'angle'], ['palm', 'tilt'], ['star', 'opacity'], ['sparkle', 'opacity'], ['sparkle', 'size'],
      ['shape', 'spinCos'], ['shape', 'x'], ['shape', 'y'], ['horizon', 'glow'], ['ridge', 'glow'], ['sun', 'glow'],
      ['row', 'y'], ['sunCut', 'y'],
    ] as const) {
      assert.ok(pick(now, kind).length > 0 && moved(now, kind, key), `${kind}.${key} congelou no frame ${frame}`);
    }
  }
});

test('Vaporwave: o desenho responde a neonGlow e centerShade', () => {
  // The glow is drawn, not positioned: the same frame changes only in the paint.
  const dull = markupOf({neonGlow: 0});
  const bright = markupOf({neonGlow: 1});
  assert.notEqual(dull, bright);
  const bloom = (markup: string) => Number(/url\(#vw-sun-bloom\)" opacity="([\d.]+)"/.exec(markup)![1]);
  assert.ok(bloom(bright) > bloom(dull) * 1.5, 'o halo do sol acompanha o neon');
  // The grid's glow follows the neon too.
  const rowGlow = (markup: string) => Number(/url\(#vw-row-glow\)" opacity="([\d.]+)"/.exec(markup)![1]);
  assert.ok(rowGlow(bright) > rowGlow(dull) * 2, 'o brilho da grade acompanha o neon');
  // centerShade: no plate at 0; at 1 the plate's eight soft pieces are drawn above and below
  // the horizon in the opaque render, and none in the transparent one.
  const plates = (input: Record<string, unknown>) => markupOf(input).split('url(#vw-plate-').length - 1;
  assert.equal(plates({centerShade: 0}), 0);
  assert.equal(plates({centerShade: 1}), 16);
  assert.equal(plates({centerShade: 1, transparent: true}), 0);
});

test('Vaporwave: o fio de luz das palmeiras fica do lado voltado para o sol', () => {
  // The rim is the silhouette nudged towards the sun: its offset points from the crown to the sun.
  for (const sunPosition of [0.1, 0.5, 0.9]) {
    const props = {palmCount: 3, sunPosition};
    const nudges = [...markupOf(props).matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)" fill="#FF71CE">/g)]
      .map((match) => [Number(match[1]), Number(match[2])] as const);
    // Drawn from the back slot to the front one, as the artwork sorts them.
    const palms = [...pick(scene(props, 0), 'palm')].sort((a, b) => b.variant - a.variant);
    assert.equal(nudges.length, palms.length);
    palms.forEach((palm, index) => {
      const {crown} = getPalmShape(palm);
      const toSun = [getSunX(sunPosition) - crown[0], getSunY(sunPosition) - crown[1]] as const;
      const [dx, dy] = nudges[index]!;
      assert.equal(Math.sign(dx), Math.sign(toSun[0]), `palmeira ${palm.variant}, sol ${sunPosition}`);
      const cosine = (dx * toSun[0] + dy * toSun[1]) / (Math.hypot(dx, dy) * Math.hypot(...toSun));
      assert.ok(cosine > 0.99, `palmeira ${palm.variant}: o fio de luz aponta para o sol`);
    });
  }
});

test('Vaporwave: cores CSS fora do formato hexadecimal desenham sem NaN', () => {
  const colors = ['red', '#abc', 'rgba(255, 0, 128, 0.5)', 'hsl(280, 80%, 60%)'];
  assert.equal(darken('red', 0.4), 'red');
  assert.equal(darken('#FFFFFF', 0.5), 'rgb(128, 128, 128)');
  for (const extra of [{}, {transparent: true}, {colors: colors.slice(0, 2)}, {palmCount: 3, shapeCount: 4, sunPosition: 0.5}]) {
    const props = vaporwaveLoopSchema.parse({colors, ...extra});
    for (const frame of [0, 300]) {
      for (const item of getVaporwaveScene(props, frame, LENGTH)) {
        for (const value of Object.values(item)) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${item.kind}: valor não finito`);
      }
      const markup = renderToStaticMarkup(createElement(VaporwaveArtwork, {props, frame, durationInFrames: LENGTH}));
      assert.ok(!markup.includes('NaN'), `${JSON.stringify(extra)}: NaN no SVG`);
      assert.ok(!markup.includes('undefined'), `${JSON.stringify(extra)}: cor indefinida no SVG`);
      for (const color of props.colors) assert.ok(markup.includes(color), `${color} não chegou ao desenho`);
    }
  }
});

test('Vaporwave: calcular frames não altera os parâmetros nem resultados anteriores', () => {
  const props: VaporwaveLoopProps = vaporwaveLoopSchema.parse({seed: -2026, palmCount: 3, shapeCount: 4, starCount: 200});
  const originalProps = structuredClone(props);
  const first = getVaporwaveScene(props, 173, LENGTH);
  const original = structuredClone(first);
  getVaporwaveScene(props, 721, LENGTH);
  getVaporwaveScene(vaporwaveLoopSchema.parse({seed: 19}), 173, LENGTH);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(first, original);
  assert.deepEqual(getVaporwaveScene(props, 173, LENGTH), original);
});

test('Vaporwave: a área de conteúdo tem as medidas que o README publica', () => {
  // README, "Vaporwave: horizonte neon": 1100×620 centred, x 410–1510, y 230–850.
  assert.deepEqual(CONTENT_BOX, {left: 410, top: 230, right: 1510, bottom: 850});
  assert.equal(CONTENT_BOX.right - CONTENT_BOX.left, 1100);
  assert.equal(CONTENT_BOX.bottom - CONTENT_BOX.top, 620);
  assert.deepEqual([(CONTENT_BOX.left + CONTENT_BOX.right) / 2, (CONTENT_BOX.top + CONTENT_BOX.bottom) / 2], [960, 540]);
  assert.deepEqual([(TITLE_BAND.left + TITLE_BAND.right) / 2, TITLE_BAND.right - TITLE_BAND.left], [960, 700]);
});

test('Vaporwave: os números do README batem com as constantes', () => {
  const readme = 'README, seção "Vaporwave: horizonte neon"';
  assert.deepEqual([PLATE.inner.right - PLATE.inner.left, PLATE.inner.bottom - PLATE.inner.top], [980, 552], `${readme}: placa de 980×552`);
  assert.equal(PLATE.inner.left - PLATE.outer.left, 150, `${readme}: a placa se desfaz ao longo de 150 px`);
  assert.equal(SUN_CUT_DRIFT, 2, `${readme}: duas faixas por ciclo`);
  assert.equal(SPARKLE_MAX, 12, `${readme}: até 12 cintilos`);
  assert.equal(ALPHA_MOUNTAIN_OPACITY, 0.45, `${readme}: montanhas com 45% de opacidade`);
  assert.equal(APEX_CLEARANCE, 40, `${readme}: nenhum pico a menos de 40 px da borda do sol`);
  assert.equal(CROWN_CLEARANCE, 120, `${readme}: nenhum pico a menos de 120 px da copa das palmeiras do horizonte`);
  assert.deepEqual(PALM_ALPHA_FADE, {from: 860, to: 950}, `${readme}: troncos se desfazem entre y 860 e 950`);
  assert.equal(ALPHA_ROW_BOTTOM.floor, 0.4, `${readme}: linhas perto da borda com 40% da opacidade`);
  assert.deepEqual([Math.round(groundY(ALPHA_ROW_BOTTOM.from)), groundY(ALPHA_ROW_BOTTOM.to)], [976, 912], `${readme}: abaixo de y 976`);
  assert.deepEqual(SPARKLE_SKY, {top: 34, bottom: CONTENT_BOX.top}, `${readme}: cintilos acima de y 230`);
});

test('Vaporwave: os três presets passam no schema e cumprem o que prometem', () => {
  const defaults = vaporwaveLoopSchema.parse({});
  const [horizon, classic, alpha] = ['vaporwave-horizonte.json', 'vaporwave-classico.json', 'vaporwave-alpha.json']
    .map((filename) => vaporwaveLoopSchema.strict().parse(readPreset(filename)));
  assert.deepEqual(horizon, defaults);
  assert.equal(classic!.sunPosition, 0.5);
  assert.ok(classic!.centerShade > defaults.centerShade, 'o clássico precisa de uma placa mais forte');
  assert.equal(hasTransparentBackground(classic!), false);
  assert.equal(hasTransparentBackground(alpha!), true);
  assert.equal(alpha!.outputFormat, 'webm');
  assert.equal(alpha!.palmCount, 1, 'sobre o jogo, só a palmeira em V em cada lateral');
  assert.equal(alpha!.shapeCount, 0, 'sobre o jogo, os cantos ficam livres para o HUD');
  assert.equal(new Set([horizon, classic, alpha].map((props) => JSON.stringify(props))).size, 3);
});

test('Vaporwave: o export preserva resolução, duração e a regra de alpha do preview', () => {
  for (const format of ['mp4', 'webm', 'gif'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'VaporwaveLoop', format, props: {transparent}});
      const metadata = getCompositionMetadata(resolved.props);
      assert.equal(resolved.props.backgroundColor, '#120C2E');
      assert.equal(resolved.props.durationSeconds, 16);
      assert.deepEqual(metadata, {
        width: 1920, height: 1080, fps: format === 'gif' ? 50 : 60,
        durationInFrames: format === 'gif' ? 800 : 960,
      });
      assert.equal(hasTransparentBackground(resolved.props), format === 'webm' && transparent);
      if (format === 'webm') {
        assert.equal(resolved.preset.codec, 'vp9');
        assert.equal('pixelFormat' in resolved.preset && resolved.preset.pixelFormat, transparent ? 'yuva420p' : 'yuv420p');
      }
    }
  }
});
