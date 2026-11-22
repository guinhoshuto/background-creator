import {zColor} from '@remotion/zod-types';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {getSize} from '../../sizes';
import {
  FillLayer, HaloLayer, MAX_CONTENT_OPACITY, MarginLayer, OverlayCanvas, RimLayer, StrokeLayer, buildFillScene, buildGlowScene, buildHaloScene,
  buildMarginScene, buildRimScene, buildStrokeScene, fillFields, fitClearContent, glowFields, glowOverArea, haloFields, layoutPanel, offsetRoundRect,
  overlayBaseFields, paddingField, radiusField, rimLightField, rectPath, refineCanvas, refineContent, refineFill, refineOutset, refineRim, refineStroke, reportSpeed, roundRectPath,
  strokeFields, strokeSidesField, trackOpacityField, useStage, getFillMotion, getStrokeMotion, type AssetMotion, type FillElement, type FillOptions, type GlowElement, type GlowSource, type HaloElement,
  type PanelLayout, type Rect, type RimElement, type RoundRect, type StrokeElement, type StrokeOptions,
  FLASH_PANEL_PEAK, FlashLayer, OrnamentLayer, buildFlashScene, buildOrnamentScene, layoutOrnaments, layoutOutset, ornamentFields, panelOrnamentFrame,
  refineLightning, refineOrnaments, refineStrokeMargin, strokeMarginFields, type FlashElement, type MarginElement, type OrnamentElement, type OrnamentLayout,
  TitleButtonLayer, buildTitleButtonScene, refineTitleButtons, titleButtonFields, titleButtonRow, titleButtonRowBox, type TitleButtonElement,
  SideLayer, buildSideScene, depthFields, refineSideFill, refineSideOutset, sideOutset, type SideElement,
} from '../shared';

/**
 * ChatLoop: the panel a chat widget (OBS, StreamElements, Streamlabs) draws its messages on.
 * The fill is the product here, so every default keeps it calm under text: dark or pale bases,
 * low-contrast patterns, and the motion on the edge. An optional header band on top holds the
 * title ("CHAT"), separated from the messages by a line; the layout reports its own text area.
 */

const baseFields = overlayBaseFields(getSize('chat-standard'));

const chatFields = z.object({
  ...baseFields,
  // The colour MP4 and GIF are flattened on: the neon night the default panel belongs to.
  backgroundColor: baseFields.backgroundColor.default('#0B0620'),
  radius: radiusField(16),
  padding: paddingField(16),
  // A deep indigo night, a touch lighter at the top, under a neon tube: its hot core, a bright
  // bloom (glowStrength) and a violet halo are what make it read as light on any backdrop.
  ...fillFields({
    fill: 'gradient',
    fillColors: ['#120A38', '#26105C', '#0A1C4E'],
    fillOpacity: 0.9,
    fillScale: 32,
    fillSpeed: 16,
    fillAngle: 60,
    fillLight: 0.05,
  }),
  ...strokeFields({
    strokeMotion: 'comets',
    strokeColors: ['#22D3EE', '#E879F9', '#A78BFA'],
    strokeWidth: 3,
    cometSpacing: 640,
    cometTail: 320,
    strokeSpeed: 160,
    strokeCore: 0.9,
  }),
  // The same prop as block and border, so a theme's outline reads as one family across its kinds.
  trackOpacity: trackOpacityField(0.45),
  strokeSides: strokeSidesField(),
  ...strokeMarginFields(),
  ...glowFields({glow: 20, glowPulses: 1, glowStrength: 3}),
  ...haloFields({halo: 24, haloColor: '#A855F7'}),
  ...depthFields(),
  rimLight: rimLightField(0),
  headerHeight: z.number().int().min(0).max(512)
    .describe('Height of the header at the top of the panel (where the title goes, e.g. "CHAT"), in px; 0 = no header')
    .default(48),
  headerColor: zColor().default('#E879F9'),
  headerOpacity: z.number().finite().min(0).max(1)
    .describe('Opacity of the header band, from 0 to 1; 0 leaves only the line')
    .default(0.1),
  headerLineWidth: z.number().finite().min(0).max(16)
    .describe('Thickness of the line between the header and the messages, in px, in the outline colors; 0 = no line')
    .default(2),
  headerLineOpacity: z.number().finite().min(0).max(1)
    .describe('Opacity of the line between the header and the messages, from 0 to 1')
    .default(0.9),
  ...titleButtonFields('the header'),
  footerHeight: z.number().int().min(0).max(512)
    .describe('Height of the footer at the bottom of the panel, below the messages, in px; 0 = no footer')
    .default(0),
  footerLineWidth: z.number().finite().min(0).max(16)
    .describe('Thickness of the line between the messages and the footer, in px, in footerLineColor; 0 = no line')
    .default(1),
  // Its own colour, not the outline's: a gradient outline spread across it would light one end.
  footerLineColor: zColor().default('#E879F9'),
  footerLineOpacity: z.number().finite().min(0).max(1)
    .describe('Opacity of the line above the footer, from 0 to 1')
    .default(0.9),
  ...ornamentFields(),
});

