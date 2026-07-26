# Effects roadmap

What Motion Script renders today, what it's missing, and what each missing piece
actually costs to build against *this* engine.

Tiers are ordered by implementation cost, not by desirability — Tier 1 items need
no new plumbing at all, Tier 3 items each unlock a whole family but need a new
engine capability first.

## Shipping today (31)

**Blur & motion** — `blur` · `directionalBlur` · `motionBlur` · `radialBlur`
(zoom/spin)

**Colour & tone** — `grayscale` · `invert` · `posterize` · `threshold` ·
`duotone` · `curves` · `colorAdjustment` · `vintage` · `bloom`

**Detail & texture** — `sharpen` · `edges` (sobel/prewitt/laplacian) · `grain` ·
`scatter` · `pixelate` · `dither` (bayer 2/4/8) · `halftone` (dot/line/cross)

**Shape & light** — `outline` · `vignette` · `bulge` · `magnify` ·
`chromaticAberration`

**Glitch & digital** — `rgbShift` · `scanlines` · `blockDisplace` · `bitCrush`
(palette or bit-depth)

**Glyph** — `ascii` (standard / blocks / braille / binary / hex ramps, or a
custom one)

**Escape hatch** — `sksl` (custom shader)

Plus seven media filters on image/video fills (`exposure`, `blur`, `grayscale`,
`alpha`, `colorMatrix`, `curves`, `colorAdjustment`) and two video-only temporal
filters (`posterizeTime`, `echo`).

**What the earlier draft of this document called out as the standout gaps —
`vignette`, `grain`, `sharpen`, `outline`, edge detect, `threshold`, `duotone`,
radial blur, and `colorAdjustment`/`curves` being image-fill-only — is now
closed.** The remaining tiers are the exotica.

---

## A note on primitives before you cost anything

**This CanvasKit build has no `MakeMatrixConvolution` and no `MakeTableARGB`** —
neither symbol exists in `packages/canvaskit/canvaskit.js`. An earlier version of
this document costed most of Tier 1 against those two, which was wrong: any
convolution or LUT-shaped effect needs an SkSL shader on the `surface: "shader"`
path instead. That is a well-trodden path (nine of the effects above take it),
but it is 80–150 lines rather than 40, and it costs a full-surface shader pass
rather than composing into the neighbouring `ImageFilter` chain.

What *is* available and cheap: `ColorFilter.MakeMatrix` (any affine colour
transform — `duotone` and `colorAdjustment` ride this), `MakeDilate` / `MakeErode`,
`MakeDisplacementMap`, `MakeBlur`, `MakeBlend`, `MakeMatrixTransform`, and
`Shader.MakeTurbulence` / `MakeFractalNoise`.

## Tier 1 — cheap against the primitives that do exist

| Effect | Approach | Notes |
|---|---|---|
| `emboss` / `bevel` | SkSL 3×3 convolution | `edges` is the template; same tap layout, different kernel |
| `dilate`, `erode` | native `MakeDilate` / `MakeErode` | ~20 lines each — but see the layer-bounds caveat under `outline` in the docs |
| `solarize` | SkSL per-pixel remap | `threshold` is the template |
| `gradientMap` | SkSL ramp | `duotone` generalised past two stops; needs an N-stop uniform array |
| `hueRotate` / `saturation` | `ColorFilter.MakeMatrix` | genuinely ~40 lines; `saturation` already exists inside `colorAdjustment` |
| `turbulentDisplace` | FractalNoise + DisplacementMap | `scatter` is already 90% of this |
| `boxBlur` | MakeBlur / convolution | `iterations` |
| `tile` / `motionTile` | TileMode + MatrixTransform | `pixelate` already does the transform pair |
| `displacementMap` (image source) | MakeDisplacementMap | needs the asset plumbing in Tier 3.2 |

## What a shader effect actually costs (measured)

Worth knowing before designing anything that stacks effects, because the code
reads alarming and the measurement doesn't.

Each foreground shader effect allocates its **own full-surface offscreen** and
repaints the **whole canvas** through its lens (`openForegroundCapture` /
`paintShaderInDeviceSpace` in `packages/web/src/render-context.ts`). Nothing
about that scales with the node: a 300 px badge and a 1000 px card cost the
same, and an N-effect chain is N canvas-sized passes.

That reads like a trap for any composition layer. It measures as a non-issue.
Exporting 90 frames at 1920×1080, interleaved rounds, median of 5:

| Chain | vs. no effects |
|---|---|
| 1 shader effect | +0.1 ms/frame |
| 4 shader effects | lost in the noise |
| 8 shader effects | lost in the noise (≤ ~1.3 ms/frame worst case) |
| `outline` at width 40 (multi-tap) | +0.15 ms/frame |
| 4 colour-matrix filters | ~0 (they compose into one ImageFilter) |

Run-to-run spread on that harness is ±20%, larger than every delta above — eight
stacked full-canvas shader passes cannot be distinguished from zero effects
across a real export, where evaluation, readback and video encoding dominate at
~4.4 ms/frame.

