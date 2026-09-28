import {clampRadius, offsetRoundRect, roundRectSdf, type RoundRect} from '../../geometry';
import {ceilHalf, cornerSlot, fitsAt, floorHalf, maxExtentAt, ORNAMENT_MAX_SLIDE, roomAt, scanAround, slideToFit, type OrnamentCorner} from '../place';
import type {OrnamentFrame, OrnamentPlacement, OrnamentSlotId} from '../types';
import {
  BRACKETS, candleBounds, candleHeight, DISH, type BracketId, type CandleBounds, type CandleKind, type Point,
} from './interior-candle';
import {
  FIXTURE_MARGIN, fixtureBounds, fixtureExtent, fixtureHeight, fixturePoints, FIXTURES, type FixtureKind, type FixtureMount,
} from './interior-girandole';
import {swagRun} from './interior-swag';

/**
 * Where the interior's fixtures stand (SPEC §2.6), a pure function of the frame and ornamentSize.
 *
 * First choice everywhere: brass girandoles (interior-girandole.ts), see placeGirandoles below.
 * ornamentSize is then a fixture's full height H in px (mount to the tallest flame tip), and each
 * sits at the best spot of its slot (roomAt), so the room, not the preset, limits it.
 *
 * Fallback (a slot too small for a girandole: the Twitch panel, tiny custom bleeds): the
 * chamberstick candles below. ornamentSize is then the hero's full height in px: the tall candle ('alta') from its dish's foot to
 * the tip of its flame at the tallest flicker. The other candles share the hero's scale (the same
 * flame and dish) with shorter wax: 'media' is MEDIA_RATIO and 'baixa' BAIXA_RATIO of the hero's
 * height. Each candle is one placement: a circle holding its body, its flickering flame and its
 * light; the light shrinks (down to LIGHT.min) before the candle does.
 *
 *   - Panels and windows with room above the top edge (chat, blocks, webcams, gameplay): standing on the
 *     top edge like on a mantel: the hero and the short one at TR, a medium one at TL; a wide
 *     window (gameplay) adds three at the top centre, the chandelier's echo.
 *   - Rings (round blocks and webcams): on brass brackets from the ±45° upper diagonals (TR hero, TL
 *     medium). A round block's accent arc takes its slots: 'esquerda' keeps TR and moves the second
 *     to the right side (0°); 'topo' moves both to the sides (0° and 180°).
 *   - A panel with no room above (the Twitch panel): on the inner sill, in the side padding pockets
 *     (BR hero and its twin at BL, unless the left accent bar is there), like the hall's floor
 *     candelabra at both lower corners.
 *   - Screen frames (screen): in the band's bottom corners, rising along the side bands (BR hero, BL);
 *     with a large corner radius, up the band's rounded corner.
 *   - A short straight top edge (a pill-shaped chat): the three stand together at its middle.
 *
 * No two candles' dishes ever overlap: a foot whose dish meets one already placed is skipped.
 *
 * A secondary candle smaller than its minimum (or than 85 % of the hero's scale) is dropped; the
 * hero is refused only below HERO_MIN px (or its nominal, when smaller).
 */

/** Shares of the hero's height (the three kinds' full heights at the same scale). */
export const MEDIA_RATIO = candleHeight('media') / candleHeight('alta');
export const BAIXA_RATIO = candleHeight('baixa') / candleHeight('alta');
/** The hero's least height, px (its extent is then ≥ the set's minExtent). */
export const HERO_MIN = 15;
/** Secondaries' least heights, px: under these the candle is left out. */
export const SECONDARY_MIN: Record<CandleKind, number> = {alta: 22, media: 24, baixa: 22};
/** A secondary may shrink to this share of the hero's scale before it is dropped. */
const SECONDARY_SCALE = 0.85;
/**
 * The light's radius per unit of scale (px at a 1-unit candle, ≈ 30 px tall): nominal and least.
 * With the kind's glow at 0 (a Twitch panel) there is no light and no room is kept for it.
 */
export const LIGHT = {nominal: 15, min: 8} as const;
/** px added to every reach: the outlines' strokes (the flame's is 1.2 px, non-scaling). */
export const OUTLINE_MARGIN = 0.6;
/** The body's outline half-width per unit of scale (its stroke is max(0.7, 0.7 u) px). */
const BODY_OUTLINE = 0.35;
/** px added to the body's reach at scale u: its outline's half-width, never under OUTLINE_MARGIN. */
export const bodyMargin = (u: number) => Math.max(OUTLINE_MARGIN, BODY_OUTLINE * u);
/** How far the dish sinks into the surface it stands on (over the stroke), px. */
const SINK = 1;
/** Spacing between neighbouring candles' axes, in units (the dishes are 14 u wide). */
const PAIR_GAP = 16;
/** A candle's axis from the end of the straight top edge, in units. */
const CORNER_INSET = 8;
/** Windows at least this wide (gameplay, webcam-16x9-lg) add the top-centre fixture (and, as chambersticks, the three-candle cluster). */
export const CLUSTER_MIN_WIDTH = 900;
/** Height steps of the search, px. */
const STEP = 0.5;


export type CandleSpec = {kind: CandleKind; dir: 1 | -1; bracket: BracketId | null};

/**
 * Chambersticks hang on brackets only in the ring family (a round panel or window); a screen frame,
 * even a round one, stands them on its band (telaStands). Placement and build both ask this.
 */
const onBrackets = (frame: Pick<OrnamentFrame, 'circle' | 'fit'>) => frame.circle && frame.fit !== 'screen';

