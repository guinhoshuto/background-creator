import type {ReactNode} from 'react';
import {LEG_HALO, LEG_WIDTHS, Spider, spiderLegs} from '../../../../backgrounds/halloween/CobwebArtwork';
import {BOUNCE, SPIDER_GUST, SPIDER_SWING} from '../../../../backgrounds/CobwebLoop';
import {svgNumber} from '../../geometry';
import {ceilHalf, fitsAt} from '../place';
import type {OrnamentFrame} from '../types';
import type {FanLayout} from './teia-fan';
import {DARK_EDGE} from './teia-web';

/**
 * The teia spider: the background's black widow (its exported Spider, legs, hourglass and
 * moonlit rim), hanging on its dragline from the hero web. Where a column beside the box holds
 * it, it runs the background's whole performance (rest, drop, bounce, rest, four hauls) over a
 * few dozen px; elsewhere it rests just under the web, bobbing, its legs stepping. Small overlay
 * spiders (scale 0.28–0.45) draw their legs at least SPIDER_LEG_MIN px wide, and carry a 1 px lit
 * edge in the moonlight colour on the moon's side, so the dark body reads over dark footage.
 */

/** Below this scale the spider is left out (its abdomen would be under 9 px). */
export const SPIDER_MIN_SCALE = 0.28;
/** The largest scale a spider takes (round webcams): the background's third spider is 0.62. */
export const SPIDER_MAX_SCALE = 0.5;
/** The spider's nominal scale per px of ornamentSize: 0.35 at 58. */
export const SPIDER_PER_SIZE = 0.35 / 58;
/**
 * Its drop per unit of its scale, where the column holds the whole performance: the background's
 * range (64 px at scale 1), so a small overlay spider drops as far as its body is long.
 */
export const SPIDER_TRAVEL_PER_SCALE = 64;
/** The thinnest leg, in px (Spider's minLegWidth). */
export const SPIDER_LEG_MIN = 1.2;
/** The lit edge: the silhouette in the moonlight colour, this many px toward the moon, at this opacity. */
export const SPIDER_EDGE = {shift: 1, opacity: 0.45};
/**
 * The dragline, drawn here rather than by the background's Spider (whose 1.5 px line at 0.5 merges
 * into a panel's stroke): silk with the kit's dark outline and a moonlit edge toward the moon.
 */
export const DRAGLINE = {silk: 1.3, silkOpacity: 0.8, lit: 0.6, litOpacity: 0.4, litShift: 0.6} as const;
/** The dragline's widest pass around its line, px (its dark outline, or the moonlit edge's shift). */
const LINE_REACH = 2.1;
/**
 * The thread between the knot on the web and the spider at rest, in px: as long as the body's own
 * reach allows (the knot then lies inside the disc the body declares), so the spider hangs clear
 * of the web at no cost in room.
 */
const restThread = (scale: number) => Math.max(7, spiderBodyReach(scale) - LINE_REACH - 1.5);

/** Leg reach and stride over the whole performance (the background's curl 0.55 + 0.3·fall − 0.35·pull). */
const POSES = (() => {
  const poses: [number, number, number][] = [];
  for (const curl of [0.2, 0.4, 0.55, 0.7, 0.85]) {
    for (const stride of [0, 0.3, 0.65, 1]) {
      for (let step = 0; step < 16; step++) {
        const angle = step / 16 * Math.PI * 2;
        poses.push([curl, stride * Math.sin(angle), stride * Math.cos(angle)]);
      }
    }
  }
  return poses;
})();

/** Per leg segment, the farthest either end reaches from the tie point over every pose, in the spider's units. */
const LEG_FAR: number[] = (() => {
  const far = [0, 0, 0];
  for (const [curl, stepSin, stepCos] of POSES) {
    for (const leg of spiderLegs(curl, stepSin, stepCos)) {
      for (let segment = 0; segment < 3; segment++) {
        far[segment] = Math.max(far[segment]!, Math.hypot(...leg[segment]!), Math.hypot(...leg[segment + 1]!));
      }
    }
  }
  return far;
})();

