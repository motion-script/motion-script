import { AudioRequest } from "@/attributes/audio/request";
import { BuildStage } from "@/render/build-stage";
import { MeasureScope } from "../render/measure-scope";
import { AssetRecord } from "@/assets/record";
import { Node } from "@/nodes/base/node";
import { nodePath } from "@/project/tree";
import { AssetCatalog } from "@/assets/catalog";
import { ContextMap } from "@/util/context";
import { Size2D } from "@/attributes/layout/size";
import { AssetTracker } from "@/assets/tracker";
import { Scene } from "@/nodes/scene/scene-node";

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

/**
 * Everything learned from running one scene's generator to completion, in
 * **scene-local** terms (frame 0 = the scene's first frame).
 *
 * Scenes are independent units — they no longer compose — so each scene's pass
 * is fully self-contained: its frame count, its own asset usage, its audio, and
 * its node lifespans are all scene-local. The only place a scene's global
 * position enters is `startFrame`, recomputed cheaply when an upstream scene's
 * duration changes (see {@link assembleTimeline}). This is what makes a single
 * scene re-runnable in isolation for hot reloading.
 */
export interface ScenePrecomp {
    /** Frame count for this scene. */
    frameCount: number;
    /** Absolute frame offset of this scene in the global timeline. */
    startFrame: number;
    /** Audio requests emitted by this scene's nodes, with scene-relative timing. */
    audioRequests: AudioRequest[];
    /**
     * This scene's own asset usage, in **scene-local** frames (records carry
     * `startFrame`/`endFrame` relative to the scene). Merged and shifted into the
     * global asset map by {@link assembleTimeline}. Keyed by stable asset key
     * (src for images/videos, family for fonts).
     */
    assetRecords: ReadonlyMap<string, AssetRecord>;
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
     * Complete asset timeline assembled by merging every scene's own asset usage,
     * each shifted by that scene's global startFrame. Keyed by stable asset key
     * (src for images/videos, "Family" for fonts).
     */
    assets: ReadonlyMap<string, AssetTrack>;
    /** Errors thrown by scene generators during the build pass. */
    buildErrors: BuildError[];
}

// ─── Precomp runner ───────────────────────────────────────────────────────────

/**
 * Runs offline build passes over a project's scenes before/while it plays.
 *
 * Each scene is driven through its generator (without rendering) to learn its
 * frame count, asset usage, audio, and per-node lifespans — all scene-local.
 * {@link run} does this for every scene up front; {@link replaceScene} re-runs a
 * single scene and reuses every other scene's cached pass, which is what makes
 * scene-level hot reloading cheap (editing scene N never re-runs scenes ≠ N).
 *
 * The runner is stateless across calls: `run`/`replaceScene` return a fresh
 * immutable {@link PrecompResult} the `PlaybackController` swaps in.
 */
export class Precomp {
    private scenes: Scene[];
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

    /** The scene list this precomp drives (kept in sync by {@link replaceScene}). */
    get sceneList(): readonly Scene[] {
        return this.scenes;
    }

    /**
     * Execute a build pass over every scene and assemble the complete result.
     *
     * Each scene's generator is driven through its full loop: `build()` yields
     * once per frame, and each tick collects fonts, lays out, collects
     * image/video/paint assets, and records lifespans before advancing the
     * clock (see {@link precompScene}). A scene that throws is
     * recorded in `buildErrors` rather than aborting the whole pass, so other
     * scenes still precomp.
     */
    run(): PrecompResult {
        const perScene: ScenePrecomp[] = [];
        const buildErrors: BuildError[] = [];

        for (let i = 0; i < this.scenes.length; i++) {
            const { precomp, error } = this.precompScene(this.scenes[i], i);
            perScene.push(precomp);
            if (error) buildErrors.push(error);
        }

        return assembleTimeline(perScene, buildErrors, this.fps);
    }

    /**
     * Re-run a single scene and produce a fresh result that reuses every other
     * scene's cached pass. The replaced scene's new frame count shifts all
     * downstream `startFrame`s and re-merges the global asset map; nothing about
     * the untouched scenes is recomputed.
     *
     * @param prev      The current result whose other scenes are reused.
     * @param index     Index of the scene to re-run.
     * @param newScene  The edited scene instance to swap in at `index`.
     */
    replaceScene(prev: PrecompResult, index: number, newScene: Scene): PrecompResult {
        this.scenes = this.scenes.slice();
        this.scenes[index] = newScene;

        const { precomp, error } = this.precompScene(newScene, index);

        const perScene = prev.scenes.slice();
        perScene[index] = precomp;

        // Carry forward the other scenes' build errors; replace this scene's.
        const buildErrors = prev.buildErrors.filter(e => e.sceneIndex !== index);
        if (error) buildErrors.push(error);

        return assembleTimeline(perScene, buildErrors, this.fps);
    }

