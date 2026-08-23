---
"@motion-script/core": major
"@motion-script/skia-render": major
"@motion-script/web": major
"@motion-script/react": major
"@motion-script/code": major
"@motion-script/latex": major
"motion-script": major
"@motion-script/cli": major
---

**3D node trees.** A 3D scene is now written as a tree of nodes rather than as a
builder chain, and those nodes are nodes in every sense that matters — refs,
`to()`/`set()`/`save()`/`restore()`, signal bindings, context, `@command` methods,
per-node clocks, and composition by subclassing all work exactly as they do in 2D.

```tsx
<Canvas3D width="fill" height="fill" cornerRadius={24}>
    <PerspectiveCamera3D position={[0, 2, 6]} lookAt={0} fov={45} />
    <AmbientLight3D intensity={0.4} />
    <DirectionalLight3D intensity={2.4} position={[4, 6, 3]} castShadow />
    <Fog3D color="#0b0d12" near={5} far={30} />

    <Group3D ref={rig}>
        <Box3D width={2} color="tomato" roughness={0.3} />
    </Group3D>

    <Text text="FPS 60" fontSize={32} />        {/* a 2D HUD, over the 3D */}
</Canvas3D>

yield* rig().to({ rotation: [0, 360, 0] }, 2);
```

The scene graph is now one tree API over two spaces. `Node` is dimension-agnostic
and owns everything true of a node wherever it lives — the tree, identity, the
reactive property system, commands, context, the clock, asset declaration.
`Node2D` adds layout and 2D drawing; `Node3D` adds a `Transform3D` and 3D drawing.
The two never mix: `Canvas3D` is the one node that holds both, and parenting a 3D
node anywhere else throws rather than silently drawing nothing.

`Graphics3D` shrinks to what `Graphics2D` is — *what one node draws*. Hierarchy,
lights, camera, fog, background, environment, shadows, tone mapping and the post
chain are no longer builder methods on it; they are nodes, recorded through the new
`RenderContext3D` into a `Scene3D`. A `Scene3D` is that recording, and it is still
paintable through any 2D path, so 3D through glyphs or an arbitrary shape survives.

### Renames

| before | after |
|---|---|
| `Node` (the scene-graph base) | `Node2D` — `Node` is now the shared base of `Node2D` and `Node3D` |
| `NodeProps` | `Node2DProps` — `NodeProps` is now the shared base props |
| `Graphics` | `Graphics2D` |
| `RenderContext` | `RenderContext2D` |
| `Render2DContext` | removed — folded into `RenderContext2D` |
| `View3D` / `View3DProps` | `Canvas3D` / `Canvas3DProps` |
| `Fills.view3D(g3)` | `Fills.canvas3D(scene)` |
| `Light3D`, `Camera3D`, `Fog3D`, … (descriptors) | `LightData3D`, `CameraData3D`, `FogData3D`, … |

`JSX.Element` is now the dimension-agnostic `Node`, so one JSX runtime serves both
trees. A helper that annotates its own JSX (`function card(): Node2D`) needs `Node`
instead; library surfaces that receive JSX (`Scene.add`, project `backgrounds` /
`overlays`, `Tex.surface`) were widened to match.

### Other changes

- `attributeProperty` now honours an **explicit** `default: undefined` as "no
  default" rather than folding it back onto the attribute's fallback. This is what
  lets an optional attribute stay absent from a descriptor so the renderer's own
  default applies — previously `@colorProperty({ default: undefined })` silently
  produced black.
- `Canvas3D.prepareRender` declares the assets of every `Tex.surface` **node**
  source. A source is a value in a descriptor rather than a child, so no tree walk
  reached it and its webfont was never declared — text on a node-sourced surface
  did not render.
- A `Node3D` camera places itself rather than its enclosing group: three aims a
  camera's -Z at `lookAt` but a plain group's +Z, so the shot would otherwise face
  backwards.
- The 3D reconciler now takes its cache identity from the **node**, not from an op's
  positional path. A conditional sibling appearing or disappearing no longer
  renumbers its neighbours and forces the tail of the cache to rebuild.

See the migration guide for the full old→new mapping.
