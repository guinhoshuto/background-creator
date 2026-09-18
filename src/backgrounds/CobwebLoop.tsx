import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';
import {buildWebGeometry, OrbWeb, Spider, type WebGeometry} from './halloween/CobwebArtwork';

export const cobwebLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(12),
  // Schema, Root literal and preset carry the same seed, so an omitted key never surprises.
  seed: baseBackgroundSchema.shape.seed.default(47),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#100B1B'),
  colors: baseBackgroundSchema.shape.colors.default(['#CFC6E4', '#F6EFD8', '#E8963C'])
    .describe('Paleta: seda, luar e destaque âmbar; a terceira cor é opcional'),
  webCount: z.number().int().min(0).max(4).default(4).describe('Teias ancoradas nos cantos'),
  strandCount: z.number().int().min(0).max(24).default(12).describe('Fios de seda soltos'),
  moteCount: z.number().int().min(0).max(120).default(40).describe('Partículas de poeira'),
  spiderCount: z.number().int().min(0).max(3).default(1).describe('Aranhas penduradas'),
  dewIntensity: z.number().finite().min(0).max(1).default(0.7).describe('Brilho das gotas de orvalho'),
  mistIntensity: z.number().finite().min(0).max(1).default(0.5).describe('Intensidade da névoa'),
});

export type CobwebLoopProps = z.infer<typeof cobwebLoopSchema>;

export type CobwebElement = {
  kind: 'web' | 'dew' | 'strand' | 'spider' | 'mote' | 'mist';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  glow: number;
  /** Leg articulation for the spider; a constant for every other layer. */
  curl: number;
  /** Length of the silk line above a hanging spider. */
  thread: number;
  /** Frame x where that silk is tied; the body sways, the knot stays put. */
  anchorX: number;
  geometry?: WebGeometry;
};

const element = (kind: CobwebElement['kind'], values: Partial<CobwebElement>): CobwebElement => ({
  kind, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, glow: 1, curl: 0, thread: 0, anchorX: 0, ...values,
});

/**
 * Corner anchors, ordered by how much of the frame they claim. Each one drifts, sways
 * and breathes at its own amplitude and phase, so the four webs never move as one sheet.
 */
const WEB_ANCHORS = [
  {x: -110, y: -80, radius: 656, tilt: 0.05, spread: 1.5, sag: 0.1, drift: 7, sway: 0.55, breath: 0.006, phase: 0},
  {x: 2010, y: -60, radius: 650, tilt: TAU / 4 + 0.14, spread: 1.33, sag: 0.12, drift: 4, sway: 0.4, breath: 0.009, phase: 2.2},
  {x: 2030, y: 1150, radius: 610, tilt: TAU / 2 + 0.03, spread: 1.47, sag: 0.09, drift: 8, sway: 0.68, breath: 0.005, phase: 4.3},
  {x: -100, y: 1180, radius: 600, tilt: -TAU / 4 + 0.09, spread: 1.39, sag: 0.11, drift: 5, sway: 0.5, breath: 0.0075, phase: 1.1},
];

const SPIDER_ANCHORS = [
  {x: 1512, y: -30, drop: 292, range: 64, scale: 1},
  {x: 322, y: -30, drop: 214, range: 48, scale: 0.78},
  {x: 1760, y: -30, drop: 158, range: 36, scale: 0.62},
];

