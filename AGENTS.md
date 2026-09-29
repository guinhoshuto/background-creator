# Background Creator

Local Remotion, React and TypeScript project for looping animated backgrounds (1920×1080) and stream overlays (chat, text blocks, borders) with transparency, sold in packs.

- `src/settings.ts`: shared parameters, duration/FPS, alpha rule and export presets.
- `src/kinds.ts`: asset kinds (Studio folder, size, default alpha); `src/sizes.ts`: named sizes.
- `src/`: catalog and compositions; `src/overlays/`: ChatLoop, BlockLoop, BorderLoop and the shared engine in `shared/` (themed ornaments in `shared/ornaments/`, one set per name in `sets/` (`<name>.tsx` plus helpers `<name>-*.ts(x)`)).
- `scripts/`: export, validation and the pack builder (`scripts/pack.ts`); `packs/`: manifests per theme.
- `presets/`: ready-made JSON parameters; `tests/`: determinism, periodicity and configuration tests.
- Install: `npm ci`. Preview: `npm run studio`.
- Checks: `npm run typecheck`, `npm run lint`, `npm test` and `npm run validate:exports` (full FFmpeg/FFprobe).
- Tests while working: after each step, `npm run test:quick` (kinds, settings, sizes, schema descriptions, backgrounds, WebGL and Wuthering Waves, about 5 s) plus the test file of what you are changing (`npm run test:quick -- tests/<file>.test.ts`). The full `npm test` (about 160 s of CPU, most of it the ornament harness) runs once at the end of the work, before a merge, and at the end of a phase that changed shared code (`src/overlays/shared/`, `src/settings.ts`, `src/kinds.ts`, `src/sizes.ts`, `src/catalog.tsx`); never after every step.
- Export: `npm run render:webm -- ParticleLoop --props presets/particles-alpha.json` (or `render:mp4` / `render:gif` / `render:mov` / `render:png`); overlays take `--size <id>` or `--width/--height/--bleed`.
- Packs: `npm run render:pack -- <theme> --dry-run` (lists the files and ends with the estimated MiB and minutes per variant; without `--dry-run` it renders; `--only`, `--overwrite`). Items accept `variant` (file suffix) and their own `bleed` above the named size; the Halloween kits ship with and without ornaments.
- Delivery: `npm run zip:pack -- <theme>` builds `out/deliveries/<theme>-overlay-pack.zip` from the whole plan (`--check` writes nothing). A pack is ready when render:pack and zip:pack pass; the buyer gets the zip, never the folder.

Keep every Remotion package at the same exact version and update the lockfile together with the dependencies. Animations depend only on the frame and the parameters; use a seed for randomness, never the clock, `Math.random()`, CSS animations or CSS transitions. The state at `N` must match frame `0`, but export only `0…N−1`. Also preserve speed across the loop seam.

Preview and official render share the schema, duration and alpha rule. MP4/GIF composite over `backgroundColor`; WebM, MOV (ProRes 4444) and PNG keep transparency. Width, height and bleed are always even. Never lower resolution, FPS or quality automatically; refuse invalid combinations with a message that points to the way out.

Language: everything in the repo is in English: code, docs, file names, commit messages, CLI messages and names (presets, packs, backgrounds). Talk to the owner in Portuguese. Pack, preset and size ids reach buyers through file names: rename them only in a planned round, never ad hoc.

Art: product art is code only (HTML, CSS, JS, SVG, WebGL), never an AI-generated image. An agent may suggest an AI asset when it would be much better than code, but generates one only when the owner asks for it.

Overlays: decorative measurements are fixed px (they do not scale with the box; exceptions: the gradient period and the glass reflection width follow the area, with the same speed at every size); everything that leaves the box fits in the bleed; the border window is always transparent (except the mask `mask: true`, which is the opaque window itself for OBS); movement along the outline runs in whole turns, with its period in px. Ornaments (`ornaments`): each motif has a fixed px size (`ornamentSize`), limited by the free space of its slot (bleed, padding pockets, band), just as `radius` is limited to half the side; the limit depends on neither the frame nor the seed. `ornamentScale` enlarges all ornaments together (sizes, caps, strokes), measuring free space at the same scale; at 1 nothing changes. A secondary motif that does not fit its minimum is left out; if even the main one does not fit, the combination is refused with the way out. Ornaments never cover the text area or the window, and whatever leaves the box fits in the bleed.

