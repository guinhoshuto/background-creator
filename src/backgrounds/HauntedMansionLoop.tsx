import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';
import {BareTree} from './halloween/HalloweenArtwork';
import {HauntedMansionArtwork} from './halloween/HauntedMansionArtwork';

export const hauntedMansionLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(16),
  seed: baseBackgroundSchema.shape.seed.default(81),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#0E1520'),
  colors: baseBackgroundSchema.shape.colors.default(['#688789', '#D6DDC7', '#E8AF62'])
    .describe('Paleta: atmosfera, luar e janelas; a terceira cor é opcional'),
  batCount: z.number().int().min(0).max(12).default(4).describe('Quantidade de morcegos sobre a mansão'),
  moteCount: z.number().int().min(0).max(100).default(28).describe('Quantidade de luzes na névoa'),
  fogIntensity: z.number().finite().min(0).max(1).default(0.55).describe('Intensidade da névoa baixa'),
  windowIntensity: z.number().finite().min(0).max(1).default(0.7).describe('Intensidade das janelas e dos lampiões'),
  moonScale: z.number().finite().min(0.6).max(1.4).default(1).describe('Tamanho da lua atrás da mansão'),
});

export type HauntedMansionLoopProps = z.infer<typeof hauntedMansionLoopSchema>;
export type HauntedMansionElement = {
  kind: 'star' | 'bat' | 'mote' | 'fog' | 'cloud' | 'window' | 'lantern' | 'tree' | 'moon';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  glow: number;
  flap: number;
};

const element = (kind: HauntedMansionElement['kind'], values: Partial<HauntedMansionElement>): HauntedMansionElement => ({
  kind, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, glow: 1, flap: 1, ...values,
});

/** Todos os valores animados ficam aqui, incluindo luz, asas e oscilação dos galhos. */
export const getHauntedMansionScene = (
  props: HauntedMansionLoopProps,
  frame: number,
  durationInFrames: number,
): HauntedMansionElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  const starRandom = createSeededRandom(props.seed + 109);
  const batRandom = createSeededRandom(props.seed + 223);
  const moteRandom = createSeededRandom(props.seed + 347);
  const lightRandom = createSeededRandom(props.seed + 461);

  const stars = Array.from({length: 48}, () => {
    const offset = starRandom() * TAU;
    return element('star', {
      x: randomBetween(starRandom, 50, 1870), y: randomBetween(starRandom, 35, 620),
      scale: randomBetween(starRandom, 0.55, 1.35),
      opacity: 0.08 + (1 + Math.sin(phase + offset)) * 0.09,
    });
  });
  const bats = Array.from({length: props.batCount}, () => {
    const offset = batRandom() * TAU;
    const x = randomBetween(batRandom, 1280, 1760);
    const y = randomBetween(batRandom, 130, 300);
    const radius = randomBetween(batRandom, 34, 88);
    return element('bat', {
      x: x + Math.cos(phase + offset) * radius,
      y: y + Math.sin(phase * 2 + offset) * 18,
      scale: randomBetween(batRandom, 0.38, 0.65),
      rotation: -9 + Math.sin(phase + offset) * 10, opacity: 0.82,
      flap: 0.42 + (1 + Math.sin(phase * 32 + offset)) * 0.29,
    });
  });
  const motes = Array.from({length: props.moteCount}, () => {
    const offset = moteRandom() * TAU;
    const x = randomBetween(moteRandom, 110, 1850);
    const y = randomBetween(moteRandom, 846, 1040);
    const radius = randomBetween(moteRandom, 9, 27);
    return element('mote', {
      x: x + Math.cos(phase + offset) * radius,
      y: y + Math.sin(phase + offset) * radius * 0.65,
      scale: randomBetween(moteRandom, 0.7, 1.9),
      opacity: 0.06 + (1 + Math.sin(phase * 2 + offset)) * 0.13,
    });
  });
  const fog = Array.from({length: 5}, (_, index) => {
    const offset = index * TAU / 5;
    return element('fog', {
      x: -170 + index * 535 + Math.sin(phase + offset) * 115,
      y: 897 + index % 2 * 90 + Math.cos(phase + offset) * 17,
      scale: 1 + Math.sin(phase + offset) * 0.04,
      opacity: props.fogIntensity * (0.2 + Math.sin(phase + offset) * 0.04),
    });
  });
  const clouds = Array.from({length: 3}, (_, index) => element('cloud', {
    x: 1190 + index * 242 + Math.sin(phase + index * 1.8) * 80,
    y: 184 + index * 98 + Math.cos(phase + index) * 12,
    scale: 1 + index * 0.18, opacity: 0.17 + Math.sin(phase + index) * 0.025,
  }));
  const windows = Array.from({length: 12}, () => {
    const offset = lightRandom() * TAU;
    return element('window', {
      glow: props.windowIntensity * (0.72 + Math.sin(phase * 2 + offset) * 0.14 + Math.sin(phase * 5 + offset) * 0.06),
    });
  });
  const lanterns = [{x: 225, y: 894}, {x: 1817, y: 927}].map((anchor, index) => element('lantern', {
    ...anchor,
    glow: props.windowIntensity * (0.79 + Math.sin(phase * 3 + index) * 0.12 + Math.sin(phase * 7 + index) * 0.04),
  }));
  const trees = [{x: 32, y: 1040, scale: 1.16}, {x: 1938, y: 1010, scale: 0.71}].map((anchor, index) => element('tree', {
    ...anchor, rotation: Math.sin(phase + index * 2) * 0.23,
  }));
  return [
    ...stars,
    element('moon', {x: 1543, y: 236, scale: props.moonScale, glow: 0.92 + Math.sin(phase) * 0.035}),
    ...clouds, ...bats, ...windows, ...trees, ...fog, ...lanterns, ...motes,
  ];
};

