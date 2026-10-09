import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../loop';
import {pack, wholeTurns, type WebGLElement} from '../webgl/scene';
import {churnFlow, driftFlow, PAINT_GLSL, turnsEvery, type WatercolorScene} from './paint';

const FISH = 4;
/** Points along each spine, head first. */
const SPINE = 9;
const PADS = 8;
/**
 * Each fish's loop: centre (px) and radii (px), clockwise or not. The centres sit near the
 * corners, so each fish crosses one corner of the pond, slips out of the frame and comes back,
 * and the middle stays open for the content.
 */
const LOOPS = [
  {x: 380, y: 850, radiusX: 340, radiusY: 190, turn: 1},
  {x: 1540, y: 230, radiusX: 360, radiusY: 180, turn: 1},
  {x: 1560, y: 860, radiusX: 330, radiusY: 200, turn: -1},
  {x: 360, y: 240, radiusX: 320, radiusY: 185, turn: -1},
] as const;
/** Seconds of one lap at speed 1, of one beat of the tail and of one sway of the pads. */
const LAP_SECONDS = 16;
const BEAT_SECONDS = 1.15;
const BOB_SECONDS = 8;
/** Drift of the light on the water (px per second at speed 1, life in seconds). */
const SHIMMER = {pace: 12, life: 6};
/** Where the lily pads float: two clusters, upper left and lower right, clear of the middle. */
const CLUSTERS = [{x: 330, y: 300}, {x: 1590, y: 800}] as const;

/** The point of a fish's loop at angle a. */
const loopAt = (loop: (typeof LOOPS)[number], angle: number) => ({
  x: loop.x + loop.radiusX * Math.cos(angle),
  y: loop.y + loop.radiusY * Math.sin(angle),
});

/**
 * A koi pond seen from above, in watercolour: pale teal water that deepens in places, light
 * shivering over it, four koi gliding under the surface with their shadows on the bottom, lily
 * pads floating on top and a lotus flower. The fish swim whole laps that cross the corners and
 * slip out of the frame, their bodies bending and their tails beating; the pads bob.
 */
