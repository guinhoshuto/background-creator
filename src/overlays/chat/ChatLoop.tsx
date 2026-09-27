import {zColor} from '@remotion/zod-types';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {getSize} from '../../sizes';
import {
  FillLayer, HaloLayer, MAX_CONTENT_OPACITY, OverlayCanvas, RimLayer, StrokeLayer, buildFillScene, buildGlowScene, buildHaloScene,
  buildRimScene, buildStrokeScene, fillFields, fitClearContent, glowFields, glowOverArea, haloFields, layoutPanel, offsetRoundRect,
  overlayBaseFields, paddingField, radiusField, rimLightField, rectPath, refineCanvas, refineContent, refineFill, refineOutset, refineRim, refineStroke, reportSpeed, roundRectPath,
  strokeFields, trackOpacityField, useStage, getFillMotion, getStrokeMotion, type AssetMotion, type FillElement, type FillOptions, type GlowElement, type GlowSource, type HaloElement,
  type PanelLayout, type Rect, type RimElement, type StrokeElement, type StrokeOptions,
  FLASH_PANEL_PEAK, FlashLayer, OrnamentLayer, buildFlashScene, buildOrnamentScene, layoutOrnaments, layoutOutset, ornamentFields, panelOrnamentFrame,
  refineLightning, refineOrnaments, type FlashElement, type OrnamentElement, type OrnamentLayout,
} from '../shared';

/**
 * ChatLoop: the panel a chat widget (OBS, StreamElements, Streamlabs) draws its messages on.
 * The fill is the product here, so every default keeps it calm under text: dark or pale bases,
 * low-contrast patterns, and the motion on the edge. An optional header band on top holds the
 * title ("CHAT"), separated from the messages by a line; the layout reports its own text area.
 */

const baseFields = overlayBaseFields(getSize('chat-padrao'));

const chatFields = z.object({
  ...baseFields,
  // The colour MP4 and GIF are flattened on: the neon night the default panel belongs to.
  backgroundColor: baseFields.backgroundColor.default('#0B0620'),
  radius: radiusField(16),
  padding: paddingField(16),
  // A deep indigo night, a touch lighter at the top, under a neon tube: its hot core, a bright
  // bloom (glowStrength) and a violet halo are what make it read as light on any backdrop.
  ...fillFields({
    fill: 'gradiente',
    fillColors: ['#120A38', '#26105C', '#0A1C4E'],
    fillOpacity: 0.9,
    fillScale: 32,
    fillSpeed: 16,
    fillAngle: 60,
    fillLight: 0.05,
  }),
  ...strokeFields({
    strokeMotion: 'cometas',
    strokeColors: ['#22D3EE', '#E879F9', '#A78BFA'],
    strokeWidth: 3,
    cometSpacing: 640,
    cometTail: 320,
    strokeSpeed: 160,
    strokeCore: 0.9,
  }),
  // The same prop as bloco and borda, so a theme's outline reads as one family across its kinds.
  trackOpacity: trackOpacityField(0.45),
  ...glowFields({glow: 20, glowPulses: 1, glowStrength: 3}),
  ...haloFields({halo: 24, haloColor: '#A855F7'}),
  rimLight: rimLightField(0),
  headerHeight: z.number().int().min(0).max(512).default(48)
    .describe('Altura do cabeçalho no topo do painel (onde vai o título, ex.: "CHAT"), em px; 0 = sem cabeçalho'),
  headerColor: zColor().default('#E879F9').describe('Cor da faixa do cabeçalho'),
  headerOpacity: z.number().finite().min(0).max(1).default(0.1)
    .describe('Opacidade da faixa do cabeçalho, de 0 a 1; 0 deixa só a linha'),
  headerLineWidth: z.number().finite().min(0).max(16).default(2)
    .describe('Espessura da linha entre o cabeçalho e as mensagens, em px, nas cores do contorno; 0 = sem linha'),
  ...ornamentFields(),
});

export type ChatLoopProps = z.infer<typeof chatFields>;

