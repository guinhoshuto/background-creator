import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';
import {
  buildWebGeometry, flexPoint, OrbWeb, Spider, SPIDER_REACH, TIP_BEAD_REACH, TipBead, wrapAngle, type Point, type WebGeometry,
} from './halloween/CobwebArtwork';

export const cobwebLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(12),
  // Schema, Root literal and preset carry the same seed, so an omitted key never surprises.
  seed: baseBackgroundSchema.shape.seed.default(47),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#100B1B'),
  colors: baseBackgroundSchema.shape.colors.default(['#CFC6E4', '#F6EFD8', '#E8963C'])
    .describe('Paleta: seda, luar e destaque âmbar; a terceira cor é opcional'),
  webCount: z.number().int().min(0).max(4).default(4).describe('Teias ancoradas nos cantos'),
  strandCount: z.number().int().min(0).max(24).default(12).describe('Fios de seda soltos'),
  moteCount: z.number().int().min(0).max(120).default(40).describe('Partículas de poeira'),
  spiderCount: z.number().int().min(0).max(3).default(1).describe('Aranhas penduradas'),
  dewIntensity: z.number().finite().min(0).max(1).default(0.7).describe('Brilho das gotas de orvalho'),
  mistIntensity: z.number().finite().min(0).max(1).default(0.5).describe('Intensidade da névoa'),
});

export type CobwebLoopProps = z.infer<typeof cobwebLoopSchema>;

export type CobwebElement = {
  kind: 'web' | 'dew' | 'strand' | 'spider' | 'mote' | 'mist';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  glow: number;
  /** Leg articulation for the spider; a constant for every other layer. */
  curl: number;
  /** Length of the silk line above a hanging spider. */
  thread: number;
  /** Frame x where that silk is tied; the body sways, the knot stays put. */
  anchorX: number;
  /** The spider's gait as a sine and cosine scaled by its stride: a raw phase would jump at the seam. */
  stepSin: number;
  stepCos: number;
  /** Where the moonlight band sits across a web's fan, 0 at its first radial and 1 at its last. */
  glint: number;
  /** How a strand bows: the sign, fixed per strand, picks the side; the size lags its swing. */
  bend: number;
  /** How far the breeze bends a web this frame: the wind where its hub is tied. */
  billow: number;
  geometry?: WebGeometry;
};

const element = (kind: CobwebElement['kind'], values: Partial<CobwebElement>): CobwebElement => ({
  kind, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, glow: 1, curl: 0, thread: 0, anchorX: 0, stepSin: 0, stepCos: 0,
  glint: 0, bend: 0, billow: 0, ...values,
});

/** A smooth bump once per turn of `angle`, 1 at its peak and narrower as `sharpness` grows. */
export const gust = (angle: number, sharpness: number) => Math.exp(sharpness * (Math.cos(angle) - 1));

/**
 * One breeze for the whole scene: a gust, a weaker puff after it, then calm. It crosses the
 * frame from left to right in about a third of the cycle, so the left webs billow first and
 * the hero web last. It runs from about −0.56 in the calm to 1 at the peak. Every layer
 * samples it at its own resting x, never the animated one, so no motion feeds back into itself.
 */
export const wind = (phase: number, x: number) => {
  const delay = 0.35 * TAU * x / 1920;
  return (0.7 * gust(phase - 1.2 - delay, 2.5) + 0.3 * gust(phase * 2 - 0.4 - delay * 2, 1.5) - 0.28) / 0.46;
};

/**
 * Corner anchors, ordered by role: the moonlit hero that holds the spider, its
 * counterweight across the diagonal, then the two quieter corners. So webCount 1 keeps
 * the lit web and webCount 2 frames the content from opposite corners. The hubs stay
 * pinned, and each web breathes at its own amplitude and phase, so the four never move
 * as one sheet.
 */
const WEB_ANCHORS = [
  // The hero stops at 630: at 650 some seeds bring its rim within a few pixels of the content area.
  {x: 2010, y: -60, radius: 630, tilt: TAU / 4 + 0.14, spread: 1.33, spokes: 12, rings: 10, depth: 1,
    sag: 0.24, looseSpoke: 3, frameShift: -1, warm: false, breath: 0.009, phase: 2.2},
  {x: -100, y: 1170, radius: 540, tilt: -TAU / 4 + 0.13, spread: 1.34, spokes: 9, rings: 7, depth: 0.92,
    sag: 0.24, looseSpoke: null, frameShift: -1, warm: true, breath: 0.0075, phase: 1.1},
  {x: -106, y: -76, radius: 610, tilt: 0.06, spread: 1.46, spokes: 10, rings: 8, depth: 0.94,
    sag: 0.24, looseSpoke: 6, frameShift: 0, warm: false, breath: 0.006, phase: 0},
  {x: 2020, y: 1140, radius: 480, tilt: TAU / 2 + 0.1, spread: 1.36, spokes: 8, rings: 7, depth: 0.9,
    sag: 0.24, looseSpoke: null, frameShift: 0, warm: false, breath: 0.005, phase: 4.3},
];

