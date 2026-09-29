import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {resolveExport} from '../scripts/export';
import {
  DIRECTION_VECTORS, DOT_DIRECTIONS, DOT_LAYOUTS, HEIGHT, MAX_FRAME_SHARE, WIDTH, dotGridLoopSchema, getDotGridScene,
  getDotTravel, getFrameShare, type DotElement, type DotGridLoopProps,
} from '../src/backgrounds/DotGridLoop';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

const PRESETS = ['dots-classic.json', 'dots-alternating.json', 'dots-alpha.json'];

/** What each direction means on screen, written out here so the table in the code is checked, not copied. */
const SCREEN_SIGNS: Record<string, [number, number]> = {
  right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1],
  'up-right': [1, -1], 'up-left': [-1, -1], 'down-right': [1, 1], 'down-left': [-1, 1],
};

/** Where the eye sees a dot go between two frames: to the nearest dot of the next frame. */
const seenStep = (props: DotGridLoopProps, frame: number, length: number) => {
  const nearest = (dots: DotElement[], x: number, y: number) =>
    dots.reduce((best, dot) => (Math.hypot(dot.x - x, dot.y - y) < Math.hypot(best.x - x, best.y - y) ? dot : best));
  const from = nearest(getDotGridScene(props, frame, length), WIDTH / 2, HEIGHT / 2);
  const to = nearest(getDotGridScene(props, frame + 1, length), from.x, from.y);
  return {x: to.x - from.x, y: to.y - from.y};
};

/** One frame of travel, as the code intends it. */
const frameTravel = (props: DotGridLoopProps, length: number) => {
  const {cells, cell} = getDotTravel(props);
  return {x: (cells.x * cell.x) / length, y: (cells.y * cell.y) / length};
};

/** Whether a dot's disc reaches into the frame. */
const reachesFrame = ({x, y, radius}: DotElement) => x + radius > 0 && x - radius < WIDTH && y + radius > 0 && y - radius < HEIGHT;

