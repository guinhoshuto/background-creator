import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, TAU} from '../loop';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';
import {
  AMBER, Bauble, BaubleRibbon, Bow, BULB_HOT, CONE, CONE_DARK, CONE_LIGHT, CREAM, GarlandBack, GarlandFront, mix, paletteOf,
  PineCluster, RibbonTie, SNOW as SNOW_WHITE, SNOW_CRYSTAL, Sparkle, TIE_REACH, WARM_WHITE,
} from './christmas/ChristmasArtwork';
import {GARLAND, LIGHT_SLOTS} from './christmas/garland';
import {
  acrossSpans, BAUBLES, BOW, BOW_BOX, CLUSTERS, clusterTransform, CORNER_LIGHTS, draws, insideContent, lerp, mod, rotateAbout, SNOW,
  WARMTH,
} from './christmas/layout';
import {PINE_LOWER, PINE_UPPER, type Point} from './christmas/pine';

export const christmasLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(20),
  seed: baseBackgroundSchema.shape.seed.default(1225),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#0A1712'),
  colors: baseBackgroundSchema.shape.colors.unwrap()
    .describe('Palette: evergreen, burgundy and gold; the third color is optional (without it, gold falls back to the second and the bauble caps turn silver)')
    .default(['#1E5A43', '#8E1F35', '#D8B25A']),
  baubleCount: z.number().int().min(0).max(10)
    .describe('Glass baubles hanging on ribbons, placed by hand; lower counts drop them in a fixed order').default(10),
  snowCount: z.number().int().min(0).max(240)
    .describe('Falling snowflakes in two depths; the large near flakes stay in the side columns').default(90),
  bokehCount: z.number().int().min(0).max(48)
    .describe('Soft out-of-focus warm light orbs near the garland and the corners; every fourth sits in front of the pine, and only those stay in transparent exports')
    .default(14),
  sparkleCount: z.number().int().min(0).max(60)
    .describe('Four-point sparkles glinting slowly around the edges').default(24),
  sway: z.number().finite().min(0).max(1)
    .describe('Swing of the baubles, the bow tails and the pine boughs; 0 holds them still').default(0.6),
  lightGlow: z.number().finite().min(0).max(1)
    .describe('Glow of the garland lights, the sparkles and the bauble glints; 0 leaves the bulbs unlit').default(0.75),
  twinkle: z.number().finite().min(0).max(1)
    .describe('Depth of the slow chase along the garland lights; 0 keeps every bulb steady').default(0.5),
  centerCalm: z.number().finite().min(0).max(1)
    .describe('Dims the falling snow over the central content area and darkens the center (the darkening applies to opaque formats only)')
    .default(0.7),
});

export type ChristmasLoopProps = z.infer<typeof christmasLoopSchema>;

export type ChristmasElement = {
  kind: 'warmth' | 'bokeh' | 'snow' | 'light' | 'bauble' | 'bow' | 'branch' | 'sparkle';
  x: number;
  y: number;
  /** px, always > 0. */
  radius: number;
  /** Degrees. */
  rotation: number;
  /** 0..1. */
  opacity: number;
  /** 0..1: a light's halo, a bauble's glint. */
  glow: number;
  /** A bauble's ribbon top. */
  pivotX: number;
  pivotY: number;
  /** -1..1: shifts a bauble's specular highlight as it turns. */
  twist: number;
  /** Static style index. */
  variant: number;
  /** Static palette slot: 0 evergreen, 1 burgundy, 2 gold. */
  tone: number;
};

/** The garland bulbs' radii (even and odd bulbs), and a halo's radius as a multiple of its bulb's. */
export const LIGHT_RADII = [3.4, 4] as const;
export const HALO = 10;

/** The lowest centre of a top-corner bokeh orb at rest: behind the boughs, above the bough baubles. */
export const BOKEH_TOP_CORNER = 200;
/**
 * An orb's opacity from its centre (0) to its edge (1): a warm core that fades out over the outer
 * half with no brighter rim, so it reads as a soft out-of-focus light, not a bubble.
 */
export const BOKEH_STOPS = [[0, 1], [0.5, 0.9], [0.75, 0.6], [0.9, 0.25], [1, 0]] as const;

