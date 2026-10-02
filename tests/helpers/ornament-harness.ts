import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getWindowFlash} from '../../src/backgrounds/HauntedInteriorLoop';
import {borderLoopSchema, getBorderMask, getBorderScene} from '../../src/overlays/border';
import {
  FLASH_COLOR, MAX_CONTENT_OPACITY, ORNAMENT_CLEARANCE, ORNAMENT_EDGE, ORNAMENT_REGISTRY, ORNAMENT_SIZE_RANGE,
  meetsKeepOut, ornamentOutset, ornamentWayOut, rectDistance, roundRectPath, roundRectSdf,
  type OrnamentElement, type OrnamentFrame, type OrnamentPlacement, type OrnamentSetId,
} from '../../src/overlays/shared';
import {getSize, sizeProps, type NamedSize} from '../../src/sizes';
import {
  framesOf, kitProps, ORNAMENT_KIND_NAMES, ORNAMENT_KINDS, packItemProps, type OrnamentKindAdapter, type OrnamentKindName, type OrnamentProps,
} from './ornament-kinds';
import {
  assertDeterministic, assertPeriodic, assertSeamVelocity, assertValidElements, type Sampler, type Scene, type SceneInput,
} from './scene-scans';

/**
 * The ornament harness: a set on every kind and named size (plus border radii, small round screen
 * frames and the round blocks' accents), with a neutral base and with its kit's presets (also as
 * the pack renders them). One small test file per set calls registerOrnamentHarness, so the sets
 * run in parallel (`npx tsx --test tests/ornaments-harness-midnight.test.ts` runs one); test names
 * carry the set ([midnight]…) and the theme ([halloween-midnight]…).
 */

export const NEUTRAL = {ornamentSize: 48, lightning: 0.7, durationSeconds: 12, seed: 7};
/** The ornamentSize extremes the neutral base also runs every case at (the schema's range). */
const SIZE_EXTREMES = [ORNAMENT_SIZE_RANGE.min, ORNAMENT_SIZE_RANGE.max];

/**
 * An input to check; `mustFit`: the hero must fit (every named size with the kind's defaults, the
 * border radii 0/16/200 and the round blocks' accents do; a small round screen frame may refuse).
 */
type Case = {label: string; input: Record<string, unknown>; mustFit?: boolean};

/** Small round screen frames (a square screen with radius ≥ side/2): the outline is a circle, but the frame is still a screen. */
const ROUND_SCREENS: readonly Record<string, unknown>[] = [
  {width: 96, height: 96, bleed: 0, fit: 'screen', shape: 'rectangle', radius: 1920, thickness: 24, glow: 4, lines: 1, strokeWidth: 2, corners: 'none'},
  {width: 96, height: 96, bleed: 0, fit: 'screen', shape: 'rectangle', radius: 1920, thickness: 32, glow: 8, lines: 2, strokeWidth: 2, corners: 'none'},
];

/** Every named size, the border's radii 0/16/200 on each and small round screen frames, and the round blocks with each accent. */
const variants = (adapter: OrnamentKindAdapter): Case[] => {
  const cases: Case[] = adapter.sizes.map((size) => ({label: size.id, input: sizeProps(size), mustFit: true}));
  if (adapter.kind === 'border') {
    for (const size of adapter.sizes) {
      for (const radius of [0, 16, 200]) cases.push({label: `${size.id} radius ${radius}`, input: {...sizeProps(size), radius}, mustFit: true});
    }
    ROUND_SCREENS.forEach((input, index) => cases.push({label: `tela redonda ${index}`, input}));
  }
  if (adapter.kind === 'block') {
    for (const size of adapter.sizes.filter((entry) => entry.props?.shape === 'circle')) {
      for (const accent of ['left', 'top']) cases.push({label: `${size.id} accent ${accent}`, input: {...sizeProps(size), accent}, mustFit: true});
    }
  }
  return cases;
};

