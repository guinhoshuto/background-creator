import {OverlayCanvas} from '../shared/render';
import {MOCK_FONT} from './LiveUiMock';
import {feedUiMockSchema, type FeedUiMockProps} from './schema';
import {RIGHT_COLUMN, TOP_BAND, VERTICAL_CANVAS} from './zones';

const CAPTION_LINES = [
  'A caption line that runs long enough to wrap', 'and a second one that keeps going', 'a third line of plain words',
  'a fourth line of plain words', 'a fifth line of plain words', '#tag #another #third',
];
/** The sound line's baseline; the caption and the handle stack above it, 40 px a line. */
const SOUND_BASELINE = 1840;
const LINE_STEP = 40;

/**
 * A generic feed-video interface, for QA only: tabs on top, the action column on the right and
 * the caption at the bottom. Generic shapes and placeholder words, no brand, logo, icon or real
 * name. It never ships in a pack (`qaOnly`).
 */
export const FeedUiMockFrame = ({props}: {props: FeedUiMockProps}) => {
  const column = RIGHT_COLUMN;
  const lines = CAPTION_LINES.slice(0, props.captionLines);
  const handleBaseline = SOUND_BASELINE - (lines.length + 1) * LINE_STEP - 10;
  return (
    <OverlayCanvas props={props} width={VERTICAL_CANVAS.width} height={VERTICAL_CANVAS.height} idPrefix="feed-mock">
      <g data-mock="tabs">
        <text x={TOP_BAND.width / 2 - 24} y={TOP_BAND.y + 150} fontFamily={MOCK_FONT} fontSize={32} fill="#D1D5DB" textAnchor="end">Following</text>
        <text x={TOP_BAND.width / 2 + 24} y={TOP_BAND.y + 150} fontFamily={MOCK_FONT} fontSize={32} fontWeight={700} fill="#FFFFFF">For You</text>
        <circle cx={TOP_BAND.width - 70} cy={TOP_BAND.y + 140} r={26} fill="none" stroke="#FFFFFF" strokeWidth={4} />
      </g>
      <g data-mock="actions">
        <circle cx={column.x + column.width / 2} cy={column.y + 40} r={44} fill="#9CA3AF" stroke="#FFFFFF" strokeWidth={3} />
        {[0, 1, 2, 3].map((index) => {
          const cy = column.y + 170 + index * 100;
          return (
            <g key={index}>
              <circle cx={column.x + column.width / 2} cy={cy} r={34} fill="#000000" opacity={0.35} />
              <text x={column.x + column.width / 2} y={cy + 64} fontFamily={MOCK_FONT} fontSize={22} fill="#FFFFFF" textAnchor="middle">{`${index + 1}2K`}</text>
            </g>
          );
        })}
        <circle cx={column.x + column.width / 2} cy={column.y + column.height - 40} r={36} fill="#374151" stroke="#9CA3AF" strokeWidth={8} />
      </g>
      <g data-mock="caption">
        <text x={40} y={handleBaseline} fontFamily={MOCK_FONT} fontSize={34} fontWeight={700} fill="#FFFFFF">@creator_name</text>
        {lines.map((line, index) => (
          <text key={line} x={40} y={handleBaseline + 10 + (index + 1) * LINE_STEP} fontFamily={MOCK_FONT} fontSize={28} fill="#FFFFFF">{line}</text>
        ))}
        <text x={40} y={SOUND_BASELINE} fontFamily={MOCK_FONT} fontSize={26} fill="#E5E7EB">♪ original sound</text>
      </g>
    </OverlayCanvas>
  );
};

export const FeedUiMock = (props: FeedUiMockProps) => <FeedUiMockFrame props={props} />;

export const feedUiMockCatalogEntry = {
  id: 'FeedUiMock',
  kind: 'vertical',
  component: FeedUiMock,
  schema: feedUiMockSchema,
  defaultProps: feedUiMockSchema.parse({}),
  qaOnly: true,
} as const;
