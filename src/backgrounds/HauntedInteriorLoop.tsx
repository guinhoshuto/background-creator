import {interpolateColors, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {createSeededRandom, loopPhase, randomBetween, TAU} from '../loop';
import {baseBackgroundSchema, hasTransparentBackground} from '../settings';
import {Canvas} from './Canvas';
import {
  cycleSeconds, getActiveStrike, getLightningStrikes, getStrikeEnvelope, getWindowFlash, LIGHTNING_COLOR, type LightningStrike,
} from './halloween/lightning';
import {
  CANDELABRA_PATHS, CEILING, CURTAIN_SHAPES, CURTAIN_TIEBACKS, FLOOR_VISIBLE, HauntedInteriorArchitecture, LANCET, MARBLE, MOON_POOL_AXIS,
  MOON_POOL_LAYERS, MOON_POOL_PANES, MOON_POOL_SAMPLES, MOON_SHAFT_AXIS, MOON_SHAFT_RAYS, RETAINED, RETAINED_CORE, SIDE_WALLS, SILL_TOPS,
  TRACERY_PLATE, WALLS_CORE,
} from './halloween/HauntedInteriorArtwork';
import {
  BACK_Z, CANDELABRA, CANDELABRA_FOOT, CANDELABRA_SCALE, CANDLE_ANCHORS, CHANDELIER, CHANDELIER_MAX_SWING, CHANDELIER_PARTS,
  CHANDELIER_PIVOT, CONTENT_BOX, EYES_ANCHORS, flameCorePathOf, flamePathOf, flattenPath, HALL, leftWall, LIGHTNING_ANCHORS, MOON_ANCHORS, MOON_DIRECTION, MOON_SIDE, MOONLIGHT_DEFAULT, pathOf,
  type Point, pointInPolygon, PORTRAIT_EYE_POINTS, PORTRAIT_SQUASH, project, WINDOW,
} from './halloween/hauntedInteriorGeometry';

export {
  CANDLE_ANCHORS, CHANDELIER_LOWEST_Y, CHANDELIER_PIVOT, CONTENT_BOX, EYES_ANCHORS, LIGHTNING_ANCHORS, MOON_ANCHORS,
  PORTRAIT_EYE_POINTS, PORTRAIT_OVAL, TITLE_ZONE, VP,
} from './halloween/hauntedInteriorGeometry';

/**
 * A lanceta que não vê a lua (MOON_SIDE é a que vê): por ela entra só a luz difusa do céu (SKYLIGHT,
 * SKY_GLOW), sem o luar direto.
 */
const SKY_SIDE = (1 - MOON_SIDE) as 0 | 1;
/** The name of each side of the hall, for the Studio: 0 is left, 1 is right. */
const SIDE_NAMES = ['left', 'right'] as const;

export const hauntedInteriorLoopSchema = baseBackgroundSchema.extend({
  durationSeconds: baseBackgroundSchema.shape.durationSeconds.default(16),
  seed: baseBackgroundSchema.shape.seed.default(113),
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#080D10'),
  colors: baseBackgroundSchema.shape.colors.unwrap()
    .describe('Palette: fog, moonlight and candles; the third color is optional')
    .default(['#536C68', '#A8BDB0', '#CA8A48']),
  dustCount: z.number().int().min(0).max(100).describe('Dust particles along the sides').default(36),
  fogIntensity: z.number().finite().min(0).max(1).describe('Fog along the floor').default(0.55),
  candleIntensity: z.number().finite().min(0).max(1).describe('Candle light and flames').default(0.8),
  moonlightIntensity: z.number().finite().min(0).max(1)
    .describe(`Moonlight through the ${SIDE_NAMES[MOON_SIDE]} window and diffuse skylight on the ${SIDE_NAMES[SKY_SIDE]}`)
    .default(MOONLIGHT_DEFAULT),
  hauntingIntensity: z.number().finite().min(0).max(1).describe('Eyes appearing in the portraits').default(0.45),
  chandelierSway: z.number().finite().min(0).max(1).describe('Gentle sway of the chandelier').default(0.6),
  lightningIntensity: z.number().finite().min(0).max(1).describe('Lightning in the windows and in the reflection; 0 turns the flashes off').default(0.7),
});

export type HauntedInteriorLoopProps = z.infer<typeof hauntedInteriorLoopSchema>;
export type HauntedInteriorElement = {
  kind: 'dust' | 'fog' | 'candle' | 'chandelier' | 'moonlight' | 'eyes' | 'lightning';
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

/**
 * A poeira flutua nas faixas laterais, na luz das janelas e das velas: centros e órbitas mantêm cada
 * partícula à esquerda de CONTENT_BOX.left (ou à direita do seu espelho).
 */
export const DUST_BAND = {left: 60, right: 380, top: 120, bottom: 960, radius: 24} as const;
/**
 * A poeira só brilha onde a luz a pega. Na faixa da lanceta que vê a lua, o luar a acende; na da
 * outra, que só recebe o céu difuso, ela fica com esta fração do brilho.
 */
const DUST_AWAY = 0.5;
/** Os bancos de névoa ficam no piso, abaixo da área de conteúdo. */
export const FOG_Y = 976;
/** Meia altura de um banco de névoa na escala 1: o topo fica abaixo da área de conteúdo. */
export const FOG_RY = 58;

/**
 * Há uma lua só, do lado de fora da parede direita (MOON_SIDE): só a lanceta dessa parede a vê e deixa
 * entrar o luar direto (a poça, o feixe e a luz fria em volta). A da esquerda (SKY_SIDE), na parede
 * oposta, dá para a outra metade do céu e recebe só a luz que a lua espalha nele, difusa: SKYLIGHT do
 * luar direto, que respira junto com ele. O corredor, além do arco, recebe o luar pela direita também.
 */
const SKYLIGHT = 0.2;

/* ------------------------------------------------------------------------------ relâmpagos */

// Os relâmpagos moram em halloween/lightning.ts (os overlays do kit piscam junto); os nomes seguem
// exportados daqui, com a mesma API.
export {
  getActiveStrike, getLightningStrikes, getStrikeEnvelope, getWindowFlash, LIGHTNING, type LightningStrike,
} from './halloween/lightning';

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
    const centerX = randomBetween(dustRandom, DUST_BAND.left, DUST_BAND.right - DUST_BAND.radius);
    const centerY = randomBetween(dustRandom, DUST_BAND.top, DUST_BAND.bottom);
    const radius = randomBetween(dustRandom, 7, DUST_BAND.radius);
    return element('dust', {
      x: (side ? 1920 - centerX : centerX) + Math.sin(phase + offset) * radius,
      y: centerY + Math.cos(phase + offset) * radius * 1.6,
      scale: randomBetween(dustRandom, 0.5, 1.6),
      opacity: (side === MOON_SIDE ? 1 : DUST_AWAY) * (0.06 + (1 + Math.sin(phase * 2 + offset)) * 0.11),
    });
  });
  const fog = Array.from({length: 5}, (_, index) => {
    const offset = index * TAU / 5;
    return element('fog', {
      x: -140 + index * 550 + Math.sin(phase + offset) * 130,
      y: FOG_Y + (index % 2) * 54 + Math.cos(phase + offset) * 14,
      scale: 1 + Math.sin(phase + offset) * 0.065,
      opacity: props.fogIntensity * (0.17 + Math.sin(phase + offset) * 0.035),
    });
  });
  const candles = CANDLE_ANCHORS.map(([x, y]) => {
    const offset = lightRandom() * TAU;
    return element('candle', {
      x, y,
      glow: props.candleIntensity * (0.7 + Math.sin(phase * 7 + offset) * 0.12 + Math.cos(phase * 19 + offset) * 0.06),
      scale: 0.88 + Math.sin(phase * 11 + offset) * 0.11,
      lean: Math.sin(phase * 5 + offset) * 2.8 + Math.cos(phase * 13 + offset),
    });
  });
  const chandelier = element('chandelier', {
    x: CHANDELIER_PIVOT[0], y: CHANDELIER_PIVOT[1], rotation: props.chandelierSway * Math.sin(phase * 2) * CHANDELIER_MAX_SWING,
    glow: props.candleIntensity * (0.72 + Math.sin(phase * 5 + 0.7) * 0.1 + Math.sin(phase * 13) * 0.035),
    scale: 0.92 + Math.sin(phase * 9) * 0.06,
    lean: Math.sin(phase * 7) * 2,
  });
  // O luar só respira na opacidade: parado, o feixe segue alinhado ao vidro e à poça, que não se movem.
  // A lanceta que vê a lua (MOON_SIDE) recebe o luar direto; a outra, só a luz difusa do céu que a
  // lua ilumina (SKYLIGHT), que respira junto.
  const moon = props.moonlightIntensity * (0.1 + Math.sin(phase) * 0.02);
  const moonlight = MOON_ANCHORS.map(([x, y], side) => element('moonlight', {
    x, y,
    opacity: side === MOON_SIDE ? moon : SKYLIGHT * moon,
  }));
  const eyes = EYES_ANCHORS.map(([x, y], index) => element('eyes', {
    x, y,
    opacity: props.hauntingIntensity * Math.pow((1 + Math.sin(phase + index * 2.6 - 0.8)) / 2, 6) * 0.6,
  }));
  // As duas janelas veem o mesmo céu de tempestade: clareiam juntas, mais forte a que está voltada
  // para o raio, e só ela mostra o raio (glow) e deixa entrar a luz dele no salão (veja FAR_LIGHT).
  const seconds = cycleSeconds(props, frame, durationInFrames);
  const strikes = getLightningStrikes(props);
  const flashes = getWindowFlash(props, frame, durationInFrames);
  const lightning = LIGHTNING_ANCHORS.map(([x, y], side) => {
    let bolt = 0;
    for (const strike of strikes) {
      if (strike.side === side) bolt = Math.max(bolt, getStrikeEnvelope(strike, seconds - strike.start).bolt);
    }
    return element('lightning', {x, y, opacity: props.lightningIntensity * flashes[side]!, glow: bolt});
  });
  return [...dust, ...fog, ...candles, chandelier, ...moonlight, ...eyes, ...lightning];
};

/**
 * Chama: o halo acompanha o brilho e o corpo fica quase sólido enquanto a vela está acesa. Sobre o
 * jogo (`solid`), o corpo é opaco em qualquer intensidade usual e nunca fica fantasmagórico; só um
 * candleIntensity muito baixo o atenua.
 */
const Flame = ({glow, scale, lean, size = 1, halo = true, solid = false}: Pick<HauntedInteriorElement, 'glow' | 'scale' | 'lean'> & {size?: number; halo?: boolean; solid?: boolean}) => (
  <g transform={`scale(${size})`}>
    {halo && <ellipse cy="-10" rx="46" ry="58" fill="url(#hi-warm-halo)" opacity={glow * 0.6} />}
    <g transform={`scale(1 ${scale})`} opacity={Math.min(1, glow * (solid ? 4 : 1.6))}>
      <path d={flamePathOf(lean)} fill="url(#hi-flame)" />
      <path d={flameCorePathOf(lean)} fill="#FBEBC8" />
    </g>
  </g>
);

/* ---------------------------------------------------------------------------------- lustre */

/** Elos da corrente, alternadamente de frente e de perfil, de `from` até `to`. */
const Chain = ({x, from, to}: {x: number; from: number; to: number}) => {
  const links = Math.max(2, Math.round((to - from) / 6.5));
  const pitch = (to - from) / links;
  return (
    <g fill="none" stroke="#6a6250" strokeWidth="1.3">
      {Array.from({length: links}, (_, i) => i % 2
        ? <path key={i} d={`M${x} ${(from + i * pitch).toFixed(1)}v${pitch.toFixed(1)}`} strokeWidth="2.2" stroke="#3a3326" />
        : <ellipse key={i} cx={x} cy={from + (i + 0.5) * pitch} rx="2.4" ry={pitch * 0.62} />)}
    </g>
  );
};

/**
 * Lustre na perspectiva do salão (CHANDELIER_PARTS): um anel de oito velas visto de baixo, preso por
 * uma corrente curta à roseta do teto, na linha central. A peça inteira balança em torno de
 * CHANDELIER_PIVOT; todas as partes são opacas, então ela continua sólida sobre o jogo.
 */
