import {z} from 'zod';
import {createSeededRandom, TAU} from '../../loop';
import {baseBackgroundSchema} from '../../settings';
import {getSize} from '../../sizes';
import {kindPolicies} from '../../kinds';
import {
  FRAME_FITS, buildFillScene, buildGlowScene, buildHaloScene, buildRimScene, buildStrokeScene, clampRadius, colorRepeatsOf, cycleOf,
  fillFields, getBoxCanvas, glowFields, haloFields, rimLightField, getFillMotion, getStrokeMotion, isCircle, layoutFrame, minBleedFor, offsetRoundRect, overlayBaseFields, radiusField, refineCanvas, roundRect,
  refineFill, refineHole, refineOutset, refineShape, refineStroke, reportSpeed, roundRectSdf, shapeField, shapeRadius, strokeFields,
  trackOpacityField, type AssetLayout, type FillElement,
  type AssetMotion, type FillOptions, type FrameLayout, type GlowElement, type HaloElement, type Rect, type RimElement, type RoundRect,
  type StrokeElement, type StrokeMotionName, type StrokeOptions,
  buildFlashScene, buildOrnamentScene, frameOrnamentFrame, layoutOrnaments, layoutOutset, ornamentFields, refineLightning, refineOrnaments,
  type FlashElement, type OrnamentElement, type OrnamentLayout,
} from '../shared';

/**
 * BordaLoop: a border around a transparent window (a webcam, a game capture) or a frame around
 * the whole screen. The band is painted by the shared fills, the stroke motions run along its
 * centreline, an optional thin second line runs outside it, and the corners may carry brackets
 * or gems. Everything is drawn inside the shared FrameGroup, which masks the hole out of every
 * layer, so the window stays alpha 0 whatever the props.
 */

const SIZE = getSize(kindPolicies.borda.defaultSizeId!);

/** The round window sizes, for the refusal of a circle in a box that is not square. */
const ROUND_SIZES = 'webcam-redonda-p, webcam-redonda ou webcam-redonda-g';

export const CORNER_STYLES = ['nenhum', 'colchetes', 'joias'] as const;

const bordaFields = z.object({
  ...overlayBaseFields({width: SIZE.width, height: SIZE.height, bleed: SIZE.bleed}),
  // MP4 and GIF composite over this colour, the window included: a dark violet suits the neon look.
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#0B0620'),
  fit: z.enum(FRAME_FITS).default('janela')
    .describe('janela: a caixa é a janela transparente e a moldura vai para fora, no bleed; tela: a caixa é o arquivo inteiro (use bleed 0) e a moldura é desenhada para dentro'),
  shape: shapeField('Forma da janela: retangulo (cantos com radius) ou circulo, para câmera redonda (a caixa precisa ser quadrada: use --size webcam-redonda-p, webcam-redonda ou webcam-redonda-g; só com fit janela)'),
  mascara: z.boolean().default(false)
    .describe('Exporta só a máscara da janela (PNG branco) para o filtro Máscara de Imagem do OBS'),
  radius: radiusField(16).describe('Raio dos cantos da janela, em px; limitado a metade do menor lado; com shape circulo é ignorado, o raio é metade do lado'),
  thickness: z.number().finite().min(2).max(256).default(10)
    .describe('Espessura da faixa da moldura, em px; o contorno corre no meio dela'),
  ...fillFields({
    fill: 'solido', fillColors: ['#120A38'], fillOpacity: 0.9, fillScale: 12, fillSpeed: 24, fillAngle: 45,
  }),
  ...strokeFields({
    strokeMotion: 'cometas', strokeColors: ['#22D3EE', '#E879F9', '#A78BFA'], strokeWidth: 4, strokeWidthMin: 0,
    dashLength: 18, gapLength: 12, cometSpacing: 640, cometTail: 320, strokeSpeed: 160, strokePulses: 1, strokeCore: 0.9,
  }),
  trackOpacity: trackOpacityField(0.45),
  ...glowFields({glow: 16, glowPulses: 0, glowStrength: 2.6}),
  ...haloFields({halo: 0, haloColor: '#A78BFA'}),
  rimLight: rimLightField(0),
  lines: z.number().int().min(1).max(2).default(2)
    .describe('1: só a faixa; 2: mais uma linha fina por fora dela, separada por lineGap (em formigas e cometas ela fica parada)'),
  lineGap: z.number().finite().min(1).max(64).default(4)
    .describe('Espaço entre a faixa e a segunda linha, em px'),
  outerLineWidth: z.number().finite().min(1).max(32).default(2)
    .describe('Espessura da segunda linha, em px; 2 ou mais evita perda de cor no WebM'),
  corners: z.enum(CORNER_STYLES).default('colchetes')
    .describe('Enfeite dos cantos: nenhum, colchetes (cantoneiras em volta da moldura) ou joias (losangos sobre a faixa)'),
  cornerSize: z.number().finite().min(4).max(512).default(28)
    .describe('colchetes: comprimento de cada braço depois da curva do canto, em px; no círculo, cada colchete é um arco de 4×cornerSize px'),
  cornerGap: z.number().finite().min(0).max(128).default(6)
    .describe('colchetes: distância da borda externa da moldura, em px; em tela eles ficam para dentro, a partir da borda do arquivo'),
  gemSize: z.number().finite().min(4).max(128).default(14)
    .describe('joias: largura de cada losango, em px'),
  cornerPulses: z.number().int().min(0).max(16).default(1)
    .describe('Quantas vezes os cantos pulsam por ciclo, acendendo um depois do outro; 0 deixa constante'),
  ...ornamentFields(),
});

