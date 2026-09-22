import {useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';
import {
  CENTER_X, CONTENT_BOX, darken, fract, getPlateWeight, getSunX, getSunY, GROUND_SPAN, HEIGHT, HORIZON_Y, pathOf,
  smoothstep, SPARKLE_GLOW, SUN_RADIUS, SUN_Y, WIDTH,
} from './vaporwave/frame';
import {getMountainOutline, getMountainRidges, Mountains, RidgeLine} from './vaporwave/Mountains';
import {
  getPalmShape, Palm, PALM_ALPHA_FADE, palmBaseX, PALM_JITTER, PALM_ORDER, PALM_SLOTS, PALM_SWAY,
} from './vaporwave/Palm';
import {ContentPlate, PlateDefs} from './vaporwave/Plate';
import {Polyhedron} from './vaporwave/Polyhedron';
import {Sparkle} from './vaporwave/Sparkle';

export {
  CENTER_X, CONTENT_BOX, getPlateWeight, getSunX, getSunY, HEIGHT, HORIZON_Y, SPARKLE_GLOW, SUN_RADIUS, SUN_Y, WIDTH,
} from './vaporwave/frame';
export {getMountainRidges} from './vaporwave/Mountains';
export {getPalmShape, PALM_ALPHA_FADE, PALM_JITTER, PALM_ORDER, PALM_SLOTS, PALM_SWAY} from './vaporwave/Palm';

export const vaporwaveLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(16),
  // Schema, Root literal and presets carry the same seed, so an omitted key never surprises.
  seed: baseBackgroundSchema.shape.seed.default(88),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#120C2E'),
  colors: baseBackgroundSchema.shape.colors.default(['#FF71CE', '#01CDFE', '#FFFB96', '#B967FF'])
    .describe('Paleta: rosa neon das linhas do chão, do horizonte, do sol, da cordilheira de trás e de um sólido; ciano das colunas do chão, das montanhas da frente e dos outros sólidos; amarelo-claro do topo do sol; lilás da névoa. A terceira e a quarta cores são opcionais e as demais são ignoradas'),
  speed: z.number().int().min(0).max(12).default(4)
    .describe('Linhas da grade que passam por ciclo (inteiro); mais linhas deixam o chão mais rápido e 0 o deixa parado. Todo o movimento acompanha o ciclo: ao aumentar durationSeconds, aumente speed na mesma proporção (32 s → 8, 48 s → 12)'),
  sunPosition: z.number().finite().min(0.1).max(0.9).default(0.9)
    .describe('Posição horizontal do sol: 0,1 na borda esquerda, 0,5 no centro e 0,9 na borda direita; perto do centro ele desce e fica meio posto no horizonte, abaixo da faixa do título. O lado do sol é o mais claro do quadro: deixe chat e alertas do lado oposto'),
  neonGlow: z.number().finite().min(0).max(1).default(0.7)
    .describe('Brilho neon da grade, do horizonte, das montanhas, do sol e dos contornos'),
  starCount: z.number().int().min(0).max(200).default(90)
    .describe('Estrelas no céu; a cada dez, um cintilo de quatro pontas maior (até 12)'),
  shootingStars: z.number().int().min(0).max(3).default(1)
    .describe('Estrelas cadentes por ciclo, sempre na faixa de cima; repetem o mesmo trajeto a cada ciclo — em lives longas, use 0'),
  palmCount: z.number().int().min(0).max(3).default(2)
    .describe('Palmeiras em cada lateral: 1 deixa só a que se inclina para fora do quadro; 2 soma a grande, perto da câmera; 3 soma a pequena no horizonte'),
  shapeCount: z.number().int().min(0).max(4).default(2)
    .describe('Sólidos aramados flutuando: os dois primeiros nos cantos de cima, os outros nos de baixo'),
  centerShade: z.number().finite().min(0).max(1).default(0.6)
    .describe('Placa suave 16:9 atrás da área de conteúdo; no WebM transparente, apaga o sol, as estrelas, os cintilos, as colinas distantes e o meio da linha do horizonte atrás dela'),
});

export type VaporwaveLoopProps = z.infer<typeof vaporwaveLoopSchema>;

export type VaporwaveElement = {
  kind: 'star' | 'sparkle' | 'meteor' | 'sun' | 'sunCut' | 'ridge' | 'horizon' | 'row' | 'palm' | 'shape';
  x: number;
  y: number;
  /** Radius of a star, sparkle, meteor head, sun or solid; cut height; row thickness; palm height. */
  size: number;
  /** Meteor trail, half-height of a row's glow or a palm's frond length, in px. */
  length: number;
  /** Meteor heading or the palm's sway in phase, in degrees. */
  angle: number;
  /** The palm's sway a quarter turn later, in degrees, or a solid's tilt in radians. */
  tilt: number;
  /** How far a palm's crown leans towards the middle, as a share of its height. */
  lean: number;
  /** Direction a solid faces, as a unit vector, so a whole turn never jumps at 360°. */
  spinCos: number;
  spinSin: number;
  opacity: number;
  glow: number;
  /** The sun's pale-yellow top: it fades before the rest when the sun is dimmed. */
  warmth: number;
  variant: number;
};

/**
 * The floor is a plane seen from a low camera: a row at depth d (the bottom edge is d = 1)
 * lands at HORIZON_Y + GROUND_SPAN / d. Rows are ROW_STEP apart; ROW_NEAR sits below the
 * frame and ROW_FAR, where the fog reaches zero, is where a new row is born.
 */
