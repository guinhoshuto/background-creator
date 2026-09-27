import type {z} from 'zod';
import {createSeededRandom, randomBetween, TAU} from '../../loop';
import type {OutputFormat} from '../../settings';
import type {Rect} from './box';
import type {
  BandElement, DamaskElement, DotElement, FillElement, FogElement, GradientElement, RectElement, ShadeElement, SheenElement,
  SparkElement,
} from './elements';
import type {FillStyleName} from './fields';
import {cycleOf, fract, framesOf, MAX_FRAME_SHARE, placeTravel, refineTravel} from './motion';
import {lapsFor} from './perimeter';

/** The fill props (see `fillFields`) plus the loop's own. */
export type FillStyle = {
  fill: FillStyleName;
  fillColors: readonly string[];
  fillOpacity: number;
  fillScale: number;
  fillSpeed: number;
  fillAngle: number;
  fillRise: boolean;
  /** Opacity of the white veil along the top (see ShadeElement); 0 or absent draws none. */
  fillLight?: number;
  seed: number;
  durationSeconds: number;
};

/** Knobs a kind may tune; the defaults are the engine's look. */
export type FillOptions = {
  /** Corner radius of the base rect; the layer's clip draws the real shape anyway. */
  corner?: number;
  /** Dot diameter as a share of the spacing ('pontos'). */
  dotRatio?: number;
  /** Radius of the small closed orbits of the sparkles, in px ('brilhos'); 0 keeps them still. */
  sparkOrbit?: number;
  /** Peak opacity of the glass sheen ('vidro'). */
  sheenOpacity?: number;
  /** Width of the glass sheen band, in px ('vidro'). */
  sheenWidth?: number;
  /** Most sparkles one fill may list, however large the box. */
  maxSparks?: number;
  /**
   * 'brilhos' without fillRise: keeps only the sparkles whose soft disc, `reach` px around their
   * resting place, can touch what the layer's clip shows. A frame's band is a thin ring around a
   * large bounding box, so most of a grid over that box would be clipped away. Decided by place,
   * never by frame, so every frame lists the same sparkles.
   */
  keepSpark?: (x: number, y: number, reach: number) => boolean;
  /** Decorrelates two fills of one scene that share the seed. */
  seedOffset?: number;
};

const RADIAN = Math.PI / 180;

/** Unit direction of the motion on screen (y down): 0° right, 90° down. */
export const fillDirection = (angle: number) => ({x: Math.cos(angle * RADIAN), y: Math.sin(angle * RADIAN)});

/** The dot grid only closes a cycle along an axis or a diagonal: the nearest of the eight. */
export const dotDirection = (angle: number) => {
  const snapped = Math.round(angle / 45) * 45 * RADIAN;
  return {x: Math.round(Math.cos(snapped)), y: Math.round(Math.sin(snapped))};
};

/** How far the area reaches along the unit vector `u`, edge to edge. */
const extentAlong = (area: Rect, u: {x: number; y: number}) => Math.abs(area.width * u.x) + Math.abs(area.height * u.y);

const centreOf = (area: Rect) => ({x: area.x + area.width / 2, y: area.y + area.height / 2});

/** With one colour the pattern stands alone; with more, the first is the base under it. */
const splitColors = (colors: readonly string[]) => ({
  base: colors.length > 1 ? colors[0]! : null,
  pattern: colors.length > 1 ? colors.slice(1) : [colors[0]!],
});

/** Width of the glass sheen band. */
const sheenWidthOf = (area: Rect, options: FillOptions) =>
  options.sheenWidth ?? Math.max(24, Math.min(480, 0.3 * Math.min(area.width, area.height)));

/** Radius of the sparkles' small closed orbits ('brilhos' in place). */
const sparkOrbitOf = (style: Pick<FillStyle, 'fillScale'>, options: FillOptions) => options.sparkOrbit ?? 0.15 * style.fillScale;

/** Largest sparkle core, and how far past the area the embers start and end (their whole soft disc). */
const sparkMaxRadius = (style: Pick<FillStyle, 'fillScale'>) => 0.2 * style.fillScale;
const emberMargin = (style: Pick<FillStyle, 'fillScale'>) => 2.5 * sparkMaxRadius(style) + 2;

/** Glass sheens never come closer than this many sheen widths, centre to centre. */
const SHEEN_MIN_SPACING = 2;

