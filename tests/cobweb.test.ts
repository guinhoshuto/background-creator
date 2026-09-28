import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {resolveExport} from '../scripts/export';
import {
  CobwebFrame, getCobwebScene, cobwebLoopSchema, DEW_REACH, EMBER, MIST_BANK, MOON, MOON_HALO_RADIUS, SPIDER_ANCHORS, STRAND,
  strandCurve, TRANSPARENT_EMBER, wind, type CobwebElement, type CobwebLoopProps,
} from '../src/backgrounds/CobwebLoop';
import {
  flexPoint, flexWeb, LEG_HALO, LEG_WIDTHS, OrbWeb, SPIDER_REACH, spiderLegs, SPOKE_SEGMENTS, TIP_BEAD_REACH, type Point,
} from '../src/backgrounds/halloween/CobwebArtwork';
import {TAU} from '../src/loop';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

const KINDS = ['web', 'dew', 'strand', 'spider', 'mote', 'mist'] as const;

/** Everything the component draws on one frame of a 720-frame cycle. */
const markupOf = (input: Partial<CobwebLoopProps>, frame = 0) => renderToStaticMarkup(createElement(CobwebFrame, {
  props: cobwebLoopSchema.parse(input), frame, durationInFrames: 720,
}));

const countsOf = (scene: CobwebElement[]) =>
  Object.fromEntries(KINDS.map((kind) => [kind, scene.filter((element) => element.kind === kind).length]));

/** The anchor every hanging spider keeps above the frame. */
const SPIDER_ANCHOR_Y = -30;

/** Points along a strand's quadratic, from the knot to the bead, placed as the component draws it. */
const strandPoints = ({x, y, scale, rotation, bend}: CobwebElement) => {
  const radians = rotation * TAU / 360;
  const {control: {x: cx, y: cy}, tip: {x: ex, y: ey}} = strandCurve({scale, bend});
  return Array.from({length: 17}, (_, k) => {
    const t = k / 16;
    const lx = 2 * (1 - t) * t * cx + t * t * ex;
    const ly = 2 * (1 - t) * t * cy + t * t * ey;
    return {x: x + lx * Math.cos(radians) - ly * Math.sin(radians), y: y + lx * Math.sin(radians) + ly * Math.cos(radians)};
  });
};

/** Where the component actually puts a strand's bead: the far, low end of the filament, on the side it bows to. */
const strandTip = (strand: CobwebElement) => strandPoints(strand)[16]!;

/** A point given in a web's local units, placed in the frame exactly as the component draws it. */
const toFrame = (web: CobwebElement, {x, y}: Point) => {
  const radians = web.rotation * TAU / 360;
  return {
    x: web.x + x * web.scale * Math.cos(radians) - y * web.scale * Math.sin(radians),
    y: web.y + x * web.scale * Math.sin(radians) + y * web.scale * Math.cos(radians),
  };
};

/** A node of a web where the breeze has carried it this frame, in frame coordinates. */
const nodeInFrame = (web: CobwebElement, node: Point) => toFrame(web, flexPoint(web.geometry!, node, web.billow));

/** Every node of every web, in frame coordinates, exactly as the dew layer places a drop. */
const silkNodes = (scene: CobwebElement[]) =>
  scene.filter(({kind}) => kind === 'web').flatMap((web) => (web.geometry?.nodes ?? []).map((node) => nodeInFrame(web, node)));

/** The frame-aligned box around everything a spider draws, turned and scaled as the component draws it. */
const spiderBox = ({x, y, scale, rotation}: CobwebElement) => {
  const radians = rotation * TAU / 360;
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => {
    const cx = sx! * SPIDER_REACH.side * scale;
    const cy = (sy! < 0 ? -SPIDER_REACH.top : SPIDER_REACH.bottom) * scale;
    return {x: x + cx * Math.cos(radians) - cy * Math.sin(radians), y: y + cx * Math.sin(radians) + cy * Math.cos(radians)};
  });
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return {left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys)};
};

/** Where a path starts, in local units. */
const pathStart = (d: string): Point => {
  const [x, y] = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  return {x: x!, y: y!};
};

/** Points along every quadratic of a ring: the scallops sit between nodes the dew never samples. */
const arcSamples = (d: string) => (d.match(/M[^M]+/g) ?? []).flatMap((segment) => {
  const [x1, y1, cx, cy, x2, y2] = (segment.match(/-?\d+(\.\d+)?/g) ?? []).map(Number) as number[];
  return [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    x: (1 - t) ** 2 * x1! + 2 * (1 - t) * t * cx! + t ** 2 * x2!,
    y: (1 - t) ** 2 * y1! + 2 * (1 - t) * t * cy! + t ** 2 * y2!,
  }));
});

const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

/** Distance from the hub of the last point in an SVG path. */
const endRadius = (d: string) => {
  const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];
  const y = Number(numbers[numbers.length - 1]);
  const x = Number(numbers[numbers.length - 2]);
  return Math.hypot(x, y);
};

/** Distance from the hub of the first point in an SVG path. */
const startRadius = (d: string) => {
  const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];
  return Math.hypot(Number(numbers[0]), Number(numbers[1]));
};

test('Teias: os valores iniciais descrevem um ciclo de doze segundos', () => {
  const props = cobwebLoopSchema.parse({});
  assert.equal(props.durationSeconds, 12);
  assert.equal(props.seed, 47);
  assert.equal(props.webCount, 4);
  assert.equal(props.strandCount, 12);
  assert.equal(props.moteCount, 40);
  assert.equal(props.spiderCount, 1);
  assert.equal(props.dewIntensity, 0.7);
  assert.equal(props.mistIntensity, 0.5);
  assert.equal(props.backgroundColor, '#100B1B');
  assert.deepEqual(props.colors, ['#CFC6E4', '#F6EFD8', '#E8963C']);
  assert.deepEqual(getCompositionMetadata(props), {
    width: 1920, height: 1080, fps: 60, durationInFrames: 720,
  });
});

