# Prismatic Pop vertical

Three owner-approved original vector looks: **Electric Candy**, **Night Signal** and **Sugar Voltage**. Their colors, cut-paper shapes, ribbons and halftone are drawn in SVG; there are no image assets. Visual research used the [official REVENGE POP exhibition](https://revenge-pop.mikapikazo.info/) only to study palette and graphic density. The reference image remains outside Git and is never included in a render.

## Composition and layout contract

`PrismaticPopLoop` uses `STACKED_LAYOUT_VARIANTS`, the shared [four-variant standard](../vertical-overlays.md#standard-four-variant-delivery-matrix): arched and uniformly rounded rectangular windows, each with regular and compact spacing. Every look includes all four. Camera and game remain 860×484, on a 1080×1920 canvas at 60 fps. The chat field is open for native LIVE comments.

The raw camera/game gap is 56 px or 40 px. The outer ink extends 19 px from each hole, leaving 18 px or 2 px of actual clearance. The rectangular camera takes the lower window's uniform 56 px corner radius. Window positions, rings and filled background plates stay fixed. Native comments use the open lower-left space: the full-width background gradually settles into a readable tone from the same palette, without a separate rectangle, outline or clipped edge around the chat. No art enters the transparent windows.

Shapes are deliberately simple. Thick ribbons continue outside the canvas on both ends; do not introduce isolated cut ends or irregular hanging plates. All layout siblings need a visual check of corners, supports and the narrow gap.

## Animation and plain versions

The loop is 8 seconds. The first version moved only one halftone tile and barely changed glints; the owner found it visually static. Version 3 refines the motion of each motif:

- Electric Candy: anchored ribbons flex with solid, uninterrupted color; no marks travel inside them. Selected angular plates move continuously at uniform speed.
- Night Signal: contrasting satellites follow the actual ellipses, making one complete orbit per loop; each rail keeps its own rotation and phase.
- Sugar Voltage: the ribbon control points move in opposing smooth waves, bending the curls without translating the whole composition or exposing a cut end.
- All looks: halftone advances four 15 px tiles per loop. Glints gently rock and breathe on staggered four-second cycles, between 0.78–1.08 scale and 0.8–1 opacity.

Selected polygons in all three looks follow a tiny circular translation with a 2 px radius, at one revolution per second (eight per loop). Speed is constant, with no holds, discrete steps or easing; phase offsets keep neighbors out of sync. Position and velocity close at the loop seam. Windows, rings and the chat field stay fixed.

Ribbon endpoints remain fixed outside the canvas; only the internal control points flex (up to 28 px). Smooth sine waves and whole-turn linear motion close in position and velocity, driven only by frame and seed. No full-screen flashes or movement in the reading area. The SVG is recreated per frame to prevent stale raster tiles. `ornaments: false` removes artwork and motion, retaining the continuous palette background and the rings.

## Presets and pack

- `presets/vertical-prismatic-pop-electric-candy.json`
- `presets/vertical-prismatic-pop-night-signal.json`
- `presets/vertical-prismatic-pop-sugar-voltage.json`
- `packs/prismatic-pop-vertical.json`, version 2

The pack plans **76 files**: 3 looks × 4 layouts × decorated/plain × PNG/WebM/MP4, plus one safe-zone guide PNG per layout. Variants are `<look>-<layout suffix>[-plain]`. PNG and WebM retain alpha; MP4 composites over `#00FF00`, for a chroma-key filter in the streaming application. Place camera/game sources behind the overlay. The green-screen alternative needs a key filter; use WebM where alpha is supported.

`npm run render:pack -- prismatic-pop-vertical --dry-run` checks the plan and estimates size/time. `npm run qa:kit -- prismatic-pop-vertical` generates the portrait QA. Pack rendering, readback validation, zip and shipping use the usual official commands after the owner reviews the new layouts. The guide PNG is a placement reference, not a live layer. No final pack has been shipped by this implementation phase.

## Verification

`tests/prismatic-pop.test.ts` covers geometry clearance, all look/layout/plain/format combinations, alpha policy, motion periodicity/velocity and vertical QA coverage. Existing vertical tests cover safe-zone crossings and nested window clipping. Markup snapshots pin every new layout and pack drawing while retaining legacy hashes. Pixel QA uses official stills, per-window alpha, enlarged corner/bridge crops, loop seams and fresh-versus-sequential render determinism.
