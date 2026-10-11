import {clampRadius} from '../../geometry';
import {ceilHalf, cornerSlots, enclosingCircle, fitMotif, fitsAt, floorHalf, slotsOffAccent, type OrnamentCorner} from '../place';
import type {OrnamentCornerId, OrnamentFrame, OrnamentLayerName, OrnamentPlacement} from '../types';

/**
 * Where the 'terminal' set (DotGridLoop, "sand terminal") puts its motifs. Pure function of the
 * frame and ornamentSize: no seed, no frame index. A survey instrument's marks on sand-coloured
 * paper, with a lot of empty space:
 *
 *   - Blocks (hero): an L of squares sitting on the TL corner, over the outline: the largest centred
 *     on the corner point, two smaller ones along each edge, getting smaller away from it.
 *     `ornamentSize` is the L's arm in px, from the corner point to the far side of the last square.
 *   - Brackets: an L hugging the TR and BL corners from outside (the `corners: brackets` look,
 *     which kit presets may not use: the harness asks `corners: "none"`).
 *   - Reticle: a ring with a cross and four arcs, just off the BR corner on its diagonal.
 *   - Rule: a hairline with ruler marks along the top edge, outside, between the blocks and the
 *     TR bracket, cut into short pieces so each fits the bleed (the pieces abut on whole px).
 *
 * Each motif keeps its anchor and takes the largest size up to its nominal that fits there (the
 * room of its slot), in 0.5 px steps of extent; a secondary below its minimum is left out. The hero
 * that does not fit at its anchor slides along the corner's diagonal (fitMotif) before giving up.
 * On a circle there are no corners to bracket: the blocks and the reticle sit on the 45° points
 * (the blocks' arms then run along the tangent).
 *
 * MOCK STAGE (2026-10-11): the anchors are simple on purpose; the owner judges the motifs at the
 * kit's size before the placement is made rigorous for every size.
 */

/** The rim every motif keeps for dark footage, in px. */
export const RIM = 1;
/** What a motif paints past its geometry: the rim and a pixel of antialiasing. */
export const TERMINAL_INK = RIM + 0.5;

/**
 * The hero's forms. MOCK LINEUP (2026-10-11, round 2): the owner asked for another hero, so four
 * forms are rendered side by side, picked by ornamentSize 30 to 33 at an arm of 30 px
 * (heroForm); every form but the chosen one goes away after the pick.
 *   - l: the round-1 L, a square on the corner point and two smaller along each edge;
 *   - chip: a full stair of squares over the corner (rows of 3, 2, 1), two small ones at the tips;
 *   - bar: five squares in a row above the top edge, from the corner inwards, filling in turn;
 *   - stack: a filled square on the corner point over a hollow one shifted out, and a small one beyond.
 */
export const HERO_FORMS = ['l', 'chip', 'bar', 'stack'] as const;
export type HeroForm = (typeof HERO_FORMS)[number];
export const heroForm = (ornamentSize: number): {form: HeroForm; arm: number} =>
  (Number.isInteger(ornamentSize) && ornamentSize >= 30 && ornamentSize <= 33
    ? {form: HERO_FORMS[ornamentSize - 30]!, arm: 30}
    : {form: 'l', arm: ornamentSize});

/** One square of the hero, from the corner point (dx, dy), its side, its step in the scan and whether it is hollow. */
export type HeroCell = {dx: number; dy: number; side: number; step: number; hollow: boolean};

const L_SIZES = [0.46, 0.31, 0.2] as const;
const L_GAP = 0.13;
/** Each L square's centre along its arm, as a share of the arm (the last one ends at 1). */
const L_STEPS = L_SIZES.map((size, index) =>
  L_SIZES.slice(0, index).reduce((sum, before, k) => sum + before / (k === 0 ? 2 : 1) + L_GAP, 0) + (index === 0 ? 0 : size / 2));

/**
 * The hero's squares for a form, an arm and the corner's outward signs (sx, sy), in drawing order.
 * `arm` is the reach along an edge from the corner point (the bar: three quarters of its length).
 */
