import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../loop';
import {pack, type WebGLElement} from '../webgl/scene';
import {churnFlow, driftFlow, PAINT_GLSL, turnsEvery, type WatercolorScene} from './paint';

/** Drift paces at speed 1 (px per second) and lives (seconds) of the clouds, the mist and the ripples. */
const CLOUD = {pace: 7, life: 9};
const MIST = {pace: 16, life: 8};
const WATER = {pace: 10, life: 5};
/** Lattice units per second the pigment churns at, inside the washes. */
const CHURN_RATE = 0.02;
/** Seconds of one lap of each soaring bird at speed 1, and of one beat of its wings. */
const LAP_SECONDS = [16, 11] as const;
const BEAT_SECONDS = 1.8;

/**
 * A misty valley painted in watercolour: a graded sky with wet-in-wet clouds and a sun left as
 * bare paper, four ranges of mountains that pale into the distance and dissolve into mist at
 * their feet, pines on the near hills, a still lake that mirrors it all, and two birds soaring.
 * The mist drifts between the ranges, the clouds sail, the water shivers and the birds circle;
 * the paper never moves.
 */
export const valley: WatercolorScene = {
  glsl: /* glsl */ `
${PAINT_GLSL}
// Drifts of the clouds, the mist and the ripples: cosine and sine of their life, px per life.
uniform vec3 uClouds;
uniform vec3 uMist;
uniform vec3 uWater;
// Where the churn of the pigment samples its noise.
uniform vec3 uChurn;
// The sun: centre and radius (px), and how far its glow reaches (px).
uniform vec4 uSun;
// Per bird: position (px), apparent wingspan (px) and how far its wings are raised (-1…1).
uniform vec4 uBirds[2];

// Where the water starts (px from the top).
const float SHORE = 792.0;
// Per range, back to front: rest height (px), rise of its peaks (px), lattice (px), roughness.
const vec4 RIDGE[4] = vec4[4](
  vec4(585.0, 190.0, 360.0, 0.55),
  vec4(650.0, 125.0, 290.0, 0.5),
  vec4(715.0, 85.0, 230.0, 0.45),
  vec4(835.0, 95.0, 210.0, 0.45));
// Per range: load, hardness of its top edge, how deep it stays solid below the ridge (px) and
// over how many px the mist washes it out.
const vec4 BODY[4] = vec4[4](
  vec4(0.32, 0.2, 25.0, 170.0),
  vec4(0.5, 0.5, 40.0, 160.0),
  vec4(0.75, 0.85, 55.0, 140.0),
  vec4(1.05, 1.0, 900.0, 1.0));
// How high the near hills climb at the sides of the frame (px).
const float SIDE_RISE = 420.0;
// Width of a wet edge (px) and of the rim a dried edge pools into (px).
const float WET_EDGE = 9.0;
const float RIM = 3.0;
// Pines along the near hills: spacing (px), shortest and tallest (px).
const float PINE_STEP = 24.0;
const vec2 PINE_HEIGHT = vec2(38.0, 104.0);

float ridgeHeight(int range, float x) {
  vec4 r = RIDGE[range];
  float u = x / r.z + 40.0 + 17.0 * float(range);
  uint salt = uint(range) * 977u + 31u;
  float broad = 0.5 + 0.5 * noise1(0.45 * u, salt);
  float peaks = 0.0;
  float amp = 0.5;
  float f = 1.0;
  for (int o = 0; o < 4; o++) {
    peaks += amp * (1.0 - softAbs(1.3 * noise1(u * f, salt + uint(o + 1) * 7919u)));
    f *= 2.07;
    amp *= r.w;
  }
  float h = r.x - r.y * (0.6 * broad + 0.55 * peaks);
  if (range == 3) {
    // The near hills close the valley at the sides, unevenly: a long shoulder on the left, a
    // steeper hill on the right, each with its own swells.
    float side = x < 1010.0 ? (1010.0 - x) / 1010.0 : (x - 1010.0) / 910.0;
    float swell = 0.8 + 0.3 * noise1(x / 420.0 + 9.0, 4421u);
    h -= SIDE_RISE * pow(side, x < 1010.0 ? 1.25 : 1.9) * swell;
  }
  return h;
}

/** The clouds at p, 0…1: wet-in-wet masses high in the sky, sailing on the drift. */
float cloudAt(vec2 p) {
  float life = lifeOf(uClouds.xy, 0.5 + 0.5 * perlin(vec3(p / 1100.0, 2.1), NO_PERIOD));
  float n = driftFbm(p / vec2(520.0, 140.0), vec2(uClouds.z / 520.0, 0.0), life, 3.0, 5);
  float band = exp(-sq((p.y - 230.0) / 190.0));
  return smoothstep(0.0, 0.45, 0.85 * n + 0.5 * band - 0.35);
}

/** The mist over a range at p, about -1…1: long bands drifting sideways, faster nearer. */
float mistAt(vec2 p, float range) {
  float life = lifeOf(uMist.xy, 0.5 + 0.5 * perlin(vec3(p / 900.0, 3.3), NO_PERIOD));
  vec2 shift = vec2((1.0 + 0.45 * range) * uMist.z / 380.0, 0.0);
  return driftFbm(p / vec2(380.0, 60.0) + vec2(0.0, 7.0 * range), shift, life, 20.0 + range, 3);
}

/** Pines standing on the near hills: how much of p they cover. */
float pinesAt(vec2 p, float soft) {
  float cell = floor(p.x / PINE_STEP);
  float cover = 0.0;
  for (int k = -2; k <= 2; k++) {
    float c = cell + float(k);
    uint h = hash(uint(int(c) + 8192), 811u);
    if (unit(h) < 0.18) continue;
    float x = (c + 0.2 + 0.6 * unit(pcg(h ^ 0x51ED27u))) * PINE_STEP;
    float base = ridgeHeight(3, x) + 10.0;
    // No pines on the low ground by the water: they thin out towards the shore.
    float room = smoothstep(SHORE - 30.0, SHORE - 140.0, base);
    if (room <= 0.0) continue;
    float height = mix(PINE_HEIGHT.x, PINE_HEIGHT.y, unit(pcg(h ^ 0x2C1B3Cu))) * (0.55 + 0.45 * room);
    float t = (p.y - base + height) / height;
    if (t < 0.0 || t > 1.0) continue;
    // Tiers of boughs: each widens down to a ragged tip, then the next starts narrower.
    float tiers = 4.0 + floor(4.0 * unit(pcg(h ^ 0x9E3779u)));
    float tier = fract(t * tiers + 0.15);
    float width = height * 0.2 * pow(t, 0.85) * (0.62 + 0.38 * tier);
    float ragged = 2.2 * perlin(vec3(p * 0.35, float(c)), NO_PERIOD);
    float trunk = t > 0.88 ? 1.6 : 0.0;
    float inside = max(width + ragged, trunk) - abs(p.x - x);
    cover = max(cover, clamp(0.5 + inside / max(soft, 1.0), 0.0, 1.0));
  }
  return cover;
}

/**
 * The sky and the land at p, as glazes: \`soft\` widens every edge (px) for the reflection,
 * \`load\` scales the paint, \`calm\` clears the content area.
 */
void paintLand(vec2 p, float soft, float load, float calm) {
  float t = clamp(p.y / SHORE, 0.0, 1.0);
  float churn = perlin(vec3(p / 300.0, 0.0) + uChurn, NO_PERIOD);
  float blue = 0.62 * pow(1.0 - t, 1.5) * (0.82 + 0.18 * churn) + 0.03;
  float warm = 0.5 * exp(-sq((p.y - 600.0) / 190.0)) * (0.5 + 0.5 * exp(-sq((p.x - uSun.x) / 700.0)));

  float cloud = 0.0;
  float shade = 0.0;
  if (p.y < 600.0) {
    cloud = cloudAt(p);
    shade = max(cloud - cloudAt(p + vec2(0.0, 34.0)), 0.0);
  }
  blue *= 1.0 - 0.85 * cloud;
  warm *= 1.0 - 0.3 * cloud;

  // Blooms where the sky wash was heaviest: water crept back into it and pushed the pigment
  // out into a dark frilled edge round a pale core.
  if (p.y < 380.0 && soft < 0.5) {
    float b = fbm(vec3(p / 170.0, 0.0) + 0.5 * uChurn + vec3(3.0, 8.0, 21.0), NO_PERIOD, 3);
    float petals = fieldDistance(b - 0.36);
    float inBloom = clamp(0.5 + petals, 0.0, 1.0) * (1.0 - smoothstep(150.0, 380.0, p.y));
    float frill = exp(-max(petals, 0.0) / 3.5) * inBloom;
    blue *= 1.0 - 0.45 * inBloom + 0.9 * frill;
  }

  // The sun is bare paper; a warm glow spreads round it, wet into the sky.
  float outside = length(p - uSun.xy) - uSun.z;
  float disc = clamp(0.5 - (outside + gCrinkle) / max(soft, 1.0), 0.0, 1.0);
  float halo = exp(-max(outside, 0.0) / uSun.w);
  blue *= (1.0 - disc) * (1.0 - 0.55 * halo);
  warm = (warm + 0.35 * halo) * (1.0 - disc);
  shade *= 1.0 - disc;

  float clear = 1.0 - 0.5 * calm;
  glaze(0, blue * load * clear);
  glaze(1, warm * load * (1.0 - 0.3 * calm));
  glaze(2, (0.42 * shade + 0.08 * cloud) * load * clear);

  for (int i = 0; i < 4; i++) {
    float h = ridgeHeight(i, p.x);
    if (p.y < h - 2.0 * WET_EDGE - soft) continue;
    float slope = ridgeHeight(i, p.x + 1.0) - h;
    float d = (p.y - h) / sqrt(1.0 + slope * slope);
    vec4 body = BODY[i];
    float hard = soft > 0.5 ? 0.0 : body.y;
    float fringe = perlin(vec3(p / 23.0, 5.0 + float(i)), NO_PERIOD);
    float cover = washCover(d, hard, max(WET_EDGE, soft), fringe);
    float solid = 1.0;
    if (i < 3) {
      solid = 1.0 - smoothstep(body.z, body.z + body.w, p.y - h + 55.0 * mistAt(p, float(i)));
    } else {
      solid = 1.0 - smoothstep(SHORE - 1.5, SHORE + 0.5, p.y);
    }
    // The wash is uneven: the pigment gathered in blotches while it was wet.
    float mottle = 0.84 + 0.3 * fbm(vec3(p / 210.0, 9.0 + float(i)) + uChurn, NO_PERIOD, 3);
    float rho = body.x * load * cover * solid * edgeLoad(d, hard, RIM) * mottle * (1.0 - 0.35 * calm * float(i < 2));
    // The ranges nearest the sun catch its warm haze, wet into their cool colour.
    float backlit = exp(-sq((p.x - uSun.x) / 520.0)) * (1.0 - 0.3 * float(i));
    if (i == 0) { glaze(2, 0.6 * rho); glaze(1, (0.45 + 0.5 * backlit) * rho); }
    else if (i == 1) { glaze(2, rho); glaze(1, 0.35 * backlit * rho); }
    else if (i == 2) { glaze(2, 0.55 * rho); glaze(3, 0.45 * rho); glaze(1, 0.2 * backlit * rho); }
    else {
      // The near hills were painted wet: their slate runs into the green of the pines.
      float green = smoothstep(-0.3, 0.5, fbm(vec3(p / 260.0, 14.0) + 0.5 * uChurn, NO_PERIOD, 3) + 0.4 * (p.y - h) / 300.0);
      glaze(3, rho * (1.0 - 0.45 * green));
      glaze(4, 0.55 * rho * green);
    }
  }

  float near = ridgeHeight(3, p.x);
  if (p.y > near - PINE_HEIGHT.y - 20.0 && p.y < SHORE) glaze(4, 1.35 * load * pinesAt(p, soft));
}

/** Two birds soaring, in ink: an arched stroke for each wing, thinning to the tips. */
void paintBirds(vec2 px) {
  for (int i = 0; i < 2; i++) {
    vec4 bird = uBirds[i];
    vec2 q = px - bird.xy;
    float halfSpan = 0.5 * bird.z;
    if (abs(q.x) > halfSpan + 2.0 || abs(q.y) > bird.z) continue;
    float u = clamp(abs(q.x) / max(halfSpan, 1.0), 0.0, 1.0);
    float wing = -bird.z * (0.16 * sin(PI * u) + 0.24 * bird.w * u);
    float width = mix(1.7, 0.55, u);
    float ink = clamp(width - abs(q.y - wing) + 0.5, 0.0, 1.0) * clamp(halfSpan + 0.5 - abs(q.x), 0.0, 1.0);
    glaze(3, 1.5 * ink);
  }
}

vec4 experiment(vec2 px) {
  beginPaint(px);
  float calm = uLook.z * plateWeight(px);
  if (px.y < SHORE) {
    paintLand(px, 0.0, 1.0, calm);
    paintBirds(px);
  } else {
    // The lake mirrors the land, softer and a little paler, broken by the ripples; it deepens
    // towards the viewer, where the ripples grow wider and further apart.
    float depth = (px.y - SHORE) / (1080.0 - SHORE);
    float skew = 0.5 + 0.5 * perlin(vec3(px / 700.0, 4.4), NO_PERIOD);
    float life = lifeOf(uWater.xy, skew);
    float swell = driftFbm(px / vec2(150.0, 7.0 + 22.0 * depth), vec2(uWater.z / 150.0, 0.0), life, 40.0, 3);
    vec2 mirror = vec2(px.x + 12.0 * depth * swell, 2.0 * SHORE - px.y + (1.5 + 5.0 * depth) * swell);
    paintLand(mirror, 5.0 + 16.0 * depth, 0.62, calm);
    glaze(0, 0.07 + 0.24 * depth);
    // Ripples: streaks of lifted paper and a few darker ones, densest in the sun's path.
    float lines = driftFbm(px / vec2(260.0, 3.0 + 8.0 * depth), vec2(uWater.z / 260.0, 0.0), life, 50.0, 2);
    float path = exp(-sq((px.x - uSun.x) / (36.0 + 90.0 * depth)));
    float lifted = smoothstep(0.32, 0.55, lines + 0.25 * path) * (0.45 + 0.5 * path);
    gLow *= 1.0 - lifted;
    gHigh *= 1.0 - lifted;
    glaze(3, 0.28 * smoothstep(0.38, 0.62, -lines) * (0.4 + 0.6 * depth));
  }
  return finishPaint(px);
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    const random = createSeededRandom(props.seed + 5101);
    const sun: WebGLElement = {
      kind: 'sun',
      x: randomBetween(random, 1260, 1480),
      y: randomBetween(random, 400, 450),
      radius: randomBetween(random, 42, 50),
      glow: randomBetween(random, 100, 140),
      opacity: 1,
    };
    const beat = turnsEvery(props, BEAT_SECONDS);
    const birds = LAP_SECONDS.map((seconds, index): WebGLElement => {
      const lap = turnsEvery(props, seconds);
      const angle = lap.turns * phase + random() * TAU;
      const radiusX = randomBetween(random, 70, 120) * (index === 0 ? 1 : 0.7) * lap.reach;
      const radiusY = radiusX * 0.32;
      const centreX = randomBetween(random, 300, 620) + (index === 0 ? 0 : randomBetween(random, 120, 220));
      const centreY = randomBetween(random, 210, 290) + (index === 0 ? 0 : -60);
      // Seen from below and afar: a bird flying across shows its whole span, one flying towards
      // or away from us only part of it.
      // Rounded at the turn, so the span never changes its rate in a kink.
      const across = Math.sqrt(Math.cos(angle) ** 2 + 0.01);
      const span = (index === 0 ? 26 : 17) * (0.45 + 0.55 * across);
      const lift = 0.35 * Math.sin(beat.turns * phase + random() * TAU) * beat.reach;
      return {kind: 'bird', x: centreX + radiusX * Math.cos(angle), y: centreY + radiusY * Math.sin(angle), span, lift, opacity: 1};
    });
    return [
      {...driftFlow(props, phase, CLOUD.pace, CLOUD.life, 5111), kind: 'clouds'},
      {...driftFlow(props, phase, MIST.pace, MIST.life, 5113), kind: 'mist'},
      {...driftFlow(props, phase, WATER.pace, WATER.life, 5117), kind: 'water'},
      churnFlow(props, phase, CHURN_RATE, 5119),
      sun,
      ...birds,
    ];
  },
  uniforms: (scene) => ({
    uClouds: pack(scene, 'clouds', ['cos', 'sin', 'drift']),
    uMist: pack(scene, 'mist', ['cos', 'sin', 'drift']),
    uWater: pack(scene, 'water', ['cos', 'sin', 'drift']),
    uChurn: pack(scene, 'churn', ['x', 'y', 'z']),
    uSun: pack(scene, 'sun', ['x', 'y', 'radius', 'glow']),
    uBirds: pack(scene, 'bird', ['x', 'y', 'span', 'lift']),
    // Sky, warm glow, lavender distance, slate hills, pines, accent: the lavender granulates most.
    uGranule: [0.45, 0.2, 0.9, 0.6, 0.35, 0.3],
  }),
};