/** The one light in the scene: a moon at the top edge near the top-right corner, behind the hero web. */
export const MOON = {x: 1640, y: 40};
/** Its halo, the only moonlight a transparent export keeps; it stops short of the content area. */
export const MOON_HALO_RADIUS = 260;
/** A low amber light below the bottom edge, warming the bottom-left web from underneath. */
export const EMBER = {x: 620, y: 1120};
/** The ember in a transparent export: a band under the content area; its peak alpha (0.25) is half the moon halo's. */
export const TRANSPARENT_EMBER = {x: 620, y: 1160, rx: 640, ry: 200};
/** Radii of a mist bank at scale 1; the bank breathes by at most 3%. */
export const MIST_BANK = {rx: 620, ry: 150};
/** How far a dew drop draws from its centre, per unit of its scale: the flare arm, longer than the halo. */
export const DEW_REACH = 8;

/** A hanging strand at scale 1: its knot above the top edge, its length and how far its middle bows. */
export const STRAND = {knotY: -40, length: 210, bow: 22};
/**
 * A strand's quadratic in its own units, before the swing turns it: the middle bows with
 * `bend`, the tip keeps to the side the bend's sign picks. The scene, the component and the
 * tests all read this one shape.
 */
export const strandCurve = ({scale, bend}: {scale: number; bend: number}) => {
  const length = STRAND.length * scale;
  const bow = Math.sign(bend) * STRAND.bow * scale;
  return {control: {x: STRAND.bow * scale * bend, y: length * 0.55}, tip: {x: bow * 0.4, y: length}};
};

const fract = (value: number) => value - Math.floor(value);
const smootherstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/**
 * Each spider hangs `drop ± range` below its knot. `lag` staggers the three performances,
 * so no two let go together; spider 0 starts at rest, so it sits still across the seam.
 */
export const SPIDER_ANCHORS = [
  {x: 1540, y: -30, drop: 292, range: 64, scale: 1, lag: 0},
  {x: 322, y: -30, drop: 214, range: 48, scale: 0.78, lag: 0.36},
  {x: 1760, y: -30, drop: 158, range: 36, scale: 0.62, lag: 0.7},
];

/** How fast the spider still falls when its line catches it, in units of `level` per drop. */
export const CATCH = 1.3;
/**
 * The bounce's amplitude, in units of `level`, and a bound on how far the line stretches
 * past the bottom of the drop. It leaves at the speed the drop arrives with: the drop lasts
 * 0.12 of the cycle, the bounce 0.16, and sin(4πs) starts at slope 4π.
 */
export const BOUNCE = CATCH * 0.16 / (0.12 * 4 * Math.PI);

/**
 * One performance per cycle: rest at the top, let go, get caught by the stretched line and
 * bounce, rest at the bottom, then haul back up in four hitches and rest again. `level`
 * runs from 0 at the top to 1 at the bottom; `fall` and `pull` say how hard the legs are
 * working, and sin² starts and stops them without a jolt.
 */
export const spiderTimeline = (u: number) => {
  if (u < 0.12) return {level: 0, fall: 0, pull: 0};
  if (u < 0.24) {
    // s³(s − 1) leaves the start untouched but keeps the spider falling when the line
    // catches it: a drop that eased to a stop would have nothing to bounce with.
    const s = (u - 0.12) / 0.12;
    return {level: smootherstep(s) + CATCH * s ** 3 * (s - 1), fall: Math.sin(Math.PI * s) ** 2, pull: 0};
  }
  if (u < 0.4) {
    // The line overshoots, throws the spider back up and the bounces die out; whole
    // periods and (1 − s) bring it to rest at the bottom.
    const s = (u - 0.24) / 0.16;
    return {level: 1 + BOUNCE * Math.exp(-2.5 * s) * Math.sin(4 * Math.PI * s) * (1 - s), fall: 0, pull: 0};
  }
  if (u < 0.52) return {level: 1, fall: 0, pull: 0};
  if (u < 0.92) {
    // Each hitch hauls for 0.065 of the cycle, then holds for 0.035.
    const hitch = Math.min(3, Math.floor((u - 0.52) / 0.1));
    const local = (u - 0.52) / 0.1 - hitch;
    const haul = Math.min(1, local / 0.65);
    return {level: 1 - 0.25 * (hitch + smootherstep(haul)), fall: 0, pull: local < 0.65 ? Math.sin(Math.PI * haul) ** 2 : 0};
  }
  return {level: 0, fall: 0, pull: 0};
};

