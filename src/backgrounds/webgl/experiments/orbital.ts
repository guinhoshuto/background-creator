import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {pack, parseColor, srgbToLinear, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/** Seconds of one orbit of the lights around the sphere at speed 1. */
const ORBIT_SECONDS = 20;
/** Seconds of one rise and fall of the floating sphere at speed 1. */
const BOB_SECONDS = 8;
/**
 * The orbit is tilted: elevations in radians, as mid - swing * sin(angle), highest as the
 * lights pass in front of the sphere and lowest behind it. The key light stays above the
 * horizon: a top light in front, a rim light behind. The colour axis tilts further, so the
 * gradient always runs across the visible face (top to bottom when the key is in front)
 * instead of pointing at the camera, which would leave a flat disc of the key's colour; at the
 * sides it dips a little below the horizon, so the first colour crowns the sphere and the
 * key's colour gathers low on its lit side, as in the reference.
 */
const KEY_ELEVATION = {mid: 0.5, swing: 0.35};
const AXIS_ELEVATION = {mid: -0.1, swing: 1};
/**
 * A pinhole camera over the floor, pitched down, with a shift lens: the optical axis meets the
 * frame at principalX (a share of the width), right over the sphere, so the sphere stays round
 * at the edge of the frame while the studio's horizontals stay level. World units are the
 * sphere radius at scale 1; focal is in frame heights (2400 px at 1080).
 */
const CAMERA = {height: 2.2, pitch: 0.1257, focal: 2.0, principalX: 0.855};
/** The backdrop stands at wallZ and bends into the floor through a cove of radius coveRadius. */
const STUDIO = {wallZ: 14, coveRadius: 2.5};
/**
 * Where the sphere rests at scale 1: on the camera axis, x = 1642 px, radius 206 px. It sits
 * whole in the right third, its left edge (x = 1436 px) just inside the content box (410…1510
 * px), which the clearing of centerFade barely reaches there; a sphere cropped by the frame
 * read as a mistake rather than as one of the series' large forms.
 */
const REST = {x: 0, z: 10.4};
/** How far the sphere slides right as it grows, so its left edge holds near x = 1436 px. */
const GROW_SHIFT = 1;
/** The seed nudges the sphere right by up to this much, never towards the content box. */
const SEED_SHIFT = 0.1;
/** Height of the gap under the sphere, in radii: almost resting, and how much higher it floats. */
const LIFT = {low: 0.02, rise: 0.18};
/**
 * The key lamp stands reach radii from the sphere, a little above its middle, and never closer
 * than wallGap to the backdrop: behind the paper it would light the wall from the back.
 */
const LAMP = {reach: 3.2, height: 0.15, wallGap: 1.6, soften: 1};

const f = (value: number) => value.toFixed(5);

/** A minimum with a rounded corner (C1), so a clamped motion keeps a smooth velocity. */
const smoothMin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};

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

/**
 * A matte pearl sphere floating over a seamless studio sweep, lit by coloured lights that
 * orbit it. The palette runs along one axis, from the first colour on the far side to the last
 * on the key's side, as a soft diagonal gradient over the sphere and the paper around it; the
 * last colour is also the key light, with its pool and cast shadow. The gradient turns with the
 * orbit, and the soft contact shadow tightens as the sphere sinks.
 */
