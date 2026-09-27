import {createSeededRandom, loopPhase, TAU} from '../../../loop';
import {fract, pack, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/** Peak turning speed of a terrain gradient at speed 1, in turns per second. */
const SWING_RATE = 0.012;
/** Pixels per second the map floats at speed 1. */
const DRIFT_RATE = 6;
/** Widest swing of a gradient either side of its rest, in radians; past it, a cycle holds more swings. */
const MAX_SWING = 1.2;

/**
 * Topographic contour lines of a slowly breathing terrain. Every line keeps the same width in
 * pixels whatever the slope, every fifth one is a thicker index contour, and each line takes
 * the palette colour of its own elevation, like a hypsometric map.
 */
export const contours: WebGLExperiment = {
  glsl: /* glsl */ `
// Loop angle (radians; it wraps mid-cycle, so it is only used through whole multiples), the
// gradients' pace (swing width times swings per cycle) and the fewest swings a corner makes.
uniform vec3 uSwing;
// Offset of the whole map in pixels: it floats around a small circle once per cycle.
uniform vec2 uDrift;

// Contour lines per unit of height; every INDEX_EVERY-th line is an index contour.
const float LEVELS = 20.0;
const float INDEX_EVERY = 5.0;
// Half widths in pixels: the lines are drawn as boxes filtered over one pixel.
const float MINOR_HALF = 0.6;
const float INDEX_HALF = 1.2;
// Height (in units of h) over which the palette spreads, through a soft S curve.
const float SPREAD = 0.1;

/**
 * Gradient of a lattice corner, swinging around its resting direction on a closed orbit:
 * a whole number of swings per cycle, each corner with its own phase and swing count, so
 * the terrain breathes without a global rhythm and returns to itself at the end of the cycle.
 */
float swingingCorner(vec2 cell, vec2 offset, uint salt, float reach) {
  uint h = hash(uint(int(cell.x)), uint(int(cell.y)), salt);
  uint h2 = pcg(h);
  float turns = uSwing.z + float(h2 & 1u);
  float swing = turns > 0.0 ? reach * uSwing.y / turns : 0.0;
  float angle = unit(h) * TAU + swing * sin(turns * uSwing.x + unit(h2) * TAU);
  return dot(vec2(cos(angle), sin(angle)), offset);
}

/** 2D gradient noise, about -0.7…0.7, whose gradients swing along the loop. */
float swingingNoise(vec2 p, uint salt, float reach) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 x = vec2(1.0, 0.0);
  vec2 y = vec2(0.0, 1.0);
  return mix(
    mix(swingingCorner(i, f, salt, reach), swingingCorner(i + x, f - x, salt, reach), u.x),
    mix(swingingCorner(i + y, f - y, salt, reach), swingingCorner(i + x + y, f - x - y, salt, reach), u.x),
    u.y);
}

float terrain(vec2 p) {
  // A broad warp turns the round noise blobs into flowing ridges and valleys.
  // It swings less than the terrain: a moving warp slides whole slopes at once.
  vec2 warp = vec2(swingingNoise(p * 0.45, 11u, 0.4), swingingNoise(p * 0.45 + vec2(8.3, 2.9), 12u, 0.4));
  p += warp * 0.55;
  float sum = 0.0;
  float amplitude = 1.0;
  float norm = 0.0;
  float reach = 1.0;
  for (int k = 0; k < 4; k++) {
    sum += amplitude * swingingNoise(p, uint(k), reach);
    norm += amplitude;
    p = mat2(1.6, -1.2, 1.2, 1.6) * p + vec2(19.19, 7.73);
    amplitude *= 0.4;
    // Fine detail swings less, so the small wiggles of the lines stay put.
    reach *= 0.7;
  }
  return sum / norm;
}

/** Palette colour of a contour level (in lines), spread evenly over the usual heights. */
vec4 levelTint(float level) {
  return paletteRamp(0.5 + 0.5 * tanh(level / (LEVELS * SPREAD)));
}

/** Premultiplied source over destination. */
vec4 over(vec4 src, vec4 dst) { return src + dst * (1.0 - src.a); }

vec4 experiment(vec2 px) {
  vec2 p = (px + uDrift) / (uResolution.y * uScale) * 1.3;
  float t = terrain(p) * LEVELS;
  // Levels per pixel: dividing by it keeps every line the same width on any slope.
  float slope = max(length(vec2(dFdx(t), dFdy(t))), 1e-4);
  float gap = 1.0 / slope;

  float minorLevel = floor(t + 0.5);
  float indexLevel = floor(t / INDEX_EVERY + 0.5) * INDEX_EVERY;
  float minorDist = abs(t - minorLevel) * gap;
  float indexDist = abs(t - indexLevel) * gap;
  // Lines closer than a few pixels would shimmer and cause moire: they fade out first.
  float minorCover = clamp(MINOR_HALF + 0.5 - minorDist, 0.0, 1.0) * smoothstep(3.0, 7.0, gap)
    * step(0.5, abs(minorLevel - indexLevel));
  float indexFade = smoothstep(3.0, 7.0, gap * INDEX_EVERY);
  float indexCover = clamp(INDEX_HALF + 0.5 - indexDist, 0.0, 1.0) * indexFade;

  float minorAlpha = 1.0 - pow(0.3, uIntensity);
  float indexAlpha = 1.0 - pow(0.06, uIntensity);

  vec4 layer = vec4(0.0);
  // Faint elevation bands over the upper half of the heights, stepped at the lines; they melt
  // into a plain ramp where lines crowd. Below intensity 0.6 only the lines remain.
  float bandLevel = mix(t, floor(t) + 0.5, smoothstep(3.0, 7.0, gap));
  float bandHeight = 0.5 + 0.5 * tanh(bandLevel / (LEVELS * SPREAD));
  vec4 bandTint = levelTint(bandLevel);
  float band = 0.05 * smoothstep(0.6, 2.0, uIntensity) * smoothstep(0.35, 1.0, bandHeight) * bandTint.a;
  layer = over(vec4(bandTint.rgb * band, band), layer);

  vec4 indexTint = levelTint(indexLevel);
  // A soft halo lifts the index contours off a dark background.
  float halo = 0.1 * uIntensity * exp(-indexDist * indexDist / 50.0) * indexFade * indexTint.a;
  layer = over(vec4(indexTint.rgb * halo, halo), layer);

  vec4 minorTint = levelTint(minorLevel);
  float minor = minorCover * minorAlpha * minorTint.a;
  layer = over(vec4(minorTint.rgb * minor, minor), layer);

  float indexA = indexCover * indexAlpha * indexTint.a;
  layer = over(vec4(indexTint.rgb * indexA, indexA), layer);
  return layer;
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const cycle = loopPhase(frame, durationInFrames) / TAU;
    // The pace follows speed × duration, so the gradients turn equally fast in any cycle;
    // past MAX_SWING they swing more times per cycle instead of wider.
    const pace = props.speed * props.durationSeconds * SWING_RATE;
    const turns = wholeTurns(pace / MAX_SWING);
    // The angle wraps, but its start keeps the wrap away from the seam.
    const random = createSeededRandom(props.seed + 385);
    const start = 0.2 + 0.6 * random();
    // One slow circle per cycle, sized so the map floats at the same pace in any duration.
    const drift = props.speed * props.durationSeconds * DRIFT_RATE / TAU;
    const heading = random() * TAU + (props.speed > 0 ? TAU * cycle : 0);
    return [
      {kind: 'swing', angle: TAU * fract(start + (turns > 0 ? 1 : 0) * cycle), pace, turns, opacity: 1},
      {kind: 'drift', x: drift * Math.cos(heading), y: drift * Math.sin(heading), opacity: 1},
    ];
  },
  uniforms: (scene) => ({
    uSwing: pack(scene, 'swing', ['angle', 'pace', 'turns']),
    uDrift: pack(scene, 'drift', ['x', 'y']),
  }),
};
