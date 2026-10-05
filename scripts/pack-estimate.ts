import type {OutputFormat} from '../src/settings';
import {frameScratchBytes} from './disk';
import type {PlannedFile} from './pack-plan';

/** One format's cost: a fixed part per file plus a part per megapixel-frame (width × height × frames / 10^6). */
type Rate = {perFile: number; perMegapixelFrame: number};

/**
 * What one file weighs (bytes) and how long it renders (seconds), per format, from one measured
 * render: the halloween-noite kit (the halloween-midnight pack before the English names), rendered
 * one file at a time on 2026-09-26 on the 8 GB MacBook: 115 files, 1.006 GiB, in
 * out/packs/halloween-noite. Sizes are the files' own; times are the gaps between the mtimes of
 * consecutive files within one run (a gap over 10 min, a pause between runs, is left out).
 * - webm: least-squares lines over megapixel-frames, 51 files for size and 47 for time. Content,
 *   not size, makes much of a WebM, so a single file can be off by half or three times; over the
 *   measured pack the lines give back its totals (1066 MB; 98 min for the timed files).
 * - png: 0.308 bytes per pixel over 62 stills; 1.56 s each, the mean of 53 stills rendered right
 *   after their WebM. Masks, never timed alone, count as stills too.
 * - gif: 2 Twitch panels (320×160, 600 frames): 2.6 and 3.0 MB, 19 and 20 s.
 * mp4 and mov have no measured render yet: the estimate names them instead of guessing.
 */
export const MEASURED_RATES: Partial<Record<OutputFormat, {bytes: Rate; seconds: Rate}>> = {
  webm: {bytes: {perFile: 13_416_406, perMegapixelFrame: 22_379}, seconds: {perFile: 79.7, perMegapixelFrame: 0.1541}},
  png: {bytes: {perFile: 0, perMegapixelFrame: 308_000}, seconds: {perFile: 1.56, perMegapixelFrame: 0}},
  gif: {bytes: {perFile: 0, perMegapixelFrame: 90_879}, seconds: {perFile: 0, perMegapixelFrame: 0.633}},
};

type Costed = Pick<PlannedFile, 'format' | 'canvas' | 'frames'>;

/** A PNG is one still frame, whatever the duration of its composition. */
const megapixelFrames = (file: Costed) => (file.canvas.width * file.canvas.height * (file.format === 'png' ? 1 : file.frames)) / 1e6;

/** The estimated size and render time of one planned file, or null for a format never measured. */
export const estimateFile = (file: Costed): {bytes: number; seconds: number} | null => {
  const rate = MEASURED_RATES[file.format];
  if (!rate) return null;
  const amount = megapixelFrames(file);
  return {
    bytes: rate.bytes.perFile + rate.bytes.perMegapixelFrame * amount,
    seconds: rate.seconds.perFile + rate.seconds.perMegapixelFrame * amount,
  };
};

/**
 * The most one render takes from the disk while it runs: its frames before the encode plus the
 * file it writes (none for a format never measured). The disk floor checks against this.
 */
export const diskNeed = (file: Costed) => frameScratchBytes(file) + (estimateFile(file)?.bytes ?? 0);

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Binary units, like the zip:pack summary and the disk floor. */
const sizeText = (bytes: number) => {
  const mebibytes = bytes / 1024 ** 2;
  if (mebibytes >= 1024) return `~${(mebibytes / 1024).toFixed(2)} GiB`;
  return mebibytes >= 10 ? `~${Math.round(mebibytes)} MiB` : `~${mebibytes.toFixed(1)} MiB`;
};

const timeText = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'under 1 min';
  return minutes < 60 ? `~${minutes} min` : `~${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

/** Where a file's estimate adds up: its variant, the pack's masks, or the files with no variant. */
const groupOf = (file: PlannedFile) => (file.role === 'mask' ? 'masks' : file.variant ?? 'no variant');

type Sum = {files: number; bytes: number; seconds: number};
const add = (sum: Sum, cost: {bytes: number; seconds: number}): Sum =>
  ({files: sum.files + 1, bytes: sum.bytes + cost.bytes, seconds: sum.seconds + cost.seconds});

/**
 * The end of --dry-run: size and render time per variant and for the whole plan, what is left to
 * render when some files already exist, and the files of a format never measured. The zip weighs
 * what the files weigh: it stores them without compression.
 */
export const estimateText = (plan: readonly PlannedFile[], existing: ReadonlySet<string> = new Set()) => {
  const empty: Sum = {files: 0, bytes: 0, seconds: 0};
  const groups = new Map<string, Sum>();
  const unmeasured = new Map<string, number>();
  let whole = empty;
  let left = empty;
  for (const file of plan) {
    const cost = estimateFile(file);
    if (!cost) {
      unmeasured.set(file.format, (unmeasured.get(file.format) ?? 0) + 1);
      continue;
    }
    groups.set(groupOf(file), add(groups.get(groupOf(file)) ?? empty, cost));
    whole = add(whole, cost);
    if (!existing.has(file.output)) left = add(left, cost);
  }
  const line = (label: string, sum: Sum) => `  ${label}: ${plural(sum.files, 'file')}, ${sizeText(sum.bytes)}, ${timeText(sum.seconds)}`;
  const done = whole.files - left.files;
  return [
    'Estimate from the halloween-noite render measured on 2026-09-26 (8 GB MacBook, one file at a time; a single file can be off by half or three times):',
    ...[...groups].map(([label, sum]) => line(label, sum)),
    line('whole plan', whole),
    ...(done > 0 ? [`  left to render: ${plural(left.files, 'file')}, ${timeText(left.seconds)} (${done} already ${done === 1 ? 'exists' : 'exist'}; --overwrite renders ${done === 1 ? 'it' : 'them'} again)`] : []),
    ...(unmeasured.size > 0
      ? [`  not estimated: ${[...unmeasured].map(([format, count]) => `${count} ${format} ${count === 1 ? 'file' : 'files'}`).join(', ')} (no measured render yet)`]
      : []),
  ].join('\n');
};
