/**
 * One-point perspective for HauntedInteriorLoop. The hall is modelled in metres and every plane
 * is drawn in its own elevation, then projected here, at module level: the SVG only receives
 * screen-space paths, and every receding edge (floor, ceiling, walls, rails, cornices, window
 * reveals, tiles, panels) meets the same vanishing point. No React here, so the artwork, the
 * scene and the tests share one camera without a cycle.
 *
 * The camera is fitted to the stream layout: the back wall IS the content box, and the vanishing
 * point is its centre. Box and frame are concentric 16:9 rectangles, so the four corner seams run
 * from the box corners to the frame corners, and the hall splits into four clean bands: ceiling
 * above, floor below and one side wall on each side of the content.
 */
export type Point = readonly [number, number];

export const WIDTH = 1920;
export const HEIGHT = 1080;

/**
 * The 16:9 area (1100×620) a stream keeps for its webcam, game capture or title. It is the back
 * wall of the hall: nothing that moves enters it, and it only holds the dark archway.
 */
export const CONTENT_BOX = {left: 410, top: 230, right: 1510, bottom: 850} as const;
/** Where a title sits, inside the archway's void. */
export const TITLE_ZONE = {left: 610, top: 400, right: 1310, bottom: 650} as const;

/** Vanishing point: the centre of the content box, so the horizon sits at the camera's eye. */
export const VP = {
  x: (CONTENT_BOX.left + CONTENT_BOX.right) / 2,
  y: (CONTENT_BOX.top + CONTENT_BOX.bottom) / 2,
} as const;
/** Focal length, in px (a horizontal field of view of about 82°). */
export const FOCAL = 1100;

const HALF_WIDTH = 4.4;
const HALL_HEIGHT = (2 * HALF_WIDTH * (CONTENT_BOX.bottom - CONTENT_BOX.top)) / (CONTENT_BOX.right - CONTENT_BOX.left);
/**
 * The hall, in metres: 8.8 m wide and 4.96 m high, with the proportions of the content box, seen
 * from half its height, so the back wall lands on the box and is centred on the vanishing point.
 */
export const HALL = {halfWidth: HALF_WIDTH, height: HALL_HEIGHT, eye: HALL_HEIGHT / 2} as const;
/** Depth of the back wall: where the hall's width spans the content box exactly. */
export const BACK_Z = (FOCAL * HALL.halfWidth) / (VP.x - CONTENT_BOX.left);
/** Depth where the side walls leave the frame; the planes are drawn a little nearer still. */
export const FRAME_Z = (FOCAL * HALL.halfWidth) / VP.x;
export const NEAR_Z = 4.4;
/** The back wall's scale, in px per metre: it is parallel to the picture, so it is drawn flat. */
export const BACK_SCALE = FOCAL / BACK_Z;

/** x: metres right of the centre line; h: metres above the floor; z: depth from the camera. */
export const project = (x: number, h: number, z: number): Point => [
  VP.x + (FOCAL * x) / z,
  VP.y + (FOCAL * (HALL.eye - h)) / z,
];

/** Screen coordinates of a point of the back wall, x and h in metres. */
export const onBack = (x: number, h: number): Point => project(x, h, BACK_Z);

export const BACK = {
  left: onBack(-HALL.halfWidth, 0)[0],
  right: onBack(HALL.halfWidth, 0)[0],
  top: onBack(0, HALL.height)[1],
  bottom: onBack(0, 0)[1],
} as const;

/**
 * Elevation of the left wall, in centimetres: u runs from the back corner towards the camera and
 * v rises from the floor. `offset` moves the plane into the hall (positive) or into the wall
 * (negative, as the window glass). The right wall is the mirror image across x = 960.
 */
export const leftWall = (offset = 0) => (u: number, v: number): Point =>
  project(-HALL.halfWidth + offset / 100, v / 100, BACK_Z - u / 100);
/** Floor plan, in centimetres: x from the centre line, u from the back wall towards the camera. */
export const onFloor = (x: number, u: number): Point => project(x / 100, 0, BACK_Z - u / 100);
/** Ceiling plan, in centimetres, as the floor plan. */
export const onCeiling = (x: number, u: number): Point => project(x / 100, HALL.height, BACK_Z - u / 100);

export const mirror = ([x, y]: Point): Point => [WIDTH - x, y];

