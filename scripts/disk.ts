// The one disk floor every render shares (stills, render:*, render:pack, validate:exports, zip:pack). This Mac has
// little disk to spare and a full disk once took it down mid-render, so every job checks here.
import {existsSync, statfsSync} from 'node:fs';
import path from 'node:path';

/** No job starts with less free disk than this. */
export const START_MIN_FREE_BYTES = 3 * 1024 ** 3;
/** A job never leaves less than this: once its estimated output is written, and between the files of a long render. */
export const RUN_MIN_FREE_BYTES = 2 * 1024 ** 3;

/** The way out for a render refused for disk: `npm run clean` lists the space that comes back by itself. */
export const FREE_SPACE_HINT = 'Free space (npm run clean -- --apply) and run again.';

/** Sizes as people read them in messages; the math is in binary units, so the label says GiB. */
export const gibibytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;

/** The nearest existing directory: statfs needs a real path, and out/ folders may not exist yet. */
export const existingAncestor = (directory: string): string =>
  (existsSync(directory) || path.dirname(directory) === directory ? directory : existingAncestor(path.dirname(directory)));

/** Free bytes on the disk that holds `directory` (or would hold it, once created). */
export const freeBytes = (directory: string) => {
  const stats = statfsSync(existingAncestor(directory));
  return Number(stats.bavail) * Number(stats.bsize);
};

/**
 * Before a job starts: at least START free and, when the job knows how much it writes, at least RUN
 * left after that. `then` tells how to get out (free space, resume).
 */
export const assertCanStart = ({free, estimate = 0, where, then}: {free: number; estimate?: number; where: string; then: string}) => {
  if (free < START_MIN_FREE_BYTES) {
    throw new Error(`Not enough free disk in ${where}: ${gibibytes(free)} free, and a render needs at least ${gibibytes(START_MIN_FREE_BYTES)} to start. ${then}`);
  }
  if (free - estimate < RUN_MIN_FREE_BYTES) {
    throw new Error(`Not enough free disk in ${where}: ${gibibytes(free)} free, this job needs up to ${gibibytes(estimate)} and ${gibibytes(RUN_MIN_FREE_BYTES)} must stay free. ${then}`);
  }
};

/** Between the files of a long render: stop below RUN, with `then` saying how to resume. */
export const assertCanGoOn = ({free, where, then}: {free: number; where: string; then: string}) => {
  if (free < RUN_MIN_FREE_BYTES) {
    throw new Error(`Not enough free disk in ${where}: ${gibibytes(free)} free, below the ${gibibytes(RUN_MIN_FREE_BYTES)} a running render keeps. ${then}`);
  }
};
