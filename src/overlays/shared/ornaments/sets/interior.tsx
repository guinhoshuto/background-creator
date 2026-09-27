import {getWindowFlash, LIGHTNING_COLOR} from '../../../../backgrounds/halloween/lightning';
import {TAU} from '../../../../loop';
import {MAX_CONTENT_OPACITY} from '../../legibility';
import {cycleOf} from '../../motion';
import {ornamentPalette, ornamentPartId, paint, RadialLight} from '../draw';
import {harmonics, meetsKeepOut, ornamentRandom} from '../place';
import type {OrnamentBase, OrnamentSet} from '../types';
import {
  ARM, armPath, BRACKETS, candleBounds, DISH, dripScale, FLAME_SCALE, flameCorePath, flameOrigin, flamePath, FLICKER, num, SOCKET, WAX, waxTop,
  WICK, type BracketId, type CandleKind, type Point,
} from './interior-candle';
import {
  armOf, bobecheOf, FIXTURE_MARGIN, fixtureBounds, FIXTURES, flameOriginOf, FOOT, PART, STRIKE_DIP, waxTop as fixtureWaxTop,
  type FixtureCup, type FixtureKind, type FixtureMount,
} from './interior-girandole';
import {
  bodyMargin, candleOf, fixtureOf, fixtureOrigin, footOf, lightFor, OUTLINE_MARGIN, placeCandles, scaleOf,
} from './interior-place';
import {Swag, SWAG_MOTIF, SWAG_TASSEL, swagSpecOf, type InteriorSwagElement} from './interior-swag';

/**
 * The interior's ornaments (HauntedInteriorLoop, the haunted hall): brass girandoles, two-light
 * wall girandoles and the curtains' red-velvet swag valance (see interior-place.ts for every size
 * class and interior-swag.tsx for the valance), lit by the
 * background's own flame. Warm candlelight with the hall's cold moon counterpoint: the brass and
 * each wax stick catch a thin moonlit highlight on the right (the moon's side in the background),
 * and at a strike of the storm (getWindowFlash: the same strikes as the background for the same
 * seed and duration) the brass edges facing that window flare cold, a cold light blooms around
 * every fixture, the flames dip, and the valance's velvet and gold flare on that side.
 *
 * ornamentSize is a fixture's full height H, px (mount to the tallest flame tip); the room of its
 * slot usually limits it first (chat ≈ 53, blocks ≈ 62, webcams and jogo ≈ 55). The Twitch panel,
 * too small for a girandole, keeps a chamberstick candle on its sill (the fallback, below).
 *
 * Motion is the background's candle flicker, in Hz so any duration keeps whole cycles: glow 7 and
 * 19 cycles per 16 s, flame height 11, lean 5 and 13; the valance's tassels swing 2 cycles per 16 s. Phases
 * are drawn so that frame 0 (the pack PNG) shows every flame within ±13 % of its mean glow and
 * height and every tassel within ±0.5° of rest.
 */

/** The background's candle rhythms at 16 s, as Hz (HauntedInteriorLoop's getHauntedInteriorScene). */
export const CANDLE_HZ = {glowSlow: 7 / 16, glowFast: 19 / 16, height: 11 / 16, leanSlow: 5 / 16, leanFast: 13 / 16} as const;

/**
 * The candle's colours: the background's hi-flame and hi-wax-warm (HauntedInteriorLoop), the
 * candelabra's brass; the drip, the molten top and the outlines are the set's own.
 */
export const CANDLE_COLORS = {
  flameMid: '#F6D69D', flameBase: '#E2A652', core: '#FBEBC8', wick: '#241A12',
  waxDark: '#77694F', waxLight: '#D1BD93', waxShade: '#5E5441', waxLit: '#F6D69D', drip: '#D8C9A4', molten: '#F2E2B8',
  brass: '#86724E', brassDark: '#5E4F36', brassSide: '#4A3F2B', brassHighlight: '#B1946A', brassLight: '#E8D6A8',
  outline: '#1C160D', waxOutline: '#2A2114', flameOutline: '#3B1F0A',
} as const;

type CandleFields = {
  footX: number; footY: number; u: number; dir: number; kind: string;
  /** Normalised glow, 0–1 (the flicker between its extremes). */
  glow: number;
  /** The lightning on this candle's side, 0–1 (already times `lightning`). */
  flash: number;
  warm: string; rim: string;
  /** The strike's cold light around the flame (alpha; 0 on the body element). */
  cold: number;
};

export type InteriorCandleElement = OrnamentBase & CandleFields & {type: 'interior-candle'; mount: string};
export type InteriorFlameElement = OrnamentBase & CandleFields & {type: 'interior-flame'; lean: number; scale: number};

type FixtureFields = {
  fixture: string; mount: string;
  /** The mount point (px), the fixture's height H (px) and its side (−1 mirrors x). */
  ox: number; oy: number; h: number; dir: number;
  /** The window this fixture faces (−1 left, +1 right) and its lightning, 0–1 (already times `lightning`). */
  side: number; flash: number;
  /** Mean normalised glow of its flames, 0–1. */
  glow: number;
  warm: string; rim: string;
  /** The light's focus (px) on the flames. */
  fx: number; fy: number;
};

export type InteriorFixtureElement = OrnamentBase & FixtureFields & {type: 'interior-fixture'};
/**
 * A fixture's lights and flames: the warm light (light, lightOpacity) and, at a strike, the cold one
 * over it (cold: its alpha, 0.5·flash, capped like the warm one over text, 0 without glow); per cup
 * i (0–2; unused cups are 0) the normalised glow, the lean (path units at the tip) and the vertical
 * scale.
 */
