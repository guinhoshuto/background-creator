import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {resolveExport} from '../scripts/export';
import {
  CHECKER_DIRECTIONS, CheckerboardFrame, DIRECTION_VECTORS, HEIGHT, MAX_FRAME_SHARE, WIDTH, checkerboardLoopSchema,
  getCheckerboardScene, getCheckerTravel, getFrameShare, type CheckerSquare, type CheckerboardLoopProps,
} from '../src/backgrounds/CheckerboardLoop';
import {getCompositionMetadata, hasTransparentBackground} from '../src/settings';

const PRESETS = ['xadrez-classico.json', 'xadrez-losangos.json', 'xadrez-inclinado.json', 'xadrez-alpha.json'];
const RADIAN = Math.PI / 180;

/** What each direction means on the board, written out here so the table in the code is checked, not copied. */
const BOARD_SIGNS: Record<string, [number, number]> = {
  right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1],
  'up-right': [1, -1], 'up-left': [-1, -1], 'down-right': [1, 1], 'down-left': [-1, 1],
};

const readPreset = (filename: string): unknown =>
  JSON.parse(readFileSync(new URL(`../presets/${filename}`, import.meta.url), 'utf8'));

/** Board to screen: a positive tilt turns clockwise on screen, where y grows downwards. */
const turn = (x: number, y: number, angle: number) => ({
  x: x * Math.cos(angle * RADIAN) - y * Math.sin(angle * RADIAN),
  y: x * Math.sin(angle * RADIAN) + y * Math.cos(angle * RADIAN),
});

/** One frame of travel on screen, as the code intends it. */
const frameTravel = (props: CheckerboardLoopProps, length: number) => {
  const {distance} = getCheckerTravel(props);
  return turn(distance.x / length, distance.y / length, props.angle);
};

/** Whether any part of a square shows in the frame: separating axes of the frame and of the square. */
const reachesFrame = ({x, y, size, angle}: CheckerSquare) => {
  const half = size / 2;
  const cos = Math.cos(angle * RADIAN);
  const sin = Math.sin(angle * RADIAN);
  const extent = half * (Math.abs(cos) + Math.abs(sin));
  if (x + extent <= 0 || x - extent >= WIDTH || y + extent <= 0 || y - extent >= HEIGHT) return false;
  const corners = [[0, 0], [WIDTH, 0], [WIDTH, HEIGHT], [0, HEIGHT]] as const;
  for (const [ux, uy] of [[cos, sin], [-sin, cos]] as const) {
    const projections = corners.map(([cx, cy]) => (cx - x) * ux + (cy - y) * uy);
    if (Math.min(...projections) >= half || Math.max(...projections) <= -half) return false;
  }
  return true;
};

