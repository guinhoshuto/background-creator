import {zColor} from '@remotion/zod-types';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema, getCompositionMetadata} from '../settings';
import {Canvas} from './Canvas';

export const CHECKER_DIRECTIONS = [
  'right', 'left', 'up', 'down', 'up-right', 'up-left', 'down-right', 'down-left',
] as const;

// The board has two tones: the squares and the background between them, so the shared
// palette would be a dead control. The WebM alpha keeps only the squares.
const checkerboardFields = baseBackgroundSchema.omit({colors: true}).extend({
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#141A33'),
  direction: z.enum(CHECKER_DIRECTIONS)
    .describe('Direção do movimento, ao longo das fileiras, colunas ou diagonais do tabuleiro')
    .default('down-right'),
  angle: z.number().finite().min(-45).max(45)
    .describe('Inclinação do tabuleiro, em graus, no sentido horário; o movimento gira junto')
    .default(0),
  squareColor: zColor().default('#222C57'),
  squareSize: z.number().finite().min(16).max(480).describe('Lado de cada casa, em pixels').default(80),
  speed: z.number().finite().min(0).max(960)
    .describe('Velocidade em pixels por segundo, arredondada para um número inteiro de passos do padrão por ciclo (no mínimo um); 0 deixa o tabuleiro parado')
    .default(40),
});

export type CheckerboardLoopProps = z.infer<typeof checkerboardFields>;
export type CheckerDirection = CheckerboardLoopProps['direction'];

export type CheckerSquare = {
  /** Centre of the square on screen. */
  x: number;
  y: number;
  /** Side of the square, in pixels. */
  size: number;
  /** Tilt of the whole board, in degrees, clockwise on screen. */
  angle: number;
  /** The board is the same everywhere: every square is fully drawn. */
  opacity: number;
};

export const WIDTH = 1920;
export const HEIGHT = 1080;
const RADIAN = Math.PI / 180;

/** Unit steps on the board, before the tilt: y grows downwards, as on screen. */
export const DIRECTION_VECTORS: Record<CheckerDirection, readonly [number, number]> = {
  right: [1, 0],
  left: [-1, 0],
  up: [0, -1],
  down: [0, 1],
  'up-right': [1, -1],
  'up-left': [-1, -1],
  'down-right': [1, 1],
  'down-left': [-1, 1],
};

const fract = (value: number) => value - Math.floor(value);

/**
 * How far the board travels in one cycle, measured on the board before the tilt. The squares
 * of one colour sit on a lattice spanned by the two diagonals, a = (s, s) and b = (s, −s): the
 * next square down a diagonal has the same colour, but the next one along a row or a column
 * has the other, so there the board only repeats every two squares. The cycle moves a whole
 * number of `step`s, the shortest move along the direction that lands the board on itself, so
 * the frame after the last is the first again. Every step is a whole number of a and b.
 */
export const getCheckerTravel = (
  props: Pick<CheckerboardLoopProps, 'direction' | 'squareSize' | 'speed' | 'durationSeconds'>,
) => {
  const [dx, dy] = DIRECTION_VECTORS[props.direction];
  // Squares crossed on each moving axis per step: one on a diagonal, two along a row or column.
  const stepSquares = dx !== 0 && dy !== 0 ? 1 : 2;
  const stepLength = stepSquares * props.squareSize * Math.hypot(dx, dy);
  // Any motion at all makes at least one step: a cycle cannot close halfway through one.
  const steps = props.speed > 0
    ? Math.max(1, Math.round((props.speed * props.durationSeconds) / stepLength))
    : 0;
  return {
    stepLength,
    steps,
    /** Diagonals crossed per cycle, in a and b: whole numbers, kept exact so the cycle closes. */
    lattice: {a: (steps * stepSquares * (dx + dy)) / 2, b: (steps * stepSquares * (dx - dy)) / 2},
    /** Distance covered per cycle on the board, in pixels, before the tilt. */
    distance: {x: steps * stepSquares * dx * props.squareSize, y: steps * stepSquares * dy * props.squareSize},
    /** The speed actually shown, in pixels per second. */
    speed: (steps * stepLength) / props.durationSeconds,
  };
};

/** Share of the way to the nearest square of the same colour that the board may cover in one frame. */
export const MAX_FRAME_SHARE = 0.4;

/**
 * How far one frame moves the board, as the largest share of the way to a nearest neighbour of
 * the same colour, a or b, measured along it. One frame reads in its own direction only while it
 * covers less than half of that way: beyond it, the nearest square of the same colour in the
 * next frame is another square, and the board seems to move backwards or to flicker in place.
 * A diagonal step is one whole a or b, and a step along a row or a column, a ± b, is one whole
 * way along both: the share is exactly the number of steps per frame, with no rounding noise.
 */
export const getFrameShare = (
  props: Pick<CheckerboardLoopProps, 'direction' | 'squareSize' | 'speed' | 'durationSeconds'>,
  durationInFrames: number,
) => getCheckerTravel(props).steps / durationInFrames;

/**
 * A fast board of small squares would alias: nothing is rendered wrong, but the eye pairs each
 * square with the nearest one of its colour in the next frame and sees the wrong direction. The
 * speed is never lowered behind the user's back; the combination is refused with the way out.
 */
