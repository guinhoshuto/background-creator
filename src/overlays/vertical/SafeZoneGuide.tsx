import {OverlayCanvas} from '../shared/render';
import {cornerRectPath, rectPathOf} from './geometry';
import {VERTICAL_LAYOUTS, panelOf, windowsOf} from './layouts';
import {safeZoneGuideSchema, type SafeZoneGuideProps} from './schema';
import {FEED_ZONES, LIVE_COMMENTS_CLEAR, LIVE_ZONES, VERTICAL_CANVAS, type Zone} from './zones';

/**
 * The safe-zone guide the buyer gets as a PNG: the zones the app's interface covers, as
 * translucent boxes with generic English labels, and the layout's windows dashed on top. No app
 * logo, icon or name: only boxes and words. It never moves, so every frame is the same.
 */

/** Zone colours by what they ask: keep clear (warm), app interface (cool), where faces go (green). */
const ZONE_TINT: Record<string, string> = {
  'face-band': '#34D399', 'safe-feed': '#34D399',
  'live-comments-clear': '#F87171',
};
const UI_TINT = '#60A5FA';
const ZONE_OPACITY = 0.22;
const LABEL_SIZE = 28;

const tintOf = (zone: Zone) => ZONE_TINT[zone.id] ?? UI_TINT;

const ZoneBox = ({zone}: {zone: Zone}) => (
  <g data-zone={zone.id}>
    <path d={rectPathOf(zone)} fill={tintOf(zone)} fillOpacity={ZONE_OPACITY} stroke={tintOf(zone)} strokeWidth={2} />
    <text x={zone.x + 12} y={zone.y + 12 + LABEL_SIZE} fontFamily="Arial, Helvetica, sans-serif" fontSize={LABEL_SIZE}
      fontWeight={700} fill="#FFFFFF" stroke="#000000" strokeWidth={4} paintOrder="stroke">{zone.label}</text>
  </g>
);

export const SafeZoneGuideFrame = ({props}: {props: SafeZoneGuideProps}) => {
  const layout = VERTICAL_LAYOUTS[props.layout];
  // The keep-clear box sits over the comments box: drawn last of the two, its label stays readable.
  const zones = props.view === 'live' ? LIVE_ZONES : FEED_ZONES;
  const panel = panelOf(layout, props.chatMode);
  return (
    <OverlayCanvas props={props} width={VERTICAL_CANVAS.width} height={VERTICAL_CANVAS.height} idPrefix="guide">
      {zones.map((zone) => <ZoneBox key={zone.id} zone={zone} />)}
      {props.view === 'live' ? (
        <path d={rectPathOf(LIVE_COMMENTS_CLEAR)} fill="none" stroke={tintOf(LIVE_COMMENTS_CLEAR)} strokeWidth={4} strokeDasharray="16 10" />
      ) : null}
      <g data-layer="windows">
        {windowsOf(layout, props.chatMode).map((window) => (
          <path key={window.id} d={cornerRectPath(window)} fill="none" stroke="#FFFFFF" strokeWidth={4} strokeDasharray="12 8" data-window={window.id} />
        ))}
        {panel ? <path d={cornerRectPath(panel)} fill="none" stroke="#FFFFFF" strokeWidth={2} strokeDasharray="4 6" data-window="panel" /> : null}
      </g>
    </OverlayCanvas>
  );
};

export const SafeZoneGuide = (props: SafeZoneGuideProps) => <SafeZoneGuideFrame props={props} />;

export const safeZoneGuideCatalogEntry = {
  id: 'SafeZoneGuide',
  kind: 'vertical',
  component: SafeZoneGuide,
  schema: safeZoneGuideSchema,
  defaultProps: safeZoneGuideSchema.parse({}),
} as const;
