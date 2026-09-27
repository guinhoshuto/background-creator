import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {fract, getNoiseFlow, pack, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/** Seconds per orbit of the main network's cells at speed 1, and of the second network's. */
const MAIN_ORBIT_SECONDS = 12;
const SECOND_ORBIT_SECONDS = 9;
const WIDTH = 1920;
const HEIGHT = 1080;

/**
 * Sunlight under the sea: two crossing networks of bright filaments (warped Voronoi borders)
 * bent by one periodic water surface, whose slope also splits each filament into three palette
 * samples. Around them, the water itself: light scattered in the water column that fades with
 * depth, beams from a sun above the frame, the rippling glow of the surface at the top and
 * specks of drifting sediment.
 */
export const caustics: WebGLExperiment = {
  glsl: /* glsl */ `
uniform vec2 uFlow;
uniform vec2 uDrift;
uniform vec2 uOrbit;
uniform vec3 uSun;

// Cell of the main network in px at scale 1, and the second network's share of it.
const float CAUSTIC_CELL = 250.0;
const float SECOND_RATIO = 0.78;
// Where the sea floor meets the water, as a share of the frame height from the top.
const float HORIZON = 0.36;
// Corner rounding of the cells, in lattice units.
const float CAUSTIC_ROUNDING = 0.035;
// Sediment: one speck at most per cell (px at scale 1), in a share of the cells.
const float SNOW_CELL = 70.0;
const float SNOW_SHARE = 0.3;

/** Drifting specks of sediment, each on its own small periodic orbit; about 0…1. */
float marineSnow(vec2 px, float orbit) {
  float cell = SNOW_CELL * uScale;
  vec2 q = px / cell;
  ivec2 home = ivec2(floor(q));
  float light = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 c = home + ivec2(i, j);
      uint h = hash(uint(c.x + 4096), uint(c.y + 4096), 7u);
      if (unit(h) > SNOW_SHARE) continue;
      vec2 place = vec2(unit(pcg(h ^ 0x2C1B3C6Du)), unit(pcg(h ^ 0x297A2D39u)));
      // orbit wraps at TAU: it only enters through cos and sin of it.
      float angle = orbit + unit(pcg(h ^ 0x6F4F2A71u)) * TAU;
      vec2 at = vec2(c) + 0.25 + 0.5 * place + 0.22 * vec2(cos(angle), 0.6 * sin(angle));
      vec2 d = (q - at) * cell;
      float size = unit(pcg(h ^ 0x51ED270Bu));
      // Most specks are out of focus: larger and fainter.
      float sigma = mix(0.7, 3.2, size * size);
      light += exp(-dot(d, d) / (2.0 * sigma * sigma)) * mix(0.9, 0.25, size);
    }
  }
  return light;
}

/** Feature point of lattice cell c: a seeded home and a small orbit, one turn per turn of orbit. */
vec2 causticPoint(ivec2 c, uint net, float orbit) {
  uint h = hash(uint(c.x + 4096), uint(c.y + 4096), net);
  vec2 home = vec2(float(h & 255u), float((h >> 8u) & 255u)) * (0.52 / 255.0) + 0.24;
  float radius = 0.08 + 0.12 * float((h >> 24u) & 127u) / 127.0;
  // orbit wraps at TAU, so it only enters through cos and sin of a whole multiple of it.
  float angle = ((h & 0x80000000u) == 0u ? orbit : -orbit) + float((h >> 16u) & 255u) * (TAU / 256.0);
  return home + radius * vec2(cos(angle), sin(angle));
}

/**
 * Distance, in lattice units, from q + k * shift (k = -1, 0, 1: the three dispersion samples)
 * to the borders of the Voronoi cell that holds q, as an exponential smooth minimum over the
 * borders: the light fills the corners of every cell and the dark cells round off, as in a
 * real caustic network. A sample that crossed a border counts its distance past it. The
 * result dips below zero where two borders are close, that is, where filaments meet.
 *
 * Only the borders near q light it, and the point across such a border is nearly as close
 * to q as the nearest one, so it lies in the 3x3 block of lattice cells around q: the second
 * pass walks the same block as the first. (A local array of the points is slower on some GPUs.)
 */
vec3 causticBorders(vec2 q, vec2 shift, uint net, float orbit, float rounding) {
  ivec2 home = ivec2(floor(q));
  vec2 f = q - vec2(home);
  vec2 nearest = vec2(0.0);
  float best = 1e9;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 g = ivec2(i, j);
      vec2 r = vec2(g) + causticPoint(home + g, net, orbit) - f;
      float d = dot(r, r);
      if (d < best) { best = d; nearest = r; }
    }
  }
  vec3 k = vec3(-1.0, 0.0, 1.0);
  vec3 sum = vec3(1e-20);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 g = ivec2(i, j);
      vec2 r = vec2(g) + causticPoint(home + g, net, orbit) - f;
      vec2 e = r - nearest;
      float len2 = dot(e, e);
      if (len2 < 1e-8) continue;
      vec2 normal = e * inversesqrt(len2);
      vec3 d = abs(dot(0.5 * (nearest + r), normal) - k * dot(shift, normal));
      sum += exp(-d / rounding);
    }
  }
  return -rounding * log(sum);
}

/** A filament's light at a distance in px: a sharp core over a soft skirt. */
vec3 causticLight(vec3 d, float width, float glow) {
  vec3 x = d / width;
  vec3 falloff = 1.0 / (1.0 + x * x);
  return falloff * falloff + 0.22 * exp(-d / glow);
}

vec4 experiment(vec2 px) {
  float cell = CAUSTIC_CELL * uScale;
  float second = cell * SECOND_RATIO;

  // The sea floor seen at a glance: a plane below a horizon, mapped to floor coordinates that
  // match the screen at the bottom edge and stretch away towards the horizon.
  float horizon = HORIZON * uResolution.y;
  float t = max((px.y - horizon) / (uResolution.y - horizon), 0.02);
  float distance = 1.0 / t;
  vec2 floorPx = vec2((px.x - 0.5 * uResolution.x) * distance + 0.5 * uResolution.x, (distance - 1.0) * (uResolution.y - horizon));
  // The floor fades into the water well before the horizon, where the network would alias.
  float floorVisible = px.y > horizon ? smoothstep(0.0, 0.3, t) * exp(-0.35 * (distance - 1.0)) : 0.0;

  // The water surface: one slow periodic warp bends both networks and sets the dispersion.
  vec2 wp = floorPx / (cell * 1.6);
  vec2 wave = vec2(
    fbm(vec3(wp, uFlow.x), uFlow.y, 3),
    fbm(vec3(wp + vec2(13.7, 5.9), uFlow.x), uFlow.y, 3));
  vec2 warp = wave * (cell * 0.5);
  // The second network sees the same surface turned a quarter turn, so the two cross.
  vec2 fullA = floorPx + warp;
  vec2 fullB = floorPx + 0.85 * vec2(warp.y, -warp.x);
  // Floor px per screen px here (perspective and warp together), so filaments keep their width.
  float stretchA = sqrt(0.5 * (dot(dFdx(fullA), dFdx(fullA)) + dot(dFdy(fullA), dFdy(fullA))));
  float stretchB = sqrt(0.5 * (dot(dFdx(fullB), dFdx(fullB)) + dot(dFdy(fullB), dFdy(fullB))));

  vec2 bentA = fullA / cell;
  vec2 bentB = fullB / second;
  float width = 1.7 + 0.5 * uScale;
  // Dispersion follows the slope but stays within about a filament's width, so each filament
  // fringes into colour instead of splitting into three lines.
  vec2 shift = warp * 0.2;
  shift /= 1.0 + length(shift) / (1.3 * width * stretchA);
  vec3 sA = causticBorders(bentA, shift / cell, 1u, uOrbit.x, CAUSTIC_ROUNDING);
  vec3 sB = causticBorders(bentB, shift / second, 2u, uOrbit.y, CAUSTIC_ROUNDING);
  vec3 knotA = smoothstep(0.15, 0.69, -sA / CAUSTIC_ROUNDING);
  vec3 knotB = smoothstep(0.15, 0.69, -sB / CAUSTIC_ROUNDING);
  vec3 dA = max(sA, 0.0) * (cell / stretchA);
  vec3 dB = max(sB, 0.0) * (second / stretchB);

  // Filaments brighten and fade along their length, carried with the pattern.
  float alongA = smoothstep(-0.45, 0.4, perlin(vec3(bentA * 0.8 + vec2(3.1, 8.2), uFlow.x), uFlow.y));
  float alongB = smoothstep(-0.1, 0.5, perlin(vec3(bentB * 0.7 + vec2(17.4, 2.6), uFlow.x), uFlow.y));
  // Brighter stretches are also wider, so a few strong filaments lead over many faint ones.
  vec3 net = (0.25 + 0.75 * alongA) * (causticLight(dA, width * (0.75 + 0.5 * alongA), 4.0 + 0.03 * cell) + 0.9 * knotA)
    + 0.45 * alongB * (causticLight(dB, width * 0.9, 4.0 + 0.03 * second) + 0.6 * knotB);

  // Slow patches of stronger light, and beams from a sun above the frame.
  float patches = smoothstep(-0.5, 0.45, perlin(vec3(floorPx / (cell * 4.0) + vec2(9.1, 3.7), uDrift.x), uDrift.y));
  vec2 fromSun = px - uSun.xy;
  float theta = atan(fromSun.x, fromSun.y);
  float beam = 0.65 * perlin(vec3(theta * 6.0 / uScale, 3.3, uDrift.x), uDrift.y)
    + 0.35 * perlin(vec3(theta * 15.0 / uScale, 7.9, uDrift.x * 2.0), uDrift.y * 2.0);
  float depth = px.y / uResolution.y;
  beam = smoothstep(-0.1, 0.55, beam) * exp(-1.6 * depth);
  net *= (0.4 + 0.6 * patches) * (1.0 + 0.5 * beam) * floorVisible;

  // The hue wanders through the palette across the frame; each dispersion sample takes the
  // colour a little before or after it, so filaments fringe into the neighbouring colours.
  float hue = uSun.z + 0.3 * px.x / uResolution.x
    + 0.55 * perlin(vec3(px / (cell * 5.0) + vec2(1.7, 21.3), uDrift.x), uDrift.y);
  float spread = 0.3 / float(uPaletteSize);
  vec4 t0 = paletteLoop(hue - spread);
  vec4 t1 = paletteLoop(hue);
  vec4 t2 = paletteLoop(hue + spread);
  vec3 w = net * vec3(t0.a, t1.a, t2.a);
  float sum = w.x + w.y + w.z;
  vec3 light = sum > 0.0 ? (t0.rgb * w.x + t1.rgb * w.y + t2.rgb * w.z) / sum : vec3(0.0);
  // Where the three samples overlap strongly the light is whole again: knots burn brighter
  // and paler, but keep their hue, so they still read over a light background.
  float core = min(min(net.x, net.y), net.z);
  float peak = max(max(light.r, light.g), light.b);
  vec3 hot = mix(peak > 0.0 ? light / peak : light, vec3(1.0), 0.35);
  light = mix(light, hot, clamp(0.3 * (core - 0.6), 0.0, 0.45));
  float aNet = 1.0 - exp(-uIntensity * 3.4 * pow(sum / 3.0, 1.3));

  // Beams take the palette's lightest colour pulled towards the water's, as sunlight through
  // the sea: pale but still blue, never grey.
  vec4 tRay = mix(paletteColor(uPaletteSize - 1), paletteColor(1), 0.35);
  float aRay = clamp(0.42 * beam * uIntensity, 0.0, 1.0) * tRay.a;
  // Light scattered in the water column: the sea is lit from above and deepens into the
  // background colour below, in the first palette colour darkened like deep water.
  vec4 tWater = paletteColor(0);
  tWater.rgb *= 0.55;
  float aWater = clamp(0.62 * pow(1.0 - depth, 1.7) * (0.8 + 0.2 * patches) * uIntensity, 0.0, 1.0) * tWater.a;
  // The underside of the surface: a rippling band of light along the top of the frame.
  float ripple = 0.5 + 0.5 * fbm(vec3(px.x / (cell * 1.2), 4.2 + 0.35 * wave.y, uFlow.x), uFlow.y, 2);
  float aSurface = clamp(0.55 * exp(-px.y / (90.0 * uScale)) * (0.35 + 0.65 * ripple * ripple) * uIntensity, 0.0, 1.0) * tRay.a;
  float aSnow = clamp(0.5 * marineSnow(px, uOrbit.y) * mix(1.0, 0.45, depth) * uIntensity, 0.0, 1.0) * tRay.a;

  // The sand under the network, lit a little, so the floor reads as a surface; far away the
  // water's haze covers it.
  vec4 tSand = paletteColor(1);
  tSand.rgb *= 0.35;
  float aSand = clamp(0.3 * floorVisible * (0.6 + 0.4 * patches) * uIntensity, 0.0, 1.0) * tSand.a;
  float haze = px.y > horizon ? exp(-6.0 * t) : 1.0;
  aWater = max(aWater, clamp(0.4 * haze * uIntensity, 0.0, 1.0) * tWater.a);

  float alpha = 1.0 - (1.0 - aNet) * (1.0 - aRay) * (1.0 - aWater) * (1.0 - aSurface) * (1.0 - aSnow) * (1.0 - aSand);
  float weight = aNet + aRay + aWater + aSurface + aSnow + aSand;
  vec3 color = weight > 0.0
    ? (light * aNet + tRay.rgb * (aRay + aSurface + aSnow) + tWater.rgb * aWater + tSand.rgb * aSand) / weight
    : vec3(0.0);
  return vec4(color * alpha, alpha);
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const cycle = loopPhase(frame, durationInFrames) / TAU;
    const flow = getNoiseFlow(props, cycle, 0.11, 353);
    const drift = getNoiseFlow(props, cycle, 0.05, 359);
    const random = createSeededRandom(props.seed + 367);
    const travel = props.speed * props.durationSeconds;
    const mainTurns = wholeTurns(travel / MAIN_ORBIT_SECONDS);
    const secondTurns = wholeTurns(travel / SECOND_ORBIT_SECONDS);
    // Orbit angles wrap mid-cycle, never at the seam: they start between 20% and 80% of a turn.
    const mainStart = randomBetween(random, 0.2, 0.8);
    const secondStart = randomBetween(random, 0.2, 0.8);
    return [
      {kind: 'flow', position: flow.position, period: flow.period, opacity: 1},
      {kind: 'drift', position: drift.position, period: drift.period, opacity: 1},
      {
        kind: 'orbit',
        main: TAU * fract(mainStart + mainTurns * cycle),
        second: TAU * fract(secondStart + secondTurns * cycle),
        opacity: 1,
      },
      {kind: 'sun', x: randomBetween(random, 0.3, 0.7) * WIDTH, y: -0.85 * HEIGHT, hue: random(), opacity: 1},
    ];
  },
  uniforms: (scene) => ({
    uFlow: pack(scene, 'flow', ['position', 'period']),
    uDrift: pack(scene, 'drift', ['position', 'period']),
    uOrbit: pack(scene, 'orbit', ['main', 'second']),
    uSun: pack(scene, 'sun', ['x', 'y', 'hue']),
  }),
};
