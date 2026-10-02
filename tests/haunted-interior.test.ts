import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createElement, isValidElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {resolveExport} from '../scripts/export';
import {
  FLASH_POOL_GAIN, FOG_RY, getActiveStrike, getHauntedInteriorScene, getLightningBoltBranches, getLightningBoltFade, getLightningBoltPoints, getLightningStrikes,
  getStrikeEnvelope, hauntedInteriorLoopSchema, type HauntedInteriorElement, type HauntedInteriorLoopProps, HauntedInteriorPicture, LIGHTNING,
  type LightningStrike, SHAFT_FADE, shaftVisibility,
} from '../src/backgrounds/HauntedInteriorLoop';
import {
  CORRIDOR_LIGHTS, CORRIDOR_LINES, CorridorThreshold, HauntedCorridor, MIRROR_CLOCK_EDGE, PROP_LOWEST,
} from '../src/backgrounds/halloween/HauntedCorridor';
import {
  ARMCHAIR, at, CANDELABRUM_WICKS, CLOCK, CONSOLE, CORRIDOR, corridorSection, DOOR_FRAME, DOORS, END_DOOR, EYE,
  FIGURE, FIGURE_LIGHT, FLAME, FOOT_OUTLINE, FOOT_TOES, FOOTPRINTS, gloomAt, LIGHT_REFERENCE, lightScale, lumaOf, MIRROR,
  MOON_FLOOR, openLeaf, PROP_BOXES, RIBS, RUNNER, SCONCE_REACH, SCONCES, STAIR, TITLE_LIGHT_RULE, transmittance, VASE,
  WAINSCOT,
} from '../src/backgrounds/halloween/hauntedCorridorGeometry';
import {
  CANDELABRA_PATHS, CURTAIN_OUTLINES, CURTAIN_SHAPES, CURTAIN_TASSELS, CURTAIN_TIEBACKS, FLOOR_VISIBLE, glassSourceOf, HauntedInteriorArchitecture,
  LANCET, MARBLE, MOON_POOL_AXIS, MOON_POOL_LAYERS, MOON_POOL_LIGHTS, MOON_POOL_PANES, MOON_POOL_SAMPLES, MOON_SHAFT_AXIS, MOON_SHAFT_POINTS, MOON_SHAFT_RAYS, RETAINED_CORE, SIDE_WALLS,
  SILL_TOPS, TRACERY_PLATE, WALLS_CORE,
} from '../src/backgrounds/halloween/HauntedInteriorArtwork';
import {
  ARCH, archRise, BACK, BACK_Z, CANDELABRA, CANDELABRA_FOOT, CANDELABRA_PAN, CANDLE_ANCHORS, CANDLE_TOPS, castOnFloor, CHANDELIER,
  CHANDELIER_CANDLE, CHANDELIER_LOWEST_Y, CHANDELIER_MAX_SWING, CHANDELIER_PIVOT, CONTENT_BOX, DATUM, ellipsePoints,
  EYES_ANCHORS, flattenPath, FLOOR_BORDER, FOCAL, FRAME_Z, HALL, HEIGHT, leftWall, LIGHTNING_ANCHORS, mirror, MOON_ANCHORS,
  MOON_DIRECTION, MOON_SIDE, moonDirections, moonOnFloor, onBack, onCeiling, onFloor, type Point, pointInPolygon, PORTRAIT_EYE_POINTS,
  PORTRAIT_OVAL, PORTRAIT_SQUASH, portraitMap, project, TITLE_ZONE, tudorApex, tudorArch, VP, WALL_REACH, WIDTH, WINDOW,
  windowGlassOutline,
} from '../src/backgrounds/halloween/hauntedInteriorGeometry';
import {backgroundCatalog} from '../src/catalog';
import {RemotionRoot} from '../src/Root';
import {findComposition} from './helpers/find-composition';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

const FRAMES = [0, 1, 120, 239, 480, 721, 959];
const KINDS = ['dust', 'fog', 'candle', 'chandelier', 'moonlight', 'eyes', 'lightning'] as const;
const CONTROL_NAMES = [
  'fogIntensity', 'candleIntensity', 'moonlightIntensity', 'hauntingIntensity', 'chandelierSway', 'lightningIntensity',
] as const;
/** Frames of the default loop that fall on a lightning flash (the main flash of each strike). */
const FLASH_FRAMES = getLightningStrikes(hauntedInteriorLoopSchema.parse({})).map((strike) => Math.round((strike.start + 0.05) * 60));
const pick = (scene: HauntedInteriorElement[], kind: HauntedInteriorElement['kind']) =>
  scene.filter((element) => element.kind === kind);

test('Interior: Studio, catálogo, schema e preset compartilham a configuração da mansão', () => {
  const defaults = hauntedInteriorLoopSchema.parse({});
  assert.deepEqual(defaults, {
    durationSeconds: 16, seed: 113, transparent: false, backgroundColor: '#080D10',
    colors: ['#536C68', '#A8BDB0', '#CA8A48'], outputFormat: 'webm',
    dustCount: 36, fogIntensity: 0.55, candleIntensity: 0.8, moonlightIntensity: 0.65,
    hauntingIntensity: 0.45, chandelierSway: 0.6, lightningIntensity: 0.7,
  });
  const metadata = getCompositionMetadata(defaults);
  assert.deepEqual(metadata, {width: 1920, height: 1080, fps: 60, durationInFrames: 960});
  assert.deepEqual(backgroundCatalog.HauntedInteriorLoop.defaultProps, defaults);
  const preset: unknown = JSON.parse(readFileSync(new URL('../presets/halloween-haunted-interior.json', import.meta.url), 'utf8'));
  assert.deepEqual(hauntedInteriorLoopSchema.strict().parse(preset), defaults);

  type CompositionProps = typeof metadata & {
    id: string;
    defaultProps: typeof defaults;
    schema: typeof hauntedInteriorLoopSchema;
    calculateMetadata: (options: {props: typeof defaults}) => typeof metadata & {props: typeof defaults};
  };
  const composition = findComposition<CompositionProps>(RemotionRoot(), 'HauntedInteriorLoop');
  assert.ok(isValidElement<CompositionProps>(composition), 'o interior precisa estar registrado no Studio');
  assert.equal(composition.props.schema, hauntedInteriorLoopSchema);
  assert.deepEqual(composition.props.defaultProps, defaults);
  for (const key of ['width', 'height', 'fps', 'durationInFrames'] as const) {
    assert.equal(composition.props[key], metadata[key]);
  }
  const custom = hauntedInteriorLoopSchema.parse({durationSeconds: 3.7, outputFormat: 'gif'});
  const calculated = composition.props.calculateMetadata({props: custom});
  assert.deepEqual(calculated.props, custom);
  assert.equal(calculated.durationInFrames, 185);
  assert.equal(calculated.fps, 50);
});

test('Interior: controles aceitam os extremos e rejeitam valores inválidos', () => {
  for (const dustCount of [-1, 101, 1.5, '36', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(hauntedInteriorLoopSchema.safeParse({dustCount}).success, false, `dustCount: ${dustCount}`);
  }
  for (const control of CONTROL_NAMES) {
    for (const value of [-0.01, 1.01, '0.5', Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(hauntedInteriorLoopSchema.safeParse({[control]: value}).success, false, `${control}: ${value}`);
    }
  }
  for (const value of [0, 1]) {
    const controls = Object.fromEntries(CONTROL_NAMES.map((control) => [control, value]));
    assert.equal(hauntedInteriorLoopSchema.safeParse({...controls, dustCount: value * 100}).success, true);
  }
});

test('Interior: contagens, dimensões e luzes permanecem válidas nos extremos dos controles', () => {
  for (const input of [
    {},
    {dustCount: 0, ...Object.fromEntries(CONTROL_NAMES.map((control) => [control, 0]))},
    {dustCount: 100, ...Object.fromEntries(CONTROL_NAMES.map((control) => [control, 1]))},
  ]) {
    const props = hauntedInteriorLoopSchema.parse(input);
    for (const frame of FRAMES) {
      const scene = getHauntedInteriorScene(props, frame, 960);
      assert.deepEqual(Object.fromEntries(KINDS.map((kind) => [kind, pick(scene, kind).length])), {
        dust: props.dustCount, fog: 5, candle: 6, chandelier: 1, moonlight: 2, eyes: 2, lightning: 2,
      });
      assert.equal(scene.length, props.dustCount + 18);
      for (const element of scene) {
        for (const key of ['x', 'y', 'scale', 'rotation', 'opacity', 'glow', 'lean'] as const) {
          assert.ok(Number.isFinite(element[key]), `${element.kind}.${key}`);
        }
        assert.ok(element.scale > 0, `${element.kind}: escala positiva`);
        assert.ok(element.opacity >= 0 && element.opacity <= 1, `${element.kind}: opacidade válida`);
        assert.ok(element.glow >= 0 && element.glow <= 1, `${element.kind}: brilho válido`);
      }
    }
  }
});

test('Interior: cada controle altera sua camada de forma proporcional e isolada', () => {
  const controlledFields = {
    fogIntensity: {kinds: ['fog'], field: 'opacity'},
    candleIntensity: {kinds: ['candle', 'chandelier'], field: 'glow'},
    moonlightIntensity: {kinds: ['moonlight'], field: 'opacity'},
    hauntingIntensity: {kinds: ['eyes'], field: 'opacity'},
    chandelierSway: {kinds: ['chandelier'], field: 'rotation'},
    lightningIntensity: {kinds: ['lightning'], field: 'opacity'},
  } as const;
  for (const control of CONTROL_NAMES) {
    let observedEffect = false;
    const target = controlledFields[control];
    // The flashes are brief: every control is also checked on the frames where lightning strikes.
    for (const frame of [...FRAMES, ...FLASH_FRAMES]) {
      const scenes = [0, 0.5, 1].map((value) => getHauntedInteriorScene(
        hauntedInteriorLoopSchema.parse({[control]: value}), frame, 960,
      ));
      const [off, half, full] = scenes;
      assert.ok(off && half && full);
      for (const [index, element] of full.entries()) {
        const disabled = off[index]!;
        const intermediate = half[index]!;
        assert.equal(element.kind, disabled.kind);
        if ((target.kinds as readonly string[]).includes(element.kind)) {
          assert.ok(disabled[target.field] === 0, `${control}: zero desliga o efeito`);
          assert.equal(intermediate[target.field] * 2, element[target.field], `${control}: intensidade proporcional`);
          observedEffect ||= Math.abs(element[target.field]) > 0;
          const withoutControlledField = (entry: HauntedInteriorElement) =>
            Object.fromEntries(Object.entries(entry).filter(([key]) => key !== target.field));
          assert.deepEqual(withoutControlledField(element), withoutControlledField(disabled), `${control}: outros campos preservados`);
          assert.deepEqual(withoutControlledField(element), withoutControlledField(intermediate));
        } else {
          assert.deepEqual(element, disabled, `${control}: não altera ${element.kind}`);
          assert.deepEqual(element, intermediate);
        }
      }
    }
    assert.ok(observedEffect, `${control}: o controle precisa ter efeito visível durante o ciclo`);
  }
});

test('Interior: aumentar poeira preserva as partículas existentes e as demais camadas', () => {
  for (const frame of [0, 173, 959]) {
    const scenes = [0, 1, 100].map((dustCount) => getHauntedInteriorScene(
      hauntedInteriorLoopSchema.parse({dustCount}), frame, 960,
    ));
    const [empty, few, many] = scenes;
    assert.ok(empty && few && many);
    assert.deepEqual(pick(many, 'dust').slice(0, 1), pick(few, 'dust'));
    for (const kind of KINDS.filter((kind) => kind !== 'dust')) {
      assert.deepEqual(pick(empty, kind), pick(few, kind), `poeira alterou ${kind}`);
      assert.deepEqual(pick(many, kind), pick(few, kind), `poeira alterou ${kind}`);
    }
  }
});

const outsideContent = (x: number, y: number, reach = 0) =>
  x + reach < CONTENT_BOX.left || x - reach > CONTENT_BOX.right || y + reach < CONTENT_BOX.top || y - reach > CONTENT_BOX.bottom;
const near = (a: readonly [number, number], b: readonly [number, number], tolerance = 1e-9) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) < tolerance;

test('Interior: atmosfera respeita o espaço central do overlay e o lustre mantém o ponto de suspensão', () => {
  for (const seed of [-2026, 1, 113]) {
    const props = hauntedInteriorLoopSchema.parse({seed, dustCount: 100, chandelierSway: 1});
    for (let frame = 0; frame <= 960; frame += 12) {
      const scene = getHauntedInteriorScene(props, frame, 960);
      for (const dust of pick(scene, 'dust')) {
        assert.ok(outsideContent(dust.x, dust.y, dust.scale), `poeira invadiu a área de conteúdo no frame ${frame}`);
        assert.ok(dust.x + dust.scale < CONTENT_BOX.left || dust.x - dust.scale > CONTENT_BOX.right,
          `poeira saiu das laterais no frame ${frame}`);
      }
      for (const fog of pick(scene, 'fog')) {
        assert.ok(fog.y > 900 && fog.y > CONTENT_BOX.bottom + 60, `névoa subiu para a área central no frame ${frame}`);
        assert.ok(fog.y - FOG_RY * fog.scale > CONTENT_BOX.bottom, `névoa encostou na área de conteúdo no frame ${frame}`);
      }
      for (const light of [...pick(scene, 'candle'), ...pick(scene, 'eyes'), ...pick(scene, 'moonlight')]) {
        assert.ok(outsideContent(light.x, light.y, 20), `${light.kind} dentro da área de conteúdo`);
      }
      assert.deepEqual(pick(scene, 'eyes').map(({x, y}) => [x, y]), EYES_ANCHORS);
      assert.deepEqual(pick(scene, 'candle').map(({x, y}) => [x, y]), CANDLE_ANCHORS);
      assert.deepEqual(pick(scene, 'moonlight').map(({x, y}) => [x, y]), MOON_ANCHORS);
      assert.deepEqual(pick(scene, 'chandelier').map(({x, y}) => [x, y]), [CHANDELIER_PIVOT]);
    }
  }
});

test('Interior: o lustre pende da faixa do teto e, mesmo balançando, fica longe da área de conteúdo', () => {
  assert.ok(CHANDELIER_PIVOT[1] > 0 && CHANDELIER_PIVOT[1] < CONTENT_BOX.top, 'a roseta fica no teto visível');
  assert.equal(CHANDELIER_PIVOT[0], VP.x);
  assert.ok(CHANDELIER.z > 5.2 && CHANDELIER.z < 5.8 && CHANDELIER.radius >= 0.55 && CHANDELIER.radius <= 0.7);
  // CHANDELIER_LOWEST_Y covers every part (ring, arms, pans, cups, candles, drops, hub) at the widest swing.
  assert.ok(CHANDELIER_LOWEST_Y <= 200 && CHANDELIER_LOWEST_Y <= CONTENT_BOX.top - 30,
    `o ponto mais baixo do lustre está em y ${CHANDELIER_LOWEST_Y.toFixed(1)}`);
  // Every extreme of the piece (ring, candle tops, finial) swung to the largest sway the scene uses.
  const extremes = [
    ...Array.from({length: 72}, (_, i) => {
      const angle = (i / 72) * Math.PI * 2;
      const [x, z] = [CHANDELIER.radius * Math.cos(angle), CHANDELIER.z + CHANDELIER.radius * Math.sin(angle)];
      return [project(x, CHANDELIER.ring - 0.03, z), project(x, CHANDELIER.ring + CHANDELIER_CANDLE.top, z)];
    }).flat(),
    project(0, CHANDELIER.finial, CHANDELIER.z),
  ];
  const sway = Math.max(...Array.from({length: 961}, (_, frame) => Math.abs(getHauntedInteriorScene(
    hauntedInteriorLoopSchema.parse({chandelierSway: 1}), frame, 960).find((element) => element.kind === 'chandelier')!.rotation)));
  assert.ok(sway <= CHANDELIER_MAX_SWING + 1e-12, 'o balanço não passa do limite usado no cálculo do ponto mais baixo');
  for (const degrees of [-sway, sway]) {
    const [c, s] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
    for (const [x, y] of extremes) {
      const [dx, dy] = [x - CHANDELIER_PIVOT[0], y - CHANDELIER_PIVOT[1]];
      const swung = CHANDELIER_PIVOT[1] + dx * s + dy * c;
      assert.ok(swung <= 200 && swung < CONTENT_BOX.top - 30, `o lustre desce até y ${swung.toFixed(1)}`);
      assert.ok(swung > 0, 'as velas do lustre ficam dentro do quadro');
    }
  }
});

test('Interior: os olhos ficam pintados nos retratos, com o escorço da parede', () => {
  const [left, right] = PORTRAIT_EYE_POINTS;
  for (const eye of left) assert.ok(pointInPolygon(eye, PORTRAIT_OVAL), 'olho fora do retrato esquerdo');
  for (const eye of right) assert.ok(pointInPolygon(mirror(eye), PORTRAIT_OVAL), 'olho fora do retrato direito');
  EYES_ANCHORS.forEach(([x, y], index) => {
    const [a, b] = PORTRAIT_EYE_POINTS[index]!;
    assert.ok(Math.abs(x - (a[0] + b[0]) / 2) < 1e-9 && Math.abs(y - (a[1] + b[1]) / 2) < 1e-9);
  });
  assert.ok(PORTRAIT_SQUASH > 0.3 && PORTRAIT_SQUASH < 0.9, 'o retrato na parede lateral fica mais estreito');
  for (const [x] of PORTRAIT_OVAL) assert.ok(x < CONTENT_BOX.left, 'o retrato fica fora da área de conteúdo');
  // Legible: the painted oval spans a real area on screen, not a slit.
  const xs = PORTRAIT_OVAL.map(([x]) => x);
  const ys = PORTRAIT_OVAL.map(([, y]) => y);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 80 && Math.max(...ys) - Math.min(...ys) > 160, 'o retrato precisa ser legível');
});

test('Interior: a parede do fundo é exatamente a área de conteúdo, e o arco guarda o título no vazio', () => {
  // Back wall corners land on the content box corners; the vanishing point is its centre.
  const corners = [
    [onBack(-HALL.halfWidth, HALL.height), [CONTENT_BOX.left, CONTENT_BOX.top]],
    [onBack(HALL.halfWidth, HALL.height), [CONTENT_BOX.right, CONTENT_BOX.top]],
    [onBack(-HALL.halfWidth, 0), [CONTENT_BOX.left, CONTENT_BOX.bottom]],
    [onBack(HALL.halfWidth, 0), [CONTENT_BOX.right, CONTENT_BOX.bottom]],
  ] as const;
  for (const [corner, expected] of corners) assert.ok(near(corner, expected, 1e-6), `canto ${expected.join(',')}`);
  assert.ok(Math.abs(BACK.left - CONTENT_BOX.left) < 1e-6 && Math.abs(BACK.right - CONTENT_BOX.right) < 1e-6);
  assert.ok(Math.abs(BACK.top - CONTENT_BOX.top) < 1e-6 && Math.abs(BACK.bottom - CONTENT_BOX.bottom) < 1e-6);
  assert.deepEqual([VP.x, VP.y], [(CONTENT_BOX.left + CONTENT_BOX.right) / 2, (CONTENT_BOX.top + CONTENT_BOX.bottom) / 2]);
  assert.ok(Math.abs(HALL.height / HALL.halfWidth - 620 / 550) < 1e-12 && HALL.eye === HALL.height / 2);
  assert.ok(FOCAL >= 1000 && FOCAL <= 1150);
  // Box and frame are concentric 16:9 rectangles: the four corner seams run to the frame corners.
  for (const [[bx, by], [fx, fy]] of [
    [[CONTENT_BOX.left, CONTENT_BOX.top], [0, 0]], [[CONTENT_BOX.right, CONTENT_BOX.top], [WIDTH, 0]],
    [[CONTENT_BOX.left, CONTENT_BOX.bottom], [0, HEIGHT]], [[CONTENT_BOX.right, CONTENT_BOX.bottom], [WIDTH, HEIGHT]],
  ] as const) {
    const t = (fx - VP.x) / (bx - VP.x);
    assert.ok(Math.abs(VP.y + (by - VP.y) * t - fy) < 2, `a quina da sala chega ao canto ${fx},${fy}`);
  }
  // The title zone lies entirely over the archway's void (a convex opening, so its corners suffice).
  const opening = tudorArch(0, 0, ARCH).map(([x, v]) => onBack(x / 100, v / 100));
  for (const x of [TITLE_ZONE.left, (TITLE_ZONE.left + TITLE_ZONE.right) / 2, TITLE_ZONE.right]) {
    for (const y of [TITLE_ZONE.top, TITLE_ZONE.bottom]) {
      assert.ok(pointInPolygon([x, y], opening), `título em ${x},${y} fora do vão do arco`);
    }
  }
  for (const [x, y] of opening) {
    assert.ok(x >= CONTENT_BOX.left && x <= CONTENT_BOX.right && y >= CONTENT_BOX.top && y <= CONTENT_BOX.bottom, 'o arco cabe na parede do fundo');
  }
  // The outer moulding stays clear of the frieze band, so the arch never grazes the cornice line.
  assert.ok(tudorApex(ARCH, 26) <= DATUM.frieze - 5, `a moldura do arco encosta no friso (${tudorApex(ARCH, 26).toFixed(1)} cm)`);
});

test('Interior: um só ponto de fuga — paredes, piso, teto e janelas convergem e se encontram sem frestas', () => {
  const collinearWithVP = (a: readonly [number, number], b: readonly [number, number]) => {
    const cross = (a[0] - VP.x) * (b[1] - VP.y) - (a[1] - VP.y) * (b[0] - VP.x);
    return Math.abs(cross) / Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6;
  };
  const wall = leftWall();
  const glass = leftWall(-WINDOW.reveal);
  // Every horizontal of the side wall, and of the window glass behind it, recedes to VP.
  for (const v of [0, DATUM.base, DATUM.wainscot, DATUM.cap, DATUM.frieze, DATUM.cornice, DATUM.crown, DATUM.ceiling, WINDOW.spring]) {
    assert.ok(collinearWithVP(wall(0, v), wall(WALL_REACH, v)), `parede: linha ${v} cm`);
    assert.ok(collinearWithVP(glass(WINDOW.u - WINDOW.half, v), glass(WINDOW.u + WINDOW.half, v)), `vidro: linha ${v} cm`);
    assert.ok(collinearWithVP(mirror(wall(0, v)), mirror(wall(WALL_REACH, v))), `parede direita: linha ${v} cm`);
  }
  // Things hung in front of the wall (curtain rod, portrait, window ledge) and the glass behind it
  // keep to their own receding lines.
  for (const offset of [6, WINDOW.ledge, 10, 12, -WINDOW.reveal]) {
    const plane = leftWall(offset);
    assert.ok(collinearWithVP(plane(40, 440), plane(240, 440)), `plano a ${offset} cm da parede`);
  }
  // Floor joints and ceiling ribs parallel to the walls, and the archway's passage, recede to VP.
  for (const x of [-440, -322, -161, 0, 241.5, 370]) {
    assert.ok(collinearWithVP(onFloor(x, 0), onFloor(x, 400)), `junta do piso em ${x} cm`);
    assert.ok(collinearWithVP(onCeiling(x, 0), onCeiling(x, 400)), `nervura do teto em ${x} cm`);
  }
  for (const [x, v] of tudorArch(0, 0, ARCH).filter((_, i) => i % 6 === 0)) {
    assert.ok(collinearWithVP(onBack(x / 100, v / 100), project(x / 100, v / 100, BACK_Z + 6)), `passagem do arco em ${x},${v}`);
  }
  // The moonlight pool is cast on the floor plane, so its edges along the wall recede to VP too.
  const [x0, z0] = moonOnFloor(WINDOW.u - WINDOW.half, WINDOW.sill);
  const [x1, z1] = moonOnFloor(WINDOW.u + WINDOW.half, WINDOW.sill);
  assert.ok(Math.abs(x0 - x1) < 1e-12 && collinearWithVP(project(x0, 0, z0), project(x1, 0, z1)), 'mancha de luar no plano do piso');
  // Verticals stay vertical: the same u at two heights shares x.
  assert.equal(wall(250, 0)[0], wall(250, 480)[0]);
  // The planes share their corners exactly: side wall, back wall, floor and ceiling.
  const shared = [[wall(0, 0), onBack(-HALL.halfWidth, 0), onFloor(-HALL.halfWidth * 100, 0)],
    [wall(0, DATUM.ceiling), onBack(-HALL.halfWidth, HALL.height), onCeiling(-HALL.halfWidth * 100, 0)]];
  for (const [a, b, c] of shared) assert.ok(near(a!, b!) && near(a!, c!), 'os planos dividem a mesma quina');
  // Equal steps in depth shrink towards the back (1/Z), both on the floor and along the wall.
  const rows = [0, 80, 160, 240, 320].map((u) => onFloor(0, u)[1]);
  const gaps = rows.slice(1).map((y, i) => y - rows[i]!);
  gaps.slice(1).forEach((gap, i) => assert.ok(gap > gaps[i]!, 'as fileiras do piso devem encurtar para o fundo'));
  const panels = [0, 66, 132, 198].map((u) => wall(u, 0)[0]);
  panels.slice(2).forEach((x, i) => assert.ok(panels[i]! - panels[i + 1]! < panels[i + 1]! - x, 'os painéis devem encurtar para o fundo'));
});

/** How far towards the centre line the left pool may reach on screen (the right one, mirrored). */
const POOL_REACH_X = 760;
/**
 * Room kept around the lit panes on screen for the soft halo the marble spreads around them: the
 * glow is a blur of stdDeviation 8, and 1.5 of those past a lit edge it is under a tenth of its
 * strength. The pool, halo included, stays inside POOL_REACH_X and the frame.
 */
const POOL_GLOW = 12;
/** The lit panes of the left pool, on screen. */
const LIT_POOL: readonly Point[] = MOON_POOL_PANES.flat().map(([x, z]) => project(x, 0, z));

test('Interior: janelas, luar e candelabros ficam nas paredes laterais, fora da área de conteúdo', () => {
  const glass = leftWall(-WINDOW.reveal);
  for (const [u, v] of windowGlassOutline()) {
    const [x] = glass(u, v);
    assert.ok(x < CONTENT_BOX.left, 'a janela fica na parede lateral');
  }
  // What the moon lights lies on the floor, below the content box and away from the centre line, its
  // halo inside the frame. (The stone tip of the arch casts only shadow, which may run on unseen.)
  for (const [px, py] of LIT_POOL) {
    assert.ok(px + POOL_GLOW < POOL_REACH_X && py > CONTENT_BOX.bottom && py + POOL_GLOW < HEIGHT,
      `a mancha de luar sai do piso, da frente do eixo ou do quadro em ${px.toFixed(0)},${py.toFixed(0)}`);
  }
  // The candelabra stands on the floor, in front of the side wall, feet inside the frame.
  assert.ok(CANDELABRA.x > -HALL.halfWidth && CANDELABRA_FOOT[1] < HEIGHT - 20, 'o pé do candelabro aparece inteiro');
  assert.ok(CANDELABRA_FOOT[1] > onFloor(-HALL.halfWidth * 100, (BACK_Z - CANDELABRA.z) * 100)[1] - 1e-9, 'o candelabro pisa no chão');
  for (const [x, y] of CANDLE_ANCHORS) assert.ok(outsideContent(x, y, 60), 'as chamas ficam longe da área de conteúdo');
  // Nothing of it stands inside the wall: the outer drip pans are its widest reach.
  const reach = Math.max(...CANDLE_TOPS.map(([dx]) => Math.abs(dx))) + CANDELABRA_PAN;
  assert.ok(CANDELABRA.x - reach > -HALL.halfWidth, 'o candelabro atravessa a parede');
  // The candelabra's feet (24 cm around the shaft) keep to the floor border, the strip kept over
  // gameplay. The moonlight's lit panes land wholly on the marble field beyond it, so over gameplay
  // the pool is left out whole, never as a fragment on the strip.
  const border = -HALL.halfWidth + FLOOR_BORDER / 100;
  assert.ok(CANDELABRA.x + 0.24 < border, 'o candelabro sai da faixa junto à parede');
  for (const [x] of MOON_POOL_PANES.flat()) {
    assert.ok(x > border && x < 0, `o luar cai sobre a faixa do piso (${x.toFixed(2)} m)`);
  }
});

const segmentDistance = (p: Point, a: Point, b: Point) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const distanceToPolygon = (p: Point, polygon: readonly Point[]) => pointInPolygon(p, polygon)
  ? 0
  : Math.min(...polygon.map((a, i) => segmentDistance(p, a, polygon[(i + 1) % polygon.length]!)));

