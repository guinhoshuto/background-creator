# Background Creator

Local Remotion, React and TypeScript project for looping animated backgrounds (1920×1080) and stream overlays (chat, text blocks, borders) with transparency, sold in packs.

- `src/settings.ts`: shared parameters, duration/FPS, alpha rule and export presets.
- `src/kinds.ts`: asset kinds (Studio folder, size, default alpha); `src/sizes.ts`: named sizes.
- `src/`: catalog and compositions; `src/overlays/`: ChatLoop, BlockLoop, BorderLoop and the shared engine in `shared/` (themed ornaments in `shared/ornaments/`, one set per name in `sets/` (`<name>.tsx` plus helpers `<name>-*.ts(x)`)).
- `scripts/`: export, validation and the pack builder (`scripts/pack.ts`); `packs/`: manifests per theme.
- `presets/`: ready-made JSON parameters; `tests/`: determinism, periodicity and configuration tests.
- Install: `npm ci`. Preview: `npm run studio`.
- Checks: `npm run typecheck`, `npm run lint`, `npm test` and `npm run validate:exports` (full FFmpeg/FFprobe).
- Export: `npm run render:webm -- ParticleLoop --props presets/particles-alpha.json` (or `render:mp4` / `render:gif` / `render:mov` / `render:png`); overlays take `--size <id>` or `--width/--height/--bleed`.
- Packs: `npm run render:pack -- <theme> --dry-run` (without `--dry-run` it renders; `--only`, `--overwrite`). Items accept `variant` (file suffix) and their own `bleed` above the named size; the Halloween kits ship with and without ornaments.

Keep every Remotion package at the same exact version and update the lockfile together with the dependencies. Animations depend only on the frame and the parameters; use a seed for randomness, never the clock, `Math.random()`, CSS animations or CSS transitions. The state at `N` must match frame `0`, but export only `0…N−1`. Also preserve speed across the loop seam.

Preview and official render share the schema, duration and alpha rule. MP4/GIF composite over `backgroundColor`; WebM, MOV (ProRes 4444) and PNG keep transparency. Width, height and bleed are always even. Never lower resolution, FPS or quality automatically; refuse invalid combinations with a message that points to the way out.

Language: everything in the repo is in English: code, docs, file names, commit messages, CLI messages and names (presets, packs, backgrounds). Talk to the owner in Portuguese. Existing Portuguese names and messages migrate in a separate, planned renaming round, because pack names reach buyers; do not rename them ad hoc.

Overlays: decorative measurements are fixed px (they do not scale with the box; exceptions: the gradient period and the glass reflection width follow the area, with the same speed at every size); everything that leaves the box fits in the bleed; the border window is always transparent (except the mask `mascara: true`, which is the opaque window itself for OBS); movement along the outline runs in whole turns, with its period in px. Ornaments (`ornaments`): each motif has a fixed px size (`ornamentSize`), limited by the free space of its slot (bleed, padding pockets, band), just as `radius` is limited to half the side; the limit depends on neither the frame nor the seed. `ornamentScale` enlarges all ornaments together (sizes, caps, strokes), measuring free space at the same scale; at 1 nothing changes. A secondary motif that does not fit its minimum is left out; if even the main one does not fit, the combination is refused with the way out. Ornaments never cover the text area or the window, and whatever leaves the box fits in the bleed.

## Agents on this machine (render and verification)

- One render at a time on the machine, counting other sessions and other repos (`pgrep -fl` first). `render:pack` and `validate:exports` never run alongside another render.
- `df -h /` before rendering; do not start with less than 3 GB free. The regenerable space is `node_modules/.cache/webpack` (up to ~5 GB; once deleted, it comes back on the next render).
- Visual verification is `npm run stills -- <job.json>` (one bundle, one browser, many frames; format in `scripts/stills-job.ts`): stills, contact sheets, stream mockups, loop-seam checks (`seams`), determinism (`sequences`) and before/after against a git ref (`baseline: {ref: "HEAD"}`), plus `report.json`. It waits for other renders, holds a lock and refuses to leave less than 3 GB free. A whole pack: `npm run qa:kit -- <pack>`. Do not write another stills script, and never one `render:png --frame` per frame. Output defaults to `out/review/<date>-<job>/`, which the owner opens.
- Full FFmpeg and FFprobe live in `/opt/homebrew/bin`. Do not use the ffmpeg from `@remotion/compositor-*` (no `rawvideo`) nor the wrapper in `.cache/webgl-tools/bin` (obsolete).
- `validate:exports` samples 0.4 s with `defaultProps` per kind: run `--kind`/`--only` on what changed. It does not validate packs.
- A custom script that renders WebGL passes `gl: 'angle'`, like `src/catalog.tsx:80`.
- Schema: `.describe()` before `.default()`, otherwise the description disappears in the Studio. Colors (`zColor()`) take no `.describe()`: their description holds the color picker marker.
- Workflows with agents: follow `~/obsidian/AI/Harness/Workflows.md`.
- A background disk alarm is stopped when the work ends.
- Verification renders (reviewer, skeptic, test) go to `out/.scratch/<session>/` and are deleted at the end; `out/` keeps only `packs/` and what the owner asked to keep.
