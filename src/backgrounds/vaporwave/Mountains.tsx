import {createSeededRandom, randomBetween, TAU} from '../../loop';
import {CENTER_X, getSunX, getSunY, HORIZON_Y, pathOf, smoothstep, SUN_RADIUS, WIDTH, type Point} from './frame';
import {PALM_SLOTS} from './Palm';

/** The far silhouette and the outer ranges run 60 px past the right edge of the frame. */
const WIDTH_REACH = WIDTH + 60;

export type MountainFacet = {points: [Point, Point, Point]; light: number};
export type MountainRange = {
  /** The skyline, left to right. */
  ridge: Point[];
  /** Contour rows from the ridge down to the foot at the horizon: ridge, upper, lower, base. */
  rows: Point[][];
  facets: MountainFacet[];
  /** The peaks' tips that show on the skyline (a peak can hide under a taller neighbour). */
  apexes: Point[];
  back: boolean;
};

/** Heights of the two inner contour rows, as a share of the ridge above them. */
const CONTOURS = [0.64, 0.3] as const;
/**
 * An apex that grazes the sun's rim reads as a tangent, as if the disc grew out of the peak.
 * One closer than APEX_CLEARANCE to the rim moves along the sun's radius until it is
 * APEX_SHIFT px clearly outside the disc, or clearly inside it when it already overlapped.
 */
export const APEX_CLEARANCE = 40;
const APEX_SHIFT = 60;

/**
 * The small palms on the horizon (the third slot) stand in front of the ranges, crown in the
 * band where the peaks are: a peak right behind a crown reads as if the palm were perched on
 * it. No apex lands within CROWN_CLEARANCE px of either crown's x. The ranges stay static and
 * independent of palmCount, so the same seed always draws the same mountains.
 */
const HORIZON_PALM = PALM_SLOTS[2];
const CROWN_X = HORIZON_PALM.edge + HORIZON_PALM.lean * HORIZON_PALM.height;
export const CROWN_COLUMNS = [CROWN_X, WIDTH - CROWN_X] as const;
export const CROWN_CLEARANCE = 120;
const clearOfCrowns = (x: number) => CROWN_COLUMNS.reduce((placed, column) =>
  Math.abs(placed - column) < CROWN_CLEARANCE ? column + (placed < column ? -CROWN_CLEARANCE : CROWN_CLEARANCE) : placed, x);

/**
 * Static mountain ranges: high at the edges, low in the middle and under the sun. Each range
 * draws from its own seeded stream, so tuning one never reshapes another. The wireframe is a
 * mesh of contour rows (ridge, upper, lower and base) joined by meridians and alternating
 * diagonals, so it reads as surveyed terrain instead of random strokes.
 */