export type BordaLoopProps = z.infer<typeof bordaFields>;

/** The shared engine's name for each track index a border draws on. */
export const TRACK_MAIN = 0;
export const TRACK_SECOND = 1;
export const TRACK_BRACKETS = 2;

/** Corners in the order the arc length meets them: top-right, bottom-right, bottom-left, top-left. */
const CORNER_SIGNS = [[1, -1], [1, 1], [-1, 1], [-1, -1]] as const;

export type BordaGeometry = {
  /** The shared frame layout; its outset also holds the corner ornaments. */
  layout: FrameLayout;
  /** Band, gap and second line together: what layoutFrame lays out. */
  totalThickness: number;
  /** The outer edge of the band itself (the second line lies beyond it). */
  band: RoundRect;
  /** Main line, second line, brackets: the `track` index of every element names one. */
  tracks: [RoundRect, RoundRect, RoundRect];
  /** The rect the fill is built over; the band clip keeps only the frame. */
  fillArea: Rect;
  /** Width of the brackets. */
  cornerWidth: number;
  /** Centre and half-length (arc length) of each bracket, on the bracket track. */
  brackets: {s: number; half: number}[];
  /** Centre of each gem. */
  gems: {x: number; y: number}[];
  /** How far the corner ornaments reach beyond the box, glow excluded ('janela'). */
  cornerOutset: number;
  /**
   * Where the themed ornaments go (none with ornaments 'nenhum'), on the frame's outer edge; around
   * a window their reach beyond the box is folded into the layout's outset (a screen keeps 0).
   */
  ornamentLayout: OrnamentLayout;
};

/** Where the arc length of a track meets the middle of each round (or square) corner. */
const cornerArcs = (track: RoundRect) => {
  const r = clampRadius(track.radius, track.width, track.height);
  const a = track.width - 2 * r;
  const b = track.height - 2 * r;
  const q = (Math.PI / 2) * r;
  const first = a / 2 + q / 2;
  return {a, b, q, mids: [first, first + q + b, first + 2 * q + b + a, first + 3 * q + 2 * b + a]};
};

/** The middle of a corner of the track, and the diagonal pointing out of it. */
const cornerPoint = (track: RoundRect, index: number) => {
  const [sx, sy] = CORNER_SIGNS[index]!;
  const r = clampRadius(track.radius, track.width, track.height);
  const d = {x: sx * Math.SQRT1_2, y: sy * Math.SQRT1_2};
  const cx = track.x + track.width / 2 + sx * (track.width / 2 - r);
  const cy = track.y + track.height / 2 + sy * (track.height / 2 - r);
  return {x: cx + r * d.x, y: cy + r * d.y, d};
};