    /**
     * Drive one scene's generator to completion and collect its scene-local
     * precomp (frame count, asset usage, audio, lifespans). `startFrame` is left
     * 0 here and filled in by {@link assembleTimeline}.
     */
    private precompScene(scene: Scene, sceneIndex: number): { precomp: ScenePrecomp; error?: BuildError } {
        const dt = 1 / this.fps;
        const layoutBounds = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height };

        // A fresh, scene-local registry: frame ranges are relative to this scene's
        // own frame 0, so the pass is independent of where the scene sits on the
        // global timeline. assembleTimeline shifts these into absolute frames.
        const registry = new AssetTracker(this.assets);
        const stage = new BuildStage<Scene>(this.viewport, this.fps);

        scene.reset();
        scene.set({ width: this.viewport.width, height: this.viewport.height });
        scene.setViewport(this.viewport);
        scene.bindAssets(this.assets);
        // Mark the root context-bound (after reset restored defaults) so nodes the
        // generator adds below inherit context and run their init() on add. runInit
        // here fires init() for any nodes already present (e.g. config children).
        scene.bindContext(ContextMap.EMPTY, true);
        stage.reset();

        let localFrame = 0;
        const lifespans = new Map<string, NodeLifespan>();
        let error: BuildError | undefined;

        try {
            const generator = scene.build(stage);

            // Prime: advance to first yield so frame-0 nodes are registered.
            generator.next(dt);

            while (true) {
                registry.start(localFrame);

                // Two-phase asset prep around layout. Fonts are gathered first
                // (prepareLayoutAssets) because text/code measurement needs the
                // real typeface metrics — collecting them after layout would
                // measure against a fallback face. layout() then resolves every
                // node's layoutRect, which the render-phase prep
                // (prepareRenderAssets: images/video/paint) reads to size its
                // decodes.
                scene.prepareLayoutAssets(registry);
                scene.layout(layoutBounds, this.measureScope);
                scene.prepareRenderAssets(registry);

                registry.end();

                // Record which nodes are alive this frame so the timeline can draw
                // each node's bar over only its true lifespan. The scene's world
                // lives on `scene.root` (path "" = root).
                recordLifespans(scene.root, "", localFrame, lifespans);

                localFrame++;
                scene.bindAssets(this.assets);
                // Structural re-push only (runInit=false): refresh context on any
                // subtree added this frame without re-firing init mid-tween.
                scene.bindContext(ContextMap.EMPTY, false);
                scene.ellapse(localFrame * dt);

                const result = generator.next(dt);
                if (result.done) break;
            }
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            error = {
                sceneName: scene.name ?? `Scene ${sceneIndex}`,
                sceneIndex,
                message: e.message,
                stack: e.stack,
            };
        }

        // Scene-boundary blockade: a clip whose source outlasts the scene (e.g. a
        // long video on a short scene, or a startSound left running) must not
        // bleed past the cut. Clamp every request to [0, sceneDuration); drop any
        // that begins at or after the scene ends.
        const sceneDuration = localFrame / this.fps;
        const audioRequests = clampAudioToScene(registry.audioRequests, sceneDuration);

        // Snapshot the scene-local asset records before the registry is dropped.
        const assetRecords = new Map(registry.assets);
        registry.dispose();
        scene.reset();

        return {
            precomp: {
                frameCount: localFrame,
                startFrame: 0, // assigned by assembleTimeline
                audioRequests,
                assetRecords,
                lifespans,
            },
            error,
        };
    }
}

// ─── Timeline assembly ──────────────────────────────────────────────────────

/**
 * Compose per-scene passes into the final {@link PrecompResult}: assign each
 * scene its global `startFrame`, sum the total, and merge every scene's
 * scene-local asset usage into one absolute-frame asset map.
 *
 * Kept separate from the per-scene pass so both {@link Precomp.run} and
 * {@link Precomp.replaceScene} share the exact same assembly — the only thing
 * `replaceScene` changes is which scenes' passes are fresh vs. reused.
 */
