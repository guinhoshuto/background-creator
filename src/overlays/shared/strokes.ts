import {interpolateColors} from 'remotion';
import type {z} from 'zod';
import {createSeededRandom, randomBetween, TAU} from '../../loop';
import type {OutputFormat} from '../../settings';
import type {
  CometElement, DashElement, GlowElement, HaloElement, OutlineElement, RimElement, SegmentElement, StrokeElement,
} from './elements';
import type {StrokeMotionName} from './fields';
import {isCircle, type RoundRect} from './geometry';
import {glowSigma} from './layout';
import {RIM_WIDTH} from './legibility';
import {cycleOf, framesOf, placeTravel, refineTravel, wrapIndex} from './motion';
import {fitPeriod, lapsFor, perimeterLength} from './perimeter';
import {GLOW_GAIN} from './render';

/** The stroke props (see `strokeFields`) plus the loop's own. */
export type StrokeStyle = {
  strokeMotion: StrokeMotionName;
  strokeColors: readonly string[];
  strokeWidth: number;
  dashLength: number;
  gapLength: number;
  cometSpacing: number;
  cometTail: number;
  gradientLength: number;
  strokeSpeed: number;
  strokePulses: number;
  seed: number;
  durationSeconds: number;
};

/** Knobs a kind may tune; the defaults are the engine's look. */
export type StrokeOptions = {
  /** Track index written into every element (a double line has two tracks). */
  track?: number;
  /** Stroke width to draw instead of `strokeWidth` (each line of a double line). */
  width?: number;
  /** Opacity of a dim full outline under the ants or the comets; 0 draws none. */
  trackOpacity?: number;
  /** 'pulse': share of the width lost at the low point of a breath; 0 keeps the width. */
  pulseWidth?: number;
  /** 'pulse': opacity at the low point of a breath. */
  pulseFloor?: number;
  /** Target length of the pieces of a colour flow, in px. */
  segmentLength?: number;
  /**
   * How many times the palette repeats around the track. By default the track is fitted with
   * whole repeats of about gradientLength px; a double line hands its main line's count (and its
   * laps, see below) to the second one, so both flow in step.
   */
  colorRepeats?: number;
  /**
   * Whole pattern periods travelled per cycle instead of the ones strokeSpeed rounds to: a double
   * line hands its main line's laps to the second one too, so with as many colour repeats both
   * move the same share of the way round per frame and stay in step.
   */
  laps?: number;
  /** Decorrelates two strokes of one scene that share the seed. */
  seedOffset?: number;
};

/** Neighbouring colour segments overlap this much, so anti-aliasing leaves no hairline between them. */
const SEGMENT_OVERLAP = 0.75;

/** How many times the palette repeats around a track: whole repeats of about gradientLength px. */
export const colorRepeatsOf = (style: Pick<StrokeStyle, 'gradientLength'>, track: RoundRect, options: StrokeOptions = {}) =>
  Math.max(1, Math.round(options.colorRepeats ?? fitPeriod(perimeterLength(track), style.gradientLength).n));

/**
 * How a stroke travels along its track in one cycle. `period` is the length of one look-alike
 * piece (a dash with its gap, the space between comets, the colour period of a flow),
 * `unitsPerPeriod` how many pieces one period of the full pattern holds (alternating colours make
 * the pattern repeat only every C pieces), `laps` the whole pattern periods travelled per cycle
 * and `speed` the px/s actually shown, rounded from strokeSpeed. Sidecars can report it.
 *
 * Every period is a fixed length in px fitted to the track (dash + gap, cometSpacing,
 * gradientLength), never a share of it: the speed then rounds by about one period per cycle
 * whatever the size, so a family of sizes moves at one speed.
 */
