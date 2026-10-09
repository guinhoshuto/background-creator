import {createSeededRandom, TAU} from '../../loop';
import {absorbance, PIGMENT_GLSL} from '../webgl/pigment';
import {wholeTurns, type WebGLElement} from '../webgl/scene';
import type {Uniforms} from '../webgl/ShaderCanvas';
import type {WatercolorLoopProps} from '../WatercolorLoop';

/** Palette slots the shader reserves: the prelude's six. */
export const SLOTS = 6;

/**
 * One painting: its GLSL (a `vec4 experiment(vec2 px)` written with PAINT_GLSL), every moving
 * value of it from the props and the frame only, and its own uniforms.
 */
export type WatercolorScene = {
  glsl: string;
  scene: (props: WatercolorLoopProps, frame: number, durationInFrames: number) => WebGLElement[];
  uniforms: (scene: WebGLElement[], props: WatercolorLoopProps) => Uniforms;
};

/** Seconds of motion at speed 1 that one cycle holds. */
export const travelOf = (props: Pick<WatercolorLoopProps, 'speed' | 'durationSeconds'>) => props.speed * props.durationSeconds;

/**
 * A motion that closes on whole turns per cycle: the nearest to one turn every `seconds` at speed
 * 1, and how far it swings (below one turn per cycle it swings less instead of hurrying).
 */
export const turnsEvery = (props: Pick<WatercolorLoopProps, 'speed' | 'durationSeconds'>, seconds: number) => {
  const pace = travelOf(props) / seconds;
  const turns = wholeTurns(pace);
  return {turns, reach: turns > 0 ? Math.min(1, pace / turns) : 1};
};

/**
 * A drifting texture that loops: two copies of it half a life apart, each sliding along while it
 * fades in and out, so that neither ever jumps in sight (the shader's driftFbm). Each copy lives
 * about `lifeSeconds` at speed 1, a whole number of lives per cycle, and slides as far in a life
 * as `pace` px per second carries it, so its speed holds for any duration. With speed 0 it rests.
 */
export const driftFlow = (
  props: Pick<WatercolorLoopProps, 'speed' | 'durationSeconds' | 'seed'>,
  phase: number,
  pace: number,
  lifeSeconds: number,
  salt: number,
): WebGLElement => {
  const travel = travelOf(props);
  const lives = wholeTurns(travel / lifeSeconds);
  const angle = lives * phase + createSeededRandom(props.seed + salt)() * TAU;
  return {
    kind: 'drift',
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    drift: lives > 0 ? (pace * travel) / lives : 0,
    opacity: 1,
  };
};

/**
 * A point that goes once round a circle through a noise volume per cycle, as long as the ground
 * the noise covers at `rate` lattice units per second: the pigment churns in place and comes
 * back. Speed 0 holds it.
 */
export const churnFlow = (
  props: Pick<WatercolorLoopProps, 'speed' | 'durationSeconds' | 'seed'>,
  phase: number,
  rate: number,
  salt: number,
): WebGLElement => {
  const random = createSeededRandom(props.seed + salt);
  const radius = (rate * travelOf(props)) / TAU;
  const heading = random() * TAU;
  const angle = phase + random() * TAU;
  return {
    kind: 'churn',
    x: 40 + radius * Math.cos(angle) * Math.cos(heading),
    y: 40 + radius * Math.cos(angle) * Math.sin(heading),
    z: 40 + radius * Math.sin(angle),
    opacity: 1,
  };
};

/** The pigment of every palette slot, as the optical density of one load in the 8 bands. */
export const pigmentUniform = (colors: readonly string[]) =>
  Array.from({length: SLOTS}, (_, index) => colors[Math.min(index, colors.length - 1)]!).flatMap(absorbance);

/**
 * The GLSL every painting shares, after the prelude: the pigment bands, the paper and its tooth,
 * glazes that add up like real pigment, edges that dry dark, drifting and churning noise, and the
 * one way the paint is laid over the paper so that a transparent export is the same layer.
 */
