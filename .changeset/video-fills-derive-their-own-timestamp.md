---
"@motion-script/core": minor
"@motion-script/web": minor
---

Video fills work everywhere paint is accepted, with nothing to advance them.

A video fill's source timestamp is now derived **as it paints**, from how long
the node carrying it has existed, rather than being advanced by that node's
`tick()`. Only `ShapeNode` and `RootNode` ever did that advancing, so a video
was frozen on frame 0 anywhere else: inside a `stroke` or `shadow`, on a text
selection's paint, or in a custom node's own `Graphics`. All of those play now,
and a custom node needs no `tick` override to get there.

Deriving it also makes playback a pure function of the timeline: frame *N* is
identical whether it was scrubbed to, exported, or played into.

```tsx
// all of these play, on any node
<Rect stroke={{ weight: 40, fill: Fills.video('clip.mp4') }} />
<Text text="DEPTH" fill={Fills.video('clip.mp4')} />
ctx.draw(new Graphics().ellipse({ width: 360 }).fill(Fills.video('clip.mp4')));
```

`timestamp` becomes the explicit override — the time-remap knob. Set it (on
`<Video>` or in a `video` fill) to drive the playhead yourself, tween it to
scrub the clip, and set it to `null` to hand the playhead back to the clock.
New `playStart` delays the start relative to the node's appearance, for a fill
that joins a node which already existed.

**Several times of one clip at once**

A clip's decoded frame lives in one texture per source, updated in place, and Skia
doesn't resolve a draw until the surface flushes — so two draws of the same clip
at *different* times both sampled whatever was uploaded last, or read it mid-blit
and painted black. Deriving timestamps makes that easy to hit (a paused sample
beside a playing one), so each distinct time a frame asks for now gets its own
texture, and draws asking for the same time still share. A non-primary playhead
also warms its own frames and falls back to the nearest decoded one while it
waits, instead of dropping the draw.

**Behaviour changes**

- `playing: false` with no `timestamp` now holds the clip's first frame rather
  than freezing wherever playback had reached. Pass the frame you want held —
  `set({ playing: false, timestamp: 3 })` — which is also what survives a scrub.
- A video fill applied to a node that already existed opens partway into the
  clip, since the node's age is the playback clock. `playStart` re-aligns it.

**API**

- `FillData` drops `update()` and `dynamic` — the identity `update` every static
  fill had to declare is gone, and a new fill no longer implements one.
- `updateFill()` is removed from `@motion-script/core`; `resolveVideoTimestamp()`
  is exported in its place.
- `VideoFillProp.timestamp` / `Video`'s `timestamp` are now optional
  (`number | null`), and `VideoFillProp.playing` defaults to `true`.
