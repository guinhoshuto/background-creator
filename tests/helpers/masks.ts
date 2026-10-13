import {readFileSync} from 'node:fs';
import {sizesForKind, type NamedSize} from '../../src/sizes';

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * The OBS masks a theme's window borders need, from the rule alone: OBS stretches the mask to the
 * camera, so windows of the same aspect and the same clamped radius in proportion to the width
 * share one (every round webcam is one disc; with square corners every 16:9 window too), named
 * after the shortest size id and drawn at the widest. `of` maps each window size to its mask's name.
 */
export const maskGroupsOf = (theme: string) => {
  const preset = JSON.parse(readFileSync(new URL(`../../presets/border-${theme}.json`, import.meta.url), 'utf8')) as {radius?: number};
  const radius = preset.radius ?? 0;
  const groups = new Map<string, NamedSize[]>();
  for (const size of sizesForKind('border').filter((entry) => entry.props?.fit !== 'screen')) {
    const corner = size.props?.shape === 'circle' ? size.width / 2 : Math.min(radius, size.width / 2, size.height / 2);
    const divisor = gcd(size.width, size.height);
    const key = `${size.width / divisor}:${size.height / divisor}|${corner / size.width}`;
    groups.set(key, [...(groups.get(key) ?? []), size]);
  }
  const masks = [...groups.values()].map((sizes) => ({
    name: sizes.reduce((best, size) => (size.id.length < best.id.length ? size : best)).id,
    widest: sizes.reduce((best, size) => (size.width > best.width ? size : best)),
    ids: sizes.map((size) => size.id),
  }));
  const of = (id: string) => masks.find((mask) => mask.ids.includes(id))!.name;
  return {masks, of};
};
