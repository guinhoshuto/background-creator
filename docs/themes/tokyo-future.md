# Tokyo After Rain

`TokyoFutureLoop` is an original empty futuristic Tokyo street: procedural Blender geometry,
rendered and animated with Three.js inside Remotion. The first direction was presented on 2026-10-15; the owner asked to continue on 2026-10-16.
No people, character art, downloaded models, photographs, HDRIs or generated images appear in the scene.

## Build and preview

The connected Sandisk contains the installed Blender. Generate the geometry once:

```sh
npm run build:tokyo
npm run studio
```

The build enters the machine render queue through the vault's canonical `render-slot.ts` CLI.
It creates `public/tokyo/organic/tokyo-city.blend`, `tokyo-city.glb`, `tokyo-signs.json`
and `tokyo-props.json`. The earlier `public/tokyo/` assets remain available to prior reviews.
Those files are ignored and can be regenerated from `scripts/create-tokyo-city.py`.
The `.blend` remains editable; geometry is batched by material to keep draw calls small.

An offline animated review, using the same Three.js scene and the same preset:

```sh
npm run preview:tokyo -- --out out/review/tokyo-future --label TK-06
```

The review embeds the model, lettering and prop anchors, and renderer. Open its `index.html` in a WebGL2 browser.
Playback has pause, frame seeking and fullscreen. A reduced-motion preference starts paused.
For its static image, use the official `npm run stills` runner with composition `TokyoFutureLoop`
and preset `tokyo-after-rain`, naming the still after the review label (`TK-01` by default) in the same output folder.

After visual approval, export the complete loop with the official exporter:

```sh
npm run render:mp4 -- TokyoFutureLoop --props presets/tokyo-after-rain.json
```

## Scene and motion

- 1920 × 1080, 12 seconds, 60 fps. This composition is opaque; alpha is rejected explicitly.
- 18 detailed street buildings, 39 distant towers, a central tower with luminous rings,
  cables, shop shutters, vending machines, balconies, tanks and air-conditioning units.
  The avenue remains open overhead; the former central footbridge was removed in TK-06.
- 46 original Japanese shop signs, rendered as canvas textures on the anchored model panels.
  Tall blades, short painted plaques and upper storefront signs vary in height, width and finish.
- Distinct drinks, coffee and locker cabinets, with selection panels, pickup bays, feet and power cables.
  Sloped fabric awnings, divided door curtains, printed notices, grounded crates, planters and menu stands
  give the shops different silhouettes and signs of use. Original print textures are rasterized on the CPU
  before GPU upload; scene and review use the same validated prop anchors.
- Seven rounded paper lanterns have ribbed envelopes, printed fibres, dark collars, hanging cords
  and wall-mounted brackets. Cream, vermilion and amber finishes share three original textures.
- A real planar reflection with periodic ripple distortion and irregular puddles, asphalt grain, cracks and tire wear. Rain uses soft, metre-sized streaks with varied fall speeds, exposure lengths, wind drift and depth attenuation. Small roadway impact rings stay at their contact points; every drop completes an integer number of falls per loop.
- TK-07 raises the preset rain from 0.55 to 0.66 while preserving those trajectories. Short impacts
  vary with drop size and use the reflection's exact world-space puddle mask, keeping dry asphalt quiet.
  Sparse beads run down nearby sign margins, with one occasional lower-edge drip per panel. The water
  inherits each actual panel transform, preserves its runoff velocity when gravity takes over, and stays
  depth-tested. Lettering, lighting, atmosphere, camera and film treatment remain unchanged.
- World-space procedural concrete stains, worn plaster edges, mineral deposits, ledge runoff,
  sparse cracks, oxidized metal and chipped paint, plus scratched signs and gutter debris.
  Near windows vary in blinds, curtains, mullions and repairs. Static glass haze and water trails
  modulate both the surface and interior light; shop signs retain their separate illumination.
- Depth-tested low fog layers, cool shadows, warm highlights, saturated wet-road colour,
  soft highlight scatter, a vignette, restrained lens fringe and periodic film grain.
- Every animated value derives from the requested frame. Camera, neon, water and steam preserve the loop seam.
- `rain`, `atmosphere`, `glow`, `cameraMotion`, `weathering`, `cinematic` and `filmGrain` control the scene. `seed` changes the rain distribution.
  Architecture uses its fixed generation seed. The inherited `colors` field is reserved; it does not recolor the asset.
- The composition uses ANGLE, linear HDR postprocessing and a restrained bloom before output tone mapping. The film treatment runs after tone mapping; its grain is seeded spatially and varies on a closed cycle, with no frame history.

## Provenance

Geometry and shaders were authored as code for this project. Research photographs informed only
street density, the hierarchy of signs and the wet-road lighting; no reference pixels or branding
are included: [Shai Pal, Shinjuku](https://unsplash.com/photos/tokyo-crosswalk-i0Hh5-BPzy0),
[Pema G. Lama, Tokyo at night](https://unsplash.com/it/foto/persone-che-camminano-per-strada-durante-la-notte-995jo39qpI0).
The reference note is in the vault's `Visual Ref/Future Tokyo/`.
Four owner-supplied references from 2026-10-19 informed the denser signs, warm shop lighting,
paper lanterns and everyday street objects in TK-05. They remain in that reference folder;
their pixels, characters and brands are not included in the scene.

Three.js uses its official [Reflector](https://threejs.org/docs/pages/Reflector.html)
and [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).
