import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {pack, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/**
 * Paces at speed 1, in gas lattice units per second. Every motion is one closed turn per cycle
 * around a circle whose circumference is the distance the pace covers in the cycle, so the pace
 * is the same for any durationSeconds and any speed, with no rounding.
 */
const DRIFT_PACE = 0.016;
const BILLOW_PACE = 0.03;
const WARP_PACE = 0.022;
/** Seconds of one slow twinkle at speed 1; some stars twinkle twice as often. */
const TWINKLE_SECONDS = 7;

/** Deep-space nebula: domain-warped gas with dust lanes and emission knots over a starfield. */
export const nebula: WebGLExperiment = {
  glsl: /* glsl */ `
// Drift of the whole medium (xy) and the billow circle of the gas, in gas lattice units.
uniform vec4 uGasMotion;
// The warp circle, the warp strength and the dust strength.
uniform vec4 uWarpMotion;
// Direction of the band the nebula gathers along (cos, sin), its offset and a palette shift.
uniform vec4 uLayout;
// Cosine and sine of the twinkle angle, and of twice that angle.
uniform vec4 uTwinkle;
// Brightness of the faint, medium and bright stars, and the glint length (px).
uniform vec4 uStars;

const float GAS_UNIT = 540.0;

float sq(float x) { return x * x; }

/** A colour at full brightness: its largest channel is 1, so it only carries the hue. */
vec3 hueOf(vec3 c) { return c / max(max(max(c.r, c.g), c.b), 1e-4); }

/** cos(k * angle + phase) for the twinkle of one star: k is 1 or 2, picked by its hash. */
float twinkle(uint h) {
  float phase = unit(pcg(h ^ 0x7FEB352Du)) * TAU;
  vec2 angle = (h & 64u) == 0u ? uTwinkle.xy : uTwinkle.zw;
  return angle.x * cos(phase) - angle.y * sin(phase);
}

/**
 * One layer of stars on a hashed grid: at most one star per cell, anywhere in it. A star
 * reaches at most half a cell, so the 2x2 cells nearest the pixel hold every star that can
 * touch it. Sizes stay above half a pixel, so the stars stay round and never alias.
 */
vec3 starLayer(vec2 px, float cell, float share, uint salt, vec2 sigma, float twinkleDepth, bool glint) {
  vec3 light = vec3(0.0);
  vec2 base = floor(px / cell - 0.5);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 id = base + vec2(float(i), float(j)) + 64.0;
      uint h = hash(uint(id.x), uint(id.y), salt);
      if (unit(h) >= share) continue;
      vec2 at = (id - 64.0 + vec2(unit(pcg(h ^ 0x68E31DA4u)), unit(pcg(h ^ 0xB5297A4Du)))) * cell;
      vec2 d = px - at;
      float r2 = dot(d, d);
      float reach = 0.5 * cell;
      if (r2 >= reach * reach) continue;
      // Many faint stars and few bright ones.
      float magnitude = unit(pcg(h ^ 0x1B56C4E9u));
      magnitude *= magnitude * magnitude;
      float size = mix(sigma.x, sigma.y, magnitude);
      float flicker = 1.0 + twinkleDepth * twinkle(h);
      float star = exp(-r2 / (2.0 * size * size)) * (0.15 + 0.85 * magnitude) * flicker;
      float fade = 1.0 - smoothstep(0.6 * reach, reach, sqrt(r2));
      if (glint) {
        float r = sqrt(r2);
        float halo = 0.06 * exp(-r / (5.0 + 10.0 * magnitude));
        float spikeLength = uStars.w * (0.35 + 0.65 * magnitude) * (0.9 + 0.1 * twinkle(h ^ 0x2C1B3C6Du));
        vec2 a = abs(d);
        float spikes = exp(-a.y * a.y / 0.72) * exp(-a.x / spikeLength) + exp(-a.x * a.x / 0.72) * exp(-a.y / spikeLength);
        star += (halo + 0.35 * spikes) * (0.3 + 0.7 * magnitude) * flicker;
      }
      // Star colours lean slightly towards the palette, some warm, some cool.
      int pick = int(unit(pcg(h ^ 0x51ED270Bu)) * float(uPaletteSize));
      vec3 tint = mix(vec3(1.0), hueOf(paletteColor(pick).rgb), 0.3 * float((h & 3u) != 0u));
      light += tint * star * fade;
    }
  }
  return light;
}

vec4 experiment(vec2 px) {
  float s = uScale;
  vec2 c = (px - 0.5 * uResolution) / (GAS_UNIT * s);

  // Where the nebula lives: a broad, gently bent band across the frame, broken into masses.
  // It stands still, so the composition holds while the gas inside it flows.
  vec2 dir = uLayout.xy;
  float along = dot(c, dir);
  float across = dot(c, vec2(-dir.y, dir.x)) - uLayout.z;
  float bend = perlin(vec3(0.5 * along, 7.3, 1.9), NO_PERIOD);
  float masses = perlin(vec3(0.75 * c + vec2(13.1, 4.7), 5.3), NO_PERIOD);
  float band = exp(-sq((across - 0.8 * bend) / 0.8));
  float envelope = smoothstep(0.1, 0.8, 0.8 * band + 0.8 * masses);

  // The gas: domain-warped fractal noise on a slow orbit, billowing through its own lane.
  vec2 m = c + uGasMotion.xy;
  vec3 w = vec3(0.8 * m + vec2(0.0, uWarpMotion.x), 11.0 + uWarpMotion.y);
  vec2 q = vec2(fbm(w, NO_PERIOD, 3), fbm(w + vec3(5.2, 1.3, 9.7), NO_PERIOD, 3));
  vec2 g = 1.25 * m + uWarpMotion.z * q;
  float gas = fbm(vec3(g + vec2(uGasMotion.z, 0.0), uGasMotion.w), NO_PERIOD, 5);
  float dustNoise = fbm(vec3(1.6 * g + vec2(41.0 + 1.6 * uGasMotion.z, 17.0), 23.0 + uGasMotion.w), NO_PERIOD, 4);
  float hueNoise = perlin(vec3(0.45 * m + 0.25 * q, 3.0 + 0.5 * uGasMotion.w), NO_PERIOD);

  float density = envelope * smoothstep(-0.3, 0.45, gas + 0.25 * envelope - 0.1);
  float knots = envelope * smoothstep(0.2, 0.6, gas + 0.1 * envelope);
  float dust = uWarpMotion.w * smoothstep(-0.05, 0.3, dustNoise) * smoothstep(0.15, 0.7, envelope);
  float rim = smoothstep(-0.2, -0.04, dustNoise) * (1.0 - smoothstep(-0.04, 0.12, dustNoise));

  float t = clamp(0.5 + 0.9 * hueNoise + 0.5 * q.x + uLayout.w, 0.0, 1.0);
  vec4 tint = paletteRamp(t);
  vec4 hot = paletteRamp(clamp(t + 0.35, 0.0, 1.0));
  vec3 light = tint.rgb * tint.a * (1.1 * density * density + 0.12 * density);
  light += hot.rgb * hot.a * (2.2 * knots * knots + 0.5 * rim * density * uWarpMotion.w);
  light *= 1.0 - 0.88 * dust;

  // Stars: fixed in the sky, dimmed where dust passes in front of them.
  float starDensity = mix(0.6, 1.3, envelope);
  vec3 stars = starLayer(px, 14.0, 0.2 * starDensity, 9127u, vec2(0.55, 0.75), 0.25, false) * uStars.x;
  stars += starLayer(px, 46.0, 0.45 * starDensity, 7411u, vec2(0.7, 1.1), 0.2, false) * uStars.y;
  stars += starLayer(px, 240.0, 0.3, 3319u, vec2(1.0, 1.7), 0.12, true) * uStars.z;
  light += stars * (1.0 - 0.9 * dust);

  light *= uIntensity;
  float peak = max(max(light.r, light.g), light.b);
  if (peak <= 0.0) return vec4(0.0);
  // Soft highlight roll-off: faint gas stays as it is, knots and star cores bloom towards white.
  float mapped = 1.0 - exp(-peak);
  vec3 color = light * (mapped / peak);
  color = mix(color, vec3(mapped), 0.5 * smoothstep(0.9, 3.5, peak));
  return vec4(color, mapped);
}
`,
  scene: (props, frame, durationInFrames) => {
    const phase = loopPhase(frame, durationInFrames);
    // Seconds of motion at speed 1 in one cycle; the circles below are that long.
    const travel = props.speed * props.durationSeconds;
    const loop = travel > 0 ? 1 : 0;
    const random = createSeededRandom(props.seed + 611);
    const circle = (pace: number, offset: number) => {
      const radius = (travel * pace) / TAU;
      const angle = loop * phase + offset;
      return [radius * Math.cos(angle), radius * Math.sin(angle)] as const;
    };
    const [driftX, driftY] = circle(DRIFT_PACE, random() * TAU);
    const [billowX, billowZ] = circle(BILLOW_PACE, random() * TAU);
    const [warpY, warpZ] = circle(WARP_PACE, random() * TAU);
    const twinkle = wholeTurns(travel / TWINKLE_SECONDS) * phase;
    // The band leans a little, one way or the other, and passes near the middle of the frame.
    const lean = (random() < 0.5 ? -1 : 1) * randomBetween(random, 0.2, 0.55);
    const gas: WebGLElement = {
      kind: 'gas', driftX, driftY, billowX, billowZ, warpY, warpZ, warp: 1.6, dust: 1, opacity: 1,
    };
    const layout: WebGLElement = {
      kind: 'layout',
      bandCos: Math.cos(lean),
      bandSin: Math.sin(lean),
      bandOffset: randomBetween(random, -0.25, 0.25),
      hueShift: randomBetween(random, -0.12, 0.12),
      opacity: 1,
    };
    const sky: WebGLElement = {
      kind: 'sky',
      twinkleCos: Math.cos(twinkle),
      twinkleSin: Math.sin(twinkle),
      twinkleCos2: Math.cos(2 * twinkle),
      twinkleSin2: Math.sin(2 * twinkle),
      faint: 0.55,
      medium: 1.1,
      bright: 2.4,
      glint: 9,
      opacity: 1,
    };
    return [gas, layout, sky];
  },
  uniforms: (scene) => ({
    uGasMotion: pack(scene, 'gas', ['driftX', 'driftY', 'billowX', 'billowZ']),
    uWarpMotion: pack(scene, 'gas', ['warpY', 'warpZ', 'warp', 'dust']),
    uLayout: pack(scene, 'layout', ['bandCos', 'bandSin', 'bandOffset', 'hueShift']),
    uTwinkle: pack(scene, 'sky', ['twinkleCos', 'twinkleSin', 'twinkleCos2', 'twinkleSin2']),
    uStars: pack(scene, 'sky', ['faint', 'medium', 'bright', 'glint']),
  }),
};
