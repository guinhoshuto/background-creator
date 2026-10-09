# Overlay ornament engine: reference for a new kit

Distilled from the Halloween mapping reports (`.cache/bgc-10/understand/`, 2026-09-27/28) and checked against the code on 2026-10-08; every claim points at `file:symbol`. When this page and the code disagree, the code wins (README, Known pitfalls, "Docs that quote pack, preset or size ids go stale").

Already documented elsewhere, not repeated here:

- Controls, the ornament table per set, the room rule in prose, themes: `docs/overlays.md` (Controls, Ornaments, Themes).
- Types, `place.ts` helpers, element contract, visual rules, kind integration, harness assertions, phase decisions: `docs/kits-halloween.md` §2.2–2.5 and §4.
- Box, bleed, text area, named sizes and their bleeds: `docs/asset-kinds-and-sizes.md`.
- Pack manifest format, variants, masks, `ornamentScale` items, delivery: `docs/packs.md`.
- Whole laps, px periods, the 40% step rule: `docs/loop.md`.
- Test commands, `ornaments:report`, markup baseline, adding an asset: `docs/development.md`.
- Ornament rules in one paragraph, test and render etiquette: `AGENTS.md` (Overlays, Agents on this machine).

## 1. Where things live

| What | Where |
| --- | --- |
| Set ids, the `none` choice | `src/overlays/shared/ornaments/types.ts:ORNAMENT_CHOICES`, `ORNAMENT_SET_IDS` |
| Field group (`ornaments`, `ornamentColors`, `ornamentSize`, `ornamentScale`, `lightning`) | `ornaments/fields.ts:ornamentFields`, `ORNAMENT_SIZE_RANGE` (12–256, 48), `ORNAMENT_SCALE_RANGE` (1–4, 1) |
| Set by name | `ornaments/registry.ts:ORNAMENT_REGISTRY` |
| Frame a set may read | `ornaments/types.ts:OrnamentFrame`; built by `ornaments/frame.ts:panelOrnamentFrame`, `frameOrnamentFrame` |
| Placement helpers | `ornaments/place.ts` |
| Placement, scale, scene, refusals | `ornaments/registry.ts:placeOrnaments`, `layoutOrnaments`, `layoutOutset`, `buildOrnamentScene`, `buildFlashScene`, `refineOrnaments`, `refineLightning`, `ornamentWayOut` |
| Layers | `ornaments/render.tsx:OrnamentLayer`, `FlashLayer` |
| Shared drawing helpers | `ornaments/draw.ts:ornamentPalette`, `ornamentPartId`, `RadialLight`, `DARK_OUTLINE`, `mixColor`, `unitToward` |
| Kind hooks | `chat/ChatLoop.tsx:getChatLayout`, `block/BlockLoop.tsx:withOrnaments`, `border/scene.ts:getBorderGeometry` |
| Sets | `ornaments/sets/<set>.tsx` plus helpers `ornaments/sets/<set>-*.ts(x)` |

A set never imports `registry.ts`, `render.tsx` or an `index.ts` (import cycle; comment on `ORNAMENT_REGISTRY` and in `ornaments/index.ts`). Shared code never imports a kind folder.

## 2. One string for theme, pack and presets

- Theme = pack name = preset suffix. `tests/pack.test.ts` reads `packs/<theme>.json` and checks `pack.name === <file>`, then looks up items by preset `chat-<theme>`, `block-<theme>`, `border-<theme>` (test "os oito manifestos…").
- `tests/overlay-registry.test.ts` ("cada preset de tema…") requires the `presets/(chat|block|border)-*.json` files to equal `tests/helpers/themes.ts:expectedPresetFiles()` exactly: a preset without a theme, or a theme without its three presets, fails.
- A kit theme is `halloween-<set>` today, and the code derives it, not just the docs:
  - `tests/helpers/ornament-harness.ts:registerOrnamentHarness` runs the kit presets of ``theme = `halloween-${set}` ``;
  - `tests/ornaments-scale.test.ts:inputOf` reads the ``halloween-${set}`` presets for every id in `ORNAMENT_SET_IDS`;
  - `tests/pack.test.ts` ("halloween-backgrounds traz o fundo de cada kit…") expects `packs/halloween-backgrounds.json` to hold every `KIT_THEMES` background, with variant = theme minus `halloween-`.
  A kit that is not Halloween needs those three generalized first (a test change, not a naming trick).
- No set id may start with another set's id plus `-` (`tests/test-kit.test.ts`): `test:kit` globs `tests/ornaments-harness-<set>*.test.ts`.

## 3. Files of a kit (names as of 2026-10-08)

Engine side (new set `<set>`):

