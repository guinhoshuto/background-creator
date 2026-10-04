# Halloween overlay kits

Design spec of the four Halloween overlay kits: one kit per Halloween background, each with chat, block and border presets, a pack, and a set of themed ornaments in the shared overlay engine so the four kits look genuinely different. The original `halloween` theme, its `*-halloween` presets and `packs/halloween.json` stay as they were.

This page is the English version of the working spec (v2.1) the kits were built from, corrected against the code where the code moved on, followed by the decisions of the build phases. For the controls themselves see [overlays.md](overlays.md); for the pack format see [packs.md](packs.md); for each background see its theme page (linked in the table below).

The working spec used Portuguese ids; the English naming round renamed them. Where an older note uses the left column, read the right one:

| Spec-era id | Current id |
| --- | --- |
| `halloween-noite`, `halloween-mansao`, `halloween-interior`, `halloween-teia` (themes, packs, ornament sets `noite`, `mansao`, `interior`, `teia`) | `halloween-midnight`, `halloween-haunted-mansion`, `halloween-haunted-interior`, `halloween-cobweb` (sets `midnight`, `haunted-mansion`, `haunted-interior`, `cobweb`) |
| `BlocoLoop`, `BordaLoop`, `bloco-*`, `borda-*` presets | `BlockLoop`, `BorderLoop`, `block-*`, `border-*` |
| `nenhum`, `mascara`, `esquerda`, `topo`, `colchetes`, `joias` | `none`, `mask`, `left`, `top`, `brackets`, `jewels` |
| fills `nevoa`, `damasco`, `brilhos`, `pontos`, `gradiente`, `solido`; strokes `formigas`, `cometas`, `pulso` | `fog`, `damask`, `sparkles`, `dots`, `gradient`, `solid`; `dashes`, `comets`, `pulse` |
| fits `painel`, `janela`, `tela` | `panel`, `window`, `screen` |
| sizes `painel-twitch`, `jogo`, `tela-cheia`, `tela-vertical`, `webcam-redonda`, `chat-padrao`, `cartao`, `circulo`, the `etiqueta` sizes | `twitch-panel`, `gameplay`, `fullscreen`, `fullscreen-vertical`, `webcam-round`, `chat-standard`, `card`, `circle`, `label-sm` and `label` |

## 1. Deliverables

| Theme = pack = preset suffix | Background (composition + preset) | Duration / seed | Background page |
| --- | --- | --- | --- |
| `halloween-midnight` | `HalloweenLoop` + `halloween-midnight` | 12 s / 31 | [Autumn night](themes/halloween-autumn-night.md) |
| `halloween-haunted-mansion` | `HauntedMansionLoop` + `halloween-haunted-mansion` | 16 s / 81 | [Haunted mansion](themes/halloween-haunted-mansion.md) |
| `halloween-haunted-interior` | `HauntedInteriorLoop` + `halloween-haunted-interior` | 16 s / 113 | [Mansion interior](themes/halloween-mansion-interior.md) |
| `halloween-cobweb` | `CobwebLoop` + `halloween-cobweb` | 12 s / 47 | [Spider webs](themes/halloween-spider-webs.md) |

Per theme: `presets/chat-<theme>.json`, `presets/block-<theme>.json`, `presets/border-<theme>.json` and `packs/<theme>.json`. The overlays use the background's duration and seed, so they loop in step with it; the interior's flashes coincide with the background's when both start together. `tests/pack.test.ts` pins each kit's background composition and preset, and the overlay presets' `durationSeconds` and `seed` equal to the background's.

Pack shape (the manifests in `packs/halloween-*.json` are the source; `npm run render:pack -- <theme> --dry-run` lists the files):

