import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {pack, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/**
 * The colour masses, in frame heights (the frame is 16/9 wide): where each one rests, how far
 * its colour reaches, how far it drifts and which colour of the palette ramp it takes. They
 * follow the reference: coral at the top left, gold over the left of the line, pink over its
 * right, lilac at the top right, deep magenta along the bottom right and violet at the bottom
 * left; six colours land one on each. The second and third lie along the line, so their y is
 * how far above it they centre. The last one fills the air under the left of the line with the
 * pink of the third colour, so that a dark background shows between the masses as dusk, not as
 * a hole.
 */
const MASSES = [
  {x: 0.1, y: -0.02, radius: 0.42, drift: 0.1, hue: 0},
  {x: 0.5, y: -0.05, radius: 0.26, drift: 0.07, hue: 0.2},
  {x: 1.34, y: -0.15, radius: 0.26, drift: 0.09, hue: 0.4},
  {x: 1.72, y: 0.0, radius: 0.45, drift: 0.1, hue: 0.6},
  {x: 1.5, y: 1.14, radius: 0.46, drift: 0.08, hue: 0.8},
  {x: 0.04, y: 1.14, radius: 0.36, drift: 0.1, hue: 1},
  {x: 0.66, y: 0.9, radius: 0.34, drift: 0.08, hue: 0.4},
] as const;

/** Lattice units per second at speed 1 that the churn of the colour masses travels. */
const FLOW_RATE = 0.05;
/** Keeps the churn's noise coordinates positive: the lattice hash needs whole numbers >= 0. */
const FLOW_BASE = 3;
/**
 * Seconds of one full motion at speed 1. A cycle closes on whole turns of each; on cycles
 * shorter than one turn the motion swings less instead of hurrying.
 */
const DRIFT_SECONDS = 26;
const BREATH_SECONDS = 12;
const LONG_WAVE_SECONDS = 22;
const SHORT_WAVE_SECONDS = 15;
const FOCUS_SECONDS = 30;
const SLIDE_SECONDS = 17;

/** Sunset through frosted glass: soft colour masses and one glowing line that undulates across them. */
export const haze: WebGLExperiment = {
  glsl: /* glsl */ `
// Where the churn of the masses samples its noise: x and z of a circle through the lattice.
uniform vec2 uFlow;
// Per colour mass: centre and reach (frame heights at scale 1).
uniform vec3 uMass[7];
// The path of the line (frame heights): its height at the steepest point, half the drop
// across the frame, the x of that point and how wide the sweep is.
uniform vec4 uLine;
// Wavelength and amplitude of the long and the short undulation (frame heights).
uniform vec4 uWaveShape;
// Cosine and sine of how far the long (xy) and the short (zw) undulation have travelled.
uniform vec4 uWaves;
// Where the line is sharpest (x, frame heights), the breath of its bloom, and the cosine and
// sine of how far the light sliding along it has travelled, times the depth of that light.
uniform vec4 uLight;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
// Where each mass sits on the palette ramp.
const float MASS_HUE[7] = float[7](${MASSES.map((mass) => mass.hue.toFixed(2)).join(', ')});
// Weight of the background colour in the mix: it shows where no mass reaches. Small enough
// that the masses meet with a short falloff, so a dark background reads as dusk between them.
const float BASE_WEIGHT = 0.35;
// How far the masses along the line stretch along it, and how far they reach above and below
// it (frame heights at scale 1).
const float ALONG_STRETCH = 2.6;
const float ALONG_UP = 0.14;
const float ALONG_DOWN = 0.08;
// Churn of the masses: frequency (per frame height at scale 1) and reach (frame heights).
const float WARP_FREQ = 1.1;
const float WARP = 0.1;
// Half widths of the bloom above and below the line (px at scale 1): the light spreads
// upwards like a lit veil and ends quickly below it, as at the edge of a fold.
const float BLOOM_ABOVE = 230.0;
const float BLOOM_BELOW = 85.0;
const float BLOOM = 0.6;
// A narrower, brighter glow hugging the line: its half width (px at scale 1) and cover.
const float HALO = 34.0;
const float HALO_COVER = 0.8;
// Width of the core of the line (px) where it is in focus and where it is most blurred.
const float CORE_SHARP = 2.2;
const float CORE_SOFT = 24.0;
// Wavelength of the light sliding along the line (frame heights at scale 1).
const float SLIDE_WAVELENGTH = 1.3;
// A faint static grain, like the frosted glass of the reference; it never moves.
const float GRAIN = 0.024;

vec2 perlin2(vec3 a, vec3 b) {
  vec3 points[2] = vec3[2](a, b);
  vec2 n;
  for (int i = 0; i < 2; i++) n[i] = perlin(points[i], NO_PERIOD);
  return n;
}

float sq(float x) { return x * x; }

// Soft roll-off above 0.8, so a bright core keeps its hue instead of clipping flat.
vec3 shoulder(vec3 c) {
  return mix(c, 1.0 - 0.2 * exp((0.8 - c) / 0.2), step(0.8, c));
}

/** The lightest colour of the palette lights the line. */
vec4 lightestColor() {
  vec4 best = paletteColor(0);
  float light = dot(best.rgb, LUMA);
  for (int i = 1; i < 6; i++) {
    if (i >= uPaletteSize) break;
    vec4 c = paletteColor(i);
    float l = dot(c.rgb, LUMA);
    if (l > light) {
      best = c;
      light = l;
    }
  }
  return best;
}

/** Height (frame heights, y down) and slope of the line at x. */
vec2 linePath(float x) {
  float s = uScale;
  float sweep = uLine.w * mix(1.0, s, 0.5);
  float th = tanh((x - uLine.z) / sweep);
  float y = uLine.x + uLine.y * th;
  float slope = uLine.y * (1.0 - th * th) / sweep;
  vec2 k = TAU / (uWaveShape.xz * s);
  vec2 a = uWaveShape.yw * s;
  vec2 sn = sin(k * x);
  vec2 cs = cos(k * x);
  // sin(kx - travel), with the travel given as its cosine and sine so it closes the loop.
  y += a.x * (sn.x * uWaves.x - cs.x * uWaves.y) + a.y * (sn.y * uWaves.z - cs.y * uWaves.w);
  slope += a.x * k.x * (cs.x * uWaves.x + sn.x * uWaves.y) + a.y * k.y * (cs.y * uWaves.z + sn.y * uWaves.w);
  return vec2(y, slope);
}

vec4 experiment(vec2 px) {
  float h = uResolution.y;
  float frameWidth = uResolution.x / h;
  vec2 u = px / h;
  float s = uScale;
  float gain = uIntensity;

  vec2 path = linePath(u.x);
  // Distance across the line in pixels, positive below it.
  float across = (u.y - path.x) * h / sqrt(1.0 + path.y * path.y);

  // The masses sit in a slowly churning domain, so they drift like clouds instead of discs.
  // The noise is sampled along a circle that leans into z: the churn both slides and evolves.
  vec2 w = u * (WARP_FREQ / s);
  vec3 flow = vec3(w.x + uFlow.x, w.y, uFlow.y);
  vec2 warp = perlin2(flow, flow + vec3(31.7, 17.3, 5.5));
  vec2 q = u + WARP * s * warp;
  vec3 sum = vec3(0.0);
  float alphaSum = 0.0;
  float weight = 0.0;
  for (int k = 0; k < 7; k++) {
    vec3 mass = uMass[k];
    // The masses grow less than the scale: at small scales they would leave most of the frame
    // to the background.
    float r = mass.z * (0.4 + 0.6 * s);
    vec2 d = q - mass.xy;
    if (k == 1 || k == 2) {
      // The second and third masses lie along the line instead of round, and reach further up
      // than down, like the lit side of a fold. They sway with the line.
      float v = across / h - mass.y * s + 0.3 * WARP * s * warp.y;
      d = vec2((q.x - mass.x) / ALONG_STRETCH, v * r / ((v < 0.0 ? ALONG_UP : ALONG_DOWN) * s));
    }
    vec4 c = paletteRamp(MASS_HUE[k]);
    // Inverse-distance weights (Shepard): each colour is pure at its own centre and the blends
    // between them stay broad, where Gaussians would fade every colour into the average.
    // A colour's alpha thins the paint where it rules, not the reach of its mass.
    float t = dot(d, d) / (r * r) + 0.04;
    float wk = 1.0 / (t * sqrt(t));
    sum += wk * c.a * c.rgb;
    alphaSum += wk * c.a;
    weight += wk;
  }
  // A mesh gradient with the background as one more colour: the layer covers the share of
  // the masses, so over backgroundColor it is the mix of all of them. The share rises
  // steeply, so the masses glow and the background holds the gaps between them. Below 1 the
  // intensity thins the whole wash evenly; above 1 it narrows the gaps.
  vec3 local = sum / max(alphaSum, 1e-6);
  float strength = sq(weight * max(gain, 1.0));
  float cover = min(gain, 1.0) * strength / (strength + BASE_WEIGHT * BASE_WEIGHT) * (alphaSum / weight);
  vec4 layer = vec4(local * cover, cover);

  // The line is in focus around one point and melts into a broad glow away from it, faster
  // towards the left, like a shallow depth of field.
  float fromFocus = (u.x - uLight.x) / (u.x < uLight.x ? 0.5 : 0.85);
  float focus = exp(-fromFocus * fromFocus);
  // Light slides along the line: a long travelling swell of brightness.
  float kSlide = TAU / (SLIDE_WAVELENGTH * s);
  float slide = cos(kSlide * u.x) * uLight.z + sin(kSlide * u.x) * uLight.w;

  float coreWidth = mix(CORE_SOFT * s, CORE_SHARP, focus);
  float core = exp(-0.5 * sq(across / coreWidth)) * mix(0.25, 0.7, focus) * (1.0 + 0.3 * slide);
  float bloomWidth = (across < 0.0 ? BLOOM_ABOVE : BLOOM_BELOW) * s * uLight.y;
  float b2 = sq(across / bloomWidth);
  // A long, smooth tail: the glow fills the air around the line rather than outlining it.
  float bloom = BLOOM / ((1.0 + b2) * sqrt(1.0 + b2));
  // A brighter glow hugs the line, a few tens of pixels wide.
  float halo = HALO_COVER * exp(-0.5 * sq(across / (HALO * s * uLight.y)));
  // The glow is strongest over the left of the line and thins out towards its right end.
  float along = 1.0 - smoothstep(0.3 * frameWidth, 0.95 * frameWidth, u.x);
  float bloomAlong = mix(0.4, 1.0, along) * (1.0 + 0.15 * slide);
  float haloAlong = mix(0.65, 1.0, along) * (1.0 + 0.15 * slide);

  vec4 glow = lightestColor();
  // Towards its right end the line takes the colour of the masses around it: in the reference
  // the gold turns pink there. Nearer the line the same colour grows brighter: a saturated
  // light, not white, though the core pales a little so the line still reads when the lightest
  // colour is also the colour of the wash around it.
  vec3 tint = mix(glow.rgb, local, 0.6 * smoothstep(0.45 * frameWidth, 0.95 * frameWidth, u.x));
  vec3 haloTint = shoulder(mix(tint, vec3(1.0), 0.06) * 1.12 + 0.01);
  vec3 coreTint = shoulder(mix(tint, vec3(1.0), 0.12) * 1.3 + 0.03);
  float coverage = gain * glow.a;
  float bloomCover = clamp(bloom * bloomAlong * coverage, 0.0, 1.0);
  float haloCover = clamp(halo * haloAlong * coverage, 0.0, 1.0);
  float coreCover = clamp(core * coverage, 0.0, 1.0);
  layer = vec4(tint * bloomCover, bloomCover) + layer * (1.0 - bloomCover);
  layer = vec4(haloTint * haloCover, haloCover) + layer * (1.0 - haloCover);
  layer = vec4(coreTint * coreCover, coreCover) + layer * (1.0 - coreCover);

  float grain = unit(hash(uint(px.x), uint(px.y), 6151u)) - 0.5;
  layer.rgb *= 1.0 + GRAIN * grain;
  return layer;
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    // Seconds of motion at speed 1 in one cycle.
    const travel = props.speed * props.durationSeconds;
    const motion = (seconds: number) => {
      const pace = travel / seconds;
      const turns = wholeTurns(pace);
      return {turns, reach: turns > 0 ? Math.min(1, pace / turns) : 1};
    };
    const random = createSeededRandom(props.seed + 811);
    const breath = motion(BREATH_SECONDS);
    const placeMass = (mass: (typeof MASSES)[number], index: number, draw: () => number): WebGLElement => {
      // Alternate masses drift on a slower loop, so they never move in step.
      const drift = motion(DRIFT_SECONDS * (index % 2 === 0 ? 1 : 1.5));
      const x = mass.x + randomBetween(draw, -0.06, 0.06);
      const y = mass.y + randomBetween(draw, -0.05, 0.05);
      const radius = mass.radius * randomBetween(draw, 0.9, 1.1);
      // Separate offsets on the two axes turn each circle into a tilted ellipse of its own.
      const driftX = drift.turns * phase + draw() * TAU;
      const driftY = drift.turns * phase + draw() * TAU;
      const swell = breath.turns * phase + draw() * TAU;
      return {
        kind: 'mass',
        x: x + mass.drift * drift.reach * Math.cos(driftX),
        y: y + 0.7 * mass.drift * drift.reach * Math.sin(driftY),
        radius: radius * (1 + 0.07 * breath.reach * Math.cos(swell)),
        opacity: 1,
      };
    };
    // The mass under the line draws from its own sequence, so the others keep their layout.
    const underRandom = createSeededRandom(props.seed + 823);
    const masses = MASSES.map((mass, index) => placeMass(mass, index, index < 6 ? random : underRandom));
    const line: WebGLElement = {
      kind: 'line',
      middle: randomBetween(random, 0.55, 0.6),
      drop: randomBetween(random, 0.2, 0.24),
      steepest: randomBetween(random, 0.85, 1.05),
      sweep: randomBetween(random, 0.9, 1.1),
      opacity: 1,
    };
    const long = motion(LONG_WAVE_SECONDS);
    const short = motion(SHORT_WAVE_SECONDS);
    // The two undulations travel in opposite directions, so the line sways instead of scrolling.
    const longAngle = long.turns * phase + random() * TAU;
    const shortAngle = -short.turns * phase + random() * TAU;
    const waves: WebGLElement = {
      kind: 'wave',
      longLength: randomBetween(random, 1.5, 1.9),
      longAmplitude: 0.034 * long.reach * randomBetween(random, 0.85, 1.15),
      shortLength: randomBetween(random, 0.8, 1),
      shortAmplitude: 0.013 * short.reach * randomBetween(random, 0.85, 1.15),
      longCos: Math.cos(longAngle),
      longSin: Math.sin(longAngle),
      shortCos: Math.cos(shortAngle),
      shortSin: Math.sin(shortAngle),
      opacity: 1,
    };
    const focus = motion(FOCUS_SECONDS);
    const slide = motion(SLIDE_SECONDS);
    const focusAngle = focus.turns * phase + random() * TAU;
    const slideAngle = slide.turns * phase + random() * TAU;
    const bloomAngle = breath.turns * phase + random() * TAU;
    const light: WebGLElement = {
      kind: 'light',
      focus: randomBetween(random, 0.95, 1.15) + 0.2 * focus.reach * Math.sin(focusAngle),
      bloom: 1 + 0.1 * breath.reach * Math.cos(bloomAngle),
      // The depth of the sliding light shrinks with the reach, like the other motions.
      slideCos: slide.reach * Math.cos(slideAngle),
      slideSin: slide.reach * Math.sin(slideAngle),
      opacity: 1,
    };
    // The churn goes once round a circle through the noise per cycle, as long as the ground it
    // covers at FLOW_RATE: its pace stays exact whatever the duration, and speed 0 stops it.
    const flowRadius = (FLOW_RATE * travel) / TAU;
    const flowAngle = phase + createSeededRandom(props.seed + 809)() * TAU;
    const flow: WebGLElement = {
      kind: 'flow',
      x: FLOW_BASE + flowRadius * (1 + Math.cos(flowAngle)),
      z: FLOW_BASE + flowRadius * (1 + Math.sin(flowAngle)),
      opacity: 1,
    };
    return [flow, ...masses, line, waves, light];
  },
  uniforms: (scene) => ({
    uFlow: pack(scene, 'flow', ['x', 'z']),
    uMass: pack(scene, 'mass', ['x', 'y', 'radius']),
    uLine: pack(scene, 'line', ['middle', 'drop', 'steepest', 'sweep']),
    uWaveShape: pack(scene, 'wave', ['longLength', 'longAmplitude', 'shortLength', 'shortAmplitude']),
    uWaves: pack(scene, 'wave', ['longCos', 'longSin', 'shortCos', 'shortSin']),
    uLight: pack(scene, 'light', ['focus', 'bloom', 'slideCos', 'slideSin']),
  }),
};
