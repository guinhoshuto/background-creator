# Sakura vertical overlays

Four full-screen 1080x1920 live frames, rendered at 60 fps over an 8-second seamless loop. The frame interior is transparent. These are one layout in four art directions, not sixteen combinations of the original neutral vertical layouts.

| Reference | Style | Treatment |
| --- | --- | --- |
| SK-01 | `watercolor` | Blush washes, fine veins, translucent pigment accents and warm branches |
| SK-02 | `moonlit` | Lavender blossoms, luminous edges and dark sculpted branches |
| SK-03 | `botanical` | Muted sage, flat five-petal flowers and a sparse reversed corner arrangement |
| SK-04 | `relief` | Layered pale pink petals, lavender leaves and soft relief shadows |

## Provenance

The owner explicitly requested generated Sakura references on 2026-11-12 and approved all four with “vamos fazer as 4”. The source tool was native OpenAI ImageGen, with no external reference artwork. The original PNGs and complete generation prompts are preserved outside git at `/Users/guilhermeshuto/dev/firulas/obs-stingers/out/review/2026-11-12-sakura-overlay/` (`sk-01.png` through `sk-04.png`, and `provenance.json`). This note is recorded before adapting their visual direction.

All delivered artwork is original React/SVG code in `src/overlays/vertical/SakuraFrameLoop.tsx`. No raster reference, traced outline, downloaded font or external artwork is embedded. The solid concept backgrounds are intentionally replaced by real transparency for live content. Empty decorative capsules are omitted; a nameplate appears only when `label` has text.

## Composition and motion

`SakuraFrameLoop` is registered as kind `vertical`. The four presets are `vertical-sakura-<style>`. `motion` sets branch sway and petal visibility; `petals` controls the number of sparse edge petals; `label` is optional. `safeZones` produces a separate static guide.

The main clear window is x=156, y=344, width=768, height=1186, with 40 px corner radii. All ornament, shadow and petal rendering is clipped outside it. Most of the remaining screen is also transparent. A low-opacity mask quiets decoration behind native comments. The border does not move. Branches sway by less than one degree and share their attached blooms; petals use a periodic phase with a zero-derivative opacity envelope at their wrap.

The guide uses the existing LIVE/feed zone data dated 2026-10-28. UI placement can vary by device; the guide is a placement aid, not an app interface asset. `LiveUiMock` and `FeedUiMock` appear only in review images and never in a delivery.

## Delivery

Four local packs: `sakura-watercolor-vertical`, `sakura-moonlit-vertical`, `sakura-botanical-vertical`, `sakura-relief-vertical`.

Each contains the static transparent PNG, the animated alpha WebM, the animated green-screen MP4, and a static safe-zone PNG. The green background comes from the preset's `backgroundColor` only for MP4; PNG and WebM use the shared alpha rule. The `master` export profile keeps the repository's established quality.

Use `npm run render:pack -- <pack> --wait-disk`, `npm run validate:pack -- <pack>` and `npm run zip:pack -- <pack>`. These files are local deliverables; no listing, R2 upload, merge or publication is part of this task.

## Verification

The focused test covers all four presets, the alpha rule, fixed portrait geometry, active clipping, exact period, actual motion, stationary guide and escaped labels. The official stills job samples all styles, the central alpha region, loop seams, deterministic rendering, bright/dark backdrops and the existing LIVE/feed mocks. Image inspection must check branch-to-flower attachment and the relief edges at full size.
