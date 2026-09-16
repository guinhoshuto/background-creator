/** One complete cycle. All motion frequencies must be whole numbers. */
export const TAU = Math.PI * 2;

/** Frame N is the conceptual repeat of frame 0; renders stop at N - 1. */
export const loopPhase = (frame: number, durationInFrames: number): number => {
  if (!Number.isFinite(frame) || !Number.isInteger(durationInFrames) || durationInFrames < 1) {
    throw new Error('O loop precisa de um frame finito e uma duração inteira positiva.');
  }

  return (((frame % durationInFrames) + durationInFrames) % durationInFrames) / durationInFrames * TAU;
};

/** Local PRNG: never use Math.random(), dates, or render order to lay out a scene. */
export const createSeededRandom = (seed: number): (() => number) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const randomBetween = (random: () => number, min: number, max: number): number =>
  min + random() * (max - min);
