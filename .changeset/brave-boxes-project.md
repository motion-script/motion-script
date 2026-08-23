---
"@motion-script/core": minor
---

Editor geometry for 3D: a `Node3D` now reports where its pixels landed, so a host can hit-test and draw a selection box over a mesh

`pickNode` and `collectBoxes` descend into a `Canvas3D`'s 3D children and report a `NodeBox` for each, and `nodeBoxAt(root, path)` answers for a path in either dimension. A mesh has no rectangle of its own, so the box is its world-space AABB projected through the viewport's camera and re-bounded in the `Canvas3D`'s own plane — the same box every 3D editor draws, and one that composes with the 2D side unchanged because it arrives as an ordinary `NodeBox`.

```ts
const box = controller.pickNode({ x, y }, slop);   // a Box3D inside a Canvas3D
controller.getNodeBox("2.1");                       // …and by path, for the gizmo
```

Picking inside a viewport is depth-ordered rather than draw-ordered: the nearest mesh to the camera wins, a 2D HUD child still wins over the scene behind it, and a click on empty viewport falls through to the `Canvas3D`.

Three pieces are public in their own right. `geometryBounds3D(geometry)` gives a `Box3` for any geometry descriptor, analytic per primitive and taking three's own defaults, and answers `null` for the three it cannot measure from the descriptor alone (a loaded model, an extruded path, a parametric callback). `Canvas3D` gains `children3D`'s companion for readers outside the render pass. `Node` gains `_allChildren`, the authored child list in both dimensions.

**Structural paths now index that authored list.** `getTreeState`, the lifespan recorder, `getNodeBox`, `setNodeOverride` and the picking walk all agree on it, where the first two used to index the 2D-filtered `children`. This only differs inside a `Canvas3D`, and only when one holds both a mesh and a 2D HUD child — where the old numbering shifted the HUD onto a mesh's slot.
