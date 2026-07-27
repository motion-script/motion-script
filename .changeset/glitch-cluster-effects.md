---
"@motion-script/core": minor
"@motion-script/web": minor
---

Add the glitch / digital effect cluster: `rgbShift`, `scanlines`, `blockDisplace` and `bitCrush`.

- **`rgbShift`** displaces the R/G/B planes independently. Distinct from `chromaticAberration`, which models a lens and is therefore symmetric — this is the digital artifact, where each plane goes wherever you point it.
- **`scanlines`** draws CRT line structure, with `spacing`, `thickness`, `darkness`, `angle`, and an `offset` that wraps so a linear tween rolls the pattern seamlessly.
- **`blockDisplace`** tears the content into bands and slides them. `density` keeps the image readable by moving only a fraction of bands, and the displacement is a pure function of band index and `seed`, so frames re-render identically — step `seed` in whole numbers to jump between glitch states.
- **`bitCrush`** reduces colour depth, either to `bits` per channel or by snapping to a fixed hardware palette (`gameboy`, `cga`, `nes`) using the actual historical colours.

Together with the shipped `chromaticAberration`, `grain` and `vintage`, these compose into the full VHS/CRT recipe — the template's `retro-vhs` showcase scene has been rebuilt on them.