const Bat = ({x, y, scale, rotation, flap, opacity}: HauntedMansionElement) => (
  <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`} opacity={opacity} fill="#080F18">
    <g transform={`scale(1 ${flap})`}>
      <path d="M0 0 Q-19-23-43-16 Q-29-8-34 6 Q-19-3-17 13 Q-7 5 0 9 Q7 5 17 13 Q19-3 34 6 Q29-8 43-16 Q19-23 0 0Z" />
    </g>
    <path d="M-5-7 L-4-14 L0-10 L4-14 L5-7 Q9 5 0 13 Q-9 5-5-7Z" />
  </g>
);

const Lantern = ({x, y, glow, color}: HauntedMansionElement & {color: string}) => (
  <g transform={`translate(${x} ${y})`}>
    <ellipse cy="149" rx="108" ry="17" fill="url(#mansion-warm-glow)" opacity={glow * 0.5} />
    <circle r="88" fill="url(#mansion-warm-glow)" opacity={glow * 0.48} />
    <path d="M-4 29 H4 V160 H-4Z M-16 158 H16 V165 H-16Z" fill="#080D14" />
    <path d="M-21-20 H21 L15 27 H-15Z" fill="#101A21" stroke="#465353" strokeWidth="2" />
    <path d="M-16-16 H16 L11 21 H-11Z" fill={color} opacity={glow} />
    <path d="M0-24 V25 M-22-21 L-15-30 H15 L22-21Z M-12 28 H12 L8 34 H-8Z" fill="#0A111A" stroke="#0A111A" strokeWidth="3" />
    <path d="M-4-32 Q-7-48 3-50 Q13-50 10-39" fill="none" stroke="#4E5B59" strokeWidth="2" />
  </g>
);

const IronFence = ({x, y, width, mirror = false}: {x: number; y: number; width: number; mirror?: boolean}) => (
  <g transform={`translate(${x} ${y}) scale(${mirror ? -1 : 1} 1)`}>
    <path d={`M0 63 H${width} M0 124 H${width}`} stroke="#080E16" strokeWidth="6" />
    <path d={`M0 60 H${width}`} stroke="#486061" strokeOpacity="0.25" strokeWidth="1" />
    {Array.from({length: Math.floor(width / 34)}, (_, index) => (
      <g key={index} transform={`translate(${index * 34 + 15} 0)`}>
        <path d="M0 17 V181" stroke="#080E16" strokeWidth="5" />
        <path d="M0 0 L6 17 L0 25 L-6 17Z" fill="#080E16" />
        <path d="M-1 5 V15" stroke="#70827B" strokeOpacity="0.27" />
        <path d="M0 83 C-26 78-21 39-3 51 M0 83 C26 78 21 39 3 51" stroke="#101922" strokeWidth="3" fill="none" />
      </g>
    ))}
  </g>
);

export const HauntedMansionLoop = (props: HauntedMansionLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scene = getHauntedMansionScene(props, frame, durationInFrames);
  const ofKind = (kind: HauntedMansionElement['kind']) => scene.filter((item) => item.kind === kind);
  const atmosphere = props.colors[0];
  const moonlight = props.colors[1];
  const candle = props.colors[2] ?? atmosphere;
  const moon = ofKind('moon')[0]!;

  return (
    <Canvas {...props}>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="mansion-sky" cx="80%" cy="24%" r="80%">
            <stop stopColor={atmosphere} stopOpacity="0.24" />
            <stop offset="0.54" stopColor={atmosphere} stopOpacity="0.035" />
            <stop offset="1" stopColor={atmosphere} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mansion-moon-halo">
            <stop stopColor={moonlight} stopOpacity="0.19" />
            <stop offset="0.4" stopColor={moonlight} stopOpacity="0.06" />
            <stop offset="1" stopColor={moonlight} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mansion-moon" cx="35%" cy="30%" r="80%">
            <stop stopColor={moonlight} />
            <stop offset="1" stopColor={atmosphere} />
          </radialGradient>
          <radialGradient id="mansion-fog">
            <stop stopColor={atmosphere} stopOpacity="0.85" />
            <stop offset="0.48" stopColor={atmosphere} stopOpacity="0.32" />
            <stop offset="1" stopColor={atmosphere} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mansion-warm-glow">
            <stop stopColor={candle} stopOpacity="0.7" />
            <stop offset="0.23" stopColor={candle} stopOpacity="0.16" />
            <stop offset="1" stopColor={candle} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mansion-ground" x2="0" y2="1">
            <stop stopColor="#192830" />
            <stop offset="1" stopColor="#0A111B" />
          </linearGradient>
          <radialGradient id="mansion-vignette" r="70%">
            <stop offset="0.3" stopColor="#040810" stopOpacity="0" />
            <stop offset="1" stopColor="#040810" stopOpacity="0.5" />
          </radialGradient>
        </defs>

        {!hasTransparentBackground(props) && <rect width="1920" height="1080" fill="url(#mansion-sky)" />}
        {ofKind('star').map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.scale} opacity={star.opacity} fill={moonlight} />)}
        <g transform={`translate(${moon.x} ${moon.y}) scale(${moon.scale})`} opacity={moon.glow}>
          <circle r="310" fill="url(#mansion-moon-halo)" />
          <circle r="113" fill="url(#mansion-moon)" />
          <g fill={atmosphere} opacity="0.19">
            <ellipse cx="37" cy="-35" rx="23" ry="32" transform="rotate(24 37 -35)" />
            <ellipse cx="60" cy="28" rx="25" ry="14" />
            <ellipse cx="-16" cy="70" rx="26" ry="11" />
            <circle cx="-62" cy="-30" r="11" />
            <circle cx="15" cy="-81" r="12" />
          </g>
          <path d="M-86-65 A109 109 0 0 1 37-101" stroke={moonlight} strokeWidth="2" opacity="0.5" fill="none" />
        </g>
        {ofKind('cloud').map((cloud, index) => (
          <g key={index} transform={`translate(${cloud.x} ${cloud.y}) scale(${cloud.scale})`} opacity={cloud.opacity} fill="url(#mansion-fog)">
            <ellipse rx="305" ry="24" />
            <ellipse cx="100" cy="13" rx="280" ry="20" />
          </g>
        ))}
        {ofKind('bat').map((bat, index) => <Bat key={index} {...bat} />)}

        {/* Relevo fixo e discreto: a câmera permanece estável atrás do conteúdo. */}
        <path d="M0 905 Q175 780 374 880 T776 904 Q1035 809 1240 855 Q1580 720 1920 824 V1080 H0Z" fill={atmosphere} opacity="0.065" />
        <path d="M1100 883 Q1400 801 1670 862 T1920 850 V1080 H1040Z" fill="#15232B" />
        <g transform="translate(1200 260) scale(0.98)">
          <HauntedMansionArtwork stone="#25323A" trim="#536261" roof="#101A24" windowColor={candle}
            windowLevels={ofKind('window').map(({glow}) => glow)} />
        </g>

        <path d="M0 1020 Q180 952 370 998 Q630 1060 987 984 Q1280 908 1440 923 Q1700 912 1920 977 V1080 H0Z" fill="url(#mansion-ground)" />
        <path d="M1514 927 Q1470 965 1390 987 Q1278 1019 1282 1080 H1030 Q1140 1019 1300 992 Q1454 968 1488 927Z" fill={atmosphere} opacity="0.13" />
        <path d="M1515 928 Q1470 969 1374 997" stroke={moonlight} strokeOpacity="0.065" strokeWidth="2" fill="none" />
        {ofKind('fog').slice(0, 2).map((fog, index) => <ellipse key={index} cx={fog.x + 540} cy={fog.y - 40} rx={570 * fog.scale} ry="67" fill="url(#mansion-fog)" opacity={fog.opacity * 0.7} />)}

        {ofKind('tree').map((tree, index) => <BareTree key={index} {...tree} mirror={index === 1} color="#0A111A" />)}
        <IronFence x={-30} y={937} width={442} />
        <IronFence x={1950} y={990} width={255} mirror />
        {ofKind('lantern').map((lantern, index) => <Lantern key={index} {...lantern} color={candle} />)}
        {ofKind('fog').map((fog, index) => (
          <ellipse key={index} cx={fog.x} cy={fog.y} rx={650 * fog.scale} ry={64 * fog.scale} fill="url(#mansion-fog)" opacity={fog.opacity} />
        ))}
        {[9, 79, 345, 398, 1618, 1680, 1877].map((x, index) => (
          <path key={x} transform={`translate(${x} ${1076 - index % 3 * 8})`} d="M0 20 Q-3-23-22-42 M0 20 Q-3-24 13-54 M0 20 Q12-12 29-22" stroke="#090F17" strokeWidth="3" fill="none" />
        ))}
        {ofKind('mote').map((mote, index) => (
          <g key={index} opacity={mote.opacity}>
            <circle cx={mote.x} cy={mote.y} r={mote.scale * 6} fill="url(#mansion-moon-halo)" />
            <circle cx={mote.x} cy={mote.y} r={mote.scale} fill={moonlight} />
          </g>
        ))}
        {!hasTransparentBackground(props) && <rect width="1920" height="1080" fill="url(#mansion-vignette)" />}
      </svg>
    </Canvas>
  );
};
