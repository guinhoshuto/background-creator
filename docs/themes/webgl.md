# WebGL: shader experiments

Select `WebGLLoop` in the Studio and pick the experiment in `experiment`. Each experiment is a WebGL2 fragment shader drawn at 1920×1080 every frame, meant as a stream overlay background: "starting soon" and "be right back" scenes and the background behind the camera and the game capture.

| `experiment` | Look |
| --- | --- |
| `aurora` | Three aurora curtains in the upper half of the sky, with thin vertical rays, folds that slide sideways and light up at the bends, a dark sky below and discreet stars twinkling slowly. The first color lights the base of the curtains; the next ones climb the rays. |
| `lava` | Lava lamp: glowing wax blobs rise, sink, merge and split along the sides, with pools in the bottom corners. The colors follow height (first at the bottom, last at the top) and mix without turning grey where the blobs merge. The center stays clear by construction. |
| `silk` | Wide folds of silk or satin rippling slowly, with a narrow sheen along each fold and deep shadows; the palette tints the fabric in wide bands. |
| `caustics` | Sea floor: the sandy bed in perspective with the net of light the sun draws through the waves, fading into the blue haze of the horizon; above, open water that darkens with depth, sun rays, the rippling glow of the surface and suspended particles. The first color is the water's; the second, the sand's; the last brightens the rays. |
| `cells` | A tissue of cells, like stained glass at night: thin glowing membranes, dots circling slowly, families of palette tones and a few cells that fill with light from time to time. |
| `contours` | Contour lines of a slowly breathing relief, with constant thickness, an index contour every five and colors by altitude. On steep slopes the lines fade before they bunch up. |
| `nebula` | Gas clouds in the palette's colors, with dark dust lanes and emission knots, over a field of fine stars that twinkle softly. |
| `flow` | Pastel series, after "Aurora Flow": a thick satin ribbon comes in from the left, dips and rises in a curve to the top right corner, with a glowing crest and a second, hazy wave in its shadow. Slow ripples run along the ribbon and the light slides along the crest; the top left stays calm for titles. |
| `orbital` | Pastel series, after "Orbital": a matte pearly sphere in an infinite-backdrop studio, in the right third of the frame. The palette becomes a gradient on the sphere, like colored lights orbiting around it; the sphere rises and sinks slowly and the contact shadow follows its height. |
| `neon` | Pastel series, after "Neon Drift": a satin folded on the diagonal, with a calm plane above the crease and a glowing blue-violet slope below; two thin threads of neon light run along the crease, with pulses of light sliding along them. |
| `layers` | Pastel series, after "Liquid Layers": sheets of colored glass stacked in concentric arcs from the bottom left corner, each with a thread of light on its edge and a soft shadow; they breathe one after another, with edges that ripple like liquid. |
| `haze` | Pastel series, after "Sunset Haze": a sunset seen through frosted glass, with masses of color drifting like clouds of light and a glowing golden line that ripples from one side of the frame to the other. |
| `eclipse` | Pastel series, after "Eclipse": huge discs, one inside the other, with the center outside the frame at the top left; the bands drift with parallax, widen and narrow, and the light runs along the rims. |
| `watercolor` | Watercolor: transparent layers of pigment around the frame's edges, like a hand-painted frame, with the paper lighter in the middle for the content. The layers mix subtractively, like real pigment (blue over yellow turns green; a second layer of the same color darkens the tone), with darker dry edges, wet fringes, water blooms, granulation in the paper's tooth and splatters. The paint stays wet: the stains spread, breathe and open slowly over a paper that never moves. `backgroundColor` is the paper. |
| `mesh` | Mesh gradient, after the "Mesh Gradient" of the Pixel Perfect shaders: color blobs wander around the frame in slow loops, each in its own direction, and mix with inverse-distance weights, so each color stays pure in its blob and the passages between them are wide. A ripple in the core and a soft swirl at the edges, which breathes, bend those passages. The colors mix in OKLab and recover part of the saturation that opposite hues lose when mixed, so the passage greys less (nearly opposite hues, like pink and mint, still pass close to grey). Each palette color appears the same number of times, in at least six blobs (five colors give ten), arranged so that neighbors have different colors (with two colors that is not always possible). Here `scale` changes the size of the ripples, not of the blobs, which always fill the frame. The mesh covers the whole frame: `backgroundColor` only shows with `intensity` below 1, where a color has alpha below 1 and in the `centerFade` clearing; above 1, the colors become more vivid. Fine, still grain, as in the original. |

- `speed` (0–3, default `1`): pace of the motion. `1` is each experiment's calm base pace and `0` holds the image still. The pace holds when `durationSeconds` changes; since the cycle must close, some motions round to whole turns, and very short cycles (a few seconds) move faster than requested.
- `scale` (0.5–2, default `1`): size of the shapes (folds, blobs, cells, hills, clouds). Stars and line thicknesses stay in pixels.
- `intensity` (0–2, default `1`): brightness and coverage of the experiment layer over the background color; `0` leaves only the background.
- `centerFade` (0–1, default `0.5`): opens a rounded clearing in the center, towards the background color, for title, camera and game; the corners of the content area stay more than half covered. In transparent WebM, the center becomes transparent.
- `colors` (2 to 6): each experiment spreads the palette its own way (see the table); each color's alpha reduces the coverage of the parts painted with it.
- `seed`: changes the arrangement (position of the curtains, blobs, cells, relief, stars), not the pace.

The shader receives only values computed from the frame and the parameters; randomness uses integer hashes, which give the same result on any GPU. The motion closes the cycle with the same speed at the seam.

With `transparent: true` and `outputFormat: "webm"`, only the experiment layer remains (light, lines, blobs, gas), with soft alpha. In MP4 and GIF, that same layer is composited over `backgroundColor`. The first seven experiments (`aurora` to `nebula` in the table) add light: over a light background they turn pastel, with less contrast. The pastel series (`flow`, `orbital`, `neon`, `layers`, `haze`, `eclipse`) was made for light backgrounds: `backgroundColor` is the scene's base tone, and over a dark background it becomes a night version. In `watercolor`, `backgroundColor` is the paper: on light paper the paint only darkens, like real watercolor; where the pigment is lighter than the paper (dark paper, or a light pigment on mid-grey paper), it gradually turns into opaque gouache, because pure watercolor would vanish there. In this experiment, `centerFade` between 0.3 and 0.5 works best; at 1 the core is flat, without the paper's texture. In `mesh`, the mesh is opaque: in transparent WebM only the `centerFade` clearing, `intensity` below 1 and the colors' alpha let what is behind show through; with `centerFade`, pick a `backgroundColor` close to the palette, because a dark background under light colors makes the core murky.

Remotion Chrome Headless requires the `angle` OpenGL renderer for WebGL2. The official commands select it for `WebGLLoop` and `WutheringWavesLoop`; SVG-only compositions keep the default renderer and their reference antialiasing. In the Studio render dialog, choose `angle` under **OpenGL renderer**. Otherwise, rendering fails with an explanation instead of producing blank frames.

```sh
npm run render:mp4 -- WebGLLoop --props presets/webgl-aurora.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-lava.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-silk.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-caustics.json
npm run render:webm -- WebGLLoop --props presets/webgl-cells.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-contours.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-nebula.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-flow.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-orbital.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-neon.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-layers.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-haze.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-eclipse.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-watercolor.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-mesh.json
npm run render:webm -- WebGLLoop --props presets/webgl-alpha.json
```
