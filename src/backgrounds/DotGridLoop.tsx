import {zColor} from '@remotion/zod-types';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema, getCompositionMetadata} from '../settings';
import {Canvas} from './Canvas';

export const DOT_DIRECTIONS = [
  'right', 'left', 'up', 'down', 'up-right', 'up-left', 'down-right', 'down-left',
] as const;

export const DOT_LAYOUTS = ['aligned', 'alternating'] as const;

// The dots take a single colour of their own, so the shared palette would be a dead control.
const dotGridFields = baseBackgroundSchema.omit({colors: true}).extend({
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#10162B'),
  direction: z.enum(DOT_DIRECTIONS)
    .describe('Direction of motion: horizontal, vertical or diagonal')
    .default('down-right'),
  layout: z.enum(DOT_LAYOUTS)
    .describe('aligned: dots lined up in a grid; alternating: alternate rows, shifted half a step')
    .default('aligned'),
  dotColor: zColor().default('#7C8CFF'),
  dotSize: z.number().finite().min(1).max(96).describe('Dot diameter, in pixels').default(10),
  spacing: z.number().finite().min(16).max(240)
    .describe('Distance between the centers of neighboring dots in a row and between rows, in pixels')
    .default(48),
  speed: z.number().finite().min(0).max(480)
    .describe('Speed in pixels per second, rounded to a whole number of pattern steps per cycle (at least one); 0 holds the pattern still')
    .default(24),
});

export type DotGridLoopProps = z.infer<typeof dotGridFields>;
export type DotDirection = DotGridLoopProps['direction'];

export type DotElement = {
  x: number;
  y: number;
  radius: number;
  /** The pattern is the same everywhere: every dot is fully drawn. */
  opacity: number;
};

