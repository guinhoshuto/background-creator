# Vertical overlays

The `vertical` kind draws a whole 1080×1920 portrait screen for mobile live streams (TikTok LIVE and the like): a background around transparent windows for the camera, the game and, in stacked layouts, a chat widget. `LiveFrameLoop` is the look-neutral engine. `PrismaticPopLoop` is the first themed composition, with three approved looks sharing the four-variant standard below.

Code: `src/overlays/vertical/` (`zones.ts`, `layouts.ts`, `geometry.ts`, `schema.ts`, `LiveFrameLoop.tsx`, `SafeZoneGuide.tsx`, `LiveUiMock.tsx`, `FeedUiMock.tsx`). Tests: `tests/vertical-layouts.test.ts`, plus the `vertical` rows of `tests/kinds.test.ts`, `tests/sizes.test.ts`, `tests/overlay-registry.test.ts` and the `vertical …` entries of the markup snapshot.

## Compositions

All five sit in the Studio folder `vertical`, at the kind's fixed 1080×1920, 60 fps, transparent by default.

| Id | What it is | Ships |
| --- | --- | --- |
| `LiveFrameLoop` | The frame: the fill with the layout's windows cut out, a ring around each window and, in `panel` mode, the opaque chat panel. Props: `layout`, `chatMode`, the shared `fill*` group (default solid `#3A3548`), `ring`, `ringColor`, `ringLineColor`, `panelColor`, `panelOpacity`. | Yes, once a vertical pack exists |
| `PrismaticPopLoop` | Electric Candy, Night Signal and Sugar Voltage. The four standard layouts (camera over game, regular or compact, and one window, a pill or rounded), restrained looping halftone/glints and an `ornaments: false` plain option. See [theme specification](themes/prismatic-pop.md). | Yes |
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

The spec's §4.2 layouts as data in `src/overlays/vertical/layouts.ts`: each window is a rect with one radius per corner, `[tl, tr, br, bl]`. The kept layouts sit on the [LIVE grid](#live-grid) (owner, 2026-11-25 and 2026-11-26), the 16:9 kits' spacing: 40 px at the sides and 24 px between the drawn frames, with one window's top at y 210 and the stacked camera's at y 98. Radius 56 for blocks, half the width for the pill and 200 for the chat block's bottom corners. The two discarded layouts keep the spec's own positions (§4.2): `single-rect` 100 px from the sides, `phone-game-bubble`'s game 160 px.

| Id | Use | Windows (x, y, width×height, radii) | Chat modes |
| --- | --- | --- | --- |
| `single-stadium` | Chatting and IRL, feed videos | `camera` (40, 210) 1000×1310, radius 500: a pill, half circles top and bottom | `open` |
| `single-rounded` | Chatting and IRL, feed videos | `camera` (40, 210) 1000×1310, 56: the pill's container with the blocks' corners | `open` |
| `single-rect` | Chatting and IRL, feed videos | `camera` (100, 250) 880×1230, radius 0 | `open` |
| `three-blocks` (default) | PC gameplay | `camera` (40, 98) 1000×562, 56; `game` (40, 722) 1000×562, 56: 16:9 twins; `chat` (40, 1346) 1000×414 `[56, 56, 200, 200]` | `window`, `panel`, `open` |
| `three-blocks-compact` | PC gameplay, compact gap | Same camera/chat; game at (40, 684), unchanged size/radii | `window`, `panel`, `open` |
| `phone-game-bubble` | Mobile gameplay | `game` (160, 260) 760×1352, 56; `camera` (60, 1360) 300×300, 150: a round bubble over the game | `open` |

**Discarded: `single-rect` and `phone-game-bubble`** (owner, 2026-11-13, for every theme). They go into no new proposal, direction sheet or pack unless the owner asks for one by name. Their code stays, so they still render, and the tables in this file keep describing them. The planner refuses a pack item on either one (from its props or its preset), with the reason and the way out, unless the manifest names it: `"discardedLayouts": ["single-rect"]`, only after the owner's request for that layout; a name there that no item uses is refused too. The list is `DISCARDED_LAYOUT_IDS` in `layouts.ts`, pinned in `tests/vertical-layouts.test.ts`.

Chat modes (`chatMode`, default `open`):

- `window`: the chat block is a transparent window too, for a chat widget placed behind it (multistream).
- `panel`: the chat block is an opaque panel (`panelColor`, `panelOpacity`) that the app's native comments are drawn over.
- `open`: no frame and no panel, only the background, for who streams to the one app only.

A layout without a chat block accepts only `open`; the schema refuses the rest with the way out: `single-rect has no chat block: use chatMode "open", or the layout three-blocks for "window".`

### Standard four-variant delivery matrix

Owner decision, 2026-11-03: every new vertical look ships **all four** combinations, not a choice of one. Since 2026-11-26 the four are two stacked layouts and two single windows. Use the exported `STANDARD_LAYOUT_VARIANTS` from `layouts.ts` for presets, pack items, QA and review jobs. The discarded rectangle and phone-game layouts are not substitutes for this delivery matrix.