/** Chat panels have room for many sparkles; past this they read as noise behind the messages. */
const CHAT_MAX_SPARKS = 160;
/** The glass sheen passes over the messages: dimmer than the engine's default keeps them legible. */
const CHAT_SHEEN_OPACITY = 0.2;
/** The line between header and messages: bright, but a step below the edge itself. */
const DIVIDER_OPACITY = 0.9;

const fillOptions = (layout: PanelLayout): FillOptions => ({
  corner: layout.shape.radius,
  sheenOpacity: CHAT_SHEEN_OPACITY,
  maxSparks: CHAT_MAX_SPARKS,
});

const strokeOptions = (props: Pick<ChatLoopProps, 'trackOpacity'>): StrokeOptions => ({trackOpacity: props.trackOpacity});

/** The panel's geometry plus the header: its band, the dividing line and the title's own text area. */
export type ChatLayout = PanelLayout & {
  /** Where the title goes, whole pixels; null without a header. */
  header: Rect | null;
  /** The tinted band of the header, inside the stroke; null without a header. */
  headerBand: Rect | null;
  /** The dividing line's rect (full width inside the stroke); null without a line. */
  divider: Rect | null;
  /** Where the ornaments go (none with ornaments 'nenhum'); their reach beyond the box is folded into outset. */
  ornamentLayout: OrnamentLayout;
};

type LayoutProps = Pick<ChatLoopProps,
  'width' | 'height' | 'bleed' | 'radius' | 'padding' | 'strokeWidth' | 'glow' | 'halo' | 'headerHeight' | 'headerLineWidth'
  | 'ornaments' | 'ornamentSize' | 'ornamentScale'>;

/**
 * The single source of truth for a chat panel's geometry, in canvas pixels. The header takes
 * the top `headerHeight` px inside the stroke and the line sits right under it, so the messages'
 * content starts one padding below the line. The title's area keeps the side padding and a
 * quarter of the band (at most one padding) above and below. Near round corners both keep that
 * space from the curve too (fitClearContent), as a block's text does: in a pill, a corner of the
 * messages would otherwise touch the stroke, right in its glow.
 */
export const getChatLayout = (props: LayoutProps): ChatLayout => withOrnaments(getPanelLayout(props), props);

/**
 * The ornaments hang on the finished panel: they keep clear of its text areas and never feed back
 * into them; only the outset grows by how far they reach into the bleed (seed- and frame-free).
 */
const withOrnaments = (base: Omit<ChatLayout, 'ornamentLayout'>, props: LayoutProps): ChatLayout => {
  const frame = panelOrnamentFrame({kind: 'chat', layout: base, keepOut: [base.content, base.header], glow: props.glow});
  const ornamentLayout = layoutOrnaments(frame, props);
  return {...base, outset: Math.max(base.outset, layoutOutset(ornamentLayout)), ornamentLayout};
};

const getPanelLayout = (props: LayoutProps): Omit<ChatLayout, 'ornamentLayout'> => {
  const hasHeader = props.headerHeight > 0;
  const line = hasHeader ? props.headerLineWidth : 0;
  const panel = layoutPanel({...props, insets: {top: hasHeader ? props.headerHeight + line : 0}});
  const {inner} = panel;
  const content = fitClearContent(inner, {
    top: props.padding + (hasHeader ? props.headerHeight + line : 0),
    right: props.padding,
    bottom: props.padding,
    left: props.padding,
  }, props.padding);
  if (!hasHeader) return {...panel, content, header: null, headerBand: null, divider: null};
  const band = {x: inner.x, y: inner.y, width: inner.width, height: props.headerHeight};
  const vertical = Math.min(props.padding, props.headerHeight / 4);
  const header = fitClearContent(inner, {
    top: vertical,
    bottom: inner.height - props.headerHeight + vertical,
    left: props.padding,
    right: props.padding,
  }, vertical);
  return {
    ...panel,
    content,
    header,
    headerBand: band,
    divider: line > 0 ? {x: inner.x, y: inner.y + props.headerHeight, width: inner.width, height: line} : null,
  };
};

/**
 * Refuses a chat panel that cannot hold its text: the header must leave room for the messages
 * and be tall enough for a title, each with a message naming the way out.
 */