/**
 * The frames every layer check samples: the seam, fractions of the cycle that no harmonic count
 * lines up with (every count the SPEC prescribes is a multiple of 4, so N/4, N/2 and 3N/4 would
 * repeat frame 0), a half frame and −1. The element contract is also checked densely (denseCheck).
 */
const sampleFrames = (n: number) => [0, 1, 37, n * 0.137, n * 0.391, n * 0.618, n * 0.853, n - 1, 0.5, -1];

/** The documented refusal; its way out depends on the kind (and on a border's fit): see ornamentWayOut. */
export const REFUSAL = new RegExp(`^The "(midnight|haunted-mansion|haunted-interior|cobweb)" ornaments do not fit this size: (${[
  'increase bleed, padding or radius or use ornaments none.',
  'increase bleed or padding or use ornaments none.',
  'increase bleed, paddingX, paddingY or radius or use ornaments none.',
  'increase bleed, paddingX or paddingY or use ornaments none.',
  'increase bleed or radius or use ornaments none.',
  'increase bleed or use ornaments none.',
  'increase thickness, glow or radius or use ornaments none.',
  'increase thickness or glow or use ornaments none.',
].map((text) => text.replaceAll('.', '\\.')).join('|')})$`);

/** Placement bounds: inside the paint limit (edge), clear of the hole, and in front clear of the text. */
const checkPlacements = (id: string, frame: OrnamentFrame, placements: readonly OrnamentPlacement[]) => {
  for (const [index, placement] of placements.entries()) {
    const where = `${id} #${index} ${placement.motif}@${placement.slot}`;
    const {x, y, extent} = placement;
    assert.ok(extent > 0 && Number.isFinite(x) && Number.isFinite(y), `${where}: extent positivo`);
    assert.equal(extent * 2, Math.floor(extent * 2), `${where}: extent em passos de 0,5 px`);
    const limit = frame.paintLimit;
    assert.ok(x - extent >= limit.x + ORNAMENT_EDGE - 1e-6 && x + extent <= limit.x + limit.width - ORNAMENT_EDGE + 1e-6
      && y - extent >= limit.y + ORNAMENT_EDGE - 1e-6 && y + extent <= limit.y + limit.height - ORNAMENT_EDGE + 1e-6, `${where}: dentro do arquivo`);
    if (frame.hole) assert.ok(roundRectSdf(frame.hole, x, y) >= extent - 1e-6, `${where}: fora da janela`);
    // A screen frame has no back room: the rest of its box is the band's fillet, which the band fill covers.
    if (frame.fit === 'screen') assert.equal(placement.layer, 'front', `${where}: em tela só na frente`);
    if (placement.layer === 'front') {
      for (const area of frame.keepOut) assert.ok(rectDistance(area, x, y) >= extent + ORNAMENT_CLEARANCE - 1e-6, `${where}: longe do texto`);
    }
  }
};