test('Teias: a cena preserva as contagens e valores visuais válidos durante o ciclo', () => {
  // Dew comes from each web's own geometry, so its count is pinned per web at the shipped seed.
  const dewPerWebCount = [0, 27, 35, 50, 58];
  for (const counts of [
    {webCount: 0, strandCount: 0, moteCount: 0, spiderCount: 0},
    {webCount: 1, strandCount: 1, moteCount: 1, spiderCount: 1},
    {webCount: 2, strandCount: 6, moteCount: 20, spiderCount: 2},
    {webCount: 3, strandCount: 12, moteCount: 40, spiderCount: 1},
    {webCount: 4, strandCount: 24, moteCount: 120, spiderCount: 3},
  ]) {
    const props = cobwebLoopSchema.parse(counts);
    const expected = countsOf(getCobwebScene(props, 0, 720));
    assert.equal(expected.web, counts.webCount);
    assert.equal(expected.strand, counts.strandCount);
    assert.equal(expected.spider, counts.spiderCount);
    assert.equal(expected.mote, counts.moteCount);
    assert.equal(expected.mist, 4);
    assert.equal(expected.dew, dewPerWebCount[counts.webCount], `orvalho para webCount ${counts.webCount}`);

    for (const frame of [0, 1, 90, 180, 359, 540, 719]) {
      const scene = getCobwebScene(props, frame, 720);
      assert.deepEqual(countsOf(scene), expected);
      for (const element of scene) {
        for (const key of ['x', 'y', 'scale', 'rotation', 'opacity', 'glow', 'curl', 'thread', 'anchorX', 'stepSin', 'stepCos', 'glint', 'bend', 'billow'] as const) {
          assert.equal(typeof element[key], 'number', `${element.kind}.${key}`);
          assert.ok(Number.isFinite(element[key]), `${element.kind}.${key}`);
        }
        assert.ok(element.opacity >= 0 && element.opacity <= 1, `${element.kind}: opacidade válida`);
        assert.ok(element.scale > 0, `${element.kind}: escala positiva`);
        assert.equal(element.kind === 'web', Boolean(element.geometry));
      }
    }
  }
});

test('Teias: a geometria é desenhável, determinística e igual em qualquer seed', () => {
  for (const seed of [1, 7, 47, 99, -2026, 2026]) {
    const props = cobwebLoopSchema.parse({seed});
    const webs = getCobwebScene(props, 137, 720).filter(({kind}) => kind === 'web');
    assert.equal(webs.length, 4);
    for (const web of webs) {
      const geometry = web.geometry;
      assert(geometry);
      assert.ok(geometry.spokes.length >= 8 && geometry.spokes.length <= 12);
      assert.ok(geometry.rings.length >= 6 && geometry.rings.length <= 10);
      assert.ok(geometry.sheen > 0);
      assert.ok(geometry.nodes.length >= 8, 'a teia precisa de nós para o orvalho');

      // Drawable content, not just a well-formed string: a torn web must still be a web.
      assert.ok(geometry.spokes.every(({d}) => d.startsWith('M0 0 Q')), 'raio sem conteúdo');
      assert.equal(geometry.spokes.filter(({frame}) => frame).length, 3, 'a teia precisa de três fios-moldura');
      // Only the upper webs have open air below the rim; a snapped thread on a lower web
      // would fall back across its own silk.
      assert.ok(geometry.loose === '' || geometry.loose.startsWith('M'), 'fio rompido sem conteúdo');
      assert.equal(geometry.loose !== '', web.y < 540, 'só as teias de cima têm fio rompido');
      // The rim caps every radial; a gap there, or a radial that overshoots it, leaves
      // a thread ending in open canvas.
      const rim = geometry.rings[geometry.rings.length - 1]!;
      assert.equal((rim.d.match(/M/g) ?? []).length, geometry.spokes.length - 1, 'o aro externo não pode ter falhas');
      const rimRadius = startRadius(rim.d);
      for (const {d} of geometry.spokes) {
        assert.ok(Math.abs(endRadius(d) - rimRadius) < 1, `raio termina em ${endRadius(d).toFixed(1)}, aro em ${rimRadius.toFixed(1)}`);
      }
      if (geometry.loose) {
        assert.ok(Math.abs(startRadius(geometry.loose) - rimRadius) < 1, 'o fio rompido precisa nascer no aro');
      }

      const segments = geometry.rings.reduce((sum, {d}) => sum + (d.match(/M/g) ?? []).length, 0);
      const possible = geometry.rings.length * (geometry.spokes.length - 1);
      assert.ok(segments > possible * 0.7, `poucos segmentos de anel: ${segments}/${possible}`);
      assert.ok(geometry.rings.filter(({d}) => d !== '').length >= geometry.rings.length - 1);

      const paths = [geometry.spokes, geometry.rings, geometry.tearStubs].flatMap((threads) => threads.map(({d}) => d));
      for (const path of [...paths, geometry.loose]) {
        assert.doesNotMatch(path, /NaN|Infinity|undefined/, 'caminho SVG inválido');
      }
      for (const node of geometry.nodes) {
        assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
        assert.ok(node.depth > 0 && node.depth <= 1);
      }
    }
    assert.deepEqual(
      webs.map(({geometry}) => geometry),
      getCobwebScene(props, 400, 720).filter(({kind}) => kind === 'web').map(({geometry}) => geometry),
      'a geometria não pode depender do frame',
    );
  }
  const first = getCobwebScene(cobwebLoopSchema.parse({seed: 1}), 0, 720).filter(({kind}) => kind === 'web');
  const other = getCobwebScene(cobwebLoopSchema.parse({seed: 2}), 0, 720).filter(({kind}) => kind === 'web');
  assert.notDeepEqual(other.map(({geometry}) => geometry), first.map(({geometry}) => geometry), 'a seed precisa mudar a teia');
});

test('Teias: cada gota de orvalho fica sobre um fio e dentro do quadro', () => {
  const props = cobwebLoopSchema.parse({dewIntensity: 1});
  for (const frame of [0, 97, 311, 604, 719]) {
    const scene = getCobwebScene(props, frame, 720);
    const nodes = silkNodes(scene);
    for (const drop of scene.filter(({kind}) => kind === 'dew')) {
      const onSilk = nodes.some((node) => Math.abs(node.x - drop.x) < 0.01 && Math.abs(node.y - drop.y) < 0.01);
      assert.ok(onSilk, `gota fora da seda em (${drop.x}, ${drop.y})`);
      // The visibility filter works on the hub-relative node, so the sway can carry a
      // drop a little past the edge; what it must never do is place one far outside.
      assert.ok(drop.x > -40 && drop.x < 1960 && drop.y > -40 && drop.y < 1120, 'gota longe do quadro');
    }
  }
});

