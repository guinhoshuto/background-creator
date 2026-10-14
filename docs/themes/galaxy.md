# Galaxy: spiral in a coloured sky

`GalaxyLoop` is a spiral galaxy drawn whole by a WebGL2 shader, with no image assets: an inclined disc of two arms, off centre, that turns half a turn per cycle over coloured gas clouds and faint distant galaxies, under a field of twinkling stars. The default is a **16-second loop at 1920×1080 and 60 fps**, without audio.

From the back to the front:

1. **Clouds**: domain-warped coloured gas with dark dust (the "galaxy print"), stronger towards the edges of the frame and thinner over the galaxy, drifting on slow circles through the noise.
2. **Distant galaxies**: small faint ovals, 3 to 11 px, cream or blue-white, at every angle; they stand still.
3. **The galaxy**: a round cream bulge with a white-hot nucleus a few px across, a disc that goes from cream inside to blue outside, two blue arms with a dust lane along their inner edge and pink knots of star formation strung along their outer edge, blue-white clusters, the disc's own stars, and an optional bar. On the near side of the disc its dust passes in front of the bulge.
4. **Field stars**, in front of everything: faint, medium and bright, white, blue-white and orange, the brightest with four-point spikes, twinkling.

The structure follows photographs of real galaxies (the cream core, the bluish arms, knots on the outer edge and dust on the inner edge, the round bulge behind the near dust); the colour is pushed towards the saturated violet, pink and blue a "galaxy" print has. The visual reference lives in the vault (`~/obsidian/Visual Ref/Galaxy/`).

The palette (`colors`, 2 to 6) works by role: the first colour is the core, the second the arms, the third the knots, and the clouds ramp through the third colour onwards (with fewer colours, the last one stands in). `backgroundColor` is the night sky behind the light; with `transparent: true` and WebM, MOV or PNG, only the light remains, and dust lanes and dark gas let the background through.

## The turn that closes the loop

A rigid turn closes the loop only at a multiple of the picture's symmetry. The arms, the bulge and the bar look the same after half a turn (two arms), so they turn as they are. The finer detail (clumps along the arms, dust threads, knots, the disc's stars) does not: each neighbourhood swaps it with its twin from half a turn away, at its own time in the cycle, so after the half turn the picture is the first frame again and no pulse crosses the disc. The knots and stars hand over sharply, each one whole, so few are seen halfway. The cycle's angle reaches the shader as a cosine and a sine, so no value jumps at the seam.

The disc turns half a turn every 16 s at speed 1 (its edge moves about 110 px per second). The cycle rounds the spin to whole half turns: at 16 s, speed 1 makes one; at 32 s, speed 0.5 makes one at half the pace.

## Controls and render

- `speed` (0–3, default `1`): pace of the spin; `0` holds the picture still.
- `tilt` (0–75°, default `58`): how far the disc leans away; `0` is face on.
- `angle` (−90–90°, default `-24`): angle of the disc's long axis on screen, counterclockwise.
- `galaxyX`, `galaxyY` (0–1, default `0.64` and `0.46`): where the core sits, as a share of the frame.
- `galaxySize` (0.5–1.5, default `1`): size of the galaxy; at 1 the disc is 560 px in radius.
- `bar` (0–1, default `0`): a straight bar across the core, with the arms starting at its ends.
- `clouds` (0–1, default `0.6`): strength of the coloured gas.
- `stars` (0–1, default `0.7`): brightness of the field stars.
- `twinkle` (0–1, default `0.5`): how much the field stars twinkle.
- `centerCalm` (0–1, default `0.25`): dims the clouds, the galaxy and the stars behind the 16:9 content area, in that order of strength.

The `seed` places the clouds and the galaxy's detail; the default, `1`, frames the picture with pink at the top left and cyan in both lower corners, and leaves the middle dark for the content. The presets `galaxy-cosmic` (the default), `galaxy-center` (the galaxy in the middle, with no calm centre), `galaxy-candy` (pink and cyan) and `galaxy-ember` (warm) are described in [Parameters and presets](../parameters-and-presets.md#presets).

Official render commands select the ANGLE backend automatically; for a render launched from Studio, choose **angle** under **OpenGL renderer**.

```sh
npm run render:mp4 -- GalaxyLoop --props presets/galaxy-cosmic.json
npm run render:webm -- GalaxyLoop --props presets/galaxy-cosmic.json
npm run render:png -- GalaxyLoop --props presets/galaxy-cosmic.json --frame 0
```
