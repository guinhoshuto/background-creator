/**
 * NUVEM — a massa do KawaiiLoop v2.
 *
 * PONTO DE VISTA
 * Nuvem kawaii não é vapor e não é ícone de previsão do tempo: é MASSA que já assentou.
 * Então a silhueta tem dois assuntos, e eles são desenhados com regras opostas:
 *
 *   EM CIMA, o ar. Lóbulos de vãos francamente desiguais (60 / 98 / 50 / 25 na base),
 *   cada um com tangente horizontal no topo e no fundo do encaixe — é o piso ARREDONDADO
 *   do vale que troca o V de tesoura pelo encaixe de nuvem. Um beliscão fundo por
 *   silhueta, sempre num lugar diferente: é a assinatura da peça.
 *
 *   EMBAIXO, o peso. Uma linha calma, quase sem concavidade, QUEBRADA NUM LUGAR SÓ —
 *   o bojo, que estufa bem abaixo da linha de base, fora do centro. O peso mora num
 *   ponto; espalhado pelo pé inteiro ele vira lábio de prato, e a nuvem vira poça.
 *
 * A TINTA segue a mesma divisão, e é guache, não render:
 *   - chapa pastel chapada, mais um gradiente curtíssimo (leite no ombro, ameixa no pé);
 *   - a barriga é a MESMA chapa reimpressa fora de registro, três demãos de aresta dura.
 *     Onde as duas chapas não se encontram a ameixa imprime sozinha: engorda onde o
 *     ventre é horizontal, some onde ele vira para cima, e sobra DENTRO dos entalhes —
 *     é dali que nasce a costura entre lóbulos, de sombra, nunca de contorno;
 *   - uma demão a mais só dentro do bojo, com a aresta nascendo e morrendo exatamente
 *     nas duas dobras: é ela que faz o bojo ler como massa pendurada e não como sombra;
 *   - a luz vem em duas passadas, na ordem em que a mão pinta: a LUA, larga e lavada,
 *     pintada transbordando o ombro (quem corta ela é a silhueta, então ela encosta na
 *     borda sem virar contorno); e o FILETE, estreito e forte, por dentro dela, sem
 *     encostar em nada. Mais dois toques secos e um respingo nos lóbulos menores.
 *
 * Tudo isso é chapa de tinta, opacidade e aresta: nenhum <filter>, nenhum blur, nenhum
 * verniz — a peça continua matte sobre fundo claro e continua saturada sobre vídeo.
 */

export interface CloudProps {
  x: number; y: number;   // centro
  scale: number;          // 1 ~= 230px de largura
  squashX: number;        // respiração, ~0.94 a 1.06
  squashY: number;
  rotation: number;       // graus, pequeno
  opacity: number;        // 0 a 1, aplicada no <g>
  variant: number;        // 0, 1 ou 2 — três silhuetas diferentes
  color: string;
  gloss: number;          // 0 a 1 — força do brilho branco
  id: string;
}

/** A tinta da segunda chapa. Ameixa fria: lê como sombra sobre menta, rosa e baunilha. */
const INK = '#463A72';

/**
 * As demãos da barriga: dx, dy, opacidade. As duas verticais engrossam a tinta ao longo
 * de toda a borda de baixo — é o que segura a silhueta quando o vídeo por baixo clareia.
 * A terceira escorrega na diagonal, contra a luz, e sobra sozinha em cada flanco de
 * baixo-direita e dentro de cada entalhe: a costura.
 */
const PLATES: readonly (readonly [number, number, number])[] = [
  [0, -17, 0.05],
  [0, -9, 0.07],
  [-4, -5, 0.105],
];

/** Os dois passes da costura: largo e quase nada, depois estreito e um tico mais forte. */
const SEAM_PASS: readonly (readonly [number, number])[] = [
  [8.5, 0.022],
  [3.6, 0.032],
];

/** Retângulo gigante: com evenodd contra o corpo deslocado sobra "tudo menos o corpo". */
const COVER = 'M-300-300H300V300H-300Z';

interface Silhouette {
  /** A silhueta inteira, centrada na origem. */
  body: string;
  /** A demão extra do bojo: aresta dura nascendo e morrendo nas dobras. */
  bellyCoat: string;
  /** A lua: larga, lavada, transbordando o ombro que pega a luz. */
  lune: string;
  /** O filete: a segunda passada, estreita e forte, por dentro da lua. */
  core: string;
  /** Toques secos que respondem, em lóbulos secundários. */
  touches: readonly string[];
  /** Rabinhos de sombra descendo dos entalhes. */
  seams: readonly string[];
  /** O respingo: cx, cy, rx, ry, giro. */
  speck: readonly [number, number, number, number, number];
}

/* -------------------------------------------------------------- variante 0 */

