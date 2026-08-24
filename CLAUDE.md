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
(`packages/template`, `packages/e2e`). It boots a real
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

Cleanly separated layers: the **engine** (`core`) knows how a scene evolves over
time but nothing about pixels; a **renderer** (`skia-render`) knows how to draw a
frame but not what it is drawing onto; a **platform** (`web`) supplies the surface,
media decode, encoding and audio; the **player/vite-plugin** wires a user's project
into an interactive editor, and the **engine/cli** drive that same project
headlessly — from a server and from a terminal respectively.

```
your project (scenes, project.ts)
        │
        ▼
@motion-script/vite-plugin   boots the player app, aliases your project,
  (dev server + build)       serves canvaskit.wasm
        │
        ├───────────────────────────────────┐
        ▼                                   ▼
@motion-script/player        @motion-script/engine   (+ cli, a front end over it)
  (React editor UI)            Node-side: Vite + a pool of headless Chromium
  timeline, scene panel,       pages driving the plugin's ?headless bridge —
  scrubbing, export controls   the same render, without the UI
        │ uses
        ├──────────────────────────────┐
        ▼                              ▼
@motion-script/core          @motion-script/skia-render
  engine, no rendering   ◀──▶   the Skia renderer: shapes, fills, strokes,
  Node → Node2D | Node3D         effects, text, and the three.js 3D backend
  signals/tweens/layout/JSX            │ platform specifics injected by
                                       ▼
                              @motion-script/web
                              surfaces, media decode, encoding, audio
                                       │ wraps
                                       ▼
                              @motion-script/canvaskit
                              Skia CanvasKit (WASM)
```

### `@motion-script/core` — the animation engine

Not `@motion-script/engine`, which is the *render host* that drives a project
headlessly from Node. This is the animation engine: what a scene is and how it
evolves over time.

Backend-agnostic: no DOM/canvas dependencies. Describes *what* to draw and
*how it changes over time*; a render context does the actual drawing. Key
areas under `packages/core/src`:

