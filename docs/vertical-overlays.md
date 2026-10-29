# Vertical overlays

The `vertical` kind draws a whole 1080×1920 portrait screen for mobile live streams (TikTok LIVE and the like): a background around transparent windows for the camera, the game and, in one layout, a chat widget. Phase 1 is the engine only and look-neutral: a solid or shared fill, a plain ring around each window, no theme and no ornaments. The look comes later, from a direction sheet (see [Still to do](#still-to-do)).

Code: `src/overlays/vertical/` (`zones.ts`, `layouts.ts`, `geometry.ts`, `schema.ts`, `LiveFrameLoop.tsx`, `SafeZoneGuide.tsx`, `LiveUiMock.tsx`, `FeedUiMock.tsx`). Tests: `tests/vertical-layouts.test.ts`, plus the `vertical` rows of `tests/kinds.test.ts`, `tests/sizes.test.ts`, `tests/overlay-registry.test.ts` and the `vertical …` entries of the markup snapshot.

## Compositions

All four sit in the Studio folder `vertical`, at the kind's fixed 1080×1920, 60 fps, transparent by default.

| Id | What it is | Ships |
| --- | --- | --- |
| `LiveFrameLoop` | The frame: the fill with the layout's windows cut out, a ring around each window and, in `panel` mode, the opaque chat panel. Props: `layout`, `chatMode`, the shared `fill*` group (default solid `#3A3548`), `ring`, `ringColor`, `ringLineColor`, `panelColor`, `panelOpacity`. | Yes, once a vertical pack exists |
| `SafeZoneGuide` | The buyer's PNG guide: the zones below as translucent boxes with generic English labels and the layout's windows dashed on top; `view` is `live` or `feed`. It never moves. | Yes, as a PNG |
| `LiveUiMock` | A generic LIVE interface (host card, viewers, comment pills, message bar) to check a frame against. | Never: QA only |
| `FeedUiMock` | A generic feed interface (action column, caption) for the same check. | Never: QA only |

## Zones

Where the app's own interface covers the screen, in canvas pixels (y down), as typed constants in `src/overlays/vertical/zones.ts`.

**Source**: the owner's TikTok overlay spec (§3 and §4.3), itself the consensus of the 2026 guides (AdaptlyPost, Revid, Kreatli, PostPlanify), **as of 2026-10-28** (`ZONES_AS_OF`). **The app moves these zones 3 to 5 times a year**, and they vary with the device and the caption length, so the values are the most restrictive case. They are data: when the app changes, change `zones.ts` with a new date, and the fixed tables below fail until the owner approves the new crossings.

LIVE view (what a viewer sees):

| Constant | x | y | What the app draws there |
| --- | --- | --- | --- |
| `LIVE_HOST_CARD` | 20–540 | 80–300 | Host avatar, name, follow button, hourly ranking, LIVE badge |
| `LIVE_TOP_RIGHT` | 700–1060 | 80–190 | Viewer avatars, viewer count, close button |
| `FACE_BAND` | 0–1080 | 230–1250 | Rule 1: faces and main text go here, below the host card and above the comments |
| `LIVE_COMMENTS` | 0–740 | 1240–1760 | The native comments: white text with a shadow or a dark pill, drawn over the overlay |
| `LIVE_COMMENTS_CLEAR` | 0–780 | 1290–1775 | Rule 4: no high-contrast element here, so the native comments stay legible |
| `LIVE_BAR` | 0–1080 | 1770–1900 | Message field, gift, share, more |

Feed view (For You):

| Constant | x | y | What the app draws there |
| --- | --- | --- | --- |
| `SAFE_FEED` | 60–940 | 200–1500 | Safe area for faces, text, a call to action or a logo (880×1300) |
| `TOP_BAND` | 0–1080 | 0–200 | Status bar, tabs, search, camera notch: decoration only |
| `RIGHT_COLUMN` | 940–1080 | 1050–1550 | Action column (avatar, like, comment, save, share, sound): decoration only |
| `FEED_CAPTION` | 0–1080 | 1500–1920 | Caption, handle, hashtags, sound line; it grows with a long caption |

## Layouts

The spec's §4.2 layouts as data in `src/overlays/vertical/layouts.ts`: each window is a rect with one radius per corner, `[tl, tr, br, bl]`. Margins (§4.1): 110 px at the sides, 210 px on top for one window and 260 px for the LIVE layouts (below the host card), 56 px between blocks, radius 56 for blocks and 200 for the arcs that echo the oval window.

| Id | Use | Windows (x, y, width×height, radii) | Chat modes |
| --- | --- | --- | --- |
| `single-stadium` | Chatting and IRL, feed videos | `camera` (110, 210) 860×1310, radius 430: a pill, half circles top and bottom | `open` |
| `single-rect` | Chatting and IRL, feed videos | `camera` (100, 250) 880×1230, radius 0 | `open` |
| `three-blocks` (default) | PC gameplay | `camera` (110, 260) 860×484 `[200, 200, 56, 56]`; `game` (110, 800) 860×484, 56; `chat` (110, 1340) 860×420 `[56, 56, 200, 200]` | `window`, `panel`, `open` |
| `phone-game-bubble` | Mobile gameplay | `game` (160, 260) 760×1352, 56; `camera` (60, 1360) 300×300, 150: a round bubble over the game | `open` |

Chat modes (`chatMode`, default `open`):

- `window`: the chat block is a transparent window too, for a chat widget placed behind it (multistream).
- `panel`: the chat block is an opaque panel (`panelColor`, `panelOpacity`) that the app's native comments are drawn over.
- `open`: no frame and no panel, only the background, for who streams to the one app only.

A layout without a chat block accepts only `open`; the schema refuses the rest with the way out: `single-rect has no chat block: use chatMode "open", or the layout three-blocks for "window".`

## Rules

- **60 fps and the loop rules of the repo.** Only the fill moves; the windows and the rings are the same on every frame (tested on the markup at frames 0 and N/2 with a moving gradient).
- **Windows at exact alpha 0.** Each window is its own `clip-rule="evenodd"` clip of the screen, and the background sits inside all of them, nested: one path holding every hole would fill again where two windows overlap (the bubble over the phone game). Each window's ring is cut by the windows listed after it, so the bubble cuts the game's ring and its own ring shows over the game. Tested at the centre of every window, on every layout, mode and sampled frame, and every clip the frame defines must be applied.
- **The ring is fixed px.** A 3 px line (`ringLineColor`, default white) on the window edge, then a 10 px band (`ringColor`) outside it: `RING_WIDTH` = 13 px, which must stay inside the screen. The spec only says "10 px light + 3 px white"; the line inside and the band outside is a provisional choice.
- **Fixed canvas, no size controls.** The kind's `fixedSize` is 1080×1920; `--size`, `--width`, `--height` and `--bleed` are refused. Every window position and size is an even integer.
- **The `live-frame` id is provisional.** It is the kind's one named size and it only names the file (`LiveFrameLoop-live-frame.webm`; it sets no props, and there is no position JSON). Because it reaches the buyer through the file name, it goes to the owner for a yes before any pack ships it, and after that it changes only in a planned rename round.
- **The UI mocks are QA only.** Their catalog entries carry `qaOnly: true`, and `planPack` refuses them: `LiveUiMock is a QA mock of an app's interface and never ships in a pack; remove this item (to check a frame against it, use a stills job).` Mocks and guide have no app logo, icon or real name: only boxes, pills and placeholder words.

## Known conflicts with the spec, fixed in the tests

The spec's own layouts break two of its rules in places. Both tables are compared exactly in `tests/vertical-layouts.test.ts` (`FACE_BAND_EXCEPTIONS`, `COMMENTS_CLEAR_CROSSINGS`), so a new layout or a moved window fails until the owner approves the change there.

`FACE_BAND` (y 230–1250): the `three-blocks` camera lies wholly inside it (y 260–744); the `single-stadium` and `single-rect` windows are taller than the band, so their centre (y 865) is what sits inside. The one exception is `phone-game-bubble/camera`: the bubble is at y 1360–1660 (centre 1510), under the game, as the spec's layout C draws it.

`LIVE_COMMENTS_CLEAR` (x 0–780, y 1290–1775), measured with the ring: `window` when the window itself enters, `ring` when only its 13 px ring does.

| Layout / chat mode | What reaches into the zone |
| --- | --- |
| `single-stadium` / `open` | camera: window |
| `single-rect` / `open` | camera: window |
| `three-blocks` / `window` | game: ring; chat: window (meant to be there) |
| `three-blocks` / `panel` | game: ring |
| `three-blocks` / `open` | game: ring |
| `phone-game-bubble` / `open` | game: window; camera: window |

In `three-blocks` the game block ends at y 1284, so its ring band (to y 1297) reaches 7 px into the zone in every mode; in `phone-game-bubble` the 9:16 game (to y 1612) enters too, not only the bubble.

## Deviation from the spec: 1351 → 1352

The spec's `phone-game-bubble` game is 760×1351. An odd height breaks the even-size rule (H.264 needs even sides, and Remotion crops an odd one by 1 px without warning), so the window is 760×1352 and ends at y 1612 (commented in `layouts.ts`).

## Still to do

- **Style and ornaments**: a look for the frame (fill, ring, decoration), only after a direction sheet with 2 to 4 directions, made when the owner brings the idea and the references (`AGENTS.md`, "Art direction before polish").
- **A `*-vertical` pack and vertical QA**: the manifest, the layouts and chat modes it ships, and a `qa:kit` path with 1080×1920 mockups over the UI mocks.
- **File names per layout in the one-off render**: today every layout renders to `LiveFrameLoop-live-frame.<ext>` (a pack names them by `variant`); see `docs/review-followups.md`.
