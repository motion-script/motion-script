# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Motion Script is an open-source motion design tool (inspired by Manim) for
authoring animations as TypeScript/JSX "scenes" and rendering them in the
browser via Skia/CanvasKit. Scenes are generator functions: `yield*`-ing a
tween hands control back to the engine to advance time.

## Commands

pnpm workspace + Turborepo. Node.js LTS, pnpm (pinned via `packageManager` in
root `package.json`).

```bash
pnpm install
pnpm build            # turbo run build, all packages, topological order
pnpm build:lib        # build everything except @motion-script/site (used by CI before tests)
pnpm test             # pnpm -r test, every package's vitest suite
pnpm clean            # turbo run clean
```

Per-package (most library packages support `dev`, `build`, `lint`, `typecheck`, `test`):

```bash
pnpm --filter @motion-script/core dev          # watch build
pnpm --filter @motion-script/core test         # vitest, watch mode
pnpm --filter @motion-script/core test -- run  # single run, no watch
pnpm --filter @motion-script/core lint
pnpm --filter @motion-script/core typecheck
```

To run a single test file, pass it through the filter to vitest, e.g.
`pnpm --filter @motion-script/core test -- run src/tween/tween.test.ts`.

`@motion-script/web`'s tests run in a real headless Chromium via
`@vitest/browser-playwright` — install the browser once with
`pnpm --filter @motion-script/web exec playwright install --with-deps chromium`.
Its tests import `@motion-script/core`'s **built** `dist/` (package `exports`
point there), so run `pnpm build:lib` (or at least build `core`) before
`pnpm --filter @motion-script/web test` on a fresh checkout.

E2E (visual regression, Playwright, in `packages/e2e`):

```bash
pnpm test:e2e         # pnpm --filter @motion-script/e2e run test:e2e
pnpm e2e:stable       # (re)pack the committed "stable" baseline tarballs
pnpm e2e:shoot:lib    # render scenes with the current branch's lib build
pnpm e2e:shoot:stable # render scenes with the stable baseline
pnpm e2e:compare      # pixel-diff lib vs stable
```

CI (`.github/workflows/ci.yml`) runs two independent jobs: `pnpm test` after
`pnpm build:lib` (unit tests), and a Dockerized render-and-pixel-diff of every
`packages/e2e` scene against the committed stable baseline vs. the branch's lib
build (e2e-visual).

### Visually verifying a change with `ms screenshot`

`@motion-script/cli` (`ms`) is a devDependency of every example/test project
(`packages/template`, `packages/animation`, `packages/e2e`). It boots a real
Vite dev server (via `@motion-script/vite-plugin`) headlessly with Playwright
Chromium, so it needs the libraries built at least once first — run
`pnpm build:lib` (or rebuild the specific package you touched) on a fresh
checkout or after editing `core`/`web`/`player`.

```bash
pnpm --filter @motion-script/template exec ms list             # scene names in that project
pnpm --filter @motion-script/template exec ms screenshot last   # last frame, combined timeline
pnpm --filter @motion-script/template exec ms screenshot first --split   # frame 0 of every scene, one file each
pnpm --filter @motion-script/template exec ms screenshot 2.5s --scenes intro
pnpm --filter @motion-script/template exec ms clear             # delete everything under out/
```

`<when>` is a frame index (bare integer), a time (`2.5` or `2.5s`), or
`first`/`last`; see `ms --help` for the rest of the flags (`--scale`,
`--format`, `--out`). Files land under `<project>/out/screenshots/` (e.g.
`packages/template/out/screenshots/intro_75.png`) — after capturing, use the
Read tool on that PNG path to actually look at the frame rather than assuming
the render is correct. This is the fast way to confirm a node/attribute/tween
change renders as intended without opening the interactive player. `ms export`
(same driver) renders a scene to MP4 instead, for checking motion over time
rather than a single frame.

### Build orchestration — read before touching a package's build config

**Turbo owns build ordering, not TypeScript.** Each package builds with plain
`tsc -p tsconfig.build.json` (project mode), never `tsc -b` (build mode):
`tsc -b` would walk `references` and rebuild dependencies itself, racing with
Turbo's own `dependsOn: ["^build"]` dependency builds and corrupting `dist/`
on a clean build. `tsc -p` only compiles the current package, reading
dependencies' already-built `dist/*.d.ts` (which Turbo guarantees exist first).

Conventions to preserve when adding/editing a package:

- **`references` in `tsconfig.json` are editor-only**, and must point at the
  dependency's `tsconfig.build.json` (e.g. `{ "path": "../core/tsconfig.build.json" }`),
  never the bare directory — that resolves to the test-inclusive config and
  diverges from what actually gets built.
