import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Where listing:page reads a pack's media when --thumbs is not given. /thumb may render in a worktree of the
 * thumbnail generator (when its main checkout holds another session's files), and the main checkout's out/<pack>/
 * then keeps the render before: on 2026-10-15 the generator's gallery showed Galaxy Backgrounds v1 from the main
 * checkout while v2 sat in a worktree (THB-29). So every checkout of the generator is a candidate, and the newest
 * render wins.
 */
export const GENERATOR = path.join(os.homedir(), 'dev/firulas/etsy-thumb-generator');

/** The generator's checkouts still on disk, the main one first (git worktree list); only `generator` when git cannot list them. */
export const generatorCheckouts = (generator: string): string[] => {
  try {
    const listed = execFileSync('git', ['-C', generator, 'worktree', 'list', '--porcelain'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
    return listed.split('\n').filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length)).filter((dir) => existsSync(dir));
  } catch {
    return [generator];
  }
};

/** The "rendered" time of <folder>/manifest.json, which the generator's render writes; -Infinity without one. */
const renderedAt = (folder: string) => {
  try {
    const {rendered} = JSON.parse(readFileSync(path.join(folder, 'manifest.json'), 'utf8')) as {rendered?: unknown};
    const time = typeof rendered === 'string' ? Date.parse(rendered) : NaN;
    return Number.isNaN(time) ? -Infinity : time;
  } catch {
    return -Infinity;
  }
};

/**
 * out/<pack>/ of the checkout with the newest render (the first listed, the main one, on a tie), and the other
 * checkouts' out/<pack>/; without one anywhere, the first checkout's, so the missing-media message names it.
 */
export const newestThumbs = (checkouts: string[], pack: string): {folder: string; others: string[]} => {
  const folders = checkouts.map((checkout) => path.join(checkout, 'out', pack)).filter((folder) => existsSync(folder));
  if (folders.length === 0) return {folder: path.join(checkouts[0]!, 'out', pack), others: []};
  const times = new Map(folders.map((folder) => [folder, renderedAt(folder)]));
  const folder = folders.reduce((best, candidate) => (times.get(candidate)! > times.get(best)! ? candidate : best));
  return {folder, others: folders.filter((other) => other !== folder)};
};