- The background item (webm, png).
- With ornaments: `ChatLoop` at every chat size; `BlockLoop` at every block size except `twitch-panel`; `BlockLoop` at `["twitch-panel"]` alone (webm, png; gif until 2026-10-03, see [Packs](packs.md)); `BorderLoop` at the webcam sizes and `gameplay`. Items are webm + png unless noted.
- The Twitch panel takes item props only where its padding pockets need room for the motifs: `halloween-midnight` `{"paddingX": 48, "paddingY": 36}`, `halloween-haunted-mansion` `{"paddingX": 32, "paddingY": 24}`, none on the interior and cobweb kits.
- The large frames scale their ornaments on a wider bleed: `webcam-16x9-lg` `{"bleed": 72, "ornamentScale": 1.5}`, `gameplay` `{"bleed": 96, "ornamentScale": 2}`.
- The screen frames (`fullscreen`, `fullscreen-vertical`) ship only without ornaments: large enough ornaments there would eat the picture.
- A `plain` variant of every chat, block, Twitch panel and border size (screens included) with the preset and `{"ornaments": "none"}`, in `<pack>-<size>-plain.<ext>`. The OBS masks are shared by both variants.

See [packs.md](packs.md) for variants, masks and delivery.

## 2. Engine additions

### 2.1 Fill styles `fog` and `damask`

`fog` (fog banks):

- Soft elliptical banks drawn with radial gradients (no per-element blur filter) in `fillColors[1]` (atmosphere), with a lighter core in `fillColors[2]` (moonlight), over a base rect in `fillColors[0]`. 1–3 colours are handled like `splitColors`, never undefined.
- Bank height = `fillScale` px; width = 5.8 × height; spacing S = 2.25 · `fillScale`, fixed px. Two staggered rows in the lower part of the area, with the same spacing and the same speed (no parallax).
- Drifts sideways only: direction = `cos(fillAngle) >= 0 ? +1 : −1` (never 0).
- Motion: period S, `laps = lapsFor(fillSpeed, T, S)`, speed = laps · S / T. `getFillMotion` depends only on the style and the area. `fillSpeed` = k · S / `durationSeconds` with k whole gives the exact speed at every size; use k ≥ 3, or the densest and thinnest zones of the fog stay pinned to the panel.
- Every per-bank attribute (size, opacity, vertical offset, core) is a function of the bank's current position (periodic in S) and of time through whole harmonics, never of its index or a per-index seed, so the wrap by one spacing is invisible. Banks wrap only while fully outside the area, soft reach included. No breathing.
- Legibility cap: the body covers at most 0.30 (`FOG_BODY_CAP`) and the core at most 0.10 (`FOG_CORE_CAP`) of the composite. On the mansion kit's colours over `#0E1520`, cream text keeps ≥ 6.9:1 and amber ≥ 4.9:1 at `fillOpacity` 1 or over dark footage; at 0.9 over white footage amber drops to 4.3:1, so use `fillOpacity` ≥ 0.95. `tests/overlay-engine.test.ts` checks the composite pixel by pixel.
- `refineFill` exempts it from the aliasing check; its subject in messages is "the fog".

`damask` (damask wallpaper):

- The interior background's `DAMASK` motif (exported from `HauntedInteriorArtwork.tsx`) on a half-drop lattice, rendered as one element: an SVG `<pattern>` (id `${idBase}-damask-${key}`, `userSpaceOnUse`) filling the area. The tile is `fillScale` px wide and 1.5 × as tall (`DAMASK_TILE_RATIO`, the background's 90.3 × 135.5).
- Ink `fillColors[1]` at `fillOpacity` over the base rect `fillColors[0]`; `fillColors[2]` is ignored.
- Moves like `dots` along `fillAngle` (nearest axis or diagonal) through a `patternTransform` offset, whole periods per cycle, at `fillSpeed`; 0 keeps it still, and the kit presets use 0. Aliasing is refined like `dots`, with the subject "the damask".
- Presets pick a pre-mixed dark ink close to the base (about 1.2:1).

Both have element types in `elements.ts` (the `FillElement` union) and cases in `renderOverlayElement`, never emit a `shade` element, go through `buildFillScene`, have moving and still entries in the `overlay-engine.test.ts` cases, and render with the engine's default fill values (scale 32, speed 16, angle 45) with no NaN or undefined, independent of `fillLight`.

### 2.2 Ornament fields

A shared field group (`ornamentFields()` in `src/overlays/shared/ornaments/fields.ts`), added to chat, block and border:

