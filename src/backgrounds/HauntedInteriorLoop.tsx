import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';
import {HauntedInteriorArchitecture} from './halloween/HauntedInteriorArtwork';

export const hauntedInteriorLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(16),
  seed: baseBackgroundSchema.shape.seed.default(113),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#080D10'),
  colors: baseBackgroundSchema.shape.colors.default(['#536C68', '#A8BDB0', '#CA8A48'])
    .describe('Paleta: névoa, luar e velas; a terceira cor é opcional'),
  dustCount: z.number().int().min(0).max(100).default(36).describe('Partículas de poeira nas laterais'),
  fogIntensity: z.number().finite().min(0).max(1).default(0.55).describe('Névoa junto ao piso'),
  candleIntensity: z.number().finite().min(0).max(1).default(0.8).describe('Luz e chamas das velas'),
  moonlightIntensity: z.number().finite().min(0).max(1).default(0.65).describe('Feixes de luar pelas janelas'),
  hauntingIntensity: z.number().finite().min(0).max(1).default(0.45).describe('Aparição dos olhos nos retratos'),
  chandelierSway: z.number().finite().min(0).max(1).default(0.6).describe('Balanço suave do lustre'),
});

export type HauntedInteriorLoopProps = z.infer<typeof hauntedInteriorLoopSchema>;
export type HauntedInteriorElement = {
  kind: 'dust' | 'fog' | 'candle' | 'chandelier' | 'moonlight' | 'eyes';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  glow: number;
  lean: number;
};

const element = (kind: HauntedInteriorElement['kind'], values: Partial<HauntedInteriorElement>): HauntedInteriorElement => ({
  kind, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, glow: 1, lean: 0, ...values,
});

/** Frequências inteiras: posição, luz e velocidade se repetem sem cortes. */
export const getHauntedInteriorScene = (
  props: HauntedInteriorLoopProps,
  frame: number,
  durationInFrames: number,
): HauntedInteriorElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  const dustRandom = createSeededRandom(props.seed + 103);
  const lightRandom = createSeededRandom(props.seed + 211);
  const dust = Array.from({length: props.dustCount}, (_, index) => {
    const offset = dustRandom() * TAU;
    const side = index % 2;
    const centerX = randomBetween(dustRandom, 65, 450);
    const centerY = randomBetween(dustRandom, 190, 1000);
    const radius = randomBetween(dustRandom, 7, 24);
    return element('dust', {
      x: (side ? 1920 - centerX : centerX) + Math.sin(phase + offset) * radius,
      y: centerY + Math.cos(phase + offset) * radius * 1.6,
      scale: randomBetween(dustRandom, 0.5, 1.6),
      opacity: 0.06 + (1 + Math.sin(phase * 2 + offset)) * 0.11,
    });
  });
  const fog = Array.from({length: 5}, (_, index) => {
    const offset = index * TAU / 5;
    return element('fog', {
      x: -140 + index * 550 + Math.sin(phase + offset) * 130,
      y: 966 + (index % 2) * 58 + Math.cos(phase + offset) * 16,
      scale: 1 + Math.sin(phase + offset) * 0.065,
      opacity: props.fogIntensity * (0.17 + Math.sin(phase + offset) * 0.035),
    });
  });
  const candles = [
    {x: 100, y: 690}, {x: 156, y: 665}, {x: 212, y: 700},
    {x: 1708, y: 700}, {x: 1764, y: 665}, {x: 1820, y: 690},
  ].map((anchor) => {
    const offset = lightRandom() * TAU;
    return element('candle', {
      ...anchor,
      glow: props.candleIntensity * (0.7 + Math.sin(phase * 7 + offset) * 0.12 + Math.cos(phase * 19 + offset) * 0.06),
      scale: 0.88 + Math.sin(phase * 11 + offset) * 0.11,
      lean: Math.sin(phase * 5 + offset) * 2.8 + Math.cos(phase * 13 + offset),
    });
  });
  const chandelier = element('chandelier', {
    x: 960, y: 0, rotation: props.chandelierSway * Math.sin(phase * 2) * 1.1,
    glow: props.candleIntensity * (0.72 + Math.sin(phase * 5 + 0.7) * 0.1 + Math.sin(phase * 13) * 0.035),
    scale: 0.92 + Math.sin(phase * 9) * 0.06,
    lean: Math.sin(phase * 7) * 2,
  });
  const moonlight = [170, 1750].map((x, index) => element('moonlight', {
    x, y: 330, rotation: Math.sin(phase + index * 2) * 1.2,
    opacity: props.moonlightIntensity * (0.1 + Math.sin(phase + index * 2) * 0.02),
  }));
  const eyes = [410, 1510].map((x, index) => element('eyes', {
    x, y: 438,
    opacity: props.hauntingIntensity * Math.pow((1 + Math.sin(phase + index * 2.6 - 0.8)) / 2, 6) * 0.6,
  }));
  return [...dust, ...fog, ...candles, chandelier, ...moonlight, ...eyes];
};

