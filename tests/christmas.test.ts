import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createElement, isValidElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {resolveExport} from '../scripts/export';
import {
  BOKEH_STOPS, BOKEH_TOP_CORNER, ChristmasPicture, christmasLoopSchema, getChristmasScene, HALO, LIGHT_RADII, reachOf, type Box,
  type ChristmasElement, type ChristmasLoopProps,
} from '../src/backgrounds/ChristmasLoop';
import {
  AMBER, CREAM, KNOT, LOOP_LEFT, mix, paletteOf, ribbonWidthOf, SILVER, TAIL_BACK, TAIL_FRONT, TIE_REACH,
} from '../src/backgrounds/christmas/ChristmasArtwork';
import {GARLAND, GARLAND_CENTRE, LIGHT_SLOTS, RIBBON, swagPoint} from '../src/backgrounds/christmas/garland';
import {
  BAUBLES, BOW, BOW_BOX, CLUSTERS, clusterPoint, CONTENT_BOX, CORNER_LIGHTS, insideContent, rotateAbout,
} from '../src/backgrounds/christmas/layout';
import {PINE_LOWER, PINE_UPPER, spinePoint, UPPER_SPINES, type Point} from '../src/backgrounds/christmas/pine';
import {backgroundCatalog} from '../src/catalog';
import {RemotionRoot} from '../src/Root';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';
import {findComposition} from './helpers/find-composition';

type Scene = ChristmasElement[];
const N = 1200;
const FRAMES = [0, 1, 300, 599, 900, 1199];
const KINDS = ['warmth', 'bokeh', 'snow', 'light', 'bauble', 'bow', 'branch', 'sparkle'] as const;
const DEFAULTS = {
  durationSeconds: 20, seed: 1225, transparent: false, backgroundColor: '#0A1712',
  colors: ['#1E5A43', '#8E1F35', '#D8B25A'], outputFormat: 'webm',
  baubleCount: 10, snowCount: 90, bokehCount: 14, sparkleCount: 24,
  sway: 0.6, lightGlow: 0.75, twinkle: 0.5, centerCalm: 0.7,
} as const;
/** Every control at its maximum. */
const MAX = {baubleCount: 10, snowCount: 240, bokehCount: 48, sparkleCount: 60, sway: 1, lightGlow: 1, twinkle: 1, centerCalm: 1} as const;
const CONTROLS = {baubleCount: 0, snowCount: 0, bokehCount: 0, sparkleCount: 0} as const;

const pick = (scene: Scene, kind: ChristmasElement['kind']) => scene.filter((element) => element.kind === kind);
const sceneOf = (input: Partial<ChristmasLoopProps>, frame: number, length = N) =>
  getChristmasScene(christmasLoopSchema.parse(input), frame, length);
const countsOf = (scene: Scene) => Object.fromEntries(KINDS.map((kind) => [kind, pick(scene, kind).length]));

/** Visits every consecutive frame pair of a whole cycle, including the seam (last → first). */
const eachStep = (input: Partial<ChristmasLoopProps>, length: number, visit: (before: Scene, after: Scene, frame: number) => void) => {
  const props = christmasLoopSchema.parse(input);
  const first = getChristmasScene(props, 0, length);
  let before = first;
  for (let frame = 0; frame < length; frame++) {
    const after = frame === length - 1 ? first : getChristmasScene(props, frame + 1, length);
    visit(before, after, frame);
    before = after;
  }
};

const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const isZero = (value: number) => Math.abs(value) === 0;

const markupOf = (input: Partial<ChristmasLoopProps>, frame = 240) => {
  const props = christmasLoopSchema.parse(input);
  return renderToStaticMarkup(createElement(ChristmasPicture, {props, scene: getChristmasScene(props, frame, N)}));
};
/** One gradient of the picture's defs, from its opening tag to its closing tag. */
const gradientOf = (markup: string, id: string) => {
  const found = new RegExp(`<(radial|linear)Gradient id="${id}"[^>]*>.*?</\\1Gradient>`).exec(markup);
  assert.ok(found, `the picture has no gradient ${id}`);
  return found[0];
};
const stopOpacities = (gradient: string) => [...gradient.matchAll(/stop-opacity="([^"]+)"/g)].map((found) => Number(found[1]));

/**
 * How often a looping per-frame series turns around over the cycle, the seam included (last frame
 * back to the first). Steps below 1e-12 are rounding, not motion, and are skipped.
 */
const directionChanges = (series: readonly number[]) => {
  const signs = series
    .map((value, i) => series[(i + 1) % series.length]! - value)
    .filter((step) => Math.abs(step) > 1e-12)
    .map(Math.sign);
  return signs.filter((sign, i) => sign !== signs[(i + 1) % signs.length]).length;
};

test('Christmas: Studio, catalog, schema and preset open the same 20-second garland', () => {
  const defaults = christmasLoopSchema.parse({});
  assert.deepEqual(defaults, DEFAULTS);
  const metadata = getCompositionMetadata(defaults);
  assert.deepEqual(metadata, {width: 1920, height: 1080, fps: 60, durationInFrames: 1200});
  assert.deepEqual(backgroundCatalog.ChristmasLoop.defaultProps, defaults);
  const preset: unknown = JSON.parse(readFileSync(new URL('../presets/christmas-gilded-garland.json', import.meta.url), 'utf8'));
  assert.deepEqual(christmasLoopSchema.strict().parse(preset), defaults);

  type CompositionProps = typeof metadata & {
    id: string;
    defaultProps: typeof defaults;
    schema: typeof christmasLoopSchema;
    calculateMetadata: (options: {props: typeof defaults}) => typeof metadata & {props: typeof defaults};
  };
  const composition = findComposition<CompositionProps>(RemotionRoot(), 'ChristmasLoop');
  assert.ok(isValidElement<CompositionProps>(composition), 'the composition must be registered in Studio');
  assert.equal(composition.props.schema, christmasLoopSchema);
  assert.deepEqual(composition.props.defaultProps, defaults);
  for (const key of ['width', 'height', 'fps', 'durationInFrames'] as const) {
    assert.equal(composition.props[key], metadata[key]);
  }
  const custom = christmasLoopSchema.parse({durationSeconds: 3.7, outputFormat: 'gif'});
  const calculated = composition.props.calculateMetadata({props: custom});
  assert.deepEqual(calculated.props, custom);
  assert.equal(calculated.durationInFrames, 185);
  assert.equal(calculated.fps, 50);
});

