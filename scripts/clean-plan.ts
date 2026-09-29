// What `npm run clean` deletes: space that comes back by itself (verification renders, old bundles,
// the webpack cache). What the buyer gets (out/packs, out/deliveries) is never on the list, with any flag.
import {existsSync, lstatSync, readdirSync, realpathSync, rmSync} from 'node:fs';
import path from 'node:path';
import {acquireRenderSlot, type SlotHandle} from './render-slot';

/** Relative to the repo root, with forward slashes. */
export const WEBPACK_CACHE = 'node_modules/.cache/webpack';
/** Above this, the webpack cache is dropped before a bundle: left alone it reached 4.8 GB on this disk-starved Mac. */
export const WEBPACK_CACHE_LIMIT_BYTES = 1024 ** 3;
/** Never deleted, whatever the flags: delivered packs and buyer zips. */
export const PROTECTED_PATHS = ['out/packs', 'out/deliveries'] as const;

export type CleanOptions = {review: boolean};
export type CleanTarget = {path: string; why: string};
export type SizedTarget = CleanTarget & {bytes: number};

const isProtected = (target: string) => PROTECTED_PATHS.some((keep) =>
  target === keep || target.startsWith(`${keep}/`) || keep.startsWith(`${target}/`));

/** Bundles Remotion left in .cache: `bundle`, `stills-bundle-<tag>-<pid>`, `<name>-bundle`. */
const isBundle = (name: string) => name.startsWith('bundle') || /-bundle(-|$)/.test(name);

const reasonFor = (target: string, {review}: CleanOptions): string | null => {
  if (target === 'out/.scratch') return 'verification renders';
  if (target === WEBPACK_CACHE) return 'webpack cache, rebuilt by the next render';
  if (target === 'out/review') return review ? 'review boards (--review)' : null;
  const [top, name, ...rest] = target.split('/');
  if (top === '.cache' && name && rest.length === 0 && isBundle(name)) return 'old Remotion bundle';
  return null;
};

/**
 * Pure: from the paths that exist (children of out/ and .cache/, plus the webpack cache), what clean
 * deletes and why. Protected paths are dropped last, so no rule added later can reach them.
 */
export const planClean = (existing: readonly string[], options: CleanOptions): CleanTarget[] => existing.flatMap((target) => {
  const why = reasonFor(target, options);
  return why && !isProtected(target) ? [{path: target, why}] : [];
});

/**
 * Whether `target` (relative) really lives under `root`. A worktree's node_modules is a symlink to
 * the main checkout: following it would delete another checkout's cache.
 */
export const livesUnder = (root: string, target: string) => {
  try {
    const real = realpathSync(path.join(root, target));
    const base = realpathSync(root);
    return real === base || real.startsWith(`${base}${path.sep}`);
  } catch {
    return false;
  }
};

/** The paths planClean looks at, as they exist under `root` (never through a symlink out of it). */
export const listCandidates = (root: string): string[] => {
  const children = (dir: string) => {
    try { return readdirSync(path.join(root, dir)).map((name) => `${dir}/${name}`); } catch { return []; }
  };
  return [...children('out'), ...children('.cache'), ...(existsSync(path.join(root, WEBPACK_CACHE)) ? [WEBPACK_CACHE] : [])]
    .filter((target) => livesUnder(root, target));
};

/** Bytes on disk under `target`, like du: symlinks are counted, never followed. */
export const diskBytes = (target: string): number => {
  let stats;
  try { stats = lstatSync(target); } catch { return 0; }
  const own = Number(stats.blocks) * 512;
  if (!stats.isDirectory()) return own;
  return readdirSync(target).reduce((sum, name) => sum + diskBytes(path.join(target, name)), own);
};

export const formatBytes = (bytes: number) => (bytes >= 1024 ** 3
  ? `${(bytes / 1024 ** 3).toFixed(1)} GiB`
  : `${(bytes / 1024 ** 2).toFixed(1)} MiB`);

export const formatPlan = (targets: readonly SizedTarget[], {apply}: {apply: boolean}) => {
  const total = targets.reduce((sum, target) => sum + target.bytes, 0);
  const head = apply ? 'Deleted:' : 'Would delete (run `npm run clean -- --apply` to delete):';
  const rows = targets.map((target) => `  ${formatBytes(target.bytes).padStart(10)}  ${target.path}  (${target.why})`);
  return [
    targets.length === 0 ? 'Nothing to delete.' : head,
    ...rows,
    ...(targets.length === 0 ? [] : [`  ${formatBytes(total).padStart(10)}  total`]),
    `Always kept: ${PROTECTED_PATHS.join(', ')}. out/review only with --review.`,
  ].join('\n');
};

export type CleanEffects = {
  list: (root: string) => string[];
  size: (target: string) => number;
  remove: (target: string) => void;
  /** Takes the render slot without waiting; throws when a render holds it. */
  takeSlot: () => Promise<SlotHandle>;
};

const realEffects: CleanEffects = {
  list: listCandidates,
  size: diskBytes,
  remove: (target) => rmSync(target, {recursive: true, force: true}),
  takeSlot: () => acquireRenderSlot({command: 'npm run clean -- --apply', wait: false}),
};

/**
 * Lists what clean would delete; deletes it only with `apply`, holding the render slot from before
 * the listing until the last delete, so no render starts on a bundle or cache being deleted.
 */
export const runClean = async (
  {root, review, apply}: {root: string; review: boolean; apply: boolean},
  effects: Partial<CleanEffects> = {},
) => {
  const {list, size, remove, takeSlot} = {...realEffects, ...effects};
  let slot: SlotHandle | undefined;
  if (apply) {
    try {
      slot = await takeSlot();
    } catch (error) {
      throw new Error(`Refusing to delete while a render runs. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    const targets = planClean(list(root), {review}).map((target) => ({...target, bytes: size(path.join(root, target.path))}));
    if (apply) for (const target of targets) remove(path.join(root, target.path));
    return {targets, text: formatPlan(targets, {apply})};
  } finally {
    slot?.release();
  }
};

/** Pure: whether a webpack cache of `bytes` is dropped before the next bundle. */
export const webpackCacheTooBig = (bytes: number) => bytes > WEBPACK_CACHE_LIMIT_BYTES;

/** Before a bundle: drop the webpack cache when it passed the limit, and say so in one line. */
export const pruneWebpackCache = (
  root: string,
  {size = diskBytes, remove = realEffects.remove, log = console.log}: {size?: (target: string) => number; remove?: (target: string) => void; log?: (message: string) => void} = {},
) => {
  // In a worktree node_modules is a symlink: the main checkout's cache is left to its own bundles.
  if (!livesUnder(root, WEBPACK_CACHE)) return false;
  const cache = path.join(root, WEBPACK_CACHE);
  const bytes = size(cache);
  if (!webpackCacheTooBig(bytes)) return false;
  remove(cache);
  log(`Dropped ${WEBPACK_CACHE} (${formatBytes(bytes)}, over the ${formatBytes(WEBPACK_CACHE_LIMIT_BYTES)} limit); this bundle rebuilds it.`);
  return true;
};
