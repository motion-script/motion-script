---
"@motion-script/core": minor
"@motion-script/skia-render": minor
"@motion-script/code": minor
---

`<DefaultTextStyle>` now reaches drawn `Graphics` text, not just `Text`/`RichText` nodes

A raw `.text({ text })` / `.richText({ spans })` op that names no `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `letterSpacing`, `lineHeight` or `textAlign` inherits it from the enclosing `<DefaultTextStyle>`, falling back to the project theme's `typography.default` preset — so a custom node no longer needs a `fontFamily` prop just to be themable. `fill`/`stroke`/`shadow` stay a node-level concern: in a `Graphics` those are group-scoped paint ops rather than per-shape slots.

`RenderContext` gains `pushTextStyle(style)` / `popTextStyle()` / `defaultTextStyle()`. Scopes merge per key, so nesting accumulates; `pushTextStyle(null)` opens a scope that inherits nothing, which is how `Code` keeps its monospaced face under a document-wide display family.

Backends now implement `drawGraphics(graphics)` instead of `draw(graphics)`; `RenderContext.draw` resolves the ambient defaults and calls it, so the real renderer and the precomp asset walk can't disagree about which font an under-specified op shapes with.