/** Abdomen and its moonlit rim (the rim ellipse 1.1 toward the moon): the farthest body point, in the spider's units. */
const BODY_FAR = 29 + 17.5 + 1.1;

/**
 * How far anything of a spider at `scale` draws from its tie point, in px, in any pose and turn:
 * legs with their moonlit edge (at least SPIDER_LEG_MIN px wide), the body with its rim, and the
 * lit-edge silhouette SPIDER_EDGE.shift px toward the moon.
 */
export const spiderBodyReach = (scale: number) => {
  const floor = SPIDER_LEG_MIN / scale;
  const legs = LEG_FAR.map((far, segment) => far + (Math.max(LEG_WIDTHS[segment]!, floor) + LEG_HALO.grow) / 2 + LEG_HALO.shift);
  return scale * Math.max(BODY_FAR, ...legs) + SPIDER_EDGE.shift;
};

/** The widest the spider swings on its line, either way (the background's swing plus a full gust). */
const SWING = SPIDER_SWING + SPIDER_GUST;

/**
 * A spider's place: its column `x`, the knot on the web, the tie point at rest (top), how far it
 * drops (0: it rests there, bobbing), its scale, and the circle that holds all of it.
 */
export type SpiderPlan = {
  x: number; knotY: number; topY: number; travel: number; scale: number; cx: number; cy: number; extent: number;
  /**
   * 0: hanging on its dragline. 1: sitting in the corner's pocket on the hero web (a border's or a
   * screen's corner, where no column beside the box holds a hanging spider), head toward the hub,
   * tied at (cx, cy), bobbing SPIDER_POCKET_BOB px along the diagonal (ux, uy points away from the hub).
   */
  pocket: number; ux: number; uy: number;
  /**
   * How much of the background's swing it keeps (1, or less on a long resting line, whose body
   * would otherwise swing out of its column), and the length of line (from the body up) the
   * spider's own element draws: all of it, or on a long line (the dangle beside a chat) only the
   * part inside the body's disc, the rest drawn by `line`'s element.
   */
  sway: number; drawn: number;
  /** A long resting line's upper part (knot to the joint), in a placement of its own; null otherwise. */
  line: {cx: number; cy: number; extent: number} | null;
};

/** The lowest the tie goes below the top: the drop plus the bounce's overshoot; resting, the bob. */
export const spiderLow = (travel: number, bob: number) => (travel > 0 ? travel * (1 + BOUNCE) : bob);
/** The rest bob, in px (a resting spider rises and settles on its line). */
export const SPIDER_BOB = 1.5;


/**
 * The circle a spider needs, and whether the frame holds it: the tie runs from topY down by its
 * low, and every frame declares the disc (tie, max(body, thread + line)); the circle's centre sits
 * on the column where the worse of the two ends is smallest.
 */
const spiderCircle = (x: number, knotY: number, topY: number, low: number, scale: number) => {
  const body = spiderBodyReach(scale);
  const bottom = topY + low;
  // The disc each end declares (the thread grows as the spider drops), plus the swing's sideways reach.
  const reachAt = (y: number) => Math.max(body, y - knotY + LINE_REACH);
  const aside = Math.sin(SWING) * (bottom - knotY);
  const [top, deep] = [reachAt(topY), reachAt(bottom)];
  const cy = Math.min(bottom, Math.max(topY, (topY + bottom + deep - top) / 2));
  const extent = ceilHalf(Math.max(cy - topY + top, bottom - cy + deep) + aside + 0.1);
  return {cx: x, cy, extent};
};

/** A spider's scale is kept on a 0.01 grid (its circle, and so the placement, stay on round numbers). */
const scaleStep = (value: number) => Math.floor(value * 100 + 1e-9) / 100;

/**
 * Where the spider hangs from the hero fan: the column along the hero's side edge (x from 12 % to
 * 80 % of the radius in from the hub), a knot inside the web (86 %, 70 % or 55 % of the radius out
 * on that column). First the whole drop (SPIDER_TRAVEL_PER_SCALE × its scale, then ¾ and ½ of it)
 * at no less than 85 % of the nominal scale; failing that the largest scale that rests there (a
 * drop needs a circle as tall as the drop plus the body: a column as narrow as a chat's bleed and
 * padding holds a resting spider only). Only a fan hung from a top
 * corner holds one (the spider hangs down, away from the web). Pure: no seed, no frame; null when
 * not even SPIDER_MIN_SCALE fits.
 */
