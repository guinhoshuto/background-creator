import {useId} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema} from '../settings';
import {Canvas} from './Canvas';
import {ShaderCanvas, type Uniforms} from './webgl/ShaderCanvas';
import {parseColor, srgbToLinear} from './webgl/scene';
import {LotusGarden} from './wuthering-waves/LotusGarden';
import {PaintedLandscape} from './wuthering-waves/PaintedLandscape';
import {WUTHERING_WAVES_FRAGMENT_SHADER} from './wuthering-waves/shader';

export const wutheringWavesLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(16),
  seed: baseBackgroundSchema.shape.seed.default(1403),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#1B3E6D'),
  colors: baseBackgroundSchema.shape.colors.unwrap()
    .describe('Palette: warm ivory light, cyan water accents and soft gold pigment')
    .default(['#ECDCB6', '#48B9C6', '#DBBE8D']),
  atmosphere: z.number().finite().min(0).max(1)
    .describe('Strength of the blue mist, pale water and reflections').default(0.8),
  resonance: z.number().finite().min(0).max(1)
    .describe('Strength of the gold pigment and flowing cloud ribbons').default(0.7),
  particleCount: z.number().int().min(0).max(100)
    .describe('Sparse pigment flecks near the light and the water').default(28),
  motion: z.number().finite().min(0).max(2)
    .describe('Motion amplitude of water, mist and leaves. Zero freezes the scene; duration controls the pace').default(1),
  centerShade: z.number().finite().min(0).max(1)
    .describe('Soft blue clearing behind stream content').default(0.08),
});

export type WutheringWavesLoopProps = z.infer<typeof wutheringWavesLoopSchema>;
export type WutheringWavesElement = {
  kind: 'camera' | 'water' | 'particle' | 'mist' | 'ripple' | 'ribbon' | 'plant';
  x: number; y: number; width: number; height: number;
  opacity: number; rotation: number; scale: number;
};

/** Each moving coordinate is periodic; drawing a frame never advances a simulation. */
export const getWutheringWavesScene = (
  props: WutheringWavesLoopProps, frame: number, durationInFrames: number,
): WutheringWavesElement[] => {
  const phase = loopPhase(frame, durationInFrames);
  const {motion} = props;
  const random = createSeededRandom(props.seed);
  const element = (kind: WutheringWavesElement['kind'], values: Partial<WutheringWavesElement>): WutheringWavesElement =>
    ({kind, x: 0, y: 0, width: 0, height: 0, opacity: 1, rotation: 0, scale: 1, ...values});
  const scene = [
    element('camera', {x: 1.5 * motion * Math.sin(phase), y: motion * Math.cos(phase), scale: 1.008}),
    element('water', {x: 24 * motion * Math.sin(phase), y: 12 * motion * Math.cos(phase), scale: 4 * motion}),
  ];
  for (let i = 0; i < 4; i++) {
    const offset = i * 1.73;
    scene.push(element('mist', {
      x: 120 + i * 490 + Math.sin(phase + offset) * 22 * motion,
      y: 740 + (i % 2) * 90 + Math.cos(phase + offset) * 6 * motion,
      width: 950, height: 90 + (i % 3) * 20,
      opacity: props.atmosphere * (0.2 + 0.035 * motion * Math.sin(phase + offset)),
    }));
  }
  for (let i = 0; i < 42; i++) {
    const offset = random() * TAU;
    const depth = random();
    scene.push(element('ripple', {
      x: randomBetween(random, 140, 1820) + Math.sin(phase + offset) * 9 * motion,
      y: 810 + depth * 260 + Math.cos(phase * 2 + offset) * 1.5 * motion,
      width: 12 + depth * 100, height: 0.5 + depth,
      opacity: props.atmosphere * (0.15 + 0.035 * motion * Math.sin(phase * 2 + offset)),
    }));
  }
  for (let i = 0; i < props.particleCount; i++) {
    const offset = random() * TAU;
    const low = i % 3 === 0;
    scene.push(element('particle', {
      x: randomBetween(random, low ? 340 : 1200, 1900) + Math.sin(phase + offset) * 8 * motion,
      y: randomBetween(random, low ? 840 : 60, low ? 1040 : 710) + Math.cos(phase + offset) * 10 * motion,
      width: randomBetween(random, 0.7, 2), height: randomBetween(random, 1, 3),
      opacity: 0.35 + 0.08 * motion * Math.sin(phase * 2 + offset),
    }));
  }
  for (let i = 0; i < 3; i++) {
    scene.push(element('ribbon', {
      x: Math.sin(phase + i) * motion * 3, y: Math.cos(phase + i) * motion * 2,
      rotation: Math.sin(phase + i) * motion * 0.3,
      opacity: props.resonance * (0.75 + 0.05 * motion * Math.sin(phase + i)),
    }));
    scene.push(element('plant', {rotation: Math.sin(phase + i * 2) * motion * 0.5}));
  }
  return scene;
};

