import assert from 'node:assert/strict';
import {test} from 'node:test';
import {compositedRgbError} from '../scripts/image-comparison';

const black = [0, 0, 0] as const;
const white = [255, 255, 255] as const;
const rgba = (...values: number[]) => Uint8Array.from(values);

test('hidden RGB does not affect the visible comparison', () => {
  assert.equal(compositedRgbError(rgba(255, 0, 0, 0), rgba(0, 255, 255, 0), white), 0);
});

test('partial alpha weights color error by its visible contribution', () => {
  const actual = rgba(110, 110, 110, 51);
  const expected = rgba(100, 100, 100, 51);
  assert(Math.abs(compositedRgbError(actual, expected, black) - 2) < 1e-10);
  assert(Math.abs(compositedRgbError(actual, expected, white) - 2) < 1e-10);
});

test('opaque errors remain unchanged and empty canvas cannot dilute them', () => {
  const actual = rgba(130, 130, 130, 255, 0, 0, 0, 0);
  const expected = rgba(100, 100, 100, 255, 0, 0, 0, 0);
  assert.equal(compositedRgbError(actual, expected, white), 30);
});

test('missing alpha and mismatched frame sizes are detected', () => {
  assert.equal(compositedRgbError(rgba(0, 0, 0, 255), rgba(0, 0, 0, 0), white), 255);
  assert.throws(() => compositedRgbError(rgba(0, 0, 0, 0), rgba(), black));
});
