import { AssetCatalog } from "@/assets/catalog";
import { Clip } from "@/render/clip";
import { Graphics2D } from "@/render/graphics2d";
import type { RenderContext2D } from "@/render/render-context2d";
import { CanvasRenderContext2D } from "@/render/canvas-render-context2d";
import type { BooleanOperation } from "@/attributes/mask/boolean";
import type { MaskOptions } from "@/attributes/mask/mask";
import type { Scene } from "@/nodes/scene/scene-node";
import type { Size2D } from "@/attributes/layout/size";
import type { TransformState } from "@/render/descriptors/transform";
import type { Vector2 } from "@/attributes/layout/vector2";
import { Precomp } from "@/runtime/precompisition";
import { StateEvaluator } from "@/runtime/state-evaluator";
import { now } from "@/util/scheduler";
import { FakeAssetCatalog, FakeMeasurer, asCatalog } from "./runtime.fixtures";

/**
 * An instrument for the **playback** path — what the editor and an export
 * actually spend a frame on.
 *
 * `precomp-profile.bench.test.ts` measures the other half: the measuring pass,
 * whose render phase is the `TrackRenderContext` walk. That walk can never be
 * skipped (asset discovery has to run every frame), and it is not what plays a
 * video. Optimisation work aimed at playback that is judged on the precomp bench
 * is being judged on the wrong number.
 *
 * ## Counters first, milliseconds second
 *
 * The wall clock on this machine varies by ±25% run to run, which is wider than
 * most changes worth making — a stopwatch cannot tell a real 15% win from noise,
 * and it certainly cannot tell a *regression* from a lucky run. So the primary
 * output is a set of **deterministic counts**: how many nodes the walk visited,
 * how many `Graphics2D` it submitted, how many ops those carried. Those numbers are
 * identical on every run of the same code, so a change of one is a change in
 * behaviour and nothing else. Timings ride along for scale, and should be read as
 * an order of magnitude rather than a measurement.
 */

/** What one profiled run observed. */
export interface PlaybackCounts {
    /** Frames driven. */
    frames: number;
    /** `begin()` calls — one per node the render walk actually entered. */
    nodesVisited: number;
    /** `draw()` calls — one per `Graphics2D` handed to the renderer. */
    graphicsDrawn: number;
    /** Total ops across those, i.e. how much the renderer was asked to do. */
    opsDrawn: number;
    /** `beginClip()` calls. */
    clips: number;
    /** `transform()` calls — one per node that pushed a transform. */
    transforms: number;
    /** `measureText()` calls, the expensive half of layout in a text-heavy scene. */
    textMeasures: number;
    /**
     * Distinct `Graphics2D` **instances** seen across the whole run.
     *
     * The one number that can see descriptor *reuse*. `graphicsDrawn` cannot: a
     * cache avoids **building** a descriptor, not submitting one, so the draw
     * count is identical either way. Reuse shows up only as identity — a node
     * that rebuilds every frame contributes one instance per frame, a cached one
     * contributes one for the whole run. Nothing caches today, so this currently
     * tracks `graphicsDrawn`; it is the instrument any future attempt is measured
     * with.
     */
    graphicsBuilt: number;
}

export interface PlaybackTimings {
    /** Generator replay + `ellapse` + the layout inside `stateAt`. */
    stateMs: number;
    /** The public `layout()` pass the renderer needs before drawing. */
    layoutMs: number;
    /** The render walk. */
    renderMs: number;
    totalMs: number;
}

export interface PlaybackProfile {
    counts: PlaybackCounts;
    timings: PlaybackTimings;
}

/**
 * A concrete {@link RenderContext2D} that draws nothing and counts everything.
 *
 * Declares `drawsVisibleOnly` (the default), so it takes the same branches a real
 * painting backend does — including the invisible-subtree skip, which is the
 * whole point: a fake context that behaved like the tracker would report the walk
 * a *precomp* does, not the one a frame does.
 */
