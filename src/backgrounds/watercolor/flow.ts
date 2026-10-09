import {loopPhase} from '../../loop';
import {pack, type WebGLElement} from '../webgl/scene';
import {churnFlow, driftFlow, PAINT_GLSL, type WatercolorScene} from './paint';

/** How far the current carries the pigment at speed 1 (px per second along a unit current) and how long each pattern lives (s). */
const CURRENT = {pace: 24, life: 9};
/** Lattice units per second the wet and dry zones churn at. */
const CHURN_RATE = 0.012;

/**
 * Wet-on-wet: pools of pigment that a slow current carries round the frame, bleeding into one
 * another where they meet and mixing like real pigment (blue into yellow turns green), with
 * feathered wet fronts, dark tide lines where the paint dried, pale blooms with frilled edges and
 * granulation in the tooth of the paper. The middle stays lighter for the content.
 */
export const flow: WatercolorScene = {
  glsl: /* glsl */ `
${PAINT_GLSL}
// The current: cosine and sine of the life of its patterns, and how far a unit current carries them in one life (px).
uniform vec3 uCurrent;
// Where the slow churn of the wet and dry zones samples its noise.
uniform vec3 uChurn;

// Lattice of the eddies of the current, of the pools, of the pigments inside them, of the
// feathered fingers of a wet front and of the blooms (px).
const float EDDY = 640.0;
const float POOL = 600.0;
const float HUE = 620.0;
const float MOTTLE = 150.0;
const float FINGER = 26.0;
const float BLOOM = 340.0;
// How many palette colours the pools carry, where each one is laid (px, a corner each, so
// neighbours in the palette meet along the sides) and how sharply one takes over from the next.
const int PIGMENTS = 4;
const vec2 HOMES[4] = vec2[4](vec2(160.0, 140.0), vec2(1770.0, 160.0), vec2(1740.0, 940.0), vec2(190.0, 930.0));
const float REACH = 640.0;
const float TAKEOVER = 7.0;
// Drops charged into the wet pools: grid cell (px), share of cells that hold one, radius (px).
const float DROP_CELL = 150.0;
const float DROP_SHARE = 0.4;
const vec2 DROP_RADIUS = vec2(30.0, 48.0);
// Width of a wet front (px), of the rim a dried edge pools into (px), and of a tide line (px).
const float WET_FRONT = 40.0;
const float RIM = 3.2;
const float TIDE = 1.4;

/** The current at p (about px per px of the drift): a slow whirl round the middle plus eddies. */
vec2 currentAt(vec2 p) {
  vec2 c = p - vec2(960.0, 540.0);
  vec2 whirl = vec2(-c.y, c.x) / 760.0;
  vec2 q = p / EDDY + 3.0;
  float e = 0.01;
  float n0 = perlin(vec3(q, 1.7), NO_PERIOD);
  float nx = perlin(vec3(q + vec2(e, 0.0), 1.7), NO_PERIOD);
  float ny = perlin(vec3(q + vec2(0.0, e), 1.7), NO_PERIOD);
  // The curl of a potential: it never piles the paint up nor drains it away.
  vec2 eddy = vec2(ny - n0, n0 - nx) / e;
  return whirl + 0.55 * eddy;
}

/** What the current carries, at q in one copy of the drifting pattern: streaks, hues, fingers. */
float mottleAt(vec2 q) { return fbm(vec3(q / MOTTLE, 4.4), NO_PERIOD, 4); }
float hueAt(vec2 q, int k) { return fbm(vec3(q / HUE + vec2(13.0 * float(k), 7.0 * float(k)), 2.0 + float(k)), NO_PERIOD, 3); }
vec2 fingerAt(vec2 q) {
  float a = perlin(vec3(q / FINGER, 8.3), NO_PERIOD);
  float b = perlin(vec3(TURN_A * q / (0.47 * FINGER), 9.1), NO_PERIOD);
  return vec2(0.65 * a + 0.35 * b, 0.6 * softAbs(a) + 0.4 * softAbs(b));
}

/**
 * Drops of pigment charged into the wet wash, at q in one copy of the drifting pattern: soft
 * darker spots with no rim, a little ragged, spaced about one and a half times their width.
 */
float dropsAt(vec2 q, float ragged) {
  vec2 cell = floor(q / DROP_CELL);
  float found = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 c = cell + vec2(float(i), float(j));
      uint h = hash(uint(int(c.x) + 4096), uint(int(c.y) + 4096), 6151u);
      if (unit(h) > DROP_SHARE) continue;
      vec2 centre = (c + 0.2 + 0.6 * vec2(unit(pcg(h ^ 0x68E31DA4u)), unit(pcg(h ^ 0xB5297A4Du)))) * DROP_CELL;
      float radius = mix(DROP_RADIUS.x, DROP_RADIUS.y, unit(pcg(h ^ 0x1B56C4E9u)));
      float r = length(q - centre) / radius * (1.0 + 0.22 * ragged);
      found = max(found, exp(-2.2 * r * r));
    }
  }
  return found;
}

vec4 experiment(vec2 px) {
  beginPaint(px);

  // The two copies of the drifting pattern, half a life apart; each fades before it jumps back.
  float skew = 0.5 + 0.5 * perlin(vec3(px / 1300.0, 0.9), NO_PERIOD);
  float life = lifeOf(uCurrent.xy, skew);
  float other = fract(life + 0.5);
  float wa = sq(sin(PI * life));
  float wb = 1.0 - wa;
  float norm = 1.0 / sqrt(wa * wa + wb * wb);
  vec2 v = currentAt(px) * uCurrent.z;
  vec2 qa = px - v * (life - 0.5);
  vec2 qb = px - v * (other - 0.5) + vec2(523.0, 287.0);

  // Where the paper is painted: pools that favour the edges of the frame and leave the middle light.
  vec2 centre = (px - vec2(960.0, 540.0)) / vec2(960.0, 540.0);
  float rim = pow(pow(abs(centre.x), 3.0) + pow(abs(centre.y), 3.0), 1.0 / 3.0);
  float bias = 0.45 * smoothstep(0.25, 1.05, rim) - 0.07 - 0.35 * uLook.z * plateWeight(px);
  // The pools themselves stay where they were laid, only churning slowly: the content area keeps
  // its shape while the pigment streams through them.
  float pool = 0.85 * fbm(vec3(px / POOL, 0.6) + 0.4 * uChurn, NO_PERIOD, 3) + bias;
  vec2 finger = norm * (wa * fingerAt(qa) + wb * fingerAt(qb));
  float d = fieldDistance(pool);

  // Some fronts are still wet and feather out; others dried hard into a dark rim. Every screen
  // derivative is taken here, before any pixel branches off.
  float dryness = perlin(vec3(px / 700.0, 0.0) + uChurn, NO_PERIOD);
  float hard = smoothstep(-0.25, 0.25, dryness);
  float cover = washCover(d + 10.0 * (finger.y - 0.45) * (1.0 - hard), hard, WET_FRONT, finger.x);
  float tideA = fieldDistance(pool - 0.14);
  float tideB = fieldDistance(pool - 0.28);
  float b = fbm(vec3(px / BLOOM, 11.7) + 0.4 * uChurn, NO_PERIOD, 3);
  float petals = fieldDistance(b - 0.36 + 0.14 * (finger.y - 0.45));
  if (cover <= 0.0) return finishPaint(px);

  // The pattern the current carries: the pigment is denser in some streaks than others, and
  // drops charged into the wet wash drift along with it.
  float mottle = norm * (wa * mottleAt(qa) + wb * mottleAt(qb));
  float drops = norm * (wa * dropsAt(qa, finger.x) + wb * dropsAt(qb, finger.x));
  float load = (0.4 + 0.45 * smoothstep(0.0, 0.45, pool)) * (0.82 + 0.55 * mottle) * (1.0 + 0.38 * drops)
    * edgeLoad(d, hard, RIM);

  // Tide lines: earlier fronts that dried inside the pool, faint and broken.
  float trace = smoothstep(-0.1, 0.3, dryness + 0.25 * finger.x);
  load *= 1.0 + 0.22 * trace * (exp(-abs(tideA) / TIDE) + exp(-abs(tideB) / TIDE));

  // Blooms: water pushed into a drying wash, a pale core with a dark frilled edge.
  float inBloom = clamp(0.5 + petals, 0.0, 1.0) * smoothstep(0.08, 0.3, pool);
  float frill = exp(-max(petals, 0.0) / (1.3 * RIM)) * inBloom;
  load *= 1.0 - 0.35 * inBloom + 0.9 * frill;

  // Each pigment takes over where its own field is highest, bleeding into its neighbours.
  float shares[PIGMENTS];
  float total = 0.0;
  for (int k = 0; k < PIGMENTS; k++) {
    float h = norm * (wa * hueAt(qa, k) + wb * hueAt(qb, k));
    float home = length(px - HOMES[k]) / REACH;
    shares[k] = exp(TAKEOVER * (0.55 * h - home));
    total += shares[k];
  }
  for (int k = 0; k < PIGMENTS; k++) glaze(k, cover * load * shares[k] / total);
  return finishPaint(px);
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    return [
      {...driftFlow(props, phase, CURRENT.pace, CURRENT.life, 6101), kind: 'current'},
      churnFlow(props, phase, CHURN_RATE, 6103),
    ];
  },
  uniforms: (scene) => ({
    uCurrent: pack(scene, 'current', ['cos', 'sin', 'drift']),
    uChurn: pack(scene, 'churn', ['x', 'y', 'z']),
    // Violet and lilac (ultramarine in them) granulate; the rose and the magenta stay smooth.
    uGranule: [0.85, 0.2, 0.35, 0.6, 0.4, 0.4],
  }),
};