export const getMountainRidges = (props: {seed: number; sunPosition: number}) => {
  const sunX = getSunX(props.sunPosition);
  const sunY = getSunY(props.sunPosition);
  const envelope = (x: number, reach = 0) => {
    const side = smoothstep(170 - reach, 760 - reach, Math.abs(x - CENTER_X));
    const valley = 1 - 0.7 * Math.exp(-(((x - sunX) / (SUN_RADIUS * 1.15)) ** 2));
    return side * valley;
  };
  const clearOfRim = (x: number, peak: number) => {
    const dx = x - sunX;
    const dy = HORIZON_Y - peak - sunY;
    const distance = Math.hypot(dx, dy);
    const gap = distance - SUN_RADIUS;
    if (Math.abs(gap) >= APEX_CLEARANCE || distance === 0) return {x, peak};
    const scale = (SUN_RADIUS + (gap < 0 ? -APEX_SHIFT : APEX_SHIFT)) / distance;
    return {x: sunX + dx * scale, peak: Math.max(0, HORIZON_Y - sunY - dy * scale)};
  };

  const range = (stream: number, outer: number, inner: number, height: number, back: boolean, reach = 0): MountainRange => {
    const random = createSeededRandom(props.seed + 521 + stream * 97);
    const peakCount = 4;
    const peaks = Array.from({length: peakCount}, (_, index) => {
      const x = clearOfCrowns(outer + ((inner - outer) * (index + randomBetween(random, 0.2, 0.8))) / (peakCount + 0.4));
      const peak = height * envelope(x, reach) * randomBetween(random, 0.55, 1);
      const width = () => Math.max(110, peak / randomBetween(random, 0.8, 1.25));
      // Widths first, so moving an apex off the rim never shifts the seeded stream.
      const [left, right] = [width(), width()];
      return {...clearOfRim(x, peak), left, right};
    });
    // A low, continuous foothill ties the peaks together: no lone pyramids on the horizon.
    const swell = random() * TAU;
    const foothill = (x: number) => height * envelope(x, reach) * (0.2 + 0.05 * Math.sin(x / 70 + swell));
    const ridgeAt = (x: number) => Math.max(foothill(x), ...peaks.map(({x: center, peak, left, right}) =>
      peak * Math.max(0, 1 - (x < center ? (center - x) / left : (x - center) / right))));

    const from = Math.min(outer, inner);
    const to = Math.max(outer, inner);
    // Skyline vertices: every peak, the lowest point between two peaks, and even steps.
    const sorted = [...peaks].sort((a, b) => a.x - b.x);
    const valleys = sorted.slice(1).map((peak, index) => {
      const previous = sorted[index]!;
      let lowest = previous.x;
      for (let x = previous.x; x <= peak.x; x += 4) if (ridgeAt(x) < ridgeAt(lowest)) lowest = x;
      return lowest;
    });
    const anchors = [...sorted.map(({x}) => x), ...valleys];
    const steps = Math.round((to - from) / 74);
    const even = Array.from({length: steps + 1}, (_, index) =>
      from + ((to - from) * (index + (index > 0 && index < steps ? randomBetween(random, -0.22, 0.22) : 0))) / steps)
      .filter((x) => anchors.every((anchor) => Math.abs(anchor - x) > 30));
    const xs = [...anchors, ...even].sort((a, b) => a - b);
    const ridge = xs.map((x): Point => [x, HORIZON_Y - ridgeAt(x)]);

    const rows: Point[][] = [ridge];
    for (const share of CONTOURS) {
      rows.push(ridge.map(([x, y]) => {
        const rise = HORIZON_Y - y;
        const jitter = rise > 8 ? randomBetween(random, -14, 14) * (rise / height) : 0;
        return [x + jitter, HORIZON_Y - rise * share * randomBetween(random, 0.9, 1.1)] as Point;
      }));
    }
    rows.push(ridge.map(([x]) => [x, HORIZON_Y] as Point));

    // Faces that fall towards the sun catch its light; lower bands sit in the haze's shadow.
    const facets: MountainFacet[] = [];
    for (let band = 0; band < rows.length - 1; band++) {
      const top = rows[band]!;
      const bottom = rows[band + 1]!;
      for (let index = 0; index < ridge.length - 1; index++) {
        const [x0, y0] = ridge[index]!;
        const [x1, y1] = ridge[index + 1]!;
        const slope = (y1 - y0) / Math.max(1, x1 - x0);
        const toSun = Math.sign(sunX - (x0 + x1) / 2) || 1;
        const facing = Math.max(-1, Math.min(1, slope * toSun * 2.2));
        const light = (0.5 + 0.5 * facing) * [1, 0.72, 0.46][band]!;
        const [a, b, c, d] = [top[index]!, top[index + 1]!, bottom[index]!, bottom[index + 1]!];
        const pair: [Point, Point, Point][] = index % 2 === 0 ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]];
        pair.forEach((points, half) => {
          const area = Math.abs((points[1][0] - points[0][0]) * (points[2][1] - points[0][1]) -
            (points[2][0] - points[0][0]) * (points[1][1] - points[0][1]));
          if (area > 40) facets.push({points, light: Math.max(0, light * (half ? 0.86 : 1))});
        });
      }
    }
    const apexes = peaks.filter(({x, peak}) => peak > 0 && ridgeAt(x) <= peak + 1e-9)
      .map(({x, peak}): Point => [x, HORIZON_Y - peak]);
    return {ridge, rows, facets, apexes, back};
  };

  const random = createSeededRandom(props.seed + 509);
  const far = Array.from({length: 41}, (_, index): Point => {
    const x = -40 + index * 50 + randomBetween(random, -14, 14);
    const lift = 0.45 + 0.55 * smoothstep(0, 900, Math.abs(x - CENTER_X));
    return [x, HORIZON_Y - randomBetween(random, 10, 44) * lift];
  });
  return {
    far,
    // Drawn first and paler: a second range peeks between the peaks and gives the valley depth.
    ranges: [
      range(3, -40, 860, 250, true, 70),
      range(4, 1990, 1060, 250, true, 70),
      range(1, -60, 790, 300, false),
      range(2, 1980, 1130, 300, false),
    ],
  };
};

