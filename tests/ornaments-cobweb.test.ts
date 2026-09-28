import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {spiderTimeline} from '../src/backgrounds/CobwebLoop';
import {buildWebGeometry, flexPoint, Spider} from '../src/backgrounds/halloween/CobwebArtwork';
import {ORNAMENT_CLEARANCE, rectDistance, roundRectSdf, type OrnamentElement, type OrnamentFrame, type OrnamentPlacement} from '../src/overlays/shared';
import {
  COBWEB_COUNTER_MIN, COBWEB_COUNTER_RATIO, COBWEB_DROP_MIN_SECONDS, COBWEB_EMBER, COBWEB_MOON, COBWEB_QUIET_DEW, COBWEB_QUIET_RATIO, cobwebGarlandsOf, cobwebPieceOf, cobwebSet,
} from '../src/overlays/shared/ornaments/sets/cobweb';
import {
  FAN_MARGIN, FAN_REACH, FAN_SPREAD, FAN_SWAY, fanJitter, fanTurn, webThreadsFor,
} from '../src/overlays/shared/ornaments/sets/cobweb-fan';
import {DANGLE_CLEAR, SPIDER_BOB, SPIDER_MIN_SCALE, SPIDER_UNDER_HEADER, spiderBodyReach} from '../src/overlays/shared/ornaments/sets/cobweb-spider';
import {BROKEN_END, GARLAND, swagLow, swagPoint, type GarlandRun} from '../src/overlays/shared/ornaments/sets/cobweb-garland';
import {dewCount, webExcess, webThreads} from '../src/overlays/shared/ornaments/sets/cobweb-web';
import {getSize, sizeProps, type NamedSize} from '../src/sizes';
import {framesOf, kitProps, ORNAMENT_KIND_NAMES, ORNAMENT_KINDS, unscaledItemProps, type OrnamentKindAdapter} from './helpers/ornament-kinds';
import {assertPeriodic, assertSeamVelocity, type Sampler, type Scene} from './helpers/scene-scans';

/**
 * The cobweb set (CobwebLoop's webs, spider and ember) beyond the shared harness: the hero web at
 * every named size, which secondaries each size keeps, the fan pieces holding everything the web
 * draws, the pack's frame-0 pose, whole harmonics, and the constants taken from the background.
 * Run with `npx tsx --test tests/ornaments-cobweb.test.ts`.
 */

/** The kit's look (SPEC §3 cobweb), so the rooms are the ones the presets will see. */
const KIT: Record<string, Record<string, unknown>> = {
  chat: {strokeWidth: 2, glow: 10, halo: 8, headerHeight: 48, radius: 20},
  block: {strokeWidth: 2, glow: 10, halo: 8, radius: 20, accent: 'none'},
  border: {thickness: 16, lines: 2, lineGap: 5, strokeWidth: 3, corners: 'none', glow: 10, halo: 8, radius: 38},
};
const BASE = {ornaments: 'cobweb', durationSeconds: 12, seed: 47, ornamentColors: ['#CFC6E4', '#F6EFD8', '#E8963C']};

const every = () => ORNAMENT_KIND_NAMES.flatMap((kind) => ORNAMENT_KINDS[kind].sizes.map((size) => ({adapter: ORNAMENT_KINDS[kind], size})));

const layoutOf = (adapter: OrnamentKindAdapter, size: NamedSize, extra: Record<string, unknown> = {}) => {
  const props = adapter.parse({...BASE, ...KIT[adapter.kind], ...sizeProps(size), ...extra});
  return {props, ...adapter.ornamentLayout(props)};
};

const motifs = (placements: readonly OrnamentPlacement[]) => new Set(placements.map((placement) => placement.motif));
const webs = (elements: readonly OrnamentElement[]) => elements.filter((element) => element.type === 'cobweb-web');

test('cobweb: a teia principal está em todo tamanho nomeado, com o preset do kit e com o neutro, de 12 a 256 px', () => {
  for (const {adapter, size} of every()) {
    for (const look of [KIT[adapter.kind]!, {}]) {
      for (const ornamentSize of [12, 48, 58, 256]) {
        const props = adapter.parse({...BASE, ...look, ...sizeProps(size), ornamentSize});
        const {placements} = adapter.ornamentLayout(props);
        assert.equal(placements[0]?.motif, 'cobweb', `${size.id} ${ornamentSize}: a teia principal vem primeiro`);
        const hero = placements.filter((placement) => placement.motif === 'cobweb');
        // The hero keeps at least its minimum radius, or the ornamentSize's own radius when that is smaller.
        assert.ok(hero[0]!.size >= Math.min(10, ornamentSize) - 1e-9, `${size.id} ${ornamentSize}: raio ${hero[0]!.size}`);
        assert.ok(hero[0]!.size <= ornamentSize + 1e-9, `${size.id}: nunca maior que ornamentSize`);
      }
    }
  }
});

test('cobweb: quais motivos cada tamanho mantém', () => {
  for (const {adapter, size} of every()) {
    const {placements, frame} = layoutOf(adapter, size, {ornamentSize: 58});
    const kept = motifs(placements);
    const id = size.id;
    const radius = (motif: string) => placements.find((placement) => placement.motif === motif)?.size ?? 0;
    const hero = radius('cobweb');
    // The counterweight is at most 0.85 of the hero; the quiet corners 0.75. Around a rect window
    // every corner has the same room, so there all four take the hero's radius (at most).
    const even = adapter.kind === 'border' && !frame.circle;
    if (kept.has('cobweb-counterweight')) assert.ok(radius('cobweb-counterweight') <= (even ? 1 : COBWEB_COUNTER_RATIO) * hero + 1e-9, id);
    for (const quiet of placements.filter((placement) => placement.motif === 'cobweb-corner')) {
      assert.ok(quiet.size <= (even ? 1 : COBWEB_QUIET_RATIO) * hero + 1e-9 && quiet.size >= COBWEB_COUNTER_MIN - 1e-9, id);
    }
    if (kept.has('cobweb-counterweight')) assert.ok(radius('cobweb-counterweight') >= COBWEB_COUNTER_MIN - 1e-9, `${id}: contrapeso legível`);
    if (size.id === 'twitch-panel') {
      // No glow: no soft light, no spider (crisp). The counterweight only where its room reaches
      // COBWEB_COUNTER_MIN (not at the default padding: the kit's block padding brings it back).
      const want = COBWEB_COUNTER_RATIO * hero >= COBWEB_COUNTER_MIN ? ['cobweb', 'cobweb-counterweight'] : ['cobweb'];
      assert.ok([...kept].every((motif) => want.includes(motif)) && kept.has('cobweb'), `${id}: ${[...kept]}`);
      continue;
    }
    assert.ok(kept.has('cobweb-counterweight'), `${id}: contrapeso`);
    assert.ok(kept.has('moonlight') && kept.has('brasa'), `${id}: luar e brasa`);
    // The spider hangs beside a panel, or sits in a border's (or a screen's) corner pocket.
    // (A screen's corner pocket holds it only with a larger radius, as the kit's pack gives it.)
    assert.ok(kept.has('spider') || frame.fit === 'screen', `${id}: a aranha`);
    const spider = placements.find((placement) => placement.motif === 'spider');
    if (spider) assert.ok(spider.size >= SPIDER_MIN_SCALE - 1e-9 && spider.layer === 'front', id);
    // Chat and blocks keep the background's diagonal pair; a border frames all four corners.
    assert.equal(kept.has('cobweb-corner'), adapter.kind === 'border', `${id}: cantos quietos só na borda`);
    // Everything in front: over the panel's corner, draped over a border's band (clear of the
    // window: fitsAt), and a screen has no back room at all.
    assert.ok(placements.every((placement) => placement.layer === 'front'), `${id}: tudo na frente`);
  }
  // Sizes: the hero takes ornamentSize where the room allows (circles, round webcams) and the
  // corner's room elsewhere, always within the envelope the rules give.
  const heroAt = (id: string, ornamentSize: number) => {
    const size = getSize(id);
    return layoutOf(ORNAMENT_KINDS[size.kind as 'chat'], size, {ornamentSize}).placements[0]!.size;
  };
  for (const id of ['circle', 'circle-lg', 'webcam-round', 'webcam-round-lg']) assert.equal(heroAt(id, 64), 64, id);
  for (const [id, least] of [['chat-standard', 44], ['label-sm', 40], ['card', 50], ['webcam-16x9', 50], ['twitch-panel', 13], ['fullscreen', 20]] as const) {
    assert.ok(heroAt(id, 64) >= least, `${id}: ${heroAt(id, 64)} ≥ ${least}`);
  }
});

