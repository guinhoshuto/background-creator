/**
 * The galaxy print's GLSL, appended to the prelude: saturated clouds that fill the frame, a few
 * light cores that glow through them and dense white stars that twinkle. There is no single
 * galaxy, the picture is the all-over "galaxy" print, and no dark dust in front of the clouds:
 * its threads read as veins in marble, so the depth comes from the dark gaps between the masses.
 *
 * The composition stands still (where the masses, the hues, the cores and the stars sit), and so
 * do the big billows of the gas, its first two octaves: they sit where the approved print had them
 * at its first frame and only breathe in place, each place on its own small ellipse. The finer gas
 * flows through them on a still current, a prevailing drift with swirls, changing shape as it
 * goes. A flow can only loop by taking turns: the finer gas is drawn in two parts, each drifted for
 * its own age and faded in and out half a life apart from the other, beginning again somewhere
 * else in the noise only while it is invisible. The stars twinkle on whole turns. So the gas never
 * swings back, and the last frame runs into the first at the same speed.
 *
 * The palette is a ramp: the clouds run through the colours in order, the crests of the gas take
 * the neighbouring hue, and the cores are the local colour lightened towards white.
 */
export const GALAXY_GLSL = /* glsl */ `
// Where the big billows sit: the drift (xy) and the billow (zw) of the approved print's first
// frame, in cloud lattice units.
uniform vec4 uGasHome;
// Their warp's place (xy), how far the gas is warped, and a hue shift.
uniform vec4 uGasLook;
// Cosine and sine of the angle of the big billows' breathing.
uniform vec2 uChurn;
// The current the finer gas drifts on: a prevailing drift (xy, cloud lattice units per second of
// motion), the pace of its swirls and how fast the gas changes shape (noise depth per second).
uniform vec4 uCurrent;
// The gas clock (in lives), the lives per cycle it wraps at, and the seconds of motion in a life.
uniform vec3 uGasClock;
// Cosine and sine of the twinkle angle.
uniform vec2 uTwinkle;
// Strength of the clouds, of the stars and of the twinkle, and how far the content area calms.
uniform vec4 uLook;
// The light cores: centre (px), reach (px) and brightness. They stand still.
uniform vec4 uCores[3];

// Px per lattice unit of the clouds.
const float CLOUD_UNIT = 600.0;
// Overall gains of the clouds' light and of the stars, at full strength of their controls.
const float CLOUD_GAIN = 0.8;
const float STAR_GAIN = 0.875;
// How far, in lives, a broad still noise shifts the gas clock from place to place.
const float GAS_SHIFT = 0.7;
// How far the big billows breathe (cloud lattice units): about 13 px, at most about 40.
const float CHURN = 0.035;
// What fbm(p, NO_PERIOD, 5) and fbm(p, NO_PERIOD, 3) divide their octaves by.
const float FBM5_NORM = 0.96875;
const float FBM3_NORM = 0.875;

float sq(float x) { return x * x; }

/** A colour at full brightness: its largest channel is 1, so it only carries the hue. */
vec3 hueOf(vec3 c) { return c / max(max(max(c.r, c.g), c.b), 1e-4); }

/** The clouds' light at a place of the ramp: 0 is the first colour, 1 the last. */
vec3 cloudTint(float t) {
  vec4 c = paletteRamp(t);
  return c.rgb * c.a;
}

/**
 * How a star's light swells and fades, -1 to 1: two slow waves at whole multiples of the twinkle
 * angle (one to three, and two to five, times per turn) with phases from its hash, so each star
 * keeps its own uneven rhythm and the loop still closes.
 */
float twinkleOf(uint h, float angle) {
  uint r = pcg(h ^ 0x7FEB352Du);
  float first = float(1u + (r >> 8u) % 3u);
  float second = first + float(1u + (r >> 12u) % 2u);
  return 0.7 * cos(first * angle + unit(pcg(r)) * TAU) + 0.3 * cos(second * angle + unit(pcg(r ^ 0x9E3779B9u)) * TAU);
}

/**
 * Octaves first to last - 1 of fbm(p, NO_PERIOD, 5), not yet divided by its norm, and in y the
 * ones before split: the prelude's transforms between octaves, so octaves taken at different
 * places add up to one fbm.
 */
vec2 octaves(vec3 p, int first, int split, int last) {
  vec2 sum = vec2(0.0);
  float amplitude = 0.5;
  float period = NO_PERIOD;
  for (int octave = 0; octave < 5; octave++) {
    if (octave >= last) break;
    if (octave >= first) {
      float n = amplitude * perlin(p, period);
      sum.x += n;
      if (octave < split) sum.y += n;
    }
    p.xy = mat2(1.6, -1.2, 1.2, 1.6) * p.xy + vec2(19.19, 7.73);
    p.z *= 2.0;
    period *= 2.0;
    amplitude *= 0.5;
  }
  return sum;
}

/**
 * How far the big billows have breathed at c: each place runs round its own small ellipse, from
 * two broad still noises, and is back home when the churn angle is 0. So the clouds swell and
 * settle without the whole frame swaying together.
 */
vec2 churnAt(vec2 c) {
  vec3 s = vec3(0.6 * c + vec2(17.3, 5.9), 31.7);
  vec2 u = vec2(perlin(s, NO_PERIOD), perlin(s + vec3(41.1, 13.7, 3.3), NO_PERIOD));
  vec2 v = vec2(perlin(s + vec3(7.9, 29.3, 11.1), NO_PERIOD), perlin(s + vec3(23.3, 3.1, 17.9), NO_PERIOD));
  return CHURN * ((uChurn.x - 1.0) * u + uChurn.y * v);
}

/**
 * The current at a place, in cloud lattice units per second of motion: the prevailing drift plus
 * slow swirls, the curl of a broad noise, so the gas turns and eddies without piling up anywhere.
 * It stands still on the screen.
 */
vec2 currentAt(vec2 c) {
  const float STEP = 0.05;
  vec3 s = vec3(0.3 * c + vec2(23.1, 41.7), 13.3);
  float n = perlin(s, NO_PERIOD);
  vec2 slope = vec2(perlin(s + vec3(STEP, 0.0, 0.0), NO_PERIOD) - n, perlin(s + vec3(0.0, STEP, 0.0), NO_PERIOD) - n) * (0.3 / STEP);
  return uCurrent.xy + uCurrent.z * vec2(slope.y, -slope.x);
}

/**
 * Where one part of the gas is in its life, at a place whose clock runs shift lives ahead: its age
 * (0 to 1 of a life) and which life of the cycle it lives (0 to lives - 1). The second part runs
 * half a life behind the first. The half-step keeps the wrap away from an exact division, which a
 * GPU may round the wrong way (wrapCell in the prelude).
 */
vec2 gasLife(float shift, int part) {
  float position = uGasClock.x + 0.5 * float(part) + shift;
  float life = floor(position);
  return vec2(position - life, life - uGasClock.y * floor((life + 0.5) / uGasClock.y));
}

/** Where a life of a part of the gas begins in the noise (lattice units), from the seed. */
vec3 gasStart(float life, int part) {
  uint h = hash(uint(life), uint(part), 4513u);
  return 8.0 + 112.0 * vec3(unit(h), unit(pcg(h ^ 0x68E31DA4u)), unit(pcg(h ^ 0xB5297A4Du)));
}

/**
 * The finer gas of one part at c: octaves 2 to 4 of the gas where the part's life began, carried
 * along the current for its age (seconds of motion) and changing shape with it, bent by the big
 * billows' warp so the detail follows their shapes. Returns those octaves (x, not yet divided by
 * the norm), octave 2 alone (y, for the rims) and the finer wisps (z); gp is where it was sampled.
 */
vec3 gasDetail(vec2 c, vec2 flow, vec2 warp, vec3 start, float age, out vec3 gp) {
  vec2 m = c - flow * age + start.xy;
  gp = vec3(1.3 * m + warp, start.z + uCurrent.w * age);
  float fine = fbm(vec3(3.2 * gp.xy + vec2(7.0, 3.0), 2.0 * gp.z + 1.0), NO_PERIOD, 3);
  return vec3(octaves(gp, 2, 3, 5), fine);
}

/**
 * One layer of stars on a hashed grid of the screen: at most one star per cell, anywhere in it,
 * reaching at most half a cell, so the 2x2 cells nearest the pixel hold every star that can touch
 * it (the technique of the nebula's starLayer). Where the field is thin only part of the stars
 * show: each has a rank and fades in as the field passes it; the field changes little across one
 * star, so none is cut. With halo above 0 the brighter stars glow, and with spikes above 0 they
 * carry four-point spikes of about that length (px). Each star twinkles by up to depth (a share
 * of its light) on the twinkle angle; its glow and its spikes swell more than its point.
 */
vec3 starLayer(vec2 px, float cell, float share, uint salt, vec2 sigma, float depth, float angle, float field, float halo, float spikes) {
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
      float flicker = max(1.0 + depth * twinkleOf(h, angle), 0.0);
      // The glow swells more than the point, so a star that brightens seems to bloom.
      float bloom = flicker * flicker;
      float size = mix(sigma.x, sigma.y, magnitude);
      float star = exp(-sq(dist / size) * 0.5) * (0.15 + 0.85 * magnitude) * flicker;
      if (halo > 0.0) star += halo * (0.2 + 0.8 * magnitude) * exp(-dist / (4.0 + 12.0 * magnitude)) * bloom;
      if (spikes > 0.0) {
        float spikeLength = spikes * (0.35 + 0.65 * magnitude) * (0.7 + 0.3 * bloom);
        vec2 ad = abs(d);
        float rays = exp(-ad.y * ad.y / 0.72) * exp(-ad.x / spikeLength) + exp(-ad.x * ad.x / 0.72) * exp(-ad.y / spikeLength);
        star += 0.35 * rays * (0.3 + 0.7 * magnitude) * flicker;
      }
      // White, blue-white or warm, as stars are; a few lean towards the palette.
      float kind = unit(pcg(h ^ 0x3C6EF372u));
      vec3 tint = kind < 0.6 ? vec3(1.0) : (kind < 0.9 ? vec3(0.7, 0.8, 1.0) : vec3(1.0, 0.75, 0.5));
      int pick = int(unit(pcg(h ^ 0x51ED270Bu)) * float(uPaletteSize));
      tint = mix(tint, hueOf(paletteColor(pick).rgb), 0.25 * float((h & 3u) == 0u));
      light += tint * star * shown * (1.0 - smoothstep(0.6 * reach, reach, dist));
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
  float t = clamp(0.5 + 1.9 * perlin(vec3(0.5 * c + vec2(5.3, 1.7), 7.7), NO_PERIOD) + 0.2 * big + uGasLook.w, 0.0, 1.0);

  vec3 light = vec3(0.0);
  if (uLook.x > 0.0) {
    // The big billows: the first two octaves of the gas, sampled where the approved print had
    // them at its first frame and breathing in place, warped gently so they billow instead of
    // marbling.
    vec2 home = c + uGasHome.xy + churnAt(c);
    vec3 wv = vec3(0.8 * home + vec2(0.0, uGasLook.x), 11.0 + uGasLook.y);
    vec2 warp = uGasLook.z * vec2(fbm(wv, NO_PERIOD, 3), fbm(wv + vec3(5.2, 1.3, 9.7), NO_PERIOD, 3));
    vec3 gpHome = vec3(1.3 * home + warp + vec2(uGasHome.z, 0.0), uGasHome.w);
    float billows = octaves(gpHome, 0, 2, 2).x;

    // The finer gas and the wisps flow through them, in two parts that take turns. Each part
    // fades in and out over its life (sin² of its age, 0 when it begins), and a broad still noise
    // shifts the clock from place to place, so the parts never take turns all over the frame at
    // once. The weights are normalised by their squares, so the mix keeps the contrast of one
    // part: a plain cross-fade would flatten the detail halfway, twice per life.
    vec2 flow = currentAt(c);
    float shift = GAS_SHIFT * perlin(vec3(0.4 * c + vec2(61.3, 7.9), 29.1), NO_PERIOD);
    vec2 lifeA = gasLife(shift, 0);
    vec2 lifeB = gasLife(shift, 1);
    vec3 gpA;
    vec3 gpB;
    vec3 partA = gasDetail(c, flow, warp, gasStart(lifeA.y, 0), lifeA.x * uGasClock.z, gpA);
    vec3 partB = gasDetail(c, flow, warp, gasStart(lifeB.y, 1), lifeB.x * uGasClock.z, gpB);
    vec2 w = vec2(sq(sin(PI * lifeA.x)), sq(sin(PI * lifeB.x)));
    w *= inversesqrt(dot(w, w));
    vec3 detail = w.x * partA + w.y * partB;
    // Billows and detail add up to the five octaves of one fbm.
    float gas = (billows + detail.x) / FBM5_NORM;
    float body = masses * smoothstep(-0.4, 0.55, gas) * (0.7 + 0.6 * smoothstep(-0.35, 0.45, detail.z));
    float crest = masses * smoothstep(0.1, 0.7, gas);

    // Edges facing a core catch its light: the gas thickens away from the core there (its first
    // three octaves, a step towards the core and back).
    float rimStrength = min(length(rimDir), 1.0);
    float rim = 0.0;
    if (rimStrength > 0.02) {
      vec3 back = vec3(0.05 * normalize(rimDir), 0.0);
      float edge = billows - octaves(gpHome - back, 0, 2, 2).x
        + w.x * (partA.y - octaves(gpA - back, 2, 3, 3).x) + w.y * (partB.y - octaves(gpB - back, 2, 3, 3).x);
      rim = rimStrength * smoothstep(0.0, 0.12, edge / FBM3_NORM);
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
    light *= CLOUD_GAIN * uLook.x * (1.0 - 0.6 * calm);
  }

  // Stars, still on the screen: the fine layers gather where the masses are strong.
  float field = clamp(0.35 + 0.9 * masses + 0.5 * perlin(vec3(0.6 * c + vec2(2.3, 8.1), 4.2), NO_PERIOD), 0.2, 1.6);
  float twinkleDepth = uLook.z;
  float angle = atan(uTwinkle.y, uTwinkle.x);
  // White points have to outshine the clouds they sit on, so even the faint ones peak near 0.5.
  // The faintest dust twinkles least, so the field shimmers instead of boiling.
  vec3 stars = starLayer(px, 9.0, 0.36, 9127u, vec2(0.5, 0.65), 0.6 * twinkleDepth, angle, field, 0.0, 0.0) * 4.0;
  stars += starLayer(px, 26.0, 0.7, 7411u, vec2(0.6, 1.0), 0.9 * twinkleDepth, angle, field, 0.0, 0.0) * 5.0;
  stars += starLayer(px, 80.0, 0.45, 5521u, vec2(0.8, 1.4), 0.9 * twinkleDepth, angle, 2.0, 0.04, 0.0) * 4.0;
  stars += starLayer(px, 280.0, 0.4, 3319u, vec2(1.0, 1.8), 0.8 * twinkleDepth, angle, 2.0, 0.12, 16.0) * 6.0;
  light += stars * STAR_GAIN * uLook.y * (1.0 - 0.25 * calm);

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
