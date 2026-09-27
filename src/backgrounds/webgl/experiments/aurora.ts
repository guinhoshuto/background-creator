import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {pack, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/**
 * The curtains, from the nearest to the farthest: the band of sky their lower edge hangs in at
 * the middle of the frame, how far the edge tilts across the frame and how tall their light
 * reaches (px), how far the folds swing that edge (px) and their brightness. Farther curtains
 * hang higher, are shorter, dimmer and hazier.
 */
const LAYERS = [
  {edge: [450, 500], tilt: [180, 300], height: 190, fold: 85, brightness: 1},
  {edge: [270, 310], tilt: [120, 220], height: 150, fold: 60, brightness: 0.5},
  {edge: [130, 165], tilt: [0, 100], height: 115, fold: 44, brightness: 0.32},
] as const;
const CURTAINS = LAYERS.length;

/**
 * Paces at speed 1, in noise lattice units per second. Every motion is one closed turn per
 * cycle around a circle whose circumference is the distance the pace covers in the cycle, so
 * the pace is the same for any durationSeconds and any speed, with no rounding.
 */
const FOLD_PACE = 0.05;
const RAY_SLIDE_PACE = 0.55;
const RAY_MORPH_PACE = 0.14;
const HAZE_PACE = 0.03;
/** Seconds of one slow twinkle at speed 1; some stars twinkle twice as often. */
const TWINKLE_SECONDS = 8;
/** Seconds of one slow breath of a curtain's brightness at speed 1. */
const BREATH_SECONDS = 16;

/** Aurora curtains with fine vertical rays over the upper sky, a soft glow below and faint stars. */
export const aurora: WebGLExperiment = {
  glsl: /* glsl */ `
// Per curtain: lower edge (px), light height (px), tilt and arc of the edge (px).
uniform vec4 uCurtainShape[${CURTAINS}];
// Per curtain: fold swing (px), noise lane, sideways slide of the folds (fold units), brightness.
uniform vec4 uCurtainFold[${CURTAINS}];
// Per curtain: fold morph (2), sideways slide of the rays and their morph (ray units).
uniform vec4 uCurtainMotion[${CURTAINS}];
// Cosine and sine of the twinkle angle, and of twice that angle.
uniform vec4 uTwinkle;
// Haze morph (2) and the x of the point the rays converge to (px).
uniform vec3 uSky;

// Near to far: fold wavelength and ray spacing (px at scale 1), softness of the lower edge (px),
// and the noise level under which the curtain fades out along its length.
const float FOLD_UNIT[${CURTAINS}] = float[${CURTAINS}](480.0, 380.0, 300.0);
const float RAY_UNIT[${CURTAINS}] = float[${CURTAINS}](26.0, 20.0, 16.0);
const float EDGE_SOFT[${CURTAINS}] = float[${CURTAINS}](3.0, 6.0, 9.0);
const float SWEEP[${CURTAINS}] = float[${CURTAINS}](70.0, 50.0, 35.0);
const float PATCH_FLOOR[${CURTAINS}] = float[${CURTAINS}](-0.28, -0.2, -0.14);
const float PATCH_MIN[${CURTAINS}] = float[${CURTAINS}](0.0, 0.0, 0.0);
// How much a fold bunches the curtain sideways, in fold units: below the point where it would
// fold over itself, so the mapping stays one to one and the rays never mirror.
const float WARP = 0.26;
// How sharply the lower edge turns at a fold: the fold field goes through tanh for the edge, so
// it runs in long gentle stretches joined by short, steeper turns.
const float FOLD_SHARPNESS = 1.7;
// Rays run along the magnetic field and converge towards a point above the frame.
const float RAY_FAN = 1.1e-4;
const float AIRGLOW = 0.08;
const float STAR_CELL = 46.0;
const float STAR_LIGHT = 0.9;
// Overall gain of the curtains, before the intensity control.
const float GAIN = 1.6;

/**
 * Perlin noise at several points from one loop, so the shader holds a few copies of perlin()
 * instead of two dozen inlined ones: the CPU renderer (SwiftShader) takes a third less time.
 */
vec4 perlin4(vec3 a, vec3 b, vec3 c, vec3 d) {
  vec3 points[4] = vec3[4](a, b, c, d);
  vec4 n;
  for (int i = 0; i < 4; i++) n[i] = perlin(points[i], NO_PERIOD);
  return n;
}
vec2 perlin2(vec3 a, vec3 b) {
  vec3 points[2] = vec3[2](a, b);
  vec2 n;
  for (int i = 0; i < 2; i++) n[i] = perlin(points[i], NO_PERIOD);
  return n;
}

/** Faint stars on a hashed grid, one at most per cell and kept clear of its borders. */
float starLight(vec2 px) {
  vec2 cell = floor(px / STAR_CELL);
  uint h = hash(uint(cell.x), uint(cell.y), 9127u);
  if (unit(h) > 0.34) return 0.0;
  vec2 place = vec2(unit(pcg(h ^ 0x68E31DA4u)), unit(pcg(h ^ 0xB5297A4Du)));
  vec2 d = px - (cell + 0.22 + 0.56 * place) * STAR_CELL;
  float magnitude = unit(pcg(h ^ 0x1B56C4E9u));
  magnitude *= magnitude * magnitude;
  float sigma = 0.6 + 0.7 * magnitude;
  float phase = unit(pcg(h ^ 0x7FEB352Du)) * TAU;
  vec2 angle = (h & 64u) == 0u ? uTwinkle.xy : uTwinkle.zw;
  float twinkle = angle.x * cos(phase) - angle.y * sin(phase);
  return exp(-dot(d, d) / (2.0 * sigma * sigma)) * (0.12 + 0.88 * magnitude) * (0.78 + 0.22 * twinkle);
}

/** The light of curtain k at px, before the overall gain. */
vec3 curtainLight(int k, vec2 px, float haze) {
  float s = uScale;
  // Taller forms grow less than wide ones, so a large scale does not fill the whole sky.
  float stretch = mix(1.0, s, 0.5);
  float xn = px.x / uResolution.x - 0.5;
  vec4 base = paletteColor(0);
  vec3 light = vec3(0.0);
  vec4 shape = uCurtainShape[k];
  vec4 fold = uCurtainFold[k];
  vec4 motion = uCurtainMotion[k];
  float foldUnit = FOLD_UNIT[k] * s;
  float rayUnit = RAY_UNIT[k] * s;

  // One fold field lifts the lower edge and bunches the curtain sideways: where a fold turns
  // towards the viewer the sheet is seen edge-on, so its rays crowd together and it glows brighter.
  float fx = px.x / foldUnit + fold.z;
  // The fold along the length of the curtain, about -1…1, here and 2 px further on.
  vec2 morph = motion.xy;
  vec4 folds = perlin4(
    vec3(fx, fold.y + morph.x, morph.y),
    vec3(2.03 * fx + 5.7, fold.y + 2.0 * morph.x + 31.0, 2.0 * morph.y),
    vec3(fx + 2.0 / foldUnit, fold.y + morph.x, morph.y),
    vec3(2.03 * (fx + 2.0 / foldUnit) + 5.7, fold.y + 2.0 * morph.x + 31.0, 2.0 * morph.y));
  float n0 = 0.72 * folds.x + 0.28 * folds.y;
  float n1 = 0.72 * folds.z + 0.28 * folds.w;
  // A slow sweep of the whole curtain across the frame, and the patches where it thins out.
  vec2 broad = perlin2(
    vec3(px.x / (1500.0 * s) + 0.37 * fold.y, fold.y + 71.0 + 0.4 * morph.x, 0.4 * morph.y),
    vec3(fx * 0.4 + 13.0, fold.y + 57.0 + 0.6 * morph.x, 0.6 * morph.y));
  float f0 = tanh(FOLD_SHARPNESS * n0);
  float swing = fold.x * s;
  // The path of the curtain: a tilt, a bow and a slow sweep across the frame, then the folds.
  float sweep = broad.x;
  float edge = shape.x + shape.z * xn + shape.w * (4.0 * xn * xn - 1.0 / 3.0) + SWEEP[k] * sweep + swing * f0;
  float h = edge - px.y;
  float height = shape.y * stretch;
  // Far under the edge every term below has decayed past 1e-4: skip the rest of the noise.
  if (h < -max(260.0 * s, 2.4 * height)) return vec3(0.0);

  float dn = (n1 - n0) * 0.5;
  float df = FOLD_SHARPNESS * (1.0 - f0 * f0) * dn;
  float edgeSlope = (shape.z + 8.0 * shape.w * xn) / uResolution.x + swing * df;
  float warp = WARP * foldUnit;
  float u = px.x - warp * n0;
  float squeeze = max(1.0 - warp * dn, 0.3);
  // The turns of the folds, where the edge is steepest and the sheet is seen edge-on, glow
  // brightest; the long stretches between them stay dimmer.
  float turn = exp(-n0 * n0 / 0.02);
  float crowd = squeeze * mix(0.55, 2.3, turn);

  float up = max(h, 0.0);
  vec2 r = vec2((u + (px.x - uSky.z) * up * RAY_FAN) / rayUnit, up / (rayUnit * 12.0));
  float fineWeight = smoothstep(4.0, 8.0, 0.5 * rayUnit / squeeze);
  // Ray striations, stretched upwards, with a finer octave faded out before it aliases.
  vec3 rp = vec3(r.x + motion.z, r.y, fold.y + motion.w);
  vec2 rays = perlin2(rp, vec3(2.0 * rp.x + 3.3, 2.0 * rp.y + 17.0, 2.0 * rp.z + 9.0));
  float ray = clamp(0.5 + 0.62 * (0.7 * rays.x + 0.3 * fineWeight * rays.y), 0.0, 1.0);
  float across = h / sqrt(1.0 + edgeSlope * edgeSlope);

  float patchNoise = broad.y;
  float presence = mix(PATCH_MIN[k], 1.0, smoothstep(PATCH_FLOOR[k], PATCH_FLOOR[k] + 0.55, patchNoise));
  float along = presence * fold.w;

  // Bright rays end in a crisp foot; the dim gaps between them fade out softly, so the edge is
  // a row of lit ray feet rather than one continuous outline.
  float soft = EDGE_SOFT[k] * mix(3.5, 1.0, ray) * s;
  float lower = smoothstep(-soft, soft, across);
  // The lower edge is a line of light that glows on both sides, so it reads as light in the
  // sky and never as the lit crest of a dark silhouette below it.
  // Farther curtains get a wider, dimmer line, so they never cut a crisp stroke across the sky.
  float lineWidth = (9.0 + 6.0 * float(k)) * s;
  float edgeLine = exp(-abs(across) / lineWidth) * (0.5 + 1.2 * ray * ray) * (9.0 * s / lineWidth);
  // The halo reaches further up into the curtain than down into the empty sky below it.
  float halo = exp(-up / (55.0 * s) + min(across, 0.0) / (18.0 * s));
  // Above it a dense sheet fades quickly, and only the rays go on, each to its own height.
  float sheet = lower * exp(-up / (0.38 * height)) * (0.05 + 1.15 * ray * ray);
  // The densest light sits in a narrow band just over the edge: the luminous foot of the curtain.
  float band = lower * exp(-up / (0.16 * height)) * (0.3 + 0.9 * ray);
  // Its bloom spills evenly both ways, so the edge reads as a light source in the air.
  float bloom = exp(-abs(across) / (38.0 * s));
  // A soft veil behind the rays, with no sharp lower boundary.
  float veil = 0.06 * smoothstep(-30.0 * s, 30.0 * s, h) * exp(-up / (0.55 * height));
  float reach = height * (0.45 + 1.4 * ray * ray);
  float streaks = lower * 1.5 * ray * ray * ray * exp(-up / reach);
  // The sky around the curtain: lit far up through the curtain and only a short way below the
  // edge, so the sky under it is never brighter than the gaps between the rays (which would
  // read as a dark hill under a lit crest).
  float glow = exp(-up / (1.1 * height) + min(h, 0.0) / (0.3 * height));

  // The first colour holds the lower part of the curtain; the others take over along the rays.
  vec4 tint = paletteRamp((up - 0.25 * height) / (1.5 * height));
  // Where a fold is brightest, the thin line just under the edge turns to the last palette
  // colour, like the pink lower border of a strong aurora.
  vec4 fringe = paletteColor(uPaletteSize - 1);
  float fringeShare = 0.6 * (1.0 - lower) * smoothstep(1.4, 3.0, crowd);
  float line = edgeLine * presence * crowd;
  light += tint.rgb * tint.a * ((sheet + streaks) * crowd + veil * haze * sqrt(squeeze)) * along;
  light += base.rgb * base.a * (line * (1.0 - fringeShare) + band * crowd + 0.12 * bloom * crowd + 0.22 * halo * squeeze + 0.05 * haze * glow) * along;
  light += fringe.rgb * fringe.a * line * fringeShare * along;
  return light;
}

vec4 experiment(vec2 px) {
  // A faint, patchy haze in the sky the curtains light up.
  vec2 hazeAt = px / (700.0 * uScale);
  float haze = 0.4 + 1.2 * smoothstep(-0.5, 0.6, perlin(vec3(hazeAt.x, hazeAt.y + uSky.x, 3.0 + uSky.y), NO_PERIOD));

  // Called once per curtain rather than from a loop: with this body inside a loop the CPU renderer
  // (SwiftShader) runs for minutes and loses the context.
  vec3 light = curtainLight(0, px, haze) + curtainLight(1, px, haze) + curtainLight(2, px, haze);

  // The glow of the curtains fades out before the bottom of the frame, which stays dark.
  light *= GAIN * (1.0 - smoothstep(600.0, 1060.0, px.y));

  vec4 starTint = mix(vec4(1.0), paletteColor(1), 0.2);
  float starFade = mix(0.3, 1.0, (1.0 - smoothstep(520.0, 1060.0, px.y)));
  light += starTint.rgb * starLight(px) * STAR_LIGHT * starFade;

  // A faint airglow over the horizon: the lower sky brightens a little towards the bottom, so the
  // dark band under the curtains reads as open sky and never as a landmass.
  vec4 airglow = paletteColor(1);
  float horizon = smoothstep(560.0, 1080.0, px.y);
  light += airglow.rgb * airglow.a * AIRGLOW * horizon * horizon * (0.7 + 0.3 * haze);

  light *= uIntensity;
  float peak = max(max(light.r, light.g), light.b);
  if (peak <= 0.0) return vec4(0.0);
  // Soft highlight roll-off: faint light stays as it is, bright folds bloom towards white.
  float mapped = 1.0 - exp(-peak);
  vec3 color = light * (mapped / peak);
  color = mix(color, vec3(mapped), 0.5 * smoothstep(0.8, 3.0, peak));
  return vec4(color, mapped);
}
`,
  scene: (props, frame, durationInFrames) => {
    const phase = loopPhase(frame, durationInFrames);
    // Seconds of motion at speed 1 in one cycle; the circles below are that long.
    const travel = props.speed * props.durationSeconds;
    const loop = travel > 0 ? 1 : 0;
    const random = createSeededRandom(props.seed + 223);
    const circle = (pace: number, offset: number) => {
      const radius = (travel * pace) / TAU;
      const angle = loop * phase + offset;
      return [radius * Math.cos(angle), radius * Math.sin(angle)] as const;
    };
    const twinkle = wholeTurns(travel / TWINKLE_SECONDS) * phase;
    const [hazeX, hazeY] = circle(HAZE_PACE, random() * TAU);
    const zenith = randomBetween(random, 760, 1160);
    const sky: WebGLElement = {
      kind: 'sky',
      twinkleCos: Math.cos(twinkle),
      twinkleSin: Math.sin(twinkle),
      twinkleCos2: Math.cos(2 * twinkle),
      twinkleSin2: Math.sin(2 * twinkle),
      hazeX,
      hazeY,
      zenith,
      opacity: 1,
    };
    // The nearest curtain sweeps down towards one side, the next one leans the other way.
    const lean = random() < 0.5 ? -1 : 1;
    const direction = random() < 0.5 ? -1 : 1;
    const breath = wholeTurns(travel / BREATH_SECONDS) * phase;
    const curtains = LAYERS.map((layer, index): WebGLElement => {
      const [foldX, foldY] = circle(FOLD_PACE, random() * TAU);
      const rayOffset = random() * TAU;
      const [raySlide] = circle(RAY_SLIDE_PACE, rayOffset);
      const [, rayMorph] = circle(RAY_MORPH_PACE, rayOffset);
      return {
        kind: 'curtain',
        edge: randomBetween(random, layer.edge[0], layer.edge[1]),
        height: layer.height,
        tilt: (index % 2 === 0 ? lean : -lean) * randomBetween(random, layer.tilt[0], layer.tilt[1]),
        arc: randomBetween(random, -20, 55),
        fold: layer.fold,
        lane: index * 131 + randomBetween(random, 0, 97),
        // The folds slide sideways as they morph: the three coordinates trace one closed loop.
        slide: 0.8 * foldY,
        foldX,
        foldY,
        raySlide: direction * raySlide,
        rayMorph,
        opacity: layer.brightness * (0.93 + 0.07 * Math.cos(breath + random() * TAU)),
      };
    });
    return [sky, ...curtains];
  },
  uniforms: (scene) => ({
    uCurtainShape: pack(scene, 'curtain', ['edge', 'height', 'tilt', 'arc']),
    uCurtainFold: pack(scene, 'curtain', ['fold', 'lane', 'slide', 'opacity']),
    uCurtainMotion: pack(scene, 'curtain', ['foldX', 'foldY', 'raySlide', 'rayMorph']),
    uTwinkle: pack(scene, 'sky', ['twinkleCos', 'twinkleSin', 'twinkleCos2', 'twinkleSin2']),
    uSky: pack(scene, 'sky', ['hazeX', 'hazeY', 'zenith']),
  }),
};