- **`nodes/`** — the scene graph: the dimension-agnostic base `Node` (`nodes/node/`),
  its two halves `Node2D` (`nodes/2d/`) and `Node3D` (`nodes/three/`) (see [Two trees](#two-trees-node2d-and-node3d)),
  geometry (`Rect`, `Ellipse`,
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
- **`render3d/`** — the 3D counterpart: `Graphics3D` (drawables), `Scene3D` (a
  recorded scene) and the abstract `RenderContext3D` a `Node3D` draws into, plus
  the geometry/material/light/camera descriptor vocabulary. Nothing here imports a
  renderer, which is what keeps `three` inside `skia-render`.
- **`render/`** — render descriptors and the abstract `RenderContext2D` /
  `RenderContext3D` interfaces: the contract a backend implements and `core`
  produces, split as an interface (`RenderContext2D`, `Measurer2D`) plus the
  base class every backend extends (`CanvasRenderContext2D`). Also `Stage`.
- **`jsx/`** — the `jsx-runtime`/`jsx-dev-runtime` so scenes can use JSX to
  build the node tree.
- **`project/`** — `createProject({ name, fps, scenes, theme })`, the entry
  point of a renderable project. Also the **project-level content** that spans
  scenes rather than living in one — see [Project globals](#project-globals).
- **`assets/`** — asset manifest and manager (fonts, images, audio).
- **`platform/`** — seams a backend fills in: master clock, storage adapter.

#### Writing a custom node

Two patterns, both extending `Node2D` (or a more specific base like
`Rect`/`ShapeNode` when you want its layout/fill/stroke/clip for free). Full
runnable versions of both live in `packages/template/src/projects/nodes/scenes/`
(`custom-scene.tsx`, `composite-scene.tsx`) — run them with the screenshot
workflow above to see the output.

**1. A node that draws its own graphics** — override `renderSelf` and hand a
`Graphics2D` descriptor to the `RenderContext2D`:

```tsx
import { Node2D, RenderContext2D, Graphics2D } from "motion-script";

class Blob extends Node2D {
    protected renderSelf(ctx: RenderContext2D): void {
        ctx.draw(new Graphics2D().rect({ width: 200, height: 200 }).fill("red"));
    }
}

// <Blob width={400} height={400}><Ellipse fill="white" width={100} height={100} /></Blob>
```

`renderSelf` draws only this node — children still render normally on top of
it. `Graphics2D` is the same builder the built-in shape nodes use internally
(see `Rect`/`Ellipse`'s `shapeGraphics()` in `packages/core/src/nodes/geometry/`
for the real chained calls: `.rect(...)`/`.ellipse(...)`, then
`.shadow(this.shadow).fill(this.fill)`).

**2. A composite node that assembles other nodes** — build child nodes once
in the constructor via `this.add(...)` + JSX; the node itself draws nothing:

```tsx
import { Node2D, Node2DProps, NodeConfig, Rect, Text, createRef } from "motion-script";

interface BadgeGroupProps extends Node2DProps {
    labels: string[];
}

class BadgeGroup extends Node2D<BadgeGroupProps> {
    // Exposes an internal handle so a scene can animate the composite's
    // internals without reaching into children by index.
    readonly rowRef = createRef<Rect>();

    constructor(props?: NodeConfig<BadgeGroup, BadgeGroupProps>) {
        super(props);
        const labels = props?.labels ?? [];
        this.add(
            <Rect ref={this.rowRef} flow="horizontal" gap={32}>
                {labels.map(label => (
                    <Rect width={180} height={180} cornerRadius={24} flow="freeform">
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

**Declaring animatable props — use the attribute-typed decorators.** A rich
attribute is only declarative and tweenable because its `@property` carries the
matching *mapper* (loose author input → resolved value) and *tween* (how the
resolved value interpolates). `@fillProperty` and friends
(`packages/core/src/attributes/properties/typed.ts`) pre-bake each pair, so a
custom node never has to know that `resolveFillArray` goes with `lerpFillArray`
— several of those halves are `@internal` and were only reachable by copying an
incantation out of `ShapeNode`:

```tsx
class Card extends Rect<CardProps> {
    @fillProperty({ default: "white/10" }) declare glow: Fill;
    @strokeProperty() declare edge: Stroke;
    @cornerRadiusProperty({ default: 12 }) declare notch: RectCornerRadius;
}
// <Card glow="red" /> · card().to({ glow: Fills.linearGradient([...]) }, 0.6)
```

Each takes the same options as `@property` (`default`, plus `mapper`/`tween` to
override the built-in pair). The set covers `fill`, `stroke`, `shadow`,
`effects`, `color`, `cornerRadius`, `cornerStyle`, `path`, `padding`, `align`,
`pivot`, `vector2`, `size` and `text`. The built-in nodes declare their own
props through them, so **there is one definition of each attribute's
mapper/tween pair** — add the next kind there rather than inline at a call site.

Two things the decorator does *not* do: the field is still declared with the
**loose author-facing type** (`Fill`, not `FillResolved[]`) so assignment and
reads share one type — cast at the read site, as `ShapeNode` does; and the node
still has to *paint* the prop (`ctx.draw(g.fill(this.glow as FillResolved[]))`).
Assets referenced by a fill are discovered from that draw, so nothing extra is
needed to make images/videos/3D surfaces load.

A fill needs nothing per-frame either. A video fill resolves the source frame to
show *as it paints* (`resolveVideoTimestamp`, against the painting node's
`NodeRenderState.elapsed`), so it plays in a custom node's `Graphics2D`, a stroke
or a shadow with no `tick` override — and frame *N* is identical however the
playhead reached it. `FillData` has no `update`/`dynamic` hook; a new fill kind
that varies with time reads the clock at paint time the same way.

**Drawn text inherits `<DefaultTextStyle>`, so leave typography off.** A
`.text({ text })` op with no `fontFamily`/`fontSize`/… picks the enclosing
defaults up at draw time, falling back to the theme's `typography.default`
preset — a custom node does not need a `fontFamily` prop just to be themable,
and one that hardcodes a family opts its labels *out* of the document.

There are two channels, because a node and a drawing have nothing else in common:
a `Text`/`RichText` **node** inherits through the context map, once, at bind
(`applyTextDefaults`); a **`Graphics2D`** isn't in the tree and has no bind step, so
it inherits from the *draw scope* instead — `DefaultTextStyle.renderContent` brackets
its children with `ctx.pushTextStyle(style)` / `popTextStyle()`, and
`RenderContext2D.draw` folds the effective style into each under-specified `text`/
`richText` op before handing the list to the backend's `drawGraphics`. Both read
the same `TextStyle` vocabulary (`runtime/builtin-context.ts`), which is what
keeps them from drifting.

Things to know when working on this:

- **`draw()` is the seam, not the backend.** A backend implements
  `drawGraphics`; `RenderContext2D.draw` is the one place the merge happens, so
  every backend resolves an under-specified family the same way — and a family one
  backend resolves and another doesn't is a font that never loads and glyphs that
  never paint. (Assets themselves are declared, not discovered by drawing: see
  `Node.prepareLayout`/`prepareRender`.)
- **Only the shaping keys reach a drawn op** (`TEXT_SHAPING_KEYS`).
  `fill`/`stroke`/`shadow` are group-scoped ops in a `Graphics2D`, not per-shape
  slots — synthesising one would change which shapes the group's paint covers.
- **Opt out with `ctx.pushTextStyle(null)`**, which refuses the enclosing scope
  *and* the theme default. `Code` does this: its token x positions are measured
  against its own monospaced face, so an inherited display family would shape
  glyphs the geometry was never measured for.
- The merge **copies** rather than mutates (`Graphics2D._withOps`), because a node
  may submit one built `Graphics2D` more than once — `Text` draws the same op list
  for its fill, overlay and stroke passes. It returns the same instance when
  nothing needs filling in, so a fully-specified node allocates nothing.

### Project globals

`createProject` takes three fields describing content that spans the whole
project rather than one scene: `audioTracks` (beds laid straight on the project
timeline), `backgrounds` (nodes drawn under every scene) and `overlays` (nodes
drawn over every scene). Either layer list narrows to specific scenes with
`include`/`exclude`, by scene name (matched case- and separator-insensitively,
so `'cross-fade'` selects the scene the `?scene` transform named `CrossFade`) or
by index.

```ts
createProject({
    name: 'Reel', scenes: [intro, demo, outro],
    audioTracks: [{ src: 'music.mp3', volume: 0.5, trimStart: 8, trimEnd: 40 }],
    backgrounds: [() => <Image src="bg.jpg" width="fill" height="fill" />],
    overlays: [{ node: () => <Watermark />, exclude: 'outro' }],
});
```

Things to know when working on this:

- **A layer is not in the scene tree.** `Scene.reset()` builds a fresh `Canvas2D`
  on every pass, and there is no generator to re-add a config node, so each layer
  gets its own viewport-sized `Canvas2D` frame owned by
  `ProjectGlobals` (`packages/core/src/runtime/globals.ts`) for the life of the
  runtime. That is also what gives layers their semantics: outside the scene
  camera (`zoom`/`origin`/`heading`), outside its `clip`, and over its `overlay`
  fill rather than under it.
- **A layer *is* a factory** (`() => <Watermark/>`) — handing one a node throws.
  Two reasons, and both bite silently otherwise: the project module is evaluated
  before the runtime calls `setTheme`, so a node built inline at module scope
  resolves theme tokens against an empty registry; and a layer outlives no
  runtime, so an instance shared between two of them (a StrictMode double-mount,
  a hot reload) is one the first tears down and the second finds hollow. The
  factory runs once per `LayerStack`, which then owns what came back.
- **One `ProjectGlobals` instance is shared** by `Precomp` and `StateEvaluator`,
  exactly as the `Scene` instances are — read it off `precomp.globals`. The
  precomp pass lays out, renders and audio-prepares the active layers alongside
  each scene, which is what discovers their assets; measuring one set of nodes
  and drawing another would silently mis-window those loads.
- **Draw order is fixed by the evaluator**: `backgrounds → scene → overlays`. A
  background is only visible where the scene's own `fill` is absent (the default)
  or translucent.
- **Beds are absolute, scene audio is not.** `PrecompResult.globalAudio` carries
  project-second times, so `AssetManager`/the exporter schedule them with a zero
  offset, unlike `ScenePrecomp.audioRequests`. They are re-resolved on every
  timeline assembly, because the total duration grows as the background precomp
  measures more scenes.
- **`layerAppliesTo` is the single selection rule.** The player's timeline draws
  each layer's bar from it, so what is shown and what actually renders cannot
  disagree.

### `@motion-script/skia-render` — the renderer

Implements `core`'s `RenderContext2D` against Skia/CanvasKit, and holds everything
that is *about drawing* rather than about the platform: `SkiaRenderContext`
(`render-context.ts`, the real context every backend extends), the shape / fill /
stroke / effect / text handlers, the video-export pipeline, and the whole three.js
3D backend (`three/` — `Canvas3DBackend`, `Canvas3DGraph`, the op handlers, the
lazy `import("three")` bridge). Platform specifics are *injected*, which is what
lets one renderer serve a browser and a headless host.

### `@motion-script/web` — the browser platform

The thin binding layer over `skia-render`. Notable exports
(`packages/web/src/index.ts`): `WebRenderContext` (a ~60-line `SkiaRenderContext`
subclass: mount a `<canvas>`, unmount, screenshot), `getCanvasKit` (loads/inits the
WASM module), `WebAudioPlayer`, `WebMasterClock`, `WebMeasureScope`,
`WebStorageAdapter` (browser implementations of `core`'s platform seams), and
`webCanvas3DRendererHost` (the shared `WebGLRenderer` — see
[3D](#3d-node3d-graphics3d-scene3d)).

**Registration must live in the barrel.** `packages/web/src/index.ts` calls
`registerCanvas3DBackend()` and `registerCanvas3DRendererHost(...)` there rather
than at module scope inside `three/renderer.ts`, because `sideEffects: false` would
let a module-scope registration be tree-shaken — silently killing all 3D.

### Two trees: `Node2D` and `Node3D`

The scene graph is one tree API over two spaces. `Node`
(`packages/core/src/nodes/node/node.ts`) is dimension-agnostic and owns everything
true of a node wherever it lives: the tree itself, identity and refs, the reactive
`@property` system, `set()`/`to()`/`save()`/`restore()`, inherited context,
`attach()`/`mounted`, the per-node clock (`time`), asset declaration and teardown.
It owns nothing about *where* a node is or *how* it draws, because those are the
two things 2D and 3D genuinely disagree about.

- **`Node2D`** (`nodes/2d/node2d.ts`) — laid out in a flex/stack box, drawn
  through a `RenderContext2D`. Everything with a `width`, an anchor or a fill.
- **`Node3D`** (`nodes/three/node3d.ts`) — placed by a `Transform3D`, drawn
  through a `RenderContext3D`. Meshes, lights, cameras, fog.

Things to know when working on this:

- **A subclass calls `initProps()` itself.** The base constructor deliberately
  does *not* apply `@property` defaults, because a subclass's field initializers
  only run after `super()` returns — applying props from the base would write into
  cells (`_layoutBounds`, the transform scratch) that don't exist yet. `Node2D` and
  `Node3D` each call `initProps(props)` then `adoptChildrenProp(props)` at the end
  of their own constructor. A new dimension would do the same.
- **The two trees don't mix, and saying so is a runtime check.** `Node.acceptsChild`
  compares `dimension`, and `add`/`addChildAt` throw on a
  mismatch. Only `Canvas3D` overrides it to accept both. Rejecting loudly is
  deliberate: a `Box3D` parented to a `Rect` would be skipped by the layout walk
  *and* the 3D walk, and would simply never appear.
- **`dimension` is a getter, not a field**, so it answers from the prototype during
  construction — before any subclass field initializer has run.
- **`JSX.Element` is the base `Node`.** One JSX runtime serves both trees, so a JSX
  expression is typed as the common base. Library surfaces that receive JSX
  (`Scene.add`, global layers, `Tex.surface`) are typed to `Node` for that reason
  and rely on the runtime guard; a helper that annotates its own JSX needs `Node`
  rather than `Node2D`.
- **`mounted` gates everything, and nothing checks it per method.** `attach(scope)`
  is one call — asset catalog, inherited context, clock — and it is what sets
  `mounted`. The guards live at the handful of places the framework *dispatches*
  from: the child accessors a container walks (`flowChildren`, `renderChildren`,
  `layoutAbsoluteChildren`), the two declaration walks, `Node2D.render`, and
  `Node._prepareStep`/`animate` — the two funnels every command is built through.
  That is what makes the rule hold for a subclass override too. A command on an
  unmounted node runs its duration and writes nothing (`tween/inert.ts`), so
  `yield*` keeps the scene's timing rather than throwing or silently shortening it.
- **A `Scene` rebuilds its `Canvas2D` on `reset()`** rather than rewinding it.
  There is no `reinit`: restoring a reused node in place meant maintaining a list
  of what "restore" covered, and anything the list missed leaked into the next pass
  as a tween whose `from` already equalled its target. Same rule for a global
  layer, which is why those must be factories.
- **2D walks filter.** `Node2D.children`/`flowChildren`/`renderChildren`/
  `layoutAbsoluteChildren` all skip anything that isn't a `Node2D`, so a
  `Canvas3D`'s 3D children never enter layout. `children` returns the live array
  untouched unless a 3D child is actually present, so the common tree allocates
  nothing per read.

### 3D: `Node3D`, `Graphics3D`, `Scene3D`

3D follows the same split as 2D: `core` describes a scene as pure data
(`packages/core/src/render3d/`), and `skia-render` renders it (three.js lives
there, never in core). The division of labour mirrors 2D exactly:

| 2D | 3D | what it is |
|---|---|---|
| `Graphics2D` | `Graphics3D` | what **one node** draws — shapes+paint / geometry+material |
| `RenderContext2D` | `RenderContext3D` | what a node draws *into* |
| — | `Scene3D` | the **recorded** result a backend replays |
| `Node2D` | `Node3D` | a thing in the tree |

`RenderContext2D` and `RenderContext3D` are **siblings, not subclasses**: they
share no members, because a 3D scene is described with a camera, lights and meshes
rather than with paths, paint and clips.

```tsx
<Canvas3D width="fill" height="fill" cornerRadius={24}>
    <PerspectiveCamera3D position={[0, 2, 6]} lookAt={0} fov={45} />
    <AmbientLight3D intensity={0.4} />
    <DirectionalLight3D intensity={2.4} position={[4, 6, 3]} castShadow />
    <Fog3D color="#0b0d12" near={5} far={30} />

    <Group3D ref={rig}>
        <Box3D width={2} color="tomato" roughness={0.3} />
        <Sphere3D radius={0.8} position={[3, 0, 0]} />
    </Group3D>

    <Text text="FPS 60" fontSize={32} />        {/* a 2D HUD, over the 3D */}
</Canvas3D>

yield* rig().to({ rotation: [0, 360, 0], position: [0, 1, 0] }, 2);
```

**`Canvas3D` is the one node that holds both dimensions.** It is a `Rect`, so it
lays out in flex/stack groups, takes `cornerRadius`/`clip`, and can be masked,
blended and filtered. Its `Node3D` children are walked through a `Scene3D` every
frame; its `Node2D` children draw over the result as a HUD. For a reusable 3D
component, subclass it and override `buildScene3D()`.

**3D is still a fill, so it paints through any shape path.** The renderer draws a
scene to a texture and shades the shape's own path with it, which means 3D clips to
whatever painted it — an `Ellipse`, a `Path`, a run of `Text` — stacks with the
other fill layers, and inherits their `opacity`/`blend`/`space`. `Canvas3D` is
sugar over exactly that; the primitive is the recorded `Scene3D`:

```tsx
const scene = new Scene3D()
    .perspective({ position: [0, 0, 2.6], lookAt: 0 })
    .light({ type: "ambient", intensity: 0.4 })
    .draw(new Graphics3D().box({ width: 2, color: "tomato" }));

<Ellipse fill={scene} />
<Text text="DEPTH" fontSize={320} fill={Fills.canvas3D(scene)} />
<Rect fill={["#0b0d12", scene, Fills.linearGradient(["transparent", "#000/60"])]} />
```

A bare `Scene3D` coerces to a `canvas3D` fill exactly the way a bare CSS string
coerces to a solid one (`resolveFill`, the single coercion point).

Key things to know when working on this:

- **`g` is a 2D `Graphics2D`; `g3` is a `Graphics3D`.** No exceptions, in code,
  docs or examples. The two recorders take entirely different ops, and one scene
  routinely holds both (a `Graphics3D` for the 3D, a `Graphics2D` for each
  `Tex.surface` source), so a bare `g` must always mean the 2D one.
- **`Graphics3D` holds drawables only** — no hierarchy, no lights, no camera, no
  scene settings. Those are the *scene's*, and the node tree owns them. A single
  node draws a flat list of meshes/instances/points/lines/sprites/models, exactly
  as a `Graphics2D` is a flat list of shapes and paint.
- **Angles are degrees everywhere** (Euler rotations, spot cone angles, sweep
  arcs, UV rotation), matching 2D `rotation`. The backend converts.
- **A camera places itself, not its group.** three aims a camera's **-Z** at
  `lookAt` but a plain group's **+Z**, so a camera whose enclosing group carried
  its placement would face exactly backwards. `Camera3DNode` overrides
  `groupTransform()` to identity and puts the placement on the descriptor, which
  the renderer applies to the camera object — still parent-relative, so a camera
  inside a moving rig is carried by it. Any other node type that three orients
  differently (lights, via `Object3D.lookAt`'s `isLight` branch) needs the same
  treatment.
- **Fog / background / environment / shadows / tone / post are singletons.** They
  have no position, so they are not hierarchical: the last node to set one wins.
- **An optional attribute prop must pass `default: undefined` explicitly.**
  `attributeProperty` tests for the key's *presence*, so `@colorProperty()` with no
  options falls back to its own default while `@colorProperty({ default: undefined })`
  stays absent. That distinction is load-bearing: a light with a folded-in default
  colour renders the whole scene black.
- **There is no `t`.** A bound prop re-evaluates when the *signals* it reads
  change, and `clock.elapsed` is a plain field, not a signal — so a binding that
  reads it computes **once and freezes**, with no error and a plausible-looking
  still image. Drive procedural motion from a tweened signal (which also puts it on
  the timeline, so it scrubs), or read `this.time.elapsed` inside
  `buildScene3D`/`renderSelf`, which do re-run every frame.
- A signal holding a non-number **must** be given a lerp
  (`createSignal(v, lerpVector3)`) or it snaps at the end of the tween instead of
  interpolating. Node props declared with `@vector3Property`/`@euler3Property`/
  `@quaternionProperty` get the right one already.
- **Colours are core's `Color`**, so `oklch()`, theme tokens and `"white/10"` all
  work. Note `parseColor` returns *gamma-encoded* sRGB, not linear-light — the
  backend declares `SRGBColorSpace` when handing values to three, and converts
  explicitly for vertex-colour buffers (which are sampled as linear).
- **Full control** comes from four escape hatches, in preference order: the
  complete parameter surface on each named descriptor; arbitrary vertex data via
  `Geo.buffer`/`Geo.parametric`; raw GLSL via `Mat.shader`; and a `params`
  passthrough assigned straight onto the three object.
- **What is cheap to animate**: transforms, material/light values and shader
  uniform values are in-place writes. **Geometry parameters are not** — three
  geometries are immutable, so `<Box3D width={signal} />` reallocates every frame.
  Scale the object instead: `<Box3D width={1} scale={() => [signal(), 1, 1]} />`.
  The fields marked "structural" on `MaterialCommon3D` recompile the shader
  program; set them once rather than tweening them.
- **`Canvas3D.prepareRender` is the one asset seam**, not each `Node3D`: sizing an
  image decode needs the pixel size of the buffer it lands in, and only `Canvas3D`
  knows it. It builds the scene through the same `buildScene3D()` the render uses,
  so what is declared cannot drift from what is drawn.

Rendering path — a **fill layer**, so position in the fill array is paint order
and the shape's path is the clip:

```
Canvas3D.renderSelf → walk Node3D children → Scene3D → Fills.canvas3D(scene)
  → FillHandler.applyFills → Canvas3DFillRenderer.preflight()
      → rasterize any Tex.surface sources        (offscreen readPixels)
      → Canvas3DBackend.render()  reconcile ops → cached THREE.Scene, render
      → upload3DFrame()           makeImageFromTextureSource(…, srcIsPremul: true)
  → Canvas3DFillRenderer.applyPaint → paint.setShader(image)
  → FillHandler.drawShapes → drawPath / drawShapedRun
```

Two rules that fall out of that, and are easy to break:

- **All offscreen work goes in `preflight`, never `applyPaint`.** The paint is
  shared across every fill in the array, and re-entering the render context
  resets its alpha, blend mode and shader — silently stripping the opacity of the
  fill being configured. `preflight` runs before the paint is touched.
- **The renderer must not re-apply `worldAlpha` or `blend`.** `FillHandler`
  already set both on the paint.

Live 3D resources are keyed by **`${nodeId}#${paintSlot}`**, not by node: a node
can carry two 3D fills, and a fill cross-fade transiently produces exactly that.
The slot is allocated per frame off the resolved fill's *object identity*, because
one frame hands the same fill to the shadow, fill and inner-shadow passes.

The reconciler (`packages/skia-render/src/three/reconciler.ts`) keeps one live
three object per op and mutates rather than rebuilds — a `Scene3D` is rebuilt from
scratch every frame but the GPU resources are not. **Identity comes from the
node**: `Scene3D.begin` stamps the recording node's id onto the group's
`transform.key`, and a keyed group *restarts* the reconciler's structural path
rather than extending it. That is what lets a conditional sibling appear or
disappear without renumbering its neighbours' cache slots.

three is reached through a lazy `import("three")`, so 2D-only projects never load
it. `Canvas3D.prepareRender()` warms it during precomp (before any frame draws) via
core's `registerCanvas3DWarmup` seam; if a frame still beats it, the existing
`warmPendingVideo` re-render loop covers it, so exports stay frame-accurate.
Because the dev server's root is the player app, `vite-plugin` resolves `three`
from `@motion-script/web`'s location and declares it in `optimizeDeps.include` —
without that the dynamic import 504s under the headless CLI.

#### 2D on 3D: `Tex.surface`

The bridge the other way: 2D content rendered to an offscreen buffer and bound to
any material map. `source` is a **value** — a built `Graphics2D`, or a `Node2D`
subtree for anything wanting real layout, shaped `Text` or a loaded `Image` — and
`width`/`height` *are* the texture's resolution.

```tsx
const scope = new Graphics2D().line({ points: trace(phase()) }).stroke({ weight: 6 });
const stats = <Rect flow="vertical" padding={48}><Text text="CPU" fontSize={64} /></Rect>;

<Canvas3D>
    <Plane3D map={Tex.surface(scope, 1024, 640)} />
    <Plane3D map={Tex.surface(stats, 1024, 640)} position={[5, 0, 0]} />
</Canvas3D>
```

- **A source is not a child, and has no name.** It is a value in a descriptor.
  What tree membership used to supply — the asset catalog (a webfont never shapes
  and an `<Image>` never loads without it), the resolved context map, and a
  ticking clock — is instead handed over by whatever paints the scene, via
  `Node.attachDetached`. Layout is done on demand against `width`×`height`.
- **Hoist the source; never build it inside a prop binding.** A fresh subtree
  each frame re-binds, re-lays-out, defeats the texture cache and leaks.
- **A conditionally emitted surface needs an explicit `key`.** The texture cache
  is global and un-refcounted, so a shifting walk ordinal orphans the old
  `THREE.DataTexture` rather than reusing it.
- Path: `Canvas3DFillRenderer.preflight` → `FillRendererContext.rasterizeSurface`
  → `SkiaRenderContext` swaps `currentCanvas` + `activeSurface` onto a sized
  offscreen, `readPixels` → `TextureResolver.setRasters` uploads into a
  `THREE.DataTexture` keyed by descriptor identity + the owning fill slot.
- **`Canvas3D.prepareRender` declares a node source's assets.** A source is 2D
  content one level below the scene, and it is a value in a descriptor rather than
  a child — so the ordinary `declareLayoutAssets`/`declareRenderAssets` walk never
  reaches it. Without that call its webfont is never declared, never loads, and its
  glyphs never paint. `track3DResources` cannot cover it: a surface texture has no
  `src` to report.
- **`activeSurface`, not `this.surface`** — anything in `SkiaRenderContext` needing
  the size of *what is being drawn into* (device-space shader rect, `'global'` fill
  space, backdrop snapshot, compatible offscreen) must read it, or a node inside a
  surface gets the main canvas' dimensions.
- **Cost**: three owns its own GL context, so there is no shared texture — every
  animated surface is a full GPU→CPU `readPixels` plus an upload per frame. Hence
  a default pixel ratio of 1.

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

### `@motion-script/engine`

The headless renderer as a library, for backend use. `createEngine({ projectRoot })`
boots the project's own Vite dev server and a pool of Playwright Chromium pages
and keeps them warm, then drives the same `?headless` bridge the vite-plugin
installs — so a server-side render is the render the author previewed.

It owns everything about *driving a project headlessly*: the Vite lifecycle
(`server.ts`), the Chromium launch flags (`launch.ts` — including the
`--headless=new` GPU path and the `MS_SOFTWARE_RENDER` SwiftShader fallback),
the page pool and its concurrency (`pool.ts`, `semaphore.ts`), the bridge
protocol (`session.ts`), and the option/frame-selector parsing a caller needs at
its edge (`validate.ts`, `frame.ts`).

Things to know when working on this:

- **`@motion-script/cli` is a front end over it**, not a parallel implementation.
  `HeadlessDriver` is a single-worker adapter kept for the batch scripts in
  `packages/e2e`; anything new belongs on the engine, and a fix to the launch
  flags or the bridge handshake must land here so both get it.
- **The plugin resolves the project from `process.cwd()`**, so an engine rendering
  a project elsewhere `chdir`s for the duration of the config load and restores
  it (`cwd.ts`). That window is serialized across engines, because two starts
  interleaving would each load the other's project.
- **A failed job retires its page.** Nothing can interrupt a render already
  running inside one, so cancellation and timeouts work by destroying the page;
  a render *error* recycles too, since a page that threw mid-export may hold a
  half-torn-down surface.
- **Errors are coded, not prose.** `EngineError.code` is what a service maps onto
  a response; a new failure mode needs a code rather than a distinguishable
  message.

### `@motion-script/cli`

Headless exporter: renders scenes to video/stills without the interactive
player (`ms export`, `ms list` in a user project). Argument parsing, progress
bars and file naming over `@motion-script/engine`.

### `create-motion-script` (`packages/create`)

Scaffolding CLI: prompts for name/path/language, copies `template-ts` or
`template-js`, writes a `vite.config` registering the plugin, pins
`@motion-script/*` versions. Both templates ship a `tsconfig.json` — the JS one
too, because that is where the JSX transform is configured and Vite reads
`jsx`/`jsxImportSource` from `tsconfig.json` only (a `jsconfig.json` is ignored).

### Components: `@motion-script/code`, `@motion-script/latex`

Standalone scene components (syntax-highlighted code blocks; LaTeX math) that
`motion-script` re-exports.

### Supporting workspaces (not published)

- **`site`** — the Next.js docs site (motionscript.dev). `predev`/`prebuild`
  first build the player app (embedded by `/editor`), the API reference and the
  search index.
- **`e2e`** — visual regression: renders every scene against a committed
  "stable" tarball baseline and the branch's "lib" build, then pixel-diffs.
- **`template`** — an example project (scene demos) used to exercise the
  engine during development, not shipped.

## Notes

- The published `@motion-script/canvaskit` package is BSD-3-Clause; everything
  else is Apache-2.0 — keep license headers/files consistent with that split
  when touching either.
- Changesets (`.changeset/`) drive versioning/publishing
  (`version-packages`, `release` scripts) — add a changeset for
  user-facing changes to published packages.