test('Christmas: controls reject invalid values and accept their limits', () => {
  for (const input of [
    {baubleCount: -1}, {baubleCount: 11}, {baubleCount: 2.5}, {baubleCount: '4'},
    {snowCount: -1}, {snowCount: 241}, {snowCount: 1.5},
    {bokehCount: -1}, {bokehCount: 49}, {bokehCount: 1.5},
    {sparkleCount: -1}, {sparkleCount: 61}, {sparkleCount: 0.5},
    {sway: -0.01}, {sway: 1.01}, {sway: Number.NaN},
    {lightGlow: -0.01}, {lightGlow: 1.01}, {lightGlow: Number.POSITIVE_INFINITY},
    {twinkle: -0.01}, {twinkle: 1.01}, {twinkle: Number.NaN},
    {centerCalm: -0.01}, {centerCalm: 1.01}, {centerCalm: Number.NEGATIVE_INFINITY},
  ]) {
    assert.equal(christmasLoopSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [
    {baubleCount: 0, snowCount: 0, bokehCount: 0, sparkleCount: 0, sway: 0, lightGlow: 0, twinkle: 0, centerCalm: 0},
    MAX,
  ]) {
    assert.equal(christmasLoopSchema.strict().safeParse(input).success, true, JSON.stringify(input));
  }
});

test('Christmas: the scene keeps its counts and valid values through the cycle', () => {
  for (const input of [CONTROLS, {}, MAX]) {
    const props = christmasLoopSchema.parse(input);
    for (const frame of FRAMES) {
      const scene = getChristmasScene(props, frame, N);
      assert.deepEqual(countsOf(scene), {
        warmth: 3, bokeh: props.bokehCount, snow: props.snowCount, light: 26, bauble: props.baubleCount, bow: 1, branch: 4,
        sparkle: props.sparkleCount,
      });
      assert.equal(scene.length, 34 + props.bokehCount + props.snowCount + props.baubleCount + props.sparkleCount);
      for (const element of scene) {
        for (const [key, value] of Object.entries(element)) {
          if (key !== 'kind') assert.ok(typeof value === 'number' && Number.isFinite(value), `${element.kind}.${key}`);
        }
        assert.ok(element.opacity >= 0 && element.opacity <= 1, `${element.kind}: opacity ${element.opacity}`);
        assert.ok(element.glow >= 0 && element.glow <= 1, `${element.kind}: glow ${element.glow}`);
        assert.ok(element.radius > 0, `${element.kind}: radius`);
        assert.ok(element.twist >= -1 && element.twist <= 1, `${element.kind}: twist`);
      }
    }
  }
});

test('Christmas: nothing but far snow enters the content area', () => {
  let farSnowInside = 0;
  // Forty consecutive seeds: a margin dropped from the bokeh or sparkle bands leaks in only for some seeds.
  for (const seed of [...Array.from({length: 40}, (_, i) => i - 7), 1225, 2026]) {
    for (let step = 0; step < 60; step++) {
      for (const element of sceneOf({...MAX, seed}, step * 20)) {
        const box = reachOf(element);
        if (box) {
          assert.ok(!overlaps(box, CONTENT_BOX), `seed ${seed} frame ${step * 20}: ${element.kind} reaches ${JSON.stringify(box)}`);
        } else if (element.kind === 'snow') {
          assert.equal(element.variant, 0);
          if (overlaps({left: element.x, top: element.y, right: element.x, bottom: element.y}, CONTENT_BOX)) farSnowInside++;
        } else {
          assert.ok(element.kind === 'warmth' || element.kind === 'branch', element.kind);
        }
      }
    }
  }
  assert.ok(farSnowInside > 0, 'the far snow does cross the content area');
});

test('Christmas: the bokeh glows only where a light justifies it', () => {
  for (const seed of [...Array.from({length: 20}, (_, i) => i - 3), 1225]) {
    for (const frame of [0, 150, 300, 600, 900]) {
      pick(sceneOf({...MAX, seed}, frame), 'bokeh').forEach((orb, i) => {
        const slot = i % 8;
        const label = `seed ${seed} frame ${frame}: orb ${i} at ${orb.x.toFixed(0)} ${orb.y.toFixed(0)}`;
        // The back orbs are amber or amber gold; only the faint ones in front of the pine are gold.
        assert.equal(orb.variant, slot === 3 || slot === 7 ? 1 : 0, label);
        assert.ok(orb.variant === 1 ? orb.tone === 2 : orb.tone < 2, label);
        // The drift reaches at most 16 px up or down.
        if (slot === 0 || slot === 1) {
          // The top corners glow behind the boughs, above the bough baubles.
          assert.ok(orb.y <= BOKEH_TOP_CORNER + 16, label);
        } else if (slot === 4 || slot === 5) {
          // The lower corners; the side columns stay dark along their bare middle.
          assert.ok(orb.y >= 780 - 16, label);
        } else if (slot === 6) {
          // The top band glows by the garland lights, clear of the bow.
          assert.ok(orb.x + orb.radius <= BOW_BOX.left || orb.x - orb.radius >= BOW_BOX.right, label);
        } else if (slot === 2) {
          // The bottom band glows near the corner warmth and leaves the ends of a lower third open.
          assert.ok(orb.x <= 560 + 22 || orb.x >= 1360 - 22, label);
          assert.ok(orb.radius <= 1.05 * 36, label);
        }
      });
    }
  }
});

test('Christmas: no back bokeh orb sits behind a bough bauble', () => {
  // Each bough bauble's body over its whole swing: the ribbon leans up to 1.2·A at sway 1 and the
  // bough bends up to its amplitude. The body grows by 10 px, and a drop reaches 1.45 r.
  const bodies = BAUBLES.filter((spec) => spec.cluster !== null).flatMap((spec) => {
    const cluster = CLUSTERS[spec.cluster!]!;
    const reach = spec.L + spec.cap + spec.r;
    const radius = (spec.style === 3 ? 1.45 : 1) * spec.r + 10;
    return [-1, 0, 1].flatMap((bend) => {
      const [px, py] = rotateAbout(spec.pivot, cluster.root, bend * cluster.amplitude);
      return Array.from({length: 25}, (_, k) => {
        const angle = ((k / 12 - 1) * 1.2 * spec.amplitude * Math.PI) / 180;
        return {id: spec.id, x: px + reach * Math.sin(angle), y: py + reach * Math.cos(angle), radius};
      });
    });
  });
  assert.equal(bodies.length, 6 * 3 * 25);
  let checked = 0;
  for (let seed = 0; seed <= 50; seed++) {
    for (let frame = 0; frame < N; frame += 40) {
      for (const orb of pick(sceneOf({...MAX, seed}, frame), 'bokeh')) {
        if (orb.variant !== 0) continue;
        checked++;
        for (const body of bodies) {
          const gap = Math.hypot(orb.x - body.x, orb.y - body.y) - orb.radius - body.radius;
          assert.ok(gap >= 0, `seed ${seed} frame ${frame}: the orb at ${orb.x.toFixed(0)} ${orb.y.toFixed(0)} sits behind ${body.id}`);
        }
      }
    }
  }
  assert.ok(checked > 1000);
});

/** A mixed or hex color as [r, g, b]. */
const rgbOf = (color: string): [number, number, number] => {
  if (color.startsWith('#')) return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
  const [r, g, b] = color.match(/[\d.]+/g)!.map(Number);
  return [r!, g!, b!];
};

test('Christmas: the bokeh is soft warm light, not grey bubbles', () => {
  // A warm core that fades out, with no brighter rim; the fade from half strength to nothing spans
  // the outer quarter of the radius, not a thin edge.
  const opacities = BOKEH_STOPS.map(([, opacity]) => opacity);
  assert.deepEqual([BOKEH_STOPS[0], BOKEH_STOPS.at(-1)], [[0, 1], [1, 0]]);
  opacities.slice(1).forEach((opacity, i) => assert.ok(opacity <= opacities[i]!, `the stop at ${BOKEH_STOPS[i + 1]![0]} brightens`));
  const lastHalf = Math.max(...BOKEH_STOPS.filter(([, opacity]) => opacity >= 0.5).map(([offset]) => offset));
  assert.ok(1 - lastHalf >= 0.25, `the edge fades over ${1 - lastHalf} of the radius`);

  // A back orb breathes between these strengths: bright enough at its dimmest to read as light, and
  // never a glare.
  let [dimmest, brightest] = [1, 0];
  for (const input of [{}, ...[1225, 0, 1, 2, 3].map((seed) => ({...MAX, seed}))]) {
    for (let frame = 0; frame < N; frame += 10) {
      for (const orb of pick(sceneOf(input, frame), 'bokeh')) {
        if (orb.variant === 0) [dimmest, brightest] = [Math.min(dimmest, orb.opacity), Math.max(brightest, orb.opacity)];
      }
    }
  }
  assert.ok(dimmest >= 0.32 && brightest <= 0.5 + 1e-9, `back orbs breathe from ${dimmest} to ${brightest}`);

  for (const colors of [['#1E5A43', '#8E1F35', '#D8B25A'], ['#1E5A43', '#8E1F35']]) {
    const markup = markupOf({colors});
    const background = rgbOf(DEFAULTS.backgroundColor);
    for (const tone of [0, 1, 2]) {
      const gradient = gradientOf(markup, `christmas-bokeh-${tone}`);
      assert.deepEqual(stopOpacities(gradient), opacities);
      if (tone === 2) continue;
      // Over the velvet a back orb lifts the red most and the blue least, and at its dimmest its core
      // still reads warm, not grey or khaki: red ahead of green by 8 levels and of blue by 25.
      const color = rgbOf(/stop-color="([^"]+)"/.exec(gradient)![1]!);
      const [red, green, blue] = color.map((value, c) => value - background[c]!);
      const [r, g, b] = background.map((value, c) => value + dimmest * (color[c]! - value));
      const label = `${colors.length} colors, tone ${tone}: lift ${red} ${green} ${blue}, core ${[r, g, b].map(Math.round)}`;
      assert.ok(red > green && green > blue, label);
      assert.ok(r! - g! >= 8 && r! - b! >= 25, label);
    }
  }
});

