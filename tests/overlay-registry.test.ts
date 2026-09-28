import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {buildSidecar, resolveExport} from '../scripts/export';
import {getLayoutOf, overlayCatalog} from '../src/catalog';
import {kindPolicies} from '../src/kinds';
import {RemotionRoot} from '../src/Root';
import {canvasOf, sizeProps, sizesForKind} from '../src/sizes';
import {findComposition, folderOf} from './helpers/find-composition';
import {OVERLAY_THEMES, expectedPresetFiles} from './helpers/themes';

/**
 * The seam between the overlay kinds and everything that serves them: presets, the Studio root,
 * the layout the exporter and the packs read, and the file names. Each kind's own test covers
 * its geometry and motion; this one checks they are wired the same way.
 */

const overlays = Object.values(overlayCatalog);
const THEMES = OVERLAY_THEMES;
const PRESET_PREFIX = {chat: 'chat', bloco: 'bloco', borda: 'borda'} as const;

type Registered = {
  id: string; width: number; height: number; defaultProps: Record<string, unknown>;
  calculateMetadata: (options: {props: Record<string, unknown>}) => Record<string, unknown>;
};

const presetsDir = new URL('../presets/', import.meta.url);
const readPreset = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(file, presetsDir), 'utf8')) as Record<string, unknown>;

/** A named size as props: the size id alone must yield a valid file (painel-twitch turns glow and halo off itself). */
const sizePatch = sizeProps;

test('overlays: o catálogo registra chat, bloco e borda com layout e o tipo de cada um', () => {
  assert.deepEqual(overlays.map((entry) => [entry.id, entry.kind]), [
    ['ChatLoop', 'chat'], ['BlocoLoop', 'bloco'], ['BordaLoop', 'borda'],
  ]);
  for (const entry of overlays) {
    assert.ok(getLayoutOf(entry), `${entry.id}: sem getLayout o export não publica o JSON de posição`);
    assert.deepEqual(entry.schema.parse({}), entry.defaultProps, entry.id);
    assert.deepEqual(entry.schema.strict().parse(entry.defaultProps), entry.defaultProps, entry.id);
    const policy = kindPolicies[entry.kind];
    assert.equal(entry.defaultProps.transparent, policy.transparent, entry.id);
    assert.equal(entry.defaultProps.outputFormat, policy.format, entry.id);
    const size = sizesForKind(entry.kind).find(({id}) => id === policy.defaultSizeId)!;
    assert.deepEqual(getLayoutOf(entry)!(entry.defaultProps).canvas, canvasOf(size), `${entry.id}: abre no tamanho padrão do tipo`);
  }
});

test('overlays: cada preset de tema passa no schema estrito, sem fixar tamanho, em todo tamanho do tipo', () => {
  const files = readdirSync(presetsDir).filter((file) => /^(chat|bloco|borda)-.*\.json$/.test(file)).sort();
  // Every theme's three presets, exactly.
  assert.deepEqual(files, expectedPresetFiles());
  for (const entry of overlays) {
    for (const theme of THEMES) {
      const file = `${PRESET_PREFIX[entry.kind]}-${theme}.json`;
      const preset = readPreset(file);
      // A size id fixes the product; a preset that carried one would fight it.
      for (const key of ['width', 'height', 'bleed', 'fit', 'guides']) assert.equal(key in preset, false, `${file}: sem ${key}`);
      const result = entry.schema.strict().safeParse(preset);
      assert.ok(result.success, `${file}: ${result.success ? '' : result.error.message}`);
      for (const size of sizesForKind(entry.kind)) {
        const sized = entry.schema.strict().safeParse({...preset, ...sizePatch(size)});
        assert.ok(sized.success, `${file} em ${size.id}: ${sized.success ? '' : sized.error.message}`);
      }
    }
  }
});

