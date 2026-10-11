import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getPalmPoints} from '../src/backgrounds/vaporwave/Palm';
import {ORNAMENT_REGISTRY, type OrnamentElement} from '../src/overlays/shared';
import {sunCutBands} from '../src/overlays/shared/ornaments/sets/horizon';
import {PALM_INK, PALM_MIN_HEIGHT, referencePalm, SPARKLE_MIN_EXTENT} from '../src/overlays/shared/ornaments/sets/horizon-place';
import {getSize} from '../src/sizes';
import {framesOf, kitProps, kitSizeIds, ORNAMENT_KINDS, type OrnamentKindName} from './helpers/ornament-kinds';

/**
 * The horizon set (VaporwaveLoop's palm, sun, solids and twinkles) beyond the shared harness: the
 * background's composition on every file the kit ships, the drawn palm inside the circle it
 * declares, the twinkle standing in for a palm too small to read, the sun's cuts wrapping unseen,
 * the background's rhythms, the pack's frame-0 pose and the kit's colours.
 * Run with `npx tsx --test tests/ornaments-horizon.test.ts`.
 */

const THEME = 'vaporwave-horizon';
const set = ORNAMENT_REGISTRY.horizon;

const kitCase = (sizeId: string, extra: Record<string, unknown> = {}) => {
  const size = getSize(sizeId);
  const adapter = ORNAMENT_KINDS[size.kind as OrnamentKindName];
  const props = adapter.parse(kitProps(THEME, size, extra));
  return {adapter, props, ...adapter.ornamentLayout(props)};
};

const elementsAt = (sizeId: string, frame: number) => {
  const {adapter, props} = kitCase(sizeId);
  const {back, front} = adapter.layers(props, frame, framesOf(props));
  return [...back, ...front];
};

test('horizon: em todo arquivo com enfeites do kit, a composição do fundo (palmeira atrás de TL, sol atrás de TR, sólidos na frente dos cantos de baixo)', () => {
  const sizes = kitSizeIds(THEME);
  assert.equal(sizes.length, 24);
  for (const id of sizes) {
    const {placements} = kitCase(id);
    const at = (motif: string) => placements.find((placement) => placement.motif === motif);
    assert.deepEqual([placements[0]!.motif, placements[0]!.slot, placements[0]!.layer], ['palm', 'TL', 'back'], id);
    assert.deepEqual([at('sun')?.slot, at('sun')?.layer], ['TR', 'back'], id);
    assert.deepEqual([at('pyramid')?.slot, at('pyramid')?.layer], ['BR', 'front'], id);
    assert.deepEqual([at('icosahedron')?.slot, at('icosahedron')?.layer], ['BL', 'front'], id);
    // The twinkles live in the sky: at least one on the top edge.
    assert.ok(placements.some((placement) => placement.motif.startsWith('sparkle') && placement.slot === 'top'), id);
  }
});

/** The palm's drawing, as render places it: the reference shape through the rendered translate and scale. */
const drawnPalm = (element: OrnamentElement, context: Parameters<typeof set.render>[2]) => {
  const markup = renderToStaticMarkup(createElement('svg', null, set.render(element, 0, context) as ReactNode));
  const match = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(markup);
  assert.ok(match, 'a palmeira se desenha numa escala');
  const [footX, footY, scale] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const shape = referencePalm(element.side === 1 ? 1 : 0, element.sway as number, element.swayTilt as number);
  return getPalmPoints(shape).flat().map(([x, y]) => [footX + x * scale, footY + y * scale] as const);
};

test('horizon: a palmeira desenhada cabe no círculo que declara, em todo quadro do loop', () => {
  for (const id of ['chat-standard', 'label-sm', 'webcam-round-lg', 'gameplay']) {
    const {adapter, props, frame} = kitCase(id);
    const n = framesOf(props);
    const context = {idBase: 'test', frame, style: props};
    for (let at = 0; at < n; at += 37) {
      const palm = adapter.layers(props, at, n).back.find((element) => element.type === 'horizon-palm');
      assert.ok(palm, `${id} frame ${at}: palmeira`);
      // Every painted point within the body's circle, the rim's shift and antialiasing (PALM_INK) aside.
      let far = 0;
      for (const [x, y] of drawnPalm(palm, context)) far = Math.max(far, Math.hypot(x - palm.x, y - palm.y));
      assert.ok(far <= palm.reach - PALM_INK + 0.05, `${id} frame ${at}: ${far} > ${palm.reach - PALM_INK}`);
      // And it fills it: a circle far wider than the palm would waste the corner's room.
      assert.ok(far >= 0.9 * (palm.reach - PALM_INK), `${id} frame ${at}: ${far} preenche o círculo`);
    }
  }
});

