---
"@motion-script/core": minor
"@motion-script/web": minor
"@motion-script/vite-plugin": minor
"motion-script": minor
---

Add 3D support: a `Scene3D` node and the `Graphics3D` API.

`Graphics3D` is a chainable, renderer-agnostic scene recorder — the 3D
counterpart to `Graphics`. `Scene3D` is an ordinary 2D node (a `Rect` subclass)
that composites the rendered result into its own layout box, so 3D participates
in layout, transforms, clips, masks, blends and effects with no special cases:

```tsx
<Scene3D width="fill" height="fill" cornerRadius={24}
    scene={g => g
        .perspective({ position: [0, 2, 6], lookAt: 0 })
        .ambient({ intensity: 0.4 })
        .directional({ intensity: 2.4, position: [4, 6, 3] })
        .box({ width: 2, color: "tomato", rotation: [0, spin(), 0] })}
/>
```

There is one 3D node rather than a 3D node tree: `NodeProps` are 2D concepts
(`x`/`y`/`width`/`opacity`/`flex`/anchors) that mean nothing for a mesh in 3D
space, so everything inside is described with `Graphics3D` instead.

Animation flows through signals read inside the builder, which re-runs every
frame — so scrubbing and export are frame-identical. Note that a signal holding a
`Vector3`/`Euler3`/`Quaternion` needs an explicit lerp
(`createSignal(v, lerpVector3)`) or it will snap instead of interpolating.

Full control over meshes and materials: the complete parameter surface for every
material, arbitrary vertex buffers via `Geo.buffer`/`Geo.parametric`, raw GLSL
via `Mat.shader`, and a `params` passthrough for anything not yet modelled.

`three` is a dependency of `@motion-script/web` but is loaded through a lazy
dynamic import, so 2D-only projects and the prebuilt player never pay its
~600 KB. Rotations and other angles are in **degrees** throughout, matching 2D
`rotation`.