export const ROW_STEP = 0.5;
export const ROW_NEAR = 0.84;
export const ROW_COUNT = 8;
export const ROW_FAR = ROW_NEAR + ROW_COUNT * ROW_STEP;
/** Depth fog starts here, so the far rows fade before they bunch up at the horizon. */
const ROW_FOG = 1.45;
/**
 * Over gameplay the nearest rows cross the game's HUD along the bottom edge: below
 * groundY(ALPHA_ROW_BOTTOM.from) they keep only ALPHA_ROW_BOTTOM.floor of their opacity,
 * back to full at groundY(ALPHA_ROW_BOTTOM.to).
 */
export const ALPHA_ROW_BOTTOM = {from: 1.45, to: 2, floor: 0.4} as const;
const ROW_HALF_DEPTH = 0.0078;
/** Columns: ground stripes, COLUMN_STEP px apart where they cross the bottom edge. */
const COLUMN_STEP = 170;
const COLUMN_REACH = 28;

/** Cuts live in the lower part of the disc, in units of its diameter from the top. */
export const SUN_CUT_START = 0.36;
export const SUN_CUT_END = 1.07;
export const SUN_CUT_COUNT = 8;
const SUN_CUT_STEP = (SUN_CUT_END - SUN_CUT_START) / SUN_CUT_COUNT;
const SUN_CUT_MAX = 0.05;
/** Whole cut steps per cycle, so every cut lands on its neighbour's place at the seam. */
export const SUN_CUT_DRIFT = 2;

const METEOR_SECONDS = 1.15;
export const METEOR_HALO = 6;
export const SPARKLE_MAX = 12;

/**
 * Where the solids float: two in the upper corners, between the palm crowns and the content
 * area, and two in the lower corners, under it. Their reach, bob and glow included, stays
 * outside CONTENT_BOX (tests/vaporwave.test.ts checks every sampled phase).
 */
export const SHAPE_SLOTS = [
  {x: 334, y: 112}, {x: 1586, y: 112}, {x: 330, y: 968}, {x: 1590, y: 968},
] as const;
export const SHAPE_BOB = {x: 7, y: 9} as const;
/** How far the seed may nudge a slot, and the range of sizes (the solid's radius, in px). */
export const SHAPE_JITTER = {x: 12, y: 5} as const;
export const SHAPE_SIZE = {min: 46, max: 54} as const;
/** Whole turns per cycle: the solid faces the same way at the seam. */
export const SHAPE_TURNS = 1;

export const groundY = (depth: number) => HORIZON_Y + GROUND_SPAN / depth;

/**
 * The cut band follows the part of the disc above the horizon: a sun that sinks keeps the
 * same number of cuts, scaled to its visible height, instead of losing them under the horizon.
 */
export const getSunCutScale = (sunY: number) =>
  (HORIZON_Y - (sunY - SUN_RADIUS)) / (HORIZON_Y - (SUN_Y - SUN_RADIUS));

/**
 * What a row looks like at a given depth. Anchored to the depth, not to the row, so a row
 * that leaves a place hands it to the next one with exactly the same shape.
 */
export const getRowField = (depth: number, transparent = false) => {
  // Exactly zero, with zero slope, at ROW_FAR: the row that is born there is invisible.
  const fog = (1 - smoothstep(ROW_FOG, ROW_FAR, depth)) ** 1.4;
  // Over gameplay the floor dissolves sooner towards the horizon, and the nearest rows stay
  // faint where the game's HUD sits. Both ramps depend on the depth alone, so every place still
  // hands the next row exactly the same shape.
  const {from, to, floor} = ALPHA_ROW_BOTTOM;
  const clear = transparent
    ? (1 - 0.8 * smoothstep(1.1, 3, depth)) * (floor + (1 - floor) * smoothstep(from, to, depth))
    : 1;
  return {
    y: groundY(depth),
    // Perspective thickness with a smooth 2 px floor: far rows never turn into hairlines.
    size: Math.hypot(2, (GROUND_SPAN * 2 * ROW_HALF_DEPTH) / (depth * depth)),
    length: 4 + 16 / depth,
    opacity: fog * clear,
  };
};

/** A cut's height at a place on the disc (0 = top, 1 = bottom), as a fraction of the diameter. */
export const getSunCutField = (place: number) => {
  const depth = Math.max(0, (place - SUN_CUT_START) / (1 - SUN_CUT_START));
  // Opens from nothing at the top of the band, so the cut that is born there is invisible,
  // but quickly reaches a bold height: no hairlines crawling over the disc.
  return SUN_CUT_MAX * (0.3 + 0.7 * depth ** 1.2) * smoothstep(0, 0.12, depth);
};

/** Keeps the middle quiet: stars fade near the centre even before the plate. */
const centerDim = (x: number, y: number) =>
  1 - 0.72 * Math.exp(-(((x - CENTER_X) / 620) ** 2 + ((y - 520) / 300) ** 2));

/**
 * Sparkles live in the open sky above the content area: never behind the sun (whose disc
 * starts at y 398), the mountains or a palm crown, so every one the count promises is seen.
 * The keep-outs are static, so the sun and the palm count never move the sparkles.
 */
export const SPARKLE_SKY = {top: 34, bottom: CONTENT_BOX.top} as const;
/** The palm crowns hang in the sky below this line, within this far of either frame edge. */
export const SPARKLE_CROWN_KEEPOUT = {x: 400, y: 190} as const;
const sparkleSpotIsFree = (x: number, y: number, reach: number) => {
  const inBox = x > CONTENT_BOX.left - reach && x < CONTENT_BOX.right + reach &&
    y > CONTENT_BOX.top - reach && y < CONTENT_BOX.bottom + reach;
  const nearSolid = SHAPE_SLOTS.slice(0, 2).some((slot) => Math.hypot(x - slot.x, y - slot.y) < 120);
  const nearCrown = (x < SPARKLE_CROWN_KEEPOUT.x + reach || x > WIDTH - SPARKLE_CROWN_KEEPOUT.x - reach) &&
    y > SPARKLE_CROWN_KEEPOUT.y - reach;
  return !inBox && !nearSolid && !nearCrown;
};