/** One frame's ornament elements against the contract (types.ts). */
const checkElements = (
  id: string, set: OrnamentSetId, frame: OrnamentFrame, placements: readonly OrnamentPlacement[], elements: readonly OrnamentElement[],
) => {
  for (const element of elements) {
    const where = `${id} ${element.type}#${element.anchor}`;
    assert.ok(typeof element.type === 'string' && element.type.startsWith(`${set}-`), `${where}: tipo com o prefixo do conjunto`);
    const placement = placements[element.anchor];
    assert.ok(placement, `${where}: anchor aponta um lugar`);
    assert.equal(element.layer, placement.layer, `${where}: camada do lugar`);
    for (const [key, value] of Object.entries(element)) {
      assert.ok(typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)), `${where}.${key}: plano e finito`);
      if (key.startsWith('radius')) assert.ok((value as number) > 0, `${where}.${key} > 0`);
    }
    assert.ok(element.opacity >= 0 && element.opacity <= 1, `${where}: opacidade`);
    assert.ok(element.lightOpacity >= 0 && element.lightOpacity <= 1, `${where}: opacidade da luz`);
    assert.ok(element.reach >= 0 && element.light >= 0, `${where}: alcances`);
    const reach = Math.hypot(element.x - placement.x, element.y - placement.y) + Math.max(element.reach, element.light);
    assert.ok(reach <= placement.extent + 1e-6, `${where}: cabe no lugar (${reach} > ${placement.extent})`);
    // In front only: the back layer is clipped to outside the cover, which holds every text area.
    // Unreachable today (checkPlacements keeps a front circle extent + 1 px from the text, and the
    // light stays inside the extent), kept as a guard should either rule loosen.
    if (element.layer === 'front' && element.light > 0 && meetsKeepOut(frame, element.x, element.y, element.light)) {
      assert.ok(element.lightOpacity <= MAX_CONTENT_OPACITY + 1e-9, `${where}: luz sobre o texto no máximo ${MAX_CONTENT_OPACITY}`);
    }
    if (frame.glow === 0) assert.equal(element.light, 0, `${where}: sem brilho (painel da Twitch), sem luz`);
  }
};

/**
 * Everything the harness checks on one input: the parse (or the documented refusal), the
 * placements (seed-invariant, bounded, the outset), and the elements and the flash at every sample
 * frame. Returns whether the input was accepted.
 */
