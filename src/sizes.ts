import type {OverlayKind} from './kinds';
import {getBoxCanvas} from './overlays/shared/box';
import type {PanelShape} from './overlays/shared/shape';
import type {OutputFormat} from './settings';

/**
 * Extra props a named size sets besides width/height/bleed: what the product itself requires
 * (a border's fit, a block's or a border's shape; no glow or halo on a panel without bleed). They
 * win over a preset or a --props file, as the box does, so the size id alone yields a file that
 * fits: a round size draws a circle, and a rectangular one a rectangle even over a round preset.
 */
export type SizeProps = {
  readonly fit?: 'janela' | 'tela'; readonly shape?: PanelShape; readonly glow?: number; readonly halo?: number;
};

export type NamedSize = {
  readonly id: string;
  readonly kind: OverlayKind;
  readonly label: string;
  readonly use: string;
  /** The box: the visible panel (chat/bloco) or the transparent window (borda). */
  readonly width: number;
  readonly height: number;
  /** Transparent margin around the box for glow and halo; the file is box + 2·bleed. */
  readonly bleed: number;
  readonly props?: SizeProps;
};

/** The product line: every size is sold, so ids are stable file-name tags. */
const NAMED_SIZE_TABLE = [
  // chat: the box is the chat panel.
  {id: 'chat-compacto', kind: 'chat', label: 'Chat compacto', use: 'canto da tela, layouts com câmera grande', width: 360, height: 480, bleed: 32},
  {id: 'chat-padrao', kind: 'chat', label: 'Chat padrão', use: 'caixa de chat comum (OBS, StreamElements, Streamlabs)', width: 400, height: 600, bleed: 32},
  {id: 'chat-alto', kind: 'chat', label: 'Chat alto', use: 'lateral alta ao lado do jogo', width: 400, height: 800, bleed: 32},
  {id: 'chat-coluna', kind: 'chat', label: 'Chat em coluna', use: 'coluna de altura total; o arquivo tem exatamente a altura da tela', width: 448, height: 1016, bleed: 32},
  {id: 'chat-vertical', kind: 'chat', label: 'Chat vertical', use: 'lives verticais (tela 1080×1920), metade de baixo', width: 960, height: 640, bleed: 32},
  // bloco: the box is the text panel. `shape` is spelled out so a size id alone fixes the product.
  {id: 'etiqueta-p', kind: 'bloco', label: 'Etiqueta pequena', use: 'selo curto: "AO VIVO", @usuário', width: 320, height: 64, bleed: 24, props: {shape: 'retangulo'}},
  {id: 'etiqueta', kind: 'bloco', label: 'Etiqueta', use: 'rótulos: último seguidor, meta, redes', width: 480, height: 96, bleed: 24, props: {shape: 'retangulo'}},
  {id: 'faixa', kind: 'bloco', label: 'Faixa', use: 'terço inferior: nome + título', width: 1200, height: 160, bleed: 32, props: {shape: 'retangulo'}},
  {id: 'titulo', kind: 'bloco', label: 'Título', use: 'título das telas (Começando, Volto já, Encerrando)', width: 1200, height: 240, bleed: 32, props: {shape: 'retangulo'}},
  {id: 'cartao', kind: 'bloco', label: 'Cartão', use: 'card 16:9: agenda, regras, patrocinador', width: 640, height: 360, bleed: 32, props: {shape: 'retangulo'}},
  {id: 'quadrado', kind: 'bloco', label: 'Quadrado', use: 'QR code, avatar, destaque', width: 480, height: 480, bleed: 32, props: {shape: 'retangulo'}},
  {id: 'lista', kind: 'bloco', label: 'Lista', use: 'lista vertical: agenda da semana, top apoiadores', width: 480, height: 720, bleed: 32, props: {shape: 'retangulo'}},
  // Round blocks: the text goes in the square centred inside the circle.
  {id: 'circulo-p', kind: 'bloco', label: 'Círculo pequeno', use: 'selo pequeno: ícone, rede social, "AO VIVO"', width: 160, height: 160, bleed: 24, props: {shape: 'circulo'}},
  {id: 'circulo', kind: 'bloco', label: 'Círculo', use: 'avatar, logo, contador', width: 320, height: 320, bleed: 32, props: {shape: 'circulo'}},
  {id: 'circulo-g', kind: 'bloco', label: 'Círculo grande', use: 'destaque, sorteio, meta', width: 480, height: 480, bleed: 32, props: {shape: 'circulo'}},
  // No bleed: the panel is the whole file, so nothing may glow outside it.
  {id: 'painel-twitch', kind: 'bloco', label: 'Painel da Twitch', use: 'painéis do perfil da Twitch (PNG/GIF, sem brilho externo)', width: 320, height: 160, bleed: 0, props: {shape: 'retangulo', glow: 0, halo: 0}},
  // borda: the box is the transparent window; frame and glow go outward into the bleed.
  // `fit` and `shape` are spelled out so a size id alone fixes the product, whatever a preset says.
  {id: 'webcam-16x9', kind: 'borda', label: 'Webcam 16:9', use: 'câmera padrão', width: 640, height: 360, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  {id: 'webcam-16x9-g', kind: 'borda', label: 'Webcam 16:9 grande', use: 'câmera grande (Just Chatting)', width: 960, height: 540, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  {id: 'webcam-4x3', kind: 'borda', label: 'Webcam 4:3', use: 'câmeras 4:3', width: 480, height: 360, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  {id: 'webcam-quadrada', kind: 'borda', label: 'Webcam quadrada', use: 'câmera quadrada (para câmera redonda, use webcam-redonda)', width: 400, height: 400, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  // Round windows: the camera goes through the window's OBS mask (the white disc) to turn round.
  {id: 'webcam-redonda-p', kind: 'borda', label: 'Webcam redonda pequena', use: 'câmera redonda pequena no canto', width: 280, height: 280, bleed: 48, props: {fit: 'janela', shape: 'circulo'}},
  {id: 'webcam-redonda', kind: 'borda', label: 'Webcam redonda', use: 'câmera redonda padrão', width: 400, height: 400, bleed: 48, props: {fit: 'janela', shape: 'circulo'}},
  {id: 'webcam-redonda-g', kind: 'borda', label: 'Webcam redonda grande', use: 'câmera redonda grande para Just Chatting', width: 560, height: 560, bleed: 48, props: {fit: 'janela', shape: 'circulo'}},
  {id: 'webcam-vertical', kind: 'borda', label: 'Webcam vertical', use: 'câmera 9:16 em lives verticais', width: 360, height: 640, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  {id: 'jogo', kind: 'borda', label: 'Jogo', use: 'captura do jogo em layouts com coluna lateral', width: 1440, height: 810, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  // Full-screen frames: the box is the whole file, so the frame is drawn inward.
  {id: 'tela-cheia', kind: 'borda', label: 'Tela cheia', use: 'moldura da tela inteira', width: 1920, height: 1080, bleed: 0, props: {fit: 'tela', shape: 'retangulo'}},
  {id: 'tela-vertical', kind: 'borda', label: 'Tela vertical', use: 'moldura da tela inteira vertical', width: 1080, height: 1920, bleed: 0, props: {fit: 'tela', shape: 'retangulo'}},
] as const satisfies readonly NamedSize[];

export const NAMED_SIZES: readonly NamedSize[] = NAMED_SIZE_TABLE;

export const getSize = (id: string): NamedSize => {
  const size = NAMED_SIZES.find((entry) => entry.id === id);
  if (!size) throw new Error(`Tamanho desconhecido: ${id}. Opções: ${NAMED_SIZES.map((entry) => entry.id).join(', ')}.`);
  return size;
};

export const sizesForKind = (kind: string): NamedSize[] => NAMED_SIZES.filter((size) => size.kind === kind);

/** The file size: the box centred inside a transparent bleed on every side. */
export const canvasOf = (size: Pick<NamedSize, 'width' | 'height' | 'bleed'>) => getBoxCanvas(size).canvas;

/** Props a named size sets before the schema parses the rest. */
export const sizeProps = (size: NamedSize): Record<string, unknown> => ({
  width: size.width, height: size.height, bleed: size.bleed, ...size.props,
});

type SizedProps = {width?: unknown; height?: unknown; bleed?: unknown} & Record<string, unknown>;

/**
 * The named size these props describe exactly (box, bleed, fit and shape), if any. A border's
 * window mask (`mascara`) is the window alone, without the bleed, so it matches its size by the box.
 */
export const matchNamedSize = (kind: string, props: SizedProps): NamedSize | undefined =>
  sizesForKind(kind).find((size) =>
    props.width === size.width && props.height === size.height && (props.bleed === size.bleed || props.mascara === true)
    // A window-sized border drawn as a full-screen frame is a different product; fit defaults to the window.
    && (props.fit ?? 'janela') === (size.props?.fit ?? 'janela')
    // So is a round one in a square box: webcam-redonda is not webcam-quadrada, though both are 400×400.
    && (props.shape ?? 'retangulo') === (size.props?.shape ?? 'retangulo'));

/**
 * File-name tag: the named size id, or the box as <W>x<H> for free sizes, followed by -circulo for
 * a round one, so a free circle never takes the name of the square of the same box.
 */
export const sizeTag = (kind: string, props: SizedProps): string => {
  const named = matchNamedSize(kind, props);
  if (named) return named.id;
  if (typeof props.width !== 'number' || typeof props.height !== 'number') {
    throw new Error('Esta composição não tem width/height: use o nome sem tamanho.');
  }
  return `${props.width}x${props.height}${props.shape === 'circulo' ? '-circulo' : ''}`;
};

/**
 * The file name without extension: Remotion's `defaultOutName` appends the extension itself. A
 * window mask is tagged after its size: `BordaLoop-webcam-16x9-mascara`.
 */
export const assetFileStem = ({id, kind, props}: {id: string; kind: string; props: SizedProps}) =>
  (kind === 'background' ? id : `${id}-${sizeTag(kind, props)}${props.mascara === true ? '-mascara' : ''}`);

/** Backgrounds keep <Id>.<ext>; sized kinds carry the size: <Id>-<sizeId|WxH>.<ext>. */
export const assetFileName = ({id, kind, props, format}: {
  id: string; kind: string; props: SizedProps; format: OutputFormat;
}) => `${assetFileStem({id, kind, props})}.${format}`;
