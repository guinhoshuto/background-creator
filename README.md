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

- **A colour-dodge light multiplies the lights already painted under it.** A layer of colour S adds the gain S/(1 − S) to whatever is there: a cold flash over the candles made the wax flare (+50 luma). Lay a new light before the warm ones, or over the base only. Fall off in the stop colour (`dodge(gain × fraction)`, a stop every 0.1), never in `stop-opacity`: at full gain a mid-tone already saturates, and the fading edge paints it white. Two gains on one spot multiply, (1 + g₁)(1 + g₂). Measure a light on the same frame with and without it, per channel. Worked example: the lights in `src/backgrounds/HauntedInteriorLoop.tsx` and their test in `tests/haunted-interior.test.ts`.
- **No `mix-blend-mode` in a background's markup.** In a transparent export its mere presence, even at zero gain, changes the anti-aliased alpha of other elements' edges, and differently on each render; in an opaque one, a blended group made each frame depend on the frames rendered before it (Christmas, up to 36/255). Three still blend, none measured: Cobweb (`screen`) and HauntedInterior (`color-dodge`) only when opaque, and Wuthering Waves (`soft-light`) in every format, transparent included. Measure a new one first (`npm run stills` with `sequences`). Over alpha, a light is a plain cover that adds α·(C − B), with C picked per surface, like the flash covers in `HauntedInteriorLoop.tsx`.
- **WebGL needs its own OpenGL renderer, per composition.** Remotion's headless shell with the default `gl` returns no WebGL2 and renders blank frames without an error, so a WebGL composition declares `gl: 'angle'` in `src/catalog.tsx` and `ShaderCanvas` throws when WebGL2 is missing. Never turn `angle` on for the whole project: the same SVG frame changes under it (up to 123 levels on opaque pixels). In GLSL, hash with integers (`pcg`), not `fract(sin(x) * 43758.5)`, which differs between ANGLE-Metal and SwiftShader on the same pixel.
- **Remotion downloads its Chrome Headless Shell next to the nearest `package.json` above the working directory** (`node_modules/.remotion`), or into `<cwd>/.remotion` when there is none, as in a scratch folder. Run scripts from the repo, or set `REMOTION_BROWSER_EXECUTABLE` to a browser already downloaded (`scripts/export.ts` and `scripts/validate-exports.ts` read it), and delete a stray download when done.
