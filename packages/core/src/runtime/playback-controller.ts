import { AssetManager } from "../assets/manager";
import { MeasureScope } from "../render/measure-scope";
import { RenderContext } from "../render/render-context";
import { StateEvaluator } from "./state-evaluator";
import { NodeState, TreeState, WaveformInfo, nodePath } from "@/project/tree";
import { AudioRequest } from "@/attributes/audio/request";
import { StorageAdapter } from "../platform/storage-adapter";
import { Precomp, PrecompResult, NodeLifespan } from "./precompisition";
import { Scene } from "@/nodes/base/scene-node";
import { MasterClock, TimeCallback } from "@/platform/master-clock";
import { AudioDevice } from "@/platform/audio-device";
import { AssetCatalog } from "@/assets/catalog";
import { Size2D } from "@/attributes/layout/size";
import { Node } from "@/nodes/base/node";
/** Dependencies injected into `PlaybackController` at construction time. */
export type ControllerParams = {
    renderContext: RenderContext;
    measureScope: MeasureScope;
    storageAdapter: StorageAdapter;
    masterClock: MasterClock;
    audioDevice: AudioDevice;
    assets: AssetCatalog;
    precomposition: Precomp;
    fps: number;
    viewport: Size2D;
    scenes: Scene[];
};

/**
 * Orchestrates playback of a compiled motion-script project.
 *
 * On construction it runs the precomp pass (`Precomp.run()`) to build the
 * global asset timeline and node lifespans, then wires the master clock to
 * the audio device and render pipeline so every tick:
 *
 * 1. Loads assets required at the current frame (`AssetManager.loadAt`).
 * 2. Evaluates scene state and lays out nodes (`StateEvaluator`).
 * 3. Renders the frame to the render context.
 * 4. Prefetches assets for upcoming frames.
 *
 * External callers interact via `play`, `pause`, `seek`, `seekWhilePlaying`,
 * `screenshot`, `getTreeState`, and `getNodeState`.
 */
export class PlaybackController {
    private renderContext: RenderContext;
    private measureScope: MeasureScope;
    private storageAdapter: StorageAdapter;
    private masterClock: MasterClock;
    private stateEvaluator: StateEvaluator;
    private assetManager: AssetManager;
    private audioDevice: AudioDevice;
    /** Set by dispose(); once true the controller must never touch its (now-freed) render context again. */
    private disposed = false;
    readonly fps: number;
    readonly viewport: Size2D;
    readonly precomp: PrecompResult;

    /** Per-scene frame counts in timeline order, used to build the track list. */
    get tracks(): number[] {
        return this.precomp.scenes.map(s => s.frameCount);
    }

    /** Total frame count across all scenes. */
    get totalFrames(): number {
        return this.precomp.totalFrames;
    }

    /** Total playback duration in seconds. */
    get totalDuration(): number {
        return this.precomp.totalDuration;
    }

    /** Errors collected during the precomp pass (one entry per failing scene). */
    get buildErrors() {
        return this.precomp.buildErrors;
    }

    constructor(params: ControllerParams) {
        this.renderContext = params.renderContext;
        this.measureScope = params.measureScope;
        this.masterClock = params.masterClock;
        this.storageAdapter = params.storageAdapter;
        this.audioDevice = params.audioDevice;
        this.fps = params.fps;
        this.viewport = params.viewport;

        const catalog = params.assets;

        this.precomp = new Precomp(
            params.scenes,
            this.viewport,
            this.fps,
            catalog,
            this.measureScope,
        ).run();

        this.stateEvaluator = new StateEvaluator(
            params.scenes,
            this.viewport,
            this.fps,
            catalog,
            this.tracks,
        );

        this.assetManager = new AssetManager(
            this.precomp,
            this.storageAdapter,
            this.audioDevice,
        );

        this.masterClock.setDuration(this.totalDuration);

        this.masterClock.onPlay((t, speed, reverse) => {
            this.audioDevice.play(t, speed, reverse);
            this.storageAdapter.setPlaying(true);
        });
        this.masterClock.onPause(() => {
            this.audioDevice.stop();
            this.storageAdapter.setPlaying(false);
        });
        this.masterClock.onTick(async (currentTime: number) => {
            const frame = this.fps * currentTime;
            if (frame >= this.totalFrames) {
                this.masterClock.pause();
            }
            await this.assetManager.loadAt(frame);
            if (this.disposed) return;
            this.audioDevice.syncTo(currentTime);
            this.renderAt(frame);
            this.assetManager.prefetch(frame);
        });
    }