/** The candle a placement holds: its kind (the motif), its side (dir) and its bracket, from the slot and the frame. */
export const candleOf = (frame: OrnamentFrame, placement: Pick<OrnamentPlacement, 'motif' | 'slot' | 'x'>): CandleSpec => {
  const kind = (['alta', 'media', 'baixa'] as const).find((name) => placement.motif === `vela-${name}`) ?? 'alta';
  const left = placement.slot === 'TL' || placement.slot === 'BL' || placement.slot === 'left'
    || (placement.slot === 'top' && placement.x < frame.outline.x + frame.outline.width / 2 - 1);
  const bracket: BracketId | null = onBrackets(frame) ? (placement.slot === 'left' || placement.slot === 'right' ? 'side' : 'diagonal') : null;
  return {kind, dir: left ? -1 : 1, bracket};
};

/** The scale (px per candle unit) of a placement. */
export const scaleOf = (placement: Pick<OrnamentPlacement, 'size'>, kind: CandleKind) => placement.size / candleHeight(kind);

/** The placement's centre from the candle's foot: the bounds' centre, mirrored by dir, at scale u. */
const centreFrom = (foot: Point, bounds: CandleBounds, u: number, dir: 1 | -1): Point =>
  ({x: foot.x + dir * u * bounds.centre.x, y: foot.y + u * bounds.centre.y});

/** The candle's foot back from its placement (the inverse of centreFrom). */
export const footOf = (placement: Pick<OrnamentPlacement, 'x' | 'y'>, spec: CandleSpec, u: number): Point => {
  const bounds = candleBounds(spec.kind, spec.bracket);
  return {x: placement.x - spec.dir * u * bounds.centre.x, y: placement.y - u * bounds.centre.y};
};

/** The extent a candle needs at scale u with a light of radius `light` px. */
export const extentFor = (bounds: CandleBounds, u: number, light: number) =>
  ceilHalf(Math.max(u * bounds.radius + bodyMargin(u), u * bounds.lightOffset + light));

/** The largest light (px) a placement leaves the candle: never above the nominal, 0 without glow. */
export const lightFor = (frame: Pick<OrnamentFrame, 'glow'>, placement: Pick<OrnamentPlacement, 'extent'>, bounds: CandleBounds, u: number) =>
  (frame.glow > 0 ? Math.max(0, Math.min(LIGHT.nominal * u, placement.extent - u * bounds.lightOffset)) : 0);

/** A stand: where one candle may go, its foot as a function of the scale (several candidate feet allowed). */
type Stand = {
  slot: OrnamentSlotId; kind: CandleKind; dir: 1 | -1; bracket: BracketId | null;
  feet: (u: number) => readonly Point[];
  /** Extra condition on a foot (a screen frame's candle stays inside the rounded outline). */
  footOk?: (foot: Point, u: number) => boolean;
  /** The hero's mirror image (the sill and the screen frame's corners): kept at any size the hero has. */
  twin?: boolean;
};

type Fit = {placement: OrnamentPlacement; u: number};

/** A dish's horizontal span as drawn, px: its half-width and its outline (two dishes may not even touch). */
type Span = {left: number; right: number};
const dishSpan = (footX: number, u: number): Span => ({left: footX - DISH.rx * u - bodyMargin(u), right: footX + DISH.rx * u + bodyMargin(u)});
const meets = (a: Span, b: Span) => a.left < b.right && b.left < a.right;

/** The dish spans of the candles placed so far. */
const spansOf = (frame: OrnamentFrame, placements: readonly OrnamentPlacement[]): Span[] =>
  placements.map((placement) => {
    const spec = candleOf(frame, placement);
    const u = scaleOf(placement, spec.kind);
    return dishSpan(footOf(placement, spec, u).x, u);
  });

/**
 * One candle at scale u on its stand, the first foot that holds it with at least the least light
 * and whose dish stays clear of the dishes in `taken`; null if none.
 */
const tryStand = (frame: OrnamentFrame, stand: Stand, u: number, taken: readonly Span[] = []): Fit | null => {
  const bounds = candleBounds(stand.kind, stand.bracket);
  const lights = frame.glow > 0 ? [LIGHT.nominal, 13, 11, 9.5, LIGHT.min] : [0];
  const least = lights[lights.length - 1]!;
  for (const foot of stand.feet(u)) {
    if (stand.footOk && !stand.footOk(foot, u)) continue;
    if (taken.length > 0) {
      const span = dishSpan(foot.x, u);
      if (taken.some((other) => meets(span, other))) continue;
    }
    const centre = centreFrom(foot, bounds, u, stand.dir);
    if (!fitsAt(frame, centre.x, centre.y, extentFor(bounds, u, least * u), 'front')) continue;
    // The candle fits: now the largest light that still does (the light shrinks first).
    for (const light of lights) {
      const extent = extentFor(bounds, u, light * u);
      if (fitsAt(frame, centre.x, centre.y, extent, 'front')) {
        return {
          u,
          placement: {
            motif: `vela-${stand.kind}`, slot: stand.slot, layer: 'front', x: centre.x, y: centre.y, extent,
            size: u * candleHeight(stand.kind),
          },
        };
      }
    }
  }
  return null;
};

/**
 * The largest height at which the stand holds its candle: `from` itself, then down in STEP steps
 * (on the half pixel) to `least`.
 */
const largestFit = (frame: OrnamentFrame, stand: Stand, from: number, least: number, taken: readonly Span[] = []): Fit | null => {
  const height = candleHeight(stand.kind);
  const sizes = [from];
  for (let size = floorHalf(from - 1e-9); size >= least - 1e-9; size -= STEP) sizes.push(size);
  for (const size of sizes) {
    if (size < least - 1e-9) break;
    const fit = tryStand(frame, stand, size / height, taken);
    if (fit) return fit;
  }
  return null;
};

