# Motionscript

**Motion Script** is a TypeScript/JSX framework for making videos with code.
Describe animations as scenes made of nodes, signals, and tweens, then preview
them live in the browser and export straight to MP4 — no timeline UI, no
keyframe panel, just a codebase you can version, review, and generate.

`motion-script` is the flagship, all-in-one package: it bundles
[`@motion-script/core`](../core) (the scene graph, animation runtime, signals,
layout, and JSX runtime) together with [`@motion-script/code`](../components/code)
(animated code blocks) and [`@motion-script/latex`](../components/latex)
(animated LaTeX) behind a single import, so most projects only need this one
dependency.

## Getting started

The fastest way to start is the scaffolding tool — it sets up a project,
Vite plugin, and example scene for you:

```bash
npm create @motion-script@latest
```

```bash
cd my-video
npm install
npm run dev
```

That's it — you'll have a live-reloading preview running locally. Open it up
and start editing the example scene to see your changes animate instantly.

## Quick example

```tsx
import { createScene, createRef, Rect, Ellipse } from 'motion-script';

export default createScene(function* (stage) {
  const lens = createRef<Ellipse>();

  stage.add(
    <Rect width={400} height={400} fill="white" cornerRadius={20}>
      <Ellipse ref={lens} x={200} y={200} width={350} height={350} />
    </Rect>,
  );

  // Animate: tween the ellipse to x=700 over 3 seconds.
  yield* lens().to({ x: 700 }, 3);
});
```

Animations are driven by generators: `yield*` a tween and the engine advances
time, interpolating attributes frame by frame. Reactive signals, flex layout,
fills, gradients, filters, SkSL shader effects, paths, text, audio, animated
code, and animated LaTeX are all supported. See the
[docs](https://motionscript.dev/docs) for the full feature set.

## What's in here

- **Scene & project**: `createScene`, `createProject`, and the `Scene` /
  `Stage` types that describe and run an animation.
- **Nodes**: geometry (`Rect`, `Ellipse`, `Line`, `Path`, `Polygon`,
  `Polygram`, `LineGrid`, `Grid`, `MaskGroup`, `BooleanGroup`), text (`Text`,
  `RichText`, `NumberNode`), layout (`Row`, `Column`, `Camera`), and media
  (`Image`, `Video`).
- **Animation**: timing and control (`wait`, `sequence`, `parallel`,
  `tween`), easing (`linear`, `easeIn`, `easeOut`, `easeInOut`), and
  interpolation (`lerpNumber`).
- **Signals**: `Signal`, `createSignal`, reactive values that nodes and
  tweens can depend on.
- **Styling & effects**: `Fills`, `Effects`, `ImageFilters`, `VideoFilters`,
  `AudioFilters`, plus the `Stroke`/`Shadow`/`Corners` attribute types.
- **Audio**: the `Sound` node.
- **Utilities**: `createRef`, `clamp`, `generateList`, `createContext`,
  `Random`, the `@property` decorator.
- **`Code`** (from `@motion-script/code`): syntax-highlighted, token-level
  animated code blocks.
- **`Latex`** (from `@motion-script/latex`): animated LaTeX formulas that
  morph between states.
- **JSX runtime**: `motion-script/jsx-runtime` and
  `motion-script/jsx-dev-runtime`, so scenes can be authored as TSX.

This package has no rendering backend of its own. Pair it with
[`@motion-script/web`](../web) (Skia/CanvasKit) directly, or use
[`@motion-script/react`](../react) / the bundled player for a ready-made
preview and export UI.

## Manual installation

Already have a project and just want the library? Install it directly and
pair it with a rendering backend such as [`@motion-script/web`](../web):

```bash
npm install motion-script
```

See the [docs](https://motionscript.dev/docs) for the full feature set and API
reference.

## Development

From the monorepo root:

```bash
pnpm --filter motion-script build
pnpm --filter motion-script test
```
