import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BAT_BODY, BAT_WING_LEFT, BAT_WING_RIGHT, Pumpkin} from '../src/backgrounds/halloween/HalloweenArtwork';
import {
  cornerSlots, ORNAMENT_CLEARANCE, ORNAMENT_REGISTRY, rectDistance, roomAt, roundRectSdf, type OrnamentElement, type OrnamentFrame,
  type OrnamentPlacement,
} from '../src/overlays/shared';
import {
  BAT_EXTENT, BAT_INK, BAT_MAX_SPANS, BAT_REACH, BAT_RIM, EMBER, EMBER_REACH, emberExtent, MOON_MIN_EXTENT, PUMPKIN_MAX, STAR_SIZES,
} from '../src/overlays/shared/ornaments/sets/noite-place';
import {NAMED_SIZES, sizeProps, type NamedSize} from '../src/sizes';
import {inkOf} from './helpers/ink';
import {framesOf, kitProps, kitSizeIds, ORNAMENT_KINDS, type OrnamentKindName, type OrnamentProps} from './helpers/ornament-kinds';

/**
 * The 'noite' set's own guarantees (the shared harness, tests/helpers/ornament-harness.ts, checks the
 * element contract): the moon at every named size, which secondaries each size keeps, the frame-0
 * pose the pack's PNGs show, the background's rhythms and shapes, and nothing over the text.
 */

const noite = ORNAMENT_REGISTRY.noite;
/** A theme-like base: the kit's colours and duration, and the ornamentSize the chat and block presets use. */
const BASE = {
  ornaments: 'noite', ornamentSize: 64, ornamentColors: ['#9B85C9', '#F7DCA6', '#ED792D'], durationSeconds: 12, seed: 31,
} as const;

const kindOf = (size: NamedSize) => size.kind as OrnamentKindName;
const layoutAt = (size: NamedSize, extra: Record<string, unknown> = {}) => {
  const adapter = ORNAMENT_KINDS[kindOf(size)];
  const props = adapter.parse({...BASE, ...extra, ...sizeProps(size)});
  return {props, ...adapter.ornamentLayout(props)};
};
const motifs = (placements: readonly OrnamentPlacement[]) => placements.map((placement) => placement.motif);
const count = (placements: readonly OrnamentPlacement[], motif: string) => placements.filter((placement) => placement.motif === motif).length;
const build = (frame: OrnamentFrame, placements: readonly OrnamentPlacement[], props: OrnamentProps, f: number, n: number) =>
  noite.build(frame, placements, props, f, n);

test('[noite] a lua (principal) está em todos os 27 tamanhos, atrás, e na frente só em tela e sem sangria', () => {
  assert.equal(NAMED_SIZES.length, 27);
  for (const size of NAMED_SIZES) {
    for (const ornamentSize of [12, 44, 256]) {
      const {frame, placements} = layoutAt(size, {ornamentSize});
      assert.equal(placements[0]?.motif, 'moon', `${size.id} @${ornamentSize}`);
      assert.ok(placements[0]!.extent >= Math.min(MOON_MIN_EXTENT, 0.35 * ornamentSize) - 1e-9, `${size.id} @${ornamentSize}`);
      const front = frame.fit === 'screen' || size.bleed === 0;
      assert.equal(placements[0]!.layer, front ? 'front' : 'back', `${size.id}: camada da lua`);
      assert.equal(placements.filter((placement) => placement.motif === 'moon').length, 1);
    }
  }
});

/** The kit as the pack renders it: the kind's preset, the pack item's props, then the size. */
const kitAt = (size: NamedSize) => {
  const adapter = ORNAMENT_KINDS[kindOf(size)];
  const props = adapter.parse(kitProps('halloween-noite', size));
  return {props, ...adapter.ornamentLayout(props)};
};

