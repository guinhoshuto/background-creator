import {createSeededRandom, loopPhase, TAU} from '../../loop';

export const TOKYO_RAIN_COUNT = 900;

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

/** Seeded drops loop through a 22 m vertical volume in exactly six turns. */
export const createTokyoRain = (seed: number) => {
  const random = createSeededRandom(seed);
  return Array.from({length: TOKYO_RAIN_COUNT}, () => ({
    x: (random() - 0.5) * 34,
    z: 17 - random() * 145,
    offset: random(),
    length: 0.13 + random() * 0.21,
  }));
};

export const rainHeight = (offset: number, phase: number) =>
  0.2 + (((offset - (phase / TAU) * 6) % 1 + 1) % 1) * 22;