    get isPlaying(): boolean {
        return this.masterClock.isPlaying;
    }

    /** Current playback position in seconds. */
    get currentTime(): number {
        return this.masterClock.currentTime;
    }

    /** Current playback position in frames (float). */
    get currentFrame(): number {
        return this.masterClock.currentTime * this.fps;
    }

    /** Register a callback that fires on every clock tick with the current time. */
    onTime(cb: TimeCallback): void {
        this.masterClock.onTime(cb);
    }

    /** Register a callback that fires when playback starts. */
    onPlay(cb: () => void): void {
        this.masterClock.onPlay(() => cb());
    }

    /** Register a callback that fires when playback pauses. */
    onPause(cb: () => void): void {
        this.masterClock.onPause(cb);
    }

    /**
     * Evaluate scene state, lay out nodes, and render `frame` to the render
     * context. Called on every clock tick and also directly by `seek` /
     * `screenshot` to ensure the surface is up-to-date.
     */
    private renderAt(frame: number): void {
        // A disposed controller's render context has had its CanvasKit surface
        // freed. An in-flight async seek() (StrictMode double-mount / HMR) can
        // resolve after dispose() and try to render into the dead surface, which
        // throws "Cannot pass deleted object as a pointer of type Surface*".
        if (this.disposed) return;
        this.stateEvaluator.stateAt(frame);
        this.stateEvaluator.layout(this.measureScope);
        this.renderContext.execute(() => {
            this.stateEvaluator.render(this.renderContext);
        });
    }

    /**
     * Jump to `frame`, pausing playback first. Waits for required assets to
     * load before rendering, then prefetches upcoming frames.
     */
    async seek(frame: number): Promise<void> {
        if (this.disposed) return;
        const clamped = Math.max(0, Math.min(frame, this.totalFrames));
        this.masterClock.pause();
        this.masterClock.seek(clamped / this.fps);
        await this.assetManager.loadAt(clamped);
        // loadAt is async — the controller may have been disposed while awaiting.
        if (this.disposed) return;
        this.renderAt(clamped);
        // A cold seek can land on a video timestamp the window hadn't decoded yet;
        // warm the exact frame(s) the render requested and re-render so the still
        // is frame-accurate. Bounded — decoding is monotonic, so this settles fast.
        for (let pass = 0; pass < 3; pass++) {
            if (!(await this.storageAdapter.warmPendingVideo())) break;
            if (this.disposed) return;
            this.renderAt(clamped);
        }
        this.assetManager.prefetch(clamped);
    }

    /** Reposition the clock to `frame` without interrupting playback. */
    seekWhilePlaying(frame: number): void {
        const clamped = Math.max(0, Math.min(frame, this.totalFrames));
        this.masterClock.seek(clamped / this.fps);
    }

    /**
     * Capture the current frame as a base-64 PNG data URL. Forces a fresh
     * render before snapshotting because the WebGL drawing buffer may have
     * been cleared since the last tick (we don't set `preserveDrawingBuffer`).
     * Uses `stateEvaluator.currentFrame` (integer) rather than the clock's
     * float so `stateAt` always hits its early-return and never resets scene state.
     */
    screenshot(): string | undefined {
        this.renderAt(this.stateEvaluator.currentFrame);
        return this.renderContext.screenshot();
    }

