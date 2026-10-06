# Packs and delivery

## Packs

A pack is everything a [theme](overlays.md#themes) ships, sold as a zip (see [Delivery](#delivery)): the backgrounds that match it, the chat in every chat size, the blocks in every block size (the round ones included; the Twitch panel as GIF and PNG) and the borders in every border size (the round cameras included), each file as WebM (the loop) and PNG (the still version), plus the masks of the window borders. `npm run render:pack -- <theme> --dry-run` lists every planned file of a pack, so the file count is never written down here. Each pack is described by a manifest in `packs/<theme>.json`, one per theme (`ls packs/`). The Halloween kits add their own props:

| Pack | Background | Item props |
| --- | --- | --- |
| `halloween-midnight` | `HalloweenLoop` (`halloween-midnight`) | panel `{"paddingX": 48, "paddingY": 36}`; `gameplay` and `webcam-16x9-lg` enlarged |
| `halloween-haunted-mansion` | `HauntedMansionLoop` (`halloween-haunted-mansion`) | panel `{"paddingX": 32, "paddingY": 24}`; `gameplay` and `webcam-16x9-lg` enlarged |
| `halloween-haunted-interior` | `HauntedInteriorLoop` (`halloween-haunted-interior`) | `gameplay` and `webcam-16x9-lg` enlarged |
| `halloween-cobweb` | `CobwebLoop` (`halloween-cobweb`) | `gameplay` and `webcam-16x9-lg` enlarged |

Each kit ships in two versions. **With ornaments:** the background, the chat in every size, the blocks in every size with the Twitch panel apart, and the borders of every camera and of `gameplay`; the screen frames are left out, because there the ornaments could only grow by thickening the band over the screen. **Without ornaments:** every size of chat, blocks, panel and borders, the two screens included, with the preset and `"ornaments": "none"`, in the files `<pack>-<size>-plain.<ext>`. The camera masks serve both versions and follow the preset's `radius`. The kits themselves are documented in [Halloween kits](kits-halloween.md).

On large frames, ornaments in fixed px would look tiny. That is why `gameplay` ships with `{"bleed": 96, "ornamentScale": 2}` and `webcam-16x9-lg` with `{"bleed": 72, "ornamentScale": 1.5}`: the ornaments keep the same proportion as on `webcam-16x9`, and the file gains the margin they need (1632×1002 and 1104×684; the window stays 1440×810 and 960×540). Leave that margin free around the frame in the scene. On the Twitch panel of `midnight` and `haunted-mansion`, more padding makes the ornaments grow in the pockets (in `midnight`, a bat and the small pumpkin come in; in `haunted-mansion`, the bat grows).

An example manifest, smaller than the ones in `packs/` (which ask for every size):

```json
{
  "name": "neon-example",
  "items": [
    {"composition": "VaporwaveLoop", "preset": "vaporwave-classic", "formats": ["webm", "png"]},
    {"composition": "ChatLoop", "preset": "chat-neon", "sizes": ["chat-standard", "chat-tall"], "formats": ["webm", "png"]},
    {"composition": "BlockLoop", "preset": "block-neon", "sizes": ["twitch-panel"], "formats": ["gif", "png"]},
    {"composition": "BorderLoop", "preset": "border-neon", "sizes": ["webcam-round"], "formats": ["webm", "png"], "frame": 120}
  ]
}
```

`name` becomes the folder name and the start of every file name (lowercase letters and digits, in words joined by a single hyphen, no hyphen at either end). Each item exports one composition with a preset from `presets/` (without the folder and without `.json`), optional `props` on top of it, the catalog `sizes` (only for chat, blocks and borders; a background with `sizes` is refused) and the `formats`, in the written order. `frame` picks the frame of the item's PNGs and needs `png` in `formats`. `variant` (the same rule as `name`) goes into the item's file names, `<pack>-<size>-<variant>.<ext>`, so the same size can ship twice in the pack (for example, with and without ornaments); in a pack with two or more backgrounds, each background takes its look as the variant. The variant may not contain the segments `mask`, `background`, `sm` or `lg`, nor make the name pass for another size of the same kind (`fullscreen` with `vertical` would be `fullscreen-vertical`). Parameters merge in this order: preset, item `props`, size and format; only the `bleed` of the item `props` applies above the size, which still fixes the box. Everything is validated before the first render, with the message pointing at the item.

```sh
npm run render:pack -- neon --dry-run
npm run render:pack -- neon
npm run render:pack -- halloween --only borders/
npm run render:pack -- halloween --only masks/
npm run render:pack -- pastel --only chat-column --overwrite
npm run render:pack -- path/my-pack.json --dry-run
```

`--dry-run` lists every planned file with its dimensions, FPS and frames (or the frame, for PNG), the actual motion speed and whether the file already exists, without rendering anything. `--only <text>` exports only the files whose path contains the text. `--overwrite` replaces finished files. A path ending in `.json` uses that manifest instead of `packs/<name>.json`. For a pack with ornaments, `npm run ornaments:report -- <pack>` lists, also without rendering, each file's motifs with their sizes and the room at their spot, and the motifs a small size drops. The result looks like this:

```text
out/packs/neon/
├── manifest.json
├── backgrounds/
│   ├── neon-background.webm
│   └── neon-background.png
├── chat/
│   ├── neon-chat-standard.webm
│   └── neon-chat-standard.png  …
├── text-boxes/
│   └── neon-label.webm  …
├── twitch-panels/
│   ├── neon-twitch-panel.gif
│   └── neon-twitch-panel.png
├── borders/
│   ├── neon-webcam-16x9.webm
│   ├── neon-webcam-16x9.png  …
│   └── neon-fullscreen.webm
└── masks/
    └── neon-webcam-16x9-mask.png  …
```

The folders repeat the Studio's, plus `twitch-panels/` for the Twitch panel and `masks/` for the masks. Every file is named `<pack>-<piece>[-<variant>].<ext>`: the piece is `background` for the background, the size id for a catalog overlay and `<W>x<H>[-circle]` for a free size; the variant is the item's (`plain`, or the background's look in `halloween`, which has three: `halloween-background-haunted-mansion.webm`). `manifest.json` gathers, for every file, the data of the [position JSON](export.md#position-json) (`canvas`, `box`, `content`, `hole`, `header`, `bleed`, FPS, frames, format, alpha and actual speed), with English keys for tools; each file's standalone JSON is merged into it and removed from the pack folder. Every window border points to its mask in `mask`, and masks have `"role": "mask"`. Each entry also records `propsHash`, the hash of the props the file came from: a finished file whose item changed is rendered again. `manifest.json` stays in the pack folder and never goes to the buyer; each build prunes the entries the full plan no longer has.

### Masks

Window borders come with one mask per size, `masks/<pack>-<size>-mask.png`: a PNG the size of the window (640×360 in `webcam-16x9`), with the rounded window in opaque white over transparency. The border rounds the corners of a rectangular camera on its own up to a radius of about 2.4 times `thickness`; above that, the camera's corners show outside the frame, and the mask solves it. On round cameras the mask is required: `<pack>-webcam-round-sm-mask.png`, `<pack>-webcam-round-mask.png` and `<pack>-webcam-round-lg-mask.png` are white discs the size of the camera (280, 400 and 560 px), and it is the mask that turns the rectangular camera round; without it, the camera's corners show outside the ring. In OBS, right-click the camera source, open **Filters**, add **Image Mask/Blend**, choose the **Alpha Mask** type (alpha or color channel; the mask works for both) and point it to the PNG. Place the camera over the border's box (the manifest's `box`, that is, `bleed` px in from the file's corner) and keep the border above it. Since the mask depends only on the window, every theme with the same size and radius uses the same one; if a pack has the same size with different radii, each mask carries the radius in its name (`<pack>-webcam-square-mask-radius-200.png`). Screen frames need no mask. Outside a pack, the mask comes from `mask: true` in a JSON and bleed 0, for example `npm run render:png -- BorderLoop --props mask.json --size webcam-square --bleed 0`, with `{"mask": true, "radius": 24}` in `mask.json`, with the same `radius` as the border (24 is the pastel theme's; neon uses 16, glass 20, halloween and halloween-midnight 12, halloween-haunted-mansion 10, halloween-haunted-interior 8 and halloween-cobweb 38); the file is named `out/BorderLoop-webcam-square-mask.png`. On the round camera the radius does not matter: `npm run render:png -- BorderLoop --props mask.json --size webcam-round --bleed 0`, with `{"mask": true}`, produces the disc `out/BorderLoop-webcam-round-mask.png`.

### Build

The builder uses a single bundle and exports one file at a time. Finished files are skipped (`already exists, skipping.`), and `manifest.json` is rewritten after every file: if the build stops midway, run the same command again and it picks up where it stopped. The pack's in-progress renders go to `out/.scratch/packs/<name>/`, outside the pack folder; the leftovers of an interrupted build (including `.asset-render-*` folders inside the pack, from earlier versions) are deleted at the start of the next build, and `--dry-run` reports how many there are. Before starting, it checks free disk space and refuses below 3 GiB; before each file, it stops below 2 GiB, saying how much there is and how to resume (the floor is the same for every render, in `scripts/disk.ts`).

The manifests ask for `webm` and `png` on every item, except the Twitch panel, which ships as `gif` and `png` in the classic themes and as `webm` and `png` in the Halloween kits (the owner chose WebM on 2026-10-03, when the ornamented midnight GIF reached 2,972,501 B, over the 2.9 MB Twitch takes; the panel editor itself takes only JPG, PNG and GIF, so the WebM is the OBS overlay and the PNG the profile panel). MOV is optional because the files are huge (see [Formats](export.md#formats)): to deliver the editing version, add `"mov"` to the `formats` of the items that need it, preferably in a separate manifest, and check the total with `--dry-run` before rendering:

```json
{"composition": "BlockLoop", "preset": "block-neon", "sizes": ["lower-third", "title"], "formats": ["webm", "mov", "png"]}
```

## Delivery

The buyer gets one zip per pack, never the pack folder. A pack is ready when `render:pack`, `validate:pack` and `zip:pack` pass:

```sh
npm run validate:pack -- halloween-midnight      # reads every file back against the plan; writes only its report
npm run zip:pack -- halloween-midnight --check   # every check, compared with the existing zip; writes nothing
npm run zip:pack -- halloween-midnight           # writes out/deliveries/halloween-midnight-overlay-pack.zip
```

- **What `validate:pack` proves.** It runs the zip checks below, then reads every planned file back with ffprobe (packets counted, nothing decoded) and decodes its first frame: the codec of its format, the planned width and height, FPS, frame count and duration (half a frame of slack), no audio, alpha where the shared rule asks for it (the VP9 `ALPHA_MODE` tag and at least one transparent pixel) and full opacity elsewhere, a GIF that loops forever, and a Twitch panel in GIF or PNG at most 2,900,000 B (Twitch takes panels up to 2.9 MB, read as decimal megabytes; `scripts/pack-validate.ts`). Every problem is listed at once, with exit 1. It renders nothing, so it does not wait for the render slot. The report, with the bytes of every file and the totals per format, goes to `out/.scratch/validation/<pack>-pack.json`. `validate:exports` samples the compositions; only `validate:pack` reads what is sold.
- **What goes in.** Exactly the files of the whole plan, the same list as `--dry-run`, masks included; the list never comes from the folder or the manifest. `manifest.json`, `preview.html` and any other loose file stay out (loose files are listed as a warning; `.DS_Store` and `._*` pass in silence). There is no root folder: the entries are the pack's folders (`backgrounds/`, `chat/`, `text-boxes/`, `twitch-panels/`, `borders/`, `masks/`), files only, and "Extract all" makes the folder named after the zip.
- **What it refuses, writing nothing.** A missing, empty or linked planned file (`Missing N planned files in out/packs/<name>: … Run npm run render:pack -- <name> to finish the pack.`); a file whose first bytes are not its format; a manifest that is not the plan's (another name, missing or stale entries, a mask not recorded as one, a props hash missing or other than the plan's); a name outside the buyer rule (`<folder>/<pack>-<piece>[-<variant>].<ext>`, the pack's own name first, at most 100 characters, unique regardless of case; the plan already refuses such a name, so `--dry-run` and `render:pack` stop on it before any render); signs of an interrupted build (sidecars, `.asset-render-*`, `manifest.json.tmp`); a file that changes while the zip is read; a zip of 4 GiB or more (`The pack is over 4 GiB: ZIP64 is not supported; split the formats into another pack.`); and less free disk than the zip plus 1 GiB. The one change a refused run makes is clearing the partial file of an interrupted write (see Safe write); `--check` leaves even that.
- **Same files, same zip.** Entries are stored without compression (WebM, PNG and GIF are compressed already), dated 1980-01-01 00:00, mode 0644 and sorted by the bytes of their path, so the same files give the same zip, byte for byte. A new render does not give the same bytes, so the sha256 names the version that was sold: `Zip: out/deliveries/<pack>-overlay-pack.zip, N files, X MiB, sha256 …`, or `Already up to date.` when nothing changed.
- **Safe write.** The zip is written to `out/deliveries/.<pack>-overlay-pack.zip.partial`, flushed, read back (name, size, CRC and offset of every entry) and only then renamed over the old one: an interrupted write leaves the old zip as it was, and the next run without `--check` removes the partial file before its checks.
- **`--check`** exits 0 when the zip is up to date, 2 when there is none or it differs, and 1 when a check fails.
- **Size and time, before the render.** `npm run render:pack -- <pack> --dry-run` ends with the estimated MiB and minutes per variant and for the whole plan, and what is left to render, from the halloween-noite render measured on 2026-09-26 (`scripts/pack-estimate.ts`; mp4 and mov are not measured yet). The zip weighs what the files weigh, since it stores them uncompressed. `zip:pack` has no `--dry-run`.
- **Where it goes.** A kit is about 1 GB and an Etsy listing takes 5 files of 20 MB, so the zip goes to R2 and its link goes into the pack guide (`<pack>-guide.pdf`), the only file of the listing.

## Listing video

```bash
npm run qa:kit -- halloween-midnight --video mock-chatting   # out/review/<date>-qa-halloween-midnight/mock-chatting.mp4
npm run qa:kit -- halloween-midnight --video all --dry-run   # the scenes and the pieces still to render
```

- **What it is.** The stream mockups of `qa:kit` (`MOCK_LAYOUTS` in `scripts/stills-job.ts`: mock-chatting, mock-gameplay, mock-screen), animated: the pack's own `.webm` files composited by FFmpeg at the same box positions, each minus its own bleed, one background loop long, as an H.264 MP4 at 1920×1080. Frame 0 is the still mockup, so the listing cover (made from `mock-chatting-0.png` by the thumbnail generator) and its video start on the same image.
- **Missing pieces** are rendered first, one `render:pack -- <pack> --only <file>` each, into `out/packs/<pack>/`; a scene the pack does not plan, or a piece whose loop differs from the background's, is refused with the reason.
- **Loops over 14.5 s** (the thumbnail generator's longest listing video; Etsy takes 15 s) also get `<mock>-listing.mp4`: the first 14.5 s, with the last second faded into the loop's own last second, which runs into frame 0, so the replay does not jump (`scripts/mock-video.ts`).
- **Into the listing:** in the generator's `listings/<pack>.json`, `"video": {"image": 0, "seconds": <loop or 14.5>, "override": {"media": {"src": "<the mp4>", "poster": 0}}}`, then `npm run render -- listings/<pack>.json --video-only` there.
- It takes the render slot for the compositing, and `--frames` does not apply.