/**
 * 'nevoa': the shape of a fog bank, as shares of its height H = fillScale (px). Banks are 5.8 H
 * wide (the mansion's banks, 1390 × 240), one spacing S = 2.25 H apart in each of two rows, so a
 * row overlaps itself about 2.6 times over and reads as one rolling band, not a string of blobs.
 * The core is a lighter ellipse, `coreWidth` × `coreHeight` of the bank, `coreRise` H above its
 * centre. Gradient stops are [offset, share of the peak opacity], linear in between (as SVG
 * draws them), shared by the renderer and the legibility test.
 */
export const FOG_SHAPE = {
  width: 5.8,
  spacing: 2.25,
  coreWidth: 0.5,
  coreHeight: 0.5,
  coreRise: 0.12,
  bodyStops: [[0, 1], [0.4, 0.72], [0.75, 0.26], [1, 0]] as const,
  coreStops: [[0, 1], [0.5, 0.42], [1, 0]] as const,
};

/**
 * Legibility cap of 'nevoa' (text sits on the fill): wherever banks pile up, the body colour
 * (fillColors[1]) covers at most FOG_BODY_CAP and the light core (fillColors[2]) at most
 * FOG_CORE_CAP of the pixel, composited over the base. On the mansão kit (#688789 and #D6DDC7
 * over #0E1520) the worst pixel is then no lighter than #39474B over dark footage (or at
 * fillOpacity 1 over any footage): cream text keeps ≥ 6.9:1, white ≥ 9.6:1 and amber
 * #E8AF62 ≥ 4.9:1. Below fillOpacity 1 the footage shows through the base: com fillOpacity 0,9
 * sobre imagem branca o âmbar cai para 4,3:1 (pixel #445055); use fillOpacity ≥ 0,95 para
 * manter o âmbar ≥ 4,7:1 e o creme ≥ 6,5:1. The per-bank peaks below are those caps divided by
 * the worst pile-up of the two rows (measured over positions, phases and swings, with margin:
 * the worst body seen in a scan of 400 seeds, 3 speeds and 6 frames is ≈ 0.275; the core has no
 * pile-up at its own peak, so it stays ≤ 0.095); tests/overlay-engine.test.ts checks the
 * composite pixel by pixel.
 */
export const FOG_BODY_CAP = 0.3;
export const FOG_CORE_CAP = 0.1;
const FOG_BODY_PEAK = 0.22;
const FOG_CORE_PEAK = 0.095;

/**
 * The two rows of banks, bottom one last (in front): how far above the area's bottom edge each
 * row's centre sits (in H), its size and opacity, and its stagger (in S). Same spacing, same
 * speed: no parallax, so the fill has one speed to report.
 */
const FOG_ROWS = [
  {rise: 1.2, scale: 0.85, opacity: 0.85, stagger: 0.5},
  {rise: 0.45, scale: 1, opacity: 1, stagger: 0},
] as const;

/**
 * Swings of each bank, as functions of where the bank is now (never of its index, so when the
 * places wrap by one spacing the picture is unchanged): sums of sines along x with wavelengths
 * that are not multiples of S (so neighbours differ). Each wave drifts the fog's way by
 * round(drift·laps/length) whole wavelengths per cycle (so it loops); wavelengths are in S. With
 * few laps that rounds to 0 and the wave stays in place: the banks roll through thick and thin
 * zones pinned to the panel. At laps 1 only the core wave moves; at laps 2 the first size wave,
 * the rise and the core, not the opacity; from laps 3 the opacity wave drifts too (at ≈ 0.97 of
 * the fog's speed; the long size wave waits for laps 4). So for thick and thin zones that roll
 * with the fog, pick laps ≥ 3. The opacity swings widely, so the fog thickens and thins along
 * the band instead of lying as a haze.
 */
const FOG_WAVES = {
  size: [{length: 1.7, drift: 0.8, amount: 0.12}, {length: 4.3, drift: 0.6, amount: 0.06}],
  opacity: [{length: 2.9, drift: 0.7, amount: 0.3}],
  rise: [{length: 2.3, drift: 0.9, amount: 0.18}],
  core: [{length: 1.3, drift: 0.8, amount: 0.45}],
} as const;
/** The largest bank size factor (1 plus every size swing): a bank's soft reach is 5.8·H·this/2. */
export const FOG_MAX_SIZE = 1 + FOG_WAVES.size.reduce((sum, wave) => sum + wave.amount, 0);

