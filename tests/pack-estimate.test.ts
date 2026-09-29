import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {estimateFile, estimateText} from '../scripts/pack-estimate';
import {existingManifestFile, parsePackManifest, planPack, realPackDeps, type PlannedFile} from '../scripts/pack-plan';

const planned = (extra: Partial<PlannedFile> = {}): PlannedFile => ({
  composition: 'BorderLoop', kind: 'border', folder: 'borders', format: 'webm', props: {}, exportProps: {},
  output: 'out/packs/test/borders/test-fullscreen.webm', canvas: {width: 1920, height: 1080}, fps: 60, frames: 720, ...extra,
});

/** "~1.02 GiB" or "~540 MiB" in bytes; "~1 h 58 min", "~55 min" in minutes. */
const bytesOf = (text: string) => {
  const [, amount, unit] = /~([\d.]+) (MiB|GiB)/.exec(text)!;
  return Number(amount) * 1024 ** (unit === 'GiB' ? 3 : 2);
};
const minutesOf = (text: string) => {
  const [, hours, minutes] = /~(?:(\d+) h )?(\d+) min/.exec(text)!;
  return Number(hours ?? 0) * 60 + Number(minutes);
};

test('estimate: one file lands near the files measured on 2026-09-26', () => {
  // The plain full-screen borders, 1920×1080 and 720 frames, weighed 43.2 and 44.2 MB and took 299 and 331 s.
  const screen = estimateFile(planned())!;
  assert.ok(screen.bytes > 40e6 && screen.bytes < 50e6, `${screen.bytes} bytes`);
  assert.ok(screen.seconds > 250 && screen.seconds < 350, `${screen.seconds} s`);
  // A small label (368×112, 720 frames) still weighed 4.7 MB and took 47 s: a WebM costs something whatever its size.
  const label = estimateFile(planned({canvas: {width: 368, height: 112}}))!;
  assert.ok(label.bytes > 3e6 && label.bytes < 20e6, `${label.bytes} bytes`);
  assert.ok(label.seconds > 30 && label.seconds < 120, `${label.seconds} s`);
  // A PNG is one still, whatever the duration: the full-screen ones weighed 0.2 to 2 MB and took 1 to 2 s.
  const still = estimateFile(planned({format: 'png', frame: 0}))!;
  assert.ok(still.bytes > 0.1e6 && still.bytes < 2e6, `${still.bytes} bytes`);
  assert.ok(still.seconds > 0.5 && still.seconds < 10, `${still.seconds} s`);
  assert.equal(estimateFile(planned({format: 'mov'})), null);
});

test('estimate: the halloween-midnight kit comes to about the measured 1 GiB and 2 h, per variant', () => {
  const manifest = parsePackManifest(JSON.parse(readFileSync(existingManifestFile('halloween-midnight'), 'utf8')));
  const text = estimateText(planPack(manifest, realPackDeps));
  // halloween-noite, the same kit before the English names, weighed 1.006 GiB in 115 files; its 47 timed WebM took 98 min.
  const whole = /^ {2}whole plan: .*$/m.exec(text)![0];
  assert.ok(bytesOf(whole) > 0.85 * 1024 ** 3 && bytesOf(whole) < 1.3 * 1024 ** 3, text);
  assert.ok(minutesOf(whole) > 90 && minutesOf(whole) < 150, text);
  // One line per variant: with ornaments (no variant), plain, and the masks both share.
  for (const label of ['no variant', 'plain']) {
    const variant = new RegExp(`^ {2}${label}: (\\d+) files, (.*)$`, 'm').exec(text);
    assert.ok(variant, text);
    assert.ok(bytesOf(variant[2]!) > 0.35 * 1024 ** 3 && bytesOf(variant[2]!) < 0.7 * 1024 ** 3, variant[0]);
  }
  assert.match(text, /^ {2}masks: \d+ files, ~0\.\d MiB, under 1 min$/m);
});

test('estimate: existing files leave less to render, and a format never measured is named, not guessed', () => {
  const plan = [
    planned(),
    planned({output: 'out/packs/test/borders/test-fullscreen-plain.webm', variant: 'plain'}),
    planned({output: 'out/packs/test/borders/test-fullscreen.mov', format: 'mov'}),
  ];
  const text = estimateText(plan, new Set(['out/packs/test/borders/test-fullscreen.webm']));
  assert.match(text, /^ {2}whole plan: 2 files, ~\d+ MiB, ~10 min$/m);
  assert.match(text, /^ {2}left to render: 1 file, ~5 min \(1 already exists; --overwrite renders it again\)$/m);
  assert.match(text, /^ {2}not estimated: 1 mov file \(no measured render yet\)$/m);
});
