/**
 * Shared mock/fake implementations for the runtime test suite.
 *
 * These stand in for the heavy CanvasKit-backed Scene graph and the platform
 * adapters (clock, audio, storage, render context) so the runtime orchestration
 * logic can be exercised in a plain Node environment. Each fake records the
 * calls it receives so tests can assert on ordering and arguments.
 *
 * Excluded from the published build via `src/**\/*.fixtures.ts` in tsconfig.
 */
import { AudioDevice } from "@/platform/audio-device";
import { MasterClock } from "@/platform/master-clock";
import { Measurer2D } from "@/render/measurer";
import { AssetTracker } from "@/assets/tracker";
import { AssetCatalog } from "@/assets/catalog";
import { StorageAdapter } from "@/platform/storage-adapter";
import { RenderContext2D } from "@/render/render-context2d";
import { AudioRequest } from "@/attributes/audio/request";
import { AssetRecord } from "@/assets/record";
import { PrecompResult, AssetTrack, ScenePrecomp } from "@/runtime/precompisition";
import { Scene } from "@/nodes/scene/scene-node";
import type { Size2D } from "@/attributes/layout/size";

// ─── Scene graph fakes ──────────────────────────────────────────────────────

/** A minimal tree node used to test getTreeState / getNodeState walking. */
export class FakeNode {
    constructor(
        public id: string,
        public name: string,
        public children: FakeNode[] = [],
        public properties: Record<string, unknown> = {},
    ) { }

    /**
     * The authored child list, which every structural-path walk reads rather
     * than `children` — see {@link Node._allChildren}. Identical here: a fake has
     * no dimensions to keep apart, and the distinction only exists for a
     * `Canvas3D`.
     */
    get _allChildren(): readonly FakeNode[] {
        return this.children;
    }
}

/** {@link FakeNode} plus the `set` a real `Canvas2D` carries. See {@link FakeScene.canvas}. */
export class FakeCanvas extends FakeNode {
    constructor(
        id: string,
        name: string,
        children: FakeNode[],
        properties: Record<string, unknown>,
        private readonly setCalls: unknown[],
    ) {
        super(id, name, children, properties);
    }

    set(props: unknown): void {
        this.setCalls.push(props);
    }
}

export interface FakeSceneOptions {
    id?: string;
    name?: string;
    /**
     * This scene's frame count. Named for the generator era, when a scene's
     * length was how many times its body yielded; it is now simply the number of
     * frames the fake declares, and `duration` is derived from it.
     */
    yieldCount?: number;
    children?: FakeNode[];
    properties?: Record<string, unknown>;
    /**
     * Hook invoked on each prepareAudioAssets() call so a test can register
     * assets or audio with the tracker. `frame` is the call index (0-based).
     * Both fonts and image/video assets can be registered here — the tracker is
     * phase-agnostic, and assertions read its resulting state, not the phase.
     * (Real `Scene.prepareAudioAssets` is the only remaining phase that still
     * receives a tracker per frame — see `Precomp.precompScene`.)
     */
    onPrepare?: (tracker: AssetTracker, frame: number) => void;
}

/**
 * Stand-in for a `Scene`. Implements exactly the surface the runtime touches and
 * records every call. The build() generator yields `yieldCount` times, which the
 * runtime translates into that many frames.
 */
export class FakeScene {
    id: string;
    name: string;
    properties: Record<string, unknown>;
    children: FakeNode[];
    yieldCount: number;
    private onPrepare?: (tracker: AssetTracker, frame: number) => void;

    // Call recorders.
    resetCount = 0;
    buildCount = 0;
    disposeCount = 0;
    renderCount = 0;
    setCalls: unknown[] = [];
    setViewportCalls: unknown[] = [];
    attachCalls: unknown[] = [];
    ellapseCalls: number[] = [];
    /** Every time `evaluateAt` was asked for, in call order. */
    evaluateCalls: number[] = [];
    primeMotionCalls: number[] = [];
    layoutCalls: { rect: unknown }[] = [];
    prepareLayoutCount = 0;
    prepareRenderCount = 0;
    prepareCount = 0;
    sampleCount = 0;

    /**
     * Frames per second the fake reports its duration against.
     *
     * A real scene declares a duration in *seconds* and the runtime converts;
     * a fake is written in frames, so it needs the same fps the evaluator was
     * constructed with to convert back. Tests that use a different rate set it.
     */
    fps = 4;

    constructor(opts: FakeSceneOptions = {}) {
        this.id = opts.id ?? "scene";
        this.name = opts.name ?? "Scene";
        this.yieldCount = opts.yieldCount ?? 5;
        this.children = opts.children ?? [];
        this.properties = opts.properties ?? {};
        this.onPrepare = opts.onPrepare;
    }

