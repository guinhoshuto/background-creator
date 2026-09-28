import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {
  SCRATCH_PREFIX, assertExportable, buildSidecar, findScratchDirectories, guardScratch, motionText, publishInOrder,
  removeScratchDirectories, resolveExport, sidecarPath,
} from '../scripts/export';
import {HELP_TEXT, buildExportOptions, expandSize, listText, parseRenderArgs} from '../scripts/render-args';
import {baseBackgroundSchema, hasAlpha, outputFormatSchema} from '../src/settings';
import {getLayoutOf, getMotionOf} from '../src/catalog';
import {getSize, sizeProps, sizeTag} from '../src/sizes';

test('the requested encoder format overrides saved preview props', () => {
  const result = resolveExport({compositionId: 'ParticleLoop', format: 'gif', props: {outputFormat: 'webm', transparent: true, durationSeconds: 2.25}});
  assert.equal(result.props.outputFormat, 'gif');
  assert.equal(result.props.durationSeconds, 2.25);
  assert.equal(result.preset.codec, 'gif');
  assert(result.output.endsWith('ParticleLoop.gif'));
  assert.deepEqual(result.inputProps, {durationSeconds: 2.25, transparent: true, outputFormat: 'gif'});
  assert.equal('seed' in result.inputProps, false, 'Do not mask saved Studio defaults with schema defaults');
});

test('invalid composition, unknown props, and mismatched extension fail before rendering', () => {
  assert.throws(() => resolveExport({compositionId: 'Unknown', format: 'mp4'}));
  assert.throws(() => resolveExport({compositionId: 'GradientLoop', format: 'mp4', props: {typo: 12}}));
  assert.throws(() => resolveExport({compositionId: 'GradientLoop', format: 'mp4', output: 'wrong.webm'}), /extension/);
});

test('the flattening color cannot contain alpha', () => {
  for (const backgroundColor of ['transparent', '#ffffff00', 'rgba(255,0,0,0.5)', '#fff']) {
    assert.equal(baseBackgroundSchema.safeParse({backgroundColor}).success, false);
  }
  assert.equal(baseBackgroundSchema.safeParse({backgroundColor: '#AAbbCC'}).success, true);
});

test('export: fundos mantêm o nome <Id>.<ext> em todos os formatos', () => {
  for (const format of outputFormatSchema.options) {
    const result = resolveExport({compositionId: 'GradientLoop', format});
    assert.equal(path.basename(result.output), `GradientLoop.${format}`);
    assert.equal(result.asset.kind, 'background');
    assert.equal(result.sidecar, null, 'fundos não publicam JSON de layout');
  }
});

test('export: MOV sai em ProRes 4444 e PNG vira um still no frame pedido', () => {
  const mov = resolveExport({compositionId: 'ParticleLoop', format: 'mov', props: {transparent: true}});
  assert.equal(mov.preset.codec, 'prores');
  assert.equal(mov.preset.pixelFormat, 'yuva444p10le');
  assert.equal(hasAlpha(mov.props), true);
  assert.equal(mov.frame, null);
  const png = resolveExport({compositionId: 'ParticleLoop', format: 'png', props: {transparent: true}});
  assert.equal(png.preset.codec, null);
  assert.equal(png.frame, 0);
  assert.equal(hasAlpha(png.props), true);
  assert.equal(resolveExport({compositionId: 'ParticleLoop', format: 'png', frame: 479}).frame, 479);
  assert.throws(() => resolveExport({compositionId: 'ParticleLoop', format: 'png', frame: 480}), /from 0 to 479/);
  assert.throws(() => resolveExport({compositionId: 'ParticleLoop', format: 'png', frame: 1.5}), /integer/);
  assert.throws(() => resolveExport({compositionId: 'ParticleLoop', format: 'mp4', frame: 3}), /--frame only with --format png/);
  assert.throws(() => resolveExport({compositionId: 'GradientLoop', format: 'mov', output: 'wrong.mp4'}), /\.mov extension/);
  assert.throws(() => resolveExport({compositionId: 'GradientLoop', format: 'png', output: 'wrong.webm'}), /\.png extension/);
  assert(resolveExport({compositionId: 'GradientLoop', format: 'png', output: 'still.PNG'}).output.endsWith('still.PNG'));
});

