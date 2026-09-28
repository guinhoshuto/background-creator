import {createSeededRandom, randomBetween, TAU} from '../../loop';

// Deck and railing share this quadratic. Every post meets both curves exactly.
const bridgePoint = (t: number) => ({
  x: (1 - t) ** 2 * 150 + 2 * (1 - t) * t * 365 + t ** 2 * 582,
  y: (1 - t) ** 2 * 989 + 2 * (1 - t) * t * 880 + t ** 2 * 849,
});

const Eaves = ({x, y, scale = 1, opacity = 1}: {x: number; y: number; scale?: number; opacity?: number}) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
    <path d="M-78 12 H78 V172 H-78Z" fill="#345C7E" />
    <path d="M-71 20 H68 V153 H-71Z" fill="#213F65" />
    <path d="M-62 25 H-47 V153 H-62Z M-8 25 H8 V153 H-8Z M47 25 H62 V153 H47Z" fill="#73929F" opacity="0.6" />
    <path d="M-113 170 H114 L120 183 H-120Z" fill="#345C7E" />
    <path d="M-123 162 H126 V173 H-123Z M-120 181 H120 V188 H-120Z" fill="#48677E" />
    <path d="M-181 7 C-118 13 -111 -2 -79 -15 L-13 -73 L0 -93 L13 -73 L79 -15 C108 -4 133 12 181 7 L151 29 C112 33 104 23 86 19 L-83 19 C-105 24 -127 32 -151 29Z" fill="#1C3D62" />
    <path d="M-180 7 C-110 13 -94 -29 -13 -73 L0 -93 L13 -73 C80 -36 112 10 180 7" fill="none" stroke="#B9B9A5" strokeWidth="2.3" opacity="0.6" />
    <path d="M-160 22 Q0 1 160 22 M-91 12 L-11 -65 M-45 7 L-6 -65 M42 7 L7 -65 M91 12 L12 -65" fill="none" stroke="#6A8996" strokeWidth="1.2" opacity="0.7" />
    <path d="M-90 161 V115 H90 V161 M-84 128 H84 M-66 119 V150 M-39 119 V150 M-12 119 V150 M15 119 V150 M42 119 V150 M69 119 V150" fill="none" stroke="#96A4A5" strokeWidth="2" opacity="0.4" />
  </g>
);

