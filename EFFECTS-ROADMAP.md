# Effects roadmap

What Motion Script renders today, what it's missing, and what each missing piece
actually costs to build against *this* engine.

Tiers are ordered by implementation cost, not by desirability — Tier 1 items need
no new plumbing at all, Tier 3 items each unlock a whole family but need a new
engine capability first.

## Shipping today (26)

**Blur & motion** — `blur` · `directionalBlur` · `motionBlur` · `radialBlur`
(zoom/spin)

**Colour & tone** — `grayscale` · `invert` · `posterize` · `threshold` ·
`duotone` · `curves` · `colorAdjustment` · `vintage` · `bloom`

**Detail & texture** — `sharpen` · `edges` (sobel/prewitt/laplacian) · `grain` ·
`scatter` · `pixelate` · `dither` (bayer 2/4/8) · `halftone` (dot/line/cross)

**Shape & light** — `outline` · `vignette` · `bulge` · `magnify` ·
`chromaticAberration`

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

**Glitch & digital** — `glitch` (seeded composite: block displace + RGB shift +
scanline + noise) · `rgbShift` (per-channel `Vector2` offsets) · `scanlines` ·
`blockDisplace` · `bitCrush` / `paletteQuantize` (gameboy/CGA/NES palettes) ·
`pixelSort` (bounded-pass approximation)

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
remaining tier and the natural home for the looks people ask for by name.

**Paper & print** — `paper` · `paperCut` · `newsprint` · `riso` · `letterpress` ·
`screenPrint` · `xerox` / `photocopy` · `thermalPrint` · `blueprint` · `stamp`

**Textile** — `canvas` · `linen` / `weave` · `denim` · `knit` · `crochet` ·
`crossStitch` · `embroidery` · `felt` · `quilt` / `patchwork`

**Drawn & painted** — `chalk` · `charcoal` · `pencilSketch` · `watercolor` ·
`oilPainting` · `comic`

**Screen & optical** — `crt` · `vhs` · `neon` · `godRays` · `lensFlare` ·
`anamorphicGlare`

---

## If you only build ten more

`glitch` · `rgbShift` · `twirl` · `wave`/`ripple` · `kaleidoscope` · `scanlines` ·
`tiltShift` · `bitCrush` · `chromaKey` · a `Presets` layer for Tier 4

Nine Tier 2 shaders plus the composition layer that makes the existing
twenty-six add up to more than their parts.

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
