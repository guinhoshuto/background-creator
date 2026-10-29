import {OverlayCanvas} from '../shared/render';
import {liveUiMockSchema, type LiveUiMockProps} from './schema';
import {LIVE_BAR, LIVE_COMMENTS, LIVE_HOST_CARD, LIVE_TOP_RIGHT, VERTICAL_CANVAS} from './zones';

/**
 * A generic mobile LIVE interface, for QA only: laid over a vertical frame, it shows at once
 * whether the windows clear the host card and whether the comments stay legible. Generic shapes
 * and placeholder words, no brand, logo, icon or real name. It never ships in a pack (`qaOnly`).
 */

export const MOCK_FONT = 'Arial, Helvetica, sans-serif';
/** The app's comment style: white text on a dark translucent pill. */
export const COMMENT_PILL = {fill: '#000000', opacity: 0.35, text: '#FFFFFF'} as const;

export const MOCK_COMMENTS = [
  'viewer_01: hello from here!', 'viewer_02: nice play', 'viewer_03: what game is this?',
  'viewer_04: joined', 'viewer_05: let\'s go', 'viewer_06: sent a gift',
];

export const LiveUiMockFrame = ({props}: {props: LiveUiMockProps}) => {
  const host = LIVE_HOST_CARD;
  const viewers = LIVE_TOP_RIGHT;
  const pillHeight = 64;
  const pillGap = 18;
  const comments = MOCK_COMMENTS.slice(MOCK_COMMENTS.length - props.comments);
  const firstPill = LIVE_COMMENTS.y + LIVE_COMMENTS.height - comments.length * (pillHeight + pillGap);
  return (
    <OverlayCanvas props={props} width={VERTICAL_CANVAS.width} height={VERTICAL_CANVAS.height} idPrefix="live-mock">
      <g data-mock="host-card">
        <rect x={host.x} y={host.y + 20} width={420} height={96} rx={48} fill="#000000" opacity={0.35} />
        <circle cx={host.x + 48} cy={host.y + 68} r={36} fill="#9CA3AF" />
        <text x={host.x + 100} y={host.y + 62} fontFamily={MOCK_FONT} fontSize={30} fontWeight={700} fill="#FFFFFF">host_name</text>
        <text x={host.x + 100} y={host.y + 98} fontFamily={MOCK_FONT} fontSize={24} fill="#E5E7EB">1.2K likes</text>
        <rect x={host.x + 300} y={host.y + 42} width={104} height={52} rx={26} fill="#4B5563" />
        <text x={host.x + 352} y={host.y + 77} fontFamily={MOCK_FONT} fontSize={24} fontWeight={700} fill="#FFFFFF" textAnchor="middle">Follow</text>
        <rect x={host.x} y={host.y + 136} width={260} height={48} rx={24} fill="#000000" opacity={0.35} />
        <text x={host.x + 20} y={host.y + 168} fontFamily={MOCK_FONT} fontSize={22} fill="#FFFFFF">Hourly ranking</text>
      </g>
      <g data-mock="viewers">
        {[0, 1, 2].map((index) => <circle key={index} cx={viewers.x + 40 + index * 56} cy={viewers.y + 54} r={26} fill="#9CA3AF" stroke="#FFFFFF" strokeWidth={2} />)}
        <rect x={viewers.x + 196} y={viewers.y + 30} width={96} height={48} rx={24} fill="#000000" opacity={0.35} />
        <text x={viewers.x + 244} y={viewers.y + 63} fontFamily={MOCK_FONT} fontSize={24} fill="#FFFFFF" textAnchor="middle">3.4K</text>
        <text x={viewers.x + 330} y={viewers.y + 68} fontFamily={MOCK_FONT} fontSize={40} fill="#FFFFFF" textAnchor="middle">×</text>
      </g>
      <g data-mock="comments">
        {comments.map((comment, index) => {
          const y = firstPill + index * (pillHeight + pillGap);
          const width = 120 + comment.length * 15;
          return (
            <g key={comment}>
              <rect x={24} y={y} width={width} height={pillHeight} rx={pillHeight / 2} fill={COMMENT_PILL.fill} opacity={COMMENT_PILL.opacity} />
              <circle cx={24 + 32} cy={y + pillHeight / 2} r={20} fill="#9CA3AF" />
              <text x={24 + 64} y={y + 42} fontFamily={MOCK_FONT} fontSize={28} fill={COMMENT_PILL.text}>{comment}</text>
            </g>
          );
        })}
      </g>
      <g data-mock="bar">
        <rect x={24} y={LIVE_BAR.y + 33} width={620} height={64} rx={32} fill="#000000" opacity={0.35} />
        <text x={56} y={LIVE_BAR.y + 75} fontFamily={MOCK_FONT} fontSize={28} fill="#E5E7EB">Say something…</text>
        {[0, 1, 2].map((index) => <circle key={index} cx={720 + index * 112} cy={LIVE_BAR.y + 65} r={40} fill="#000000" opacity={0.35} />)}
      </g>
    </OverlayCanvas>
  );
};

export const LiveUiMock = (props: LiveUiMockProps) => <LiveUiMockFrame props={props} />;

export const liveUiMockCatalogEntry = {
  id: 'LiveUiMock',
  kind: 'vertical',
  component: LiveUiMock,
  schema: liveUiMockSchema,
  defaultProps: liveUiMockSchema.parse({}),
  qaOnly: true,
} as const;
