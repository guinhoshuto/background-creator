import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {baseBackgroundSchema} from '../../settings';
import {fillFields} from '../shared/fields';
import {CHAT_MODES, VERTICAL_LAYOUTS, VERTICAL_LAYOUT_IDS, type ChatMode, type VerticalLayoutId} from './layouts';

/**
 * What every vertical composition shares: timing, seed, alpha rule and format, without a box
 * (the kind's canvas is fixed at 1080×1920). Overlays default to transparent.
 */
export const verticalBaseFields = () => ({
  ...baseBackgroundSchema.omit({colors: true}).shape,
  transparent: z.boolean().describe('Alpha in WebM, MOV and PNG').default(true),
});

/** The layout and how its chat block is drawn. */
export const layoutFields = () => ({
  layout: z.enum(VERTICAL_LAYOUT_IDS)
    .describe('Windows on the screen: single-stadium (one pill), single-rect (one rectangle), three-blocks (camera, game, chat) or phone-game-bubble (9:16 game and a round camera)')
    .default('three-blocks'),
  chatMode: z.enum(CHAT_MODES)
    .describe('The chat block (three-blocks only): window (transparent, for a chat widget behind), panel (opaque, under the app\'s own comments) or open (only the background; the default)')
    .default('open'),
});

/** Refuses a chat mode the layout has no block for, pointing to the way out. */
export const refineChatMode = (props: {layout: VerticalLayoutId; chatMode: ChatMode}, context: z.RefinementCtx) => {
  const layout = VERTICAL_LAYOUTS[props.layout];
  if (!layout.chatModes.includes(props.chatMode)) {
    context.addIssue({
      code: 'custom',
      path: ['chatMode'],
      message: `${layout.id} has no chat block: use chatMode "open", or the layout three-blocks for "${props.chatMode}".`,
    });
  }
};

export const liveFrameFields = z.object({
  ...verticalBaseFields(),
  ...layoutFields(),
  ...fillFields({fill: 'solid', fillColors: ['#3A3548'], fillOpacity: 1}),
  ring: z.boolean()
    .describe('Window ring: a 3 px line on each window edge and a 10 px band around it (fixed px)')
    .default(true),
  ringColor: zColor().default('#E9E2EC'),
  ringLineColor: zColor().default('#FFFFFF'),
  panelColor: zColor().default('#2A2438'),
  panelOpacity: z.number().finite().min(0).max(1)
    .describe('Opacity of the chat panel (chatMode panel), from 0 to 1')
    .default(1),
});

export const liveFrameLoopSchema = liveFrameFields.superRefine(refineChatMode);
export type LiveFrameLoopProps = z.infer<typeof liveFrameLoopSchema>;

export const safeZoneGuideSchema = z.object({
  ...verticalBaseFields(),
  ...layoutFields(),
  view: z.enum(['live', 'feed'])
    .describe('Which screen the zones are for: live (host card, viewers, comments, message bar) or feed (safe area, top band, right column, caption)')
    .default('live'),
}).superRefine(refineChatMode);
export type SafeZoneGuideProps = z.infer<typeof safeZoneGuideSchema>;

/** The LIVE interface mock: how many comment pills it stacks above the message bar. */
export const liveUiMockSchema = z.object({
  ...verticalBaseFields(),
  comments: z.number().int().min(0).max(6)
    .describe('Comment pills stacked above the message bar, from 0 to 6')
    .default(6),
});
export type LiveUiMockProps = z.infer<typeof liveUiMockSchema>;

/** The feed interface mock: a long caption grows upwards (80 to 250+ px), so its lines are a knob. */
export const feedUiMockSchema = z.object({
  ...verticalBaseFields(),
  captionLines: z.number().int().min(0).max(6)
    .describe('Caption lines under the handle, from 0 to 6: a long caption pushes the handle up')
    .default(2),
});
export type FeedUiMockProps = z.infer<typeof feedUiMockSchema>;