const refineChatContent = (props: ChatLoopProps, layout: ChatLayout, context: z.RefinementCtx) => {
  if (!layout.header) {
    refineContent(layout, context);
    return;
  }
  if (layout.content.width < 1 || layout.content.height < 1) {
    context.addIssue({
      code: 'custom',
      path: ['headerHeight'],
      message: 'O cabeçalho não deixa espaço para as mensagens: diminua headerHeight, padding ou strokeWidth, ou aumente a caixa.',
    });
  }
  if (layout.header.width < 1 || layout.header.height < 1) {
    context.addIssue({
      code: 'custom',
      path: ['headerHeight'],
      message: `O cabeçalho de ${props.headerHeight} px não deixa espaço para o título: aumente headerHeight ou diminua padding.`,
    });
  }
};

/**
 * What the stroke layer's glow blurs: the stroke band and the divider, which is drawn inside that
 * layer (see Dividers) at DIVIDER_OPACITY. The divider's clip to the rounded inside is ignored:
 * a little more light, never less.
 */
export const chatGlowSources = (layout: ChatLayout): GlowSource[] => [
  {outer: layout.shape, inner: layout.inner},
  ...(layout.divider ? [{outer: {...layout.divider, radius: 0}, opacity: DIVIDER_OPACITY}] : []),
];

/**
 * The glow of the edge and of the divider must stay faint over the messages and over the title,
 * like the block's over its text (the SPEC's legibility rule); refused with the way out.
 */
const refineLegibility = (props: ChatLoopProps, layout: ChatLayout, context: z.RefinementCtx) => {
  if (!(props.glow > 0)) return;
  const sources = chatGlowSources(layout);
  const areas: [Rect | null, string, string][] = [
    [layout.content, 'das mensagens', layout.divider ? 'aumente padding, ou diminua glow ou headerLineWidth' : 'aumente padding ou diminua glow'],
    [layout.header, 'do título', layout.divider ? 'aumente headerHeight e padding, ou diminua glow ou headerLineWidth' : 'aumente headerHeight e padding, ou diminua glow'],
  ];
  for (const [area, name, fix] of areas) {
    if (!area || area.width < 1 || area.height < 1) continue;
    const washed = glowOverArea(sources, props.glow, area, props.glowStrength);
    if (washed <= MAX_CONTENT_OPACITY) continue;
    context.addIssue({
      code: 'custom',
      path: ['glow'],
      message: `O brilho chegaria a ${Math.round(washed * 100)}% de opacidade sobre a área ${name} (o limite é ${Math.round(MAX_CONTENT_OPACITY * 100)}%): ${fix}.`,
    });
  }
};

/**
 * Every refusal names its way out: a file beyond 4K, a glow or halo the bleed cannot hold, a
 * panel with no room for the messages or the title, a glow or a bright rim light over them, a
 * stroke or fill too fast for the frame rate.
 */
export const chatLoopSchema = chatFields.superRefine((props, context) => {
  refineCanvas(props, context);
  const layout = getChatLayout(props);
  refineOutset(props, layout.outset, context);
  refineChatContent(props, layout, context);
  refineLegibility(props, layout, context);
  refineRim(props.rimLight, layout.inner, [
    [layout.content, 'das mensagens', 'use padding de 1 px ou mais'],
    [layout.header, 'do título', 'use padding de 1 px ou mais'],
  ], context);
  refineStroke(props, layout.track, context, strokeOptions(props));
  refineFill(props, layout.box, context, fillOptions(layout));
  refineLightning(props, context);
  refineOrnaments(layout.ornamentLayout, props, context);
}, {when: (payload) => payload.issues.length === 0});

/** The tinted header band: a plain rect, clipped to the inside of the stroke by its layer. */
export type ChatHeaderElement = {
  type: 'chat-header'; x: number; y: number; width: number; height: number; color: string; opacity: number;
};

/**
 * The line between the header and the messages, from x1 to x2 at the height y (its centre),
 * wearing the stroke's colours spread across it. It never moves, so the header reads as fixed
 * furniture while the edge carries the motion.
 */
