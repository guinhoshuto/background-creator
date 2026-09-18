import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveExport} from '../scripts/export';
import {getCobwebScene, cobwebLoopSchema, type CobwebElement} from '../src/backgrounds/CobwebLoop';
import {TAU} from '../src/loop';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

const KINDS = ['web', 'dew', 'strand', 'spider', 'mote', 'mist'] as const;

const countsOf = (scene: CobwebElement[]) =>
  Object.fromEntries(KINDS.map((kind) => [kind, scene.filter((element) => element.kind === kind).length]));

/** The anchor every hanging spider keeps above the frame. */
const SPIDER_ANCHOR_Y = -30;

/** Where the component actually puts a strand's bead: the far, low end of the filament. */
const strandTip = ({x, y, scale, rotation}: CobwebElement) => {
  const radians = rotation * TAU / 360;
  return {
    x: x + 26 * scale * 0.4 * Math.cos(radians) - 210 * scale * Math.sin(radians),
    y: y + 26 * scale * 0.4 * Math.sin(radians) + 210 * scale * Math.cos(radians),
  };
};

/** Every node of every web, in frame coordinates, exactly as the dew layer places a drop. */
const silkNodes = (scene: CobwebElement[]) =>
  scene.filter(({kind}) => kind === 'web').flatMap((web) => {
    const radians = web.rotation * TAU / 360;
    return (web.geometry?.nodes ?? []).map((node) => ({
      x: web.x + node.x * web.scale * Math.cos(radians) - node.y * web.scale * Math.sin(radians),
      y: web.y + node.x * web.scale * Math.sin(radians) + node.y * web.scale * Math.cos(radians),
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
  const dewPerWebCount = [0, 17, 28, 36, 44];
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
        for (const key of ['x', 'y', 'scale', 'rotation', 'opacity', 'glow', 'curl', 'thread', 'anchorX'] as const) {
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
      assert.ok(geometry.spokes.length >= 8 && geometry.spokes.length <= 11);
      assert.ok(geometry.rings.length >= 6 && geometry.rings.length <= 8);
      assert.ok(geometry.sheen > 0);
      assert.ok(geometry.nodes.length >= 8, 'a teia precisa de nós para o orvalho');

      // Drawable content, not just a well-formed string: a torn web must still be a web.
      assert.ok(geometry.spokes.every(({d}) => d.startsWith('M0 0 Q')), 'raio sem conteúdo');
      assert.equal(geometry.spokes.filter(({frame}) => frame).length, 3, 'a teia precisa de três fios-moldura');
      assert.ok(geometry.loose.startsWith('M'), 'fio rompido sem conteúdo');
      // The rim caps every radial; a gap there, or a radial that overshoots it, leaves
      // a thread ending in open canvas.
      const rim = geometry.rings[geometry.rings.length - 1]!;
      assert.equal((rim.d.match(/M/g) ?? []).length, geometry.spokes.length - 1, 'o aro externo não pode ter falhas');
      const rimRadius = startRadius(rim.d);
      for (const {d} of geometry.spokes) {
        assert.ok(Math.abs(endRadius(d) - rimRadius) < 1, `raio termina em ${endRadius(d).toFixed(1)}, aro em ${rimRadius.toFixed(1)}`);
      }
      assert.ok(Math.abs(startRadius(geometry.loose) - rimRadius) < 1, 'o fio rompido precisa nascer no aro');

      const segments = geometry.rings.reduce((sum, {d}) => sum + (d.match(/M/g) ?? []).length, 0);
      const possible = geometry.rings.length * (geometry.spokes.length - 1);
      assert.ok(segments > possible * 0.7, `poucos segmentos de anel: ${segments}/${possible}`);
      assert.ok(geometry.rings.filter(({d}) => d !== '').length >= geometry.rings.length - 1);

      for (const path of [...geometry.spokes.map(({d}) => d), ...geometry.rings.map(({d}) => d), geometry.loose]) {
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
  for (const webCount of [1, 2, 3, 4]) {
    const props = cobwebLoopSchema.parse({webCount, strandCount: 24, moteCount: 120, spiderCount: 3, dewIntensity: 1});
    for (let frame = 0; frame < 720; frame += 24) {
      const scene = getCobwebScene(props, frame, 720);
      const points = [
        ...silkNodes(scene),
        ...scene.filter(({kind}) => kind === 'dew' || kind === 'spider').map(({x, y}) => ({x, y})),
        ...scene.filter(({kind}) => kind === 'strand').flatMap((strand) => [{x: strand.x, y: strand.y}, strandTip(strand)]),
      ];
      for (const {x, y} of points) {
        assert.ok(Math.abs(x - 960) > 480 || Math.abs(y - 540) > 270, `elemento em (${x.toFixed(0)}, ${y.toFixed(0)}) invade o centro`);
      }
    }
  }
});

test('Teias: cada camada continua se movendo ao longo do ciclo', () => {
  const props = cobwebLoopSchema.parse({});
  const frames = Array.from({length: 40}, (_, index) => index * 18);
  const track = (kind: CobwebElement['kind'], key: keyof CobwebElement) =>
    spread(frames.map((frame) => getCobwebScene(props, frame, 720).filter((e) => e.kind === kind)[0]![key] as number));

  assert.ok(track('web', 'rotation') > 0.5, 'a teia precisa balançar');
  assert.ok(track('web', 'scale') > 0.004, 'a teia precisa respirar');
  assert.ok(track('web', 'glow') > 0.3, 'o luar precisa correr pela seda');
  assert.ok(track('dew', 'opacity') > 0.15, 'o orvalho precisa cintilar');
  assert.ok(track('strand', 'x') > 10 && track('strand', 'rotation') > 1, 'o fio precisa oscilar');
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