test('[noite] kit: quais motivos ficam em cada tamanho e com que tamanho (presets e props do pack)', () => {
  // bats = the trio next to the moon + the second flock on top edges of 900 px or more; stars =
  // the 4-point stars (top, sides, ring arcs and the bottom's small ones); embers = the bottom run's.
  type Want = {bats: number; pumpkins: number; small: number; stars: number; embers: number};
  const want = (bats: number, stars: number, embers = 0): Want => ({bats, pumpkins: 2, small: 1, stars, embers});
  const expected: Record<string, Want> = {
    'chat-compact': want(2, 0),
    'chat-standard': want(2, 4),
    'chat-tall': want(2, 6),
    'chat-column': want(2, 9),
    'chat-vertical': want(4, 9, 2),
    'label-sm': want(1, 0),
    label: want(2, 0),
    'lower-third': want(5, 6, 3),
    title: want(5, 6, 3),
    card: want(2, 3, 1),
    square: want(2, 0),
    list: want(2, 6),
    'circle-sm': want(1, 0),
    circle: want(2, 0),
    'circle-lg': want(2, 0),
    // The Twitch panel (with the pack's padding 48 × 36): the moon in front (Ø46, 6 px in from the edge), one bat, three pumpkins.
    'twitch-panel': want(1, 0),
    'webcam-16x9': want(2, 3, 1),
    // The large frames scale the kit (webcam-16x9-lg ×1.5 with bleed 72, gameplay ×2 with bleed 96):
    // in the set's own space they hold the motifs of a webcam-16x9.
    'webcam-16x9-lg': want(2, 3, 1),
    'webcam-4x3': want(2, 0),
    'webcam-square': want(2, 0),
    'webcam-round-sm': want(3, 0),
    'webcam-round': want(3, 0),
    'webcam-round-lg': want(3, 3),
    'webcam-vertical': want(2, 4),
    gameplay: want(2, 4, 2),
  };
  // Every size the pack renders with ornaments (the screen frames come only without them).
  assert.deepEqual(Object.keys(expected).sort(), kitSizeIds('halloween-noite').sort());
  for (const size of NAMED_SIZES.filter((entry) => entry.id in expected)) {
    const {props, frame, placements} = kitAt(size);
    const stars = placements.filter((placement) => placement.motif.startsWith('star')).length;
    assert.deepEqual(
      {bats: count(placements, 'bat'), pumpkins: count(placements, 'pumpkin'), small: count(placements, 'pumpkin-small'), stars, embers: count(placements, 'ember')},
      expected[size.id],
      `${size.id}: ${motifs(placements).join(', ')}`,
    );
    const moon = placements[0]!;
    // The hero is limited by its room, not by the preset, wherever a room target applies (every
    // size but the round blocks, where the block preset's Ø64 caps it: more would crowd circle-sm);
    // its room is its extent's ceiling at its corner.
    const room = roomAt(frame, cornerSlots(frame).find((corner) => corner.slot === moon.slot)!, moon.layer).extent;
    if (frame.circle && size.kind === 'block') assert.equal(moon.size, props.ornamentSize, `${size.id}: lua no tamanho do preset`);
    else assert.ok(moon.extent >= 0.85 * room - 1e-9, `${size.id}: lua ${moon.extent} de ${room}`);
    // Secondaries: fixed px caps (never scaled with the box), minimums, and the kit's targets
    // (bats ≥ 29 px, pumpkins ≥ 32 px), the Twitch panel included (with the pack's padding).
    for (const placement of placements) {
      if (placement.motif === 'bat') {
        assert.ok(placement.size >= 29 - 1e-9 && placement.size <= BAT_MAX_SPANS[0] + 1e-9, `${size.id}: morcego ${placement.size}`);
      }
      if (placement.motif.startsWith('pumpkin')) {
        assert.ok(placement.size >= 32 - 1e-9 && placement.size <= PUMPKIN_MAX.large + 1e-9, `${size.id}: abóbora ${placement.size}`);
      }
    }
    // The Twitch panel (no bleed): the front moon keeps 7 px from the image's edges (4 px inside
    // the 3 px stroke), so neither the edge nor the stroke's corner cuts it.
    if (size.id === 'twitch-panel') {
      assert.equal(moon.layer, 'front');
      assert.ok(moon.x + moon.size / 2 <= 313 + 1e-9 && moon.y - moon.size / 2 >= 7 - 1e-9, `twitch-panel: lua ${moon.x}, ${moon.y}, Ø${moon.size}`);
    }
  }
  // Too small an ornamentSize leaves the moon alone (every secondary is under its minimum).
  const chat = NAMED_SIZES.find((entry) => entry.id === 'chat-standard')!;
  assert.deepEqual(motifs(layoutAt(chat, {ornamentSize: 12}).placements).filter((motif) => !motif.startsWith('star')), ['moon']);
  // A huge ornamentSize never grows the secondaries past their px caps.
  for (const placement of layoutAt(NAMED_SIZES.find((entry) => entry.id === 'gameplay')!, {ornamentSize: 256}).placements) {
    if (placement.motif === 'bat') assert.ok(placement.size <= BAT_MAX_SPANS[0] + 1e-9);
    if (placement.motif.startsWith('pumpkin')) assert.ok(placement.size <= PUMPKIN_MAX.large + 1e-9);
  }
});