    /**
     * The scene's world container. A real {@link Scene} is not a node — it owns a
     * {@link Canvas2D} that carries the children the runtime walks for
     * tree-state / lifespans, and that the runtime sizes to the viewport. This
     * fake mirrors both halves: the canvas presents the scene's own
     * id/name/properties plus its children as a node, and records `set` calls.
     *
     * Built once and cached, because the runtime writes to it (`canvas.set`) and
     * a fresh object per read would drop those writes on the floor.
     */
    get canvas(): FakeCanvas {
        return this._canvas ??= new FakeCanvas(this.id, this.name, this.children, this.properties, this.setCalls);
    }
    private _canvas?: FakeCanvas;
    setViewport(size: unknown): void {
        this.setViewportCalls.push(size);
    }
    reset(): void {
        this.resetCount++;
    }
    attach(scope: { assets: unknown; context: unknown; time: number }): void {
        this.attachCalls.push(scope);
        this.ellapseCalls.push(scope.time);
    }
    layout(rect: unknown): void {
        this.layoutCalls.push({ rect });
    }
    render(): void {
        this.renderCount++;
    }
    sample(): void {
        this.sampleCount++;
    }
    prepareLayoutAssets(): void {
        this.prepareLayoutCount++;
    }
    // `onPrepare` fires here rather than from a third audio walk: declarations
    // are collected in two phases now, and this is the one that runs with a
    // layout behind it — where a fake declaring an image or a clip belongs.
    prepareRenderAssets(tracker: AssetTracker): void {
        this.prepareRenderCount++;
        this.onPrepare?.(tracker, this.prepareCount);
        this.prepareCount++;
    }
    dispose(): void {
        this.disposeCount++;
    }

    build(): void {
        this.buildCount++;
    }

    /**
     * Seconds this scene runs for, derived from its declared frame count.
     *
     * `yieldCount` frames at `fps`. The runtime rounds back up with
     * `ceil(duration * fps)`, so this round-trips exactly.
     */
    get duration(): number {
        return this.yieldCount / this.fps;
    }

    evaluateAt(seconds: number): void {
        this.evaluateCalls.push(seconds);
    }

    primeMotion(at: number): void {
        this.primeMotionCalls.push(at);
    }
}

/** Cast a fake scene to the Scene type the runtime expects. */
export function asScene(scene: FakeScene): Scene {
    return scene as unknown as Scene;
}
export function asScenes(scenes: FakeScene[]): Scene[] {
    return scenes as unknown as Scene[];
}

// ─── Platform / render fakes ────────────────────────────────────────────────

export class FakeMeasurer implements Measurer2D {
    measureText(text: string, fontSize = 10): Size2D {
        return { width: text.length * 10, height: fontSize };
    }
}

export class FakeAssetCatalog {
    /**
     * @param videoDurations Per-src video durations (defaults to 10s for any src).
     * @param missing        Srcs that should be treated as absent from the manifest
     *                       so image/audio/media lookups throw, mirroring the real
     *                       catalog's missing-asset error (see `requestImage`).
     */
    constructor(
        private videoDurations: Record<string, number> = {},
        private missing: ReadonlySet<string> = new Set(),
    ) { }
    getVideoDuration(src: string): number {
        return this.videoDurations[src] ?? 10;
    }
    getImageMeta(src: string): { width: number; height: number; sizeBytes: number; src: string } {
        if (this.missing.has(src)) throw new Error(`Image asset not found: "${src}".`);
        return { src, width: 0, height: 0, sizeBytes: 0 };
    }
    getMediaDuration(src: string): number {
        if (this.missing.has(src)) throw new Error(`Audio asset not found: "${src}".`);
        return this.videoDurations[src] ?? 10;
    }
}
export function asCatalog(c: FakeAssetCatalog): AssetCatalog {
    return c as unknown as AssetCatalog;
}

export class FakeRenderContext {
    renderCount = 0;
    screenshotValue: string | undefined = "data:image/png;base64,FAKE";
    /** Invokes the draw callback, mirroring the real RenderContext2D.execute() contract. */
    execute(cb: () => void): void {
        this.renderCount++;
        cb();
    }
    screenshot(): string | undefined {
        return this.screenshotValue;
    }
}
export function asRenderContext(c: FakeRenderContext): RenderContext2D {
    return c as unknown as RenderContext2D;
}

export class FakeStorageAdapter {
    loadAssetCalls: { key: string; record: AssetRecord }[] = [];
    fetchAudioCalls: string[] = [];
    /** When set, loadAsset rejects with this error (to exercise prefetch's catch). */
    loadShouldReject = false;
    /**
     * When set, `warmPendingVideo()` returns this controllable promise instead of
     * resolving immediately — lets a test park a seek on the warm re-render loop so
     * a second, newer seek can be interleaved against it (supersession tests).
     */
    warmGate: Promise<boolean> | null = null;
    warmPendingVideoCalls = 0;
    setPlayingCalls: boolean[] = [];

