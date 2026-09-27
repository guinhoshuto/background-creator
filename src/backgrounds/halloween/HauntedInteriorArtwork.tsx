import type {ReactNode} from 'react';
import {CorridorThreshold, HauntedCorridor} from './HauntedCorridor';
import {
  ARCH, archRise, BACK, BACK_Z, CANDELABRA, CANDELABRA_FOOT, CANDELABRA_PAN, CANDELABRA_SCALE, CANDLE_TOPS, castOnFloor,
  clipConvex, clipPolygon, convexHull, DATUM, type Direction, ellipsePoints, flattenPath, FLOOR_BORDER, HALL, leftWall,
  mirror, MOON_ANCHORS, MOON_DIRECTION, MOON_SIDE, MOONLIGHT_DEFAULT, moonDirections, moonOnFloor, onBack, onCeiling, onFloor, pathOf, type Point,
  pointedArch, pointInPolygon, PORTRAIT_OVAL, portraitMap, project, projectPath, tudorApex, tudorArch, WALL_REACH, WINDOW,
} from './hauntedInteriorGeometry';

interface HauntedInteriorArchitectureProps {
  moonlight: string;
  candle: string;
  atmosphere: string;
  transparent: boolean;
  /** candleIntensity and moonlightIntensity, fixed for the render: the corridor's lights dim with them. */
  candleIntensity?: number;
  moonlightIntensity?: number;
  /** Light that falls on the floor: drawn over the floor, under the walls, velvet and candelabras. */
  children?: ReactNode;
  /**
   * What shows through each lancet's glazing, left then right, drawn in the left wall's coordinates
   * (the right wall is mirrored): over the glass, the trees, the leading and the broken quarry, under
   * the tracery.
   */
  lancets?: readonly [ReactNode, ReactNode];
}

/*
 * Everything below is computed once, at module level: plans and elevations in centimetres,
 * projected through the one camera in hauntedInteriorGeometry. Only the left side wall is
 * drawn; the right one is its mirror image across the centre line, which is exact because the
 * vanishing point sits on that line.
 */

const wall = leftWall();
const cm = (value: number) => value / 100;
const backCm = (x: number, v: number) => onBack(cm(x), cm(v));
const wallQuad = (u0: number, u1: number, v0: number, v1: number, offset = 0) => {
  const map = leftWall(offset);
  return pathOf([map(u0, v0), map(u0, v1), map(u1, v1), map(u1, v0)]);
};
const backQuad = (x0: number, x1: number, v0: number, v1: number) =>
  pathOf([backCm(x0, v0), backCm(x0, v1), backCm(x1, v1), backCm(x1, v0)]);
const floorQuad = (x0: number, x1: number, u0: number, u1: number) =>
  pathOf([onFloor(x0, u0), onFloor(x1, u0), onFloor(x1, u1), onFloor(x0, u1)]);
const ceilingQuad = (x0: number, x1: number, u0: number, u1: number) =>
  pathOf([onCeiling(x0, u0), onCeiling(x1, u0), onCeiling(x1, u1), onCeiling(x0, u1)]);
const wallLine = (u0: number, u1: number, v: number, offset = 0) => {
  const map = leftWall(offset);
  return pathOf([map(u0, v), map(u1, v)], false);
};
const both = (d: string) => d + projectPath(d, (x, y) => mirror([x, y]));

const HALF = HALL.halfWidth * 100;
const TOP = DATUM.ceiling;
/** Back wall scale in px per cm, for the flat damask pattern. */
const BACK_SCALE_CM = (BACK.right - BACK.left) / (2 * HALF);

/* ----------------------------------------------------------------------------- planes */

const SIDE_WALL = wallQuad(0, WALL_REACH, 0, TOP);
export const CEILING = ceilingQuad(-HALF, HALF, 0, WALL_REACH);
const FLOOR = floorQuad(-HALF, HALF, 0, WALL_REACH);
const BACK_WALL = backQuad(-HALF, HALF, 0, TOP);

/** Floor: a dark border along each wall; the field between them is laid in marble squares. */
const FIELD = HALF - FLOOR_BORDER;
/** The marble's two squares: light falling on the field takes their green-grey cast. */
export const MARBLE = {light: '#1c2522', dark: '#161e1c'} as const;
const TILE = (2 * FIELD) / 8;
const FLOOR_STRIP = floorQuad(-HALF, -FIELD, 0, WALL_REACH);
const FLOOR_FIELD = floorQuad(-FIELD, FIELD, 0, WALL_REACH);
const FLOOR_TILES_DARK = Array.from({length: 8}, (_, column) => Array.from({length: 6}, (_, row) =>
  (column + row) % 2 ? '' : floorQuad(-FIELD + column * TILE, -FIELD + (column + 1) * TILE, row * TILE, (row + 1) * TILE),
)).flat().join('');
const FLOOR_JOINTS = [
  ...Array.from({length: 9}, (_, i) => pathOf([onFloor(-FIELD + i * TILE, 0), onFloor(-FIELD + i * TILE, WALL_REACH)], false)),
  ...Array.from({length: 6}, (_, i) => pathOf([onFloor(-FIELD, i * TILE), onFloor(FIELD, i * TILE)], false)),
].join('');
/** Faint veins in the marble, drawn in the floor plan. */
const FLOOR_VEINS = projectPath(
  'M-300 40Q-240 70-200 60Q-160 50-110 110M60 20Q110 60 170 50Q230 40 260 120M-60 190Q0 230 80 210M150 300Q210 330 290 320M-280 260Q-230 300-160 290',
  (x, u) => onFloor(x, u),
);
/** Strip along the wall, and the brass inlay that finishes it towards the field. */
const STRIP_INLAY = pathOf([onFloor(-FIELD - 12, 0), onFloor(-FIELD - 12, WALL_REACH)], false);
const STRIP_EDGE = floorQuad(-FIELD - 3, -FIELD, 0, WALL_REACH);
/** The strip carried a little under the wall, and the joint line along the wall's foot. */
const STRIP_UNDERLAY = floorQuad(-HALF - 4, -HALF + 4, 0, WALL_REACH);
const WALL_FOOT = wallLine(0, WALL_REACH, 0);
/** The floor a light can land on: all of it, or only the two strips over gameplay. */
export const FLOOR_VISIBLE = {
  opaque: FLOOR,
  transparent: both(FLOOR_STRIP),
};
/** What remains over gameplay: both side walls and both floor strips. */
export const RETAINED = both(SIDE_WALL) + both(FLOOR_STRIP);
/**
 * The same, short of the dark section edges that finish the cuts over gameplay: light drawn only
 * here never touches an anti-aliased edge, so it cannot change the alpha of the frame.
 */
export const WALLS_CORE = both(wallQuad(2.5, WALL_REACH, 0, TOP - 2.5));
export const RETAINED_CORE = WALLS_CORE + both(floorQuad(-HALF, -FIELD - 3, 1.5, WALL_REACH));
export const SIDE_WALLS = both(SIDE_WALL);

/* ------------------------------------------------------------------------------ ceiling */

/**
 * A calm ceiling: two flat ribs along the hall, converging on the vanishing point, and three across
 * on the 1/Z grid, a shade off the plaster; a rose for the chandelier.
 */
const RIB = 12;
const RIB_X = [-370, 370];
const CEILING_RIBS = [
  ...RIB_X.map((x) => ceilingQuad(x - RIB / 2, x + RIB / 2, 0, WALL_REACH)),
  ...[0, 110, 220].map((u) => ceilingQuad(-370, 370, u, u + RIB)),
].join('');
const CEILING_RIB_SHADOWS = [
  ...RIB_X.map((x) => pathOf([onCeiling(x + (x < 0 ? RIB / 2 : -RIB / 2), 0), onCeiling(x + (x < 0 ? RIB / 2 : -RIB / 2), WALL_REACH)], false)),
  ...[0, 110, 220].map((u) => pathOf([onCeiling(-370, u + RIB), onCeiling(370, u + RIB)], false)),
].join('');
const ROSE_U = Math.round((BACK_Z - 5.5) * 100);
const CEILING_ROSE = [30, 22, 11].map((r) => pathOf(ellipsePoints(0, ROSE_U, r, r).map(([x, u]) => onCeiling(x, u))));
const ROSE_PETALS = projectPath(
  Array.from({length: 8}, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const p = (r: number, t: number) => `${(r * Math.cos(a + t)).toFixed(1)} ${(ROSE_U + r * Math.sin(a + t)).toFixed(1)}`;
    return `M${p(13, 0)}Q${p(22, 0.3)} ${(27 * c).toFixed(1)} ${(ROSE_U + 27 * s).toFixed(1)}Q${p(22, -0.3)} ${p(13, 0)}Z`;
  }).join(''),
  (x, u) => onCeiling(x, u),
);