/**
 * Progress of a shooting star inside its slot: it crosses once, fades out, then returns to
 * its start while invisible. Its slot never touches the seam, so every field rests there.
 */
const meteorProgress = (local: number, start: number, visible: number) => {
  const pause = 0.03;
  const back = 0.12;
  if (local < start) return {progress: 0, visible: false};
  if (local <= start + visible) return {progress: (local - start) / visible, visible: true};
  const returning = start + visible + pause;
  if (local < returning) return {progress: 1, visible: false};
  return {progress: 1 - smoothstep(returning, returning + back, local), visible: false};
};

const element = (kind: VaporwaveElement['kind'], values: Partial<VaporwaveElement>): VaporwaveElement => ({
  kind, x: 0, y: 0, size: 1, length: 0, angle: 0, tilt: 0, lean: 0, spinCos: 1, spinSin: 0,
  opacity: 1, glow: 1, warmth: 1, variant: 0, ...values,
});

/**
 * Every animated value lives here. The floor and the sun cuts scroll, so they are listed by
 * place (nearest row first, top cut first): at the seam each place is taken by the same kind
 * of line with the same shape, and every field of the list repeats with the same velocity.
 * Each layer draws from its own seeded stream, so a count never reshuffles another layer.
 */
export const getVaporwaveScene = (
  props: VaporwaveLoopProps,
  frame: number,
  durationInFrames: number,
): VaporwaveElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  const cycle = phase / TAU;
  const transparent = hasTransparentBackground(props);
  const sunX = getSunX(props.sunPosition);
  // Over gameplay there is no plate to darken, so the plate clears what lies behind it.
  const clear = (x: number, y: number) => (transparent ? 1 - 0.85 * props.centerShade * getPlateWeight(x, y) : 1);

  const starRandom = createSeededRandom(props.seed + 311);
  const stars = Array.from({length: props.starCount}, () => {
    const x = randomBetween(starRandom, 12, WIDTH - 12);
    const y = 16 + 600 * starRandom() ** 1.55;
    const size = 0.95 + 1.45 * starRandom() ** 4;
    const base = randomBetween(starRandom, 0.4, 1);
    const harmonic = 1 + Math.floor(starRandom() * 2);
    const offset = starRandom() * TAU;
    return element('star', {
      x, y, size,
      opacity: base * centerDim(x, y) * clear(x, y) * (0.72 + 0.28 * Math.sin(harmonic * phase + offset)),
      glow: size > 1.5 ? 1 : 0,
    });
  });

  const sparkleRandom = createSeededRandom(props.seed + 419);
  const sparkles = Array.from({length: Math.min(SPARKLE_MAX, Math.floor(props.starCount / 10))}, () => {
    const base = randomBetween(sparkleRandom, 7, 14);
    let x = 0;
    let y = 0;
    do {
      x = randomBetween(sparkleRandom, 40, WIDTH - 40);
      y = randomBetween(sparkleRandom, SPARKLE_SKY.top, SPARKLE_SKY.bottom);
    } while (!sparkleSpotIsFree(x, y, base * SPARKLE_GLOW + 4));
    const harmonic = sparkleRandom() < 0.5 ? 1 : 2;
    const offset = sparkleRandom() * TAU;
    const twinkle = 0.5 + 0.5 * Math.sin(harmonic * phase + offset);
    return element('sparkle', {
      x, y, size: base * (0.72 + 0.28 * twinkle),
      opacity: clear(x, y) * (0.12 + 0.78 * twinkle ** 3),
      variant: sparkleRandom() < 0.5 ? 0 : 1,
    });
  });

  // Meteors fly away from the sun, through the top band, one per slot of the cycle.
  const meteorRandom = createSeededRandom(props.seed + 733);
  const direction = props.sunPosition > 0.5 ? -1 : 1;
  const meteors = Array.from({length: props.shootingStars}, (_, index) => {
    const slotStart = randomBetween(meteorRandom, 0.12, 0.34);
    const visible = Math.min(0.3, (METEOR_SECONDS / props.durationSeconds) * props.shootingStars);
    const heading = randomBetween(meteorRandom, 4, 9);
    const angle = direction > 0 ? heading : 180 - heading;
    const startX = CENTER_X - direction * randomBetween(meteorRandom, 80, 500);
    const startY = randomBetween(meteorRandom, 44, 100);
    const travel = randomBetween(meteorRandom, 420, 560);
    const {progress, visible: shown} = meteorProgress(cycle * props.shootingStars - index, slotStart, visible);
    const radians = (angle * Math.PI) / 180;
    const arc = Math.sin(Math.PI * progress);
    return element('meteor', {
      x: startX + Math.cos(radians) * travel * progress,
      y: startY + Math.sin(radians) * travel * progress,
      size: 1.6,
      length: shown ? 200 * Math.min(1, 1.5 * arc) : 0,
      angle,
      opacity: shown ? 0.85 * arc ** 1.4 : 0,
    });
  });

  // A centred sun sinks below the title band (getSunY), so behind the content the disc only
  // dims a little and keeps its pale-yellow top; its bloom, which reaches the title, softens
  // more. Over gameplay there is nothing to darken, so the plate clears the sun instead.
  const sunY = getSunY(props.sunPosition);
  const dim = props.centerShade * getPlateWeight(sunX, sunY);
  const sun = element('sun', {
    x: sunX, y: sunY, size: SUN_RADIUS,
    opacity: 1 - (transparent ? 0.7 : 0.1) * dim,
    warmth: 1 - 0.2 * dim,
    glow: (0.92 + 0.08 * Math.sin(phase)) * (1 - 0.25 * dim),
  });
  const cutShift = fract(SUN_CUT_DRIFT * cycle + 0.5);
  const cutSpan = 2 * SUN_RADIUS * getSunCutScale(sunY);
  const cuts = Array.from({length: SUN_CUT_COUNT}, (_, index) => {
    const place = SUN_CUT_START + (index + cutShift) * SUN_CUT_STEP;
    return element('sunCut', {
      x: sunX,
      y: sunY - SUN_RADIUS + place * cutSpan,
      size: getSunCutField(place) * cutSpan,
    });
  });

  const ridges = [0, 1, 2].map((index) => element('ridge', {
    x: index, glow: 0.84 + 0.16 * Math.sin(phase + index * 2.1),
  }));
  const horizon = element('horizon', {y: HORIZON_Y, glow: 0.9 + 0.1 * Math.sin(2 * phase + 0.7)});

  // Rows travel `speed` whole steps per cycle toward the camera; listed nearest first.
  const rowShift = fract(0.5 - props.speed * cycle);
  const rows = Array.from({length: ROW_COUNT}, (_, index) =>
    element('row', getRowField(ROW_NEAR + (index + rowShift) * ROW_STEP, transparent)));

  // Every palm's quirks are drawn in a fixed order, then the count picks slots in PALM_ORDER.
  const palmRandom = createSeededRandom(props.seed + 547);
  const palms = [0, 1].flatMap((side) => PALM_SLOTS.map((slot, index) => {
    const edge = slot.edge + randomBetween(palmRandom, -PALM_JITTER.edge, PALM_JITTER.edge);
    const height = slot.height * randomBetween(palmRandom, 1 - PALM_JITTER.height, 1 + PALM_JITTER.height);
    const frond = slot.frond * randomBetween(palmRandom, 1 - PALM_JITTER.frond, 1 + PALM_JITTER.frond);
    const lean = slot.lean + randomBetween(palmRandom, -PALM_JITTER.lean, PALM_JITTER.lean);
    const first = palmRandom() * TAU;
    const second = palmRandom() * TAU;
    return {index, palm: element('palm', {
      x: palmBaseX(side, edge), y: slot.base, size: height, length: frond, lean,
      angle: PALM_SWAY.first * Math.sin(phase + first) + PALM_SWAY.second * Math.sin(2 * phase + second),
      tilt: PALM_SWAY.first * Math.cos(phase + first) + PALM_SWAY.second * Math.cos(2 * phase + second),
      variant: index * 2 + side,
    })};
  })).filter(({index}) => PALM_ORDER.indexOf(index) < props.palmCount).map(({palm}) => palm);

  const shapeRandom = createSeededRandom(props.seed + 233);
  const variantShift = Math.floor(shapeRandom() * 3);
  const shapes = SHAPE_SLOTS.map((slot, index) => {
    const offset = shapeRandom() * TAU;
    const spinOffset = shapeRandom() * TAU;
    const turn = shapeRandom() < 0.5 ? -1 : 1;
    const baseTilt = randomBetween(shapeRandom, 0.3, 0.55) * (shapeRandom() < 0.5 ? -1 : 1);
    const jitterX = randomBetween(shapeRandom, -SHAPE_JITTER.x, SHAPE_JITTER.x);
    const jitterY = randomBetween(shapeRandom, -SHAPE_JITTER.y, SHAPE_JITTER.y);
    const size = randomBetween(shapeRandom, SHAPE_SIZE.min, SHAPE_SIZE.max);
    const spin = spinOffset + turn * SHAPE_TURNS * phase;
    return element('shape', {
      x: slot.x + jitterX + SHAPE_BOB.x * Math.cos(phase + offset),
      y: slot.y + jitterY + SHAPE_BOB.y * Math.sin(phase + offset),
      size, spinCos: Math.cos(spin), spinSin: Math.sin(spin),
      tilt: baseTilt + 0.12 * Math.sin(phase + offset * 1.7),
      glow: 0.85 + 0.15 * Math.sin(2 * phase + offset),
      variant: (index + variantShift) % 3,
    });
  }).slice(0, props.shapeCount);

  return [...stars, ...sparkles, ...meteors, sun, ...cuts, ...ridges, horizon, ...rows, ...palms, ...shapes];
};

