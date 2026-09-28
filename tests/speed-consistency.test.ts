import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reportSpeed} from '../src/overlays/shared';
import {sizesForKind} from '../src/sizes';
import {SPEED_KINDS, SPEED_THEMES, SPEED_TOLERANCE, speedError, speedTable, type SpeedRow} from './helpers/speed-table';

/**
 * A pack sells one theme in every size, so the sizes must move as one family: every moving layer
 * of every theme preset stays within ±35% of the speed it asks for, on every named size of its
 * kind, at the preset's own duration.
 *
 * The only way past the tolerance is the loop's floor: a pattern that travels at all travels at
 * least one whole period per cycle, so a preset asking for less than that shows one period per
 * cycle. Such rows must be listed here, by preset, size and layer, with the reason; today none is.
 */
const DOCUMENTED_MINIMUMS: readonly string[] = [];

const rowId = (row: SpeedRow) => `${row.preset}/${row.size}/${row.layer}`;

const ROWS = speedTable();

test('Velocidade: cada camada que anda fica a ±35% da velocidade pedida, em todo tamanho de cada tema', () => {
  const outside = ROWS.filter((row) => Math.abs(speedError(row)) > SPEED_TOLERANCE + 1e-9);
  for (const row of outside) {
    assert.ok(row.atMinimum, `${rowId(row)}: ${row.requested} → ${reportSpeed(row.effective)} px/s sem estar no mínimo de um período por ciclo`);
  }
  // Exactly the documented minimums may be outside the tolerance, and they must still be there.
  assert.deepEqual(outside.map(rowId).sort(), [...DOCUMENTED_MINIMUMS].sort());
});

test('Velocidade: a tabela cobre todos os temas, tipos e tamanhos, e bate com o que o arquivo informa', () => {
  for (const kind of SPEED_KINDS) {
    for (const theme of SPEED_THEMES) {
      const rows = ROWS.filter((row) => row.preset === `${kind}-${theme}`);
      // Every theme moves something in every kind: a still preset would not need this test.
      assert.deepEqual([...new Set(rows.map((row) => row.size))], sizesForKind(kind).map((size) => size.id), `${kind}-${theme}`);
    }
  }
  // The sidecar, the export log and the pack manifest report the same speeds (one decimal).
  for (const row of ROWS) {
    if (row.reported === null) continue;
    assert.equal(row.reported, reportSpeed(row.effective), rowId(row));
  }
});

test('Velocidade: os casos que andavam várias vezes mais rápido nos tamanhos grandes agora seguem o pedido', () => {
  const at = (preset: string, size: string, layer: SpeedRow['layer']) =>
    ROWS.find((row) => row.preset === preset && row.size === size && row.layer === layer)!;
  // The neon comets asked 160 px/s and ran ~735 on fullscreen, ~362 on chat-column; the chat's
  // gradient asked 16 and ran ~414. Their periods are fixed px now (or a sway, for the gradient).
  for (const [preset, size, layer] of [
    ['border-neon', 'fullscreen', 'stroke'], ['border-neon', 'webcam-16x9', 'stroke'], ['chat-neon', 'chat-column', 'stroke'],
    ['chat-neon', 'chat-column', 'fill'], ['block-vidro', 'lower-third', 'stroke'], ['border-halloween', 'fullscreen-vertical', 'fill'],
  ] as const) {
    const row = at(preset, size, layer);
    assert.ok(Math.abs(speedError(row)) <= SPEED_TOLERANCE, `${rowId(row)}: ${reportSpeed(row.effective)} px/s`);
  }
  // The gradient's sway and the embers are exact; the glass sheens too unless they would merge.
  assert.equal(at('chat-neon', 'chat-column', 'fill').effective, 16);
  assert.equal(at('border-halloween', 'fullscreen-vertical', 'fill').effective, 40);
  assert.equal(at('chat-vidro', 'chat-vertical', 'fill').effective, 60);
});