/* ------------------------------------------------------------------------ shared datums */

/** Bands of the side walls: skirting, dado rail, frieze and crown, receding to the vanishing point. */
const BANDS = [
  {v0: 0, v1: DATUM.base, fill: '#0d1412'},
  {v0: DATUM.wainscot, v1: DATUM.cap, fill: '#2c352e'},
  {v0: DATUM.frieze, v1: DATUM.cornice, fill: '#29322c'},
  {v0: DATUM.cornice, v1: DATUM.crown, fill: '#131a18'},
  {v0: DATUM.crown, v1: TOP, fill: '#222c27'},
] as const;
const BAND_LIGHTS = [DATUM.base, DATUM.cap, DATUM.cornice, DATUM.crown];
const BAND_SHADOWS = [DATUM.wainscot, DATUM.frieze];

/* ------------------------------------------------------------------------- back wall */

/** The archway: a four-centred arch 6.1 m wide whose void holds the title, then a vaulted passage. */
const ARCH_FACE = tudorArch(0, 0, ARCH);
const ARCH_APEX = tudorApex(ARCH);
const backPath = (points: readonly Point[]) => pathOf(points.map(([x, v]) => backCm(x, v)));
const atDepth = (points: readonly Point[], depth: number) => points.map(([x, v]) => project(cm(x), cm(v), BACK_Z + cm(depth)));
const ARCH_OPENING = backPath(ARCH_FACE);
const ARCH_MOULDS = [26, 17, 7].map((grow) => backPath(tudorArch(0, 0, ARCH, grow)));
const ARCH_MOULD_LINES = [26, 7].map((grow) => pathOf(tudorArch(0, 0, ARCH, grow).slice(1, -1).map(([x, v]) => backCm(x, v)), false)).join('');
/** The reveal of the arch, as strips between the wall face and the far face of the wall. */
const REVEAL = (() => {
  const near = ARCH_FACE.map(([x, v]) => backCm(x, v));
  const far = atDepth(ARCH_FACE, ARCH.depth);
  const strips = {jamb: [] as string[], soffit: [] as string[]};
  for (let i = 0; i < near.length - 1; i++) {
    const [a, b] = [ARCH_FACE[i]!, ARCH_FACE[i + 1]!];
    const d = pathOf([near[i]!, near[i + 1]!, far[i + 1]!, far[i]!]);
    (Math.abs(a[0] - b[0]) < 1 ? strips.jamb : strips.soffit).push(d);
  }
  return {jamb: strips.jamb.join(''), soffit: strips.soffit.join(''), floor: pathOf([near[0]!, near[near.length - 1]!, far[far.length - 1]!, far[0]!])};
})();
/**
 * Beyond the reveal, a corridor of the same section (HauntedCorridor) runs on to an end wall: it
 * is seen only through the far face of the reveal, which clips it.
 */
const ARCH_FAR = pathOf(atDepth(ARCH_FACE, ARCH.depth));

/**
 * The side walls' datums turn the back corners at the same heights: the wainscot, its rail and the
 * skirting run on as wood across the piers, up to the arch's moulding; above, frieze, cornice and
 * crown merge into one plain band, a shade off the pier, so the top of the content stays unstriped.
 */
const PIER = ARCH.half + 26;
const piers = (v0: number, v1: number) => backQuad(-HALF, -PIER, v0, v1) + backQuad(PIER, HALF, v0, v1);
const pierLine = (v: number) => pathOf([backCm(-HALF, v), backCm(-PIER, v)], false) + pathOf([backCm(PIER, v), backCm(HALF, v)], false);
const PIER_WAINSCOT = piers(DATUM.base, DATUM.wainscot);
const BACK_BANDS = [
  {d: piers(0, DATUM.base), fill: '#0a0f0e'},
  {d: piers(DATUM.wainscot, DATUM.cap), fill: '#141b19'},
  {d: backQuad(-HALF, HALF, DATUM.frieze, TOP), fill: '#101715'},
];
const BACK_RAIL_LINE = pierLine(DATUM.cap);
const BACK_CORNICE_LINE = pathOf([backCm(-HALF, DATUM.cornice), backCm(HALF, DATUM.cornice)], false);

/** Faint damask on the piers and spandrels, laid flat on the back wall. */
export const DAMASK = 'M41 9Q51 23 43 34Q67 23 65 42Q59 55 45 52Q52 68 41 79Q30 68 37 52Q23 55 17 42Q15 23 39 34Q31 23 41 9ZM41 84Q53 98 63 93Q62 111 43 112L41 121 39 112Q20 111 19 93Q29 98 41 84Z';
const DAMASK_SCALE = 0.62;

/* ------------------------------------------------------------------------ side wall */

const SIDE_PANELS = Array.from({length: 7}, (_, i) => {
  const u0 = 10 + i * 66;
  return {outer: wallQuad(u0, u0 + 54, 28, 100), inner: wallQuad(u0 + 7, u0 + 47, 35, 93)};
});

/** The lancet: outline on the wall face and on the glass, WINDOW.reveal deeper, plus stone tracery. */
const windowArch = (grow = 0) => pointedArch(WINDOW.u, WINDOW.half, WINDOW.sill, WINDOW.spring, WINDOW.c, grow);
const glass = leftWall(-WINDOW.reveal);
const onGlass = (points: readonly Point[]) => pathOf(points.map(([u, v]) => glass(u, v)));
const onWallFace = (points: readonly Point[], offset = 0) => {
  const map = leftWall(offset);
  return pathOf(points.map(([u, v]) => map(u, v)));
};
const WINDOW_OPENING = onWallFace(windowArch());
const WINDOW_MOULDS = [windowArch(17), windowArch(9)].map((points) => onWallFace(points));
const WINDOW_MOULD_LINE = pathOf(windowArch(17).map(([u, v]) => wall(u, v)), false);
const WINDOW_GLASS = onGlass(windowArch());
/**
 * The stone ledge under the sill, projecting WINDOW.ledge into the hall: its top (below the eye,
 * so it shows), its front face and the end that faces the camera, so it reads as a solid block.
 */
const ledge = leftWall(WINDOW.ledge);
const LEDGE = {u0: WINDOW.u - WINDOW.half - 12, u1: WINDOW.u + WINDOW.half + 12, v0: WINDOW.sill - 9, v1: WINDOW.sill} as const;
const WINDOW_SILL = pathOf([wall(LEDGE.u0, LEDGE.v1), ledge(LEDGE.u0, LEDGE.v1), ledge(LEDGE.u1, LEDGE.v1), wall(LEDGE.u1, LEDGE.v1)]);
const WINDOW_SILL_FACE = pathOf([ledge(LEDGE.u0, LEDGE.v1), ledge(LEDGE.u0, LEDGE.v0), ledge(LEDGE.u1, LEDGE.v0), ledge(LEDGE.u1, LEDGE.v1)]);
const WINDOW_SILL_END = pathOf([wall(LEDGE.u1, LEDGE.v0), wall(LEDGE.u1, LEDGE.v1), ledge(LEDGE.u1, LEDGE.v1), ledge(LEDGE.u1, LEDGE.v0)]);
/** Both ledges' upper faces, on screen: right under the glass, what a flash through it lights most. */
export const SILL_TOPS = both(WINDOW_SILL);
/** Stone tracery on the glass plane: a mullion splits the lancet into two lights under a roundel. */
const LIGHT = {half: 19, offset: 23, spring: 318} as const;
const TRANSOMS = [214, 272] as const;
const ROUNDEL = {v: 372, r: 11} as const;
const LIGHTS = [-1, 1].map((side) => pointedArch(WINDOW.u + side * LIGHT.offset, LIGHT.half, WINDOW.sill, LIGHT.spring, LIGHT.half));
const TRACERY = [
  ...LIGHTS.map((points) => onGlass(points).replace(/Z$/, '')),
  pathOf([glass(WINDOW.u, WINDOW.sill), glass(WINDOW.u, LIGHT.spring + 18)], false),
  ...TRANSOMS.map((v) => pathOf([glass(WINDOW.u - WINDOW.half, v), glass(WINDOW.u + WINDOW.half, v)], false)),
  pathOf(ellipsePoints(WINDOW.u, ROUNDEL.v, ROUNDEL.r, ROUNDEL.r, 32).map(([u, v]) => glass(u, v))),
].join('');
/** Leaded quarries in each light: diagonals in the glass plane. */
const QUARRIES = (() => {
  const lines: string[] = [];
  for (const side of [-1, 1]) {
    const uc = WINDOW.u + side * LIGHT.offset;
    for (let k = -8; k <= 8; k++) {
      const v0 = WINDOW.sill + k * 22;
      lines.push(`M${uc - LIGHT.half} ${v0}L${uc + LIGHT.half} ${v0 + 2 * LIGHT.half}`);
      lines.push(`M${uc + LIGHT.half} ${v0}L${uc - LIGHT.half} ${v0 + 2 * LIGHT.half}`);
    }
  }
  return projectPath(lines.join(''), (u, v) => glass(u, v));
})();
/** The glazing: both lights and the roundel above them, pierced in a plate of stone. */
const LIGHTS_CLIP = LIGHTS.map(onGlass).join('')
  + pathOf(ellipsePoints(WINDOW.u, ROUNDEL.v, ROUNDEL.r, ROUNDEL.r, 32).map(([u, v]) => glass(u, v)));