/** Every animated property lives here, so the seam tests cover the entire scene. */
export const getCobwebScene = (
  props: CobwebLoopProps,
  frame: number,
  durationInFrames: number,
): CobwebElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  // Separate streams keep changing a count from rearranging the other layers.
  const strandRandom = createSeededRandom(props.seed + 137);
  const moteRandom = createSeededRandom(props.seed + 421);
  const dewRandom = createSeededRandom(props.seed + 613);

  const activeAnchors = WEB_ANCHORS.slice(0, props.webCount);
  const webs = activeAnchors.map((anchor, index) => {
    const offset = anchor.phase;
    return element('web', {
      x: anchor.x + Math.cos(phase + offset) * anchor.drift,
      y: anchor.y + Math.sin(phase + offset) * anchor.drift * 0.6,
      // A whole-web breath, small enough to read as air moving through silk.
      scale: 1 + Math.sin(phase * 2 + offset) * anchor.breath,
      rotation: Math.sin(phase + offset) * anchor.sway,
      opacity: 0.82 + Math.sin(phase + offset) * 0.06,
      glow: 0.55 + Math.sin(phase + offset * 1.5) * 0.4,
      geometry: buildWebGeometry({
        spokes: 11 - index,
        rings: 8 - (index % 3),
        radius: anchor.radius,
        spread: anchor.spread,
        tilt: anchor.tilt,
        sag: anchor.sag,
        seed: props.seed + index * 53,
      }),
    });
  });

  // Dew sits on the silk: positions follow each web's own drift, sway and breath.
  const dew = webs.flatMap((web, index) => {
    const radians = web.rotation * TAU / 360;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    // Visibility is decided on the resting anchor, never on the drifting hub, so the
    // number of drops is the same on every frame of the cycle.
    const anchor = activeAnchors[index]!;
    const visible = (web.geometry?.nodes ?? []).filter((node) =>
      anchor.x + node.x > -14 && anchor.x + node.x < 1934
      && anchor.y + node.y > -14 && anchor.y + node.y < 1094);
    return visible.map((node) => {
      const offset = dewRandom() * TAU;
      const nodeX = node.x * web.scale;
      const nodeY = node.y * web.scale;
      return element('dew', {
        x: web.x + nodeX * cos - nodeY * sin,
        y: web.y + nodeX * sin + nodeY * cos,
        scale: (0.85 + node.depth * 1.05) * (1 + Math.sin(phase * 3 + offset) * 0.12),
        opacity: props.dewIntensity * (0.3 + (1 + Math.sin(phase * 2 + offset)) * 0.34),
        glow: 0.5 + Math.sin(phase + offset) * 0.45,
      });
    });
  });

  const strands = Array.from({length: props.strandCount}, () => {
    const offset = strandRandom() * TAU;
    // Every filament hangs from the top edge, with its bead at the low, free end.
    return element('strand', {
      x: randomBetween(strandRandom, 70, 1850) + Math.sin(phase + offset) * 15,
      y: -44 + Math.cos(phase + offset) * 7,
      // Short enough that a thread never reaches into the content area.
      scale: randomBetween(strandRandom, 0.42, 1.18),
      rotation: randomBetween(strandRandom, -15, 15) + Math.sin(phase * 2 + offset) * 2.1,
      opacity: 0.2 + (1 + Math.sin(phase + offset)) * 0.11,
      glow: 0.45 + Math.sin(phase * 2 + offset) * 0.3,
    });
  });

  const spiders = SPIDER_ANCHORS.slice(0, props.spiderCount).map((anchor, index) => {
    const offset = index * 1.9;
    const drop = anchor.drop + Math.sin(phase + offset) * anchor.range;
    return element('spider', {
      x: anchor.x + Math.sin(phase * 2 + offset) * 7,
      y: anchor.y + drop,
      scale: anchor.scale,
      rotation: Math.sin(phase * 2 + offset) * 2.6,
      opacity: 0.97,
      curl: 0.45 + (1 + Math.sin(phase * 3 + offset)) * 0.22,
      thread: drop,
      anchorX: anchor.x,
      glow: 0.6 + Math.sin(phase + offset) * 0.35,
    });
  });

  const placed: {x: number; y: number}[] = [];
  const motes = Array.from({length: props.moteCount}, () => {
    const offset = moteRandom() * TAU;
    // Rejection sampling with a fixed number of tries: deterministic, and the count never drifts.
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      x = randomBetween(moteRandom, 60, 1860);
      y = randomBetween(moteRandom, 60, 1020);
      if (placed.every((other) => Math.hypot(other.x - x, other.y - y) > 42)) break;
    }
    placed.push({x, y});
    const orbit = randomBetween(moteRandom, 10, 42);
    return element('mote', {
      x: x + Math.cos(phase + offset) * orbit,
      y: y + Math.sin(phase + offset) * orbit * 1.5,
      scale: randomBetween(moteRandom, 0.8, 2.4),
      opacity: 0.09 + (1 + Math.sin(phase * 2 + offset)) * 0.2,
      glow: 0.5 + Math.sin(phase + offset) * 0.4,
    });
  });

  const mist = Array.from({length: 4}, (_, index) => {
    const offset = index * TAU / 4;
    return element('mist', {
      x: -260 + index * 660 + Math.sin(phase + offset) * 120,
      y: 838 + (index % 2) * 96 + Math.cos(phase + offset) * 26,
      scale: 1 + Math.sin(phase + offset) * 0.05,
      opacity: props.mistIntensity * (0.19 + Math.sin(phase + offset) * 0.04),
    });
  });

  return [...mist, ...webs, ...dew, ...strands, ...spiders, ...motes];
};

