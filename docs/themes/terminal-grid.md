# Terminal grid: sand screen

Select `TerminalGridLoop` in the Studio. It is the background of the `sand-terminal` kit, drawn from the measurements of the old sand-terminal HTML pack (v3): a **16-second, 1920×1080, 60 fps** loop of a sand-coloured terminal screen, in SVG, with no images, text or audio.

- `colors` (default `#C9C4B0`, `#B8B3A0`, `#9D9885`): the radial gradient from the centre, lit a little above the middle (50 %, 42 %), through the middle tone at 55 % to the edge. With two colours the middle is the second.
- `inkColor` (default `#45423A`): the grid lines and the dust.
- `gridSize` (8–160, default `26`) and `gridOpacity` (default `0.11`): a 1 px line every `gridSize` pixels, full in an ellipse around the centre (18 % of the way out) and gone by 78 %.
- `scanlines` (default `0.026`): a dark 1 px line every 4 px.
- `grain` (default `0.05`): a fine fractal noise in 160 px tiles, the same in every frame.
- `vignette` (0–2, default `1`): the edges darken like the original's inset shadows (340 px at .48 and 80 px at .2), drawn as four edge gradients.
- `dustCount` (0–240, default `60`): specks of 0.4–2.1 px at .1–.5, rising at 2.4–15.6 px/s and drifting sideways up to 4.8 px/s.
- `glitches` (0–6, default `3`): moments where the screen shakes for 0.3 s (four poses of up to 4 px) and, about half the time, flashes corrupted bands (dark 3 px bands every 9 px, light 4 px bars every 260 px) for 0.34 s. At most one per 2.5 s of loop.

How it loops. The static layers (gradient, grid, scanlines, grain, vignette) never move. Each dust speck lives 1 to 3 times per loop: it fades in along sin(π·u), drifts at a constant speed and fades out, and respawns at its next seeded spot while unseen; the seed places every speck's respawn away from the loop seam, so position and opacity keep their speed across it. The glitches sit inside the loop, between 8 % and 90 % of it, in one slot each, so none reaches the seam.

What changed from the original. Its grain and scanlines were `mix-blend-mode: multiply` layers; here they are plain dark alpha, since a background takes no blend mode (README, Known pitfalls). Its grain jumped 12 times per second; here it is still, which keeps the WebM small and the frames deterministic. Its dust wrapped from the top of the screen to the bottom, which no loop can close; here it lives in cycles instead.

```sh
npm run render:webm -- TerminalGridLoop --props presets/sand-terminal.json
```

The kit's panels on this background are light: the buyer's chat needs dark text.
