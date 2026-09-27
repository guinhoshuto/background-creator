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
  transparent: z.boolean().describe('Alpha no WebM, MOV e PNG').default(true),
  ...overlayBoxFields(size),
  guides: guidesField(),
});

/** Studio-only outlines of box, content and hole; the exporter refuses them. */
export const guidesField = () => z.boolean()
  .describe('Mostra no Studio a caixa, a área de texto e a janela; o export recusa guides ligado')
  .default(false);

/** The description goes in here, not after: `.describe()` on the returned default hides it in the Studio. */
export const radiusField = (
  defaultValue = 16,
  description = 'Raio dos cantos, em px; limitado a metade do menor lado (vira pílula ou círculo)',
) => z.number().finite().min(0).max(1920)
  .describe(description)
  .default(defaultValue);

export const paddingField = (defaultValue = 16) => z.number().finite().min(0).max(512)
  .describe('Espaço entre o contorno e o conteúdo, em px')
  .default(defaultValue);

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
  fill: z.enum(FILL_STYLES)
    .describe('Preenchimento: solido, gradiente (cores balançando devagar), pontos, listras, brilhos (cintilantes), vidro (translúcido com reflexo), nevoa (bancos de névoa rolando pela parte de baixo) ou damasco (papel de parede adamascado)')
    .default(defaults.fill ?? 'solido'),
  fillColors: z.array(zColor()).min(1).max(3)
    .describe('Cores do preenchimento: com uma cor, só o padrão; com mais, a primeira é a base e as outras formam o padrão (na névoa, a segunda é a névoa e a terceira o miolo claro; no damasco, a segunda é a tinta e a terceira fica de fora)')
    .default(defaults.fillColors ?? ['#12162B', '#67E8F9', '#F472B6']),
  fillOpacity: z.number().finite().min(0).max(1)
    .describe('Opacidade do preenchimento, de 0 a 1')
    .default(defaults.fillOpacity ?? 0.85),
  fillScale: z.number().finite().min(8).max(256)
    .describe('Tamanho do padrão, em px: distância entre pontos, largura de cada listra com seu intervalo, espaço médio entre brilhos, altura de cada banco de névoa (um a cada 2,25 × fillScale), largura do ladrilho do damasco (1,5 vez mais alto)')
    .default(defaults.fillScale ?? 32),
  fillSpeed: z.number().finite().min(0).max(480)
    .describe('Velocidade do padrão em px/s, a mesma em todo tamanho: pontos, listras, damasco, névoa (período de 2,25 × fillScale) e o giro dos brilhos arredondam para um número inteiro de períodos por ciclo (no mínimo um); o gradiente balança para lá e para cá; no vidro, um reflexo passa por cada ponto uma vez por ciclo; 0 deixa parado')
    .default(defaults.fillSpeed ?? 16),
  fillAngle: z.number().finite().min(-180).max(180)
    .describe('Direção do movimento do gradiente, das listras e do reflexo, em graus (0 = para a direita, 90 = para baixo); os pontos e o damasco seguem o eixo ou a diagonal mais próxima; a névoa só anda de lado (para a direita se o ângulo aponta para a direita ou na vertical, senão para a esquerda)')
    .default(defaults.fillAngle ?? 45),
  fillRise: z.boolean()
    .describe('Só em brilhos: sobem como brasas em vez de cintilar no lugar')
    .default(defaults.fillRise ?? false),
  fillLight: z.number().finite().min(0).max(1)
    .describe('Luz de cima: um véu branco no topo do preenchimento que some até embaixo (dá volume ao vidro), de 0 a 1; 0 desliga')
    .default(defaults.fillLight ?? 0),
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
  strokeMotion: z.enum(STROKE_MOTIONS)
    .describe('Movimento do contorno: parado, pulso (respira), formigas (tracejado andando), cometas ou gradiente (cores correndo pelo contorno)')
    .default(defaults.strokeMotion ?? 'parado'),
  strokeColors: z.array(zColor()).min(1).max(4)
    .describe('Cores do contorno, distribuídas ao longo dele')
    .default(defaults.strokeColors ?? ['#67E8F9', '#F472B6']),
  strokeWidth: z.number().finite().min(defaults.strokeWidthMin ?? 0).max(64)
    .describe('Espessura do contorno, em px; 2 ou mais evita perda de cor no WebM')
    .default(defaults.strokeWidth ?? 3),
  dashLength: z.number().finite().min(2).max(512)
    .describe('formigas: comprimento de cada traço, em px (ajustado para fechar o contorno sem emenda)')
    .default(defaults.dashLength ?? 16),
  gapLength: z.number().finite().min(2).max(512)
    .describe('formigas: espaço entre traços, em px (ajustado junto com o traço)')
    .default(defaults.gapLength ?? 12),
  cometSpacing: z.number().finite().min(32).max(4000)
    .describe('cometas: distância entre um cometa e o seguinte, em px ao longo do contorno; a quantidade sai do tamanho (ajustada para fechar o contorno, no mínimo um), então todo tamanho tem a mesma densidade')
    .default(defaults.cometSpacing ?? 480),
  cometTail: z.number().finite().min(8).max(4000)
    .describe('cometas: comprimento da cauda, em px ao longo do contorno (no máximo o espaço entre cometas)')
    .default(defaults.cometTail ?? 160),
  gradientLength: z.number().finite().min(32).max(4000)
    .describe('Comprimento em px ao longo do contorno em que as cores se repetem (gradiente, e parado ou pulso com várias cores); ajustado para fechar o contorno, então todo tamanho mostra as cores na mesma escala')
    .default(defaults.gradientLength ?? 480),
  strokeSpeed: z.number().finite().min(0).max(4000)
    .describe('Velocidade ao longo do contorno em px/s, arredondada para um número inteiro de períodos por ciclo (no mínimo um); 0 deixa parado')
    .default(defaults.strokeSpeed ?? 120),
  strokePulses: z.number().int().min(1).max(16)
    .describe('pulso: quantas vezes o contorno respira por ciclo')
    .default(defaults.strokePulses ?? 1),
  strokeCore: z.number().finite().min(0).max(1)
    .describe('Miolo claro no meio do traço, como num tubo de neon: opacidade de 0 a 1 (só em traços de 2,5 px ou mais); 0 desliga')
    .default(defaults.strokeCore ?? 0),
});