test('Interior: cortinas emolduram a lanceta sem escondê-la, pousam no piso e dão folga ao retrato e às velas', () => {
  // At the roundel's height and at the sill, at least three quarters of the glass stays in view.
  const glass = leftWall(-WINDOW.reveal);
  const outline = windowGlassOutline();
  const across = (v: number) => {
    const us = outline.flatMap((a, i) => {
      const b = outline[(i + 1) % outline.length]!;
      return (a[1] - v) * (b[1] - v) <= 0 && a[1] !== b[1] ? [a[0] + ((b[0] - a[0]) * (v - a[1])) / (b[1] - a[1])] : [];
    });
    return [Math.min(...us), Math.max(...us)] as const;
  };
  for (const v of [WINDOW.sill + 4, 372]) {
    const [u0, u1] = across(v);
    const samples = Array.from({length: 101}, (_, i) => glass(u0 + ((u1 - u0) * i) / 100, v));
    const seen = samples.filter((point) => !CURTAIN_OUTLINES.some((curtain) => pointInPolygon(point, curtain))).length;
    assert.ok(seen / samples.length >= 0.75, `só ${seen}% do vidro aparece a ${v} cm`);
  }
  // The velvet rests on the floor: no point of a panel sinks below where its plane meets the floor.
  for (const curtain of CURTAIN_OUTLINES) {
    for (const [x, y] of curtain) {
      const z = (FOCAL * (HALL.halfWidth - 0.1)) / (VP.x - x);
      assert.ok(y <= VP.y + (FOCAL * HALL.eye) / z + 1e-6, `a cortina afunda no piso em ${x.toFixed(0)},${y.toFixed(0)}`);
    }
  }
  // The portrait's frame keeps clear of the velvet, and no tassel hangs right over a flame.
  const frame = ellipsePoints(0, 0, 78, 104, 96).map(([x, y]) => portraitMap(x, y));
  const clearance = Math.min(...frame.flatMap((point) => CURTAIN_OUTLINES.map((curtain) => distanceToPolygon(point, curtain))));
  assert.ok(clearance >= 12, `retrato encostado na cortina (${clearance.toFixed(1)} px)`);
  // The candelabra stands in front of the velvet without touching it: its outer pan keeps clear.
  const pan = project(CANDELABRA.x + CANDLE_TOPS[2][0] + CANDELABRA_PAN, CANDLE_TOPS[2][1] - 0.2, CANDELABRA.z);
  const gap = Math.min(...CURTAIN_OUTLINES.map((curtain) => distanceToPolygon(pan, curtain)));
  assert.ok(gap >= 8, `o candelabro tangencia a cortina (${gap.toFixed(1)} px)`);
  for (const tassel of CURTAIN_TASSELS) {
    const x = tassel.reduce((sum, [px]) => sum + px, 0) / tassel.length;
    for (const [flame] of CANDLE_ANCHORS.slice(0, 3)) {
      assert.ok(Math.abs(flame - x) >= 20, `borla alinhada com a chama em x ${flame.toFixed(0)}`);
    }
  }
});

test('Interior: amostras de outros frames e seeds não alteram parâmetros nem cenas já calculadas', () => {
  const props = hauntedInteriorLoopSchema.parse({seed: -2026, dustCount: 100});
  const originalProps = structuredClone(props);
  const first = getHauntedInteriorScene(props, 173, 960);
  const originalScene = structuredClone(first);
  getHauntedInteriorScene(props, 721, 960);
  getHauntedInteriorScene(hauntedInteriorLoopSchema.parse({seed: 19}), 173, 960);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(first, originalScene);
  assert.deepEqual(getHauntedInteriorScene(props, 173, 960), originalScene);
});

test('Interior: exportação compartilha resolução, duração e regra de alpha com o preview', () => {
  for (const format of ['mp4', 'webm', 'gif'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'HauntedInteriorLoop', format, props: {transparent}});
      assert.equal(resolved.props.backgroundColor, '#080D10');
      assert.equal(resolved.props.durationSeconds, 16);
      assert.deepEqual(getCompositionMetadata(resolved.props), {
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

test('Interior: os números de docs/themes/halloween-mansion-interior.md batem com as constantes', () => {
  const readme = 'docs/themes/halloween-mansion-interior.md';
  assert.deepEqual(CONTENT_BOX, {left: 410, top: 230, right: 1510, bottom: 850}, `${readme}: área de 1100×620, x 410–1510, y 230–850`);
  assert.deepEqual([VP.x, VP.y], [960, 540], `${readme}: ponto de fuga em (960, 540)`);
  assert.deepEqual(TITLE_ZONE, {left: 610, top: 400, right: 1310, bottom: 650}, `${readme}: faixa de título x 610–1310, y 400–650`);
  assert.deepEqual([BACK.left, BACK.top, BACK.right, BACK.bottom].map((value) => Math.round(value * 1e6) / 1e6),
    [CONTENT_BOX.left, CONTENT_BOX.top, CONTENT_BOX.right, CONTENT_BOX.bottom], `${readme}: a parede do fundo ocupa exatamente a área`);
});

/* ---------------------------------------------------------------------------------- corredor */

const collinearWithVP = (a: Point, b: Point) =>
  Math.abs((a[0] - VP.x) * (b[1] - VP.y) - (a[1] - VP.y) * (b[0] - VP.x)) / Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6;
/** The far face of the arch's reveal, on screen: the corridor is only ever seen through it. */
const CORRIDOR_MOUTH = corridorSection().map(([x, v]) => at(x, v, CORRIDOR.start));
const boxCorners = (box: (typeof PROP_BOXES)[number]) =>
  [box.x0, box.x1].flatMap((x) => [box.h0, box.h1].flatMap((h) => [box.d0, box.d1].map((d) => at(x, h, d))));
const sideOf = (box: {x0: number; x1: number}) => Math.sign(box.x0 + box.x1);

test('Interior: o corredor tem cerca de 11 m, a seção do arco e um só ponto de fuga', () => {
  assert.equal(CORRIDOR.half, ARCH.half);
  assert.equal(CORRIDOR.spring, ARCH.spring);
  assert.equal(CORRIDOR.start, ARCH.depth, 'o corredor começa na face de trás do arco');
  const length = CORRIDOR.end - CORRIDOR.start;
  assert.ok(length >= 900 && length <= 1300, `o corredor tem ${length} cm`);
  // The corridor's opening is exactly the reveal's far face, as the hall's camera sees it.
  for (const [x, v] of tudorArch(0, 0, ARCH)) {
    assert.ok(near(at(x, v, CORRIDOR.start), project(x / 100, v / 100, BACK_Z + ARCH.depth / 100)), 'boca do corredor');
  }
  // Every straight line the artwork draws along the corridor (wall bands, skirting, rails, cornice,
  // floorboards, the runner's edges) runs to the vanishing point.
  assert.ok(CORRIDOR_LINES.length >= 30, `só ${CORRIDOR_LINES.length} linhas ao longo do corredor`);
  for (const [a, b] of CORRIDOR_LINES) assert.ok(collinearWithVP(a, b), `linha ${a.map(Math.round)} → ${b.map(Math.round)} fora do ponto de fuga`);
  // The section at any depth is the arch's outline shrunk about the vanishing point.
  for (const [x, v] of corridorSection().filter((_, i) => i % 5 === 0)) {
    assert.ok(collinearWithVP(at(x, v, CORRIDOR.start), at(x, v, CORRIDOR.end)), `seção em ${x},${v}`);
  }
  // Ribs equally spaced along the corridor crowd together towards its end (1/Z).
  const spacing = RIBS.depths.slice(1).map((d, i) => d - RIBS.depths[i]!);
  assert.ok(spacing.every((step) => Math.abs(step - spacing[0]!) < 1e-9), 'as nervuras têm passo constante');
  const crowns = RIBS.depths.map((d) => at(0, tudorApex(ARCH) - RIBS.drop, d)[1]);
  const gaps = crowns.slice(1).map((y, i) => y - crowns[i]!);
  gaps.forEach((gap, i) => assert.ok(gap > 0 && (i === 0 || gap < gaps[i - 1]!), 'as nervuras devem se aproximar no fundo'));
  assert.ok(RIBS.depths.every((d) => d > CORRIDOR.start && d < CORRIDOR.end));
  // The end wall sits behind the middle of the title band, well inside the arch opening.
  for (const [x, v] of corridorSection()) {
    const point = at(x, v, CORRIDOR.end);
    assert.ok(pointInPolygon(point, CORRIDOR_MOUTH), 'a parede do fim fica dentro do vão');
  }
  // The hall's skirting, wainscot and rail run on along the corridor at the same heights.
  assert.deepEqual([WAINSCOT.base, WAINSCOT.top, WAINSCOT.rail], [DATUM.base, DATUM.wainscot, DATUM.cap], 'o lambri do corredor segue o do salão');
  assert.ok(WAINSCOT.rail < WAINSCOT.cornice && WAINSCOT.cornice < CORRIDOR.spring);
});

test('Interior: os móveis do corredor pisam no chão, cabem no vão do arco e não se atravessam', () => {
  const names = PROP_BOXES.map((box) => box.name);
  assert.deepEqual(names, ['console', 'clock', 'armchair', 'shroud', 'chest']);
  assert.deepEqual(Object.keys(PROP_LOWEST).sort(), [...names].sort(), 'cada móvel tem o ponto mais baixo do desenho');
  for (const box of PROP_BOXES) {
    assert.equal(box.h0, 0, `${box.name}: apoiado no piso`);
    assert.ok(box.x0 < box.x1 && box.h0 < box.h1 && box.d0 < box.d1, `${box.name}: caixa válida`);
    assert.ok(box.x0 >= -CORRIDOR.half && box.x1 <= CORRIDOR.half, `${box.name}: atravessa a parede`);
    assert.ok(box.d0 > CORRIDOR.start + 20 && box.d1 < CORRIDOR.end - 20, `${box.name}: fora do corredor`);
    // Each one stands against a wall, as furniture in a corridor does, and leaves the runner clear.
    assert.ok(box.x0 <= -CORRIDOR.half + 5 || box.x1 >= CORRIDOR.half - 5, `${box.name}: longe da parede`);
    assert.ok(box.x1 < -RUNNER.half || box.x0 > RUNNER.half, `${box.name}: em cima da passadeira`);
    // Seen from the hall, all of it lies inside the reveal's far face, which clips the corridor.
    for (const corner of boxCorners(box)) assert.ok(pointInPolygon(corner, CORRIDOR_MOUTH), `${box.name}: sai do vão do arco`);
    // What the artwork draws of it (its outline, not its shadow) comes down exactly to the floor line
    // at the depth of its nearest foot, and nothing of it sinks below that line: the drawn paths are
    // rounded to 0.1 px, so half of that is the only slack below.
    assert.ok(box.foot >= box.d0 && box.foot <= box.d1, `${box.name}: o pé fica fora da própria base`);
    const floorY = VP.y + (FOCAL * HALL.eye) / (BACK_Z + box.foot / 100);
    const lowest = PROP_LOWEST[box.name]!;
    assert.ok(lowest <= floorY + 0.05 + 1e-9, `${box.name}: afunda ${(lowest - floorY).toFixed(2)} px abaixo do piso`);
    assert.ok(floorY - lowest <= 0.5, `${box.name}: flutua ${(floorY - lowest).toFixed(2)} px acima do piso`);
  }
  for (const [i, a] of PROP_BOXES.entries()) {
    for (const b of PROP_BOXES.slice(i + 1)) {
      const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.d1 <= b.d0 || b.d1 <= a.d0;
      assert.ok(apart, `${a.name} e ${b.name} se atravessam`);
    }
  }
  // No piece of furniture blocks a doorway on its wall, and the open leaf swings clear of them all.
  for (const box of PROP_BOXES) {
    for (const door of DOORS.filter((entry) => entry.side === sideOf(box))) {
      assert.ok(box.d1 < door.d0 - DOOR_FRAME.width || box.d0 > door.d1 + DOOR_FRAME.width, `${box.name} na frente de uma porta`);
    }
  }
  for (const door of DOORS.filter((entry) => entry.ajar > 0)) {
    const leaf = openLeaf(door);
    for (let u = 0; u <= leaf.width; u += 2) {
      const [x, d] = [leaf.hinge.x + leaf.dir.x * u, leaf.hinge.d + leaf.dir.d * u];
      assert.ok(Math.abs(x) > RUNNER.half, 'a folha aberta invade a passadeira');
      for (const box of PROP_BOXES) {
        assert.ok(x < box.x0 || x > box.x1 || d < box.d0 || d > box.d1, `a folha aberta bate em ${box.name}`);
      }
    }
  }
  // The sconces hang on the walls between the doors; the candelabrum and the urn stand on the console.
  for (const sconce of SCONCES) {
    for (const door of DOORS.filter((entry) => entry.side === sconce.side)) {
      assert.ok(sconce.d < door.d0 - DOOR_FRAME.width - 10 || sconce.d > door.d1 + DOOR_FRAME.width + 10, 'arandela sobre uma porta');
    }
    assert.ok(sconce.d > CORRIDOR.start && sconce.d < CORRIDOR.end);
  }
  for (const [x, , d] of [...CANDELABRUM_WICKS, [VASE.x, 0, VASE.d] as const]) {
    assert.ok(x > CONSOLE.x0 && x < CONSOLE.x1 && d > CONSOLE.d0 && d < CONSOLE.d1, 'objeto fora do tampo do console');
  }
  for (const [, h] of CANDELABRUM_WICKS) assert.ok(h > CONSOLE.height && h < MIRROR.h0, 'as velas ficam sobre o tampo e abaixo do espelho');
  assert.ok(MIRROR.d0 >= CONSOLE.d0 && MIRROR.d1 <= CONSOLE.d1, 'o espelho fica sobre o console');
  assert.ok(CONSOLE.height < WAINSCOT.top && MIRROR.h0 > WAINSCOT.rail, 'o tampo fica abaixo do trilho do lambri e o espelho acima dele');
  // The runner starts on the archway's threshold, its fringe on the reveal's floor, and runs on to near the end wall.
  assert.ok(RUNNER.d0 >= 6 && RUNNER.d0 < CORRIDOR.start, 'a passadeira começa na soleira do arco');
  assert.ok(RUNNER.d1 < CORRIDOR.end && RUNNER.d1 > CORRIDOR.end - 150);
  const threshold = renderToStaticMarkup(createElement('svg', null, createElement(CorridorThreshold,
    {candle: LIGHT_REFERENCE.candleColor, atmosphere: '#536C68'})));
  assert.ok(threshold.includes('clip-path="url(#hi-cor-threshold)"'), 'o trecho da soleira é recortado no piso do arco');
  // The clip trims the threshold copy once, after its layers are composited together, so no hairline shows at the corridor's mouth.
  assert.ok(/clip-path="url\(#hi-cor-threshold\)"><g style="isolation:isolate" opacity="0\.999">/.test(threshold),
    'as camadas da soleira são compostas num só grupo antes do recorte');
  // Footprints stay on the runner, between its ends, one foot each, a stride apart and alternating,
  // from the runner's far end, where she stepped onto it, to the archway's threshold.
  const toe = Math.min(...FOOT_OUTLINE.map(([, pd]) => pd), ...FOOT_TOES.map(([, pd, , rd]) => pd - rd));
  const heel = Math.max(...FOOT_OUTLINE.map(([, pd]) => pd));
  for (const [x, d] of FOOTPRINTS) {
    assert.ok(Math.abs(x) < RUNNER.half - 10 && d + toe > RUNNER.d0 && d + heel < RUNNER.d1, 'pegada fora da passadeira');
  }
  FOOTPRINTS.slice(1).forEach(([x, d], i) => {
    const [px, pd] = FOOTPRINTS[i]!;
    assert.ok(Math.sign(x) !== Math.sign(px) && d - pd > 50 && d - pd < 75, 'as pegadas alternam os pés a cada passo');
  });
  const depths = FOOTPRINTS.map(([, d]) => d);
  assert.ok(RUNNER.d1 - Math.max(...depths) <= 30, `a trilha começa a ${RUNNER.d1 - Math.max(...depths)} cm do fim da passadeira`);
  assert.ok(Math.min(...depths) < CORRIDOR.start, 'a trilha chega à soleira do arco');
  // A bare foot, toes and all, at a real size; the toes stand ahead of the sole, the big toe on the inner side.
  const footWidth = Math.max(...FOOT_OUTLINE.map(([px]) => px)) - Math.min(...FOOT_OUTLINE.map(([px]) => px));
  assert.ok(heel - toe >= 23 && heel - toe <= 28 && footWidth >= 8 && footWidth <= 11, `pé de ${heel - toe}×${footWidth} cm`);
  for (const [px, pd, rx, rd] of FOOT_TOES) {
    assert.ok(pd < 0 && ellipsePoints(px, pd, rx, rd, 16).every((point) => !pointInPolygon(point, FOOT_OUTLINE)), 'um dedo encostado na sola');
  }
  const big = FOOT_TOES.reduce((a, b) => (a[2] * a[3] >= b[2] * b[3] ? a : b));
  assert.ok(big[0] < 0 && FOOT_TOES.every(([px]) => px >= big[0]), 'o dedão fica no lado de dentro');
});

const hull = (points: readonly Point[]) => {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, point) <= 0) out.pop();
      out.push(point);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
};

test('Interior: portas e arandelas do corredor ficam à vista, sem móvel ou folha na frente', () => {
  // On screen, each free-standing piece covers at most the hull of its box, and the open leaf the
  // hull of its two faces.
  const silhouettes = PROP_BOXES.map((box) => ({name: box.name, near: box.d0, outline: hull(boxCorners(box))}));
  const open = DOORS.find((door) => door.ajar > 0)!;
  const leaf = openLeaf(open);
  const leafDepth = Math.min(leaf.hinge.d, leaf.free.d);
  const leafOutline = hull([0, leaf.width].flatMap((u) => [0, DOOR_FRAME.leaf].flatMap((t) => [0, leaf.height].map((h) => {
    const [x, d] = [leaf.hinge.x + leaf.dir.x * u + open.side * leaf.dir.d * t, leaf.hinge.d + leaf.dir.d * u - open.side * leaf.dir.x * t];
    return at(x, h, d);
  }))));
  // Both jambs of every door show, down to half its height, in front of anything that stands nearer.
  for (const door of DOORS) {
    for (const d of [door.d0 - DOOR_FRAME.width, door.d0, door.d1, door.d1 + DOOR_FRAME.width]) {
      for (let h = door.height / 2; h <= door.height; h += 10) {
        const point = at(door.side * CORRIDOR.half, h, d);
        for (const prop of silhouettes.filter((entry) => entry.near < d)) {
          assert.ok(!pointInPolygon(point, prop.outline), `${prop.name} esconde a ombreira da porta em ${d} cm`);
        }
        if (door !== open && leafDepth < d) assert.ok(!pointInPolygon(point, leafOutline), `a folha aberta esconde a porta em ${d} cm`);
      }
    }
  }
  // Every sconce shows clear of the leaf and of the furniture, nearer or not: its pan never sits on a sheet.
  for (const sconce of SCONCES) {
    const pan = at(sconce.side * (CORRIDOR.half - SCONCE_REACH), sconce.h, sconce.d);
    const plate = at(sconce.side * CORRIDOR.half, sconce.h, sconce.d);
    for (const outline of [leafOutline, ...silhouettes.map((prop) => prop.outline)]) {
      for (const point of [pan, plate]) {
        assert.ok(distanceToPolygon(point, outline) >= 6, `arandela em ${sconce.d} cm a ${distanceToPolygon(point, outline).toFixed(1)} px de um móvel`);
      }
    }
  }
});

test('Interior: portas, relógio, arandelas, poltrona, escada e a figura têm tamanhos de verdade', () => {
  for (const door of DOORS) {
    assert.ok(door.height >= 220 && door.height <= 260, `porta de ${door.height} cm`);
    assert.ok(door.d1 - door.d0 >= 90 && door.d1 - door.d0 <= 120, `porta de ${door.d1 - door.d0} cm de largura`);
    assert.ok(door.d0 - DOOR_FRAME.width > CORRIDOR.start && door.d1 + DOOR_FRAME.width < CORRIDOR.end, 'porta fora do corredor');
  }
  const clock = PROP_BOXES.find((box) => box.name === 'clock')!;
  assert.ok(clock.h1 >= 200 && clock.h1 <= 235, `relógio de ${clock.h1} cm`);
  assert.ok(CONSOLE.height >= 75 && CONSOLE.height <= 90, `console de ${CONSOLE.height} cm`);
  for (const sconce of SCONCES) assert.ok(sconce.h >= 165 && sconce.h <= 190, `arandela a ${sconce.h} cm`);
  assert.ok(SCONCE_REACH >= 12 && SCONCE_REACH <= 25);
  assert.ok(ARMCHAIR.back >= 95 && ARMCHAIR.back <= 115 && ARMCHAIR.seat >= 40 && ARMCHAIR.seat <= 50, 'poltrona fora de escala');
  assert.ok(FIGURE.height >= 150 && FIGURE.height <= 175, `figura de ${FIGURE.height} cm`);
  assert.ok(RUNNER.half * 2 >= 120 && RUNNER.half * 2 <= 180, 'passadeira fora de escala');
  // The end doorway is a real door's size; beyond its reveal, a stair hall with steps of a real stair.
  const apex = END_DOOR.spring + archRise(END_DOOR.half, END_DOOR.c);
  assert.ok(apex >= 240 && apex <= 290 && END_DOOR.half * 2 >= 100 && END_DOOR.half * 2 <= 130, 'porta do fundo fora de escala');
  assert.ok(STAIR.rise >= 15 && STAIR.rise <= 20 && STAIR.going >= 25 && STAIR.going <= 32, 'degraus fora de escala');
  const blondel = 2 * STAIR.rise + STAIR.going;
  assert.ok(blondel >= 60 && blondel <= 66, `degrau com 2e + p = ${blondel} cm`);
  const beyond = CORRIDOR.end + END_DOOR.reveal;
  assert.ok(STAIR.lit >= 2 && STAIR.lit <= 3 && STAIR.lit < STAIR.steps, 'o luar toca só os primeiros degraus');
  // Seen through the doorway, the stair is wider than the view: neither of its ends shows.
  const zOf = (d: number) => BACK_Z * 100 + d;
  const topOfStair = STAIR.foot + STAIR.steps * STAIR.going;
  assert.ok(STAIR.half > (END_DOOR.half * zOf(topOfStair)) / zOf(beyond), 'a escada é mais estreita que o vão');
  // She stands on the stair hall's floor, past the reveal and before the first riser, in the moonlight.
  assert.ok(FIGURE.d > beyond + 20 && FIGURE.d < STAIR.foot - 20, 'a figura fica entre a porta do fundo e a escada');
  assert.ok(FIGURE.d > MOON_FLOOR.d0 && FIGURE.d < MOON_FLOOR.d1 && FIGURE.x > MOON_FLOOR.x0 && FIGURE.x < MOON_FLOOR.x1, 'a figura fica no luar');
  // Off the axis: the doorway's right jamb (the reveal's far face) hides her right shoulder, not her face.
  const jamb = (END_DOOR.half * zOf(FIGURE.d)) / zOf(beyond);
  assert.ok(FIGURE.x - FIGURE.shoulders < jamb && jamb < FIGURE.x + FIGURE.shoulders, 'a ombreira recorta o ombro da figura');
  assert.ok(FIGURE.x + 7 < jamb && FIGURE.x - FIGURE.hem > -jamb, 'o rosto e o lado esquerdo dela ficam à vista');
  assert.ok(FIGURE.height < apex, 'a figura é mais baixa que a porta');
});

test('Interior: as luzes do corredor ficam baixas ou nas laterais, e o fundo some na penumbra', () => {
  // The candles on the console are the brightest points of the corridor: flames and halos stay below the title band.
  for (const [x, h, d] of CANDELABRUM_WICKS) {
    const [, tip] = at(x, h + FLAME.tip, d);
    const [, halo] = at(x, h + FLAME.halo, d);
    assert.ok(halo > TITLE_ZONE.bottom && tip > halo, `halo da chama em y ${halo.toFixed(1)}, dentro da faixa do título`);
  }
  // The moonlit door stands at the side of the title band, not behind its middle.
  const middle = [TITLE_ZONE.left + (TITLE_ZONE.right - TITLE_ZONE.left) * 0.25, TITLE_ZONE.right - (TITLE_ZONE.right - TITLE_ZONE.left) * 0.25];
  for (const door of DOORS.filter((entry) => entry.ajar > 0)) {
    const leaf = openLeaf(door);
    const outline = [0, leaf.width].flatMap((u) => [0, leaf.height].map((h) => at(leaf.hinge.x + leaf.dir.x * u, h, leaf.hinge.d + leaf.dir.d * u)));
    const opening = [door.d0, door.d1].flatMap((d) => [0, door.height].map((h) => at(door.side * CORRIDOR.half, h, d)));
    for (const [x] of [...outline, ...opening]) assert.ok(x < middle[0]! || x > middle[1]!, `porta enluarada em x ${x.toFixed(0)}`);
  }
  // Every light of the corridor that reaches into the title band keeps off its axis in proportion to
  // what gets through the gloom, or is faint; warm light never enters the middle half, cold light
  // crosses it only faintly. Among them: the flames, the candle on the wall, on the vault and on the
  // first rib, the moonlit leaf, jamb and room, the figure and her image in the mirror, the moonlit
  // treads and their nosings.
  const names = CORRIDOR_LIGHTS.map((light) => light.name);
  for (const name of [
    'chama 1', 'vela na parede', 'vela na abóbada', 'filete da nervura', 'folha enluarada', 'ombreira enluarada', 'figura',
    'figura no espelho', 'degraus enluarados',
  ]) {
    assert.ok(names.includes(name), `falta a luz "${name}" na verificação`);
  }
  const quarter = (TITLE_ZONE.right - TITLE_ZONE.left) / 4;
  for (const light of CORRIDOR_LIGHTS) {
    const xs = light.points.map(([x]) => x);
    const ys = light.points.map(([, y]) => y);
    const crosses = Math.max(...xs) >= TITLE_ZONE.left && Math.min(...xs) <= TITLE_ZONE.right
      && Math.max(...ys) >= TITLE_ZONE.top && Math.min(...ys) <= TITLE_ZONE.bottom;
    if (!crosses) continue;
    const through = transmittance(light.depth);
    const strength = light.peak * through;
    const straddles = Math.min(...xs) < VP.x && Math.max(...xs) > VP.x;
    const offAxis = straddles ? 0 : Math.min(...xs.map((x) => Math.abs(x - VP.x)));
    const faint = strength <= TITLE_LIGHT_RULE.faint;
    assert.ok(offAxis >= TITLE_LIGHT_RULE.clearance * through || faint,
      `${light.name}: a ${offAxis.toFixed(0)} px do eixo com ${(strength * 100).toFixed(1)}% de luz`);
    if (light.kind === 'warm') assert.ok(offAxis >= quarter, `${light.name}: luz quente no meio da faixa do título`);
    if (offAxis < quarter) assert.ok(faint, `${light.name}: luz fria forte no meio da faixa do título`);
  }
  // The figure in particular: behind the middle of the band, so she is only ever faint.
  const figure = CORRIDOR_LIGHTS.find((light) => light.name === 'figura')!;
  assert.ok(figure.peak * transmittance(FIGURE.d) <= TITLE_LIGHT_RULE.faint, 'a figura brilha demais atrás do título');
  assert.ok(FIGURE_LIGHT.face < FIGURE_LIGHT.body && FIGURE_LIGHT.body <= 0.25, 'o rosto da figura não vira um ponto claro');
  // Gloom grows with depth, from nothing at the arch to most of the light at the end wall.
  assert.equal(gloomAt(CORRIDOR.start), 0);
  const samples = Array.from({length: 23}, (_, i) => gloomAt(CORRIDOR.start + i * 50));
  samples.slice(1).forEach((value, i) => assert.ok(value > samples[i]!, 'a penumbra cresce com a profundidade'));
  assert.ok(gloomAt(CORRIDOR.end) >= 0.45 && gloomAt(CORRIDOR.end) <= 0.75, `penumbra de ${gloomAt(CORRIDOR.end).toFixed(2)} no fundo`);
  // The figure is small and far: under a tenth of the frame's height, at the end of the corridor.
  const [, head] = at(FIGURE.x, FIGURE.height, FIGURE.d);
  const [, feet] = at(FIGURE.x, 0, FIGURE.d);
  assert.ok(feet - head > 60 && feet - head < HEIGHT / 10, `figura com ${(feet - head).toFixed(0)} px`);
});

test('Interior: as luzes do corredor seguem as intensidades e nunca clareiam o título com outra paleta', () => {
  // Tuned at the composition's defaults, which the reference repeats.
  const defaults = hauntedInteriorLoopSchema.parse({});
  assert.equal(LIGHT_REFERENCE.candle, defaults.candleIntensity);
  assert.equal(LIGHT_REFERENCE.moonlight, defaults.moonlightIntensity);
  assert.equal(LIGHT_REFERENCE.moonlightColor, defaults.colors[1]);
  assert.equal(LIGHT_REFERENCE.candleColor, defaults.colors[2]);
  assert.equal(lightScale(0.8, 0.8, '#CA8A48', '#CA8A48'), 1);
  assert.equal(lightScale(0, 0.8, '#CA8A48', '#CA8A48'), 0, 'velas apagadas não acendem o corredor');
  assert.ok(Math.abs(lightScale(0.4, 0.8, '#CA8A48', '#CA8A48') - 0.5) < 1e-12, 'a luz acompanha a intensidade');
  // Brighter settings or paler colours never push the corridor past the look it is tuned at.
  for (const intensity of [0, 0.3, 0.65, 0.8, 1]) {
    for (const color of ['#A8BDB0', '#E6F0FF', '#FFFFFF', '#FFB060', '#101010', 'red', 'rgb(250, 250, 250)', 'white', 'hsl(0, 0%, 100%)', '#ffff']) {
      const scale = lightScale(intensity, LIGHT_REFERENCE.moonlight, color, LIGHT_REFERENCE.moonlightColor);
      assert.ok(scale >= 0 && scale <= 1, `escala ${scale} para ${color} a ${intensity}`);
    }
  }
  assert.ok(lightScale(0.65, 0.65, '#E6F0FF', '#A8BDB0') < 0.8, 'um luar claro é contido pela luminância');
  assert.ok(Math.abs(lumaOf('#fff')! - 255) < 1e-9);
  assert.equal(lumaOf('rgba(0, 0, 0, 0.5)'), 0);
  // Every form the palette accepts is read, so a pale light in any notation is held down like its hex twin.
  for (const [color, hex] of [
    ['white', '#FFFFFF'], ['hsl(0, 0%, 100%)', '#FFFFFF'], ['#ffff', '#FFFFFF'], ['red', '#FF0000'],
    ['hsla(120, 50%, 50%, 0.5)', '#40BF40'], ['oklch(0.9 0.1 200)', '#87F2F8'],
  ] as const) {
    assert.ok(Math.abs(lumaOf(color)! - lumaOf(hex)!) < 1e-9, `luminância de ${color}`);
    for (const [intensity, reference, referenceColor] of [
      [LIGHT_REFERENCE.moonlight, LIGHT_REFERENCE.moonlight, LIGHT_REFERENCE.moonlightColor],
      [LIGHT_REFERENCE.candle, LIGHT_REFERENCE.candle, LIGHT_REFERENCE.candleColor],
    ] as const) {
      assert.equal(lightScale(intensity, reference, color, referenceColor), lightScale(intensity, reference, hex, referenceColor), `${color} contido como ${hex}`);
    }
  }
  for (const color of ['white', 'hsl(0, 0%, 100%)', '#ffff']) {
    assert.ok(lightScale(0.65, 0.65, color, LIGHT_REFERENCE.moonlightColor) < 0.75, `um luar ${color} é contido pela luminância`);
  }
  assert.equal(lumaOf('não é cor'), undefined);
  // The composition hands its intensities down: turning the candles off puts the corridor's flames out.
  const palette = {candle: '#CA8A48', moonlight: '#A8BDB0', atmosphere: '#536C68'};
  const corridor = (candleIntensity: number, moonlightIntensity: number) => renderToStaticMarkup(createElement('svg', null,
    createElement(HauntedCorridor, {...palette, candleIntensity, moonlightIntensity})));
  assert.equal(corridor(0.8, 0.65), corridor(1, 1), 'acima do padrão o corredor não clareia');
  assert.notEqual(corridor(0, 0.65), corridor(0.8, 0.65));
  assert.notEqual(corridor(0.8, 0), corridor(0.8, 0.65));
  assert.ok(/<g opacity="0">/.test(corridor(0, 0.65)), 'as chamas se apagam com candleIntensity 0');
  const hall = renderToStaticMarkup(createElement('svg', null, createElement(HauntedInteriorArchitecture, {
    ...palette, transparent: false, candleIntensity: 0, moonlightIntensity: 0.65,
  })));
  assert.ok(/<g opacity="0">/.test(hall), 'o salão repassa as intensidades ao corredor');
});

test('Interior: o espelho sobre o console reflete o fundo do corredor, o relógio e a figura no vidro', () => {
  // Mirror the figure across the left wall's plane; where the line from the eye to that image crosses
  // the wall is where she shows in the glass.
  const wall = -CORRIDOR.half;
  const glass = {d0: MIRROR.d0 + 8, d1: MIRROR.d1 - 8, h0: MIRROR.h0 + 8, h1: MIRROR.h1 - 8};
  const eyeZ = BACK_Z * 100;
  for (const h of [FIGURE.height - 10, 120, 100]) {
    const image = {x: 2 * wall - FIGURE.x, z: eyeZ + FIGURE.d};
    const t = wall / image.x;
    const d = image.z * t - eyeZ;
    const height = EYE + (h - EYE) * t;
    assert.ok(d > glass.d0 && d < glass.d1 && height > glass.h0 && height < glass.h1, `reflexo em ${d.toFixed(0)} cm, ${height.toFixed(0)} cm`);
    // Nearer the arch than the clock's image, which fills the deeper part of the glass.
    assert.ok(d < MIRROR_CLOCK_EDGE, `o relógio encobre o reflexo em ${d.toFixed(0)} cm`);
    // The reflected ray, from the glass to her, clears the clock and passes the end door.
    const along = (depth: number) => wall + (FIGURE.x - wall) * (depth - d) / (FIGURE.d - d);
    assert.ok(along(CLOCK.d0) > CLOCK.x1, 'o raio refletido bate no relógio');
    for (const depth of [CORRIDOR.end, CORRIDOR.end + END_DOOR.reveal]) {
      assert.ok(Math.abs(along(depth)) < END_DOOR.half, 'o raio refletido passa pela porta do fundo');
    }
  }
  // The clock's image starts inside the glass: the image of its inner near corner, mirrored across the wall.
  assert.ok(MIRROR_CLOCK_EDGE > glass.d0 + 20 && MIRROR_CLOCK_EDGE < glass.d1 - 20, `o relógio aparece no vidro a partir de ${MIRROR_CLOCK_EDGE.toFixed(0)} cm`);
  const corner = {x: 2 * wall - CLOCK.x1, z: eyeZ + CLOCK.d0};
  assert.ok(Math.abs((corner.z * wall) / corner.x - eyeZ - MIRROR_CLOCK_EDGE) < 1e-9);
});

test('Interior: o corredor é estático, segue a paleta e some sobre o jogo', () => {
  const palette = {candle: '#C2410C', moonlight: '#7DD3FC', atmosphere: '#4C1D95'};
  // It renders outside any Remotion composition: nothing in it reads the frame.
  const markup = renderToStaticMarkup(createElement('svg', null, createElement(HauntedCorridor, palette)));
  assert.equal(markup, renderToStaticMarkup(createElement('svg', null, createElement(HauntedCorridor, palette))), 'o corredor é determinístico');
  assert.ok(!/<animate|<set |animation|transition/i.test(markup), 'o corredor não tem animação');
  for (const color of Object.values(palette)) assert.ok(markup.includes(color), `a cor ${color} da paleta não chega ao corredor`);
  const other = renderToStaticMarkup(createElement('svg', null, createElement(HauntedCorridor, {candle: '#111111', moonlight: '#222222', atmosphere: '#333333'})));
  for (const color of Object.values(palette)) assert.ok(!other.includes(color), 'o corredor não fixa as cores da paleta');
  // In the opaque hall it lies behind the arch; over gameplay (transparent) it is not drawn at all.
  const hall = (transparent: boolean) => renderToStaticMarkup(createElement('svg', null,
    createElement(HauntedInteriorArchitecture, {...palette, transparent})));
  assert.ok(hall(false).includes('hi-cor-gloom') && hall(false).includes('hi-cor-threshold'), 'o corredor aparece no salão opaco');
  assert.ok(!hall(true).includes('hi-cor-'), 'o corredor aparece sobre o jogo');
});

/* --------------------------------------------------------------------------- luar e relâmpagos */

const STORM_SEEDS = [-2026, -7, 0, 1, 2, 42, 113, 999, 2026, 31337];
const STORM_DURATIONS = [1.2, 1.51, 1.6, 2.4, 2.99, 3, 3.7, 4.375, 7.3333, 8, 12.25, 16, 17.77, 30];
/**
 * How far from the seam the strikes keep, in seconds: at least 0.3 s, or 5% of the cycle. Fixed here,
 * not read from LIGHTNING, so the check holds whatever the code under test sets its margins to.
 */
const SEAM_CLEARANCE = (cycle: number) => Math.max(0.3, 0.05 * cycle);
/** The least time between the starts of two strikes, across the seam as well: two flashes each, so no second holds more than two. */
const STRIKE_SPACING = 1.5;
/**
 * How many strikes a cycle holds, the documented rule: two from 3 s, one from 1.5 s, none below.
 * Fixed here, not read from LIGHTNING, so the count is checked against what is promised.
 */
const STRIKES_PER_CYCLE = (cycle: number) => (cycle >= 3 ? 2 : cycle >= 1.5 ? 1 : 0);
type Strikes = ReturnType<typeof getLightningStrikes>;
/** The brighter window's flash `t` seconds into the cycle, at full intensity. */
const flashAt = (strikes: Strikes, t: number) =>
  Math.max(0, ...strikes.map((strike) => getStrikeEnvelope(strike, t - strike.start).flash));
/** Times and heights of the flashes of one cycle: maxima that stand at least 0.1 above the dips on both sides. */
const flashPeaks = (strikes: Strikes, cycle: number, step = 0.002) => {
  const samples = Array.from({length: Math.ceil(cycle / step) + 1}, (_, i) => flashAt(strikes, Math.min(cycle, i * step)));
  const peaks: {t: number; value: number}[] = [];
  samples.forEach((value, i) => {
    if (i === 0 || i === samples.length - 1 || !(value > samples[i - 1]! && value >= samples[i + 1]!)) return;
    const dip = (direction: number) => {
      let low = value;
      for (let k = i + direction; k >= 0 && k < samples.length && samples[k]! <= value; k += direction) low = Math.min(low, samples[k]!);
      return low;
    };
    if (value - Math.max(dip(-1), dip(1)) >= 0.1) peaks.push({t: i * step, value});
  });
  return peaks;
};
/** The most flashes seen in any one second, the cycle repeating. */
const flashesPerSecond = (peaks: readonly {t: number}[], cycle: number) => {
  const times = [...peaks.map(({t}) => t), ...peaks.map(({t}) => t + cycle)];
  return Math.max(0, ...peaks.map(({t}) => times.filter((other) => other >= t && other < t + 1).length));
};
const recedesToVP = (a: Point, b: Point) =>
  Math.abs((a[0] - VP.x) * (b[1] - VP.y) - (a[1] - VP.y) * (b[0] - VP.x)) / Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6;
const spanOf = (points: readonly Point[]) => Math.max(...points.flatMap((a) => points.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))));