test('overlays: o Root registra cada composição na pasta do tipo com defaultProps literal = schema.parse({})', () => {
  const source = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');
  const root = RemotionRoot();
  for (const entry of overlays) {
    const folder = kindPolicies[entry.kind].folder;
    assert.match(folder, /^[a-zA-Z0-9-]+$/);
    assert.equal(folderOf(root, entry.id), folder, entry.id);
    // "Save default props" in the Studio rewrites this literal, so it must be a literal, inside the kind's folder.
    const block = new RegExp(`<Folder name=\\{kindPolicies\\.${entry.kind}\\.folder\\}>([\\s\\S]*?)</Folder>`).exec(source);
    assert.ok(block, `Root.tsx precisa de <Folder name={kindPolicies.${entry.kind}.folder}>`);
    const literal = new RegExp(`id="${entry.id}"[\\s\\S]*?defaultProps=\\{(\\{.*?\\})\\}`).exec(block[1]!);
    assert.ok(literal, `Root.tsx precisa de um defaultProps literal para ${entry.id}`);
    assert.deepEqual(JSON.parse(literal[1]!.replace(/ as const/g, '')), entry.schema.parse({}), entry.id);
    const composition = findComposition<Registered>(root, entry.id)!;
    assert.deepEqual(composition.props.defaultProps, entry.defaultProps, entry.id);
  }
});

test('overlays: o Studio abre cada tamanho nomeado com o canvas do layout e o nome do export', () => {
  const root = RemotionRoot();
  for (const entry of overlays) {
    const composition = findComposition<Registered>(root, entry.id)!;
    const layout = getLayoutOf(entry)!;
    for (const size of sizesForKind(entry.kind)) {
      const props = entry.schema.parse({...sizePatch(size)}) as Record<string, unknown>;
      const canvas = layout(props).canvas;
      assert.deepEqual(canvas, canvasOf(size), `${entry.id} ${size.id}: arquivo = caixa + 2·bleed`);
      for (const outputFormat of ['webm', 'gif', 'png'] as const) {
        const metadata = composition.props.calculateMetadata({props: {...props, outputFormat}});
        assert.deepEqual([metadata.width, metadata.height], [canvas.width, canvas.height], `${entry.id} ${size.id} ${outputFormat}`);
        assert.equal(metadata.defaultOutName, `${entry.id}-${size.id}`, 'Remotion appends the extension itself');
      }
    }
  }
});

test('overlays: o export nomeia pelo tamanho, publica o JSON de posição e recusa guides', () => {
  for (const entry of overlays) {
    for (const size of sizesForKind(entry.kind)) {
      for (const format of ['webm', 'mov', 'png', 'gif'] as const) {
        const resolved = resolveExport({compositionId: entry.id, format, props: sizePatch(size)});
        assert.equal(path.basename(resolved.output), `${entry.id}-${size.id}.${format}`);
        assert.equal(resolved.sidecar, `${resolved.output}.json`);
      }
    }
    // A free size carries its box instead of a name (the kind's own bleed holds its glow).
    const free = resolveExport({compositionId: entry.id, format: 'webm', props: {width: 500, height: 300}});
    assert.equal(path.basename(free.output), `${entry.id}-500x300.webm`);
    assert.throws(() => resolveExport({compositionId: entry.id, format: 'webm', props: {guides: true}}), /Turn guides off to export\./);
  }
  // The chat's title area reaches the buyer next to the file; kinds without one keep the shape they had.
  const chat = resolveExport({compositionId: 'ChatLoop', format: 'png', props: sizeProps(sizesForKind('chat')[0]!)});
  const layout = getLayoutOf(chat.asset)!(chat.props);
  const sidecar = buildSidecar({
    output: chat.output, asset: chat.asset, props: chat.props, layout, fps: 60, durationInFrames: 480, format: 'png', frame: 0,
  });
  assert.deepEqual(sidecar.header, layout.header);
  assert.ok(layout.header && layout.header.y >= layout.box.y && layout.header.y + layout.header.height <= layout.content.y);
  const borda = resolveExport({compositionId: 'BordaLoop', format: 'webm'});
  const bordaSidecar = buildSidecar({
    output: borda.output, asset: borda.asset, props: borda.props, layout: getLayoutOf(borda.asset)!(borda.props),
    fps: 60, durationInFrames: 480, format: 'webm', frame: null,
  });
  assert.equal('header' in bordaSidecar, false);
});
