import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';
import {GALAXY_GLSL} from './galaxy/shader';
import {getShaderSeed, WEBGL_PLATE} from './WebGLLoop';
import {buildFragmentShader} from './webgl/glsl';
import {pack, parseColor, srgbToLinear, wholeTurns, type WebGLElement} from './webgl/scene';
import {ShaderCanvas, type Uniforms} from './webgl/ShaderCanvas';

/** Seconds of the slowest twinkle at speed 1; the other stars twinkle two or three times as often. */
export const GALAXY_TWINKLE_SECONDS = 7;
/** Seconds of one breath of the big billows at speed 1, rounded to whole breaths per cycle. */
export const GALAXY_CHURN_SECONDS = 16;
/**
 * The approved print's drift, billow and warp circles (cloud lattice units per second at speed 1):
 * the big billows sit where those circles started, so they keep the composition of its first frame.
 */
const HOME_PACES = [0.02, 0.03, 0.022] as const;
/**
 * Seconds at speed 1 that one part of the gas lives: it fades in, drifts on the current and
 * fades out while the other part takes over. Rounded to whole lives per cycle. Short enough that
 * the current cannot shear the gas into streaks before it fades.
 */
export const GALAXY_GAS_LIFE_SECONDS = 10;
/**
 * The current the gas drifts on, at speed 1, in cloud lattice units (600 px) per second: a
 * prevailing drift of about 5 px/s, in a direction from the seed, and broad swirls that add about
 * 7 px/s, up to about 20 where they are strongest. The current stands still on the screen, so
 * every place keeps its own way of flowing.
 */
export const GALAXY_DRIFT_PACE = 0.008;
const SWIRL_PACE = 0.04;
/** How fast the gas changes shape while it drifts, in noise depth per second at speed 1. */
const EVOLVE_PACE = 0.012;
/** How far the gas is warped: gently, so it billows instead of marbling. */
const WARP = 0.75;

const fragmentShader = buildFragmentShader(GALAXY_GLSL);

// Descriptions go before the defaults so the Studio shows them; colours stay undescribed,
// because a description replaces the Studio colour picker with a text field.
export const galaxyLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(16),
  seed: baseBackgroundSchema.shape.seed.default(1),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#07051C'),
  // The clouds run through the colours in order; the light cores take the local colour, lightened.
  colors: baseBackgroundSchema.shape.colors.default(['#29D3FF', '#3767FF', '#7E3BFF', '#FF4FA8']),
  speed: z.number().finite().min(0).max(3)
    .describe('Pace of the drifting gas and of the twinkle: 0 holds the picture still')
    .default(1),
  clouds: z.number().finite().min(0).max(1)
    .describe('Strength of the coloured clouds and their light cores; 0 leaves only the stars')
    .default(0.8),
  stars: z.number().finite().min(0).max(1)
    .describe('Brightness of the stars')
    .default(0.8),
  twinkle: z.number().finite().min(0).max(1)
    .describe('How much the stars twinkle')
    .default(0.5),
  centerCalm: z.number().finite().min(0).max(1)
    .describe('Dims the clouds, the light cores and the stars behind the 16:9 content area, for title, camera and game')
    .default(0.25),
});

export type GalaxyLoopProps = z.infer<typeof galaxyLoopSchema>;

/**
 * Turns of the twinkle angle per cycle: the nearest to one every 7 seconds at the pace asked, at
 * least one while it moves. Each star twinkles one, two or three times per turn.
 */
export const getGalaxyTwinkleTurns = (props: Pick<GalaxyLoopProps, 'speed' | 'durationSeconds'>) =>
  wholeTurns((props.speed * props.durationSeconds) / GALAXY_TWINKLE_SECONDS);

/** Lives of each part of the gas per cycle: the nearest to one every 10 seconds, at least one while it moves. */
export const getGalaxyGasLives = (props: Pick<GalaxyLoopProps, 'speed' | 'durationSeconds'>) =>
  wholeTurns((props.speed * props.durationSeconds) / GALAXY_GAS_LIFE_SECONDS);

/** Breaths of the big billows per cycle: the nearest to one every 16 seconds, at least one while it moves. */
export const getGalaxyChurnTurns = (props: Pick<GalaxyLoopProps, 'speed' | 'durationSeconds'>) =>
  wholeTurns((props.speed * props.durationSeconds) / GALAXY_CHURN_SECONDS);

/**
 * The three light cores, from the seed: two large ones on a diagonal, in the side bands left and
 * right of the content area, and a small one above or below it. They stand still, so the
 * composition holds. Each is x and y (px), reach (px) and brightness.
 */
export const getGalaxyCores = (seed: number, width: number, height: number) => {
  const random = createSeededRandom(seed + 2719);
  const leftHigh = random() < 0.5;
  const high = () => randomBetween(random, 0.15, 0.4) * height;
  const low = () => randomBetween(random, 0.6, 0.85) * height;
  const left = [randomBetween(random, 0.08, 0.2) * width, leftHigh ? high() : low(), randomBetween(random, 300, 420), randomBetween(random, 0.8, 1)];
  const right = [randomBetween(random, 0.8, 0.92) * width, leftHigh ? low() : high(), randomBetween(random, 300, 420), randomBetween(random, 0.8, 1)];
  const smallX = randomBetween(random, 0.3, 0.7) * width;
  const smallY = (random() < 0.5 ? randomBetween(random, 0.04, 0.16) : randomBetween(random, 0.84, 0.96)) * height;
  const small = [smallX, smallY, randomBetween(random, 180, 260), randomBetween(random, 0.5, 0.7)];
  return [left, right, small];
};