/**
 * The glass plane of both lancets as the camera sees it, on screen: the glazing and the plate of
 * stone it is pierced in, with the mullion between the lights and the transoms across them. A flash
 * lights the hall from here but never lights this: seen from inside, the stone stands dark against
 * the bright sky. The plane lies WINDOW.reveal behind the wall face, so on screen it runs on under
 * the near side of the opening, where the face hides it: only what shows through the opening (both
 * outlines are convex) is taken, and the moulding beside it still catches the light.
 */
export const TRACERY_PLATE = both(pathOf(clipConvex(windowArch().map(([u, v]) => glass(u, v)), windowArch().map(([u, v]) => wall(u, v)))));
/**
 * Beyond the glass: a distant treeline along the sill, and the sheen of old crown glass. Both lights
 * show the same pines, their tips 5–6 cm apart: a rounded dip between two crowns, backlit by a flash,
 * read as the bottom of a keyhole pane rather than as trees.
 */
const TREELINE = projectPath(
  `M${WINDOW.u - WINDOW.half} ${WINDOW.sill}V${WINDOW.sill + 30}Q${WINDOW.u - 42} ${WINDOW.sill + 22} ${WINDOW.u - 36} ${WINDOW.sill + 34}`
  + `L${WINDOW.u - 30} ${WINDOW.sill + 22}L${WINDOW.u - 24} ${WINDOW.sill + 38}Q${WINDOW.u - 14} ${WINDOW.sill + 30} ${WINDOW.u - 6} ${WINDOW.sill + 26}`
  + `L${WINDOW.u + 4} ${WINDOW.sill + 44}L${WINDOW.u + 12} ${WINDOW.sill + 28}L${WINDOW.u + 18} ${WINDOW.sill + 40}L${WINDOW.u + 23} ${WINDOW.sill + 27}`
  + `L${WINDOW.u + 29} ${WINDOW.sill + 37}L${WINDOW.u + 34} ${WINDOW.sill + 25}`
  + `L${WINDOW.u + 40} ${WINDOW.sill + 24}Q${WINDOW.u + 46} ${WINDOW.sill + 30} ${WINDOW.u + WINDOW.half} ${WINDOW.sill + 26}V${WINDOW.sill}Z`,
  (u, v) => glass(u, v),
);
const GLASS_SHEEN = projectPath(
  `M${WINDOW.u - WINDOW.half} 250L${WINDOW.u + WINDOW.half} 320M${WINDOW.u - WINDOW.half} 300L${WINDOW.u + WINDOW.half} 370`,
  (u, v) => glass(u, v),
);
/** One broken quarry per window, in a different light on each side. */
const BROKEN = [
  {u: WINDOW.u - LIGHT.offset + 4, v: 236},
  {u: WINDOW.u + LIGHT.offset - 2, v: 300},
].map(({u, v}) => ({
  hole: projectPath(`M${u - 9} ${v - 10}L${u + 3} ${v - 16}L${u + 11} ${v - 4}L${u + 5} ${v + 3}L${u + 9} ${v + 12}L${u - 4} ${v + 8}L${u - 10} ${v + 14}L${u - 7} ${v}Z`, (a, b) => glass(a, b)),
  cracks: projectPath(`M${u + 11} ${v - 4}L${u + 18} ${v - 12}M${u - 10} ${v + 14}L${u - 16} ${v + 26}M${u + 3} ${v - 16}L${u + 1} ${v - 30}`, (a, b) => glass(a, b)),
}));

/**
 * Velvet curtains drawn aside from the lancet, hung 10 cm in front of the wall (nearer the back
 * corner they would cross into the content area). Each panel is laid in the wall's elevation as
 * folds that run from the rod to the tie-back, then flare out and pool on the floor.
 */
const CURTAIN_OFFSET = 10;
const curtainMap = leftWall(CURTAIN_OFFSET);
const onCurtain = (d: string) => projectPath(d, (u, v) => curtainMap(u, v));
const ROD_V = 440;
const TIE_V = 196;
type Panel = {top: [number, number]; tie: [number, number]; bottom: [number, number]};
const PANELS: Panel[] = [
  {top: [34, 98], tie: [36, 58], bottom: [32, 70]},
  {top: [238, 186], tie: [234, 212], bottom: [240, 196]},
];
const FOLDS = 7;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const foldLine = (panel: Panel, t: number) => {
  const top = lerp(panel.top[0], panel.top[1], t);
  const tie = lerp(panel.tie[0], panel.tie[1], t);
  const bottom = lerp(panel.bottom[0], panel.bottom[1], t);
  // The hem rests on the floor, lifting a little between folds: it never cuts into the floor.
  const hem = 1.5 + 1.5 * Math.sin(t * Math.PI * FOLDS);
  const f = (value: number) => value.toFixed(1);
  return {
    down: `${f(top)} ${ROD_V - 3}C${f(top)} ${ROD_V - 60} ${f(lerp(top, tie, 0.7))} ${TIE_V + 70} ${f(tie)} ${TIE_V}`
      + `C${f(tie)} ${TIE_V - 70} ${f(bottom)} 60 ${f(bottom)} ${f(hem)}`,
    up: `${f(bottom)} ${f(hem)}C${f(bottom)} 60 ${f(tie)} ${TIE_V - 70} ${f(tie)} ${TIE_V}`
      + `C${f(lerp(top, tie, 0.7))} ${TIE_V + 70} ${f(top)} ${ROD_V - 60} ${f(top)} ${ROD_V - 3}`,
  };
};
const CURTAINS = PANELS.map((panel) => {
  const lines = Array.from({length: FOLDS + 1}, (_, i) => foldLine(panel, i / FOLDS));
  const bands = lines.slice(0, -1).map((line, i) => onCurtain(`M${line.down}L${lines[i + 1]!.up}Z`));
  const outline = onCurtain(`M${lines[0]!.down}L${lines[FOLDS]!.up}Z`);
  const creases = lines.slice(1, -1).map((line) => onCurtain(`M${line.down}`)).join('');
  const ridges = Array.from({length: FOLDS}, (_, i) => i % 2 ? '' : onCurtain(`M${foldLine(panel, (i + 0.55) / FOLDS).down}`)).join('');
  const inner = onCurtain(`M${lines[FOLDS]!.down}`);
  const [a, b] = panel.tie;
  const cord = onCurtain(`M${a - 2} ${TIE_V + 4}Q${(a + b) / 2} ${TIE_V - 7} ${b + 2} ${TIE_V + 3}L${b + 2} ${TIE_V - 3}Q${(a + b) / 2} ${TIE_V - 14} ${a - 2} ${TIE_V - 3}Z`);
  const knot = a + (b - a) * 0.3;
  const tassel = onCurtain(`M${knot} ${TIE_V - 6}Q${knot - 2} ${TIE_V - 16} ${knot - 5} ${TIE_V - 26}L${knot - 7} ${TIE_V - 52}L${knot + 7} ${TIE_V - 52}L${knot + 5} ${TIE_V - 26}Q${knot + 2} ${TIE_V - 16} ${knot} ${TIE_V - 6}Z`);
  const tasselHead = onCurtain(`M${knot - 5} ${TIE_V - 20}Q${knot} ${TIE_V - 30} ${knot + 5} ${TIE_V - 20}Q${knot} ${TIE_V - 14} ${knot - 5} ${TIE_V - 20}Z`);
  const fringe = onCurtain(Array.from({length: 5}, (_, i) => `M${knot - 6 + i * 3} ${TIE_V - 30}L${knot - 6.5 + i * 3.2} ${TIE_V - 52}`).join(''));
  const rings = Array.from({length: FOLDS + 1}, (_, i) => {
    const u = lerp(panel.top[0], panel.top[1], i / FOLDS);
    return pathOf(ellipsePoints(u, ROD_V, 2.6, 3.2, 12).map(([x, y]) => leftWall(CURTAIN_OFFSET + 2)(x, y)));
  }).join('');
  return {bands, outline, creases, ridges, inner, cord, tassel, tasselHead, fringe, rings};
});
/** Screen outline of each curtain panel and of its tassel (left wall), for the tests. */
const curtainPoints = (d: string) => flattenPath(d).flatMap(({points}) => points.map(([u, v]) => curtainMap(u, v)));
export const CURTAIN_OUTLINES: readonly Point[][] = PANELS.map((panel) => {
  const lines = [foldLine(panel, 0), foldLine(panel, 1)];
  return curtainPoints(`M${lines[0]!.down}L${lines[1]!.up}Z`);
});
export const CURTAIN_TASSELS: readonly Point[][] = PANELS.map((panel) => {
  const knot = panel.tie[0] + (panel.tie[1] - panel.tie[0]) * 0.3;
  return curtainPoints(`M${knot - 7} ${TIE_V - 6}L${knot + 7} ${TIE_V - 6}L${knot + 7} ${TIE_V - 52}L${knot - 7} ${TIE_V - 52}Z`);
});
/** Both walls' curtain panels, on screen: a flash lights the velvet where it hangs over the glass too. */
export const CURTAIN_SHAPES = both(CURTAINS.map((curtain) => curtain.outline).join(''));
/** Both walls' tie-backs and curtain rings, on screen: the old gold drawn over the velvet (and just past it). */
export const CURTAIN_TIEBACKS = both(CURTAINS.map((curtain) => curtain.cord + curtain.tassel + curtain.tasselHead + curtain.rings).join(''));
const ROD = wallLine(36, 244, ROD_V, 12);
const ROD_FINIALS = [36, 244].map((u) => pathOf(ellipsePoints(u, ROD_V, 4.5, 4.5, 20).map(([a, b]) => leftWall(12)(a, b)))).join('');
const ROD_BRACKETS = [46, 234].map((u) => pathOf([wall(u - 2, ROD_V + 3), leftWall(12)(u - 2, ROD_V + 1), leftWall(12)(u + 2, ROD_V - 1), wall(u + 2, ROD_V - 4)])).join('');

