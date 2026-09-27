import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {baseBackgroundSchema} from '../../settings';
import {overlayBoxFields, type BoxDefaults} from './box';

/**
 * Zod field groups shared by the overlay kinds. Each group is a factory of plain shape objects,
 * so a kind spreads the ones it needs into its own `z.object({...})` and overrides the defaults
 * that suit it (a border wants a thicker stroke than a label). User-facing text is pt-BR.
 */

export const FILL_STYLES = ['solido', 'gradiente', 'pontos', 'listras', 'brilhos', 'vidro', 'nevoa', 'damasco'] as const;
export type FillStyleName = (typeof FILL_STYLES)[number];

export const STROKE_MOTIONS = ['parado', 'pulso', 'formigas', 'cometas', 'gradiente'] as const;
export type StrokeMotionName = (typeof STROKE_MOTIONS)[number];

/**
 * What every overlay kind shares: timing, seed, alpha rule, format, box and guides. Overlays
 * default to transparent, since they sit on top of something else.
 */
export const overlayBaseFields = (size: BoxDefaults) => ({
  ...baseBackgroundSchema.omit({colors: true}).shape,
  transparent: z.boolean().default(true).describe('Alpha no WebM, MOV e PNG'),
  ...overlayBoxFields(size),
  guides: guidesField(),
});

/** Studio-only outlines of box, content and hole; the exporter refuses them. */
export const guidesField = () => z.boolean().default(false)
  .describe('Mostra no Studio a caixa, a área de texto e a janela; o export recusa guides ligado');

export const radiusField = (defaultValue = 16) => z.number().finite().min(0).max(1920).default(defaultValue)
  .describe('Raio dos cantos, em px; limitado a metade do menor lado (vira pílula ou círculo)');

export const paddingField = (defaultValue = 16) => z.number().finite().min(0).max(512).default(defaultValue)
  .describe('Espaço entre o contorno e o conteúdo, em px');

export type FillDefaults = Partial<{
  fill: FillStyleName;
  fillColors: string[];
  fillOpacity: number;
  fillScale: number;
  fillSpeed: number;
  fillAngle: number;
  fillRise: boolean;
  fillLight: number;
}>;

export const fillFields = (defaults: FillDefaults = {}) => ({
  fill: z.enum(FILL_STYLES).default(defaults.fill ?? 'solido')
    .describe('Preenchimento: solido, gradiente (cores balançando devagar), pontos, listras, brilhos (cintilantes), vidro (translúcido com reflexo), nevoa (bancos de névoa rolando pela parte de baixo) ou damasco (papel de parede adamascado)'),
  fillColors: z.array(zColor()).min(1).max(3).default(defaults.fillColors ?? ['#12162B', '#67E8F9', '#F472B6'])
    .describe('Cores do preenchimento: com uma cor, só o padrão; com mais, a primeira é a base e as outras formam o padrão (na névoa, a segunda é a névoa e a terceira o miolo claro; no damasco, a segunda é a tinta e a terceira fica de fora)'),
  fillOpacity: z.number().finite().min(0).max(1).default(defaults.fillOpacity ?? 0.85)
    .describe('Opacidade do preenchimento, de 0 a 1'),
  fillScale: z.number().finite().min(8).max(256).default(defaults.fillScale ?? 32)
    .describe('Tamanho do padrão, em px: distância entre pontos, largura de cada listra com seu intervalo, espaço médio entre brilhos, altura de cada banco de névoa (um a cada 2,25 × fillScale), largura do ladrilho do damasco (1,5 vez mais alto)'),
  fillSpeed: z.number().finite().min(0).max(480).default(defaults.fillSpeed ?? 16)
    .describe('Velocidade do padrão em px/s, a mesma em todo tamanho: pontos, listras, damasco, névoa (período de 2,25 × fillScale) e o giro dos brilhos arredondam para um número inteiro de períodos por ciclo (no mínimo um); o gradiente balança para lá e para cá; no vidro, um reflexo passa por cada ponto uma vez por ciclo; 0 deixa parado'),
  fillAngle: z.number().finite().min(-180).max(180).default(defaults.fillAngle ?? 45)
    .describe('Direção do movimento do gradiente, das listras e do reflexo, em graus (0 = para a direita, 90 = para baixo); os pontos e o damasco seguem o eixo ou a diagonal mais próxima; a névoa só anda de lado (para a direita se o ângulo aponta para a direita ou na vertical, senão para a esquerda)'),
  fillRise: z.boolean().default(defaults.fillRise ?? false)
    .describe('Só em brilhos: sobem como brasas em vez de cintilar no lugar'),
  fillLight: z.number().finite().min(0).max(1).default(defaults.fillLight ?? 0)
    .describe('Luz de cima: um véu branco no topo do preenchimento que some até embaixo (dá volume ao vidro), de 0 a 1; 0 desliga'),
});

export type StrokeDefaults = Partial<{
  strokeMotion: StrokeMotionName;
  strokeColors: string[];
  strokeWidth: number;
  /** The smallest width a kind accepts (a border needs a band; a block may have none). */
  strokeWidthMin: number;
  dashLength: number;
  gapLength: number;
  cometSpacing: number;
  cometTail: number;
  gradientLength: number;
  strokeSpeed: number;
  strokePulses: number;
  strokeCore: number;
}>;

