# @motion-script/react

React bindings for [Motion Script](https://motionscript.dev), drop a scene
into your app and play it back with a `<canvas>`-based player backed by
Skia/CanvasKit.

```tsx
import { MotionScriptProvider, MotionPlayer } from '@motion-script/react';
import { MyScene } from './scenes/my-scene';

export function App() {
  return (
    <MotionScriptProvider>
      <MotionPlayer
        initialFrame={0}
        isPlaying
        fps={30}
        viewport={{ width: 1920, height: 1080 }}
        scenes={[new MyScene()]}
        assets={{}}
      />
    </MotionScriptProvider>
  );
}
```

## What's in here

- **`MotionScriptProvider`** — initializes CanvasKit (the Skia/WASM runtime)
  and makes it available to players via context. Wrap your app (or the part of
  it that renders Motion Script content) in this once.
- **`useMotionScript`** — hook for reading CanvasKit initialization state from
  the provider.
- **`MotionPlayer`** — renders a `Scene[]` to a `<canvas>`, drives playback
  (play/pause/seek/speed/mute), and exposes an imperative `FrameHandle` (via
  `ref`) for screenshotting, scrubbing, and inspecting build errors and node
  state.

This package builds on [`@motion-script/core`](../core) (the scene graph and
animation runtime) and [`@motion-script/web`](../web) (the Skia/CanvasKit
rendering backend).

## Usage

```bash
npm install @motion-script/react
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
pnpm --filter @motion-script/react build
pnpm --filter @motion-script/react dev
```

