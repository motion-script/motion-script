---
"@motion-script/core": major
"@motion-script/skia-render": major
"@motion-script/web": major
"@motion-script/engine": major
"@motion-script/react": major
"@motion-script/code": major
"@motion-script/latex": major
"motion-script": major
---

Solidify the node, stage and render-context API.

The line between what a scene author calls and what the runtime calls is now
drawn explicitly. `Node`/`Node2D` shed ~40 members from their published surface,
four types split into an interface plus its implementation, and a node's
lifecycle collapses from three calls to one.

**Renames.** `RootNode`/`RootProps` → `Canvas2D`/`Canvas2DProps`; `BuildStage` →
`CanvasStage` (with `Stage` now a hand-written interface); `scene.root`/
`stage.root` → `.canvas`; `Measurer` (and the deprecated `MeasureScope`) →
`Measurer2D`; `node.layoutRect`/`node.measuredRect` → one public
`node.layoutBounds`; `node.clock`/`NodeClock` → `node.time`/`NodeTime` (`.time` →
`.total`); `onRender` → `renderContent`; `ctx.beginEffectScope`/`endEffectScope`
→ `beginEffects`/`endEffects`; `ctx.rasterizeOffscreen` → `ctx.rasterize`;
`ctx.defaultTextStyle()` → the `ctx.defaultTextStyle` property.

**Interface / implementation splits.** `RenderContext2D`, `Measurer2D`,
`AssetTracker` and `AssetCatalog` are now interfaces; the classes are
`CanvasRenderContext2D`, `CanvasAssetTracker` and `ManifestAssetCatalog`.
`ctx.begin`/`ctx.end` moved off `RenderContext2D` onto `RenderPass2D`, so a
custom node's `renderSelf` can no longer open a scope nothing closes.

**`measureText` returns a `Size2D`** rather than a bare width — the shaper always
produced both, and reconstructing a height from `fontSize × lineHeight`
disagreed with it for any fallback face.

**One lifecycle verb.** `bindAssets` + `bindContext` + `ellapse` become
`attach(scope)`, which also sets `node.mounted`. `mounted` gates measure, layout,
render, both asset walks and every command; a command on an unmounted node runs
its duration and writes nothing.

**One command per `to()`.** `node.to(a, 1).to(b, 1)` no longer chains — use
`sequence(...)`. Every command-shaped method now carries `@command()`, so
`getCommandMeta` lists them all. The protected builder a custom command is
written against is `this.command(at, duration, easing?)` — renamed from
`this.animate`, which named what it was for rather than what it returns, in a
vocabulary that is otherwise `Command` / `@command` / `makeCommand` throughout.

**Children go in and out through `add` / `remove` / `clear`.** `addChild`,
`addChildren` and `removeChild` are private — `add(child)` already did everything
they did and more (it flattens nested arrays and drops `false`/`null` from a
`cond && <Node/>`), so reaching past it only opted out of that. `remove(child)`
takes the same shapes, and `clearChildren()` is `clear()`.

`Code.remove(range, …)` is `Code.erase(range, …)`: a `Code` is also a node, and
two methods spelled the same on one object — one taking a code range, one taking
a child — is worse than one of them having a slightly less obvious name.

**The per-frame walks are free functions now.** `prepareLayoutAssets`,
`prepareRenderAssets`, `sample` and `primeMotion` were pure traversals sitting on
every node, and `prepareRenderAssets` sat one letter from the `prepareRender`
hook it calls. They are `declareLayoutAssets(node, tracker)`,
`declareRenderAssets(node, tracker, path?)`, `sampleTree(node)` and
`primeMotionTree(node, at)` in `nodes/node/node-walk.ts`. `beforeRender`,
`afterRender`, `renderChildren` and `resolveSizeInput` became `protected` — they
were only ever overridden, never called across objects.

**Removed.** `node.wiggle`, `node.random` and the `seed` prop (randomness lives
on `stage.random(seed)`); `node.moveX`/`moveY`; `node.reinit` (a `Scene` builds a
fresh `Canvas2D` on `reset()`); `node.captureProps`/`applyProps` and the
`PropLayer` export (zero callers); `node.isAutoSize` (the free `isAutoSize` in
`layout/size-resolver` is what everything used); the dead
`dirtyGeneration`/`isTimeInvariant`. Global layers must now be factories —
passing a node throws.

**Fixes a quadratic per-frame walk.** `attach` advanced the whole subtree's clock
*and* recursed into each child, so a node at depth *d* had its time advanced *d*
times per frame. The advance is now per-node; `attach` owns the single recursion.

**Layout.** `nodes/base/` splits into `nodes/node/` and `nodes/2d/`, and every
test moves into a sibling `tests/` folder.