/** Damask on the side walls, laid in the wall plane where nothing else hangs. */
const SIDE_DAMASK = (() => {
  const shapes: string[] = [];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 9; column++) {
      const u = 24 + column * 48 + (row % 2) * 24;
      const v = 172 + row * 70;
      const behind = (u > 8 && u < 252) || (u > 236 && u < 350 && v > 214 && v < 400);
      if (behind || v > 420) continue;
      shapes.push(projectPath(DAMASK, (x, y) => wall(u - (x - 41) * DAMASK_SCALE * 0.8, v - (y - 63) * DAMASK_SCALE * 0.8)));
    }
  }
  return shapes.join('');
})();

const SIDE_CRACKS = [
  ['M352 430l-8-22 10-18-6-26m2 22-18 4', 'M262 190l6-22-9-20 12-22m-6 20 14 4', 'M372 300l-6-18 8-16'],
  ['M356 400l8-26-8-22 14-30m-4 30 18 6', 'M270 206l-8-28 12-20-6-34', 'M380 250l6-16-5-14'],
].map((set) => set.map((d) => projectPath(d, (u, v) => wall(u, v))).join(''));
/**
 * Moonlight through the lancet, drawn in the left half, cast along MOON_DIRECTION onto the floor. Light
 * passes only where the lancet is glazed, its two lights and the roundel: the plate of stone around
 * them, the mullion between the lights and the transoms across them cast their shadows. Each opening
 * is cast from the glass and from the plate's inner face, TRACERY_DEPTH nearer the hall, and the
 * light keeps what passes both, so the depth of the stone shades the edges it faces. It must then
 * clear the wall's own opening, WINDOW.reveal nearer still, and the front edge of the stone ledge
 * under the sill, which keep the lowest glass (about 25 cm of it) in shade. The velvet, hung aside,
 * stays clear of the light. What is left approximate: the plate is flat and of one depth, the
 * transoms are bars of the same stone, and the glass does not refract. Only the lancet on the moon's
 * side (MOON_SIDE) casts it, drawn here and mirrored when that is the right one: the other, on the
 * facing wall, casts no moonlight. Nor does a lightning strike cast these panes, through either
 * lancet: its light comes from a broad patch of sky, and lies on the floor soft (the composition's
 * STORM_POOL).
 */
const GLAZING_INSET = 1.2;
const TRANSOM_FACE = 2.3;
const TRACERY_DEPTH = 6;
const LIGHT_PANES: readonly Point[][] = [-1, 1].flatMap((side) => {
  const light = pointedArch(WINDOW.u + side * LIGHT.offset, LIGHT.half, WINDOW.sill, LIGHT.spring, LIGHT.half, -GLAZING_INSET);
  const cuts = [WINDOW.sill, ...TRANSOMS, Infinity];
  return cuts.slice(1).map((top, i) => {
    const bottom = i ? cuts[i]! + TRANSOM_FACE / 2 : cuts[i]!;
    const upper = Number.isFinite(top) ? top - TRANSOM_FACE / 2 : top;
    return clipPolygon(clipPolygon(light, ([, v]) => v - bottom), ([, v]) => upper - v);
  });
});
const PANES: readonly Point[][] = [
  ...LIGHT_PANES,
  ellipsePoints(WINDOW.u, ROUNDEL.v, ROUNDEL.r - GLAZING_INSET, ROUNDEL.r - GLAZING_INSET, 32),
];
const castAt = (points: readonly Point[], offset: number, direction: Direction): Point[] =>
  points.map(([u, v]) => castOnFloor(u, v, offset, direction));
/** One pane of glass cast on the floor (x, z in metres) along `direction`, past the stone around it. */
const castPane = (pane: readonly Point[], direction: Direction): Point[] => {
  const throughPlate = clipConvex(castAt(pane, -WINDOW.reveal, direction), castAt(pane, -WINDOW.reveal + TRACERY_DEPTH, direction));
  const throughWall = clipConvex(throughPlate, castAt(windowArch(), 0, direction));
  const ledgeEdge = -HALL.halfWidth + WINDOW.ledge / 100 + (direction.x * WINDOW.sill) / 100;
  return clipPolygon(throughWall, ([x]) => x - ledgeEdge);
};
const onFloorPlan = (points: readonly Point[]) => points.map(([x, z]) => project(x, 0, z));
/** The lit panes on the floor along MOON_DIRECTION (x, z in metres), for the tests. */
export const MOON_POOL_PANES: readonly Point[][] = PANES.map((pane) => castPane(pane, MOON_DIRECTION)).filter((pane) => pane.length > 2);
/**
 * The same for the two lights alone: what reads as the pool, about 2.3 m of it. The roundel's small
 * spot, apart beyond the lights' tips, carries the lit floor on to about 2.5 m.
 */
export const MOON_POOL_LIGHTS: readonly Point[][] = LIGHT_PANES.map((pane) => castPane(pane, MOON_DIRECTION)).filter((pane) => pane.length > 2);
/**
 * The pool, once per direction of the moon's cone (MOON_POOL_SAMPLES of them). Laid over one another
 * at an even share each, their edges and the shadows of the bars blur by as much as the light
 * spreads on its way down: sharp near the wall, soft at the far end, as a real window's light.
 */
export const MOON_POOL_SAMPLES = 24;
export const MOON_POOL_LAYERS: readonly string[] = moonDirections(MOON_POOL_SAMPLES).map((direction) =>
  PANES.map((pane) => castPane(pane, direction)).filter((pane) => pane.length > 2).map((pane) => pathOf(onFloorPlan(pane))).join(''));