    loadAsset(key: string, record: AssetRecord): Promise<void> {
        this.loadAssetCalls.push({ key, record });
        return this.loadShouldReject ? Promise.reject(new Error("load failed")) : Promise.resolve();
    }
    fetchAudioData(src: string): Promise<ArrayBuffer> {
        this.fetchAudioCalls.push(src);
        return Promise.resolve(new ArrayBuffer(8));
    }
    warmPendingVideo(): Promise<boolean> {
        this.warmPendingVideoCalls++;
        return this.warmGate ?? Promise.resolve(false);
    }
    setPlaying(playing: boolean): void {
        this.setPlayingCalls.push(playing);
    }
}
export function asStorage(s: FakeStorageAdapter): StorageAdapter {
    return s as unknown as StorageAdapter;
}

export class FakeAudioDevice extends AudioDevice {
    private cache = new Set<string>();
    appendCalls: { src: string }[] = [];
    scheduleCalls: AudioRequest[][] = [];
    retainCalls: ReadonlySet<string>[] = [];
    syncToCalls: number[] = [];
    playCalls: { time: number; speed: number; reverse: boolean }[] = [];
    stopCount = 0;

    /** Seed the cache so `has()` returns true without an append round-trip. */
    seed(src: string): void {
        this.cache.add(src);
    }

    has(src: string): boolean {
        return this.cache.has(src);
    }
    async append(src: string): Promise<void> {
        this.appendCalls.push({ src });
        this.cache.add(src);
    }
    retain(keep: ReadonlySet<string>): void {
        this.retainCalls.push(keep);
    }
    schedule(requests: readonly AudioRequest[]): void {
        this.scheduleCalls.push([...requests]);
    }
    syncTo(sceneTime: number): void {
        this.syncToCalls.push(sceneTime);
    }
    play(time: number, speed: number, reverse: boolean): void {
        this.playCalls.push({ time, speed, reverse });
    }
    stop(): void {
        this.stopCount++;
    }
}

/**
 * A MasterClock whose time is driven manually. `simulateTick` sets the time and
 * runs the registered tick callbacks (awaiting their async work).
 */
export class FakeClock extends MasterClock {
    seekCalls: number[] = [];
    disposeCount = 0;

    seek(t: number): void {
        this.seekCalls.push(t);
        this.setCurrentTime(t);
    }

    /** Set the current time without firing tick callbacks. */
    setTime(t: number): void {
        this.setCurrentTime(t);
    }

    /** Set the time then run all onTick callbacks to completion. */
    async simulateTick(t: number): Promise<void> {
        this.setCurrentTime(t);
        await this.tick();
    }

    override dispose(): void {
        this.disposeCount++;
        super.dispose();
    }
}

// ─── PrecompResult builders ──────────────────────────────────────────────────

export function makeAudioRequest(over: Partial<AudioRequest> = {}): AudioRequest {
    return {
        id: "req",
        src: "sound.mp3",
        startAt: 0,
        endAt: 1,
        trimStart: 0,
        volume: 1,
        loop: false,
        ...over,
    };
}

export function makeImageRecord(over: Partial<Extract<AssetRecord, { type: "image" }>> = {}): AssetRecord {
    return {
        type: "image",
        src: "img.png",
        startFrame: 0,
        endFrame: 0,
        width: 100,
        height: 100,
        ...over,
    };
}

export function makeLoaderRecord(
    over: Partial<Extract<AssetRecord, { type: "loader" }>> = {},
): AssetRecord {
    return {
        type: "loader",
        src: "loader-key",
        startFrame: 0,
        endFrame: 0,
        load: async () => () => { },
        ...over,
    };
}

export function makeAssetTrack(over: Partial<AssetTrack> & { record?: AssetRecord } = {}): AssetTrack {
    return {
        record: over.record ?? makeImageRecord(),
        cacheAt: over.cacheAt ?? 0,
        discardAt: over.discardAt ?? null,
    };
}

export function makeScenePrecomp(over: Partial<ScenePrecomp> = {}): ScenePrecomp {
    return {
        measured: true,
        frameCount: 10,
        startFrame: 0,
        audioRequests: [],
        assetRecords: new Map(),
        lifespans: new Map(),
        ...over,
    };
}

export function makePrecompResult(over: Partial<PrecompResult> = {}): PrecompResult {
    const scenes = over.scenes ?? [makeScenePrecomp()];
    const totalFrames = over.totalFrames ?? scenes.reduce((n, s) => n + s.frameCount, 0);
    const fps = over.fps ?? 30;
    return {
        fps,
        scenes,
        globalAudio: over.globalAudio ?? [],
        totalFrames,
        totalDuration: over.totalDuration ?? totalFrames / fps,
        assets: over.assets ?? new Map<string, AssetTrack>(),
        buildErrors: over.buildErrors ?? [],
        complete: over.complete ?? true,
        timings: over.timings,
    };
}