/**
 * How far a spider swings on its line, either way, and how much further the gust pushes it
 * at full strength; the wind never passes 1 either way, so their sum is the widest swing.
 * The body lags the swing by up to 0.8° more.
 */
export const SPIDER_SWING = 2.2 * Math.PI / 180;
export const SPIDER_GUST = 1 * Math.PI / 180;
const SPIDER_TILT = SPIDER_SWING + SPIDER_GUST + 0.8 * Math.PI / 180;

// Every spider line, never sliced by spiderCount, so a web never depends on it. Each one
// runs down to the lowest point its spider's legs reach, bounce included.
const DRAGLINES = SPIDER_ANCHORS.map(({x, y, drop, range, scale}) => ({
  x, bottom: y + drop + range * (1 + 2 * BOUNCE) + SPIDER_REACH.bottom * scale,
}));

// The column each spider's legs sweep over its whole performance, again from the full
// list, so the strands never depend on spiderCount: how far they reach to either side of
// the line at the lowest, widest swing, and the highest they climb, both with the body tilted.
const SPIDER_COLUMNS = SPIDER_ANCHORS.map(({x, y, drop, range, scale}) => {
  const tilt = Math.sin(SPIDER_TILT);
  return {
    x,
    half: (SPIDER_REACH.side + SPIDER_REACH.bottom * tilt) * scale
      + Math.sin(SPIDER_SWING + SPIDER_GUST) * (drop + range * (1 + 2 * BOUNCE)),
    top: y + drop - range - (SPIDER_REACH.top + SPIDER_REACH.side * tilt) * scale,
  };
});