export const strokeFields = (defaults: StrokeDefaults = {}) => ({
  strokeMotion: z.enum(STROKE_MOTIONS).default(defaults.strokeMotion ?? 'parado')
    .describe('Movimento do contorno: parado, pulso (respira), formigas (tracejado andando), cometas ou gradiente (cores correndo pelo contorno)'),
  strokeColors: z.array(zColor()).min(1).max(4).default(defaults.strokeColors ?? ['#67E8F9', '#F472B6'])
    .describe('Cores do contorno, distribuídas ao longo dele'),
  strokeWidth: z.number().finite().min(defaults.strokeWidthMin ?? 0).max(64).default(defaults.strokeWidth ?? 3)
    .describe('Espessura do contorno, em px; 2 ou mais evita perda de cor no WebM'),
  dashLength: z.number().finite().min(2).max(512).default(defaults.dashLength ?? 16)
    .describe('formigas: comprimento de cada traço, em px (ajustado para fechar o contorno sem emenda)'),
  gapLength: z.number().finite().min(2).max(512).default(defaults.gapLength ?? 12)
    .describe('formigas: espaço entre traços, em px (ajustado junto com o traço)'),
  cometSpacing: z.number().finite().min(32).max(4000).default(defaults.cometSpacing ?? 480)
    .describe('cometas: distância entre um cometa e o seguinte, em px ao longo do contorno; a quantidade sai do tamanho (ajustada para fechar o contorno, no mínimo um), então todo tamanho tem a mesma densidade'),
  cometTail: z.number().finite().min(8).max(4000).default(defaults.cometTail ?? 160)
    .describe('cometas: comprimento da cauda, em px ao longo do contorno (no máximo o espaço entre cometas)'),
  gradientLength: z.number().finite().min(32).max(4000).default(defaults.gradientLength ?? 480)
    .describe('Comprimento em px ao longo do contorno em que as cores se repetem (gradiente, e parado ou pulso com várias cores); ajustado para fechar o contorno, então todo tamanho mostra as cores na mesma escala'),
  strokeSpeed: z.number().finite().min(0).max(4000).default(defaults.strokeSpeed ?? 120)
    .describe('Velocidade ao longo do contorno em px/s, arredondada para um número inteiro de períodos por ciclo (no mínimo um); 0 deixa parado'),
  strokePulses: z.number().int().min(1).max(16).default(defaults.strokePulses ?? 1)
    .describe('pulso: quantas vezes o contorno respira por ciclo'),
  strokeCore: z.number().finite().min(0).max(1).default(defaults.strokeCore ?? 0)
    .describe('Miolo claro no meio do traço, como num tubo de neon: opacidade de 0 a 1 (só em traços de 2,5 px ou mais); 0 desliga'),
});

/**
 * The dim full outline under `formigas` and `cometas`, in the first stroke colour, so the edge
 * still reads between the moving pieces. Its own factory rather than part of strokeFields: a
 * kind may keep it as a fixed look (chat) instead of a prop.
 */
export const trackOpacityField = (defaultValue = 0.3) => z.number().finite().min(0).max(1).default(defaultValue)
  .describe('formigas e cometas: opacidade do contorno inteiro apagado por baixo deles, na primeira cor; 0 não desenha');

export type GlowDefaults = Partial<{glow: number; glowPulses: number; glowStrength: number}>;

export const glowFields = (defaults: GlowDefaults = {}) => ({
  glow: z.number().finite().min(0).max(128).default(defaults.glow ?? 12)
    .describe('Alcance do brilho do contorno, em px; para fora da caixa ele precisa caber no bleed'),
  glowPulses: z.number().int().min(0).max(16).default(defaults.glowPulses ?? 0)
    .describe('Quantas vezes o brilho pulsa por ciclo; 0 deixa constante'),
  glowStrength: z.number().finite().min(0.25).max(3).default(defaults.glowStrength ?? 1)
    .describe('Intensidade do brilho: multiplica a opacidade dele (1 = normal); o alcance não muda'),
});

export type HaloDefaults = Partial<{halo: number; haloColor: string}>;

/** An outer glow around the whole panel (chat, bloco) or frame (borda); it lives in the bleed. */
export const haloFields = (defaults: HaloDefaults = {}) => ({
  halo: z.number().finite().min(0).max(128).default(defaults.halo ?? 0)
    .describe('Alcance do halo em volta do painel, em px; precisa caber no bleed'),
  haloColor: zColor().default(defaults.haloColor ?? '#67E8F9').describe('Cor do halo'),
});

/**
 * A 1 px highlight just inside the top edge, fading out down the sides: the bevel a sheet of
 * glass catches from above. It lies between the stroke and the padding, never over the content.
 */
export const rimLightField = (defaultValue = 0) => z.number().finite().min(0).max(1).default(defaultValue)
  .describe('Reflexo de 1 px por dentro da borda de cima, sumindo pelas laterais (vidro), de 0 a 1; 0 desliga');