export const getStrokeMotion = (style: StrokeStyle, track: RoundRect, options: StrokeOptions = {}) => {
  const perimeter = perimeterLength(track);
  const colors = style.strokeColors.length;
  const moving = (count: number, period: number, unitsPerPeriod: number) => {
    const laps = options.laps ?? lapsFor(style.strokeSpeed, style.durationSeconds, period * unitsPerPeriod);
    return {
      perimeter, count, period, unitsPerPeriod, laps,
      speed: (laps * period * unitsPerPeriod) / style.durationSeconds,
    };
  };
  switch (style.strokeMotion) {
    case 'dashes': {
      // Colours alternate dash by dash, so the loop holds a whole number of colour groups.
      const groups = fitPeriod(perimeter, colors * (style.dashLength + style.gapLength)).n;
      return moving(groups * colors, perimeter / (groups * colors), colors);
    }
    case 'comets': {
      // Comets wear the colour of the place they pass (see cometColor), so moving by one spacing
      // leaves the picture as it was: the speed rounds to whole spacings, not whole colour groups.
      const count = fitPeriod(perimeter, style.cometSpacing).n;
      return moving(count, perimeter / count, 1);
    }
    case 'gradient': {
      if (colors < 2) return {perimeter, count: 1, period: perimeter, unitsPerPeriod: 1, laps: 0, speed: 0};
      const repeats = colorRepeatsOf(style, track, options);
      return moving(repeats, perimeter / repeats, 1);
    }
    default:
      return {perimeter, count: 1, period: perimeter, unitsPerPeriod: 1, laps: 0, speed: 0};
  }
};

/**
 * Refuses a stroke motion that would alias (see refineTravel): the ants, the comets and the
 * colour flow may cover at most MAX_FRAME_SHARE of the way to the next look-alike piece per frame.
 */
export const refineStroke = (
  props: StrokeStyle & {outputFormat: OutputFormat}, track: RoundRect, context: z.RefinementCtx, options: StrokeOptions = {},
) => {
  const fixes: Partial<Record<StrokeMotionName, [string, string]>> = {
    dashes: ['the dashes', 'increase dashLength or gapLength'],
    comets: ['the comets', 'increase cometSpacing'],
    gradient: ['the stroke gradient', 'increase gradientLength'],
  };
  const fix = fixes[props.strokeMotion];
  if (!fix) return;
  const durationInFrames = framesOf(props);
  if (durationInFrames === null) return;
  const motion = getStrokeMotion(props, track, options);
  refineTravel({
    laps: motion.laps,
    period: motion.period * motion.unitsPerPeriod,
    unitsPerPeriod: motion.unitsPerPeriod,
    durationSeconds: props.durationSeconds,
    durationInFrames,
    field: 'strokeSpeed',
    subject: fix[0],
    otherFix: fix[1],
  }, context);
};

/** The colour at `position` in [0, 1) of a palette that returns to its first colour. */
export const paletteAt = (colors: readonly string[], position: number) => {
  if (colors.length === 1) return colors[0]!;
  const scaled = (((position % 1) + 1) % 1) * colors.length;
  const index = Math.floor(scaled) % colors.length;
  return interpolateColors(scaled - Math.floor(scaled), [0, 1], [colors[index]!, colors[(index + 1) % colors.length]!]);
};

/**
 * A comet's colour: the palette laid along the track, repeating about every C comets (a whole
 * number of times around it), read where the head is. Neighbours differ by about one colour, and
 * a comet shifts smoothly into the next one's colour as it takes its place, so the places can
 * wrap by a single spacing without any comet changing colour at once.
 */
const cometColor = (colors: readonly string[], s: number, perimeter: number, count: number) =>
  paletteAt(colors, (s * Math.max(1, Math.round(count / colors.length))) / perimeter);

/** A breath that repeats `pulses` whole times per cycle: 0 at the low point, 1 at the peak. */
const breath = (pulses: number, cycle: number, phase: number) => 0.5 + 0.5 * Math.cos(pulses * cycle * TAU + phase);

type Common = {track: number; width: number; opacity: number};

/**
 * The palette spread along the track as short segments listed by place. The flow moves
 * `laps` colour periods per cycle; places wrap by one segment, and each place's colour steps to
 * its neighbour's at that instant, so the picture is continuous and every place keeps its
 * velocity through the seam (the seeded shift keeps the wraps off it).
 */
