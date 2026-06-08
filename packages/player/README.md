# @motion-script/player

A visual editor and preview app for [Motion Script](https://motionscript.dev)
projects, scrub the timeline, inspect the scene graph, tweak nodes, and
export video, all backed by the same Skia/CanvasKit renderer your scenes run
on in production.

## What's in here

- **`PlayerApp`** — the editor shell: video preview, timeline with scrubbing
  and zoom, scene/node inspector, export dialog, and theming.
- **Timeline** — a virtualized track view of the scene graph with a ruler,
  audio waveforms, and per-node rows.
- **Export** — render the active project to video directly from the browser.
- **Editor store** — Zustand-backed state for playback, selection, and
  layout, exposed via `editor-provider` and `useEditorStore`.

This package builds on [`@motion-script/core`](../core) (the scene graph and
animation runtime), [`@motion-script/react`](../react) (the `<canvas>` player),
and [`@motion-script/web`](../web) (the Skia/CanvasKit rendering backend).

## Usage

```bash
npm install @motion-script/player
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
pnpm --filter @motion-script/player build
pnpm --filter @motion-script/player dev
```

