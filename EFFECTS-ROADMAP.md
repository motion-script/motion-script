# Effects roadmap

What Motion Script renders today, what it's missing, and what each missing piece
actually costs to build against *this* engine.

Tiers are ordered by implementation cost, not by desirability — Tier 1 items need
no new plumbing at all, Tier 3 items each unlock a whole family but need a new
engine capability first.

## Shipping today (30)

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

1. **Glyph-atlas textures** → `ascii`, `braille`, `hex`/`binary`, and every
   glyph-driven craft effect (`crossStitch`, `embroidery`). Bake a charset to an
   offscreen surface once and hand it to the shader as a child. Needs
   `EffectHandler` to grow an optional `resources()` hook plus a cache keyed by
   charset + font + cell size.
2. **Asset-loaded effect inputs** → `lut` (`.cube` / hald). The asset manifest
   already loads images; effects need a way to declare an asset dependency and
   receive it as a texture. Would also give `curves` an exact LUT instead of its
   current linear fit.
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

These are *compositions*, not new primitives, which argues for a **`Presets`
layer**: named recipes returning an `EffectChain`, each driven by a single
`amount` — `Presets.riso({ amount: 0.8 })`. With Tier 1 now covering the
ingredients (`halftone` + `duotone` + `grain` + `threshold` already compose into
riso, newsprint, screen-print and blueprint looks), this is the cheapest
remaining tier and the natural home for the looks people ask for by name — and
the cost measurement above says a 3–5 effect recipe is affordable.

**Both headline families are now buildable.** The paper & print looks compose
from `halftone` + `duotone` + `grain` + `threshold`; `crt`, `vhs` and `glitch`
compose from `scanlines` + `rgbShift` + `blockDisplace` + `bitCrush` +
`chromaticAberration`. The template's `retro-vhs` scene is the recipe written
out by hand — turning that into `Presets.vhs({ amount })` is the remaining work.

Two things that recipe surfaced, worth encoding in the preset layer rather than
rediscovering per look:

- **Order is load-bearing.** `blockDisplace` must precede `rgbShift`, so torn
  bands carry their own fringe instead of an intact fringe being painted over a
  broken image. Scanlines and grain go last, because a screen adds them to
  whatever it is displaying.
- **A single `amount` can't drive everything linearly.** Grain and scanline
  darkness want to ramp; a palette or a kernel choice can't. Presets need a
  notion of which ingredients scale and which simply switch on.

**Paper & print** — `paper` · `paperCut` · `newsprint` · `riso` · `letterpress` ·
`screenPrint` · `xerox` / `photocopy` · `thermalPrint` · `blueprint` · `stamp`

**Textile** — `canvas` · `linen` / `weave` · `denim` · `knit` · `crochet` ·
`crossStitch` · `embroidery` · `felt` · `quilt` / `patchwork`

**Drawn & painted** — `chalk` · `charcoal` · `pencilSketch` · `watercolor` ·
`oilPainting` · `comic`

**Screen & optical** — `crt` · `vhs` · `neon` · `godRays` · `lensFlare` ·
`anamorphicGlare`

---

## What to build next

**1. The `Presets` layer.** Both families it needs are now stocked, and the cost
measurement says a 3–5 effect recipe is affordable. This is the change that makes
thirty effects add up to more than their parts, and it is the one users ask for
by name.

**2. Tier 3.2, asset-loaded effect inputs.** The only item that *repairs*
something shipped: `curves` is a least-squares linear fit because this build has
no LUT colour filter, so an S-curve flattens to its average slope. Real texture
inputs give `lut` (`.cube`) as a headline feature and make `curves` exact.

**3. The distort cluster** — `twirl` · `wave`/`ripple` · `polarCoords` ·
`kaleidoscope`. Well-understood shaders, visually striking, and the largest
remaining Tier 2 group; they just don't compound with anything else.

Then `tiltShift`, `chromaKey`, and the painterly set.

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