/**
 * The single source of truth for a border's geometry. The band hugs the window, the second line
 * lies `lineGap` beyond it, and layoutFrame lays out the three as one band, so a full-screen
 * frame keeps them all inside the file. Brackets are pieces of a rounded rect concentric with the
 * frame, so they follow its corners (an L on a square corner; on a circle, four arcs centred on
 * the diagonals, each 4·cornerSize px long and at most 70% of a quarter so they never close into
 * a ring). Gems sit on the band's corners, moved along the diagonal just enough never to touch the
 * hole (nor, on a screen, to leave the file).
 */
export const getBordaGeometry = (props: BordaLoopProps): BordaGeometry => {
  const second = props.lines === 2 ? props.lineGap + props.outerLineWidth : 0;
  const totalThickness = props.thickness + second;
  const base = layoutFrame({
    width: props.width, height: props.height, bleed: props.bleed, radius: props.radius, shape: props.shape,
    thickness: totalThickness, glow: props.glow, fit: props.fit,
  });
  const window = base.window;
  const band = offsetRoundRect(window, props.thickness);
  const main = offsetRoundRect(window, props.thickness / 2);
  const outerLine = offsetRoundRect(window, props.thickness + props.lineGap + props.outerLineWidth / 2);
  const cornerWidth = Math.max(2, props.strokeWidth);
  const bracketOffset = props.cornerGap + cornerWidth / 2;
  // Brackets go out into the bleed around a window, and in from the file's edge on a screen.
  const bracketTrack = offsetRoundRect(base.outer, props.fit === 'janela' ? bracketOffset : -bracketOffset);

  const arcs = cornerArcs(bracketTrack);
  // A bracket covers its corner and cornerSize px of each side. A circle has no corner to cover,
  // so there each bracket is an arc of 4·cornerSize px: the same length on every round size, set
  // by the prop like the arms it stands for. Either way it never runs more than 70% of the way to
  // the next corner: four quarter arcs of a circle would close into a plain ring.
  const wanted = isCircle(bracketTrack) ? 2 * props.cornerSize : arcs.q / 2 + props.cornerSize;
  const half = Math.min(wanted, 0.35 * (arcs.q + Math.min(arcs.a, arcs.b)));
  const brackets = arcs.mids.map((s) => ({s, half}));

  const box = base.box;
  const reach = props.gemSize / 2;
  const gems = CORNER_SIGNS.map(([sx, sy], index) => {
    const point = cornerPoint(main, index);
    // Along the corner's diagonal the distance to the hole grows one to one (every shape shares
    // that diagonal), so the push that clears the gem's circumcircle is exact.
    const push = Math.max(0, reach - roundRectSdf(base.holeShape, point.x, point.y));
    let x = point.x + point.d.x * push;
    let y = point.y + point.d.y * push;
    if (props.fit === 'tela') {
      // On a screen the file's edge is a wall too: a gem wider than the band slides back along the
      // diagonal into the glow's margin (the schema refuses it when there is no room for both).
      const room = Math.min(sx > 0 ? box.x + box.width - x : x - box.x, sy > 0 ? box.y + box.height - y : y - box.y);
      const pull = Math.max(0, reach - room);
      x -= sx * pull;
      y -= sy * pull;
    }
    return {x, y};
  });

  // How far a gem's tips reach past the box, on the side where they reach furthest.
  const beyond = ({x, y}: {x: number; y: number}) => Math.max(
    box.x - (x - reach), (x + reach) - (box.x + box.width), box.y - (y - reach), (y + reach) - (box.y + box.height), 0,
  );
  const cornerOutset = props.corners === 'colchetes'
    ? totalThickness + props.cornerGap + cornerWidth
    : props.corners === 'joias' ? Math.max(...gems.map(beyond)) : 0;
  // Around a window the halo spreads out from the frame's outer edge, and the corners carry the
  // glow further out; on a screen nothing leaves the box.
  // The themed ornaments hang on the base frame (its outer edge includes the second line) and
  // never feed back into it: seed- and frame-free, like everything above.
  const ornamentFrame = frameOrnamentFrame({layout: base, track: main, glow: props.glow});
  const ornamentLayout = layoutOrnaments(ornamentFrame, props);
  const layout: FrameLayout = props.fit === 'janela'
    ? {
      ...base,
      outset: Math.max(
        base.outset, totalThickness + props.halo, props.corners === 'nenhum' ? 0 : cornerOutset + props.glow,
        layoutOutset(ornamentLayout),
      ),
    }
    : base;
  const fillArea = props.fit === 'janela'
    ? {x: band.x, y: band.y, width: band.width, height: band.height}
    : {...box};

  return {
    layout, totalThickness, band, tracks: [main, outerLine, bracketTrack], fillArea, cornerWidth, brackets, gems, cornerOutset,
    ornamentLayout,
  };
};

