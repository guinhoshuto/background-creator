import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../loop';
import {wholeTurns, type WebGLElement} from '../webgl/scene';
import type {StarfallSkyLoopProps} from '../StarfallSkyLoop';

export const WIDTH = 1920;
export const HEIGHT = 1080;
/** Uniform array sizes: the scene never lists more than this. */
export const MAX_BILLOWS = 128;
export const MAX_METEORS = 6;

/**
 * Paces at speed 1. The sea of clouds drifts and changes shape on closed circles in noise space
 * whose circumference is the distance the pace covers in the cycle (lattice units per second),
 * so the pace holds for any durationSeconds; the twinkle, the sway of the banks and the
 * breathing of their billows run whole turns per cycle.
 */
const SEA_DRIFT_PACE = 0.03;
const SEA_EVOLVE_PACE = 0.05;
const TWINKLE_SECONDS = 6;
const SWAY_SECONDS = 16;
const BREATH_SECONDS = 8;
const SWAY_PX = 7;
const BREATH = 0.025;

/** Seconds a shooting star takes to cross the sky, when the cycle has room for it. */
const METEOR_SECONDS = 2.4;
/** Longest trail at meteorSize 1, in px. */
const TRAIL_PX = 980;

/** Height of the horizon in px for a horizon share of the frame. */
export const horizonY = (horizon: number) => Math.round(horizon * HEIGHT);

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

type Billow = {x: number; y: number; radius: number; depth: number; bank: number};

/**
 * The skylines of the two cumulus banks at cloudBanks 1: points (x, height above the horizon),
 * from the bank's inner foot to past the frame edge. The right bank is the tall one, a low
 * shoulder that climbs into a tower; the left one is a lower mound, so the two frame the sky
 * without mirroring each other, and the middle of the frame stays open for the title.
 */
const SKYLINES = [
  [[1130, -10], [1210, 60], [1300, 112], [1400, 140], [1480, 178], [1540, 270], [1600, 352], [1690, 404], [1790, 426], [1880, 412], [1990, 430]],
  [[700, -10], [620, 42], [520, 86], [410, 118], [300, 170], [200, 214], [100, 232], [0, 222], [-80, 230]],
] as const;

/**
 * Discs along a polyline: each one sized by `radiusAt(height)` where it sits, and the next one a
 * share of that radius further along, so small discs pack closer than large ones.
 */
const walk = (
  points: readonly (readonly [number, number])[],
  radiusAt: (height: number) => number,
  step: (radius: number) => number,
) => {
  const spots: {x: number; height: number; radius: number}[] = [];
  let carried = 0;
  for (let i = 1; i < points.length; i++) {
    const [x0, h0] = points[i - 1]!;
    const [x1, h1] = points[i]!;
    const length = Math.hypot(x1 - x0, h1 - h0);
    let at = carried;
    while (at < length) {
      const t = at / length;
      const height = h0 + (h1 - h0) * t;
      const radius = radiusAt(height);
      spots.push({x: x0 + (x1 - x0) * t, height, radius});
      at += step(radius);
    }
    carried = at - length;
  }
  return spots;
};

/** The skyline's height above the horizon at x (0 outside the bank). */
const heightAt = (points: readonly (readonly [number, number])[], x: number) => {
  for (let i = 1; i < points.length; i++) {
    const [x0, h0] = points[i - 1]!;
    const [x1, h1] = points[i]!;
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    if (x >= lo && x <= hi) return h0 + ((h1 - h0) * (x - x0)) / (x1 - x0 || 1);
  }
  return 0;
};

/**
 * The billows of both banks at rest, from the seed: discs along each skyline, sized by the
 * height of the cloud under them, and bigger discs filling the body below. A disc lower on the
 * frame is nearer (larger depth), so the banks read as domes stacked in front of one another.
 */