test('Interior: relâmpagos ficam longe da emenda, em qualquer seed e duração', () => {
  for (const seed of STORM_SEEDS) {
    for (const durationSeconds of STORM_DURATIONS) {
      const strikes = getLightningStrikes({seed, durationSeconds});
      const clearance = SEAM_CLEARANCE(durationSeconds);
      // Near the seam the flash and the bolt are exactly zero: phase 0 matches frame N in position and speed.
      for (let t = 0; t <= clearance; t += 0.001) {
        for (const at of [t, durationSeconds - t]) {
          for (const strike of strikes) {
            assert.deepEqual(getStrikeEnvelope(strike, at - strike.start), {flash: 0, bolt: 0},
              `seed ${seed}, ${durationSeconds} s: relâmpago em ${strike.start.toFixed(2)} s aceso a ${at.toFixed(3)} s, junto à emenda`);
          }
        }
      }
      for (const outputFormat of ['webm', 'gif'] as const) {
        const props = hauntedInteriorLoopSchema.parse({seed, durationSeconds, outputFormat, lightningIntensity: 1});
        const {durationInFrames: length} = getCompositionMetadata(props);
        // Every frame within the clearance of the seam, on either side, in the cycle's own seconds.
        const nearSeam = Array.from({length}, (_, frame) => frame).filter((frame) => {
          const t = (frame / length) * durationSeconds;
          return t <= clearance || t >= durationSeconds - clearance;
        });
        assert.ok(nearSeam.length >= 2, `seed ${seed}, ${durationSeconds} s: ${nearSeam.length} frames junto à emenda`);
        for (const frame of nearSeam) {
          for (const light of pick(getHauntedInteriorScene(props, frame, length), 'lightning')) {
            assert.ok(light.opacity === 0 && light.glow === 0, `seed ${seed}, ${durationSeconds} s: clarão no frame ${frame}, junto à emenda`);
          }
        }
      }
    }
  }
  // Outside a strike the envelope is exactly zero, and it never leaves 0–1.
  const [strike] = getLightningStrikes({seed: 113, durationSeconds: 16});
  assert.ok(strike);
  for (const t of [-1, -1e-9, 0, LIGHTNING.length, LIGHTNING.length + 1e-9, 5]) assert.deepEqual(getStrikeEnvelope(strike, t), {flash: 0, bolt: 0});
  for (let t = 0; t < LIGHTNING.length; t += 0.001) {
    const {flash, bolt} = getStrikeEnvelope(strike, t);
    assert.ok(flash >= 0 && flash <= 1 && bolt >= 0 && bolt <= 1);
  }
});

test('Interior: nunca mais de três clarões em um segundo', () => {
  for (const seed of STORM_SEEDS) {
    for (const durationSeconds of STORM_DURATIONS) {
      const peaks = flashPeaks(getLightningStrikes({seed, durationSeconds}), durationSeconds);
      assert.ok(flashesPerSecond(peaks, durationSeconds) <= 3, `seed ${seed}, ${durationSeconds} s: ${flashesPerSecond(peaks, durationSeconds)} clarões em 1 s`);
    }
  }
  // Many more seeds, over the cycles where the two strikes come closest (and the default one).
  for (let seed = 1; seed <= 500; seed++) {
    for (const durationSeconds of [3, 3.7, 4.375, 16]) {
      const peaks = flashPeaks(getLightningStrikes({seed, durationSeconds}), durationSeconds, 0.004);
      assert.ok(flashesPerSecond(peaks, durationSeconds) <= 3, `seed ${seed}, ${durationSeconds} s: ${flashesPerSecond(peaks, durationSeconds)} clarões em 1 s`);
    }
  }
  // The frames a render shows keep to the same limit: count the peaks of the rendered flash, frame by frame.
  const props = hauntedInteriorLoopSchema.parse({lightningIntensity: 1});
  const {durationInFrames: length, fps} = getCompositionMetadata(props);
  const flash = Array.from({length}, (_, frame) => Math.max(...pick(getHauntedInteriorScene(props, frame, length), 'lightning').map((light) => light.opacity)));
  const peaks = flash.flatMap((value, i) => value > 0.1 && value > flash[(i + length - 1) % length]! && value >= flash[(i + 1) % length]! ? [i / fps] : []);
  assert.ok(peaks.length >= 4 && flashesPerSecond(peaks.map((t) => ({t})), length / fps) <= 3, `${peaks.length} clarões nos frames`);
});

test('Interior: dois relâmpagos por ciclo, cada um com um clarão, um segundo clarão e uma cauda curta', () => {
  for (const seed of STORM_SEEDS) {
    for (const durationSeconds of STORM_DURATIONS) {
      const strikes = getLightningStrikes({seed, durationSeconds});
      const expected = STRIKES_PER_CYCLE(durationSeconds);
      assert.equal(strikes.length, expected, `seed ${seed}, ${durationSeconds} s`);
      if (durationSeconds >= 3.7) assert.equal(strikes.length, 2, 'dois relâmpagos por ciclo');
      const peaks = flashPeaks(strikes, durationSeconds);
      assert.equal(peaks.length, 2 * strikes.length, `seed ${seed}, ${durationSeconds} s: ${peaks.length} clarões`);
      strikes.forEach((strike, index) => {
        const [main, second] = peaks.filter(({t}) => t > strike.start && t < strike.start + LIGHTNING.length);
        assert.ok(main && second, 'cada relâmpago tem dois clarões');
        assert.ok(main.t - strike.start < 0.1 && main.value > 0.95, 'o primeiro clarão é rápido e forte');
        // The bolt is at full strength while the sky it lights is still dim: that is what reads as a bolt.
        const early = getStrikeEnvelope(strike, 0.012);
        assert.ok(early.bolt > 0.99 && early.flash < 0.5, `o raio chega antes do céu (raio ${early.bolt.toFixed(2)}, céu ${early.flash.toFixed(2)})`);
        assert.ok(second.t - main.t >= 0.13 && second.t - main.t <= 0.27 && second.value < main.value, 'o segundo clarão vem 150–250 ms depois, mais fraco');
        // A strike is over within LIGHTNING.length (0.8 s): the tail fades out.
        assert.ok(LIGHTNING.length <= 0.8 && flashAt([strike], strike.start + LIGHTNING.length - 0.05) < 0.02, 'a cauda se apaga');
        // Strikes sit in different halves, well apart, across the seam as well.
        const next = strikes[(index + 1) % strikes.length]!;
        const gap = (next.start - strike.start + durationSeconds) % durationSeconds || durationSeconds;
        assert.ok(gap >= STRIKE_SPACING - 1e-9, `seed ${seed}, ${durationSeconds} s: relâmpagos a ${gap.toFixed(2)} s um do outro`);
      });
      if (strikes.length === 2) assert.notEqual(strikes[0]!.side, strikes[1]!.side, 'cada janela mostra um dos raios');
    }
  }
  // Right at the thresholds, over many seeds: none at 1.49 s, one from 1.5 s up to 2.99 s, two from 3 s on.
  for (const [durationSeconds, count] of [[1.49, 0], [1.5, 1], [2.99, 1], [3, 2], [3.01, 2], [3.6, 2], [16, 2]] as const) {
    assert.equal(STRIKES_PER_CYCLE(durationSeconds), count);
    for (let seed = 1; seed <= 50; seed++) {
      const strikes = getLightningStrikes({seed, durationSeconds});
      assert.equal(strikes.length, count, `seed ${seed}, ${durationSeconds} s: ${strikes.length} relâmpagos, e não ${count}`);
    }
  }
});

test('Interior: os clarões nascem nas janelas, fora da área de conteúdo, e as duas clareiam juntas', () => {
  const glass = leftWall(-WINDOW.reveal);
  const outline = windowGlassOutline().map(([u, v]) => glass(u, v));
  assert.ok(pointInPolygon(LIGHTNING_ANCHORS[0]!, outline) && pointInPolygon(mirror(LIGHTNING_ANCHORS[1]!), outline), 'o clarão fica no vidro');
  for (const [x, y] of LIGHTNING_ANCHORS) assert.ok(outsideContent(x, y, 60), 'o clarão fica longe da área de conteúdo');
  for (const seed of [1, 113, 2026]) {
    const props = hauntedInteriorLoopSchema.parse({seed});
    let flashes = 0;
    for (let frame = 0; frame < 960; frame++) {
      const [left, right] = pick(getHauntedInteriorScene(props, frame, 960), 'lightning');
      assert.ok(left && right);
      assert.deepEqual([[left.x, left.y], [right.x, right.y]], LIGHTNING_ANCHORS);
      assert.equal(left.opacity > 0, right.opacity > 0, `frame ${frame}: as janelas clareiam juntas`);
      assert.ok(!(left.glow > 0 && right.glow > 0), `frame ${frame}: o raio aparece numa janela só`);
      for (const light of [left, right]) assert.ok(light.glow === 0 || light.opacity > 0, 'o raio só aparece no clarão');
      if (left.opacity > 0) flashes++;
    }
    // Brief: the flashes light a small share of the loop.
    assert.ok(flashes > 20 && flashes < 120, `seed ${seed}: ${flashes} frames com clarão`);
  }
  // Each window's broken quarry is redrawn over the flash, so the glass does not mend while it lasts.
  assert.equal(LANCET.broken.length, 2);
  for (const {hole, cracks} of LANCET.broken) {
    const points = flattenPath(hole).flatMap((path) => path.points);
    assert.ok(points.length >= 8 && cracks.length > 0);
    for (const point of points) assert.ok(pointInPolygon(point, outline), 'o buraco fica no vidro');
  }
  // Over gameplay the flashes stay on the walls and strips kept there, off the content box.
  const core = flattenPath(RETAINED_CORE).flatMap(({points}) => points);
  assert.ok(core.length >= 16);
  for (const [x, y] of core) {
    assert.ok(x <= CONTENT_BOX.left + 1e-6 || x >= CONTENT_BOX.right - 1e-6 || y >= CONTENT_BOX.bottom - 1e-6, `miolo mantido em ${x.toFixed(1)},${y.toFixed(1)}`);
  }
});

test('Interior: a poça de luar fica no piso, e as bordas paralelas às paredes vão ao ponto de fuga', () => {
  assert.ok(MOON_POOL_PANES.length >= 6, 'as duas luzes, cortadas pelas travessas, e o óculo');
  let receding = 0;
  for (const pane of MOON_POOL_PANES) {
    for (const [i, [x, z]] of pane.entries()) {
      assert.ok(x > -HALL.halfWidth && x < 0 && z > FRAME_Z && z < BACK_Z, `luz fora do piso visível em ${x.toFixed(2)}, ${z.toFixed(2)} m`);
      // Seen through the one camera, the point is where the floor plane shows it.
      const [sx, sy] = project(x, 0, z);
      const depth = (FOCAL * HALL.eye) / (sy - VP.y);
      assert.ok(Math.abs(depth - z) < 1e-9 && Math.abs(((sx - VP.x) * depth) / FOCAL - x) < 1e-9);
      assert.ok(sy > CONTENT_BOX.bottom && sy < HEIGHT && sx > 0 && sx < POOL_REACH_X, `poça em ${sx.toFixed(0)},${sy.toFixed(0)}`);
      const [nx, nz] = pane[(i + 1) % pane.length]!;
      if (Math.abs(nx - x) < 1e-9 && Math.abs(nz - z) > 0.01) {
        assert.ok(recedesToVP([sx, sy], project(nx, 0, nz)), 'borda paralela à parede fora do ponto de fuga');
        receding++;
      }
    }
  }
  assert.ok(receding >= 6, `só ${receding} bordas paralelas às paredes`);
});

test('Interior: a pegada da lanceta mede 2,5–3,5 m; as duas luzes acendem ≈ 2,3 m do piso e o óculo leva a luz a ≈ 2,5 m', () => {
  // The brief's 2.5–3.5 m is the lancet's footprint, cast along MOON_DIRECTION (its stone tip casts
  // only shadow). What reads as the pool is the light of the two lights, from the first pane past
  // the ledge's shade, about 1.4 m out from the wall: about 2.3 m. It cannot reach 2.5 m while the
  // pool, halo included, keeps short of x 760 and of the frame's bottom (checked below); 2.25 m is
  // its floor. The roundel's small spot, apart beyond the lights' tips, carries the lit floor on to
  // about 2.5 m.
  const lights = MOON_POOL_LIGHTS.flat();
  const lit = MOON_POOL_PANES.flat();
  assert.equal(MOON_POOL_PANES.length, MOON_POOL_LIGHTS.length + 1, 'as vidraças das duas luzes e o óculo');
  assert.ok(spanOf(lights) >= 2.25 && spanOf(lights) < 2.5, `as duas luzes acendem ${spanOf(lights).toFixed(2)} m do piso`);
  assert.ok(spanOf(lit) >= 2.5 && spanOf(lit) - spanOf(lights) < 0.3, `com o óculo, ${spanOf(lit).toFixed(2)} m`);
  const lancet = windowGlassOutline().map(([u, v]) => moonOnFloor(u, v));
  assert.ok(spanOf(lancet) >= spanOf(lit) && spanOf(lancet) >= 2.5 && spanOf(lancet) <= 3.5, `a pegada da lanceta mede ${spanOf(lancet).toFixed(2)} m`);
  const xs = lit.map(([x]) => x);
  const zs = lit.map(([, z]) => z);
  assert.ok(Math.min(...xs) + HALL.halfWidth < 1.5, 'a poça começa perto da parede');
  assert.ok(Math.max(...xs) - Math.min(...xs) > 1.2 && Math.max(...zs) - Math.min(...zs) > 1.2, 'a poça corre na diagonal');
  // On screen the lit pool, its halo included, stops short of POOL_REACH_X (the right one, mirrored)
  // and of the bottom of the frame.
  for (const [x, y] of LIT_POOL) {
    assert.ok(x + POOL_GLOW < POOL_REACH_X && mirror([x, y])[0] - POOL_GLOW > WIDTH - POOL_REACH_X, `a poça chega ao eixo em x ${x.toFixed(0)}`);
    assert.ok(y > CONTENT_BOX.bottom && y + POOL_GLOW < HEIGHT, 'a poça fica no piso, dentro do quadro');
  }
  // The light arrives in a cone: the farther it falls, the more it spreads, so the far end is softer.
  const spread = (v: number) => spanOf(moonDirections(64).map((direction) => castOnFloor(WINDOW.u, v, -WINDOW.reveal, direction)));
  const [low, high] = [spread(WINDOW.sill + 30), spread(WINDOW.spring + 50)];
  assert.ok(low > 0.03 && low < 0.1, `penumbra de ${(low * 100).toFixed(1)} cm junto à parede`);
  assert.ok(high / low > 1.8, `a penumbra cresce de ${(low * 100).toFixed(1)} para ${(high * 100).toFixed(1)} cm`);
});

/** A point of the ray from the glass (u, v in the left wall's elevation, cm) to its lit point on the floor, `t` of the way down, on screen. */
const alongRay = ([u, v]: Point, [x, z]: Point, t: number): Point => {
  const glassX = -HALL.halfWidth - WINDOW.reveal / 100;
  return project(glassX + (x - glassX) * t, (v / 100) * (1 - t), BACK_Z - u / 100 + (z - (BACK_Z - u / 100)) * t);
};
const insideBox = ([x, y]: Point) => x > CONTENT_BOX.left && x < CONTENT_BOX.right && y > CONTENT_BOX.top && y < CONTENT_BOX.bottom;

test('Interior: vidro, feixe e poça se alinham ao longo de MOON_DIRECTION, e o feixe visível chega à poça', () => {
  const glass = leftWall(-WINDOW.reveal);
  const anchor = [WINDOW.u, WINDOW.spring + 30] as const;
  assert.ok(near(MOON_SHAFT_AXIS.from, MOON_ANCHORS[0]!) && near(MOON_SHAFT_AXIS.from, glass(...anchor)), 'o feixe parte do vidro');
  const [ax, az] = moonOnFloor(...anchor);
  assert.ok(near(MOON_SHAFT_AXIS.to, project(ax, 0, az)), 'o eixo do feixe chega onde o vidro cai no piso');
  const glassX = -HALL.halfWidth - WINDOW.reveal / 100;
  for (const [u, v] of windowGlassOutline()) {
    // In the hall, the step from the glass to its landing on the floor is MOON_DIRECTION, per metre of drop.
    const [x, z] = moonOnFloor(u, v);
    const drop = v / 100;
    assert.ok(Math.abs((x - glassX) / drop - MOON_DIRECTION.x) < 1e-9 && Math.abs((z - (BACK_Z - u / 100)) / drop - MOON_DIRECTION.z) < 1e-9);
  }
  // Traced back against the light, every lit point of the pool comes from the lancet's glass, and the
  // ray between them lies within the shaft, which is built from exactly these rays.
  const rays = MOON_POOL_PANES.flat().map((point) => {
    const drop = (point[0] - glassX) / MOON_DIRECTION.x;
    const source: Point = [(BACK_Z - point[1] + MOON_DIRECTION.z * drop) * 100, drop * 100];
    assert.ok(near(glassSourceOf(point), source, 1e-9), 'glassSourceOf refaz o raio de luz');
    assert.ok(distanceToPolygon(source, windowGlassOutline()) < 1e-6, `luz sem vidro em ${source[0].toFixed(0)}, ${source[1].toFixed(0)} cm`);
    return {source, point};
  });
  for (const {source, point} of rays) {
    for (let t = 0; t <= 1; t += 0.125) {
      const onScreen = alongRay(source, point, t);
      assert.ok(distanceToPolygon(onScreen, MOON_SHAFT_POINTS) < 0.5, `o raio sai do feixe em ${onScreen.map(Math.round)}`);
    }
  }
  // Only lit glass feeds the shaft: none of it comes from the glass the ledge shades or from the stone tip.
  const litHeights = rays.map(({source}) => source[1]);
  assert.ok(Math.min(...litHeights) > WINDOW.sill + 10 && Math.max(...litHeights) < WINDOW.spring + archRise(WINDOW.half, WINDOW.c) - 20);
  // What is drawn of it: the mask fades the shaft out towards the content box (zero on its edge, so no
  // hard cut at x 410) and lets it through again below it. The rays from the lowest lit glass that keep
  // out of the box stay in view all the way down, and each lands on the floor at full strength.
  const lowest = rays.filter(({source}) => source[1] < Math.min(...litHeights) + 10);
  assert.ok(lowest.length >= 3, 'raios da vidraça acesa mais baixa');
  const samplesOf = ({source, point}: (typeof rays)[number]) => Array.from({length: 65}, (_, i) => alongRay(source, point, i / 64));
  for (const ray of lowest) {
    const samples = samplesOf(ray);
    for (const sample of samples.filter((entry) => !insideBox(entry))) {
      assert.ok(shaftVisibility(sample) > 0, `o feixe some fora da área de conteúdo em ${sample.map(Math.round)}`);
    }
    assert.ok(shaftVisibility(samples[64]!) > 0.8, `o feixe chega fraco à poça em ${samples[64]!.map(Math.round)}`);
  }
  // The one nearest the camera passes left of the box and below it, and stays clearly in view.
  const nearest = samplesOf(lowest.reduce((a, b) => (b.source[0] > a.source[0] ? b : a)));
  assert.ok(!nearest.some(insideBox), 'o raio de baixo mais próximo da câmera passa pela área de conteúdo');
  assert.ok(Math.min(...nearest.map(shaftVisibility)) > 0.3, 'o raio de baixo mais próximo da câmera segue visível até o piso');
  // Where the beam's axis meets the floor, below the box, the mask lets all of it through; on the
  // box's edges it lets nothing through.
  assert.equal(shaftVisibility(MOON_SHAFT_AXIS.to), 1);
  for (const edge of [[CONTENT_BOX.left, CONTENT_BOX.top], [CONTENT_BOX.left, 600], [600, CONTENT_BOX.bottom]] as const) {
    assert.equal(shaftVisibility(edge), 0);
  }
  assert.ok(shaftVisibility([CONTENT_BOX.left - SHAFT_FADE, 500]) === 1 && shaftVisibility([600, CONTENT_BOX.bottom + SHAFT_FADE]) === 1);
  // The shaft stays put, as the glass and the pool do: it breathes in opacity only, so where it lands
  // never slides across the pool's edges.
  const props = hauntedInteriorLoopSchema.parse({});
  for (const frame of FRAMES) {
    for (const light of pick(getHauntedInteriorScene(props, frame, 960), 'moonlight')) assert.equal(light.rotation, 0, `frame ${frame}: o feixe gira`);
  }
});

