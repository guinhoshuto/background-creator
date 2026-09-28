import {spiderTimeline, wind} from '../../../../backgrounds/CobwebLoop';
import {TAU} from '../../../../loop';
import {cycleOf} from '../../motion';
import {ornamentPalette, ornamentPartId, RadialLight} from '../draw';
import {cornerSlots, floorHalf, harmonics, maxExtentAt, ornamentRandom, slotsOffAccent} from '../place';
import type {OrnamentBase, OrnamentCornerId, OrnamentFrame, OrnamentLayerName, OrnamentPlacement, OrnamentSet} from '../types';
import {cellPath, fanTurn, fitFan, webThreadsFor, type FanLayout} from './teia-fan';
import {Dragline, fitPocket, fitSpider, SPIDER_BOB, SPIDER_PER_SIZE, SPIDER_POCKET_BOB, spiderBodyReach, SpiderFigure, type SpiderPlan} from './teia-spider';
import {
  BROKEN_END, fitGarlands, GARLAND, GarlandFigure, swagPoint, type BrokenEndPlan, type GarlandDraw, type GarlandRun, type SwagPlan,
} from './teia-garland';
import {StrandFigure} from './teia-strand';
import {dewCount, FanWeb, type WebSpec} from './teia-web';

/**
 * Teia (CobwebLoop): the background's orb-web fans tied off in the corners, its black widow, its
 * silk garlands and its ember, around a panel or a frame. Everything is on the front layer: over
 * the panel's corner, draped over a border's band (never into the window) or in a screen's band.
 *
 *   - Hero web (TR, or the first corner a round block's accent leaves free): an orb-web fan whose
 *     hub sits near the corner of the file and whose rim drapes over the corner of the panel or
 *     the band. Its web radius is `ornamentSize`, limited by the corner's room (teia-fan.ts); it
 *     carries the tear and its broken ends when it is big enough.
 *   - Counterweight web on the opposite corner (BL), 0.85 of the hero's radius, with the ember:
 *     a soft amber light behind it (≤ 0.15), the background's light from below. A border adds
 *     quieter webs (0.75) on its other two corners, as the background's four fans. Around a rect
 *     window every corner has the same room, so there all four webs take the hero's radius (each
 *     still limited by its own corner): the hero keeps its spider, moonlight, tear and dew.
 *   - The moonlight: a soft light 0.35 of the hero's radius out along its bisector (≤ 0.7 R).
 *   - The spider at ornamentSize/165, limited by the room: hanging from the hero web down the
 *     column beside a panel (the background's whole drop where that column holds it, resting
 *     and bobbing elsewhere; beside a chat on a long line, its body well under the header's
 *     divider, the line's upper part in a placement of its own), or sitting in a border's or a
 *     screen's corner pocket on the hero
 *     web, head toward the hub; absent on a Twitch panel (no glow).
 *   - Silk garlands (teia-garland.tsx): two or three threads draped between knots along the top
 *     bleed, from the top-left web to the hero web, their inner knots tied off above the file; big
 *     frames and blocks add a run along the bottom, knotted on the frame. Whole swags at a fixed
 *     spacing (more along a longer box), dew at the low points flashing as the hero's moonlight
 *     band passes, and a few short broken ends.
 *   - Dew on each web's knots (one per 9 px of radius, ≤ 10; four fewer on a border's quiet webs),
 *     flashing as the moonlight band crosses them.
 *
 * `ornamentSize` is the hero web's radius in px (hub to rim). Rhythms are the background's per
 * 12 s cycle, as whole harmonics of the cycle: glow and breeze 1×, breath, the glint band and the
 * garlands' skew and broken ends 2× (dew flashes on each pass), the gait 3×, one spider performance per cycle
 * (cycles ≥ 4.375 s). Silver monochrome: amber only in the hourglass and the ember.
 */

/** Below this web radius (px) the hero is refused (the hero rule places it at a smaller ornamentSize's own radius). */
export const TEIA_HERO_MIN = 10;
/**
 * Below this the counterweight (and a border's quiet corner webs) is left out: under 16 px the
 * fixed-width silk fills most of the fan and the rings stop reading (a Twitch panel at the default
 * padding then keeps only its hero).
 */
export const TEIA_COUNTER_MIN = 16;
/** The counterweight's radius per px of the hero's (the background's 540 to 630, rounded). */
export const TEIA_COUNTER_RATIO = 0.85;
/** The ember light behind the counterweight: radius per px of its web's, smallest kept, peak alpha (≤ 0.15) and its slow swell. */
export const TEIA_EMBER = {ratio: 0.6, min: 8, opacity: 0.13, swing: 0.02} as const;
/** The quieter webs a border adds on its two other corners (the background's third and fourth), per px of the hero's radius. */
export const TEIA_QUIET_RATIO = 0.75;
/** Dew on the quiet webs: this many beads fewer than a web of their radius carries (the hero and counterweight stay ahead). */
export const TEIA_QUIET_DEW = 4;
/** The moonlight behind the hero web (the background's moon halo sits inside its hero fan): the same, in the moonlight colour. */
export const TEIA_MOON = {ratio: 0.7, at: 0.35, min: 8, opacity: 0.15, swing: 0.03} as const;

