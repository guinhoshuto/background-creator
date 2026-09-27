import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {pack, parseColor, srgbToLinear, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/** The frame is 16:9; spot positions are frame heights, as in the other colour-mass scenes. */
const FRAME_WIDTH = 1920 / 1080;
/** At least this many spots, so a two-colour palette still makes a mesh rather than two halves. */
const MIN_SPOTS = 6;
/** The most spots any palette needs: five colours, twice each. */
const MAX_SPOTS = 10;
/**
 * Seconds of one full motion at speed 1. A cycle closes on whole turns of each; on cycles
 * shorter than one turn the spots and the breath swing less instead of hurrying, and the fast
 * phase of the warp sways instead of turning (see MIN_WARP_TURN).
 */
const DRIFT_SECONDS = 28;
export const MESH_WARP_SECONDS = 26;
const BREATH_SECONDS = 18;
/**
 * The least share of a turn at the warp's pace for which a cycle still turns the fast phase a
 * whole turn: at 0.75 the turn is 4/3 of the pace asked, as far off as the rounding of whole
 * turns ever gets. Below it the phase sways over the ground the pace covers.
 */
const MIN_WARP_TURN = 0.75;
/** Radians per second at speed 1 of the slow phase of the warp: it sways instead of turning. */
const SWAY_RATE = TAU / 80;
/** Widest sway of a phase either side of its rest, in radians; past it, a cycle holds more sways. */
const MAX_SWAY = 1.2;
/**
 * Twist of the rim in radians at distance 1 from the centre of the 0…1 frame; it grows with
 * smoothstep of that distance, so the corners, at 0.71, turn by about 0.79 of it. Scale does
 * not change it.
 */
const SWIRL = 1.4;
/**
 * The warp, shared by the shader and meshPoint: its reach in the middle of the frame, in frame
 * widths and heights, so the ripples of a wide frame are wide too; and its frequencies at
 * scale 1, in radians per frame width or height.
 */
const WARP = 0.4;
const WARP_ALONG_Y = 0.4;
const WARP_ACROSS_Y = 2.4;
const WARP_ALONG_X = 2.0;

/** Every palette colour the same number of times, and at least MIN_SPOTS spots. */
export const meshSpotCount = (paletteSize: number) => paletteSize * Math.ceil(MIN_SPOTS / paletteSize);

/** Linear sRGB to OKLab, where a blend between colours keeps its lightness and chroma. */
const linearToOklab = (r: number, g: number, b: number) => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
};

/**
 * Where the spots rest (frame heights) and which colour each one carries. They sit on two
 * rows across the frame, the lower one shifted half a cell to the right, so the rest layout is
 * a triangular lattice: a spot of the lower row touches the one above it and the one above to
 * the right. Colours go along the rows so that no two neighbours share one: in reading order
 * when the palette does not divide a row, shifted back by one per row when it does. Two
 * colours cannot avoid it across the rows of a triangular lattice. A seeded relabelling of the
 * palette changes which colour lands where.
 */
export const layoutMeshSpots = (seed: number, paletteSize: number) => {
  const count = meshSpotCount(paletteSize);
  const columns = count / 2;
  const random = createSeededRandom(seed + 601);
  const labels = Array.from({length: paletteSize}, (_, index) => index);
  for (let index = labels.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [labels[index], labels[other]] = [labels[other]!, labels[index]!];
  }
  const cell = FRAME_WIDTH / columns;
  return Array.from({length: count}, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const slot = columns % paletteSize === 0 ? (column - row + paletteSize) % paletteSize : index % paletteSize;
    return {
      color: labels[slot]!,
      x: (column + 0.25 + 0.5 * row + randomBetween(random, -0.18, 0.18)) * cell,
      y: 0.25 + 0.5 * row + randomBetween(random, -0.07, 0.07),
    };
  });
};

const smoothstep01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Where a point of the screen lands in the mesh, both in frame heights: the warp and the twist
 * of the shader's meshPoint, from the same constants. The spots go through it once per frame,
 * so each one shows its colour where it rests on screen and the warp bends only the blends.
 */
