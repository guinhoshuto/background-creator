import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {resolveExport} from '../scripts/export';
import {
  dryRunText, existingManifestFile, filterPlan, packFileEntry, packManifestSchema, packPropsHash, parsePackManifest, planPack,
  realPackDeps, runPack, scratchText, type PackAsset, type PackDeps, type PackManifest, type PlannedFile, type PackRunEffects,
} from '../scripts/pack-plan';
import {assetCatalog, getAsset, getMotionOf} from '../src/catalog';
import {getBoxCanvas} from '../src/overlays/shared/box';
import type {AssetKind} from '../src/kinds';
import {sizesForKind} from '../src/sizes';
import {BACKGROUND_PACKS, KIT_THEMES, OVERLAY_THEMES, droppedWebms, expectedPackFiles, isStaticOnly} from './helpers/themes';

const root = fileURLToPath(new URL('../', import.meta.url));

/** A strict fake schema: known keys with defaults, unknown keys refused like `.strict()`. */
const fakeParse = (defaults: Record<string, unknown>) => (props: Record<string, unknown>) => {
  for (const key of Object.keys(props)) if (!(key in defaults)) throw new Error(`Unrecognized key: "${key}"`);
  return {...defaults, ...props};
};

const common = {durationSeconds: 8, seed: 1, transparent: false, backgroundColor: '#000000', outputFormat: 'webm', guides: false};

const sized = (id: string, kind: 'chat' | 'block' | 'border', box: {width: number; height: number; bleed: number}): PackAsset => ({
  id, kind,
  parse: fakeParse({...common, transparent: true, ...box, fit: 'window', ...(kind === 'chat' ? {} : {shape: 'rectangle'}), halo: 8, glow: 12}),
  layout: (props) => {
    const {canvas, box: rect} = getBoxCanvas(props as {width: number; height: number; bleed: number});
    const content = {x: rect.x + 16, y: rect.y + 16, width: rect.width - 32, height: rect.height - 32};
    return {canvas, box: rect, content, ...(kind === 'border' ? {hole: rect} : {}), outset: 0};
  },
});

const fakeAssets: Record<string, PackAsset> = {
  FakeLoop: {id: 'FakeLoop', kind: 'background', parse: fakeParse({...common, speed: 1}), layout: null},
  ChatLoop: sized('ChatLoop', 'chat', {width: 400, height: 600, bleed: 32}),
  BlockLoop: sized('BlockLoop', 'block', {width: 640, height: 360, bleed: 32}),
  BorderLoop: sized('BorderLoop', 'border', {width: 640, height: 360, bleed: 48}),
};

const fakePresets: Record<string, unknown> = {
  'test-background': {speed: 3, outputFormat: 'mp4', durationSeconds: 4},
  'chat-test': {glow: 20, width: 999, transparent: true},
  'block-test': {halo: 10},
  'border-test': {fit: 'screen'},
  'quebrado': [1, 2],
};

const fakeDeps: PackDeps = {
  getAsset: (id) => {
    const asset = fakeAssets[id];
    if (!asset) throw new Error(`Unknown composition: ${id}.`);
    return asset;
  },
  readPreset: (name) => {
    if (!(name in fakePresets)) throw new Error(`Preset not found: presets/${name}.json.`);
    return fakePresets[name];
  },
};

const manifest = (items: PackManifest['items'], name = 'test'): PackManifest => ({name, items});

test('pack: o manifesto é estrito e recusa campos desconhecidos com mensagem em inglês', () => {
  const valid = {name: 'neon', items: [{composition: 'ChatLoop', formats: ['webm']}]};
  assert.deepEqual(parsePackManifest(valid), valid);
  // A pack has no title: the name is all it has, so a title is an unknown field.
  assert.throws(() => parsePackManifest({...valid, title: 'Neon'}), /Invalid pack manifest/);
  assert.throws(() => parsePackManifest({...valid, extra: 1}), /Invalid pack manifest/);
  // Keys follow the SPEC (English, like the preset props): the old pt-BR keys are unknown now.
  assert.throws(() => parsePackManifest({...valid, items: [{composition: 'ChatLoop', formats: ['webm'], tamanhos: ['x']}]}), /Invalid pack manifest/);
  assert.throws(() => parsePackManifest({...valid, items: [{composition: 'ChatLoop', formats: []}]}), /Invalid pack manifest/);
  assert.throws(() => parsePackManifest({...valid, items: [{composition: 'ChatLoop', formats: ['avi']}]}), /formats/);
  assert.throws(() => parsePackManifest({...valid, name: 'Néon Pack'}), /lowercase letters/);
  assert.throws(() => parsePackManifest({...valid, items: [{composition: 'ChatLoop', preset: 'presets/x.json', formats: ['png']}]}), /without folder or extension/);
  assert.throws(() => parsePackManifest({...valid, items: []}), /Invalid pack manifest/);
});

test('pack: o plano segue a ordem do manifesto e nomeia <pack>-<peça>.<ext> na pasta do tipo', () => {
  const plan = planPack(manifest([
    {composition: 'FakeLoop', preset: 'test-background', formats: ['webm', 'png']},
    {composition: 'ChatLoop', preset: 'chat-test', sizes: ['chat-compact', 'chat-column'], formats: ['webm', 'png']},
    {composition: 'BorderLoop', sizes: ['fullscreen'], formats: ['mov']},
  ]), fakeDeps);
  assert.deepEqual(plan.map((file) => file.output), [
    'out/packs/test/backgrounds/test-background.webm',
    'out/packs/test/backgrounds/test-background.png',
    'out/packs/test/chat/test-chat-compact.webm',
    'out/packs/test/chat/test-chat-compact.png',
    'out/packs/test/chat/test-chat-column.webm',
    'out/packs/test/chat/test-chat-column.png',
    'out/packs/test/borders/test-fullscreen.mov',
  ]);
  assert.deepEqual(plan.map((file) => file.folder), ['backgrounds', 'backgrounds', 'chat', 'chat', 'chat', 'chat', 'borders']);
  assert.deepEqual(plan[0]!.canvas, {width: 1920, height: 1080}, 'fundos usam o tamanho fixo do tipo');
  assert.deepEqual(plan[2]!.canvas, {width: 424, height: 544});
  assert.deepEqual(plan[4]!.canvas, {width: 512, height: 1080});
  assert.deepEqual(plan[6]!.canvas, {width: 1920, height: 1080});
  assert.equal(plan[2]!.size, 'chat-compact');
  assert.equal(plan[0]!.size, undefined);
  // fps and frames come from the shared metadata rule: 60 fps, 4 s from the preset.
  assert.deepEqual([plan[0]!.fps, plan[0]!.frames], [60, 240]);
  assert.equal(plan[1]!.frame, 0, 'PNG usa o frame 0 por padrão');
  assert.equal(plan[0]!.frame, undefined, 'vídeos não levam frame');
});

