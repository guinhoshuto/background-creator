# Compositions, parameters and presets

## Compositions

Pick a composition in the Studio and edit its properties in the side panel. Compositions live in four folders, one per [asset kind](asset-kinds-and-sizes.md#asset-kinds): `backgrounds`, `chat`, `text-boxes` and `borders`. The preview follows the selected format: `webm`, `mov` and `png` allow alpha, while `mp4` and `gif` show the result over the background color.

Backgrounds (`backgrounds` folder) fill the whole screen:

| Composition | Motion | Specific controls |
| --- | --- | --- |
| `WutheringWavesLoop` | Blue-and-gold waterside SVG/WebGL illustration with layered lotus, a curved boat, distant eaves and pine, and procedural paper/ink texture | `atmosphere` (mist), `resonance` (light and ribbon details), `particleCount` (particles), `motion` (movement), `centerShade` (central shading) |
| `WatercolorLoop` | Watercolour painted by a shader on cream paper: pigment pools bleeding wet-on-wet round a light middle (`flow`), misty mountains over a lake (`valley`) or a koi pond (`koi`) | `scene` (painting), `speed` (0–3), `granulation` (0–1), `paperTexture` (0–1), `centerCalm` (0–1) |
| `HalloweenLoop` | Illustrated night with a moon, bats, fog and glowing pumpkins | `batCount` (0–18), `emberCount` (0–120), `fogIntensity` (0–1), `moonScale` (0.5–1.5) |
| `HauntedMansionLoop` | Victorian mansion on the right, cold moonlight, amber windows and low fog | `batCount` (0–12), `moteCount` (0–100), `fogIntensity` (0–1), `windowIntensity` (0–1), `moonScale` (0.6–1.4) |
| `HauntedInteriorLoop` | Gothic hall in central perspective, with the back wall behind the content, moonlit windows, lightning, velvet curtains, candelabra and a swaying chandelier | `dustCount` (0–100), `fogIntensity` (0–1), `candleIntensity` (0–1), `moonlightIntensity` (0–1), `hauntingIntensity` (0–1), `chandelierSway` (0–1), `lightningIntensity` (0–1) |
| `CobwebLoop` | Spider webs in the corners, with dew, silk strands and a hanging spider | `webCount` (0–4), `strandCount` (0–24), `moteCount` (0–120), `spiderCount` (0–3), `dewIntensity` (0–1), `mistIntensity` (0–1) |
| `ChristmasLoop` | Christmas frame on dark evergreen velvet: a gilded pine garland with a burgundy bow across the top, glass baubles swaying on ribbons, frosted pine with cones and holly in the corners, warm garland lights, bokeh and two depths of slow snow around a calm center | `baubleCount` (0–10), `snowCount` (0–240), `bokehCount` (0–48), `sparkleCount` (0–60), `sway` (0–1), `lightGlow` (0–1), `twinkle` (0–1), `centerCalm` (0–1) |
| `KawaiiLoop` | Pastel clouds, hearts and stars in groups, with a clear center | `familyCount` (2–6), `familyScale` (0.7–1.4), `centerClearance` (0–1), `drift` (0–1), `sparkleTrail` (0–4) |
| `SunburstLoop` | A fan of rays leaving the center, with a gradient from the core outwards | `rayCount` (6–48), `rayWidth` (0.15–0.8), `swirl` (0–1), `spin` (−24–24, integer), `coreFade` (0–1), `coreShade` (0–1) |
| `VaporwaveLoop` | Neon horizon with a sliced sun, pink and cyan perspective grid, wireframe mountains, palms and floating solids, with a clear center | `speed` (0–12, integer), `sunPosition` (0.1–0.9), `neonGlow` (0–1), `starCount` (0–200), `shootingStars` (0–3), `palmCount` (0–3), `shapeCount` (0–4), `centerShade` (0–1) |
| `DotGridLoop` | Dots in a grid or in alternating rows, scrolling endlessly in one of eight directions | `direction` (8 directions), `layout` (`aligned` or `alternating`), `dotColor`, `dotSize` (1–96 px), `spacing` (16–240 px), `speed` (0–480 px/s) |
| `CheckerboardLoop` | Two-tone checkerboard, straight or tilted, scrolling endlessly in one of eight directions | `direction` (8 directions), `angle` (−45–45°), `squareColor`, `squareSize` (16–480 px), `speed` (0–960 px/s) |
| `WebGLLoop` | WebGL shader experiments: aurora, lava, silk, sea floor (caustics), cells, contour lines, nebula, the pastel series (wave, sphere, neon fold, layers, dusk and eclipse), watercolor and mesh gradient | `experiment` (see [WebGL](themes/webgl.md)), `speed` (0–3), `scale` (0.5–2), `intensity` (0–2), `centerFade` (0–1) |
| `GradientLoop` | Gradient blobs with organic motion | `scale` (0.25–3), `intensity` (0–2) |
| `ParticleLoop` | Particles on periodic paths | `count` (1–600), `size` (0.5–24), `distribution` (`uniform` or `center`) |
| `GeometricLoop` | Geometric shapes rotating and drifting | `count` (1–100), `scale` (0.15–3) |

The overlays live in the other three folders, with one parametric composition each:

| Composition | Folder | What it is |
| --- | --- | --- |
| `ChatLoop` | `chat` | Panel for the chat widget (OBS, StreamElements, Streamlabs), with an optional header for the title |
| `BlockLoop` | `text-boxes` | Panel for text: labels, name bars, screen titles, cards, lists and Twitch panels |
| `BorderLoop` | `borders` | Frame around a transparent window (camera, game) or around the whole screen |

The overlay controls are in [Overlays](overlays.md) and the ready-made styles in [Themes](overlays.md#themes).

## Parameters

Every background shares these parameters; the overlays use the same ones except `colors`, and start with `transparent: true`. `HalloweenLoop`, `CobwebLoop` and `KawaiiLoop` start at 12 seconds, `HauntedMansionLoop`, `HauntedInteriorLoop` and `VaporwaveLoop` at 16 and `SunburstLoop` at 10; these seven compositions have their own palette and background color. `CobwebLoop`, `KawaiiLoop`, `HauntedMansionLoop`, `HauntedInteriorLoop`, `SunburstLoop` and `VaporwaveLoop` also carry their own seed in the schema. `DotGridLoop` uses the default 8 seconds and seed, has its own background color and replaces the `colors` palette with a single color, `dotColor`. `CheckerboardLoop` also uses the default 8 seconds and seed and has its own background color; instead of `colors`, it paints the squares with `squareColor`, and `backgroundColor` forms the other cells. `WebGLLoop` starts at 16 seconds, seed 7, with its own palette and background color. The gradient, particle and geometric compositions use the defaults below:

| Parameter | Default | Use |
| --- | --- | --- |
| `durationSeconds` | `8` | Positive cycle duration; rounded to a whole number of frames |
| `colors` | Cyan, indigo and pink | Palette of 2 to 6 colors |
| `seed` | `1` | Integer that sets the reproducible layout of the elements |
| `transparent` | `false` | Removes the background when `outputFormat` is `webm`, `mov` or `png` |
| `backgroundColor` | `#0B0F19` | Opaque color in hexadecimal `#RRGGBB`, used in opaque exports |
| `outputFormat` | `webm` | Preview format, which also sets the FPS |

## Presets

A parameter file may hold only the options you want to change; the others keep their initial values. `ls presets/` lists them all; the overlay presets (`chat-*`, `block-*`, `border-*`) are described in [Themes](overlays.md#themes). The background presets give these visual directions:

- `wuthering-waves-azure-lotus.json`: Wuthering Waves-inspired waterside illustration in azure, cream, turquoise and gold, with a 16-second loop and MP4 output.
- `watercolor-flow.json`: wet-on-wet pools of violet, rose, magenta and lilac round a cream middle, with a 16-second loop and MP4 output.
- `watercolor-valley.json`: misty blue and lavender mountains over a still lake at sunrise.
- `watercolor-koi.json`: a teal koi pond with four koi, lily pads and a lotus.
- `halloween-midnight.json`: a night in dark violet, a creamy moon, amber pumpkins and a clear center for content.
- `halloween-haunted-mansion.json`: a Victorian mansion in night blue, pale moonlight, amber windows and a dark center-left area for the overlay.
- `halloween-haunted-interior.json`: a gothic hall in perspective, crimson velvet curtains, greenish moonlight and amber candles on the sides, with a large dark arch exactly behind the content area.
- `halloween-cobweb.json`: moonlit webs in silver silk, glinting dew and an amber warmth at the bottom.
- `christmas-gilded-garland.json`: evergreen, burgundy and gold Christmas frame with a gilded garland, swaying glass baubles and slow snow around a dark, calm center, in a 20-second loop.
- `kawaii-constellation.json`: clouds, hearts and stars in groups, over warm milk, at a slow pace.
- `sunburst-crimson.json`: a fan of red over dark red, the lowest contrast of the series.
- `sunburst-sand.json`: wide sand rays over cream, at a slower pace.
- `sunburst-ocean.json`: thin blue rays over night blue, with a tighter core.
- `sunburst-moss.json`: moss green over dark green, in the longest cycle.
- `vaporwave-horizon.json`: neon horizon for streams, with the sun on the right edge behind the palms and a dark center for titles, camera and game.
- `vaporwave-classic.json`: the vaporwave postcard, with the sun half set in the middle of the horizon, three palms per side, four solids and a stronger plate behind the content.
- `vaporwave-alpha.json`: transparent WebM to lay over the game, with one palm per side and no solids, to leave the corners free for the HUD, translucent mountains, the grid dissolving before the horizon and near the bottom edge, and a clean center.
- `dots-classic.json`: a grid of lilac dots over night blue, scrolling diagonally down and to the right.
- `dots-alternating.json`: alternating rows of peach dots over cream, moving left.
- `dots-alpha.json`: transparent WebM with translucent white dots in alternating rows, rising slowly, to lay over other videos.
- `checkerboard-classic.json`: classic board in near black and cream, with 120 px cells, scrolling slowly diagonally down and to the right.
- `checkerboard-diamonds.json`: board turned 45°, with pink diamonds over light pink, moving right.
- `checkerboard-tilted.json`: dark green board tilted 15° counterclockwise, sliding along the rows to the left.
- `checkerboard-alpha.json`: transparent WebM with translucent white squares, rising slowly, to lay over other videos.
- `webgl-aurora.json`: green and cyan aurora with violet and pink rays over near-black blue, in 24 s, with the center half dimmed for the webcam or the game.
- `webgl-lava.json`: a warm lava lamp, with amber and orange wax at the bottom rising to magenta and violet, over near-black plum.
- `webgl-silk.json`: champagne, pink and plum silk over a near-black background, with a softened core for text.
- `webgl-caustics.json`: sea floor in petrol blue, cyan and aqua green, with bright sun rays reaching down to the bed.
- `webgl-cells.json`: cells in turquoise, blue, indigo and violet over near-black petrol blue, with the center softened for the camera.
- `webgl-contours.json`: topographic map in teal, sage, sand, orange and terracotta over graphite.
- `webgl-nebula.json`: nebula in navy, violet, magenta, orange and light yellow, in 30 s of slow drift.
- `webgl-flow.json`: pastel ribbon wave in peach, pink and lilac over lavender, with a glowing crest, a cream glow on the left and a periwinkle veil on the right.
- `webgl-orbital.json`: pearly sphere in blue, lilac, pink and peach in a lavender studio, in the right third of the frame, with the lights going around once every 24 s.
- `webgl-neon.json`: satin fold in pink, lavender, blue-violet and indigo over pastel orchid, with two neon threads and pulses of light sliding along the crease.
- `webgl-layers.json`: liquid glass layers in violet, blue and aqua, with a glowing white edge and a lilac halo over pastel sky blue.
- `webgl-haze.json`: pastel dusk in coral, gold, pink, lilac, magenta and violet over a pinkish base, with the golden line rippling.
- `webgl-eclipse.json`: pastel eclipse with a light lavender-blue disc at the top left, bands from periwinkle to cornflower blue and a glowing lilac rim in the corner.
- `webgl-watercolor.json`: watercolor on cold-pressed cream paper, with ultramarine blue, quinacridone pink, gamboge yellow and viridian green in the corners and on the sides, and the middle free for title, camera and game.
- `webgl-mesh.json`: mesh gradient with the six colors of the original (coral, gold, sky blue, violet, pink and mint), covering the whole frame, in 24 s.
- `webgl-alpha.json`: transparent WebM with light, translucent contour lines and an almost entirely clear center, to lay over the game in OBS.
- `gradient-aurora.json`: soft lights in cyan, violet and pink.
- `particles-alpha.json`: subtle particles with alpha to composite over other videos.
- `geometric-orbit.json`: geometric shapes in warm tones over dark blue.

```json
{
  "durationSeconds": 10,
  "seed": 42,
  "colors": ["#67E8F9", "#A78BFA", "#F9A8D4"],
  "scale": 1.2,
  "intensity": 0.9
}
```
