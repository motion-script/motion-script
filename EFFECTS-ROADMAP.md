# Effects roadmap

What Motion Script renders today, what it's missing, and what each missing piece
actually costs to build against *this* engine.

Tiers are ordered by implementation cost, not by desirability — Tier 1 items need
no new plumbing at all, Tier 3 items each unlock a whole family but need a new
engine capability first.

## Shipping today (14)

`blur` · `directionalBlur` · `grayscale` · `pixelate` · `bulge` · `magnify` ·
`bloom` · `vintage` · `chromaticAberration` · `invert` · `scatter` · `posterize` ·
`motionBlur` · `sksl` (custom shader escape hatch)

Plus seven media filters on image/video fills (`exposure`, `blur`, `grayscale`,
`alpha`, `colorMatrix`, `curves`, `colorAdjustment`) and two video-only temporal
filters (`posterizeTime`, `echo`).

**The gaps that stand out before any exotica:** no `vignette`, no `grain`, no
`sharpen`, no `outline`, no edge detect, no `threshold`, no `duotone`, and no
radial/zoom blur. `colorAdjustment` and `curves` exist only for image fills, not
as scene effects — so you can grade a photo but not a group of shapes.

---

## Tier 1 — Skia already has the primitive

No new plumbing: each is a handler object plus one `EffectRegistry.register` call,
roughly 40–80 lines, built from `MakeMatrixConvolution` / `MakeDilate` /
`MakeErode` / `MakeTableARGB` / `ColorFilter.MakeMatrix` / `MakeDisplacementMap` /
`Shader.MakeTurbulence`.

| Effect | Primitive | Notes |
|---|---|---|
| `sharpen` / `unsharpMask` | MatrixConvolution | |
| `edges` | MatrixConvolution | Sobel / Laplacian / Prewitt selected by a `kernel` option |
| `emboss` / `bevel` | MatrixConvolution | |
| `dilate`, `erode` | native `MakeDilate` / `MakeErode` | ~20 lines each |
| `outline` | dilate − source, blended | `width`, `color`, `position: 'outside' \| 'center' \| 'inside'` |
| `threshold` | TableARGB | `level`, `smoothness` |
| `solarize` | TableARGB | |
| `gradientMap` / `duotone` | TableARGB, or a small SkSL ramp | maps luminance through a colour ramp |
| `hueRotate` / `saturation` | `ColorFilter.MakeMatrix` | |
| `curves` | TableARGB | **promote** — the maths already exists in `web/src/fills/filters/curves.ts` |
| `colorAdjustment` | ColorMatrix | **promote** — already in `web/src/fills/filters/color-adjustment.ts` |
| `vignette` | radial gradient + multiply | currently reachable only as a sub-field of `colorAdjustment` |
| `grain` / `filmGrain` | `MakeTurbulence` + `MakeBlend` | `animated`, `seed`, `colored` |
| `turbulentDisplace` | FractalNoise + DisplacementMap | `scatter` is already 90% of this |
| `boxBlur` | MakeBlur / convolution | `iterations` |
| `tile` / `motionTile` | TileMode + MatrixTransform | `pixelate` already does the transform pair |
| `displacementMap` (image source) | MakeDisplacementMap | the asset manager already loads images |

## Tier 2 — one SkSL shader each

Registry-driven shader dispatch is in place, so each of these is a `makeShader`
handler and a `surface: "shader"` declaration — no dispatch edits.

**Halftone & print** — `halftone` (dot/line/cross, per-channel screen angles) ·
`dither` (bayer 2/4/8, blue-noise, palette quantise) · `crosshatch` · `stipple` ·
`benDay`

**Distort** — `twirl` · `wave` / `ripple` · `polarCoords` · `kaleidoscope` /
`mirror` · `glassRefract` · `lensDistortion` · `roughenEdges` · `sphere`

**Blur variants** — `radialBlur` (zoom + spin) · `bokeh` / `lensBlur` (bladed
aperture) · `tiltShift` · `surfaceBlur` (bilateral)

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
   receive it as a texture.
3. **Node-as-texture references** → `displacementMap` driven by a sibling
   subtree, `depthBlur`. Requires rendering another node to an offscreen surface.
4. **Frame history buffer** → scene-level `echo` / `trails` / `feedback`.
   Distinct from `VideoFilters.echo`, which re-reads *source* frames; this needs
   past *rendered* frames. `NodeRenderState`'s velocity plumbing (used by
   `motionBlur`) is the closest existing precedent.
5. **Bundled texture library** (paper, canvas, fabric normals) → most of Tier 4.
   Carries a licensing decision, given the repo's Apache-2.0 / BSD-3-Clause split.

## Tier 4 — craft, textile & material presets

These are *compositions*, not new primitives, which argues for a **`Presets`
layer**: named recipes returning an `EffectChain`, each driven by a single
`amount` — `Presets.riso({ amount: 0.8 })`. Cheap once Tiers 1–3 land, and the
natural home for the looks people actually ask for by name.

**Paper & print** — `paper` · `paperCut` · `newsprint` · `riso` · `letterpress` ·
`screenPrint` · `xerox` / `photocopy` · `thermalPrint` · `blueprint` · `stamp`

**Textile** — `canvas` · `linen` / `weave` · `denim` · `knit` · `crochet` ·
`crossStitch` · `embroidery` · `felt` · `quilt` / `patchwork`

**Drawn & painted** — `chalk` · `charcoal` · `pencilSketch` · `watercolor` ·
`oilPainting` · `comic`

**Screen & optical** — `crt` · `vhs` · `neon` · `godRays` · `lensFlare` ·
`anamorphicGlare`

---

## If you only build ten

`outline` · `vignette` · `grain` · `sharpen` · `edges` · `duotone`/`gradientMap` ·
`radialBlur` · `threshold` · `halftone` · `dither`

The first eight are Tier 1 — days, not weeks. The last two are the
highest-demand Tier 2 shaders.

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
the signature is written once), a scene in `packages/e2e/src/scenes/`, and a page
under `packages/site/content/docs/effects/`.
