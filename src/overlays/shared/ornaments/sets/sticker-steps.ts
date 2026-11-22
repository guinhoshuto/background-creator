/**
 * The sticker motifs' motion: hand-drawn poses on steps, eight a second, as a sticker sheet is
 * animated on twos. Every motif reads a short table of poses (a turn over its tilt and a scale
 * of its shape) at the loop's current step:
 *
 *   - steps per loop S = 8·max(1, round(durationSeconds)), so S is a multiple of every table's
 *     length (8 for the star, 4 for the sparkle, 2 for the bolt) and the step after the last one
 *     is step 0 again: frame N draws frame 0;
 *   - the step of a whole frame f (taken modulo the loop's N frames) is floor(f·S/N), computed as
 *     an integer product before the division (15·96/720 = 2 exactly), so at 12 s and 60 fps a
 *     step lasts 7.5 frames everywhere, the last one (712.5 to 720) included: whole frames hold a
 *     pose for 8 and 7 frames in turn, across the seam as well, and the table moves on to the same
 *     successor it always does.
 *
 * A fractional frame t is the straight blend of the poses of the whole frames floor(t) and
 * floor(t) + 1. This is not fract() easing: the whole frames, the only ones a render draws, keep
 * their pure pose; between two of them the value only moves along the straight line, so a field
 * never jumps between neighbouring half frames (the ornament harness checks exactly that).
 */

/** Poses a second, as drawn. */
export const STEPS_PER_SECOND = 8;

/** One drawn pose: a turn in degrees over the motif's tilt and a scale of its shape (the line keeps its px). */
export type StickerPose = {turn: number; scale: number};

export type StickerMotif = 'star' | 'sparkle' | 'bolt';

/**
 * The pose tables. The star wobbles within ±6° and from 0.92 to 1; the sparkle blinks (1, 0.8, 1,
 * 1.1); the bolt flips between two poses. Each table starts at the rest pose {0, 1}: the hero
 * reads it from step 0, so frame 0 (the pack's PNG) shows it at rest.
 */
export const STICKER_POSES: Record<StickerMotif, readonly StickerPose[]> = {
  star: [
    {turn: 0, scale: 1}, {turn: 5, scale: 0.95}, {turn: -3, scale: 1}, {turn: 6, scale: 0.92},
    {turn: -6, scale: 0.97}, {turn: 2, scale: 1}, {turn: -4, scale: 0.93}, {turn: 3, scale: 0.98},
  ],
  sparkle: [1, 0.8, 1, 1.1].map((scale) => ({turn: 0, scale})),
  bolt: [{turn: 0, scale: 1}, {turn: -8, scale: 0.96}],
};

/** The largest scale a motif's table reaches: its extent holds that pose. */
export const maxPoseScale = (motif: StickerMotif) => Math.max(...STICKER_POSES[motif].map((pose) => pose.scale));

/** Steps per loop: eight for each of the loop's seconds, rounded to whole seconds (at least one). */
export const stepsPerLoop = (durationSeconds: number) => STEPS_PER_SECOND * Math.max(1, Math.round(durationSeconds));

/** The step of a whole frame (any integer, negative too), in [0, steps). */
export const stepAt = (frame: number, durationInFrames: number, steps: number) => {
  const inLoop = ((frame % durationInFrames) + durationInFrames) % durationInFrames;
  return Math.floor((inLoop * steps) / durationInFrames);
};

/** A table's pose at a step, read from `offset`; `mirror` turns it the other way (half of the stars lean so). */
const poseOf = (motif: StickerMotif, step: number, offset: number, mirror: boolean): StickerPose => {
  const table = STICKER_POSES[motif];
  const pose = table[(step + offset) % table.length]!;
  return mirror ? {turn: -pose.turn, scale: pose.scale} : pose;
};

/**
 * A motif's pose at any real frame: the pure pose on whole frames, the straight blend of the two
 * neighbouring whole frames' poses in between (see the header).
 */
export const stickerPoseAt = (
  motif: StickerMotif, frameIndex: number, durationInFrames: number, durationSeconds: number, offset: number, mirror: boolean,
): StickerPose => {
  const steps = stepsPerLoop(durationSeconds);
  const whole = Math.floor(frameIndex);
  const blend = frameIndex - whole;
  const from = poseOf(motif, stepAt(whole, durationInFrames, steps), offset, mirror);
  if (blend === 0) return from;
  const to = poseOf(motif, stepAt(whole + 1, durationInFrames, steps), offset, mirror);
  return {turn: from.turn + (to.turn - from.turn) * blend, scale: from.scale + (to.scale - from.scale) * blend};
};
