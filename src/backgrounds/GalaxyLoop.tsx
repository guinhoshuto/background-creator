import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';
import {GALAXY_GLSL} from './galaxy/shader';
import {getShaderSeed, WEBGL_PLATE} from './WebGLLoop';
import {buildFragmentShader} from './webgl/glsl';
import {only, pack, parseColor, srgbToLinear, wholeTurns, type WebGLElement} from './webgl/scene';
import {ShaderCanvas, type Uniforms} from './webgl/ShaderCanvas';

/** Seconds of half a turn of the galaxy at speed 1: the edge of the disc moves about 110 px/s. */
export const GALAXY_SPIN_SECONDS = 16;
/** Seconds of one slow twinkle at speed 1; some stars twinkle twice as often. */
const TWINKLE_SECONDS = 7;
/**
 * Paces of the clouds at speed 1, in cloud lattice units per second. Each is one closed turn per
 * cycle round a circle as long as the pace covers in the cycle, so it holds at any duration.
 */
const DRIFT_PACE = 0.016;
const BILLOW_PACE = 0.03;
const WARP_PACE = 0.022;
/**
 * Radius of the disc at galaxySize 1 (px), and the tangent of the arms' pitch angle (about 22°):
 * a tighter spiral reads as rings once the disc leans, and its turn as rings sliding outwards.
 */
export const GALAXY_DISC_RADIUS = 560;
const ARM_PITCH = 0.4;

const fragmentShader = buildFragmentShader(GALAXY_GLSL);

// Descriptions go before the defaults so the Studio shows them; colours stay undescribed,
// because a description replaces the Studio colour picker with a text field.
export const galaxyLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(16),
  seed: baseBackgroundSchema.shape.seed.default(1),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#050512'),
  // Roles: 0 the core, 1 the arms, 2 the knots along them, 3 on the clouds (which start at 2).
  colors: baseBackgroundSchema.shape.colors.default(['#FFD7A1', '#7EA6FF', '#FF4D9D', '#7B3FE4', '#22B7E8']),
  speed: z.number().finite().min(0).max(3)
    .describe('Pace of the spin: 1 turns the galaxy half a turn every 16 seconds and 0 holds the picture still. The cycle rounds the spin to whole half turns, so the pace you see may differ a little from the one requested')
    .default(1),
  tilt: z.number().finite().min(0).max(75)
    .describe('How far the disc leans away from the viewer, in degrees: 0 shows it face on, 75 nearly edge on')
    .default(58),
  angle: z.number().finite().min(-90).max(90)
    .describe('Angle of the long axis of the disc on screen, in degrees, counterclockwise from horizontal')
    .default(-24),
  galaxyX: z.number().finite().min(0).max(1)
    .describe('Horizontal place of the core, as a share of the frame width: 0 is the left edge, 1 the right')
    .default(0.64),
  galaxyY: z.number().finite().min(0).max(1)
    .describe('Vertical place of the core, as a share of the frame height: 0 is the top edge, 1 the bottom')
    .default(0.46),
  galaxySize: z.number().finite().min(0.5).max(1.5)
    .describe('Size of the galaxy: at 1 the disc is 560 px in radius')
    .default(1),
  bar: z.number().finite().min(0).max(1)
    .describe('Strength of a straight bar of stars across the core; the arms start at its ends')
    .default(0),
  clouds: z.number().finite().min(0).max(1)
    .describe('Strength of the coloured gas clouds that frame the galaxy')
    .default(0.6),
  stars: z.number().finite().min(0).max(1)
    .describe('Brightness of the stars of the sky')
    .default(0.7),
  twinkle: z.number().finite().min(0).max(1)
    .describe('How much the stars of the sky twinkle')
    .default(0.5),
  centerCalm: z.number().finite().min(0).max(1)
    .describe('Dims the clouds, the galaxy and the stars behind the 16:9 content area, for title, camera and game')
    .default(0.25),
});

export type GalaxyLoopProps = z.infer<typeof galaxyLoopSchema>;

/** Half turns of the disc per cycle: the nearest to the pace asked, at least one while it moves. */
export const getGalaxyHalfTurns = (props: Pick<GalaxyLoopProps, 'speed' | 'durationSeconds'>) =>
  wholeTurns((props.speed * props.durationSeconds) / GALAXY_SPIN_SECONDS);

/** Every animated value of the galaxy, from the props and the frame only. */
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
  const [driftX, driftY] = circle(DRIFT_PACE, random() * TAU);
  const [billowX, billowZ] = circle(BILLOW_PACE, random() * TAU);
  const [warpY, warpZ] = circle(WARP_PACE, random() * TAU);
  // The cycle's angle goes to the shader as its cosine and sine, which never jump at the seam;
  // the shader reads the turn and the swap of the detail from it.
  const cycle = moving * phase;
  const twinkle = wholeTurns(travel / TWINKLE_SECONDS) * phase;
  return [
    {kind: 'spin', cos: Math.cos(cycle), sin: Math.sin(cycle), halfTurns: getGalaxyHalfTurns(props), opacity: 1},
    {
      kind: 'clouds', driftX, driftY, billowX, billowZ, warpY, warpZ, warp: 1.6,
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

/** The prelude's shared uniforms and the galaxy's own. */
export const getGalaxyUniforms = (props: GalaxyLoopProps, scene: WebGLElement[], width: number, height: number): Uniforms => {
  const palette = props.colors.map(parseColor);
  const slots = Array.from({length: 6}, (_, index) => palette[Math.min(index, palette.length - 1)]!);
  const spin = only(scene, 'spin');
  const tilt = (props.tilt * Math.PI) / 180;
  const angle = (props.angle * Math.PI) / 180;
  return {
    uResolution: [width, height],
    uPalette: slots.flatMap(([r, g, b, a]) => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a]),
    uPaletteSize: palette.length,
    uScale: 1,
    uIntensity: 1,
    // The galaxy calms its own centre (centerCalm), layer by layer.
    uCenterFade: 0,
    uPlateInner: [WEBGL_PLATE.inner.left, WEBGL_PLATE.inner.top, WEBGL_PLATE.inner.right, WEBGL_PLATE.inner.bottom],
    uPlateOuter: [WEBGL_PLATE.outer.left, WEBGL_PLATE.outer.top, WEBGL_PLATE.outer.right, WEBGL_PLATE.outer.bottom],
    uSeed: getShaderSeed(props.seed),
    uBackground: parseColor(props.backgroundColor).slice(0, 3).map(srgbToLinear),
    uLoop: [spin.cos as number, spin.sin as number, spin.halfTurns as number, 0],
    uDisc: [props.galaxyX * width, props.galaxyY * height, GALAXY_DISC_RADIUS * props.galaxySize, Math.cos(tilt)],
    // Counterclockwise on screen, where y grows downwards.
    uShape: [Math.cos(angle), -Math.sin(angle), props.bar, ARM_PITCH],
    uChurn: pack(scene, 'clouds', ['driftX', 'driftY', 'billowX', 'billowZ']),
    uWarp: pack(scene, 'clouds', ['warpY', 'warpZ', 'warp', 'hueShift']),
    uTwinkle: pack(scene, 'sky', ['twinkleCos', 'twinkleSin', 'twinkleCos2', 'twinkleSin2']),
    uLook: [props.clouds, props.stars, props.twinkle, props.centerCalm],
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
