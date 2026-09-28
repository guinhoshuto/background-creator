import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ASSET_KINDS, OVERLAY_KINDS, kindPolicies} from '../src/kinds';
import {MAX_CANVAS, getBoxCanvas, overlayBoxSchema} from '../src/overlays/shared/box';
import {
  NAMED_SIZES, assetFileName, assetFileStem, canvasOf, getSize, matchNamedSize, sizeProps, sizeTag, sizesForKind,
} from '../src/sizes';

/** The product table from the SPEC: id, kind, box, bleed and the exact file size sold. */
const PRODUCT_TABLE = [
  ['chat-compacto', 'chat', 360, 480, 32, 424, 544],
  ['chat-padrao', 'chat', 400, 600, 32, 464, 664],
  ['chat-alto', 'chat', 400, 800, 32, 464, 864],
  ['chat-coluna', 'chat', 448, 1016, 32, 512, 1080],
  ['chat-vertical', 'chat', 960, 640, 32, 1024, 704],
  ['etiqueta-p', 'block', 320, 64, 24, 368, 112],
  ['etiqueta', 'block', 480, 96, 24, 528, 144],
  ['faixa', 'block', 1200, 160, 32, 1264, 224],
  ['titulo', 'block', 1200, 240, 32, 1264, 304],
  ['cartao', 'block', 640, 360, 32, 704, 424],
  ['quadrado', 'block', 480, 480, 32, 544, 544],
  ['lista', 'block', 480, 720, 32, 544, 784],
  ['circulo-p', 'block', 160, 160, 24, 208, 208],
  ['circulo', 'block', 320, 320, 32, 384, 384],
  ['circulo-g', 'block', 480, 480, 32, 544, 544],
  ['painel-twitch', 'block', 320, 160, 0, 320, 160],
  ['webcam-16x9', 'border', 640, 360, 48, 736, 456],
  ['webcam-16x9-g', 'border', 960, 540, 48, 1056, 636],
  ['webcam-4x3', 'border', 480, 360, 48, 576, 456],
  ['webcam-quadrada', 'border', 400, 400, 48, 496, 496],
  ['webcam-redonda-p', 'border', 280, 280, 48, 376, 376],
  ['webcam-redonda', 'border', 400, 400, 48, 496, 496],
  ['webcam-redonda-g', 'border', 560, 560, 48, 656, 656],
  ['webcam-vertical', 'border', 360, 640, 48, 456, 736],
  ['jogo', 'border', 1440, 810, 48, 1536, 906],
  ['tela-cheia', 'border', 1920, 1080, 0, 1920, 1080],
  ['tela-vertical', 'border', 1080, 1920, 0, 1080, 1920],
] as const;

test('tamanhos: a tabela bate exatamente com a linha de produtos, na mesma ordem', () => {
  assert.deepEqual(
    NAMED_SIZES.map((size) => {
      const canvas = canvasOf(size);
      return [size.id, size.kind, size.width, size.height, size.bleed, canvas.width, canvas.height];
    }),
    PRODUCT_TABLE.map((row) => [...row]),
  );
});

test('tamanhos: ids únicos, tipos válidos, tudo par e arquivo = caixa + 2·bleed', () => {
  assert.equal(new Set(NAMED_SIZES.map((size) => size.id)).size, NAMED_SIZES.length);
  for (const size of NAMED_SIZES) {
    assert.match(size.id, /^[a-z0-9-]+$/, `${size.id}: o id vira nome de arquivo`);
    assert.ok((OVERLAY_KINDS as readonly string[]).includes(size.kind), size.id);
    for (const value of [size.width, size.height, size.bleed]) {
      assert.ok(Number.isInteger(value) && value % 2 === 0, `${size.id}: ${value} precisa ser inteiro par`);
    }
    const canvas = canvasOf(size);
    assert.deepEqual(canvas, {width: size.width + 2 * size.bleed, height: size.height + 2 * size.bleed});
    assert.ok(canvas.width * canvas.height <= MAX_CANVAS.width * MAX_CANVAS.height, size.id);
    assert.equal(overlayBoxSchema(size).safeParse(sizeProps(size)).success, true, `${size.id}: o schema precisa aceitar`);
  }
});

