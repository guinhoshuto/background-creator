import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {renderStill, selectComposition} from '@remotion/renderer';
import {PNG} from 'pngjs';
import {assetCatalog, getOpenGlRenderer} from '../src/catalog';
import {ASSET_KINDS, getKindPolicy, type AssetKind} from '../src/kinds';
import {hasAlpha, type OutputFormat} from '../src/settings';
import {canvasOf, sizeProps, sizesForKind, type NamedSize} from '../src/sizes';
import {createBundle, exportAsset, projectRoot, resolveExport} from './export';
import {compositedRgbError} from './image-comparison';
import {ffmpegPath, ffprobePath, runProcess} from './process';
import {parseValidateArgs} from './validate-args';

type Probe = {
  streams: {
    codec_type: string; codec_name: string; pix_fmt?: string; profile?: string; codec_tag_string?: string;
    width: number; height: number; avg_frame_rate: string; nb_read_frames: string;
  }[];
  format: {duration: string};
};

type Profile = {format: OutputFormat; transparent: boolean; label: string};

const CODEC_NAMES: Record<OutputFormat, string> = {mp4: 'h264', webm: 'vp9', gif: 'gif', mov: 'prores', png: 'png'};

/** Backgrounds keep their four historical profiles; overlays are alpha-first plus one flattened MP4. */
const profilesFor = (kind: AssetKind): Profile[] => kind === 'background'
  ? [
    {format: 'mp4', transparent: true, label: 'flattened'},
    {format: 'webm', transparent: false, label: 'opaque'},
    {format: 'webm', transparent: true, label: 'alpha'},
    {format: 'gif', transparent: true, label: 'flattened'},
  ]
  : [
    {format: 'webm', transparent: true, label: 'alpha'},
    {format: 'mov', transparent: true, label: 'alpha'},
    {format: 'png', transparent: true, label: 'alpha'},
    {format: 'mp4', transparent: true, label: 'flattened'},
  ];

/** A few sizes per sized kind, not every product size: the smallest file and the tallest one. */
const fixtureSizes = (kind: AssetKind): (NamedSize | null)[] => {
  if (kind === 'background') return [null];
  const sizes = sizesForKind(kind);
  if (sizes.length === 0) return [];
  const area = (size: NamedSize) => canvasOf(size).width * canvasOf(size).height;
  const smallest = sizes.reduce((best, size) => (area(size) < area(best) ? size : best));
  const tallest = sizes.reduce((best, size) => (canvasOf(size).height > canvasOf(best).height ? size : best));
  return smallest === tallest ? [smallest] : [smallest, tallest];
};

/** Decoders that read alpha back: libvpx for VP9 alpha, ffmpeg's default ProRes decoder otherwise. */
const decoderFor = (format: OutputFormat) => (format === 'webm' ? ['-c:v', 'libvpx-vp9'] : []);

