/** Compare visible colors after compositing; straight RGB is undefined at zero alpha. */
export const compositedRgbError = (
  actual: Uint8Array,
  expected: Uint8Array,
  background: readonly [number, number, number],
) => {
  if (actual.length !== expected.length || actual.length % 4 !== 0) {
    throw new Error('Os frames RGBA precisam ter o mesmo tamanho.');
  }
  let total = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i += 4) {
    const actualAlpha = actual[i + 3] / 255;
    const expectedAlpha = expected[i + 3] / 255;
    // Do not dilute errors in sparse shapes by counting the empty canvas.
    if (actualAlpha === 0 && expectedAlpha === 0) continue;
    for (let c = 0; c < 3; c++) {
      const actualColor = actual[i + c] * actualAlpha + background[c] * (1 - actualAlpha);
      const expectedColor = expected[i + c] * expectedAlpha + background[c] * (1 - expectedAlpha);
      total += Math.abs(actualColor - expectedColor);
      count++;
    }
  }
  return total / Math.max(1, count);
};
