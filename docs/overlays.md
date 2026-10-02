# Overlays

Controls shared by the three overlays, the controls of each one, the themed ornaments and the themes. Sizes and the box model are in [Asset kinds and sizes](asset-kinds-and-sizes.md).

## Controls

The three overlays share the vocabulary below, plus `durationSeconds`, `seed`, `transparent`, `backgroundColor`, `outputFormat`, `width`, `height`, `bleed`, `guides` and `radius` (0–1920 px). Every measure is in fixed pixels. Each composition's initial values make up the neon look; the [themes](#themes) bring the others.

| Parameter | Range | Use |
| --- | --- | --- |
| `fill` | `solid`, `gradient`, `dots`, `stripes`, `sparkles`, `glass`, `fog`, `damask` | Fill of the panel (or of the frame's band): flat color, colors swaying slowly, a scrolling dot grid, scrolling diagonal stripes, sparkles, translucent glass with a passing reflection (the reflection band is 30% of the area's shorter side, between 24 and 480 px: it follows the size, like a real reflection), soft fog banks rolling sideways along the bottom, in two rows with the same step and the same speed, or damask wallpaper (the hall's motif in `HauntedInteriorLoop`) in half-drop tiles |
| `fillColors` | 1 to 3 colors | With one color, only the pattern; with more, the first is the base and the others form the pattern. In `fog`, the second is the fog and the third the bright core of each bank; in `damask`, the second is the ink and the third is left out |
| `fillOpacity` | 0–1 | Fill opacity |
| `fillScale` | 8–256 px | Pattern size: distance between dots, width of each stripe with its gap, average space between sparkles, height of each fog bank (5.8 times wider, one every 2.25 × `fillScale`), width of the damask tile (1.5 times taller) |
| `fillSpeed` | 0–480 px/s | Pattern speed, the same at every size. Dots, stripes, damask and the sparkles' spin travel whole periods per cycle; the gradient sways back and forth; in glass, the reflection passes each point once per cycle. The fog moves sideways in whole periods of 2.25 × `fillScale`: `fillSpeed` = k · 2.25 · `fillScale` / `durationSeconds`, with k an integer, gives the exact speed at every size; use k ≥ 3: with fewer laps, the denser and thinner zones of the fog stand still on the panel and the banks only pass through them. `0` holds the pattern still (the damask becomes wallpaper) |
| `fillAngle` | −180–180° | Direction of the gradient, the stripes and the reflection (0 = right, 90 = down); dots and damask follow the nearest axis or diagonal; the fog only moves sideways, to the right when the angle points right or vertical and to the left otherwise |
| `fillRise` | `true`/`false` | `sparkles` only: they rise like embers instead of twinkling in place |
| `fillLight` | 0–1 | White veil at the top of the fill, fading towards the bottom; gives the glass volume |
| `strokeMotion` | `still`, `pulse`, `dashes`, `comets`, `gradient` | Stroke motion: fixed, breathing, marching dashes, comets with a tail or colors running along the stroke |
| `strokeColors` | 1 to 4 colors | Stroke colors, spread along it |
| `strokeWidth` | 0–64 px | Stroke thickness; 2 px or more avoids color loss in WebM |
| `strokeSpeed` | 0–4000 px/s | Speed along the stroke, rounded to whole periods per cycle (see [How the loop works](loop.md)) |
| `dashLength`, `gapLength` | 2–512 px | `dashes`: dash and gap, adjusted together to close the stroke |
| `cometSpacing` | 32–4000 px | `comets`: distance from one comet to the next; the count follows from the size |
| `cometTail` | 8–4000 px | `comets`: tail length, at most the space between comets |
| `gradientLength` | 32–4000 px | Length over which the colors repeat along the stroke (`gradient`, and `still` or `pulse` with several colors) |
| `strokePulses` | 1–16 | `pulse`: how many times the stroke breathes per cycle |
| `strokeCore` | 0–1 | Bright core in the middle of the stroke, as in a neon tube (strokes of 2.5 px or more) |
| `trackOpacity` | 0–1 | `dashes` and `comets`: the whole stroke, dimmed, under them, in the first color |
| `glow` | 0–128 px | Reach of the stroke glow; outside the box, it must fit in the bleed; at 0, the ornaments (`ornaments`) are unlit and `cobweb` loses the moonlight, the ember and the spider |
| `glowPulses` | 0–16 | How many times the glow pulses per cycle; 0 keeps it constant |
| `glowStrength` | 0.25–3 | Multiplies the glow opacity without changing its reach |
| `halo`, `haloColor` | 0–128 px | Glow around the whole panel or frame, inside the bleed |
| `rimLight` | 0–1 | A 1 px reflection inside the top edge, fading down the sides, as on a glass plate; on the circle, it lights only the top arc, strongest at the top and fading by half height |
| `ornaments` | `none`, `midnight`, `haunted-mansion`, `haunted-interior`, `cobweb` (`none`) | Themed ornaments around the panel or the frame, taken from the Halloween backgrounds (see [Ornaments](#ornaments)); `none` draws nothing |
| `ornamentColors` | 1 to 3 colors (`#CFC6E4`, `#F6EFD8`, `#E8963C`) | Like `colors` in the backgrounds: the first is the fog or the silk (cold), the second the moonlight (light edges and glints) and the third the warm light (candles, pumpkins, lantern glass, ember); without the third, the warm light uses the first |
| `ornamentSize` | 12–256 px (`48`) | Size of the main motif, in fixed px that do not follow the box: the moon's diameter (in `midnight`, the moon is not drawn, but it marks the bats' corner), the lantern's height, the candelabrum's height to the tip of the flame or the web's radius. The main motif's companions (the other lantern, the other candelabra, the other webs, the moonlight and the ember of `cobweb`) and the rose window keep fixed proportions to it; bats, pumpkins, railing, sconces and gate grow with it only up to a cap (about 40, 48, 30, 44 and 36 px), and stars, `midnight` embers, lancets and garlands have a fixed size. Each is limited to the free space of its slot |
| `ornamentScale` | 1–4 (`1`) | Scale of all ornaments together, for large frames: sizes, caps, strokes and spacings grow in the same proportion, as if the box were `1/ornamentScale` of its size and the drawing were enlarged. Free space is also measured at this scale, so larger ornaments need a proportionally larger bleed (or padding, or band): with `ornamentScale: 2`, a 48 px bleed yields what 24 px yields at scale 1. At `1`, nothing changes |
| `lightning` | 0–1 (`0`) | A cold lightning flash over the panel or the frame's band, with a thread of light on the stroke, independent of `ornaments`. It follows `HauntedInteriorLoop` with the same `seed` and the same `durationSeconds`: the same instants, with the left and right sides lighting up like the hall's two windows. At the peak, the veil reaches 0.16 × `lightning` on the panel and 0.35 × `lightning` on the band. Below a 1.5 s cycle there is no lightning, and `lightning` above 0 is refused |

The fog has a legibility cap: the body covers at most 0.30 and the core 0.10, so, in the mansion kit, cream text stays at ≥ 6.9:1 and amber at ≥ 4.9:1 with `fillOpacity` 1 or over a dark image. Below 1, the image shows through the base: with `fillOpacity` 0.9 over a white image, amber drops to 4.3:1; use `fillOpacity` ≥ 0.95 to keep ≥ 4.7:1. The damask has the same alpha (`fillOpacity`) on the ink and the ground.

`ChatLoop` (default `chat-standard`, 8 s):

| Parameter | Range | Use |
| --- | --- | --- |
| `padding` | 0–512 px (`16`) | Space between the stroke and the messages |
| `headerHeight` | 0–512 px, integer (`48`) | Height of the header at the top, where the title goes ("CHAT"); `0` removes the header |
| `headerColor`, `headerOpacity` | color; 0–1 (`0.1`) | Color and opacity of the header band; opacity `0` leaves only the line |
| `headerLineWidth` | 0–16 px (`2`) | Line between the header and the messages, in the stroke colors; `0` removes it |

`BlockLoop` (default `card`, 8 s):

| Parameter | Range | Use |
| --- | --- | --- |
| `shape` | `rectangle`, `circle` | Block shape; `circle` needs a square box (`circle-sm`, `circle`, `circle-lg`) and ignores `radius` |
| `paddingX`, `paddingY` | 0–512 px (`24`, `16`) | Horizontal and vertical space between the stroke (or the accent bar) and the text; on the circle the larger of the two applies, all the way around |
| `accent` | `none`, `left`, `top` | Accent bar inside the stroke; the text starts after it. On the circle, it is a 120° arc against the inside of the stroke, centered on the left or the top, and the text square shrinks by its thickness all the way around, to stay centered |
| `accentColor`, `accentSize` | color; 2–64 px (`6`) | Color and thickness of the bar (or the arc) |
| `accentSheen` | 0–4 | How many times a reflection runs along the bar per cycle; `0` turns it off. On the circle, the reflection makes whole laps through the middle of the arc and only shows while it passes over it |

`BorderLoop` (default `webcam-16x9`, 8 s). Here `radius` is the window's radius, the fill paints the frame's band and `strokeWidth` cannot exceed `thickness`:

| Parameter | Range | Use |
| --- | --- | --- |
| `fit` | `window`, `screen` | See [Asset kinds](asset-kinds-and-sizes.md#asset-kinds); `screen` needs bleed 0 |
| `shape` | `rectangle`, `circle` | Window shape; `circle` is the round camera (`webcam-round-sm`, `webcam-round`, `webcam-round-lg`), needs a square box and `fit: "window"` and ignores `radius` |
| `thickness` | 2–256 px (`10`) | Thickness of the frame's band; the stroke runs along its middle |
| `lines` | 1–2 (`2`) | `2` adds a thin line outside the band, still in `dashes` and `comets` |
| `lineGap`, `outerLineWidth` | 1–64 px (`4`); 1–32 px (`2`) | Space to the second line and its thickness |
| `corners` | `none`, `brackets`, `jewels` | Corner adornment (not the same as the [ornaments](#ornaments) of `ornaments`; the kits use `none`): brackets around the frame or diamonds on the band. On the circle, the brackets are four arcs outside the frame, centered on the diagonals, and the jewels sit on the ring at the diagonals, without touching the window |
| `cornerSize`, `cornerGap` | 4–512 px (`28`); 0–128 px (`6`) | `brackets`: length of each arm after the bend and distance from the frame (in `screen`, inwards). On the circle, which has no corner, each bracket is an arc of 4×`cornerSize` px (112 px by default), the same at every round size and limited to 70% of a quarter turn |
| `gemSize` | 4–128 px (`14`) | `jewels`: width of each diamond |
| `cornerPulses` | 0–16 (`1`) | How many times the corners pulse per cycle, lighting up one after another |
| `mask` | `true`/`false` | Exports only the window's mask, as PNG, for OBS (see [Masks](packs.md#masks)) |

The overlays carry no text: text, camera and messages go on top, in the streaming software or the editor, in the areas the [position JSON](export.md#position-json) reports.

## Ornaments

The ornaments (`ornaments`) sit in the bleed, in the padding pockets and on the frame's band, never over the text area or in the window, and whatever leaves the box fits in the bleed. Each motif has a fixed px size, limited to the free space of its slot, just as `radius` is limited to half the side; placement depends only on the geometry (size, bleed, padding, radius, band, glow, the chat header and, in round blocks, the accent bar), on `ornaments` and on `ornamentSize`, never on the frame or the seed. A secondary motif that does not fit its minimum is left out, and the number of motifs is fixed for each preset and size. If even the main one does not fit, the schema refuses with the way out: `The "cobweb" ornaments do not fit this size: increase bleed, padding or radius or use ornaments none.` The way out depends on the kind: in the chat, `bleed`, `padding` and `radius` (in a pill, without `radius`); in blocks, `bleed`, `paddingX`, `paddingY` and `radius` (without `radius` when it is already at its maximum: circle or pill); in window borders, `bleed` and `radius` (on the round camera or in a pill, only `bleed`); in screen frames, `thickness`, `glow` or `radius` (without `radius` when the window is already round). The motifs move in whole cycles, with continuous speed at the seam, and frame 0, which is the PNG's, shows the main pose: wings open, flames and glass lit, dew in view.

| Set | Motifs | `ornamentSize` | Where they go |
| --- | --- | --- | --- |
| `midnight` | Bats flapping their wings, pumpkins with lit faces, four-pointed stars and embers | Moon diameter (not drawn) | The moon does not appear: it only reserves the top right corner, and the combination is refused if even it does not fit. Up to three bats (depending on the space) fly in the top bleed, next to that corner, and boxes of 900 px or more get a second flock. There is a pair of pumpkins at the bottom left and one at the right. Stars follow the free outline every 168 px, and the bottom edge of wide boxes alternates embers and small stars |
| `haunted-mansion` | Iron lanterns with flickering amber glass (the main motif), spear railing, rose window and lancets, sconces and gate | Lantern height, from hook to base | Two lanterns hang from brackets at the top corners (on screens and on the Twitch panel, straight from the corner, without a bracket), and the railing runs from the bottom corners towards the middle. On labels, a single lantern, on the right, and the railing only on the left; round sizes have no railing. Outlines of 560 px or more get a rose window in the middle of the top, with lancets every 320 px; borders of 900 px or more (`gameplay`, `webcam-16x9-lg`, screens), sconces on the sides; outlines of 1000 px or more, a gate in the middle of the bottom |
| `haunted-interior` | Brass candelabra with lit candles (the three-candle one is the main motif), two-candle sconces on a plate, velvet valances with tassels and the cold flash of lightning on the pieces | Candelabrum height, from the base to the tip of the tallest flame | A three-candle candelabrum stands at the top right corner and a two-candle one at the left (on labels, only the two-candle one, on the right; on screens, the three-candle candelabra stand at the bottom corners, the two-candle ones at the top, and sconces follow the side bands). `gameplay` and `webcam-16x9-lg` get standing candelabra in the middle of the top and sconces on the sides. Velvet valances hang from the bottom edge of lower thirds, titles, `gameplay` and `webcam-16x9-lg`, and from the top band of screens |
| `cobweb` | Webs with dew that glints when the moonlight band passes (the main motif), moonlight, an amber ember, a black widow and garlands of fallen strands with drops | Radius of the main web, from the hub to the ring | The main web sits at the top right corner, with the moonlight behind it, and another at the bottom left, with the ember; on borders, the other two corners also have a web. The garlands hang between the webs along the top edge and, on rectangular window borders and the larger rectangular blocks, along the bottom one; round sizes have no garlands. The spider (only with `glow` above 0) hangs from the main web by its thread beside the chat, the blocks and the `webcam-round-sm` and `webcam-round` cameras; on the other borders and on screens, it rests on the main web, in the corner pocket, with its head towards the center |

Every motif sits in front of the panel or the frame. On round sizes, the corners are the points of the circle at 45°: the `midnight` bats, the lanterns (with brackets coming off the arc), the candelabra (with the rosette on the ring) and the webs sit on the diagonals, and on round blocks with `accent` the front motifs avoid the bar's arc. With `glow: 0`, at any size, the ornaments are unlit (pumpkins, lanterns and candles without the glow around them) and `cobweb` has no moonlight, ember or spider. The Twitch panel, which sets `glow` to zero because it has no bleed, is always like that, with the motifs in the padding pockets. `midnight` puts pumpkins there (with the pack's padding, also a bat); `haunted-mansion`, two hanging lanterns, without railing; `haunted-interior`, a candlestick candle at the bottom right corner; and `cobweb`, the main web and the smaller one, without a spider. On screen frames (bleed 0), the motifs sit in front, on the band, and may reach over the band's glow margin, at most `glow` px over the image's edge.

The Halloween kits built on these sets are documented in [Halloween kits](kits-halloween.md).

## Themes

Each theme dresses the three kinds in the same visual family, with one preset per kind in `presets/<kind>-<theme>.json`, and each theme has a pack with the backgrounds that match it (`ls packs/` lists them). The four Halloween kits (`halloween-midnight`, `halloween-haunted-mansion`, `halloween-haunted-interior` and `halloween-cobweb`) go with one background each, with its duration and seed, and bring the [ornaments](#ornaments) of the same scene:

| Theme | Look | Presets | Pack backgrounds |
| --- | --- | --- | --- |
| `neon` | Translucent indigo panel with a slow gradient, cyan and magenta comets in a white-core tube, strong glow and a violet halo; the block has a magenta bar on the left with a sheen, and the border, a flat indigo band, a double line and pulsing brackets. 8 s cycles | `chat-neon`, `block-neon`, `border-neon` | `VaporwaveLoop` (`vaporwave-classic`) |
| `pastel` | Cream with pinkish dots scrolling slowly, pink, mint and peach stroke (dashed on the chat and the border, breathing on the block), well rounded corners; the block has a mint bar at the top, and the border, sparkles and jewels. 12 s cycles (border, 10 s) | `chat-pastel`, `block-pastel`, `border-pastel` | `KawaiiLoop` (`kawaii-constellation`) |
| `glass` | White glass at 10% with a passing reflection, light from above and a rim of light on the top edge, a thin white and lavender gradient stroke, a discreet dark halo that lifts the panel over light backgrounds; single-line border, without brackets or jewels. 8 to 10 s cycles | `chat-glass`, `block-glass`, `border-glass` | `GradientLoop` (`gradient-aurora`) |
| `halloween` | Deep purple with orange and yellow embers rising, orange and purple stroke breathing twice per cycle, pulsing glow and an orange halo; the block has an orange bar on the left, and the border, pulsing jewels. 12 s cycles | `chat-halloween`, `block-halloween`, `border-halloween` | `HalloweenLoop`, `HauntedMansionLoop` and `CobwebLoop` (presets `halloween-midnight`, `halloween-haunted-mansion`, `halloween-cobweb`) |
| `halloween-midnight` | Starry sky: cream and lavender sparkles twinkling in place over night purple, a lavender and cream gradient stroke running slowly, with a bright core, and a lavender halo; the block has a lavender bar at the top with a sheen, and the border, a starry band with a double line, without brackets or jewels (`corners: "none"`). `midnight` ornaments: bats, pumpkins, stars and embers (the kit's orange stays only on the pumpkins and the embers' glow). 12 s cycles, seed 31 | `chat-halloween-midnight`, `block-halloween-midnight`, `border-halloween-midnight` | `HalloweenLoop` (`halloween-midnight`) |
| `halloween-haunted-mansion` | Banks of cold fog rolling along the bottom of the chat (still on the blocks, because of the panel's GIF), an iron, moonlight and amber gradient stroke, a dark halo and a grey-green header; the border has a flat bluish iron band and a double line. `haunted-mansion` ornaments: iron lanterns, spear railing, rose window, lancets, sconces and gate. 16 s cycles, seed 81 | `chat-halloween-haunted-mansion`, `block-halloween-haunted-mansion`, `border-halloween-haunted-mansion` | `HauntedMansionLoop` (`halloween-haunted-mansion`) |
| `halloween-haunted-interior` | Still dark green damask, a brass gradient stroke, a candlelight halo and a burgundy velvet header (on the block, a burgundy bar on the left); the border has a flat green band and a double line. `haunted-interior` ornaments: candelabra with candles, sconces and velvet valances, and the lightning flash (`lightning` 0.8 on the chat and the blocks, 1 on the border) together with the background. 16 s cycles, seed 113 | `chat-halloween-haunted-interior`, `block-halloween-haunted-interior`, `border-halloween-haunted-interior` | `HauntedInteriorLoop` (`halloween-haunted-interior`) |
| `halloween-cobweb` | Dark violet gradient swaying slowly, a dimmed silver stroke with cream comets passing like reflections on the silk, a silver halo and rounded corners; the border has a dark band, a double line and radius 38. `cobweb` ornaments: dewy webs, strand garlands, moonlight, an amber ember and a black widow; amber only shows on the hourglass and the ember. 12 s cycles, seed 47 | `chat-halloween-cobweb`, `block-halloween-cobweb`, `border-halloween-cobweb` | `CobwebLoop` (`halloween-cobweb`) |
