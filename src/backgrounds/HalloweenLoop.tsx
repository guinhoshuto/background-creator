import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';
import {BareTree, Pumpkin} from './halloween/HalloweenArtwork';

export const halloweenLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(12),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#120E20'),
  colors: baseBackgroundSchema.shape.colors.default(['#9B85C9', '#F7DCA6', '#ED792D'])
    .describe('Paleta: névoa, luar e abóboras; a terceira cor é opcional'),
  batCount: z.number().int().min(0).max(18).default(7).describe('Quantidade de morcegos'),
  emberCount: z.number().int().min(0).max(120).default(36).describe('Quantidade de luzes flutuantes'),
  fogIntensity: z.number().finite().min(0).max(1).default(0.6).describe('Intensidade da névoa'),
  moonScale: z.number().finite().min(0.5).max(1.5).default(1).describe('Escala da lua'),
});

export type HalloweenLoopProps = z.infer<typeof halloweenLoopSchema>;
export type HalloweenElement = {
  kind: 'star' | 'bat' | 'ember' | 'fog' | 'pumpkin' | 'tree' | 'moon';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  glow: number;
  flap: number;
};

const element = (kind: HalloweenElement['kind'], values: Partial<HalloweenElement>): HalloweenElement => ({
  kind, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, glow: 1, flap: 1, ...values,
});

/** Every animated property lives here, so the seam tests cover the entire scene. */
export const getHalloweenScene = (
  props: HalloweenLoopProps,
  frame: number,
  durationInFrames: number,
): HalloweenElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  // Separate streams keep changing a count from rearranging the other layers.
  const starRandom = createSeededRandom(props.seed + 101);
  const batRandom = createSeededRandom(props.seed + 211);
  const emberRandom = createSeededRandom(props.seed + 307);
  const stars = Array.from({length: 64}, () => {
    const x = randomBetween(starRandom, 100, 1820);
    const y = randomBetween(starRandom, 45, 695);
    const offset = starRandom() * TAU;
    return element('star', {
      x, y, scale: randomBetween(starRandom, 0.7, 1.9),
      opacity: 0.15 + (1 + Math.sin(phase + offset)) * 0.2,
    });
  });
  const bats = Array.from({length: props.batCount}, (_, index) => {
    const offset = batRandom() * TAU;
    const centerX = randomBetween(batRandom, 970, 1630);
    const centerY = randomBetween(batRandom, 155, 440);
    const orbitX = randomBetween(batRandom, 45, 155);
    const orbitY = randomBetween(batRandom, 15, 45);
    return element('bat', {
      x: centerX + Math.cos(phase + offset) * orbitX,
      y: centerY + Math.sin(phase * 2 + offset) * orbitY,
      scale: randomBetween(batRandom, 0.48, 1.05),
      rotation: Math.sin(phase + offset) * 12 - 8,
      opacity: index % 3 === 0 ? 0.55 : 0.85,
      // Integer harmonics preserve both pose and velocity at the repeat.
      flap: 0.35 + (1 + Math.sin(phase * 24 + offset)) * 0.325,
    });
  });
  const embers = Array.from({length: props.emberCount}, () => {
    const offset = emberRandom() * TAU;
    const x = randomBetween(emberRandom, 80, 1840);
    const y = randomBetween(emberRandom, 665, 1050);
    const orbit = randomBetween(emberRandom, 12, 47);
    return element('ember', {
      x: x + Math.cos(phase + offset) * orbit,
      y: y + Math.sin(phase + offset) * orbit * 1.7,
      scale: randomBetween(emberRandom, 1.2, 2.9),
      opacity: 0.12 + (1 + Math.sin(phase * 2 + offset)) * 0.28,
    });
  });
  const fog = Array.from({length: 5}, (_, index) => {
    const offset = index * TAU / 5;
    return element('fog', {
      x: -340 + index * 530 + Math.sin(phase + offset) * 130,
      y: 772 + (index % 3) * 83 + Math.cos(phase + offset) * 24,
      scale: 1 + Math.sin(phase + offset) * 0.06,
      opacity: props.fogIntensity * (0.12 + Math.sin(phase + offset) * 0.025),
    });
  });
  const pumpkins = [
    {x: 190, y: 1042, scale: 1.1, rotation: -3},
    {x: 348, y: 1070, scale: 0.68, rotation: 2},
    {x: 1740, y: 1046, scale: 1.22, rotation: 3},
    {x: 1569, y: 1071, scale: 0.66, rotation: -3},
  ].map((pumpkin, index) => element('pumpkin', {
    ...pumpkin,
    glow: 0.78 + Math.sin(phase * 3 + index * 1.7) * 0.13 + Math.sin(phase * 7 + index) * 0.06,
  }));
  return [
    ...stars,
    element('moon', {x: 1460, y: 264, scale: props.moonScale, glow: 0.93 + Math.sin(phase) * 0.07}),
    ...bats, ...fog, ...embers,
    element('tree', {x: -24, y: 1050, scale: 1.07, rotation: Math.sin(phase) * 0.35}),
    element('tree', {x: 1937, y: 1035, scale: 0.92, rotation: Math.sin(phase + 1.2) * 0.45}),
    ...pumpkins,
  ];
};

