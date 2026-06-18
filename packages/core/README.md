# @motion-script/core

The engine-agnostic animation library at the heart of [Motion Script](https://motionscript.dev).
It provides the scene graph, generator-driven animation runtime, reactive
signals, tweening, flex layout, and the JSX runtime used to describe scenes
declaratively independent of any particular rendering backend with zero dependencies.

```tsx
import { Scene, createRef, Rect, Ellipse } from '@motion-script/core';

export class ShapeScene extends Scene {
  *build() {
    const lens = createRef<Ellipse>();

    this.add(
      <Rect width={400} height={400} fill="white" cornerRadius={20}>
        <Ellipse ref={lens} x={200} y={200} width={350} height={350} />
      </Rect>,
    );

    yield* lens().to({ x: 700 }, 3);
  }
}
```

## What's in here

- **Nodes** — the scene graph (`Scene`, `Rect`, `Ellipse`, `Txt`, paths, and
  more) with attributes for fills, gradients, filters, and SkSL shader effects.
- **Runtime** — drives animations from generators: `yield*` a tween or signal
  change and the engine advances time, interpolating attributes frame by frame.
- **Signals** — reactive values that nodes and tweens can depend on.
- **Tweens** — interpolation and easing for animating attributes over time.
- **Layout** — a flexbox-based layout system for positioning nodes.
- **JSX runtime** — lets scenes be authored as TSX (`./jsx/jsx-runtime`,
  `./jsx/jsx-dev-runtime`).
- **Project / render / platform / assets** — the abstractions a rendering
  backend (such as [`@motion-script/web`](../web)) implements to turn a scene
  graph into pixels, audio, and exported video.

This package has no rendering backend of its own — pair it with
[`@motion-script/web`](../web) (Skia/CanvasKit) or build your own backend
against the `platform`/`render` abstractions.

## Usage

```bash
npm install @motion-script/core
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
pnpm --filter @motion-script/core build
pnpm --filter @motion-script/core test
```