/** Every square of `from` that shows in the frame has a twin in `to`, within float noise. */
const assertCovered = (from: CheckerSquare[], to: CheckerSquare[], message: string) => {
  // Centres of one colour stand at least 16 × √2 px apart, so a 1 px bucket holds at most one.
  const buckets = new Map<string, CheckerSquare[]>();
  for (const square of to) {
    const key = `${Math.round(square.x)},${Math.round(square.y)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), square]);
  }
  for (const square of from.filter(reachesFrame)) {
    const twin = [-1, 0, 1].some((a) => [-1, 0, 1].some((b) =>
      (buckets.get(`${Math.round(square.x) + a},${Math.round(square.y) + b}`) ?? [])
        .some((other) => Math.abs(other.x - square.x) < 1e-6 && Math.abs(other.y - square.y) < 1e-6)));
    assert.ok(twin, `${message}: quadrado em (${square.x}, ${square.y}) sem par`);
  }
};

/** The frame after `frame` shows this frame moved by one frame of travel, square for square. */
const assertSteadyStep = (props: CheckerboardLoopProps, frame: number, length: number) => {
  const {x: dx, y: dy} = frameTravel(props, length);
  const moved = getCheckerboardScene(props, frame, length).map((square) => ({...square, x: square.x + dx, y: square.y + dy}));
  const next = getCheckerboardScene(props, frame + 1, length);
  const message = `${props.direction} a ${props.angle}°: o frame ${frame + 1} não é o frame ${frame} deslocado`;
  assertCovered(next, moved, message);
  assertCovered(moved, next, message);
};

/** Where the eye sees a square go between two frames: to the nearest square of its colour in the next frame. */
const seenStep = (props: CheckerboardLoopProps, frame: number, length: number) => {
  const nearest = (squares: CheckerSquare[], x: number, y: number) => squares.reduce((best, square) =>
    (Math.hypot(square.x - x, square.y - y) < Math.hypot(best.x - x, best.y - y) ? square : best));
  const from = nearest(getCheckerboardScene(props, frame, length), WIDTH / 2, HEIGHT / 2);
  const to = nearest(getCheckerboardScene(props, frame + 1, length), from.x, from.y);
  return {x: to.x - from.x, y: to.y - from.y};
};

type Point = {x: number; y: number};

/** Finds the shapes near a point: `centre` must lie within one square of everything the shape covers. */
const bucketed = <Shape,>(shapes: Shape[], centre: (shape: Shape) => Point, size: number) => {
  const buckets = new Map<string, Shape[]>();
  for (const shape of shapes) {
    const {x, y} = centre(shape);
    const key = `${Math.floor(x / size)},${Math.floor(y / size)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), shape]);
  }
  return (x: number, y: number) => [-1, 0, 1].flatMap((a) => [-1, 0, 1].flatMap((b) =>
    buckets.get(`${Math.floor(x / size) + a},${Math.floor(y / size) + b}`) ?? []));
};

/** Whether a point lies in a listed square, rebuilt from its centre, side and tilt. */
const insideScene = (squares: CheckerSquare[]) => {
  const near = bucketed(squares, (square) => square, squares[0]!.size);
  return (x: number, y: number) => near(x, y).some((square) => {
    const cos = Math.cos(square.angle * RADIAN);
    const sin = Math.sin(square.angle * RADIAN);
    return Math.abs((x - square.x) * cos + (y - square.y) * sin) < square.size / 2 &&
      Math.abs(-(x - square.x) * sin + (y - square.y) * cos) < square.size / 2;
  });
};

/** Whether a point lies in one of the drawn polygons: an even-odd crossing count. */
const insidePolygons = (polygons: Point[][], size: number) => {
  const centre = (polygon: Point[]) => ({
    x: polygon.reduce((sum, {x}) => sum + x, 0) / polygon.length,
    y: polygon.reduce((sum, {y}) => sum + y, 0) / polygon.length,
  });
  const near = bucketed(polygons, centre, size);
  return (x: number, y: number) => near(x, y).some((polygon) => {
    let crossings = 0;
    for (let index = 0; index < polygon.length; index++) {
      const from = polygon[index]!;
      const to = polygon[(index + 1) % polygon.length]!;
      if ((from.y > y) !== (to.y > y) && x < from.x + ((y - from.y) * (to.x - from.x)) / (to.y - from.y)) crossings++;
    }
    return crossings % 2 === 1;
  });
};

/**
 * Samples the frame, edges and corners included, and checks that `inside` holds for a point
 * exactly when a true checkerboard, anchored on the first listed square, colours it.
 */
