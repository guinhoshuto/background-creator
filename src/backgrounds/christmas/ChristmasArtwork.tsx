import {memo} from 'react';
import {interpolateColors} from 'remotion';
import {BOW} from './layout';
import {GARLAND} from './garland';
import type {PineArt, PineCone as PineConeSpec, PineHolly} from './pine';

/**
 * The Christmas frame's drawings: fixed colours, unit paths built once at module load and the
 * components that draw them. Static pieces take colours only and are memoized, so a frame only
 * touches the transforms and values the scene moves.
 */

export const mix = (a: string, b: string, t: number) => interpolateColors(t, [0, 1], [a, b]);

// Fixed on purpose: any palette still reads as pine and snow.
export const SNOW = '#F3F0E6';
export const CREAM = '#FFF4D6';
export const WARM_WHITE = '#FFF1CF';
/** The hot centre of a lit bulb. */
export const BULB_HOT = '#FFFBEF';
/** The amber a bulb's halo leans toward. */
export const AMBER = '#FF9E4A';
/** The bauble caps and rings with only two colors: plain metal, so no third hue appears. */
export const SILVER = '#C3C8CE';
export const NEEDLE_BACK = '#051209';
export const STEM = '#241A12';
/** A pine cone's body, lit from the top left: light, mid and shadow browns. */
export const CONE_LIGHT = '#80572F';
export const CONE = '#5C3B20';
export const CONE_DARK = '#2F1D0E';
/** The shadowed underside of each scale. */
export const CONE_SCALE = '#24150A';

/**
 * The palette as the drawings use it. `gold` is colors[2], or colors[1] when there are only two.
 * With two colors, the metal (bauble caps and rings) turns silver and the lights, glints and
 * gilded trims take a light tint of the second color, so neither the metal nor the light turns to
 * a dark red over green. Both depend only on the colors' equality: [e, b] draws as [e, b, b].
 */
export const paletteOf = (colors: readonly string[]) => {
  const evergreen = colors[0]!;
  const burgundy = colors[1]!;
  const gold = colors[2] ?? burgundy;
  const twoColors = gold.toLowerCase() === burgundy.toLowerCase();
  return {
    evergreen,
    burgundy,
    gold,
    metal: twoColors ? SILVER : gold,
    accent: twoColors ? mix(burgundy, CREAM, 0.55) : gold,
  };
};
export type Palette = ReturnType<typeof paletteOf>;

const n3 = (value: number) => (Math.round(value * 1000) / 1000).toString();
const DEG = Math.PI / 180;

/** A six-spoke snow crystal of radius 1, each spoke with a V of two branches at 0.55 of its length. */
export const SNOW_CRYSTAL = Array.from({length: 6}, (_, k) => {
  const a = k * 60 * DEG;
  const bx = 0.55 * Math.cos(a);
  const by = 0.55 * Math.sin(a);
  const branch = (turn: number) =>
    `M${n3(bx)} ${n3(by)}L${n3(bx + 0.3 * Math.cos(a + turn * DEG))} ${n3(by + 0.3 * Math.sin(a + turn * DEG))}`;
  return `M0 0L${n3(Math.cos(a))} ${n3(Math.sin(a))}${branch(45)}${branch(-45)}`;
}).join('');

/** A four-point star of half-length 1. */
export const SPARKLE_PATH = 'M0 -1 Q0.12 -0.12 1 0 Q0.12 0.12 0 1 Q-0.12 0.12 -1 0 Q-0.12 -0.12 0 -1Z';

/** A drop-shaped bauble of radius 1, reaching 1.45 below its centre. */
export const DROP_PATH = 'M0 -1 C0.62 -1 1 -0.6 1 -0.08 C1 0.5 0.45 0.95 0 1.45 C-0.45 0.95 -1 0.5 -1 -0.08 C-1 -0.6 -0.62 -1 0 -1Z';