export const orbital: WebGLExperiment = {
  glsl: /* glsl */ `
const float CAM_HEIGHT = ${f(CAMERA.height)};
const float CAM_PITCH = ${f(CAMERA.pitch)};
const float FOCAL = ${f(CAMERA.focal)};
const float PRINCIPAL_X = ${f(CAMERA.principalX)};
const float WALL_Z = ${f(STUDIO.wallZ)};
const float COVE_R = ${f(STUDIO.coveRadius)};

// Sphere centre (xyz) and radius.
uniform vec4 uSphere;
// Direction towards the key light (unit, y up, z away from the camera).
uniform vec3 uKey;
// The colour axis: the palette runs from its far end (first colour) to its near end (last).
uniform vec3 uAxis;
// The key lamp that lights the paper, kept in front of the backdrop.
uniform vec3 uLamp;
// The palette in OKLab, with each colour's alpha; slots past uPaletteSize repeat the last.
uniform vec4 uRamp[6];
// The background colour in linear light: the paper the lights fall on.
uniform vec3 uBase;

float sq(float x) { return x * x; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
/** A colour's hue at another luminance, clipped per channel. */
vec3 atLuma(vec3 c, float l) { return min(c * (l / max(luma(c), 1e-3)), vec3(1.0)); }
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
vec4 wash(vec3 c, float a) {
  a = clamp(a, 0.0, 1.0);
  return vec4(c * a, a);
}

vec3 oklabToLinear(vec3 c) {
  vec3 lms = vec3(
    c.x + 0.3963377774 * c.y + 0.2158037573 * c.z,
    c.x - 0.1055613458 * c.y - 0.0638541728 * c.z,
    c.x - 0.0894841775 * c.y - 1.2914855480 * c.z);
  lms = lms * lms * lms;
  return clamp(vec3(
    4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z), 0.0, 1.0);
}

/**
 * The palette as one smooth gradient, 0 the first colour and 1 the last: a Catmull-Rom curve
 * through the colours in OKLab, so neighbours blend through vivid hues and the gradient has no
 * creases or flat steps at the colours themselves.
 */
vec4 ramp(float t) {
  int last = uPaletteSize - 1;
  float x = clamp(t, 0.0, 1.0) * float(last);
  int i = min(int(x), last - 1);
  float u = x - float(i);
  vec4 p0 = uRamp[max(i - 1, 0)];
  vec4 p1 = uRamp[i];
  vec4 p2 = uRamp[i + 1];
  vec4 p3 = uRamp[min(i + 2, last)];
  vec4 lab = 0.5 * (2.0 * p1 + (p2 - p0) * u + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * u * u
    + (3.0 * (p1 - p2) + p3 - p0) * u * u * u);
  return vec4(oklabToLinear(lab.xyz), clamp(lab.w, 0.0, 1.0));
}

vec3 cameraRay(vec2 px) {
  vec2 uv = vec2(px.x - PRINCIPAL_X * uResolution.x, 0.5 * uResolution.y - px.y) / (FOCAL * uResolution.y);
  vec3 forward = vec3(0.0, -sin(CAM_PITCH), cos(CAM_PITCH));
  vec3 up = vec3(0.0, cos(CAM_PITCH), sin(CAM_PITCH));
  return normalize(vec3(uv.x, 0.0, 0.0) + up * uv.y + forward);
}

/** Where a camera ray meets the studio (the floor, the cove or the backdrop) and the normal there. */
vec3 studio(vec3 ro, vec3 rd, out vec3 n) {
  float foot = WALL_Z - COVE_R;
  if (rd.y < 0.0) {
    vec3 p = ro + rd * (-ro.y / rd.y);
    if (p.z <= foot) {
      n = vec3(0.0, 1.0, 0.0);
      return p;
    }
  }
  vec3 p = ro + rd * ((WALL_Z - ro.z) / rd.z);
  if (p.y >= COVE_R) {
    n = vec3(0.0, 0.0, -1.0);
    return p;
  }
  // The cove is the inside of a cylinder along x, seen from within: the far root.
  vec2 o = vec2(ro.y - COVE_R, ro.z - foot);
  vec2 d = rd.yz;
  float a = dot(d, d);
  float b = dot(o, d);
  float c = dot(o, o) - COVE_R * COVE_R;
  p = ro + rd * ((-b + sqrt(max(b * b - a * c, 0.0))) / a);
  vec2 q = vec2(p.y - COVE_R, p.z - foot);
  n = vec3(0.0, -q / COVE_R);
  return p;
}

/**
 * Analytic soft shadow of the sphere for light reaching p along l (unit) from a lamp at
 * distance reach: the penumbra widens with the distance behind the sphere, like an area light.
 */
float sphereShadow(vec3 p, vec3 l, float reach) {
  vec3 oc = uSphere.xyz - p;
  float t = clamp(dot(oc, l), 0.0, reach);
  float r = uSphere.w;
  float w = 0.06 * r + 0.3 * t;
  return 1.0 - smoothstep(r - w, r + w, length(oc - l * t));
}

/**
 * The paper: washes of coloured light, the key's pool and the shadows, over the base. The
 * sweep's broad gradients follow the frame height y (0 top, 1 bottom) rather than the curve of
 * the paper, whose bend into the floor would crease them along the foot of the cove.
 */
vec4 studioLayer(vec3 p, vec3 n, float y, float strength) {
  vec3 c = uSphere.xyz;
  float r = uSphere.w;
  vec3 rel = p - c;
  float across = length(rel.xz);
  // The light arriving here: the gradient along the axis, by the direction from the sphere.
  // Close to the sphere every light meets, and the colour eases towards the middle of the ramp.
  vec4 tint = ramp(0.5 + 0.5 * dot(rel.xz, normalize(uAxis.xz)) / (across + r));
  float base = luma(uBase);
  // 0 on a dark base, 1 on a pastel one.
  float light = smoothstep(0.02, 0.25, base);
  float near = exp(-sq(across / (3.0 * r)));
  // Coloured light on the paper: the base filtered by the light, so a warm light turns
  // lavender pink instead of beige, and a dark base stays dark.
  vec3 lit = uBase * tint.rgb;
  vec4 layer = wash(atLuma(lit, base), (0.34 + 0.3 * near) * strength);
  // The backdrop deepens towards its top, and a little towards the front of the floor, in the
  // hue of the light that reaches it. The top is only partly filtered: a strong light (a yellow
  // on lavender, say) would otherwise sink into olive once darkened.
  float top = (1.0 - smoothstep(-0.05, 0.58, y));
  float front = smoothstep(0.82, 1.1, y);
  layer = over(wash(atLuma(uBase * pow(tint.rgb, vec3(0.7)), base * 0.55), 0.6 * top * strength), layer);
  layer = over(wash(atLuma(lit, base * 0.75), 0.3 * front * strength), layer);
  // The cove catches the light in a soft band just above the floor: a paler wash on a light
  // base; on a dark one, a glow in the light's own hue, since whitened it would read as haze.
  float band = exp(-sq((y - 0.6) / 0.12));
  vec3 pale = mix(mix(tint.rgb, atLuma(lit, 1.0), light), vec3(1.0), 0.45 * light);
  layer = over(wash(atLuma(pale, base * 1.5 + 0.06), (0.35 + 0.25 * light) * band * strength), layer);

  // The key lamp lights a broad pool on the paper around it; a surface turned away from it
  // still catches some, so the pool never breaks into a ring.
  vec3 toLamp = uLamp - p;
  float dist = length(toLamp);
  vec3 l = toLamp / dist;
  float shadow = sphereShadow(p, l, dist);
  float facing = mix(0.35, 1.0, smoothstep(-0.3, 0.6, dot(n, l)));
  float pool = exp(-0.5 * sq(dist / (mix(1.5, 3.6, light) * r))) * facing * (1.0 - shadow);
  vec3 keyTint = paletteColor(uPaletteSize - 1).rgb;
  // A pale warm light spread thin over a dark paper would sink to taupe or brown: there it
  // is a smaller, brighter and more saturated glow that falls off faster, so it reads as light.
  vec3 glow = atLuma(mix(pow(keyTint, vec3(2.4)), keyTint, light), mix(0.62, base * 1.45 + 0.2, light));
  layer = over(wash(glow, mix(0.85 * pool, 0.62, light) * pool * strength), layer);

  // Contact occlusion of a sphere over a plane, and the key's cast shadow. Shadows keep a
  // deep tint of the light that still reaches them, darkest at the contact.
  vec3 oc = c - p;
  float dc = length(oc);
  float ao = clamp(r * r * dot(n, oc) / (dc * dc * dc), 0.0, 1.0);
  float castShade = shadow * exp(-0.5 * sq(dist / (4.0 * r)));
  float shade = clamp(1.05 * pow(ao, 0.75) + 0.5 * castShade, 0.0, 1.0);
  layer = over(wash(atLuma(lit * sqrt(tint.rgb), base * mix(0.42, 0.17, ao)), shade * strength), layer);
  return layer * tint.a;
}

/** The sphere, matte and pearly, with its coverage of the pixel for a smooth silhouette. */
vec4 sphereLayer(vec3 ro, vec3 rd, float strength, float gain, out float cover) {
  vec3 c = uSphere.xyz;
  float r = uSphere.w;
  vec3 oc = ro - c;
  float along = -dot(oc, rd);
  float miss2 = max(dot(oc, oc) - along * along, 0.0);
  float pixel = along / (FOCAL * uResolution.y);
  cover = clamp(0.5 + (r - sqrt(miss2)) / pixel, 0.0, 1.0);
  if (cover <= 0.0) return vec4(0.0);
  // Just outside the silhouette the closest point of the ray stands in for the hit, so the
  // edge pixels get the rim's normal instead of nothing.
  vec3 n = normalize(ro + rd * (along - sqrt(max(r * r - miss2, 0.0))) - c);

  float edge = 1.0 - clamp(-dot(n, rd), 0.0, 1.0);
  float base = luma(uBase);
  float light = smoothstep(0.02, 0.25, base);
  // The palette runs across the sphere along the colour axis; the pearl slides it a little
  // further towards the key near the silhouette, like a thin film.
  vec4 body = ramp(0.5 + 0.5 * dot(n, uAxis) + 0.04 * edge * edge);
  vec3 keyTint = paletteColor(uPaletteSize - 1).rgb;
  float key = dot(n, uKey);
  float wrap = clamp((key + 0.45) / 1.45, 0.0, 1.0);
  // The underside faces the shadowed floor, more so as the sphere sinks towards it.
  float lift = (c.y - r) / r;
  float ground = (1.0 - smoothstep(-1.0, 0.15, n.y)) * mix(1.0, 0.6, clamp(lift / 0.25, 0.0, 1.0));
  // On a dark base the studio is dim and the key does more of the modelling.
  float ambient = mix(0.55, 0.9, light);
  vec3 color = body.rgb * (ambient + mix(0.5, 0.22, light) * wrap * wrap);
  // Matte velvet: towards the silhouette the surface glows pale, most on the side the key
  // leaves to the soft fill and under the overhead light, the key's own colour on its side.
  float sheen = pow(edge, 1.4) * (1.0 - ground);
  vec3 pale = mix(body.rgb, vec3(1.0), mix(0.35, 0.66, light)) * mix(0.7, 1.0, light);
  float keySide = smoothstep(0.0, 0.8, key);
  color = mix(color, pale, 0.9 * sheen * (1.0 - 0.45 * keySide));
  color = mix(color, pale, 0.4 * sq(max(n.y, 0.0)));
  color = mix(color, mix(keyTint, vec3(1.0), 0.25), 0.5 * sheen * keySide);
  // The underside deepens into the floor's shadow, saturated like the contact shadow.
  color = mix(color, body.rgb * body.rgb * 0.7 * ambient, 0.8 * ground);
  // The key grazes the rim on its side.
  color += keyTint * pow(edge, 3.0) * smoothstep(0.0, 0.9, key) * mix(0.8, 0.35, light);
  float alpha = cover * body.a * strength;
  return vec4(color * gain * alpha, alpha);
}

vec4 experiment(vec2 px) {
  vec3 ro = vec3(0.0, CAM_HEIGHT, 0.0);
  vec3 rd = cameraRay(px);
  float cover;
  vec4 layer = sphereLayer(ro, rd, min(uIntensity, 1.0), 1.0 + 0.3 * max(uIntensity - 1.0, 0.0), cover);
  if (cover < 1.0) {
    vec3 n;
    vec3 p = studio(ro, rd, n);
    layer = over(layer, studioLayer(p, n, px.y / uResolution.y, uIntensity));
  }
  // A faint static grain, like the paper and the print of the reference.
  layer.rgb *= 1.0 + 0.04 * (unit(hash(uint(px.x), uint(px.y), 7717u)) - 0.5);
  return layer;
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    const random = createSeededRandom(props.seed + 617);
    const start = random() * TAU;
    const bobOffset = random() * TAU;
    const shift = randomBetween(random, 0, SEED_SHIFT);
    const orbitPace = (props.speed * props.durationSeconds) / ORBIT_SECONDS;
    // A full orbit closes in whole turns, at most a third faster than asked; a cycle too short
    // for a calm one swings the lights to and fro instead, at the same mean pace. The shader
    // reads only the angle's cosine and sine.
    const angle = orbitPace >= 0.75
      ? start + wholeTurns(orbitPace) * phase
      : start + orbitPace * (Math.PI / 2) * Math.sin(phase);
    const bobPace = (props.speed * props.durationSeconds) / BOB_SECONDS;
    const bobTurns = wholeTurns(bobPace);
    // Short cycles still need a whole bob; a lower one keeps its pace calm.
    const reach = bobTurns > 0 ? Math.min(1, bobPace / bobTurns) : 1;
    const lift = 0.5 - 0.5 * Math.cos(bobTurns * phase + bobOffset);
    const radius = props.scale;
    const sphere = {
      x: REST.x + shift + GROW_SHIFT * (radius - 1),
      y: radius * (1 + LIFT.low + LIFT.rise * reach * lift),
      z: REST.z,
    };
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const lampReach = LAMP.reach * radius;
    const keyReach = Math.cos(KEY_ELEVATION.mid - KEY_ELEVATION.swing * sin) * lampReach;
    return [
      {kind: 'orbit', cos, sin, opacity: 1},
      {kind: 'sphere', ...sphere, radius, opacity: 1},
      {
        kind: 'lamp',
        x: sphere.x + cos * keyReach,
        y: sphere.y + LAMP.height * lampReach,
        z: smoothMin(sphere.z + sin * keyReach, STUDIO.wallZ - LAMP.wallGap, LAMP.soften),
        opacity: 1,
      },
    ];
  },
  uniforms: (scene, props) => {
    const [orbitCos, orbitSin] = pack(scene, 'orbit', ['cos', 'sin']) as [number, number];
    const toward = ({mid, swing}: {mid: number; swing: number}) => {
      const elevation = mid - swing * orbitSin;
      return [orbitCos * Math.cos(elevation), Math.sin(elevation), orbitSin * Math.cos(elevation)];
    };
    const palette = props.colors.map(parseColor).map(([r, g, b, a]) => [
      ...linearToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)), a,
    ]);
    return {
      uSphere: pack(scene, 'sphere', ['x', 'y', 'z', 'radius']),
      uKey: toward(KEY_ELEVATION),
      uAxis: toward(AXIS_ELEVATION),
      uLamp: pack(scene, 'lamp', ['x', 'y', 'z']),
      uRamp: Array.from({length: 6}, (_, index) => palette[Math.min(index, palette.length - 1)]!).flat(),
      uBase: parseColor(props.backgroundColor).slice(0, 3).map(srgbToLinear),
    };
  },
};
