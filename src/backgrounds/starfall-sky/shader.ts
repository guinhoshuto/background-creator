import {buildFragmentShader} from '../webgl/glsl';

/**
 * The starfall sky in one fragment shader: a deep blue sky that brightens into a haze at the
 * horizon, stars, shooting stars that cross it behind the clouds, a sea of clouds seen from above
 * and two cumulus banks that frame the frame. The sky and the clouds are laid in sRGB, like the
 * reference they were measured on; light (stars, shooting stars, glows) adds in linear light.
 */
const STARFALL_SKY_GLSL = /* glsl */ `
// Sky colours in sRGB: the zenith, the middle of the sky and the sky just above the horizon.
uniform vec3 uSkyColors[3];
// Cloud colours in sRGB: the lit cloud, its shade and the sea between the cloud patches.
uniform vec3 uCloudColors[3];
// Horizon height and its bulge at the edges (px), the sky's opacity (0 in a transparent export)
// and the top of the cloud banks (px).
uniform vec4 uLayout;
// Star brightness and sea cover.
uniform vec2 uLook;
// Cosine and sine of the twinkle angle, and of twice that angle.
uniform vec4 uTwinkle;
// The sea's glide along the depth axis and that axis's period, then its change of shape along a
// third axis and that period, in lattice units: both run one way and close in whole periods.
uniform vec4 uSea;
// Billows of the banks: centre x, y and radius (px), and depth (larger is nearer).
uniform vec4 uBillows[128];
uniform int uBillowCount;
// Shooting stars: start of the path and direction; distance travelled, trail length, path length
// and burn-out; colour in linear light and opacity; width scale.
uniform vec4 uMeteorPath[6];
uniform vec4 uMeteorState[6];
uniform vec4 uMeteorLook[6];
uniform float uMeteorWidth[6];
uniform int uMeteorCount;

const int MAX_BILLOWS = 128;
const int MAX_METEORS = 6;
const int SPARKS = 24;
const int SHARDS = 10;
// Camera height over the sea (lattice units) and focal length (px): near patches span a third of
// the frame, far ones pack into streaks just below the horizon.
const float SEA_HEIGHT = 1.5;
const float SEA_FOCAL = 460.0;
// Light on the clouds: from the upper right, a little in front.
const vec3 LIGHT = vec3(0.42, 0.74, 0.53);
// Height difference (px) over which two puffs blend into one surface.
const float CREASE = 4.5;

float sq(float x) { return x * x; }
float peakOf(vec3 c) { return max(max(c.r, c.g), c.b); }

/** The horizon's height at x: the sea of clouds bulges a little, as seen from high up. */
float horizonAt(float x) {
  float u = (x - 0.5 * uResolution.x) / (0.5 * uResolution.x);
  return uLayout.x + uLayout.y * u * u;
}

/** The haze where the sky meets the sea of clouds, in sRGB. */
vec3 hazeColor() { return mix(uSkyColors[2], uCloudColors[0], 0.72); }

/**
 * The sky in sRGB, after the measured reference: the zenith eases into the middle colour by 55%
 * of the way down, the middle runs into the horizon colour by 93%, and the last stretch rises
 * steeply into the haze.
 */
vec3 skyAt(float y, float yh) {
  float f = clamp(y / yh, 0.0, 1.0);
  vec3 c = mix(uSkyColors[0], uSkyColors[1], pow(clamp(f / 0.55, 0.0, 1.0), 1.3));
  c = mix(c, uSkyColors[2], pow(clamp((f - 0.55) / 0.38, 0.0, 1.0), 1.1));
  return mix(c, hazeColor(), pow(smoothstep(0.9, 1.0, f), 1.5));
}

/** Keeps colours up to 0.8 as they are and rolls brighter ones off towards 1, whitening the hottest. */
vec3 rolloff(vec3 c) {
  float peak = peakOf(c);
  if (peak <= 0.8) return c;
  float mapped = 0.8 + 0.2 * (1.0 - exp(-(peak - 0.8) / 0.2));
  return mix(c * (mapped / peak), vec3(mapped), 0.6 * smoothstep(1.0, 4.0, peak));
}

/** cos(k * angle + phase) for the twinkle of one star: k is 1 or 2, picked by its hash. */
float twinkle(uint h) {
  float phase = unit(pcg(h ^ 0x7FEB352Du)) * TAU;
  vec2 angle = (h & 64u) == 0u ? uTwinkle.xy : uTwinkle.zw;
  return angle.x * cos(phase) - angle.y * sin(phase);
}

/**
 * One layer of stars on a hashed grid, as in the nebula experiment: at most one star per cell,
 * reaching at most half a cell, so the 2x2 cells nearest the pixel hold every star that can touch
 * it. glint (px) gives the brightest ones a halo and a four-pointed glint.
 */
vec3 starLayer(vec2 px, float cell, float share, uint salt, vec2 sigma, float depth, float glint) {
  vec3 light = vec3(0.0);
  vec2 base = floor(px / cell - 0.5);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 id = base + vec2(float(i), float(j)) + 64.0;
      uint h = hash(uint(id.x), uint(id.y), salt);
      if (unit(h) >= share) continue;
      vec2 at = (id - 64.0 + vec2(unit(pcg(h ^ 0x68E31DA4u)), unit(pcg(h ^ 0xB5297A4Du)))) * cell;
      vec2 d = px - at;
      float r2 = dot(d, d);
      float reach = 0.5 * cell;
      if (r2 >= reach * reach) continue;
      // Many faint stars and few bright ones.
      float magnitude = unit(pcg(h ^ 0x1B56C4E9u));
      magnitude *= magnitude * magnitude;
      float size = mix(sigma.x, sigma.y, magnitude);
      float flicker = 1.0 + depth * twinkle(h);
      float star = exp(-r2 / (2.0 * size * size)) * (0.15 + 0.85 * magnitude) * flicker;
      if (glint > 0.0) {
        float r = sqrt(r2);
        float halo = 0.08 * exp(-r / (4.0 + 9.0 * magnitude));
        float spike = glint * (0.35 + 0.65 * magnitude);
        vec2 a = abs(d);
        float spikes = exp(-a.y * a.y / 0.7) * exp(-a.x / spike) + exp(-a.x * a.x / 0.7) * exp(-a.y / spike);
        star += (halo + 0.3 * spikes) * (0.3 + 0.7 * magnitude) * flicker;
      }
      float fade = 1.0 - smoothstep(0.6 * reach, reach, sqrt(r2));
      // Most stars lean blue, like the sky they sit in; one in four is warm.
      vec3 tint = (h & 3u) == 0u ? vec3(1.0, 0.92, 0.8) : vec3(0.82, 0.9, 1.0);
      light += tint * star * fade;
    }
  }
  return light;
}

/**
 * Fractal noise over the sea's plane, periodic along the depth (y) and the shape axis (z) with the
 * given periods, and band-limited: an octave fades out before a pixel spans a quarter of its
 * period along the depth, where perspective packs the lattice tightest, so the far sea never
 * shimmers. Each octave doubles every axis and the periods with it, so the sum keeps them; the
 * offsets only shift the lattice, which keeps them too (a turn of the plane would not).
 */
float seaNoise(vec3 p, vec2 period, float footprint) {
  float sum = 0.0;
  float amplitude = 0.5;
  float norm = 0.0;
  float scale = 1.0;
  for (int octave = 0; octave < 5; octave++) {
    float keep = 1.0 - smoothstep(0.12, 0.35, footprint * scale);
    sum += amplitude * keep * perlin(p, vec3(NO_PERIOD, period * scale));
    norm += amplitude;
    p = 2.0 * p + vec3(19.19, 7.73, 3.1);
    scale *= 2.0;
    amplitude *= 0.5;
  }
  return sum / norm;
}

/**
 * The sea of clouds below the horizon, in sRGB: cloud patches over deep blue, hazing into the
 * horizon. It glides towards the viewer, one way, and a slow warp frays the patches into wisps;
 * their edges stay sharp near the viewer and soften with distance, where a pixel spans more of
 * the lattice.
 */
vec3 seaAt(vec2 px, float yh) {
  float dy = max(px.y - yh, 0.5);
  float z = SEA_HEIGHT * SEA_FOCAL / dy;
  float x = SEA_HEIGHT * (px.x - 0.5 * uResolution.x) / dy;
  float footprint = SEA_HEIGHT * SEA_FOCAL / (dy * dy);
  vec2 period = uSea.yw;
  // Patches stretch across the view, like cloud streets seen from above.
  vec3 p = vec3(0.42 * x, z + uSea.x, 7.0 + uSea.z);
  float warp = seaNoise(vec3(0.5 * p.x + 3.1, p.y + 7.7, p.z + 1.3), period, footprint);
  float n = seaNoise(p + vec3(0.7 * warp, 0.3 * warp, 0.0), period, footprint);
  float threshold = mix(0.3, -0.26, uLook.y);
  // A soft edge of a few pixels wherever the noise runs, wider where perspective packs the lattice.
  float edge = 2.0 * fwidth(n) + 0.012;
  float cover = smoothstep(threshold - edge, threshold + edge, n);
  float thick = smoothstep(threshold, threshold + 0.24, n);
  vec3 cloud = mix(mix(uCloudColors[2], uCloudColors[1], 0.55), uCloudColors[0], thick);
  // Each patch casts a faint shadow on the deep blue just below it, nearer the viewer.
  float under = smoothstep(threshold - 0.03, threshold + 0.05, seaNoise(p + vec3(0.7 * warp, 0.3 * warp - 0.1, 0.0), period, footprint));
  vec3 c = mix(uCloudColors[2] * mix(1.0, 0.88, under), cloud, cover);
  float fog = 1.0 - exp(-sq(z / 14.0));
  return mix(c, hazeColor(), fog);
}

/**
 * The cumulus banks: a union of discs (billows), each the dome of a sphere, nearer the lower it
 * sits. The dome heights blend with a smooth maximum, so where two puffs meet the surface turns
 * softly instead of cutting a seam, and a thin bright rim runs inside the outline on the lit
 * side. Returns the colour in sRGB, its coverage, the signed distance to the outline (px) and
 * the surface normal (y up).
 */
vec3 bankAt(vec2 px, float yh, out float coverage, out float outline, out vec3 surface) {
  coverage = 0.0;
  outline = 1e6;
  surface = vec3(0.0, 0.0, 1.0);
  if (uBillowCount == 0 || px.y < uLayout.w - 120.0) return vec3(0.0);
  // The outline, and the highest dome over the pixel, which keeps the soft maximum stable.
  float top = -1e9;
  for (int i = 0; i < MAX_BILLOWS; i++) {
    if (i >= uBillowCount) break;
    vec4 b = uBillows[i];
    float dist = length(px - b.xy);
    float gap = dist - b.z;
    outline = min(outline, gap);
    if (gap < 1.0) top = max(top, b.w + sqrt(max(b.z * b.z - dist * dist, 0.0)));
  }
  coverage = (1.0 - smoothstep(-0.8, 0.8, outline)) * (1.0 - smoothstep(yh - 4.0, yh + 26.0, px.y));
  if (coverage <= 0.0) return vec3(0.0);
  vec3 blended = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < MAX_BILLOWS; i++) {
    if (i >= uBillowCount) break;
    vec4 b = uBillows[i];
    vec2 d = px - b.xy;
    float dist = length(d);
    if (dist - b.z >= 1.0) continue;
    float h = sqrt(max(b.z * b.z - dist * dist, 0.0));
    float weight = exp((b.w + h - top) / CREASE);
    blended += weight * normalize(vec3(d.x, -d.y, h + 1e-3));
    total += weight;
  }
  surface = normalize(blended);
  // Each puff is lit on top and shaded underneath, with the light leaning in from the right: the
  // lit top of a nearer puff against the shaded underside of the one behind draws the puffs.
  vec3 light = normalize(LIGHT);
  float lit = smoothstep(-0.5, 0.25, surface.y + 0.35 * surface.x);
  vec3 c = mix(uCloudColors[1], uCloudColors[0], lit);
  vec2 side = surface.xy / max(length(surface.xy), 1e-4);
  float rim = exp(min(outline, 0.0) / 4.0) * max(dot(side, normalize(light.xy)), 0.0);
  c = mix(c, vec3(1.0), 0.55 * rim);
  // The foot of the bank dissolves into the haze at the horizon.
  return mix(c, hazeColor(), 0.8 * smoothstep(yh - 150.0, yh + 10.0, px.y));
}

float ndot(vec2 a, vec2 b) { return a.x * b.x - a.y * b.y; }

/** Signed distance to a rhombus with half-diagonals b (after Inigo Quilez). */
float rhombus(vec2 p, vec2 b) {
  p = abs(p);
  float h = clamp(ndot(b - 2.0 * p, b) / dot(b, b), -1.0, 1.0);
  float d = length(p - 0.5 * b * vec2(1.0 - h, 1.0 + h));
  return d * sign(p.x * b.y + p.y * b.x - b.x * b.y);
}

/**
 * Shooting star m: a white-hot head with a coloured halo and a four-pointed flare, a trail that
 * opens behind it with speed streaks along it, and sparks and shards shed along the path, which
 * fade as the head moves on. Adds its light to sky and its glow on the clouds to ambient.
 */
void meteor(int m, vec2 px, inout vec3 sky, inout vec3 ambient) {
  vec4 look = uMeteorLook[m];
  float opacity = look.a;
  if (opacity <= 0.0) return;
  vec4 path = uMeteorPath[m];
  vec4 state = uMeteorState[m];
  float w = uMeteorWidth[m];
  vec2 dir = path.zw;
  vec2 side = vec2(-dir.y, dir.x);
  vec2 head = path.xy + dir * state.x;
  float trail = max(state.y, 1.0);
  float burn = state.w;
  vec3 color = look.rgb;
  vec3 pale = mix(color, vec3(1.0), 0.6);
  vec2 d = px - head;
  float r = length(d);
  float behind = -dot(d, dir);
  float across = dot(d, side);
  vec3 light = vec3(0.0);

  // The trail: narrow at the head, opening and fading towards its end, with speed streaks.
  if (behind > -12.0 * w && behind < trail + 80.0 * w && abs(across) < 220.0 * w) {
    float u = clamp(behind / trail, 0.0, 1.0);
    float halfWidth = w * (6.0 + 64.0 * pow(u, 0.75));
    float q = across / halfWidth;
    float start = smoothstep(-6.0 * w, 14.0 * w, behind);
    float fade = pow(1.0 - u, 1.5) * start;
    float body = exp(-2.0 * q * q);
    float streaks = 0.45 + 0.55 * sq(0.5 + 0.5 * cos(q * 3.2 * PI + 1.3 + 2.4 * u));
    float veil = 0.25 * exp(-1.2 * abs(q));
    float core = exp(-sq(across / (2.6 * w))) * exp(-behind / (0.22 * trail)) * start;
    light += color * ((1.7 * body * streaks + veil) * fade) + pale * (0.9 * body * body * fade * (1.0 - u)) + vec3(1.8 * core);
  }

  // The head: a short cross of light and, as the star burns out, a burst of fine rays.
  float flare = 1.0 + 1.5 * burn;
  float point = 4.0 * exp(-r * r / sq(3.8 * w * flare));
  float halo = 0.9 * exp(-r / (22.0 * w * flare)) + 0.16 * exp(-r / (120.0 * w));
  vec2 a = abs(d);
  float spikes = exp(-sq(a.y / (1.1 * w))) * exp(-a.x / (60.0 * w * flare))
    + 0.6 * exp(-sq(a.x / (1.1 * w))) * exp(-a.y / (30.0 * w * flare));
  float rays = burn * pow(abs(cos(4.0 * atan(d.y, d.x) + 0.4)), 40.0) * exp(-r / (36.0 * w));
  light += vec3(point) + pale * (1.4 * spikes + 0.8 * rays) + color * halo;

  // Sparks: shed where the head passed, drifting apart and sinking a little as they fade.
  float spacing = state.z / float(SPARKS);
  float sparkLife = 0.75 * state.y + 1.0;
  for (int j = 0; j < SPARKS; j++) {
    uint h = hash(uint(m) * 131u + uint(j), 4219u);
    float at = (float(j) + unit(h)) * spacing;
    float age = state.x - at;
    if (age <= 0.0 || age >= sparkLife) continue;
    float spread = 2.0 * unit(pcg(h ^ 0x9E3779B9u)) - 1.0;
    vec2 pos = path.xy + dir * at + side * (spread * (6.0 + 0.06 * age) * w) + vec2(0.0, 0.04 * age);
    vec2 e = px - pos;
    float size = w * (0.9 + 1.5 * unit(pcg(h ^ 0x85EBCA6Bu)));
    float e2 = dot(e, e);
    if (e2 > sq(10.0 * size)) continue;
    float left = 1.0 - age / sparkLife;
    float sparkle = 0.65 + 0.35 * cos(0.045 * age + TAU * unit(pcg(h ^ 0xC2B2AE35u)));
    light += pale * (2.2 * exp(-e2 / sq(size)) * left * left * sparkle);
  }

  // Shards: thin crystal splinters thrown off the trail, turning slowly as they fade.
  float shardSpacing = state.z / float(SHARDS);
  float shardLife = 0.6 * state.y + 1.0;
  for (int j = 0; j < SHARDS; j++) {
    uint h = hash(uint(m) * 131u + uint(j), 8807u);
    float at = (float(j) + unit(h)) * shardSpacing;
    float age = state.x - at;
    if (age <= 0.0 || age >= shardLife) continue;
    float spread = 2.0 * unit(pcg(h ^ 0x9E3779B9u)) - 1.0;
    vec2 pos = path.xy + dir * at + side * (spread * (20.0 + 0.12 * age) * w) + vec2(0.0, 0.05 * age);
    vec2 e = px - pos;
    float reachOf = w * (6.0 + 11.0 * unit(pcg(h ^ 0x27D4EB2Fu)));
    if (dot(e, e) > sq(reachOf + 8.0 * w)) continue;
    float angle = TAU * unit(pcg(h ^ 0x165667B1u)) + 0.004 * age * sign(spread);
    vec2 axis = vec2(cos(angle), sin(angle));
    vec2 inShard = vec2(dot(e, axis), dot(e, vec2(-axis.y, axis.x)));
    float sd = rhombus(inShard, vec2(reachOf, reachOf * (0.18 + 0.2 * unit(pcg(h ^ 0xD3A2646Cu)))));
    float fill = 1.0 - smoothstep(-0.8, 0.8, sd);
    float edge = exp(-abs(sd) / (0.8 * w));
    float glow = 0.3 * exp(-max(sd, 0.0) / (4.0 * w));
    float left = 1.0 - age / shardLife;
    light += color * ((1.1 * fill + glow) * left) + pale * (0.9 * edge * left);
  }

  sky += light * opacity;
  ambient += color * (opacity * (0.55 + 0.6 * burn) * exp(-r / (240.0 * w)));
}

vec4 experiment(vec2 px) {
  float yh = horizonAt(px.x);
  vec3 haze = hazeColor();

  // Light in the sky, all of it behind the clouds: shooting stars, then stars.
  vec3 light = vec3(0.0);
  vec3 ambient = vec3(0.0);
  for (int m = 0; m < MAX_METEORS; m++) {
    if (m >= uMeteorCount) break;
    meteor(m, px, light, ambient);
  }
  float starsShown = uLook.x * (1.0 - smoothstep(0.25 * yh, 0.92 * yh, px.y));
  if (starsShown > 0.0) {
    vec3 stars = 0.55 * starLayer(px, 16.0, 0.22, 9127u, vec2(0.5, 0.7), 0.3, 0.0);
    stars += starLayer(px, 52.0, 0.4, 7411u, vec2(0.65, 1.0), 0.25, 0.0);
    stars += 2.0 * starLayer(px, 230.0, 0.32, 3319u, vec2(0.9, 1.5), 0.15, 8.0);
    light += stars * starsShown;
  }

  // The banks, and the soft glow they spread on the sky around them.
  float coverage;
  float outline;
  vec3 surface;
  vec3 bank = bankAt(px, yh, coverage, outline, surface);
  if (uBillowCount > 0) {
    float glow = exp(-max(outline, 0.0) / 30.0) * (1.0 - smoothstep(yh - 10.0, yh + 20.0, px.y));
    light += srgbToLinear(haze) * (0.16 * glow);
  }

  // The sky, or nothing in a transparent export, with the light over it.
  vec4 layer;
  if (uLayout.z > 0.5) {
    layer = vec4(rolloff(srgbToLinear(skyAt(px.y, yh)) + light), 1.0);
  } else {
    float peak = peakOf(light);
    float alpha = 1.0 - exp(-peak);
    layer = peak > 0.0 ? vec4(light * (alpha / peak), alpha) : vec4(0.0);
  }

  // The sea of clouds below the horizon, lit a little by a shooting star close to it.
  float below = smoothstep(yh - 0.75, yh + 0.75, px.y);
  if (below > 0.0) {
    vec3 sea = srgbToLinear(seaAt(px, yh)) + 0.18 * ambient;
    layer = mix(layer, vec4(rolloff(sea), 1.0), below);
  }

  // The banks in front of everything, their tops lit by a shooting star passing near.
  if (coverage > 0.0) {
    vec3 lit = srgbToLinear(bank) + ambient * (0.2 + 0.4 * max(surface.y, 0.0));
    layer = vec4(rolloff(lit), 1.0) * coverage + layer * (1.0 - coverage);
  }
  return layer;
}
`;

export const STARFALL_SKY_FRAGMENT_SHADER = buildFragmentShader(STARFALL_SKY_GLSL);