test('horizon: atrás do canto TL, a palmeira pende para fora do painel, com o pé escondido atrás dele', () => {
  for (const id of ['chat-standard', 'card', 'webcam-16x9']) {
    const {adapter, props, frame} = kitCase(id);
    const palm = adapter.layers(props, 0, framesOf(props)).back.find((element) => element.type === 'horizon-palm')!;
    const points = drawnPalm(palm, {idBase: 'test', frame, style: props});
    const top = points.reduce((best, point) => (point[1] < best[1] ? point : best));
    const foot = points.reduce((best, point) => (point[1] > best[1] ? point : best));
    // The crown is left of the foot (leaning out), and the foot is inside the outline (the panel or the band hides it).
    assert.ok(top[0] < foot[0] - 0.1 * (palm.height as number), `${id}: copa ${top[0]} à esquerda do pé ${foot[0]}`);
    const {outline} = frame;
    assert.ok(foot[0] > outline.x && foot[1] > outline.y, `${id}: pé (${foot[0]}, ${foot[1]}) atrás do contorno`);
  }
});

test('horizon: abaixo de 30 px de palmeira, um brilho é o principal; com 30, a palmeira', () => {
  assert.equal(PALM_MIN_HEIGHT, 30);
  const small = kitCase('chat-standard', {ornamentSize: 29}).placements;
  assert.equal(small[0]!.motif, 'sparkle');
  assert.ok(small[0]!.extent >= SPARKLE_MIN_EXTENT, `${small[0]!.extent}`);
  assert.ok(!small.some((placement) => placement.motif === 'palm'));
  assert.equal(kitCase('chat-standard', {ornamentSize: 30}).placements[0]!.motif, 'palm');
});

test('horizon: os cortes do sol nascem sem espessura e saem pela borda, então a emenda não salta', () => {
  const round = (bands: [number, number][]) => bands.map(([a, b]) => [Math.round(a * 1e4) / 1e4, Math.round(b * 1e4) / 1e4]);
  for (const r of [7, 22.4, 32]) {
    // Just before the seam the cuts sit where they start the loop.
    assert.deepEqual(round(sunCutBands(100, r, 1 - 1e-9)), round(sunCutBands(100, r, 0)), `r ${r}`);
    // In between, a small drift moves them a little (no band appears or vanishes at full size).
    for (let shift = 0; shift < 1; shift += 0.05) {
      const [before, after] = [sunCutBands(100, r, shift), sunCutBands(100, r, shift + 1e-3)];
      const covered = (bands: [number, number][]) => bands.reduce((sum, [a, b]) => sum + (b - a), 0);
      assert.ok(Math.abs(covered(after) - covered(before)) < 0.02 * r, `r ${r} shift ${shift}`);
    }
    // Every cut is in the lower part of the disc, as the background's.
    for (const [top] of sunCutBands(100, r, 0.37)) assert.ok(top >= 100 - r + 0.42 * 2 * r - 0.08 * 2 * r, `r ${r}`);
  }
});

test('horizon: ritmos do fundo (balanço de até 2,9°, uma volta dos sólidos e dois passos dos cortes por loop)', () => {
  const {props} = kitCase('chat-standard');
  const n = framesOf(props);
  assert.equal(n, 960);
  let sway = 0;
  let spin = 0;
  let cuts = 0;
  let previous: OrnamentElement[] | null = null;
  for (let at = 0; at <= n; at++) {
    const elements = elementsAt('chat-standard', at);
    const palm = elements.find((element) => element.type === 'horizon-palm')!;
    sway = Math.max(sway, Math.abs(palm.sway as number), Math.abs(palm.swayTilt as number));
    if (previous) {
      const turn = (type: string, cos: string, sin: string) => {
        const [a, b] = [previous!.find((element) => element.type === type)!, elements.find((element) => element.type === type)!];
        return Math.atan2((b[sin] as number) * (a[cos] as number) - (b[cos] as number) * (a[sin] as number),
          (b[cos] as number) * (a[cos] as number) + (b[sin] as number) * (a[sin] as number));
      };
      spin += turn('horizon-solid', 'spinCos', 'spinSin');
      cuts += turn('horizon-sun', 'cutCos', 'cutSin');
    }
    previous = elements;
  }
  assert.ok(sway <= 2.9 + 1e-9 && sway >= 2.4, `balanço ${sway}`);
  assert.ok(Math.abs(Math.abs(spin) - 2 * Math.PI) < 1e-6, `giro ${spin}`);
  assert.ok(Math.abs(cuts - 2 * 2 * Math.PI) < 1e-6, `cortes ${cuts}`);
});

test('horizon: no quadro 0 (o PNG do pack) os brilhos estão acesos', () => {
  for (const id of kitSizeIds(THEME)) {
    for (const element of elementsAt(id, 0).filter((entry) => entry.type === 'horizon-sparkle')) {
      assert.ok(element.opacity >= 0.93, `${id}: ${element.opacity}`);
    }
  }
});

test('horizon: as cores do kit (sol do amarelo ao rosa, pirâmide rosa, icosaedro ciano, aro rosa na palmeira)', () => {
  const elements = elementsAt('chat-standard', 0);
  const of = (type: string, motif?: number) => elements.find((element) => element.type === type && (motif === undefined || element.variant === motif))!;
  assert.deepEqual([of('horizon-sun').topColor, of('horizon-sun').midColor], ['#FFFB96', '#FF2E97']);
  assert.equal(of('horizon-solid', 2).edgeColor, '#FF2E97');
  assert.equal(of('horizon-solid', 1).edgeColor, '#2DE2E6');
  assert.equal(of('horizon-palm').rimColor, '#FF2E97');
});
