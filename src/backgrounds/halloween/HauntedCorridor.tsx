import type {ReactNode} from 'react';
import {BACK_Z, ellipsePoints, flattenPath, pathOf, type Point, pointedArch, projectPath} from './hauntedInteriorGeometry';
import {
  ARMCHAIR, at, CANDELABRUM, CANDELABRUM_WICKS, CHEST, CLOCK, CONSOLE, CORRIDOR, corridorSection, type CorridorDoor,
  DOOR_FRAME, DOORS, END_DOOR, FIGURE, FIGURE_LIGHT, FLAME, FOOT_OUTLINE, FOOT_TOES, FOOTPRINTS, gloomAt, LIGHT_REFERENCE,
  lightScale, MIRROR, MOON_FLOOR, openLeaf, pxPerCm, RIBS, RUNNER, SCONCE_REACH, SCONCES, SHROUD, STAIR, transmittance, VASE,
  vaultCurve, WAINSCOT,
} from './hauntedCorridorGeometry';

/*
 * The corridor behind the great archway, computed once at module level in the corridor's own
 * centimetres (hauntedCorridorGeometry) and projected through the hall's camera. It is drawn back
 * to front: the stair hall beyond the end door and the figure in it, the end wall, vault, walls and
 * floor with everything fixed to them, then the free-standing props far to near; one pass of gloom
 * through a depth mask then sinks everything into the dark with its distance, and the candle flames
 * burn through it last. Its brightest lights (the candles, the moonlit door) sit low or at the
 * sides, off the middle of the title band. Nothing here depends on the frame: the corridor is part
 * of the static back wall, its lights take the composition's palette and dim with its intensities.
 */

const HALF = CORRIDOR.half;
const SPRING = CORRIDOR.spring;
const START = CORRIDOR.start;
const END = CORRIDOR.end;

/** A plane of the corridor, as a map from its own coordinates (cm) to the screen. */
type Map2 = (a: number, b: number) => Point;
type Pair = readonly [number, number];
type Project3 = (x: number, h: number, d: number) => Point;
/** A side wall, in (d, h); `offset` moves the plane into the corridor. */
const onWall = (side: -1 | 1, offset = 0): Map2 => (d, h) => at(side * (HALF - offset), h, d);
const onFloor: Map2 = (x, d) => at(x, 0, d);
/** A plane facing the camera at depth d, in (x, h) around (x0, h0). */
const faceOn = (d: number, x0 = 0, h0 = 0, project3: Project3 = at): Map2 => (x, y) => project3(x0 + x, h0 + y, d);
const poly = (map: Map2, points: readonly Pair[], close = true) => pathOf(points.map(([a, b]) => map(a, b)), close);
const quadOn = (map: Map2, a0: number, a1: number, b0: number, b1: number) =>
  poly(map, [[a0, b0], [a0, b1], [a1, b1], [a1, b0]]);
const onPath = (map: Map2, d: string) => projectPath(d, map);
const ellipseOn = (map: Map2, ca: number, cb: number, ra: number, rb: number, n = 48) =>
  poly(map, ellipsePoints(ca, cb, ra, rb, n));
const f1 = (value: number) => (Math.round(value * 10) / 10).toString();
const f3 = (value: number) => (Math.round(value * 1000) / 1000).toString();
/** Every point a path passes through, on screen (curves flattened). */
const pointsOf = (...paths: string[]): Point[] => paths.flatMap((d) => flattenPath(d).flatMap(({points}) => points));

type Box = {x0: number; x1: number; h0: number; h1: number; d0: number; d1: number};
/** The three faces of a box the camera sees: the one facing it, the one turned to the centre line, the top. */
const boxFaces = ({x0, x1, h0, h1, d0, d1}: Box, project3: Project3 = at) => {
  const inner = x1 <= 0 ? x1 : x0;
  return {
    front: pathOf([project3(x0, h0, d0), project3(x0, h1, d0), project3(x1, h1, d0), project3(x1, h0, d0)]),
    side: pathOf([project3(inner, h0, d0), project3(inner, h1, d0), project3(inner, h1, d1), project3(inner, h0, d1)]),
    top: pathOf([project3(x0, h1, d0), project3(x1, h1, d0), project3(x1, h1, d1), project3(x0, h1, d1)]),
  };
};

/** Every straight line drawn along the corridor, kept for the tests: each one runs to the vanishing point. */
const RECEDING: [Point, Point][] = [];
const recede = (a: Point, b: Point) => {
  RECEDING.push([a, b]);
  return pathOf([a, b], false);
};
export const CORRIDOR_LINES: readonly (readonly [Point, Point])[] = RECEDING;

/** A strand between two points of the corridor (cm), sagging by `sag`, sampled finely enough to stay smooth. */
type P3 = readonly [number, number, number];
const strand = (a: P3, b: P3, sag: number, n = 18) => pathOf(Array.from({length: n + 1}, (_, i) => {
  const t = i / n;
  return at(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t);
}), false);
/** A point of the vault's curve, t from the left springer (0) to the right one (1), at depth d. */
const VAULT_POINTS = vaultCurve();
const vaultAt = (t: number, d: number, inset = 0): P3 => {
  const points = inset ? vaultCurve(-inset) : VAULT_POINTS;
  const index = Math.min(points.length - 2, Math.floor(t * (points.length - 1)));
  const local = t * (points.length - 1) - index;
  const [ax, ah] = points[index]!;
  const [bx, bh] = points[index + 1]!;
  return [ax + (bx - ax) * local, ah + (bh - ah) * local, d];
};

/* ------------------------------------------------------------------------------ planes */

const sectionAt = (d: number, grow = 0) => pathOf(corridorSection(grow).map(([x, v]) => at(x, v, d)));
const END_WALL = sectionAt(END);
const VAULT = pathOf([
  ...VAULT_POINTS.map(([x, v]) => at(x, v, START)),
  ...[...VAULT_POINTS].reverse().map(([x, v]) => at(x, v, END)),
]);
const SIDES = [-1, 1] as const;
const WALL = SIDES.map((side) => quadOn(onWall(side), START, END, 0, SPRING));
const FLOOR = quadOn(onFloor, -HALF, HALF, START, END);

/** Where each wall is interrupted by a door's architrave (cm along the corridor). */
const doorSpans = (side: -1 | 1) => DOORS.filter((door) => door.side === side)
  .map((door) => [door.d0 - DOOR_FRAME.width - 6, door.d1 + DOOR_FRAME.width + 6] as const);
const clear = (side: -1 | 1, d0: number, d1: number) => doorSpans(side).every(([a, b]) => d1 < a || d0 > b);

/**
 * Skirting, wainscot panels and the dado rail at the hall's own datum heights (WAINSCOT), so its
 * rails run on through the archway; above, a papered field in faint stripes and a cornice under the vault.
 */
const WALL_DETAIL = SIDES.map((side) => {
  const wall = onWall(side);
  const panels: string[] = [];
  for (let d = START + 12; d + 50 < END; d += 58) {
    if (clear(side, d, d + 50)) panels.push(quadOn(wall, d + 5, d + 49, WAINSCOT.base + 12, WAINSCOT.top - 12));
  }
  const stripes = Array.from({length: 40}, (_, i) => START + 22 + i * 30).filter((d) => d < END && clear(side, d, d))
    .map((d) => pathOf([wall(d, WAINSCOT.rail + 2), wall(d, WAINSCOT.cornice - 2)], false)).join('');
  const line = (h: number, offset = 0) => recede(onWall(side, offset)(START, h), onWall(side, offset)(END, h));
  return {
    skirting: quadOn(wall, START, END, 0, WAINSCOT.base),
    wainscot: quadOn(wall, START, END, WAINSCOT.base, WAINSCOT.top),
    panels: panels.join(''),
    rail: quadOn(onWall(side, 2), START, END, WAINSCOT.top, WAINSCOT.rail),
    railLight: line(WAINSCOT.rail, 2) + line(WAINSCOT.base, 1),
    railShadow: line(WAINSCOT.top - 1),
    stripes,
    cornice: quadOn(onWall(side, 3), START, END, WAINSCOT.cornice, SPRING),
    corniceLine: line(WAINSCOT.cornice, 3) + line(WAINSCOT.cornice + 10, 3),
    foot: line(0),
  };
});

/* ---------------------------------------------------------------------------- vault */

/** Each rib: its face towards the camera, its soffit, and the corbel it springs from on each wall. */
const RIB_PARTS = RIBS.depths.map((d) => {
  const outer = corridorSection(0, RIBS.corbel);
  const inner = corridorSection(-RIBS.drop, RIBS.corbel);
  const face = pathOf([...outer.map(([x, v]) => at(x, v, d)), ...[...inner].reverse().map(([x, v]) => at(x, v, d))]);
  const soffit = inner.slice(0, -1).map((a, i) => {
    const b = inner[i + 1]!;
    return pathOf([at(a[0], a[1], d), at(b[0], b[1], d), at(b[0], b[1], d + RIBS.width), at(a[0], a[1], d + RIBS.width)]);
  }).join('');
  // A moulded stone corbel under each springer: a fillet, then an ogee dying into the wall.
  const reach = RIBS.drop + 4;
  const top = RIBS.corbel;
  const corbelOutline = `M0 ${top}H${reach}V${top - 4}H${reach - 3}Q${reach - 4} ${top - 11} ${reach / 2} ${top - 15}Q2 ${top - 19} 0 ${top - 26}Z`;
  const corbels = SIDES.map((side) => onPath((w, h) => at(side * (HALF - w), h, d - 2), corbelOutline));
  const corbelTops = SIDES.map((side) => pathOf([at(side * HALF, top - 4, d - 2), at(side * (HALF - reach), top - 4, d - 2)], false)).join('');
  const edge = pathOf(inner.map(([x, v]) => at(x, v, d)), false);
  // The lower haunch of the arris on the left, up to the end of its tight arc: the candle below catches it.
  const haunch = pathOf(inner.slice(0, 17).map(([x, v]) => at(x, v, d)), false);
  return {d, face, soffit, corbels: corbels.join(''), leftCorbel: corbels[0]!, corbelTops, edge, haunch};
});
/** Faces of the ribs, lighter near the archway, where the hall's light still reaches them. */
const RIB_FACES = ['#1a221e', '#1a221e', '#171e1b', '#161c19'] as const;
/** Faint cracks and damp in the vault's plaster. */
const VAULT_MARKS = [
  strand(vaultAt(0.3, 380), vaultAt(0.36, 470), 0) + strand(vaultAt(0.36, 470), vaultAt(0.33, 520), 0),
  strand(vaultAt(0.7, 600), vaultAt(0.64, 700), 0),
].join('');

/** A small radial web spun in a corner, from its hub to anchors on the planes around it (cm). */
const cornerWeb = (hub: P3, anchors: readonly P3[]) => {
  const [hx, hy] = at(...hub);
  const ends = anchors.map((anchor) => at(...anchor));
  const radial = ends.map((end) => pathOf([[hx, hy], end], false)).join('');
  const rings = [0.3, 0.55, 0.8].map((k) => ends.slice(1).map((end, i) => {
    const start = ends[i]!;
    const a = [hx + (start[0] - hx) * k, hy + (start[1] - hy) * k];
    const b = [hx + (end[0] - hx) * k, hy + (end[1] - hy) * k];
    const mid = [(a[0]! + b[0]!) / 2 + (hx - (a[0]! + b[0]!) / 2) * 0.22, (a[1]! + b[1]!) / 2 + (hy - (a[1]! + b[1]!) / 2) * 0.22];
    return `M${f1(a[0]!)} ${f1(a[1]!)}Q${f1(mid[0]!)} ${f1(mid[1]!)} ${f1(b[0]!)} ${f1(b[1]!)}`;
  }).join('')).join('');
  return radial + rings;
};
/**
 * Cobwebs, as in the hall: small radial webs spun in the angles of the near bays, between a rib (or
 * the archway's reveal) and the wall under the vault, and a couple of short threads hanging from the
 * first ribs. All in the corridor's space, so they share its perspective.
 */
const RIB0 = RIBS.depths[0];
const RIB1 = RIBS.depths[1];
const COBWEBS = [
  // Left, in the angle of the reveal's far face, the wall and the vault.
  cornerWeb([-HALF + 5, SPRING - 6, START + 8], [
    [-HALF, SPRING - 46, START + 2], [-HALF, SPRING - 14, START + 40], [-HALF + 14, SPRING + 30, START + 30], [-HALF + 40, SPRING + 44, START + 1],
  ]),
  // Left, behind the first rib, over its corbel.
  cornerWeb([-HALF + 4, RIBS.corbel + 12, RIB0 - 10], [
    [-HALF + RIBS.drop, RIBS.corbel - 6, RIB0 - 1], [-HALF, RIBS.corbel - 30, RIB0 - 26], [-HALF, SPRING + 8, RIB0 - 46], [-HALF + 24, SPRING + 38, RIB0 - 24], [-HALF + 26, SPRING + 30, RIB0 - 1],
  ]),
  // Right, in the angle beyond the first rib.
  cornerWeb([HALF - 5, RIBS.corbel + 16, RIB0 + RIBS.width + 10], [
    [HALF - 24, SPRING + 36, RIB0 + RIBS.width + 1], [HALF - RIBS.drop, RIBS.corbel - 4, RIB0 + RIBS.width + 1], [HALF, RIBS.corbel - 26, RIB0 + RIBS.width + 34], [HALF, SPRING + 10, RIB0 + RIBS.width + 50],
  ]),
].join('');
/** Two short threads hanging straight from the first two ribs, a kink where each has snapped. */
const THREADS = ([[0.17, RIB0, 24], [0.83, RIB1, 16]] as const).map(([t, d, length]) => {
  const [x, h] = vaultAt(t, d, RIBS.drop);
  return pathOf([at(x, h, d), at(x + 0.6, h - length * 0.7, d), at(x - 0.8, h - length, d + 0.5)], false);
}).join('');