- `src/overlays/shared/ornaments/sets/<set>.tsx` (exports the `OrnamentSet`), helpers `sets/<set>-*.ts(x)`.
- `ornaments/types.ts:ORNAMENT_CHOICES`: add the id.
- `ornaments/fields.ts:ornamentFields`: the `ornaments` description names each set's motifs.
- `ornaments/registry.ts:ORNAMENT_REGISTRY`: add the set.
- `tests/helpers/ornament-harness.ts:REFUSAL`: the regex lists the set names.
- `tests/ornaments-harness-<set>.test.ts`: one call, `registerOrnamentHarness('<set>')` (a heavy set may split kinds over files, like `ornaments-harness-cobweb-border.test.ts` with `registerOrnamentSizeCases`).
- `tests/ornaments-<set>.test.ts`: the set's own checks against its background (drawings, colours, rhythms), as for the four existing sets.
- `docs/overlays.md`: a row in the Ornaments table.

Kit side (theme `<theme>`):

- `presets/chat-<theme>.json`, `presets/block-<theme>.json`, `presets/border-<theme>.json`.
- The background preset the pack's background item names (the kits use `presets/<theme>.json`, e.g. `halloween-cobweb.json`; the tests require it to exist and parse, not its name).
- `packs/<theme>.json`.
- `tests/helpers/themes.ts:KIT_THEMES` (and `STATIC_ONLY` if a composition ships PNG only).
- `tests/__snapshots__/markup.json`, regenerated (`docs/development.md`; README pitfall "A change to `packs/*.json`…").

A new set adds an enum value, not a field: the `Root.tsx` literals and `ROOT_DEFAULT_PROPS` copies change only when a field is added.

## 4. Pipeline (pure, per props and size)

1. The kind builds its base layout, then `panelOrnamentFrame` / `frameOrnamentFrame` from it. Keep-out: chat `[content, header]` (`ChatLoop.tsx:getChatLayout`), block `[content]` plus its `accent` side (`BlockLoop.tsx:withOrnaments`), border none.
2. `layoutOrnaments`: with `ornamentScale` s ≠ 1, the frame is shrunk by 1/s (`frame.ts:scaleOrnamentFrame`), placed there, and the layer is drawn inside `scale(s)` (`render.tsx:OrnamentLayer`).
3. `placeOrnaments` calls `set.place(frame, {ornamentSize})` once per key and freezes the result (process-wide cache of 256, `PLACEMENT_CACHE_LIMIT`). `place` must return fresh arrays and keep no hidden state; the harness calls it twice and deep-compares (`ornament-harness.ts`, `fresh`).
4. Outset: `max(base.outset, layoutOutset(...))` on panels; on borders folded in only for `fit: 'window'` (`border/scene.ts:getBorderGeometry`); screens keep `base`. Ornaments never feed back into the content layout.
5. Refinements: `refineLightning`, then `refineOrnaments`, last in each schema (border: after the mask early return).
6. Per frame: `buildOrnamentScene` splits `set.build(...)` by `layer`; `buildFlashScene` adds one flash while `lightning > 0`.
7. Render order: halo, back layer, kind layers, front layer, flash (`docs/kits-halloween.md` §2.5).

## 5. The frame by fit

| | panel (chat, block) | window (border) | screen (border) |
| --- | --- | --- | --- |
| `paintLimit` | canvas | canvas | box |
| `hole` | null | `holeShape` | `holeShape` |
| `cover` (hides back) | panel shape | outer edge, nonzero | outer edge, nonzero |
| back room | yes | yes (under the band) | none: `place.ts:maxExtentAt` returns −∞ |

- Screens: every placement must be front (`ornament-harness.ts`, "em tela só na frente"); a hero that is back elsewhere goes front there.
- Round outlines: `place.ts:cornerSlots` gives the 45° points; on a round block with an accent, `slotsOffAccent` drops the two slots under the 120° arc (`left`: TL, BL; `top`: TL, TR).
- `frame.glow` is the kind's glow; at 0 every element's `light` must be 0 (`ornament-harness.ts`, "sem brilho (painel da Twitch), sem luz").

## 6. Placement and room

