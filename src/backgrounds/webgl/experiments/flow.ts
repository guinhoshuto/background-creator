import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {getNoiseFlow, pack, parseColor, srgbToLinear, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/** Seconds the long swell takes to roll one of its wavelengths along the ribbon at speed 1. */
const SWELL_SECONDS = 16;

/**
 * The ripples that roll along the ribbon, from the long swell to the short one: wavelength and
 * amplitude (frame heights) and wavelengths rolled per SWELL_SECONDS. The last one rolls back
 * against the others, so the wave changes shape as it goes instead of only sliding.
 */
const RIPPLES = [
  {length: 1.9, amplitude: 0.014, pace: 1},
  {length: 0.85, amplitude: 0.007, pace: 2},
  {length: 1.2, amplitude: 0.005, pace: -1},
] as const;

/** How light a background is, from its relative luminance: 0 for a night base, 1 for a pastel one. */
const baseLight = (color: string) => {
  const [r, g, b] = parseColor(color).map(srgbToLinear);
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const t = Math.min(1, Math.max(0, (luminance - 0.03) / 0.3));
  return t * t * (3 - 2 * t);
};

/**
 * A pastel wave: a thick, glossy ribbon sweeps in from the left, dips and curls up towards the
 * upper right, with a luminous rim along its crest and a hazy second wave in its shadow, over
 * a warm glow on the left and a cool wash on the right. Ripples roll along it, the light glides
 * along the crest and the washes breathe.
 */
export const flow: WebGLExperiment = {
  glsl: /* glsl */ `
// Noise axis of the haze: position and whole period.
uniform vec2 uFlow;
// The crest (frame heights, y down): resting height, depth, centre and width of its dip.
uniform vec4 uCrest;
// Its rise to the upper right: slope, where it starts, how softly it bends; and the colour drift.
uniform vec4 uRise;
// The lower edge: resting height, half the drop of its descent, centre and width of the descent.
uniform vec4 uBelly;
// The hump of the lower edge: height, centre, width; and how far the second wave reaches below it.
uniform vec4 uHump;
// Per ripple: cosine and sine of how far it has rolled, amplitude and wavenumber.
uniform vec4 uRipples[3];
// Key light (unit; y down, z towards the viewer) and gloss strength.
uniform vec4 uLight;
// The light gliding along the crest: cosine and sine of its travel, depth and wavenumber.
uniform vec4 uSheen;
// Warm glow and cool wash: centre and radii, in frame heights from the centre of the frame.
uniform vec4 uGlow;
uniform vec4 uWash;
// How far the whole wave sways sideways (frame heights), so its dip travels without flattening.
uniform float uShift;
// How light backgroundColor is, 0 (night) to 1 (pastel): the washes are light in the air, so
// over a dark base they stay dim hazes instead of flooding the night.
uniform float uBaseLight;

vec4 flowOver(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

float softplus(float z) { return max(z, 0.0) + log(1.0 + exp(-abs(z))); }

/** The rolling ripples at x and their slope; lag shifts each one, for the lower edge. */
vec2 flowRipples(float x, float lag) {
  vec2 sum = vec2(0.0);
  for (int i = 0; i < 3; i++) {
    vec4 r = uRipples[i];
    float a = r.w * x + lag * float(i + 1);
    float s = sin(a);
    float c = cos(a);
    // sin(a - travel) and its derivative, from the cosine and sine of the travel.
    sum += r.z * vec2(s * r.x - c * r.y, r.w * (c * r.x + s * r.y));
  }
  return sum;
}

/** Height and slope of the crest, the upper edge of the ribbon. */
vec2 flowCrest(float x) {
  float u = (x - uCrest.z) / uCrest.w;
  float dip = uCrest.y * exp(-u * u);
  float z = (x - uRise.y) / uRise.z;
  vec2 ripple = flowRipples(x, 0.0);
  return vec2(
    uCrest.x + dip - uRise.x * uRise.z * softplus(z) + ripple.x,
    -2.0 * u / uCrest.w * dip - uRise.x / (1.0 + exp(-z)) + ripple.y);
}

/**
 * Height and slope of the lower edge: a hump on the left, then a long descent, kept at least
 * MIN_THICK below the crest by a smooth maximum, so the ribbon never pinches. The slope of a
 * polynomial smooth maximum is exactly the same blend of the two slopes.
 */
const float MIN_THICK = 0.14;
vec2 flowBelly(float x, vec2 crest) {
  float t = tanh(clamp((x - uBelly.z) / uBelly.w, -8.0, 8.0));
  float u = (x - uHump.y) / uHump.z;
  float hump = uHump.x * exp(-u * u);
  vec2 ripple = flowRipples(x, 0.3) * 0.9;
  vec2 edge = vec2(
    uBelly.x + uBelly.y * t - hump + ripple.x,
    uBelly.y * (1.0 - t * t) / uBelly.w + 2.0 * u / uHump.z * hump + ripple.y);
  vec2 floorEdge = crest + vec2(MIN_THICK, 0.0);
  float k = 0.12;
  float h = clamp(0.5 + 0.5 * (edge.x - floorEdge.x) / k, 0.0, 1.0);
  return vec2(mix(floorEdge.x, edge.x, h) + k * h * (1.0 - h), mix(floorEdge.y, edge.y, h));
}

vec4 experiment(vec2 px) {
  float h = uResolution.y;
  vec2 q = (px - 0.5 * uResolution) / h;
  vec2 p = q / uScale;
  // One pixel, in the units of p.
  float e = 1.0 / (h * uScale);
  float xn = clamp(px.x / uResolution.x, 0.0, 1.0);
  float strength = min(uIntensity, 1.0);
  float boost = 1.0 + 0.5 * max(uIntensity - 1.0, 0.0);
  vec4 last = paletteColor(uPaletteSize - 1);

  // One slow noise field bends the washes, so they read as out-of-focus light, not ellipses.
  float haze = perlin(vec3(q * 1.4 + 3.1, uFlow.x), uFlow.y);

  float air = mix(0.12, 1.0, uBaseLight) * boost;
  vec2 dw = (q - uWash.xy) / uWash.zw;
  float washA = clamp(0.75 * air * exp(-dot(dw, dw) + 0.25 * haze), 0.0, 1.0) * last.a;
  vec4 layer = vec4(last.rgb, 1.0) * washA;

  // The warm glow: the first colour (whiter in its core over a light base), blending straight
  // into the middle colour at its fringe, never through the ones between, which would draw rings.
  vec2 dg = (q - uGlow.xy) / uGlow.zw;
  float r2 = max(dot(dg, dg) + 0.3 * haze, 0.0);
  vec4 warm = mix(paletteColor(0), paletteRamp(0.5), smoothstep(0.2, 1.6, r2));
  vec3 warmRgb = mix(warm.rgb, vec3(1.0), 0.25 * uBaseLight * exp(-3.0 * r2));
  float warmA = clamp(0.9 * air * exp(-r2), 0.0, 1.0) * warm.a;
  layer = flowOver(vec4(warmRgb, 1.0) * warmA, layer);

  vec2 crest = flowCrest(p.x - uShift);
  vec2 belly = flowBelly(p.x - uShift, crest);
  // Distances to both edges across the ribbon, positive inside it.
  float dTop = (p.y - crest.x) * inversesqrt(1.0 + crest.y * crest.y);
  float dBot = (belly.x - p.y) * inversesqrt(1.0 + belly.y * belly.y);
  float thick = max(dTop + dBot, 0.02);
  float v = clamp(dTop / thick, 0.0, 1.0);

  // The second wave: a broad hazy band under the ribbon, deep in its shadow, lighter further down.
  // Its top hides under the ribbon; its floor dissolves into the washes.
  float below = max(-dBot, 0.0);
  vec4 deep = paletteRamp(0.8 + 0.2 * xn);
  vec3 shadowRgb = mix(deep.rgb, last.rgb, 0.6) * 0.74;
  vec3 lit = mix(deep.rgb, vec3(1.0), (0.05 + 0.2 * uBaseLight) * (1.0 + 0.8 * haze));
  vec3 lowerRgb = mix(shadowRgb, lit, smoothstep(0.0, 0.16, below));
  float floorDist = belly.x + uHump.w + 0.6 * flowRipples(p.x, 1.9).x - p.y;
  float lowerA = mix(0.45, 0.82, uBaseLight) * (1.0 - smoothstep(0.0, 0.08, dBot)) * smoothstep(-0.14, 0.1, floorDist) * deep.a;
  layer = flowOver(vec4(lowerRgb, 1.0) * lowerA, layer);

  // The ribbon: its colour runs from the first colours on the left to the last ones on the
  // right and deepens from the crest down; the underside cools towards the next colours
  // instead of darkening into brown.
  float underside = smoothstep(0.55, 1.0, v);
  vec4 tint = paletteRamp(0.18 + 0.42 * xn + (0.05 + 0.33 * xn) * v + 0.18 * underside + uRise.w);
  vec3 rimTint = mix(mix(paletteColor(0).rgb, vec3(1.0), 0.35), mix(tint.rgb, vec3(1.0), 0.6), 0.6 * xn);

  // Light scattered just past the crest, so the rim glows into the air above it.
  float halo = 0.45 * exp(min(dTop, 0.0) / 0.03) * (1.0 - smoothstep(0.0, 0.04, dTop)) * tint.a;
  layer = flowOver(vec4(rimTint, 1.0) * clamp(halo * boost, 0.0, 1.0), layer);

  // A thick rounded ribbon: flat in the middle, rolling over at both edges. Its normal turns
  // from the crest's (up) to the lower edge's, both known in closed form.
  vec2 upTop = normalize(vec2(crest.y, -1.0));
  vec2 upBot = normalize(vec2(belly.y, -1.0));
  vec2 up = normalize(mix(upTop, upBot, v));
  float w = 1.0 - 2.0 * v;
  float tilt = w * w * w;
  vec3 n = vec3(up * tilt, sqrt(max(1.0 - tilt * tilt, 0.0)));
  vec3 l = uLight.xyz;
  vec3 hv = normalize(l + vec3(0.0, 0.0, 1.0));
  // Soft studio light: faces turned away stay pastel instead of going dark.
  float diffuse = clamp((dot(n, l) + 0.4) / 1.4, 0.0, 1.0);
  float gloss = pow(max(dot(n, hv), 0.0), 28.0);

  // cos(k x - travel): a brighter stretch of crest that glides along the ribbon.
  float glide = 1.0 - uSheen.z * (0.5 - 0.5 * (cos(uSheen.w * p.x) * uSheen.x + sin(uSheen.w * p.x) * uSheen.y));
  float rim = exp(-max(dTop, 0.0) / (0.14 * thick + 4.0 * e)) * glide;

  // Where the wave rises its upper face turns up to the light: a broad lit face below the rim.
  float face = smoothstep(0.2, 1.4, -crest.y) * exp(-v / 0.4);

  vec3 color = tint.rgb * (0.7 + 0.4 * diffuse);
  color = mix(color, rimTint, clamp((0.85 * rim + 0.6 * face) * boost, 0.0, 1.0));
  color += mix(rimTint, vec3(1.0), 0.5) * gloss * uLight.w * glide * boost;
  // The underside curls away from the light, down into the second wave.
  color = min(color * mix(1.0, 0.88, underside), vec3(1.0));
  // A crisp crest, a soft lower edge.
  float soft = 0.006 + 0.02 * thick;
  float cover = smoothstep(-1.2 * e, 1.2 * e, dTop) * smoothstep(-soft, soft, dBot) * tint.a;
  layer = flowOver(vec4(color, 1.0) * cover, layer);

  layer *= strength;
  // A faint static grain, like the print of the reference, never changing between frames.
  float grain = unit(hash(uint(px.x), uint(px.y), 7717u)) - 0.5;
  layer.rgb *= 1.0 + 0.03 * grain;
  return layer;
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    const flow = getNoiseFlow(props, phase / TAU, 0.05, 613);
    const pace = (props.speed * props.durationSeconds) / SWELL_SECONDS;
    /**
     * A closed motion of `ratio` turns per SWELL_SECONDS: whole turns per cycle, and a reach
     * that shrinks on cycles too short for the pace, so a short loop swings less instead of
     * hurrying.
     */
    const motion = (ratio: number) => {
      const wanted = pace * Math.abs(ratio);
      const turns = wholeTurns(wanted);
      return {turns: Math.sign(ratio) * turns, reach: turns > 0 ? Math.min(1, wanted / turns) : 1};
    };
    const random = createSeededRandom(props.seed + 601);
    const between = (min: number, max: number) => randomBetween(random, min, max);

    const crest = {rest: between(-0.085, -0.045), dip: between(0.12, 0.17), at: between(-0.24, -0.04), width: between(0.3, 0.42)};
    const rise = {slope: between(1.1, 1.4), at: between(0.32, 0.46), soft: between(0.17, 0.23)};
    // The lower edge descends from its level on the left to its level on the right.
    const [left, right] = [between(0.14, 0.16), between(0.32, 0.35)];
    const belly = {rest: (left + right) / 2, drop: (right - left) / 2, at: between(-0.2, -0.1), width: between(0.34, 0.42)};
    const hump = {height: between(0.015, 0.04), at: between(-0.72, -0.45), width: between(0.18, 0.26), reach: between(0.28, 0.34)};

    const breath = motion(1);
    const [dipOffset, hueOffset, lightOffset, glowOffset, sizeOffset, washOffset, shiftOffset] = Array.from({length: 7}, () => random() * TAU);
    const ripples = RIPPLES.map((ripple) => {
      const {turns, reach} = motion(ripple.pace);
      const angle = turns * phase + random() * TAU;
      return {
        kind: 'ripple', cos: Math.cos(angle), sin: Math.sin(angle),
        amplitude: ripple.amplitude * reach, wavenumber: TAU / ripple.length, opacity: 1,
      };
    });
    const sheen = motion(1);
    const sheenAngle = sheen.turns * phase + random() * TAU;
    const swing = breath.turns * phase;
    const glowSize = 1 + 0.06 * breath.reach * Math.sin(swing + sizeOffset);
    const azimuth = -1.95 + 0.3 * breath.reach * Math.sin(swing + lightOffset);
    const elevation = 0.65;

    return [
      {kind: 'flow', position: flow.position, period: flow.period, opacity: 1},
      {
        kind: 'crest', rest: crest.rest, at: crest.at, width: crest.width,
        dip: crest.dip * (1 + 0.08 * breath.reach * Math.sin(swing + dipOffset)), opacity: 1,
      },
      {
        kind: 'rise', slope: rise.slope, at: rise.at, soft: rise.soft,
        hue: 0.035 * breath.reach * Math.sin(swing + hueOffset), opacity: 1,
      },
      {kind: 'sway', shift: 0.045 * breath.reach * Math.sin(swing + shiftOffset), opacity: 1},
      {kind: 'belly', rest: belly.rest, drop: belly.drop, at: belly.at, width: belly.width, opacity: 1},
      {kind: 'hump', height: hump.height, at: hump.at, width: hump.width, reach: hump.reach, opacity: 1},
      ...ripples,
      {
        kind: 'light',
        x: Math.cos(elevation) * Math.cos(azimuth),
        y: Math.cos(elevation) * Math.sin(azimuth),
        z: Math.sin(elevation),
        gloss: 0.3,
        opacity: 1,
      },
      {kind: 'sheen', cos: Math.cos(sheenAngle), sin: Math.sin(sheenAngle), depth: 0.35 * sheen.reach, wavenumber: TAU / 1.3, opacity: 1},
      {
        kind: 'glow',
        x: -0.85 + 0.04 * breath.reach * Math.cos(swing + glowOffset),
        y: -0.08 + 0.02 * breath.reach * Math.sin(swing + glowOffset),
        spanX: glowSize,
        spanY: 0.42 * glowSize,
        opacity: 1,
      },
      {
        kind: 'wash',
        x: 0.85 + 0.04 * breath.reach * Math.sin(swing + washOffset),
        y: -0.3 + 0.03 * breath.reach * Math.cos(swing + washOffset),
        spanX: 0.8, spanY: 0.75,
        opacity: 1,
      },
    ];
  },
  uniforms: (scene, props) => ({
    uFlow: pack(scene, 'flow', ['position', 'period']),
    uCrest: pack(scene, 'crest', ['rest', 'dip', 'at', 'width']),
    uRise: pack(scene, 'rise', ['slope', 'at', 'soft', 'hue']),
    uBelly: pack(scene, 'belly', ['rest', 'drop', 'at', 'width']),
    uHump: pack(scene, 'hump', ['height', 'at', 'width', 'reach']),
    uRipples: pack(scene, 'ripple', ['cos', 'sin', 'amplitude', 'wavenumber']),
    uLight: pack(scene, 'light', ['x', 'y', 'z', 'gloss']),
    uSheen: pack(scene, 'sheen', ['cos', 'sin', 'depth', 'wavenumber']),
    uGlow: pack(scene, 'glow', ['x', 'y', 'spanX', 'spanY']),
    uWash: pack(scene, 'wash', ['x', 'y', 'spanX', 'spanY']),
    uShift: pack(scene, 'sway', ['shift']),
    uBaseLight: baseLight(props.backgroundColor),
  }),
};