test('Interior: o raio e seus galhos ficam atrás da parte visível de uma das luzes, em trechos retos com dobras vivas', () => {
  // The near light is partly hidden by the near jamb of the wall's opening; the far one shows whole.
  const [far, closer] = LANCET.spans;
  assert.ok(Math.abs(closer[0] - leftWall()(WINDOW.u + WINDOW.half, WINDOW.sill)[0]) < 1e-9, 'o batente esconde a luz da frente');
  assert.ok(closer[1] - closer[0] < far[1] - far[0] && closer[1] <= far[0], 'as duas luzes, lado a lado');
  const glass = leftWall(-WINDOW.reveal);
  const used = [0, 0];
  let [branched, swings] = [0, 0];
  for (let seed = 1; seed <= 300; seed++) {
    for (const strike of getLightningStrikes({seed, durationSeconds: 16})) {
      const points = getLightningBoltPoints(strike);
      // The whole channel keeps 3 px inside the visible glass of one light: none of it runs behind stone.
      const span = LANCET.spans.findIndex(([a, b]) => points.every(([x]) => x >= a + 3 - 1e-9 && x <= b - 3 + 1e-9));
      assert.ok(span >= 0, `seed ${seed}: o raio passa por trás do batente ou da pedra`);
      used[span]!++;
      // It runs down the whole glass, from above the lights to below the sill's treeline.
      assert.ok(points.every((p, i) => i === 0 || p[1] > points[i - 1]![1]), 'o raio sempre desce');
      assert.ok(points[0]![1] < glass(WINDOW.u, WINDOW.spring + archRise(WINDOW.half, WINDOW.c))[1]);
      assert.ok(points[points.length - 1]![1] >= glass(WINDOW.u, WINDOW.sill + 10)[1]);
      // Angular: many sharp changes of heading, not a smooth wave.
      const kinksOf = (line: readonly Point[]) => {
        const headings = line.slice(1).map((p, i) => Math.atan2(p[0] - line[i]![0], p[1] - line[i]![1]));
        return headings.slice(1).filter((h, i) => Math.abs(h - headings[i]!) > 0.35).length;
      };
      assert.ok(kinksOf(points) >= 8, `seed ${seed}: só ${kinksOf(points)} dobras no raio`);
      // Straight runs between the kinks, not a string of short bends that the glow rounds into an S:
      // several segments of 15 px or more.
      const runs = points.slice(1).filter((p, i) => Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]) >= 15).length;
      assert.ok(runs >= 4, `seed ${seed}: só ${runs} trechos retos longos no raio`);
      // No stretch crosses the light from one edge to the other: in a light 20–25 px wide, long
      // diagonals bouncing between the edges read as a drawn zigzag, not as a lightning channel. Each
      // stretch moves sideways by at most half the width the channel may use.
      const [a, b] = LANCET.spans[span]!;
      const sideways = Math.max(...points.slice(1).map((p, i) => Math.abs(p[0] - points[i]![0])));
      assert.ok(sideways <= (b - a - 6) / 2 + 1e-9, `seed ${seed}: um trecho de ${sideways.toFixed(1)} px cruza a luz de ${(b - a - 6).toFixed(1)} px`);
      // One or two branches leave the upper trunk and fork down the same light, as jagged as the trunk,
      // not as a smooth streak: sharp kinks, and a lean to one side that now and then swings back.
      const branches = getLightningBoltBranches(strike);
      assert.ok(branches.length >= 1 && branches.length <= 2, `seed ${seed}: ${branches.length} galhos`);
      for (const branch of branches) {
        assert.ok(points.some((point) => near(point, branch[0]!)), 'o galho sai do tronco');
        assert.ok(branch.every(([x], i) => x >= a + 3 - 1e-9 && x <= b - 3 + 1e-9 && (i === 0 || branch[i]![1] > branch[i - 1]![1])), 'o galho desce na mesma luz');
        assert.ok(branch.length >= 7 && kinksOf(branch) >= 2, `seed ${seed}: galho liso, com ${kinksOf(branch)} dobras`);
        // It drifts one way and fades, with no bounce from edge to edge: its sideways steps of half the
        // channel's reach or more all go the same way. Branches that swung back and forth across the
        // narrow light in steps of 7–14 px stacked up into brackets (⊏⊐) that read as a scribble.
        const wide = branch.slice(1).map((p, i) => p[0] - branch[i]![0]).filter((dx) => Math.abs(dx) >= (b - a - 6) / 4);
        assert.ok(wide.every((dx) => Math.sign(dx) === Math.sign(wide[0]!)), `seed ${seed}: galho vai e volta (${wide.map((dx) => dx.toFixed(1)).join(', ')})`);
        // Steps out are kept shorter than that (0.4 of the reach), so only steps back can be that wide,
        // and those all go the same way: alone, the check above lets a branch swing back in long
        // strides. So measure it against the side it drifts to, the more open side of the light where
        // it leaves the trunk: no step goes back by more than 3 px, and the branch never falls back more
        // than 6 px (two such steps) from the farthest it has reached.
        const open = branch[0]![0] <= (a + b) / 2 ? 1 : -1;
        const along = branch.map(([x]) => (x - branch[0]![0]) * open);
        const stepBack = Math.max(0, ...along.slice(1).map((s, i) => along[i]! - s));
        const fallBack = Math.max(...along.map((s, i) => Math.max(...along.slice(0, i + 1)) - s));
        assert.ok(stepBack <= 3 && fallBack <= 6, `seed ${seed}: o galho volta ${stepBack.toFixed(1)} px num passo e ${fallBack.toFixed(1)} px do ponto mais aberto`);
      }
      branched += branches.length;
      swings += branches.filter((branch) => {
        const steps = branch.slice(1).map((p, i) => p[0] - branch[i]![0]).filter((dx) => Math.abs(dx) > 0.5);
        return steps.some((dx) => dx > 0) && steps.some((dx) => dx < 0);
      }).length;
    }
  }
  assert.ok(used[0]! >= 20 && used[1]! >= 20, `raios nas luzes: ${used.join(' e ')}`);
  assert.ok(swings > 0.8 * branched, `só ${swings} de ${branched} galhos mudam de lado alguma vez`);
});

type MarkupNode = {tag: string; attrs: string; parent?: MarkupNode};
/** The elements of a rendered SVG, each with its parent, for the clip checks below. */
const elementsOf = (markup: string) => {
  const nodes: MarkupNode[] = [];
  const stack: MarkupNode[] = [];
  for (const [, close, tag, attrs, selfClosing] of markup.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g)) {
    if (close) {
      stack.pop();
      continue;
    }
    const node: MarkupNode = {tag: tag!, attrs: attrs!, parent: stack[stack.length - 1]};
    nodes.push(node);
    if (!selfClosing) stack.push(node);
  }
  assert.equal(stack.length, 0, 'marcação bem formada');
  return nodes;
};
const ancestry = (node: MarkupNode) => {
  const chain: MarkupNode[] = [];
  for (let current: MarkupNode | undefined = node; current; current = current.parent) chain.push(current);
  return chain;
};
const clipsOf = (node: MarkupNode) => ancestry(node).flatMap((entry) => /clip-path="url\(#([\w-]+)\)"/.exec(entry.attrs)?.[1] ?? []);
/** Every layer of light the composition draws: moonlight and lightning, pool, shaft, glass, bolt, washes and the candelabra's rim. */
const LIGHT_LAYER = /url\(#hi-(?:flash|bolt|pool|beam|candelabra-rim|sky-glow|storm-pool)|href="#hi-pool"/;
const pictureMarkup = (props: HauntedInteriorLoopProps, frame: number, dark = false) => {
  const scene = getHauntedInteriorScene(props, frame, 960);
  return renderToStaticMarkup(createElement(HauntedInteriorPicture, dark
    ? {props, scene: scene.map((entry) => (entry.kind === 'lightning' ? {...entry, opacity: 0, glow: 0} : entry))}
    : {props, scene, strike: getActiveStrike(props, frame, 960)}));
};
const outsideTheBox = (d: string) => flattenPath(d).flatMap(({points}) => points).every(([x, y]) =>
  x <= CONTENT_BOX.left + 1e-6 || x >= CONTENT_BOX.right - 1e-6 || y >= CONTENT_BOX.bottom - 1e-6);

test('Interior: o quadro renderizado — sem relâmpago com intensidade 0, e cada luz recortada fora da área de conteúdo', () => {
  const strikes = getLightningStrikes(hauntedInteriorLoopSchema.parse({}));
  const strikeFrames = strikes.flatMap((strike) => Array.from({length: 16}, (_, i) => Math.ceil(strike.start * 60) + i * 3));
  // lightningIntensity 0: every frame of a strike renders exactly as a frame with no strike at all, the
  // lightning's bolt envelope (glow) included; with the default intensity the same frames do change.
  const off = hauntedInteriorLoopSchema.parse({lightningIntensity: 0});
  const on = hauntedInteriorLoopSchema.parse({});
  for (const frame of strikeFrames) {
    assert.ok(getActiveStrike(off, frame, 960), `frame ${frame} cai num relâmpago`);
    assert.equal(pictureMarkup(off, frame), pictureMarkup(off, frame, true), `frame ${frame}: relâmpago com intensidade 0`);
  }
  for (const frame of FLASH_FRAMES) assert.notEqual(pictureMarkup(on, frame), pictureMarkup(on, frame, true), `frame ${frame}: sem clarão`);
  // Every light layer, in every flash frame, sits under a clip that keeps it off the content box: over
  // the opaque hall, out of the box or on the walls, floor and glazing; over gameplay, only on the core
  // of the surfaces kept there (their edges never change alpha), on the velvet and its gold tie-backs,
  // which hang on that core (checked below), or on the glazing inside the wall.
  const allowed = {
    opaque: ['hi-outside-box', 'hi-side-walls', 'hi-floor-visible', 'hi-lit-walls', 'hi-art-lights-clip'],
    transparent: ['hi-retained-core', 'hi-lit-walls-core', 'hi-lit-core', 'hi-velvet', 'hi-tieback', 'hi-art-lights-clip'],
  };
  for (const transparent of [false, true]) {
    const props = hauntedInteriorLoopSchema.parse({transparent, lightningIntensity: 1, moonlightIntensity: 1});
    for (const frame of [...FLASH_FRAMES, ...FLASH_FRAMES.map((frame) => frame - 2)]) {
      const markup = pictureMarkup(props, frame);
      const layers = elementsOf(markup).filter((node) => LIGHT_LAYER.test(node.attrs) && !ancestry(node).some((entry) => entry.tag === 'defs'));
      assert.ok(layers.length >= (transparent ? 8 : 12), `frame ${frame}: só ${layers.length} camadas de luz`);
      for (const layer of layers) {
        const clips = clipsOf(layer);
        assert.ok(clips.some((clip) => allowed[transparent ? 'transparent' : 'opaque'].includes(clip)),
          `frame ${frame}${transparent ? ' (sobre o jogo)' : ''}: <${layer.tag}${layer.attrs.slice(0, 80)}> sob ${clips.join(', ') || 'nenhum recorte'}`);
      }
      // Over gameplay the pool has no floor to land on: it is not drawn, not even its halo.
      assert.equal(markup.includes('href="#hi-pool"'), !transparent, 'a poça só aparece no salão opaco');
    }
  }
  // Over gameplay nothing blends: the mere presence of a mix-blend-mode layer changes how the browser
  // anti-aliases the cut edges (the matte then differs from a hall without it, and from one render to
  // the next). In or out of a flash, at any intensity, the transparent frame carries none.
  for (const lightningIntensity of [0, 0.02, 0.7, 1]) {
    const props = hauntedInteriorLoopSchema.parse({transparent: true, lightningIntensity});
    for (const frame of [0, 480, ...strikeFrames]) {
      assert.ok(!/mix-blend-mode|mixBlendMode/i.test(pictureMarkup(props, frame)), `frame ${frame}, intensidade ${lightningIntensity}: mistura sobre o jogo`);
    }
  }
  // The shaft stands still (it only breathes in opacity), lined up with the glass and the pool. Out of
  // a strike there is one, through the lancet that sees the moon.
  const shafts = elementsOf(pictureMarkup(on, 480)).filter((node) => node.attrs.includes('filter="url(#hi-beam-soft)"'));
  assert.ok(shafts.length === 1 && shafts.every((node) => !/transform=/.test(node.attrs)), 'o feixe gira');
  // Those clips, geometrically: each lies off the content box.
  const markup = pictureMarkup(on, FLASH_FRAMES[0]!);
  const box = `M${CONTENT_BOX.left} ${CONTENT_BOX.top}V${CONTENT_BOX.bottom}H${CONTENT_BOX.right}V${CONTENT_BOX.top}Z`;
  assert.match(markup, new RegExp(`<clipPath id="hi-outside-box"><path d="M0 0H1920V1080H0Z ${box}" clip-rule="evenodd">`), 'o quadro menos a caixa');
  const transparentMarkup = pictureMarkup(hauntedInteriorLoopSchema.parse({transparent: true}), FLASH_FRAMES[0]!);
  assert.ok(transparentMarkup.includes(`<clipPath id="hi-velvet"><path d="${CURTAIN_SHAPES}"></path></clipPath>`), 'o veludo recorta só o veludo');
  assert.ok(transparentMarkup.includes(`<clipPath id="hi-tieback"><path d="${CURTAIN_TIEBACKS}"></path></clipPath>`), 'o ouro recorta só o ouro');
  for (const d of [SIDE_WALLS, WALLS_CORE, RETAINED_CORE, TRACERY_PLATE, CURTAIN_SHAPES, CURTAIN_TIEBACKS, LANCET.lights, FLOOR_VISIBLE.opaque, FLOOR_VISIBLE.transparent]) {
    assert.ok(outsideTheBox(d), 'recorte de luz sobre a área de conteúdo');
  }
  // The velvet and the gold a flash lights over gameplay hang on the retained core, where the hall is opaque.
  const core = flattenPath(RETAINED_CORE).map(({points}) => points);
  for (const point of CURTAIN_OUTLINES.flat().flatMap((point) => [point, mirror(point)])) {
    assert.ok(core.some((polygon) => pointInPolygon(point, polygon)), `cortina fora do miolo mantido em ${point.map(Math.round)}`);
  }
  for (const point of flattenPath(CURTAIN_TIEBACKS).flatMap(({points}) => points)) {
    assert.ok(core.some((polygon) => pointInPolygon(point, polygon)), `amarra fora do miolo mantido em ${point.map(Math.round)}`);
  }
});

/** The clip regions a rendered frame defines, by id: each child path's outlines and its fill rule. */
const clipRegions = (markup: string) => new Map([...markup.matchAll(/<clipPath id="([\w-]+)">(.*?)<\/clipPath>/g)].map(([, id, body]) => [
  id!, [...body!.matchAll(/<path d="([^"]*)"( clip-rule="evenodd")?/g)].map(([, d, rule]) => ({
    outlines: flattenPath(d!).map(({points}) => points), evenodd: Boolean(rule),
  })),
]));
const insideClip = (region: ReturnType<typeof clipRegions> extends Map<string, infer R> ? R : never, point: Point) =>
  region.some(({outlines, evenodd}) => {
    const count = outlines.filter((outline) => pointInPolygon(point, outline)).length;
    return evenodd ? count % 2 === 1 : count > 0;
  });
const LIT_CLIPS = ['hi-lit-walls', 'hi-lit-walls-core', 'hi-lit-core'];
/** The other clips a flash layer may sit under: the floor (opaque), the velvet and its gold (over gameplay), none of which touches the glass plane. */
const FLOOR_AND_VELVET = ['hi-floor-visible', 'hi-velvet', 'hi-tieback'];

test('Interior: no clarão, a pedra da lanceta fica em silhueta contra o vidro; batente, peitoril e moldura clareiam', () => {
  const glass = leftWall(-WINDOW.reveal);
  const face = leftWall();
  // On screen the mullion lies between the two lights' visible spans (the near light, left, then the far one).
  const [far, closer] = LANCET.spans;
  const mullionX = (closer[1] + far[0]) / 2;
  const stone: Point[] = [
    ...[WINDOW.sill + 30, 250, 300].map((v): Point => [mullionX, glass(WINDOW.u, v)[1]]),
    // The plate between the heads of the lights, below the roundel, and beside the roundel.
    glass(WINDOW.u, 345), glass(WINDOW.u - 26, 380),
  ];
  // Light the flash sends into the hall falls on the far jamb (the strip of reveal between the glass
  // and the wall face), on the ledge's front face under the sill, and on the moulding beside the near
  // jamb, where the glass plane runs on unseen behind the wall face.
  const lit: Point[] = [
    [(glass(WINDOW.u - WINDOW.half, 250)[0] + face(WINDOW.u - WINDOW.half, 250)[0]) / 2, face(WINDOW.u - WINDOW.half, 250)[1]],
    leftWall(WINDOW.ledge)(WINDOW.u, WINDOW.sill - 4),
    [(glass(WINDOW.u + WINDOW.half, 250)[0] + face(WINDOW.u + WINDOW.half, 250)[0]) / 2, face(WINDOW.u + WINDOW.half, 250)[1]],
  ];
  const outline = windowGlassOutline().map(([u, v]) => glass(u, v));
  const lights = flattenPath(LANCET.lights).map(({points}) => points);
  for (const point of stone) {
    assert.ok(pointInPolygon(point, outline) && !lights.some((light) => pointInPolygon(point, light)), `pedra em ${point.map(Math.round)}`);
  }
  assert.ok(!pointInPolygon(lit[1]!, outline) && !pointInPolygon(lit[2]!, flattenPath(TRACERY_PLATE)[0]!.points));
  for (const transparent of [false, true]) {
    const props = hauntedInteriorLoopSchema.parse({transparent, lightningIntensity: 1});
    const markup = pictureMarkup(props, FLASH_FRAMES[0]!);
    const regions = clipRegions(markup);
    for (const id of LIT_CLIPS) {
      const region = regions.get(id);
      assert.ok(region, id);
      for (const point of [...stone, ...lit]) {
        for (const [side, at] of [['esquerda', point], ['direita', mirror(point)]] as const) {
          const expected = lit.includes(point);
          assert.equal(insideClip(region, at), expected, `${id}, janela da ${side}: ${expected ? 'apaga' : 'clareia'} ${point.map(Math.round)}`);
        }
      }
    }
    // The floor and the velvet, the other clips a flash layer may sit under, reach none of the stone either.
    for (const id of FLOOR_AND_VELVET.filter((clip) => regions.has(clip))) {
      for (const point of stone) for (const at of [point, mirror(point)]) assert.ok(!insideClip(regions.get(id)!, at), `${id} alcança a pedra em ${at.map(Math.round)}`);
    }
    // The flash's light on the walls, on the floor and on the velvet is drawn only under those clips.
    const washes = elementsOf(markup).filter((node) => /url\(#hi-flash-(?:wash|room|cover|sill|velvet|tieback)/.test(node.attrs) && node.tag !== 'stop'
      && !ancestry(node).some((entry) => entry.tag === 'defs'));
    assert.ok(washes.length >= 4, `só ${washes.length} camadas do clarão no salão`);
    for (const node of washes) {
      assert.ok(clipsOf(node).some((clip) => LIT_CLIPS.includes(clip) || FLOOR_AND_VELVET.includes(clip)), `<${node.tag}${node.attrs.slice(0, 80)}>`);
    }
    // The storm sky is painted with the lights' own outline, inside the hall's clip of the lights, as
    // the dim glass under it is. A larger shape left to that clip alone covers the edge pixels, half
    // stone and half glass, more than the glass does: they turn brighter than the glass's own edge (up
    // to +54 of luma on about 125 pixels of a flash frame, mostly along the sills), a pale rim on the
    // stone around the lights.
    assert.ok(regions.get('hi-art-lights-clip')?.length === 1 && markup.includes(`<clipPath id="hi-art-lights-clip"><path d="${LANCET.lights}">`), 'o recorte das luzes');
    const skies = elementsOf(markup).filter((node) => node.attrs.includes('fill="url(#hi-flash-sky)"'));
    assert.equal(skies.length, 2, 'o céu do relâmpago nas duas janelas');
    for (const node of skies) {
      assert.ok(node.tag === 'path' && node.attrs.includes(` d="${LANCET.lights}"`) && clipsOf(node).includes('hi-art-lights-clip'),
        `o céu do relâmpago sai do vidro: <${node.tag}${node.attrs.slice(0, 80)}>`);
    }
  }
});

test('Interior: o raio passa por trás de árvores e chumbo, que só escurecem com o céu, na proporção da intensidade', () => {
  const [, strike] = getLightningStrikes(hauntedInteriorLoopSchema.parse({}));
  assert.ok(strike);
  const first = Math.ceil(strike.start * 60);
  for (const lightningIntensity of [0.02, 0.3, 0.7, 1]) {
    const props = hauntedInteriorLoopSchema.parse({lightningIntensity});
    let [bolts, darkest] = [0, 0];
    for (let frame = first; frame < first + 48; frame++) {
      const markup = pictureMarkup(props, frame);
      const nodes = elementsOf(markup);
      const trees = nodes.filter((node) => node.attrs.includes(`d="${LANCET.trees}" fill="#030707"`));
      const lights = pick(getHauntedInteriorScene(props, frame, 960), 'lightning');
      // One redrawn treeline per window that flashes, left then right, as dark as its sky is bright.
      assert.equal(trees.length, lights.filter((light) => light.opacity > 0).length);
      trees.forEach((node, i) => {
        const opacity = Number(/opacity="([^"]+)"/.exec(node.parent!.attrs)?.[1]);
        const sky = lights.filter((light) => light.opacity > 0)[i]!.opacity ** 0.7;
        assert.ok(Math.abs(opacity - sky) < 1e-9, `frame ${frame}, intensidade ${lightningIntensity}: árvores e chumbo a ${opacity}, céu a ${sky}`);
        darkest = Math.max(darkest, opacity);
      });
      // The bolt shows through the glass only: trees, leading, the hole's rim and the cracks cut it.
      for (const node of nodes.filter((entry) => /mask="url\(#hi-bolt-behind-[01]\)"/.test(entry.attrs))) {
        bolts++;
        assert.ok(ancestry(node).some((entry) => clipsOf(entry).includes('hi-art-lights-clip')));
      }
    }
    assert.ok(bolts >= 3, `intensidade ${lightningIntensity}: o raio aparece em ${bolts} frames`);
    // At the faintest setting the lattice barely darkens: it follows the faint sky, not the bolt.
    if (lightningIntensity === 0.02) assert.ok(darkest < 0.07, `árvores e chumbo a ${darkest.toFixed(3)} com intensidade 0,02`);
  }
  const markup = pictureMarkup(hauntedInteriorLoopSchema.parse({}), FLASH_FRAMES[1]!);
  for (const side of [0, 1]) {
    const mask = new RegExp(`<mask id="hi-bolt-behind-${side}"[^>]*>(.*?)</mask>`).exec(markup)?.[1] ?? '';
    assert.ok(mask.includes(`d="${LANCET.lights}" fill="white"`) && mask.includes(`d="${LANCET.trees}" fill="black"`), `máscara do raio, lado ${side}`);
    assert.ok(mask.includes(`d="${LANCET.leading}${LANCET.broken[side]!.hole}${LANCET.broken[side]!.cracks}" fill="none" stroke="black"`), `chumbo e vidro quebrado, lado ${side}`);
  }
});

/** The light layers of a rendered frame (outside <defs>), in paint order. */
const paintedLayers = (markup: string) => elementsOf(markup).filter((node) => !ancestry(node).some((entry) => entry.tag === 'defs'));
const fillOf = (node: MarkupNode) => /fill="url\(#([\w-]+)\)"/.exec(node.attrs)?.[1] ?? '';
const numberAttr = (node: MarkupNode, name: string) => Number(new RegExp(`\\s${name}="([^"]+)"`).exec(node.attrs)?.[1]);
const insideEllipse = (node: MarkupNode, [x, y]: Point) =>
  ((x - numberAttr(node, 'cx')) / numberAttr(node, 'rx')) ** 2 + ((y - numberAttr(node, 'cy')) / numberAttr(node, 'ry')) ** 2 <= 1;

