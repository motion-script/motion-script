# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Motion Script is an open-source motion design engine: it renders "scenes"
through Skia/CanvasKit, in a browser or in Node.

**A scene is data, not code.** It is a `StillDocument` (nodes and props) or an
`AnimationDocument` (a list of commands, each placed at a time) — plain JSON,
described in `packages/core/src/document/`. **Node types are the code half**: a
class registered under a string key, which is also where a custom node joins the
system and where anything JSON cannot express belongs.

The consequence worth knowing before reading anything else: a frame is a **pure
function of its time**. A scene is built once and asked what it looks like at
`t`, never advanced to it. Scenes used to be generator functions — `yield*`-ing a
tween handed control back to the engine — which meant frame N was only reachable
by running frames 0..N-1, a backward seek meant replaying from zero, and a
scene's duration was unknowable without playing it to the end. All of that is
gone: seeking costs the same in either direction and however far.

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
`pnpm --filter @motion-script/core test -- run src/document/tests/timeline.test.ts`.

`@motion-script/web`'s tests run in a real headless Chromium via
`@vitest/browser-playwright` — install the browser once with
`pnpm --filter @motion-script/web exec playwright install --with-deps chromium`.
Its tests import `@motion-script/core`'s **built** `dist/` (package `exports`
point there), so run `pnpm build:lib` (or at least build `core`) before
`pnpm --filter @motion-script/web test` on a fresh checkout.

E2E (visual regression, in `packages/e2e` — renders in process, no browser):

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

### Visually verifying a change

`packages/e2e` renders every scene in process through `@motion-script/engine`
and pixel-diffs the result — no browser, no dev server. A full sweep is ~90s.

```bash
pnpm build:lib                                        # engine changes need a build first
pnpm --filter @motion-script/e2e run screenshot -- --variant lib
pnpm --filter @motion-script/e2e run screenshot -- --variant lib --scenes rect-basic
```

Frames land in `packages/e2e/out/lib/<id>.<first|mid|last>.png` — read the PNG
rather than assuming the render is right. `scripts/golden.ts` diffs a run against
recorded frames (`--dir <path>`), which is how a refactor of the runtime is
checked; `scripts/compare.ts` diffs the live build against the packed stable one.

