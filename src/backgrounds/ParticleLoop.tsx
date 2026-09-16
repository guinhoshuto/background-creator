import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';

export const particleLoopSchema = baseBackgroundSchema.extend({
  count: z.number().int().min(1).max(600).default(100).describe('Quantidade de partículas'),
  size: z.number().finite().min(0.5).max(24).default(3).describe('Tamanho das partículas'),
  distribution: z.enum(['uniform', 'center']).default('uniform').describe('Distribuição das partículas'),
});

export type ParticleLoopProps = z.infer<typeof particleLoopSchema>;

export type Particle = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  color: string;
};

export const getParticleScene = (
  props: ParticleLoopProps,
  frame: number,
  durationInFrames: number,
): Particle[] => {
  const random = createSeededRandom(props.seed);
  const phase = loopPhase(frame, durationInFrames);

  return Array.from({length: props.count}, (_, index) => {
    const offset = random() * TAU;
    const spread = props.distribution === 'center' ? Math.sqrt(random()) * 0.72 : 1;
    const centerX = 960 + randomBetween(random, -1100, 1100) * spread;
    const centerY = 540 + randomBetween(random, -650, 650) * spread;
    const depth = randomBetween(random, 0.3, 1);
    const orbitX = randomBetween(random, 30, 180) * depth;
    const orbitY = randomBetween(random, 25, 90) * depth;
    const radius = props.size * randomBetween(random, 0.35, 1.4);

    return {
      x: centerX + Math.cos(phase + offset) * orbitX + Math.sin(phase * 2 + offset) * 12,
      y: centerY + Math.sin(phase + offset) * orbitY,
      radius: radius * (0.9 + 0.1 * Math.sin(phase + offset)),
      opacity: (0.28 + depth * 0.56) * (0.86 + Math.cos(phase + offset) * 0.14),
      color: props.colors[index % props.colors.length]!,
    };
  });
};

export const ParticleLoop = (props: ParticleLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const particles = getParticleScene(props, frame, durationInFrames);

  return (
    <Canvas {...props}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
        <defs>
          {props.colors.map((color, index) => (
            <radialGradient key={index} id={`particle-glow-${index}`}>
              <stop offset="0%" stopColor={color} stopOpacity="0.5" />
              <stop offset="35%" stopColor={color} stopOpacity="0.13" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        {particles.map((particle, index) => (
          <g key={index} opacity={particle.opacity}>
            <circle
              cx={particle.x}
              cy={particle.y}
              r={particle.radius * 7}
              fill={`url(#particle-glow-${index % props.colors.length})`}
            />
            <circle cx={particle.x} cy={particle.y} r={particle.radius} fill={particle.color} />
            <circle cx={particle.x} cy={particle.y} r={particle.radius * 0.35} fill="white" opacity="0.75" />
          </g>
        ))}
      </svg>
    </Canvas>
  );
};