/** A secondary at the hero's scale, or somewhat smaller; null (dropped) under its minimum. */
const secondary = (frame: OrnamentFrame, stand: Stand, heroScale: number, taken: readonly Span[]): OrnamentPlacement | null => {
  const height = candleHeight(stand.kind);
  const least = Math.max(stand.twin ? Math.min(HERO_MIN, heroScale * height) : SECONDARY_MIN[stand.kind], SECONDARY_SCALE * heroScale * height);
  return largestFit(frame, stand, heroScale * height, least, taken)?.placement ?? null;
};

/** The straight top edge's ends and the surface the candles stand on. */
const topEdge = (frame: OrnamentFrame) => {
  const {outline} = frame;
  const r = clampRadius(outline.radius, outline.width, outline.height);
  return {left: outline.x + r, right: outline.x + outline.width - r, y: outline.y + SINK, centre: outline.x + outline.width / 2};
};

/**
 * The top edge's stands. When the straight edge is too short for the corner layout at the nominal
 * size (a pill-shaped panel), the three stand together at its middle: short, tall, medium.
 */
const topStands = (frame: OrnamentFrame, ornamentSize: number) => {
  const edge = topEdge(frame);
  const nominal = ornamentSize / candleHeight('alta');
  if (edge.right - edge.left < (2 * CORNER_INSET + PAIR_GAP + 2 * DISH.rx + 2) * nominal) {
    return {
      hero: {slot: 'top', kind: 'alta', dir: 1, bracket: null, feet: () => [{x: edge.centre, y: edge.y}]} as Stand,
      secondaries: [
        {slot: 'top', kind: 'baixa', dir: -1, bracket: null, feet: (u) => [{x: edge.centre - PAIR_GAP * u, y: edge.y}]},
        {slot: 'top', kind: 'media', dir: 1, bracket: null, feet: (u) => [{x: edge.centre + PAIR_GAP * u, y: edge.y}]},
      ] as Stand[],
      cluster: [] as Stand[],
    };
  }
  const hero: Stand = {slot: 'TR', kind: 'alta', dir: 1, bracket: null, feet: (u) => [{x: edge.right - CORNER_INSET * u, y: edge.y}]};
  const partner: Stand = {slot: 'TR', kind: 'baixa', dir: 1, bracket: null, feet: (u) => [{x: edge.right - (CORNER_INSET + PAIR_GAP) * u, y: edge.y}]};
  const single: Stand = {slot: 'TL', kind: 'media', dir: -1, bracket: null, feet: (u) => [{x: edge.left + CORNER_INSET * u, y: edge.y}]};
  const cluster: Stand[] = [
    {slot: 'top', kind: 'baixa', dir: -1, bracket: null, feet: (u) => [{x: edge.centre - PAIR_GAP * u, y: edge.y}]},
    {slot: 'top', kind: 'alta', dir: 1, bracket: null, feet: () => [{x: edge.centre, y: edge.y}]},
    {slot: 'top', kind: 'baixa', dir: 1, bracket: null, feet: (u) => [{x: edge.centre + PAIR_GAP * u, y: edge.y}]},
  ];
  return {hero, secondaries: [partner, single], cluster: frame.fit === 'window' && frame.outline.width >= CLUSTER_MIN_WIDTH ? cluster : []};
};

/** The stroke's width on a panel: the track runs half of it inside the outline. */
const panelStroke = (frame: OrnamentFrame) => Math.max(0, 2 * (frame.track.y - frame.outline.y));

/** Feet along a horizontal surface, nearest `prefer` first, `from`…`to` every 0.5 px. */
const feetAlong = (from: number, to: number, y: number, prefer: number): Point[] =>
  scanAround(Math.min(from, to), Math.max(from, to), prefer, STEP).map((x) => ({x, y}));

/** A panel with no room above (the Twitch panel): on the inner sill, in the side padding pockets. */
const sillStands = (frame: OrnamentFrame) => {
  const {outline} = frame;
  const stroke = panelStroke(frame);
  const y = outline.y + outline.height - stroke + SINK;
  const inner = {left: outline.x + stroke, right: outline.x + outline.width - stroke};
  const text = frame.keepOut.length > 0
    ? {left: Math.min(...frame.keepOut.map((area) => area.x)), right: Math.max(...frame.keepOut.map((area) => area.x + area.width))}
    : {left: inner.left + outline.width / 4, right: inner.right - outline.width / 4};
  const reach = Math.max(8, Math.min(64, outline.width / 4));
  const pocket = (side: 1 | -1) => (side > 0 ? (text.right + inner.right) / 2 : (inner.left + text.left) / 2);
  const hero: Stand = {
    slot: 'BR', kind: 'alta', dir: 1, bracket: null, feet: () => feetAlong(inner.right, inner.right - reach, y, pocket(1)),
  };
  const single: Stand = {
    slot: 'BL', kind: 'alta', dir: -1, bracket: null, twin: true, feet: () => feetAlong(inner.left, inner.left + reach, y, pocket(-1)),
  };
  return {hero, secondaries: frame.accent === 'esquerda' ? [] : [single], sill: true};
};

/** On the sill, the hero's short partner stands this far (px) left of the hero's foot: the two dishes stay apart. */
export const SILL_PAIR_GAP = 14;

/** Feet up a screen frame's rounded corner, on the band's midline, every ARC_STEP degrees from the bottom rail to the side band. */
const ARC_STEP = 5;
/** Offsets (px) from the band's midline towards the outline tried at each step of the arc. */
const ARC_OUT = [0, 4, 8, 12] as const;

/**
 * Screen frames: in the band's bottom corners, the flame rising along the side band; the dish
 * inside the rounded outline. First the feet on the bottom rail's rows; then, when a large corner
 * radius cuts those away, feet up the band's corner arc (lowest first).
 */
