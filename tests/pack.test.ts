import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {resolveExport} from '../scripts/export';
import {
  MIN_FREE_BYTES, assertFreeSpace, dryRunText, filterPlan, packFileEntry, packManifestSchema, parsePackManifest, planPack,
  realPackDeps, runPack, scratchText, type PackAsset, type PackDeps, type PackManifest, type PlannedFile, type PackRunEffects,
} from '../scripts/pack-plan';
import {assetCatalog, getAsset, getMotionOf} from '../src/catalog';
import {getBoxCanvas} from '../src/overlays/shared/box';
import {sizesForKind} from '../src/sizes';
import {KIT_THEMES, OVERLAY_THEMES, expectedPackFiles} from './helpers/themes';

const root = fileURLToPath(new URL('../', import.meta.url));

/** A strict fake schema: known keys with defaults, unknown keys refused like `.strict()`. */
const fakeParse = (defaults: Record<string, unknown>) => (props: Record<string, unknown>) => {
  for (const key of Object.keys(props)) if (!(key in defaults)) throw new Error(`Unrecognized key: "${key}"`);
  return {...defaults, ...props};
};

const common = {durationSeconds: 8, seed: 1, transparent: false, backgroundColor: '#000000', outputFormat: 'webm', guides: false};

const sized = (id: string, kind: 'chat' | 'bloco' | 'borda', box: {width: number; height: number; bleed: number}): PackAsset => ({
  id, kind,
  parse: fakeParse({...common, transparent: true, ...box, fit: 'janela', ...(kind === 'chat' ? {} : {shape: 'retangulo'}), halo: 8, glow: 12}),
  layout: (props) => {
    const {canvas, box: rect} = getBoxCanvas(props as {width: number; height: number; bleed: number});
    const content = {x: rect.x + 16, y: rect.y + 16, width: rect.width - 32, height: rect.height - 32};
    return {canvas, box: rect, content, ...(kind === 'borda' ? {hole: rect} : {}), outset: 0};
  },
});

const fakeAssets: Record<string, PackAsset> = {
  FundoLoop: {id: 'FundoLoop', kind: 'background', parse: fakeParse({...common, speed: 1}), layout: null},
  ChatLoop: sized('ChatLoop', 'chat', {width: 400, height: 600, bleed: 32}),
  BlocoLoop: sized('BlocoLoop', 'bloco', {width: 640, height: 360, bleed: 32}),
  BordaLoop: sized('BordaLoop', 'borda', {width: 640, height: 360, bleed: 48}),
};

const fakePresets: Record<string, unknown> = {
  'fundo-teste': {speed: 3, outputFormat: 'mp4', durationSeconds: 4},
  'chat-teste': {glow: 20, width: 999, transparent: true},
  'bloco-teste': {halo: 10},
  'borda-teste': {fit: 'tela'},
  'quebrado': [1, 2],
};

const fakeDeps: PackDeps = {
  getAsset: (id) => {
    const asset = fakeAssets[id];
    if (!asset) throw new Error(`Composição desconhecida: ${id}.`);
    return asset;
  },
  readPreset: (name) => {
    if (!(name in fakePresets)) throw new Error(`Preset not found: presets/${name}.json.`);
    return fakePresets[name];
  },
};

const manifest = (items: PackManifest['items'], name = 'teste'): PackManifest => ({name, title: 'Pack de teste', items});

test('pack: o manifesto é estrito e recusa campos desconhecidos com mensagem em inglês', () => {
  const valid = {name: 'neon', title: 'Neon', items: [{composition: 'ChatLoop', formats: ['webm']}]};
  assert.deepEqual(parsePackManifest(valid), valid);
  assert.throws(() => parsePackManifest({...valid, extra: 1}), /Invalid pack manifest/);
  // Keys follow the SPEC (English, like the preset props): the old pt-BR keys are unknown now.
  assert.throws(() => parsePackManifest({...valid, items: [{composition: 'ChatLoop', formats: ['webm'], tamanhos: ['x']}]}), /Invalid pack manifest/);
  assert.throws(() => parsePackManifest({...valid, items: [{composition: 'ChatLoop', formats: []}]}), /Invalid pack manifest/);
  assert.throws(() => parsePackManifest({...valid, items: [{composition: 'ChatLoop', formats: ['avi']}]}), /formats/);
  assert.throws(() => parsePackManifest({...valid, name: 'Néon Pack'}), /lowercase letters/);
  assert.throws(() => parsePackManifest({...valid, items: [{composition: 'ChatLoop', preset: 'presets/x.json', formats: ['png']}]}), /without folder or extension/);
  assert.throws(() => parsePackManifest({...valid, items: []}), /Invalid pack manifest/);
});