/** A web piece's fan and cell, from the set's plan (elements carry no angles). */
type Piece = {element: OrnamentElement; bisector: number; inner: number; outer: number; from: number; to: number};
const pieceOf = (frame: OrnamentFrame, ornamentSize: number, element: OrnamentElement): Piece => {
  const found = cobwebPieceOf(frame, ornamentSize, element.anchor)!;
  const {bisector} = found.fan;
  return {element, bisector, inner: found.cell.inner, outer: found.cell.outer, from: found.cell.from - bisector, to: found.cell.to - bisector};
};

/** Signed distance from (x, y) to a fan's envelope sector (negative inside), before the margin. */
const sectorDistance = ({element: web, bisector}: Piece, x: number, y: number) => {
  const radius = web.webRadius as number;
  const half = FAN_SPREAD / 2 + fanJitter(radius);
  const reach = FAN_REACH * radius;
  const dx = x - (web.hubX as number);
  const dy = y - (web.hubY as number);
  const r = Math.hypot(dx, dy);
  let angle = Math.atan2(dy, dx) - bisector;
  angle = Math.abs(angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI)));
  if (angle <= half) return r > reach ? r - reach : -Math.min(reach - r, r * Math.sin(Math.min(Math.PI / 2, half - angle)));
  const off = angle - half;
  if (off >= Math.PI / 2) return r;
  const along = r * Math.cos(off);
  const across = r * Math.sin(off);
  return along <= reach ? across : Math.hypot(along - reach, across);
};

/** Which of a fan's pieces a point falls in (cells are polar around the hub, angles from the bisector). */
const cellsAt = (pieces: readonly Piece[], x: number, y: number) => pieces.filter((piece) => {
  const dx = x - (piece.element.hubX as number);
  const dy = y - (piece.element.hubY as number);
  const r = Math.hypot(dx, dy);
  if (r < piece.inner || r >= piece.outer) return false;
  if (piece.to - piece.from >= 2 * Math.PI - 1e-9) return true;
  let angle = Math.atan2(dy, dx) - piece.bisector;
  angle -= 2 * Math.PI * Math.round(angle / (2 * Math.PI));
  return angle >= piece.from && angle < piece.to;
});

test('cobweb: cada peça da teia segura toda a parte do envelope na sua célula (e as células não se sobrepõem)', () => {
  const cases: [string, number][] = [
    ['chat-standard', 58], ['chat-standard', 12], ['label-sm', 256], ['lower-third', 58], ['circle-sm', 58], ['circle-lg', 256],
    ['twitch-panel', 58], ['webcam-16x9', 58], ['webcam-round-lg', 256], ['gameplay', 58], ['fullscreen-vertical', 58],
  ];
  for (const [id, ornamentSize] of cases) {
    const size = getSize(id);
    const adapter = ORNAMENT_KINDS[size.kind as 'chat'];
    const {props, frame, placements} = layoutOf(adapter, size, {ornamentSize});
    const elements = cobwebSet.build(frame, placements, props, 0, framesOf(props));
    const byFan = new Map<string, Piece[]>();
    for (const web of webs(elements)) {
      const key = `${web.hubX}|${web.hubY}`;
      byFan.set(key, [...(byFan.get(key) ?? []), pieceOf(frame, ornamentSize, web)]);
    }
    for (const pieces of byFan.values()) {
      const first = pieces[0]!;
      const reach = FAN_REACH * (first.element.webRadius as number) + FAN_MARGIN;
      let inside = 0;
      for (let y = -reach; y <= reach; y += 1) {
        for (let x = -reach; x <= reach; x += 1) {
          const px = (first.element.hubX as number) + x;
          const py = (first.element.hubY as number) + y;
          if (sectorDistance(first, px, py) > FAN_MARGIN) continue;
          inside++;
          const found = cellsAt(pieces, px, py);
          assert.equal(found.length, 1, `${id} (${px}, ${py}): uma célula só`);
          const piece = found[0]!.element;
          assert.ok(Math.hypot(px - piece.x, py - piece.y) <= piece.reach + 1e-6, `${id} (${px}, ${py}): dentro do círculo da peça`);
        }
      }
      assert.ok(inside > 50, id);
    }
  }
});

