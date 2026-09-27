import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {ORNAMENT_CHOICES} from './types';

/** The default palette: silver silk, moonlight cream and a warm amber (the cobweb kit's). */
export const ORNAMENT_DEFAULT_COLORS = ['#CFC6E4', '#F6EFD8', '#E8963C'];

/** Smallest and largest ornamentSize, in px. */
export const ORNAMENT_SIZE_RANGE = {min: 12, max: 256, default: 48} as const;

/** Smallest and largest ornamentScale. */
export const ORNAMENT_SCALE_RANGE = {min: 1, max: 4, default: 1} as const;

/**
 * The ornament field group, shared by chat, bloco and borda. The defaults ('nenhum', lightning 0)
 * draw nothing, so every existing theme stays exactly as it was.
 */
export const ornamentFields = () => ({
  ornaments: z.enum(ORNAMENT_CHOICES).default('nenhum')
    .describe('Enfeites temáticos em volta do painel ou da moldura: nenhum; noite (morcegos, abóboras, estrelas e brasas); mansao (lanternas de ferro, grade de lanças, rosácea, lancetas, arandelas e portão); interior (candelabros de latão com velas, arandelas e sanefas de veludo); teia (teias com orvalho, guirlandas de fios e uma aranha). Cada motivo cabe no espaço livre do seu lugar (bleed, bolsões do padding, faixa) e nunca cobre o texto nem a janela'),
  ornamentColors: z.array(zColor()).min(1).max(3).default([...ORNAMENT_DEFAULT_COLORS])
    .describe('Cores dos enfeites: névoa ou seda (fria), luar (clara) e luz quente (velas, abóboras, lanternas); a terceira é opcional e cai na primeira'),
  ornamentSize: z.number().finite().min(ORNAMENT_SIZE_RANGE.min).max(ORNAMENT_SIZE_RANGE.max).default(ORNAMENT_SIZE_RANGE.default)
    .describe('Tamanho do enfeite principal, em px fixos (não acompanha a caixa): diâmetro da lua, altura da lanterna, altura do candelabro até a ponta da chama ou raio da teia; os outros acompanham até um teto ou têm tamanho fixo. Limitado ao espaço livre do seu lugar (bleed, padding, faixa)'),
  ornamentScale: z.number().finite().min(ORNAMENT_SCALE_RANGE.min).max(ORNAMENT_SCALE_RANGE.max).default(ORNAMENT_SCALE_RANGE.default)
    .describe('Escala de todos os enfeites juntos (tamanhos, tetos, traços e espaçamentos), de 1 a 4, para molduras grandes; o espaço livre também é medido nessa escala, então enfeites maiores pedem bleed (ou padding, ou faixa) proporcionalmente maior'),
  lightning: z.number().finite().min(0).max(1).default(0)
    .describe('Clarão de relâmpago sobre o painel ou a moldura, de 0 a 1, nos mesmos instantes do fundo Salão assombrado com a mesma seed e duração; 0 desliga'),
});
