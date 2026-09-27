import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {fract, getNoiseFlow, pack, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/** Seconds of one drift of the discs at speed 1: a slow, tidal pace. */
const DRIFT_SECONDS = 16;

/**
 * The arcs, front to back: the disc's limb, the edge of the pale band, the edge of the middle
 * band and the outer rim. Centres and radii are pixels at scale 1: the centres sit off the
 * top left, so the arcs sweep the frame diagonally and the frame crops them like the artwork.
 * The centres differ a little, so each band swells and thins along its arc like a crescent.
 * `sway` is how far the arc drifts (the nearer disc drifts farther: parallax), `lobes` how
 * many light lobes fit around its circle (about one per 900 px of arc), `depth` how much the
 * lobes vary and `light` the strength of its rim.
 */
const ARCS = [
  {x: -300, y: -700, radius: 1500, sway: 64, lobes: 10, depth: 0.35, light: 1},
  {x: -360, y: -610, radius: 1650, sway: 52, lobes: 12, depth: 0.5, light: 0.2},
  {x: -260, y: -660, radius: 2000, sway: 40, lobes: 14, depth: 0.5, light: 0.15},
  {x: -320, y: -720, radius: 2440, sway: 30, lobes: 17, depth: 0.45, light: 1},
];

/**
 * A pastel eclipse: huge nested discs whose centres lie off the top left. The front disc is
 * the backdrop itself, lit from its limb inwards; behind it, bands shade from pale to deep
 * and back to a luminous rim, each edge carrying its own soft light.
 */
export const eclipse: WebGLExperiment = {
  glsl: /* glsl */ `
uniform vec2 uFlow;
// Per arc, front to back (the disc's limb first, the outer rim last): centre and radius in
// pixels at scale 1, and how many light lobes fit around its circle (a whole number).
uniform vec4 uArcs[4];
// Per arc: cosine and sine of how far its light has travelled along the circle, the depth of
// the lobes and the strength of the rim.
uniform vec4 uLights[4];
// The breathing of the disc's glow.
uniform float uPulse;

// The layout is drawn at scale 1 and zoomed about the frame's centre.
const vec2 PIVOT = vec2(960.0, 540.0);

float chroma(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }

/**
 * The palette as six stops, 0 to 5: the light, the pale band, the middle band, the deep band,
 * the rim and the outer sky. Blended in a gamma-2 space, where a pale and a deep colour meet
 * without a washed-out step, and keeping the chroma of the ends, so opposite hues meet
 * through a clean colour instead of grey.
 */
vec4 tone(float stop) {
  float x = clamp(stop, 0.0, 5.0) * 0.2 * float(uPaletteSize - 1);
  int i = int(floor(x));
  float f = x - float(i);
  f = mix(f, f * f * (3.0 - 2.0 * f), 0.5);
  vec4 a = paletteColor(i);
  vec4 b = paletteColor(i + 1);
  vec3 ga = sqrt(a.rgb);
  vec3 gb = sqrt(b.rgb);
  vec3 rgb = mix(ga, gb, f);
  float grey = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  float boost = min(mix(chroma(ga), chroma(gb), f) / max(chroma(rgb), 1e-3), 1.5);
  rgb = clamp(grey + (rgb - grey) * boost, 0.0, 1.0);
  return vec4(rgb * rgb, mix(a.a, b.a, f));
}

// Adds light like a screen blend: a rim over a pale band brightens without clipping flat.
vec3 lighten(vec3 base, vec3 light, float amount) {
  return 1.0 - (1.0 - base) * (1.0 - light * clamp(amount, 0.0, 1.0));
}

// Soft roll-off above 0.8, so a bright rim keeps its hue instead of clipping flat.
vec3 shoulder(vec3 c) {
  return mix(c, 1.0 - 0.2 * exp((0.8 - c) / 0.2), step(0.8, c));
}

// How much of a pixel lies inside an arc: a soft edge a little wider than a pixel.
float cover(float d) {
  float w = 1.5 + 0.7 * fwidth(d);
  return 1.0 - smoothstep(-w, w, d);
}

vec4 premultiply(vec4 c) { return vec4(c.rgb * c.a, c.a); }

vec4 experiment(vec2 px) {
  vec2 q = PIVOT + (px - PIVOT) / uScale;
  float dist[4];
  // The strength of each arc's light: the thin rims follow the travelling lobes, the broad
  // glows only a trace of them, so the glows stay smooth coronas.
  float rim[4];
  float halo[4];
  for (int k = 0; k < 4; k++) {
    vec2 delta = q - uArcs[k].xy;
    dist[k] = length(delta) - uArcs[k].z;
    float theta = atan(delta.y, delta.x);
    // cos(lobes * angle - travel): whole lobes around the circle, so the wrap of the angle
    // never shows, and the travel arrives as its cosine and sine to close the loop.
    float angle = uArcs[k].w * theta;
    float lobe = cos(angle) * uLights[k].x + sin(angle) * uLights[k].y;
    // The key light comes from below: arcs brighten as they turn down towards the left.
    float facing = 0.5 + 0.5 * cos(theta - 1.3);
    float key = uLights[k].w * mix(0.7, 1.15, facing);
    rim[k] = key * (1.0 + uLights[k].z * lobe);
    halo[k] = key * (1.0 + 0.3 * uLights[k].z * lobe);
  }

  // Broad, out-of-focus drift of the gradients along the bands.
  vec2 w = q / 760.0;
  float drift = 0.22 * perlin(vec3(w, uFlow.x), uFlow.y);
  float shade = 1.0 + 0.05 * perlin(vec3(w * 1.7 + vec2(11.3, 4.7), uFlow.x + 0.5), uFlow.y);
  vec3 light = mix(paletteColor(0).rgb, vec3(1.0), 0.3);

  // The disc: the backdrop shows through, lit from the limb inwards, with a thin bright line
  // just inside the edge. The broad glow takes a little of the pale band's hue: over a dark
  // backdrop it reads as a corona, not as grey fog.
  float inside = max(-dist[0], 0.0);
  float wide = halo[0] * uPulse * 0.5 * exp(-inside / 240.0);
  float near = halo[0] * uPulse * 0.7 * exp(-inside / 60.0);
  // A square, not pow(): pow() of a negative base is undefined in GLSL.
  float offset = (inside - 2.5) / 2.5;
  float limb = rim[0] * exp(-0.5 * offset * offset);
  vec4 lit = tone(0.0);
  vec3 corona = mix(tone(0.6).rgb, lit.rgb, near / max(wide + near, 1e-4));
  vec4 disc = vec4(mix(corona, vec3(1.0), clamp(0.5 * limb, 0.0, 1.0)),
    clamp(wide + near + 0.6 * limb, 0.0, 1.0) * lit.a);

  // The pale band, bathed in the limb's halo.
  float s1 = max(dist[0], 0.0);
  float u1 = max(-dist[1], 0.0);
  vec4 pale = tone(mix(0.8, 1.3, s1 / max(s1 + u1, 1.0)) + drift);
  pale.rgb *= shade;
  pale.rgb = lighten(pale.rgb, light, halo[0] * uPulse * (0.4 * exp(-s1 / 50.0) + 0.2 * exp(-s1 / 200.0)));
  pale.rgb = lighten(pale.rgb, light, rim[1] * (0.5 * exp(-u1 / 10.0) + 0.25 * exp(-u1 / 70.0)));

  // The middle band, darkening outwards.
  float s2 = max(dist[1], 0.0);
  float u2 = max(-dist[2], 0.0);
  vec4 middle = tone(mix(1.6, 2.75, s2 / max(s2 + u2, 1.0)) + drift);
  middle.rgb *= shade;
  middle.rgb = lighten(middle.rgb, light, rim[2] * (0.5 * exp(-u2 / 10.0) + 0.2 * exp(-u2 / 60.0)));

  // The deep band: shaded under the middle band's edge, it brightens towards the outer rim.
  float s3 = max(dist[2], 0.0);
  float u3 = max(-dist[3], 0.0);
  float t3 = s3 / max(s3 + u3, 1.0);
  vec4 deep = tone(mix(3.0, 4.0, t3 * t3) + 0.5 * drift);
  deep.rgb *= shade * (1.0 - 0.15 * exp(-s3 / 90.0));
  // The outer rim glows in the rim colour, as a lavender halo around a near-white line.
  vec3 rimLight = mix(light, tone(4.0).rgb, 0.35);
  deep.rgb = lighten(deep.rgb, rimLight, rim[3] * 0.7 * exp(-u3 / 9.0) + halo[3] * 0.25 * exp(-u3 / 70.0));

  // The outer sky, in the rim's halo.
  float s4 = max(dist[3], 0.0);
  vec4 outer = tone(4.0 + smoothstep(0.0, 420.0, s4) + 0.5 * drift);
  outer.rgb *= shade;
  outer.rgb = lighten(outer.rgb, rimLight, rim[3] * 0.45 * exp(-s4 / 35.0) + halo[3] * 0.2 * exp(-s4 / 160.0));

  // Each region replaces the one behind it, so the disc shows the backdrop, not the bands.
  vec4 layer = premultiply(outer);
  layer = mix(layer, premultiply(deep), cover(dist[3]));
  layer = mix(layer, premultiply(middle), cover(dist[2]));
  layer = mix(layer, premultiply(pale), cover(dist[1]));
  layer = mix(layer, premultiply(disc), cover(dist[0]));

  float gain = uIntensity;
  vec3 color = layer.a > 0.0 ? layer.rgb / layer.a : vec3(0.0);
  // A faint static grain, like the artwork's print texture: it never moves between frames.
  float grain = unit(hash(uint(px.x), uint(px.y), 7121u)) - 0.5;
  color = shoulder(color * (0.8 + 0.2 * gain) * (1.0 + 0.03 * grain));
  float alpha = clamp(layer.a * gain, 0.0, 1.0);
  return vec4(color * alpha, alpha);
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    const cycle = phase / TAU;
    const pace = (props.speed * props.durationSeconds) / DRIFT_SECONDS;
    const turns = wholeTurns(pace);
    // The drift closes in whole turns; on cycles shorter than the base pace it swings less,
    // so the discs do not hurry.
    const reach = turns > 0 ? Math.min(1, pace / turns) : 1;
    const flow = getNoiseFlow(props, cycle, 0.05, 617);
    const random = createSeededRandom(props.seed + 613);
    // One drift for every arc, scaled by its depth: the discs slide like layers seen from a
    // moving eye, with a second harmonic so the path is not a plain ellipse.
    const drift = turns * phase + random() * TAU;
    const wobble = 2 * turns * phase + random() * TAU;
    const pulse = 1 + 0.14 * reach * Math.sin(2 * turns * phase + random() * TAU);
    const arcs = ARCS.map((arc, index): WebGLElement => {
      const x = arc.x + randomBetween(random, -30, 30);
      const y = arc.y + randomBetween(random, -30, 30);
      const radius = arc.radius * randomBetween(random, 0.98, 1.02);
      const breath = random() * TAU;
      // A little drift of its own, so the bands between the arcs widen and narrow.
      const own = turns * phase + random() * TAU;
      // The lights travel one lobe per turn, neighbours in opposite directions; the start keeps
      // the wrap of the travelled fraction away from the seam.
      const travel = TAU * fract(0.2 + 0.6 * random() + (index % 2 === 0 ? 1 : -1) * turns * cycle);
      return {
        kind: 'arc',
        x: x + reach * (arc.sway * (Math.cos(drift) + 0.3 * Math.cos(wobble)) + 14 * Math.cos(own)),
        y: y + reach * (arc.sway * (0.7 * Math.sin(drift) + 0.3 * Math.sin(wobble)) + 14 * Math.sin(own)),
        radius: radius * (1 + 0.015 * reach * Math.sin(turns * phase + breath)),
        lobes: arc.lobes,
        cos: Math.cos(travel),
        sin: Math.sin(travel),
        depth: arc.depth * (0.4 + 0.6 * reach),
        light: arc.light,
        opacity: 1,
      };
    });
    return [
      {kind: 'flow', position: flow.position, period: flow.period, opacity: 1},
      {kind: 'glow', pulse, opacity: 1},
      ...arcs,
    ];
  },
  uniforms: (scene) => ({
    uFlow: pack(scene, 'flow', ['position', 'period']),
    uArcs: pack(scene, 'arc', ['x', 'y', 'radius', 'lobes']),
    uLights: pack(scene, 'arc', ['cos', 'sin', 'depth', 'light']),
    uPulse: pack(scene, 'glow', ['pulse']),
  }),
};
