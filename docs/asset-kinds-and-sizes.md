# Asset kinds and sizes

## Asset kinds

Every composition belongs to a kind, defined in `src/kinds.ts`. The kind sets the Studio folder, whether the size is fixed or free and the initial value of `transparent`. The initial format is `webm` for all of them.

| Kind | Studio folder | Compositions | Size | Default `transparent` |
| --- | --- | --- | --- | --- |
| `background` (backgrounds) | `backgrounds` | the ones in the first table of [Compositions](parameters-and-presets.md#compositions) | Fixed, 1920×1080 | `false` |
| `chat` (chat backgrounds) | `chat` | `ChatLoop` | Free; starts at `chat-standard` | `true` |
| `block` (text boxes) | `text-boxes` | `BlockLoop` | Free; starts at `card` | `true` |
| `border` (borders and frames) | `borders` | `BorderLoop` | Free; starts at `webcam-16x9` | `true` |

Backgrounds have no size controls. In the other three kinds, size follows a single model:

- **Box** (`width` × `height`): in the chat and the block, the visible panel; in the border, the transparent window the camera or the game shows through.
- **Bleed** (`bleed`): an equal transparent margin on the four sides of the box, which holds the stroke glow, the halo and, in the border, the frame itself. The final file measures **box + 2·bleed** in each direction, with the box in the center: `chat-standard` has a 400×600 box and a bleed of 32, so the file is 464×664 and the box starts at (32, 32). Nothing is drawn past the bleed: if the glow does not fit, the schema refuses and gives the smallest bleed that works (`The glow goes past the margin: use bleed ≥ N or reduce the glow.`). With bleed 0, nothing leaves the box. The file may be up to 3840 px on a side and up to the area of 3840×2160.
- **Text area** (`content`): where the block's text or the chat messages go. It is the box minus the stroke, the padding, the block's accent bar and the chat header, also kept clear of the curve of rounded corners, in whole pixels. In the round block, it is the square centered in the circle whose corners sit (accent thickness + the larger of `paddingX` and `paddingY`) px inside the stroke, with an even side so it stays centered on whole pixels: 72×72 in `circle-sm`, 186×186 in `circle` and 298×298 in `circle-lg`, with the default look. The chat with a header also reports `header`, the title area. Nothing decorative is strong over these areas: the stroke glow may reach at most 20% opacity over them, and the schema refuses anything above that, saying what to change.
- **Border window** (`hole`): the region that stays at alpha 0 in every frame, whatever the parameters; the glow is cut out of it. It is a whole-pixel rectangle inscribed in the rounded window; in `window`, the whole box is the camera area (`content`).
- **Border fit** (`fit`): in `window` (the default), the box is the window and the frame and glow go outside, into the bleed. The corners of the box that fall outside the window's curve are covered by the frame, to round off a rectangular camera placed exactly on the box; this works up to a radius of about 2.4 times `thickness`, and above that (a round webcam, like `webcam-round`) it is the [mask](packs.md#masks) that rounds the camera, and the band is as translucent as the fill asks all the way around. In `screen`, the box is the whole file (bleed 0, as in `fullscreen`), the frame is drawn from the file's edge inwards and the glow goes inwards only; the window is what is left in the middle.
- **Fixed px measures**: radius, thickness, padding, strokes, comets and glow do not grow with the box, as in CSS. That is why the 320×64 label and the 1200×240 title of the same theme have the same stroke and the same glow. The radius is limited to half the shorter side: a large radius becomes a pill; in a square box, it becomes the same circle as `shape: "circle"` (in the block, text in the inscribed square and the accent as an arc), but the file keeps the name of the requested size. For the round product, use `shape` or the round sizes.
- **Shape** (`shape`, block and border): `rectangle` (the default), with `radius` corners, or `circle`. The circle needs a square box (otherwise the schema refuses: `A circle needs equal width and height (the box is 640×360): use --size circle-sm, circle or circle-lg, make width and height equal or use shape rectangle.`) and ignores `radius`: the radius is half the side. Stroke, glow, halo, fill, comets and ants follow the circle, whose perimeter is 2πr. The screen frame (`fit: "screen"`) cannot be round, because it follows the screen.
- **Always even dimensions**: `width`, `height` and `bleed` are even integers, in every format. H.264 needs even sides and Remotion crops 1 px off an odd dimension without warning; the schema refuses (`width must be even: H.264 silently crops 1 px off odd dimensions.`) instead of delivering a file smaller than requested. With an even box and bleed, the straight edges of the box fall on even coordinates, which WebM, with color stored in 2×2 px blocks, reproduces without a colored fringe.

`guides: true` draws the box, the text area and the window in the Studio, to check the fit; export refuses this mode with `Turn guides off to export.`

## Sizes

The catalog sizes, in `src/sizes.ts`, are the product line: each id becomes the file name. `npm run render:webm -- --list` shows the same list. A size sets the box and the bleed and, when the product needs it, other parameters: webcam and game borders fix `fit: "window"`, screen frames fix `fit: "screen"`, every block and border size fixes the shape (`shape: "circle"` on the round ones, `shape: "rectangle"` on the others) and the Twitch panel sets `glow` and `halo` to zero, because it has no bleed. These values win over the preset and `--props`: `--size webcam-16x9` gives a rectangle even over a JSON with `shape: "circle"`.

Chat backgrounds (the box is the panel):

| Id | Box | Bleed | Final file | Use |
| --- | --- | --- | --- | --- |
| `chat-compact` | 360×480 | 32 | 424×544 | Screen corner, layouts with a large camera |
| `chat-standard` | 400×600 | 32 | 464×664 | Common chat box (OBS, StreamElements, Streamlabs) |
| `chat-tall` | 400×800 | 32 | 464×864 | Tall side column next to the game |
| `chat-column` | 448×1016 | 32 | 512×1080 | Full-height column; the file is exactly the screen's height |
| `chat-vertical` | 960×640 | 32 | 1024×704 | Vertical streams (1080×1920 screen), bottom half |

Text boxes (the box is the panel):

| Id | Box | Bleed | Final file | Use |
| --- | --- | --- | --- | --- |
| `label-sm` | 320×64 | 24 | 368×112 | Short tag: "LIVE", @user |
| `label` | 480×96 | 24 | 528×144 | Labels: latest follower, goal, socials |
| `lower-third` | 1200×160 | 32 | 1264×224 | Lower third: name and title |
| `title` | 1200×240 | 32 | 1264×304 | Screen titles (Starting, Be right back, Ending) |
| `card` | 640×360 | 32 | 704×424 | 16:9 card: schedule, rules, sponsor |
| `square` | 480×480 | 32 | 544×544 | QR code, avatar, highlight |
| `list` | 480×720 | 32 | 544×784 | Vertical list: weekly schedule, top supporters |
| `circle-sm` | 160×160 | 24 | 208×208 | Small round badge: icon, social network, "LIVE" |
| `circle` | 320×320 | 32 | 384×384 | Round: avatar, logo, counter |
| `circle-lg` | 480×480 | 32 | 544×544 | Large round: highlight, giveaway, goal |
| `twitch-panel` | 320×160 | 0 | 320×160 | Twitch profile panels (PNG/GIF, no outer glow) |

Borders and frames (the box is the transparent window):

| Id | Box | Bleed | Final file | Use |
| --- | --- | --- | --- | --- |
| `webcam-16x9` | 640×360 | 48 | 736×456 | Standard camera |
| `webcam-16x9-lg` | 960×540 | 48 | 1056×636 | Large camera (Just Chatting) |
| `webcam-4x3` | 480×360 | 48 | 576×456 | 4:3 cameras |
| `webcam-square` | 400×400 | 48 | 496×496 | Square camera (for a round camera, use `webcam-round`) |
| `webcam-round-sm` | 280×280 | 48 | 376×376 | Small round camera in the corner |
| `webcam-round` | 400×400 | 48 | 496×496 | Standard round camera |
| `webcam-round-lg` | 560×560 | 48 | 656×656 | Large round camera for Just Chatting |
| `webcam-vertical` | 360×640 | 48 | 456×736 | 9:16 camera in vertical streams |
| `gameplay` | 1440×810 | 48 | 1536×906 | Game capture in layouts with a side column |
| `fullscreen` | 1920×1080 | 0 | 1920×1080 | Whole-screen frame (`fit: "screen"`) |
| `fullscreen-vertical` | 1080×1920 | 0 | 1080×1920 | Vertical whole-screen frame (`fit: "screen"`) |

The round sizes (`circle*` and `webcam-round*`) draw a circle inscribed in the box; the round camera needs the [mask](packs.md#masks) in OBS to become round. `webcam-square` and `webcam-round` have the same box, but they are different products, with different file names. Outside the catalog, any even box works: use `--width`, `--height` and `--bleed` (or the same fields in the JSON and in the Studio); a circle outside the catalog carries the shape in its name (`BlockLoop-300x300-circle.webm`). Theme presets do not fix a size and work in every size of their kind.