| Field | Range (default) | Meaning |
| --- | --- | --- |
| `ornaments` | `none`, `midnight`, `haunted-mansion`, `haunted-interior`, `cobweb` (`none`) | The set; the description names each set's motifs |
| `ornamentColors` | 1–3 colours (`#CFC6E4`, `#F6EFD8`, `#E8963C`) | Roles as in the backgrounds' `colors`: [0] fog or silk (cool), [1] moonlight (light), [2] warm light (falls back to [0]) |
| `ornamentSize` | 12–256 px (48) | Nominal size of the set's hero motif, fixed px, never scaled with the box: moon diameter, bat wingspan, candelabra height to the flame tip, web radius. Other motifs keep fixed ratios to it, up to caps, or have a fixed size |
| `ornamentScale` | 1–4 (1) | Added after the spec: scales every motif together (sizes, caps, strokes, spacing) for large frames, measuring free room at the same scale |
| `lightning` | 0–1 (0) | Lightning flash, independent of `ornaments` |

The defaults (`none`, `lightning: 0`) leave every existing theme byte-identical: the layers render null (no empty `<g>`), `chat-neon` still equals `parse({})` except the seed, and masks are unchanged.

### 2.3 Room rule

Placement is a pure function of the layout, `ornaments` and `ornamentSize` (with `ornamentScale`, of the frame scaled by it): no seed, no frame index. It is memoised.

- Each set lists its motifs per slot in priority order, hero first. Each motif takes size = min(nominal, room at its slot), floored to 0.5 px.
- A secondary motif below its own minimum is dropped, so the element count is constant per props and size.
- The hero is refused only when it fits no slot at its minimum. The refusal is on path `['ornaments']`: `The "<set>" ornaments do not fit this size: <way out>`, where the way out comes from `ornamentWayOut(frame)` per kind and fit:
  - chat: `increase bleed, padding or radius or use ornaments none.`
  - block: `increase bleed, paddingX, paddingY or radius or use ornaments none.`
  - border window: `increase bleed or radius or use ornaments none.`
  - border screen: `increase thickness, glow or radius or use ornaments none.`
  - `radius` is left out when it is already at its maximum (a circle, a pill, a round screen frame), for example `increase bleed or padding or use ornaments none.` and `increase thickness or glow or use ornaments none.`
- Every hero's minimum extent is ≤ 12 px, so every named size keeps its hero.
- There is no bleed refusal for ornaments: a room-limited motif cannot pass the bleed.

Corner slots slide along the slot's outward diagonal: front t ∈ [−min(w,h)/4, 512], back t ∈ [0, 512] (hub at or outside the outline corner). `slideToFit` returns the fitting t nearest `prefer` (default 0). On circles the slots are the 45° points.

### 2.4 Module, types and contract

Files in `src/overlays/shared/ornaments/`: `types.ts`, `fields.ts`, `frame.ts`, `place.ts`, `draw.ts` (shared SVG helpers such as `RadialLight`, `ornamentPartId`, `ornamentPalette`), `render.tsx` (`OrnamentLayer`, `FlashLayer`), `registry.ts`, `index.ts` (explicit named exports), and one set per name in `sets/` (`<name>.tsx` plus helpers `<name>-*.ts(x)`). `src/overlays/shared/index.ts` re-exports them. Shared code never imports from the kind folders, and a set never imports the registry, `render.tsx` or an index (import cycle).

`types.ts` holds the real types; in short:

- `OrnamentFrame`: what a set may read about where it is drawn: `kind` (`chat` | `block` | `border`), `fit` (`panel` | `window` | `screen`), `canvas`, `box`, `outline` (panels: the panel shape; border: `layout.outer`, second line included), `track` (stroke centreline, where the flash edge runs), `circle`, `hole` (the border's `holeShape`, or null), `keepOut` (chat: content and header; block: content; border: none), `paintLimit` (the canvas; the box on screen frames), `cover` (what hides the back layer: the panel shape, or `roundRectPath(outer)` nonzero on both border fits), `accent` (block only: `left` | `top` | null) and `glow` (0 on `twitch-panel`: crisp motifs, no lights).
- Built by `panelOrnamentFrame({kind, layout, keepOut, accent?, glow})` and `frameOrnamentFrame({layout, track, glow})`.
- `OrnamentPlacement = {motif, slot, layer, x, y, extent, size}`, slot one of TR, BR, BL, TL, top, bottom, left, right, center; `extent` is the radius of the circle that holds the motif, its motion and its light.
- `OrnamentBase = {type, layer, anchor, x, y, reach, light, lightOpacity, opacity}`; `FlashElement = {type: 'flash', left, right, color, opacity}`.
- `OrnamentSet` (method syntax): `name`, `seedOffset`, `minExtent`, `place(frame, {ornamentSize})` (seed- and frame-free, hero first, `[]` when the hero fits nowhere), `build(frame, placements, style, frameIndex, durationInFrames)`, `render(element, key, context)`, optional `refine`.

`place.ts` helpers: `ORNAMENT_EDGE = 1`, `ORNAMENT_CLEARANCE = 1`, `ORNAMENT_SEED = 503` (set offsets 0, 20, 40, 60; streams taken elsewhere: fill +101, stroke +211, glow/halo +307, corners/accent +401, lightning +509), `ORNAMENT_MAX_SLIDE = 512`, `cornerSlots(frame)` (TR, BR, BL, TL, with the border's corner-point formula, so circles get their 45° points), `maxExtentAt`, `fitsAt` (sets validate any non-corner spot with it), `slideRange`, `roomAt`, `slideToFit`, `fitMotif` (`nominal` and `min` are extents; `hero: true` for the hero), `ornamentOutset`, `harmonics(hz, T) = max(1, round(hz · T))`, `ornamentRandom(seed, set)`, `slotsOffAccent(frame)`, `scanAround`, `enclosingCircle`, `floorHalf`, `ceilHalf`.

Element contract:

- Flat: numbers and strings only (no booleans, arrays or nested objects); no `radius*` key that can reach 0; directions as unit vectors (bounded swings |θ| < π/2 may be plain angles).
- `type` starts with `<set>-`; `layer` equals its placement's; `anchor` indexes the placement.
- `hypot(x − px, y − py) + max(reach, light) ≤ extent` in every frame, fractional frames included.
- `lightOpacity ≤ 0.2` (`MAX_CONTENT_OPACITY`) wherever a front element's light circle meets `keepOut`; `opacity` in [0, 1]; `light` is 0 when `frame.glow` is 0.
- Constant count per (props, size), listed by place.
- Timing: `cycle = cycleOf(frame, N)`; seconds = cycle · `durationSeconds`; harmonics from Hz (bat flap 2 Hz; candle 7/19/11/5/13 at 16 s). Values are periodic with value and velocity continuous at the seam (whole-harmonic sinusoids, or a background timeline that is exactly constant within max(0.35 s, 8 % of T) of the seam). Never `fract()` or wrapped phases as element fields; never pixel-snapped. Random phases come from `ornamentRandom`.
- Frame 0 is the hero pose (wings open ≥ 0.8, flames within ±15 % of their mean, lantern glass lit), because pack PNGs are frame 0.

Visual rules:

- A motif whose body is darker than L 0.02 (bats, spider) carries a lit edge ≥ 1 px in `ornamentColors[1]` at ≥ 0.4 on its moon side.
- Light line-work (webs) keeps a dark outline, `#120C1C` at 0.2 (`DARK_OUTLINE`).
- Coloured detail is ≥ 2 px or near-neutral (WebM is yuv420).
- Lights are never cut by the canvas edge: they are part of `extent`.
- No `filter=` and no `mix-blend-mode` in ornament or flash groups.
- Gradients are per-element defs with ids from `ornamentPartId`, `${idPrefix}-ornament-<layer>-<key>-<part>`.

### 2.5 Kind integration

- **Schemas.** Chat, block and border spread `ornamentFields()`; the layout `Pick`s include the keys.
- **Layout.** The `OrnamentFrame` is built from the finished base layout; placements come from the registry; `outset = max(base.outset, ornamentOutset(frame, placements))`; the layout carries `ornamentLayout: {frame, placements}` (chat, both block branches, the border geometry). On the border the outset folds in for windows only; screens stay at 0. Ornaments never feed back into the content layout, and layouts stay seed-invariant.
- **Refinements.** `refineLightning`, then `refineOrnaments`, are each kind's last refinements; on the border they come after the `mask` early return and the screen-bleed check, so a mask is never refused for them. Mask props never carry ornaments, and mask markup is identical across themes.
- **Scene parts.** `ornamentBack`, `ornamentFront` and `flash` are new parts of the chat, block and border layers. Flat scene order: halo, ornamentBack, the existing kind layers, ornamentFront, flash. Nothing is appended to the stroke, glow, corners or accent parts.
- **Render.** Chat and block: halo, `OrnamentLayer` back (clipped to the paint limit minus the cover, evenodd), fill, header or accent, rim, stroke, `OrnamentLayer` front, `FlashLayer`; the chat header guide stays last. Border, all inside `FrameGroup`: halo, `OrnamentLayer` back as a sibling before the band fill (never inside the band clip), band fill, rim, stroke, `OrnamentLayer` front, `FlashLayer`. Layers return null when empty; groups carry `data-ornaments="back|front"` and `data-flash="true"`.
- **Lightning.** `LIGHTNING`, `LightningStrike`, `getLightningStrikes`, `getStrikeEnvelope`, `getActiveStrike` and `cycleSeconds` live in `src/backgrounds/halloween/lightning.ts` (RNG `createSeededRandom(seed + 509)`), with `getWindowFlash(props, frame, N): [left, right]`, the two windows' flash levels before the background multiplies them by its intensity. `HauntedInteriorLoop.tsx` re-exports them and its scene uses `getWindowFlash`, so its output is unchanged. `buildFlashScene(style, f, N)` returns `[]` at lightning 0, otherwise one `{type: 'flash', left, right, color: '#DCE6FF', opacity: lightning}` (`LIGHTNING_COLOR`). A cycle under 1.5 s has no strike, so `lightning > 0` is refused there: `With durationSeconds below 1.5 s there is no lightning: use durationSeconds ≥ 1.5 or lightning 0.`
- **Flash layer.** A cold horizontal-gradient wash whose left and right stops are the two levels, clipped to the panel shape (or the band ring, plus the fillet on screens), peaking at 0.16 · lightning over panels (`FLASH_PANEL_PEAK`) and 0.35 · lightning on the border band (`FLASH_BAND_PEAK`), plus a `#DCE6FF` edge on the track at 0.6 · level (`FLASH_EDGE_PEAK`), as wide as the stroke and absent when `strokeWidth` is 0.
- **Defaults.** The `Root.tsx` literals of `ChatLoop`, `BlockLoop` and `BorderLoop` end with `"ornaments":"none" as const,"ornamentColors":["#CFC6E4","#F6EFD8","#E8963C"],"ornamentSize":48,"ornamentScale":1,"lightning":0`; `tests/overlay-registry.test.ts` checks the literal against the schema.
- **Theme lists.** `tests/helpers/themes.ts` exports `CLASSIC_THEMES` and `KIT_THEMES`; `OVERLAY_THEMES` is both, all mandatory. The overlay-registry, chat, block, border, circle, pack and speed-table tests loop over it.

Tests:

- `tests/helpers/ornament-harness.ts` (`registerOrnamentHarness(set, {kinds})`), called by `tests/ornaments-harness-<set>.test.ts` (cobweb's border in its own file), with the adapters in `tests/helpers/ornament-kinds.ts`. It runs each set × kind × every named size, plus border radius 0/16/200, round blocks with accent `left` and `top`, and two small round screen frames (the only cases allowed to refuse). The neutral base is `{ornamentSize: 48, lightning: 0.7, durationSeconds: 12, seed: 7}`, also at `ornamentSize` 12 and 256, with 1- and 2-colour `ornamentColors` and an opaque mp4, plus every kit preset with its pack item props.
- It asserts: strict parse or the documented refusal; seed-invariant placements; placements inside the paint limit, clear of the hole, front clear of the text; every screen placement in front; `ornamentOutset ≤ layout.outset ≤ bleed`; the element contract at every integer frame and a fraction past it; no jump between neighbouring half frames; the flash matching `getWindowFlash` and its alpha peaks; periodicity, seam velocity and validity scans; clean markup (no NaN, Infinity, undefined, filters or blend modes in the groups, unique prefixed ids); unchanged masks; a hero at every named size for every kit preset; `corners: "none"` on the kit border presets.
- `tests/ornaments.test.ts` keeps the engine rules (lightning parity with the interior background, the refusal messages and their ways out, the short-cycle refusal, `place.ts` units, `none` leaves the classic themes untouched). `tests/ornaments-<set>.test.ts` hold each set's own checks; `tests/helpers/ink.ts` extracts drawn ink from markup for the midnight and mansion ink tests.
- `tests/markup-snapshot.test.ts` hashes every pack file's markup and the backgrounds' scenes against `tests/__snapshots__/markup.json` (the kits' old `hash-backgrounds` guard, now versioned); `npm run ornaments:report -- <pack>` prints each file's placements (slot, layer, size, extent, room) and dropped motifs from `place()` alone, the measurement the critics' placement probes used to do.

### 2.6 Sets

Each set follows its background: its palette, its motifs (ported or exported from the background's artwork) and its rhythms. The set files' header comments hold the exact ratios, caps and slots; [overlays.md](overlays.md) has the buyer-facing table.

- `midnight` (`HalloweenLoop`). Hero: the moon, whose diameter is `ornamentSize`. It keeps its placement (behind the TR corner, in front where the back has no room) and decides the bats' corner, the side their moonlit rim faces and the refusal, but it is not painted. Up to three bats (the background's `Bat` paths, a dark `#171021`-like fill with a lit rim in `ornamentColors[1]` at ≥ 0.45, 2 Hz flap, a small closed 1:2 figure-of-eight, wings open at frame 0) fly in the top bleed near TR; long top edges get a second flock. Jack-o'-lanterns (the exported `Pumpkin`, face flicker at harmonics 3 and 7, colour `ornamentColors[2]`): a pair at BL and a single one at BR. The background's 4-point stars line long edges at a fixed 168 px pitch, with embers alternating along long bottom edges. Orange appears only in the pumpkins and the embers' glow.
- `haunted-mansion` (`HauntedMansionLoop`). One bat per file, the hero and the only motif (the owner's choice on 2026-10-04: the lanterns, railing, rose window, sconces and gate got lost at overlay sizes). It is the background's own bat (`MANSION_BAT`, fill `#080F18`) with a lit rim in `ornamentColors[1]` towards the moon (up and right) and a thin edge in `ornamentColors[0]`; `ornamentSize` is its wingspan. It flies on the top edge as near TR as the room allows (on round sizes, on the ring at 45°, clear of the accent arc), with a 2 Hz flap, a small 1:2 figure-of-eight and the wings open at frame 0.
- `haunted-interior` (`HauntedInteriorLoop`). Hero: a brass candelabra with lit candles (wax gradient, brass dish, the background's flame path via `flamePathOf`/`flameCorePathOf`, core `#FBEBC8`, warm light); `ornamentSize` is its height from the base to the tallest flame tip. Flicker, height and lean follow the background's harmonics. Sconces and velvet valances with tassels complete it, and the kit presets turn `lightning` on. No eyes.
- `cobweb` (`CobwebLoop`). Hero: an orb-web fan at TR (the exported `buildWebGeometry`, memoised, and `OrbWeb` at pixel radius; radius = `ornamentSize`), a counterweight fan at BL, and on borders webs at the other two corners. Dew beads (≤ 6 per fan, bead ≤ 2.2 px, halo ≤ 6 px) flash when the moonlight glint passes, twice per cycle. Moonlight behind the hero; a soft amber ember (radial, ≤ 0.15) by the counterweight; thread garlands with drops along the top edge (and the bottom one on rectangular window borders and larger rectangular blocks; none on round sizes). A black widow (the exported `Spider`, with `minLegWidth` so small scales stay legible) hangs from the hero web or rests in its corner pocket; it needs `glow` above 0, so the Twitch panel has none. Silver monochrome: amber only in the hourglass and the ember.

Background refactors made for the sets are export- or parameter-only: the backgrounds' scenes and markup stay identical.

## 3. Presets

Common rules:

- No `width`, `height`, `bleed`, `fit` or `guides` keys; each preset parses strictly alone and merged with every size's props and its pack item props.
- Chat: `strokeWidth` 2–3, `headerHeight` > 0, `glow` > 0. Block: frame 0 ≠ frame 200 and frame N−1 ≠ frame 0.
- Border: sets `thickness` and `corners: "none"`, and still fits the round sizes.
- Every kind × size has a travelling stroke (`dashes`, `comets` or a multicolour `gradient`, speed > 0) or a moving fill, within ±35 % of the preset's speed; `DOCUMENTED_MINIMUMS` in the speed table stays empty.
- `ornamentSize` is chosen so the hero reads well on chat and webcams; room clamps it on labels, the Twitch panel and the screen frames.

The shipped values (the `presets/*-halloween-<set>.json` files are the source):

| Kit | Fill | Stroke | Glow, halo | Header / accent / border band | Ornaments |
| --- | --- | --- | --- | --- | --- |
| `halloween-midnight` (bg `#120E20`) | `sparkles`, `fillRise` false, `["#120E20", "#F7DCA6", "#9B85C9"]` (a cool starfield, no orange), `fillLight` 0.05 | `gradient` `["#9B85C9", "#F7DCA6"]`, `gradientLength` 400 at 36 px/s, `strokeCore` 0.4 | `glow` 14, `glowPulses` 1, `glowStrength` 1.1, lavender halo `#9B85C9` | header `#9B85C9` at 0.12; block accent `top` `#9B85C9` size 4, `accentSheen` 1; border `thickness` 12, `lines` 2 | `midnight`, `["#9B85C9", "#F7DCA6", "#ED792D"]` |
| `halloween-haunted-mansion` (bg `#0E1520`) | `fog` `["#0E1520", "#688789", "#D6DDC7"]` at 0.95; chat `fillScale` 96, `fillSpeed` 40.5 (k = 3); block `fillSpeed` 0 (the Twitch panel GIF); border `solid` `#101A24` | `gradient` `["#8FA59F", "#D6DDC7", "#E8AF62", "#D6DDC7"]`, 320 at 40 px/s, `strokeCore` 0.3 | `glow` 12, `glowPulses` 2, `glowStrength` 1.2, dark halo `#0A111A` | header `#688789` at 0.2; block accent `none`; border `thickness` 12, `lines` 2 | `haunted-mansion`, `["#688789", "#D6DDC7", "#E8AF62"]` |
| `halloween-haunted-interior` (panel `#0C1412`) | chat and block `damask` `["#0C1412", "#151F1B"]`, `fillSpeed` 0; border `solid` `#141C19` at 0.95 | brass `gradient` `["#86724E", "#E8D6A8", "#CA8A48"]`, 320 at 40 px/s, `strokeCore` 0.3 | `glow` 12, `glowPulses` 6, halo `#CA8A48` | velvet header `#6C2232` at 0.85; block accent `left` `#6C2232` size 8, `accentSheen` 0; border `thickness` 12, `lines` 2 | `haunted-interior`, `["#536C68", "#A8BDB0", "#CA8A48"]`; `lightning` 0.8 (chat, block), 1.0 (border) |
| `halloween-cobweb` (bg `#100B1B`) | `gradient` `["#100B1B", "#1A1330", "#0C0916"]`, `fillAngle` 90, `fillSpeed` 8, `fillLight` 0.05; border `solid` `#100B1B` at 0.9 | `comets` `["#CFC6E4", "#F6EFD8"]`, `cometSpacing` 480, `cometTail` 200, 80 px/s, `trackOpacity` 0.4, `strokeCore` 0.2; `strokeWidth` 2 (chat, block), 3 (border) | `glow` 10, `glowPulses` 1, `glowStrength` 1, halo 8 `#CFC6E4` | header `#CFC6E4` at 0.06; block accent `none`; border `radius` 38, `thickness` 16, `lines` 2, `lineGap` 5 | `cobweb`, `["#CFC6E4", "#F6EFD8", "#E8963C"]` |

## 4. Phase decisions

Decisions from the build phases (P0 foundation, P3 integration, P5 review fixes) that still hold in the code.

### P0: foundation

- **The text-light cap is front-only.** The back layer is clipped to outside the cover, which contains every text area, so a back light can never show over text.
- **`fitMotif` works in extents.** `nominal` and `min` are extents (circle radii); an optional `ratio` derives `size`.
- **The hero rule.** With `hero: true` the threshold is `min(min, floorHalf(nominal))`: at a small `ornamentSize` whose nominal is under the minimum, the hero is placed at its nominal wherever room allows, instead of being refused.
- **One refusal path.** A set returns `[]` from `place()` when its hero fits nowhere, and the registry refuses on the empty list; a set's own refusals go through `refine`.
- **The way out was measured, not guessed.** On panels a larger radius gives the corners more room (a rounder corner sits further in), so "decrease radius" was wrong; on window borders thickness and glow give nothing and radius helps; on screen frames the bleed is always 0 and thickness, glow and radius all help.
- **No back room on screen frames.** The border's cover is `roundRectPath(outer)` nonzero for both fits, so back motifs tuck under the band and never show in the window's glow margin (which the hole mask does not empty). On screens what is left of the box is the band's fillet, which the band fill paints right after, so `maxExtentAt` gives the back layer −∞ there: back placements are dropped, and a set whose hero is a back motif elsewhere puts it in front on screens.
- **Flash details.** The edge is as wide as the kind's stroke, with no edge at `strokeWidth` 0; the gradient spans the outline's bounding box (the shape on panels, `outer` on windows, the box on screens).
- **Placement memo.** The registry's placement cache is process-global (256 entries) and returns frozen arrays; sets must return fresh arrays and keep `place()` free of hidden state (the harness calls it twice and deep-compares).
- **Keep `build()` cheap.** The harness builds every integer frame and a fraction past it for every case, so per-frame work is plain arithmetic, with per-placement constants precomputed from a cheap seeded stream.

### P3: integration

- **The Twitch panel's item props are explicit.** `tests/pack.test.ts` allows only `transparent`, `paddingX` and `paddingY` in its item props, never `transparent: true`; the midnight and mansion kits use them so their motifs grow in the padding pockets (the mansion's lanterns go from 22 to 32 px, pinned in `tests/ornaments-haunted-mansion.test.ts`).
- **Buyer margin.** Motifs live in the bleed, so the theme pages tell buyers to keep the bleed free around frames and panels in the scene, including against the screen edge and between pieces.
- **Lightning sync in OBS.** OBS media sources restart when a scene becomes active again, so overlays flash with the interior background only when they start together: same scene, same restart option.

### P5: review fixes

- **Round screen frames.** In the interior set, candles stand on brass brackets only on round non-screen outlines (`onBrackets(frame) = frame.circle && frame.fit !== 'screen'`); small round screen frames get chambersticks. The harness runs two round screen frames per set.
- **No radius in the way out when it is maxed.** `ornamentWayOut` offers `radius` only when the clamped radius is below half the shorter side and the outline is not a circle.
- **Glow 0 means no lights.** At `glow` 0, at any size, the ornaments draw no soft lights and the cobweb set drops its moonlight, ember and spider; the Twitch panel is one case of it.
- **Draw once.** Each cobweb fan's web and each garland swag are drawn once, with one union clip path, instead of once per piece; this also cut the cobweb markup by about three quarters.
- **Shared geometry with the backgrounds.** The flame (`FLAME_TIP`, `flameSegments`, `flamePathOf`, `flameCorePathOf` in `hauntedInteriorGeometry.ts`) and the moon (`MOON_R`, `MOON_CRATERS`, `MOON_GLINT_ARC` in `HalloweenArtwork.tsx`) are exported by the background and used by both sides, with the backgrounds' output unchanged. One lightning colour, `LIGHTNING_COLOR`, serves the background, the flash and the valances.
- **Shared placement helpers.** `ceilHalf`, `enclosingCircle` and `scanAround` live in `place.ts`; `RadialLight` takes `mid` and an optional focal point and replaces per-set copies.
- **Kit props in tests.** `tests/helpers/ornament-kinds.ts` has `kitProps(theme, size, extra)` in the pack plan's order (preset < item props < size < extra) and `packItemProps`; set tests read the pack instead of copying its props.
- **Stricter harness.** The flash alpha is checked against the hard-coded peaks 0.16, 0.35 and 0.6 and, on panels, `lightning · wash ≤ MAX_CONTENT_OPACITY`; a field may not jump between neighbouring half frames by more than 0.02 + 0.25·|Δ| of the mean of its neighbours (`flash` and `cold` exempt); every bordered and accented variant must keep its hero.
- **Plain theme lists.** `tests/helpers/themes.ts` has no switch or skips: every theme in it is mandatory.