test('Christmas: the picture is plain SVG alpha, with nothing that depends on the frames rendered before', () => {
  // A CSS blend mode made Chrome composite its group apart, so a frame's pixels depended on the
  // frames the tab had rendered before; CSS animations, transitions and SMIL run on the clock.
  const banned = [
    'style=', 'mix-blend-mode', 'mixBlendMode', 'isolation', 'animation', 'transition', '@keyframes', 'filter', 'will-change',
    '<animate', '<set',
  ];
  for (const input of [{}, MAX, {transparent: true, outputFormat: 'webm'}] as const) {
    for (const frame of [0, 240, 1199]) {
      const markup = markupOf(input, frame);
      for (const word of banned) assert.ok(!markup.includes(word), `${JSON.stringify(input)} at frame ${frame}: the markup has ${word}`);
    }
  }
});

test('Christmas: pine, garland, bow and lights stay in the edge bands by construction', () => {
  for (const cluster of CLUSTERS) {
    const art = cluster.art === 'upper' ? PINE_UPPER : PINE_LOWER;
    assert.ok(art.extent.length > 1000, `${cluster.id}: the extent lists the needle tips`);
    for (const rotation of [-cluster.amplitude, cluster.amplitude]) {
      for (const point of art.extent) {
        const [x, y] = clusterPoint(cluster, point, rotation);
        const grown = {left: x - 2, top: y - 2, right: x + 2, bottom: y + 2};
        assert.ok(!overlaps(grown, CONTENT_BOX), `${cluster.id} at ${rotation}°: (${x}, ${y})`);
      }
    }
  }
  assert.ok(GARLAND.maxY < 170, `garland reaches y ${GARLAND.maxY}`);
  assert.ok(BOW_BOX.bottom < 170);
  // The largest halo, around the lowest bulb, still ends above the content area.
  for (const slot of LIGHT_SLOTS) assert.ok(slot.y + HALO * Math.max(...LIGHT_RADII) < 170, `light at ${slot.x}`);
  assert.equal(LIGHT_SLOTS.length, 22);

  // The bow's control points bound its curves: at the widest tail swing (sway 1) and with the
  // gilded edge, the drawing stays inside BOW_BOX.
  const pairs = (d: string): Point[] => {
    const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    return Array.from({length: numbers.length / 2}, (_, i) => [numbers[2 * i]!, numbers[2 * i + 1]!] as const);
  };
  const edge = 0.8;
  const inside = ([x, y]: Point) => {
    const [cx, cy] = [BOW.x + BOW.scale * x, BOW.y + BOW.scale * y];
    const pad = BOW.scale * edge;
    return cx - pad >= BOW_BOX.left && cx + pad <= BOW_BOX.right && cy - pad >= BOW_BOX.top && cy + pad <= BOW_BOX.bottom;
  };
  const left = [...pairs(TAIL_FRONT), ...pairs(TAIL_BACK)];
  const tails = [...left, ...left.map(([x, y]) => [-x, y - 8] as const)];
  for (const rotation of [-1.4, 1.4]) {
    for (const point of tails) assert.ok(inside(rotateAbout(point, [0, 0], rotation)), `tail point ${point} at ${rotation}°`);
  }
  for (const [x, y] of [...pairs(LOOP_LEFT), ...pairs(KNOT)]) {
    assert.ok(inside([x, y]) && inside([-x, y]), `loop or knot point ${x} ${y}`);
  }
});

