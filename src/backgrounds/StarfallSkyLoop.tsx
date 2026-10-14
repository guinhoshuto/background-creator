import {zColor} from '@remotion/zod-types';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';
import {getStarfallSkyScene, horizonY, MAX_BILLOWS, MAX_METEORS} from './starfall-sky/scene';
import {STARFALL_SKY_FRAGMENT_SHADER} from './starfall-sky/shader';
import {getShaderSeed, WEBGL_PLATE} from './WebGLLoop';
import {pack, parseColor, srgbToLinear, type WebGLElement} from './webgl/scene';
import {ShaderCanvas, type Uniforms} from './webgl/ShaderCanvas';

// Descriptions go before the defaults so the Studio shows them; colours stay undescribed,
// because a description replaces the Studio colour picker with a text field.
export const starfallSkyLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(16),
  seed: baseBackgroundSchema.shape.seed.default(5),
  // The sky at the top of the frame.
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#1A1B48'),
  // One colour per shooting star, in order, repeating when there are more stars than colours.
  colors: baseBackgroundSchema.shape.colors.default(['#7CCBFF', '#C38BFF', '#FFD36E']),
  skyColor: zColor().default('#38549D'),
  horizonColor: zColor().default('#6A9CEB'),
  cloudColor: zColor().default('#F2F8FF'),
  cloudShadeColor: zColor().default('#B3C8F6'),
  seaColor: zColor().default('#3B6BCF'),
  meteorCount: z.number().int().min(0).max(MAX_METEORS)
    .describe('Shooting stars per cycle, each with the next color of the palette; they repeat the same paths every cycle')
    .default(3),
  meteorSize: z.number().finite().min(0.5).max(2)
    .describe('Size of the shooting stars: head, trail and flare')
    .default(1),
  stars: z.number().finite().min(0).max(1)
    .describe('Brightness of the stars, which fade towards the horizon')
    .default(0.6),
  cloudBanks: z.number().finite().min(0).max(1)
    .describe('Size of the cumulus banks at the sides; 0 leaves only the sea of clouds')
    .default(1),
  seaCover: z.number().finite().min(0).max(1)
    .describe('How much of the sea of clouds below the horizon is covered by cloud')
    .default(0.5),
  horizon: z.number().finite().min(0.62).max(0.9)
    .describe('Height of the horizon, as a share of the frame from the top')
    .default(0.8),
  speed: z.number().finite().min(0).max(3)
    .describe('Pace of the clouds and the twinkle: 1 is the calm base pace and 0 holds them still (the shooting stars keep flying). The cycle rounds every motion to whole turns, so the pace you see may differ a little from the one requested')
    .default(1),
});

export type StarfallSkyLoopProps = z.infer<typeof starfallSkyLoopSchema>;

/** The horizon bulges this much lower at the frame edges than in the middle, in px. */
const HORIZON_BULGE = 18;

export {getStarfallSkyScene};

const srgb = (color: string) => parseColor(color).slice(0, 3);
const linear = (color: string) => srgb(color).map(srgbToLinear);

/** Pads a uniform array with zeros up to its declared size. */
const padded = (values: number[], size: number) => [...values, ...Array<number>(size - values.length).fill(0)];

/** The prelude's shared uniforms and the scene's own. */
export const getStarfallSkyUniforms = (
  props: StarfallSkyLoopProps,
  scene: WebGLElement[],
  width: number,
  height: number,
): Uniforms => {
  const palette = props.colors.map(parseColor);
  const slots = Array.from({length: 6}, (_, index) => palette[Math.min(index, palette.length - 1)]!);
  const billows = scene.filter((element) => element.kind === 'billow');
  const meteors = scene.filter((element) => element.kind === 'meteor');
  const bankTop = billows.reduce((top, b) => Math.min(top, (b.y as number) - (b.radius as number)), height);
  return {
    uResolution: [width, height],
    uPalette: slots.flatMap(([r, g, b, a]) => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a]),
    uPaletteSize: palette.length,
    uScale: 1,
    uIntensity: 1,
    // The sky keeps its own gradient behind the content; nothing is cleared.
    uCenterFade: 0,
    uPlateInner: [WEBGL_PLATE.inner.left, WEBGL_PLATE.inner.top, WEBGL_PLATE.inner.right, WEBGL_PLATE.inner.bottom],
    uPlateOuter: [WEBGL_PLATE.outer.left, WEBGL_PLATE.outer.top, WEBGL_PLATE.outer.right, WEBGL_PLATE.outer.bottom],
    uSeed: getShaderSeed(props.seed),
    uBackground: linear(props.backgroundColor),
    uSkyColors: [...srgb(props.backgroundColor), ...srgb(props.skyColor), ...srgb(props.horizonColor)],
    uCloudColors: [...srgb(props.cloudColor), ...srgb(props.cloudShadeColor), ...srgb(props.seaColor)],
    uLayout: [horizonY(props.horizon), HORIZON_BULGE, hasTransparentBackground(props) ? 0 : 1, bankTop],
    uLook: [props.stars, props.seaCover],
    uTwinkle: pack(scene, 'sky', ['twinkleCos', 'twinkleSin', 'twinkleCos2', 'twinkleSin2']),
    uSea: pack(scene, 'sea', ['glide', 'glidePeriod', 'evolve', 'evolvePeriod']),
    uBillows: padded(pack(scene, 'billow', ['x', 'y', 'radius', 'depth']), 4 * MAX_BILLOWS),
    uBillowCount: billows.length,
    uMeteorPath: padded(pack(scene, 'meteor', ['x0', 'y0', 'dirX', 'dirY']), 4 * MAX_METEORS),
    uMeteorState: padded(pack(scene, 'meteor', ['travelled', 'trail', 'travelMax', 'burn']), 4 * MAX_METEORS),
    uMeteorLook: padded(meteors.flatMap((meteor, index) => {
      const [r, g, b, a] = palette[index % palette.length]!;
      return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a * meteor.opacity];
    }), 4 * MAX_METEORS),
    uMeteorWidth: padded(pack(scene, 'meteor', ['width']), MAX_METEORS),
    uMeteorCount: meteors.length,
  };
};

export const StarfallSkyLoop = (props: StarfallSkyLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();
  const scene = getStarfallSkyScene(props, frame, durationInFrames);

  return (
    <Canvas {...props}>
      <ShaderCanvas
        fragmentShader={STARFALL_SKY_FRAGMENT_SHADER}
        uniforms={getStarfallSkyUniforms(props, scene, width, height)}
        width={width}
        height={height}
      />
    </Canvas>
  );
};
