import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {VALIDATE_HELP_TEXT, parseValidateArgs} from '../scripts/validate-args';
import {fixtureProps, planFixtures, shippedPresetPairs, type FixtureAsset, type PresetPair} from '../scripts/validate-fixtures';

// What validate:exports would render, read without rendering: fake compositions, literal presets.

const root = fileURLToPath(new URL('../', import.meta.url));

/** A strict fake schema: known keys only, like `.strict()`. */
const fake = (id: string, kind: FixtureAsset['kind'], defaults: Record<string, unknown>): FixtureAsset => ({
  id, kind, defaultProps: defaults,
  parse: (props) => {
    for (const key of Object.keys(props)) if (!(key in defaults)) throw new Error(`Unrecognized key: "${key}"`);
    return props;
  },
});

const base = {durationSeconds: 8, seed: 1, transparent: false, backgroundColor: '#000000'};
const assets = [
  fake('FakeLoop', 'background', {...base, speed: 1}),
  fake('ChatLoop', 'chat', {...base, glow: 12}),
];
const pairs: PresetPair[] = [
  {composition: 'ChatLoop', preset: 'chat-test', props: {glow: 20, seed: 9}},
  {composition: 'FakeLoop', preset: 'fake-test', props: {speed: 3}},
];
const plan = (extra: Partial<Parameters<typeof planFixtures>[0]> = {}) =>
  planFixtures({assets, kinds: ['background', 'chat'], presets: false, pairs, ...extra});

test('--help names every option, --props and --presets included', () => {
  for (const option of ['--kind', '--composition', '--only', '--props', '--presets', '--duration', '--reuse-existing', '--out']) {
    assert.match(VALIDATE_HELP_TEXT, new RegExp(`^  ${option}\\b`, 'm'), option);
  }
  assert.equal(parseValidateArgs(['--help'], '/repo').values.help, true);
});

test('--props needs --composition and does not mix with --presets', () => {
  assert.throws(() => parseValidateArgs(['--props', 'a.json'], '/repo'), /--props needs --composition/);
  assert.throws(() => parseValidateArgs(['--props', 'a.json', '--composition', 'ChatLoop', '--presets'], '/repo'), /not both/);
  assert.throws(() => parseValidateArgs(['--props', ' ', '--composition', 'ChatLoop'], '/repo'), /Use --props <file.json>/);
  assert.equal(parseValidateArgs(['--props', 'p/a.json', '--composition', 'ChatLoop'], '/repo').propsFile, path.join('/repo', 'p', 'a.json'));
});

test('without --props or --presets the files keep their names and the defaults', () => {
  const fixtures = plan();
  assert(fixtures.every((fixture) => fixture.source.label === null));
  assert(fixtures.some((fixture) => fixture.file === 'FakeLoop-opaque.webm'));
  assert(fixtures.some((fixture) => /^ChatLoop-chat-[a-z-]+-alpha\.mov$/.test(fixture.file)));
});

test('--presets validates each shipped pair of the composition, named in the file, with the preset over the defaults', () => {
  const fixtures = plan({presets: true, composition: 'ChatLoop'});
  assert(fixtures.length > 0);
  assert(fixtures.every((fixture) => fixture.asset.id === 'ChatLoop' && fixture.source.label === 'chat-test'));
  assert(fixtures.every((fixture) => fixture.file.startsWith('ChatLoop-chat-test-')));
  const props = fixtureProps(fixtures[0]!, 0.4, () => ({width: 10}));
  // The preset sets glow and seed; the sample still decides duration, alpha and size.
  assert.equal(props.glow, 20);
  assert.equal(props.seed, 9);
  assert.equal(props.backgroundColor, '#18304C');
  assert.equal(props.durationSeconds, 0.4);
  assert.equal(props.transparent, fixtures[0]!.profile.transparent);
  assert.equal(props.width, 10);
});

test('the defaults keep the fixed seed and colour', () => {
  const props = fixtureProps(plan({composition: 'FakeLoop'})[0]!, 0.4, () => ({}));
  assert.equal(props.seed, 17);
  assert.equal(props.speed, 1);
});

test('--props replaces the defaults for its composition only', () => {
  const fixtures = plan({composition: 'FakeLoop', props: {label: 'mine', props: {speed: 5}}});
  assert(fixtures.length > 0 && fixtures.every((fixture) => fixture.asset.id === 'FakeLoop' && fixture.file.startsWith('FakeLoop-mine-')));
  assert.equal(fixtureProps(fixtures[0]!, 0.4, () => ({})).speed, 5);
});

test('refuses before rendering: a key the schema rejects, an unknown composition, presets that select nothing', () => {
  assert.throws(() => plan({composition: 'FakeLoop', props: {label: 'mine', props: {sped: 5}}}), /FakeLoop refuses mine: Unrecognized key: "sped"/);
  assert.throws(() => plan({presets: true, pairs: [{composition: 'ChatLoop', preset: 'bad', props: {nope: 1}}]}), /ChatLoop refuses bad/);
  assert.throws(() => plan({composition: 'Nope'}), /Unknown composition: Nope\. Options: FakeLoop, ChatLoop\./);
  assert.throws(() => plan({presets: true, only: 'no-such-file'}), /No pack ships a preset/);
});

test('the shipped pairs are every composition and preset in packs/, once each', () => {
  const expected = new Set<string>();
  for (const file of readdirSync(path.join(root, 'packs')).filter((name) => name.endsWith('.json'))) {
    const manifest = JSON.parse(readFileSync(path.join(root, 'packs', file), 'utf8')) as {items: {composition: string; preset?: string}[]};
    for (const item of manifest.items) if (item.preset) expected.add(`${item.composition}/${item.preset}`);
  }
  const shipped = shippedPresetPairs(root);
  assert.deepEqual(new Set(shipped.map((pair) => `${pair.composition}/${pair.preset}`)), expected);
  assert.equal(shipped.length, expected.size);
  const midnight = shipped.find((pair) => pair.preset === 'chat-halloween-midnight');
  assert.deepEqual(midnight?.props, JSON.parse(readFileSync(path.join(root, 'presets', 'chat-halloween-midnight.json'), 'utf8')));
});