test('cobweb: tudo o que a teia desenha cabe no envelope (FAN_MARGIN), em qualquer seed, raio, vento, giro e respiro', () => {
  let worst = -Infinity;
  for (const radius of [10, 12, 15, 20, 30, 47, 58, 90, 128, 180, 250]) {
    const {spokes, rings} = webThreadsFor(radius);
    for (let seed = 0; seed < 12; seed++) {
      for (const bisector of [0.75 * Math.PI, 0.25 * Math.PI, -0.25 * Math.PI, -0.75 * Math.PI]) {
        // The set tears only a fan opening downwards (its broken ends hang inside it).
        for (const tear of Math.sin(bisector) > 0 && rings >= 5 ? [0, 1] : [0]) {
          for (const billow of [-0.562, 0.2, 0.999]) {
            for (const turn of [-1, 1]) {
              for (const breath of [1, 0.992]) {
                const spec = {radius, spokes, rings, tear, seed: seed * 7919 + 17, bisector, dew: dewCount(radius)};
                worst = Math.max(worst, webExcess(spec, billow, turn * fanTurn(radius), breath));
              }
            }
          }
        }
      }
    }
  }
  assert.ok(worst <= FAN_MARGIN, `o traço mais largo passa ${worst.toFixed(3)} px do envelope (> ${FAN_MARGIN})`);
  // The turn never moves the rim further than FAN_SWAY.
  for (const radius of [10, 58, 250]) assert.ok(fanTurn(radius) * Math.PI / 180 * FAN_REACH * radius <= FAN_SWAY + 1e-9, String(radius));
});

test('cobweb: o frame 0 é a pose principal (teia acesa, faixa de luar sobre o leque, aranha em repouso)', () => {
  for (const id of ['chat-standard', 'card', 'circle-lg', 'webcam-16x9', 'webcam-round', 'fullscreen']) {
    const size = getSize(id);
    const adapter = ORNAMENT_KINDS[size.kind as 'chat'];
    for (let seed = 1; seed <= 40; seed++) {
      const {props, frame, placements} = layoutOf(adapter, size, {ornamentSize: 58, seed});
      const n = framesOf(props);
      const elements = cobwebSet.build(frame, placements, props, 0, n);
      const hero = elements.filter((element) => element.type === 'cobweb-web' && placements[element.anchor]!.motif === 'cobweb');
      assert.ok(hero.length > 0, id);
      for (const web of hero) {
        assert.ok((web.glow as number) >= 0.9, `${id} seed ${seed}: brilho ${web.glow}`);
        assert.ok(web.opacity >= 0.9, `${id} seed ${seed}: opacidade`);
        // The moonlight band lies across the fan (0 = first radial, 1 = last).
        assert.ok((web.glint as number) > 0 && (web.glint as number) < 1, `${id} seed ${seed}: faixa de luar ${web.glint}`);
      }
      const spider = elements.find((element) => element.type === 'cobweb-spider');
      if (spider) {
        // At rest: not falling nor hauling (curl 0.55, the resting stride), at the top of its line.
        assert.ok(Math.abs((spider.curl as number) - 0.55) < 1e-9, `${id}: pernas em repouso`);
        assert.ok(Math.hypot(spider.stepSin as number, spider.stepCos as number) <= 0.3 + 1e-9, `${id}: passo de repouso`);
        const later = cobwebSet.build(frame, placements, props, n * 0.3, n).find((element) => element.type === 'cobweb-spider')!;
        assert.ok((spider.thread as number) <= (later.thread as number) + 1e-9, `${id}: no alto do fio no frame 0`);
      }
      for (const light of elements.filter((element) => element.type === 'cobweb-moon' || element.type === 'cobweb-ember')) {
        assert.ok(light.light > 0 && light.lightOpacity > 0.1 && light.lightOpacity <= 0.2, `${id}: luz ${light.type}`);
      }
    }
  }
});

test('cobweb: harmônicos inteiros do ciclo (3,7 s, 8 s e 12,25 s), sem salto na emenda, com a queda da aranha', () => {
  for (const id of ['chat-standard', 'circle-lg', 'webcam-round-sm', 'gameplay', 'fullscreen', 'twitch-panel']) {
    const size = getSize(id);
    const adapter = ORNAMENT_KINDS[size.kind as 'chat'];
    const base = {...BASE, ...KIT[adapter.kind], ...sizeProps(size), ornamentSize: 58};
    const sample: Sampler = (input, at, length) => {
      const props = adapter.parse({...base, ...input});
      const {back, front} = adapter.layers(props, at, length);
      return [...back, ...front] as unknown as Scene;
    };
    assertPeriodic(`[cobweb] ${id}`, sample);
    assertSeamVelocity(`[cobweb] ${id}`, sample);
  }
});

test('cobweb: a queda da aranha é a do fundo (spiderTimeline), uma por ciclo, parada na emenda (3, 12, 18 e 30 s)', () => {
  const size = getSize('circle-lg');
  const adapter = ORNAMENT_KINDS.block;
  for (const durationSeconds of [3, 12, 18, 30]) {
    const {props, frame, placements} = layoutOf(adapter, size, {ornamentSize: 58, durationSeconds});
    const n = framesOf(props);
    const where = `${durationSeconds} s`;
    const thread = (at: number) => cobwebSet.build(frame, placements, props, at, n).find((element) => element.type === 'cobweb-spider')!.thread as number;
    const rest = thread(0);
    if (durationSeconds < COBWEB_DROP_MIN_SECONDS) {
      // Too short a cycle for the seam's rest: the spider only bobs on its line.
      for (let at = 0; at < n; at++) assert.ok(thread(at) - rest >= -1e-9 && thread(at) - rest <= SPIDER_BOB + 1e-9, `${where} frame ${at}: só balança`);
      continue;
    }
    let travel = 0;
    for (let at = 0; at < n; at++) {
      const {level} = spiderTimeline(at / n);
      const drop = thread(at) - rest;
      if (level > 0.5) travel = Math.max(travel, drop / level);
      if (level === 0) assert.ok(Math.abs(drop) < 1e-9, `${where} frame ${at}: em repouso no alto`);
    }
    assert.ok(travel >= 10, `${where}: a aranha cai de verdade no círculo grande (${travel} px)`);
    for (let at = 0; at < n; at += 7) {
      const {level} = spiderTimeline(at / n);
      assert.ok(Math.abs(thread(at) - rest - travel * level) < 1e-6, `${where} frame ${at}: segue a linha do tempo do fundo`);
    }
    // SPEC §2.4: exactly still within max(0.35 s, 8 % of the cycle) on both sides of the seam.
    const still = Math.ceil(n * Math.max(0.35 / durationSeconds, 0.08));
    for (let at = 0; at <= still; at++) assert.ok(Math.abs(thread(at) - rest) < 1e-9, `${where} frame ${at}: parada depois da emenda`);
    for (let at = n - still; at < n; at++) assert.ok(Math.abs(thread(at) - rest) < 1e-9, `${where} frame ${at}: parada antes da emenda`);
  }
});