test('Christmas: the garland is bundled from sprigs, and its ribbon runs flat under the bow and never above the knot', () => {
  // A sprig every 18–22 px along about 2100 px of swags.
  assert.ok(GARLAND.sprigs > 90 && GARLAND.sprigs < 120, `${GARLAND.sprigs} sprigs`);
  const points = [...`${GARLAND.ribbonFront}${GARLAND.ribbonBack}`.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)]
    .map((found) => [Number(found[1]), Number(found[2])] as const);
  assert.ok(points.length > 500);
  const centreline = (x: number) => (x < GARLAND_CENTRE
    ? swagPoint('A', (x - 300) / 660).y
    : swagPoint('B', (x - GARLAND_CENTRE) / 660).y);
  let nearKnot = 0;
  for (const [x, y] of points) {
    const away = Math.abs(x - GARLAND_CENTRE);
    assert.ok(away >= RIBBON.gap - 0.1, `ribbon at x ${x} shows between the bow's loops`);
    // Where it stops, the ribbon lies on the centreline, inside the loops.
    if (away < RIBBON.gap + 8) {
      nearKnot++;
      assert.ok(Math.abs(y - centreline(x)) < 3, `ribbon at ${x} ${y} leaves the centreline near the knot`);
    }
    // The offset runs along the normal, so on the steep ends of the swags it reaches a little further
    // vertically; the joints with the corner swags, where the tangent turns, are left out.
    if (x > 330 && x < 1590) assert.ok(Math.abs(y - centreline(x)) < 1.1 * RIBBON.amplitude, `ribbon at ${x} ${y}`);
  }
  assert.ok(nearKnot >= 4, 'the ribbon reaches the bow from both sides');
});

test('Christmas: no bough bauble hangs from a pine cone or is threaded on one', () => {
  // In art space a bough ribbon hangs straight down from its anchor, and at full sway it leans by
  // its own swing plus the bough's bend. Every cone of that bough keeps 15 px clear of it, from the
  // tie bow at the top to the bauble's cap.
  for (const spec of BAUBLES) {
    if (spec.cluster === null || !('spine' in spec.anchor)) continue;
    const cluster = CLUSTERS[spec.cluster]!;
    const art = cluster.art === 'upper' ? PINE_UPPER : PINE_LOWER;
    const [px, py] = spinePoint(UPPER_SPINES[spec.anchor.spine]!, spec.anchor.u);
    const length = (spec.L + spec.cap) / cluster.scale;
    const lean = Math.sin(((1.2 * spec.amplitude + cluster.amplitude) * Math.PI) / 180);
    const half = (ribbonWidthOf(spec.L) / 2) / cluster.scale;
    assert.ok(art.cones.length > 0);
    for (const cone of art.cones) {
      const a = (-cone.rotation * Math.PI) / 180;
      let nearest = Infinity;
      for (let depth = -TIE_REACH; depth <= length; depth += 1) {
        for (const shift of [-1, 0, 1]) {
          // The ribbon's point, in the cone's own frame, to the cone's box.
          const dx = px + shift * Math.max(0, depth) * lean - cone.x;
          const dy = py + depth - cone.y;
          const [u, v] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
          const outside = Math.hypot(Math.max(0, Math.abs(u) - cone.width / 2), Math.max(0, Math.abs(v) - cone.length / 2));
          nearest = Math.min(nearest, outside - half);
        }
      }
      assert.ok(nearest >= 15, `${spec.id}: the cone at ${cone.x} ${cone.y} comes within ${nearest.toFixed(1)} px of its ribbon`);
    }
  }
});