test('Teias: as aranhas descem e sobem penduradas no próprio fio', () => {
  const props = cobwebLoopSchema.parse({spiderCount: 3});
  const samples = [0, 180, 360, 540].map((frame) =>
    getCobwebScene(props, frame, 720).filter(({kind}) => kind === 'spider').map(({y, thread}) => ({y, thread})));
  for (const spiders of samples) {
    assert.equal(spiders.length, 3);
    // The silk always spans exactly from the fixed anchor above the frame to the body.
    for (const {y, thread} of spiders) {
      assert.ok(thread > 0);
      assert.equal(y - thread, SPIDER_ANCHOR_Y);
    }
  }
  assert.notDeepEqual(samples[0], samples[1]);
  assert.notDeepEqual(samples[1], samples[2]);
});

test('Teias: teias, orvalho, fios e aranhas nunca entram na área central de conteúdo', () => {
  // Seeds 49 and 124 bring the rim and a drop closest among seeds −50 to 200; 661, 4839 and -1066
  // are among the tightest over −5000 to 5000. Their closest drop sits on the hero's rim, where the
  // glint band's flash swells it to within about 2 px of the area around frames 600 to 616, so
  // those frames are sampled too. webCount 4 covers every corner: a smaller count only drops webs
  // from the end of the list.
  const frames = [...new Set([...Array.from({length: 30}, (_, k) => k * 24), 596, 600, 604, 608, 612, 616])];
  for (const seed of [1, 3, 8, 47, 49, 99, 124, -35, -2026, 661, 4839, -1066]) {
    const props = cobwebLoopSchema.parse({seed, webCount: 4, strandCount: 24, moteCount: 120, spiderCount: 3, dewIntensity: 1});
    for (const frame of frames) {
      const scene = getCobwebScene(props, frame, 720);
      // Each point carries how far it is drawn around itself: a drop's flare and a bead's
      // halo reach well past their centre. The threads are the ones the component draws,
      // bent by the breeze on this frame.
      const silk = scene.filter(({kind}) => kind === 'web').flatMap((web) => {
        const threads = flexWeb(web.geometry!, web.billow);
        const at = (point: Point, reach = 0) => ({...toFrame(web, point), reach: reach * web.scale});
        return [
          ...arcSamples(threads.rings[threads.rings.length - 1]!.d).map((point) => at(point)),
          // A torn end's bead is smaller than a full one; the full reach bounds it.
          ...threads.tearStubs.flatMap(({d, tip, bead}) => [...arcSamples(d).map((point) => at(point)), at(tip, bead ? TIP_BEAD_REACH : 0)]),
          ...(threads.looseTip ? [...arcSamples(threads.loose).map((point) => at(point)), at(threads.looseTip, TIP_BEAD_REACH)] : []),
        ];
      });
      const points = [
        ...silkNodes(scene).map((node) => ({...node, reach: 0})),
        ...silk,
        ...scene.filter(({kind}) => kind === 'dew').map(({x, y, scale}) => ({x, y, reach: DEW_REACH * scale})),
        // A strand is not scaled where it is drawn, so its bead keeps the full size.
        ...scene.filter(({kind}) => kind === 'strand').flatMap((strand) => [
          {x: strand.x, y: strand.y, reach: 0}, {...strandTip(strand), reach: TIP_BEAD_REACH},
        ]),
      ];
      for (const {x, y, reach} of points) {
        assert.ok(Math.abs(x - 960) > 480 + reach || Math.abs(y - 540) > 270 + reach,
          `seed ${seed}: elemento em (${x.toFixed(0)}, ${y.toFixed(0)}), com ${reach.toFixed(1)} px de alcance, invade o centro`);
      }
      // A spider is its legs, not its knot: the whole box they sweep stays clear on some side.
      for (const spider of scene.filter(({kind}) => kind === 'spider')) {
        const box = spiderBox(spider);
        assert.ok(box.left > 1440 || box.right < 480 || box.top > 810 || box.bottom < 270,
          `seed ${seed}: pernas da aranha em x ${box.left.toFixed(0)}–${box.right.toFixed(0)} invadem o centro no frame ${frame}`);
      }
    }
  }
});

test('Teias: as pernas da aranha cabem na caixa que os testes de área central conferem', () => {
  // The body sits well inside the box; the legs are what reach its edges. Each joint
  // carries the widest segment that meets it, grown and nudged by the moonlit halo.
  const pad = (joint: number) => (LEG_WIDTHS[Math.max(0, joint - 1)]! + LEG_HALO.grow) / 2 + LEG_HALO.shift;
  for (let curl = 0; curl <= 1; curl += 0.05) {
    for (let step = 0; step < 72; step++) {
      for (const stride of [0, 0.3, 0.65, 1]) {
        const angle = step * TAU / 72;
        for (const leg of spiderLegs(curl, stride * Math.sin(angle), stride * Math.cos(angle))) {
          leg.forEach(([x, y], joint) => {
            assert.ok(Math.abs(x) + pad(joint) <= SPIDER_REACH.side && y - pad(joint) >= -SPIDER_REACH.top
              && y + pad(joint) <= SPIDER_REACH.bottom, `perna fora da caixa em (${x.toFixed(1)}, ${y.toFixed(1)}) com curl ${curl.toFixed(2)}`);
          });
        }
      }
    }
  }
  // The box holds for a stride of at most 1, which is all the scene ever asks for.
  const props = cobwebLoopSchema.parse({spiderCount: 3});
  for (let frame = 0; frame < 720; frame += 3) {
    for (const {stepSin, stepCos, curl} of getCobwebScene(props, frame, 720).filter(({kind}) => kind === 'spider')) {
      assert.ok(Math.hypot(stepSin, stepCos) <= 1 + 1e-9 && curl >= 0 && curl <= 1, `passada fora do alcance no frame ${frame}`);
    }
  }
});