/** The spacing of the fog banks, in px: the period of the fog's drift. */
export const fogSpacing = (style: Pick<FillStyle, 'fillScale'>) => FOG_SHAPE.spacing * style.fillScale;

/** The fog drifts sideways only: right when fillAngle points right of vertical (cos ≥ 0), else left. */
export const fogDirection = (angle: number) => (Math.cos(angle * RADIAN) >= 0 ? 1 : -1);

/** 'damasco': the tile is fillScale px wide and 1.5 times as tall (the background's 90.3 × 135.5). */
export const DAMASK_TILE_RATIO = 1.5;

/** The damask lattice's step along the snapped direction d, in px (one tile per axis). */
const damaskPeriod = (style: Pick<FillStyle, 'fillScale' | 'fillAngle'>) => {
  const {x, y} = dotDirection(style.fillAngle);
  return Math.hypot(x * style.fillScale, y * style.fillScale * DAMASK_TILE_RATIO);
};

/**
 * How a fill moves in one cycle: its period along the motion, the whole periods per cycle, the
 * look-alike pieces per period (for the aliasing rule), the speed actually shown (px/s) and, for
 * a pattern that sways instead of travelling, the amplitude of the sway (px). Fills that do not
 * move report zero laps and zero sway.
 *
 * Every speed is kept independent of the area, so one preset moves alike on a 320×64 label and a
 * 1920×1080 screen: dots and stripes travel whole periods of fixed px (fillScale); the gradient,
 * whose period is as wide as the area, sways by a fixed number of px instead of travelling a
 * whole period; sheens and embers are spaced by how far they go in a cycle at the asked speed.
 */
export const getFillMotion = (style: FillStyle, area: Rect, options: FillOptions = {}) => {
  const {pattern} = splitColors(style.fillColors);
  const still = {period: 1, laps: 0, unitsPerPeriod: 1, speed: 0, sway: 0};
  const measure = (period: number, unitsPerPeriod = 1) => {
    const laps = lapsFor(style.fillSpeed, style.durationSeconds, period);
    return {period, laps, unitsPerPeriod, speed: (laps * period) / style.durationSeconds, sway: 0};
  };
  const travel = style.fillSpeed * style.durationSeconds;
  switch (style.fill) {
    case 'gradiente': {
      if (style.fillColors.length < 2) return still;
      // One period holds every colour once, each about as wide as the area: the area shows a
      // single blend at a time instead of a squeezed rainbow. Travelling a whole period per cycle
      // would be that fast on a big panel, so the gradient sways once per cycle instead: a sine of
      // amplitude A covers 4A per cycle, exactly fillSpeed on average.
      const period = extentAlong(area, fillDirection(style.fillAngle)) * style.fillColors.length;
      return {period, laps: 0, unitsPerPeriod: 1, speed: style.fillSpeed, sway: travel / 4};
    }
    case 'pontos': {
      const {x, y} = dotDirection(style.fillAngle);
      return measure(style.fillScale * Math.hypot(x, y));
    }
    case 'listras':
      return measure(style.fillScale * pattern.length, pattern.length);
    case 'vidro': {
      // Sheens follow each other as far apart as they go in one cycle, so each place sees one
      // pass per cycle at the asked speed; closer than two widths they would merge, so a speed
      // too slow for that keeps the spacing and goes a little faster.
      if (!(travel > 0)) return still;
      const spacing = Math.max(travel, SHEEN_MIN_SPACING * sheenWidthOf(area, options));
      return {period: spacing, laps: 1, unitsPerPeriod: 1, speed: spacing / style.durationSeconds, sway: 0};
    }
    case 'nevoa':
      // The banks drift one spacing S per lap, both rows alike (see fogFill).
      return measure(fogSpacing(style));
    case 'damasco': {
      // Like the dots: along an axis or a diagonal, one tile per axis per lap. Moving down (or on
      // a diagonal) the half-drop motif half a period on looks like the next one: two look-alike
      // steps per period for the aliasing rule.
      const {y} = dotDirection(style.fillAngle);
      return measure(damaskPeriod(style), y === 0 ? 1 : 2);
    }
    case 'brilhos': {
      // Each ember rises at exactly fillSpeed × its seeded pace (0.7–1.3, so fillSpeed on
      // average), a whole number of lives per cycle (see sparkFill); the period is how far the
      // average ember rises in one cycle. In place, each sparkle circles its orbit, one period
      // per turn.
      if (style.fillRise) return travel > 0 ? {period: travel, laps: 1, unitsPerPeriod: 1, speed: style.fillSpeed, sway: 0} : still;
      const orbit = sparkOrbitOf(style, options);
      return orbit > 0 ? measure(TAU * orbit) : still;
    }
    default:
      return still;
  }
};