const WIRE_TOP = 430;
/**
 * Over gameplay every range is drawn opaque inside one group at this opacity: the union of
 * the bodies is composited once, so overlapping ranges never stack into a ghost silhouette.
 */
export const ALPHA_MOUNTAIN_OPACITY = 0.45;
/** The sky clip stops this far under the skylines, inside the bodies, so it never shows. */
const SKY_CLIP_SINK = 1.5;

const px = (value: number) => value.toFixed(2);

/** A disc cut by the horizon: only the part in the sky. */
const getSkyDiscPath = (x: number, y: number, r: number) => {
  const below = HORIZON_Y - y;
  if (below >= r) return `M${px(x - r)} ${px(y)}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0Z`;
  const half = Math.sqrt(r * r - below * below);
  return `M${px(x - half)} ${HORIZON_Y}A${r} ${r} 0 ${below > 0 ? 1 : 0} 1 ${px(x + half)} ${HORIZON_Y}Z`;
};

/**
 * Horizontal gradient stops: a piecewise-linear opacity ramp, optionally multiplied by a factor
 * that varies across the frame (sampled every 60 px), which is how the plate clears a layer
 * over gameplay without a mask.
 */
const clearedStops = (color: string, ramp: readonly (readonly [number, number])[], factor?: (x: number) => number) => {
  const rampAt = (offset: number) => {
    const next = ramp.findIndex(([at]) => at >= offset);
    if (next <= 0) return ramp[Math.max(0, next)]![1];
    const [from, low] = ramp[next - 1]!;
    const [to, high] = ramp[next]!;
    return low + ((high - low) * (offset - from)) / (to - from);
  };
  const offsets = factor ? Array.from({length: 33}, (_, index) => index / 32) : ramp.map(([offset]) => offset);
  return offsets.map((offset) => (
    <stop key={offset} offset={offset} stopColor={color}
      stopOpacity={(rampAt(offset) * (factor ? factor(offset * WIDTH) : 1)).toFixed(3)} />
  ));
};