export class CountingRenderContext extends CanvasRenderContext2D {
    nodesVisited = 0;
    graphicsDrawn = 0;
    opsDrawn = 0;
    clips = 0;
    transforms = 0;
    textMeasures = 0;
    /** Identities seen, so a reused descriptor is counted once. */
    readonly seen = new Set<Graphics2D>();

    reset(): void {
        this.nodesVisited = 0;
        this.graphicsDrawn = 0;
        this.opsDrawn = 0;
        this.clips = 0;
        this.transforms = 0;
        this.textMeasures = 0;
        this.seen.clear();
    }

    override begin(state: Parameters<RenderContext2D["begin"]>[0]): void {
        this.nodesVisited++;
        super.begin(state);
    }

    protected drawGraphics(graphics: Graphics2D): void {
        this.graphicsDrawn++;
        this.opsDrawn += graphics.ops().length;
        this.seen.add(graphics);
    }

    measureText(text: string, fontSize = 8): Size2D {
        this.textMeasures++;
        // Proportional to length so a layout that depends on text width still
        // varies, without pretending to shape anything.
        return { width: text.length * 8, height: fontSize };
    }

    execute(callback: () => void): void { callback(); }
    unmount(): void { }
    screenshot(): string | undefined { return undefined; }

    transform(state: Partial<TransformState>): RenderContext2D {
        this.transforms++;
        return this;
    }

    beginClip(clip: Clip): void { this.clips++; }
    endClip(): void { }
    beginBoolean(op: BooleanOperation): void { }
    endBoolean(): void { }
    beginMask(_options?: MaskOptions): void { }
    applyMask(): void { }
    endMask(): void { }
    beginCamera(
        _viewport: { x: number; y: number; width: number; height: number },
        _lookAt: Vector2,
        _zoom: number,
        _heading: number,
    ): void { }
    endCamera(): void { }
}

/**
 * Drive `scene` through `frames` frames of playback and report what it cost.
 *
 * Mirrors what `PlaybackController` does per tick — `stateAt`, then `layout`,
 * then `render` — because the point is to measure that, not an approximation of
 * it. The precomp is run first (as it is in the real thing) and is deliberately
 * **not** included in the timings: it happens once per scene and is cached, while
 * everything counted here happens sixty times a second.
 */
export function profilePlayback(scene: Scene, frames: number): PlaybackProfile {
    const viewport: Size2D = { width: 1920, height: 1080 };
    const fps = 60;
    const catalog = asCatalog(new FakeAssetCatalog()) as unknown as AssetCatalog;
    const scenes = [scene];

    const precomp = new Precomp(scenes, viewport, fps, catalog, new FakeMeasurer()).run();
    const tracks = precomp.scenes.map(s => s.frameCount);

    const ctx = new CountingRenderContext();
    const evaluator = new StateEvaluator(scenes, viewport, fps, catalog, tracks, ctx);

    // A first frame warms the tree: it builds nodes, binds context and assets, and
    // fills every cache. Counting it would report construction costs as if they
    // were per-frame ones, which is exactly the confusion this exists to remove.
    evaluator.stateAt(0);
    evaluator.layout(ctx);
    evaluator.render(ctx);
    ctx.reset();

    let stateMs = 0;
    let layoutMs = 0;
    let renderMs = 0;
    const total = Math.min(frames, Math.max(1, tracks[0] ?? 1));

    const start = now();
    for (let frame = 1; frame < total; frame++) {
        let t = now();
        evaluator.stateAt(frame);
        stateMs += now() - t;

        t = now();
        evaluator.layout(ctx);
        layoutMs += now() - t;

        t = now();
        evaluator.render(ctx);
        renderMs += now() - t;
    }
    const totalMs = now() - start;

    evaluator.dispose();

    return {
        counts: {
            frames: total - 1,
            nodesVisited: ctx.nodesVisited,
            graphicsDrawn: ctx.graphicsDrawn,
            opsDrawn: ctx.opsDrawn,
            clips: ctx.clips,
            transforms: ctx.transforms,
            textMeasures: ctx.textMeasures,
            graphicsBuilt: ctx.seen.size,
        },
        timings: { stateMs, layoutMs, renderMs, totalMs },
    };
}