/* ----------------------------------------------------------------------------- floor */

/** Floorboards along the corridor either side of the runner, with staggered butt joints. */
const BOARD = 18.5;
const BOARD_LINES = SIDES.flatMap((side) => Array.from({length: 12}, (_, k) => side * (RUNNER.half + 6 + k * BOARD))
  .filter((x) => Math.abs(x) < HALF - 4)
  .map((x) => recede(onFloor(x, START), onFloor(x, END)))).join('');
const BOARD_JOINTS = SIDES.flatMap((side) => Array.from({length: 11}, (_, k) => {
  const x0 = side * (RUNNER.half + 6 + k * BOARD);
  const x1 = side * (RUNNER.half + 6 + (k + 1) * BOARD);
  const joints: string[] = [];
  for (let d = START + ((k * 97 + (side > 0 ? 40 : 0)) % 230); d < END; d += 240) {
    joints.push(pathOf([onFloor(x0, d), onFloor(Math.sign(x1) * Math.min(Math.abs(x1), HALF), d)], false));
  }
  return joints;
})).join('');

/**
 * The runner: a faded red field, a dull gold border, lozenges down the middle, a worn and dusty pile.
 * It starts on the archway's threshold, and its near right corner is turned back on itself: the
 * fold runs from A to B, the corner C lands on C' and shows the pale hessian of its back.
 */
const FOLD = (() => {
  const a: Pair = [RUNNER.half - 38, RUNNER.d0];
  const b: Pair = [RUNNER.half, RUNNER.d0 + 38];
  const c: Pair = [RUNNER.half, RUNNER.d0];
  const [ux, ud] = [(b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]), (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1])];
  const along = (c[0] - a[0]) * ux + (c[1] - a[1]) * ud;
  const flipped: Pair = [2 * (a[0] + along * ux) - c[0], 2 * (a[1] + along * ud) - c[1]];
  return {a, b, c, flipped};
})();
const RUNNER_OUTLINE: Pair[] = [[-RUNNER.half, RUNNER.d0], FOLD.a, FOLD.b, [RUNNER.half, RUNNER.d1], [-RUNNER.half, RUNNER.d1]];
const RUNNER_FIELD = poly(onFloor, RUNNER_OUTLINE);
const RUNNER_FLAP = {
  back: poly((x, d) => at(x, 1.2, d), [FOLD.a, FOLD.b, FOLD.flipped]),
  crease: pathOf([onFloor(...FOLD.a), onFloor(...FOLD.b)], false),
  weave: Array.from({length: 5}, (_, i) => {
    const t = (i + 1) / 6;
    const from: Pair = [FOLD.a[0] + (FOLD.flipped[0] - FOLD.a[0]) * t, FOLD.a[1] + (FOLD.flipped[1] - FOLD.a[1]) * t];
    const to: Pair = [FOLD.b[0] + (FOLD.flipped[0] - FOLD.b[0]) * t, FOLD.b[1] + (FOLD.flipped[1] - FOLD.b[1]) * t];
    return pathOf([at(from[0], 1.3, from[1]), at(to[0], 1.3, to[1])], false);
  }).join(''),
  fringe: Array.from({length: 9}, (_, i) => FOLD.a[1] + 2 + i * 4)
    .map((d, i) => pathOf([at(FOLD.flipped[0], 1.2, d), at(FOLD.flipped[0] - 6 - (i % 2) * 1.5, 0.4, d + ((i % 3) - 1) * 0.8)], false)).join(''),
};
const RUNNER_BORDER = SIDES.map((side) => quadOn(onFloor, side * (RUNNER.half - RUNNER.border - 6), side * (RUNNER.half - RUNNER.border), RUNNER.d0 + 8, RUNNER.d1 - 8)).join('')
  + [RUNNER.d0 + 8, RUNNER.d1 - 14].map((d) => quadOn(onFloor, -(RUNNER.half - RUNNER.border), RUNNER.half - RUNNER.border, d, d + 6)).join('');
const RUNNER_EDGES = recede(onFloor(-RUNNER.half, RUNNER.d0), onFloor(-RUNNER.half, RUNNER.d1))
  + recede(onFloor(...FOLD.b), onFloor(RUNNER.half, RUNNER.d1));
const LOZENGES = Array.from({length: 11}, (_, i) => RUNNER.d0 + 70 + i * 96).filter((d) => d + 40 < RUNNER.d1)
  .map((d) => ({
    outer: poly(onFloor, [[0, d - 42], [30, d], [0, d + 42], [-30, d]]),
    inner: poly(onFloor, [[0, d - 22], [14, d], [0, d + 22], [-14, d]]),
  }));
const FRINGE = Array.from({length: 38}, (_, i) => -RUNNER.half + 2 + i * ((2 * RUNNER.half - 4) / 37)).filter((x) => x < FOLD.a[0] - 1)
  .map((x, i) => pathOf([onFloor(x, RUNNER.d0), onFloor(x + ((i % 3) - 1) * 0.8, RUNNER.d0 - 6 - (i % 2) * 1.5)], false)).join('');
/** Where the pile is worn thin, down the middle where people walked. */
const WEAR = [[-6, 300, 22, 70], [8, 520, 18, 90], [-4, 760, 16, 80]].map(([x, d, rx, rd]) => ellipseOn(onFloor, x!, d!, rx!, rd!, 32)).join('');
/**
 * Bare footprints pressed into the dust, toes towards the camera, each foot turned a little outwards:
 * someone has stepped onto the runner's far end out of the doorway and walked down it, up to the
 * archway's threshold. Each print is the sole, ball, arch and heel, with the toes as small pads ahead
 * of it, pressed into the dust (FOOT_OUTLINE and FOOT_TOES are a right foot).
 */
const FOOTPRINT_PATHS = FOOTPRINTS.map(([x, d]) => {
  const right = x > 0;
  const turn = (right ? -1 : 1) * 0.12;
  const mirrorX = right ? 1 : -1;
  const place = (points: readonly Pair[]) => pathOf(points.map(([px0, pd]) => {
    const px = px0 * mirrorX;
    return onFloor(x + px * Math.cos(turn) + pd * Math.sin(turn), d + pd * Math.cos(turn) - px * Math.sin(turn));
  }));
  return place(FOOT_OUTLINE) + FOOT_TOES.map(([px, pd, rx, rd]) => place(ellipsePoints(px, pd, rx, rd, 10))).join('');
}).join('');
/** The dust each foot pushed aside, heaped a little paler around its print. */
const FOOTPRINT_HALOS = FOOTPRINTS.map(([x, d]) => ellipseOn(onFloor, x, d - 1, 8.5, 19, 24)).join('');

/* ----------------------------------------------------------------------------- doors */

const doorParts = (door: CorridorDoor) => {
  const {side, d0, d1, height} = door;
  const frame = onWall(side, DOOR_FRAME.projection);
  const w = DOOR_FRAME.width;
  const reveal = HALF + DOOR_FRAME.reveal;
  return {
    architrave: quadOn(frame, d0 - w, d1 + w, 0, height + w),
    bead: poly(onWall(side, DOOR_FRAME.projection + 0.5), [[d0 - 4, 0], [d0 - 4, height + 4], [d1 + 4, height + 4], [d1 + 4, 0]], false),
    head: quadOn(onWall(side, DOOR_FRAME.projection + 5), d0 - w - 6, d1 + w + 6, height + w, height + w + DOOR_FRAME.head),
    headLight: pathOf([onWall(side, DOOR_FRAME.projection + 5)(d0 - w - 6, height + w + DOOR_FRAME.head), onWall(side, DOOR_FRAME.projection + 5)(d1 + w + 6, height + w + DOOR_FRAME.head)], false),
    /** The return of the architrave facing the camera: a sliver of moulding at its near edge. */
    nearEdge: pathOf([at(side * HALF, 0, d0 - w), at(side * HALF, height + w, d0 - w), at(side * (HALF - DOOR_FRAME.projection), height + w, d0 - w), at(side * (HALF - DOOR_FRAME.projection), 0, d0 - w)]),
    opening: quadOn(onWall(side), d0, d1, 0, height),
    /**
     * The far jamb's reveal, which faces the camera. The leaf is set back in the reveal, so the rest
     * of the opening shows only a sliver of it past the near jamb: the opening is filled in its colour.
     */
    jamb: pathOf([at(side * HALF, 0, d1), at(side * HALF, height, d1), at(side * reveal, height, d1), at(side * reveal, 0, d1)]),
  };
};
const DOOR_PARTS = DOORS.map(doorParts);

/**
 * The door standing open on the right: its leaf, hinged on the far jamb, swings out into the
 * corridor and catches the moonlight of the room beyond, which also spills across the floor.
 */
const OPEN = DOORS.find((door) => door.ajar > 0)!;
const LEAF = (() => {
  const {hinge, dir, width, height: H} = openLeaf(OPEN);
  const onLeaf: Map2 = (u, v) => at(hinge.x + dir.x * u, v, hinge.d + dir.d * u);
  // The leaf's back face, its thickness away from the camera: the normal to `dir` that points deeper.
  const back = {x: OPEN.side * dir.d * DOOR_FRAME.leaf, d: -OPEN.side * dir.x * DOOR_FRAME.leaf};
  const thick: Map2 = (u, v) => at(hinge.x + dir.x * u + back.x, v, hinge.d + dir.d * u + back.d);
  const panels = [[10, 47], [55, 92]].flatMap(([u0, u1]) => [[14, 76], [88, 150], [162, 212]].map(([v0, v1]) => ({
    face: quadOn(onLeaf, u0! + 3, u1! - 3, v0! + 3, v1! - 3),
    light: poly(onLeaf, [[u0!, v0!], [u0!, v1!], [u1!, v1!]], false),
    shade: poly(onLeaf, [[u1!, v1!], [u1!, v0!], [u0!, v0!]], false),
  })));
  const free: Point = at(hinge.x + dir.x * width, 0, hinge.d + dir.d * width);
  /** The leaf in four upright strips, each with its own depth, for the gloom. */
  const strips = [0, 1, 2, 3].map((k) => ({
    path: quadOn(onLeaf, (width * k) / 4, (width * (k + 1)) / 4, 1, H),
    depth: hinge.d + dir.d * (width * (k + 0.5)) / 4,
  }));
  return {
    face: quadOn(onLeaf, 0, width, 1, H),
    edge: pathOf([onLeaf(width, 1), onLeaf(width, H), thick(width, H), thick(width, 1)]),
    panels,
    knob: ellipseOn(onLeaf, width - 9, 98, 2.6, 2.6, 16),
    shadow: pathOf([onLeaf(0, 0), onLeaf(width, 0), thick(width + 6, 0), thick(4, 0)]),
    depth: hinge.d + dir.d * width,
    strips,
    free,
    hinge,
    dir,
    width,
  };
})();
/** Moonlight from the room: travels out of the door, across the corridor and a little towards the camera. */
const SPILL_DIR = {x: -OPEN.side, d: -0.3};
const SPILL = (() => {
  const reach = HALF - 40;
  // Light entering past the leaf's free edge falls on the floor; the rest lights the leaf.
  const lastD = LEAF.hinge.d + LEAF.dir.d * LEAF.width - SPILL_DIR.d * (HALF - Math.abs(LEAF.hinge.x + LEAF.dir.x * LEAF.width)) + 2;
  const threshold: Pair[] = [[OPEN.side * HALF, OPEN.d0 + 2], [OPEN.side * HALF, lastD]];
  const far = threshold.map(([x, d]) => [x + SPILL_DIR.x * reach, d + SPILL_DIR.d * reach] as const);
  return {
    pool: poly(onFloor, [threshold[0]!, threshold[1]!, far[1]!, far[0]!]),
    from: onFloor(OPEN.side * HALF, (OPEN.d0 + lastD) / 2),
    to: onFloor(OPEN.side * (HALF - reach), (OPEN.d0 + lastD) / 2 + SPILL_DIR.d * reach),
    /** The beam in the dusty air, from the doorway down to the pool. */
    beam: pathOf([
      at(OPEN.side * HALF, OPEN.height - 20, OPEN.d0 + 4), at(OPEN.side * HALF, 0, OPEN.d0 + 2),
      onFloor(far[0]![0], far[0]![1]), onFloor(far[1]![0], far[1]![1]), at(OPEN.side * HALF, 0, lastD), at(OPEN.side * HALF, OPEN.height - 30, lastD),
    ]),
    room: pathOf([at(OPEN.side * (HALF + DOOR_FRAME.reveal), 0, OPEN.d1), at(OPEN.side * (HALF + DOOR_FRAME.reveal), OPEN.height, OPEN.d1),
      at(OPEN.side * HALF, OPEN.height, OPEN.d0), at(OPEN.side * HALF, 0, OPEN.d0)]),
  };
})();

/* ------------------------------------------------------------------------ the lit corner */