const element = (kind: ChristmasElement['kind'], values: Partial<ChristmasElement>): ChristmasElement => ({
  kind, x: 0, y: 0, radius: 1, rotation: 0, opacity: 1, glow: 0, pivotX: 0, pivotY: 0, twist: 0, variant: 0, tone: 0, ...values,
});

/**
 * Every animated value lives here, so the seam tests cover the entire scene. Every frequency is a
 * whole multiple of the loop phase, the snow falls a whole number of wraps per cycle and wraps
 * only out of sight, and each layer draws from its own stream with a fixed number of draws per
 * item, so a count only resizes its own layer.
 */
export const getChristmasScene = (
  props: ChristmasLoopProps,
  frame: number,
  durationInFrames: number,
): ChristmasElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  const {seed, sway, lightGlow, twinkle, centerCalm} = props;

  // The boughs first: the corner lights and the cluster baubles ride their sway.
  const branchRandom = createSeededRandom(seed + 601);
  const branchOffsets = draws(branchRandom, CLUSTERS.length).map((u) => u * TAU);
  const bowOffset = branchRandom() * TAU;
  const bend = CLUSTERS.map((cluster, k) => sway * cluster.amplitude * Math.sin(phase + branchOffsets[k]!));
  const branches = CLUSTERS.map((cluster, k) => element('branch', {
    x: cluster.root[0], y: cluster.root[1], rotation: bend[k]!, variant: k,
  }));
  const bow = element('bow', {x: BOW.x, y: BOW.y, rotation: sway * 1.4 * Math.sin(2 * phase + bowOffset)});

  const warmth = WARMTH.map((light, k) => element('warmth', {
    x: light.x, y: light.y, radius: light.rx, tone: light.tone, variant: k,
    opacity: light.base * (0.9 + 0.1 * Math.sin(phase + 2.1 * k)),
  }));

  // Out-of-focus light, so only warm tones (0 amber, 1 amber gold, 2 gold), and only where a light
  // justifies it: the top band by the garland lights (clear of the bow), the top corners behind the
  // boughs by their bulbs (above the bough baubles, so no orb sits behind one), the lower corners,
  // and the bottom band near the corner warmth, which leaves the bottom centre open for a lower
  // third. Small and bright reads as light; large and dim reads as a stain.
  const bokehRandom = createSeededRandom(seed + 101);
  const bokeh = Array.from({length: props.bokehCount}, (_, i) => {
    const [rU, xU, yU, axU, ayU, o1U, o2U, peakU, toneU, sideU] = draws(bokehRandom, 10);
    const slot = i % 8;
    const foreground = slot === 3 || slot === 7;
    const r0 = slot === 2 ? lerp(18, 36, rU) : slot === 6 ? lerp(16, 34, rU) : foreground ? lerp(60, 110, rU) : lerp(20, 46, rU);
    const ax = lerp(10, 22, axU);
    const ay = slot === 6 ? lerp(4, 8, ayU) : lerp(8, 16, ayU);
    // The whole drift and breath stay inside the orb's band: its reach never enters the content box.
    const reachX = 1.05 * r0 + ax;
    const reachY = 1.05 * r0 + ay;
    // Slots 0 and 1 sit in the top corners, 4 and 5 in the lower ones, so a pair never stacks.
    const sideY = slot < 2 ? lerp(16, BOKEH_TOP_CORNER, yU) : lerp(780, 1064, yU);
    const [x0, y0] = slot === 0 || slot === 4 ? [lerp(16, 360 - reachX, xU), sideY]
      : slot === 1 || slot === 5 ? [lerp(1560 + reachX, 1904, xU), sideY]
        : slot === 2 ? [acrossSpans([[380, 560], [1360, 1540]], xU), lerp(900 + reachY, 1064, yU)]
          : slot === 6 ? [acrossSpans([[380, BOW_BOX.left - reachX], [BOW_BOX.right + reachX, 1540]], xU), lerp(16, 170 - reachY, yU)]
            : [
              sideU < 0.5 ? lerp(-40, 360 - reachX, xU) : lerp(1560 + reachX, 1960, xU),
              yU < 0.5 ? lerp(-40, 240, 2 * yU) : lerp(840, 1120, 2 * yU - 1),
            ];
    const o1 = o1U * TAU;
    const o2 = o2U * TAU;
    const peak = foreground ? lerp(0.05, 0.1, peakU) : lerp(0.4, 0.5, peakU);
    return element('bokeh', {
      x: x0 + ax * Math.sin(phase + o1),
      y: y0 + ay * Math.cos(phase + o1),
      radius: r0 * (1 + 0.05 * Math.sin(2 * phase + o2)),
      opacity: peak * (0.9 + 0.1 * Math.sin(2 * phase + o2)),
      tone: foreground ? 2 : toneU < 0.5 ? 0 : 1,
      variant: foreground ? 1 : 0,
    });
  });

  const snowRandom = createSeededRandom(seed + 211);
  const snow = Array.from({length: props.snowCount}, (_, i) => {
    const [xU, yU, sizeU, baseU, ampU, harmU, oU, o2U, crystalU, rot0, o3U] = draws(snowRandom, 11);
    // Two in five flakes are near: larger, faster, and only in the side columns.
    const near = i % 5 >= 3;
    const x0 = near ? (i % 5 === 3 ? lerp(-30, 250, xU) : lerp(1670, 1950, xU)) : lerp(-40, 1960, xU);
    // The start never sits on a wrap, so no wrap lands on the seam, and it ignores the count.
    const y0 = lerp(4, SNOW.span - 4, yU);
    const wraps = near ? SNOW.nearWraps : SNOW.farWraps;
    // Wraps go from 1120 to -40: both beyond the canvas by more than any flake's reach.
    const y = -SNOW.margin + mod(y0 + (wraps * SNOW.span * phase) / TAU, SNOW.span);
    const harmonic = near ? 1 + Math.floor(3 * harmU) : 1 + Math.floor(2 * harmU);
    const amplitude = near ? lerp(20, 46, ampU) : lerp(10, 26, ampU);
    const x = x0 + amplitude * Math.sin(harmonic * phase + oU * TAU) + 2.5 * Math.sin(5 * phase + o2U * TAU);
    const variant = near ? (crystalU < 1 / 6 ? 2 : 1) : 0;
    const base = near ? lerp(0.55, 0.85, baseU) : lerp(0.3, 0.55, baseU);
    return element('snow', {
      x, y, variant,
      radius: variant === 0 ? lerp(1.1, 2, sizeU) : variant === 1 ? lerp(2.2, 3.8, sizeU) : lerp(6, 9, sizeU),
      rotation: variant === 2 ? 60 * rot0 + 25 * Math.sin(harmonic * phase + o3U * TAU) : 0,
      // insideContent is 0 at both wrap points, so the dimming never jumps.
      opacity: base * (1 - 0.85 * centerCalm * insideContent(x, y)),
    });
  });

  // One slow chase: 2 waves per cycle (0.1 Hz at 20 s), a wavelength of 11 bulbs, never below 50%
  // of the glow at twinkle 1. It runs left to right across the frame: TL outer −2, TL inner −1, the
  // swags 0…21, TR inner 22, TR outer 23 (CORNER_LIGHTS.TR mirrors TL one to one, so its outer bulb
  // comes first).
  const lightRandom = createSeededRandom(seed + 401);
  const bulbs: {point: Point; chase: number; cluster: number | null}[] = [
    ...LIGHT_SLOTS.map((slot) => ({point: [slot.x, slot.y] as Point, chase: slot.swag === 'A' ? slot.index : 11 + slot.index, cluster: null})),
    ...CORNER_LIGHTS.TL.map((point, k) => ({point, chase: k - 2, cluster: 0})),
    ...CORNER_LIGHTS.TR.map((point, k) => ({point, chase: 23 - k, cluster: 1})),
  ];
  const lights = bulbs.map(({point, chase, cluster}, i) => {
    const [jU] = draws(lightRandom, 1);
    const level = 1 - 0.5 * twinkle * (0.5 + 0.5 * Math.sin(2 * phase - (TAU * chase) / 11 + 0.6 * (jU - 0.5)));
    const [x, y] = cluster === null ? point : rotateAbout(point, CLUSTERS[cluster]!.root, bend[cluster]!);
    return element('light', {
      x, y, radius: i % 2 ? LIGHT_RADII[1] : LIGHT_RADII[0], variant: i % 2,
      glow: lightGlow * level,
      // Unlit bulbs stay visible as glass beads.
      opacity: 0.35 + 0.65 * lightGlow * level,
    });
  });

  const baubleRandom = createSeededRandom(seed + 503);
  const baubles = BAUBLES.slice(0, props.baubleCount).map((spec) => {
    const [oU, o2U, ogU] = draws(baubleRandom, 3);
    const o = oU * TAU;
    const pivot = spec.cluster === null ? spec.pivot : rotateAbout(spec.pivot, CLUSTERS[spec.cluster]!.root, bend[spec.cluster]!);
    const h = spec.harmonic;
    // Degrees; |θ| ≤ 1.2·A·sway.
    const theta = sway * (spec.amplitude * Math.sin(h * phase + o) + 0.2 * spec.amplitude * Math.sin((h + 1) * phase + o2U * TAU));
    const reach = spec.L + spec.cap + spec.r;
    const angle = (theta * Math.PI) / 180;
    return element('bauble', {
      x: pivot[0] + reach * Math.sin(angle),
      y: pivot[1] + reach * Math.cos(angle),
      rotation: theta,
      pivotX: pivot[0],
      pivotY: pivot[1],
      radius: spec.r,
      variant: spec.style,
      tone: spec.tone,
      twist: sway * Math.cos(h * phase + o),
      // A glint once (bough baubles) or twice (garland baubles) per cycle.
      glow: lightGlow * 0.9 * ((1 - Math.cos((spec.cluster === null ? 2 : 1) * phase + ogU * TAU)) / 2) ** 16,
    });
  });

  const sparkleRandom = createSeededRandom(seed + 307);
  const sparkles = Array.from({length: props.sparkleCount}, (_, i) => {
    const [xU, yU, sU, hU, oU, peakU, tiltU] = draws(sparkleRandom, 7);
    const band = i % 4;
    const size = band === 2 ? lerp(4, 8, sU) : lerp(4, 11, sU);
    const reach = 1.4 * size + 3;
    const [x0, y0] = band === 0 ? [lerp(16, 360 - reach, xU), lerp(16, 1064, yU)]
      : band === 1 ? [lerp(1560 + reach, 1904, xU), lerp(16, 1064, yU)]
        : band === 2 ? [lerp(380, 1540, xU), lerp(12, 170 - reach, yU)]
          : [lerp(380, 1540, xU), lerp(900 + reach, 1068, yU)];
    const o = oU * TAU;
    const pulse = ((1 - Math.cos((1 + Math.floor(4 * hU)) * phase + o)) / 2) ** 4;
    return element('sparkle', {
      x: x0 + 3 * Math.cos(phase + o),
      y: y0 + 3 * Math.sin(phase + o),
      radius: size * (0.75 + 0.25 * pulse),
      rotation: lerp(-12, 12, tiltU) + 8 * Math.sin(phase + o),
      opacity: lightGlow * lerp(0.55, 1, peakU) * pulse,
    });
  });

  return [...warmth, ...bokeh, ...snow, ...lights, ...baubles, bow, ...branches, ...sparkles];
};