const meshPoint = (x: number, y: number, [fastCos, fastSin, slowCos, slowSin]: number[], swirl: number, scale: number) => {
  let vx = x / FRAME_WIDTH;
  let vy = y;
  const rim = smoothstep01(Math.hypot(vx - 0.5, vy - 0.5));
  const middle = 1 - rim;
  for (let pass = 1; pass <= 2; pass++) {
    const k = pass / scale;
    const reach = (WARP * middle) / pass;
    const along = k * WARP_ALONG_Y * vy;
    const across = k * WARP_ACROSS_Y * vy;
    vx += reach * (fastSin! * Math.cos(along) + fastCos! * Math.sin(along)) * (slowCos! * Math.cos(across) - slowSin! * Math.sin(across));
    const alongX = k * WARP_ALONG_X * vx;
    vy += reach * (fastCos! * Math.cos(alongX) - fastSin! * Math.sin(alongX));
  }
  const twist = -swirl * rim;
  const cx = vx - 0.5;
  const cy = vy - 0.5;
  return [
    (0.5 + Math.cos(twist) * cx - Math.sin(twist) * cy) * FRAME_WIDTH,
    0.5 + Math.sin(twist) * cx + Math.cos(twist) * cy,
  ];
};

/**
 * A mesh gradient, after the Mesh Gradient of Pixel Perfect's shader blocks: colour spots
 * wander the frame on slow closed loops and blend by inverse-distance weights, under an
 * organic warp strongest in the middle and a twist that grows towards the rim.
 */