test('export: guides ligado nunca vira arquivo', () => {
  assert.throws(() => assertExportable({guides: true}), /^Error: Turn guides off to export\.$/);
  assert.doesNotThrow(() => assertExportable({guides: false}));
  assert.doesNotThrow(() => assertExportable({}));
  // Backgrounds have no guides at all: the strict schema refuses the key.
  assert.throws(() => resolveExport({compositionId: 'GradientLoop', format: 'webm', props: {guides: true}}));
});

test('export: o JSON de layout descreve o arquivo com chaves em inglês', () => {
  const asset = {id: 'BorderLoop', kind: 'border', component: null, schema: null, defaultProps: {}} as const;
  const layout = {
    canvas: {width: 736, height: 456},
    box: {x: 48, y: 48, width: 640, height: 360},
    content: {x: 48, y: 48, width: 640, height: 360},
    hole: {x: 48, y: 48, width: 640, height: 360},
    outset: 30,
  };
  const props = {width: 640, height: 360, bleed: 48, fit: 'janela', transparent: true, outputFormat: 'png'} as const;
  const output = '/tmp/out/BorderLoop-webcam-16x9.png';
  assert.equal(sidecarPath(output), '/tmp/out/BorderLoop-webcam-16x9.png.json');
  assert.deepEqual(buildSidecar({output, asset, props, layout, fps: 60, durationInFrames: 480, format: 'png', frame: 12}), {
    file: 'BorderLoop-webcam-16x9.png', kind: 'border', size: 'webcam-16x9',
    canvas: layout.canvas, box: layout.box, content: layout.content, hole: layout.hole, bleed: 48,
    fps: 60, frames: 1, frame: 12, format: 'png', alpha: true, props,
  });
  const video = buildSidecar({
    output: '/tmp/x.mp4', asset, props: {...props, outputFormat: 'mp4'}, layout: {...layout, hole: undefined},
    fps: 60, durationInFrames: 480, format: 'mp4', frame: null,
  });
  assert.equal(video.frames, 480);
  assert.equal(video.alpha, false);
  assert.equal(video.hole, null);
  assert.equal('frame' in video, false);
});

test('export: o JSON de layout e o log trazem a velocidade real, que difere da pedida', () => {
  for (const [id, sizeId] of [['ChatLoop', 'chat-coluna'], ['BlockLoop', 'titulo'], ['BorderLoop', 'jogo']] as const) {
    const resolved = resolveExport({compositionId: id, format: 'webm', props: sizeProps(getSize(sizeId))});
    const layout = getLayoutOf(resolved.asset)!(resolved.props);
    const sidecar = buildSidecar({
      output: resolved.output, asset: resolved.asset, props: resolved.props, layout, fps: 60, durationInFrames: 480, format: 'webm', frame: null,
    });
    const motion = getMotionOf(resolved.asset)!(resolved.props);
    assert.deepEqual(sidecar.motion, motion, id);
    // Whole comet spacings per cycle: close to the 160 px/s asked on every size, but rounded.
    const asked = (resolved.props as {strokeSpeed: number}).strokeSpeed;
    assert.notEqual(motion.strokeSpeed, asked, `${id}: ${motion.strokeSpeed}`);
    assert.ok(Math.abs(motion.strokeSpeed / asked - 1) <= 0.35, `${id}: ${motion.strokeSpeed}`);
    assert.equal(motionText(motion), `Actual speed: stroke ${motion.strokeSpeed} px/s, fill ${motion.fillSpeed} px/s (rounded to whole periods per cycle).`);
  }
});

