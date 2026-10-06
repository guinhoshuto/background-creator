// Animated stream mockups (`npm run qa:kit -- <pack> --video`): the same scenes as the still
// mockups (MOCK_LAYOUTS), built from the pack's own .webm files, one background loop long. A loop
// longer than a listing video can be also gets a listing cut that cross-fades back into frame 0.
import type {PlannedFile} from './pack-plan';
import {MOCK_LAYOUTS} from './stills-job';

/** The longest listing video the thumbnail generator takes (Etsy allows 15 s). */
export const LISTING_MAX_SECONDS = 14.5;
/** How long the listing cut cross-fades into the loop's own last second. */
export const LISTING_FADE_SECONDS = 1;

export type MockVideo = {
  /** The mockup's name, as in MOCK_LAYOUTS (mock-chatting). */
  name: string;
  fps: number;
  frames: number;
  /** Relative to the project root, like PlannedFile.output. */
  base: string;
  /** Where each file's top-left corner goes: the box position minus the file's bleed. */
  layers: {file: string; x: number; y: number}[];
};

export const MOCK_NAMES = MOCK_LAYOUTS.map((layout) => layout.out);

/** `all` or a comma list of mockup names; an unknown name is refused with the list. */
export const parseMockNames = (value: string) => {
  if (value.trim() === 'all') return [...MOCK_NAMES];
  const names = value.split(',').map((name) => name.trim()).filter((name) => name.length > 0);
  const unknown = names.filter((name) => !MOCK_NAMES.includes(name));
  if (names.length === 0 || unknown.length > 0) {
    throw new Error(`--video takes "all" or mockup names separated by commas (${MOCK_NAMES.join(', ')}), not "${value}".`);
  }
  return names;
};

/**
 * One video per requested mockup, from the pack plan's .webm files. A scene needs the background
 * and every layer it names: one the pack does not plan, or a frame rate or loop that differs from
 * the background's, refuses the mockup with the reason (a cut there would jump).
 */
export const planMockVideos = (plan: readonly PlannedFile[], names: readonly string[]): MockVideo[] => {
  const webm = plan.filter((file) => file.format === 'webm' && file.role !== 'mask');
  const background = webm.find((file) => file.kind === 'background');
  if (!background) throw new Error('The pack plans no .webm background: the mockup videos need one.');
  return names.map((name) => {
    const layout = MOCK_LAYOUTS.find((entry) => entry.out === name);
    if (!layout) throw new Error(`Unknown mockup "${name}". Use one of: ${MOCK_NAMES.join(', ')}.`);
    const layers = layout.layers.map(({size, variant, x, y}) => {
      const file = webm.find((entry) => entry.size === size && entry.variant === variant);
      const label = variant === undefined ? size : `${size} (${variant})`;
      if (!file) throw new Error(`${name} needs ${label} as .webm, which the pack does not plan.`);
      if (file.fps !== background.fps || file.frames !== background.frames) {
        throw new Error(`${name}: ${label} runs ${file.frames} frames at ${file.fps} fps, the background ${background.frames} at ${background.fps}; the loop would jump.`);
      }
      const bleed = typeof file.exportProps.bleed === 'number' ? file.exportProps.bleed : 0;
      return {file: file.output, x: x - bleed, y: y - bleed};
    });
    return {name, fps: background.fps, frames: background.frames, base: background.output, layers};
  });
};

/** FFmpeg arguments that composite one mockup into an H.264 MP4 (the VP9 decoder keeps alpha). */
export const mockVideoArgs = (video: MockVideo, resolve: (relative: string) => string, output: string) => {
  const inputs = ['-i', resolve(video.base), ...video.layers.flatMap((layer) => ['-c:v', 'libvpx-vp9', '-i', resolve(layer.file)])];
  const chain = ['[0:v]format=rgb24[s0]', ...video.layers.map((layer, i) => `[s${i}][${i + 1}:v]overlay=${layer.x}:${layer.y}:format=auto[s${i + 1}]`)];
  const filter = `${chain.join(';')};[s${video.layers.length}]format=yuv420p[v]`;
  return ['-y', '-v', 'error', ...inputs, '-filter_complex', filter, '-map', '[v]', '-frames:v', String(video.frames),
    '-r', String(video.fps), '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-movflags', '+faststart', '-an', output];
};

/**
 * The listing cut of a loop longer than LISTING_MAX_SECONDS, or null when the loop fits. It keeps
 * the first LISTING_MAX_SECONDS and fades its last second into the loop's own last second, which
 * runs into frame 0: the replay does not jump and frame 0 still matches the cover still.
 */
export const listingCutArgs = (video: Pick<MockVideo, 'fps' | 'frames'>, input: string, output: string) => {
  const keep = Math.round(LISTING_MAX_SECONDS * video.fps);
  if (video.frames <= keep) return null;
  const fade = Math.round(LISTING_FADE_SECONDS * video.fps);
  const filter = `[0:v]trim=end_frame=${keep},setpts=PTS-STARTPTS[a];[1:v]trim=start_frame=${video.frames - fade},setpts=PTS-STARTPTS[b];`
    + `[a][b]xfade=transition=fade:duration=${fade / video.fps}:offset=${(keep - fade) / video.fps},format=yuv420p[v]`;
  return ['-y', '-v', 'error', '-i', input, '-i', input, '-filter_complex', filter, '-map', '[v]',
    '-r', String(video.fps), '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-movflags', '+faststart', '-an', output];
};