export const heroCells = (form: HeroForm, arm: number, sx: number, sy: number): HeroCell[] => {
  const inward = (along: number, across: number) => ({dx: -sx * along, dy: -sy * across});
  if (form === 'l') {
    return L_SIZES.flatMap((size, step) => {
      const along = L_STEPS[step]! * arm;
      const cell = {side: size * arm, step, hollow: false};
      return step === 0 ? [{...inward(0, 0), ...cell}] : [{...inward(along, 0), ...cell}, {...inward(0, along), ...cell}];
    });
  }
  if (form === 'chip') {
    const pitch = arm / 3.225;
    const cells: HeroCell[] = [];
    for (let ring = 0; ring <= 2; ring++) {
      for (let i = ring; i >= 0; i--) cells.push({...inward(i * pitch, (ring - i) * pitch), side: 0.82 * pitch, step: ring, hollow: false});
    }
    cells.push({...inward(3 * pitch, 0), side: 0.45 * pitch, step: 3, hollow: false}, {...inward(0, 3 * pitch), side: 0.45 * pitch, step: 3, hollow: false});
    return cells;
  }
  if (form === 'bar') {
    const pitch = (4 / 3) * arm / 4.8;
    const side = 0.8 * pitch;
    // Above the edge (outside), its first square flush with the side edge.
    return [0, 1, 2, 3, 4].map((step) => ({dx: -sx * (side / 2 + step * pitch), dy: sy * (0.15 * arm + side / 2), side, step, hollow: step >= 3}));
  }
  const side = 0.5 * arm;
  const shift = 0.22 * arm;
  return [
    {dx: sx * shift, dy: sy * shift, side, step: 1, hollow: true},
    {dx: 0, dy: 0, side, step: 0, hollow: false},
    {dx: sx * 0.61 * arm, dy: sy * 0.61 * arm, side: 0.12 * arm, step: 2, hollow: false},
  ];
};

const heroCorners = (form: HeroForm, arm: number, sx: number, sy: number) =>
  heroCells(form, arm, sx, sy).flatMap((cell) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
    ({x: cell.dx + (u! * cell.side) / 2, y: cell.dy + (v! * cell.side) / 2})));

/** The smallest circle holding a hero's squares (and their rim), relative to the corner point. */
export const heroCircle = (form: HeroForm, arm: number, sx: number, sy: number) => {
  const circle = enclosingCircle(heroCorners(form, arm, sx, sy));
  return {dx: circle.x, dy: circle.y, extent: ceilHalf(circle.r + TERMINAL_INK)};
};

/**
 * The circle round the corner point itself: wider than the smallest one, but where a text area sits
 * inside the corner (a chat's title) it keeps further from it, so a corner may hold a larger hero.
 */
export const heroCornerCircle = (form: HeroForm, arm: number, sx: number, sy: number) =>
  ({dx: 0, dy: 0, extent: ceilHalf(Math.max(...heroCorners(form, arm, sx, sy).map((point) => Math.hypot(point.x, point.y))) + TERMINAL_INK)});

/** The smallest hero: a 2 px last square. */
export const BLOCKS_MIN_ARM = 10;

/** Brackets: arm length per px of the blocks' arm, its caps, the stroke and the gap outside the corner. */
export const BRACKET = {ratio: 0.7, min: 8, max: 20, width: 2, gap: 5} as const;
/** A bracket's extent for an arm (the L's outer corner is the farthest point from the arms' midpoint). */
export const bracketExtent = (arm: number) => ceilHalf((arm + BRACKET.width) / Math.SQRT2 + TERMINAL_INK);

/** Reticle: ring radius per px of the blocks' arm and its caps; the cross reaches 1.5 radii; the gap from the corner point to the ring. */
export const RETICLE = {ratio: 0.45, min: 5, max: 13, width: 1.5, cross: 1.45, gap: 2} as const;
export const reticleExtent = (radius: number) => ceilHalf(RETICLE.cross * radius + RETICLE.width / 2 + TERMINAL_INK);

/**
 * Rule: the hairline this far outside the outline, its marks every `pitch` px (a long one every
 * `majorEvery`), pointing at the panel; at most `length` px from the blocks (empty space after it), in
 * pieces of at most `piece` px, kept `clear` px from the corner motifs.
 */
