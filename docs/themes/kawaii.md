# Kawaii: pastel constellation

Select `KawaiiLoop` in the Studio. The preset `presets/kawaii-constellation.json` creates a **12-second, 1920×1080, 60 fps** loop in MP4/WebM. The composition's own initial values are `seed: 7`, `backgroundColor: #FFF7F4` and the strawberry, vanilla and matcha palette. There are no characters, text, external images, extra fonts or audio.

The vocabulary is cloud, heart and star, in three cloud silhouettes, two hearts (filled and outlined) and three stars (filled, four-pointed twinkle and outlined). The pieces never appear alone: they come in **groups**, and each group is a chord of a cloud plus accents on a golden ladder of sizes, 1 : 0.618 : 0.382 : 0.236. There are three different chords, so a group is never a copy of its neighbor.

What sets it apart from a field of scattered pieces is that **the arrangement is written by hand**: a table sets the heading, the depth and the tilt of each group, and the seed moves no piece from its place. Changing the seed changes the dance, never the arrangement. Four rules hold the composition:

- **The gap comes before the note.** Each group's weight is derived from the angular gap before it: a big silence announces a big note. Negative space becomes hierarchy instead of leftover.
- **Three distances.** Each group belongs to a plane with its own band of scale, opacity, glow and parallax. The back is larger, paler and nearly still; the front is smaller, sharp and drifts much more.
- **Lever balance.** The table is ordered in opposite pairs and the center of mass is checked by number: from four groups on, the frame closes within 8% of the half-screen. With two or three groups a deliberate tilt remains, which is a diagonal and not an imbalance.
- **The wave crosses the frame.** The motion's phase offset comes from where the piece is, not from a draw, so the breathing travels through the composition instead of each piece blinking on its own.

`colors[0]`, `colors[1]` and `colors[2]` are strawberry, vanilla and matcha. Each group sings a two-voice chord and the chord turns one step per group, so the motif comes back without repeating and the rule holds for any palette of 2 to 6 colors.

`centerClearance` is the most useful control for layout: it sets a **reserved central rectangle**, from 860×500 pixels at `0` to 1280×690 at `1`, which no piece enters in any phase of the cycle. The computation happens before any time term, and the budget already includes each piece's orbit, breathing and drawn silhouette, measured per axis — a 1.42 by 0.78 cloud is not a circle. For the same reason no piece is cut by the frame's edge. The zone is rectangular on purpose, because content is rectangular: an elliptical void would leave the corners of a text block uncovered. Asking for a larger center shrinks the composition instead of pushing pieces off screen, so the promise holds at every value.

`familyCount` picks how many groups come in, always in the table's order, and raising the count does not rearrange the groups already there. `familyScale` changes the overall size. `drift` is the float amplitude: at `0` the pieces stay in place, but the breathing, the spin and the glow go on, so the scene never freezes. `sparkleTrail` adds zero to four twinkles following each group's axis, at a golden-ratio cadence.

With `transparent: true` and `outputFormat: "webm"`, the sky and the halo disappear, keeping clouds, hearts and stars with alpha. The bodies are filled with solid color and the glow is painted on top, and the twinkle carries a white core, so the scene stays legible over both bright and dark video. In MP4/GIF, every element is composited over `backgroundColor`, which can take a dark tone for a night version of the same scene.