test('pack: props mesclam preset < props do item < tamanho < formato', () => {
  const [file] = planPack(manifest([{
    composition: 'ChatLoop', preset: 'chat-test', props: {glow: 4, width: 800, seed: 7, outputFormat: 'gif'},
    sizes: ['chat-tall'], formats: ['webm'],
  }]), fakeDeps);
  assert.deepEqual(file!.props, {glow: 4, width: 400, height: 800, bleed: 32, transparent: true, seed: 7, outputFormat: 'webm'});
  // A window size fixes the product even over a full-screen preset.
  const [border] = planPack(manifest([{composition: 'BorderLoop', preset: 'border-test', sizes: ['webcam-4x3'], formats: ['png']}]), fakeDeps);
  assert.equal(border!.props.fit, 'window');
  assert.equal(border!.output, 'out/packs/test/borders/test-webcam-4x3.png');
});

test('pack: o bleed do item vence o do tamanho (a caixa continua a do tamanho)', () => {
  const [file] = planPack(manifest([{
    composition: 'BorderLoop', props: {bleed: 96, width: 999}, sizes: ['gameplay'], formats: ['webm'],
  }]), fakeDeps);
  assert.deepEqual([file!.props.width, file!.props.height, file!.props.bleed], [1440, 810, 96]);
  assert.deepEqual(file!.canvas, {width: 1440 + 2 * 96, height: 810 + 2 * 96});
  assert.equal(file!.output, 'out/packs/test/borders/test-gameplay.webm', 'o nome segue o tamanho');
  // Without an item bleed, the size's.
  const [plain] = planPack(manifest([{composition: 'BorderLoop', sizes: ['gameplay'], formats: ['webm']}]), fakeDeps);
  assert.equal(plain!.props.bleed, 48);
});

test('pack: a variante marca o nome dos arquivos, e o mesmo tamanho cabe duas vezes num pack', () => {
  const plan = planPack(manifest([
    {composition: 'FakeLoop', formats: ['png']},
    {composition: 'FakeLoop', props: {speed: 2}, formats: ['png'], variant: 'slow'},
    {composition: 'ChatLoop', sizes: ['chat-standard'], formats: ['webm', 'png']},
    {composition: 'ChatLoop', props: {glow: 0}, sizes: ['chat-standard'], formats: ['webm', 'png'], variant: 'plain'},
    {composition: 'BlockLoop', props: {width: 700, height: 100, bleed: 16}, formats: ['webm'], variant: 'v2'},
  ]), fakeDeps);
  assert.deepEqual(plan.map((file) => file.output), [
    'out/packs/test/backgrounds/test-background.png',
    'out/packs/test/backgrounds/test-background-slow.png',
    'out/packs/test/chat/test-chat-standard.webm',
    'out/packs/test/chat/test-chat-standard.png',
    'out/packs/test/chat/test-chat-standard-plain.webm',
    'out/packs/test/chat/test-chat-standard-plain.png',
    'out/packs/test/text-boxes/test-700x100-v2.webm',
  ]);
  assert.equal(plan[4]!.props.glow, 0);
  // Two variants of one window share its OBS mask, planned once.
  const borders = planPack(manifest([
    {composition: 'BorderLoop', sizes: ['webcam-16x9'], formats: ['webm']},
    {composition: 'BorderLoop', sizes: ['webcam-16x9'], formats: ['webm'], variant: 'plain'},
  ]), realPackDeps);
  assert.deepEqual(borders.map((file) => path.posix.basename(file.output)), [
    'test-webcam-16x9.webm', 'test-webcam-16x9-mask.png', 'test-webcam-16x9-plain.webm',
  ]);
  assert.equal(borders[2]!.mask, borders[1]!.output);
  // The variant becomes part of a file name: a slug only.
  const item = {composition: 'ChatLoop', formats: ['webm']};
  for (const variant of ['Plain Look', 'plain_look', '', 'a/b', 'plain--x', '-plain']) {
    assert.throws(() => parsePackManifest({name: 'test', items: [{...item, variant}]}), /Invalid pack manifest/, variant);
  }
  assert.throws(() => parsePackManifest({name: 'test', items: [{...item, variant: 'X'}]}), /lowercase letters/);
  for (const name of ['Test', 'test--pack', 'test-', '-test']) {
    assert.throws(() => parsePackManifest({name, items: [item]}), /single hyphens/, name);
  }
  // Segments that already mean something in a buyer file name.
  for (const variant of ['mask', 'background', 'sm', 'lg', 'sm-plain', 'plain-lg', 'no-mask-x']) {
    assert.throws(() => parsePackManifest({name: 'test', items: [{...item, variant}]}), /cannot hold the segments mask, background, sm, lg/, variant);
  }
  assert.doesNotThrow(() => parsePackManifest({name: 'test', items: [{...item, variant: 'small-mansion'}]}));
  // A variant never makes a file read as another size of its kind.
  for (const variant of ['vertical', 'vertical-plain']) {
    assert.throws(
      () => planPack(manifest([{composition: 'BorderLoop', sizes: ['fullscreen'], formats: ['png'], variant}]), fakeDeps),
      /Item 1 \(BorderLoop\): the variant .* reads as the size fullscreen-vertical: pick another variant\./, variant,
    );
  }
  assert.equal(planPack(manifest([{composition: 'BorderLoop', sizes: ['fullscreen-vertical'], formats: ['png'], variant: 'plain'}]), fakeDeps)[0]!.output,
    'out/packs/test/borders/test-fullscreen-vertical-plain.png');
});

test('pack: sem tamanhos, itens de tamanho livre usam o tamanho das props no nome', () => {
  const plan = planPack(manifest([
    {composition: 'BlockLoop', preset: 'block-test', formats: ['webm']},
    {composition: 'BlockLoop', props: {width: 700, height: 100, bleed: 16}, formats: ['webm']},
  ]), fakeDeps);
  assert.deepEqual(plan.map((file) => file.output), [
    'out/packs/test/text-boxes/test-card.webm',
    'out/packs/test/text-boxes/test-700x100.webm',
  ]);
  assert.deepEqual(plan[1]!.canvas, {width: 732, height: 132});
});