export type FillMotion = ReturnType<typeof getFillMotion>;

/** pt-BR: what the aliasing refusal calls each travelling fill. */
const FILL_SUBJECTS: Partial<Record<FillStyleName, string>> = {
  pontos: 'os pontos', listras: 'as listras', brilhos: 'os brilhos', nevoa: 'a névoa', damasco: 'o damasco',
};

/**
 * The swaying gradient's share of its period covered in one frame at its fastest (the middle of
 * the sway, where a sine of amplitude A moves 2πA per cycle), and the highest fillSpeed that
 * stays within MAX_FRAME_SHARE. Only a tiny box at a high speed gets near it.
 */
export const swayShare = (motion: Pick<FillMotion, 'period' | 'sway'>, durationInFrames: number) =>
  (TAU * motion.sway) / durationInFrames / motion.period;

const maxSwaySpeed = (period: number, durationSeconds: number, durationInFrames: number) => {
  const limit = (4 * MAX_FRAME_SHARE * period * durationInFrames) / (TAU * durationSeconds);
  return Math.floor(limit + 1e-9);
};

/**
 * Refuses a fill that would alias (see refineTravel): the dots, the damask (a lattice like the
 * dots), the stripes, the sparkles' orbits, which are periodic too (past about half a turn per
 * frame a sparkle seems to crawl or turn backwards), and the gradient at the fastest point of its
 * sway. Exempt: the embers (each fading out before it wraps), the glass sheens (soft bands at
 * least two widths apart, moving one spacing per cycle) and the fog: its banks overlap about 2.6
 * times over into one soft band whose ripple is faint, they wrap only wholly outside the area, and
 * every bank's size, height and opacity follow its place, so the wrap by one spacing leaves the
 * picture unchanged; there is no crisp lattice for the eye to pair up the wrong way.
 */
export const refineFill = (
  props: FillStyle & {outputFormat: OutputFormat}, area: Rect, context: z.RefinementCtx, options: FillOptions = {},
) => {
  const orbiting = props.fill === 'brilhos' && !props.fillRise;
  if (!['pontos', 'damasco', 'listras', 'gradiente'].includes(props.fill) && !orbiting) return;
  const durationInFrames = framesOf(props);
  if (durationInFrames === null) return;
  const motion = getFillMotion(props, area, options);
  if (props.fill === 'gradiente') {
    const share = swayShare(motion, durationInFrames);
    if (!(motion.sway > 0) || share <= MAX_FRAME_SHARE + 1e-12) return;
    context.addIssue({
      code: 'custom',
      path: ['fillSpeed'],
      message: `Velocidade alta demais para o gradiente: a cada frame ele andaria ${Math.round(share * 100)}% do caminho até a repetição seguinte e pareceria ir para trás ou piscar. Use fillSpeed até ${maxSwaySpeed(motion.period, props.durationSeconds, durationInFrames)} px/s ou aumente a caixa.`,
    });
    return;
  }
  refineTravel({
    laps: motion.laps,
    period: motion.period,
    unitsPerPeriod: motion.unitsPerPeriod,
    durationSeconds: props.durationSeconds,
    durationInFrames,
    field: 'fillSpeed',
    subject: FILL_SUBJECTS[props.fill] ?? 'o padrão',
    otherFix: 'aumente fillScale',
  }, context);
};

const baseRect = (area: Rect, color: string, opacity: number, options: FillOptions): RectElement => ({
  type: 'rect', x: area.x, y: area.y, width: area.width, height: area.height,
  corner: options.corner ?? 0, color, opacity,
});

