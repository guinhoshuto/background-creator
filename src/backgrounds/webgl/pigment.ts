import {parseColor, srgbToLinear} from './scene';

/** Spectral bands of the pigment model, violet to red. */
export const BANDS = 8;

/**
 * Smooth spectra of the three linear channels over 8 bands, violet to red; in every band they
 * add up to 1, so white stays white. Pigments filter band by band: a blue over a yellow keeps
 * the green both let through, where three channels alone turn that glaze into a grey.
 */
const SPECTRA = [
  [0, 0, 0.05, 0.05, 0.18, 0.65, 0.95, 1],
  [0, 0.15, 0.55, 0.85, 0.8, 0.35, 0.05, 0],
  [1, 0.85, 0.4, 0.1, 0.02, 0, 0, 0],
];
/** The darkest a pigment filters one band (e^-4): a black palette colour still washes to a grey. */
const MAX_ABSORBANCE = 4;

const invert3 = (m: number[][]) => {
  const [[a, b, c], [d, e, f], [g, h, i]] = m as [[number, number, number], [number, number, number], [number, number, number]];
  const cofactors = [[e * i - f * h, c * h - b * i, b * f - c * e], [f * g - d * i, a * i - c * g, c * d - a * f], [d * h - e * g, b * g - a * h, a * e - b * d]];
  const determinant = a * cofactors[0]![0]! + b * cofactors[1]![0]! + c * cofactors[2]![0]!;
  return cofactors.map((row) => row.map((value) => value / determinant));
};

/** Back from the bands to linear rgb: the least-squares inverse of SPECTRA, exact on a single pigment. */
const TO_RGB = (() => {
  const gram = SPECTRA.map((a) => SPECTRA.map((b) => a.reduce((sum, value, band) => sum + value * b[band]!, 0)));
  return invert3(gram).map((row) => Array.from({length: BANDS}, (_, band) => row.reduce((sum, value, c) => sum + value * SPECTRA[c]![band]!, 0)));
})();

const vec4 = (values: number[]) => `vec4(${values.map((value) => value.toFixed(6)).join(', ')})`;

/**
 * A palette colour as the optical density of one load of it, band by band: one load over white
 * paper filters the light down to that colour, two loads deepen it, and loads of different
 * colours multiply like glazes of real pigment (Beer-Lambert).
 */
export const absorbance = (color: string) => {
  const rgb = parseColor(color).slice(0, 3).map(srgbToLinear);
  return Array.from({length: BANDS}, (_, band) => {
    const reflectance = SPECTRA.reduce((sum, spectrum, c) => sum + spectrum[band]! * rgb[c]!, 0);
    return Math.min(MAX_ABSORBANCE, -Math.log(Math.max(reflectance, 1e-6)));
  });
};

/** GLSL: the projection from the 8 bands back to linear rgb, as `vec3 bandsToRgb(vec4 low, vec4 high)`. */
export const PIGMENT_GLSL = /* glsl */ `
const vec4 TO_R0 = ${vec4(TO_RGB[0]!.slice(0, 4))};
const vec4 TO_R1 = ${vec4(TO_RGB[0]!.slice(4))};
const vec4 TO_G0 = ${vec4(TO_RGB[1]!.slice(0, 4))};
const vec4 TO_G1 = ${vec4(TO_RGB[1]!.slice(4))};
const vec4 TO_B0 = ${vec4(TO_RGB[2]!.slice(0, 4))};
const vec4 TO_B1 = ${vec4(TO_RGB[2]!.slice(4))};

/** Transmittance in the 8 bands back to linear rgb. */
vec3 bandsToRgb(vec4 low, vec4 high) {
  return clamp(vec3(
    dot(TO_R0, low) + dot(TO_R1, high),
    dot(TO_G0, low) + dot(TO_G1, high),
    dot(TO_B0, low) + dot(TO_B1, high)), 0.0, 1.0);
}
`;