export type ChatDividerElement = {
  type: 'chat-divider'; x1: number; x2: number; y: number; width: number;
  color0: string; color1: string; color2: string; color3: string; colorCount: number; opacity: number;
};

export type ChatLayers = {
  halo: HaloElement[];
  /** Ornaments under the panel (see OrnamentLayer). */
  ornamentBack: OrnamentElement[];
  fill: FillElement[];
  header: ChatHeaderElement[];
  rim: RimElement[];
  stroke: (StrokeElement | GlowElement)[];
  divider: ChatDividerElement[];
  /** Ornaments over the stroke, then the lightning flash over everything. */
  ornamentFront: OrnamentElement[];
  flash: FlashElement[];
};

/** The speeds the panel actually shows (see AssetMotion), for the export log and the sidecar. */
export const getChatMotion = (props: ChatLoopProps): AssetMotion => {
  const layout = getChatLayout(props);
  return {
    strokeSpeed: reportSpeed(getStrokeMotion(props, layout.track, strokeOptions(props)).speed),
    fillSpeed: reportSpeed(getFillMotion(props, layout.box, fillOptions(layout)).speed),
  };
};

/** The scene by layer, bottom to top; getChatScene flattens it, the component draws each layer. */
export const getChatLayers = (props: ChatLoopProps, frame: number, durationInFrames: number): ChatLayers => {
  const layout = getChatLayout(props);
  const header: ChatHeaderElement[] = layout.headerBand && props.headerOpacity > 0
    ? [{type: 'chat-header', ...layout.headerBand, color: props.headerColor, opacity: props.headerOpacity}]
    : [];
  const colors = props.strokeColors;
  const divider: ChatDividerElement[] = layout.divider
    ? [{
      type: 'chat-divider',
      x1: layout.divider.x,
      x2: layout.divider.x + layout.divider.width,
      y: layout.divider.y + layout.divider.height / 2,
      width: layout.divider.height,
      color0: colors[0]!, color1: colors[1] ?? colors[0]!, color2: colors[2] ?? colors[0]!, color3: colors[3] ?? colors[0]!,
      colorCount: colors.length,
      opacity: DIVIDER_OPACITY,
    }]
    : [];
  const ornaments = buildOrnamentScene(layout.ornamentLayout, props, frame, durationInFrames);
  return {
    halo: buildHaloScene(props, frame, durationInFrames),
    ornamentBack: ornaments.back,
    fill: buildFillScene(props, layout.box, frame, durationInFrames, fillOptions(layout)),
    header,
    // Half a pixel inside the stroke, so the 1 px line sits right against its inner edge.
    rim: buildRimScene(props, offsetRoundRect(layout.inner, -0.5)),
    stroke: [
      ...buildStrokeScene(props, layout.track, frame, durationInFrames, strokeOptions(props)),
      ...buildGlowScene(props, frame, durationInFrames),
    ],
    divider,
    ornamentFront: ornaments.front,
    flash: buildFlashScene(props, frame, durationInFrames),
  };
};

/**
 * Every animated value of the panel, as a flat list of plain elements listed by place (see the
 * engine's builders): halo, back ornaments, fill, header band, rim light, stroke with its glow, divider,
 * front ornaments, lightning flash. Pure: the frame,
 * the props and the seed decide it all, and nothing here jumps at the seam, so the generic scans
 * need no exemption.
 */
export const getChatScene = (props: ChatLoopProps, frame: number, durationInFrames: number) => {
  const layers = getChatLayers(props, frame, durationInFrames);
  return [
    ...layers.halo, ...layers.ornamentBack, ...layers.fill, ...layers.header, ...layers.rim, ...layers.stroke, ...layers.divider,
    ...layers.ornamentFront, ...layers.flash,
  ];
};

/** Header band and divider are clipped to the inside of the stroke, so they follow its corners. */
const InnerClip = ({id, layout}: {id: string; layout: ChatLayout}) => (
  <clipPath id={id} clipPathUnits="userSpaceOnUse">
    <path d={roundRectPath(layout.inner)} />
  </clipPath>
);