test('export: o JSON da borda avulsa não aponta uma máscara que o comando não gera; a máscara sai como <Id>-<tamanho>-mascara.png', () => {
  const frame = resolveExport({compositionId: 'BorderLoop', format: 'webm', props: sizeProps(getSize('webcam-quadrada'))});
  const layout = getLayoutOf(frame.asset)!(frame.props);
  const sidecar = buildSidecar({
    output: frame.output, asset: frame.asset, props: frame.props, layout, fps: 60, durationInFrames: 480, format: 'webm', frame: null,
  });
  // exportAsset renders only the requested file: naming a mask here would point at nothing in out/.
  assert.equal('mask' in sidecar, false);
  // The CLI way to the mask: the size, no bleed, mask on, PNG.
  const options = buildExportOptions(parseRenderArgs(['BorderLoop', '--format', 'png', '--size', 'webcam-quadrada', '--bleed', '0']), {mascara: true});
  const mask = resolveExport(options);
  assert.equal(path.basename(mask.output), 'BorderLoop-webcam-quadrada-mascara.png');
  assert.deepEqual(getLayoutOf(mask.asset)!(mask.props).canvas, {width: 400, height: 400});
  const maskSidecar = buildSidecar({
    output: mask.output, asset: mask.asset, props: mask.props, layout: getLayoutOf(mask.asset)!(mask.props),
    fps: 60, durationInFrames: 480, format: 'png', frame: 0,
  });
  assert.equal(maskSidecar.size, 'webcam-quadrada');
  assert.equal('mask' in maskSidecar, false, 'uma máscara não aponta outra');
  // A screen frame has no window mask.
  const screen = resolveExport({compositionId: 'BorderLoop', format: 'webm', props: sizeProps(getSize('tela-cheia'))});
  const screenSidecar = buildSidecar({
    output: screen.output, asset: screen.asset, props: screen.props, layout: getLayoutOf(screen.asset)!(screen.props),
    fps: 60, durationInFrames: 480, format: 'webm', frame: null,
  });
  assert.equal('mask' in screenSidecar, false);
  // Keeping the size's bleed is refused with the way out.
  assert.throws(() => resolveExport(buildExportOptions(parseRenderArgs(['BorderLoop', '--format', 'png', '--size', 'webcam-quadrada']), {mascara: true})),
    /use bleed 0 \(with --size, add --bleed 0\)/);
});

test('export: o JSON é publicado antes do vídeo e removido se o vídeo falhar', async () => {
  const calls: string[] = [];
  const pairs = [['tmp/render.json', 'out/X.webm.json'], ['tmp/render.webm', 'out/X.webm']] as const;
  await publishInOrder(pairs, async (_from, to) => {calls.push(`publish ${to}`);}, async (file) => {calls.push(`remove ${file}`);});
  assert.deepEqual(calls, ['publish out/X.webm.json', 'publish out/X.webm']);
  calls.length = 0;
  await assert.rejects(publishInOrder(pairs, async (_from, to) => {
    if (to.endsWith('.webm')) throw new Error('EEXIST');
    calls.push(`publish ${to}`);
  }, async (file) => {calls.push(`remove ${file}`);}), /EEXIST/);
  // A video on disk therefore always has its placement data next to it.
  assert.deepEqual(calls, ['publish out/X.webm.json', 'remove out/X.webm.json']);
});

test('export: a pasta temporária tem um prefixo único e neutro', () => {
  assert.equal(SCRATCH_PREFIX, '.asset-render-');
  assert.equal(path.basename(SCRATCH_PREFIX), SCRATCH_PREFIX);
});