**So: don't pre-optimise the scope path.** Bounding the offscreen to the node
would need every handler to declare how far it bleeds outward (`outline`,
`radialBlur` and `grain` all read or write past the node box), and it risks
clipping children drawn outside their parent's layout box — real complexity and
real risk, to buy back something currently unmeasurable. Revisit only if a
profile on a genuinely heavy project says otherwise, or if 4K + deep chains
become common.

## Known limitation: filters and shaders don't interleave

Effects come in two kinds — `"filter"` ones compose into a Skia `ImageFilter`,
`"shader"` ones open a snapshot-and-redraw scope. **Within** each kind, author
order is respected. **Between** them it is not: filters ride the node's transform
layer, which is outside every shader scope, so *every filter runs after every
shader* however the chain was written.

Measured, not inferred: `Effects.grayscale(1).bitCrush({ palette: 'gameboy' })`
comes out pure grey (mean chroma 0.0). Authored order would give greens — the
grayscale ran last.

It mostly doesn't bite, because the common chains put colour grading last anyway,
and it is *not* what made `Presets.gameboy` wrong (that was shader-vs-shader
order, since fixed). But `colorAdjustment(...).ascii(...)` cannot boost contrast
*into* an ascii pass, and no amount of reordering the chain will make it.

The workaround today is a nested node — the inner node's shaders resolve before
the outer node's filters:

```tsx
<Rect effects={FX.colorAdjustment({ contrast: 1.6 })}>
    <Rect effects={FX.ascii(12)}>…</Rect>
</Rect>
```

Fixing it properly means segmenting the filter chain around each shader scope in
`transform()` / `applyContentEffectScope` — applying the filters authored *before*
a shader inside that scope and the rest outside. Worth doing, and worth doing on
its own: it changes rendering for any mixed chain.

## Tier 2 — one SkSL shader each

Registry-driven shader dispatch is in place, so each of these is a `makeShader`
handler and a `surface: "shader"` declaration — no dispatch edits. `halftone` and
`dither` shipped from this tier; the rest are unbuilt.

**Halftone & print** — `crosshatch` · `stipple` · `benDay` · blue-noise dithering
(the ordered/Bayer half is done)

**Distort** — `twirl` · `wave` / `ripple` · `polarCoords` · `kaleidoscope` /
`mirror` · `glassRefract` · `lensDistortion` · `roughenEdges` · `sphere`

**Blur variants** — `bokeh` / `lensBlur` (bladed aperture) · `tiltShift` ·
`surfaceBlur` (bilateral)

**Glitch & digital** — `pixelSort` (bounded-pass approximation) is all that's
left here. `rgbShift`, `scanlines`, `blockDisplace` and `bitCrush` shipped; the
composite `glitch` they were meant to feed is better expressed as a preset than
as a fifth effect, so it moved to Tier 4.

**Painterly** — `oilPaint` (Kuwahara) · `stainedGlass` (Voronoi) · `lowPoly` ·
`contour` / `isoline`

**Colour & keying** — `chromaKey` · `selectiveColor` / `colorReplace`

## Tier 3 — needs a new engine capability

The capability is the real unit of work; each one unlocks a family.

1. ~~**Glyph-atlas textures**~~ — **done.** `EffectHandler.resources()` lets a
   handler bake extra textures and receive them as child shaders, with an
   `EffectResources` context (font registry, font epoch, offscreen surfaces).
   `ascii` ships on it, with the charset baked once per charset/font/cell-size.
   `braille` and `hex`/`binary` are charsets of that same effect rather than
   separate ones; `crossStitch`/`embroidery` still want Tier 3.5 textures.

   Two things the build taught, worth knowing before the next user of the hook:
   this CanvasKit ships **no default typeface**, so an unregistered family bakes
   a *blank* texture that looks identical to an empty charset — the baker falls
   back to the first registered family and warns on missing glyphs. And a
   charset outside Latin (blocks, braille) silently loses ramp steps in a font
   that doesn't cover it, which is why `standard` is plain ASCII.
2. **Asset-loaded effect inputs** → `lut` (`.cube` / hald). Now the *cheapest*
   remaining capability, because it reuses `resources()` wholesale — the hook
   already hands a handler extra child shaders; this only adds a way to declare
   an asset dependency and receive it as a texture. Would also give `curves` an
   exact LUT instead of its current linear fit.
3. **Node-as-texture references** → `displacementMap` driven by a sibling
   subtree, `depthBlur`. Requires rendering another node to an offscreen surface.
4. **Frame history buffer** → scene-level `echo` / `trails` / `feedback`.
   Distinct from `VideoFilters.echo`, which re-reads *source* frames; this needs
   past *rendered* frames. `NodeRenderState`'s velocity plumbing (used by
   `motionBlur`) is the closest existing precedent, and `EffectGeometry.time`
   (added for animated `grain`) is the first step toward per-frame state in a
   handler.
