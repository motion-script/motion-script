---
"@motion-script/core": major
"@motion-script/skia-render": major
"@motion-script/web": major
"motion-script": major
---

Rework the 3D authoring surface so it reads like the 2D one.

The 3D API had grown as a thin renaming of three.js: ten spellings of
"subdivision", five of a partial revolution, paired flags that silently
disagreed, and an identity `key` authors had to write by hand. This replaces that
with the vocabulary the 2D side already uses, and derives everything that was
only ever a second way to say something the descriptor already knew.

**A surface is a `fill`.** `<Box3D fill="tomato" />`, and `fill` takes the whole
2D fill chain — a colour, a gradient, an image, a video, a `Node2D` subtree, a
stack of blended layers. It replaces a flat `color` plus the `map`, `emissiveMap`,
`alphaMap`, `envMap` and `lightMap` slots, each of which was a fill under another
name. A `Tex.surface` source is a fill too, so 2D content on geometry needs no
builder call unless you are pinning a resolution.

**Two names for what needed fifteen.** Subdivision is always `segments` (a
number, or a per-axis tuple each shape documents), replacing `widthSegments`,
`heightSegments`, `depthSegments`, `radialSegments`, `tubularSegments`,
`thetaSegments`, `phiSegments`, `capSegments`, `curveSegments` and `detail`. A
partial revolution is always `startAngle` + `sweep` in degrees — the pair
`Ellipse` has always used — replacing `thetaStart`, `thetaLength`, `phiStart`,
`phiLength` and `arc`. Also: `radius: [top, bottom]` for a taper, `capped` for
`openEnded`, `thickness` for `tube`, `windings` for `p`/`q`, `path` for a
`shape`, and `faces: "both"` for `side: "double"`.

**`Box3D` takes `cornerRadius`**, the same control `Rect` has. The surface is
built in core (three has no rounded box outside its addons) as 6 faces, 12
quarter-cylinder edges and 8 spherical corners, with exact normals.

**Axes are the real props.** `x`/`y`/`z`, `rotationX/Y/Z` and `scaleX/Y/Z` are the
signals, named exactly what 2D names them; `position`/`rotation`/`scale`
distribute into them the way `Node2D`'s `size` distributes into `width`/`height`.
`to({ y: 3 })` now works without restating the other two axes.

**One camera, placed the way a shot actually moves.** `<Camera3D>` replaces
`PerspectiveCamera3D`/`OrthographicCamera3D` and takes
`target`/`orbit`/`elevation`/`distance`, so a camera move is a tween rather than
a `Math.sin`/`Math.cos` pair recomputed in a prop binding. `near`/`far` are
derived from the scene's own bounds; `aspect` and the four orthographic edges are
gone.

**Removed because it is now derived:** `transparent` (from opacity, fill alpha,
`alphaMap` or transmission — and latched, so a fade recompiles once), `depthWrite`
(a blended surface stops writing depth, which is the fix for a translucent mesh
cutting a hole through everything behind it), and every `key` — reconciler
identity is a node id plus a content signature, so conditional emission needs
nothing written.

**Removed because it was a 2D fill:** `<Background3D>` and the colour/texture arms
of `BackgroundData3D`. three's background pass is unaffected by every light *and
by fog*, the renderer clears transparent, and `Canvas3D` already composites over
its own fill layers — so `<Canvas3D fill={…}>` does strictly more. A sky that
reprojects as the camera turns is `<Environment3D background>`, merged with the
lighting because an HDRI that lights a scene is the panorama behind it.
`<Fog3D>` with no colour takes the viewport's fill.

**Moved from nodes to `Canvas3D` props:** `shadows`, `tone`, `exposure`, `post` —
`<Shadows3D>`, `<ToneMapping3D>` and `<PostEffects3D>` were nodes with no position
whose duplicates silently did nothing.

**Other renames:** `AreaLight3D` (was `RectAreaLight3D`), `HemisphereLight3D`'s
`sky`/`ground` (was `color`/`groundColor` — and the node's `color` was silently
dropped, since the descriptor and renderer both read `skyColor`, which nothing
wrote), `emission`/`emissionStrength`, `blend`, `shading: "flat"`, and `closed`/
`segments` on a line instead of a `mode` enum. Point and spot light `intensity` is
now on the same scale as a directional light's, so a scene no longer mixes
`2.4` and `40` for comparable lights. Shadows default on for objects and off for
lights, and a light's shadow is `{ softness }` with bias, map size and clip
planes derived from the scene's extent.

---

**Fixes translucent 3D compositing.** Every translucent 3D surface was being
composited **additively** — `src + (1-a)·dst` instead of `a·src + (1-a)·dst` — so
it rendered at close to full strength whatever its opacity said. A 5%-opacity
shell came out as a solid wall.

three's canvas *is* premultiplied, but handing it to CanvasKit as a texture
source runs it through the browser's unpack pipeline, where
`UNPACK_PREMULTIPLY_ALPHA_WEBGL` is false by default — so the alpha is divided
back out and what arrives is straight colour. `upload3DFrame` declared it
`Premul` / `srcIsPremul: true`; it now declares `Unpremul` / `false`, which is
what it actually is. The dark fringes that motivated the old flag came from the
*mismatched* pairing (`Premul` with the flag omitted, which premultiplies a
second time), and are fixed by this too.

This survived because it is a no-op at `a = 1`, and every opaque 3D scene is
exactly that — and because the two formulas agree on any channel where the
source is zero, so the obvious probe (pure red/green/blue over black or white)
matches to the byte either way. `packages/e2e/src/scenes/view3d-translucent.tsx`
is the regression scene, deliberately in a colour that separates them.

**The e2e stable baseline must be regenerated** (`pnpm e2e:stable`): every 3D
scene changed shape with the API, and the translucent ones change pixels.
