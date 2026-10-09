# Formats and export

## Formats

| Format | Official profile | Alpha | Where to use it |
| --- | --- | --- | --- |
| WebM | VP9, 60 fps, CRF 0, `yuv420p` or `yuva420p` | Kept when requested | OBS (media and browser source), StreamElements, Streamlabs, Chrome, Firefox and Edge. Safari does not show VP9 alpha |
| MOV | ProRes 4444, 60 fps, `yuv444p10le` or `yuva444p10le` | Kept when requested | Premiere, After Effects, DaVinci Resolve and Final Cut |
| PNG | One RGBA frame (`--frame`, default 0) | Kept when requested | Still version of the overlay, Twitch panels, image editors |
| MP4 | H.264, 60 fps, CRF 1, `yuv420p`, preset `veryslow` | Composited over `backgroundColor` | Any player and social network |
| GIF | 50 fps, global palette of up to 256 colors, `sierra2_4a` dithering, infinite loop | Composited over `backgroundColor` | Twitch panels and places that only take images |

These are the `master` profile, the default and what every pack has shipped with: near lossless and heavy (the Halloween zips weigh 0.5 to 1.4 GB). `--profile delivery` (or `"profile": "delivery"` in a pack manifest) lowers only the CRF of WebM (VP9 CRF 20) and MP4 (H.264 CRF 16); MOV, PNG and GIF come out the same under both profiles. The delivery values are a first guess, measured before the owner fixes them (BGC-7).

The alpha rule is the same in the preview and the export: `transparent: true` only removes the background in WebM, MOV and PNG. MP4 has no alpha channel, and GIF only has 1-bit transparency, on or off, which would jag glows and soft edges; that is why both are always composited over `backgroundColor`. With `transparent: true` in one of those formats, the terminal warns `Transparency composited over <color>.` What the background docs say about transparent WebM applies equally to MOV and PNG.

ProRes 4444 MOV is for editing, not for streaming: it keeps full color and a 10-bit alpha, and the file is huge. One second of `label` (528×144) is about 5.9 MB, and an 8 s full-screen MOV is around 1 GB. For comparison, one second of WebM on a webcam border is about 1.4 MB. The MOV render turns hardware acceleration off, because the system encoder does not write ProRes with alpha.

## Export

Use the official commands to apply the quality presets:

```sh
npm run render:mp4 -- HalloweenLoop --props presets/halloween-midnight.json
npm run render:mp4 -- HauntedMansionLoop --props presets/halloween-haunted-mansion.json
npm run render:mp4 -- HauntedInteriorLoop --props presets/halloween-haunted-interior.json
npm run render:webm -- CobwebLoop --props presets/halloween-cobweb.json
npm run render:webm -- KawaiiLoop --props presets/kawaii-constellation.json
npm run render:mp4 -- SunburstLoop --props presets/sunburst-crimson.json
npm run render:mp4 -- SunburstLoop --props presets/sunburst-sand.json
npm run render:webm -- SunburstLoop --props presets/sunburst-ocean.json
npm run render:mp4 -- VaporwaveLoop --props presets/vaporwave-horizon.json
npm run render:mp4 -- VaporwaveLoop --props presets/vaporwave-classic.json
npm run render:webm -- VaporwaveLoop --props presets/vaporwave-alpha.json
npm run render:mp4 -- DotGridLoop --props presets/dots-classic.json
npm run render:mp4 -- DotGridLoop --props presets/dots-alternating.json
npm run render:webm -- DotGridLoop --props presets/dots-alpha.json
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-classic.json
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-diamonds.json
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-tilted.json
npm run render:webm -- CheckerboardLoop --props presets/checkerboard-alpha.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-aurora.json
npm run render:webm -- WebGLLoop --props presets/webgl-alpha.json
npm run render:mp4 -- GradientLoop --props presets/gradient-aurora.json
npm run render:webm -- ParticleLoop --props presets/particles-alpha.json
npm run render:gif -- GeometricLoop --props presets/geometric-orbit.json
```

`--dry-run` prints the file, its estimated size and the disk the render takes (the frames kept before the encode plus the file), and says whether the disk floor (`scripts/disk.ts`) would refuse it, exiting with code 1 if so; it renders nothing and does not wait for the render slot. The size comes from the master WebM measured for packs, so under `delivery` it reads as an upper bound; MP4 and MOV have no measured size yet.

```sh
npm run render:webm -- HalloweenLoop --props presets/halloween-midnight.json --profile delivery --dry-run
```

You can choose the destination, duration and seed:

```sh
npm run render:webm -- ParticleLoop --props presets/particles-alpha.json --duration 12 --seed 2026 --out out/particles-12s.webm
```