test('pack: tamanhos em fundos e tamanhos de outro tipo são recusados em inglês', () => {
  assert.throws(
    () => planPack(manifest([{composition: 'FakeLoop', sizes: ['card'], formats: ['webm']}]), fakeDeps),
    /Item 1 \(FakeLoop\): .*with a fixed size \(1920×1080\): remove "sizes"/,
  );
  assert.throws(
    () => planPack(manifest([{composition: 'ChatLoop', formats: ['webm']}, {composition: 'ChatLoop', sizes: ['webcam-16x9'], formats: ['webm']}]), fakeDeps),
    /Item 2 \(ChatLoop\): Size webcam-16x9 is for borders, not chat backgrounds/,
  );
  assert.throws(
    () => planPack(manifest([{composition: 'ChatLoop', sizes: ['gigante'], formats: ['webm']}]), fakeDeps),
    /Unknown size: gigante/,
  );
});

test('pack: composição, preset e props inválidos param o plano antes de qualquer render', () => {
  assert.throws(() => planPack(manifest([{composition: 'NoSuchLoop', formats: ['webm']}]), fakeDeps), /Item 1 \(NoSuchLoop\): Unknown composition/);
  assert.throws(() => planPack(manifest([{composition: 'ChatLoop', preset: 'sumiu', formats: ['webm']}]), fakeDeps), /Preset not found/);
  assert.throws(() => planPack(manifest([{composition: 'ChatLoop', preset: 'quebrado', formats: ['webm']}]), fakeDeps), /JSON object/);
  assert.throws(() => planPack(manifest([{composition: 'ChatLoop', props: {typo: 1}, formats: ['webm']}]), fakeDeps), /typo/);
  assert.throws(() => planPack(manifest([{composition: 'ChatLoop', props: {guides: true}, formats: ['png']}]), fakeDeps), /turn guides off/);
});

test('pack: nomes de arquivo repetidos são recusados', () => {
  assert.throws(
    () => planPack(manifest([
      {composition: 'ChatLoop', sizes: ['chat-standard'], formats: ['webm']},
      {composition: 'ChatLoop', preset: 'chat-test', sizes: ['chat-standard'], formats: ['png', 'webm']},
    ]), fakeDeps),
    /Item 2 \(ChatLoop\) repeats the file out\/packs\/test\/chat\/test-chat-standard\.webm, already produced by Item 1/,
  );
  assert.throws(
    () => planPack(manifest([{composition: 'ChatLoop', sizes: ['chat-tall', 'chat-tall'], formats: ['webm']}]), fakeDeps),
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
  {composition: 'FakeLoop', formats: ['webm']},
  {composition: 'ChatLoop', sizes: ['chat-standard'], formats: ['webm', 'png']},
  {composition: 'BorderLoop', sizes: ['webcam-16x9'], formats: ['png']},
]), fakeDeps);

test('pack: --only filtra pelo caminho e recusa um filtro vazio', () => {
  const plan = samplePlan();
  assert.equal(filterPlan(plan, undefined).length, 4);
  assert.deepEqual(filterPlan(plan, 'CHAT-STANDARD').map((file) => file.format), ['webm', 'png']);
  assert.deepEqual(filterPlan(plan, '.png').map((file) => file.composition), ['ChatLoop', 'BorderLoop']);
  assert.throws(() => filterPlan(plan, 'xyz'), /No pack file contains "xyz"/);
});

test('pack: --dry-run lista cada arquivo com o tamanho do arquivo e o total', () => {
  const plan = samplePlan();
  const text = dryRunText(plan, new Set(['out/packs/test/chat/test-chat-standard.png']));
  assert.deepEqual(text.split('\n'), [
    'out/packs/test/backgrounds/test-background.webm  1920×1080, 60 fps, 480 frames',
    'out/packs/test/chat/test-chat-standard.webm  464×664, 60 fps, 480 frames',
    'out/packs/test/chat/test-chat-standard.png  464×664, frame 0 (already exists)',
    'out/packs/test/borders/test-webcam-16x9.png  736×456, frame 0',
    'Total: 4 files.',
  ]);
  assert.match(dryRunText(plan.slice(0, 1)), /Total: 1 file\.$/);
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
  const data = run.disk.get('out/packs/test/manifest.json') as {name: string; files: Record<string, unknown>[]};
  assert.deepEqual(Object.keys(data).sort(), ['files', 'name'], 'the manifest records the name and the files, no title');
  assert.equal(data.name, 'test');
  assert.deepEqual(data.files.map((entry) => entry.file), [
    'backgrounds/test-background.webm',
    'borders/test-webcam-16x9.png',
    'chat/test-chat-standard.png',
    'chat/test-chat-standard.webm',
  ]);
  const border = data.files.find((entry) => entry.file === 'borders/test-webcam-16x9.png')!;
  assert.deepEqual(border, {
    file: 'borders/test-webcam-16x9.png', composition: 'BorderLoop', kind: 'border', size: 'webcam-16x9', format: 'png',
    canvas: {width: 736, height: 456}, box: {x: 48, y: 48, width: 640, height: 360},
    content: {x: 64, y: 64, width: 608, height: 328}, hole: {x: 48, y: 48, width: 640, height: 360},
    bleed: 48, fps: 60, frames: 1, frame: 0, alpha: true,
    propsHash: packPropsHash(plan.find((file) => file.composition === 'BorderLoop')!),
  });
  const background = data.files.find((entry) => entry.file === 'backgrounds/test-background.webm')!;
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
  assert.ok(resumed.logs.some((line) => line.includes('test-background.webm: already exists, skipping.')));
  const files = (resumed.disk.get('out/packs/test/manifest.json') as {files: {file: string}[]}).files;
  assert.equal(files.length, 4, 'o manifesto mantém os arquivos da execução anterior');

  const again = fakeRun(Object.fromEntries(resumed.disk));
  await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: true, deps: fakeDeps, effects: again.effects, diskLabel: 'out'});
  assert.deepEqual(again.exported, plan.map((file) => file.output));
});

