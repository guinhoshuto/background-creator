import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import type {WebGLLoopProps} from '../../WebGLLoop';
import {fract, pack, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/** Seconds of one sway of the fold at speed 1. */
const SWAY_SECONDS = 20;
/** Lattice units per second that the noise travels at speed 1. */
const DRIFT_RATE = 0.07;
/**
 * Light that travels along the crease, in frame heights: its pace per second at speed 1 and
 * the spacing of its pulses. The sheen is one long, soft wave; the streaks carry shorter ones.
 */
const STREAK_PULSES = [{pace: 0.12, wavelength: 0.95, salt: 11}, {pace: 0.09, wavelength: 0.7, salt: 23}];
const SHEEN = {pace: 0.14, wavelength: 2.4, salt: 37};

/**
 * A wave of light moving along the crease at the pace asked. The cycle must hold whole
 * wavelengths, so the wavelength stretches or shrinks to fit instead of the pace; a cycle too
 * short or slow for half a wavelength keeps that half and dims the light, so it never hurries
 * brightly. The shader reads only the cosine and sine of the travel, so its wrap never shows.
 */
const travel = (
  props: WebGLLoopProps,
  cycle: number,
  {pace, wavelength, salt}: {pace: number; wavelength: number; salt: number},
): WebGLElement => {
  const distance = props.speed * props.durationSeconds * pace;
  const turns = wholeTurns(distance / wavelength);
  const shortest = 0.5 * wavelength;
  const fitted = turns > 0 ? Math.max(distance / turns, shortest) : wavelength;
  const reach = turns > 0 ? Math.min(1, distance / shortest) : 1;
  const angle = TAU * fract(0.2 + 0.6 * createSeededRandom(props.seed + salt)() + turns * cycle);
  return {kind: 'travel', cos: Math.cos(angle), sin: Math.sin(angle), wavelength: fitted, reach, opacity: 1};
};

/**
 * Neon drift: a sheet of satin folded along a diagonal crease. Above it lies a calm plane that
 * warms towards the corners; below it the cloth turns away from the light down a glossy slope
 * into a deep valley and climbs back to the warm corner. Two thin streaks of light run along
 * the crease and the lip of the fold, with pulses gliding along them.
 */
export const neon: WebGLExperiment = {
  glsl: /* glsl */ `
// Where the noise is sampled on its circle: the undulation, the haze and the fibres drift and
// evolve along it, and it closes on itself every cycle.
uniform vec2 uDrift;
// A point of the crease (px) and its direction, a unit vector towards the upper right (y down).
uniform vec4 uFold;
// Distances from the crease to the second streak and to the valley floor (frame heights at
// scale 1), and how far the crease undulates.
uniform vec3 uShape;
// Light travelling along the crease: the pulses of each streak, then the sheen on the slope.
// Each holds the cosine and sine of its travel, its wavelength and its reach.
uniform vec4 uTravel[3];
// Centres of the washes over the plane, in frame heights: the warm glow (xy), the cool light (zw).
uniform vec4 uWash;

// Blends in a gamma-2 space: pastel mixes stay luminous instead of sagging through linear greys.
vec3 mixG(vec3 a, vec3 b, float t) {
  vec3 c = mix(sqrt(a), sqrt(b), clamp(t, 0.0, 1.0));
  return c * c;
}

/** The palette in order, blended like mixG: 0 is the first colour, 1 the last. */
vec4 neonRamp(float t) {
  float x = clamp(t, 0.0, 1.0) * float(uPaletteSize - 1);
  int i = int(floor(x));
  float f = smoothstep(0.0, 1.0, x - float(i));
  vec4 a = paletteColor(i);
  vec4 b = paletteColor(i + 1);
  return vec4(mixG(a.rgb, b.rgb, f), mix(a.a, b.a, f));
}

/** Soft crests every wavelength along the crease, carried by the travel (its cosine and sine). */
float travelling(float v, vec4 travel, float sharpness) {
  float a = TAU * v / travel.z;
  float c = cos(a) * travel.x + sin(a) * travel.y;
  return pow(max(0.5 + 0.5 * c, 0.0), sharpness) * travel.w;
}

/**
 * A Gaussian line across the distance (px). The pixel footprint widens it and lowers its peak
 * by the same factor, so a thin line keeps its energy and never flickers as it sways.
 */
float streak(float dist, float sigma, float footprint) {
  float w = sqrt(sigma * sigma + footprint * footprint);
  return sigma / w * exp(-0.5 * dist * dist / (w * w));
}

vec4 experiment(vec2 px) {
  float unitPx = uResolution.y * uScale;
  vec2 along = uFold.zw;
  vec2 across = vec2(-along.y, along.x);
  vec2 d = px - uFold.xy;
  // v runs along the crease towards the upper right; s across it, growing below the crease.
  float v = dot(d, along) / unitPx;
  vec2 q = px / uResolution.y;
  float bend = uShape.z * perlin(vec3(v * 0.9 + 4.3 + uDrift.x, 1.7, uDrift.y + 2.9), NO_PERIOD);
  float s = dot(d, across) / unitPx - bend;
  float lean = clamp(v, -1.5, 1.5);
  // The lip of the fold closes in on the crease towards the upper right, like the reference.
  float gap = uShape.x * (1.0 - 0.16 * lean);
  float valley = uShape.y * (1.0 - 0.1 * lean);
  float haze = perlin(vec3(q * 1.4 + vec2(3.1 + uDrift.x, 7.7), uDrift.y + 0.5), NO_PERIOD);

  vec4 warm = paletteColor(0);
  vec4 light = neonRamp(1.0 / 3.0);
  vec3 white = vec3(1.0);
  float right = smoothstep(-0.1, 1.0, v);
  float left = (1.0 - smoothstep(-0.9, 0.0, v));

  // Above the crease: along it the plane runs from periwinkle on the left, under the light,
  // through the light colour to violet on the right; away from it, it warms into the first
  // colour, which the left keeps cooler. Two washes drift over it.
  float x = max(-s, 0.0);
  float far = smoothstep(0.06, 0.6, x + 0.08 * haze);
  vec4 edge = neonRamp(1.0 / 3.0 + 0.18 * left + 0.3 * right);
  edge.rgb = mixG(edge.rgb, warm.rgb, 0.4 * right);
  vec4 upper = vec4(mixG(edge.rgb, mixG(warm.rgb, light.rgb, 0.45 * left), far), mix(edge.a, warm.a, far));
  vec2 toGlow = q - uWash.xy;
  vec2 toCool = q - uWash.zw;
  upper.rgb = mixG(upper.rgb, warm.rgb, 0.55 * exp(-dot(toGlow, toGlow) / 0.3));
  upper.rgb = mixG(upper.rgb, neonRamp(0.48).rgb, 0.6 * exp(-dot(toCool, toCool) / 0.2));
  float near = exp(-x / 0.14);

  // Below: the slope turns away from the light through the middle colours, the lip of the
  // fold catches a warm bounce and the valley falls into the last colour. Past the valley the
  // cloth climbs back up the palette into the first colour in the far corner, warmer and
  // shallower towards the right.
  float climb = smoothstep(valley, valley + 0.45, s + 0.02 * haze);
  float tLow = (1.0 + smoothstep(0.0, 0.09, s) + smoothstep(gap + 0.005, valley, s)) / 3.0;
  vec4 lower = neonRamp(tLow - 0.45 * smoothstep(0.0, 0.7, climb));
  float lipOffset = (s - gap - 0.02) / 0.014;
  float hollow = smoothstep(gap, valley, s) * (1.0 - smoothstep(0.0, 0.5, climb));
  lower.rgb = mixG(lower.rgb, warm.rgb, 0.3 * exp(-0.5 * lipOffset * lipOffset) + 0.2 * right * hollow);
  lower.rgb *= 1.0 - 0.15 * hollow * (1.0 - 0.6 * right);
  float warmth = smoothstep(0.15 - 0.15 * right, 1.0, climb);
  lower = vec4(mixG(lower.rgb, warm.rgb, warmth), mix(lower.a, warm.a, warmth));

  // The sheen: a broad highlight gliding along the slope, and the lit edge of the plane.
  float slope = smoothstep(0.004, 0.03, s) * (1.0 - smoothstep(gap - 0.035, gap - 0.005, s));
  float sheen = travelling(v + 0.6 * s, uTravel[2], 3.0);
  vec3 bright = mixG(light.rgb, white, 0.3);
  lower.rgb = mixG(lower.rgb, bright, 0.4 * sheen * slope);
  upper.rgb = mixG(upper.rgb, bright, (0.35 + 0.25 * sheen) * near * (1.0 - 0.6 * right));

  float footprint = max(length(vec2(dFdx(s), dFdy(s))) * unitPx, 1e-3);
  float d1 = s * unitPx;
  float above = clamp(0.5 - d1 / footprint, 0.0, 1.0);
  float upperCover = min(0.62 + 0.3 * near + 0.25 * far, 1.0) * upper.a;
  float lowerCover = mix(0.97, 0.72, climb) * lower.a;
  vec3 color = mix(lower.rgb, upper.rgb, above);
  float cover = mix(lowerCover, upperCover, above);

  // Satin fibres along the crease and a faint static grain, like the soft print of the artwork.
  float fibre = perlin(vec3(v * 1.6 + 11.3 + uDrift.x, s * 26.0 + 5.0, uDrift.y + 5.3), NO_PERIOD);
  float grain = unit(hash(uint(px.x), uint(px.y), 7717u)) - 0.5;
  color *= 1.0 + 0.045 * fibre + 0.03 * grain;

  float strength = min(uIntensity, 1.0);
  float gain = 1.0 + 0.5 * max(uIntensity - 1.0, 0.0);
  vec4 layer = vec4(color, 1.0) * cover * strength;

  // The two streaks, with pulses of light gliding along them. The second fades out where the
  // lip closes in on the crease.
  float d2 = (s - gap) * unitPx;
  float p1 = travelling(v, uTravel[0], 5.0);
  float p2 = travelling(v, uTravel[1], 5.0);
  float fade2 = (1.0 - smoothstep(0.3, 1.2, v));
  float halo1 = (streak(d1, 10.0, footprint) * (0.26 + 0.55 * p1) + exp(-0.5 * d1 * d1 / 1600.0) * (0.1 + 0.2 * p1)) * warm.a;
  float glow2 = streak(d2, 6.0, footprint) * (0.1 + 0.4 * p2) * fade2 * light.a;
  float line2 = streak(d2, 1.2, footprint) * (0.4 + 0.8 * p2) * fade2 * light.a;
  float line1 = streak(d1, 3.0, footprint) * (0.8 + 0.5 * p1) * warm.a;
  vec3 tints[4] = vec3[4](mixG(warm.rgb, white, 0.4), mixG(light.rgb, white, 0.3), mixG(light.rgb, white, 0.6), mixG(warm.rgb, white, 0.62));
  float amounts[4] = float[4](halo1, glow2, line2, line1);
  for (int i = 0; i < 4; i++) {
    float a = clamp(amounts[i] * gain * strength, 0.0, 1.0);
    layer = vec4(tints[i] * a, a) + layer * (1.0 - a);
  }
  return layer;
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    const cycle = phase / TAU;
    const pace = (props.speed * props.durationSeconds) / SWAY_SECONDS;
    const turns = wholeTurns(pace);
    // The sway closes in whole turns; on cycles shorter than its pace it swings less instead of hurrying.
    const reach = turns > 0 ? Math.min(1, pace / turns) : 1;
    const random = createSeededRandom(props.seed + 601);
    const tilt = randomBetween(random, 0.31, 0.35);
    const offset = randomBetween(random, -30, 30);
    const gap = randomBetween(random, 0.15, 0.17);
    const valley = gap + randomBetween(random, 0.07, 0.09);
    const bend = randomBetween(random, 0.006, 0.01);
    const offsets = Array.from({length: 8}, () => random() * TAU);
    const drift = (props.speed * props.durationSeconds * DRIFT_RATE) / TAU;
    const centre = [randomBetween(random, 0, 40), randomBetween(random, 0, 40)] as const;
    const wave = (harmonic: number, index: number) => reach * Math.sin(harmonic * turns * phase + offsets[index]!);
    const angle = tilt + 0.016 * wave(1, 0);
    const shift = offset + 14 * wave(1, 1) + 5 * wave(2, 2);
    const alongX = Math.cos(angle);
    const alongY = -Math.sin(angle);
    return [
      // Circle sampling around a seeded centre: the circumference is the distance asked, so the
      // pace is exact, and the circle closes every cycle.
      {kind: 'drift', x: centre[0] + drift * Math.cos(phase + offsets[7]!), y: centre[1] + drift * Math.sin(phase + offsets[7]!), opacity: 1},
      {
        kind: 'fold',
        // The crease runs through the centre, from the lower left to the upper right.
        x: 960 - alongY * shift,
        y: 510 + alongX * shift,
        alongX,
        alongY,
        gap: gap * (1 + 0.05 * wave(1, 3)),
        valley: valley * (1 + 0.04 * wave(1, 4)),
        bend,
        opacity: 1,
      },
      ...STREAK_PULSES.map((pulse) => travel(props, cycle, pulse)),
      travel(props, cycle, SHEEN),
      {
        kind: 'wash',
        glowX: 0.95 + 0.08 * wave(1, 5), glowY: -0.15 + 0.05 * wave(1, 3),
        coolX: -0.05 + 0.04 * wave(1, 6), coolY: 0.6 + 0.06 * wave(1, 5),
        opacity: 1,
      },
    ];
  },
  uniforms: (scene) => ({
    uDrift: pack(scene, 'drift', ['x', 'y']),
    uFold: pack(scene, 'fold', ['x', 'y', 'alongX', 'alongY']),
    uShape: pack(scene, 'fold', ['gap', 'valley', 'bend']),
    uTravel: pack(scene, 'travel', ['cos', 'sin', 'wavelength', 'reach']),
    uWash: pack(scene, 'wash', ['glowX', 'glowY', 'coolX', 'coolY']),
  }),
};
