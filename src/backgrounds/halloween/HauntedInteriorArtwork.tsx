interface HauntedInteriorArchitectureProps {
  moonlight: string;
  candle: string;
  atmosphere: string;
  transparent: boolean;
}

const windowOpening = 'M-91 687V308C-91 250-50 213 0 179C50 213 91 250 91 308V687Z';

const PlasterScars = () => (
  <g>
    <g fill="#111c1c" opacity="0.58">
      <path d="M302 187l45 8 19 24-8 39-18 8 5 27-24 9-9-23-26 6-9-43 20-13Z" />
      <path d="M490 282l-21 19 7 30-15 7 11 28-4 31 25 29 15-23-9-30 13-14-12-24Z" />
      <path d="M66 448l30 7-3 26-14 19 2 25-29 11-12-31 20-18Z" />
      <path d="M320 561l24 12-7 31 18 23-13 18-18-12-21 9-9-20 14-17-2-21Z" />
      <path d="M443 182l17-4 19 17-10 11-16-8-9 16-10-9Z" />
      <path d="M311 713l35 8 13 21-17 16-16-6-10 17-17-12 11-24Z" />
    </g>
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M339 190l-8 27 10 17-17 28 8 21-12 22m11-88 19 5 10 19m-36 21-14-4-12 13" stroke="#667169" strokeWidth="1.3" opacity="0.18" />
      <path d="M468 264l-11 46 15 20-14 31 12 17-9 36m-4-104-22 11-7 20m30 20-21 4-11 22" stroke="#080f10" strokeWidth="3" opacity="0.8" />
      <path d="M303 537l13 30-11 21 18 28-13 25 9 31m-14-84-22 3-10 24m50 1 22 5 11 18" stroke="#080f10" strokeWidth="2.4" />
      <path d="M390 204l8 26-7 15 9 17-3 33m-6-50-17 4-8 15" stroke="#090e10" strokeWidth="2" />
      <path d="M57 582l21 12-7 22 19 25-5 24m-14-49-12 8-2 18" stroke="#56625c" strokeWidth="1.2" opacity="0.25" />
      <path d="M276 752l21 4 10-9 27 6 14-6 24 5M483 617l-7 18 9 12-9 21 4 31" stroke="#626a5e" strokeWidth="1.1" opacity="0.24" />
    </g>
  </g>
);

