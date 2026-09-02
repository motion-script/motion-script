---
"@motion-script/core": major
"@motion-script/canvaskit": major
"@motion-script/skia-render": major
"@motion-script/web": major
"@motion-script/react": major
"@motion-script/latex": major
"@motion-script/code": major
"@motion-script/engine": major
"motion-script": major
---

Scenes are data. Generator scenes are gone.

A scene was a generator function, so the only way to know what frame N looked
like was to run frames 0..N-1. A backward seek replayed from zero, and a scene's
duration could not be known without playing it to the end. A scene is now a
**document** — plain JSON — that is built once and asked what it looks like at a
time. Seeking costs the same in either direction and however far.

### The model

- `StillDocument` is nodes and props. `AnimationDocument` is a list of commands,
  each carrying its own `at`. Sequencing is `at + duration`, running two together
  is a shared `at`, and a wait is a gap — so there is no `sequence`, `parallel` or
  `wait` any more.
- Node types are **code**: a class registered under a string key
  (`registerNodeType`), which is where a custom node joins the system and where
  anything JSON cannot express belongs.
- `createStillScene` / `createAnimationScene` compile a document into a `Scene`.

### Removed

- `createScene`, `createStill`, `SceneGenerator`, `StillContent`, `FrameGenerator`
- `tween`, `wait`, `sequence`, `parallel`, `fadeIn`, `fadeOut`
- `Command` is no longer iterable — it has `duration`, `at(t)` and `_stepper()`
- `Stage` loses `to`/`zoomTo`/`panTo`/`headingTo`/`fillTo`/`overlayTo`/`playSound`;
  animating the scene root is a command targeting it, and `stage.canvas` still
  carries each as a `@command()`
- `Signal.tween` returns a `Command`; `Sound.play()` is replaced by
  `Sound.clipDuration`
- The `@motion-script/vite-plugin`, `@motion-script/player`,
  `@motion-script/cli` and `create-motion-script` packages. A host embeds
  `@motion-script/react`, or renders from Node with `@motion-script/engine`.

### Changed

- `Scene.__sceneHotId` → `Scene.id` (the timeline **slot**) and
  `Scene.__precompKey` → `Scene.precompKey` (the scene's **content**). The two are
  deliberately separate: a slot id is stable *across* an edit and a content key
  changes *because* of one.
- `SceneDriver` gains `compile()`, run after the first layout — a command that
  pins to a rendered box reads zero until a layout pass has happened.
- `@motion-script/latex` uses MathJax's DOM-free adaptor outside a browser, so
  importing it no longer throws under Node.

### Added

- `PlaybackController.setScenes` (and `FrameHandle.setScenes`) replaces the whole
  scene list without rebuilding the backend: every scene that survives keeps the
  tree it built and the pass that measured it. `MotionPlayer` reconciles a changed
  `scenes` prop through it rather than remounting.
