# @motion-script/e2e

Visual end-to-end tests for Motion Script. One scene per checkbox in
[`scripts/TESTS.md`](../../scripts/TESTS.md), rendered at **960×540 (Quarter HD),
30 fps**. For each scene the harness captures the **first, mid, and last frame**
and pixel-diffs a **packed "stable" build** of the library against the **live
"lib" build**, so a rendering regression between the two shows up as a visible
diff and a non-zero exit code.

This package is private (never published). It exists only to render and compare.

---

## How it works

```
TESTS.md ──gen──▶ src/scenes/*.tsx ──┐
                                      ├─▶ createProject (src/project.ts)
src/scenes/catalog.{ts,json} ◀────────┘        960×540 · 30fps
        │
        │   shoot.ts drives the project headlessly (HeadlessDriver from
        │   @motion-script/cli) and writes 3 PNGs per scene:
        ▼
   out/lib/<id>.{first,mid,last}.png      ← live workspace build
   out/stable/<id>.{first,mid,last}.png   ← packed tarball build
        │
        │   compare.ts pixel-diffs stable vs lib (pixelmatch)
        ▼
   out/diff/<id>.<frame>.png  +  out/report.html  +  out/compare-summary.json
```

- **One scene file per checkbox.** Every `` - [ ] `id` — … `` line in TESTS.md
  maps to `src/scenes/<id>.tsx`. Real sample scenes are hand-authored; the rest
  are placeholder stubs (rendering the scene id) until someone fills them in.
  A stub still produces a valid, comparable frame, so the pipeline is complete
  from day one. See [Adding / filling in scenes](#adding--filling-in-scenes).
- **Fixed-length scenes.** Each scene runs ~2s (≈60 frames). The harness reads
  the real frame count per scene and resolves first / mid / last to frames
  `0 / floor((n-1)/2) / n-1` (see [`scripts/lib/frames.ts`](scripts/lib/frames.ts)).
- **stable vs lib.** There's no published baseline yet, so "stable" is built by
  packing the *current* `@motion-script/*` packages into tarballs and rendering
  the **same scenes** against them. Both sides render identical source; only
  the resolved library differs, so the diff isolates library changes.

---

## Quick start (local)

From the **repo root**:

```bash
# 1. Build the library (once, or after any library change)
pnpm build:lib

# 2. Build the stable snapshot. Two modes:
#    a) Move the baseline to "current": pack the current packages into tarballs
#       (committed to git) and stand up packages/e2e/stable/ from them.
pnpm e2e:stable                 # add --no-build if you just ran build:lib
#    b) Use the committed tarballs as-is (the concurrent baseline), no repack:
pnpm e2e:stable:from-tarballs

# 3. Render both variants and compare
pnpm test:e2e              # = e2e/scripts/run.ts: shoot stable, shoot lib, compare
```

The packed tarballs under `stable/tarballs/*.tgz` are **committed to git** and act
as the shared baseline. On a feature branch you typically run
`pnpm e2e:stable:from-tarballs` (baseline = committed tarballs) then `pnpm test:e2e`.
Your working tree renders as `lib` and is diffed against the frozen `stable`.
Run plain `pnpm e2e:stable` and commit the result when you want to advance the
baseline to the current library.

Open `packages/e2e/out/report.html` to see every scene's stable / lib / diff
thumbnails side by side. The command exits non-zero if any frame differs by more
than the threshold (default 0.1% of pixels).

### Individual steps

```bash
# regenerate scene files + catalog from TESTS.md (safe: never clobbers a scene
# file that already exists, only adds stubs for new checkboxes)
pnpm --filter @motion-script/e2e run gen

# render just one variant (optionally a subset of scenes)
pnpm e2e:shoot:lib
pnpm e2e:shoot:stable
pnpm --filter @motion-script/e2e run screenshot -- --variant lib --scenes rect-basic,text-basic

# compare whatever is already in out/
pnpm e2e:compare
pnpm --filter @motion-script/e2e run compare -- --threshold 0.25
```

### Look at a single scene

```bash
pnpm --filter @motion-script/e2e exec ms screenshot last --scenes OpacityNode
```

---

## Docker (reproducible reference run)

Text rendering depends on the installed fonts and GL backend, so the canonical
comparison runs in a container with a pinned Chromium, fixed fonts, and software
WebGL. **Build context is the repo root.**

```bash
# one-liner
docker compose -f packages/e2e/docker-compose.yml run --rm e2e

# or by hand
docker build -f packages/e2e/Dockerfile -t motion-script-e2e .
docker run --rm -v "$PWD/packages/e2e/out:/repo/packages/e2e/out" motion-script-e2e
```

The container builds the library, packs the stable snapshot, renders both
variants, and compares, writing `out/report.html` (and screenshots/diffs) back
to the host through the mounted `out/` volume. It exits non-zero on any diff, so
it drops straight into CI.

`MS_SOFTWARE_RENDER=1` is set in the image (no GPU in a container → SwiftShader).

---

## CI (GitHub Actions)

[`.github/workflows/e2e-visual.yml`](../../.github/workflows/e2e-visual.yml) runs
on every PR and push to `main`. It builds the harness Docker image (with GHA
layer caching), then inside the container builds the stable project from the
**committed tarballs** (`pack-stable.js --from-tarballs`) and runs
`pnpm test:e2e`. The job fails on any pixel diff over threshold, and uploads
`report.html` + diffs as the `e2e-visual-report` artifact on every run (pass or
fail) so a regression can be inspected from the run page.

Because the baseline is the committed tarballs, the diff answers: *"does this
branch render the scenes differently than the last committed baseline?"* To
advance the baseline, run `pnpm e2e:stable` locally and commit the updated
`stable/tarballs/*.tgz`.

---

## Adding / filling in scenes

A stub scene looks like:

```tsx
/** @jsxImportSource @motion-script/core/jsx */
import { createScene } from '@motion-script/core';
import { placeholder } from './_lib';

export default createScene(placeholder('rect-basic'));
```

To make it a **real** test, replace the body with an actual scene. Keep the
filename (`<id>.tsx`): the id is also the headless scene name and the catalog
key. Author to ~2 seconds total and `holdTail(usedSeconds)` so the mid frame
lands on something meaningful:

```tsx
/** @jsxImportSource @motion-script/core/jsx */
import { createScene, createRef, Rect, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(<Rect ref={rect} width={320} height={200} fill={'primary'} scale={0.6} />);
    yield* rect().to({ scale: 1 }, 1, easeInOut('quad'));
    yield* holdTail(1);   // pad to the standard 2s runtime
});
```

The hand-authored sample scenes (good references, one per area) include:
`rect-basic`, `rect-corner-radius`, `ellipse-circle`, `polygram-star-5`,
`text-basic`, `fill-linear-gradient`, `transform-position`,
`transform-rotation`, `transform-scale-uniform`, `ease-bounce`,
`stroke-dash-animated`, `shadow-drop-basic`, `effect-blur`, `camera-zoom`,
`cardinal-node-center`, `shape-start-end-rect`, `latex-basic`, `code-basic`.

After adding a checkbox to TESTS.md, run `pnpm --filter @motion-script/e2e run gen`
to scaffold its stub and refresh the catalog.

---

## Layout

```
packages/e2e/
├── src/
│   ├── project.ts            # createProject({ 960×540, 30fps, scenes })
│   ├── motion-script.d.ts
│   └── scenes/
│       ├── _lib.tsx          # SCENE_SECONDS, holdTail(), placeholder()
│       ├── catalog.ts        # AUTO-GENERATED: scene instances + metadata
│       ├── catalog.json      # AUTO-GENERATED: metadata for the Node harness
│       └── <id>.tsx          # one per TESTS.md checkbox
├── scripts/
│   ├── gen-scenes.ts         # TESTS.md → scene stubs + catalog
│   ├── shoot.ts              # render first/mid/last per scene (--variant lib|stable)
│   ├── compare.ts            # pixel-diff stable vs lib → report.html
│   ├── run.ts                # full pipeline (pnpm test:e2e)
│   └── lib/                  # frames.ts, scene-name.ts, report.ts
├── stable/                   # GENERATED by `pnpm e2e:stable` (gitignored)
│   ├── tarballs/*.tgz        # packed @motion-script/* packages
│   ├── node_modules/         # tarballs extracted flat + 3rd-party deps
│   └── src/                  # copy of ../src (same scenes)
├── out/                      # GENERATED screenshots, diffs, report (gitignored)
├── Dockerfile
└── docker-compose.yml
```

### Why `stable/` extracts tarballs instead of `pnpm install`-ing them

The packed packages share the workspace version (e.g. `2.9.2`). Installing them
as `file:*.tgz` deps lets pnpm key them by `name@version` and reuse a cached
extraction of that version for the *transitive* `@motion-script/*` deps
(`cli` → `core`, …), silently mixing a stale copy in. To guarantee the
snapshot is exactly the bytes just packed, `pack-stable.js` extracts every
tarball into `stable/node_modules/@motion-script/<name>/` (flat, real dirs) and
installs only third-party deps. With flat real dirs every `@motion-script/*`
import, direct or transitive, resolves to the extracted tarball.

---

## Notes & gotchas

- **Threshold.** Default pass tolerance is 0.1% changed pixels, which absorbs
  sub-pixel anti-aliasing noise. Tune with `--threshold` on `compare`/`run`.
- **Async components.** `Code`/`Latex` nodes resolve fonts/highlighting
  asynchronously; their layout can settle a frame late, showing up as a small
  (~1%) diff even between identical builds. Compare in Docker for the stable
  reference, and treat sub-threshold variance on those scenes as noise.
- **Cold Vite cache.** The first headless load on a fresh checkout can race
  Vite's dep optimizer and 504; `shoot.ts` retries `start()` on a warm cache.
- **GPU vs software.** Locally the driver uses the real GPU (`--headless=new`).
  Set `MS_SOFTWARE_RENDER=1` to force SwiftShader (what Docker/CI use).
```