/**
 * A soft light behind a fan, centred on its bisector `at` of its radius out from the hub (it grows
 * with the fan), as large as the room there allows up to `nominal`; null below `min`.
 */
const lightOn = (frame: OrnamentFrame, fan: FanLayout, layer: OrnamentLayerName, motif: string, slot: OrnamentCornerId, at: number, nominal: number, min: number): OrnamentPlacement | null => {
  const x = fan.hubX + Math.cos(fan.bisector) * at * fan.radius;
  const y = fan.hubY + Math.sin(fan.bisector) * at * fan.radius;
  const extent = floorHalf(Math.min(nominal, maxExtentAt(frame, x, y, layer)));
  return extent >= min ? {motif, slot, layer, x, y, extent, size: extent} : null;
};
/**
 * A soft light behind a fan: centred on the fan's bisector (15–65 % of its radius out from the
 * hub), as large as the room there allows up to `nominal`; null below `min`.
 */
const fitLight = (frame: OrnamentFrame, fan: FanLayout, layer: OrnamentLayerName, motif: string, slot: OrnamentCornerId, nominal: number, min: number): OrnamentPlacement | null => {
  let best: OrnamentPlacement | null = null;
  for (let step = 3; step <= 13; step++) {
    const light = lightOn(frame, fan, layer, motif, slot, step * 0.05, nominal, min);
    if (light && (!best || light.extent > best.extent)) best = light;
  }
  return best;
};
/** The background's cycle, whose rhythms the set keeps as whole harmonics. */
const BACKGROUND_SECONDS = 12;
/**
 * The spider drops (the background's spiderTimeline, once per cycle) only in a cycle this long:
 * the timeline rests for the last 8 % of the cycle, and the seam wants at least 0.35 s of rest.
 * Shorter cycles keep the resting spider's bob.
 */
export const TEIA_DROP_MIN_SECONDS = 0.35 / 0.08;



type Role = 'hero' | 'counter' | 'quiet';

/** Everything place() decided, kept so build() never recomputes it (memoised per frame and size). */
type Plan = {
  placements: OrnamentPlacement[];
  /** Per placement: which motif it is and, for a web piece, its fan, its cell and whether it is the fan's first piece (which draws the web). */
  items: ({kind: 'web'; role: Role; fan: FanLayout; cell: number; first: boolean} | {kind: 'ember'} | {kind: 'moon'} | {kind: 'spider'; plan: SpiderPlan} | {kind: 'line'; plan: SpiderPlan}
    | {kind: 'garland'; run: GarlandRun; swag: SwagPlan; piece: number} | {kind: 'end'; run: GarlandRun; end: BrokenEndPlan})[];
  /** The drawing order, as placement indexes: the counterweight under its ember… then the hero under the spider. */
  order: number[];
  hero: FanLayout;
  counter: FanLayout | null;
  spider: SpiderPlan | null;
};


const OPPOSITE: Record<OrnamentCornerId, OrnamentCornerId> = {TR: 'BL', BL: 'TR', TL: 'BR', BR: 'TL'};

