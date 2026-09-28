import {zColor} from '@remotion/zod-types';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {kindPolicies} from '../../kinds';
import {createSeededRandom, randomBetween, TAU} from '../../loop';
import {getSize} from '../../sizes';
import {refineCanvas, type Rect} from '../shared/box';
import type {ArcElement, FillElement, GlowElement, HaloElement, RectElement, RimElement, SheenElement, StrokeElement} from '../shared/elements';
import {
  fillFields, glowFields, haloFields, overlayBaseFields, radiusField, rimLightField, strokeFields, trackOpacityField,
} from '../shared/fields';
import {buildFillScene, getFillMotion, refineFill, type FillOptions} from '../shared/fills';
import {layoutPanel, refineContent, refineOutset, type PanelLayout} from '../shared/layout';
import {cycleOf, placeTravel, reportSpeed, type AssetMotion} from '../shared/motion';
import {arcBandPath, offsetRoundRect, roundRectPath} from '../shared/geometry';
import {refineRim} from '../shared/legibility';
import {FillLayer, HaloLayer, OverlayCanvas, RimLayer, StrokeLayer, type ClipShape} from '../shared/render';
import {buildGlowScene, buildHaloScene, buildRimScene, buildStrokeScene, getStrokeMotion, refineStroke} from '../shared/strokes';
import {fitCircleContent, fitClearContent} from '../shared/content';
import {refineShape, shapeField} from '../shared/shape';
import {
  FLASH_PANEL_PEAK, FlashLayer, OrnamentLayer, buildFlashScene, buildOrnamentScene, layoutOrnaments, layoutOutset, ornamentFields, panelOrnamentFrame,
  refineLightning, refineOrnaments, type FlashElement, type OrnamentElement, type OrnamentLayout,
} from '../shared/ornaments';
import {MAX_CONTENT_OPACITY} from '../shared/legibility';
import {contentGlowOpacity} from './legibility';

export const BLOCO_ACCENTS = ['nenhum', 'esquerda', 'topo'] as const;

/** The kind's default named size ('cartao', 640×360 with a 32 px bleed): the schema's defaults. */
const DEFAULT_SIZE = getSize(kindPolicies.block.defaultSizeId!);

/** Peak opacity of the glint that runs along the accent bar. */
const ACCENT_SHEEN_OPACITY = 0.55;

/**
 * On a circle the accent is an arc along the inside of the stroke, this many radians to each side
 * of the left or the top: 120° in all, a third of the rim, so it reads as a deliberate stripe of
 * colour at every size, never as a ring nor as a notch.
 */
export const ACCENT_ARC_SPREAD = Math.PI / 3;

/** The round sizes, for the refusal of a circle in a box that is not square. */
const ROUND_SIZES = 'circulo-p, circulo or circulo-g';

/**
 * The glass sheen crosses the text: as discreet as the chat's over its messages, so a theme's
 * blocks and chat panels shine alike.
 */
const BLOCO_SHEEN_OPACITY = 0.2;

const fillOptions = (layout: PanelLayout): FillOptions => ({corner: layout.shape.radius, sheenOpacity: BLOCO_SHEEN_OPACITY});

/**
 * The defaults are the neon look at the card size: a deep indigo panel swaying slowly, comets
 * 640 px apart (three round the card) in cyan and magenta running round a cyan tube with a hot
 * white core, a strong glow breathing twice per cycle and a violet halo.
 * Every length is in fixed px, so a 320×64 label and a 1200×240 title read as one family.
 */
