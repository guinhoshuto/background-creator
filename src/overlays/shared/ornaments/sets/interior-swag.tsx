import {LIGHTNING_COLOR} from '../../../../backgrounds/halloween/lightning';
import {clampRadius} from '../../geometry';
import {paint} from '../draw';
import {fitsAt} from '../place';
import type {OrnamentBase, OrnamentFrame, OrnamentPlacement} from '../types';
import {num, type Point} from './interior-candle';

/**
 * The hall's red-velvet swag valance (AD round 3; it replaces the tassel run, which read as pegs at
 * 100 %): a continuous run of scalloped festoons in the background's curtain velvet hanging from a
 * frame's bottom line into the bleed (a screen frame: from a rail inside its top band, like a
 * window valance), a gold boss at every join and a small gold tassel under every second join.
 *
 * Every festoon is one placement ('sanefa') and one element ('interior-swag'): fixed px (pitch,
 * depth, tassel) per frame kind, a constant count per size, seed- and frame-free; festoons abut, so
 * two of them are exempt from the set's pairwise gap (against fixtures the gap holds). Only the
 * tassels move (±3°, 2 cycles per 16 s); at a strike the velvet's ridge, the hem cord and the bosses
 * flare on the side of the window that flashes.
 *
 * Geometry of a festoon, px, x from its centre and y down from its join line (the joins at ±P/2):
 *   upper edge  Q (−P/2, 0) (0, 10) (P/2, 0), a 5 px sag;
 *   hem         Q (−P/2, 1) (0, 2D − 1) (P/2, 1), its lowest point D below the join line.
 * Each is a parabola y = e + (c − e)(1 − s²)/2 in s = x/(P/2), so every fold line in between is one
 * too (the fold at a share f of the depth: y = f + (5 + f(D − 6))(1 − s²)).
 */

export const SWAG_MOTIF = 'sanefa';

/** A run's fixed px: pitch P, hem depth D, the circle's centre below the join line, the tassel's length. */
export type SwagSpec = {pitch: number; depth: number; centre: number; tassel: number};
/** Per frame kind (the rooms measured by the AD, round 3). */
export const SWAG: Record<'window' | 'panel' | 'screen', SwagSpec> = {
  // Borders' bottom: the outer line's centreline; room 23.5 at the outline + 5.5.
  window: {pitch: 38, depth: 15, centre: 6.5, tassel: 9},
  // Blocks' bottom: the stroke's centreline; room 25 at the outline + 6, the text 20 px above.
  panel: {pitch: 40, depth: 17, centre: 8, tassel: 10},
  // Screen frames' top band: a rail at y 15 (the circle about y 21.5 is the band's room, 20.5 px,
  // which the joins need), the hem at y 27 so everything drawn stays ≥ 1 px off the picture (y 30;
  // the glow margin down to the window's hole, y 42, shows the picture too).
  screen: {pitch: 32, depth: 12, centre: 6.5, tassel: 8},
};
/** The upper edge's control point (a 5 px sag). */
const SAG_CONTROL = 10;
/** A run's ends stay this far (px) past the corner curve. */
export const SWAG_CORNER = 16;
/** A screen frame's valance rail, px below the outline's top. */
export const SWAG_SCREEN_RAIL = 15;
/** The boss at a join: radius, px (Ø5). */
export const BOSS_RADIUS = 2.5;
/** The tassel: head radius, its top below the join, the skirt's half-widths at top and bottom. */
export const SWAG_TASSEL = {head: 2, top: 2, skirtTop: 2, skirtBottom: 2.5, swing: 3} as const;
/** The outlines' half-width (1 px strokes). */
const OUTLINE = 0.5;
/** How far below the hem's line anything reaches: the moonlit rule 1.2 px under it, 1 px wide. */
const HEM_REACH = 1.2 + 0.5;

/** y at s of the parabola y = a + b(1 − s²) through (±1, a) with its apex a + b. */
const parabola = (a: number, apex: number) => (s: number) => a + (apex - a) * (1 - s * s);
/** The upper edge (s ∈ [−1, 1]); the same 5 px sag at every pitch. */
export const upperEdge = parabola(0, SAG_CONTROL / 2);
/** The hem. */
export const hem = (spec: SwagSpec) => parabola(1, spec.depth);
/** A fold at share f between the upper edge and the hem (both ends and apex interpolated). */
export const fold = (spec: SwagSpec, f: number) => parabola(f, SAG_CONTROL / 2 + f * (spec.depth - SAG_CONTROL / 2));

/**
 * A quadratic Bézier path along y(s) from s0 to s1 (x = s·P/2 about cx, y about jy): a parabola's
 * piece is exactly one quadratic, its control where the end tangents meet.
 */
