/**
 * The GLSL every experiment shares. An experiment only writes `vec4 experiment(vec2 px)`: the
 * prelude gives it the common uniforms, integer hashes, periodic noise and the palette, and
 * `main` turns its layer into the canvas colour with the one alpha rule of the project.
 *
 * Time never reaches a shader directly: every moving value is a uniform computed from the
 * frame by the experiment's scene, so the picture depends on the frame and the props only.
 */
export const GLSL_PRELUDE = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uResolution;
// Palette in linear light, with each colour's own alpha; slots past uPaletteSize repeat the last.
uniform vec4 uPalette[6];
uniform int uPaletteSize;
uniform float uScale;
uniform float uIntensity;
uniform float uCenterFade;
// The content plate, as left, top, right and bottom in pixels (y grows downwards): the clearing
// is flat up to about the inner rectangle and fades out at the outer one.
uniform vec4 uPlateInner;
uniform vec4 uPlateOuter;
uniform uint uSeed;
// backgroundColor in linear light: the base tone (or the paper) the layer is composed over.
uniform vec3 uBackground;

out vec4 outColor;

const float PI = 3.14159265358979;
const float TAU = 6.28318530717959;
// Lattice period for axes that do not need to repeat: large enough never to show.
const float NO_PERIOD = 4096.0;

// Integer hashes (PCG): exact on every GPU. A sin-based hash such as fract(sin(x) * 43758.5)
// gives different pictures on different GPUs and drivers, so it is not used anywhere.
uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
uint hash(uint a) { return pcg(a ^ pcg(uSeed)); }
uint hash(uint a, uint b) { return pcg(a ^ pcg(b ^ pcg(uSeed))); }
uint hash(uint a, uint b, uint c) { return pcg(a ^ pcg(b ^ pcg(c ^ pcg(uSeed)))); }
/** Uniform float in [0, 1): 24 bits fit a float mantissa exactly. */
float unit(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }

/**
 * Wraps whole-number lattice coordinates into [0, period). The half-step offset keeps the
 * division away from exact integers, so a GPU's approximate division can never round a
 * corner into the wrong period (a plain mod() can, and then the loop would not close).
 */
vec3 wrapCell(vec3 cell, vec3 period) { return cell - period * floor((cell + 0.5) / period); }
vec2 wrapCell(vec2 cell, vec2 period) { return cell - period * floor((cell + 0.5) / period); }

/** Improved-Perlin gradient: one of 12 cube-edge directions, dotted with the offset. */
float gradientDot(uint h, vec3 d) {
  h &= 15u;
  float u = h < 8u ? d.x : d.y;
  float v = h < 4u ? d.y : (h == 12u || h == 14u ? d.x : d.z);
  return ((h & 1u) == 0u ? u : -u) + ((h & 2u) == 0u ? v : -v);
}

float perlinCorner(vec3 cell, vec3 corner, vec3 f, vec3 period) {
  vec3 c = wrapCell(cell + corner, period);
  return gradientDot(hash(uint(c.x), uint(c.y), uint(c.z)), f - corner);
}

/**
 * 3D gradient noise, about -1…1, that repeats along each axis every \`period\` lattice units
 * (whole numbers). Use NO_PERIOD for an axis that does not need to repeat.
 */
float perlin(vec3 p, vec3 period) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = perlinCorner(i, vec3(0.0, 0.0, 0.0), f, period);
  float n100 = perlinCorner(i, vec3(1.0, 0.0, 0.0), f, period);
  float n010 = perlinCorner(i, vec3(0.0, 1.0, 0.0), f, period);
  float n110 = perlinCorner(i, vec3(1.0, 1.0, 0.0), f, period);
  float n001 = perlinCorner(i, vec3(0.0, 0.0, 1.0), f, period);
  float n101 = perlinCorner(i, vec3(1.0, 0.0, 1.0), f, period);
  float n011 = perlinCorner(i, vec3(0.0, 1.0, 1.0), f, period);
  float n111 = perlinCorner(i, vec3(1.0, 1.0, 1.0), f, period);
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z);
}

/** Noise over the plane that evolves along z, repeating every \`zPeriod\` (a whole number). */
float perlin(vec3 p, float zPeriod) { return perlin(p, vec3(NO_PERIOD, NO_PERIOD, zPeriod)); }