/**
 * The dim full outline under `formigas` and `cometas`, in the first stroke colour, so the edge
 * still reads between the moving pieces. Its own factory rather than part of strokeFields: a
 * kind may keep it as a fixed look (chat) instead of a prop.
 */
export const trackOpacityField = (defaultValue = 0.3) => z.number().finite().min(0).max(1)
  .describe('formigas e cometas: opacidade do contorno inteiro apagado por baixo deles, na primeira cor; 0 não desenha')
  .default(defaultValue);

export type GlowDefaults = Partial<{glow: number; glowPulses: number; glowStrength: number}>;

export const glowFields = (defaults: GlowDefaults = {}) => ({
  glow: z.number().finite().min(0).max(128)
    .describe('Alcance do brilho do contorno, em px; para fora da caixa ele precisa caber no bleed')
    .default(defaults.glow ?? 12),
  glowPulses: z.number().int().min(0).max(16)
    .describe('Quantas vezes o brilho pulsa por ciclo; 0 deixa constante')
    .default(defaults.glowPulses ?? 0),
  glowStrength: z.number().finite().min(0.25).max(3)
    .describe('Intensidade do brilho: multiplica a opacidade dele (1 = normal); o alcance não muda')
    .default(defaults.glowStrength ?? 1),
});

export type HaloDefaults = Partial<{halo: number; haloColor: string}>;

/** An outer glow around the whole panel (chat, bloco) or frame (borda); it lives in the bleed. */
export const haloFields = (defaults: HaloDefaults = {}) => ({
  halo: z.number().finite().min(0).max(128)
    .describe('Alcance do halo em volta do painel, em px; precisa caber no bleed')
    .default(defaults.halo ?? 0),
  haloColor: zColor().default(defaults.haloColor ?? '#67E8F9'),
});

/**
 * A 1 px highlight just inside the top edge, fading out down the sides: the bevel a sheet of
 * glass catches from above. It lies between the stroke and the padding, never over the content.
 */
export const rimLightField = (defaultValue = 0) => z.number().finite().min(0).max(1)
  .describe('Reflexo de 1 px por dentro da borda de cima, sumindo pelas laterais (vidro), de 0 a 1; 0 desliga')
  .default(defaultValue);