const WindowAndDrapery = () => (
  <g transform="translate(173 0)">
    {/* A deeply recessed lancet window, with the glass deliberately uneven. */}
    <path d="M-112 714V303C-112 227-47 178 0 142C47 178 112 227 112 303V714Z" fill="#101715" stroke="#42473b" strokeWidth="5" />
    <path d="M-102 703V304C-102 236-49 195 0 159C49 195 102 236 102 304V703Z" fill="#080e10" stroke="#777765" strokeOpacity="0.2" strokeWidth="2" />
    <path d={windowOpening} fill="url(#hi-art-glass)" />
    <g clipPath="url(#hi-art-window-clip)">
      <path d="M-86 291L0 220 0 386-86 439ZM10 228l74 70v133L10 377Z" fill="#d2f0db" opacity="0.06" />
      <path d="M-85 449L-9 405v155l-76 76ZM10 405l76 46v132l-76-37Z" fill="#899e97" opacity="0.06" />
      <path d="M-71 207L86 634M-119 378L36 690M26 204L104 415" stroke="#b5d2c2" strokeWidth="14" opacity="0.045" />
      <path d="M-109 598l44-26 35 17 37-23 25 17 53-23 22 145H-109Z" fill="#111d1c" opacity="0.6" />
      <path d="M-59 341l23 20-12 34 26 21-9 37m55-179-20 38 9 20-18 23m58 180-25 18 8 40-30 16" stroke="#263735" strokeWidth="1.8" fill="none" />
      <g fill="none" stroke="#152423" strokeWidth="6">
        <path d="M0 179v512M-90 398H90M-90 567H90" />
        <path d="M-90 307Q-63 265-46 269Q-20 276 0 326Q20 276 46 269Q63 265 90 307" />
        <path d="M-46 269v422M46 269v422" />
        <path d="M-80 398l35-47 45 47 45-47 35 47M-90 567l45-46 45 46 45-46 45 46" strokeWidth="3" />
      </g>
      <path d="M-91 684h182" stroke="#89988a" strokeWidth="3" opacity="0.16" />
    </g>
    <path d="M-105 693H106l17 18-2 10H-122v-10Z" fill="#3e4135" />
    <path d="M-117 710H117M-99 696H99" stroke="#8d8b70" strokeWidth="2" opacity="0.24" />
    <path d="M-91 726l14 19h154l14-19" fill="#141c18" stroke="#4d5243" strokeWidth="2" />

    {/* Heavy velvet has split into pointed strips along its lower edge. */}
    <path d="M-136 124Q-81 145 0 146Q87 143 137 119L128 201Q105 212 75 212L70 240Q55 210 37 205L28 226 20 196Q-33 190-65 211L-72 232-88 208-120 214Z" fill="url(#hi-art-curtain)" />
    <path d="M-131 147Q-86 182-8 173Q60 180 128 140M-125 164Q-90 199-64 197M69 193Q104 179 128 157" fill="none" stroke="#77434a" strokeWidth="3" opacity="0.22" />
    <path d="M-138 146Q-109 171-79 187Q-92 335-99 441Q-96 523-118 605L-122 653-133 639-144 702-148 626-164 667-171 593Q-159 387-165 206Z" fill="url(#hi-art-curtain)" />
    <path d="M138 146Q109 171 79 187Q98 337 94 425Q90 483 108 535L117 616 126 590 135 651 144 595 153 639 167 583Q148 396 161 213Z" fill="url(#hi-art-curtain)" />
    <g fill="none" strokeLinecap="round">
      <path d="M-128 171Q-122 331-130 462T-145 594M-101 191Q-117 354-111 429T-129 587M128 170Q118 347 127 467T143 585M103 192Q115 337 110 422T124 566" stroke="#743f48" strokeWidth="3" opacity="0.25" />
      <path d="M-146 183Q-137 355-147 500M145 195Q132 391 149 535" stroke="#090f13" strokeWidth="9" opacity="0.48" />
      <path d="M-102 438l-34 10-19-6M98 429l34 8 20-4" stroke="#6d5b40" strokeWidth="5" opacity="0.7" />
      <path d="M-139 448l2 30-9 29m279-70 6 30-6 21" stroke="#645339" strokeWidth="2" />
    </g>
  </g>
);

const Wainscot = () => (
  <g>
    <path d="M0 740L554 785V899L0 1080Z" fill="url(#hi-art-wood)" />
    <path d="M0 728L554 775v18L0 756Z" fill="#41433a" />
    <path d="M0 742L554 785M0 730L554 776M0 1027L554 881M0 1044L554 890" fill="none" stroke="#919076" strokeWidth="2" opacity="0.16" />
    {[0, 1, 2, 3, 4, 5].map((index) => {
      const x = 25 + index * 89;
      const top = 766 + index * 6.9;
      const bottom = 1008 - index * 22;
      return (
        <g key={index}>
          <path d={`M${x} ${top}l66 5v${bottom - top - 25}l-66 17Z`} fill="#18201c" stroke="#59604d" strokeWidth="2" strokeOpacity="0.45" />
          <path d={`M${x + 9} ${top + 15}l46 3v${bottom - top - 50}l-46 11Z`} fill="#111a18" stroke="#050e0e" strokeWidth="4" />
          <path d={`M${x + 13} ${top + 20}l37 3m-38-2v${bottom - top - 62}`} fill="none" stroke="#6a715c" strokeWidth="1" opacity="0.25" />
          <path d={`M${x + 28} ${top + 40}q-11 32 1 53t-2 48`} fill="none" stroke="#73806a" strokeWidth="1" opacity="0.07" />
        </g>
      );
    })}
    <path d="M335 776l5 60-13 24 7 77M340 836l17 11 1 26" fill="none" stroke="#070e0d" strokeWidth="4" />
    <path d="M0 1027L552 884v16L0 1080Z" fill="#070f10" />
  </g>
);