/** A pine cone in a unit box (x ±0.7, y ±1), wide at the stem end (−1) and narrow at the tip (1). */
export const CONE_BODY = 'M0 -1 C0.62 -1 0.7 -0.1 0.5 0.4 C0.34 0.8 0.12 1 0 1 C-0.12 1 -0.34 0.8 -0.5 0.4 C-0.7 -0.1 -0.62 -1 0 -1Z';

/** The right half of CONE_BODY's outline, sampled: y (increasing) to the half-width there. */
const CONE_OUTLINE = (() => {
  const segments = [
    [[0, -1], [0.62, -1], [0.7, -0.1], [0.5, 0.4]],
    [[0.5, 0.4], [0.34, 0.8], [0.12, 1], [0, 1]],
  ] as const;
  return segments.flatMap(([p0, p1, p2, p3]) => Array.from({length: 64}, (_, i) => {
    const t = i / 63;
    const s = 1 - t;
    const a = s * s * s;
    const b = 3 * s * s * t;
    const c = 3 * s * t * t;
    const d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]] as const;
  }));
})();
const coneHalfWidth = (v: number) => {
  const i = CONE_OUTLINE.findIndex(([, y]) => y >= v);
  if (i <= 0) return CONE_OUTLINE[Math.max(0, i)]![0];
  const [x0, y0] = CONE_OUTLINE[i - 1]!;
  const [x1, y1] = CONE_OUTLINE[i]!;
  return x0 + (x1 - x0) * ((v - y0) / (y1 - y0 || 1));
};

/**
 * Five rows of U-shaped scales, bricked (4, 3, 4, 3, 4). The gold rim catches the light on the top
 * two rows: `litLeft` holds their left halves, and `litRight` their right halves, which a mirrored
 * bough draws so the light still comes from the top left on the canvas.
 */
const coneScales = () => {
  const all: string[] = [];
  const litLeft: string[] = [];
  const litRight: string[] = [];
  [-0.6, -0.3, 0, 0.3, 0.6].forEach((v, row) => {
    const half = 0.85 * coneHalfWidth(v);
    const count = row % 2 ? 3 : 4;
    const width = (2 * half) / count;
    for (let k = 0; k < count; k++) {
      const from = -half + k * width;
      const to = from + width;
      const scale = `M${n3(from)} ${n3(v)}Q${n3((from + to) / 2)} ${n3(v + 0.2)} ${n3(to)} ${n3(v)}`;
      all.push(scale);
      // The centred scale of a 3-scale row belongs to neither half, whatever the rounding.
      const middle = (from + to) / 2;
      if (row < 2 && middle < -1e-9) litLeft.push(scale);
      if (row < 2 && middle > 1e-9) litRight.push(scale);
    }
  });
  return {all: all.join(''), litLeft: litLeft.join(''), litRight: litRight.join('')};
};
export const CONE_SCALES = coneScales();

/** A bough's mirror: 1 as drawn, −1 flipped left to right on the canvas (the TR and BR corners). */
export type Mirror = 1 | -1;

/** A spiky holly leaf of unit length along +x, half-width 0.25, with five points per side. */
export const HOLLY_LEAF = (() => {
  const half = (x: number) => 0.25 * Math.sin(Math.PI * x) ** 0.75;
  const points = [0.14, 0.32, 0.5, 0.68, 0.86];
  const side = (sign: 1 | -1) => {
    const stops = [0, ...points, 1];
    const order = sign < 0 ? stops : [...stops].reverse();
    return order.slice(1).map((x, i) => {
      const from = order[i]!;
      const middle = (from + x) / 2;
      const tip = x === 0 || x === 1 ? 0 : half(x) * 1.08;
      // Each scallop dips toward the midrib between two spikes.
      return `Q${n3(middle)} ${n3(sign * half(middle) * 0.55)} ${n3(x)} ${n3(sign * tip)}`;
    }).join('');
  };
  return `M0 0${side(-1)}${side(1)}Z`;
})();

/** Holly berries around the sprig's centre, in px. */
export const HOLLY_BERRIES = [[-8, 6], [6, 12], [-2, 20]] as const;