const fmt = (value: number) => (Math.round(value * 10) / 10).toString();
export const pathOf = (points: readonly Point[], close = true) =>
  points.map(([x, y], index) => `${index ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`).join('') + (close ? 'Z' : '');

type Subpath = {points: Point[]; closed: boolean};

/**
 * Flattens an SVG path (M, L, H, V, C, Q, Z and their relative forms) into polylines, so a
 * shape drawn in an elevation can be projected point by point: straight segments stay exact,
 * curves are sampled finely enough to stay smooth at 1920×1080.
 */
export const flattenPath = (d: string, steps = 14): Subpath[] => {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const subpaths: Subpath[] = [];
  let index = 0;
  let command = '';
  let cx = 0;
  let cy = 0;
  let current: Subpath | undefined;
  const read = () => Number(tokens[index++]);
  const push = (x: number, y: number) => {
    if (!current) throw new Error(`Path without an initial M: ${d}`);
    current.points.push([x, y]);
    cx = x;
    cy = y;
  };
  while (index < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[index]!)) command = tokens[index++]!;
    const relative = command === command.toLowerCase();
    const ox = relative ? cx : 0;
    const oy = relative ? cy : 0;
    switch (command.toUpperCase()) {
      case 'M': {
        const x = read() + ox;
        const y = read() + oy;
        current = {points: [[x, y]], closed: false};
        subpaths.push(current);
        cx = x;
        cy = y;
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L': {
        const x = read() + ox;
        push(x, read() + oy);
        break;
      }
      case 'H':
        push(read() + ox, cy);
        break;
      case 'V':
        push(cx, read() + oy);
        break;
      case 'C': {
        const [x0, y0] = [cx, cy];
        const [x1, y1, x2, y2, x3, y3] = [read() + ox, read() + oy, read() + ox, read() + oy, read() + ox, read() + oy];
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          const s = 1 - t;
          push(
            s * s * s * x0 + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t * x3,
            s * s * s * y0 + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t * y3,
          );
        }
        break;
      }
      case 'Q': {
        const [x0, y0] = [cx, cy];
        const [x1, y1, x2, y2] = [read() + ox, read() + oy, read() + ox, read() + oy];
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          const s = 1 - t;
          push(s * s * x0 + 2 * s * t * x1 + t * t * x2, s * s * y0 + 2 * s * t * y1 + t * t * y2);
        }
        break;
      }
      case 'Z':
        if (current) {
          current.closed = true;
          [cx, cy] = current.points[0]!;
        }
        break;
      default:
        throw new Error(`Unsupported path command: ${command}`);
    }
  }
  return subpaths;
};

/** Projects a path drawn in some plane's own coordinates through `map`. */
export const projectPath = (d: string, map: (x: number, y: number) => Point) =>
  flattenPath(d).map(({points, closed}) => pathOf(points.map(([x, y]) => map(x, y)), closed)).join('');

/** Points of a circular arc, angles in radians, counter-clockwise when a1 > a0 (y up). */
export const arcPoints = (cx: number, cy: number, r: number, a0: number, a1: number, n = 24): Point[] =>
  Array.from({length: n + 1}, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Point;
  });

export const ellipsePoints = (cx: number, cy: number, rx: number, ry: number, n = 64): Point[] =>
  Array.from({length: n}, (_, i) => [cx + rx * Math.cos((i / n) * Math.PI * 2), cy + ry * Math.sin((i / n) * Math.PI * 2)] as Point);

/**
 * A pointed arch in an elevation with y up: jambs from `bottom` to `spring`, then two arcs whose
 * centres sit on the spring line `c` from the middle (c = halfWidth gives an equilateral arch).
 * `grow` offsets the whole outline outwards, for mouldings that keep the same centres.
 */
export const pointedArch = (
  cx: number, halfWidth: number, bottom: number, spring: number, c: number, grow = 0,
): Point[] => {
  const r = halfWidth + c + grow;
  const apexAngle = Math.acos(c / r);
  const left = arcPoints(cx + c, spring, r, Math.PI, Math.PI - apexAngle, 28);
  const right = arcPoints(cx - c, spring, r, apexAngle, 0, 28);
  return [
    [cx - halfWidth - grow, bottom], ...left, ...right.slice(1), [cx + halfWidth + grow, bottom],
  ];
};