const telaStands = (frame: OrnamentFrame) => {
  const {outline, box} = frame;
  const hole = frame.hole ?? {...box, radius: 0};
  const bottom = box.y + box.height;
  const footOk = (foot: Point, u: number) => [-7, 0, 7].every((dx) => roundRectSdf(outline, foot.x + dx * u, foot.y) <= -1);
  const corner = (side: 1 | -1) => () => {
    const bandLeft = side > 0 ? hole.x + hole.width : box.x;
    const bandRight = side > 0 ? box.x + box.width : hole.x;
    const middle = (bandLeft + bandRight) / 2;
    const feet: Point[] = [];
    for (let y = bottom - 1; y >= hole.y + hole.height; y -= 1) {
      for (let x = bandLeft - 8; x <= bandRight + 8; x += 1) feet.push({x, y});
    }
    // Lowest first (standing on the frame's bottom rail), then nearest the side band's middle.
    feet.sort((a, b) => b.y - a.y || Math.abs(a.x - middle) - Math.abs(b.x - middle) || a.x - b.x);
    // Up the corner arc: the band's midline around the window's corner centre, 0° (under it) to 90° (beside it).
    const band = bottom - (hole.y + hole.height);
    const centre = {x: side > 0 ? hole.x + hole.width - hole.radius : hole.x + hole.radius, y: hole.y + hole.height - hole.radius};
    for (let degrees = 0; degrees <= 90; degrees += ARC_STEP) {
      const angle = (degrees * Math.PI) / 180;
      // The midline first, then out towards the outline (the flame may then lean over the canvas corner).
      for (const out of ARC_OUT) {
        const radius = hole.radius + band / 2 + out;
        feet.push({x: centre.x + side * radius * Math.sin(angle), y: centre.y + radius * Math.cos(angle)});
      }
    }
    return feet;
  };
  const hero: Stand = {slot: 'BR', kind: 'alta', dir: 1, bracket: null, feet: corner(1), footOk};
  const single: Stand = {slot: 'BL', kind: 'alta', dir: -1, bracket: null, feet: corner(-1), footOk, twin: true};
  return {hero, secondaries: [single]};
};

/** Rings: brass brackets from the ±45° upper diagonals, or from the sides when a round block's top accent takes them. */
const ringStands = (frame: OrnamentFrame) => {
  const {outline} = frame;
  const r = Math.min(outline.width, outline.height) / 2;
  const cx = outline.x + outline.width / 2;
  const cy = outline.y + outline.height / 2;
  const stand = (slot: OrnamentSlotId, kind: CandleKind, degrees: number, dir: 1 | -1, bracket: BracketId): Stand => {
    const angle = (degrees * Math.PI) / 180;
    const root = {x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle)};
    const {root: offset} = BRACKETS[bracket];
    return {slot, kind, dir, bracket, feet: (u) => [{x: root.x - dir * u * offset.x, y: root.y - u * offset.y}]};
  };
  if (frame.accent === 'topo') return {hero: stand('right', 'alta', 0, 1, 'side'), secondaries: [stand('left', 'media', 180, -1, 'side')]};
  const hero = stand('TR', 'alta', 45, 1, 'diagonal');
  // The left accent arc takes TL (and the left side): the second sconce goes to the right side instead.
  return {hero, secondaries: [frame.accent === 'esquerda' ? stand('right', 'baixa', 0, 1, 'side') : stand('TL', 'media', 135, -1, 'diagonal')]};
};

/** The interior's placements: the hero first; [] when it fits nowhere (the schema then refuses). */
export const placeCandles = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement[] =>
  placeGirandoles(frame, ornamentSize) ?? placeChambersticks(frame, ornamentSize);

/** The chamberstick fallback: the hero first; [] when it fits nowhere. */
const placeChambersticks = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement[] => {
  const nominal = ornamentSize;
  const heroLeast = Math.min(HERO_MIN, floorHalf(nominal));
  let layout: {hero: Stand; secondaries: Stand[]; cluster?: Stand[]; sill?: boolean} | null = null;
  let hero: Fit | null = null;
  const families = frame.fit === 'screen' ? [telaStands(frame)] : onBrackets(frame) ? [ringStands(frame)] : [topStands(frame, ornamentSize), sillStands(frame)];
  for (const family of families) {
    hero = largestFit(frame, family.hero, nominal, heroLeast);
    if (hero) {
      layout = family;
      break;
    }
  }
  if (!layout || !hero) return [];
  const placements = [hero.placement];
  if (layout.sill) {
    // The sill's pair (AD round 2): a short candle SILL_PAIR_GAP px left of the hero, at the hero's
    // scale or a little smaller (a twin: it keeps any size the hero has), in the same pocket.
    const foot = footOf(hero.placement, candleOf(frame, hero.placement), hero.u);
    const partner: Stand = {slot: 'BR', kind: 'baixa', dir: 1, bracket: null, twin: true, feet: () => [{x: foot.x - SILL_PAIR_GAP, y: foot.y}]};
    const placement = secondary(frame, partner, hero.u, spansOf(frame, placements));
    if (placement) placements.push(placement);
  }
  for (const stand of layout.secondaries) {
    const placement = secondary(frame, stand, hero.u, spansOf(frame, placements));
    if (placement) placements.push(placement);
  }
  // The cluster stays whole: all three at the hero's scale, each at least its minimum, clear of each other, or none.
  const cluster: (OrnamentPlacement | null)[] = [];
  for (const stand of layout.cluster ?? []) {
    const taken = spansOf(frame, [...placements, ...cluster.filter((entry): entry is OrnamentPlacement => !!entry)]);
    cluster.push(hero.u * candleHeight(stand.kind) >= SECONDARY_MIN[stand.kind] - 1e-9 ? tryStand(frame, stand, hero.u, taken)?.placement ?? null : null);
  }
  if (cluster.length > 0 && cluster.every(Boolean)) placements.push(...(cluster as OrnamentPlacement[]));
  return placements;
};