export const fitSpider = (frame: OrnamentFrame, fan: FanLayout, nominalScale: number): SpiderPlan | null => {
  const down = Math.sin(fan.bisector) > 0.1;
  if (!down) return null;
  const side = Math.cos(fan.bisector) < 0 ? -1 : 1;
  const top = scaleStep(Math.min(SPIDER_MAX_SCALE, nominalScale));
  const at = (scale: number, travel: number): SpiderPlan | null => {
    for (const knot of [0.86, 0.7, 0.55]) {
      const r = knot * fan.radius;
      // Nearest the hub's side edge wins: the spider hangs beside the box, not over it.
      for (let step = 3; step <= 20; step++) {
        const dx = step * 0.04 * fan.radius;
        if (dx >= r) break;
        const x = fan.hubX + side * dx;
        const knotY = fan.hubY + Math.sqrt(r * r - dx * dx);
        const topY = knotY + restThread(scale);
        const circle = spiderCircle(x, knotY, topY, spiderLow(travel, SPIDER_BOB), scale);
        if (fitsAt(frame, circle.cx, circle.cy, circle.extent, 'front')) {
          return {x, knotY, topY, travel, scale, ...circle, pocket: 0, ux: 0, uy: 1, sway: 1, drawn: Number.POSITIVE_INFINITY, line: null};
        }
      }
    }
    return null;
  };
  const scales = (floor: number) => {
    const list: number[] = [];
    for (let scale = top; scale >= floor - 1e-9; scale = scaleStep(scale - 0.01 + 1e-9)) list.push(scale);
    return list;
  };
  for (const share of [1, 0.75, 0.5]) {
    for (const scale of scales(Math.max(SPIDER_MIN_SCALE, 0.85 * top))) {
      const plan = at(scale, share * SPIDER_TRAVEL_PER_SCALE * scale);
      if (plan) return plan;
    }
  }
  const low = restLow(frame);
  if (low === null) {
    for (const scale of scales(SPIDER_MIN_SCALE)) {
      const plan = at(scale, 0);
      if (plan) return plan;
    }
    return null;
  }
  // A long line: first where it hangs clear of the panel's edge (else it merges into the stroke).
  for (const clear of [DANGLE_CLEAR, -Infinity]) {
    for (const scale of scales(SPIDER_MIN_SCALE)) {
      const plan = dangle(frame, fan, side, scale, low, clear);
      if (plan) return plan;
    }
  }
  return null;
};

/** The dangling spider's body drifts at most this far aside (px) as it swings on its long line. */
const DANGLE_ASIDE = 0.75;
/** How far outside the panel's outline its long line hangs, at least (px), where the column allows. */
export const DANGLE_CLEAR = 3;
/** How far below the header's dividing line the dangling spider's body rests, at least (px). */
export const SPIDER_UNDER_HEADER = 20;

/**
 * Where a resting spider's body must hang down to on a panel with a header (a text row above
 * another): SPIDER_UNDER_HEADER px under the dividing line, which the header's band puts as far
 * under its title as the band's top is above it (the band starts inside the stroke: twice the
 * track's inset from the outline). null without a header: it rests just under the web.
 */
export const restLow = (frame: OrnamentFrame): number | null => {
  if (frame.circle || frame.kind !== 'chat') return null;
  const header = frame.keepOut.find((area) => frame.keepOut.some((other) => other !== area && other.y >= area.y + area.height));
  if (!header) return null;
  const inner = 2 * frame.track.y - frame.outline.y;
  return header.y + header.height + (header.y - inner) + SPIDER_UNDER_HEADER;
};

/**
 * A resting spider on a long line down the column beside a panel, its body's centre at least at
 * `low`: the body (with the line's lower part inside its disc) in one placement, the line's upper
 * part from the knot in another, so each circle stays as narrow as the column. It swings only as
 * far as keeps its body within DANGLE_ASIDE px of the column. The column nearest the hub's side
 * edge that holds both wins, on 0.5 px steps, `clear` px or more outside the panel's outline.
 */