const main = async () => {
  const {values, destination} = parseValidateArgs(process.argv.slice(2), projectRoot);
  const durationSeconds = Number(values.duration);
  assert(Number.isFinite(durationSeconds) && durationSeconds >= 0.1, 'Use --duration >= 0.1.');
  const kinds = values.kind === undefined ? ASSET_KINDS : [getKindPolicy(values.kind).kind];
  await runProcess(ffmpegPath(), ['-version']);
  await runProcess(ffprobePath(), ['-version']);
  await mkdir(destination, {recursive: true});
  const serveUrl = await createBundle();
  const report: Record<string, unknown>[] = [];
  const reportPath = path.join(destination, 'report.json');
  await writeFile(reportPath, JSON.stringify(report));
  // Strictly sequential: one render at a time keeps memory and disk use bounded.
  for (const kind of kinds) {
    // A kind with no compositions yet simply has nothing to validate.
    for (const asset of Object.values(assetCatalog).filter((entry) => entry.kind === kind)) {
      const compositionId = asset.id;
      const chromiumOptions = {gl: getOpenGlRenderer(asset)};
      for (const size of fixtureSizes(kind)) {
        for (const profile of profilesFor(kind)) {
          const stem = [compositionId, size?.id, profile.label].filter(Boolean).join('-');
          const file = `${stem}.${profile.format}`;
          if (values.only !== undefined && !file.includes(values.only)) continue;
          const options = {
            compositionId, format: profile.format, serveUrl, overwrite: true,
            // Fixed fixtures keep validation independent of a user's saved Studio edits.
            props: {
              ...asset.defaultProps, durationSeconds, seed: 17, transparent: profile.transparent, backgroundColor: '#18304C',
              ...(size ? sizeProps(size) : {}),
            },
            output: path.join(destination, file),
          };
          const result = values['reuse-existing'] && existsSync(options.output)
            ? await (async () => {
              console.log(`Checking existing file: ${path.basename(options.output)}`);
              const resolved = resolveExport(options);
              const composition = await selectComposition({
                serveUrl, id: compositionId, inputProps: resolved.inputProps,
                browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE, chromiumOptions,
              });
              return {composition, output: resolved.output, props: asset.schema.parse(composition.props)};
            })()
            : await exportAsset(options);
          const {composition, output, props} = result;
          const {width, height, fps} = composition;
          const isStill = profile.format === 'png';
          const probe = JSON.parse((await runProcess(ffprobePath(), [
            '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', output,
          ])).toString()) as Probe;
          const stream = probe.streams.find((item) => item.codec_type === 'video');
          assert(stream, `${output}: no video stream.`);
          assert.equal(stream.width, width);
          assert.equal(stream.height, height);
          assert.equal(stream.codec_name, CODEC_NAMES[profile.format]);
          if (!isStill) {
            assert.equal(Number(stream.nb_read_frames), composition.durationInFrames);
            const [num, den] = stream.avg_frame_rate.split('/').map(Number);
            assert.equal(num / den, fps);
            assert(Math.abs(Number(probe.format.duration) - composition.durationInFrames / fps) < 0.025);
          }
          assert(!probe.streams.some((item) => item.codec_type === 'audio'));
          if (profile.format === 'mov') {
            // FFmpeg decodes 4444 (ap4h) at 12 bits whatever the encoder wrote, so check the plane layout, not the depth.
            assert.equal(stream.codec_tag_string, 'ap4h', 'The MOV must be ProRes 4444.');
            assert.match(stream.pix_fmt ?? '', hasAlpha(props) ? /^yuva444p1[02]le$/ : /^yuv444p1[02]le$/, 'ProRes 4444 with the wrong pixel format.');
          }
          if (profile.format === 'gif') {
            const bytes = await readFile(output);
            const extension = bytes.indexOf(Buffer.from('NETSCAPE2.0'));
            assert(extension >= 0, 'GIF without a loop extension.');
            assert.deepEqual([...bytes.subarray(extension + 11, extension + 16)], [3, 1, 0, 0, 0], 'The GIF must loop forever.');
          }
          const reference = path.join(destination, `${stem}-${profile.format}-reference.png`);
          await renderStill({
            serveUrl, composition, inputProps: props, frame: 0, imageFormat: 'png',
            output: reference, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE, logLevel: 'error',
            chromiumOptions,
          });
          const actual = isStill
            // pngjs expands every PNG colour type to straight 8-bit RGBA.
            ? PNG.sync.read(await readFile(output)).data
            : await runProcess(ffmpegPath(), [
              '-v', 'error', ...decoderFor(profile.format), '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
            ]);
          const expected = PNG.sync.read(await readFile(reference));
          assert.equal(actual.length, width * height * 4);
          let minAlpha = 255;
          let maxAlpha = 0;
          let partialAlpha = 0;
          let alphaError = 0;
          let visibleAlphaError = 0;
          let alphaPixels = 0;
          for (let i = 3; i < actual.length; i += 4) {
            const alpha = actual[i];
            minAlpha = Math.min(minAlpha, alpha);
            maxAlpha = Math.max(maxAlpha, alpha);
            if (alpha > 0 && alpha < 255) partialAlpha++;
            const difference = Math.abs(alpha - expected.data[i]);
            alphaError += difference;
            if (alpha === 0 && expected.data[i] === 0) continue;
            visibleAlphaError += difference;
            alphaPixels++;
          }
          const meanAlphaError = alphaError / (width * height);
          // Averaging over the empty canvas would let a thin border with a wrong alpha pass.
          const meanVisibleAlphaError = visibleAlphaError / Math.max(1, alphaPixels);
          if (hasAlpha(props)) {
            assert(minAlpha < 240 && maxAlpha > 20 && partialAlpha > 0, 'Soft alpha was not preserved.');
            // Backgrounds keep their historical full-frame limit (sparse ones sit far above 2 per visible pixel).
            // The overlay limit starts at the same 2 and must be revisited after the first real render.
            const alphaErrorForKind = kind === 'background' ? meanAlphaError : meanVisibleAlphaError;
            assert(alphaErrorForKind < 2, `Exported alpha differs from the reference PNG: mean error ${alphaErrorForKind.toFixed(3)}.`);
            for (const [label, color] of [['light', 'white'], ['dark', '#0B0F19']]) {
              await runProcess(ffmpegPath(), [
                '-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${width}x${height}:r=${fps}`,
                ...decoderFor(profile.format), '-i', output,
                '-filter_complex', '[0:v][1:v]overlay=shortest=1:format=auto',
                '-frames:v', '1', path.join(destination, `${stem}-${profile.format}-alpha-${label}.png`),
              ]);
            }
          } else {
            assert.equal(minAlpha, 255, 'An opaque output contains transparency.');
          }
          const rgbErrorOnLight = compositedRgbError(actual, expected.data, [255, 255, 255]);
          const rgbErrorOnDark = compositedRgbError(actual, expected.data, [11, 15, 25]);
          const meanRgbError = Math.max(rgbErrorOnLight, rgbErrorOnDark);
          assert(meanRgbError < (profile.format === 'gif' ? 12 : 5), `The composited output differs from the preview: mean RGB error ${meanRgbError}.`);
          // Keep the decoded image for inspection alongside the original PNG.
          const decoded = new PNG({width, height});
          decoded.data = Buffer.from(actual);
          await writeFile(path.join(destination, `${stem}-${profile.format}-decoded.png`), PNG.sync.write(decoded));
          report.push({
            file: output, kind, size: size?.id ?? null, width: stream.width, height: stream.height, fps,
            frames: isStill ? 1 : composition.durationInFrames, codec: stream.codec_name,
            minAlpha, maxAlpha, meanAlphaError, meanVisibleAlphaError, rgbErrorOnLight, rgbErrorOnDark,
          });
          await writeFile(reportPath, JSON.stringify(report, null, 2));
          console.log(`OK: ${path.basename(output)}; mean RGB error ${meanRgbError.toFixed(3)}`);
        }
      }
    }
  }
  console.log(`Validation done: ${report.length} exports. Report in ${path.relative(process.cwd(), reportPath) || reportPath}.`);
};

main().catch((error: unknown) => {console.error(error); process.exitCode = 1;});
