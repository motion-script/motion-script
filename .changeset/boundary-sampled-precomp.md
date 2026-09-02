---
"@motion-script/core": minor
---

Precomp samples a scene's key times instead of walking every frame.

Measuring a scene meant a layout pass and two declaration walks **per frame**,
because a generator scene would not say how long it was or what it touched. A
scene that can name its boundaries — a command's start, its end, a node's
arrival or departure — is now measured only at those: between two of them
nothing changes discontinuously, so the frames in between have nothing new to
say. 1200 animating rects: 2901ms to 328ms. 1200 static rects held for five
seconds: 4873ms to 110ms.

- `SceneDriver` gains an optional `keyTimes()`. A driver that implements it is
  sampled; one that does not is walked frame by frame exactly as before, so a
  host with no notion of boundaries loses nothing. `SceneTimeline` implements it
  from the document, and `Scene.duration` is now known without building.
- Each interval's end state is declared under its *start* frame before its own,
  which is what attributes an asset discovered at `b` to the whole of `[a, b]`.
  A colour-to-image tween cross-fades, so the image is painted from just after
  the interval's start; endpoint-only attribution would open that decode after
  the frames that already needed it.
