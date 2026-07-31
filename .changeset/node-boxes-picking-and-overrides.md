---
"@motion-script/core": minor
"@motion-script/react": minor
---

Editor selection: where a node is on screen, what is under a click, and a write path fast enough for a drag.

A host embedding the player could inspect the scene tree and read a node's raw
props, but nothing told it where a node had actually been *drawn* — and nothing
let it move a node without rebuilding the `Scene`, which tears down and
re-creates the render surface. Direct manipulation (click to select, drag to
move) was therefore out of reach. It no longer is.

The host cannot compute this itself. Raw `x`/`y` are right only for absolutely
positioned shapes at the scene root, and silently wrong for `Text` (auto-sized by
the layout engine), `Image`/`Video` (intrinsic size), and anything under a
`Row`/`Column`/`Grid`, where position comes from layout rather than the stored
props.

**Where a node is: `getNodeBox` / `getNodeBoxes`**

```ts
const box = frameRef.current.getNodeBox(path);
// → { topLeft, topRight, bottomRight, bottomLeft, center,
//     width, height, rotation, scale, opacity, id, path, type }
```

Coordinates are **viewport space**: origin at the viewport centre, y-up, in the
`viewport` pixels the player was given. Corners come back already rotated and
scaled, so a gizmo can be drawn straight from them.

Unlike `Node.global`, a `NodeBox` folds in the **camera**. A camera scope
(`zoom`/`origin`/`heading`, on the scene root or a `Camera` node) is applied at
render time and is invisible to the world matrix, so a box built from `global`
looks perfectly reasonable and sits in the wrong place the moment a scene zooms.
`getNodeBoxes()` returns every visible node's box in draw order — one tree walk,
for hover highlights, marquee selection and snap guides.

**What is under a click: `pickNode`**

```ts
const hit = frameRef.current.pickNode(point, 4 / previewZoom);
```

Topmost-first, so children win over parents and later siblings over earlier ones.
Invisible (`opacity: 0`) nodes are skipped, clipping ancestors and camera
viewports gate their subtrees, and the scene root is never returned.

Shapes hit their **outline**, not their box — a click in the empty notch of a
star falls through to whatever is behind it. That comes free from the `Clip` each
shape already declares for clipping, so the grab region and the drawn edge cannot
drift apart. `Text` and media deliberately keep their box (testing glyph outlines
would make a short line's trailing whitespace unclickable), and `Line` — whose
`points` never reach the layout engine, so its box says nothing about where it is
drawn — tests its polyline directly, widened by its stroke weight. Custom nodes
can override `hitTestSelf` to make selection follow whatever they actually paint.
`tolerance` is grab-slop in scene units; divide your pixel slop by the preview
zoom so the grab area stays constant on screen.

**Moving a node: `setNodeOverride` / `clearNodeOverrides` / `repaint`**

```ts
frameRef.current.setNodeOverride(path, { x, y });
frameRef.current.repaint();          // layout + draw, no generator replay
// on drop: commit to your own model, then
frameRef.current.clearNodeOverrides(path);
```

Overrides are transient values layered over whatever the generators evaluate to,
re-applied after every evaluation — so they survive frame changes and backward
seeks for as long as they are held. They are not persistence: the host commits on
drop and clears, and the next rebuild carries the value in through the scene.
`clearNodeOverrides` replays the current scene to recover the authored value, so
it belongs on pointer-*up*, never per `pointermove`.

**`TreeState.path`**

Every node in `getTreeState()` now carries its structural path (`""` for the
root, `"0.2"` for the third child of the first). Node ids are per-instance UUIDs
that change on every rebuild; paths do not, so they are what selection, tree
expansion, and the APIs above key on.

`TreeState` is also no longer marked `@internal` — it was already the documented
return type of a public method.

**A box is the node's ink, not its layout cell**

For nearly every node those are the same thing, but not for a `Line`: its `points`
are drawn relative to its centre and never reach the layout engine, so its cell is
the parent's whole content box under the default `'fill'` (or 0×0 under `'hug'`)
and describes the line in neither size nor position.

`NodeBox` therefore reports the node's **ink**, via a new `_localBounds()` seam.
A `Line` returns the span of its `points`, grown by half its stroke so the box
holds the drawn width and an axis-aligned line still has thickness. Crucially
that box may be **off-centre**: `points: [(0,0), (100,40)]` draws up and to the
right of the node, so its box is centred at `(50, 20)`. A `measure()` override —
the obvious fix — could not express that, and would have changed layout for every
existing `Line` in a `Row`/`Column`. This changes neither.

The stroke growth is deliberately conservative (applied on all four sides, while
a diagonal stroke only spreads perpendicular to itself), so the box can overshoot
by up to half the weight per axis. Over-covering is the safe direction for a
gizmo; hit testing is unaffected and measures true distance to each segment.

Custom nodes that draw outside their cell can override `_localBounds()` to get a
correct selection box and grab region together. It returns a `BoxBounds` — the
same `{ x, y, width, height }` the layout engine already uses, rather than a
second identical type. `BoxBounds` is now documented as the general "a rectangle
somewhere" shape and is no longer `@internal`: what `x`/`y` mean is deliberately
left to each site, since a layout cell is canvas y-down and parent-relative while
content bounds are y-up and centre-relative — exactly as `Vector2` is already
shared across both conventions.

**Reachable from `motion-script`**

`nodeBox`, `pickNode` and `collectBoxes`, plus the `NodeBox`, `NodeOverride` and
`TreeState` types, are re-exported from the flagship `motion-script` package, so
a host can build a canvas gizmo without depending on `@motion-script/core`
directly.
