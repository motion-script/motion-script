<div align="center">

<img src="assets/logo_label.png" alt="Motion Script" width="320" />


An open-source motion design tool, inspired by tools like Manim and Motion Canvas, that helps
developers and educators create animations from the browser. 

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@motion-script/create.svg)](https://www.npmjs.com/package/@motion-script/create)

[Documentation](https://motionscript.dev/docs) ·
[API Reference](https://motionscript.dev/api) ·
[Contributing](CONTRIBUTING.md)

</div>

## What is Motion Script?

Motion Script lets you describe animations as TypeScript/JSX scenes and render
them in real time in the browser. You write declarative scene code; the engine
turns it into frames using a Skia (CanvasKit) rendering backend, and the bundled
player gives you a timeline-based editor to preview, scrub, and export.

```tsx
import { createScene, createRef, Rect, Ellipse } from 'motion-script';

export default createScene(function* (stage) {
  const ref = createRef<Ellipse>();

  stage.add(
    <Rect width={400} height={400} fill="white" cornerRadius={20}>
      <Ellipse ref={ref} x={200} y={200} width={350} height={350} />
    </Rect>
  );

  // Animate: tween the ellipse to x=700 over 3 seconds.
  yield* ref().to({ x: 700 }, 3);
});
```

Animations are driven by generators: `yield*` a tween and the engine advances
time, interpolating attributes frame by frame. Reactive signals, flex layout,
fills, gradients, filters, SkSL shader effects, paths, text, animated code,
animated LaTeX, and audio are all supported. See the
[docs](https://motionscript.dev/docs) for the full feature set.

## Getting started

Scaffold a new project with the `create` CLI:

```bash
npm create motion-script@latest
# or: pnpm create motion-script
# or: yarn create motion-script
```

Then:

```bash
cd my-video
npm install
npm run dev
```

This launches a Vite dev server with the Motion Script player. Edit the scenes
in `src/`, and the preview updates with hot reload.

For a full walkthrough, see the [Getting Started guide](https://motionscript.dev/docs/getting-started).

## Documentation

- **Guides & tutorials:** [motionscript.dev/docs](https://motionscript.dev/docs)
- **API reference:** [motionscript.dev/api](https://motionscript.dev/api)

## Packages

This is a pnpm + Turborepo monorepo. The published pieces:

| Package | Description |
| --- | --- |
| [`motion-script`](packages/motion-script) | **The flagship package.** Bundles core, code, and LaTeX behind one import. The recommended way to depend on Motion Script. |
| [`@motion-script/core`](packages/core) | The engine-agnostic animation library: scenes, nodes, signals, tweens, layout, and the JSX runtime. |
| [`@motion-script/web`](packages/web) | Web rendering backend built on Skia/CanvasKit, plus the video exporter and audio playback. |
| [`@motion-script/canvaskit`](packages/canvaskit) | A WASM build of Skia's CanvasKit API, packaged for Motion Script. |
| [`@motion-script/react`](packages/react) | React bindings for embedding Motion Script. |
| [`@motion-script/player`](packages/player) | The timeline-based editor/player UI. |
| [`@motion-script/vite-plugin`](packages/vite-plugin) | Vite plugin that boots the player app around your project and wires up assets. |
| [`@motion-script/engine`](packages/engine) | Renders projects to video and stills from a Node server: a warm Vite server plus a pool of headless Chromium pages, with bounded concurrency, cancellation, and coded errors. |
| [`@motion-script/cli`](packages/cli) | Headless command-line exporter for rendering scenes to video or stills. |
| [`@motion-script/code`](packages/components/code) | Syntax-highlighted code block component for use in scenes. |
| [`@motion-script/latex`](packages/components/latex) | LaTeX math rendering component for use in scenes. |
| [`@motion-script/create`](packages/create) | The project scaffolding CLI. |

Plus internal workspaces: [`site`](packages/site) (the Next.js docs site),
[`e2e`](packages/e2e) (visual regression tests), and
[`template`](packages/template) (an example project used during development).

## Developing the monorepo

Prerequisites: Node.js (LTS) and [pnpm](https://pnpm.io/).

```bash
git clone https://github.com/motion-script/motion-script.git
cd motion-script
pnpm install
pnpm build   # build all packages (turbo)
pnpm test    # run the test suites
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture overview and the
package-by-package development workflow.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and
architecture, and the [Code of Conduct](CODE_OF_CONDUCT.md) for community
expectations.

## License

Motion Script is licensed under the [Apache License 2.0](LICENSE). The
`@motion-script/canvaskit` package wraps Skia's CanvasKit and is distributed
under the BSD-3-Clause license.