const blocoFields = z.object({
  ...overlayBaseFields(DEFAULT_SIZE),
  shape: shapeField('Block shape: retangulo (corners with radius) or circulo (the box must be square: use --size circulo-p, circulo or circulo-g); in the circle the text goes in the square centered inside it'),
  radius: radiusField(16, 'Corner radius, in px; capped at half the shorter side (becomes a pill); with shape circulo it is ignored, the radius is half the side'),
  paddingX: z.number().finite().min(0).max(512)
    .describe('Horizontal space between the outline (or the accent bar) and the content, in px; in the circle the larger of paddingX and paddingY applies all the way around')
    .default(24),
  paddingY: z.number().finite().min(0).max(512)
    .describe('Vertical space between the outline (or the accent bar) and the content, in px; in the circle the larger of paddingX and paddingY applies all the way around')
    .default(16),
  ...fillFields({
    fill: 'gradiente', fillColors: ['#120A38', '#26105C', '#0A1C4E'], fillOpacity: 0.9, fillAngle: 60, fillLight: 0.05,
  }),
  ...strokeFields({
    strokeMotion: 'cometas', strokeColors: ['#22D3EE', '#E879F9'], strokeWidth: 4, strokeWidthMin: 0,
    cometSpacing: 640, cometTail: 320, strokeSpeed: 160, strokeCore: 0.9,
  }),
  trackOpacity: trackOpacityField(0.45),
  ...glowFields({glow: 20, glowPulses: 2, glowStrength: 3}),
  ...haloFields({halo: 20, haloColor: '#A855F7'}),
  rimLight: rimLightField(0),
  accent: z.enum(BLOCO_ACCENTS)
    .describe('Accent bar inside the outline: nenhum, esquerda or topo; the content starts after it. In the circle it is a 120° arc against the outline, centered on the left or the top')
    .default('nenhum'),
  accentColor: zColor().default('#E879F9'),
  accentSize: z.number().finite().min(2).max(64)
    .describe('Thickness of the accent bar, in px')
    .default(6),
  accentSheen: z.number().int().min(0).max(4)
    .describe('How many times a glint runs along the accent bar per cycle; 0 turns it off')
    .default(0),
  ...ornamentFields(),
});

export type BlocoLoopProps = z.infer<typeof blocoFields>;

type LayoutProps = Pick<BlocoLoopProps,
  'width' | 'height' | 'bleed' | 'shape' | 'radius' | 'strokeWidth' | 'paddingX' | 'paddingY' | 'glow' | 'halo' | 'accent' | 'accentSize'
  | 'ornaments' | 'ornamentSize' | 'ornamentScale'>;

/**
 * The accent of a round block: a band `width` px thick along the inside of the stroke (its outer
 * edge is the inside of the stroke, radius `outer` around (cx, cy)), `spread` radians to each side
 * of the unit direction (nx, ny), which points left or up.
 */
export type AccentArc = {cx: number; cy: number; outer: number; width: number; nx: number; ny: number; spread: number};

/**
 * A panel layout plus the accent: a bar (`accent`) on a rectangle, an arc (`accentArc`) on a
 * circle; the other one is null.
 */
export type BlocoLayout = PanelLayout & {
  accent: Rect | null;
  accentArc: AccentArc | null;
  /** Where the ornaments go (none with ornaments 'nenhum'); their reach beyond the box is folded into outset. */
  ornamentLayout: OrnamentLayout;
};

/**
 * The single source of truth for a block's geometry, in canvas pixels. The stroke is inside the
 * box edge; the accent bar lines the inside of the stroke on its side, and the content starts
 * after it (padding counts from the bar), so the bar never runs under the text. Near round
 * corners the content keeps the smaller padding from the curve too (see fitClearContent).
 *
 * A circle ('circulo', or a square with a radius of half its side) has no sides to pad: its text
 * area is the centred square whose corners keep the accent's thickness plus the larger padding
 * from the inside of the stroke, all the way round (see fitCircleContent). The accent is then an
 * arc of that thickness along the inside of the stroke, centred on the left or the top, so it
 * stays out of the square wherever it sits. The glow and the halo reach into the bleed.
 */
export const getBlocoLayout = (props: LayoutProps): BlocoLayout => withOrnaments(getPanelLayout(props), props);

/**
 * The ornaments hang on the finished block: they keep clear of its text and never feed back into
 * it; only the outset grows by how far they reach into the bleed (seed- and frame-free). A round
 * block tells them its accent side, whose arc covers two of the corner slots.
 */
const withOrnaments = (base: Omit<BlocoLayout, 'ornamentLayout'>, props: LayoutProps): BlocoLayout => {
  const accent = props.accent === 'nenhum' ? null : props.accent;
  const frame = panelOrnamentFrame({kind: 'block', layout: base, keepOut: [base.content], accent, glow: props.glow});
  const ornamentLayout = layoutOrnaments(frame, props);
  return {...base, outset: Math.max(base.outset, layoutOutset(ornamentLayout)), ornamentLayout};
};