test('[noite] estrelas e brasas: passo fixo nas bordas longas, longe dos outros motivos, nenhuma nas etiquetas', () => {
  const isEdge = (placement: OrnamentPlacement) => placement.motif.startsWith('star') || placement.motif === 'ember';
  for (const size of NAMED_SIZES) {
    const {frame, placements} = kitAt(size);
    const stars = placements.filter(isEdge);
    const others = placements.filter((placement) => !isEdge(placement));
    if (['label-sm', 'label', 'circle-sm', 'twitch-panel'].includes(size.id)) assert.equal(stars.length, 0, size.id);
    // Top, sides and ring arcs alternate a big and a small star; the bottom run an ember and a small star (an ember first).
    const along = stars.filter((star) => star.slot !== 'bottom');
    const bottom = stars.filter((star) => star.slot === 'bottom');
    along.forEach((star, index) => assert.equal(star.motif, index % 2 ? 'star-small' : 'star', `${size.id}: estrela ${index}`));
    bottom.forEach((star, index) => assert.equal(star.motif, index % 2 ? 'star-small' : 'ember', `${size.id}: embaixo ${index}`));
    if (frame.circle) assert.equal(bottom.length, 0, `${size.id}: sem fileira de baixo no círculo`);
    stars.forEach((star, index) => {
      const want = star.motif === 'ember' ? {extent: emberExtent(frame.glow > 0), size: 2 * EMBER.disc}
        : {extent: STAR_SIZES[star.motif === 'star' ? 0 : 1].extent, size: 8 * STAR_SIZES[star.motif === 'star' ? 0 : 1].scale};
      assert.equal(star.extent, want.extent, `${size.id}: ${star.motif} ${index}`);
      assert.equal(star.size, want.size);
      assert.equal(star.layer, 'front');
      for (const other of others) {
        assert.ok(Math.hypot(star.x - other.x, star.y - other.y) >= star.extent + other.extent + 16 - 1e-9, `${size.id}: estrela perto de ${other.motif}`);
      }
      // Stars along one straight edge sit on whole multiples of the 168 px pitch.
      const next = stars[index + 1];
      if (!frame.circle && next && next.slot === star.slot) {
        const step = star.slot === 'top' || star.slot === 'bottom' ? next.x - star.x : next.y - star.y;
        assert.ok(Math.abs(step / 168 - Math.round(step / 168)) < 1e-9 && step > 0, `${size.id}: passo ${step}`);
      }
    });
  }
});

test('[noite] luz nunca come o espaço do corpo: light ≤ reach + max(4, 0,25·reach) (a brasa: o disco é o corpo)', () => {
  for (const size of NAMED_SIZES) {
    const {props, frame, placements} = kitAt(size);
    for (const element of build(frame, placements, props, 0, framesOf(props))) {
      // As in the background, the ember's soft disc is what reads as the ember: it may exceed the
      // budget, but never its radius nor, with the orbit, the placement's extent.
      if (element.type === 'noite-ember') {
        const placement = placements[element.anchor]!;
        assert.ok(element.light <= EMBER.disc + 1e-9 && EMBER.orbit + element.light <= placement.extent + 1e-9, `${size.id}: brasa ${element.light}`);
        continue;
      }
      assert.ok(element.light <= element.reach + Math.max(4, 0.25 * element.reach) + 1e-9, `${size.id}: ${element.type} ${element.light} > ${element.reach}`);
    }
  }
});

