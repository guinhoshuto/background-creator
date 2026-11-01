// The embers of the wildfire smoke background: sparks drawn in code over the Blender frames, rising
// from a bottom corner or along the whole bottom edge. Pure: a function of the props, the seed and the sequence frame, so it closes
// the 8 s loop by construction (every ember lives a whole number of times per loop) and shows the
// same embers at every FPS and duration the schema allows. No Remotion import: the tests run in Node.
import {createSeededRandom, randomBetween, TAU} from '../../loop';
import {WILDFIRE_SEQUENCE, sequenceFrame} from './manifest';

export const SPARK_CORNERS = ['none', 'bottom-left', 'bottom-right', 'bottom'] as const;
export type SparkCorner = (typeof SPARK_CORNERS)[number];

export type SparkProps = {
  seed: number;
  sparks: SparkCorner;
  sparkCount: number;
  sparkSize: number;
  sparkRise: number;
  sparkTrail: number;
  /** Degrees from vertical, towards the middle of the frame, for the embers of a corner; `bottom` ignores it. */
  sparkAngle: number;
};

export type Spark = {
  /** The slot the ember came from, stable across frames: how a test follows one ember. */
  slot: number;
  x: number;
  y: number;
  radius: number;
  opacity: number;
  color: string;
  /** Where the ember was a moment ago, for its streak; null without a trail. */
  tail: {x: number; y: number} | null;
};

const LOOP_SECONDS = WILDFIRE_SEQUENCE.frames / WILDFIRE_SEQUENCE.fps;
const {width: WIDTH, height: HEIGHT} = WILDFIRE_SEQUENCE;
/** The embers are born in a strip this wide at a corner (the whole width for `bottom`), up to this far below the bottom edge. */
const SOURCE_WIDTH = 320;
const SOURCE_DEPTH = 90;
/** The streak is the ember's motion over this many seconds, times sparkTrail. */
const TRAIL_SECONDS = 0.06;

/** An ember cools from white-yellow through orange to deep red over its life. */
const HOT = [255, 232, 160] as const;
const WARM = [255, 150, 40] as const;
const COLD = [255, 58, 26] as const;
const hex = (rgb: readonly number[]) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;

/** The colour of an ember at `cooling` (0 at birth, 1 at death), as #rrggbb. */
export const emberColor = (cooling: number): string => {
  const t = Math.min(1, Math.max(0, cooling));
  const [from, to, local] = t < 0.5 ? [HOT, WARM, t * 2] : [WARM, COLD, (t - 0.5) * 2];
  return hex(from.map((value, index) => value + (to[index]! - value) * local));
};

/**
 * The embers alive at frame `frame` of a composition `durationInFrames` long: each of the
 * `sparkCount` slots lives 1 to 4 times per loop, born at its own phase, rising from the corner
 * strip (drifting inwards, `sparkAngle` degrees from vertical) or from anywhere along the bottom
 * (drifting either way), with a sway, flickering, and cooling until it fades. The same slot
 * draws the same random numbers whether or not it is alive, so a frame never depends on another.
 */
export const getSparkScene = (props: SparkProps, frame: number, durationInFrames: number): Spark[] => {
  if (props.sparks === 'none' || props.sparkCount <= 0) return [];
  const t = sequenceFrame(frame, durationInFrames) / WILDFIRE_SEQUENCE.fps;
  const random = createSeededRandom(props.seed);
  const inward = props.sparks === 'bottom-left' ? 1 : -1;
  const wholeBottom = props.sparks === 'bottom';
  const slope = Math.tan((props.sparkAngle * Math.PI) / 180);
  const sparks: Spark[] = [];
  for (let slot = 0; slot < props.sparkCount; slot++) {
    const lives = 1 + Math.floor(random() * 4);
    const period = LOOP_SECONDS / lives;
    const rise = props.sparkRise * randomBetween(random, 0.6, 1.4);
    // Short enough to die inside the frame most of the time, and to leave a gap before the next life.
    const life = Math.min(period * randomBetween(random, 0.5, 0.85), randomBetween(random, 0.7, 1) * (HEIGHT * 0.95) / rise);
    const birth = random() * period;
    const x0 = wholeBottom ? random() * WIDTH : props.sparks === 'bottom-left' ? random() * SOURCE_WIDTH : WIDTH - random() * SOURCE_WIDTH;
    const y0 = HEIGHT + random() * SOURCE_DEPTH;
    const drift = wholeBottom ? randomBetween(random, -40, 40) : inward * (rise * slope + randomBetween(random, 10, 90));
    const swayAmplitude = randomBetween(random, 6, 28) * (props.sparkSize / 3);
    const swayRate = randomBetween(random, 1.5, 4);
    const swayPhase = random() * TAU;
    const flickerRate = randomBetween(random, 12, 30);
    const flickerPhase = random() * TAU;
    const radius = props.sparkSize * randomBetween(random, 0.45, 1.5);
    const brightness = randomBetween(random, 0.6, 1);
    const age = (((t - birth) % period) + period) % period;
    if (age >= life) continue;
    const sway = swayRate * age + swayPhase;
    const x = x0 + drift * age + swayAmplitude * Math.sin(sway);
    const y = y0 - rise * age;
    const fadeIn = Math.min(1, age / 0.15);
    const fadeOut = Math.min(1, (life - age) / (0.35 * life));
    const flicker = 0.75 + 0.25 * Math.sin(flickerRate * age + flickerPhase);
    const tail = props.sparkTrail > 0
      ? {
        x: x - (drift + swayAmplitude * swayRate * Math.cos(sway)) * props.sparkTrail * TRAIL_SECONDS,
        y: y + rise * props.sparkTrail * TRAIL_SECONDS,
      }
      : null;
    sparks.push({slot, x, y, radius, opacity: brightness * fadeIn * fadeOut * flicker, color: emberColor(age / life), tail});
  }
  return sparks;
};
