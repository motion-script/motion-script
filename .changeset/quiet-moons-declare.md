---
"@motion-script/core": minor
"@motion-script/skia-render": minor
"@motion-script/web": minor
"@motion-script/react": minor
"@motion-script/code": minor
"motion-script": minor
---

Nodes declare their assets; animations can be evaluated as well as run

**Assets are declared, not inferred.** `prepareLayout(tracker)` and `prepareRender(tracker)` are now synchronous and take an `AssetTracker`; a node states what it needs from its current props rather than having it discovered by a render pass that walked its op lists. `prepareAudio` folds into `prepareRender` — audio needs no layout, and a `Video` declaring its picture and its sound together cannot have the two disagree about `src` or the trim window.

The tracker's methods are `addFont`, `addImage`, `addVideo`, `addAudio` and `addAsync`, taking an options bag for sizes. Async setup goes through `addAsync(key, load)`, which puts the load on the frame-ranged timeline so `loadAt` can *wait* for it — the hook that used to do the awaiting itself could only ever be fire-and-forget, which is why `Code` laid out against untokenized text and re-tokenized later.

Most nodes declare nothing: `ShapeNode` covers `fill`/`overlay`/`stroke`/`shadow` and `Node` covers `effects`. Only a node painting outside those slots overrides. Two consequences worth knowing: a scene's whole asset set is now knowable without rendering every frame of it, and a font can be loaded *before* the layout that measures against it — which was impossible while families were discovered by measuring.

`TrackRenderContext` and `TrackMeasureScope` are removed. An image or video the renderer reaches for and cannot find now throws `AssetNotLoadedError` instead of silently skipping the layer; a video *timestamp* the decode window has not reached is still tolerated, since that asset loaded fine.

**`Command` — an animation as a value.** `Command<P>` carries a `duration` and a pure `at(t)` from normalized time to the props it writes, with `_stepper()` and `[Symbol.iterator]()` derived from it, so `yield*` and `parallel`'s flat path are unchanged. Build one with `Node.animate(at, duration, easing)` and mark it with `@command()` so a host can read a node's animations off the class. `ShapeNode`'s `fillTo`/`overlayTo`/`strokeTo`/`shadowTo` return one; `moveTo`/`moveX`/`moveY`/`fadeTo`/`rotateTo`/`scaleTo` and the camera's `zoomTo`/`panTo`/`headingTo` return the `AnimationBuilder` they always delegated to instead of a generator wrapper that discarded it. Call sites are unchanged — everything here is iterable.

Two seeks that only claimed to be one are fixed: `AnimationBuilder`'s stepper ignored its argument and always primed at zero, and `Node._prepareStep`'s never tracked elapsed time or applied discrete-prop snaps.

**`createDrivenScene(driver)`** lets a host evaluate a scene at a time instead of replaying it to one. The driver is `{ build, evaluateAt, duration }` and nothing else — no document model reaches core. A driven scene skips the replay loop entirely, so a backward seek costs what a forward one does and the time-slicing machinery never engages.

**`MeasureScope` is renamed to `Measurer`** (`SkiaMeasureScope` → `SkiaMeasurer`, `WebMeasureScope` → `WebMeasurer`). It measures text; it never was a scope in the sense the rest of the codebase uses the word. `motion-script` re-exports the old name as a deprecated alias so a custom node's `measure(constraints, scope: MeasureScope)` override keeps compiling; it will be removed in the next major.
