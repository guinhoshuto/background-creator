import type {WebGLExperimentId} from '../ids';
import type {WebGLExperiment} from '../scene';
import {aurora} from './aurora';
import {caustics} from './caustics';
import {cells} from './cells';
import {contours} from './contours';
import {eclipse} from './eclipse';
import {flow} from './flow';
import {haze} from './haze';
import {lava} from './lava';
import {layers} from './layers';
import {mesh} from './mesh';
import {nebula} from './nebula';
import {neon} from './neon';
import {orbital} from './orbital';
import {silk} from './silk';
import {watercolor} from './watercolor';

/** One module per experiment; each owns its GLSL, its scene and its uniforms. */
export const webglExperiments: Record<WebGLExperimentId, WebGLExperiment> = {
  aurora, lava, silk, caustics, cells, contours, nebula, flow, orbital, neon, layers, haze, eclipse, watercolor, mesh,
};
