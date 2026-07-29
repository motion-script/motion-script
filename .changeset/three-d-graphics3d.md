---
"@motion-script/core": minor
"@motion-script/web": minor
"@motion-script/vite-plugin": minor
"motion-script": minor
---

Add 3D support: the `view3D` fill, the `Graphics3D` API and the `View3D` node.

`Graphics3D` is a chainable, renderer-agnostic scene recorder — the 3D
counterpart to `Graphics`. **3D is a fill**: the renderer draws a scene to a
texture and shades the shape's own path with it, so it clips to whatever painted
it, stacks with the other fill layers, and inherits their
`opacity`/`blend`/`space`.

```tsx
<Ellipse fill={g3} />
<Text text="DEPTH" fontSize={320} fill={Fills.view3D(g3)} />
<Rect fill={["#0b0d12", g3, Fills.linearGradient(["transparent", "#000/60"])]} />
```

A bare `Graphics3D` coerces to a `view3D` fill the way a bare CSS string coerces
to a solid one. Cross-fading to or from a 3D fill works through the ordinary fill
tween; two 3D layers hard-cut, since a command list has no meaningful in-between.

`View3D` is sugar over that fill: a `Rect` that appends its scene to its own
`fill`, so 3D participates in layout, transforms, clips, masks, blends and
effects with no special cases. Subclass it and override `buildGraphics3D()` for a
reusable 3D component.

```tsx
<View3D width="fill" height="fill" cornerRadius={24}
    graphics3D={() => new Graphics3D()
        .perspective({ position: [0, 2, 6], lookAt: 0 })
        .ambient({ intensity: 0.4 })
        .box({ width: 2, color: "tomato", rotation: [0, spin(), 0] })}
/>
```

There is one 3D node rather than a 3D node tree: `NodeProps` are 2D concepts
(`x`/`y`/`width`/`opacity`/`flex`/anchors) that mean nothing for a mesh in 3D
space, so everything inside is described with `Graphics3D` instead.

A `Graphics3D` is passed as a **value**, never a builder callback, so
`graphics3D` is an ordinary signal-backed property that `set()` reaches.
Per-frame freshness comes from where the value is produced — `buildGraphics3D()`
runs every frame, and a `() => …` prop is a reactive binding. There is
deliberately no `t` parameter: drive procedural motion from a tweened signal,
which keeps it on the timeline and seekable.

**2D on 3D** is `Tex.surface(source, width, height)`, where `source` is a built
`Graphics` or a `Node` subtree — a value, not a mounted child and not a name:

```tsx
const scope = new Graphics().line({ points: trace(phase()) }).stroke({ weight: 6 });
const stats = <Rect group="column" padding={48}><Text text="CPU" fontSize={64} /></Rect>;

g3.plane({ map: Tex.surface(scope, 1024, 640) })
  .plane({ map: Tex.surface(stats, 1024, 640), position: [5, 0, 0] });
```

A node source is adopted for binding by whatever paints the scene — it gets that
node's asset catalog, inherited context and clock — so a webfont still shapes and
an `<Image>` still loads without the subtree living anywhere in particular. Hoist
the source rather than rebuilding it each frame.

Full control over meshes and materials: the complete parameter surface for every
material, arbitrary vertex buffers via `Geo.buffer`/`Geo.parametric`, raw GLSL
via `Mat.shader`, and a `params` passthrough for anything not yet modelled.

`three` is a dependency of `@motion-script/web` but is loaded through a lazy
dynamic import, so 2D-only projects and the prebuilt player never pay its
~600 KB. Rotations and other angles are in **degrees** throughout, matching 2D
`rotation`.