/** Every animated property lives here, so the seam tests cover the entire scene. */
export const getCobwebScene = (
  props: CobwebLoopProps,
  frame: number,
  durationInFrames: number,
): CobwebElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  const cycle = phase / TAU;
  // Separate streams keep changing a count from rearranging the other layers.
  const strandRandom = createSeededRandom(props.seed + 137);
  const moteRandom = createSeededRandom(props.seed + 421);
  const dewRandom = createSeededRandom(props.seed + 613);

  const activeAnchors = WEB_ANCHORS.slice(0, props.webCount);
  const webs = activeAnchors.map((anchor, index) => {
    const offset = anchor.phase;
    const billow = wind(phase, anchor.x);
    return element('web', {
      // Silk tied to a corner does not slide: the hub stays put and only the sheet moves.
      x: anchor.x,
      y: anchor.y,
      // The breath only contracts, so the rim never swells toward the content area.
      scale: 1 - anchor.breath * (1 - Math.cos(phase * 2 + offset)) / 2,
      rotation: Math.sin(phase + offset) * 0.3,
      // Depth stays at 0.9 or above: this opacity also fades the dark underline that
      // keeps a transparent export legible over light footage.
      opacity: (0.86 + Math.sin(phase + offset) * 0.06) * anchor.depth,
      glow: 0.55 + Math.sin(phase + offset * 1.5) * 0.4,
      // A band of moonlight sweeps the fan and a little past both edges, there and back
      // twice a cycle, the way light slides over a sheet tilting in the air; a gust tilts it further.
      glint: 0.5 + Math.sin(phase * 2 + offset) * 0.8 + 0.2 * billow,
      billow,
      geometry: buildWebGeometry({
        spokes: anchor.spokes,
        rings: anchor.rings,
        radius: anchor.radius,
        spread: anchor.spread,
        tilt: anchor.tilt,
        sag: anchor.sag,
        looseSpoke: anchor.looseSpoke,
        frameShift: anchor.frameShift,
        bounds: {minX: -anchor.x, minY: -anchor.y, maxX: 1920 - anchor.x, maxY: 1080 - anchor.y},
        draglines: DRAGLINES.map(({x, bottom}) => ({x: x - anchor.x, bottom: bottom - anchor.y})),
        seed: props.seed + index * 53,
      }),
    });
  });

  // Dew sits on the silk: positions follow each web's own sway, breath and billow.
  const dew = webs.flatMap((web, index) => {
    const radians = web.rotation * TAU / 360;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    // Visibility is decided on the resting web, never on the swaying one, so the
    // number of drops is the same on every frame of the cycle.
    const anchor = activeAnchors[index]!;
    const {nodes, tilt, spread} = web.geometry!;
    const visible = nodes.filter((node) =>
      anchor.x + node.x > -14 && anchor.x + node.x < 1934
      && anchor.y + node.y > -14 && anchor.y + node.y < 1094);
    return visible.map((node) => {
      const offset = dewRandom() * TAU;
      const bent = flexPoint(web.geometry!, node, web.billow);
      const nodeX = bent.x * web.scale;
      const nodeY = bent.y * web.scale;
      // Where the drop sits across the fan, on the band's own 0-to-1 scale, nudged a little
      // so the drops along one radial do not all flash on the same frame.
      const across = wrapAngle(Math.atan2(node.y, node.x) - tilt) / spread + (offset / TAU - 0.5) * 0.3;
      // A drop flashes briefly as the band crosses it and keeps a steady sparkle between passes.
      const flash = Math.exp(10 * (Math.cos(Math.PI * (across - web.glint)) - 1));
      return element('dew', {
        x: web.x + nodeX * cos - nodeY * sin,
        y: web.y + nodeX * sin + nodeY * cos,
        scale: (0.85 + node.depth * 1.05) * (1 + flash * 0.35),
        opacity: props.dewIntensity * (0.5 + flash * 0.5),
        glow: flash,
      });
    });
  });

  const knots: number[] = [];
  const strands = Array.from({length: props.strandCount}, () => {
    const offset = strandRandom() * TAU;
    // A fixed number of tries, as for the dust: two knots side by side read as one doubled
    // thread, and a spider's line counts as one more knot, so no strand hugs it. When every
    // try is too close, the roomiest one wins. A wider berth for the lines crowds 12 strands
    // into the middle; the length below keeps the spiders clear instead.
    let x = 0;
    let room = -1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = randomBetween(strandRandom, 70, 1850);
      const gap = Math.min(...[...knots, ...SPIDER_ANCHORS.map((spider) => spider.x)].map((other) => Math.abs(other - candidate)));
      if (gap > room) [x, room] = [candidate, gap];
      if (gap > 46) break;
    }
    knots.push(x);
    // Longest at the sides and shortest over the middle, so the tips frame the content
    // area instead of reaching for it.
    const size = (0.62 + 0.5 * Math.min(1, Math.abs(x - 960) / 900)) * randomBetween(strandRandom, 0.82, 1.18);
    // Within reach of a spider's column, however far its end swings (0.3 of its length is
    // more than lean and swing need, with room for a gust), a strand ends 20 px above the
    // highest the legs ever climb, bead included, so it never hangs through the spider.
    const scale = Math.min(1.25, size, ...SPIDER_COLUMNS
      .filter((column) => Math.abs(column.x - x) < column.half + 0.3 * STRAND.length * size + TIP_BEAD_REACH)
      .map((column) => (column.top - TIP_BEAD_REACH - 20 - STRAND.knotY) / STRAND.length));
    // A bead-weighted thread hangs close to plumb.
    const lean = randomBetween(strandRandom, -6, 6);
    // Short threads flutter faster than long ones, and the gust carries every tip toward +x.
    const beat = scale >= 0.8 ? 2 : 3;
    const swing = (at: number) => Math.sin(at * beat + offset) * 2 - 3 * wind(at, x);
    const rate = (swing(phase + 1e-3) - swing(phase - 1e-3)) / 2e-3;
    // Every filament hangs from a fixed knot above the top edge and swings about it, with
    // its bead at the low, free end.
    return element('strand', {
      x,
      y: STRAND.knotY,
      scale,
      rotation: lean + swing(phase),
      // The bow's side comes from the lean, never from the swinging angle, or it would flip
      // mid-swing. Its middle trails the swing: a growing rotation carries the tip toward −x,
      // so the middle falls behind toward +x, whichever side the thread bows to.
      bend: (lean < 0 ? -1 : 1) + Math.tanh(rate / 12) * 0.5,
      opacity: 0.2 + (1 + Math.sin(phase + offset)) * 0.11,
      glow: 0.45 + Math.sin(phase * 2 + offset) * 0.3,
    });
  });

  const spiders = SPIDER_ANCHORS.slice(0, props.spiderCount).map((anchor, index) => {
    const offset = index * 1.9;
    const {level, fall, pull} = spiderTimeline(fract(cycle - anchor.lag));
    const drop = anchor.drop - anchor.range + 2 * anchor.range * level;
    // A pendulum: the swing angle is fixed, so the spider sways further at the end of a
    // longer line, and the body hangs along its line with a little lag. The gust pushes it downwind.
    const swing = SPIDER_SWING * Math.sin(phase * 2 + offset) + SPIDER_GUST * wind(phase, anchor.x);
    const dx = Math.sin(swing) * drop;
    // The legs barely stir at rest and step while the spider falls or climbs.
    const stride = 0.3 + 0.7 * (fall + pull);
    return element('spider', {
      x: anchor.x + dx,
      y: anchor.y + drop,
      scale: anchor.scale,
      rotation: -Math.atan2(dx, drop) * 180 / Math.PI - 0.8 * Math.sin(phase * 2 + offset - 0.5),
      opacity: 0.97,
      // Legs stretch as it falls and tuck in as it hauls itself up.
      curl: 0.55 + 0.3 * fall - 0.35 * pull,
      thread: drop,
      anchorX: anchor.x,
      glow: 0.6 + Math.sin(phase + offset) * 0.35,
      stepSin: stride * Math.sin(phase * 3 + offset),
      stepCos: stride * Math.cos(phase * 3 + offset),
    });
  });

  const placed: {x: number; y: number}[] = [];
  const motes = Array.from({length: props.moteCount}, () => {
    const offset = moteRandom() * TAU;
    // Rejection sampling with a fixed number of tries: deterministic, and the count never drifts.
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      x = randomBetween(moteRandom, 60, 1860);
      y = randomBetween(moteRandom, 60, 1020);
      if (placed.every((other) => Math.hypot(other.x - x, other.y - y) > 42)) break;
    }
    placed.push({x, y});
    // Depth sets size, wander and rise together: a near mote is bigger, wanders further and
    // climbs faster than a far one, so the dust has parallax.
    const depth = moteRandom();
    const [p1, p2, p3] = [moteRandom() * TAU, moteRandom() * TAU, moteRandom() * TAU];
    // Either handedness, and half of them bob twice as fast, so no two motes trace one loop.
    const turn = moteRandom() < 0.5 ? -1 : 1;
    const bob = moteRandom() < 0.5 ? 1 : 2;
    // Each mote rises through a life of one cycle and starts again from below while it is
    // invisible; its start is never at the seam, where the jump would break the loop.
    const start = randomBetween(moteRandom, 0.05, 0.95);
    const life = fract(cycle + start);
    const wander = 8 + 30 * depth;
    return element('mote', {
      // The gust carries the near dust further than the far.
      x: x + wander * Math.sin(phase + p1) + 0.4 * wander * turn * Math.sin(phase * 2 + p2) + 12 * wind(phase, x) * depth,
      y: y + wander * Math.cos(phase * bob + p3) - (40 + 100 * depth) * (life - 0.5),
      scale: 0.8 + 1.6 * depth,
      // Flat through most of the life, easing to nothing at both ends with no jolt.
      opacity: (0.09 + (1 + Math.sin(phase * 2 + offset)) * 0.2) * smootherstep(life / 0.12) * smootherstep((1 - life) / 0.12),
      glow: 0.5 + Math.sin(phase + offset) * 0.4,
    });
  });

  // A ground bank that only ever drifts right. Each bank hands its place to the next at
  // t = 0.5, never at the seam. Shape follows x alone, so the hand-over changes nothing on
  // screen; with a period of twice the spacing, even the two banks swapped off screen match.
  const drift = fract(0.5 + cycle + Math.sin(phase) * 0.04);
  const mist = Array.from({length: 4}, (_, index) => {
    const x = -720 + 820 * (index + drift);
    const place = x / 1640 * TAU;
    return element('mist', {
      x,
      y: 1010 + Math.sin(place) * 28,
      scale: 1 + Math.sin(place * 0.5 + 1) * 0.03,
      opacity: props.mistIntensity * (0.6 + Math.sin(place + 2) * 0.1),
    });
  });

  return [...mist, ...webs, ...dew, ...strands, ...spiders, ...motes];
};

