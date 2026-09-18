/**
 * Star — a pontuação luminosa do KawaiiLoop v2. SEM ROSTO.
 *
 * Decisão de autor: a estrela é IMPRESSA, irmã da bala de goma do Heart — mesma gráfica,
 * mesmas três chapas, mesmo vetor de luz. Não é um corpo iluminado nem um render 3D:
 *  1. a chapa pastel chapada, com uma rampa de guache curtíssima só para o corpo não
 *     ficar morto aos 110px;
 *  2. a chapa violeta empurrada FORA DE REGISTRO na direção da luz. Onde as duas chapas
 *     não se encontram, a violeta imprime sozinha: um crescente de borda DURA no flanco
 *     de baixo-direita. É a única sombra da peça, e existe mesmo com `gloss` 0;
 *  3. a mesma jogada escorregando menos, em creme, POR CIMA do crescente escuro — a luz
 *     que vazou na beirada oposta. É o que segura a peça sobre vídeo escuro.
 * Por cima, o guache branco: UMA lua no flanco de cima-esquerda do braço de cima, mais um
 * fiapo curto na aresta de cima do braço esquerdo. As duas marcas ficam do MESMO lado —
 * duas marcas claras em lados opostos da metade de cima virariam um par de olhos, e a
 * regra número 1 do briefing é que esta peça não tem rosto. Pelo mesmo motivo não existe
 * nenhuma marca redonda solta no meio do corpo.
 *
 * A silhueta é torcida à mão: cinco braços de comprimentos, ângulos e espessuras
 * desiguais, vales de fundo redondo (não talhos) e pontas rombudas com raios diferentes
 * em cada uma. Nenhum eixo de simetria, nada de compasso: a ponta de cima cai uns três
 * graus à direita do eixo e nenhum par de braços divide o mesmo ângulo nem o mesmo raio.
 *
 * `rotation` é a inclinação de mão da peça, não a órbita dela: a luz viaja junto com o
 * corpo, do jeito que uma estampa impressa gira com o papel. Use ângulos pequenos.
 */
