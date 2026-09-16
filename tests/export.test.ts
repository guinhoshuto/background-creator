import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveExport} from '../scripts/export';
import {baseBackgroundSchema} from '../src/settings';

test('the requested encoder format overrides saved preview props', () => {
  const result = resolveExport({compositionId: 'ParticleLoop', format: 'gif', props: {outputFormat: 'webm', transparent: true, durationSeconds: 2.25}});
  assert.equal(result.props.outputFormat, 'gif');
  assert.equal(result.props.durationSeconds, 2.25);
  assert.equal(result.preset.codec, 'gif');
  assert(result.output.endsWith('ParticleLoop.gif'));
  assert.deepEqual(result.inputProps, {durationSeconds: 2.25, transparent: true, outputFormat: 'gif'});
  assert.equal('seed' in result.inputProps, false, 'Do not mask saved Studio defaults with schema defaults');
});

test('invalid composition, unknown props, and mismatched extension fail before rendering', () => {
  assert.throws(() => resolveExport({compositionId: 'Unknown', format: 'mp4'}));
  assert.throws(() => resolveExport({compositionId: 'GradientLoop', format: 'mp4', props: {typo: 12}}));
  assert.throws(() => resolveExport({compositionId: 'GradientLoop', format: 'mp4', output: 'wrong.webm'}), /extensão/);
});

test('the flattening color cannot contain alpha', () => {
  for (const backgroundColor of ['transparent', '#ffffff00', 'rgba(255,0,0,0.5)', '#fff']) {
    assert.equal(baseBackgroundSchema.safeParse({backgroundColor}).success, false);
  }
  assert.equal(baseBackgroundSchema.safeParse({backgroundColor: '#AAbbCC'}).success, true);
});
