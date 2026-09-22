import type {VaporwaveElement} from '../VaporwaveLoop';
import type {Point} from './frame';

type Vec = [number, number, number];
const GOLDEN = (1 + Math.sqrt(5)) / 2;

/** Octahedron, icosahedron and square pyramid, in units of the solid's `size`. */
export const SOLIDS: {vertices: Vec[]; faces: number[][]}[] = [
  {
    vertices: [[1, 0, 0], [-1, 0, 0], [0, 1.15, 0], [0, -1.15, 0], [0, 0, 1], [0, 0, -1]],
    faces: [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]],
  },
  {
    vertices: ([
      [-1, GOLDEN, 0], [1, GOLDEN, 0], [-1, -GOLDEN, 0], [1, -GOLDEN, 0], [0, -1, GOLDEN], [0, 1, GOLDEN],
      [0, -1, -GOLDEN], [0, 1, -GOLDEN], [GOLDEN, 0, -1], [GOLDEN, 0, 1], [-GOLDEN, 0, -1], [-GOLDEN, 0, 1],
    ] as Vec[]).map(([a, b, c]) => {
      const length = Math.hypot(a, b, c);
      return [a / length, b / length, c / length] as Vec;
    }),
    faces: [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ],
  },
  {
    vertices: [[0, 1.05, 0], [0.85, -0.55, 0.85], [-0.85, -0.55, 0.85], [-0.85, -0.55, -0.85], [0.85, -0.55, -0.85]],
    faces: [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [1, 4, 3, 2]],
  },
];

/** Farthest vertex of any solid from its centre, in units of `size`: its reach at any angle. */
export const SOLID_REACH = Math.max(...SOLIDS.flatMap(({vertices}) => vertices.map((vertex) => Math.hypot(...vertex))));
/** The soft glow behind a solid, in units of `size`. */
export const SOLID_GLOW = 1.72;
export const SOLID_EDGE = 2.6;

const LIGHT: Vec = (() => {
  const light: Vec = [-0.45, 0.65, 0.62];
  const length = Math.hypot(...light);
  return light.map((value) => value / length) as Vec;
})();

/**
 * Faces of a solid turned by the scene's spin (a unit vector, so a whole turn never jumps)
 * and tilt, projected onto the frame. `light` is the Lambert term of each face.
 */
export const getSolidFaces = (shape: Pick<VaporwaveElement, 'x' | 'y' | 'size' | 'spinCos' | 'spinSin' | 'tilt' | 'variant'>) => {
  const solid = SOLIDS[shape.variant % SOLIDS.length]!;
  const tiltCos = Math.cos(shape.tilt);
  const tiltSin = Math.sin(shape.tilt);
  const rotated = solid.vertices.map(([vx, vy, vz]): Vec => {
    const rx = vx * shape.spinCos + vz * shape.spinSin;
    const rz = -vx * shape.spinSin + vz * shape.spinCos;
    return [rx, vy * tiltCos - rz * tiltSin, vy * tiltSin + rz * tiltCos];
  });
  const centre = rotated.reduce<Vec>((sum, v) => [sum[0] + v[0], sum[1] + v[1], sum[2] + v[2]], [0, 0, 0])
    .map((value) => value / rotated.length) as Vec;
  return solid.faces.map((indices) => {
    const points = indices.map((index) => rotated[index]!);
    const [a, b, c] = points as [Vec, Vec, Vec];
    const u: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: Vec = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let normal: Vec = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const middle = points.reduce<Vec>((sum, p) => [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]], [0, 0, 0])
      .map((value) => value / points.length) as Vec;
    const outward = (middle[0] - centre[0]) * normal[0] + (middle[1] - centre[1]) * normal[1] + (middle[2] - centre[2]) * normal[2];
    const length = Math.hypot(...normal) * (outward < 0 ? -1 : 1);
    normal = normal.map((value) => value / length) as Vec;
    const projected = points.map(([px, py]): Point => [shape.x + px * shape.size, shape.y - py * shape.size]);
    const light = Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]);
    return {points: projected, front: normal[2] > 0, light};
  });
};

const facePath = (points: readonly Point[]) =>
  `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;

/**
 * A translucent solid: a dark backing so the sky does not show through as dirty glass,
 * Lambert-shaded faces, faint back edges and bold neon front edges over a soft glow.
 */
export const Polyhedron = ({shape, edge, face, backing, backingOpacity, glowId}: {
  shape: VaporwaveElement; edge: string; face: string; backing: string; backingOpacity: number; glowId: string;
}) => {
  const faces = getSolidFaces(shape);
  const back = faces.filter((item) => !item.front);
  const front = faces.filter((item) => item.front);
  return (
    <g opacity={shape.opacity} strokeLinejoin="round">
      <circle cx={shape.x} cy={shape.y} r={shape.size * SOLID_GLOW} fill={`url(#${glowId})`} opacity={shape.glow} />
      <path d={back.map((item) => facePath(item.points)).join('')} fill="none" stroke={edge} strokeOpacity="0.32" strokeWidth="1.8" />
      {front.map((item, index) => (
        <g key={index}>
          <path d={facePath(item.points)} fill={backing} fillOpacity={backingOpacity} />
          <path d={facePath(item.points)} fill={face} fillOpacity={0.1 + 0.52 * item.light} />
        </g>
      ))}
      <path d={front.map((item) => facePath(item.points)).join('')} fill="none" stroke={edge} strokeWidth={SOLID_EDGE} />
    </g>
  );
};