const dangle = (frame: OrnamentFrame, fan: FanLayout, side: number, scale: number, low: number, clear: number): SpiderPlan | null => {
  const body = spiderBodyReach(scale);
  const drawn = restThread(scale);
  // The outline's side edge the column runs along (the hub's side of the box).
  const edge = side < 0 ? frame.outline.x + frame.outline.width : frame.outline.x;
  for (const knot of [0.86, 0.7, 0.55]) {
    const r = knot * fan.radius;
    for (let dx = Math.ceil(0.12 * fan.radius * 2) / 2; dx <= 0.8 * fan.radius && dx < r; dx += 0.5) {
      const x = fan.hubX + side * dx;
      if ((edge - x) * side < clear) break;
      const knotY = fan.hubY + Math.sqrt(r * r - dx * dx);
      const length = Math.max(drawn, low - knotY);
      const full = length + SPIDER_BOB;
      const sway = Math.min(1, Math.asin(Math.min(1, DANGLE_ASIDE / full)) / SWING);
      const turn = sway * SWING;
      // The tie's reach over every pose: swung either way, at rest or bobbed down.
      const ties = [0, SPIDER_BOB].flatMap((bob) => [-turn, 0, turn].map((angle) => ({
        x: x + Math.sin(angle) * (length + bob), y: knotY + Math.cos(angle) * (length + bob),
      })));
      const cy = knotY + length + SPIDER_BOB / 2;
      const extent = ceilHalf(Math.max(...ties.map((tie) => Math.hypot(tie.x - x, tie.y - cy))) + body + 0.1);
      if (!fitsAt(frame, x, cy, extent, 'front')) continue;
      // The upper part: the knot to the joint, `drawn` px above the tie, in every pose.
      const upper = full - drawn;
      const lineCy = knotY + upper / 2;
      const joints = [length - drawn, upper].flatMap((span) => [-turn, turn].map((angle) => ({
        x: x + Math.sin(angle) * span, y: knotY + Math.cos(angle) * span,
      })));
      const lineExtent = ceilHalf(Math.max(upper / 2, ...joints.map((joint) => Math.hypot(joint.x - x, joint.y - lineCy))) + LINE_REACH + 0.1);
      if (!fitsAt(frame, x, lineCy, lineExtent, 'front')) continue;
      return {
        x, knotY, topY: knotY + length, travel: 0, scale, cx: x, cy, extent, pocket: 0, ux: 0, uy: 1, sway, drawn,
        line: {cx: x, cy: lineCy, extent: lineExtent},
      };
    }
  }
  return null;
};

/** A pocket spider's bob along the diagonal, in px. */
export const SPIDER_POCKET_BOB = 1;

/**
 * A spider sitting in the corner's pocket on the hero web: its tie point on the fan's bisector,
 * head toward the hub, the largest scale ≤ nominal whose disc (every pose and the bob) fits in
 * front, between 0.3 and 0.9 of the fan's radius from the hub, where its disc sits deepest in the
 * fitting stretch (the middle of it). Pure: no seed, no frame; null below SPIDER_MIN_SCALE.
 */
export const fitPocket = (frame: OrnamentFrame, fan: FanLayout, nominalScale: number): SpiderPlan | null => {
  const ux = Math.cos(fan.bisector);
  const uy = Math.sin(fan.bisector);
  const top = scaleStep(Math.min(SPIDER_MAX_SCALE, nominalScale));
  for (let scale = top; scale >= SPIDER_MIN_SCALE - 1e-9; scale = scaleStep(scale - 0.01 + 1e-9)) {
    const extent = ceilHalf(spiderBodyReach(scale) + SPIDER_POCKET_BOB + 0.1);
    const fitting: number[] = [];
    for (let step = 0; step <= 60; step++) {
      const t = (0.3 + 0.6 * step / 60) * fan.radius;
      if (fitsAt(frame, fan.hubX + ux * t, fan.hubY + uy * t, extent, 'front')) fitting.push(t);
    }
    if (fitting.length === 0) continue;
    const t = fitting[Math.floor((fitting.length - 1) / 2)]!;
    const cx = fan.hubX + ux * t;
    const cy = fan.hubY + uy * t;
    return {x: cx, knotY: cy, topY: cy, travel: 0, scale, cx, cy, extent, pocket: 1, ux, uy, sway: 1, drawn: 0, line: null};
  }
  return null;
};