export const getWutheringWavesUniforms = (
  props: WutheringWavesLoopProps, scene: WutheringWavesElement[], width: number, height: number,
): Uniforms => {
  const palette = props.colors.map(parseColor);
  const water = scene.find((e) => e.kind === 'water')!;
  return {
    uResolution: [width, height],
    uPalette: Array.from({length: 6}, (_, i) => palette[Math.min(i, palette.length - 1)]!)
      .flatMap(([r, g, b, a]) => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a]),
    uPaletteSize: palette.length,
    uScale: 1, uIntensity: 1, uCenterFade: props.centerShade,
    uPlateInner: [250, 200, 1090, 650], uPlateOuter: [-80, -90, 1390, 1030],
    uSeed: Math.floor(createSeededRandom(props.seed)() * 2 ** 32),
    uBackground: parseColor(props.backgroundColor).slice(0, 3).map(srgbToLinear),
    uFlow: [water.x / 24, water.y / 12],
    uAtmosphere: props.atmosphere, uResonance: props.resonance,
  };
};

export const WutheringWavesLoop = (props: WutheringWavesLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();
  const uid = useId().replace(/:/g, '');
  const id = (suffix: string) => `${uid}-ww-${suffix}`;
  const scene = getWutheringWavesScene(props, frame, durationInFrames);
  const camera = scene.find((e) => e.kind === 'camera')!;
  const ribbon = scene.find((e) => e.kind === 'ribbon')!;
  const plant = scene.find((e) => e.kind === 'plant')!;
  const [cream, cyan = cream, gold = cyan] = props.colors;
  return (
    <Canvas {...props}>
      <ShaderCanvas fragmentShader={WUTHERING_WAVES_FRAGMENT_SHADER}
        uniforms={getWutheringWavesUniforms(props, scene, width, height)} width={width} height={height} />
      <svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{position: 'absolute'}} aria-hidden="true">
        <defs>
          <linearGradient id={id('gold')} x1="0" y1="0" x2="0.7" y2="1"><stop stopColor={cream} /><stop offset="0.4" stopColor={gold} /><stop offset="0.8" stopColor="#B38748" /><stop offset="1" stopColor={cream} /></linearGradient>
          <linearGradient id={id('silk')} x1="0" y1="0" x2="1" y2="0.6"><stop stopColor={cream} stopOpacity="0.05" /><stop offset="0.45" stopColor={cream} stopOpacity="0.55" /><stop offset="1" stopColor={gold} stopOpacity="0.1" /></linearGradient>
          <radialGradient id={id('mist')}><stop stopColor={cream} stopOpacity="0.65" /><stop offset="1" stopColor="#AFCDE0" stopOpacity="0" /></radialGradient>
          <linearGradient id={id('boat')} x1="0" y1="0" x2="0.35" y2="1"><stop stopColor="#425C82" /><stop offset="0.35" stopColor="#1D2E55" /><stop offset="1" stopColor="#101835" /></linearGradient>
          <filter id={id('paper')} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed={Math.abs(props.seed % 1000)} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer><feFuncA type="linear" slope="0.11" /></feComponentTransfer>
            <feBlend in="SourceGraphic" mode="soft-light" />
          </filter>
        </defs>
        <g transform={`translate(${camera.x} ${camera.y}) translate(960 540) scale(${camera.scale}) translate(-960 -540)`}>
          <PaintedLandscape idPrefix={id('land')} seed={props.seed} />
          {scene.filter((e) => e.kind === 'mist').map((e, i) => <ellipse key={`mist-${i}`} cx={e.x} cy={e.y} rx={e.width / 2} ry={e.height / 2} fill={`url(#${id('mist')})`} opacity={e.opacity} />)}

          {/* Broad tapered cloud ribbons connect the light to the water in a single diagonal. */}
          <g transform={`translate(${ribbon.x} ${ribbon.y}) rotate(${ribbon.rotation} 1520 210)`} opacity={ribbon.opacity}>
            <path d="M1540 -45 C1420 52 1310 62 1358 136 C1391 186 1476 174 1482 117 C1484 94 1466 77 1446 91 C1437 98 1439 110 1447 114 C1422 99 1443 65 1471 75 C1535 99 1502 186 1431 194 C1324 207 1271 137 1294 89 C1323 24 1448 7 1454 -45Z" fill={`url(#${id('gold')})`} />
            <path d="M1710 -30 C1620 68 1602 146 1513 211 C1411 286 1344 290 1347 351 C1349 389 1385 399 1402 380 C1417 363 1400 346 1388 355 C1398 333 1424 350 1415 376 C1397 432 1310 401 1326 344 C1345 276 1456 244 1500 196 C1579 112 1563 32 1630 -30Z" fill={`url(#${id('silk')})`} />
            <path d="M1562 -20 C1450 88 1517 118 1535 119 C1558 120 1567 97 1556 89 C1542 79 1538 99 1546 98 C1530 88 1545 64 1567 75 C1605 99 1569 144 1534 135 C1467 118 1519 30 1562 -20Z" fill={cyan} opacity="0.75" />
            <path d="M1476 -30 C1370 53 1279 77 1317 144 C1347 197 1421 218 1489 171 M1727 -25 C1640 60 1645 140 1542 226 C1440 311 1350 293 1338 355 M1510 203 C1459 236 1431 250 1407 249" fill="none" stroke={gold} strokeWidth="1.6" />
            <path d="M1577 400 C1636 366 1647 300 1703 284 C1756 268 1811 316 1781 340 C1759 357 1737 336 1749 320 C1758 308 1774 320 1765 329 C1780 323 1770 300 1751 306 C1713 317 1740 371 1779 354 C1845 324 1784 245 1710 266 C1645 283 1648 353 1577 400Z" fill={`url(#${id('gold')})`} opacity="0.7" />
            <path d="M1080 583 C1140 551 1178 505 1171 469 C1166 443 1140 455 1148 471 C1153 479 1165 472 1160 466 C1179 472 1167 496 1152 485 C1120 462 1157 430 1179 456 C1202 483 1175 537 1139 563Z" fill={`url(#${id('silk')})`} />
          </g>

          {/* Precise, quiet gold geometry borrows the UI's material language, not its controls. */}
          <g fill="none" stroke={gold} strokeWidth="0.75" opacity="0.32">
            <path d="M1799 38 H1856 L1882 64 V350 M1874 88 V183 M1815 48 H1849" />
            <path d="M1882 369 l5 7 -5 7 -5 -7Z M1754 38 l5 4 -5 4 -5 -4Z" />
            <path d="M42 972 V1004 L66 1028 H311 M51 997 V980 M75 1019 H174" />
          </g>

          {scene.filter((e) => e.kind === 'ripple').map((e, i) => <path key={`ripple-${i}`} d={`M${e.x} ${e.y} q${e.width * 0.5} ${-e.height * 2} ${e.width} 0`} fill="none" stroke={i % 4 ? cream : cyan} strokeWidth={e.height} opacity={e.opacity} />)}

          {/* A cropped wooden hull is the dark counterweight to the high gold wash. */}
          <g transform={`translate(0 ${plant.rotation * 2})`}>
            <path d="M987 806 C1228 892 1728 870 2002 687 C1967 849 1879 963 1687 1013 C1463 1032 1221 962 1083 879Z" fill={`url(#${id('boat')})`} stroke="#101D3C" strokeWidth="5" />
            <path d="M987 806 C1288 860 1703 837 1978 706 C1749 852 1287 923 1022 836Z" fill="#111D3D" stroke="#65778F" strokeWidth="1.2" />
            <path d="M993 804 C1302 859 1685 833 1988 699" fill="none" stroke={cream} strokeWidth="1.35" opacity="0.67" />
            <path d="M1074 862 C1343 959 1760 945 1949 800 M1134 897 C1393 990 1734 982 1917 857 M1255 950 C1480 1009 1695 1007 1856 925" fill="none" stroke="#0C1834" strokeWidth="3.5" />
            <path d="M1079 859 C1346 951 1755 936 1946 797 M1148 899 C1402 982 1738 970 1911 855" fill="none" stroke="#6F87A5" strokeWidth="0.8" opacity="0.55" />
            <path d="M1247 889 Q1232 940 1268 963 M1660 883 Q1680 962 1683 1011 M1862 816 Q1880 883 1858 925" fill="none" stroke="#0B1732" strokeWidth="2" opacity="0.85" />
            <path d="M1484 954 L1683 717 1692 721 1504 972Z" fill="#202E50" stroke="#8A8F99" strokeWidth="1" />
          </g>
          <LotusGarden idPrefix={id('lotus')} sway={plant.rotation} seed={props.seed} />
          {scene.filter((e) => e.kind === 'particle').map((e, i) => <path key={`fleck-${i}`} d={`M${e.x} ${e.y} l${e.width} ${-e.height} ${e.width * 0.5} ${e.height * 1.2}Z`} fill={i % 3 === 0 ? cream : gold} opacity={e.opacity} />)}
        </g>
        {/* Stationary paper grain sits on the complete illustration, including the vector ink. */}
        <rect width="1920" height="1080" fill="transparent" filter={`url(#${id('paper')})`} style={{mixBlendMode: 'soft-light'}} />
      </svg>
    </Canvas>
  );
};