const planOf = (frame: OrnamentFrame, ornamentSize: number): Plan | null => {
  const layer: OrnamentLayerName = 'front';
  const free = slotsOffAccent(frame);
  let hero: FanLayout | null = null;
  let heroSlot: OrnamentCornerId = 'TR';
  // The hero rule (fitMotif's): a small ornamentSize places the hero at its own radius where it fits.
  const least = Math.min(TEIA_HERO_MIN, floorHalf(ornamentSize));
  for (const corner of free) {
    hero = fitFan(frame, corner, layer, ornamentSize, least);
    if (hero) {
      heroSlot = corner.slot;
      break;
    }
  }
  if (!hero) return null;
  const counterSlot = free.some((corner) => corner.slot === OPPOSITE[heroSlot])
    ? OPPOSITE[heroSlot] : free.find((corner) => corner.slot !== heroSlot)?.slot;
  const counterCorner = counterSlot ? cornerSlots(frame).find((corner) => corner.slot === counterSlot)! : null;
  // Around a rect window all four corners have the same room: every web takes the hero's radius there.
  const even = frame.kind === 'border' && !frame.circle;
  const counter = counterCorner ? fitFan(frame, counterCorner, layer, (even ? 1 : TEIA_COUNTER_RATIO) * hero.radius, TEIA_COUNTER_MIN) : null;
  // Soft lights need glow (a Twitch panel has none): moonlight behind the hero, the ember behind the counterweight.
  const moon = frame.glow > 0 ? lightOn(frame, hero, layer, 'luar', heroSlot, TEIA_MOON.at, TEIA_MOON.ratio * hero.radius, TEIA_MOON.min) : null;
  const ember = counter && counterSlot && frame.glow > 0
    ? fitLight(frame, counter, layer, 'brasa', counterSlot, TEIA_EMBER.ratio * counter.radius, TEIA_EMBER.min) : null;
  // A border frames a camera or the game as the background frames the screen: all four corners.
  const quiet = frame.kind === 'border'
    ? free.filter((corner) => corner.slot !== heroSlot && corner.slot !== counterSlot).flatMap((corner) => {
      const fan = fitFan(frame, corner, layer, (even ? 1 : TEIA_QUIET_RATIO) * hero!.radius, TEIA_COUNTER_MIN);
      return fan ? [{fan, slot: corner.slot}] : [];
    })
    : [];
  // The spider hangs on its line beside a panel (the whole drop where the column holds it); a
  // border's corner has no such column, so it sits in the corner's pocket on the hero web when that
  // holds a larger spider (always on a screen). No glow (a Twitch panel): no spider.
  const spiderScale = SPIDER_PER_SIZE * ornamentSize;
  const hang = frame.glow > 0 && frame.fit !== 'tela' ? fitSpider(frame, hero, spiderScale) : null;
  const pocket = frame.glow > 0 && (frame.kind === 'border' || !hang) ? fitPocket(frame, hero, spiderScale) : null;
  const spider = hang && (!pocket || hang.scale >= pocket.scale) ? hang : pocket;
  // Silk garlands along the top (and the bottom of big frames), between the corners' webs, clear of the spider.
  const cornerWebs = [{fan: hero, slot: heroSlot}, ...(counter && counterSlot ? [{fan: counter, slot: counterSlot}] : []), ...quiet];
  const spiderCircles = spider ? [{x: spider.cx, y: spider.cy, r: spider.extent}, ...(spider.line ? [{x: spider.line.cx, y: spider.line.cy, r: spider.line.extent}] : [])] : [];
  const garlands = fitGarlands(frame, cornerWebs, spiderCircles);

  // Placements list the hero first; `order` is the drawing order (each light under its web, the spider on top).
  const placements: OrnamentPlacement[] = [];
  const items: Plan['items'] = [];
  const heroCells: number[] = [];
  const counterCells: number[] = [];
  const quietCells: number[] = [];
  const addFan = (fan: FanLayout, role: Role, slot: OrnamentCornerId, into: number[]) => {
    // The largest piece first: the hero's first placement is its main body.
    const byExtent = fan.cells.map((cell, index) => ({cell, index})).sort((a, b) => b.cell.circle.r - a.cell.circle.r || a.index - b.index);
    byExtent.forEach(({cell, index}, rank) => {
      into.push(placements.length);
      placements.push({
        motif: role === 'hero' ? 'teia' : role === 'counter' ? 'teia-contrapeso' : 'teia-canto', slot, layer, x: cell.circle.x, y: cell.circle.y, extent: cell.circle.r, size: fan.radius,
      });
      // A fan's pieces are contiguous in the drawing order and this one comes first there: it draws the whole web.
      items.push({kind: 'web', role, fan, cell: index, first: rank === 0});
    });
  };
  addFan(hero, 'hero', heroSlot, heroCells);
  const lightAt = (light: OrnamentPlacement | null, kind: 'moon' | 'ember') => {
    if (!light) return [];
    placements.push(light);
    items.push({kind});
    return [placements.length - 1];
  };
  const moonIndex = lightAt(moon, 'moon');
  const emberIndex = lightAt(ember, 'ember');
  if (counter && counterSlot) addFan(counter, 'counter', counterSlot, counterCells);
  for (const {fan, slot} of quiet) addFan(fan, 'quiet', slot, quietCells);
  const spiderIndex: number[] = [];
  if (spider) {
    spiderIndex.push(placements.length);
    placements.push({motif: 'aranha', slot: heroSlot, layer: 'front', x: spider.cx, y: spider.cy, extent: spider.extent, size: spider.scale});
    items.push({kind: 'spider', plan: spider});
  }
  // A long resting line's upper part (the dangle beside a chat) in a circle of its own.
  const lineIndex: number[] = [];
  if (spider?.line) {
    lineIndex.push(placements.length);
    placements.push({motif: 'aranha-fio', slot: heroSlot, layer: 'front', x: spider.line.cx, y: spider.line.cy, extent: spider.line.extent, size: spider.topY - spider.knotY});
    items.push({kind: 'line', plan: spider});
  }
  // Garlands first in the drawing order: the webs' rims cover their end knots.
  const garlandIndex: number[] = [];
  for (const run of garlands) {
    for (const swag of run.swags) {
      swag.pieces.forEach((piece, index) => {
        garlandIndex.push(placements.length);
        placements.push({motif: 'teia-guirlanda', slot: run.slot, layer: 'front', x: piece.circle.x, y: piece.circle.y, extent: piece.circle.r, size: swag.x1 - swag.x0});
        items.push({kind: 'garland', run, swag, piece: index});
      });
    }
    for (const end of run.ends) {
      garlandIndex.push(placements.length);
      placements.push({motif: 'teia-fio', slot: run.slot, layer: 'front', x: end.circle.x, y: end.circle.y, extent: end.circle.r, size: end.length});
      items.push({kind: 'end', run, end});
    }
  }
  const order = [...garlandIndex, ...quietCells, ...emberIndex, ...counterCells, ...moonIndex, ...heroCells, ...lineIndex, ...spiderIndex];
  return {placements, items, order, hero, counter, spider};
};