const checkCase = (
  adapter: OrnamentKindAdapter, set: OrnamentSetId, id: string, input: Record<string, unknown>, {mustFit = false, dense = true} = {},
) => {
  const issues = adapter.issues(input);
  if (issues.length > 0) {
    assert.ok(!mustFit, `${id}: recusado (${issues.map((issue) => issue.message).join(' | ')})`);
    for (const issue of issues) {
      assert.deepEqual(issue.path, ['ornaments'], `${id}: só a recusa documentada (${issue.message})`);
      assert.match(issue.message, REFUSAL, id);
    }
    const layout = adapter.ornamentLayout({...adapter.parse({...input, ornaments: 'none'}), ornaments: set});
    assert.equal(layout.placements.length, 0, `${id}: recusado só quando nada cabe`);
    // The way out named is the one of this kind and fit (a border has no padding; screen, no bleed).
    for (const issue of issues) assert.equal(issue.message, `The "${set}" ornaments do not fit this size: ${ornamentWayOut(layout.frame)}`, id);
    return false;
  }
  const props = adapter.parse(input);
  assert.equal(props.ornaments, set, id);
  // A scaled layout (ornamentScale) is in the set's own space: frame and placements shrunk by 1/scale.
  const layout = adapter.ornamentLayout(props);
  const {frame, placements} = layout;
  assert.ok(placements.length >= 1, `${id}: o motivo principal cabe`);
  const ornamentSet = ORNAMENT_REGISTRY[set];
  // Below the default ornamentSize the hero may ask for less than its minimum (fitMotif's hero
  // rule places it at its nominal), but never under a quarter of the ornamentSize.
  const least = props.ornamentSize >= NEUTRAL.ornamentSize ? ornamentSet.minExtent : Math.min(ornamentSet.minExtent, props.ornamentSize / 4);
  assert.ok(placements[0]!.extent >= least - 1e-9, `${id}: o principal não fica abaixo do mínimo do conjunto (${placements[0]!.extent} < ${least})`);
  // place() itself is deterministic: called afresh (bypassing the registry's memo, which would hand
  // back the same frozen array) it lays out the same, as a separate render worker would.
  const fresh = () => ornamentSet.place(frame, {ornamentSize: props.ornamentSize});
  assert.deepEqual(fresh(), placements, `${id}: place() determinístico`);
  assert.deepEqual(fresh(), placements, `${id}: place() determinístico`);
  // A border's back layer tucks under the band: its cover is the whole outer edge (window and screen).
  if (adapter.kind === 'border') assert.deepEqual(frame.cover, {path: roundRectPath(frame.outline), fillRule: 'nonzero'}, `${id}: a faixa esconde os de trás`);
  // Seed- and frame-free: another seed lays out exactly the same.
  assert.deepEqual(adapter.ornamentLayout(adapter.parse({...input, seed: 999})), layout, `${id}: a seed não move os enfeites`);
  assert.deepEqual(adapter.ornamentLayout(adapter.parse({...input, seed: 1})), layout, `${id}: a seed não move os enfeites`);
  checkPlacements(id, frame, placements);
  const outset = adapter.outset(props);
  assert.ok(ornamentOutset(frame, placements) <= outset + 1e-9, `${id}: o outset inclui os enfeites`);
  assert.ok(outset <= props.bleed + 1e-9, `${id}: tudo cabe no bleed`);

  const n = framesOf(props);
  let count: number | null = null;
  for (const at of sampleFrames(n)) {
    const {back, front, flash} = adapter.layers(props, at, n);
    const elements = [...back, ...front];
    count ??= elements.length;
    assert.equal(elements.length, count, `${id} frame ${at}: quantidade constante`);
    assert.ok(back.every((element) => element.layer === 'back') && front.every((element) => element.layer === 'front'), `${id}: camadas`);
    checkElements(`${id} frame ${at}`, set, frame, placements, elements);
    if (props.lightning > 0) {
      const [left, right] = getWindowFlash(props, at, n);
      assert.deepEqual(flash, [{type: 'flash', left, right, color: FLASH_COLOR, opacity: props.lightning}], `${id} frame ${at}: um clarão`);
    } else {
      assert.deepEqual(flash, [], `${id}: sem relâmpago, sem clarão`);
    }
  }
  assert.ok(count! >= placements.length, `${id}: ao menos um elemento por lugar`);
  // The contract holds in EVERY frame, not only at the samples: each integer frame and the half
  // frame past it, straight from the set (cheap: no kind layers). And no jump inside the loop
  // either (SPEC §2: no fract()/wrapped phase and no pixel snapping in a field): a smooth field's
  // half frame sits near the mean of its neighbours, while a jump J lands about J/2 away.
  if (dense) {
    let previous: readonly OrnamentElement[] | undefined;
    let middle: readonly OrnamentElement[] | undefined;
    for (let at = 0; at <= n; at++) {
      const elements = ornamentSet.build(frame, placements, props, at, n);
      if (previous && middle) {
        previous.forEach((element, index) => {
          for (const [key, value] of Object.entries(element)) {
            // The lightning's envelopes rise within 40 ms: a strike is a jump by design.
            if (typeof value !== 'number' || key === 'flash' || key === 'cold') continue;
            const half = middle![index]![key] as number;
            const next = elements[index]![key] as number;
            // The message is built only on failure: an eager template string cost +45 % on this file.
            if (Math.abs(half - (value + next) / 2) > 0.02 + 0.25 * Math.abs(next - value)) assert.fail(`${id} ${element.type}.${key}: salto entre ${at - 1} e ${at}`);
          }
        });
      }
      if (at === n) break; // frame N is frame 0: only its continuity with N−1 is checked
      middle = ornamentSet.build(frame, placements, props, at + 0.5, n);
      for (const [f, built] of [[at, elements], [at + 0.5, middle]] as const) {
        assert.equal(built.length, count, `${id} frame ${f}: quantidade constante`);
        checkElements(`${id} frame ${f}`, set, frame, placements, built);
      }
      previous = elements;
    }
  }
  if (props.lightning > 0) assert.deepEqual(adapter.layers({...props, lightning: 0}, 37, n).flash, [], `${id}: lightning 0 não desenha clarão`);
  return true;
};