const Chandelier = ({rotation, glow, scale, lean, transparent}: HauntedInteriorElement & {transparent: boolean}) => {
  const [px, py] = CHANDELIER_PIVOT;
  const {arms, ring, hub, chainBottom} = CHANDELIER_PARTS;
  const armLayer = (front: boolean) => arms.filter((arm) => arm.front === front).map((arm, i) => (
    <g key={`${front}-${i}`}>
      <path d={arm.arm} fill="none" stroke="url(#hi-bronze)" strokeWidth={3.2 * arm.size} strokeLinecap="round" />
      <path d={arm.pan} fill="#5e5238" />
      <path d={arm.cup} fill="#4a4230" />
      <path d={arm.candle} fill="url(#hi-wax-warm)" />
      <g transform={`translate(${arm.top[0].toFixed(1)} ${arm.top[1].toFixed(1)})`}>
        {/* Bem acima da área de conteúdo; sobre o jogo o halo sai e fica só a chama. */}
        {!transparent && <ellipse cy="-8" rx={30 * arm.size} ry={38 * arm.size} fill="url(#hi-warm-halo)" opacity={glow * 0.6} />}
        <Flame glow={glow} scale={scale} lean={i % 2 ? -lean : lean} size={0.8 * arm.size} halo={false} solid={transparent} />
      </g>
    </g>
  ));
  return (
    <g>
      {/* Sobre o jogo não há teto: a corrente segue até a borda do quadro. */}
      {transparent && <Chain x={px} from={0} to={py} />}
      <g transform={`rotate(${rotation} ${px} ${py})`}>
        <Chain x={px} from={py} to={chainBottom} />
        <path d={ring.back} fill="none" stroke="url(#hi-bronze)" strokeWidth="3.4" />
        {armLayer(false)}
        <path d={hub} fill="url(#hi-bronze)" stroke="#6a5c43" strokeWidth="1" />
        {arms.map((arm, i) => <path key={i} d={arm.drop} fill="#4c5750" stroke="#7d8b7f" strokeWidth="0.6" />)}
        <path d={ring.front} fill="none" stroke="url(#hi-bronze)" strokeWidth="4.2" />
        {armLayer(true)}
      </g>
    </g>
  );
};
const ROSE_TOP = project(0, HALL.height, CHANDELIER.z)[1];

/* ------------------------------------------------------------------------------ candelabro */

/**
 * O bronze do candelabro onde o clarão o alcança: o corpo (pé, cúpula, haste e nós) e as peças finas
 * (pratos e copos), que, como os braços (traço), só acendem na borda (hi-candelabra-edge). As velas
 * ficam de fora: a cera, já acesa pelas chamas, não pode saltar para o branco a cada relâmpago.
 */
const CANDELABRA_BODY = [CANDELABRA_PATHS.feet, CANDELABRA_PATHS.dome, CANDELABRA_PATHS.shaft, CANDELABRA_PATHS.knops].join('');
const CANDELABRA_THIN = CANDELABRA_PATHS.pans + CANDELABRA_PATHS.cups;
const ARM_WIDTH = 0.036 * CANDELABRA_SCALE;
/**
 * Pratos, copos e braços são finos, e a luz da janela vem do alto e da direita (na metade esquerda; a
 * direita é o espelho): nela, eles acendem só na borda voltada para a janela, e não por inteiro, o que
 * fazia o prato junto à janela ler como um disco claro, chapado. A máscara hi-candelabra-edge é cada
 * peça menos ela mesma deslocada para longe da janela (`x` px para a esquerda e `y` para baixo): fica
 * o alto e a ponta direita dos pratos e dos copos, e o lado de cima e o da direita dos braços. A borda
 * de dentro dessa faixa é suave (`soft`, o desfoque da cópia deslocada); a de fora é a da peça.
 */
const RIM_EDGE = {x: 3, y: 2, soft: 0.8} as const;
/** Até onde o candelabro vai na tela, da esquerda para a direita (metade esquerda). */
const CANDELABRA_SPAN = (() => {
  const xs = flattenPath(CANDELABRA_PATHS.pans + CANDELABRA_PATHS.feet).flatMap(({points}) => points.map(([x]) => x));
  return [Math.min(...xs), Math.max(...xs)] as const;
})();

/**
 * O candelabro. No clarão, `rim` (um ganho, no salão opaco) acende de leve o lado voltado para a
 * janela, como acende a parede atrás dele: o bronze não fica parado enquanto tudo em volta clareia.
 * Nas peças finas, só a borda voltada para a janela (hi-candelabra-edge). O ganho dos braços vem logo
 * depois deles, antes dos nós, copos e pratos que cobrem as pontas: assim essas peças escondem as
 * pontas acesas também e só levam o próprio ganho, uma vez. Pintado por último, ele passava por cima
 * delas e as acendia de novo, dois discos claros no prato do meio e uma mancha no copo junto à janela.
 */
const Candelabra = ({rim}: {rim?: string}) => (
  <g>
    {/* A sombra de contato fica só no piso: nunca sobe pelo rodapé. */}
    <g clipPath="url(#hi-floor-visible)">
      <path d={CANDELABRA_PATHS.shadow} fill="#020505" opacity="0.55" filter="url(#hi-contact-soft)" />
    </g>
    <path d={CANDELABRA_PATHS.feet} fill="url(#hi-bronze)" stroke="#2a2519" strokeWidth="1" />
    <path d={CANDELABRA_PATHS.dome} fill="url(#hi-bronze)" stroke="#6a5a42" strokeWidth="1" />
    <path d={CANDELABRA_PATHS.shaft} fill="url(#hi-bronze)" />
    <path d={CANDELABRA_PATHS.arms} fill="none" stroke="#5e4f36" strokeWidth={ARM_WIDTH} strokeLinecap="round" />
    <path d={CANDELABRA_PATHS.arms} fill="none" stroke="#b1946a" strokeWidth={0.01 * CANDELABRA_SCALE} strokeLinecap="round" opacity="0.4" />
    {rim && (
      <path d={CANDELABRA_PATHS.arms} fill="none" stroke={rim} strokeWidth={ARM_WIDTH} strokeLinecap="round"
        clipPath="url(#hi-outside-box)" mask="url(#hi-candelabra-edge)" style={DODGE} />
    )}
    <path d={CANDELABRA_PATHS.knops} fill="url(#hi-bronze)" stroke="#7a6a4f" strokeWidth="1" />
    <path d={CANDELABRA_PATHS.cups} fill="#43392a" />
    <path d={CANDELABRA_PATHS.pans} fill="#6a5d45" stroke="#2a251b" strokeWidth="1" />
    {CANDELABRA_PATHS.candles.map((d, i) => <path key={i} d={d} fill="url(#hi-wax-warm)" />)}
    <path d={CANDELABRA_PATHS.drips} fill="#d8c9a4" opacity="0.5" />
    {rim && <path d={CANDELABRA_BODY} fill={rim} clipPath="url(#hi-outside-box)" style={DODGE} />}
    {rim && <path d={CANDELABRA_THIN} fill={rim} clipPath="url(#hi-outside-box)" mask="url(#hi-candelabra-edge)" style={DODGE} />}
  </g>
);

const CandleFlame = ({x, y, glow, scale, lean, solid}: HauntedInteriorElement & {solid: boolean}) => (
  <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
    <path d="M0 2L1-4" stroke="#241A12" strokeWidth="2" />
    <Flame glow={glow} scale={scale} lean={lean} size={0.9} solid={solid} />
  </g>
);

const MIRROR = 'translate(1920 0) scale(-1 1)';
/**
 * Luz das velas, a mais forte do salão: uma poça no piso ao pé do candelabro e um reflexo que sobe
 * pela parede, pelo veludo e pelo retrato atrás dele, na profundidade do próprio candelabro.
 */
const CANDLE_POOL = project(CANDELABRA.x + 0.25, 0, CANDELABRA.z + 0.2);
const CANDLE_WASH = [CANDELABRA_FOOT[0] - 10, CANDELABRA_FOOT[1] - 1.75 * CANDELABRA_SCALE] as const;
const CHANDELIER_FLOOR = project(0, 0, CHANDELIER.z);
/**
 * Centro da luz fria na parede em volta de cada lanceta (metade esquerda): o luar, na que vê a lua, e
 * a luz difusa do céu, bem mais fraca (SKYLIGHT), na outra.
 */
const MOON_WASH = leftWall()(WINDOW.u, (WINDOW.sill + WINDOW.spring) / 2);
/**
 * A luz difusa do céu enluarado, que entra pelas duas lancetas e pousa no piso: uma claridade larga e
 * fraca junto ao pé da parede, sob a janela, sem vidraças, sombra de barras nem direção, que não lê
 * como poça. É a mesma nas duas (o céu do lado da lua não é mais escuro que o do outro); na lanceta
 * da lua, ela contorna a poça do luar direto, que tem o próprio ganho, e na outra é toda a luz que
 * entra fora de um relâmpago. É uma elipse no plano do piso (em metros): o centro fica `from` da
 * parede, na altura da lanceta, e os raios são `out`, para dentro do salão, e `along`, ao longo da
 * parede. Na tela, ela e o degradê dela levam o escorço do piso no centro (a derivada da projeção
 * ali), que a deita rente à parede. Desenhada na metade esquerda e espelhada, como a poça.
 */
const SKY_GLOW = {from: 0.7, out: 1.4, along: 1.6} as const;
/**
 * Uma elipse no plano do piso, na tela: o centro (x, z, em metros), o raio `a` ao longo de `axis` (uma
 * direção no piso, unitária) e o raio `b` na perpendicular. O contorno e a matriz que leva o círculo
 * unitário de um degradê radial até ela usam o escorço do piso no centro (a derivada da projeção ali);
 * `radius` dá, para um ponto da tela, a distância ao centro na escala desse círculo.
 */
const floorEllipse = ([x, z]: readonly [number, number], [ux, uz]: readonly [number, number], a: number, b: number) => {
  const [cx, cy] = project(x, 0, z);
  const step = 1e-4;
  const axis = ([dx, dz]: readonly [number, number], radius: number) =>
    project(x + dx * step, 0, z + dz * step).map((value, k) => ((value - [cx, cy][k]!) / step) * radius);
  const [[ax, ay], [bx, by]] = [axis([ux, uz], a), axis([-uz, ux], b)] as [[number, number], [number, number]];
  const det = ax * by - ay * bx;
  return {
    transform: `matrix(${[ax, ay, bx, by, cx, cy].map((value) => value.toFixed(3)).join(' ')})`,
    outline: pathOf(Array.from({length: 64}, (_, k): Point => {
      const angle = (k / 64) * TAU;
      return [cx + ax * Math.cos(angle) + bx * Math.sin(angle), cy + ay * Math.cos(angle) + by * Math.sin(angle)];
    })),
    radius: ([px, py]: Point) => Math.hypot((by * (px - cx) - bx * (py - cy)) / det, (ax * (py - cy) - ay * (px - cx)) / det),
  };
};
const SKY_GLOW_MAP = floorEllipse([-HALL.halfWidth + SKY_GLOW.from, BACK_Z - WINDOW.u / 100], [1, 0], SKY_GLOW.out, SKY_GLOW.along);
/** A queda da luz difusa do céu, do centro à borda da elipse (SKY_GLOW): larga, sem miolo marcado. */
const SKY_FALLOFF = [[0, 1], [0.4, 0.6], [0.75, 0.2], [1, 0]] as const;

/** O quadro sem a área de conteúdo: os brilhos são recortados nele, então nada ilumina a captura. */
const OUTSIDE_BOX = `M0 0H1920V1080H0Z M${CONTENT_BOX.left} ${CONTENT_BOX.top}V${CONTENT_BOX.bottom}H${CONTENT_BOX.right}V${CONTENT_BOX.top}Z`;

/**
 * As camadas da poça se sobrepõem com 1/N de opacidade cada: onde todas cobrem, somam
 * 1 − (1 − 1/N)^N. Este fator, aplicado ao alpha no filtro da poça, devolve o miolo a 1.
 */
const POOL_NORMAL = 1 / (1 - (1 - 1 / MOON_POOL_SAMPLES) ** MOON_POOL_SAMPLES);

/* --------------------------------------------------------------------------- luz como ganho */

type Rgb = readonly [number, number, number];
/** Canais (0–1) de uma cor CSS que o Remotion leia (hex, nomes, rgb(), hsl()…); undefined se não ler. */
const channelsOf = (color: string): Rgb | undefined => {
  try {
    const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(interpolateColors(0, [0, 1], [color.trim(), color.trim()]));
    return match ? [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255] : undefined;
  } catch {
    return undefined;
  }
};
/** Luma (0–1) de canais 0–1; o lumaOf do corredor é outro: lê uma cor CSS e dá 0–255. */
const lumaOfRgb = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const REFERENCE_MOON = channelsOf('#A8BDB0')!;
const rgb = (map: (channel: number, index: number) => number, from: Rgb): Rgb => [map(from[0], 0), map(from[1], 1), map(from[2], 2)];
/**
 * O luar como luz: o tom da cor da paleta, suavizado (a raiz dos canais), com o brilho dela diante
 * do luar padrão. Uma cor escura dá um luar fraco; preta, nenhum.
 */
const moonTint = (color: string): Rgb => {
  const channels = channelsOf(color) ?? REFERENCE_MOON;
  const luma = lumaOfRgb(channels);
  if (luma <= 0) return [0, 0, 0];
  const soft = rgb((channel) => Math.sqrt(channel / luma), channels);
  const scale = luma / lumaOfRgb(REFERENCE_MOON) / lumaOfRgb(soft);
  return rgb((channel) => channel * scale, soft);
};
/** O relâmpago é um branco frio, um pouco azulado. */
const FLASH_TINT: Rgb = [0.93, 1, 1.1];
/**
 * No latão, o clarão é um ouro pálido (BRASS_LIGHT). O ganho multiplica o metal pintado: neutro, ele
 * somaria o próprio dourado do latão, saturado, e o candelabro pareceria arder junto com as velas;
 * frio, como na parede, ele somava cinza, e o latão desbotava para um estanho claro. Este tom faz o
 * que o clarão soma no tom mais claro do bronze (BRASS, em hi-bronze) ter a cor de BRASS_LIGHT, com o
 * brilho que um ganho neutro somaria ali: o metal clareia como ouro claro.
 */