/** The whole picture for one frame; VaporwaveLoop feeds it Remotion's frame. */
export const VaporwaveArtwork = ({props, frame, durationInFrames}: {
  props: VaporwaveLoopProps; frame: number; durationInFrames: number;
}) => {
  const scene = getVaporwaveScene(props, frame, durationInFrames);
  const ofKind = (kind: VaporwaveElement['kind']) => scene.filter((item) => item.kind === kind);
  const transparent = hasTransparentBackground(props);
  const neon = props.colors[0]!;
  const cool = props.colors[1]!;
  const sunTop = props.colors[2] ?? '#FFFFFF';
  const haze = props.colors[3] ?? neon;
  const night = props.backgroundColor;
  const ink = darken(night, 0.4);
  const backInk = darken(night, 0.7);
  const sun = ofKind('sun')[0]!;
  const horizon = ofKind('horizon')[0]!;
  const ridges = ofKind('ridge');
  const glow = props.neonGlow;
  const shade = props.centerShade;
  // Over gameplay there is nothing to darken: the plate clears the horizon line behind the content.
  const plateClear = transparent ? (x: number) => 1 - 0.85 * shade * getPlateWeight(x, HORIZON_Y) : undefined;
  // Over gameplay the trunks dissolve before the bottom edge, where the game's HUD sits.
  const trunkPaint = transparent
    ? {ink: 'url(#vw-trunk-ink)', rim: 'url(#vw-trunk-rim)', ring: 'url(#vw-trunk-ring)'}
    : undefined;

  // Static per seed and sun position: the ranges never move, only their neon breathes.
  const {mountains, skyClip} = useMemo(() => {
    const ranges = getMountainRidges({seed: props.seed, sunPosition: props.sunPosition});
    // The whole frame minus the mountains (even-odd): the sky layers never paint inside them.
    const clip = `M-100 -100H${WIDTH + 100}V${HEIGHT + 100}H-100Z${pathOf(getMountainOutline(ranges, SKY_CLIP_SINK), true)}`;
    return {mountains: ranges, skyClip: clip};
  }, [props.seed, props.sunPosition]);

  const near = 0.8;
  const columns = Array.from({length: COLUMN_REACH * 2 + 1}, (_, index) => (index - COLUMN_REACH) * COLUMN_STEP);
  const column = (x: number, half: number) =>
    `M${CENTER_X} ${HORIZON_Y} L${(CENTER_X + (x - half) / near).toFixed(1)} ${groundY(near).toFixed(1)}` +
    ` L${(CENTER_X + (x + half) / near).toFixed(1)} ${groundY(near).toFixed(1)} Z`;

  // The disc stays still (stopped at the horizon) and the cuts move over it as rectangles in a
  // small mask the size of the sun: a rectangle's edge is antialiased continuously, where a clip
  // or path edge steps in quarter pixels and makes slow cuts stutter. A cut is born with no
  // height, so it never leaves a seam where it opens.
  const sunDisc = getSkyDiscPath(sun.x, sun.y, sun.size);
  const sunBox = {x: sun.x - sun.size - 2, y: sun.y - sun.size - 2, size: 2 * sun.size + 4};
  const bloomRadius = sun.size * (transparent ? 2.1 : 2.6);

  return (
    <Canvas {...props}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="vw-sky" x1="0" y1="0" x2="0" y2={HORIZON_Y} gradientUnits="userSpaceOnUse">
            <stop stopColor={haze} stopOpacity="0.3" />
            <stop offset="0.26" stopColor={haze} stopOpacity="0.1" />
            <stop offset="0.55" stopColor={haze} stopOpacity="0.06" />
            <stop offset="0.8" stopColor={haze} stopOpacity="0.14" />
            <stop offset="1" stopColor={neon} stopOpacity="0.3" />
          </linearGradient>
          <radialGradient id="vw-aurora">
            <stop stopColor={cool} stopOpacity="0.16" />
            <stop offset="0.5" stopColor={haze} stopOpacity="0.08" />
            <stop offset="1" stopColor={haze} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="vw-ground" x1="0" y1={HORIZON_Y} x2="0" y2={HEIGHT} gradientUnits="userSpaceOnUse">
            <stop stopColor={neon} stopOpacity="0.3" />
            <stop offset="0.05" stopColor={neon} stopOpacity="0.15" />
            <stop offset="0.16" stopColor={haze} stopOpacity="0.11" />
            <stop offset="0.45" stopColor={haze} stopOpacity="0.04" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.3" />
          </linearGradient>
          {/* The disc's gradients span the whole disc, whichever bands are lit. */}
          <linearGradient id="vw-sun-warm" x1="0" y1={sun.y - sun.size} x2="0" y2={sun.y + sun.size} gradientUnits="userSpaceOnUse">
            <stop stopColor={sunTop} />
            <stop offset="0.48" stopColor={neon} />
            <stop offset="0.86" stopColor={haze} />
          </linearGradient>
          <linearGradient id="vw-sun-dusk" x1="0" y1={sun.y - sun.size} x2="0" y2={sun.y + sun.size} gradientUnits="userSpaceOnUse">
            <stop stopColor={neon} />
            <stop offset="0.88" stopColor={haze} />
          </linearGradient>
          {/* The bloom hugs the rim and stays faint inside the disc, so the cuts show the night
              sky through the sun instead of pink on pink. */}
          <radialGradient id="vw-sun-bloom" gradientUnits="userSpaceOnUse" cx={sun.x} cy={sun.y} r={bloomRadius}>
            <stop offset="0.3" stopColor={neon} stopOpacity="0.14" />
            <stop offset="0.36" stopColor={neon} stopOpacity="0.85" />
            <stop offset="0.43" stopColor={neon} stopOpacity="0.38" />
            <stop offset="0.6" stopColor={haze} stopOpacity="0.15" />
            <stop offset="1" stopColor={haze} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vw-sun-bloom-alpha" gradientUnits="userSpaceOnUse" cx={sun.x} cy={sun.y} r={bloomRadius}>
            <stop offset="0.36" stopColor={neon} stopOpacity="0.1" />
            <stop offset="0.45" stopColor={neon} stopOpacity="0.8" />
            <stop offset="0.53" stopColor={neon} stopOpacity="0.3" />
            <stop offset="0.75" stopColor={neon} stopOpacity="0.06" />
            <stop offset="1" stopColor={neon} stopOpacity="0" />
          </radialGradient>
          {/* The reflection on the floor: a flat, perspective-correct pool of the bloom. */}
          <radialGradient id="vw-sun-reflect">
            <stop offset="0.36" stopColor={neon} stopOpacity="0.85" />
            <stop offset="0.43" stopColor={neon} stopOpacity="0.38" />
            <stop offset="0.6" stopColor={haze} stopOpacity="0.15" />
            <stop offset="1" stopColor={haze} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vw-halo">
            <stop stopColor="#FFFFFF" stopOpacity="0.8" />
            <stop offset="0.3" stopColor={cool} stopOpacity="0.3" />
            <stop offset="1" stopColor={cool} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vw-sparkle-glow">
            <stop stopColor={sunTop} stopOpacity="0.4" />
            <stop offset="1" stopColor={neon} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vw-solid-glow-cool">
            <stop stopColor={cool} stopOpacity="0.26" />
            <stop offset="1" stopColor={cool} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vw-solid-glow-neon">
            <stop stopColor={neon} stopOpacity="0.24" />
            <stop offset="1" stopColor={neon} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="vw-meteor" x1="0" y1="0" x2="1" y2="0">
            <stop stopColor={cool} stopOpacity="0" />
            <stop offset="0.7" stopColor={cool} stopOpacity="0.55" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="vw-row-glow" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor={neon} stopOpacity="0" />
            <stop offset="0.3" stopColor={neon} stopOpacity="0.12" />
            <stop offset="0.5" stopColor={neon} stopOpacity="0.5" />
            <stop offset="0.7" stopColor={neon} stopOpacity="0.12" />
            <stop offset="1" stopColor={neon} stopOpacity="0" />
          </linearGradient>
          {/* Cyan columns under pink rows: the split grid that marks vaporwave. Cyan reads
              brighter than pink, so its peak stays a little lower. Over gameplay the columns
              stay faint along the bottom edge, where the game's HUD sits. */}
          <linearGradient id="vw-column-fade" x1="0" y1={HORIZON_Y} x2="0" y2={HEIGHT} gradientUnits="userSpaceOnUse">
            <stop stopColor={cool} stopOpacity="0" />
            <stop offset={transparent ? 0.08 : 0.04} stopColor={cool} stopOpacity="0.04" />
            <stop offset={transparent ? 0.3 : 0.14} stopColor={cool} stopOpacity="0.19" />
            <stop offset={transparent ? 0.62 : 0.42} stopColor={cool} stopOpacity={transparent ? 0.45 : 0.51} />
            <stop offset="1" stopColor={cool} stopOpacity={transparent ? 0.4 : 0.85} />
          </linearGradient>
          {/* Quieter middle without a mask: a band that is dim everywhere, plus two elliptical
              pools that brighten it towards the frame edges. Over gameplay the plate also clears
              the middle of the line behind the content. */}
          <linearGradient id="vw-horizon-line" x1="0" y1="0" x2={WIDTH} y2="0" gradientUnits="userSpaceOnUse">
            {clearedStops(neon, [[0, 1], [0.3, 0.55], [0.5, 0.36], [0.7, 0.55], [1, 1]], plateClear)}
          </linearGradient>
          <linearGradient id="vw-horizon-core" x1="0" y1="0" x2={WIDTH} y2="0" gradientUnits="userSpaceOnUse">
            {clearedStops('#FFFFFF', [[0, 0.55], [0.5, 0.15], [1, 0.55]], plateClear)}
          </linearGradient>
          <linearGradient id="vw-horizon-band" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor={neon} stopOpacity="0" />
            <stop offset="0.5" stopColor={neon} stopOpacity="0.7" />
            <stop offset="1" stopColor={neon} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="vw-haze-band" x1="0" y1={HORIZON_Y - 190} x2="0" y2={HORIZON_Y} gradientUnits="userSpaceOnUse">
            <stop stopColor={neon} stopOpacity="0" />
            <stop offset="1" stopColor={neon} stopOpacity="0.32" />
          </linearGradient>
          {[0, WIDTH].map((cx) => (
            <radialGradient key={cx} id={`vw-side-${cx}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1"
              gradientTransform={`translate(${cx} ${HORIZON_Y}) scale(${WIDTH / 2} 190)`}>
              <stop stopColor={neon} stopOpacity="0.32" />
              <stop offset="0.6" stopColor={neon} stopOpacity="0.09" />
              <stop offset="1" stopColor={neon} stopOpacity="0" />
            </radialGradient>
          ))}
          {[0, WIDTH].map((cx) => (
            <radialGradient key={cx} id={`vw-side-glow-${cx}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1"
              gradientTransform={`translate(${cx} ${HORIZON_Y}) scale(${WIDTH / 2} 22)`}>
              <stop stopColor={neon} stopOpacity="0.7" />
              <stop offset="0.6" stopColor={neon} stopOpacity="0.2" />
              <stop offset="1" stopColor={neon} stopOpacity="0" />
            </radialGradient>
          ))}
          <linearGradient id="vw-wire-cool" x1="0" y1={WIRE_TOP} x2="0" y2={HORIZON_Y} gradientUnits="userSpaceOnUse">
            <stop stopColor={cool} />
            <stop offset="1" stopColor={cool} stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="vw-wire-neon" x1="0" y1={WIRE_TOP} x2="0" y2={HORIZON_Y} gradientUnits="userSpaceOnUse">
            <stop stopColor={neon} />
            <stop offset="1" stopColor={neon} stopOpacity="0.15" />
          </linearGradient>
          {/* Skylines fade out just above the horizon: a foothill that runs along it never
              strokes the horizon line in another colour. */}
          {[['cool', cool], ['neon', neon]].map(([name, color]) => (
            <linearGradient key={name} id={`vw-ridge-${name}`} x1="0" y1={HORIZON_Y - 16} x2="0" y2={HORIZON_Y - 3}
              gradientUnits="userSpaceOnUse">
              <stop stopColor={color} />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          ))}
          {/* Over gameplay the plate clears the far hills behind the content, as it clears the sun. */}
          <linearGradient id="vw-far-clear" x1="0" y1="0" x2={WIDTH} y2="0" gradientUnits="userSpaceOnUse">
            {clearedStops(night, [[0, 1], [1, 1]], (x) => 1 - 0.85 * shade * getPlateWeight(x, HORIZON_Y - 12))}
          </linearGradient>
          {transparent && ([['ink', ink], ['rim', neon], ['ring', haze]] as const).map(([name, color]) => (
            <linearGradient key={name} id={`vw-trunk-${name}`} x1="0" y1={PALM_ALPHA_FADE.from} x2="0" y2={PALM_ALPHA_FADE.to}
              gradientUnits="userSpaceOnUse">
              <stop stopColor={color} />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          ))}
          <linearGradient id="vw-far-shade" x1="0" y1="690" x2="0" y2={HORIZON_Y} gradientUnits="userSpaceOnUse">
            <stop stopColor={haze} stopOpacity="0.3" />
            <stop offset="1" stopColor={haze} stopOpacity="0.12" />
          </linearGradient>
          <mask id="vw-sun-cuts" maskUnits="userSpaceOnUse" x={sunBox.x} y={sunBox.y} width={sunBox.size} height={sunBox.size}>
            <rect x={sunBox.x} y={sunBox.y} width={sunBox.size} height={sunBox.size} fill="#FFFFFF" />
            {ofKind('sunCut').map((cut, index) => cut.size > 0 && (
              <rect key={index} x={sunBox.x} y={px(cut.y - cut.size / 2)} width={sunBox.size} height={px(cut.size)} fill="#000000" />
            ))}
          </mask>
          <clipPath id="vw-sky-clip">
            <path d={skyClip} clipRule="evenodd" />
          </clipPath>
          <clipPath id="vw-below-horizon">
            <rect y={HORIZON_Y} width={WIDTH} height={HEIGHT - HORIZON_Y} />
          </clipPath>
          <PlateDefs id="vw-plate" color={night} />
        </defs>

        {!transparent && (
          <>
            <rect width={WIDTH} height={HORIZON_Y} fill="url(#vw-sky)" />
            <ellipse cx={WIDTH - sun.x} cy="-40" rx="760" ry="330" fill="url(#vw-aurora)" />
          </>
        )}

        {/* Everything behind the mountains is clipped out of them: over gameplay the ranges
            are translucent, and the sun, the stars and the haze must not show through. */}
        <g clipPath="url(#vw-sky-clip)">
          {ofKind('star').map((star, index) => (
            <g key={index} opacity={star.opacity}>
              {star.glow > 0 && <circle cx={star.x} cy={star.y} r={star.size * 5} fill="url(#vw-halo)" opacity="0.5" />}
              <circle cx={star.x} cy={star.y} r={star.size} fill="#F4F1FF" />
            </g>
          ))}
          {ofKind('sparkle').map((sparkle, index) => (
            <Sparkle key={index} sparkle={sparkle} color={sparkle.variant ? '#FFFFFF' : sunTop} glowId="vw-sparkle-glow" />
          ))}

          {!transparent && <ContentPlate id="vw-plate" color={night} strength={0.85 * shade} />}

          {ofKind('meteor').map((meteor, index) => (
            <g key={index} transform={`translate(${meteor.x} ${meteor.y}) rotate(${meteor.angle})`} opacity={meteor.opacity}>
              {meteor.length > 1 && <path d={`M${-meteor.length} 0 L0 -1.5 L0 1.5 Z`} fill="url(#vw-meteor)" />}
              <circle r={meteor.size * METEOR_HALO} fill="url(#vw-halo)" />
              <circle r={meteor.size} fill="#FFFFFF" />
            </g>
          ))}

          {/* The bloom stops at the horizon: under it the floor only takes the flat reflection. */}
          <g opacity={sun.opacity}>
            <path d={getSkyDiscPath(sun.x, sun.y, bloomRadius)}
              fill={`url(#vw-sun-bloom${transparent ? '-alpha' : ''})`} opacity={sun.glow * (0.55 + 0.45 * glow)} />
            <g mask="url(#vw-sun-cuts)">
              <path d={sunDisc} fill="url(#vw-sun-dusk)" />
              <path d={sunDisc} fill="url(#vw-sun-warm)" opacity={sun.warmth} />
            </g>
          </g>

          <g opacity={0.6 + 0.4 * glow}>
            {!transparent && <rect y={HORIZON_Y - 190} width={WIDTH} height="190" fill="url(#vw-haze-band)" opacity="0.36" />}
            <rect y={HORIZON_Y - 190} width={WIDTH / 2} height="190" fill={`url(#vw-side-0)`} />
            <rect x={WIDTH / 2} y={HORIZON_Y - 190} width={WIDTH / 2} height="190" fill={`url(#vw-side-${WIDTH})`} />
          </g>
        </g>

        <g opacity={transparent ? ALPHA_MOUNTAIN_OPACITY : 1}>
          <path d={`${pathOf(mountains.far)} L${WIDTH + 60} ${HORIZON_Y} L-60 ${HORIZON_Y} Z`}
            fill={transparent ? 'url(#vw-far-clear)' : night} />
          {!transparent && <path d={`${pathOf(mountains.far)} L${WIDTH + 60} ${HORIZON_Y} L-60 ${HORIZON_Y} Z`} fill="url(#vw-far-shade)" />}
          <path d={pathOf(mountains.far)} stroke={haze} strokeWidth="2" fill="none" opacity={0.35 * ridges[2]!.glow} />
          {mountains.ranges.map((range, index) => (
            <Mountains key={index} range={range} night={night} facet={haze}
              ridgePaint={range.back ? 'url(#vw-ridge-neon)' : 'url(#vw-ridge-cool)'}
              wireFade={range.back ? 'url(#vw-wire-neon)' : 'url(#vw-wire-cool)'}
              glow={glow * ridges[index % 2]!.glow} />
          ))}
        </g>
        {/* Over gameplay the front skylines are drawn again at full strength, so the neon stays
            crisp on the translucent ranges; the back ones stay hidden behind the front bodies. */}
        {transparent && mountains.ranges.map((range, index) => !range.back && (
          <RidgeLine key={index} range={range} paint="url(#vw-ridge-cool)" glow={glow * ridges[index % 2]!.glow} />
        ))}

        {!transparent && <rect y={HORIZON_Y} width={WIDTH} height={HEIGHT - HORIZON_Y} fill="url(#vw-ground)" />}
        <ellipse cx={sun.x} cy={HORIZON_Y + 30} rx={sun.size * 1.5} ry="60" fill="url(#vw-sun-reflect)"
          opacity={0.35 * sun.glow * sun.opacity} />

        <g opacity={0.5 + 0.5 * glow}>
          {columns.map((x, index) => (
            <path key={index} d={column(x, 12)} fill="url(#vw-column-fade)" opacity="0.14" />
          ))}
        </g>
        {columns.map((x, index) => (
          <path key={index} d={column(x, 2.4)} fill="url(#vw-column-fade)" />
        ))}

        {ofKind('row').map((row, index) => row.opacity > 0 && row.y - row.length < HEIGHT && (
          <g key={index} opacity={row.opacity}>
            <rect y={row.y - row.length} width={WIDTH} height={row.length * 2} fill="url(#vw-row-glow)" opacity={0.35 + 0.65 * glow} />
            <rect y={row.y - row.size / 2} width={WIDTH} height={row.size} fill={neon} />
          </g>
        ))}

        {!transparent && (
          <g clipPath="url(#vw-below-horizon)">
            <ContentPlate id="vw-plate" color={night} strength={0.5 * shade} />
          </g>
        )}

        <g opacity={horizon.glow}>
          <g opacity={0.35 + 0.65 * glow}>
            {!transparent && <rect y={horizon.y - 22} width={WIDTH} height="44" fill="url(#vw-horizon-band)" opacity="0.36" />}
            <rect y={horizon.y - 22} width={WIDTH / 2} height="44" fill={`url(#vw-side-glow-0)`} />
            <rect x={WIDTH / 2} y={horizon.y - 22} width={WIDTH / 2} height="44" fill={`url(#vw-side-glow-${WIDTH})`} />
          </g>
          <rect y={horizon.y - 1.5} width={WIDTH} height="3" fill="url(#vw-horizon-line)" />
          <rect y={horizon.y - 0.75} width={WIDTH} height="1.5" fill="url(#vw-horizon-core)" />
        </g>

        {[...ofKind('palm')].sort((a, b) => b.variant - a.variant).map((palm, index) => (
          <Palm key={index} shape={getPalmShape(palm)} sunX={sun.x} sunY={sun.y} ink={ink} backInk={backInk} rim={neon}
            ringColor={haze} glow={glow} trunkPaint={trunkPaint} />
        ))}

        {/* The upper pair alternates cyan and pink over the sky; the lower pair floats over
            the floor, where the pink rows pass behind it, so it stays cyan to read against them. */}
        {ofKind('shape').map((shape, index) => (
          <Polyhedron key={index} shape={shape} edge={index === 1 ? neon : cool} face={haze}
            backing={transparent ? haze : ink} backingOpacity={transparent ? 0.2 : 0.62}
            glowId={index === 1 ? 'vw-solid-glow-neon' : 'vw-solid-glow-cool'} />
        ))}
      </svg>
    </Canvas>
  );
};

export const VaporwaveLoop = (props: VaporwaveLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return <VaporwaveArtwork props={props} frame={frame} durationInFrames={durationInFrames} />;
};