const getPanelLayout = (props: LayoutProps): Omit<BlocoLayout, 'ornamentLayout'> => {
  const size = props.accent === 'nenhum' ? 0 : props.accentSize;
  const panel = layoutPanel({
    width: props.width,
    height: props.height,
    bleed: props.bleed,
    radius: props.radius,
    shape: props.shape,
    strokeWidth: props.strokeWidth,
    padding: {x: props.paddingX, y: props.paddingY},
    glow: props.glow,
    halo: props.halo,
  });
  const {inner} = panel;
  if (panel.circle) {
    const outer = inner.width / 2;
    const content = fitCircleContent(inner, size + Math.max(props.paddingX, props.paddingY));
    const accentArc = props.accent === 'nenhum' ? null : {
      cx: inner.x + outer, cy: inner.y + outer, outer, width: Math.min(size, outer),
      nx: props.accent === 'esquerda' ? -1 : 0, ny: props.accent === 'topo' ? -1 : 0, spread: ACCENT_ARC_SPREAD,
    };
    return {...panel, content, accent: null, accentArc};
  }
  const content = fitClearContent(inner, {
    top: props.paddingY + (props.accent === 'topo' ? size : 0),
    right: props.paddingX,
    bottom: props.paddingY,
    left: props.paddingX + (props.accent === 'esquerda' ? size : 0),
  }, Math.min(props.paddingX, props.paddingY));
  const accent = props.accent === 'esquerda'
    ? {x: inner.x, y: inner.y, width: Math.min(size, inner.width), height: inner.height}
    : props.accent === 'topo'
      ? {x: inner.x, y: inner.y, width: inner.width, height: Math.min(size, inner.height)}
      : null;
  return {...panel, content, accent, accentArc: null};
};

/**
 * Refuses what the eye or the file could not take, always with the way out: a file beyond 4K, a
 * circle in a box that is not square, a glow or halo the bleed cannot hold (with bleed 0, as on
 * Twitch panels, both must be 0), no room left for the content, a motion that would alias, and a
 * glow or a bright rim light over the text.
 */
export const blocoLoopSchema = blocoFields.superRefine((props, context) => {
  refineCanvas(props, context);
  if (!refineShape(props, ROUND_SIZES, context)) return;
  const layout = getBlocoLayout(props);
  refineOutset(props, layout.outset, context);
  refineContent(layout, context);
  refineRim(props.rimLight, layout.inner, [[layout.content, 'text', 'use paddingX and paddingY of 1 px or more']], context);
  refineStroke(props, layout.track, context);
  refineFill(props, layout.box, context);
  const washed = contentGlowOpacity({...layout, glow: props.glow, glowStrength: props.glowStrength});
  if (layout.content.width >= 1 && layout.content.height >= 1 && washed > MAX_CONTENT_OPACITY) {
    context.addIssue({
      code: 'custom',
      path: ['glow'],
      message: `The stroke's glow would reach ${Math.round(washed * 100)}% opacity over the text area (the limit is ${Math.round(MAX_CONTENT_OPACITY * 100)}%): increase paddingX and paddingY or reduce glow.`,
    });
  }
  refineLightning(props, context);
  refineOrnaments(layout.ornamentLayout, props, context);
}, {when: (payload) => payload.issues.length === 0});

/** The layers of one frame, bottom to top; getBlocoScene is their flat concatenation. */
export type BlocoLayers = {
  halo: HaloElement[];
  /** Ornaments under the panel (see OrnamentLayer). */
  ornamentBack: OrnamentElement[];
  fill: FillElement[];
  accent: (RectElement | ArcElement | SheenElement)[];
  rim: RimElement[];
  stroke: StrokeElement[];
  glow: GlowElement[];
  /** Ornaments over the stroke, then the lightning flash over everything. */
  ornamentFront: OrnamentElement[];
  flash: FlashElement[];
};

/**
 * The accent bar, and the glint that runs along it `accentSheen` whole times per cycle. The
 * glint crosses the bar in half its period and waits beyond the end for the other half, so its
 * place wraps while it is wholly outside the bar (clipped away); the seeded shift keeps that
 * instant off the seam. Across, it is exactly as wide as the bar, so it never reaches the text.
 */