const CONSOLE_TOP = {x0: CONSOLE.x0, x1: CONSOLE.x1 + 3, h0: CONSOLE.height - 4, h1: CONSOLE.height, d0: CONSOLE.d0 - 3, d1: CONSOLE.d1 + 3};
const CONSOLE_PARTS = (() => {
  const top = boxFaces(CONSOLE_TOP);
  const apron = boxFaces({x0: CONSOLE.x0, x1: CONSOLE.x1 - 2, h0: CONSOLE.height - 18, h1: CONSOLE.height - 4, d0: CONSOLE.d0 + 2, d1: CONSOLE.d1 - 2});
  const leg = (x: number, d: number) => {
    const s = 4.5;
    const taper = (h: number) => (h / (CONSOLE.height - 18)) * 1.2;
    const front = pathOf([at(x - s / 2 + 0.6, 0, d), at(x - s / 2 - taper(64) + 0.6, CONSOLE.height - 18, d), at(x + s / 2 + taper(64) - 0.6, CONSOLE.height - 18, d), at(x + s / 2 - 0.6, 0, d)]);
    const side = pathOf([at(x + s / 2 - 0.6, 0, d), at(x + s / 2 + taper(64) - 0.6, CONSOLE.height - 18, d), at(x + s / 2 + taper(64) - 0.6, CONSOLE.height - 18, d + s), at(x + s / 2 - 0.6, 0, d + s)]);
    return {front, side, d};
  };
  const inner = CONSOLE.x1 - 4.5;
  return {
    top,
    apron,
    legs: [leg(CONSOLE.x0 + 5, CONSOLE.d0 + CONSOLE.legs), leg(inner, CONSOLE.d1 - 7), leg(inner, CONSOLE.d0 + CONSOLE.legs)],
    drawer: pathOf([at(CONSOLE.x1 - 2, CONSOLE.height - 15, 132), at(CONSOLE.x1 - 2, CONSOLE.height - 7, 132), at(CONSOLE.x1 - 2, CONSOLE.height - 7, 196), at(CONSOLE.x1 - 2, CONSOLE.height - 15, 196)]),
    knob: at(CONSOLE.x1 - 1, CONSOLE.height - 11, 164),
    shadow: pathOf([at(CONSOLE.x0, 0, CONSOLE.d0 - 6), at(CONSOLE.x1 + 8, 0, CONSOLE.d0 - 2), at(CONSOLE.x1 + 10, 0, CONSOLE.d1 + 4), at(CONSOLE.x0, 0, CONSOLE.d1 + 8)]),
  };
})();

/** The candelabrum, face-on at its depth (cm around its foot on the table top, y up). */
const CANDELABRUM_MAP = faceOn(CANDELABRUM.d, CANDELABRUM.x, CONSOLE.height);
const CUPS = [-1, 0, 1].map((side) => [side * CANDELABRUM.arm, CANDELABRUM.stem - (side ? CANDELABRUM.outerDrop : 0)] as const);
const CANDELABRUM_PARTS = {
  foot: onPath(CANDELABRUM_MAP, 'M-6 0Q-6 2.5-3 3.2L-1.4 4.5V8Q-3 9-1.4 10V12H1.4V10Q3 9 1.4 8V4.5L3 3.2Q6 2.5 6 0Z'),
  stem: onPath(CANDELABRUM_MAP, `M-0.9 12V${CANDELABRUM.stem}H0.9V12Z`),
  arms: onPath(CANDELABRUM_MAP, `M0 ${CANDELABRUM.stem - 10}C-6 ${CANDELABRUM.stem - 12}-${CANDELABRUM.arm} ${CANDELABRUM.stem - 9}-${CANDELABRUM.arm} ${CUPS[0]![1]}M0 ${CANDELABRUM.stem - 10}C6 ${CANDELABRUM.stem - 12} ${CANDELABRUM.arm} ${CANDELABRUM.stem - 9} ${CANDELABRUM.arm} ${CUPS[2]![1]}`),
  cups: CUPS.map(([x, h]) => onPath(CANDELABRUM_MAP, `M${x - 2.6} ${h}Q${x} ${h - 1.6} ${x + 2.6} ${h}L${x + 1.4} ${h - 1.5}H${x - 1.4}Z`)).join(''),
  candles: CUPS.map(([x, h]) => onPath(CANDELABRUM_MAP, `M${x - 1} ${h}V${h + CANDELABRUM.candle - 0.4}Q${x} ${h + CANDELABRUM.candle + 0.3} ${x + 1} ${h + CANDELABRUM.candle - 0.4}V${h}Z`)).join(''),
  drips: CUPS.map(([x, h], i) => onPath(CANDELABRUM_MAP, `M${x + (i === 1 ? -1 : 1)} ${h + CANDELABRUM.candle - 1}Q${x + (i === 1 ? -1.6 : 1.6)} ${h + 6} ${x + (i === 1 ? -1.1 : 1.1)} ${h + 3}`)).join(''),
};
const WICKS = CANDELABRUM_WICKS.map(([x, h, d]) => at(x, h, d));
const FLAME_SCALE = pxPerCm(CANDELABRUM.d);

/** Dead roses in an urn: stems bowed over, heads hanging, petals fallen on the marble and the floor. */
const VASE_MAP = faceOn(VASE.d, VASE.x, CONSOLE.height);
const ROSES = {
  urn: onPath(VASE_MAP, 'M-3.5 0H3.5L3 1.6Q7.5 5 7 10Q6.5 14 3.4 16.5V19L5 21H-5L-3.4 19V16.5Q-6.5 14-7 10Q-7.5 5-3 1.6Z'),
  sheen: onPath(VASE_MAP, 'M4.5 5Q6 9 4.6 13'),
  stems: onPath(VASE_MAP, [
    'M-1 20Q-3 34-9 40Q-13 43-14 38', 'M0 20Q1 36 7 44Q11 47 13 42', 'M1 20Q3 30 11 33Q16 34 17 29',
    'M-2 20Q-6 30-14 31Q-18 31-19 27', 'M0.5 20Q0 40 2 50Q3 53 1 55',
  ].join('')),
  heads: [[-14.5, 36, 2.6, 3.4], [13.4, 40, 2.8, 3.6], [17.2, 27, 2.4, 3], [-19.2, 25, 2.2, 3], [0.6, 55.5, 3, 2.6]]
    .map(([x, y, rx, ry]) => poly(VASE_MAP, ellipsePoints(x!, y!, rx!, ry!, 14))).join(''),
  leaves: onPath(VASE_MAP, 'M-6 32Q-10 30-11 26Q-7 27-6 32ZM6 30Q10 29 12 25Q8 25 6 30ZM1 38Q5 38 7 35Q3 34 1 38Z'),
  petals: [[-270, 150, 2], [-276, 138, 1.6], [-266, 196, 1.8], [-280, 214, 1.4]].map(([x, d, r]) => poly(
    (a, b) => at(a, CONSOLE.height + 0.2, b), ellipsePoints(x!, d!, r! * 1.3, r!, 10))).join('')
    + [[-238, 132, 2], [-244, 206, 1.6]].map(([x, d, r]) => poly(onFloor, ellipsePoints(x!, d!, r! * 1.3, r!, 10))).join(''),
};
const MIRROR_PARTS = {
  frame: quadOn(onWall(-1, 2.5), MIRROR.d0, MIRROR.d1, MIRROR.h0, MIRROR.h1),
  glass: quadOn(onWall(-1, 2.2), MIRROR.d0 + 8, MIRROR.d1 - 8, MIRROR.h0 + 8, MIRROR.h1 - 8),
  edge: pathOf([at(-HALF + 2.5, MIRROR.h0, MIRROR.d0), at(-HALF + 2.5, MIRROR.h1, MIRROR.d0), at(-HALF, MIRROR.h1, MIRROR.d0), at(-HALF, MIRROR.h0, MIRROR.d0)]),
  crest: onPath(onWall(-1, 2.5), `M${MIRROR.d0 + 30} ${MIRROR.h1}Q${(MIRROR.d0 + MIRROR.d1) / 2} ${MIRROR.h1 + 14} ${MIRROR.d1 - 30} ${MIRROR.h1}Z`),
  sheen: onPath(onWall(-1, 2.2), `M${MIRROR.d0 + 20} ${MIRROR.h0 + 14}L${MIRROR.d0 + 60} ${MIRROR.h1 - 12}`),
};

/**
 * The longcase clock, against the left wall past the console: plinth, trunk, hood, cornice and a
 * finial, each a box. The candle lights the faces turned to it; the dial faces across the corridor.
 */
const CLOCK_W = CLOCK.x1 - CLOCK.x0;
const clockBox = (w: number, h0: number, h1: number, inset: number): Box =>
  ({x0: CLOCK.x0, x1: CLOCK.x0 + w, h0, h1, d0: CLOCK.d0 + inset, d1: CLOCK.d1 - inset});
const CLOCK_BOX_SPECS = [
  clockBox(CLOCK_W + CLOCK.plinth, 0, 6, -CLOCK.plinth),
  clockBox(CLOCK_W, 6, 38, 0),
  clockBox(CLOCK_W + 1, 38, 44, -1),
  clockBox(CLOCK_W - 5, 44, 146, 5),
  clockBox(CLOCK_W + 1, 146, 152, -1),
  clockBox(CLOCK_W, 152, 198, 0),
  clockBox(CLOCK_W + 3, 198, 205, -3),
  clockBox(CLOCK_W - 1, 205, CLOCK.height, 1),
];
const CLOCK_BOXES = CLOCK_BOX_SPECS.map((box) => boxFaces(box));
const CLOCK_FRONT = CLOCK.x0 + CLOCK_W;
const clockHoodWindow = (project3: Project3) => onPath(faceOn(CLOCK.d0, CLOCK.x0, 0, project3), `M6 158H${CLOCK_W - 6}V184Q${CLOCK_W / 2} 192 6 184Z`);
const CLOCK_PARTS = {
  boxes: CLOCK_BOXES,
  pediment: onPath(faceOn(CLOCK.d0 + 1, CLOCK.x0), `M0 ${CLOCK.height}Q${CLOCK_W / 2} ${CLOCK.height + 9} ${CLOCK_W - 1} ${CLOCK.height}Z`),
  finial: poly(faceOn(CLOCK.d0 + 6, CLOCK.x0 + CLOCK_W / 2), ellipsePoints(0, CLOCK.height + 12, 2.4, 3, 14))
    + onPath(faceOn(CLOCK.d0 + 6, CLOCK.x0 + CLOCK_W / 2), `M-1 ${CLOCK.height + 5}H1V${CLOCK.height + 10}H-1Z`),
  /** The hood's side window, face-on: it catches the candle. */
  hoodWindow: clockHoodWindow(at),
  trunkPanel: quadOn(faceOn(CLOCK.d0 + 5, CLOCK.x0), 5, CLOCK_W - 9, 58, 132),
  plinthPanel: quadOn(faceOn(CLOCK.d0, CLOCK.x0), 5, CLOCK_W - 5, 12, 32),
  dial: poly((d, h) => at(CLOCK_FRONT + 0.2, h, d), ellipsePoints((CLOCK.d0 + CLOCK.d1) / 2, CLOCK.dial, 15, 15, 32)),
  dialRing: poly((d, h) => at(CLOCK_FRONT + 0.3, h, d), ellipsePoints((CLOCK.d0 + CLOCK.d1) / 2, CLOCK.dial, 12, 12, 32)),
  trunkGlass: poly((d, h) => at(CLOCK_FRONT - 4.8, h, d), [[CLOCK.d0 + 13, 62], [CLOCK.d0 + 13, 128], [CLOCK.d1 - 13, 128], [CLOCK.d1 - 13, 62]]),
  bob: poly((d, h) => at(CLOCK_FRONT - 5.5, h, d), ellipsePoints((CLOCK.d0 + CLOCK.d1) / 2, 78, 6, 6, 16)),
  rod: pathOf([at(CLOCK_FRONT - 5.5, 126, (CLOCK.d0 + CLOCK.d1) / 2), at(CLOCK_FRONT - 5.5, 84, (CLOCK.d0 + CLOCK.d1) / 2)], false),
};

/* ------------------------------------------------------------------------ dust sheets */

/**
 * The armchair's profile (cm, x across and h up) as the sheet drapes it: the arm roll in front, then
 * the wing sweeping up to its ear, and the back against the wall. It is drawn at the near and far
 * wings, joined by the seat front, the seat and the cloth that sags between the two ears, which the
 * camera sees from above.
 */
