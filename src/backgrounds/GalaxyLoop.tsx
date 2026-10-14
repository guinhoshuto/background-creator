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

/** Seconds of one slow twinkle at speed 1; some stars twinkle twice as often. */
export const GALAXY_TWINKLE_SECONDS = 7;
/**
 * Paces of the gas at speed 1, in cloud lattice units (600 px) per second: the drift moves it
 * about 12 px/s. Each is one closed turn per cycle round a circle as long as the pace covers in
 * the cycle, so the pace holds at any duration.
 */
export const GALAXY_DRIFT_PACE = 0.02;
const BILLOW_PACE = 0.03;
const WARP_PACE = 0.022;
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

/** Twinkles per cycle: the nearest to one every 7 seconds at the pace asked, at least one while it moves. */
export const getGalaxyTwinkleTurns = (props: Pick<GalaxyLoopProps, 'speed' | 'durationSeconds'>) =>
  wholeTurns((props.speed * props.durationSeconds) / GALAXY_TWINKLE_SECONDS);

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

/** Every animated value of the print, from the props and the frame only. */
export const getGalaxyScene = (props: GalaxyLoopProps, frame: number, durationInFrames: number): WebGLElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  // Seconds of motion at speed 1 in one cycle; with none, every value holds still.
  const travel = props.speed * props.durationSeconds;
  const moving = travel > 0 ? 1 : 0;
  const random = createSeededRandom(props.seed + 1307);
  const circle = (pace: number, offset: number) => {
    const reach = (travel * pace) / TAU;
    const angle = moving * phase + offset;
    return [reach * Math.cos(angle), reach * Math.sin(angle)] as const;
  };
  const [driftX, driftY] = circle(GALAXY_DRIFT_PACE, random() * TAU);
  const [billowX, billowZ] = circle(BILLOW_PACE, random() * TAU);
  const [warpY, warpZ] = circle(WARP_PACE, random() * TAU);
  const twinkle = getGalaxyTwinkleTurns(props) * phase;
  return [
    {
      kind: 'clouds', driftX, driftY, billowX, billowZ, warpY, warpZ, warp: WARP,
      hueShift: randomBetween(random, -0.12, 0.12), opacity: 1,
    },
    {
      kind: 'sky',
      twinkleCos: Math.cos(twinkle),
      twinkleSin: Math.sin(twinkle),
      twinkleCos2: Math.cos(2 * twinkle),
      twinkleSin2: Math.sin(2 * twinkle),
      opacity: 1,
    },
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
    uChurn: pack(scene, 'clouds', ['driftX', 'driftY', 'billowX', 'billowZ']),
    uWarp: pack(scene, 'clouds', ['warpY', 'warpZ', 'warp', 'hueShift']),
    uTwinkle: pack(scene, 'sky', ['twinkleCos', 'twinkleSin', 'twinkleCos2', 'twinkleSin2']),
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