- Every motif is a circle of radius `extent` holding body, motion and light. `maxExtentAt` = distance to `paintLimit` minus `ORNAMENT_EDGE` (1), to `hole` (sdf), and, in front, to each keep-out rect minus `ORNAMENT_CLEARANCE` (1).
- Corner slides along the outward diagonal (`slideRange`): front from −min(w, h)/4 to `ORNAMENT_MAX_SLIDE` (512); back from 0 (centre at or beyond the corner).
- `roomAt` samples every 0.5 px and refines; `slideToFit` returns the fitting slide nearest `prefer`; sizes snap down to 0.5 px (`floorHalf`; `ceilHalf` for extents that must hold something).
- `fitMotif(frame, corner, {motif, layer, nominal, min, ratio?, prefer?, range?, hero?})`: `nominal` and `min` are extents; extent = min(nominal, room); dropped below `min`. With `hero: true` the threshold is min(min, floorHalf(nominal)).
- Non-corner spots (edges, rows): validate with `fitsAt`; `scanAround`, `enclosingCircle` help.
- The hero first; `place` returns `[]` when the hero fits nowhere, and `refineOrnaments` refuses with `ornamentWayOut(frame)` (the texts are in `docs/kits-halloween.md` §2.3). Secondary motifs that miss their minimum are dropped, so the count is fixed per props and size.
- `OrnamentSet.minExtent` ≤ 12 px, checked by the harness ("o mínimo do principal cabe…").
- Check placements without rendering: `npm run ornaments:report -- <pack>` (slot, layer, size, extent, room, dropped motifs; `scripts/ornament-rows.ts`).

## 7. ornamentSize and ornamentScale

- `ornamentSize` is the hero's nominal size in fixed px; each set defines what it measures (diameter, wingspan, height, radius) and the ratios and caps of the other motifs in its header comment.
- Room clamps it per slot; it never follows the box.
- `ornamentScale` grows sizes, caps, strokes and spacing together and measures room at that scale: s = 2 needs about twice the bleed for the same motifs. At 1 the layout has no `scale` key and no transform (`tests/ornaments-scale.test.ts`).
- The kit packs fix the two scaled items exactly: `webcam-16x9-lg` `{bleed: 72, ornamentScale: 1.5}`, `gameplay` `{bleed: 96, ornamentScale: 2}` (`tests/pack.test.ts`, "os oito manifestos…").

## 8. Build and render: what a new set gets wrong first

The contract is in `docs/kits-halloween.md` §2.4 and `types.ts:OrnamentBase`; checked by the harness. Easy to miss:

- `set.seedOffset`: taken 0, 20, 40, 60 (`types.ts:OrnamentSet`); the stream is seed + `ORNAMENT_SEED` (503) + offset (`place.ts:ornamentRandom`). Other streams: fill +101, stroke +211, glow/halo +307, corners/accent +401, lightning +509.
- Draw every element's random values whether used or not, so one motif never shifts another (`sets/midnight.tsx`, `build`).
- Rhythms in Hz from the background, turned into whole cycles with `harmonics(hz, durationSeconds)`; time from `motion.ts:cycleOf`. `build` must accept fractional frames; a field may not jump between neighbouring half frames by more than 0.02 + 0.25·|Δ| (`ornament-harness.ts`).
- Frame 0 is the hero pose: the pack PNGs are frame 0.
- Element types are declared with `type`, never `interface`, and `type` starts with `<set>-`.
- Colours through `ornamentPalette` (cool, light, warm; the last two fall back to cool), so 1- and 2-colour palettes work (the harness runs both).
- Def ids through `ornamentPartId(context, key, part)` = `${idBase}-${key}-${part}`; numbers in paths through `geometry.ts:svgNumber`.
- Soft light is `RadialLight` and counts in `extent`; front light over a text area ≤ `legibility.ts:MAX_CONTENT_OPACITY` (0.2).
- No `filter=`, no `mix-blend-mode` in the ornament and flash groups.

## 9. Sizes that bind a kit

The harness requires a kit preset to place its hero at every named size of every kind, including sizes the kit does not ship (`registerOrnamentHarness`, "o preset põe o motivo principal em todo tamanho"):

- `twitch-panel` (`src/sizes.ts`): bleed 0, glow 0, halo 0. `paintLimit` is the box, so the motifs live in the padding pockets, crisp, with no light. The kits do not ship it (`pack.test.ts`); the classic themes do, as GIF + PNG, item props only `transparent`, `paddingX`, `paddingY` (`TWITCH_PANEL_KEYS`).
- `fullscreen`, `fullscreen-vertical`: bleed 0, `fit: 'screen'`, front only. The kits ship them only as `plain`.
- Round sizes: the 45° slots; round borders must also keep `outset ≤ bleed` with `corners` forced to `none`, `brackets` and `jewels` (`tests/circle.test.ts`, "Borda redonda: a janela é um disco…").
- The pack's item props are checked too (`kitProps`, `packItemProps` in `tests/helpers/ornament-kinds.ts`).

## 10. Preset rules the tests enforce