test('[noite] blocos redondos: a lua fica no céu (TR) e nada da frente toca o arco de destaque', () => {
  // The arc (BlockLoop: 60° to each side of the top or the left), in degrees counter-clockwise from the right, y up.
  const arcSpan = {topo: [30, 150], esquerda: [120, 240]} as const;
  for (const id of ['circle-sm', 'circle', 'circle-lg']) {
    const size = NAMED_SIZES.find((entry) => entry.id === id)!;
    for (const accent of ['esquerda', 'topo', 'nenhum'] as const) {
      for (const glow of [0, 14]) {
        const where = `${id} ${accent} glow ${glow}`;
        const {frame, placements} = layoutAt(size, {accent, glow});
        const cx = frame.outline.x + frame.outline.width / 2;
        const cy = frame.outline.y + frame.outline.height / 2;
        // The moon is a back motif (the ring and the arc paint over it): it keeps the sky's corner with every accent.
        assert.equal(placements[0]!.slot, 'TR', `${where}: canto da lua`);
        assert.ok(placements[0]!.y < cy, `${where}: lua acima do centro`);
        assert.ok(count(placements, 'bat') >= 1, `${where}: morcegos`);
        if (accent === 'nenhum') continue;
        const [from, to] = arcSpan[accent];
        for (const placement of placements) {
          if (placement.layer !== 'front') continue;
          const distance = Math.hypot(placement.x - cx, placement.y - cy);
          assert.ok(distance > placement.extent, `${where}: ${placement.motif} fora do centro`);
          const half = Math.asin(placement.extent / distance) * 180 / Math.PI;
          const angle = Math.atan2(cy - placement.y, placement.x - cx) * 180 / Math.PI;
          const offset = Math.abs((((angle - (from + to) / 2) % 360) + 540) % 360 - 180);
          assert.ok(offset - half >= (to - from) / 2 - 1e-9, `${where}: ${placement.motif}@${placement.slot} (${angle.toFixed(1)}° ± ${half.toFixed(1)}°) toca o arco`);
        }
      }
    }
  }
});

test('[noite] tela: lua, morcegos e abóboras na faixa com o preset, radius 64 e thickness 24', () => {
  for (const id of ['fullscreen', 'fullscreen-vertical']) {
    const size = NAMED_SIZES.find((entry) => entry.id === id)!;
    const adapter = ORNAMENT_KINDS.border;
    const {placements} = adapter.ornamentLayout(adapter.parse({...adapter.preset('halloween-noite'), ...sizeProps(size), radius: 64, thickness: 24}));
    assert.ok(placements.every((placement) => placement.layer === 'front'), id);
    assert.ok(placements[0]!.size >= 60 - 1e-9, `${id}: lua ${placements[0]!.size}`);
    assert.equal(count(placements, 'bat'), 5, `${id}: ${motifs(placements).join(', ')}`);
    for (const bat of placements.filter((placement) => placement.motif === 'bat')) assert.ok(bat.size >= 29, `${id}: morcego ${bat.size}`);
  }
  // The bare preset (radius 12, thickness 12) keeps the moon and still fits bats in the band.
  for (const id of ['fullscreen', 'fullscreen-vertical']) {
    const size = NAMED_SIZES.find((entry) => entry.id === id)!;
    const adapter = ORNAMENT_KINDS.border;
    const {placements} = adapter.ornamentLayout(adapter.parse({...adapter.preset('halloween-noite'), ...sizeProps(size)}));
    assert.equal(placements[0]!.motif, 'moon');
    assert.ok(count(placements, 'bat') >= 3, `${id} (preset): ${motifs(placements).join(', ')}`);
  }
});

test('[noite] frame 0 é a pose do pack: asas abertas, abóboras acesas perto da média, lua inteira', () => {
  for (const seed of [1, 7, 31, 99, 2024]) {
    for (const id of ['chat-standard', 'lower-third', 'webcam-round', 'gameplay', 'fullscreen', 'twitch-panel']) {
      const size = NAMED_SIZES.find((entry) => entry.id === id)!;
      const {props, frame, placements} = layoutAt(size, {seed});
      const elements = build(frame, placements, props, 0, framesOf(props));
      for (const element of elements) {
        if (element.type === 'noite-bat') assert.ok((element.flap as number) >= 0.98, `${id} seed ${seed}: asas abertas (${element.flap})`);
        if (element.type === 'noite-star') assert.ok(element.opacity >= 0.93, `${id} seed ${seed}: estrela acesa (${element.opacity})`);
        if (element.type === 'noite-ember' && frame.glow > 0) assert.ok(element.lightOpacity >= 0.5, `${id} seed ${seed}: brasa acesa (${element.lightOpacity})`);
        if (element.type === 'noite-pumpkin') {
          assert.ok(Math.abs((element.glow as number) / 0.78 - 1) <= 0.15, `${id} seed ${seed}: chama na média (${element.glow})`);
        }
        assert.ok(element.opacity >= 0.5, `${id}: visível no frame 0`);
      }
      // The moon keeps its place and element (the hero) but is never painted, and has no light.
      const moon = elements[0]!;
      assert.equal(moon.type, 'noite-moon');
      assert.equal(moon.light, 0, `${id}: lua sem halo`);
      assert.equal(ORNAMENT_REGISTRY.noite.render(moon, 0, {idBase: 'x', frame, style: props}), null, `${id}: lua não desenhada`);
    }
  }
});

