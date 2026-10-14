# Starfall Sky: shooting stars over a sea of clouds

`StarfallSkyLoop` is a WebGL2 shader background, with no image assets: a deep blue sky that brightens into a pale haze at the horizon, faint twinkling stars, a sea of clouds seen from high above, two cumulus banks that frame the sides and leave the middle open for a title, and shooting stars that cross the sky behind the clouds. Each shooting star has a white-hot head with a short cross of light, a trail that opens behind it with speed streaks, sparks and thin crystal shards that drift off the trail as it passes, and a light that tints the clouds near it. The default is a 16-second loop at 1920×1080 and 60 fps, with three shooting stars (blue, violet and gold).

Status (2026-10-14): mock for the owner's review; not approved for release.

## Look

The sky was measured on a reference kept outside the repo, as technique and measurements only: the zenith (`backgroundColor`, `#1A1B48`) eases into the middle colour (`skyColor`, `#38549D`) by 55% of the way down to the horizon, the middle runs into the horizon colour (`horizonColor`, `#6A9CEB`) by 93%, and the last stretch rises steeply into a haze between the horizon colour and `cloudColor`. The gradient is laid in sRGB, like the measured sky; light (stars, shooting stars, glows) adds in linear light and rolls off softly above 0.8.

- **Sea of clouds:** a plane below the horizon seen in perspective, with fractal-noise patches stretched across the view, a faint shadow under each patch and fog towards the horizon. Octaves fade before a pixel spans a quarter of their period, so the far sea never shimmers. The horizon bulges 18 px lower at the frame edges.
- **Cumulus banks:** a union of discs (billows) laid along two skylines, a tall bank on the right and a lower mound on the left. Each disc is the dome of a sphere, nearer the lower it sits; the domes blend with a smooth maximum, every puff is lit on top and shaded underneath (`cloudColor` to `cloudShadeColor`), a thin rim runs inside the outline on the lit side, a soft glow spreads on the sky around the banks and their foot dissolves into the haze. Big puffs carry small ones on their upper rim.
- **Shooting stars:** they enter above the frame from the left, each on its own band of slopes (20° to 46°) and end points, and burn out over the open sky with a burst of fine rays. They pass behind the banks and the sea.

## Controls

| Control | Range | Effect |
| --- | --- | --- |
| `colors` | 2 to 6 | One colour per shooting star, in order, repeating when there are more stars than colours; a colour's alpha dims its star |
| `backgroundColor` | colour | The sky at the top of the frame |
| `skyColor`, `horizonColor` | colour | The middle of the sky and the sky just above the horizon |
| `cloudColor`, `cloudShadeColor` | colour | Lit cloud and its shade, for the banks and the sea patches |
| `seaColor` | colour | The deep blue between the patches of the sea |
| `meteorCount` | 0–6 | Shooting stars per cycle |
| `meteorSize` | 0.5–2 | Size of the head, the trail and the flare |
| `stars` | 0–1 | Brightness of the stars, which fade towards the horizon |
| `cloudBanks` | 0–1 | Size of the cumulus banks; 0 leaves only the sea |
| `seaCover` | 0–1 | How much of the sea is covered by cloud |
| `horizon` | 0.62–0.9 | Height of the horizon, as a share of the frame from the top |
| `speed` | 0–3 | Pace of the clouds and the twinkle; 0 holds them still, and the shooting stars keep flying |

## Loop

Every moving value comes from the frame and the props (`src/backgrounds/starfall-sky/scene.ts`); the shader only reads uniforms. The sea drifts and changes shape on closed circles in noise space, whose circumference is the distance its pace covers in the cycle, like the `nebula` experiment, so the pace holds for any duration. The banks sway and their billows breathe in whole turns per cycle, and the stars twinkle in whole turns. Each shooting star owns an equal slot of the cycle: it waits, flies for 2.4 s (less when the slot is shorter), fades out, then goes back to its start while invisible, all inside its slot, so the seam is always at rest. The stars repeat the same paths every cycle: on long streams, lower `meteorCount` or use 0.

With `transparent: true` and `outputFormat: "webm"` (or `mov`, `png`), the sky gradient drops out: stars, shooting stars and the glow around the banks keep a soft alpha, and the banks and the sea stay opaque. MP4 and GIF always show the sky.

## Render

Like every WebGL composition, it renders under the `angle` OpenGL backend, which the official commands select; in the Studio render dialog, choose **angle** under **OpenGL renderer**.

```sh
npm run render:mp4 -- StarfallSkyLoop --props presets/starfall-sky.json
npm run render:webm -- StarfallSkyLoop --props presets/starfall-sky.json
npm run render:png -- StarfallSkyLoop --props presets/starfall-sky.json --frame 150
```