/** The size the generic scans and the markup use besides the kind's default: a round one where the kind has it. */
export const roundSize = (adapter: OrnamentKindAdapter): NamedSize =>
  adapter.kind === 'block' ? getSize('circle') : adapter.kind === 'border' ? getSize('webcam-round') : getSize('chat-vertical');

const closingOf = (markup: string, start: number) => {
  const tags = /<g[\s>]|<\/g>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(markup); match; match = tags.exec(markup)) {
    depth += match[0] === '</g>' ? -1 : 1;
    if (depth === 0) return match.index + 4;
  }
  throw new Error('grupo sem fechamento');
};

/** Where each ornament and flash group starts and ends in the markup. */
const groupsOf = (markup: string) => {
  const groups: {name: string; start: number; end: number}[] = [];
  for (const match of markup.matchAll(/<g data-(ornaments="back"|ornaments="front"|flash="true")>/g)) {
    groups.push({name: match[1]!, start: match.index, end: closingOf(markup, match.index)});
  }
  return groups;
};

/** Markup rules: clean numbers, no filters or blend modes in the ornament groups, unique ids, order, and border inside FrameGroup. */
const checkMarkup = (id: string, adapter: OrnamentKindAdapter, props: OrnamentProps, markup: string) => {
  assert.doesNotMatch(markup, /NaN|Infinity|undefined|mix-blend-mode/, id);
  const groups = groupsOf(markup);
  // The ornament and flash ids are unique in the whole file (the kinds' own layers may repeat
  // theirs: a StrokeLayer draws its children twice, once under the glow filter).
  const idsIn = (text: string) => [...text.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]!);
  const all = idsIn(markup);
  for (const group of groups) {
    const body = markup.slice(group.start, group.end);
    assert.doesNotMatch(body, /filter[=:]|<filter\b|mix-blend-mode/, `${id}: ${group.name} sem filtro`);
    // Every def is the layer's own: `<kind>-ornament-<layer>-…` (ornamentPartId) or `<kind>-flash-…`.
    const own = group.name === 'flash="true"' ? `${adapter.kind}-flash-` : `${adapter.kind}-ornament-${group.name.includes('back') ? 'back' : 'front'}-`;
    for (const def of idsIn(body)) {
      assert.equal(all.filter((other) => other === def).length, 1, `${id}: id único ${def}`);
      assert.ok(def.startsWith(own), `${id}: id ${def} fora do prefixo ${own}`);
    }
  }
  const find = (name: string) => groups.find((group) => group.name === name);
  const back = find('ornaments="back"');
  const front = find('ornaments="front"');
  const flash = find('flash="true"');
  const {back: backElements, front: frontElements, flash: flashElements} = adapter.layers(props, 0, 480);
  assert.equal(!!back, backElements.length > 0, `${id}: grupo de trás só com elementos`);
  assert.equal(!!front, frontElements.length > 0, `${id}: grupo da frente só com elementos`);
  assert.equal(!!flash, flashElements.length > 0, `${id}: clarão só com relâmpago`);
  const prefix = adapter.kind;
  const fill = markup.indexOf(adapter.kind === 'border' ? `id="${prefix}-band-clip"` : `id="${prefix}-fill-clip"`);
  const stroke = markup.indexOf(`id="${prefix}-stroke-glow"`);
  if (back) {
    assert.ok(back.end <= fill, `${id}: os enfeites de trás vêm antes do preenchimento`);
    const {frame} = adapter.ornamentLayout(props);
    assert.ok(markup.slice(back.start, back.end).includes(`${roundRectPath({...frame.paintLimit, radius: 0})}${frame.cover.path}" clip-rule="evenodd"`),
      `${id}: recortados fora do painel`);
    const halo = markup.indexOf(`id="${prefix}-halo-blur"`);
    if (halo >= 0) assert.ok(halo < back.start, `${id}: depois do halo`);
  }
  if (front && stroke >= 0) assert.ok(front.start > stroke, `${id}: os da frente vêm depois do contorno`);
  if (flash && front) assert.ok(flash.start >= front.end, `${id}: o clarão por cima de tudo`);
  if (adapter.kind === 'border') {
    const masked = markup.indexOf('<g mask="url(#border-frame-hole)">');
    assert.ok(masked > 0, id);
    const end = closingOf(markup, masked);
    for (const group of groups) assert.ok(group.start > masked && group.end <= end, `${id}: ${group.name} dentro da moldura mascarada`);
    // The band's clip keeps the matte (or the fill) as its first child: no ornament inside it.
    const bandClip = markup.indexOf('clip-path="url(#border-band-clip)"');
    if (bandClip >= 0) {
      const bandGroup = markup.lastIndexOf('<g', bandClip);
      const bandEnd = closingOf(markup, bandGroup);
      for (const group of groups) assert.ok(group.end <= bandGroup || group.start >= bandEnd, `${id}: ${group.name} fora do recorte da faixa`);
    }
  }
};