/** Contours, meridians and diagonals as one stroke, so crossings never double up. */
export const wireframeOf = (range: MountainRange) => {
  const segments: string[] = range.rows.slice(1, -1).map((row) => pathOf(row));
  range.ridge.forEach((point, index) => {
    if (HORIZON_Y - point[1] < 6) return;
    segments.push(pathOf(range.rows.map((row) => row[index]!)));
  });
  // The first and last corners of every facet: its diagonal (or a meridian drawn twice,
  // which a single stroke does not double).
  for (const facet of range.facets) segments.push(pathOf([facet.points[0], facet.points[2]]));
  return segments.join(' ');
};

/**
 * A glowing skyline. `paint` fades it out just above the horizon, so the low foothills that
 * run along the horizon never stroke it in cyan or brighter pink.
 */
export const RidgeLine = ({range, paint, glow}: {range: MountainRange; paint: string; glow: number}) => {
  const strength = range.back ? 0.6 : 1;
  return (
    <g strokeLinejoin="round" fill="none" stroke={paint}>
      <path d={pathOf(range.ridge)} strokeWidth="10" opacity={0.16 * glow * strength} />
      <path d={pathOf(range.ridge)} strokeWidth={range.back ? 2 : 2.6} opacity={(0.75 + 0.25 * glow) * strength} />
    </g>
  );
};

/**
 * One range: an opaque body in the night colour, lilac facets shaded towards the sun, the
 * wireframe fading into the horizon haze and a glowing skyline on top. Over gameplay the
 * artwork draws every range inside one translucent group, so the bodies never stack.
 */
export const Mountains = ({range, night, facet, ridgePaint, wireFade, glow}: {
  range: MountainRange; night: string; facet: string; ridgePaint: string; wireFade: string; glow: number;
}) => {
  const {ridge, back} = range;
  const body = `${pathOf(ridge)} L${ridge[ridge.length - 1]![0].toFixed(1)} ${HORIZON_Y} L${ridge[0]![0].toFixed(1)} ${HORIZON_Y} Z`;
  return (
    <g strokeLinejoin="round">
      <path d={body} fill={night} />
      {range.facets.map((item, index) => (
        <path key={index} d={pathOf(item.points, true)} fill={facet}
          fillOpacity={(back ? 0.14 : 0.06) + (back ? 0.2 : 0.24) * item.light} />
      ))}
      <path d={wireframeOf(range)} stroke={wireFade} strokeWidth={back ? 1.3 : 1.6} fill="none"
        opacity={(0.45 + 0.35 * glow) * (back ? 0.45 : 1)} />
      <RidgeLine range={range} paint={ridgePaint} glow={glow} />
    </g>
  );
};

/**
 * Everything the ranges and the far silhouette cover, as one outline from left to right
 * along the highest skyline, closed on the horizon. Sampled every 2 px and at every vertex;
 * `sink` lowers it a little, so a clip built on it hides nothing the bodies leave visible.
 */
export const getMountainOutline = (mountains: {far: Point[]; ranges: MountainRange[]}, sink = 0): Point[] => {
  const lines: Point[][] = [[[-60, HORIZON_Y], ...mountains.far, [WIDTH_REACH, HORIZON_Y]], ...mountains.ranges.map((range) => range.ridge)];
  const heightAt = (line: Point[], x: number) => {
    if (x < line[0]![0] || x > line[line.length - 1]![0]) return HORIZON_Y;
    for (let index = 0; index + 1 < line.length; index++) {
      const [x0, y0] = line[index]!;
      const [x1, y1] = line[index + 1]!;
      if (x >= x0 && x <= x1) return x1 === x0 ? Math.min(y0, y1) : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return HORIZON_Y;
  };
  const all = lines.flat().map(([x]) => x);
  const [from, to] = [Math.min(...all), Math.max(...all)];
  const xs = new Set<number>();
  for (let x = Math.ceil(from); x < to; x += 2) xs.add(x);
  for (const x of all) xs.add(x);
  const skyline = [...xs].sort((a, b) => a - b).map((x): Point =>
    [x, Math.min(HORIZON_Y, Math.min(...lines.map((line) => heightAt(line, x))) + sink)]);
  return [[from, HORIZON_Y], ...skyline, [to, HORIZON_Y]];
};