const Flame = ({glow, scale, lean, small = false}: Pick<HauntedInteriorElement, 'glow' | 'scale' | 'lean'> & {small?: boolean}) => (
  <g opacity={glow} transform={`scale(${small ? 0.7 : 1})`}>
    <ellipse cy="-10" rx="83" ry="104" fill="url(#hi-warm-halo)" opacity="0.5" />
    <g transform={`scale(1 ${scale})`}>
      <path d={`M0 2 C-12-5-7-14 ${lean}-29 C${lean + 4}-16 12-5 0 2Z`} fill="url(#hi-flame)" />
      <path d={`M0 0 Q-5-5 ${lean * 0.3}-14 Q5-5 0 0Z`} fill="#F9E6BE" />
    </g>
  </g>
);

const Candle = ({x, y, glow, scale, lean}: HauntedInteriorElement) => (
  <g transform={`translate(${x} ${y})`}>
    <ellipse cy="27" rx="120" ry="180" fill="url(#hi-warm-halo)" opacity={glow * 0.33} />
    <path d="M-9 3 Q0 6 9 2 L8 78 Q0 83-8 78Z" fill="url(#hi-wax)" />
    <path d="M-8 5 Q-6 20-4 11 T1 29 Q4 34 4 17 Q5 8 8 5" fill="none" stroke="#B5A283" strokeWidth="2.5" opacity="0.65" />
    <ellipse cy="3" rx="9" ry="3" fill="#B1A28A" />
    <path d="M0 2 L1-4" stroke="#241A12" strokeWidth="2" />
    <path d="M-17 78 Q0 92 17 78 L12 90 H-12Z M-4 92 H4 V122 H-4Z M-17 122 H17 L22 129 H-22Z" fill="url(#hi-bronze)" stroke="#5F5140" strokeWidth="1.1" />
    <Flame glow={glow} scale={scale} lean={lean} />
  </g>
);

const Chandelier = ({rotation, glow, scale, lean}: HauntedInteriorElement) => (
  <g transform={`translate(960 0) rotate(${rotation})`}>
    <path d="M0-6 V106" stroke="#050908" strokeWidth="7" />
    {Array.from({length: 9}, (_, i) => <ellipse key={i} cy={i * 12} rx={i % 2 ? 2 : 5} ry="8" fill="none" stroke="#625C49" strokeWidth="1.5" />)}
    <ellipse cy="177" rx="222" ry="93" fill="url(#hi-warm-halo)" opacity={glow * 0.28} />
    <g fill="none" stroke="url(#hi-bronze)" strokeWidth="6">
      <path d="M0 112 C-30 131-11 187 0 211 C11 187 30 131 0 112Z" />
      <path d="M0 193 C-40 227-150 219-169 173 C-182 140-140 139-147 163 M0 193 C40 227 150 219 169 173 C182 140 140 139 147 163" />
      <path d="M0 191 C-28 224-76 213-88 181 C-99 157-71 150-72 172 M0 191 C28 224 76 213 88 181 C99 157 71 150 72 172" />
    </g>
    <path d="M-19 107 Q0 96 19 107 L10 115 H-10Z M-18 203 H18 L9 214 H-9Z M-7 214 L0 235 L7 214Z" fill="url(#hi-bronze)" stroke="#695B41" />
    {[-169, -88, 0, 88, 169].map((x, i) => {
      const y = i === 2 ? 149 : Math.abs(x) === 169 ? 144 : 159;
      return (
        <g key={x} transform={`translate(${x} ${y})`}>
          <path d="M-6-28 H6 L5 22 H-5Z" fill="url(#hi-wax)" />
          <path d="M-12 21 Q0 32 12 21 L7 29 H-7Z" fill="url(#hi-bronze)" stroke="#65573F" />
          <g transform="translate(0 -28)"><Flame glow={glow} scale={scale} lean={i % 2 ? -lean : lean} small /></g>
        </g>
      );
    })}
    {[-133, -109, -48, 48, 109, 133].map((x, i) => (
      <g key={x} opacity="0.52">
        <path d={`M${x} ${193 + i % 2 * 9} v15`} stroke="#686B59" />
        <path d={`M${x} ${205 + i % 2 * 9} l-3 9 3 7 3-7Z`} fill="#91A294" />
      </g>
    ))}
  </g>
);

