import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  ALPHA_FORMATS,
  baseBackgroundSchema,
  evenPx,
  getCompositionMetadata,
  getExportPreset,
  hasAlpha,
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

test('a regra de alpha vale para os cinco formatos: WebM, MOV e PNG preservam; MP4 e GIF compõem', () => {
  const expected = {webm: true, mov: true, png: true, mp4: false, gif: false} as const;
  assert.deepEqual([...outputFormatSchema.options].sort(), Object.keys(expected).sort());
  for (const outputFormat of outputFormatSchema.options) {
    for (const transparent of [true, false]) {
      assert.equal(hasAlpha({outputFormat, transparent}), transparent && expected[outputFormat], `${outputFormat} ${transparent}`);
      assert.equal(hasTransparentBackground({outputFormat, transparent}), hasAlpha({outputFormat, transparent}));
    }
  }
  assert.deepEqual([...ALPHA_FORMATS].sort(), ['mov', 'png', 'webm']);
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

test('MOV é ProRes 4444 com alpha de 10 bits só quando transparente; PNG é um still sem codec de vídeo', () => {
  for (const transparent of [false, true]) {
    assert.deepEqual(getExportPreset({outputFormat: 'mov', transparent}), {
      codec: 'prores',
      imageFormat: 'png',
      proResProfile: '4444',
      pixelFormat: transparent ? 'yuva444p10le' : 'yuv444p10le',
    });
    assert.deepEqual(getExportPreset({outputFormat: 'png', transparent}), {codec: null, imageFormat: 'png'});
  }
});

test('MOV e PNG seguem a cadência de 60 fps; o tamanho padrão continua 1920×1080', () => {
  for (const outputFormat of ['mov', 'png'] as const) {
    assert.deepEqual(getCompositionMetadata({durationSeconds: 8, outputFormat}), {
      width: 1920, height: 1080, fps: 60, durationInFrames: 480,
    });
  }
});

test('um tamanho explícito muda só largura e altura dos metadados', () => {
  const props = {durationSeconds: 1.234, outputFormat: 'gif'} as const;
  assert.deepEqual(getCompositionMetadata(props, {width: 464, height: 664}), {
    ...getCompositionMetadata(props), width: 464, height: 664,
  });
});

test('evenPx recusa ímpares com a mensagem do H.264 e aceita pares no intervalo', () => {
  const schema = evenPx('width', {min: 16, max: 3840});
  for (const value of [16, 18, 640, 3840]) assert.equal(schema.safeParse(value).success, true, String(value));
  for (const value of [14, 3842, 1.5, Number.NaN, '640']) assert.equal(schema.safeParse(value).success, false, String(value));
  const odd = schema.safeParse(641);
  assert(!odd.success);
  assert.equal(odd.error.issues[0]?.message, 'width must be even: H.264 silently crops 1 px off odd dimensions.');
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
    {outputFormat: 'avi'},
    {outputFormat: 'MOV'},
  ];
  for (const input of invalidInputs) {
    assert.equal(baseBackgroundSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});

test('shared schema reports invalid input in English', () => {
  const result = baseBackgroundSchema.safeParse({seed: Number.NaN});
  assert(!result.success);
  assert.deepEqual(result.error.issues[0]?.path, ['seed']);
  assert.equal(result.error.issues[0]?.message, 'Invalid input: expected number, received NaN');
});

test('backgroundColor refuses a colour with alpha, in English', () => {
  const result = baseBackgroundSchema.safeParse({backgroundColor: '#0B0F1980'});
  assert(!result.success);
  assert.deepEqual(result.error.issues[0]?.path, ['backgroundColor']);
  assert.equal(result.error.issues[0]?.message, 'Use an opaque colour in the #RRGGBB format.');
});