test('pack: o plano segue a ordem do manifesto e nomeia <Id>-<tamanho>.<ext> na pasta do tipo', () => {
  const plan = planPack(manifest([
    {composition: 'FundoLoop', preset: 'fundo-teste', formats: ['webm', 'png']},
    {composition: 'ChatLoop', preset: 'chat-teste', sizes: ['chat-compacto', 'chat-coluna'], formats: ['webm', 'png']},
    {composition: 'BordaLoop', sizes: ['tela-cheia'], formats: ['mov']},
  ]), fakeDeps);
  assert.deepEqual(plan.map((file) => file.output), [
    'out/packs/teste/backgrounds/FundoLoop.webm',
    'out/packs/teste/backgrounds/FundoLoop.png',
    'out/packs/teste/chat/ChatLoop-chat-compacto.webm',
    'out/packs/teste/chat/ChatLoop-chat-compacto.png',
    'out/packs/teste/chat/ChatLoop-chat-coluna.webm',
    'out/packs/teste/chat/ChatLoop-chat-coluna.png',
    'out/packs/teste/bordas/BordaLoop-tela-cheia.mov',
  ]);
  assert.deepEqual(plan.map((file) => file.folder), ['backgrounds', 'backgrounds', 'chat', 'chat', 'chat', 'chat', 'bordas']);
  assert.deepEqual(plan[0]!.canvas, {width: 1920, height: 1080}, 'fundos usam o tamanho fixo do tipo');
  assert.deepEqual(plan[2]!.canvas, {width: 424, height: 544});
  assert.deepEqual(plan[4]!.canvas, {width: 512, height: 1080});
  assert.deepEqual(plan[6]!.canvas, {width: 1920, height: 1080});
  assert.equal(plan[2]!.size, 'chat-compacto');
  assert.equal(plan[0]!.size, undefined);
  // fps and frames come from the shared metadata rule: 60 fps, 4 s from the preset.
  assert.deepEqual([plan[0]!.fps, plan[0]!.frames], [60, 240]);
  assert.equal(plan[1]!.frame, 0, 'PNG usa o frame 0 por padrão');
  assert.equal(plan[0]!.frame, undefined, 'vídeos não levam frame');
});

test('pack: props mesclam preset < props do item < tamanho < formato', () => {
  const [file] = planPack(manifest([{
    composition: 'ChatLoop', preset: 'chat-teste', props: {glow: 4, width: 800, seed: 7, outputFormat: 'gif'},
    sizes: ['chat-alto'], formats: ['webm'],
  }]), fakeDeps);
  assert.deepEqual(file!.props, {glow: 4, width: 400, height: 800, bleed: 32, transparent: true, seed: 7, outputFormat: 'webm'});
  // A window size fixes the product even over a full-screen preset.
  const [border] = planPack(manifest([{composition: 'BordaLoop', preset: 'borda-teste', sizes: ['webcam-4x3'], formats: ['png']}]), fakeDeps);
  assert.equal(border!.props.fit, 'janela');
  assert.equal(border!.output, 'out/packs/teste/bordas/BordaLoop-webcam-4x3.png');
});

test('pack: o bleed do item vence o do tamanho (a caixa continua a do tamanho)', () => {
  const [file] = planPack(manifest([{
    composition: 'BordaLoop', props: {bleed: 96, width: 999}, sizes: ['jogo'], formats: ['webm'],
  }]), fakeDeps);
  assert.deepEqual([file!.props.width, file!.props.height, file!.props.bleed], [1440, 810, 96]);
  assert.deepEqual(file!.canvas, {width: 1440 + 2 * 96, height: 810 + 2 * 96});
  assert.equal(file!.output, 'out/packs/teste/bordas/BordaLoop-jogo.webm', 'o nome segue o tamanho');
  // Without an item bleed, the size's.
  const [plain] = planPack(manifest([{composition: 'BordaLoop', sizes: ['jogo'], formats: ['webm']}]), fakeDeps);
  assert.equal(plain!.props.bleed, 48);
});

test('pack: a variante marca o nome dos arquivos, e o mesmo tamanho cabe duas vezes num pack', () => {
  const plan = planPack(manifest([
    {composition: 'FundoLoop', formats: ['png']},
    {composition: 'FundoLoop', props: {speed: 2}, formats: ['png'], variant: 'lento'},
    {composition: 'ChatLoop', sizes: ['chat-padrao'], formats: ['webm', 'png']},
    {composition: 'ChatLoop', props: {glow: 0}, sizes: ['chat-padrao'], formats: ['webm', 'png'], variant: 'sem-enfeites'},
    {composition: 'BlocoLoop', props: {width: 700, height: 100, bleed: 16}, formats: ['webm'], variant: 'v2'},
  ]), fakeDeps);
  assert.deepEqual(plan.map((file) => file.output), [
    'out/packs/teste/backgrounds/FundoLoop.png',
    'out/packs/teste/backgrounds/FundoLoop-lento.png',
    'out/packs/teste/chat/ChatLoop-chat-padrao.webm',
    'out/packs/teste/chat/ChatLoop-chat-padrao.png',
    'out/packs/teste/chat/ChatLoop-chat-padrao-sem-enfeites.webm',
    'out/packs/teste/chat/ChatLoop-chat-padrao-sem-enfeites.png',
    'out/packs/teste/blocos/BlocoLoop-700x100-v2.webm',
  ]);
  assert.equal(plan[4]!.props.glow, 0);
  // Two variants of one window share its OBS mask, planned once.
  const borders = planPack(manifest([
    {composition: 'BordaLoop', sizes: ['webcam-16x9'], formats: ['webm']},
    {composition: 'BordaLoop', sizes: ['webcam-16x9'], formats: ['webm'], variant: 'sem-enfeites'},
  ]), realPackDeps);
  assert.deepEqual(borders.map((file) => path.posix.basename(file.output)), [
    'BordaLoop-webcam-16x9.webm', 'mascara-webcam-16x9.png', 'BordaLoop-webcam-16x9-sem-enfeites.webm',
  ]);
  assert.equal(borders[2]!.mask, borders[1]!.output);
  // The variant becomes part of a file name: a slug only.
  const item = {composition: 'ChatLoop', formats: ['webm']};
  for (const variant of ['Sem Enfeites', 'sem_enfeites', '', 'a/b']) {
    assert.throws(() => parsePackManifest({name: 'teste', title: 'Teste', items: [{...item, variant}]}), /Invalid pack manifest/, variant);
  }
  assert.throws(() => parsePackManifest({name: 'teste', title: 'Teste', items: [{...item, variant: 'X'}]}), /lowercase letters/);
});

