import {interpolateColors} from 'remotion';
import {createSeededRandom} from '../../loop';
import type {WebGLLoopProps} from '../WebGLLoop';
import type {Uniforms} from './ShaderCanvas';

/**
 * One animated value of a shader scene. Like the SVG scenes, it is a flat record of numbers
 * computed from the props and the frame only, so the shared tests can check determinism,
 * periodicity and the velocity at the seam. The shader receives it packed into uniforms.
 */
export type WebGLElement = {kind: string; opacity: number} & Record<string, string | number>;

export type WebGLExperiment = {
  /** GLSL ES 3.00 appended to the prelude; it must define `vec4 experiment(vec2 px)`. */
  glsl: string;
  /** Every moving value of the picture, from the props and the frame only. */
  scene: (props: WebGLLoopProps, frame: number, durationInFrames: number) => WebGLElement[];
  /** The experiment's own uniforms, named as in `glsl`; the shared ones are added by WebGLLoop. */
  uniforms: (scene: WebGLElement[], props: WebGLLoopProps) => Uniforms;
};

export const fract = (value: number) => value - Math.floor(value);

/**
 * A field that evolves along a periodic noise axis: the axis repeats every `period` lattice
 * units, a whole number, and the cycle crosses it exactly once, so the frame after the last is
 * the first again at the same speed. `rate` is how many lattice units the field travels per
 * second at speed 1; the period is the travel rounded to a whole number (at least one), so the
 * speed the viewer sees stays close to the one asked when durationSeconds changes. With speed
 * 0 the field stands still. The start lies between 20% and 80% of the period, so the wrap of
 * the value never falls on the seam and the value keeps its velocity from the last frame into
 * the first.
 */
export const getNoiseFlow = (
  props: Pick<WebGLLoopProps, 'speed' | 'durationSeconds' | 'seed'>,
  cycle: number,
  rate: number,
  salt: number,
) => {
  const period = Math.max(1, Math.round(props.speed * props.durationSeconds * rate));
  const start = 0.2 + 0.6 * createSeededRandom(props.seed + salt)();
  const turns = props.speed > 0 ? 1 : 0;
  return {period, position: period * fract(start + turns * cycle)};
};

/**
 * Whole turns per cycle for a motion that must close on itself: the nearest to the request,
 * at least one while anything moves, none when the speed is 0.
 */
export const wholeTurns = (turns: number) => (turns > 0 ? Math.max(1, Math.round(turns)) : 0);

/** A CSS colour as straight sRGB channels in 0…1 and its alpha. */
export const parseColor = (color: string): [number, number, number, number] => {
  const normalized = interpolateColors(0, [0, 1], [color, color]);
  const match = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(normalized);
  if (!match) throw new Error(`Unrecognized color: ${color}.`);
  return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255, Number(match[4])];
};

export const srgbToLinear = (channel: number) =>
  (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

/** Collects one numeric field of the elements of a kind, in order, for a uniform array. */
export const pack = (scene: WebGLElement[], kind: string, fields: string[]) =>
  scene.filter((element) => element.kind === kind).flatMap((element) => fields.map((field) => {
    const value = element[field];
    if (typeof value !== 'number') throw new Error(`Element ${kind} has no numeric field ${field}.`);
    return value;
  }));

/** The single element of a kind. */
export const only = (scene: WebGLElement[], kind: string) => {
  const matches = scene.filter((element) => element.kind === kind);
  if (matches.length !== 1) throw new Error(`The scene should have one ${kind} element; it has ${matches.length}.`);
  return matches[0]!;
};