export const layoutBillows = (props: Pick<StarfallSkyLoopProps, 'seed' | 'cloudBanks' | 'horizon'>): Billow[] => {
  if (props.cloudBanks <= 0) return [];
  const random = createSeededRandom(props.seed + 523);
  const horizon = horizonY(props.horizon);
  const tall = props.cloudBanks ** 0.8;
  const wide = 0.3 + 0.7 * props.cloudBanks;
  const billows: Billow[] = [];
  SKYLINES.forEach((skyline, bank) => {
    const edge = bank === 0 ? WIDTH : 0;
    const jitter = skyline.map(() => randomBetween(random, 0.88, 1.12));
    const points = skyline.map(([x, height], i) => [edge + (x - edge) * wide, height * tall * jitter[i]!] as const);
    const size = (height: number) => Math.max(30, Math.min(108, 26 + 0.26 * height) * (0.55 + 0.45 * tall));
    // The skyline: each disc's top touches the skyline.
    const spots = walk(
      points,
      (height) => size(height) * randomBetween(random, 0.82, 1.18),
      (radius) => radius * randomBetween(random, 0.62, 0.86),
    );
    for (const {x, height, radius} of spots) {
      const y = horizon - height + 0.58 * radius;
      if (y - radius > horizon + 8) continue;
      const depth = 0.32 * y + randomBetween(random, 0, 14);
      billows.push({x, y, radius, depth, bank});
      // Big puffs carry small ones on their upper rim, so the outline reads as cauliflower.
      if (radius < 52) continue;
      for (const lean of [randomBetween(random, -1.05, -0.35), randomBetween(random, 0.35, 1.05)]) {
        if (random() < 0.3) continue;
        const r = radius * randomBetween(random, 0.34, 0.5);
        const reach = radius - 0.55 * r;
        billows.push({x: x + reach * Math.sin(lean), y: y - reach * Math.cos(lean), radius: r, depth: depth + 0.2 * r, bank});
      }
    }
    // The body: rows of larger discs below the skyline, down into the haze at the horizon.
    const xs = points.map(([x]) => x);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    for (let x = left + 70 * wide; x < right; x += randomBetween(random, 120, 160) * wide) {
      const height = heightAt(points, x);
      if (height < 90 * tall) continue;
      for (let y = horizon - height + 1.25 * size(height); y < horizon + 10; y += randomBetween(random, 95, 125) * (0.6 + 0.4 * tall)) {
        const r = Math.min(150, size(height) * randomBetween(random, 1.15, 1.45));
        billows.push({x: x + randomBetween(random, -30, 30), y, radius: r, depth: 0.32 * y + randomBetween(random, 0, 14), bank});
      }
    }
  });
  if (billows.length > MAX_BILLOWS) {
    throw new Error(`The cloud banks laid out ${billows.length} billows; the shader holds ${MAX_BILLOWS}.`);
  }
  return billows;
};

/**
 * Progress of shooting star `index` in the cycle. Each star owns an equal slot: it waits, flies
 * across, fades out, then goes back to its start while invisible, all inside its slot, so at the
 * seam every star rests and every field keeps its velocity (zero).
 */
const meteorTiming = (cycle: number, index: number, count: number, offset: number, durationSeconds: number) => {
  const slot = 1 / count;
  const start = (index + offset) * slot;
  const flight = Math.min(METEOR_SECONDS / durationSeconds, 0.55 * slot);
  const end = start + flight;
  const back = end + 0.02 * slot;
  if (cycle < start) return {u: 0, back: 0};
  if (cycle <= end) return {u: (cycle - start) / flight, back: 0};
  return {u: 1, back: smoothstep(back, back + 0.06 * slot, cycle)};
};