Some scenes cannot render headlessly: image-backed ones need `ffmpeg` on `PATH`,
video is not supported by the engine at all yet
(`packages/engine/src/storage-adapter.ts`), and LaTeX still parses its SVG with a
browser `DOMParser`.

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
  (bundled packages like `react` add `&& vite build`); `typecheck` =
  `tsc -p tsconfig.json --noEmit` (Vite app/solution packages use
  `tsc -b --noEmit`, which is safe there since `typecheck` never emits and
  can't race on `dist`); `clean` = `rimraf --glob dist .turbo *.tsbuildinfo`.

### canvaskit.wasm

The binary lives committed in `packages/canvaskit/` (custom Skia build with
variable-font support + WebCodecs image I/O, BSD-3-Clause). A browser host serves
it however it serves any other asset and points `getCanvasKit` at the URL; the
Node engine loads it from the installed package directly
(`packages/engine/src/canvaskit.ts`). A stray/mismatched custom `canvaskit.js` +
`.wasm` in a working tree breaks the `web` browser tests with
`_MakeSRGB undefined`; stash it first.

## Architecture

Cleanly separated layers: the **engine** (`core`) knows how a scene evolves over
time but nothing about pixels; a **renderer** (`skia-render`) knows how to draw a
frame but not what it is drawing onto; a **platform** (`web`) supplies the
surface, media decode, encoding and audio; `react` mounts all of that into a
host's UI, and `engine` drives the same render from Node with no browser at
all.

```
a scene document (JSON: nodes + commands)
        │
        ▼  createStillScene / createAnimationScene
    a Scene, driven by a compiled timeline
        │
        ├───────────────────────────────────┐
        ▼                                   ▼
@motion-script/react         @motion-script/engine
  MotionPlayer: mounts a       Node-side, in process: CanvasKit's CPU
  canvas and a PlaybackController   rasterizer, no browser and no bundler.
  for a host's own editor UI        Same render, from a server or a script.
        │ uses                             │ uses
        ├──────────────────────────────┬────┘
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

Not `@motion-script/engine`, which is the *render host* that drives a document
from Node. This is the animation engine: what a scene is and how it evolves over
time.

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
- **`document/`** — **what a scene is**: `NodeSpec`/`CommandSpec`, the two
  document kinds, the hand-rolled validator, the node/command registries, and
  `SceneTimeline` — which compiles a document and evaluates it at a time. Start
  here.
- **`tween/`** — a `Command`: a declared `duration` plus a pure `at(t)`, and the
  easing/lerp math behind it. There is no `sequence`/`parallel`/`wait`: a command
  carries its own placement, so sequencing is `at + duration`, running together
  is a shared `at`, and a wait is a gap.
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
A custom node is the **code** half of the model: write the class, register it,
and any document can name it.

```ts
class Blob extends Node2D<BlobProps> { … }
registerNodeType("blob", Blob);
// { "id": "b1", "type": "blob", "parent": null, "order": 0, "props": { "wobble": 0.4 } }
```

Its `@command()` methods reach a document the same way — `registerNodeCommand`
maps a command key onto a method, and `getCommandMeta` already enumerates them,
so the dispatch table is read off the class rather than restated beside it. This
is also where anything JSON cannot express belongs: a computed lookup table, a
generated point cloud, a `Float32Array`.

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
so `'cross-fade'` selects a scene named `CrossFade`) or
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
  on every pass, and nothing re-adds a config node, so each layer
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
- **`layerAppliesTo` is the single selection rule.** A host's timeline draws
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
  the timeline keeps its shape rather than throwing or silently shortening.
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
<Canvas3D width="fill" height="fill" cornerRadius={24} fill="#0b0d12" shadows>
    <Camera3D target={[0, 1, 0]} orbit={30} elevation={18} distance={6} fov={45} />
    <AmbientLight3D intensity={0.4} />
    <DirectionalLight3D intensity={2.4} position={[4, 6, 3]} shadow />
    <Fog3D near={5} far={30} />

    <Group3D ref={rig}>
        <Box3D width={2} cornerRadius={0.15} fill="tomato" roughness={0.3} />
        <Sphere3D radius={0.8} x={3} />
    </Group3D>

    <Text text="FPS 60" fontSize={32} />        {/* a 2D HUD, over the 3D */}
</Canvas3D>

rig().to({ rotationY: 360, y: 1 }, 2)   // placed on the timeline at some `at`
```

**Six rules hold this vocabulary together, and each replaced a pair of fields
that could disagree:**

- **`fill` is what a surface is made of**, and takes the whole 2D fill chain — a
  colour, a gradient, an image, a `Node2D` subtree, a stack of blended layers.
  It replaced a flat `color` plus five texture slots (`map`, `emissiveMap`,
  `alphaMap`, `envMap`, `lightMap`), each of which was a fill under another name.
- **Subdivision is always `segments`** (a number, or a per-axis tuple the shape
  documents), and a partial revolution is always **`startAngle` + `sweep`** in
  degrees — the pair `Ellipse` has always used. Between them they replaced ten
  and five spellings of the same two ideas.
- **Axes are the real props.** `x`/`y`/`z`, `rotationX/Y/Z` and `scaleX/Y/Z` are
  the signals, named exactly what 2D names them; `position`/`rotation`/`scale`
  distribute into them the way `Node2D`'s `size` distributes into width/height.
  That is what makes `to({ y: 3 })` work without restating the other two axes.
- **`transparent` and `depthWrite` are derived**, from opacity, fill alpha, an
  `alphaMap` or transmission. Forgetting the first made `opacity` silently do
  nothing; forgetting the second made a fading surface cut a near-invisible hole
  through everything behind it.
- **There is no `key`.** Reconciler identity is a node id plus a content
  signature, so a builder that emits ops conditionally reuses the right cache
  entry with nothing written by hand.
- **The background is the viewport's own 2D `fill`.** See `Canvas3D` below.

**`Canvas3D` is the one node that holds both dimensions.** It is a `Rect`, so it
lays out in flex/stack groups, takes `cornerRadius`/`clip`, and can be masked,
blended and filtered. Its `Node3D` children are walked through a `Scene3D` every
frame; its `Node2D` children draw over the result as a HUD. For a reusable 3D
component, subclass it and override `buildScene3D()`.

**Its `fill` is also the 3D background, and there is no `<Background3D>`.**
three's background pass is unaffected by every light in the scene *and by fog*
(fog is applied in the material shader; the background box has none), the
renderer clears transparent, and this node already composites the 3D pass over
its own fill layers — so a colour, a gradient, an image or a video behind a 3D
scene is the ordinary 2D fill chain, which does strictly more. What genuinely
needs the 3D pass is a sky that *reprojects* as the camera turns, and that is
`<Environment3D background>` — merged with the lighting because an HDRI that
lights a scene is the same panorama you see behind it. `<Fog3D>` with no colour
of its own takes the viewport's fill, so the haze and the backdrop cannot drift.

**Its render settings are props, not nodes.** `shadows`, `tone`, `exposure` and
`post` were `<Shadows3D>`, `<ToneMapping3D>` and `<PostEffects3D>`: nodes with no
position whose duplicates silently did nothing. The post chain is short on
purpose — a `Canvas3D` is a `Node2D`, so vignette, grain, grading and blur are
the 2D `effects` chain over the composited result, and what stays is what needs
the depth buffer, object ids, or HDR radiance before tone mapping.

**3D is still a fill, so it paints through any shape path.** The renderer draws a
scene to a texture and shades the shape's own path with it, which means 3D clips to
whatever painted it — an `Ellipse`, a `Path`, a run of `Text` — stacks with the
other fill layers, and inherits their `opacity`/`blend`/`space`. `Canvas3D` is
sugar over exactly that; the primitive is the recorded `Scene3D`:

```tsx
const scene = new Scene3D()
    .perspective({ orbit: 20, elevation: 10, distance: 2.6 })
    .light({ type: "ambient", intensity: 0.4 })
    .draw(new Graphics3D().box({ width: 2, fill: "tomato" }));

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
  its placement would face exactly backwards. `Camera3D` overrides
  `groupTransform()` to identity and puts the placement on the descriptor, which
  the renderer applies to the camera object — still parent-relative, so a camera
  inside a moving rig is carried by it. Any other node type that three orients
  differently (lights, via `Object3D.lookAt`'s `isLight` branch) needs the same
  treatment.
- **Fog and environment are singletons.** They have no position, so they are not
  hierarchical: the last node to set one wins. Shadows, tone mapping and the post
  chain are no longer scene nodes at all — they are `Canvas3D` props, because they
  are settings of the thing doing the rendering rather than objects in the scene.
  A background is a 2D fill; see `Canvas3D` above.
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
  Scale the object instead: `<Box3D width={1} scaleX={() => signal()} />`.
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
scratch every frame but the GPU resources are not. **Identity is derived, and
there is nothing to write.** A group is keyed by the node id `Scene3D.begin`
stamps on it; a drawable is keyed by that scope plus its **structural signature**
plus which nth op of that shape it is. Two ops with the same signature are
interchangeable cache entries — everything that distinguishes them (position,
colour, roughness) is an in-place write on whichever one they get — so a builder
writing `if (t > 2) g3.sphere(...)` shifts nothing, which is exactly what the old
positional path needed an author-supplied `key` to avoid.

three is reached through a lazy `import("three")`, so 2D-only projects never load
it. `Canvas3D.prepareRender()` warms it during precomp (before any frame draws) via
core's `registerCanvas3DWarmup` seam; if a frame still beats it, the existing
`warmPendingVideo` re-render loop covers it, so exports stay frame-accurate.
A browser host bundling this must be able to resolve `three` (and
`three/addons/*`, which is a separate subpath) from wherever `@motion-script/web`
is installed, or the dynamic import fails at the first 3D frame rather than at
build time.

#### 2D on 3D: `Tex.surface`

The bridge the other way: 2D content rendered to an offscreen buffer and bound to
a surface. `source` is a **value** — a built `Graphics2D`, or a `Node2D` subtree
for anything wanting real layout, shaped `Text` or a loaded `Image`.

A source *is* a fill, so the common case needs no builder at all; `Tex.surface`
is what you reach for to pin a resolution or a sampler option, and its
`width`/`height` are the buffer's own (default 512).

```tsx
const scope = new Graphics2D().line({ points: trace(phase()) }).stroke({ weight: 6 });
const stats = <Rect flow="vertical" padding={48}><Text text="CPU" fontSize={64} /></Rect>;

<Canvas3D>
    <Plane3D fill={scope} />
    <Plane3D fill={Tex.surface(stats, { width: 1024, height: 640 })} x={5} />
</Canvas3D>
```

- **A source is not a child, and has no name.** It is a value in a descriptor.
  What tree membership used to supply — the asset catalog (a webfont never shapes
  and an `<Image>` never loads without it), the resolved context map, and a
  ticking clock — is instead handed over by whatever paints the scene, via
  `Node.attachDetached`. Layout is done on demand against `width`×`height`.
- **Hoist the source; never build it inside a prop binding.** A fresh subtree
  each frame re-binds, re-lays-out, defeats the texture cache and leaks.
- **Texture identity is the source object**, held in a `WeakMap` — which is why
  hoisting is the whole contract and why there is no `key`. A conditionally
  emitted surface needs nothing written, and a source that goes out of scope
  becomes collectable rather than orphaning its `THREE.DataTexture`, which the
  old walk-ordinal scheme could not do. A source *synthesized* from a fill chain
  has no such identity, so `resolveFill3D` derives one from the fill's own values
  and marks the surface `static` — a gradient on a cube is rasterized once, not
  sixty times a second to produce the same image.
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

The browser host surface: `MotionPlayer` mounts a canvas, owns the
`PlaybackController`, and exposes a `FrameHandle` ref (screenshot, seek, tree
state, node picking, `hotReplaceScene`, `setScenes`). An editor is built on this.

**What is in its mount effect's dependency array is load-bearing.** Anything
listed there tears down and rebuilds the whole backend — the Skia surface, the
audio device, the clock, the precomp — when it changes. `renderScale`, `view`,
`precompCache`, `precompProfile` and `scenes` are all read through refs for
exactly that reason: they describe the render, or are reconciled onto the live
controller, rather than justifying a new one. Adding a prop to that array is
almost always a mistake; add an effect that reconciles instead.

### `motion-script` (`packages/motion-script`)

The flagship published package: a re-export barrel over `@motion-script/core`
and nothing else — `code` and `latex` are separate dependencies. The recommended
way for end users to depend on the library.

### `@motion-script/engine`

The renderer as a Node library. `createEngine({ fonts, assets })` renders
**in process** on CanvasKit's CPU rasterizer: no browser, no bundler, no dev
server, no project directory, and no GPU, display or driver — so it produces
identical pixels wherever it runs. You hand it the objects `createProject` and
`createStillScene`/`createAnimationScene` return.

```ts
const engine = createEngine({ fonts: [{ family: 'Inter', path: './Inter.ttf' }] });
const still = await engine.renderImage({ project, at: 'last' });
const video = await engine.renderVideo({ project, sink: myFfmpegSink });
```

Things to know when working on this:

- **Renders are serialized.** Node is single-threaded and a CanvasKit render
  blocks it, so overlapping renders would interleave rather than parallelize —
  and the theme and variable registries are process-global, so two renders of
  differently-themed projects would read each other's tokens. Scale out with more
  processes, not more engines.
- **`renderVideo` has no encoder.** The caller supplies a `VideoFrameSink`,
  typically piping `snapshotPixels()` into an `ffmpeg` process.
- **`ffmpeg` is needed to decode images**, which Node cannot do on its own.
  **Video assets are not supported at all yet** (`src/storage-adapter.ts`).
- **Errors are coded, not prose.** `EngineError.code` is what a service maps onto
  a response; a new failure mode needs a code rather than a distinguishable
  message.

### Components: `@motion-script/code`, `@motion-script/latex`

Standalone scene components (syntax-highlighted code blocks; LaTeX math) that
`motion-script` re-exports.

### Supporting workspaces (not published)

- **`site`** — the Next.js docs site (motionscript.dev). `predev`/`prebuild`
  first build the API reference and the search index.
- **`e2e`** — visual regression: renders every scene in process through
  `@motion-script/engine` and pixel-diffs a committed "stable" tarball baseline
  against the branch's "lib" build. Its scenes are built through a local helper
  (`src/scenes/_chain.ts`) over the public `createDrivenScene` seam rather than
  through documents: they exist to prove the *renderer* does not regress, and the
  document model is verified in core's own tests.

## Notes

- The published `@motion-script/canvaskit` package is BSD-3-Clause; everything
  else is Apache-2.0 — keep license headers/files consistent with that split
  when touching either.
- Changesets (`.changeset/`) drive versioning/publishing
  (`version-packages`, `release` scripts) — add a changeset for
  user-facing changes to published packages.