export type ChatLoopProps = z.infer<typeof chatFields>;

/** Chat panels have room for many sparkles; past this they read as noise behind the messages. */
const CHAT_MAX_SPARKS = 160;
/** The glass sheen passes over the messages: dimmer than the engine's default keeps them legible. */
const CHAT_SHEEN_OPACITY = 0.2;
/**
 * The line between header and messages as the glow's legibility check counts it: bright, but a
 * step below the edge itself (the default of headerLineOpacity, which is what the line is drawn at).
 */
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
  /** The footer's band at the bottom, inside the stroke, under the messages; null without a footer. */
  footer: Rect | null;
  /** The line above the footer (full width inside the stroke); null without a footer or a line. */
  footerDivider: Rect | null;
  /**
   * What the bands and lines are clipped to: the inside of the stroke, reaching the panel's own
   * sides when they are open (strokeSides 'top-bottom'), so the header runs edge to edge.
   */
  bandArea: RoundRect;
  /** The title buttons at the right end of the header, left to right; empty while they are off or without a header. */
  titleButtons: Rect[];
  /** Where the ornaments go (none with ornaments 'none'); their reach beyond the box is folded into outset. */
  ornamentLayout: OrnamentLayout;
};

type LayoutProps = Pick<ChatLoopProps,
  'width' | 'height' | 'bleed' | 'radius' | 'padding' | 'strokeWidth' | 'strokeSides' | 'strokeMargin' | 'glow' | 'halo' | 'depth' | 'headerHeight' | 'headerLineWidth'
  | 'footerHeight' | 'footerLineWidth' | 'titleButtonSize' | 'titleButtonGap' | 'titleButtonInset' | 'ornaments' | 'ornamentSize' | 'ornamentScale'>;

/**
 * The single source of truth for a chat panel's geometry, in canvas pixels. The header takes
 * the top `headerHeight` px inside the stroke and the line sits right under it, so the messages'
 * content starts one padding below the line; the footer, the mirror of it, takes the bottom
 * `footerHeight` px with its line right above, and the messages end one padding above that line. The title's area keeps the side padding and a
 * quarter of the band (at most one padding) above and below. Near round corners both keep that
 * space from the curve too (fitClearContent), as a block's text does: in a pill, a corner of the
 * messages would otherwise touch the stroke, right in its glow. The title buttons, when on, sit at
 * the right end of the header, centred on its height, and the title stops one button gap short of them.
 */
export const getChatLayout = (props: LayoutProps): ChatLayout => withOrnaments(getPanelLayout(props), props);

/**
 * The ornaments hang on the finished panel: they keep clear of its text areas and never feed back
 * into them; only the outset grows by how far they reach into the bleed (seed- and frame-free).
 * The row of title buttons is one more area they keep out of, only while it is on.
 */
const withOrnaments = (base: Omit<ChatLayout, 'ornamentLayout'>, props: LayoutProps): ChatLayout => {
  const frame = panelOrnamentFrame({
    kind: 'chat', layout: base, keepOut: [base.content, base.header, ...chatButtonKeepOut(base)], glow: props.glow,
    bands: {header: base.headerBand, footer: base.footer},
  });
  const ornamentLayout = layoutOrnaments(frame, props);
  return {...base, outset: Math.max(base.outset, layoutOutset(ornamentLayout)), ornamentLayout};
};

