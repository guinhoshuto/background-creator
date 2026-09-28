import type {AssetKind, OverlayKind} from './kinds';
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
  {id: 'chat-compacto', kind: 'chat', label: 'Compact chat', use: 'screen corner, layouts with a large camera', width: 360, height: 480, bleed: 32},
  {id: 'chat-padrao', kind: 'chat', label: 'Standard chat', use: 'regular chat box (OBS, StreamElements, Streamlabs)', width: 400, height: 600, bleed: 32},
  {id: 'chat-alto', kind: 'chat', label: 'Tall chat', use: 'tall side panel next to the game', width: 400, height: 800, bleed: 32},
  {id: 'chat-coluna', kind: 'chat', label: 'Column chat', use: 'full-height column; the file is exactly as tall as the screen', width: 448, height: 1016, bleed: 32},
  {id: 'chat-vertical', kind: 'chat', label: 'Vertical chat', use: 'vertical streams (1080×1920 screen), bottom half', width: 960, height: 640, bleed: 32},
  // bloco: the box is the text panel. `shape` is spelled out so a size id alone fixes the product.
  {id: 'etiqueta-p', kind: 'bloco', label: 'Small label', use: 'short badge: "LIVE", @user', width: 320, height: 64, bleed: 24, props: {shape: 'retangulo'}},
  {id: 'etiqueta', kind: 'bloco', label: 'Label', use: 'labels: latest follower, goal, socials', width: 480, height: 96, bleed: 24, props: {shape: 'retangulo'}},
  {id: 'faixa', kind: 'bloco', label: 'Banner', use: 'lower third: name + title', width: 1200, height: 160, bleed: 32, props: {shape: 'retangulo'}},
  {id: 'titulo', kind: 'bloco', label: 'Title', use: 'screen titles (Starting, Be right back, Ending)', width: 1200, height: 240, bleed: 32, props: {shape: 'retangulo'}},
  {id: 'cartao', kind: 'bloco', label: 'Card', use: '16:9 card: schedule, rules, sponsor', width: 640, height: 360, bleed: 32, props: {shape: 'retangulo'}},
  {id: 'quadrado', kind: 'bloco', label: 'Square', use: 'QR code, avatar, highlight', width: 480, height: 480, bleed: 32, props: {shape: 'retangulo'}},
  {id: 'lista', kind: 'bloco', label: 'List', use: 'vertical list: weekly schedule, top supporters', width: 480, height: 720, bleed: 32, props: {shape: 'retangulo'}},
  // Round blocks: the text goes in the square centred inside the circle.
  {id: 'circulo-p', kind: 'bloco', label: 'Small circle', use: 'small badge: icon, social network, "LIVE"', width: 160, height: 160, bleed: 24, props: {shape: 'circulo'}},
  {id: 'circulo', kind: 'bloco', label: 'Circle', use: 'avatar, logo, counter', width: 320, height: 320, bleed: 32, props: {shape: 'circulo'}},
  {id: 'circulo-g', kind: 'bloco', label: 'Large circle', use: 'highlight, giveaway, goal', width: 480, height: 480, bleed: 32, props: {shape: 'circulo'}},
  // No bleed: the panel is the whole file, so nothing may glow outside it.
  {id: 'painel-twitch', kind: 'bloco', label: 'Twitch panel', use: 'Twitch profile panels (PNG/GIF, no outer glow)', width: 320, height: 160, bleed: 0, props: {shape: 'retangulo', glow: 0, halo: 0}},
  // borda: the box is the transparent window; frame and glow go outward into the bleed.
  // `fit` and `shape` are spelled out so a size id alone fixes the product, whatever a preset says.
  {id: 'webcam-16x9', kind: 'borda', label: 'Webcam 16:9', use: 'standard camera', width: 640, height: 360, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  {id: 'webcam-16x9-g', kind: 'borda', label: 'Large webcam 16:9', use: 'large camera (Just Chatting)', width: 960, height: 540, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  {id: 'webcam-4x3', kind: 'borda', label: 'Webcam 4:3', use: '4:3 cameras', width: 480, height: 360, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  {id: 'webcam-quadrada', kind: 'borda', label: 'Square webcam', use: 'square camera (for a round camera, use webcam-redonda)', width: 400, height: 400, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  // Round windows: the camera goes through the window's OBS mask (the white disc) to turn round.
  {id: 'webcam-redonda-p', kind: 'borda', label: 'Small round webcam', use: 'small round camera in the corner', width: 280, height: 280, bleed: 48, props: {fit: 'janela', shape: 'circulo'}},
  {id: 'webcam-redonda', kind: 'borda', label: 'Round webcam', use: 'standard round camera', width: 400, height: 400, bleed: 48, props: {fit: 'janela', shape: 'circulo'}},
  {id: 'webcam-redonda-g', kind: 'borda', label: 'Large round webcam', use: 'large round camera for Just Chatting', width: 560, height: 560, bleed: 48, props: {fit: 'janela', shape: 'circulo'}},
  {id: 'webcam-vertical', kind: 'borda', label: 'Vertical webcam', use: '9:16 camera in vertical streams', width: 360, height: 640, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  {id: 'jogo', kind: 'borda', label: 'Game', use: 'game capture in layouts with a side column', width: 1440, height: 810, bleed: 48, props: {fit: 'janela', shape: 'retangulo'}},
  // Full-screen frames: the box is the whole file, so the frame is drawn inward.
  {id: 'tela-cheia', kind: 'borda', label: 'Full screen', use: 'frame for the whole screen', width: 1920, height: 1080, bleed: 0, props: {fit: 'tela', shape: 'retangulo'}},
  {id: 'tela-vertical', kind: 'borda', label: 'Vertical screen', use: 'frame for the whole vertical screen', width: 1080, height: 1920, bleed: 0, props: {fit: 'tela', shape: 'retangulo'}},
] as const satisfies readonly NamedSize[];

export const NAMED_SIZES: readonly NamedSize[] = NAMED_SIZE_TABLE;

export const getSize = (id: string): NamedSize => {
  const size = NAMED_SIZES.find((entry) => entry.id === id);
  if (!size) throw new Error(`Unknown size: ${id}. Options: ${NAMED_SIZES.map((entry) => entry.id).join(', ')}.`);
  return size;
};

export const sizesForKind = (kind: AssetKind): NamedSize[] => NAMED_SIZES.filter((size) => size.kind === kind);

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
export const matchNamedSize = (kind: AssetKind, props: SizedProps): NamedSize | undefined =>
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
export const sizeTag = (kind: AssetKind, props: SizedProps): string => {
  const named = matchNamedSize(kind, props);
  if (named) return named.id;
  if (typeof props.width !== 'number' || typeof props.height !== 'number') {
    throw new Error('This composition has no width/height: use the name without a size.');
  }
  return `${props.width}x${props.height}${props.shape === 'circulo' ? '-circulo' : ''}`;
};

/**
 * The file name without extension: Remotion's `defaultOutName` appends the extension itself. A
 * window mask is tagged after its size: `BordaLoop-webcam-16x9-mascara`.
 */
export const assetFileStem = ({id, kind, props}: {id: string; kind: AssetKind; props: SizedProps}) =>
  (kind === 'background' ? id : `${id}-${sizeTag(kind, props)}${props.mascara === true ? '-mascara' : ''}`);

/** Backgrounds keep <Id>.<ext>; sized kinds carry the size: <Id>-<sizeId|WxH>.<ext>. */
export const assetFileName = ({id, kind, props, format}: {
  id: string; kind: AssetKind; props: SizedProps; format: OutputFormat;
}) => `${assetFileStem({id, kind, props})}.${format}`;