const CHAIR_OUTLINE = (() => {
  const {x0, x1, arm, back} = ARMCHAIR;
  return `M${x0 - 3} 0C${x0 - 2} 22 ${x0 - 1} 44 ${x0} 56Q${x0 + 1} ${arm} ${x0 + 10} ${arm + 1}L${x0 + 34} ${arm}`
    + `Q${x0 + 42} ${arm} ${x0 + 44} ${arm + 8}C${x0 + 45} ${arm + 22} ${x0 + 47} ${back - 5} ${x0 + 57} ${back - 1}`
    + `Q${x0 + 63} ${back + 1} ${x0 + 69} ${back - 3}Q${x0 + 76} ${back - 8} ${x1 - 7} ${back - 7}`
    + `Q${x1} ${back - 7} ${x1} ${back - 13}L${x1 + 1} 60L${x1 + 2} 0Z`;
})();
const CHAIR_PROFILE: Pair[] = flattenPath(CHAIR_OUTLINE)[0]!.points;
const CHAIR = (() => {
  const near = ARMCHAIR.d0;
  const far = ARMCHAIR.d1;
  const mid = (near + far) / 2;
  const map = (d: number): Map2 => (x, h) => at(x, h, d);
  const front = ARMCHAIR.x0 + 1;
  const seat = {x0: ARMCHAIR.x0 + 10, x1: ARMCHAIR.x0 + 60, d0: near + 18, d1: far - 18};
  const folds = [0.2, 0.42, 0.63, 0.84].map((k) => {
    const d = near + (far - near) * k;
    return pathOf([at(front + 2, 62, d - 2), at(front + 1, 40, d + 1), at(front - 1, 18, d - 1), at(front - 2, 0, d + 2)], false);
  }).join('');
  // The cloth between the two ears: from one ear's tip down into a sag over the back cushion and up to the other.
  const sag = Array.from({length: 13}, (_, i) => {
    const t = i / 12;
    const dip = Math.sin(Math.PI * t) ** 0.8;
    return at(ARMCHAIR.x0 + 60 + dip * 14, ARMCHAIR.back - dip * 20, near + 4 + (far - near - 8) * t);
  });
  return {
    far: poly(map(far), CHAIR_PROFILE),
    front: pathOf([at(front - 3, 0, near), at(front + 3, 62, near), at(front + 3, 62, far), at(front - 3, 0, far)]),
    seat: pathOf([at(seat.x0, ARMCHAIR.seat + 4, seat.d0), at(seat.x1, ARMCHAIR.seat + 2, seat.d0), at(seat.x1, ARMCHAIR.seat + 2, seat.d1), at(seat.x0, ARMCHAIR.seat + 4, seat.d1)]),
    seatFront: pathOf([at(front + 3, 62, near + 16), at(seat.x0, ARMCHAIR.seat + 4, seat.d0), at(seat.x0, ARMCHAIR.seat + 4, seat.d1), at(front + 3, 62, far - 16)]),
    back: pathOf([at(ARMCHAIR.x0 + 62, ARMCHAIR.seat + 2, near + 12), ...sag, at(ARMCHAIR.x0 + 62, ARMCHAIR.seat + 2, far - 12)]),
    sagLine: pathOf(sag.slice(2, -2), false),
    armTop: pathOf([at(ARMCHAIR.x0 + 8, 66, near), at(ARMCHAIR.x0 + 40, ARMCHAIR.arm, near), at(ARMCHAIR.x0 + 40, ARMCHAIR.arm, near + 18), at(ARMCHAIR.x0 + 8, 66, near + 18)]),
    near: poly(map(near), CHAIR_PROFILE),
    folds,
    creases: onPath(map(near), `M${ARMCHAIR.x0 + 20} 66Q${ARMCHAIR.x0 + 26} 40 ${ARMCHAIR.x0 + 22} 2M${ARMCHAIR.x0 + 46} 74Q${ARMCHAIR.x0 + 50} 36 ${ARMCHAIR.x0 + 56} 2M${ARMCHAIR.x0 + 72} 96Q${ARMCHAIR.x0 + 76} 50 ${ARMCHAIR.x0 + 82} 2`),
    hem: onPath(map(near), `M${ARMCHAIR.x0 - 3} 0Q${ARMCHAIR.x0 + 12} 5 ${ARMCHAIR.x0 + 26} 1Q${ARMCHAIR.x0 + 44} 5 ${ARMCHAIR.x0 + 60} 1Q${ARMCHAIR.x0 + 80} 4 ${ARMCHAIR.x1 + 1} 0`),
    shadow: pathOf([at(ARMCHAIR.x0 - 10, 0, near - 4), at(ARMCHAIR.x1, 0, near - 6), at(ARMCHAIR.x1, 0, far + 10), at(ARMCHAIR.x0 - 16, 0, far + 8)]),
    /** Where the hem meets the boards: the darkest line of the shadow. */
    contact: pathOf([at(ARMCHAIR.x0 - 7, 0, near - 1), at(ARMCHAIR.x0 + 6, 0, near - 1), at(ARMCHAIR.x0 + 6, 0, far + 1), at(ARMCHAIR.x0 - 9, 0, far + 1)]),
    rim: pathOf(CHAIR_PROFILE.filter(([x, h]) => h > ARMCHAIR.arm + 6 && x < ARMCHAIR.x1 - 2).map(([x, h]) => at(x, h, far)), false),
    mid,
  };
})();

/**
 * A cheval mirror under a sheet: the cloth thrown over the square top of its frame falls in straight
 * folds from the corners, and stops short of the floor, so the stand shows under the hem (its two
 * uprights, the stretcher between them and the feet). Face-on at its near and far faces, joined
 * along its inner side.
 */
const SHROUD_HALF = (SHROUD.x1 - SHROUD.x0) / 2;
const SHROUD_PROFILE: Pair[] = (() => {
  const w = SHROUD_HALF;
  const h = SHROUD.height;
  return [
    [-w + 1, 20], [-w, 44], [-w + 0.5, 90], [-w + 1, 140], [-w + 1.5, h - 6], [-w + 3, h - 1], [-w + 14, h - 3], [0, h - 3.5],
    [w - 14, h - 3], [w - 3, h - 1], [w - 1.5, h - 6], [w - 1, 140], [w - 0.5, 90], [w, 44], [w - 1, 20],
    [w - 12, 28], [w - 26, 23], [-w + 30, 29], [-w + 14, 24],
  ];
})();
const SHROUD_X = (SHROUD.x0 + SHROUD.x1) / 2;
const SHROUD_PARTS = (() => {
  const near = faceOn(SHROUD.d0, SHROUD_X);
  const far = faceOn(SHROUD.d1, SHROUD_X);
  const right = SHROUD_PROFILE.slice(9, 15);
  const side = right.slice(0, -1).map(([x, h], i) => {
    const [nx, nh] = right[i + 1]!;
    return pathOf([near(x, h), near(nx, nh), far(nx, nh), far(x, h)]);
  }).join('');
  const mid = (SHROUD.d0 + SHROUD.d1) / 2;
  const post = SHROUD_HALF - 3;
  const [toe, instep] = [SHROUD.feet, SHROUD.feet - 4];
  const stand = [-post, post].map((x) => {
    const upright = pathOf([at(SHROUD_X + x - 1.6, 4, mid), at(SHROUD_X + x - 1.6, 32, mid), at(SHROUD_X + x + 1.6, 32, mid), at(SHROUD_X + x + 1.6, 4, mid)]);
    const foot = pathOf([at(SHROUD_X + x - 2, 0, SHROUD.d0 - toe), at(SHROUD_X + x - 2, 5, SHROUD.d0 - instep), at(SHROUD_X + x + 2, 5, SHROUD.d0 - instep),
      at(SHROUD_X + x + 2, 5, SHROUD.d1 + instep), at(SHROUD_X + x + 2, 0, SHROUD.d1 + toe), at(SHROUD_X + x + 2, 0, SHROUD.d0 - toe)]);
    return upright + foot;
  }).join('') + pathOf([at(SHROUD_X - post, 11, mid), at(SHROUD_X - post, 14, mid), at(SHROUD_X + post, 14, mid), at(SHROUD_X + post, 11, mid)]);
  const w = SHROUD_HALF;
  const top = SHROUD.height - 3;
  return {
    far: poly(far, SHROUD_PROFILE),
    side,
    near: poly(near, SHROUD_PROFILE),
    feet: stand,
    folds: onPath(near, `M${-w + 3} ${top}Q${-w + 10} 110 ${-w + 14} 25M${w - 3} ${top}Q${w - 8} 110 ${w - 12} 28M-10 ${top}Q-8 100-4 26M12 ${top}Q13 110 9 24`),
  };
})();
/** A chest under a sheet: soft top edges, the cloth hanging in folds and sagging between the corners. */
const CHEST_PARTS = (() => {
  const {x0, x1, d0, d1, height: h} = CHEST;
  const mid = (x0 + x1) / 2;
  const side: Map2 = (d, v) => at(x0 - 2, v, d);
  return {
    side: poly(side, [[d0 + 1, 0], [d0 + 1, h - 4], [d1 - 1, h - 4], [d1 - 1, 0], [(d0 + d1) / 2 + 24, 7], [(d0 + d1) / 2 - 12, 4]]),
    sideFolds: [0.3, 0.62].map((k) => pathOf([side(d0 + (d1 - d0) * k, h - 5), side(d0 + (d1 - d0) * k + 6, 22), side(d0 + (d1 - d0) * k + 2, 4)], false)).join(''),
    top: poly((x, d) => at(x, h, d), [[x0 + 1, d0 + 3], [x1 - 1, d0 + 3], [x1 - 1, d1 - 2], [x0 + 1, d1 - 2]]),
    front: onPath(faceOn(d0), `M${x0 - 4} 0C${x0 - 2} 20 ${x0 - 2} 40 ${x0 - 1} ${h - 5}Q${x0} ${h} ${x0 + 6} ${h}H${x1 - 3}Q${x1} ${h} ${x1} ${h - 4}V2Q${x1 - 16} 8 ${mid} 5Q${x0 + 14} 3 ${x0 - 4} 0Z`),
    folds: onPath(faceOn(d0 - 0.5), `M${x0 + 6} ${h - 1}Q${x0 + 14} 30 ${x0 + 9} 2M${x1 - 8} ${h - 2}Q${x1 - 14} 28 ${x1 - 22} 6M${mid} ${h}Q${mid + 4} 30 ${mid - 2} 5`),
  };
})();

/* ------------------------------------------------------------------------------ sconces */

/** An iron sconce in profile, face-on (w out of the wall, h up), its candle burnt to a stub. */
const SCONCE_PARTS = SCONCES.map(({side, d, h}) => {
  const map: Map2 = (w, v) => at(side * (HALF - w), h + v, d);
  const reach = SCONCE_REACH;
  return {
    d,
    side,
    plate: onPath(map, 'M0-26H1.6L2.2-22V-6L1.6 2V14H0Z'),
    arm: onPath(map, `M1.6-16C8-18 ${reach - 3}-14 ${reach - 3}-6C${reach - 3}-3 ${reach - 5}-1 ${reach - 5} 0`),
    pan: onPath(map, `M${reach - 11} 0H${reach}L${reach - 1} 1.6H${reach - 10}Z`),
    stub: onPath(map, `M${reach - 7.5} 1.6V7Q${reach - 5.5} 8 ${reach - 3.5} 7V1.6ZM${reach - 3.5} 5Q${reach - 2.6} 3 ${reach - 3} 0`),
    web: pathOf([map(reach - 1, 0.5), map(reach * 0.55, -9), map(0.4, -22)], false)
      + pathOf([map(reach - 6, 0), map(reach * 0.45, -12)], false),
  };
});

/* -------------------------------------------------------------------------- end of the corridor */

const END_OPENING = pointedArch(0, END_DOOR.half, 0, END_DOOR.spring, END_DOOR.c);
/** The far face of the end door's reveal: everything beyond it is seen only through this. */
const BEYOND_FACE = END + END_DOOR.reveal;
const END_PARTS = (() => {
  const near = END_OPENING.map(([x, h]) => at(x, h, END));
  const far = END_OPENING.map(([x, h]) => at(x, h, BEYOND_FACE));
  const reveal = near.slice(0, -1).map((a, i) => pathOf([a, near[i + 1]!, far[i + 1]!, far[i]!])).join('');
  const line = (h: number, x0: number, x1: number) => pathOf([at(x0, h, END), at(x1, h, END)], false);
  const band = (h0: number, h1: number) => SIDES.map((side) => {
    const [a, b] = side < 0 ? [-HALF, -END_DOOR.half - 12] : [END_DOOR.half + 12, HALF];
    return pathOf([at(a, h0, END), at(a, h1, END), at(b, h1, END), at(b, h0, END)]);
  }).join('');
  return {
    /** The door's moulded frame on the wall: a band between its outline, grown, and the opening. */
    frame: pathOf(pointedArch(0, END_DOOR.half, 0, END_DOOR.spring, END_DOOR.c, 12).map(([x, h]) => at(x, h, END))) + pathOf(near),
    frameLine: pathOf(pointedArch(0, END_DOOR.half, 0, END_DOOR.spring, END_DOOR.c, 6).map(([x, h]) => at(x, h, END)), false),
    opening: pathOf(near),
    reveal,
    /** The threshold of the reveal, stone, at the door's foot. */
    sill: pathOf([near[0]!, near[near.length - 1]!, far[far.length - 1]!, far[0]!]),
    beyond: pathOf(far),
    skirting: band(0, WAINSCOT.base),
    wainscot: band(WAINSCOT.base, WAINSCOT.top),
    rail: band(WAINSCOT.top, WAINSCOT.rail),
    cornice: pathOf([at(-HALF, WAINSCOT.cornice, END), at(-HALF, SPRING, END), at(HALF, SPRING, END), at(HALF, WAINSCOT.cornice, END)]),
    lines: SIDES.map((side) => line(WAINSCOT.rail, side * HALF, side * (END_DOOR.half + 12)) + line(WAINSCOT.base, side * HALF, side * (END_DOOR.half + 12))).join(''),
  };
})();

/**
 * The stair hall beyond the end door, drawn with any camera (`at`, or its image in the mirror):
 * its floor, the moonlight lying on it, and the stair, top step first so each nearer one covers
 * the one behind. The moon, high over the stair, lights the front of each of the first treads up
 * to the shadow of the riser above it, and the floor up to the shadow of the first nosing; risers
 * face away from it. The rounded nosing of each lit tread catches it hardest, a thin line that lets
 * those steps read from the archway. The steps above the lit ones are left to the dark.
 */
const MOON_DROP = 1.5;
const RISER_SHADOW = STAIR.rise / MOON_DROP;
const stairHall = (project3: Project3) => {
  const flat = (x0: number, x1: number, d0: number, d1: number, h: number) =>
    pathOf([project3(x0, h, d0), project3(x1, h, d0), project3(x1, h, d1), project3(x0, h, d1)]);
  const upright = (x0: number, x1: number, h0: number, h1: number, d: number) =>
    pathOf([project3(x0, h0, d), project3(x0, h1, d), project3(x1, h1, d), project3(x1, h0, d)]);
  const steps = Array.from({length: STAIR.steps}, (_, k) => {
    const i = STAIR.steps - 1 - k;
    const d0 = STAIR.foot + i * STAIR.going;
    const [h0, h1] = [i * STAIR.rise, (i + 1) * STAIR.rise];
    return {
      i,
      riser: upright(-STAIR.half, STAIR.half, h0, h1, d0),
      tread: flat(-STAIR.half, STAIR.half, d0, d0 + STAIR.going, h1),
      lit: i < STAIR.lit ? flat(MOON_FLOOR.x0, MOON_FLOOR.x1, d0, d0 + STAIR.going - RISER_SHADOW, h1 + 0.2) : '',
      nosing: i < STAIR.lit ? pathOf([project3(MOON_FLOOR.x0, h1, d0), project3(MOON_FLOOR.x1, h1, d0)], false) : '',
    };
  });
  const feet = (x: number) => project3(FIGURE.x + x, 0, FIGURE.d);
  return {
    floor: flat(-STAIR.half, STAIR.half, BEYOND_FACE, STAIR.foot, 0),
    pool: flat(MOON_FLOOR.x0, MOON_FLOOR.x1, MOON_FLOOR.d0, MOON_FLOOR.d1 - RISER_SHADOW, 0.1),
    /** Her shadow, cast towards the camera by the moon behind her, and the dark where her hem meets the floor. */
    shadow: pathOf([feet(-FIGURE.hem + 6), project3(FIGURE.x - 12, 0.2, FIGURE.d - FIGURE.height / MOON_DROP),
      project3(FIGURE.x + 10, 0.2, FIGURE.d - FIGURE.height / MOON_DROP), feet(FIGURE.hem - 6)]),
    contact: poly((x, d) => project3(x, 0.2, d), ellipsePoints(FIGURE.x, FIGURE.d + 2, FIGURE.hem + 4, 9, 24)),
    steps,
  };
};
const STAIR_HALL = stairHall(at);

