import { AudioRequest } from "@/attributes/audio/request";
import { BuildStage } from "@/render/build-stage";
import { MeasureScope } from "../render/measure-scope";
import { AssetRecord } from "@/assets/record";
import { Scene } from "@/nodes/base/scene-node";
import { Node } from "@/nodes/base/node";
import { nodePath } from "@/project/tree";
import { AssetCatalog } from "@/assets/catalog";
import { Size2D } from "@/attributes/layout/size";
import { AssetTracker } from "@/assets/tracker";

// ─── Asset track types ────────────────────────────────────────────────────────

/**
 * A single asset's position on the global frame timeline together with the
 * load/evict windows the asset manager uses to keep memory bounded.
 */
export interface AssetTrack {
    record: AssetRecord;
    /**
     * Frame at which loading should begin. Always <= startFrame.
     * Derived from decoded memory footprint: larger assets get earlier lead time.
     */
    cacheAt: number;
    /**
     * Frame at which the asset may be evicted under memory pressure, or null
     * if it should never be evicted (e.g. fonts). Always >= endFrame when set.
     */
    discardAt: number | null;
}



// ─── Per-scene precomp output ─────────────────────────────────────────────────

export interface BuildError {
    /** Name of the scene that threw. */
    sceneName: string;
    /** Zero-based index of the scene in the scenes array. */
    sceneIndex: number;
    message: string;
    stack?: string;
}

/** Scene-local lifespan (inclusive frame range) a node is alive for. */
export interface NodeLifespan {
    /** First scene-local frame the node was present in the tree. */
    startFrame: number;
    /** Last scene-local frame the node was present in the tree. */
    endFrame: number;
}

export interface ScenePrecomp {
    /** Frame count for this scene. */
    frameCount: number;
    /** Absolute frame offset of this scene in the global timeline. */
    startFrame: number;
    /** Audio requests emitted by this scene's nodes, with scene-relative timing. */
    audioRequests: AudioRequest[];
    /**
     * Per-node lifespan within this scene, in scene-local frames. Keyed by the
     * node's structural path (child-index path from the scene root, e.g.
     * "0.2.1") rather than its id: ids are per-instance UUIDs that change when a
     * scene is rebuilt, but the build is deterministic so the structural path is
     * stable between the precomp pass and playback. A node added or removed
     * partway through a scene gets a range narrower than the scene's duration.
     */
    lifespans: Map<string, NodeLifespan>;
}

// ─── Full precomp result ──────────────────────────────────────────────────────

export interface PrecompResult {
    fps: number;
    /** Per-scene durations and audio, in timeline order. */
    scenes: ScenePrecomp[];
    /** Total frame count across all scenes. */
    totalFrames: number;
    /** Total duration in seconds. */
    totalDuration: number;
    /**
     * Complete asset timeline built from one full generator pass per scene.
     * Keyed by stable asset key (src for images/videos, "Family@weight" for fonts).
     */
    assets: ReadonlyMap<string, AssetTrack>;
    /** Errors thrown by scene generators during the build pass. */
    buildErrors: BuildError[];
}

// ─── Precomp runner ───────────────────────────────────────────────────────────

/**
 * Runs a full offline build pass over every scene before playback starts.
 *
 * The pass drives each scene's generator frame-by-frame (without rendering)
 * to collect three things:
 *
 * - **Frame counts** — how long each scene lasts, from which the global
 *   timeline is assembled.
 * - **Asset timeline** — every image / video / font each scene needs, with
 *   the global frame range it is visible, so the asset manager knows exactly
 *   when to load and evict each one.
 * - **Node lifespans** — which structural path was alive during which frames,
 *   used by the timeline UI to draw per-node bars.
 *
 * Construct and then call `run()` once; the result is a `PrecompResult` that
 * `PlaybackController` holds onto for the lifetime of the playback session.
 */
export class Precomp {
    private readonly scenes: Scene[];
    private readonly viewport: Size2D;
    private readonly fps: number;
    private readonly assets: AssetCatalog;
    private readonly measureScope: MeasureScope;

    constructor(
        scenes: Scene[],
        viewport: Size2D,
        fps: number,
        assets: AssetCatalog,
        measureScope: MeasureScope,
    ) {
        this.scenes = scenes;
        this.viewport = viewport;
        this.fps = fps;
        this.assets = assets;
        this.measureScope = measureScope;
    }