test('Christmas: snow wraps only out of sight', () => {
  for (const input of [{}, MAX]) {
    for (const length of [N, 185]) {
      const props = christmasLoopSchema.parse(input);
      const wraps = new Array<number>(props.snowCount).fill(0);
      eachStep(input, length, (before, after, frame) => {
        const [from, to] = [pick(before, 'snow'), pick(after, 'snow')];
        from.forEach((flake, i) => {
          const next = to[i]!;
          assert.ok(flake.y >= -40 && flake.y < 1120, `flake ${i} at y ${flake.y}`);
          if (next.y < flake.y - 580) {
            const reach = flake.variant === 1 ? 2.4 * flake.radius : flake.radius;
            assert.ok(flake.y >= 1080 + reach && next.y <= -reach, `flake ${i} wraps in sight at frame ${frame}: ${flake.y} → ${next.y}`);
            wraps[i]!++;
          }
        });
      });
      pick(sceneOf(input, 0, length), 'snow').forEach((flake, i) => {
        if (flake.variant === 0) assert.ok(wraps[i]! >= 1, `far flake ${i} never wraps`);
      });
    }
  }
});

test('Christmas: near snow stays in the side columns, and centerCalm dims only the far snow over the content', () => {
  for (const input of [{}, MAX]) {
    for (let frame = 0; frame < N; frame += 40) {
      for (const flake of pick(sceneOf(input, frame), 'snow')) {
        if (flake.variant === 0) continue;
        const reach = 2.4 * flake.radius;
        assert.ok(flake.x + reach < 360 || flake.x - reach > 1560, `near flake at x ${flake.x}`);
      }
    }
  }
  let dimmed = 0;
  let untouched = 0;
  for (const frame of FRAMES) {
    const calm = pick(sceneOf({...MAX, centerCalm: 1}, frame), 'snow');
    const busy = pick(sceneOf({...MAX, centerCalm: 0}, frame), 'snow');
    calm.forEach((flake, i) => {
      const other = busy[i]!;
      assert.equal(flake.x, other.x);
      assert.equal(flake.y, other.y);
      const inside = insideContent(flake.x, flake.y);
      if (inside === 1) {
        assert.ok(Math.abs(flake.opacity - 0.15 * other.opacity) < 1e-12, `flake ${i}: ${flake.opacity} vs ${other.opacity}`);
        dimmed++;
      } else if (inside === 0) {
        assert.equal(flake.opacity, other.opacity);
        untouched++;
      }
    });
  }
  assert.ok(dimmed > 0 && untouched > 0);
});

test('Christmas: no flashing', () => {
  for (const input of [{}, MAX]) {
    eachStep(input, N, (before, after, frame) => {
      before.forEach((element, i) => {
        const next = after[i]!;
        assert.ok(Math.abs(next.opacity - element.opacity) <= 0.02, `${element.kind} ${i} opacity jumps at frame ${frame}`);
        assert.ok(Math.abs(next.glow - element.glow) <= 0.02, `${element.kind} ${i} glow jumps at frame ${frame}`);
      });
    });
  }
});

test('Christmas: nothing pulses faster than once a second at the default duration', () => {
  // A per-frame limit lets a faint pulse run fast, so count the pulses: at 20 s, 1 Hz is 20 cycles.
  assert.equal(christmasLoopSchema.parse({}).durationSeconds, 20);
  const limit = 20;
  let busiest = 0;
  for (const input of [{}, MAX]) {
    const props = christmasLoopSchema.parse(input);
    const scenes = Array.from({length: N}, (_, frame) => getChristmasScene(props, frame, N));
    scenes[0]!.forEach((element, i) => {
      for (const key of ['opacity', 'glow', 'radius'] as const) {
        const cycles = directionChanges(scenes.map((scene) => scene[i]![key])) / 2;
        busiest = Math.max(busiest, cycles);
        assert.ok(cycles <= limit, `${element.kind} ${i} ${key}: ${cycles} cycles in 20 s`);
      }
    });
  }
  assert.ok(busiest > 0, 'the lights, bokeh and sparkles do pulse');
});

test('Christmas: gentle speeds at the default duration', () => {
  for (const input of [{}, MAX]) {
    const {sway} = christmasLoopSchema.parse(input);
    eachStep(input, N, (before, after) => {
      pick(before, 'snow').forEach((flake, i) => {
        const step = Math.abs(pick(after, 'snow')[i]!.y - flake.y);
        if (step > 580) return;
        assert.ok(step <= (flake.variant === 0 ? 1 : 2), `flake ${i} moves ${step} px in a frame`);
      });
      pick(before, 'bauble').forEach((bauble, i) => {
        assert.ok(Math.abs(bauble.rotation) <= 1.2 * BAUBLES[i]!.amplitude * sway + 1e-9, `${BAUBLES[i]!.id} swings ${bauble.rotation}°`);
      });
    });
  }
});