test('tamanhos: rótulos e usos em inglês, sem campos vazios', () => {
  for (const size of NAMED_SIZES) {
    assert.ok(size.label.trim().length > 2, `${size.id}: rótulo vazio`);
    assert.ok(size.use.trim().length > 5, `${size.id}: uso vazio`);
    // Size ids quoted in the text (webcam-redonda) stay Portuguese until the renaming round; the prose around them does not.
    const prose = `${size.label} ${size.use}`.replace(/[a-z0-9]+(?:-[a-z0-9]+)+/g, '');
    assert.doesNotMatch(prose, /[à-ú]|\b(de|da|do|das|dos|na|para|com|em|ou|um|uma|sem|alt[oa]|grande|pequen[oa]|redond[oa]|quadrad[oa]|cheia|tela|jogo|faixa|etiqueta|lista|painel|canto)\b/i, `${size.id}: texto em português`);
  }
  assert.equal(getSize('chat-padrao').label, 'Standard chat');
});

test('tamanhos: só as molduras de tela inteira usam fit tela, sempre sem bleed', () => {
  for (const size of NAMED_SIZES) {
    const fit = size.props?.fit;
    assert.equal(fit === 'tela', size.id.startsWith('tela-'), size.id);
    if (fit === 'tela') {
      assert.equal(size.kind, 'border');
      assert.equal(size.bleed, 0);
    }
  }
  assert.deepEqual(sizeProps(getSize('tela-cheia')), {width: 1920, height: 1080, bleed: 0, fit: 'tela', shape: 'retangulo'});
  assert.deepEqual(sizeProps(getSize('webcam-16x9')), {width: 640, height: 360, bleed: 48, fit: 'janela', shape: 'retangulo'});
  // The id alone fixes the product: every border size spells out its fit.
  for (const size of sizesForKind('border')) assert.ok(size.props?.fit, size.id);
  // Chat and block have no fit: an unparsed border without one is still a window.
  assert.equal(sizeTag('border', {width: 640, height: 360, bleed: 48}), 'webcam-16x9');
  assert.equal(sizeTag('border', {width: 1920, height: 1080, bleed: 0}), '1920x1080');
});

test('tamanhos: getSize lista as opções em inglês; sizesForKind separa por tipo', () => {
  assert.throws(() => getSize('gigante'), /Unknown size: gigante\. Options: chat-compacto, .*tela-vertical\./);
  assert.throws(() => getSize('__proto__'), /Unknown size/);
  for (const kind of ASSET_KINDS) {
    for (const size of sizesForKind(kind)) assert.equal(size.kind, kind);
  }
  assert.deepEqual(sizesForKind('background'), []);
  assert.equal(
    OVERLAY_KINDS.reduce((count, kind) => count + sizesForKind(kind).length, 0),
    NAMED_SIZES.length,
  );
  assert.deepEqual(sizesForKind('chat').map((size) => size.id), ['chat-compacto', 'chat-padrao', 'chat-alto', 'chat-coluna', 'chat-vertical']);
});

test('tamanhos: o tamanho padrão de cada tipo existe e é do próprio tipo', () => {
  for (const kind of OVERLAY_KINDS) {
    const id = kindPolicies[kind].defaultSizeId;
    assert.ok(id, kind);
    assert.equal(getSize(id).kind, kind);
  }
});

