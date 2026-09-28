import {createSeededRandom, randomBetween} from '../../loop';

type LotusGardenProps = {
  idPrefix: string;
  sway: number;
  seed?: number;
};

type LeafSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  shape: number;
  paint: 'ink' | 'blue' | 'cobalt' | 'cyan';
};

// The narrow opening at the bottom meets the vein hub. Broad, uneven lobes
// around the other edges keep the leaves legible as folded lotus fans.
const LEAF_OUTLINES = [
  'M8 22 C-3 41-15 57-31 75 C-42 82-47 66-62 73 C-78 80-84 63-94 62 ' +
    'C-110 62-103 42-119 39 C-137 35-129 20-142 9 C-153-2-135-13-143-25 ' +
    'C-156-43-132-45-131-59 C-131-75-110-68-104-84 C-98-100-77-88-65-103 ' +
    'C-53-117-34-98-20-108 C-4-120 7-97 24-108 C40-117 43-92 61-98 ' +
    'C81-106 78-80 95-82 C117-84 106-60 126-55 C144-51 128-28 141-18 ' +
    'C154-5 132 7 138 23 C143 38 122 42 116 57 C112 68 92 58 80 74 ' +
    'C65 89 53 64 39 74 C27 79 23 52 8 22Z',
  'M8 22 C-1 43-21 50-32 68 C-50 85-60 61-78 66 C-94 71-92 48-112 43 ' +
    'C-126 40-120 23-134 16 C-151 7-134-10-145-19 C-155-32-136-41-137-54 ' +
    'C-141-72-119-62-111-81 C-104-97-88-81-73-99 C-61-114-45-94-29-103 ' +
    'C-10-115-4-93 15-109 C31-122 36-96 53-103 C70-111 72-85 90-94 ' +
    'C110-104 109-76 127-75 C148-73 135-51 148-37 C162-23 137-18 150-2 ' +
    'C161 13 143 25 145 37 C148 55 119 43 113 63 C107 82 90 61 77 80 ' +
    'C64 96 46 66 30 70 C19 68 16 40 8 22Z',
  'M8 22 C-7 36-16 57-34 65 C-48 73-53 53-69 58 C-89 64-92 41-107 45 ' +
    'C-124 48-116 26-134 21 C-151 18-133-6-143-16 C-155-29-132-37-139-52 ' +
    'C-144-66-118-63-115-80 C-110-95-93-82-78-93 C-64-106-49-87-35-103 ' +
    'C-19-118-10-92 7-103 C23-114 30-86 49-96 C69-106 71-81 88-83 ' +
    'C104-86 101-65 120-68 C142-72 132-46 144-39 C160-30 141-11 149 0 ' +
    'C160 18 135 24 137 37 C139 54 118 44 107 64 C98 80 82 63 70 74 ' +
    'C56 87 43 63 28 63 C19 59 17 40 8 22Z',
] as const;

const VEIN_TIPS = [
  [-126, 12], [-128, -25], [-116, -57], [-93, -79], [-64, -94],
  [-28, -100], [8, -101], [43, -95], [77, -82], [111, -60],
  [131, -30], [135, 2], [121, 30], [95, 53], [64, 64],
] as const;

// Back to front: high leaves lean toward the corner, with cropped foreground
// fans covering their stems. The open center remains above and left of them.
const FOREGROUND_LEAVES: readonly LeafSlot[] = [
  {x: 1746, y: 974, width: 1.14, height: 1.14, angle: -27, shape: 1, paint: 'blue'},
  {x: 1939, y: 1003, width: 1.31, height: 1.3, angle: 24, shape: 0, paint: 'cobalt'},
  {x: 1430, y: 1031, width: 1.02, height: 0.82, angle: -11, shape: 2, paint: 'blue'},
  {x: 1614, y: 1045, width: 1.12, height: 1.01, angle: 13, shape: 0, paint: 'cobalt'},
  {x: 1906, y: 1092, width: 1.28, height: 0.85, angle: -17, shape: 2, paint: 'ink'},
  {x: 1767, y: 1124, width: 1.4, height: 1.08, angle: -6, shape: 1, paint: 'ink'},
  {x: 1392, y: 1138, width: 1.07, height: 0.83, angle: 19, shape: 1, paint: 'ink'},
];

const DISTANT_LEAVES: readonly LeafSlot[] = [
  {x: 576, y: 1048, width: 0.27, height: 0.105, angle: -7, shape: 2, paint: 'cyan'},
  {x: 708, y: 1008, width: 0.23, height: 0.14, angle: -19, shape: 1, paint: 'cyan'},
  {x: 794, y: 1069, width: 0.3, height: 0.12, angle: -3, shape: 0, paint: 'cyan'},
  {x: 934, y: 1029, width: 0.21, height: 0.12, angle: 9, shape: 2, paint: 'cyan'},
  {x: 1066, y: 1058, width: 0.29, height: 0.115, angle: -13, shape: 1, paint: 'cyan'},
];

