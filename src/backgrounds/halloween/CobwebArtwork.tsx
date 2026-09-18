import {createSeededRandom} from '../../loop';

export interface WebGeometryInput {
  /** Radial threads that carry the web, fanned across `spread`. */
  spokes: number;
  /** Sticky spiral rings, denser near the rim like a real orb web. */
  rings: number;
  radius: number;
  spread: number;
  tilt: number;
  /** How far each ring segment dips toward the hub, as a fraction of its radius. */
  sag: number;
  seed: number;
}

export interface WebGeometry {
  /** Radial threads; the three marked `frame` are the thick ones the web is built on. */
  spokes: {d: string; frame: boolean}[];
  rings: {d: string; depth: number}[];
  /** A thread that snapped and hangs loose from the rim. */
  loose: string;
  /** Where that thread ends, so a bead can finish it instead of a bare stub. */
  looseTip: {x: number; y: number} | null;
  nodes: {x: number; y: number; depth: number}[];
  /** Radius of the silk sheen behind the threads, in local units. */
  sheen: number;
}

const round = (value: number) => Math.round(value * 10) / 10;
const polar = (angle: number, radius: number): [number, number] => [
  round(Math.cos(angle) * radius),
  round(Math.sin(angle) * radius),
];

/**
 * Hub-centred orb web. Geometry depends only on the input, never on the frame:
 * the scene animates the group transform, the opacities, and the dew instead.
 */
