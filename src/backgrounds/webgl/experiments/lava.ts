import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {getNoiseFlow, pack, parseColor, srgbToLinear, wholeTurns, type WebGLExperiment} from '../scene';

const BLOBS = 12;
/** Seconds of one rise and fall at speed 1: the unhurried pace of a real lamp. */
const RISE_AND_FALL_SECONDS = 24;
const WIDTH = 1920;
const HEIGHT = 1080;

/**
 * A blob's path: a rest centre, two harmonics per axis (1 and 2 turns per cycle) and a
 * breath. A pinned axis keeps the blob hugging its edge when `scale` resizes it: the far
 * side of the blob, seen from that edge, moves only half as much as the radius grows, so
 * bigger wax spills past the frame instead of flooding the middle.
 */
type BlobPath = {
  x: number;
  y: number;
  /** -1 pins to the left or top edge, 1 to the right or bottom, 0 leaves the axis free. */
  pinX: number;
  pinY: number;
  swayX: [number, number];
  swayY: [number, number];
  phases: [number, number, number, number, number];
  radius: number;
  breath: number;
  /** A small seeded shift along the palette, so blobs at one height are not one flat colour. */
  shade: number;
};

/**
 * Where the wax lives: a pool in each bottom corner, a cap in each top corner and three
 * blobs per side that rise from the pool to the cap and sink back, so the lamp frames the
 * content plate. The middle only gets two low bulges over the bottom and top edges.
 */
const layoutBlobs = (seed: number): BlobPath[] => {
  const random = createSeededRandom(seed + 409);
  const between = (min: number, max: number) => randomBetween(random, min, max);
  const phases = (): BlobPath['phases'] => [random() * TAU, random() * TAU, random() * TAU, random() * TAU, random() * TAU];
  const shade = () => between(-0.07, 0.07);
  const blobs: BlobPath[] = [];
  for (const side of [-1, 1]) {
    const mirror = (x: number) => (side < 0 ? x : WIDTH - x);
    const poolRadius = between(250, 290);
    blobs.push({
      x: mirror(between(110, 200)), y: HEIGHT + poolRadius * between(0.2, 0.3), pinX: 0, pinY: 1,
      swayX: [between(25, 40), between(8, 14)], swayY: [between(12, 20), between(4, 8)],
      phases: phases(), radius: poolRadius, breath: 0.03, shade: shade(),
    });
    const capRadius = between(160, 200);
    blobs.push({
      x: mirror(between(70, 170)), y: -capRadius * between(0.28, 0.4), pinX: 0, pinY: -1,
      swayX: [between(20, 35), between(6, 12)], swayY: [between(10, 16), between(3, 6)],
      phases: phases(), radius: capRadius, breath: 0.035, shade: shade(),
    });
    // Three lanes, each rising around its own height, a third of a cycle apart: one rises
    // while another sinks, so they meet, merge and part again inside the column.
    const start = random() * TAU;
    for (let lane = 0; lane < 3; lane++) {
      const [x1, x2, , y2, breath] = phases();
      blobs.push({
        x: mirror(130 + lane * 88 + between(-18, 18)), y: 330 + lane * 210 + between(-25, 25), pinX: side, pinY: 0,
        swayX: [between(28, 48), between(14, 24)],
        swayY: [between(300, 350), between(30, 50)],
        phases: [x1, x2, start + (lane * TAU) / 3 + between(-0.35, 0.35), y2, breath],
        radius: between(74, 118),
        breath: 0.06,
        shade: shade(),
      });
    }
  }
  const floorRadius = between(210, 240);
  blobs.push({
    x: between(860, 1060), y: HEIGHT + floorRadius * between(0.62, 0.7), pinX: 0, pinY: 1,
    swayX: [between(120, 160), between(20, 30)], swayY: [between(10, 16), between(3, 6)],
    phases: phases(), radius: floorRadius, breath: 0.04, shade: shade(),
  });
  const ceilingRadius = between(180, 210);
  blobs.push({
    x: between(860, 1060), y: -ceilingRadius * between(0.66, 0.74), pinX: 0, pinY: -1,
    swayX: [between(120, 160), between(20, 30)], swayY: [between(10, 16), between(3, 6)],
    phases: phases(), radius: ceilingRadius, breath: 0.04, shade: shade(),
  });
  return blobs;
};

/** The rest centre along one axis at a scale, for a blob pinned to an edge of that axis. */
const pinned = (centre: number, pin: number, radius: number, scale: number, size: number) => {
  if (pin === 0) return centre;
  const far = pin < 0 ? centre + radius : size - centre + radius;
  const reach = far * (0.5 + 0.5 * scale);
  return pin < 0 ? reach - radius * scale : size - reach + radius * scale;
};

const smoothstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

/**
 * Where a blob sits along the palette, from its height: the first colour pools at the
 * bottom, the last caps the top, like wax warming over the bulb and cooling as it rises. The
 * smoothstep flattens both ends, so the value keeps a smooth velocity through the cycle.
 */
const heatAt = (y: number, shade: number) => smoothstep((HEIGHT + 40 - y) / (HEIGHT + 80) + shade);

/** Linear sRGB to OKLab, where a blend between two colours keeps its lightness and chroma. */
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

/** The palette in OKLab with each colour's alpha, sampled like the prelude's ramps. */
const oklabPalette = (colors: string[]) => {
  const wax = colors.map(parseColor).map(([r, g, b, a]) => [
    ...linearToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)), a,
  ]);
  const between = (i: number, j: number, t: number) => wax[i]!.map((value, c) => value + (wax[j]![c]! - value) * smoothstep(t));
  return {
    /** 0 is the first colour, 1 the last. */
    ramp: (t: number) => {
      const x = Math.min(1, Math.max(0, t)) * (wax.length - 1);
      const i = Math.min(Math.floor(x), wax.length - 2);
      return between(i, i + 1, x - i);
    },
    /** The colour one slot further along, wrapping from the last to the first. */
    next: (t: number) => {
      const x = Math.min(1, Math.max(0, t)) * (wax.length - 1) + 1;
      const i = Math.floor(x) % wax.length;
      return between(i, (i + 1) % wax.length, x - Math.floor(x));
    },
  };
};

/**
 * A lava lamp: soft blobs of wax that rise, sink, merge and split along the sides of the
 * frame, shaded like glossy glass with a diffuse body, a crisp highlight and a rim in the
 * next palette colour.
 */