export type InteriorFlamesElement = OrnamentBase & FixtureFields & {
  type: 'interior-flames'; cold: number;
  glow0: number; glow1: number; glow2: number; lean0: number; lean1: number; lean2: number; scale0: number; scale1: number; scale2: number;
};
export type InteriorElement = InteriorCandleElement | InteriorFlameElement | InteriorFixtureElement | InteriorFlamesElement | InteriorSwagElement;

const GLOW_MIN = FLICKER.glowMean - FLICKER.glowSlow - FLICKER.glowFast;
const GLOW_SPAN = 2 * (FLICKER.glowSlow + FLICKER.glowFast);
/** Phase windows (radians) that keep frame 0 near the mean: sin ≈ 0 for the slow glow and the height, cos ≈ 0 for the fast glow. */
const FRAME0_WINDOW = 1;
/** Peak alpha of a candle's light at full glow, and at its dimmest. */
const LIGHT_ALPHA = {min: 0.34, max: 0.58} as const;
/** A fixture's light: alpha at its dimmest and at full glow (focused on its flames). */
const FIXTURE_LIGHT = {min: 0.35, max: 0.58} as const;
/** The cold light a strike blooms around a fixture (and a chamberstick): alpha per unit of flash. */
export const STRIKE_LIGHT = 0.5;
/** The width (px) of the cold rims a strike lights on the window's side. */
const STRIKE_RIM = 2;
/** The valance tassels' swing: cycles per second (whole harmonics of the loop). */
export const TASSEL_HZ = 2 / 16;
/** The tassel's phase window around rest at frame 0: |sin| ≤ 1/6 keeps it within ±0.5°. */
const TASSEL_WINDOW = 2 * Math.asin(1 / 6);

type Harmonics = {glowSlow: number; glowFast: number; height: number; leanSlow: number; leanFast: number};

/** One flame's flicker: eight draws, always, so a flame's phases never depend on the others'. */
const flicker = (random: () => number, k: Harmonics, phase: number) => {
  const near = (base: number) => base + (random() - 0.5) * FRAME0_WINDOW + (random() < 0.5 ? 0 : Math.PI);
  const glowSlowPhase = near(0);
  const glowFastPhase = near(Math.PI / 2);
  const heightPhase = near(0);
  const leanSlowPhase = random() * TAU;
  const leanFastPhase = random() * TAU;
  const raw = FLICKER.glowMean + FLICKER.glowSlow * Math.sin(k.glowSlow * phase + glowSlowPhase)
    + FLICKER.glowFast * Math.cos(k.glowFast * phase + glowFastPhase);
  return {
    glow: (raw - GLOW_MIN) / GLOW_SPAN,
    lean: FLICKER.leanSlow * Math.sin(k.leanSlow * phase + leanSlowPhase) + FLICKER.leanFast * Math.cos(k.leanFast * phase + leanFastPhase),
    scale: FLICKER.scaleMean + FLICKER.scaleSwing * Math.sin(k.height * phase + heightPhase),
  };
};

