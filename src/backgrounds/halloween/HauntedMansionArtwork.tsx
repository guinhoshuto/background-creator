export interface HauntedMansionArtworkProps {
  stone: string;
  trim: string;
  roof: string;
  windowColor: string;
  windowLevels: readonly number[];
}

interface MansionWindowProps {
  x: number;
  y: number;
  width: number;
  height: number;
  light: number;
  color: string;
  trim: string;
  dark: string;
}

const MansionWindow = ({x, y, width, height, light, color, trim, dark}: MansionWindowProps) => {
  const arch = width * 0.47;
  const pane = `M0 ${height}V${arch}Q0 ${arch * 0.3} ${width / 2} 0Q${width} ${arch * 0.3} ${width} ${arch}V${height}Z`;

  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={pane} fill={dark} stroke={trim} strokeWidth="7" />
      <path d={pane} fill={color} opacity={light * 0.92} />
      <path d={pane} fill="none" stroke={color} strokeWidth="15" opacity={light * 0.045} />
      <path d={pane} fill="none" stroke={color} strokeWidth="5" opacity={light * 0.09} />
      {/* Heavy mullions and a pointed upper tracery keep the lights architectural. */}
      <path
        d={`M${width / 2} 1V${height}M0 ${height * 0.49}H${width}M0 ${height * 0.76}H${width}M0 ${arch + 4}Q${width * 0.25} ${arch + 4} ${width / 2} 5Q${width * 0.75} ${arch + 4} ${width} ${arch + 4}`}
        fill="none"
        stroke={dark}
        strokeWidth="3.8"
      />
      <path d={`M-6 ${height + 4}H${width + 6}M-4 ${height + 9}H${width + 4}`} stroke={trim} strokeWidth="3" />
      <path d={`M-7 ${height - 1}V${arch}Q-7 -3 ${width / 2} -10Q${width + 7} -3 ${width + 7} ${arch}`} stroke={trim} strokeWidth="1.4" opacity="0.45" fill="none" />
    </g>
  );
};

