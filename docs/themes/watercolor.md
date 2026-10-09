# Watercolor: pigment flow

`WatercolorLoop` is a watercolour painted by a WebGL2 shader on cream paper, with no image assets. The pigment is modelled band by band over 8 spectral bands and laid as transparent glazes (Beer-Lambert), so colours mix like real paint: rose over lilac turns plum, blue over yellow turns green, and a second load of a colour deepens it. Every painting shares the same paint: the tooth of cold-pressed paper (it never moves), pigment that settles into the tooth in patches (`granulation`), dried edges that pool into a dark rim a few pixels wide with a paler zone inside, wet edges that feather out over tens of pixels, blooms with a pale core and a frilled dark edge, and tide lines where an earlier front dried. The default is a **16-second loop at 1920×1080 and 60 fps**, without audio.

| `scene` | Look |
| --- | --- |
| `flow` | Pools of pigment, one palette colour laid in each corner (violet, rose, magenta and lilac in the preset), bleeding into one another where they meet and leaving the middle as bare paper for the content. A slow current circles the middle and carries the pigment inside the pools: streaks, drops charged into the wet wash and the borders between colours drift along it, while the pools keep their outline, so the content area never changes shape. |
| `valley` | Misty mountains over a still lake: a graded sky with wet-in-wet clouds and blooms, a sun left as bare paper, four ranges that pale into the distance and dissolve into drifting mist at their feet, pines on the near hills, the lake mirroring it all with ripples of lifted paper, and two birds soaring. |
| `koi` | A koi pond seen from above: teal water that deepens over the hollows, light shivering on the surface, four koi circling the corners with their bodies bending and their shadows on the bottom, lily pads bobbing and a lotus. |

The palette (`colors`, 2 to 6) feeds the pigments in order; each scene reads it its own way (in `flow`, the first four colours take the four corners, clockwise from the top left). `backgroundColor` is the paper: the glazes only darken it, so it should be light. With `transparent: true` and WebM, MOV or PNG, only the paint remains, as a layer that composes back over the paper to the opaque picture.

## Controls and render

- `speed` (0–3, default `1`): pace of every motion; `0` holds the painting still. Every motion closes the cycle on whole turns, so the pace may round a little; the current in `flow` carries the pigment 24 px per second along a unit current at speed 1, whatever the duration.
- `granulation` (0–1): how much pigment settles into the tooth of the paper, as grainy patches.
- `paperTexture` (0–1): how much the tooth and the cockles of the paper show.
- `centerCalm` (0–1): lightens the paint behind the 16:9 content area.

The textures that drift (the current, the clouds, the mist, the ripples, the light on the water) are drawn twice, half a life apart; each copy slides along while it fades in and out, and is out of sight when it jumps back, so the loop closes without a seam at a constant speed (`driftFbm` in `src/backgrounds/watercolor/paint.ts`). Values that wrap, like the phase of a drift or of a tail beat, reach the shader as a cosine and a sine.

Official render commands select the ANGLE backend automatically; for a render launched from Studio, choose **angle** under **OpenGL renderer**.

```sh
npm run render:mp4 -- WatercolorLoop --props presets/watercolor-flow.json
npm run render:webm -- WatercolorLoop --props presets/watercolor-flow.json
npm run render:png -- WatercolorLoop --props presets/watercolor-flow.json --frame 0
```
