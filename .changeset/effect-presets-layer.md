---
"@motion-script/core": minor
"motion-script": minor
---

Add `Presets` — named recipes composing the built-in effects into the looks people ask for by name.

```tsx
node.effects = Presets.vhs(0.8);
node.effects = Presets.riso({ ink: '#0033a0' }).blur(2);   // it's just a chain
```

Eight to start: `riso`, `newsprint`, `blueprint`, `photocopy` (print) and `vhs`, `crt`, `glitch`, `gameboy` (screen). A preset returns a plain `EffectChain`, so it stays transparent, extensible, and needs no new render path.

Every preset takes a single `amount` where **0 is a no-op and 1 is the full look**, so it animates on like any other effect. Holding to that shapes the recipes: each ingredient must have a neutral setting to ramp from — which is why `photocopy` uses `grayscale` + `posterize` rather than `threshold`, whose output is grey at every setting — and discrete choices like a palette stay fixed while a scalar ingredient fades them in.

Also re-exports from the flagship `motion-script` package the effect and options types added alongside the recent effects, which were reachable through `Effects` at runtime but missing from the type surface: `OutlineOptions`, `VignetteOptions`, `GrainOptions`, `SharpenOptions`, `EdgesOptions`, `ThresholdOptions`, `RadialBlurOptions`, `HalftoneOptions`, `DitherOptions`, `DuotoneOptions`, `CurvesOptions`, `ColorAdjustmentOptions`, `RgbShiftOptions`, `ScanlinesOptions`, `BlockDisplaceOptions`, `BitCrushOptions`, their `…Effect` counterparts, and the enums (`OutlinePosition`, `EdgeKernel`, `RadialBlurStyle`, `HalftoneShape`, `DitherMatrix`, `BitCrushPalette`).