test('Teias: cada aranha descansa, cai, quica e sobe aos puxões, sem cair junto com outra', () => {
  const length = 720;
  const props = cobwebLoopSchema.parse({spiderCount: 3});
  const spidersAt = (frame: number) => getCobwebScene(props, frame, length).filter(({kind}) => kind === 'spider');
  const frames = Array.from({length: length + 1}, (_, frame) => spidersAt(frame));
  const speed = (index: number, frame: number) => frames[frame + 1]![index]!.y - frames[frame]![index]!.y;
  // Spider 0 hangs still at the top across the seam, and still again at the bottom.
  for (const frame of [...Array.from({length: 80}, (_, k) => k), ...Array.from({length: 50}, (_, k) => 668 + k)]) {
    assert.ok(Math.abs(speed(0, frame)) < 1e-9, `a aranha 0 precisa descansar no alto no frame ${frame}`);
  }
  for (let frame = 292; frame < 370; frame++) {
    assert.ok(Math.abs(speed(0, frame)) < 1e-9, `a aranha 0 precisa descansar embaixo no frame ${frame}`);
  }
  SPIDER_ANCHORS.forEach(({range, lag}, index) => {
    // The climb comes in four hauls with a hold between them, never one smooth rise. Each
    // haul lifts the body half its range; the bounce throws it back up about a quarter,
    // so it never counts as one. A haul may straddle the seam.
    const rise = Array.from({length}, (_, frame) => -speed(index, frame));
    let hauls = 0;
    for (let frame = 0; frame < length; frame++) {
      if (rise[frame]! < 0.05 || rise[(frame + length - 1) % length]! >= 0.05) continue;
      let total = 0;
      for (let k = frame; rise[k % length]! >= 0.05; k++) total += rise[k % length]!;
      if (total > 0.4 * range) hauls++;
    }
    assert.equal(hauls, 4, `a aranha ${index} precisa subir em quatro puxões`);
    // The line catches the spider still falling: it stretches well past where the spider
    // comes to rest, throws it back above that point, and settles.
    const at = (u: number) => frames[Math.round(((u + lag) % 1) * length)]![index]!.y;
    const bounce = Array.from({length: 41}, (_, k) => at(0.24 + k * 0.004) - at(0.46));
    assert.ok(Math.max(...bounce) > 0.15 * range, `a aranha ${index} precisa esticar a linha ao ser pega`);
    assert.ok(Math.min(...bounce) < -0.05 * range, `a aranha ${index} precisa quicar de volta para cima`);
  });
  for (let frame = 0; frame < length; frame++) {
    const falling = SPIDER_ANCHORS.filter((_, index) => speed(index, frame) > 0.3).length;
    assert.ok(falling <= 1, `duas aranhas caem juntas no frame ${frame}`);
  }
  // The shared seam scan sees only the default single spider; the other two are mid-climb
  // and mid-bounce at t = 0, so their seam velocity is checked here.
  for (const n of [185, 720, 735]) {
    const step = 1e-6;
    const [before, now, after] = [n * (1 - step), 0, n * step].map((frame) =>
      getCobwebScene(props, frame, n).filter(({kind}) => kind === 'spider'));
    now!.forEach((spider, index) => {
      for (const key of ['x', 'y', 'rotation', 'curl', 'thread', 'stepSin', 'stepCos'] as const) {
        const left = (spider[key] - before![index]![key]) / step;
        const right = (after![index]![key] - spider[key]) / step;
        assert.ok(Math.abs(left - right) < 0.1 + Math.max(Math.abs(left), Math.abs(right)) * 0.001,
          `aranha ${index}.${key}: velocidade ${left} contra ${right} na emenda`);
      }
    });
  }
});

test('Teias: as pernas da aranha começam e param de andar sem tranco', () => {
  // A leg that jumped from still to full speed in one frame would twitch at every drop and
  // haul, while the body eases in; its acceleration stays small instead.
  const props = cobwebLoopSchema.parse({spiderCount: 3});
  const legs = Array.from({length: 722}, (_, frame) => getCobwebScene(props, frame - 1, 720)
    .filter(({kind}) => kind === 'spider').map(({curl, stepSin, stepCos}) => ({curl, stride: Math.hypot(stepSin, stepCos)})));
  for (let frame = 1; frame <= 720; frame++) {
    legs[frame]!.forEach((now, index) => {
      for (const key of ['curl', 'stride'] as const) {
        const jolt = legs[frame + 1]![index]![key] - 2 * now[key] + legs[frame - 1]![index]![key];
        assert.ok(Math.abs(jolt) < 0.01, `aranha ${index}.${key} dá um tranco de ${jolt.toFixed(4)} no frame ${frame - 1}`);
      }
    });
  }
});

test('Teias: o fio rompido e as pontas do rasgo pendem longe da linha das aranhas', () => {
  // The whole list, never one sliced by spiderCount: the webs must not depend on it.
  const allSpiders = cobwebLoopSchema.parse({spiderCount: SPIDER_ANCHORS.length});
  const lowest = SPIDER_ANCHORS.map((_, index) => Math.max(...Array.from({length: 180}, (_, step) =>
    spiderBox(getCobwebScene(allSpiders, step * 4, 720).filter(({kind}) => kind === 'spider')[index]!).bottom)));
  // 83 is the seed whose torn end hangs closest to a spider's line, at the right webs' gust.
  for (const seed of [1, 3, 8, 47, 83, 99, -35, -2026]) {
    // 116 and 393 are the gust's peaks on the left and right webs.
    for (const frame of [0, 116, 180, 360, 393, 540]) {
      for (const web of getCobwebScene(cobwebLoopSchema.parse({seed}), frame, 720).filter(({kind}) => kind === 'web')) {
        const {loose, looseTip, tearStubs} = flexWeb(web.geometry!, web.billow);
        // Each hanging thread is checked from its root: a spider that never reaches that
        // height cannot line up with it.
        const hanging = [
          ...(looseTip ? [{what: 'fio rompido', gap: 90, points: [toFrame(web, pathStart(loose)), toFrame(web, looseTip)]}] : []),
          ...tearStubs.map(({d, tip}) => ({what: 'ponta do rasgo', gap: 30, points: [toFrame(web, pathStart(d)), toFrame(web, tip)]})),
        ];
        for (const {what, gap, points} of hanging) {
          SPIDER_ANCHORS.forEach((anchor, index) => {
            if (lowest[index]! < points[0]!.y) return;
            for (const {x} of points) {
              assert.ok(Math.abs(x - anchor.x) >= gap, `seed ${seed}: ${what} em x ${x.toFixed(0)} junto da aranha em ${anchor.x}`);
            }
          });
        }
      }
    }
  }
});