- **Two tsconfigs per package**: `tsconfig.json` (test-inclusive; used by the
  editor and `typecheck`) and `tsconfig.build.json` (extends it, excludes
  tests; what `build` and consumers' `references` point at).
- **`tsBuildInfoFile` lives inside `dist/`** (`"dist/tsconfig.build.tsbuildinfo"`)
  so it's covered by Turbo's `dist/**` output cache; each package's `files`
  excludes `*.tsbuildinfo` from the published tarball.
- `build` = `tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json`
  (bundled packages like `react`/`player` add `&& vite build`); `typecheck` =
  `tsc -p tsconfig.json --noEmit` (Vite app/solution packages use
  `tsc -b --noEmit`, which is safe there since `typecheck` never emits and
  can't race on `dist`); `clean` = `rimraf --glob dist .turbo *.tsbuildinfo`.

### The player ships prebuilt — rebuild it after touching its dependencies

`@motion-script/vite-plugin` aliases `@motion-script/player` to its **prebuilt
`dist/`**, not source. If you change `core` (or anything else the player
depends on), the editor UI won't see it until you rebuild the player:

```bash
pnpm --filter @motion-script/player build
```

### canvaskit.wasm

The binary lives committed in `packages/canvaskit/` (custom Skia build with
variable-font support + WebCodecs image I/O, BSD-3-Clause). Nothing copies it
there at install time — `@motion-script/vite-plugin` (`src/plugin.ts`,
`resolveCanvasKitWasm`) resolves it directly from the installed
`@motion-script/canvaskit` package: it's served via dev middleware and copied
into `dist/` on build (`closeBundle`). Those per-project copies land at
`**/public/canvaskit.wasm`, which *is* gitignored — never commit one. A stray/
mismatched custom `canvaskit.js` + `.wasm` in a working tree breaks the `web`
browser tests with `_MakeSRGB undefined`; stash it first.

## Architecture

Three layers, cleanly separated: the **engine** (`core`) knows how a scene
evolves over time but nothing about pixels; a **rendering backend** (`web`)
knows how to draw a frame; the **player/vite-plugin** wires a user's project
into an interactive editor.

```
your project (scenes, project.ts)
        │
        ▼
@motion-script/vite-plugin   boots the player app, aliases your project,
  (dev server + build)       serves canvaskit.wasm
        │
        ▼
@motion-script/player        timeline, scene panel, scrubbing, export controls
  (React editor UI)
        │ uses
        ├──────────────────────────────┐
        ▼                              ▼
@motion-script/core          @motion-script/web
  engine, no rendering   ◀──▶   CanvasKit render backend, exporter, audio
  scenes/nodes/signals/                │ wraps
  tweens/layout/JSX                    ▼
                              @motion-script/canvaskit
                              Skia CanvasKit (WASM)
```

### `@motion-script/core` — the engine

Backend-agnostic: no DOM/canvas dependencies. Describes *what* to draw and
*how it changes over time*; a render context does the actual drawing. Key
areas under `packages/core/src`:

- **`nodes/`** — the scene graph: base `Node`, geometry (`Rect`, `Ellipse`,
  `Line`, `Path`, `Polygon`, `Polygram`, `Grid`), text (`Text`, `RichText`),
  media (`Image`), structural nodes (`Scene`, `Camera`, `Boolean`, `Mask`).
- **`attributes/`** — animatable node properties (layout, shape/fill/stroke/
  corners/shadow/filters, text, audio). Each attribute knows how to `lerp`
  between values.
- **`signals/`** — the reactive primitive underlying attributes: computed
  values recompute when dependencies change, which is what makes attributes
  declarative and tween-able.
- **`tween/`** — time-based animation: tweens, easing, sequencing (`yield*`),
  `wait`, the generator-driven timeline.
- **`layout/`** — flexbox layout and size resolution.
- **`render/`** — render descriptors and the abstract `RenderContext` /
  `Render2DContext` interface: the contract a backend implements and `core`
  produces. Also `BuildStage` and `MeasureScope`.
- **`jsx/`** — the `jsx-runtime`/`jsx-dev-runtime` so scenes can use JSX to
  build the node tree.
- **`project/`** — `createProject({ name, fps, scenes, theme })`, the entry
  point of a renderable project.
- **`assets/`** — asset manifest and manager (fonts, images, audio).
- **`platform/`** — seams a backend fills in: master clock, storage adapter.

#### Writing a custom node

Two patterns, both extending the base `Node` (or a more specific base like
`Rect`/`ShapeNode` when you want its layout/fill/stroke/clip for free). Full
runnable versions of both live in `packages/template/src/projects/nodes/scenes/`
(`custom-scene.tsx`, `composite-scene.tsx`) — run them with the screenshot
workflow above to see the output.

**1. A node that draws its own graphics** — override `renderSelf` and hand a
`Graphics` descriptor to the `RenderContext`:

```tsx
import { Node, RenderContext, Graphics } from "motion-script";

class Blob extends Node {
    protected renderSelf(ctx: RenderContext): void {
        ctx.draw(new Graphics().rect({ width: 200, height: 200 }).fill("red"));
    }
}

// <Blob width={400} height={400}><Ellipse fill="white" width={100} height={100} /></Blob>
```

`renderSelf` draws only this node — children still render normally on top of
it. `Graphics` is the same builder the built-in shape nodes use internally
(see `Rect`/`Ellipse`'s `shapeGraphics()` in `packages/core/src/nodes/geometry/`
for the real chained calls: `.rect(...)`/`.ellipse(...)`, then
`.shadow(this.shadow).fill(this.fill)`).

**2. A composite node that assembles other nodes** — build child nodes once
in the constructor via `this.add(...)` + JSX; the node itself draws nothing:

```tsx
import { Node, NodeProps, NodeConfig, Rect, Text, createRef } from "motion-script";

interface BadgeGroupProps extends NodeProps {
    labels: string[];
}

class BadgeGroup extends Node<BadgeGroupProps> {
    // Exposes an internal handle so a scene can animate the composite's
    // internals without reaching into children by index.
    readonly rowRef = createRef<Rect>();

    constructor(props?: NodeConfig<BadgeGroup, BadgeGroupProps>) {
        super(props);
        const labels = props?.labels ?? [];
        this.add(
            <Rect ref={this.rowRef} group="row" gap={32}>
                {labels.map(label => (
                    <Rect width={180} height={180} cornerRadius={24} group="stack">
                        <Text text={label} fontSize={56} />
                    </Rect>
                ))}
            </Rect>
        );
    }
}

// <BadgeGroup labels={['A', 'B', 'C']} />
// later: badgeRef().rowRef().to({ gap: 80 }, 1.2)
```

Composition belongs in the constructor when it only needs *props* (it runs
once per instance, so there's no accumulation to guard against). A composite
that instead needs *inherited context* (e.g. a theme from a provider node
above it) should still build its structure in the constructor but override
`resolveContext` to push those values onto its children via refs.

### `@motion-script/web` — the web rendering backend

Implements `core`'s `RenderContext` against Skia/CanvasKit. Notable exports
(`packages/web/src/index.ts`): `WebRenderContext` (draws frames via
CanvasKit), `getCanvasKit` (loads/inits the WASM module), `CanvasKitEffect` /
`CanvasKitEffectRegistry` (SkSL shader effects), `exportScenesAsVideo`
(encodes frames to video via `mediabunny`), `WebAudioPlayer`,
`WebMasterClock`, `WebMeasureScope`, `WebStorageAdapter` (browser
implementations of `core`'s platform seams).

### `@motion-script/canvaskit`

Custom Skia CanvasKit WASM build (`canvaskit.js` + `canvaskit.wasm`, committed
binary), BSD-3-Clause (rest of the repo is Apache-2.0). See
[canvaskit.wasm](#canvaskitwasm) above for how other packages consume it.

### `@motion-script/react`

React bindings for embedding Motion Script; depends on `core` and `web`.

### `@motion-script/player`

The editor UI itself: timeline, scene panel, node-names column, playback/
scrubbing, export controls. Tailwind + Base UI + Zustand + `wavesurfer.js`.
`private`, consumed by the vite plugin rather than published standalone.

### `@motion-script/vite-plugin`

What a user project actually depends on. Makes Vite boot the **player app**
as `root` (not the user's project directly): aliases `~user-project` /
`~user-script` to the user's `project.ts` and entry file, serves
`canvaskit.wasm` in dev (middleware) and emits it on build (`closeBundle`),
builds a virtual asset manifest from the user's `public/` folder, and
resolves React from its own `node_modules` so it works whether or not the
user installed React.

### `motion-script` (`packages/motion-script`)

The flagship published package — bundles `core` + `@motion-script/code` +
`@motion-script/latex` behind one import. The recommended way for end users to
depend on the library.

### `@motion-script/cli`

Headless exporter: renders scenes to video/stills without the interactive
player (`ms export`, `ms list` in a user project).

### `create-motion-script` (`packages/create`)

Scaffolding CLI: prompts for name/path/language, copies `template-ts` or
`template-js`, writes a `vite.config` registering the plugin, pins
`@motion-script/*` versions.

### Components: `@motion-script/code`, `@motion-script/latex`

Standalone scene components (syntax-highlighted code blocks; LaTeX math) that
`motion-script` re-exports.

### Supporting workspaces (not published)

- **`site`** — the Next.js docs site (motionscript.dev). `predev`/`prebuild`
  first build the player app (`build:app`) and the search index.
- **`e2e`** — visual regression: renders every scene against a committed
  "stable" tarball baseline and the branch's "lib" build, then pixel-diffs.
- **`template`** / **`animation`** — example projects (scene demos) used to
  exercise the engine during development, not shipped.

## Notes

- The published `@motion-script/canvaskit` package is BSD-3-Clause; everything
  else is Apache-2.0 — keep license headers/files consistent with that split
  when touching either.
- Changesets (`.changeset/`) drive versioning/publishing
  (`version-packages`, `release` scripts) — add a changeset for
  user-facing changes to published packages.
