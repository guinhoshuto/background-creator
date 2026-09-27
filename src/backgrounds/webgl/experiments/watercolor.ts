import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {pack, parseColor, srgbToLinear, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

const WIDTH = 1920;
const HEIGHT = 1080;
const WASHES = 8;
const SLOTS = 6;
const BANDS = 8;

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

/** A palette colour as the optical density of one load of it, band by band. */
const absorbance = (color: string) => {
  const rgb = parseColor(color).slice(0, 3).map(srgbToLinear);
  return Array.from({length: BANDS}, (_, band) => {
    const reflectance = SPECTRA.reduce((sum, spectrum, c) => sum + spectrum[band]! * rgb[c]!, 0);
    return Math.min(MAX_ABSORBANCE, -Math.log(Math.max(reflectance, 1e-6)));
  });
};

/**
 * How light the paper is, 0 (dark) to 1 (light), from its relative luminance. Light paper only
 * ever shows its tooth as shade; on dark paper, where shade would not show, the peaks of the
 * tooth catch a little light instead. (Whether the paint glazes or covers is decided per pixel
 * in the shader, from how light its body colour is against the paper.)
 */
const paperLight = (color: string) => {
  const [r, g, b] = parseColor(color).slice(0, 3).map(srgbToLinear);
  const t = Math.min(1, Math.max(0, (0.2126 * r! + 0.7152 * g! + 0.0722 * b! - 0.01) / 0.2));
  return t * t * (3 - 2 * t);
};

/**
 * Where the washes rest at scale 1, in pixels (y down), clockwise from the top left corner: four
 * corners and a stroke along each side between them, a loose painted frame that leaves the
 * middle to the paper. `spread` is how far the seed may slide a wash along its side.
 */
const REST = [
  {x: -40, y: -30, radiusX: 660, radiusY: 430, tilt: 0.25, spread: 60, corner: true},
  {x: 960, y: -70, radiusX: 560, radiusY: 210, tilt: 0, spread: 170, corner: false},
  {x: 1960, y: -40, radiusX: 600, radiusY: 400, tilt: -0.25, spread: 60, corner: true},
  {x: 2000, y: 540, radiusX: 250, radiusY: 450, tilt: 0, spread: 110, corner: false},
  {x: 1970, y: 1110, radiusX: 700, radiusY: 450, tilt: 0.2, spread: 60, corner: true},
  {x: 960, y: 1150, radiusX: 620, radiusY: 240, tilt: 0, spread: 170, corner: false},
  {x: -50, y: 1100, radiusX: 620, radiusY: 420, tilt: -0.2, spread: 60, corner: true},
  {x: -80, y: 540, radiusX: 260, radiusY: 460, tilt: 0, spread: 110, corner: false},
] as const;

/**
 * The palette slot of each wash: the palette runs once round the frame in order, so neighbours
 * that overlap are neighbours in the palette too, and every colour gets a place.
 */
const pigmentAt = (index: number, shift: number, pigments: number) =>
  Math.floor((((index + shift) % WASHES) * pigments) / WASHES);

/**
 * Paces at speed 1, in lattice units per second of each noise family: the wash outlines, the
 * fringes and bloom lobes, and the pigment drifting inside the washes. Each goes once round a
 * circle through the noise per cycle, as long as the ground it covers at that pace, so the pace
 * holds for any durationSeconds.
 */
const FLOW_PACES = [0.013, 0.035, 0.03];
/** Seconds of one sway of the washes, one breath of their size and one opening of a bloom, at speed 1. */
const SWAY_SECONDS = 26;
const BREATH_SECONDS = 19;
const BLOOM_SECONDS = 15;
/** How far a wash sways (px at scale 1), how much it breathes and how far a bloom opens. */
const SWAY = 18;
const BREATH = 0.03;
const OPENING = 0.16;

/** The radius of an ellipse along a unit direction of its own frame. */
const radiusAlong = (radiusX: number, radiusY: number, x: number, y: number) =>
  1 / Math.hypot(x / radiusX, y / radiusY);

type WashPlan = {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  tilt: number;
  mix: number;
  load: number;
  wetness: number;
  gradeX: number;
  gradeY: number;
  pigment: number;
  bloomX: number;
  bloomY: number;
  bloomRadius: number;
  bloomStrength: number;
  phases: [number, number, number, number];
};

/**
 * The static layout of the painting from the seed: where each wash rests, its pigment, how much
 * paint it carries, which way it fades and where a bloom opens in it. A larger wash grows
 * outwards and keeps its reach into the frame, so it spills past the frame instead of flooding
 * the middle; a smaller one also draws back towards the frame edge, leaving more paper.
 */
const planWashes = (seed: number, pigments: number, scale: number): WashPlan[] => {
  const random = createSeededRandom(seed + 7331);
  const between = (min: number, max: number) => randomBetween(random, min, max);
  const shift = Math.floor(random() * WASHES);
  const grow = scale ** 0.7;
  const push = grow > 1 ? 1 : 0.5;
  return REST.map((rest, index) => {
    const along = between(-rest.spread, rest.spread);
    const horizontal = rest.y < 0 || rest.y > HEIGHT;
    let x = rest.x + (horizontal ? along : 0) + between(-25, 25);
    let y = rest.y + (horizontal ? 0 : along) + between(-20, 20);
    // The strokes along the sides lean further, so they reach into the frame more at one end.
    const tilt = rest.tilt + (rest.corner ? between(-0.18, 0.18) : between(-0.3, 0.3));
    const radiusX = rest.radiusX * between(0.88, 1.12);
    const radiusY = rest.radiusY * between(0.88, 1.12);
    // Towards the middle of the frame, in the wash's own frame.
    const toMiddle = Math.atan2(HEIGHT / 2 - y, WIDTH / 2 - x);
    const inX = Math.cos(toMiddle - tilt);
    const inY = Math.sin(toMiddle - tilt);
    const outReach = radiusAlong(radiusX, radiusY, inX, inY);
    x -= Math.cos(toMiddle) * push * outReach * (grow - 1);
    y -= Math.sin(toMiddle) * push * outReach * (grow - 1);
    const reach = outReach * grow;
    // Heavier towards the frame's edge, paler where the wash reaches into the paper.
    const grade = between(0.35, 0.6);
    const gradeLength = Math.hypot(inX / radiusX, inY / radiusY);
    const hasBloom = random() < 0.55;
    const bloomAlong = between(0.6, 0.85) * reach;
    const bloomSide = between(-0.25, 0.25) * reach;
    return {
      x,
      y,
      radiusX: radiusX * grow,
      radiusY: radiusY * grow,
      tilt,
      // The corners take one outline noise and the sides the other, so neighbours that overlap never share an edge.
      mix: (rest.corner ? 0 : Math.PI / 2) + between(-0.3, 0.3),
      load: rest.corner ? between(0.5, 0.72) : between(0.4, 0.6),
      wetness: between(-0.6, 0.6),
      gradeX: (grade * inX) / (radiusX * gradeLength),
      gradeY: (grade * inY) / (radiusY * gradeLength),
      pigment: pigmentAt(index, shift, pigments),
      bloomX: x + Math.cos(toMiddle) * bloomAlong - Math.sin(toMiddle) * bloomSide,
      bloomY: y + Math.sin(toMiddle) * bloomAlong + Math.cos(toMiddle) * bloomSide,
      bloomRadius: between(45, 120) * grow,
      bloomStrength: hasBloom ? between(0.7, 1) : 0,
      phases: [random() * TAU, random() * TAU, random() * TAU, random() * TAU],
    };
  });
};

/**
 * Two flicks of the brush near opposite corners: centre and reach of each cloud of droplets, in
 * the pigment of the wash in that corner.
 */
const planSplashes = (seed: number, washes: WashPlan[]) => {
  const random = createSeededRandom(seed + 7349);
  const flip = random() < 0.5;
  return [0, 1].map((index) => {
    const right = flip !== (index === 1);
    const bottom = index === 1;
    const corner = bottom ? (right ? 4 : 6) : (right ? 2 : 0);
    const inward = randomBetween(random, 300, 430);
    const turn = randomBetween(random, -0.3, 0.3);
    const angle = Math.atan2(bottom ? -1 : 1, right ? -1.6 : 1.6) + turn;
    return {
      x: (right ? WIDTH : 0) + Math.cos(angle) * inward,
      y: (bottom ? HEIGHT : 0) + Math.sin(angle) * inward,
      radius: randomBetween(random, 150, 210),
      pigment: washes[corner]!.pigment,
    };
  });
};

/**
 * Watercolour on paper: transparent washes of pigment glazed over each other around the edges of
 * the frame, with dark dried rims, soft wet-in-wet fringes, cauliflower blooms, granulation in
 * the tooth of the paper and a few splatters. The paint stays wet: the washes creep and breathe
 * and the blooms open and settle over paper that never moves. Where the paint is lighter than
 * the paper (dark paper, or a pale pigment on a mid tone), it turns into opaque body colour, as
 * gouache, since a glaze would vanish there.
 */
export const watercolor: WebGLExperiment = {
  glsl: /* glsl */ `
// Offsets of the three moving noise families (outlines, fringes, pigment drift), each on its own
// closed circle through the noise volume, in that family's lattice units.
uniform vec3 uFlow[3];
// Per wash: centre and radii (px); cosine and sine of its tilt and of its outline noise mix;
// load, wetness, and the grade vector in its own unit frame; its palette slot.
uniform vec4 uWashShape[${WASHES}];
uniform vec4 uWashTurn[${WASHES}];
uniform vec4 uWashPaint[${WASHES}];
uniform float uWashPigment[${WASHES}];
// Per wash: centre and radius (px) of its bloom, and its strength (0 for none).
uniform vec4 uBloom[${WASHES}];
// The two clouds of splatter: centre and reach (px), and their palette slot.
uniform vec4 uSplash[2];
// Per palette slot: optical density of one load in the 8 bands (two vec4 each).
uniform vec4 uPigment[${2 * SLOTS}];
// 1 on light paper, where the tooth only shades; towards 0 on dark paper, where its peaks catch light.
uniform float uPaperLight;

// Pixels per lattice unit at scale 1: wash outlines, pigment drift, fringes and bloom lobes.
const float FORM = 360.0;
const float DRIFT = 170.0;
const float FRINGE = 46.0;
// Reach of the outline noise, in wash radii.
const float EDGE_NOISE = 0.36;
// Width of a wet-in-wet edge (px at scale 1) and of the rim a dried edge pools into (px).
const float SOFT = 70.0;
const float RIM = 4.5;
// The slow bends of a wet front: lattice and reach (px at scale 1). Without them a long soft
// edge at the tip of a wash runs almost straight across its neighbour.
const float CREEP = 160.0;
const float CREEP_REACH = 170.0;
// How much pigment the rim adds, how much the zone just inside it loses, and how many rim
// widths that paler zone spans.
const float RIM_LOAD = 0.75;
const float EBB = 0.22;
const float EBB_REACH = 9.0;
// How far a dried edge or a bloom's frill follows the tooth of the paper (px).
const float CRINKLE = 2.0;
// Pigment drifting inside a wash: the depth of its mottling.
const float DRIFT_DEPTH = 0.28;
// Blooms: reach of the lobes (px at scale 1), the pale core and the dark frill at the edge.
const float LOBES = 30.0;
const float BLOOM_LOBES = 0.35;
const float BLOOM_PALE = 0.55;
const float BLOOM_RIM = 1.15;
// How far a bloom strays from a circle, in its radii.
const float BLOOM_WARP = 1.0;
// How far the washes draw back from the content plate at centerFade 1, in wash radii: they give
// way with their own edges, and the shared fade only lightens what is left.
const float RECEDE = 0.4;
// How strongly each palette slot granulates: the first, like ultramarine, most.
const float GRANULATION[6] = float[6](0.9, 0.3, 0.45, 0.65, 0.4, 0.55);
// Splatter: grid cell (px at scale 1), and the share of cells that hold a droplet at a cloud's heart.
const float SPLASH_CELL = 30.0;
const float SPLASH_SHARE = 0.4;
const float SPLASH_LOAD = 0.55;
// Paper: shade of the valleys, of the relief lit from the upper left and of the uneven sizing.
const float GRAIN_VALLEY = 0.05;
const float GRAIN_RELIEF = 0.035;
const float GRAIN_TONE = 0.02;
// Body colour: how fast it turns opaque, its touch of white (as in gouache, it keeps a deep
// pigment readable on the dark), the white and the cover a bloom leaves in its core, and how
// much deeper the pigment that pooled in a rim or a frill makes it.
const float OPACITY = 2.1;
const float BODY_WHITE = 0.1;
const float BLOOM_WHITE = 0.25;
const float BLOOM_BODY = 1.0;
const float DEEPEN = 0.6;
// How much lighter than the paper (sRGB luma) body colour must be to replace the glaze entirely.
const float GOUACHE = 0.1;
// How much light the peaks of the tooth catch on dark paper.
const float DARK_TOOTH = 0.05;

const vec4 TO_R0 = ${vec4(TO_RGB[0]!.slice(0, 4))};
const vec4 TO_R1 = ${vec4(TO_RGB[0]!.slice(4))};
const vec4 TO_G0 = ${vec4(TO_RGB[1]!.slice(0, 4))};
const vec4 TO_G1 = ${vec4(TO_RGB[1]!.slice(4))};
const vec4 TO_B0 = ${vec4(TO_RGB[2]!.slice(0, 4))};
const vec4 TO_B1 = ${vec4(TO_RGB[2]!.slice(4))};

const mat2 TURN_A = mat2(0.8, 0.6, -0.6, 0.8);
const mat2 TURN_B = mat2(0.28, -0.96, 0.96, 0.28);

/** Transmittance in the 8 bands back to linear rgb. */
vec3 bandsToRgb(vec4 low, vec4 high) {
  return clamp(vec3(
    dot(TO_R0, low) + dot(TO_R1, high),
    dot(TO_G0, low) + dot(TO_G1, high),
    dot(TO_B0, low) + dot(TO_B1, high)), 0.0, 1.0);
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/**
 * Cold-pressed tooth, in pixels: height (0 in the valleys, 1 on the peaks), the relief lit from
 * the upper left, and the clumps pigment flocculates into. It never moves and never scales.
 */
vec3 paperTooth(vec2 px) {
  vec2 a = TURN_A * px / 4.3;
  float fine = perlin(vec3(a, 0.37), NO_PERIOD);
  float lit = perlin(vec3(a - TURN_A * vec2(1.3) / 4.3, 0.37), NO_PERIOD);
  float mid = perlin(vec3(TURN_B * px / 10.5 + 31.0, 1.61), NO_PERIOD);
  float coarse = perlin(vec3(px / 27.0 + 77.0, 2.83), NO_PERIOD);
  float height = clamp(0.5 + 0.55 * fine + 0.35 * mid + 0.2 * coarse, 0.0, 1.0);
  return vec3(height, fine - lit, 0.7 * mid + 0.9 * coarse);
}

/** Two unrelated outline noises over the forms: a warped sum of three octaves each. */
vec2 outlineNoise(vec2 u) {
  vec3 p = vec3(u, 0.0) + uFlow[0];
  vec2 warp = vec2(
    perlin(vec3(0.5 * p.xy + vec2(3.1, 7.7), 0.5 * p.z), NO_PERIOD),
    perlin(vec3(0.5 * p.xy + vec2(11.9, 2.3), 0.5 * p.z + 4.0), NO_PERIOD));
  p.xy += 0.5 * warp;
  // The finer octaves drift with the coarse one but change shape more slowly than their size
  // would have them: an edge races where the outline flattens, and that is where they matter.
  vec3 q = vec3(TURN_A * p.xy * 2.0 + 17.0, p.z * 1.4);
  vec3 r = vec3(TURN_B * p.xy * 4.0 + 29.0, p.z * 1.8);
  float a = 0.57 * perlin(p, NO_PERIOD) + 0.29 * perlin(q, NO_PERIOD) + 0.14 * perlin(r, NO_PERIOD);
  float b = 0.57 * perlin(p + vec3(53.0, 19.0, 7.0), NO_PERIOD) + 0.29 * perlin(q + vec3(23.0, 61.0, 5.0), NO_PERIOD)
    + 0.14 * perlin(r + vec3(41.0, 13.0, 3.0), NO_PERIOD);
  return vec2(a, b);
}

/**
 * |n| with its crease rounded over a few pixels: the lobes still meet in cusps to the eye, but
 * the field has no kink for the screen derivatives to turn into 2x2 blocks.
 */
float softAbs(float n) { return sqrt(n * n + 0.01); }

/**
 * The fine fields: feathering of the wet edges (about -1…1) and the lobes of the blooms (0 up,
 * with narrow creases at the zeros of each octave, so the lobes bulge round and meet in cusps).
 */
vec2 fringeNoise(vec2 u) {
  vec3 p = vec3(u, 0.0) + uFlow[1];
  float a = perlin(p, NO_PERIOD);
  float b = perlin(vec3(TURN_A * p.xy * 2.1 + 5.3, p.z * 1.5), NO_PERIOD);
  return vec2(0.62 * a + 0.38 * b, 0.6 * softAbs(a) + 0.4 * softAbs(b));
}

/** Distance (px) to the zero of a field, positive where it is positive, from its screen gradient. */
float fieldDistance(float f) {
  return f / max(length(vec2(dFdx(f), dFdy(f))), 1e-6);
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

vec4 experiment(vec2 px) {
  float s = uScale;
  vec3 tooth = paperTooth(px);
  float sizing = perlin(vec3(px / 280.0 + 101.0, 4.21), NO_PERIOD);

  vec2 outline = outlineNoise(px / (FORM * s));
  vec2 fringe = fringeNoise(px / (FRINGE * s));
  // Where edges dry hard or stay wet, the pigment drifting inside the washes, and the bends of the wet fronts.
  float wet = perlin(vec3(0.45 * px / (FORM * s), 0.0) + 0.45 * uFlow[0] + vec3(41.3, 17.9, 3.7), NO_PERIOD);
  float drift = perlin(vec3(px / (DRIFT * s), 0.0) + uFlow[2] + vec3(7.3, 29.1, 0.0), NO_PERIOD);
  float creep = perlin(vec3(px / (CREEP * s), 0.0) + uFlow[2] + vec3(19.7, 3.1, 11.0), NO_PERIOD);
  // Pigment settles in the valleys of the tooth and clumps: static, so paint flows over it.
  float granules = 0.6 * (0.5 - tooth.x) + 0.4 * tooth.z;
  float crinkle = CRINKLE * (0.35 * tooth.z + 0.4 * (tooth.x - 0.5));
  float recede = RECEDE * uCenterFade * plateWeight(px);

  float soft = SOFT * s;
  vec4 densityLow = vec4(0.0);
  vec4 densityHigh = vec4(0.0);
  // All the pigment, as it filters the paper; and for body colour, the paint alone, what pooled
  // into rims and frills (it deepens the colour instead of adding cover, or it would read as a
  // light outline on dark paper), and what the blooms washed out of their cores.
  float load = 0.0;
  float body = 0.0;
  float pooled = 0.0;
  float washed = 0.0;
  for (int k = 0; k < ${WASHES}; k++) {
    vec4 shape = uWashShape[k];
    vec4 turn = uWashTurn[k];
    vec4 paint = uWashPaint[k];
    vec2 d = px - shape.xy;
    vec2 local = vec2(dot(d, turn.xy), dot(d, vec2(-turn.y, turn.x))) / shape.zw;
    float edge = fieldDistance(1.0 - length(local) + EDGE_NOISE * dot(outline, turn.zw) + 0.015 * fringe.x - recede);
    float hard = smoothstep(-0.35, 0.35, paint.y + wet);
    // A dried edge follows the tooth a little. Its slope keeps the ramp at least a pixel wide,
    // and it stays gentle, so a moving edge glides over the tooth instead of hopping between bumps.
    float dried = edge + crinkle;
    float driedSlope = max(length(vec2(dFdx(dried), dFdy(dried))), 1.0);
    float front = edge + 0.5 * soft * fringe.x + CREEP_REACH * s * creep;
    float cover = mix(smoothstep(-soft, 0.4 * soft, front), clamp(0.5 + dried / driedSlope, 0.0, 1.0), hard);
    float inside = max(dried, 0.0);
    // Pigment pools into the rim as the edge dries, and leaves the zone just inside it paler.
    float rim = hard * exp(-inside / RIM);
    float ebb = hard * exp(-inside / (EBB_REACH * RIM));
    float grade = clamp(1.0 - dot(local, paint.zw), 0.3, 1.5);
    float pigment = paint.x * grade * (1.0 + DRIFT_DEPTH * drift);
    float pool = paint.x * RIM_LOAD * (0.5 + 0.5 * grade) * rim;

    // A backrun: water pushed the pigment out of a pale core into a dark, frilled edge.
    vec4 bloom = uBloom[k];
    // Its outline takes the outline noise the wash's own edge leaves out, so the two never run parallel.
    float spread = bloom.z * (1.0 + BLOOM_WARP * dot(outline, vec2(-turn.w, turn.z)) + 0.5 * fringe.x);
    float lobes = LOBES * s + BLOOM_LOBES * bloom.z;
    float petals = spread - length(px - bloom.xy) + lobes * (fringe.y - 0.3) + crinkle;
    // Already about in pixels: the slope only narrows the 1 px ramp where the lobes steepen it.
    // The frill itself is shaped by the field, not by that slope: screen slopes are shared by
    // 2x2 pixels, and across the creases they would step the frill into blocks.
    float inBloom = bloom.w * clamp(0.5 + petals / max(length(vec2(dFdx(petals), dFdy(petals))), 1.0), 0.0, 1.0);
    float frillRim = BLOOM_RIM * exp(-max(petals, 0.0) / (1.4 * RIM));
    // The core is not flat: the water that pushed the pigment out left streaks of it behind.
    float pale = BLOOM_PALE * (1.0 - 0.35 * fringe.x);

    int slot = int(uWashPigment[k] + 0.5);
    float share = max(cover * paletteColor(slot).a * uIntensity * (1.0 + GRANULATION[slot] * granules), 0.0);
    float rho = share * (pigment * (1.0 - EBB * ebb) + pool) * (1.0 + inBloom * (frillRim - pale));
    densityLow += rho * uPigment[2 * slot];
    densityHigh += rho * uPigment[2 * slot + 1];
    load += rho;
    float alone = share * pigment;
    body += alone;
    pooled += share * pool + alone * inBloom * frillRim;
    washed += alone * inBloom * pale;
  }

  // Splatter: droplets that stay put like the paper. Each fits inside its own cell, so one cell
  // holds every droplet that can touch a pixel.
  float cell = SPLASH_CELL * sqrt(s);
  vec2 id = floor(px / cell);
  vec2 middle = (id + 0.5) * cell;
  vec4 cloud = distance(middle, uSplash[0].xy) / uSplash[0].z < distance(middle, uSplash[1].xy) / uSplash[1].z ? uSplash[0] : uSplash[1];
  vec2 away = (middle - cloud.xy) / cloud.z;
  float heart = exp(-dot(away, away));
  uint h = hash(uint(id.x), uint(id.y), 5413u);
  if (unit(h) < SPLASH_SHARE * heart) {
    float size = unit(pcg(h ^ 0x9E3779B9u));
    float radius = mix(1.8, 0.3 * cell - 1.5, size * size * size) * (0.6 + 0.4 * heart);
    vec2 room = vec2(cell - 2.0 * radius - 3.0);
    vec2 centre = id * cell + radius + 1.5 + room * vec2(unit(pcg(h ^ 0x85EBCA6Bu)), unit(pcg(h ^ 0xC2B2AE35u)));
    float inside = radius - length(px - centre);
    int slot = int(cloud.w + 0.5);
    float drop = clamp(0.5 + inside, 0.0, 1.0) * SPLASH_LOAD * paletteColor(slot).a * uIntensity
      * max(1.0 + GRANULATION[slot] * granules, 0.0);
    float ring = 0.5 * exp(-max(inside, 0.0) / 1.3);
    float rho = drop * (0.75 + ring);
    densityLow += rho * uPigment[2 * slot];
    densityHigh += rho * uPigment[2 * slot + 1];
    load += rho;
    body += 0.75 * drop;
    pooled += ring * drop;
  }

  vec3 paper = linearToSrgb(uBackground);
  // The tooth only ever shades light paper, so a transparent layer never carries light specks.
  // On dark paper, where shade would not show, its peaks catch a little light instead.
  float grain = min(uIntensity, 1.0) * (GRAIN_VALLEY * (1.0 - tooth.x) + GRAIN_RELIEF * max(tooth.y, 0.0) + GRAIN_TONE * (0.5 + 0.5 * sizing));
  vec3 shaded = uBackground * (1.0 - grain);
  vec3 lift = DARK_TOOTH * (1.0 - uPaperLight) * min(uIntensity, 1.0) * max(tooth.x - 0.45, 0.0) * (1.0 - paper);
  vec3 bare = linearToSrgb(shaded) + lift;
  // Transparent glazes: every wash filters the light the others let through, band by band.
  vec3 filtered = bandsToRgb(exp(-densityLow), exp(-densityHigh));
  vec3 glazed = linearToSrgb(shaded * filtered) + lift * filtered;

  // Body colour: the colour of the mix at one load, deeper where pigment pooled, as opaque as the
  // paint is loaded. A bloom leaves a chalky, paler deposit that covers more: on dark paper it
  // reads as a lighter flower, where less cover would read as a hole.
  float painted = max(body, 1e-3);
  float bloomed = min(washed / painted, 1.0);
  float norm = (1.0 + DEEPEN * min(pooled / painted, 2.0)) / max(load, 1e-3);
  vec3 tint = bandsToRgb(exp(-densityLow * norm), exp(-densityHigh * norm));
  vec3 bodyColor = linearToSrgb(mix(tint, vec3(1.0), BODY_WHITE + BLOOM_WHITE * bloomed));
  float coverage = 1.0 - exp(-OPACITY * (body + BLOOM_BODY * washed));
  // A glaze can only darken the paper, so it vanishes on dark paper. Body colour takes over where
  // it is lighter than the paper, pixel by pixel; the hand-over happens where the two are about
  // as light, so a lighter cover and a darker glaze never average out into the paper tone.
  float gouache = smoothstep(0.0, GOUACHE, luma(bodyColor) - luma(paper));
  vec3 under = mix(bare, glazed, 1.0 - gouache);
  vec3 target = mix(glazed, mix(under, bodyColor, coverage), gouache);
  return overPaper(target, paper);
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    // Seconds of motion at speed 1 in one cycle.
    const travel = props.speed * props.durationSeconds;
    const loop = travel > 0 ? 1 : 0;
    const motion = (seconds: number) => {
      const pace = travel / seconds;
      const turns = wholeTurns(pace);
      return {turns, reach: turns > 0 ? Math.min(1, pace / turns) : 1};
    };
    const random = createSeededRandom(props.seed + 7321);
    const flows = FLOW_PACES.map((pace): WebGLElement => {
      const radius = (travel * pace) / TAU;
      const heading = random() * TAU;
      const angle = loop * phase + random() * TAU;
      return {
        kind: 'flow',
        x: radius * Math.cos(angle) * Math.cos(heading),
        y: radius * Math.cos(angle) * Math.sin(heading),
        z: radius * Math.sin(angle),
        opacity: 1,
      };
    });
    const grow = props.scale ** 0.7;
    const sway = motion(SWAY_SECONDS);
    const breath = motion(BREATH_SECONDS);
    const opening = motion(BLOOM_SECONDS);
    const plan = planWashes(props.seed, props.colors.length, props.scale);
    const washes = plan.map((wash): WebGLElement => {
      const [swayX, swayY, swell, open] = wash.phases;
      const dx = SWAY * grow * sway.reach * Math.cos(sway.turns * phase + swayX);
      const dy = 0.75 * SWAY * grow * sway.reach * Math.sin(sway.turns * phase + swayY);
      const size = 1 + BREATH * breath.reach * Math.sin(breath.turns * phase + swell);
      return {
        kind: 'wash',
        x: wash.x + dx,
        y: wash.y + dy,
        radiusX: wash.radiusX * size,
        radiusY: wash.radiusY * size,
        tiltCos: Math.cos(wash.tilt),
        tiltSin: Math.sin(wash.tilt),
        mixCos: Math.cos(wash.mix),
        mixSin: Math.sin(wash.mix),
        load: wash.load,
        wetness: wash.wetness,
        gradeX: wash.gradeX,
        gradeY: wash.gradeY,
        pigment: wash.pigment,
        bloomX: wash.bloomX + dx,
        bloomY: wash.bloomY + dy,
        bloomRadius: wash.bloomRadius * (1 + OPENING * opening.reach * Math.sin(opening.turns * phase + open)),
        bloomStrength: wash.bloomStrength,
        opacity: 1,
      };
    });
    const splashes = planSplashes(props.seed, plan).map((splash): WebGLElement => ({kind: 'splash', ...splash, opacity: 1}));
    return [...flows, ...washes, ...splashes];
  },
  uniforms: (scene, props) => {
    const slots = Array.from({length: SLOTS}, (_, index) => props.colors[Math.min(index, props.colors.length - 1)]!);
    return {
      uFlow: pack(scene, 'flow', ['x', 'y', 'z']),
      uWashShape: pack(scene, 'wash', ['x', 'y', 'radiusX', 'radiusY']),
      uWashTurn: pack(scene, 'wash', ['tiltCos', 'tiltSin', 'mixCos', 'mixSin']),
      uWashPaint: pack(scene, 'wash', ['load', 'wetness', 'gradeX', 'gradeY']),
      uWashPigment: pack(scene, 'wash', ['pigment']),
      uBloom: pack(scene, 'wash', ['bloomX', 'bloomY', 'bloomRadius', 'bloomStrength']),
      uSplash: pack(scene, 'splash', ['x', 'y', 'radius', 'pigment']),
      uPigment: slots.flatMap(absorbance),
      uPaperLight: paperLight(props.backgroundColor),
    };
  },
};