export const mesh: WebGLExperiment = {
  glsl: /* glsl */ `
const int MAX_SPOTS = ${MAX_SPOTS};
// Per spot: where its screen position lands in the mesh (frame heights), and its colour in
// OKLab with the colour's alpha.
uniform vec2 uSpot[${MAX_SPOTS}];
uniform vec4 uSpotColor[${MAX_SPOTS}];
uniform int uSpotCount;
// Cosine and sine of the fast (xy) and the slow (zw) phase of the warp.
uniform vec4 uWarp;
// Twist of the rim in radians at distance 1 from the centre of the 0…1 frame (the corners get
// about 0.79 of it).
uniform float uSwirl;

const float WARP = ${WARP.toFixed(3)};
const float WARP_ALONG_Y = ${WARP_ALONG_Y.toFixed(3)};
const float WARP_ACROSS_Y = ${WARP_ACROSS_Y.toFixed(3)};
const float WARP_ALONG_X = ${WARP_ALONG_X.toFixed(3)};
// Weights fall with the distance to this power: higher gives each spot a firmer patch of its
// colour, lower melts the patches into one another.
const float POWER = 3.5;
// Radius around a spot where the weights level off, so its centre is a soft plateau rather
// than a point (frame heights). How far each colour reaches is set by POWER and the spacing
// of the spots, which always fill the frame.
const float CORE = 0.14;
// How much of the chroma that opposite hues cancel in a blend comes back, and the most a
// blend may be lifted where they nearly cancel out.
const float CHROMA_KEEP = 0.35;
const float MAX_CHROMA_GAIN = 2.5;
// A fine, still grain in OKLab lightness, like the original's additive grain: as visible on
// dark colours as on light ones, and it hides banding in the soft blends.
const float GRAIN = 0.015;

/** sin(a + x) and cos(a + x), from the cosine and sine of a: the phase never reaches the shader as an angle. */
float sinAfter(vec2 phase, float x) { return phase.y * cos(x) + phase.x * sin(x); }
float cosAfter(vec2 phase, float x) { return phase.x * cos(x) - phase.y * sin(x); }

vec3 oklabToLinear(vec3 c) {
  vec3 lms = vec3(
    c.x + 0.3963377774 * c.y + 0.2158037573 * c.z,
    c.x - 0.1055613458 * c.y - 0.0638541728 * c.z,
    c.x - 0.0894841775 * c.y - 1.2914855480 * c.z);
  lms = lms * lms * lms;
  return vec3(
    4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z);
}

bool inGamut(vec3 c) { return all(greaterThanEqual(c, vec3(-1e-4))) && all(lessThanEqual(c, vec3(1.0 + 1e-4))); }

/** The most chroma sRGB holds at this lightness along a hue (a unit direction in a and b). */
float gamutChroma(float lightness, vec2 hue) {
  float low = 0.0;
  float high = 0.5;
  for (int step = 0; step < 12; step++) {
    float mid = 0.5 * (low + high);
    if (inGamut(oklabToLinear(vec3(lightness, hue * mid)))) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * The smaller of x and a cap, rounded over a knee of width 1: a plain min() would leave a
 * crease along every contour where x reaches the cap.
 */
float softCap(float x, float cap) {
  float h = max(1.0 - abs(x - cap), 0.0);
  return min(x, cap) - 0.25 * h * h;
}

/**
 * The last guard against leaving the sRGB gamut, where the blend itself or the grain falls
 * outside it: clipping the channels would darken it into a rim along the edge of a patch, so
 * the chroma shrinks instead, at the same lightness and hue.
 */
vec3 oklabToGamut(vec3 c) {
  vec3 rgb = oklabToLinear(c);
  if (inGamut(rgb)) return rgb;
  float low = 0.0;
  float high = 1.0;
  for (int step = 0; step < 10; step++) {
    float mid = 0.5 * (low + high);
    if (inGamut(oklabToLinear(vec3(c.x, c.yz * mid)))) low = mid;
    else high = mid;
  }
  return clamp(oklabToLinear(vec3(c.x, c.yz * low)), 0.0, 1.0);
}

/**
 * Where a point of the frame (0…1 on both axes, so the warp and the twist follow its shape)
 * lands in the mesh, in frame heights. The scene sends the spots through the same map.
 */
vec2 meshPoint(vec2 v) {
  float rim = smoothstep(0.0, 1.0, length(v - 0.5));
  float middle = 1.0 - rim;
  // An organic warp, strongest in the middle: each pass sways the frame across the other axis.
  for (int pass = 1; pass <= 2; pass++) {
    float k = float(pass) / uScale;
    float reach = WARP * middle / float(pass);
    v.x += reach * sinAfter(uWarp.xy, k * WARP_ALONG_Y * v.y) * cosAfter(uWarp.zw, k * WARP_ACROSS_Y * v.y);
    v.y += reach * cosAfter(uWarp.xy, k * WARP_ALONG_X * v.x);
  }
  // The twist grows towards the rim, so the blends sweep round the edges of the frame.
  float twist = -uSwirl * rim;
  vec2 c = v - 0.5;
  v = 0.5 + vec2(cos(twist) * c.x - sin(twist) * c.y, sin(twist) * c.x + cos(twist) * c.y);
  return v * vec2(uResolution.x / uResolution.y, 1.0);
}

vec4 experiment(vec2 px) {
  float gain = uIntensity;
  vec2 u = meshPoint(px / uResolution);

  // Inverse-distance weights (Shepard): each colour is pure at its own spot and the blends
  // between them stay broad. A colour's alpha thins the paint where it rules.
  float core = CORE;
  vec3 lab = vec3(0.0);
  float chroma = 0.0;
  float alphaSum = 0.0;
  float weight = 0.0;
  for (int k = 0; k < MAX_SPOTS; k++) {
    if (k >= uSpotCount) break;
    vec2 d = (u - uSpot[k]) / core;
    float w = 1.0 / (pow(dot(d, d), 0.5 * POWER) + 1.0);
    vec4 spot = uSpotColor[k];
    lab += w * spot.a * spot.xyz;
    chroma += w * spot.a * length(spot.yz);
    alphaSum += w * spot.a;
    weight += w;
  }
  vec3 mixed = lab / max(alphaSum, 1e-6);
  mixed.x += GRAIN * (unit(hash(uint(px.x), uint(px.y), 7109u)) - 0.5);
  float base = length(mixed.yz);
  vec2 hue = mixed.yz / max(base, 1e-6);
  // Averaging opposite hues cancels part of their chroma into grey; about a third of what is
  // lost comes back (less where they nearly cancel), so the blends grey less. The mean chroma
  // of the colours that meet is never below the blend's own, so the lift is at least 1.
  float lift = (chroma / max(alphaSum, 1e-6)) / max(base, 1e-4);
  float boost = mix(1.0, softCap(lift, MAX_CHROMA_GAIN), CHROMA_KEEP);
  // Above 1 the intensity makes the colours more vivid; below 1 it thins the whole mesh.
  boost *= 1.0 + 0.4 * max(gain - 1.0, 0.0);
  // The extra chroma eases into the edge of the gamut instead of stopping there, which would
  // draw crisp creases where the blends reach the vivid corners of sRGB.
  float room = max(gamutChroma(mixed.x, hue) - base, 0.0);
  float extra = base * (boost - 1.0);
  mixed.yz = hue * (base + room * (1.0 - exp(-extra / max(room, 1e-5))));
  vec3 color = oklabToGamut(mixed);

  float cover = min(gain, 1.0) * alphaSum / weight;
  return vec4(color * cover, cover);
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
    const random = createSeededRandom(props.seed + 613);
    const spots = layoutMeshSpots(props.seed, props.colors.length).map((rest, index): WebGLElement => {
      // Alternate spots loop slower, and each turns its own way, so neighbours pass each other.
      const drift = motion(DRIFT_SECONDS * (index % 2 === 0 ? 1 : 1.4));
      const direction = random() < 0.5 ? 1 : -1;
      // A wide ellipse and a smaller loop turning back at twice the pace: a looping path
      // rather than a circle.
      const wide = randomBetween(random, 0.18, 0.26);
      const radiusX = wide * randomBetween(random, 1.2, 1.5);
      const radiusY = wide * randomBetween(random, 0.8, 1);
      const loop = randomBetween(random, 0.04, 0.07);
      const main = direction * drift.turns * phase + random() * TAU;
      const back = -2 * direction * drift.turns * phase + random() * TAU;
      return {
        kind: 'spot',
        x: rest.x + drift.reach * (radiusX * Math.cos(main) + loop * Math.cos(back)),
        y: rest.y + drift.reach * (radiusY * Math.sin(main) + loop * Math.sin(back)),
        color: rest.color,
        opacity: 1,
      };
    });
    // A phase that sways over `sweep` radians per cycle, the ground a turning phase would
    // cover, so it keeps its pace in any cycle: past MAX_SWAY a cycle holds more sways
    // instead of wider ones.
    const swaying = (sweep: number, offset: number) => {
      const sways = Math.max(1, Math.ceil(sweep / (4 * MAX_SWAY)));
      return (sweep / (4 * sways)) * Math.sin(sways * phase + offset);
    };
    // The fast phase of the warp turns whole turns when the cycle holds most of one at its
    // pace, and sways otherwise; the slow one always sways.
    const warpPace = travel / MESH_WARP_SECONDS;
    const fastDirection = random() < 0.5 ? 1 : -1;
    const fastStart = random() * TAU;
    const fast = fastStart + fastDirection * (warpPace < MIN_WARP_TURN ? swaying(warpPace * TAU, 0) : wholeTurns(warpPace) * phase);
    const slow = random() * TAU + swaying(props.speed * props.durationSeconds * SWAY_RATE, random() * TAU);
    const breath = motion(BREATH_SECONDS);
    const swell = breath.turns * phase + random() * TAU;
    return [
      ...spots,
      {kind: 'warp', fastCos: Math.cos(fast), fastSin: Math.sin(fast), slowCos: Math.cos(slow), slowSin: Math.sin(slow), opacity: 1},
      {kind: 'swirl', amount: SWIRL * (1 + 0.15 * breath.reach * Math.sin(swell)), opacity: 1},
    ];
  },
  uniforms: (scene, props) => {
    const palette = props.colors.map(parseColor).map(([r, g, b, a]) => [
      ...linearToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)), a,
    ]);
    const spots = scene.filter((element) => element.kind === 'spot');
    const warp = pack(scene, 'warp', ['fastCos', 'fastSin', 'slowCos', 'slowSin']);
    const swirl = pack(scene, 'swirl', ['amount']);
    const centres = pack(scene, 'spot', ['x', 'y']);
    const mapped = spots.flatMap((_, index) => meshPoint(centres[2 * index]!, centres[2 * index + 1]!, warp, swirl[0]!, props.scale));
    // The arrays hold MAX_SPOTS; the slots past uSpotCount are never read.
    const pad = (values: number[], components: number) => [...values, ...Array<number>(MAX_SPOTS * components - values.length).fill(0)];
    return {
      uSpot: pad(mapped, 2),
      uSpotColor: pad(pack(scene, 'spot', ['color']).flatMap((color) => palette[color]!), 4),
      uSpotCount: spots.length,
      uWarp: warp,
      uSwirl: swirl,
    };
  },
};
