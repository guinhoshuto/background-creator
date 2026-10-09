# Background Creator

Animated **1920×1080** backgrounds and animated overlays for stream packs — chat backgrounds, text boxes and borders for the camera and the game —, made with Remotion, React and TypeScript. Tune the parameters in the Studio or in JSON and export a seamless loop as WebM, MOV, MP4 or GIF, or a still frame as PNG, without audio. Overlays are born transparent and come out at each product's size; a single command builds a theme's whole pack.

## Install

Use Node.js 22 or later and npm. In the project folder:

```sh
npm ci
npm run studio
```

The first render may download the Chrome Headless Shell Remotion uses. For GIF and export validation, also install full FFmpeg and FFprobe (validation uses features the FFmpeg bundled with Remotion lacks) and keep the executables on the `PATH`. If needed, set `FFMPEG_PATH` and `FFPROBE_PATH` to the executables' full paths.

## Quick start

Pick a composition in the Studio and edit its properties in the side panel. Compositions live in four folders, one per [asset kind](docs/asset-kinds-and-sizes.md): `backgrounds` (full-screen loops), `chat` (`ChatLoop`), `text-boxes` (`BlockLoop`) and `borders` (`BorderLoop`). The full list is in [Compositions](docs/parameters-and-presets.md#compositions); `npm run render:webm -- --list` prints it with every size.

Export with the official commands, which apply the quality presets:

```sh
npm run render:mp4 -- HalloweenLoop --props presets/halloween-midnight.json
npm run render:webm -- ParticleLoop --props presets/particles-alpha.json --duration 12 --seed 2026
npm run render:webm -- ChatLoop --props presets/chat-neon.json --size chat-standard
npm run render:png -- BorderLoop --props presets/border-pastel.json --size webcam-square --frame 120
npm run render:pack -- halloween-midnight --dry-run
npm run zip:pack -- halloween-midnight
```

Files go to `out/`; existing files are kept unless you pass `--overwrite`. Packs go to `out/packs/<theme>/` and the buyer's zip to `out/deliveries/`.

## Docs

| Doc | What it covers |
| --- | --- |
| [Compositions, parameters and presets](docs/parameters-and-presets.md) | Every composition and its controls, the shared parameters, the presets in `presets/` |
| [Asset kinds and sizes](docs/asset-kinds-and-sizes.md) | Kinds, the box/bleed/text area model, the catalog sizes |
| [Overlays](docs/overlays.md) | Fill, stroke and glow controls, `ChatLoop`/`BlockLoop`/`BorderLoop` controls, ornaments, themes |
| [Formats and export](docs/export.md) | Format profiles, the alpha rule, render commands, output names, the position JSON |
| [Packs and delivery](docs/packs.md) | Pack manifests, `render:pack`, masks for OBS, `zip:pack` and the buyer's zip |
| [How the loop works](docs/loop.md) | Seamless loops, whole laps along the stroke, actual speeds |
| [Development and validation](docs/development.md) | Checks, tests, `validate:exports`, visual verification, adding an asset |
| [Halloween kits](docs/kits-halloween.md) | Spec and decisions of the four Halloween overlay kits |

Backgrounds, one doc each:

| Doc | Composition |
| --- | --- |
| [Wuthering Waves: Azure Lotus](docs/themes/wuthering-waves.md) | `WutheringWavesLoop` |
| [Watercolor: pigment flow](docs/themes/watercolor.md) | `WatercolorLoop` |
| [Halloween: autumn night](docs/themes/halloween-autumn-night.md) | `HalloweenLoop` |
| [Halloween: haunted mansion](docs/themes/halloween-haunted-mansion.md) | `HauntedMansionLoop` |
| [Halloween: mansion interior](docs/themes/halloween-mansion-interior.md) | `HauntedInteriorLoop` |
| [Halloween: spider webs](docs/themes/halloween-spider-webs.md) | `CobwebLoop` |
| [Christmas: gilded garland](docs/themes/christmas.md) | `ChristmasLoop` |
| [Kawaii: pastel constellation](docs/themes/kawaii.md) | `KawaiiLoop` |
| [Vaporwave: neon horizon](docs/themes/vaporwave.md) | `VaporwaveLoop` |
| [Dots: moving pattern](docs/themes/dots.md) | `DotGridLoop` |
| [Checkerboard: moving board](docs/themes/checkerboard.md) | `CheckerboardLoop` |
| [WebGL: shader experiments](docs/themes/webgl.md) | `WebGLLoop` |

`SunburstLoop`, `GradientLoop`, `ParticleLoop` and `GeometricLoop` have no doc of their own: their controls are in [Compositions](docs/parameters-and-presets.md#compositions).

## Known pitfalls

- **A pack loop over 14.5 s does not fit a listing video.** The thumbnail generator takes at most 14.5 s (Etsy, 15 s), and the haunted kits loop in 16 s (960 frames); cutting the loop short jumps when Etsy replays it. `npm run qa:kit -- <pack> --video mock-chatting` writes `mock-chatting-listing.mp4` next to the loop: the first 14.5 s with the last second faded into the loop's own last second, which runs into frame 0 (chosen on 2026-10-05 over speeding the loop up or cutting at 8 s; see Listing video in `docs/packs.md`).
- **A video render keeps every frame in `$TMPDIR` until it encodes.** With `disallowParallelEncoding` (`scripts/export.ts`), Remotion writes the frames to `$TMPDIR/react-motion-render*` and only then runs the encoder: HalloweenLoop, 1920×1080, 720 frames, peaked at 1.31 GiB (~0.94 B per pixel-frame) for a 14.3 MiB mp4, measured on 2026-10-05; the folder is gone when the render ends. A WebM with alpha keeps PNG frames too, lighter when mostly transparent (BorderLoop fullscreen, 1920×1080, 720 frames: 154 MiB, ~0.11 B). The disk floor (`scripts/disk.ts`) counts them before every `render:*` and every file of `render:pack`: width × height × frames × 1 byte, plus the estimated file.
- **A colour-dodge light multiplies the lights already painted under it.** A layer of colour S adds the gain S/(1 − S) to whatever is there: a cold flash over the candles made the wax flare (+50 luma). Lay a new light before the warm ones, or over the base only. Fall off in the stop colour (`dodge(gain × fraction)`, a stop every 0.1), never in `stop-opacity`: at full gain a mid-tone already saturates, and the fading edge paints it white. Two gains on one spot multiply, (1 + g₁)(1 + g₂). Measure a light on the same frame with and without it, per channel. Worked example: the lights in `src/backgrounds/HauntedInteriorLoop.tsx` and their test in `tests/haunted-interior.test.ts`.
- **No `mix-blend-mode` in a background's markup.** In a transparent export its mere presence, even at zero gain, changes the anti-aliased alpha of other elements' edges, and differently on each render; in an opaque one, a blended group made each frame depend on the frames rendered before it (Christmas, up to 36/255). Three still blend, measured on 2026-10-03 (30 frames from one tab against fresh stills): HauntedInterior (`color-dodge`, opaque only) came out identical; Cobweb (`screen`, opaque only) and Wuthering Waves (`soft-light`, every format) differ by up to 29 and 24/255 on a few pixels, with or without the blend: the drift has another source (next pitfall). Measure a new one first (`npm run stills` with `sequences`); `tests/backgrounds.test.ts` keeps the list and fails on an unlisted blend, and `tests/markup-snapshot.test.ts` checks that Cobweb and HauntedInterior draw none in a transparent export. Over alpha, a light is a plain cover that adds α·(C − B), with C picked per surface, like the flash covers in `HauntedInteriorLoop.tsx`.
- **A drawing kept across frames is not rastered like a fresh still.** In one render tab, Chrome repaints only the tiles a frame invalidates, and the rest comes from earlier frames: in Cobweb, 28 of 30 frames differed from fresh stills by up to 29/255 along the 256 px tile seams over the moon gradients (BGC-24). A new root `<svg>` per frame (`key={frame}`) makes them identical byte for byte; `tests/cobweb.test.ts` checks the key. It does not hold under `gl: 'angle'`: there even the keyed Cobweb drifts by up to 8/255 on scattered pixels, and Wuthering Waves by up to 24/255, from its swaying lotus flower (15/255 with the flower held still; the gradient and the clip paths play no part). A job shares one browser, and one ANGLE composition puts every still in it under ANGLE, so measure a non-WebGL background in a job of its own. The measured limits live in `tests/determinism-*.json` (`tolerance` per sequence; `npm run stills -- tests/determinism-cobweb.json` reports `ok` per sequence), checked by `tests/stills-job.test.ts`. To find a drift, run `sequences` with `heatmaps: true` and read each frame's `changedBox` in `report.json`.
- **WebGL needs its own OpenGL renderer, per composition.** Remotion's headless shell with the default `gl` returns no WebGL2 and renders blank frames without an error, so a WebGL composition declares `gl: 'angle'` in `src/catalog.tsx` and `ShaderCanvas` throws when WebGL2 is missing. Never turn `angle` on for the whole project: the same SVG frame changes under it (up to 123 levels on opaque pixels). In GLSL, hash with integers (`pcg`), not `fract(sin(x) * 43758.5)`, which differs between ANGLE-Metal and SwiftShader on the same pixel.
- **Remotion downloads its Chrome Headless Shell next to the nearest `package.json` above the working directory** (`node_modules/.remotion`), or into `<cwd>/.remotion` when there is none, as in a scratch folder. Run scripts from the repo, or set `REMOTION_BROWSER_EXECUTABLE` to a browser already downloaded (`scripts/export.ts` and `scripts/validate-exports.ts` read it), and delete a stray download when done.
- **Docs that quote pack, preset or size ids go stale at every naming round.** The English renaming left the Halloween kits spec citing `halloween-noite`, `painel-twitch` and `nevoa`, and its preset values had drifted too (`lightning` 0.6 against 0.8 in the presets). When a doc quotes an id, a symbol or a preset value, check it against `presets/`, `packs/` and `src/` (`grep -rl <symbol> src tests`, or read the JSON) before trusting or copying it; the code wins.
- **A change to `packs/*.json` changes the markup baseline.** `tests/markup-snapshot.test.ts` draws every pack file, and it is not in `npm run test:quick`: `ff9b731` (Twitch panel from GIF to WebM) left it failing, and on 2026-10-04 two sessions regenerated the same baseline in parallel and their merges conflicted. When a commit touches a pack manifest, a preset or an overlay's drawing, run `npx tsx --test tests/markup-snapshot.test.ts` and, if the change is intended, commit `UPDATE_SNAPSHOTS=1` alongside it.
- **A signal sent to a `tsx` script lands in its node child.** `node_modules/.bin/tsx script.ts` is a wrapper that relays SIGTERM, SIGINT and SIGHUP to the node process it starts: the script's handler runs there, so its `process.pid` is the child's and its `process.ppid` is the wrapper's. `ship:pack` logs an outside signal that way (BGC-29), and the test that sends a real `kill -TERM` (`tests/ship-pack.test.ts`) expects the wrapper as the parent. Node never sees the sender's pid (no `siginfo`): the log names the kill, pkill or killall running at that moment, not a certain sender.
- **A Remotion "Timeout (30000ms) exceeded" in a long render is the machine, not the frame.** On 2026-09-30 the halloween-midnight lower-third died twice at frames 582 and 648, which render in 0.33 s alone, and the whole file renders in about 1.5 min on an idle machine (2026-10-03): the cause was the 8 GB Mac under load, most likely memory pressure. The exporter now waits `FRAME_TIMEOUT_MS` (180 s, `scripts/export.ts`) per frame; if it still times out, time the frame with `npm run stills` before touching the component, free memory and rerun `render:pack`, which resumes where it stopped.
- **A fast oscillation in a scene value fails the seam scan, though the motion is smooth.** `tests/backgrounds.test.ts` compares the velocity just before and just after the seam by finite differences of 1e-6 of the cycle, with a tolerance of 0.1 plus 0.1% of that velocity, per field: a koi's tail beat (18 px, 24 beats per cycle at speed 3) bent the spine points with an acceleration whose error alone, A·(2πn)²·1e-6 ≈ 0.4, passed it whenever the other axis moved slowly. Send the oscillation's phase as a cosine and a sine and bend in the shader, like `uBeat` in `src/backgrounds/watercolor/koi.ts` (2026-10-09).
