---
"@motion-script/core": minor
"@motion-script/skia-render": minor
"@motion-script/web": minor
---

Single frames and stacked audio become first-class, instead of by-products of the video pipeline.

Both were already possible — a still is one frame of an export, and audio beds
are resolved during the scene precomp — but only reachable by driving the video
path or reaching into `@internal` runtime symbols. A host that wants a thumbnail
builder or an audio timeline can now build one against a supported API.

**Stills: `StillRenderer`**

A long-lived renderer that repaints into a canvas the host owns. The expensive
things — the CanvasKit module, the WebGL Skia surface, the decoded-asset cache —
stay alive across calls, so re-rendering after an edit costs a precomp and a draw
rather than a new GL context.

```tsx
const renderer = await createStillRenderer({ canvas, viewport, manifest, theme });

await renderer.render(() => (
    <Rect width="fill" height="fill" fill="bg">
        <Text text={title} fontSize={120} />
    </Rect>
));

const blob = await renderer.toBlob({ format: 'png' });
```

`render()` also takes a `Scene`/`Scene[]` to sample an animation —
`{ frame: 120 }`, `{ frame: 'last' }`, `{ time: 2.5 }` — and goes through the
same `drawFrameAt` pass the exporter runs per frame, so a preview and the image
it exports cannot drift apart.

**Audio: `AudioTimeline`**

Stack clips on a timeline, play and scrub them, and mix them down — with no
scenes and nothing rendered.

```ts
const audio = await createAudioTimeline({
    tracks: [
        { src: music, startAt: 0, volume: 0.4, trimStart: 8, trimEnd: 68, loop: true },
        { src: vo, startAt: 2 },
    ],
    manifest,
});

audio.onTime(t => setPlayhead(t));
audio.unlock();                                 // from a user gesture
await audio.play();
const wav = await audio.mixdown({ as: 'wav' });
```

It reuses `AudioTrack`, so a set of tracks previewed here can be handed straight
to `createProject({ audioTracks })`. It lives on the `@motion-script/web/audio`
subpath, which reaches it **without loading CanvasKit** — none of it draws.

One divergence remains between preview and mixdown, inherited from the live
device and now documented rather than silent: clip starts quantize to `1/fps`
during playback, while the mix schedules at absolute times and is sample-accurate.

**Fixes**

- **Curve-valued audio filters no longer flatten when exported.** The mixer built
  its filter graph without a clip duration, and `applyParam` resolves a curve
  against that duration — so with 0 every curve collapsed to a single static
  value. A `gain(fadeIn(2))` exported as a constant gain, and the same clip
  sounded different in the player than in the file. It now passes the clip's
  scene-time length and start time, exactly as the live device does.
- **`speed` curves are no longer dropped from exports.** The mixer read only
  `effectiveSpeed`, which by design ignores curve-valued speeds (they are
  scheduled onto `playbackRate` instead). A ramped speed therefore played at 1×
  in the file while ramping correctly in preview. The mixer now schedules the
  curve via `applySpeedToPlaybackRate`, and derives the buffer it consumes from
  the rate's integral rather than a flat multiply.
- **`AudioRequest.endAt` is documented as what it is.** It is always a number,
  with `Infinity` as the open/unbounded sentinel, but two readers guarded it as
  though it were nullable (`?? Infinity`, `!== null`). Both guards were dead —
  only `Math.min` against the timeline end was doing the work — and both encoded
  a shape the field never had. They now test `Number.isFinite`, matching
  `playBuffer`, which had it right all along.

**Behaviour changes**

- `exportScreenshot` now applies `theme` / `variables` itself. Previously the
  caller had to call the global `setTheme()` first or every color token and
  `stage.variables(...)` lookup silently resolved to nothing.
- `exportScreenshot` measures only up to the scene owning the requested frame
  (`Precomp.runUntil`) instead of every scene passed. A `first`-frame capture of
  a long project no longer precomps the whole timeline. `last` still measures
  everything, since it cannot be located otherwise.
- `exportScreenshot`'s `frame` is optional (defaulting to the first) and accepts
  `number` / `'first'` / `'last'` as well as a `FrameSpec`.

**API**

- New in `@motion-script/core`: `createStill(factory)` builds a one-frame scene,
  so a still needs no generator. It takes a **factory**, not a node, and throws
  if given one — a scene is built more than once per rendered frame and
  `Scene.reset()` disposes its children between passes, so a captured node would
  be torn down before its second use.
- New in `@motion-script/core`: `audioTimelineDuration(tracks, catalog)` derives
  the natural end of a track set. `resolveGlobalAudio` clips to a duration the
  caller must already know, so audio standing on its own needs this first.
- New in `@motion-script/core`: `AudioDevice.setVolume(volume)`, held separately
  from `setMuted` so unmuting restores the set level. `StorageAdapter.setCatalog`
  swaps the manifest while keeping cached decodes.
- New in `@motion-script/skia-render`: `drawFrameAt` — the still pass without the
  encode, so a caller-owned render context can be driven repeatedly.
  `renderFrameAt` is now that plus an encode.
- New in `@motion-script/web`: `StillRenderer`, `createStillRenderer`,
  `AudioTimeline`, `createAudioTimeline`, `mixAudio`, `encodeWav`. The mixer was
  a private class inside the exporter; it is now shared with `mixdown()`.