const Portrait = ({ x, variant }: { x: number; variant: number }) => (
  <g transform={`translate(${x} 455)`}>
    <path d="M-5-136Q-12-149 0-154Q13-148 6-135M-9-138l-14-11m32 11 14-11" fill="none" stroke="#5f6250" strokeWidth="3" />
    <path d="M-1-136l-32 28m34-28 32 28" stroke="#262e26" fill="none" />
    <ellipse rx="82" ry="133" fill="#050b0c" opacity="0.7" transform="translate(5 8)" />
    <ellipse rx="78" ry="128" fill="url(#hi-art-frame)" stroke="#111a17" strokeWidth="5" />
    <ellipse rx="69" ry="118" fill="#111b19" stroke="#8b8060" strokeWidth="2" strokeOpacity="0.6" />
    <ellipse rx="63" ry="112" fill="#24302a" stroke="#080e0f" strokeWidth="5" />
    <ellipse rx="60" ry="109" fill="url(#hi-art-portrait)" />
    <g clipPath="url(#hi-art-portrait-clip)">
      <path d="M-57 104Q-57 55-35 41L-19 29H19L34 42Q63 63 57 114Z" fill="#0a1113" />
      <path d="M-19 24L-25 45-4 64 22 42 15 23Z" fill="#3e4941" />
      <path d="M-23 44l18 25-8 42h-31L-37 59Zm45-2L-5 69 8 111h34L37 60Z" fill="#1e2826" />
      <path d="M-7 62l-7 47M-37 58l19 14-14 29m69-42-18 14 14 24" fill="none" stroke="#697266" strokeWidth="1.2" opacity="0.19" />
      {variant === 0 ? (
        <path d="M-35 5Q-43-38-23-63Q-4-83 21-62Q41-49 32-9L40 35 22 37 13 9H-15L-24 40-41 33Z" fill="#0c1515" />
      ) : (
        <path d="M-34-15Q-40-45-23-65L-34-67Q-7-85 20-66Q43-53 35-22L22-7-23 1Z" fill="#0c1515" />
      )}
      <path d="M-25-40Q-13-55 8-51L24-36 21-9Q15 16 0 20Q-19 14-24-10Z" fill="url(#hi-art-face)" />
      <path d="M-25-40Q-18-61 4-55L27-36 16-38 1-47-14-40Z" fill="#121c1c" />
      <path d="M-22-21Q-12-29-5-20L-7-14-20-13ZM6-20Q15-29 24-21L20-13 7-14Z" fill="#141d1c" />
      <path d="M0-21l-5 22 9 1M-10 9Q0 6 11 9" fill="none" stroke="#182320" strokeWidth="2" />
      <path d="M-20-3Q-15 9-7 13M17-4 10 12" fill="none" stroke="#768273" strokeWidth="1" opacity="0.25" />
      <path d="M-62-83l18 52-6 40 19 54-6 34m55-192-9 38 8 21-14 53 12 54m-73-77 109 17m-107 53 80-16" fill="none" stroke="#85907b" strokeWidth="0.8" opacity="0.13" />
      <path d="M-61 49l10 7-2 14 12 11-7 21-18 5M42-78l12 18-4 26 11 22 5-81" fill="#73796a" opacity="0.1" />
    </g>
    <g fill="none" stroke="#928363" strokeWidth="1" opacity="0.4">
      <path d="M-21-120Q-13-111-3-121Q0-129 3-121Q13-111 21-120M-22 120Q-10 110 0 125Q10 110 22 120" />
      <path d="M-74-30q12 10 0 21q-9 10 0 21m148-42q-12 10 0 21q9 10 0 21" />
      <path d="M-44-100q10 2 11-10m77 10q-10 2-11-10M-48 97q8-2 10 12m86-12q-8-2-10 12" />
    </g>
    <path d="M-16 137h32l-4 9h-24Z" fill="#494b3c" />
    <path d="M-8 140H8" stroke="#aaa083" strokeWidth="1" opacity="0.2" />
  </g>
);