export const lava: WebGLExperiment = {
  glsl: /* glsl */ `
uniform float uFlow;
uniform float uFlowPeriod;
// Per blob: centre and radius (px).
uniform vec3 uBlobs[${BLOBS}];
// Per blob, in OKLab: the wax colour with its alpha, and the rim colour. Merging blobs blend
// in OKLab, through vivid colours instead of the greys linear light gives between opposite hues.
uniform vec4 uBlobWax[${BLOBS}];
uniform vec3 uBlobRim[${BLOBS}];

vec3 oklabToLinear(vec3 c) {
  vec3 lms = vec3(
    c.x + 0.3963377774 * c.y + 0.2158037573 * c.z,
    c.x - 0.1055613458 * c.y - 0.0638541728 * c.z,
    c.x - 0.0894841775 * c.y - 1.2914855480 * c.z);
  lms = lms * lms * lms;
  return max(vec3(
    4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z), 0.0);
}

vec4 experiment(vec2 px) {
  // A slow, wide warp keeps the outlines from reading as perfect circles.
  vec2 q = px / (420.0 * uScale);
  vec2 warp = vec2(
    perlin(vec3(q, uFlow), uFlowPeriod),
    perlin(vec3(q + vec2(17.3, 41.9), uFlow), uFlowPeriod));
  vec2 p = px + warp * 16.0 * uScale;

  // Chained polynomial smooth minimum of the blobs' distances. Its exact gradient is the
  // same blend of theirs, so the gradient, the radius and the colours ride along with it.
  float k = 110.0 * sqrt(uScale);
  float d = 1e6;
  vec2 grad = vec2(0.0);
  float radius = 1.0;
  vec4 wax = uBlobWax[0];
  vec3 rim = uBlobRim[0];
  for (int i = 0; i < ${BLOBS}; i++) {
    vec3 blob = uBlobs[i];
    vec2 delta = p - blob.xy;
    float len = length(delta);
    float di = len - blob.z;
    float h = clamp(0.5 + 0.5 * (d - di) / k, 0.0, 1.0);
    d = mix(d, di, h) - k * h * (1.0 - h);
    // Softened at the centre, where the direction is undefined and would flip.
    grad = mix(grad, delta / sqrt(len * len + 0.0025 * blob.z * blob.z), h);
    radius = mix(radius, blob.z, h);
    wax = mix(wax, uBlobWax[i], h);
    rim = mix(rim, uBlobRim[i], h);
  }

  float cover = clamp(0.5 - d / max(fwidth(d), 1e-3), 0.0, 1.0);
  // A rounded bevel as wide as the blended radius, up to a cap: a lone drop is a dome, a big
  // pool a flat puddle with a rounded rim, and the neck of a merge a soft ridge. The profile
  // leaves the rim like a sphere and lands flat, so the top has no crease to catch the light.
  float bevel = min(radius, 130.0 * uScale);
  float depth = clamp(-d / bevel, 0.0, 1.0);
  vec2 slope = grad * (1.0 - depth) * (1.0 - depth) * (1.0 + depth);
  vec3 n = vec3(slope, sqrt(max(1.0 - dot(slope, slope), 0.0)));

  vec3 light = normalize(vec3(-0.35, -0.6, 0.72));
  vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
  float wrap = dot(n, light) * 0.5 + 0.5;
  float edge = 1.0 - n.z;
  float ndh = max(dot(n, halfway), 0.0);

  vec3 base = oklabToLinear(wax.xyz);
  vec3 tint = oklabToLinear(rim);
  // Lit from below like a lamp: the lower flank glows in the rim colour.
  float under = clamp(n.y, 0.0, 1.0);
  vec3 body = base * (0.38 + 0.72 * wrap * wrap)
    + tint * pow(edge, 3.0) * (0.25 + 0.75 * under);
  // Glass on top: a crisp highlight and its soft bloom, and the sky caught along the upper
  // rim. The highlight stays off the saddles of the necks, where the blended normal would
  // streak, and where the normal turns fast across a pixel (small drops, fillets) it widens
  // and dims instead of shrinking to a flickering speck.
  vec3 turn = fwidth(n);
  float shininess = 180.0 / (1.0 + 720.0 * dot(turn, turn));
  float rounded = smoothstep(0.55, 0.95, length(grad));
  float spec = pow(ndh, shininess) * (shininess + 2.0) / 182.0 * 1.5 * rounded + pow(ndh, 22.0) * 0.1;
  vec3 gloss = vec3(spec)
    + mix(tint, vec3(1.0), 0.6) * pow(edge, 5.0) * 0.4 * (1.0 - smoothstep(-0.8, 0.3, n.y));

  float strength = min(uIntensity, 1.0);
  float gain = 1.0 + 0.5 * max(uIntensity - 1.0, 0.0);
  float alpha = cover * wax.a * strength;
  vec4 layer = vec4(body * gain * alpha, alpha);
  vec3 shine = gloss * gain * cover * sqrt(wax.a * strength);
  float shineAlpha = clamp(max(shine.r, max(shine.g, shine.b)), 0.0, 1.0);
  return vec4(shine, shineAlpha) + layer * (1.0 - shineAlpha);
}
`,
  scene: (props, frame, durationInFrames) => {
    const phase = loopPhase(frame, durationInFrames);
    const flow = getNoiseFlow(props, phase / TAU, 0.06, 421);
    const travel = (props.speed * props.durationSeconds) / RISE_AND_FALL_SECONDS;
    const turns = wholeTurns(travel);
    // A short cycle still needs a whole rise and fall; a shorter path keeps its pace calm.
    const stride = turns > 0 ? Math.min(1, Math.max(0.2, travel / turns)) : 1;
    return [
      {kind: 'flow', position: flow.position, period: flow.period, opacity: 1},
      ...layoutBlobs(props.seed).map((blob) => {
        const {swayX, swayY, phases} = blob;
        // The pools and caps grow slower than the drops, so a large scale keeps an open middle.
        const grow = blob.pinY === 0 ? props.scale : props.scale ** 0.7;
        const x = pinned(blob.x, blob.pinX, blob.radius, grow, WIDTH)
          + stride * (swayX[0] * Math.sin(turns * phase + phases[0]) + swayX[1] * Math.sin(2 * turns * phase + phases[1]));
        const y = pinned(blob.y, blob.pinY, blob.radius, grow, HEIGHT)
          + stride * (swayY[0] * Math.cos(turns * phase + phases[2]) + swayY[1] * Math.cos(2 * turns * phase + phases[3]));
        return {
          kind: 'blob',
          x,
          y,
          radius: blob.radius * grow * (1 + stride * blob.breath * Math.sin(2 * turns * phase + phases[4])),
          heat: heatAt(y, blob.shade),
          opacity: 1,
        };
      }),
    ];
  },
  uniforms: (scene, props) => {
    const palette = oklabPalette(props.colors);
    const heat = pack(scene, 'blob', ['heat']);
    return {
      uFlow: pack(scene, 'flow', ['position']),
      uFlowPeriod: pack(scene, 'flow', ['period']),
      uBlobs: pack(scene, 'blob', ['x', 'y', 'radius']),
      uBlobWax: heat.flatMap(palette.ramp),
      uBlobRim: heat.flatMap((value) => palette.next(value).slice(0, 3)),
    };
  },
};