const set: OrnamentSet<InteriorElement> = {
  name: 'interior',
  seedOffset: 40,
  minExtent: 8,
  place(frame, style) {
    return placeCandles(frame, style.ornamentSize);
  },
  build(frame, placements, style, frameIndex, durationInFrames) {
    const random = ornamentRandom(style.seed, set);
    const phase = TAU * cycleOf(frameIndex, durationInFrames);
    const seconds = style.durationSeconds;
    const k: Harmonics = {
      glowSlow: harmonics(CANDLE_HZ.glowSlow, seconds), glowFast: harmonics(CANDLE_HZ.glowFast, seconds),
      height: harmonics(CANDLE_HZ.height, seconds), leanSlow: harmonics(CANDLE_HZ.leanSlow, seconds), leanFast: harmonics(CANDLE_HZ.leanFast, seconds),
    };
    const swing = harmonics(TASSEL_HZ, seconds);
    const {light: rim, warm} = ornamentPalette(style);
    const [flashLeft, flashRight] = style.lightning > 0 ? getWindowFlash(style, frameIndex, durationInFrames) : [0, 0];
    const middle = frame.outline.x + frame.outline.width / 2;
    const elements: InteriorElement[] = [];
    // A light's alpha where it may meet the text (capped there), 0 without glow.
    const capped = (x: number, y: number, radius: number, alpha: number) =>
      (frame.glow > 0 && radius > 0 ? (meetsKeepOut(frame, x, y, radius) ? Math.min(MAX_CONTENT_OPACITY, alpha) : alpha) : 0);
    const festoons = placements.filter((placement) => placement.motif === SWAG_MOTIF).length;
    let festoon = 0;
    placements.forEach((placement, anchor) => {
      if (placement.motif === SWAG_MOTIF) {
        // Four draws per festoon, always: its two joins' tassel phases (near rest at frame 0).
        const rest = () => (random() - 0.5) * TASSEL_WINDOW + (random() < 0.5 ? 0 : Math.PI);
        const [left, right] = [rest(), rest()];
        const spec = swagSpecOf(frame);
        const index = festoon++;
        const last = index === festoons - 1;
        elements.push({
          type: 'interior-swag', layer: placement.layer, anchor, x: placement.x, y: placement.y, reach: placement.extent,
          light: 0, lightOpacity: 0, opacity: 1, cx: placement.x, jy: placement.y - spec.centre, pitch: spec.pitch, depth: spec.depth, tassel: spec.tassel,
          // Every second join (the run's first and last among them) carries a tassel.
          right: last ? 1 : 0, tasselLeft: index % 2 === 0 ? 1 : 0, tasselRight: last && festoons % 2 === 0 ? 1 : 0,
          angleLeft: SWAG_TASSEL.swing * Math.sin(swing * phase + left), angleRight: SWAG_TASSEL.swing * Math.sin(swing * phase + right),
          flash: style.lightning * (placement.x < middle ? flashLeft : flashRight), rim,
        });
        return;
      }
      const fixture = fixtureOf(placement);
      if (fixture) {
        const bounds = fixtureBounds(fixture.kind, fixture.mount);
        const h = placement.size;
        const origin = fixtureOrigin(placement, bounds.centre, fixture.dir);
        const cups = FIXTURES[fixture.kind].cups;
        const flames = [0, 1, 2].map((index) => (index < cups.length ? flicker(random, k, phase) : {glow: 0, lean: 0, scale: 0}));
        const glow = flames.slice(0, cups.length).reduce((sum, flame) => sum + flame.glow, 0) / cups.length;
        const side = placement.x < middle ? -1 : 1;
        const flash = style.lightning * (side < 0 ? flashLeft : flashRight);
        const shared: FixtureFields = {
          fixture: fixture.kind, mount: fixture.mount, ox: origin.x, oy: origin.y, h, dir: fixture.dir,
          side, flash, glow, warm, rim, fx: origin.x + fixture.dir * h * bounds.focus.x, fy: origin.y + h * bounds.focus.y,
        };
        elements.push({
          type: 'interior-fixture', layer: placement.layer, anchor, x: placement.x, y: placement.y,
          reach: bounds.body * h + FIXTURE_MARGIN, light: 0, lightOpacity: 0, opacity: 1, ...shared,
        });
        // The lights cost no room: discs as large as the fixture's own circle, focused on its flames;
        // the cold one (a strike) over the warm one.
        const light = frame.glow > 0 ? bounds.radius * h + FIXTURE_MARGIN : 0;
        const peak = FIXTURE_LIGHT.min + (FIXTURE_LIGHT.max - FIXTURE_LIGHT.min) * glow;
        elements.push({
          type: 'interior-flames', layer: placement.layer, anchor, x: placement.x, y: placement.y,
          reach: bounds.flames * h + FIXTURE_MARGIN, light, lightOpacity: capped(placement.x, placement.y, light, peak),
          cold: capped(placement.x, placement.y, light, STRIKE_LIGHT * Math.min(1, flash)), opacity: 1, ...shared,
          glow0: flames[0]!.glow, glow1: flames[1]!.glow, glow2: flames[2]!.glow,
          lean0: flames[0]!.lean, lean1: flames[1]!.lean, lean2: flames[2]!.lean,
          scale0: flames[0]!.scale, scale1: flames[1]!.scale, scale2: flames[2]!.scale,
        });
        return;
      }
      // The chamberstick fallback (the Twitch panel's sill candle, tiny custom bleeds).
      const spec = candleOf(frame, placement);
      const u = scaleOf(placement, spec.kind);
      const bounds = candleBounds(spec.kind, spec.bracket);
      const foot = footOf(placement, spec, u);
      const {glow, lean, scale} = flicker(random, k, phase);
      const flash = style.lightning * (foot.x < middle ? flashLeft : flashRight);
      const shared: CandleFields = {footX: foot.x, footY: foot.y, u, dir: spec.dir, kind: spec.kind, glow, flash, warm, rim, cold: 0};
      elements.push({
        type: 'interior-candle', layer: placement.layer, anchor, x: placement.x, y: placement.y,
        reach: u * bounds.body + bodyMargin(u), light: 0, lightOpacity: 0, opacity: 1, ...shared, mount: spec.bracket ?? 'edge',
      });
      const lightX = foot.x + spec.dir * u * bounds.light.x;
      const lightY = foot.y + u * bounds.light.y;
      const light = lightFor(frame, placement, bounds, u);
      const peak = LIGHT_ALPHA.min + (LIGHT_ALPHA.max - LIGHT_ALPHA.min) * glow;
      elements.push({
        type: 'interior-flame', layer: placement.layer, anchor, x: lightX, y: lightY,
        reach: u * bounds.flame + OUTLINE_MARGIN, light, lightOpacity: capped(lightX, lightY, light, peak),
        opacity: 0.82 + 0.18 * glow,
        ...shared, cold: capped(lightX, lightY, light, STRIKE_LIGHT * Math.min(1, flash)), lean, scale,
      });
    });
    return elements;
  },
  render(element, key, context) {
    const id = (part: string) => ornamentPartId(context, key, part);
    switch (element.type) {
      case 'interior-candle': return <CandleBody key={key} element={element} id={id} />;
      case 'interior-flame': return <CandleFlame key={key} element={element} id={id} />;
      case 'interior-fixture': return <FixtureBody key={key} element={element} id={id} />;
      case 'interior-flames': return <FixtureFlames key={key} element={element} id={id} />;
      case 'interior-swag': return <Swag key={key} element={element} id={id} />;
    }
  },
};

/** Candle units → canvas px: mirrored by dir (the drip, the bracket) or not (the moonlit rim). */
const mapper = (element: CandleFields, mirror: boolean) => (point: Point): Point =>
  ({x: element.footX + (mirror ? element.dir : 1) * element.u * point.x, y: element.footY + element.u * point.y});

const pathOf = (map: (point: Point) => Point, points: readonly Point[], close = true) =>
  points.map((point, index) => {
    const {x, y} = map(point);
    return `${index === 0 ? 'M' : 'L'}${num(x)} ${num(y)}`;
  }).join('') + (close ? 'Z' : '');

/** Line widths never thinner than a pixel's worth of detail. */
const width = (u: number, units: number, least: number) => Math.max(least, units * u);

