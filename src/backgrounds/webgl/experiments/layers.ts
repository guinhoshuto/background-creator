import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {getNoiseFlow, pack, parseColor, srgbToLinear, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

const SHEETS = 5;
const WIDTH = 1920;
const HEIGHT = 1080;
/** Seconds of one breath of the stack at speed 1. */
const BREATH_SECONDS = 16;
/** Rim radii at scale 1, in frame heights, from the sheet on top (the smallest) down. */
const RIMS = [0.46, 0.74, 1.06, 1.42, 1.6];
/** The core is nearly solid glass; the outermost sheet is a faint halo over the background. */
const OPACITY = [0.98, 0.96, 0.93, 0.9, 0.45];

type Vec3 = [number, number, number];

const linearToOklab = ([r, g, b]: Vec3): Vec3 => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
};

const oklabToLinear = ([lightness, a, b]: Vec3): Vec3 => {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const inGamut = (rgb: Vec3) => rgb.every((channel) => channel >= 0 && channel <= 1);

const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/**
 * The colour a sheet takes where its rim catches the light: lighter, with the same hue and as
 * much of its chroma as sRGB holds at that lightness. Mixing with white instead would wash a
 * deep violet out to grey lavender; lifting it in OKLab gives the vivid lilac of the reference.
 * Light glass lifts almost to white, deep glass only part of the way, so a deep core keeps a
 * coloured rim.
 */
const lift = ([lightness, a, b]: Vec3): Vec3 => {
  const target = lightness + (0.97 - lightness) * (0.55 + 0.45 * smoothstep((lightness - 0.35) / 0.5));
  let low = 0;
  let high = 1;
  for (let step = 0; step < 18; step++) {
    const mid = (low + high) / 2;
    if (inGamut(oklabToLinear([target, a * mid, b * mid]))) low = mid;
    else high = mid;
  }
  return oklabToLinear([target, a * low, b * low]).map(clamp01) as Vec3;
};

/** Glass colour and lit rim of a sheet at a place of the palette (0 the first colour, 1 the last). */
const sheetColours = (colors: string[]) => {
  const glass = colors.map(parseColor).map(([r, g, b, a]) => ({
    lab: linearToOklab([srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]),
    alpha: a,
  }));
  return (t: number) => {
    const x = clamp01(t) * (glass.length - 1);
    const i = Math.min(Math.floor(x), glass.length - 2);
    const blend = smoothstep(x - i);
    const from = glass[i]!;
    const to = glass[i + 1]!;
    // Blended in OKLab, so neighbouring sheets of opposite hues meet through a vivid colour.
    const lab = from.lab.map((value, channel) => value + (to.lab[channel]! - value) * blend) as Vec3;
    return {
      base: oklabToLinear(lab).map(clamp01) as Vec3,
      rim: lift(lab),
      alpha: from.alpha + (to.alpha - from.alpha) * blend,
    };
  };
};

/**
 * Liquid layers: large sheets of tinted glass stacked around a centre below the bottom left
 * corner, the smallest on top. Each sheet brightens towards its rim, which carries a fine line
 * of light and a soft glow, and shades the sheet below with a soft contact shadow. The sheets
 * breathe one after the other, drift with a little parallax, their rims ripple like liquid,
 * and a glint slides along every rim.
 */
export const layers: WebGLExperiment = {
  glsl: /* glsl */ `
uniform vec2 uFlow;
// Per sheet, from the smallest (on top) down: centre and rim radius (px), opacity.
uniform vec4 uSheets[${SHEETS}];
// Per sheet: cosine and sine of the phases of the two ripples along the rim (4 and 7 per turn).
uniform vec4 uSheetWave[${SHEETS}];
// Per sheet: cosine and sine of the phase of the glint along the rim (2 per turn).
uniform vec2 uSheetGlint[${SHEETS}];
// Per sheet, in linear light: the glass colour with its alpha, and the colour of its lit rim.
uniform vec4 uSheetBase[${SHEETS}];
uniform vec3 uSheetRim[${SHEETS}];
// Direction of the key light in the plane (unit, y down), width of a band and ripple height (px).
uniform vec4 uLight;
// A broad pool of light drifting over the stack: centre, radius (px) and strength.
uniform vec4 uSheen;

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

vec4 over(vec4 top, vec4 bottom) { return top + bottom * (1.0 - top.a); }

/** Light as a premultiplied layer: it brightens the glass below and, over nothing, is its own alpha. */
vec4 shine(vec3 light) { return vec4(light, clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0)); }

vec4 experiment(vec2 px) {
  float k = sqrt(uScale);
  // One slow, wide warp for every sheet: the rims ripple together, like the surface of a liquid.
  vec2 q = px / (640.0 * uScale);
  vec2 warp = vec2(
    perlin(vec3(q, uFlow.x), uFlow.y),
    perlin(vec3(q + vec2(19.3, 7.1), uFlow.x + 0.5), uFlow.y));
  vec2 p = px + warp * 7.0 * uScale;

  vec2 toSheen = (px - uSheen.xy) / uSheen.z;
  float sheen = uSheen.w * exp(-dot(toSheen, toSheen));
  // The same warp, read as a faint unevenness of the glass: the lit zones swell and thin.
  float mottle = 1.0 + 0.2 * warp.x;
  float gain = 0.75 + 0.25 * uIntensity;
  float strength = min(uIntensity, 1.0);

  vec4 layer = vec4(0.0);
  for (int i = ${SHEETS - 1}; i >= 0; i--) {
    vec4 sheet = uSheets[i];
    vec2 delta = p - sheet.xy;
    float r = length(delta);
    // The direction from the centre as a unit complex number: its powers give the angular
    // waves without atan, whose seam would otherwise cross the picture.
    vec2 z = delta / max(r, 1e-3);
    vec2 z2 = cmul(z, z);
    vec2 z4 = cmul(z2, z2);
    vec2 z7 = cmul(cmul(z4, z2), z);
    vec4 wave = uSheetWave[i];
    float ripple = 0.6 * dot(z4, vec2(wave.x, -wave.y)) + 0.4 * dot(z7, vec2(wave.z, -wave.w));
    // Distance inside the rim, in pixels.
    float d = sheet.z + ripple * uLight.w - r;
    float aa = max(fwidth(d), 0.5);
    float cover = smoothstep(-aa, aa, d);
    float outside = min(d, 0.0);

    float facing = 0.5 + 0.5 * dot(z, uLight.xy);
    vec2 g = uSheetGlint[i];
    float glint = pow(max(dot(z2, vec2(g.x, -g.y)), 0.0), 10.0);
    float lit = (0.3 + 0.7 * facing) * (1.0 + sheen) + 0.9 * glint;

    vec4 base = uSheetBase[i];
    vec3 rim = uSheetRim[i];
    float alpha = sheet.w * base.a;
    // Up to 1 the intensity fades the sheet; above, it thickens the glass towards opaque.
    alpha = uIntensity <= 1.0 ? alpha * uIntensity : 1.0 - pow(1.0 - alpha, uIntensity);

    // The sheet shades the glass below with a soft contact shadow in a deeper, more saturated
    // shade of its own colour, and its lit edge spills a soft glow onto it just past the rim.
    // Both fall off to exactly nothing a few hundred pixels out, so the background beyond the
    // halo stays clear (alpha 0 in a transparent export).
    float shadow = 0.22 * alpha * alpha * pow(max(1.0 + outside / (400.0 * k), 0.0), 3.0) * (1.0 - cover);
    layer = over(vec4(base.rgb * base.rgb * 0.6 * shadow, shadow), layer);
    float spill = pow(max(1.0 + outside / (160.0 * k), 0.0), 4.0);
    layer = over(shine(rim * 0.5 * lit * alpha * gain * spill * (1.0 - cover)), layer);

    // Across its visible band the glass rises from its deep colour to the lit rim colour, most
    // where the rim faces the light; the side turned away stays deeper. The blend runs in a
    // gamma-2 space, so the ramp looks even.
    // The glint only brightens the glass near the rim, never as a beam across the sheet.
    float band = i > 0 ? sheet.z - uSheets[max(i - 1, 0)].z : 0.6 * uLight.z;
    float across = clamp(d / max(band, 1.0), 0.0, 1.0);
    float lift = pow(1.0 - across, 1.8) * clamp((0.12 + 0.88 * facing) * mottle, 0.0, 1.0)
      + 0.4 * glint * exp(-max(d, 0.0) / (70.0 * k));
    // The drifting pool of light brightens all the glass it passes over, not only the rims.
    lift = min(lift + sheen * (0.2 + 0.8 * (1.0 - across)), 1.0);
    vec3 body = mix((0.8 + 0.18 * facing) * sqrt(base.rgb), sqrt(rim), lift);
    float a = alpha * cover;
    layer = over(vec4(body * body * a, a), layer);

    // The rim: a fine line of light, widened rather than aliased when it gets thin, and a
    // soft glow just inside it.
    float width = 1.4 * k + 0.5 * aa;
    float offset = (d - 1.8 * k) / width;
    float line = exp(-0.5 * offset * offset) * (1.4 * k / width);
    float glow = 0.3 * exp(-max(d, 0.0) / (30.0 * k));
    vec3 light = mix(rim, vec3(1.0), 0.3) * (0.6 * line + glow) * lit * gain * strength * sheet.w * base.a * cover;
    layer = over(shine(light), layer);
  }
  // A faint static grain, like the print of the artwork.
  layer.rgb *= 1.0 + 0.04 * (unit(hash(uint(px.x), uint(px.y), 9151u)) - 0.5);
  return layer;
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    const flow = getNoiseFlow(props, phase / TAU, 0.05, 613);
    const pace = (props.speed * props.durationSeconds) / BREATH_SECONDS;
    const turns = wholeTurns(pace);
    // A cycle shorter than the base pace still needs a whole breath; it breathes shallower,
    // so the stack never hurries.
    const reach = turns > 0 ? Math.min(1, pace / turns) : 1;
    const t = turns * phase;
    const grow = Math.sqrt(props.scale);
    const random = createSeededRandom(props.seed + 613);
    const centreX = WIDTH * randomBetween(random, 0.14, 0.26);
    const centreY = HEIGHT * randomBetween(random, 1.02, 1.08);
    const breathOffset = random() * TAU;
    const swayOffset = random() * TAU;
    const lightOffset = random() * TAU;
    const sheenOffset = random() * TAU;
    const glintOffset = random() * TAU;
    const azimuth = randomBetween(random, -0.62, -0.42) + 0.3 * reach * Math.sin(t + lightOffset);
    const sheets = RIMS.map((rim, index) => {
      // The sheets on top drift further than the ones below: parallax, as if they floated higher.
      const depth = (SHEETS - 1 - index) / (SHEETS - 1);
      const sway = depth * reach * grow;
      // One breath runs outwards through the stack, each sheet a little after the one above.
      const breath = 1 + 0.022 * reach * Math.sin(t + breathOffset - 0.8 * index);
      const radius = HEIGHT * (rim + randomBetween(random, -0.03, 0.03)) * props.scale * breath;
      // The two ripples run along the rim in opposite directions; the glint slides half a turn
      // per breath, each rim a little behind the one above it.
      const ripple4 = random() * TAU + t;
      const ripple7 = random() * TAU - 2 * t;
      const glint = glintOffset - 0.9 * index - t;
      return {
        kind: 'sheet',
        x: centreX + 18 * sway * Math.cos(t + swayOffset),
        y: centreY + 11 * sway * Math.sin(t + swayOffset),
        radius,
        opacity: OPACITY[index]!,
        hue: index / (SHEETS - 1),
        wave4Cos: Math.cos(ripple4), wave4Sin: Math.sin(ripple4),
        wave7Cos: Math.cos(ripple7), wave7Sin: Math.sin(ripple7),
        glintCos: Math.cos(glint), glintSin: Math.sin(glint),
      };
    });
    return [
      {kind: 'flow', position: flow.position, period: flow.period, opacity: 1},
      ...sheets,
      {kind: 'light', x: Math.cos(azimuth), y: Math.sin(azimuth), band: HEIGHT * 0.32 * props.scale, ripple: 5 * grow, opacity: 1},
      {
        kind: 'sheen',
        x: WIDTH * (0.6 + 0.1 * reach * Math.cos(t + sheenOffset)),
        y: HEIGHT * (0.3 + 0.12 * reach * Math.sin(t + sheenOffset)),
        radius: 800 * grow,
        strength: 0.18,
        opacity: 1,
      },
    ];
  },
  uniforms: (scene, props) => {
    const colours = pack(scene, 'sheet', ['hue']).map(sheetColours(props.colors));
    return {
      uFlow: pack(scene, 'flow', ['position', 'period']),
      uSheets: pack(scene, 'sheet', ['x', 'y', 'radius', 'opacity']),
      uSheetWave: pack(scene, 'sheet', ['wave4Cos', 'wave4Sin', 'wave7Cos', 'wave7Sin']),
      uSheetGlint: pack(scene, 'sheet', ['glintCos', 'glintSin']),
      uSheetBase: colours.flatMap(({base, alpha}) => [...base, alpha]),
      uSheetRim: colours.flatMap(({rim}) => rim),
      uLight: pack(scene, 'light', ['x', 'y', 'band', 'ripple']),
      uSheen: pack(scene, 'sheen', ['x', 'y', 'radius', 'strength']),
    };
  },
};