test('pack: sem tamanhos, itens de tamanho livre usam o tamanho das props no nome', () => {
  const plan = planPack(manifest([
    {composition: 'BlocoLoop', preset: 'bloco-teste', formats: ['webm']},
    {composition: 'BlocoLoop', props: {width: 700, height: 100, bleed: 16}, formats: ['webm']},
  ]), fakeDeps);
  assert.deepEqual(plan.map((file) => file.output), [
    'out/packs/teste/blocos/BlocoLoop-cartao.webm',
    'out/packs/teste/blocos/BlocoLoop-700x100.webm',
  ]);
  assert.deepEqual(plan[1]!.canvas, {width: 732, height: 132});
});

test('pack: tamanhos em fundos e tamanhos de outro tipo são recusados em inglês', () => {
  assert.throws(
    () => planPack(manifest([{composition: 'FundoLoop', sizes: ['cartao'], formats: ['webm']}]), fakeDeps),
    /Item 1 \(FundoLoop\): .*with a fixed size \(1920×1080\): remove "sizes"/,
  );
  assert.throws(
    () => planPack(manifest([{composition: 'ChatLoop', formats: ['webm']}, {composition: 'ChatLoop', sizes: ['webcam-16x9'], formats: ['webm']}]), fakeDeps),
    /Item 2 \(ChatLoop\): Size webcam-16x9 is for borders and frames, not chat backgrounds/,
  );
  assert.throws(
    () => planPack(manifest([{composition: 'ChatLoop', sizes: ['gigante'], formats: ['webm']}]), fakeDeps),
    /Unknown size: gigante/,
  );
});

test('pack: composição, preset e props inválidos param o plano antes de qualquer render', () => {
  assert.throws(() => planPack(manifest([{composition: 'Nada', formats: ['webm']}]), fakeDeps), /Item 1 \(Nada\): Composição desconhecida/);
  assert.throws(() => planPack(manifest([{composition: 'ChatLoop', preset: 'sumiu', formats: ['webm']}]), fakeDeps), /Preset not found/);
  assert.throws(() => planPack(manifest([{composition: 'ChatLoop', preset: 'quebrado', formats: ['webm']}]), fakeDeps), /JSON object/);
  assert.throws(() => planPack(manifest([{composition: 'ChatLoop', props: {typo: 1}, formats: ['webm']}]), fakeDeps), /typo/);
  assert.throws(() => planPack(manifest([{composition: 'ChatLoop', props: {guides: true}, formats: ['png']}]), fakeDeps), /turn guides off/);
});

test('pack: nomes de arquivo repetidos são recusados', () => {
  assert.throws(
    () => planPack(manifest([
      {composition: 'ChatLoop', sizes: ['chat-padrao'], formats: ['webm']},
      {composition: 'ChatLoop', preset: 'chat-teste', sizes: ['chat-padrao'], formats: ['png', 'webm']},
    ]), fakeDeps),
    /Item 2 \(ChatLoop\) repeats the file out\/packs\/teste\/chat\/ChatLoop-chat-padrao\.webm, already produced by Item 1/,
  );
  assert.throws(
    () => planPack(manifest([{composition: 'ChatLoop', sizes: ['chat-alto', 'chat-alto'], formats: ['webm']}]), fakeDeps),
    /repeats the file/,
  );
});

test('pack: frame vale só com PNG e precisa existir no loop', () => {
  const plan = planPack(manifest([{composition: 'ChatLoop', formats: ['gif', 'png'], frame: 120}]), fakeDeps);
  assert.deepEqual(plan.map((file) => [file.format, file.frame, file.fps]), [['gif', undefined, 50], ['png', 120, 60]]);
  assert.throws(() => planPack(manifest([{composition: 'ChatLoop', formats: ['webm'], frame: 3}]), fakeDeps), /"frame" only applies to PNG/);
  // 8 s at 60 fps: frames 0…479.
  assert.throws(() => planPack(manifest([{composition: 'ChatLoop', formats: ['png'], frame: 480}]), fakeDeps), /from 0 to 479/);
});

const samplePlan = () => planPack(manifest([
  {composition: 'FundoLoop', formats: ['webm']},
  {composition: 'ChatLoop', sizes: ['chat-padrao'], formats: ['webm', 'png']},
  {composition: 'BordaLoop', sizes: ['webcam-16x9'], formats: ['png']},
]), fakeDeps);

test('pack: --only filtra pelo caminho e recusa um filtro vazio', () => {
  const plan = samplePlan();
  assert.equal(filterPlan(plan, undefined).length, 4);
  assert.deepEqual(filterPlan(plan, 'CHAT-PADRAO').map((file) => file.format), ['webm', 'png']);
  assert.deepEqual(filterPlan(plan, '.png').map((file) => file.composition), ['ChatLoop', 'BordaLoop']);
  assert.throws(() => filterPlan(plan, 'xyz'), /No pack file contains "xyz"/);
});

test('pack: --dry-run lista cada arquivo com o tamanho do arquivo e o total', () => {
  const plan = samplePlan();
  const text = dryRunText(plan, new Set(['out/packs/teste/chat/ChatLoop-chat-padrao.png']));
  assert.deepEqual(text.split('\n'), [
    'out/packs/teste/backgrounds/FundoLoop.webm  1920×1080, 60 fps, 480 frames',
    'out/packs/teste/chat/ChatLoop-chat-padrao.webm  464×664, 60 fps, 480 frames',
    'out/packs/teste/chat/ChatLoop-chat-padrao.png  464×664, frame 0 (already exists)',
    'out/packs/teste/bordas/BordaLoop-webcam-16x9.png  736×456, frame 0',
    'Total: 4 files.',
  ]);
  assert.match(dryRunText(plan.slice(0, 1)), /Total: 1 file\.$/);
});