/**
 * Every animated value of the print, from the props and the frame only.
 *
 * The big billows of the gas sit where the approved print had them at its first frame and breathe
 * in place, whole breaths per cycle. The finer gas is drawn twice over, in two parts that take
 * turns (a flow map, in the shader): each part is the gas as it was when that part's life began,
 * drifted on the current for its age, and it fades in and out half a life apart from the other
 * part, beginning its next life somewhere else in the noise only while it is invisible. So the gas
 * flows on and never swings back. The scene gives the shader the gas clock, in lives: whole lives
 * per cycle close the loop, and the clock runs a quarter of a life past a turn of the parts at the
 * seam.
 */
export const getGalaxyScene = (props: GalaxyLoopProps, frame: number, durationInFrames: number): WebGLElement[] => {
  const turn = loopPhase(frame, durationInFrames) / TAU;
  // Seconds of motion at speed 1 in one cycle; with none, every value holds still.
  const travel = props.speed * props.durationSeconds;
  const lives = getGalaxyGasLives(props);
  // The approved print's circles at their start, drawn from the seed in the same order, then its
  // hue shift: each seed keeps the billows and the hues of that print.
  const random = createSeededRandom(props.seed + 1307);
  const [[homeX, homeY], [billowX, billowZ], [warpY, warpZ]] = HOME_PACES.map((pace) => {
    const reach = (travel * pace) / TAU;
    const angle = random() * TAU;
    return [reach * Math.cos(angle), reach * Math.sin(angle)] as const;
  }) as [readonly [number, number], readonly [number, number], readonly [number, number]];
  const hueShift = randomBetween(random, -0.12, 0.12);
  const heading = random() * TAU;
  const churn = getGalaxyChurnTurns(props) * turn * TAU;
  const twinkle = getGalaxyTwinkleTurns(props) * turn * TAU;
  return [
    {
      kind: 'clouds',
      homeX, homeY, billowX, billowZ, warpY, warpZ,
      churnCos: Math.cos(churn),
      churnSin: Math.sin(churn),
      driftX: GALAXY_DRIFT_PACE * Math.cos(heading),
      driftY: GALAXY_DRIFT_PACE * Math.sin(heading),
      swirl: SWIRL_PACE,
      evolve: EVOLVE_PACE,
      warp: WARP,
      hueShift,
      // The clock wraps after the last life of the cycle, at least one so the shader can wrap it.
      clock: (lives * turn + 0.25) % Math.max(lives, 1),
      lives: Math.max(lives, 1),
      lifeSeconds: lives > 0 ? travel / lives : 0,
      opacity: 1,
    },
    {kind: 'sky', twinkleCos: Math.cos(twinkle), twinkleSin: Math.sin(twinkle), opacity: 1},
  ];
};

/** The prelude's shared uniforms and the print's own. */
export const getGalaxyUniforms = (props: GalaxyLoopProps, scene: WebGLElement[], width: number, height: number): Uniforms => {
  const palette = props.colors.map(parseColor);
  const slots = Array.from({length: 6}, (_, index) => palette[Math.min(index, palette.length - 1)]!);
  return {
    uResolution: [width, height],
    uPalette: slots.flatMap(([r, g, b, a]) => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a]),
    uPaletteSize: palette.length,
    uScale: 1,
    uIntensity: 1,
    // The print calms its own centre (centerCalm), layer by layer.
    uCenterFade: 0,
    uPlateInner: [WEBGL_PLATE.inner.left, WEBGL_PLATE.inner.top, WEBGL_PLATE.inner.right, WEBGL_PLATE.inner.bottom],
    uPlateOuter: [WEBGL_PLATE.outer.left, WEBGL_PLATE.outer.top, WEBGL_PLATE.outer.right, WEBGL_PLATE.outer.bottom],
    uSeed: getShaderSeed(props.seed),
    uBackground: parseColor(props.backgroundColor).slice(0, 3).map(srgbToLinear),
    uGasHome: pack(scene, 'clouds', ['homeX', 'homeY', 'billowX', 'billowZ']),
    uGasLook: pack(scene, 'clouds', ['warpY', 'warpZ', 'warp', 'hueShift']),
    uChurn: pack(scene, 'clouds', ['churnCos', 'churnSin']),
    uCurrent: pack(scene, 'clouds', ['driftX', 'driftY', 'swirl', 'evolve']),
    uGasClock: pack(scene, 'clouds', ['clock', 'lives', 'lifeSeconds']),
    uTwinkle: pack(scene, 'sky', ['twinkleCos', 'twinkleSin']),
    uLook: [props.clouds, props.stars, props.twinkle, props.centerCalm],
    uCores: getGalaxyCores(props.seed, width, height).flat(),
  };
};

export const getGalaxyFragmentShader = () => fragmentShader;

export const GalaxyLoop = (props: GalaxyLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();
  const scene = getGalaxyScene(props, frame, durationInFrames);

  return (
    <Canvas {...props}>
      <ShaderCanvas
        fragmentShader={fragmentShader}
        uniforms={getGalaxyUniforms(props, scene, width, height)}
        width={width}
        height={height}
      />
    </Canvas>
  );
};