const planCache = new WeakMap<OrnamentFrame, Map<number, Plan | null>>();
const PLAN_LIMIT = 128;
const planByKey = new Map<string, Plan | null>();

/**
 * planOf, memoised per frame object and size (build runs every frame with the same layout), and
 * by the frame's content (every parse builds a new frame object with the same numbers).
 */
const planFor = (frame: OrnamentFrame, ornamentSize: number): Plan | null => {
  let bySize = planCache.get(frame);
  if (!bySize) {
    bySize = new Map();
    planCache.set(frame, bySize);
  }
  if (bySize.has(ornamentSize)) return bySize.get(ornamentSize)!;
  const key = `${ornamentSize}|${JSON.stringify(frame)}`;
  let plan = planByKey.get(key);
  if (plan === undefined) {
    plan = planOf(frame, ornamentSize);
    if (planByKey.size >= PLAN_LIMIT) planByKey.delete(planByKey.keys().next().value!);
    planByKey.set(key, plan);
  }
  bySize.set(ornamentSize, plan);
  return plan;
};

/**
 * The fan and the cell a web piece's placement stands for (its geometry, looked up from the plan
 * rather than carried as angles in the element), and whether it is the fan's first piece, the one
 * that draws the whole web: null when the anchor is not a web piece.
 */
export const teiaPieceOf = (
  frame: OrnamentFrame, ornamentSize: number, anchor: number,
): {fan: FanLayout; cell: FanLayout['cells'][number]; first: boolean} | null => {
  const item = planFor(frame, ornamentSize)?.items[anchor];
  return item?.kind === 'web' ? {fan: item.fan, cell: item.fan.cells[item.cell]!, first: item.first} : null;
};

/** The garland runs a size keeps (their knots, rest sags, pieces and broken ends), from the memoised plan. */
export const teiaGarlandsOf = (frame: OrnamentFrame, ornamentSize: number): readonly GarlandRun[] => {
  const plan = planFor(frame, ornamentSize);
  if (!plan) return [];
  const runs = new Set<GarlandRun>();
  for (const item of plan.items) if (item.kind === 'garland' || item.kind === 'end') runs.add(item.run);
  return [...runs];
};

/** Only animated numbers and plain constants: the fan's bisector and cell come from the plan in render(). */
type WebElement = OrnamentBase & {
  type: 'teia-web';
  hubX: number; hubY: number; webRadius: number; spokes: number; rings: number; tear: number; webSeed: number; dew: number;
  rotation: number; breath: number; glow: number; glint: number; billow: number; moonX: number; moonY: number;
  silk: string; moonlight: string;
};
type LightElement = (OrnamentBase & {type: 'teia-ember'; color: string}) | (OrnamentBase & {type: 'teia-moon'; color: string});
type SpiderElement = OrnamentBase & {
  type: 'teia-spider';
  bodyX: number; bodyY: number; scale: number; rotation: number; curl: number; stepSin: number; stepCos: number; glow: number;
  /** Unit vector toward the moon (the lit edge's side). */
  lightX: number; lightY: number;
  /** The knot on the web, the line's length to the tie and how much of it (from the tie up) this element draws. */
  knotX: number; knotY: number; thread: number; drawn: number;
  silk: string; moonlight: string; mark: string; body: string;
};
/** A long resting line's upper part: from the knot on the web down to the joint with the spider's own part. */
type LineElement = OrnamentBase & {
  type: 'teia-linha';
  x1: number; y1: number; x2: number; y2: number;
  /** Which way the moonlit edge shifts (±1). */
  side: number; silk: string; moonlight: string;
};
/** A garland's broken end (its knot on its thread this frame, length, swing and bow). */
type EndElement = OrnamentBase & {
  type: 'teia-fio';
  knotX: number; knotY: number; length: number; rotation: number; bend: number; glow: number; side: number;
  /** The glint band on its tip bead, 0 to 1 (its swag's dew flash). */
  flash: number;
  /** Unit vector toward the moon, in the end's turned frame. */
  lightX: number; lightY: number; silk: string; moonlight: string;
  /** The silk of the thread it broke from: width and opacity. */
  width: number; silkOpacity: number;
};
/** One strip of a garland's swag: the swag this frame and the strip it is clipped to. */
type GarlandElement = OrnamentBase & {type: 'teia-guirlanda'} & GarlandDraw;
export type TeiaElement = WebElement | LightElement | SpiderElement | LineElement | EndElement | GarlandElement;