const CandleBody = ({element, id}: {element: InteriorCandleElement; id: (part: string) => string}) => {
  const {u} = element;
  const map = mapper(element, true);
  const plain = mapper(element, false);
  const kind = element.kind as CandleKind;
  const top = waxTop(kind);
  const bottom = WAX.bottom;
  const at = (x: number, y: number) => map({x, y});
  const P = (x: number, y: number) => {
    const point = at(x, y);
    return `${num(point.x)} ${num(point.y)}`;
  };
  const dish = {cx: element.footX, cy: element.footY + u * DISH.top, rx: u * DISH.rx, ry: u * DISH.ry};
  const socketRim = {cx: element.footX, cy: element.footY + u * SOCKET.top, rx: u * (SOCKET.topHalf + 0.2), ry: u * SOCKET.rimRy};
  const outline = width(u, 0.7, 0.7);
  const bracket = element.mount === 'edge' ? null : (element.mount as BracketId);
  const rimX = WAX.half - 0.55;
  const rimPath = pathOf(plain, [{x: rimX, y: top + 1.1}, {x: rimX, y: bottom - 0.3}], false);
  const brassRim = `M${P(1.2, DISH.top - DISH.ry + 0.05)}Q${P(5.6, DISH.top - DISH.ry + 0.35)} ${P(6.7, DISH.top - 0.4)}`;
  const waxPath = `M${P(-WAX.half, bottom)}V${num(at(0, top + 0.8).y)}Q${P(-WAX.half, top)} ${P(-2, top)}H${num(at(2, 0).x)}`
    + `Q${P(WAX.half, top)} ${P(WAX.half, top + 0.8)}V${num(at(0, bottom).y)}Z`;
  // The drip runs down the stick's inner side; on a short stick it shrinks (to 80 % of the wax).
  const d = dripScale(kind);
  const drip = `M${P(-2.8, top + 0.6 * d)}C${P(-3.5, top + 2 * d)} ${P(-3.5, top + 3.6 * d)} ${P(-3.1, top + 4.6 * d)}`
    + `C${P(-2.7, top + 5.3 * d)} ${P(-2.15, top + 4.9 * d)} ${P(-2.2, top + 3.8 * d)}C${P(-2.2, top + 2.4 * d)} ${P(-2, top + 1.2 * d)} ${P(-1.4, top + 0.7 * d)}Z`;
  const socket = pathOf(map, [
    {x: -SOCKET.bottomHalf, y: SOCKET.bottom}, {x: SOCKET.bottomHalf, y: SOCKET.bottom},
    {x: SOCKET.topHalf, y: SOCKET.top}, {x: -SOCKET.topHalf, y: SOCKET.top},
  ]);
  const dishSide = `M${P(-DISH.rx, DISH.top)}C${P(-6.6, -0.5)} ${P(-4.5, DISH.foot)} ${P(0, DISH.foot)}`
    + `C${P(4.5, DISH.foot)} ${P(6.6, -0.5)} ${P(DISH.rx, DISH.top)}Z`;
  const wick = `M${P(0, top + 0.2)}Q${P(0.1, top - 0.9)} ${P(0.4, top - WICK.length)}`;
  const glowOpacity = 0.35 + 0.45 * element.glow;
  // The girandoles' brass (AD round 2): the same gradient, dark outline and 1 px moonlit highlight.
  const line = {stroke: BRASS.outline, strokeOpacity: BRASS.outlineOpacity, strokeWidth: Math.max(1, outline)} as const;
  return (
    <g>
      <defs>
        <BrassGradient id={id('brass')} />
        <WaxGradient id={id('wax')} />
        {/* The flame lights the wax from above: warm near the top, fading down the stick. */}
        <linearGradient id={id('lit')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CANDLE_COLORS.waxLit} stopOpacity={0.55 + 0.3 * element.glow} />
          <stop offset="0.7" stopColor={CANDLE_COLORS.waxLit} stopOpacity={0} />
        </linearGradient>
      </defs>
      {bracket ? (
        <g>
          <path d={armPath(bracket, map)} fill="none" stroke={CANDLE_COLORS.outline} strokeOpacity={0.85}
            strokeWidth={u * ARM.width + 2 * Math.max(ARM.outline, ARM.outline * u)} strokeLinecap="round" />
          <path d={armPath(bracket, map)} fill="none" stroke={CANDLE_COLORS.brassDark} strokeWidth={u * ARM.width} strokeLinecap="round" />
          <path d={armPath(bracket, map)} fill="none" stroke={CANDLE_COLORS.brassHighlight} strokeOpacity={0.6}
            strokeWidth={width(u, 0.5, 0.6)} strokeLinecap="round" transform={`translate(${num(0.35 * u)} ${num(-0.35 * u)})`} />
          <circle cx={num(map(BRACKETS[bracket].root).x)} cy={num(map(BRACKETS[bracket].root).y)} r={num(u * ARM.rosette)}
            fill={CANDLE_COLORS.brass} stroke={CANDLE_COLORS.outline} strokeOpacity={0.85} strokeWidth={outline} />
          <circle cx={num(map(BRACKETS[bracket].root).x + 0.5 * u)} cy={num(map(BRACKETS[bracket].root).y - 0.5 * u)} r={num(u * 0.8)}
            fill={CANDLE_COLORS.brassLight} opacity={0.55} />
        </g>
      ) : null}
      {/* The dish: its side, then its top face, then the brass catching light on its far rim. */}
      <path d={dishSide} fill={paint(id('brass'))} {...line} strokeLinejoin="round" />
      <ellipse cx={num(dish.cx)} cy={num(dish.cy)} rx={num(dish.rx)} ry={num(dish.ry)} fill={BRASS.pan} {...line} />
      <path d={brassRim} fill="none" stroke={BRASS.highlight} strokeOpacity={0.85} strokeWidth={width(u, 0.6, 1)} strokeLinecap="round" />
      <path d={socket} fill={paint(id('brass'))} {...line} strokeLinejoin="round" />
      <ellipse cx={num(socketRim.cx)} cy={num(socketRim.cy)} rx={num(socketRim.rx)} ry={num(socketRim.ry)} fill={CANDLE_COLORS.brass} {...line} />
      {/* The wax, its drip and its molten top, warmed by the flame. */}
      <path d={waxPath} fill={paint(id('wax'))} stroke={CANDLE_COLORS.waxOutline} strokeOpacity={0.9} strokeWidth={Math.max(1, outline)} strokeLinejoin="round" />
      <path d={waxPath} fill={paint(id('lit'))} />
      <path d={drip} fill={CANDLE_COLORS.drip} opacity={0.9} />
      <ellipse cx={num(at(0, top + 0.45).x)} cy={num(at(0, top + 0.45).y)} rx={num(u * 2)} ry={num(u * 0.6)} fill={CANDLE_COLORS.molten} opacity={glowOpacity} />
      {/* The moon's side: a cold rim on the right, flaring with the lightning of this side's window. */}
      <path d={rimPath} fill="none" stroke={element.rim} strokeOpacity={0.5} strokeWidth={width(u, 0.7, 0.9)} strokeLinecap="round" />
      {element.flash > 0 ? (
        <g opacity={Math.min(1, element.flash)}>
          <path d={rimPath} fill="none" stroke={LIGHTNING_COLOR} strokeWidth={width(u, 0.9, 1)} strokeLinecap="round" />
          <path d={brassRim} fill="none" stroke={LIGHTNING_COLOR} strokeOpacity={0.8} strokeWidth={width(u, 0.6, 0.8)} strokeLinecap="round" />
        </g>
      ) : null}
      <path d={wick} fill="none" stroke={CANDLE_COLORS.wick} strokeWidth={width(u, 0.7, 0.8)} strokeLinecap="round" />
    </g>
  );
};

