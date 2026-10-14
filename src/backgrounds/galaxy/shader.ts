/**
 * The galaxy print's GLSL, appended to the prelude: saturated clouds that fill the frame, a few
 * light cores that glow through them, dark dust that breaks them into islands, and dense white
 * stars that twinkle. There is no single galaxy: the picture is the all-over "galaxy" print.
 *
 * The composition stands still (where the masses, the hues, the cores and the stars sit) and the
 * gas drifts inside it on closed circles through the noise, one turn per cycle, so the last frame
 * runs into the first at the same speed. The dust drifts faster than the gas, so it reads nearer.
 *
 * The palette is a ramp: the clouds run through the colours in order, the crests of the gas take
 * the neighbouring hue, and the cores are the local colour lightened towards white.
 */
export const GALAXY_GLSL = /* glsl */ `
// The gas's drift (xy) and billow (zw) circles, in cloud lattice units.
uniform vec4 uChurn;
// The gas's warp circle (xy), the warp strength and a hue shift.
uniform vec4 uWarp;
// Cosine and sine of the twinkle angle, and of twice that angle.
uniform vec4 uTwinkle;
// Strength of the clouds, of the stars and of the twinkle, and how far the content area calms.
uniform vec4 uLook;
// The light cores: centre (px), reach (px) and brightness. They stand still.
uniform vec4 uCores[3];

// Px per lattice unit of the clouds.
const float CLOUD_UNIT = 600.0;
// The dust drifts this much further than the gas in the same cycle: it reads as nearer.
const float DUST_PARALLAX = 1.6;

float sq(float x) { return x * x; }

/** A colour at full brightness: its largest channel is 1, so it only carries the hue. */
vec3 hueOf(vec3 c) { return c / max(max(max(c.r, c.g), c.b), 1e-4); }

/** The clouds' light at a place of the ramp: 0 is the first colour, 1 the last. */
vec3 cloudTint(float t) {
  vec4 c = paletteRamp(t);
  return c.rgb * c.a;
}

/** cos(k * angle + phase) for the twinkle of one star: k is 1 or 2, picked by its hash. */
float twinkleOf(uint h) {
  float phase = unit(pcg(h ^ 0x7FEB352Du)) * TAU;
  vec2 angle = (h & 64u) == 0u ? uTwinkle.xy : uTwinkle.zw;
  return angle.x * cos(phase) - angle.y * sin(phase);
}

/**
 * One layer of stars on a hashed grid of the screen: at most one star per cell, anywhere in it,
 * reaching at most half a cell, so the 2x2 cells nearest the pixel hold every star that can touch
 * it (the technique of the nebula's starLayer). Where the field is thin only part of the stars
 * show: each has a rank and fades in as the field passes it; the field changes little across one
 * star, so none is cut. With halo above 0 the brighter stars glow, and with spikes above 0 they
 * carry four-point spikes of about that length (px).
 */
vec3 starLayer(vec2 px, float cell, float share, uint salt, vec2 sigma, float depth, float field, float halo, float spikes) {
  vec3 light = vec3(0.0);
  vec2 base = floor(px / cell - 0.5);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 id = base + vec2(float(i), float(j)) + 64.0;
      uint h = hash(uint(id.x), uint(id.y), salt);
      if (unit(h) >= share) continue;
      vec2 at = (id - 64.0 + vec2(unit(pcg(h ^ 0x68E31DA4u)), unit(pcg(h ^ 0xB5297A4Du)))) * cell;
      vec2 d = px - at;
      float dist = length(d);
      float reach = 0.5 * cell;
      if (dist >= reach) continue;
      float rank = unit(pcg(h ^ 0x2C1B3C6Du));
      float shown = smoothstep(rank - 0.15, rank + 0.15, (field - 0.1) / 1.3);
      if (shown <= 0.0) continue;
      // Many faint stars and few bright ones.
      float magnitude = unit(pcg(h ^ 0x1B56C4E9u));
      magnitude *= magnitude * magnitude;
      float flicker = 1.0 + depth * twinkleOf(h);
      float size = mix(sigma.x, sigma.y, magnitude);
      float star = exp(-sq(dist / size) * 0.5) * (0.15 + 0.85 * magnitude);
      if (halo > 0.0) star += halo * (0.2 + 0.8 * magnitude) * exp(-dist / (4.0 + 12.0 * magnitude));
      if (spikes > 0.0) {
        float spikeLength = spikes * (0.35 + 0.65 * magnitude) * (0.9 + 0.1 * flicker);
        vec2 ad = abs(d);
        float rays = exp(-ad.y * ad.y / 0.72) * exp(-ad.x / spikeLength) + exp(-ad.x * ad.x / 0.72) * exp(-ad.y / spikeLength);
        star += 0.35 * rays * (0.3 + 0.7 * magnitude);
      }
      // White, blue-white or warm, as stars are; a few lean towards the palette.
      float kind = unit(pcg(h ^ 0x3C6EF372u));
      vec3 tint = kind < 0.6 ? vec3(1.0) : (kind < 0.9 ? vec3(0.7, 0.8, 1.0) : vec3(1.0, 0.75, 0.5));
      int pick = int(unit(pcg(h ^ 0x51ED270Bu)) * float(uPaletteSize));
      tint = mix(tint, hueOf(paletteColor(pick).rgb), 0.25 * float((h & 3u) == 0u));
      light += tint * star * shown * flicker * (1.0 - smoothstep(0.6 * reach, reach, dist));
    }
  }
  return light;
}

vec4 experiment(vec2 px) {
  vec2 c = (px - 0.5 * uResolution) / CLOUD_UNIT;
  float calm = uLook.w * plateWeight(px);

  // The light cores: each lights the clouds around it (halo) and glows in its heart (inner); the
  // strong ones also light the cloud edges that face them, along rimDir (from the cores outwards).
  float halo = 0.0;
  float inner = 0.0;
  vec2 rimDir = vec2(0.0);
  for (int i = 0; i < 3; i++) {
    vec4 core = uCores[i];
    vec2 d = px - core.xy;
    float r = length(d) / core.z;
    float glow = core.w * exp(-1.6 * r);
    halo += glow;
    inner += core.w * exp(-9.0 * r * r);
    rimDir += glow * d / max(length(d), 1.0);
  }

  // Where the masses sit and which hue they take: still, so the composition holds while the gas
  // drifts inside it. A core never glows in empty sky.
  float big = fbm(vec3(0.5 * c, 3.1), NO_PERIOD, 3);
  float masses = max(smoothstep(-0.5, 0.25, big), min(0.85 * halo, 1.0));
  float t = clamp(0.5 + 1.9 * perlin(vec3(0.5 * c + vec2(5.3, 1.7), 7.7), NO_PERIOD) + 0.2 * big + uWarp.w, 0.0, 1.0);

  vec3 light = vec3(0.0);
  vec3 trans = vec3(1.0);
  if (uLook.x > 0.0) {
    // The gas: fractal noise on slow circles, warped gently so it billows instead of marbling.
    vec2 m = c + uChurn.xy;
    vec3 wv = vec3(0.8 * m + vec2(0.0, uWarp.x), 11.0 + uWarp.y);
    vec2 warp = vec2(fbm(wv, NO_PERIOD, 3), fbm(wv + vec3(5.2, 1.3, 9.7), NO_PERIOD, 3));
    vec3 gp = vec3(1.3 * m + uWarp.z * warp + vec2(uChurn.z, 0.0), uChurn.w);
    float gas = fbm(gp, NO_PERIOD, 5);
    // Wisps finer than the gas, so the clouds keep a texture where they are bright.
    float fine = fbm(vec3(3.2 * gp.xy + vec2(7.0, 3.0), 2.0 * gp.z + 1.0), NO_PERIOD, 3);
    float body = masses * smoothstep(-0.4, 0.55, gas) * (0.7 + 0.6 * smoothstep(-0.35, 0.45, fine));
    float crest = masses * smoothstep(0.1, 0.7, gas);

    // Edges facing a core catch its light: the gas thickens away from the core there.
    float rimStrength = min(length(rimDir), 1.0);
    float rim = 0.0;
    if (rimStrength > 0.02) {
      vec2 back = 0.05 * normalize(rimDir);
      rim = rimStrength * smoothstep(0.0, 0.12, fbm(gp, NO_PERIOD, 3) - fbm(gp - vec3(back, 0.0), NO_PERIOD, 3));
    }

    vec3 tint = cloudTint(t);
    vec3 near = cloudTint(clamp(t + 0.22, 0.0, 1.0));
    // The body peaks between 1 and 2, or it reads dark once the light becomes alpha.
    light = tint * (0.12 + 0.12 * masses + 2.0 * body + 0.6 * body * body)
      + near * 1.6 * crest * crest
      + mix(near, vec3(1.0), 0.3) * 0.9 * rim * masses;
    light *= 1.0 + 1.2 * halo;
    // The core's heart: the local colour lightened, shining through the gas, so it keeps its texture.
    light += mix(tint, vec3(1.0), 0.5) * 2.2 * inner * (0.15 + 0.85 * smoothstep(-0.3, 0.6, gas));

    // Dust in front of the masses: crisp clumps and, in some places, thin threads; thinner in the
    // cores' hearts. What it lets through leans violet, never brown.
    vec2 dg = 1.3 * (c + DUST_PARALLAX * uChurn.xy) + uWarp.z * warp;
    float clumps = fbm(vec3(2.4 * dg + vec2(41.0, 17.0), 23.0 + 0.8 * uChurn.w), NO_PERIOD, 4);
    float threads = 1.0 - abs(fbm(vec3(1.4 * dg + vec2(17.0, 3.0), 5.0 + 0.6 * uChurn.w), NO_PERIOD, 4));
    float threadMask = smoothstep(0.0, 0.4, perlin(vec3(0.4 * dg + vec2(9.1, 2.6), 6.3), NO_PERIOD));
    float depth = 2.6 * (smoothstep(0.1, 0.32, clumps) + 0.8 * threadMask * smoothstep(0.9, 0.985, threads))
      * masses * (1.0 - 0.6 * min(inner, 1.0));
    trans = exp(-depth * vec3(1.0, 1.2, 0.8));
    light *= trans * uLook.x * (1.0 - 0.6 * calm);
  }

  // Stars, still on the screen: the fine layers gather where the masses are strong, and the dust
  // in front dims them.
  float field = clamp(0.35 + 0.9 * masses + 0.5 * perlin(vec3(0.6 * c + vec2(2.3, 8.1), 4.2), NO_PERIOD), 0.2, 1.6);
  float twinkleDepth = uLook.z;
  // White points have to outshine the clouds they sit on, so even the faint ones peak near 0.25.
  vec3 stars = starLayer(px, 9.0, 0.26, 9127u, vec2(0.45, 0.6), 0.15 * twinkleDepth, field, 0.0, 0.0) * 1.6;
  stars += starLayer(px, 26.0, 0.42, 7411u, vec2(0.55, 0.9), 0.35 * twinkleDepth, field, 0.0, 0.0) * 3.0;
  stars += starLayer(px, 80.0, 0.45, 5521u, vec2(0.8, 1.4), 0.45 * twinkleDepth, 2.0, 0.04, 0.0) * 4.0;
  stars += starLayer(px, 280.0, 0.4, 3319u, vec2(1.0, 1.8), 0.3 * twinkleDepth, 2.0, 0.12, 16.0) * 6.0;
  light += stars * uLook.y * (0.25 + 0.75 * trans.g) * (1.0 - 0.25 * calm);

  float peak = max(max(light.r, light.g), light.b);
  if (peak <= 0.0) return vec4(0.0);
  // Soft highlight roll-off: faint gas stays as it is, the cores and star centres bloom to white.
  // The transparent export is this same layer.
  float mapped = 1.0 - exp(-peak);
  vec3 color = light * (mapped / peak);
  color = mix(color, vec3(mapped), 0.5 * smoothstep(0.9, 3.5, peak));
  return vec4(color, mapped);
}
`;
