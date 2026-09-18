/**
 * Heart — o acento afetivo do KawaiiLoop v2. SEM ROSTO.
 *
 * Decisão de autor: isto é um DOCE DE GOMA, não o ícone de "curtir". A silhueta foi
 * torcida à mão: o lóbulo esquerdo é mais gordo e sobe mais alto que o direito, o vale
 * entre os dois é largo e de fundo redondo — não um talho — e o biquinho é um NÓDULO
 * macio que cai uns cinco pontos à direita do centro de massa. Nenhum eixo de simetria,
 * nada de compasso: a peça inteira tomba um tico para a direita.
 *
 * A peça é IMPRESSA, não renderizada — as arestas são de pincel, não de airbrush:
 *  1. a chapa pastel chapada, com uma rampa de guache curtíssima só para o corpo não
 *     ficar morto nos tamanhos grandes;
 *  2. a chapa violeta empurrada FORA DE REGISTRO na direção da luz. Onde as duas chapas
 *     não se encontram, a violeta imprime sozinha: um crescente de borda DURA no flanco
 *     de baixo-direita. Essa é a única sombra da peça, e ela existe mesmo com `gloss` 0;
 *  3. a mesma jogada escorregando menos, em creme, POR CIMA do crescente escuro: é a luz
 *     que atravessou a goma e vazou na beirada oposta. É o fio que separa bala de goma
 *     de papel recortado, e é o que segura a peça sobre vídeo escuro.
 * Por cima, UM gesto branco de guache no ombro de cima-esquerda — nunca a forma inteira
 * em branco. Nenhuma marca redonda solta no meio do corpo: um pontinho claro perdido ali
 * leria como olho, e a regra número 1 do briefing é que esta peça não tem rosto.
 *
 * `rotation` é a inclinação de mão da peça, não a órbita dela: a luz viaja junto com o
 * corpo, do jeito que uma estampa impressa gira com o papel.
 */