/** How far a light reaches a point: 1 on top of it, fading smoothly with distance. */
const falloff = (point: Point, light: Point, reach: number) =>
  Math.exp(-((point.x - light.x) ** 2 + (point.y - light.y) ** 2) / reach ** 2);
const smoothstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};
/** Where the bead gradient and specular put their light before a drop is turned to face the moon. */
const BEAD_LIGHT_ANGLE = Math.atan2(-0.4, 0.35) * 180 / Math.PI;

const Strand = ({x, y, scale, rotation, opacity, glow, bend, silk, moonlight, outline}: CobwebElement & {
  silk: string;
  moonlight: string;
  outline: boolean;
}) => {
  // The tip stays put on the thread; only the middle flexes with the swing.
  const {control, tip} = strandCurve({scale, bend});
  const d = `M0 0 Q${control.x.toFixed(2)} ${control.y.toFixed(2)} ${tip.x.toFixed(2)} ${tip.y.toFixed(2)}`;
  // The lit edge faces the moon and the shadow falls away from it, judged from the fixed knot,
  // so neither ever changes side. tanh, not sign: a strand knotted within a few dozen pixels of
  // the moon's x is lit nearly head-on, so its lit edge and shadow stay close to the thread.
  const side = Math.tanh((MOON.x - x) / 40);
  const radians = rotation * TAU / 360;
  const tipX = x + tip.x * Math.cos(radians) - tip.y * Math.sin(radians);
  const tipY = y + tip.x * Math.sin(radians) + tip.y * Math.cos(radians);
  const toMoon = Math.atan2(MOON.y - tipY, MOON.x - tipX) - radians;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`}>
      {/* Transparent exports only, in the webs' proportion of edge to silk: a strand is fainter, so is its edge. */}
      {outline && <path d={d} fill="none" stroke="#120C1C" strokeWidth="3.6" strokeLinecap="round" opacity={0.45 * opacity} />}
      <g opacity={opacity} fill="none" strokeLinecap="round">
        <path d={d} stroke="#17121F" strokeWidth="1.7" opacity="0.16" transform={`translate(${(-1.3 * side).toFixed(2)} 1.3)`} />
        <path d={d} stroke={silk} strokeWidth="1.5" />
        <path d={d} stroke={moonlight} strokeWidth="0.7" opacity={0.5 * glow} transform={`translate(${(0.8 * side).toFixed(2)} 0)`} />
      </g>
      <TipBead {...tip} light={{x: Math.cos(toMoon), y: Math.sin(toMoon)}} opacity={0.45 + 0.4 * glow}
        moonlight={moonlight} halo="url(#cobweb-dew)" />
    </g>
  );
};

/** The whole picture for one frame; CobwebLoop feeds it Remotion's frame, the tests their own. */
export const CobwebFrame = ({props, frame, durationInFrames}: {
  props: CobwebLoopProps; frame: number; durationInFrames: number;
}) => {
  const scene = getCobwebScene(props, frame, durationInFrames);
  const ofKind = (kind: CobwebElement['kind']) => scene.filter((item) => item.kind === kind);
  const silk = props.colors[0]!;
  const moonlight = props.colors[1]!;
  const accent = props.colors[2] ?? props.colors[0]!;
  const transparent = hasTransparentBackground(props);
  // Light adds to the sky; over an empty alpha backdrop there is nothing to screen against.
  const light = transparent ? undefined : {mixBlendMode: 'screen' as const};

  return (
    <Canvas {...props}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
        <defs>
          <radialGradient id="cobweb-sky" gradientUnits="userSpaceOnUse" cx={MOON.x} cy={MOON.y} r="1500">
            <stop stopColor={silk} stopOpacity="0.2" />
            <stop offset="0.3" stopColor={silk} stopOpacity="0.07" />
            <stop offset="0.6" stopColor="#07050D" stopOpacity="0.1" />
            <stop offset="1" stopColor="#07050D" stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id="cobweb-vignette" cx="50%" cy="46%" r="76%">
            <stop offset="0.45" stopColor="#07050D" stopOpacity="0" />
            <stop offset="1" stopColor="#07050D" stopOpacity="0.42" />
          </radialGradient>
          {/* In silk, not cream: cream over lavender mixes to grey fog instead of moonlight. */}
          <radialGradient id="cobweb-moonwash" gradientUnits="userSpaceOnUse" cx={MOON.x} cy={MOON.y} r="820">
            <stop stopColor={silk} stopOpacity="0.2" />
            <stop offset="0.4" stopColor={silk} stopOpacity="0.07" />
            <stop offset="1" stopColor={silk} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cobweb-moonhalo" gradientUnits="userSpaceOnUse" cx={MOON.x} cy={MOON.y} r={MOON_HALO_RADIUS}>
            <stop stopColor={moonlight} stopOpacity="0.5" />
            <stop offset="0.18" stopColor={moonlight} stopOpacity="0.26" />
            <stop offset="0.5" stopColor={moonlight} stopOpacity="0.08" />
            <stop offset="1" stopColor={moonlight} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cobweb-mist">
            <stop stopColor={silk} stopOpacity="0.5" />
            <stop offset="0.5" stopColor={silk} stopOpacity="0.2" />
            <stop offset="1" stopColor={silk} stopOpacity="0" />
          </radialGradient>
          {/* A wide, flat light below the frame: the hot core stays dimmer than the moon halo. */}
          <radialGradient id="cobweb-ember" gradientUnits="userSpaceOnUse" cx={EMBER.x} cy={EMBER.y} r="700"
            gradientTransform={`translate(${EMBER.x} ${EMBER.y}) scale(1.5 0.62) translate(${-EMBER.x} ${-EMBER.y})`}>
            <stop stopColor="#FFD9A0" stopOpacity="0.35" />
            <stop offset="0.12" stopColor={accent} stopOpacity="0.32" />
            <stop offset="0.45" stopColor={accent} stopOpacity="0.1" />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cobweb-ember-band">
            <stop stopColor="#FFD9A0" stopOpacity="0.25" />
            <stop offset="0.2" stopColor={accent} stopOpacity="0.18" />
            <stop offset="0.6" stopColor={accent} stopOpacity="0.05" />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cobweb-dew">
            <stop stopColor={moonlight} stopOpacity="0.55" />
            <stop offset="0.4" stopColor={silk} stopOpacity="0.16" />
            <stop offset="1" stopColor={silk} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cobweb-dew-warm">
            <stop stopColor="#FFE6C2" stopOpacity="0.6" />
            <stop offset="0.4" stopColor={accent} stopOpacity="0.22" />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          {/* Glass: bright where the moon enters, darker through the middle, a refracted rim. */}
          <radialGradient id="cobweb-bead" cx="50%" cy="50%" r="50%" fx="68%" fy="30%">
            <stop stopColor="#FFFFFF" />
            <stop offset="0.3" stopColor={moonlight} stopOpacity="0.85" />
            <stop offset="0.75" stopColor={silk} stopOpacity="0.45" />
            <stop offset="1" stopColor={silk} stopOpacity="0.9" />
          </radialGradient>
          <radialGradient id="cobweb-mote">
            <stop stopColor={moonlight} />
            <stop offset="0.25" stopColor={accent} stopOpacity="0.5" />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          {/* The moonlight's own colour at the core, so a custom palette reaches the dust too. */}
          <radialGradient id="cobweb-mote-cool">
            <stop stopColor={moonlight} />
            <stop offset="0.25" stopColor={moonlight} stopOpacity="0.5" />
            <stop offset="1" stopColor={silk} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* The vignette darkens the sky only; the silk drawn over it keeps its full value. */}
        {!transparent && <rect width="1920" height="1080" fill="url(#cobweb-sky)" />}
        {!transparent && <rect width="1920" height="1080" fill="url(#cobweb-vignette)" />}
        {!transparent && <rect width="1920" height="1080" fill="url(#cobweb-moonwash)" style={light} />}
        <circle cx={MOON.x} cy={MOON.y} r={MOON_HALO_RADIUS} fill="url(#cobweb-moonhalo)" style={light} />

        {ofKind('mist').map((mist, index) => (
          <ellipse key={index} cx={mist.x} cy={mist.y} rx={MIST_BANK.rx * mist.scale} ry={MIST_BANK.ry * mist.scale}
            fill="url(#cobweb-mist)" opacity={mist.opacity} />
        ))}

        {/* The ember is light from below, so it sits under the webs instead of veiling them.
            A transparent export keeps only a faint band along the bottom edge. */}
        {transparent
          ? <ellipse cx={TRANSPARENT_EMBER.x} cy={TRANSPARENT_EMBER.y} rx={TRANSPARENT_EMBER.rx} ry={TRANSPARENT_EMBER.ry}
            fill="url(#cobweb-ember-band)" />
          : <rect width="1920" height="1080" fill="url(#cobweb-ember)" style={light} />}

        {ofKind('web').map((web, index) => (
          web.geometry ? (
            <OrbWeb key={index} geometry={web.geometry} x={web.x} y={web.y} scale={web.scale}
              rotation={web.rotation} opacity={web.opacity} glow={web.glow} glint={web.glint} billow={web.billow}
              silk={silk} moonlight={moonlight} accent={accent} moon={MOON}
              warm={WEB_ANCHORS[index]!.warm ? EMBER : null} outline={transparent} beadHalo="url(#cobweb-dew)"
              id={`cobweb-web-${index}`} />
          ) : null
        ))}

        {ofKind('dew').map((drop, index) => {
          const lit = Math.min(1, 0.45 + 0.9 * falloff(drop, MOON, 900));
          // Warmth comes from where a drop hangs, not from its index; the soft edge keeps a
          // drop on the threshold from switching colour as its web sways.
          const warmth = smoothstep((falloff(drop, EMBER, 560) - 0.3) / 0.1);
          const radius = drop.scale * 2.1;
          const turn = Math.atan2(MOON.y - drop.y, MOON.x - drop.x) * 180 / Math.PI - BEAD_LIGHT_ANGLE;
          // A few drops flare as the light crosses them; the fourth power keeps it brief.
          const flare = index % 3 === 0 ? drop.glow ** 4 * lit : 0;
          return (
            <g key={index} opacity={drop.opacity}>
              <circle cx={drop.x} cy={drop.y} r={drop.scale * 6} fill="url(#cobweb-dew)" opacity={lit * (1 - warmth)} />
              {warmth > 0 && (
                <circle cx={drop.x} cy={drop.y} r={drop.scale * 6} fill="url(#cobweb-dew-warm)" opacity={warmth} />
              )}
              {/* Drawn lit from the upper right, then turned to face the moon. */}
              <g transform={`rotate(${turn.toFixed(2)} ${drop.x} ${drop.y})`}>
                <circle cx={drop.x - radius * 0.25} cy={drop.y + radius * 0.35} r={drop.scale * 2.2} fill="#0A0814" opacity="0.35" />
                <circle cx={drop.x} cy={drop.y} r={radius} fill="url(#cobweb-bead)" />
                <circle cx={drop.x + radius * 0.35} cy={drop.y - radius * 0.4} r={Math.max(0.6, radius * 0.32)}
                  fill="#FFFFFF" opacity={0.6 + 0.4 * lit} />
              </g>
              {flare > 0.01 && (
                <g opacity={flare} fill={moonlight}>
                  <ellipse cx={drop.x} cy={drop.y} rx={drop.scale * DEW_REACH} ry="0.6" />
                  <ellipse cx={drop.x} cy={drop.y} rx="0.6" ry={drop.scale * DEW_REACH} />
                </g>
              )}
            </g>
          );
        })}

        {ofKind('strand').map((strand, index) => (
          <Strand key={index} {...strand} silk={silk} moonlight={moonlight} outline={transparent} />
        ))}

        {ofKind('spider').map((spider, index) => {
          const anchor = SPIDER_ANCHORS[index]!;
          return (
            <Spider key={index} x={spider.x} y={spider.y} scale={spider.scale} rotation={spider.rotation}
              legCurl={spider.curl} stepSin={spider.stepSin} stepCos={spider.stepCos} opacity={spider.opacity}
              thread={spider.thread} anchorX={spider.anchorX} glow={spider.glow}
              // Taken from where the spider hangs at rest, so its light never swings with it.
              light={Math.atan2(MOON.y - anchor.y - anchor.drop, MOON.x - anchor.x)}
              silk={silk} moonlight={moonlight} body="#120C1C" mark={accent} id={`cobweb-spider-${index}`} />
          );
        })}

        {/* Dust has no dark backing: over footage a dark disc around a mote reads as a ring. It
            shows where light falls on it and takes that light's colour: pale in the moonlight,
            amber over the ember, dim in the dark corners. */}
        {ofKind('mote').map((mote, index) => {
          const moon = falloff(mote, MOON, 760);
          const ember = falloff(mote, EMBER, 560);
          const lit = 1 - 0.7 * Math.exp(-2.2 * (moon + ember));
          const warm = ember / (moon + ember + 0.05);
          return (
            <g key={index} opacity={mote.opacity * lit * 1.5}>
              <circle cx={mote.x} cy={mote.y} r={mote.scale * 4} fill="url(#cobweb-mote)" opacity={0.25 + 0.75 * warm} />
              <circle cx={mote.x} cy={mote.y} r={mote.scale * 4} fill="url(#cobweb-mote-cool)" opacity={0.75 * (1 - warm)} />
              <circle cx={mote.x} cy={mote.y} r={mote.scale * 0.5} fill={moonlight} opacity={0.22 + mote.glow * 0.22} />
            </g>
          );
        })}
      </svg>
    </Canvas>
  );
};

export const CobwebLoop = (props: CobwebLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return <CobwebFrame props={props} frame={frame} durationInFrames={durationInFrames} />;
};
