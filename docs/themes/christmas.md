# Christmas: gilded garland

Select `ChristmasLoop` in the Studio. The preset `presets/christmas-gilded-garland.json` renders a seamless **20-second loop at 1920×1080 and 60 fps** with seed `1225`. The scene is pure SVG: no WebGL, text, images, fonts or audio.

A dark evergreen velvet backdrop keeps all the detail at the edges. A pine garland, bundled from overlapping sprigs that point away from the center, runs in two shallow swags across the top, wrapped in a gold ribbon, with a burgundy velvet bow at the center. Small glass baubles hang from the garland, and larger ones hang down both side columns on satin ribbons tied to the boughs with small bows. Frosted pine boughs with cones and holly fill the four corners, warm lights run along the garland, soft warm bokeh glows near the garland lights, behind the top boughs (above the hanging baubles) and in the lower corners, and snow falls slowly at two depths.

**Stream layout.** The content area, x 360–1560 and y 170–900, is kept for the webcam, the gameplay and the overlays. Only the small far snowflakes cross it, dimmed by `centerCalm`. Baubles, pine, lights, bokeh and sparkles stay outside it even at their widest swing, and the tests enforce this. The bottom center between the lower boughs stays open for a lower third.

**Motion.** Baubles swing on their ribbons, the pine boughs and the bow tails sway, a slow chase runs along the garland lights, sparkles glint and the bokeh drifts. Nothing flashes. Every movement repeats a whole number of times per cycle, so shorter cycles move faster: keep `durationSeconds` at 16 s or more (at 12 s the near snow falls at about 190 px/s).

**Palette.** `colors[0]` is the evergreen (needles, holly, the velvet tint, evergreen baubles), `colors[1]` the burgundy (bow, berries, burgundy baubles) and `colors[2]` the gold (ribbons, bauble caps and bands, lights, sparkles, bokeh and the warm glow behind the bow and in the lower corners). The bokeh behind the greenery leans amber whatever the palette (the gold mixed toward amber), and only the faint orbs in front of the pine are plain gold: each orb is a soft warm core that fades out at its edge, never a pale disc, which over the green velvet would read as grey. With only two colors, the ribbons take the second color, the bauble caps and rings turn plain silver, and the lights, glints, bokeh and bands take a light tint of the second color (the bokeh mixed toward amber again); colors after the third are ignored. Snow, pine cones and stems keep fixed colors, so any palette still reads as pine and snow.

**Controls.** `baubleCount` removes baubles in a fixed order, `snowCount`, `bokehCount` and `sparkleCount` set their layers without rearranging the others, `sway: 0` holds the baubles, bow tails and boughs still (snow, bokeh, sparkles and the light chase keep moving), `lightGlow: 0` leaves the bulbs unlit as glass beads and also turns off the sparkles and the bauble glints, `twinkle: 0` keeps every bulb steady (at 1 the chase dims each bulb to half its glow and back) and `centerCalm` dims the snow over the content area (at 1 it keeps 15% of its strength) and darkens the center. `snowCount: 0` leaves a completely still center.

**Transparency.** With `transparent: true` and `outputFormat` set to `webm`, `mov` or `png`, the velvet backdrop, the corner warmth, the center shade and the vignette are left out, and so are the bokeh orbs behind the greenery, which would read as smudges over bright footage. What remains is a festive frame over the game: garland, bow, baubles, corner pine with soft drop shadows, lights, the faint orbs in front of the pine, sparkles and snow. MP4 and GIF composite everything over `backgroundColor`. There is no command-line switch for transparency: save a copy of the preset with `"transparent": true`.

```sh
npm run render:webm -- ChristmasLoop --props presets/christmas-gilded-garland.json
npm run render:mp4 -- ChristmasLoop --props presets/christmas-gilded-garland.json
npm run render:png -- ChristmasLoop --props presets/christmas-gilded-garland.json --frame 0
```
