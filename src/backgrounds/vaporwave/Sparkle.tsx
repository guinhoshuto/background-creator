import type {VaporwaveElement} from '../VaporwaveLoop';
import {SPARKLE_GLOW} from './frame';

/** A four-point sparkle with a soft round glow; the clearance tests measure the same glow. */
export const Sparkle = ({sparkle, color, glowId}: {sparkle: VaporwaveElement; color: string; glowId: string}) => {
  const {size} = sparkle;
  const waist = size * 0.2;
  return (
    <g opacity={sparkle.opacity} transform={`translate(${sparkle.x.toFixed(2)} ${sparkle.y.toFixed(2)})`}>
      <circle r={size * SPARKLE_GLOW} fill={`url(#${glowId})`} />
      <path d={`M0 ${-size}L${waist} ${-waist}L${size} 0L${waist} ${waist}L0 ${size}L${-waist} ${waist}L${-size} 0L${-waist} ${-waist}Z`}
        fill={color} />
    </g>
  );
};