test('Christmas: controls act without moving the arrangement', () => {
  for (const frame of FRAMES) {
    const unlit = sceneOf({...MAX, lightGlow: 0}, frame);
    assert.deepEqual(countsOf(unlit), countsOf(sceneOf(MAX, frame)));
    for (const light of pick(unlit, 'light')) {
      assert.ok(isZero(light.glow));
      assert.equal(light.opacity, 0.35);
    }
    for (const sparkle of pick(unlit, 'sparkle')) assert.ok(isZero(sparkle.opacity));
    for (const bauble of pick(unlit, 'bauble')) assert.ok(isZero(bauble.glow));

    const still = sceneOf({...MAX, sway: 0}, frame);
    pick(still, 'bauble').forEach((bauble, i) => {
      const spec = BAUBLES[i]!;
      assert.ok(isZero(bauble.rotation) && isZero(bauble.twist), spec.id);
      assert.deepEqual([bauble.pivotX, bauble.pivotY], [...spec.pivot]);
      assert.equal(bauble.x, bauble.pivotX);
      assert.equal(bauble.y, bauble.pivotY + (spec.L + spec.cap + spec.r));
    });
    for (const item of [...pick(still, 'bow'), ...pick(still, 'branch')]) assert.ok(isZero(item.rotation), item.kind);
    const corner = pick(still, 'light').slice(22).map(({x, y}) => [x, y]);
    assert.deepEqual(corner, [...CORNER_LIGHTS.TL, ...CORNER_LIGHTS.TR].map(([x, y]) => [x, y]));
  }

  const steady = FRAMES.map((frame) => pick(sceneOf({...MAX, twinkle: 0}, frame), 'light').map(({glow, opacity}) => [glow, opacity]));
  for (const lights of steady) assert.deepEqual(lights, steady[0]);

  const fixed = (scene: Scene) => [...pick(scene, 'warmth'), ...pick(scene, 'bow')].map(({x, y}) => [x, y]);
  const reference = fixed(sceneOf(CONTROLS, 0));
  for (const input of [{}, MAX, {...MAX, sway: 0}, {...MAX, lightGlow: 0, twinkle: 0, centerCalm: 0}, {seed: 99}]) {
    for (const frame of FRAMES) assert.deepEqual(fixed(sceneOf(input, frame)), reference);
  }
});

test('Christmas: sway, lightGlow, twinkle and centerCalm reach their full effect', () => {
  for (const seed of [1225, -7]) {
    // MAX sets sway, lightGlow and twinkle to 1; every frame of the cycle is visited.
    const props = christmasLoopSchema.parse({...MAX, seed});
    const scenes = Array.from({length: N}, (_, frame) => getChristmasScene(props, frame, N));
    const seriesOf = (kind: ChristmasElement['kind']) => {
      const picked = scenes.map((scene) => pick(scene, kind));
      return (i: number, key: 'rotation' | 'twist' | 'glow' | 'opacity') => picked.map((items) => items[i]![key]);
    };
    const peak = (values: number[]) => Math.max(...values.map(Math.abs));
    const label = (text: string) => `seed ${seed}: ${text}`;

    // The swing fills the bounds the edge-band test checks the boughs and the bow at, and stays inside them.
    const branch = seriesOf('branch');
    CLUSTERS.forEach((cluster, k) => {
      const swing = peak(branch(k, 'rotation'));
      assert.ok(swing > 0.9 * cluster.amplitude && swing <= cluster.amplitude + 1e-9, label(`${cluster.id} bends ${swing}°`));
    });
    const bowSwing = peak(seriesOf('bow')(0, 'rotation'));
    assert.ok(bowSwing > 1.3 && bowSwing <= 1.4 + 1e-9, label(`the bow tails swing ${bowSwing}°`));
    // Where the main swing peaks, the overtone (a fifth of it) takes back at most 0.2·A.
    const bauble = seriesOf('bauble');
    BAUBLES.forEach((spec, i) => {
      assert.ok(peak(bauble(i, 'rotation')) > 0.75 * spec.amplitude, label(`${spec.id} barely swings`));
      assert.ok(peak(bauble(i, 'twist')) > 0.9, label(`${spec.id} barely turns its highlight`));
    });

    // Lit, every bulb, sparkle and glint shines; the chase moves every bulb by the full 50%.
    const light = seriesOf('light');
    for (let i = 0; i < 26; i++) {
      const glow = light(i, 'glow');
      assert.ok(Math.max(...glow) > 0.95, label(`light ${i} stays dim`));
      assert.ok(Math.max(...glow) - Math.min(...glow) > 0.45, label(`light ${i} barely twinkles`));
      assert.ok(Math.min(...glow) >= 0.5 - 1e-9, label(`light ${i} dips below half`));
    }
    const sparkle = seriesOf('sparkle');
    for (let i = 0; i < props.sparkleCount; i++) assert.ok(Math.max(...sparkle(i, 'opacity')) > 0.5, label(`sparkle ${i} stays dim`));
    BAUBLES.forEach((spec, i) => assert.ok(Math.max(...bauble(i, 'glow')) > 0.5, label(`${spec.id} never glints`)));
  }

  // centerCalm also shades the center of the opaque picture.
  const veil = (centerCalm: number) => stopOpacities(gradientOf(markupOf({centerCalm}), 'christmas-veil'));
  assert.deepEqual(veil(0), [0, 0, 0]);
  assert.deepEqual(veil(1), [0.3, 0.2, 0]);
});

test('Christmas: counts only resize their own layer', () => {
  const layers = [
    ['snowCount', 'snow', 240], ['bokehCount', 'bokeh', 48], ['sparkleCount', 'sparkle', 60], ['baubleCount', 'bauble', 10],
  ] as const;
  for (const [control, kind, max] of layers) {
    for (const frame of [0, 437]) {
      const few = sceneOf({[control]: 1}, frame);
      const many = sceneOf({[control]: max}, frame);
      for (const other of KINDS) {
        if (other !== kind) assert.deepEqual(pick(few, other), pick(many, other), `${control} moves ${other}`);
      }
      assert.equal(pick(few, kind).length, 1);
      assert.equal(pick(many, kind).length, max);
      assert.deepEqual(pick(few, kind)[0], pick(many, kind)[0], `${control}: the first ${kind} stays put`);
    }
  }
  for (let count = 0; count <= 10; count++) {
    const baubles = pick(sceneOf({baubleCount: count}, 300), 'bauble');
    assert.deepEqual(
      baubles.map(({variant, tone}) => [variant, tone]),
      BAUBLES.slice(0, count).map(({style, tone}) => [style, tone]),
    );
  }
});