export const checkerboardLoopSchema = checkerboardFields.superRefine((props, context) => {
  let durationInFrames: number;
  try {
    ({durationInFrames} = getCompositionMetadata(props));
  } catch {
    return; // An unrepresentable duration is reported by the metadata itself.
  }
  const share = getFrameShare(props, durationInFrames);
  if (share <= MAX_FRAME_SHARE) return;
  const {stepLength} = getCheckerTravel(props);
  // The share is the steps per frame: find how many the cycle's frames can carry.
  const maxSteps = Math.floor(MAX_FRAME_SHARE * durationInFrames + 1e-9);
  // Rounded, a share just past the limit would read as the limit itself.
  const limit = Math.round(MAX_FRAME_SHARE * 100);
  const percentOf = (value: number) => (Math.round(value * 100) > limit ? `${Math.round(value * 100)}%` : `more than ${limit}%`);
  context.addIssue({
    code: 'custom',
    path: ['speed'],
    message: maxSteps >= 1
      ? `Speed too high for this square size: each frame the board would move ${percentOf(share)} of the way to the neighbouring square of the same colour and would seem to go backwards or flicker. Use speed below ${Math.floor(((maxSteps + 0.5) * stepLength) / props.durationSeconds)} px/s or increase squareSize.`
      : `Cycle too short for the board: even one step per cycle would make the board move ${percentOf(1 / durationInFrames)} of the way to the neighbouring square of the same colour each frame, and it would seem to go backwards or flicker. Increase durationSeconds.`,
  });
}, {when: (payload) => payload.issues.length === 0});

/**
 * Every animated value lives here. The squares are listed by place, not by square: the shift of
 * the board wraps inside one cell of the a–b lattice, so when a square moves on by a whole
 * diagonal its place is taken by its neighbour and the list reads the same again. That is also
 * why the places follow the diagonals rather than the rows: a cycle may end one diagonal step
 * away, where a row-by-row list would have swapped its colours. The seed only places the board
 * inside its cell, between 20% and 80% of the way along each diagonal, so the wrap never falls on
 * the instant the cycle closes and every field of the list keeps its velocity through the seam.
 * A wrap between two frames, the last and the first included, only hands places over: the drawn
 * board is the same. The squares cover one colour; `backgroundColor` shows between them.
 */
export const getCheckerboardScene = (
  props: CheckerboardLoopProps,
  frame: number,
  durationInFrames: number,
): CheckerSquare[] => {
  const cycle = loopPhase(frame, durationInFrames) / TAU;
  const {lattice} = getCheckerTravel(props);
  const random = createSeededRandom(props.seed + 71);
  const shiftA = fract(randomBetween(random, 0.2, 0.8) + lattice.a * cycle);
  const shiftB = fract(randomBetween(random, 0.2, 0.8) + lattice.b * cycle);
  const size = props.squareSize;
  const cos = Math.cos(props.angle * RADIAN);
  const sin = Math.sin(props.angle * RADIAN);
  // The tilted frame, seen from the board and measured from its centre, plus one square all
  // round: a square about to come in, even at the fastest accepted speed, is already listed.
  const halfX = (WIDTH / 2) * Math.abs(cos) + (HEIGHT / 2) * Math.abs(sin) + size;
  const halfY = (WIDTH / 2) * Math.abs(sin) + (HEIGHT / 2) * Math.abs(cos) + size;
  const reach = Math.ceil((halfX + halfY) / (2 * size)) + 3;

  const squares: CheckerSquare[] = [];
  for (let m = -reach; m <= reach; m++) {
    for (let n = -reach; n <= reach; n++) {
      // Whatever the shift, the square at place (m, n) has its left edge within two squares
      // of `across` and its top edge within one square of `down`. A place is kept when some
      // shift brings it into the box, so the list never changes length from frame to frame.
      const across = size * (m + n);
      const down = size * (m - n);
      if (across >= halfX || across + 3 * size <= -halfX || down - size >= halfY || down + 2 * size <= -halfY) continue;
      // Centre of the square on the board, from the centre of the frame, then tilted.
      const boardX = size * (m + shiftA + n + shiftB) + size / 2;
      const boardY = size * (m + shiftA - n - shiftB) + size / 2;
      squares.push({
        x: WIDTH / 2 + boardX * cos - boardY * sin,
        y: HEIGHT / 2 + boardX * sin + boardY * cos,
        size,
        angle: props.angle,
        opacity: 1,
      });
    }
  }
  return squares;
};

/** One closed subpath per square, its corners turned with the board. */
const squarePath = ({x, y, size, angle}: CheckerSquare) => {
  const halfX = (Math.cos(angle * RADIAN) * size) / 2;
  const halfY = (Math.sin(angle * RADIAN) * size) / 2;
  const corner = (along: number, across: number) =>
    `${(x + along * halfX - across * halfY).toFixed(3)} ${(y + along * halfY + across * halfX).toFixed(3)}`;
  return `M${corner(-1, -1)}L${corner(1, -1)}L${corner(1, 1)}L${corner(-1, 1)}Z`;
};

/** The whole picture for one frame; CheckerboardLoop feeds it Remotion's frame, the tests their own. */
export const CheckerboardFrame = ({props, frame, durationInFrames}: {
  props: CheckerboardLoopProps; frame: number; durationInFrames: number;
}) => {
  const squares = getCheckerboardScene(props, frame, durationInFrames);

  return (
    <Canvas {...props}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
        {/* One path for the whole board: squares only meet at their corners, so none overlap,
            and thousands of small squares stay cheap to draw. */}
        <path d={squares.map(squarePath).join('')} fill={props.squareColor} />
      </svg>
    </Canvas>
  );
};

export const CheckerboardLoop = (props: CheckerboardLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return <CheckerboardFrame props={props} frame={frame} durationInFrames={durationInFrames} />;
};