test('pack: recusa começar com menos de 2 GB livres e diz quanto há', () => {
  assert.doesNotThrow(() => assertFreeSpace(MIN_FREE_BYTES, 'out'));
  assert.throws(() => assertFreeSpace(1.5 * 1024 ** 3, 'out'), /Not enough free space in out: 1\.5 GB free.* at least 2\.0 GB/);
});

/** In-memory disk for the run loop: files are paths, JSON files hold parsed data. */
const fakeRun = (initial: Record<string, unknown> = {}, freeBytes = 10 * 1024 ** 3) => {
  const disk = new Map<string, unknown>(Object.entries(initial));
  const exported: string[] = [];
  const logs: string[] = [];
  const effects: PackRunEffects = {
    exists: async (file) => disk.has(file),
    freeBytes: async () => freeBytes,
    exportFile: async (file: PlannedFile, overwrite) => {
      if (disk.has(file.output) && !overwrite) throw new Error('já existe');
      exported.push(file.output);
      disk.set(file.output, 'bytes');
      // exportAsset publishes a sidecar next to sized kinds only.
      if (file.kind !== 'background') {
        const layout = fakeDeps.getAsset(file.composition).layout!(file.props);
        disk.set(`${file.output}.json`, {
          canvas: layout.canvas, box: layout.box, content: layout.content, hole: layout.hole ?? null,
          bleed: file.props.bleed, fps: file.fps, frames: file.format === 'png' ? 1 : file.frames,
          ...(file.frame === undefined ? {} : {frame: file.frame}), format: file.format, alpha: true,
        });
      }
    },
    readJson: async (file) => (disk.has(file) ? disk.get(file) : null),
    remove: async (file) => {disk.delete(file);},
    writeManifest: async (file, data) => {disk.set(file, structuredClone(data));},
    sweepScratch: async () => {
      const leftovers = [...disk.keys()].filter((file) => file.split('/').some((part) => part.startsWith('.asset-render-')));
      for (const file of leftovers) disk.delete(file);
      logs.push('sweep');
      return leftovers;
    },
    log: (message) => logs.push(message),
  };
  return {disk, exported, logs, effects};
};

test('pack: a execução exporta um por vez, move os sidecars para o manifesto e limpa as pastas', async () => {
  const plan = samplePlan();
  const run = fakeRun();
  const result = await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  assert.deepEqual(run.exported, plan.map((file) => file.output));
  assert.deepEqual([result.rendered, result.skipped], [4, 0]);
  assert.equal([...run.disk.keys()].some((file) => file.endsWith('.png.json') || file.endsWith('.webm.json')), false, 'sem sidecars soltos');
  const data = run.disk.get('out/packs/teste/manifest.json') as {name: string; title: string; files: Record<string, unknown>[]};
  assert.equal(data.name, 'teste');
  assert.equal(data.title, 'Pack de teste');
  assert.deepEqual(data.files.map((entry) => entry.file), [
    'backgrounds/FundoLoop.webm',
    'bordas/BordaLoop-webcam-16x9.png',
    'chat/ChatLoop-chat-padrao.png',
    'chat/ChatLoop-chat-padrao.webm',
  ]);
  const border = data.files.find((entry) => entry.file === 'bordas/BordaLoop-webcam-16x9.png')!;
  assert.deepEqual(border, {
    file: 'bordas/BordaLoop-webcam-16x9.png', composition: 'BordaLoop', kind: 'borda', size: 'webcam-16x9', format: 'png',
    canvas: {width: 736, height: 456}, box: {x: 48, y: 48, width: 640, height: 360},
    content: {x: 64, y: 64, width: 608, height: 328}, hole: {x: 48, y: 48, width: 640, height: 360},
    bleed: 48, fps: 60, frames: 1, frame: 0, alpha: true,
  });
  const background = data.files.find((entry) => entry.file === 'backgrounds/FundoLoop.webm')!;
  assert.deepEqual(background.canvas, {width: 1920, height: 1080});
  assert.deepEqual(background.box, {x: 0, y: 0, width: 1920, height: 1080});
  assert.equal(background.hole, null);
  assert.equal(background.frames, 480);
  assert.equal(background.alpha, false);
});

test('pack: arquivos prontos são pulados (retomável) e --overwrite os refaz', async () => {
  const plan = samplePlan();
  const first = fakeRun();
  await runPack({manifest: manifest([]), plan: plan.slice(0, 2), fullPlan: plan, overwrite: false, deps: fakeDeps, effects: first.effects, diskLabel: 'out'});
  // Resume on the same disk with the whole plan: only the missing files render.
  const resumed = fakeRun(Object.fromEntries(first.disk));
  const result = await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: false, deps: fakeDeps, effects: resumed.effects, diskLabel: 'out'});
  assert.deepEqual(resumed.exported, plan.slice(2).map((file) => file.output));
  assert.deepEqual([result.rendered, result.skipped], [2, 2]);
  assert.ok(resumed.logs.some((line) => line.includes('FundoLoop.webm: already exists, skipping.')));
  const files = (resumed.disk.get('out/packs/teste/manifest.json') as {files: {file: string}[]}).files;
  assert.equal(files.length, 4, 'o manifesto mantém os arquivos da execução anterior');

  const again = fakeRun(Object.fromEntries(resumed.disk));
  await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: true, deps: fakeDeps, effects: again.effects, diskLabel: 'out'});
  assert.deepEqual(again.exported, plan.map((file) => file.output));
});

