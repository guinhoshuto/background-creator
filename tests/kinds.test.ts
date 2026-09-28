import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assetCatalog, backgroundCatalog, getAsset, getBackground, getLayoutOf} from '../src/catalog';
import {ASSET_KINDS, OVERLAY_KINDS, getKindPolicy, isOverlayKind, kindPolicies} from '../src/kinds';
import {RemotionRoot} from '../src/Root';
import {getCompositionMetadata} from '../src/settings';
import {findComposition, folderOf} from './helpers/find-composition';

test('tipos: os quatro tipos e a política de cada um', () => {
  assert.deepEqual(ASSET_KINDS, ['background', 'chat', 'block', 'border']);
  assert.deepEqual(OVERLAY_KINDS, ['chat', 'block', 'border']);
  assert.deepEqual(
    ASSET_KINDS.map((kind) => {
      const {folder, fixedSize, defaultSizeId, transparent, format} = kindPolicies[kind];
      return [kind, folder, fixedSize, defaultSizeId, transparent, format];
    }),
    [
      ['background', 'backgrounds', {width: 1920, height: 1080}, null, false, 'webm'],
      ['chat', 'chat', null, 'chat-standard', true, 'webm'],
      ['block', 'text-boxes', null, 'card', true, 'webm'],
      ['border', 'borders', null, 'webcam-16x9', true, 'webm'],
    ],
  );
  for (const kind of ASSET_KINDS) {
    const policy = kindPolicies[kind];
    assert.equal(policy.kind, kind);
    // Remotion refuses folder names with accents, spaces or underscores.
    assert.match(policy.folder, /^[a-zA-Z0-9-]+$/, kind);
    assert.ok(policy.label.length > 3, kind);
    assert.equal(isOverlayKind(kind), kind !== 'background');
    assert.equal(getKindPolicy(kind), policy);
  }
  assert.equal(new Set(ASSET_KINDS.map((kind) => kindPolicies[kind].folder)).size, ASSET_KINDS.length);
  assert.throws(() => getKindPolicy('panel'), /Unknown kind: panel\. Options: background, chat, block, border\./);
  assert.throws(() => getKindPolicy('__proto__'), /Unknown kind/);
});

test('tipos: o tamanho fixo dos fundos é o mesmo dos metadados atuais', () => {
  const {width, height} = getCompositionMetadata({durationSeconds: 8, outputFormat: 'webm'});
  assert.deepEqual(kindPolicies.background.fixedSize, {width, height});
});

test('catalog: all 15 backgrounds retain their original composition IDs', () => {
  const ids = Object.keys(backgroundCatalog);
  assert.equal(ids.length, 15);
  for (const id of ids) {
    const entry = getAsset(id);
    assert.equal(entry, backgroundCatalog[id as keyof typeof backgroundCatalog]);
    assert.equal(entry, getBackground(id));
    assert.equal(entry.kind, 'background');
    assert.equal(getLayoutOf(entry), null, `${id}: fundos não têm layout de caixa`);
  }
  for (const entry of Object.values(assetCatalog)) {
    assert.ok((ASSET_KINDS as readonly string[]).includes(entry.kind), entry.id);
  }
  assert.throws(() => getAsset('UnknownLoop'), /Unknown composition: UnknownLoop\. Options: WutheringWavesLoop, KawaiiLoop, /);
  assert.throws(() => getAsset('__proto__'), /Unknown composition/);
});

test('Studio: cada composição fica na pasta do seu tipo, com metadados de fundo intactos', () => {
  const root = RemotionRoot();
  type Registered = {id: string; width: number; height: number; fps: number; durationInFrames: number;
    calculateMetadata: (options: {props: Record<string, unknown>}) => Record<string, unknown>};
  for (const entry of Object.values(assetCatalog)) {
    assert.equal(folderOf(root, entry.id), kindPolicies[entry.kind].folder, entry.id);
    const composition = findComposition<Registered>(root, entry.id);
    assert.ok(composition, `${entry.id} precisa estar registrada no Studio`);
    const metadata = composition.props.calculateMetadata({props: entry.defaultProps});
    // Backgrounds keep full HD and <Id>; sized kinds open at their layout's canvas, named by size.
    const layout = getLayoutOf(entry);
    const canvas = layout ? layout(entry.defaultProps).canvas : {width: 1920, height: 1080};
    assert.equal(metadata.width, canvas.width, entry.id);
    assert.equal(metadata.height, canvas.height, entry.id);
    assert.equal(composition.props.width, canvas.width, `${entry.id}: tamanho inicial do Studio`);
    assert.equal(composition.props.height, canvas.height, `${entry.id}: tamanho inicial do Studio`);
    const {defaultSizeId} = kindPolicies[entry.kind];
    assert.equal(metadata.defaultOutName, defaultSizeId ? `${entry.id}-${defaultSizeId}` : entry.id,
      'Remotion appends the extension itself');
    assert.equal(metadata.defaultVideoImageFormat, 'png');
  }
  assert.equal(findComposition(root, 'Inexistente'), undefined);
});

test('Studio: MOV e PNG ganham os padrões do exportador oficial', () => {
  type Registered = {id: string; calculateMetadata: (options: {props: Record<string, unknown>}) => Record<string, unknown>};
  const composition = findComposition<Registered>(RemotionRoot(), 'GradientLoop');
  assert.ok(composition);
  const defaults = backgroundCatalog.GradientLoop.defaultProps;
  const mov = composition.props.calculateMetadata({props: {...defaults, outputFormat: 'mov', transparent: true}});
  assert.equal(mov.defaultCodec, 'prores');
  assert.equal(mov.defaultProResProfile, '4444');
  assert.equal(mov.defaultPixelFormat, 'yuva444p10le');
  assert.equal(mov.defaultOutName, 'GradientLoop');
  const png = composition.props.calculateMetadata({props: {...defaults, outputFormat: 'png', transparent: true}});
  assert.equal(png.defaultCodec, undefined);
  assert.equal(png.defaultProResProfile, undefined);
  assert.equal(png.defaultOutName, 'GradientLoop');
  assert.equal(png.width, 1920);
  assert.equal(png.fps, 60);
  const webm = composition.props.calculateMetadata({props: {...defaults, outputFormat: 'webm', transparent: true}});
  assert.equal(webm.defaultProResProfile, undefined);
  assert.equal(webm.defaultPixelFormat, 'yuva420p');
});