/**
 * Whether the band covers the box's corners, so an opaque matte there rounds off a rectangular
 * camera as big as the box: true up to a window radius of (1 + √2)·thickness. Past it (a round
 * webcam) the camera's corners stick out of the band whatever is painted, and the window's mask
 * (mascara) is what rounds it; a matte would only turn most of a round band opaque.
 */
export const bandCoversCorners = ({band, layout}: Pick<BordaGeometry, 'band' | 'layout'>) =>
  layout.fit === 'janela' && roundRectSdf(band, layout.box.x, layout.box.y) <= 1e-9;

/** The engine's cap on sparkles for a fill whose whole area shows (a panel). */
const PANEL_SPARKS = 400;
/** However large the frame, a border never lists more sparkles than this (tens of thousands would slow every frame). */
const MAX_BORDA_SPARKS = 6000;

const roundRectArea = (shape: RoundRect) => {
  const r = clampRadius(shape.radius, shape.width, shape.height);
  return shape.width * shape.height - (4 - Math.PI) * r * r;
};

/**
 * How the band's fill is built. It is laid out over the band's bounding box (fillArea), but only
 * the band and the corners show, so the engine's sparkle cap is scaled by how much of that box is
 * hidden: the band keeps the density fillScale promises at every size, not a fixed count spread
 * thin over the window. Sparkles in place that could never reach the painted part are dropped
 * (embers rise across the whole box, so all of them can). Around a window only the band shows (a
 * round window's box corners lie beyond it, clipped away); on a screen, the file's corners too.
 */
export const bordaFillOptions = (geometry: BordaGeometry): FillOptions => {
  const {band, fillArea, layout} = geometry;
  const painted = Math.max(1, roundRectArea(band) - roundRectArea(layout.window));
  const hidden = (fillArea.width * fillArea.height) / painted;
  const box = {...layout.box, radius: 0};
  return {
    maxSparks: Math.min(MAX_BORDA_SPARKS, Math.ceil(PANEL_SPARKS * Math.max(1, hidden))),
    keepSpark: (x, y, reach) => roundRectSdf(layout.window, x, y) >= -reach
      && (roundRectSdf(band, x, y) <= reach || (layout.fit === 'tela' && roundRectSdf(box, x, y) <= reach)),
  };
};

/**
 * The OBS mask of a border's window: in mask mode the file is exactly the box (the camera's size)
 * and holds one opaque white shape, the rounded window, on transparency. OBS's Image Mask filter
 * reads either its alpha or its colour, and both say the same. Nothing moves: it is one PNG.
 */
export type MaskWindowElement = {
  type: 'mask-window'; x: number; y: number; width: number; height: number; corner: number; color: string; opacity: number;
};

/** The window a mask cuts out: the box at (0, 0) with the clamped radius (a disc for a circle). */
const maskWindow = (props: BordaLoopProps) => roundRect(getBoxCanvas(props).box, shapeRadius(props));

export const getBordaMaskElement = (props: BordaLoopProps): MaskWindowElement => {
  const window = maskWindow(props);
  return {
    type: 'mask-window', x: window.x, y: window.y, width: window.width, height: window.height, corner: window.radius,
    color: '#FFFFFF', opacity: 1,
  };
};

/**
 * The props of the mask that goes with a window border, or null when there is none (a screen
 * frame, or a mask already). Only the window's box and clamped radius decide the mask, so every
 * theme of one size and radius shares it; the rest are the mask mode's own requirements. The
 * shape travels with it so the mask is named after its own size: a round webcam's white disc is
 * not the square webcam's mask, though both are 400×400.
 */
