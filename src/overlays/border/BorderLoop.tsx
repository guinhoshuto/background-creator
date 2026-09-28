import type {ReactNode} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {
  FrameGroup, HaloLayer, OverlayCanvas, RimLayer, StrokeLayer, renderOverlayElement, roundRectPath, svgNumber, useStage,
  filletPath, type FillElement, type FrameLayout, type RoundRect,
  FLASH_BAND_PEAK, FlashLayer, OrnamentLayer, type FlashClip,
} from '../shared';
import {
  bandCoversCorners, bordaLoopSchema, getBordaLayout, getBordaMask, getBordaMaskElement, getBordaMotion, getBordaSceneParts, type BordaGeometry,
  type BordaLoopProps, type CornerElement,
} from './scene';

/** A diamond centred on (x, y), `half` px from the centre to each tip. */
const diamondPath = (x: number, y: number, half: number) => {
  const f = svgNumber;
  return `M${f(x)} ${f(y - half)}L${f(x + half)} ${f(y)}L${f(x)} ${f(y + half)}L${f(x - half)} ${f(y)}Z`;
};

const renderCorner = (element: CornerElement, key: number, tracks: readonly RoundRect[], core: number): ReactNode => {
  if (element.type === 'bracket') {
    // A bracket is a piece of a track like a dash: the engine draws it, with the lines' light core.
    return renderOverlayElement({...element, type: 'dash'}, key, {tracks, idBase: 'border-bracket', core});
  }
  const half = element.size / 2;
  // The highlight sits up-left inside the gem (its tips stay within the diamond), like a facet.
  return (
    <g key={key} opacity={element.opacity}>
      <path d={diamondPath(element.x, element.y, half)} fill={element.color} />
      <path d={diamondPath(element.x - 0.16 * half, element.y - 0.16 * half, 0.44 * half)} fill="#FFFFFF" opacity={0.7} />
    </g>
  );
};

/**
 * The band's fill, clipped to the band itself (its outer edge minus the window) and, on a
 * screen, the file's corners outside it (filletPath): two clip children, each evenodd, their union.
 *
 * Around a window the box's corners outside the window's arcs (the fillets) sit over the camera,
 * so they get an opaque matte in the fill's first colour under the fill: a translucent fill there
 * (glass, a pattern without a base) would let the camera's square corners show through. The
 * matte stays inside the band's clip, so the frame never pokes out of its own outline. It is only
 * drawn while the band reaches the box's corners (a radius up to (1 + √2)·thickness, see
 * bandCoversCorners), where it does round a rectangular camera off; past it (a round webcam) the
 * camera's corners stick out anyway, the window's mask (mascara) is what rounds it, and a matte
 * would only make most of the round band opaque. The band itself stays as translucent as the fill asks.
 */
const BandFillLayer = ({elements, geometry, matte}: {
  elements: readonly FillElement[]; geometry: BordaGeometry; matte: string;
}) => {
  const {idPrefix} = useStage();
  const id = `${idPrefix}-band`;
  const {layout, band} = geometry;
  return (
    <g>
      <defs>
        <clipPath id={`${id}-clip`} clipPathUnits="userSpaceOnUse">
          <path d={`${roundRectPath(band)}${roundRectPath(layout.window)}`} clipRule="evenodd" />
          {layout.fit === 'tela' ? <path d={filletPath(layout)} clipRule="evenodd" /> : null}
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        {bandCoversCorners(geometry) ? <path d={filletPath(layout)} fillRule="evenodd" fill={matte} data-matte="true" /> : null}
        {elements.map((element, index) => renderOverlayElement(element, index, {tracks: [], idBase: id}))}
      </g>
    </g>
  );
};

/** The OBS mask: the window in opaque white on transparency, the file as big as the camera. */
const BordaMaskFrame = ({props}: {props: BordaLoopProps}) => {
  const layout = getBordaLayout(props);
  const window = getBordaMaskElement(props);
  return (
    <OverlayCanvas props={props} width={layout.canvas.width} height={layout.canvas.height} layout={layout}
      guides={props.guides} idPrefix="border-mascara">
      <path d={roundRectPath({...window, radius: window.corner})} fill={window.color} data-mask="true" />
    </OverlayCanvas>
  );
};

/** One frame of the border; pure, so the tests can render it with renderToStaticMarkup. */
export const BordaFrame = ({props, frame, durationInFrames}: {
  props: BordaLoopProps; frame: number; durationInFrames: number;
}) => {
  if (props.mascara) return <BordaMaskFrame props={props} />;
  const {geometry, halo, ornamentBack, fill, rim, stroke, corners, glow, ornamentFront, flash} = getBordaSceneParts(props, frame, durationInFrames);
  const layout: FrameLayout = geometry.layout;
  // The flash washes the band (and on a screen the file's corners outside it), like the band's fill.
  const flashClips: FlashClip[] = [
    {path: `${roundRectPath(geometry.band)}${roundRectPath(layout.window)}`, fillRule: 'evenodd'},
    ...(layout.fit === 'tela' ? [{path: filletPath(layout), fillRule: 'evenodd' as const}] : []),
  ];
  return (
    <OverlayCanvas props={props} width={layout.canvas.width} height={layout.canvas.height} layout={layout}
      guides={props.guides} idPrefix="border">
      <FrameGroup layout={layout}>
        <HaloLayer elements={halo} shape={layout.outer} />
        {/* A sibling before the band's fill, never inside its clip (the matte stays the clip's first child). */}
        <OrnamentLayer elements={ornamentBack} layout={geometry.ornamentLayout} style={props} layer="back" />
        <BandFillLayer elements={fill} geometry={geometry} matte={props.fillColors[0]!} />
        <RimLayer elements={rim} />
        <StrokeLayer elements={[...stroke, ...glow]} tracks={geometry.tracks} core={props.strokeCore}>
          {corners.map((element, index) => renderCorner(element, index, geometry.tracks, props.strokeCore))}
        </StrokeLayer>
        <OrnamentLayer elements={ornamentFront} layout={geometry.ornamentLayout} style={props} layer="front" />
        <FlashLayer elements={flash} clips={flashClips} area={layout.fit === 'tela' ? layout.box : layout.outer}
          edge={geometry.tracks[0]} edgeWidth={props.strokeWidth} peak={FLASH_BAND_PEAK} />
      </FrameGroup>
    </OverlayCanvas>
  );
};

export const BorderLoop = (props: BordaLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return <BordaFrame props={props} frame={frame} durationInFrames={durationInFrames} />;
};

/** The catalog entry the integrator registers (kind 'border', Studio folder 'borders'). */
export const bordaCatalogEntry = {
  id: 'BorderLoop',
  kind: 'border',
  component: BorderLoop,
  schema: bordaLoopSchema,
  defaultProps: bordaLoopSchema.parse({}),
  getLayout: getBordaLayout,
  getMotion: getBordaMotion,
  getMask: getBordaMask,
} as const;
