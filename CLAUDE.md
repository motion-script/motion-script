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
  point of a renderable project. Also the **project-level content** that spans
  scenes rather than living in one — see [Project globals](#project-globals).
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
`NodeRenderState.elapsed`), so it plays in a custom node's `Graphics`, a stroke
or a shadow with no `tick` override — and frame *N* is identical however the
playhead reached it. `FillData` has no `update`/`dynamic` hook; a new fill kind
that varies with time reads the clock at paint time the same way.

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

- **A layer is not in the scene tree.** `Scene.reset()` disposes and clears the
  root's children on every pass, and there is no generator to re-add a config
  node, so each layer gets its own viewport-sized `RootNode` frame owned by
  `ProjectGlobals` (`packages/core/src/runtime/globals.ts`) for the life of the
  runtime. That is also what gives layers their semantics: outside the scene
  camera (`zoom`/`origin`/`heading`), outside its `clip`, and over its `overlay`
  fill rather than under it.
- **Declare layers as factories** (`() => <Watermark/>`). The project module is
  evaluated before the runtime calls `setTheme`, so a node built inline at module
  scope resolves theme tokens against an empty registry; the runtime invokes a
  factory afterwards.
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

### `@motion-script/web` — the web rendering backend

Implements `core`'s `RenderContext` against Skia/CanvasKit. Notable exports
(`packages/web/src/index.ts`): `WebRenderContext` (draws frames via
CanvasKit), `getCanvasKit` (loads/inits the WASM module), `EffectHandler` /
`EffectRegistry` (`packages/web/src/effects/` — SkSL shader effects),
`exportScenesAsVideo` (encodes frames to video via `mediabunny`),
`WebAudioPlayer`, `WebMasterClock`, `WebMeasureScope`, `WebStorageAdapter`
(browser implementations of `core`'s platform seams), and `View3DBackend`
(three.js, lazily imported — see [3D](#3d-graphics3d-and-view3d)).

### 3D: `Graphics3D` and `View3D`

3D follows the same split as 2D: `core` describes a scene as pure data
(`packages/core/src/render3d/`), and `web` renders it (three.js lives there,
never in core).

**3D is a fill, so it paints through any shape path.** The renderer draws a scene
to a texture and shades the shape's own path with it, which means 3D clips to
whatever painted it — an `Ellipse`, a `Path`, a run of `Text` — stacks with the
other fill layers, and inherits their `opacity`/`blend`/`space`:

```tsx
<Ellipse fill={g3} />
<Text text="DEPTH" fontSize={320} fill={Fills.view3D(g3)} />
<Rect fill={["#0b0d12", g3, Fills.linearGradient(["transparent", "#000/60"])]} />
```

A bare `Graphics3D` coerces to a `view3D` fill exactly the way a bare CSS string
coerces to a solid one (`resolveFill`, the single coercion point).

**There is one 3D node, not a 3D node tree.** `NodeProps` are 2D concepts
(`x`/`y`/`width`/`opacity`/`flex`/`padding`/anchors) that mean nothing for a mesh
positioned in 3D space, so everything inside a 3D scene is described with
`Graphics3D` instead.

`View3D` (`packages/core/src/nodes/three/view3d-node.ts`) is **sugar over that
fill**: a `Rect` that appends its scene to its own `fill`. So it lays out in
flex/stack groups, takes `cornerRadius`/`clip`, can be masked, blended and
filtered, and holds 2D children as a HUD over the 3D. For a reusable component,
subclass it and override `buildGraphics3D()`.

```tsx
<View3D width="fill" height="fill" cornerRadius={24}
    graphics3D={() => new Graphics3D()
        .perspective({ position: [0, 2, 6], lookAt: 0, fov: 45 })
        .ambient({ intensity: 0.4 })
        .directional({ intensity: 2.4, position: [4, 6, 3] })
        .box({ width: 2, color: "tomato", roughness: 0.3, rotation: [0, spin(), 0] })
        .group({ position: [3, 0, 0] }, inner => inner.sphere({ radius: 0.8 }))}
/>
```

Key things to know when working on this:

- **`g` is a 2D `Graphics`; `g3` is a `Graphics3D`.** No exceptions, in code,
  docs or examples. The two recorders take entirely different ops, and one scene
  routinely holds both (a `Graphics3D` for the 3D, a `Graphics` for each
  `Tex.surface` source), so a bare `g` must always mean the 2D one.
- **Angles are degrees everywhere** (Euler rotations, spot cone angles, sweep
  arcs, UV rotation), matching 2D `rotation`. The backend converts.
- **A `Graphics3D` is a value, never a builder.** Per-frame freshness comes from
  *where it is produced*: `buildGraphics3D()` runs inside `renderSelf` every
  frame, and a `graphics3D={() => …}` prop is an ordinary reactive binding. Frame
  *N* is identical however the playhead got there — nothing accumulates.
- **There is no `t`.** A bound prop re-evaluates when the *signals* it reads
  change, and `clock.elapsed` is a plain field, not a signal — so
  `graphics3D={() => build(this.clock.elapsed)}` computes **once and freezes**,
  with no error and a plausible-looking still image. Drive procedural motion from
  a tweened signal (which also puts it on the timeline, so it scrubs), or read
  `this.clock.elapsed` inside `buildGraphics3D`, which does re-run every frame.
- A signal holding a non-number **must** be given a lerp
  (`createSignal(v, lerpVector3)`) or it snaps at the end of the tween instead of
  interpolating.
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
  geometries are immutable, so `.box({ width: signal() })` reallocates every
  frame. Scale the object instead: `.box({ width: 1, scale: [signal(), 1, 1] })`.
  The fields marked "structural" on `MaterialCommon3D` recompile the shader
  program; set them once rather than tweening them.

Rendering path — a **fill layer**, so position in the fill array is paint order
and the shape's path is the clip:

```
View3D.renderSelf → Fills.view3D(g3)              [core, pure data]
  → FillHandler.applyFills → View3DFillRenderer.preflight()
      → rasterize any Tex.surface sources        (offscreen readPixels)
      → View3DBackend.render()  reconcile ops → cached THREE.Scene, render
      → upload3DFrame()         makeImageFromTextureSource(…, srcIsPremul: true)
  → View3DFillRenderer.applyPaint → paint.setShader(image)
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

The reconciler (`packages/web/src/three/reconciler.ts`) keeps one live three
object per op, keyed by structural path, and mutates rather than rebuilds — a
`Graphics3D` is rebuilt from scratch every frame but the GPU resources are not.

three is reached through a lazy `import("three")`, so 2D-only projects never load
it. `View3D.prepareRender()` warms it during precomp (before any frame draws) via
core's `registerView3DWarmup` seam; if a frame still beats it, the existing
`warmPendingVideo` re-render loop covers it, so exports stay frame-accurate.
Because the dev server's root is the player app, `vite-plugin` resolves `three`
from `@motion-script/web`'s location and declares it in `optimizeDeps.include` —
without that the dynamic import 504s under the headless CLI.

#### 2D on 3D: `Tex.surface`

The bridge the other way: 2D content rendered to an offscreen buffer and bound to
any material map. `source` is a **value** — a built `Graphics`, or a `Node`
subtree for anything wanting real layout, shaped `Text` or a loaded `Image` — and
`width`/`height` *are* the texture's resolution.

```tsx
const scope = new Graphics().line({ points: trace(phase()) }).stroke({ weight: 6 });
const stats = <Rect group="column" padding={48}><Text text="CPU" fontSize={64} /></Rect>;

<View3D graphics3D={() => new Graphics3D()
    .plane({ map: Tex.surface(scope, 1024, 640) })
    .plane({ map: Tex.surface(stats, 1024, 640), position: [5, 0, 0] })}
/>
```

- **A source is not a child, and has no name.** It is a value in a descriptor.
  What tree membership used to supply — the asset catalog (a webfont never shapes
  and an `<Image>` never loads without it), the resolved context map, and a
  ticking clock — is instead handed over by whatever paints the scene, via
  `Node.adoptDetached`. Layout is done on demand against `width`×`height`.
- **Hoist the source; never build it inside the scene builder.** A fresh subtree
  each frame re-binds, re-lays-out, defeats the texture cache and leaks.
- **A conditionally emitted surface needs an explicit `key`.** The texture cache
  is global and un-refcounted, so a shifting walk ordinal orphans the old
  `THREE.DataTexture` rather than reusing it.
- Path: `View3DFillRenderer.preflight` → `FillRendererContext.rasterizeSurface`
  → `WebRenderContext` swaps `currentCanvas` + `activeSurface` onto a sized
  offscreen, `readPixels` → `TextureResolver.setRasters` uploads into a
  `THREE.DataTexture` keyed by descriptor identity + the owning fill slot.
- **Precomp discovery is `TrackRenderContext.trackSurfaceSources`.** A source is
  2D content one level below the scene, so only a walk *into* it finds its fonts
  and image fills — `FillData.prepare` receives an `AssetTracker`, not a render
  context, so the tracking context does it directly. Bounded by a depth cap, since
  a surface can itself paint a 3D fill.
- **`activeSurface`, not `this.surface`** — anything in `WebRenderContext` needing
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
