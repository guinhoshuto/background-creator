---
name: overlay-kit
description: >
  Builds an overlay kit (chat boxes, text blocks, webcam and screen frames, with themed ornaments)
  for a background that already exists in this repo, the way the four Halloween kits were built:
  the files a kit needs, the numeric rules every kit keeps, the checks, the owner's checkpoint and
  the delivery chain up to the listing page. Use when the owner asks for a kit, an overlay pack or
  ornaments for a background ("faz o kit do fundo de Natal", "kit de overlay para o <fundo>",
  "ornaments for <background>"), or before planning or estimating one. It does not make the
  background itself, does not upload to Etsy, and does not merge or push without the owner's yes.
---

# Overlay kit for a background

A kit is one background plus matching overlays: `ChatLoop`, `BlockLoop` and `BorderLoop` with a theme preset each and an ornament set drawn from the background's own art, shipped as one pack. The Halloween round spent 2.6M tokens mapping the engine before the first line of code; this skill and `references/engine.md` are that map. What still costs a round per kit is looking at the background's art, which no recipe replaces.

## Before anything

1. Read, in this order: `references/engine.md` (the engine, the invariants and where each thing lives), `docs/kits-halloween.md` (the worked example: deliverables, presets table, phase decisions), the background's own page in `docs/themes/`, and `docs/overlays.md` (Ornaments, Themes). The code wins over every doc: check an id, a symbol or a preset value in `src/`, `presets/` and `packs/` before copying it (README, Known pitfalls).
2. Visual reference first: `~/obsidian/Visual Ref/<theme>/`, built if missing, and the background's stills (`npm run stills`). Pick the motifs from the background's artwork; product art is code only.
3. Show the plan with an estimate (hours, agents, tokens) before starting, by the rulers in `~/obsidian/AI/Harness/Workflows.md` ("Estimativa"). A workflow follows that file, and the owner's yes to run it.
4. Work on a `wip/<theme>-kit` branch, in a worktree when the checkout holds someone else's work.

## Naming

One string is the theme, the pack, the preset suffix and the `KIT_THEMES` entry: `<theme>` (e.g. `halloween-midnight`). The ornament set has its own short id (`midnight`). Ids reach buyers through file names, so they are English and final before the first render.

## Files of a kit

| What | Where |
| --- | --- |
| Ornament set | `src/overlays/shared/ornaments/sets/<set>.tsx`, helpers `<set>-*.ts(x)`; header comment with ratios, caps and slots |
| Registration | the id in `ORNAMENT_CHOICES` (`src/overlays/shared/ornaments/types.ts`), the motifs in the `ornaments` description (`fields.ts:ornamentFields`), the set in `ORNAMENT_REGISTRY` (`registry.ts`) and its name in the harness `REFUSAL` regex (`tests/helpers/ornament-harness.ts`); no set id starts with another one plus `-` |
| Presets | `presets/chat-<theme>.json`, `presets/block-<theme>.json`, `presets/border-<theme>.json` |
| Pack | `packs/<theme>.json`, with `"version": 1` |
| Theme list | `KIT_THEMES` in `tests/helpers/themes.ts` (and `STATIC_ONLY` if a composition ships as PNG only) |
| Tests | `tests/ornaments-<set>.test.ts` and `tests/ornaments-harness-<set>.test.ts` (`registerOrnamentHarness`) |
| Docs | the kit's rows in `docs/overlays.md`, the background's page in `docs/themes/` (buyer margin, OBS notes) |
| Listing | `listings/<theme>.md` (`docs/packs.md`, Listing page) |

`references/engine.md` has the exact contract of each one. The tests derive a kit theme as `halloween-<set>` (`registerOrnamentHarness`, `tests/ornaments-scale.test.ts:inputOf`, the `halloween-backgrounds` test in `tests/pack.test.ts`): a kit that is not Halloween generalizes those three first, as its own commit, and never renames the shipped ids (engine.md, §2).

## Rules every kit keeps

- The overlay presets take the background's `durationSeconds` and `seed`, so they loop in step (`tests/pack.test.ts` pins them).
- A preset holds no `width`, `height`, `bleed`, `fit` or `guides`, and parses strictly at every size of its kind, alone and merged with each pack item's props.
- Every kind × size has a travelling stroke or a moving fill within ±35 % of the preset's speed (`tests/speed-consistency.test.ts`); `DOCUMENTED_MINIMUMS` stays empty.
- Decorative measures are fixed px; ornaments live in the bleed, never over the text area or the window; a motif that does not fit is left out, a hero that fits nowhere refuses the combination with the way out.
- `place()` is pure and returns fresh arrays; `build()` is cheap per frame (the harness runs every frame and half frame).
- The set must also place its hero on sizes the kit does not sell: the harness runs the Twitch panel and both screen frames.
- `lightning` flashes in step only with `HauntedInteriorLoop`, whatever the kit's background.
- Only the numbers in `references/engine.md` (stroke speed floors, caps, bleed per size) are trusted; a new number is measured, then written there.

## Checks

While working, after each step:

```bash
npm run typecheck && npm run lint
npm run test:quick
npm run test:kit -- <set> --sparse          # seconds; narrow with --kind, --radii, --sizes
npx tsx --test tests/ornaments-<set>.test.ts tests/pack.test.ts tests/speed-consistency.test.ts
```

Before showing the owner:

```bash
npm run test:kit -- <set>                    # the whole harness of the set
npm run render:pack -- <theme> --dry-run     # every file, estimated MiB and minutes
npm run qa:kit -- <theme>                    # stills, contact sheets, light sheet, stream mockups
```

Review the sheets on enlarged crops, not by coordinates (AGENTS.md, Visual review). Before a merge: the full `npm test` and `npx tsx --test tests/markup-snapshot.test.ts` (a new pack changes the baseline: `UPDATE_SNAPSHOTS=1` in the same commit).

## Owner's checkpoint

After the first green `qa:kit`, stop: open the review folder, send the notification and show the mockups and the contact sheets with their captions. No full render, no second round of automated critique and no next phase until the owner answers; without an answer, at most one round. The ship is the owner's.

## Delivery, once approved

```bash
npm run ship:pack -- <theme>                 # render:pack, validate:pack, zip:pack, R2 upload, link in state; resumes
npm run qa:kit -- <theme> --video mock-chatting
```

Then, outside this repo: the buyer's guide (`/guia`, from the zip link) and the listing images and video (`/thumb`). Last, write `listings/<theme>.md` and build the page the owner fills Etsy from:

```bash
npm run listing:page -- <theme> --check
npm run listing:page -- <theme>              # out/listings/<theme>/index.html
```

The product note in the vault records the version, the zip bytes and the link; this repo records the code, the listing text and the docs.