/**
 * Fractal noise, about -1…1, with up to 8 octaves. Each octave doubles the frequency and
 * the z period with it, so the sum repeats along z every \`zPeriod\` like one octave does.
 * The plane turns between octaves to hide the lattice; z is never turned or shifted.
 */
float fbm(vec3 p, float zPeriod, int octaves) {
  float sum = 0.0;
  float amplitude = 0.5;
  float norm = 0.0;
  float period = zPeriod;
  for (int octave = 0; octave < 8; octave++) {
    if (octave >= octaves) break;
    sum += amplitude * perlin(p, period);
    norm += amplitude;
    p.xy = mat2(1.6, -1.2, 1.2, 1.6) * p.xy + vec2(19.19, 7.73);
    p.z *= 2.0;
    period *= 2.0;
    amplitude *= 0.5;
  }
  return sum / norm;
}

/** Palette colour i (linear light), with its alpha. */
vec4 paletteColor(int i) { return uPalette[clamp(i, 0, uPaletteSize - 1)]; }

/** Ramp through the palette in order: 0 is the first colour, 1 the last. */
vec4 paletteRamp(float t) {
  float x = clamp(t, 0.0, 1.0) * float(uPaletteSize - 1);
  int i = int(floor(x));
  return mix(paletteColor(i), paletteColor(i + 1), smoothstep(0.0, 1.0, x - float(i)));
}

/** Cyclic ramp: after the last colour comes the first again, so any t is valid. */
vec4 paletteLoop(float t) {
  float x = fract(t) * float(uPaletteSize);
  int i = int(floor(x));
  int j = i + 1 >= uPaletteSize ? 0 : i + 1;
  return mix(paletteColor(i), paletteColor(j), smoothstep(0.0, 1.0, x - float(i)));
}

/**
 * How much of the content plate covers a pixel: 1 in the middle, 0 at the frame edges. The
 * clearing is a superellipse (exponent 3) spanning the outer rectangle, whose flat top reaches
 * about the inner one: it has no straight edge, so on a full-frame design it reads as a soft
 * clearing rather than a darker rectangle, and the content box corners stay more than half covered.
 */
float plateWeight(vec2 px) {
  vec2 centre = 0.5 * (uPlateInner.xy + uPlateInner.zw);
  vec2 outer = 0.5 * (uPlateOuter.zw - uPlateOuter.xy);
  vec2 inner = 0.5 * (uPlateInner.zw - uPlateInner.xy);
  vec2 q = abs(px - centre) / outer;
  float d = pow(pow(q.x, 3.0) + pow(q.y, 3.0), 1.0 / 3.0);
  float start = 0.5 * (inner.x / outer.x + inner.y / outer.y);
  return 1.0 - smoothstep(start, 1.0, d);
}

vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 srgbToLinear(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
`;

/**
 * The experiment returns premultiplied linear light: rgb already multiplied by the alpha, the
 * share of the pixel its layer covers. The canvas sits on the Canvas background, so an opaque
 * export is exactly the WebM alpha layer composed over backgroundColor.
 */
export const GLSL_MAIN = /* glsl */ `
void main() {
  // Pixel centres in the composition's own units: x to the right, y downwards, like the SVG scenes.
  vec2 px = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec4 layer = experiment(px);
  layer.a = clamp(layer.a, 0.0, 1.0);
  layer.rgb = clamp(layer.rgb, vec3(0.0), vec3(layer.a));
  layer *= 1.0 - uCenterFade * plateWeight(px);
  vec3 color = layer.a > 0.0 ? linearToSrgb(layer.rgb / layer.a) : vec3(0.0);
  // The same dither on every frame: it breaks 8-bit banding in slow gradients without flicker.
  float dither = (unit(hash(uint(gl_FragCoord.x), uint(gl_FragCoord.y), 40503u)) - 0.5) / 255.0;
  color = clamp(color + dither, 0.0, 1.0);
  float alpha = layer.a;
  if (alpha > 0.0 && alpha < 1.0) alpha = clamp(alpha + dither, 0.0, 1.0);
  outColor = vec4(color * alpha, alpha);
}
`;

/** Draws one triangle that covers the whole viewport; it needs no vertex buffer. */
export const GLSL_VERTEX = /* glsl */ `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const buildFragmentShader = (experimentSource: string) => `${GLSL_PRELUDE}\n${experimentSource}\n${GLSL_MAIN}`;
