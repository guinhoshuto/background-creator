# Sticker Pop: paper stickers

The `sticker-pop` kit (`packs/sticker-pop.json`, version 1, `profile` `delivery`; presets `chat-`, `block-` and `border-sticker-pop`, plus one set per box style, see [Four box styles](#four-box-styles); ornaments `sticker`; see [Overlays](../overlays.md#themes)) dresses chat, blocks and borders as paper stickers cut out and stuck on the stream: opaque pieces, a thick indigo ink line, a cream thread round it and a flat side under each piece, with stars, sparkles and bolts posed on steps. It ships five backgrounds, each the variant in its file name (`backgrounds/sticker-pop-background-<variant>.webm` and `.png`), in this order:

| Variant | Composition | Preset | Look |
| --- | --- | --- | --- |
| `paper-burst` | `SunburstLoop` | `sticker-pop` | The paper sunburst in two creams (D-03); the one `qa:kit` and the mockup video use. |
| `pink-burst` | `SunburstLoop` | `sticker-pop-pink-burst` | The same fan in pinks. |
| `pink-stage` | `StickerStageLoop` | `sticker-pop-pink-stage` | The mock's stickers, with their cream rim, on the still pink stage gradient. |
| `paper-stickers` | `StickerStageLoop` | `sticker-pop-paper-stickers` | The same stickers without rim over the paper sunburst (`backdrop: paper`), three of them hot pink (`accent`). |
| `cream-grid` | `CheckerboardLoop` | `sticker-pop-cream-grid` | A 4 px blue line grid of 96 px squares on cream, drifting up and right at 24 px/s (`style: outline`). |

`tests/helpers/themes.ts` names these five variants, in this order, as the kit's exception to one background (`KIT_BACKGROUND_VARIANTS`, owner, 2026-11-22); `tests/pack.test.ts` holds the pack to them and every one of them to the overlays' `durationSeconds` and `seed`. Only `StickerStageLoop` is code of its own; the other three are presets.

```sh
npm run render:webm -- SunburstLoop --props presets/sticker-pop.json
npm run render:webm -- StickerStageLoop --props presets/sticker-pop-pink-stage.json
npm run render:pack -- sticker-pop --dry-run
```

## The 12-second loop

Everything loops in **12 s**, seed 23, the backgrounds': `tests/pack.test.ts` holds every overlay preset to each background's parsed `durationSeconds` and `seed`. The `paper-burst` background is a fan of 16 rays in two near-identical creams (`#F6E2E4`, `#F5DCD1`, half-width rays, no swirl, no fades) turning `spin: 2` steps a loop; both 16 and 2 are multiples of the two colours, so the fan closes at the seam (README, Known pitfalls). The ornaments move on steps, eight poses a second (96 steps a loop at 12 s; at 60 fps a step lasts 7.5 frames, so whole frames hold a pose for 8 and 7 frames in turn, across the seam too), and the star's table starts at its rest pose, so frame 0, the pack's PNG, shows it at rest. The chat and the border run two near-identical indigos along the line at 48 px/s (`gradient`, `strokeColors` `#4A3A69`, `#4F3F70`), which keeps the kit's speed rule without a line that visibly moves; the block's line is still and its pink body sways at 16 px/s.

## What each piece carries

- **Chat** (`chat-sticker-pop`): an opaque cream panel (`#F6E2E4`), radius 15, a 6 px indigo line, the 3 px cream thread outside it (`strokeMargin: 3`), a pink header 39 px tall (`#F74CA9`) under a 6 px line, with three title buttons of 24 px at its right end (blue `#9AC7F2`, pink `#EE9DE6`, orange `#F4A66C`; 7 px apart, 12 px in from the line), and an 8 px coral side (`depth`, `#F5A09E`). With the thread, the top reads 3 cream + 6 ink + 39 pink + 6 ink = 54 px, the approved mock's. A faint indigo glow (`glow: 2`, `glowStrength: 0.25`) is there only because every chat preset must emit its stroke glow; a stronger one darkened the whole cream thread.
- **Block** (`block-sticker-pop`): a pink gradient body (`#F74CA9` to `#EF6AA0`, swaying), radius 12, the same 6 px still line and 3 px cream thread, no bar (`accent: "none"`, the mock's labels and banners), and a 6 px magenta side (`#C554A6`) at every size, which leaves the labels 12 px of their 24 px bleed.
- **Border** (`border-sticker-pop`): a 12 px cream band (`thickness: 12`, `lines: 1`, `corners: "none"`) with the 6 px indigo line in its middle (the band is the thread, so the border has no `strokeMargin`), a window radius of 12, and an 8 px coral side. Rectangular windows carry a 24 px pink title bar under a 6 px line, with the three buttons at 18 px (5 px apart, 14 px in); the round webcams have no bar (`shape: circle` ignores it), and the screen frames neither bar nor side (`fit: screen`).

### The chat's 6 px line

A chat preset keeps `strokeWidth` between 2 and 3 px, unless its theme has a named exception in `CHAT_STROKE_WIDTHS` (`tests/helpers/themes.ts`), added only with the owner's yes. `sticker-pop` is the first: its main chat (`chat-sticker-pop`) takes exactly 6 px, the same ink line as its block and its frames (owner, 2026-11-21). Any other weight on this chat, 3 px included, fails the test. The chats of the three other box styles take 3 px (owner, 2026-11-22), inside the usual range.

## Four box styles

The kit's boxes come in four styles, each one the same 100 files (the chats, blocks and borders above, with ornaments and `plain`), so the buyer can set any style over any of the five backgrounds (owner, 2026-11-22). The paper window above (D-03) is the main style and keeps the unsuffixed names; the other three take the style as a file suffix after the size, and `<style>-plain` for the twin without ornaments ([Box styles](../packs.md#box-styles)). `tests/helpers/themes.ts` names the three (`KIT_BOX_STYLES`), and `tests/pack.test.ts` holds each to the main style's sizes and props.

| Style | Presets | Paired with | Chat | Block | Border |
| --- | --- | --- | --- | --- | --- |
| paper window (D-03, main) | `{chat,block,border}-sticker-pop` | `paper-burst` | See [What each piece carries](#what-each-piece-carries). | | |
| `cream-soda` (D-04) | `{chat,block,border}-sticker-pop-cream-soda` | `cream-grid` | Cream body `#F6E2E4`, radius 16, 3 px indigo line; lilac header (`#A2A6DA`, 44 px, 3 px line) with three 20 px buttons (pink, orange, cream; 6 px apart, 12 px in); `padding: 24`. | Cream body, radius 16, 6 px indigo line (the body is flat, so the line moves); a 12 px lilac bar on the left (`accent: "left"`, no sheen; an arc on the round blocks); `paddingX: 28`, `paddingY: 12`. | 12 px cream band, 6 px indigo line, window radius 12; 26 px lilac title bar under a 3 px line, three 16 px buttons (5 px apart, 10 px in). |
| `fine-line` (D-01) | `{chat,block,border}-sticker-pop-fine-line` | `pink-stage` | Cream body, radius 16, 3 px indigo line; blue header (`#9AC7F2`, 40 px, 3 px line), no buttons. | Cream body, radius 20, 4 px indigo line, no bar. | 12 px cream band, 4 px indigo line, window radius 12; no title bar. |
| `indigo-pop` (D-02) | `{chat,block,border}-sticker-pop-indigo-pop` | `pink-burst` | Indigo body `#4A3A69`, radius 16, 3 px cream line (`#F6E2E4`, `#F1DCDF`); blue header (44 px, cream 3 px line), no buttons. | Indigo dots on indigo (`dots`, `#4A3A69`, `#625997`, `fillScale: 32`, 45°, moving at 16 px/s), radius 16, a still 4 px cream line; a 12 px pink bar on the left (`#F74CA9`, no sheen). | 14 px indigo band, 4 px cream line, window radius 12; no title bar. |

Common to the three: 12 s, seed 23, `ornaments: "sticker"` at 36 px, no side (`depth: 0`), no cream thread (`strokeMargin: 0`), no light, lightning or halo; the chat keeps the faint glow (`glow: 2`, `glowStrength: 0.25`), the block and border none. No line is dashed: every line that moves runs two near-identical colours at 48 px/s (`gradient`), like the main style, since a marching dash reads as a selection outline against a sticker's thick line (owner, 2026-11-22). The ornament colours are orange, pink and blue (`#F4A66C`, `#F74CA9`, `#9AC7F2`) in `cream-soda` and `indigo-pop`, and the main style's orange, cream and yellow in `fine-line`. Every window has radius 12, the main style's, so the 7 webcam masks serve all four styles and no style adds a mask.

On the round blocks of `cream-soda` and `indigo-pop`, the left bar's arc takes the sparkle's room, so they carry only the star; `fine-line` and the main style keep star and sparkle.

### Left out of the styles

The direction sheets drew a few things the engine does not do; the styles ship without them, by parameter only, with no new engine code (owner, 2026-11-22):

- **The speech-bubble tail on `fine-line`'s labels:** `BlockLoop` draws only `rectangle` and `circle` shapes (`src/overlays/shared/shape.ts`); a tail is a new outline piece with its bleed, ornament slots and refusals, so the labels are plain boxes. Their blue body against the cream band is also left out: the block preset is one per kind, and a body only on the labels would need per-item props against the `plain` twin's `{ornaments: "none"}` rule; they stay cream.
- **`indigo-pop`'s single title button:** the title buttons are always three (`TITLE_BUTTON_COUNT`, `src/overlays/shared/title-buttons.ts`), so its chat header carries none.
- **`indigo-pop`'s dots in alternate rows:** `dots` lays a square grid with a dot of a quarter of `fillScale` (`src/overlays/shared/fills.ts`), so the 8 px dots sit 32 px apart instead of the direction's 28 px staggered rows, about 14 % sparser.
- **`cream-soda`'s small sparkle in the bolt's place:** the `sticker` set has three fixed motifs (`src/overlays/shared/ornaments/sets/sticker-place.ts`); the bolt stays, and like the main style it fits only the chats.
- **The sticker rim round the ornaments (`fine-line`, `indigo-pop`):** `STICKER_RIM` is 0 in the same file, by the owner's rule that a rim never sits over the paper, which an overlay cannot know.
- **The indigo body of `indigo-pop`** fades over a dark game (about 1.8:1); the cream line is what separates it.

### File names per style

| Piece | Main style | `cream-soda` (likewise `fine-line`, `indigo-pop`) |
| --- | --- | --- |
| Chat | `chat/sticker-pop-chat-standard.webm`, `…-standard-plain.webm` | `chat/sticker-pop-chat-standard-cream-soda.webm`, `…-standard-cream-soda-plain.webm` |
| Block | `text-boxes/sticker-pop-label.webm`, `…-label-plain.webm` | `text-boxes/sticker-pop-label-cream-soda.webm`, `…-label-cream-soda-plain.webm` |
| Border | `borders/sticker-pop-webcam-16x9.webm`, `…-webcam-16x9-plain.webm` | `borders/sticker-pop-webcam-16x9-cream-soda.webm`, `…-webcam-16x9-cream-soda-plain.webm` |
| Screen frame (plain only) | `borders/sticker-pop-fullscreen-plain.webm` | `borders/sticker-pop-fullscreen-cream-soda-plain.webm` |
| Mask (shared) | `masks/sticker-pop-webcam-16x9-mask.png` | the same file |

Each WebM has its PNG of frame 0 beside it. The longest buyer path, `borders/sticker-pop-fullscreen-vertical-indigo-pop-plain.webm`, has 61 characters (limit 100).

## With and without ornaments

Every chat, block and webcam ships twice: with the `sticker` ornaments and as a `plain` twin (`{"ornaments": "none"}`, file suffix `plain`). The screen frames (`fullscreen`, `fullscreen-vertical`) ship only plain, and the kit has no Twitch panel. The plan is 453 files: the five backgrounds (WebM and PNG), then, in each of the four [box styles](#four-box-styles), 5 chats, 10 blocks and 9 webcams in each variant and the two screens plain (100 files a style, WebM and PNG), 7 masks shared by every style, one per rectangular webcam and one for the three round ones, and the 18 loose stickers below (WebM and PNG). `npm run render:pack -- sticker-pop --dry-run` estimates about 4.29 GiB and 8 h 4 min: ~45 MiB and ~5 min per background, ~14 MiB and ~2 min per sticker. The estimate is an upper bound: the size line is measured on 1080p `master` renders, and a `delivery` WebM, a 304×304 sticker most of all, should weigh far less. The kit ships as one pack; if the measured zip passes about 2 GiB, splitting the styles into a pack of their own goes back to the owner (2026-11-22).

## Loose stickers

The kit also ships its three ornament motifs as loose animated stickers, one per file (`StickerLoop`, the `sticker` kind, folder `stickers/`): the five-point star, the four-point sparkle and the bolt, each in the stage's six colours, 18 files of each format (owner, 2026-11-22). Each sticker is 256 px tall at rest, its 6 px ink line and 4 px cream rim included, centred on a transparent 304×304 square, the same canvas for every motif, so they sit at one scale side by side in OBS. It moves on the same steps as the ornaments and has no seed: frame 0, the PNG, is the rest pose.

Files are named motif first, `stickers/sticker-pop-sticker-<motif>-<colour>.webm` and `.png`, with the colours `orange` (`#F4A66C`), `cream` (`#F6E2E4`), `yellow` (`#E9BA67`), `blue` (`#9AC7F2`), `lilac` (`#EE9DE6`) and `pink` (`#F74CA9`, the stage's `accentColor`); the first five are the stage's `stickerColors`. All share the preset `sticker-pop-sticker` (12 s, ink `#4A3A69`, rim `#F6E2E4`, rim 4); each item sets only `motif` and `fill`. `tests/helpers/themes.ts` names the 18 variants in this order as the kit's exception (`KIT_STICKERS`), and `tests/pack.test.ts` holds each to its folder, formats, preset and the stage colour its name says. `npm run qa:kit -- sticker-pop` adds a `sheet-sticker` contact sheet, six a row on the checker.

The ornaments never go to the right, below or at the bottom right corner, where the side shows, and on rectangular borders never on the top, where the title bar and its buttons are (slots in [Overlays](../overlays.md#ornaments)). The labels (`label-sm`, `label`) and the round blocks carry no bolt.

## In OBS

- Keep a margin free around each piece, up to the screen edge and between one piece and the next: 32 px round the chats and most blocks, 24 px round `label-sm`, `label` and `circle-sm`, 48 px round the webcams, and 72 px on `webcam-16x9-lg` and 96 px on `gameplay`, where the ornaments are enlarged (`ornamentScale` 1.5 and 2). The stars and sparkles stand out past the left and top corners, the side reaches `depth` + 3 px past the bottom and the right, and the border's title bar grows into the top bleed, so a piece set flush against the edge or another piece cuts them.
- The chat panel is opaque cream: the buyer's chat widget needs dark text; the ink `#4A3A69` reads on it.
- Start the background and the overlays together, in the same scene and with the same restart-on-activate option, so the pieces' steps and the background loop in step (any of the five: they all loop in 12 s).
- The webcam masks cut the camera to the rounded window for OBS (see [Masks](../packs.md#masks)).