    /**
     * Execute the build pass and return the complete precomp result.
     *
     * Each scene is driven through its full generator loop: `build()` yields
     * once per frame, and each tick calls `layout`, `prepareAssets`, and
     * `recordLifespans` before advancing the clock. Errors thrown by a scene
     * generator are caught and recorded in `buildErrors` rather than aborting
     * the entire pass, so other scenes can still precomp successfully.
     */
    run(): PrecompResult {
        const dt = 1 / this.fps;
        const layoutBounds = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height };

        // Single shared registry accumulates across all scenes so frame ranges
        // span the global timeline and cross-scene shared assets merge correctly.
        const registry = new AssetTracker(this.assets);
        const stage = new BuildStage(this.viewport, this.fps);

        const sceneResults: ScenePrecomp[] = [];
        const buildErrors: BuildError[] = [];
        let globalFrameOffset = 0;

        for (let sceneIndex = 0; sceneIndex < this.scenes.length; sceneIndex++) {
            const scene = this.scenes[sceneIndex];
            scene.reset();
            scene.set({ width: this.viewport.width, height: this.viewport.height });
            scene.bindAssets(this.assets);
            stage.reset();

            let localFrame = 0;
            const lifespans = new Map<string, NodeLifespan>();

            try {
                const generator = scene.build(stage);

                // Prime: advance to first yield so frame-0 nodes are registered.
                generator.next(dt);

                while (true) {
                    const globalFrame = globalFrameOffset + localFrame;

                    // layout before prepare — layout gives nodes their layoutRect,
                    // which prepare uses to determine decode resolution.
                    scene.layout(layoutBounds, this.measureScope);

                    registry.start(globalFrame);
                    scene.prepareAssets(registry);
                    registry.end();

                    // Record which nodes are alive this frame so the timeline can
                    // draw each node's bar over only its true lifespan.
                    recordLifespans(scene, "", localFrame, lifespans);

                    localFrame++;
                    scene.bindAssets(this.assets);
                    scene.ellapse(localFrame * dt);

                    const result = generator.next(dt);
                    if (result.done) break;
                }
            } catch (err) {
                const e = err instanceof Error ? err : new Error(String(err));
                buildErrors.push({
                    sceneName: scene.name ?? `Scene ${sceneIndex}`,
                    sceneIndex,
                    message: e.message,
                    stack: e.stack,
                });
            }

            // Scene-boundary blockade: a scene's audio is confined to that
            // scene's own span. Composite scenes (a parent that runs child
            // builds inside its own loop) collect their children's audio into
            // this same request set with parent-relative timing, so they share a
            // timeline as intended — but two sibling top-level scenes are wholly
            // separate, and a clip whose source outlasts the scene (e.g. a long
            // video on a short scene) must not bleed past the cut. Clamp every
            // request's [startAt, endAt) to [0, sceneDuration); drop any that
            // begins at or after the scene ends.
            const sceneDuration = localFrame / this.fps;
            const audioRequests = clampAudioToScene(registry.audioRequests, sceneDuration);
            registry.clearAudio();

            sceneResults.push({
                frameCount: localFrame,
                startFrame: globalFrameOffset,
                audioRequests,
                lifespans,
            });

            globalFrameOffset += localFrame;
            scene.reset();
        }

        return {
            fps: this.fps,
            scenes: sceneResults,
            totalFrames: globalFrameOffset,
            totalDuration: globalFrameOffset / this.fps,
            assets: buildAssetMap(registry, this.fps),
            buildErrors,
        };
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Walk the scene's live node tree and extend each node's lifespan to include
 * `frame`, keyed by structural path (see {@link nodePath}). A node's lifespan
 * starts the first frame its slot appears and ends the last frame it is still
 * present, so nodes added or removed mid-scene get a range narrower than the
 * scene itself. The scene root (path "") is included so its own bar spans the
 * whole scene.
 */
function recordLifespans(node: Node, path: string, frame: number, out: Map<string, NodeLifespan>): void {
    const existing = out.get(path);
    if (existing) {
        existing.endFrame = frame;
    } else {
        out.set(path, { startFrame: frame, endFrame: frame });
    }
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        recordLifespans(children[i], nodePath(path, i), frame, out);
    }
}

