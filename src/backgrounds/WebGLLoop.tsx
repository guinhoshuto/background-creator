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
    .describe('Experimento de shader: aurora, lava, silk (seda), caustics (fundo do mar), cells (células), contours (curvas de nível), nebula (nebulosa), watercolor (aquarela), mesh (gradiente em malha) ou um da série pastel: flow (onda), orbital (esfera), neon (dobra neon), layers (camadas), haze (entardecer) ou eclipse')
    .default('aurora'),
  speed: z.number().finite().min(0).max(3)
    .describe('Ritmo do movimento: 1 é o ritmo base do experimento e 0 deixa a imagem parada. O ciclo arredonda o percurso para voltas inteiras, então o ritmo visto pode diferir um pouco do pedido')
    .default(1),
  scale: z.number().finite().min(0.5).max(2)
    .describe('Tamanho das formas: acima de 1 elas crescem, abaixo diminuem')
    .default(1),
  intensity: z.number().finite().min(0).max(2)
    .describe('Brilho e cobertura da camada do experimento sobre a cor de fundo')
    .default(1),
  centerFade: z.number().finite().min(0).max(1)
    .describe('Suaviza o miolo 16:9 em direção à cor de fundo, para título, câmera e jogo; no WebM transparente, deixa o miolo transparente')
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