const colorFlow = (
  style: StrokeStyle, track: RoundRect, cycle: number, shift: number, common: Common, options: StrokeOptions,
): SegmentElement[] => {
  const motion = getStrokeMotion({...style, strokeMotion: 'gradient'}, track, options);
  const perimeter = motion.perimeter;
  const repeats = motion.count;
  const colorPeriod = perimeter / repeats;
  const perPeriod = Math.max(2, Math.round(colorPeriod / (options.segmentLength ?? 8)));
  const count = perPeriod * repeats;
  const length = perimeter / count;
  const laps = style.strokeMotion === 'gradient' ? motion.laps : 0;
  const {offset, step} = placeTravel(shift, laps * perPeriod, cycle);
  const palette = Array.from({length: perPeriod}, (_, index) => paletteAt(style.strokeColors, (index + 0.5) / perPeriod));
  return Array.from({length: count}, (_, index) => {
    const slot = wrapIndex(index - step, perPeriod);
    return {
      type: 'segment', track: common.track, s: (index + offset) * length, length: length + SEGMENT_OVERLAP,
      width: common.width, mix: (slot + 0.5) / perPeriod, color: palette[slot]!, opacity: common.opacity,
    };
  });
};

/** The full outline, or the palette spread along it when there are several colours. */
const still = (style: StrokeStyle, track: RoundRect, cycle: number, shift: number, common: Common, options: StrokeOptions) =>
  (style.strokeColors.length > 1
    ? colorFlow(style, track, cycle, shift, common, options)
    : [{type: 'outline', track: common.track, width: common.width, color: style.strokeColors[0]!, opacity: common.opacity} satisfies OutlineElement]);

const underTrack = (style: StrokeStyle, common: Common, options: StrokeOptions): OutlineElement[] =>
  ((options.trackOpacity ?? 0) > 0
    ? [{type: 'outline', track: common.track, width: common.width, color: style.strokeColors[0]!, opacity: options.trackOpacity!}]
    : []);

/**
 * Every stroke motion of the engine along one track, as a flat list of elements listed by place:
 * - still: the outline (or the palette spread along it);
 * - pulse: the same, breathing `strokePulses` whole times per cycle (opacity, optionally width);
 * - dashes: `n` dashes of one global period P/n, colours alternating, travelling whole periods;
 * - comets: heads about cometSpacing apart (P/m, m whole) with fading tails, in the palette's colour where they are;
 * - gradient: the palette flowing along the track by arc length.
 * Pure: the frame, the props and the seed decide it all. An empty list when strokeWidth is 0.
 */
export const buildStrokeScene = (
  style: StrokeStyle, track: RoundRect, frame: number, durationInFrames: number, options: StrokeOptions = {},
): StrokeElement[] => {
  const cycle = cycleOf(frame, durationInFrames);
  const width = options.width ?? style.strokeWidth;
  if (!(width > 0) || !(perimeterLength(track) > 0)) return [];
  const random = createSeededRandom(style.seed + 211 + (options.seedOffset ?? 0));
  const shift = randomBetween(random, 0.2, 0.8);
  const pulsePhase = random() * TAU;
  const common: Common = {track: options.track ?? 0, width, opacity: 1};
  const colors = style.strokeColors;

  switch (style.strokeMotion) {
    case 'still':
      return still(style, track, cycle, shift, common, options);
    case 'gradient':
      return still(style, track, cycle, shift, common, options);
    case 'pulse': {
      const level = breath(style.strokePulses, cycle, pulsePhase);
      const floor = options.pulseFloor ?? 0.45;
      return still(style, track, cycle, shift, {
        ...common,
        width: width * (1 - (options.pulseWidth ?? 0) * (1 - level)),
        opacity: floor + (1 - floor) * level,
      }, options);
    }
    case 'dashes': {
      const motion = getStrokeMotion(style, track, options);
      const {offset, step} = placeTravel(shift, motion.laps * motion.unitsPerPeriod, cycle);
      const length = (style.dashLength * motion.period) / (style.dashLength + style.gapLength);
      const dashes = Array.from({length: motion.count}, (_, index): DashElement => ({
        type: 'dash', track: common.track, s: (index + offset) * motion.period, length, width,
        color: colors[wrapIndex(index - step, colors.length)]!, opacity: 1,
      }));
      return [...underTrack(style, common, options), ...dashes];
    }
    case 'comets': {
      const motion = getStrokeMotion(style, track, options);
      const {offset} = placeTravel(shift, motion.laps, cycle);
      const tail = Math.min(style.cometTail, motion.period);
      const comets = Array.from({length: motion.count}, (_, index): CometElement => {
        const s = (index + offset) * motion.period;
        return {
          type: 'comet', track: common.track, s, tail, width,
          color: cometColor(colors, s, motion.perimeter, motion.count), opacity: 1,
        };
      });
      return [...underTrack(style, common, options), ...comets];
    }
  }
};