test('Teias: as pontas do rasgo ficam no quadro, uma por nó', () => {
  for (const seed of [1, 3, 8, 47, 99, -35, -2026]) {
    // At rest, and as the gust bends the left webs and then the right ones.
    for (const frame of [0, 116, 360, 393]) {
      for (const web of getCobwebScene(cobwebLoopSchema.parse({seed}), frame, 720).filter(({kind}) => kind === 'web')) {
        const {tearStubs} = flexWeb(web.geometry!, web.billow);
        // Two broken ends from the same knot close into an arch instead of reading as a tear.
        const knots = tearStubs.map(({d}) => JSON.stringify(pathStart(d)));
        assert.equal(new Set(knots).size, knots.length, `seed ${seed}: duas pontas soltas no mesmo nó`);
        for (const {d, tip} of tearStubs) {
          for (const {x, y} of [toFrame(web, pathStart(d)), toFrame(web, tip)]) {
            assert.ok(x > 0 && x < 1920 && y > 0 && y < 1080, `seed ${seed}: ponta do rasgo fora do quadro em (${x.toFixed(0)}, ${y.toFixed(0)})`);
          }
        }
      }
    }
  }
});

test('Teias: a teia desenhada é a que a brisa enverga, com as contas nas pontas', () => {
  // The dew and every clearance test follow the bent silk; a web drawn at rest would leave
  // the drops floating off its threads at the gust. 393 is the hero's gust peak, 116 the left
  // webs', where the warm bottom-left web (1) also draws its ember rim.
  for (const [frame, index] of [[393, 0], [116, 1]] as const) {
    const web = getCobwebScene(cobwebLoopSchema.parse({}), frame, 720).filter(({kind}) => kind === 'web')[index]!;
    const geometry = web.geometry!;
    const markup = renderToStaticMarkup(createElement('svg', null, createElement(OrbWeb, {
      geometry, x: web.x, y: web.y, scale: web.scale, rotation: web.rotation, opacity: web.opacity, glow: web.glow,
      glint: web.glint, billow: web.billow, silk: '#CFC6E4', moonlight: '#F6EFD8', accent: '#E8963C', moon: MOON,
      warm: index === 1 ? EMBER : null, outline: true, beadHalo: '#FFFFFF', id: 'cobweb',
    })));
    assert.equal(markup.includes('url(#cobweb-ember)'), index === 1, 'só a teia de baixo à esquerda tem a borda âmbar');
    const bent = flexWeb(geometry, web.billow);
    const paths = [...bent.spokes, ...bent.rings, ...bent.tearStubs].map(({d}) => d).filter((d) => d !== '');
    // No pass, the ember rim included, may draw a thread at rest.
    for (const d of [...geometry.spokes, ...geometry.rings, ...geometry.tearStubs].map(({d}) => d).filter((d) => d !== '')) {
      assert.ok(paths.includes(d) || !markup.includes(`d="${d}"`), `teia ${index}: um fio é desenhado em repouso`);
    }
    for (const d of [...paths, bent.loose].filter((d) => d !== '')) {
      assert.ok(markup.includes(`d="${d}"`), `teia ${index}: um fio desenhado não acompanha a brisa`);
    }
    // The beads ride the bent ends too.
    for (const tip of [...bent.tearStubs.filter(({bead}) => bead).map(({tip}) => tip), ...(bent.looseTip ? [bent.looseTip] : [])]) {
      assert.ok(markup.includes(`cx="${tip.x}" cy="${tip.y}"`), `teia ${index}: uma conta fica para trás`);
    }
    if (index === 0) assert.ok(bent.looseTip, 'a teia da lua precisa do fio rompido');
    // A radial is a polyline with a fixed number of points, ending on its bent rim knot: a
    // quadratic whose control moves every frame is flattened afresh, and the whole thread jumps.
    bent.spokes.forEach(({d}, spoke) => {
      const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const end = flexPoint(geometry, geometry.structure.spokes[spoke]!.to, web.billow);
      assert.ok(!/[QC]/.test(d) && numbers.length === 2 * (SPOKE_SEGMENTS + 1)
        && Math.hypot(numbers.at(-2)! - end.x, numbers.at(-1)! - end.y) < 0.01, `teia ${index}: o raio ${spoke} precisa ser uma polilinha fixa até o aro`);
    });
  }
});

test('Teias: no WebM transparente, o halo da lua e a faixa âmbar ficam fora da área central', () => {
  // The only glows a transparent export keeps. The halo is a circle: the content point
  // nearest the moon must lie beyond its radius.
  const nearest = {x: Math.min(Math.max(MOON.x, 480), 1440), y: Math.min(Math.max(MOON.y, 270), 810)};
  const gap = Math.hypot(MOON.x - nearest.x, MOON.y - nearest.y) - MOON_HALO_RADIUS;
  assert.ok(gap > 0, `o halo da lua invade o centro por ${(-gap).toFixed(0)} px`);
  // Every point of the ember's ellipse sits at or below its top edge.
  assert.ok(TRANSPARENT_EMBER.y - TRANSPARENT_EMBER.ry > 810, 'a faixa âmbar invade o centro');
  // And the export draws only those two: no sky, vignette, wide moon glow or full-frame ember.
  const markup = markupOf({transparent: true, outputFormat: 'webm'});
  for (const id of ['cobweb-sky', 'cobweb-vignette', 'cobweb-moonwash', 'cobweb-ember']) {
    assert.ok(!markup.includes(`fill="url(#${id})"`), `${id} aparece no WebM transparente`);
  }
  assert.ok(!markup.includes('mix-blend-mode'), 'o WebM transparente não mistura luz em modo tela');
  assert.ok(markup.includes(`r="${MOON_HALO_RADIUS}" fill="url(#cobweb-moonhalo)"`), 'o halo da lua mudou de tamanho');
  assert.ok(markup.includes('fill="url(#cobweb-ember-band)"'), 'a faixa âmbar sumiu do WebM transparente');
});

test('Teias: MP4 e GIF com transparent: true desenham a mesma cena opaca', () => {
  // Only WebM keeps transparency, so an MP4 or GIF export of the alpha preset draws exactly
  // the opaque scene over backgroundColor.
  for (const outputFormat of ['mp4', 'gif'] as const) {
    for (const frame of [0, 393]) {
      assert.equal(markupOf({transparent: true, outputFormat}, frame), markupOf({transparent: false, outputFormat}, frame), outputFormat);
    }
  }
  assert.notEqual(markupOf({transparent: true, outputFormat: 'webm'}), markupOf({}), 'o WebM transparente precisa mudar o desenho');
});