test('cobweb: constantes tiradas do fundo e paleta prata (âmbar só na ampulheta e na brasa)', () => {
  // The background's fans open 1.33–1.46 rad; its counterweight is 540 px to the hero's 630.
  assert.ok(FAN_SPREAD >= 1.33 && FAN_SPREAD <= 1.46);
  assert.ok(Math.abs(COBWEB_COUNTER_RATIO - 540 / 630) < 0.01);
  assert.ok(COBWEB_EMBER.opacity + COBWEB_EMBER.swing <= 0.15 + 1e-9, 'brasa suave (≤ 0,15)');
  assert.ok(COBWEB_MOON.opacity + COBWEB_MOON.swing <= 0.2 + 1e-9, 'luar abaixo do teto sobre o texto');
  const warm = '#E8963C';
  for (const id of ['chat-standard', 'webcam-16x9', 'circle']) {
    const size = getSize(id);
    const adapter = ORNAMENT_KINDS[size.kind as 'chat'];
    const {props, frame, placements} = layoutOf(adapter, size, {ornamentSize: 58});
    for (const element of cobwebSet.build(frame, placements, props, 123, framesOf(props))) {
      for (const [key, value] of Object.entries(element)) {
        if (value !== warm) continue;
        assert.ok((element.type === 'cobweb-ember' && key === 'color') || (element.type === 'cobweb-spider' && key === 'mark'), `${id}: âmbar em ${element.type}.${key}`);
      }
    }
  }
  // A spider's reach holds its widest legs: at scale 1 the background's own bound (72 px aside).
  assert.ok(spiderBodyReach(1) >= 72 * 0.9 && spiderBodyReach(1) <= 90);
});

test('cobweb: nada entra no texto nem na janela, nos tamanhos extremos', () => {
  for (const {adapter, size} of every()) {
    for (const ornamentSize of [12, 256]) {
      for (const look of [KIT[adapter.kind]!, {}]) {
        const props = adapter.parse({...BASE, ...look, ...sizeProps(size), ornamentSize});
        const {frame, placements} = adapter.ornamentLayout(props);
        const n = framesOf(props);
        for (const at of [0, n * 0.17, n * 0.23, n * 0.61]) {
          for (const element of cobwebSet.build(frame, placements, props, at, n)) {
            const placement = placements[element.anchor]!;
            const reach = Math.max(element.reach, element.light);
            assert.ok(Math.hypot(element.x - placement.x, element.y - placement.y) + reach <= placement.extent + 1e-6, size.id);
            const disc = {x: element.x, y: element.y, r: reach};
            if (element.layer === 'front') {
              for (const area of frame.keepOut) assert.ok(rectDistance(area, disc.x, disc.y) >= disc.r, `${size.id} ${element.type}: fora do texto`);
            }
            if (frame.hole) assert.ok(roundRectSdf(frame.hole, disc.x, disc.y) >= disc.r - 1e-6, `${size.id} ${element.type}: fora da janela`);
            // A web piece's envelope is inside its circle (previous test), so the web never reaches either.
          }
        }
      }
    }
  }
});

test('cobweb: os refactors do fundo são só opcionais (padrões idênticos)', () => {
  const input = {
    spokes: 9, rings: 7, radius: 540, spread: 1.34, tilt: -Math.PI / 2 + 0.13, sag: 0.24, looseSpoke: null, frameShift: -1,
    bounds: {minX: 100, minY: -1170, maxX: 2020, maxY: -90}, draglines: [{x: 1640, bottom: 60}], seed: 47,
  };
  const geometry = buildWebGeometry(input);
  assert.deepEqual(buildWebGeometry({...input, tear: true}), geometry);
  const whole = buildWebGeometry({...input, tear: false});
  assert.equal(whole.tearStubs.length, 0);
  assert.ok(whole.structure.rings.flat().length > geometry.structure.rings.flat().length, 'sem rasgo, nenhuma célula falta');
  for (const point of [{x: -120, y: -300}, {x: 200, y: -80}]) {
    assert.deepEqual(flexPoint(geometry, point, 0.7, 1), flexPoint(geometry, point, 0.7));
  }
  const spider = {
    x: 100, y: 200, scale: 0.8, rotation: 3, legCurl: 0.5, stepSin: 0.2, stepCos: 0.1, glow: 0.7, light: -1, opacity: 1, thread: 80,
    anchorX: 102, silk: '#CFC6E4', moonlight: '#F6EFD8', body: '#120C1C', mark: '#E8963C', id: 's',
  };
  assert.equal(renderToStaticMarkup(createElement(Spider, {...spider, minLegWidth: undefined})), renderToStaticMarkup(createElement(Spider, spider)));
  assert.notEqual(renderToStaticMarkup(createElement(Spider, {...spider, scale: 0.3, minLegWidth: 1.2})), renderToStaticMarkup(createElement(Spider, {...spider, scale: 0.3})));
});

test('cobweb: minExtent e o frame 0 do painel da Twitch (sem luz, nítido)', () => {
  assert.ok(cobwebSet.minExtent > 0 && cobwebSet.minExtent <= 12);
  const size = getSize('twitch-panel');
  const {props, frame, placements} = layoutOf(ORNAMENT_KINDS.block, size, {ornamentSize: 58});
  assert.equal(frame.glow, 0);
  for (const element of cobwebSet.build(frame, placements, props, 0, framesOf(props))) assert.equal(element.light, 0);
  const frameOnly: OrnamentFrame = frame;
  assert.ok(cobwebSet.place(frameOnly, {ornamentSize: 58}).length === placements.length);
});

/**
 * The screens' band as the kit was tuned (radius 160, thickness 16): the pack renders the telas only
 * without ornaments, so these props keep the set's screen-frame webs and garland tested.
 */
const SCREEN_PROPS = {radius: 160, thickness: 16};
/**
 * A kit size at its own px: the theme's preset, the pack item's props without the pack's scale on
 * the large frames (see packLayout), TELA_PROPS on the telas, the size, then `input`.
 */
const kitInput = (size: NamedSize, input: Record<string, unknown> = {}) => {
  const item = unscaledItemProps('halloween-cobweb', size.id);
  const screen = size.props?.fit === 'screen' ? SCREEN_PROPS : {};
  return {...ORNAMENT_KINDS[size.kind as 'chat'].preset('halloween-cobweb'), ...item, ...sizeProps(size), ...screen, ...input};
};
const kitLayout = (id: string) => {
  const size = getSize(id);
  const props = ORNAMENT_KINDS[size.kind as 'chat'].parse(kitInput(size));
  return {props, ...ORNAMENT_KINDS[size.kind as 'chat'].ornamentLayout(props)};
};
/** The kit exactly as the pack renders it (kitProps), scale included. */
const packLayout = (id: string) => {
  const size = getSize(id);
  const adapter = ORNAMENT_KINDS[size.kind as 'chat'];
  const props = adapter.parse(kitProps('halloween-cobweb', size));
  return {adapter, props, ...adapter.ornamentLayout(props)};
};