test('Interior: o clarão clareia a pintura antes da luz das velas e do luar, pousa junto à janela e não acende a cera', () => {
  const props = hauntedInteriorLoopSchema.parse({});
  for (const frame of FLASH_FRAMES) {
    const markup = pictureMarkup(props, frame);
    const layers = paintedLayers(markup);
    const where = (test: (node: MarkupNode) => boolean) => layers.flatMap((node, i) => (test(node) ? [i] : []));
    // A gain multiplies whatever was painted before it. On the floor and on the walls the flash comes
    // before the warm light of the candles and the chandelier and before the moon's cool wash, so it
    // lights the paint and not their light: the candle corner does not warm up on every strike.
    for (const [flashClip, lightClip] of [['hi-floor-visible', 'hi-floor-visible'], ['hi-lit-walls', 'hi-side-walls']] as const) {
      const flash = where((node) => /^hi-flash-(?:wash|room)-[01]$/.test(fillOf(node)) && clipsOf(node).includes(flashClip));
      const light = where((node) => /^hi-(?:warm-spill|warm-wash|cool-wash)$/.test(fillOf(node)) && clipsOf(node).includes(lightClip));
      assert.ok(flash.length >= 2 && light.length >= 2, `${flashClip}: ${flash.length} camadas do clarão, ${light.length} de luz`);
      assert.ok(Math.max(...flash) < Math.min(...light), `frame ${frame}, ${flashClip}: o clarão multiplica a luz das velas ou do luar`);
    }
    // The candelabra's bronze catches the flash; its candles, already lit by their flames, do not.
    const rims = layers.filter((node) => /url\(#hi-candelabra-rim-[01]\)/.test(node.attrs));
    assert.equal(rims.length, 6, 'o corpo, as peças finas e os braços de cada candelabro');
    for (const rim of rims) {
      const d = /\sd="([^"]*)"/.exec(rim.attrs)?.[1] ?? '';
      for (const candle of CANDELABRA_PATHS.candles) assert.ok(!d.includes(candle), 'o clarão acende a cera das velas');
    }
    // The thin parts, the dishes, their cups and the arms, light only along the edge facing the window:
    // lit whole, the dish next to the window read as a flat pale disc.
    const edge = /<mask id="hi-candelabra-edge"[^>]*>(.*?)<\/mask>/.exec(markup)?.[1] ?? '';
    for (const d of [CANDELABRA_PATHS.pans + CANDELABRA_PATHS.cups, CANDELABRA_PATHS.arms]) {
      assert.ok(edge.includes(` d="${d}"`), 'a máscara da borda das peças finas');
      const thin = rims.filter((node) => node.attrs.includes(` d="${d}"`));
      assert.ok(thin.length === 2 && thin.every((node) => node.attrs.includes('mask="url(#hi-candelabra-edge)"')), `frame ${frame}: uma peça fina acende por inteiro`);
    }
    // The arms' gain comes right after the arms, before the knops, cups and pans that cover their ends:
    // those then hide the lit ends too and take their own gain once. Painted last, it lit the arms'
    // hidden ends again through them (two pale discs on the middle dish, a spot on a cup).
    const drawn = (d: string) => where((node) => node.attrs.includes(` d="${d}"`) && !/candelabra-rim/.test(node.attrs));
    [0, 1].forEach((k) => {
      const [arms, armRim, bodyRim] = [drawn(CANDELABRA_PATHS.arms)[2 * k]!, where((node) => node.attrs.includes(`stroke="url(#hi-candelabra-rim-${k})"`)),
        where((node) => node.attrs.includes(`fill="url(#hi-candelabra-rim-${k})"`))];
      assert.ok(armRim.length === 1 && bodyRim.length === 2 && armRim[0]! > arms, `candelabro ${k}: o ganho dos braços`);
      for (const part of [CANDELABRA_PATHS.knops, CANDELABRA_PATHS.cups, CANDELABRA_PATHS.pans]) {
        const index = drawn(part)[k]!;
        assert.ok(armRim[0]! < index && index < Math.min(...bodyRim), `candelabro ${k}: o ganho dos braços passa sobre as peças que cobrem as pontas deles`);
      }
    });
    // Where the flash lands: around the lancet and on the floor between the foot of the wall under it
    // and the pool, clear of the candles (left side, drawn there and mirrored) and fading out before
    // the content box.
    const [wash] = layers.filter((node) => fillOf(node) === 'hi-flash-wash-0');
    const rooms = layers.filter((node) => fillOf(node) === 'hi-flash-room-0');
    assert.ok(wash && rooms.length === 2, 'o clarão em volta da lanceta, e no piso e no pé da parede');
    for (const candle of CANDLE_ANCHORS.slice(0, 3)) {
      for (const layer of [wash, ...rooms]) assert.ok(!insideEllipse(layer, candle), `o clarão chega à vela em ${candle.map(Math.round)}`);
    }
    const room: Point = [numberAttr(rooms[0]!, 'cx'), numberAttr(rooms[0]!, 'cy')];
    const foot = leftWall()(WINDOW.u, 0);
    assert.ok(room[0] >= foot[0] && room[0] <= MOON_POOL_AXIS.from[0] && room[1] > CONTENT_BOX.bottom, `o reflexo do clarão em ${room.map(Math.round)}`);
    assert.ok(Math.hypot(room[0] - MOON_POOL_AXIS.from[0], room[1] - MOON_POOL_AXIS.from[1]) < Math.hypot(room[0] - CANDELABRA_FOOT[0], room[1] - CANDELABRA_FOOT[1]));
    // Both copies fade out before the content box. On the floor, by the moon's lancet, the reflection
    // also passes under the moon's pool through the pool's own layers (hi-pool-add-*), divided by one
    // plus the pool's gain there: one gain over the other would multiply, not add, and the pool would
    // outshine the glass that lights it.
    const maskBody = (node: MarkupNode) => {
      const id = /mask="url\(#([\w-]+)\)"/.exec(node.attrs)?.[1] ?? '';
      return new RegExp(`<mask id="${id}"[^>]*>(.*?)</mask>`).exec(markup)?.[1] ?? '';
    };
    const boxFade = /<mask id="hi-box-fade"[^>]*>(.*?)<\/mask>/.exec(markup)?.[1] ?? '';
    assert.ok(boxFade.includes('hi-box-fade-x'), 'a máscara da caixa');
    for (const layer of layers.filter((node) => /^hi-flash-room-[01]$/.test(fillOf(node)))) {
      assert.ok(maskBody(layer).startsWith(boxFade), 'o reflexo se apaga antes da área de conteúdo');
    }
    const floorRoom = layers.find((node) => fillOf(node) === `hi-flash-room-${MOON_SIDE}` && clipsOf(node).includes('hi-floor-visible'));
    assert.ok(floorRoom && maskBody(floorRoom).includes('<use href="#hi-pool" fill="url(#hi-pool-add-glow)"')
      && maskBody(floorRoom).includes('<use href="#hi-pool" fill="url(#hi-pool-add-sharp)"'), `frame ${frame}: o reflexo no piso passa sob a poça`);
    const pool = where((node) => (node.tag === 'use' && node.attrs.includes('href="#hi-pool"')) || /^hi-storm-pool-[01]$/.test(fillOf(node)));
    assert.ok(pool.length === 4 && Math.min(...pool) > layers.indexOf(floorRoom), 'a poça sobre o reflexo');
  }
});

/** The stops of a gradient in a rendered frame: offset and colour (rgb() channels, or the raw colour) and opacity. */
const stopsOf = (markup: string, id: string) => {
  const body = new RegExp(`<(radial|linear)Gradient id="${id}"[^>]*>(.*?)</\\1Gradient>`).exec(markup)?.[2];
  assert.ok(body, `degradê ${id}`);
  return [...body.matchAll(/<stop([^>]*)>/g)].map(([, attrs]) => ({
    offset: Number(/offset="([^"]+)"/.exec(attrs!)?.[1] ?? 0),
    color: /stop-color="([^"]+)"/.exec(attrs!)?.[1] ?? '',
    opacity: Number(/stop-opacity="([^"]+)"/.exec(attrs!)?.[1] ?? 1),
  }));
};
/** The gain (per channel) of the first stop of a gradient: a colour-dodge colour S gives the gain S / (1 − S). */
const firstGain = (markup: string, id: string) => {
  const color = new RegExp(`id="${id}"[^>]*><stop[^>]*?\\sstop-color="rgb\\(([^)]*)\\)"`).exec(markup)?.[1];
  assert.ok(color, `degradê ${id}`);
  return color.split(',').map((value) => Number(value) / (255 - Number(value)));
};
/** The light the moon's pool adds at its near end, per channel: both its layers, one over the other, (1 + sharp)(1 + glow) − 1. */
const moonPoolGain = (markup: string) => {
  const [sharp, glow] = [firstGain(markup, `hi-pool-sharp-${MOON_SIDE}`), firstGain(markup, `hi-pool-glow-${MOON_SIDE}`)];
  return sharp.map((gain, c) => (1 + gain) * (1 + glow[c]!) - 1);
};
/** The light the lightning's broad glow (hi-storm-pool) adds at its centre, by one window, per channel. */
const stormGain = (markup: string, side: number) => firstGain(markup, `hi-storm-pool-${side}`);
/**
 * The opacity the moon's pool, or a mask drawn with its layers, is painted with where a stop of the
 * gradient gives `alpha`: MOON_POOL_SAMPLES layers laid over one another at 1/N of it each, whose alpha
 * the pool's filters scale back to 1 where all of them cover at full opacity.
 */
const poolAlpha = (alpha: number) =>
  Math.min(1, (1 - (1 - alpha / MOON_POOL_SAMPLES) ** MOON_POOL_SAMPLES) / (1 - (1 - 1 / MOON_POOL_SAMPLES) ** MOON_POOL_SAMPLES));
/** A gradient's opacity at `t` (0–1), from its stops. */
const opacityAt = (stops: ReturnType<typeof stopsOf>, t: number) => {
  const next = stops.findIndex(({offset}) => offset >= t);
  if (next <= 0) return next < 0 ? stops[stops.length - 1]!.opacity : stops[0]!.opacity;
  const [a, b] = [stops[next - 1]!, stops[next]!];
  return a.opacity + ((b.opacity - a.opacity) * (t - a.offset)) / (b.offset - a.offset);
};

test('Interior: no clarão, a poça do luar fica no nível da lua, e a luz do relâmpago soma por cima dela, larga', () => {
  // A bolt lights the hall from a broad patch of sky, not from the moon: it never changes the moon's
  // pool. Through the moon's lancet the pool keeps the moon's gains, frame by frame through either
  // strike, at any intensity; cross-fading it into a brighter pattern of the same panes read as the
  // moon flaring. The flash lays its light on the floor as the broad storm glow, by the window facing
  // the strike, whichever it is (checked below).
  const strikes = getLightningStrikes(hauntedInteriorLoopSchema.parse({}));
  for (const strike of strikes) {
    const frames = Array.from({length: 18}, (_, k) => Math.floor(strike.start * 60) - 2 + 3 * k);
    for (const moonlightIntensity of [0, 0.65, 1]) {
      for (const lightningIntensity of [0.35, 1]) {
        const [props, off] = [lightningIntensity, 0].map((value) => hauntedInteriorLoopSchema.parse({moonlightIntensity, lightningIntensity: value}));
        for (const frame of frames) {
          const [markup, dark] = [pictureMarkup(props!, frame), pictureMarkup(off!, frame)];
          for (const name of ['sharp', 'glow']) {
            assert.deepEqual(stopsOf(markup, `hi-pool-${name}-${MOON_SIDE}`), stopsOf(dark, `hi-pool-${name}-${MOON_SIDE}`),
              `relâmpago na janela ${strike.side}, frame ${frame}, luar ${moonlightIntensity}, clarão ${lightningIntensity}: a poça do luar (${name}) muda`);
          }
        }
      }
    }
  }
  // Over the pool, the storm glow adds. Gains one over the other multiply, (1 + g)(1 + h): the glow
  // passes under the pool through a mask drawn with the pool's own layers and filters, which lets
  // through 1/(1 + g) of it, so the two add, and a little less the brighter the pool is there, so the
  // sum rises softly to a ceiling (that it stays under its glass is checked below). The floor's other
  // lights, the flash's reflection and the sky's diffuse light, pass under the pool through the same
  // layers at exactly 1/(1 + g): they add.
  for (const moonlightIntensity of [0.3, 0.65, 1]) {
    const props = hauntedInteriorLoopSchema.parse({moonlightIntensity, lightningIntensity: 1});
    const frame = FLASH_FRAMES[strikes.findIndex(({side}) => side === MOON_SIDE)]!;
    const markup = pictureMarkup(props, frame);
    const painted = paintedLayers(markup);
    const [storm] = painted.filter((node) => fillOf(node) === `hi-storm-pool-${MOON_SIDE}`);
    assert.ok(storm && lumaOfGain(stormGain(markup, MOON_SIDE)) > 0 && /\smask="url\(#hi-storm-under-pool\)"/.test(storm.attrs), `luar ${moonlightIntensity}: a claridade sobre a poça`);
    const mask = /<mask id="hi-storm-under-pool"[^>]*>(.*?)<\/mask>/.exec(markup)?.[1] ?? '';
    assert.ok(mask.startsWith('<rect width="1920" height="1080" fill="white">')
      && mask.includes('<use href="#hi-pool" fill="url(#hi-pool-cap-glow)" filter="url(#hi-pool-glow)">')
      && mask.includes('<use href="#hi-pool" fill="url(#hi-pool-cap-sharp)" filter="url(#hi-pool-edge)">'), `luar ${moonlightIntensity}: a máscara da claridade sob a poça`);
    const pools = painted.filter((node) => node.tag === 'use' && node.attrs.includes('href="#hi-pool"'));
    assert.deepEqual(pools.map((node) => [fillOf(node), /filter="url\(#([\w-]+)\)"/.exec(node.attrs)?.[1]]),
      [[`hi-pool-glow-${MOON_SIDE}`, 'hi-pool-glow'], [`hi-pool-sharp-${MOON_SIDE}`, 'hi-pool-edge']], 'as camadas da poça');
    // Along the pool, at each tenth: its gain there (both layers, at the opacity they are drawn with),
    // the share of its own light the glow adds over it, and the share the other floor lights add.
    const layerGain = (name: string, t: number) => lumaOfGain(firstGain(markup, `hi-pool-${name}-${MOON_SIDE}`)) * poolAlpha(opacityAt(stopsOf(markup, `hi-pool-${name}-${MOON_SIDE}`), t));
    const through = (law: string, t: number) => ['glow', 'sharp'].reduce((pass, name) => pass * (1 - poolAlpha(opacityAt(stopsOf(markup, `hi-pool-${law}-${name}`), t))), 1);
    const shares = Array.from({length: 11}, (_, k) => {
      const t = k / 10;
      const gain = (1 + layerGain('glow', t)) * (1 + layerGain('sharp', t)) - 1;
      return {t, gain, storm: through('cap', t) * (1 + gain), floor: through('add', t) * (1 + gain)};
    });
    const where = `luar ${moonlightIntensity}`;
    for (const {t, gain, storm: added, floor} of shares) {
      assert.ok(gain > 0 && added <= 1 + 2e-3, `${where}, t ${t}: a claridade soma ${added.toFixed(3)} da própria luz sobre a poça (ganho ${gain.toFixed(2)})`);
      assert.ok(Math.abs(floor - 1) <= 2e-3, `${where}, t ${t}: o reflexo e o céu somam ${floor.toFixed(3)} da própria luz sob a poça`);
    }
    // It adds a visible share of its light where the pool is brightest, and more where it is dimmer.
    assert.ok(shares[0]!.storm >= (moonlightIntensity < 1 ? 0.35 : 0.12), `${where}: a claridade soma só ${shares[0]!.storm.toFixed(3)} junto à parede`);
    shares.forEach((entry, k) => assert.ok(k === 0 || (entry.gain <= shares[k - 1]!.gain + 1e-9 && entry.storm >= shares[k - 1]!.storm - 2e-3),
      `${where}: a claridade soma menos onde a poça é mais fraca, em t ${entry.t}`));
  }
  // Under the storm glow, by the lancet facing the strike, whichever it is, the flash's reflection and
  // the sky's diffuse light add too: they pass through a hole in their mask (hi-storm-hole) that lets
  // through exactly 1/(1 + h) of them, at each tenth of the glow, where the glow adds h. Cut whole,
  // the floor would lose them under the glow, and darken at its rim, where the glow fades to nothing.
  for (const moonlightIntensity of [0.3, 1]) {
    for (const lightningIntensity of [0.35, 1]) {
      const props = hauntedInteriorLoopSchema.parse({moonlightIntensity, lightningIntensity});
      strikes.forEach((strike, i) => {
        const markup = pictureMarkup(props, FLASH_FRAMES[i]!);
        const where = `relâmpago na janela ${strike.side}, luar ${moonlightIntensity}, clarão ${lightningIntensity}`;
        const glow = gainsOfStops(markup, `hi-storm-pool-${strike.side}`).map(lumaOfGain);
        const hole = stopsOf(markup, 'hi-storm-hole');
        const glowOffsets = stopsOf(markup, `hi-storm-pool-${strike.side}`).map(({offset}) => offset);
        assert.ok(glow[0]! > 0 && hole.length === glow.length && hole.every(({offset}, k) => offset === glowOffsets[k]), `${where}: o buraco da claridade`);
        hole.forEach(({offset, opacity}, k) => assert.ok(Math.abs(opacity - (1 - 1 / (1 + glow[k]!))) <= 2e-3,
          `${where}, t ${offset}: o buraco corta ${opacity.toFixed(4)}, e a claridade soma ${glow[k]!.toFixed(3)} (corte esperado ${(1 - 1 / (1 + glow[k]!)).toFixed(4)})`));
        // Both floor lights by that lancet go through the hole; by the other one, no hole cuts them.
        const painted = paintedLayers(markup);
        const floorLights = painted.filter((node) => /^hi-(?:flash-room|sky-glow)-[01]$/.test(fillOf(node)) && clipsOf(node).includes('hi-floor-visible'));
        assert.equal(floorLights.length, 4, `${where}: as luzes no piso`);
        for (const node of floorLights) {
          const mask = /\smask="url\(#([\w-]+)\)"/.exec(node.attrs)?.[1] ?? '';
          const body = new RegExp(`<mask id="${mask}"[^>]*>(.*?)</mask>`).exec(markup)?.[1] ?? '';
          assert.equal(body.includes('fill="url(#hi-storm-hole)"'), windowOf(node) === strike.side,
            `${where}: ${fillOf(node)} (${mask}) ${windowOf(node) === strike.side ? 'passa por cima da claridade' : 'recortada por uma claridade que não existe'}`);
        }
      });
    }
  }
});

test('Interior: num relâmpago, o piso nunca fica mais escuro que no mesmo frame sem ele, por qualquer lanceta', () => {
  // Lights add: whatever the flash lays on the floor (the storm glow and the reflection) comes on top
  // of what was there (the moon's pool and the sky's diffuse light), never in place of it. The floor's
  // light is rebuilt, as in the glass test below, from what the frame draws: every gain on the floor by
  // each lancet, at each point, through the mask it is drawn with, one over the other (a colour-dodge
  // gain g multiplies what is under it by 1 + g). On and around the storm glow, by either window, a
  // strike's frame is never darker, in any channel, than the same frame with lightningIntensity 0.
  // Up to a hundred-thousandth: the stops are rounded (the colours to 1/100, the masks to 1/10000),
  // and under the moon's pool, near its ceiling, the glow adds a little less than the h the hole
  // divides the other floor lights by (measured: a few millionths).
  const floorLight = (markup: string) => {
    const painted = paintedLayers(markup);
    const mask = (node: MarkupNode) => /\smask="url\(#([\w-]+)\)"/.exec(node.attrs)?.[1] ?? '';
    const pass = (law: string) => (['glow', 'sharp'] as const).map((name) => rampAt(markup, `hi-pool-${law}-${name}`));
    const through = (ramps: ReturnType<typeof rampAt>[], point: Point) => ramps.reduce((value, ramp) => value * (1 - poolAlpha(ramp(point).opacity)), 1);
    const hole = radialAt(markup, 'hi-storm-hole');
    const floorPass = (id: string, point: Point) => shaftVisibility(point)
      * (['hi-room-floor', 'hi-room-floor-both'].includes(id) ? through(pass('add'), point) : 1)
      * (['hi-room-floor-storm', 'hi-room-floor-both'].includes(id) ? 1 - hole.alpha(point) : 1);
    const layers = painted.filter((node) => {
      const family = GAIN_LAYER.exec(node.attrs)?.[1];
      return family && (['pool-sharp', 'pool-glow', 'storm-pool'].includes(family) || (['flash-room', 'sky-glow'].includes(family) && clipsOf(node).includes('hi-floor-visible')));
    });
    const gainOf = (node: MarkupNode): ((point: Point) => number[]) => {
      const fill = fillOf(node);
      if (/^hi-pool-/.test(fill)) {
        const ramp = rampAt(markup, fill);
        return (point) => {
          const {channels, opacity} = ramp(point);
          return channels.map((c) => (poolAlpha(opacity) * c) / (255 - c));
        };
      }
      if (/^hi-storm-pool-/.test(fill)) {
        const glow = radialAt(markup, fill);
        assert.ok(['', 'hi-storm-under-pool'].includes(mask(node)), `a máscara de ${fill}`);
        return (point) => glow.at(point).map((gain) => gain * (mask(node) ? through(pass('cap'), point) : 1));
      }
      if (/^hi-sky-glow-/.test(fill)) {
        const sky = radialAt(markup, fill);
        return (point) => sky.at(point).map((gain) => gain * floorPass(mask(node), point));
      }
      const stops = stopsOf(markup, fill).map(({offset, color}) => ({offset, gain: channelsOf(color).map((c) => c / (255 - c))}));
      return ([x, y]) => {
        const t = Math.min(1, Math.hypot((x - numberAttr(node, 'cx')) / numberAttr(node, 'rx'), (y - numberAttr(node, 'cy')) / numberAttr(node, 'ry')));
        const next = stops.findIndex(({offset}) => offset >= t);
        const [lo, hi] = [stops[Math.max(0, next - 1)]!, stops[next]!];
        const share = hi.offset > lo.offset ? (t - lo.offset) / (hi.offset - lo.offset) : 1;
        return lo.gain.map((g, k) => (g + (hi.gain[k]! - g) * share) * floorPass(mask(node), [x, y]));
      };
    };
    const gains = layers.map((node) => ({side: windowOf(node), at: gainOf(node)}));
    return (side: number, point: Point) => gains.filter((entry) => entry.side === side)
      .reduce((total, {at}) => at(point).map((gain, c) => total[c]! * (1 + gain)), [1, 1, 1]);
  };
  // Points on and around the storm glow's ellipse (in the left half, where every floor light is drawn
  // and mirrored), out to past its rim.
  const glow = radialAt(pictureMarkup(hauntedInteriorLoopSchema.parse({}), FLASH_FRAMES[0]!), 'hi-storm-hole');
  const [[ax, ay], [bx, by]] = glow.axes;
  const points: Point[] = [];
  for (let r = 0; r <= 1.2 + 1e-9; r += 0.1) {
    for (let k = 0; k < 24; k++) {
      const [cos, sin] = [Math.cos((k * Math.PI) / 12), Math.sin((k * Math.PI) / 12)];
      points.push([glow.centre[0] + r * (cos * ax + sin * bx), glow.centre[1] + r * (cos * ay + sin * by)]);
    }
  }
  const strikes = getLightningStrikes(hauntedInteriorLoopSchema.parse({}));
  for (const moonlightIntensity of [0, 0.65, 1]) {
    for (const lightningIntensity of [0.35, 1]) {
      const [props, off] = [lightningIntensity, 0].map((value) => hauntedInteriorLoopSchema.parse({moonlightIntensity, lightningIntensity: value}));
      strikes.forEach((strike, i) => {
        for (const frame of [Math.floor(strike.start * 60) + 1, FLASH_FRAMES[i]!, FLASH_FRAMES[i]! + 12]) {
          const [lit, dark] = [floorLight(pictureMarkup(props!, frame)), floorLight(pictureMarkup(off!, frame))];
          for (const side of [0, 1]) {
            for (const point of points) {
              const [a, b] = [lit(side, point), dark(side, point)];
              assert.ok(a.every((value, c) => value >= b[c]! * (1 - 1e-5)),
                `luar ${moonlightIntensity}, clarão ${lightningIntensity}, relâmpago na janela ${strike.side}, frame ${frame}, janela ${side}, em ${point.map(Math.round)}: o piso escurece de ${b.map((v) => v.toFixed(3))} a ${a.map((v) => v.toFixed(3))}`);
            }
          }
        }
      });
    }
  }
});

/** The 0–255 channels of a colour a rendered frame writes, #rrggbb, rgb(), black or white. */
const channelsOf = (color: string) => {
  if (color === 'black' || color === 'white') return [0, 1, 2].map(() => (color === 'white' ? 255 : 0));
  const channels = color.startsWith('#')
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    : (/^rgb\(([^)]*)\)$/.exec(color)?.[1] ?? '').split(',').map(Number);
  assert.ok(channels.length === 3 && channels.every(Number.isFinite), `cor ${color}`);
  return channels;
};
/** A linear gradient of a rendered frame, in user space, at a point: its colour (0–255 channels) and its opacity. */
const rampAt = (markup: string, id: string) => {
  const attrs = new RegExp(`<linearGradient id="${id}"([^>]*)>`).exec(markup)?.[1] ?? '';
  assert.ok(attrs.includes('gradientUnits="userSpaceOnUse"'), `degradê ${id}`);
  const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((name) => Number(new RegExp(`\\s${name}="([^"]+)"`).exec(attrs)?.[1] ?? 0));
  const stops = stopsOf(markup, id).map(({offset, color, opacity}) => ({offset, opacity, channels: channelsOf(color)}));
  return ([x, y]: Point) => {
    const t = Math.min(1, Math.max(0, ((x - x1!) * (x2! - x1!) + (y - y1!) * (y2! - y1!)) / ((x2! - x1!) ** 2 + (y2! - y1!) ** 2)));
    const next = stops.findIndex(({offset}) => offset >= t);
    const [a, b] = next < 0 ? [stops[stops.length - 1]!, stops[stops.length - 1]!] : [stops[Math.max(0, next - 1)]!, stops[next]!];
    const share = b.offset > a.offset ? (t - a.offset) / (b.offset - a.offset) : 1;
    return {channels: a.channels.map((c, k) => c + (b.channels[k]! - c) * share), opacity: a.opacity + (b.opacity - a.opacity) * share};
  };
};
/**
 * A radial gradient of a rendered frame drawn through its gradientTransform (a unit circle mapped by
 * matrix(a b c d e f)): its centre and axes on screen, and its gain (per channel) and its opacity at a
 * point.
 */
const radialAt = (markup: string, id: string) => {
  const attrs = new RegExp(`<radialGradient id="${id}"([^>]*)>`).exec(markup)?.[1] ?? '';
  const matrix = /gradientTransform="matrix\(([^)]*)\)"/.exec(attrs)?.[1]?.split(' ').map(Number) ?? [];
  assert.ok(attrs.includes('gradientUnits="userSpaceOnUse"') && /\scx="0" cy="0" r="1"/.test(attrs) && matrix.length === 6, `degradê ${id}`);
  const [a, b, c, d, e, f] = matrix as [number, number, number, number, number, number];
  const stops = stopsOf(markup, id).map(({offset, color, opacity}) => ({offset, opacity, gain: channelsOf(color).map((s) => s / (255 - s))}));
  const det = a * d - b * c;
  const radius = ([x, y]: Point) => Math.min(1, Math.hypot((d * (x - e) - c * (y - f)) / det, (a * (y - f) - b * (x - e)) / det));
  const between = (t: number) => {
    const next = stops.findIndex(({offset}) => offset >= t);
    const [lo, hi] = [stops[Math.max(0, next - 1)]!, stops[next]!];
    return {lo, hi, share: hi.offset > lo.offset ? (t - lo.offset) / (hi.offset - lo.offset) : 1};
  };
  return {
    centre: [e, f] as Point, axes: [[a, b], [c, d]] as const, stops,
    at: (point: Point) => {
      const {lo, hi, share} = between(radius(point));
      return lo.gain.map((g, k) => g + (hi.gain[k]! - g) * share);
    },
    alpha: (point: Point) => {
      const {lo, hi, share} = between(radius(point));
      return lo.opacity + (hi.opacity - lo.opacity) * share;
    },
  };
};

/** A layer of light laid on the opaque hall as a gain, by family and window: the pool (the moon's, and the lightning's broad one by the other lancet), the flash around each lancet and where it lands, the sky's diffuse light and the candelabra's rim. */
const GAIN_LAYER = /(?:fill|stroke)="url\(#hi-(flash-wash|flash-room|pool-sharp|pool-glow|storm-pool|candelabra-rim|sky-glow)-([01])\)"/;
const DODGE_STYLE = ' style="mix-blend-mode:color-dodge"';

