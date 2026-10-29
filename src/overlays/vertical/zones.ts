import type {Rect} from '../shared/box';

/**
 * Where the app's own interface covers a 1080×1920 portrait screen, in canvas pixels (y down).
 *
 * Source: the owner's TikTok overlay spec (§3 and §4.3), itself the consensus of the 2026 guides
 * (AdaptlyPost, Revid, Kreatli, PostPlanify), as of 2026-10-28. The app moves these zones 3 to 5
 * times a year and they vary with the device and the caption length, so they are the most
 * restrictive case, and they are data: a change of the app is a change here, with a new date.
 */
export const ZONES_AS_OF = '2026-10-28';

/** The phone screen the vertical kind draws on. */
export const VERTICAL_CANVAS = {width: 1080, height: 1920} as const;

/** A zone: a rect with what the app draws there. */
export type Zone = Rect & {readonly id: string; readonly label: string};

const zone = (id: string, label: string, x0: number, y0: number, x1: number, y1: number): Zone =>
  ({id, label, x: x0, y: y0, width: x1 - x0, height: y1 - y0});

// Feed video (For You), §3.1.
/** The feed's safe area for faces, text, a call to action or a logo: x 60–940, y 200–1500 (880×1300). */
export const SAFE_FEED = zone('safe-feed', 'Safe area (feed)', 60, 200, 940, 1500);
/** Status bar, tabs and search, plus the camera notch: decoration only, it may be covered. */
export const TOP_BAND = zone('top-band', 'Top band: decoration only', 0, 0, 1080, 200);
/** The feed's action column (avatar, like, comment, save, share, sound): decoration only. */
export const RIGHT_COLUMN = zone('right-column', 'Right column: decoration only', 940, 1050, 1080, 1550);
/** The feed's caption, handle, hashtags and sound line; it grows with a long caption. */
export const FEED_CAPTION = zone('feed-caption', 'Caption', 0, 1500, 1080, 1920);

// LIVE, the viewer's view, §3.2.
/** Host avatar, name, follow button, hourly ranking and the LIVE badge. */
export const LIVE_HOST_CARD = zone('live-host-card', 'Host card', 20, 80, 540, 300);
/** Viewer avatars, viewer count and the close button. */
export const LIVE_TOP_RIGHT = zone('live-top-right', 'Viewers', 700, 80, 1060, 190);
/** The native comment feed: white text with a shadow or a dark pill, drawn over the overlay. */
export const LIVE_COMMENTS = zone('live-comments', 'Comments', 0, 1240, 740, 1760);
/** §3.3 rule 4: no high-contrast element here in a LIVE frame, so the native comments stay legible. */
export const LIVE_COMMENTS_CLEAR = zone('live-comments-clear', 'Keep clear: no high contrast', 0, 1290, 780, 1775);
/** The message field, gift, share and more. */
export const LIVE_BAR = zone('live-bar', 'Message bar', 0, 1770, 1080, 1900);

// Derived rules, §3.3.
/** Rule 1: faces and main text between y 230 and 1250, below the host card and above the comments. */
export const FACE_BAND = zone('face-band', 'Faces and main text', 0, 230, 1080, 1250);

/** Every zone of the LIVE view, in drawing order (largest first). */
export const LIVE_ZONES: readonly Zone[] = [FACE_BAND, LIVE_COMMENTS_CLEAR, LIVE_COMMENTS, LIVE_BAR, LIVE_HOST_CARD, LIVE_TOP_RIGHT];
/** Every zone of the feed view, in drawing order (largest first). */
export const FEED_ZONES: readonly Zone[] = [SAFE_FEED, FEED_CAPTION, TOP_BAND, RIGHT_COLUMN];