const chatButtonKeepOut = (base: Pick<ChatLayout, 'titleButtons'>): Rect[] =>
  (base.titleButtons.length > 0 ? [titleButtonRowBox(base.titleButtons)] : []);

const getPanelLayout = (props: LayoutProps): Omit<ChatLayout, 'ornamentLayout'> => {
  const hasHeader = props.headerHeight > 0;
  const line = hasHeader ? props.headerLineWidth : 0;
  const hasFooter = props.footerHeight > 0;
  const footerLine = hasFooter ? props.footerLineWidth : 0;
  const footerSpace = hasFooter ? props.footerHeight + footerLine : 0;
  const panel = layoutPanel({
    ...props, insets: {top: hasHeader ? props.headerHeight + line : 0, bottom: footerSpace},
    extraOutset: sideOutset(props.depth),
  });
  const {inner} = panel;
  // Open sides draw no stroke there: the bands and lines reach the panel's own sides.
  const bandArea = props.strokeSides === 'top-bottom' ? {...inner, x: panel.shape.x, width: panel.shape.width} : inner;
  const content = fitClearContent(inner, {
    top: props.padding + (hasHeader ? props.headerHeight + line : 0),
    right: props.padding,
    bottom: props.padding + footerSpace,
    left: props.padding,
  }, props.padding);
  const footer = hasFooter ? {x: bandArea.x, y: inner.y + inner.height - props.footerHeight, width: bandArea.width, height: props.footerHeight} : null;
  const footerDivider = footerLine > 0 ? {x: bandArea.x, y: inner.y + inner.height - footerSpace, width: bandArea.width, height: footerLine} : null;
  if (!hasHeader) return {...panel, content, header: null, headerBand: null, divider: null, footer, footerDivider, bandArea, titleButtons: []};
  const band = {x: bandArea.x, y: inner.y, width: bandArea.width, height: props.headerHeight};
  const vertical = Math.min(props.padding, props.headerHeight / 4);
  const titleButtons = props.titleButtonSize > 0
    ? titleButtonRow({
      right: bandArea.x + bandArea.width - props.titleButtonInset, cy: inner.y + props.headerHeight / 2,
      size: props.titleButtonSize, gap: props.titleButtonGap,
    })
    : [];
  // Without buttons the title keeps the side padding; with them it ends one button gap before the row.
  const titleRight = titleButtons.length > 0
    ? Math.max(props.padding, inner.x + inner.width - titleButtonRowBox(titleButtons).x + props.titleButtonGap)
    : props.padding;
  const header = fitClearContent(inner, {
    top: vertical,
    bottom: inner.height - props.headerHeight + vertical,
    left: props.padding,
    right: titleRight,
  }, vertical);
  return {
    ...panel,
    content,
    header,
    headerBand: band,
    divider: line > 0 ? {x: bandArea.x, y: inner.y + props.headerHeight, width: bandArea.width, height: line} : null,
    footer,
    footerDivider,
    bandArea,
    titleButtons,
  };
};

/**
 * Refuses a chat panel that cannot hold its text: the header must leave room for the messages
 * and be tall enough for a title, each with a message naming the way out.
 */
const refineChatContent = (props: ChatLoopProps, layout: ChatLayout, context: z.RefinementCtx) => {
  if (layout.footer && (layout.content.width < 1 || layout.content.height < 1)) {
    context.addIssue({
      code: 'custom',
      path: ['footerHeight'],
      message: 'The footer leaves no room for the messages: reduce footerHeight, headerHeight, padding or strokeWidth, or enlarge the box.',
    });
    return;
  }
  if (!layout.header) {
    refineContent(layout, context);
    return;
  }
  if (layout.content.width < 1 || layout.content.height < 1) {
    context.addIssue({
      code: 'custom',
      path: ['headerHeight'],
      message: 'The header leaves no room for the messages: reduce headerHeight, padding or strokeWidth, or enlarge the box.',
    });
  }
  if (layout.header.width < 1 || layout.header.height < 1) {
    // Tall enough but with no width left: it is the row of buttons that took the title's place.
    const beside = layout.titleButtons.length > 0 && layout.header.height >= 1;
    context.addIssue({
      code: 'custom',
      path: ['headerHeight'],
      message: beside
        ? `A header of ${props.headerHeight} px leaves no room for the title beside the buttons: reduce titleButtonSize or padding, or enlarge the box.`
        : `A header of ${props.headerHeight} px leaves no room for the title: increase headerHeight or reduce padding.`,
    });
  }
};

