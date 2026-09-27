/**
 * What a piece of SVG markup actually draws: every painted point (paths with their curves and arcs
 * sampled, circles, ellipses, rects and lines) in the markup's own coordinates, through the
 * transforms (translate, scale, rotate, matrix, skew), with half its stroke's width (unscaled for
 * `vector-effect="non-scaling-stroke"`). Defs, gradients, clip paths and masks draw nothing; a
 * userSpaceOnUse clip drops the points outside it (its children united, even-odd per subpath), and
 * clipped points carry no stroke half-width (the clip cuts the stroke). Enough for the ornament
 * tests' "the ink stays inside its circle" checks; not a renderer.
 */

export type Ink = {x: number; y: number; half: number; tag: string};

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const numbers = (text: string) => (text.match(NUMBER) ?? []).map(Number);

/** An SVG transform list as a matrix. */
export const transformOf = (text: string | undefined): Matrix => {
  if (!text) return IDENTITY;
  let matrix = IDENTITY;
  for (const [, name, args] of text.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = numbers(args!);
    let step: Matrix;
    if (name === 'translate') step = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    else if (name === 'scale') step = [v[0]!, 0, 0, v[1] ?? v[0]!, 0, 0];
    else if (name === 'rotate') {
      const angle = (v[0]! * Math.PI) / 180;
      const [c, s] = [Math.cos(angle), Math.sin(angle)];
      const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
      step = multiply(multiply([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (name === 'matrix') step = v.slice(0, 6) as Matrix;
    else if (name === 'skewX') step = [1, 0, Math.tan((v[0]! * Math.PI) / 180), 1, 0, 0];
    else if (name === 'skewY') step = [1, Math.tan((v[0]! * Math.PI) / 180), 0, 1, 0, 0];
    else throw new Error(`transformação ${name}`);
    matrix = multiply(matrix, step);
  }
  return matrix;
};

/** The points along a path (lines every 1/20, curves every 1/16, arcs every 1/32 of their sweep), one list per subpath. */
export const pathPoints = (d: string): [number, number][][] => {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const subpaths: [number, number][][] = [];
  let current: [number, number][] = [];
  let index = 0;
  let command = '';
  let previous = '';
  let [x, y, sx, sy, cubicX, cubicY, quadX, quadY] = [0, 0, 0, 0, 0, 0, 0, 0];
  const next = () => Number(tokens[index++]);
  const push = (px: number, py: number) => current.push([px, py]);
  // Straight runs are sampled too: a bracket crossing a lamp has both ends outside it.
  const line = (ex: number, ey: number) => {
    for (let k = 1; k <= 20; k++) push(x + ((ex - x) * k) / 20, y + ((ey - y) * k) / 20);
    [x, y] = [ex, ey];
  };
  const STEPS = 16;
  while (index < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[index]!)) command = tokens[index++]!;
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const [ox, oy] = relative ? [x, y] : [0, 0];
    if (upper === 'M') {
      if (current.length) subpaths.push(current);
      current = [];
      x = ox + next();
      y = oy + next();
      [sx, sy] = [x, y];
      push(x, y);
      command = relative ? 'l' : 'L';
    } else if (upper === 'L') {
      const ex = ox + next();
      line(ex, oy + next());
    } else if (upper === 'H') line(ox + next(), y);
    else if (upper === 'V') line(x, oy + next());
    else if (upper === 'Z') line(sx, sy); else if (upper === 'C' || upper === 'S') {
      const smooth = previous === 'C' || previous === 'S';
      const [x1, y1] = upper === 'C' ? [ox + next(), oy + next()] : smooth ? [2 * x - cubicX, 2 * y - cubicY] : [x, y];
      const [x2, y2, ex, ey] = [ox + next(), oy + next(), ox + next(), oy + next()];
      for (let k = 1; k <= STEPS; k++) {
        const t = k / STEPS;
        const u = 1 - t;
        push(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey);
      }
      [cubicX, cubicY, x, y] = [x2, y2, ex, ey];
    } else if (upper === 'Q' || upper === 'T') {
      const smooth = previous === 'Q' || previous === 'T';
      const [x1, y1] = upper === 'Q' ? [ox + next(), oy + next()] : smooth ? [2 * x - quadX, 2 * y - quadY] : [x, y];
      const [ex, ey] = [ox + next(), oy + next()];
      for (let k = 1; k <= STEPS; k++) {
        const t = k / STEPS;
        const u = 1 - t;
        push(u * u * x + 2 * u * t * x1 + t * t * ex, u * u * y + 2 * u * t * y1 + t * t * ey);
      }
      [quadX, quadY, x, y] = [x1, y1, ex, ey];
    } else if (upper === 'A') {
      let [rx, ry] = [Math.abs(next()), Math.abs(next())];
      const phi = (next() * Math.PI) / 180;
      const [large, sweep] = [next(), next()];
      const [ex, ey] = [ox + next(), oy + next()];
      if (rx === 0 || ry === 0) push(ex, ey);
      else {
        // The SVG spec's endpoint-to-centre conversion, radii scaled up when too small.
        const [cp, sp] = [Math.cos(phi), Math.sin(phi)];
        const [dx, dy] = [(x - ex) / 2, (y - ey) / 2];
        const [x1p, y1p] = [cp * dx + sp * dy, -sp * dx + cp * dy];
        const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
        if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];
        const sign = large === sweep ? -1 : 1;
        const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
        const factor = sign * Math.sqrt(Math.max(0, numerator / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
        const [cxp, cyp] = [(factor * rx * y1p) / ry, (-factor * ry * x1p) / rx];
        const [cx, cy] = [cp * cxp - sp * cyp + (x + ex) / 2, sp * cxp + cp * cyp + (y + ey) / 2];
        const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        const start = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
        let span = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
        if (!sweep && span > 0) span -= 2 * Math.PI;
        if (sweep && span < 0) span += 2 * Math.PI;
        for (let k = 1; k <= 32; k++) {
          const t = start + (span * k) / 32;
          push(cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp);
        }
      }
      [x, y] = [ex, ey];
    } else throw new Error(`comando ${command} em ${d}`);
    previous = upper;
  }
  if (current.length) subpaths.push(current);
  return subpaths;
};

const insidePolygon = (polygon: readonly [number, number][], x: number, y: number) => {
  let inside = false;
  for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) {
    const [xa, ya] = polygon[a]!;
    const [xb, yb] = polygon[b]!;
    if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
};

/** A clip region in canvas coordinates: its subpaths, a point inside when an odd number of them hold it. */
type Clip = [number, number][][];
const insideClip = (clip: Clip, x: number, y: number) => clip.filter((polygon) => insidePolygon(polygon, x, y)).length % 2 === 1;

const attributes = (text: string) => {
  const attrs: Record<string, string> = {};
  for (const [, key, value] of text.matchAll(/([a-zA-Z-:]+)="([^"]*)"/g)) attrs[key!] = value!;
  return attrs;
};

/** The shapes of a clipPath's children, as path data in the clip's own coordinates. */
const clipShapes = (body: string) => {
  const shapes: {d: string; transform?: string}[] = [];
  for (const [, name, text] of body.matchAll(/<(path|rect|circle)([^>]*?)\/?>/g)) {
    const attrs = attributes(text!);
    const g = (key: string) => Number(attrs[key] ?? 0);
    const d = name === 'path' ? attrs.d!
      : name === 'rect' ? `M${g('x')} ${g('y')}H${g('x') + g('width')}V${g('y') + g('height')}H${g('x')}Z`
        : `M${g('cx') - g('r')} ${g('cy')}A${g('r')} ${g('r')} 0 1 0 ${g('cx') + g('r')} ${g('cy')}A${g('r')} ${g('r')} 0 1 0 ${g('cx') - g('r')} ${g('cy')}Z`;
    shapes.push({d, transform: attrs.transform});
  }
  return shapes;
};

const NOT_DRAWN = new Set(['defs', 'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'filter', 'symbol']);

/** Every point the markup paints, with half its stroke width (see the top of this file). */
export const inkOf = (markup: string): Ink[] => {
  const clips = new Map<string, {d: string; transform?: string}[]>();
  for (const [, id, body] of markup.matchAll(/<clipPath[^>]*? id="([^"]+)"[^>]*>(.*?)<\/clipPath>/g)) clips.set(id!, clipShapes(body!));
  type Frame = {matrix: Matrix; width: number; stroke: string | null; fill: string | null; clips: Clip[]; hidden: boolean};
  const stack: Frame[] = [{matrix: IDENTITY, width: 1, stroke: null, fill: 'black', clips: [], hidden: false}];
  const ink: Ink[] = [];
  let hiddenDepth = 0;
  for (const [, close, name, text, self] of markup.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    if (NOT_DRAWN.has(name!)) {
      if (!self) hiddenDepth += close ? -1 : 1;
      continue;
    }
    if (hiddenDepth > 0) continue;
    if (close) {
      if (name === 'g' || name === 'svg') stack.pop();
      continue;
    }
    const attrs = attributes(text!);
    const top = stack[stack.length - 1]!;
    const matrix = multiply(top.matrix, transformOf(attrs.transform));
    const width = attrs['stroke-width'] !== undefined ? Number(attrs['stroke-width']) : top.width;
    const stroke = attrs.stroke ?? top.stroke;
    const fill = attrs.fill ?? top.fill;
    const hidden = top.hidden || attrs.opacity === '0';
    let active = top.clips;
    const reference = attrs['clip-path']?.match(/url\(#([^)]+)\)/)?.[1];
    if (reference) {
      const shapes = clips.get(reference);
      if (!shapes) throw new Error(`recorte ${reference} não encontrado`);
      active = [...active, shapes.flatMap((shape) => {
        const m = multiply(matrix, transformOf(shape.transform));
        return pathPoints(shape.d).map((polygon) => polygon.map(([px, py]) => apply(m, px, py)));
      })];
    }
    if (name === 'g' || name === 'svg') {
      if (!self) stack.push({matrix, width, stroke, fill, clips: active, hidden});
      continue;
    }
    if (name === 'stop' || hidden) continue;
    const stroked = !!stroke && stroke !== 'none';
    if ((!fill || fill === 'none') && !stroked) continue;
    const scale = Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]));
    const half = stroked ? (attrs['vector-effect'] === 'non-scaling-stroke' ? width / 2 : (width * scale) / 2) : 0;
    const add = (px: number, py: number) => {
      const [x, y] = apply(matrix, px, py);
      if (active.some((clip) => !insideClip(clip, x, y))) return;
      ink.push({x, y, half: active.length > 0 ? 0 : half, tag: name!});
    };
    const g = (key: string) => Number(attrs[key] ?? 0);
    if (name === 'path') {
      for (const polygon of pathPoints(attrs.d!)) for (const [px, py] of polygon) add(px, py);
    } else if (name === 'circle' || name === 'ellipse') {
      const [rx, ry] = name === 'circle' ? [g('r'), g('r')] : [g('rx'), g('ry')];
      for (let k = 0; k < 64; k++) add(g('cx') + rx * Math.cos((k * Math.PI) / 32), g('cy') + ry * Math.sin((k * Math.PI) / 32));
    } else if (name === 'rect') {
      const [rx, ry, w, h] = [g('x'), g('y'), g('width'), g('height')];
      for (let k = 0; k <= 8; k++) {
        add(rx + (w * k) / 8, ry);
        add(rx + (w * k) / 8, ry + h);
        add(rx, ry + (h * k) / 8);
        add(rx + w, ry + (h * k) / 8);
      }
    } else if (name === 'line') {
      add(g('x1'), g('y1'));
      add(g('x2'), g('y2'));
    } else throw new Error(`elemento ${name}`);
  }
  return ink;
};
