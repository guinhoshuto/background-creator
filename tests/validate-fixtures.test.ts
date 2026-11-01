import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {VALIDATE_HELP_TEXT, parseValidateArgs} from '../scripts/validate-args';
import {
  catalogFixtureAssets, fixtureProps, opaqueProfiles, planFixtures, profilesFor, shippedPresetPairs, type FixtureAsset, type PresetPair,
} from '../scripts/validate-fixtures';

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
/** A rendered frame sequence: it loops in whole 8 s passes and is an opaque scene, like WildfireSmokeLoop. */
const sequence: FixtureAsset = {
  id: 'SequenceLoop', kind: 'background', defaultProps: base,
  parse: (props) => {
    if (typeof props.durationSeconds !== 'number' || props.durationSeconds % 8 !== 0) throw new Error('durationSeconds: whole 8 s passes only');
    if (props.transparent === true) throw new Error('transparent: an opaque scene');
    return props;
  },
};
const plan = (extra: Partial<Parameters<typeof planFixtures>[0]> = {}) =>
  planFixtures({assets, kinds: ['background', 'chat'], presets: false, pairs, durationSeconds: 0.4, ...extra});

test('--help names every option, --props and --presets included', () => {
  for (const option of ['--kind', '--composition', '--only', '--props', '--presets', '--duration', '--reuse-existing', '--out']) {
    assert.match(VALIDATE_HELP_TEXT, new RegExp(`^  ${option}\\b`, 'm'), option);
  }
  assert.match(VALIDATE_HELP_TEXT, /refuses the sample length[\s\S]*sampled over its own duration/);
  assert.match(VALIDATE_HELP_TEXT, /refuses alpha[\s\S]*opaque in every format/);
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
  const props = fixtureProps(fixtures[0]!, () => ({width: 10}));
  // The preset sets glow and seed; the sample still decides duration, alpha and size.
  assert.equal(props.glow, 20);
  assert.equal(props.seed, 9);
  assert.equal(props.backgroundColor, '#18304C');
  assert.equal(props.durationSeconds, 0.4);
  assert.equal(props.transparent, fixtures[0]!.profile.transparent);
  assert.equal(props.width, 10);
});

test('the defaults keep the fixed seed and colour', () => {
  const props = fixtureProps(plan({composition: 'FakeLoop'})[0]!, () => ({}));
  assert.equal(props.seed, 17);
  assert.equal(props.speed, 1);
});

test('--props replaces the defaults for its composition only', () => {
  const fixtures = plan({composition: 'FakeLoop', props: {label: 'mine', props: {speed: 5}}});
  assert(fixtures.length > 0 && fixtures.every((fixture) => fixture.asset.id === 'FakeLoop' && fixture.file.startsWith('FakeLoop-mine-')));
  assert.equal(fixtureProps(fixtures[0]!, () => ({})).speed, 5);
});

