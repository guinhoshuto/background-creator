/**
 * The corridor beyond the great archway, laid out in centimetres and seen through the hall's one
 * camera: x runs from the centre line (negative to the left), h rises from the floor and d is the
 * depth beyond the face of the back wall. The corridor keeps the archway's Tudor section, so its
 * walls stand at x = ±ARCH.half, its vault springs at ARCH.spring, and it runs from the far face
 * of the arch's reveal to an end wall about 11 m further on. A pointed door in that wall opens
 * onto a stair hall: its floor, the foot of a stair and whoever stands there.
 *
 * Nothing here moves: the corridor is part of the static architecture behind the title. Props
 * stand on its floor at real sizes and are drawn in the same perspective as the hall. No
 * components here, so the artwork and the tests read the same numbers.
 */
import {interpolateColors} from 'remotion';
import {ARCH, BACK_Z, DATUM, FOCAL, HALL, project, type Point, tudorArch} from './hauntedInteriorGeometry';

/** The corridor, in cm: half its width, where it starts (the reveal's far face) and its end wall. */
export const CORRIDOR = {half: ARCH.half, spring: ARCH.spring, start: ARCH.depth, end: 1150} as const;
/** The camera's eye, in cm above the floor. */
export const EYE = HALL.eye * 100;

/** Screen point of a point of the corridor, in cm (x, h, d). */
export const at = (x: number, h: number, d: number): Point => project(x / 100, h / 100, BACK_Z + d / 100);
/** Pixels per centimetre of anything facing the camera at depth d. */
export const pxPerCm = (d: number) => FOCAL / (BACK_Z + d / 100) / 100;

/** The corridor's section (the archway's Tudor outline), cm, y up; `grow` offsets it outwards. */
export const corridorSection = (grow = 0, bottom = 0): Point[] => tudorArch(0, bottom, ARCH, grow);
/** The vault's curve alone, from the left springer to the right one. */
export const vaultCurve = (grow = 0): Point[] => corridorSection(grow).slice(1, -1);

/**
 * How much of a surface at depth d is lost to the corridor's gloom: 0 at the archway, a little over
 * a half at the end wall. The artwork builds its depth fog from this curve.
 */
export const gloomAt = (d: number) => 0.66 * (1 - Math.exp(-Math.max(0, d - CORRIDOR.start) / 480));
/** The share of a light at depth d that reaches the archway through the gloom. */
export const transmittance = (d: number) => 1 - gloomAt(d);

/* ---------------------------------------------------------------------------------------------
 * Light. The corridor is tuned at the composition's default intensities and palette; it dims with
 * lower intensities (candleIntensity, moonlightIntensity) and with paler lights, and never grows
 * brighter than that, so the title band keeps its margin whatever the props. All of it is fixed
 * per render: nothing here reads the frame.
 * ------------------------------------------------------------------------------------------- */

/** Intensities and colours the corridor's lights are tuned at (the composition's defaults). */
export const LIGHT_REFERENCE = {candle: 0.8, moonlight: 0.65, candleColor: '#CA8A48', moonlightColor: '#A8BDB0'} as const;

/**
 * A CSS colour in rgba() form: Remotion's own parser reads every form the palette accepts (hex with
 * or without alpha, named colours, rgb(), hsl(), oklch() and the rest); undefined if it cannot.
 */
const normalizeColor = (color: string) => {
  try {
    return interpolateColors(0, [0, 1], [color, color]);
  } catch {
    return undefined;
  }
};