export const RULE = {offset: 9, width: 1, minor: 4, major: 7, pitch: 6, majorEvery: 5, length: 150, piece: 24, clear: 6} as const;
/** One period of the marks: a long one and the short ones up to the next. */
export const RULE_PERIOD = RULE.pitch * RULE.majorEvery;
/** A piece's extent: half its length and half the marks' span, round the piece's centre. */
export const ruleExtent = (length: number) => ceilHalf(Math.hypot(length / 2, RULE.major / 2) + TERMINAL_INK);

const SLOT_SIGNS: Record<OrnamentCornerId, readonly [number, number]> = {TL: [-1, -1], TR: [1, -1], BR: [1, 1], BL: [-1, 1]};
export const slotSigns = (slot: OrnamentCornerId) => SLOT_SIGNS[slot];

const cornerOf = (corners: readonly OrnamentCorner[], slot: OrnamentCornerId) => corners.find((corner) => corner.slot === slot);

/**
 * The largest size from `nominal` down to `min` (0.5 px steps) whose circle, at the anchor the
 * geometry gives for that size, fits on `layer`; null when none does.
 */
const fitAnchored = (
  frame: OrnamentFrame, layer: OrnamentLayerName, nominal: number, min: number,
  geometry: (size: number) => readonly {x: number; y: number; extent: number}[],
) => {
  for (let size = floorHalf(nominal); size >= min - 1e-9; size -= 0.5) {
    const spot = geometry(size).find((candidate) => fitsAt(frame, candidate.x, candidate.y, candidate.extent, layer));
    if (spot) return {...spot, size};
  }
  return null;
};

/** The hero on the TL corner point (the first corner of TL, TR, BR, BL that holds it), else slid along its diagonal. */
const placeBlocks = (frame: OrnamentFrame, ornamentSize: number): OrnamentPlacement | null => {
  const {form, arm} = heroForm(ornamentSize);
  const corners = slotsOffAccent(frame);
  for (const slot of ['TL', 'TR', 'BR', 'BL'] as const) {
    const corner = cornerOf(corners, slot);
    if (!corner) continue;
    const [sx, sy] = slotSigns(slot);
    const motif = `blocks-${form}`;
    const anchored = fitAnchored(frame, 'front', arm, BLOCKS_MIN_ARM, (size) => [heroCircle, heroCornerCircle].map((circleOf) => {
      const circle = circleOf(form, size, sx, sy);
      return {x: corner.x + circle.dx, y: corner.y + circle.dy, extent: circle.extent};
    }));
    if (anchored) return {motif, slot, layer: 'front', ...anchored};
    // Slid along the diagonal: the largest arm whose circle fits the slot's room.
    const reach = (size: number) => heroCircle(form, size, sx, sy).extent;
    const fit = fitMotif(frame, corner, {motif, layer: 'front', nominal: reach(arm), min: reach(BLOCKS_MIN_ARM), hero: true});
    if (!fit) continue;
    let size = floorHalf(arm);
    while (size > BLOCKS_MIN_ARM && reach(size) > fit.extent + 1e-9) size -= 0.5;
    return {...fit, size};
  }
  return null;
};

/** A bracket's L: its vertex BRACKET.gap px outside the corner on both axes, the arms along the edges. */
const placeBracket = (frame: OrnamentFrame, corner: OrnamentCorner, span: number): OrnamentPlacement | null => {
  const [sx, sy] = slotSigns(corner.slot as OrnamentCornerId);
  const radius = clampRadius(frame.outline.radius, frame.outline.width, frame.outline.height);
  // The outline's corner (the box corner of a rounded outline), not the arc's middle.
  const vx = corner.x + sx * (radius * (1 - Math.SQRT1_2) + BRACKET.gap);
  const vy = corner.y + sy * (radius * (1 - Math.SQRT1_2) + BRACKET.gap);
  const arm = Math.min(BRACKET.max, BRACKET.ratio * span);
  const fit = fitAnchored(frame, 'front', arm, BRACKET.min, (size) => [{
    x: vx - sx * size / 2, y: vy - sy * size / 2, extent: bracketExtent(size),
  }]);
  return fit ? {motif: 'bracket', slot: corner.slot, layer: 'front', ...fit} : null;
};

