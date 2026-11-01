# Wildfire Smoke

`WildfireSmokeLoop` is a wall of wildfire smoke, backlit in red: a procedural volume rendered in
Blender 5.2 (EEVEE) as a sequence of 480 WebP frames, which the Remotion composition plays frame by
frame. Nothing is drawn in code beyond that. 1920 × 1080, 60 fps, one exact 8 s loop, opaque.
Direction D-06 was chosen by the owner on 2026-11-01, out of a direction sheet of four looks and two mixes.

## Build and preview

The frames live in `public/wildfire-smoke/` (gitignored) with their `manifest.json`, and come from
`scripts/create-wildfire-smoke.py`, run by the Blender installed on the connected Sandisk:

```sh
npm run preview:wildfire   # 25 %, 8 samples, frames 0, 60, …, 420 and 480, to out/.scratch/wildfire-smoke/preview/
npm run build:wildfire     # the whole sequence, to public/wildfire-smoke/
npm run studio
```

Both enter the machine render queue through the vault's `render-slot.ts` (`run --`), like every
render: never run Blender for the sequence from a window. `df -h /` first; the full render stops
below the disk floor. The script takes, after `--`: `--output-dir <dir>` (required), `--frames A-B`
(default 0-479), `--samples N` (default 16), `--percent N` (default 100), `--preview` and
`--manifest-only`. A partial `--frames` run leaves `complete: false` in the manifest, and the
composition refuses it until the rest is rendered. The script has no flag that changes the look:
the look is its constants, so the same script always gives the same frames.

The manifest: `{"name": "wildfire-smoke", "version": 1, "width": 1920, "height": 1080, "fps": 60,
"frames": 480, "loop": true, "direction": "D-06", "blender": "5.2.2", "script_sha256": "<sha of the .py>",
"samples": N, "percent": N, "complete": bool, "rendered": [[first, last], …]}`. `rendered` holds the
inclusive frame ranges on disk; every run updates it and `complete`.

After the frames exist, the export is the official one:

```sh
npm run render:mp4 -- WildfireSmokeLoop --props presets/wildfire-smoke.json
```

## The scene (D-06)

Three layers, all procedural (no Mantaflow, no photographs, no generated images):

- **Haze behind** (the D-02 layer): a volume slab at y 3.5..8.5, Principled Volume, density 0.75,
  noise with a pixel value of 1.6; it fills the frame with ember haze.
- **Smoke wall in front** (the D-01 layer): a slab at y −3..3, noise pixel value 1.3; the dense
  plumes with structure that read as the fire's own smoke.
- **Backlight** (the D-03 lighting): an area light between the two layers, at y 3.2, so the front
  wall is lit from behind and its edges glow red; a 150 W fill; world colour `#260401`, which keeps
  the top of the frame a dark red rather than black.

The owner's brief was «smoke of flames, as in a wildfire, with a lot of red», and the picked
frame reads 27 / 47 / 73 in luminance by thirds (top / middle / bottom), red at 100 % with no
blow-out. The scene parameters are the constants at the top of `scripts/create-wildfire-smoke.py`
(`SLAB`, `LOOP_FRAMES`, the lights and the materials); the exploration they came from is
`.cache/wildfire-smoke/directions.py` (`MIX['D-06']`), outside git.

## The loop

- **Rising smoke that closes on itself.** The density is a 4D noise. The two spare dimensions take
  the vertical axis on a circle: `(cos, sin)` of `2π · (z / L − t)`, with `t = frame / 480` by a
  driver. Going up by one height `L` is one turn of the circle, and so is one cycle of time: the
  smoke rises one height per cycle, and frame 480 is frame 0. Measured on 2026-11-01: frame 480
  against frame 0 differs by at most 1/255; frame 60 differs (it is not a still).
- **Flicker with whole periods.** The lights flicker by drivers with 7, 11 and 17 turns per cycle
  (±12 %), so each one returns to its frame-0 value at frame 480.
- **No randomness.** Nothing in the script is random; `t` is the only time, and it comes from the frame.

## Light calibration in EEVEE

The first rig, lit the way a Cycles scene would be, saturated: the lights that read right at
960 × 540 (128 volume steps) were **1/6 of the first attempt**. In the two-layer mix the rig went
down again, to **0.35**, with exposure −0.8: at 1.0 and −0.3, 26 % of the pixels blew out. Judge
the light by numbers on a still (luminance per third of the frame, clipped share, red at 100 %),
not by eye in the viewport.

## Render cost (2026-11-01, 1920 × 1080, M2 with 8 GB, from the window)

| Settings | Per frame | Against the first |
| --- | --- | --- |
| TAA 16, 128 volume steps, shadows 16, froxel 2 px | 44 s | — |
| TAA 12, 128 volume steps, shadows 16, froxel 4 px | 7.2 s | at most 3/255, mean 0.05 |

The final render uses TAA 16 and 4 px froxels: about 8 s a frame, 480 frames ≈ 65 min through the slot.

## The Remotion side