export type Box = {left: number; top: number; right: number; bottom: number};

/**
 * How far an element's drawing reaches on the canvas, or null for what may sit over the content
 * area: the static backdrop warmth (opaque formats only), the boughs (checked through their art's
 * extent) and the small far snow.
 */
export const reachOf = (item: ChristmasElement): Box | null => {
  const circle = (r: number): Box => ({left: item.x - r, top: item.y - r, right: item.x + r, bottom: item.y + r});
  switch (item.kind) {
    case 'warmth':
    case 'branch':
      return null;
    case 'snow':
      return item.variant === 0 ? null : circle(item.variant === 1 ? 2.4 * item.radius : item.radius);
    case 'bokeh':
      return circle(item.radius);
    case 'sparkle':
      return circle(1.4 * item.radius);
    case 'light':
      return circle(HALO * item.radius);
    case 'bauble': {
      // The body, and the pivot with the tie bow a bough bauble wears there (which also covers the
      // satin ribbon's half width).
      const body = circle(item.variant === 3 ? 1.45 * item.radius : item.radius);
      return {
        left: Math.min(body.left, item.pivotX - TIE_REACH),
        top: Math.min(body.top, item.pivotY - TIE_REACH),
        right: Math.max(body.right, item.pivotX + TIE_REACH),
        bottom: Math.max(body.bottom, item.pivotY + TIE_REACH),
      };
    }
    case 'bow':
      return {...BOW_BOX};
  }
};