    /**
     * Return the full node tree for the current scene, with lifespan frame
     * ranges and waveform data attached. Used by the timeline UI.
     * Returns `null` when no scene is active.
     */
    getTreeState(): TreeState | null {
        const scene = this.stateEvaluator.currentScene;
        if (!scene) return null;
        const sceneIndex = this.stateEvaluator.currentSceneIndex;
        const scenePrecomp = sceneIndex >= 0 ? this.precomp.scenes[sceneIndex] : undefined;
        const audioRequests = scenePrecomp?.audioRequests ?? [];
        // Bound each node's bar to its lifespan: the precomp records scene-local
        // frame ranges, which we shift by the scene's global startFrame so bars
        // land within the scene's slot on the full timeline.
        const lifespans = scenePrecomp?.lifespans;
        const sceneStart = scenePrecomp?.startFrame ?? 0;
        // The precomp requests are the complete audio picture (the per-frame node
        // hook only sees sounds active on the current frame), so they drive the
        // waveforms — grouped by the emitting node's path so each clip lands on
        // its own bar (a Video's clip on the Video row, a scene's playSound on
        // the scene row). Requests with no owner fall back to the scene root.
        const waveformsByPath = waveformsByOwner(audioRequests);
        const tree = nodeToTreeState(scene, "", lifespans, sceneStart, waveformsByPath);
        return tree;
    }

    getNodeState(nodeId: string): NodeState | null {
        const scene = this.stateEvaluator.currentScene;
        if (!scene) return null;
        const node = findNode(scene, nodeId);
        if (!node) return null;
        return { id: node.id, type: node.name, properties: node.properties };
    }

    play(speed: number = 1, reverse: boolean = false): void {
        if (this.currentFrame >= this.totalFrames) {
            this.seek(0).then(() => this.masterClock.play(speed, reverse)).catch(() => { });
            return;
        }
        this.masterClock.play(speed, reverse);
    }

    pause(): void {
        this.masterClock.pause();
    }

    setMuted(muted: boolean): void {
        this.audioDevice.setMuted(muted);
    }

    dispose(): void {
        this.disposed = true;
        this.masterClock.dispose();
        this.audioDevice.dispose();
        this.stateEvaluator.dispose();
        this.assetManager.dispose();
    }
}

// Every Node is a container (children may be empty); kept for callers that
// want an explicit "has children" check.
export function isParentNode(node: Node): boolean {
    return node.children.length > 0;
}

function nodeToTreeState(
    node: Node,
    path: string,
    lifespans?: ReadonlyMap<string, NodeLifespan>,
    sceneStart = 0,
    waveformsByPath?: ReadonlyMap<string, WaveformInfo[]>,
): TreeState {
    const state: TreeState = {
        id: node.id,
        type: node.name,
        children: node.children.map((c, i) =>
            nodeToTreeState(c, nodePath(path, i), lifespans, sceneStart, waveformsByPath)),
    };
    // Waveforms come from the precomp requests (authoritative full timeline),
    // attributed to this node by its structural path.
    const waveform = waveformsByPath?.get(path);
    if (waveform && waveform.length > 0) state.waveform = waveform;
    // Look the lifespan up by structural path (ids are not stable across the
    // precomp/playback rebuilds) and shift it into absolute timeline frames.
    const span = lifespans?.get(path);
    if (span) {
        state.startFrame = sceneStart + span.startFrame;
        state.endFrame = sceneStart + span.endFrame;
    }
    return state;
}

/**
 * Group a scene's audio requests into per-node waveform entries, keyed by the
 * emitting node's structural path (see {@link AudioRequest.ownerPath}). A request
 * with no owner is attributed to the scene root (""), so anything emitted outside
 * a node walk still shows on the scene's bar.
 */
function waveformsByOwner(requests: readonly AudioRequest[]): Map<string, WaveformInfo[]> {
    const byPath = new Map<string, WaveformInfo[]>();
    for (const req of requests) {
        const path = req.ownerPath ?? "";
        const info: WaveformInfo = {
            src: req.src,
            startTime: req.startAt,
            endTime: Number.isFinite(req.endAt) ? req.endAt : null,
        };
        const list = byPath.get(path);
        if (list) list.push(info);
        else byPath.set(path, [info]);
    }
    return byPath;
}

function findNode(root: Node, id: string): Node | null {
    if (root.id === id) return root;

    for (const child of root.children) {
        const found = findNode(child, id);
        if (found) return found;
    }

    return null;
}