const BRASS = '#86724e';
const BRASS_LIGHT = '#E8D6A8';
const RIM_TINT: Rgb = (() => {
  const [metal, light] = [channelsOf(BRASS)!, channelsOf(BRASS_LIGHT)!];
  const tint = rgb((channel, c) => light[c]! / channel, metal);
  const lit = rgb((channel, c) => channel * tint[c]!, metal);
  return rgb((value) => (value * lumaOfRgb(metal)) / lumaOfRgb(lit), tint);
})();
/**
 * A poça multiplica o mármore, que é verde-acinzentado: sob a luz forte, o verde dele cresceria junto
 * e a poça leria como tinta ciano. Metade desse tom sai da luz que cai no piso (a raiz do inverso da
 * cor do mármore, com o mesmo brilho), então a poça lê como luz fria sobre pedra.
 */
const MARBLE_BALANCE: Rgb = (() => {
  const marble = channelsOf(MARBLE.light)!;
  const soft = rgb((channel) => Math.sqrt(lumaOfRgb(marble) / channel), marble);
  return rgb((channel) => channel / lumaOfRgb(soft), soft);
})();
/**
 * A luz que cai numa superfície não a repinta: multiplica o que está pintado. Com mix-blend-mode
 * color-dodge, uma camada de cor Cs e alpha α dá Cb·(1 + α·Cs/(1 − Cs)) enquanto não satura: um
 * ganho linear em α, então as juntas, o xadrez e os veios do mármore, e o vermelho do veludo,
 * continuam lá, só mais claros. `dodge` é a cor que soma `gain` (por canal) onde α = 1. A mistura
 * só alcança o que foi pintado antes num grupo não isolado: recorte, filtro e opacidade ficam no
 * próprio elemento, nunca num grupo em volta dele.
 */
const dodge = (gain: Rgb) =>
  `rgb(${gain.map((value) => ((255 * Math.max(0, value)) / (1 + Math.max(0, value))).toFixed(2)).join(', ')})`;
const DODGE = {mixBlendMode: 'color-dodge'} as const;
/** Uma queda: pares [offset, fração], ligados em linha reta. */
type Profile = readonly (readonly [number, number])[];
/** A fração que uma queda dá em `t` (0–1). */
const shareAt = (profile: Profile, t: number) => {
  const next = profile.findIndex(([offset]) => offset >= t);
  if (next < 0) return profile[profile.length - 1]![1];
  const [a, b] = [profile[Math.max(0, next - 1)]!, profile[next]!];
  return b[0] === a[0] ? b[1] : a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
};
/**
 * As paradas de um degradê de ganho: em cada uma, a cor que soma `gain` × a fração que `profile`
 * (pares [offset, fração], ligados em linha reta) dá ali. A queda vai na cor, e a camada fica opaca:
 * com α < 1 a mistura é (1 − α)·Cb + α·min(1, Cb·(1 + g)), e o ganho cheio g satura cedo numa
 * superfície clara (o dourado de uma borla), que então vai ao branco como tinta, e não como luz, e
 * perde a cor. Assim, só satura o que a luz de fato estoura. Como a cor não é linear no ganho, as
 * paradas são próximas, a cada décimo.
 */
const gainStops = (gain: Rgb, profile: Profile) =>
  Array.from({length: 11}, (_, k) => {
    const share = shareAt(profile, k / 10);
    return <stop key={k} offset={k / 10} stopColor={dodge(rgb((value) => value * share, gain))} />;
  });
/**
 * As paradas, a cada décimo, de uma máscara que deixa passar `pass(t)` da luz de uma camada: o preto
 * com a opacidade 1 − pass sobre o branco dela. `layer` leva essa opacidade à de cada camada que a
 * desenha (na poça, layerAlpha).
 */
const passStops = (pass: (t: number) => number, layer = (alpha: number) => alpha) =>
  Array.from({length: 11}, (_, k) => (
    <stop key={k} offset={k / 10} stopColor="black" stopOpacity={layer(1 - Math.min(1, Math.max(0, pass(k / 10)))).toFixed(4)} />
  ));
/** A queda do clarão, do centro à borda da elipse: em volta da lanceta (FLASH_WASH) e onde ele pousa (FLASH_ROOM). */
const FLASH_FALLOFF = [[0, 1], [0.45, 0.36], [1, 0]] as const;
const ROOM_FALLOFF = [[0, 1], [0.5, 0.45], [1, 0]] as const;
/** No candelabro, do lado voltado para a janela ao lado oposto. */
const RIM_FALLOFF = [[0, 1], [0.45, 0.3], [1, 0]] as const;
/**
 * Ganhos, a luz somada no miolo de cada superfície por unidade de intensidade da cena: a poça pelo
 * luar (`moon`, por unidade de opacidade do luar); a parte dela que o mármore espalha em volta
 * (`glow`); o que resta no fim dela (`far`, a queda ao longo do comprimento); a luz difusa do céu no
 * piso junto a cada lanceta (`sky`, por unidade de opacidade do céu enluarado, o luar da lanceta sem
 * lua, SKY_GLOW); e, no clarão, a luz que ele traz pela lanceta voltada para ele (`flash`, com o céu do
 * relâmpago cobrindo todo o vidro: a de uma poça nítida junto à parede, espalhada na claridade larga,
 * STORM_POOL), a parede em volta da lanceta (`wash`), o piso e o pé da parede onde a luz dele pousa
 * (`room`) e o lado do candelabro voltado para a janela (`rim`). Os ganhos do clarão valem sobre o que
 * está pintado antes de qualquer luz quente: multiplicar o calor das velas as faria arder mais a cada
 * relâmpago. Por isso `wash` é alto: ele multiplica só a pedra escura da parede, sem o luar e as
 * velas por cima, e no padrão leva a moldura junto ao batente a ≈ 2× na altura do peitoril e a ≈ 1,6×
 * na da imposta, abaixo do vidro; o lambril, só com o reflexo, fica em ≈ 1,3×.
 * Luzes somam; ganhos um sobre o outro se multiplicam, Cb·(1 + g₁)·(1 + g₂). Por isso, onde duas
 * pousam no mesmo piso, uma passa sob a outra dividida por 1 + o ganho dela, e as duas somam,
 * Cb·(1 + g₁ + g₂): o reflexo e o céu difuso sob a poça do luar (hi-room-floor) e, no relâmpago, sob a
 * claridade dele (hi-storm-hole). A claridade do relâmpago soma à poça do luar até um teto
 * (FLASH_CEILING, hi-storm-under-pool): somados sem ele, os dois ganhos levavam a poça, com luar e
 * relâmpago no máximo, a um holofote tão claro quanto o vidro que a acende.
 * Medido no quadro (seed 113, 60 fps; luma somada, média e p90, contra o mesmo frame sem luar ou sem
 * relâmpago): no escuro (790), a poça do luar soma ≈ +21 (p90 +36) e, com luar 1, ≈ +31 (p90 +54);
 * junto à lanceta sem lua o céu difuso soma < +1 (no máximo ≈ +6 a +9), e o vidro dela fica em ≈ 3/4
 * do da lua (≈ 44 contra ≈ 59). No pico do relâmpago pela lanceta da lua (173), a claridade soma
 * ≈ +20 sobre a poça (≈ +25 sem luar: perto do teto ela soma menos; é a média da área, e no miolo de
 * cada vidraça acesa ela soma só ≈ 1/3 do que somaria sem luar, de modo que, no pico, as vidraças
 * ficam com ≈ metade do contraste contra o piso em volta: a poça desbota por um instante, sem acender
 * nem ganhar nitidez) e o p90 do piso ali fica em ≈ 105
 * contra a mediana ≈ 131 do vidro aceso; com luar e relâmpago no máximo, ≈ 127 contra ≈ 156. Pela
 * lanceta sem lua (803), a claridade soma ≈ +25 onde a poça cairia (máximo ≈ +44), ≈ 67 contra ≈ 125
 * do vidro; no máximo, ≈ 78 contra ≈ 150. Nada satura.
 */
const GAIN = {moon: 30, flash: 4.2, glow: 0.25, far: 0.35, wash: 5, room: 0.9, rim: 0.6, sky: 30} as const;
/**
 * A luz que o clarão traz por uma lanceta com o céu dele cobrindo todo o vidro, como o ganho (por canal,
 * no tom do clarão sobre o mármore) de uma poça nítida junto à parede. A claridade do relâmpago
 * (STORM_POOL) é essa luz, espalhada; exportada para os testes.
 */
export const FLASH_POOL_GAIN: Rgb = rgb((flash, c) => GAIN.flash * flash * MARBLE_BALANCE[c]!, FLASH_TINT);
/**
 * O teto da luz que uma lanceta leva ao piso, em luma: FLASH_POOL_GAIN, o de uma poça tão clara quanto
 * o vidro todo aceso. A claridade do relâmpago soma à poça do luar pela mesma lei com que, antes, o
 * clarão somava a ela: g + h·(1 − g/FLASH_CEILING), que cresce com as duas e nunca passa do teto
 * (hi-storm-under-pool).
 */
const FLASH_CEILING = lumaOfRgb(FLASH_POOL_GAIN);
/**
 * Num relâmpago, a lanceta voltada para ele recebe a luz do raio e das nuvens acesas junto dele, que
 * entra no salão larga e macia (STORM_POOL) no piso, na parede em volta, no pé dela e no candelabro. A
 * da parede oposta vê só o céu clarear: o vidro clareia (com a força `far` do relâmpago), mas no salão
 * entra só FAR_LIGHT dessa luz, difusa, no pé da parede e no candelabro, sem a claridade no piso. Em
 * nenhuma das duas o clarão muda a poça do luar, que segue no nível da lua.
 */
const FAR_LIGHT = 0.2;
/**
 * A pedra encostada no vidro da lanceta oposta (batente, peitoril e a moldura em volta, FLASH_WASH)
 * recebe um pouco mais que o salão: é a primeira coisa que a luz do céu aceso atravessando o vidro
 * encontra. Com FAR_LIGHT, o vidro subia ≈ 2/3 do que sobe o da janela voltada para o raio e a pedra
 * junto dele, ≈ 1/6: por um instante, o vidro lia como um painel aceso por trás, colado na parede.
 * Assim, ela acompanha o clarão que se vê no vidro, ainda bem abaixo da janela voltada para o raio.
 */
const FAR_WASH = 0.35;

/**
 * A luz de um relâmpago não vem de um ponto, como a da lua (meio grau de céu), e sim do raio e das
 * nuvens acesas em volta dele, dezenas de graus de céu. Pela lanceta, uma fonte assim não desenha no
 * piso vidraças, barras nem a borda da janela: cada ponto do céu aceso manda a luz para um lugar, e o
 * conjunto é uma claridade larga e macia. É essa a luz do clarão no piso, pelas duas lancetas: uma
 * elipse no plano do piso, centrada na pegada da lanceta (a da poça do luar, desenhada na metade
 * esquerda e espelhada como ela) e maior que ela `spread` m para cada lado, ao longo da luz e de lado.
 * Nítida, pela lanceta sem lua, ela repetia a poça do luar espelhada, com as mesmas vidraças e barras:
 * a imagem de duas luas; pela da lua, a poça passava do luar a um desenho mais claro das mesmas
 * vidraças, e a lua parecia se acender. Agora, na lanceta da lua, a claridade se soma à poça do luar,
 * que não muda (hi-storm-under-pool).
 */
const STORM_POOL = {spread: 0.55} as const;
/** A queda da claridade do relâmpago, do centro à borda da elipse (STORM_POOL): larga e macia, sem borda. */
const STORM_FALLOFF = [[0, 1], [0.3, 0.85], [0.6, 0.45], [0.85, 0.12], [1, 0]] as const;
/**
 * A elipse da claridade do relâmpago (na metade esquerda, espelhada como a poça) e o ganho no centro
 * dela, como fração do ganho do clarão (GAIN.flash) numa poça nítida junto à parede (`peak`): o que dá
 * a ela, somada sobre o piso, a mesma luz que uma poça nítida do clarão somaria, com a queda ao longo
 * dela (GAIN.far), nas vidraças acesas. É a luz do clarão pela lanceta, só espalhada: no centro, ≈ 0,36
 * do ganho que a poça nítida teria junto à parede.
 */