const Strand = ({x, y, scale, rotation, opacity, glow, silk, moonlight}: CobwebElement & {silk: string; moonlight: string}) => {
  const length = 210 * scale;
  const bow = 26 * scale;
  const d = `M0 0 Q${bow} ${length * 0.55} ${bow * 0.4} ${length}`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`} opacity={opacity} fill="none" strokeLinecap="round">
      <path d={d} stroke="#17121F" strokeWidth="1.7" opacity="0.16" transform="translate(1.3 1.3)" />
      <path d={d} stroke={silk} strokeWidth="1.5" />
      <path d={d} stroke={moonlight} strokeWidth="0.7" opacity={0.5 * glow} transform="translate(-0.8 0)" />
      <circle cx={bow * 0.4} cy={length} r={2.2} fill={moonlight} stroke="none" opacity={0.35 + 0.35 * glow} />
    </g>
  );
};

export const CobwebLoop = (props: CobwebLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scene = getCobwebScene(props, frame, durationInFrames);
  const ofKind = (kind: CobwebElement['kind']) => scene.filter((item) => item.kind === kind);
  const silk = props.colors[0]!;
  const moonlight = props.colors[1]!;
  const accent = props.colors[2] ?? props.colors[0]!;
  const transparent = hasTransparentBackground(props);

  return (
    <Canvas {...props}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
        <defs>
          <radialGradient id="cobweb-sky" cx="76%" cy="18%" r="88%">
            <stop stopColor={silk} stopOpacity="0.2" />
            <stop offset="0.45" stopColor="#07050D" stopOpacity="0.06" />
            <stop offset="1" stopColor="#07050D" stopOpacity="0.6" />
          </radialGradient>
          <radialGradient id="cobweb-moonwash" cx="50%" cy="50%" r="50%">
            <stop stopColor={moonlight} stopOpacity="0.16" />
            <stop offset="0.5" stopColor={moonlight} stopOpacity="0.05" />
            <stop offset="1" stopColor={moonlight} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cobweb-mist">
            <stop stopColor={silk} stopOpacity="0.6" />
            <stop offset="0.55" stopColor={silk} stopOpacity="0.22" />
            <stop offset="1" stopColor={silk} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cobweb-dew">
            <stop stopColor={moonlight} stopOpacity="0.9" />
            <stop offset="0.28" stopColor={moonlight} stopOpacity="0.5" />
            <stop offset="0.66" stopColor={silk} stopOpacity="0.2" />
            <stop offset="1" stopColor={silk} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cobweb-emberglow">
            <stop stopColor={accent} stopOpacity="0.26" />
            <stop offset="0.45" stopColor={accent} stopOpacity="0.055" />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cobweb-dew-warm">
            <stop stopColor="#FFF6E2" />
            <stop offset="0.26" stopColor={accent} stopOpacity="0.8" />
            <stop offset="0.66" stopColor={accent} stopOpacity="0.24" />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cobweb-vignette" cx="50%" cy="46%" r="76%">
            <stop offset="0.45" stopColor="#07050D" stopOpacity="0" />
            <stop offset="1" stopColor="#07050D" stopOpacity="0.42" />
          </radialGradient>
          <radialGradient id="cobweb-mote">
            <stop stopColor={moonlight} />
            <stop offset="0.25" stopColor={accent} stopOpacity="0.5" />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        </defs>

        {!transparent && <rect width="1920" height="1080" fill="url(#cobweb-sky)" />}
        <ellipse cx="1560" cy="120" rx="760" ry="520" fill="url(#cobweb-moonwash)" />

        {ofKind('mist').map((mist, index) => (
          <ellipse key={index} cx={mist.x} cy={mist.y} rx={620 * mist.scale} ry={104 * mist.scale}
            fill="url(#cobweb-mist)" opacity={mist.opacity} />
        ))}

        {ofKind('web').map((web, index) => (
          web.geometry ? (
            <OrbWeb key={index} geometry={web.geometry} x={web.x} y={web.y} scale={web.scale}
              rotation={web.rotation} opacity={web.opacity} glow={web.glow}
              silk={silk} moonlight={moonlight} id={`cobweb-web-${index}`} />
          ) : null
        ))}

        {ofKind('dew').map((drop, index) => (
          <g key={index} opacity={drop.opacity}>
            <circle cx={drop.x} cy={drop.y} r={drop.scale * 1.9} fill="#0A0814" opacity="0.3" />
            <circle cx={drop.x} cy={drop.y} r={drop.scale * 4.2}
              fill={index % 7 === 3 ? 'url(#cobweb-dew-warm)' : 'url(#cobweb-dew)'} />
            <circle cx={drop.x} cy={drop.y} r={drop.scale * 1.05} fill={moonlight} opacity={0.3 + drop.glow * 0.3} />
          </g>
        ))}

        {ofKind('strand').map((strand, index) => (
          <Strand key={index} {...strand} silk={silk} moonlight={moonlight} />
        ))}

        {ofKind('spider').map((spider, index) => (
          <Spider key={index} x={spider.x} y={spider.y} scale={spider.scale} rotation={spider.rotation}
            legCurl={spider.curl} opacity={spider.opacity} thread={spider.thread}
            anchorX={spider.anchorX} glow={spider.glow}
            silk={silk} moonlight={moonlight} body="#120C1C" mark={accent} id={`cobweb-spider-${index}`} />
        ))}

        {!transparent && <rect width="1920" height="1080" fill="url(#cobweb-vignette)" />}

        {/* A warm light off the bottom edge, drawn over the vignette so it stays warm. */}
        <ellipse cx="700" cy="1090" rx="920" ry="330" fill="url(#cobweb-emberglow)" />

        {ofKind('mote').map((mote, index) => (
          <g key={index} opacity={mote.opacity}>
            <circle cx={mote.x} cy={mote.y} r={mote.scale * 1.5} fill="#0A0814" opacity="0.26" />
            <circle cx={mote.x} cy={mote.y} r={mote.scale * 4} fill="url(#cobweb-mote)" />
            <circle cx={mote.x} cy={mote.y} r={mote.scale * 0.5} fill={moonlight} opacity={0.22 + mote.glow * 0.22} />
          </g>
        ))}
      </svg>
    </Canvas>
  );
};