/** The pool's length on screen: from the cast of the sill's middle to that of the lancet's apex. */
export const MOON_POOL_AXIS = {
  from: onFloorPlan([moonOnFloor(WINDOW.u, WINDOW.sill)])[0]!,
  to: onFloorPlan([moonOnFloor(WINDOW.u, WINDOW.spring + archRise(WINDOW.half, WINDOW.c))])[0]!,
};
/**
 * Traced back against MOON_DIRECTION, a lit point of the floor (x, z in metres) meets the glass
 * where its light came in: that point of the glass, in the left wall's elevation (cm).
 */
export const glassSourceOf = ([x, z]: Point): Point => {
  const drop = (x + HALL.halfWidth + WINDOW.reveal / 100) / MOON_DIRECTION.x;
  return [(BACK_Z - z + MOON_DIRECTION.z * drop) * 100, drop * 100];
};
/**
 * The outline of the light in the air between the glass and the pool, on screen: the convex hull of
 * the lit panes and of the glass they were lit through. Glass the ledge keeps in shade and the stone
 * tip of the arch send no light down, so they are left out: the beam lands where the floor is lit.
 */
export const MOON_SHAFT_POINTS: readonly Point[] = convexHull([
  ...MOON_POOL_PANES.flat().map((point) => glass(...glassSourceOf(point))),
  ...onFloorPlan(MOON_POOL_PANES.flat()),
]);
/**
 * Spacing, in metres on the floor, of the moon's rays that make up the beam (MOON_SHAFT_RAYS): at
 * 5 cm, neighbouring rays lie a few pixels apart on screen, and the beam's blur joins them.
 */
export const MOON_RAY_STEP = 0.05;
/**
 * The beam itself, as the moon's own rays, each a segment on screen from the point of the glass it
 * came in through to where it lands: one from each point of a MOON_RAY_STEP grid laid over the lit
 * panes on the floor (a fixed grid, so the rays do not depend on how the panes are cut). Drawn thin
 * and faint over one another and blurred, they add up as the light of a beam in dusty air does: to
 * how much lit air the eye looks through. That is most down the middle, where the rays of every pane
 * cross, and it falls away to nothing at the outline, with the mullion and transoms leaving darker
 * streaks. A beam filled evenly up to its outline instead lies on the floor between the wall and the
 * pool as a flat, sharp-edged wedge of light: a stage spotlight, not haze.
 */
export const MOON_SHAFT_RAYS: readonly (readonly [Point, Point])[] = MOON_POOL_PANES.flatMap((pane) => {
  /** The grid's lines between the smallest and the largest of `values`. */
  const lines = (values: readonly number[]) => {
    const [first, last] = [Math.ceil(Math.min(...values) / MOON_RAY_STEP), Math.floor(Math.max(...values) / MOON_RAY_STEP)];
    return Array.from({length: Math.max(0, last - first + 1)}, (_, i) => (first + i) * MOON_RAY_STEP);
  };
  return lines(pane.map(([x]) => x))
    .flatMap((x) => lines(pane.map(([, z]) => z)).map((z): Point => [x, z]))
    .filter((point) => pointInPolygon(point, pane))
    .map((point) => [glass(...glassSourceOf(point)), onFloorPlan([point])[0]!] as const);
});
/** The shaft's axis: from its anchor on the glass to where that point of the glass lands on the floor. */
export const MOON_SHAFT_AXIS = {
  from: MOON_ANCHORS[0]!,
  to: onFloorPlan([moonOnFloor(WINDOW.u, WINDOW.spring + 30)])[0]!,
};
/**
 * What of each light of the left lancet the camera sees, as a span of screen x (the glass is
 * upright, so it holds at every height): the far light (smaller u) whole, the near one only from
 * where the near jamb of the wall's opening, WINDOW.reveal in front of the glass, stops hiding it.
 */
const LIGHT_SPANS = [-1, 1].map((side) => {
  const uc = WINDOW.u + side * LIGHT.offset;
  const [a, b] = [glass(uc - LIGHT.half, WINDOW.sill)[0], glass(uc + LIGHT.half, WINDOW.sill)[0]];
  const jamb = wall(WINDOW.u + WINDOW.half, WINDOW.sill)[0];
  return [Math.max(Math.min(a, b), jamb), Math.max(a, b)] as const;
});
/**
 * What a flash of lightning redraws in the left lancet (the right one is its mirror): the glazing it
 * lights, and the trees, the leading and each window's broken quarry (left, then right), which stand
 * out against it; and the visible span of each light, far then near, that a bolt is drawn behind.
 */
export const LANCET = {
  lights: LIGHTS_CLIP, trees: TREELINE, leading: QUARRIES, broken: [BROKEN[0]!, BROKEN[1]!],
  spans: [LIGHT_SPANS[0]!, LIGHT_SPANS[1]!],
} as const;

/* -------------------------------------------------------------------------- portrait */

const FRAME_SHADOW = pathOf(ellipsePoints(6, 8, 82, 108).map(([x, y]) => portraitMap(x, y)));
const FRAME_RINGS = [[78, 104], [70, 95], [64, 88]].map(([rx, ry]) =>
  pathOf(ellipsePoints(0, 0, rx!, ry!).map(([x, y]) => portraitMap(x, y))));
const PAINTING = pathOf(PORTRAIT_OVAL);
const onPortrait = (d: string) => projectPath(d, portraitMap);
const FRAME_CREST = onPortrait('M-16-104Q-12-116-4-114Q-2-122 0-124Q2-122 4-114Q12-116 16-104Q6-108 0-106Q-6-108-16-104Z');
const PORTRAIT_FIGURE = [
  {
    shoulders: onPortrait('M-60 90Q-57 44-33 34L-17 24H17L32 35Q60 50 60 96Z'),
    collar: onPortrait('M-17 20L-23 38-4 54 20 36 14 19Z'),
    lapels: onPortrait('M-22 38l17 22-7 36h-30L-35 52Zm43-2L-5 60 7 96h32L35 52Z'),
    hair: onPortrait('M-33 2Q-41-38-22-60Q-4-78 20-59Q39-47 30-10L38 30 21 32 12 6H-14L-23 34-39 28Z'),
  },
  {
    shoulders: onPortrait('M-60 90Q-57 44-33 34L-17 24H17L32 35Q60 50 60 96Z'),
    collar: onPortrait('M-17 20L-23 38-4 54 20 36 14 19Z'),
    lapels: onPortrait('M-22 38l17 22-7 36h-30L-35 52Zm43-2L-5 60 7 96h32L35 52Z'),
    hair: onPortrait('M-32-16Q-38-44-22-62L-32-64Q-6-80 19-62Q41-50 33-22L21-8-22 0Z'),
  },
];
const PORTRAIT_FACE = onPortrait('M-24-38Q-12-52 8-48L23-34 20-8Q14 14 0 18Q-18 12-23-9Z');
const PORTRAIT_BROW = onPortrait('M-24-38Q-17-58 4-52L26-34 15-36 1-45-13-38Z');
const PORTRAIT_SOCKETS = onPortrait('M-21-21Q-12-28-5-20L-7-14-19-13ZM6-20Q15-28 23-21L19-13 7-14Z');
const PORTRAIT_CRAZING = onPortrait('M-50-70l16 46-5 36 17 48m48-160-8 34 7 19-12 47 10 44m-64-68 96 15');
const PORTRAIT_NAMEPLATE = onPortrait('M-16 112h32l-4 9h-24Z');

/* -------------------------------------------------------------------------- cobwebs */

