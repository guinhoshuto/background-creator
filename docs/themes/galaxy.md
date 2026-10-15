# Galaxy: the galaxy print

`GalaxyLoop` is the all-over "galaxy" print painted whole by a WebGL2 shader, with no image assets: saturated clouds that fill the frame, a few light cores glowing through them and dense white stars that twinkle. There is no single galaxy in it. The default is a **16-second loop at 1920×1080 and 60 fps**, without audio.

From the back to the front:

1. **Sky**: `backgroundColor`, a deep night blue, under a faint veil of the nearest cloud's colour, so the gaps between the masses are never flat black.
2. **Masses**: where the clouds gather and which hue they take. They stand still, so the composition holds; nine tenths of the frame or more carries colour.
3. **Gas**: fractal noise inside the masses, warped gently so it billows rather than marbles. Its big billows (the first two octaves) sit where the approved print had them and breathe in place; the finer gas and the wisps over it flow through them on a still current (a prevailing drift with broad swirls), changing shape as they go. Its crests take the neighbouring hue of the palette.
4. **Light cores**: three glows, two large ones on a diagonal at the sides of the frame and a small one above or below the middle. Each lights the clouds around it, shines a pastel heart through the gas and brightens the cloud edges that face it.
5. **Stars**, in front: four layers, from a dust of single pixels to a few large stars with a soft glow and four-point spikes, white, blue-white and a few warm ones. The fine layers gather where the clouds are strong. Each star twinkles at its own uneven pace, and the glow and spikes of the large ones swell more than their points, so they seem to bloom.

The look follows a reference of Hubble and Webb nebulae measured in the vault (`~/obsidian/Visual Ref/Galaxy/`, "A estampa galaxy"): the masses fill the frame like the Lagoon Nebula's, the light cores sit inside them with a wide halo and the stars come near the density of Webb's fields. The photos' dark dust is left out: in the print its threads read as veins in marble, so the depth comes from the dark gaps between the masses. The colour is pushed from the photos' muted oranges towards the saturated violet, pink and blue a galaxy print has.

The palette (`colors`, 2 to 6) is a ramp: the clouds run through the colours in order, the crests take the next hue along, and the light cores are the local colour lightened towards white. Neighbouring colours blend into each other, so order them by hue. `backgroundColor` is the sky behind the light; with `transparent: true` and WebM, MOV or PNG, only the light remains, and the gaps let the background through.

## The loop

The masses, the hues, the cores and the stars stand still, and so do the big billows of the gas: they keep the first frame of the approved print, where the gas used to sway on one closed circle as a whole, and each place only breathes on its own small ellipse (about 13 px, one breath every 16 seconds or so), so the clouds swell and settle without the frame swaying together. The finer gas flows through them. A flow can only close a loop by taking turns, so the finer gas is drawn in two parts (a flow map): each is the gas as it was when its life began, carried along the current for its age, and it fades in and out half a life apart from the other, beginning its next life somewhere else in the noise only while it is invisible. A broad still noise shifts the turns from place to place, so the frame never changes its weave all at once, and the two parts mix with their weights normalised by their squares, which keeps the contrast of one part. So the gas never swings back, and with whole lives per cycle the last frame runs into the first at the same speed.

At speed 1 the finer gas drifts about 5 px per second in a direction from the seed, with swirls adding about 7 (up to about 20 where they are strongest), and each part lives about 10 seconds (rounded to whole lives per cycle: two in the default 16-second loop). Each star twinkles on two slow waves, one to three and two to five times per turn of the twinkle, which turns about once every 7 seconds (rounded to whole turns per cycle).

## Controls and render

- `speed` (0–3, default `1`): pace of the drifting gas and of the twinkle; `0` holds the picture still.
- `clouds` (0–1, default `0.8`): strength of the coloured clouds and their light cores; `0` leaves only the stars.
- `stars` (0–1, default `0.8`): brightness of the stars.
- `twinkle` (0–1, default `0.5`): how much the stars twinkle.
- `centerCalm` (0–1, default `0.25`): dims the clouds, the light cores and the stars behind the 16:9 content area, in that order of strength.

The `seed` places the masses, the hues, the light cores and the stars. The presets `galaxy-cosmic` (the default), `galaxy-candy` (pink and cyan) and `galaxy-ember` (warm) are described in [Parameters and presets](../parameters-and-presets.md#presets).

Official render commands select the ANGLE backend automatically; for a render launched from Studio, choose **angle** under **OpenGL renderer**.

```sh
npm run render:mp4 -- GalaxyLoop --props presets/galaxy-cosmic.json
npm run render:webm -- GalaxyLoop --props presets/galaxy-cosmic.json
npm run render:png -- GalaxyLoop --props presets/galaxy-cosmic.json --frame 0
```

## Pack

`galaxy-backgrounds` (`packs/galaxy-backgrounds.json`) sells the print alone, in its three palettes (`cosmic`, `candy`, `ember`), each as MP4, WebM and a PNG still, compressed with the `delivery` profile. It builds and ships like every pack ([Packs](../packs.md)):

```sh
npm run render:pack -- galaxy-backgrounds --dry-run
```