test('cobweb: no pack, jogo e webcam-16x9-lg escalam o kit (×2 e ×1,5): a teia usa o canto e cresce junto, dentro do bleed', () => {
  for (const [id, scale, bleed] of [['gameplay', 2, 96], ['webcam-16x9-lg', 1.5, 72]] as const) {
    const {adapter, props, placements, scale: drawn} = packLayout(id);
    assert.equal(props.bleed, bleed, id);
    assert.equal(drawn, scale, id);
    // In the set's own space the frame's bleed is a webcam's (bleed ÷ scale = 48): its webs are near a webcam's.
    assert.ok(sizeOf(placements, 'cobweb') >= 60, `${id}: teia ${sizeOf(placements, 'cobweb')}`);
    assert.ok(sizeOf(placements, 'cobweb') * scale >= 0.85 * scale * sizeOf(kitLayout(id).placements, 'cobweb') - 1e-9, id);
    assert.ok(adapter.outset(props) <= props.bleed + 1e-9, `${id}: cabe no bleed`);
  }
});
const sizeOf = (placements: readonly OrnamentPlacement[], motif: string) => placements.find((placement) => placement.motif === motif)?.size ?? 0;

test('cobweb: tamanhos do kit (a sala, não o preset, limita a teia; aranha legível; guirlandas nas bordas longas)', () => {
  // [size, hero ≥, counterweight ≥, quiet ≥, spider scale ≥, top swags, bottom swags]
  const table: [string, number, number, number, number, number, number][] = [
    ['chat-compact', 62, 53, 0, 0.36, 2, 0], ['chat-standard', 62, 53, 0, 0.36, 2, 0], ['chat-tall', 62, 53, 0, 0.36, 2, 0],
    ['chat-column', 62, 53, 0, 0.36, 2, 0], ['chat-vertical', 62, 53, 0, 0.36, 5, 0],
    ['label-sm', 64, 54, 0, 0.36, 1, 0], ['label', 64, 54, 0, 0.36, 2, 0],
    ['lower-third', 75, 64, 0, 0.4, 6, 6], ['title', 75, 64, 0, 0.4, 6, 6], ['card', 75, 64, 0, 0.4, 3, 3], ['square', 75, 64, 0, 0.4, 2, 2],
    ['list', 75, 64, 0, 0.4, 2, 2],
    ['circle-sm', 93, 79, 0, 0.4, 0, 0], ['circle', 112, 95, 0, 0.4, 0, 0], ['circle-lg', 112, 95, 0, 0.4, 0, 0],
    ['twitch-panel', 33, 28, 0, 0, 0, 0],
    // Rect webcams and the game: the 48 px bleed at the window's 38 px radius sets the corner room,
    // the same at all four corners, so all four webs take it.
    ['webcam-16x9', 69, 69, 69, 0.43, 3, 3], ['webcam-16x9-lg', 69, 69, 69, 0.43, 5, 5], ['webcam-4x3', 69, 69, 69, 0.43, 2, 2],
    ['webcam-square', 69, 69, 69, 0.43, 2, 2], ['webcam-vertical', 69, 69, 69, 0.43, 2, 2],
    ['webcam-round-sm', 108, 91, 81, 0.45, 0, 0], ['webcam-round', 132, 112, 99, 0.45, 0, 0], ['webcam-round-lg', 164, 139, 123, 0.45, 0, 0],
    ['gameplay', 69, 69, 69, 0.43, 7, 8],
    // Screens (the pack's radius 160): big corner webs; a garland in the top band only.
    ['fullscreen', 92, 92, 92, 0.5, 9, 0], ['fullscreen-vertical', 92, 92, 92, 0.5, 5, 0],
  ];
  for (const [id, hero, counter, quiet, spider, top, bottom] of table) {
    const {placements, frame, props} = kitLayout(id);
    assert.ok(sizeOf(placements, 'cobweb') >= hero, `${id}: teia ${sizeOf(placements, 'cobweb')} ≥ ${hero}`);
    assert.ok(sizeOf(placements, 'cobweb-counterweight') >= counter, `${id}: contrapeso ${sizeOf(placements, 'cobweb-counterweight')} ≥ ${counter}`);
    assert.ok(sizeOf(placements, 'cobweb-corner') >= quiet, `${id}: cantos ${sizeOf(placements, 'cobweb-corner')} ≥ ${quiet}`);
    assert.ok(sizeOf(placements, 'spider') >= spider - 1e-9, `${id}: aranha ${sizeOf(placements, 'spider')} ≥ ${spider}`);
    const runs = cobwebGarlandsOf(frame, props.ornamentSize);
    const swags = (slot: string) => runs.find((run) => run.slot === slot)?.swags.length ?? 0;
    assert.equal(swags('top'), top, `${id}: guirlandas no alto`);
    assert.equal(swags('bottom'), bottom, `${id}: guirlandas embaixo`);
  }
});

/** A run's rest lows (absolute y, lowest thread first), from its middle swag. */
const restLows = (run: GarlandRun) => {
  const swag = run.swags[Math.floor(run.swags.length / 2)]!;
  return swag.sags.map((sag) => swagPoint(swag, sag, 0, swagLow(swag, sag, 0)).y);
};
/** Every size of the kit with its garland runs. */
const kitRuns = () => ORNAMENT_KIND_NAMES.flatMap((kind) => ORNAMENT_KINDS[kind].sizes.map((size) => {
  const {props, frame, placements} = kitLayout(size.id);
  return {id: size.id, props, frame, placements, runs: cobwebGarlandsOf(frame, props.ornamentSize)};
}));