5. **Bundled texture library** (paper, canvas, fabric normals) → most of Tier 4.
   Carries a licensing decision, given the repo's Apache-2.0 / BSD-3-Clause split.

## Tier 4 — craft, textile & material presets

**The `Presets` layer shipped.** Named recipes returning an `EffectChain`, each
driven by a single `amount` where 0 is a no-op and 1 the full look:
`Presets.riso({ amount: 0.8 })`. Eight to start — `riso`, `newsprint`,
`blueprint`, `photocopy`, `vhs`, `crt`, `glitch`, `gameboy`.

Writing them settled three things that were open questions here:

- **Order is load-bearing** — and it turned out the renderer was running shader
  chains *backwards*. Building `gameboy` is what caught it: the output carried
  dither's quantization levels and not one palette colour. Fixed, with an
  `effect-chain-order` e2e scene guarding it.
- **Every ingredient needs a neutral setting** to ramp from, or `amount: 0`
  isn't a no-op. `threshold` has none (its output is grey at every setting), so
  `photocopy` uses `grayscale` + `posterize` instead. This is the real
  constraint on recipe design.
- **Discrete choices don't ramp.** A palette is held fixed and faded in by
  whatever scalar ingredient carries it.

What's left in this tier needs texture assets (Tier 3.5) rather than more
composition:

**Paper & print** — `paper` · `paperCut` · `letterpress` · `screenPrint` ·
`thermalPrint` · `stamp`. The first four want a paper or impression texture;
`screenPrint` and `thermalPrint` are close to buildable today.

**Textile** — `canvas` · `linen` / `weave` · `denim` · `knit` · `crochet` ·
`crossStitch` · `embroidery` · `felt` · `quilt` / `patchwork`. All need either
fabric normals (3.5) or the glyph atlas (3.1).

**Drawn & painted** — `chalk` · `charcoal` · `pencilSketch` · `watercolor` ·
`oilPainting` · `comic`. `pencilSketch` and `comic` are mostly `edges` +
`threshold` + `halftone` and could ship now; the rest want paper texture or the
painterly Tier 2 shaders.

**Screen & optical** — `neon` · `godRays` · `lensFlare` · `anamorphicGlare`
(`crt` and `vhs` shipped). These want a bloom variant with directional streaks
more than they want new composition.

---

## What to build next

**1. Asset-loaded effect inputs (Tier 3.2).** Much cheaper than it was: the
`resources()` hook built for `ascii` already hands a handler extra textures, so
this is the asset-dependency declaration and little else. Gives `lut` (`.cube`)
as a headline feature and makes `curves` exact rather than a linear fit. Pairs
with 3.5 (bundled textures) to unblock most of the rest of Tier 4 — but 3.5
carries the Apache-2.0 / BSD-3-Clause licensing decision, which is a call for a
human rather than something to pick a texture pack for.

**1b. Interleave filters and shaders** (see the limitation above). Not a new
effect, but it is what stops `colorAdjustment(...).ascii(...)` from meaning what
it reads as, and it will keep surprising people as chains get longer.

**2. The distort cluster** — `twirl` · `wave`/`ripple` · `polarCoords` ·
`kaleidoscope`. The largest remaining Tier 2 group: well-understood shaders,
visually striking, no new plumbing. They just don't compound with anything else.

**3. More presets from what already exists** — `screenPrint`, `thermalPrint`,
`pencilSketch`, `comic` are all compositions of shipped effects and cost a
handful of lines each now the layer exists.

Then `tiltShift`, `chromaKey`, the painterly set, and the glyph atlas (3.1) for
`ascii`.

## Adding an effect

Three files, since the registry merge:

1. `packages/core/src/attributes/shape/effects/implementations/<name>.ts` — the
   data interface plus its `EffectData` (`lerp`, `equals`, and `surface` if it
   resamples pixel positions).
2. Add it to `union.ts` and the `EFFECTS` map in `registry.ts`, and export the
   type and its builder options from `index.ts`.
3. `packages/web/src/effects/<name>.ts` — an `EffectHandler` with
   `makeImageFilter` and/or `makeShader`, registered in
   `packages/web/src/effects/registry.ts`.

Then a builder method on `EffectChain` (the `Effects` entry point delegates, so
the signature is written once), a scene in `packages/e2e/src/scenes/` (plus its
row in `FEATURES.md` and both catalog files), a showcase scene in
`packages/template/src/projects/effects/scenes/`, and a page under
`packages/site/content/docs/effects/`.

Two things worth knowing before you write the shader:

- **Colour options** are stored as authored (`Color`, not a parsed tuple) so a
  theme alias still resolves at render time; use `resolveEffectColor` /
  `sameEffectColor` in `lerp`/`equals`, mirroring the `resolveEffectAxis` pair.
- **Px-valued options** are authored in logical px but a `makeShader` handler runs
  in device space — multiply by `EffectGeometry.scale`, or the effect will
  silently change thickness with the device pixel ratio.