test('Christmas: the seed moves the choreography, never the arrangement', () => {
  for (const frame of FRAMES) {
    const [one, other] = [1, 2026].map((seed) => sceneOf({...MAX, sway: 0, seed}, frame));
    const place = (scene: Scene, kind: ChristmasElement['kind']) => pick(scene, kind).map(({x, y}) => [x, y]);
    assert.deepEqual(
      pick(one!, 'bauble').map(({x, y, pivotX, pivotY}) => [x, y, pivotX, pivotY]),
      pick(other!, 'bauble').map(({x, y, pivotX, pivotY}) => [x, y, pivotX, pivotY]),
    );
    for (const kind of ['light', 'bow'] as const) assert.deepEqual(place(one!, kind), place(other!, kind), kind);
    assert.deepEqual(pick(one!, 'warmth'), pick(other!, 'warmth'));
    for (const kind of ['snow', 'bokeh', 'sparkle'] as const) assert.notDeepEqual(place(one!, kind), place(other!, kind), kind);
  }
});

test('Christmas: computing frames mutates neither the props nor earlier results', () => {
  const props = christmasLoopSchema.parse({...MAX, seed: -2026});
  const originalProps = structuredClone(props);
  const firstScene = getChristmasScene(props, 173, N);
  const originalScene = structuredClone(firstScene);
  getChristmasScene(props, 600, N);
  getChristmasScene(christmasLoopSchema.parse({seed: 19}), 173, N);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(firstScene, originalScene);
  assert.deepEqual(getChristmasScene(props, 173, N), originalScene);
});