test('cobweb: guirlandas de seda: nós fixos, vãos inteiros de 150 a 270 px, pontos baixos por encaixe', () => {
  for (const {id, props, frame, placements, runs} of kitRuns()) {
    for (const run of runs) {
      const where = `${id} ${run.slot}`;
      const {swags} = run;
      const first = swags[0]!;
      const last = swags[swags.length - 1]!;
      const length = last.x1 - first.x0;
      // Whole swags, like the comets: n = max(1, round(run / 188)), every span the same, in fixed px.
      assert.equal(swags.length, Math.max(1, Math.round(length / GARLAND.spacing)), where);
      for (const swag of swags) {
        assert.ok(Math.abs(swag.x1 - swag.x0 - length / swags.length) < 1e-6, `${where}: vãos iguais`);
        assert.ok(swag.x1 - swag.x0 >= 150 && swag.x1 - swag.x0 <= 270, `${where}: vão ${swag.x1 - swag.x0}`);
      }
      // Knots: inner ones 6 px under the file's top (top run) or on the frame line (bottom run).
      const inner = run.slot === 'top' ? frame.paintLimit.y + GARLAND.knotDrop
        : frame.kind === 'block' ? frame.outline.y + frame.outline.height : frame.track.y + frame.track.height;
      for (const swag of swags) {
        if (swag.index > 0) assert.ok(Math.abs(swag.y0 - inner) < 1e-9, `${where}: nó interno em y ${swag.y0}`);
        if (run.slot === 'bottom') assert.ok(swag.tie0 === 0 && swag.tie1 === 0, `${where}: sem amarras embaixo`);
      }
      // The ends tie into the corner webs (at 0.96 of the radius from the hub: on the top edge
      // radial, or where the frame line crosses the rim), or sit where the outline's straight edge
      // ends; only a top knot off the webs carries a tie up to the file's edge.
      for (const [x, y, tie] of [[first.x0, first.y0, first.tie0], [last.x1, last.y1, last.tie1]] as const) {
        const onWeb = placements.some((_, index) => {
          const piece = cobwebPieceOf(frame, props.ornamentSize, index);
          return piece !== null && Math.abs(Math.hypot(x - piece.fan.hubX, y - piece.fan.hubY) - GARLAND.onWeb * piece.fan.radius) < 1e-6;
        });
        const {outline} = frame;
        const corner = Math.min(outline.radius, outline.width / 2, outline.height / 2);
        const straight = Math.abs(x - (outline.x + corner)) < 1e-6 || Math.abs(x - (outline.x + outline.width - corner)) < 1e-6;
        assert.ok(onWeb || straight, `${where}: ponta em (${x}, ${y}) numa teia ou no fim do lado reto`);
        assert.equal(tie, run.slot === 'top' && !onWeb ? 1 : 0, `${where}: amarra só fora das teias`);
      }
      // Lows per fit (the AD's targets, lifted only where the file's edge, the text or the window
      // leaves the flashing dew less room): C, then B 7 px higher (6 on a screen), then A.
      const lows = restLows(run);
      const target = run.slot === 'top'
        ? (frame.fit === 'panel' ? frame.outline.y + 5 : frame.fit === 'screen' ? frame.hole!.y - 7 : frame.hole!.y - 10)
        : inner + (frame.kind === 'block' ? 22 : 32);
      assert.ok(lows[0]! <= target + 1e-6 && lows[0]! >= target - 2.5, `${where}: C em ${lows[0]} (alvo ${target})`);
      const step = frame.fit === 'screen' ? 6 : 7;
      lows.forEach((low, thread) => assert.ok(Math.abs(low - (lows[0]! - step * thread)) < 0.05, `${where}: fio ${thread} em ${low}`));
      // Three threads only on deep top runs; two along the bottom.
      assert.equal(lows.length, run.slot === 'top' && lows[0]! - inner >= GARLAND.three ? 3 : 2, `${where}: fios`);
      assert.ok(lows[0]! - inner >= GARLAND.least, `${where}: caimento`);
      // Pieces: whole-px strips, at least 3 px, at most 12 per swag, joined edge to edge.
      for (const swag of swags) {
        assert.ok(swag.pieces.length <= GARLAND.strip.most, `${where}: ${swag.pieces.length} peças`);
        swag.pieces.forEach((piece, index) => {
          assert.ok(Number.isInteger(piece.xa) && Number.isInteger(piece.xb) && piece.xb - piece.xa >= GARLAND.strip.least, `${where}: faixa ${piece.xa}–${piece.xb}`);
          if (index > 0) assert.equal(piece.xa, swag.pieces[index - 1]!.xb, `${where}: faixas contíguas`);
        });
        if (swag.index > 0) assert.equal(swag.pieces[0]!.xa, swags[swag.index - 1]!.pieces.at(-1)!.xb, `${where}: vãos contíguos`);
      }
    }
    // Panels: C drapes over the panel's top edge (a chat's header text lifts it by at most 1 px).
    const top = runs.find((run) => run.slot === 'top');
    if (top && frame.fit === 'panel' && frame.outline.y >= 32) assert.ok(restLows(top)[0]! >= frame.outline.y + 4, `${id}: C sobre a borda do painel`);
    // No garlands on circles, and none on a chat's message edge, a screen's thin bottom band or a Twitch panel.
    if (frame.circle || (frame.fit === 'panel' && props.bleed === 0)) assert.equal(runs.length, 0, id);
    if (frame.kind === 'chat' || frame.fit === 'screen') assert.ok(runs.every((run) => run.slot === 'top'), id);
  }
});

/** The points a garland piece draws inside its strip (every thread's stroke, cross threads, knots, ties, dew), sampled. */
const garlandPoints = (element: OrnamentElement) => {
  const e = element as OrnamentElement & Record<string, number>;
  const shape = {x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1};
  const sags = [e.sagC, e.sagB, e.sagA].slice(0, e.threads);
  const [xa, xb] = [e.clipX, e.clipX + e.clipWidth];
  const points: {x: number; y: number}[] = [];
  const disc = (x: number, y: number, r: number) => {
    for (let k = 0; k < 16; k++) {
      const px = x + r * Math.cos(k * Math.PI / 8);
      if (px >= xa && px <= xb) points.push({x: px, y: y + r * Math.sin(k * Math.PI / 8)});
    }
  };
  sags.forEach((sag, thread) => {
    const pad = Math.max(GARLAND.threads[thread]!.edge / 2, thread === 0 ? GARLAND.lit.shift + GARLAND.lit.width / 2 : 0);
    for (let u = 0; u <= 1; u += 0.001) {
      const p = swagPoint(shape, sag, e.skew, u);
      if (p.x > xa - pad && p.x < xb + pad) disc(p.x, p.y, pad);
    }
  });
  for (const [from, to] of GARLAND.cross.at) {
    const a = swagPoint(shape, sags.at(-1)!, e.skew, from);
    const b = swagPoint(shape, sags[0]!, e.skew, to);
    for (let t = 0; t <= 1; t += 0.05) disc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, GARLAND.cross.edge / 2);
  }
  const reach = (radius: number, flash: number) => radius / 2.8 * (5.6 + 1.4 * flash);
  const low = swagPoint(shape, e.sagC, e.skew, swagLow(shape, e.sagC, e.skew));
  disc(low.x, low.y, reach(2.8, e.flash));
  const small = e.odd > 0 ? [swagPoint(shape, e.sagB, e.skew, swagLow(shape, e.sagB, e.skew))] : GARLAND.smallAt.map((u) => swagPoint(shape, e.sagC, e.skew, u));
  for (const bead of small) disc(bead.x, bead.y, reach(GARLAND.smallBead, e.flash));
  for (const [x, y, tie] of [[e.x0, e.y0, e.tie0], [e.x1, e.y1, e.tie1]] as const) {
    disc(x, y, GARLAND.knot.radius + GARLAND.knot.ring);
    if (tie) for (let ty = e.tieTop; ty <= y; ty += 0.5) for (const dx of [-1.6, 0, 1.6]) if (x + dx >= xa && x + dx <= xb) points.push({x: x + dx, y: ty});
  }
  return points;
};