/* ------------------------------------------------------------------------------ girandoles */

/**
 * The girandoles' layout (ART DIRECTION round 1):
 *
 *   - Rect panels and windows: the hero 'candelabro-3' at TR, a 'candelabro-2' mirrored at TL, both
 *     on rosettes on the frame's side line at the corner, centred at the slot's best spot (roomAt).
 *     Short labels (a block ≤ COMPACT_HEIGHT tall): one 'candelabro-2' at TR only.
 *   - Wide windows (gameplay, webcam-16x9-lg: width ≥ CLUSTER_MIN_WIDTH): a 'candelabro-3' standing on
 *     the band at the top centre (the chandelier's echo), and wall sconces ('arandela') on both
 *     sides, SIDE_SPACING px apart, centred on the side's straight stretch.
 *   - Wide blocks and windows (lower-third, title, gameplay, webcam-16x9-lg: width ≥ CLUSTER_MIN_WIDTH): the
 *     hall's red-velvet swag valance hanging from the bottom line into the bleed (interior-swag.tsx),
 *     a festoon per fixed pitch along the straight stretch.
 *   - Rings: the hero at the 45° upper right, a 'candelabro-2' at the upper left; a round block's
 *     accent arc moves them to the sides (0°, 180°).
 *   - Screen frames (screen): 'candelabro-3' standing on the bottom rail in both bottom band corners,
 *     'candelabro-2' in the top ones, sconces up both side bands (SIDE_SPACING px apart), and the
 *     swag valance across the top band between the top corners' fixtures.
 *
 * Every size is fixed px from ornamentSize (the fixture's full height) or the room of its slot,
 * whichever is smaller; more fixtures along longer edges, never larger ones. Two placements keep
 * their circles 2 px apart (two festoons of the valance abut: they are exempt). A secondary below GIRANDOLE_MIN is dropped; when the hero is below
 * GIRANDOLE_HERO_MIN (or its nominal, when smaller) the chambersticks take over.
 */

/** The girandole hero's least extent, px (H ≈ 30): below it the chamberstick fallback is used. */
export const GIRANDOLE_HERO_MIN = 16;
/** A secondary fixture's least extent, px (H ≈ 22). */
export const GIRANDOLE_MIN = 12;
/** Blocks at most this tall (etiquetas) carry one 'candelabro-2' only. */
export const COMPACT_HEIGHT = 96;
/** Sconces along a long side: px between them; each stays ≥ half of it from the side's corner slots. */
export const SIDE_SPACING = 320;
/** How far inside a ring (px, along the slot's diagonal) a fixture's centre may slide: its rosette then still meets the ring. */
const RING_INSET = 4;
/** The hero's partner (the other corner's fixture) is dropped when shorter than this share of the hero. */
export const PARTNER_SHARE = 0.85;
/** Least gap between two placements' circles, px. */
const PLACEMENT_GAP = 2;

/** Standing girandoles along a wide window's top rail: px from the centre, each ≥ TOP_CORNER px from the corners. */
export const TOP_SPACING = 400;
export const TOP_CORNER = 240;
/** How far (px) a screen frame's corner girandole may move to keep its drawing off the picture. */
const WINDOW_SLIDE = 32;

/** The motif id of a fixture on a mount ('-pe': standing on its domed foot). */
export const fixtureMotif = (kind: FixtureKind, mount: FixtureMount) => (mount === 'foot' ? `${kind}-pe` : kind);

/** A placement's fixture (null: a chamberstick candle or a festoon), its mount and its side. */
export const fixtureOf = (placement: Pick<OrnamentPlacement, 'motif' | 'slot'>): {kind: FixtureKind; mount: FixtureMount; dir: 1 | -1} | null => {
  const foot = placement.motif.endsWith('-pe');
  const kind = (foot ? placement.motif.slice(0, -3) : placement.motif) as FixtureKind;
  if (kind !== 'candelabro-3' && kind !== 'candelabro-2' && kind !== 'arandela') return null;
  const left = placement.slot === 'TL' || placement.slot === 'BL' || placement.slot === 'left';
  return {kind, mount: foot ? 'foot' : 'rosette', dir: left ? -1 : 1};
};

/** A fixture's mount point (the middle of its lowest edge, on the axis) from its placement. */
export const fixtureOrigin = (placement: Pick<OrnamentPlacement, 'x' | 'y' | 'size'>, centre: Point, dir: 1 | -1): Point =>
  ({x: placement.x - dir * centre.x * placement.size, y: placement.y - centre.y * placement.size});

/**
 * A screen frame's picture: the window (holeShape is the window shrunk by the glow; the glow margin
 * between them shows the picture). Rebuilt from the outline, which is the window grown by the
 * band's whole thickness.
 */
export const pictureOf = (frame: OrnamentFrame): RoundRect | null => {
  if (!frame.hole) return null;
  const thickness = frame.hole.x - frame.outline.x - frame.glow;
  return offsetRoundRect(frame.outline, -thickness);
};