Overlays use the same commands, with the size in `--size` (the ids in [Sizes](asset-kinds-and-sizes.md#sizes)) or in `--width`, `--height` and `--bleed`, in even pixels. `render:mov` produces ProRes 4444 for video editors and `render:png` produces a still frame, frame 0 or the one in `--frame`:

```sh
npm run render:webm -- ChatLoop --props presets/chat-neon.json --size chat-standard
npm run render:mov -- BlockLoop --props presets/block-glass.json --size lower-third
npm run render:gif -- BlockLoop --props presets/block-halloween.json --size twitch-panel
npm run render:webm -- BorderLoop --props presets/border-halloween-cobweb.json --size webcam-round
npm run render:png -- BorderLoop --props presets/border-pastel.json --size webcam-square --frame 120
npm run render:webm -- BlockLoop --props presets/block-neon.json --width 800 --height 120 --bleed 32
npm run render:webm -- --list
```

`--list` shows the compositions of each kind and the catalog sizes, with the box, the final file and the use; `--help` shows every option. A size of another kind is refused with the valid options (`Size card is for text boxes, not chat backgrounds. Options: …`), and backgrounds refuse `--size`, `--width`, `--height` and `--bleed`, because their size is fixed. `--frame` only applies to PNG and must be inside the cycle, from 0 to N−1.

The command's format replaces `outputFormat` from the JSON; `--duration` and `--seed` replace their respective values. The order of precedence is: the `--props` JSON, then the size from `--size`, then `--width`, `--height` and `--bleed`. Without `--out`, the destination follows the kind:

- Backgrounds: `out/<Composition>.<format>`, for example `out/VaporwaveLoop.webm`; with `--props`, the preset name goes at the end: `out/WebGLLoop-webgl-aurora.mp4`.
- Overlays in a catalog size: `out/<Composition>-<size>.<format>`, for example `out/ChatLoop-chat-standard.webm`. This applies when box, bleed, fit and shape match the size exactly (the same 400×400 box gives `webcam-square` or `webcam-round`, depending on `shape`).
- Overlays in a free size: `out/<Composition>-<W>x<H>.<format>`, with the width and height of the box, not of the file: `out/BlockLoop-800x120.webm`; on a circle outside the catalog, the shape goes into the name: `out/BlockLoop-300x300-circle.webm`.

Existing files are kept; add `--overwrite` to replace them on purpose. Before the render, the terminal reports the file dimensions, the number of frames and the effective duration. For overlays, it also reports the actual motion speed, which may differ a little from the requested one because the cycle must close in whole periods (see [How the loop works](loop.md)):

```text
ChatLoop: 464×664, 60 fps, 480 frames (8.000 s).
Actual speed: stroke 163.6 px/s, fill 16 px/s (rounded to whole periods per cycle).
```

### Position JSON

Every exported overlay gets, next to it, a position JSON with the same name and `.json` at the end (`out/ChatLoop-chat-standard.webm.json`). It says where each thing is inside the file, in pixels from the top left corner, to place the text, the chat widget or the camera without measuring on screen:

```json
{
  "file": "ChatLoop-chat-standard.webm",
  "kind": "chat",
  "size": "chat-standard",
  "canvas": {"width": 464, "height": 664},
  "box": {"x": 32, "y": 32, "width": 400, "height": 600},
  "content": {"x": 51, "y": 101, "width": 362, "height": 512},
  "hole": null,
  "header": {"x": 51, "y": 47, "width": 362, "height": 24},
  "bleed": 32,
  "fps": 60,
  "frames": 480,
  "format": "webm",
  "alpha": true,
  "motion": {"strokeSpeed": 163.6, "fillSpeed": 16}
}
```

`canvas` is the file; `box`, the box; `content`, the area for the messages or the text; `header`, the chat's title area; and `hole`, on the border, the window that stays transparent in every frame. With this file at (X, Y) in the OBS scene, at 100% scale, the chat widget goes at (X + 51, Y + 101), at 362×512. The JSON also records `bleed`, FPS, frames, the PNG's frame (`frame`), the format, whether there is alpha, the actual speed (`motion`) and, in `props`, every parameter used. The standalone command does not produce the border's window mask nor mention it in the JSON: the pack produces it and points to it in `manifest.json` (see [Masks](packs.md#masks) for how to produce it outside a pack). Backgrounds fill the whole screen and have no such JSON.

`guides: true` is for the Studio only: export refuses it with `Turn guides off to export.`, so no file goes out with the checking lines.

### Notes

In PowerShell, if the `npm.ps1` wrapper reads the options as npm arguments, use `npm.cmd` with the same commands (for example, `npm.cmd run render:mp4 -- GradientLoop --duration 8`).

Backgrounds always come out at 1920×1080; chat, blocks and borders come out at the file's size (box + 2·bleed). No format lowers resolution, FPS or quality, and videos use PNG intermediates. GIF is produced by FFmpeg in two passes: analysis of the whole sequence to build the palette, then applying the palette with dithering. The 50 fps cadence uses regular 20 ms delays.

These profiles favor quality and may lead to long renders and large files. GIF has color limits and does not keep partial transparency. MP4 has no alpha channel. Alpha display in WebM depends on the player; a black background in a player does not prove the alpha is missing. The validation command decodes with `libvpx-vp9` to check that channel.

The Studio's manual export dialog allows different settings. Use the commands above to guarantee the official presets. Save the control changes with **Save default props** so the commands use them too, or copy the values into a JSON passed to `--props`. Unsaved changes stay in the preview only. The command's format and the explicit JSON/CLI options win over the saved defaults.