/**
 * The bow in its own units (knot at the origin), velvet with no outline: the left tail and loop,
 * mirrored for the right. Each tail makes a half-twist at mid-length, where it narrows to 60% and
 * turns its darker back face out.
 */
export const TAIL_FRONT = 'M-8 8 C-13 22 -17 36 -20.5 50 L-11 52 C-8 38 -2 26 4 12Z';
export const TAIL_BACK = 'M-20.5 50 C-26 64 -36 80 -44 96 L-30 90 L-26 104 C-20 86 -14 68 -11 52Z';
/** The crease where the tail twists, and the sheen along the front face's outer edge. */
const TAIL_TWIST = 'M-20.5 50 L-11 52';
const TAIL_SHEEN = 'M-8.5 10 C-13 22 -16.5 35 -19.5 47';
/** The right tail: the left one mirrored and lifted, so it hangs 8 px shorter. */
export const TAIL_RIGHT_TRANSFORM = 'scale(-1 1) translate(0 -8)';
export const LOOP_LEFT = 'M-6 -4 C-30 -34 -78 -40 -74 -8 C-72 14 -34 10 -6 4Z';
/** Inside the loop: the light caught along its upper outer edge, and the fold running out from the knot. */
const LOOP_SHEEN = 'M-14 -10 C-32 -28 -66 -36 -70 -12';
const LOOP_CREASE = 'M-10 -2 C-30 -12 -52 -14 -66 -8';
/** A pinched knot, gathered at the waist, with two short creases. */
export const KNOT = 'M-10 -11 Q0 -7 10 -11 Q7 0 10 12 Q0 8 -10 12 Q-7 0 -10 -11Z';
const KNOT_CREASES = 'M-4.5 -7.5 Q-3 1 -4.5 8.5M4.5 -7.5 Q3 1 4.5 8.5';
const KNOT_SHEEN = 'M-7 -8.6 Q0 -5.6 7 -8.6';

/**
 * The garland's back needles and the ribbon's back runs. The bough baubles, and the garland
 * baubles' short ribbons, hang between this half and the front one.
 */
export const GarlandBack = memo(({gold}: {gold: string}) => (
  <g>
    <path d={GARLAND.back} fill={NEEDLE_BACK} />
    <path d={GARLAND.ribbonBack} fill="none" stroke={mix(gold, '#000', 0.45)} strokeWidth={4}
      strokeLinecap="round" strokeLinejoin="round" />
  </g>
));

/** The garland's two lit needle depths, the same tones as the corner boughs, and the ribbon's front runs. */
export const GarlandFront = memo(({evergreen, gold}: {evergreen: string; gold: string}) => (
  <g>
    <path d={GARLAND.mid} fill={mix(evergreen, '#000', 0.35)} />
    <path d={GARLAND.front} fill={mix(evergreen, '#E6F2EA', 0.18)} />
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={GARLAND.ribbonFront} stroke={mix(gold, '#000', 0.25)} strokeWidth={5} />
      <path d={GARLAND.ribbonFront} stroke={gold} strokeWidth={3.6} />
      <path d={GARLAND.ribbonFront} transform="translate(0 -1)" stroke={CREAM} strokeOpacity={0.55} strokeWidth={1.2} />
    </g>
  </g>
));

/** How far a scale's light upper lip sits above its dark underside, in the cone's unit box. */
const SCALE_LIP = 'translate(0 -0.07)';

/**
 * A cone in art coordinates, drawn over the front needles so it reads at 1x: a body shaded from the
 * top left (the mirrored gradient on a mirrored bough), and every scale row with a dark underside
 * under a light upper lip. The gold rim on the top rows moves to the other half on a mirrored
 * bough, toward the light.
 */