export const getBordaMask = (props: BordaLoopProps): Record<string, unknown> | null => {
  if (props.fit !== 'janela' || props.mascara) return null;
  return {
    width: props.width, height: props.height, shape: props.shape, radius: maskWindow(props).radius, fit: 'janela',
    mascara: true, bleed: 0, outputFormat: 'png', transparent: true,
  };
};

/** The speeds the border actually shows along its main line and over its band (see AssetMotion). */
export const getBordaMotion = (props: BordaLoopProps): AssetMotion => {
  if (props.mascara) return {strokeSpeed: 0, fillSpeed: 0};
  const geometry = getBordaGeometry(props);
  return {
    strokeSpeed: reportSpeed(getStrokeMotion(props, geometry.tracks[TRACK_MAIN]).speed),
    fillSpeed: reportSpeed(getFillMotion(props, geometry.fillArea, bordaFillOptions(geometry)).speed),
  };
};

/** The pure layout the exporter's sidecar and the Studio's metadata read. */
export const getBordaLayout = (props: BordaLoopProps): AssetLayout => {
  if (props.mascara) {
    // The file is the window itself; there is no hole to keep empty, the window is what is drawn.
    const {canvas, box} = getBoxCanvas(props);
    return {canvas, box, content: {...box}, outset: 0};
  }
  const {canvas, box, content, hole, outset} = getBordaGeometry(props).layout;
  return {canvas, box, content, hole, outset};
};

/**
 * Whatever is drawn beyond the box must fit in the bleed ('janela'), and on a screen the corner
 * ornaments must stay between the hole and the file's edge ('tela'); refused with the way out.
 */
const refineReach = (props: BordaLoopProps, geometry: BordaGeometry, context: z.RefinementCtx) => {
  if (props.fit === 'janela') {
    const frameOutset = geometry.totalThickness + Math.max(props.glow, props.halo);
    // The band and its glow come first, with the shared message; it names the bleed that holds
    // the corners too, so following it is enough.
    if (frameOutset > props.bleed + 1e-9) {
      refineOutset(props, geometry.layout.outset, context);
      return;
    }
    if (geometry.layout.outset <= props.bleed + 1e-9) return;
    context.addIssue({
      code: 'custom',
      path: ['bleed'],
      message: props.corners === 'colchetes'
        ? `Os colchetes passam da margem: use bleed ≥ ${minBleedFor(geometry.layout.outset)} ou diminua cornerGap ou o brilho.`
        : `As joias passam da margem: use bleed ≥ ${minBleedFor(geometry.layout.outset)} ou diminua gemSize ou o brilho.`,
    });
    return;
  }
  if (props.corners === 'colchetes' && props.cornerGap + geometry.cornerWidth > geometry.totalThickness + props.glow + 1e-9) {
    context.addIssue({
      code: 'custom',
      path: ['cornerGap'],
      message: `Os colchetes entrariam na janela: em tela use cornerGap ≤ ${Math.max(0, geometry.totalThickness + props.glow - geometry.cornerWidth)} ou aumente thickness ou o brilho.`,
    });
  }
  if (props.corners === 'joias') {
    const {box, holeShape} = geometry.layout;
    const reach = props.gemSize / 2;
    const fits = geometry.gems.every((gem) => gem.x - reach >= box.x - 1e-9 && gem.x + reach <= box.x + box.width + 1e-9
      && gem.y - reach >= box.y - 1e-9 && gem.y + reach <= box.y + box.height + 1e-9
      && roundRectSdf(holeShape, gem.x, gem.y) >= reach - 1e-9);
    if (!fits) {
      context.addIssue({
        code: 'custom',
        path: ['gemSize'],
        message: 'As joias não cabem entre a janela e a borda do arquivo: diminua gemSize ou aumente thickness ou o brilho.',
      });
    }
  }
};

/** What the second line draws: it never carries travelling pieces, only the colours and the breath. */
const secondMotion = (motion: StrokeMotionName): StrokeMotionName =>
  (motion === 'formigas' || motion === 'cometas' ? 'parado' : motion);

/**
 * A mask is only the window, as big as the camera: it needs a window ('janela'), no bleed, a PNG
 * and transparency. The frame's own refusals (glow, corners, speeds) do not apply: none of it is
 * drawn.
 */