const STORM_POOL_MAP = (() => {
  const run = Math.hypot(MOON_DIRECTION.x, MOON_DIRECTION.z);
  const [hx, hz] = [MOON_DIRECTION.x / run, MOON_DIRECTION.z / run];
  const points = MOON_POOL_PANES.flat();
  const [along, across] = [points.map(([x, z]) => x * hx + z * hz), points.map(([x, z]) => z * hx - x * hz)];
  const [mid, half] = [(values: number[]) => (Math.min(...values) + Math.max(...values)) / 2,
    (values: number[]) => (Math.max(...values) - Math.min(...values)) / 2];
  const [s, t] = [mid(along), mid(across)];
  const [a, b] = [half(along) + STORM_POOL.spread, half(across) + STORM_POOL.spread];
  const centre = [s * hx - t * hz, s * hz + t * hx] as const;
  const ellipse = floorEllipse(centre, [hx, hz], a, b);
  // A luz de cada uma, somada no piso em quadrados de `cell` m: a da poça nítida, a queda dela (de 1 a
  // GAIN.far ao longo de MOON_POOL_AXIS, na tela) sobre as vidraças acesas; a da elipse, a queda
  // radial dela (STORM_FALLOFF) onde ela cai no piso, pela projeção.
  const {from, to} = MOON_POOL_AXIS;
  const fade = ([x, y]: Point) => 1 + (GAIN.far - 1) * Math.min(1, Math.max(0,
    ((x - from[0]) * (to[0] - from[0]) + (y - from[1]) * (to[1] - from[1])) / ((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2)));
  const falloff = (r: number) => {
    const next = STORM_FALLOFF.findIndex(([offset]) => offset >= r);
    if (next < 0) return 0;
    const [[r0, f0], [r1, f1]] = [STORM_FALLOFF[Math.max(0, next - 1)]!, STORM_FALLOFF[next]!];
    return r1 === r0 ? f1 : f0 + ((f1 - f0) * (r - r0)) / (r1 - r0);
  };
  const sum = (x0: number, x1: number, z0: number, z1: number, cell: number, value: (x: number, z: number) => number) => {
    let total = 0;
    for (let x = x0 + cell / 2; x < x1; x += cell) for (let z = z0 + cell / 2; z < z1; z += cell) total += value(x, z) * cell * cell;
    return total;
  };
  const pool = MOON_POOL_PANES.reduce((total, pane) => {
    const [xs, zs] = [pane.map(([x]) => x), pane.map(([, z]) => z)];
    return total + sum(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), 0.01,
      (x, z) => (pointInPolygon([x, z], pane) ? fade(project(x, 0, z)) : 0));
  }, 0);
  const reach = Math.max(a, b) * 1.5;
  const patch = sum(centre[0] - reach, centre[0] + reach, centre[1] - reach, centre[1] + reach, 0.02,
    (x, z) => falloff(ellipse.radius(project(x, 0, z))));
  return {...ellipse, peak: pool / patch};
})();

/**
 * O feixe no ar são os próprios raios da lua (MOON_SHAFT_RAYS), cada um do vidro ao ponto do piso onde
 * pousa: traços finos (`width`, em px) e fracos (`ray`), um sobre o outro, que o desfoque (hi-beam-soft)
 * junta. Assim ele clareia na medida do ar aceso que o olho atravessa: mais no meio, onde os raios de
 * todas as vidraças se cruzam, e nada na borda, sem a cunha de luz chapada e de beira reta que um
 * contorno preenchido por igual deixava deitada no piso. Só a lanceta que vê a lua tem o feixe, e o
 * relâmpago não o acende: os raios da lua têm a direção dela, e a luz do clarão, que vem de um pedaço
 * largo do céu, não desenha feixe nenhum (ela pousa larga no piso, STORM_POOL, e no reflexo,
 * FLASH_ROOM). Aceso no clarão, o feixe da lua lia como a lua se acendendo, e o de uma lanceta sem lua,
 * como uma segunda lua. `moon` é a opacidade do conjunto por unidade de opacidade do luar. Medido no
 * padrão (seed 113, frame 803, com a lua do outro lado, o mesmo desenho espelhado), no piso sob o feixe
 * e fora da poça: o luar soma ≈ +3 de luma (mediana) contra ≈ +31 na poça; na borda do feixe a luz
 * sobe de 0 em ≈ 40 px.
 */
const SHAFT = {width: 3, ray: 0.18, moon: 7} as const;
/**
 * O feixe ao longo do eixo (MOON_SHAFT_AXIS, do vidro ao ponto do piso): pares [offset, opacidade].
 * Quase nada sobre o vidro, cheio no ar sob a lanceta e diante do lambril (≈ 0,3–0,6) e baixo sobre o
 * piso: ali, a névoa leria como luz pousada, e o que acende o piso é a poça.
 */
const BEAM_PROFILE = [[0, 0.03], [0.25, 0.35], [0.45, 0.55], [0.6, 0.32], [0.8, 0.12], [1, 0.1]] as const;
/**
 * O feixe no ar se dissipa ao se aproximar da área de conteúdo, sem borda reta: a máscara
 * (hi-box-fade) cresce de 0, na borda da caixa, a 1 a SHAFT_FADE px dela. À esquerda da caixa isso o
 * apaga antes de x 410; abaixo dela, onde o ar sobre o piso não cobre nada, ele segue até a poça. O
 * reflexo do clarão no salão (FLASH_ROOM) se apaga pela mesma máscara.
 */
export const SHAFT_FADE = 100;
/**
 * Quanto do feixe a máscara deixa ver num ponto da tela (metade esquerda; a direita é o espelho): a
 * distância até a caixa, pela esquerda, por baixo ou pela quina entre as duas, sobre SHAFT_FADE.
 * Maior que zero em todo ponto fora da caixa por esses lados; zero dentro dela.
 */
export const shaftVisibility = ([x, y]: Point) =>
  Math.min(1, Math.hypot(Math.max(0, CONTENT_BOX.left - x), Math.max(0, y - CONTENT_BOX.bottom)) / SHAFT_FADE);
/**
 * Onde o clarão de cada lanceta ilumina a parede em volta (metade esquerda), e os raios da elipse. O
 * céu entra de cima para baixo: o mais claro fica no peitoril e na parte baixa do batente, que a luz
 * atravessa, e vai sumindo pela moldura até a ponta do arco, que ainda leva uma parte. O vidro e a
 * pedra dele ficam de fora (hi-lit-walls). A elipse é estreita: acaba antes das velas, que ficam com
 * a própria luz.
 */
const FLASH_WASH = leftWall()(WINDOW.u, WINDOW.sill + 40);
const FLASH_WASH_RADII = [120, 335] as const;
/**
 * Abaixo do peitoril, a luz que desce pela lanceta não alcança a parede: a pedra do peitoril a
 * sombreia, e o lambril fica só com o que o salão devolve. A máscara hi-wash-fade dá o peso do clarão
 * na parede por altura (pares [altura em cm, peso]): inteiro até logo abaixo do peitoril, cerca de um
 * terço no lambril e um pouco menos no pé da parede. Na tela, as alturas são tomadas no eixo da lanceta.
 */
const WASH_FADE = [[WINDOW.sill + 10, 1], [WINDOW.sill - 60, 0.4], [0, 0.35]] as const;
const WASH_FADE_Y = WASH_FADE.map(([v]) => leftWall()(WINDOW.u, v)[1]);
/**
 * O relâmpago entra pelas lancetas rumo à câmera e ao centro, como o luar, e pousa no piso entre o pé
 * da parede, sob a lanceta, e a poça: é dali que o salão o devolve, um reflexo frio no piso e no pé
 * da parede em volta, longe do candelabro. A máscara hi-box-fade o apaga antes das bordas da área de
 * conteúdo, onde o fundo, que não clareia, marcaria um recorte. No piso, ele soma à poça do luar e à
 * claridade do relâmpago (hi-room-floor, hi-storm-hole).
 */
const FLASH_ROOM = {x: 400, y: 945, rx: 320, ry: 200} as const;
/**
 * Sobre o jogo, o clarão é pintado por cima, sem mistura: a opacidade que, no miolo, clareia a parede
 * escura mais ou menos como o ganho do salão opaco, um pouco abaixo, porque cobrir apaga a textura.
 * Na pedra, a cor (WALL_LIGHT) é um verde-água claro: cobrir soma α·(cor − parede), e o salão opaco
 * soma parede × ganho × FLASH_TINT, que, sobre o verde-acinzentado da pedra, dá R:G:B ≈ 0,77:1:1. Com
 * esta cor, o que ela soma tem esse tom em toda a parede, do lambril ao batente; um branco-azulado
 * somava um cinza neutro, e o clarão lia como névoa diante da parede, e não como a luz fria do salão.
 * Cobrir também achata o que é mais claro: o tampo do peitoril, logo abaixo do vidro, que o ganho do
 * salão opaco leva quase ao branco, ficava no tom da parede. Ele leva uma cobertura própria, só nele
 * (SILL_TOPS), de um branco frio (SILL_LIGHT), forte em todo o comprimento (SILL_STRENGTH), para a
 * borda acesa sob a janela continuar lá. Medido no padrão (seed 113, frame 803, janela esquerda): no
 * batente, a cobertura soma ≈ (39, 51, 52) de RGB contra ≈ (44, 59, 61) no salão opaco; o tampo vai de
 * ≈ 93 a ≈ 189 de luma (≈ 206 no salão opaco).
 * O veludo leva uma cobertura própria, de um vermelho claro (VELVET_LIGHT): a luz fria sobre ele
 * clareia o vermelho, não o desbota para um rosa acinzentado. O ouro velho sobre ele (cordão, borla e
 * argolas) não leva nem o vermelho do veludo nem o frio da parede, e sim um dourado claro
 * (TIEBACK_LIGHT), com o dobro da força no degradê (TIEBACK_STRENGTH): a luz multiplica o que está
 * pintado, e o ouro, claro, ganha bem mais que o veludo escuro, como no salão opaco.
 */
const FLASH_COVER = {wash: 0.7, room: 0.1, velvet: 1, sill: 1} as const;
const WALL_LIGHT = '#B9FFFF';
const SILL_LIGHT = '#DCFAF0';
const SILL_STRENGTH = 2.5;
const VELVET_LIGHT = '#DC6D65';
const TIEBACK_LIGHT = '#FFD98A';
const TIEBACK_STRENGTH = 2;
/** Uma cobertura do clarão sobre o jogo: a cor no centro da elipse, com a mesma queda de FLASH_FALLOFF. */
const coverStops = (color: string, strength = 1) => (
  <>
    <stop stopColor={color} stopOpacity={Math.min(1, strength)} />
    <stop offset="0.45" stopColor={color} stopOpacity={Math.min(1, 0.36 * strength)} />
    <stop offset="1" stopColor={color} stopOpacity="0" />
  </>
);
/** Altura do vidro na tela, para o degradê do céu no clarão. */
const GLASS_SPAN = [leftWall(-WINDOW.reveal)(WINDOW.u, WINDOW.spring + 90)[1], leftWall(-WINDOW.reveal)(WINDOW.u, WINDOW.sill)[1]] as const;
const WASH_SHAPE = {cx: FLASH_WASH[0], cy: FLASH_WASH[1], rx: FLASH_WASH_RADII[0], ry: FLASH_WASH_RADII[1]} as const;
const ROOM_SHAPE = {cx: FLASH_ROOM.x, cy: FLASH_ROOM.y, rx: FLASH_ROOM.rx, ry: FLASH_ROOM.ry} as const;
/**
 * shaftVisibility, desenhada (o conteúdo da máscara hi-box-fade): rampas à esquerda e abaixo da
 * caixa e, na quina entre elas, a distância radial até o canto; as três se encontram sem degrau nas
 * linhas x 410 e y 850.
 */
const BOX_FADE = (
  <>
    <rect width={CONTENT_BOX.left} height={CONTENT_BOX.bottom} fill="url(#hi-box-fade-x)" />
    <rect x={CONTENT_BOX.left} y={CONTENT_BOX.bottom} width={1920 - CONTENT_BOX.left} height={1080 - CONTENT_BOX.bottom} fill="url(#hi-box-fade-y)" />
    <rect y={CONTENT_BOX.bottom} width={CONTENT_BOX.left} height={1080 - CONTENT_BOX.bottom} fill="url(#hi-box-fade-corner)" />
  </>
);

/**
 * O clarão de cada lanceta nas paredes (metade esquerda, a direita espelhada), com a luz que entra por
 * ela (inteira na voltada para o raio; na outra, FAR_WASH e FAR_LIGHT): em volta da lanceta (`wash`,
 * WASH_SHAPE) e no pé da parede, onde a luz pousa (`room`, ROOM_SHAPE; o piso sob ele é aceso junto à
 * poça, antes das luzes quentes do piso). Desenhado logo depois da arquitetura, antes do calor das
 * velas e do luar, porque um ganho sobre a luz das velas as faria arder a cada relâmpago.
 * No salão opaco, é ganho sobre o que está pintado (o veludo fica mais vermelho, e não rosado); as
 * camadas ficam no quadro também fora do clarão, com ganho zero (cor preta: Cb·(1 + 0) = Cb, pois ali
 * tudo é opaco), porque uma mistura que aparecesse só no clarão faria o navegador compor o quadro de
 * outro jeito e mudaria as bordas suavizadas justo nesses frames. Sobre o jogo não há mistura nenhuma:
 * a simples presença de uma camada color-dodge muda o alpha das bordas recortadas (e não de modo
 * estável entre renders). Ali o clarão é luz comum, pintada só enquanto dura, no miolo das superfícies
 * mantidas, onde o alpha já é 1 e não pode mudar: fria na parede, vermelho-clara no veludo e dourada
 * no ouro das amarras (cada luz mascarada fora das superfícies das outras).
 */