const Bat = ({x, y, scale, rotation, flap, opacity}: HalloweenElement) => (
  <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`} opacity={opacity} fill="#171021">
    <g transform={`scale(1 ${flap})`}>
      <path d="M-2 1 Q-16-20-40-16 Q-31-7-29 8 Q-20 2-15 13 Q-8 6-2 10Z" />
      <path d="M2 1 Q16-20 40-16 Q31-7 29 8 Q20 2 15 13 Q8 6 2 10Z" />
    </g>
    <path d="M-5-7-5-15 0-10 5-15 5-7 Q9 7 0 15 Q-9 7-5-7Z" />
  </g>
);

export const HalloweenLoop = (props: HalloweenLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scene = getHalloweenScene(props, frame, durationInFrames);
  const ofKind = (kind: HalloweenElement['kind']) => scene.filter((item) => item.kind === kind);
  const moon = ofKind('moon')[0]!;
  const mistColor = props.colors[0]!;
  const moonColor = props.colors[1]!;
  const pumpkinColor = props.colors[2] ?? props.colors[0]!;
  const transparent = hasTransparentBackground(props);

  return (
    <Canvas {...props}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
        <defs>
          <radialGradient id="halloween-sky" cx="72%" cy="25%" r="82%">
            <stop stopColor={mistColor} stopOpacity="0.28" />
            <stop offset="0.5" stopColor={mistColor} stopOpacity="0.055" />
            <stop offset="1" stopColor="#090710" stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id="halloween-moon-halo">
            <stop stopColor={moonColor} stopOpacity="0.15" />
            <stop offset="0.45" stopColor={moonColor} stopOpacity="0.055" />
            <stop offset="1" stopColor={moonColor} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="halloween-moon" cx="32%" cy="25%" r="85%">
            <stop stopColor="#FFF7DE" />
            <stop offset="0.63" stopColor={moonColor} />
            <stop offset="1" stopColor={mistColor} />
          </radialGradient>
          <radialGradient id="halloween-fog">
            <stop stopColor={mistColor} stopOpacity="0.65" />
            <stop offset="0.55" stopColor={mistColor} stopOpacity="0.25" />
            <stop offset="1" stopColor={mistColor} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="halloween-ember">
            <stop stopColor={moonColor} />
            <stop offset="0.2" stopColor={pumpkinColor} stopOpacity="0.75" />
            <stop offset="1" stopColor={pumpkinColor} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="halloween-ground" x2="0" y2="1">
            <stop stopColor="#171020" />
            <stop offset="1" stopColor="#09080F" />
          </linearGradient>
        </defs>

        {!transparent && <rect width="1920" height="1080" fill="url(#halloween-sky)" />}
        {ofKind('star').map((star, index) => (
          <g key={index} transform={`translate(${star.x} ${star.y})`} fill={moonColor} opacity={star.opacity}>
            {index % 9 === 0
              ? <path d={`M0 ${-star.scale * 4} Q1-1 ${star.scale * 3} 0 Q1 1 0 ${star.scale * 4} Q-1 1 ${-star.scale * 3} 0 Q-1-1 0 ${-star.scale * 4}Z`} />
              : <circle r={star.scale} />}
          </g>
        ))}

        <g transform={`translate(${moon.x} ${moon.y}) scale(${moon.scale})`}>
          <circle r="310" fill="url(#halloween-moon-halo)" opacity={moon.glow} />
          <circle r="159" fill="none" stroke={moonColor} strokeWidth="0.6" opacity="0.16" />
          <circle r="145" fill="none" stroke={moonColor} strokeWidth="0.8" opacity="0.12" />
          <circle r="131" fill="url(#halloween-moon)" />
          <g fill={mistColor} opacity="0.12">
            <ellipse cx="52" cy="-29" rx="32" ry="39" transform="rotate(-25 52 -29)" />
            <ellipse cx="76" cy="32" rx="18" ry="24" />
            <ellipse cx="-34" cy="62" rx="28" ry="17" transform="rotate(35 -34 62)" />
            <circle cx="-72" cy="-28" r="13" />
            <circle cx="28" cy="86" r="10" />
            <circle cx="-10" cy="-80" r="20" />
          </g>
          <path d="M-97-70 A120 120 0 0 1 47-111" stroke="#FFF9E7" strokeWidth="2" opacity="0.4" fill="none" />
        </g>
        {ofKind('bat').map((bat, index) => <Bat key={index} {...bat} />)}

        {/* Thin cloud ribbons soften the moon without obscuring the quiet center. */}
        {ofKind('fog').slice(0, 2).map((fog, index) => (
          <ellipse key={index} cx={fog.x + 780} cy={300 + index * 97 + (fog.y - 772) * 0.1}
            rx="370" ry="24" fill="url(#halloween-fog)" opacity={fog.opacity * 1.5} />
        ))}

        <path d="M0 870 Q185 746 357 848 T728 892 Q1010 795 1265 852 T1650 818 Q1800 780 1920 831 V1080 H0Z"
          fill={mistColor} opacity="0.065" />
        <path d="M0 945 Q240 846 453 927 Q697 997 943 934 T1400 912 Q1670 842 1920 916 V1080 H0Z"
          fill={mistColor} opacity="0.085" />
        {ofKind('fog').map((fog, index) => (
          <ellipse key={index} cx={fog.x} cy={fog.y} rx={680 * fog.scale} ry={95 * fog.scale}
            fill="url(#halloween-fog)" opacity={fog.opacity} />
        ))}

        {ofKind('tree').map((tree, index) => (
          <BareTree key={index} {...tree} mirror={index === 1} color="#0C0A13" />
        ))}
        <path d="M0 1029 Q135 980 310 1027 Q520 1062 724 1043 T1220 1044 Q1540 1066 1730 1007 Q1840 982 1920 1013 V1080 H0Z"
          fill="url(#halloween-ground)" />
        {ofKind('pumpkin').map((pumpkin, index) => (
          <Pumpkin key={index} {...pumpkin} color={pumpkinColor} id={`halloween-pumpkin-${index}`} />
        ))}

        {/* Sparse grasses frame the lower corners; nothing crosses the content area. */}
        {[30, 83, 428, 484, 1420, 1480, 1830, 1900].map((x, index) => (
          <g key={x} transform={`translate(${x} ${1060 + index % 3 * 8}) scale(${index % 2 ? -1 : 1} 1)`}
            stroke="#09080F" strokeWidth="3" fill="none" strokeLinecap="round">
            <path d="M0 24 Q-4-22-24-53 M0 24 Q2-31 15-65 M0 24 Q18-8 33-20 M0 24 Q-14-2-31-8" />
          </g>
        ))}
        {ofKind('ember').map((ember, index) => (
          <g key={index} opacity={ember.opacity}>
            <circle cx={ember.x} cy={ember.y} r={ember.scale * 5} fill="url(#halloween-ember)" />
            <circle cx={ember.x} cy={ember.y} r={ember.scale * 0.55} fill={moonColor} />
          </g>
        ))}
      </svg>
    </Canvas>
  );
};