export const HauntedInteriorLoop = (props: HauntedInteriorLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scene = getHauntedInteriorScene(props, frame, durationInFrames);
  const ofKind = (kind: HauntedInteriorElement['kind']) => scene.filter((item) => item.kind === kind);
  const atmosphere = props.colors[0];
  const moonlight = props.colors[1];
  const candle = props.colors[2] ?? atmosphere;
  const transparent = hasTransparentBackground(props);
  return (
    <Canvas {...props}>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="hi-warm-halo">
            <stop stopColor={candle} stopOpacity="0.7" />
            <stop offset="0.22" stopColor={candle} stopOpacity="0.2" />
            <stop offset="1" stopColor={candle} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hi-flame" x2="0" y2="1">
            <stop stopColor={candle} /><stop offset="0.75" stopColor="#F4D195" /><stop offset="1" stopColor="#DFA24F" />
          </linearGradient>
          <linearGradient id="hi-wax">
            <stop stopColor="#504D40" /><stop offset="0.4" stopColor="#968B70" /><stop offset="1" stopColor="#383B34" />
          </linearGradient>
          <linearGradient id="hi-bronze">
            <stop stopColor="#101612" /><stop offset="0.42" stopColor="#746346" /><stop offset="0.6" stopColor="#3C3828" /><stop offset="1" stopColor="#111611" />
          </linearGradient>
          <radialGradient id="hi-fog">
            <stop stopColor={atmosphere} stopOpacity="0.64" /><stop offset="0.45" stopColor={atmosphere} stopOpacity="0.22" /><stop offset="1" stopColor={atmosphere} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hi-beam" x1="0" y1="0" x2="0.4" y2="1">
            <stop stopColor={moonlight} stopOpacity="0.75" /><stop offset="0.55" stopColor={moonlight} stopOpacity="0.28" /><stop offset="1" stopColor={moonlight} stopOpacity="0" />
          </linearGradient>
          <radialGradient id="hi-vignette" r="69%">
            <stop offset="0.38" stopColor="#020505" stopOpacity="0" /><stop offset="1" stopColor="#020505" stopOpacity="0.67" />
          </radialGradient>
          <radialGradient id="hi-eye-glow">
            <stop stopColor={candle} stopOpacity="0.5" /><stop offset="1" stopColor={candle} stopOpacity="0" />
          </radialGradient>
          <filter id="hi-beam-soft" x="-30%" y="-10%" width="160%" height="120%"><feGaussianBlur stdDeviation="9" /></filter>
        </defs>

        <HauntedInteriorArchitecture atmosphere={atmosphere} moonlight={moonlight} candle={candle} transparent={transparent} />

        {!transparent && ofKind('candle').map((light, i) => <ellipse key={i} cx={light.x} cy="1006" rx="175" ry="38" fill="url(#hi-warm-halo)" opacity={light.glow * 0.14} />)}

        {ofKind('moonlight').map((light, i) => (
          <g key={i} transform={`translate(${light.x} ${light.y}) rotate(${light.rotation}) scale(${i ? -1 : 1} 1)`} opacity={light.opacity} filter="url(#hi-beam-soft)">
            <path d="M-72-190 L14-230 L445 653 L102 711Z" fill="url(#hi-beam)" />
            <path d="M30-160 L63-126 L472 577 L400 633Z" fill="url(#hi-beam)" opacity="0.36" />
          </g>
        ))}

        {/* As aparições ficam presas aos retratos, sem atravessar o conteúdo. */}
        {ofKind('eyes').map((eyes, index) => (
          <g key={index} transform={`translate(${eyes.x} ${eyes.y})`} opacity={eyes.opacity}>
            {[-12, 10].map((x) => <g key={x}><ellipse cx={x} rx="17" ry="12" fill="url(#hi-eye-glow)" /><path d={`M${x - 3}-1 Q${x} 1 ${x + 3}-1`} stroke={candle} strokeWidth="1.8" fill="none" /></g>)}
          </g>
        ))}

        <Chandelier {...ofKind('chandelier')[0]!} />
        {/* Bases fixas: a luz muda sem deslocar os castiçais. */}
        {[156, 1764].map((x) => <g key={x} transform={`translate(${x} 785)`}>
          <path d="M-58-6 Q-58 36 0 44 Q58 36 58 4 M0-31 V186 M-22 187 H22 L38 203 H-38Z" fill="none" stroke="url(#hi-bronze)" strokeWidth="8" />
          <ellipse cy="207" rx="92" ry="12" fill="#030707" opacity="0.65" />
        </g>)}
        {ofKind('candle').map((light, i) => <Candle key={i} {...light} />)}

        {ofKind('fog').map((fog, i) => <g key={i} opacity={fog.opacity}>
          <ellipse cx={fog.x} cy={fog.y} rx={660 * fog.scale} ry={70 * fog.scale} fill="url(#hi-fog)" />
          <ellipse cx={fog.x + 190} cy={fog.y + 40} rx={510 * fog.scale} ry="37" fill="url(#hi-fog)" />
        </g>)}
        {ofKind('dust').map((dust, i) => <circle key={i} cx={dust.x} cy={dust.y} r={dust.scale} fill={moonlight} opacity={dust.opacity} />)}
        {!transparent && <rect width="1920" height="1080" fill="url(#hi-vignette)" />}
      </svg>
    </Canvas>
  );
};