test('nomes de arquivo: fundos sem tamanho, tamanhos do catálogo pelo id, livres por LxA da caixa', () => {
  assert.equal(assetFileName({id: 'GradientLoop', kind: 'background', props: {}, format: 'webm'}), 'GradientLoop.webm');
  // Remotion's defaultOutName gets the stem: it appends the codec's extension itself.
  assert.equal(assetFileStem({id: 'GradientLoop', kind: 'background', props: {}}), 'GradientLoop');
  assert.equal(assetFileStem({id: 'ChatLoop', kind: 'chat', props: {width: 400, height: 600, bleed: 32}}), 'ChatLoop-chat-padrao');
  assert.equal(
    assetFileName({id: 'BorderLoop', kind: 'border', props: {width: 640, height: 360, bleed: 48, fit: 'janela'}, format: 'mov'}),
    'BorderLoop-webcam-16x9.mov',
  );
  assert.equal(
    assetFileName({id: 'BorderLoop', kind: 'border', props: {width: 1920, height: 1080, bleed: 0, fit: 'tela'}, format: 'png'}),
    'BorderLoop-tela-cheia.png',
  );
  // The same box drawn as a window is a different product than the full-screen frame.
  assert.equal(sizeTag('border', {width: 1920, height: 1080, bleed: 0, fit: 'janela'}), '1920x1080');
  assert.equal(sizeTag('border', {width: 640, height: 360, bleed: 48, fit: 'tela'}), '640x360');
  // Another bleed is another file size, so it is no longer the named size.
  assert.equal(sizeTag('chat', {width: 400, height: 600, bleed: 40}), '400x600');
  assert.equal(sizeTag('chat', {width: 400, height: 600, bleed: 32}), 'chat-padrao');
  assert.equal(assetFileName({id: 'BlockLoop', kind: 'block', props: {width: 500, height: 100, bleed: 24}, format: 'webm'}), 'BlockLoop-500x100.webm');
  // A window's OBS mask has no bleed but keeps its size's name, tagged as the mask.
  assert.equal(
    assetFileName({id: 'BorderLoop', kind: 'border', props: {width: 640, height: 360, bleed: 0, fit: 'janela', mascara: true}, format: 'png'}),
    'BorderLoop-webcam-16x9-mascara.png',
  );
  assert.equal(
    assetFileName({id: 'BorderLoop', kind: 'border', props: {width: 500, height: 300, bleed: 0, fit: 'janela', mascara: true}, format: 'png'}),
    'BorderLoop-500x300-mascara.png',
  );
  // Sizes of another kind never name a file.
  assert.equal(matchNamedSize('block', {width: 400, height: 600, bleed: 32}), undefined);
  assert.throws(() => sizeTag('chat', {}), /width\/height/);
});

test('caixa: ímpares e arquivos acima de 4K são recusados em inglês', () => {
  const schema = overlayBoxSchema({width: 400, height: 600, bleed: 32});
  for (const [field, input] of [
    ['width', {width: 401}], ['height', {height: 599}], ['bleed', {bleed: 33}],
  ] as const) {
    const result = schema.safeParse(input);
    assert(!result.success, field);
    assert.equal(result.error.issues[0]?.message, `${field} must be even: H.264 silently crops 1 px off odd dimensions.`);
  }
  for (const input of [{width: 14}, {width: 3842}, {bleed: -2}, {bleed: 258}, {width: 400.5}]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const input of [{width: 3840, height: 2160, bleed: 2}, {width: 3840, height: 16, bleed: 2}, {width: 3000, height: 3000, bleed: 0}]) {
    const result = schema.safeParse(input);
    assert(!result.success, JSON.stringify(input));
    assert.match(result.error.issues[0]!.message, /above the 3840×2160 limit: reduce width, height or bleed\.$/);
  }
});

test('caixa: tamanhos livres pares são aceitos, até exatamente 4K', () => {
  const schema = overlayBoxSchema({width: 400, height: 600, bleed: 32});
  assert.deepEqual(schema.parse({}), {width: 400, height: 600, bleed: 32});
  for (const input of [
    {width: 16, height: 16, bleed: 0}, {width: 502, height: 318, bleed: 10}, {width: 3840, height: 2160, bleed: 0},
    {width: 2160, height: 3840, bleed: 0}, {width: 3776, height: 2096, bleed: 32},
  ]) {
    assert.deepEqual(schema.parse(input), input);
  }
});

test('caixa: o arquivo centraliza a caixa dentro do bleed', () => {
  assert.deepEqual(getBoxCanvas({width: 640, height: 360, bleed: 48}), {
    canvas: {width: 736, height: 456},
    box: {x: 48, y: 48, width: 640, height: 360},
  });
  for (const size of NAMED_SIZES) {
    assert.deepEqual(getBoxCanvas(size).canvas, canvasOf(size), size.id);
  }
});