const buildAccentScene = (
  props: BlocoLoopProps, layout: BlocoLayout, frame: number, durationInFrames: number,
): (RectElement | ArcElement | SheenElement)[] => {
  if (layout.accentArc) return buildAccentArcScene(props, layout.accentArc, frame, durationInFrames);
  const bar = layout.accent;
  if (!bar || bar.width <= 0 || bar.height <= 0) return [];
  const rect: RectElement = {
    type: 'rect', x: bar.x, y: bar.y, width: bar.width, height: bar.height, corner: 0, color: props.accentColor, opacity: 1,
  };
  if (!(props.accentSheen > 0)) return [rect];
  const vertical = props.accent === 'esquerda';
  const u = vertical ? {x: 0, y: 1} : {x: 1, y: 0};
  const length = vertical ? bar.height : bar.width;
  const width = accentGlintWidth(length);
  const period = 2 * (length + 2 * width);
  const random = createSeededRandom(props.seed + 401);
  const {offset} = placeTravel(randomBetween(random, 0.2, 0.8), props.accentSheen, cycleOf(frame, durationInFrames));
  const along = -length / 2 - width + offset * period;
  const sheen: SheenElement = {
    type: 'sheen',
    cx: bar.x + bar.width / 2 + u.x * along,
    cy: bar.y + bar.height / 2 + u.y * along,
    nx: u.x,
    ny: u.y,
    width,
    length: vertical ? bar.width : bar.height,
    color: '#FFFFFF',
    opacity: ACCENT_SHEEN_OPACITY,
  };
  return [rect, sheen];
};

/** The glint's width along the accent: a quarter of it, between 24 and 96 px. */
const accentGlintWidth = (length: number) => Math.min(96, Math.max(24, 0.25 * length));

/**
 * The accent arc of a round block, and its glint. The glint goes round the whole circle along the
 * middle of the band, `accentSheen` whole turns per cycle, always tangent to it, and the layer
 * clips it to the arc: it lights the arc while it crosses it and is hidden for the rest of the
 * turn. A whole turn brings it back to the same place, so nothing ever wraps or jumps; the seeded
 * start keeps its crossing off the seam. Across, it is exactly the band's thickness.
 */
const buildAccentArcScene = (
  props: BlocoLoopProps, arc: AccentArc, frame: number, durationInFrames: number,
): (ArcElement | SheenElement)[] => {
  if (!(arc.width > 0) || !(arc.outer > 0)) return [];
  const band: ArcElement = {type: 'arc', ...arc, color: props.accentColor, opacity: 1};
  if (!(props.accentSheen > 0)) return [band];
  const middle = arc.outer - arc.width / 2;
  const width = accentGlintWidth(2 * arc.spread * middle);
  const random = createSeededRandom(props.seed + 401);
  const {offset} = placeTravel(randomBetween(random, 0.2, 0.8), props.accentSheen, cycleOf(frame, durationInFrames));
  // Offset 0 puts the glint just before the arc's start (wholly outside it), like the bar's.
  const before = Math.atan2(width / 2, Math.max(arc.outer - arc.width, 1e-6));
  const angle = Math.atan2(arc.ny, arc.nx) - arc.spread - before + offset * TAU;
  const sheen: SheenElement = {
    type: 'sheen',
    cx: arc.cx + middle * Math.cos(angle),
    cy: arc.cy + middle * Math.sin(angle),
    nx: -Math.sin(angle),
    ny: Math.cos(angle),
    width,
    length: arc.width,
    color: '#FFFFFF',
    opacity: ACCENT_SHEEN_OPACITY,
  };
  return [band, sheen];
};

/** The speeds the block actually shows (see AssetMotion), for the export log and the sidecar. */
export const getBlocoMotion = (props: BlocoLoopProps): AssetMotion => {
  const layout = getBlocoLayout(props);
  return {
    strokeSpeed: reportSpeed(getStrokeMotion(props, layout.track).speed),
    fillSpeed: reportSpeed(getFillMotion(props, layout.box, fillOptions(layout)).speed),
  };
};