- All kinds: strict parse alone and merged with every size's props; no `width`, `height`, `bleed`, `fit` or `guides` (`overlay-registry.test.ts`, "cada preset de tema…"). The preset never fixes a size.
- Duration and seed come from the background: each overlay preset's `durationSeconds` and `seed` equal the pack background's parsed values (`pack.test.ts`, "cada kit de Halloween traz o seu fundo…").
- Chat: `strokeWidth` 2–3; a header (`layout.header` non-null, so `headerHeight` > 0); `glow` > 0, since the render test expects `<filter id="chat-stroke-glow"` for every preset (`tests/chat.test.ts`).
- Block: frame 0 ≠ frame 200 (`block.test.ts`, "presets dos oito temas…") and frame N−1 ≠ frame 0 at every size ("o ciclo fecha em todos os tamanhos…"); legibility ≤ 0.2 over the text at every size.
- Border: sets `thickness` (read as a number in `border.test.ts`, "a moldura nunca passa do próprio contorno…"); kit presets use `corners: "none"` (harness).
- Kit presets set `ornaments` to their set (harness).

## 11. Speed across sizes

- Every moving layer of every theme preset stays within ±35% of the speed it asks for, on every named size of its kind (`tests/helpers/speed-table.ts:SPEED_TOLERANCE`, `tests/speed-consistency.test.ts`). `DOCUMENTED_MINIMUMS` is empty: no exceptions.
- Every kind × theme × size needs a moving layer; `pulse` and `still` do not count (`speed-consistency.test.ts`, "a tabela cobre todos os temas…").
- Why it bites: laps are whole and at least one (`perimeter.ts:lapsFor`), and the period is fitted to the track (`perimeter.ts:fitPeriod`), so a short track or a slow speed sits on the one-lap floor.
- Minimum `strokeSpeed` for a two-colour `gradient` to pass on every named size, measured on 2026-10-08 with the kinds' default geometry (re-run the test with the real preset):

  | `gradientLength` | 12 s | 16 s |
  | --- | --- | --- |
  | 320 | 23 px/s | 18 px/s |
  | 400 | 31 px/s | 23 px/s |
  | 480 (the default) | 35 px/s | 26 px/s |

  No failure above those up to 200 px/s. The upper bound is the 40% step rule (`motion.ts:MAX_FRAME_SHARE`, `strokes.ts:refineStroke`).
- `fog` speed: whole k ≥ 3 of 2.25 × `fillScale` / `durationSeconds` (`docs/overlays.md`, `fillSpeed`).

## 12. Lightning

`lightning` follows `HauntedInteriorLoop`'s strikes (`backgrounds/halloween/lightning.ts:getWindowFlash`, via `registry.ts:buildFlashScene`), whatever the kit's background: it syncs only with that background at the same seed and duration. Refused when the cycle holds no strike (`refineLightning`). Peaks: `render.tsx:FLASH_PANEL_PEAK` 0.16, `FLASH_BAND_PEAK` 0.35, `FLASH_EDGE_PEAK` 0.6.

## 13. Kit pack rules (`tests/pack.test.ts`)

- Exactly one background item (no `sizes`), of kind background, with an existing preset.
- With ornaments: `chat-<theme>` on every chat size (in table order), `block-<theme>` on every block size but `twitch-panel`, `border-<theme>` on every border size but the two screens.
- `plain` twins of every size (screens included, `twitch-panel` excluded), props exactly `{"ornaments": "none"}`.
- Formats `["webm", "png"]`, or `["png"]` for compositions in `STATIC_ONLY`; `version` an integer ≥ 1.
- Plan length = 2·backgrounds + 2·(24 + 26) − dropped WebMs + 7 masks.
- Check without rendering: `npm run render:pack -- <theme> --dry-run`, `npm run ornaments:report -- <theme>`.

## 14. Tests while building a set

- `npm run test:kit -- <set>` runs its harness files, narrowed with `--kind`, `--radii`, `--sizes`, `--sparse` (`scripts/test-kit-plan.ts:TEST_KIT_HELP`); env `ORNAMENT_HARNESS_RADII`, `ORNAMENT_HARNESS_SIZES`, `ORNAMENT_HARNESS_DENSE` (`ornament-harness.ts:harnessScope`). A narrowed run never replaces `npm test`.
- Neutral base: `ornament-harness.ts:NEUTRAL` = `{ornamentSize: 48, lightning: 0.7, durationSeconds: 12, seed: 7}`, also at `SIZE_EXTREMES` (12, 256); border radii 0, 16, 200; two small round screen frames, the only cases allowed to refuse.
- Engine rules: `tests/ornaments.test.ts`; scaling: `tests/ornaments-scale.test.ts`; markup baseline: `tests/markup-snapshot.test.ts` (not in `test:quick`).
- A new test counts once a mutation made it fail (`npm run mutate`, `AGENTS.md`).
