import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';

export const gradientLoopSchema = baseBackgroundSchema.extend({
  scale: z.number().finite().min(0.25).max(3).default(1).describe('Escala das manchas'),
  intensity: z.number().finite().min(0).max(2).default(1).describe('Intensidade das cores'),
});

export type GradientLoopProps = z.infer<typeof gradientLoopSchema>;

export type GradientBlob = {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  opacity: number;
  color: string;
};

export const getGradientScene = (
  props: GradientLoopProps,
  frame: number,
  durationInFrames: number,
): GradientBlob[] => {
  const random = createSeededRandom(props.seed);
  const phase = loopPhase(frame, durationInFrames);

  return Array.from({length: 7}, (_, index) => {
    const offset = random() * TAU;
    const centerX = randomBetween(random, 240, 1680);
    const centerY = randomBetween(random, 120, 960);
    const orbitX = randomBetween(random, 100, 300);
    const orbitY = randomBetween(random, 70, 200);
    const radius = randomBetween(random, 480, 850) * props.scale;
    const aspect = randomBetween(random, 0.5, 0.85);
    const orientation = randomBetween(random, -80, 80);

    return {
      x: centerX + Math.cos(phase + offset) * orbitX,
      y: centerY + Math.sin(phase + offset) * orbitY,
      radiusX: radius * (1 + Math.sin(phase * 2 + offset) * 0.09),
      radiusY: radius * aspect * (1 + Math.cos(phase + offset) * 0.1),
      rotation: orientation + Math.sin(phase + offset) * 28,
      opacity: (0.42 + Math.sin(phase + offset) * 0.07) * props.intensity,
      color: props.colors[index % props.colors.length]!,
    };
  });
};

export const GradientLoop = (props: GradientLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const blobs = getGradientScene(props, frame, durationInFrames);

  return (
    <Canvas {...props}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
        <defs>
          {blobs.map((blob, index) => (
            <radialGradient key={index} id={`gradient-blob-${index}`}>
              <stop offset="0%" stopColor={blob.color} stopOpacity="1" />
              <stop offset="32%" stopColor={blob.color} stopOpacity="0.75" />
              <stop offset="65%" stopColor={blob.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={blob.color} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        {blobs.map((blob, index) => (
          <ellipse
            key={index}
            cx={blob.x}
            cy={blob.y}
            rx={blob.radiusX}
            ry={blob.radiusY}
            transform={`rotate(${blob.rotation} ${blob.x} ${blob.y})`}
            fill={`url(#gradient-blob-${index})`}
            opacity={blob.opacity}
          />
        ))}
      </svg>
    </Canvas>
  );
};
