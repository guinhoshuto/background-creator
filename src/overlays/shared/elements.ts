/**
 * The primitives a scene is made of. Every element is a flat plain object tagged by `type`, with
 * numbers for everything that moves (so the shared seam scan covers it), colour strings, and an
 * `opacity` in [0, 1]. No key named `radius*` is ever 0 (the scans require it positive): square
 * corners use `corner`. Positions are canvas pixels; `s` is arc length along a track (see
 * perimeter.ts), and `track` indexes the tracks handed to the renderer (0 = the layout's track).
 *
 * A kind adds its own element types the same way: a new `type` string, flat fields, an opacity,
 * listed by place; it renders them itself and falls back to `renderOverlayElement` for these.
 */

/** A plain area of colour: the fill's base, clipped to the panel by its layer. */
export type RectElement = {
  type: 'rect'; x: number; y: number; width: number; height: number; corner: number; color: string; opacity: number;
};

/**
 * A linear gradient repeating along (x1, y1) → (x2, y2), one period of `colorCount` colours
 * returning to the first, painted over the area x/y/width/height. The vector slides by place: it
 * wraps by one whole period, which leaves the picture unchanged.
 */
export type GradientElement = {
  type: 'gradient'; x: number; y: number; width: number; height: number;
  x1: number; y1: number; x2: number; y2: number;
  color0: string; color1: string; color2: string; colorCount: number; opacity: number;
};

/** A solid disc (dot grid). */
export type DotElement = {type: 'dot'; x: number; y: number; radius: number; color: string; opacity: number};

/** A soft glowing disc with a bright core (sparkles, bokeh, embers). */
export type SparkElement = {type: 'spark'; x: number; y: number; radius: number; color: string; opacity: number};

/**
 * A straight band (a stripe), `width` across and `length` along, centred on (cx, cy), whose
 * across direction is the unit vector (nx, ny). Kept as a vector, never an angle.
 */
export type BandElement = {
  type: 'band'; cx: number; cy: number; nx: number; ny: number; width: number; length: number; color: string; opacity: number;
};

/** Like a band, with soft edges fading out across its width (a glass sheen). */
export type SheenElement = {
  type: 'sheen'; cx: number; cy: number; nx: number; ny: number; width: number; length: number; color: string; opacity: number;
};

/**
 * A veil over the area, `color` at `opacity` along its top edge fading to nothing at its bottom
 * edge: light falling from above. It never moves.
 */
export type ShadeElement = {
  type: 'shade'; x: number; y: number; width: number; height: number; color: string; opacity: number;
};

/**
 * A fog bank ('fog'): a soft ellipse `width` × `height` centred on (cx, cy), `color` at
 * `opacity` in the middle fading out to nothing at its rim, with a smaller, lighter core in
 * `coreColor` at `coreOpacity` just above its centre (the moonlit top of the bank). Radial
 * gradients only, no blur filter. The core's box is a fixed share of the bank's (see the
 * renderer), inside it, so the bank's reach is its own half width and half height.
 */
export type FogElement = {
  type: 'fog'; cx: number; cy: number; width: number; height: number; color: string; opacity: number;
  coreColor: string; coreOpacity: number;
};

/**
 * A damask wallpaper ('damask') over the area x/y/width/height: one SVG pattern whose tile is
 * `tileWidth` × `tileHeight` px (a half-drop lattice of the interior's DAMASK motif), inked in
 * `color` over `baseColor` ('none' with one colour) inside the tile, the whole area drawn at
 * `opacity` so ink and ground have the same alpha; its lattice shifted by (offsetX, offsetY) px
 * from the area's corner. The offsets wrap by one tile, which leaves the picture unchanged.
 */
export type DamaskElement = {
  type: 'damask'; x: number; y: number; width: number; height: number; tileWidth: number; tileHeight: number;
  offsetX: number; offsetY: number; color: string; baseColor: string; opacity: number;
};

/**
 * A `lineWidth` px line along a rounded rect (x, y, width, height, corner), at `opacity` down to
 * `hold` px below its top and fading out `fade` px further down the sides: a glass edge catching
 * the light. On a rounded rect it holds over the top corners' curve; on a circle it holds nowhere
 * (hold 0), so only the top arc is lit, brightest at the top. Static.
 */
export type RimElement = {
  type: 'rim'; x: number; y: number; width: number; height: number; corner: number; lineWidth: number; hold: number; fade: number;
  color: string; opacity: number;
};

/**
 * A band along a circle (an accent following the inside of a round panel): between radii
 * `outer - width` and `outer` around (cx, cy), `spread` radians to each side of the unit
 * direction (nx, ny). Static, so the angle never needs to wrap.
 */
export type ArcElement = {
  type: 'arc'; cx: number; cy: number; outer: number; width: number; nx: number; ny: number; spread: number;
  color: string; opacity: number;
};

/** The whole closed track stroked. */
export type OutlineElement = {type: 'outline'; track: number; width: number; color: string; opacity: number};

/** A piece of the track from `s` to `s + length` (butt ends); `s` may run past P, it wraps. */
export type DashElement = {
  type: 'dash'; track: number; s: number; length: number; width: number; color: string; opacity: number;
};

/**
 * A piece of a colour flow along the track; `mix` is where its colour sits in the palette's
 * period, in [0, 1). Neighbouring segments overlap by a fraction of a pixel to hide seams.
 */
export type SegmentElement = {
  type: 'segment'; track: number; s: number; length: number; width: number; mix: number; color: string; opacity: number;
};

/** A comet: its head at `s`, a tail `tail` px long behind it that fades and thins out. */
export type CometElement = {
  type: 'comet'; track: number; s: number; tail: number; width: number; color: string; opacity: number;
};

/**
 * The glow of a layer: the layer blurred with σ = `blur`, in straight alpha, its alpha multiplied
 * by `gain` (see GlowFilter), drawn under the sharp layer at `opacity`. σ and the gain never
 * change (the outset stays fixed); only the opacity pulses.
 */
export type GlowElement = {type: 'glow'; blur: number; gain: number; opacity: number};

/** An outer glow around a panel shape, in `color`, kept outside the panel (see HaloLayer). */
export type HaloElement = {type: 'halo'; blur: number; color: string; opacity: number};

export type FillElement =
  | RectElement | GradientElement | DotElement | SparkElement | BandElement | SheenElement | ShadeElement | ArcElement
  | FogElement | DamaskElement;
export type StrokeElement = OutlineElement | DashElement | SegmentElement | CometElement;
export type OverlayElement = FillElement | StrokeElement | GlowElement | HaloElement | RimElement;