/**
 * O PÃO — 233 x 130, a nuvem de carregar quadro. Ombro médio à esquerda (vão 60), a
 * CÚPULA logo depois ocupando 98, o beliscão fundo caindo 36 de uma vez, um lóbulo
 * médio (50) e um nó de popa pequeno afinando para a direita. O bojo pendura no centro,
 * 24 abaixo da linha de base, com a dobra macia à direita e sapecada à esquerda.
 */
const SHAPE_0: Silhouette = {
  body: [
    'M-116 8',
    'C-121-10-114-30-100-33',
    'C-92-35-80-34-72-31',     // coroa do ombro: baixa, comprida, caindo para a direita
    'C-66-29-62-26-56-26',     // escama rasa, piso largo
    'C-48-26-50-46-42-56',     // a parede sai com um tico de barriga para fora
    'C-32-70 4-74 18-58',      // A CÚPULA: 98 de vão, coroa de 60
    'C26-46 30-32 42-32',      // o BELISCÃO: cai 36, com piso de 22
    'C52-32 56-46 62-52',
    'C70-56 84-52 92-44',      // lóbulo médio
    'C98-36 106-34 110-28',    // nó de popa, para o flanco não virar chanfro reto
    'C118-18 121-8 117 3',     // ponta direita, redonda
    'C119 20 108 31 92 34',
    'C74 38 58 40 44 42',
    'C38 54 24 66 2 66',       // O BOJO, dobra macia à direita
    'C-20 66-36 58-44 44',     // dobra sapecada à esquerda
    'C-56 48-70 47-80 42',
    'C-90 38-98 38-102 32',
    'C-110 28-117 20-116 8Z',
  ].join(' '),
  bellyCoat: 'M-44 44C-28 54-6 56 16 52C29 49 39 46 44 42L64 130L-64 130Z',
  lune: 'M-57-30C-55-42-47-58-29-68C-35-50-41-38-43-26Z',
  core: 'M-47-30C-45-42-38-55-23-63C-30-50-35-40-38-28Z',
  touches: [
    'M-110 0C-108-16-102-30-92-34',
    'M58-36C62-48 68-54 76-53',
  ],
  seams: [
    'M-56-23C-53-16-54-10-57-5',
    'M42-29C45-18 44-8 40-2',
  ],
  speck: [100, -38, 4.2, 2.8, -34],
};

/* -------------------------------------------------------------- variante 1 */

/**
 * A DERIVA — 247 x 104, duas vezes e meia mais larga que alta. Quatro lóbulos, e os
 * primeiros 51 de vão são um ombro preguiçoso que só sobe, sem coroa nenhuma. A massa
 * se junta à DIREITA do centro, o beliscão vem depois dela, e o bojo cai do lado
 * OPOSTO: nenhuma vertical corta esta nuvem em duas metades parecidas.
 */
const SHAPE_1: Silhouette = {
  body: [
    'M-125 6',
    'C-130-10-122-25-110-27',
    'C-100-29-90-27-84-24',    // ombro preguiçoso, coroa quase plana
    'C-80-22-79-20-74-20',
    'C-68-20-68-32-62-36',
    'C-56-40-44-39-36-33',     // lóbulo médio
    'C-30-29-27-27-21-27',
    'C-13-27-6-42 2-50',
    'C14-62 40-62 50-44',      // A CÚPULA, à direita do centro
    'C56-36 58-26 66-26',      // o BELISCÃO, piso de 18
    'C76-26 78-36 84-40',
    'C92-45 104-42 110-33',    // lóbulo de popa
    'C116-22 124-10 122 2',
    'C122 16 112 23 98 25',
    'C80 27 54 29 36 30',      // a linha calma, longuíssima
    'C22 31 8 33-4 35',
    'C-16 46-30 52-46 51',     // O BOJO, no flanco oposto à cúpula: dobra seca aqui...
    'C-62 52-80 42-92 32',     // ...e derretendo de volta na linha de base aqui
    'C-104 26-120 18-125 6Z',
  ].join(' '),
  bellyCoat: 'M-4 35C-20 45-38 49-56 48C-72 47-84 41-92 32L-108 120L10 120Z',
  lune: 'M-18-30C-16-42-8-54 10-62C4-44-2-36-6-26Z',
  core: 'M-12-30C-10-40-2-50 14-57C7-43 2-36-1-27Z',
  touches: [
    'M-120-4C-118-16-110-25-100-27',
    'M-64-24C-60-33-53-39-46-38',
  ],
  seams: [
    'M-74-17C-72-11-73-5-75-1',
    'M-21-24C-19-18-20-12-22-8',
    'M66-23C69-14 68-5 65 0',
  ],
  speck: [100, -36, 4.6, 3, -30],
};

/* -------------------------------------------------------------- variante 2 */

/**
 * O BOLINHO — 172 x 132, quadrada o bastante para ficar de pé num canto do quadro. É a
 * única com a CÚPULA no meio-direita e com o beliscão logo depois dela, curto e seco. O
 * bojo fica bem debaixo da cúpula e é o mais fundo dos três: a peça pesa no meio em vez
 * de tombar para um lado.
 */