/** A stretch of dragline between two points (px): dark outline, silk, and the moonlit edge `side` px toward the moon. */
export const Dragline = ({x1, y1, x2, y2, side, silk, moonlight}: {
  x1: number; y1: number; x2: number; y2: number; side: number; silk: string; moonlight: string;
}): ReactNode => {
  const n = svgNumber;
  const d = `M${n(x1)} ${n(y1)} L${n(x2)} ${n(y2)}`;
  return (
    <g fill="none">
      <path d={d} stroke={DARK_EDGE.color} strokeWidth={n(DRAGLINE.silk + DARK_EDGE.grow)} opacity={DARK_EDGE.opacity} />
      <path d={d} stroke={silk} strokeWidth={DRAGLINE.silk} opacity={DRAGLINE.silkOpacity} />
      <path d={d} stroke={moonlight} strokeWidth={DRAGLINE.lit} opacity={DRAGLINE.litOpacity}
        transform={`translate(${n(DRAGLINE.litShift * side)} 0)`} />
    </g>
  );
};

/**
 * The spider this frame: its dragline's lower `drawn` px (from the tie up toward the knot at
 * (knotX, knotY)), then the background's Spider (no line of its own) under a silhouette of
 * itself in the moonlight colour, SPIDER_EDGE.shift px toward the moon (the lit edge a dark body
 * needs over footage).
 */
export const SpiderFigure = ({id, x, y, scale, rotation, curl, stepSin, stepCos, glow, light, knotX, knotY, drawn, silk, moonlight, mark, body}: {
  id: string; x: number; y: number; scale: number; rotation: number; curl: number; stepSin: number; stepCos: number; glow: number;
  light: number; knotX: number; knotY: number; drawn: number; silk: string; moonlight: string; mark: string; body: string;
}): ReactNode => {
  const n = svgNumber;
  const legs = spiderLegs(curl, stepSin, stepCos);
  const floor = SPIDER_LEG_MIN / scale;
  const ux = Math.cos(light) * SPIDER_EDGE.shift;
  const uy = Math.sin(light) * SPIDER_EDGE.shift;
  const span = Math.hypot(knotX - x, knotY - y);
  const share = span > 0 ? Math.min(1, drawn / span) : 0;
  return (
    <g>
      {share > 0 ? (
        <Dragline x1={x + (knotX - x) * share} y1={y + (knotY - y) * share} x2={x} y2={y} side={Math.cos(light) < 0 ? -1 : 1}
          silk={silk} moonlight={moonlight} />
      ) : null}
      <g transform={`translate(${n(x + ux)} ${n(y + uy)}) rotate(${n(rotation)}) scale(${n(scale)})`} fill={moonlight}
        stroke={moonlight} opacity={SPIDER_EDGE.opacity}>
        <g fill="none" strokeLinecap="round">
          {legs.flatMap((points, leg) => LEG_WIDTHS.map((width, segment) => (
            <path key={`${leg}-${segment}`} d={`M${points[segment]!.map(n).join(' ')} L${points[segment + 1]!.map(n).join(' ')}`}
              strokeWidth={n(Math.max(width, floor))} />
          )))}
        </g>
        <ellipse cx="0" cy="29" rx="16.5" ry="17.5" stroke="none" />
        <ellipse cx="0" cy="11" rx="2.4" ry="2" stroke="none" />
        <ellipse cx="0" cy="2" rx="9.5" ry="8" stroke="none" />
      </g>
      <Spider x={x} y={y} scale={scale} rotation={rotation} legCurl={curl} stepSin={stepSin} stepCos={stepCos} glow={glow}
        light={light} opacity={1} thread={0} anchorX={x} silk={silk} moonlight={moonlight} body={body} mark={mark}
        id={id} minLegWidth={SPIDER_LEG_MIN} />
    </g>
  );
};