const LotusLeaf = ({slot, index, idPrefix, sway, seed}: {
  slot: LeafSlot;
  index: number;
  idPrefix: string;
  sway: number;
  seed: number;
}) => {
  const random = createSeededRandom(seed + index * 109);
  const clipId = `${idPrefix}-leaf-${index}`;
  const outline = LEAF_OUTLINES[slot.shape % LEAF_OUTLINES.length]!;
  const distant = slot.paint === 'cyan';
  const angle = slot.angle + sway * (distant ? 0.9 : 0.38) * (index % 2 ? 1 : -1);
  const veins = VEIN_TIPS.map(([x, y], veinIndex) => {
    const bend = randomBetween(random, -11, 11);
    return {
      main: `M8 22 C${x * 0.23 + bend} ${19 + y * 0.22} ${x * 0.65 - bend} ${y * 0.68} ${x} ${y}`,
      branch: `M${x * 0.55} ${13 + (y - 13) * 0.55} Q${x * 0.69 + 8} ${y * 0.64 + 7} ${x * 0.85 + 10} ${y * 0.76 + 5}`,
      strength: veinIndex % 3 === 0 ? 0.48 : 0.27,
    };
  });
  const hatching = Array.from({length: distant ? 0 : 43}, () => {
    const direction = randomBetween(random, -Math.PI, 0.6);
    const reach = randomBetween(random, 33, 132);
    const x = 8 + Math.cos(direction) * reach;
    const y = 22 + Math.sin(direction) * reach * 0.78;
    const length = randomBetween(random, 4, 17);
    return `M${x} ${y} q${Math.cos(direction) * length * 0.4} ${Math.sin(direction) * length * 0.6 - 2} ${Math.cos(direction) * length} ${Math.sin(direction) * length * 0.8}`;
  }).join(' ');

  return (
    <g transform={`translate(${slot.x} ${slot.y}) rotate(${angle}) scale(${slot.width} ${slot.height})`}>
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse"><path d={outline} /></clipPath>
      </defs>
      <path d={outline} fill={`url(#${idPrefix}-${slot.paint})`} stroke="#111A43"
        strokeWidth={distant ? 3 : 1.7} strokeLinejoin="round" />
      <g clipPath={`url(#${clipId})`}>
        <path d="M8 22 Q-73-4-116-65 L-170-17-150 83-32 90Z" fill="#111A43" opacity="0.23" />
        <path d="M8 22 Q18-44 48-110 L83-99 Q44-36 8 22Z" fill="#2367A1" opacity="0.2" />
        <path d="M8 22 Q80-30 140-47 L154-13 Q80-9 8 22Z" fill="#234CB0" opacity="0.25" />
        <path d="M8 22 Q65 28 100 69 L62 101 25 67Z" fill="#111A43" opacity="0.29" />
        <g fill="none" strokeLinecap="round">
          {veins.map((vein, veinIndex) => (
            <g key={veinIndex}>
              <path d={vein.main} stroke="#111A43" strokeWidth={distant ? 2.8 : 1.6} opacity="0.64" />
              <path d={vein.main} stroke={distant ? '#33B6C6' : '#5484B8'}
                strokeWidth={distant ? 1.3 : 0.65} opacity={vein.strength} transform="translate(0 -1.1)" />
              {!distant && <path d={vein.branch} stroke="#5082AF" strokeWidth="0.55" opacity="0.24" />}
            </g>
          ))}
          <path d={hatching} stroke="#4F80B7" strokeWidth="0.7" opacity="0.24" />
          <path d="M-131-28 Q-138-43-123-56 M-94-88 Q-80-82-67-97 M-27-105 Q-10-97 0-105 M68-91 Q79-79 93-82 M118-56 Q134-48 131-34"
            stroke={distant ? '#70D2D4' : '#4282B6'} strokeWidth="1.25" opacity="0.55" />
        </g>
      </g>
      <path d="M-3 20 Q7 13 18 23 Q11 31-3 20Z" fill={distant ? '#2367A1' : '#111A43'} />
      <path d="M-3 20 Q7 16 16 23" stroke={distant ? '#70D2D4' : '#6293B6'} strokeWidth="0.8" fill="none" opacity="0.75" />
    </g>
  );
};

