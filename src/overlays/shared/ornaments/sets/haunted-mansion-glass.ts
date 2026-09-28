/**
 * The facade's two lit glass motifs of the HauntedMansionLoop background, as the 'haunted-mansion' set
 * draws them along a frame's top edge (placement in haunted-mansion-place.ts, drawing in haunted-mansion.tsx):
 *
 *   - the rose window of the central dormer (HauntedMansionArtwork: disc r25 in the roof colour
 *     with a 5-unit trim at 0.46, amber glass r20, a thin ring r30, four crossing bars (eight
 *     spokes) and a hub r7), scaled so its ring fills the room it is given;
 *   - a lancet: the background's arched window pane (MansionWindow: arch at 0.47 of the width,
 *     a centre mullion and a transom at 0.49 of the height) at a fixed 14×26 px, in a 2 px dark
 *     surround with a 1 px trim.
 *
 * Both glow like the background's windows: 0.72 + 0.14·sin(2φ + o) + 0.06·sin(5φ + o) at 16 s.
 */

/** The background's rose window, in its units (centre at 0, 0). */
export const ROSE = {
  disc: 25,
  trim: 5,
  trimOpacity: 0.46,
  glass: 20,
  ring: 30,
  ringStroke: 1.2,
  spoke: 3,
  hub: 7,
  colors: {roof: '#101A24', trim: '#536261'},
} as const;

/** The background's window glow: base + first·sin(2φ + o) + second·sin(5φ + o) (HauntedMansionLoop). */
export const WINDOW_FLICKER = {base: 0.72, first: 0.14, second: 0.06, harmonics: [2, 5], seconds: 16} as const;

/** Smallest widths of the rose's lines, in px (spokes stay ≥ 2 px, the ring ≥ 1 px). */
export const ROSE_FLOOR = {spoke: 2, ring: 1} as const;

/** The lit edge's shift towards the moon, in px (up and to the right; as every haunted-mansion lit edge). */
const LIT = Math.SQRT2;

/** The rose's line widths in its units at a scale (the background's, never under the px floors). */
export const roseStrokes = (scale: number) => ({
  spoke: Math.max(ROSE.spoke, ROSE_FLOOR.spoke / scale),
  ring: Math.max(ROSE.ringStroke, ROSE_FLOOR.ring / scale),
});

/** How far the rose's ink reaches from its centre at a scale, in px (the ring, or the lit disc edge). */
export const roseReach = (scale: number) =>
  Math.max((ROSE.ring + roseStrokes(scale).ring / 2) * scale, (ROSE.disc + ROSE.trim / 2) * scale + LIT);

/** The largest scale whose rose reaches no further than `extent` px (bisection: roseReach grows with the scale). */
export const roseScaleFor = (extent: number) => {
  let [lo, hi] = [0, extent];
  for (let iteration = 0; iteration < 50; iteration++) {
    const middle = (lo + hi) / 2;
    if (roseReach(middle) <= extent) lo = middle;
    else hi = middle;
  }
  return lo;
};

/** The lancet's pane, in px (fixed: never scales with the box). */
export const LANCET = {
  width: 14,
  height: 26,
  /** The dark surround around the pane. */
  surround: 2,
  /** The trim line on the pane's edge. */
  trim: 1,
  trimOpacity: 0.8,
  /** Mullion and transom (at 0.49 of the height). */
  mullion: 1.5,
  transom: 0.49,
  colors: {surround: '#101A24', trim: '#536261', mullion: '#101A24'},
} as const;

/** The background's arched pane (MansionWindow): origin at its top-left, arch at 0.47 of the width. */
export const lancetPanePath = (width: number, height: number) => {
  const arch = width * 0.47;
  return `M0 ${height}V${arch}Q0 ${arch * 0.3} ${width / 2} 0Q${width} ${arch * 0.3} ${width} ${arch}V${height}Z`;
};

/**
 * The lancet's enclosing circle, relative to the pane's top-left: through its apex and its two
 * bottom corners (the pane's farthest points), grown by the surround and its lit edge.
 */
export const LANCET_CIRCLE = (() => {
  const {width, height} = LANCET;
  // Centre on the axis at c below the apex: c² = (w/2)² + (h − c)².
  const c = ((width / 2) ** 2 + height ** 2) / (2 * height);
  return {x: width / 2, y: c, reach: c + LANCET.surround + LIT};
})();
