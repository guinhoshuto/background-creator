import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {
  ChatFrame, chatCatalogEntry, chatGlowSources, chatLoopSchema, getChatLayers, getChatLayout, getChatScene, type ChatLoopProps,
} from '../src/overlays/chat';
import {
  MAX_CONTENT_OPACITY, getStrokeMotion, glowOverArea, layoutPanel, maxSpeedFor, minBleedFor, perimeterLength, rectContains,
  roundRectSdf, type Rect, type RoundRect,
} from '../src/overlays/shared';
import {getCompositionMetadata} from '../src/settings';
import {sizeProps, sizesForKind} from '../src/sizes';
import {bruteGlowAt, cornersOf} from './helpers/glow-brute';
import {
  assertDeterministic, assertPeriodic, assertSeamVelocity, assertValidElements, type Sampler, type Scene, type SceneInput,
} from './helpers/scene-scans';
import {OVERLAY_THEMES} from './helpers/themes';

const THEMES = OVERLAY_THEMES;

const readPreset = (theme: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../presets/chat-${theme}.json`, import.meta.url), 'utf8')) as Record<string, unknown>;

const PRESETS = Object.fromEntries(THEMES.map((theme) => [theme, readPreset(theme)])) as Record<(typeof THEMES)[number], Record<string, unknown>>;

const CHAT_SIZES = sizesForKind('chat');

/**
 * The literal defaultProps Root.tsx registers ChatLoop with (the Studio's "Save default props"
 * edits a literal, never a computed object); it must stay the schema's own defaults.
 */
const ROOT_DEFAULT_PROPS = {
  durationSeconds: 8, seed: 1, transparent: true, backgroundColor: '#0B0620', outputFormat: 'webm' as const,
  width: 400, height: 600, bleed: 32, guides: false, radius: 16, padding: 16,
  fill: 'gradiente' as const, fillColors: ['#120A38', '#26105C', '#0A1C4E'], fillOpacity: 0.9, fillScale: 32,
  fillSpeed: 16, fillAngle: 60, fillRise: false, fillLight: 0.05,
  strokeMotion: 'cometas' as const, strokeColors: ['#22D3EE', '#E879F9', '#A78BFA'], strokeWidth: 3,
  dashLength: 16, gapLength: 12, cometSpacing: 640, cometTail: 320, gradientLength: 480, strokeSpeed: 160, strokePulses: 1,
  strokeCore: 0.9, trackOpacity: 0.45, glow: 20, glowPulses: 1, glowStrength: 3, halo: 24, haloColor: '#A855F7', rimLight: 0,
  headerHeight: 48, headerColor: '#E879F9', headerOpacity: 0.1, headerLineWidth: 2,
  ornaments: 'nenhum' as const, ornamentColors: ['#CFC6E4', '#F6EFD8', '#E8963C'], ornamentSize: 48, ornamentScale: 1, lightning: 0,
};

const parse = (input: object): ChatLoopProps => chatLoopSchema.parse(input);

const sampler = (input: object): Sampler => (scene: SceneInput, frame: number, length: number): Scene =>
  getChatScene(parse({...input, ...scene}), frame, length);

const issuesOf = (input: object) => {
  const result = chatLoopSchema.safeParse(input);
  return result.success ? [] : result.error.issues;
};

// ── Generic scans ───────────────────────────────────────────────────────────────────────────

const CASES: {id: string; input: object}[] = [
  {id: 'padrão (neon)', input: {}},
  ...THEMES.map((theme) => ({id: `preset ${theme}`, input: PRESETS[theme]})),
  ...CHAT_SIZES.map((size) => ({id: `tamanho ${size.id}`, input: sizeProps(size)})),
  {id: 'sem cabeçalho, formigas', input: {headerHeight: 0, strokeMotion: 'formigas', strokeColors: ['#FFFFFF', '#22D3EE']}},
  {id: 'pílula com cabeçalho, gradiente no contorno', input: {radius: 999, strokeMotion: 'gradiente', padding: 24, headerHeight: 64}},
  {id: 'listras, pulso, halo pulsando', input: {fill: 'listras', strokeMotion: 'pulso', strokePulses: 3, glowPulses: 2, halo: 24}},
  {id: 'brilhos no lugar, cantos retos', input: {fill: 'brilhos', radius: 0, strokeWidth: 4, headerLineWidth: 0}},
  {id: 'vertical com vidro', input: {...sizeProps(CHAT_SIZES.find((size) => size.id === 'chat-vertical')!), fill: 'vidro', fillColors: ['#FFFFFF']}},
];

for (const {id, input} of CASES) {
  const sample = sampler(input);
  test(`ChatLoop ${id}: seed e frame determinam a cena`, () => {
    assertDeterministic(id, sample);
    assert.notDeepEqual(sample({seed: 42}, 180, 480), sample({seed: 42}, 137, 480), `${id}: a cena anda`);
  });
  test(`ChatLoop ${id}: o ciclo fecha em N para 50/60 fps e durações quebradas`, () => assertPeriodic(id, sample));
  test(`ChatLoop ${id}: velocidade contínua na emenda, sem exceções`, () => assertSeamVelocity(id, sample));
  test(`ChatLoop ${id}: dimensões e opacidades válidas`, () => assertValidElements(id, sample));
}

// ── Sizes and layout ────────────────────────────────────────────────────────────────────────

const inside = (shape: RoundRect, rect: Rect) =>
  [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]
    .every(([x, y]) => roundRectSdf(shape, x!, y!) <= 1e-9);

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('Tamanhos: os 5 tamanhos de chat, em todos os temas, dão o arquivo da tabela com o brilho dentro do bleed', () => {
  assert.deepEqual(CHAT_SIZES.map((size) => size.id), ['chat-compacto', 'chat-padrao', 'chat-alto', 'chat-coluna', 'chat-vertical']);
  for (const size of CHAT_SIZES) {
    for (const [theme, preset] of [['padrão', {}], ...Object.entries(PRESETS)] as const) {
      const props = parse({...preset, ...sizeProps(size)});
      const layout = getChatLayout(props);
      const label = `${size.id} ${theme}`;
      assert.deepEqual(layout.canvas, {width: size.width + 2 * size.bleed, height: size.height + 2 * size.bleed}, label);
      assert.deepEqual(layout.box, {x: size.bleed, y: size.bleed, width: size.width, height: size.height}, label);
      assert.deepEqual(getCompositionMetadata(props, layout.canvas).width, layout.canvas.width);
      assert.ok(layout.outset <= size.bleed, `${label}: brilho ${layout.outset} > bleed ${size.bleed}`);
      assert.ok(inside(layout.inner, layout.content), `${label}: conteúdo dentro do traço e dos cantos`);
      assert.ok(layout.header && inside(layout.inner, layout.header), `${label}: título dentro do traço e dos cantos`);
      for (const rect of [layout.content, layout.header!]) {
        assert.ok(rect.width >= 1 && rect.height >= 1, label);
        for (const value of Object.values(rect)) assert.ok(Number.isInteger(value), `${label}: pixels inteiros`);
      }
    }
  }
  // The full-height column: the file is exactly the screen's height.
  const column = getChatLayout(parse(sizeProps(CHAT_SIZES.find((size) => size.id === 'chat-coluna')!)));
  assert.deepEqual(column.canvas, {width: 512, height: 1080});
  const vertical = getChatLayout(parse(sizeProps(CHAT_SIZES.find((size) => size.id === 'chat-vertical')!)));
  assert.deepEqual(vertical.canvas, {width: 1024, height: 704});
});

test('Layout: o cabeçalho fica no topo, a linha logo abaixo e as mensagens um padding depois', () => {
  const props = parse({});
  const layout = getChatLayout(props);
  const {inner} = layout;
  assert.deepEqual(layout.headerBand, {x: inner.x, y: inner.y, width: inner.width, height: 48});
  assert.deepEqual(layout.divider, {x: inner.x, y: inner.y + 48, width: inner.width, height: 2});
  assert.equal(layout.content.y, inner.y + 48 + 2 + props.padding);
  // The title keeps the side padding and a quarter of the band above and below.
  assert.deepEqual(layout.header, {x: inner.x + 16, y: inner.y + 12, width: inner.width - 32, height: 24});
  // Without a header the panel is the engine's plain panel.
  const plain = parse({headerHeight: 0});
  const bare = getChatLayout(plain);
  assert.equal(bare.header, null);
  assert.equal(bare.headerBand, null);
  assert.equal(bare.divider, null);
  assert.deepEqual(bare.content, layoutPanel(plain).content);
  // Without the line the messages start right after the band.
  const noLine = getChatLayout(parse({headerLineWidth: 0}));
  assert.equal(noLine.divider, null);
  assert.equal(noLine.content.y, inner.y + 48 + props.padding);
});

test('Layout: a seed nunca move a caixa, o conteúdo nem o título', () => {
  for (const theme of THEMES) {
    const layout = getChatLayout(parse({...PRESETS[theme], seed: 1}));
    for (const seed of [-7, 2, 2026]) assert.deepEqual(getChatLayout(parse({...PRESETS[theme], seed})), layout, theme);
  }
});

test('Decoração: faixa e linha do cabeçalho ficam fora das mensagens, e a linha fora do título', () => {
  for (const size of CHAT_SIZES) {
    // The pill keeps an 8 px padding, so its glow is the engine's plain one (the neon's would wash the text).
    for (const input of [{}, ...Object.values(PRESETS), {radius: 999, headerHeight: 96, headerLineWidth: 6, padding: 8, glowStrength: 1}]) {
      const props = parse({...input, ...sizeProps(size)});
      const layout = getChatLayout(props);
      const layers = getChatLayers(props, 77, 480);
      for (const band of layers.header) {
        assert.ok(!overlaps(band, layout.content), `${size.id}: a faixa não cobre as mensagens`);
        assert.ok(rectContains(band, layout.header!), `${size.id}: o título fica na faixa`);
      }
      for (const line of layers.divider) {
        const rect = {x: line.x1, y: line.y - line.width / 2, width: line.x2 - line.x1, height: line.width};
        assert.ok(!overlaps(rect, layout.content), `${size.id}: a linha não cobre as mensagens`);
        assert.ok(!overlaps(rect, layout.header!), `${size.id}: a linha não cobre o título`);
        assert.ok(line.width >= 2, 'linha de 2 px ou mais (croma do VP9)');
      }
      // The stroke is a band inside the box edge: the content sits wholly inside it.
      assert.ok(inside(layout.inner, layout.content));
    }
  }
});

// ── Legibility ──────────────────────────────────────────────────────────────────────────────

/** The brightest glow over an area by brute force: its corners, where the edge's sides meet. */
const bruteOver = (props: ChatLoopProps, area: Rect) =>
  Math.max(...cornersOf(area).map(([x, y]) => bruteGlowAt(chatGlowSources(getChatLayout(props)), props.glow, x, y, 0.25, props.glowStrength)));

test('Legibilidade: o brilho do contorno e da linha fica fraco sobre as mensagens e o título', () => {
  // What the review found accepted, now refused with the way out: glow over the messages from the
  // edge, and over the title from the line 4 px below it.
  for (const [input, where] of [
    [{padding: 4, strokeWidth: 8, glow: 48, bleed: 48}, 'messages'],
    [{padding: 6, strokeWidth: 6, glow: 30, bleed: 32}, 'messages'],
    [{headerHeight: 16, headerLineWidth: 4}, 'title'],
  ] as const) {
    const props = chatLoopSchema.parse({...input, glow: 0});
    const layout = getChatLayout(props);
    const area = where === 'title' ? layout.header! : layout.content;
    // The brute-force measure agrees that these really are too bright.
    assert.ok(bruteOver({...props, glow: input.glow ?? parse({}).glow}, area) > MAX_CONTENT_OPACITY, JSON.stringify(input));
    const messages = issuesOf(input).map((issue) => issue.message);
    assert.ok(messages.some((message) => message.includes(`over the ${where} area (the limit is 20%)`)), `${JSON.stringify(input)}: ${messages}`);
    assert.ok(issuesOf(input).every((issue) => issue.path[0] === 'glow'));
  }
  assert.match(issuesOf({padding: 4, strokeWidth: 8, glow: 48, bleed: 48})[0]!.message,
    /^The glow would reach \d+% opacity over the messages area \(the limit is 20%\): increase padding, or reduce glow or headerLineWidth\.$/);
  // Following the message works.
  // More padding clears the messages; a glow that wide then reaches the title from the line, and a
  // taller header (so more room between the title and the line) clears that too. At the plain
  // strength: the neon's triple gain needs more room still, which the same messages ask for.
  const wide = {padding: 40, strokeWidth: 8, glow: 48, bleed: 48, glowStrength: 1};
  assert.match(issuesOf(wide)[0]!.message, /over the title area/);
  assert.equal(chatLoopSchema.safeParse({...wide, headerHeight: 64}).success, true);
  assert.match(issuesOf({...wide, headerHeight: 64, glowStrength: 3})[0]!.message, /over the title area/);
  assert.equal(chatLoopSchema.safeParse({headerHeight: 48, headerLineWidth: 4}).success, true);
  assert.equal(chatLoopSchema.safeParse({headerHeight: 16, headerLineWidth: 4, glow: 4}).success, true);

  // The fast measure matches the brute force at the corners (square, round, pill; with and without a line).
  // Both scale the blur by the same gain, so the blur itself is compared at the plain strength.
  for (const input of [{radius: 0, padding: 8, glow: 20}, {radius: 16, padding: 10, glow: 16, strokeWidth: 4}, {radius: 999, padding: 24, glow: 20}]) {
    const props = chatLoopSchema.parse({...input, glow: 0, glowStrength: 1});
    const layout = getChatLayout(props);
    for (const area of [layout.content, layout.header!]) {
      const fast = glowOverArea(chatGlowSources(layout), input.glow, area, props.glowStrength);
      assert.ok(Math.abs(fast - bruteOver({...props, glow: input.glow}, area)) < 0.01, `${JSON.stringify(input)}: ${fast}`);
    }
  }

  // Every theme at every size stays under the limit (the schema would refuse it otherwise).
  for (const size of CHAT_SIZES) {
    for (const preset of [{}, ...Object.values(PRESETS)]) {
      const props = parse({...preset, ...sizeProps(size)});
      const layout = getChatLayout(props);
      for (const area of [layout.content, layout.header!]) {
        assert.ok(glowOverArea(chatGlowSources(layout), props.glow, area, props.glowStrength) <= MAX_CONTENT_OPACITY, size.id);
      }
    }
  }
});

test('Legibilidade: numa pílula, mensagens e título guardam o padding da curva', () => {
  const props = parse({radius: 999, padding: 24, headerHeight: 64});
  const layout = getChatLayout(props);
  const clearance = (area: Rect) => Math.min(...cornersOf(area).map(([x, y]) => -roundRectSdf(layout.inner, x, y)));
  assert.ok(clearance(layout.content) >= 24 - 1, `mensagens a ${clearance(layout.content)} px da curva`);
  assert.ok(clearance(layout.header!) >= 16 - 1, `título a ${clearance(layout.header!)} px da curva`);
});

// ── Refusals ────────────────────────────────────────────────────────────────────────────────

test('Recusas: tamanho ímpar, arquivo acima de 4K e tamanho livre par aceito', () => {
  assert.match(issuesOf({width: 401})[0]!.message, /width must be even/);
  assert.match(issuesOf({bleed: 33})[0]!.message, /bleed must be even/);
  assert.match(issuesOf({width: 3840, height: 2160, bleed: 32})[0]!.message, /above the 3840×2160 limit/);
  assert.equal(chatLoopSchema.safeParse({width: 520, height: 900, bleed: 40}).success, true);
});

test('Recusas: brilho ou halo além do bleed pedem o bleed par que cabe, que é aceito', () => {
  // A 40 px glow at the neon's strength would also wash the messages: the plain strength keeps
  // the bleed the only refusal.
  for (const input of [{glow: 40, halo: 0, glowStrength: 1}, {glow: 0, halo: 45}, {bleed: 0}]) {
    const issues = issuesOf(input);
    assert.equal(issues.length, 1, JSON.stringify(input));
    assert.deepEqual(issues[0]!.path, ['bleed']);
    const outset = Math.max(parse({...input, bleed: 256}).glow, parse({...input, bleed: 256}).halo);
    assert.equal(issues[0]!.message, `The glow goes past the margin: use bleed ≥ ${minBleedFor(outset)} or reduce the glow.`);
    assert.equal(chatLoopSchema.safeParse({...input, bleed: minBleedFor(outset)}).success, true);
  }
  // With no bleed, a chat panel without glow or halo is fine (a Twitch-style flat export).
  assert.equal(chatLoopSchema.safeParse({bleed: 0, glow: 0, halo: 0}).success, true);
});

test('Recusas: cabeçalho alto demais para as mensagens, ou baixo demais para o título', () => {
  const tall = issuesOf({height: 200, headerHeight: 170});
  assert.equal(tall.length, 1);
  assert.deepEqual(tall[0]!.path, ['headerHeight']);
  assert.match(tall[0]!.message, /leaves no room for the messages: reduce headerHeight/);
  const short = issuesOf({headerHeight: 2});
  assert.equal(short.length, 1);
  assert.match(short[0]!.message, /header of 2 px leaves no room for the title: increase headerHeight/);
  // An 8 px band leaves a 4 px title 2 px from the line: without a glow that is fine, with the
  // default glow the line's light would cover it (see the legibility test).
  assert.equal(chatLoopSchema.safeParse({headerHeight: 8, glow: 0}).success, true);
  assert.match(issuesOf({headerHeight: 8}).map((issue) => issue.message).join(), /over the title area/);
  // Without a header the engine's own refusal speaks.
  assert.match(issuesOf({headerHeight: 0, width: 64, height: 32, padding: 40})[0]!.message, /The padding leaves no room/);
});

test('Aliasing: contorno rápido demais é recusado com a velocidade máxima, que é aceita', () => {
  for (const outputFormat of ['webm', 'gif'] as const) {
    const input = {strokeMotion: 'formigas', strokeColors: ['#FFFFFF'], dashLength: 4, gapLength: 4, durationSeconds: 3.7, outputFormat};
    const issues = issuesOf({...input, strokeSpeed: 4000});
    assert.equal(issues.length, 1);
    assert.deepEqual(issues[0]!.path, ['strokeSpeed']);
    const max = Number(/up to ([\d.]+) px\/s/.exec(issues[0]!.message)![1]);
    assert.ok(max > 0);
    assert.equal(chatLoopSchema.safeParse({...input, strokeSpeed: max}).success, true, `${outputFormat}: ${max} px/s`);
    assert.equal(chatLoopSchema.safeParse({...input, strokeSpeed: max + 1}).success, false);
    // The message's limit is the engine's, on the chat's own track.
    const props = parse({...input, strokeSpeed: max});
    const motion = getStrokeMotion(props, getChatLayout(props).track);
    const {durationInFrames} = getCompositionMetadata(props);
    assert.equal(max, maxSpeedFor(motion.period * motion.unitsPerPeriod, 3.7, durationInFrames, motion.unitsPerPeriod));
  }
});

test('Aliasing: pontos rápidos demais no fundo são recusados com a saída', () => {
  const issues = issuesOf({fill: 'pontos', fillScale: 8, fillSpeed: 480, fillAngle: 0, outputFormat: 'gif'});
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0]!.path, ['fillSpeed']);
  assert.match(issues[0]!.message, /Speed too high for the dots: .* Use fillSpeed up to \d+ px\/s or increase fillScale\./);
});

// ── Scene details ───────────────────────────────────────────────────────────────────────────

test('Cena: o cabeçalho e a linha são fixos, só a borda, o brilho e o fundo andam', () => {
  const props = parse({});
  const a = getChatLayers(props, 0, 480);
  const b = getChatLayers(props, 211, 480);
  assert.deepEqual(a.header, b.header);
  assert.deepEqual(a.divider, b.divider);
  assert.notDeepEqual(a.stroke, b.stroke);
  assert.notDeepEqual(a.fill, b.fill);
  assert.equal(a.divider[0]!.colorCount, 3);
  // The comets run on the chat's track over the dimmer tube (trackOpacity).
  const outline = a.stroke.find((element) => element.type === 'outline');
  assert.ok(outline && outline.opacity === props.trackOpacity && outline.opacity < 1);
  assert.equal(a.stroke.filter((element) => element.type === 'comet').length, 3);
  assert.ok(perimeterLength(getChatLayout(props).track) > 0);
  // Without a header, no header elements at all.
  const bare = getChatLayers(parse({headerHeight: 0}), 0, 480);
  assert.equal(bare.header.length + bare.divider.length, 0);
  assert.equal(getChatLayers(parse({headerOpacity: 0}), 0, 480).header.length, 0);
});

test('Cena: o reflexo do vidro fica mais discreto que o padrão do motor, pelas mensagens', () => {
  const props = parse(PRESETS.vidro);
  for (const frame of [0, 100, 300]) {
    const sheen = getChatLayers(props, frame, 480).fill.find((element) => element.type === 'sheen');
    assert.ok(sheen && sheen.opacity <= 0.2);
  }
});

// ── Render ──────────────────────────────────────────────────────────────────────────────────

const render = (input: object, frame = 123) => {
  const props = parse(input);
  return renderToStaticMarkup(createElement(ChatFrame, {props, frame, durationInFrames: 480}));
};

test('Render: SVG do tamanho do arquivo, sem blend mode, alpha só nos formatos com alpha', () => {
  for (const input of [{}, ...Object.values(PRESETS), {headerHeight: 0}, {fill: 'listras', strokeMotion: 'formigas'}]) {
    const markup = render(input);
    assert.match(markup, /<svg width="464" height="664" viewBox="0 0 464 664"/);
    assert.match(markup, /<filter id="chat-stroke-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="464" height="664"/);
    assert.match(markup, /clip-path="url\(#chat-fill-clip\)"/);
    assert.doesNotMatch(markup, /mix-blend-mode|NaN|Infinity|undefined/);
    assert.doesNotMatch(markup, /data-guides/);
  }
  assert.match(render({}), /background-color:transparent/);
  assert.match(render({outputFormat: 'mp4'}), /background-color:#0B0620/);
  assert.match(render({}), /clip-path="url\(#chat-header-clip\)"/);
  assert.match(render({}), /<linearGradient id="chat-divider-0" gradientUnits="userSpaceOnUse"/);
  assert.doesNotMatch(render({headerHeight: 0}), /chat-header-clip|chat-divider/);
  for (const size of CHAT_SIZES) {
    const markup = render(sizeProps(size));
    assert.match(markup, new RegExp(`<svg width="${size.width + 2 * size.bleed}" height="${size.height + 2 * size.bleed}"`));
  }
  const guides = render({guides: true});
  assert.match(guides, /data-guides="true"/);
  assert.match(guides, /data-guides="header"/);
});

test('Cena: o contorno apagado sob formigas e cometas é a prop trackOpacity, como no bloco e na borda', () => {
  const outlines = (input: object) => getChatLayers(parse({strokeMotion: 'formigas', ...input}), 50, 480).stroke
    .filter((element) => element.type === 'outline');
  assert.deepEqual(outlines({}).map((element) => element.opacity), [0.45]);
  assert.deepEqual(outlines({trackOpacity: 0.5}).map((element) => element.opacity), [0.5]);
  assert.deepEqual(outlines({trackOpacity: 0}), []);
  // One family: the pastel chat and the pastel border both march their dashes over the same faint outline.
  const border = JSON.parse(readFileSync(new URL('../presets/borda-pastel.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  assert.equal(PRESETS.pastel.strokeMotion, border.strokeMotion);
  assert.equal(parse(PRESETS.pastel).trackOpacity, border.trackOpacity);
});

// ── Catalog, Root and presets ───────────────────────────────────────────────────────────────

test('Catálogo: entrada do chat, defaults do schema e o literal do Root', () => {
  assert.equal(chatCatalogEntry.id, 'ChatLoop');
  assert.equal(chatCatalogEntry.kind, 'chat');
  assert.equal(chatCatalogEntry.schema, chatLoopSchema);
  assert.deepEqual(chatCatalogEntry.defaultProps, chatLoopSchema.parse({}));
  assert.deepEqual(chatLoopSchema.parse(chatCatalogEntry.defaultProps), chatCatalogEntry.defaultProps);
  assert.deepEqual(ROOT_DEFAULT_PROPS, chatCatalogEntry.defaultProps);
  assert.equal(chatLoopSchema.strict().safeParse(ROOT_DEFAULT_PROPS).success, true);
  const layout = chatCatalogEntry.getLayout(chatCatalogEntry.defaultProps);
  assert.deepEqual(layout.canvas, {width: 464, height: 664});
  // The kind policy: transparent WebM at chat-padrao.
  assert.equal(chatCatalogEntry.defaultProps.transparent, true);
  assert.equal(chatCatalogEntry.defaultProps.outputFormat, 'webm');
});

test('Presets: cada tema passa no schema estrito, sem tamanho, e o padrão é o neon', () => {
  for (const theme of THEMES) {
    const preset = PRESETS[theme];
    assert.equal(chatLoopSchema.strict().safeParse(preset).success, true, theme);
    for (const key of ['width', 'height', 'bleed', 'guides']) assert.ok(!(key in preset), `${theme}: sem ${key}`);
  }
  const neon = parse(PRESETS.neon);
  const defaults = parse({});
  assert.deepEqual({...neon, seed: defaults.seed}, defaults);
  // One family: the kind's stroke weight (2–3 px) and the theme palettes.
  for (const theme of THEMES) {
    const props = parse(PRESETS[theme]);
    assert.ok(props.strokeWidth >= 2 && props.strokeWidth <= 3, theme);
  }
  assert.deepEqual(parse(PRESETS.halloween).strokeColors.slice(0, 2), ['#F97316', '#A855F7']);
  assert.deepEqual(parse(PRESETS.pastel).strokeColors, ['#F48FB8', '#6FCDB8', '#FFBA70']);
  assert.equal(parse(PRESETS.vidro).fill, 'vidro');
});