/** The one light: a moon above the hero's corner of the box, a little inside it (the background's moon sits inside its hero fan). */
const moonOf = (frame: OrnamentFrame, hero: FanLayout) => {
  const {box} = frame;
  const inward = Math.min(60, box.width / 4);
  const x = Math.cos(hero.bisector) < 0 ? box.x + box.width - inward : box.x + inward;
  return {x, y: box.y - 80};
};

/** Per web: breath amplitude (contracts only) and base opacity; the hero is the brighter. */
const WEB_LOOK: Record<Role, {breath: number; opacity: number}> = {
  hero: {breath: 0.008, opacity: 0.96},
  counter: {breath: 0.006, opacity: 0.88},
  quiet: {breath: 0.005, opacity: 0.78},
};

/**
 * A hanging spider's pose this frame (shared by its body and a long line's upper part): one
 * performance per cycle, starting at rest (so frame 0 and the seam are still, for at least 0.35 s
 * and 8 % of the cycle), where the column holds the drop and the cycle is long enough; resting
 * spiders bob on their line instead. It swings `sway` of the background's swing about its knot.
 */
const hangPose = (spider: SpiderPlan, cycle: number, phase: number, offset: number, seconds: number, once: number, twice: number) => {
  const drops = spider.travel > 0 && seconds >= TEIA_DROP_MIN_SECONDS;
  const {level, fall, pull} = drops ? spiderTimeline(cycle) : {level: 0, fall: 0, pull: 0};
  const bob = drops ? 0 : SPIDER_BOB * (1 - Math.cos(once * phase)) / 2;
  const length = spider.topY - spider.knotY + spider.travel * level + bob;
  const swing = spider.sway * (2.2 * Math.sin(twice * phase + offset) + 1 * wind(once * phase, spider.x)) * Math.PI / 180;
  return {
    length, swing, bodyX: spider.x + Math.sin(swing) * length, bodyY: spider.knotY + Math.cos(swing) * length,
    stride: 0.3 + 0.7 * (fall + pull), curl: 0.55 + 0.3 * fall - 0.35 * pull,
  };
};