test('pack: uma execução com --only preserva no manifesto os arquivos das outras', async () => {
  const plan = samplePlan();
  const run = fakeRun();
  await runPack({manifest: manifest([]), plan: filterPlan(plan, 'backgrounds/'), fullPlan: plan, overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  await runPack({manifest: manifest([]), plan: filterPlan(plan, 'Border'), fullPlan: plan, overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  const files = (run.disk.get('out/packs/test/manifest.json') as {files: {file: string}[]}).files;
  assert.deepEqual(files.map((entry) => entry.file), ['backgrounds/test-background.webm', 'borders/test-webcam-16x9.png']);
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
  const stale = {file: 'borders/test-old-size.png', composition: 'BorderLoop', kind: 'border', format: 'png'};
  // Written before packs lost their title: the next save drops it.
  const run = fakeRun({'out/packs/test/manifest.json': {name: 'test', title: 'Test pack', files: [stale]}});
  const saved = recordManifests(run);
  await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  assert.ok(saved.length > 0);
  for (const files of saved) assert.equal(files.some((entry) => entry.file === stale.file), false, 'no save keeps the stale entry');
  const written = run.disk.get('out/packs/test/manifest.json') as Record<string, unknown>;
  assert.equal('title' in written, false, 'an old manifest\'s title is not carried over');
  const files = (written as {files: {file: string}[]}).files;
  assert.deepEqual(files.map((entry) => entry.file), [
    'backgrounds/test-background.webm', 'borders/test-webcam-16x9.png', 'chat/test-chat-standard.png', 'chat/test-chat-standard.webm',
  ]);
});

test('pack: an --only run prunes by the whole plan and keeps the entries of the other planned files', async () => {
  const plan = samplePlan();
  const first = fakeRun();
  await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: false, deps: fakeDeps, effects: first.effects, diskLabel: 'out'});
  const before = first.disk.get('out/packs/test/manifest.json') as {name: string; files: {file: string}[]};
  const stale = {file: 'chat/test-old-size.webm', composition: 'ChatLoop', kind: 'chat', format: 'webm'};
  const run = fakeRun({...Object.fromEntries(first.disk), 'out/packs/test/manifest.json': {...before, files: [...before.files, stale]}});
  await runPack({manifest: manifest([]), plan: filterPlan(plan, 'Border'), fullPlan: plan, overwrite: true, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  assert.deepEqual(run.exported, ['out/packs/test/borders/test-webcam-16x9.png']);
  const after = (run.disk.get('out/packs/test/manifest.json') as {files: {file: string}[]}).files;
  assert.deepEqual(after.map((entry) => entry.file), before.files.map((entry) => entry.file));
  // The entries this run did not touch are the ones the earlier run wrote, unchanged.
  for (const entry of before.files.filter((file) => !file.file.startsWith('borders/'))) {
    assert.deepEqual(after.find((file) => file.file === entry.file), entry);
  }
});

const MANIFEST = 'out/packs/test/manifest.json';
const savedFiles = (run: ReturnType<typeof fakeRun>) => (run.disk.get(MANIFEST) as {files: Record<string, unknown>[]}).files;

test('pack: the props hash covers composition, parsed props, format and frame, whatever the key order', () => {
  const png = samplePlan()[2]!;
  assert.equal(png.format, 'png');
  assert.match(packPropsHash(png), /^[0-9a-f]{64}$/);
  const reordered = {...png, exportProps: Object.fromEntries(Object.entries(png.exportProps).reverse())};
  assert.equal(packPropsHash(reordered), packPropsHash(png));
  for (const other of [
    {...png, composition: 'BlockLoop'}, {...png, format: 'webm' as const}, {...png, frame: 1},
    {...png, exportProps: {...png.exportProps, glow: 13}},
  ]) assert.notEqual(packPropsHash(other), packPropsHash(png));
});

test('pack: a finished file whose item props changed since its render is planned again, with a warning', async () => {
  const plan = samplePlan();
  const first = fakeRun();
  await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: false, deps: fakeDeps, effects: first.effects, diskLabel: 'out'});
  // One prop of the background (no sidecar) and of the chat item (sidecars) changes; every file name stays the same.
  const changed = planPack(manifest([
    {composition: 'FakeLoop', formats: ['webm'], props: {speed: 2}},
    {composition: 'ChatLoop', sizes: ['chat-standard'], formats: ['webm', 'png'], props: {glow: 20}},
    {composition: 'BorderLoop', sizes: ['webcam-16x9'], formats: ['png']},
  ]), fakeDeps);
  assert.deepEqual(changed.map((file) => file.output), plan.map((file) => file.output));
  const touched = changed.filter((file) => file.composition !== 'BorderLoop');
  const run = fakeRun(Object.fromEntries(first.disk));
  const result = await runPack({manifest: manifest([]), plan: changed, fullPlan: changed, overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  assert.deepEqual(run.exported, touched.map((file) => file.output));
  assert.deepEqual([result.rendered, result.skipped], [3, 1]);
  for (const file of touched) {
    assert.ok(run.logs.some((line) => line.endsWith(`${file.output}: Warning: its props changed since it was rendered; rendering it again.`)), file.output);
    const entry = savedFiles(run).find((saved) => `out/packs/test/${String(saved.file)}` === file.output)!;
    assert.equal(entry.propsHash, packPropsHash(file));
    assert.notEqual(entry.propsHash, packPropsHash(plan.find((old) => old.output === file.output)!));
  }
  // The new hash is on record: the same plan run again renders nothing.
  const again = fakeRun(Object.fromEntries(run.disk));
  await runPack({manifest: manifest([]), plan: changed, fullPlan: changed, overwrite: false, deps: fakeDeps, effects: again.effects, diskLabel: 'out'});
  assert.deepEqual(again.exported, []);
});

test('pack: a finished file without a recorded props hash is skipped with a warning and gets no hash', async () => {
  const plan = samplePlan();
  const first = fakeRun();
  await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: false, deps: fakeDeps, effects: first.effects, diskLabel: 'out'});
  const before = first.disk.get(MANIFEST) as {files: Record<string, unknown>[]};
  const unhashed = before.files.map((entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'propsHash')));
  // Two finished files lost their entries: the background has nothing else, the chat PNG left its sidecar behind.
  const lost = ['backgrounds/test-background.webm', 'chat/test-chat-standard.png'];
  const png = unhashed.find((entry) => entry.file === lost[1])!;
  const {canvas, box, content, hole, bleed, fps, frames, frame, format, alpha} = png;
  const run = fakeRun({
    ...Object.fromEntries(first.disk),
    [MANIFEST]: {...before, files: unhashed.filter((entry) => !lost.includes(String(entry.file)))},
    [`out/packs/test/${lost[1]}.json`]: {canvas, box, content, hole, bleed, fps, frames, frame, format, alpha},
  });
  const result = await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  assert.deepEqual(run.exported, []);
  assert.deepEqual([result.rendered, result.skipped], [0, 4]);
  const warnings = run.logs.filter((line) => line.endsWith('already exists, skipping. Warning: no props hash is recorded for it, so it may not match the plan; run with --overwrite to render it again.'));
  assert.equal(warnings.length, 4);
  // Skipping never vouches for a file: the entry stays without a hash, for zip:pack to refuse.
  assert.deepEqual(savedFiles(run), unhashed);
});

test('pack: as pastas temporárias de um export interrompido somem antes de tudo, inclusive da pasta vendida', async () => {
  const leftover = 'out/packs/test/borders/.asset-render-abc123/render.webm';
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
    /0\.5 GiB free/,
  );
  assert.deepEqual(run.exported, []);
});

