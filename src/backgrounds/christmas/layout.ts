import {swagPoint, SWAGS} from './garland';
import {spinePoint, UPPER_SPINES, type Point} from './pine';

/**
 * The hand-placed arrangement of the Christmas frame: the content box it keeps calm, the corner
 * boughs, the baubles, the bow and the pure helpers the scene uses. Static: no frame, no seed.
 */

/** Where the webcam, the gameplay and the overlays sit; only the small far snow crosses it. */
export const CONTENT_BOX = {left: 360, top: 170, right: 1560, bottom: 900} as const;
/** Half-width of the soft edge over which centerCalm fades in around the content box, in px. */
export const FEATHER = 60;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mod = (value: number, size: number) => ((value % size) + size) % size;
export const smoothstep = (a: number, b: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** C1 plateau: 1 well inside the box, 0 outside it and at every snow wrap point. */
export const insideContent = (x: number, y: number) =>
  smoothstep(CONTENT_BOX.left - FEATHER, CONTENT_BOX.left + FEATHER, x)
  * (1 - smoothstep(CONTENT_BOX.right - FEATHER, CONTENT_BOX.right + FEATHER, x))
  * smoothstep(CONTENT_BOX.top - FEATHER, CONTENT_BOX.top + FEATHER, y)
  * (1 - smoothstep(CONTENT_BOX.bottom - FEATHER, CONTENT_BOX.bottom + FEATHER, y));

/** Turns a point about a centre by `degrees` (SVG sense: clockwise on screen); 0 returns it exactly. */
export const rotateAbout = ([x, y]: Point, [rx, ry]: Point, degrees: number): [number, number] => {
  if (degrees === 0) return [x, y];
  const a = (degrees * Math.PI) / 180;
  const dx = x - rx;
  const dy = y - ry;
  return [rx + dx * Math.cos(a) - dy * Math.sin(a), ry + dx * Math.sin(a) + dy * Math.cos(a)];
};

/** A fixed number of draws per item, so a count change only resizes its own layer. */
export const draws = (random: () => number, n: number) => Array.from({length: n}, () => random());

/**
 * Maps one draw u in [0, 1) onto several intervals laid end to end, each in proportion to its
 * length: one draw still places the item, whichever interval it lands in.
 */
export const acrossSpans = (spans: readonly (readonly [number, number])[], u: number) => {
  const total = spans.reduce((sum, [from, to]) => sum + (to - from), 0);
  let rest = u * total;
  for (const [from, to] of spans) {
    if (rest <= to - from) return from + rest;
    rest -= to - from;
  }
  return spans[spans.length - 1]![1];
};

/** The snow fall: wraps happen `margin` px outside the canvas; span = 1080 + 2·margin. */
export const SNOW = {margin: 40, span: 1160, farWraps: 1, nearWraps: 2} as const;

/**
 * Static warm light behind the lower corners and the bow (opaque formats only), in the gold: a red
 * glow over the green velvet would turn brown. `tone` is the palette slot.
 */
export const WARMTH = [
  {x: 180, y: 1060, rx: 480, ry: 300, tone: 2, base: 0.12},
  {x: 1740, y: 1060, rx: 440, ry: 280, tone: 2, base: 0.11},
  {x: 960, y: 60, rx: 380, ry: 110, tone: 2, base: 0.14},
] as const;

export type Cluster = {
  id: 'TL' | 'TR' | 'BL' | 'BR';
  art: 'upper' | 'lower';
  /** The canvas point the bough sways about. */
  root: Point;
  /** The art-coordinate point that lands on the root. */
  artRoot: Point;
  mirror: 1 | -1;
  scale: number;
  /** Largest sway, in degrees, at sway 1. */
  amplitude: number;
};

export const CLUSTERS: readonly Cluster[] = [
  {id: 'TL', art: 'upper', root: [-30, -30], artRoot: [-30, -30], mirror: 1, scale: 1, amplitude: 0.8},
  {id: 'TR', art: 'upper', root: [1950, -30], artRoot: [-30, -30], mirror: -1, scale: 0.94, amplitude: 0.7},
  {id: 'BL', art: 'lower', root: [-40, 1110], artRoot: [-40, 1110], mirror: 1, scale: 1, amplitude: 0.5},
  {id: 'BR', art: 'lower', root: [1960, 1110], artRoot: [-40, 1110], mirror: -1, scale: 0.9, amplitude: 0.6},
];

/** The SVG transform that places a cluster's art and sways it by `rotation` degrees about its root. */
export const clusterTransform = (cluster: Cluster, rotation: number) =>
  `translate(${cluster.root[0]} ${cluster.root[1]}) rotate(${rotation}) `
  + `scale(${cluster.mirror * cluster.scale} ${cluster.scale}) translate(${-cluster.artRoot[0]} ${-cluster.artRoot[1]})`;

/** Where an art-coordinate point of a cluster lands on the canvas, swayed by `rotation` degrees. */
export const clusterPoint = (cluster: Cluster, [ax, ay]: Point, rotation: number) => rotateAbout(
  [cluster.root[0] + cluster.mirror * cluster.scale * (ax - cluster.artRoot[0]), cluster.root[1] + cluster.scale * (ay - cluster.artRoot[1])],
  cluster.root,
  rotation,
);

export type BaubleAnchor = {spine: number; u: number} | {swag: 'A' | 'B'; x: number};

export type BaubleSpec = {
  id: string;
  /** The corner bough it hangs from (index into CLUSTERS), or null for the garland. */
  cluster: number | null;
  anchor: BaubleAnchor;
  /** Ribbon length, cap height and body radius, in px. */
  L: number;
  cap: number;
  r: number;
  /** 0 sphere, 1 banded, 2 fluted, 3 drop. */
  style: 0 | 1 | 2 | 3;
  /** Palette slot: 0 evergreen, 1 burgundy, 2 gold. */
  tone: 0 | 1 | 2;
  /** Swing amplitude in degrees at sway 1, and its harmonic per cycle. */
  amplitude: number;
  harmonic: number;
  /** The ribbon top at rest, on the canvas. */
  pivot: Point;
};

const restPivot = (cluster: number | null, anchor: BaubleAnchor): Point => {
  if ('spine' in anchor) return clusterPoint(CLUSTERS[cluster!]!, spinePoint(UPPER_SPINES[anchor.spine]!, anchor.u), 0);
  const {x, y} = swagPoint(anchor.swag, (anchor.x - SWAGS[anchor.swag].p0[0]) / 660);
  return [x, y];
};

const bauble = (spec: Omit<BaubleSpec, 'pivot'>): BaubleSpec => ({...spec, pivot: restPivot(spec.cluster, spec.anchor)});

/**
 * Hand-placed, in priority order: `baubleCount` keeps the first n. Cluster baubles hang from a
 * point on a bough's spine (S1 is spine 0, S2 spine 1), garland baubles from the swag centreline.
 */
export const BAUBLES: readonly BaubleSpec[] = [
  bauble({id: 'L1', cluster: 0, anchor: {spine: 1, u: 0.35}, L: 300, cap: 10, r: 44, style: 0, tone: 2, amplitude: 3.2, harmonic: 2}),
  bauble({id: 'R1', cluster: 1, anchor: {spine: 1, u: 0.35}, L: 380, cap: 10, r: 40, style: 2, tone: 1, amplitude: 3, harmonic: 2}),
  bauble({id: 'T2', cluster: null, anchor: {swag: 'A', x: 788}, L: 36, cap: 7, r: 16, style: 0, tone: 1, amplitude: 5, harmonic: 4}),
  bauble({id: 'T3', cluster: null, anchor: {swag: 'B', x: 1132}, L: 30, cap: 8, r: 18, style: 1, tone: 0, amplitude: 5, harmonic: 4}),
  bauble({id: 'L2', cluster: 0, anchor: {spine: 1, u: 0.675}, L: 130, cap: 9, r: 34, style: 1, tone: 1, amplitude: 3.6, harmonic: 3}),
  bauble({id: 'R2', cluster: 1, anchor: {spine: 1, u: 0.675}, L: 160, cap: 9, r: 36, style: 0, tone: 2, amplitude: 3.4, harmonic: 3}),
  bauble({id: 'T1', cluster: null, anchor: {swag: 'A', x: 538}, L: 20, cap: 8, r: 18, style: 2, tone: 2, amplitude: 5, harmonic: 4}),
  bauble({id: 'T4', cluster: null, anchor: {swag: 'B', x: 1382}, L: 14, cap: 8, r: 18, style: 3, tone: 2, amplitude: 5, harmonic: 4}),
  bauble({id: 'L3', cluster: 0, anchor: {spine: 1, u: 0.9}, L: 400, cap: 8, r: 26, style: 3, tone: 0, amplitude: 2.8, harmonic: 2}),
  bauble({id: 'R3', cluster: 1, anchor: {spine: 0, u: 0.7}, L: 360, cap: 8, r: 24, style: 1, tone: 0, amplitude: 3, harmonic: 3}),
];

/** The burgundy velvet bow at the garland's centre. */
export const BOW = {x: 960, y: 48, scale: 1.1} as const;
/** A static bound of the bow, including its tails at their widest swing. */
export const BOW_BOX = {left: 868, top: 0, right: 1052, bottom: 166} as const;

/** The bulbs tucked into the top boughs, at rest on the canvas: two in TL and their TR images. */
const TL_LIGHTS: readonly Point[] = [[148, 110], [250, 44]];
export const CORNER_LIGHTS: {TL: readonly Point[]; TR: readonly Point[]} = {
  TL: TL_LIGHTS,
  TR: TL_LIGHTS.map((point) => clusterPoint(CLUSTERS[1]!, point, 0)),
};
