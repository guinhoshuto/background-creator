import {PLATE, smoothstep} from './frame';

const FALLOFF = Array.from({length: 9}, (_, index) => {
  const t = index / 8;
  return {offset: t, opacity: 1 - smoothstep(0, 1, t)};
});

/**
 * Paints for the content plate: a ramp for each side and an elliptical one for each corner,
 * all fading from the inner rectangle to the outer one exactly as getPlateWeight does.
 */
export const PlateDefs = ({id, color}: {id: string; color: string}) => {
  const {outer, inner} = PLATE;
  const stops = FALLOFF.map(({offset, opacity}) => (
    <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
  ));
  const corner = (name: string, cx: number, cy: number, rx: number, ry: number) => (
    <radialGradient id={`${id}-${name}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1"
      gradientTransform={`translate(${cx} ${cy}) scale(${rx} ${ry})`}>{stops}</radialGradient>
  );
  const rx = [inner.left - outer.left, outer.right - inner.right];
  const ry = [inner.top - outer.top, outer.bottom - inner.bottom];
  return (
    <>
      <linearGradient id={`${id}-l`} gradientUnits="userSpaceOnUse" x1={inner.left} x2={outer.left} y1="0" y2="0">{stops}</linearGradient>
      <linearGradient id={`${id}-r`} gradientUnits="userSpaceOnUse" x1={inner.right} x2={outer.right} y1="0" y2="0">{stops}</linearGradient>
      <linearGradient id={`${id}-t`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={inner.top} y2={outer.top}>{stops}</linearGradient>
      <linearGradient id={`${id}-b`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={inner.bottom} y2={outer.bottom}>{stops}</linearGradient>
      {corner('tl', inner.left, inner.top, rx[0]!, ry[0]!)}
      {corner('tr', inner.right, inner.top, rx[1]!, ry[0]!)}
      {corner('bl', inner.left, inner.bottom, rx[0]!, ry[1]!)}
      {corner('br', inner.right, inner.bottom, rx[1]!, ry[1]!)}
    </>
  );
};

/**
 * The soft rectangular plate behind the content area, built from nine pieces on whole pixels
 * instead of a full-frame mask: the pieces never overlap and never leave a seam.
 */
export const ContentPlate = ({id, color, strength}: {id: string; color: string; strength: number}) => {
  const {outer, inner} = PLATE;
  const columns = [[outer.left, inner.left, 'l'], [inner.left, inner.right, ''], [inner.right, outer.right, 'r']] as const;
  const rows = [[outer.top, inner.top, 't'], [inner.top, inner.bottom, ''], [inner.bottom, outer.bottom, 'b']] as const;
  if (strength <= 0) return null;
  return (
    <g>
      {rows.flatMap(([top, bottom, vertical]) => columns.map(([left, right, horizontal]) => {
        const piece = vertical + horizontal;
        return (
          <rect key={`${top}-${left}`} x={left} y={top} width={right - left} height={bottom - top}
            fill={piece ? `url(#${id}-${piece})` : color} fillOpacity={strength} />
        );
      }))}
    </g>
  );
};