const SHAPE_2: Silhouette = {
  body: [
    'M-84 14',
    'C-90-4-82-28-70-30',
    'C-62-32-56-30-50-26',     // ombro de coroa curta e inclinada
    'C-46-24-44-21-40-21',
    'C-34-21-30-46-22-56',
    'C-10-72 22-72 34-52',     // A CÚPULA, a mais alta dos três
    'C40-42 44-34 52-34',      // o BELISCÃO, curto e seco
    'C62-34 63-42 70-46',
    'C78-50 84-46 87-38',      // lóbulo de popa, bem mais baixo que a cúpula
    'C90-28 90-14 88 6',
    'C86 20 78 29 66 32',
    'C54 35 44 37 34 38',
    'C28 56 12 70-8 70',       // O BOJO, o mais fundo, bem sob a cúpula
    'C-26 70-40 60-48 44',
    'C-58 47-72 41-78 31',
    'C-83 26-86 21-84 14Z',
  ].join(' '),
  bellyCoat: 'M34 38C23 53 7 60-11 59C-29 58-41 52-48 44L-68 130L58 130Z',
  lune: 'M-40-25C-38-37-31-53-12-65C-18-47-24-35-26-23Z',
  core: 'M-33-25C-31-37-24-51-8-60C-14-45-19-35-21-24Z',
  touches: [
    'M-86 4C-84-12-78-24-68-27',
    'M64-36C68-44 74-48 80-46',
  ],
  seams: [
    'M-40-18C-38-12-39-6-41-2',
    'M52-31C55-22 54-13 51-8',
  ],
  speck: [86, -28, 4.2, 2.8, -38],
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export const Cloud = ({
  x,
  y,
  scale,
  squashX,
  squashY,
  rotation,
  opacity,
  variant,
  color,
  gloss,
  id,
}: CloudProps) => {
  // Ternário e não índice cru: qualquer variant fora de 0/1/2 (ou NaN) cai no PÃO.
  const s = variant >= 1.5 ? SHAPE_2 : variant >= 0.5 ? SHAPE_1 : SHAPE_0;
  const g = clamp01(gloss);
  const cutId = `${id}-cloud-cut`;
  const shadeId = `${id}-cloud-shade`;

  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale * squashX}, ${scale * squashY})`}
      opacity={opacity}
    >
      <defs>
        <mask id={cutId} maskUnits="userSpaceOnUse" x="-300" y="-300" width="600" height="600">
          <path d={s.body} fill="#FFFFFF" />
        </mask>
        {/* Um gradiente só, e curto: um sopro de leite no ombro, um fio de ameixa no pé.
            O miolo fica chapado de propósito — guache, não render. */}
        <linearGradient id={shadeId} x1="0.24" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.13" />
          <stop offset="0.2" stopColor="#FFFFFF" stopOpacity="0.035" />
          <stop offset="0.48" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.74" stopColor={INK} stopOpacity="0" />
          <stop offset="1" stopColor={INK} stopOpacity="0.1" />
        </linearGradient>
      </defs>

      <path d={s.body} fill={color} />
      <path d={s.body} fill={`url(#${shadeId})`} />

      {/* Daqui para baixo a silhueta recorta tudo: a tinta pode correr para fora da
          forma como corre no papel, e quem apara é a borda. */}
      <g mask={`url(#${cutId})`}>
        {PLATES.map(([dx, dy, o]) => (
          <path
            key={`${dx}:${dy}`}
            d={`${COVER} ${s.body}`}
            fillRule="evenodd"
            fill={INK}
            opacity={o}
            transform={`translate(${dx} ${dy})`}
          />
        ))}
        <path d={s.bellyCoat} fill={INK} opacity="0.075" />

        <g fill="none" stroke={INK} strokeLinecap="round">
          {SEAM_PASS.map(([w, o]) =>
            s.seams.map((d, i) => <path key={`${w}-${i}`} d={d} strokeWidth={w} opacity={o} />),
          )}
        </g>

        {/* A luz, na ordem da mão: lua larga, filete por dentro, toques secos, respingo. */}
        <path d={s.lune} fill="#FFFFFF" opacity={0.035 + g * 0.24} />
        <path d={s.core} fill="#FFFFFF" opacity={0.045 + g * 0.42} />
        <g fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="3.4">
          {s.touches.map((d, i) => (
            <path key={i} d={d} opacity={0.03 + g * 0.22} />
          ))}
        </g>
        <ellipse
          cx={s.speck[0]}
          cy={s.speck[1]}
          rx={s.speck[2]}
          ry={s.speck[3]}
          transform={`rotate(${s.speck[4]} ${s.speck[0]} ${s.speck[1]})`}
          fill="#FFFFFF"
          opacity={0.03 + g * 0.3}
        />
      </g>
    </g>
  );
};

/* ======================= PREVIEW (não faz parte da peça) ======================= */
