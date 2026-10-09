// Animated stream mockups (`npm run qa:kit -- <pack> --video`): the same scenes as the still
// mockups (MOCK_LAYOUTS), built from the pack's own .webm files, one background loop long; a piece
// the pack ships only as .png stays still, as the buyer gets it. A loop longer than a listing video
// can be also gets a listing cut that cross-fades back into frame 0.
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
  /**
   * Where each file's top-left corner goes: the box position minus the file's bleed. `still`: a
   * .png held on every frame.
   */
  layers: {file: string; x: number; y: number; still?: true}[];
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
 * One video per requested mockup, from the pack plan's files. A scene needs the background as
 * .webm and every layer it names, as .webm or, when the pack ships that piece only as a still, as
 * .png: a layer the pack does not plan, or a .webm whose frame rate or loop differs from the
 * background's, refuses the mockup with the reason (a cut there would jump). A still has no loop.
 */
export const planMockVideos = (plan: readonly PlannedFile[], names: readonly string[]): MockVideo[] => {
  // An OBS mask shares its window's size and is a .png too: never a piece of the scene.
  const pieces = plan.filter((file) => file.role !== 'mask');
  const background = pieces.find((file) => file.kind === 'background' && file.format === 'webm');
  if (!background) throw new Error('The pack plans no .webm background: the mockup videos need one.');
  return names.map((name) => {
    const layout = MOCK_LAYOUTS.find((entry) => entry.out === name);
    if (!layout) throw new Error(`Unknown mockup "${name}". Use one of: ${MOCK_NAMES.join(', ')}.`);
    const layers = layout.layers.map(({size, variant, x, y}) => {
      const planned = (format: string) => pieces.find((entry) => entry.format === format && entry.size === size && entry.variant === variant);
      const file = planned('webm') ?? planned('png');
      const label = variant === undefined ? size : `${size} (${variant})`;
      if (!file) throw new Error(`${name} needs ${label} as .webm or .png, which the pack does not plan.`);
      const still = file.format === 'png';
      if (!still && (file.fps !== background.fps || file.frames !== background.frames)) {
        throw new Error(`${name}: ${label} runs ${file.frames} frames at ${file.fps} fps, the background ${background.frames} at ${background.fps}; the loop would jump.`);
      }
      const bleed = typeof file.exportProps.bleed === 'number' ? file.exportProps.bleed : 0;
      return {file: file.output, x: x - bleed, y: y - bleed, ...(still ? {still: true as const} : {})};
    });
    return {name, fps: background.fps, frames: background.frames, base: background.output, layers};
  });
};

/**
 * FFmpeg arguments that composite one mockup into an H.264 MP4 (the VP9 decoder keeps alpha). A
 * still loops at the video's frame rate with no end of its own: -frames:v ends the video.
 */
export const mockVideoArgs = (video: MockVideo, resolve: (relative: string) => string, output: string) => {
  const inputs = ['-i', resolve(video.base), ...video.layers.flatMap((layer) => [
    ...(layer.still ? ['-loop', '1', '-framerate', String(video.fps)] : ['-c:v', 'libvpx-vp9']), '-i', resolve(layer.file),
  ])];
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