const gradientFill = (style: FillStyle, area: Rect, cycle: number, random: () => number, options: FillOptions): FillElement[] => {
  const colors = style.fillColors;
  if (colors.length < 2) return [baseRect(area, colors[0]!, style.fillOpacity, options)];
  const u = fillDirection(style.fillAngle);
  const {period, sway} = getFillMotion(style, area, options);
  const rest = randomBetween(random, 0.2, 0.8);
  const swayPhase = random() * TAU;
  const centre = centreOf(area);
  // The vector sways along u around a seeded rest, once per cycle: a sine is smooth through the
  // seam. The repeat looks the same a whole period further, so a wide sway needs no wrapping.
  const start = (rest - 0.5) * period + sway * Math.sin(cycle * TAU + swayPhase);
  const element: GradientElement = {
    type: 'gradient', x: area.x, y: area.y, width: area.width, height: area.height,
    x1: centre.x + u.x * start, y1: centre.y + u.y * start,
    x2: centre.x + u.x * (start + period), y2: centre.y + u.y * (start + period),
    color0: colors[0]!, color1: colors[1]!, color2: colors[2] ?? colors[0]!, colorCount: colors.length,
    opacity: style.fillOpacity,
  };
  return [element];
};

/**
 * A dot grid scrolling inside the area, listed by place like DotGridLoop: the shift wraps inside
 * one cell, so when a dot has moved a whole cell its neighbour takes its place.
 */
const dotFill = (style: FillStyle, area: Rect, cycle: number, random: () => number, options: FillOptions): FillElement[] => {
  const {base, pattern} = splitColors(style.fillColors);
  const direction = dotDirection(style.fillAngle);
  const {laps} = getFillMotion(style, area, options);
  const spacing = style.fillScale;
  const shiftX = placeTravel(randomBetween(random, 0.2, 0.8), laps * direction.x, cycle).offset * spacing;
  const shiftY = placeTravel(randomBetween(random, 0.2, 0.8), laps * direction.y, cycle).offset * spacing;
  const radius = Math.max(0.5, (spacing * (options.dotRatio ?? 0.25)) / 2);
  // One place before the area on each axis, and enough after it for any shift.
  const columns = Math.ceil((area.width + radius) / spacing) + 2;
  const rows = Math.ceil((area.height + radius) / spacing) + 2;
  const dots = Array.from({length: rows * columns}, (_, index): DotElement => ({
    type: 'dot',
    x: area.x + shiftX + ((index % columns) - 1) * spacing,
    y: area.y + shiftY + (Math.floor(index / columns) - 1) * spacing,
    radius,
    color: pattern[0]!,
    opacity: style.fillOpacity,
  }));
  return [...(base ? [baseRect(area, base, style.fillOpacity, options)] : []), ...dots];
};

/**
 * Stripes across the motion, scrolling along it, listed by place. With two pattern colours they
 * alternate, so the pattern repeats every two stripes and the places wrap by that much: every
 * place keeps its colour.
 */
const stripeFill = (style: FillStyle, area: Rect, cycle: number, random: () => number, options: FillOptions): FillElement[] => {
  const {base, pattern} = splitColors(style.fillColors);
  const u = fillDirection(style.fillAngle);
  const across = {x: -u.y, y: u.x};
  const pitch = style.fillScale;
  const {period, laps} = getFillMotion(style, area, options);
  const {offset} = placeTravel(randomBetween(random, 0.2, 0.8), laps, cycle);
  const centre = centreOf(area);
  const extent = extentAlong(area, u);
  const length = extentAlong(area, across) + 2 * pitch;
  // From one whole period before the area to a quarter pitch past it, for any offset.
  const count = Math.ceil((extent + period + pitch / 4) / pitch) + 1;
  const stripes = Array.from({length: count}, (_, index): BandElement => {
    const along = -extent / 2 - period + index * pitch + offset * period;
    return {
      type: 'band', cx: centre.x + u.x * along, cy: centre.y + u.y * along, nx: u.x, ny: u.y,
      width: pitch / 2, length, color: pattern[index % pattern.length]!, opacity: style.fillOpacity,
    };
  });
  return [...(base ? [baseRect(area, base, style.fillOpacity, options)] : []), ...stripes];
};

/**
 * Sparkles at seeded places, one per cell of a jittered grid so they never clump, each twinkling
 * a whole number of times per cycle and circling a small closed orbit. With `fillRise` they are
 * embers instead: each rises for a whole number of lives per cycle, fading in and out, so it drops
 * back at opacity 0, and wraps from above the area to below it out of sight. Their phases are
 * stratified (one per slice of the cycle, 20–80% into it), so no drop ever falls on the seam.
 */
