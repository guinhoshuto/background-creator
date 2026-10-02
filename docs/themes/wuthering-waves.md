# Wuthering Waves: Azure Lotus

`WutheringWavesLoop` is an **SVG/WebGL** streaming background inspired by **Wuthering Waves**: a blue-and-gold waterside illustration with layered lotus, a curved boat, distant eaves and pine, procedural paper/ink texture, and precise thin gold details informed by the game's UI. The scene uses no image assets. Its palette combines azure `#1B3E6D`, cream `#ECDCB6`, turquoise `#48B9C6` and gold `#DBBE8D`. The preset defines a **16-second loop at 1920×1080 and 60 fps**, without audio.

UI references are real launch-era captures from [GamesRadar (Terminal and Convene)](https://www.gamesradar.com/games/rpg/the-wuthering-waves-wish-convene-gacha-system/), [Gamerpillar (Resonator/Echo)](https://gamerpillar.com/how-to-tune-the-echo-in-the-echoes-interface-in-wuthering-waves/) and [Dot Esports (Map)](https://dotesports.com/wuthering-waves/news/how-to-get-the-lootmapper-in-wuthering-waves), published in May–June 2024. They inform the fine ivory/gold lines, blue-gray depth and asymmetric spacing; the waterside illustration is an original interpretation.

Status (2026-10-01): visual preview awaiting review; not yet approved for release.

## Visual review

Inspect the full composition and enlarged junctions, including at motion extremes. Trace every structural element to its support: bridge landings must meet visible terrain, posts must meet both deck and rail, building steps need continuous risers, and plant stems must enter their leaves or flowers. Check occlusion and depth so a valid geometric overlap also reads as a connection. Isolated strokes must read as intentional ornament or texture, never detached construction parts. Unit tests alone do not complete this review.

## Controls and render

In Studio, `atmosphere` controls mist, `resonance` adjusts the light effects, `particleCount` sets the number of particles, `motion` adjusts movement and `centerShade` darkens the central content area. The composition defaults to seed `1403` and WebM output; the preset selects MP4 for an OBS media source with **Loop** enabled. Official render commands select the ANGLE backend automatically. For a render launched from Studio, choose **angle** under **OpenGL renderer**.

```sh
npm run render:mp4 -- WutheringWavesLoop --props presets/wuthering-waves-azure-lotus.json
npm run render:webm -- WutheringWavesLoop --props presets/wuthering-waves-azure-lotus.json
npm run render:png -- WutheringWavesLoop --props presets/wuthering-waves-azure-lotus.json --frame 0
```
