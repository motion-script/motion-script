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
import { MeasureScope } from "@/render/measure-scope";
import { AssetTracker } from "@/assets/tracker";
import { AssetCatalog } from "@/assets/catalog";
import { Scene } from "@/nodes/base/scene-node";
import { StorageAdapter } from "@/platform/storage-adapter";
import { RenderContext } from "@/render/render-context";
import { AudioRequest } from "@/attributes/audio/request";
import { AssetRecord } from "@/assets/record";
import { PrecompResult, AssetTrack, ScenePrecomp } from "@/runtime/precompisition";

// ─── Scene graph fakes ──────────────────────────────────────────────────────

/** A minimal tree node used to test getTreeState / getNodeState walking. */
export class FakeNode {
    constructor(
        public id: string,
        public name: string,
        public children: FakeNode[] = [],
        public properties: Record<string, unknown> = {},
    ) {}

    waveform(): undefined { return undefined; }
}

export interface FakeSceneOptions {
    id?: string;
    name?: string;
    /** Number of times the build generator yields ≈ this scene's frame count. */
    yieldCount?: number;
    children?: FakeNode[];
    properties?: Record<string, unknown>;
    /**
     * Hook invoked on each prepareAssets() call so a test can register assets or
     * audio with the tracker. `frame` is the prepareAssets call index (0-based).
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
    bindAssetsCalls: unknown[] = [];
    ellapseCalls: number[] = [];
    layoutCalls: { rect: unknown }[] = [];
    prepareCount = 0;

    constructor(opts: FakeSceneOptions = {}) {
        this.id = opts.id ?? "scene";
        this.name = opts.name ?? "Scene";
        this.yieldCount = opts.yieldCount ?? 5;
        this.children = opts.children ?? [];
        this.properties = opts.properties ?? {};
        this.onPrepare = opts.onPrepare;
    }

    set(props: unknown): void {
        this.setCalls.push(props);
    }
    reset(): void {
        this.resetCount++;
    }
    bindAssets(catalog: unknown): void {
        this.bindAssetsCalls.push(catalog);
    }
    ellapse(time: number): void {
        this.ellapseCalls.push(time);
    }
    layout(rect: unknown): void {
        this.layoutCalls.push({ rect });
    }
    render(): void {
        this.renderCount++;
    }
    prepareAssets(tracker: AssetTracker): void {
        this.onPrepare?.(tracker, this.prepareCount);
        this.prepareCount++;
    }
    dispose(): void {
        this.disposeCount++;
    }
    waveform(): undefined { return undefined; }

    build(): Generator<void, void, number> {
        this.buildCount++;
        const n = this.yieldCount;
        return (function* () {
            for (let i = 0; i < n; i++) yield;
        })();
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

export class FakeMeasureScope extends MeasureScope {
    measureText(text: string): number {
        return text.length * 10;
    }
}

export class FakeAssetCatalog {
    constructor(private videoDurations: Record<string, number> = {}) {}
    getVideoDuration(src: string): number {
        return this.videoDurations[src] ?? 10;
    }
}
export function asCatalog(c: FakeAssetCatalog): AssetCatalog {
    return c as unknown as AssetCatalog;
}

export class FakeRenderContext {
    renderCount = 0;
    screenshotValue: string | undefined = "data:image/png;base64,FAKE";
    /** Invokes the draw callback, mirroring the real render() contract. */
    render(cb: () => void): void {
        this.renderCount++;
        cb();
    }
    screenshot(): string | undefined {
        return this.screenshotValue;
    }
}
export function asRenderContext(c: FakeRenderContext): RenderContext {
    return c as unknown as RenderContext;
}

export class FakeStorageAdapter {
    loadAssetCalls: { key: string; record: AssetRecord }[] = [];
    fetchAudioCalls: string[] = [];
    /** When set, loadAsset rejects with this error (to exercise prefetch's catch). */
    loadShouldReject = false;

    loadAsset(key: string, record: AssetRecord): Promise<void> {
        this.loadAssetCalls.push({ key, record });
        return this.loadShouldReject ? Promise.reject(new Error("load failed")) : Promise.resolve();
    }
    fetchAudioData(src: string): Promise<ArrayBuffer> {
        this.fetchAudioCalls.push(src);
        return Promise.resolve(new ArrayBuffer(8));
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
        frameCount: 10,
        startFrame: 0,
        audioRequests: [],
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
        totalFrames,
        totalDuration: over.totalDuration ?? totalFrames / fps,
        assets: over.assets ?? new Map<string, AssetTrack>(),
        buildErrors: over.buildErrors ?? [],
    };
}
