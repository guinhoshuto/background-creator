import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {ornamentReportText, ornamentRows} from '../scripts/ornament-rows';
import {parsePackManifest, realPackDeps} from '../scripts/pack-plan';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rowsOf = (pack: string) => ornamentRows(parsePackManifest(JSON.parse(readFileSync(path.join(ROOT, 'packs', `${pack}.json`), 'utf8'))), realPackDeps);

const HALLOWEEN_PACKS = ['halloween-midnight', 'halloween-haunted-mansion', 'halloween-haunted-interior', 'halloween-cobweb'] as const;

test('ornaments report: one row per file with ornaments, never the plain variant nor a mask', () => {
  for (const pack of HALLOWEEN_PACKS) {
    const rows = rowsOf(pack);
    // 5 chats + 10 blocks + 9 borders (no Twitch panel since 2026-10-06), each once whatever its formats.
    assert.equal(rows.length, 24, pack);
    assert.deepEqual(rows.filter((row) => row.name.endsWith('-plain') || row.name.startsWith('masks/')).map((row) => row.name), [], pack);
  }
});

test('ornaments report: every file places its hero, and no motif is larger than the room at its spot', () => {
  for (const pack of HALLOWEEN_PACKS) {
    for (const row of rowsOf(pack)) {
      assert.ok(row.motifs.length > 0, `${pack} ${row.name}: nothing placed`);
      for (const motif of row.motifs) {
        assert.ok(motif.extent > 0 && motif.extent <= motif.room, `${pack} ${row.name} ${motif.motif}: extent ${motif.extent} > room ${motif.room}`);
      }
    }
  }
});

test('ornaments report: the compact midnight chat, motif by motif', () => {
  const row = rowsOf('halloween-midnight').find((entry) => entry.name === 'chat/halloween-midnight-chat-compact')!;
  assert.deepEqual(row.canvas, {width: 424, height: 544});
  assert.deepEqual(row.box, {width: 360, height: 480});
  assert.deepEqual(row.motifs.map(({motif, slot, layer, extent, room}) => [motif, slot, layer, extent, room]), [
    ['moon', 'TR', 'back', 35, 35],
    ['bat', 'top', 'front', 22.5, 22.5],
    ['bat', 'top', 'front', 22, 22],
    ['pumpkin', 'BL', 'front', 28.5, 28.5],
    ['pumpkin-small', 'BL', 'front', 22, 24],
    ['pumpkin', 'BR', 'front', 25.5, 25.5],
  ]);
  // The standard chat (400×600) has room for stars along its sides; the compact one does not.
  assert.deepEqual(row.dropped, ['ember', 'star', 'star-small']);
});

test('ornaments report: drops are measured within one composition (a chat never misses a border motif)', () => {
  const rows = rowsOf('halloween-haunted-mansion');
  const chatMotifs = new Set(rows.filter((row) => row.composition === 'ChatLoop').flatMap((row) => row.motifs.map(({motif}) => motif)));
  for (const row of rows.filter((entry) => entry.composition === 'ChatLoop')) {
    for (const motif of row.dropped) assert.ok(chatMotifs.has(motif), `${row.name} drops ${motif}, which no chat places`);
  }
  // The border's gate is in some border of the pack, never in a chat.
  assert.ok(!chatMotifs.has('gate'));
});

test('ornaments report: with ornamentScale the sizes are the file\'s px', () => {
  const row = rowsOf('halloween-midnight').find((entry) => entry.name === 'borders/halloween-midnight-gameplay')!;
  assert.equal(row.ornamentScale, 2);
  assert.deepEqual(row.box, {width: 1440, height: 810});
  const moon = row.motifs.find(({motif}) => motif === 'moon')!;
  // 28.5 px in the set's own space, drawn twice as large.
  assert.equal(moon.extent, 57);
  assert.equal(moon.room, 57);
});

test('ornaments report: a pack without ornaments says so', () => {
  assert.deepEqual(rowsOf('glass'), []);
  assert.match(ornamentReportText('glass', []), /^glass: no file with ornaments/);
});

test('ornaments report: the text lists each file, its motifs and the totals', () => {
  const text = ornamentReportText('halloween-midnight', rowsOf('halloween-midnight'));
  assert.match(text, /^chat\/halloween-midnight-chat-compact {2}424×544 file, 360×480 box {2}midnight, ornamentSize 64, ornamentScale 1$/m);
  assert.match(text, /^ {2}TR {5}moon {11}back {6}63\.6 {6}35 {6}35$/m);
  assert.match(text, /^ {2}dropped here: ember, star, star-small$/m);
  assert.match(text, /^halloween-midnight: 24 files with ornaments, 232 motifs; 17 files drop a motif/m);
});

test('ornaments report CLI: an unknown pack is refused with the options', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ornaments-report.ts', 'no-such-pack'], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown pack: no-such-pack\. Options: .*halloween-midnight/);
});
