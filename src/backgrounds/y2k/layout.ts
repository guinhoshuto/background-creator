// The default Y2KLoop layout: the composite the owner approved on 2026-10-07 (mock 2,
// .cache/y2k-background/layout-r2.json), plus the flip phone and the bow approved as extras.
import {createSeededRandom} from '../../loop';
import {SPRITE_LOOP} from './sprites';

/** One sprite on the plate, in px of the 1920×1080 frame; the layout lists them in paint order. */
export type Y2KLayer = {
  asset: string;
  /** Centre of the square sprite. */
  x: number;
  y: number;
  /** Side of the square sprite. */
  size: number;
  /** Depth blur, CSS blur() in px (the mock's Gaussian sigma); 0 keeps it sharp. */
  blur: number;
  shadow: boolean;
  /** Frames added to the clock: offsets both the sprite's own cycle and the float. */
  phase: number;
  /** Float amplitude, px up and down. */
  floatPx: number;
  /** Whole float cycles per loop. */
  floatCycles: number;
};

/** [asset, size, centre x, centre y, blur, shadow], in paint order: far, blurred pieces first. */
const APPROVED: readonly (readonly [string, number, number, number, number, boolean])[] = [
  ['soap', 170, 1320, 470, 4, false],
  ['pixel-sparkle', 120, 1080, 300, 3, false],
  ['soap', 150, 850, 960, 4, false],
  ['gum', 230, 260, 250, 3, false],
  ['cassette', 520, 640, 200, 0, true],
  ['camcorder', 700, 1500, 290, 0, true],
  ['pouch', 640, 360, 760, 0, true],
  ['gum', 420, 1560, 850, 0, true],
  ['cursor', 330, 1150, 820, 0, true],
  ['soap', 270, 1010, 150, 0, false],
  ['soap', 230, 1830, 560, 0, false],
  ['soap', 200, 120, 470, 0, false],
  ['pixel-sparkle', 150, 760, 520, 0, true],
  ['pixel-sparkle', 120, 1780, 110, 0, true],
  ['pixel-sparkle', 130, 110, 990, 0, true],
  // The extras (YN-11, YN-12): the free bottom-right corner under the round soap, and the empty
  // floor between the pouch and the blurred soap; both clear of the calm middle, where the overlay sits.
  ['phone', 420, 1815, 860, 0, true],
  ['bow', 340, 600, 965, 0, true],
];

export const Y2K_LAYOUT_SEED = 2002;

/** The approved positions with a seeded float: phase, amplitude and whole cycles; never the clock or Math.random(). */
export const buildY2KLayout = (seed: number = Y2K_LAYOUT_SEED): Y2KLayer[] => {
  const random = createSeededRandom(seed);
  return APPROVED.map(([asset, size, x, y, blur, shadow]) => {
    // Three draws per layer, always: one layer's values never shift another's.
    const phase = Math.floor(random() * SPRITE_LOOP);
    const amplitude = random();
    const fast = random();
    const near = blur === 0;
    return {
      asset, x, y, size, blur, shadow, phase,
      // Near pieces bob more than the blurred ones far back; the big ones take the whole loop per bob.
      floatPx: Math.round(near ? 8 + amplitude * 10 : 4 + amplitude * 4),
      floatCycles: size >= 400 || fast < 0.5 ? 1 : 2,
    };
  });
};