const LotusFlower = ({idPrefix, sway}: {idPrefix: string; sway: number}) => (
  <g transform={`translate(${1510 + sway * 0.8} 937) rotate(${sway * 0.5})`} stroke="#3D3972" strokeLinejoin="round">
    <path d="M0 9 C-10-9-17-23-15-47 C-1-35 8-14 7 5Z" fill="#7770B9" strokeWidth="1.2" />
    <path d="M-3 10 C-22-6-35-17-42-34 C-20-30-6-15 4 6Z" fill="#7770B9" strokeWidth="1.1" />
    <path d="M2 9 C5-14 20-35 28-39 C30-14 20 1 8 11Z" fill="#B4A3CF" strokeWidth="1.2" />
    <path d="M-4 12 C-26 12-45-2-51-18 C-25-19-11-4 4 7Z" fill={`url(#${idPrefix}-petal)`} strokeWidth="1.1" />
    <path d="M3 12 C23-10 39-16 48-15 C41 3 20 14 5 15Z" fill="#7770B9" strokeWidth="1.3" />
    <path d="M-2 14 C-15-2-12-24-7-31 C6-16 13-2 7 12Z" fill={`url(#${idPrefix}-petal)`} strokeWidth="1.1" />
    <path d="M1 16 C-17 18-32 13-41 2 C-19-1-7 4 4 11Z" fill="#7770B9" strokeWidth="1.1" />
    <path d="M0 15 C12 0 29-3 39 1 C30 15 12 19 0 15Z" fill="#B4A3CF" strokeWidth="1.1" />
    <g fill="none" stroke="#C5B6DC" strokeWidth="0.6" opacity="0.68">
      <path d="M-1 8 Q-5-12-12-35 M7 9 Q17-9 23-28 M-4 8 Q-24-10-41-14 M7 12 Q21 6 30 5" />
    </g>
    <path d="M-7 17 Q1 20 10 16 L2 23Z" fill="#2367A1" strokeWidth="1" />
  </g>
);

/** Illustrated garden in the scene's fixed 1920 × 1080 SVG coordinate space. */
export const LotusGarden = ({idPrefix, sway, seed = 1403}: LotusGardenProps) => (
  <g data-artwork="lotus-garden">
    <defs>
      <linearGradient id={`${idPrefix}-ink`} x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0" stopColor="#1D3064" /><stop offset="0.5" stopColor="#111A43" /><stop offset="1" stopColor="#0D1638" />
      </linearGradient>
      <linearGradient id={`${idPrefix}-blue`} x1="0.05" y1="0" x2="0.7" y2="1">
        <stop offset="0" stopColor="#2367A1" /><stop offset="0.48" stopColor="#234CB0" /><stop offset="1" stopColor="#111A43" />
      </linearGradient>
      <linearGradient id={`${idPrefix}-cobalt`} x1="0.1" y1="0" x2="0.8" y2="1">
        <stop offset="0" stopColor="#234CB0" /><stop offset="0.56" stopColor="#1D3064" /><stop offset="1" stopColor="#111A43" />
      </linearGradient>
      <linearGradient id={`${idPrefix}-cyan`} x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor="#33B6C6" /><stop offset="0.7" stopColor="#2BA8BF" /><stop offset="1" stopColor="#2367A1" />
      </linearGradient>
      <linearGradient id={`${idPrefix}-petal`} x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0" stopColor="#B4A3CF" /><stop offset="1" stopColor="#7770B9" />
      </linearGradient>
    </defs>
    <g fill="none" strokeLinecap="round">
      <path d={`M573 1100 Q589 1078 ${576 + sway * 0.25} 1050 M706 1093 Q719 1047 ${708 - sway * 0.5} 1011 M932 1100 Q948 1065 ${934 + sway * 0.25} 1031`}
        stroke="#2367A1" strokeWidth="2" />
      <path d="M568 1074 Q586 1077 610 1072 M773 1080 Q807 1084 828 1079 M1035 1072 Q1066 1077 1093 1070"
        stroke="#33B6C6" strokeWidth="1.3" opacity="0.34" />
      <path d={`M1477 1091 C1510 1044 1498 991 ${1510 + sway * 0.8} 953`} stroke="#111A43" strokeWidth="3.2" />
      <path d={`M1479 1091 C1512 1044 1500 991 ${1512 + sway * 0.8} 953`} stroke="#2367A1" strokeWidth="0.9" />
    </g>
    {DISTANT_LEAVES.map((slot, index) => (
      <LotusLeaf key={`distant-${index}`} slot={slot} index={index} idPrefix={idPrefix} sway={sway} seed={seed} />
    ))}
    {FOREGROUND_LEAVES.map((slot, index) => (
      <LotusLeaf key={`foreground-${index}`} slot={slot} index={index + DISTANT_LEAVES.length}
        idPrefix={idPrefix} sway={sway} seed={seed} />
    ))}
    <LotusFlower idPrefix={idPrefix} sway={sway} />
  </g>
);