function assembleTimeline(perScene: ScenePrecomp[], buildErrors: BuildError[], fps: number): PrecompResult {
    let offset = 0;
    const scenes: ScenePrecomp[] = [];
    // Merge scene-local records into absolute-frame records, unioning ranges for
    // assets shared across scenes (and taking the max decode size).
    const mergedRecords = new Map<string, AssetRecord>();

    for (const sp of perScene) {
        const placed: ScenePrecomp = { ...sp, startFrame: offset };
        scenes.push(placed);

        for (const [key, record] of sp.assetRecords) {
            mergeRecord(mergedRecords, key, shiftRecord(record, offset));
        }

        offset += sp.frameCount;
    }

    const totalFrames = offset;
    const totalDuration = totalFrames / fps;

    // Resolve cross-scene OPEN requests now that the project total is known. Audio
    // requests stay scene-local (the asset manager re-adds each scene's offset when
    // it plays them), so we resolve the absolute end and store it back as a
    // scene-local `endAt` (= absoluteEnd - sceneOffset). A non-looped open request
    // ends at min(start + mediaDuration, projectEnd); a looped one runs to projectEnd.
    //
    // This runs on every assembly (including HMR `replaceScene`) and is idempotent:
    // the `open` marker is PRESERVED so editing a later scene that changes the total
    // re-resolves the bed's end. Resolution writes into fresh copies so reused
    // `prev.scenes` passes are never mutated.
    for (let i = 0; i < scenes.length; i++) {
        scenes[i] = resolveOpenAudio(scenes[i], fps, totalDuration);
    }

    return {
        fps,
        scenes,
        totalFrames,
        totalDuration,
        assets: buildAssetMap(mergedRecords, fps),
        buildErrors,
    };
}

/**
 * Return a copy of `scene` with every {@link AudioRequest.open} request's `endAt`
 * resolved against the project total. The `open`/`mediaDuration` markers are kept so
 * a later re-assembly (HMR) re-resolves; only `endAt` changes. Bounded requests and
 * scenes with no open requests are returned without copying their request arrays.
 */
function resolveOpenAudio(scene: ScenePrecomp, fps: number, totalDuration: number): ScenePrecomp {
    if (!scene.audioRequests.some((r) => r.open)) return scene;

    const sceneOffset = scene.startFrame / fps;
    const audioRequests = scene.audioRequests.map((req) => {
        if (!req.open) return req;
        const absStart = sceneOffset + req.startAt;
        const naturalEnd = req.loop
            ? totalDuration
            : Math.min(absStart + (req.mediaDuration ?? 0), totalDuration);
        return { ...req, endAt: Math.max(req.startAt, naturalEnd - sceneOffset) };
    });
    return { ...scene, audioRequests };
}

/** Shift an asset record's frame range into the global timeline by `offset`. */
function shiftRecord(record: AssetRecord, offset: number): AssetRecord {
    if (offset === 0) return record;
    return { ...record, startFrame: record.startFrame + offset, endFrame: record.endFrame + offset };
}

/**
 * Merge `record` into `out[key]`, unioning frame ranges and taking the max
 * decode size — so an asset used in several scenes resolves to a single track
 * spanning its full usage, exactly as the old shared-registry pass produced.
 */
function mergeRecord(out: Map<string, AssetRecord>, key: string, record: AssetRecord): void {
    const existing = out.get(key);
    if (!existing) {
        out.set(key, record);
        return;
    }
    const merged: AssetRecord = {
        ...existing,
        startFrame: Math.min(existing.startFrame, record.startFrame),
        endFrame: Math.max(existing.endFrame, record.endFrame),
    } as AssetRecord;
    if ((merged.type === 'image' || merged.type === 'video') &&
        (record.type === 'image' || record.type === 'video')) {
        (merged as { width: number }).width = Math.max(merged.width, record.width);
        (merged as { height: number }).height = Math.max(merged.height, record.height);
    }
    out.set(key, merged);
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
 * Confine a scene's **bounded** audio requests to its own `[0, sceneDuration)` span.
 *
 * Scenes are independent, so this is the cut between two sibling scenes: a bounded
 * clip whose source outlasts the scene — e.g. a long video on a short scene, or a
 * `playSound`/stopped/trimmed clip — must not sound or draw past the scene boundary.
 *
 * Each bounded request is clipped to the span: a `startAt` at or after the end drops
 * the request; an `endAt` past the end is pulled back to the boundary.
 *
 * **Open** requests (a `startSound` left running, not stopped/trimmed) are the sole
 * exception: they are allowed to outlive their scene and pass through untouched here,
 * to be shifted and resolved against the project total in {@link assembleTimeline}.
 */
function clampAudioToScene(requests: readonly AudioRequest[], sceneDuration: number): AudioRequest[] {
    const out: AudioRequest[] = [];
    for (const req of requests) {
        if (req.open) {
            // Cross-scene: keep scene-local startAt; end is resolved at assembly.
            out.push({ ...req });
            continue;
        }
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
 * Convert merged absolute-frame asset records into the typed `AssetTrack` map
 * consumed by `AssetManager`. Each asset type gets a `cacheAt` / `discardAt`
 * window based on its decoded size and usage range. Fonts are pinned at frame 0
 * and never evicted; images and video get size-proportional lead time.
 */
function buildAssetMap(records: ReadonlyMap<string, AssetRecord>, fps: number): ReadonlyMap<string, AssetTrack> {
    const out = new Map<string, AssetTrack>();

    for (const [key, entry] of records) {
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