test('pack: uma execução com --only preserva no manifesto os arquivos das outras', async () => {
  const plan = samplePlan();
  const run = fakeRun();
  await runPack({manifest: manifest([]), plan: filterPlan(plan, 'Fundo'), fullPlan: plan, overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  await runPack({manifest: manifest([]), plan: filterPlan(plan, 'Borda'), fullPlan: plan, overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  const files = (run.disk.get('out/packs/teste/manifest.json') as {files: {file: string}[]}).files;
  assert.deepEqual(files.map((entry) => entry.file), ['backgrounds/FundoLoop.webm', 'bordas/BordaLoop-webcam-16x9.png']);
});

/** Records every manifest the run writes, so a test can see the first save, not only the last. */
const recordManifests = (run: ReturnType<typeof fakeRun>) => {
  const saved: {file: string}[][] = [];
  const write = run.effects.writeManifest;
  run.effects.writeManifest = async (file, data) => {
    saved.push(structuredClone((data as {files: {file: string}[]}).files));
    await write(file, data);
  };
  return saved;
};

test('pack: a manifest entry the whole plan no longer has is pruned before the first save', async () => {
  const plan = samplePlan();
  const stale = {file: 'bordas/BordaLoop-old-size.png', composition: 'BordaLoop', kind: 'borda', format: 'png'};
  const run = fakeRun({'out/packs/teste/manifest.json': {name: 'teste', title: 'Pack de teste', files: [stale]}});
  const saved = recordManifests(run);
  await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  assert.ok(saved.length > 0);
  for (const files of saved) assert.equal(files.some((entry) => entry.file === stale.file), false, 'no save keeps the stale entry');
  const files = (run.disk.get('out/packs/teste/manifest.json') as {files: {file: string}[]}).files;
  assert.deepEqual(files.map((entry) => entry.file), [
    'backgrounds/FundoLoop.webm', 'bordas/BordaLoop-webcam-16x9.png', 'chat/ChatLoop-chat-padrao.png', 'chat/ChatLoop-chat-padrao.webm',
  ]);
});

test('pack: an --only run prunes by the whole plan and keeps the entries of the other planned files', async () => {
  const plan = samplePlan();
  const first = fakeRun();
  await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: false, deps: fakeDeps, effects: first.effects, diskLabel: 'out'});
  const before = first.disk.get('out/packs/teste/manifest.json') as {name: string; title: string; files: {file: string}[]};
  const stale = {file: 'chat/ChatLoop-old-size.webm', composition: 'ChatLoop', kind: 'chat', format: 'webm'};
  const run = fakeRun({...Object.fromEntries(first.disk), 'out/packs/teste/manifest.json': {...before, files: [...before.files, stale]}});
  await runPack({manifest: manifest([]), plan: filterPlan(plan, 'Borda'), fullPlan: plan, overwrite: true, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  assert.deepEqual(run.exported, ['out/packs/teste/bordas/BordaLoop-webcam-16x9.png']);
  const after = (run.disk.get('out/packs/teste/manifest.json') as {files: {file: string}[]}).files;
  assert.deepEqual(after.map((entry) => entry.file), before.files.map((entry) => entry.file));
  // The entries this run did not touch are the ones the earlier run wrote, unchanged.
  for (const entry of before.files.filter((file) => !file.file.startsWith('bordas/'))) {
    assert.deepEqual(after.find((file) => file.file === entry.file), entry);
  }
});

test('pack: as pastas temporárias de um export interrompido somem antes de tudo, inclusive da pasta vendida', async () => {
  const leftover = 'out/packs/teste/bordas/.asset-render-abc123/render.webm';
  const run = fakeRun({[leftover]: 'bytes parciais'});
  await runPack({manifest: manifest([]), plan: samplePlan(), fullPlan: samplePlan(), overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  assert.equal(run.disk.has(leftover), false);
  // Swept first, so the space it held counts in the free-space check and nothing renders over it.
  assert.deepEqual(run.logs.slice(0, 2), ['sweep', '1 scratch folder of interrupted exports removed.']);
  assert.equal(scratchText(3, 'will-be-removed'), '3 scratch folders of interrupted exports will be removed when the pack is built.');
  // Low disk still refuses, but only after the sweep had its chance to free space.
  const low = fakeRun({[leftover]: 'bytes parciais'}, 512 * 1024 ** 2);
  await assert.rejects(runPack({manifest: manifest([]), plan: samplePlan(), fullPlan: samplePlan(), overwrite: false, deps: fakeDeps, effects: low.effects, diskLabel: 'out'}));
  assert.equal(low.disk.has(leftover), false);
});

test('pack: pouco disco recusa antes de exportar qualquer arquivo', async () => {
  const run = fakeRun({}, 512 * 1024 ** 2);
  await assert.rejects(
    runPack({manifest: manifest([]), plan: samplePlan(), fullPlan: samplePlan(), overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'}),
    /0\.5 GB free/,
  );
  assert.deepEqual(run.exported, []);
});

const PACKS = OVERLAY_THEMES;
/**
 * The painel-twitch item's props per pack; every other pack gives the panel none. The glass keeps
 * an opaque PNG, which would vanish on Twitch's light theme (GIF is always flattened on
 * backgroundColor anyway). Two kits widen the padding so the panel's pockets hold their motifs
 * (noite: the moon, a bat and the pumpkins; mansão: the two hung lanterns); the other kits fit the
 * panel with the preset's own padding.
 */
const TWITCH_PROPS: Readonly<Record<string, Record<string, unknown>>> = {
  vidro: {transparent: false},
  'halloween-noite': {paddingX: 48, paddingY: 36},
  'halloween-mansao': {paddingX: 32, paddingY: 24},
};
const readPack = (name: string): unknown => JSON.parse(readFileSync(path.join(root, 'packs', `${name}.json`), 'utf8'));

/** Each Halloween kit's background (composition, preset) and title (SPEC §1): its presets follow that background's duration and seed. */
const KITS: Readonly<Record<(typeof KIT_THEMES)[number], readonly [string, string, string]>> = {
  'halloween-noite': ['HalloweenLoop', 'halloween-midnight', 'Pack Halloween — Noite de lua'],
  'halloween-mansao': ['HauntedMansionLoop', 'halloween-haunted-mansion', 'Pack Halloween — Mansão assombrada'],
  'halloween-interior': ['HauntedInteriorLoop', 'halloween-haunted-interior', 'Pack Halloween — Salão assombrado'],
  'halloween-teia': ['CobwebLoop', 'halloween-cobweb', 'Pack Halloween — Teias de aranha'],
};
const presetJson = (name: string): Record<string, unknown> => JSON.parse(readFileSync(path.join(root, 'presets', `${name}.json`), 'utf8'));

test('packs: cada kit de Halloween traz o seu fundo e os presets seguem a duração e a seed dele', () => {
  for (const theme of KIT_THEMES) {
    const [composition, preset, title] = KITS[theme];
    const pack = parsePackManifest(readPack(theme));
    assert.equal(pack.title, title, theme);
    assert.deepEqual(pack.items.filter((item) => item.sizes === undefined).map((item) => [item.composition, item.preset]), [[composition, preset]], theme);
    const background = getAsset(composition).schema.parse(presetJson(preset)) as {durationSeconds: number; seed: number};
    for (const kind of ['chat', 'bloco', 'borda']) {
      const overlay = presetJson(`${kind}-${theme}`);
      assert.deepEqual([overlay.durationSeconds, overlay.seed], [background.durationSeconds, background.seed], `${kind}-${theme}`);
    }
  }
});

test('packs: os oito manifestos seguem o schema e cobrem todos os tamanhos do tema', () => {
  // Every theme's pack, exactly.
  assert.deepEqual(readdirSync(path.join(root, 'packs')).filter((file) => file.endsWith('.json')).sort(), expectedPackFiles());
  const ids = (kind: string) => sizesForKind(kind).map((size) => size.id);
  const screens = new Set(sizesForKind('borda').filter((size) => size.props?.fit === 'tela').map((size) => size.id));
  for (const name of PACKS) {
    const pack = packManifestSchema.parse(readPack(name));
    assert.equal(pack.name, name);
    const kit = (KIT_THEMES as readonly string[]).includes(name);
    // The kit's items with ornaments (no variant) and, in the Halloween kits, their twins without.
    const byPreset = (preset: string, variant?: string) => pack.items.filter((item) => item.preset === preset && item.variant === variant);
    assert.deepEqual(byPreset(`chat-${name}`).flatMap((item) => item.sizes), ids('chat'));
    // The kits' screen frames come only without ornaments: large enough ornaments would eat the picture.
    assert.deepEqual(byPreset(`borda-${name}`).flatMap((item) => item.sizes).sort(), ids('borda').filter((id) => !kit || !screens.has(id)).sort());
    const blocos = byPreset(`bloco-${name}`);
    assert.deepEqual(blocos.flatMap((item) => item.sizes).sort(), ids('bloco').sort());
    const twitch = blocos.find((item) => item.sizes?.includes('painel-twitch'))!;
    assert.deepEqual(twitch.sizes, ['painel-twitch'], 'o painel da Twitch é um item separado');
    assert.deepEqual(twitch.formats, ['gif', 'png']);
    // The size itself turns glow and halo off; the panel takes item props only where it needs them.
    assert.deepEqual(twitch.props, TWITCH_PROPS[name], name);
    // The kits' large frames scale their ornaments on a wider bleed (webcam-16x9-g ×1.5, jogo ×2);
    // the classic themes have no such items.
    const scaled = pack.items.filter((item) => item.props?.ornamentScale !== undefined);
    assert.deepEqual(scaled.map((item) => [item.sizes, item.props]), kit ? [
      [['webcam-16x9-g'], {bleed: 72, ornamentScale: 1.5}], [['jogo'], {bleed: 96, ornamentScale: 2}],
    ] : [], name);
    // Every size of the kit also ships without ornaments: the preset alone, only ornaments off.
    const plain = pack.items.filter((item) => item.variant !== undefined);
    assert.ok(plain.every((item) => item.variant === 'sem-enfeites'), name);
    if (kit) {
      for (const kind of ['chat', 'bloco', 'borda']) {
        const items = byPreset(`${kind}-${name}`, 'sem-enfeites');
        assert.deepEqual(items.flatMap((item) => item.sizes).sort(), ids(kind).sort(), `${name}: ${kind} sem enfeites`);
        for (const item of items) assert.deepEqual(item.props, {ornaments: 'nenhum'}, `${name}: ${kind} sem enfeites`);
      }
      const plainTwitch = byPreset(`bloco-${name}`, 'sem-enfeites').find((item) => item.sizes?.includes('painel-twitch'))!;
      assert.deepEqual([plainTwitch.sizes, plainTwitch.formats], [['painel-twitch'], ['gif', 'png']]);
    } else {
      assert.deepEqual(plain, [], name);
    }
    for (const item of pack.items.filter((entry) => !entry.sizes?.includes('painel-twitch'))) {
      assert.deepEqual(item.formats, ['webm', 'png'], `${name}/${item.composition}: mov é opcional`);
    }
    const backgrounds = pack.items.filter((item) => item.sizes === undefined);
    assert.ok(backgrounds.length >= 1, `${name}: o pack traz o fundo do tema`);
    for (const item of backgrounds) {
      assert.equal(assetCatalog[item.composition as keyof typeof assetCatalog]?.kind, 'background', item.composition);
      assert.ok(existsSync(path.join(root, 'presets', `${item.preset}.json`)), `${item.preset}.json`);
    }
  }
});

test('packs: os manifestos reais planejam com o catálogo e os presets reais', () => {
  for (const name of PACKS) {
    const pack = parsePackManifest(readPack(name));
    const plan = planPack(pack, realPackDeps);
    const backgrounds = pack.items.filter((item) => item.sizes === undefined).length;
    // Each sized item × its sizes × its formats, plus each background × its formats, plus the OBS
    // mask of each of the nine window sizes (the two screen frames have none). The Halloween kits
    // hold every size twice (with ornaments, screens excepted, and sem-enfeites), sharing the masks.
    const kit = (KIT_THEMES as readonly string[]).includes(name);
    const sizes = kit ? (5 + 10 + 9 + 1) + (5 + 10 + 11 + 1) : 5 + 10 + 11 + 1;
    assert.equal(plan.length, 2 * backgrounds + 2 * sizes + 9, name);
    assert.equal(new Set(plan.map((file) => file.output)).size, plan.length);
    for (const file of plan) {
      assert.ok(file.output.startsWith(`out/packs/${name}/`), file.output);
      assert.ok(file.canvas.width % 2 === 0 && file.canvas.height % 2 === 0, file.output);
    }
    const twitch = plan.filter((file) => file.size === 'painel-twitch');
    assert.deepEqual(twitch.map((file) => [path.posix.basename(file.output), file.canvas]), [
      ['BlocoLoop-painel-twitch.gif', {width: 320, height: 160}],
      ['BlocoLoop-painel-twitch.png', {width: 320, height: 160}],
      ...(kit ? [
        ['BlocoLoop-painel-twitch-sem-enfeites.gif', {width: 320, height: 160}],
        ['BlocoLoop-painel-twitch-sem-enfeites.png', {width: 320, height: 160}],
      ] : []),
    ]);
    if (kit) {
      // The scaled frames keep their box and widen the file by the item's bleed; the twins keep the size's.
      const canvasOf = (file: string) => plan.find((entry) => entry.output === `out/packs/${name}/bordas/${file}`)!.canvas;
      assert.deepEqual(canvasOf('BordaLoop-jogo.webm'), {width: 1440 + 2 * 96, height: 810 + 2 * 96});
      assert.deepEqual(canvasOf('BordaLoop-jogo-sem-enfeites.webm'), {width: 1440 + 2 * 48, height: 810 + 2 * 48});
      assert.deepEqual(canvasOf('BordaLoop-webcam-16x9-g.webm'), {width: 960 + 2 * 72, height: 540 + 2 * 72});
      assert.deepEqual(canvasOf('BordaLoop-tela-cheia-sem-enfeites.webm'), {width: 1920, height: 1080});
      assert.ok(!plan.some((file) => file.output.endsWith('BordaLoop-tela-cheia.webm')), `${name}: telas só sem enfeites`);
    }
  }
});

test('packs: cada arquivo exporta todas as props do schema, sem herdar os defaults salvos no Studio', () => {
  for (const name of PACKS) {
    for (const file of planPack(parsePackManifest(readPack(name)), realPackDeps)) {
      const keys = Object.keys(getAsset(file.composition).defaultProps).sort();
      assert.deepEqual(Object.keys(file.exportProps).sort(), keys, file.output);
      assert.deepEqual(file.exportProps, realPackDeps.getAsset(file.composition).parse(file.props), file.output);
      // Every key is requested, so selectComposition has nothing left to take from Root.tsx.
      const {inputProps} = resolveExport({
        compositionId: file.composition, format: file.format, props: file.exportProps,
        ...(file.frame === undefined ? {} : {frame: file.frame}),
      });
      assert.deepEqual(Object.keys(inputProps).sort(), keys, file.output);
    }
  }
});

test('packs: o plano, o --dry-run e o manifesto mostram a velocidade real de cada tamanho', () => {
  const plan = planPack(parsePackManifest(readPack('neon')), realPackDeps);
  for (const file of plan) {
    const motion = getMotionOf(getAsset(file.composition));
    // A mask never moves, so it reports no speeds.
    assert.deepEqual(file.motion, motion && file.role !== 'mask' ? motion(file.exportProps) : undefined, file.output);
    const entry = packFileEntry(file, 'out/packs/neon', realPackDeps.getAsset(file.composition), null);
    assert.deepEqual(entry.motion, file.motion, file.output);
  }
  // Comets travel whole spacings per cycle: the tall column runs close to the 160 px/s the preset
  // asks for, but not exactly, and the plan says so.
  const column = plan.find((file) => file.output.endsWith('ChatLoop-chat-coluna.webm'))!;
  assert.notEqual(column.motion!.strokeSpeed, 160);
  assert.ok(Math.abs(column.motion!.strokeSpeed / 160 - 1) <= 0.35, String(column.motion!.strokeSpeed));
  assert.match(dryRunText([column]), new RegExp(`, stroke ${column.motion!.strokeSpeed} px/s, fill ${column.motion!.fillSpeed} px/s\n`));
});

test('packs: cada borda de janela aponta a máscara OBS do seu tamanho, planejada uma vez logo depois dela', () => {
  for (const name of PACKS) {
    const plan = planPack(parsePackManifest(readPack(name)), realPackDeps);
    const masks = plan.filter((file) => file.role === 'mask');
    const windows = sizesForKind('borda').filter((size) => size.props?.fit !== 'tela');
    // One mask per window size, shared by the kits' two variants (in the order their sizes first appear).
    assert.deepEqual(masks.map((file) => file.output).sort(), windows.map((size) => `out/packs/${name}/bordas/mascara-${size.id}.png`).sort(), name);
    for (const mask of masks) {
      const size = windows.find((entry) => entry.id === mask.size)!;
      assert.deepEqual(mask.canvas, {width: size.width, height: size.height}, 'do tamanho da câmera');
      assert.deepEqual([mask.format, mask.frame, mask.composition, mask.folder], ['png', 0, 'BordaLoop', 'bordas']);
      assert.deepEqual(
        [mask.exportProps.mascara, mask.exportProps.bleed, mask.exportProps.outputFormat, mask.exportProps.transparent],
        [true, 0, 'png', true],
      );
      // Right after the last format of its size.
      const index = plan.indexOf(mask);
      assert.equal(plan[index - 1]!.size, mask.size);
      assert.notEqual(plan[index - 1]!.role, 'mask');
      const entry = packFileEntry(mask, `out/packs/${name}`, realPackDeps.getAsset('BordaLoop'), null);
      assert.equal(entry.role, 'mask');
      assert.equal(entry.motion, undefined);
      assert.deepEqual([entry.hole, entry.bleed, entry.alpha, entry.frames], [null, 0, true, 1]);
    }
    for (const file of plan.filter((entry) => entry.composition === 'BordaLoop' && entry.role !== 'mask')) {
      const isWindow = windows.some((size) => size.id === file.size);
      assert.equal(file.mask, isWindow ? `out/packs/${name}/bordas/mascara-${file.size}.png` : undefined, file.output);
      const entry = packFileEntry(file, `out/packs/${name}`, realPackDeps.getAsset('BordaLoop'), null);
      assert.equal(entry.mask, isWindow ? `bordas/mascara-${file.size}.png` : undefined, file.output);
      // Even with a sidecar that names another mask file (older exports did), the pack's own mask wins.
      const sidecar = {...entry, mask: `BordaLoop-${file.size}-mascara.png`, hole: entry.hole};
      const fromSidecar = packFileEntry(file, `out/packs/${name}`, realPackDeps.getAsset('BordaLoop'), sidecar);
      assert.equal(fromSidecar.mask, entry.mask, file.output);
      assert.deepEqual(fromSidecar.motion, entry.motion, file.output);
    }
    assert.match(dryRunText(plan), new RegExp(`out/packs/${name}/bordas/mascara-webcam-16x9\\.png  640×360, frame 0\n`));
  }
});

test('packs: a máscara depende só do tamanho e do raio; raios diferentes no mesmo pack levam o raio no nome', () => {
  // One pack holds a size once per format, so the two themes here differ by format.
  const border = (preset: string, format: 'webm' | 'png', props: Record<string, unknown> = {}) => ({
    composition: 'BordaLoop', preset, props, sizes: ['webcam-16x9', 'webcam-quadrada', 'tela-cheia'], formats: [format],
  });
  const masksOf = (plan: PlannedFile[]) => plan.filter((file) => file.role === 'mask');
  const names = (plan: PlannedFile[]) => masksOf(plan).map((file) => path.posix.basename(file.output));
  // Two themes with one radius share each mask, and both point at it.
  const shared = planPack(manifest([border('borda-neon', 'webm', {radius: 20}), border('borda-pastel', 'png', {radius: 20})]), realPackDeps);
  assert.deepEqual(names(shared), ['mascara-webcam-16x9.png', 'mascara-webcam-quadrada.png']);
  assert.deepEqual(shared.filter((file) => file.mask === 'out/packs/teste/bordas/mascara-webcam-16x9.png').map((file) => file.output), [
    'out/packs/teste/bordas/BordaLoop-webcam-16x9.webm', 'out/packs/teste/bordas/BordaLoop-webcam-16x9.png',
  ]);
  // A radius beyond the circle is the circle: 200 and 999 on the square webcam give one mask.
  const circle = planPack(manifest([border('borda-neon', 'webm', {radius: 200}), border('borda-pastel', 'png', {radius: 999})]), realPackDeps);
  assert.deepEqual(masksOf(circle).map((file) => [path.posix.basename(file.output), file.exportProps.radius]), [
    ['mascara-webcam-16x9.png', 180], ['mascara-webcam-quadrada.png', 200],
  ]);
  // Different radii for one size: each mask carries its radius, and each file points at its own.
  const mixed = planPack(manifest([border('borda-neon', 'webm'), border('borda-pastel', 'png')]), realPackDeps);
  assert.deepEqual(names(mixed), [
    'mascara-webcam-16x9-r16.png', 'mascara-webcam-quadrada-r16.png', 'mascara-webcam-16x9-r24.png', 'mascara-webcam-quadrada-r24.png',
  ]);
  const pastel = mixed.find((file) => file.output === 'out/packs/teste/bordas/BordaLoop-webcam-16x9.png')!;
  assert.equal(pastel.mask, 'out/packs/teste/bordas/mascara-webcam-16x9-r24.png');
  assert.equal(filterPlan(mixed, 'webcam-quadrada').filter((file) => file.role === 'mask').length, 2, '--only leva as máscaras do tamanho');
});
