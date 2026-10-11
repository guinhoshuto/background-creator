import {Cloud, Heart, Star} from '../../../../backgrounds/kawaii/KawaiiArtwork';
import {TAU} from '../../../../loop';
import {svgNumber} from '../../geometry';
import {MAX_CONTENT_OPACITY} from '../../legibility';
import {cycleOf} from '../../motion';
import {ornamentPalette, ornamentPartId, RadialLight} from '../draw';
import {harmonics, meetsKeepOut, ornamentRandom} from '../place';
import type {OrnamentBase, OrnamentSet} from '../types';
import {
  CLOUD_BOB, CLOUD_BREATH, CLOUD_UNITS, cloudLit, cloudReach, GLINT, HEART_BOB, heartReach, INK, placeCloud, TWINKLE_GLOW, TWINKLE_MIN_EXTENT,
  twinkleReach,
} from './cloud-place';

/**
 * The 'cloud' ornaments (KawaiiLoop, "pastel constellation", the pastel-cloud kit): the
 * background's cloud sitting on the top edge, half behind it, a gummy heart beside it, a flat
 * second cloud near the other top corner, a hollow heart on the BR corner, the background's
 * four-needle twinkles along the edges and, on circles, a soap-bubble glint along the ring; in the
 * kit's palette (ornamentColors: [0] lilac, the hearts and the twinkles' glow; [1] baby blue, the
 * second cloud and the twinkles; [2] pink, the hero cloud and the hollow heart) and the
 * background's rhythms at 12 s (the float and the tilt once per loop, the breath twice, the gloss
 * and the twinkles on their own whole harmonics). Placement and sizes: cloud-place.ts
 * (ornamentSize = the hero cloud's width).
 *
 * Every field is a whole-harmonic sinusoid of the loop, so the seam never jumps; the drawing itself
 * is the background's Cloud, Heart and Star (variant 1, the twinkle), unchanged.
 */

/** The background's rhythms, in Hz (its loop is 12 s): the loop itself and the breath, twice per loop. */
const HZ = {cycle: 1 / 12, breath: 2 / 12} as const;

/** The background's middle plane: its gloss, swinging ±14% on the group's harmonic. */
const GLOSS = 0.62;
const GLOSS_SWING = 0.14;
/** The cloud's tilt, ± degrees once per loop (the background's 2.4 × parallax). */
const CLOUD_TILT = 2.4;
/** The hearts lean like the background's (a hand-set tilt) and rock by this many degrees. */
const HEART_LEAN = -8;
const HEART_ROCK = 3;
/** Twinkles: 0.62 + 0.38·cos(k·φ + ψ), |ψ| ≤ 0.6, so frame 0 is ≥ 0.93 (the pack's PNG shows them lit); they turn ±14°. */
const TWINKLE_MEAN = 0.62;
const TWINKLE_SWING = 0.38;
const TWINKLE_PHASE = 1.2;
const TWINKLE_TURN = 14;
const TWINKLE_LIGHT_ALPHA = 0.5;
/** The glint breathes once per loop, brightest at frame 0. */
const GLINT_MEAN = 0.72;
const GLINT_SWING = 0.2;

type PuffElement = OrnamentBase & {
  type: 'cloud-puff'; width: number; scale: number; squashX: number; squashY: number; rotation: number; variant: number; gloss: number; color: string;
};
type HeartElement = OrnamentBase & {
  type: 'cloud-heart'; size: number; rotation: number; hollow: number; gloss: number; color: string;
};
type TwinkleElement = OrnamentBase & {
  type: 'cloud-twinkle'; size: number; rotation: number; gloss: number; color: string; glowColor: string;
};
type GlintElement = OrnamentBase & {
  type: 'cloud-glint'; ringX: number; ringY: number; ringRadius: number; angle: number; span: number; width: number; color: string;
};
type CloudOrnamentElement = PuffElement | HeartElement | TwinkleElement | GlintElement;