const refineMask = (props: BordaLoopProps, context: z.RefinementCtx) => {
  const issue = (path: string, message: string) => context.addIssue({code: 'custom', path: [path], message});
  if (props.fit !== 'janela') issue('fit', 'A máscara vale só para fit janela: numa moldura de tela a janela ocupa a tela inteira e não precisa de máscara.');
  if (props.bleed !== 0) issue('bleed', 'Na máscara o arquivo é a própria janela, do tamanho da câmera: use bleed 0 (com --size, junte --bleed 0).');
  if (props.outputFormat !== 'png') issue('outputFormat', 'A máscara é uma imagem parada: exporte em PNG (--format png).');
  if (!props.transparent) issue('transparent', 'A máscara precisa de fundo transparente: use transparent true.');
};

export const bordaLoopSchema = bordaFields.superRefine((props, context) => {
  refineCanvas(props, context);
  // A full-screen frame follows the screen, which is a rectangle: a round window is a camera's.
  // Checked before the square box, so a round screen frame is not first sent to square its box
  // only to be refused again here.
  if (props.shape === 'circulo' && props.fit === 'tela') {
    context.addIssue({
      code: 'custom',
      path: ['shape'],
      message: 'A moldura de tela acompanha a tela, que é retangular: use shape retangulo com fit tela, ou fit janela para uma câmera redonda (--size webcam-redonda).',
    });
    return;
  }
  if (!refineShape(props, ROUND_SIZES, context)) return;
  if (props.mascara) {
    refineMask(props, context);
    return;
  }
  // A screen frame draws nothing outside the box, so a bleed would only pad the file with an empty
  // margin and the file would no longer be the screen's size.
  if (props.fit === 'tela' && props.bleed !== 0) {
    context.addIssue({
      code: 'custom',
      path: ['bleed'],
      message: 'Em tela a caixa é o arquivo inteiro: use bleed 0 (ou --size tela-cheia / tela-vertical).',
    });
    return;
  }
  if (props.strokeWidth > props.thickness) {
    context.addIssue({
      code: 'custom',
      path: ['strokeWidth'],
      message: `O contorno é mais largo que a faixa: use strokeWidth ≤ ${props.thickness} ou aumente thickness.`,
    });
    return;
  }
  const geometry = getBordaGeometry(props);
  if (props.fit === 'tela') refineHole(geometry.layout, context);
  refineReach(props, geometry, context);
  // Only the main line is checked: the second line is an outward offset of it, so it is longer,
  // travels no more colour periods per cycle and covers no larger share of one per frame. Checking
  // it too would only add a second refusal whose suggested speed the main line still refuses.
  refineStroke(props, geometry.tracks[TRACK_MAIN], context);
  refineFill(props, geometry.fillArea, context, bordaFillOptions(geometry));
  refineLightning(props, context);
  refineOrnaments(geometry.ornamentLayout, props, context);
}, {when: (payload) => payload.issues.length === 0});

/** A piece of the bracket track, from `s` to `s + length`, drawn with butt ends. */
export type BracketElement = {
  type: 'bracket'; track: number; s: number; length: number; width: number; color: string; opacity: number;
};

/** A diamond `size` px wide centred on (x, y), with a small highlight. */
export type GemElement = {type: 'gem'; x: number; y: number; size: number; color: string; opacity: number};

export type CornerElement = BracketElement | GemElement;

/**
 * The corner ornaments: fixed in place, so the seed never moves them; only their opacity (and
 * a gem's size) breathes, `cornerPulses` whole times per cycle, one corner after the other.
 */
export const buildCornerScene = (
  props: BordaLoopProps, geometry: BordaGeometry, frame: number, durationInFrames: number,
): CornerElement[] => {
  if (props.corners === 'nenhum') return [];
  const cycle = cycleOf(frame, durationInFrames);
  const phase = createSeededRandom(props.seed + 401)() * TAU;
  const colors = props.strokeColors;
  const level = (index: number) => (props.cornerPulses > 0
    ? 0.5 + 0.5 * Math.cos(props.cornerPulses * cycle * TAU + phase - (index * TAU) / 4)
    : 1);
  if (props.corners === 'colchetes') {
    return geometry.brackets.map(({s, half}, index): BracketElement => ({
      type: 'bracket', track: TRACK_BRACKETS, s: s - half, length: 2 * half, width: geometry.cornerWidth,
      color: colors[index % colors.length]!, opacity: 0.5 + 0.5 * level(index),
    }));
  }
  return geometry.gems.map(({x, y}, index): GemElement => ({
    type: 'gem', x, y, size: props.gemSize * (0.8 + 0.2 * level(index)),
    color: colors[index % colors.length]!, opacity: 0.55 + 0.45 * level(index),
  }));
};