export const buildWebGeometry = ({
  spokes,
  rings,
  radius,
  spread,
  tilt,
  sag,
  seed,
}: WebGeometryInput): WebGeometry => {
  const random = createSeededRandom(seed);
  const jitter = spread / (spokes * 2.6);
  const angles = Array.from({length: spokes}, (_, index) => {
    const step = spokes > 1 ? index / (spokes - 1) : 0.5;
    return tilt + spread * step + (random() - 0.5) * jitter;
  });
  // Below 1: the capture rings tighten toward the rim, as an orb web does.
  const radii = Array.from({length: rings}, (_, index) => {
    const step = (index + 1) / rings;
    return radius * (0.17 + 0.83 * step ** 0.86) * (1 + (random() - 0.5) * 0.05);
  });
  // The outer ring is the rim, and every radial stops exactly on it: a thread that
  // carries on past the last ring leaves a loose tip hanging in open canvas.
  const rim = radii[radii.length - 1] ?? radius;
  const spokeEnds = angles.map(() => rim);
  // The frame threads lie on real radials, so they never double a neighbouring thread.
  const frameSpokes = new Set([0, Math.floor((angles.length - 1) / 2), angles.length - 1]);
  const spokePaths = angles.map((angle, index) => {
    const [x, y] = polar(angle, spokeEnds[index]!);
    // A slight bow keeps the thread from reading as a ruler-straight line.
    const [cx, cy] = polar(angle + (random() - 0.5) * 0.03, radius * 0.5);
    return {d: `M0 0 Q${cx} ${cy} ${x} ${y}`, frame: frameSpokes.has(index)};
  });

  // One ageing hole per web, a couple of cells wide, plus a little fraying elsewhere:
  // a single readable tear reads as age, a scatter of dropouts reads as a bug.
  // The rim is never touched: it is what caps every radial, and a gap there would
  // leave a thread ending in open canvas.
  const tearRing = 1 + Math.floor(random() * Math.max(1, rings - 3));
  const tearSpoke = Math.floor(random() * Math.max(1, angles.length - 2));
  const ringPaths = radii.map((ringRadius, ringIndex) => {
    let d = '';
    for (let index = 0; index < angles.length - 1; index++) {
      const inTear = ringIndex >= tearRing && ringIndex <= Math.min(tearRing + 1, rings - 2)
        && index >= tearSpoke && index <= tearSpoke + 1;
      const fray = ringIndex > 1 && random() < 0.03;
      const frayed = fray && ringIndex < rings - 1;
      if (inTear || frayed) continue;
      const from = angles[index]!;
      const to = angles[index + 1]!;
      const [x1, y1] = polar(from, ringRadius);
      const [x2, y2] = polar(to, ringRadius);
      const middle = (from + to) / 2;
      // Gravity, not a uniform radial dip: the lower arcs sag, the upper ones flatten.
      const dip = sag * (0.5 + 0.7 * Math.max(0, Math.sin(middle)));
      const [cx, cy] = polar(middle, ringRadius * (1 - dip));
      d += `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
    }
    return {d, depth: (ringIndex + 1) / rings};
  });

  // Dew scatters: a modular filter would line the beads up in diagonal chains.
  const nodes = radii.flatMap((ringRadius, ringIndex) =>
    angles.flatMap((angle) => {
      if (random() >= 0.24) return [];
      const [x, y] = polar(angle, ringRadius);
      return [{x, y, depth: (ringIndex + 1) / rings}];
    }),
  );

  const outer = radii[radii.length - 1] ?? radius;

  // One snapped thread, hanging from a rim intersection with a curl at the tip.
  const looseAngle = angles[Math.min(angles.length - 1, Math.floor(angles.length * 0.5))];
  const [lx, ly] = polar(looseAngle ?? 0, radii[radii.length - 1] ?? outer);
  const drop = radius * (0.14 + random() * 0.09);
  const drift = radius * 0.04 * (random() - 0.5);
  const loose = looseAngle === undefined ? ''
    : `M${lx} ${ly} Q${round(lx + drift)} ${round(ly + drop * 0.6)} ${round(lx + drift * 2)} ${round(ly + drop)}`
      + ` q${round(drift - 7)} ${round(drop * 0.22)} ${round(drift * 0.5 + 4)} ${round(drop * 0.34)}`;
  const looseTip = looseAngle === undefined ? null : {
    x: round(lx + drift * 2 + drift * 0.5 + 4),
    y: round(ly + drop + drop * 0.34),
  };

  // A full disc, not a sector: the gradient fades to nothing before any edge shows.
  return {spokes: spokePaths, rings: ringPaths, loose, looseTip, nodes, sheen: round(outer * 1.04)};
};

export interface OrbWebProps {
  geometry: WebGeometry;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  /** Moonlit rim light travelling across the silk, 0 to 1. */
  glow: number;
  silk: string;
  moonlight: string;
  id: string;
}

export const OrbWeb = ({
  geometry,
  x,
  y,
  scale,
  rotation,
  opacity,
  glow,
  silk,
  moonlight,
  id,
}: OrbWebProps) => (
  <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`} opacity={opacity}>
    <defs>
      <radialGradient id={`${id}-sheen`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={geometry.sheen}>
        <stop offset="0" stopColor={moonlight} stopOpacity="0.075" />
        <stop offset="0.45" stopColor={silk} stopOpacity="0.032" />
        <stop offset="1" stopColor={silk} stopOpacity="0" />
      </radialGradient>
    </defs>

    <circle r={geometry.sheen} fill={`url(#${id}-sheen)`} />
    {/* A soft dark underline: invisible on night sky, it keeps pale silk legible
        when a transparent export is composited over a light background. */}
    <g transform="translate(1.3 1.3)" fill="none" stroke="#17121F" strokeLinecap="round">
      {geometry.rings.map(({d, depth}, index) => (
        <path key={index} d={d} strokeWidth={1.2 + depth * 0.7} opacity="0.17" />
      ))}
      {geometry.spokes.map(({d, frame}, index) => (
        <path key={index} d={d} strokeWidth={frame ? 2.9 : 1.7} opacity="0.16" />
      ))}
      <path d={geometry.loose} strokeWidth="1.7" opacity="0.15" />
    </g>
    <g fill="none" strokeLinecap="round">
      {geometry.spokes.map(({d, frame}, index) => (
        <path key={index} d={d} stroke={silk} strokeWidth={frame ? 2.5 : 1.5} opacity={frame ? 0.46 : 0.4} />
      ))}
      {geometry.rings.map(({d, depth}, index) => (
        <path key={index} d={d} stroke={silk} strokeWidth={1.05 + depth * 0.65} opacity={0.27 + depth * 0.2} />
      ))}
      <path d={geometry.loose} stroke={silk} strokeWidth="1.3" opacity="0.38" />
      {/* A bead finishes the snapped thread, the way the hanging filaments end. */}
      {geometry.looseTip && (
        <g stroke="none">
          <circle cx={geometry.looseTip.x} cy={geometry.looseTip.y} r="2.4" fill="#0A0814" opacity="0.28" />
          <circle cx={geometry.looseTip.x} cy={geometry.looseTip.y} r="1.9" fill={moonlight} opacity={0.3 + glow * 0.3} />
        </g>
      )}
      {/* Offset rim-light pass: the lit edge of each thread, never a full redraw. */}
      <g transform="translate(-1.1 -1.1)" stroke={moonlight} strokeWidth="0.8">
        {geometry.rings.map(({d, depth}, index) => (
          <path key={index} d={d} opacity={(0.08 + depth * 0.14) * glow} />
        ))}
        {geometry.spokes.map(({d}, index) => (
          <path key={index} d={d} opacity={0.1 * glow} />
        ))}
        <path d={geometry.loose} opacity={0.12 * glow} />
      </g>
    </g>
  </g>
);

export interface SpiderProps {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** Leg articulation, 0 tucked to 1 stretched. */
  legCurl: number;
  /** Moonlight on the abdomen, 0 to 1. */
  glow: number;
  opacity: number;
  /** Silk line the spider hangs from, in local units above the body. */
  thread: number;
  /** Where that line is tied, in frame coordinates: the body swings, the knot does not. */
  anchorX: number;
  silk: string;
  moonlight: string;
  body: string;
  mark: string;
  id: string;
}

const legs = [
  {base: -1.05, joint: [-30, -26], tip: [-52, 6], width: 3.4},
  {base: -0.55, joint: [-34, -12], tip: [-58, 20], width: 3.1},
  {base: 0.25, joint: [-31, 6], tip: [-52, 34], width: 2.8},
  {base: 0.85, joint: [-24, 18], tip: [-40, 44], width: 2.5},
];

/** Hangs from a single thread; y marks the top of the abdomen. */
export const Spider = ({
  x,
  y,
  scale,
  rotation,
  legCurl,
  glow,
  opacity,
  thread,
  anchorX,
  silk,
  moonlight,
  body,
  mark,
  id,
}: SpiderProps) => {
  const curl = Math.max(0, Math.min(1, legCurl));
  const reach = 0.82 + curl * 0.24;
  // The two halves never match exactly; a perfect mirror reads as a stamp.
  const sideReach = (side: number) => (side > 0 ? reach : reach * 0.93);

  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <path d={`M${anchorX - x} ${-thread} L0 0`} stroke={silk} strokeWidth="1.5" opacity="0.4" fill="none" />
      <path d={`M${anchorX - x} ${-thread} L0 0`} stroke={moonlight} strokeWidth="0.6" opacity="0.22" fill="none" />
      <g transform={`rotate(${rotation}) scale(${scale})`}>
        <defs>
          <radialGradient id={`${id}-abdomen`} cx="36%" cy="30%" r="78%">
            <stop offset="0" stopColor={moonlight} stopOpacity="0.14" />
            <stop offset="0.42" stopColor={body} />
            <stop offset="1" stopColor="#07060C" />
          </radialGradient>
          <radialGradient id={`${id}-specular`}>
            <stop offset="0" stopColor={moonlight} stopOpacity="0.5" />
            <stop offset="1" stopColor={moonlight} stopOpacity="0" />
          </radialGradient>
        </defs>

        <g fill="none" stroke={body} strokeLinecap="round">
          {legs.map(({base, joint, tip, width}, index) => (
            <g key={index}>
              {[1, -1].map((side) => (
                <path
                  key={side}
                  d={`M${side * 5} ${base * 4 + 6} Q${side * joint[0]! * sideReach(side)} ${joint[1]! * sideReach(side)} ${side * tip[0]! * sideReach(side)} ${tip[1]! * sideReach(side) + (side > 0 ? 0 : 1.6)}`}
                  strokeWidth={width}
                />
              ))}
            </g>
          ))}
        </g>
        <g fill="none" stroke={moonlight} strokeWidth="0.8" opacity="0.18" strokeLinecap="round">
          {legs.map(({base, joint, tip}, index) => (
            <path
              key={index}
              d={`M-5 ${base * 4 + 6} Q${-joint[0]! * reach} ${joint[1]! * reach - 1.5} ${-tip[0]! * reach} ${tip[1]! * reach - 1.5}`}
            />
          ))}
        </g>

        <ellipse cx="0" cy="22" rx="17" ry="20" fill={`url(#${id}-abdomen)`} />
        {/* Two triangles meeting at the waist: the hourglass reads even at small sizes. */}
        <path d="M-4.8 13 L4.8 13 L1.5 21.5 L4.4 31 L-4.4 31 L-1.5 21.5Z" fill={mark} opacity="0.62" />
        <path d="M-2.6 15 L2.6 15 L0.9 21.5 L2.4 28 L-2.4 28 L-0.9 21.5Z" fill="#FFF3D8" opacity="0.26" />
        <ellipse cx="0" cy="3" rx="10" ry="9" fill={body} />
        <ellipse cx="-3.2" cy="0.4" rx="1.7" ry="1.9" fill={moonlight} opacity="0.75" />
        <ellipse cx="3.2" cy="0.4" rx="1.7" ry="1.9" fill={moonlight} opacity="0.75" />
        <ellipse cx="-6.5" cy="14" rx="5.4" ry="4" fill={`url(#${id}-specular)`}
          opacity={0.3 + Math.max(0, Math.min(1, glow)) * 0.35} transform="rotate(-24 -6.5 14)" />
      </g>
    </g>
  );
};