test('Teias: a névoa corre rente ao chão num só sentido e só recomeça no meio do ciclo', () => {
  const length = 720;
  const props = cobwebLoopSchema.parse({mistIntensity: 1});
  const mistAt = (frame: number) => getCobwebScene(props, frame, length).filter(({kind}) => kind === 'mist');
  // A bank is on screen while any part of its ellipse overlaps the frame.
  const onScreen = ({x, scale}: CobwebElement) => x + MIST_BANK.rx * scale > 0 && x - MIST_BANK.rx * scale < 1920;
  for (let frame = 0; frame < length; frame++) {
    const now = mistAt(frame);
    const next = mistAt(frame + 1);
    assert.equal(now.length, 4);
    now.forEach((bank, index) => {
      assert.ok(bank.y - MIST_BANK.ry * bank.scale > 810, `névoa na área central no frame ${frame}`);
      assert.ok(bank.opacity <= 0.7 + 1e-9, 'névoa forte demais');
      const step = next[index]!.x - bank.x;
      if (frame === length / 2 - 1) {
        // Every bank hands its place to the next one, never at the seam.
        assert.ok(step < -800, `a névoa precisa recomeçar em t = 0,5, não andou ${step.toFixed(1)}`);
      } else {
        assert.ok(step > 0 && step < 2, `a névoa precisa correr para a direita, andou ${step.toFixed(2)} no frame ${frame}`);
      }
    });
    if (frame === length / 2 - 1) {
      // The hand-over is invisible: every bank on screen has a twin, in the same place and shape, a frame later.
      for (const [from, to] of [[now, next], [next, now]] as const) {
        for (const bank of from.filter(onScreen)) {
          assert.ok(to.some((other) => Math.abs(other.x - bank.x) < 2.5 && Math.abs(other.y - bank.y) < 0.5
            && Math.abs(other.scale - bank.scale) < 0.002 && Math.abs(other.opacity - bank.opacity) < 0.005),
          `banco de névoa em x ${bank.x.toFixed(0)} surge ou some na troca`);
        }
      }
    }
  }
});

test('Teias: uma só brisa cruza o quadro e enverga as teias entre bordas presas', () => {
  // The spiders' clearance from the strands counts on the wind never blowing harder than 1.
  const cycle = Array.from({length: 720}, (_, frame) => frame * TAU / 720);
  assert.ok(cycle.every((phase) => Math.abs(wind(phase, 0)) <= 1), 'a brisa passa da força máxima');
  const peak = (x: number) => cycle.reduce((best, phase) => (wind(phase, x) > wind(best, x) ? phase : best), 0);
  assert.ok(peak(0) < peak(960) && peak(960) < peak(1920), 'a rajada precisa cruzar o quadro da esquerda para a direita');
  const downwind = {x: 1, y: -0.15};
  for (const seed of [1, 47, -2026]) {
    for (const web of getCobwebScene(cobwebLoopSchema.parse({seed}), 0, 720).filter(({kind}) => kind === 'web')) {
      const geometry = web.geometry!;
      const {tilt, spread: fan, rim} = geometry;
      const moved = (angle: number, radius: number, billow: number) => {
        const point = {x: Math.cos(angle) * radius, y: Math.sin(angle) * radius};
        const bent = flexPoint(geometry, point, billow);
        return {x: bent.x - point.x, y: bent.y - point.y};
      };
      const across = Array.from({length: 19}, (_, step) => tilt + fan * (step + 1) / 20);
      for (const billow of [-0.56, 0.3, 1]) {
        // The hub and both edge radials are tied down, so the web never tears from its corner.
        for (const [angle, radius] of [[tilt, rim], [tilt + fan, rim], [tilt + fan / 2, 0]] as const) {
          const {x, y} = moved(angle, radius, billow);
          assert.ok(Math.hypot(x, y) < 1e-6, 'a brisa solta a teia das bordas');
        }
        // Along the rings or in toward the hub, never outward toward the content area.
        for (const angle of across) {
          for (const radius of [rim * 0.5, rim]) {
            const {x, y} = moved(angle, radius, billow);
            assert.ok(x * Math.cos(angle) + y * Math.sin(angle) <= 1e-9, 'a brisa empurra a teia para fora');
          }
        }
      }
      // From calm to gust, every web's rim travels downwind: one breeze, not four webs twisting apart.
      const drift = across.reduce((sum, angle) => {
        const [calm, gust] = [moved(angle, rim, -0.56), moved(angle, rim, 1)];
        return sum + ((gust.x - calm.x) * downwind.x + (gust.y - calm.y) * downwind.y) / across.length;
      }, 0);
      assert.ok(drift > 4, `seed ${seed}: a teia em x ${web.x} precisa ir a favor do vento, andou ${drift.toFixed(1)} px`);
    }
  }
  // The sheet eases through every turn of the wind, so a drop riding it never jolts; a plain
  // |wind| in the pull toward the hub would kink each time the gust dies and turns.
  const props = cobwebLoopSchema.parse({});
  const dew = Array.from({length: 722}, (_, frame) => getCobwebScene(props, frame - 1, 720).filter(({kind}) => kind === 'dew'));
  for (let frame = 1; frame <= 720; frame++) {
    dew[frame]!.forEach((drop, index) => {
      const [before, after] = [dew[frame - 1]![index]!, dew[frame + 1]![index]!];
      const jolt = Math.hypot(after.x - 2 * drop.x + before.x, after.y - 2 * drop.y + before.y);
      assert.ok(jolt < 0.05, `a gota ${index} dá um tranco de ${jolt.toFixed(3)} px no frame ${frame - 1}`);
    });
  }
});

