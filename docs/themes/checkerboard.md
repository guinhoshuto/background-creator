# Checkerboard: moving board

Select `CheckerboardLoop` in the Studio. The initial values create an **8-second, 1920×1080, 60 fps** loop: a board of 80 px cells in two tones of night blue (`#141A33` and `#222C57`), scrolling diagonally down and to the right. The scene is drawn in SVG, with no external images, text or audio, and the board covers the whole frame in every frame and at any tilt, with no gaps at the edges.

- `backgroundColor` (default `#141A33`) and `squareColor` (default `#222C57`): the board's two colors. The `squareColor` squares are drawn over `backgroundColor`, which shows in the cells between them. `squareColor` takes any Studio color, including with transparency, like `rgba(255, 255, 255, 0.14)`; `backgroundColor` must be opaque, in `#RRGGBB` format.
- `squareSize` (16–480, default `80`): side of each cell, in pixels.
- `direction` (default `down-right`): `right` and `left` move along the rows, `up` and `down` along the columns, and `up-right`, `up-left`, `down-right` and `down-left` along the board's diagonals, always at 45° to the rows. Without tilt, it is the side of the screen the name says.
- `angle` (−45–45, default `0`): tilt of the board, in degrees; positive values turn clockwise. The motion turns with it: with `angle: -15` and `direction: "left"`, the board slides along the tilted rows, to the left and slightly down.
- `speed` (0–960, default `40`): speed in pixels per second; `0` holds the board still. Any value above zero travels at least one step per cycle, as explained below.

With `angle` at `45` or `-45`, the cells become diamonds and the board's diagonals run horizontally and vertically on screen:

| On screen | `angle: 45` | `angle: -45` |
| --- | --- | --- |
| Right | `up-right` | `down-right` |
| Left | `down-left` | `up-left` |
| Up | `up-left` | `up-right` |
| Down | `down-right` | `down-left` |

For the loop to close, each square must end the cycle exactly in another square's place. That is why the distance traveled in the cycle is rounded to the whole number of steps closest to the request, with at least one step when `speed` is above zero. The step is the smallest shift, in the chosen direction, that gives back the same board:

| Direction | Step |
| --- | --- |
| Row or column | `2 × squareSize` (the next cell has the other color) |
| Diagonal | `squareSize × √2` (the next cell on the diagonal has the same color) |

With the initial values, 40 px/s over 8 s asks for 320 px. The diagonal travels in steps of 113.1 px, so the cycle covers three steps, at 42.4 px/s. Horizontally, the same values give exactly 40 px/s: two steps of 160 px per cycle. Apart from the one-step minimum, the difference is at most half a step per cycle: it shrinks in longer cycles and weighs less at higher speeds. Since `speed` is measured in px/s, raising `durationSeconds` neither speeds up nor slows down the board; it only changes the rounding. When the request does not reach half a step, the cycle travels one whole step, as in the large-cell example below. The motion is constant from the first to the last frame, including at the seam, and the tilt does not change the step. GIF (50 fps) and MP4/WebM (60 fps) cover the same distance per cycle.

With large cells, the step is long and the speed changes in jumps. With `squareSize: 480` and 8 s, the step along a row is 960 px and the possible speeds are multiples of 120 px/s: a `speed` of 40 already moves at 120 px/s. For finer control, lengthen the cycle or shrink the cells.

The board also cannot move too fast for its cell size. If, from one frame to the next, the squares travel half the way to the neighboring cell of the same color, the eye links each square to the wrong neighbor and the board seems to go backwards or flicker, like the wagon wheel in films. That is why the schema refuses combinations where one frame moves more than 40% of a step, with a message that gives the maximum speed; the speed is never lowered on its own. This only happens with small cells and high speeds, or in cycles of few frames. With `squareSize: 16`, the limit is near 770 px/s in MP4/WebM and 642 px/s in GIF, which has fewer frames per second, along rows and columns; on the diagonals, near 544 and 453 px/s.

The seed only shifts the board inside the frame; size, tilt and speed do not change.

With `transparent: true` and `outputFormat: "webm"`, the `backgroundColor` cells become transparent and only the squares remain, with soft edges. In MP4/GIF, the squares are composited over `backgroundColor`. To export the presets with the official profiles in [Formats](../export.md#formats):

```sh
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-classic.json
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-diamonds.json
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-tilted.json
npm run render:webm -- CheckerboardLoop --props presets/checkerboard-alpha.json
```

Switch `render:mp4` to `render:webm` or `render:gif` for the other formats.