/** Cropped ink forms keep the visual weight on the perimeter and waterline. */
export const PaintedLandscape = ({idPrefix, seed}: {idPrefix: string; seed: number}) => {
  const random = createSeededRandom(seed + 411);
  const canopies = [
    [-22, 758, 115, 28], [35, 731, 81, 23], [110, 712, 72, 21], [183, 733, 71, 20],
    [238, 766, 58, 20], [95, 776, 85, 26], [-22, 806, 73, 25], [33, 842, 57, 18],
    [163, 790, 67, 20], [286, 746, 41, 14], [293, 812, 46, 19], [198, 843, 69, 20],
    [336, 794, 31, 13], [60, 689, 47, 19], [-5, 670, 59, 24],
  ];
  return (
    <g>
      <defs>
        <linearGradient id={`${idPrefix}-far`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#3D6487" stopOpacity="0.8" /><stop offset="1" stopColor="#779FB5" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${idPrefix}-stone`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#456990" /><stop offset="1" stopColor="#152A51" /></linearGradient>
        <linearGradient id={`${idPrefix}-pine`} x1="0" y1="0" x2="0.5" y2="1"><stop stopColor="#193B63" /><stop offset="1" stopColor="#121E46" /></linearGradient>
      </defs>

      {/* Distant layered banks fade into the pale horizontal mist. */}
      <path d="M-50 722 L13 658 34 671 83 610 124 625 189 535 227 579 272 570 335 649 404 634 485 713 571 691 646 747 726 742 790 800 H-50Z" fill={`url(#${idPrefix}-far)`} opacity="0.33" />
      <path d="M1056 743 L1150 661 1214 680 1322 566 1360 590 1400 540 1460 613 1545 572 1656 663 1795 607 1900 653 1960 731 V869 H1056Z" fill={`url(#${idPrefix}-far)`} opacity="0.36" />
      <path d="M-50 817 L68 789 126 802 216 763 300 771 373 734 402 742 472 791 587 772 671 806 872 824 962 861 H-50Z" fill="#6385A3" opacity="0.38" />
      <path d="M1192 816 L1378 752 1494 767 1545 728 1644 743 1718 695 1804 718 1891 668 1960 709 V870 H1192Z" fill="#486A91" opacity="0.5" />

      {/* A partial waterside hall: curved eaves, timber rhythm and open galleries. */}
      <g opacity="0.58">
        <Eaves x={1698} y={469} scale={1.08} />
        <Eaves x={1698} y={369} scale={0.76} />
        <Eaves x={1698} y={287} scale={0.48} />
        <path d="M1653 660 L1641 757 H1781 L1753 660Z" fill="#325A7E" />
        <path d="M1624 744 H1801 L1824 758 H1605Z" fill="#718C9D" opacity="0.7" />
        <Eaves x={1922} y={608} scale={1.1} />
      </g>
      {/* A visible far landing gives the crossing a destination and carries the small halls. */}
      <g opacity="0.74">
        <path d="M481 887 L516 875 548 868 567 849 620 847 648 861 675 860 724 882 699 901 647 912 608 908 566 917 532 901Z" fill="#52748F" />
        <path d="M494 887 L541 877 569 865 621 861 650 870 675 869 705 882 M565 875 L589 890 576 908 M650 882 L642 905" fill="none" stroke="#91A9B5" strokeWidth="1.2" opacity="0.55" />
        <Eaves x={577} y={809} scale={0.27} />
        <Eaves x={642} y={829} scale={0.19} />
        <path d="M550 870 Q573 864 603 866" fill="none" stroke="#9BB0B7" strokeWidth="2" opacity="0.6" />
        <path d="M532 916 Q619 931 711 904 M563 925 Q646 933 699 920" fill="none" stroke="#8DAFC2" strokeWidth="1.3" opacity="0.45" />
      </g>

      {/* Continuous masonry arch, with the near abutment occluded by the foreground bank. */}
      <g opacity="0.79">
        <path d="M150 989 Q365 880 582 849 L587 878 542 908 514 918 C472 891 322 947 278 1013 L246 1024 150 1012Z" fill="#3D607F" />
        <path d="M151 999 Q365 890 585 858 L587 866 Q365 899 152 1006Z" fill="#6C8CA3" opacity="0.7" />
        <path d="M278 1013 C322 947 472 891 514 918" fill="none" stroke="#9BB0BA" strokeWidth="1.7" opacity="0.65" />
        <path d="M298 987 l-7 -12 M338 950 l-6 -13 M385 929 l-3 -12 M435 911 v-13 M478 907 l5 -17 M516 903 l10 -22" fill="none" stroke="#274F73" strokeWidth="1.3" opacity="0.65" />
        <g fill="none" stroke="#446486">
          <path d="M150 989 Q365 880 582 849" strokeWidth="5" />
          <path d="M150 959 Q365 856 582 831" strokeWidth="2.5" />
          {Array.from({length: 11}, (_, i) => {
            const t = i / 10;
            const {x, y} = bridgePoint(t);
            const railY = y - (30 - 12 * t);
            return <path key={i} d={`M${x} ${y + 2} V${railY - 5} M${x - 3} ${railY - 2} H${x + 3}`} strokeWidth={3.4 - t * 1.5} />;
          })}
        </g>
      </g>
      <path d="M-50 1089 L-21 1021 44 998 80 1003 142 976 186 998 264 979 329 1018 373 1031 404 1058 507 1089Z" fill={`url(#${idPrefix}-stone)`} />
      <path d="M9 1028 L58 1015 92 1028 143 992 166 1012 147 1029 213 1018 188 1048 265 1021 303 1044 333 1035 362 1061" fill="none" stroke="#80A0B7" strokeWidth="1.3" opacity="0.65" />
      <path d="M84 1082 L88 1051 136 1025 150 1007 157 957 141 922 149 864 106 812 83 742 64 692 78 747 135 796 158 823 172 852 168 896 197 929 202 972 190 1007 210 1041 236 1056 263 1083Z" fill={`url(#${idPrefix}-pine)`} />
      <g fill="none" stroke="#1D3258" strokeLinecap="round">
        <path d="M157 851 Q126 814 77 808 L-15 776 M155 855 Q196 819 246 812 L317 799 M157 806 Q188 778 246 766 L290 748 M116 779 Q128 733 167 728 M140 929 Q80 898 32 839" strokeWidth="8" />
        <path d="M139 910 Q168 853 201 844 L244 840 M123 801 Q52 792 -2 751 M144 837 Q88 759 34 723 L8 676" strokeWidth="5" />
      </g>
      <path d="M119 1050 Q164 1013 169 973 T154 901 Q172 872 146 828 L104 781 M194 1038 L183 1004 Q197 974 178 944 M142 807 Q177 778 227 774" fill="none" stroke="#7997AA" strokeWidth="1.6" opacity="0.4" />
      <g fill={`url(#${idPrefix}-pine)`}>
        {canopies.map(([cx, cy, rx, ry], i) => {
          const points = Array.from({length: 86}, (_, k) => {
            const a = k / 86 * TAU;
            const r = randomBetween(random, 0.83, 1.17);
            return `${cx! + Math.cos(a) * rx! * r},${cy! + Math.sin(a) * ry! * r - 5 * Math.sin(a * 5)}`;
          }).join(' ');
          return <g key={i}>
            <polygon points={points} />
            {Array.from({length: 16}, (_, k) => {
              const x = cx! + randomBetween(random, -rx! * 0.8, rx! * 0.8);
              const y = cy! + randomBetween(random, -ry! * 0.6, ry! * 0.65);
              return <path key={k} d={`M${x - 7} ${y + 3} l6 -9 1 6 4 -12 1 13 6 -7 2 8`} fill="none" stroke="#63889E" strokeWidth="0.8" opacity="0.27" />;
            })}
          </g>;
        })}
      </g>

      {/* A few fragments soften the otherwise exact vector edges like dry ink. */}
      {Array.from({length: 110}, (_, i) => {
        const x = randomBetween(random, -10, 360);
        const y = randomBetween(random, 690, 880);
        return <path key={i} d={`M${x} ${y} l${randomBetween(random, 1, 4)} -2 -1 5Z`} fill="#315A80" opacity="0.3" />;
      })}
    </g>
  );
};