/** A web spun in the angle between wall and ceiling: from a point on the seam to anchors on both planes. */
const cornerWeb = (u: number, spread: number) => {
  const hub = wall(u, TOP);
  const ends: Point[] = [
    wall(u - spread * 0.9, TOP - spread * 0.5), wall(u - spread * 0.2, TOP - spread * 1.1), wall(u + spread * 0.7, TOP - spread * 0.8),
    onCeiling(-HALF + spread * 0.9, u + spread * 0.4), onCeiling(-HALF + spread * 0.5, u - spread * 0.7),
  ];
  const ordered = ends.sort((a, b) => Math.atan2(a[1] - hub[1], a[0] - hub[0]) - Math.atan2(b[1] - hub[1], b[0] - hub[0]));
  const radial = ordered.map((end) => pathOf([hub, end], false)).join('');
  const rings = [0.28, 0.5, 0.72, 0.92].map((t) => ordered.slice(1).map((end, i) => {
    const start = ordered[i]!;
    const a: Point = [hub[0] + (start[0] - hub[0]) * t, hub[1] + (start[1] - hub[1]) * t];
    const b: Point = [hub[0] + (end[0] - hub[0]) * t, hub[1] + (end[1] - hub[1]) * t];
    const sag: Point = [(a[0] + b[0]) / 2 + (hub[0] - (a[0] + b[0]) / 2) * 0.2, (a[1] + b[1]) / 2 + (hub[1] - (a[1] + b[1]) / 2) * 0.2];
    return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${sag[0].toFixed(1)} ${sag[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }).join('')).join('');
  return radial + rings;
};
const COBWEBS = cornerWeb(110, 46) + cornerWeb(344, 70);

/* ------------------------------------------------------------------------ candelabra */

/**
 * A floor candelabra, drawn flat at its own depth (it faces the camera): cm, y up, around its
 * foot. The arms reach the outer candles of CANDLE_TOPS, whose tops are CANDLE_ANCHORS, where the
 * animated flames stand; each candle is 22 cm tall, on its pan.
 */
const REACH = CANDLE_TOPS[2][0] * 100;
const PAN = CANDELABRA_PAN * 100;
const CANDLE_LENGTH = 22;
const CANDLE_SEATS = CANDLE_TOPS.map(([dx, h]) => [dx * 100, -(h * 100 - CANDLE_LENGTH)] as const);
const arm = (side: number) => {
  const x = (value: number) => (side * value * REACH / 36).toFixed(1);
  const y = CANDLE_SEATS[0]![1] + 6;
  return `M${side * 4}-119C${x(14)}-117 ${x(27)}-113 ${x(32)}-123C${x(35)}-129 ${x(36)}-134 ${x(36)} ${y}`;
};
const pan = (x: number, y: number, half: number) => `M${x - half} ${y}Q${x} ${y - 4} ${x + half} ${y}Q${x} ${y + 4} ${x - half} ${y}Z`;
const cup = (x: number, y: number) => `M${x - 4} ${y + 6}H${x + 4}L${x + 3} ${y + 2}H${x - 3}Z`;
const CANDELABRA_SHAPE = {
  feet: 'M-24 2L-15-6H15L24 2L20 5H9L0 1-9 5H-20Z',
  dome: 'M-17-5Q-15-18-6-23H6Q15-18 17-5Q9-2 0-2Q-9-2-17-5Z',
  shaft: `M-2.4-23V${CANDLE_SEATS[1]![1] + 2}H2.4V-23Z`,
  knops: 'M-6-42Q0-48 6-42Q0-36-6-42ZM-7-88Q0-96 7-88Q0-81-7-88ZM-10-121Q0-127 10-121L5-115H-5Z',
  arms: arm(-1) + arm(1),
  pans: CANDLE_SEATS.map(([x, y], i) => pan(x, y + 2, i === 1 ? 9 : PAN)).join(''),
  cups: CANDLE_SEATS.map(([x, y]) => cup(x, y)).join(''),
};
const CANDLE_BODY = `M-3.4 0H3.4V-${CANDLE_LENGTH}H-3.4Z`;
const DRIP = `M-3.4-${CANDLE_LENGTH}Q-4-14-3.6-10Q-3-8-2.6-12L-2.4-${CANDLE_LENGTH}Z`;
const onCandelabra = (dx: number, dy: number) => (x: number, y: number): Point => [
  CANDELABRA_FOOT[0] + (x + dx) * CANDELABRA_SCALE / 100, CANDELABRA_FOOT[1] + (y + dy) * CANDELABRA_SCALE / 100,
];
const candelabraPart = (d: string) => projectPath(d, onCandelabra(0, 0));
export const CANDELABRA_PATHS = {
  feet: candelabraPart(CANDELABRA_SHAPE.feet),
  dome: candelabraPart(CANDELABRA_SHAPE.dome),
  shaft: candelabraPart(CANDELABRA_SHAPE.shaft),
  knops: candelabraPart(CANDELABRA_SHAPE.knops),
  arms: candelabraPart(CANDELABRA_SHAPE.arms),
  pans: candelabraPart(CANDELABRA_SHAPE.pans),
  cups: candelabraPart(CANDELABRA_SHAPE.cups),
  candles: CANDLE_SEATS.map(([x, y]) => projectPath(CANDLE_BODY, onCandelabra(x, y))),
  drips: CANDLE_SEATS.map(([x, y]) => projectPath(DRIP, onCandelabra(x, y))).join(''),
  /** Contact shadow on the floor, in the floor plan around the foot. */
  shadow: pathOf(ellipsePoints(CANDELABRA.x * 100 + 8, 0, 46, 22, 40).map(([x, d]) => project(x / 100, 0, CANDELABRA.z - d / 100))),
};

/* ------------------------------------------------------------------------- component */

/**
 * What the moon lights on each wall's lancet, left then right. The one on the moon's side (MOON_SIDE,
 * the right) looks out at the moonlit half of the sky, and the moon itself shines through it onto its
 * sill and the inner edge of the velvet beside it. The other, on the facing wall, looks at the other
 * half: its glass shows the same moonlit clouds, dimmer (`glass`), and its sill and velvet only catch
 * that sky's faint diffuse light (`catch`); these are that lancet's values, and the moon's reaches 1.
 */
const SKYLIT = {glass: 0.7, catch: 0.3} as const;
/**
 * The moon's lancet shows its moonlit glass in full from the default moonlightIntensity
 * (MOONLIGHT_DEFAULT) up; below it the moon dims, and its glass and catch fall linearly towards the
 * other lancet's, which they reach at 0, with no moon at all: then neither window is the brighter one.
 * Left undefined, the intensity is the default.
 */
const moonlitOf = (variant: 0 | 1, moonlightIntensity = MOONLIGHT_DEFAULT) => {
  if (variant !== MOON_SIDE) return SKYLIT;
  const moon = Math.min(1, Math.max(0, moonlightIntensity / MOONLIGHT_DEFAULT));
  return {glass: SKYLIT.glass + (1 - SKYLIT.glass) * moon, catch: SKYLIT.catch + (1 - SKYLIT.catch) * moon};
};

const SideWall = ({variant, moonlight, candle, transparent, moonlightIntensity, lancet}: {
  variant: 0 | 1; moonlight: string; candle: string; transparent: boolean; moonlightIntensity?: number; lancet?: ReactNode;
}) => {
  const figure = PORTRAIT_FIGURE[variant]!;
  const broken = BROKEN[variant]!;
  const moonlit = moonlitOf(variant, moonlightIntensity);
  return (
    <g>
      {/* Everything hangs on the wall (or stands on its strip): nothing strays into the content box. */}
      <g clipPath="url(#hi-art-side-clip)">
        <path d={SIDE_WALL} fill="url(#hi-art-side)" />
        <path d={SIDE_DAMASK} fill="#9fb095" opacity="0.045" />
        <path d={SIDE_CRACKS[variant]} fill="none" stroke="#0a1211" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />

        {/* Wainscot and bands: the same heights run on to the back wall. */}
        <path d={wallQuad(0, WALL_REACH, DATUM.base, DATUM.wainscot)} fill="url(#hi-art-wood)" />
        {SIDE_PANELS.map((panel, i) => <g key={i}>
          <path d={panel.outer} fill="#151c18" stroke="#46503f" strokeWidth="1.2" strokeOpacity="0.4" />
          <path d={panel.inner} fill="#19211c" stroke="#080d0c" strokeWidth="1.6" />
        </g>)}
        {BANDS.map((band) => <path key={band.v0} d={wallQuad(0, WALL_REACH, band.v0, band.v1)} fill={band.fill} />)}
        <path d={BAND_LIGHTS.map((v) => wallLine(0, WALL_REACH, v)).join('')} fill="none" stroke="#a09f82" strokeWidth="1.4" opacity="0.2" />
        <path d={BAND_SHADOWS.map((v) => wallLine(0, WALL_REACH, v)).join('')} fill="none" stroke="#050a09" strokeWidth="2" opacity="0.6" />
        <path d={SIDE_WALL} fill="url(#hi-art-side-shade)" />
        <path d={SIDE_WALL} fill="url(#hi-art-side-height)" />
        {/* The wall's foot: a dark joint where the skirting meets the floor strip. */}
        <path d={WALL_FOOT} fill="none" stroke="#040807" strokeWidth="2.2" />

        {/* The lancet: moulded surround, reveal, dim moonlit glass and stone tracery. */}
        <path d={WINDOW_MOULDS[0]} fill="#28312b" />
        <path d={WINDOW_MOULDS[1]} fill="#323b33" />
        <path d={WINDOW_MOULD_LINE} fill="none" stroke="#aaa88a" strokeWidth="1.2" opacity="0.16" />
        <path d={WINDOW_OPENING} fill="#1c2522" />
        <g clipPath="url(#hi-art-window-clip)">
          <path d={WINDOW_GLASS} fill="#0d1616" />
          <path d={LIGHTS_CLIP} fill="url(#hi-art-glass)" opacity={moonlit.glass} />
          <g clipPath="url(#hi-art-lights-clip)">
            <path d={GLASS_SHEEN} fill="none" stroke={moonlight} strokeWidth="9" opacity={0.06 * moonlit.glass} />
            <path d={TREELINE} fill="#091111" opacity="0.85" />
            <path d={QUARRIES} fill="none" stroke="#0b1414" strokeWidth="1" opacity="0.55" />
            <path d={broken.hole} fill="#050909" />
            <path d={broken.cracks} fill="none" stroke="#dfeae2" strokeWidth="0.7" opacity="0.25" />
            {lancet}
          </g>
          <path d={TRACERY} fill="none" stroke="#141c1a" strokeWidth="3.4" strokeLinejoin="round" />
          <path d={TRACERY} fill="none" stroke="#6f7563" strokeWidth="0.8" opacity="0.25" transform="translate(0.9 0)" />
        </g>
        <path d={WINDOW_SILL_END} fill="#151b18" />
        <path d={WINDOW_SILL_FACE} fill="#1c231f" />
        <path d={WINDOW_SILL} fill="#3a4238" />
        <path d={WINDOW_SILL} fill={moonlight} opacity={0.12 * moonlit.catch} />

        {/* Portrait above the candelabra, dimmed to atmosphere. */}
        <path d={FRAME_SHADOW} fill="#050a0a" opacity="0.5" />
        <path d={FRAME_RINGS[0]} fill="url(#hi-art-frame)" stroke="#0b1210" strokeWidth="1.6" />
        <path d={FRAME_RINGS[1]} fill="#141b17" stroke="#8a7d5a" strokeWidth="1" strokeOpacity="0.4" />
        <path d={FRAME_RINGS[2]} fill="#1d2520" />
        <path d={FRAME_CREST} fill="url(#hi-art-frame)" stroke="#0b1210" strokeWidth="1" />
        <path d={PAINTING} fill="url(#hi-art-portrait)" />
        <g clipPath="url(#hi-art-portrait-clip)">
          <path d={figure.shoulders} fill="#0c1313" />
          <path d={figure.collar} fill="#28302b" />
          <path d={figure.lapels} fill="#161e1c" />
          <path d={figure.hair} fill="#0c1414" />
          <path d={PORTRAIT_FACE} fill="url(#hi-art-face)" />
          <path d={PORTRAIT_BROW} fill="#121a19" />
          <path d={PORTRAIT_SOCKETS} fill="#0d1514" />
          <path d={PORTRAIT_CRAZING} fill="none" stroke="#8a957f" strokeWidth="0.6" opacity="0.1" />
        </g>
        <path d={FRAME_RINGS[0]} fill="none" stroke={candle} strokeWidth="1" opacity="0.18" />
        <path d={PORTRAIT_NAMEPLATE} fill="#4a4633" />

        {/* Velvet flanking the lancet: folds, rim light and a corded tie-back with a tassel. */}
        <path d={ROD_BRACKETS} fill="#3c3627" />
        <path d={ROD} stroke="#060b0a" strokeWidth="6" strokeLinecap="round" opacity="0.45" transform="translate(0 4)" />
        <path d={ROD} stroke="#6a5d40" strokeWidth="3.6" strokeLinecap="round" />
        <path d={ROD_FINIALS} fill="#7c6c49" />
        {CURTAINS.map((curtain, i) => <g key={i}>
          <path d={curtain.outline} fill="#240a11" />
          {curtain.bands.map((band, k) => <path key={k} d={band} fill="url(#hi-art-velvet)" opacity={k % 2 ? 0.55 : 1} />)}
          <path d={curtain.ridges} fill="none" stroke="#9a4455" strokeWidth="1.3" opacity="0.28" />
          <path d={curtain.creases} fill="none" stroke="#10030a" strokeWidth="1.6" opacity="0.7" />
          <path d={curtain.outline} fill="url(#hi-art-velvet-shade)" />
          <path d={curtain.inner} fill="none" stroke={i ? candle : moonlight} strokeWidth="1.3" opacity={i ? 0.3 : 0.22 * moonlit.catch} />
          <path d={curtain.rings} fill="#6f6243" />
          <path d={curtain.cord} fill="#8a7244" stroke="#2a2114" strokeWidth="0.8" />
          <path d={curtain.tassel} fill="#735d36" stroke="#2a2114" strokeWidth="0.8" />
          <path d={curtain.tasselHead} fill="#9a8150" />
          <path d={curtain.fringe} fill="none" stroke="#2a2114" strokeWidth="0.9" />
        </g>)}
      </g>
      <path d={COBWEBS} fill="none" stroke="#b3c2b3" strokeWidth="0.8" opacity="0.13" clipPath={transparent ? 'url(#hi-art-side-clip)' : undefined} />
    </g>
  );
};

/** Static architecture; the animated lights live in the parent composition. */
export const HauntedInteriorArchitecture = ({
  moonlight,
  candle,
  atmosphere,
  transparent,
  candleIntensity,
  moonlightIntensity,
  children,
  lancets,
}: HauntedInteriorArchitectureProps) => (
  <g>
    <defs>
      <linearGradient id="hi-art-back" x1="0" y1={BACK.top} x2="0" y2={BACK.bottom} gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#0c1211" />
        <stop offset="0.6" stopColor="#0f1614" />
        <stop offset="1" stopColor="#0d1312" />
      </linearGradient>
      <linearGradient id="hi-art-side" x1={BACK.left} y1="0" x2="0" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#1f2925" />
        <stop offset="0.5" stopColor="#2b3731" />
        <stop offset="1" stopColor="#303c35" />
      </linearGradient>
      <linearGradient id="hi-art-side-shade" x1={BACK.left} y1="0" x2="0" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#060b0b" stopOpacity="0.5" />
        <stop offset="0.3" stopColor="#060b0b" stopOpacity="0.14" />
        <stop offset="0.75" stopColor="#060b0b" stopOpacity="0" />
        <stop offset="1" stopColor="#060b0b" stopOpacity="0.18" />
      </linearGradient>
      <linearGradient id="hi-art-side-height" x1="0" y1="0" x2="0" y2="1080" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#050a0a" stopOpacity="0.32" />
        <stop offset="0.4" stopColor="#050a0a" stopOpacity="0" />
        <stop offset="1" stopColor="#050a0a" stopOpacity="0.12" />
      </linearGradient>
      <linearGradient id="hi-art-wood" x1="0" y1={BACK.bottom - 160} x2="0" y2="1080" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#1d241e" />
        <stop offset="1" stopColor="#121815" />
      </linearGradient>
      <linearGradient id="hi-art-glass" x1="0" y1="300" x2="0" y2="700" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={moonlight} stopOpacity="0.22" />
        <stop offset="0.45" stopColor={moonlight} stopOpacity="0.12" />
        <stop offset="1" stopColor={moonlight} stopOpacity="0.05" />
      </linearGradient>
      <linearGradient id="hi-art-velvet" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#1a060c" />
        <stop offset="0.38" stopColor="#511826" />
        <stop offset="0.58" stopColor="#6c2232" />
        <stop offset="1" stopColor="#1f070d" />
      </linearGradient>
      <linearGradient id="hi-art-velvet-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0a0306" stopOpacity="0.55" />
        <stop offset="0.22" stopColor="#0a0306" stopOpacity="0.05" />
        <stop offset="0.7" stopColor="#0a0306" stopOpacity="0.12" />
        <stop offset="1" stopColor="#0a0306" stopOpacity="0.55" />
      </linearGradient>
      <linearGradient id="hi-art-frame" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6a6045" />
        <stop offset="0.4" stopColor="#3b3a2c" />
        <stop offset="0.7" stopColor="#5a523b" />
        <stop offset="1" stopColor="#1f241e" />
      </linearGradient>
      <radialGradient id="hi-art-portrait" cx="50%" cy="38%" r="70%">
        <stop offset="0" stopColor="#2a322b" />
        <stop offset="1" stopColor="#0f1715" />
      </radialGradient>
      <linearGradient id="hi-art-face" x1="0" y1="0" x2="1" y2="0.2">
        <stop offset="0" stopColor="#343c34" />
        <stop offset="0.6" stopColor="#29322b" />
        <stop offset="1" stopColor="#1a221f" />
      </linearGradient>
      <linearGradient id="hi-art-floor-shade" x1="0" y1={BACK.bottom} x2="0" y2="1080" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#040809" stopOpacity="0.55" />
        <stop offset="0.45" stopColor="#040809" stopOpacity="0.12" />
        <stop offset="1" stopColor="#040809" stopOpacity="0.3" />
      </linearGradient>
      <linearGradient id="hi-art-ceiling" x1="0" y1="0" x2="0" y2={BACK.top} gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#1f2926" />
        <stop offset="1" stopColor="#131a19" />
      </linearGradient>
      {/* The ribs follow the plaster's gradient a shade lighter: they read as relief, not as stripes. */}
      <linearGradient id="hi-art-rib" x1="0" y1="0" x2="0" y2={BACK.top} gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#232d2a" />
        <stop offset="1" stopColor="#161d1c" />
      </linearGradient>
      <linearGradient id="hi-art-arch-face" x1="0" y1={onBack(0, (ARCH_APEX + 26) / 100)[1]} x2="0" y2={BACK.bottom} gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#131a18" />
        <stop offset="1" stopColor="#151c1a" />
      </linearGradient>
      <pattern id="hi-art-damask" width="90.3" height="135.5" patternUnits="userSpaceOnUse"
        patternTransform={`translate(${BACK.left} ${BACK.top}) scale(${DAMASK_SCALE * BACK_SCALE_CM})`}>
        {[[45, 68], [0, 0], [90.3, 0], [0, 135.5], [90.3, 135.5]].map(([x, y]) =>
          <path key={`${x}-${y}`} d={DAMASK} transform={`translate(${x! - 41} ${y! - 63})`} fill="#9fb095" opacity="0.012" />)}
      </pattern>
      <clipPath id="hi-art-side-clip"><path d={SIDE_WALL + FLOOR_STRIP} /></clipPath>
      <clipPath id="hi-art-strip-clip"><path d={FLOOR_STRIP} /></clipPath>
      <clipPath id="hi-art-window-clip"><path d={WINDOW_OPENING} /></clipPath>
      <clipPath id="hi-art-lights-clip"><path d={LIGHTS_CLIP} /></clipPath>
      <clipPath id="hi-art-portrait-clip"><path d={PAINTING} /></clipPath>
      <clipPath id="hi-art-arch-clip"><path d={ARCH_FAR} /></clipPath>
    </defs>

    {!transparent && (
      <g>
        {/* An opaque ground under every plane, so backgroundColor never shows through anti-aliased seams. */}
        <path d="M0 0H1920V1080H0Z" fill="#111816" />
        {/* Back wall = content box: dark piers, one rail, and the archway's void. */}
        <path d={BACK_WALL} fill="url(#hi-art-back)" />
        <path d={BACK_WALL} fill="url(#hi-art-damask)" />
        {/* The side walls' datums turn onto the back wall, their contrast pressed down to keep it calm. */}
        <path d={PIER_WAINSCOT} fill="#0f1614" />
        {BACK_BANDS.map((band, i) => <path key={i} d={band.d} fill={band.fill} />)}
        <path d={BACK_RAIL_LINE} fill="none" stroke="#a09f82" strokeWidth="1.2" opacity="0.07" />
        <path d={BACK_CORNICE_LINE} fill="none" stroke="#050a09" strokeWidth="1.2" opacity="0.35" />

        <path d={ARCH_MOULDS[0]} fill="url(#hi-art-arch-face)" />
        <path d={ARCH_MOULDS[1]} fill="#101715" />
        <path d={ARCH_MOULDS[2]} fill="#141b19" />
        <path d={ARCH_MOULD_LINES} fill="none" stroke="#a09f82" strokeWidth="1.1" opacity="0.07" />
        <path d={ARCH_OPENING} fill="#0b1111" />
        <path d={REVEAL.jamb} fill="#0c1211" />
        <path d={REVEAL.soffit} fill="#0a100f" />
        <path d={REVEAL.floor} fill="#0e1413" />
        <path d={ARCH_FAR} fill="#070b0b" />
        <g clipPath="url(#hi-art-arch-clip)">
          {/* A lived-in corridor, static and dim: its brightest lights stay low or at its sides, off the title. */}
          <HauntedCorridor candle={candle} moonlight={moonlight} atmosphere={atmosphere}
            candleIntensity={candleIntensity} moonlightIntensity={moonlightIntensity} />
        </g>
        {/* The corridor's runner starts on the threshold, over the reveal's floor, in the same light and air. */}
        <CorridorThreshold candle={candle} atmosphere={atmosphere} candleIntensity={candleIntensity} />

        {/* Floor field: marble squares on the 1/Z grid, all joints on the vanishing lines. */}
        <path d={FLOOR_FIELD} fill={MARBLE.light} />
        <path d={FLOOR_TILES_DARK} fill={MARBLE.dark} />
        <path d={FLOOR_VEINS} fill="none" stroke="#6f7b70" strokeWidth="1" opacity="0.07" />
        <path d={FLOOR_JOINTS} fill="none" stroke="#070c0c" strokeWidth="1.4" opacity="0.6" />
      </g>
    )}

    {/* Under each wall's foot the strip runs on a few centimetres, so the seam never shows through. */}
    <path d={both(STRIP_UNDERLAY)} fill="#121917" />
    {/* Strips along the walls: kept over gameplay, the candelabras and the moonlight stand on them. */}
    {[false, true].map((right) => (
      <g key={String(right)} transform={right ? 'translate(1920 0) scale(-1 1)' : undefined} clipPath="url(#hi-art-strip-clip)">
        <path d={FLOOR_STRIP} fill="#121917" />
        <path d={STRIP_INLAY} fill="none" stroke="#8a7a52" strokeWidth="1.3" opacity="0.2" />
        <path d={STRIP_EDGE} fill="#070c0b" />
      </g>
    ))}
    {!transparent && <path d={FLOOR} fill="url(#hi-art-floor-shade)" />}
    {transparent && <path d={FLOOR_VISIBLE.transparent} fill="url(#hi-art-floor-shade)" />}
    {children}

    {/* Ceiling: flat ribs and a rose for the chandelier; over gameplay it is left open. */}
    {!transparent && (
      <g>
        <path d={CEILING} fill="url(#hi-art-ceiling)" />
        <path d={CEILING_RIBS} fill="url(#hi-art-rib)" />
        <path d={CEILING_RIB_SHADOWS} fill="none" stroke="#070c0c" strokeWidth="1.4" opacity="0.25" />
        <path d={CEILING_ROSE[0]} fill="#1f2925" />
        <path d={CEILING_ROSE[1]} fill="#252f29" stroke="#070c0c" strokeWidth="1" strokeOpacity="0.5" />
        <path d={ROSE_PETALS} fill="#29322b" />
        <path d={CEILING_ROSE[2]} fill="#2e2f25" />
      </g>
    )}

    {[0, 1].map((variant) => (
      <g key={variant} transform={variant ? 'translate(1920 0) scale(-1 1)' : undefined}>
        <SideWall variant={variant as 0 | 1} moonlight={moonlight} candle={candle} transparent={transparent}
          moonlightIntensity={moonlightIntensity} lancet={lancets?.[variant]} />
      </g>
    ))}

    {/* Over gameplay the hall is cut open: thin dark section edges finish every cut, outside the box. */}
    {transparent && (
      <path d={both(wallQuad(0, 2.5, 0, TOP) + wallQuad(0, WALL_REACH, TOP - 2.5, TOP) + floorQuad(-FIELD - 3, -FIELD, 0, WALL_REACH) + floorQuad(-HALF, -FIELD, 0, 1.5))}
        fill="#040807" />
    )}
  </g>
);