const assertBoard = (
  props: CheckerboardLoopProps,
  squares: CheckerSquare[],
  message: string,
  inside: (x: number, y: number) => boolean = insideScene(squares),
) => {
  const size = props.squareSize;
  const cos = Math.cos(props.angle * RADIAN);
  const sin = Math.sin(props.angle * RADIAN);
  const toBoard = (x: number, y: number) => ({
    x: (x - WIDTH / 2) * cos + (y - HEIGHT / 2) * sin,
    y: -(x - WIDTH / 2) * sin + (y - HEIGHT / 2) * cos,
  });
  const anchor = toBoard(squares[0]!.x, squares[0]!.y);
  const samples = [0, 0.25, WIDTH - 0.25, WIDTH].flatMap((x) => [0, 0.25, HEIGHT - 0.25, HEIGHT].map((y) => [x, y]));
  for (let x = 3.5; x < WIDTH; x += 23) {
    for (let y = 1.5; y < HEIGHT; y += 19) samples.push([x, y]);
  }
  for (const [x, y] of samples as [number, number][]) {
    const board = toBoard(x, y);
    const column = (board.x - anchor.x) / size + 0.5;
    const row = (board.y - anchor.y) / size + 0.5;
    // A point right on a border belongs to neither side, within the drawn path's rounding.
    if (Math.min(column - Math.floor(column), Math.ceil(column) - column) * size < 2e-3) continue;
    if (Math.min(row - Math.floor(row), Math.ceil(row) - row) * size < 2e-3) continue;
    const coloured = (Math.floor(column) + Math.floor(row)) % 2 === 0;
    assert.equal(inside(x, y), coloured, `${message}: (${x}, ${y}) deveria ser ${coloured ? 'quadrado' : 'fundo'}`);
  }
};

/** What the component draws on one frame: the path's fill and each subpath's corners. */
const drawnBoard = (props: CheckerboardLoopProps, frame: number, durationInFrames: number) => {
  const markup = renderToStaticMarkup(createElement(CheckerboardFrame, {props, frame, durationInFrames}));
  const paths = [...markup.matchAll(/<path d="([^"]*)" fill="([^"]*)"/g)];
  assert.equal(paths.length, 1, 'o tabuleiro inteiro é um único path');
  const polygons = paths[0]![1]!.split('Z').filter(Boolean).map((subpath) => {
    assert.match(subpath, /^M[^ML]+L[^ML]+L[^ML]+L[^ML]+$/, 'cada quadrado é um contorno fechado de quatro cantos');
    return subpath.slice(1).split('L').map((corner) => {
      const [x, y] = corner.split(' ').map(Number);
      return {x: x!, y: y!};
    });
  });
  return {markup, fill: paths[0]![2]!, polygons};
};

test('Xadrez: os valores iniciais descrevem oito segundos de tabuleiro diagonal', () => {
  const props = checkerboardLoopSchema.parse({});
  assert.equal(props.durationSeconds, 8);
  assert.equal(props.seed, 1);
  assert.equal(props.backgroundColor, '#141A33');
  assert.equal(props.direction, 'down-right');
  assert.equal(props.angle, 0);
  assert.equal(props.squareColor, '#222C57');
  assert.equal(props.squareSize, 80);
  assert.equal(props.speed, 40);
  assert.equal('colors' in props, false, 'as cores vêm de squareColor e backgroundColor, não da paleta compartilhada');
  assert.deepEqual(getCompositionMetadata(props), {width: 1920, height: 1080, fps: 60, durationInFrames: 480});
});