| Variant suffix | Layout id | Windows | Gap or shape |
| --- | --- | --- | --- |
| `camera-game` | `three-blocks` | Camera y 98–660 over game y 722–1284, both 1000×562 | 62 px: 24 px between the inks |
| `camera-game-compact` | `three-blocks-compact` | Camera y 98–660 over game y 684–1246 | 24 px: the frames fuse |
| `single-pill` | `single-stadium` | One window, 1000×1310, y 210–1520 | Radius 500: half circles top and bottom |
| `single-rounded` | `single-rounded` | The same window | Radius 56, the stacked windows' corners |

Every window is 1000 px wide, on the 40 px sides, and every one but the pill and the chat block has uniform 56 px corners: no arch. In the stacked variants the camera is the game's 16:9 twin, 1000×562 at y 98; compact moves only the game up by 38 px, from y 722 to y 684. Chat stays at y 1346. The raw gap is measured between the transparent windows: subtract both outer decorative extents for visible clearance. The file suffixes reach the buyer: `center`, `center-compact`, `left` and `left-compact` were pack v4's (the 400 px square camera, 2026-11-25, never listed), and `arched`/`rect` the v2's.

#### LIVE grid

Owner decisions, 2026-11-25 and 2026-11-26: the LIVE layouts take the spacing of the 16:9 kits' stream grid (`src/stream-grid.ts`), which spaces the drawn frames, not the windows. The constants are in `layouts.ts` (`STACKED_SIDE`, `STACKED_TOP`, `STACKED_GUTTER`, `STACKED_FRAME_REACH`, `STACKED_GAME_HEIGHT`, `STACKED_CAMERA_HEIGHT`, `SINGLE_TOP`, `SINGLE_HEIGHT`):

