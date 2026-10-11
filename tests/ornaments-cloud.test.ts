import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CLOUD_BODIES} from '../src/backgrounds/kawaii/Cloud';
import {HEART_SHAPE} from '../src/backgrounds/kawaii/Heart';
import {ORNAMENT_REGISTRY, type OrnamentElement} from '../src/overlays/shared';
import {CLOUD_MIN_WIDTH, INK, outlinePoints, TWINKLE_MIN_EXTENT} from '../src/overlays/shared/ornaments/sets/cloud-place';
import {getSize} from '../src/sizes';
import {framesOf, kitProps, kitSizeIds, ORNAMENT_KINDS, type OrnamentKindName} from './helpers/ornament-kinds';

/**
 * The cloud set (KawaiiLoop's cloud, heart and twinkle) beyond the shared harness: the background's
 * chord on every file the kit ships (a cloud sitting on the top edge, a heart beside it), the drawn
 * cloud and hearts inside the circles they declare, the twinkle standing in for a cloud too small
 * to read, the background's rhythms, the pack's frame-0 pose and the kit's colours.
 * Run with `npx tsx --test tests/ornaments-cloud.test.ts`.
 */

const THEME = 'pastel-cloud';
const set = ORNAMENT_REGISTRY.cloud;

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

test('cloud: em todo arquivo com enfeites do kit, uma nuvem sentada na borda de cima, atrás dela, com um coração ao lado', () => {
  const sizes = kitSizeIds(THEME);
  assert.equal(sizes.length, 24);
  for (const id of sizes) {
    const {placements, frame} = kitCase(id);
    const hero = placements[0]!;
    assert.deepEqual([hero.motif, hero.slot, hero.layer], [frame.circle ? 'cloud-round' : 'cloud', 'top', 'back'], id);
    const {x, y, width} = frame.outline;
    // On the top: its centre at most a tenth of its extent below the edge, on the left half (the top of the ring on circles).
    assert.ok(hero.y <= y + 0.1 * hero.extent + 1e-9, `${id}: nuvem em ${hero.y}, borda em ${y}`);
    if (frame.circle) assert.ok(Math.abs(hero.x - (x + width / 2)) <= 0.3 * width, `${id}: no topo do anel`);
    else assert.ok(hero.x <= x + width / 2, `${id}: na metade da esquerda`);
    const heart = placements.find((placement) => placement.motif === 'heart');
    assert.ok(heart && heart.layer === 'front' && heart.x > hero.x, `${id}: coração à direita da nuvem`);
    // The circles are bubbles: a glint on the ring; the rectangles get twinkles.
    if (frame.circle) assert.ok(placements.some((placement) => placement.motif === 'glint'), `${id}: brilho de bolha`);
    else assert.ok(placements.some((placement) => placement.motif === 'twinkle'), `${id}: cintilas`);
  }
});

/** The points a background drawing paints, through the transform render gives it: translate, rotate, then one or two scales. */
const drawn = (element: OrnamentElement, points: readonly {x: number; y: number}[], context: Parameters<typeof set.render>[2]) => {
  const markup = renderToStaticMarkup(createElement('svg', null, set.render(element, 0, context) as ReactNode));
  const match = /translate\(([-\d.e]+) ([-\d.e]+)\) rotate\(([-\d.e]+)\) scale\(([-\d.e]+)(?:, ?([-\d.e]+))?\)/.exec(markup);
  assert.ok(match, 'o desenho do fundo, numa escala');
  const [tx, ty, degrees, sx] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  const sy = match[5] === undefined ? sx : Number(match[5]);
  const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  return {markup, points: points.map(({x, y}) => ({x: tx + cos * sx * x - sin * sy * y, y: ty + sin * sx * x + cos * sy * y}))};
};

test('cloud: a nuvem e os corações desenhados cabem no círculo que declaram, em todo quadro do loop', () => {
  const clouds = CLOUD_BODIES.map(outlinePoints);
  const heart = outlinePoints(HEART_SHAPE.body);
  for (const id of ['chat-standard', 'label-sm', 'circle', 'webcam-round-lg', 'gameplay']) {
    const {adapter, props, frame} = kitCase(id);
    const n = framesOf(props);
    const context = {idBase: 'test', frame, style: props};
    for (let at = 0; at < n; at += 37) {
      const {back, front} = adapter.layers(props, at, n);
      for (const element of [...back, ...front].filter((entry) => entry.type === 'cloud-puff' || entry.type === 'cloud-heart')) {
        const puff = element.type === 'cloud-puff';
        const {markup, points} = drawn(element, puff ? clouds[element.variant as number]! : heart, context);
        // The background's own silhouette, unchanged.
        if (puff) assert.ok(markup.includes(`d="${CLOUD_BODIES[element.variant as number]}"`), `${id}: a silhueta do fundo`);
        let far = 0;
        for (const point of points) far = Math.max(far, Math.hypot(point.x - element.x, point.y - element.y));
        // A hollow heart's band reaches past its outline: what the reach adds for it is checked against the drawn width below.
        const band = element.hollow === 1 ? (HEART_SHAPE.band / 2) * ((element.size as number) / (HEART_SHAPE.unit + HEART_SHAPE.band / 2)) : 0;
        assert.ok(far + band <= element.reach - INK + 0.05, `${id} frame ${at} ${element.type}: ${far + band} > ${element.reach - INK}`);
        // And it fills it: a circle far wider than the drawing would waste the edge's room.
        assert.ok(far + band >= (puff ? 0.9 : 0.95) * (element.reach - INK) / (puff ? 1.045 : 1), `${id} frame ${at} ${element.type}: ${far + band} preenche o círculo`);
      }
    }
  }
});

