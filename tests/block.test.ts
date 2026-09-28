import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {
  BLOCK_ACCENTS, BlockFrame, blockCatalogEntry, blockLoopSchema, contentGlowOpacity,
  getBlockLayers, getBlockLayout, getBlockScene, type AccentArc, type BlockLoopProps,
} from '../src/overlays/block';
import {MAX_CONTENT_OPACITY, contentClearance, erf, getStrokeMotion, rectContains, roundRectSdf, type Rect} from '../src/overlays/shared';
import {resolveExport} from '../scripts/export';
import {buildExportOptions, parseRenderArgs} from '../scripts/render-args';
import {getCompositionMetadata} from '../src/settings';
import {getSize, sizeProps, sizesForKind} from '../src/sizes';
import {bruteGlowAt, cornersOf} from './helpers/glow-brute';
import {
  assertDeterministic, assertPeriodic, assertSeamVelocity, assertValidElements, type Sampler, type Scene, type SceneInput,
} from './helpers/scene-scans';
import {OVERLAY_THEMES} from './helpers/themes';

const THEMES = OVERLAY_THEMES;
const preset = (theme: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../presets/block-${theme}.json`, import.meta.url), 'utf8'));

/** A named size as props; twitch-panel has no bleed, and its size turns glow and halo off itself. */
const sized = (id: string): Record<string, unknown> => sizeProps(getSize(id));

const parse = (input: object): BlockLoopProps => blockLoopSchema.parse(input);
const issuesOf = (input: object) => blockLoopSchema.safeParse(input).error?.issues.map((issue) => issue.message) ?? [];

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Every corner of the rect lies within the inner edge of the arc's band: the band (and its clip) never covers it. */
const arcClearOf = (arc: AccentArc, area: Rect) =>
  cornersOf(area).every(([x, y]) => Math.hypot(x - arc.cx, y - arc.cy) <= arc.outer - arc.width + 1e-9);

// ── Schema, defaults and presets ────────────────────────────────────────────────────────────

test('Bloco: defaults são o neon no tamanho cartão, transparente, em WebM', () => {
  const props = parse({});
  assert.deepEqual(blockCatalogEntry.defaultProps, props);
  assert.deepEqual(blockLoopSchema.parse(props), props, 'os defaults passam de novo pelo schema sem mudar');
  assert.equal(blockCatalogEntry.id, 'BlockLoop');
  assert.equal(blockCatalogEntry.kind, 'block');
  assert.equal(blockCatalogEntry.getLayout, getBlockLayout);
  const card = getSize('card');
  assert.deepEqual([props.width, props.height, props.bleed], [card.width, card.height, card.bleed]);
  assert.equal(props.transparent, true);
  assert.equal(props.outputFormat, 'webm');
  assert.equal(props.guides, false);
  assert.deepEqual(props.strokeColors, ['#22D3EE', '#E879F9']);
  assert.equal(props.fillColors[0], '#120A38');
  assert.equal(props.strokeMotion, 'comets');
  assert.ok(props.glow > 0 && props.glowPulses > 0, 'neon brilha e pulsa');
  assert.deepEqual(getBlockLayout(props).canvas, {width: 704, height: 424});
});

test('Bloco: presets dos oito temas passam com strict e nunca fixam o tamanho', () => {
  for (const theme of THEMES) {
    const props = preset(theme);
    const result = blockLoopSchema.strict().safeParse(props);
    assert.equal(result.success, true, `${theme}: ${JSON.stringify(result.error?.issues)}`);
    for (const key of ['width', 'height', 'bleed', 'guides']) assert.ok(!(key in props), `${theme} não fixa ${key}`);
    // Every theme moves: a still first frame repeated for the whole cycle is not a loop.
    assert.notDeepEqual(getBlockScene(result.data!, 0, 480), getBlockScene(result.data!, 200, 480), theme);
  }
  // The theme family: the palettes the SPEC names.
  assert.deepEqual(preset('neon').strokeColors, ['#22D3EE', '#E879F9']);
  assert.equal(preset('neon').haloColor, '#A855F7');
  assert.deepEqual(preset('pastel').strokeColors, ['#F48FB8', '#6FCDB8', '#FFBA70']);
  assert.deepEqual(preset('halloween').strokeColors, ['#F97316', '#A855F7']);
  assert.equal(preset('glass').strokeWidth, 2);
});

test('Bloco: presets servem em todos os tamanhos (painel da Twitch sem brilho externo)', () => {
  for (const theme of THEMES) {
    for (const size of sizesForKind('block')) {
      const result = blockLoopSchema.safeParse({...preset(theme), ...sized(size.id)});
      assert.equal(result.success, true, `${theme} em ${size.id}: ${JSON.stringify(result.error?.issues)}`);
    }
  }
});

test('Bloco: recusa valores inválidos e aceita os limites documentados', () => {
  for (const input of [
    {width: 641}, {height: 15}, {bleed: 3}, {width: 3842}, {radius: -1}, {paddingX: -1}, {paddingY: 513},
    {accent: 'direita'}, {accentSize: 1}, {accentSize: 65}, {accentSheen: 5}, {accentSheen: 1.5}, {accentColor: 12},
    {trackOpacity: 1.01}, {trackOpacity: -0.1}, {strokeWidth: -1}, {glow: 129}, {halo: -1},
    {fill: 'xadrez'}, {strokeMotion: 'girando'}, {fillColors: []}, {strokeColors: ['#FFF', '#FFF', '#FFF', '#FFF', '#FFF']},
  ]) {
    assert.equal(blockLoopSchema.strict().safeParse(input).success, false, JSON.stringify(input));
  }
  assert.match(issuesOf({width: 641}).join(), /width must be even/);
  for (const input of [
    {accent: 'left', accentSize: 2, accentSheen: 4, strokeWidth: 0, glow: 0, halo: 0},
    {accent: 'top', accentSize: 64, paddingY: 0, radius: 0, trackOpacity: 0, glow: 0},
    {radius: 1920, trackOpacity: 1},
  ]) {
    assert.equal(blockLoopSchema.strict().safeParse(input).success, true, JSON.stringify(input));
  }
  for (const accent of BLOCK_ACCENTS) assert.equal(blockLoopSchema.safeParse({accent}).success, true, accent);
});

test('Bloco: arquivo acima de 4K é recusado com a saída', () => {
  assert.match(issuesOf({width: 3840, height: 2160, bleed: 32}).join(), /above the 3840×2160 limit: reduce width, height or bleed/);
  assert.equal(blockLoopSchema.safeParse({width: 3776, height: 2096, bleed: 32}).success, true);
});

// ── Geometry across the named sizes ─────────────────────────────────────────────────────────

test('Bloco: os 11 tamanhos nomeados, inclusive as proporções extremas e os círculos, têm geometria coerente', () => {
  const sizes = sizesForKind('block');
  assert.deepEqual(sizes.map((size) => size.id).sort(),
    ['card', 'circle', 'circle-lg', 'circle-sm', 'label', 'label-sm', 'list', 'lower-third', 'square', 'title', 'twitch-panel']);
  for (const size of sizes) {
    for (const accent of BLOCK_ACCENTS) {
      for (const radius of [0, 16, 999]) {
        const props = parse({...sized(size.id), accent, radius});
        const layout = getBlockLayout(props);
        const id = `${size.id} ${accent} r${radius}`;
        assert.deepEqual(layout.canvas, {width: size.width + 2 * size.bleed, height: size.height + 2 * size.bleed}, id);
        assert.deepEqual(layout.box, {x: size.bleed, y: size.bleed, width: size.width, height: size.height}, id);
        assert.ok(layout.outset <= props.bleed, `${id}: o brilho cabe no bleed`);
        for (const value of Object.values(layout.content)) assert.ok(Number.isInteger(value), `${id}: conteúdo em px inteiros`);
        assert.ok(layout.content.width >= 1 && layout.content.height >= 1, `${id}: sobra espaço para o texto`);
        assert.ok(rectContains(layout.box, layout.content), `${id}: conteúdo dentro da caixa`);
        // The content keeps clear of the stroke, the round corners included.
        for (const [x, y] of [
          [layout.content.x, layout.content.y], [layout.content.x + layout.content.width, layout.content.y + layout.content.height],
          [layout.content.x, layout.content.y + layout.content.height], [layout.content.x + layout.content.width, layout.content.y],
        ] as const) {
          assert.ok(roundRectSdf(layout.inner, x, y) <= 1e-9, `${id}: canto do conteúdo dentro do contorno`);
        }
        // Even in a pill, the text keeps the smaller padding from the curve.
        assert.ok(contentClearance(layout.inner, layout.content) >= Math.min(props.paddingX, props.paddingY) - 1e-9, `${id}: folga na curva`);
        if (accent === 'none') {
          assert.equal(layout.accent, null);
          assert.equal(layout.accentArc, null);
        } else if (layout.circle) {
          // A round block's accent is an arc along the inside of the stroke, clear of the text.
          assert.equal(layout.accent, null, id);
          assert.ok(layout.accentArc && arcClearOf(layout.accentArc, layout.content), `${id}: o arco fica fora do conteúdo`);
          assert.equal(layout.accentArc!.outer, layout.inner.width / 2, `${id}: o arco encosta por dentro do contorno`);
        } else {
          assert.equal(layout.accentArc, null);
          assert.ok(layout.accent && !overlaps(layout.accent, layout.content), `${id}: a barra fica fora do conteúdo`);
          assert.ok(layout.accent && rectContains(layout.inner, layout.accent), `${id}: a barra fica dentro do contorno`);
        }
      }
    }
  }
});

test('Bloco: a barra de destaque desloca o conteúdo pela sua espessura, com o padding depois dela', () => {
  const plain = getBlockLayout(parse({radius: 0}));
  const left = getBlockLayout(parse({radius: 0, accent: 'left', accentSize: 10}));
  const top = getBlockLayout(parse({radius: 0, accent: 'top', accentSize: 10}));
  assert.equal(left.content.x - plain.content.x, 10);
  assert.equal(left.content.x - (left.accent!.x + left.accent!.width), parse({}).paddingX);
  assert.equal(top.content.y - plain.content.y, 10);
  assert.equal(top.content.y - (top.accent!.y + top.accent!.height), parse({}).paddingY);
  assert.deepEqual(left.accent, {x: 36, y: 36, width: 10, height: 352});
});

test('Bloco: num círculo o conteúdo é o quadrado inscrito, com a folga do padding até a curva', () => {
  const props = parse({...sizeProps(getSize('square')), radius: 999, paddingX: 16, paddingY: 16});
  const {inner, content} = getBlockLayout(props);
  const side = (inner.width - 32) / Math.SQRT2;
  assert.ok(Math.abs(content.width - content.height) <= 2, JSON.stringify(content));
  assert.ok(content.width >= side - 2 && content.width <= side + 1e-9, `${content.width} vs ${side}`);
  assert.ok(contentClearance(inner, content) >= 16 - 1e-9);
  // A long pill keeps about its full height: trading more of it for width would not pay.
  const pill = getBlockLayout(parse({...sizeProps(getSize('lower-third')), radius: 999}));
  const full = pill.inner.height - 2 * parse({}).paddingY;
  assert.ok(pill.content.height <= full && pill.content.height >= full - 4, `${pill.content.height} vs ${full}`);
});

test('Bloco: a seed nunca move a caixa, o conteúdo nem a barra', () => {
  for (const size of sizesForKind('block')) {
    const layout = getBlockLayout(parse({...sized(size.id), accent: 'left', seed: 1}));
    for (const seed of [-7, 42, 2026]) {
      assert.deepEqual(getBlockLayout(parse({...sized(size.id), accent: 'left', seed})), layout, size.id);
    }
  }
});

test('Bloco: brilho ou halo que não cabem no bleed são recusados com o bleed que resolve', () => {
  // A box without bleed: the default neon glow is refused, and zero glow and halo are accepted.
  const twitch = {width: 320, height: 160, bleed: 0};
  assert.match(issuesOf(twitch).join(), /The glow goes past the margin: use bleed ≥ 20 or reduce the glow\./);
  assert.match(issuesOf({...twitch, halo: 0, glow: 14}).join(), /use bleed ≥ 14/);
  assert.match(issuesOf({...twitch, glow: 0, halo: 16}).join(), /use bleed ≥ 16/);
  assert.equal(blockLoopSchema.safeParse({...twitch, glow: 0, halo: 0}).success, true);
  // The twitch-panel size carries that itself, and wins over a preset's glow, as the CLI does.
  assert.deepEqual(sizeProps(getSize('twitch-panel')), {...twitch, shape: 'rectangle', glow: 0, halo: 0});
  for (const theme of THEMES) {
    const options = buildExportOptions(parseRenderArgs(['BlockLoop', '--size', 'twitch-panel', '--format', 'gif']), preset(theme));
    const {props, output} = resolveExport(options);
    const {glow, halo, bleed} = props as Record<string, unknown>;
    assert.deepEqual([glow, halo, bleed], [0, 0, 0], theme);
    assert.match(output, /BlockLoop-twitch-panel\.gif$/);
  }
  // The bleed the message names is accepted; two px less is refused.
  assert.match(issuesOf({halo: 41}).join(), /use bleed ≥ 42/);
  assert.equal(blockLoopSchema.safeParse({halo: 41, bleed: 42}).success, true);
  assert.equal(blockLoopSchema.safeParse({halo: 41, bleed: 40}).success, false);
});

test('Bloco: padding ou barra que não deixam espaço para o conteúdo são recusados', () => {
  const tiny = sizeProps(getSize('label-sm'));
  assert.match(issuesOf({...tiny, paddingY: 30}).join(), /The padding leaves no room for the content/);
  assert.match(issuesOf({...tiny, accent: 'top', accentSize: 64}).join(), /leaves no room/);
  assert.equal(blockLoopSchema.safeParse({...tiny, paddingY: 12}).success, true);
});

// ── Legibility: what is drawn above the fill ────────────────────────────────────────────────

test('Bloco: erf confere com valores de tabela', () => {
  for (const [x, value] of [[0, 0], [0.5, 0.5204999], [1, 0.8427008], [2, 0.9953223], [-1, -0.8427008]] as const) {
    assert.ok(Math.abs(erf(x) - value) < 2e-7, `erf(${x})`);
  }
});

test('Legibilidade: nada acima do fill entra no conteúdo, e o brilho fica abaixo do limite sobre ele', () => {
  const inputs = [
    {}, ...THEMES.map(preset),
    {strokeMotion: 'dashes', accent: 'left', accentSheen: 3},
    {strokeMotion: 'gradient', accent: 'top', accentSheen: 2, strokeWidth: 8, glow: 24, bleed: 24},
  ];
  for (const input of inputs) {
    for (const size of sizesForKind('block')) {
      for (const radius of [0, 16, 999]) {
        const props = parse({...input, ...sized(size.id), radius});
        const layout = getBlockLayout(props);
        const id = `${JSON.stringify(input).slice(0, 40)} ${size.id} r${radius}`;
        assert.ok(contentGlowOpacity({...layout, glow: props.glow, glowStrength: props.glowStrength}) <= MAX_CONTENT_OPACITY, `${id}: brilho sobre o texto`);
        for (const frame of [0, 97, 240, 413]) {
          const layers = getBlockLayers(props, frame, 480);
          // The stroke lives in the band between the box edge and the inside of the stroke.
          for (const element of layers.stroke) {
            assert.equal(element.track, 0);
            assert.ok(element.width <= layout.strokeWidth + 1e-9, `${id}: o traço não passa da faixa do contorno`);
          }
          for (const element of layers.accent) {
            if (element.type === 'rect') {
              assert.ok(!overlaps(element, layout.content), `${id}: barra fora do conteúdo`);
            } else if (element.type === 'arc' || layout.accentArc) {
              // On a circle the band and its glint are clipped to the arc, which keeps clear of the text.
              assert.ok(layout.accentArc && arcClearOf(layout.accentArc, layout.content), `${id}: arco fora do conteúdo`);
              assert.ok(element.opacity <= 1);
            } else {
              // The glint is exactly as wide as the bar across it, and clipped to the inside along it.
              const across = element.nx === 0
                ? {x: element.cx - element.length / 2, y: layout.inner.y, width: element.length, height: layout.inner.height}
                : {x: layout.inner.x, y: element.cy - element.length / 2, width: layout.inner.width, height: element.length};
              assert.ok(!overlaps(across, layout.content), `${id}: reflexo fora do conteúdo`);
              assert.ok(element.opacity <= 1);
            }
          }
        }
      }
    }
  }
});

test('Legibilidade: brilho grande com padding pequeno é recusado, e mais padding resolve', () => {
  const input = {glow: 48, bleed: 48, halo: 0, paddingX: 2, paddingY: 2, strokeWidth: 6};
  const [message] = issuesOf(input);
  assert.match(message!, /The stroke's glow would reach \d+% opacity over the text area \(the limit is 20%\): increase paddingX and paddingY or reduce glow\./);
  assert.equal(blockLoopSchema.safeParse({...input, paddingX: 40, paddingY: 40}).success, true);
  assert.equal(blockLoopSchema.safeParse({...input, glow: 2}).success, true);
  // The estimate falls with the distance and vanishes without a glow or a stroke.
  const layout = getBlockLayout(parse({}));
  assert.equal(contentGlowOpacity({...layout, glow: 0}), 0);
  assert.equal(contentGlowOpacity({...layout, strokeWidth: 0, glow: 20}), 0);
  assert.ok(contentClearance(layout.inner, layout.content) >= 16);
  const near = contentGlowOpacity({...layout, content: {x: 40, y: 40, width: 100, height: 20}, glow: 30});
  const far = contentGlowOpacity({...layout, content: {x: 80, y: 80, width: 100, height: 20}, glow: 30});
  assert.ok(near > far && far >= 0);
});

test('Legibilidade: o brilho é medido em 2D, e nos cantos do texto dois lados do contorno somam', () => {
  // A one-sided estimate took this for 18%; at the corner of the text it is about 38%.
  const doubled = {radius: 16, paddingX: 8, paddingY: 8, strokeWidth: 8, glow: 20};
  assert.match(issuesOf(doubled).join(), /The stroke's glow would reach \d+% opacity over the text area .*increase paddingX and paddingY or reduce glow\./);
  assert.equal(blockLoopSchema.safeParse({...doubled, paddingX: 16, paddingY: 16}).success, true);
  // The fast measure agrees with brute force at square corners, round corners and a pill.
  for (const input of [
    doubled,
    {radius: 0, paddingX: 12, paddingY: 12, strokeWidth: 6, glow: 20},
    {radius: 8, paddingX: 10, paddingY: 10, strokeWidth: 4, glow: 16},
    {...sized('label'), radius: 999, paddingX: 10, paddingY: 10, strokeWidth: 4, glow: 16},
  ]) {
    const props = parse({...input, glow: 0});
    const layout = getBlockLayout(props);
    const brute = Math.max(...cornersOf(layout.content).map(([x, y]) =>
      bruteGlowAt([{outer: layout.shape, inner: layout.inner}], input.glow, x, y, 0.25, props.glowStrength)));
    const fast = contentGlowOpacity({...layout, glow: input.glow, glowStrength: props.glowStrength});
    assert.ok(Math.abs(fast - brute) < 0.01, `${JSON.stringify(input)}: ${fast} ≠ ${brute}`);
  }
});

// ── Motion ──────────────────────────────────────────────────────────────────────────────────

test('Aliasing: contorno e preenchimento rápidos demais são recusados com a velocidade máxima, que é aceita', () => {
  const ants = {strokeMotion: 'dashes', dashLength: 4, gapLength: 4, strokeColors: ['#FFFFFF']};
  const [message] = issuesOf({...ants, strokeSpeed: 4000});
  assert.match(message!, /Speed too high for the dashes/);
  const limit = Number(message!.match(/strokeSpeed up to ([\d.]+) px\/s/)![1]);
  assert.equal(blockLoopSchema.safeParse({...ants, strokeSpeed: limit}).success, true);
  assert.equal(blockLoopSchema.safeParse({...ants, strokeSpeed: limit + 1}).success, false);
  const dots = {fill: 'dots', fillScale: 8, fillAngle: 0};
  const [fillMessage] = issuesOf({...dots, fillSpeed: 480});
  assert.match(fillMessage!, /Speed too high for the dots/);
  const fillLimit = Number(fillMessage!.match(/fillSpeed up to ([\d.]+) px\/s/)![1]);
  assert.equal(blockLoopSchema.safeParse({...dots, fillSpeed: fillLimit}).success, true);
  // The effective speed is rounded to whole laps and exposed for the sidecar, on the block's own track.
  const comets = {strokeMotion: 'comets', cometSpacing: 64, strokeColors: ['#FFFFFF'], ...sizeProps(getSize('label-sm'))};
  const motion = getStrokeMotion(parse({...comets, strokeSpeed: 100}), getBlockLayout(parse(comets)).track);
  assert.ok(motion.laps >= 1 && motion.speed > 0);
});

type Case = {id: string; input: Record<string, unknown>};

const CASES: Case[] = [
  {id: 'BlockLoop (padrão neon)', input: {}},
  ...THEMES.map((theme) => ({id: `BlockLoop (${theme})`, input: preset(theme)})),
  {id: 'BlockLoop (formigas, barra à esquerda com reflexo)', input: {strokeMotion: 'dashes', strokeColors: ['#22D3EE', '#E879F9', '#A78BFA'], accent: 'left', accentSheen: 2}},
  {id: 'BlockLoop (faixa, gradiente, barra no topo com reflexo)', input: {...sizeProps(getSize('lower-third')), strokeMotion: 'gradient', strokeColors: ['#22D3EE', '#E879F9', '#A78BFA'], accent: 'top', accentSheen: 3, fill: 'stripes'}},
  {id: 'BlockLoop (label-sm em pílula, cometas)', input: {...sizeProps(getSize('label-sm')), radius: 999, cometSpacing: 240, strokeSpeed: 300}},
  {id: 'BlockLoop (lista, brilhos, halo pulsando)', input: {...sizeProps(getSize('list')), fill: 'sparkles', halo: 24, glowPulses: 3}},
  {id: 'BlockLoop (painel da Twitch, sem bleed)', input: {...sizeProps(getSize('twitch-panel')), glow: 0, halo: 0, fill: 'gradient', accent: 'top', accentSheen: 1}},
];

for (const {id, input} of CASES) {
  const sample: Sampler = (scene: SceneInput, frame: number, length: number): Scene =>
    getBlockScene(parse({...input, ...scene}), frame, length);
  test(`${id}: seed e frame determinam a cena`, () => {
    assertDeterministic(id, sample);
    assert.notDeepEqual(sample({seed: 42}, 180, 480), sample({seed: 42}, 137, 480));
  });
  test(`${id}: o ciclo fecha em N para 50/60 fps e durações quebradas`, () => assertPeriodic(id, sample));
  // Everything is listed by place and every wrap is seeded off the seam: no seamExempt.
  test(`${id}: velocidade contínua na emenda`, () => assertSeamVelocity(id, sample));
  test(`${id}: dimensões e opacidades válidas`, () => assertValidElements(id, sample));
}

test('Bloco: o ciclo fecha em todos os tamanhos nomeados, em WebM e GIF, com tudo em movimento', () => {
  for (const size of sizesForKind('block')) {
    for (const theme of THEMES) {
      const props = parse({...preset(theme), ...sized(size.id), durationSeconds: 7.3, accentSheen: 1});
      for (const outputFormat of ['webm', 'gif'] as const) {
        const {durationInFrames} = getCompositionMetadata({durationSeconds: 7.3, outputFormat});
        const at = (frame: number) => getBlockScene({...props, outputFormat}, frame, durationInFrames);
        assert.deepEqual(at(durationInFrames), at(0), `${theme} ${size.id} ${outputFormat}`);
        assert.notDeepEqual(at(durationInFrames - 1), at(0), `${theme} ${size.id}: não duplique o primeiro frame`);
      }
    }
  }
});

test('Bloco: o reflexo da barra só dá a volta fora dela, longe da emenda', () => {
  for (const accent of ['left', 'top'] as const) {
    for (const seed of [-7, 1, 2026]) {
      const props = parse({accent, accentSheen: 1, seed});
      const bar = getBlockLayout(props).accent!;
      const length = accent === 'left' ? bar.height : bar.width;
      const start = accent === 'left' ? bar.y : bar.x;
      const positions = Array.from({length: 481}, (_, frame) => {
        const sheen = getBlockLayers(props, frame, 480).accent[1]!;
        assert.equal(sheen.type, 'sheen');
        return sheen.type === 'sheen' ? {at: accent === 'left' ? sheen.cy : sheen.cx, width: sheen.width} : {at: 0, width: 0};
      });
      let wraps = 0;
      for (let frame = 1; frame < positions.length; frame++) {
        const {at, width} = positions[frame]!;
        const previous = positions[frame - 1]!.at;
        if (at >= previous) continue;
        wraps++;
        assert.ok(frame > 1 && frame < 480, 'a volta não cai na emenda');
        // Before and after the jump, the glint is wholly beyond the bar's ends.
        assert.ok(previous - width / 2 >= start + length, 'saiu pelo fim antes de voltar');
        assert.ok(at + width / 2 <= start, 'volta antes do começo');
      }
      assert.equal(wraps, 1, `${accent} seed ${seed}`);
    }
  }
});

// ── Rendering ───────────────────────────────────────────────────────────────────────────────

const render = (input: object, frame = 0) => {
  const props = parse(input);
  return renderToStaticMarkup(createElement(BlockFrame, {props, frame, durationInFrames: 480}));
};

test('Render: SVG do tamanho do arquivo, sem blend mode, camadas na ordem', () => {
  for (const theme of THEMES) {
    for (const size of sizesForKind('block')) {
      const props = parse({...preset(theme), ...sized(size.id)});
      const {canvas} = getBlockLayout(props);
      const markup = render({...preset(theme), ...sized(size.id)}, 211);
      assert.match(markup, new RegExp(`<svg width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"`));
      assert.doesNotMatch(markup, /mix-blend-mode|NaN|Infinity|undefined|data-guides/);
      assert.match(markup, /clip-path="url\(#block-fill-clip\)"/);
    }
  }
  const markup = render({accent: 'left', accentSheen: 1});
  const fill = markup.indexOf('block-fill-clip');
  const accent = markup.indexOf('block-accent-clip');
  const stroke = markup.indexOf('block-stroke-glow');
  const halo = markup.indexOf('block-halo-mask');
  assert.ok(halo >= 0 && halo < fill && fill < accent && accent < stroke, 'halo, fill, barra, contorno');
  assert.doesNotMatch(render({}), /block-accent-clip/);
  assert.doesNotMatch(render({glow: 0, halo: 0}), /block-stroke-glow|block-halo/);
  // Alpha rule: transparent on WebM, composited over backgroundColor on MP4.
  assert.match(render({}), /background-color:transparent/);
  assert.match(render({outputFormat: 'mp4', backgroundColor: '#123456'}), /background-color:#123456/);
  assert.match(render({guides: true}), /data-guides/);
});

test('Bloco: o reflexo do vidro é tão discreto quanto o do chat, porque passa sobre o texto', () => {
  const props = parse(preset('glass'));
  let seen = 0;
  for (const frame of [0, 100, 300, 450]) {
    for (const element of getBlockLayers(props, frame, 480).fill) {
      if (element.type !== 'sheen') continue;
      seen++;
      assert.ok(element.opacity <= 0.2, `frame ${frame}`);
    }
  }
  assert.ok(seen > 0);
});