export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Unit steps on screen: y grows downwards. */
export const DIRECTION_VECTORS: Record<DotDirection, readonly [number, number]> = {
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
 * How far the pattern travels in one cycle. It repeats every `cell`: one spacing across, and
 * one spacing down for the grid but two for the alternating rows, whose shifted row only
 * lines up again every second row. The cycle moves a whole number of `step`s, the shortest
 * move along the direction that lands the pattern on itself, so the frame after the last is
 * the first again. A diagonal step has to close both axes together: it is one `cell.y` on
 * each, since `cell.y` is itself a whole number of `cell.x`.
 */
export const getDotTravel = (
  props: Pick<DotGridLoopProps, 'direction' | 'layout' | 'spacing' | 'speed' | 'durationSeconds'>,
) => {
  const rowsPerCell = props.layout === 'alternating' ? 2 : 1;
  const cell = {x: props.spacing, y: rowsPerCell * props.spacing};
  const [dx, dy] = DIRECTION_VECTORS[props.direction];
  // The step in whole cells; kept in integers so the cycle closes without rounding error.
  const stepCells = {x: dy === 0 ? dx : dx * rowsPerCell, y: dy};
  const stepLength = Math.hypot(stepCells.x * cell.x, stepCells.y * cell.y);
  // Any motion at all makes at least one step: a cycle cannot close halfway through one.
  const steps = props.speed > 0
    ? Math.max(1, Math.round((props.speed * props.durationSeconds) / stepLength))
    : 0;
  return {
    cell,
    stepLength,
    steps,
    /** Cells crossed per cycle on each axis: whole numbers, signed like the direction. */
    cells: {x: steps * stepCells.x, y: steps * stepCells.y},
    /** The speed actually shown, in pixels per second. */
    speed: (steps * stepLength) / props.durationSeconds,
  };
};

/** Share of the way to a neighbour's place that the pattern may cover in one frame. */
export const MAX_FRAME_SHARE = 0.4;

/**
 * The neighbours that bound the pattern's Voronoi cell. One frame of travel reads in its own
 * direction only while it covers less than half of the way to every one of them: beyond that,
 * the nearest dot in the next frame is another dot, and the pattern seems to move backwards
 * or to flicker in place.
 */
const getNeighbours = (layout: DotGridLoopProps['layout'], spacing: number): [number, number][] =>
  layout === 'alternating'
    ? [[spacing, 0], [spacing / 2, spacing], [-spacing / 2, spacing]]
    : [[spacing, 0], [0, spacing]];

/** How far one frame moves the pattern, as the largest share of the way to a neighbour. */
export const getFrameShare = (
  props: Pick<DotGridLoopProps, 'direction' | 'layout' | 'spacing' | 'speed' | 'durationSeconds'>,
  durationInFrames: number,
) => {
  const {cell, cells} = getDotTravel(props);
  const x = (cells.x * cell.x) / durationInFrames;
  const y = (cells.y * cell.y) / durationInFrames;
  return Math.max(...getNeighbours(props.layout, props.spacing)
    .map(([nx, ny]) => Math.abs(x * nx + y * ny) / (nx * nx + ny * ny)));
};

/**
 * A fast pattern on a tight grid would alias: nothing is rendered wrong, but the eye pairs
 * each dot with the nearest one in the next frame and sees the wrong direction. The speed is
 * never lowered behind the user's back; the combination is refused with the way out instead.
 */
export const dotGridLoopSchema = dotGridFields.superRefine((props, context) => {
  let durationInFrames: number;
  try {
    ({durationInFrames} = getCompositionMetadata(props));
  } catch {
    return; // An unrepresentable duration is reported by the metadata itself.
  }
  const share = getFrameShare(props, durationInFrames);
  if (share <= MAX_FRAME_SHARE) return;
  const {steps, stepLength} = getDotTravel(props);
  // The share grows with the steps: find how many the frame rate can carry.
  const maxSteps = Math.floor((MAX_FRAME_SHARE * steps) / share + 1e-9);
  const percent = Math.round(share * 100);
  context.addIssue({
    code: 'custom',
    path: ['speed'],
    message: maxSteps >= 1
      ? `Speed too high for this spacing: each frame the pattern would move ${percent}% of the way to the neighboring dot and would seem to go backwards or flicker. Use speed below ${Math.floor(((maxSteps + 0.5) * stepLength) / props.durationSeconds)} px/s or increase spacing.`
      : `Cycle too short for this pattern: even one step per cycle would make the pattern move ${percent}% of the way to the neighboring dot each frame, and it would seem to go backwards or flicker. Increase durationSeconds or reduce spacing.`,
  });
}, {when: (payload) => payload.issues.length === 0});

/**
 * Every animated value lives here. The dots are listed by place, not by dot: the shift of the
 * grid wraps inside one cell, so when a dot moves on by a whole cell its place is taken by
 * its neighbour and the list reads the same again. The seed only places the grid inside its
 * cell, between 20% and 80% of the way, so that wrap never falls on the seam and every field
 * of the list keeps its velocity from the last frame into the first.
 */
export const getDotGridScene = (
  props: DotGridLoopProps,
  frame: number,
  durationInFrames: number,
): DotElement[] => {
  const cycle = loopPhase(frame, durationInFrames) / TAU;
  const {cell, cells} = getDotTravel(props);
  const random = createSeededRandom(props.seed + 59);
  const shiftX = fract(randomBetween(random, 0.2, 0.8) + cells.x * cycle) * cell.x;
  const shiftY = fract(randomBetween(random, 0.2, 0.8) + cells.y * cycle) * cell.y;
  const radius = props.dotSize / 2;
  const spacing = props.spacing;
  const stagger = props.layout === 'alternating' ? spacing / 2 : 0;

  // Enough places for any shift: the first and last dot of every row and column sit wholly
  // outside the frame. A place keeps its row's stagger because the shift wraps by a whole
  // cell, which is two rows in the alternating layout.
  const rowsAbove = Math.ceil((cell.y + radius) / spacing);
  const rows = rowsAbove + Math.ceil((HEIGHT + radius) / spacing) + 1;
  const columnsLeft = Math.ceil(1.5 + radius / spacing);
  const columns = columnsLeft + Math.ceil((WIDTH + radius) / spacing) + 1;

  return Array.from({length: rows * columns}, (_, index): DotElement => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      x: shiftX + (row % 2) * stagger + (column - columnsLeft) * spacing,
      y: shiftY + (row - rowsAbove) * spacing,
      radius,
      opacity: 1,
    };
  });
};

export const DotGridLoop = (props: DotGridLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const dots = getDotGridScene(props, frame, durationInFrames);

  return (
    <Canvas {...props}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
        <g fill={props.dotColor}>
          {dots.map((dot, index) => (
            <circle key={index} cx={dot.x} cy={dot.y} r={dot.radius} opacity={dot.opacity} />
          ))}
        </g>
      </svg>
    </Canvas>
  );
};