test('Christmas: transparent mode drops the backdrop and keeps the frame', () => {
  const transparent = markupOf({transparent: true, outputFormat: 'webm'});
  const opaque = markupOf({});
  const composited = markupOf({transparent: true, outputFormat: 'mp4'});
  for (const backdrop of ['url(#christmas-velvet)', 'url(#christmas-veil)', 'url(#christmas-vignette)', 'url(#christmas-warmth-']) {
    assert.ok(!transparent.includes(backdrop), `transparent keeps ${backdrop}`);
    assert.ok(opaque.includes(backdrop), `opaque lacks ${backdrop}`);
    assert.ok(composited.includes(backdrop), `mp4 lacks ${backdrop}`);
  }
  for (const piece of [GARLAND.front, 'url(#christmas-bauble-', 'url(#christmas-light-halo-', 'url(#christmas-velvet-bow)', 'translate(3 5)']) {
    const label = piece.slice(0, 40);
    assert.ok(transparent.includes(piece), `transparent lacks ${label}`);
    assert.ok(opaque.includes(piece), `opaque lacks ${label}`);
  }
  assert.equal(markupOf({transparent: true, outputFormat: 'webm'}), transparent, 'the picture is deterministic');

  // Out-of-focus light is warm: amber, amber gold and gold, never a pale tone or a tint of the green or the red.
  const gold = DEFAULTS.colors[2];
  [mix(gold, AMBER, 0.6), mix(gold, AMBER, 0.4), gold].forEach((color, tone) => {
    assert.ok(gradientOf(opaque, `christmas-bokeh-${tone}`).includes(`stop-color="${color}"`), `bokeh tone ${tone}`);
  });
  // A bulb's halo is warm and full at its heart, fading out over ten bulb radii.
  for (const variant of [0, 1]) assert.deepEqual(stopOpacities(gradientOf(opaque, `christmas-light-halo-${variant}`)), [0.8, 0.4, 0]);
  assert.ok(gradientOf(opaque, 'christmas-light-halo-0').includes(`stop-color="${mix(gold, AMBER, 0.25)}"`));

  // The orbs behind the greenery are backdrop light: over the velvet, after the warmth and under the
  // veil, and left out over a game; the ones in front of the pine stay.
  const orbs = (markup: string) => [...markup.matchAll(/url\(#christmas-bokeh-\d\)/g)].length;
  const inFront = pick(sceneOf({}, 240), 'bokeh').filter((orb) => orb.variant === 1).length;
  assert.ok(inFront > 0 && inFront < DEFAULTS.bokehCount);
  assert.equal(orbs(opaque), DEFAULTS.bokehCount);
  assert.equal(orbs(transparent), inFront);
  const firstOrb = opaque.indexOf('url(#christmas-bokeh-');
  assert.ok(opaque.lastIndexOf('url(#christmas-warmth-') < firstOrb && firstOrb < opaque.indexOf('url(#christmas-veil)'));
  // The vignette darkens the velvet alone: it comes before the warmth, the orbs and the greenery.
  assert.ok(opaque.indexOf('url(#christmas-vignette)') < opaque.indexOf('url(#christmas-warmth-'));
  assert.ok(opaque.indexOf('url(#christmas-vignette)') < opaque.indexOf(GARLAND.back));

  // The garland baubles hang in front of its greenery; the bough baubles behind the garland and the pine.
  const bodies = [...opaque.matchAll(/url\(#christmas-bauble-\d\)"/g)].map((found) => found.index);
  const greenery = opaque.indexOf(GARLAND.front);
  const onGarland = BAUBLES.filter((spec) => spec.cluster === null).length;
  assert.equal(bodies.length, BAUBLES.length);
  assert.equal(bodies.filter((index) => index > greenery).length, onGarland);

  // The bow and the pine cover the garland bulbs beneath them; the corner bulbs sit on the pine.
  const at = (pattern: RegExp) => [...opaque.matchAll(pattern)].map((found) => found.index);
  const halos = at(/url\(#christmas-light-halo-/g);
  assert.equal(halos.length, 26);
  const bow = opaque.indexOf('url(#christmas-velvet-bow)');
  assert.equal(halos.filter((index) => index < bow).length, LIGHT_SLOTS.length, 'the bow covers the garland bulbs');
  const berries = at(/url\(#christmas-berry(-mirrored)?\)/g);
  assert.ok(Math.max(...berries) < halos[LIGHT_SLOTS.length]!, 'the corner bulbs sit on the pine');
  // The mirrored boughs (TR, BR) shade their berries and cones from the canvas' top left too.
  assert.equal(at(/url\(#christmas-berry\)/g).length, 6);
  assert.equal(at(/url\(#christmas-berry-mirrored\)/g).length, 6);
  const cones = PINE_UPPER.cones.length + PINE_LOWER.cones.length;
  assert.equal(at(/url\(#christmas-cone\)/g).length, cones);
  assert.equal(at(/url\(#christmas-cone-mirrored\)/g).length, cones);
  // Each bough draws its cones over its front needles, so they read at 1x.
  const indicesOf = (piece: string) => {
    const found: number[] = [];
    for (let index = opaque.indexOf(piece); index >= 0; index = opaque.indexOf(piece, index + 1)) found.push(index);
    return found;
  };
  const fronts = [...indicesOf(`d="${PINE_UPPER.front}"`), ...indicesOf(`d="${PINE_LOWER.front}"`)].sort((a, b) => a - b);
  const coneBodies = at(/url\(#christmas-cone(-mirrored)?\)/g);
  assert.equal(fronts.length, 4);
  fronts.forEach((front, k) => {
    const next = fronts[k + 1] ?? Infinity;
    const own = coneBodies.filter((index) => index > front && index < next).length;
    assert.equal(own, k < 2 ? PINE_UPPER.cones.length : PINE_LOWER.cones.length, `bough ${k} draws its cones under its needles`);
  });
});

test('Christmas: with two colors, gold falls back to the second, the metal turns silver and the light stays light', () => {
  const [evergreen, burgundy, gold] = ['#1E5A43', '#8E1F35', '#D8B25A'];
  const colors = [evergreen, burgundy];
  assert.equal(christmasLoopSchema.safeParse({colors}).success, true);
  let markup = '';
  assert.doesNotThrow(() => {
    markup = markupOf({colors});
  });
  assert.ok(!markup.includes('undefined'), 'the markup names an undefined color');
  const tint = mix(burgundy, CREAM, 0.55);
  assert.deepEqual(paletteOf(colors), {evergreen, burgundy, gold: burgundy, metal: SILVER, accent: tint});
  assert.deepEqual(paletteOf([evergreen, burgundy, gold]), {evergreen, burgundy, gold, metal: gold, accent: gold});
  // The caps and rings are plain metal, not burgundy; the banded bauble's band is a light tint.
  const cap = gradientOf(markup, 'christmas-gold-cap');
  for (const [toward, share] of [['#000', 0.35], ['#fff', 0.35], ['#000', 0.45]] as const) {
    assert.ok(cap.includes(`stop-color="${mix(SILVER, toward, share)}"`), `the cap lacks silver mixed ${share} toward ${toward}`);
  }
  assert.ok(markup.includes(`stroke="${SILVER}"`), 'the rings are not silver');
  assert.ok(markup.includes(`stroke="${tint}"`), 'the band is not the light tint');
  // The garland ribbon keeps the documented fallback.
  assert.ok(markup.includes(`stroke="${burgundy}"`));
  assert.equal(markup, markupOf({colors: [evergreen, burgundy, burgundy]}));
});

test('Christmas: export keeps the shared alpha rule', () => {
  for (const format of ['mp4', 'webm', 'gif'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'ChristmasLoop', format, props: {transparent}});
      const metadata = getCompositionMetadata(resolved.props);
      assert.equal(resolved.props.backgroundColor, '#0A1712');
      assert.equal(resolved.props.durationSeconds, 20);
      assert.equal(metadata.durationInFrames, format === 'gif' ? 1000 : 1200);
      assert.equal(hasTransparentBackground(resolved.props), format === 'webm' && transparent);
      assert.deepEqual(resolved.chromiumOptions, {gl: null});
      if (format === 'webm') {
        assert.equal(resolved.preset.codec, 'vp9');
        assert.equal('pixelFormat' in resolved.preset && resolved.preset.pixelFormat, transparent ? 'yuva420p' : 'yuv420p');
      }
    }
  }
});

test('Christmas: baubles hang from the greenery', () => {
  const reference: Record<string, Point> = {
    L1: [93.1, 74.6], R1: [1834.3, 68.3], T2: [788, 86.05], T3: [1132, 86.05], L2: [204.9, 139.2],
    R2: [1729.2, 129.0], T1: [538, 98.24], T4: [1382, 98.24], L3: [282.8, 179.1], R3: [1643.3, 36.7],
  };
  for (const spec of BAUBLES) {
    if ('spine' in spec.anchor) {
      assert.notEqual(spec.cluster, null);
      const expected = clusterPoint(CLUSTERS[spec.cluster!]!, spinePoint(UPPER_SPINES[spec.anchor.spine]!, spec.anchor.u), 0);
      assert.deepEqual([...spec.pivot], expected, spec.id);
    } else {
      assert.equal(spec.cluster, null);
      // The swags' closed forms: x = x0 + 660t, y = 40 + 256t − 262t² (A) or 34 + 268t − 262t² (B).
      const t = (spec.anchor.x - (spec.anchor.swag === 'A' ? 300 : 960)) / 660;
      const y = spec.anchor.swag === 'A' ? 40 + 256 * t - 262 * t * t : 34 + 268 * t - 262 * t * t;
      assert.ok(Math.hypot(spec.pivot[0] - spec.anchor.x, spec.pivot[1] - y) < 0.01, spec.id);
    }
    const [x, y] = reference[spec.id]!;
    assert.ok(Math.abs(spec.pivot[0] - x) < 0.1 && Math.abs(spec.pivot[1] - y) < 0.1, `${spec.id} rests at ${spec.pivot}`);
  }
});
