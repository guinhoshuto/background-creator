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
It creates `public/tokyo/tokyo-city.blend`, `tokyo-city.glb` and `tokyo-signs.json`.
Those files are ignored and can be regenerated from `scripts/create-tokyo-city.py`.
The `.blend` remains editable; the GLB contains 14 batches and approximately 134,000 triangles.

An offline animated review, using the same Three.js scene and the same preset:

```sh
npm run preview:tokyo -- --out out/review/tokyo-future --label TK-02
```

The review embeds the model, lettering anchors and renderer. Open its `index.html` in a WebGL2 browser.
Playback has pause, frame seeking and fullscreen. A reduced-motion preference starts paused.
For its static image, use the official `npm run stills` runner with composition `TokyoFutureLoop`
and preset `tokyo-after-rain`, naming the still after the review label (`TK-01` by default) in the same output folder.

After visual approval, export the complete loop with the official exporter:

```sh
npm run render:mp4 -- TokyoFutureLoop --props presets/tokyo-after-rain.json
```

## Scene and motion

- 1920 × 1080, 12 seconds, 60 fps. This composition is opaque; alpha is rejected explicitly.
- 18 detailed street buildings, 39 distant towers, a central tower with luminous rings, a supported
  skybridge, cables, shop shutters, vending machines, balconies, tanks and air-conditioning units.
- 26 original Japanese shop signs, rendered as canvas textures on the anchored model panels.
- A real planar reflection with periodic ripple distortion and irregular puddles, asphalt grain, cracks and tire wear. Rain uses soft, metre-sized streaks with varied fall speeds, exposure lengths, wind drift and depth attenuation. Small roadway impact rings stay at their contact points; every drop completes an integer number of falls per loop.
- World-space procedural concrete stains, panel joints, oxidized metal and chipped paint, plus scratched signs and gutter debris.
- Depth-tested low fog layers, cool shadows, warm highlights, a soft vignette, restrained lens fringe and periodic film grain.
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

Three.js uses its official [Reflector](https://threejs.org/docs/pages/Reflector.html)
and [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).