const sparkFill = (style: FillStyle, area: Rect, cycle: number, random: () => number, options: FillOptions): FillElement[] => {
  const {base, pattern} = splitColors(style.fillColors);
  const phase = cycle * TAU;
  const cell = 2 * style.fillScale;
  let columns = Math.max(1, Math.round(area.width / cell));
  let rows = Math.max(1, Math.round(area.height / cell));
  const maxSparks = options.maxSparks ?? 400;
  if (columns * rows > maxSparks) {
    const shrink = Math.sqrt(maxSparks / (columns * rows));
    columns = Math.max(1, Math.floor(columns * shrink));
    rows = Math.max(1, Math.floor(rows * shrink));
  }
  const count = columns * rows;
  const orbit = sparkOrbitOf(style, options);
  // Embers start below the area and end above it, their soft disc (2.5 radii, see the renderer)
  // wholly past the edge.
  const margin = emberMargin(style);
  const span = area.height + 2 * margin;
  const keep = !style.fillRise && options.keepSpark ? options.keepSpark : null;
  const sparks = Array.from({length: count}, (_, index): SparkElement | null => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x0 = area.x + ((column + randomBetween(random, 0.15, 0.85)) * area.width) / columns;
    const y0 = area.y + ((row + randomBetween(random, 0.15, 0.85)) * area.height) / rows;
    const radius = Math.max(1, randomBetween(random, 0.08, 0.2) * style.fillScale);
    const twinkles = 1 + Math.floor(random() * 3);
    const twinklePhase = random() * TAU;
    const orbitPhase = random() * TAU;
    const turns = (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 2));
    const color = pattern[index % pattern.length]!;
    const twinkle = (0.5 - 0.5 * Math.cos(twinkles * phase + twinklePhase)) ** 2;
    if (!style.fillRise) {
      // The orbit turns a whole number of times; its speed follows fillSpeed along the circle.
      const laps = orbit > 0 ? lapsFor(style.fillSpeed, style.durationSeconds, TAU * orbit) : 0;
      const angle = Math.sign(turns) * laps * phase + orbitPhase;
      // Every random draw above happens either way, so dropping a sparkle never moves another.
      if (keep && !keep(x0, y0, 2.5 * radius + orbit)) return null;
      return {
        type: 'spark', x: x0 + orbit * Math.cos(angle), y: y0 + orbit * Math.sin(angle), radius, color,
        opacity: style.fillOpacity * twinkle,
      };
    }
    const speedFactor = randomBetween(random, 0.7, 1.3);
    const start = (index + randomBetween(random, 0.2, 0.8)) / count;
    const preferredLives = 1 + Math.floor(random() * 2);
    // An ember rises exactly fillSpeed × its pace, whatever the area: it lives a whole number of
    // times per cycle, each life climbing `climb` px (never more than the area and its margins,
    // so a low area only means more, shorter lives) and dropping back, faded out, to start again.
    const travel = style.fillSpeed * speedFactor * style.durationSeconds;
    const lives = travel > 0 ? Math.max(preferredLives, Math.ceil(travel / span - 1e-9)) : 0;
    const climb = lives > 0 ? travel / lives : 0;
    const life = fract(start + lives * cycle);
    // Its height wraps around the span, which starts and ends a margin beyond the area, where the
    // whole disc is out of sight: a climb near the top goes on from the bottom, so the embers
    // cover the whole height evenly at every size. At frame 0 each sits at its row's jittered
    // height (15–85% into its row), so that wrap never falls on the seam either.
    const rowHeight = ((y0 - area.y) / area.height) * span;
    const height = rowHeight + (fract(start) - life) * climb;
    // sin² fades in from and out to zero with zero slope, so the drop back is invisible.
    const envelope = Math.sin(Math.PI * life) ** 2;
    return {
      type: 'spark',
      x: x0 + 0.25 * style.fillScale * Math.sin(Math.abs(turns) * phase + orbitPhase),
      y: area.y - margin + (height - Math.floor(height / span) * span),
      radius,
      color,
      opacity: style.fillOpacity * envelope * (0.6 + 0.4 * twinkle),
    };
  });
  const kept = sparks.filter((spark): spark is SparkElement => spark !== null);
  return [...(base ? [baseRect(area, base, style.fillOpacity, options)] : []), ...kept];
};

/**
 * Translucent glass: the base colour, and soft sheen bands sweeping across along the motion, one
 * spacing apart (see getFillMotion), listed by place like the stripes: from one place wholly
 * before the area to one wholly past it, so when the places wrap by one spacing (at a seeded time
 * away from the seam) the first and last sheens are out of sight and the picture is unchanged.
 * A small panel shows one sheen crossing and a gap; a screen shows a few at once, as fast.
 * Standing still, a single sheen rests across the middle.
 */