/**
 * Confine a scene's audio requests to its own `[0, sceneDuration)` span.
 *
 * Audio is collected per top-level scene (see {@link Precomp.run}), so this is
 * the cut between two sibling scenes: a clip whose source outlasts the scene —
 * e.g. a long video on a short scene, or a `startSound` left running — must not
 * sound or draw past the scene boundary. Composite scenes are unaffected: a
 * parent runs its children's builds inside its *own* loop, so their requests are
 * already parent-relative and bounded by the parent's (longer) duration.
 *
 * Each request is clipped to the span: a `startAt` at or after the end drops the
 * request entirely; an `endAt` past the end (including an unbounded `Infinity`
 * loop) is pulled back to the boundary.
 */
function clampAudioToScene(requests: readonly AudioRequest[], sceneDuration: number): AudioRequest[] {
    const out: AudioRequest[] = [];
    for (const req of requests) {
        if (req.startAt >= sceneDuration) continue;
        const endAt = Math.min(req.endAt, sceneDuration);
        if (endAt <= req.startAt) continue;
        out.push(endAt === req.endAt ? { ...req } : { ...req, endAt });
    }
    return out;
}

/**
 * Lead-time tuning constants.
 *
 * LEADS_PER_MB: frames of lead time granted per decoded megabyte.
 * A 4K image (~32 MB) gets ~64 frames; a 256×256 thumbnail (~0.25 MB) gets
 * MIN_LEAD. These are intentionally conservative starting values.
 */
const LEADS_PER_MB = 2;
const MIN_LEAD = 2;
const MAX_LEAD = 120;
/** Frames to keep an asset alive after its last use (backward-scrub headroom). */
const TAIL_FRAMES = 30;

/** Decoded RGBA memory footprint of a frame with the given pixel dimensions. */
function decodedMB(width: number, height: number): number {
    return (width * height * 4) / (1024 * 1024);
}

/** Clamp-scaled lead time in frames for an asset of `mb` decoded megabytes. */
function leadFrames(mb: number): number {
    return Math.min(MAX_LEAD, Math.max(MIN_LEAD, Math.round(mb * LEADS_PER_MB)));
}

/**
 * Convert the raw asset registry into the typed `AssetTrack` map consumed by
 * `AssetManager`. Each asset type gets a `cacheAt` / `discardAt` window based
 * on its decoded size and usage range. Fonts are pinned at frame 0 and never
 * evicted; images and video get size-proportional lead time.
 */
function buildAssetMap(registry: AssetTracker, fps: number): ReadonlyMap<string, AssetTrack> {
    const out = new Map<string, AssetTrack>();

    for (const [key, entry] of registry.assets) {
        switch (entry.type) {
            case "image": {
                const mb = decodedMB(entry.width, entry.height);
                const lead = leadFrames(mb);
                out.set(key, {

                    record: entry,

                    cacheAt: Math.max(0, entry.startFrame - lead),
                    discardAt: entry.endFrame + TAIL_FRAMES,
                });
                break;
            }
            case "video": {
                const mb = decodedMB(entry.width, entry.height);
                // Video decode is heavier than image: double the lead, then
                // also add a fixed buffer so short clips still get real headroom.
                const lead = Math.min(MAX_LEAD, leadFrames(mb) * 2 + Math.round(fps));
                out.set(key, {
                    record: entry,

                    cacheAt: Math.max(0, entry.startFrame - lead),
                    discardAt: entry.endFrame + TAIL_FRAMES,
                });
                break;
            }
            case "font":
                // Fonts are tiny and referenced throughout; always load at frame 0
                // and never evict.
                out.set(key, {
                    record: entry,

                    cacheAt: 0,
                    discardAt: null,
                });
                break;
            case "loader":
                // Opaque loaders (e.g. a syntax-highlight language) are cheap and
                // needed for the whole span they're requested over. Load ahead of
                // the first use and keep a backward-scrub tail before disposing.
                out.set(key, {
                    record: entry,
                    cacheAt: Math.max(0, entry.startFrame - MAX_LEAD),
                    discardAt: entry.endFrame + TAIL_FRAMES,
                });
                break;
        }
    }

    return out;
}