export const PineCone = ({x, y, rotation, length, width, gold, mirror}: PineConeSpec & {gold: string; mirror: Mirror}) => (
  <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${width / 2} ${length / 2})`}>
    <path d={CONE_BODY} fill={mirror < 0 ? 'url(#christmas-cone-mirrored)' : 'url(#christmas-cone)'} stroke={CONE_SCALE}
      strokeOpacity={0.7} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
    <g fill="none" strokeLinecap="round">
      <path d={CONE_SCALES.all} transform={SCALE_LIP} stroke={mix(CONE, gold, 0.45)} strokeOpacity={0.6} strokeWidth={1.2}
        vectorEffect="non-scaling-stroke" />
      <path d={CONE_SCALES.all} stroke={CONE_SCALE} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <path d={mirror < 0 ? CONE_SCALES.litRight : CONE_SCALES.litLeft} transform={SCALE_LIP} stroke={gold} strokeOpacity={0.6}
        strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </g>
  </g>
);

/**
 * A holly sprig in art coordinates: deeper and more saturated than the teal needles, with a pale
 * edge, so it stands out from both the velvet and the pine. The berries' shading and specular dot
 * sit toward the top left on the canvas: a mirrored bough takes the mirrored gradient and moves the
 * dot to the art's right.
 */
export const Holly = ({x, y, evergreen, mirror}: PineHolly & {evergreen: string; mirror: Mirror}) => (
  <g transform={`translate(${x} ${y})`}>
    {[-160, -20, 75].map((angle) => (
      <g key={angle} transform={`rotate(${angle}) scale(46)`}>
        <path d={HOLLY_LEAF} fill={mix(evergreen, '#000', 0.15)} stroke={mix(evergreen, '#E6F2EA', 0.35)} strokeOpacity={0.4}
          strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d="M0.06 0 L0.94 0" fill="none" stroke={mix(evergreen, '#fff', 0.3)} strokeOpacity={0.4} strokeWidth={1.2}
          vectorEffect="non-scaling-stroke" />
      </g>
    ))}
    {HOLLY_BERRIES.map(([bx, by]) => (
      <g key={`${bx} ${by}`}>
        <circle cx={bx} cy={by} r={7} fill={mirror < 0 ? 'url(#christmas-berry-mirrored)' : 'url(#christmas-berry)'} />
        <circle cx={bx - 2.2 * mirror} cy={by - 2.4} r={1.6} fill={CREAM} />
      </g>
    ))}
  </g>
);

/**
 * One corner bough in art coordinates: stems, three needle depths, then cones, holly and frost over
 * the needles. `mirror` is the cluster's own, so the cones and berries stay lit from the top left
 * like the baubles.
 */
export const PineCluster = memo(({art, evergreen, gold, mirror}: {art: PineArt; evergreen: string; gold: string; mirror: Mirror}) => (
  <g>
    <path d={art.stems} fill={STEM} />
    <path d={art.back} fill={NEEDLE_BACK} />
    <path d={art.mid} fill={mix(evergreen, '#000', 0.35)} />
    <path d={art.front} fill={mix(evergreen, '#E6F2EA', 0.18)} />
    {art.cones.map((cone) => <PineCone key={`${cone.x} ${cone.y}`} {...cone} gold={gold} mirror={mirror} />)}
    {art.holly.map((sprig) => <Holly key={`${sprig.x} ${sprig.y}`} {...sprig} evergreen={evergreen} mirror={mirror} />)}
    <path d={art.frost} fill={SNOW} opacity={0.5} />
  </g>
));

/**
 * The loops and the knot never move; only the tails swing about the knot. Velvet reads by its nap,
 * not by gloss: a darker body that lightens toward the edge (the loop gradient, with no rim
 * stroke), a wide soft sheen along the loop's upper outer edge and a shaded opening where the
 * ribbon turns back into the knot. A thin dark edge, not an outline, keeps the pieces apart where
 * they overlap.
 */
const BowLoops = memo(({burgundy}: {burgundy: string}) => {
  const edge = mix(burgundy, '#000', 0.55);
  return (
    <g>
      <defs>
        <clipPath id="christmas-bow-loop">
          <path d={LOOP_LEFT} />
        </clipPath>
      </defs>
      {[1, -1].map((side) => (
        <g key={side} transform={side < 0 ? 'scale(-1 1)' : undefined}>
          <path d={LOOP_LEFT} fill="url(#christmas-velvet-loop)" />
          <g clipPath="url(#christmas-bow-loop)" fill="none" strokeLinecap="round">
            <path d={LOOP_SHEEN} stroke={mix(burgundy, '#fff', 0.4)} strokeOpacity={0.2} strokeWidth={10} />
            <path d={LOOP_CREASE} stroke={edge} strokeOpacity={0.35} strokeWidth={1.4} />
            <ellipse cx={-15} cy={0.5} rx={7} ry={4.5} fill={mix(burgundy, '#000', 0.45)} stroke="none" opacity={0.75} />
          </g>
          <path d={LOOP_LEFT} fill="none" stroke={edge} strokeOpacity={0.8} strokeWidth={0.9} strokeLinejoin="round" />
        </g>
      ))}
      <path d={KNOT} fill="url(#christmas-velvet-bow)" stroke={edge} strokeOpacity={0.8} strokeWidth={0.9} strokeLinejoin="round" />
      <path d={KNOT_SHEEN} fill="none" stroke={mix(burgundy, '#fff', 0.35)} strokeOpacity={0.5} strokeWidth={1.2} strokeLinecap="round" />
      <path d={KNOT_CREASES} fill="none" stroke={mix(burgundy, '#000', 0.5)} strokeOpacity={0.55} strokeWidth={1.1} strokeLinecap="round" />
    </g>
  );
});

/** One tail: the front face down to the twist, then the darker back face, with a sheen on its outer edge. */
const BowTail = ({burgundy, transform}: {burgundy: string; transform?: string}) => {
  const edge = mix(burgundy, '#000', 0.55);
  return (
    <g transform={transform} strokeLinejoin="round">
      <path d={TAIL_BACK} fill={mix(burgundy, '#000', 0.48)} stroke={edge} strokeOpacity={0.8} strokeWidth={0.9} />
      <path d={TAIL_FRONT} fill="url(#christmas-velvet-bow)" stroke={edge} strokeOpacity={0.8} strokeWidth={0.9} />
      <path d={TAIL_SHEEN} fill="none" stroke={mix(burgundy, '#fff', 0.3)} strokeOpacity={0.45} strokeWidth={1.6} strokeLinecap="round" />
      <path d={TAIL_TWIST} fill="none" stroke={mix(burgundy, '#000', 0.6)} strokeOpacity={0.7} strokeWidth={1} strokeLinecap="round" />
    </g>
  );
};

export const Bow = ({x, y, rotation, burgundy}: {x: number; y: number; rotation: number; burgundy: string}) => (
  <g transform={`translate(${x} ${y}) scale(${BOW.scale})`}>
    <g transform={`rotate(${rotation})`}>
      <BowTail burgundy={burgundy} />
      <BowTail burgundy={burgundy} transform={TAIL_RIGHT_TRANSFORM} />
    </g>
    <BowLoops burgundy={burgundy} />
  </g>
);

/** The ring above a bauble's cap: its radius for a body of radius r. */
export const ringOf = (r: number) => 0.09 * r + 2;

/** Satin ribbon widths in px: the long ribbons from the boughs, the short ones under the garland. */
export const ribbonWidthOf = (L: number) => (L >= 100 ? 6 : 3);

export type BaubleRibbonProps = {
  pivotX: number;
  pivotY: number;
  /** The ribbon's swing, in degrees from vertical. */
  rotation: number;
  L: number;
  radius: number;
  color: string;
};

/**
 * A bauble's satin ribbon, from its pivot down through the top of the ring (drawn over it): darker
 * edges, the ribbon's color and a lighter centre stripe.
 */
export const BaubleRibbon = ({pivotX, pivotY, rotation, L, radius, color}: BaubleRibbonProps) => {
  const a = rotation * DEG;
  const length = L - 1.2 * ringOf(radius);
  const [x2, y2] = [pivotX + length * Math.sin(a), pivotY + length * Math.cos(a)];
  const width = ribbonWidthOf(L);
  const line = {x1: pivotX, y1: pivotY, x2, y2};
  return (
    <g>
      <line {...line} stroke={mix(color, '#000', 0.3)} strokeWidth={width} />
      <line {...line} stroke={color} strokeWidth={width - 1.5} />
      <line {...line} stroke={mix(color, CREAM, 0.55)} strokeOpacity={0.75} strokeWidth={width >= 6 ? 1.5 : 0.8} />
    </g>
  );
};

/** A small ribbon bow, 18 px wide, in its own units (knot at the origin): the left loop and tail. */
const TIE_LOOP = 'M0 0 C-2 -5 -8 -7 -8.8 -3.2 C-9.4 0.2 -4 1.6 0 0Z';
const TIE_TAIL = 'M-0.6 0.4 L-4.4 8.6 L-2.6 7.8 L-1.6 9.6 L0.9 0.8Z';
/** How far the tie bow reaches from its knot, in px, for the content-area bound. */
export const TIE_REACH = 10;

/** The bow that ties a bough bauble's ribbon to its branch, drawn over the needles. */
export const RibbonTie = ({x, y, color}: {x: number; y: number; color: string}) => (
  <g transform={`translate(${x} ${y})`}>
    {[1, -1].map((side) => (
      <g key={side} transform={side < 0 ? 'scale(-1 1)' : undefined}>
        <path d={TIE_TAIL} fill={mix(color, '#000', 0.25)} />
        <path d={TIE_LOOP} fill={color} stroke={mix(color, '#000', 0.4)} strokeWidth={0.6} />
        <path d="M-2 -1.6 C-3.6 -4 -6.6 -4.8 -7.4 -2.6" fill="none" stroke={mix(color, CREAM, 0.5)} strokeOpacity={0.6}
          strokeWidth={0.9} strokeLinecap="round" />
      </g>
    ))}
    <circle r={1.9} fill={mix(color, '#000', 0.15)} />
  </g>
);

export type BaubleProps = {
  x: number;
  y: number;
  /** The ribbon's swing, in degrees from vertical. */
  rotation: number;
  radius: number;
  /** 0 sphere, 1 banded, 2 fluted, 3 drop. */
  style: number;
  tone: number;
  twist: number;
  glow: number;
  cap: number;
  /** Evergreen, burgundy and gold, indexed by tone. */
  tones: readonly [string, string, string];
  /** The caps and rings, and the gilded bands and warm reflections (see paletteOf). */
  metal: string;
  accent: string;
};

/**
 * A glass bauble below its ribbon: ring, cap and body. The cap and the drop follow the swing; the
 * sphere's shading never turns, so its light always comes from the top left. The glint is a flare
 * of the specular highlight: brighter and longer, over a soft glow.
 */
export const Bauble = ({x, y, rotation, radius: r, style, tone, twist, glow, cap, tones, metal, accent}: BaubleProps) => {
  const tint = tones[tone as 0 | 1 | 2];
  const upright = `rotate(${-rotation})`;
  const top = -r - cap;
  const bottom = -r + 2;
  const [topHalf, bottomHalf] = [0.19 * r, 0.23 * r];
  const corner = Math.min(2, cap / 4, topHalf / 2);
  const capPath = `M${-topHalf + corner} ${top}H${topHalf - corner}Q${topHalf} ${top} ${topHalf} ${top + corner}`
    + `L${bottomHalf} ${bottom}H${-bottomHalf}L${-topHalf} ${top + corner}Q${-topHalf} ${top} ${-topHalf + corner} ${top}Z`;
  const flutes = [-0.5, 0, 0.5].map((f) => `M${n3(f * topHalf)} ${top + 1.5}L${n3(f * bottomHalf)} ${bottom - 1}`).join('');
  const ring = ringOf(r);
  const shape = (fill: string) => (style === 3
    ? <path d={DROP_PATH} transform={`${upright} scale(${r})`} fill={fill} />
    : <circle r={r} fill={fill} />);
  const specular = {x: -0.34 * r + 0.12 * r * twist, y: -0.38 * r};
  const tilt = `rotate(-38 ${specular.x} ${specular.y})`;
  const bounce = (degrees: number) => `${n3(0.86 * r * Math.cos(degrees * DEG))} ${n3(0.86 * r * Math.sin(degrees * DEG))}`;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g transform={upright}>
        <path d={capPath} fill="url(#christmas-gold-cap)" />
        <path d={flutes} stroke={mix(metal, '#000', 0.4)} strokeWidth={0.8} fill="none" />
        <circle cy={top - ring} r={ring} fill="none" stroke={metal} strokeWidth={1.5} />
      </g>
      {shape(`url(#christmas-bauble-${tone})`)}
      {style === 2 && (
        <g transform={upright} fill="none" stroke={mix(tint, '#000', 0.5)} strokeOpacity={0.28} strokeWidth={1.2}>
          <ellipse rx={0.25 * r} ry={r} />
          <ellipse rx={0.6 * r} ry={r} />
        </g>
      )}
      {style === 1 && (
        <g transform={upright} fill="none" stroke={accent}>
          <path d={`M${-r} 0A${r} ${0.2 * r} 0 0 0 ${r} 0`} strokeWidth={2.4} />
          <path d={`M${n3(-0.954 * r)} ${n3(-0.3 * r)}A${n3(0.954 * r)} ${n3(0.19 * r)} 0 0 0 ${n3(0.954 * r)} ${n3(-0.3 * r)}`}
            strokeWidth={1.4} strokeOpacity={0.7} />
          {[-0.6, -0.3, 0, 0.3, 0.6].map((f) => (
            <circle key={f} cx={f * r} cy={0.2 * r * Math.sqrt(1 - f * f)} r={Math.max(0.9, 0.05 * r)} fill={accent} stroke="none" />
          ))}
        </g>
      )}
      {shape('url(#christmas-bauble-rim)')}
      <path d={`M${bounce(20)}A${n3(0.86 * r)} ${n3(0.86 * r)} 0 0 1 ${bounce(80)}`} fill="none"
        stroke={mix(accent, CREAM, 0.5)} strokeOpacity={0.22} strokeWidth={0.1 * r} strokeLinecap="round" />
      {glow > 0 && (
        <ellipse cx={specular.x} cy={specular.y} rx={0.42 * r} ry={0.3 * r} transform={tilt} fill="url(#christmas-sparkle-glow)"
          opacity={glow} />
      )}
      <ellipse cx={specular.x} cy={specular.y} rx={0.2 * r * (1 + 0.3 * glow)} ry={0.11 * r} transform={tilt} fill="#fff"
        opacity={0.6 + 0.35 * glow} />
      <circle cx={-0.14 * r + 0.1 * r * twist} cy={-0.56 * r} r={Math.max(0.8, 0.05 * r)} fill="#fff" opacity={0.8} />
      {[-60, -40, -20].map((degrees) => (
        <circle key={degrees} cx={0.72 * r * Math.cos(degrees * DEG) + 0.15 * r * twist} cy={0.72 * r * Math.sin(degrees * DEG)}
          r={Math.max(0.9, 0.035 * r)} fill={WARM_WHITE} opacity={0.5} />
      ))}
    </g>
  );
};

/** A four-point sparkle with a soft glow and a smaller star turned 45°. */
export const Sparkle = ({x, y, rotation, radius, opacity, fill}: {x: number; y: number; rotation: number; radius: number; opacity: number; fill: string}) => (
  <g transform={`translate(${x} ${y}) rotate(${rotation})`} opacity={opacity}>
    <circle r={1.3 * radius} fill="url(#christmas-sparkle-glow)" />
    <path d={SPARKLE_PATH} transform={`scale(${radius})`} fill={fill} />
    <path d={SPARKLE_PATH} transform={`rotate(45) scale(${0.45 * radius})`} fill={fill} opacity={0.6} />
  </g>
);
