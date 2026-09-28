import {createContext, useContext, type ReactNode} from 'react';
import {interpolateColors, useVideoConfig} from 'remotion';
import {Canvas} from '../../backgrounds/Canvas';
import type {BaseBackgroundProps} from '../../settings';
import type {AssetLayout} from './box';
import {DAMASK} from '../../backgrounds/halloween/HauntedInteriorArtwork';
import type {
  BandElement, CometElement, DamaskElement, FogElement, GlowElement, HaloElement, OverlayElement, RimElement, SheenElement,
  StrokeElement, FillElement,
} from './elements';
import {FOG_SHAPE} from './fills';
import {arcBandPath, rectPath, roundRectPath, svgNumber, type RoundRect} from './geometry';
import type {FrameLayout} from './layout';
import {perimeterPath, pointAt} from './perimeter';

/**
 * SVG rendering of the engine's scenes. Everything is drawn in canvas pixels on one SVG the size
 * of the file (never a stretched viewBox), inside the same Canvas as the backgrounds, so the
 * alpha rule and backgroundColor behave identically. No mix-blend-mode anywhere: over
 * transparency it turns into grey haze. Glows are straight-alpha blurs of the stroke colours.
 *
 * Layering, bottom to top (a kind composes these itself):
 *   1. HaloLayer (outer halo, kept outside the panel)
 *   2. FillLayer (clipped to the panel)
 *   3. kind decorations under the stroke (accent bar, chat header…)
 *   4. StrokeLayer: its glow, then the sharp stroke (children render inside both)
 *   5. kind decorations over the stroke (corner brackets, jewels…)
 *   — for a border, 1–5 sit inside a FrameGroup, which keeps the window empty
 *   6. Guides (Studio only; the exporter refuses them)
 */

type StageInfo = {width: number; height: number; idPrefix: string};

const StageContext = createContext<StageInfo>({width: 0, height: 0, idPrefix: 'ov'});

/** The canvas size and id prefix of the enclosing OverlaySvg, for filters, masks and clips. */
export const useStage = () => useContext(StageContext);

/** Glow alpha gain, and the alpha below which the tail is cut (≈ 2/255: no quantised fringes). */
export const GLOW_GAIN = 1.8;
export const GLOW_CUT = 2 / 255;

/** The canvas-size SVG every layer draws into; pure (no Remotion hooks), so tests can render it. */
export const OverlaySvg = ({width, height, idPrefix = 'ov', children}: {
  width: number; height: number; idPrefix?: string; children: ReactNode;
}) => (
  <StageContext.Provider value={{width, height, idPrefix}}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{display: 'block'}}>
      {children}
    </svg>
  </StageContext.Provider>
);

type CanvasProps = Pick<BaseBackgroundProps, 'transparent' | 'outputFormat' | 'backgroundColor'>;

/**
 * The whole picture for one frame, sized by the layout: Canvas (alpha rule, backgroundColor)
 * around the overlay SVG, with the guides on top when asked. A kind's `*Frame` component renders
 * this, so the tests can render it with `renderToStaticMarkup`.
 */
export const OverlayCanvas = ({props, width, height, layout, guides = false, idPrefix, children}: {
  props: CanvasProps; width: number; height: number; layout?: AssetLayout | FrameLayout; guides?: boolean;
  idPrefix?: string; children: ReactNode;
}) => (
  <Canvas {...props}>
    <OverlaySvg width={width} height={height} idPrefix={idPrefix}>
      {children}
      {guides && layout ? <Guides layout={layout} /> : null}
    </OverlaySvg>
  </Canvas>
);

/** OverlayCanvas sized by the composition itself (useVideoConfig), for the Remotion component. */
export const OverlayStage = (props: Omit<Parameters<typeof OverlayCanvas>[0], 'width' | 'height'>) => {
  const {width, height} = useVideoConfig();
  return <OverlayCanvas {...props} width={width} height={height} />;
};