test('Xadrez: um ciclo percorre passos inteiros do tabuleiro, no sentido pedido', () => {
  for (const direction of CHECKER_DIRECTIONS) {
    for (const [speed, durationSeconds, squareSize] of [[40, 8, 80], [1, 3.7, 16], [960, 12.25, 480], [37.5, 10, 61.3]]) {
      const props = checkerboardLoopSchema.parse({direction, speed, durationSeconds, squareSize});
      const travel = getCheckerTravel(props);
      const [ux, uy] = DIRECTION_VECTORS[direction];
      assert.deepEqual([ux, uy], BOARD_SIGNS[direction], `${direction}: vetor da tabela`);
      assert.ok(travel.steps >= 1, `${direction}: movimento pedido precisa de ao menos um passo`);
      assert.ok(Number.isInteger(travel.lattice.a) && Number.isInteger(travel.lattice.b), 'diagonais inteiras por ciclo');
      // The distance is the one the lattice counts: a = (s, s) and b = (s, −s).
      assert.ok(Math.abs(travel.distance.x - squareSize * (travel.lattice.a + travel.lattice.b)) < 1e-9);
      assert.ok(Math.abs(travel.distance.y - squareSize * (travel.lattice.a - travel.lattice.b)) < 1e-9);
      assert.equal(Math.sign(travel.distance.x), ux, `${direction}: sentido horizontal`);
      assert.equal(Math.sign(travel.distance.y), uy, `${direction}: sentido vertical`);
      // A diagonal moves the same distance on both axes: 45° on the board.
      if (ux !== 0 && uy !== 0) assert.equal(Math.abs(travel.distance.x), Math.abs(travel.distance.y));
      // The shown speed is the closest whole step to the requested one.
      if (travel.steps > 1) {
        const perStep = travel.stepLength / props.durationSeconds;
        assert.ok(Math.abs(travel.speed - speed) <= perStep / 2 + 1e-9, `${direction}: ${travel.speed} contra ${speed}`);
      }
    }
  }
  // Along a row or a column the next square is the other colour: a step is two squares.
  const step = (direction: string) => getCheckerTravel(checkerboardLoopSchema.parse({direction})).stepLength;
  assert.equal(step('right'), 160);
  assert.equal(step('up'), 160);
  assert.ok(Math.abs(step('down-right') - 80 * Math.SQRT2) < 1e-9);
  assert.ok(Math.abs(step('up-left') - 80 * Math.SQRT2) < 1e-9);
  // With the defaults: three diagonal steps in eight seconds, about 42.4 px/s for the 40 asked.
  const defaults = getCheckerTravel(checkerboardLoopSchema.parse({}));
  assert.equal(defaults.steps, 3);
  assert.ok(Math.abs(defaults.speed - 42.426) < 1e-3);
  // A single diagonal step closes the cycle, even though a row-by-row board would not line up.
  assert.equal(getCheckerTravel(checkerboardLoopSchema.parse({speed: 14})).steps, 1);
  // Horizontally the same values are exact: two steps of 160 px.
  const exact = getCheckerTravel(checkerboardLoopSchema.parse({direction: 'right'}));
  assert.equal(exact.steps, 2);
  assert.equal(exact.speed, 40);
});

test('Xadrez: o tabuleiro anda sempre à mesma velocidade, inclusive na emenda', () => {
  for (const angle of [0, 45, -45, 17.5]) {
    for (const direction of CHECKER_DIRECTIONS) {
      const props = checkerboardLoopSchema.parse({direction, angle, seed: 2026, speed: 90, squareSize: 64});
      // Consecutive frames, the wraps inside the cell and the step from the last frame to the first.
      for (const frame of [0, 1, 59, 137, 238, 239, 240, 353, 478, 479]) assertSteadyStep(props, frame, 480);
      assert.deepEqual(getCheckerboardScene(props, 480, 480), getCheckerboardScene(props, 0, 480));
    }
  }
  // Every frame of one cycle, so each wrap inside the cell is crossed at least once, and one
  // odd diagonal step, which ends the cycle a single square away.
  const sweep = checkerboardLoopSchema.parse({direction: 'down-left', angle: -30, seed: 5, speed: 240, squareSize: 48});
  for (let frame = 0; frame < 480; frame++) assertSteadyStep(sweep, frame, 480);
  const single = checkerboardLoopSchema.parse({direction: 'up-right', speed: 14});
  assert.equal(getCheckerTravel(single).steps, 1);
  for (const frame of [0, 239, 479]) assertSteadyStep(single, frame, 480);
  // The same holds for the 50 fps GIF cadence and a length that does not divide evenly.
  const gif = checkerboardLoopSchema.parse({outputFormat: 'gif', durationSeconds: 3.7, direction: 'up-left', angle: 12});
  const {durationInFrames} = getCompositionMetadata(gif);
  for (const frame of [0, 91, durationInFrames - 1]) assertSteadyStep(gif, frame, durationInFrames);
});