/** The whole-number frequencies present in a field over one loop (DFT magnitude above noise). */
const spectrum = (values: readonly number[]) => {
  const n = values.length;
  const present: number[] = [];
  for (let k = 1; k < n / 2; k++) {
    let re = 0;
    let im = 0;
    values.forEach((value, index) => {
      re += value * Math.cos(2 * Math.PI * k * index / n);
      im -= value * Math.sin(2 * Math.PI * k * index / n);
    });
    if (Math.hypot(re, im) / n > 1e-6) present.push(k);
  }
  return present;
};

test('[noite] ritmos do fundo: asas a 2 Hz, chama 3 e 7 por 12 s, voo 1×; periódicos em 3,7 e 12,25 s', () => {
  const size = NAMED_SIZES.find((entry) => entry.id === 'chat-standard')!;
  const {props, frame, placements} = layoutAt(size);
  const n = framesOf(props);
  const series = Array.from({length: n}, (_, f) => build(frame, placements, props, f, n));
  const field = (type: string, key: string) => series.map((elements) => elements.find((element) => element.type === type)![key] as number);
  assert.deepEqual(spectrum(field('noite-bat', 'flap')), [24]);
  // Overlay bats never fold below half open (a paused frame or a GIF frame always shows them).
  assert.ok(Math.min(...field('noite-bat', 'flap')) >= 0.5 - 1e-9);
  const twinkles = series[0]!.filter((element) => element.type === 'noite-star').map((_, index) =>
    series.map((elements) => elements.filter((element) => element.type === 'noite-star')[index]!.opacity));
  assert.ok(twinkles.length >= 2);
  twinkles.forEach((values, index) => assert.deepEqual(spectrum(values), [index % 2 === 0 ? 1 : 2]));
  assert.deepEqual(spectrum(field('noite-pumpkin', 'glow')), [3, 7]);
  assert.deepEqual(spectrum(field('noite-bat', 'x')), [1]);
  assert.deepEqual(spectrum(field('noite-bat', 'y')), [2]);
  // Embers (lower-third's bottom run): an in-place orbit once per loop, the disc breathing twice.
  {
    const at = layoutAt(NAMED_SIZES.find((entry) => entry.id === 'lower-third')!);
    const frames = framesOf(at.props);
    const embers = Array.from({length: frames}, (_, f) => build(at.frame, at.placements, at.props, f, frames).filter((element) => element.type === 'noite-ember'));
    assert.ok(embers[0]!.length >= 2);
    embers[0]!.forEach((_, index) => {
      const of = (key: string) => embers.map((elements) => elements[index]![key] as number);
      assert.deepEqual(spectrum(of('x')), [1]);
      assert.deepEqual(spectrum(of('y')), [1]);
      assert.deepEqual(spectrum(of('lightOpacity')), [2]);
      const placement = at.placements[embers[0]![index]!.anchor]!;
      for (const elements of embers) {
        const element = elements[index]!;
        assert.ok(Math.abs(Math.hypot(element.x - placement.x, element.y - placement.y) - EMBER.orbit) < 1e-9, 'órbita de 3 px');
        assert.equal(element.reach, EMBER_REACH);
        assert.ok(Math.abs(element.reach - 2.8) < 1e-9, `alcance da brasa ${element.reach}`);
        assert.equal(element.light, EMBER.disc);
        assert.equal(element.light, 10);
      }
    });
  }

  for (const durationSeconds of [3.7, 12.25]) {
    for (const id of ['chat-standard', 'circle', 'webcam-16x9', 'fullscreen-vertical']) {
      const target = NAMED_SIZES.find((entry) => entry.id === id)!;
      const at = layoutAt(target, {durationSeconds});
      const frames = framesOf(at.props);
      const same = (a: readonly OrnamentElement[], b: readonly OrnamentElement[], where: string) => {
        assert.equal(a.length, b.length, where);
        a.forEach((element, index) => {
          for (const [key, value] of Object.entries(element)) {
            if (typeof value === 'number') assert.ok(Math.abs(value - (b[index]![key] as number)) < 1e-9, `${where} ${element.type}.${key}`);
            else assert.equal(value, b[index]![key], `${where} ${element.type}.${key}`);
          }
        });
      };
      const of = (f: number) => build(at.frame, at.placements, at.props, f, frames);
      same(of(frames), of(0), `${id} ${durationSeconds} s: N = 0`);
      same(of(-0.5), of(frames - 0.5), `${id} ${durationSeconds} s: emenda`);
      // Velocity at the seam: the second difference across it is as small as anywhere else.
      const e0 = of(0);
      const [before, after] = [of(-0.25), of(0.25)];
      e0.forEach((element, index) => {
        for (const key of ['x', 'y', 'flap', 'glow']) {
          if (typeof element[key] !== 'number') continue;
          const second = (before[index]![key] as number) - 2 * (element[key] as number) + (after[index]![key] as number);
          assert.ok(Math.abs(second) < 0.05, `${id} ${durationSeconds} s: ${element.type}.${key} contínuo na emenda`);
        }
      });
    }
  }
});