## Git

- Commit locally on a `wip/<topic>` branch at the end of every green phase (typecheck, lint and the tests of what changed). Merge into `main` and push only with the owner's yes.
- Workflows compare against `HEAD`, never against a snapshot in the scratchpad.
- A session that changed code ends by showing `git status --short` and the proposed commit message.

## Agents on this machine (render and verification)

- One render at a time on the machine, counting other sessions and other repos: `stills` (and `qa:kit`), `render:*`, `render:pack` and `validate:exports` wait for the machine-wide slot `~/.cache/render-slot` (`scripts/render-slot.ts`); `--dry-run`, `--check`, `--help`, `zip:pack`, `stills -- inspect` and the tests do not take it. `pgrep -fl` stays as the check for renders that do not take the slot yet (the se-dev-kit). Protocol, for another repo to adopt as is: take the slot with an atomic `mkdir`, write `owner.json` with `pid`, `repo`, `command` and `startedAt` inside, take over a slot whose pid is gone or whose `startedAt` is before the last boot (only under the mutex `<slot>.takeover`, an atomic `mkdir` identified by its inode; a stale one is first claimed with an atomic `mkdir <mutex>/clearing`, and a mutex is removed only by renaming it aside and comparing the inode, as the comment at the top of `scripts/render-slot.ts` describes, after checking again that the same dead owner holds it), and let only the owner remove it (a child of the owner inherits it through `RENDER_SLOT_HELD=<pid>`).
- `df -h /` before rendering. One disk floor for every render, in `scripts/disk.ts`: a job starts with at least 3 GiB free, leaves at least 2 GiB after its estimate, and a pack stops between files below 2 GiB. The regenerable space (`out/.scratch`, old bundles in `.cache`, `node_modules/.cache/webpack`, which a bundle drops above 1 GiB) is listed with sizes by `npm run clean` and deleted by `npm run clean -- --apply` (`--review` adds `out/review`; `out/packs` and `out/deliveries` never go).
- Visual verification is `npm run stills -- <job.json>` (one bundle, one browser, many frames; format in `scripts/stills-job.ts`): stills, contact sheets, stream mockups, loop-seam checks (`seams`), determinism (`sequences`), before/after against a git ref (`baseline: {ref: "HEAD"}`) and `regions` (per-region stats in `report.json`), plus `report.json`. It takes the render slot, waits for other renders and follows the disk floor above. A whole pack: `npm run qa:kit -- <pack>`. Do not write another stills script, and never one `render:png --frame` per frame. Output defaults to `out/review/<date>-<job>/`, which the owner opens. Pixel measurement is `npm run stills -- inspect` (region, profile, crop, diff), writing to `out/.scratch/inspect/`; do not write a measuring script.
- Every visual review, by a person or an agent, checks structure on the image, on an enlarged crop of the region, not only by coordinates: junctions, supports and floating pieces (the full checklist is the Wuthering Waves **Visual review** in the README). On 2026-09-28 a review done only by geometry missed a detached bridge.
- Missing a flag? Add it to the official script; never copy a script into `.cache` to change it.
- Retire an old tool only after the new one is committed.
- Full FFmpeg and FFprobe live in `/opt/homebrew/bin`. Do not use the ffmpeg from `@remotion/compositor-*` (no `rawvideo`) nor the wrapper in `.cache/webgl-tools/bin` (obsolete).
- `validate:exports` samples 0.4 s with `defaultProps` per kind: run `--kind`/`--only` on what changed. Its files and `report.json` go to `out/.scratch/validation/` (`--out <dir>` for another folder). It does not validate packs.
- A custom script that renders WebGL passes `gl: 'angle'`, like `src/catalog.tsx:80`.
- Schema: `.describe()` before `.default()`, otherwise the description disappears in the Studio. Colors (`zColor()`) take no `.describe()`: their description holds the color picker marker.
- Workflows with agents: follow `~/obsidian/AI/Harness/Workflows.md`.
- A background disk alarm is stopped when the work ends.
- Verification renders (reviewer, skeptic, test) go to `out/.scratch/<session>/` and are deleted at the end; `out/` keeps only `packs/`, `deliveries/` and what the owner asked to keep.