const url = (id: string) => `url(#${id})`;

/** A blur over the whole canvas: the default filter region (10% around the bbox) cuts thin bars. */
export const GlowFilter = ({id, blur, gain = GLOW_GAIN}: {id: string; blur: number; gain?: number}) => {
  const {width, height} = useStage();
  return (
    <filter id={id} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height} colorInterpolationFilters="sRGB">
      <feGaussianBlur stdDeviation={blur} />
      <feComponentTransfer>
        <feFuncA type="linear" slope={gain} intercept={-GLOW_CUT} />
      </feComponentTransfer>
    </filter>
  );
};

/** A mask over the whole canvas that hides `shape` (white shows, black hides). */
const HidingMask = ({id, shape}: {id: string; shape: RoundRect}) => {
  const {width, height} = useStage();
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
      <rect x={0} y={0} width={width} height={height} fill="#FFFFFF" />
      <path d={roundRectPath(shape)} fill="#000000" />
    </mask>
  );
};

/**
 * Shared context for drawing elements: the tracks their `track` field indexes, an id base, and the
 * opacity of the stroke's light core (strokeCore; 0 or absent draws none).
 */
export type ElementContext = {tracks: readonly RoundRect[]; idBase: string; core?: number};

/** Strokes narrower than this get no core: at 2 px a 1 px white line would only whiten them. */
export const CORE_MIN_WIDTH = 2.5;
/** The core's width as a share of the stroke's, and how far its colour goes towards white. */
const CORE_SHARE = 0.4;
const CORE_WHITE = 0.75;

/** The light core of a stroke of `width` in `color`, or null when there is none to draw. */
const coreOf = (context: ElementContext, width: number, color: string) => {
  const core = context.core ?? 0;
  if (!(core > 0) || width < CORE_MIN_WIDTH) return null;
  return {width: width * CORE_SHARE, color: interpolateColors(CORE_WHITE, [0, 1], [color, '#FFFFFF']), opacity: core};
};

const trackOf = (context: ElementContext, index: number) => {
  const track = context.tracks[index];
  if (!track) throw new Error(`An element asks for track ${index}, but there are only ${context.tracks.length}.`);
  return track;
};

/** The band's own frame: x along its length, y across it (unit vector n). No angles involved. */
const bandTransform = ({cx, cy, nx, ny}: BandElement | SheenElement) =>
  `matrix(${[ny, -nx, nx, ny, cx, cy].map(svgNumber).join(' ')})`;

/** Pieces of a comet's tail: brighter and wider at the head, fading to nothing. */
const COMET_PIECES = 24;

/**
 * A comet: its tail in pieces that thin and fade from the head back (almost linearly, so the
 * tail reads long), a round head, and the light core fading faster along the tail when the
 * stroke has one. Everything stays within the stroke's width, so nothing leaves the band.
 */
const Comet = ({element, track, context}: {element: CometElement; track: RoundRect; context: ElementContext}) => {
  const head = pointAt(track, element.s);
  const core = coreOf(context, element.width, element.color);
  const piece = (index: number, width: number, color: string, opacity: number, key: string) => {
    const near = element.s - (element.tail * index) / COMET_PIECES;
    // A hair of overlap hides the anti-aliasing seam between pieces.
    const far = element.s - (element.tail * (index + 1)) / COMET_PIECES - 0.5;
    return (
      <path key={key} d={perimeterPath(track, far, near)} fill="none" stroke={color}
        strokeWidth={width} strokeOpacity={opacity} strokeLinecap="butt" />
    );
  };
  const pieces = Array.from({length: COMET_PIECES}, (_, index) => {
    const fade = 1 - index / COMET_PIECES;
    return piece(index, element.width * (0.45 + 0.55 * fade), element.color, fade ** 1.1, `t${index}`);
  });
  const cores = core
    ? Array.from({length: COMET_PIECES}, (_, index) => {
      const fade = 1 - index / COMET_PIECES;
      return piece(index, core.width, core.color, core.opacity * fade ** 1.6, `c${index}`);
    })
    : [];
  return (
    <g opacity={element.opacity}>
      {pieces}
      {cores}
      <circle cx={head.x} cy={head.y} r={element.width / 2} fill={element.color} />
      {core ? <circle cx={head.x} cy={head.y} r={element.width * 0.4} fill="#FFFFFF" opacity={core.opacity} /> : null}
    </g>
  );
};

