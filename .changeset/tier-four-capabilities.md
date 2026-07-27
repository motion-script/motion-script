---
"@motion-script/core": minor
"@motion-script/web": minor
"motion-script": minor
---

Add the four engine capabilities that were blocking the rest of Tier 4, and the effects and presets riding them.

**Effect asset inputs.** `EffectData.prepare` lets an effect declare the assets it needs, dispatched by `prepareEffect` and driven from the precomp pass exactly as `FillData.prepare` is for fills; `EffectResources.getImage` hands the renderer the loaded image. The new **`texture`** effect overlays any image from the project's `public/` folder with a blend, scale and rotation — the missing ingredient for every material look. Textures are yours to supply; nothing is bundled.

**CMYK halftone.** `halftone`'s `colored: boolean` becomes `separation: 'mono' | 'rgb' | 'cmyk'`. The new `'cmyk'` mode separates properly, so the shared darkness lands on a K plate and a neutral tone prints one black dot instead of three overlapping colour dots. Measured on a neutral region, chroma noise drops from 176 to 61. This is what `comic` needed, and `comic` is now a preset.

**Directional light.** **`streak`** is an anamorphic glare — `bloom` with an anisotropic blur, so it stays on the cheap ImageFilter path. **`godRays`** marches samples toward a light source, accumulating only what clears a threshold and screening it back on, so an occluder stays sharp while light streams past it. Each pixel's march is jittered, without which the rays band into visible concentric arcs at any affordable tap count.

**`oilPaint`.** Kuwahara — four quadrant windows per pixel, take the mean of whichever is flattest. Flat areas smooth into strokes while edges stay crisp. Radius is capped at 6; this is comfortably the most expensive effect in the set.

**Five new presets**: `comic`, `anamorphicGlare`, `godRays`, `oilPainting`, and `paper` — the last being the one that needs an asset, and the template for the whole material family, since `canvas`, `linen`, `denim` and `felt` are the same recipe with a different image.

`separation` replacing `colored` is a breaking change to `halftone`, but nothing in this series has been released yet.