test('Interior: no pico do clarão, a poça não fica mais clara que o vidro que a acende', () => {
  // The brief: the light a window lays on the floor may not outshine the glass that lights it. Both are
  // rebuilt here from what a flash frame draws, at the peak of each strike, in the window facing it
  // (where the storm sky covers the glass most and the floor takes the most of the flash):
  // - the floor, at every point of the lancet's footprint (the moon's lit panes): the lighter marble
  //   under the floor's shade (hi-art-floor-shade), times every gain laid on it there (a colour-dodge
  //   colour S at opacity α multiplies what is under it by 1 + α·S / (1 − S)), each through the mask it
  //   is drawn with: by the moon's lancet the pool's two layers (at the opacity their stacked layers
  //   draw with, poolAlpha); by the lancet facing the strike, the lightning's broad glow (hi-storm-pool,
  //   its gain taken as linear between its stops, which only overstates it), which passes under the
  //   moon's pool through hi-storm-under-pool; and the flash's reflection and the sky's diffuse light,
  //   through the box's fade and under the pool and the glow (hi-room-floor*). Taken at its brightest
  //   tenth, near the wall;
  // - the glass, at every point of the lights: the storm sky, at the opacity the lancet draws it with,
  //   over the dim moonlit glass (the glazing's own fill and hi-art-glass, at that window's opacity:
  //   the one away from the moon is dimmer), with the trees and the leading the lancet draws
  //   in silhouette over the sky; taken at its median.
  // That is what the renders measured (the pool's p90 against the glass's median; the glass's model
  // lands within ≈ 4 of luma of the render's, in both windows; the floor's only overstates it), without
  // what only darkens the pool there: the dark tiles and the joints, the fog and the vignette. Left out
  // of the glass, the trees and the leading made its model ≈ 15 of luma brighter than the render: a
  // pool brighter than the glass on screen passed.
  const luma = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const over = (under: number[], color: number[], alpha: number) => under.map((c, k) => c + (color[k]! - c) * alpha);
  const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.round(q * (values.length - 1))]!;
  const pool = MOON_POOL_PANES.flatMap((pane) => {
    const [xs, zs] = [pane.map(([x]) => x), pane.map(([, z]) => z)];
    const points: Point[] = [];
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.01) {
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.01) if (pointInPolygon([x, z], pane)) points.push(project(x, 0, z));
    }
    return points;
  });
  const lights = flattenPath(LANCET.lights).map(({points}) => points);
  const [xs, ys] = [lights.flat().map(([x]) => x), lights.flat().map(([, y]) => y)];
  const glass: Point[] = [];
  for (let x = Math.floor(Math.min(...xs)) + 0.5; x < Math.max(...xs); x++) {
    for (let y = Math.floor(Math.min(...ys)) + 0.5; y < Math.max(...ys); y++) if (lights.some((light) => pointInPolygon([x, y], light))) glass.push([x, y]);
  }
  assert.ok(pool.length > 1000 && glass.length > 1000, `${pool.length} pontos da poça, ${glass.length} do vidro`);
  // What the lancet draws over its storm sky, in silhouette: the trees (a point under them) and the
  // leading (a 1 px line: a point within half a pixel of it).
  const trees = flattenPath(LANCET.trees).map(({points}) => points);
  const leads = flattenPath(LANCET.leading).flatMap(({points}) => points.slice(1).map((point, k) => [points[k]!, point] as const));
  const nearLead = ([x, y]: Point) => leads.some(([[ax, ay], [bx, by]]) => {
    const [dx, dy] = [bx - ax, by - ay];
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy) < 0.5;
  });
  const cover = glass.map((point) => ({tree: trees.some((tree) => pointInPolygon(point, tree)), lead: nearLead(point)}));
  assert.ok(cover.filter(({tree}) => tree).length > 0.05 * glass.length && cover.some(({lead}) => lead), 'árvores e chumbo no vidro');
  for (const props of [hauntedInteriorLoopSchema.parse({}), hauntedInteriorLoopSchema.parse({lightningIntensity: 1, moonlightIntensity: 1})]) {
    getLightningStrikes(props).forEach((strike, i) => {
      const [frame, side] = [FLASH_FRAMES[i]!, strike.side];
      const facing = pick(getHauntedInteriorScene(props, frame, 960), 'lightning')[side]!;
      assert.ok(Math.abs(facing.opacity - props.lightningIntensity) < 1e-9, `relâmpago ${i}: o frame ${frame} cai no pico do clarão`);
      const markup = pictureMarkup(props, frame);
      const painted = paintedLayers(markup);
      // The model below reads each light as a colour-dodge gain: each layer is drawn once, with that
      // blend. By the moon's lancet, the sharp panes and their halo, and in a strike by either lancet,
      // the broad glow.
      const names = side === MOON_SIDE ? ['pool-sharp', 'pool-glow', 'storm-pool'] : ['storm-pool'];
      for (const name of names) {
        const uses = painted.filter((node) => fillOf(node) === `hi-${name}-${side}`);
        assert.ok(uses.length === 1 && uses[0]!.attrs.includes(DODGE_STYLE) && windowOf(uses[0]!) === side, `relâmpago ${i}: a camada ${name} da janela ${side}`);
      }
      // Every gain on the floor there, in the left half's user space, where each is drawn (and mirrored).
      const shade = rampAt(markup, 'hi-art-floor-shade');
      const mask = (node: MarkupNode) => /\smask="url\(#([\w-]+)\)"/.exec(node.attrs)?.[1] ?? '';
      const stormNode = painted.find((node) => fillOf(node) === `hi-storm-pool-${side}`)!;
      assert.equal(mask(stormNode), side === MOON_SIDE ? 'hi-storm-under-pool' : '', `relâmpago ${i}: a máscara da claridade`);
      const stormGlow = radialAt(markup, `hi-storm-pool-${side}`);
      const pass = (law: string) => (['glow', 'sharp'] as const).map((name) => rampAt(markup, `hi-pool-${law}-${name}`));
      const through = (ramps: ReturnType<typeof rampAt>[], point: Point) => ramps.reduce((value, ramp) => value * (1 - poolAlpha(ramp(point).opacity)), 1);
      const poolLayers = side === MOON_SIDE ? (['sharp', 'glow'] as const).map((name) => rampAt(markup, `hi-pool-${name}-${side}`)) : [];
      const hole = radialAt(markup, 'hi-storm-hole');
      // What each floor mask lets through at a point: the box's fade, the pool's layers and the glow's hole.
      const floorPass = (id: string, point: Point) => shaftVisibility(point)
        * (['hi-room-floor', 'hi-room-floor-both'].includes(id) ? through(pass('add'), point) : 1)
        * (['hi-room-floor-storm', 'hi-room-floor-both'].includes(id) ? 1 - hole.alpha(point) : 1);
      const floorLights = painted.filter((node) => /^hi-(?:flash-room|sky-glow)-[01]$/.test(fillOf(node)) && clipsOf(node).includes('hi-floor-visible') && windowOf(node) === side);
      assert.equal(floorLights.length, 2, `relâmpago ${i}: o reflexo e o céu no piso`);
      const room = floorLights.find((node) => fillOf(node).startsWith('hi-flash-room'))!;
      const roomStops = stopsOf(markup, fillOf(room)).map(({offset, color}) => ({offset, gain: channelsOf(color).map((c) => c / (255 - c))}));
      const roomAt = ([x, y]: Point) => {
        const t = Math.min(1, Math.hypot((x - numberAttr(room, 'cx')) / numberAttr(room, 'rx'), (y - numberAttr(room, 'cy')) / numberAttr(room, 'ry')));
        const next = roomStops.findIndex(({offset}) => offset >= t);
        const [lo, hi] = [roomStops[Math.max(0, next - 1)]!, roomStops[next]!];
        const share = hi.offset > lo.offset ? (t - lo.offset) / (hi.offset - lo.offset) : 1;
        return lo.gain.map((g, k) => g + (hi.gain[k]! - g) * share);
      };
      const skyGlow = radialAt(markup, `hi-sky-glow-${side}`);
      const lit = pool.map((point) => {
        const floor = shade(point);
        const gains = [
          ...poolLayers.map((ramp) => {
            const {channels, opacity} = ramp(point);
            return channels.map((c) => (poolAlpha(opacity) * c) / (255 - c));
          }),
          stormGlow.at(point).map((gain) => gain * (side === MOON_SIDE ? through(pass('cap'), point) : 1)),
          roomAt(point).map((gain) => gain * floorPass(mask(room), point)),
          skyGlow.at(point).map((gain) => gain * floorPass(mask(floorLights.find((node) => node !== room)!), point)),
        ];
        return luma(over(channelsOf(MARBLE.light), floor.channels, floor.opacity)
          .map((c, k) => Math.min(255, gains.reduce((value, gain) => value * (1 + gain[k]!), c))));
      });
      // The glass: each window's storm sky is drawn at the opacity of the group around it, left then
      // right, and then, in the same lancet, its trees and its leading, in groups at that opacity.
      const skies = painted.filter((node) => fillOf(node) === 'hi-flash-sky');
      assert.equal(skies.length, 2, 'o céu do relâmpago nas duas janelas');
      const sky = numberAttr(skies[side]!.parent!, 'opacity');
      const after = (d: string) => painted.slice(painted.indexOf(skies[side]!)).find((node) => node.attrs.includes(` d="${d}"`));
      const [tree, lead] = [after(LANCET.trees), after(LANCET.leading)];
      const treeFill = /\sfill="(#[0-9a-fA-F]{6})"/.exec(tree?.attrs ?? '')?.[1];
      const leadStroke = /\sstroke="(#[0-9a-fA-F]{6})"/.exec(lead?.attrs ?? '')?.[1];
      assert.ok(tree && lead && treeFill && leadStroke && numberAttr(tree.parent!, 'opacity') === sky && numberAttr(lead.parent!, 'opacity') === sky,
        `relâmpago ${i}: as árvores e o chumbo contra o céu`);
      const leadAlpha = numberAttr(lead, 'opacity') * sky;
      const glazings = painted.flatMap((node, k) => (fillOf(node) === 'hi-art-glass' ? [k] : []));
      assert.equal(glazings.length, 2, 'o vidro enluarado nas duas janelas');
      const glazing = glazings[side]!;
      const dim = /\sfill="(#[0-9a-fA-F]{6})"/.exec(painted[glazing - 1]?.attrs ?? '')?.[1];
      const moonlit = numberAttr(painted[glazing]!, 'opacity');
      assert.ok(sky > 0 && sky <= 1 && dim && moonlit > 0 && moonlit <= 1 && leadAlpha > 0 && leadAlpha <= 1, `céu a ${sky}, vidro ${dim} a ${moonlit}`);
      const [moonGlass, storm] = [rampAt(markup, 'hi-art-glass'), rampAt(markup, 'hi-flash-sky')];
      const seen = glass.map((point, k) => {
        const [moon, flash] = [moonGlass(point), storm(point)];
        let color = over(over(channelsOf(dim), moon.channels, moon.opacity * moonlit), flash.channels, flash.opacity * sky);
        if (cover[k]!.tree) color = over(color, channelsOf(treeFill), sky);
        if (cover[k]!.lead) color = over(color, channelsOf(leadStroke), leadAlpha);
        return luma(color);
      });
      const [bright, median] = [quantile(lit, 0.9), quantile(seen, 0.5)];
      assert.ok(bright <= median, `relâmpago ${i}, clarão ${props.lightningIntensity}, luar ${props.moonlightIntensity}: a poça (${bright.toFixed(1)}) fica mais clara que o vidro que a acende (${median.toFixed(1)})`);
    });
  }
});

/** The window a painted layer belongs to: the right half of the hall is the left one drawn mirrored. */
const windowOf = (node: MarkupNode) => (ancestry(node).some((entry) => entry.attrs.includes('transform="translate(1920 0) scale(-1 1)"')) ? 1 : 0);
/** The light each stop of a gain gradient adds, per channel (a colour-dodge colour S gives the gain S / (1 − S)). */
const gainsOfStops = (markup: string, id: string) => stopsOf(markup, id).map(({color}) => channelsOf(color).map((s) => s / (255 - s)));
const lumaOfGain = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
/** The lancet away from the moon, on the facing wall. */
const SKY_SIDE = 1 - MOON_SIDE;

test('Interior: a lua do salão é a mesma do corredor — o luar dos dois vem do mesmo lado e corre para a câmera', () => {
  // The frame shows two moonlit places: the hall, through its moon's lancet, and the corridor behind the
  // archway, through the door that stands open onto a moonlit room and the stair hall beyond its end.
  // One moon lights both, so their light runs the same way across the screen and towards the camera.
  // In the hall: MOON_DIRECTION runs from the left wall into the hall and is mirrored with the right
  // half, so on screen it heads towards +x from the left wall and −x from the right one.
  const hall = {x: (MOON_SIDE ? -1 : 1) * MOON_DIRECTION.x, z: MOON_DIRECTION.z};
  const poolRun = (MOON_SIDE ? -1 : 1) * (MOON_POOL_AXIS.to[0] - MOON_POOL_AXIS.from[0]);
  assert.ok(Math.sign(poolRun) === Math.sign(hall.x) && hall.z < 0, 'a poça do salão corre na direção do luar dele');
  // In the corridor: the moonlit room is behind the open door's wall (the one door ajar), its light
  // crosses the corridor away from that wall (SPILL_DIR, read from the module, which does not export
  // it) and a little towards the camera, past the leaf swung open towards it.
  const open = DOORS.filter((door) => door.ajar > 0);
  assert.equal(open.length, 1, 'uma porta aberta, para o quarto enluarado');
  const source = readFileSync(new URL('../src/backgrounds/halloween/HauntedCorridor.tsx', import.meta.url), 'utf8');
  const spill = /const SPILL_DIR = \{x: (-?)OPEN\.side, d: (-?[\d.]+)\}/.exec(source);
  assert.ok(spill, 'a direção do luar no corredor (SPILL_DIR)');
  const corridor = {x: (spill[1] === '-' ? -1 : 1) * open[0]!.side, d: Number(spill[2])};
  assert.ok(corridor.x === -open[0]!.side && corridor.d < 0 && openLeaf(open[0]!).dir.d < 0, 'o luar sai da porta, atravessa o corredor e vem para a câmera');
  assert.equal(Math.sign(hall.x), Math.sign(corridor.x), `o luar do salão corre para ${hall.x > 0 ? '+' : '−'}x, e o do corredor, para ${corridor.x > 0 ? '+' : '−'}x: duas luas`);
  // The stair hall beyond the end door is lit from the same side: its moonlight is brightest there and
  // dies out towards the other side (hi-cor-moon-beyond, as the frame draws it).
  const markup = pictureMarkup(hauntedInteriorLoopSchema.parse({}), 790);
  const beyond = /<linearGradient id="hi-cor-moon-beyond"([^>]*)>/.exec(markup)?.[1] ?? '';
  const [x1, x2] = ['x1', 'x2'].map((name) => Number(new RegExp(`\\s${name}="([^"]+)"`).exec(beyond)?.[1]));
  assert.ok(Number.isFinite(x1) && Number.isFinite(x2) && x1 !== x2, 'o luar além da porta do fundo');
  assert.equal(Math.sign(x2! - x1!), Math.sign(hall.x), 'o luar além da porta do fundo vem do outro lado');
  // Only the heading is pinned: the corridor's azimuth and elevation differ a little from the hall's
  // (its spill runs about 17° towards the camera, the stair hall's light falls at about 56°, against
  // the hall's MOON_DIRECTION, about 33° off the wall's normal at about 43°), unseen at this scale.
  // So the moon is on the right: the hall's right lancet is the one that sees it, and the Studio says so.
  assert.equal(MOON_SIDE, 1, 'a lua do salão fica à direita, como a do corredor');
  assert.match(hauntedInteriorLoopSchema.shape.moonlightIntensity.unwrap().description ?? '',
    MOON_SIDE ? /right window.*on the left/ : /left window.*on the right/, 'o Studio põe o luar do lado da lua');
});