test('export: pastas temporárias deixadas por um export interrompido são achadas em qualquer nível e removidas', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'scratch-sweep-'));
  try {
    const pack = path.join(root, 'packs', 'neon');
    const nested = path.join(pack, 'borders', `${SCRATCH_PREFIX}abc123`, 'frames');
    mkdirSync(nested, {recursive: true});
    writeFileSync(path.join(nested, 'element-000.png'), 'x');
    mkdirSync(path.join(pack, `${SCRATCH_PREFIX}def456`));
    // Real output, a file that only looks alike, and a missing root are left alone.
    writeFileSync(path.join(pack, 'borders', 'BorderLoop-jogo.webm'), 'x');
    writeFileSync(path.join(pack, `${SCRATCH_PREFIX}arquivo`), 'x');
    const expected = [path.join(pack, 'borders', `${SCRATCH_PREFIX}abc123`), path.join(pack, `${SCRATCH_PREFIX}def456`)].sort();
    assert.deepEqual((await findScratchDirectories(pack)).sort(), expected);
    assert.deepEqual((await removeScratchDirectories([pack, path.join(root, 'nada')])).sort(), expected);
    assert.deepEqual(await findScratchDirectories(pack), []);
    assert.ok(existsSync(path.join(pack, 'borders', 'BorderLoop-jogo.webm')));
    assert.ok(existsSync(path.join(pack, `${SCRATCH_PREFIX}arquivo`)));
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('export: Ctrl+C no meio do render remove a pasta temporária mesmo sem passar pelo finally', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'scratch-guard-'));
  try {
    const scratch = path.join(root, `${SCRATCH_PREFIX}xyz`);
    mkdirSync(scratch);
    writeFileSync(path.join(scratch, 'render.mov'), 'parcial');
    // Stand-in process: exit() emits 'exit' synchronously, as process.exit does.
    const exits: number[] = [];
    const target = Object.assign(new EventEmitter(), {exit: (code: number) => {exits.push(code); target.emit('exit', code);}});
    const release = guardScratch(scratch, target);
    target.emit('SIGINT');
    assert.deepEqual(exits, [130]);
    assert.equal(existsSync(scratch), false);
    // Once the export finishes normally, nothing stays registered.
    release();
    assert.deepEqual(['exit', 'SIGINT', 'SIGTERM'].map((event) => target.listenerCount(event)), [0, 0, 0]);
    mkdirSync(scratch);
    target.emit('exit', 0);
    assert.ok(existsSync(scratch));
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

const cli = (...args: string[]) => parseRenderArgs(args);

test('CLI: a composição é obrigatória e o formato do comando prevalece sobre o JSON', () => {
  assert.throws(() => buildExportOptions(cli()), /Name the composition\. Use --list/);
  assert.throws(() => buildExportOptions(cli('GradientLoop', 'ParticleLoop')), /only one composition/);
  assert.throws(() => buildExportOptions(cli('Nada')), /Composição desconhecida: Nada/);
  assert.throws(() => buildExportOptions(cli('GradientLoop'), [1, 2]), /JSON object/);
  assert.throws(() => buildExportOptions(cli('GradientLoop', '--format', 'avi')));
  const options = buildExportOptions(
    cli('GradientLoop', '--format', 'mov', '--duration', '2.5', '--seed', '9', '--overwrite'),
    {outputFormat: 'webm', transparent: true},
  );
  assert.deepEqual(options, {
    compositionId: 'GradientLoop', format: 'mov',
    props: {outputFormat: 'webm', transparent: true, durationSeconds: 2.5, seed: 9},
    output: undefined, overwrite: true,
  });
  assert.equal(resolveExport(options).props.outputFormat, 'mov');
  assert.equal(buildExportOptions(cli('GradientLoop', '--format', 'png', '--frame', '30')).frame, 30);
  assert.match(HELP_TEXT, /The command's format wins over the JSON\./);
});

test('CLI: --size expande o tamanho do catálogo e recusa tamanhos de outro tipo', () => {
  assert.deepEqual(expandSize('border', 'tela-cheia'), {width: 1920, height: 1080, bleed: 0, fit: 'tela', shape: 'retangulo'});
  assert.deepEqual(expandSize('chat', 'chat-coluna'), {width: 448, height: 1016, bleed: 32});
  // A preset drawn full-screen still becomes the window product once a window size is asked for.
  const overPreset = {fit: 'tela', transparent: true, ...expandSize('border', 'webcam-16x9')};
  assert.equal(overPreset.fit, 'janela');
  assert.equal(sizeTag('border', overPreset), 'webcam-16x9');
  assert.throws(() => expandSize('chat', 'webcam-16x9'), /Size webcam-16x9 is for borders and frames, not chat backgrounds\. Options: chat-compacto/);
  assert.throws(() => expandSize('block', 'chat-padrao'), /not text boxes/);
  assert.throws(() => expandSize('border', 'enorme'), /Unknown size: enorme/);
  assert.throws(() => expandSize('background', 'cartao'), /Backgrounds have a fixed size \(1920×1080\)/);
  for (const flags of [['--size', 'cartao'], ['--width', '800'], ['--height', '600'], ['--bleed', '0']]) {
    assert.throws(() => buildExportOptions(cli('GradientLoop', ...flags)), /fixed size/, flags.join(' '));
  }
});

test('CLI: --list agrupa por tipo com cabeçalhos em inglês', () => {
  const text = listText();
  const headers = text.split('\n').filter((line) => /^\S/.test(line));
  assert.deepEqual(headers, ['Backgrounds (background):', 'Chat backgrounds (chat):', 'Text boxes (block):', 'Borders and frames (border):']);
  assert.match(text, /^ {2}GradientLoop$/m);
  assert.match(text, /webcam-16x9: box 640×360, file 736×456; standard camera/);
});