/** Every animated value of the picture, from the props and the frame only. */
export const getStarfallSkyScene = (
  props: StarfallSkyLoopProps,
  frame: number,
  durationInFrames: number,
): WebGLElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  const cycle = phase / TAU;
  // Seconds of cloud motion at speed 1 in one cycle.
  const travel = props.speed * props.durationSeconds;
  const loop = travel > 0 ? 1 : 0;
  const random = createSeededRandom(props.seed + 401);
  const circle = (pace: number, offset: number) => {
    const radius = (travel * pace) / TAU;
    const angle = loop * phase + offset;
    return [radius * Math.cos(angle), radius * Math.sin(angle)] as const;
  };
  const [driftX, driftZ] = circle(SEA_DRIFT_PACE, random() * TAU);
  const [evolveX, evolveW] = circle(SEA_EVOLVE_PACE, random() * TAU);
  const twinkle = wholeTurns(travel / TWINKLE_SECONDS) * phase;
  const sway = wholeTurns(travel / SWAY_SECONDS) * phase;
  const breath = wholeTurns(travel / BREATH_SECONDS) * phase;

  const sky: WebGLElement = {
    kind: 'sky',
    twinkleCos: Math.cos(twinkle),
    twinkleSin: Math.sin(twinkle),
    twinkleCos2: Math.cos(2 * twinkle),
    twinkleSin2: Math.sin(2 * twinkle),
    opacity: 1,
  };
  const sea: WebGLElement = {kind: 'sea', driftX, driftZ, evolveX, evolveW, opacity: 1};

  const bankPhase = [random() * TAU, random() * TAU];
  const billows = layoutBillows(props).map((billow, index): WebGLElement => {
    const offset = (index * 2.399963) % TAU;
    return {
      kind: 'billow',
      x: billow.x + SWAY_PX * Math.sin(sway + bankPhase[billow.bank]!),
      y: billow.y + 1.5 * Math.sin(breath + offset + 1.3),
      radius: billow.radius * (1 + BREATH * Math.sin(breath + offset)),
      depth: billow.depth,
      opacity: 1,
    };
  });

  const meteorRandom = createSeededRandom(props.seed + 733);
  // Each star takes its own band of slopes and of end points, in an order the seed shuffles,
  // so no two stars of a cycle fly the same path.
  const slopeShift = Math.floor(meteorRandom() * props.meteorCount);
  const endShift = Math.floor(meteorRandom() * props.meteorCount);
  const band = (index: number, shift: number) =>
    (((index + shift) % props.meteorCount) + randomBetween(meteorRandom, 0.15, 0.85)) / props.meteorCount;
  const meteors = Array.from({length: props.meteorCount}, (_, index): WebGLElement => {
    const offset = randomBetween(meteorRandom, 0.12, 0.35);
    const angle = ((20 + 26 * band(index, slopeShift)) * Math.PI) / 180;
    // Where it burns out: over the open sky, above the banks.
    const endX = 760 + 740 * band(index, endShift);
    const endY = randomBetween(meteorRandom, 0.28, 0.55) * horizonY(props.horizon);
    const scale = props.meteorSize * randomBetween(meteorRandom, 0.85, 1.15);
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    // It starts above the frame, so it enters already moving.
    const travelMax = (endY + 160 * scale) / dirY;
    const {u, back} = meteorTiming(cycle, index, props.meteorCount, offset, props.durationSeconds);
    const ease = 0.3 * u + 0.7 * (1 - (1 - u) ** 2);
    const rest = 1 - back;
    return {
      kind: 'meteor',
      x0: endX - dirX * travelMax,
      y0: endY - dirY * travelMax,
      dirX,
      dirY,
      travelled: travelMax * ease * rest,
      trail: TRAIL_PX * scale * smoothstep(0, 0.3, u) * (1 - 0.45 * smoothstep(0.7, 1, u)) * rest,
      travelMax,
      burn: smoothstep(0.6, 0.95, u) * rest,
      width: scale,
      opacity: smoothstep(0, 0.06, u) * (1 - smoothstep(0.8, 1, u)),
    };
  });

  return [sky, sea, ...billows, ...meteors];
};