/** Every point a fixture draws (body, flickering flames, halos), px, with the stroke's reach past it. */
export const fixtureDrawn = (placement: OrnamentPlacement): {x: number; y: number; margin: number}[] => {
  const fixture = fixtureOf(placement);
  if (!fixture) return [];
  const bounds = fixtureBounds(fixture.kind, fixture.mount);
  const origin = fixtureOrigin(placement, bounds.centre, fixture.dir);
  const h = placement.size;
  const map = (point: Point) => ({x: origin.x + fixture.dir * h * point.x, y: origin.y + h * point.y});
  const {body, flames} = fixturePoints(fixture.kind, fixture.mount);
  const halos = bounds.halos.flatMap((halo) => Array.from({length: 24}, (_, index) => {
    const angle = (index / 24) * 2 * Math.PI;
    const centre = map(halo);
    const radius = halo.radius * h + FIXTURE_MARGIN - 0.5;
    return {x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle), margin: 0};
  }));
  // Halos and flames first: they are what reaches the picture, so a failing check stops early.
  return [...halos, ...flames.map((point) => ({...map(point), margin: 0.6})), ...body.map((point) => ({...map(point), margin: FIXTURE_MARGIN}))];
};

/** Whether nothing a fixture draws comes within 1 px of the picture (sdf ≥ 1 outside it). */
export const clearOfPicture = (placement: OrnamentPlacement, picture: RoundRect) =>
  roundRectSdf(picture, placement.x, placement.y) - placement.extent >= 1 - 1e-9
  || fixtureDrawn(placement).every((point) => roundRectSdf(picture, point.x, point.y) - point.margin >= 1 - 1e-9);

const clearOf = (placement: OrnamentPlacement, placed: readonly OrnamentPlacement[]) =>
  placed.every((other) => Math.hypot(placement.x - other.x, placement.y - other.y) >= placement.extent + other.extent + PLACEMENT_GAP - 1e-9);

/**
 * A fixture at a slot: its extent is the nominal (ornamentSize tall) or the slot's room, whichever
 * is smaller, centred at the slot's best spot (roomAt); null under `min` (the hero: under
 * min(min, nominal)).
 */
const fixtureAt = (
  frame: OrnamentFrame, corner: OrnamentCorner, slot: OrnamentSlotId, kind: FixtureKind, mount: FixtureMount,
  ornamentSize: number, min: number, hero = false,
): OrnamentPlacement | null => {
  // On a ring the fixture stays outside it (its rosette on the ring), never slides in over the panel.
  const range = frame.circle ? {min: -RING_INSET, max: ORNAMENT_MAX_SLIDE} : undefined;
  const room = roomAt(frame, corner, 'front', range);
  const nominal = ceilHalf(fixtureExtent(kind, mount, ornamentSize));
  const extent = Math.min(nominal, room.extent);
  const least = hero ? Math.min(min, nominal) : min;
  if (!(extent > 0) || extent < least - 1e-9) return null;
  if (frame.circle) return onRing(frame, corner, slot, kind, mount, ornamentSize, extent, Math.min(extent, Math.max(least, RING_SHARE * room.extent)), range!);
  const spot = slideToFit(frame, corner, extent, 'front', range, room.t);
  if (!spot) return null;
  return {motif: fixtureMotif(kind, mount), slot, layer: 'front', x: spot.x, y: spot.y, extent, size: heightIn(kind, mount, extent, ornamentSize)};
};

/** A ring fixture may give up this share of its room to keep its rosette on the ring. */
const RING_SHARE = 0.86;

/**
 * A fixture on a ring (AD round 2: at the room's best spot a large fixture's rosette floated off
 * the ring): at the slide nearest the one that sets its rosette on the ring's outline; when the
 * room keeps it off (a round webcam, whose window the circle must clear), a little smaller (down
 * to RING_SHARE of the room) until the rosette meets the outline, or else at `extent`.
 */
const onRing = (
  frame: OrnamentFrame, corner: OrnamentCorner, slot: OrnamentSlotId, kind: FixtureKind, mount: FixtureMount,
  ornamentSize: number, extent: number, least: number, range: {min: number; max: number},
): OrnamentPlacement | null => {
  const {outline} = frame;
  const r = Math.min(outline.width, outline.height) / 2;
  const cx = outline.x + outline.width / 2;
  const cy = outline.y + outline.height / 2;
  const dir = corner.dx < 0 ? -1 : 1;
  const at = (size: number, t: number) => {
    const origin = fixtureOrigin({x: corner.x + t * corner.dx, y: corner.y + t * corner.dy, size}, fixtureBounds(kind, mount).centre, dir);
    const rosette = FIXTURES[kind].rosette * size;
    return {off: Math.hypot(origin.x - cx, origin.y - rosette - cy) - r, rosette};
  };
  let first: OrnamentPlacement | null = null;
  for (let e = extent; e >= least - 1e-9; e -= STEP) {
    const size = heightIn(kind, mount, e, ornamentSize);
    // The slide that sets the rosette's centre half its radius inside the outline, every 0.5 px.
    let prefer = range.min;
    let miss = Infinity;
    for (let t = range.min; t <= Math.min(range.max, 2 * size) + 1e-9; t += STEP) {
      const {off, rosette} = at(size, t);
      if (Math.abs(off + rosette / 2) < miss - 1e-9) [prefer, miss] = [t, Math.abs(off + rosette / 2)];
    }
    const spot = slideToFit(frame, corner, e, 'front', range, prefer);
    if (!spot) continue;
    const placement: OrnamentPlacement = {motif: fixtureMotif(kind, mount), slot, layer: 'front', x: spot.x, y: spot.y, extent: e, size};
    first ??= placement;
    const {off, rosette} = at(size, spot.t);
    if (off <= rosette) return placement;
  }
  return first;
};

/** A fixture's height in an extent (whole 0.5 px steps): ornamentSize when the extent holds it, else as tall as it holds. */
const heightIn = (kind: FixtureKind, mount: FixtureMount, extent: number, ornamentSize: number) =>
  Math.min(ornamentSize, fixtureHeight(kind, mount, extent));