/** Luma (0–255) of any CSS colour Remotion can read, its alpha ignored; undefined for anything else. */
export const lumaOf = (color: string): number | undefined => {
  const rgba = normalizeColor(color.trim());
  const fn = rgba && /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(rgba);
  if (!fn) return undefined;
  const [r, g, b] = [fn[1], fn[2], fn[3]].map(Number);
  if (![r, g, b].every((value) => Number.isFinite(value))) return undefined;
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

/**
 * What the corridor multiplies one family of its lights by: the intensity against the one it is
 * tuned at, and a paler colour held to the luma of the tuned one. Both only ever dim.
 */
export const lightScale = (intensity: number, reference: number, color: string, referenceColor: string) => {
  const luma = lumaOf(color);
  const tone = luma && luma > 0 ? Math.min(1, lumaOf(referenceColor)! / luma) : 1;
  return Math.max(0, Math.min(1, intensity / reference)) * tone;
};

/**
 * How the corridor's lights keep off the title. Inside TITLE_ZONE a light stands at least
 * `clearance` px from the vertical axis for each unit of its transmittance, or it is faint: its
 * strongest opacity, times its transmittance, is at most `faint`. Warm light keeps out of the
 * middle half of the band altogether; cold light may cross it only faintly.
 */
export const TITLE_LIGHT_RULE = {clearance: 250, faint: 0.14} as const;

/** The hall's datum lines run on along the corridor's walls and across its end wall (cm): skirting, wainscot, rail. */
export const WAINSCOT = {base: DATUM.base, top: DATUM.wainscot, rail: DATUM.cap, cornice: 290} as const;

/* ---------------------------------------------------------------------------------------------
 * Layout. Every prop is described in the corridor's own centimetres; the tests read the same
 * numbers to check that each one stands on the floor, inside the corridor and clear of the others.
 * ------------------------------------------------------------------------------------------- */

/** Transverse ribs of the vault: depth of each front face, width along the corridor, and the corbel. */
export const RIBS = {depths: [300, 530, 760, 990], width: 20, drop: 12, corbel: 288} as const;

/**
 * The runner down the middle of the floorboards: half width, near and far ends, border inset. It
 * starts on the threshold of the archway, inside its reveal, so the hall's floor leads onto it.
 */
export const RUNNER = {half: 78, d0: 8, d1: 1070, border: 9} as const;

/** A console table against the left wall, where someone still lights a candle; its front legs stand `legs` cm in from its front. */
export const CONSOLE = {x0: -305, x1: -261, d0: 100, d1: 228, height: 82, legs: 3} as const;
/** A three-light candelabrum on the console (cm): base, stem to the arms, arm reach, candles. */
export const CANDELABRUM = {x: -283, d: 172, stem: 27, arm: 11, candle: 13, outerDrop: 4} as const;
/** The flame stands this far over its wick, and its halo reaches this far out (cm). */
export const FLAME = {tip: 6.2, halo: 14} as const;
/** Wick of each candle, in cm (x, h, d): the brightest points of the corridor, kept low, their halos under the title band. */
export const CANDELABRUM_WICKS: readonly (readonly [number, number, number])[] = [-1, 0, 1].map((side) => [
  CANDELABRUM.x + side * CANDELABRUM.arm,
  CONSOLE.height + CANDELABRUM.stem + CANDELABRUM.candle - (side ? CANDELABRUM.outerDrop : 0),
  CANDELABRUM.d,
] as const);
/** A vase of dead roses at the near end of the console. */
export const VASE = {x: -287, d: 122, height: 21, stems: 30} as const;
/** A mirror above the console, hung flat on the wall (cm along the wall and above the floor). */
export const MIRROR = {d0: 106, d1: 210, h0: 148, h1: 236} as const;
/** A longcase clock beside the console, stopped: footprint against the left wall, height, and how far its plinth stands proud. */
export const CLOCK = {x0: -305, x1: -277, d0: 252, d1: 302, height: 214, dial: 176, plinth: 2} as const;

/**
 * Doors along the corridor, each in a moulded architrave. `ajar` is the angle, in degrees, a leaf
 * hinged on the far jamb swings out into the corridor; the one on the right stands open onto a
 * moonlit room. Its leaf hides the right wall behind it for several metres, so the far door on
 * that side stands beyond the leaf's free edge, where both its jambs show.
 */
export type CorridorDoor = {side: -1 | 1; d0: number; d1: number; height: number; ajar: number};
export const DOORS: readonly CorridorDoor[] = [
  {side: 1, d0: 352, d1: 456, height: 228, ajar: 56},
  {side: -1, d0: 470, d1: 574, height: 228, ajar: 0},
  {side: -1, d0: 880, d1: 980, height: 228, ajar: 0},
  {side: 1, d0: 970, d1: 1070, height: 228, ajar: 0},
];
/** Architrave width and projection, the cornice head over it, and the depth of the reveal (cm). */
export const DOOR_FRAME = {width: 12, projection: 3, head: 14, reveal: 22, leaf: 5} as const;
/**
 * The leaf of a door standing open, in plan (cm): hinged on the far jamb and swung `ajar` degrees
 * out into the corridor, towards the camera. `dir` runs along the leaf from the hinge to its free edge.
 */
export const openLeaf = (door: CorridorDoor) => {
  const angle = (door.ajar * Math.PI) / 180;
  const hinge = {x: door.side * (CORRIDOR.half - 2), d: door.d1 - 2};
  const width = door.d1 - door.d0;
  const dir = {x: -door.side * Math.sin(angle), d: -Math.cos(angle)};
  return {hinge, dir, width, height: door.height - 3, free: {x: hinge.x + dir.x * width, d: hinge.d + dir.d * width}};
};

/**
 * Unlit iron sconces on the walls, their candles burnt down (h is the drip pan): one on the left
 * between the doors, one on the right in the near bay, over the armchair and short of the open
 * door, whose leaf hides the wall behind it, and one on the right past the far door.
 */
export const SCONCES: readonly {side: -1 | 1; d: number; h: number}[] = [
  {side: -1, d: 700, h: 176},
  {side: 1, d: 262, h: 176},
  {side: 1, d: 1115, h: 176},
];
/** How far a sconce reaches out of the wall, in cm. */
export const SCONCE_REACH = 17;

/** An armchair under a dust sheet, its back to the right wall: footprint and heights (cm). */
export const ARMCHAIR = {x0: 206, x1: 302, d0: 116, d1: 206, back: 104, arm: 66, seat: 44} as const;
/**
 * A cheval mirror under a dust sheet against the left wall, in the far corner past the last door,
 * so it hides neither that door nor the sconce: the stand shows under the hem, its feet reaching
 * `feet` cm beyond the sheet each way.
 */
export const SHROUD = {x0: -303, x1: -231, d0: 1060, d1: 1102, height: 174, feet: 10} as const;
/** A low chest under a sheet against the right wall, before the far door. */
export const CHEST = {x0: 232, x1: 302, d0: 690, d1: 800, height: 58} as const;

/** The doorway in the end wall (a pointed arch, cm) and the depth of its reveal. */
export const END_DOOR = {half: 58, spring: 184, c: 30, reveal: 30} as const;
/**
 * Beyond it, a stair hall: its floor, then a stair climbing straight on into the dark (going and
 * rise of each step, cm). Moonlight from a window out of sight lies on the floor and on the front
 * of the first `lit` treads; the risers, and the steps above, stay in shadow.
 */
export const STAIR = {foot: 1352, going: 28, rise: 18, steps: 7, lit: 3, half: 110} as const;
/** The moonlight on the stair hall's floor, under her feet (cm across and in depth). */
export const MOON_FLOOR = {x0: -34, x1: 96, d0: CORRIDOR.end + END_DOOR.reveal + 34, d1: STAIR.foot - 2} as const;
/**
 * The pale figure at the foot of the stair, off the axis: the right jamb of the end door hides her
 * right shoulder, and the mirror over the console shows her too.
 */
export const FIGURE = {x: 50, d: 1305, height: 162, shoulders: 19, hem: 25} as const;
/** The strongest opacity of her pale body and of her face, in the moonlight's colour. */
export const FIGURE_LIGHT = {body: 0.22, aura: 0.07, face: 0.1} as const;

/**
 * Bare footprints in the dust on the runner, left and right, toes towards the camera: from where
 * she stepped onto its far end, out of the end door, all the way to the archway's threshold.
 */
export const FOOTPRINTS: readonly (readonly [number, number])[] = Array.from({length: 17}, (_, i) => {
  const d = 30 + i * 63.5 + (i % 3) * 4;
  const drift = Math.sin(i * 0.9) * 6 - 4;
  return [(i % 2 ? 11 : -11) + drift, d] as const;
});
/**
 * A bare foot's print, in cm across (px, the inner side of a right foot negative) and along (pd,
 * toes negative): the sole from the ball to the heel, pinched at the arch, and the toes ahead of it
 * as small pads, the big toe on the inner side.
 */
export const FOOT_OUTLINE: readonly (readonly [number, number])[] = [
  [0.2, -10.8], [2.6, -10.4], [4.2, -8.6], [4.8, -5.6], [4.6, -2.4], [3.8, 0.6], [3.4, 3.8], [3.6, 7.4], [3, 10.6], [1.2, 12.6],
  [-1, 12.6], [-2.6, 10.8], [-3, 7.6], [-2.2, 4.4], [-1.4, 1.4], [-2, -1.8], [-3.4, -5.2], [-4, -8.2], [-3.2, -10.2], [-1.6, -11],
];
/** The toe pads of the same right foot: centre (px, pd) and radii across and along, in cm. */
export const FOOT_TOES: readonly (readonly [number, number, number, number])[] = [
  [-2.4, -13.2, 1.6, 1.3], [0.3, -13.3, 0.95, 0.8], [2, -12.8, 0.85, 0.75], [3.4, -12, 0.75, 0.7], [4.5, -10.9, 0.65, 0.6],
];

/**
 * Every free-standing prop, as a box in the corridor's centimetres: x0..x1 across, h0..h1 up and
 * d0..d1 in depth, and `foot`, the depth of its nearest point on the floor. The tests project these
 * to check the floor, the walls and the arch opening.
 */
export type PropBox = {name: string; x0: number; x1: number; h0: number; h1: number; d0: number; d1: number; foot: number};
export const PROP_BOXES: readonly PropBox[] = [
  {name: 'console', x0: CONSOLE.x0, x1: CONSOLE.x1, h0: 0, h1: CONSOLE.height, d0: CONSOLE.d0, d1: CONSOLE.d1, foot: CONSOLE.d0 + CONSOLE.legs},
  {
    name: 'clock', x0: CLOCK.x0, x1: CLOCK.x1 + CLOCK.plinth, h0: 0, h1: CLOCK.height + 15,
    d0: CLOCK.d0 - CLOCK.plinth, d1: CLOCK.d1 + CLOCK.plinth, foot: CLOCK.d0 - CLOCK.plinth,
  },
  {name: 'armchair', x0: ARMCHAIR.x0, x1: ARMCHAIR.x1, h0: 0, h1: ARMCHAIR.back, d0: ARMCHAIR.d0, d1: ARMCHAIR.d1, foot: ARMCHAIR.d0},
  {
    name: 'shroud', x0: SHROUD.x0, x1: SHROUD.x1, h0: 0, h1: SHROUD.height,
    d0: SHROUD.d0 - SHROUD.feet, d1: SHROUD.d1 + SHROUD.feet, foot: SHROUD.d0 - SHROUD.feet,
  },
  {name: 'chest', x0: CHEST.x0, x1: CHEST.x1, h0: 0, h1: CHEST.height, d0: CHEST.d0, d1: CHEST.d1, foot: CHEST.d0},
];