export interface HeartProps {
  x: number; y: number;   // centro
  size: number;           // meia-altura em px; ~8 a 120
  rotation: number;       // graus
  opacity: number;        // 0 a 1, aplicada no <g>
  variant: number;        // 0 cheio, 1 vazado
  color: string;
  gloss: number;          // 0 a 1
  id: string;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Meia-altura em que a silhueta foi desenhada; `size` escala o grupo inteiro. */
const UNIT = 50;

/** Largura da fita do vazado, em unidades locais. Grossa de propósito: aos 8px ainda imprime. */
const BAND = 14;

/** A tinta da segunda chapa. Violeta lê como sombra sobre morango, baunilha e matchá. */
const INK = '#5C63A8';

/** A terceira chapa: creme, a luz que atravessou a goma. Nunca branco puro. */
const BLEED = '#FFF3E4';

/** Retângulo gigante: com `evenodd` contra o corpo deslocado sobra "tudo menos o corpo". */
const COVER = 'M-200-200H200V200H-200Z';

/**
 * Começa no lábio esquerdo do vale, sobe o domo gordo, desce o flanco comprido até o
 * biquinho e volta pelo lado direito — mais baixo, mais curto e mais reto — caindo no
 * vale por uma rampa longa. Os dois lábios do vale ficam em alturas diferentes.
 */
const BODY = [
  'M-7.5-33',
  'C-13-45.5-22-52-33.5-51',
  'C-48-50.5-58-37.5-58-21',
  'C-58-4-51 13-40 26.5',
  'C-29 40-16 48-3 50.6',
  'C1.5 51.8 6 51.5 10.5 48.8',
  'C21.5 41 33 31.5 42.5 18.5',
  'C52 5.5 56-6 55-20',
  'C54.5-32.5 45.5-45 32.5-44.5',
  'C24.5-44 15-41 10.5-35',
  'C8-31.5 3.5-26.5-1.5-28',
  'C-4-28.8-6-30.5-7.5-33Z',
].join('');

/** O gesto de guache: entra afinado, engorda no meio do flanco, sai afinado. */
const GLOSS = 'M-30-47.5C-43.5-43.5-55-32.5-56.5-16C-52-20-49-28-44-35C-40-40.5-34.5-44.8-30-47.5Z';

export const Heart = ({
  x, y, size, rotation, opacity, variant, color, gloss, id,
}: HeartProps) => {
  const hollow = variant === 1;
  const light = clamp01(gloss);
  // A fita do vazado transborda meia-largura para fora do path: encolhe o grupo para
  // `size` continuar valendo a mesma meia-altura nas duas variantes.
  const fit = hollow ? UNIT / (UNIT + BAND / 2) : 1;
  const cutId = `${id}-heart-cut`;
  const shadeId = `${id}-heart-shade`;

  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rotation}) scale(${(size / UNIT) * fit})`}
      opacity={opacity}
    >
      <defs>
        {/* O recorte das chapas de cima: no cheio é a silhueta, no vazado é a PRÓPRIA
            fita. Assim a tinta pode correr para fora da forma como corre no papel. */}
        <mask id={cutId} maskUnits="userSpaceOnUse" x="-200" y="-200" width="400" height="400">
          <path
            d={BODY}
            fill={hollow ? 'none' : '#FFFFFF'}
            stroke={hollow ? '#FFFFFF' : 'none'}
            strokeWidth={BAND}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </mask>
        {/* Guache, não render: a rampa de luz é curta e o miolo do corpo fica chapado. */}
        <linearGradient id={shadeId} x1="0.2" y1="0" x2="0.62" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.1" />
          <stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0.02" />
          <stop offset="0.58" stopColor={INK} stopOpacity="0" />
          <stop offset="1" stopColor={INK} stopOpacity="0.08" />
        </linearGradient>
      </defs>

      {/* CHAPA 1 — a pastel. Cheia é fill; vazada é o mesmo path como fita grossa e redonda. */}
      <path
        d={BODY}
        fill={hollow ? 'none' : color}
        stroke={hollow ? color : 'none'}
        strokeWidth={BAND}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <g mask={`url(#${cutId})`}>
        {!hollow && <path d={BODY} fill={`url(#${shadeId})`} />}

        {/* CHAPA 2 — o peso da bala: crescente de borda dura no flanco de baixo-direita. */}
        <path
          d={`${COVER} ${BODY}`}
          fillRule="evenodd"
          fill={INK}
          opacity="0.2"
          transform={hollow ? 'translate(-3 -3.3)' : 'translate(-4.1 -4.5)'}
        />
        {/* CHAPA 3 — a luz que atravessou a goma e vazou na beirada longe da luz. */}
        <path
          d={`${COVER} ${BODY}`}
          fillRule="evenodd"
          fill={BLEED}
          opacity={0.05 + light * 0.16}
          transform={hollow ? 'translate(-1.5 -1.6)' : 'translate(-1.7 -1.9)'}
        />

        {/* O gesto branco. No cheio é a lua no ombro; no vazado a fita é estreita demais
            para segurar uma lua, então viram duas pinceladas fora de registro sobre a
            aresta que pega luz — mesma mão, mesmo vetor. */}
        {hollow ? (
          <g stroke="#FFFFFF" fill="none" strokeLinecap="round">
            <path
              d="M-56.5-26C-59.5-17-58.5-5-52.5 8"
              strokeWidth="3.4"
              opacity={0.14 + light * 0.6}
              transform="translate(-2.2 -1.2)"
            />
            <path
              d="M-38-49C-33-50.5-28-50.5-24-48"
              strokeWidth="2.6"
              opacity={0.1 + light * 0.44}
              transform="translate(-0.6 -1.8)"
            />
          </g>
        ) : (
          <path d={GLOSS} fill="#FFFFFF" opacity={0.08 + light * 0.72} />
        )}
      </g>
    </g>
  );
};
