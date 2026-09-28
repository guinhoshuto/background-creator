import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom} from '../loop';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';
import {PLATE} from './vaporwave/frame';
import {webglExperiments} from './webgl/experiments';
import {buildFragmentShader} from './webgl/glsl';
import {WEBGL_EXPERIMENTS} from './webgl/ids';
import {parseColor, srgbToLinear, type WebGLElement} from './webgl/scene';
import {ShaderCanvas, type Uniforms} from './webgl/ShaderCanvas';

export {WEBGL_EXPERIMENTS} from './webgl/ids';

// Descriptions go before the defaults so the Studio shows them; colours stay undescribed,
// because a description replaces the Studio colour picker with a text field.
export const webglLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(16),
  seed: baseBackgroundSchema.shape.seed.default(7),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#070B16'),
  colors: baseBackgroundSchema.shape.colors.default(['#2DD4BF', '#818CF8', '#F472B6']),
  experiment: z.enum(WEBGL_EXPERIMENTS)
    .describe('Shader experiment: aurora, lava, silk, caustics (sea floor), cells, contours (contour lines), nebula, watercolor, mesh (mesh gradient) or one from the pastel series: flow (wave), orbital (sphere), neon (neon fold), layers, haze (dusk) or eclipse')
    .default('aurora'),
  speed: z.number().finite().min(0).max(3)
    .describe('Pace of the motion: 1 is the base pace of the experiment and 0 holds the image still. The cycle rounds the path to whole turns, so the pace you see may differ a little from the one requested')
    .default(1),
  scale: z.number().finite().min(0.5).max(2)
    .describe('Size of the shapes: above 1 they grow, below 1 they shrink')
    .default(1),
  intensity: z.number().finite().min(0).max(2)
    .describe('Brightness and coverage of the experiment layer over the background color')
    .default(1),
  centerFade: z.number().finite().min(0).max(1)
    .describe('Softens the 16:9 center toward the background color, for title, camera and game; in transparent WebM it leaves the center transparent')
    .default(0.5),
});

export type WebGLLoopProps = z.infer<typeof webglLoopSchema>;

/**
 * The content plate of the SVG scenes, with a longer ramp: a shader layer usually covers the
 * whole frame, and the 150 px ramp of those scenes reads there as a darker rectangle. The
 * shader turns the two rectangles into a rounded clearing (plateWeight in glsl.ts).
 */
const PLATE_RAMP = {x: 420, y: 280};
export const WEBGL_PLATE = {
  inner: PLATE.inner,
  outer: {
    left: PLATE.inner.left - PLATE_RAMP.x, top: PLATE.inner.top - PLATE_RAMP.y,
    right: PLATE.inner.right + PLATE_RAMP.x, bottom: PLATE.inner.bottom + PLATE_RAMP.y,
  },
} as const;

/** Every animated value of the picture, from the props and the frame only. */
export const getWebGLScene = (props: WebGLLoopProps, frame: number, durationInFrames: number): WebGLElement[] =>
  webglExperiments[props.experiment].scene(props, frame, durationInFrames);

/** A 32-bit seed for the GPU hashes, derived from any safe integer. */
export const getShaderSeed = (seed: number) => Math.floor(createSeededRandom(seed)() * 2 ** 32);

/** The shared uniforms of the prelude plus the experiment's own. */
export const getWebGLUniforms = (
  props: WebGLLoopProps,
  scene: WebGLElement[],
  width: number,
  height: number,
): Uniforms => {
  const palette = props.colors.map(parseColor);
  const slots = Array.from({length: 6}, (_, index) => palette[Math.min(index, palette.length - 1)]!);
  return {
    uResolution: [width, height],
    uPalette: slots.flatMap(([r, g, b, a]) => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a]),
    uPaletteSize: palette.length,
    uScale: props.scale,
    uIntensity: props.intensity,
    uCenterFade: props.centerFade,
    uPlateInner: [WEBGL_PLATE.inner.left, WEBGL_PLATE.inner.top, WEBGL_PLATE.inner.right, WEBGL_PLATE.inner.bottom],
    uPlateOuter: [WEBGL_PLATE.outer.left, WEBGL_PLATE.outer.top, WEBGL_PLATE.outer.right, WEBGL_PLATE.outer.bottom],
    uSeed: getShaderSeed(props.seed),
    uBackground: parseColor(props.backgroundColor).slice(0, 3).map(srgbToLinear),
    ...webglExperiments[props.experiment].uniforms(scene, props),
  };
};

export const getWebGLFragmentShader = (experiment: WebGLLoopProps['experiment']) =>
  buildFragmentShader(webglExperiments[experiment].glsl);

export const WebGLLoop = (props: WebGLLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();
  const scene = getWebGLScene(props, frame, durationInFrames);

  return (
    <Canvas {...props}>
      <ShaderCanvas
        fragmentShader={getWebGLFragmentShader(props.experiment)}
        uniforms={getWebGLUniforms(props, scene, width, height)}
        width={width}
        height={height}
      />
    </Canvas>
  );
};