/** Height of a pointed arch's apex above its spring line. */
export const archRise = (halfWidth: number, c: number, grow = 0) =>
  Math.sqrt((halfWidth + c + grow) ** 2 - c * c);

/**
 * A four-centred (Tudor) arch, y up: a tight haunch arc of radius `r1` turns `turn` radians off
 * each jamb, then a wide arc of radius `r2`, tangent to it, rises to a pointed apex. It spans a
 * wide opening under a low apex, as a hall's great archway. `grow` offsets it as `pointedArch`.
 */
export type TudorSpec = {half: number; spring: number; r1: number; turn: number; r2: number};
export const tudorArch = (cx: number, bottom: number, spec: TudorSpec, grow = 0): Point[] => {
  const {half, spring, r1, turn, r2} = spec;
  const c1: Point = [cx - half + r1, spring];
  const tangent: Point = [c1[0] - r1 * Math.cos(turn), spring + r1 * Math.sin(turn)];
  const c2: Point = [tangent[0] + r2 * Math.cos(turn), tangent[1] - r2 * Math.sin(turn)];
  if (c2[0] <= cx) throw new Error('Tudor arch without a point: increase r2.');
  const apexAngle = Math.acos((cx - c2[0]) / (r2 + grow));
  const left: Point[] = [
    [cx - half - grow, bottom],
    ...arcPoints(c1[0], c1[1], r1 + grow, Math.PI, Math.PI - turn, 14),
    ...arcPoints(c2[0], c2[1], r2 + grow, Math.PI - turn, apexAngle, 24).slice(1),
  ];
  const right = left.slice(0, -1).reverse().map(([x, y]) => [2 * cx - x, y] as Point);
  return [...left, ...right];
};
/** Apex height of a Tudor arch (grown by `grow`). */
export const tudorApex = (spec: TudorSpec, grow = 0) => Math.max(...tudorArch(0, 0, spec, grow).map(([, y]) => y));

/** Convex hull (monotone chain) of screen points, for light shafts. */
export const convexHull = (points: readonly Point[]): Point[] => {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, point) <= 0) out.pop();
      out.push(point);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
};

/** Keeps the part of a polygon where the affine function `side` is not negative (one clip of Sutherland–Hodgman). */
export const clipPolygon = (polygon: readonly Point[], side: (point: Point) => number): Point[] => {
  const out: Point[] = [];
  polygon.forEach((point, i) => {
    const previous = polygon[(i + polygon.length - 1) % polygon.length]!;
    const [a, b] = [side(previous), side(point)];
    if ((a < 0) !== (b < 0)) {
      const t = a / (a - b);
      out.push([previous[0] + (point[0] - previous[0]) * t, previous[1] + (point[1] - previous[1]) * t]);
    }
    if (b >= 0) out.push(point);
  });
  return out;
};

/** The part of `polygon` inside the convex polygon `convex` (either winding). */
export const clipConvex = (polygon: readonly Point[], convex: readonly Point[]): Point[] => {
  const area = convex.reduce((sum, [x, y], i) => {
    const [nx, ny] = convex[(i + 1) % convex.length]!;
    return sum + x * ny - nx * y;
  }, 0);
  const winding = Math.sign(area);
  return convex.reduce<Point[]>((out, a, i) => {
    const b = convex[(i + 1) % convex.length]!;
    return out.length ? clipPolygon(out, (p) => winding * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))) : out;
  }, [...polygon]);
};