test('Xadrez: cada direção move o tabuleiro para o lado que o nome diz, girado com a inclinação', () => {
  for (const angle of [0, 30, -45]) {
    for (const direction of CHECKER_DIRECTIONS) {
      const props = checkerboardLoopSchema.parse({direction, angle, speed: 60});
      const seen = seenStep(props, 100, 480);
      const [boardX, boardY] = BOARD_SIGNS[direction]!;
      const meant = turn(boardX, boardY, angle);
      // Same line, same side: the seen step is a positive multiple of the named direction, turned.
      assert.ok(Math.abs(seen.x * meant.y - seen.y * meant.x) < 1e-6, `${direction} a ${angle}°: fora da linha`);
      assert.ok(seen.x * meant.x + seen.y * meant.y > 0, `${direction} a ${angle}°: sentido`);
      if (angle === 0) {
        assert.equal(Math.sign(Math.round(seen.x * 1e6)), boardX, `${direction}: lado horizontal na tela`);
        assert.equal(Math.sign(Math.round(seen.y * 1e6)), boardY, `${direction}: lado vertical na tela`);
      }
    }
  }
  // At ±45° the squares stand as diamonds, and the diagonals run along the screen: the table in the README.
  const onScreen = (angle: number, direction: string) => {
    const seen = seenStep(checkerboardLoopSchema.parse({angle, direction, speed: 60}), 100, 480);
    return [Math.sign(Math.round(seen.x * 1e6)) || 0, Math.sign(Math.round(seen.y * 1e6)) || 0];
  };
  assert.deepEqual(onScreen(45, 'up-right'), [1, 0]);
  assert.deepEqual(onScreen(45, 'down-left'), [-1, 0]);
  assert.deepEqual(onScreen(45, 'up-left'), [0, -1]);
  assert.deepEqual(onScreen(45, 'down-right'), [0, 1]);
  assert.deepEqual(onScreen(-45, 'down-right'), [1, 0]);
  assert.deepEqual(onScreen(-45, 'up-left'), [-1, 0]);
  assert.deepEqual(onScreen(-45, 'up-right'), [0, -1]);
  assert.deepEqual(onScreen(-45, 'down-left'), [0, 1]);
  // The presets move the way the README describes them.
  const moves = Object.fromEntries(PRESETS.map((filename) => {
    const props = checkerboardLoopSchema.parse(readPreset(filename));
    return [filename, seenStep(props, 10, getCompositionMetadata(props).durationInFrames)];
  }));
  assert.ok(moves['xadrez-classico.json']!.x > 0 && moves['xadrez-classico.json']!.y > 0, 'clássico: para baixo e para a direita');
  assert.ok(moves['xadrez-losangos.json']!.x > 0 && Math.abs(moves['xadrez-losangos.json']!.y) < 1e-9, 'losangos: para a direita');
  const tilted = moves['xadrez-inclinado.json']!;
  assert.ok(tilted.x < 0 && tilted.y > 0 && tilted.y < -tilted.x / 3, 'inclinado: para a esquerda, descendo com a fileira');
  assert.ok(moves['xadrez-alpha.json']!.y < 0 && Math.abs(moves['xadrez-alpha.json']!.x) < 1e-9, 'alpha: subindo');
});