test('cobweb: cada peça da guirlanda segura o que desenha na sua faixa, longe do texto, da janela, da borda do arquivo e da aranha', () => {
  for (const {id, props, frame, placements} of kitRuns()) {
    const n = framesOf(props);
    const spider = placements.filter((placement) => placement.motif === 'spider' || placement.motif === 'spider-thread');
    for (const at of [0, n * 0.13, n * 0.37, n * 0.61, n * 0.89]) {
      for (const element of cobwebSet.build(frame, placements, props, at, n).filter((element) => element.type === 'cobweb-garland')) {
        const placement = placements[element.anchor]!;
        for (const point of garlandPoints(element)) {
          const where = `${id} ${placement.slot} frame ${at} (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`;
          assert.ok(Math.hypot(point.x - placement.x, point.y - placement.y) <= placement.extent + 1e-6, `${where}: dentro do círculo da peça`);
          for (const area of frame.keepOut) assert.ok(rectDistance(area, point.x, point.y) >= ORNAMENT_CLEARANCE, `${where}: fora do texto`);
          if (frame.hole) assert.ok(roundRectSdf(frame.hole, point.x, point.y) >= 0, `${where}: fora da janela`);
          const {paintLimit: limit} = frame;
          assert.ok(point.y >= limit.y + 1 - 1e-6 && point.y <= limit.y + limit.height - 1 + 1e-6, `${where}: dentro do arquivo`);
          for (const other of spider) assert.ok(Math.hypot(point.x - other.x, point.y - other.y) >= other.extent + GARLAND.spiderGap - 1e-6, `${where}: longe da aranha`);
        }
      }
    }
  }
});

test('cobweb: orvalho nas guirlandas (uma conta em cada ponto baixo, contas menores alternadas, todas piscam a cada passagem)', () => {
  for (const id of ['chat-standard', 'label', 'lower-third', 'webcam-16x9', 'gameplay', 'fullscreen']) {
    const {props, frame, placements} = kitLayout(id);
    const n = framesOf(props);
    const elements = cobwebSet.build(frame, placements, props, 0, n);
    const bySwag = new Map<string, OrnamentElement[]>();
    for (const element of elements.filter((element) => element.type === 'cobweb-garland')) {
      const key = `${placements[element.anchor]!.slot}|${element.x0}`;
      bySwag.set(key, [...(bySwag.get(key) ?? []), element]);
    }
    assert.ok(bySwag.size > 0, id);
    for (const [key, pieces] of bySwag) {
      const e = pieces[0]! as OrnamentElement & Record<string, number>;
      // A swag's first piece draws all of its beads (its other pieces draw nothing).
      const beads = new Map<string, number>();
      for (const piece of pieces) {
        const markup = renderToStaticMarkup(createElement('svg', null, cobwebSet.render(piece, 0, {idBase: 'x', frame, style: props})));
        for (const match of markup.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)" fill="url\(#x-0-guirlanda-glass\)"/g)) {
          beads.set(`${match[1]},${match[2]}`, Number(match[3]));
        }
      }
      const shape = {x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1};
      const low = swagPoint(shape, e.sagC, e.skew, swagLow(shape, e.sagC, e.skew));
      const big = [...beads].filter(([, r]) => Math.abs(r - 2.8 * (1 + 0.25 * e.flash)) < 0.01);
      assert.equal(big.length, 1, `${id} ${key}: uma conta grande`);
      const [bx, by] = big[0]![0].split(',').map(Number);
      assert.ok(Math.abs(bx! - low.x) < 0.01 && Math.abs(by! - low.y) < 0.01, `${id} ${key}: no ponto mais baixo de C`);
      assert.equal(beads.size - 1, e.odd > 0 ? 1 : 2, `${id} ${key}: contas pequenas`);
    }
    // The hero's moonlight band crosses every swag's place along the run: each flashes fully on
    // each pass (the band sweeps there and back twice a cycle).
    const flashes = new Map<number, number[]>();
    for (let at = 0; at < n; at += 2) {
      for (const element of cobwebSet.build(frame, placements, props, at, n).filter((element) => element.type === 'cobweb-garland')) {
        flashes.set(element.x0 as number, [...(flashes.get(element.x0 as number) ?? []), element.flash as number]);
      }
    }
    for (const [x0, series] of flashes) {
      let passes = 0;
      for (let index = 1; index < series.length; index++) if (series[index - 1]! < 0.9 && series[index]! >= 0.9) passes++;
      assert.ok(passes >= 2, `${id} swag ${x0}: ${passes} passagens`);
    }
  }
});

test('cobweb: pontas partidas curtas (nenhum fio vertical além de 10 px, fora as amarras de 4,5 px)', () => {
  for (const {id, frame, placements, props, runs} of kitRuns()) {
    const ends = placements.filter((placement) => placement.motif === 'cobweb-thread');
    assert.equal(ends.length, runs.reduce((sum, run) => sum + run.ends.length, 0), id);
    for (const end of ends) assert.ok(end.size >= BROKEN_END.least && end.size <= BROKEN_END.long, `${id}: ponta de ${end.size} px`);
    for (const run of runs) {
      // Swag i % 3 === 1: one end (from C, or the thread above where C's would reach the text or
      // the window); i % 3 === 2: one from B; none on i % 3 === 0.
      for (const swag of run.swags) {
        const own = run.ends.filter((end) => end.swag === swag.index);
        assert.equal(own.length, swag.index % 3 === 0 ? 0 : 1, `${id} ${run.slot} vão ${swag.index}`);
        for (const end of own) {
          assert.ok(end.thread >= (swag.index % 3 === 1 ? 0 : 1), `${id}: fio da ponta`);
          assert.equal(end.u, BROKEN_END.at[swag.index % 3 - 1], id);
        }
      }
      for (const swag of run.swags) {
        for (const tie of [swag.tie0 ? swag.y0 : null, swag.tie1 ? swag.y1 : null]) {
          if (tie !== null) assert.ok(tie - run.tieTop <= 5 + 1e-9, `${id}: amarra de ${tie - run.tieTop} px`);
        }
      }
    }
    // The ends' silk stays in their circles in every pose.
    const n = framesOf(props);
    for (const at of [0, n * 0.21, n * 0.47, n * 0.83]) {
      for (const element of cobwebSet.build(frame, placements, props, at, n).filter((element) => element.type === 'cobweb-thread')) {
        const placement = placements[element.anchor]!;
        const tipY = (element.knotY as number) + (element.length as number);
        assert.ok(Math.hypot((element.knotX as number) - placement.x, tipY - placement.y) + 5.9 <= placement.extent + 1e-6, `${id}: conta da ponta no círculo`);
        assert.ok(Math.hypot((element.knotX as number) - placement.x, (element.knotY as number) - placement.y) <= placement.extent, `${id}: nó da ponta no círculo`);
      }
    }
  }
});

