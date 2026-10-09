import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';
import {pigmentUniform, type WatercolorScene} from './watercolor/paint';
import {flow} from './watercolor/flow';
import {koi} from './watercolor/koi';
import {valley} from './watercolor/valley';
import {getShaderSeed, WEBGL_PLATE} from './WebGLLoop';
import {buildFragmentShader} from './webgl/glsl';
import {parseColor, srgbToLinear, type WebGLElement} from './webgl/scene';
import {ShaderCanvas, type Uniforms} from './webgl/ShaderCanvas';

/** The paintings, in the order the Studio lists them. */
export const WATERCOLOR_SCENES = ['flow', 'valley', 'koi'] as const;
export type WatercolorSceneId = (typeof WATERCOLOR_SCENES)[number];

const scenes: Record<WatercolorSceneId, WatercolorScene> = {valley, flow, koi};
const fragmentShaders = Object.fromEntries(
  WATERCOLOR_SCENES.map((id) => [id, buildFragmentShader(scenes[id].glsl)]),
) as Record<WatercolorSceneId, string>;

// Descriptions go before the defaults so the Studio shows them; colours stay undescribed,
// because a description replaces the Studio colour picker with a text field.
export const watercolorLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(16),
  seed: baseBackgroundSchema.shape.seed.default(11),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#F6F0E2'),
  colors: baseBackgroundSchema.shape.colors.default(['#6C4BA6', '#D65A8E', '#A2479F', '#B49CE0']),
  scene: z.enum(WATERCOLOR_SCENES)
    .describe('Painting: flow (pools of pigment bleeding wet-on-wet round a light middle), valley (misty mountains over a still lake) or koi (a koi pond seen from above)')
    .default('flow'),
  speed: z.number().finite().min(0).max(3)
    .describe('Pace of the motion: 1 is the calm base pace and 0 holds the painting still. The cycle rounds every motion to whole turns, so the pace you see may differ a little from the one requested')
    .default(1),
  granulation: z.number().finite().min(0).max(1)
    .describe('How much the pigment settles into the tooth of the paper, as grainy specks')
    .default(0.7),
  paperTexture: z.number().finite().min(0).max(1)
    .describe('How much the tooth and the cockles of the paper show on bare paper')
    .default(1),
  centerCalm: z.number().finite().min(0).max(1)
    .describe('Lightens the paint behind the 16:9 content area, for title, camera and game')
    .default(0.3),
});

export type WatercolorLoopProps = z.infer<typeof watercolorLoopSchema>;

/** Every animated value of the painting, from the props and the frame only. */
export const getWatercolorScene = (props: WatercolorLoopProps, frame: number, durationInFrames: number): WebGLElement[] =>
  scenes[props.scene].scene(props, frame, durationInFrames);

/** The prelude's shared uniforms, the paint's and the painting's own. */
export const getWatercolorUniforms = (
  props: WatercolorLoopProps,
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
    uScale: 1,
    uIntensity: 1,
    // The paintings clear their own centre (centerCalm), each in its own way.
    uCenterFade: 0,
    uPlateInner: [WEBGL_PLATE.inner.left, WEBGL_PLATE.inner.top, WEBGL_PLATE.inner.right, WEBGL_PLATE.inner.bottom],
    uPlateOuter: [WEBGL_PLATE.outer.left, WEBGL_PLATE.outer.top, WEBGL_PLATE.outer.right, WEBGL_PLATE.outer.bottom],
    uSeed: getShaderSeed(props.seed),
    uBackground: parseColor(props.backgroundColor).slice(0, 3).map(srgbToLinear),
    uPigment: pigmentUniform(props.colors),
    uLook: [props.granulation, props.paperTexture, props.centerCalm],
    ...scenes[props.scene].uniforms(scene, props),
  };
};

export const getWatercolorFragmentShader = (scene: WatercolorSceneId) => fragmentShaders[scene];

export const WatercolorLoop = (props: WatercolorLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();
  const scene = getWatercolorScene(props, frame, durationInFrames);

  return (
    <Canvas {...props}>
      <ShaderCanvas
        fragmentShader={getWatercolorFragmentShader(props.scene)}
        uniforms={getWatercolorUniforms(props, scene, width, height)}
        width={width}
        height={height}
      />
    </Canvas>
  );
};