const CornerCobweb = ({ right }: { right: boolean }) => (
  <g transform={right ? 'translate(1920 0) scale(-1 1)' : undefined} fill="none" stroke="#a4b3a4" strokeWidth="1" opacity="0.19">
    <path d="M40 68L303 154M40 68L275 250M40 68L200 323M40 68L107 334M40 68L40 325" />
    <path d="M41 120Q61 119 64 140Q87 131 99 155Q117 145 132 141Q137 121 155 105" />
    <path d="M40 173Q79 163 85 216Q114 198 139 225Q169 208 179 186Q182 143 211 124" />
    <path d="M40 232Q84 214 99 270Q148 249 168 270Q204 239 222 221Q230 174 258 139" />
    <path d="M40 295Q90 268 106 325Q165 303 192 311Q237 269 266 247Q271 191 292 150" />
    <path d="M266 247v88" opacity="0.6" />
    <ellipse cx="266" cy="338" rx="2.4" ry="4" fill="#141d1c" stroke="#738275" />
    <path d="M264 336l-6-3m6 6-7 3m11-6 6-3m-6 6 7 3" strokeWidth="0.9" />
  </g>
);

/** Static architecture; animation is supplied by the parent composition. */
export const HauntedInteriorArchitecture = ({
  moonlight,
  candle,
  atmosphere,
  transparent,
}: HauntedInteriorArchitectureProps) => (
  <g>
    <defs>
      <linearGradient id="hi-art-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#17211f" />
        <stop offset="0.38" stopColor="#26312a" />
        <stop offset="1" stopColor="#111a18" />
      </linearGradient>
      <radialGradient id="hi-art-center" cx="50%" cy="42%" r="70%">
        <stop offset="0" stopColor={atmosphere} stopOpacity="0.09" />
        <stop offset="0.55" stopColor="#111e1e" stopOpacity="0.05" />
        <stop offset="1" stopColor="#060c0e" stopOpacity="0.82" />
      </radialGradient>
      <linearGradient id="hi-art-depth" x1="0" y1="0" x2="0.18" y2="1">
        <stop offset="0" stopColor="#080f12" />
        <stop offset="0.57" stopColor="#111c1d" />
        <stop offset="1" stopColor="#1a2725" />
      </linearGradient>
      <linearGradient id="hi-art-side" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#0b1315" />
        <stop offset="0.4" stopColor="#334137" />
        <stop offset="1" stopColor="#1b2620" />
      </linearGradient>
      <linearGradient id="hi-art-glass" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stopColor={moonlight} stopOpacity="0.46" />
        <stop offset="0.55" stopColor={moonlight} stopOpacity="0.16" />
        <stop offset="1" stopColor="#132524" />
      </linearGradient>
      <linearGradient id="hi-art-curtain" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#180f18" />
        <stop offset="0.34" stopColor="#43232d" />
        <stop offset="0.58" stopColor="#291a23" />
        <stop offset="0.78" stopColor="#40222b" />
        <stop offset="1" stopColor="#100f15" />
      </linearGradient>
      <linearGradient id="hi-art-wood" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stopColor="#252b23" />
        <stop offset="1" stopColor="#0d1615" />
      </linearGradient>
      <linearGradient id="hi-art-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#141e1c" />
        <stop offset="0.62" stopColor="#273029" />
        <stop offset="1" stopColor="#111a18" />
      </linearGradient>
      <linearGradient id="hi-art-frame" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6f6d53" />
        <stop offset="0.35" stopColor="#424638" />
        <stop offset="0.7" stopColor="#67624b" />
        <stop offset="1" stopColor="#242c25" />
      </linearGradient>
      <radialGradient id="hi-art-portrait" cx="46%" cy="38%" r="67%">
        <stop offset="0" stopColor="#414c3c" />
        <stop offset="1" stopColor="#101b19" />
      </radialGradient>
      <linearGradient id="hi-art-face" x1="0" y1="0" x2="1" y2="0.2">
        <stop offset="0" stopColor="#667260" />
        <stop offset="0.55" stopColor="#535f50" />
        <stop offset="1" stopColor="#29382f" />
      </linearGradient>
      <linearGradient id="hi-art-column" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#111a18" />
        <stop offset="0.35" stopColor="#4a5040" />
        <stop offset="0.52" stopColor="#343e32" />
        <stop offset="1" stopColor="#131e19" />
      </linearGradient>
      <pattern id="hi-art-damask" width="82" height="126" patternUnits="userSpaceOnUse">
        <path d="M41 9Q51 23 43 34Q67 23 65 42Q59 55 45 52Q52 68 41 79Q30 68 37 52Q23 55 17 42Q15 23 39 34Q31 23 41 9ZM41 84Q53 98 63 93Q62 111 43 112L41 121 39 112Q20 111 19 93Q29 98 41 84Z" fill="#91a17a" opacity="0.13" />
        <path d="M0 64Q18 68 19 84M82 64Q64 68 63 84" fill="none" stroke="#8a9775" strokeWidth="1" opacity="0.13" />
      </pattern>
      <clipPath id="hi-art-window-clip"><path d={windowOpening} /></clipPath>
      <clipPath id="hi-art-portrait-clip"><ellipse rx="59" ry="108" /></clipPath>
    </defs>

    {!transparent && (
      <g>
        <path d="M0 0H1920V1080H0Z" fill="url(#hi-art-wall)" />
        <path d="M503 142H1417V896H503Z" fill="url(#hi-art-damask)" opacity="0.25" />
        {/* Receding arch and its worn plaster maintain a quiet central field. */}
        <path d="M679 866V433Q679 228 960 192Q1241 228 1241 433V866Z" fill="#1d2925" stroke="#414d3e" strokeWidth="12" strokeOpacity="0.22" />
        <path d="M704 866V437Q704 248 960 217Q1216 248 1216 437V866Z" fill="url(#hi-art-depth)" stroke="#090f10" strokeWidth="12" />
        <path d="M714 865V442Q714 261 960 231Q1206 261 1206 442V865" fill="none" stroke="#4a5849" strokeWidth="2" opacity="0.24" />
        <path d="M815 861V472Q815 344 960 310Q1105 344 1105 472V861" fill="none" stroke="#566452" strokeWidth="3" opacity="0.075" />
        <path d="M814 484h292M832 854V514h256v340" fill="none" stroke="#4a594b" strokeWidth="2" opacity="0.06" />
        <path d="M542 783h133v79H542m705-79h131v79h-131" fill="none" stroke="#525b49" strokeWidth="3" opacity="0.18" />
        <path d="M644 294l-12 34 9 17-12 25 8 28m643-115 9 34-13 16 13 33-6 21M584 612l16 23-7 28 13 15" fill="none" stroke="#080f10" strokeWidth="2" opacity="0.45" />
        <path d="M629 463l20-11 18 14-10 37 7 24-19 13-14-20-12 4-8-17ZM1262 532l12 10 18-7 5 20-18 21 6 23-15 12-18-26 8-21Z" fill="#101b18" opacity="0.32" />
        <path d="M543 850H1377L1920 1080H0Z" fill="url(#hi-art-floor)" />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((index) => (
          <path key={index} d={`M${644 + index * 53} 850L${-220 + index * 195} 1080`} fill="none" stroke="#050e0e" strokeWidth="2" opacity="0.6" />
        ))}
        <path d="M488 874h944M398 912h1124M250 972h1420M89 1039h1742" fill="none" stroke="#080f10" strokeWidth="2" opacity="0.56" />
        <path d="M691 886l-24 6m425 29 60 3m-417 62 96-8m260 37 153 11M517 1051l187-14m-310-57 45 2m942 74 117 8M753 934l38-4m102-56 64 1" fill="none" stroke="#728071" strokeWidth="1.3" opacity="0.16" />
        <path d="M857 850l-22 230h270l-46-230Z" fill={atmosphere} opacity="0.025" />
        <path d="M0 0H1920V1080H0Z" fill="url(#hi-art-center)" />
      </g>
    )}

    {[false, true].map((right) => (
      <g key={String(right)} transform={right ? 'translate(1920 0) scale(-1 1)' : undefined}>
        <path d="M0 72L554 146V899L0 1080Z" fill="url(#hi-art-side)" />
        <path d="M0 72L554 146V789L0 744Z" fill="url(#hi-art-damask)" />
        <PlasterScars />
        <Wainscot />
        <WindowAndDrapery />
        {/* Fluted pilasters hold the visible depth of the side walls. */}
        <path d="M498 174l43 4V858l-43 10Z" fill="url(#hi-art-column)" />
        <path d="M505 202v634m12-635v632m12-630v627" stroke="#070f0f" strokeWidth="3" opacity="0.6" />
        <path d="M509 203v630m12-631v629" stroke="#889078" strokeWidth="1.5" opacity="0.22" />
        <path d="M485 157l67 8v16l-8 10-51-3-8-11Z" fill="#41493b" stroke="#5c6450" strokeWidth="1" />
        <path d="M490 174l55 6M496 192l44 3" stroke="#858c73" strokeWidth="2" opacity="0.23" />
        <path d="M491 843l56-7 9 18v13l-73 16v-19Z" fill="#29362a" stroke="#4a5644" strokeWidth="2" />
        <path d="M482 880l74-17 2 17-81 20Z" fill="#111d18" />
        <path d="M510 514l6 23-6 17 13 18m-7-35 13 5" stroke="#09120f" strokeWidth="2" fill="none" />
        <path d="M0 19L566 117v22L0 58Z" fill="#080f11" />
        <path d="M0 57L560 135v24L0 91Z" fill="#3d4437" />
        <path d="M0 83L559 151v10L0 101Z" fill="#69715a" opacity="0.36" />
        <path d="M0 111L554 169v12L0 124Z" fill="#101b17" />
        <path d="M0 93L555 159M0 64L559 140" stroke="#92967d" strokeWidth="2" opacity="0.18" />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => (
          <path key={index} d={`M${22 + index * 52} ${112 + index * 5.8}l19 2v16l-19-2Z`} fill="#313e31" stroke="#67725a" strokeWidth="1" strokeOpacity="0.24" />
        ))}
        {/* Foreground edge and battered finial silhouette. */}
        <path d="M0 0H29V1080H0Z" fill="#060d10" />
        <path d="M32 0v1080" stroke="#64705d" strokeWidth="2" opacity="0.17" />
        <path d="M44 978h245l-26-22H66Z" fill="#111815" />
        <path d="M57 977l-10 103h18l11-103m183 0 14 103h17l-11-103" fill="#0c1412" />
        <path d="M61 956l7-30h189l12 30Z" fill="#1d2720" stroke="#4a5040" strokeWidth="1" />
        <path d="M76 935h169m-163 8h156" stroke="#5f6550" opacity="0.24" />
        <path d="M67 926h191l-15-10H82Z" fill="#303b2c" />
        <path d="M71 916l7-96 15-25 15 24 4 97m113 0 1-101 14-24 17 27 5 98" fill="#152019" stroke="#404e39" strokeWidth="2" />
        <path d="M86 796v-20m155 14v-22" stroke="#405037" strokeWidth="5" />
        <path d="M92 813l137-1v83l-118 4" fill="none" stroke="#3d4c37" strokeWidth="4" />
        <path d="M104 827l17 62m8-66 13 61m11-62 8 61m17-62 3 60m22-62-1 61" stroke="#30412e" strokeWidth="3" />
        <path d="M64 946Q169 930 268 946" fill="none" stroke={candle} strokeWidth="2" opacity="0.06" />
      </g>
    ))}

    <Portrait x={410} variant={0} />
    <Portrait x={1510} variant={1} />

    {/* Ceiling moldings stay peripheral, leaving room for the moving chandelier. */}
    <path d="M0 0H1920L1370 112H550Z" fill="#0c1417" />
    <path d="M162 0L599 94H1321L1758 0" fill="none" stroke="#333e33" strokeWidth="12" />
    <path d="M254 0L618 76H1302L1666 0M550 112H1370" fill="none" stroke="#65725b" strokeWidth="2" opacity="0.2" />
    <path d="M545 110H1375V132H545Z" fill="#303b2e" />
    <path d="M551 132H1369v13H551Z" fill="#121e19" />
    <path d="M563 111H1357M558 131H1362" stroke="#747c61" strokeWidth="2" opacity="0.3" />
    <path d="M613 111l14 19m51-19 10 19m55-19 7 19m60-19 5 19m140-19v19m80-19-5 19m60-19-7 19m62-19-10 19m66-19-14 19" stroke="#080f0e" strokeWidth="7" opacity="0.35" />
    <CornerCobweb right={false} />
    <CornerCobweb right />
  </g>
);
