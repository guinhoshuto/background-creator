import {Fragment} from 'react';
import type {Rect} from '../box';
import {rectPath, roundRectPath, svgNumber, type RoundRect} from '../geometry';
import {useStage} from '../render';
import {ORNAMENT_REGISTRY} from './registry';
import type {FlashElement, OrnamentElement, OrnamentLayerName, OrnamentLayout, OrnamentStyle} from './types';

/**
 * The ornament layers. `back` goes right after the halo, under the panel (or, on a border, as a
 * sibling before the band's fill, never inside its clip), clipped to the paint limit minus the
 * frame's cover, so no fill or band opacity ever lets it show through. `front` goes after the
 * stroke, unclipped (placement already keeps it off the text and the window). Both render null
 * when empty: with ornaments 'nenhum' the markup is exactly what it was. No filters, no blend
 * modes; every def lives inside the layer's group. A scaled layout (ornamentScale) draws the whole
 * layer, clip included, in its own space inside one scale transform.
 */
export const OrnamentLayer = ({elements, layout, style, layer}: {
  elements: readonly OrnamentElement[]; layout: OrnamentLayout; style: OrnamentStyle; layer: OrnamentLayerName;
}) => {
  const {idPrefix} = useStage();
  if (elements.length === 0 || style.ornaments === 'nenhum') return null;
  const set = ORNAMENT_REGISTRY[style.ornaments];
  const idBase = `${idPrefix}-ornament-${layer}`;
  const context = {idBase, frame: layout.frame, style};
  const body = elements.map((element, index) => <Fragment key={index}>{set.render(element, index, context)}</Fragment>);
  const transform = layout.scale === undefined ? undefined : `scale(${svgNumber(layout.scale)})`;
  if (layer === 'front') return <g data-ornaments="front" transform={transform}>{body}</g>;
  const clip = `${idBase}-clip`;
  const {paintLimit, cover} = layout.frame;
  return (
    <g data-ornaments="back" transform={transform}>
      <defs>
        <clipPath id={clip} clipPathUnits="userSpaceOnUse">
          {/* Evenodd: the paint limit with the cover cut out. A border's cover is its whole outer edge, so nothing of the back layer reaches the window or its glow margin (the hole mask only empties holeShape). */}
          <path d={`${rectPath(paintLimit)}${cover.path}`} clipRule="evenodd" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>{body}</g>
    </g>
  );
};

/** A clip region of the flash: a path with its rule; several are united. */
export type FlashClip = {path: string; fillRule?: 'nonzero' | 'evenodd'};

/** Peak alpha of the flash's wash, per unit of level, over a panel and over a border's band. */
export const FLASH_PANEL_PEAK = 0.16;
export const FLASH_BAND_PEAK = 0.35;
/** Peak alpha of the cold edge along the track, per unit of level. */
export const FLASH_EDGE_PEAK = 0.6;

/**
 * The lightning flash: a cold wash over the panel (or the band) whose left and right ends take the
 * two windows' levels, and a cold edge along the track, all at the flash's opacity (lightning).
 * Drawn last, over the front ornaments.
 */
export const FlashLayer = ({elements, clips, area, edge, edgeWidth, peak}: {
  elements: readonly FlashElement[]; clips: readonly FlashClip[]; area: Rect; edge: RoundRect | null; edgeWidth: number; peak: number;
}) => {
  const {idPrefix} = useStage();
  if (elements.length === 0) return null;
  return (
    <g data-flash="true">
      {elements.map((element, index) => {
        const id = `${idPrefix}-flash-${index}`;
        const x1 = area.x;
        const x2 = area.x + Math.max(1, area.width);
        return (
          <g key={index} opacity={element.opacity}>
            <defs>
              <clipPath id={`${id}-clip`} clipPathUnits="userSpaceOnUse">
                {clips.map((clip, clipIndex) => <path key={clipIndex} d={clip.path} clipRule={clip.fillRule ?? 'nonzero'} />)}
              </clipPath>
              <linearGradient id={`${id}-wash`} gradientUnits="userSpaceOnUse" x1={x1} y1={0} x2={x2} y2={0}>
                <stop offset={0} stopColor={element.color} stopOpacity={peak * element.left} />
                <stop offset={1} stopColor={element.color} stopOpacity={peak * element.right} />
              </linearGradient>
              {edge && edgeWidth > 0 ? (
                <linearGradient id={`${id}-edge`} gradientUnits="userSpaceOnUse" x1={x1} y1={0} x2={x2} y2={0}>
                  <stop offset={0} stopColor={element.color} stopOpacity={FLASH_EDGE_PEAK * element.left} />
                  <stop offset={1} stopColor={element.color} stopOpacity={FLASH_EDGE_PEAK * element.right} />
                </linearGradient>
              ) : null}
            </defs>
            <g clipPath={`url(#${id}-clip)`}>
              <path d={rectPath(area)} fill={`url(#${id}-wash)`} />
            </g>
            {edge && edgeWidth > 0 ? (
              <path d={roundRectPath(edge)} fill="none" stroke={`url(#${id}-edge)`} strokeWidth={edgeWidth} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
};
