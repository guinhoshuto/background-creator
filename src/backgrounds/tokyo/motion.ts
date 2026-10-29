import {createSeededRandom, loopPhase, TAU} from '../../loop';

export const TOKYO_RAIN_COUNT = 1800;

const RAIN_HEIGHT = 24;
const LOOP_SECONDS = 12;
const BREEZE_DISTANCE = 0.12;
const fraction = (value: number) => value - Math.floor(value);
const smoothstep = (value: number) => {
  const unit = Math.max(0, Math.min(1, value));
  return unit * unit * (3 - 2 * unit);
};

export type TokyoRainDrop = {
  x: number;
  z: number;
  offset: number;
  /** Whole falls per loop keep both position and velocity periodic. */
  turns: number;
  /** World-space streak length and width, in metres. */
  length: number;
  width: number;
  opacity: number;
  /** Horizontal travel in metres during one fall. */
  drift: number;
  windPhase: number;
};

export const getTokyoMotion = (frame: number, duration: number, amount = 1) => {
  const phase = loopPhase(frame, duration);
  return {
    phase,
    cameraX: 1.3 + Math.sin(phase) * 0.12 * amount,
    cameraY: 5 + (Math.cos(phase) - 1) * 0.06 * amount,
    cameraZ: 19 + Math.sin(phase) * 0.16 * amount,
    neon: 1 + 0.025 * Math.sin(phase * 3) * amount,
  };
};

/**
 * Most rain lives inside the street; a sparse near field avoids a curtain in front
 * of the camera. A 12 s loop and 24 m fall give speeds of 6, 8, 10 and 12 m/s.
 */
export const createTokyoRain = (seed: number): TokyoRainDrop[] => {
  const random = createSeededRandom(seed);
  const layers = [
    {count: 160, near: 11, far: -12},
    {count: 740, near: -12, far: -52},
    {count: 900, near: -52, far: -128},
  ];
  return layers.flatMap(({count, near, far}) => Array.from({length: count}, () => {
    const turns = 3 + Math.floor(random() * 4);
    const speed = (RAIN_HEIGHT * turns) / LOOP_SECONDS;
    const exposure = 1 / (90 + random() * 50);
    return {
      x: (random() - 0.5) * 34,
      z: near + random() * (far - near),
      offset: random(),
      turns,
      length: speed * exposure,
      width: 0.006 + random() * 0.012,
      opacity: 0.18 + random() * 0.32,
      drift: 0.6 + random() * 0.9,
      windPhase: random() * TAU,
    };
  }));
};

const fallProgress = (offset: number, phase: number, turns: number) =>
  fraction((phase / TAU) * turns - offset);

export const rainHeight = (offset: number, phase: number, turns = 6) =>
  RAIN_HEIGHT * (1 - fallProgress(offset, phase, turns));

/** Pure state: arbitrary frame order never moves a previous impact with today's wind. */
export const getTokyoDropState = (drop: TokyoRainDrop, phase: number) => {
  const wrappedPhase = fraction(phase / TAU) * TAU;
  const progress = fallProgress(drop.offset, wrappedPhase, drop.turns);
  const y = rainHeight(drop.offset, wrappedPhase, drop.turns);
  const speed = (RAIN_HEIGHT * drop.turns) / LOOP_SECONDS;
  const exposure = drop.length / speed;
  const windVelocity = (drop.drift * drop.turns + BREEZE_DISTANCE * TAU * Math.cos(wrappedPhase + drop.windPhase)) / LOOP_SECONDS;
  // At the reset, the preceding fall touched down here. Freeze its wind sample
  // for the whole following fall, including when that interval crosses phase 0.
  const impactPhase = wrappedPhase - (progress * TAU) / drop.turns;
  return {
    x: drop.x + drop.drift * (progress - 0.5) + BREEZE_DISTANCE * Math.sin(wrappedPhase + drop.windPhase),
    y,
    z: drop.z,
    tailX: -windVelocity * exposure,
    tailY: drop.length,
    opacity: drop.opacity * smoothstep((RAIN_HEIGHT - y) / 0.7) * smoothstep(y / 0.12),
    impactX: drop.x + drop.drift * 0.5 + BREEZE_DISTANCE * Math.sin(impactPhase + drop.windPhase),
    impactZ: drop.z,
    impactAge: (progress * LOOP_SECONDS) / drop.turns,
  };
};

/** A contact grows in real metres and fades before the next seeded fall. */
export const getTokyoImpactState = (drop: TokyoRainDrop, phase: number) => {
  const state = getTokyoDropState(drop, phase);
  const size = (drop.width - 0.006) / 0.012;
  const age = Math.min(1, state.impactAge / (0.38 + size * 0.14));
  const roadway = Math.abs(state.impactX) < 5.8 && state.impactZ > -62 && state.impactZ < 11;
  return {
    x: state.impactX, z: state.impactZ,
    radius: 0.018 + (0.17 + size * 0.12) * (1 - (1 - age) ** 2),
    opacity: roadway ? smoothstep(state.impactAge / 0.035) * (1 - age) ** 2 * 0.72 : 0,
    age,
  };
};