export const parabolaPath = (y: (s: number) => number, s0: number, s1: number, half: number, cx: number, jy: number, move = true) => {
  const slope = (s: number) => (y(s + 1e-4) - y(s - 1e-4)) / 2e-4;
  const x0 = s0 * half;
  const x1 = s1 * half;
  const control = {x: (x0 + x1) / 2, y: y(s0) + (slope(s0) / half) * ((x1 - x0) / 2)};
  return `${move ? `M${num(cx + x0)} ${num(jy + y(s0))}` : ''}Q${num(cx + control.x)} ${num(jy + control.y)} ${num(cx + x1)} ${num(jy + y(s1))}`;
};

const rotate = (point: Point, degrees: number): Point => {
  const angle = (degrees * Math.PI) / 180;
  return {x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle)};
};

/** The tassel's outline points about its pivot (the join), at rest. */
export const swagTasselPoints = (spec: SwagSpec): Point[] => {
  const {head, top, skirtTop, skirtBottom} = SWAG_TASSEL;
  const bottom = top + spec.tassel;
  const circle = Array.from({length: 16}, (_, index) => {
    const angle = (index / 16) * 2 * Math.PI;
    return {x: head * Math.cos(angle) / Math.cos(Math.PI / 16), y: top + head + head * Math.sin(angle) / Math.cos(Math.PI / 16)};
  });
  return [...circle, {x: -skirtTop, y: top + head + 1}, {x: skirtTop, y: top + head + 1}, {x: -skirtBottom, y: bottom}, {x: skirtBottom, y: bottom}];
};

/**
 * Everything a festoon draws, px from its join line's middle (x from the festoon's centre), with how
 * far its stroke reaches past each point: the fabric and its cord, both joins' bosses and both
 * joins' tassels over their whole swing (a festoon draws one or two of them; the bound holds any).
 */
export const swagPoints = (spec: SwagSpec): {x: number; y: number; margin: number}[] => {
  const half = spec.pitch / 2;
  const points: {x: number; y: number; margin: number}[] = [];
  for (let index = 0; index <= 24; index++) {
    const s = -1 + index / 12;
    points.push({x: s * half, y: upperEdge(s), margin: OUTLINE}, {x: s * half, y: hem(spec)(s), margin: HEM_REACH});
  }
  for (const side of [-1, 1]) {
    for (let index = 0; index < 16; index++) {
      const angle = (index / 16) * 2 * Math.PI;
      const grow = 1 / Math.cos(Math.PI / 16);
      points.push({x: side * half + BOSS_RADIUS * grow * Math.cos(angle), y: BOSS_RADIUS * grow * Math.sin(angle), margin: OUTLINE});
    }
    for (const share of [-1, -0.5, 0, 0.5, 1]) {
      for (const point of swagTasselPoints(spec)) {
        const turned = rotate(point, share * SWAG_TASSEL.swing);
        points.push({x: side * half + turned.x, y: turned.y, margin: OUTLINE});
      }
    }
  }
  return points;
};

const extentCache = new Map<string, number>();
/** A festoon's extent (px, on the half pixel): its circle about (0, centre) holds everything it draws. */
export const swagExtent = (spec: SwagSpec) => {
  const key = JSON.stringify(spec);
  const cached = extentCache.get(key);
  if (cached !== undefined) return cached;
  const far = Math.max(...swagPoints(spec).map((point) => Math.hypot(point.x, point.y - spec.centre) + point.margin));
  const extent = Math.ceil(far * 2 - 1e-9) / 2;
  extentCache.set(key, extent);
  return extent;
};

/** The run's spec and its join line for a frame; null where no run hangs. */
export const swagLine = (frame: OrnamentFrame): {spec: SwagSpec; y: number; top: boolean} | null => {
  const {outline} = frame;
  if (frame.fit === 'screen') return {spec: SWAG.screen, y: outline.y + SWAG_SCREEN_RAIL, top: true};
  if (frame.fit === 'window') return {spec: SWAG.window, y: outline.y + outline.height - 1, top: false};
  // A panel: the bottom stroke's centreline.
  const stroke = Math.max(0, 2 * (frame.track.y - frame.outline.y));
  return {spec: SWAG.panel, y: outline.y + outline.height - stroke / 2, top: false};
};

/**
 * A run of festoons centred on the frame's straight bottom (a screen frame: its top band), an even
 * count (the tassels under every second join then sit symmetrically, one under each end):
 *   - bottoms: as many as fit with the run's ends ≥ SWAG_CORNER px past the corner curve;
 *   - a screen frame's top band: as many as the band's straight stretch holds.
 * Then fewer (two at a time) until every festoon's circle fits (paint limit, window, text) and
 * clears the fixtures already placed by the set's 2 px gap. [] when not even two fit.
 */
