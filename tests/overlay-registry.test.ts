import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {buildSidecar, resolveExport} from '../scripts/export';
import {expandSize} from '../scripts/render-args';
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
/** The kinds whose box comes from props; the vertical kind (fixed 1080×1920) has its own test below. */
const sized = overlays.filter((entry) => kindPolicies[entry.kind].fixedSize === null);
const verticals = overlays.filter((entry) => entry.kind === 'vertical');
const THEMES = OVERLAY_THEMES;
const PRESET_PREFIX = {chat: 'chat', block: 'block', border: 'border'} as const;

type Registered = {
  id: string; width: number; height: number; defaultProps: Record<string, unknown>;
  calculateMetadata: (options: {props: Record<string, unknown>}) => Record<string, unknown>;
};

const presetsDir = new URL('../presets/', import.meta.url);
const readPreset = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(file, presetsDir), 'utf8')) as Record<string, unknown>;

/** A named size as props: the size id alone must yield a valid file (twitch-panel turns glow and halo off itself). */
const sizePatch = sizeProps;

test('overlays: o catálogo registra chat, bloco e borda com layout e o tipo de cada um', () => {
  assert.deepEqual(overlays.map((entry) => [entry.id, entry.kind]), [
    ['ChatLoop', 'chat'], ['BlockLoop', 'block'], ['BorderLoop', 'border'],
    ['LiveFrameLoop', 'vertical'], ['SafeZoneGuide', 'vertical'], ['LiveUiMock', 'vertical'], ['FeedUiMock', 'vertical'],
  ]);
  for (const entry of sized) {
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
  const files = readdirSync(presetsDir).filter((file) => /^(chat|block|border)-.*\.json$/.test(file)).sort();
  // Every theme's three presets, exactly.
  assert.deepEqual(files, expectedPresetFiles());
  for (const entry of sized) {
    for (const theme of THEMES) {
      const file = `${PRESET_PREFIX[entry.kind as keyof typeof PRESET_PREFIX]}-${theme}.json`;
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
  for (const entry of sized) {
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

test('overlays: o tipo vertical abre em 1080×1920, sem layout de caixa, nomeado live-frame, e recusa --size', () => {
  const root = RemotionRoot();
  assert.deepEqual(verticals.map((entry) => entry.id), ['LiveFrameLoop', 'SafeZoneGuide', 'LiveUiMock', 'FeedUiMock']);
  for (const entry of verticals) {
    assert.equal(getLayoutOf(entry), null, `${entry.id}: the canvas is the kind's, not a box's`);
    assert.deepEqual(entry.schema.parse({}), entry.defaultProps, entry.id);
    assert.deepEqual(entry.schema.strict().parse(entry.defaultProps), entry.defaultProps, entry.id);
    assert.equal(entry.defaultProps.transparent, true, entry.id);
    assert.equal(entry.defaultProps.outputFormat, 'webm', entry.id);
    for (const key of ['width', 'height', 'bleed']) assert.equal(key in entry.defaultProps, false, `${entry.id}: no ${key}`);
    const composition = findComposition<Registered>(root, entry.id)!;
    assert.deepEqual([composition.props.width, composition.props.height], [1080, 1920], `${entry.id}: Studio size`);
    for (const outputFormat of ['webm', 'png', 'mp4'] as const) {
      const metadata = composition.props.calculateMetadata({props: {...entry.defaultProps, outputFormat}});
      assert.deepEqual([metadata.width, metadata.height], [1080, 1920], `${entry.id} ${outputFormat}`);
      assert.equal(metadata.fps, 60, `${entry.id}: the repo's 60 fps`);
      assert.equal(metadata.defaultOutName, `${entry.id}-live-frame`, 'Remotion appends the extension itself');
    }
    const resolved = resolveExport({compositionId: entry.id, format: 'png'});
    assert.equal(path.basename(resolved.output), `${entry.id}-live-frame.png`);
    assert.equal(resolved.sidecar, null, `${entry.id}: no box layout, no position JSON`);
    assert.throws(() => expandSize(entry.kind, 'live-frame'), /Vertical overlays have a fixed size \(1080×1920\): --size, --width, --height and --bleed only apply to chat backgrounds, text boxes and borders\./);
  }
});

test('overlays: o export nomeia pelo tamanho, publica o JSON de posição e recusa guides', () => {
  for (const entry of sized) {
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
  const border = resolveExport({compositionId: 'BorderLoop', format: 'webm'});
  const borderSidecar = buildSidecar({
    output: border.output, asset: border.asset, props: border.props, layout: getLayoutOf(border.asset)!(border.props),
    fps: 60, durationInFrames: 480, format: 'webm', frame: null,
  });
  assert.equal('header' in borderSidecar, false);
});