const glassFill = (style: FillStyle, area: Rect, cycle: number, random: () => number, options: FillOptions): FillElement[] => {
  const colors = style.fillColors;
  const u = fillDirection(style.fillAngle);
  const across = {x: -u.y, y: u.x};
  const width = sheenWidthOf(area, options);
  const extent = extentAlong(area, u);
  const {period, laps} = getFillMotion(style, area, options);
  const shift = randomBetween(random, 0.2, 0.8);
  const centre = centreOf(area);
  const sheen = (along: number): SheenElement => ({
    type: 'sheen', cx: centre.x + u.x * along, cy: centre.y + u.y * along, nx: u.x, ny: u.y,
    width, length: extentAlong(area, across) + 2 * width,
    color: colors[1] ?? '#FFFFFF', opacity: options.sheenOpacity ?? 0.3,
  });
  const base = baseRect(area, colors[0]!, style.fillOpacity, options);
  if (laps === 0) return [base, sheen(0)];
  const {offset} = placeTravel(shift, laps, cycle);
  // Place 0 starts a spacing before `-extent/2 - width` (wholly outside) and ends there; the last
  // place never comes nearer than `extent/2 + width` from the other side.
  const count = Math.ceil((extent + 2 * width) / period - 1e-9) + 2;
  const sheens = Array.from({length: count}, (_, index) => sheen(-extent / 2 - width + (index - 1 + offset) * period));
  return [base, ...sheens];
};

/**
 * Fog banks rolling sideways along the bottom of the area ('nevoa'): two staggered rows of soft
 * ellipses (see FOG_SHAPE) over the base colour, one spacing S apart, drifting S·laps per cycle
 * (the same in both rows), listed by place like the glass sheens: from one place wholly before
 * the area (its whole soft reach) to one wholly past it, so when the places wrap by one spacing,
 * at a seeded time away from the seam, the banks that swap are out of sight. A bank's size,
 * height, opacity and core are functions of where it is now and of the cycle (FOG_WAVES), never
 * of its index, so after the wrap each place looks exactly as the one before it did. Colours:
 * with one, it is the fog and there is no base; with three, the third is the core (with two, the
 * core is the fog's colour).
 */
const fogFill = (style: FillStyle, area: Rect, cycle: number, random: () => number, options: FillOptions): FillElement[] => {
  const {base, pattern} = splitColors(style.fillColors);
  const height = style.fillScale;
  const spacing = fogSpacing(style);
  const direction = fogDirection(style.fillAngle);
  const {laps} = getFillMotion(style, area);
  const shift = randomBetween(random, 0.2, 0.8);
  const wavePhases = (waves: readonly {length: number; drift: number; amount: number}[]) =>
    FOG_ROWS.map(() => waves.map(() => random() * TAU));
  const phases = {
    size: wavePhases(FOG_WAVES.size), opacity: wavePhases(FOG_WAVES.opacity),
    rise: wavePhases(FOG_WAVES.rise), core: wavePhases(FOG_WAVES.core),
  };
  // Σ amount·sin(2π(x − drift)/λ): each wave goes a whole number of wavelengths per cycle.
  const swing = (waves: readonly {length: number; drift: number; amount: number}[], rowPhases: number[], x: number) =>
    waves.reduce((sum, wave, index) => {
      const length = wave.length * spacing;
      const turns = Math.round((wave.drift * laps * spacing) / length);
      return sum + wave.amount * Math.sin((TAU * (x - area.x)) / length - direction * turns * cycle * TAU + rowPhases[index]!);
    }, 0);
  const {offset} = placeTravel(shift, laps * direction, cycle);
  const reach = (FOG_SHAPE.width * height * FOG_MAX_SIZE) / 2;
  const count = Math.ceil((area.width + 2 * reach) / spacing - 1e-9) + 2;
  const color = pattern[0]!;
  const coreColor = pattern[1] ?? color;
  const banks = FOG_ROWS.flatMap((row, rowIndex) => Array.from({length: count}, (_, index): FogElement => {
    const cx = area.x - reach + (index - 1 + offset + row.stagger) * spacing;
    const size = row.scale * (1 + swing(FOG_WAVES.size, phases.size[rowIndex]!, cx));
    const presence = row.opacity * (1 - FOG_WAVES.opacity[0].amount + swing(FOG_WAVES.opacity, phases.opacity[rowIndex]!, cx));
    const core = 1 - FOG_WAVES.core[0].amount + swing(FOG_WAVES.core, phases.core[rowIndex]!, cx);
    return {
      type: 'fog',
      cx,
      cy: area.y + area.height - row.rise * height + height * swing(FOG_WAVES.rise, phases.rise[rowIndex]!, cx),
      width: FOG_SHAPE.width * height * size,
      height: height * size,
      color,
      opacity: style.fillOpacity * FOG_BODY_PEAK * presence,
      coreColor,
      coreOpacity: style.fillOpacity * FOG_CORE_PEAK * presence * core,
    };
  }));
  return [...(base ? [baseRect(area, base, style.fillOpacity, options)] : []), ...banks];
};