test('[noite] formas e cores do fundo', () => {
  // The bat is the background's own silhouette (HalloweenLoop draws the same exported paths).
  const background = readFileSync(new URL('../src/backgrounds/HalloweenLoop.tsx', import.meta.url), 'utf8');
  for (const name of ['BAT_WING_LEFT', 'BAT_WING_RIGHT', 'BAT_BODY']) assert.match(background, new RegExp(`d=\\{${name}\\}`));
  assert.equal(BAT_WING_LEFT, 'M-2 1 Q-16-20-40-16 Q-31-7-29 8 Q-20 2-15 13 Q-8 6-2 10Z');
  assert.equal(BAT_WING_RIGHT, 'M2 1 Q16-20 40-16 Q31-7 29 8 Q20 2 15 13 Q8 6 2 10Z');
  assert.equal(BAT_BODY, 'M-5-7-5-15 0-10 5-15 5-7 Q9 7 0 15 Q-9 7-5-7Z');
  // A bat's whole flight fits its extent: body 0.54 of the span plus its figure-of-eight; its reach
  // counts the moonlit rim's shift and half the edge stroke, so the painted bat stays inside it.
  assert.ok(BAT_EXTENT > 0.54 && BAT_EXTENT < 0.7);
  assert.ok(BAT_INK >= BAT_RIM + 0.35 - 1e-9);

  const size = NAMED_SIZES.find((entry) => entry.id === 'chat-standard')!;
  const {props} = layoutAt(size);
  const markup = ORNAMENT_KINDS.chat.render(props, 0, framesOf(props));
  // No moon disc (its gradient's moonlight stop at 0.63); the pumpkins in the warm colour.
  assert.doesNotMatch(markup, /offset="0\.63" stop-color="#F7DCA6"/);
  assert.match(markup, /stop-color="#ED792D"/);
  // The bats' fill is the background's #171021, derived from the mist: dark, with the moonlit rim.
  const {frame, placements} = layoutAt(size);
  const bat = build(frame, placements, props, 0, framesOf(props)).find((element) => element.type === 'noite-bat')!;
  const rgb = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const body = String(bat.bodyColor);
  const [r, g, b] = body.startsWith('#') ? rgb(body) : body.match(/\d+/g)!.map(Number);
  for (const [value, want] of [[r, 0x17], [g, 0x10], [b, 0x21]] as const) assert.ok(Math.abs(value! - want) <= 3, `morcego ${body}`);
  assert.equal(bat.rimColor, '#F7DCA6');
  assert.ok(Math.abs(bat.reach - (BAT_REACH * (bat.span as number) + BAT_INK)) < 1e-9, 'alcance do morcego com a borda iluminada');
  // Small pumpkins leave out the background's sub-pixel coloured lines (vine, stem stripe, eye highlights).
  const pumpkin = (fine?: boolean) =>
    renderToStaticMarkup(createElement(Pumpkin, {x: 0, y: 0, scale: 1, glow: 0.8, color: '#ED792D', id: 'p', ...(fine === undefined ? {} : {fine})}));
  for (const colour of ['#fff0b1', '#65704b', '#849267']) {
    assert.doesNotMatch(markup, new RegExp(`stroke="${colour}"`, 'i'), `abóbora pequena sem ${colour}`);
    // The background's pumpkin keeps them (fine defaults to true).
    assert.match(pumpkin(), new RegExp(`stroke="${colour}"`, 'i'));
    assert.doesNotMatch(pumpkin(false), new RegExp(`stroke="${colour}"`, 'i'));
  }
  assert.equal(pumpkin(true), pumpkin());
  // Orange appears only in the pumpkins and the embers' glow: bats and stars never use the warm colour.
  for (const element of build(frame, placements, props, 0, framesOf(props))) {
    if (element.type !== 'noite-pumpkin' && element.type !== 'noite-ember') assert.ok(!Object.values(element).includes('#ED792D'), element.type);
  }
});

