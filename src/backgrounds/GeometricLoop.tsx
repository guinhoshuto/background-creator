import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';

export const geometricLoopSchema = baseBackgroundSchema.extend({
  count: z.number().int().min(1).max(100).default(18).describe('Quantidade de formas'),
  scale: z.number().finite().min(0.15).max(3).default(1).describe('Escala das formas'),
});

export type GeometricLoopProps = z.infer<typeof geometricLoopSchema>;

export type GeometricShape = {
  x: number;
  y: number;
  radius: number;
  rotation: number;
  opacity: number;
  sides: number;
  color: string;
};

export const getGeometricScene = (
  props: GeometricLoopProps,
  frame: number,
  durationInFrames: number,
): GeometricShape[] => {
  const random = createSeededRandom(props.seed);
  const phase = loopPhase(frame, durationInFrames);

  return Array.from({length: props.count}, (_, index) => {
    const offset = random() * TAU;
    const centerX = randomBetween(random, 80, 1840);
    const centerY = randomBetween(random, 40, 1040);
    const orbitX = randomBetween(random, 30, 115);
    const orbitY = randomBetween(random, 20, 75);
    const radius = randomBetween(random, 38, 190) * props.scale;
    const initialRotation = randomBetween(random, 0, 360);
    const sides = [0, 3, 4, 6][index % 4]!;

    return {
      x: centerX + Math.cos(phase + offset) * orbitX,
      y: centerY + Math.sin(phase + offset) * orbitY,
      radius: radius * (1 + Math.sin(phase + offset) * 0.04),
      rotation: initialRotation + Math.sin(phase + offset) * 50,
      opacity: 0.22 + (1 + Math.cos(phase + offset)) * 0.13,
      sides,
      color: props.colors[index % props.colors.length]!,
    };
  });
};

const polygonPoints = (sides: number, radius: number) =>
  Array.from({length: sides}, (_, index) => {
    const angle = index / sides * TAU - Math.PI / 2;
    return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`;
  }).join(' ');

export const GeometricLoop = (props: GeometricLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const shapes = getGeometricScene(props, frame, durationInFrames);

  return (
    <Canvas {...props}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
        {shapes.map((shape, index) => (
          <g
            key={index}
            transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}
            opacity={shape.opacity}
            stroke={shape.color}
            strokeWidth="1.75"
            fill="none"
          >
            {shape.sides === 0 ? (
              <>
                <circle r={shape.radius} />
                <circle r={shape.radius * 0.82} opacity="0.3" strokeWidth="0.8" />
              </>
            ) : (
              <>
                <polygon points={polygonPoints(shape.sides, shape.radius)} />
                <polygon points={polygonPoints(shape.sides, shape.radius * 0.82)} opacity="0.3" strokeWidth="0.8" />
              </>
            )}
            <circle cx="0" cy={-shape.radius} r="3" fill={shape.color} stroke="none" />
          </g>
        ))}
      </svg>
    </Canvas>
  );
};
