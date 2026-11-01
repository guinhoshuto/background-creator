// The Blender frame sequence of the wildfire smoke background: what WildfireSmokeLoop needs from
// the manifest.json that `npm run build:wildfire` (scripts/create-wildfire-smoke.py) writes to
// public/wildfire-smoke/ (gitignored). Pure functions, no Remotion import: the tests run in Node
// without a frame on disk and without Blender.

export const WILDFIRE_DIRECTORY = 'wildfire-smoke';
export const WILDFIRE_MANIFEST_FILE = `${WILDFIRE_DIRECTORY}/manifest.json`;

/** The sequence the script renders: 480 frames at 60 fps, 1920×1080, one exact 8 s loop. */
export const WILDFIRE_SEQUENCE = {name: 'wildfire-smoke', frames: 480, width: 1920, height: 1080, fps: 60} as const;

export const BUILD_FIX = 'run npm run build:wildfire with the Sandisk connected';
/** What the composition refuses with when the frames cannot be shown; the problems follow it. */
export const MISSING_FRAMES_MESSAGE = `The wildfire smoke frames are missing, incomplete or stale: ${BUILD_FIX}.`;

/** public/wildfire-smoke/manifest.json, as the Blender script writes it. */
export type WildfireManifest = {
  name: string;
  version: number;
  width: number;
  height: number;
  fps: number;
  frames: number;
  loop: boolean;
  direction: string;
  blender: string;
  /** SHA-256 of scripts/create-wildfire-smoke.py at render time: a changed script means stale frames. */
  script_sha256: string;
  samples: number;
  percent: number;
  /** true once every frame of 0..frames-1 is on disk; a `--frames A-B` run leaves it false. */
  complete: boolean;
  /** The inclusive frame ranges rendered so far. */
  rendered: [number, number][];
};

/** What the sequence must be for the composition to show it; the sha is checked only when given. */
export type SequenceExpectation = {frames: number; width: number; height: number; fps: number; scriptSha256?: string};

const isInteger = (value: unknown): value is number => Number.isInteger(value);
const isCount = (value: unknown): value is number => isInteger(value) && value >= 1;
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isRange = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && isInteger(value[0]) && isInteger(value[1]) && value[0] >= 0 && value[0] <= value[1];

const FIELDS: {[Key in keyof WildfireManifest]: [string, (value: unknown) => value is WildfireManifest[Key]]} = {
  name: ['a name', isString],
  version: ['a whole number from 1', isCount],
  width: ['a whole number from 1', isCount],
  height: ['a whole number from 1', isCount],
  fps: ['a whole number from 1', isCount],
  frames: ['a whole number from 1', isCount],
  loop: ['true or false', isBoolean],
  direction: ['a direction id', isString],
  blender: ['a Blender version', isString],
  script_sha256: ['a hex SHA-256', (value): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)],
  samples: ['a whole number from 1', isCount],
  percent: ['a whole number from 1', isCount],
  complete: ['true or false', isBoolean],
  rendered: ['a list of [first, last] frame ranges', (value): value is [number, number][] => Array.isArray(value) && value.every(isRange)],
};

/** The manifest the Blender script wrote; anything else is refused with the way out. */
export const parseManifest = (data: unknown): WildfireManifest => {
  const record: Record<string, unknown> | null = typeof data === 'object' && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown> : null;
  const problems = record === null
    ? [`not a JSON object but ${JSON.stringify(data) ?? String(data)}`]
    : Object.entries(FIELDS).flatMap(([key, [expected, accepts]]) =>
      accepts(record[key]) ? [] : [`${key}: expected ${expected}, got ${JSON.stringify(record[key]) ?? 'nothing'}`]);
  if (problems.length > 0 || record === null) {
    throw new Error(`public/${WILDFIRE_MANIFEST_FILE} is not a wildfire smoke manifest (${problems.join('; ')}): ${BUILD_FIX}.`);
  }
  // Every field passed its check above; the copy drops anything extra the script may add later.
  return Object.fromEntries(Object.keys(FIELDS).map((key) => [key, record[key]])) as WildfireManifest;
};

/** Whether the inclusive ranges, in any order, cover every frame of 0..frames-1. */
const covers = (ranges: readonly (readonly [number, number])[], frames: number): boolean => {
  let next = 0;
  for (const [first, last] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (first > next) return false;
    next = Math.max(next, last + 1);
  }
  return next >= frames;
};

const rangesText = (ranges: readonly (readonly [number, number])[]) =>
  ranges.length > 0 ? ranges.map(([first, last]) => `${first}-${last}`).join(', ') : 'nothing';

/**
 * Why the sequence cannot be shown, one line each; empty when it can. A manifest that is not there
 * (null) is the first reason; the others compare it with what the composition expects.
 */
export const manifestProblems = (manifest: WildfireManifest | null | undefined, expected: SequenceExpectation): string[] => {
  if (manifest === null || manifest === undefined) return [`public/${WILDFIRE_MANIFEST_FILE} is missing: no frames were rendered`];
  const problems: string[] = [];
  if (manifest.name !== WILDFIRE_SEQUENCE.name) problems.push(`name: "${manifest.name}", expected "${WILDFIRE_SEQUENCE.name}"`);
  if (manifest.frames !== expected.frames) problems.push(`frames: ${manifest.frames}, expected ${expected.frames}`);
  if (manifest.width !== expected.width || manifest.height !== expected.height) {
    problems.push(`size: ${manifest.width}×${manifest.height}, expected ${expected.width}×${expected.height}`);
  }
  if (manifest.fps !== expected.fps) problems.push(`fps: ${manifest.fps}, expected ${expected.fps}`);
  if (!manifest.loop) problems.push('loop: false, expected a sequence that closes on itself');
  if (!manifest.complete || !covers(manifest.rendered, manifest.frames)) {
    problems.push(`incomplete: rendered ${rangesText(manifest.rendered)} of 0-${manifest.frames - 1} (complete: ${String(manifest.complete)})`);
  }
  if (expected.scriptSha256 !== undefined && manifest.script_sha256.toLowerCase() !== expected.scriptSha256.toLowerCase()) {
    problems.push(`stale: rendered by script ${manifest.script_sha256.slice(0, 8)}, the current script is ${expected.scriptSha256.slice(0, 8)}`);
  }
  return problems;
};

/** The file of one frame of the sequence: four digits at least (0000.webp .. 0479.webp). */
export const frameFileOf = (frame: number, total: number): string => {
  if (!isCount(total)) throw new Error(`The sequence needs a whole number of frames from 1, not ${String(total)}.`);
  if (!isInteger(frame) || frame < 0 || frame >= total) throw new Error(`Frame ${String(frame)} is outside the sequence 0..${total - 1}.`);
  return `${String(frame).padStart(Math.max(4, String(total - 1).length), '0')}.webp`;
};

/**
 * The sequence frame shown at frame f of a composition N frames long. The sequence plays
 * round(N / total) times per loop, at least once, so frame N lands on frame 0 at every duration
 * and FPS the schema allows (a GIF runs at 50 fps); at 60 fps and 8 s it is f itself.
 */
export const sequenceFrame = (frame: number, durationInFrames: number, total: number = WILDFIRE_SEQUENCE.frames): number => {
  if (!isCount(durationInFrames) || !isCount(total) || !isInteger(frame)) {
    throw new Error('The sequence clock needs whole numbers: a frame, and a duration and a total from 1.');
  }
  const loops = Math.max(1, Math.round(durationInFrames / total));
  const wrapped = ((frame % durationInFrames) + durationInFrames) % durationInFrames;
  return Math.floor((wrapped * loops * total) / durationInFrames) % total;
};
