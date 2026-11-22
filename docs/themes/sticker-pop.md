# Sticker Pop: paper stickers

The `sticker-pop` kit (`packs/sticker-pop.json`, version 1, `profile` `delivery`; presets `chat-`, `block-` and `border-sticker-pop`, ornaments `sticker`; see [Overlays](../overlays.md#themes)) dresses chat, blocks and borders as paper stickers cut out and stuck on the stream: opaque pieces, a thick indigo ink line, a cream thread round it and a flat side under each piece, with stars, sparkles and bolts posed on steps. It ships five backgrounds, each the variant in its file name (`backgrounds/sticker-pop-background-<variant>.webm` and `.png`), in this order:

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

A chat preset keeps `strokeWidth` between 2 and 3 px, unless its theme has a named exception in `CHAT_STROKE_WIDTHS` (`tests/helpers/themes.ts`), added only with the owner's yes. `sticker-pop` is the first: its chat takes exactly 6 px, the same ink line as its block and its frames (owner, 2026-11-21). Any other weight on this chat, 3 px included, fails the test.

## With and without ornaments

Every chat, block and webcam ships twice: with the `sticker` ornaments and as a `plain` twin (`{"ornaments": "none"}`, file suffix `plain`). The screen frames (`fullscreen`, `fullscreen-vertical`) ship only plain, and the kit has no Twitch panel. The plan is 117 files: the five backgrounds (WebM and PNG), 5 chats, 10 blocks and 9 webcams in each variant (WebM and PNG), the two screens plain, and 7 masks, one per rectangular webcam and one for the three round ones (`npm run render:pack -- sticker-pop --dry-run`: about 1.18 GiB and 2 h 14 min, ~45 MiB and ~5 min per background).

The ornaments never go to the right, below or at the bottom right corner, where the side shows, and on rectangular borders never on the top, where the title bar and its buttons are (slots in [Overlays](../overlays.md#ornaments)). The labels (`label-sm`, `label`) and the round blocks carry no bolt.

## In OBS

- Keep a margin free around each piece, up to the screen edge and between one piece and the next: 32 px round the chats and most blocks, 24 px round `label-sm`, `label` and `circle-sm`, 48 px round the webcams, and 72 px on `webcam-16x9-lg` and 96 px on `gameplay`, where the ornaments are enlarged (`ornamentScale` 1.5 and 2). The stars and sparkles stand out past the left and top corners, the side reaches `depth` + 3 px past the bottom and the right, and the border's title bar grows into the top bleed, so a piece set flush against the edge or another piece cuts them.
- The chat panel is opaque cream: the buyer's chat widget needs dark text; the ink `#4A3A69` reads on it.
- Start the background and the overlays together, in the same scene and with the same restart-on-activate option, so the pieces' steps and the background loop in step (any of the five: they all loop in 12 s).
- The webcam masks cut the camera to the rounded window for OBS (see [Masks](../packs.md#masks)).
