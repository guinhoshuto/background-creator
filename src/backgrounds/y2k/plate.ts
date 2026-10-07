// The Y2K plate and shadows in CSS, as in the approved mock (.cache/y2k-background/composite2.py):
// plain gradients and filters, no blend modes.

const round2 = (value: number) => Number(value.toFixed(2));

/** The mock's plate is a square gradient as wide as the frame's diagonal plus 4 px, turned and cropped. */
const plateSide = (width: number, height: number) => Math.floor(Math.hypot(width, height)) + 4;

/**
 * A CSS linear gradient through equally spaced stops, with the geometry of the mock's plate(): the
 * stops span that square, turned by `angle` degrees clockwise (0 runs top to bottom, -35 from the
 * top left to the bottom right). CSS spreads stops over its own gradient line, |W·sin a| + |H·cos a|
 * long, so each stop moves to where the square puts it.
 */
export const plateGradient = (width: number, height: number, stops: readonly string[], angle: number) => {
  const cssAngle = 180 + angle;
  const radians = (cssAngle * Math.PI) / 180;
  const line = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));
  const side = plateSide(width, height);
  const placed = stops.map((color, index) => {
    const offset = -side / 2 + (index * side) / (stops.length - 1);
    return `${color} ${round2(((line / 2 + offset) / line) * 100)}%`;
  });
  return `linear-gradient(${cssAngle}deg, ${placed.join(', ')})`;
};

/** The soft white bloom: `opacity` at its centre, gone at radius × height. Centre and radius are shares of the frame. */
export const bloomGradient = (width: number, height: number, bloom: {x: number; y: number; radius: number; opacity: number}) =>
  `radial-gradient(circle ${round2(bloom.radius * height)}px at ${round2(bloom.x * width)}px ${round2(bloom.y * height)}px, `
  + `rgba(255, 255, 255, ${bloom.opacity}) 0%, rgba(255, 255, 255, 0) 100%)`;

/** #RRGGBB plus an opacity, as CSS rgba(). */
export const rgba = (hex: string, opacity: number) => {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
};

/** The mock's shadow for a sprite `size` px wide: Gaussian sigma max(4, size/32), dropped max(6, size/26) px. */
export const shadowMetrics = (size: number) => ({
  sigma: Math.max(4, Math.floor(size / 32)),
  offset: Math.max(6, Math.floor(size / 26)),
});

/**
 * CSS drop-shadow() takes a blur radius, which Chrome draws like box-shadow, with a Gaussian of
 * sigma = radius / 2: the mock's sigma doubles here. A filter, not a blend mode.
 */
export const shadowFilter = (size: number, color: string, opacity: number) => {
  const {sigma, offset} = shadowMetrics(size);
  return `drop-shadow(0px ${offset}px ${2 * sigma}px ${rgba(color, opacity)})`;
};
