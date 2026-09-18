import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';

export const sunburstLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(10),
  // Schema, Root literal and presets carry the same seed, so an omitted key never surprises.
  seed: baseBackgroundSchema.shape.seed.default(23),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#5A0F18'),
  colors: baseBackgroundSchema.shape.colors.default(['#9E1A26', '#C42A36'])
    .describe('Paleta dos raios, alternada na ordem; cada raio termina na cor seguinte'),
  rayCount: z.number().int().min(6).max(48).default(20).describe('Quantidade de raios'),
  rayWidth: z.number().finite().min(0.15).max(0.8).default(0.5).describe('Espessura do raio dentro do passo'),
  swirl: z.number().finite().min(0).max(1).default(0.5).describe('Onda que percorre o leque'),
  spin: z.number().int().min(-24).max(24).default(3).describe('Passos que o leque gira por ciclo; negativo inverte o lado'),
  coreFade: z.number().finite().min(0).max(1).default(0.7).describe('Gradiente que dissolve os raios no centro'),
  coreShade: z.number().finite().min(0).max(1).default(0.6).describe('Sombra que escurece o miolo'),
});

export type SunburstLoopProps = z.infer<typeof sunburstLoopSchema>;

export type SunburstElement = {
  kind: 'ray' | 'shade' | 'core';
  /** Centre of the wedge, in degrees; zero for the shadow in the middle. */
  angle: number;
  /** Half the opening of the wedge, in degrees; zero for the shadow in the middle. */
  halfWidth: number;
  radius: number;
  opacity: number;
  /** Index into the palette. */
  variant: number;
};

export const CENTER_X = 960;
export const CENTER_Y = 540;
/** Past the 1102 px corner distance, so every wedge leaves the frame on all four sides. */
export const RAY_LENGTH = 1180;
/** How much the wave opens and closes a ray. */
const WAVE_DEPTH = 0.12;
/**
 * Crests the wave carries around the circle. An integer closes the ring: the field meets
 * itself at 360°, so a ray crossing that line finds the same wave on the other side.
 */
const WAVE_TURNS = 2;
const RADIAN = Math.PI / 180;

/**
 * Widest a ray can get, as a fraction of the step between two rays. The factors below
 * multiply to 0.8 × 1.12 = 0.896, so two neighbours always keep a gap.
 */
export const getMaxHalfWidth = (props: Pick<SunburstLoopProps, 'rayCount' | 'rayWidth' | 'swirl'>) =>
  (180 / props.rayCount) * props.rayWidth * (1 + WAVE_DEPTH * props.swirl);

/**
 * What a ray looks like at a given place in the frame. The wave is anchored to the angle,
 * not to the ray, which is what lets the fan spin: a ray that leaves a place finds the
 * next ray arriving with exactly the shape the place asks for.
 */
export const getRayField = (
  props: SunburstLoopProps,
  angle: number,
  phase: number,
  waveOffset: number,
) => {
  const wave = Math.sin(WAVE_TURNS * angle * RADIAN - phase + waveOffset);
  const step = 360 / props.rayCount;
  return {
    halfWidth: step * 0.5 * props.rayWidth * (1 + WAVE_DEPTH * props.swirl * wave),
    opacity: 1 - 0.11 * props.swirl * (1 - wave),
  };
};

/**
 * Every animated property lives here, so the seam tests cover the entire scene.
 * The fan turns one way only. Over a cycle it advances `spin` whole steps, so the frame
 * after the last one is the first one again: each ray simply stands where its neighbour
 * stood. The picture is continuous at the seam; a single element is not, because it hands
 * its place over — tests/sunburst.test.ts checks the rotation and the field instead.
 */
export const getSunburstScene = (
  props: SunburstLoopProps,
  frame: number,
  durationInFrames: number,
): SunburstElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  const random = createSeededRandom(props.seed + 137);
  const step = 360 / props.rayCount;
  // A spinning fan cannot carry a per-ray quirk: it would land on another ray at the seam.
  // So the seed places the whole fan and the whole wave instead of each ray.
  const startAngle = randomBetween(random, 0, step);
  const waveOffset = randomBetween(random, 0, TAU);
  // Whole steps per cycle: at the end the fan has moved onto its own rays.
  const spinAngle = props.spin * step * (phase / TAU);
  const breath = Math.sin(2 * phase);

  const rays = Array.from({length: props.rayCount}, (_, index): SunburstElement => {
    const angle = startAngle + index * step + spinAngle;
    return {
      kind: 'ray',
      angle,
      radius: RAY_LENGTH,
      variant: index % props.colors.length,
      ...getRayField(props, angle, phase, waveOffset),
    };
  });

  // Two layers so the shadow has a soft skirt and a dense middle instead of a visible disc.
  const shade: SunburstElement = {
    kind: 'shade',
    angle: 0,
    halfWidth: 0,
    radius: (520 + 320 * props.coreShade) * (1 + 0.05 * breath),
    opacity: props.coreShade * (0.3 + 0.05 * breath),
    variant: 0,
  };

  const core: SunburstElement = {
    kind: 'core',
    angle: 0,
    halfWidth: 0,
    radius: (200 + 220 * props.coreShade) * (1 - 0.06 * breath),
    opacity: props.coreShade * (0.45 + 0.08 * Math.cos(2 * phase)),
    variant: 0,
  };

  return [...rays, shade, core];
};