const CandleFlame = ({element, id}: {element: InteriorFlameElement; id: (part: string) => string}) => {
  const {u} = element;
  const origin = flameOrigin(element.kind as CandleKind);
  const ox = element.footX;
  const oy = element.footY + u * origin.y;
  const transform = `translate(${num(ox)} ${num(oy)}) scale(${num(FLAME_SCALE * u)} ${num(FLAME_SCALE * u * element.scale)})`;
  return (
    <g>
      <RadialLight id={id('light')} x={element.x} y={element.y} radius={element.light} color={element.warm}
        opacity={element.lightOpacity} falloff={0.35} />
      <RadialLight id={id('cold')} x={element.x} y={element.y} radius={element.light} color={LIGHTNING_COLOR}
        opacity={element.cold} falloff={0.35} />
      <defs>
        <FlameGradient id={id('flame')} warm={element.warm} />
      </defs>
      <g transform={transform} opacity={element.opacity}>
        <FlameShape lean={element.lean} fill={paint(id('flame'))} />
      </g>
    </g>
  );
};

/* ------------------------------------------------------------------------------ fixtures */

/** The flame's dark edge (reads over bright footage), its alpha; 1.2 px, non-scaling. */
const FLAME_OUTLINE_OPACITY = 0.65;
/** The fixtures' brass: the body's gradient ends and middle, the arms' stroke, the highlight on the moon's side, the outline. */
const BRASS = {dark: '#4A3F2B', mid: '#86724E', arm: '#7A6846', pan: '#8E7A52', highlight: '#E8D6A8', outline: '#2A2114', outlineOpacity: 0.9} as const;
/** The hall's warm halo (hi-warm-halo): alpha 0.7 at the centre, 0.22 at 22 %, 0 at the rim. */
const HALO_STOPS = [[0, 0.7], [0.22, 0.22], [1, 0]] as const;

type Mapper = (x: number, y: number) => Point;
/** Fixture units (H) → canvas px: mirrored by dir. */
const fixtureMapper = (element: FixtureFields): Mapper => (x, y) => ({x: element.ox + element.dir * element.h * x, y: element.oy + element.h * y});
const pt = (point: Point) => `${num(point.x)} ${num(point.y)}`;
const cubicPath = (map: Mapper, segments: readonly (readonly [Point, Point, Point, Point])[]) =>
  segments.map(([a, b, c, d], index) => `${index === 0 ? `M${pt(map(a.x, a.y))}` : ''}C${pt(map(b.x, b.y))} ${pt(map(c.x, c.y))} ${pt(map(d.x, d.y))}`).join('');
/** The upper arc of an ellipse on one side (+1 right, −1 left), as a path: its top to its side. */
const sideArc = (cx: number, cy: number, rx: number, ry: number, side: number, inset = 0.5) =>
  `M${num(cx)} ${num(cy - ry + inset)}A${num(Math.max(0.1, rx - inset))} ${num(Math.max(0.1, ry - inset))} 0 0 ${side > 0 ? 1 : 0} ${num(cx + side * (rx - inset))} ${num(cy)}`;

const BrassGradient = ({id}: {id: string}) => (
  <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stopColor={BRASS.dark} />
    <stop offset="0.5" stopColor={BRASS.mid} />
    <stop offset="1" stopColor={BRASS.dark} />
  </linearGradient>
);

/** The background's hi-wax-warm: dark, light at 0.45, shaded, across the stick. */
const WaxGradient = ({id}: {id: string}) => (
  <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stopColor={CANDLE_COLORS.waxDark} />
    <stop offset="0.45" stopColor={CANDLE_COLORS.waxLight} />
    <stop offset="1" stopColor={CANDLE_COLORS.waxShade} />
  </linearGradient>
);