export const PAINT_GLSL = /* glsl */ `
${PIGMENT_GLSL}
// Per palette slot: optical density of one load in the 8 bands (two vec4 each).
uniform vec4 uPigment[${2 * SLOTS}];
// Per palette slot: how strongly its pigment settles into the tooth of the paper.
uniform float uGranule[${SLOTS}];
// How much the paint granulates, how much the paper's tooth shows, and how far the centre clears.
uniform vec3 uLook;

const mat2 TURN_A = mat2(0.8, 0.6, -0.6, 0.8);
const mat2 TURN_B = mat2(0.28, -0.96, 0.96, 0.28);
// Paper: shade of the valleys, of the relief lit from the upper left, of the uneven sizing and
// of the cockles a wet sheet dries into.
const float GRAIN_VALLEY = 0.024;
const float GRAIN_RELIEF = 0.02;
const float GRAIN_TONE = 0.014;
const float COCKLE = 0.018;
// How far a dried edge follows the tooth of the paper (px).
const float CRINKLE = 1.6;

// The paint laid so far, as optical density in the 8 bands.
vec4 gLow;
vec4 gHigh;
// The tooth under the current pixel: height (0 valleys, 1 peaks), relief and clumps; the share
// of pigment its valleys hold, and how far a dried edge strays along it.
vec3 gTooth;
float gGranules;
float gCrinkle;

float sq(float x) { return x * x; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/**
 * |n| with its crease rounded over a few hundredths: shapes still meet in cusps to the eye, but
 * the field has no kink for screen derivatives to turn into 2x2 blocks.
 */
float softAbs(float n) { return sqrt(n * n + 0.01); }

/** 1D gradient noise, about -1…1, over x in lattice units; salt picks an unrelated one. */
float noise1(float x, uint salt) {
  float i = floor(x);
  float f = x - i;
  uint cell = uint(int(i) + 65536);
  float g0 = unit(hash(cell, salt)) * 2.0 - 1.0;
  float g1 = unit(hash(cell + 1u, salt)) * 2.0 - 1.0;
  float u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return 2.0 * mix(g0 * f, g1 * (f - 1.0), u);
}

/** Cold-pressed tooth, in pixels; it never moves and never scales. */
vec3 paperTooth(vec2 px) {
  vec2 a = TURN_A * px / 3.8;
  float fine = perlin(vec3(a, 0.37), NO_PERIOD);
  float lit = perlin(vec3(a - TURN_A * vec2(1.2) / 3.8, 0.37), NO_PERIOD);
  float mid = perlin(vec3(TURN_B * px / 9.5 + 31.0, 1.61), NO_PERIOD);
  float coarse = perlin(vec3(px / 26.0 + 77.0, 2.83), NO_PERIOD);
  float height = clamp(0.5 + 0.55 * fine + 0.35 * mid + 0.22 * coarse, 0.0, 1.0);
  return vec3(height, fine - lit, 0.7 * mid + 0.9 * coarse);
}

/** Starts a pixel on bare paper. */
void beginPaint(vec2 px) {
  gLow = vec4(0.0);
  gHigh = vec4(0.0);
  gTooth = paperTooth(px);
  // Pigment settles into the valleys and clumps, in patches where the wash pooled, not evenly.
  float patches = smoothstep(-0.25, 0.45, perlin(vec3(px / 95.0 + 57.0, 3.9), NO_PERIOD));
  gGranules = (0.6 * (0.5 - gTooth.x) + 0.4 * gTooth.z) * (0.25 + 0.75 * patches);
  gCrinkle = CRINKLE * (0.35 * gTooth.z + 0.4 * (gTooth.x - 0.5));
}

/** How much more (or less) pigment of a slot this pixel holds, from where it settled in the tooth. */
float settle(int slot) { return max(1.0 + 1.6 * uLook.x * uGranule[slot] * gGranules, 0.0); }

/** Lays \`load\` of a palette slot's pigment on the pixel, settled into the tooth. */
void glaze(int slot, float load) {
  float rho = max(load, 0.0) * settle(slot) * paletteColor(slot).a;
  gLow += rho * uPigment[2 * slot];
  gHigh += rho * uPigment[2 * slot + 1];
}

/** Distance (px) to the zero of a field, positive where it is positive, from its screen gradient. */
float fieldDistance(float f) {
  return f / max(length(vec2(dFdx(f), dFdy(f))), 1e-6);
}

/**
 * How much of a wash covers a pixel \`d\` px inside its edge: a dried edge is a one-pixel ramp
 * that follows the tooth; a wet edge (hard 0) spreads over \`soft\` px and feathers with \`fringe\`
 * (about -1…1).
 */
float washCover(float d, float hard, float soft, float fringe) {
  float dried = clamp(0.5 + d + gCrinkle, 0.0, 1.0);
  float wet = smoothstep(-soft, 0.6 * soft, d + 0.5 * soft * fringe);
  return mix(wet, dried, hard);
}

/**
 * The load a dried edge leaves along itself: pigment pools into a dark rim a few pixels wide and
 * leaves a paler zone just inside it. 1 away from any edge.
 */
float edgeLoad(float d, float hard, float rim) {
  float inside = max(d + gCrinkle, 0.0);
  return 1.0 + hard * (1.4 * exp(-inside / rim) - 0.22 * exp(-inside / (9.0 * rim)));
}

/**
 * Where along its life a drift is (0…1) at this pixel, from the cosine and sine of its phase;
 * \`skew\` (0…1) staggers neighbourhoods, so they do not fade in step.
 */
float lifeOf(vec2 phase, float skew) {
  return fract(atan(phase.y, phase.x) / TAU + skew + 1.0);
}

/**
 * Fractal noise drifting by \`shift\` lattice units per life: two copies half a life apart, each
 * fading out before it jumps back, mixed so the contrast holds steady (about -1…1).
 */
float driftFbm(vec2 q, vec2 shift, float life, float salt, int octaves) {
  float other = fract(life + 0.5);
  float wa = sq(sin(PI * life));
  float wb = 1.0 - wa;
  float na = fbm(vec3(q - shift * (life - 0.5), salt), NO_PERIOD, octaves);
  float nb = fbm(vec3(q - shift * (other - 0.5) + vec2(31.7, 11.3), salt + 7.0), NO_PERIOD, octaves);
  return (wa * na + wb * nb) / sqrt(wa * wa + wb * wb);
}

/**
 * The layer that, composed over the paper in sRGB like the browser does, gives \`target\`: the
 * least coverage that can move the paper that far in every channel, and the colour it carries.
 */
vec4 overPaper(vec3 target, vec3 paper) {
  vec3 darker = (paper - target) / max(paper, vec3(1e-4));
  vec3 lighter = (target - paper) / max(1.0 - paper, vec3(1e-4));
  vec3 need = max(darker, lighter);
  float alpha = clamp(max(need.r, max(need.g, need.b)), 0.0, 1.0);
  if (alpha < 1e-5) return vec4(0.0);
  vec3 color = clamp((target - paper * (1.0 - alpha)) / alpha, 0.0, 1.0);
  return vec4(srgbToLinear(color) * alpha, alpha);
}

/**
 * The finished pixel: the paper shaded by its tooth and cockles, filtered by every glaze laid
 * on it, as the layer over the plain paper (opaque exports compose it back over the paper).
 */
vec4 finishPaint(vec2 px) {
  float cockle = perlin(vec3(px / 340.0 + 13.0, 6.1), NO_PERIOD);
  float sizing = perlin(vec3(px / 120.0 + 101.0, 4.21), NO_PERIOD);
  float grain = uLook.y * (GRAIN_VALLEY * (1.0 - gTooth.x) + GRAIN_RELIEF * max(gTooth.y, 0.0)
    + GRAIN_TONE * (0.5 + 0.5 * sizing) + COCKLE * (0.5 + 0.5 * cockle));
  vec3 shaded = uBackground * (1.0 - grain);
  vec3 filtered = bandsToRgb(exp(-gLow), exp(-gHigh));
  return overPaper(linearToSrgb(shaded * filtered), linearToSrgb(uBackground));
}
`;
