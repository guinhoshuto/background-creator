import {buildFragmentShader} from '../webgl/glsl';

/** Blue ink washes, dry gold pigment and water. All texture is computed, never sampled. */
export const WUTHERING_WAVES_FRAGMENT_SHADER = buildFragmentShader(/* glsl */ `
uniform vec2 uFlow;
uniform float uAtmosphere;
uniform float uResonance;

vec4 experiment(vec2 px) {
  vec2 p = px / uResolution * vec2(1920.0, 1080.0);
  vec2 q = p / 1080.0;
  vec3 cream = paletteColor(0).rgb;
  vec3 cyan = paletteColor(1).rgb;
  vec3 gold = paletteColor(2).rgb;
  float paper = fbm(vec3(q * 38.0, 4.8), NO_PERIOD, 3);
  float wash = fbm(vec3(q * vec2(3.5, 4.0), 2.7), NO_PERIOD, 4);
  float brush = fbm(vec3(q * vec2(18.0, 36.0), 7.2), NO_PERIOD, 3);
  float grain = unit(hash(uint(p.x), uint(p.y), 8711u)) - 0.5;

  // The middle blue carries most of the frame, as in the supplied illustrated key visual.
  vec3 blue = mix(srgbToLinear(vec3(0.105, 0.232, 0.425)),
                  srgbToLinear(vec3(0.34, 0.56, 0.69)),
                  clamp(q.y * 0.78 + wash * 0.24 + q.x * 0.09, 0.0, 1.0));
  blue *= 1.0 + paper * 0.15 + grain * 0.08 + wash * 0.17;

  // An irregular cream/gold diagonal, broken like dry pigment on blue paper.
  float spine = 1.44 - q.y * 0.53;
  float width = 0.205 + 0.035 * sin(q.y * 9.0);
  float edge = abs(q.x - spine) - width + wash * 0.12 + brush * 0.052;
  float pigment = (1.0 - smoothstep(-0.045, 0.035, edge))
    * (1.0 - smoothstep(0.55, 0.89, q.y));
  float dry = smoothstep(-0.48, 0.12, paper + brush * 0.7 + grain * 0.21);
  float goldPatch = smoothstep(-0.2, 0.42, wash * 1.3 + brush * 0.5 + 0.25 - q.y * 0.5);
  vec3 paint = mix(cream, gold, goldPatch * 0.82);
  paint *= 0.93 + paper * 0.18 + grain * 0.09;
  blue = mix(blue, paint, pigment * (0.7 + dry * 0.3) * uResonance);

  // Pale atmospheric water opens below the land; its flow is a closed two-coordinate orbit.
  float shore = 0.78 - q.x * 0.045 + wash * 0.035;
  float lake = smoothstep(shore - 0.025, shore + 0.07, q.y);
  float haze = exp(-pow((q.y - shore) / 0.1, 2.0));
  vec3 water = mix(srgbToLinear(vec3(0.47, 0.62, 0.78)), cream, 0.20);
  water *= 0.88 + wash * 0.17 + paper * 0.07;
  blue = mix(blue, water, lake * uAtmosphere * 0.76);
  blue = mix(blue, cream, haze * 0.19 * uAtmosphere);

  float ripples = q.y * 75.0 + 1.6 * sin(q.x * 7.0 + uFlow.x * 0.09)
    + wash * 5.0 + uFlow.y * 0.15;
  float ridge = pow(0.5 + 0.5 * cos(ripples * TAU), 28.0);
  float broken = smoothstep(0.1, 0.56, fbm(vec3(q * vec2(8.0, 55.0) + uFlow * 0.04, 9.1), NO_PERIOD, 2));
  blue += mix(cream, cyan, 0.2) * ridge * broken * lake * 0.24 * uAtmosphere;
  // The painting remains a partially covered layer when exported with alpha.
  float coverage = clamp(0.80 + pigment * 0.19 + lake * 0.12, 0.0, 0.99);
  return vec4(clamp(blue, 0.0, 1.0) * coverage, coverage);
}
`);
