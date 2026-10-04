import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {MANSION_BAT} from '../src/backgrounds/HauntedMansionLoop';
import {hauntedMansionSet} from '../src/overlays/shared/ornaments/sets/haunted-mansion';
import type {OrnamentFrame, OrnamentPlacement, OrnamentStyle} from '../src/overlays/shared/ornaments/types';
import {ornamentRows} from '../scripts/ornament-rows';
import {parsePackManifest, realPackDeps} from '../scripts/pack-plan';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = ornamentRows(parsePackManifest(JSON.parse(readFileSync(path.join(ROOT, 'packs', 'halloween-haunted-mansion.json'), 'utf8'))), realPackDeps);

test('haunted-mansion: every ornamented file of the kit has exactly one bat, and nothing else', () => {
  assert.equal(rows.length, 25);
  for (const row of rows) assert.deepEqual(row.motifs.map((motif) => motif.motif), ['bat'], row.name);
});

test('haunted-mansion: the bat reads at overlay sizes (at least 40 px of wingspan, 26 on the Twitch panel, 86 on gameplay)', () => {
  for (const row of rows) {
    const span = row.motifs[0]!.size;
    const least = row.name.includes('twitch-panel') ? 26 : row.name.endsWith('-gameplay') ? 86 : 40;
    assert.ok(span >= least, `${row.name}: wingspan ${span.toFixed(1)} px < ${least}`);
  }
});

test('haunted-mansion: the bat is the background\'s own, wings open at frame 0, lit by the moonlight colour', () => {
  const placement: OrnamentPlacement = {motif: 'bat', slot: 'TR', layer: 'front', x: 300, y: 20, extent: 40, size: 48};
  const style = {ornamentColors: ['#688789', '#D6DDC7', '#E8AF62'], durationSeconds: 16} as unknown as OrnamentStyle;
  for (const seed of [0, 1, 81, 4242]) {
    const [bat] = hauntedMansionSet.build({} as OrnamentFrame, [placement], {...style, seed}, 0, 480);
    assert.equal(bat!.type, 'haunted-mansion-bat');
    assert.ok((bat!.flap as number) >= 0.96, `seed ${seed}: flap ${bat!.flap} at frame 0`);
    assert.equal(bat!.bodyColor, MANSION_BAT.fill);
    assert.equal(bat!.rimColor, '#D6DDC7');
  }
});