const set: OrnamentSet<TeiaElement> = {
  name: 'teia',
  seedOffset: 60,
  minExtent: 6,
  place(frame, style) {
    const plan = planFor(frame, style.ornamentSize);
    return plan ? plan.placements.map((placement) => ({...placement})) : [];
  },
  build(frame, placements, style, frameIndex, durationInFrames) {
    const plan = planFor(frame, style.ornamentSize);
    if (!plan || plan.placements.length !== placements.length) return [];
    const {cool: silk, light: moonlight, warm} = ornamentPalette(style);
    const cycle = cycleOf(frameIndex, durationInFrames);
    const phase = TAU * cycle;
    const seconds = style.durationSeconds;
    // The background's per-cycle rhythms (12 s) as whole harmonics of this cycle.
    const once = harmonics(1 / BACKGROUND_SECONDS, seconds);
    const twice = harmonics(2 / BACKGROUND_SECONDS, seconds);
    const thrice = harmonics(3 / BACKGROUND_SECONDS, seconds);
    // Always the same draws in the same order, whichever motifs this size keeps.
    const random = ornamentRandom(style.seed, set);
    const offsets = {
      hero: {turn: random() * TAU, glow: Math.PI / 2 + (random() - 0.5) * 0.6, glint: (random() - 0.5) * 0.6, breath: random() * TAU, seed: Math.floor(random() * 1e6)},
      counter: {turn: random() * TAU, glow: Math.PI / 2 + (random() - 0.5) * 0.6, glint: (random() - 0.5) * 0.6, breath: random() * TAU, seed: Math.floor(random() * 1e6)},
      ember: random() * TAU,
      spider: random() * TAU,
      moon: random() * TAU,
      quiet: {turn: random() * TAU, glow: Math.PI / 2 + (random() - 0.5) * 0.6, glint: (random() - 0.5) * 0.6, breath: random() * TAU, seed: Math.floor(random() * 1e6)},
      // Drawn after every earlier phase (the webs and the spider never change with the garlands),
      // the broken ends last, so no other phase depends on how many a size holds.
      garland: {top: random() * TAU, bottom: random() * TAU},
      ends: plan.items.filter((item) => item.kind === 'end').map(() => random() * TAU),
    };
    let endIndex = 0;
    const moon = moonOf(frame, plan.hero);
    const lookOf = (fan: FanLayout, role: Role) => {
      const offset = offsets[role];
      const billow = wind(once * phase, fan.hubX);
      return {
        rotation: fanTurn(fan.radius) * Math.sin(once * phase + offset.turn),
        breath: 1 - WEB_LOOK[role].breath * (1 - Math.cos(twice * phase + offset.breath)) / 2,
        opacity: WEB_LOOK[role].opacity + 0.04 * Math.sin(once * phase + offset.turn),
        // Bright at frame 0 (the pack's PNG): the glow's phase sits near its peak.
        glow: 0.7 + 0.28 * Math.sin(once * phase + offset.glow),
        // The moonlight band sweeps the fan and past both edges, there and back twice a cycle; near the middle at frame 0.
        glint: 0.5 + 0.8 * Math.sin(twice * phase + offset.glint) + 0.2 * billow,
        billow,
      };
    };
    const looks = {hero: lookOf(plan.hero, 'hero'), counter: plan.counter ? lookOf(plan.counter, 'counter') : null};
    /**
     * A swag this frame: its sags breathing at 1× and its low point sliding at 2×, with a phase
     * that travels along the run; its dew flashes as the hero's moonlight band passes its place.
     */
    const swagNow = (run: GarlandRun, swag: SwagPlan) => {
      const wave = offsets.garland[run.slot] + Math.PI * swag.across;
      const breath = Math.sin(once * phase + wave);
      return {
        sags: swag.sags.map((sag, thread) => sag + GARLAND.breath[thread]! * breath),
        skew: GARLAND.skew * Math.sin(twice * phase + wave),
        flash: Math.exp(10 * (Math.cos(Math.PI * (swag.across - looks.hero.glint)) - 1)),
      };
    };
    // The quiet webs share one breeze and light each (their own hub's wind): computed per fan below.

    return plan.order.map((anchor): TeiaElement => {
      const item = plan.items[anchor]!;
      const placement = plan.placements[anchor]!;
      const base = {layer: placement.layer, anchor, x: placement.x, y: placement.y, light: 0, lightOpacity: 0};
      if (item.kind === 'web') {
        const {fan, role} = item;
        const look = role === 'hero' ? looks.hero : role === 'counter' ? looks.counter! : lookOf(fan, 'quiet');
        const {spokes, rings} = webThreadsFor(fan.radius);
        return {
          ...base, type: 'teia-web', reach: placement.extent, opacity: Math.min(1, look.opacity),
          hubX: fan.hubX, hubY: fan.hubY, webRadius: fan.radius, spokes, rings,
          // The broken ends hang down: only a fan opening downwards keeps them inside its envelope.
          tear: role === 'hero' && fan.radius >= 36 && rings >= 5 && Math.sin(fan.bisector) > 0 ? 1 : 0,
          // Each web its own seeded threads (the background seeds its webs seed + index·53).
          webSeed: offsets[role].seed + 53 * placement.slot.charCodeAt(1),
          dew: Math.max(0, dewCount(fan.radius) - (role === 'hero' ? 0 : role === 'counter' ? 1 : TEIA_QUIET_DEW)),
          rotation: look.rotation, breath: look.breath, glow: look.glow, glint: look.glint, billow: look.billow,
          moonX: moon.x, moonY: moon.y, silk, moonlight,
        };
      }
      if (item.kind === 'ember' || item.kind === 'moon') {
        // Lights only with glow (never on a Twitch panel, where place() leaves them out anyway).
        const look = item.kind === 'ember' ? TEIA_EMBER : TEIA_MOON;
        const light = frame.glow > 0 ? placement.extent : 0;
        return {
          ...base, type: item.kind === 'ember' ? 'teia-ember' : 'teia-moon', reach: 0, opacity: 1, light,
          lightOpacity: light > 0 ? look.opacity + look.swing * Math.sin(once * phase + offsets[item.kind]) : 0,
          color: item.kind === 'ember' ? warm : moonlight,
        };
      }
      if (item.kind === 'garland') {
        const {run, swag} = item;
        const piece = swag.pieces[item.piece]!;
        const now = swagNow(run, swag);
        // The moon seen from the swag's middle: C's lit edge and the beads' glints face it.
        const dx = moon.x - (swag.x0 + swag.x1) / 2;
        const dy = moon.y - ((swag.y0 + swag.y1) / 2 + now.sags[0]! / 2);
        const toMoon = Math.hypot(dx, dy) || 1;
        return {
          ...base, type: 'teia-guirlanda', reach: placement.extent, opacity: 1,
          x0: swag.x0, y0: swag.y0, x1: swag.x1, y1: swag.y1,
          sagC: now.sags[0]!, sagB: now.sags[1]!, sagA: now.sags[2] ?? now.sags[1]!, skew: now.skew, threads: now.sags.length,
          odd: swag.index % 2, tie0: swag.tie0, tie1: swag.tie1, tieTop: run.tieTop, flash: now.flash,
          lightX: dx / toMoon, lightY: dy / toMoon,
          clipX: piece.xa, clipWidth: piece.xb - piece.xa, clipY: piece.circle.y - piece.circle.r, clipHeight: 2 * piece.circle.r,
          silk, moonlight,
        };
      }
      if (item.kind === 'end') {
        const {run, end} = item;
        const swag = run.swags[end.swag]!;
        const now = swagNow(run, swag);
        const knot = swagPoint(swag, now.sags[end.thread]!, now.skew, end.u);
        const offset = offsets.ends[endIndex++]!;
        // ±swing° about its knot on the thread, twice a cycle; the middle trails the swing (the background's bend lag).
        const rotation = BROKEN_END.swing * Math.sin(twice * phase + offset);
        const rate = BROKEN_END.swing * twice * Math.cos(twice * phase + offset);
        const turn = rotation * Math.PI / 180;
        // The moon, seen from the tip, in the end's turned frame (the tip bead's glint faces it).
        const dx = moon.x - knot.x;
        const dy = moon.y - (knot.y + end.length);
        const [lx, ly] = [dx * Math.cos(turn) + dy * Math.sin(turn), -dx * Math.sin(turn) + dy * Math.cos(turn)];
        const toMoon = Math.hypot(lx, ly) || 1;
        const look = GARLAND.threads[end.thread]!;
        return {
          ...base, type: 'teia-fio', reach: placement.extent, opacity: 1,
          knotX: knot.x, knotY: knot.y, length: end.length, rotation, flash: now.flash,
          bend: end.side + Math.tanh(rate / 12) * BROKEN_END.lag,
          glow: 0.6 + 0.35 * Math.sin(twice * phase + offset + 1.1),
          // tanh, not sign: an end right under the moon is lit head-on.
          side: Math.tanh((moon.x - knot.x) / 40), lightX: lx / toMoon, lightY: ly / toMoon, silk, moonlight,
          width: look.width, silkOpacity: look.opacity,
        };
      }
      const spider = item.plan;
      const offset = offsets.spider;
      if (spider.pocket > 0 && item.kind === 'spider') {
        // Sitting in the corner's pocket, head toward the hub: only its legs step and it rises and settles a px.
        const bob = SPIDER_POCKET_BOB * (1 - Math.cos(once * phase)) / 2;
        const bodyX = spider.cx + spider.ux * bob;
        const bodyY = spider.cy + spider.uy * bob;
        const toMoon = Math.hypot(moon.x - spider.cx, moon.y - spider.cy) || 1;
        return {
          ...base, type: 'teia-spider', x: bodyX, y: bodyY, reach: spiderBodyReach(spider.scale), opacity: 1,
          bodyX, bodyY, scale: spider.scale, rotation: Math.atan2(-spider.ux, spider.uy) * 180 / Math.PI, curl: 0.55,
          stepSin: 0.3 * Math.sin(thrice * phase + offset), stepCos: 0.3 * Math.cos(thrice * phase + offset),
          glow: 0.6 + 0.35 * Math.sin(once * phase + offset),
          lightX: (moon.x - spider.cx) / toMoon, lightY: (moon.y - spider.cy) / toMoon,
          knotX: bodyX, knotY: bodyY, thread: 0, drawn: 0, silk, moonlight, mark: warm, body: '#120C1C',
        };
      }
      const {length, swing, bodyX, bodyY, stride, curl} = hangPose(spider, cycle, phase, offset, seconds, once, twice);
      if (item.kind === 'line') {
        // The upper part of a long resting line: from the knot down to where the spider's own part begins.
        const upper = length - spider.drawn;
        return {
          ...base, type: 'teia-linha', reach: placement.extent, opacity: 1,
          x1: spider.x, y1: spider.knotY, x2: spider.x + Math.sin(swing) * upper, y2: spider.knotY + Math.cos(swing) * upper,
          side: moon.x < spider.x ? -1 : 1, silk, moonlight,
        };
      }
      return {
        ...base, type: 'teia-spider', x: bodyX, y: bodyY,
        reach: spider.line ? spiderBodyReach(spider.scale) : Math.max(spiderBodyReach(spider.scale), length + 2.1), opacity: 1,
        bodyX, bodyY, scale: spider.scale,
        rotation: -swing * 180 / Math.PI - 0.8 * Math.sin(twice * phase + offset - 0.5),
        curl,
        stepSin: stride * Math.sin(thrice * phase + offset), stepCos: stride * Math.cos(thrice * phase + offset),
        glow: 0.6 + 0.35 * Math.sin(once * phase + offset),
        ...(() => {
          const dx = moon.x - spider.x;
          const dy = moon.y - spider.topY;
          const length = Math.hypot(dx, dy) || 1;
          return {lightX: dx / length, lightY: dy / length};
        })(),
        knotX: spider.x, knotY: spider.knotY, thread: length, drawn: spider.line ? spider.drawn : length + 1,
        silk, moonlight, mark: warm, body: '#120C1C',
      };
    });
  },
  render(element, key, context) {
    if (element.type === 'teia-ember' || element.type === 'teia-moon') {
      return (
        <RadialLight key={key} id={ornamentPartId(context, key, 'light')} x={element.x} y={element.y} radius={element.light}
          color={element.color} opacity={element.lightOpacity} falloff={0.45} />
      );
    }
    if (element.type === 'teia-fio') {
      return (
        <StrandFigure key={key} id={ornamentPartId(context, key, 'fio')} x={element.knotX} y={element.knotY} length={element.length}
          rotation={element.rotation} bend={element.bend} glow={element.glow} flash={element.flash} side={element.side} lightX={element.lightX}
          lightY={element.lightY} silk={element.silk} moonlight={element.moonlight} width={element.width} opacity={element.silkOpacity}
          lit={BROKEN_END.lit} litOpacity={BROKEN_END.litOpacity} litShift={BROKEN_END.litShift}
          bead={BROKEN_END.bead} grow={BROKEN_END.flash} rest={BROKEN_END.rest} fade={0} />
      );
    }
    if (element.type === 'teia-guirlanda') {
      // A swag's strips are contiguous in the drawing order: its first strip draws the whole swag once.
      const item = planFor(context.frame, context.style.ornamentSize)?.items[element.anchor];
      if (item?.kind !== 'garland' || item.piece !== 0) return null;
      const rects = item.swag.pieces.map((piece) => ({x: piece.xa, y: piece.circle.y - piece.circle.r, width: piece.xb - piece.xa, height: 2 * piece.circle.r}));
      return <GarlandFigure key={key} id={ornamentPartId(context, key, 'guirlanda')} draw={element} rects={rects} />;
    }
    if (element.type === 'teia-linha') {
      return (
        <Dragline key={key} x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} side={element.side}
          silk={element.silk} moonlight={element.moonlight} />
      );
    }
    if (element.type === 'teia-spider') {
      return (
        <SpiderFigure key={key} id={ornamentPartId(context, key, 'spider')} x={element.bodyX} y={element.bodyY} scale={element.scale}
          rotation={element.rotation} curl={element.curl} stepSin={element.stepSin} stepCos={element.stepCos} glow={element.glow}
          light={Math.atan2(element.lightY, element.lightX)} knotX={element.knotX} knotY={element.knotY} drawn={element.drawn} silk={element.silk} moonlight={element.moonlight}
          mark={element.mark} body={element.body} />
      );
    }
    // The fan's first piece draws the whole web once, clipped to the union of its cells (one path
    // of subpaths, never several clipPath children); the other pieces only hold their room.
    const piece = teiaPieceOf(context.frame, context.style.ornamentSize, element.anchor);
    if (!piece?.first) return null;
    const {bisector} = piece.fan;
    const spec: WebSpec = {
      radius: element.webRadius, spokes: element.spokes, rings: element.rings, tear: element.tear, seed: element.webSeed,
      bisector, dew: element.dew,
    };
    const clip = piece.fan.cells.map((cell) => cellPath(element.hubX, element.hubY, cell)).join('');
    return (
      <FanWeb key={key} id={ornamentPartId(context, key, 'web')} hubX={element.hubX} hubY={element.hubY} spec={spec}
        clipPath={clip} look={{
          rotation: element.rotation, breath: element.breath, opacity: element.opacity, glow: element.glow, glint: element.glint,
          billow: element.billow, moonX: element.moonX, moonY: element.moonY, silk: element.silk, moonlight: element.moonlight,
        }} />
    );
  },
};

/** The teia set (see the top of this file). */
export const teiaSet: OrnamentSet = set;