/** Original mansion artwork. The base is y=680; all motion comes from the caller. */
export const HauntedMansionArtwork = ({
  stone,
  trim,
  roof,
  windowColor,
  windowLevels,
}: HauntedMansionArtworkProps) => {
  const light = (index: number) => Math.max(0, Math.min(1, windowLevels[index] ?? 0.7));
  const windowProps = {color: windowColor, trim, dark: roof};

  return (
    <g strokeLinejoin="round">
      {/* Two distant wings, set behind the projecting towers and central porch. */}
      <path d="M23 460H171V629H23ZM403 410H591V632H403Z" fill={stone} />
      <path d="M432 418H591V632H432ZM126 460H171V629H126Z" fill={roof} opacity="0.32" />
      <path d="M5 466L42 414H150L183 466ZM401 422L439 346H555L613 422Z" fill={roof} />
      <path d="M8 466H180M404 422H611M37 430H160M424 392H589" fill="none" stroke={trim} strokeWidth="3" opacity="0.55" />
      <path d="M27 473H163M431 431H594M20 614H166M422 613H598" fill="none" stroke={trim} strokeWidth="4" opacity="0.54" />
      <MansionWindow x={50} y={496} width={34} height={69} light={light(0)} {...windowProps} />
      <MansionWindow x={547} y={485} width={31} height={79} light={light(1)} {...windowProps} />

      {/* Chimneys have a dark side plane and old-fashioned double chimney pots. */}
      <g fill={stone} stroke={trim} strokeWidth="1.4">
        <path d="M193 300V216H223V300ZM186 216V205H229V216ZM196 205V184H204V205ZM214 205V181H222V205Z" />
        <path d="M386 324V241H415V332ZM380 242V232H421V242ZM386 232V211H395V232ZM405 232V207H414V232Z" />
      </g>
      <g fill={roof} opacity="0.5">
        <path d="M213 218H224V295H213ZM406 244H416V323H406Z" />
      </g>
      <path d="M194 231H211M201 250H222M194 270H210M388 254H405M396 274H413" fill="none" stroke={trim} strokeWidth="1.4" opacity="0.38" />

      {/* The main mansard roof is broad and slightly bowed, like an engraved plate. */}
      <path d="M134 410L184 286Q286 269 392 286L453 410Z" fill={roof} />
      <path d="M135 410Q187 360 184 286M452 410Q391 356 392 286" fill="none" stroke={trim} strokeWidth="3" opacity="0.74" />
      <path d="M181 286Q287 266 395 286M154 370Q291 350 430 370M145 392Q290 373 442 392" fill="none" stroke={trim} strokeWidth="1.5" opacity="0.32" />
      <path d="M204 286L177 399M235 281L222 396M350 281L368 397M374 284L413 401" fill="none" stroke={trim} strokeWidth="1.4" opacity="0.23" />
      <path d="M138 402H451V628H138Z" fill={stone} />
      <path d="M397 406H451V628H397Z" fill={roof} opacity="0.23" />
      <path d="M129 404H459L450 416H138ZM140 503H445V511H140ZM137 612H452V628H137Z" fill={trim} opacity="0.65" />
      <path d="M151 425H436M150 514H439M149 600H438" fill="none" stroke={trim} strokeWidth="1.4" opacity="0.36" />
      <g stroke={trim} strokeWidth="1.2" opacity="0.22">
        <path d="M144 440H186M146 462H181M148 483H187M405 441H444M410 463H443M404 484H444M145 531H189M146 551H182M145 573H183M405 538H441M405 559H440M404 580H441" />
        <path d="M161 427V440M172 441V461M156 463V484M421 427V441M432 443V463M419 464V484M163 516V531M174 532V551M158 552V573M420 518V538M432 539V559M418 561V580" />
      </g>

      {/* A round rose window sits in the steep central dormer. */}
      <path d="M246 383V306L289 250L334 306V383Z" fill={stone} />
      <path d="M235 317L289 245L346 317L337 322L289 261L244 323Z" fill={roof} stroke={trim} strokeWidth="2.5" />
      <path d="M244 383H337M251 369H330" fill="none" stroke={trim} strokeWidth="3" />
      <circle cx="290" cy="328" r="25" fill={roof} stroke={trim} strokeWidth="6" />
      <circle cx="290" cy="328" r="20" fill={windowColor} opacity={light(2) * 0.91} />
      <circle cx="290" cy="328" r="30" fill="none" stroke={trim} strokeWidth="1.6" opacity="0.56" />
      <path d="M290 307V349M269 328H311M275 313L305 343M275 343L305 313" stroke={roof} strokeWidth="3" />
      <circle cx="290" cy="328" r="7" fill={roof} />
      <path d="M289 245V226M282 234H296M289 225L285 219L289 212L293 219Z" fill={trim} stroke={trim} strokeWidth="2" />
      <MansionWindow x={196} y={434} width={35} height={56} light={light(3)} {...windowProps} />
      <MansionWindow x={271} y={430} width={38} height={60} light={light(4)} {...windowProps} />
      <MansionWindow x={351} y={434} width={35} height={56} light={light(5)} {...windowProps} />

      {/* Left octagonal tower. Its cut planes make the silhouette feel built. */}
      <path d="M69 243L99 226H141L167 243V628H69Z" fill={stone} />
      <path d="M69 245L95 231V628H69ZM142 231L167 245V628H142Z" fill={roof} opacity="0.3" />
      <path d="M60 247L82 210L98 149H143L158 210L177 247Z" fill={roof} />
      <path d="M61 247H176M82 212H158M98 150H143" fill="none" stroke={trim} strokeWidth="3" />
      <path d="M73 234H164M89 187H152M103 153L91 212L75 246M137 153L149 212L165 246" fill="none" stroke={trim} strokeWidth="1.6" opacity="0.43" />
      <path d="M98 148Q104 134 112 134H129Q138 137 143 148ZM120 134V117M114 125H126" fill={roof} stroke={trim} strokeWidth="2" />
      <g fill="none" stroke={trim}>
        <path d="M63 254H172M65 360H170M65 458H170M65 584H171M63 619H173" strokeWidth="4" opacity="0.7" />
        <path d="M96 259V613M142 259V613" strokeWidth="1.5" opacity="0.38" />
        <path d="M71 288H91M147 306H163M72 330H91M147 391H163M72 418H91M147 431H163M72 492H91M73 553H91M146 541H163" strokeWidth="1.6" opacity="0.3" />
      </g>
      <MansionWindow x={104} y={281} width={28} height={58} light={light(6)} {...windowProps} />
      <MansionWindow x={104} y={380} width={28} height={57} light={light(7)} {...windowProps} />
      <MansionWindow x={104} y={489} width={28} height={67} light={light(8)} {...windowProps} />

      {/* The tall bell tower is deliberately offset and slimmer than its neighbour. */}
      <path d="M437 221L468 207H510L539 224V635H437Z" fill={stone} />
      <path d="M511 209L539 225V635H511ZM438 224L459 214V635H438Z" fill={roof} opacity="0.31" />
      <path d="M425 229Q454 183 467 131L489 38L509 131Q521 188 550 229Z" fill={roof} />
      <path d="M426 229H549M458 164Q489 171 521 164M449 189Q489 196 531 189M470 122H506" fill="none" stroke={trim} strokeWidth="2.7" opacity="0.74" />
      <path d="M489 43L478 130Q469 188 444 225M489 43L498 130Q506 190 534 225" fill="none" stroke={trim} strokeWidth="1.5" opacity="0.41" />
      <path d="M489 42V9M478 20H501M489 9L485 5L489 0L493 5Z" fill={trim} stroke={trim} strokeWidth="2" />
      <path d="M493 11Q510 8 515 17L507 22L501 15Z" fill={trim} opacity="0.8" />
      <path d="M430 235H545V244H430ZM431 342H544V350H431ZM432 444H542V451H432ZM431 585H545V595H431Z" fill={trim} opacity="0.74" />
      <path d="M462 248V580M510 248V580" fill="none" stroke={trim} strokeWidth="2" opacity="0.39" />
      <MansionWindow x={475} y={261} width={28} height={58} light={light(9)} {...windowProps} />
      <MansionWindow x={475} y={371} width={28} height={50} light={light(10)} {...windowProps} />
      <MansionWindow x={473} y={482} width={32} height={68} light={light(11)} {...windowProps} />
      <g fill="none" stroke={trim} strokeWidth="1.4" opacity="0.29">
        <path d="M442 265H457M515 281H533M441 297H457M516 314H534M442 382H458M515 397H534M442 416H457M443 478H457M515 498H533M443 520H457M516 542H534M442 560H457" />
      </g>

      {/* Porch, iron cresting and a pair of sweeping stone stairs. */}
      <path d="M184 551L205 499H372L398 551Z" fill={roof} />
      <path d="M183 551H399L393 560H188Z" fill={trim} opacity="0.84" />
      <path d="M203 505H375M194 528H386" fill="none" stroke={trim} strokeWidth="1.5" opacity="0.36" />
      <path d="M221 499V482M240 499V482M259 499V482M278 499V482M297 499V482M316 499V482M335 499V482M354 499V482M221 491H355" fill="none" stroke={roof} strokeWidth="2.5" />
      {[221, 240, 259, 278, 297, 316, 335, 354].map((x) => (
        <path key={x} d={`M${x} 475L${x - 3} 483H${x + 3}Z`} fill={roof} />
      ))}
      <path d="M224 559H370V627H224Z" fill={roof} opacity="0.58" />
      <path d="M266 623V579Q266 556 290 550Q315 556 315 579V623Z" fill={roof} stroke={trim} strokeWidth="3" />
      <path d="M275 582V577Q275 564 289 558Q305 564 305 578V582Z" fill={windowColor} opacity={light(4) * 0.65} />
      <path d="M290 557V621M274 588H306M276 595H285V613H276ZM295 595H305V613H295Z" fill="none" stroke={trim} strokeWidth="1.8" opacity="0.59" />
      <circle cx="296" cy="591" r="1.9" fill={windowColor} opacity="0.8" />
      {[198, 224, 360, 385].map((x) => (
        <g key={x}>
          <path d={`M${x - 5} 560H${x + 5}L${x + 4} 621H${x - 4}ZM${x - 8} 560H${x + 8}V566H${x - 8}ZM${x - 8} 618H${x + 8}V625H${x - 8}Z`} fill={trim} />
          <path d={`M${x + 1} 570V614`} stroke={roof} strokeWidth="2" opacity="0.44" />
        </g>
      ))}
      <path d="M201 573Q212 573 223 594M224 572Q242 571 252 583M359 571Q340 572 329 584M362 594Q373 574 384 573" fill="none" stroke={trim} strokeWidth="4" />
      <path d="M189 627H398V637H189ZM182 637H405V647H182ZM173 647H414V657H173ZM162 657H425V668H162ZM149 668H437V680H149Z" fill={stone} />
      <path d="M191 628H396M184 639H403M175 650H412M164 661H423M151 673H435" fill="none" stroke={trim} strokeWidth="3" opacity="0.69" />
      <path d="M198 635L163 668M386 635L425 668M190 628V611M397 628V611M183 642V626M406 642V626M173 657V641M418 657V641M165 669V654M427 669V654" fill="none" stroke={roof} strokeWidth="4" />
      <path d="M187 609Q177 635 160 651M398 609Q409 635 431 651" fill="none" stroke={trim} strokeWidth="4" />

      {/* Foundation and sparse climbing ivy anchor the building to its hill. */}
      <path d="M14 630H173V647H14ZM437 632H607V650H437Z" fill={roof} />
      <path d="M16 632H169M440 633H604" stroke={trim} strokeWidth="3" opacity="0.5" />
      <path d="M31 632Q43 607 35 586Q29 567 39 551M560 639Q548 605 561 585Q574 563 565 543M146 630Q152 606 144 586" stroke={roof} strokeWidth="3.5" fill="none" />
      <g fill={roof}>
        <path d="M36 613Q18 610 24 598Q37 601 36 613ZM36 596Q48 583 51 594Q47 607 36 596ZM35 574Q23 568 27 559Q42 562 35 574ZM557 612Q541 610 543 598Q558 599 557 612ZM557 593Q573 579 578 591Q570 602 557 593ZM566 563Q550 565 552 554Q566 550 566 563ZM148 609Q136 607 134 597Q148 596 148 609Z" />
      </g>
    </g>
  );
};