const FlashOnWalls = ({wash, room, transparent}: {wash: readonly number[]; room: readonly number[]; transparent: boolean}) => (
  <>
    {wash.map((flash, i) => (
      <g key={i} transform={i ? MIRROR : undefined}>
        {!transparent && <>
          <ellipse {...WASH_SHAPE} fill={`url(#hi-flash-wash-${i})`} clipPath="url(#hi-lit-walls)" mask="url(#hi-wash-fade)" style={DODGE} />
          <ellipse {...ROOM_SHAPE} fill={`url(#hi-flash-room-${i})`} clipPath="url(#hi-lit-walls)" mask="url(#hi-box-fade)" style={DODGE} />
        </>}
        {transparent && flash > 0 && <>
          <ellipse {...WASH_SHAPE} fill="url(#hi-flash-cover)" opacity={flash * FLASH_COVER.wash}
            clipPath="url(#hi-lit-walls-core)" mask="url(#hi-bare-walls)" />
          <g clipPath="url(#hi-lit-walls-core)">
            <ellipse {...WASH_SHAPE} fill="url(#hi-flash-sill)" opacity={flash * FLASH_COVER.sill}
              clipPath="url(#hi-sill-tops)" mask="url(#hi-bare-walls)" />
          </g>
          <ellipse {...ROOM_SHAPE} fill="url(#hi-flash-cover)" opacity={room[i]! * FLASH_COVER.room}
            clipPath="url(#hi-lit-core)" mask="url(#hi-bare-room)" />
          <ellipse {...WASH_SHAPE} fill="url(#hi-flash-velvet)" opacity={flash * FLASH_COVER.velvet}
            clipPath="url(#hi-velvet)" mask="url(#hi-no-tieback)" />
          <ellipse {...ROOM_SHAPE} fill="url(#hi-flash-velvet)" opacity={room[i]! * FLASH_COVER.velvet * (FLASH_COVER.room / FLASH_COVER.wash)}
            clipPath="url(#hi-velvet)" mask="url(#hi-no-tieback-room)" />
          <ellipse {...WASH_SHAPE} fill="url(#hi-flash-tieback)" opacity={flash * FLASH_COVER.velvet} clipPath="url(#hi-tieback)"
            mask="url(#hi-wash-fade)" />
          <ellipse {...ROOM_SHAPE} fill="url(#hi-flash-tieback)" opacity={room[i]! * FLASH_COVER.velvet * (FLASH_COVER.room / FLASH_COVER.wash)}
            clipPath="url(#hi-tieback)" mask="url(#hi-box-fade)" />
        </>}
      </g>
    ))}
  </>
);

/** Meia largura da parte visível de cada luz (LANCET.spans), com 3 px de folga da pedra. */
const LIGHT_REACH = LANCET.spans.map(([left, right]) => (right - left) / 2 - 3);
/**
 * O alto das árvores em cada luz, na tela: a menor altura do contorno delas em toda a parte visível
 * da luz, até a pedra, aonde o brilho do raio chega. As copas são pontas de pinheiro, nas duas luzes,
 * e, nas bordas da luz, sobem íngremes.
 */