/** The background's hi-flame: the candle colour at the tip, pale gold low in the flame. */
const FlameGradient = ({id, warm}: {id: string; warm: string}) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor={warm} />
    <stop offset="0.75" stopColor={CANDLE_COLORS.flameMid} />
    <stop offset="1" stopColor={CANDLE_COLORS.flameBase} />
  </linearGradient>
);

/** The background's flame in its own units: a faint dark edge (so it still reads over bright footage), the gradient fill and the pale core. */
const FlameShape = ({lean, fill}: {lean: number; fill: string}) => (
  <>
    <path d={flamePath(lean)} fill="none" stroke={CANDLE_COLORS.flameOutline} strokeOpacity={FLAME_OUTLINE_OPACITY}
      strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    <path d={flamePath(lean)} fill={fill} />
    <path d={flameCorePath(lean)} fill={CANDLE_COLORS.core} />
  </>
);

/** One candle on a fixture's cup: the wax (hi-wax-warm), warmed at the top by its flame, a drip, the moonlit rim, the wick. */
const FixtureCandle = ({cup, map, h, glow, rim, flash, side, id}: {
  cup: FixtureCup; map: Mapper; h: number; glow: number; rim: string; flash: number; side: number; id: (part: string) => string;
}) => {
  const top = fixtureWaxTop(cup);
  const bottom = cup.bobeche - PART.waxFoot;
  const a = map(cup.x - PART.wax, bottom);
  const b = map(cup.x + PART.wax, top);
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const width = right - left;
  const shoulder = Math.min(width / 3, 0.012 * h);
  const wax = `M${num(left)} ${num(a.y)}V${num(b.y + shoulder)}Q${num(left)} ${num(b.y)} ${num(left + shoulder)} ${num(b.y)}H${num(right - shoulder)}`
    + `Q${num(right)} ${num(b.y)} ${num(right)} ${num(b.y + shoulder)}V${num(a.y)}Z`;
  const drip = 0.35 * cup.wax * h;
  const dripPath = `M${num(left + 0.2)} ${num(b.y + shoulder)}C${num(left - 0.9)} ${num(b.y + 0.4 * drip)} ${num(left - 0.9)} ${num(b.y + 0.8 * drip)} ${num(left + 0.2)} ${num(b.y + drip)}`
    + `C${num(left + 1.2)} ${num(b.y + 0.7 * drip)} ${num(left + 0.9)} ${num(b.y + 0.3 * drip)} ${num(left + 1.4)} ${num(b.y + shoulder)}Z`;
  const wickFrom = map(cup.x, top + 0.004);
  const wickTo = map(cup.x + 0.008, top - PART.wick);
  // The moon's side (always the right): a cold 1 px rim; the window's side flares at a strike.
  const rimX = right - 0.6;
  const flashX = side > 0 ? right - 1 : left + 1;
  return (
    <g>
      <path d={wax} fill={paint(id('wax'))} stroke={BRASS.outline} strokeOpacity={0.9} strokeWidth={1} strokeLinejoin="round" />
      <path d={wax} fill={paint(id('lit'))} opacity={0.55 + 0.3 * glow} />
      <path d={dripPath} fill={CANDLE_COLORS.drip} opacity={0.85} />
      <path d={`M${num(rimX)} ${num(b.y + shoulder + 0.4)}V${num(a.y - 0.6)}`} stroke={rim} strokeOpacity={0.55} strokeWidth={1} strokeLinecap="round" />
      {flash > 0 ? (
        <path d={`M${num(flashX)} ${num(b.y + shoulder + 0.4)}V${num(a.y - 0.6)}`} stroke={LIGHTNING_COLOR} strokeOpacity={Math.min(1, 0.9 * flash)} strokeWidth={STRIKE_RIM} strokeLinecap="round" />
      ) : null}
      <path d={`M${pt(wickFrom)}L${pt(wickTo)}`} stroke={CANDLE_COLORS.wick} strokeWidth={Math.max(0.8, 0.012 * h)} strokeLinecap="round" />
    </g>
  );
};

/**
 * A fixture's body: the
 * mount (a rosette on the frame's line, a domed foot on a rail, or a wall plate with a boss), the
 * arms, the stem and its knops, the cups and their bobeches, the candles. Brass in the candelabra's
 * gradient with a 1 px dark outline (it reads over light footage) and a thin highlight on the moon's
 * side (over dark footage); at a strike, the edges facing the window flare cold (2 px).
 */
