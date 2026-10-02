# Halloween: autumn night

Select `HalloweenLoop` in the Studio. The preset `presets/halloween-midnight.json` creates a **12-second, 1920×1080, 60 fps** loop in MP4/WebM, with the main elements gathered at the edges. There is no text, external images, extra fonts or audio.

The moon has a halo and subtle craters; the bats trace closed paths with wing beats; fog, branches and floating lights move slowly. The pumpkins stay anchored to the ground and vary their inner light gently. The seed controls stars, bats and lights; changing the count of one layer does not rearrange the others.

`colors[0]` controls fog and atmosphere, `colors[1]` the moonlight and the lights, and `colors[2]` the pumpkins. With only two colors, the pumpkins take the first. `batCount: 0` and `emberCount: 0` hide those layers; `fogIntensity: 0` removes the fog. `moonScale` changes the size of the moon and its halo.

With `transparent: true` and `outputFormat: "webm"`, the sky disappears, keeping moon, stars, scenery, pumpkins and fog with alpha. In MP4/GIF, every element is still composited over `backgroundColor`.

## Overlay kit

The [`halloween-midnight`](../overlays.md#themes) theme dresses chat, blocks and borders for this background, with the same 12 s and seed 31: `presets/chat-halloween-midnight.json`, `presets/block-halloween-midnight.json` and `presets/border-halloween-midnight.json`, and the pack comes out with `npm run render:pack -- halloween-midnight` (`--dry-run` to check first). The `midnight` ornaments bring the background's bats flapping their wings at the top right corner, the pumpkins with lit faces and stars and embers along the outline. The ornaments live in the bleed, so leave about 48 px free around the webcams (72 px on `webcam-16x9-lg` and 96 px on `gameplay`, where the ornaments are enlarged) and 32 px around the chat and the blocks, including up to the screen edge and between one piece and the next: bats and pumpkins sit in those margins and would be cut or covered. See also [Halloween kits](../kits-halloween.md).