export type ChristmasPictureProps = {props: ChristmasLoopProps; scene: ChristmasElement[]};

/** The whole frame, a pure function of the props and the scene: no hooks, so tests can render it. */
export const ChristmasPicture = ({props, scene}: ChristmasPictureProps) => {
  const ofKind = (kind: ChristmasElement['kind']) => scene.filter((item) => item.kind === kind);
  const {evergreen, burgundy, gold, metal, accent} = paletteOf(props.colors);
  const tones = [evergreen, burgundy, gold] as const;
  // Out-of-focus light is amber, amber gold or gold (the faint orbs in front of the pine): over the
  // green velvet a pale tone, like a tint of the green or the red, only lifts grey.
  const bokehTones = [mix(accent, AMBER, 0.6), mix(accent, AMBER, 0.4), accent];
  const warmthTones = [evergreen, burgundy, accent] as const;
  const sparkleFill = mix(accent, '#fff', 0.6);
  const transparent = hasTransparentBackground(props);
  const bokeh = ofKind('bokeh');
  const snow = ofKind('snow');
  // The garland bulbs come first in the scene and sit in the garland, under the bow and the boughs;
  // the corner bulbs are tucked into the top boughs and sit on them. A bulb is warm, with a hot
  // centre, and its halo leans amber (even bulbs) or pale gold (odd).
  const lights = ofKind('light');
  const garlandLights = lights.slice(0, LIGHT_SLOTS.length);
  const cornerLights = lights.slice(LIGHT_SLOTS.length);
  const bulbCores = [mix(accent, WARM_WHITE, 0.55), mix(accent, WARM_WHITE, 0.4)];
  const drawLight = (light: ChristmasElement, key: number) => (
    <g key={key}>
      <circle cx={light.x} cy={light.y} r={HALO * light.radius} fill={`url(#christmas-light-halo-${light.variant})`} opacity={light.glow} />
      <circle cx={light.x} cy={light.y} r={light.radius} fill={bulbCores[light.variant]} opacity={light.opacity} />
      <circle cx={light.x} cy={light.y} r={1.2} fill={BULB_HOT} opacity={light.opacity} />
    </g>
  );
  const baubles = ofKind('bauble').map((item, index) => ({item, spec: BAUBLES[index]!}));
  type Hung = (typeof baubles)[number];
  const ribbonColor = (item: ChristmasElement) => (item.tone === 2 ? burgundy : gold);
  const drawRibbon = ({item, spec}: Hung) => (
    <BaubleRibbon key={`ribbon-${spec.id}`} pivotX={item.pivotX} pivotY={item.pivotY} rotation={item.rotation} L={spec.L}
      radius={item.radius} color={ribbonColor(item)} />
  );
  const drawBauble = ({item, spec}: Hung) => (
    <Bauble key={`bauble-${spec.id}`} x={item.x} y={item.y} rotation={item.rotation} radius={item.radius} style={item.variant}
      tone={item.tone} twist={item.twist} glow={item.glow} cap={spec.cap} tones={tones} metal={metal} accent={accent} />
  );
  // The garland baubles hang in front of its greenery, their short ribbons tucked into it; the
  // bough baubles hang behind the garland and the pine, tied on with a small bow over the needles.
  const onGarland = baubles.filter(({spec}) => spec.cluster === null);
  const onBoughs = baubles.filter(({spec}) => spec.cluster !== null);
  const bauble = (tone: string) => [
    [0, mix(tone, '#fff', 0.55)], [0.22, mix(tone, '#fff', 0.12)], [0.6, tone], [0.88, mix(tone, '#000', 0.55)], [1, mix(tone, '#000', 0.75)],
  ] as const;

  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
      <defs>
        <radialGradient id="christmas-velvet" cx="50%" cy="40%" r="80%">
          <stop offset="0" stopColor={evergreen} stopOpacity="0.2" />
          <stop offset="0.55" stopColor={evergreen} stopOpacity="0.08" />
          <stop offset="1" stopColor="#030906" stopOpacity="0.35" />
        </radialGradient>
        <radialGradient id="christmas-veil">
          <stop offset="0" stopColor="#030A07" stopOpacity={0.3 * props.centerCalm} />
          <stop offset="0.75" stopColor="#030A07" stopOpacity={0.2 * props.centerCalm} />
          <stop offset="1" stopColor="#030A07" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="christmas-vignette" cx="50%" cy="46%" r="72%">
          <stop offset="0.6" stopColor="#010604" stopOpacity="0" />
          <stop offset="1" stopColor="#010604" stopOpacity="0.5" />
        </radialGradient>
        {[...new Set(WARMTH.map(({tone}) => tone))].map((tone) => (
          <radialGradient key={tone} id={`christmas-warmth-${tone}`}>
            <stop offset="0" stopColor={warmthTones[tone]} stopOpacity="1" />
            <stop offset="1" stopColor={warmthTones[tone]} stopOpacity="0" />
          </radialGradient>
        ))}
        {bokehTones.map((color, tone) => (
          <radialGradient key={tone} id={`christmas-bokeh-${tone}`}>
            {BOKEH_STOPS.map(([offset, opacity]) => <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />)}
          </radialGradient>
        ))}
        {tones.map((color, tone) => (
          <radialGradient key={tone} id={`christmas-bauble-${tone}`} cx="36%" cy="30%" r="78%">
            {bauble(color).map(([offset, stop]) => <stop key={offset} offset={offset} stopColor={stop} />)}
          </radialGradient>
        ))}
        <radialGradient id="christmas-bauble-rim">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
        <linearGradient id="christmas-gold-cap">
          <stop offset="0" stopColor={mix(metal, '#000', 0.35)} />
          <stop offset="0.45" stopColor={mix(metal, '#fff', 0.35)} />
          <stop offset="1" stopColor={mix(metal, '#000', 0.45)} />
        </linearGradient>
        {/* Velvet: the tails' front faces and the knot lighter at the top; the loops dark in the middle, lighter at the rim. */}
        <linearGradient id="christmas-velvet-bow" x2="0" y2="1">
          <stop offset="0" stopColor={mix(burgundy, '#fff', 0.14)} />
          <stop offset="0.5" stopColor={burgundy} />
          <stop offset="1" stopColor={mix(burgundy, '#000', 0.3)} />
        </linearGradient>
        <radialGradient id="christmas-velvet-loop" cx="50%" cy="56%" r="62%">
          <stop offset="0" stopColor={mix(burgundy, '#000', 0.42)} />
          <stop offset="0.6" stopColor={mix(burgundy, '#000', 0.18)} />
          <stop offset="1" stopColor={mix(burgundy, '#fff', 0.1)} />
        </radialGradient>
        {/* The mirrored bough flips its berries, so their gradient starts at 65%: 35% again on the canvas. */}
        {['', '-mirrored'].map((suffix) => (
          <radialGradient key={suffix} id={`christmas-berry${suffix}`} cx={suffix ? '65%' : '35%'} cy="30%" r="75%">
            <stop offset="0" stopColor={mix(burgundy, '#fff', 0.45)} />
            <stop offset="0.5" stopColor={burgundy} />
            <stop offset="1" stopColor={mix(burgundy, '#000', 0.6)} />
          </radialGradient>
        ))}
        {/* The cones are lit from the top left too: the mirrored boughs take the mirrored gradient. */}
        {['', '-mirrored'].map((suffix) => (
          <linearGradient key={suffix} id={`christmas-cone${suffix}`} x1={suffix ? 1 : 0} y1={0} x2={suffix ? 0 : 1} y2={1}>
            <stop offset="0" stopColor={CONE_LIGHT} />
            <stop offset="0.45" stopColor={CONE} />
            <stop offset="1" stopColor={CONE_DARK} />
          </linearGradient>
        ))}
        {[mix(accent, AMBER, 0.25), mix(accent, WARM_WHITE, 0.3)].map((color, variant) => (
          <radialGradient key={variant} id={`christmas-light-halo-${variant}`}>
            <stop offset="0" stopColor={color} stopOpacity="0.8" />
            <stop offset="0.25" stopColor={color} stopOpacity="0.4" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        ))}
        <radialGradient id="christmas-sparkle-glow">
          <stop offset="0" stopColor={CREAM} stopOpacity="0.5" />
          <stop offset="1" stopColor={CREAM} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="christmas-snow-halo">
          <stop offset="0" stopColor={SNOW_WHITE} stopOpacity="0.35" />
          <stop offset="1" stopColor={SNOW_WHITE} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The backdrop (opaque formats only): the vignette darkens the velvet alone, never the lights or the greenery. */}
      {!transparent && <rect width="1920" height="1080" fill="url(#christmas-velvet)" />}
      {!transparent && <rect width="1920" height="1080" fill="url(#christmas-vignette)" />}
      {!transparent && ofKind('warmth').map((light) => (
        <ellipse key={light.variant} cx={light.x} cy={light.y} rx={light.radius} ry={WARMTH[light.variant]!.ry}
          fill={`url(#christmas-warmth-${light.tone})`} opacity={light.opacity} />
      ))}
      {/*
        The orbs behind the greenery are backdrop light too, left out over a game. Plain alpha only:
        a CSS blend mode makes Chrome composite the group apart, and its pixels then depend on the
        frames the tab rendered before.
      */}
      {!transparent && bokeh.filter((orb) => orb.variant === 0).map((orb, index) => (
        <circle key={index} cx={orb.x} cy={orb.y} r={orb.radius} fill={`url(#christmas-bokeh-${orb.tone})`} opacity={orb.opacity} />
      ))}
      {!transparent && <ellipse cx="960" cy="535" rx="760" ry="430" fill="url(#christmas-veil)" />}
      {snow.filter((flake) => flake.variant === 0).map((flake, index) => (
        <circle key={index} cx={flake.x} cy={flake.y} r={flake.radius} fill={SNOW_WHITE} opacity={flake.opacity} />
      ))}

      {/* The drop shadows are offset in canvas space and drawn in both modes, so the greenery reads over bright footage. */}
      <path d={GARLAND.back} transform="translate(3 5)" fill="#000" opacity={0.35} />
      <GarlandBack gold={gold} />
      {onGarland.map(drawRibbon)}
      {onBoughs.map((hung) => (
        <g key={hung.spec.id}>
          {drawRibbon(hung)}
          {drawBauble(hung)}
        </g>
      ))}
      <GarlandFront evergreen={evergreen} gold={gold} />
      {onGarland.map(drawBauble)}
      {garlandLights.map(drawLight)}
      {ofKind('bow').map((item) => <Bow key="bow" x={item.x} y={item.y} rotation={item.rotation} burgundy={burgundy} />)}

      {ofKind('branch').map((branch) => {
        const cluster = CLUSTERS[branch.variant]!;
        const art = cluster.art === 'upper' ? PINE_UPPER : PINE_LOWER;
        return (
          <g key={cluster.id}>
            <g transform="translate(3 5)">
              <g transform={clusterTransform(cluster, branch.rotation)}>
                <path d={art.back} fill="#000" opacity={0.35} />
              </g>
            </g>
            <g transform={clusterTransform(cluster, branch.rotation)}>
              <PineCluster art={art} evergreen={evergreen} gold={gold} mirror={cluster.mirror} />
            </g>
          </g>
        );
      })}
      {onBoughs.map(({item, spec}) => <RibbonTie key={`tie-${spec.id}`} x={item.pivotX} y={item.pivotY} color={ribbonColor(item)} />)}

      {cornerLights.map(drawLight)}
      {bokeh.filter((orb) => orb.variant === 1).map((orb, index) => (
        <circle key={index} cx={orb.x} cy={orb.y} r={orb.radius} fill={`url(#christmas-bokeh-${orb.tone})`} opacity={orb.opacity} />
      ))}
      {snow.filter((flake) => flake.variant > 0).map((flake, index) => (flake.variant === 1
        ? (
          <g key={index} opacity={flake.opacity}>
            <circle cx={flake.x} cy={flake.y} r={2.4 * flake.radius} fill="url(#christmas-snow-halo)" />
            <circle cx={flake.x} cy={flake.y} r={flake.radius} fill={SNOW_WHITE} />
          </g>
        )
        : (
          <g key={index} transform={`translate(${flake.x} ${flake.y}) rotate(${flake.rotation}) scale(${flake.radius})`} opacity={flake.opacity}>
            <path d={SNOW_CRYSTAL} fill="none" stroke={SNOW_WHITE} strokeWidth={1.1} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        )))}
      {ofKind('sparkle').map((sparkle, index) => (
        <Sparkle key={index} x={sparkle.x} y={sparkle.y} rotation={sparkle.rotation} radius={sparkle.radius}
          opacity={sparkle.opacity} fill={sparkleFill} />
      ))}
    </svg>
  );
};

export const ChristmasLoop = (props: ChristmasLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return (
    <Canvas {...props}>
      <ChristmasPicture props={props} scene={getChristmasScene(props, frame, durationInFrames)} />
    </Canvas>
  );
};
