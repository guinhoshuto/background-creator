import type {ReactNode} from 'react';
import {strandCurve, STRAND} from '../../../../backgrounds/CobwebLoop';
import {TipBead} from '../../../../backgrounds/halloween/CobwebArtwork';
import {svgNumber} from '../../geometry';
import {DARK_EDGE} from './teia-web';

/**
 * A loose strand (the background's hanging silk with a bead at its free end), drawn from its knot
 * down: the garlands' broken ends. Dark outline, silk and a moonlit edge toward the moon, then the
 * tip bead, which flashes (grows `grow`, full opacity, brighter halo) as the moonlight band crosses
 * it. With `fade` > 0 the silk fades in over its first `fade` px (userSpaceOnUse gradients, no mask
 * or filter), so a knot at the file's edge never reads as a cut; a broken end hangs from its
 * thread and does not fade.
 */
export const StrandFigure = ({
  id, x, y, length, rotation, bend, glow, flash, side, lightX, lightY, silk, moonlight, width, opacity, lit, litOpacity, litShift, bead, grow, rest, fade,
}: {
  id: string; x: number; y: number; length: number; rotation: number; bend: number; glow: number;
  /** The glint band on the bead, 0 to 1. */
  flash: number;
  /** Which way the moonlit edge shifts (−1 to 1). */
  side: number;
  /** Unit vector toward the moon, in the strand's turned frame. */
  lightX: number; lightY: number;
  silk: string; moonlight: string;
  /** Silk width and opacity; the moonlit edge's width, opacity and shift, px. */
  width: number; opacity: number; lit: number; litOpacity: number; litShift: number;
  /** TipBead size, its growth while flashing and its opacity at rest. */
  bead: number; grow: number; rest: number;
  /** Fade-in length below the knot, px (0: none). */
  fade: number;
}): ReactNode => {
  const n = svgNumber;
  const {control, tip} = strandCurve({scale: length / STRAND.length, bend});
  const d = `M0 0 Q${n(control.x)} ${n(control.y)} ${n(tip.x)} ${n(tip.y)}`;
  const fading = fade > 0;
  const fadeTo = (part: string, color: string) => (
    <linearGradient id={`${id}-${part}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={fade}>
      <stop offset="0" stopColor={color} stopOpacity="0" />
      <stop offset="1" stopColor={color} stopOpacity="1" />
    </linearGradient>
  );
  const stroke = (part: string, color: string) => (fading ? `url(#${id}-${part})` : color);
  return (
    <g transform={`translate(${n(x)} ${n(y)}) rotate(${n(rotation)})`}>
      <defs>
        {fading ? fadeTo('edge', DARK_EDGE.color) : null}
        {fading ? fadeTo('silk', silk) : null}
        {fading ? fadeTo('lit', moonlight) : null}
        <radialGradient id={`${id}-halo`}>
          <stop offset="0" stopColor={moonlight} stopOpacity={n(0.55 + 0.3 * flash)} />
          <stop offset="0.4" stopColor={silk} stopOpacity="0.16" />
          <stop offset="1" stopColor={silk} stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fill="none" strokeLinecap="round">
        <path d={d} stroke={stroke('edge', DARK_EDGE.color)} strokeWidth={n(width + DARK_EDGE.grow)} opacity={DARK_EDGE.opacity} />
        <path d={d} stroke={stroke('silk', silk)} strokeWidth={n(width)} opacity={n(opacity)} />
        <path d={d} stroke={stroke('lit', moonlight)} strokeWidth={n(lit)} opacity={n(litOpacity * (0.6 + 0.4 * glow))}
          transform={`translate(${n(litShift * side)} 0)`} />
      </g>
      <TipBead x={tip.x} y={tip.y} light={{x: lightX, y: lightY}} size={Math.round(bead * (1 + grow * flash) * 1000) / 1000}
        opacity={Math.round((rest + (1 - rest) * flash) * 1000) / 1000}
        moonlight={moonlight} halo={`url(#${id}-halo)`} />
    </g>
  );
};
