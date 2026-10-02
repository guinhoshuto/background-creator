# Dots: moving pattern

Select `DotGridLoop` in the Studio. The initial values create an **8-second, 1920×1080, 60 fps** loop: 10 px lilac dots, every 48 px, over night blue (`#10162B`), scrolling diagonally down and to the right. The scene is drawn in SVG, with no external images, text or audio, and the pattern covers the whole frame in every frame, with no gaps at the edges.

- `direction` (default `down-right`): `right`, `left`, `up` and `down` move the pattern horizontally or vertically; `up-right`, `up-left`, `down-right` and `down-left`, diagonally, always at 45°.
- `layout` (default `aligned`): `aligned` lines the dots up in a grid, with straight columns and rows; `alternating` shifts every other row by half the spacing. Both arrangements have the same number of dots per area.
- `dotColor` (default `#7C8CFF`): dot color. It takes any Studio color, including with transparency, like `rgba(255, 255, 255, 0.35)`.
- `dotSize` (1–96, default `10`): dot diameter, in pixels. With `dotSize` larger than `spacing`, neighboring dots merge.
- `spacing` (16–240, default `48`): distance in pixels between the centers of neighboring dots in a row and between one row and the next.
- `speed` (0–480, default `24`): speed in pixels per second, in the chosen direction; `0` holds the pattern still. Any value above zero travels at least one step per cycle, as explained below.

For the loop to close, each dot must end the cycle exactly in another dot's place. That is why the distance traveled in the cycle is rounded to the whole number of steps closest to the request, with at least one step when `speed` is above zero. The step is the smallest shift, in the chosen direction, that gives back the same pattern:

| Direction | `aligned` | `alternating` |
| --- | --- | --- |
| Horizontal | `spacing` | `spacing` |
| Vertical | `spacing` | `2 × spacing` (the shifted row only repeats two rows later) |
| Diagonal | `spacing × √2` | `2 × spacing × √2` |

With the initial values, 24 px/s over 8 s asks for 192 px. The diagonal travels in steps of 67.9 px, so the cycle covers three steps, at 25.5 px/s. Horizontally, the same values give exactly 24 px/s: four spacings per cycle. The difference is at most half a step per cycle: it shrinks in longer cycles and weighs less at higher speeds. When raising `durationSeconds`, the speed holds. The motion is constant from the first to the last frame, including at the seam. GIF (50 fps) and MP4/WebM (60 fps) cover the same distance per cycle.

With large spacings, especially on the diagonal and in alternating rows, the step is long and the speed changes in jumps. With `alternating` on the diagonal, `spacing: 240` and 8 s, the step is 678.8 px and the possible speeds are multiples of 84.9 px/s: a `speed` of 24 already moves at 84.9 px/s. For finer control, lengthen the cycle or reduce the spacing.

The pattern also cannot move too fast for its spacing. If, from one frame to the next, the dots travel half the way to their neighbor, the eye links each dot to the wrong neighbor and the pattern seems to go backwards or flicker, like the wagon wheel in films. That is why the schema refuses combinations where one frame moves more than 40% of that way, with a message that gives the maximum speed; the speed is never lowered on its own. This only happens with small spacings and high speeds, or in cycles of few frames. Horizontally, with `spacing: 16`, the limit is near 384 px/s in MP4/WebM and 320 px/s in GIF, which has fewer frames per second.

The seed only shifts the grid inside the frame; spacing, size and speed do not change.

With `transparent: true` and `outputFormat: "webm"`, the background becomes transparent and only the dots remain, with soft edges. In MP4/GIF, the dots are composited over `backgroundColor`. To export the presets with the official profiles in [Formats](../export.md#formats):

```sh
npm run render:mp4 -- DotGridLoop --props presets/dots-classic.json
npm run render:mp4 -- DotGridLoop --props presets/dots-alternating.json
npm run render:webm -- DotGridLoop --props presets/dots-alpha.json
```

Switch `render:mp4` to `render:webm` or `render:gif` for the other formats.