test('Teias: uma faixa de luar atravessa cada teia e acende o orvalho quando passa', () => {
  const props = cobwebLoopSchema.parse({dewIntensity: 1});
  const frames = Array.from({length: 180}, (_, step) => getCobwebScene(props, step * 4, 720));
  const webs = frames[0]!.filter(({kind}) => kind === 'web');
  // The band sweeps the whole fan and a little past both edges.
  webs.forEach((_, index) => {
    const glint = frames.map((scene) => scene.filter(({kind}) => kind === 'web')[index]!.glint);
    assert.ok(Math.min(...glint) < 0 && Math.max(...glint) > 1, `a faixa de luar precisa atravessar a teia ${index}`);
  });
  const flashes = frames[0]!.filter(({kind}) => kind === 'dew').map(() => [] as number[]);
  for (const scene of frames) {
    const sceneWebs = scene.filter(({kind}) => kind === 'web');
    scene.filter(({kind}) => kind === 'dew').forEach((drop, index) => {
      flashes[index]!.push(drop.glow);
      // Between passes a drop keeps half its sparkle; it never goes out.
      assert.ok(drop.opacity >= 0.5 - 1e-9, 'o orvalho precisa manter o brilho entre as passagens');
      if (drop.glow < 0.5) return;
      // A drop flashes only where the band is: its place across the fan, on the band's own
      // scale, sits within the per-drop nudge and the flash's half-width of the band.
      const web = sceneWebs.find((candidate) => candidate.geometry!.nodes.some((node) => {
        const at = nodeInFrame(candidate, node);
        return Math.abs(at.x - drop.x) < 0.01 && Math.abs(at.y - drop.y) < 0.01;
      }))!;
      const {tilt, spread: fan} = web.geometry!;
      const radians = web.rotation * TAU / 360;
      const local = Math.atan2(drop.y - web.y, drop.x - web.x) - radians - tilt;
      const across = (local - TAU * Math.round(local / TAU)) / fan;
      assert.ok(Math.abs(across - web.glint) < 0.3, `gota acesa em ${across.toFixed(2)} com a faixa em ${web.glint.toFixed(2)}`);
    });
  }
  // Every drop is crossed and flashes in full, then rests between passes.
  flashes.forEach((glow, index) => {
    assert.ok(Math.max(...glow) > 0.9 && Math.min(...glow) < 0.05, `a gota ${index} precisa brilhar quando a faixa passa`);
  });
});

test('Teias: os fios pendem de nós fixos, espaçados, e só a ponta balança', () => {
  for (const seed of [1, 7, 47, 99, -2026, 2026]) {
    const props = cobwebLoopSchema.parse({seed});
    const strandsAt = (frame: number) => getCobwebScene(props, frame, 720).filter(({kind}) => kind === 'strand');
    const rest = strandsAt(0);
    // Two knots side by side read as one doubled thread, and a spider's line, from the full
    // list, counts as one more knot.
    const knots = rest.map(({x}) => x).sort((a, b) => a - b);
    knots.slice(1).forEach((x, index) => assert.ok(x - knots[index]! > 46, `seed ${seed}: dois fios presos a ${(x - knots[index]!).toFixed(0)} px`));
    for (const x of knots) {
      for (const spider of SPIDER_ANCHORS) {
        assert.ok(Math.abs(x - spider.x) > 46, `seed ${seed}: fio preso a ${Math.abs(x - spider.x).toFixed(0)} px da linha da aranha em ${spider.x}`);
      }
    }
    for (let frame = 0; frame < 720; frame += 15) {
      strandsAt(frame).forEach((strand, index) => {
        // The knot never slides along the top edge, and the bow never switches sides mid-swing.
        assert.equal(strand.x, rest[index]!.x, `seed ${seed}: o nó do fio ${index} escorrega`);
        assert.equal(strand.y, STRAND.knotY, `seed ${seed}: o nó do fio ${index} sobe ou desce`);
        assert.equal(Math.sign(strand.bend), Math.sign(rest[index]!.bend), `seed ${seed}: o fio ${index} troca de lado`);
      });
    }
  }
  // A crowded top edge still keeps the knots apart, and the first strands never move.
  const crowded = getCobwebScene(cobwebLoopSchema.parse({strandCount: 24}), 0, 720).filter(({kind}) => kind === 'strand');
  const knots = crowded.map(({x}) => x).sort((a, b) => a - b);
  assert.ok(knots.slice(1).every((x, index) => x - knots[index]! > 20), 'fios amontoados com strandCount 24');
  assert.deepEqual(crowded.slice(0, 12).map(({x}) => x), getCobwebScene(cobwebLoopSchema.parse({}), 0, 720)
    .filter(({kind}) => kind === 'strand').map(({x}) => x));
});

test('Teias: nenhum fio solto passa por uma aranha nem acompanha a linha dela', () => {
  // Every spider, whatever spiderCount says: the strands never depend on it. 168 is the seed
  // whose strand ends closest to a spider's legs; the gust tilts strands toward a line
  // hardest at 190 (24 strands) and 38 (12).
  for (const seed of [1, 7, 38, 47, 99, 168, 190, -2026]) {
    for (const strandCount of [12, 24]) {
      const props = cobwebLoopSchema.parse({seed, strandCount, spiderCount: SPIDER_ANCHORS.length});
      for (let frame = 0; frame < 720; frame += 12) {
        const scene = getCobwebScene(props, frame, 720);
        const spiders = scene.filter(({kind}) => kind === 'spider');
        for (const strand of scene.filter(({kind}) => kind === 'strand')) {
          strandPoints(strand).forEach((point, index) => {
            // The bead at the end draws past the thread.
            const reach = index === 16 ? TIP_BEAD_REACH : 0;
            for (const spider of spiders) {
              const box = spiderBox(spider);
              assert.ok(point.x + reach < box.left || point.x - reach > box.right || point.y + reach < box.top || point.y - reach > box.bottom,
                `seed ${seed}: o fio em x ${strand.x.toFixed(0)} passa pela aranha em x ${spider.x.toFixed(0)} no frame ${frame}`);
              // The line runs straight from its knot to the spider; a strand along it reads as
              // one doubled line. A crowded top edge may bring a strand closer, never onto it.
              const along = (point.y - SPIDER_ANCHOR_Y) / (spider.y - SPIDER_ANCHOR_Y);
              if (along < 0 || along > 1) continue;
              const line = spider.anchorX + (spider.x - spider.anchorX) * along;
              assert.ok(Math.abs(point.x - line) > (strandCount === 12 ? 16 : 2),
                `seed ${seed}: o fio em x ${strand.x.toFixed(0)} encosta na linha da aranha em ${spider.anchorX} no frame ${frame}`);
            }
          });
        }
      }
    }
  }
});