export const koi: WatercolorScene = {
  glsl: /* glsl */ `
${PAINT_GLSL}
// Per fish, the points of its path under its spine (px), head first.
uniform vec2 uSpine[${FISH * SPINE}];
// Per fish: cosine and sine of its tail beat, and how far the beat swings the tail (px).
uniform vec3 uBeat[${FISH}];
// Per fish: length and half width (px), how far its pectoral fins are spread (0…1), pattern seed.
uniform vec4 uFish[${FISH}];
// Per lily pad: centre and radius (px), and the angle of its notch.
uniform vec4 uPads[${PADS}];
// The lotus: centre and radius (px), its turn, and how open it is.
uniform vec4 uLotus;
// The light on the water drifting: cosine and sine of its life, px per life.
uniform vec3 uShimmer;
uniform vec3 uChurn;

// Where the fish's shadows fall on the bottom (px) and how soft they are (px).
const vec2 SHADOW = vec2(16.0, 22.0);
const float SHADOW_SOFT = 14.0;
const float RIM = 2.6;

/** Half width of a koi's body at t (0 head, 1 tail root), as a share of its widest. */
float bodyProfile(float t) {
  float head = sqrt(clamp(t / 0.13, 0.0, 1.0));
  return head * (1.0 - 0.78 * smoothstep(0.28, 1.0, t)) + 0.05;
}

/** How deep the pond is at p (0…1): a darker hollow below, shallows near the pads. */
float depthAt(vec2 p) {
  return clamp(0.45 + 0.5 * fbm(vec3(p / 520.0, 1.3) + 0.3 * uChurn, NO_PERIOD, 3) + 0.25 * (p.y - 540.0) / 540.0, 0.0, 1.0);
}

/** The lily pad at p: how much of it covers p, its veins, its wet colour mix and its dried rim. */
vec4 padAt(vec2 p) {
  vec4 found = vec4(0.0, 0.0, 0.0, 1.0);
  for (int i = 0; i < ${PADS}; i++) {
    vec4 pad = uPads[i];
    vec2 q = p - pad.xy;
    float r = length(q);
    if (r > pad.z + 4.0) continue;
    float a = atan(q.y, q.x) - pad.w;
    float notch = abs(atan(sin(a), cos(a)));
    // A roundness leaf with a narrow notch to its centre, its edge a little wavy.
    float edge = pad.z * (1.0 + 0.03 * sin(7.0 * a + float(i))) - r;
    float inside = min(edge, (notch - 0.16) * r);
    float cover = clamp(0.5 + inside + gCrinkle, 0.0, 1.0);
    if (cover > found.x) {
      float veins = (1.0 - smoothstep(0.0, 1.4, abs(sin(9.0 * a)) * r * 0.25)) * smoothstep(4.0, 0.25 * pad.z, r);
      float tint = 0.5 + 0.5 * perlin(vec3(p / 40.0, float(i)), NO_PERIOD);
      found = vec4(cover, veins * cover, tint, edgeLoad(inside, 1.0, RIM));
    }
  }
  return found;
}

/** The lotus: petals of pale pink roundness a gold heart. Returns its cover and its petal shading. */
vec2 lotusAt(vec2 p) {
  vec2 q = p - uLotus.xy;
  float r = length(q);
  if (r > uLotus.z + 3.0) return vec2(0.0);
  float a = atan(q.y, q.x) - uLotus.w * 0.1;
  float petals = 0.0;
  float shade = 0.0;
  // Three rings of ten petals, each turned half a petal from the one outside it.
  for (int ring = 0; ring < 3; ring++) {
    float n = 10.0;
    float turn = float(ring) * PI / n + uLotus.w;
    float local = atan(sin(n * (a - turn)), cos(n * (a - turn))) / n;
    float reach = uLotus.z * (1.0 - 0.26 * float(ring));
    // A petal: pointed ellipse along its own axis.
    float along = r / reach;
    float across = abs(local) * r / (reach * 0.42);
    float inside = 1.0 - (along * along + across * across * (1.0 + along));
    float c = clamp(0.5 + inside * reach * 0.5, 0.0, 1.0);
    petals = max(petals, c);
    shade = max(shade, c * (1.0 - inside) * (1.0 - 0.2 * float(ring)));
  }
  return vec2(petals, shade);
}

vec4 experiment(vec2 px) {
  beginPaint(px);
  float calm = uLook.z * plateWeight(px);

  // Water: a pale wash that deepens over the hollows, wet-in-wet.
  float deep = depthAt(px);
  float waterLoad = (0.42 + 0.35 * deep) * (1.0 - 0.35 * calm);

  // Light shivering on the surface: a net of lifted paper drifting slowly.
  float skew = 0.5 + 0.5 * perlin(vec3(px / 800.0, 2.2), NO_PERIOD);
  float life = lifeOf(uShimmer.xy, skew);
  float net = driftFbm(px / 85.0, vec2(uShimmer.z / 85.0, 0.3 * uShimmer.z / 85.0), life, 30.0, 3);
  float shimmer = (1.0 - smoothstep(0.0, 0.05, softAbs(net) - 0.1)) * (0.25 + 0.5 * (1.0 - deep));

  vec4 pad = padAt(px);
  vec2 lotus = lotusAt(px);
  float above = max(pad.x, lotus.x);

  // The fish, under the surface: body, fins and the shadow each casts on the bottom.
  float shadow = 0.0;
  float white = 0.0;
  float orange = 0.0;
  float red = 0.0;
  float ink = 0.0;
  float roundness = 0.0;
  for (int f = 0; f < ${FISH}; f++) {
    vec4 fish = uFish[f];
    // The body bends in a wave that runs to the tail and grows on the way.
    vec3 beat = uBeat[f];
    vec2 bent[${SPINE}];
    for (int j = 0; j < ${SPINE}; j++) {
      vec2 tangent = normalize(uSpine[f * ${SPINE} + min(j + 1, ${SPINE - 1})] - uSpine[f * ${SPINE} + max(j - 1, 0)]);
      float lag = 0.85 * float(j);
      float wave = beat.z * pow(float(j) / ${(SPINE - 1).toFixed(1)}, 1.6) * (beat.y * cos(lag) - beat.x * sin(lag));
      bent[j] = uSpine[f * ${SPINE} + j] + vec2(-tangent.y, tangent.x) * wave;
    }
    vec2 head = bent[0];
    vec2 tail = bent[${SPINE - 1}];
    // Skip the pixels far from this fish.
    vec2 lo = min(head, tail) - vec2(fish.x * 0.6 + 40.0);
    vec2 hi = max(head, tail) + vec2(fish.x * 0.6 + 40.0);
    if (px.x < lo.x || px.y < lo.y || px.x > hi.x || px.y > hi.y) continue;
    float best = 1e6;
    float bestT = 0.0;
    float side = 0.0;
    float shade = 1e6;
    for (int j = 0; j < ${SPINE - 1}; j++) {
      vec2 a = bent[j];
      vec2 b = bent[j + 1];
      vec2 ab = b - a;
      float h = clamp(dot(px - a, ab) / dot(ab, ab), 0.0, 1.0);
      float t = (float(j) + h) / ${(SPINE - 1).toFixed(1)};
      float w = fish.y * bodyProfile(t);
      vec2 off = px - (a + ab * h);
      float dist = length(off) - w;
      if (dist < best) {
        best = dist;
        bestT = t;
        side = (ab.x * off.y - ab.y * off.x) / max(length(ab) * w, 1e-3);
      }
      float hs = clamp(dot(px - SHADOW - a, ab) / dot(ab, ab), 0.0, 1.0);
      shade = min(shade, length(px - SHADOW - (a + ab * hs)) - w - 4.0);
    }
    // The tail fin: two lobes fanning behind the last spine point, swaying with it.
    vec2 back = normalize(tail - bent[${SPINE - 2}]);
    vec2 rel = px - tail;
    float x = dot(rel, back);
    float y = back.x * rel.y - back.y * rel.x;
    float fan = x > 0.0 ? (fish.y * (0.35 + 1.3 * x / (0.32 * fish.x)) * (1.0 - smoothstep(0.18 * fish.x, 0.3 * fish.x, x)) - abs(y)) : -1e3;
    float fork = 0.32 * fish.x - x - 0.12 * fish.x * (1.0 - abs(y) / max(fish.y, 1.0));
    float tailFin = clamp(0.5 + min(fan, fork), 0.0, 1.0);
    // Pectoral fins, a third of the way down, spread or folded.
    vec2 root = bent[2];
    vec2 dir = normalize(bent[3] - bent[1]);
    vec2 normal = vec2(-dir.y, dir.x);
    float fins = 0.0;
    for (int s = -1; s <= 1; s += 2) {
      vec2 axis = normalize(normal * float(s) * (0.5 + 0.5 * fish.z) + dir * (1.2 - 0.6 * fish.z));
      vec2 r = px - (root + normal * float(s) * fish.y * 0.75);
      float along = dot(r, axis) / (0.55 * fish.y + 10.0);
      float across = (axis.x * r.y - axis.y * r.x) / (0.3 * fish.y + 4.0);
      fins = max(fins, clamp(0.5 + (1.0 - along * along - across * across) * 6.0, 0.0, 1.0) * step(0.0, along + 0.3));
    }
    float body = clamp(0.5 - best, 0.0, 1.0);
    float finCover = max(tailFin, fins) * (1.0 - body);
    shadow = max(shadow, 1.0 - smoothstep(-SHADOW_SOFT, SHADOW_SOFT, shade));
    // Patches fixed to the body: they bend and travel with it.
    float seed = fish.w;
    float spots = fbm(vec3(bestT * 5.0 + seed * 3.1, side * 1.4 + seed, seed * 1.7), NO_PERIOD, 3);
    float cap = (seed < 1.5 ? 1.0 : 0.0) * (1.0 - smoothstep(0.08, 0.16, bestT + 0.02 * side * side));
    float blotch = smoothstep(0.02, 0.08, spots + (seed > 2.5 ? -0.2 : 0.05)) * (1.0 - cap);
    float dark = seed > 2.5 ? smoothstep(0.18, 0.24, fbm(vec3(bestT * 7.0, side * 2.0, seed * 5.3), NO_PERIOD, 2)) : 0.0;
    float edgeIn = max(-best, 0.0);
    white = max(white, body);
    orange = max(orange, body * blotch * (seed == 0.0 ? 0.4 : 1.0) * edgeLoad(edgeIn, 0.7, RIM));
    red = max(red, body * (cap + (seed == 0.0 ? blotch : 0.15 * blotch)));
    ink = max(ink, body * dark + 0.25 * finCover * float(seed > 2.5));
    roundness = max(roundness, body * smoothstep(0.35, 1.0, abs(side)) + 0.35 * finCover);
    orange = max(orange, 0.35 * finCover * (0.6 + 0.4 * sin(40.0 * atan(y, x + 30.0))));
  }

  // The bottom shows through the water; the fish hide it; the pads float on top of everything.
  float under = 1.0 - above;
  glaze(1, waterLoad * 0.6 * deep * (1.0 - 0.7 * white) * under);
  glaze(0, waterLoad * (1.0 - 0.75 * white) * under * (1.0 - 0.32 * shimmer));
  glaze(1, 0.45 * shadow * (1.0 - white) * under);
  glaze(2, 1.0 * orange * under);
  glaze(3, 0.9 * red * under);
  glaze(4, 1.1 * ink * under);
  glaze(0, 0.25 * roundness * under);

  // Lily pads: green with a warm wet bloom, darker veins and a dried rim.
  glaze(5, pad.x * (0.75 + 0.35 * pad.z) * pad.w * (1.0 - lotus.x));
  glaze(2, pad.x * 0.25 * (1.0 - pad.z) * (1.0 - lotus.x));
  glaze(5, pad.y * 0.35 * (1.0 - lotus.x));
  // The lotus: a pink glaze, deeper at the tips, roundness a gold heart.
  float heart = 1.0 - smoothstep(0.08 * uLotus.z, 0.13 * uLotus.z, length(px - uLotus.xy));
  glaze(3, lotus.x * (0.12 + 0.3 * lotus.y) * (1.0 - heart));
  glaze(2, heart * 0.7);
  return finishPaint(px);
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    const random = createSeededRandom(props.seed + 7101);
    const lap = turnsEvery(props, LAP_SECONDS);
    // A koi that swims faster lengthens its stroke more than it quickens it: the beat follows the
    // square root of the speed.
    const beatPace = (Math.sqrt(props.speed) * props.durationSeconds) / BEAT_SECONDS;
    const beatTurns = wholeTurns(beatPace);
    const beat = {turns: beatTurns, reach: beatTurns > 0 ? Math.min(1, beatPace / beatTurns) : 1};
    const bob = turnsEvery(props, BOB_SECONDS);
    const elements: WebGLElement[] = [];
    LOOPS.forEach((loop, index) => {
      const length = randomBetween(random, 250, 310);
      const halfWidth = length * randomBetween(random, 0.105, 0.125);
      const start = random() * TAU;
      const beatOffset = random() * TAU;
      const head = loop.turn * lap.turns * phase + start;
      const average = Math.sqrt((loop.radiusX ** 2 + loop.radiusY ** 2) / 2);
      const step = length / (SPINE - 1) / average;
      for (let j = 0; j < SPINE; j++) {
        const at = loopAt(loop, head - loop.turn * j * step);
        elements.push({kind: 'spine', x: at.x, y: at.y, opacity: 1});
      }
      // The shader bends the body round its path: the beat goes there as its cosine and sine.
      const beatAngle = beat.turns * phase + beatOffset;
      elements.push({kind: 'beat', cos: Math.cos(beatAngle), sin: Math.sin(beatAngle), swing: 0.06 * length * beat.reach, opacity: 1});
      const spread = 0.5 + 0.5 * Math.sin(beat.turns * phase + beatOffset + 1.3) * beat.reach;
      elements.push({kind: 'fish', length, halfWidth, spread, pattern: index, opacity: 1});
    });
    for (let i = 0; i < PADS; i++) {
      const cluster = CLUSTERS[i % 2]!;
      const angle = random() * TAU;
      const distance = randomBetween(random, 0, 190);
      const radius = randomBetween(random, 42, 92);
      const sway = random() * TAU;
      const swing = bob.reach;
      elements.push({
        kind: 'pad',
        x: cluster.x + distance * Math.cos(angle) + 5 * swing * Math.cos(bob.turns * phase + sway),
        y: cluster.y + 0.7 * distance * Math.sin(angle) + 4 * swing * Math.sin(bob.turns * phase + sway),
        radius,
        notch: random() * TAU + 0.05 * swing * Math.sin(bob.turns * phase + sway),
        opacity: 1,
      });
    }
    const pad = elements.find((element) => element.kind === 'pad')!;
    const open = random() * TAU;
    elements.push({
      kind: 'lotus',
      x: (pad.x as number) + 0.35 * (pad.radius as number),
      y: (pad.y as number) - 0.2 * (pad.radius as number),
      radius: 52,
      turn: 0.2 + 0.05 * Math.sin(bob.turns * phase + open) * bob.reach,
      opacity: 1,
    });
    elements.push({...driftFlow(props, phase, SHIMMER.pace, SHIMMER.life, 7103), kind: 'shimmer'});
    elements.push(churnFlow(props, phase, 0.015, 7107));
    return elements;
  },
  uniforms: (scene) => ({
    uSpine: pack(scene, 'spine', ['x', 'y']),
    uFish: pack(scene, 'fish', ['length', 'halfWidth', 'spread', 'pattern']),
    uBeat: pack(scene, 'beat', ['cos', 'sin', 'swing']),
    uPads: pack(scene, 'pad', ['x', 'y', 'radius', 'notch']),
    uLotus: pack(scene, 'lotus', ['x', 'y', 'radius', 'turn']),
    uShimmer: pack(scene, 'shimmer', ['cos', 'sin', 'drift']),
    uChurn: pack(scene, 'churn', ['x', 'y', 'z']),
    // Water, deep water, koi orange, koi red, ink, pad green.
    uGranule: [0.35, 0.7, 0.2, 0.25, 0.5, 0.45],
  }),
};