export const pointInPolygon = ([x, y]: Point, polygon: readonly Point[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export const insideContent = ([x, y]: Point, margin = 0) =>
  x > CONTENT_BOX.left - margin && x < CONTENT_BOX.right + margin && y > CONTENT_BOX.top - margin && y < CONTENT_BOX.bottom + margin;

/* ---------------------------------------------------------------------------------------------
 * Layout of the hall, in the elevations above. Everything a scene element hangs on is exported,
 * so the animated layers and the tests read the same numbers as the artwork.
 * ------------------------------------------------------------------------------------------- */

/** Where the side walls stop being drawn, in cm from the back corner (beyond the frame). */
export const WALL_REACH = Math.round((BACK_Z - NEAR_Z) * 100);
/** Datum lines, in cm above the floor: they run along the side walls and turn onto the back wall. */
export const DATUM = {
  base: 16, wainscot: 112, cap: 126, frieze: 452, cornice: 462, crown: 474, ceiling: HALL.height * 100,
} as const;

/** The great archway in the back wall (cm, back-wall elevation): its void holds TITLE_ZONE. */
export const ARCH: TudorSpec & {depth: number} = {half: 305, spring: 318, r1: 56, turn: 1.26, r2: 1000, depth: 70};

/**
 * The lancet window on each side wall (cm): centre, half width, sill, spring and arch centres, the
 * depth of its reveal and how far the stone ledge under the sill projects into the hall.
 */
export const WINDOW = {u: 126, half: 50, sill: 150, spring: 330, c: 44, reveal: 11, ledge: 8} as const;
/** The portrait, above the candelabra, where the wall is least foreshortened (cm), and its scale. */
export const PORTRAIT = {u: 292, v: 306, scale: 0.62} as const;
/** Where the portrait's eyes are painted, in the drawing's own px (y down). */
export const PORTRAIT_EYES = [[-13, -18], [15, -18]] as const;

/** Portrait drawing (px, y down) to the left wall, hung 6 cm in front of it. */
export const portraitMap = (x: number, y: number): Point =>
  leftWall(6)(PORTRAIT.u - x * PORTRAIT.scale, PORTRAIT.v - y * PORTRAIT.scale);

/** The eyes of both portraits, left then right, on screen. */
export const PORTRAIT_EYE_POINTS = (() => {
  const left = PORTRAIT_EYES.map(([x, y]) => portraitMap(x, y));
  const right = left.map(mirror).reverse();
  return [left, right] as const;
})();
/** Anchor of each pair of eyes: the midpoint between them. */
export const EYES_ANCHORS: readonly Point[] = PORTRAIT_EYE_POINTS.map(([a, b]) => [(a![0] + b![0]) / 2, (a![1] + b![1]) / 2]);

/** How much the wall's angle narrows the portrait: its width over its height, per unit. */
export const PORTRAIT_SQUASH = (() => {
  const [a, b] = PORTRAIT_EYE_POINTS[0];
  const across = (PORTRAIT_EYES[1][0] - PORTRAIT_EYES[0][0]) * PORTRAIT.scale;
  const perCm = FOCAL / (BACK_Z - PORTRAIT.u / 100) / 100;
  return Math.abs(b![0] - a![0]) / (across * perCm);
})();

/** The painted oval of the left portrait, on screen, for the tests and the eye glow clip. */
export const PORTRAIT_OVAL: readonly Point[] = ellipsePoints(0, 0, 60, 84).map(([x, y]) => portraitMap(x, y));

/** Floor border along each wall, in cm from the wall: the candelabra and the moonlight stand on it. */
export const FLOOR_BORDER = 88;

/** Floor candelabra at each lower corner, in front of the portrait: x and depth, in metres. */
export const CANDELABRA = {x: -3.99, z: 5.3} as const;
export const CANDELABRA_SCALE = FOCAL / CANDELABRA.z;
export const CANDELABRA_FOOT = project(CANDELABRA.x, 0, CANDELABRA.z);
/**
 * Candle tops (where each flame stands), in metres around the candelabra's shaft. The outer arms
 * reach 0.3 m, and their drip pans 9 cm more, so the whole piece stands clear of the wall.
 */
export const CANDLE_TOPS = [[-0.3, 1.68], [0, 1.86], [0.3, 1.68]] as const;
/** Half the drip pan's width, in metres: the widest reach of the candelabra is an outer pan's rim. */
export const CANDELABRA_PAN = 0.09;
export const CANDLE_ANCHORS: readonly Point[] = (() => {
  const left = CANDLE_TOPS.map(([dx, h]) => project(CANDELABRA.x + dx, h, CANDELABRA.z));
  return [...left, ...left.map(mirror).reverse()];
})();

/**
 * The chandelier hangs close to the camera, from a boss on the centre line, so it fits in the
 * ceiling band: a short drop and a modest ring, clear of the content box.
 */
export const CHANDELIER = {z: 5.5, ring: 4.47, radius: 0.62, hub: 4.72, finial: 4.3} as const;
export const CHANDELIER_PIVOT = project(0, HALL.height, CHANDELIER.z);
/** Candle height above the ring, in metres. */
export const CHANDELIER_CANDLE = {cup: 0.03, top: 0.25} as const;
/** The most the chandelier swings either way, in degrees, at chandelierSway = 1. */
export const CHANDELIER_MAX_SWING = 1.1;

/**
 * The chandelier in the hall's perspective: a ring of eight candles seen from below, its arms,
 * hub and crystal drops. Static geometry, computed once; the whole piece sways about the pivot.
 */
const ARM_COUNT = 8;
const chandelierPoint = (x: number, h: number, dz = 0) => project(x, h, CHANDELIER.z + dz);
const ringAt = (angle: number, radius: number, h: number) =>
  chandelierPoint(radius * Math.cos(angle), h, radius * Math.sin(angle));
const hubScale = FOCAL / CHANDELIER.z / 100;
const onHub = (x: number, h: number): Point => chandelierPoint(x / 100, h / 100);
const CANDLE_H = {cup: CHANDELIER.ring + CHANDELIER_CANDLE.cup, top: CHANDELIER.ring + CHANDELIER_CANDLE.top} as const;
/**
 * A crystal drop, in cm across and below its hook: a small prism hooked to the ring between two
 * arms, its hook hidden in the ring's stroke.
 */
const DROP_SHAPE = [[0, 0], [-1.3, 2.4], [0, 4.2], [1.3, 2.4]] as const;
const DROP = {radius: CHANDELIER.radius, h: CHANDELIER.ring - 0.012} as const;
/** Screen points of a small shape (cm, y up) drawn flat at a point of the chandelier. */
const flatAt = (at: Point, scale: number, shape: readonly (readonly [number, number])[], lift = 0): Point[] =>
  shape.map(([x, h]) => [at[0] + x * scale, at[1] + (lift - h) * scale]);
const ARMS = Array.from({length: ARM_COUNT}, (_, index) => {
  const angle = ((index + 0.5) / ARM_COUNT) * Math.PI * 2;
  const arm = Array.from({length: 13}, (_, step) => {
    const t = step / 12;
    const radius = 0.07 + (CHANDELIER.radius - 0.07) * t;
    return ringAt(angle, radius, CHANDELIER.ring - 0.13 * Math.sin(Math.PI * t) - 0.02 * (1 - t));
  });
  const base = ringAt(angle, CHANDELIER.radius, CANDLE_H.cup);
  const top = ringAt(angle, CHANDELIER.radius, CANDLE_H.top);
  const depth = CHANDELIER.z + CHANDELIER.radius * Math.sin(angle);
  const scale = FOCAL / depth / 100;
  const dropAngle = angle + Math.PI / ARM_COUNT;
  const dropScale = FOCAL / (CHANDELIER.z + DROP.radius * Math.sin(dropAngle)) / 100;
  const drop = flatAt(ringAt(dropAngle, DROP.radius, DROP.h), dropScale, DROP_SHAPE.map(([x, h]) => [x, -h] as const));
  return {
    front: Math.sin(angle) < 0,
    depth,
    arm,
    cup: flatAt(base, scale, [[-5, 0], [5, 0], [3.5, -3], [-3.5, -3]], 4),
    pan: flatAt(base, scale, [[-7, 3], [7, 3], [5, 5], [-5, 5]], 4),
    candle: flatAt(base, scale, [[-2.3, 0], [2.3, 0], [2.3, 22], [-2.3, 22]]),
    drop,
    top,
    size: scale / hubScale,
  };
}).sort((a, b) => b.depth - a.depth);
const ringHalf = (front: boolean) => Array.from({length: 33}, (_, i) => {
  const angle = (front ? Math.PI : 0) + (i / 32) * Math.PI;
  return ringAt(angle, CHANDELIER.radius, CHANDELIER.ring);
});
const HUB_TOP = CHANDELIER.hub * 100;
const HUB_BOTTOM = CHANDELIER.finial * 100;
/** The hub's profile, cm across and cm below its top, down to the finial. */
const HUB_PROFILE: readonly Point[] = [
  [3, 0], [5, 3], [11, 6], [12, 9], [6, 12], [4, 16], [9, 20], [17, 23], [19, 26], [10, 29], [5, 32], [6, 35], [2, 38],
];
const hubAt = ([x, d]: Point, side: number): Point => onHub(side * x, HUB_TOP - (d * (HUB_TOP - HUB_BOTTOM)) / 42);
const HUB_POINTS: Point[] = [
  ...HUB_PROFILE.map((point) => hubAt(point, 1)),
  onHub(0, HUB_BOTTOM),
  ...[...HUB_PROFILE].reverse().map((point) => hubAt(point, -1)),
];
export const CHANDELIER_PARTS = {
  arms: ARMS.map((arm) => ({
    front: arm.front,
    arm: pathOf(arm.arm, false),
    cup: pathOf(arm.cup),
    pan: pathOf(arm.pan),
    candle: pathOf(arm.candle),
    drop: pathOf(arm.drop),
    top: arm.top,
    size: arm.size,
  })),
  ring: {back: pathOf(ringHalf(false), false), front: pathOf(ringHalf(true), false)},
  hub: pathOf(HUB_POINTS),
  chainBottom: onHub(0, HUB_TOP)[1],
  /** Where the chandelier's warmth centres on the ceiling. */
  glow: onHub(0, CHANDELIER.ring * 100 + 20),
};
/** Half the widest stroke the chandelier is drawn with (its front ring), in px. */
const CHANDELIER_STROKE = 2.1;
/**
 * The chandelier's lowest point on screen: every point of the ring, arms, pans, cups, candles,
 * drops and hub, swung both ways to the widest sway, plus half its widest stroke.
 */
export const CHANDELIER_LOWEST_Y = (() => {
  const points = [
    ...ARMS.flatMap((arm) => [...arm.arm, ...arm.cup, ...arm.pan, ...arm.candle, ...arm.drop]),
    ...ringHalf(false), ...ringHalf(true), ...HUB_POINTS,
  ];
  const [px, py] = CHANDELIER_PIVOT;
  return CHANDELIER_STROKE + Math.max(...[-1, 1].flatMap((side) => {
    const angle = (side * CHANDELIER_MAX_SWING * Math.PI) / 180;
    return points.map(([x, y]) => py + (x - px) * Math.sin(angle) + (y - py) * Math.cos(angle));
  }));
})();

/**
 * The side of the hall the one moon stands on (0: left, 1: right), low and a little beyond the back
 * of the hall: only that wall's lancet sees it. The other one, on the facing wall, looks at the other
 * half of the sky and lets in only the diffuse light the moon spreads over it. It is the right one:
 * the corridor behind the archway takes its moonlight from the right too (the open door on its right
 * wall, whose light crosses to the left and towards the camera, and the stair hall lit from the right),
 * so the whole frame has one moon, with one heading.
 */
export const MOON_SIDE: 0 | 1 = 1;
/**
 * The default moonlightIntensity (the Studio's), at which the moon's lancet shows its moonlit glass in
 * full. Below it the moon dims, and at 0 there is none: that lancet's glass and its catch of moonlight
 * fall to the other one's, lit by the same night sky.
 */
export const MOONLIGHT_DEFAULT = 0.65;
/**
 * Moonlight, per metre of drop, in the left wall's frame, as every elevation here: `x` into the hall
 * and `z` in depth (negative: towards the camera). Its lancet is drawn in the left half and mirrored
 * when the moon is on the right (MOON_SIDE), so on screen the light then runs towards −x.
 * A low moon, about 43° above the horizon and 33° off the wall's normal towards the camera. The
 * lancet, 1.5 to 4.1 m above the floor, casts a footprint about 3.1 m long; its two lights lay
 * about 2.3 m of lit glass on the floor, from about 1.4 m out from the wall diagonally into the hall
 * and towards the camera, short of the centre line (the ledge keeps the lowest glass in shade), and
 * the roundel's small spot, apart beyond their tips, carries the light on to about 2.5 m. What
 * limits it is the lit glass, not the whole lancet: the tip of the arch above the roundel is stone
 * and casts only shadow, so its cast may run on past x ≈ 760 (in the left half; 1160 mirrored) and
 * off the frame unseen, while the lit panes, their soft halo included, keep inside both. A lower moon
 * would pass those limits with the roundel's light.
 */
export const MOON_DIRECTION = {x: 0.9, z: -0.59} as const;
/**
 * Half-angle, in radians, of the cone the light arrives in: the moon's disc (half a degree across)
 * widened by the waviness of old crown glass. Light that falls farther spreads farther, so the
 * penumbra grows along the pool: about 7 cm at the end nearest the wall, about 15 at the far end.
 */
export const MOON_SPREAD = 0.0095;
export type Direction = {readonly x: number; readonly z: number};
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/**
 * `count` directions spread evenly over the cone the light arrives in (a sunflower pattern). A turn
 * of the ray by an angle shifts where it lands, per metre of drop, by sqrt(1 + run²) times that angle
 * across the light's heading and by (1 + run²) along it, where run is the light's horizontal travel
 * per metre of drop.
 */
export const moonDirections = (count: number): Direction[] => {
  const {x, z} = MOON_DIRECTION;
  const run = Math.hypot(x, z);
  const [ax, az] = [x / run, z / run];
  return Array.from({length: count}, (_, k) => {
    const radius = MOON_SPREAD * Math.sqrt((k + 0.5) / count);
    const along = radius * Math.cos(k * GOLDEN_ANGLE) * (1 + run * run);
    const across = radius * Math.sin(k * GOLDEN_ANGLE) * Math.sqrt(1 + run * run);
    return {x: x + along * ax - across * az, z: z + along * az + across * ax};
  });
};
/** Window outline on the glass plane, in the left wall's elevation (cm). */
export const windowGlassOutline = () =>
  pointedArch(WINDOW.u, WINDOW.half, WINDOW.sill, WINDOW.spring, WINDOW.c);
/**
 * Where a point of the left wall's elevation (cm), on the plane `offset` cm in front of the wall
 * (negative: into it, as the glass), lands on the floor when cast along `direction`, in metres (x, z).
 */
export const castOnFloor = (u: number, v: number, offset = -WINDOW.reveal, direction: Direction = MOON_DIRECTION): [number, number] => {
  const drop = v / 100;
  return [-HALL.halfWidth + offset / 100 + direction.x * drop, BACK_Z - u / 100 + direction.z * drop];
};
/** Where a point of the glass (elevation, cm) lands on the floor, in metres (x, z). */
export const moonOnFloor = (u: number, v: number): [number, number] => castOnFloor(u, v);
/**
 * Upper middle of each window's glass, on screen, left then right: where its light comes in, the
 * moon's shaft through the lancet on the moon's side (MOON_SIDE) and the sky's diffuse light through
 * the other one.
 */
export const MOON_ANCHORS: readonly Point[] = (() => {
  const centre = leftWall(-WINDOW.reveal)(WINDOW.u, WINDOW.spring + 30);
  return [centre, mirror(centre)];
})();
/** Middle of each window's glass, on screen: where the lightning flashes. */
export const LIGHTNING_ANCHORS: readonly Point[] = (() => {
  const centre = leftWall(-WINDOW.reveal)(WINDOW.u, (WINDOW.sill + WINDOW.spring) / 2);
  return [centre, mirror(centre)];
})();

/**
 * The candle flame (HauntedInteriorLoop's Flame, and the overlay kit's interior candles), in its own
 * units: base at (0, 2), tip at (lean, −FLAME_TIP). The two cubics are the one source of the path
 * (flamePathOf) and of the kit's sampled bounds, so the drawing and the room it takes never drift.
 */
export const FLAME_TIP = 28;
export const flameSegments = (lean: number) => [
  [{x: 0, y: 2}, {x: -11, y: -5}, {x: -7, y: -14}, {x: lean, y: -FLAME_TIP}],
  [{x: lean, y: -FLAME_TIP}, {x: lean + 4, y: -16}, {x: 11, y: -5}, {x: 0, y: 2}],
] as const;
/**
 * The flame's path from flameSegments, `f` formatting the lean-dependent numbers (String: the
 * background's markup, byte for byte; the kit passes its 3-decimal formatter). The controls' y are
 * negative, so they join without a separator, as the background always wrote them.
 */
export const flamePathOf = (lean: number, f: (value: number) => string = String) => {
  const [[base, c1, c2, tip], [, c3, c4]] = flameSegments(lean);
  return `M${base.x} ${base.y} C${c1.x}${c1.y}${c2.x}${c2.y} ${f(tip.x)}${tip.y} C${f(c3.x)}${c3.y} ${c4.x}${c4.y} ${base.x} ${base.y}Z`;
};
/** The flame's bright core, inside the flame (never part of any bounds). */
export const flameCorePathOf = (lean: number, f: (value: number) => string = String) => `M0 0 Q-5-5 ${f(lean * 0.3)}-13 Q5-5 0 0Z`;