const HeaderLayer = ({elements, layout}: {elements: readonly ChatHeaderElement[]; layout: ChatLayout}) => {
  const {idPrefix} = useStage();
  if (elements.length === 0) return null;
  const id = `${idPrefix}-header-clip`;
  return (
    <g>
      <defs><InnerClip id={id} layout={layout} /></defs>
      <g clipPath={`url(#${id})`}>
        {elements.map((element, index) => (
          <path key={index} d={rectPath(element)} fill={element.color} opacity={element.opacity} />
        ))}
      </g>
    </g>
  );
};

/** Drawn inside the StrokeLayer, so the divider glows with the edge. */
const Dividers = ({elements, layout}: {elements: readonly ChatDividerElement[]; layout: ChatLayout}) => {
  const {idPrefix} = useStage();
  if (elements.length === 0) return null;
  const clip = `${idPrefix}-divider-clip`;
  return (
    <g>
      <defs><InnerClip id={clip} layout={layout} /></defs>
      <g clipPath={`url(#${clip})`}>
        {elements.map((element, index) => {
          const id = `${idPrefix}-divider-${index}`;
          const colors = [element.color0, element.color1, element.color2, element.color3].slice(0, element.colorCount);
          return (
            <g key={index}>
              <defs>
                <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={element.x1} y1={element.y} x2={element.x2} y2={element.y}>
                  {colors.map((color, stop) => (
                    <stop key={stop} offset={colors.length === 1 ? 0 : stop / (colors.length - 1)} stopColor={color} />
                  ))}
                </linearGradient>
              </defs>
              <path d={rectPath({x: element.x1, y: element.y - element.width / 2, width: element.x2 - element.x1, height: element.width})}
                fill={`url(#${id})`} opacity={element.opacity} />
            </g>
          );
        })}
      </g>
    </g>
  );
};

/** One frame of the panel, sized by its layout; pure, so the tests can render it to markup. */
export const ChatFrame = ({props, frame, durationInFrames}: {props: ChatLoopProps; frame: number; durationInFrames: number}) => {
  const layout = getChatLayout(props);
  const layers = getChatLayers(props, frame, durationInFrames);
  return (
    <OverlayCanvas props={props} width={layout.canvas.width} height={layout.canvas.height} layout={layout}
      guides={props.guides} idPrefix="chat">
      <HaloLayer elements={layers.halo} shape={layout.shape} />
      <OrnamentLayer elements={layers.ornamentBack} layout={layout.ornamentLayout} style={props} layer="back" />
      <FillLayer elements={layers.fill} clip={layout.shape} />
      <HeaderLayer elements={layers.header} layout={layout} />
      <RimLayer elements={layers.rim} />
      <StrokeLayer elements={layers.stroke} tracks={[layout.track]} core={props.strokeCore}>
        <Dividers elements={layers.divider} layout={layout} />
      </StrokeLayer>
      <OrnamentLayer elements={layers.ornamentFront} layout={layout.ornamentLayout} style={props} layer="front" />
      <FlashLayer elements={layers.flash} clips={[{path: roundRectPath(layout.shape)}]} area={layout.shape} edge={layout.track}
        edgeWidth={layout.strokeWidth} peak={FLASH_PANEL_PEAK} />
      {props.guides && layout.header ? <HeaderGuide header={layout.header} /> : null}
    </OverlayCanvas>
  );
};

/** The title's area, in the guides' content green, dashed to tell it from the messages. */
const HeaderGuide = ({header}: {header: Rect}) => (
  <path d={rectPath(header)} fill="none" stroke="#A3E635" strokeWidth={2} strokeDasharray="4 4" opacity={0.9} data-guides="header" />
);

export const ChatLoop = (props: ChatLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return <ChatFrame props={props} frame={frame} durationInFrames={durationInFrames} />;
};

/** The catalog entry the integrator registers under assetCatalog. */
export const chatCatalogEntry = {
  id: 'ChatLoop',
  kind: 'chat',
  component: ChatLoop,
  schema: chatLoopSchema,
  defaultProps: chatLoopSchema.parse({}),
  getLayout: getChatLayout,
  getMotion: getChatMotion,
} as const;
