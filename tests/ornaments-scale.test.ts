import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ORNAMENT_REGISTRY, ORNAMENT_SET_IDS, ornamentOutset, scaleOrnamentFrame} from '../src/overlays/shared';
import {getSize, sizeProps} from '../src/sizes';
import {ORNAMENT_KINDS, type OrnamentKindName} from './helpers/ornament-kinds';

/**
 * ornamentScale: every motif grows by s together. The set is placed on the kind's frame shrunk by
 * 1/s and drawn scaled by s, so each motif stays in its room of the real frame (the harness checks
 * the whole contract on the kits' scaled pack items, jogo and webcam-16x9-g); these tests pin the
 * mechanism itself.
 */

/** [size, the wider bleed that gives the scaled motifs room, scale]. */
const CASES: [string, number, number][] = [
  ['chat-padrao', 64, 2],
  ['cartao', 48, 1.5],
  ['webcam-16x9-g', 72, 1.5],
  ['jogo', 96, 2],
];

const inputOf = (set: string, id: string, extra: Record<string, unknown>) => {
  const size = getSize(id);
  const kind = size.kind as OrnamentKindName;
  return {kind, input: {...ORNAMENT_KINDS[kind].preset(`halloween-${set}`), ...sizeProps(size), ...extra}};
};

test('ornamentScale: o conjunto é posto na moldura reduzida por 1/s, e o que sai da caixa (× s) cabe no bleed', () => {
  for (const set of ORNAMENT_SET_IDS) {
    for (const [id, bleed, scale] of CASES) {
      const {kind, input} = inputOf(set, id, {bleed});
      const adapter = ORNAMENT_KINDS[kind];
      const where = `${set} ${id} ×${scale}`;
      const real = adapter.ornamentLayout(adapter.parse({...input, ornamentScale: 1}));
      const props = adapter.parse({...input, ornamentScale: scale});
      const layout = adapter.ornamentLayout(props);
      assert.equal(layout.scale, scale, where);
      assert.deepEqual(layout.frame, scaleOrnamentFrame(real.frame, 1 / scale), `${where}: moldura reduzida`);
      assert.deepEqual(layout.placements, ORNAMENT_REGISTRY[set].place(layout.frame, {ornamentSize: props.ornamentSize}), `${where}: lugares`);
      assert.ok(layout.placements.length > 0, `${where}: o principal cabe`);
      const outset = ornamentOutset(layout.frame, layout.placements) * scale;
      assert.ok(outset <= adapter.outset(props) + 1e-9, `${where}: o outset inclui os enfeites (${outset})`);
      assert.ok(adapter.outset(props) <= props.bleed + 1e-9, `${where}: tudo cabe no bleed`);
    }
  }
});

test('ornamentScale 1 dá exatamente o layout de antes (sem escala) e o mesmo markup', () => {
  for (const set of ORNAMENT_SET_IDS) {
    for (const [id] of CASES) {
      const {kind, input} = inputOf(set, id, {});
      const adapter = ORNAMENT_KINDS[kind];
      const props = adapter.parse(input);
      assert.equal(props.ornamentScale, 1, 'padrão 1');
      const layout = adapter.ornamentLayout(props);
      assert.deepEqual(Object.keys(layout).sort(), ['frame', 'placements'], `${set} ${id}: sem a chave scale`);
      assert.deepEqual(layout, adapter.ornamentLayout(adapter.parse({...input, ornamentScale: 1})));
      assert.doesNotMatch(adapter.render(props, 0), /data-ornaments="(back|front)" transform=/, `${set} ${id}: sem transform`);
    }
  }
});

test('ornamentScale: as camadas de enfeites são desenhadas dentro de um scale(s)', () => {
  for (const set of ORNAMENT_SET_IDS) {
    for (const [id, bleed, scale] of CASES) {
      const {kind, input} = inputOf(set, id, {bleed});
      const adapter = ORNAMENT_KINDS[kind];
      const props = adapter.parse({...input, ornamentScale: scale});
      const markup = adapter.render(props, 0);
      const layers = [...markup.matchAll(/data-ornaments="(back|front)"( transform="([^"]*)")?/g)];
      assert.ok(layers.some((layer) => layer[1] === 'front'), `${set} ${id}: camada da frente`);
      for (const layer of layers) assert.equal(layer[3], `scale(${scale})`, `${set} ${id} ${layer[1]}`);
    }
  }
});