/**
 * The figure at the foot of the stair: a woman in a pale nightgown, hair loose, head a little to one
 * side. Drawn face-on at her depth in cm (x across, y up); she fades out towards the hem.
 */
const FIGURE_TILT = -0.09;
const figureMap = (project3: Project3): Map2 => (x, y) => {
  const neck = 137;
  const [px, py] = y > neck - 2
    ? [x * Math.cos(FIGURE_TILT) - (y - neck) * Math.sin(FIGURE_TILT), neck + x * Math.sin(FIGURE_TILT) + (y - neck) * Math.cos(FIGURE_TILT)]
    : [x, y];
  return project3(FIGURE.x + px, py * (FIGURE.height / 164), FIGURE.d);
};
const figureParts = (project3: Project3) => {
  const map = figureMap(project3);
  return {
    body: onPath(map, [
      'M0.5 163C6 163 9 158 9 151C9 146 7.5 142 5.5 140L5 137C11 136 17 135 19 131C21 124 20 112 21 100C22 92 22 86 20 83',
      'C19 82 17 84 17 88C18 70 21 40 25 6C20 2 12 5 6 2C2 0-4 3-9 1C-15-1-20 3-25 5C-22 40-19 70-18 88C-18 84-20 82-21 83',
      'C-23 86-23 92-22 100C-21 112-21 124-19 131C-17 135-11 136-5 137L-5 140C-8 142-9 146-8.5 151C-8 158-5 163 0.5 163Z',
    ].join('')),
    hair: onPath(map, 'M0.5 164C7 164 10 159 10 151C10 142 11 130 13 117C9 119 7 124 6 128C6 136 7 142 5 146C3 151-3 151-5 147C-7 142-6 136-7 128C-8 122-10 118-13 115C-11 128-10 142-9.5 151C-9 159-5 164 0.5 164Z'),
    face: onPath(map, 'M-5 147C-3 151 3 151 5 146C6 142 4 138.5 0 138C-4 138.5-6 142-5 147Z'),
    eyes: [[-2.4, 145.6], [2.4, 145.6]].map(([x, y]) => poly(map, ellipsePoints(x!, y!, 1.3, 1, 10))).join(''),
    top: map(0, 164)[1],
    bottom: map(0, 0)[1],
  };
};
const FIGURE_PARTS = figureParts(at);

/**
 * The mirror over the console is old and dim, but it is a mirror: from the archway it shows the
 * corridor mirrored across the wall's plane. Through the nearer part of the glass that is the end
 * door, and her in it, beyond the reach of the doorway's jamb; the deeper part shows the near side
 * of the clock, which stands between the glass and the end wall on those rays (MIRROR_CLOCK_EDGE).
 */
const reflected: Project3 = (x, h, d) => at(-2 * HALF - x, h, d);
/**
 * Depth along the left wall (cm) where the glass starts to show the clock instead of the end wall:
 * the image of the clock's inner near corner, (CLOCK.x1, CLOCK.d0) mirrored across the wall.
 */
export const MIRROR_CLOCK_EDGE = ((BACK_Z * 100 + CLOCK.d0) * HALF) / (2 * HALF + CLOCK.x1) - BACK_Z * 100;
const MIRROR_VIEW = {
  wall: pathOf(corridorSection().map(([x, v]) => reflected(x, v, END))),
  rail: pathOf([reflected(-HALF, WAINSCOT.top, END), reflected(-HALF, WAINSCOT.rail, END), reflected(HALF, WAINSCOT.rail, END), reflected(HALF, WAINSCOT.top, END)]),
  frame: pathOf(pointedArch(0, END_DOOR.half, 0, END_DOOR.spring, END_DOOR.c, 12).map(([x, h]) => reflected(x, h, END))),
  door: pathOf(END_OPENING.map(([x, h]) => reflected(x, h, END))),
  beyond: pathOf(END_OPENING.map(([x, h]) => reflected(x, h, BEYOND_FACE))),
  hall: stairHall(reflected),
  figure: figureParts(reflected),
  /** The clock's near side and tops, as the glass shows them. */
  clock: CLOCK_BOX_SPECS.map((box) => boxFaces(box, reflected)),
  clockShape: CLOCK_BOX_SPECS.map((box) => boxFaces(box, reflected)).map((faces) => faces.front + faces.top).join(''),
  clockWindow: clockHoodWindow(reflected),
  /** Spots where the silvering has gone. */
  foxing: [[MIRROR.d0 + 22, MIRROR.h0 + 20, 5, 7], [MIRROR.d1 - 20, MIRROR.h1 - 22, 7, 5], [MIRROR.d0 + 60, MIRROR.h1 - 14, 4, 4]]
    .map(([d, h, rd, rh]) => ellipseOn(onWall(-1, 2.2), d!, h!, rd!, rh!, 16)).join(''),
};
/**
 * How much the glass darkens each thing it shows, over the gloom the corridor lays on the mirror
 * itself: the rest of the way there and back through the gloom, and the old silvering's loss.
 */
const SILVERING = 0.85;
const MIRROR_DEPTH = (MIRROR.d0 + MIRROR.d1) / 2;
const mirrorDim = (depth: number) => 1 - (SILVERING * transmittance(depth)) / transmittance(MIRROR_DEPTH);

/* ------------------------------------------------------------------------------ gloom */

/**
 * Depth fog, laid once through a mask. The part of the screen that lies beyond depth d is the
 * corridor's section at d, so sections painted near to far, each in the grey of its gloom, give
 * every plane its depth; the stair hall takes the gloom of its own depth through the end door, and
 * each free-standing prop then paints each of its parts in the grey of that part's own depth. A
 * single overlay of the gloom colour through this mask darkens everything by gloomAt in one
 * compositing step (stacked translucent slices would each lose a little to 8-bit rounding).
 */
const greyOf = (gloom: number) => {
  const value = Math.round(Math.min(1, Math.max(0, gloom)) * 255).toString(16).padStart(2, '0');
  return `#${value}${value}${value}`;
};
const GLOOM_STEP = 20;
const GLOOM_RINGS = Array.from({length: Math.round((END - START) / GLOOM_STEP) + 1}, (_, i) => START + i * GLOOM_STEP)
  .map((d) => ({d, path: sectionAt(d), grey: greyOf(gloomAt(d))}));
/** The stair hall, at the depth of the figure and the foot of the stair. */
const BEYOND_GLOOM = gloomAt(FIGURE.d);

/** Light as nested rings of a plane's ellipse, softened: the falloff keeps the plane's perspective. */
const glowRings = (map: Map2, ca: number, cb: number, ra: number, rb: number, rings = 5) =>
  Array.from({length: rings}, (_, i) => ellipseOn(map, ca, cb, ra * (1 - i / rings), rb * (1 - i / rings), 40));
const CANDLE_WALL = glowRings(onWall(-1), CANDELABRUM.d + 6, CONSOLE.height + 46, 120, 96);
const CANDLE_FLOOR = glowRings(onFloor, CANDELABRUM.x + 60, CANDELABRUM.d + 10, 150, 150);
/**
 * The candle's warmth on the vault's left haunch above it: a small soft patch, on screen, blurred
 * by `blur` px. It stays left of the middle half of the title band, blur and all.
 */
const VAULT_GLOW = {center: at(-250, 360, CANDELABRUM.d + 30), depth: CANDELABRUM.d + 30, rx: 52, ry: 24, blur: 7, opacity: 0.05} as const;
/** The hall's light, reaching a little way into the corridor along its floor. */
const HALL_SPILL = glowRings(onFloor, 20, START, 250, 190, 6);
/** How much of the hall's atmosphere colour veils the corridor and its threshold. */
const HALL_VEIL = 0.035;

/** Each free-standing prop, part by part, for the gloom mask: each part takes the gloom of its own depth. */
type MaskPart = {path: string; depth: number};
const PROP_MASKS: Record<string, MaskPart[]> = {
  shroud: [
    {path: SHROUD_PARTS.far, depth: SHROUD.d1},
    {path: SHROUD_PARTS.side + SHROUD_PARTS.feet, depth: (SHROUD.d0 + SHROUD.d1) / 2},
    {path: SHROUD_PARTS.near, depth: SHROUD.d0},
  ],
  chest: [
    {path: CHEST_PARTS.side + CHEST_PARTS.top, depth: (CHEST.d0 + CHEST.d1) / 2},
    {path: CHEST_PARTS.front, depth: CHEST.d0},
  ],
  leaf: LEAF.strips,
  clock: [
    {path: CLOCK_PARTS.boxes.map((box) => box.side + box.top).join(''), depth: (CLOCK.d0 + CLOCK.d1) / 2},
    {path: CLOCK_PARTS.boxes.map((box) => box.front).join('') + CLOCK_PARTS.pediment + CLOCK_PARTS.finial, depth: CLOCK.d0},
  ],
  armchair: [
    {path: CHAIR.far, depth: ARMCHAIR.d1},
    {path: CHAIR.back + CHAIR.seat + CHAIR.front + CHAIR.seatFront, depth: CHAIR.mid},
    {path: CHAIR.armTop + CHAIR.near, depth: ARMCHAIR.d0},
  ],
  console: [
    {path: CONSOLE_PARTS.legs.filter((leg) => leg.d > CONSOLE.d1 - 20).map((leg) => leg.front + leg.side).join(''), depth: CONSOLE.d1 - 7},
    {path: CONSOLE_PARTS.top.side + CONSOLE_PARTS.top.top + CONSOLE_PARTS.apron.side, depth: (CONSOLE.d0 + CONSOLE.d1) / 2},
    {path: CANDELABRUM_PARTS.foot + CANDELABRUM_PARTS.stem + CANDELABRUM_PARTS.cups + CANDELABRUM_PARTS.candles, depth: CANDELABRUM.d},
    {path: CONSOLE_PARTS.legs.filter((leg) => leg.d < CONSOLE.d1 - 20).map((leg) => leg.front + leg.side).join('') + CONSOLE_PARTS.top.front + CONSOLE_PARTS.apron.front, depth: CONSOLE.d0},
    {path: ROSES.urn, depth: VASE.d},
  ],
};

/** Webs spun on the furniture: between the clock's hood and the wall, and between the console's far leg and the wall. */
const CLOCK_WEB = cornerWeb([CLOCK.x0 + 1, CLOCK.height + 26, CLOCK.d1 - 4], [
  [CLOCK.x0, CLOCK.height + 60, CLOCK.d1 + 20], [CLOCK.x0, CLOCK.height + 40, CLOCK.d1 + 48], [CLOCK.x0 + 12, CLOCK.height + 4, CLOCK.d1 - 10],
  [CLOCK.x0 + 26, CLOCK.height + 2, CLOCK.d0 + 30],
]);
const CONSOLE_WEB = cornerWeb([CONSOLE.x0 + 1, 20, CONSOLE.d1 - 4], [
  [CONSOLE.x0, 56, CONSOLE.d1 - 30], [CONSOLE.x1 - 5, 50, CONSOLE.d1 - 6], [CONSOLE.x1 - 5, 8, CONSOLE.d1 - 6], [CONSOLE.x0 + 8, 0, CONSOLE.d1 - 20],
]);

/**
 * Everything drawn of each free-standing piece, but not its shadow on the boards. Its lowest point
 * on screen is where it stands: the tests check it lies on the floor line at the depth of its
 * nearest foot, and never below.
 */
const PROP_BODIES: Record<string, readonly string[]> = {
  console: [
    CONSOLE_WEB, ...CONSOLE_PARTS.legs.flatMap((leg) => [leg.front, leg.side]), ...Object.values(CONSOLE_PARTS.apron),
    CONSOLE_PARTS.drawer, pathOf([CONSOLE_PARTS.knob], false), ...Object.values(CONSOLE_PARTS.top),
    ...Object.values(CANDELABRUM_PARTS), ...Object.values(ROSES),
  ],
  clock: [
    CLOCK_WEB, ...CLOCK_PARTS.boxes.flatMap((box) => Object.values(box)), CLOCK_PARTS.pediment, CLOCK_PARTS.finial, CLOCK_PARTS.hoodWindow,
    CLOCK_PARTS.trunkPanel, CLOCK_PARTS.plinthPanel, CLOCK_PARTS.dial, CLOCK_PARTS.dialRing, CLOCK_PARTS.trunkGlass, CLOCK_PARTS.bob, CLOCK_PARTS.rod,
  ],
  armchair: [
    CHAIR.far, CHAIR.rim, CHAIR.back, CHAIR.sagLine, CHAIR.seat, CHAIR.front, CHAIR.seatFront, CHAIR.folds, CHAIR.armTop,
    CHAIR.near, CHAIR.creases, CHAIR.hem,
  ],
  shroud: [SHROUD_PARTS.feet, SHROUD_PARTS.far, SHROUD_PARTS.side, SHROUD_PARTS.near, SHROUD_PARTS.folds],
  chest: Object.values(CHEST_PARTS),
};
/** The lowest point on screen (px) of each free-standing piece as drawn. */
export const PROP_LOWEST: Readonly<Record<string, number>> = Object.fromEntries(Object.entries(PROP_BODIES)
  .map(([name, paths]) => [name, Math.max(...pointsOf(...paths).map(([, y]) => y))]));