/** A much darker version of a #RRGGBB colour: the shadow keeps the palette's hue. */
const shade = (color: string, factor: number) => {
  const channels = [1, 3, 5].map((start) =>
    Math.round(Number.parseInt(color.slice(start, start + 2), 16) * factor));
  return `rgb(${channels.join(', ')})`;
};

const polar = (degrees: number, radius: number) => {
  const radians = (degrees * Math.PI) / 180;
  return `${(CENTER_X + Math.cos(radians) * radius).toFixed(2)} ${(CENTER_Y + Math.sin(radians) * radius).toFixed(2)}`;
};

/** A wedge closed by an arc, so the ray reaches the corners with its full width. */
const wedge = (ray: SunburstElement) =>
  `M ${CENTER_X} ${CENTER_Y} L ${polar(ray.angle - ray.halfWidth, ray.radius)}` +
  ` A ${ray.radius} ${ray.radius} 0 0 1 ${polar(ray.angle + ray.halfWidth, ray.radius)} Z`;

export const SunburstLoop = (props: SunburstLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scene = getSunburstScene(props, frame, durationInFrames);
  const ofKind = (kind: SunburstElement['kind']) => scene.filter((item) => item.kind === kind);
  const shadow = shade(props.backgroundColor, 0.28);

  return (
    <Canvas {...props}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
        <defs>
          {/* The centre-out gradient: the ray dissolves at the middle, firms up and changes
              colour on the way out. In user space, so every ray shares the same sun. */}
          {props.colors.map((color, index) => (
            <radialGradient key={index} id={`sunburst-ray-${index}`} gradientUnits="userSpaceOnUse"
              cx={CENTER_X} cy={CENTER_Y} r={RAY_LENGTH}>
              <stop stopColor={color} stopOpacity={1 - 0.96 * props.coreFade} />
              <stop offset="0.12" stopColor={color} stopOpacity={1 - 0.68 * props.coreFade} />
              <stop offset="0.34" stopColor={color} stopOpacity={1 - 0.24 * props.coreFade} />
              <stop offset="0.66" stopColor={props.colors[(index + 1) % props.colors.length]} stopOpacity="1" />
              <stop offset="1" stopColor={props.colors[(index + 1) % props.colors.length]} stopOpacity="0.88" />
            </radialGradient>
          ))}
          {/* The shadow keeps the hue of the background instead of greying the frame. */}
          <radialGradient id="sunburst-shade">
            <stop stopColor={shadow} stopOpacity="0.9" />
            <stop offset="0.45" stopColor={shadow} stopOpacity="0.45" />
            <stop offset="1" stopColor={shadow} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sunburst-core">
            <stop stopColor={shadow} stopOpacity="1" />
            <stop offset="0.5" stopColor={shadow} stopOpacity="0.6" />
            <stop offset="1" stopColor={shadow} stopOpacity="0" />
          </radialGradient>
        </defs>

        {ofKind('ray').map((ray, index) => (
          <path key={index} d={wedge(ray)} fill={`url(#sunburst-ray-${ray.variant})`} opacity={ray.opacity} />
        ))}

        {/* Above the rays: the middle darkens whole, gaps and rays together. */}
        {ofKind('shade').map((shade, index) => (
          <circle key={index} cx={CENTER_X} cy={CENTER_Y} r={shade.radius}
            fill="url(#sunburst-shade)" opacity={shade.opacity} />
        ))}

        {ofKind('core').map((core, index) => (
          <circle key={index} cx={CENTER_X} cy={CENTER_Y} r={core.radius}
            fill="url(#sunburst-core)" opacity={core.opacity} />
        ))}
      </svg>
    </Canvas>
  );
};