test('[noite] nada desenhado sobre o texto nos tamanhos extremos', () => {
  for (const size of NAMED_SIZES.filter((entry) => entry.kind !== 'border')) {
    for (const ornamentSize of [12, 48, 256]) {
      const tight = size.kind === 'chat' ? {padding: 0} : {paddingX: 0, paddingY: 0};
      for (const extra of [{}, tight]) {
        const adapter = ORNAMENT_KINDS[kindOf(size)];
        const input = {...BASE, ornamentSize, ...extra, ...sizeProps(size)};
        // A tight padding may leave the moon no room at all: that is the documented refusal (harness).
        if (adapter.issues(input).length > 0) continue;
        const props = adapter.parse(input);
        const {frame, placements} = adapter.ornamentLayout(props);
        const n = framesOf(props);
        for (let f = 0; f < n; f += 7) {
          for (const element of build(frame, placements, props, f, n)) {
            if (element.layer !== 'front') continue;
            for (const area of frame.keepOut) {
              assert.ok(rectDistance(area, element.x, element.y) >= Math.max(element.reach, element.light) + ORNAMENT_CLEARANCE - 1e-6,
                `${size.id} @${ornamentSize}: ${element.type} longe do texto`);
            }
          }
        }
      }
    }
  }
});

test('[noite] a tinta desenhada (traços e luz inclusos) cabe no lugar, no arquivo, fora da janela e longe do texto', () => {
  // What the markup paints (helpers/ink.ts), not what the elements declare: a bat or a halo drawn
  // larger than its reach fails here even when the element's own numbers still fit.
  for (const size of NAMED_SIZES) {
    const {props, frame, placements} = kitAt(size);
    const n = framesOf(props);
    for (let f = 0; f < n; f += 9) {
      build(frame, placements, props, f, n).forEach((element, key) => {
        const placement = placements[element.anchor]!;
        const where = `${size.id} frame ${f} ${element.type}#${element.anchor}`;
        const context = {idBase: `t-ornament-${element.layer}`, frame, style: props};
        const limit = frame.paintLimit;
        for (const {x, y, half} of inkOf(renderToStaticMarkup(createElement('svg', null, noite.render(element, key, context))))) {
          assert.ok(Math.hypot(x - placement.x, y - placement.y) + half <= placement.extent + 0.05, `${where}: dentro do lugar`);
          assert.ok(x - half >= limit.x - 1e-6 && x + half <= limit.x + limit.width + 1e-6
            && y - half >= limit.y - 1e-6 && y + half <= limit.y + limit.height + 1e-6, `${where}: dentro do arquivo`);
          if (frame.hole) assert.ok(roundRectSdf(frame.hole, x, y) - half >= -0.05, `${where}: fora da janela`);
          if (element.layer === 'front') {
            for (const area of frame.keepOut) assert.ok(rectDistance(area, x, y) - half >= ORNAMENT_CLEARANCE - 1e-6, `${where}: longe do texto`);
          }
        }
      });
    }
  }
});