/* -------------------------------------------------------------------------- the lights, for the tests */

/** A light of the corridor, where it shows on screen, how deep it is and its strongest opacity. */
export type CorridorLight = {name: string; kind: 'warm' | 'cold'; depth: number; peak: number; points: readonly Point[]};
const stacked = (...opacities: number[]) => 1 - opacities.reduce((rest, opacity) => rest * (1 - opacity), 1);
/** Strongest opacities of the corridor's lights, shared by the artwork and CORRIDOR_LIGHTS. */
const RIB_FILLET = {opacity: 0.3};
const CANDLE_WALL_OPACITY = 0.065;
const LEAF_LIGHT = {near: 0.17, far: 0.06, panels: 0.2};
const SPILL_LIGHT = [0.34, 0.14] as const;
const MOON_LIGHT = {room: 0.09, jamb: 0.11, beam: 0.025, rim: 0.12, pool: 0.3, treads: 0.2, nosing: 0.18};

export const CORRIDOR_LIGHTS: readonly CorridorLight[] = [
  ...CANDELABRUM_WICKS.map(([x, h, d], i) => ({
    name: `chama ${i + 1}`, kind: 'warm' as const, depth: d, peak: 1,
    points: [at(x, h, d), at(x, h + FLAME.halo, d), at(x - 9, h, d), at(x + 9, h, d)],
  })),
  {name: 'vela na parede', kind: 'warm', depth: CANDELABRUM.d, peak: stacked(...CANDLE_WALL.map(() => CANDLE_WALL_OPACITY)), points: pointsOf(CANDLE_WALL[0]!)},
  {name: 'filete da nervura', kind: 'warm', depth: RIBS.depths[0], peak: RIB_FILLET.opacity, points: pointsOf(RIB_PARTS[0]!.haunch, RIB_PARTS[0]!.leftCorbel)},
  {
    name: 'vela na abóbada', kind: 'warm', depth: VAULT_GLOW.depth, peak: VAULT_GLOW.opacity,
    // The ellipse grown by three standard deviations of its blur: where any of its light still lands.
    points: ellipsePoints(VAULT_GLOW.center[0], VAULT_GLOW.center[1], VAULT_GLOW.rx + 3 * VAULT_GLOW.blur, VAULT_GLOW.ry + 3 * VAULT_GLOW.blur, 48),
  },
  {name: 'janela do capitel do relógio', kind: 'warm', depth: CLOCK.d0, peak: 0.16, points: pointsOf(CLOCK_PARTS.hoodWindow)},
  {name: 'folha enluarada', kind: 'cold', depth: LEAF.depth, peak: stacked(LEAF_LIGHT.near, LEAF_LIGHT.panels), points: pointsOf(LEAF.face)},
  {name: 'ombreira enluarada', kind: 'cold', depth: OPEN.d1, peak: MOON_LIGHT.jamb, points: pointsOf(DOOR_PARTS[DOORS.indexOf(OPEN)]!.jamb)},
  {name: 'quarto enluarado', kind: 'cold', depth: OPEN.d0, peak: MOON_LIGHT.room, points: pointsOf(SPILL.room)},
  {name: 'luar no piso', kind: 'cold', depth: OPEN.d0, peak: SPILL_LIGHT[0], points: pointsOf(SPILL.pool)},
  {name: 'figura', kind: 'cold', depth: FIGURE.d, peak: stacked(FIGURE_LIGHT.body, FIGURE_LIGHT.aura, FIGURE_LIGHT.face), points: pointsOf(FIGURE_PARTS.body)},
  {name: 'luar além da porta', kind: 'cold', depth: MOON_FLOOR.d0, peak: MOON_LIGHT.pool, points: pointsOf(STAIR_HALL.pool)},
  {
    name: 'degraus enluarados', kind: 'cold', depth: STAIR.foot, peak: stacked(MOON_LIGHT.treads, MOON_LIGHT.nosing),
    points: pointsOf(...STAIR_HALL.steps.flatMap((step) => [step.lit, step.nosing]).filter(Boolean)),
  },
  {name: 'figura no espelho', kind: 'cold', depth: FIGURE.d, peak: stacked(FIGURE_LIGHT.body, FIGURE_LIGHT.face), points: pointsOf(MIRROR_PARTS.glass)},
];

/* ---------------------------------------------------------------------------- the runner */

/** The dust lying over the runner's pile. */
const DUST = '#57544a';

/**
 * The runner's layers, drawn twice: in the corridor (under its gloom) and on the archway's
 * threshold, where the reveal's floor carries its first metres into the hall. `id` keeps each
 * copy's definitions apart.
 */
const RunnerLayers = ({id}: {id: string}) => (
  <g>
    <defs>
      <linearGradient id={`${id}-wool`} x1="0" y1={at(0, 0, RUNNER.d0)[1]} x2="0" y2={at(0, 0, RUNNER.d1)[1]} gradientUnits="userSpaceOnUse">
        <stop stopColor="#2c1417" /><stop offset="1" stopColor="#1c0d10" />
      </linearGradient>
      <clipPath id={`${id}-field`}><path d={RUNNER_FIELD} /></clipPath>
      <filter id={`${id}-soft`} x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="3" /></filter>
      <filter id={`${id}-print`} x="-15%" y="-10%" width="130%" height="120%"><feGaussianBlur stdDeviation="1.2" /></filter>
    </defs>
    <g clipPath={`url(#${id}-field)`}>
      <path d={RUNNER_FIELD} fill={`url(#${id}-wool)`} />
      <path d={RUNNER_BORDER} fill="#2b2117" />
      {LOZENGES.map((lozenge, i) => <g key={i}>
        <path d={lozenge.outer} fill="#170a0c" />
        <path d={lozenge.inner} fill="#2b1f17" opacity="0.8" />
      </g>)}
      <path d={WEAR} fill="#2a2724" opacity="0.16" filter={`url(#${id}-soft)`} />
      {/*
        A pale grey film of dust over the pile, and the bare feet that pressed it flat: each print a
        shade darker and duller than the dust around it, never the red of the wool, in a faint rim
        of the dust it pushed aside.
      */}
      <path d={RUNNER_FIELD} fill={DUST} opacity="0.22" />
      <path d={FOOTPRINT_HALOS} fill={DUST} opacity="0.13" filter={`url(#${id}-print)`} />
      <path d={FOOTPRINT_PATHS} fill="#1c1b18" opacity="0.42" />
    </g>
    <path d={RUNNER_EDGES} fill="none" stroke="#060404" strokeWidth="1" opacity="0.6" />
    <path d={FRINGE} fill="none" stroke="#4a4232" strokeWidth="0.7" opacity="0.45" />
    <path d={RUNNER_FLAP.back} fill="#2a2620" />
    <path d={RUNNER_FLAP.weave} fill="none" stroke="#15120e" strokeWidth="0.7" opacity="0.5" />
    <path d={RUNNER_FLAP.fringe} fill="none" stroke="#4a4232" strokeWidth="0.7" opacity="0.45" />
    <path d={RUNNER_FLAP.crease} fill="none" stroke="#3b2a26" strokeWidth="1.1" opacity="0.7" />
  </g>
);
/**
 * The light on the floor at the corridor's mouth: the hall's light reaching in along the floor and
 * the candle's pool by the console, softened. It is drawn in the corridor and again on the
 * archway's threshold, from the same rings and the same blur, so it runs on unbroken across the
 * reveal's far face. `id` keeps each copy's filter apart; `warm` is the candles' lightScale.
 */
const FloorLight = ({id, candle, warm}: {id: string; candle: string; warm: number}) => (
  <g>
    <defs><filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" /></filter></defs>
    <g filter={`url(#${id}-glow)`}>
      {HALL_SPILL.map((ring, i) => <path key={`h${i}`} d={ring} fill={candle} opacity={f3(0.012 * warm)} />)}
      {CANDLE_FLOOR.map((ring, i) => <path key={`c${i}`} d={ring} fill={candle} opacity={f3(0.035 * warm)} />)}
    </g>
  </g>
);
/**
 * The hall's air hanging in the corridor, over `d`: a haze that thickens towards the end wall, and
 * a veil of the atmosphere's colour over all of it. Drawn over the corridor and over its threshold.
 */
const HallAir = ({id, atmosphere, d}: {id: string; atmosphere: string; d: string}) => {
  const [cx, cy] = at(0, 120, END);
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-haze`} cx={cx} cy={cy} r="260" gradientUnits="userSpaceOnUse"
          gradientTransform={`translate(${cx} ${cy}) scale(1.3 1) translate(${-cx} ${-cy})`}>
          <stop stopColor={atmosphere} stopOpacity="0.045" /><stop offset="1" stopColor={atmosphere} stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={d} fill={`url(#${id}-haze)`} />
      <path d={d} fill={atmosphere} opacity={HALL_VEIL} />
    </g>
  );
};

/** The floor of the archway's reveal, up to (and a hair past) the corridor's mouth, where the threshold copy is shown. */
const THRESHOLD = quadOn(onFloor, -HALF, HALF, 0, START + 1.5);
interface CorridorThresholdProps {
  candle: string;
  atmosphere: string;
  /** The composition's candleIntensity, fixed for the render. */
  candleIntensity?: number;
}
/**
 * The runner's first metres, on the threshold of the archway: drawn by the hall over the reveal's
 * floor, under the same light and air as the corridor beyond, so the runner reads as one piece.
 * The layers are first composited into one group (isolation plus a near-1 opacity force it into a
 * layer of its own), and the clip then trims that finished copy once. Clipping each layer on its own
 * would trim every one along the edge it shares with the corridor and leave a dark hairline there;
 * a full-frame mask would avoid that too, but it changes how the whole SVG is rasterised and so
 * dithers the hall's ceiling and floor by a level or two.
 */
export const CorridorThreshold = ({candle, atmosphere, candleIntensity = LIGHT_REFERENCE.candle}: CorridorThresholdProps) => (
  <g>
    <defs>
      <clipPath id="hi-cor-threshold"><path d={THRESHOLD} /></clipPath>
    </defs>
    <g clipPath="url(#hi-cor-threshold)">
      <g style={{isolation: 'isolate'}} opacity="0.999">
        <RunnerLayers id="hi-cor-thr" />
        <FloorLight id="hi-cor-thr-light" candle={candle}
          warm={lightScale(candleIntensity, LIGHT_REFERENCE.candle, candle, LIGHT_REFERENCE.candleColor)} />
        <HallAir id="hi-cor-thr-air" atmosphere={atmosphere} d={THRESHOLD} />
      </g>
    </g>
  </g>
);

/* -------------------------------------------------------------------------- component */

interface HauntedCorridorProps {
  candle: string;
  moonlight: string;
  atmosphere: string;
  /** The composition's candleIntensity and moonlightIntensity, fixed for the render. */
  candleIntensity?: number;
  moonlightIntensity?: number;
}

const FOG = '#040707';