/** Every dot of `from` that shows in the frame has a twin in `to`, within float noise. */
const assertCovered = (from: DotElement[], to: DotElement[], message: string) => {
  // Dots stand at least 16 px apart, so a 1 px bucket holds at most one of them.
  const buckets = new Map<string, DotElement[]>();
  for (const dot of to) {
    const key = `${Math.round(dot.x)},${Math.round(dot.y)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), dot]);
  }
  for (const dot of from.filter(reachesFrame)) {
    const twin = [-1, 0, 1].some((a) => [-1, 0, 1].some((b) =>
      (buckets.get(`${Math.round(dot.x) + a},${Math.round(dot.y) + b}`) ?? [])
        .some((other) => Math.abs(other.x - dot.x) < 1e-6 && Math.abs(other.y - dot.y) < 1e-6)));
    assert.ok(twin, `${message}: ponto em (${dot.x}, ${dot.y}) sem par`);
  }
};

/** The frame after `frame` shows this frame moved by one frame of travel, dot for dot. */
const assertSteadyStep = (props: DotGridLoopProps, frame: number, length: number) => {
  const {x: dx, y: dy} = frameTravel(props, length);
  const moved = getDotGridScene(props, frame, length).map((dot) => ({...dot, x: dot.x + dx, y: dot.y + dy}));
  const next = getDotGridScene(props, frame + 1, length);
  const message = `${props.layout} ${props.direction}: o frame ${frame + 1} não é o frame ${frame} deslocado`;
  assertCovered(next, moved, message);
  assertCovered(moved, next, message);
};

/** Groups the listed dots into rows, top to bottom, each sorted left to right. */
const rowsOf = (dots: DotElement[]) => {
  const rows = new Map<string, DotElement[]>();
  for (const dot of dots) {
    const key = dot.y.toFixed(6);
    rows.set(key, [...(rows.get(key) ?? []), dot]);
  }
  return [...rows.values()].map((row) => row.sort((a, b) => a.x - b.x)).sort((a, b) => a[0]!.y - b[0]!.y);
};

test('Pontos: os valores iniciais descrevem oito segundos de grade diagonal', () => {
  const props = dotGridLoopSchema.parse({});
  assert.equal(props.durationSeconds, 8);
  assert.equal(props.seed, 1);
  assert.equal(props.backgroundColor, '#10162B');
  assert.equal(props.direction, 'down-right');
  assert.equal(props.layout, 'aligned');
  assert.equal(props.dotColor, '#7C8CFF');
  assert.equal(props.dotSize, 10);
  assert.equal(props.spacing, 48);
  assert.equal(props.speed, 24);
  assert.equal('colors' in props, false, 'a cor dos pontos vem de dotColor, não da paleta compartilhada');
  assert.deepEqual(getCompositionMetadata(props), {width: 1920, height: 1080, fps: 60, durationInFrames: 480});
});

test('Pontos: um ciclo percorre passos inteiros do padrão, no sentido pedido', () => {
  for (const layout of DOT_LAYOUTS) {
    for (const direction of DOT_DIRECTIONS) {
      for (const [speed, durationSeconds, spacing] of [[24, 8, 48], [1, 3.7, 16], [480, 12.25, 240], [37.5, 10, 61.3]]) {
        const props = dotGridLoopSchema.parse({layout, direction, speed, durationSeconds, spacing});
        const travel = getDotTravel(props);
        const [ux, uy] = DIRECTION_VECTORS[direction];
        assert.ok(travel.steps >= 1, `${layout} ${direction}: movimento pedido precisa de ao menos um passo`);
        assert.ok(Number.isInteger(travel.cells.x) && Number.isInteger(travel.cells.y), 'células inteiras por ciclo');
        assert.equal(Math.sign(travel.cells.x), ux, `${layout} ${direction}: sentido horizontal`);
        assert.equal(Math.sign(travel.cells.y), uy, `${layout} ${direction}: sentido vertical`);
        // A diagonal moves the same distance on both axes: 45°, whatever the layout.
        if (ux !== 0 && uy !== 0) {
          assert.equal(Math.abs(travel.cells.x * travel.cell.x), Math.abs(travel.cells.y * travel.cell.y));
        }
        // The shown speed is the closest whole step to the requested one.
        if (travel.steps > 1) {
          const perStep = travel.stepLength / props.durationSeconds;
          assert.ok(Math.abs(travel.speed - speed) <= perStep / 2 + 1e-9, `${layout} ${direction}: ${travel.speed} contra ${speed}`);
        }
      }
    }
  }
  // Horizontal steps are one spacing in both layouts; the alternating rows need two to line up.
  const step = (layout: string, direction: string) => getDotTravel(dotGridLoopSchema.parse({layout, direction})).stepLength;
  assert.equal(step('aligned', 'right'), 48);
  assert.equal(step('alternating', 'left'), 48);
  assert.equal(step('aligned', 'down'), 48);
  assert.equal(step('alternating', 'up'), 96);
  assert.ok(Math.abs(step('aligned', 'down-right') - 48 * Math.SQRT2) < 1e-9);
  assert.ok(Math.abs(step('alternating', 'up-left') - 96 * Math.SQRT2) < 1e-9);
  // With the defaults: three diagonal steps in eight seconds, about 25.5 px/s for the 24 asked.
  const defaults = getDotTravel(dotGridLoopSchema.parse({}));
  assert.equal(defaults.steps, 3);
  assert.ok(Math.abs(defaults.speed - 25.456) < 1e-3);
  // A horizontal grid at 24 px/s over 8 s is exact: four spacings of 48 px.
  const exact = getDotTravel(dotGridLoopSchema.parse({direction: 'right'}));
  assert.equal(exact.steps, 4);
  assert.equal(exact.speed, 24);
});

test('Pontos: o padrão anda sempre à mesma velocidade, inclusive na emenda', () => {
  for (const layout of DOT_LAYOUTS) {
    for (const direction of DOT_DIRECTIONS) {
      const props = dotGridLoopSchema.parse({layout, direction, seed: 2026, speed: 60});
      // Consecutive frames, the wraps inside the cell and the step from the last frame to the first.
      for (const frame of [0, 1, 59, 137, 238, 239, 240, 353, 478, 479]) assertSteadyStep(props, frame, 480);
      assert.deepEqual(getDotGridScene(props, 480, 480), getDotGridScene(props, 0, 480));
    }
  }
  // Every frame of one cycle, so each wrap inside the cell is crossed at least once.
  const sweep = dotGridLoopSchema.parse({layout: 'alternating', direction: 'down-left', seed: 5, speed: 120});
  for (let frame = 0; frame < 480; frame++) assertSteadyStep(sweep, frame, 480);
  // The same holds for the 50 fps GIF cadence and a length that does not divide evenly.
  const gif = dotGridLoopSchema.parse({outputFormat: 'gif', durationSeconds: 3.7, direction: 'up-left', layout: 'alternating'});
  const {durationInFrames} = getCompositionMetadata(gif);
  for (const frame of [0, 91, durationInFrames - 1]) assertSteadyStep(gif, frame, durationInFrames);
});

test('Pontos: cada direção move o padrão para o lado que o nome diz, na tela', () => {
  for (const layout of DOT_LAYOUTS) {
    for (const direction of DOT_DIRECTIONS) {
      const props = dotGridLoopSchema.parse({layout, direction, speed: 60});
      const seen = seenStep(props, 100, 480);
      const [signX, signY] = SCREEN_SIGNS[direction]!;
      assert.equal(Math.sign(Math.round(seen.x * 1e6)), signX, `${layout} ${direction}: lado horizontal`);
      assert.equal(Math.sign(Math.round(seen.y * 1e6)), signY, `${layout} ${direction}: lado vertical`);
      if (signX !== 0 && signY !== 0) assert.ok(Math.abs(Math.abs(seen.x) - Math.abs(seen.y)) < 1e-9, `${direction}: 45°`);
    }
  }
  // The presets move the way the README describes them.
  const moves = Object.fromEntries(PRESETS.map((filename) => {
    const props = dotGridLoopSchema.parse(JSON.parse(readFileSync(new URL(`../presets/${filename}`, import.meta.url), 'utf8')));
    return [filename, seenStep(props, 10, getCompositionMetadata(props).durationInFrames)];
  }));
  assert.ok(moves['dots-classic.json']!.x > 0 && moves['dots-classic.json']!.y > 0, 'clássico: para baixo e para a direita');
  assert.ok(moves['dots-alternating.json']!.x < 0 && Math.abs(moves['dots-alternating.json']!.y) < 1e-9, 'alternados: para a esquerda');
  assert.ok(moves['dots-alpha.json']!.y < 0 && Math.abs(moves['dots-alpha.json']!.x) < 1e-9, 'alpha: subindo');
});

test('Pontos: velocidade alta demais para o espaçamento é recusada, nunca exibida ao contrário', () => {
  const basis = (layout: string, spacing: number) =>
    layout === 'alternating' ? [[spacing, 0], [spacing / 2, spacing]] : [[spacing, 0], [0, spacing]];
  let refused = 0;
  let accepted = 0;
  for (const layout of DOT_LAYOUTS) {
    for (const direction of DOT_DIRECTIONS) {
      for (const outputFormat of ['webm', 'gif'] as const) {
        for (const spacing of [16, 17, 18, 19, 20, 33.3, 240]) {
          for (const speed of [0, 1, 24, 200, 320, 384, 480]) {
            for (const durationSeconds of [0.03, 0.05, 0.1, 1, 8]) {
              const input = {layout, direction, outputFormat, spacing, speed, durationSeconds};
              const result = dotGridLoopSchema.strict().safeParse(input);
              const props = {...dotGridLoopSchema.parse({}), ...input} as DotGridLoopProps;
              const {durationInFrames} = getCompositionMetadata(props);
              const step = frameTravel(props, durationInFrames);
              // Brute force: the shortest move that shows the same next frame, over nearby lattice vectors.
              const [[ax, ay], [bx, by]] = basis(layout, spacing) as [[number, number], [number, number]];
              let shortest = Math.hypot(step.x, step.y);
              let aliased = false;
              for (let a = -3; a <= 3; a++) {
                for (let b = -3; b <= 3; b++) {
                  if (a === 0 && b === 0) continue;
                  const length = Math.hypot(step.x - a * ax - b * bx, step.y - a * ay - b * by);
                  if (length <= shortest + 1e-9) {aliased = true; shortest = length;}
                }
              }
              const name = JSON.stringify(input);
              if (aliased) assert.equal(result.success, false, `${name}: aliasing aceito`);
              if (result.success) {
                accepted++;
                assert.ok(getFrameShare(props, durationInFrames) <= MAX_FRAME_SHARE, name);
                continue;
              }
              refused++;
              const issue = result.error.issues[0]!;
              assert.deepEqual(issue.path, ['speed'], name);
              assert.match(issue.message, /seem to go backwards or flicker/, name);
              assert.match(issue.message, /of the way to the neighboring dot/, name);
              // The way out the message offers really is accepted, and just past it is not.
              const limit = /below (\d+) px\/s/.exec(issue.message);
              if (limit) {
                const below = Number(limit[1]) - 0.5;
                if (below > 0) assert.equal(dotGridLoopSchema.safeParse({...input, speed: below}).success, true, `${name}: ${below}`);
                const above = Number(limit[1]) + 1;
                if (above <= 480) assert.equal(dotGridLoopSchema.safeParse({...input, speed: above}).success, false, `${name}: ${above}`);
              } else {
                assert.match(issue.message, /Increase durationSeconds/, name);
              }
            }
          }
        }
      }
    }
  }
  assert.ok(refused > 0 && accepted > refused, `${accepted} aceitas, ${refused} recusadas`);
  // The fastest accepted setting at the tightest grid is still read in its own direction.
  for (const layout of DOT_LAYOUTS) {
    for (const direction of DOT_DIRECTIONS) {
      for (const outputFormat of ['webm', 'gif'] as const) {
        const fastest = [480, 440, 400, 384, 360, 320, 300].find((speed) =>
          dotGridLoopSchema.safeParse({layout, direction, outputFormat, spacing: 16, speed}).success)!;
        const props = dotGridLoopSchema.parse({layout, direction, outputFormat, spacing: 16, speed: fastest});
        const {durationInFrames} = getCompositionMetadata(props);
        const seen = seenStep(props, 7, durationInFrames);
        const meant = frameTravel(props, durationInFrames);
        assert.ok(Math.hypot(seen.x - meant.x, seen.y - meant.y) < 1e-6, `${layout} ${direction} ${outputFormat} a ${fastest} px/s`);
      }
    }
  }
});

test('Pontos: com velocidade zero o padrão fica parado', () => {
  for (const direction of DOT_DIRECTIONS) {
    const props = dotGridLoopSchema.parse({direction, speed: 0});
    assert.equal(getDotTravel(props).steps, 0);
    assert.equal(getDotTravel(props).speed, 0);
    for (const frame of [1, 240, 479]) assert.deepEqual(getDotGridScene(props, frame, 480), getDotGridScene(props, 0, 480));
  }
  // Any motion at all still closes the cycle: a crawl becomes one whole step.
  const crawl = getDotTravel(dotGridLoopSchema.parse({speed: 0.1, direction: 'right'}));
  assert.equal(crawl.steps, 1);
  assert.equal(crawl.speed, 6);
});

test('Pontos: a grade cobre o quadro inteiro, sem falhas nas bordas, em qualquer frame', () => {
  const extremes = [
    {},
    {dotSize: 1, spacing: 16},
    {dotSize: 96, spacing: 16, layout: 'alternating'},
    {dotSize: 96, spacing: 240, layout: 'alternating', direction: 'down-left', speed: 480},
    {dotSize: 30, spacing: 240, direction: 'up', speed: 3},
    {dotSize: 12, spacing: 61.3, layout: 'alternating', direction: 'up-right', seed: -7},
  ];
  for (const extreme of extremes) {
    const props = dotGridLoopSchema.parse(extreme);
    const radius = props.dotSize / 2;
    const count = getDotGridScene(props, 0, 480).length;
    for (const frame of [0, 1, 97, 173, 240, 331, 479]) {
      const dots = getDotGridScene(props, frame, 480);
      assert.equal(dots.length, count, 'a quantidade de lugares é fixa');
      const rows = rowsOf(dots);
      // The first and last places lie wholly outside the frame, so no dot is ever missing.
      assert.ok(rows[0]![0]!.y + radius < 0, `${JSON.stringify(extreme)} frame ${frame}: falta fileira em cima`);
      assert.ok(rows.at(-1)![0]!.y - radius >= HEIGHT, `${JSON.stringify(extreme)} frame ${frame}: falta fileira embaixo`);
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index]!;
        assert.ok(row[0]!.x + radius < 0, `fileira ${index}: falta ponto à esquerda`);
        assert.ok(row.at(-1)!.x - radius >= WIDTH, `fileira ${index}: falta ponto à direita`);
        for (let column = 1; column < row.length; column++) {
          assert.ok(Math.abs(row[column]!.x - row[column - 1]!.x - props.spacing) < 1e-9, 'passo irregular na fileira');
        }
        if (index === 0) continue;
        const previous = rows[index - 1]!;
        assert.ok(Math.abs(row[0]!.y - previous[0]!.y - props.spacing) < 1e-9, 'passo irregular entre fileiras');
        // Aligned rows stack; alternating rows sit half a step over from their neighbours.
        const offset = (((row[0]!.x - previous[0]!.x) % props.spacing) + props.spacing) % props.spacing;
        const expected = props.layout === 'alternating' ? props.spacing / 2 : 0;
        assert.ok(Math.min(Math.abs(offset - expected), props.spacing - Math.abs(offset - expected)) < 1e-9,
          `fileira ${index}: deslocamento ${offset}, esperado ${expected}`);
      }
      for (const dot of dots) {
        assert.equal(dot.radius, radius);
        assert.equal(dot.opacity, 1);
      }
    }
  }
});

test('Pontos: a seed só posiciona a grade, sem mudar espaçamento, tamanho ou velocidade', () => {
  const base = dotGridLoopSchema.parse({seed: 1});
  const other = dotGridLoopSchema.parse({seed: 99});
  assert.notDeepEqual(getDotGridScene(base, 0, 480), getDotGridScene(other, 0, 480));
  assert.deepEqual(getDotTravel(base), getDotTravel(other));
  const [first, second] = [base, other].map((props) => rowsOf(getDotGridScene(props, 0, 480)));
  assert.equal(first!.length, second!.length);
  assert.equal(first![0]!.length, second![0]!.length);
});

test('Pontos: calcular frames não altera os parâmetros nem resultados anteriores', () => {
  const props = dotGridLoopSchema.parse({seed: -2026, layout: 'alternating', direction: 'up-left'});
  const originalProps = structuredClone(props);
  const firstScene = getDotGridScene(props, 173, 480);
  const originalScene = structuredClone(firstScene);
  getDotGridScene(props, 451, 480);
  getDotGridScene(dotGridLoopSchema.parse({seed: 19}), 173, 480);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(firstScene, originalScene);
  assert.deepEqual(getDotGridScene(props, 173, 480), originalScene);
});

test('Pontos: os presets usam o mesmo schema e trazem direções e arranjos diferentes', () => {
  const variations = PRESETS.map((filename) => {
    const raw: unknown = JSON.parse(readFileSync(new URL(`../presets/${filename}`, import.meta.url), 'utf8'));
    return {filename, props: dotGridLoopSchema.strict().parse(raw)};
  });
  assert.equal(new Set(variations.map(({props}) => props.direction)).size, PRESETS.length);
  assert.deepEqual(new Set(variations.map(({props}) => props.layout)), new Set(DOT_LAYOUTS));
  for (const {filename, props} of variations) {
    const {durationInFrames} = getCompositionMetadata(props);
    assert.ok(getDotTravel(props).steps >= 1, `${filename}: o padrão precisa se mover`);
    assertSteadyStep(props, durationInFrames - 1, durationInFrames);
  }
});

test('Pontos: o export mantém a regra de alpha e a duração compartilhadas com o preview', () => {
  for (const format of ['mp4', 'webm', 'gif'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'DotGridLoop', format, props: {transparent}});
      const metadata = getCompositionMetadata(resolved.props);
      assert.equal(resolved.props.backgroundColor, '#10162B');
      assert.equal(resolved.props.durationSeconds, 8);
      assert.equal(metadata.durationInFrames, format === 'gif' ? 400 : 480);
      assert.equal(hasTransparentBackground(resolved.props), format === 'webm' && transparent);
    }
  }
  // The shared palette is not a control here; a stray `colors` key is a typo, not a no-op.
  assert.throws(() => resolveExport({compositionId: 'DotGridLoop', format: 'mp4', props: {colors: ['#FFFFFF', '#000000']}}));
});
