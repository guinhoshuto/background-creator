import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  baseBackgroundSchema,
  getCompositionMetadata,
  getExportPreset,
  hasTransparentBackground,
  outputFormatSchema,
} from '../src/settings';

test('shared defaults describe an opaque eight-second full-HD WebM', () => {
  const props = baseBackgroundSchema.parse({});
  assert.equal(props.durationSeconds, 8);
  assert.equal(props.seed, 1);
  assert.equal(props.transparent, false);
  assert.equal(props.backgroundColor, '#0B0F19');
  assert.equal(props.outputFormat, 'webm');
  assert.equal(props.colors.length, 3);
  assert.deepEqual(getCompositionMetadata(props), {
    width: 1920,
    height: 1080,
    fps: 60,
    durationInFrames: 480,
  });
});

test('duration is rounded to a whole frame at the selected format cadence', () => {
  assert.equal(getCompositionMetadata({durationSeconds: 1.234, outputFormat: 'mp4'}).durationInFrames, 74);
  assert.equal(getCompositionMetadata({durationSeconds: 1.234, outputFormat: 'webm'}).durationInFrames, 74);
  assert.deepEqual(getCompositionMetadata({durationSeconds: 1.234, outputFormat: 'gif'}), {
    width: 1920,
    height: 1080,
    fps: 50,
    durationInFrames: 62,
  });
  assert.equal(getCompositionMetadata({durationSeconds: 0.001, outputFormat: 'mp4'}).durationInFrames, 1);
});

test('invalid or unrepresentable duration is rejected before rendering', () => {
  for (const durationSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE]) {
    assert.throws(() => getCompositionMetadata({durationSeconds, outputFormat: 'webm'}));
  }
});

test('only transparent WebM preserves alpha; every other choice is flattened', () => {
  for (const outputFormat of outputFormatSchema.options) {
    for (const transparent of [true, false]) {
      assert.equal(hasTransparentBackground({outputFormat, transparent}), transparent && outputFormat === 'webm');
    }
  }
});

test('official encoding presets preserve full-quality settings and PNG intermediates', () => {
  assert.deepEqual(getExportPreset({outputFormat: 'mp4', transparent: true}), {
    codec: 'h264',
    imageFormat: 'png',
    pixelFormat: 'yuv420p',
    crf: 1,
    x264Preset: 'veryslow',
  });
  for (const transparent of [false, true]) {
    assert.deepEqual(getExportPreset({outputFormat: 'webm', transparent}), {
      codec: 'vp9',
      imageFormat: 'png',
      pixelFormat: transparent ? 'yuva420p' : 'yuv420p',
      crf: 0,
    });
  }
  assert.deepEqual(getExportPreset({outputFormat: 'gif', transparent: true}), {
    codec: 'gif',
    imageFormat: 'png',
    numberOfGifLoops: null,
  });
});

test('shared schema rejects malformed user input', () => {
  const invalidInputs = [
    {durationSeconds: 0},
    {durationSeconds: '8'},
    {durationSeconds: Number.POSITIVE_INFINITY},
    {seed: 1.5},
    {seed: Number.MAX_SAFE_INTEGER + 1},
    {transparent: 'true'},
    {colors: ['#FFFFFF']},
    {colors: Array<string>(7).fill('#FFFFFF')},
    {colors: [12, 34]},
    {outputFormat: 'mov'},
  ];
  for (const input of invalidInputs) {
    assert.equal(baseBackgroundSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});