- **Sides 40 px** (was 110): every window on the grid spans x 40–1040, 1000 px wide, the single window included (2026-11-26; the pill was 860 wide, radius 430). The shared 13 px ring ends at x 27 and Prismatic Pop's 19 px ink at x 21, inside the screen.
- **24 px between the drawn frames** (was 56 px between the windows), on the frame the grid was set on, Prismatic Pop's 19 px ink (`STACKED_FRAME_REACH` = `PRISMATIC_RING_EXTENT`): 62 px between the windows, camera to game and game to chat. The shared 13 px ring, thinner, shows 36 px, as a thinner kit shows more gutter on the 16:9 grid.
- **Compact: the frames fuse.** 24 px between the windows: two 13 px rings overlap by 2 px, two 19 px inks by 14 px, and the bridge reads as one frame. Prismatic Pop draws every ink, then every edge, then every line, so the fused bridge is line, one edge band, line, not one ring over the other. A future theme draws its fused bridge on purpose too.
- **The game keeps 16:9 and its bottom.** 1000×562.5, even: 562, ending at y 1284 as before, so the comments keep-clear zone sees exactly what it saw.
- **The camera is the game's twin** (owner, 2026-11-26): 16:9, as wide and as tall as the game, with the same 56 px corners. Two 1000×562 windows and the regular gap above y 1284 put the camera's top at y 98 (`STACKED_TOP`, derived, not chosen), so it lies under the app's host card and viewers: the owner accepted that as the price of a camera this size, after the 400×400 square of 2026-11-25 (pack v4, centred or on the left) read too small. Pinned in `LIVE_TOP_COVER` (`tests/vertical-layouts.test.ts`). The square's `three-blocks-left` siblings went with it, as the arched camera (top corners 200) went before.
- **One window on the same sides** (owner, 2026-11-26): 1000×1310 from y 210 (`SINGLE_TOP`, the spec's top for one window) to y 1520, as a pill (radius 500) or with the blocks' radius (56).
- **The bottom rules unchanged**: `LIVE_COMMENTS_CLEAR`, `LIVE_BAR` and the chat's bottom at y 1760.
- **Known trade-off, feed view**: each window's box reaches x 1040, 100 px into the feed's `RIGHT_COLUMN` (x 940–1080; the 110 px sides reached 30 px), and past `SAFE_FEED`'s x 60–940. A LIVE frame is seen in the LIVE view, where no action column sits there; pinned in `FEED_RIGHT_COLUMN_REACH` (`tests/vertical-layouts.test.ts`), the single windows included.
- **Zone checks**: the stacked camera starts 132 px above `FACE_BAND` and ends inside it, with its centre at y 379 (see [Known conflicts](#known-conflicts-with-the-spec-fixed-in-the-tests)). `COMMENTS_CLEAR_CROSSINGS` keeps its stacked rows: the regular game's ring still reaches 7 px into the zone, and the compact game, ending at y 1246, none. The ring check and the even-size check pass unchanged.

Do not shrink the sources to create a gap, and keep the regular variant's rings apart; only the compact variant fuses them.

Shapes should stay restrained and thick decorative ribbons must continue beyond the canvas or meet their support cleanly; no unexplained cut ends. Review every sibling variant and enlarge the window corners and bridge between blocks.

## Rules

- **60 fps and the loop rules of the repo.** Only the fill moves; the windows and the rings are the same on every frame (tested on the markup at frames 0 and N/2 with a moving gradient).
- **Windows at exact alpha 0.** Each window is its own `clip-rule="evenodd"` clip of the screen, and the background sits inside all of them, nested: one path holding every hole would fill again where two windows overlap (the bubble over the phone game). Each window's ring is cut by the windows listed after it, so the bubble cuts the game's ring and its own ring shows over the game. Tested at the centre of every window, on every layout, mode and sampled frame, and every clip the frame defines must be applied.
- **The ring is fixed px.** A 3 px line (`ringLineColor`, default white) on the window edge, then a 10 px band (`ringColor`) outside it: `RING_WIDTH` = 13 px, which must stay inside the screen. The spec only says "10 px light + 3 px white"; the line inside and the band outside is a provisional choice.
- **Fixed canvas, no size controls.** The kind's `fixedSize` is 1080×1920; `--size`, `--width`, `--height` and `--bleed` are refused. Every window position and size is an even integer.
- **The `live-frame` id is provisional.** It is the kind's one named size and it only names the file (`LiveFrameLoop-live-frame.webm`; it sets no props, and there is no position JSON). Because it reaches the buyer through the file name, it goes to the owner for a yes before any pack ships it, and after that it changes only in a planned rename round.
- **The UI mocks are QA only.** Their catalog entries carry `qaOnly: true`, and `planPack` refuses them: `LiveUiMock is a QA mock of an app's interface and never ships in a pack; remove this item (to check a frame against it, use a stills job).` Mocks and guide have no app logo, icon or real name: only boxes, pills and placeholder words.

## Known conflicts with the spec, fixed in the tests

The spec's own layouts break two of its rules in places, and the LIVE grid a third. The tables are compared exactly in `tests/vertical-layouts.test.ts` (`FACE_BAND_EXCEPTIONS`, `LIVE_TOP_COVER`, `COMMENTS_CLEAR_CROSSINGS`), so a new layout or a moved window fails until the owner approves the change there.

`FACE_BAND` (y 230–1250): the stacked camera (y 98–660) starts 132 px above it and ends inside it, so its centre (y 379) is what sits inside; the `single-stadium`, `single-rounded` and `single-rect` windows are taller than the band, so their centre (y 865) is what sits inside. The one exception is `phone-game-bubble/camera`: the bubble is at y 1360–1660 (centre 1510), under the game, as the spec's layout C draws it.

The app's top interface (`LIVE_HOST_CARD`, y 80–300; `LIVE_TOP_RIGHT`, y 80–190), in `open` mode: how many of the zone's rows a window covers (`LIVE_TOP_COVER`). The stacked camera under both zones is the owner's choice of 2026-11-26.

| Layout / window | Host card | Viewers |
| --- | --- | --- |
| `three-blocks` and `three-blocks-compact` / camera | 202 px | 92 px |
| `single-stadium` and `single-rounded` / camera | 90 px | none |
| `single-rect` / camera | 50 px | none |
| `phone-game-bubble` / game | 40 px | none |

`LIVE_COMMENTS_CLEAR` (x 0–780, y 1290–1775), measured with the ring: `window` when the window itself enters, `ring` when only its 13 px ring does.

| Layout / chat mode | What reaches into the zone |
| --- | --- |
| `single-stadium` / `open` | camera: window |
| `single-rounded` / `open` | camera: window |
| `single-rect` / `open` | camera: window |
| `three-blocks` / `window` | game: ring; chat: window (meant to be there) |
| `three-blocks` / `panel` | game: ring |
| `three-blocks` / `open` | game: ring |
| `phone-game-bubble` / `open` | game: window; camera: window |

In `three-blocks` the game block ends at y 1284, so its ring band (to y 1297) reaches 7 px into the zone in every mode; in `phone-game-bubble` the 9:16 game (to y 1612) enters too, not only the bubble.

The compact layout ends the game at y1246: the neutral 13 px ring ends at y1259 and the themed 19 px ink at y1265, outside the comments zone. Its `open`/`panel` modes have no crossing, and `window` mode has only the intended chat window. These cases are pinned in `tests/vertical-layouts.test.ts`.

## Deviation from the spec: 1351 → 1352

The spec's `phone-game-bubble` game is 760×1351. An odd height breaks the even-size rule (H.264 needs even sides, and Remotion crops an odd one by 1 px without warning), so the window is 760×1352 and ends at y 1612 (commented in `layouts.ts`).

## Still to do

- **More themes**: use the four-variant matrix after the owner approves the direction sheet (`AGENTS.md`, "Art direction before polish"). Prismatic Pop's production composition, presets and pack establish the first example.
- **Vertical QA is available**: `npm run qa:kit -- prismatic-pop-vertical` builds per-look/plain portrait sheets and 1080×1920 LIVE mockups. MP4 gets a separate still with `previewFormat: "mp4"`, so PNG/WebM transparency cannot hide a broken green-screen composite. A stills job always writes PNG images; `previewFormat` chooses the composition's alpha policy for the image.
- **File names per layout in the one-off render**: today every layout renders to `LiveFrameLoop-live-frame.<ext>` (a pack names them by `variant`); see `docs/review-followups.md`.
