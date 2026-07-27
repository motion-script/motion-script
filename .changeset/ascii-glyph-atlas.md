---
"@motion-script/core": minor
"@motion-script/web": minor
"motion-script": minor
---

Add `ascii`, and the effect-resource capability it is built on.

`Effects.ascii()` divides the content into a grid and replaces each cell's tone with a glyph. Named ramps (`standard`, `blocks`, `braille`, `binary`, `hex`) or a custom string; `ink`/`background` colours, a `colored` mode that tints each glyph from its own cell, and `background: 'transparent'` to overlay the glyphs on whatever is behind the node.

Ramps are written least-ink-first, which describes the *result* rather than the glyph: on white-on-black an empty cell is the darkest thing the effect can draw. Invert ink and background for the paper look and the ramp is indexed back to front automatically, so a custom ramp is only ever written once.

**New in `@motion-script/web`: `EffectHandler.resources()`** — the first of the roadmap's Tier 3 capabilities. A handler can now bake extra textures beyond its source and receive them as child shaders in `makeShader`, with an `EffectResources` context supplying the font registry, its epoch, and offscreen surfaces. `ascii` uses it to bake a glyph atlas once per charset/font/cell-size; the same hook is what a LUT effect will need for loaded textures.

Custom handlers are unaffected — `resources()` and `makeShader`'s new `extra` parameter are both optional.