/**
 * The title buttons live on the header: refused without one, taller than it, or leaving the inside
 * of the outline (bandArea: the panel's own sides when they are open), each with the way out.
 */
const refineChatTitleButtons = (props: ChatLoopProps, layout: ChatLayout, context: z.RefinementCtx) => {
  if (!(props.titleButtonSize > 0)) return;
  if (!layout.headerBand) {
    context.addIssue({
      code: 'custom',
      path: ['titleButtonSize'],
      message: `The title buttons need a header: use headerHeight ≥ ${props.titleButtonSize}, or titleButtonSize 0.`,
    });
    return;
  }
  refineTitleButtons({
    size: props.titleButtonSize, bar: props.headerHeight, barName: 'headerHeight', row: layout.titleButtons, inside: layout.bandArea,
  }, context);
};

/**
 * What the stroke layer's glow blurs: the stroke band and the divider, which is drawn inside that
 * layer (see Dividers) at headerLineOpacity. The divider's clip to the rounded inside is ignored:
 * a little more light, never less.
 */
export const chatGlowSources = (
  layout: ChatLayout, footerLineOpacity = DIVIDER_OPACITY, headerLineOpacity = DIVIDER_OPACITY,
): GlowSource[] => [
  {outer: layout.shape, inner: layout.inner},
  ...(layout.divider ? [{outer: {...layout.divider, radius: 0}, opacity: headerLineOpacity}] : []),
  ...(layout.footerDivider ? [{outer: {...layout.footerDivider, radius: 0}, opacity: footerLineOpacity}] : []),
];

/**
 * The glow of the edge and of the divider must stay faint over the messages and over the title,
 * like the block's over its text (the SPEC's legibility rule); refused with the way out.
 */
const refineLegibility = (props: ChatLoopProps, layout: ChatLayout, context: z.RefinementCtx) => {
  if (!(props.glow > 0)) return;
  const sources = chatGlowSources(layout, props.footerLineOpacity, props.headerLineOpacity);
  const areas: [Rect | null, string, string][] = [
    [layout.content, 'messages', layout.divider ? 'increase padding, or reduce glow or headerLineWidth' : 'increase padding or reduce glow'],
    [layout.header, 'title', layout.divider ? 'increase headerHeight and padding, or reduce glow or headerLineWidth' : 'increase headerHeight and padding, or reduce glow'],
  ];
  for (const [area, name, fix] of areas) {
    if (!area || area.width < 1 || area.height < 1) continue;
    const washed = glowOverArea(sources, props.glow, area, props.glowStrength);
    if (washed <= MAX_CONTENT_OPACITY) continue;
    context.addIssue({
      code: 'custom',
      path: ['glow'],
      message: `The glow would reach ${Math.round(washed * 100)}% opacity over the ${name} area (the limit is ${Math.round(MAX_CONTENT_OPACITY * 100)}%): ${fix}.`,
    });
  }
};

/**
 * Every refusal names its way out: a file beyond 4K, a glow, a halo or a side the bleed cannot hold,
 * a side under a translucent fill, a
 * panel with no room for the messages or the title, a glow or a bright rim light over them, a
 * stroke or fill too fast for the frame rate.
 */