/**
 * A stroked piece of path with its light core on top, when the stroke has one. The core follows
 * the square of the stroke's opacity: a dim tube (the track under the comets, a breath at its low
 * point) is barely lit inside, so the bright pieces running over it are the ones that look hot.
 */
const CoredPath = ({d, color, width, opacity, context, linejoin = 'miter'}: {
  d: string; color: string; width: number; opacity: number; context: ElementContext; linejoin?: 'miter' | 'round';
}) => {
  const core = coreOf(context, width, color);
  const path = <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="butt" strokeLinejoin={linejoin} opacity={opacity} />;
  if (!core) return path;
  return (
    <g>
      {path}
      <path d={d} fill="none" stroke={core.color} strokeWidth={core.width} strokeLinecap="butt" strokeLinejoin={linejoin}
        opacity={opacity * opacity * core.opacity} data-core="true" />
    </g>
  );
};

/**
 * The rim light: the rounded rect stroked `lineWidth` px, through a vertical gradient that holds
 * `opacity` down to `hold` px (the bottom of the top corners' curve) and is gone `fade` px lower.
 * With no hold (a circle) it fades from the very top, so only the top arc is lit.
 */
const Rim = ({element, id}: {element: RimElement; id: string}) => {
  const top = element.y;
  const hold = Math.max(0, Math.min(element.hold, element.height / 2));
  const end = top + Math.max(hold + 1, Math.min(element.height, hold + element.fade));
  return (
    <g>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={top} x2={0} y2={end}>
          <stop offset={0} stopColor={element.color} stopOpacity={1} />
          {hold > 0 ? <stop offset={(hold / (end - top)).toFixed(4)} stopColor={element.color} stopOpacity={0.85} /> : null}
          <stop offset={1} stopColor={element.color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={roundRectPath({...element, radius: element.corner})} fill="none" stroke={url(id)} strokeWidth={element.lineWidth}
        opacity={element.opacity} />
    </g>
  );
};

/** A radial gradient over its shape's box, one colour, its opacity following `stops` ([offset, share]). */
const SoftGradient = ({id, color, stops}: {id: string; color: string; stops: readonly (readonly [number, number])[]}) => (
  <radialGradient id={id}>
    {stops.map(([offset, share]) => <stop key={offset} offset={offset} stopColor={color} stopOpacity={share} />)}
  </radialGradient>
);

/** A fog bank: the soft body, then its lighter core a little above the centre (see FOG_SHAPE). */
const FogBank = ({element, id}: {element: FogElement; id: string}) => {
  const coreId = `${id}-core`;
  return (
    <g>
      <defs>
        <SoftGradient id={id} color={element.color} stops={FOG_SHAPE.bodyStops} />
        <SoftGradient id={coreId} color={element.coreColor} stops={FOG_SHAPE.coreStops} />
      </defs>
      <ellipse cx={svgNumber(element.cx)} cy={svgNumber(element.cy)} rx={svgNumber(element.width / 2)} ry={svgNumber(element.height / 2)}
        fill={url(id)} opacity={element.opacity} />
      <ellipse cx={svgNumber(element.cx)} cy={svgNumber(element.cy - FOG_SHAPE.coreRise * element.height)}
        rx={svgNumber((FOG_SHAPE.coreWidth * element.width) / 2)} ry={svgNumber((FOG_SHAPE.coreHeight * element.height) / 2)}
        fill={url(coreId)} opacity={element.coreOpacity} />
    </g>
  );
};

/**
 * The damask tile of the interior background (90.3 × 135.5 in the motif's own units): one motif
 * in the middle and a quarter at each corner, so the tiles meet in a half-drop lattice.
 */
const DAMASK_TILE = {width: 90.3, height: 135.5, motifs: [[45, 68], [0, 0], [90.3, 0], [0, 135.5], [90.3, 135.5]] as const};

/**
 * The damask wallpaper: one pattern, its tile stretched to tileWidth × tileHeight px and shifted
 * by the offsets. The base fills the tile and the ink is opaque on it; only the area rect carries
 * the opacity, so every pixel of the wallpaper has the same alpha.
 */
const Damask = ({element, id}: {element: DamaskElement; id: string}) => {
  const scaleX = element.tileWidth / DAMASK_TILE.width;
  const scaleY = element.tileHeight / DAMASK_TILE.height;
  return (
    <g>
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" x={0} y={0} width={element.tileWidth} height={element.tileHeight}
          patternTransform={`translate(${svgNumber(element.x + element.offsetX)} ${svgNumber(element.y + element.offsetY)})`}>
          <rect x={0} y={0} width={element.tileWidth} height={element.tileHeight} fill={element.baseColor} />
          <g transform={`scale(${svgNumber(scaleX)} ${svgNumber(scaleY)})`} fill={element.color}>
            {DAMASK_TILE.motifs.map(([x, y]) => <path key={`${x}-${y}`} d={DAMASK} transform={`translate(${x - 41} ${y - 63})`} />)}
          </g>
        </pattern>
      </defs>
      <rect x={element.x} y={element.y} width={element.width} height={element.height} fill={url(id)} opacity={element.opacity} />
    </g>
  );
};

/**
 * Draws one engine element; null for glow/halo (their layers draw them) and for types the engine
 * does not know, so a kind can try its own renderer first and fall back to this one.
 */
export const renderOverlayElement = (element: OverlayElement | {type: string}, key: string | number, context: ElementContext): ReactNode => {
  const known = element as OverlayElement;
  switch (known.type) {
    case 'rect':
      return <rect key={key} x={known.x} y={known.y} width={known.width} height={known.height} rx={known.corner} fill={known.color} opacity={known.opacity} />;
    case 'gradient': {
      const id = `${context.idBase}-gradient-${key}`;
      const colors = [known.color0, known.color1, known.color2].slice(0, known.colorCount);
      return (
        <g key={key}>
          <defs>
            <linearGradient id={id} gradientUnits="userSpaceOnUse" spreadMethod="repeat"
              x1={known.x1} y1={known.y1} x2={known.x2} y2={known.y2}>
              {[...colors, colors[0]].map((color, index) => (
                <stop key={index} offset={index / colors.length} stopColor={color} />
              ))}
            </linearGradient>
          </defs>
          <rect x={known.x} y={known.y} width={known.width} height={known.height} fill={url(id)} opacity={known.opacity} />
        </g>
      );
    }
    case 'dot':
      return <circle key={key} cx={known.x} cy={known.y} r={known.radius} fill={known.color} opacity={known.opacity} />;
    case 'spark':
      // A glowing disc: a wide faint bloom (2.5 radii, the reach the fills count on), a warmer
      // inner glow, the disc, and a hot white centre. Circles only, no per-sparkle gradient.
      return (
        <g key={key} opacity={known.opacity}>
          <circle cx={known.x} cy={known.y} r={known.radius * 2.5} fill={known.color} opacity={0.14} />
          <circle cx={known.x} cy={known.y} r={known.radius * 1.6} fill={known.color} opacity={0.3} />
          <circle cx={known.x} cy={known.y} r={known.radius} fill={known.color} />
          <circle cx={known.x} cy={known.y} r={known.radius * 0.45} fill="#FFFFFF" opacity={0.65} />
        </g>
      );
    case 'band':
      return (
        <rect key={key} x={-known.length / 2} y={-known.width / 2} width={known.length} height={known.width}
          transform={bandTransform(known)} fill={known.color} opacity={known.opacity} />
      );
    case 'sheen': {
      const id = `${context.idBase}-sheen-${key}`;
      return (
        <g key={key}>
          <defs>
            <linearGradient id={id} x1={0} y1={0} x2={0} y2={1}>
              <stop offset={0} stopColor={known.color} stopOpacity={0} />
              <stop offset={0.5} stopColor={known.color} stopOpacity={1} />
              <stop offset={1} stopColor={known.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <rect x={-known.length / 2} y={-known.width / 2} width={known.length} height={known.width}
            transform={bandTransform(known)} fill={url(id)} opacity={known.opacity} />
        </g>
      );
    }
    case 'shade': {
      const id = `${context.idBase}-shade-${key}`;
      return (
        <g key={key}>
          <defs>
            <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={known.y} x2={0} y2={known.y + known.height}>
              <stop offset={0} stopColor={known.color} stopOpacity={1} />
              <stop offset={1} stopColor={known.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <rect x={known.x} y={known.y} width={known.width} height={known.height} fill={url(id)} opacity={known.opacity} />
        </g>
      );
    }
    case 'fog':
      return <FogBank key={key} element={known} id={`${context.idBase}-fog-${key}`} />;
    case 'damask':
      return <Damask key={key} element={known} id={`${context.idBase}-damasco-${key}`} />;
    case 'rim':
      return <Rim key={key} element={known} id={`${context.idBase}-rim-${key}`} />;
    case 'arc':
      return <path key={key} d={arcBandPath(known)} fill={known.color} opacity={known.opacity} />;
    case 'outline':
      return (
        <CoredPath key={key} d={roundRectPath(trackOf(context, known.track))} color={known.color} width={known.width}
          opacity={known.opacity} context={context} />
      );
    case 'dash':
    case 'segment':
      return (
        <CoredPath key={key} d={perimeterPath(trackOf(context, known.track), known.s, known.s + known.length)}
          color={known.color} width={known.width} opacity={known.opacity} context={context} />
      );
    case 'comet':
      return <Comet key={key} element={known} track={trackOf(context, known.track)} context={context} />;
    default:
      return null;
  }
};

/** A clip region: a rounded rect, or any path (a frame's ring, say) with its fill rule. */
export type ClipShape = RoundRect | {path: string; fillRule?: 'nonzero' | 'evenodd'};

const clipPathOf = (clip: ClipShape) => ('path' in clip ? clip : {path: roundRectPath(clip), fillRule: 'nonzero' as const});

/** The fill, clipped to the panel (or any clip shape). `name` keeps ids unique per layer. */
export const FillLayer = ({elements, clip, name = 'fill'}: {elements: readonly FillElement[]; clip: ClipShape; name?: string}) => {
  const {idPrefix} = useStage();
  const id = `${idPrefix}-${name}`;
  const {path, fillRule} = clipPathOf(clip);
  const context: ElementContext = {tracks: [], idBase: id};
  return (
    <g>
      <defs>
        <clipPath id={`${id}-clip`} clipPathUnits="userSpaceOnUse">
          <path d={path} clipRule={fillRule ?? 'nonzero'} />
        </clipPath>
      </defs>
      <g clipPath={url(`${id}-clip`)}>{elements.map((element, index) => renderOverlayElement(element, index, context))}</g>
    </g>
  );
};

/**
 * The stroke elements along their tracks, with the glow (a GlowElement in `elements`) as a
 * blurred copy underneath. `children` are drawn inside both, so a kind's ornaments glow too. The
 * light core only changes colour inside strokes that are already opaque, so the glow, which
 * blurs alpha, is the same with or without it.
 */
export const StrokeLayer = ({elements, tracks, name = 'stroke', core = 0, children}: {
  elements: readonly (StrokeElement | GlowElement)[]; tracks: readonly RoundRect[]; name?: string;
  /** Opacity of the light core along the strokes (strokeCore). */
  core?: number;
  children?: ReactNode;
}) => {
  const {idPrefix} = useStage();
  const id = `${idPrefix}-${name}`;
  const glow = elements.find((element): element is GlowElement => element.type === 'glow');
  const context: ElementContext = {tracks, idBase: id, core};
  const sharp = (
    <>
      {elements.map((element, index) => renderOverlayElement(element, index, context))}
      {children}
    </>
  );
  return (
    <g>
      {glow ? (
        <>
          <defs><GlowFilter id={`${id}-glow`} blur={glow.blur} gain={glow.gain} /></defs>
          <g filter={url(`${id}-glow`)} opacity={glow.opacity}>{sharp}</g>
        </>
      ) : null}
      <g>{sharp}</g>
    </g>
  );
};

/** The rim light (see buildRimScene), drawn over the fill and under the stroke. */
export const RimLayer = ({elements, name = 'rim'}: {elements: readonly RimElement[]; name?: string}) => {
  const {idPrefix} = useStage();
  if (elements.length === 0) return null;
  const context: ElementContext = {tracks: [], idBase: `${idPrefix}-${name}`};
  return <g>{elements.map((element, index) => renderOverlayElement(element, index, context))}</g>;
};

/** The panel's outer halo: its shape filled and blurred, masked out of the panel itself. */
export const HaloLayer = ({elements, shape, name = 'halo'}: {elements: readonly HaloElement[]; shape: RoundRect; name?: string}) => {
  const {idPrefix} = useStage();
  const id = `${idPrefix}-${name}`;
  const halo = elements[0];
  if (!halo) return null;
  return (
    <g>
      <defs>
        <GlowFilter id={`${id}-blur`} blur={halo.blur} gain={1} />
        <HidingMask id={`${id}-mask`} shape={shape} />
      </defs>
      <g mask={url(`${id}-mask`)}>
        <path d={roundRectPath(shape)} fill={halo.color} filter={url(`${id}-blur`)} opacity={halo.opacity} />
      </g>
    </g>
  );
};

/**
 * Everything a border draws goes inside this group: it masks out the hole, so no stroke, glow or
 * ornament can ever show in the window, and for 'tela' it clips to the box, so the glow only
 * reaches inwards.
 */
export const FrameGroup = ({layout, name = 'frame', children}: {layout: FrameLayout; name?: string; children: ReactNode}) => {
  const {idPrefix} = useStage();
  const id = `${idPrefix}-${name}`;
  const masked = <g mask={url(`${id}-hole`)}>{children}</g>;
  return (
    <g>
      <defs>
        <HidingMask id={`${id}-hole`} shape={layout.holeShape} />
        {layout.fit === 'tela' ? (
          <clipPath id={`${id}-box`} clipPathUnits="userSpaceOnUse"><path d={rectPath(layout.box)} /></clipPath>
        ) : null}
      </defs>
      {layout.fit === 'tela' ? <g clipPath={url(`${id}-box`)}>{masked}</g> : masked}
    </g>
  );
};

const GUIDE_COLORS = {box: '#22D3EE', content: '#A3E635', hole: '#F472B6'} as const;

/** Studio outlines of the layout: box (cyan, dashed), content (green), hole (pink). */
export const Guides = ({layout}: {layout: AssetLayout | FrameLayout}) => {
  const outline = (d: string, color: string, dashed = false) => (
    <path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray={dashed ? '8 6' : undefined} opacity={0.9} />
  );
  return (
    <g data-guides="true">
      {outline(rectPath(layout.box), GUIDE_COLORS.box, true)}
      {outline(rectPath(layout.content), GUIDE_COLORS.content)}
      {layout.hole ? outline(rectPath(layout.hole), GUIDE_COLORS.hole) : null}
      {'holeShape' in layout ? outline(roundRectPath(layout.holeShape), GUIDE_COLORS.hole, true) : null}
    </g>
  );
};
