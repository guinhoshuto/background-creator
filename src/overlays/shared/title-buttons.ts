import {createElement, type ReactElement} from 'react';
import type {z} from 'zod';
import type {Rect} from './box';
import {roundRectSdf, svgNumber, type RoundRect} from './geometry';
import {useStage} from './render';

/**
 * The title bar of a window: three buttons (minimize, maximize, close) at the right end of a bar,
 * each a rounded square with a glyph made of lines, never of letters. One implementation for the
 * three kinds: the chat puts the row on its header, the block on a top accent bar, the border on a
 * taller top side of its band (which also brings the bar itself and the line under it). Every
 * measure is fixed px and nothing here reads the frame or the seed: the row is fixed furniture,
 * flat, outside the stroke layer (so the glow never blurs it), and absent while it is off.
 */

export const TITLE_BUTTON_COUNT = 3;
/** Width of a button's outline and of its glyph's lines, in px. */
export const TITLE_BUTTON_LINE = 2;
/** A button's corner radius, as a share of its size. */
export const TITLE_BUTTON_CORNER = 0.22;
/** Half the width of the dash and of the cross, as a share of the button's size. */
export const TITLE_BUTTON_GLYPH = 0.25;
/** How much smaller the maximize square is than the other glyphs, in px per side. */
export const TITLE_BUTTON_SQUARE_INSET = 1;
/** The filled square is drawn this far inside the button's box, so its outline stays within it. */
const TITLE_BUTTON_FACE_INSET = 1;

/** The three buttons, left to right, the last one ending at `right`, all centred on `cy`. */
export const titleButtonRow = ({right, cy, size, gap}: {right: number; cy: number; size: number; gap: number}): Rect[] =>
  Array.from({length: TITLE_BUTTON_COUNT}, (_, index) => ({
    x: right - (TITLE_BUTTON_COUNT - index) * size - (TITLE_BUTTON_COUNT - 1 - index) * gap,
    y: cy - size / 2,
    width: size,
    height: size,
  }));

/** The maximize glyph of a button: a centred square, a little smaller than the dash and the cross. */
export const titleButtonSquare = (button: Rect): Rect => {
  const half = TITLE_BUTTON_GLYPH * button.width;
  const side = 2 * (half - TITLE_BUTTON_SQUARE_INSET);
  return {x: button.x + button.width / 2 - side / 2, y: button.y + button.height / 2 - side / 2, width: side, height: side};
};

/** The box around a whole row (three sizes and two gaps wide); a row is never empty. */
export const titleButtonRowBox = (row: readonly Rect[]): Rect => {
  const first = row[0]!;
  const last = row[row.length - 1]!;
  return {x: first.x, y: first.y, width: last.x + last.width - first.x, height: first.height};
};

/** Whether a row's box lies inside the inner face of the outline, round corners included. */
export const titleButtonsFit = (row: Rect, inside: RoundRect): boolean =>
  [[row.x, row.y], [row.x + row.width, row.y], [row.x, row.y + row.height], [row.x + row.width, row.y + row.height]]
    .every(([x, y]) => roundRectSdf(inside, x!, y!) <= 1e-9);

/**
 * Refuses a row its bar cannot hold, with the way out: buttons taller than the bar (`barName` is
 * the prop that sets its height), or a row that leaves the inner face of the outline, by its width
 * or through a round corner. A kind calls it only where the buttons apply.
 */
export const refineTitleButtons = (
  input: {size: number; bar: number; barName: string; row: readonly Rect[]; inside: RoundRect}, context: z.RefinementCtx,
) => {
  if (input.size > input.bar + 1e-9) {
    context.addIssue({
      code: 'custom',
      path: ['titleButtonSize'],
      message: `The title buttons are taller than their bar: use titleButtonSize ≤ ${input.bar}, or a taller bar (${input.barName}).`,
    });
    return;
  }
  if (input.row.length === 0 || titleButtonsFit(titleButtonRowBox(input.row), input.inside)) return;
  context.addIssue({
    code: 'custom',
    path: ['titleButtonInset'],
    message: 'The title buttons leave their bar: reduce titleButtonSize, titleButtonGap or radius, or increase titleButtonInset.',
  });
};