const FixtureBody = ({element, id}: {element: InteriorFixtureElement; id: (part: string) => string}) => {
  const map = fixtureMapper(element);
  const {h} = element;
  const shape = FIXTURES[element.fixture as FixtureKind];
  const mount = element.mount as FixtureMount;
  const outline = {stroke: BRASS.outline, strokeOpacity: BRASS.outlineOpacity, strokeWidth: 1} as const;
  const arm = Math.max(1.2, armOf(shape) * h);
  const bobecheRx = bobecheOf(shape);
  const arms = shape.arms.map((segments) => cubicPath(map, segments)).join('');
  // The arm on the window's side (a sconce's single arm always): the one a strike lights.
  const windowArms = shape.arms.filter((segments) => shape.arms.length === 1
    || Math.sign(segments[segments.length - 1]![3].x) * element.dir === element.side).map((segments) => cubicPath(map, segments)).join('');
  // The highlight sits up and to the right of each part (the moon's side, never mirrored).
  const lift = `translate(${num(0.28 * arm)} ${num(-0.28 * arm)})`;
  const toward = `translate(${num(element.side * 0.3 * arm)} ${num(-0.3 * arm)})`;
  const rosette = shape.backplate ? map(shape.backplate.boss.x, shape.backplate.boss.y) : map(0, -shape.rosette);
  const rosetteRadius = shape.rosette * h;
  const plate = shape.backplate
    ? {...map(0, shape.backplate.cy), rx: shape.backplate.rx * h, ry: shape.backplate.ry * h}
    : null;
  const stemBottom = mount === 'foot' ? -PART.footHeight + 0.005 : shape.drop ? shape.drop.y : -shape.rosette;
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    const a = map(x0, y0);
    const b = map(x1, y1);
    return {x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y)};
  };
  const stem = shape.stemTop < stemBottom ? rect(-PART.stem, stemBottom, PART.stem, shape.stemTop) : null;
  const finial = shape.finial ? rect(-0.02, shape.finial.from + 0.005, 0.02, shape.finial.to) : null;
  const cup = (c: FixtureCup) => [
    map(c.x - PART.cupTop, c.bobeche), map(c.x + PART.cupTop, c.bobeche),
    map(c.x + PART.cupBottom, c.bobeche + PART.cupHeight), map(c.x - PART.cupBottom, c.bobeche + PART.cupHeight),
  ].map((point, index) => `${index === 0 ? 'M' : 'L'}${pt(point)}`).join('') + 'Z';
  const flash = Math.min(1, element.flash);
  const boss = plate ? (
    <g>
      <circle cx={num(rosette.x)} cy={num(rosette.y)} r={num(rosetteRadius)} fill={paint(id('brass'))} {...outline} />
      <path d={sideArc(rosette.x, rosette.y, rosetteRadius, rosetteRadius, 1, 0.9)} fill="none" stroke={BRASS.highlight} strokeOpacity={0.8} strokeWidth={1} strokeLinecap="round" />
    </g>
  ) : null;
  return (
    <g>
      <defs>
        <BrassGradient id={id('brass')} />
        <WaxGradient id={id('wax')} />
        <linearGradient id={id('lit')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CANDLE_COLORS.waxLit} stopOpacity={0.9} />
          <stop offset="0.6" stopColor={CANDLE_COLORS.waxLit} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* A sconce's wall plate, behind its arm: brass, lit on the moon's side, flaring at a strike. */}
      {plate ? (
        <g>
          <ellipse cx={num(plate.x)} cy={num(plate.y)} rx={num(plate.rx)} ry={num(plate.ry)} fill={paint(id('brass'))} {...outline} />
          <path d={sideArc(plate.x, plate.y, plate.rx, plate.ry, 1, 0.9)} fill="none" stroke={BRASS.highlight} strokeOpacity={0.9} strokeWidth={1} strokeLinecap="round" />
          <ellipse cx={num(plate.x)} cy={num(plate.y)} rx={num(0.7 * plate.rx)} ry={num(plate.ry - 0.3 * plate.rx)}
            fill="none" stroke={BRASS.outline} strokeOpacity={0.35} strokeWidth={0.8} />
        </g>
      ) : null}
      {/* The arms first: the stem, the knops and the cups cover their ends. */}
      <path d={arms} fill="none" stroke={BRASS.outline} strokeOpacity={BRASS.outlineOpacity} strokeWidth={arm + 2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={arms} fill="none" stroke={BRASS.arm} strokeWidth={arm} strokeLinecap="round" strokeLinejoin="round" />
      <path d={arms} fill="none" stroke={BRASS.highlight} strokeOpacity={0.7} strokeWidth={Math.min(1, arm / 2)} strokeLinecap="round" transform={lift} />
      {mount === 'foot'
        ? <path d={`${cubicPath(map, FOOT)}Z`} fill={paint(id('brass'))} {...outline} strokeLinejoin="round" />
        : plate ? null : (
          <g>
            <circle cx={num(rosette.x)} cy={num(rosette.y)} r={num(rosetteRadius)} fill={paint(id('brass'))} {...outline} />
            <circle cx={num(rosette.x)} cy={num(rosette.y)} r={num(0.45 * rosetteRadius)} fill={BRASS.dark} {...outline} strokeOpacity={0.6} />
            <path d={sideArc(rosette.x, rosette.y, rosetteRadius, rosetteRadius, 1, 0.9)} fill="none" stroke={BRASS.highlight} strokeOpacity={0.8} strokeWidth={1} strokeLinecap="round" />
          </g>
        )}
      {stem ? <rect x={num(stem.x)} y={num(stem.y)} width={num(stem.width)} height={num(stem.height)} fill={paint(id('brass'))} {...outline} /> : null}
      {shape.drop ? (
        <ellipse cx={num(map(0, shape.drop.y).x)} cy={num(map(0, shape.drop.y).y)} rx={num(shape.drop.rx * h)} ry={num(shape.drop.ry * h)} fill={paint(id('brass'))} {...outline} />
      ) : null}
      {finial ? (
        <g>
          <rect x={num(finial.x)} y={num(finial.y)} width={num(finial.width)} height={num(finial.height)} fill={paint(id('brass'))} {...outline} />
          <circle cx={num(map(0, shape.finial!.ball).x)} cy={num(map(0, shape.finial!.ball).y)} r={num(shape.finial!.radius * h)} fill={paint(id('brass'))} {...outline} />
        </g>
      ) : null}
      {shape.knops.map((knop, index) => {
        const at = map(0, knop.y);
        return <ellipse key={index} cx={num(at.x)} cy={num(at.y)} rx={num(knop.rx * h)} ry={num(knop.ry * h)} fill={paint(id('brass'))} {...outline} />;
      })}
      {/* A wall plate's boss, over the knop: where the girandole is fixed to the plate. */}
      {boss}
      {stem ? <path d={`M${num(stem.x + stem.width - 0.7)} ${num(stem.y + 1)}V${num(stem.y + stem.height - 1)}`} stroke={BRASS.highlight} strokeOpacity={0.55} strokeWidth={0.8} /> : null}
      {shape.cups.map((c, index) => {
        const pan = map(c.x, c.bobeche);
        return (
          <g key={index}>
            <path d={cup(c)} fill={paint(id('brass'))} {...outline} strokeLinejoin="round" />
            <ellipse cx={num(pan.x)} cy={num(pan.y)} rx={num(bobecheRx * h)} ry={num(PART.bobecheRy * h)} fill={BRASS.pan} {...outline} />
            <path d={sideArc(pan.x, pan.y, bobecheRx * h, PART.bobecheRy * h, 1)} fill="none" stroke={BRASS.highlight} strokeOpacity={0.75} strokeWidth={1} strokeLinecap="round" />
          </g>
        );
      })}
      {shape.cups.map((c, index) => (
        <FixtureCandle key={index} cup={c} map={map} h={h} glow={element.glow} rim={element.rim} flash={flash} side={element.side} id={(part) => id(`${part}-${index}`)} />
      ))}
      {/* The lightning: the brass edges facing the window flare cold. */}
      {flash > 0 ? (
        <g opacity={Math.min(1, 0.9 * flash)}>
          <path d={windowArms} fill="none" stroke={LIGHTNING_COLOR} strokeWidth={STRIKE_RIM} strokeLinecap="round" transform={toward} />
          {shape.cups.map((c, index) => {
            const pan = map(c.x, c.bobeche);
            return <path key={index} d={sideArc(pan.x, pan.y, bobecheRx * h, PART.bobecheRy * h, element.side)} fill="none" stroke={LIGHTNING_COLOR} strokeWidth={STRIKE_RIM} strokeLinecap="round" />;
          })}
          {mount === 'rosette'
            ? plate
              ? <path d={sideArc(plate.x, plate.y, plate.rx, plate.ry, element.side, 0.9)} fill="none" stroke={LIGHTNING_COLOR} strokeWidth={STRIKE_RIM} strokeLinecap="round" />
              : <path d={sideArc(rosette.x, rosette.y, rosetteRadius, rosetteRadius, element.side, 0.9)} fill="none" stroke={LIGHTNING_COLOR} strokeWidth={STRIKE_RIM} strokeLinecap="round" />
            : null}
          {stem ? <path d={`M${num(element.side > 0 ? stem.x + stem.width - 1 : stem.x + 1)} ${num(stem.y + 1)}V${num(stem.y + stem.height - 1)}`} stroke={LIGHTNING_COLOR} strokeWidth={STRIKE_RIM} /> : null}
        </g>
      ) : null}
    </g>
  );
};