test('Xadrez: velocidade alta demais para o tamanho da casa é recusada, nunca exibida ao contrário', () => {
  let refused = 0;
  let accepted = 0;
  for (const direction of CHECKER_DIRECTIONS) {
    for (const outputFormat of ['webm', 'gif'] as const) {
      for (const squareSize of [16, 17, 19, 20, 23.7, 33.3, 480]) {
        for (const speed of [0, 1, 40, 300, 452, 453, 640, 768, 769, 960]) {
          for (const durationSeconds of [0.03, 0.05, 0.1, 1, 8]) {
            const input = {direction, outputFormat, squareSize, speed, durationSeconds};
            const result = checkerboardLoopSchema.strict().safeParse(input);
            const props = {...checkerboardLoopSchema.parse({}), ...input} as CheckerboardLoopProps;
            const {durationInFrames} = getCompositionMetadata(props);
            const {distance} = getCheckerTravel(props);
            const step = {x: distance.x / durationInFrames, y: distance.y / durationInFrames};
            // Brute force: the shortest move that shows the same next frame, over nearby same-colour vectors.
            let shortest = Math.hypot(step.x, step.y);
            let aliased = false;
            for (let i = -6; i <= 6; i++) {
              for (let j = -6; j <= 6; j++) {
                if ((i === 0 && j === 0) || (i + j) % 2 !== 0) continue;
                const length = Math.hypot(step.x - i * squareSize, step.y - j * squareSize);
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
            // The share quoted is the one refused, and never reads as the limit that is accepted.
            const quoted = /move (more than 40|\d+)% of the way/.exec(issue.message)![1]!;
            const quotedShare = /Increase durationSeconds/.test(issue.message) ? 1 / durationInFrames : getFrameShare(props, durationInFrames);
            if (quoted === 'more than 40') assert.ok(Math.round(quotedShare * 100) <= 40, name);
            else assert.ok(Number(quoted) === Math.round(quotedShare * 100) && Number(quoted) > 40, `${name}: ${quoted}%`);
            // The way out the message offers really is accepted, and just past it is not.
            const limit = /below (\d+) px\/s/.exec(issue.message);
            if (limit) {
              const below = Number(limit[1]) - 0.5;
              if (below > 0) assert.equal(checkerboardLoopSchema.safeParse({...input, speed: below}).success, true, `${name}: ${below}`);
              const above = Number(limit[1]) + 1;
              if (above <= 960) assert.equal(checkerboardLoopSchema.safeParse({...input, speed: above}).success, false, `${name}: ${above}`);
            } else {
              assert.match(issue.message, /Increase durationSeconds/, name);
            }
          }
        }
      }
    }
  }
  assert.ok(refused > 0 && accepted > refused, `${accepted} aceitas, ${refused} recusadas`);
  // The limits the README quotes for 16 px squares: rows and columns, then diagonals.
  const limitFor = (direction: string, outputFormat: string) => {
    const issue = checkerboardLoopSchema.safeParse({direction, outputFormat, squareSize: 16, speed: 960}).error!.issues[0]!;
    return Number(/below (\d+) px\/s/.exec(issue.message)![1]);
  };
  assert.equal(limitFor('right', 'webm'), 770);
  assert.equal(limitFor('up', 'gif'), 642);
  assert.equal(limitFor('down-right', 'webm'), 544);
  assert.equal(limitFor('up-left', 'gif'), 453);
  // The messages as a user reads them: the share per frame, or one step's share in a two-frame cycle.
  const messageFor = (input: object) => checkerboardLoopSchema.safeParse(input).error!.issues[0]!.message;
  assert.match(messageFor({squareSize: 16, speed: 960, direction: 'right'}), /would move 50% of the way/);
  assert.match(messageFor({squareSize: 16, speed: 960, direction: 'down-right', outputFormat: 'gif'}), /would move 85% of the way/);
  assert.match(messageFor({squareSize: 16, speed: 770, direction: 'right'}), /would move more than 40% of the way/);
  assert.match(messageFor({durationSeconds: 0.03, direction: 'left'}), /even one step per cycle would make the board move 50% of the way/);
  // Two frames, two steps asked: the message still quotes what one step would do.
  const twoFrames = {durationSeconds: 0.04, squareSize: 16, speed: 960, direction: 'down-right'} as const;
  assert.equal(getCompositionMetadata({...twoFrames, outputFormat: 'webm'}).durationInFrames, 2);
  assert.equal(getCheckerTravel(twoFrames).steps, 2);
  assert.match(messageFor({durationSeconds: 0.04, squareSize: 16, speed: 960, direction: 'down-right'}), /move 50% of the way/);
  // The fastest accepted setting on the smallest squares is still read in its own direction.
  for (const direction of CHECKER_DIRECTIONS) {
    for (const outputFormat of ['webm', 'gif'] as const) {
      const fastest = [960, 800, 769, 700, 640, 600, 542, 500, 452].find((speed) =>
        checkerboardLoopSchema.safeParse({direction, outputFormat, squareSize: 16, speed}).success)!;
      const props = checkerboardLoopSchema.parse({direction, outputFormat, squareSize: 16, speed: fastest});
      const {durationInFrames} = getCompositionMetadata(props);
      const seen = seenStep(props, 7, durationInFrames);
      const meant = frameTravel(props, durationInFrames);
      assert.ok(Math.hypot(seen.x - meant.x, seen.y - meant.y) < 1e-6, `${direction} ${outputFormat} a ${fastest} px/s`);
    }
  }
});

test('Xadrez: com velocidade zero o tabuleiro fica parado', () => {
  for (const direction of CHECKER_DIRECTIONS) {
    const props = checkerboardLoopSchema.parse({direction, speed: 0, angle: 20});
    assert.equal(getCheckerTravel(props).steps, 0);
    assert.equal(getCheckerTravel(props).speed, 0);
    for (const frame of [1, 240, 479]) assert.deepEqual(getCheckerboardScene(props, frame, 480), getCheckerboardScene(props, 0, 480));
  }
  // Any motion at all still closes the cycle: a crawl becomes one whole step.
  const crawl = getCheckerTravel(checkerboardLoopSchema.parse({speed: 0.1, direction: 'right'}));
  assert.equal(crawl.steps, 1);
  assert.equal(crawl.speed, 20);
});

test('Xadrez: o tabuleiro cobre o quadro inteiro, sem falhas nas bordas, em qualquer frame e inclinação', () => {
  const extremes = [
    {},
    {squareSize: 16},
    {squareSize: 16, angle: 45, direction: 'up-right', speed: 300},
    {squareSize: 480, angle: -45, direction: 'left', speed: 960},
    {squareSize: 480, direction: 'down-left', speed: 3},
    {squareSize: 61.3, angle: 22.5, direction: 'up', seed: -7},
    {squareSize: 37, angle: -8, direction: 'down', speed: 500, outputFormat: 'gif'},
  ];
  for (const extreme of extremes) {
    const props = checkerboardLoopSchema.parse(extreme);
    const length = getCompositionMetadata(props).durationInFrames;
    const count = getCheckerboardScene(props, 0, length).length;
    for (const frame of [0, 1, 97, 173, 240, 331, length - 1]) {
      const squares = getCheckerboardScene(props, frame, length);
      const name = `${JSON.stringify(extreme)} frame ${frame}`;
      assert.equal(squares.length, count, `${name}: a quantidade de lugares é fixa`);
      for (const square of squares) {
        assert.equal(square.size, props.squareSize);
        assert.equal(square.angle, props.angle);
        assert.equal(square.opacity, 1);
      }
      assertBoard(props, squares, name);
    }
  }
});

test('Xadrez: o path desenhado é o tabuleiro da cena, com a cor e a inclinação pedidas', () => {
  const cases = [
    {},
    {angle: -15, direction: 'left', squareSize: 64},
    {angle: 17.5, direction: 'up', squareSize: 37, seed: -7},
    {angle: 45, direction: 'up-right', squareSize: 16, squareColor: 'rgba(255, 255, 255, 0.14)'},
    {angle: -45, direction: 'down-left', squareSize: 480, speed: 960},
    ...PRESETS.map(readPreset),
  ];
  for (const input of cases) {
    const props = checkerboardLoopSchema.parse(input);
    const length = getCompositionMetadata(props).durationInFrames;
    for (const frame of [0, 137, length - 1]) {
      const name = `${JSON.stringify(input)} frame ${frame}`;
      const squares = getCheckerboardScene(props, frame, length);
      const {markup, fill, polygons} = drawnBoard(props, frame, length);
      assert.equal(fill, props.squareColor, `${name}: cor dos quadrados`);
      assert.equal(polygons.length, squares.length, `${name}: um contorno por quadrado`);
      // Every drawn square has the side and the tilt asked, corner by corner, within the path's rounding.
      const side = turn(props.squareSize, 0, props.angle);
      const across = turn(0, props.squareSize, props.angle);
      for (const [index, polygon] of polygons.entries()) {
        const [a, b, c, d] = polygon as [Point, Point, Point, Point];
        for (const [from, to, edge] of [[a, b, side], [b, c, across], [d, c, side], [a, d, across]] as const) {
          assert.ok(Math.hypot(to.x - from.x - edge.x, to.y - from.y - edge.y) < 2e-3, `${name}: quadrado ${index} torto`);
        }
        const square = squares[index]!;
        assert.ok(Math.hypot((a.x + c.x) / 2 - square.x, (a.y + c.y) / 2 - square.y) < 1e-3, `${name}: quadrado ${index} fora do lugar`);
      }
      // The drawn polygons, not the scene's centres, make a full board over the whole frame.
      assertBoard(props, squares, `${name} (desenhado)`, insidePolygons(polygons, props.squareSize));
      // The alpha rule is the shared one: only a transparent WebM drops the background.
      const transparent = props.transparent && props.outputFormat === 'webm';
      assert.equal(markup.includes('background-color:transparent'), transparent, `${name}: fundo transparente`);
      if (!transparent) assert.ok(markup.includes(`background-color:${props.backgroundColor}`), `${name}: cor de fundo`);
    }
  }
});

test('Xadrez: a seed só posiciona o tabuleiro, sem mudar tamanho, inclinação ou velocidade', () => {
  const base = checkerboardLoopSchema.parse({seed: 1, angle: 10});
  const other = checkerboardLoopSchema.parse({seed: 99, angle: 10});
  assert.notDeepEqual(getCheckerboardScene(base, 0, 480), getCheckerboardScene(other, 0, 480));
  assert.deepEqual(getCheckerTravel(base), getCheckerTravel(other));
  const [first, second] = [base, other].map((props) => getCheckerboardScene(props, 0, 480));
  assert.equal(first!.length, second!.length);
  assertBoard(other, second!, 'seed 99');
});

test('Xadrez: calcular frames não altera os parâmetros nem resultados anteriores', () => {
  const props = checkerboardLoopSchema.parse({seed: -2026, angle: -33, direction: 'up-left'});
  const originalProps = structuredClone(props);
  const firstScene = getCheckerboardScene(props, 173, 480);
  const originalScene = structuredClone(firstScene);
  getCheckerboardScene(props, 451, 480);
  getCheckerboardScene(checkerboardLoopSchema.parse({seed: 19}), 173, 480);
  assert.deepEqual(props, originalProps);
  assert.deepEqual(firstScene, originalScene);
  assert.deepEqual(getCheckerboardScene(props, 173, 480), originalScene);
});

test('Xadrez: os presets usam o mesmo schema e trazem direções, inclinações e cores diferentes', () => {
  const variations = PRESETS.map((filename) => ({filename, props: checkerboardLoopSchema.strict().parse(readPreset(filename))}));
  assert.equal(new Set(variations.map(({props}) => props.direction)).size, PRESETS.length);
  assert.equal(new Set(variations.map(({props}) => props.angle)).size, 3);
  assert.equal(new Set(variations.map(({props}) => `${props.backgroundColor}|${props.squareColor}`)).size, PRESETS.length);
  assert.deepEqual(variations.filter(({props}) => props.transparent).map(({filename}) => filename), ['xadrez-alpha.json']);
  for (const {filename, props} of variations) {
    const {durationInFrames} = getCompositionMetadata(props);
    assert.ok(getCheckerTravel(props).steps >= 1, `${filename}: o tabuleiro precisa se mover`);
    assertSteadyStep(props, durationInFrames - 1, durationInFrames);
    assertBoard(props, getCheckerboardScene(props, 0, durationInFrames), filename);
  }
});

test('Xadrez: o export mantém a regra de alpha e a duração compartilhadas com o preview', () => {
  for (const format of ['mp4', 'webm', 'gif'] as const) {
    for (const transparent of [false, true]) {
      const resolved = resolveExport({compositionId: 'CheckerboardLoop', format, props: {transparent}});
      const metadata = getCompositionMetadata(resolved.props);
      assert.equal(resolved.props.backgroundColor, '#141A33');
      assert.equal(resolved.props.durationSeconds, 8);
      assert.equal(metadata.durationInFrames, format === 'gif' ? 400 : 480);
      assert.equal(hasTransparentBackground(resolved.props), format === 'webm' && transparent);
    }
  }
  // The shared palette is not a control here; a stray `colors` key is a typo, not a no-op.
  assert.throws(() => resolveExport({compositionId: 'CheckerboardLoop', format: 'mp4', props: {colors: ['#FFFFFF', '#000000']}}));
});
