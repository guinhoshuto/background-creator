// `npm run validate:pack`: what the buyer actually gets, read back with ffprobe and ffmpeg. The zip
// checks (scripts/pack-contents.ts) prove the pack folder holds the plan's files; this proves each
// file is the media the plan describes: codec, size, rate, frame count, alpha, loop and bytes.
import {lstat, readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {hasAlpha, type OutputFormat} from '../src/settings';
import type {PlannedFile} from './pack-plan';
import {ffmpegPath, ffprobePath, runProcess} from './process';

/**
 * Twitch's panel editor takes images up to 2.9 MB (the figure every panel guide repeats, e.g.
 * https://megacatstudios.com/blogs/game-development/guide-for-twitch-images-size and
 * https://marketplace.elgato.com/learn/how-to/twitch-graphics-size-guide). Read as decimal
 * megabytes, the stricter reading, until an upload proves the editor counts in MiB.
 */
export const TWITCH_PANEL_MAX_BYTES = 2_900_000;

export const CODEC_OF: Record<OutputFormat, string> = {webm: 'vp9', mp4: 'h264', mov: 'prores', gif: 'gif', png: 'png'};

/** What one file holds, as read from disk; the pure check below compares it with the plan. */
export type MediaProbe = {
  bytes: number;
  codec: string | null;
  width: number;
  height: number;
  /** Frames per second from the stream's average rate; null for a still. */
  fps: number | null;
  /** Packets counted by ffprobe: one per frame for every format the packs ship. */
  frames: number;
  /** Seconds, from the container; null when it does not say (a still). */
  duration: number | null;
  audio: boolean;
  /** WebM only: the Matroska ALPHA_MODE tag VP9 alpha needs. */
  alphaTag: boolean;
  /** The lowest alpha of the first frame, decoded to RGBA. */
  minAlpha: number;
  /** GIF only: the NETSCAPE2.0 extension asks for endless looping. */
  loopsForever: boolean | null;
};

/** Whether the plan asks this file to keep transparency (the shared alpha rule). */
export const expectsAlpha = (file: Pick<PlannedFile, 'exportProps' | 'format'>) =>
  hasAlpha({transparent: file.exportProps.transparent === true, outputFormat: file.format});

/** Every way a probed file differs from its planned file; empty when it is what the plan says. */
export const mediaIssues = (file: PlannedFile, probe: MediaProbe): string[] => {
  const issues: string[] = [];
  const still = file.format === 'png';
  const expected = CODEC_OF[file.format];
  if (probe.codec !== expected) issues.push(`codec ${probe.codec ?? 'none'}, expected ${expected}`);
  if (probe.width !== file.canvas.width || probe.height !== file.canvas.height) {
    issues.push(`${probe.width}×${probe.height}, expected ${file.canvas.width}×${file.canvas.height}`);
  }
  if (probe.audio) issues.push('has an audio stream');
  if (!still) {
    if (probe.frames !== file.frames) issues.push(`${probe.frames} frames, expected ${file.frames}`);
    if (probe.fps === null || Math.abs(probe.fps - file.fps) > 1e-6) issues.push(`${probe.fps ?? 'no'} fps, expected ${file.fps}`);
    // Half a frame of slack: containers round the last timestamp.
    const seconds = file.frames / file.fps;
    if (probe.duration !== null && Math.abs(probe.duration - seconds) > 0.5 / file.fps) {
      issues.push(`lasts ${probe.duration.toFixed(3)} s, expected ${seconds.toFixed(3)} s`);
    }
  }
  if (expectsAlpha(file)) {
    if (file.format === 'webm' && !probe.alphaTag) issues.push('no ALPHA_MODE tag: players drop the alpha');
    if (probe.minAlpha === 255) issues.push('fully opaque, expected transparency');
  } else if (probe.minAlpha < 255) {
    issues.push(`has transparency (alpha ${probe.minAlpha}), expected opaque`);
  }
  if (file.format === 'gif' && probe.loopsForever !== true) issues.push('the GIF does not loop forever');
  if (file.size === 'twitch-panel' && probe.bytes > TWITCH_PANEL_MAX_BYTES) {
    issues.push(`${probe.bytes} B, over the ${TWITCH_PANEL_MAX_BYTES} B Twitch takes for a panel`);
  }
  return issues;
};

type FfprobeJson = {
  streams?: {codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string;
    nb_read_packets?: string; tags?: Record<string, string>}[];
  format?: {duration?: string};
};

const rate = (text: string | undefined) => {
  const [num, den] = (text ?? '').split('/').map(Number);
  return num && den ? num / den : null;
};

const loopsForever = (bytes: Buffer) => {
  const at = bytes.indexOf(Buffer.from('NETSCAPE2.0'));
  // Sub-block of 3 bytes, id 1, loop count 0 (forever).
  return at >= 0 && bytes[at + 11] === 3 && bytes[at + 12] === 1 && bytes[at + 13] === 0 && bytes[at + 14] === 0;
};

const minAlphaOf = (rgba: Buffer) => {
  let min = 255;
  for (let i = 3; i < rgba.length && min > 0; i += 4) min = Math.min(min, rgba[i]!);
  return min;
};

/** Reads one file back: ffprobe counts packets (no decode), and only the first frame is decoded. */
export const probeMedia = async (file: string, format: OutputFormat): Promise<MediaProbe> => {
  const bytes = (await lstat(file)).size;
  const json = JSON.parse((await runProcess(ffprobePath(), [
    '-v', 'error', '-count_packets', '-show_streams', '-show_format', '-of', 'json', file,
  ])).toString()) as FfprobeJson;
  const streams = json.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const width = video?.width ?? 0;
  const height = video?.height ?? 0;
  const tags = Object.fromEntries(Object.entries(video?.tags ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  let minAlpha = 255;
  if (format === 'png') minAlpha = minAlphaOf(PNG.sync.read(await readFile(file)).data);
  else if (video && width > 0 && height > 0) {
    // libvpx is the decoder that reads VP9 alpha back; ffmpeg's own drops it.
    const decoder = format === 'webm' ? ['-c:v', 'libvpx-vp9'] : [];
    const rgba = await runProcess(ffmpegPath(), ['-v', 'error', ...decoder, '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
    minAlpha = minAlphaOf(rgba);
  }
  const duration = Number(json.format?.duration);
  return {
    bytes,
    codec: video?.codec_name ?? null,
    width, height,
    fps: format === 'png' ? null : rate(video?.avg_frame_rate),
    frames: Number(video?.nb_read_packets ?? 0),
    duration: format === 'png' || !Number.isFinite(duration) ? null : duration,
    audio: streams.some((stream) => stream.codec_type === 'audio'),
    alphaTag: tags.alpha_mode === '1',
    minAlpha,
    loopsForever: format === 'gif' ? loopsForever(await readFile(file)) : null,
  };
};

/** Bytes per format and in all, for the report and the last line. */
export const byteTotals = (rows: readonly {format: OutputFormat; bytes: number}[]) => {
  const perFormat: Partial<Record<OutputFormat, number>> = {};
  for (const row of rows) perFormat[row.format] = (perFormat[row.format] ?? 0) + row.bytes;
  return {perFormat, total: rows.reduce((sum, row) => sum + row.bytes, 0)};
};