/**
 * A fixture's lights and flames: its warm light (a disc as large as the fixture's circle, focused on
 * the flames) and, at a strike, a cold one over it (#DCE6FF at 0.5·flash, AD round 3: the flash
 * then reads on any footage), each flame's halo (the hall's hi-warm-halo), then the background's
 * flame with its dark edge and pale core. A strike dips the flames (vertical scale −10 % × flash).
 */
const FixtureFlames = ({element, id}: {element: InteriorFlamesElement; id: (part: string) => string}) => {
  const map = fixtureMapper(element);
  const {h} = element;
  const kind = element.fixture as FixtureKind;
  const cups = FIXTURES[kind].cups;
  const bounds = fixtureBounds(kind, element.mount as FixtureMount);
  const lit = element.light > 0;
  const light = (part: string, color: string, opacity: number) => (
    <RadialLight id={id(part)} x={element.x} y={element.y} radius={element.light} color={color} opacity={opacity}
      falloff={0.35} mid={0.3} fx={element.fx} fy={element.fy} />
  );
  const dip = 1 - STRIKE_DIP * Math.min(1, element.flash);
  const flames = [
    {glow: element.glow0, lean: element.lean0, scale: element.scale0},
    {glow: element.glow1, lean: element.lean1, scale: element.scale1},
    {glow: element.glow2, lean: element.lean2, scale: element.scale2},
  ];
  return (
    <g>
      {light('light', element.warm, element.lightOpacity)}
      {light('cold', LIGHTNING_COLOR, element.cold)}
      <defs>
        {lit ? (
          <radialGradient id={id('halo')}>
            {HALO_STOPS.map(([offset, alpha]) => <stop key={offset} offset={offset} stopColor={element.warm} stopOpacity={alpha} />)}
          </radialGradient>
        ) : null}
        <FlameGradient id={id('flame')} warm={element.warm} />
      </defs>
      {lit ? bounds.halos.map((halo, index) => {
        const at = map(halo.x, halo.y);
        const radius = halo.radius * h + FIXTURE_MARGIN - 0.5;
        return radius > 0
          ? <circle key={index} cx={num(at.x)} cy={num(at.y)} r={num(radius)} fill={paint(id('halo'))} opacity={0.55 + 0.25 * flames[index]!.glow} />
          : null;
      }) : null}
      {cups.map((cup, index) => {
        const origin = map(flameOriginOf(cup).x, flameOriginOf(cup).y);
        const flame = flames[index]!;
        const transform = `translate(${num(origin.x)} ${num(origin.y)}) scale(${num(cup.flame * h)} ${num(cup.flame * h * flame.scale * dip)})`;
        return (
          <g key={index} transform={transform} opacity={0.85 + 0.15 * flame.glow}>
            <FlameShape lean={flame.lean} fill={paint(id('flame'))} />
          </g>
        );
      })}
    </g>
  );
};

export const interiorSet: OrnamentSet = set;
