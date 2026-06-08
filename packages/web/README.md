# @motion-script/web

The browser rendering backend for [Motion Script](https://motionscript.dev),
built on Skia via [`@motion-script/canvaskit`](../canvaskit). It implements the
`platform`/`render` abstractions from [`@motion-script/core`](../core) so
scenes can be drawn to a canvas, played back with synchronized audio, and
exported to video all in the browser.

## What's in here

- **Render context** — `WebRenderContext` draws the `@motion-script/core` scene
  graph (shapes, fills, strokes, effects, text, video, masks) onto a CanvasKit
  surface.
- **Exporter** — `exportScenesAsVideo` renders one or more scenes offline and
  muxes video and audio into an MP4 using [mediabunny](https://github.com/Vanilagy/mediabunny).
- **Audio** — `WebAudioPlayer` drives playback through the Web Audio API.
- **Storage / assets** — `WebStorageAdapter` and `WebMeasureScope` implement the
  asset-loading and text-measurement abstractions `@motion-script/core` needs.
- **Clock** — `WebMasterClock` synchronizes scene playback to `requestAnimationFrame` while calculating dt from audio context to ensure audio and animation line up.
- **CanvasKit access** — `getCanvasKit` loads and caches the CanvasKit/Skia
  WebAssembly module used for rendering.

## Usage

```bash
npm install @motion-script/web @motion-script/core @motion-script/canvaskit
```

For a guided setup, scaffold a project instead with:

```bash
npm create motion-script@latest
```

See the [docs](https://motionscript.dev/docs) for the full feature set and API
reference.

## Development

From the monorepo root:

```bash
pnpm --filter @motion-script/web build
pnpm --filter @motion-script/web test
```

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the architecture overview.