test('Interior: uma lua só — só a lanceta do lado da lua recebe o luar direto, e a oposta, só a luz difusa do céu', () => {
  // The moon stands outside one side wall, MOON_SIDE (which one is pinned below, against the corridor's
  // moonlight): MOON_DIRECTION runs from that wall into the hall, drawn in the left half and mirrored.
  // The lancets face each other, so the other one looks at the other half of the sky. A window-shaped
  // pool, the shadows of its bars or a shaft by that one would mean a second moon on the far side of
  // the house.
  assert.ok(MOON_SIDE === 0 || MOON_SIDE === 1, 'a lua fica do lado de fora de uma das paredes');
  assert.ok(MOON_DIRECTION.x > 0, 'o luar entra pela parede, rumo ao salão');
  // In the scene, the other window takes a small, steady share of the moon's light, the moonlit sky's,
  // which breathes with it.
  for (const seed of [1, 113, 2026]) {
    for (const moonlightIntensity of [0.3, 0.65, 1]) {
      const props = hauntedInteriorLoopSchema.parse({seed, moonlightIntensity});
      const shares = new Set<string>();
      for (let frame = 0; frame < 960; frame += 7) {
        const moons = pick(getHauntedInteriorScene(props, frame, 960), 'moonlight');
        const [moon, sky] = [moons[MOON_SIDE]!, moons[SKY_SIDE]!];
        assert.ok(moon.opacity > 0 && sky.opacity > 0 && sky.opacity <= 0.25 * moon.opacity,
          `seed ${seed}, luar ${moonlightIntensity}, frame ${frame}: a lua a ${moon.opacity}, o céu a ${sky.opacity}`);
        shares.add((sky.opacity / moon.opacity).toFixed(9));
      }
      assert.equal(shares.size, 1, `seed ${seed}: o céu respira fora de fase com a lua`);
    }
    // The dust shines where light catches it: in the moonlight by the moon's lancet, and at most half as
    // much in the other strip, which only the sky's diffuse light and the candles reach.
    const props = hauntedInteriorLoopSchema.parse({seed});
    const dust = Array.from({length: 120}, (_, k) => pick(getHauntedInteriorScene(props, k * 8, 960), 'dust')).flat();
    const brightest = (motes: HauntedInteriorElement[]) => Math.max(...motes.map((mote) => mote.opacity));
    const sideOf = (mote: HauntedInteriorElement) => (mote.x > 960 ? 1 : 0);
    const [moonDust, skyDust] = [brightest(dust.filter((mote) => sideOf(mote) === MOON_SIDE)), brightest(dust.filter((mote) => sideOf(mote) === SKY_SIDE))];
    // (A mote shines at most 0.28, in the moonlight.)
    assert.ok(moonDust > 0.2 && skyDust > 0 && skyDust <= 0.5 * 0.28 + 1e-12, `seed ${seed}: a poeira brilha até ${moonDust} do lado da lua e ${skyDust} do outro`);
  }
  // In the frame, out of a strike (between the strikes, and at their peaks with lightningIntensity 0),
  // whatever the moon's strength.
  const dark = [...[0, 480, 790].map((frame) => ({frame, lightningIntensity: 0.7})), ...FLASH_FRAMES.map((frame) => ({frame, lightningIntensity: 0}))];
  for (const moonlightIntensity of [0.3, 0.65, 1]) {
    for (const {frame, lightningIntensity} of dark) {
      const props = hauntedInteriorLoopSchema.parse({moonlightIntensity, lightningIntensity});
      if (lightningIntensity) assert.ok(!getActiveStrike(props, frame, 960), `frame ${frame} cai num relâmpago`);
      const markup = pictureMarkup(props, frame);
      const painted = paintedLayers(markup);
      const where = `luar ${moonlightIntensity}, frame ${frame}`;
      // The sharp pool, with the bars' shadows, and its halo: lit on the moon's side, and only there
      // (the lancet's panes are drawn on the floor by the moon's lancet alone, in every frame). By both,
      // the lightning's broad glow is drawn (so a strike never changes how the frame is composed) but
      // with no light at all.
      for (const name of ['sharp', 'glow']) {
        assert.ok(gainsOfStops(markup, `hi-pool-${name}-${MOON_SIDE}`).every((gain) => lumaOfGain(gain) > 0), `${where}: a poça do luar (${name}) apagada`);
        assert.ok(!markup.includes(`id="hi-pool-${name}-${SKY_SIDE}"`), `${where}: uma poça (${name}) na janela sem lua`);
      }
      const panes = painted.filter((node) => node.attrs.includes('href="#hi-pool"'));
      assert.ok(panes.length === 2 && panes.every((node) => windowOf(node) === MOON_SIDE), `${where}: ${panes.length} camadas de vidraças no piso`);
      for (const side of [0, 1]) {
        assert.ok(gainsOfStops(markup, `hi-storm-pool-${side}`).every((gain) => gain.every((value) => value === 0)), `${where}: a claridade do relâmpago acesa na janela ${side}`);
      }
      // One shaft, the moon's, through its own lancet.
      const shafts = painted.filter((node) => node.tag === 'use' && node.attrs.includes('href="#hi-shaft"'));
      assert.ok(shafts.length === 1 && shafts[0]!.attrs.includes('stroke="url(#hi-beam)"') && windowOf(shafts[0]!) === MOON_SIDE,
        `${where}: ${shafts.length} feixes`);
      // The moonlit sky's diffuse light on the floor, under each lancet: one soft, radial glow, not the
      // pool's panes, hugging the wall under the lancet (its centre less than 1 m out, within the
      // lancet's width along the wall), at its brightest at most a quarter of the light the moon's pool
      // adds at its brightest (both layers of the pool at its near end). By the window away from the
      // moon it is all the light that comes in; by the moon's the pool lies over it, and it is no dimmer
      // there (the sky on the moon's side is not the darker one).
      const glows = painted.filter((node) => /url\(#hi-sky-glow-[01]\)/.test(node.attrs));
      assert.ok(glows.length === 2 && glows.every((node, k) => node.tag === 'path' && fillOf(node) === `hi-sky-glow-${k}` && windowOf(node) === k),
        `${where}: a luz difusa do céu no piso`);
      const sky = gainsOfStops(markup, `hi-sky-glow-${SKY_SIDE}`).map(lumaOfGain);
      assert.ok(sky[0]! > 0 && sky.every((value, k) => k === 0 || value <= sky[k - 1]! + 1e-12) && sky[sky.length - 1] === 0,
        `${where}: o céu no piso ${sky.map((value) => value.toFixed(3)).join(' ')}`);
      gainsOfStops(markup, `hi-sky-glow-${MOON_SIDE}`).map(lumaOfGain).forEach((value, k) =>
        assert.ok(value >= sky[k]! - 1e-12, `${where}: o céu no piso, parada ${k}, mais escuro sob a lanceta da lua (${value.toFixed(3)})`));
      // Soft, with no core: at half its radius it adds at most 60% of its centre's light.
      assert.ok(sky[5]! <= 0.6 * sky[0]!, `${where}: o céu no piso cai de ${sky[0]!.toFixed(3)} a só ${sky[5]!.toFixed(3)} no meio do raio`);
      const [sharp, halo] = [gainsOfStops(markup, `hi-pool-sharp-${MOON_SIDE}`)[0]!, gainsOfStops(markup, `hi-pool-glow-${MOON_SIDE}`)[0]!];
      const pool = lumaOfGain(sharp.map((gain, c) => (1 + gain) * (1 + halo[c]!) - 1));
      assert.ok(sky[0]! <= 0.25 * pool, `${where}: o céu soma ${sky[0]!.toFixed(3)} no piso, e a poça ${pool.toFixed(3)}`);
      const gradient = new RegExp(`<radialGradient id="hi-sky-glow-${SKY_SIDE}"([^>]*)>`).exec(markup)?.[1] ?? '';
      const matrix = /gradientTransform="matrix\(([^)]*)\)"/.exec(gradient)?.[1]?.split(' ').map(Number) ?? [];
      assert.ok(gradient.includes('gradientUnits="userSpaceOnUse"') && matrix.length === 6, 'o degradê do céu no piso');
      const [ax, ay, bx, by, sx, sy] = matrix as [number, number, number, number, number, number];
      const z = (FOCAL * HALL.eye) / (sy - VP.y);
      const x = ((sx - VP.x) * z) / FOCAL;
      const [out, along] = [x + HALL.halfWidth, z - (BACK_Z - WINDOW.u / 100)];
      assert.ok(out > 0 && out < 1 && Math.abs(along) < WINDOW.half / 100, `${where}: o céu pousa a ${out.toFixed(2)} m da parede, ${along.toFixed(2)} m da lanceta`);
      // Its size on the floor, from the gradient's axes (on screen, the floor's foreshortening at the
      // centre): one runs out from the wall, the other along it, with no stretch in any other direction,
      // and neither reaches far: at most 1.6 m into the hall (a third of the way to its centre line) and
      // 2 m along the wall.
      const step = 1e-4;
      const [centre, across, depth] = [project(x, 0, z), project(x + step, 0, z), project(x, 0, z + step)];
      const [dx, dz] = [[across[0] - centre[0], across[1] - centre[1]], [depth[0] - centre[0], depth[1] - centre[1]]].map(([u, v]) => [u! / step, v! / step]);
      const radius = ([u, v]: number[], [p, q]: number[]) => {
        assert.ok(Math.abs(u! * q! - v! * p!) <= 1e-3 * Math.hypot(u!, v!) * Math.hypot(p!, q!), `${where}: o céu no piso se estica de viés`);
        return Math.hypot(u!, v!) / Math.hypot(p!, q!);
      };
      const [reach, spread] = [radius([ax, ay], dx!), radius([bx, by], dz!)];
      assert.ok(reach > 0.3 && reach <= 1.6 && spread > 0.3 && spread <= 2,
        `${where}: o céu no piso vai ${reach.toFixed(2)} m para dentro do salão e ${spread.toFixed(2)} m ao longo da parede`);
      // The light on the floor passes under the pool where there is one, divided by one plus the pool's
      // gain (the two gains would multiply), and only there: by the window away from the moon, cutting
      // it where a pool would lie would leave on the floor the dark print of the second moon's pool.
      const floorLights = painted.filter((node) => /^hi-(?:sky-glow|flash-room)-[01]$/.test(fillOf(node)) && clipsOf(node).includes('hi-floor-visible'));
      assert.equal(floorLights.length, 4, `${where}: ${floorLights.length} luzes no piso`);
      for (const node of floorLights) {
        const mask = /\smask="url\(#([\w-]+)\)"/.exec(node.attrs)?.[1] ?? '';
        const cut = (new RegExp(`<mask id="${mask}"[^>]*>(.*?)</mask>`).exec(markup)?.[1] ?? '').includes('href="#hi-pool"');
        assert.equal(cut, windowOf(node) === MOON_SIDE, `${where}: ${fillOf(node)} recortada ${cut ? 'por uma poça que não existe' : 'fora da poça do luar'}`);
      }
      // On the wall around the lancet away from the moon, the moon's cool light is the sky's too: at most a quarter of the other one's.
      const washes = painted.filter((node) => fillOf(node) === 'hi-cool-wash');
      assert.ok(washes.length === 2 && washes.map(windowOf).join() === '0,1', `${where}: a luz fria em volta das lancetas`);
      const [moonWash, skyWash] = [numberAttr(washes[MOON_SIDE]!, 'opacity'), numberAttr(washes[SKY_SIDE]!, 'opacity')];
      assert.ok(moonWash > 0 && skyWash > 0 && skyWash <= 0.25 * moonWash, `${where}: a luz fria a ${moonWash} e ${skyWash}`);
    }
  }
  // The walls themselves: the glass of the lancet away from the moon shows the same moonlit clouds,
  // dimmer, and every touch of moonlight on it (the glass, its sheen, the sill, the velvet's inner edge)
  // is fainter than the same touch on the moon's.
  const hall = paintedLayers(renderToStaticMarkup(createElement('svg', null,
    createElement(HauntedInteriorArchitecture, {moonlight: '#A8BDB0', candle: '#CA8A48', atmosphere: '#536C68', transparent: false}))));
  const glazings = hall.filter((node) => fillOf(node) === 'hi-art-glass');
  assert.ok(glazings.length === 2 && glazings.map(windowOf).join() === '0,1', 'o vidro enluarado das duas janelas');
  const [moonGlass, skyGlass] = [numberAttr(glazings[MOON_SIDE]!, 'opacity'), numberAttr(glazings[SKY_SIDE]!, 'opacity')];
  assert.ok(moonGlass === 1 && skyGlass >= 0.5 && skyGlass < 0.9, `o vidro a ${moonGlass} e ${skyGlass}`);
  const touches = [0, 1].map((side) => hall.filter((node) => windowOf(node) === side && clipsOf(node).includes('hi-art-side-clip')
    && /\s(?:fill|stroke)="#A8BDB0"/.test(node.attrs)));
  assert.ok(touches[0]!.length >= 3 && touches[0]!.length === touches[1]!.length, `${touches[0]!.length} e ${touches[1]!.length} toques de luar`);
  touches[MOON_SIDE]!.forEach((node, k) => {
    const [moon, sky] = [numberAttr(node, 'opacity'), numberAttr(touches[SKY_SIDE]![k]!, 'opacity')];
    assert.ok(moon > 0 && sky > 0 && sky < moon, `<${node.tag}${node.attrs.slice(0, 50)}>: ${moon} na janela da lua, ${sky} na outra`);
  });
  // With the moon dimmed, the moon's lancet shows less of it: its glass and its touches fall towards the
  // other lancet's, which they reach with no moon at all (then neither window is the brighter one), and
  // stay in full from the default moonlight up. The other lancet's never change.
  const touchesAt = (moonlightIntensity: number) => {
    const nodes = paintedLayers(renderToStaticMarkup(createElement('svg', null, createElement(HauntedInteriorArchitecture,
      {moonlight: '#A8BDB0', candle: '#CA8A48', atmosphere: '#536C68', transparent: false, moonlightIntensity}))));
    return [0, 1].map((side) => nodes.filter((node) => windowOf(node) === side && (fillOf(node) === 'hi-art-glass'
      || (clipsOf(node).includes('hi-art-side-clip') && /\s(?:fill|stroke)="#A8BDB0"/.test(node.attrs)))).map((node) => numberAttr(node, 'opacity')));
  };
  const reference = touchesAt(hauntedInteriorLoopSchema.parse({}).moonlightIntensity);
  let previous: number[] | undefined;
  for (const moonlightIntensity of [0, 0.2, 0.4, 0.65, 0.8, 1]) {
    const opacities = touchesAt(moonlightIntensity);
    const [moon, sky] = [opacities[MOON_SIDE]!, opacities[SKY_SIDE]!];
    assert.ok(moon.length === sky.length && moon.length >= 4, `luar ${moonlightIntensity}: ${moon.length} e ${sky.length} toques de luar`);
    assert.deepEqual(sky, reference[SKY_SIDE], `luar ${moonlightIntensity}: a janela sem lua muda com o luar`);
    moon.forEach((value, k) => {
      assert.ok(value >= sky[k]! - 1e-12 && value <= reference[MOON_SIDE]![k]! + 1e-12 && (!previous || value >= previous[k]! - 1e-12),
        `luar ${moonlightIntensity}: o toque ${k} da janela da lua a ${value} (a outra, ${sky[k]})`);
      if (moonlightIntensity === 0) assert.ok(Math.abs(value - sky[k]!) < 1e-9, `sem lua, a janela da lua ainda é a mais clara (${value} e ${sky[k]})`);
      if (moonlightIntensity >= 0.65) assert.ok(Math.abs(value - reference[MOON_SIDE]![k]!) < 1e-9, `luar ${moonlightIntensity}: a janela da lua a ${value}`);
    });
    previous = moon;
  }
});

/** The share of a strike's light the far window lets in, [at least, at most] of the facing one's, by the gain it drives. */
const FAR_SHARE: Record<string, readonly [number, number]> = {'flash-wash': [0.2, 0.3], 'flash-room': [0, 0.25], 'candelabra-rim': [0, 0.25]};

test('Interior: num relâmpago, só a lanceta voltada para ele deixa entrar a luz dele; na outra, o vidro clareia e o salão quase não', () => {
  // A bolt is a light of its own: it lights the hall through the lancet facing it, whichever it is, with
  // a broad, soft glow on the floor (only while the flash lasts; checked below), the wall around it,
  // its foot and the candelabra's bronze. The other lancet sees only the sky brighten: its glass
  // flashes (with the strike's `far`), but its floor gets no glow and the room takes little of that
  // light: its floor, the wall's foot and the bronze at most a quarter of what the facing ones take,
  // and the stone around its glass (jambs, sill and moulding, which the lit glass shows), between a
  // fifth and 30%, in the opaque hall and over gameplay alike. Neither lights a shaft: the moon's beam
  // is the moon's rays, and a strike leaves it as it was. That the facing floor never outshines its
  // glass is checked above. The glow follows its glass frame by frame: the light it adds at its
  // centre, per unit of the opacity its storm sky is drawn with, is the same through the whole strike.
  for (const input of [{}, {lightningIntensity: 1, moonlightIntensity: 1}, {lightningIntensity: 0.35, moonlightIntensity: 0.3}]) {
    const props = hauntedInteriorLoopSchema.parse(input);
    const off = hauntedInteriorLoopSchema.parse({...input, lightningIntensity: 0});
    const clear = hauntedInteriorLoopSchema.parse({...input, transparent: true});
    getLightningStrikes(props).forEach((strike, i) => {
      const [facing, far] = [strike.side, 1 - strike.side];
      const glows: {flash: number; glow: number; gain: number[]; sky: number}[] = [];
      const [first, last] = [Math.floor(strike.start * 60) - 2, Math.ceil((strike.start + LIGHTNING.length) * 60) + 2];
      for (let frame = first; frame <= last; frame += frame < first + 20 ? 1 : 3) {
        const lights = pick(getHauntedInteriorScene(props, frame, 960), 'lightning');
        const [markup, dark] = [pictureMarkup(props, frame), pictureMarkup(off, frame)];
        const where = `relâmpago ${i} (janela ${facing}), ${JSON.stringify(input)}, frame ${frame}`;
        assert.ok(lights[far]!.opacity <= lights[facing]!.opacity, `${where}: a janela oposta clareia mais`);
        for (const id of [`hi-storm-pool-${far}`, `hi-pool-sharp-${MOON_SIDE}`, `hi-pool-glow-${MOON_SIDE}`]) {
          assert.deepEqual(gainsOfStops(markup, id), gainsOfStops(dark, id), `${where}: ${id} muda`);
        }
        // The one shaft is the moon's, as in the dark: the flash lights none.
        const shafts = paintedLayers(markup).filter((node) => node.tag === 'use' && node.attrs.includes('href="#hi-shaft"'));
        const darkShafts = paintedLayers(dark).filter((node) => node.tag === 'use' && node.attrs.includes('href="#hi-shaft"'));
        assert.ok(shafts.length === 1 && windowOf(shafts[0]!) === MOON_SIDE && shafts[0]!.attrs === darkShafts[0]?.attrs && !markup.includes('hi-beam-flash'),
          `${where}: ${shafts.length} feixes`);
        for (const family of ['flash-wash', 'flash-room', 'candelabra-rim']) {
          const [near, away] = [facing, far].map((side) => lumaOfGain(gainsOfStops(markup, `hi-${family}-${side}`)[0]!));
          // (Each colour is written to 0.01 of a channel: the smallest gains read back a little off.)
          assert.ok(away <= FAR_SHARE[family]![1] * near + 1e-4 && away >= FAR_SHARE[family]![0] * near - 1e-4,
            `${where}: hi-${family} soma ${away.toFixed(3)} na janela oposta e ${near.toFixed(3)} na voltada para o raio`);
        }
        // Over gameplay the same light is painted as covers, which must keep the same shares: each of
        // the far window's (around the lancet, on its sill, velvet and gold, and at the wall's foot)
        // against the same cover of the window facing the strike.
        const covers = paintedLayers(pictureMarkup(clear, frame)).filter((node) => /^hi-flash-(?:cover|sill|velvet|tieback)$/.test(fillOf(node)));
        const [nearCovers, awayCovers] = [facing, far].map((side) => covers.filter((node) => windowOf(node) === side));
        assert.ok(nearCovers.length === (lights[facing]!.opacity > 0 ? 7 : 0) && awayCovers.length === nearCovers.length,
          `${where}: ${nearCovers.length} e ${awayCovers.length} coberturas sobre o jogo`);
        nearCovers.forEach((node, k) => {
          const away = awayCovers[k]!;
          const [family, share] = numberAttr(node, 'cy') > CONTENT_BOX.bottom ? ['flash-room', 'no pé da parede'] : ['flash-wash', 'em volta da lanceta'];
          const ratio = numberAttr(away, 'opacity') / numberAttr(node, 'opacity');
          assert.ok(fillOf(away) === fillOf(node) && numberAttr(away, 'cy') === numberAttr(node, 'cy')
            && ratio >= FAR_SHARE[family]![0] - 1e-9 && ratio <= FAR_SHARE[family]![1] + 1e-9,
          `${where}, sobre o jogo: ${fillOf(node)} ${share} a ${ratio.toFixed(3)} da janela voltada para o raio`);
        });
        const gain = stormGain(markup, facing);
        const sky = paintedLayers(markup).find((node) => fillOf(node) === 'hi-flash-sky' && windowOf(node) === facing);
        glows.push({flash: lights[facing]!.opacity, glow: lumaOfGain(gain), gain, sky: sky ? numberAttr(sky.parent!, 'opacity') : 0});
      }
      // The facing lancet's glow is the bolt's alone: none before or after the flash, and brighter with it.
      assert.ok(glows.some(({flash}) => flash === 0) && glows.some(({flash}) => flash > 0), `relâmpago ${i}: o clarão inteiro`);
      for (const {flash, glow} of glows) assert.equal(glow > 0, flash > 0, `relâmpago ${i}: a claridade da janela ${facing} com o clarão a ${flash}`);
      const sorted = [...glows].sort((a, b) => a.flash - b.flash);
      sorted.forEach(({glow}, k) => assert.ok(k === 0 || glow >= sorted[k - 1]!.glow - 1e-12, `relâmpago ${i}: a claridade não cresce com o clarão`));
      // Per unit of its sky's opacity, the same light in every lit frame (each colour is written to
      // 0.01 of a channel, which shifts the gain it reads back by up to 0.005·(1 + gain)² / 255).
      const lit = glows.filter(({flash}) => flash > 0);
      assert.ok(lit.length > 10 && lit.every(({sky}) => sky > 0), `relâmpago ${i}: ${lit.length} frames acesos`);
      const peak = lit.reduce((best, entry) => (entry.sky > best.sky ? entry : best));
      for (const {gain, sky, flash} of lit) {
        gain.forEach((value, c) => {
          const slack = (0.005 * (1 + value) ** 2) / 255 / sky + (0.005 * (1 + peak.gain[c]!) ** 2) / 255 / peak.sky;
          assert.ok(Math.abs(value / sky - peak.gain[c]! / peak.sky) <= slack + 1e-12,
            `relâmpago ${i}, clarão ${flash.toFixed(3)}: a claridade soma ${(value / sky).toFixed(4)} por unidade de céu, e ${(peak.gain[c]! / peak.sky).toFixed(4)} no pico`);
        });
      }
    });
  }
  assert.deepEqual(getLightningStrikes(hauntedInteriorLoopSchema.parse({})).map(({side}) => side).sort(), [0, 1], 'um relâmpago em cada janela');
});

test('Interior: num relâmpago, por qualquer lanceta, a luz no piso é larga e macia, sem vidraças, e traz a luz do clarão só espalhada', () => {
  // The moon is a point of light (half a degree of sky): through its lancet it draws on the floor the
  // panes, the shadows of the bars and the window's edge. A bolt lights the hall from a broad source,
  // its channel and the clouds lit around it, tens of degrees of sky: through either lancet its light
  // on the floor has no panes, no bars and no edge. Drawn with the moon's panes, mirrored, by the other
  // lancet, it was the picture of a second moon for a third of a second in every loop; by the moon's,
  // a brighter pattern of the same panes read as the moon flaring.
  const props = hauntedInteriorLoopSchema.parse({});
  const strikes = getLightningStrikes(props);
  assert.deepEqual(strikes.map(({side}) => side).sort(), [0, 1], 'um relâmpago em cada janela');
  const framesOf = (strike: LightningStrike) => Array.from({length: Math.ceil(LIGHTNING.length * 60) + 4}, (_, k) => Math.floor(strike.start * 60) - 2 + k);
  // In no frame, dark or in either strike, does a window lay panes on the floor but the moon's: the
  // lightning's light is one radial glow on the floor by each lancet, a colour-dodge gain like the
  // rest, which passes under the moon's pool where it lies over it (checked above).
  for (const frame of [0, 480, 790, ...strikes.flatMap(framesOf)]) {
    const markup = pictureMarkup(props, frame);
    const painted = paintedLayers(markup);
    const panes = painted.filter((node) => node.attrs.includes('href="#hi-pool"'));
    assert.ok(panes.length === 2 && panes.every((node) => windowOf(node) === MOON_SIDE), `frame ${frame}: ${panes.length} camadas de vidraças no piso`);
    for (const name of ['sharp', 'glow']) assert.ok(!markup.includes(`id="hi-pool-${name}-${SKY_SIDE}"`), `frame ${frame}: vidraças (${name}) na janela sem lua`);
    for (const side of [0, 1]) {
      const storms = painted.filter((node) => fillOf(node) === `hi-storm-pool-${side}`);
      assert.ok(storms.length === 1 && storms[0]!.tag === 'path' && windowOf(storms[0]!) === side && clipsOf(storms[0]!).includes('hi-floor-visible')
        && storms[0]!.attrs.includes(DODGE_STYLE), `frame ${frame}: a claridade do relâmpago na janela ${side}`);
    }
  }
  const lit = hauntedInteriorLoopSchema.parse({lightningIntensity: 1, moonlightIntensity: 0});
  const peaks = [0, 1].map((side) => {
    const index = strikes.findIndex((strike) => strike.side === side);
    const markup = pictureMarkup(lit, FLASH_FRAMES[index]!);
    const node = paintedLayers(markup).find((entry) => fillOf(entry) === 'hi-flash-sky' && windowOf(entry) === side);
    assert.ok(node, `o céu do relâmpago na janela ${side}`);
    return {markup, storm: radialAt(markup, `hi-storm-pool-${side}`), sky: numberAttr(node.parent!, 'opacity')};
  });
  // The same glow by either window (drawn in the left half, mirrored for the right one): the same
  // outline and, per unit of the opacity of its storm sky, the same light.
  assert.deepEqual(peaks[0]!.storm.axes, peaks[1]!.storm.axes, 'a claridade das duas janelas');
  assert.deepEqual(peaks[0]!.storm.centre, peaks[1]!.storm.centre, 'a claridade das duas janelas');
  const [perSky0, perSky1] = peaks.map(({storm, sky}) => storm.stops[0]!.gain.map((gain) => gain / sky));
  perSky0!.forEach((gain, c) => assert.ok(Math.abs(gain - perSky1![c]!) <= 0.02 * gain, `canal ${c}: a claridade soma ${gain.toFixed(3)} e ${perSky1![c]!.toFixed(3)} por unidade de céu`));
  // Where it lies and how far it reaches, on the floor (read from the gradient's centre and axes, which
  // carry the floor's foreshortening there): centred on the lancet's footprint along the moon's
  // heading (in the left half, as the pool is drawn), one axis along that heading and the other across
  // it, and broader than the footprint by at least 0.3 m on every side (the spread of a broad source),
  // yet short of the hall's centre line.
  const {storm, markup, sky} = peaks[0]!;
  const run = Math.hypot(MOON_DIRECTION.x, MOON_DIRECTION.z);
  const [hx, hz] = [MOON_DIRECTION.x / run, MOON_DIRECTION.z / run];
  const z = (FOCAL * HALL.eye) / (storm.centre[1] - VP.y);
  const x = ((storm.centre[0] - VP.x) * z) / FOCAL;
  const footprint = MOON_POOL_PANES.flat();
  const [along, across] = [footprint.map(([px, pz]) => px * hx + pz * hz), footprint.map(([px, pz]) => pz * hx - px * hz)];
  const [s, t] = [x * hx + z * hz, z * hx - x * hz];
  assert.ok(s > Math.min(...along) && s < Math.max(...along) && t > Math.min(...across) && t < Math.max(...across),
    `a claridade do relâmpago centrada em ${x.toFixed(2)}, ${z.toFixed(2)} m, fora da pegada da lanceta`);
  const step = 1e-4;
  const centre = project(x, 0, z);
  const derivative = ([dx, dz]: number[]) => project(x + dx! * step, 0, z + dz! * step).map((value, k) => (value - centre[k]!) / step);
  const radius = (axis: readonly number[], [p, q]: number[]) => {
    assert.ok(Math.abs(axis[0]! * q! - axis[1]! * p!) <= 1e-3 * Math.hypot(axis[0]!, axis[1]!) * Math.hypot(p!, q!), 'a claridade do relâmpago se estica de viés');
    return Math.hypot(axis[0]!, axis[1]!) / Math.hypot(p!, q!);
  };
  const [a, b] = [radius(storm.axes[0], derivative([hx, hz])), radius(storm.axes[1], derivative([-hz, hx]))];
  const half = (values: number[]) => (Math.max(...values) - Math.min(...values)) / 2;
  assert.ok(a >= half(along) + 0.3 && b >= half(across) + 0.3, `a claridade do relâmpago mede ${a.toFixed(2)} × ${b.toFixed(2)} m de raio`);
  assert.ok(x + Math.hypot(a * hx, b * hz) < -0.5, 'a claridade do relâmpago chega ao eixo do salão');
  // Soft: from its centre its light falls to nothing at the rim, never rising, with no core: at half
  // its radius, at most three quarters of the centre's.
  const profile = storm.stops.map(({gain}) => lumaOfGain(gain));
  assert.ok(profile[0]! > 0 && profile.every((value, k) => k === 0 || value <= profile[k - 1]! + 1e-9) && profile[profile.length - 1] === 0,
    `a queda da claridade do relâmpago: ${profile.map((value) => value.toFixed(2)).join(' ')}`);
  const middle = storm.at(project(x + 0.5 * a * hx, 0, z + 0.5 * a * hz));
  assert.ok(lumaOfGain(middle) <= 0.75 * profile[0]!, `a claridade do relâmpago soma ${lumaOfGain(middle).toFixed(3)} a meio raio, e ${profile[0]!.toFixed(3)} no centro`);
  // The same light, only spread: summed over the floor (through the projection), per unit of the
  // opacity of its storm sky, it adds what the flash would add through the lancet as a sharp pool
  // (FLASH_POOL_GAIN at its near end, with the moon's pool's fall-off along it, over its lit panes),
  // within 3%, in every channel. A glow as bright as that sharp pool, but broad, brought ≈ 2.8 times
  // that light; one dimmed by eye, whatever the eye chose.
  const cell = 0.02;
  const spread = [0, 0, 0];
  for (let px = -HALL.halfWidth + cell / 2; px < 0; px += cell) {
    for (let pz = z - 3 * a; pz < z + 3 * a; pz += cell) storm.at(project(px, 0, pz)).forEach((gain, c) => (spread[c]! += gain * cell * cell));
  }
  const fade = rampAt(markup, `hi-pool-sharp-${MOON_SIDE}`);
  let panes = 0;
  for (const pane of MOON_POOL_PANES) {
    const [xs, zs] = [pane.map(([px]) => px), pane.map(([, pz]) => pz)];
    for (let px = Math.min(...xs) + 0.005; px < Math.max(...xs); px += 0.01) {
      for (let pz = Math.min(...zs) + 0.005; pz < Math.max(...zs); pz += 0.01) if (pointInPolygon([px, pz], pane)) panes += fade(project(px, 0, pz)).opacity * 1e-4;
    }
  }
  spread.forEach((light, c) => {
    const ratio = (light / sky) / (FLASH_POOL_GAIN[c]! * panes);
    assert.ok(Math.abs(ratio - 1) <= 0.03, `canal ${c}: a claridade do relâmpago traz ${ratio.toFixed(3)} da luz de uma poça nítida do clarão`);
  });
});

test('Interior: sobre o jogo, o clarão frio não desbota o veludo, que clareia em vermelho', () => {
  const props = hauntedInteriorLoopSchema.parse({transparent: true});
  for (const frame of FLASH_FRAMES) {
    const markup = pictureMarkup(props, frame);
    const layers = paintedLayers(markup);
    const covers = layers.filter((node) => ['hi-flash-cover', 'hi-flash-sill'].includes(fillOf(node)));
    const velvets = layers.filter((node) => fillOf(node) === 'hi-flash-velvet');
    assert.ok(covers.length >= 6 && velvets.length >= 2, `frame ${frame}: ${covers.length} coberturas, ${velvets.length} no veludo`);
    // The cool light (on the walls and, a paler one, on the sills' tops) is masked off the velvet...
    for (const cover of covers) {
      const id = /mask="url\(#([\w-]+)\)"/.exec(cover.attrs)?.[1] ?? '';
      const mask = new RegExp(`<mask id="${id}"[^>]*>(.*?)</mask>`).exec(markup)?.[1] ?? '';
      assert.ok(mask.includes(`<path d="${CURTAIN_SHAPES}" fill="black">`), `frame ${frame}: a luz fria cobre o veludo`);
    }
    // ...which takes a light of its own red instead, only on itself.
    for (const velvet of velvets) assert.ok(clipsOf(velvet).includes('hi-velvet'));
    const hex = /<radialGradient id="hi-flash-velvet"><stop stop-color="#([0-9A-Fa-f]{6})"/.exec(markup)?.[1];
    assert.ok(hex, 'a cor da luz no veludo');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(r! > 1.5 * g! && r! > 1.5 * b!, `a luz no veludo, #${hex}, não é vermelha`);
  }
});

test('Interior: sobre o jogo, o ouro das amarras clareia dourado, sem o vermelho do veludo nem a luz fria da parede', () => {
  const props = hauntedInteriorLoopSchema.parse({transparent: true});
  const tiebacks = `<path d="${CURTAIN_TIEBACKS}" fill="black">`;
  for (const frame of FLASH_FRAMES) {
    const markup = pictureMarkup(props, frame);
    const layers = paintedLayers(markup);
    const maskOf = (node: MarkupNode) => {
      const id = /mask="url\(#([\w-]+)\)"/.exec(node.attrs)?.[1] ?? '';
      return new RegExp(`<mask id="${id}"[^>]*>(.*?)</mask>`).exec(markup)?.[1] ?? '';
    };
    // Cord, tassel and rings are drawn over the velvet: neither the red light of the velvet nor the
    // cool light of the wall reaches them...
    for (const node of layers.filter((entry) => ['hi-flash-cover', 'hi-flash-sill', 'hi-flash-velvet'].includes(fillOf(entry)))) {
      assert.ok(maskOf(node).includes(tiebacks), `frame ${frame}: <${node.tag}${node.attrs.slice(0, 60)}> clareia o ouro`);
    }
    // ...which takes a light of its own, a pale gold, only on itself (both ellipses of both windows).
    const golds = layers.filter((node) => fillOf(node) === 'hi-flash-tieback');
    assert.equal(golds.length, 4, `frame ${frame}: ${golds.length} luzes no ouro`);
    for (const gold of golds) assert.ok(clipsOf(gold).includes('hi-tieback'));
    const stops = /<radialGradient id="hi-flash-tieback">(.*?)<\/radialGradient>/.exec(markup)?.[1] ?? '';
    const hex = /stop-color="#([0-9A-Fa-f]{6})"/.exec(stops)?.[1];
    assert.ok(hex, 'a cor da luz no ouro');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(r! >= g! && g! > b! && g! > 0.75 * r! && b! > 0.4 * r!, `a luz no ouro, #${hex}, não é um dourado claro`);
  }
  // In the opaque hall the gold catches the flash through the walls' own gain: no cover at all.
  assert.ok(!pictureMarkup(hauntedInteriorLoopSchema.parse({}), FLASH_FRAMES[0]!).includes('hi-flash-tieback'));
});

/** The body of a <mask> a painted node refers to. */
const maskOf = (markup: string, node: MarkupNode) => {
  const id = /mask="url\(#([\w-]+)\)"/.exec(node.attrs)?.[1] ?? '';
  return new RegExp(`<mask id="${id}"[^>]*>(.*?)</mask>`).exec(markup)?.[1] ?? '';
};
/** Every gain the flash lays on the opaque hall: around each lancet, on the floor and wall foot, and on each candelabra. */
const FLASH_GAINS = ['hi-flash-wash-0', 'hi-flash-wash-1', 'hi-flash-room-0', 'hi-flash-room-1', 'hi-candelabra-rim-0', 'hi-candelabra-rim-1'];
/** What only a flash paints: the bolt (behind its occluders, fading out), the storm sky and the covers over gameplay (and no cold layer on the beam, ever). */
const FLASH_ONLY = /url\(#hi-(?:beam-flash|bolt-behind-[01]|bolt-fade|flash-sky|flash-cover|flash-sill|flash-velvet|flash-tieback)\)/;

test('Interior: fora do relâmpago as camadas do clarão ficam neutras, e no clarão crescem na medida da intensidade', () => {
  // Dark frames: the default loop between its strikes, and a strike's peak with lightningIntensity 0.
  // The flash's gains stay in the frame there, as colour-dodge colours that add nothing (a colour S
  // adds the gain S / (1 − S), and black adds none), and nothing that only a flash paints is drawn.
  // A layer that ignored the strike's opacity would light the walls, the floor or the candelabra's
  // bronze in every one of these frames.
  const dark = [...[0, 480, 790].map((frame) => ({frame, lightningIntensity: 0.7})), {frame: FLASH_FRAMES[1]!, lightningIntensity: 0}];
  for (const transparent of [false, true]) {
    for (const {frame, lightningIntensity} of dark) {
      const props = hauntedInteriorLoopSchema.parse({transparent, lightningIntensity});
      if (lightningIntensity) assert.ok(!getActiveStrike(props, frame, 960), `frame ${frame} cai num relâmpago`);
      const markup = pictureMarkup(props, frame);
      for (const id of [...FLASH_GAINS, ...(transparent ? [] : ['hi-storm-pool-0', 'hi-storm-pool-1'])]) {
        const stops = stopsOf(markup, id);
        assert.ok(stops.length >= 3, `${id}: ${stops.length} paradas`);
        for (const {color} of stops) assert.equal(color, 'rgb(0.00, 0.00, 0.00)', `frame ${frame}, intensidade ${lightningIntensity}: ${id} soma luz`);
      }
      const painted = paintedLayers(markup).filter((node) => FLASH_ONLY.test(node.attrs));
      assert.equal(painted.length, 0, `frame ${frame}, intensidade ${lightningIntensity}${transparent ? ' (sobre o jogo)' : ''}: `
        + painted.map((node) => `<${node.tag}${node.attrs.slice(0, 60)}>`).join(' '));
    }
  }
  // In a flash, at half the intensity: every gain is half as strong (exactly, but for the rounding of
  // each colour to 0.01, which shifts the gain it reads back by up to 0.005 · 255 / (255 − value)²),
  // the covers over gameplay (the far window's too) are half as opaque, and the bolt, which grows with
  // the square root of the intensity, 1/√2 as opaque. (The storm glow follows its sky, checked above.)
  const gain = (value: number) => value / (255 - value);
  const slack = (value: number) => (0.005 * 255) / (255 - value) ** 2;
  const channels = (color: string) => /^rgb\(([^)]*)\)$/.exec(color)![1]!.split(',').map(Number);
  for (const transparent of [false, true]) {
    const [half, full] = [0.35, 0.7].map((lightningIntensity) =>
      pictureMarkup(hauntedInteriorLoopSchema.parse({transparent, lightningIntensity}), FLASH_FRAMES[0]!));
    for (const id of FLASH_GAINS) {
      const [a, b] = [stopsOf(half!, id), stopsOf(full!, id)];
      assert.equal(a.length, b.length);
      let grows = false;
      a.forEach((stop, k) => channels(stop.color).forEach((value, c) => {
        const other = channels(b[k]!.color)[c]!;
        assert.ok(Math.abs(gain(other) - 2 * gain(value)) <= 2 * slack(value) + slack(other) + 1e-12,
          `${id}, parada ${k}: ganho ${gain(value).toFixed(4)} com 0,35 e ${gain(other).toFixed(4)} com 0,7`);
        grows ||= gain(other) > gain(value) + 1e-3;
      }));
      assert.ok(grows, `${id}: o ganho não cresce com a intensidade`);
    }
    const opacities = (markup: string, pattern: RegExp) =>
      paintedLayers(markup).filter((node) => pattern.test(node.attrs)).map((node) => numberAttr(node, 'opacity'));
    const layers = transparent ? [{pattern: /fill="url\(#hi-flash-(?:cover|sill|velvet|tieback)\)"/, count: 14}] : [];
    for (const {pattern, count} of layers) {
      const [a, b] = [opacities(half!, pattern), opacities(full!, pattern)];
      assert.ok(a.length === count && a.length === b.length, `${pattern}: ${a.length} e ${b.length} camadas`);
      a.forEach((value, k) => assert.ok(value > 0 && Math.abs(b[k]! - 2 * value) < 1e-9, `${pattern}: opacidade ${value} com 0,35 e ${b[k]} com 0,7`));
    }
    const bolts = (markup: string) => opacities(markup, /mask="url\(#hi-bolt-behind-[01]\)"/);
    const [a, b] = [bolts(half!), bolts(full!)];
    assert.ok(a.length === 1 && b.length === 1 && a[0]! > 0, 'um raio no clarão');
    assert.ok(Math.abs(b[0]! / a[0]! - Math.SQRT2) < 1e-9, `o raio passa de ${a[0]} a ${b[0]} com o dobro da intensidade`);
  }
});

test('Interior: no salão opaco, cada ganho de luz é color-dodge, sem opacidade nem grupo que isole a mistura', () => {
  // The pool, the sky's diffuse light under each lancet, the flash on the walls and on the floor and
  // the candelabra's rim are light: gains on what is painted under them (a colour-dodge colour S at
  // opacity α multiplies it by 1 + α·S / (1 − S)), so
  // the joints and tiles of the floor, the stone and the velvet's red stay, only brighter. With another
  // blend they are paint: the pool turns into a flat wash brighter than the glass that lights it, and a
  // gain that adds nothing (black, out of a flash) turns into black shapes over the walls, the floor and
  // the bronze. The blend reaches what was painted before only in a group that is not isolated: nothing
  // on the layer scales its opacity (the gradients already carry α), and no group around it has an
  // opacity, a filter, a mask or a blend of its own.
  const moonOnly = [0, 1].map((side) => (side === MOON_SIDE ? 1 : 0));
  const expected = {'flash-wash': [1, 1], 'flash-room': [2, 2], 'pool-sharp': moonOnly, 'pool-glow': moonOnly, 'storm-pool': [1, 1],
    'candelabra-rim': [3, 3], 'sky-glow': [1, 1]};
  for (const props of [hauntedInteriorLoopSchema.parse({}), hauntedInteriorLoopSchema.parse({lightningIntensity: 1, moonlightIntensity: 1})]) {
    for (const frame of [790, ...FLASH_FRAMES]) {
      const layers = paintedLayers(pictureMarkup(props, frame)).filter((node) => GAIN_LAYER.test(node.attrs));
      const counts = new Map<string, number>();
      for (const node of layers) {
        const [, family, side] = GAIN_LAYER.exec(node.attrs)!;
        counts.set(`${family}-${side}`, (counts.get(`${family}-${side}`) ?? 0) + 1);
        const where = `frame ${frame}, clarão ${props.lightningIntensity}: <${node.tag}${node.attrs.slice(0, 90)}>`;
        assert.ok(node.attrs.includes(DODGE_STYLE) && node.attrs.match(/mix-blend-mode/g)?.length === 1, `${where} sem color-dodge`);
        assert.ok(!/\s(?:fill-|stroke-)?opacity="/.test(node.attrs), `${where} com opacidade`);
        for (const group of ancestry(node).slice(1)) {
          assert.ok(!/\s(?:opacity|filter|mask)="|style="[^"]*(?:opacity|filter|mask|mix-blend-mode|isolation)/.test(group.attrs),
            `${where} num grupo que isola a mistura: <${group.tag}${group.attrs.slice(0, 60)}>`);
        }
      }
      for (const [family, count] of Object.entries(expected)) {
        for (const side of [0, 1]) assert.equal(counts.get(`${family}-${side}`) ?? 0, count[side], `frame ${frame}: camadas de hi-${family}-${side}`);
      }
    }
  }
});

test('Interior: no clarão, o latão clareia como ouro claro, e a poça como luz fria sobre a pedra, não como tinta ciano', () => {
  // A gain multiplies what is painted, so the light it adds takes the colour of the surface under it.
  // On the old brass, a neutral gain would add the metal's own saturated gold (the candelabra would seem
  // to burn along with its candles) and a cold one added grey (the brass faded to pale pewter): the
  // light it adds at the strike's peak, in the window facing it, is a pale gold, warm but paler than
  // the metal. On the grey-green marble, the pool's gain would add mostly green, and the pool would
  // read as cyan paint: the light it adds, by moonlight or in a flash, stays close to neutral in green.
  const gainsOf = (markup: string, id: string) => channelsOf(stopsOf(markup, id)[0]!.color).map((s) => s / (255 - s));
  const luma = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  for (const props of [hauntedInteriorLoopSchema.parse({}), hauntedInteriorLoopSchema.parse({lightningIntensity: 1, moonlightIntensity: 1})]) {
    getLightningStrikes(props).forEach((strike, i) => {
      const markup = pictureMarkup(props, FLASH_FRAMES[i]!);
      const gain = gainsOf(markup, `hi-candelabra-rim-${strike.side}`);
      const bronze = stopsOf(markup, 'hi-bronze').map(({color}) => channelsOf(color)).sort((a, b) => luma(b) - luma(a))[0]!;
      const pan = /\sfill="(#[0-9a-fA-F]{6})"/.exec(paintedLayers(markup).find((node) => node.attrs.includes(` d="${CANDELABRA_PATHS.pans}"`))?.attrs ?? '')?.[1];
      assert.ok(pan, 'a cor dos pratos');
      for (const metal of [bronze, channelsOf(pan)]) {
        const [r, g, b] = metal.map((c, k) => c * gain[k]!);
        const where = `relâmpago ${i}, clarão ${props.lightningIntensity}, metal ${metal.join(' ')}: soma ${[r, g, b].map((c) => c!.toFixed(1)).join(' ')}`;
        assert.ok(luma([r!, g!, b!]) > 5, `${where}: o latão não clareia`);
        assert.ok(r! >= g! && g! >= b! && r! >= 1.1 * b!, `${where}: cinza ou frio, não um ouro claro`);
        assert.ok(r! / b! <= 0.9 * (metal[0]! / metal[2]!), `${where}: tão dourado quanto o próprio metal`);
      }
    });
    // Every light on the floor: the moon's pool, by the moon's lancet; in a strike, the bolt's broad
    // glow, by the lancet facing it (whichever side); and the sky's diffuse light by the other lancet.
    for (const frame of [790, ...FLASH_FRAMES]) {
      const markup = pictureMarkup(props, frame);
      const strike = getActiveStrike(props, frame, 960);
      const gains = [['poça da lua', moonPoolGain(markup)], ...(strike ? [[`claridade ${strike.side}`, stormGain(markup, strike.side)] as const] : [])] as const;
      for (const [name, gain] of gains) {
        const [r, g] = channelsOf(MARBLE.light).map((c, k) => c * gain[k]!);
        assert.ok(r! > 0 && g! <= 1.3 * r!, `frame ${frame}, ${name}, clarão ${props.lightningIntensity}: a luz na pedra soma R ${r!.toFixed(1)} e G ${g!.toFixed(1)}`);
      }
      const sky = gainsOf(markup, `hi-sky-glow-${1 - MOON_SIDE}`);
      const [r, g] = channelsOf(MARBLE.light).map((c, k) => c * sky[k]!);
      assert.ok(r! > 0 && g! <= 1.3 * r!, `frame ${frame}, céu no piso: a luz na pedra soma R ${r!.toFixed(2)} e G ${g!.toFixed(2)}`);
    }
  }
});

test('Interior: o feixe são os raios da lua, do vidro aceso ao piso aceso, e se afina até sumir nas bordas', () => {
  // Back from the screen to the hall: a point of the glass plane, and a point of the floor.
  const glassX = -HALL.halfWidth - WINDOW.reveal / 100;
  const onGlass = ([sx, sy]: Point) => {
    const z = (FOCAL * glassX) / (sx - VP.x);
    return [glassX, HALL.eye - ((sy - VP.y) * z) / FOCAL, z] as const;
  };
  const onFloorPlane = ([sx, sy]: Point) => {
    const z = (FOCAL * HALL.eye) / (sy - VP.y);
    return [((sx - VP.x) * z) / FOCAL, 0, z] as const;
  };
  assert.ok(MOON_SHAFT_RAYS.length >= 200, `só ${MOON_SHAFT_RAYS.length} raios no feixe`);
  const landings = MOON_SHAFT_RAYS.map(([from, to]) => {
    const [glass, floor] = [onGlass(from), onFloorPlane(to)];
    const drop = glass[1];
    // One ray of the moon: per metre of drop, MOON_DIRECTION into the hall and towards the camera...
    assert.ok(Math.abs((floor[0] - glass[0]) / drop - MOON_DIRECTION.x) < 1e-6 && Math.abs((floor[2] - glass[2]) / drop - MOON_DIRECTION.z) < 1e-6,
      `o raio de ${from.map(Math.round)} a ${to.map(Math.round)} sai da direção da lua`);
    // ...in through the lancet's glass, onto a lit pane of the floor, inside the beam's outline.
    assert.ok(distanceToPolygon([(BACK_Z - glass[2]) * 100, drop * 100], windowGlassOutline()) < 1e-6, 'um raio sem vidro');
    const landing: Point = [floor[0], floor[2]];
    assert.ok(MOON_POOL_PANES.some((pane) => distanceToPolygon(landing, pane) < 1e-9), `um raio pousa fora da poça em ${to.map(Math.round)}`);
    for (let t = 0; t <= 1; t += 0.25) {
      assert.ok(distanceToPolygon([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], MOON_SHAFT_POINTS) < 0.5, 'um raio sai do feixe');
    }
    return landing;
  });
  for (const pane of MOON_POOL_PANES) assert.ok(landings.some((point) => pointInPolygon(point, pane)), 'uma vidraça acesa sem raios');
  // Across the beam, at any height, the rays are densest in the middle, where those of every pane
  // cross, and thin out towards the outline: its outer tenth on either side holds at most a third as
  // many as the densest tenth. A beam filled evenly up to its outline instead lay on the floor between
  // the wall and the pool as a flat, sharp-edged wedge of light.
  for (const y of [650, 750, 900]) {
    const crossings = MOON_SHAFT_RAYS.filter(([a, b]) => a[1] < y && b[1] > y).map(([a, b]) => a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]));
    const [left, right] = [Math.min(...crossings), Math.max(...crossings)];
    const tenths = Array.from({length: 10}, (_, k) =>
      crossings.filter((x) => x >= left + ((right - left) * k) / 10 && (x < left + ((right - left) * (k + 1)) / 10 || (k === 9 && x === right))).length);
    const densest = Math.max(...tenths);
    assert.ok(tenths[0]! <= densest / 3 && tenths[9]! <= densest / 3, `y ${y}: raios por décimo da largura ${tenths.join(' ')}`);
  }
  // The frame draws the beam as exactly these rays, thin and faint and blurred together, for the
  // moon and, in a flash, for its cold light: no layer fills the outline.
  const markup = pictureMarkup(hauntedInteriorLoopSchema.parse({}), FLASH_FRAMES[0]!);
  const rays = /<g id="hi-shaft"[^>]*>(.*?)<\/g>/.exec(markup)?.[1] ?? '';
  const drawn = [...rays.matchAll(/<path d="M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)" opacity="([\d.]+)"/g)];
  assert.equal(drawn.length, MOON_SHAFT_RAYS.length, 'os raios do feixe');
  drawn.forEach(([, x1, y1, x2, y2, opacity], k) => {
    const [from, to] = MOON_SHAFT_RAYS[k]!;
    assert.ok(near([Number(x1), Number(y1)], from, 0.075) && near([Number(x2), Number(y2)], to, 0.075) && Number(opacity) <= 0.25, `raio ${k}`);
  });
  // One, even in a flash: the moon's, through the lancet that sees it, at the moon's opacity. A strike
  // lights the air from a broad patch of sky and draws no beam along the moon's heading (a lit beam
  // read as the moon flaring, or through the other lancet as a second moon): the light the flash lays
  // on the floor is the broad storm glow and the room's reflection.
  const beams = paintedLayers(markup).filter((node) => /url\(#hi-beam(?:-flash)?\)/.test(node.attrs));
  assert.ok(beams.length === 1 && beams[0]!.tag === 'use' && beams[0]!.attrs.includes('href="#hi-shaft"') && beams[0]!.attrs.includes('url(#hi-beam)'), 'o feixe preenche o contorno');
  assert.ok(windowOf(beams[0]!) === MOON_SIDE, 'o feixe da lua');
  const dark = paintedLayers(pictureMarkup(hauntedInteriorLoopSchema.parse({lightningIntensity: 0}), FLASH_FRAMES[0]!))
    .find((node) => node.attrs.includes('url(#hi-beam)'));
  assert.ok(dark && numberAttr(dark, 'opacity') === numberAttr(beams[0]!, 'opacity'), 'o clarão acende o feixe');
  // Along it, the haze is thin over the glass (the light's source) and over the floor: there it would
  // read as light lying on the floor, and what lights the floor is the pool.
  const profile = stopsOf(markup, 'hi-beam');
  const densest = Math.max(...profile.map(({opacity}) => opacity));
  assert.ok(profile[0]!.opacity < 0.1 * densest && profile[profile.length - 1]!.opacity < 0.3 * densest, 'o feixe cheio no vidro ou no piso');
});

test('Interior: no clarão, a parede clareia em volta da lanceta, e abaixo do peitoril fica só o reflexo', () => {
  const face = leftWall();
  const [spring, sill, foot] = [WINDOW.spring, WINDOW.sill, 0].map((v) => face(WINDOW.u, v)[1]);
  for (const transparent of [false, true]) {
    const markup = pictureMarkup(hauntedInteriorLoopSchema.parse({transparent}), FLASH_FRAMES[0]!);
    // The fade the wash carries, by height on screen: whole down to the sill, whose front face the
    // light through the glass reaches; about a third on the wainscot below, which the sill shades.
    const fade = /<linearGradient id="hi-wash-fade-y"[^>]*y1="([^"]+)"[^>]*y2="([^"]+)"/.exec(markup);
    assert.ok(fade, 'a queda da luz na parede');
    const [y1, y2] = [Number(fade[1]), Number(fade[2])];
    const stops = stopsOf(markup, 'hi-wash-fade-y');
    const weight = (y: number) => {
      const t = (y - y1) / (y2 - y1);
      if (t <= stops[0]!.offset) return stops[0]!.opacity;
      const next = stops.findIndex(({offset}) => offset >= t);
      if (next < 0) return stops[stops.length - 1]!.opacity;
      const [a, b] = [stops[next - 1]!, stops[next]!];
      return a.opacity + ((b.opacity - a.opacity) * (t - a.offset)) / (b.offset - a.offset);
    };
    assert.equal(weight(spring), 1);
    const [above, ledge] = [face(WINDOW.u, WINDOW.sill + 12)[1], leftWall(WINDOW.ledge)(WINDOW.u, WINDOW.sill - 4)[1]];
    assert.ok(weight(above) === 1 && weight(ledge) > 0.85, `o peitoril a ${weight(ledge).toFixed(2)}`);
    for (const y of [(sill + foot) / 2, foot]) {
      assert.ok(weight(y) >= 0.2 && weight(y) <= 0.45, `o lambril em ${y.toFixed(0)} a ${weight(y).toFixed(2)}`);
    }
    // Every layer of that wash carries it: over the opaque hall its gain, over gameplay the cool,
    // the red and the gold covers.
    const washes = paintedLayers(markup).filter((node) => /fill="url\(#hi-flash-(?:wash-[01]|cover|sill|velvet|tieback)\)"/.test(node.attrs)
      && numberAttr(node, 'cy') < CONTENT_BOX.bottom);
    assert.equal(washes.length, transparent ? 8 : 2, 'as camadas em volta das lancetas');
    for (const node of washes) assert.ok(maskOf(markup, node).includes('fill="url(#hi-wash-fade-y)"'), `<${node.tag}${node.attrs.slice(0, 60)}> sem a queda`);
    // Centred on the glass between the sill and the spring, it reaches the jambs up to the spring
    // (within four fifths of its height) and stops short of the arch's tip.
    const [wash] = washes;
    const [cy, ry] = [numberAttr(wash!, 'cy'), numberAttr(wash!, 'ry')];
    assert.ok(cy > spring && cy < sill && (cy - spring) / ry < 0.8, `a luz em volta da lanceta, centro ${cy.toFixed(0)}, raio ${ry.toFixed(0)}`);
  }
});

test('Interior: o raio se apaga antes das copas, sem acender o contorno das árvores', () => {
  const outlines = flattenPath(LANCET.trees).map(({points}) => points);
  // The top of the trees in a light's visible span: the highest point of their outline there.
  const treeTop = ([left, right]: readonly [number, number]) => {
    let top = Infinity;
    for (let x = left; x <= right; x += 0.25) {
      for (const outline of outlines) {
        outline.forEach((a, k) => {
          const b = outline[(k + 1) % outline.length]!;
          if (a[0] !== b[0] && (a[0] - x) * (b[0] - x) <= 0) top = Math.min(top, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
        });
      }
    }
    return top;
  };
  const tops = LANCET.spans.map(treeTop);
  const edges = outlines.flatMap((outline) => outline.map((a, k) => [a, outline[(k + 1) % outline.length]!] as const));
  for (let seed = 1; seed <= 150; seed++) {
    for (const strike of getLightningStrikes({seed, durationSeconds: 16})) {
      const points = getLightningBoltPoints(strike);
      const fade = getLightningBoltFade(strike);
      const light = LANCET.spans.findIndex(([a, b]) => points.every(([x]) => x >= a && x <= b));
      assert.ok(Math.abs(fade.trees - tops[light]!) < 0.5, `seed ${seed}: as árvores em ${fade.trees.toFixed(1)}, e não ${tops[light]!.toFixed(1)}`);
      // Gone just above the highest crown, and gradually (a fade, not a cut), with most of the glass
      // above the trees still crossed by the bolt.
      assert.ok(fade.to <= fade.trees - 1 && fade.to - fade.from >= 20 && fade.to - fade.from <= 45, `seed ${seed}: apaga de ${fade.from} a ${fade.to}`);
      assert.ok(fade.from - points[0]![1] >= 250, `seed ${seed}: o raio some cedo`);
      // Wherever the channel runs within reach of its glow (10 px) of a tree's outline, it has faded
      // to under a third: the glow cut by a crown's round top would outline the tree in white.
      const weight = (y: number) => Math.min(1, Math.max(0, (fade.to - y) / (fade.to - fade.from)));
      points.slice(1).forEach((b, i) => {
        const a = points[i]!;
        const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
        for (let k = 0; k <= steps; k++) {
          const p: Point = [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps];
          if (p[1] < fade.trees - 12 || weight(p[1]) === 0) continue;
          const reach = Math.min(...edges.map(([e0, e1]) => segmentDistance(p, e0, e1)));
          assert.ok(reach > 10 || weight(p[1]) < 1 / 3, `seed ${seed}: o raio acende o contorno das árvores em ${p.map(Math.round)}`);
        }
      });
    }
  }
  // In the frame, the channel and its glow fade under that gradient; the soft sky around it does not need to.
  const [strike] = getLightningStrikes(hauntedInteriorLoopSchema.parse({}));
  const fade = getLightningBoltFade(strike!);
  const markup = pictureMarkup(hauntedInteriorLoopSchema.parse({}), FLASH_FRAMES[0]!);
  const gradient = /<linearGradient id="hi-bolt-fade-y"[^>]*y1="([^"]+)"[^>]*y2="([^"]+)"/.exec(markup);
  assert.ok(gradient && Math.abs(Number(gradient[1]) - fade.from) < 1e-9 && Math.abs(Number(gradient[2]) - fade.to) < 1e-9, 'a queda do raio');
  const strokes = paintedLayers(markup).filter((node) => /stroke="#(?:A9C2FF|EAF0FF|FFFFFF|F4F7FF)"/.test(node.attrs));
  assert.ok(strokes.length >= 4, `só ${strokes.length} traços no raio`);
  for (const node of strokes) assert.ok(ancestry(node).some((entry) => entry.attrs.includes('mask="url(#hi-bolt-fade)"')), 'o raio não se apaga');
});

/**
 * A luminance mask of a rendered frame, evaluated at a point of the user space of the element it
 * masks: its rects, each filled with a white ramp (a linear or radial gradient in user space) or a
 * solid colour, and its filled paths, painted in order. `uses` counts the <use> elements it holds,
 * which are not evaluated (the pool, blurred): the caller keeps clear of what they draw.
 */
const luminanceMask = (markup: string, id: string) => {
  const body = new RegExp(`<mask id="${id}"[^>]*>(.*?)</mask>`).exec(markup)?.[1];
  assert.ok(body, `máscara ${id}`);
  const ramps = new Map<string, (point: Point) => number>();
  for (const [, kind, rampId, attrs, stopsBody] of markup.matchAll(/<(linear|radial)Gradient id="([\w-]+)"([^>]*)>(.*?)<\/\1Gradient>/g)) {
    if (!attrs!.includes('gradientUnits="userSpaceOnUse"')) continue;
    const attr = (name: string) => Number(new RegExp(`\\s${name}="([^"]+)"`).exec(attrs!)?.[1] ?? 0);
    const stops = [...stopsBody!.matchAll(/<stop([^>]*)>/g)].map(([, stop]) => {
      const color = /stop-color="([^"]+)"/.exec(stop!)?.[1];
      return {
        offset: Number(/offset="([^"]+)"/.exec(stop!)?.[1] ?? 0),
        value: (color === 'white' ? 1 : color === 'black' ? 0 : NaN) * Number(/stop-opacity="([^"]+)"/.exec(stop!)?.[1] ?? 1),
      };
    });
    const at = (t: number) => {
      const next = stops.findIndex(({offset}) => offset >= t);
      if (next <= 0) return next < 0 ? stops[stops.length - 1]!.value : stops[0]!.value;
      const [a, b] = [stops[next - 1]!, stops[next]!];
      return a.value + ((b.value - a.value) * (t - a.offset)) / (b.offset - a.offset);
    };
    const clamp = (t: number) => Math.min(1, Math.max(0, t));
    ramps.set(rampId!, kind === 'linear'
      ? ([x, y]) => {
        const [x1, y1, x2, y2] = [attr('x1'), attr('y1'), attr('x2'), attr('y2')];
        return at(clamp(((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2)));
      }
      : ([x, y]) => at(clamp(Math.hypot(x - attr('cx'), y - attr('cy')) / attr('r'))));
  }
  let uses = 0;
  const layers = [...body.matchAll(/<(rect|path|use)(\s[^>]*)>/g)].flatMap(([, tag, attrs]) => {
    if (tag === 'use') {
      uses++;
      return [];
    }
    const attr = (name: string) => new RegExp(`\\s${name}="([^"]+)"`).exec(attrs!)?.[1];
    const fill = attr('fill') ?? 'black';
    const ramp = /^url\(#([\w-]+)\)$/.exec(fill)?.[1];
    assert.ok(ramp ? ramps.has(ramp) : ['white', 'black'].includes(fill), `${id}: preenchimento ${fill}`);
    assert.ok(!attr('stroke') && !attr('opacity') && !attr('transform'), `${id}: <${tag}${attrs!.slice(0, 60)}>`);
    const value = ramp ? ramps.get(ramp)! : () => (fill === 'white' ? 1 : 0);
    if (tag === 'rect') {
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((name) => Number(attr(name) ?? 0));
      return [{covers: ([px, py]: Point) => px >= x! && px <= x! + w! && py >= y! && py <= y! + h!, value, shape: false}];
    }
    const outlines = flattenPath(attr('d') ?? '').map(({points}) => points);
    const boxes = outlines.map((outline) => [0, 1].map((k) => [Math.min(...outline.map((p) => p[k]!)), Math.max(...outline.map((p) => p[k]!))]));
    const covers = (point: Point) => outlines.some((outline, k) => boxes[k]!.every(([low, high], c) => point[c]! >= low! && point[c]! <= high!)
      && pointInPolygon(point, outline));
    return [{covers, value, shape: true}];
  });
  return {
    uses,
    ramps: layers.filter((layer) => !layer.shape).length,
    /** The mask's value at a point, and whether one of its filled paths covers it. */
    at: (point: Point) => layers.reduce((state, layer) => {
      if (!layer.covers(point)) return state;
      // A layer's white carries its opacity; a luminance mask keeps luminance × alpha, painted over what is there.
      const [value, alpha] = layer.shape ? [layer.value(point), 1] : [layer.value(point), layer.value(point)];
      return {value: value + state.value * (1 - alpha), shape: state.shape || layer.shape};
    }, {value: 0, shape: false}),
  };
};

test('Interior: o feixe e o reflexo do clarão se apagam antes da área de conteúdo como shaftVisibility, sem borda dura em x 410', () => {
  // The ramps BOX_FADE draws: from 0 on the box's left edge to 1 SHAFT_FADE px left of it, from 0 on
  // its bottom edge to 1 SHAFT_FADE px below it, and around the corner between them the distance to it.
  const markup = pictureMarkup(hauntedInteriorLoopSchema.parse({}), FLASH_FRAMES[0]!);
  const gradient = (id: string) => new RegExp(`<(?:linear|radial)Gradient id="${id}"([^>]*)>`).exec(markup)?.[1] ?? '';
  const attr = (attrs: string, name: string) => Number(new RegExp(`\\s${name}="([^"]+)"`).exec(attrs)?.[1]);
  const [fadeX, fadeY, corner] = ['hi-box-fade-x', 'hi-box-fade-y', 'hi-box-fade-corner'].map(gradient);
  assert.ok(attr(fadeX!, 'x1') === CONTENT_BOX.left && attr(fadeX!, 'x2') === CONTENT_BOX.left - SHAFT_FADE && attr(fadeX!, 'y1') === attr(fadeX!, 'y2'), 'a rampa à esquerda da caixa');
  assert.ok(attr(fadeY!, 'y1') === CONTENT_BOX.bottom && attr(fadeY!, 'y2') === CONTENT_BOX.bottom + SHAFT_FADE && attr(fadeY!, 'x1') === attr(fadeY!, 'x2'), 'a rampa abaixo da caixa');
  assert.ok(attr(corner!, 'cx') === CONTENT_BOX.left && attr(corner!, 'cy') === CONTENT_BOX.bottom && attr(corner!, 'r') === SHAFT_FADE, 'a quina da caixa');
  for (const id of ['hi-box-fade-x', 'hi-box-fade-y', 'hi-box-fade-corner']) {
    const stops = stopsOf(markup, id);
    assert.deepEqual(stops.map(({offset, color, opacity}) => [offset, color, opacity]), [[0, 'white', 0], [1, 'white', 1]], `${id}: de 0 a 1`);
  }
  // Every mask that fades a layer out before the content box, as drawn, is shaftVisibility at every
  // point (but where it cuts out the velvet or the gold, or the pool): the shaft of each window, the
  // flash's reflection on the floor and the wall's foot, and, over gameplay, its covers there. A mask
  // that let the light through up to the box's edge (a hard cut at x 410), or over the box, fails here.
  const pool = flattenPath(MOON_POOL_LAYERS.join('')).flatMap(({points}) => points);
  const [poolLeft, poolRight, poolTop] = [Math.min(...pool.map(([x]) => x)), Math.max(...pool.map(([x]) => x)), Math.min(...pool.map(([, y]) => y))];
  const nearPool = ([x, y]: Point) => x > poolLeft - 40 && x < poolRight + 40 && y > poolTop - 40;
  const samples: Point[] = [];
  for (let x = 0.5; x < WIDTH; x += 23) for (let y = 0.5; y < HEIGHT; y += 23) samples.push([x, y]);
  for (let x = CONTENT_BOX.left - SHAFT_FADE - 20.5; x < CONTENT_BOX.left + 10; x += 3) {
    for (const y of [120.5, 300.5, 500.5, 700.5, 840.5, 849.5, 851.5, 900.5, 1000.5]) samples.push([x, y]);
  }
  for (let y = CONTENT_BOX.bottom - 10.5; y < CONTENT_BOX.bottom + SHAFT_FADE + 20; y += 3) {
    for (const x of [300.5, 400.5, 409.5, 411.5, 450.5, 800.5, 1000.5, 1400.5, 1700.5]) samples.push([x, y]);
  }
  for (const transparent of [false, true]) {
    for (const frame of FLASH_FRAMES) {
      const frameMarkup = pictureMarkup(hauntedInteriorLoopSchema.parse({transparent}), frame);
      const layers = paintedLayers(frameMarkup);
      const rooms = layers.filter((node) => /^hi-flash-(?:room-[01]|cover|velvet|tieback)$/.test(fillOf(node)) && numberAttr(node, 'cy') > CONTENT_BOX.bottom);
      const shafts = layers.filter((node) => node.tag === 'use' && node.attrs.includes('href="#hi-shaft"'));
      // The sky's diffuse light under each lancet, on the floor, fades out the same way.
      const glows = layers.filter((node) => /^hi-sky-glow-[01]$/.test(fillOf(node)));
      assert.equal(rooms.length, transparent ? 6 : 4, `frame ${frame}: o reflexo do clarão`);
      assert.equal(shafts.length, 1, `frame ${frame}: o feixe`);
      assert.equal(glows.length, transparent ? 0 : 2, `frame ${frame}: o céu no piso`);
      const masks = new Set([...rooms, ...shafts, ...glows].map((node) => {
        const masked = ancestry(node).find((entry) => /\smask="url\(#[\w-]+\)"/.test(entry.attrs));
        assert.ok(masked, `frame ${frame}: <${node.tag}${node.attrs.slice(0, 60)}> sem máscara`);
        return /\smask="url\(#([\w-]+)\)"/.exec(masked.attrs)![1]!;
      }));
      assert.ok(masks.size >= (transparent ? 3 : 2), `frame ${frame}: máscaras ${[...masks].join(', ')}`);
      for (const id of masks) {
        const mask = luminanceMask(frameMarkup, id);
        assert.ok(mask.ramps >= 3, `${id}: ${mask.ramps} rampas`);
        let checked = 0;
        for (const point of samples) {
          if (mask.uses > 0 && nearPool(point)) continue;
          const {value, shape} = mask.at(point);
          if (shape) continue;
          checked++;
          assert.ok(Math.abs(value - shaftVisibility(point)) < 1e-6,
            `frame ${frame}${transparent ? ' (sobre o jogo)' : ''}, ${id} em ${point.map(Math.round)}: ${value.toFixed(3)}, e não ${shaftVisibility(point).toFixed(3)}`);
        }
        assert.ok(checked > 0.8 * samples.length, `${id}: só ${checked} pontos`);
      }
    }
  }
});

test('Interior: sobre o jogo, o clarão na pedra tem o tom frio do salão opaco, e o tampo do peitoril segue aceso', () => {
  const markup = pictureMarkup(hauntedInteriorLoopSchema.parse({transparent: true}), FLASH_FRAMES[0]!);
  const rgbOf = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16));
  // A cover adds α · (its colour − the wall's). In the opaque hall the flash multiplies the green-grey
  // stone by a cool gain, which adds a teal light, green and blue well above red: the cover's colour
  // adds the same over every stone tone of the side wall, not a neutral grey that reads as mist.
  const cover = stopsOf(markup, 'hi-flash-cover');
  const color = rgbOf(cover[0]!.color);
  for (const stone of ['#1c2522', '#2c352e', '#303c35', '#3a4238']) {
    const [r, g, b] = color.map((channel, c) => channel - rgbOf(stone)[c]!);
    assert.ok(g! >= 1.15 * r! && b! >= 1.15 * r! && Math.abs(g! - b!) <= 0.1 * g!, `sobre ${stone}, a cobertura soma (${r}, ${g}, ${b}): não é a luz fria do salão`);
  }
  // The sills' tops, right under the glass, which the opaque hall's gain takes almost to white, get a
  // stronger cover of their own, only on themselves (and off the velvet and the gold, checked above).
  const sill = stopsOf(markup, 'hi-flash-sill');
  assert.ok(sill.length === cover.length && sill.every((stop, k) => stop.opacity >= Math.min(1, 2 * cover[k]!.opacity)), 'o tampo do peitoril mais aceso que a parede');
  assert.ok(markup.includes(`<clipPath id="hi-sill-tops"><path d="${SILL_TOPS}"></path></clipPath>`), 'o tampo recorta só o tampo');
  const sills = paintedLayers(markup).filter((node) => fillOf(node) === 'hi-flash-sill');
  assert.equal(sills.length, 2, 'um tampo por janela');
  for (const node of sills) assert.ok(clipsOf(node).includes('hi-sill-tops') && clipsOf(node).includes('hi-lit-walls-core'), `<${node.tag}${node.attrs.slice(0, 60)}>`);
  const core = flattenPath(RETAINED_CORE).map(({points}) => points);
  const tops = flattenPath(SILL_TOPS);
  assert.equal(tops.length, 2, 'os dois tampos');
  for (const point of tops.flatMap(({points}) => points)) {
    assert.ok(core.some((polygon) => pointInPolygon(point, polygon)) && outsideContent(point[0], point[1]), `tampo fora do miolo mantido em ${point.map(Math.round)}`);
  }
});
