import {zColor} from '@remotion/zod-types';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {TAU, loopPhase} from '../loop';
import {baseBackgroundSchema, hasAlpha} from '../settings';
import {Canvas} from './Canvas';
import {buildY2KLayout} from './y2k/layout';
import {bloomGradient, plateGradient, shadowFilter} from './y2k/plate';
import {SPRITE_LOOP, missingSpriteMessage, spriteClock, spriteFile, spriteFrameIndex, type Y2KSprites} from './y2k/sprites';

export const WIDTH = 1920;
export const HEIGHT = 1080;

const y2kLayerSchema = z.object({
  asset: z.string().regex(/^[a-z0-9-]+$/, 'Use the sprite folder name: lowercase letters, digits and hyphens.')
    .describe('Sprite folder in public/sprites/y2k/, as named in sprites.json'),
  x: z.number().finite().min(-480).max(2400).describe('Centre, px from the left edge'),
  y: z.number().finite().min(-480).max(1560).describe('Centre, px from the top edge'),
  size: z.number().int().min(16).max(1200).describe('Side of the square sprite, in px'),
  blur: z.number().finite().min(0).max(24).describe('Depth blur in px (Gaussian sigma): far pieces are soft; 0 keeps the sprite sharp').default(0),
  shadow: z.boolean().describe('Tinted drop shadow under the sprite').default(false),
  phase: z.number().int().min(0).max(SPRITE_LOOP - 1).describe('Frames added to the clock: offsets both the sprite cycle and the float').default(0),
  floatPx: z.number().finite().min(0).max(80).describe('Float amplitude, in px up and down').default(0),
  floatCycles: z.number().int().min(0).max(8).describe('Whole float cycles per loop; 0 holds the sprite still').default(1),
});

// Blender sprites (public/sprites/y2k/, from `npm run blender:sprites -- y2k`) floating over a
// pastel plate drawn in CSS. No shared palette and no seed: the plate has its own colours, and the
// layout spells out every position and phase.
export const y2kLoopSchema = baseBackgroundSchema.omit({colors: true, seed: true}).extend({
  backgroundColor: baseBackgroundSchema.shape.backgroundColor.default('#C9A8F0'),
  plateColors: z.array(zColor()).min(2).max(4).default(['#A9D6FF', '#C9A8F0', '#FF8EC4']),
  plateAngle: z.number().finite().min(-180).max(180)
    .describe('Turn of the plate gradient, in degrees clockwise: 0 runs top to bottom, -35 from the top left to the bottom right')
    .default(-35),
  bloom: z.number().finite().min(0).max(1).describe('Opacity of the white bloom at its centre; 0 turns it off').default(0.4),
  bloomX: z.number().finite().min(0).max(1).describe('Bloom centre, as a share of the width').default(0.38),
  bloomY: z.number().finite().min(0).max(1).describe('Bloom centre, as a share of the height').default(0.52),
  bloomRadius: z.number().finite().min(0.05).max(2).describe('Bloom radius, as a share of the height').default(0.62),
  shadowColor: zColor().regex(/^#[0-9a-f]{6}$/i, 'Use an opaque color in the #RRGGBB format.').default('#5A3A7A'),
  shadowOpacity: z.number().finite().min(0).max(1).describe('Opacity of the tinted drop shadows').default(0.34),
  layout: z.array(y2kLayerSchema).min(1).max(48)
    .describe('Sprites in paint order, back to front: asset, centre and size in px of the 1920×1080 frame, depth blur, shadow and float')
    .default(() => buildY2KLayout()),
});

export type Y2KLoopProps = z.infer<typeof y2kLoopSchema>;
/** What the component renders with: calculateMetadata (Root.tsx) adds each asset's manifest. */
export type Y2KLoopRenderProps = Y2KLoopProps & {sprites?: Y2KSprites};

export type Y2KPlacedSprite = {key: string; asset: string; file: string; left: number; top: number; size: number; filter?: string};

/**
 * Every sprite at frame f of a loop N frames long, in paint order. The float is
 * floatPx·sin(2π·floatCycles·f/N + 2π·phase/480) with whole cycles, so frame N is frame 0 at the
 * same speed; the sprite shows file (clock + phase) % period (src/backgrounds/y2k/sprites.ts).
 */
export const getY2KScene = (props: Y2KLoopRenderProps, frame: number, durationInFrames: number): Y2KPlacedSprite[] => {
  const clock = spriteClock(frame, durationInFrames);
  const sprites = props.sprites ?? {};
  return props.layout.map((layer, index) => {
    const sprite = Object.prototype.hasOwnProperty.call(sprites, layer.asset) ? sprites[layer.asset] : undefined;
    if (!sprite) throw new Error(missingSpriteMessage(layer.asset));
    // loopPhase wraps the frame first, so frame N is frame 0 to the last bit.
    const float = layer.floatPx * Math.sin(layer.floatCycles * loopPhase(frame, durationInFrames) + (TAU * layer.phase) / SPRITE_LOOP);
    // Blur first, then the shadow of the blurred sprite, as in the mock.
    const filters = [
      ...(layer.blur > 0 ? [`blur(${layer.blur}px)`] : []),
      ...(layer.shadow ? [shadowFilter(layer.size, props.shadowColor, props.shadowOpacity)] : []),
    ];
    return {
      key: `${index}-${layer.asset}`,
      asset: layer.asset,
      file: spriteFile(layer.asset, spriteFrameIndex(sprite, clock, layer.phase)),
      left: layer.x - layer.size / 2,
      top: layer.y - layer.size / 2 + float,
      size: layer.size,
      ...(filters.length > 0 ? {filter: filters.join(' ')} : {}),
    };
  });
};

/** The whole picture for one frame; Y2KLoop feeds it Remotion's frame, the tests their own. */
export const Y2KFrame = ({props, frame, durationInFrames}: {props: Y2KLoopRenderProps; frame: number; durationInFrames: number}) => {
  const placed = getY2KScene(props, frame, durationInFrames);
  // With alpha (WebM, MOV, PNG) only the sprites and their shadows remain: the plate is the background.
  const plate = !hasAlpha(props);
  return (
    <Canvas {...props}>
      {plate ? <AbsoluteFill style={{background: plateGradient(WIDTH, HEIGHT, props.plateColors, props.plateAngle)}} /> : null}
      {plate && props.bloom > 0 ? (
        <AbsoluteFill
          style={{background: bloomGradient(WIDTH, HEIGHT, {x: props.bloomX, y: props.bloomY, radius: props.bloomRadius, opacity: props.bloom})}}
        />
      ) : null}
      {placed.map((sprite) => (
        <Img
          key={sprite.key}
          src={staticFile(sprite.file)}
          style={{position: 'absolute', left: sprite.left, top: sprite.top, width: sprite.size, height: sprite.size, filter: sprite.filter}}
        />
      ))}
    </Canvas>
  );
};

export const Y2KLoop = (props: Y2KLoopRenderProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return <Y2KFrame props={props} frame={frame} durationInFrames={durationInFrames} />;
};