const TREE_TOPS = LANCET.spans.map(([left, right]) => {
  const outlines = flattenPath(LANCET.trees).map(({points}) => points);
  let top = Infinity;
  for (let x = left; x <= right; x += 0.5) {
    for (const outline of outlines) {
      outline.forEach((a, k) => {
        const b = outline[(k + 1) % outline.length]!;
        if (a[0] !== b[0] && (a[0] - x) * (b[0] - x) <= 0) top = Math.min(top, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
      });
    }
  }
  return top;
});
/**
 * Onde o raio se apaga, em px acima do alto das árvores da luz dele: de `from` a `to` o canal e o
 * brilho em volta vão a zero. O canal segue por trás das árvores, mas um trecho que descesse rente ao
 * contorno de uma copa deixaria o brilho recortado nele, um arco branco e liso que lê como a árvore
 * acesa pelo contorno, e não como um raio que some atrás dela. Assim ele se perde na claridade do
 * horizonte antes de chegar às copas.
 */
const BOLT_FADE = {from: 32, to: 2} as const;
/**
 * Os passos de um galho: para fora (`out`, em rad do prumo, rumo ao lado do galho) e quase a prumo
 * (`back`, positivo para fora, negativo de volta), cada um com no máximo `step` da meia largura da
 * luz de lado; a menos de `edge` px da borda, o galho acaba. Os passos de volta, de no máximo ≈ 3 px,
 * só dobram o canal: numa luz de 20 a 25 px, galhos que iam de uma borda à outra e voltavam, em
 * saltos de 7 a 14 px, empilhavam colchetes (⊏⊐) que liam como um rabisco, e não como um canal que
 * se ramifica.
 */
const BRANCH = {out: [0.55, 0.95], back: [-0.35, 0.1], step: 0.4, edge: 1} as const;

/**
 * Um raio visto pela lanceta, por trás da parte visível de uma das luzes (LANCET.spans: a da frente
 * é em parte escondida pelo batente). O canal desce do alto do céu em dois tipos de trecho: retas
 * longas, de 15 a 34 px, quase a prumo, e saltos curtos e bem inclinados. Onde um tipo dá lugar ao
 * outro, o rumo muda num ângulo vivo, e nunca vêm mais de dois do mesmo tipo seguidos: as dobras não
 * faltam em nenhuma seed. Os saltos pendem para um ponto da luz que muda de tempos em tempos (o canal
 * serpenteia devagar), mas o lado de cada um é sorteado, sem ritmo, e nenhum trecho cruza a luz de
 * uma borda à outra: numa luz de 20 a 25 px, diagonais longas indo e voltando entre as bordas leriam
 * como um zigue-zague desenhado, e não como um raio. Tudo é medido na própria luz (`reach`), e as
 * dobras são as mesmas nas duas. Um ou dois galhos saem do alto do tronco e descem em trechos curtos
 * (BRANCH), ora inclinados para o lado mais aberto da luz, ora quase a prumo (os três primeiros são
 * inclinado, a prumo, inclinado: duas dobras vivas em qualquer seed). Eles derivam sempre para o
 * mesmo lado, se afinam e se apagam rumo à ponta, e acabam onde a luz acaba, como se seguissem por
 * trás da pedra. Ele está longe, lá fora: é desenhado na tela, e
 * não no plano do vidro, que o achataria com o escorço da parede. O desenho depende só da seed do
 * relâmpago; as vidraças o recortam, e o chumbo, as árvores e o rendilhado passam na frente dele. Ele
 * se apaga logo acima das copas da sua luz (BOLT_FADE).
 */
const lightningBolt = (shape: number) => {
  const random = createSeededRandom(shape);
  const light = random() < 0.5 ? 0 : 1;
  const [left, right] = LANCET.spans[light];
  const centre = (left + right) / 2;
  const reach = LIGHT_REACH[light]!;
  // Em volta do centro da luz: o espaço até a borda dela, à direita (+1) ou à esquerda (−1) de x.
  const room = (x: number, side: number) => Math.max(0, reach - side * x);
  const glass = leftWall(-WINDOW.reveal);
  const bottom = glass(WINDOW.u, WINDOW.sill + 10)[1];
  const trunk: Point[] = [[randomBetween(random, -0.6, 0.6) * reach, glass(WINDOW.u, WINDOW.spring + 120)[1]]];
  let target = randomBetween(random, -0.8, 0.8) * reach;
  let retarget = trunk[0]![1] + randomBetween(random, 50, 130);
  let [run, repeats] = [false, 0];
  while (trunk[trunk.length - 1]![1] < bottom) {
    const [x, y] = trunk[trunk.length - 1]!;
    if (y > retarget) {
      target = randomBetween(random, -0.8, 0.8) * reach;
      retarget = y + randomBetween(random, 50, 130);
    }
    const next = repeats >= 2 ? !run : random() < 0.45;
    [run, repeats] = [next, next === run ? repeats + 1 : 1];
    // O lado é sorteado, com mais chance rumo ao alvo quanto mais longe ele está.
    let side = random() < Math.min(0.85, Math.max(0.15, 0.5 + (0.45 * (target - x)) / reach)) ? 1 : -1;
    if (run) {
      // Reta: até 0,25 rad do prumo; sem espaço para um lado, ela pende para o outro.
      const [length, heading] = [randomBetween(random, 15, 34), randomBetween(random, 0.03, 0.25)];
      if (room(x, side) < length * Math.sin(heading)) side = -side;
      trunk.push([x + side * length * Math.sin(heading), y + length * Math.cos(heading)]);
    } else {
      // Salto: de 30 a 90% da meia largura, de 0,62 a 1,15 rad do prumo, sem passar da borda.
      if (room(x, side) < 0.3 * reach) side = -side;
      const dx = Math.min(randomBetween(random, 0.3, 0.9) * reach, room(x, side));
      trunk.push([x + side * dx, y + dx / Math.tan(randomBetween(random, 0.62, 1.15))]);
    }
  }
  const branches = Array.from({length: 1 + Math.floor(random() * 2)}, () => {
    const start = trunk[Math.floor(randomBetween(random, 0.15, 0.55) * trunk.length)]!;
    // O galho deriva para o lado mais aberto da luz e nunca volta: um canal que se afasta do tronco.
    const away = room(start[0], 1) >= room(start[0], -1) ? 1 : -1;
    const length = randomBetween(random, 35, 85);
    const branch: Point[] = [start];
    let [out, repeats] = [false, 0];
    while (branch[branch.length - 1]![1] - start[1] < length || branch.length < 7) {
      const [x, y] = branch[branch.length - 1]!;
      const index = branch.length - 1;
      let next = index < 3 ? index !== 1 : repeats >= 2 ? !out : random() < 0.5;
      // Na borda da luz, o galho passa por trás da pedra: acaba ali, sem ricochetear para o outro lado.
      if (next && room(x, away) < BRANCH.edge) {
        if (branch.length >= 7) break;
        next = false;
      }
      [out, repeats] = [next, next === out ? repeats + 1 : 1];
      const dy = randomBetween(random, 3, 8);
      if (out) {
        // Um passo para fora, bem inclinado, e curto de lado (no máximo `step` da meia largura);
        // contra a borda, ele encurta e guarda o ângulo.
        const slope = Math.tan(randomBetween(random, ...BRANCH.out));
        const dx = Math.min(dy * slope, BRANCH.step * reach, room(x, away));
        branch.push([x + away * dx, y + dx / slope]);
      } else {
        // Um passo quase a prumo, às vezes um pouco de volta: a dobra viva entre dois passos para fora.
        const dx = dy * Math.tan(randomBetween(random, ...BRANCH.back));
        branch.push([Math.max(-reach, Math.min(reach, x + away * dx)), y + dy]);
      }
    }
    return branch;
  });
  const onScreen = (line: readonly Point[]) => line.map(([x, y]): Point => [centre + x, y]);
  const [points, branchPoints] = [onScreen(trunk), branches.map(onScreen)];
  // Cada galho em trechos, de 0 (junto ao tronco) a 1 (na ponta), para afiná-lo e apagá-lo.
  const twigs = branchPoints.flatMap((branch) => branch.slice(1).map((point, i) => ({
    d: pathOf([branch[i]!, point], false), t: i / Math.max(1, branch.length - 2),
  })));
  return {
    trunk: pathOf(points, false),
    branches: branchPoints.map((branch) => pathOf(branch, false)).join(''),
    twigs,
    points,
    branchPoints,
    glow: points[Math.floor(points.length / 2)]!,
    fade: [TREE_TOPS[light]! - BOLT_FADE.from, TREE_TOPS[light]! - BOLT_FADE.to] as const,
  };
};
/** O traçado de cada relâmpago, para os testes: o tronco do raio, na tela (lanceta esquerda). */
export const getLightningBoltPoints = (strike: LightningStrike): readonly Point[] => lightningBolt(strike.shape).points;
/** Os galhos de cada relâmpago, para os testes, cada um a partir do ponto do tronco de onde sai. */
export const getLightningBoltBranches = (strike: LightningStrike): readonly (readonly Point[])[] => lightningBolt(strike.shape).branchPoints;
/** Para os testes: onde o raio começa a se apagar e onde some de todo (y na tela), e o alto das árvores da luz dele. */
export const getLightningBoltFade = (strike: LightningStrike) => {
  const bolt = lightningBolt(strike.shape);
  const light = LANCET.spans.findIndex(([left, right]) => bolt.points.every(([x]) => x >= left && x <= right));
  return {from: bolt.fade[0], to: bolt.fade[1], trees: TREE_TOPS[light]!};
};

/**
 * Quanto o céu do relâmpago cobre o vidro enluarado de uma lanceta (0–1): cresce com o clarão até o
 * fim da escala (sem teto antes de 1), mais depressa no começo. A claridade do relâmpago no piso, que
 * é a luz desse vidro, segue a mesma medida.
 */
const skyOf = (light: HauntedInteriorElement) => light.opacity ** 0.7;
/**
 * A poça do luar são MOON_POOL_SAMPLES camadas, cada uma com 1/N da opacidade, e o filtro dela
 * multiplica o alpha por POOL_NORMAL: onde todas cobrem, camadas de alpha `layer` somam poolAlpha.
 * layerAlpha é o inverso: o alpha de cada camada para que somem `alpha`.
 */
const poolAlpha = (layer: number) => Math.min(1, POOL_NORMAL * (1 - (1 - layer / MOON_POOL_SAMPLES) ** MOON_POOL_SAMPLES));
const layerAlpha = (alpha: number) => MOON_POOL_SAMPLES * (1 - (1 - Math.min(1, alpha) / POOL_NORMAL) ** (1 / MOON_POOL_SAMPLES));
/** A queda da poça ao longo do comprimento (MOON_POOL_AXIS): a opacidade do degradê dela. */
const POOL_FADE: Profile = [[0, 1], [1, GAIN.far]];

export type HauntedInteriorPictureProps = {
  props: HauntedInteriorLoopProps;
  scene: HauntedInteriorElement[];
  /** O relâmpago em curso, se houver: dá o desenho do raio. */
  strike?: LightningStrike;
};

/** O quadro inteiro, função pura da cena e do relâmpago em curso: sem hooks, os testes o renderizam. */
export const HauntedInteriorPicture = ({props, scene, strike}: HauntedInteriorPictureProps) => {
  const ofKind = (kind: HauntedInteriorElement['kind']) => scene.filter((item) => item.kind === kind);
  const atmosphere = props.colors[0];
  const moonlight = props.colors[1];
  const candle = props.colors[2] ?? atmosphere;
  const transparent = hasTransparentBackground(props);
  const candles = ofKind('candle');
  const chandelier = ofKind('chandelier')[0]!;
  const sideGlow = [candles.slice(0, 3), candles.slice(3)].map((group) => group.reduce((sum, light) => sum + light.glow, 0) / 3);
  const moons = ofKind('moonlight');
  const lightning = ofKind('lightning');
  const bolt = strike && props.lightningIntensity > 0 ? lightningBolt(strike.shape) : undefined;
  const tint = moonTint(moonlight);
  // A janela voltada para o relâmpago em curso, se ele de fato clareia (com lightningIntensity 0 o
  // quadro é o de um frame sem relâmpago), e a luz dele que entra por cada lanceta: inteira pela
  // voltada para ele; pela outra, FAR_WASH na pedra junto ao vidro e só FAR_LIGHT, difusa, no salão.
  const facing = strike && lightning[strike.side]!.opacity > 0 ? strike.side : undefined;
  const flashIn = (share: number) => lightning.map((light, i) => light.opacity * (i === facing ? 1 : share));
  const [washIn, roomIn] = [flashIn(FAR_WASH), flashIn(FAR_LIGHT)];
  // A luz que pousa no piso em volta da poça (o reflexo do clarão e o céu difuso) passa sob a poça do
  // luar, na lanceta da lua (hi-room-floor), e, no relâmpago, sob a claridade dele, na lanceta voltada
  // para ele (hi-storm-hole), só na medida em que as luzes somam. Fora do relâmpago, recortar ali
  // deixaria no piso o buraco de uma luz que não existe.
  const floorMask = (i: number) => (i === MOON_SIDE
    ? (i === facing ? 'url(#hi-room-floor-both)' : 'url(#hi-room-floor)')
    : (i === facing ? 'url(#hi-room-floor-storm)' : 'url(#hi-box-fade)'));
  // A poça do luar é a luz direta do vidro no piso, só na lanceta que vê a lua, e o relâmpago não a
  // muda: a luz dele não vem da lua. Uma parte da luz se espalha em volta (glow) e o resto fica no
  // desenho nítido das vidraças, de modo que os dois ganhos juntos deem o total no miolo.
  const moonPool = (() => {
    const total = rgb((moon, c) => moons[MOON_SIDE]!.opacity * GAIN.moon * moon * MARBLE_BALANCE[c]!, tint);
    const glow = rgb((value) => GAIN.glow * value, total);
    return {total, glow, sharp: rgb((value, c) => (1 + value) / (1 + glow[c]!) - 1, total)};
  })();
  // A claridade do relâmpago no piso (STORM_POOL), em cada lanceta: só na voltada para ele, na medida
  // em que o céu dele cobre o vidro (skyOf), e zero fora dele. No centro, `peak` do ganho do clarão.
  const storms = lightning.map((light, i) => rgb((gain) => (i === facing ? STORM_POOL_MAP.peak * skyOf(light) * gain : 0), FLASH_POOL_GAIN));
  const storm = storms[facing ?? MOON_SIDE]!;
  // O que as máscaras deixam passar, ao longo de cada degradê (t, 0–1). Sob um ganho g, uma luz que
  // passa dividida por 1 + g soma a ele: assim o reflexo e o céu difuso passam sob a claridade do
  // relâmpago e sob a poça do luar (`add`). A claridade passa sob a poça por (1 − g/FLASH_CEILING)/(1 + g)
  // (`cap`): soma até o teto. A poça desenha duas camadas, o halo (glow) e as vidraças nítidas (sharp),
  // uma sobre a outra, com a opacidade efetiva poolAlpha; cada máscara as repete, e a das vidraças leva
  // o que falta à do halo para chegar ao total, (1 + glow)·(1 + sharp) − 1.
  const stormPass = (t: number) => 1 / (1 + lumaOfRgb(storm) * shareAt(STORM_FALLOFF, t));
  const poolGainAt = (gain: Rgb) => (t: number) => lumaOfRgb(gain) * poolAlpha(shareAt(POOL_FADE, t));
  const [glowAt, sharpAt] = [poolGainAt(moonPool.glow), poolGainAt(moonPool.sharp)];
  const underPool = (law: (g: number) => number) => ({
    glow: (t: number) => law(glowAt(t)),
    sharp: (t: number) => law((1 + glowAt(t)) * (1 + sharpAt(t)) - 1) / Math.max(1e-9, law(glowAt(t))),
  });
  const poolPass = {
    add: underPool((g) => 1 / (1 + g)),
    cap: underPool((g) => Math.max(0, 1 - g / FLASH_CEILING) / (1 + g)),
  };
  // O céu do relâmpago em cada lanceta: nuvens de tempestade acesas por trás do vidro e, na frente
  // delas, o raio, bem mais claro; árvores, chumbo e vidro quebrado ficam em silhueta contra o clarão.
  // O raio passa por trás deles (a máscara hi-bolt-behind o corta onde eles estão), então eles
  // guardam o próprio tom e só escurecem com o céu: nada salta a mais que a intensidade pede.
  const lancet = (light: HauntedInteriorElement, side: 0 | 1) => {
    if (light.opacity <= 0) return false;
    const sky = skyOf(light);
    // O raio cresce com a intensidade até o fim da escala; halo e brilho em volta dele se apagam
    // antes do canal (proporcionais a glow²), para a descida não deixar um rastro de fumaça.
    const boltOpacity = bolt ? light.glow * Math.sqrt(props.lightningIntensity) : 0;
    const broken = LANCET.broken[side];
    return (
      <g>
        <g opacity={sky}>
          <path d={LANCET.lights} fill="url(#hi-flash-sky)" />
          {/* Sem vidro no caminho, o céu aparece mais nítido e claro pelo buraco da vidraça. */}
          <path d={broken.hole} fill="#E4EBF4" opacity="0.55" />
        </g>
        {bolt && boltOpacity > 0 && (
          <g opacity={boltOpacity} mask={`url(#hi-bolt-behind-${side})`}>
            <ellipse cx={bolt.glow[0]} cy={bolt.glow[1]} rx="24" ry="140" fill="url(#hi-bolt-sky)" opacity={0.35 * light.glow} />
            <g mask="url(#hi-bolt-fade)">
              <path d={bolt.trunk + bolt.branches} fill="none" stroke="#A9C2FF" strokeWidth="9" strokeLinejoin="bevel" opacity={0.4 * light.glow} filter="url(#hi-bolt-glow)" />
              <path d={bolt.trunk} fill="none" stroke="#EAF0FF" strokeWidth="4" strokeLinejoin="bevel" opacity={0.7 * light.glow} filter="url(#hi-bolt-core)" />
              <g opacity={0.5 * light.glow} filter="url(#hi-bolt-core)">
                {bolt.twigs.map(({d, t}, k) => <path key={k} d={d} fill="none" stroke="#EAF0FF" strokeWidth={3 - 1.2 * t} strokeLinecap="round" opacity={1 - 0.7 * t} />)}
              </g>
              <path d={bolt.trunk} fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="miter" strokeMiterlimit="3" />
              {bolt.twigs.map(({d, t}, k) => <path key={k} d={d} fill="none" stroke="#F4F7FF" strokeWidth={1.4 - 0.6 * t} strokeLinecap="round" opacity={1 - 0.65 * t} />)}
            </g>
          </g>
        )}
        <g opacity={sky}>
          <path d={LANCET.trees} fill="#030707" />
          <path d={LANCET.leading} fill="none" stroke="#050909" strokeWidth="1" opacity="0.7" />
        </g>
        {/* A borda do buraco e as rachaduras seguem nítidas enquanto o clarão se apaga: quando o buraco,
            claro no clarão e escuro no luar, passa pelo tom do vidro, são elas que o mostram. */}
        <g opacity={Math.min(1, sky * 2.5)}>
          <path d={broken.hole} fill="none" stroke="#070B0B" strokeWidth="1" opacity="0.8" />
          <path d={broken.cracks} fill="none" stroke="#070B0B" strokeWidth="0.9" opacity="0.8" />
        </g>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 1920 1080" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="hi-warm-halo">
          <stop stopColor={candle} stopOpacity="0.7" />
          <stop offset="0.22" stopColor={candle} stopOpacity="0.22" />
          <stop offset="1" stopColor={candle} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hi-warm-wash">
          <stop stopColor={candle} stopOpacity="0.55" />
          <stop offset="0.35" stopColor={candle} stopOpacity="0.24" />
          <stop offset="1" stopColor={candle} stopOpacity="0" />
        </radialGradient>
        {/* Luz das velas na parede, no veludo e no piso: supera o vidro enluarado. */}
        <radialGradient id="hi-warm-spill">
          <stop stopColor={candle} stopOpacity="0.55" />
          <stop offset="0.4" stopColor={candle} stopOpacity="0.2" />
          <stop offset="1" stopColor={candle} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hi-flame" x2="0" y2="1">
          <stop stopColor={candle} /><stop offset="0.75" stopColor="#F6D69D" /><stop offset="1" stopColor="#E2A652" />
        </linearGradient>
        <linearGradient id="hi-wax-warm">
          <stop stopColor="#77694f" /><stop offset="0.45" stopColor="#d1bd93" /><stop offset="1" stopColor="#5e5441" />
        </linearGradient>
        <linearGradient id="hi-bronze">
          <stop stopColor="#141813" /><stop offset="0.42" stopColor={BRASS} /><stop offset="0.6" stopColor="#473f2c" /><stop offset="1" stopColor="#141813" />
        </linearGradient>
        <radialGradient id="hi-fog">
          <stop stopColor={atmosphere} stopOpacity="0.64" /><stop offset="0.45" stopColor={atmosphere} stopOpacity="0.22" /><stop offset="1" stopColor={atmosphere} stopOpacity="0" />
        </radialGradient>
        {/* O feixe aparece no ar empoeirado: fraco junto ao vidro, mais cheio no ar sob a lanceta e baixo
            sobre o piso, onde ele leria como luz pousada; ainda visível logo acima da poça (BEAM_PROFILE). */}
        <linearGradient id="hi-beam" gradientUnits="userSpaceOnUse"
          x1={MOON_SHAFT_AXIS.from[0]} y1={MOON_SHAFT_AXIS.from[1]} x2={MOON_SHAFT_AXIS.to[0]} y2={MOON_SHAFT_AXIS.to[1]}>
          {BEAM_PROFILE.map(([offset, opacity]) => <stop key={offset} offset={offset} stopColor={moonlight} stopOpacity={opacity} />)}
        </linearGradient>
        {/* O feixe: os raios da lua, finos e fracos, um sobre o outro (veja SHAFT). */}
        <g id="hi-shaft" fill="none" strokeWidth={SHAFT.width} strokeLinecap="round">
          {MOON_SHAFT_RAYS.map(([from, to], k) => <path key={k} d={pathOf([from, to], false)} opacity={SHAFT.ray} />)}
        </g>
        <radialGradient id="hi-cool-wash">
          <stop stopColor={moonlight} stopOpacity="0.5" /><stop offset="0.5" stopColor={moonlight} stopOpacity="0.18" /><stop offset="1" stopColor={moonlight} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hi-vignette" cx="50%" cy="50%" r="75%">
          <stop offset="0.6" stopColor="#020505" stopOpacity="0" /><stop offset="1" stopColor="#020505" stopOpacity="0.38" />
        </radialGradient>
        <radialGradient id="hi-eye-glow">
          <stop stopColor={candle} stopOpacity="0.55" /><stop offset="1" stopColor={candle} stopOpacity="0" />
        </radialGradient>
        <filter id="hi-beam-soft" x="-30%" y="-10%" width="160%" height="120%"><feGaussianBlur stdDeviation="9" /></filter>
        <filter id="hi-contact-soft" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="5" /></filter>
        {/* A poça: a lanceta projetada ao longo de cada direção do cone da lua. Os filtros devolvem o
            miolo a alpha 1 (POOL_NORMAL); o degradê de cada lado leva a cor do ganho e a queda ao longo
            do comprimento, o mesmo no desenho nítido e no halo. */}
        <g id="hi-pool">{MOON_POOL_LAYERS.map((d, i) => <path key={i} d={d} opacity={1 / MOON_POOL_SAMPLES} />)}</g>
        <filter id="hi-pool-edge" x="-5%" y="-10%" width="110%" height="120%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="0.9" />
          <feComponentTransfer><feFuncA type="linear" slope={POOL_NORMAL} /></feComponentTransfer>
        </filter>
        <filter id="hi-pool-glow" x="-40%" y="-60%" width="180%" height="220%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="8" />
          <feComponentTransfer><feFuncA type="linear" slope={POOL_NORMAL} /></feComponentTransfer>
        </filter>
        {/* As luzes do piso são ganhos, e um sobre o outro se multiplicaria, Cb·(1 + g₁)·(1 + g₂), em
            vez de somar. O reflexo do clarão (FLASH_ROOM) e o céu difuso passam sob a poça do luar
            (hi-room-floor, com as mesmas camadas e filtros da poça) e sob a claridade do relâmpago, na
            lanceta voltada para ele (hi-storm-hole), divididos por 1 + o ganho de cada uma: somados,
            dão Cb·(1 + g₁ + g₂). Sem luar nem clarão, as máscaras deixam tudo passar: não fica no piso
            o buraco de uma poça apagada. A claridade passa sob a poça até o teto (hi-storm-under-pool,
            FLASH_CEILING). Com hi-box-fade, o reflexo ainda se apaga antes da área de conteúdo. */}
        {!transparent && <>
          {(['add', 'cap'] as const).flatMap((law) => (['glow', 'sharp'] as const).map((name) => (
            <linearGradient key={`${law}-${name}`} id={`hi-pool-${law}-${name}`} gradientUnits="userSpaceOnUse"
              x1={MOON_POOL_AXIS.from[0]} y1={MOON_POOL_AXIS.from[1]} x2={MOON_POOL_AXIS.to[0]} y2={MOON_POOL_AXIS.to[1]}>
              {passStops(poolPass[law][name], layerAlpha)}
            </linearGradient>
          )))}
          <mask id="hi-room-floor" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            {BOX_FADE}
            <use href="#hi-pool" fill="url(#hi-pool-add-glow)" filter="url(#hi-pool-glow)" />
            <use href="#hi-pool" fill="url(#hi-pool-add-sharp)" filter="url(#hi-pool-edge)" />
          </mask>
          <radialGradient id="hi-storm-hole" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform={STORM_POOL_MAP.transform}>
            {passStops(stormPass)}
          </radialGradient>
          <mask id="hi-room-floor-storm" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            {BOX_FADE}
            <path d={STORM_POOL_MAP.outline} fill="url(#hi-storm-hole)" />
          </mask>
          <mask id="hi-room-floor-both" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            {BOX_FADE}
            <use href="#hi-pool" fill="url(#hi-pool-add-glow)" filter="url(#hi-pool-glow)" />
            <use href="#hi-pool" fill="url(#hi-pool-add-sharp)" filter="url(#hi-pool-edge)" />
            <path d={STORM_POOL_MAP.outline} fill="url(#hi-storm-hole)" />
          </mask>
          <mask id="hi-storm-under-pool" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            <rect width="1920" height="1080" fill="white" />
            <use href="#hi-pool" fill="url(#hi-pool-cap-glow)" filter="url(#hi-pool-glow)" />
            <use href="#hi-pool" fill="url(#hi-pool-cap-sharp)" filter="url(#hi-pool-edge)" />
          </mask>
        </>}
        {(['sharp', 'glow'] as const).map((name) => (
          <linearGradient key={name} id={`hi-pool-${name}-${MOON_SIDE}`} gradientUnits="userSpaceOnUse"
            x1={MOON_POOL_AXIS.from[0]} y1={MOON_POOL_AXIS.from[1]} x2={MOON_POOL_AXIS.to[0]} y2={MOON_POOL_AXIS.to[1]}>
            <stop stopColor={dodge(moonPool[name])} /><stop offset="1" stopColor={dodge(moonPool[name])} stopOpacity={GAIN.far} />
          </linearGradient>
        ))}
        {/* A claridade do relâmpago no piso de cada lanceta (STORM_POOL), com o escorço do piso. */}
        {storms.map((gain, i) => (
          <radialGradient key={i} id={`hi-storm-pool-${i}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform={STORM_POOL_MAP.transform}>
            {gainStops(gain, STORM_FALLOFF)}
          </radialGradient>
        ))}
        {/* As rampas de hi-box-fade (BOX_FADE). */}
        <linearGradient id="hi-box-fade-x" gradientUnits="userSpaceOnUse" x1={CONTENT_BOX.left} y1="0" x2={CONTENT_BOX.left - SHAFT_FADE} y2="0">
          <stop stopColor="white" stopOpacity="0" /><stop offset="1" stopColor="white" />
        </linearGradient>
        <linearGradient id="hi-box-fade-y" gradientUnits="userSpaceOnUse" x1="0" y1={CONTENT_BOX.bottom} x2="0" y2={CONTENT_BOX.bottom + SHAFT_FADE}>
          <stop stopColor="white" stopOpacity="0" /><stop offset="1" stopColor="white" />
        </linearGradient>
        <radialGradient id="hi-box-fade-corner" gradientUnits="userSpaceOnUse" cx={CONTENT_BOX.left} cy={CONTENT_BOX.bottom} r={SHAFT_FADE}>
          <stop stopColor="white" stopOpacity="0" /><stop offset="1" stopColor="white" />
        </radialGradient>
        <mask id="hi-box-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">{BOX_FADE}</mask>
        {/* Relâmpago: nuvens de tempestade nas vidraças, escuras no alto e claras no horizonte, o raio e o clarão frio em volta. */}
        <linearGradient id="hi-flash-sky" gradientUnits="userSpaceOnUse" x1="0" y1={GLASS_SPAN[0]} x2="0" y2={GLASS_SPAN[1]}>
          <stop stopColor="#5A6E8A" /><stop offset="0.5" stopColor="#8AA1BE" /><stop offset="0.85" stopColor="#B8CEE6" /><stop offset="1" stopColor={moonlight} />
        </linearGradient>
        <radialGradient id="hi-bolt-sky">
          <stop stopColor={LIGHTNING_COLOR} stopOpacity="0.6" /><stop offset="1" stopColor={LIGHTNING_COLOR} stopOpacity="0" />
        </radialGradient>
        {/* O peso do clarão na parede, que cai abaixo do peitoril (WASH_FADE). */}
        <linearGradient id="hi-wash-fade-y" gradientUnits="userSpaceOnUse" x1="0" y1={WASH_FADE_Y[0]} x2="0" y2={WASH_FADE_Y[WASH_FADE_Y.length - 1]}>
          {WASH_FADE.map(([, weight], k) => (
            <stop key={k} offset={(WASH_FADE_Y[k]! - WASH_FADE_Y[0]!) / (WASH_FADE_Y[WASH_FADE_Y.length - 1]! - WASH_FADE_Y[0]!)}
              stopColor="white" stopOpacity={weight} />
          ))}
        </linearGradient>
        <mask id="hi-wash-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
          <rect width="1920" height="1080" fill="url(#hi-wash-fade-y)" />
        </mask>
        {washIn.map((flash, i) => (
          <radialGradient key={i} id={`hi-flash-wash-${i}`}>
            {gainStops(rgb((c) => flash * GAIN.wash * c, FLASH_TINT), FLASH_FALLOFF)}
          </radialGradient>
        ))}
        {/* Sobre o jogo, a mesma luz, pintada por cima (sem mistura): fria na parede, um vermelho claro
            no veludo (hi-velvet) e um dourado claro no ouro das amarras (hi-tieback). Cada luz fica fora
            das superfícies das outras: a fria não passa pelo veludo nem pelo ouro (hi-bare-*), e a
            vermelha não passa pelo ouro (hi-no-tieback*). Em volta da lanceta, essas máscaras levam
            também a queda abaixo do peitoril (hi-wash-fade-y). */}
        {transparent && <>
          <radialGradient id="hi-flash-cover">{coverStops(WALL_LIGHT)}</radialGradient>
          <radialGradient id="hi-flash-sill">{coverStops(SILL_LIGHT, SILL_STRENGTH)}</radialGradient>
          <clipPath id="hi-sill-tops"><path d={SILL_TOPS} /></clipPath>
          <radialGradient id="hi-flash-velvet">{coverStops(VELVET_LIGHT)}</radialGradient>
          <radialGradient id="hi-flash-tieback">{coverStops(TIEBACK_LIGHT, TIEBACK_STRENGTH)}</radialGradient>
          <clipPath id="hi-velvet"><path d={CURTAIN_SHAPES} /></clipPath>
          <clipPath id="hi-tieback"><path d={CURTAIN_TIEBACKS} /></clipPath>
          <mask id="hi-bare-walls" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            <rect width="1920" height="1080" fill="url(#hi-wash-fade-y)" /><path d={CURTAIN_SHAPES} fill="black" /><path d={CURTAIN_TIEBACKS} fill="black" />
          </mask>
          <mask id="hi-bare-room" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            {BOX_FADE}<path d={CURTAIN_SHAPES} fill="black" /><path d={CURTAIN_TIEBACKS} fill="black" />
          </mask>
          <mask id="hi-no-tieback" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            <rect width="1920" height="1080" fill="url(#hi-wash-fade-y)" /><path d={CURTAIN_TIEBACKS} fill="black" />
          </mask>
          <mask id="hi-no-tieback-room" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            {BOX_FADE}<path d={CURTAIN_TIEBACKS} fill="black" />
          </mask>
        </>}
        {roomIn.map((flash, i) => (
          <linearGradient key={i} id={`hi-candelabra-rim-${i}`} gradientUnits="userSpaceOnUse" x1={CANDELABRA_SPAN[1]} y1="0" x2={CANDELABRA_SPAN[0]} y2="0">
            {gainStops(rgb((c) => flash * GAIN.rim * c, RIM_TINT), RIM_FALLOFF)}
          </linearGradient>
        ))}
        {/* A borda das peças finas do candelabro voltada para a janela (RIM_EDGE). */}
        {!transparent && <>
          <filter id="hi-candelabra-edge-soft" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation={RIM_EDGE.soft} /></filter>
          <mask id="hi-candelabra-edge" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            <path d={CANDELABRA_THIN} fill="white" />
            <path d={CANDELABRA_PATHS.arms} fill="none" stroke="white" strokeWidth={ARM_WIDTH} strokeLinecap="round" />
            <g transform={`translate(${-RIM_EDGE.x} ${RIM_EDGE.y})`} filter="url(#hi-candelabra-edge-soft)">
              <path d={CANDELABRA_THIN} fill="black" />
              <path d={CANDELABRA_PATHS.arms} fill="none" stroke="black" strokeWidth={ARM_WIDTH} strokeLinecap="round" />
            </g>
          </mask>
        </>}
        {roomIn.map((flash, i) => (
          <radialGradient key={i} id={`hi-flash-room-${i}`}>
            {gainStops(rgb((c) => flash * GAIN.room * c, FLASH_TINT), ROOM_FALLOFF)}
          </radialGradient>
        ))}
        {/* A luz difusa do céu no piso junto a cada lanceta (SKY_GLOW), com o escorço do piso: a do céu
            enluarado, que é a da lanceta sem lua (SKY_SIDE), a mesma nas duas. */}
        {!transparent && moons.map((_, i) => (
          <radialGradient key={i} id={`hi-sky-glow-${i}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform={SKY_GLOW_MAP.transform}>
            {gainStops(rgb((moon, c) => moons[SKY_SIDE]!.opacity * GAIN.sky * moon * MARBLE_BALANCE[c]!, tint), SKY_FALLOFF)}
          </radialGradient>
        ))}
        {/* O raio está lá fora: árvores, chumbo, borda do buraco e rachaduras de cada janela o cortam. */}
        {LANCET.broken.map((broken, side) => (
          <mask key={side} id={`hi-bolt-behind-${side}`} maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            <path d={LANCET.lights} fill="white" />
            <path d={LANCET.trees} fill="black" />
            <path d={LANCET.leading + broken.hole + broken.cracks} fill="none" stroke="black" strokeWidth="1.2" />
          </mask>
        ))}
        {/* O raio se apaga antes das copas (BOLT_FADE). */}
        {bolt && <>
          <linearGradient id="hi-bolt-fade-y" gradientUnits="userSpaceOnUse" x1="0" y1={bolt.fade[0]} x2="0" y2={bolt.fade[1]}>
            <stop stopColor="white" /><stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="hi-bolt-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            <rect width="1920" height="1080" fill="url(#hi-bolt-fade-y)" />
          </mask>
        </>}
        <filter id="hi-bolt-glow" x="-100%" y="-10%" width="300%" height="120%"><feGaussianBlur stdDeviation="3" /></filter>
        <filter id="hi-bolt-core" x="-60%" y="-10%" width="220%" height="120%"><feGaussianBlur stdDeviation="0.8" /></filter>
        {/* Sobre o jogo, luar e clarões ficam no miolo das superfícies mantidas: o alpha das bordas não muda. */}
        <clipPath id="hi-retained-core"><path d={RETAINED_CORE} /></clipPath>
        <clipPath id="hi-floor-visible"><path d={transparent ? FLOOR_VISIBLE.transparent : FLOOR_VISIBLE.opaque} /></clipPath>
        <clipPath id="hi-side-walls"><path d={SIDE_WALLS} /></clipPath>
        <clipPath id="hi-ceiling"><path d={CEILING} /></clipPath>
        <clipPath id="hi-retained"><path d={RETAINED} /></clipPath>
        <clipPath id="hi-outside-box"><path d={OUTSIDE_BOX} clipRule="evenodd" /></clipPath>
        {/* O que o clarão ilumina nas paredes: elas e o veludo que passa na frente das lancetas, mas
            nunca o plano do vidro: nem o céu, que é a fonte da luz, nem a pedra em volta dele (placa,
            mainel e travessas), vista contra o clarão, em silhueta. O batente e o peitoril, que a luz
            atravessa, clareiam. No piso, que não toca o vidro, basta hi-floor-visible. */}
        <clipPath id="hi-lit-walls"><path d={SIDE_WALLS + TRACERY_PLATE} clipRule="evenodd" /><path d={CURTAIN_SHAPES} /></clipPath>
        <clipPath id="hi-lit-walls-core"><path d={WALLS_CORE + TRACERY_PLATE} clipRule="evenodd" /><path d={CURTAIN_SHAPES} /></clipPath>
        <clipPath id="hi-lit-core"><path d={RETAINED_CORE + TRACERY_PLATE} clipRule="evenodd" /><path d={CURTAIN_SHAPES} /></clipPath>
        {/* A luz se apaga antes de chegar à área de conteúdo: a caixa fica parada e calma. */}
        <filter id="hi-mask-soft" x="-10%" y="-15%" width="120%" height="130%"><feGaussianBlur stdDeviation="10" /></filter>
        <mask id="hi-outside-content" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
          <rect width="1920" height="1080" fill="white" />
          <rect x={CONTENT_BOX.left - 32} y={CONTENT_BOX.top - 32} width={CONTENT_BOX.right - CONTENT_BOX.left + 64}
            height={CONTENT_BOX.bottom - CONTENT_BOX.top + 64} fill="black" filter="url(#hi-mask-soft)" />
        </mask>
      </defs>

      {/* Sobre o jogo, todo o quadro é recortado na área de conteúdo, que fica totalmente transparente. */}
      <g clipPath={transparent ? 'url(#hi-outside-box)' : undefined}>
        <HauntedInteriorArchitecture atmosphere={atmosphere} moonlight={moonlight} candle={candle} transparent={transparent}
          candleIntensity={props.candleIntensity} moonlightIntensity={props.moonlightIntensity}
          lancets={[lancet(lightning[0]!, 0), lancet(lightning[1]!, 1)]}>
          {/* Luz no piso, sob o veludo e os candelabros: o reflexo do relâmpago, a luz difusa do céu junto
              às lancetas, o calor do lustre e das velas, as vidraças acesas que a lanceta da lua estende
              pelo salão e, num relâmpago, a claridade larga dele junto à lanceta voltada para ele. O
              reflexo e o céu vêm primeiro, como ganho sobre o mármore e a faixa ainda sem luz quente (veja
              FlashOnWalls), e passam sob a poça e a claridade na medida certa (floorMask). O céu é uma
              claridade fraca e larga junto ao pé da parede (SKY_GLOW); na lanceta sem lua, é toda a luz
              que entra fora de um relâmpago. */}
          {!transparent && lightning.map((_, i) => (
            <g key={i} transform={i ? MIRROR : undefined}>
              <ellipse {...ROOM_SHAPE} fill={`url(#hi-flash-room-${i})`} clipPath="url(#hi-floor-visible)" mask={floorMask(i)} style={DODGE} />
              <path d={SKY_GLOW_MAP.outline} fill={`url(#hi-sky-glow-${i})`} clipPath="url(#hi-floor-visible)" mask={floorMask(i)} style={DODGE} />
            </g>
          ))}
          <g clipPath="url(#hi-floor-visible)">
            {!transparent && (
              <ellipse cx={CHANDELIER_FLOOR[0]} cy={CHANDELIER_FLOOR[1]} rx="560" ry="120" fill="url(#hi-warm-wash)" opacity={chandelier.glow * 0.2} />
            )}
            {sideGlow.map((glow, i) => (
              <g key={i} transform={i ? MIRROR : undefined}>
                <ellipse cx={CANDLE_POOL[0]} cy={CANDLE_POOL[1]} rx="330" ry="92" fill="url(#hi-warm-spill)" opacity={glow} />
              </g>
            ))}
          </g>
          {/* A poça cai no campo de mármore, fora das faixas: sobre o jogo ela não tem onde pousar. Ela
              ilumina o piso (ganho), não o cobre: juntas e xadrez seguem visíveis dentro dela, também no
              clarão. O halo em volta é a própria poça desfocada (o mármore espalha um pouco da luz): só
              as vidraças acesas o produzem, então a faixa que o peitoril sombreia, a pedra em volta do
              óculo e a sombra das barras continuam mais escuras. O relâmpago não desenha vidraças: pelas
              duas lancetas, a luz dele no piso é a claridade larga (STORM_POOL), que, na da lua, passa
              sob a poça na medida em que as duas somam (hi-storm-under-pool). Ela fica no quadro também
              sem luz, com ganho zero, como as camadas do clarão (veja FlashOnWalls): só acende num
              relâmpago voltado para a lanceta. */}
          {!transparent && moons.map((_, i) => (
            <g key={i} transform={i ? MIRROR : undefined}>
              {i === MOON_SIDE && <>
                <use href="#hi-pool" fill={`url(#hi-pool-glow-${i})`} filter="url(#hi-pool-glow)" clipPath="url(#hi-floor-visible)" style={DODGE} />
                <use href="#hi-pool" fill={`url(#hi-pool-sharp-${i})`} filter="url(#hi-pool-edge)" clipPath="url(#hi-floor-visible)" style={DODGE} />
              </>}
              <path d={STORM_POOL_MAP.outline} fill={`url(#hi-storm-pool-${i})`} clipPath="url(#hi-floor-visible)"
                mask={i === MOON_SIDE ? 'url(#hi-storm-under-pool)' : undefined} style={DODGE} />
            </g>
          ))}
        </HauntedInteriorArchitecture>

        {/* Relâmpago: a parede em volta de cada lanceta e o pé dela, onde a luz pousa, clareiam, sempre
            fora da área de conteúdo e nunca no plano do vidro. Antes do calor das velas e do luar: o
            clarão multiplica a parede pintada, e não a luz que já está nela. */}
        <FlashOnWalls wash={washIn} room={roomIn} transparent={transparent} />

        {/* O lustre aquece o teto ao redor; o teto fica parado enquanto o lustre balança. */}
        {!transparent && (
          <g clipPath="url(#hi-ceiling)">
            <ellipse cx={CHANDELIER_PARTS.glow[0]} cy={CHANDELIER_PARTS.glow[1] - 50} rx="460" ry="170" fill="url(#hi-warm-wash)" opacity={chandelier.glow * 0.75} />
          </g>
        )}

        {/* Calor das velas na parede, no veludo e no retrato, acompanhando as chamas de cada lado. */}
        <g clipPath="url(#hi-side-walls)">
          {sideGlow.map((glow, i) => (
            <g key={i} transform={i ? MIRROR : undefined}>
              <ellipse cx={CANDLE_WASH[0]} cy={CANDLE_WASH[1]} rx="340" ry="480" fill="url(#hi-warm-spill)" opacity={Math.min(1, glow * 1.2)} />
            </g>
          ))}
        </g>

        {/* Luar: a parede em volta de cada lanceta recebe a luz fria (na sem lua, só a do céu, fraca). O
            feixe desce só da que vê a lua, e o relâmpago não o acende (veja SHAFT). */}
        {moons.map((light, i) => (
          <g key={i} transform={i ? MIRROR : undefined}>
            {/* Desenhado na metade esquerda e espelhado. */}
            <g clipPath="url(#hi-side-walls)">
              <ellipse cx={MOON_WASH[0]} cy={MOON_WASH[1]} rx="130" ry="330" fill="url(#hi-cool-wash)" opacity={Math.min(1, light.opacity * 1.3)} />
            </g>
            {/* O feixe se dissipa antes da área de conteúdo e, abaixo dela, chega à poça. */}
            {i === MOON_SIDE && (
              <g mask="url(#hi-box-fade)">
                <g clipPath={transparent ? 'url(#hi-retained-core)' : 'url(#hi-outside-box)'}>
                  <g filter="url(#hi-beam-soft)">
                    <use href="#hi-shaft" stroke="url(#hi-beam)" opacity={light.opacity * SHAFT.moon} />
                  </g>
                </g>
              </g>
            )}
          </g>
        ))}

        {/* Os olhos dos retratos: pintados na tela, compartilham o mesmo escorço. */}
        {ofKind('eyes').map((eyes, index) => (
          <g key={index} opacity={eyes.opacity}>
            {PORTRAIT_EYE_POINTS[index]!.map(([x, y], k) => (
              <g key={k} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${PORTRAIT_SQUASH.toFixed(3)} 1)`}>
                <ellipse rx="13" ry="9" fill="url(#hi-eye-glow)" />
                <path d="M-3 -1 Q0 1 3 -1" stroke={candle} strokeWidth="1.5" fill="none" />
              </g>
            ))}
          </g>
        ))}

        <Chandelier {...chandelier} transparent={transparent} />
        {!transparent && <circle cx={CHANDELIER_PIVOT[0]} cy={ROSE_TOP} r="3" fill="#4a4735" />}
        {/* No salão opaco, o lado de cada candelabro voltado para a janela pega o clarão (ganho zero no
            escuro, como as camadas acima); sobre o jogo, onde não há mistura, ele fica como está. */}
        {[false, true].map((right) => (
          <g key={String(right)} transform={right ? MIRROR : undefined}>
            <Candelabra rim={transparent ? undefined : `url(#hi-candelabra-rim-${right ? 1 : 0})`} />
          </g>
        ))}
        <g mask="url(#hi-outside-content)" clipPath="url(#hi-outside-box)">
          {candles.map((light, i) => (
            <ellipse key={i} cx={light.x} cy={light.y + 10} rx="96" ry="130" fill="url(#hi-warm-halo)" opacity={light.glow * 0.28} />
          ))}
        </g>
        {candles.map((light, i) => <CandleFlame key={i} {...light} solid={transparent} />)}

        {/* Sobre o jogo, névoa e poeira ficam no que resta do salão: paredes e faixas do piso. */}
        <g clipPath={transparent ? 'url(#hi-retained)' : undefined}>
          {ofKind('fog').map((fog, i) => <g key={i} opacity={fog.opacity}>
            <ellipse cx={fog.x} cy={fog.y} rx={660 * fog.scale} ry={FOG_RY * fog.scale} fill="url(#hi-fog)" />
            <ellipse cx={fog.x + 190} cy={fog.y + 34} rx={510 * fog.scale} ry="32" fill="url(#hi-fog)" />
          </g>)}
          {ofKind('dust').map((dust, i) => <circle key={i} cx={dust.x} cy={dust.y} r={dust.scale} fill={moonlight} opacity={dust.opacity} />)}
        </g>
        {!transparent && <rect width="1920" height="1080" fill="url(#hi-vignette)" />}
      </g>
    </svg>
  );
};

export const HauntedInteriorLoop = (props: HauntedInteriorLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return (
    <Canvas {...props}>
      <HauntedInteriorPicture props={props} scene={getHauntedInteriorScene(props, frame, durationInFrames)}
        strike={getActiveStrike(props, frame, durationInFrames)} />
    </Canvas>
  );
};