export const chatLoopSchema = chatFields.superRefine((props, context) => {
  refineCanvas(props, context);
  refineSideFill(props, context);
  refineStrokeMargin(props, context);
  const layout = getChatLayout(props);
  // A side past the bleed is told as the side: the shared message speaks of the glow.
  if (refineSideOutset(props, context)) refineOutset(props, layout.outset, context);
  refineChatTitleButtons(props, layout, context);
  refineChatContent(props, layout, context);
  refineLegibility(props, layout, context);
  refineRim(props.rimLight, layout.inner, [
    [layout.content, 'messages', 'use a padding of 1 px or more'],
    [layout.header, 'title', 'use a padding of 1 px or more'],
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
 * A line across the panel, from x1 to x2 at the height y (its centre): the one between the header
 * and the messages wears the stroke's colours spread across it, the one above the footer its own
 * (footerLineColor). They never move, so header and footer read as fixed furniture while the edge
 * carries the motion.
 */
export type ChatDividerElement = {
  type: 'chat-divider'; x1: number; x2: number; y: number; width: number;
  color0: string; color1: string; color2: string; color3: string; colorCount: number; opacity: number;
};

export type ChatLayers = {
  halo: HaloElement[];
  /** The side of a panel with depth, whole behind it; empty while it is flat. */
  side: SideElement[];
  /** Ornaments under the panel (see OrnamentLayer). */
  ornamentBack: OrnamentElement[];
  fill: FillElement[];
  header: ChatHeaderElement[];
  /** The title buttons on the header; empty while they are off. */
  titleButtons: TitleButtonElement[];
  /** The flat band outside the outline (strokeMargin); empty while it is off. */
  margin: MarginElement[];
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
  const line = (rect: Rect, opacity: number, colors: readonly string[]): ChatDividerElement => ({
    type: 'chat-divider',
    x1: rect.x,
    x2: rect.x + rect.width,
    y: rect.y + rect.height / 2,
    width: rect.height,
    color0: colors[0]!, color1: colors[1] ?? colors[0]!, color2: colors[2] ?? colors[0]!, color3: colors[3] ?? colors[0]!,
    colorCount: colors.length,
    opacity,
  });
  const divider: ChatDividerElement[] = [
    ...(layout.divider ? [line(layout.divider, props.headerLineOpacity, props.strokeColors)] : []),
    ...(layout.footerDivider && props.footerLineOpacity > 0 ? [line(layout.footerDivider, props.footerLineOpacity, [props.footerLineColor])] : []),
  ];
  const ornaments = buildOrnamentScene(layout.ornamentLayout, props, frame, durationInFrames);
  return {
    halo: buildHaloScene(props, frame, durationInFrames),
    side: buildSideScene(props),
    ornamentBack: ornaments.back,
    fill: buildFillScene(props, layout.box, frame, durationInFrames, fillOptions(layout)),
    header,
    titleButtons: buildTitleButtonScene(layout.titleButtons, props),
    margin: buildMarginScene(props),
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
 * engine's builders): halo, side, back ornaments, fill, header band, title buttons, margin band, rim light, stroke with its glow, divider,
 * front ornaments, lightning flash. Pure: the frame,
 * the props and the seed decide it all, and nothing here jumps at the seam, so the generic scans
 * need no exemption.
 */
export const getChatScene = (props: ChatLoopProps, frame: number, durationInFrames: number) => {
  const layers = getChatLayers(props, frame, durationInFrames);
  return [
    ...layers.halo, ...layers.side, ...layers.ornamentBack, ...layers.fill, ...layers.header, ...layers.titleButtons, ...layers.margin, ...layers.rim, ...layers.stroke, ...layers.divider,
    ...layers.ornamentFront, ...layers.flash,
  ];
};

/** Header band and divider are clipped to the inside of the stroke (bandArea), so they follow its corners. */
const InnerClip = ({id, layout}: {id: string; layout: ChatLayout}) => (
  <clipPath id={id} clipPathUnits="userSpaceOnUse">
    <path d={roundRectPath(layout.bandArea)} />
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
      <SideLayer elements={layers.side} outline={layout.shape} />
      <OrnamentLayer elements={layers.ornamentBack} layout={layout.ornamentLayout} style={props} layer="back" />
      <FillLayer elements={layers.fill} clip={layout.shape} />
      <HeaderLayer elements={layers.header} layout={layout} />
      <TitleButtonLayer buttons={layers.titleButtons} clip={roundRectPath(layout.bandArea)} />
      <MarginLayer elements={layers.margin} layout={layout} />
      <RimLayer elements={layers.rim} />
      <StrokeLayer elements={layers.stroke} tracks={[layout.track]} core={props.strokeCore} sides={props.strokeSides}>
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
