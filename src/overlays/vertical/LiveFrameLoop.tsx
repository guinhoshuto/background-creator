import type {ReactNode} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {FillElement} from '../shared/elements';
import {buildFillScene} from '../shared/fills';
import {FillLayer, OverlayCanvas, useStage} from '../shared/render';
import {cornerRectPath, offsetCornerRect, rectPathOf, type CornerRect} from './geometry';
import {VERTICAL_LAYOUTS, panelOf, windowsOf, type LayoutWindow} from './layouts';
import {liveFrameLoopSchema, type LiveFrameLoopProps} from './schema';
import {VERTICAL_CANVAS} from './zones';

/** Spec §4.1, the window ring in fixed px: a line on the window edge, then a band around it. */
export const RING_LINE_WIDTH = 3;
export const RING_BAND_WIDTH = 10;
/** How far the ring reaches outside its window. */
export const RING_WIDTH = RING_LINE_WIDTH + RING_BAND_WIDTH;

const SCREEN = {x: 0, y: 0, width: VERTICAL_CANVAS.width, height: VERTICAL_CANVAS.height};

/** The band between two outward offsets of a shape, as one path for `fill-rule="evenodd"`. */
export const bandPath = (shape: CornerRect, inner: number, outer: number) =>
  `${cornerRectPath(offsetCornerRect(shape, outer))}${cornerRectPath(offsetCornerRect(shape, inner))}`;

/** The screen with one window cut out, for `clip-rule="evenodd"`: alpha 0 inside the window. */
export const holePath = (window: CornerRect) => `${rectPathOf(SCREEN)}${cornerRectPath(window)}`;

export type WindowRing = {window: LayoutWindow; line: string; band: string; holesAbove: string[]};

export type LiveFrameScene = {
  canvas: {width: number; height: number};
  windows: LayoutWindow[];
  panel: LayoutWindow | null;
  /**
   * One evenodd path per window, the screen minus that window. The background is clipped by all
   * of them nested, which cuts the union of the windows even where two overlap (the camera bubble
   * over the phone game): one path holding both holes would fill their overlap again.
   */
  holes: string[];
  /** Each window's ring, cut by the windows listed after it (they sit on top), empty when off. */
  rings: WindowRing[];
  fill: FillElement[];
};

/** Everything one frame draws; pure, so tests read it without rendering. Only the fill moves. */
export const getLiveFrameScene = (props: LiveFrameLoopProps, frame: number, durationInFrames: number): LiveFrameScene => {
  const layout = VERTICAL_LAYOUTS[props.layout];
  const windows = windowsOf(layout, props.chatMode);
  const holes = windows.map(holePath);
  return {
    canvas: {...VERTICAL_CANVAS},
    windows,
    panel: panelOf(layout, props.chatMode),
    holes,
    rings: props.ring
      ? windows.map((window, index) => ({
        window, line: bandPath(window, 0, RING_LINE_WIDTH), band: bandPath(window, RING_LINE_WIDTH, RING_WIDTH),
        holesAbove: holes.slice(index + 1),
      }))
      : [],
    fill: buildFillScene(props, SCREEN, frame, durationInFrames),
  };
};

/** Nested clips: what is drawn inside shows only outside every listed window. */
const CutWindows = ({holes, name, children}: {holes: readonly string[]; name: string; children: ReactNode}) => {
  const {idPrefix} = useStage();
  return holes.reduceRight<ReactNode>((inner, hole, index) => {
    const id = `${idPrefix}-${name}-${index}`;
    return (
      <g>
        <defs data-layer="holes">
          <clipPath id={id} clipPathUnits="userSpaceOnUse"><path d={hole} clipRule="evenodd" /></clipPath>
        </defs>
        <g clipPath={`url(#${id})`}>{inner}</g>
      </g>
    );
  }, children);
};

/** One frame of the screen, pure, so the tests can render it to markup. */
export const LiveFrameFrame = ({props, frame, durationInFrames}: {props: LiveFrameLoopProps; frame: number; durationInFrames: number}) => {
  const scene = getLiveFrameScene(props, frame, durationInFrames);
  return (
    <OverlayCanvas props={props} width={scene.canvas.width} height={scene.canvas.height} idPrefix="live">
      <CutWindows holes={scene.holes} name="hole">
        <FillLayer elements={scene.fill} clip={{...SCREEN, radius: 0}} />
        {scene.panel ? (
          <path d={cornerRectPath(scene.panel)} fill={props.panelColor} opacity={props.panelOpacity} data-layer="panel" />
        ) : null}
      </CutWindows>
      <g data-layer="ring">
        {scene.rings.map((ring, index) => (
          <CutWindows key={ring.window.id} holes={ring.holesAbove} name={`ring-${index}`}>
            <path d={ring.band} fill={props.ringColor} fillRule="evenodd" />
            <path d={ring.line} fill={props.ringLineColor} fillRule="evenodd" />
          </CutWindows>
        ))}
      </g>
    </OverlayCanvas>
  );
};

export const LiveFrameLoop = (props: LiveFrameLoopProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return <LiveFrameFrame props={props} frame={frame} durationInFrames={durationInFrames} />;
};

/** The catalog entry: the kind's canvas is fixed, so it has no getLayout. */
export const liveFrameCatalogEntry = {
  id: 'LiveFrameLoop',
  kind: 'vertical',
  component: LiveFrameLoop,
  schema: liveFrameLoopSchema,
  defaultProps: liveFrameLoopSchema.parse({}),
} as const;
