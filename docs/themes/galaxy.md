# Galaxy: the galaxy print

`GalaxyLoop` is the all-over "galaxy" print painted whole by a WebGL2 shader, with no image assets: saturated clouds that fill the frame, a few light cores glowing through them, dark dust that breaks them into islands and dense white stars that twinkle. There is no single galaxy in it. The default is a **16-second loop at 1920×1080 and 60 fps**, without audio.

From the back to the front:

1. **Sky**: `backgroundColor`, a deep night blue, under a faint veil of the nearest cloud's colour, so the gaps between the masses are never flat black.
2. **Masses**: where the clouds gather and which hue they take. They stand still, so the composition holds; about four fifths of the frame carries colour.
3. **Gas**: fractal noise drifting inside the masses, warped gently so it billows rather than marbles, with finer wisps over it; its crests take the neighbouring hue of the palette.
4. **Light cores**: three glows, two large ones on a diagonal at the sides of the frame and a small one above or below the middle. Each lights the clouds around it, shines a pastel heart through the gas and brightens the cloud edges that face it.
5. **Dust**: crisp dark clumps and, in some places, thin threads in front of the clouds, letting a dark violet through. It drifts further than the gas in the same cycle, so it reads nearer.
6. **Stars**, in front: four layers, from a dust of single pixels to a few large stars with a soft glow and four-point spikes, white, blue-white and a few warm ones. The fine layers gather where the clouds are strong, the dust dims the stars behind it, and they twinkle.

The look follows a reference of Hubble and Webb nebulae measured in the vault (`~/obsidian/Visual Ref/Galaxy/`, "A estampa galaxy"): the masses fill the frame like the Lagoon Nebula's, the light cores sit inside them with a wide halo, the dust is darker than its surroundings and the stars come at the density of Webb's fields. The colour is pushed from the photos' muted oranges towards the saturated violet, pink and blue a galaxy print has.

The palette (`colors`, 2 to 6) is a ramp: the clouds run through the colours in order, the crests take the next hue along, and the light cores are the local colour lightened towards white. Neighbouring colours blend into each other, so order them by hue. `backgroundColor` is the sky behind the light; with `transparent: true` and WebM, MOV or PNG, only the light remains, and the dust and the gaps let the background through.

## The loop

The masses, the hues, the cores and the stars stand still; the gas moves inside them on closed circles through the noise, one turn per cycle, and the twinkle runs whole turns, so the last frame runs into the first at the same speed. At speed 1 the gas drifts about 12 px per second, the dust about 19, and the stars twinkle about once every 7 seconds (rounded to whole twinkles per cycle).

## Controls and render

- `speed` (0–3, default `1`): pace of the drifting gas and of the twinkle; `0` holds the picture still.
- `clouds` (0–1, default `0.8`): strength of the coloured clouds and their light cores; `0` leaves only the stars.
- `stars` (0–1, default `0.8`): brightness of the stars.
- `twinkle` (0–1, default `0.5`): how much the stars twinkle.
- `centerCalm` (0–1, default `0.25`): dims the clouds, the light cores and the stars behind the 16:9 content area, in that order of strength.

The `seed` places the masses, the hues, the light cores, the dust and the stars. The presets `galaxy-cosmic` (the default), `galaxy-candy` (pink and cyan) and `galaxy-ember` (warm) are described in [Parameters and presets](../parameters-and-presets.md#presets).

Official render commands select the ANGLE backend automatically; for a render launched from Studio, choose **angle** under **OpenGL renderer**.

```sh
npm run render:mp4 -- GalaxyLoop --props presets/galaxy-cosmic.json
npm run render:webm -- GalaxyLoop --props presets/galaxy-cosmic.json
npm run render:png -- GalaxyLoop --props presets/galaxy-cosmic.json --frame 0
```