export const HauntedCorridor = ({
  candle, moonlight, atmosphere,
  candleIntensity = LIGHT_REFERENCE.candle, moonlightIntensity = LIGHT_REFERENCE.moonlight,
}: HauntedCorridorProps) => {
  const warm = lightScale(candleIntensity, LIGHT_REFERENCE.candle, candle, LIGHT_REFERENCE.candleColor);
  const cold = lightScale(moonlightIntensity, LIGHT_REFERENCE.moonlight, moonlight, LIGHT_REFERENCE.moonlightColor);
  const w = (opacity: number) => f3(opacity * warm);
  const c = (opacity: number) => f3(opacity * cold);

  const flame = (wick: Point, i: number) => (
    <g key={i} transform={`translate(${f1(wick[0])} ${f1(wick[1])}) scale(${FLAME_SCALE.toFixed(3)})`}>
      <ellipse cy="-3" rx="9" ry="11" fill="url(#hi-cor-halo)" />
      <path d="M0 0.6C-1.3 0-1.4-1.8-0.5-3.6C-0.1-4.6 0.1-5.4 0-6.2C0.8-5 1.4-3.4 1.2-2C1.1-0.6 0.7 0.3 0 0.6Z" fill="url(#hi-cor-flame)" />
      <path d="M0 0.2C-0.5-0.2-0.5-1.2 0-2.2C0.4-1.2 0.4-0.3 0 0.2Z" fill="#FBEBC8" opacity="0.9" />
    </g>
  );

  /**
   * Free-standing props, drawn far to near. Each one also paints its parts (`mask`) into the gloom
   * mask in the grey of each part's own depth, so it is not fogged like the wall behind it.
   */
  const props: {d: number; mask: MaskPart[]; node: ReactNode}[] = [
    {
      d: SHROUD.d0, mask: PROP_MASKS.shroud!, node: (
        <g key="shroud">
          <path d={SHROUD_PARTS.feet} fill="#15100c" />
          <path d={SHROUD_PARTS.far} fill="#161b19" />
          <path d={SHROUD_PARTS.side} fill="#1c2220" stroke="#1c2220" strokeWidth="0.5" />
          <path d={SHROUD_PARTS.near} fill="url(#hi-cor-sheet-tall)" />
          <path d={SHROUD_PARTS.folds} fill="none" stroke="#0c100f" strokeWidth="1" opacity="0.6" />
        </g>
      ),
    },
    {
      d: CHEST.d0, mask: PROP_MASKS.chest!, node: (
        <g key="chest">
          <path d={CHEST_PARTS.side} fill="#171c1a" />
          <path d={CHEST_PARTS.sideFolds} fill="none" stroke="#0b0f0e" strokeWidth="0.8" opacity="0.6" />
          <path d={CHEST_PARTS.top} fill="#222927" />
          <path d={CHEST_PARTS.front} fill="#1c2220" />
          <path d={CHEST_PARTS.folds} fill="none" stroke="#0b0f0e" strokeWidth="0.9" opacity="0.55" />
        </g>
      ),
    },
    ...SCONCE_PARTS.map((sconce, i) => ({
      d: sconce.d, mask: [{path: sconce.plate + sconce.pan + sconce.stub, depth: sconce.d}], node: (
        <g key={`sconce-${i}`}>
          <path d={sconce.web} fill="none" stroke="#b3c2b3" strokeWidth="0.5" opacity="0.14" />
          <path d={sconce.plate} fill="#141816" />
          <path d={sconce.arm} fill="none" stroke="#161a18" strokeWidth={1.8 * pxPerCm(sconce.d)} strokeLinecap="round" />
          <path d={sconce.pan} fill="#1c211e" />
          <path d={sconce.stub} fill="#3a3a30" />
          <path d={sconce.arm} fill="none" stroke="#6f7563" strokeWidth="0.6" opacity="0.18" transform="translate(0 -0.8)" />
        </g>
      ),
    })),
    {
      d: LEAF.depth, mask: PROP_MASKS.leaf!, node: (
        <g key="leaf">
          <path d={LEAF.shadow} fill="#020404" opacity="0.5" />
          <path d={LEAF.face} fill="#17130f" />
          {LEAF.panels.map((panel, i) => <g key={i}>
            <path d={panel.face} fill="#1b1612" />
            <path d={panel.light} fill="none" stroke={moonlight} strokeWidth="0.8" opacity={c(LEAF_LIGHT.panels)} />
            <path d={panel.shade} fill="none" stroke="#050404" strokeWidth="0.9" opacity="0.6" />
          </g>)}
          <path d={LEAF.face} fill="url(#hi-cor-leaf-light)" />
          <path d={LEAF.edge} fill="#0b0907" />
          <path d={LEAF.knob} fill="#6a5a3a" />
        </g>
      ),
    },
    {
      d: CLOCK.d0 - 3, mask: PROP_MASKS.clock!, node: (
        <g key="clock">
          {/* A web in the angle between the hood and the wall. */}
          <path d={CLOCK_WEB} fill="none" stroke="#b3c2b3" strokeWidth="0.5" opacity="0.16" />
          {CLOCK_PARTS.boxes.map((box, i) => <path key={`s${i}`} d={box.side} fill="#130e0b" />)}
          <path d={CLOCK_PARTS.trunkGlass} fill="#0b0d0c" />
          <path d={CLOCK_PARTS.rod} stroke="#4a3f28" strokeWidth="0.7" />
          <path d={CLOCK_PARTS.bob} fill="#4e4228" />
          <path d={CLOCK_PARTS.dial} fill="#2c2a22" />
          <path d={CLOCK_PARTS.dialRing} fill="none" stroke="#0e0d0a" strokeWidth="0.6" />
          {CLOCK_PARTS.boxes.map((box, i) => <path key={`t${i}`} d={box.top} fill="#2a2019" />)}
          {CLOCK_PARTS.boxes.map((box, i) => <path key={`f${i}`} d={box.front} fill="url(#hi-cor-clock)" />)}
          <path d={CLOCK_PARTS.plinthPanel} fill="none" stroke="#0a0706" strokeWidth="0.9" opacity="0.7" />
          <path d={CLOCK_PARTS.trunkPanel} fill="none" stroke="#0a0706" strokeWidth="0.9" opacity="0.7" />
          <path d={CLOCK_PARTS.hoodWindow} fill="#0e0f0d" />
          <path d={CLOCK_PARTS.hoodWindow} fill={candle} opacity={w(0.16)} />
          <path d={CLOCK_PARTS.pediment} fill="#1f1712" />
          <path d={CLOCK_PARTS.finial} fill="#6a5838" />
        </g>
      ),
    },
    {
      d: ARMCHAIR.d0, mask: PROP_MASKS.armchair!, node: (
        <g key="armchair">
          <path d={CHAIR.shadow} fill="#020404" opacity="0.75" filter="url(#hi-cor-soft)" />
          <path d={CHAIR.far} fill="#181d1b" />
          <path d={CHAIR.rim} fill="none" stroke={moonlight} strokeWidth="1" opacity={c(MOON_LIGHT.rim)} />
          <path d={CHAIR.back} fill="#1d2320" />
          <path d={CHAIR.sagLine} fill="none" stroke="#0b0f0e" strokeWidth="1" opacity="0.6" />
          <path d={CHAIR.seat} fill="#222826" />
          <path d={CHAIR.front} fill="#1b201e" />
          <path d={CHAIR.seatFront} fill="#202624" />
          <path d={CHAIR.folds} fill="none" stroke="#0e1211" strokeWidth="1" opacity="0.5" />
          <path d={CHAIR.armTop} fill="#232927" />
          <path d={CHAIR.near} fill="url(#hi-cor-sheet)" />
          <path d={CHAIR.creases} fill="none" stroke="#0e1211" strokeWidth="1.2" opacity="0.45" />
          <path d={CHAIR.hem} fill="none" stroke="#0b0f0e" strokeWidth="1" opacity="0.6" />
          <path d={CHAIR.contact} fill="#010202" opacity="0.7" filter="url(#hi-cor-edge)" />
        </g>
      ),
    },
    {
      d: CONSOLE.d0 - 4, mask: PROP_MASKS.console!, node: (
        <g key="console">
          <path d={CONSOLE_PARTS.shadow} fill="#020303" opacity="0.6" filter="url(#hi-cor-soft)" />
          {/* A web between the far leg and the wall, catching the candle. */}
          <path d={CONSOLE_WEB} fill="none" stroke={candle} strokeWidth="0.5" opacity={w(0.12)} />
          {CONSOLE_PARTS.legs.map((leg, i) => <g key={i}>
            <path d={leg.side} fill="#140f0b" />
            <path d={leg.front} fill="#231a13" />
          </g>)}
          <path d={CONSOLE_PARTS.apron.side} fill="#1a130e" />
          <path d={CONSOLE_PARTS.apron.front} fill="#261c14" />
          <path d={CONSOLE_PARTS.drawer} fill="none" stroke="#0a0705" strokeWidth="0.8" />
          <circle cx={CONSOLE_PARTS.knob[0]} cy={CONSOLE_PARTS.knob[1]} r="1" fill={candle} opacity={w(0.5)} />
          <path d={CONSOLE_PARTS.top.side} fill="#2a2018" />
          <path d={CONSOLE_PARTS.top.top} fill="#2c241c" />
          <path d={CONSOLE_PARTS.top.top} fill="url(#hi-cor-table-light)" />
          <path d={CONSOLE_PARTS.top.front} fill="#35291d" />
          <path d={ROSES.petals} fill="#1a0a0c" />
          {/* The candelabrum stands behind the urn; its flames burn through the gloom, drawn last. */}
          <path d={CANDELABRUM_PARTS.foot} fill="#3b3222" />
          <path d={CANDELABRUM_PARTS.stem} fill="#3b3222" />
          <path d={CANDELABRUM_PARTS.arms} fill="none" stroke="#3b3222" strokeWidth={1.3 * FLAME_SCALE} strokeLinecap="round" />
          <path d={CANDELABRUM_PARTS.cups} fill="#4a3f2b" />
          <path d={CANDELABRUM_PARTS.candles} fill="url(#hi-cor-wax)" />
          <path d={CANDELABRUM_PARTS.drips} fill="none" stroke="#d8c9a4" strokeWidth={0.6 * FLAME_SCALE} opacity="0.5" />
          <path d={ROSES.urn} fill="#111512" />
          <path d={ROSES.sheen} fill="none" stroke={candle} strokeWidth="0.8" opacity={w(0.35)} />
          <path d={ROSES.stems} fill="none" stroke="#0d0f0b" strokeWidth={0.5 * pxPerCm(VASE.d)} strokeLinecap="round" />
          <path d={ROSES.leaves} fill="#0e110c" />
          <path d={ROSES.heads} fill="#190a0d" />
        </g>
      ),
    },
  ];
  const sorted = [...props].sort((a, b) => b.d - a.d);

  return (
    <g>
      <defs>
        <linearGradient id="hi-cor-flame" x2="0" y2="1">
          <stop stopColor={candle} /><stop offset="0.7" stopColor="#F6D69D" /><stop offset="1" stopColor="#E2A652" />
        </linearGradient>
        <radialGradient id="hi-cor-halo">
          <stop stopColor={candle} stopOpacity="0.5" /><stop offset="0.3" stopColor={candle} stopOpacity="0.16" /><stop offset="1" stopColor={candle} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hi-cor-wax">
          <stop stopColor="#6f624a" /><stop offset="0.5" stopColor="#c9b48a" /><stop offset="1" stopColor="#5a503e" />
        </linearGradient>
        <linearGradient id="hi-cor-vault" x1="0" y1={at(0, 420, START)[1]} x2="0" y2={at(0, SPRING, START)[1]} gradientUnits="userSpaceOnUse">
          <stop stopColor="#090e0d" /><stop offset="1" stopColor="#0d1311" />
        </linearGradient>
        <linearGradient id="hi-cor-floor" x1="0" y1={at(0, 0, START)[1]} x2="0" y2={at(0, 0, END)[1]} gradientUnits="userSpaceOnUse">
          <stop stopColor="#131210" /><stop offset="1" stopColor="#0c0c0a" />
        </linearGradient>
        <linearGradient id="hi-cor-sheet" x1="0" y1={at(0, ARMCHAIR.back, ARMCHAIR.d0)[1]} x2="0" y2={at(0, 0, ARMCHAIR.d0)[1]} gradientUnits="userSpaceOnUse">
          <stop stopColor="#252b29" /><stop offset="0.55" stopColor="#1e2422" /><stop offset="1" stopColor="#131816" />
        </linearGradient>
        <linearGradient id="hi-cor-sheet-tall" x1="0" y1={at(0, SHROUD.height, SHROUD.d0)[1]} x2="0" y2={at(0, 0, SHROUD.d0)[1]} gradientUnits="userSpaceOnUse">
          <stop stopColor="#242b28" /><stop offset="1" stopColor="#161b19" />
        </linearGradient>
        <radialGradient id="hi-cor-clock" cx={at(CLOCK.x0 + 10, 130, CLOCK.d0)[0]} cy={at(CLOCK.x0 + 10, 130, CLOCK.d0)[1]} r={90 * pxPerCm(CLOCK.d0)} gradientUnits="userSpaceOnUse">
          <stop stopColor="#3a2a1d" /><stop offset="0.5" stopColor="#261b13" /><stop offset="1" stopColor="#150f0b" />
        </radialGradient>
        <radialGradient id="hi-cor-table-light" cx={WICKS[1]![0]} cy={at(CANDELABRUM.x, CONSOLE.height, CANDELABRUM.d)[1]} r={70 * FLAME_SCALE} gradientUnits="userSpaceOnUse">
          <stop stopColor={candle} stopOpacity={w(0.4)} /><stop offset="1" stopColor={candle} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hi-cor-leaf-light" gradientUnits="userSpaceOnUse" x1={at(LEAF.hinge.x, 0, LEAF.hinge.d)[0]} y1="0" x2={LEAF.free[0]} y2="0">
          <stop stopColor={moonlight} stopOpacity={c(LEAF_LIGHT.near)} /><stop offset="1" stopColor={moonlight} stopOpacity={c(LEAF_LIGHT.far)} />
        </linearGradient>
        <linearGradient id="hi-cor-spill" gradientUnits="userSpaceOnUse" x1={SPILL.from[0]} y1={SPILL.from[1]} x2={SPILL.to[0]} y2={SPILL.to[1]}>
          <stop stopColor={moonlight} stopOpacity={c(SPILL_LIGHT[0])} /><stop offset="0.5" stopColor={moonlight} stopOpacity={c(SPILL_LIGHT[1])} /><stop offset="1" stopColor={moonlight} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hi-cor-figure" x1="0" y1={FIGURE_PARTS.top} x2="0" y2={FIGURE_PARTS.bottom} gradientUnits="userSpaceOnUse">
          <stop stopColor={moonlight} stopOpacity={c(FIGURE_LIGHT.body)} /><stop offset="0.45" stopColor={moonlight} stopOpacity={c(FIGURE_LIGHT.body * 0.66)} /><stop offset="1" stopColor={moonlight} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hi-cor-figure-mirror" x1="0" y1={MIRROR_VIEW.figure.top} x2="0" y2={MIRROR_VIEW.figure.bottom} gradientUnits="userSpaceOnUse">
          <stop stopColor={moonlight} stopOpacity={c(FIGURE_LIGHT.body)} /><stop offset="0.45" stopColor={moonlight} stopOpacity={c(FIGURE_LIGHT.body * 0.66)} /><stop offset="1" stopColor={moonlight} stopOpacity="0" />
        </linearGradient>
        {/* The moonlight beyond the end door comes from the right, past the jamb, and dies out to the left. */}
        <linearGradient id="hi-cor-moon-beyond" gradientUnits="userSpaceOnUse" x1={at(MOON_FLOOR.x1, 0, FIGURE.d)[0]} y1="0" x2={at(MOON_FLOOR.x0, 0, FIGURE.d)[0]} y2="0">
          <stop stopColor={moonlight} stopOpacity={c(MOON_LIGHT.pool)} /><stop offset="0.5" stopColor={moonlight} stopOpacity={c(MOON_LIGHT.pool * 0.7)} /><stop offset="1" stopColor={moonlight} stopOpacity="0" />
        </linearGradient>
        {/* The first rib's haunch, warmed from below by the candle: strongest at the corbel, gone by the crown. */}
        <linearGradient id="hi-cor-fillet" gradientUnits="userSpaceOnUse" x1={at(-HALF, RIBS.corbel, RIB0)[0]} y1="0" x2={at(-HALF + 120, RIBS.corbel, RIB0)[0]} y2="0">
          <stop stopColor={candle} stopOpacity={w(RIB_FILLET.opacity)} /><stop offset="1" stopColor={candle} stopOpacity="0" />
        </linearGradient>
        <filter id="hi-cor-soft" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="3" /></filter>
        <filter id="hi-cor-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" /></filter>
        <filter id="hi-cor-vault-glow" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation={VAULT_GLOW.blur} /></filter>
        <filter id="hi-cor-ghost" x="-30%" y="-20%" width="160%" height="140%"><feGaussianBlur stdDeviation="0.7" /></filter>
        <filter id="hi-cor-aura" x="-60%" y="-40%" width="220%" height="180%"><feGaussianBlur stdDeviation="4" /></filter>
        <filter id="hi-cor-edge" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="1.4" /></filter>
        <mask id="hi-cor-gloom" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
          {GLOOM_RINGS.map((ring) => <path key={ring.d} d={ring.path} fill={ring.grey} />)}
          <path d={END_PARTS.beyond} fill={greyOf(BEYOND_GLOOM)} />
          {sorted.flatMap((prop, i) => prop.mask.map((part, k) => <path key={`${i}-${k}`} d={part.path} fill={greyOf(gloomAt(part.depth))} />))}
        </mask>
        <clipPath id="hi-cor-beyond"><path d={END_PARTS.beyond} /></clipPath>
        <clipPath id="hi-cor-mirror-glass"><path d={MIRROR_PARTS.glass} /></clipPath>
        <clipPath id="hi-cor-mirror-beyond"><path d={MIRROR_VIEW.beyond} /></clipPath>
        <clipPath id="hi-cor-floor-clip"><path d={FLOOR} /></clipPath>
        <clipPath id="hi-cor-vault-clip"><path d={VAULT} /></clipPath>
        {SIDES.map((side, i) => <clipPath key={side} id={`hi-cor-wall-${i}`}><path d={WALL[i]} /></clipPath>)}
      </defs>

      {/* Beyond the end door: the stair hall's floor, moonlight on it and on the first treads, and her at the foot of the stair. */}
      <g clipPath="url(#hi-cor-beyond)">
        <path d={END_PARTS.beyond} fill="#020303" />
        <path d={STAIR_HALL.floor} fill="#070908" />
        <path d={STAIR_HALL.pool} fill="url(#hi-cor-moon-beyond)" filter="url(#hi-cor-edge)" />
        {STAIR_HALL.steps.map((step) => (
          <g key={step.i}>
            <path d={step.riser} fill="#040505" />
            <path d={step.tread} fill="#070909" />
            {step.lit && <path d={step.lit} fill="url(#hi-cor-moon-beyond)" opacity={f3(MOON_LIGHT.treads / MOON_LIGHT.pool)} />}
            {step.nosing && <path d={step.nosing} fill="none" stroke="url(#hi-cor-moon-beyond)" strokeWidth="1" opacity={f3(MOON_LIGHT.nosing / MOON_LIGHT.pool)} />}
          </g>
        ))}
        <path d={STAIR_HALL.shadow} fill="#010202" opacity="0.8" filter="url(#hi-cor-ghost)" />
        <path d={STAIR_HALL.contact} fill="#010202" opacity="0.75" filter="url(#hi-cor-edge)" />
        <g filter="url(#hi-cor-ghost)">
          <path d={FIGURE_PARTS.body} fill={moonlight} opacity={c(FIGURE_LIGHT.aura)} filter="url(#hi-cor-aura)" />
          <path d={FIGURE_PARTS.body} fill="url(#hi-cor-figure)" />
          <path d={FIGURE_PARTS.hair} fill="#030505" opacity="0.72" />
          <path d={FIGURE_PARTS.face} fill={moonlight} opacity={c(FIGURE_LIGHT.face)} />
          <path d={FIGURE_PARTS.eyes} fill="#020303" opacity="0.8" />
        </g>
      </g>

      {/* End wall: the bands of the side walls run across it, around the pointed doorway. */}
      <path d={END_WALL + END_PARTS.beyond} fill="#0c1110" fillRule="evenodd" />
      <path d={END_PARTS.skirting} fill="#080c0b" />
      <path d={END_PARTS.wainscot} fill="#0a0e0d" />
      <path d={END_PARTS.rail} fill="#121714" />
      <path d={END_PARTS.lines} fill="none" stroke="#6f7563" strokeWidth="0.8" opacity="0.14" />
      <path d={END_PARTS.cornice} fill="#101513" />
      <path d={END_PARTS.frame} fill="#111613" fillRule="evenodd" />
      <path d={END_PARTS.frameLine} fill="none" stroke="#0a0e0d" strokeWidth="1" />
      <path d={END_PARTS.reveal} fill="#0b100f" stroke="#0b100f" strokeWidth="0.4" />
      <path d={END_PARTS.sill} fill="#0d1110" />

      {/* The vault: plaster between transverse ribs, with a little damp and a crack. */}
      <path d={VAULT} fill="url(#hi-cor-vault)" />
      <path d={VAULT_MARKS} fill="none" stroke="#060a09" strokeWidth="1" opacity="0.5" />

      {/* The side walls, and everything fixed to them. */}
      {SIDES.map((side, i) => {
        const detail = WALL_DETAIL[i]!;
        return (
          <g key={side}>
            <path d={WALL[i]} fill="#0e1311" />
            <path d={detail.stripes} fill="none" stroke="#151b18" strokeWidth="1" opacity="0.7" />
            <path d={detail.wainscot} fill="#0b0f0d" />
            <path d={detail.panels} fill="#0e120f" stroke="#060908" strokeWidth="1" strokeOpacity="0.7" />
            <path d={detail.skirting} fill="#090d0c" />
            <path d={detail.rail} fill="#161c18" />
            <path d={detail.railLight} fill="none" stroke="#8a8a72" strokeWidth="0.8" opacity="0.2" />
            <path d={detail.railShadow} fill="none" stroke="#030505" strokeWidth="1" opacity="0.6" />
            <path d={detail.cornice} fill="#131915" />
            <path d={detail.corniceLine} fill="none" stroke="#050908" strokeWidth="0.9" opacity="0.6" />
            <path d={detail.foot} fill="none" stroke="#030505" strokeWidth="1.4" />
          </g>
        );
      })}

      {/* Candlelight on the left wall, behind the table, the urn and the clock. */}
      <g clipPath="url(#hi-cor-wall-0)" filter="url(#hi-cor-glow)">
        {CANDLE_WALL.map((ring, i) => <path key={i} d={ring} fill={candle} opacity={w(CANDLE_WALL_OPACITY)} />)}
      </g>
      <g clipPath="url(#hi-cor-vault-clip)">
        <ellipse cx={f1(VAULT_GLOW.center[0])} cy={f1(VAULT_GLOW.center[1])} rx={VAULT_GLOW.rx} ry={VAULT_GLOW.ry} fill={candle}
          opacity={w(VAULT_GLOW.opacity)} filter="url(#hi-cor-vault-glow)" />
      </g>

      {/* Doors in their architraves; the one on the right stands open onto moonlight. */}
      {DOOR_PARTS.map((door, i) => {
        const open = DOORS[i]!.ajar > 0;
        return (
          <g key={i}>
            <path d={door.architrave} fill="#171d19" />
            <path d={door.bead} fill="none" stroke="#070a09" strokeWidth="0.9" opacity="0.8" />
            <path d={door.nearEdge} fill="#222922" />
            <path d={door.head} fill="#1a201c" />
            <path d={door.headLight} fill="none" stroke="#6f7563" strokeWidth="0.8" opacity="0.2" />
            <path d={door.opening} fill={open ? '#0b100f' : '#0c0a08'} />
            {open && <path d={SPILL.room} fill={moonlight} opacity={c(MOON_LIGHT.room)} />}
            <path d={door.jamb} fill={open ? '#161c1a' : '#121714'} />
            {open && <path d={door.jamb} fill={moonlight} opacity={c(MOON_LIGHT.jamb)} />}
          </g>
        );
      })}

      {/* Floor: boards, then the runner with its dust and the bare footprints in it, from the threshold on. */}
      <path d={FLOOR} fill="url(#hi-cor-floor)" />
      <path d={BOARD_LINES} fill="none" stroke="#050505" strokeWidth="1" opacity="0.7" />
      <path d={BOARD_JOINTS} fill="none" stroke="#050505" strokeWidth="0.9" opacity="0.6" />
      <RunnerLayers id="hi-cor-run" />
      <g clipPath="url(#hi-cor-floor-clip)">
        <FloorLight id="hi-cor-floor-light" candle={candle} warm={warm} />
        <path d={SPILL.pool} fill="url(#hi-cor-spill)" filter="url(#hi-cor-edge)" />
      </g>
      <path d={SPILL.beam} fill={moonlight} opacity={c(MOON_LIGHT.beam)} filter="url(#hi-cor-glow)" />

      {/* Ribs and their corbels, near over far, with the cobwebs spun in their angles. */}
      {[...RIB_PARTS].reverse().map((rib) => (
        <g key={rib.d}>
          <path d={rib.soffit} fill="#0b100f" stroke="#0b100f" strokeWidth="0.3" />
          <path d={rib.face} fill={RIB_FACES[RIBS.depths.indexOf(rib.d)]} />
          <path d={rib.edge} fill="none" stroke="#7d8370" strokeWidth="0.8" opacity="0.22" />
          <path d={rib.corbels} fill="#1a211d" />
          <path d={rib.corbelTops} fill="none" stroke="#7d8370" strokeWidth="0.7" opacity="0.2" />
        </g>
      ))}
      <path d={RIB_PARTS[0]!.haunch} fill="none" stroke="url(#hi-cor-fillet)" strokeWidth="1.2" />
      <path d={RIB_PARTS[0]!.leftCorbel} fill="none" stroke={candle} strokeWidth="0.8" opacity={w(0.22)} />
      <path d={COBWEBS} fill="none" stroke="#b3c2b3" strokeWidth="0.5" opacity="0.15" />
      <path d={THREADS} fill="none" stroke="#b3c2b3" strokeWidth="0.6" opacity="0.16" />
      <path d={cornerWeb([-HALF + 1, 262, DOORS[1]!.d0 - 14], [
        [-HALF, 300, DOORS[1]!.d0 - 30], [-HALF, 290, DOORS[1]!.d0 + 30], [-HALF + 3, DOORS[1]!.height + 26, DOORS[1]!.d0 + 10], [-HALF + 3, 240, DOORS[1]!.d0 - 12],
      ])} fill="none" stroke="#b3c2b3" strokeWidth="0.5" opacity="0.14" />

      {/* The mirror over the console, taking a little of the candle. */}
      <path d={MIRROR_PARTS.edge} fill="#3a3120" />
      <path d={MIRROR_PARTS.frame} fill="#2b2518" />
      <path d={MIRROR_PARTS.crest} fill="#2b2518" />
      <path d={MIRROR_PARTS.glass} fill="#070b0b" />
      <g clipPath="url(#hi-cor-mirror-glass)">
        {/* In the glass: the end wall, the doorway and her, dimmed by the long way there; then the near side of the clock. */}
        <path d={MIRROR_VIEW.wall} fill="#0c1110" />
        <path d={MIRROR_VIEW.rail} fill="#121714" />
        <path d={MIRROR_VIEW.frame} fill="#111613" />
        <path d={MIRROR_VIEW.door} fill="#0b100f" />
        <g clipPath="url(#hi-cor-mirror-beyond)">
          <path d={MIRROR_VIEW.beyond} fill="#020303" />
          <path d={MIRROR_VIEW.hall.floor} fill="#070908" />
          <g filter="url(#hi-cor-ghost)">
            <path d={MIRROR_VIEW.figure.body} fill="url(#hi-cor-figure-mirror)" />
            <path d={MIRROR_VIEW.figure.hair} fill="#030505" opacity="0.72" />
            <path d={MIRROR_VIEW.figure.face} fill={moonlight} opacity={c(FIGURE_LIGHT.face)} />
          </g>
        </g>
        <path d={MIRROR_PARTS.glass} fill={FOG} opacity={f3(mirrorDim(FIGURE.d))} />
        {MIRROR_VIEW.clock.map((box, i) => <path key={`t${i}`} d={box.top} fill="#231a14" />)}
        {MIRROR_VIEW.clock.map((box, i) => <path key={`f${i}`} d={box.front} fill="#1a130e" />)}
        <path d={MIRROR_VIEW.clockWindow} fill="#0e0f0d" />
        <path d={MIRROR_VIEW.clockWindow} fill={candle} opacity={w(0.12)} />
        <path d={MIRROR_VIEW.clockShape} fill={FOG} opacity={f3(mirrorDim(CLOCK.d0))} />
        <path d={MIRROR_VIEW.foxing} fill="#1a1a14" opacity="0.5" filter="url(#hi-cor-edge)" />
        <path d={MIRROR_PARTS.glass} fill={candle} opacity={w(0.035)} />
        <path d={MIRROR_PARTS.sheen} fill="none" stroke={candle} strokeWidth="1.4" opacity={w(0.06)} />
      </g>

      {sorted.map((prop) => prop.node)}

      {/* Everything sinks into the dark with depth, in one pass. */}
      <path d={sectionAt(START)} fill={FOG} mask="url(#hi-cor-gloom)" />

      {/* The candle flames burn through it, dimmed only by the gloom of their own depth. */}
      <g opacity={f3(warm * transmittance(CANDELABRUM.d))}>{WICKS.map(flame)}</g>

      {/* A breath of the hall's atmosphere hangs down the corridor, and on over its threshold (CorridorThreshold). */}
      <HallAir id="hi-cor-air" atmosphere={atmosphere} d={sectionAt(START)} />
    </g>
  );
};
