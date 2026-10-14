import {createSeededRandom, loopPhase, randomBetween, TAU} from '../../loop';
import {wholeTurns, type WebGLElement} from '../webgl/scene';
import type {StarfallSkyLoopProps} from '../StarfallSkyLoop';

export const WIDTH = 1920;
export const HEIGHT = 1080;
/** Uniform array sizes: the scene never lists more than this. */
export const MAX_BILLOWS = 128;
export const MAX_METEORS = 6;

/**
 * Paces at speed 1. The sea of clouds glides towards the viewer along the depth axis and changes
 * shape along a third noise axis, both one way only, in lattice units per second; each axis is
 * periodic and the cycle covers exactly one period, so nothing comes back the way it went. The
 * twinkle and the breathing of the billows run whole turns per cycle; the banks stay where they
 * are, far off over the sea.
 */
const SEA_GLIDE_RATE = 0.4;
const SEA_EVOLVE_RATE = 0.06;
/**
 * The shortest depth period: the near sea, where patches read, spans about one period at 4, so
 * a short cycle glides a little faster rather than repeat the patches in sight.
 */
const SEA_LEAST_PERIOD = 4;
const TWINKLE_SECONDS = 6;
const BREATH_SECONDS = 8;
const BREATH = 0.025;

/** Pace of a shooting star, in px per second, when its slot has room for it. */
const METEOR_PACE = 800;
/** Longest trail at meteorSize 1, in px. */
const TRAIL_PX = 980;
/** Where the shooting stars reach the horizon: from the left bank's foot to behind the right one. */
const LANDING = {from: 520, to: 1750} as const;

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
const meteorTiming = (cycle: number, index: number, count: number, offset: number, seconds: number) => {
  const slot = 1 / count;
  const start = (index + offset) * slot;
  const flight = Math.min(seconds, 0.55 * slot);
  const end = start + flight;
  const back = end + 0.02 * slot;
  if (cycle < start) return {u: 0, back: 0};
  if (cycle <= end) return {u: (cycle - start) / flight, back: 0};
  return {u: 1, back: smoothstep(back, back + 0.06 * slot, cycle)};
};

const fract = (value: number) => value - Math.floor(value);

/**
 * A position that runs one way along a periodic noise axis and covers exactly one period per
 * cycle: the period is the travel the pace asks for, rounded to a whole number and at least
 * `least`. The start lies between 20% and 80% of the period, so the wrap of the value never falls
 * on the seam. With speed 0 the position holds.
 */
const glide = (travel: number, rate: number, least: number, random: () => number, cycle: number) => {
  const period = Math.max(least, Math.round(travel * rate));
  const start = 0.2 + 0.6 * random();
  return {period, position: period * fract(start + (travel > 0 ? cycle : 0))};
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
  const random = createSeededRandom(props.seed + 401);
  const depth = glide(travel, SEA_GLIDE_RATE, SEA_LEAST_PERIOD, random, cycle);
  const shape = glide(travel, SEA_EVOLVE_RATE, 1, random, cycle);
  const twinkle = wholeTurns(travel / TWINKLE_SECONDS) * phase;
  const breath = wholeTurns(travel / BREATH_SECONDS) * phase;

  const sky: WebGLElement = {
    kind: 'sky',
    twinkleCos: Math.cos(twinkle),
    twinkleSin: Math.sin(twinkle),
    twinkleCos2: Math.cos(2 * twinkle),
    twinkleSin2: Math.sin(2 * twinkle),
    opacity: 1,
  };
  const sea: WebGLElement = {
    kind: 'sea', glide: depth.position, glidePeriod: depth.period, evolve: shape.position, evolvePeriod: shape.period, opacity: 1,
  };

  const billows = layoutBillows(props).map((billow, index): WebGLElement => {
    const offset = (index * 2.399963) % TAU;
    return {
      kind: 'billow',
      x: billow.x,
      y: billow.y + 1.5 * Math.sin(breath + offset + 1.3),
      radius: billow.radius * (1 + BREATH * Math.sin(breath + offset)),
      depth: billow.depth,
      opacity: 1,
    };
  });

  // A meteor shower: every star of the cycle falls from one radiant above the top left corner,
  // each towards its own stretch of the horizon, in an order the seed shuffles. A star enters
  // above the frame, falls at a steady pace, flares as it reaches the horizon and flies on behind
  // the sea (or a bank) while its trail follows it down and fades.
  const meteorRandom = createSeededRandom(props.seed + 733);
  const horizon = horizonY(props.horizon);
  const radiant = {x: randomBetween(meteorRandom, -520, -120), y: randomBetween(meteorRandom, -900, -500)};
  const landShift = Math.floor(meteorRandom() * props.meteorCount);
  const meteors = Array.from({length: props.meteorCount}, (_, index): WebGLElement => {
    const offset = randomBetween(meteorRandom, 0.12, 0.35);
    const band = (((index + landShift) % props.meteorCount) + randomBetween(meteorRandom, 0.15, 0.85)) / props.meteorCount;
    const landX = LANDING.from + (LANDING.to - LANDING.from) * band;
    const scale = props.meteorSize * randomBetween(meteorRandom, 0.85, 1.15);
    const reach = Math.hypot(landX - radiant.x, horizon - radiant.y);
    const dirX = (landX - radiant.x) / reach;
    const dirY = (horizon - radiant.y) / reach;
    const y0 = -120 * scale;
    const x0 = radiant.x + (dirX * (y0 - radiant.y)) / dirY;
    const toHorizon = (horizon - y0) / dirY;
    const travelMax = toHorizon + 0.45 * TRAIL_PX * scale;
    const landed = toHorizon / travelMax;
    const {u, back} = meteorTiming(cycle, index, props.meteorCount, offset, travelMax / METEOR_PACE / props.durationSeconds);
    const rest = 1 - back;
    return {
      kind: 'meteor',
      x0,
      y0,
      dirX,
      dirY,
      travelled: travelMax * u * rest,
      trail: TRAIL_PX * scale * smoothstep(0, 0.2, u) * rest,
      travelMax,
      burn: smoothstep(landed - 0.12, landed, u) * rest,
      width: scale,
      opacity: smoothstep(0, 0.05, u) * (1 - smoothstep(landed, 1, u)),
    };
  });

  return [sky, sea, ...billows, ...meteors];
};