export type BordaSceneParts = {
  geometry: BordaGeometry;
  halo: HaloElement[];
  /** Ornaments tucked under the band (see OrnamentLayer). */
  ornamentBack: OrnamentElement[];
  fill: FillElement[];
  rim: RimElement[];
  stroke: StrokeElement[];
  corners: CornerElement[];
  glow: GlowElement[];
  /** Ornaments over the lines, then the lightning flash over everything. */
  ornamentFront: OrnamentElement[];
  flash: FlashElement[];
};

/**
 * What the second line of a double line takes from the main one: its colour repeats and its laps
 * (see StrokeOptions), so the two flow in step.
 */
export const secondLineOptions = (props: BordaLoopProps, geometry: BordaGeometry): StrokeOptions => {
  const main = geometry.tracks[TRACK_MAIN];
  return {colorRepeats: colorRepeatsOf(props, main), laps: getStrokeMotion(props, main).laps};
};

/** The scene split by layer, for the component; getBordaScene flattens it for the scans. */
export const getBordaSceneParts = (props: BordaLoopProps, frame: number, durationInFrames: number): BordaSceneParts => {
  const geometry = getBordaGeometry(props);
  const fill = buildFillScene(props, geometry.fillArea, frame, durationInFrames, bordaFillOptions(geometry));
  const main = buildStrokeScene(props, geometry.tracks[TRACK_MAIN], frame, durationInFrames, {
    track: TRACK_MAIN, trackOpacity: props.trackOpacity,
  });
  // Same seed stream, as many colour repeats and as many laps as the main line, so a breath or a
  // colour flow stays in step on both. The longer second line then covers the same share of a
  // repeat per frame as the main one, which refineStroke already checked.
  const second = props.lines === 2
    ? buildStrokeScene({...props, strokeMotion: secondMotion(props.strokeMotion)}, geometry.tracks[TRACK_SECOND], frame, durationInFrames, {
      track: TRACK_SECOND, width: props.outerLineWidth, ...secondLineOptions(props, geometry),
    })
    : [];
  const ornaments = buildOrnamentScene(geometry.ornamentLayout, props, frame, durationInFrames);
  return {
    geometry,
    // The halo spreads outwards from the frame, into the bleed: a screen frame has none to spread into.
    halo: props.fit === 'janela' ? buildHaloScene(props, frame, durationInFrames) : [],
    ornamentBack: ornaments.back,
    fill,
    // Along the band's outer edge, half a pixel in, so the 1 px line stays on the band.
    rim: buildRimScene(props, offsetRoundRect(geometry.band, -0.5)),
    stroke: [...main, ...second],
    corners: buildCornerScene(props, geometry, frame, durationInFrames),
    glow: buildGlowScene(props, frame, durationInFrames),
    ornamentFront: ornaments.front,
    flash: buildFlashScene(props, frame, durationInFrames),
  };
};

/**
 * Every animated value of the border as a flat list listed by place: the halo, the back ornaments,
 * the band's fill, the rim light, the lines, the corners, the glow, the front ornaments and the
 * lightning flash. Pure: the frame, the props and the seed decide it all; nothing jumps
 * at the seam, so no field needs an exemption. A mask is its single still window.
 */
export const getBordaScene = (props: BordaLoopProps, frame: number, durationInFrames: number) => {
  if (props.mascara) return [getBordaMaskElement(props)];
  const {halo, ornamentBack, fill, rim, stroke, corners, glow, ornamentFront, flash} = getBordaSceneParts(props, frame, durationInFrames);
  return [...halo, ...ornamentBack, ...fill, ...rim, ...stroke, ...corners, ...glow, ...ornamentFront, ...flash];
};