export const swagRun = (frame: OrnamentFrame, placed: readonly OrnamentPlacement[]): OrnamentPlacement[] => {
  const line = swagLine(frame);
  if (!line) return [];
  const {spec} = line;
  const {outline} = frame;
  const r = clampRadius(outline.radius, outline.width, outline.height);
  const straight = outline.width - 2 * r;
  // A screen frame's top band: the outline's chord at the rail (inside its rounding); the corner
  // fixtures then shorten the run. A bottom: the straight stretch less SWAG_CORNER at each end.
  const depth = line.y - outline.y;
  const room = line.top
    ? outline.width - 2 * (depth < r ? r - Math.sqrt(r * r - (r - depth) ** 2) : 0)
    : straight - 2 * SWAG_CORNER;
  const extent = swagExtent(spec);
  // A screen frame's picture starts the band's thickness in (the hole is the picture less the glow
  // margin): the valance keeps everything it draws ≥ 1 px above it.
  if (line.top && frame.hole) {
    const picture = outline.y + (frame.hole.y - outline.y - frame.glow);
    const lowest = Math.max(...swagPoints(spec).map((point) => point.y + point.margin));
    if (line.y + lowest > picture - 1 + 1e-9) return [];
  }
  const centre = outline.x + outline.width / 2;
  const y = line.y + spec.centre;
  for (let count = 2 * Math.floor(room / spec.pitch / 2 + 1e-9); count >= 2; count -= 2) {
    const run = Array.from({length: count}, (_, index): OrnamentPlacement => ({
      motif: SWAG_MOTIF, slot: line.top ? 'top' : 'bottom', layer: 'front',
      x: centre + (index - (count - 1) / 2) * spec.pitch, y, extent, size: spec.pitch,
    }));
    const clear = run.every((festoon) => fitsAt(frame, festoon.x, festoon.y, festoon.extent, 'front')
      && placed.every((other) => Math.hypot(festoon.x - other.x, festoon.y - other.y) >= festoon.extent + other.extent + 2 - 1e-9));
    if (clear) return run;
  }
  return [];
};

/** The spec of a festoon placement in its frame. */
export const swagSpecOf = (frame: OrnamentFrame) => swagLine(frame)!.spec;

/* ------------------------------------------------------------------------------ render */

/** The velvet (the background's hi-art-velvet stops), its folds, the gold and the strike's colours. */
export const SWAG_COLORS = {
  velvet: [['0', '#511826'], ['0.45', '#6C2232'], ['1', '#1F070D']] as const,
  ridge: '#9A4455', crease: '#10030A', outline: '#240A11',
  gold: '#B39A62', goldLight: '#E8D6A8', goldOutline: '#2A2114', skirtTop: '#9A8150', skirtBottom: '#6B5530',
  // At a strike: the background's VELVET_LIGHT and TIEBACK_LIGHT, and the lightning's cold white.
  ridgeLit: '#DC6D65', cordLit: '#FFD98A', flash: LIGHTNING_COLOR,
} as const;

/**
 * One festoon: its centre (cx), join line (jy), pitch and depth, tassel length; which of its joins
 * it draws (a festoon draws its left join, the run's last one its right one too: each join's boss
 * then lies over both festoons' fabric) and which carry a tassel; the tassels' swings (degrees);
 * the lightning on its side; the moonlit rim colour.
 */
export type InteriorSwagElement = OrnamentBase & {
  type: 'interior-swag'; cx: number; jy: number; pitch: number; depth: number; tassel: number;
  right: number; tasselLeft: number; tasselRight: number; angleLeft: number; angleRight: number; flash: number; rim: string;
};

const SwagTassel = ({x, y, angle, length, id}: {x: number; y: number; angle: number; length: number; id: string}) => {
  const {head, top, skirtTop, skirtBottom} = SWAG_TASSEL;
  const skirtFrom = top + head + 1;
  const bottom = top + length;
  return (
    <g transform={`translate(${num(x)} ${num(y)}) rotate(${num(angle)})`}>
      <path d={`M${-skirtTop} ${skirtFrom}L${-skirtBottom} ${bottom}H${skirtBottom}L${skirtTop} ${skirtFrom}Z`} fill={paint(id)}
        stroke={SWAG_COLORS.goldOutline} strokeOpacity={0.9} strokeWidth={1} strokeLinejoin="round" />
      <circle cx={0} cy={top + head} r={head} fill={SWAG_COLORS.gold} stroke={SWAG_COLORS.goldOutline} strokeOpacity={0.9} strokeWidth={1} />
    </g>
  );
};