/** The spot of most room on the segment from `a` to `b` (every 0.5 px; ties: nearest `a`), and that room floored to 0.5 px. */
const bestOnSegment = (frame: OrnamentFrame, a: Point, b: Point) => {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(length / STEP));
  let best = {x: a.x, y: a.y, room: -Infinity};
  for (let index = 0; index <= steps; index++) {
    const x = a.x + ((b.x - a.x) * index) / steps;
    const y = a.y + ((b.y - a.y) * index) / steps;
    const room = maxExtentAt(frame, x, y, 'front');
    if (room > best.room + 1e-9) best = {x, y, room};
  }
  return {x: best.x, y: best.y, room: floorHalf(best.room)};
};

/** A fixture centred at a spot with `room` there (a line search's best); null under `min`. */
const fixtureOnSpot = (
  spot: {x: number; y: number; room: number}, slot: OrnamentSlotId, kind: FixtureKind, mount: FixtureMount, ornamentSize: number, min: number,
): OrnamentPlacement | null => {
  const extent = Math.min(ceilHalf(fixtureExtent(kind, mount, ornamentSize)), spot.room);
  if (!(extent >= min - 1e-9)) return null;
  return {motif: fixtureMotif(kind, mount), slot, layer: 'front', x: spot.x, y: spot.y, extent, size: heightIn(kind, mount, extent, ornamentSize)};
};

/** A virtual slot on a ring at `degrees` (0: right, 180: left), sliding out along the radius. */
const ringSlot = (frame: OrnamentFrame, degrees: number): OrnamentCorner => {
  const {outline} = frame;
  const r = Math.min(outline.width, outline.height) / 2;
  const angle = (degrees * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = -Math.sin(angle);
  return {slot: 'TR', index: 0, x: outline.x + outline.width / 2 + r * dx, y: outline.y + outline.height / 2 + r * dy, dx, dy};
};

/** How many fit along a stretch at `spacing` px, each ≥ spacing/2 from its ends, and their offsets from its middle. */
const rowOffsets = (length: number, spacing: number) => {
  const count = Math.max(0, Math.floor(length / spacing + 1e-9));
  return Array.from({length: count}, (_, index) => (index - (count - 1) / 2) * spacing);
};

/** Sconces up both sides of a frame (a wide window's outer line, or a screen frame's side bands). */
const sideSconces = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement[] => {
  const {outline} = frame;
  const r = clampRadius(outline.radius, outline.width, outline.height);
  const middle = outline.y + outline.height / 2;
  const reach = 64;
  const limit = frame.paintLimit;
  const placements: OrnamentPlacement[] = [];
  // The stretch between the side's two corner slots (the middles of its round corners).
  for (const offset of rowOffsets(outline.height - 2 * r * (1 - Math.SQRT1_2), SIDE_SPACING)) {
    const y = middle + offset;
    for (const side of ['right', 'left'] as const) {
      const spot = side === 'right'
        ? bestOnSegment(frame, {x: outline.x + outline.width - reach, y}, {x: limit.x + limit.width, y})
        : bestOnSegment(frame, {x: outline.x + reach, y}, {x: limit.x, y});
      const placement = fixtureOnSpot(spot, side, 'arandela', 'rosette', ornamentSize, GIRANDOLE_MIN);
      if (placement) placements.push(placement);
    }
  }
  return placements;
};

/** The top-centre fixture of a wide window, standing on the band. */
const topCentre = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement | null => {
  const {outline} = frame;
  const x = outline.x + outline.width / 2;
  const spot = bestOnSegment(frame, {x, y: outline.y + 64}, {x, y: frame.paintLimit.y});
  return fixtureOnSpot(spot, 'top', 'candelabro-3', 'foot', ornamentSize, GIRANDOLE_MIN);
};

/** A wide window's standing girandoles on its top rail, TOP_SPACING px apart from the centre one; kept only near its height. */
const topRail = (frame: OrnamentFrame, ornamentSize: number, centre: OrnamentPlacement | null): OrnamentPlacement[] => {
  if (!centre) return [];
  const {outline} = frame;
  const middle = outline.x + outline.width / 2;
  const placements: OrnamentPlacement[] = [];
  for (let offset = TOP_SPACING; offset <= outline.width / 2 - TOP_CORNER + 1e-9; offset += TOP_SPACING) {
    for (const x of [middle + offset, middle - offset]) {
      const spot = bestOnSegment(frame, {x, y: outline.y + 64}, {x, y: frame.paintLimit.y});
      const placement = fixtureOnSpot(spot, 'top', 'candelabro-2', 'foot', ornamentSize, GIRANDOLE_MIN);
      if (placement && placement.size >= PARTNER_SHARE * centre.size - 1e-9) placements.push(placement);
    }
  }
  return placements.sort((a, b) => a.x - b.x);
};

/**
 * A screen frame's standing girandole whose drawing reaches the picture (the glow margin, which
 * the contract allows): moved (outwards along the rail, down into the corner or up the side band's
 * column), then made smaller in 0.5 px steps, until
 * nothing it draws is within 1 px of the picture. Unchanged when nothing fits that way (a band too
 * thin for the least girandole).
 */
const offThePicture = (
  frame: OrnamentFrame, placement: OrnamentPlacement, side: 1 | -1, ornamentSize: number, least: number,
): OrnamentPlacement => {
  const picture = pictureOf(frame);
  if (!picture || clearOfPicture(placement, picture)) return placement;
  const fixture = fixtureOf(placement)!;
  const moves: Point[] = [];
  // Outwards along the rail, down into the corner, or up the side band's column (a corner only).
  for (let dx = 0; dx <= WINDOW_SLIDE + 1e-9; dx += STEP) {
    for (let dy = -WINDOW_SLIDE; dy <= WINDOW_SLIDE / 2 + 1e-9; dy += STEP) moves.push({x: side * dx, y: dy});
  }
  moves.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) || a.y - b.y);
  for (let extent = placement.extent; extent >= least - 1e-9; extent -= STEP) {
    const size = heightIn(fixture.kind, fixture.mount, extent, ornamentSize);
    // The drawing relative to the placement's centre, once per size; each move only shifts it.
    const drawn = fixtureDrawn({...placement, x: 0, y: 0, extent, size});
    for (const move of moves) {
      const x = placement.x + move.x;
      const y = placement.y + move.y;
      if (!fitsAt(frame, x, y, extent, 'front')) continue;
      if (drawn.every((point) => roundRectSdf(picture, x + point.x, y + point.y) - point.margin >= 1 - 1e-9)) return {...placement, x, y, extent, size};
    }
  }
  return placement;
};