/** Every element of one frame, by layer. Pure: the frame, the props and the seed decide it all. */
export const getBlocoLayers = (props: BlocoLoopProps, frame: number, durationInFrames: number): BlocoLayers => {
  const layout = getBlocoLayout(props);
  const ornaments = buildOrnamentScene(layout.ornamentLayout, props, frame, durationInFrames);
  return {
    halo: buildHaloScene(props, frame, durationInFrames),
    ornamentBack: ornaments.back,
    fill: buildFillScene(props, layout.box, frame, durationInFrames, fillOptions(layout)),
    accent: buildAccentScene(props, layout, frame, durationInFrames),
    // Half a pixel inside the stroke, so the 1 px line sits right against its inner edge.
    rim: buildRimScene(props, offsetRoundRect(layout.inner, -0.5)),
    stroke: buildStrokeScene(props, layout.track, frame, durationInFrames, {trackOpacity: props.trackOpacity}),
    glow: buildGlowScene(props, frame, durationInFrames),
    ornamentFront: ornaments.front,
    flash: buildFlashScene(props, frame, durationInFrames),
  };
};

/**
 * The flat scene the shared scans read: every element listed by place, with numbers for all
 * that moves. Nothing in it jumps at the seam, so the kind needs no seamExempt.
 */
export const getBlocoScene = (props: BlocoLoopProps, frame: number, durationInFrames: number) => {
  const {halo, ornamentBack, fill, accent, rim, stroke, glow, ornamentFront, flash} = getBlocoLayers(props, frame, durationInFrames);
  return [...halo, ...ornamentBack, ...fill, ...accent, ...rim, ...stroke, ...glow, ...ornamentFront, ...flash];
};

/** The accent's clip: the inside of the stroke for a bar (it follows the round corners), the arc itself on a circle. */
const accentClip = (layout: BlocoLayout): ClipShape =>
  (layout.accentArc ? {path: arcBandPath(layout.accentArc)} : layout.inner);

/**
 * One frame, without Remotion hooks, so tests can render it. Layers, bottom to top: halo (kept
 * outside the panel), back ornaments (hidden by the panel), fill (clipped to the panel), accent
 * (see accentClip), rim light, stroke with its glow, front ornaments, lightning flash, then the
 * Studio guides.
 */
export const BlocoFrame = ({props, frame, durationInFrames}: {
  props: BlocoLoopProps; frame: number; durationInFrames: number;
}) => {
  const layout = getBlocoLayout(props);
  const layers = getBlocoLayers(props, frame, durationInFrames);
  return (
    <OverlayCanvas props={props} width={layout.canvas.width} height={layout.canvas.height} layout={layout}
      guides={props.guides} idPrefix="block">
      <HaloLayer elements={layers.halo} shape={layout.shape} />
      <OrnamentLayer elements={layers.ornamentBack} layout={layout.ornamentLayout} style={props} layer="back" />
      <FillLayer elements={layers.fill} clip={layout.shape} />
      {layers.accent.length > 0 ? <FillLayer elements={layers.accent} clip={accentClip(layout)} name="accent" /> : null}
      <RimLayer elements={layers.rim} />
      <StrokeLayer elements={[...layers.stroke, ...layers.glow]} tracks={[layout.track]} core={props.strokeCore} />
      <OrnamentLayer elements={layers.ornamentFront} layout={layout.ornamentLayout} style={props} layer="front" />
      <FlashLayer elements={layers.flash} clips={[{path: roundRectPath(layout.shape)}]} area={layout.shape} edge={layout.track}
        edgeWidth={layout.strokeWidth} peak={FLASH_PANEL_PEAK} />
    </OverlayCanvas>
  );
};

export const BlockLoop = (props: BlocoLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return <BlocoFrame props={props} frame={frame} durationInFrames={durationInFrames} />;
};

/** Ready for src/catalog.tsx: `BlockLoop: blocoCatalogEntry`. */
export const blocoCatalogEntry = {
  id: 'BlockLoop',
  kind: 'block',
  component: BlockLoop,
  schema: blocoLoopSchema,
  defaultProps: blocoLoopSchema.parse({}),
  getLayout: getBlocoLayout,
  getMotion: getBlocoMotion,
} as const;
