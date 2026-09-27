/** The shader experiments, in the order the Studio lists them. */
export const WEBGL_EXPERIMENTS = [
  'aurora', 'lava', 'silk', 'caustics', 'cells', 'contours', 'nebula',
  // The pastel series, after the gradient artworks of Framer's Filterable Gallery.
  'flow', 'orbital', 'neon', 'layers', 'haze', 'eclipse',
  // Pigment washes on paper, mixed subtractively like real watercolour.
  'watercolor',
  // Colour spots blended by inverse-distance weights, after Pixel Perfect's Mesh Gradient shader.
  'mesh',
] as const;

export type WebGLExperimentId = (typeof WEBGL_EXPERIMENTS)[number];