const CLOUD_VARIANT: Readonly<Record<string, number>> = {cloud: 0, 'cloud-flat': 1, 'cloud-round': 2};

const set: OrnamentSet<CloudOrnamentElement> = {
  name: 'cloud',
  seedOffset: 100,
  minExtent: TWINKLE_MIN_EXTENT,
  place(frame, style) {
    return placeCloud(frame, style.ornamentSize);
  },
  build(frame, placements, style, frameIndex, durationInFrames) {
    const random = ornamentRandom(style.seed, set);
    const angle = TAU * cycleOf(frameIndex, durationInFrames);
    const loop = harmonics(HZ.cycle, style.durationSeconds);
    const breath = harmonics(HZ.breath, style.durationSeconds);
    const lit = cloudLit(frame);
    const {cool, light, warm} = ornamentPalette(style);
    let twinkle = 0;
    return placements.map((placement, anchor): CloudOrnamentElement => {
      // Every element draws its phases, used or not, so one motif never shifts another's.
      const phase = random() * TAU;
      const second = random() * TAU;
      const jitter = random() - 0.5;
      // The gloss and the twinkles shimmer on their own whole harmonic, as each background group does.
      const harmonic = (2 + (anchor % 4)) * loop;
      const base = {layer: placement.layer, anchor, opacity: 1, x: placement.x, y: placement.y, light: 0, lightOpacity: 0};
      if (placement.motif in CLOUD_VARIANT) {
        const variant = CLOUD_VARIANT[placement.motif]!;
        const width = placement.size;
        const squash = CLOUD_BREATH * Math.sin(breath * angle + phase);
        return {
          ...base, type: 'cloud-puff',
          x: placement.x + CLOUD_BOB.x * width * Math.cos(loop * angle + phase),
          y: placement.y + CLOUD_BOB.y * width * Math.sin(loop * angle + phase),
          reach: cloudReach(width, variant), width, scale: width / CLOUD_UNITS[variant]!.width, squashX: 1 + squash, squashY: 1 - squash,
          rotation: CLOUD_TILT * Math.sin(loop * angle + phase), variant,
          gloss: GLOSS * (1 - GLOSS_SWING + GLOSS_SWING * Math.cos(harmonic * angle + second)),
          color: placement.motif === 'cloud-flat' ? light : warm,
        };
      }
      if (placement.motif === 'heart' || placement.motif === 'heart-hollow') {
        const hollow = placement.motif === 'heart-hollow';
        const size = placement.size;
        return {
          ...base, type: 'cloud-heart',
          x: placement.x + HEART_BOB * size * Math.cos(loop * angle + phase),
          y: placement.y + HEART_BOB * size * Math.sin(loop * angle + phase),
          reach: heartReach(size, hollow), size, hollow: hollow ? 1 : 0,
          rotation: (hollow ? -HEART_LEAN : HEART_LEAN) + 4 * jitter + HEART_ROCK * Math.sin(loop * angle + second),
          gloss: GLOSS * (1 - GLOSS_SWING + GLOSS_SWING * Math.cos(harmonic * angle + second)),
          color: hollow ? warm : cool,
        };
      }
      if (placement.motif === 'glint') {
        const ringX = frame.outline.x + frame.outline.width / 2;
        const ringY = frame.outline.y + frame.outline.height / 2;
        const ringRadius = Math.hypot(placement.x - ringX, placement.y - ringY);
        return {
          ...base, type: 'cloud-glint', reach: placement.size / 2 + GLINT.width / 2 + INK,
          opacity: GLINT_MEAN + GLINT_SWING * Math.cos(loop * angle + 0.4 * jitter),
          ringX, ringY, ringRadius, angle: Math.atan2(placement.y - ringY, placement.x - ringX),
          span: ringRadius > 0 ? placement.size / ringRadius : 0, width: GLINT.width, color: '#FFFFFF',
        };
      }
      // Twinkles: every other one twice per loop; frame 0 is near full brightness.
      const k = (twinkle++ % 2 === 0 ? 1 : 2) * loop;
      const shine = TWINKLE_MEAN + TWINKLE_SWING * Math.cos(k * angle + TWINKLE_PHASE * jitter);
      const size = placement.size;
      const lightRadius = lit ? Math.min(placement.extent, TWINKLE_GLOW * size) : 0;
      // A front light over a text area stays under the legibility cap, for its whole motion.
      const cap = meetsKeepOut(frame, placement.x, placement.y, placement.extent) ? MAX_CONTENT_OPACITY : 1;
      return {
        ...base, type: 'cloud-twinkle', reach: twinkleReach(size), light: lightRadius,
        lightOpacity: lightRadius > 0 ? Math.min(cap, TWINKLE_LIGHT_ALPHA * shine) : 0,
        opacity: shine, size, rotation: TWINKLE_TURN * Math.sin(loop * angle + phase), gloss: GLOSS,
        color: twinkle % 2 === 1 ? light : warm, glowColor: cool,
      };
    });
  },
  render(element, key, context) {
    if (element.type === 'cloud-puff') return <CloudPuff key={key} element={element} id={ornamentPartId(context, key, 'puff')} />;
    if (element.type === 'cloud-heart') return <CloudHeart key={key} element={element} id={ornamentPartId(context, key, 'heart')} />;
    if (element.type === 'cloud-glint') return <CloudGlint key={key} element={element} />;
    return <CloudTwinkle key={key} element={element} id={ornamentPartId(context, key, 'twinkle')} />;
  },
};

