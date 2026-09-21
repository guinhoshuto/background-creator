import {GeometricLoop, geometricLoopSchema} from './backgrounds/GeometricLoop';
import {GradientLoop, gradientLoopSchema} from './backgrounds/GradientLoop';
import {ParticleLoop, particleLoopSchema} from './backgrounds/ParticleLoop';
import {HalloweenLoop, halloweenLoopSchema} from './backgrounds/HalloweenLoop';
import {HauntedMansionLoop, hauntedMansionLoopSchema} from './backgrounds/HauntedMansionLoop';
import {HauntedInteriorLoop, hauntedInteriorLoopSchema} from './backgrounds/HauntedInteriorLoop';
import {KawaiiLoop, kawaiiLoopSchema} from './backgrounds/KawaiiLoop';
import {CobwebLoop, cobwebLoopSchema} from './backgrounds/CobwebLoop';
import {SunburstLoop, sunburstLoopSchema} from './backgrounds/SunburstLoop';

/** One registry shared by the Studio, renderer, validation, and documentation. */
export const backgroundCatalog = {
  KawaiiLoop: {
    id: 'KawaiiLoop',
    component: KawaiiLoop,
    schema: kawaiiLoopSchema,
    defaultProps: kawaiiLoopSchema.parse({}),
  },
  HalloweenLoop: {
    id: 'HalloweenLoop',
    component: HalloweenLoop,
    schema: halloweenLoopSchema,
    defaultProps: halloweenLoopSchema.parse({}),
  },
  HauntedMansionLoop: {
    id: 'HauntedMansionLoop',
    component: HauntedMansionLoop,
    schema: hauntedMansionLoopSchema,
    defaultProps: hauntedMansionLoopSchema.parse({}),
  },
  HauntedInteriorLoop: {
    id: 'HauntedInteriorLoop',
    component: HauntedInteriorLoop,
    schema: hauntedInteriorLoopSchema,
    defaultProps: hauntedInteriorLoopSchema.parse({}),
  },
  CobwebLoop: {
    id: 'CobwebLoop',
    component: CobwebLoop,
    schema: cobwebLoopSchema,
    defaultProps: cobwebLoopSchema.parse({}),
  },
  SunburstLoop: {
    id: 'SunburstLoop',
    component: SunburstLoop,
    schema: sunburstLoopSchema,
    defaultProps: sunburstLoopSchema.parse({}),
  },
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