test('cobweb: guirlandas voltam ao frame 0 com a mesma velocidade (kit: faixa, jogo e tela)', () => {
  for (const id of ['lower-third', 'gameplay', 'fullscreen']) {
    const size = getSize(id);
    const adapter = ORNAMENT_KINDS[size.kind as 'chat'];
    const sample: Sampler = (input, at, length) => {
      const props = adapter.parse(kitInput(size, input));
      const {front} = adapter.layers(props, at, length);
      return front.filter((element) => element.type === 'cobweb-garland' || element.type === 'cobweb-thread') as unknown as Scene;
    };
    assert.ok(sample({}, 0, 720).length > 0, id);
    assertPeriodic(`[cobweb] guirlanda ${id}`, sample);
    assertSeamVelocity(`[cobweb] guirlanda ${id}`, sample);
  }
});

test('cobweb: orvalho nos quatro cantos (teias quietas com quatro contas a menos)', () => {
  for (const id of ['webcam-16x9', 'gameplay', 'fullscreen', 'webcam-round-sm', 'webcam-round-lg']) {
    const {props, frame, placements} = kitLayout(id);
    const elements = webs(cobwebSet.build(frame, placements, props, 0, framesOf(props)));
    for (const web of elements) {
      const motif = placements[web.anchor]!.motif;
      const drop = motif === 'cobweb' ? 0 : motif === 'cobweb-counterweight' ? 1 : COBWEB_QUIET_DEW;
      assert.equal(web.dew, Math.max(0, dewCount(web.webRadius as number) - drop), `${id} ${motif}`);
      if (motif === 'cobweb-corner') assert.ok((web.dew as number) >= 4, `${id}: ${web.dew} contas no canto quieto`);
    }
  }
});

test('cobweb: a aranha do chat pendura num fio longo, abaixo da divisória do cabeçalho e fora do traço', () => {
  for (const id of ['chat-compact', 'chat-standard', 'chat-tall', 'chat-column', 'chat-vertical']) {
    const {props, frame, placements} = kitLayout(id);
    const n = framesOf(props);
    const divider = props.bleed + (props.headerHeight as number);
    const spider = placements.findIndex((placement) => placement.motif === 'spider');
    const line = placements.findIndex((placement) => placement.motif === 'spider-thread');
    assert.ok(spider >= 0 && line >= 0, `${id}: aranha e fio`);
    const edge = frame.outline.x + frame.outline.width;
    const hero = cobwebPieceOf(frame, props.ornamentSize, 0)!.fan;
    for (const at of [0, 1, n * 0.13, n * 0.37, n * 0.5, n * 0.81, n - 1]) {
      const elements = cobwebSet.build(frame, placements, props, at, n);
      const body = elements.find((element) => element.anchor === spider)!;
      const upper = elements.find((element) => element.anchor === line)!;
      assert.equal(upper.type, 'cobweb-line', id);
      // The body rests well below the header's dividing line, beside the chat.
      assert.ok(body.y >= divider + SPIDER_UNDER_HEADER - 1, `${id} frame ${at}: corpo em y ${body.y}`);
      // The line hangs clear outside the panel's edge (not along its stroke), from a knot on the hero web.
      assert.ok((upper.x1 as number) >= edge + DANGLE_CLEAR - 1e-9, `${id}: fio fora do traço`);
      assert.ok(Math.hypot((upper.x1 as number) - hero.hubX, (upper.y1 as number) - hero.hubY) < hero.radius, `${id}: nó na teia`);
      // The two parts of the line meet: the body's part runs from the tie up to the upper part's end.
      const span = Math.hypot((body.knotX as number) - body.x, (body.knotY as number) - body.y);
      const share = (body.drawn as number) / span;
      const joint = {x: body.x + ((body.knotX as number) - body.x) * share, y: body.y + ((body.knotY as number) - body.y) * share};
      assert.ok(Math.hypot(joint.x - (upper.x2 as number), joint.y - (upper.y2 as number)) < 1e-6, `${id} frame ${at}: o fio é contínuo`);
      assert.ok((body.drawn as number) + 2.1 <= body.reach, `${id}: a parte de baixo cabe no corpo`);
    }
  }
});

test('cobweb: orvalho visível (≥ 3 contas acesas na principal no frame 0) e o luar a 0,35 R na diagonal', () => {
  for (const id of ['chat-standard', 'label', 'card', 'circle', 'webcam-16x9', 'webcam-round', 'gameplay', 'fullscreen']) {
    const {props, frame, placements} = kitLayout(id);
    const elements = cobwebSet.build(frame, placements, props, 0, framesOf(props));
    const hero = webs(elements).filter((element) => placements[element.anchor]!.motif === 'cobweb');
    const web = hero[0]!;
    const piece = cobwebPieceOf(frame, props.ornamentSize, web.anchor)!;
    const spec = {
      radius: web.webRadius as number, spokes: web.spokes as number, rings: web.rings as number, tear: web.tear as number,
      seed: web.webSeed as number, bisector: piece.fan.bisector, dew: web.dew as number,
    };
    const beads = webThreads(spec, web.billow as number).dew;
    assert.ok(beads.length >= 3, `${id}: ${beads.length} contas`);
    const moon = placements.find((placement) => placement.motif === 'moonlight')!;
    const {fan} = piece;
    assert.ok(Math.abs(Math.hypot(moon.x - fan.hubX, moon.y - fan.hubY) - COBWEB_MOON.at * fan.radius) < 1e-6, `${id}: luar a 0,35 R`);
    assert.ok(moon.extent <= COBWEB_MOON.ratio * fan.radius + 1e-9, `${id}: luar ≤ 0,7 R`);
  }
});

test('cobweb: a aranha no bolso do canto (borda e tela) olha para o cubo, só as pernas andam', () => {
  for (const id of ['webcam-16x9', 'gameplay', 'fullscreen']) {
    const {props, frame, placements} = kitLayout(id);
    const n = framesOf(props);
    const spiders = [0, n * 0.25, n * 0.5, n * 0.75].map((at) => cobwebSet.build(frame, placements, props, at, n).find((element) => element.type === 'cobweb-spider')!);
    const hub = cobwebPieceOf(frame, props.ornamentSize, 0)!.fan;
    for (const spider of spiders) {
      assert.equal(spider.thread, 0, id);
      assert.ok(Math.abs((spider.rotation as number) - 45) < 1e-9, `${id}: cabeça para o cubo (TR)`);
      assert.ok(Math.hypot(spider.x - spiders[0]!.x, spider.y - spiders[0]!.y) <= 1 + 1e-9, `${id}: só balança 1 px`);
      assert.ok(Math.hypot(spider.x - hub.hubX, spider.y - hub.hubY) < hub.radius, `${id}: sobre a teia principal`);
    }
  }
});