/** Numbers rounded as the paths' (svgNumber), so the background's drawings print short, stable markup here. */
const round = (value: number) => Number(svgNumber(value));

/** The background's cloud, small: flat pastel plate, the off-register belly, the lune and the filet of light. */
const CloudPuff = ({element, id}: {element: PuffElement; id: string}) => (
  <Cloud x={round(element.x)} y={round(element.y)} scale={round(element.scale)} squashX={round(element.squashX)} squashY={round(element.squashY)}
    rotation={round(element.rotation)} opacity={round(element.opacity)} variant={element.variant} color={element.color} gloss={round(element.gloss)} id={id} />
);

/** The background's gummy heart, filled or hollow. */
const CloudHeart = ({element, id}: {element: HeartElement; id: string}) => (
  <Heart x={round(element.x)} y={round(element.y)} size={round(element.size)} rotation={round(element.rotation)} opacity={round(element.opacity)}
    variant={element.hollow} color={element.color} gloss={round(element.gloss)} id={id} />
);

/** The background's four-needle twinkle (Star variant 1), over its soft glow. */
const CloudTwinkle = ({element, id}: {element: TwinkleElement; id: string}) => (
  <g>
    <RadialLight id={`${id}-light`} x={element.x} y={element.y} radius={element.light} color={element.glowColor} opacity={element.lightOpacity}
      falloff={0.4} mid={0.35} />
    <Star x={round(element.x)} y={round(element.y)} size={round(element.size)} rotation={round(element.rotation)} opacity={round(element.opacity)}
      variant={1} color={element.color} gloss={element.gloss} id={id} />
  </g>
);

/** The bubble's glint: a white arc along the ring, round at both ends. */
const CloudGlint = ({element}: {element: GlintElement}) => {
  const n = svgNumber;
  const {ringX, ringY, ringRadius: r, angle, span} = element;
  const from = angle - span / 2;
  const to = angle + span / 2;
  const d = `M${n(ringX + r * Math.cos(from))} ${n(ringY + r * Math.sin(from))}A${n(r)} ${n(r)} 0 0 1 ${n(ringX + r * Math.cos(to))} ${n(ringY + r * Math.sin(to))}`;
  return <path d={d} fill="none" stroke={element.color} strokeWidth={n(element.width)} strokeLinecap="round" opacity={n(element.opacity)} />;
};

export const cloudSet: OrnamentSet = set;
