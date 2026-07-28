---
"@motion-script/core": minor
"@motion-script/web": minor
"motion-script": minor
---

Add `Surface2D`: put 2D content onto 3D geometry.

A `Scene3D` could previously only texture a mesh from the asset manifest
(`map: "/wood.png"`) or from raw bytes (`Tex.data(...)`). There was no way to
paint something *authored in Motion Script* — a `Graphics` command list, or a
subtree of nodes — onto a surface, which is what a screen, a billboard, a poster
or a label wrapped on a curve all need.

`Surface2D` is an ordinary `Rect` whose content is rendered to an offscreen
buffer instead of the canvas. Place it as a child of the `Scene3D` that uses it
and bind it to any material map with `Tex.surface(name)`:

```tsx
<Scene3D scene={g => g
    .plane({ width: 4, height: 2.5, map: Tex.surface("scope"), position: [-3, 0, 0] })
    .plane({ width: 4, height: 2.5, map: Tex.surface("stats"), position: [ 3, 0, 0] })}>

    {/* a Graphics command list; `t` is the surface's elapsed time */}
    <Surface2D name="scope" width={1024} height={640}
        graphics={(g, t) => g.line({ points: trace(t) }).stroke({ weight: 6, fill: "#2ee88a" })} />

    {/* or a node subtree, laid out normally */}
    <Surface2D name="stats" width={1024} height={640} fill="#0b0d12"
        group="column" padding={48} gap={24}>
        <Text text="CPU" fontSize={44} fill="white" />
        <Rect width={load()} height={44} fill="#3ddc84" />
    </Surface2D>
</Scene3D>
```

Its `width`/`height` are the texture's resolution, and it is otherwise a normal
`Rect` — `fill`, `cornerRadius`, `clip`, `group` layout and children all work.

Being a real child is load-bearing: a detached subtree receives no asset catalog,
so a webfont or an `<Image>` inside one would never resolve. `Scene3D` renders
its surfaces *before* compositing the 3D, so the texture is always the current
frame's and a scrubbed frame matches a played one.

Also adds `RenderContext.rasterizeOffscreen(width, height, draw)` — the backend
seam this is built on, which renders arbitrary 2D content into an RGBA buffer.
It returns `null` on backends that can't rasterize offscreen.

Note the cost: an animated surface is a GPU readback plus a texture upload every
frame (three has its own GL context, so there is no shared texture to hand over).
Size a surface to what the geometry actually shows, and set `static` when the
content doesn't move.