test('cloud: a nuvem passa por cima da borda (o topo dela sobe acima do contorno)', () => {
  const clouds = CLOUD_BODIES.map(outlinePoints);
  for (const id of ['chat-standard', 'label', 'card', 'circle-sm', 'webcam-16x9']) {
    const {adapter, props, frame} = kitCase(id);
    const puff = adapter.layers(props, 0, framesOf(props)).back.find((element) => element.type === 'cloud-puff')!;
    const {points} = drawn(puff, clouds[puff.variant as number]!, {idBase: 'test', frame, style: props});
    const top = Math.min(...points.map((point) => point.y));
    assert.ok(top < frame.outline.y - 0.2 * (puff.width as number), `${id}: topo ${top}, borda ${frame.outline.y}`);
  }
});

test('cloud: abaixo de 28 px de nuvem, uma cintila é a principal; com 28, a nuvem', () => {
  assert.equal(CLOUD_MIN_WIDTH, 28);
  const small = kitCase('chat-standard', {ornamentSize: 27}).placements;
  assert.equal(small[0]!.motif, 'twinkle');
  assert.ok(small[0]!.extent >= TWINKLE_MIN_EXTENT, `${small[0]!.extent}`);
  assert.ok(!small.some((placement) => placement.motif.startsWith('cloud') || placement.motif.startsWith('heart')));
  assert.equal(kitCase('chat-standard', {ornamentSize: 28}).placements[0]!.motif, 'cloud');
});

test('cloud: ritmos do fundo (respiração duas vezes por loop, flutuação e inclinação de até 2,4° uma vez) e a emenda sem salto', () => {
  const {props} = kitCase('chat-standard');
  const n = framesOf(props);
  assert.equal(n, 720);
  const hero = (at: number) => elementsAt('chat-standard', at).find((element) => element.type === 'cloud-puff')!;
  let breaths = 0;
  let floats = 0;
  let tilt = 0;
  for (let at = 1; at <= n; at++) {
    const [before, after] = [hero(at - 1), hero(at)];
    if (Math.sign((before.squashX as number) - 1) !== Math.sign((after.squashX as number) - 1)) breaths++;
    if (Math.sign(before.x - hero(0).x) !== Math.sign(after.x - hero(0).x)) floats++;
    tilt = Math.max(tilt, Math.abs(after.rotation as number));
  }
  // Two sign changes per cycle: two breaths and one float per loop.
  assert.equal(breaths, 4);
  assert.ok(floats >= 1 && floats <= 3, `flutuação ${floats}`);
  assert.ok(tilt <= 2.4 + 1e-9 && tilt >= 2, `inclinação ${tilt}`);
  // The seam: frame N is frame 0, field by field, on every element.
  const [first, last] = [elementsAt('chat-standard', 0), elementsAt('chat-standard', n)];
  for (const [index, element] of first.entries()) {
    for (const [key, value] of Object.entries(element)) {
      if (typeof value === 'number') assert.ok(Math.abs(value - (last[index]![key] as number)) < 1e-9, `${element.type}.${key}`);
    }
  }
});

test('cloud: no quadro 0 (o PNG do pack) as cintilas estão acesas e o brilho da bolha também', () => {
  for (const id of kitSizeIds(THEME)) {
    for (const element of elementsAt(id, 0).filter((entry) => entry.type === 'cloud-twinkle' || entry.type === 'cloud-glint')) {
      assert.ok(element.opacity >= 0.9, `${id} ${element.type}: ${element.opacity}`);
    }
  }
});

test('cloud: as cores do kit (nuvem rosa, nuvem achatada azul-bebê, coração lilás, coração vazado rosa)', () => {
  const elements = elementsAt('chat-standard', 0);
  const of = (type: string, key: string, value: number) => elements.find((element) => element.type === type && element[key] === value)!;
  assert.equal(of('cloud-puff', 'variant', 0).color, '#FFB3D4');
  assert.equal(of('cloud-puff', 'variant', 1).color, '#CFE6FF');
  assert.equal(of('cloud-heart', 'hollow', 0).color, '#B78AFF');
  assert.equal(of('cloud-heart', 'hollow', 1).color, '#FFB3D4');
});

test('cloud: a medida das silhuetas recusa um comando de path que ela não mede', () => {
  assert.equal(outlinePoints('M0 0C1 0 2 0 3 0Z').length, 25);
  assert.throws(() => outlinePoints('M0 0Q1 1 2 0Z'), /command Q is not measured/);
  assert.throws(() => outlinePoints('M0 0a1 1 0 0 1 2 0Z'), /command a is not measured/);
});