test('pack: starts with 3 GiB free, and stops between files below 2 GiB saying how to resume', async () => {
  const GiB = 1024 ** 3;
  const refused = fakeRun({}, 3 * GiB - 1);
  await assert.rejects(
    runPack({manifest: manifest([]), plan: samplePlan(), fullPlan: samplePlan(), overwrite: false, deps: fakeDeps, effects: refused.effects, diskLabel: 'out'}),
    /Not enough free disk in out: .* a render needs at least 3\.0 GiB to start/,
  );
  assert.deepEqual(refused.exported, []);
  // Start, before the first file, before the second: below 2 GiB a running pack stops, whatever the file.
  const run = fakeRun({}, 3 * GiB);
  const free = [3 * GiB, 3 * GiB, 2 * GiB - 1];
  run.effects.freeBytes = async () => free.shift() ?? 0;
  await assert.rejects(
    runPack({manifest: manifest([]), plan: samplePlan(), fullPlan: samplePlan(), overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'}),
    /below the 2\.0 GiB a running render keeps\. .*run the same command again; finished files will be skipped\./,
  );
  assert.equal(run.exported.length, 1);
  // The first file is already in the manifest, so the same command resumes after it.
  const saved = run.disk.get('out/packs/test/manifest.json') as {files: unknown[]};
  assert.equal(saved.files.length, 1);
});

test('pack: a 1080p file is refused before it renders when its frames would leave less than 2 GiB', async () => {
  const GiB = 1024 ** 3;
  // The first planned file is a 1920×1080 WebM of 480 frames: about 1 GiB of frames before its encode.
  const run = fakeRun({}, 3 * GiB);
  const free = [3 * GiB, 2.9 * GiB];
  run.effects.freeBytes = async () => free.shift() ?? 0;
  await assert.rejects(
    runPack({manifest: manifest([]), plan: samplePlan(), fullPlan: samplePlan(), overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'}),
    /2\.9 GiB free, the next file needs up to 1\.0 GiB and 2\.0 GiB must stay free\. .*run the same command again/,
  );
  assert.deepEqual(run.exported, []);
});

const PACKS = OVERLAY_THEMES;
/**
 * What a twitch-panel item may set on top of its preset: the glass keeps an opaque PNG, which would
 * vanish on Twitch's light theme, and a kit may widen the padding so the panel's pockets hold its
 * motifs. The ornament harness proves the motifs fit; this only bounds what the item touches.
 */
const TWITCH_PANEL_KEYS = new Set(['transparent', 'paddingX', 'paddingY']);
const readPack = (name: string): unknown => JSON.parse(readFileSync(path.join(root, 'packs', `${name}.json`), 'utf8'));

const presetJson = (name: string): Record<string, unknown> => JSON.parse(readFileSync(path.join(root, 'presets', `${name}.json`), 'utf8'));

test('packs: cada kit de Halloween traz o seu fundo e os presets seguem a duração e a seed dele', () => {
  for (const theme of KIT_THEMES) {
    const pack = parsePackManifest(readPack(theme));
    // The kit's background is its one item without sizes.
    const backgrounds = pack.items.filter((item) => item.sizes === undefined);
    assert.equal(backgrounds.length, 1, theme);
    const {composition, preset} = backgrounds[0]!;
    assert.equal(getAsset(composition).kind, 'background', theme);
    assert.ok(preset, theme);
    const background = getAsset(composition).schema.parse(presetJson(preset)) as {durationSeconds: number; seed: number};
    for (const kind of ['chat', 'block', 'border'] as const satisfies readonly AssetKind[]) {
      const overlay = presetJson(`${kind}-${theme}`);
      assert.deepEqual([overlay.durationSeconds, overlay.seed], [background.durationSeconds, background.seed], `${kind}-${theme}`);
    }
  }
});

test('packs: os oito manifestos seguem o schema e cobrem todos os tamanhos do tema', () => {
  // Every theme's pack, exactly.
  assert.deepEqual(readdirSync(path.join(root, 'packs')).filter((file) => file.endsWith('.json')).sort(), expectedPackFiles());
  const ids = (kind: AssetKind) => sizesForKind(kind).map((size) => size.id);
  const screens = new Set(sizesForKind('border').filter((size) => size.props?.fit === 'screen').map((size) => size.id));
  for (const name of PACKS) {
    const pack = packManifestSchema.parse(readPack(name));
    assert.equal(pack.name, name);
    const kit = (KIT_THEMES as readonly string[]).includes(name);
    // The kit's items with ornaments (no variant) and, in the Halloween kits, their twins without.
    const byPreset = (preset: string, variant?: string) => pack.items.filter((item) => item.preset === preset && item.variant === variant);
    assert.deepEqual(byPreset(`chat-${name}`).flatMap((item) => item.sizes), ids('chat'));
    // The kits' screen frames come only without ornaments: large enough ornaments would eat the picture.
    assert.deepEqual(byPreset(`border-${name}`).flatMap((item) => item.sizes).sort(), ids('border').filter((id) => !kit || !screens.has(id)).sort());
    const blocks = byPreset(`block-${name}`);
    // The Halloween kits ship no Twitch panel (owner, 2026-10-06); the classic themes do.
    const blockIds = ids('block').filter((id) => !kit || id !== 'twitch-panel');
    assert.deepEqual(blocks.flatMap((item) => item.sizes).sort(), blockIds.sort());
    if (!kit) {
      const twitch = blocks.find((item) => item.sizes?.includes('twitch-panel'))!;
      assert.deepEqual(twitch.sizes, ['twitch-panel'], 'o painel da Twitch é um item separado');
      assert.deepEqual(twitch.formats, ['gif', 'png'], name);
      // The size itself turns glow and halo off; the panel takes item props only where it needs them.
      for (const key of Object.keys(twitch.props ?? {})) assert.ok(TWITCH_PANEL_KEYS.has(key), `${name}: ${key}`);
      assert.notEqual(twitch.props?.transparent, true, name);
    }
    // The kits' large frames scale their ornaments on a wider bleed (webcam-16x9-lg ×1.5, gameplay ×2);
    // the classic themes have no such items.
    const scaled = pack.items.filter((item) => item.props?.ornamentScale !== undefined);
    assert.deepEqual(scaled.map((item) => [item.sizes, item.props]), kit ? [
      [['webcam-16x9-lg'], {bleed: 72, ornamentScale: 1.5}], [['gameplay'], {bleed: 96, ornamentScale: 2}],
    ] : [], name);
    // Every size of the kit also ships without ornaments: the preset alone, only ornaments off.
    const plain = pack.items.filter((item) => item.sizes !== undefined && item.variant !== undefined);
    assert.ok(plain.every((item) => item.variant === 'plain'), name);
    if (kit) {
      for (const kind of ['chat', 'block', 'border'] as const) {
        const items = byPreset(`${kind}-${name}`, 'plain');
        assert.deepEqual(items.flatMap((item) => item.sizes).sort(), (kind === 'block' ? blockIds : ids(kind)).sort(), `${name}: ${kind} sem enfeites`);
        for (const item of items) assert.deepEqual(item.props, {ornaments: 'none'}, `${name}: ${kind} sem enfeites`);
      }
    } else {
      assert.deepEqual(plain, [], name);
    }
    for (const item of pack.items.filter((entry) => !entry.sizes?.includes('twitch-panel'))) {
      const still = isStaticOnly(name, item.composition);
      assert.deepEqual(item.formats, still ? ['png'] : ['webm', 'png'], `${name}/${item.composition}: mov é opcional`);
    }
    const backgrounds = pack.items.filter((item) => item.sizes === undefined);
    assert.ok(backgrounds.length >= 1, `${name}: o pack traz o fundo do tema`);
    // With two or more backgrounds, each carries its look as its variant, or they would share a name.
    assert.deepEqual(backgrounds.map((item) => item.variant),
      name === 'halloween' ? ['midnight', 'haunted-mansion', 'cobweb'] : backgrounds.map(() => undefined), name);
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
    // masks of the nine window sizes: seven, since the three round webcams share one disc (the two
    // screen frames have none). The Halloween kits hold every size twice (with ornaments, screens
    // excepted, and plain), sharing the masks, and no Twitch panel.
    const kit = (KIT_THEMES as readonly string[]).includes(name);
    const sizes = kit ? (5 + 10 + 9) + (5 + 10 + 11) : 5 + 10 + 11 + 1;
    const stills = droppedWebms(name);
    assert.equal(plan.length, 2 * backgrounds + 2 * sizes - stills + 7, name);
    assert.equal(new Set(plan.map((file) => file.output)).size, plan.length);
    for (const file of plan) {
      assert.ok(file.output.startsWith(`out/packs/${name}/`), file.output);
      assert.ok(file.canvas.width % 2 === 0 && file.canvas.height % 2 === 0, file.output);
    }
    const twitch = plan.filter((file) => file.size === 'twitch-panel');
    // The Halloween kits ship no Twitch panel (owner, 2026-10-06).
    assert.deepEqual(twitch.map((file) => [path.posix.basename(file.output), file.canvas]), kit ? [] : [
      [`${name}-twitch-panel.gif`, {width: 320, height: 160}],
      [`${name}-twitch-panel.png`, {width: 320, height: 160}],
    ]);
    if (kit) {
      // The scaled frames keep their box and widen the file by the item's bleed; the twins keep the size's.
      const ext = isStaticOnly(name, 'BorderLoop') ? 'png' : 'webm';
      const canvasOf = (file: string) => plan.find((entry) => entry.output === `out/packs/${name}/borders/${file}`)!.canvas;
      assert.deepEqual(canvasOf(`${name}-gameplay.${ext}`), {width: 1440 + 2 * 96, height: 810 + 2 * 96});
      assert.deepEqual(canvasOf(`${name}-gameplay-plain.${ext}`), {width: 1440 + 2 * 48, height: 810 + 2 * 48});
      assert.deepEqual(canvasOf(`${name}-webcam-16x9-lg.${ext}`), {width: 960 + 2 * 72, height: 540 + 2 * 72});
      assert.deepEqual(canvasOf(`${name}-fullscreen-plain.${ext}`), {width: 1920, height: 1080});
      assert.ok(!plan.some((file) => file.output.endsWith(`${name}-fullscreen.${ext}`)), `${name}: telas só sem enfeites`);
    }
  }
});

test('packs: halloween-backgrounds traz o fundo de cada kit de Halloween, como no kit, em mp4, webm e png', () => {
  const pack = parsePackManifest(readPack('halloween-backgrounds'));
  // The kit's background is its one item without sizes; this pack sells it with the same composition and preset.
  const kitBackground = (theme: string) => parsePackManifest(readPack(theme)).items.find((item) => item.sizes === undefined)!;
  assert.deepEqual(pack.items.map((item) => [item.composition, item.preset, item.variant, item.props]), KIT_THEMES.map((theme) => {
    const background = kitBackground(theme);
    return [background.composition, background.preset, theme.replace(/^halloween-/, ''), background.props];
  }));
  // Backgrounds only, so no masks: per background the mp4 (it plays anywhere), the webm the kits use and the still.
  const plan = planPack(pack, realPackDeps);
  assert.deepEqual(plan.map((file) => file.output), pack.items.flatMap((item) => ['mp4', 'webm', 'png'].map((format) =>
    `out/packs/halloween-backgrounds/backgrounds/halloween-backgrounds-background-${item.variant}.${format}`)));
  for (const file of plan) assert.deepEqual(file.canvas, {width: 1920, height: 1080}, file.output);
});

test('packs: cada arquivo exporta todas as props do schema, sem herdar os defaults salvos no Studio', () => {
  for (const name of [...PACKS, ...BACKGROUND_PACKS]) {
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
  const column = plan.find((file) => file.output.endsWith('neon-chat-column.webm'))!;
  assert.notEqual(column.motion!.strokeSpeed, 160);
  assert.ok(Math.abs(column.motion!.strokeSpeed / 160 - 1) <= 0.35, String(column.motion!.strokeSpeed));
  assert.match(dryRunText([column]), new RegExp(`, stroke ${column.motion!.strokeSpeed} px/s, fill ${column.motion!.fillSpeed} px/s\n`));
});

test('packs: cada borda de janela aponta a máscara OBS do seu tamanho, planejada uma vez logo depois dela', () => {
  for (const name of PACKS) {
    const plan = planPack(parsePackManifest(readPack(name)), realPackDeps);
    const masks = plan.filter((file) => file.role === 'mask');
    const windows = sizesForKind('border').filter((size) => size.props?.fit !== 'screen');
    // One mask per window size, shared by the kits' two variants, except the round webcams, which
    // share webcam-round's disc, drawn at the widest of them (OBS stretches it to the camera).
    const SHARED_DISC = ['webcam-round-sm', 'webcam-round-lg'];
    const maskSizeOf = (id: string) => (SHARED_DISC.includes(id) ? 'webcam-round' : id);
    assert.deepEqual(masks.map((file) => file.output).sort(), windows.filter((size) => !SHARED_DISC.includes(size.id))
      .map((size) => `out/packs/${name}/masks/${name}-${size.id}-mask.png`).sort(), name);
    for (const mask of masks) {
      const size = windows.find((entry) => entry.id === (mask.size === 'webcam-round' ? 'webcam-round-lg' : mask.size))!;
      assert.deepEqual(mask.canvas, {width: size.width, height: size.height}, 'do tamanho da câmera');
      assert.deepEqual([mask.format, mask.frame, mask.composition, mask.folder], ['png', 0, 'BorderLoop', 'masks']);
      assert.deepEqual(
        [mask.exportProps.mask, mask.exportProps.bleed, mask.exportProps.outputFormat, mask.exportProps.transparent],
        [true, 0, 'png', true],
      );
      // Right after the last format of the first item that needs it.
      const index = plan.indexOf(mask);
      assert.equal(plan[index - 1]!.mask, mask.output);
      const entry = packFileEntry(mask, `out/packs/${name}`, realPackDeps.getAsset('BorderLoop'), null);
      assert.equal(entry.role, 'mask');
      assert.equal(entry.motion, undefined);
      assert.deepEqual([entry.hole, entry.bleed, entry.alpha, entry.frames], [null, 0, true, 1]);
    }
    for (const file of plan.filter((entry) => entry.composition === 'BorderLoop' && entry.role !== 'mask')) {
      const isWindow = windows.some((size) => size.id === file.size);
      assert.equal(file.mask, isWindow ? `out/packs/${name}/masks/${name}-${maskSizeOf(file.size!)}-mask.png` : undefined, file.output);
      const entry = packFileEntry(file, `out/packs/${name}`, realPackDeps.getAsset('BorderLoop'), null);
      assert.equal(entry.mask, isWindow ? `masks/${name}-${maskSizeOf(file.size!)}-mask.png` : undefined, file.output);
      // Even with a sidecar that names another mask file (older exports did), the pack's own mask wins.
      const sidecar = {...entry, mask: `BorderLoop-${file.size}-mask.png`, hole: entry.hole};
      const fromSidecar = packFileEntry(file, `out/packs/${name}`, realPackDeps.getAsset('BorderLoop'), sidecar);
      assert.equal(fromSidecar.mask, entry.mask, file.output);
      assert.deepEqual(fromSidecar.motion, entry.motion, file.output);
    }
    assert.match(dryRunText(plan), new RegExp(`out/packs/${name}/masks/${name}-webcam-16x9-mask\\.png  640×360, frame 0\n`));
  }
});

test('packs: a máscara depende só do tamanho e do raio; raios diferentes no mesmo pack levam o raio no nome', () => {
  // One pack holds a size once per format, so the two themes here differ by format.
  const border = (preset: string, format: 'webm' | 'png', props: Record<string, unknown> = {}) => ({
    composition: 'BorderLoop', preset, props, sizes: ['webcam-16x9', 'webcam-square', 'fullscreen'], formats: [format],
  });
  const masksOf = (plan: PlannedFile[]) => plan.filter((file) => file.role === 'mask');
  const names = (plan: PlannedFile[]) => masksOf(plan).map((file) => path.posix.basename(file.output));
  // Two themes with one radius share each mask, and both point at it.
  const shared = planPack(manifest([border('border-neon', 'webm', {radius: 20}), border('border-pastel', 'png', {radius: 20})]), realPackDeps);
  assert.deepEqual(names(shared), ['test-webcam-16x9-mask.png', 'test-webcam-square-mask.png']);
  assert.deepEqual(shared.filter((file) => file.mask === 'out/packs/test/masks/test-webcam-16x9-mask.png').map((file) => file.output), [
    'out/packs/test/borders/test-webcam-16x9.webm', 'out/packs/test/borders/test-webcam-16x9.png',
  ]);
  // A radius beyond the circle is the circle: 200 and 999 on the square webcam give one mask.
  const circle = planPack(manifest([border('border-neon', 'webm', {radius: 200}), border('border-pastel', 'png', {radius: 999})]), realPackDeps);
  assert.deepEqual(masksOf(circle).map((file) => [path.posix.basename(file.output), file.exportProps.radius]), [
    ['test-webcam-16x9-mask.png', 180], ['test-webcam-square-mask.png', 200],
  ]);
  // Different radii for one size: each mask carries its radius, and each file points at its own.
  const mixed = planPack(manifest([border('border-neon', 'webm'), border('border-pastel', 'png')]), realPackDeps);
  assert.deepEqual(names(mixed), [
    'test-webcam-16x9-mask-radius-16.png', 'test-webcam-square-mask-radius-16.png', 'test-webcam-16x9-mask-radius-24.png', 'test-webcam-square-mask-radius-24.png',
  ]);
  const pastel = mixed.find((file) => file.output === 'out/packs/test/borders/test-webcam-16x9.png')!;
  assert.equal(pastel.mask, 'out/packs/test/masks/test-webcam-16x9-mask-radius-24.png');
  assert.equal(filterPlan(mixed, 'webcam-square').filter((file) => file.role === 'mask').length, 2, '--only leva as máscaras do tamanho');
});

test('packs: OBS estica a máscara, então só a forma em proporção decide quem a divide', () => {
  const border = (sizes: string[], format: 'webm' | 'png', radius: number) => ({
    composition: 'BorderLoop', preset: 'border-neon', props: {radius}, sizes, formats: [format],
  });
  const masksOf = (plan: PlannedFile[]) => plan.filter((file) => file.role === 'mask')
    .map((file) => [path.posix.basename(file.output), file.canvas.width, file.exportProps.radius]);
  // Same aspect, same radius in px: 16 px on 640 is not 16 px on 960 once stretched, so two masks.
  const fixed = planPack(manifest([border(['webcam-16x9', 'webcam-16x9-lg'], 'webm', 16)]), realPackDeps);
  assert.deepEqual(masksOf(fixed), [['test-webcam-16x9-mask.png', 640, 16], ['test-webcam-16x9-lg-mask.png', 960, 16]]);
  // The radius in proportion (16 on 640, 24 on 960): one mask, named after the shorter id, drawn at the wider.
  const scaled = planPack(manifest([border(['webcam-16x9'], 'webm', 16), border(['webcam-16x9-lg'], 'png', 24)]), realPackDeps);
  assert.deepEqual(masksOf(scaled), [['test-webcam-16x9-mask.png', 960, 24]]);
  assert.deepEqual(scaled.filter((file) => file.role !== 'mask').map((file) => file.mask), [
    'out/packs/test/masks/test-webcam-16x9-mask.png', 'out/packs/test/masks/test-webcam-16x9-mask.png',
  ]);
  // Round webcams are always one disc, whatever the radius asked.
  const round = planPack(manifest([border(['webcam-round-sm', 'webcam-round', 'webcam-round-lg'], 'webm', 16)]), realPackDeps);
  assert.deepEqual(masksOf(round), [['test-webcam-round-mask.png', 560, 280]]);
  // Another aspect never shares: the 4:3 and the square webcam keep their own.
  const aspects = planPack(manifest([border(['webcam-4x3', 'webcam-square'], 'webm', 0)]), realPackDeps);
  assert.deepEqual(masksOf(aspects).map(([name]) => name), ['test-webcam-4x3-mask.png', 'test-webcam-square-mask.png']);
});

test('every real pack plans only buyer-rule names', () => {
  const folders = new Set(['backgrounds', 'chat', 'text-boxes', 'twitch-panels', 'borders', 'masks']);
  let longest = '';
  for (const name of PACKS) {
    const plan = planPack(parsePackManifest(readPack(name)), realPackDeps);
    const basenames = new Set<string>();
    for (const file of plan) {
      const relative = path.posix.relative(`out/packs/${name}`, file.output);
      const [folder, base, ...rest] = relative.split('/');
      assert.deepEqual(rest, [], relative);
      assert.ok(folders.has(folder!), relative);
      assert.equal(folder, file.folder, relative);
      assert.match(base!, /^[a-z0-9]+(-[a-z0-9]+)*\.(webm|png|gif|mov|mp4)$/, relative);
      const variant = file.variant === undefined ? '' : `-${file.variant}`;
      const expected = file.role === 'mask' ? `${name}-${file.size}-mask.png`
        : file.kind === 'background' ? `${name}-background${variant}.${file.format}` : `${name}-${file.size}${variant}.${file.format}`;
      assert.equal(base, expected, relative);
      assert.equal(folder, file.role === 'mask' ? 'masks' : file.size === 'twitch-panel' ? 'twitch-panels' : file.folder, relative);
      assert.ok(!basenames.has(base!), `${name}: ${base} twice`);
      basenames.add(base!);
      if (base!.length > longest.length) longest = base!;
    }
  }
  assert.equal(longest, 'halloween-haunted-mansion-fullscreen-vertical-plain.webm');
  assert.equal(longest.length, 56);
});

// A refusal points the way out: an unknown pack name lists the packs that exist (plan rule 4.1.10).
test('pack: an unknown pack name is refused with the pack ids that exist, in order', () => {
  assert.throws(() => existingManifestFile('halloween-noite'), (error: Error) => {
    const match = /^Unknown pack: halloween-noite\. Options: (.+)\.$/.exec(error.message);
    assert.ok(match, error.message);
    const options = match[1]!.split(', ');
    for (const id of ['neon', 'halloween-midnight']) assert.ok(options.includes(id), `${id} missing from ${match[1]}`);
    assert.deepEqual(options, [...options].sort(), 'options are sorted');
    assert.ok(options.every((id) => !id.endsWith('.json') && id !== ''), match[1]);
    return true;
  });
  assert.ok(existingManifestFile('neon').endsWith(path.join('packs', 'neon.json')));
  // A .json path is a file, not a pack id: it keeps the file message.
  assert.throws(() => existingManifestFile('nope/missing-pack.json'), /^Error: Manifest not found: .*missing-pack\.json\.$/);
});

test('pack: the run ends pointing at the zip, with the pack as the CLI named it', async () => {
  const plan = samplePlan();
  const run = fakeRun();
  await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: false, deps: fakeDeps, effects: run.effects, diskLabel: 'out'});
  assert.equal(run.logs.at(-1), 'Next: npm run zip:pack -- test');
  const named = fakeRun();
  await runPack({manifest: manifest([]), plan, fullPlan: plan, overwrite: false, deps: fakeDeps, effects: named.effects, diskLabel: 'out', target: 'packs/test.json'});
  assert.equal(named.logs.at(-1), 'Next: npm run zip:pack -- packs/test.json');
});

const cli = (script: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(root, 'scripts', script), ...args], {cwd: root, encoding: 'utf8'});

test('pack: both CLIs refuse an unknown pack with the options, and --dry-run points at nothing', () => {
  for (const script of ['pack.ts', 'zip-pack.ts']) {
    const refused = cli(script, 'halloween-noite');
    assert.equal(refused.status, 1, `${script}: ${refused.stderr}`);
    assert.match(refused.stderr, /Unknown pack: halloween-noite\. Options: .*\bneon\b/, script);
  }
  const dry = cli('pack.ts', 'neon', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^Pack: neon$/m);
  assert.doesNotMatch(dry.stdout + dry.stderr, /Next:/);
});

test('pack: the plan refuses a buyer file name used twice or over 100 characters, before any render', () => {
  // The same free size in two kinds: two folders, one file name for the buyer.
  assert.throws(() => planPack(manifest([
    {composition: 'ChatLoop', props: {width: 700, height: 100}, formats: ['webm']},
    {composition: 'BlockLoop', props: {width: 700, height: 100}, formats: ['webm']},
  ]), fakeDeps), /Item 2 \(BlockLoop\): the file name test-700x100\.webm repeats chat\/test-700x100\.webm, from Item 1 \(ChatLoop\)/);
  assert.equal(planPack(manifest([{composition: 'ChatLoop', props: {width: 700, height: 100}, formats: ['webm', 'png']}]), fakeDeps).length, 2);
  // A long pack name takes a path over the 100 characters a buyer path may have.
  assert.throws(() => planPack(manifest([{composition: 'ChatLoop', sizes: ['chat-standard'], formats: ['webm']}], `pack-${'x'.repeat(80)}`), fakeDeps),
    /Item 1 \(ChatLoop\): chat\/pack-x+-chat-standard\.webm: 109 characters, over the 100 a buyer path may have/);
});
