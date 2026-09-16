import {GeometricLoop, geometricLoopSchema} from './backgrounds/GeometricLoop';
import {GradientLoop, gradientLoopSchema} from './backgrounds/GradientLoop';
import {ParticleLoop, particleLoopSchema} from './backgrounds/ParticleLoop';

/** One registry shared by the Studio, renderer, validation, and documentation. */
export const backgroundCatalog = {
  GradientLoop: {
    id: 'GradientLoop',
    component: GradientLoop,
    schema: gradientLoopSchema,
    defaultProps: gradientLoopSchema.parse({}),
  },
  ParticleLoop: {
    id: 'ParticleLoop',
    component: ParticleLoop,
    schema: particleLoopSchema,
    defaultProps: particleLoopSchema.parse({}),
  },
  GeometricLoop: {
    id: 'GeometricLoop',
    component: GeometricLoop,
    schema: geometricLoopSchema,
    defaultProps: geometricLoopSchema.parse({}),
  },
} as const;

export type BackgroundId = keyof typeof backgroundCatalog;

export const getBackground = (id: string) => {
  if (!Object.prototype.hasOwnProperty.call(backgroundCatalog, id)) {
    throw new Error(`Background desconhecido: ${id}. Opções: ${Object.keys(backgroundCatalog).join(', ')}.`);
  }
  return backgroundCatalog[id as BackgroundId];
};
