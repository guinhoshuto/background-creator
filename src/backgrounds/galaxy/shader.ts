/**
 * The galaxy's GLSL, appended to the prelude: one inclined two-armed spiral, off centre, that
 * turns half a turn every 16 s at speed 1, over coloured clouds and distant galaxies, under a
 * twinkling field of stars.
 *
 * A rigid turn closes the loop only at a multiple of the picture's symmetry. The arms, the bulge
 * and the bar are symmetric under half a turn (two arms, like NGC 1300), so they turn as they are.
 * The detail (clumps, dust threads, knots, the disc's own stars) is not: each neighbourhood swaps
 * it with its twin half a turn away, X(q)·(1 − b) + X(−q)·b with b = L(tau + n(q)), where
 * L(s) = 0.5 − 0.5·cos(πs) and n(−q) = n(q). After k half turns q has become −q and b has become
 * 1 − b (k odd) or stayed (k even), so the last frame runs into the first at the same speed; n
 * staggers the swap, so no pulse crosses the disc.
 *
 * Roles of the palette: 0 the core, 1 the arms, 2 the knots, 3 on the clouds (from 2 on).
 */
export const GALAXY_GLSL = /* glsl */ `
// The cycle: cosine and sine of its angle, the half turns the disc makes in it, unused.
uniform vec4 uLoop;
// The disc: centre (px), radius (px) and the cosine of its tilt.
uniform vec4 uDisc;
// The long axis on screen (unit, y down), the bar and the tangent of the arms' pitch angle.
uniform vec4 uShape;
// The clouds' drift (xy) and billow (zw) circles, in cloud lattice units.
uniform vec4 uChurn;
// The clouds' warp circle (xy), the warp strength and a hue shift.
uniform vec4 uWarp;
// Cosine and sine of the twinkle angle, and of twice that angle.
uniform vec4 uTwinkle;
// Strength of the clouds, of the stars and of the twinkle, and how far the content area calms.
uniform vec4 uLook;

// Px per lattice unit of the clouds.
const float CLOUD_UNIT = 540.0;
// Cells of the disc's own points, in disc radii: its stars (2x2 lookup) and its knots (3x3),
// and the least px either cell spans along the disc's short axis on screen, so a star stays
// round and wider than a pixel (a narrower one would blink as it turns past the pixel grid).
const float DISC_STAR_CELL = 0.025;
const float KNOT_CELL = 0.06;
const float DISC_STAR_CELL_PX = 7.4;
const float KNOT_CELL_PX = 18.0;

float sq(float x) { return x * x; }

/** Turns a vector by x radians (counterclockwise with y up). */
mat2 turn(float x) { return mat2(cos(x), sin(x), -sin(x), cos(x)); }

/** The angle of v, also where v is zero (atan(0, 0) is undefined in GLSL). */
float angleOf(vec2 v) { return atan(v.y, abs(v.x) + abs(v.y) > 0.0 ? v.x : 1.0); }

/** The light of a palette role: its colour times its alpha. */
vec3 roleColor(int i) {
  vec4 c = paletteColor(i);
  return c.rgb * c.a;
}

/** A colour at full brightness: its largest channel is 1, so it only carries the hue. */
vec3 hueOf(vec3 c) { return c / max(max(max(c.r, c.g), c.b), 1e-4); }

/** Where the arms live along the radius: from just past the core (or the bar's ends) to the rim. */
float armReach(float r) {
  float start = mix(0.13, 0.4, uShape.z);
  return smoothstep(0.6 * start, 1.25 * start, r) * (1.0 - smoothstep(0.85, 1.4, r));
}

/** The arms' phase at a point of the turning frame: 0 on a crest, growing inwards. */
float armPhase(vec2 q, float wiggle) {
  return 2.0 * (angleOf(q) - log(max(length(q), 0.03)) / uShape.w) + wiggle;
}

/**
 * Screen px of a point of the disc given in the turning frame (disc radii): back to the plane of
 * the disc, then foreshortened by the tilt. A point drawn here stays round whatever the tilt.
 */
vec2 discToScreen(vec2 s, float spin) {
  vec2 g = turn(-spin) * s;
  vec2 a = vec2(g.x, g.y * uDisc.w) * uDisc.z;
  vec2 along = uShape.xy;
  return uDisc.xy + a.x * along + a.y * vec2(-along.y, along.x);
}

/**
 * The disc's own stars: one at most per cell of a hashed grid on the plane of the disc, looked
 * up around c, the pixel's place in the turning frame (or its twin -q, with flip -1, which draws
 * each star at -s). A star reaches at most half a cell along the disc's short axis on screen,
 * so the 2x2 cells nearest c hold every star that can touch the pixel.
 */
float discStars(vec2 px, vec2 c, float flip, float spin, float cell, float reachPx) {
  float light = 0.0;
  vec2 base = floor(c / cell - 0.5);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 id = base + vec2(float(i), float(j));
      uint h = hash(uint(int(id.x) + 4096), uint(int(id.y) + 4096), 7717u);
      if (unit(h) >= 0.6) continue;
      vec2 s = (id + vec2(unit(pcg(h ^ 0x68E31DA4u)), unit(pcg(h ^ 0xB5297A4Du)))) * cell;
      float dist = length(px - discToScreen(flip * s, spin));
      if (dist >= reachPx) continue;
      float magnitude = unit(pcg(h ^ 0x1B56C4E9u));
      magnitude *= magnitude;
      float size = min(mix(0.55, 1.2, magnitude), reachPx / 3.0);
      light += exp(-sq(dist / size) * 0.5) * (0.2 + 0.8 * magnitude) * (1.0 - smoothstep(0.6 * reachPx, reachPx, dist));
    }
  }
  return light;
}

/**
 * Knots of star formation strung along the outer edge of the arms (role 2) and blue-white
 * clusters inside them, on a hashed grid of the disc plane like the disc's stars, with a 3x3
 * lookup. Each is masked by the arms where it sits, never where the pixel is, so it stays whole;
 * many are small and a few large.
 */
vec3 knots(vec2 px, vec2 c, float flip, float spin, float wiggle, float cell, float reachPx) {
  vec3 light = vec3(0.0);
  vec2 base = floor(c / cell) - 1.0;
  vec3 pink = roleColor(2);
  vec3 cluster = mix(vec3(1.0), hueOf(roleColor(1)), 0.45);
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      vec2 id = base + vec2(float(i), float(j));
      uint h = hash(uint(int(id.x) + 4096), uint(int(id.y) + 4096), 3313u);
      if (unit(h) >= 0.75) continue;
      vec2 s = flip * (id + vec2(unit(pcg(h ^ 0x68E31DA4u)), unit(pcg(h ^ 0xB5297A4Du)))) * cell;
      float dist = length(px - discToScreen(s, spin));
      if (dist >= reachPx) continue;
      float psi = armPhase(s, wiggle);
      bool isKnot = unit(pcg(h ^ 0x51ED270Bu)) < 0.7;
      float mask = isKnot ? pow(max(0.5 + 0.5 * cos(psi + 0.55), 0.0), 6.0) : pow(max(0.5 + 0.5 * cos(psi), 0.0), 3.5);
      mask *= armReach(length(s));
      if (mask <= 0.0) continue;
      float magnitude = unit(pcg(h ^ 0x1B56C4E9u));
      magnitude *= magnitude;
      float size = min(mix(1.6, 5.5, magnitude), reachPx / 3.0);
      float spot = exp(-sq(dist / size) * 0.5) * (1.0 - smoothstep(0.6 * reachPx, reachPx, dist));
      light += (isKnot ? pink : cluster) * spot * mask * mix(0.45, 1.8, magnitude);
    }
  }
  return light;
}

/** cos(k * angle + phase) for the twinkle of one star: k is 1 or 2, picked by its hash. */
float twinkleOf(uint h) {
  float phase = unit(pcg(h ^ 0x7FEB352Du)) * TAU;
  vec2 angle = (h & 64u) == 0u ? uTwinkle.xy : uTwinkle.zw;
  return angle.x * cos(phase) - angle.y * sin(phase);
}

/**
 * One layer of field stars on a hashed grid of the screen: at most one star per cell, anywhere
 * in it, reaching at most half a cell, so the 2x2 cells nearest the pixel hold every star that
 * can touch it (the technique of the nebula's starLayer). With spikes above 0, the brighter
 * stars carry four-point spikes of about that length (px).
 */
vec3 starLayer(vec2 px, float cell, float share, uint salt, vec2 sigma, float depth, float spikes) {
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
      // Many faint stars and few bright ones.
      float magnitude = unit(pcg(h ^ 0x1B56C4E9u));
      magnitude *= magnitude * magnitude;
      float size = mix(sigma.x, sigma.y, magnitude);
      float star = exp(-sq(dist / size) * 0.5) * (0.15 + 0.85 * magnitude);
      if (spikes > 0.0) {
        float halo = 0.06 * exp(-dist / (5.0 + 10.0 * magnitude));
        float spikeLength = spikes * (0.35 + 0.65 * magnitude);
        vec2 ad = abs(d);
        float rays = exp(-ad.y * ad.y / 0.72) * exp(-ad.x / spikeLength) + exp(-ad.x * ad.x / 0.72) * exp(-ad.y / spikeLength);
        star += (halo + 0.35 * rays) * (0.3 + 0.7 * magnitude);
      }
      // White, blue-white or orange, as stars are; a few lean towards the palette.
      float kind = unit(pcg(h ^ 0x3C6EF372u));
      vec3 tint = kind < 0.45 ? vec3(1.0) : (kind < 0.78 ? vec3(0.66, 0.78, 1.0) : vec3(1.0, 0.66, 0.36));
      int pick = int(unit(pcg(h ^ 0x51ED270Bu)) * float(uPaletteSize));
      tint = mix(tint, hueOf(paletteColor(pick).rgb), 0.25 * float((h & 3u) == 0u));
      light += tint * star * (1.0 + depth * twinkleOf(h)) * (1.0 - smoothstep(0.6 * reach, reach, dist));
    }
  }
  return light;
}

/**
 * Galaxies far beyond: small faint ovals at every angle, cream or blue-white, one at most per
 * cell of a hashed grid; each spans 3 to 11 px, well inside half a cell.
 */
vec3 distantGalaxies(vec2 px) {
  const float cell = 170.0;
  vec3 light = vec3(0.0);
  vec2 base = floor(px / cell - 0.5);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 id = base + vec2(float(i), float(j)) + 64.0;
      uint h = hash(uint(id.x), uint(id.y), 5521u);
      if (unit(h) >= 0.5) continue;
      vec2 at = (id - 64.0 + 0.15 + 0.7 * vec2(unit(pcg(h ^ 0x68E31DA4u)), unit(pcg(h ^ 0xB5297A4Du)))) * cell;
      float major = mix(3.0, 11.0, sq(unit(pcg(h ^ 0x1B56C4E9u))));
      float minor = max(major * mix(0.25, 0.8, unit(pcg(h ^ 0x51ED270Bu))), 1.6);
      vec2 d = turn(-PI * unit(pcg(h ^ 0x2C1B3C6Du))) * (px - at);
      float e = sq(d.x / (0.5 * major)) + sq(d.y / (0.5 * minor));
      if (e >= 16.0) continue;
      vec3 tint = (h & 2u) == 0u ? vec3(1.0, 0.8, 0.58) : vec3(0.76, 0.85, 1.0);
      light += tint * mix(0.1, 0.35, unit(pcg(h ^ 0x3C6EF372u))) * (0.7 * exp(-2.0 * e) + 0.3 * exp(-8.0 * e));
    }
  }
  return light;
}

/** The clouds' colour: a ramp through the palette from role 2 on (the last colour when short). */
vec3 cloudTint(float t) {
  int first = min(2, uPaletteSize - 1);
  float x = clamp(t, 0.0, 1.0) * float(uPaletteSize - 1 - first);
  int i = int(floor(x));
  vec4 c = mix(paletteColor(first + i), paletteColor(first + i + 1), smoothstep(0.0, 1.0, x - float(i)));
  return c.rgb * c.a;
}

/**
 * The coloured gas of the sky, the "galaxy print": domain-warped clouds with dark dust (the
 * nebula's technique) on slow circles through the noise, gathered towards the edges of the frame
 * and thinner over the galaxy (r, in disc radii), so the disc stands out.
 */
vec3 cloudLight(vec2 px, float r) {
  vec2 c = (px - 0.5 * uResolution) / CLOUD_UNIT;
  vec2 edge = abs(px - 0.5 * uResolution) / (0.5 * uResolution);
  float rim = pow(pow(edge.x, 3.0) + pow(edge.y, 3.0), 1.0 / 3.0);
  float masses = perlin(vec3(0.75 * c + vec2(13.1, 4.7), 5.3), NO_PERIOD);
  float envelope = smoothstep(0.1, 0.8, 0.75 * masses + 0.7 * smoothstep(0.3, 1.3, rim) + 0.05);
  envelope *= 0.3 + 0.7 * smoothstep(0.35, 1.2, r);
  if (envelope <= 0.0) return vec3(0.0);

  vec2 m = c + uChurn.xy;
  vec3 wv = vec3(0.8 * m + vec2(0.0, uWarp.x), 11.0 + uWarp.y);
  vec2 warp = vec2(fbm(wv, NO_PERIOD, 3), fbm(wv + vec3(5.2, 1.3, 9.7), NO_PERIOD, 3));
  vec2 gq = 1.25 * m + uWarp.z * warp;
  float gas = fbm(vec3(gq + vec2(uChurn.z, 0.0), uChurn.w), NO_PERIOD, 5);
  float dustNoise = fbm(vec3(1.6 * gq + vec2(41.0 + 1.6 * uChurn.z, 17.0), 23.0 + uChurn.w), NO_PERIOD, 4);
  float hueNoise = perlin(vec3(0.45 * m + 0.25 * warp, 3.0 + 0.5 * uChurn.w), NO_PERIOD);

  float density = envelope * smoothstep(-0.3, 0.45, gas + 0.25 * envelope - 0.1);
  float bright = envelope * smoothstep(0.2, 0.6, gas + 0.1 * envelope);
  float dust = smoothstep(-0.05, 0.3, dustNoise) * smoothstep(0.15, 0.7, envelope);
  float t = clamp(0.5 + 0.9 * hueNoise + 0.5 * warp.x + uWarp.w, 0.0, 1.0);
  vec3 light = cloudTint(t) * (1.1 * density * density + 0.12 * density)
    + cloudTint(clamp(t + 0.35, 0.0, 1.0)) * 1.6 * bright * bright;
  return light * (1.0 - 0.85 * dust);
}

vec4 experiment(vec2 px) {
  // The cycle (0…1) from its angle's cosine and sine, so no uniform jumps at the seam; the disc
  // turns k half turns in it (spin), and the swap of the detail runs k times (tau).
  float u = fract(atan(uLoop.y, uLoop.x) / TAU + 1.0);
  float spin = uLoop.z * PI * u;
  float tau = uLoop.z * u;

  // The disc: a (disc radii as seen, along and across the long axis), g (on the plane of the
  // disc, undoing the tilt) and q (the frame that turns with it).
  float R = uDisc.z;
  float cosTilt = uDisc.w;
  vec2 along = uShape.xy;
  vec2 p = px - uDisc.xy;
  vec2 a = vec2(dot(p, along), dot(p, vec2(-along.y, along.x))) / R;
  vec2 g = vec2(a.x, a.y / cosTilt);
  float r = length(g);
  vec2 q = turn(spin) * g;
  float calm = uLook.w * plateWeight(px);

  vec3 galaxy = vec3(0.0);
  vec3 trans = vec3(1.0);
  if (r < 1.6) {
    // The arms: a logarithmic spiral of two arms with a gentle wiggle, symmetric under half a
    // turn (the second term repeats every half turn of the angle).
    float lr = log(max(r, 0.03));
    float tanPitch = uShape.w;
    float wiggle = 0.5 * perlin(vec3(1.8 * lr + 3.0, 3.7, 1.3), NO_PERIOD)
      + 0.35 * perlin(vec3(3.0 * angleOf(q) / PI, 1.4 * lr, 5.9), vec3(3.0, NO_PERIOD, NO_PERIOD));
    float psi = armPhase(q, wiggle);
    float arm = pow(max(0.5 + 0.5 * cos(psi), 0.0), 3.5);
    // Dust along the inner edge of each arm (psi above the crest).
    float lane = pow(max(0.5 + 0.5 * cos(psi - 0.75), 0.0), 10.0);
    float reach = armReach(r);

    // The swap with the twin: b runs from 0 to 1 and back at a different time in every
    // neighbourhood. Noise mixed this way is rescaled to keep its contrast, except near the
    // centre, where q and -q meet and the mix is the noise itself.
    float stagger = 1.5 * (perlin(vec3(1.7 * q + 5.0, 2.9), NO_PERIOD) + perlin(vec3(5.0 - 1.7 * q, 2.9), NO_PERIOD));
    float b = 0.5 - 0.5 * cos(PI * (tau + stagger));
    float keep = mix(1.0, inversesqrt(sq(1.0 - b) + sq(b)), smoothstep(0.05, 0.25, r));
    // The detail lives in a frame that unwinds the spiral, so clumps stretch along the arms.
    // It is cartesian: the prelude's fbm turns the plane between octaves, so it cannot repeat
    // along an angle. Unwinding shears the plane, packing the noise about 3.6 times tighter
    // across the arms: the finest octave stays above 6 px there even foreshortened by the tilt,
    // so the detail does not shimmer as it turns.
    vec2 w = turn(-max(lr, -2.3) / tanPitch) * q;
    float clump = keep * mix(fbm(vec3(3.0 * w + 7.0, 1.9), NO_PERIOD, 3), fbm(vec3(7.0 - 3.0 * w, 1.9), NO_PERIOD, 3), b);
    float threads = keep * mix(fbm(vec3(5.5 * w + 3.0, 6.1), NO_PERIOD, 2), fbm(vec3(3.0 - 5.5 * w, 6.1), NO_PERIOD, 2), b);
    float patches = keep * mix(perlin(vec3(2.2 * q + 11.0, 4.4), NO_PERIOD), perlin(vec3(11.0 - 2.2 * q, 4.4), NO_PERIOD), b);

    // Light: a smooth disc from cream (inside) to blue (outside), the arms brighter where they
    // clump, and a faint outer sheet. An inclined disc gathers more light per pixel.
    float tiltGain = inversesqrt(cosTilt);
    vec3 core = roleColor(0);
    vec3 blue = roleColor(1);
    vec3 discColor = mix(core, blue, smoothstep(0.1, 0.8, r));
    float discGlow = exp(-r / 0.24) * (1.0 - smoothstep(0.6, 1.3, r));
    float clumpy = smoothstep(-0.25, 0.45, clump);
    float armLight = arm * reach * exp(-r / 0.62) * (0.25 + 1.5 * clumpy * clumpy) * (0.8 + 0.5 * patches);
    float sheet = exp(-r / 0.5) * (1.0 - smoothstep(0.9, 1.6, r));
    galaxy = tiltGain * (discColor * (0.5 * discGlow + 0.06 * sheet) + blue * 1.1 * armLight);

    // Dust: the lanes, heavier where the arm clumps, and feathered threads across the disc,
    // cleared near the nucleus. It reddens what it dims.
    float depth = 2.4 * lane * reach * max(0.55 + 0.8 * clump, 0.0)
      + 0.8 * smoothstep(0.08, 0.5, threads) * reach * (0.4 + arm);

    // The bar (optional): straight, along the arms' crest at its ends, with dust lanes on the
    // leading edges; it turns with the disc.
    if (uShape.z > 0.0) {
      float barAngle = log(0.4) / tanPitch - 0.25 * perlin(vec3(1.8 * log(0.4) + 3.0, 3.7, 1.3), NO_PERIOD);
      vec2 bq = turn(-barAngle) * q;
      galaxy += uShape.z * tiltGain * core * 0.9 * exp(-pow(abs(bq.x) / 0.4, 3.0) - sq(bq.y / 0.085));
      depth += 1.8 * uShape.z * exp(-sq((bq.y + 0.06 * sign(bq.x)) / 0.02))
        * smoothstep(0.05, 0.12, abs(bq.x)) * (1.0 - smoothstep(0.3, 0.42, abs(bq.x)));
    }
    depth *= smoothstep(0.05, 0.18, r);
    trans = exp(-depth * vec3(0.75, 1.0, 1.3));

    // The disc's stars and knots turn with it and swap with their twins, each one whole: the
    // handover is sharper than the noise's, so few are caught halfway.
    float stay = 1.0 - smoothstep(0.3, 0.7, b);
    float minorPx = R * cosTilt;
    float starCell = max(DISC_STAR_CELL, DISC_STAR_CELL_PX / minorPx);
    float knotCell = max(KNOT_CELL, KNOT_CELL_PX / minorPx);
    float density = 0.6 * discGlow + armLight;
    float discStarLight = stay * discStars(px, q, 1.0, spin, starCell, 0.5 * starCell * minorPx)
      + (1.0 - stay) * discStars(px, -q, -1.0, spin, starCell, 0.5 * starCell * minorPx);
    galaxy += tiltGain * mix(discColor, vec3(1.0), 0.5) * 0.9 * density * discStarLight;
    galaxy += stay * knots(px, q, 1.0, spin, wiggle, knotCell, knotCell * minorPx)
      + (1.0 - stay) * knots(px, -q, -1.0, spin, wiggle, knotCell, knotCell * minorPx);
    galaxy *= trans;

    // The bulge is a ball: nearly round on screen, with a white-hot nucleus a few px across. On
    // the near side the disc's dust passes in front of it.
    vec2 bulgeAt = vec2(a.x, a.y / mix(1.0, cosTilt, 0.3));
    float rb = length(bulgeAt);
    float bulge = 1.1 * exp(-rb / 0.04) + 0.7 * exp(-sq(rb / 0.14)) + 0.12 * exp(-rb / 0.42) + 3.0 * exp(-sq(rb * R / 5.0));
    galaxy += core * bulge * mix(vec3(1.0), trans, smoothstep(-0.02, 0.1, a.y));
  }

  // The sky behind the disc, dimmed by its dust: clouds and distant galaxies.
  vec3 light = galaxy * (1.0 - 0.45 * calm);
  if (uLook.x > 0.0) light += cloudLight(px, r) * trans * uLook.x * (1.0 - 0.75 * calm);
  light += distantGalaxies(px) * trans * (1.0 - 0.25 * calm);

  // Field stars, in front of everything: faint, medium, and bright ones with spikes.
  float twinkleDepth = uLook.z;
  vec3 stars = starLayer(px, 12.0, 0.2, 9127u, vec2(0.5, 0.72), 0.5 * twinkleDepth, 0.0) * 0.6;
  stars += starLayer(px, 44.0, 0.45, 7411u, vec2(0.65, 1.05), 0.4 * twinkleDepth, 0.0) * 1.1;
  stars += starLayer(px, 230.0, 0.32, 3319u, vec2(0.9, 1.6), 0.24 * twinkleDepth, 9.0) * 2.4;
  light += stars * uLook.y * (1.0 - 0.25 * calm);

  float peak = max(max(light.r, light.g), light.b);
  if (peak <= 0.0) return vec4(0.0);
  // Soft highlight roll-off: faint gas stays as it is, the core and star centres bloom to white.
  // The transparent export is this same layer.
  float mapped = 1.0 - exp(-peak);
  vec3 color = light * (mapped / peak);
  color = mix(color, vec3(mapped), 0.5 * smoothstep(0.9, 3.5, peak));
  return vec4(color, mapped);
}
`;