/** The reticle on the corner's outward diagonal, its ring RETICLE.gap px from the corner point. */
const placeReticle = (frame: OrnamentFrame, corner: OrnamentCorner, span: number): OrnamentPlacement | null => {
  const radius = Math.min(RETICLE.max, RETICLE.ratio * span);
  if (radius < RETICLE.min - 1e-9) return null;
  const fit = fitAnchored(frame, 'front', radius, RETICLE.min, (size) => {
    const t = size + RETICLE.gap;
    return [{x: corner.x + t * corner.dx, y: corner.y + t * corner.dy, extent: reticleExtent(size)}];
  });
  return fit ? {motif: 'reticle', slot: corner.slot, layer: 'front', ...fit} : null;
};

/**
 * The rule along the top edge, outside: from past the motifs near the top left, RULE.length px or up
 * to the motifs near the top right, in pieces of at most RULE.piece px that abut on whole px. All or nothing: a rule
 * with a piece missing would read as broken.
 */
const placeRule = (frame: OrnamentFrame, taken: readonly OrnamentPlacement[]): OrnamentPlacement[] => {
  const {x, y, width} = frame.outline;
  // On a pixel row's middle, so the 1 px hairline is crisp rather than two grey rows.
  const line = Math.round(y - RULE.offset) + RULE.width / 2;
  const centreY = line + RULE.major / 2;
  const left = taken.filter((placement) => placement.x < x + width / 2 && Math.abs(placement.y - y) < placement.extent + RULE.offset + RULE.clear);
  const right = taken.filter((placement) => placement.x >= x + width / 2 && Math.abs(placement.y - y) < placement.extent + RULE.offset + RULE.clear);
  const from = Math.ceil(Math.max(x, ...left.map((placement) => placement.x + placement.extent + RULE.clear)));
  const to = Math.floor(Math.min(x + width, from + RULE.length, ...right.map((placement) => placement.x - placement.extent - RULE.clear)));
  if (to - from < 2 * RULE_PERIOD) return [];
  const count = Math.ceil((to - from) / RULE.piece);
  const pieces: OrnamentPlacement[] = [];
  for (let index = 0; index < count; index++) {
    const a = Math.round(from + ((to - from) * index) / count);
    const b = Math.round(from + ((to - from) * (index + 1)) / count);
    const extent = ruleExtent(b - a);
    const cx = (a + b) / 2;
    if (!fitsAt(frame, cx, centreY, extent, 'front')) return [];
    // `size` carries the piece's length; the run's start and end ride on the first and last piece's slot.
    pieces.push({motif: index === 0 ? 'rule-start' : 'rule', slot: 'top', layer: 'front', x: cx, y: centreY, extent, size: b - a});
  }
  return pieces;
};

/** Every motif of the set on this frame, hero first; [] when the blocks fit nowhere. */
export const placeTerminal = (frame: OrnamentFrame, span: number): OrnamentPlacement[] => {
  const hero = placeBlocks(frame, span);
  if (!hero) return [];
  // The secondaries follow the hero's arm (the lineup's ornamentSize 31 to 33 still means 30).
  const {arm} = heroForm(span);
  const placed: OrnamentPlacement[] = [hero];
  const corners = slotsOffAccent(frame);
  const across = {TL: 'BR', TR: 'BL', BR: 'TL', BL: 'TR'} as const;
  const reticleCorner = cornerOf(corners, across[hero.slot as OrnamentCornerId]);
  if (!frame.circle) {
    for (const slot of ['TR', 'BL'] as const) {
      const corner = cornerOf(cornerSlots(frame), slot);
      if (!corner || slot === hero.slot) continue;
      const bracket = placeBracket(frame, corner, arm);
      if (bracket) placed.push(bracket);
    }
  }
  if (reticleCorner) {
    const reticle = placeReticle(frame, reticleCorner, arm);
    if (reticle) placed.push(reticle);
  }
  if (!frame.circle && frame.fit !== 'screen') placed.push(...placeRule(frame, placed));
  return placed;
};
