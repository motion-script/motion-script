# Contributing to Motion Script

Thanks for your interest in contributing! This guide covers the project
architecture, local setup, and the workflow for changes. By participating, you
agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

For the user-facing guides and the API reference, see
[motionscript.dev/docs](https://motionscript.dev/docs) and
[motionscript.dev/api](https://motionscript.dev/api).

## Prerequisites

- **Node.js** (LTS recommended)
- **[pnpm](https://pnpm.io/)** — the repo's package manager (pinned via
  `packageManager` in the root `package.json`)

## Initial setup

```bash
git clone https://github.com/motion-script/motion-script.git
cd motion-script
pnpm install
pnpm build
```

`pnpm install` runs a `postinstall` step that copies the CanvasKit WASM binary
into the packages that need it (see [The CanvasKit WASM binary](#the-canvaskit-wasm-binary)).

## Repository layout

Motion Script is a **pnpm workspace** orchestrated by **[Turborepo](https://turbo.build/)**.
Workspaces live under `packages/*` (and `packages/components/*`). The root
`package.json` exposes the top-level scripts:

| Script | What it does |
| --- | --- |
| `pnpm build` | `turbo run build` across all packages |
| `pnpm build-core` | build just `@motion-script/core` |
| `pnpm build-web` | build `@motion-script/web` and its dependencies |
| `pnpm test` | `pnpm -r test` — run every package's tests |
| `pnpm clean` | `turbo run clean` |

## Architecture

Motion Script separates the **animation engine** from the **rendering backend**
from the **editor UI**. This is the key design idea: `core` knows how to evolve
a scene over time but knows nothing about pixels; a rendering backend (today,
`web`) knows how to draw a frame; and the player/plugin layer wires a user's
project into an interactive editor.

```
                        ┌──────────────────────────────┐
   your project  ──────▶│   @motion-script/vite-plugin   │  boots the player app,
   (scenes, project.ts)  │   (dev server + build)         │  aliases your project,
                        └───────────────┬────────────────┘  serves canvaskit.wasm
                                        │
                                        ▼
                        ┌──────────────────────────────┐
                        │   @motion-script/player        │  timeline, scene panel,
                        │   (React editor UI)            │  scrubbing, export controls
                        └───────────────┬────────────────┘
                                        │ uses
                        ┌───────────────┴────────────────┐
                        ▼                                 ▼
        ┌──────────────────────────┐      ┌──────────────────────────────┐
        │   @motion-script/core     │      │   @motion-script/web           │
        │   engine (no rendering)   │◀────▶│   CanvasKit render backend,    │
        │   scenes/nodes/signals/   │      │   exporter, audio              │
        │   tweens/layout/JSX       │      └───────────────┬────────────────┘
        └──────────────────────────┘                      │ wraps
                                                           ▼
                                          ┌──────────────────────────────┐
                                          │   @motion-script/canvaskit     │
                                          │   Skia CanvasKit (WASM)        │
                                          └──────────────────────────────┘
```

### `@motion-script/core` — the engine

The backend-agnostic heart of the library. It has no DOM/canvas dependencies; it
describes *what* should be drawn and *how it changes over time*, leaving the
*how to draw* to a render context. Key areas under `packages/core/src`:

- **`nodes/`** — the scene graph. A base `Node` plus geometry (`Rect`,
  `Ellipse`, `Line`, `Path`, `Polygon`, `Polygram`, `Grid`), text (`Text`,
  `RichText`), media (`Image`), and structural nodes (`Scene`, `Camera`,
  `Boolean`, `Mask`).
- **`attributes/`** — the animatable properties of nodes: layout
  (size/bounds/constraints/padding), shape (fill, stroke, corners, shadow,
  filters/effects, paths), text, and audio. Each attribute knows how to
  interpolate (`lerp`) between values.
- **`signals/`** — the reactive primitive. Values are signals; computed values
  recompute when their dependencies change. This is what makes attributes
  declarative and tween-able.
- **`tween/`** — time-based animation: tweens, easing functions, sequencing
  (`yield*`), `wait`, and the generator-driven timeline. Scenes are generators;
  `yield*`-ing a tween hands control back to the engine to advance time.
- **`layout/`** — flexbox layout and size resolution for laying out child nodes.
- **`render/`** — **render descriptors** and the abstract `RenderContext` /
  `Render2DContext` interface. Descriptors are the contract a backend
  implements; `core` produces them, a backend consumes them. Also `BuildStage`
  and `MeasureScope`.
- **`jsx/`** — the JSX runtime (`jsx-runtime` / `jsx-dev-runtime`) so scenes can
  use JSX to construct the node tree.
- **`project/`** — `createProject({ name, fps, scenes, theme })`, the entry
  point that defines a renderable project.
- **`assets/`** — the asset manifest and manager (fonts, images, audio).
- **`platform/`** — platform seams the backend fills in: the master clock and
  storage adapter.

### `@motion-script/web` — the web rendering backend

Implements `core`'s `RenderContext` against Skia/CanvasKit and provides the
browser-specific machinery. Notable exports (`packages/web/src/index.ts`):

- `WebRenderContext` — draws frames via CanvasKit.
- `getCanvasKit` — loads/initializes the WASM module.
- `CanvasKitEffect` / `CanvasKitEffectRegistry` — SkSL shader effects.
- `exportScenesAsVideo` — encodes rendered frames to video (via `mediabunny`).
- `WebAudioPlayer`, `WebMasterClock`, `WebMeasureScope`, `WebStorageAdapter` —
  the browser implementations of `core`'s platform seams.

### `@motion-script/canvaskit` — Skia WASM

A repackaged WASM build of Skia's CanvasKit (`canvaskit.js` + `canvaskit.wasm`),
licensed BSD-3-Clause. The `.wasm` binary is generated/copied rather than
hand-edited — see below.

### `@motion-script/react` — React bindings

React bindings (`@motion-script/react`) for embedding Motion Script in a React
app. Depends on `core` and `web`.

### `@motion-script/player` — the editor UI

The React app that is the actual editor: timeline, scene panel, node-names
column, playback/scrubbing, and export controls. Built with Tailwind, Base UI,
Zustand, and `wavesurfer.js` (audio). It's a `private` package consumed by the
vite plugin rather than published as a standalone tool.

### `@motion-script/vite-plugin` — the glue

The plugin a user project depends on. It makes `vite` boot the **player app**
(not the user's project directly): it sets the player as the Vite `root`, aliases
`~user-project` / `~user-script` to the user's `project.ts` and entry file,
serves `canvaskit.wasm` in dev (middleware) and emits it on build
(`closeBundle`), builds a virtual asset manifest from the user's `public/`
folder, and resolves React from its own `node_modules` so it works whether or
not the user installed React.

### `create-motion-script` — scaffolding

The `create-motion-script` CLI. Prompts for a project name/path/language, copies
`template-ts` or `template-js`, writes a `vite.config` that registers the plugin,
and pins `@motion-script/*` dependency versions.

### Supporting workspaces

- **`docs`** — the Docusaurus site behind [motionscript.dev](https://motionscript.dev).
- **`e2e`** — Playwright end-to-end tests.
- **`my-video`** — an example project (lots of scene demos) used to exercise the
  engine during development.

## Per-package development

Most library packages support `dev`, `build`, `lint`, `typecheck`, and `test`
(where applicable). Run them inside a package or target one with a filter:

```bash
# work on the engine with a watch build
pnpm --filter @motion-script/core dev

# run the editor against the example project
pnpm --filter @motion-script/player dev

# run core's tests in watch mode
pnpm --filter @motion-script/core test
```

### Build orchestration & tsconfig convention

**Turbo owns build ordering, not TypeScript.** Each package compiles with plain
`tsc -p tsconfig.build.json` (project mode), *not* `tsc -b` (build mode). The
distinction matters: `tsc -b` walks a package's `references` and rebuilds its
dependencies, so running it under Turbo (which *also* builds those dependencies
via `dependsOn: ["^build"]`) makes two processes write the same `dist/`
concurrently — a race that corrupts output and intermittently fails the first
clean build. `tsc -p` compiles only the current package and reads its
dependencies' already-built `dist/*.d.ts`, which Turbo guarantees exist first.

Conventions for a buildable package:

- **Project `references` are for the editor only.** They give the language
  server cross-package go-to-definition. Point a reference at the dependency's
  **`tsconfig.build.json`** (e.g. `{ "path": "../core/tsconfig.build.json" }`),
  never the bare directory — the bare dir resolves to the test-inclusive
  `tsconfig.json` and diverges from what the dependency actually builds.
- **Two tsconfigs:** `tsconfig.json` (test-inclusive, used by the editor and
  `typecheck`) and `tsconfig.build.json` (extends it, excludes tests, the emit
  config that `build` and consumer `references` point at).
- **`tsBuildInfoFile` lives in `dist/`** (`"dist/tsconfig.build.tsbuildinfo"`)
  so Turbo's `dist/**` output cache stores it alongside the emitted files —
  caching `dist` without its buildinfo causes stale-declaration bugs on cache
  restore. Each package's `files` excludes it from the published tarball
  (`"!dist/**/*.tsbuildinfo"`).
- **Scripts:** `build` = `tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json`
  (or `&& vite build` for bundled packages like `react`/`player`);
  `typecheck` = `tsc -p tsconfig.json --noEmit` (or `tsc -b --noEmit` for the
  Vite app/solution packages — safe because the `typecheck` task emits nothing
  and never races on `dist`); `clean` = `rimraf --glob dist .turbo *.tsbuildinfo`.

### Important: the player ships prebuilt

The vite plugin aliases `@motion-script/player` to its **prebuilt `dist/`**. If
you change `core` (or anything the player depends on), rebuild the player so the
editor picks up your changes:

```bash
pnpm --filter @motion-script/player build
```

### The CanvasKit WASM binary

`canvaskit.wasm` is **gitignored and generated**. A shared
`scripts/copy-wasm.js` runs on `postinstall`/`predev` for the packages that need
it. The vite plugin serves it from the installed `@motion-script/canvaskit`
package in dev and emits it into `dist/` on build. If you have an uncommitted or
custom `canvaskit.js` + `.wasm` in your working tree, stash it before running the
`web` browser tests — a mismatched binary breaks them with
`_MakeSRGB undefined`.

## Testing

- **Unit tests:** [Vitest](https://vitest.dev/) — `pnpm --filter <pkg> test`, or
  `pnpm test` for everything.
- **End-to-end:** Playwright in `packages/e2e` — `pnpm --filter @motion-script/e2e test`
  (use `test:update-snapshots` to refresh snapshots).

Please add or update tests alongside behavior changes.

## Submitting changes

1. **Fork** the repo and create a branch off `main`
   (`git checkout -b my-feature`).
2. Make your change. Keep it focused; match the style and idioms of the
   surrounding code.
3. Run **lint, typecheck, build, and tests** for the packages you touched:
   ```bash
   pnpm --filter <pkg> lint
   pnpm --filter <pkg> typecheck
   pnpm build
   pnpm test
   ```
4. Write clear commit messages describing the *why*, not just the *what*.
5. Open a **pull request** against `main` with a description of the change and
   any relevant context (screenshots/recordings help for editor or rendering
   changes).

## Reporting issues

Open an issue on [GitHub](https://github.com/motion-script/motion-script/issues)
with steps to reproduce, what you expected, and what happened. For rendering
bugs, a minimal scene and your platform/browser are very helpful.

## License

By contributing, you agree that your contributions will be licensed under the
project's [Apache License 2.0](LICENSE).