test('Teias: a poeira tem profundidade e só renasce enquanto está invisível', () => {
  const props = cobwebLoopSchema.parse({moteCount: 120});
  const frames = Array.from({length: 721}, (_, frame) => getCobwebScene(props, frame, 720).filter(({kind}) => kind === 'mote'));
  const sizes: number[] = [];
  const travels: number[] = [];
  frames[0]!.forEach((mote, index) => {
    for (let frame = 0; frame < 720; frame++) {
      const [now, next] = [frames[frame]![index]!, frames[frame + 1]![index]!];
      // A mote that drops back to the bottom of its climb does so while it is invisible.
      if (Math.hypot(next.x - now.x, next.y - now.y) > 20) {
        assert.ok(Math.max(now.opacity, next.opacity) < 0.001, `a poeira ${index} salta visível no frame ${frame}`);
      }
    }
    sizes.push(mote.scale);
    travels.push(spread(frames.map((scene) => scene[index]!.x)));
  });
  // Parallax: a nearer, bigger mote wanders further, so the dust never drifts as one flat sheet.
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const [sizeMean, travelMean] = [mean(sizes), mean(travels)];
  const covariance = mean(sizes.map((size, index) => (size - sizeMean) * (travels[index]! - travelMean)));
  const correlation = covariance / Math.sqrt(mean(sizes.map((size) => (size - sizeMean) ** 2)) * mean(travels.map((travel) => (travel - travelMean) ** 2)));
  assert.ok(correlation > 0.8, `o tamanho da poeira não acompanha o deslocamento: correlação ${correlation.toFixed(2)}`);
});

test('Teias: cada camada continua se movendo ao longo do ciclo', () => {
  const props = cobwebLoopSchema.parse({});
  const frames = Array.from({length: 40}, (_, index) => index * 18);
  const first = (kind: CobwebElement['kind'], frame: number) => getCobwebScene(props, frame, 720).filter((e) => e.kind === kind)[0]!;
  const track = (kind: CobwebElement['kind'], key: keyof CobwebElement) => spread(frames.map((frame) => first(kind, frame)[key] as number));

  assert.ok(track('web', 'rotation') > 0.5, 'a teia precisa balançar');
  assert.ok(track('web', 'billow') > 0.5, 'a brisa precisa ondular a teia');
  assert.ok(track('web', 'scale') > 0.004, 'a teia precisa respirar');
  assert.ok(track('web', 'glow') > 0.3, 'o luar precisa pulsar na seda');
  assert.ok(track('dew', 'opacity') > 0.15, 'o orvalho precisa cintilar');
  // The knot stays put, so the swing shows at the free end.
  assert.ok(spread(frames.map((frame) => strandTip(first('strand', frame)).x)) > 10 && track('strand', 'rotation') > 1, 'o fio precisa oscilar');
  assert.ok(track('spider', 'y') > 40 && track('spider', 'curl') > 0.15, 'a aranha precisa subir, descer e articular');
  assert.ok(track('mote', 'x') > 5 && track('mote', 'y') > 5, 'a poeira precisa flutuar');
  assert.ok(track('mist', 'x') > 50, 'a névoa precisa arrastar');
});

test('Teias: orvalho e névoa desaparecem nos mínimos e reaparecem nos máximos', () => {
  for (const frame of [0, 180, 360, 719]) {
    const dry = getCobwebScene(cobwebLoopSchema.parse({dewIntensity: 0, mistIntensity: 0}), frame, 720);
    assert.ok(dry.filter(({kind}) => kind === 'dew').every(({opacity}) => opacity === 0));
    assert.ok(dry.filter(({kind}) => kind === 'mist').every(({opacity}) => opacity === 0));

    const wet = getCobwebScene(cobwebLoopSchema.parse({dewIntensity: 1, mistIntensity: 1}), frame, 720);
    assert.ok(wet.filter(({kind}) => kind === 'dew').every(({opacity}) => opacity > 0 && opacity <= 1));
    assert.ok(wet.filter(({kind}) => kind === 'mist').some(({opacity}) => opacity > 0));
  }
});

test('Teias: calcular frames não altera os parâmetros nem resultados anteriores', () => {
  const props = cobwebLoopSchema.parse({seed: -2026, webCount: 4, strandCount: 24, moteCount: 120, spiderCount: 3});
  const originalProps = structuredClone(props);
  const firstScene = getCobwebScene(props, 173, 720);
  const originalScene = structuredClone(firstScene);
  getCobwebScene(props, 600, 720);
  getCobwebScene(cobwebLoopSchema.parse({seed: 19}), 173, 720);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(firstScene, originalScene);
  assert.deepEqual(getCobwebScene(props, 173, 720), originalScene);
});

test('Teias: mudar uma contagem não reorganiza as outras camadas', () => {
  const base = getCobwebScene(cobwebLoopSchema.parse({}), 173, 720);
  const pick = (scene: CobwebElement[], kind: CobwebElement['kind']) => scene.filter((element) => element.kind === kind);
  for (const [changed, untouched] of [
    [{moteCount: 120}, ['strand', 'web', 'dew', 'spider', 'mist']],
    [{strandCount: 24}, ['mote', 'web', 'dew', 'spider', 'mist']],
    [{spiderCount: 3}, ['mote', 'strand', 'web', 'dew', 'mist']],
  ] as const) {
    const scene = getCobwebScene(cobwebLoopSchema.parse(changed), 173, 720);
    for (const kind of untouched) {
      assert.deepEqual(pick(scene, kind), pick(base, kind), `${Object.keys(changed)[0]} mexeu em ${kind}`);
    }
  }
});

test('Teias: o export mantém a regra de alpha e a duração compartilhadas com o preview', () => {
  for (const format of ['mp4', 'webm', 'gif'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'CobwebLoop', format, props: {transparent}});
      const metadata = getCompositionMetadata(resolved.props);
      assert.equal(resolved.props.backgroundColor, '#100B1B');
      assert.equal(resolved.props.durationSeconds, 12);
      assert.equal(metadata.durationInFrames, format === 'gif' ? 600 : 720);
      assert.equal(hasTransparentBackground(resolved.props), format === 'webm' && transparent);
      if (format === 'webm') {
        assert.equal(resolved.preset.codec, 'vp9');
        assert.equal('pixelFormat' in resolved.preset && resolved.preset.pixelFormat, transparent ? 'yuva420p' : 'yuv420p');
      }
    }
  }
});