test('a composition that refuses the sample length or alpha is sampled over its own duration, opaque in every format, and says so', () => {
  // The schema decides: a fixed-loop opaque sequence gets one opaque sample per format, as long as one pass.
  const fixtures = planFixtures({assets: [sequence], kinds: ['background'], presets: false, pairs: [], durationSeconds: 0.4});
  assert.deepEqual(fixtures.map((fixture) => fixture.file), ['SequenceLoop-opaque.mp4', 'SequenceLoop-opaque.webm', 'SequenceLoop-opaque.gif']);
  for (const fixture of fixtures) {
    assert.equal(fixture.durationSeconds, 8);
    assert.equal(fixture.profile.transparent, false);
    const props = fixtureProps(fixture, () => ({}));
    assert.equal(props.durationSeconds, 8);
    assert.equal(props.transparent, false);
    assert.doesNotThrow(() => sequence.parse(props), 'the sample is what the schema takes');
    assert.deepEqual(fixture.notes, [
      'SequenceLoop: sampled over 8 s, its own duration, not 0.4 s: durationSeconds: whole 8 s passes only',
      'SequenceLoop: sampled opaque in every format, with no alpha profile: transparent: an opaque scene',
    ]);
  }
  // A preset's own duration is the sample's, and the note names the preset.
  const preset = planFixtures({
    assets: [sequence], kinds: ['background'], presets: true, durationSeconds: 0.4,
    pairs: [{composition: 'SequenceLoop', preset: 'two-passes', props: {durationSeconds: 16}}],
  });
  assert.equal(preset.length, 3);
  assert(preset.every((fixture) => fixture.durationSeconds === 16 && fixtureProps(fixture, () => ({})).durationSeconds === 16));
  assert.match(preset[0]!.notes[0]!, /^SequenceLoop \(two-passes\): sampled over 16 s, its own duration, not 0\.4 s: /);
  // A --duration the schema takes is kept, and only alpha is noted.
  const whole = planFixtures({assets: [sequence], kinds: ['background'], presets: false, pairs: [], durationSeconds: 16});
  assert(whole.every((fixture) => fixture.durationSeconds === 16 && fixture.notes.length === 1 && /opaque/.test(fixture.notes[0]!)));
  // The others keep the sample and their profiles, alpha included, with nothing to say.
  const plain = plan({composition: 'FakeLoop'});
  assert.equal(plain.length, 4);
  assert(plain.every((fixture) => fixture.durationSeconds === 0.4 && fixture.notes.length === 0));
  assert(plain.some((fixture) => fixture.profile.transparent));
  // Opaque profiles: each format once, every overlay format included.
  assert.deepEqual(opaqueProfiles(profilesFor('background')).map((profile) => `${profile.format}:${profile.label}`), ['mp4:opaque', 'webm:opaque', 'gif:opaque']);
  assert.deepEqual(opaqueProfiles(profilesFor('chat')).map((profile) => profile.format), ['webm', 'mov', 'png', 'mp4']);
  assert(opaqueProfiles(profilesFor('chat')).every((profile) => !profile.transparent && profile.label === 'opaque'));
  // A composition that refuses the sample and has no duration of its own is refused, not guessed.
  const bare: FixtureAsset = {
    id: 'BareLoop', kind: 'background', defaultProps: {transparent: false},
    parse: (props) => {
      if ('durationSeconds' in props) throw new Error('durationSeconds: none');
      return props;
    },
  };
  assert.throws(
    () => planFixtures({assets: [bare], kinds: ['background'], presets: false, pairs: [], durationSeconds: 0.4}),
    /^Error: BareLoop refuses a 0\.4 s sample \(durationSeconds: none\) and has no duration of its own to sample over\.$/,
  );
});

test('the real catalog: an opaque scene is sampled opaque in every format, the other backgrounds with alpha too', () => {
  const real = planFixtures({assets: catalogFixtureAssets(), kinds: ['background'], presets: false, pairs: [], durationSeconds: 0.4});
  const of = (id: string) => real.filter((fixture) => fixture.asset.id === id);
  // TokyoFutureLoop refuses alpha only: the sample keeps its 0.4 s.
  assert.deepEqual(of('TokyoFutureLoop').map((fixture) => fixture.file), ['TokyoFutureLoop-opaque.mp4', 'TokyoFutureLoop-opaque.webm', 'TokyoFutureLoop-opaque.gif']);
  assert(of('TokyoFutureLoop').every((fixture) => fixture.durationSeconds === 0.4 && fixture.notes.length === 1 && /opaque/.test(fixture.notes[0]!)));
  assert.deepEqual(of('DotGridLoop').map((fixture) => fixture.file), ['DotGridLoop-flattened.mp4', 'DotGridLoop-opaque.webm', 'DotGridLoop-alpha.webm', 'DotGridLoop-flattened.gif']);
  assert(of('DotGridLoop').every((fixture) => fixture.durationSeconds === 0.4 && fixture.notes.length === 0));
  // A misspelt key is still named, on one line (zod puts no path on an unrecognized key).
  assert.throws(
    () => planFixtures({assets: catalogFixtureAssets(), kinds: ['background'], composition: 'DotGridLoop', props: {label: 'mine', props: {sped: 5}}, presets: false, pairs: [], durationSeconds: 0.4}),
    /^Error: DotGridLoop refuses mine: Unrecognized key: "sped"$/,
  );
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