export interface StarProps {
  x: number; y: number;   // centro
  size: number;           // meia-altura em px; ~6 a 110
  rotation: number;       // graus
  opacity: number;        // 0 a 1, aplicada no <g>
  variant: number;        // 0 cheia, 1 cintilo, 2 vazada
  color: string;
  gloss: number;          // 0 a 1
  id: string;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Meia-altura em que as silhuetas foram desenhadas; `size` escala o grupo inteiro. */
const UNIT = 50;

/** Largura da fita da vazada, em unidades locais. Grossa de propósito: aos 8px ainda imprime. */
const BAND = 9.4;

/** A tinta da segunda chapa. Violeta lê como sombra sobre morango, baunilha e matchá. */
const INK = '#5C63A8';

/** A terceira chapa: creme, a luz que vazou. Nunca branco puro. */
const BLEED = '#FFF3E4';

/** Retângulo gigante: é nele que as chapas 2 e 3 são pintadas, recortadas pela máscara. */
const COVER = 'M-200-200H200V200H-200Z';

/**
 * Variante 0 — o corpo. Polígono de 10 vértices com fillet cúbico por vértice, congelado:
 * assimétrico de um jeito que dá para repetir.
 */
const BODY = [
  'M-2.2-46C0.6-50.3 4.9-50.4 7.5-45.9',
  'L12.4-37.1C18.4-26.6 25.1-21.3 36.2-17.9',
  'L46.4-14.8C50.7-13.6 51.7-10 48.7-6.7',
  'L41.5 1.3C33.2 10.6 30.6 19 32.2 31.3',
  'L33.8 43.9C34.4 48.8 31.3 51.2 26.7 49.4',
  'L14.9 44.7C4.3 40.4-4.1 40.2-14.9 43.9',
  'L-24 47.1C-28.1 48.5-31.1 46.2-31 42',
  'L-30.5 31.5C-30.1 19.4-32.8 11.1-40.5 1.8',
  'L-48.8-8.4C-51.8-12.1-50.5-15.8-45.8-16.8',
  'L-36.3-18.9C-24.4-21.5-17.2-26.5-10.7-36.8',
  'L-2.2-46Z',
].join('');

/** A lua de guache: entra afinada na ponta, engorda no meio do flanco, sai afinada no vale. */
const GLOSS = [
  'M-8.9-36',
  'C-12.2-30.8-16.8-25-22.6-20.7',
  'C-25.8-18.3-28.6-17-31.6-16.3',
  'C-29.2-13.2-23.8-13.2-18.4-15.8',
  'C-14-18-10.4-26.4-8.9-36Z',
].join('');

/** O fiapo que responde, na aresta de cima do braço esquerdo: mesma mão, mesmo vetor. */
const GLINT = 'M-44.6-14.5C-42.2-15.1-39.6-15.7-37.2-16.1C-39.4-14.6-41.6-13.3-43.4-12.8C-44.4-12.5-44.9-13.4-44.6-14.5Z';

/** Variante 2 — a mesma família, mais magra, desenhada para ser PERCORRIDA por um traço. */
const HOLLOW = [
  'M-3.1-43.2C-1.1-46.6 2-46.5 3.9-43.2',
  'L9.9-32.7C15.3-23.3 22.2-18.2 32.8-15.7',
  'L43.2-13.3C46.6-12.5 47.4-9.9 45.1-7.4',
  'L36.4 2.2C29.6 9.7 27.4 17.2 28.9 27.2',
  'L31 41.1C31.5 44.9 29.2 46.6 25.8 45.2',
  'L14.6 40.6C4.7 36.5-3.9 36.3-13.9 39.9',
  'L-23.9 43.6C-27 44.7-29.2 43-29 39.7',
  'L-27.9 28.1C-27 17.7-29.6 9.8-36.6 2',
  'L-45.1-7.5C-47.5-10.2-46.6-12.9-43.1-13.7',
  'L-32.5-16C-21.6-18.4-14.5-23.6-8.8-33.2',
  'L-3.1-43.2Z',
].join('');

/** Meia-altura que a vazada alcança com a fita, medida no render: o grupo encolhe por ela. */
const HOLLOW_REACH = 50.6;

/** Na vazada a fita é estreita demais para uma lua: o guache vira dois fios na mesma aresta. */
const HOLLOW_GLOSS = 'M-32.8-17.3C-22.4-19.8-15.3-24.8-9.4-34.3';
const HOLLOW_GLINT = 'M-41.4-13.9C-39.4-14.5-37-15.1-34.8-15.5';

/**
 * Variante 1 — o cintilo. Cada quarto é um cubic cujos controles caem quase em cima do
 * cruzamento: é isso que faz a cintura côncava. Agulha de cima comprida, a de baixo menor,
 * as duas laterais curtas e desiguais.
 */
const kira = (up: number, right: number, down: number, left: number, waist: number) =>
  `M0 ${-up}`
  + `C0 ${-up * waist} ${right * waist} 0 ${right} 0`
  + `C${right * waist} 0 0 ${down * waist} 0 ${down}`
  + `C0 ${down * waist} ${-left * waist} 0 ${-left} 0`
  + `C${-left * waist} 0 0 ${-up * waist} 0 ${-up}Z`;

const KIRA_UP = 55.6;
const KIRA_DOWN = 44.4;
const KIRA = kira(KIRA_UP, 23.9, KIRA_DOWN, 19.4, 0.15);
const KIRA_CORE = kira(29.4, 12.9, 22.8, 10, 0.16);

/** A agulha de cima é mais comprida que a de baixo: desce o desenho para `y` cair no meio. */
const KIRA_DROP = (KIRA_UP - KIRA_DOWN) / 2;

export const Star = ({
  x, y, size, rotation, opacity, variant, color, gloss, id,
}: StarProps) => {
  const light = clamp01(gloss);
  const v = ((Math.round(variant) % 3) + 3) % 3;

  // O cintilo: duas passadas e nenhum defs. A passada da paleta carrega a peça sobre o
  // leite; o núcleo branco, empurrado para cima-esquerda, carrega ela sobre vídeo escuro.
  if (v === 1) {
    return (
      <g
        transform={
          `translate(${x} ${y}) rotate(${rotation}) scale(${size / UNIT}) translate(0 ${KIRA_DROP})`
        }
        opacity={opacity}
      >
        <path d={KIRA} fill={color} />
        <path
          d={KIRA_CORE}
          fill="#FFFFFF"
          opacity={0.3 + light * 0.7}
          transform="translate(-1.2 -1.9)"
        />
      </g>
    );
  }

  const hollow = v === 2;
  // A fita transborda meia-largura para fora do path: encolhe o grupo para `size`
  // continuar valendo a mesma meia-altura nas três variantes (medido no render).
  const fit = hollow ? UNIT / HOLLOW_REACH : 1;
  const path = hollow ? HOLLOW : BODY;
  // O deslize de registro. Na vazada ele é menor: a fita tem 9.4 de largura, e uma chapa
  // escorregando 5.7 como no corpo cheio pintaria metade da fita de violeta.
  const inkOff = hollow ? 'translate(-2.1 -2.3)' : 'translate(-3.8 -4.2)';
  const bleedOff = hollow ? 'translate(-0.9 -1)' : 'translate(-1.6 -1.8)';
  const cutId = `${id}-star-cut`;
  const inkId = `${id}-star-ink`;
  const bleedId = `${id}-star-bleed`;
  const shadeId = `${id}-star-shade`;

  /** A mesma silhueta em qualquer tinta: cheia é fill, vazada é a mesma curva como fita. */
  const plate = (paint: string, shift?: string) => (
    <path
      d={path}
      fill={hollow ? 'none' : paint}
      stroke={hollow ? paint : 'none'}
      strokeWidth={BAND}
      strokeLinejoin="round"
      strokeLinecap="round"
      transform={shift}
    />
  );

  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rotation}) scale(${(size / UNIT) * fit})`}
      opacity={opacity}
    >
      <defs>
        {/* O recorte do guache: a tinta pode correr até a beirada como corre no papel. */}
        <mask id={cutId} maskUnits="userSpaceOnUse" x="-200" y="-200" width="400" height="400">
          {plate('#FFFFFF')}
        </mask>
        {/* A FALTA DE REGISTRO, montada como subtração: a chapa de cima é a peça menos ela
            mesma empurrada na direção da luz. Sobra um crescente de borda DURA no flanco de
            baixo-direita — e sobra com a MESMA espessura no corpo cheio e na fita. */}
        <mask id={inkId} maskUnits="userSpaceOnUse" x="-200" y="-200" width="400" height="400">
          {plate('#FFFFFF')}
          {plate('#000000', inkOff)}
        </mask>
        <mask id={bleedId} maskUnits="userSpaceOnUse" x="-200" y="-200" width="400" height="400">
          {plate('#FFFFFF')}
          {plate('#000000', bleedOff)}
        </mask>
        {/* Guache, não render: a rampa de luz é curta e o miolo do corpo fica chapado. */}
        <linearGradient id={shadeId} x1="0.24" y1="0" x2="0.66" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.1" />
          <stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0.02" />
          <stop offset="0.58" stopColor={INK} stopOpacity="0" />
          <stop offset="1" stopColor={INK} stopOpacity="0.09" />
        </linearGradient>
      </defs>

      {/* CHAPA 1 — a pastel. */}
      {plate(color)}
      {!hollow && <path d={BODY} fill={`url(#${shadeId})`} />}

      {/* CHAPA 2 — o peso: crescente de borda dura no flanco de baixo-direita. */}
      <path d={COVER} fill={INK} opacity="0.21" mask={`url(#${inkId})`} />
      {/* CHAPA 3 — a luz que vazou na beirada longe da luz, por cima do crescente. */}
      <path
        d={COVER}
        fill={BLEED}
        opacity={0.05 + light * 0.16}
        mask={`url(#${bleedId})`}
      />

      {/* O guache branco, sempre no mesmo quadrante de cima-esquerda. */}
      <g mask={`url(#${cutId})`}>
        {hollow ? (
          <g stroke="#FFFFFF" fill="none" strokeLinecap="round">
            <path
              d={HOLLOW_GLOSS}
              strokeWidth="3.4"
              opacity={0.12 + light * 0.62}
              transform="translate(-1.6 -1.4)"
            />
            <path
              d={HOLLOW_GLINT}
              strokeWidth="2.4"
              opacity={0.08 + light * 0.44}
              transform="translate(-0.8 -1.2)"
            />
          </g>
        ) : (
          <g fill="#FFFFFF">
            <path d={GLOSS} opacity={0.08 + light * 0.72} />
            <path d={GLINT} opacity={0.05 + light * 0.46} />
          </g>
        )}
      </g>
    </g>
  );
};