/** docs/overlays.md: the wash peaks at 0.16 × lightning on a panel and 0.35 × lightning on a border's band; the edge at 0.6. Hard-coded on purpose. */
const FLASH_PEAKS = {panel: 0.16, band: 0.35, edge: 0.6};

/**
 * The flash's rendered alpha at the cycle's first strong strike: the wash's two stops are the
 * peak × the windows' levels, the edge's the edge peak × them (none without a stroke), the group's
 * opacity is lightning, and over a panel's text the wash never passes MAX_CONTENT_OPACITY.
 */
export const checkFlashAlpha = (id: string, adapter: OrnamentKindAdapter, props: OrnamentProps) => {
  const n = framesOf(props);
  const at = Array.from({length: n}, (_, frame) => frame).find((frame) => Math.max(...getWindowFlash(props, frame, n)) > 0.5);
  assert.ok(at !== undefined, `${id}: há um clarão forte no ciclo`);
  const [flash] = adapter.layers(props, at, n).flash;
  assert.ok(flash, `${id}: clarão no frame ${at}`);
  const markup = adapter.render(props, at, n);
  const stops = (part: string) => [...(new RegExp(`id="${adapter.kind}-flash-0-${part}"[^]*?</linearGradient>`).exec(markup)?.[0] ?? '')
    .matchAll(/stop-opacity="([^"]+)"/g)].map((match) => Number(match[1]));
  const peak = adapter.kind === 'border' ? FLASH_PEAKS.band : FLASH_PEAKS.panel;
  assert.ok(markup.includes(`<g data-flash="true"><g opacity="${props.lightning}">`), `${id}: opacidade = lightning`);
  const wash = stops('wash');
  assert.equal(wash.length, 2, `${id}: véu com duas paradas`);
  wash.forEach((value, index) => assert.ok(Math.abs(value - peak * (index ? flash.right : flash.left)) < 1e-9, `${id}: véu ${value}`));
  const edge = stops('edge');
  assert.equal(edge.length, (props.strokeWidth as number) > 0 ? 2 : 0, `${id}: fio do contorno`);
  edge.forEach((value, index) => assert.ok(Math.abs(value - FLASH_PEAKS.edge * (index ? flash.right : flash.left)) < 1e-9, `${id}: fio ${value}`));
  if (adapter.kind !== 'border') {
    assert.ok(props.lightning * Math.max(...wash) <= MAX_CONTENT_OPACITY + 1e-9, `${id}: clarão sobre o texto no máximo ${MAX_CONTENT_OPACITY}`);
  }
};

const scanSampler = (adapter: OrnamentKindAdapter, base: Record<string, unknown>): Sampler =>
  (input: SceneInput, at: number, length: number) => adapter.scene(adapter.parse({...base, ...input}), at, length);

/** The ornament and flash elements alone (cheap enough for every named size). */
const ornamentSampler = (adapter: OrnamentKindAdapter, base: Record<string, unknown>): Sampler =>
  (input: SceneInput, at: number, length: number) => {
    const {back, front, flash} = adapter.layers(adapter.parse({...base, ...input}), at, length);
    return [...back, ...front, ...flash] as unknown as Scene;
  };

