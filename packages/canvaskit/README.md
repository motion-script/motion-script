# @motion-script/canvaskit

A custom WASM build of [Skia's CanvasKit](https://skia.org/docs/user/modules/canvaskit/) tailored for [Motion Script](https://github.com/koliveiradev/motion-script).

## What makes this build different

### Variable font support

The upstream CanvasKit build resolves typefaces via `matchFamilyStyle`, which ignores the `wght` axis on variable font weight variations have no effect. This build patches the font and typeface APIs to correctly apply variable font axes (including `wght`) by using `TextStyle.fontVariations` together with each run's positioned typeface. This makes weight tweens and other axis animations work as expected.

### WebCodecs instead of built-in image codecs

The standard CanvasKit ships with Skia's own image encoders and decoders (PNG, JPEG, WebP, etc.), which adds significant WASM binary size. This build removes those codecs entirely. Image encoding and decoding is delegated to the browser's [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) and native browser primitives (`ImageDecoder`, `VideoFrame`, `ImageBitmap`), which are hardware-accelerated and available in all modern browsers.

The result is a smaller WASM binary and better runtime performance for image-heavy compositions.

## Usage

This package is consumed internally by `@motion-script/player` and `@motion-script/core`. You generally do not need to install it directly.

```ts
import CanvasKitInit from "@motion-script/canvaskit";

const CanvasKit = await CanvasKitInit({
  locateFile: (file) => `/path/to/wasm/${file}`,
});
```

The `.wasm` file must be served separately. When using the Motion Script Vite plugin it is handled automatically.


