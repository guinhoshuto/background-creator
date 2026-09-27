import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {fract, getNoiseFlow, pack, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/** Draped silk: a height field of broad folds, lit by a key light with a narrow satin sheen. */
export const silk: WebGLExperiment = {
  glsl: /* glsl */ `
uniform vec2 uFlow;
// Direction across the main folds (unit), palette offset, fold relief.
uniform vec4 uFabric;
// Offsets of the warp domain (xy) and of the cloth (zw), each moving on a closed loop.
uniform vec4 uSway;
// Cosine and sine of how far each fold family has travelled: main folds (xy), fine folds (zw).
uniform vec4 uWaves;
// Key light direction (unit; y down, z towards the viewer) and sheen strength.
uniform vec4 uLight;

/**
 * The phase of the main folds and the height of the cloth at a point of the plane: two
 * families of travelling folds, bent by a domain warp, with the main folds deepening and
 * flattening along their length over a broad swell.
 */
vec2 silkField(vec2 p) {
  vec2 d = p * 0.55 + uSway.xy;
  vec2 warp = vec2(
    perlin(vec3(d, uFlow.x), uFlow.y),
    perlin(vec3(d + vec2(23.17, 41.9), uFlow.x + 0.5), uFlow.y));
  vec2 q = p + uSway.zw + warp * 0.3;
  vec2 f = vec2(dot(q, uFabric.xy), dot(q, vec2(-uFabric.y, uFabric.x)));
  float bend = perlin(vec3(f.x * 0.7 + 3.3, f.y * 0.4, uFlow.x + 0.25), uFlow.y);
  float swell = perlin(vec3(f.x * 0.9 + 7.1, f.y * 0.5 + 1.7, uFlow.x + 0.75), uFlow.y);
  float phase = f.x * 9.0 + bend * 2.8;
  // cos(phase - travel), with the travel given as its cosine and sine so it closes the loop.
  float wave = cos(phase) * uWaves.x + sin(phase) * uWaves.y;
  // A rounded ridge, |sin| of the half angle softened: crests turn over tightly, valleys
  // stay broad. The rounding keeps each crest tens of pixels wide at scale 1, so it never aliases.
  float ridge = 0.6 - sqrt(0.54 - 0.5 * wave);
  float finePhase = dot(f, vec2(0.95, 0.3)) * 12.0 + bend * 3.0 + 1.3;
  float fine = sin(finePhase) * uWaves.z - cos(finePhase) * uWaves.w;
  // Smooth everywhere: a kink in the height would draw a hard edge in the shading.
  float depth = 0.5 + 0.5 * smoothstep(-0.55, 0.35, swell);
  return vec2(phase, 0.75 * depth * ridge + 0.06 * fine + 0.3 * swell);
}

float chroma(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }

/**
 * Cyclic palette that holds each colour and blends only near the seams, in a gamma-2 space
 * and keeping the chroma of its ends, so even opposite hues meet through a clean colour
 * instead of a band of grey.
 */
vec4 silkPalette(float t) {
  float x = fract(t) * float(uPaletteSize);
  int i = int(floor(x));
  int j = i + 1 >= uPaletteSize ? 0 : i + 1;
  float blend = smoothstep(0.2, 0.8, x - float(i));
  vec4 a = paletteColor(i);
  vec4 b = paletteColor(j);
  vec3 ga = sqrt(a.rgb);
  vec3 gb = sqrt(b.rgb);
  vec3 rgb = mix(ga, gb, blend);
  float grey = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  float boost = min(mix(chroma(ga), chroma(gb), blend) / max(chroma(rgb), 1e-3), 1.5);
  rgb = clamp(grey + (rgb - grey) * boost, 0.0, 1.0);
  return vec4(rgb * rgb, mix(a.a, b.a, blend));
}

// Soft roll-off above 0.8, so a bright sheen keeps its hue instead of clipping flat.
vec3 shoulder(vec3 c) {
  return mix(c, 1.0 - 0.2 * exp((0.8 - c) / 0.2), step(0.8, c));
}

vec4 experiment(vec2 px) {
  float unitPx = uResolution.y * uScale;
  vec2 p = (px - 0.5 * uResolution) / unitPx;
  float e = 1.0 / unitPx;
  vec2 c = silkField(p);
  vec2 cx = silkField(p + vec2(e, 0.0));
  vec2 cy = silkField(p + vec2(0.0, e));
  vec2 grad = vec2(cx.y - c.y, cy.y - c.y) / e;
  float relief = uFabric.w;
  vec3 n = normalize(vec3(-grad * relief, 1.0));
  vec3 l = uLight.xyz;
  vec3 hv = normalize(l + vec3(0.0, 0.0, 1.0));

  // Slightly wrapped diffuse: silk scatters light, so faces turned away are dim, not black.
  float diffuse = clamp((dot(n, l) + 0.1) / 1.1, 0.0, 1.0);
  // Valleys sit deep in the drape and receive less light.
  float cavity = smoothstep(-0.5, 0.1, c.y);
  float lit = pow(diffuse, 1.6) * mix(0.12, 1.0, cavity);

  // Kajiya-Kay sheen: the threads run across the folds, so the highlight is a band along
  // each fold where the thread is perpendicular to the half vector. The phase of the main
  // folds always grows across them, so its gradient gives the thread direction. The lobes
  // widen with the pixel footprint, so thin bands never alias.
  vec2 across = normalize(vec2(cx.x - c.x, cy.x - c.x));
  vec3 thread = normalize(vec3(across, relief * dot(grad, across)));
  float th = dot(thread, hv);
  float blur = fwidth(th);
  float narrow = sqrt(0.0049 + blur * blur);
  float broad = sqrt(0.0225 + blur * blur);
  float sheen = 0.4 * exp(-0.5 * th * th / (narrow * narrow)) * 0.07 / narrow
    + 0.35 * exp(-0.5 * th * th / (broad * broad)) * 0.15 / broad;
  float gloss = pow(max(dot(n, hv), 0.0), 16.0);

  // The palette runs across the folds but stays put while they travel: the cloth moves
  // through its colours like shot silk, and no colour ever sweeps across the frame.
  float t = uFabric.z + 0.047 * c.x;
  vec4 tint = silkPalette(t);
  vec3 sheenTint = mix(tint.rgb, vec3(1.0), 0.3);
  float gain = uIntensity;
  // Shadows keep a deep, saturated tint: over a light background they read as colour, not grey.
  vec3 color = mix(tint.rgb * (tint.rgb * 0.12 + 0.015), tint.rgb, lit);
  color += sheenTint * (0.3 * gloss + 0.8 * sheen) * uLight.w * mix(0.3, 1.0, cavity) * sqrt(diffuse);
  color = shoulder(color * (0.75 + 0.25 * gain));
  // The deepest valleys fall into the background; shaded faces stay nearly opaque cloth.
  float cover = smoothstep(0.0, 0.3, cavity) * mix(0.9, 1.0, smoothstep(0.0, 0.35, lit + 0.3 * sheen));
  float alpha = clamp(cover * gain, 0.0, 1.0) * tint.a;
  return vec4(color * alpha, alpha);
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    const cycle = phase / TAU;
    const flow = getNoiseFlow(props, cycle, 0.06, 337);
    const pace = (props.speed * props.durationSeconds) / 16;
    const turns = wholeTurns(pace);
    // The sways close in whole turns too; on cycles shorter than the base pace they swing
    // less, so the light and the cloth do not hurry.
    const reach = turns > 0 ? Math.min(1, pace / turns) : 1;
    const random = createSeededRandom(props.seed + 331);
    const along = randomBetween(random, 0.35, 0.85) * (random() < 0.5 ? -1 : 1);
    const hue = random();
    const swayOffset = random() * TAU;
    const lightOffset = random() * TAU;
    // Each fold family travels whole wavelengths per cycle; the start keeps the wrap of the
    // travelled fraction away from the seam, and the shader only reads its cosine and sine.
    const travel = [0.2 + 0.6 * random(), 0.2 + 0.6 * random()].map((start) => TAU * fract(start + turns * cycle));
    const sway = turns * phase + swayOffset;
    const azimuth = -2.25 + 0.25 * reach * Math.sin(turns * phase + lightOffset);
    const elevation = 0.45;
    return [
      {kind: 'flow', position: flow.position, period: flow.period, opacity: 1},
      {kind: 'fabric', acrossX: -Math.sin(along), acrossY: Math.cos(along), hue, relief: 0.55, opacity: 1},
      {
        kind: 'sway',
        warpX: 0.12 * reach * Math.cos(sway), warpY: 0.07 * reach * Math.sin(sway),
        clothX: 0.03 * reach * Math.sin(sway), clothY: 0.02 * reach * Math.cos(sway),
        opacity: 1,
      },
      ...travel.map((angle) => ({kind: 'wave', cos: Math.cos(angle), sin: Math.sin(angle), opacity: 1})),
      {
        kind: 'light',
        x: Math.cos(elevation) * Math.cos(azimuth),
        y: Math.cos(elevation) * Math.sin(azimuth),
        z: Math.sin(elevation),
        opacity: 1,
      },
    ];
  },
  uniforms: (scene) => ({
    uFlow: pack(scene, 'flow', ['position', 'period']),
    uFabric: pack(scene, 'fabric', ['acrossX', 'acrossY', 'hue', 'relief']),
    uSway: pack(scene, 'sway', ['warpX', 'warpY', 'clothX', 'clothY']),
    uWaves: pack(scene, 'wave', ['cos', 'sin']),
    uLight: pack(scene, 'light', ['x', 'y', 'z', 'opacity']),
  }),
};