/**
 * Damask wallpaper ('damasco'): one pattern element over the area, the interior's motif on a
 * half-drop lattice (tile fillScale × 1.5·fillScale), inked in the second colour over the base.
 * The base is drawn inside the tile and the whole area at fillOpacity, so ink and ground share
 * one alpha: a base rect under ink at fillOpacity would leave the gaps more see-through than the
 * motifs, and bright footage behind the gaps would wash the wallpaper out.
 * It scrolls like the dots, along the nearest axis or diagonal, one tile per axis per lap, from
 * seeded offsets; the offsets wrap by a whole tile, which leaves the picture unchanged. Standing
 * still (the presets), it rests at its seeded offset. A third colour is ignored.
 */
const damaskFill = (style: FillStyle, area: Rect, cycle: number, random: () => number): FillElement[] => {
  const {base, pattern} = splitColors(style.fillColors);
  const direction = dotDirection(style.fillAngle);
  const {laps} = getFillMotion(style, area);
  const tileWidth = style.fillScale;
  const tileHeight = style.fillScale * DAMASK_TILE_RATIO;
  const offsetX = placeTravel(randomBetween(random, 0.2, 0.8), laps * direction.x, cycle).offset * tileWidth;
  const offsetY = placeTravel(randomBetween(random, 0.2, 0.8), laps * direction.y, cycle).offset * tileHeight;
  const damask: DamaskElement = {
    type: 'damask', x: area.x, y: area.y, width: area.width, height: area.height, tileWidth, tileHeight,
    offsetX, offsetY, color: pattern[0]!, baseColor: base ?? 'none', opacity: style.fillOpacity,
  };
  return [damask];
};

/**
 * Every fill of the engine, as a flat list of elements over `area` (the panel's box), to be
 * clipped to the panel by FillLayer. Pure: the frame, the props and the seed decide it all.
 */
export const buildFillScene = (
  style: FillStyle, area: Rect, frame: number, durationInFrames: number, options: FillOptions = {},
): FillElement[] => {
  const pattern = buildPattern(style, area, frame, durationInFrames, options);
  const light = style.fillLight ?? 0;
  if (!(light > 0)) return pattern;
  // The light falls on whatever the fill is, so it goes over the pattern, last in the list.
  const shade: ShadeElement = {
    type: 'shade', x: area.x, y: area.y, width: area.width, height: area.height, color: '#FFFFFF', opacity: light,
  };
  return [...pattern, shade];
};

const buildPattern = (
  style: FillStyle, area: Rect, frame: number, durationInFrames: number, options: FillOptions,
): FillElement[] => {
  const cycle = cycleOf(frame, durationInFrames);
  // The seed stream starts fresh for every call, so render order never matters.
  const random = createSeededRandom(style.seed + 101 + (options.seedOffset ?? 0));
  switch (style.fill) {
    case 'solido':
      return [baseRect(area, style.fillColors[0]!, style.fillOpacity, options)];
    case 'gradiente':
      return gradientFill(style, area, cycle, random, options);
    case 'pontos':
      return dotFill(style, area, cycle, random, options);
    case 'listras':
      return stripeFill(style, area, cycle, random, options);
    case 'brilhos':
      return sparkFill(style, area, cycle, random, options);
    case 'vidro':
      return glassFill(style, area, cycle, random, options);
    case 'nevoa':
      return fogFill(style, area, cycle, random, options);
    case 'damasco':
      return damaskFill(style, area, cycle, random);
  }
};
