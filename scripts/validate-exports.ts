import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {renderStill} from '@remotion/renderer';
import {PNG} from 'pngjs';
import {backgroundCatalog} from '../src/catalog';
import {hasTransparentBackground, type OutputFormat} from '../src/settings';
import {createBundle, exportBackground, projectRoot} from './export';
import {ffmpegPath, ffprobePath, runProcess} from './process';

type Probe = {
  streams: {codec_type: string; codec_name: string; width: number; height: number; avg_frame_rate: string; nb_read_frames: string}[];
  format: {duration: string};
};

const rgbError = (actual: Uint8Array, expected: Uint8Array) => {
  let total = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i += 4) {
    // RGB under fully transparent pixels has no visible meaning.
    if (expected[i + 3] < 20) continue;
    for (let c = 0; c < 3; c++) {total += Math.abs(actual[i + c] - expected[i + c]); count++;}
  }
  return total / Math.max(1, count);
};

const main = async () => {
  const {values} = parseArgs({options: {duration: {type: 'string', default: '0.4'}}});
  const durationSeconds = Number(values.duration);
  assert(Number.isFinite(durationSeconds) && durationSeconds >= 0.1, 'Use --duration >= 0.1.');
  await runProcess(ffmpegPath(), ['-version']);
  await runProcess(ffprobePath(), ['-version']);
  const destination = path.join(projectRoot, 'out', 'validation');
  await mkdir(destination, {recursive: true});
  const serveUrl = await createBundle();
  const report: Record<string, unknown>[] = [];
  const profiles: {format: OutputFormat; transparent: boolean; label: string}[] = [
    {format: 'mp4', transparent: true, label: 'flattened'},
    {format: 'webm', transparent: false, label: 'opaque'},
    {format: 'webm', transparent: true, label: 'alpha'},
    {format: 'gif', transparent: true, label: 'flattened'},
  ];
  for (const compositionId of Object.keys(backgroundCatalog)) {
    for (const profile of profiles) {
      const stem = `${compositionId}-${profile.label}`;
      const result = await exportBackground({
        compositionId, format: profile.format, serveUrl, overwrite: true,
        props: {durationSeconds, seed: 17, transparent: profile.transparent, backgroundColor: '#18304C'},
        output: path.join(destination, `${stem}.${profile.format}`),
      });
      const {composition, output, props} = result;
      const probe = JSON.parse((await runProcess(ffprobePath(), [
        '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', output,
      ])).toString()) as Probe;
      const stream = probe.streams.find((item) => item.codec_type === 'video');
      assert(stream, `${output}: sem vídeo`);
      assert.equal(stream.width, 1920);
      assert.equal(stream.height, 1080);
      assert.equal(Number(stream.nb_read_frames), composition.durationInFrames);
      assert.equal(stream.codec_name, {mp4: 'h264', webm: 'vp9', gif: 'gif'}[profile.format]);
      const [num, den] = stream.avg_frame_rate.split('/').map(Number);
      assert.equal(num / den, composition.fps);
      assert(Math.abs(Number(probe.format.duration) - composition.durationInFrames / composition.fps) < 0.025);
      assert(!probe.streams.some((item) => item.codec_type === 'audio'));
      if (profile.format === 'gif') {
        const bytes = await readFile(output);
        const extension = bytes.indexOf(Buffer.from('NETSCAPE2.0'));
        assert(extension >= 0, 'GIF sem extensão de repetição.');
        assert.deepEqual([...bytes.subarray(extension + 11, extension + 16)], [3, 1, 0, 0, 0], 'GIF deve repetir infinitamente.');
      }
      const reference = path.join(destination, `${stem}-${profile.format}-reference.png`);
      await renderStill({
        serveUrl, composition, inputProps: props, frame: 0, imageFormat: 'png',
        output: reference, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE, logLevel: 'error',
      });
      const decodeOptions = profile.format === 'webm' ? ['-c:v', 'libvpx-vp9'] : [];
      const actual = await runProcess(ffmpegPath(), [
        '-v', 'error', ...decodeOptions, '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
      ]);
      const expected = PNG.sync.read(await readFile(reference));
      assert.equal(actual.length, 1920 * 1080 * 4);
      let minAlpha = 255;
      let maxAlpha = 0;
      let partialAlpha = 0;
      let alphaError = 0;
      for (let i = 3; i < actual.length; i += 4) {
        const alpha = actual[i];
        minAlpha = Math.min(minAlpha, alpha);
        maxAlpha = Math.max(maxAlpha, alpha);
        if (alpha > 0 && alpha < 255) partialAlpha++;
        alphaError += Math.abs(alpha - expected.data[i]);
      }
      if (hasTransparentBackground(props)) {
        assert(minAlpha < 240 && maxAlpha > 20 && partialAlpha > 0, 'Alpha suave não foi preservado.');
        assert(alphaError / (1920 * 1080) < 2, 'Alpha exportado diverge do PNG de referência.');
        for (const [label, color] of [['light', 'white'], ['dark', '#0B0F19']]) {
          await runProcess(ffmpegPath(), [
            '-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=1920x1080:r=60`,
            '-c:v', 'libvpx-vp9', '-i', output,
            '-filter_complex', '[0:v][1:v]overlay=shortest=1:format=auto',
            '-frames:v', '1', path.join(destination, `${compositionId}-alpha-${label}.png`),
          ]);
        }
      } else {
        assert.equal(minAlpha, 255, 'Uma saída opaca contém transparência.');
      }
      const meanRgbError = rgbError(actual, expected.data);
      assert(meanRgbError < (profile.format === 'gif' ? 12 : 5), `A saída diverge do preview: erro RGB médio ${meanRgbError}.`);
      // Keep the decoded image for inspection alongside the original PNG.
      const decoded = new PNG({width: 1920, height: 1080});
      decoded.data = actual;
      await writeFile(path.join(destination, `${stem}-${profile.format}-decoded.png`), PNG.sync.write(decoded));
      report.push({file: output, width: stream.width, height: stream.height, fps: composition.fps, frames: composition.durationInFrames, codec: stream.codec_name, minAlpha, maxAlpha, meanRgbError});
      console.log(`OK: ${path.basename(output)}; erro RGB médio ${meanRgbError.toFixed(3)}`);
    }
  }
  await writeFile(path.join(destination, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Validação concluída: ${report.length} exports. Relatório em out/validation/report.json.`);
};

main().catch((error: unknown) => {console.error(error); process.exitCode = 1;});
