import type {z} from 'zod';
import {loopPhase, TAU} from '../../loop';
import {getCompositionMetadata, type BaseBackgroundProps} from '../../settings';

/**
 * The speeds a sized asset actually shows, in px/s along its motion: whole periods per cycle make
 * them differ from the requested strokeSpeed/fillSpeed (at least one period per cycle, so a long
 * track or a large area moves faster than asked). 0 when nothing travels. Reported in the export
 * log, the sidecar and the pack manifest.
 */
export type AssetMotion = {strokeSpeed: number; fillSpeed: number};

/** A speed for reports: one decimal is plenty for px/s. */
export const reportSpeed = (speed: number) => Math.round(speed * 10) / 10;

/** Share of a pattern's period that it may travel in one frame (same rule as DotGrid/Checkerboard). */
export const MAX_FRAME_SHARE = 0.4;

export const fract = (value: number) => value - Math.floor(value);

/** Where the loop is, from 0 (frame 0) up to but excluding 1 (frame N, which is frame 0 again). */
export const cycleOf = (frame: number, durationInFrames: number) => loopPhase(frame, durationInFrames) / TAU;

/**
 * A pattern listed by place: `offset` is how far into its period the pattern has moved, in
 * [0, 1), and `step` how many whole periods it has moved since frame 0. The seeded `shift`
 * (0.2–0.8) keeps the instant the offset wraps away from the seam, so every place keeps its
 * velocity from the last frame into the first; `laps` is a whole number, so frame N is frame 0.
 */
export const placeTravel = (shift: number, laps: number, cycle: number) => {
  const travelled = shift + laps * cycle;
  return {offset: fract(travelled), step: Math.floor(travelled)};
};

/** `index` modulo `length`, never negative. */
export const wrapIndex = (index: number, length: number) => ((index % length) + length) % length;

/** The frames of one cycle, or null when the duration cannot be represented (the schema reports it). */
export const framesOf = (props: Pick<BaseBackgroundProps, 'durationSeconds' | 'outputFormat'>): number | null => {
  try {
    return getCompositionMetadata(props).durationInFrames;
  } catch {
    return null;
  }
};

/**
 * Share of the nearest repeat a pattern covers in one frame, moving `laps` periods per cycle.
 * `unitsPerPeriod` is how many look-alike pieces one period holds: two-colour stripes repeat
 * every two stripes, but the eye pairs each stripe with the nearest one, whatever its colour.
 */
export const frameShare = (laps: number, durationInFrames: number, unitsPerPeriod = 1) =>
  (laps * unitsPerPeriod) / durationInFrames;

/**
 * The highest speed, in px/s, that still rounds to a number of periods per cycle the frame rate
 * can carry; null when not even one period per cycle can (the cycle is too short).
 */
export const maxSpeedFor = (
  period: number, durationSeconds: number, durationInFrames: number, unitsPerPeriod = 1,
): number | null => {
  const maxLaps = Math.floor((MAX_FRAME_SHARE * durationInFrames) / unitsPerPeriod + 1e-9);
  if (maxLaps < 1) return null;
  // lapsFor rounds half up, so the limit itself would already round to one lap too many.
  const limit = ((maxLaps + 0.5) * period) / durationSeconds;
  const whole = Math.ceil(limit) - 1;
  // A tiny period over a long cycle can leave less than 1 px/s: offer tenths instead of zero.
  return whole > 0 ? whole : (Math.ceil(limit * 10 - 1e-9) - 1) / 10;
};

export type TravelCheck = {
  /** Periods travelled per cycle (from lapsFor). */
  laps: number;
  /** The pattern's period along its motion, in px. */
  period: number;
  /** Look-alike pieces per period (see frameShare); 1 by default. */
  unitsPerPeriod?: number;
  durationSeconds: number;
  durationInFrames: number;
  /** The speed field, for the issue path and the message. */
  field: string;
  /** What the pattern is ("the dashes", "the comets"…). */
  subject: string;
  /** The other way out ("increase dashLength or gapLength"). */
  otherFix: string;
};

/**
 * A fast pattern with a short period would alias: nothing is drawn wrong, but the eye pairs each
 * piece with the nearest one in the next frame and sees it go backwards or flicker. The speed is
 * never lowered behind the user's back; the combination is refused with the way out instead.
 */
export const refineTravel = (check: TravelCheck, context: z.RefinementCtx) => {
  const units = check.unitsPerPeriod ?? 1;
  const share = frameShare(check.laps, check.durationInFrames, units);
  if (share <= MAX_FRAME_SHARE + 1e-12) return;
  const maxSpeed = maxSpeedFor(check.period, check.durationSeconds, check.durationInFrames, units);
  const percent = Math.round(share * 100);
  context.addIssue({
    code: 'custom',
    path: [check.field],
    message: maxSpeed !== null && maxSpeed > 0
      ? `Speed too high for ${check.subject}: each frame the pattern would move ${percent}% of the way to the next piece and would seem to go backwards or flicker. Use ${check.field} up to ${maxSpeed} px/s or ${check.otherFix}.`
      : `Cycle too short for ${check.subject}: even one period per cycle would make the pattern move ${percent}% of the way to the next piece each frame, and it would seem to go backwards or flicker. Increase durationSeconds or ${check.otherFix}.`,
  });
};
