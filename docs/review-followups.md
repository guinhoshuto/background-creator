# Review follow-ups

Findings of a review that did not block its change, kept here until someone takes them on. Remove an item once it is done.

- `validate:exports` samples every catalog composition per kind, so a full run or `--kind vertical` also renders the two QA-only mocks (`LiveUiMock`, `FeedUiMock`); skip `qaOnly` entries there, as `planPack` already refuses them (vertical kind, phase 1, 2026-10-29).
- The one-off render names every layout of `LiveFrameLoop` the same, `LiveFrameLoop-live-frame.<ext>`, so a second layout overwrites the first; a pack names them by `variant`, but `render:*` should add the layout (and the chat mode when it is not `open`) to the file name, decided with the vertical pack (phase 4).