/**
 * Registers the harness's tests for one set on `kinds` (all three by default): the neutral base on
 * every size and variant, the generic scans, the markup and the flash, the border's mask, and the
 * kit's presets (`halloween-<set>`).
 */
export const registerOrnamentHarness = (set: OrnamentSetId, {kinds = ORNAMENT_KIND_NAMES}: {kinds?: readonly OrnamentKindName[]} = {}) => {
  if (kinds.includes('chat')) {
    test(`ornaments [${set}]: o mínimo do principal cabe em todo tamanho nomeado (≤ 12 px)`, () => {
      assert.ok(ORNAMENT_REGISTRY[set].minExtent > 0 && ORNAMENT_REGISTRY[set].minExtent <= 12, `${set}: minExtent ${ORNAMENT_REGISTRY[set].minExtent}`);
    });
  }

  for (const kindName of kinds) {
    const adapter = ORNAMENT_KINDS[kindName];
    test(`ornaments [${set}] ${kindName}: cada tamanho aceita (a tela redonda pequena pode recusar com a saída), lugares fixos e dentro dos limites, elementos e clarão válidos`, () => {
      for (const ornamentSize of [NEUTRAL.ornamentSize, ...SIZE_EXTREMES]) {
        for (const {label, input, mustFit} of variants(adapter)) {
          checkCase(adapter, set, `[${set}] ${kindName} ${label} ornamentSize ${ornamentSize}`, {...NEUTRAL, ornaments: set, ornamentSize, ...input}, {mustFit});
        }
      }
    });

    test(`ornaments [${set}] ${kindName}: em todo tamanho nomeado, enfeites e clarão periódicos, sem salto na emenda, markup limpo`, () => {
      for (const size of adapter.sizes) {
        const base = {...NEUTRAL, ornaments: set, ...sizeProps(size)};
        const id = `[${set}] ${kindName} ${size.id}`;
        const sample = ornamentSampler(adapter, base);
        assertPeriodic(id, sample, {moving: false});
        assertSeamVelocity(id, sample);
        assertValidElements(id, sample);
        const props = adapter.parse(base);
        checkMarkup(`${id} frame 0`, adapter, props, adapter.render(props, 0));
      }
    });

    test(`ornaments [${set}] ${kindName}: varreduras genéricas no tamanho padrão e num redondo`, () => {
      for (const input of [{}, sizeProps(roundSize(adapter))]) {
        const base = {...NEUTRAL, ornaments: set, ...input};
        const id = `[${set}] ${kindName} ${JSON.stringify(input)}`;
        const sample = scanSampler(adapter, base);
        assertDeterministic(id, sample);
        assertPeriodic(id, sample);
        assertSeamVelocity(id, sample);
        assertValidElements(id, sample);
        // One and two colours ([1] and [2] fall back to [0]) and an opaque export: the same
        // contract, and nothing undefined reaches the markup (React would drop `fill={undefined}`
        // silently, so the elements' own fields are checked too: every one a string or a number).
        for (const style of [
          {ornamentColors: ['#445566']}, {ornamentColors: ['#445566', '#DDEEFF']}, {transparent: false, outputFormat: 'mp4'},
        ]) {
          const styled = {...base, ...style};
          const styledId = `${id} ${JSON.stringify(style)}`;
          checkCase(adapter, set, styledId, styled, {mustFit: true});
          const props = adapter.parse(styled);
          for (const at of [0, 123]) checkMarkup(`${styledId} frame ${at}`, adapter, props, adapter.render(props, at));
        }
      }
    });

    test(`ornaments [${set}] ${kindName}: markup limpo, na ordem das camadas${kindName === 'border' ? ', tudo dentro da moldura' : ''}`, () => {
      for (const input of [{}, sizeProps(roundSize(adapter)), ...(kindName === 'border' ? [sizeProps(getSize('fullscreen'))] : [])]) {
        for (const lightning of [0, 0.7]) {
          const props = adapter.parse({...NEUTRAL, ornaments: set, ...input, lightning});
          for (const at of [0, 123]) checkMarkup(`[${set}] ${kindName} ${JSON.stringify(input)} lightning ${lightning} frame ${at}`, adapter, props, adapter.render(props, at));
          if (lightning > 0) checkFlashAlpha(`[${set}] ${kindName} ${JSON.stringify(input)}`, adapter, props);
        }
      }
      // No stroke, no cold edge: the wash alone.
      checkFlashAlpha(`[${set}] ${kindName} strokeWidth 0`, adapter, adapter.parse({...NEUTRAL, ornaments: set, strokeWidth: 0}));
    });
  }

  if (kinds.includes('border')) test(`ornaments [${set}] border: a máscara não muda com enfeites nem relâmpago`, () => {
    const adapter = ORNAMENT_KINDS.border;
    for (const size of adapter.sizes.filter((entry) => entry.props?.fit !== 'screen')) {
      const mask = getBorderMask(borderLoopSchema.parse({...sizeProps(size), ornaments: set, lightning: 0.7}));
      assert.ok(mask, size.id);
      assert.ok(!('ornaments' in mask) && !('lightning' in mask), `${size.id}: a máscara não leva enfeites`);
      const plain = borderLoopSchema.parse(mask);
      const decorated = borderLoopSchema.parse({...mask, ornaments: set, lightning: 0.7});
      assert.deepEqual(getBorderScene(decorated, 0, 480), getBorderScene(plain, 0, 480), size.id);
      assert.equal(adapter.render(decorated as OrnamentProps, 0), adapter.render(plain as OrnamentProps, 0), size.id);
    }
  });

  // Kit presets: the theme `halloween-<set>`.
  const theme = `halloween-${set}`;
  for (const kindName of kinds) {
    const adapter = ORNAMENT_KINDS[kindName];
    test(`ornaments kit [${theme}] [${set}] ${kindName}: o preset põe o motivo principal em todo tamanho, com os mesmos limites`, () => {
      const preset = adapter.preset(theme);
      const props = adapter.parse(preset);
      assert.equal(props.ornaments, set, `${theme}: ornaments ${set}`);
      if (kindName === 'border') assert.equal((props as Record<string, unknown>).corners, 'none', `${theme}: com enfeites, corners none`);
      for (const size of adapter.sizes) {
        checkCase(adapter, set, `[${theme}] ${kindName} ${size.id}`, {...preset, ...sizeProps(size)}, {mustFit: true});
        // And as the pack renders it, where its item adds props (the screens' band, the Twitch panel's padding).
        if (Object.keys(packItemProps(theme, size.id)).length > 0) {
          checkCase(adapter, set, `[${theme}] ${kindName} ${size.id} pack`, kitProps(theme, size), {mustFit: true});
        }
      }
    });

    test(`ornaments kit [${theme}] [${set}] ${kindName}: varreduras genéricas e markup do preset`, () => {
      const preset = adapter.preset(theme);
      for (const input of [{}, sizeProps(roundSize(adapter))]) {
        const base = {...preset, ...input};
        const id = `[${theme}] ${kindName} ${JSON.stringify(input)}`;
        const sample = scanSampler(adapter, base);
        assertDeterministic(id, sample);
        assertPeriodic(id, sample);
        assertSeamVelocity(id, sample);
        assertValidElements(id, sample);
        const props = adapter.parse(base);
        for (const at of [0, 123]) checkMarkup(`${id} frame ${at}`, adapter, props, adapter.render(props, at));
        if (props.lightning > 0) checkFlashAlpha(id, adapter, props);
      }
    });
  }
};