export type GlowStyle = {glow: number; glowPulses: number; glowStrength?: number; seed: number};

/** The glow filter's alpha gain for a strength (1 = the engine's GLOW_GAIN). */
export const glowGainOf = (style: Pick<GlowStyle, 'glowStrength'>) => GLOW_GAIN * (style.glowStrength ?? 1);

/**
 * The glow of the stroke layer: one element, σ fixed at glow / 3 so the outset never moves, its
 * gain fixed by glowStrength, the opacity breathing `glowPulses` whole times per cycle. Empty
 * when glow is 0.
 */
export const buildGlowScene = (style: GlowStyle, frame: number, durationInFrames: number): GlowElement[] => {
  const cycle = cycleOf(frame, durationInFrames);
  if (!(style.glow > 0)) return [];
  const phase = createSeededRandom(style.seed + 307)() * TAU;
  const opacity = style.glowPulses > 0 ? 0.45 + 0.55 * breath(style.glowPulses, cycle, phase) : 1;
  return [{type: 'glow', blur: glowSigma(style.glow), gain: glowGainOf(style), opacity}];
};

export type HaloStyle = {halo: number; haloColor: string; seed: number; glowPulses?: number};

/** The outer halo of a panel, breathing with the glow's pulses. Empty when halo is 0. */
export const buildHaloScene = (style: HaloStyle, frame: number, durationInFrames: number): HaloElement[] => {
  const cycle = cycleOf(frame, durationInFrames);
  if (!(style.halo > 0)) return [];
  const pulses = style.glowPulses ?? 0;
  // Same seed stream as the glow, so a halo and a glow that pulse together stay in step.
  const phase = createSeededRandom(style.seed + 307)() * TAU;
  const opacity = pulses > 0 ? 0.5 + 0.5 * breath(pulses, cycle, phase) : 0.8;
  return [{type: 'halo', blur: glowSigma(style.halo), color: style.haloColor, opacity}];
};

/** How far down the sides the rim light reaches before it has faded out, in px. */
const RIM_FADE = 96;

/**
 * The rim light along `edge` (a rounded rect just inside the stroke): one static element, or none
 * when rimLight is 0. It holds over the top corners' curve and fades out within RIM_FADE px, or by
 * the middle of a short panel. A circle has no top edge to hold along: the light is brightest at
 * the top and fades along the arc down to the equator, so only the top arc catches it.
 */
export const buildRimScene = (style: {rimLight: number}, edge: RoundRect): RimElement[] => {
  if (!(style.rimLight > 0) || !(edge.width > 0) || !(edge.height > 0)) return [];
  const corner = Math.max(0, edge.radius);
  const round = isCircle(edge);
  return [{
    type: 'rim', x: edge.x, y: edge.y, width: edge.width, height: edge.height, corner, lineWidth: RIM_WIDTH,
    hold: round ? 0 : Math.min(corner, edge.height / 2), fade: round ? edge.height / 2 : Math.min(RIM_FADE, edge.height / 2),
    color: '#FFFFFF', opacity: style.rimLight,
  }];
};