/** One button: its box, its place in the row (0 minimize, 1 maximize, 2 close), its fill and the line color. */
export type TitleButtonElement = {
  type: 'title-button'; index: number; x: number; y: number; size: number; color: string; line: string; opacity: number;
};

/** A flat rect of a title bar: the bar itself, or the line under it. */
/** `opacity` is always 1: no layer reads it; the scene scans require it of every element. */
export type TitleBarElement = {
  type: 'title-bar' | 'title-line'; x: number; y: number; width: number; height: number; color: string; opacity: number;
};

/** The buttons of a row, filled left to right with `titleButtonColors`, outlined in the first outline color. */
export const buildTitleButtonScene = (
  row: readonly Rect[], style: {titleButtonColors: readonly string[]; strokeColors: readonly string[]},
): TitleButtonElement[] => row.map((button, index) => ({
  type: 'title-button', index, x: button.x, y: button.y, size: button.width, color: style.titleButtonColors[index]!, line: style.strokeColors[0]!, opacity: 1,
}));

export const titleBarElement = (type: TitleBarElement['type'], rect: Rect, color: string): TitleBarElement =>
  ({type, x: rect.x, y: rect.y, width: rect.width, height: rect.height, color, opacity: 1});

const glyphOf = (element: TitleButtonElement): ReactElement => {
  const f = svgNumber;
  const box = {x: element.x, y: element.y, width: element.size, height: element.size};
  const cx = element.x + element.size / 2;
  const cy = element.y + element.size / 2;
  const half = TITLE_BUTTON_GLYPH * element.size;
  if (element.index === 0) return createElement('path', {d: `M${f(cx - half)} ${f(cy)}H${f(cx + half)}`, 'data-glyph': 'minimize'});
  if (element.index === 1) {
    const square = titleButtonSquare(box);
    return createElement('rect', {x: f(square.x), y: f(square.y), width: f(square.width), height: f(square.height), 'data-glyph': 'maximize'});
  }
  return createElement('path', {
    d: `M${f(cx - half)} ${f(cy - half)}L${f(cx + half)} ${f(cy + half)}M${f(cx + half)} ${f(cy - half)}L${f(cx - half)} ${f(cy + half)}`,
    'data-glyph': 'close',
  });
};

/**
 * The title bar's layer: the flat rects (`bars`: a bar, a line) and then the buttons, clipped to
 * `clip` (the inside of the outline, so a bar follows its round corners). Null while both lists are
 * empty: a piece that is off leaves no group and no id in the markup. Written with createElement so
 * the math and the layer stay in this one file.
 */
export const TitleButtonLayer = ({bars = [], buttons, clip, name = 'title'}: {
  bars?: readonly TitleBarElement[]; buttons: readonly TitleButtonElement[]; clip: string; name?: string;
}): ReactElement | null => {
  const {idPrefix} = useStage();
  if (bars.length === 0 && buttons.length === 0) return null;
  const id = `${idPrefix}-${name}`;
  const f = svgNumber;
  const face = TITLE_BUTTON_FACE_INSET;
  return createElement('g', {id},
    createElement('defs', null,
      createElement('clipPath', {id: `${id}-clip`, clipPathUnits: 'userSpaceOnUse'}, createElement('path', {d: clip}))),
    createElement('g', {clipPath: `url(#${id}-clip)`},
      ...bars.map((bar, index) => createElement('rect', {
        key: `bar-${index}`, x: f(bar.x), y: f(bar.y), width: f(bar.width), height: f(bar.height), fill: bar.color, 'data-title': bar.type,
      })),
      ...buttons.map((button) => createElement('g', {
        key: `button-${button.index}`, fill: 'none', stroke: button.line, strokeWidth: TITLE_BUTTON_LINE, strokeLinecap: 'round',
        strokeLinejoin: 'round', 'data-title': 'button',
      },
      createElement('rect', {
        x: f(button.x + face), y: f(button.y + face), width: f(button.size - 2 * face), height: f(button.size - 2 * face),
        rx: f(TITLE_BUTTON_CORNER * button.size), fill: button.color,
      }),
      glyphOf(button)))));
};
