---
"@motion-script/web": patch
---

Fix foreground shader effects running in **reverse** author order.

A chain of two or more shader-surface effects — `outline`, `vignette`, `grain`, `sharpen`, `edges`, `threshold`, `radialBlur`, `halftone`, `dither`, `rgbShift`, `scanlines`, `blockDisplace`, `bitCrush`, `bulge`, `posterize` — applied its last entry to the raw content first and its first entry last. `Effects.dither().bitCrush({ palette: 'gameboy' })` came out with dither's quantization levels and no palette colours at all, because `bitCrush` ran first and `dither` then re-quantized its output.

The cause: foreground captures opened in array order, making `effects[0]` the *outermost* scope, while content is drawn into the innermost one and scopes unwind inner-first. They now open in reverse, so `effects[0]` is innermost and sees the raw content first — matching the ImageFilter path, where index 0 is likewise applied first.

**This changes rendering** for any node carrying more than one shader effect; single-effect chains, ImageFilter effects (`blur`, `grayscale`, `duotone`, …) and backdrop passes are unaffected. If you had compensated by authoring a chain backwards, reverse it.

`packages/e2e`'s `effect-chain-order` scene guards it: two cards carrying `bitCrush` and `threshold` in opposite orders, which must not match.
