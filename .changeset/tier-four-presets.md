---
"@motion-script/core": minor
"motion-script": minor
---

Add five more presets, taking the layer from eight recipes to thirteen: `screenPrint`, `thermalPrint`, `pencilSketch`, `chalk` and `neon`.

All compose from effects that already shipped, so they cost no new render path. `pencilSketch` and `chalk` are the clearest case for the layer existing at all — identical ingredient lists (`edges` → `grain` → `duotone`), differing only in which way up the ramp goes.

**The existing eight recipes are reordered.** Filter-surface effects (`duotone`, `grayscale`, `bloom`, `colorAdjustment`, `vintage`, `pixelate`) currently run after every shader-surface one whatever order a chain is written in, so several recipes were written in an order they never executed in. Each now lists its shader ingredients first and its filters second, which makes the source read the way it runs. **This is a source-only change — verified pixel-identical output** for `vhs`, `crt` and `gameboy`, and a test now enforces the ordering across every preset, deriving filter-vs-shader from `effectSurface` rather than a hand-kept list.

Some doc comments were wrong in the same way and are corrected: `gameboy` does not pixelate before dithering (`pixelate` is a filter and lands last), and `vhs` does not grade before it damages.

No `comic` preset. It needs a colour dot screen, and `halftone`'s `colored` mode screens **RGB** rather than CMYK — with no K plate to carry darkness, every neutral tone prints three overlapping mid-dots and the result reads as chromatic noise rather than print. That is a fix to `halftone`, not something a recipe can tune around.