- `src/backgrounds/wildfire/manifest.ts`: pure functions, no frames and no Blender needed to test them.
  `parseManifest` accepts the manifest above and nothing else; `manifestProblems` lists why a
  sequence cannot be shown (missing, incomplete, wrong size or fps, not a loop, stale when the
  script's sha is given); `frameFileOf(frame, total)` names the file (`0000.webp`); `sequenceFrame`
  is the clock below.
- `src/backgrounds/WildfireSmokeLoop.tsx` fetches `wildfire-smoke/manifest.json` through
  `staticFile` under `delayRender`, and refuses with
  «The wildfire smoke frames are missing, incomplete or stale: run npm run build:wildfire with the
  Sandisk connected.» followed by the reasons (`cancelRender`). Once the manifest passes, every
  frame is one `<Img>` covering the canvas, over `backgroundColor` (`#260401`), which shows only
  where a frame is missing.
- **The clock.** The composition shows sequence frame `floor(f · loops · 480 / N) mod 480`, with
  `loops = max(1, round(N / 480))`: at 60 fps and 8 s that is `f`, a 16 s file plays the sequence
  twice, and a GIF (50 fps, 400 frames) skips every fifth frame and still lands on frame 0 at frame
  N. `durationSeconds` accepts only whole multiples of 8 («use 8, 16 or 24 s»), and `transparent`
  is `false`: the scene is opaque.
- `colors` is left out of the schema (the sequence does not recolour); the inherited `seed` has no
  effect. Preset: `presets/wildfire-smoke.json` (the defaults).
- Checks: `npm run test:quick -- tests/wildfire-smoke.test.ts`; the preset is in the list of
  `tests/backgrounds.test.ts`.

`npm run validate:exports -- --composition WildfireSmokeLoop` samples it opaque in MP4, WebM and GIF over one 8 s pass (480 frames; 400 in the 50 fps GIF): the schema refuses the validator's 0.4 s sample and alpha, and the validator says so before rendering (`scripts/validate-fixtures.ts`).

## Embers (`sparks`)

The second look, asked for on 2026-11-01 («com fagulhas, saindo do canto inferior»), draws embers in code over the frames (`src/backgrounds/wildfire/sparks.ts`), never in Blender: a particle system there would not close the loop (the embers alive at frame 480 are not the ones of frame 0) and would cost another 80-minute render. `sparks` picks the source: `bottom-right` or `bottom-left` (a strip of 320 px at the corner, drifting inwards) or `bottom` (the whole edge, drifting either way); `sparkCount` lays out the slots, `sparkSize`, `sparkRise` (px/s), `sparkTrail` (the streak as a share of the motion over 60 ms) and `sparkAngle` (degrees from vertical towards the middle of the frame, for a corner; the owner asked for a diagonal rise on 2026-11-01) shape them, and `seed` places them. Each slot lives 1 to 4 whole times per 8 s loop, born at its own phase, so an ember crosses the seam 479 → 0 at the speed of any other frame, at every duration and FPS the schema allows (the GIF follows the same sequence frame); it fades in over 0.15 s, flickers, cools from white-yellow through orange to deep red and fades out over the last third of its life, and most die inside the frame. The glow is a radial gradient in plain alpha: no blend mode (README, Known pitfalls). The direction sheet of 2026-11-01 (`out/review/2026-11-01-wildfire-sparks-directions/`: D-01 sparse embers, D-02 ember rain, D-03 big slow embers, D-04 fast sparks with streaks) chose D-02, thinned and warmed, in two presets: `wildfire-smoke-sparks-corner` (bottom-right, tilted 40 degrees) and `wildfire-smoke-sparks-bottom` (the whole edge, straight up, 300 slots for a similar density). `tests/wildfire-smoke.test.ts` checks the determinism, the frame wrap at 8 and 16 s and in the GIF, the seam speed (the check that a period not dividing the loop fails), the source strip, the fade and the colours.

## Pack

`background-wildfire-smoke` (`packs/background-wildfire-smoke.json`) sells the print alone, as the owner chose on 2026-11-01 (a kit may follow): the loop as MP4 and WebM and a PNG still, compressed with the `delivery` profile, version 1; the listing text is `listings/background-wildfire-smoke.md`. It builds and ships like every pack ([Packs](../packs.md)):

```sh
npm run render:pack -- background-wildfire-smoke --dry-run
```

## Pitfalls

- **The 25 % preview does not predict the sharpness of the full-size render.** The volumetric
  froxel is sized in pixels of the output resolution, so a 2 px froxel is a different fraction of
  the frame at 480 × 270 and at 1920 × 1080. Judge sharpness and measure cost on a full-size frame
  (the table above).
- **Blender 5.2 names.** The view transform `look` is `AgX - Base Contrast`; the engine identifier
  is `BLENDER_EEVEE`. Read enum identifiers from `bl_rna`, never hardcode them from an older version.
- **The bundle copies `public/` whole.** Without `symlinkPublicDir: true` every Remotion bundle
  (`scripts/export.ts`, `stills`, `validate:exports`) copies the 480 frames into the bundle folder.
  Measure the sequence's size and the bundle time before turning the symlink on; the Y2K sprites
  (`wip/y2k-composition`, c27606c) have a test that requires it for every `bundle()` in `scripts/`.
- **`Img` and a missing frame.** The manifest check runs first, so a missing file is reported with
  the `build:wildfire` way out; a frame deleted after the manifest was written fails Remotion's
  own `<Img>` load, with the file's name.

## Provenance

The volume, its materials and its lights are code in `scripts/create-wildfire-smoke.py`. The six
Creative Commons photographs fetched by `npm run reference` into the vault's
`Visual Ref/Wildfire Smoke/` (with their `sources.json`) informed only the density of the plumes,
the share of red and the dark top of the frame; no pixel of theirs is in the scene.
