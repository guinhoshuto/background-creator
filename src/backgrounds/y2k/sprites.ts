// The Blender sprites of the Y2K set: what Y2KLoop needs from each manifest.json that
// `npm run blender:sprites -- y2k` writes under public/sprites/y2k/<asset>/ (gitignored).
import {staticFile} from 'remotion';

export const Y2K_SET = 'y2k';
/** The sprites loop over 480 frames at 60 fps (loopFrames in scripts/blender/y2k/sprites.json). */
export const SPRITE_LOOP = 480;

/** One asset's manifest, as calculateMetadata injects it into the props (Root.tsx). */
export type Y2KSprite = {
  /** Frames after which the sprite repeats; a divisor of 480. */
  period: number;
  /** The files that exist: [start, start + count). The whole [0, period) unless complete is false. */
  start: number;
  count: number;
  /** false for a smoke render: the composition cycles through the frames it has, for a preview only. */
  complete: boolean;
};
export type Y2KSprites = Record<string, Y2KSprite>;

export const spriteDirectory = (asset: string) => `sprites/${Y2K_SET}/${asset}`;
export const spriteFile = (asset: string, index: number) => `${spriteDirectory(asset)}/${String(index).padStart(4, '0')}.webp`;
const renderFix = (asset: string) => `npm run blender:sprites -- ${Y2K_SET} --only ${asset}`;

export const missingSpriteMessage = (asset: string) =>
  `Y2KLoop: no sprites for "${asset}" (public/${spriteDirectory(asset)}/manifest.json is missing). Render them: ${renderFix(asset)}.`;

const isInteger = (value: unknown): value is number => Number.isInteger(value);

/** The manifest the Blender runner wrote; anything else is refused with the way out. */
export const parseSpriteManifest = (asset: string, data: unknown): Y2KSprite => {
  const record: Record<string, unknown> = typeof data === 'object' && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown> : {};
  const {period, frameRange, complete} = record;
  const [start, end] = Array.isArray(frameRange) && frameRange.length === 2 ? frameRange as unknown[] : [];
  if (isInteger(period) && period >= 1 && SPRITE_LOOP % period === 0 && isInteger(start) && isInteger(end)
    && start >= 0 && start < end && end <= period && typeof complete === 'boolean'
    && (!complete || (start === 0 && end === period))) {
    return {period, start, count: end - start, complete};
  }
  throw new Error(`Y2KLoop: public/${spriteDirectory(asset)}/manifest.json is not a sprite manifest (period ${String(period)}, `
    + `frameRange ${JSON.stringify(frameRange) ?? 'missing'}, complete ${String(complete)}). Render it again: ${renderFix(asset)}.`);
};

/** Reads a JSON file under public/; null when it is not there. */
export type ReadJson = (file: string) => Promise<unknown>;

/** Through Remotion's static server. No file, or no server at all (a Node test), is null: the component then names the asset. */
export const fetchStaticJson: ReadJson = async (file) => {
  let response: Response;
  try {
    response = await fetch(staticFile(file));
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Not JSON: parseSpriteManifest refuses it with the way out.
    return text;
  }
};

/** The manifest of every asset, once each; a missing one is left out, and the component names it. */
export const loadY2KSprites = async (assets: readonly string[], readJson: ReadJson = fetchStaticJson): Promise<Y2KSprites> => {
  const unique = [...new Set(assets)].sort();
  const read = await Promise.all(unique.map((asset) => readJson(`${spriteDirectory(asset)}/manifest.json`)));
  const sprites: Y2KSprites = {};
  unique.forEach((asset, index) => {
    const data = read[index];
    if (data !== null && data !== undefined) sprites[asset] = parseSpriteManifest(asset, data);
  });
  return sprites;
};

/**
 * The 480-frame sprite clock at frame f of a loop N frames long. The sprites play round(N / 480)
 * times per loop, at least once, so any duration and FPS close the loop; at 60 fps and 8 s it is f.
 */
export const spriteClock = (frame: number, durationInFrames: number) => {
  const loops = Math.max(1, Math.round(durationInFrames / SPRITE_LOOP));
  return Math.floor((frame * loops * SPRITE_LOOP) / durationInFrames);
};

const mod = (value: number, length: number) => ((value % length) + length) % length;

/** The file to show: (clock + phase) % period; a smoke render cycles through the frames it has. */
export const spriteFrameIndex = (sprite: Y2KSprite, clock: number, phase: number) => (sprite.complete
  ? mod(clock + phase, sprite.period)
  : sprite.start + mod(clock + phase, sprite.count));