/** The girandoles' placements, the hero first; null when the hero does not fit (the chambersticks then try). */
export const placeGirandoles = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement[] | null => {
  const placements: OrnamentPlacement[] = [];
  const add = (placement: OrnamentPlacement | null) => {
    if (placement && clearOf(placement, placements)) placements.push(placement);
  };
  const heroAt = (corner: OrnamentCorner, slot: OrnamentSlotId, kind: FixtureKind, mount: FixtureMount) =>
    fixtureAt(frame, corner, slot, kind, mount, ornamentSize, GIRANDOLE_HERO_MIN, true);
  const secondaryAt = (corner: OrnamentCorner, slot: OrnamentSlotId, kind: FixtureKind, mount: FixtureMount) =>
    fixtureAt(frame, corner, slot, kind, mount, ornamentSize, GIRANDOLE_MIN);
  // The hero's partner in the other corner (or on a ring's side): kept only near the hero's height.
  const partnerAt = (corner: OrnamentCorner, slot: OrnamentSlotId, kind: FixtureKind, mount: FixtureMount) => {
    const partner = secondaryAt(corner, slot, kind, mount);
    return partner && partner.size >= PARTNER_SHARE * placements[0]!.size - 1e-9 ? partner : null;
  };
  if (frame.fit === 'screen') {
    // The standing corner girandoles keep their flames and halos off the picture (AD round 2).
    const found = heroAt(cornerSlot(frame, 'BR'), 'BR', 'candelabro-3', 'foot');
    if (!found) return null;
    const hero = offThePicture(frame, found, 1, ornamentSize, Math.min(GIRANDOLE_HERO_MIN, found.extent));
    placements.push(hero);
    const twin = partnerAt(cornerSlot(frame, 'BL'), 'BL', 'candelabro-3', 'foot');
    const left = twin ? offThePicture(frame, twin, -1, ornamentSize, GIRANDOLE_MIN) : null;
    add(left && left.size >= PARTNER_SHARE * hero.size - 1e-9 ? left : null);
    add(partnerAt(cornerSlot(frame, 'TR'), 'TR', 'candelabro-2', 'rosette'));
    add(partnerAt(cornerSlot(frame, 'TL'), 'TL', 'candelabro-2', 'rosette'));
    for (const sconce of sideSconces(frame, ornamentSize)) add(sconce);
    // The valance across the top band, between the top corners' fixtures (AD round 3; it replaces
    // the small two-light stands on the bottom band, which read as forks).
    placements.push(...swagRun(frame, placements));
    return placements;
  }
  if (frame.circle) {
    const [heroSlot, secondSlot] = frame.accent === 'topo'
      ? [[ringSlot(frame, 0), 'right'], [ringSlot(frame, 180), 'left']] as const
      : frame.accent === 'esquerda'
        ? [[cornerSlot(frame, 'TR'), 'TR'], [ringSlot(frame, 0), 'right']] as const
        : [[cornerSlot(frame, 'TR'), 'TR'], [cornerSlot(frame, 'TL'), 'TL']] as const;
    const hero = heroAt(heroSlot[0], heroSlot[1], 'candelabro-3', 'rosette');
    if (!hero) return null;
    placements.push(hero);
    // A partner in the other upper corner keeps near the hero's height; one on the ring's side
    // (the left accent arc takes TL) has only the side's bleed, so it stays at its own room there
    // (a smaller two-light under the hero) rather than being dropped.
    add(secondSlot[1] === 'TL' ? partnerAt(secondSlot[0], secondSlot[1], 'candelabro-2', 'rosette') : secondaryAt(secondSlot[0], secondSlot[1], 'candelabro-2', 'rosette'));
    return placements;
  }
  const compact = frame.kind === 'block' && frame.outline.height <= COMPACT_HEIGHT;
  const hero = heroAt(cornerSlot(frame, 'TR'), 'TR', compact ? 'candelabro-2' : 'candelabro-3', 'rosette');
  if (!hero) return null;
  placements.push(hero);
  if (compact) return placements;
  add(partnerAt(cornerSlot(frame, 'TL'), 'TL', 'candelabro-2', 'rosette'));
  if (frame.outline.width >= CLUSTER_MIN_WIDTH) {
    if (frame.fit === 'window') {
      const centre = topCentre(frame, ornamentSize);
      add(centre);
      for (const sconce of sideSconces(frame, ornamentSize)) add(sconce);
      for (const stand of topRail(frame, ornamentSize, centre)) add(stand);
    }
    // The swag valance from the bottom line (a border's outer line, a block's stroke) into the bleed.
    if (frame.fit === 'window' || frame.kind === 'block') placements.push(...swagRun(frame, placements));
  }
  return placements;
};