const Boss = ({x, y, flash}: {x: number; y: number; flash: number}) => (
  <g>
    <circle cx={num(x)} cy={num(y)} r={BOSS_RADIUS} fill={SWAG_COLORS.gold} stroke={SWAG_COLORS.goldOutline} strokeOpacity={0.9} strokeWidth={1} />
    <circle cx={num(x + 0.9)} cy={num(y - 0.9)} r={0.5} fill={SWAG_COLORS.goldLight} />
    {flash > 0 ? <circle cx={num(x)} cy={num(y)} r={BOSS_RADIUS - 0.5} fill="none" stroke={SWAG_COLORS.flash} strokeOpacity={Math.min(1, 0.9 * flash)} strokeWidth={1} /> : null}
  </g>
);

/** A festoon of the valance (see the file's header). */
export const Swag = ({element, id}: {element: InteriorSwagElement; id: (part: string) => string}) => {
  const spec: SwagSpec = {pitch: element.pitch, depth: element.depth, centre: 0, tassel: element.tassel};
  const half = spec.pitch / 2;
  const {cx, jy} = element;
  const path = (y: (s: number) => number, s0: number, s1: number, move = true) => parabolaPath(y, s0, s1, half, cx, jy, move);
  const fabric = `${path(upperEdge, -1, 1)}L${num(cx + half)} ${num(jy + 1)}${path(hem(spec), 1, -1, false)}Z`;
  const ridge = path(fold(spec, 0.3), -0.82, 0.82);
  const creases = [path(fold(spec, 0.55), -0.72, 0.72), path(fold(spec, 0.8), -0.6, 0.6)];
  const cord = path(hem(spec), -1, 1);
  const flash = Math.min(1, element.flash);
  const joins = [{x: cx - half, tassel: element.tasselLeft, angle: element.angleLeft}];
  if (element.right > 0) joins.push({x: cx + half, tassel: element.tasselRight, angle: element.angleRight});
  return (
    <g>
      <defs>
        <linearGradient id={id('velvet')} x1="0" y1="0" x2="0" y2="1">
          {SWAG_COLORS.velvet.map(([offset, color]) => <stop key={offset} offset={offset} stopColor={color} />)}
        </linearGradient>
        <linearGradient id={id('skirt')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SWAG_COLORS.skirtTop} />
          <stop offset="1" stopColor={SWAG_COLORS.skirtBottom} />
        </linearGradient>
      </defs>
      <path d={fabric} fill={paint(id('velvet'))} />
      <path d={ridge} fill="none" stroke={SWAG_COLORS.ridge} strokeOpacity={0.5} strokeWidth={1.2} strokeLinecap="round" />
      {creases.map((d) => <path key={d} d={d} fill="none" stroke={SWAG_COLORS.crease} strokeOpacity={0.7} strokeWidth={1.2} strokeLinecap="round" />)}
      <path d={fabric} fill="none" stroke={SWAG_COLORS.outline} strokeOpacity={0.9} strokeWidth={1} strokeLinejoin="round" />
      {/* The hem cord, lit on its upper side; the moon's side (right third) catches a cold rule under it. */}
      <path d={cord} fill="none" stroke={SWAG_COLORS.gold} strokeWidth={1.5} strokeLinecap="round" />
      <path d={cord} fill="none" stroke={SWAG_COLORS.goldLight} strokeOpacity={0.6} strokeWidth={1} strokeLinecap="round" transform="translate(0 -0.5)" />
      <path d={path(hem(spec), 1 / 3, 1)} fill="none" stroke={element.rim} strokeOpacity={0.45} strokeWidth={1} strokeLinecap="round" transform="translate(0 1.2)" />
      {flash > 0 ? (
        <g>
          <path d={ridge} fill="none" stroke={SWAG_COLORS.ridgeLit} strokeOpacity={0.9 * flash} strokeWidth={1.2} strokeLinecap="round" />
          <path d={cord} fill="none" stroke={SWAG_COLORS.cordLit} strokeOpacity={0.8 * flash} strokeWidth={1.5} strokeLinecap="round" />
        </g>
      ) : null}
      {joins.map((join) => (join.tassel > 0 ? <SwagTassel key={`t${join.x}`} x={join.x} y={jy} angle={join.angle} length={spec.tassel} id={id('skirt')} /> : null))}
      {joins.map((join) => <Boss key={`b${join.x}`} x={join.x} y={jy} flash={flash} />)}
    </g>
  );
};
