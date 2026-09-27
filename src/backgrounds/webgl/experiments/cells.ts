import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../../loop';
import {pack, wholeTurns, type WebGLElement, type WebGLExperiment} from '../scene';

/** Paces at speed 1 of the tissue's warp and of its colour field, in noise units per second. */
const WARP_PACE = 0.06;
const TINT_PACE = 0.035;

/**
 * Living cells: a Voronoi tissue whose seed points drift on small closed orbits. Glowing
 * membranes run along the cell borders, each interior lights up from its wall inwards and
 * leaves a clear centre, and a few cells swell with light now and then.
 */
export const cells: WebGLExperiment = {
  glsl: /* glsl */ `
// Lattice tilt as (cos, sin): the rows of cells never line up with the frame.
uniform vec2 uLattice;
// Warp and colour fields travel along small closed circles in noise space (x offset, z), so
// their pace holds for any cycle length instead of rounding up to a whole noise period.
uniform vec2 uWarp;
uniform vec2 uTint;
// (cos, sin) of the main orbit angle, then of the epicycle angle (twice as many turns).
uniform vec4 uOrbit;
// Share of the full orbit radius: below 1 when the whole turns would outrun the asked pace.
uniform float uOrbitStride;
// (cos, sin) of the pulse angle.
uniform vec2 uPulse;

const float CELL_PX = 176.0;
// Sites sit on staggered rows (a honeycomb), ROW apart, each within 0.26 cell of its lattice
// spot. Up to 0.3 the nearest site is always among the 3x3 around the pixel, and every wall of
// its cell comes from the 16 spots around its own (brute-force checked over millions of
// jittered layouts), so the search never misses a wall and no border ever jumps.
const float ROW = 0.8660254;
const float JITTER = 0.16;
const float ORBIT_MAIN = 0.07;
const float ORBIT_EPI = 0.03;
// Low-frequency domain warp, in cell units: it bends the straight Voronoi edges into tissue.
const float WARP = 0.36;
const float PULSE_SHARE = 0.2;
// Smoothing of the pane's inner light, in cell units.
const float BEVEL = 0.07;
// Keeps lattice indices positive before they become hash inputs or parity bits.
const int INDEX_BIAS = 65536;

float rowShift(int row) { return ((row + INDEX_BIAS) & 1) == 1 ? 0.5 : 0.0; }
uint siteHash(ivec2 id) { return hash(uint(id.x + INDEX_BIAS), uint(id.y + INDEX_BIAS)); }

/** A seed point: a rest spot near its lattice spot plus a closed two-harmonic orbit. */
vec2 sitePosition(ivec2 id, uint h) {
  uint h1 = pcg(h ^ 0x9E3779B9u);
  uint h2 = pcg(h1);
  uint h3 = pcg(h2);
  float restAngle = unit(h) * TAU;
  vec2 rest = JITTER * sqrt(unit(h1)) * vec2(cos(restAngle), sin(restAngle));
  float phaseA = unit(h2) * TAU;
  float phaseB = unit(h3) * TAU;
  vec2 a = vec2(cos(phaseA), sin(phaseA));
  vec2 b = vec2(cos(phaseB), sin(phaseB));
  // Angle addition keeps every angle inside cos/sin: the orbit closes on the whole turns.
  vec2 loopA = vec2(uOrbit.x * a.x - uOrbit.y * a.y, uOrbit.y * a.x + uOrbit.x * a.y);
  vec2 loopB = vec2(uOrbit.z * b.x - uOrbit.w * b.y, uOrbit.w * b.x + uOrbit.z * b.y);
  float spin = (h3 & 1u) == 0u ? 1.0 : -1.0;
  loopA.y *= spin;
  loopB.y *= -spin;
  float reach = 0.6 + 0.4 * unit(pcg(h3));
  vec2 spot = vec2(float(id.x) + 0.5 + rowShift(id.y), (float(id.y) + 0.5) * ROW);
  return spot + rest + uOrbitStride * (ORBIT_MAIN * reach * loopA + ORBIT_EPI * loopB);
}

/** 0 for most cells; for a few, a soft swell of light once per pulse turn. */
float sitePulse(uint h) {
  uint g = pcg(h ^ 0x68E31DA4u);
  if (unit(g) >= PULSE_SHARE) return 0.0;
  float phase = unit(pcg(g)) * TAU;
  float wave = 0.5 + 0.5 * (uPulse.x * cos(phase) - uPulse.y * sin(phase));
  return wave * wave * wave;
}

/** A cell's own nudge along the palette, so neighbours of one hue family still differ. */
float siteShade(uint h) { return (unit(pcg(h ^ 0xB5297A4Du)) - 0.5) * 0.3; }

/** The slow colour field: neighbouring cells share a family of hues that drifts over time. */
float tintField(vec2 q) {
  return 0.5 + 0.95 * perlin(vec3(q * 0.21 + vec2(uTint.x, 0.0), uTint.y), NO_PERIOD);
}

vec4 over(vec4 below, vec3 color, float alpha) { return vec4(color * alpha, alpha) + below * (1.0 - alpha); }

vec4 experiment(vec2 px) {
  float cellPx = CELL_PX * uScale;
  vec2 q = mat2(uLattice.x, uLattice.y, -uLattice.y, uLattice.x) * ((px - 0.5 * uResolution) / cellPx);
  vec3 w = vec3(q * 0.3 + vec2(uWarp.x, 0.0), uWarp.y);
  q += WARP * vec2(fbm(w, NO_PERIOD, 2), fbm(w + vec3(17.3, -9.1, 0.0), NO_PERIOD, 2));
  // Pixels per cell unit where this pixel sits, warp included, for widths in pixels.
  float pxPerUnit = 2.0 / (length(dFdx(q)) + length(dFdy(q)));

  int homeRow = int(floor(q.y / ROW));
  float nearest = 1e9;
  ivec2 nearId = ivec2(0, homeRow);
  vec2 nearPos = q;
  uint nearHash = 0u;
  for (int j = -1; j <= 1; j++) {
    int row = homeRow + j;
    int column = int(floor(q.x - rowShift(row)));
    for (int i = -1; i <= 1; i++) {
      ivec2 id = ivec2(column + i, row);
      uint h = siteHash(id);
      vec2 s = sitePosition(id, h);
      float d = dot(s - q, s - q);
      if (d < nearest) { nearest = d; nearId = id; nearPos = s; nearHash = h; }
    }
  }

  float pulse = sitePulse(nearHash);
  float shade = siteShade(nearHash);
  // Distance to the cell wall (exact, not F2 - F1, so the membrane keeps one width). Each wall
  // carries the mean of its two cells, weighted by closeness, so the membrane colour and glow
  // meet themselves on both sides of the line.
  float wall = 1e9;
  float rimShade = 0.0;
  float rimPulse = 0.0;
  float rimLight = 0.0;
  float rimWeight = 0.0;
  float bevel = 0.0;
  float sharp = cellPx / 9.0;
  float nearShift = rowShift(nearId.y);
  for (int j = -2; j <= 2; j++) {
    int row = nearId.y + j;
    // Same-parity rows: the spots 0 and 1 across. Rows in between: the spots 0.5 and 1.5 across.
    bool between = j == -1 || j == 1;
    int first = between ? nearId.x - 2 + (rowShift(row) < nearShift ? 1 : 0) : nearId.x - 1;
    for (int i = 0; i < 4; i++) {
      if (i == 3 && !between) break;
      ivec2 id = ivec2(first + i, row);
      if (id == nearId) continue;
      uint h = siteHash(id);
      vec2 s = sitePosition(id, h);
      float e = dot(0.5 * (nearPos + s) - q, normalize(s - nearPos));
      wall = min(wall, e);
      float weight = exp(-e * sharp);
      rimShade += weight * 0.5 * (shade + siteShade(h));
      rimPulse += weight * 0.5 * (pulse + sitePulse(h));
      // Each wall has its own strength; the XOR of the two hashes is the same from both sides.
      rimLight += weight * (0.4 + 0.6 * unit(pcg(nearHash ^ h)));
      rimWeight += weight;
      bevel += exp(-e / BEVEL);
    }
  }
  rimShade /= rimWeight;
  rimPulse /= rimWeight;
  rimLight /= rimWeight;

  vec2 homeSpot = vec2(float(nearId.x) + 0.5 + rowShift(nearId.y), (float(nearId.y) + 0.5) * ROW);
  vec4 own = paletteLoop(tintField(homeSpot) + shade);
  vec4 rim = paletteLoop(tintField(q) + rimShade);

  float wallPx = wall * pxPerUnit;
  float centrePx = sqrt(nearest) * pxPerUnit;
  float thin = sqrt(uScale);
  // Some regions of the tissue glow more than others, drifting with the colour field.
  float region = 0.4 + 0.6 * smoothstep(-0.4, 0.45,
    perlin(vec3(q * 0.15 + vec2(5.3 + uTint.x, 5.3), uTint.y), NO_PERIOD));
  // Everything fades to nothing before the middle of a quiet cell: its centre stays clear.
  float reach = 1.0 - smoothstep(0.14 * cellPx, 0.36 * cellPx, wallPx);

  // The pane lights up from its walls by a soft minimum of the wall distances: a plain minimum
  // creases along the lines from the corners to the middle.
  float softWall = max(0.0, -BEVEL * log(bevel)) * pxPerUnit;
  float inner = exp(-softWall / (0.13 * cellPx)) * reach;
  // A pulse fills the whole pane, strongest around its moving centre, so it swells as one.
  float swell = exp(-0.5 * pow(centrePx / (0.24 * cellPx), 2.0));
  float fill = (0.28 * inner + pulse * (0.12 + 0.2 * inner + 0.2 * swell)) * region;
  float nucleus = exp(-0.5 * pow(centrePx / (0.07 * cellPx), 2.0)) * 0.35 * pulse * region;
  // Where two walls meet, their weights add up: the corners of the cells glow a little more.
  float node = smoothstep(1.15, 2.0, rimWeight);
  float glow = (0.5 * exp(-wallPx / (6.0 * thin)) + 0.16 * exp(-wallPx / (24.0 * thin)) * reach + 0.3 * node)
    * region * rimLight * (0.85 + 0.45 * rimPulse);
  float lineHalf = 0.75 * thin;
  float core = (1.0 - smoothstep(lineHalf - 0.75, lineHalf + 0.75, wallPx)) * (0.45 + 0.45 * region) * (0.55 + 0.45 * rimLight);

  vec3 paneColor = mix(own.rgb, rim.rgb, exp(-wallPx / (5.0 * thin)));
  vec3 coreColor = rim.rgb + (1.0 - rim.rgb) * 0.15;
  float gain = uIntensity;
  vec4 layer = vec4(0.0);
  layer = over(layer, paneColor, clamp(fill * gain, 0.0, 1.0) * own.a);
  layer = over(layer, mix(own.rgb, vec3(1.0), 0.1), clamp(nucleus * gain, 0.0, 1.0) * own.a);
  layer = over(layer, rim.rgb, clamp(glow * gain, 0.0, 1.0) * rim.a);
  layer = over(layer, coreColor, clamp(core * gain, 0.0, 1.0) * rim.a);
  return layer;
}
`,
  scene: (props, frame, durationInFrames): WebGLElement[] => {
    const phase = loopPhase(frame, durationInFrames);
    // Seconds of motion at speed 1 in one cycle: every pace below is derived from it, so the
    // picture moves at the same rhythm whatever durationSeconds is.
    const travel = props.speed * props.durationSeconds;
    const loop = travel > 0 ? 1 : 0;
    // One closed turn per cycle around a circle as long as the distance the pace covers.
    const circle = (pace: number, offset: number) => {
      const radius = (travel * pace) / TAU;
      const angle = loop * phase + offset;
      return {x: radius * Math.cos(angle), z: radius * Math.sin(angle)};
    };
    const flow = createSeededRandom(props.seed + 401);
    const warp = circle(WARP_PACE, flow() * TAU);
    const tint = circle(TINT_PACE, flow() * TAU);
    const orbitTurns = wholeTurns(travel / 16);
    // A cycle shorter than one base orbit still needs a whole turn: a smaller orbit keeps the
    // points at the asked pace instead of spinning faster.
    const stride = orbitTurns > 0 ? Math.min(1, travel / 16 / orbitTurns) : 1;
    const pulseTurns = wholeTurns(travel / 5.5);
    const random = createSeededRandom(props.seed + 419);
    const tilt = randomBetween(random, -0.5, 0.5);
    const orbitOffset = random() * TAU;
    const epicycleOffset = random() * TAU;
    const pulseOffset = random() * TAU;
    const orbit = orbitTurns * phase + orbitOffset;
    const epicycle = 2 * orbitTurns * phase + epicycleOffset;
    const pulse = pulseTurns * phase + pulseOffset;
    return [
      {kind: 'lattice', cos: Math.cos(tilt), sin: Math.sin(tilt), opacity: 1},
      {kind: 'warp', x: warp.x, z: warp.z, opacity: 1},
      {kind: 'tint', x: tint.x, z: tint.z, opacity: 1},
      {
        kind: 'orbit', cos: Math.cos(orbit), sin: Math.sin(orbit),
        cosEpicycle: Math.cos(epicycle), sinEpicycle: Math.sin(epicycle), stride, opacity: 1,
      },
      {kind: 'pulse', cos: Math.cos(pulse), sin: Math.sin(pulse), opacity: 1},
    ];
  },
  uniforms: (scene) => ({
    uLattice: pack(scene, 'lattice', ['cos', 'sin']),
    uWarp: pack(scene, 'warp', ['x', 'z']),
    uTint: pack(scene, 'tint', ['x', 'z']),
    uOrbit: pack(scene, 'orbit', ['cos', 'sin', 'cosEpicycle', 'sinEpicycle']),
    uOrbitStride: pack(scene, 'orbit', ['stride']),
    uPulse: pack(scene, 'pulse', ['cos', 'sin']),
  }),
};
