import type {Rect} from './box';
import {clampRadius, fitContent, offsetRoundRect, type Insets, type RoundRect} from './geometry';

/**
 * The content rect inside a rounded shape, as large as the corners allow. `fitContent` keeps the
 * requested top and bottom and only moves the sides in, which in a circle leaves no width at
 * all; here the top and bottom may also come in, one whole pixel at a time, and the largest
 * rect wins (the first, so the tallest, on a tie). In a circle that is about the inscribed
 * square; in a long pill or a card with small corners nothing changes.
 */
export const fitLargestContent = (shape: RoundRect, insets: Insets): Rect => {
  const radius = Math.ceil(clampRadius(shape.radius, shape.width, shape.height));
  let best = fitContent(shape, insets);
  for (let extra = 1; extra <= radius; extra++) {
    const candidate = fitContent(shape, {...insets, top: insets.top + extra, bottom: insets.bottom + extra});
    if (candidate.width * candidate.height > best.width * best.height) best = candidate;
  }
  return best;
};

/**
 * Where the text goes inside the stroke (block's content, the chat's messages and title): the insets from `inner` (padding plus the kind's extras)
 * and, near the round corners, the smaller padding kept from the curve as well. The shared
 * fitContent lets a corner of the content touch the curve (a pill's text would graze the
 * stroke); pulling the shape in by that clearance, which shrinks its radius with it, keeps the
 * whole content at least that far from the stroke.
 */
export const fitClearContent = (inner: RoundRect, insets: Insets, clearance: number): Rect => {
  const c = Math.max(0, Math.min(clearance, insets.top, insets.right, insets.bottom, insets.left));
  return fitLargestContent(offsetRoundRect(inner, -c), {
    top: insets.top - c, right: insets.right - c, bottom: insets.bottom - c, left: insets.left - c,
  });
};

/**
 * The text area of a circle: the square centred in it whose corners keep `inset` px from the
 * inside of the stroke (`inner`, a circle), so the text never meets the curve anywhere. Its side
 * is the largest even number of pixels that fits, which keeps it centred on whole pixels (the
 * centre of an even box is a whole pixel). Empty when the inset leaves nothing.
 */
export const fitCircleContent = (inner: RoundRect, inset: number): Rect => {
  const reach = inner.width / 2 - inset;
  const half = reach > 0 ? Math.floor(reach * Math.SQRT1_2 + 1e-9) : 0;
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return {x: cx - half, y: cy - half, width: 2 * half, height: 2 * half};
};
