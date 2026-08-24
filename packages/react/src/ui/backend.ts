import type { CanvasKit } from "@motion-script/canvaskit";
import type {
    AssetCatalog,
    AudioDevice,
    CanvasRenderContext2D,
    MasterClock,
    Measurer2D,
    Size2D,
    StorageAdapter,
} from "@motion-script/core";
import {
    WebAudioPlayer,
    WebMasterClock,
    WebMeasurer,
    WebRenderContext,
    WebStorageAdapter,
} from "@motion-script/web";

/**
 * What {@link MotionPlayer} needs from a render context.
 *
 * `PlaybackController` (in `@motion-script/core`) requires an actual
 * `CanvasRenderContext2D` subclass, not just anything shaped like its
 * `RenderContext2D` interface — `CanvasRenderContext2D` carries private state
 * (the node/clip/effect stacks a draw pass tracks), which TypeScript only
 * accepts from a real subclass. On top of that, `MotionPlayer` itself needs
 * `mount`/`pixelRatio`/`view`/`frame`, the browser-facing knobs
 * `@motion-script/skia-render`'s `SkiaRenderContext` adds for surface
 * creation and preview pan/zoom. In practice this means: subclass
 * `SkiaRenderContext` (as `WebRenderContext` does) rather than implement
 * `RenderContext2D` from scratch — see {@link PlayerBackend}.
 */
export interface PlayerRenderContext extends CanvasRenderContext2D {
    mount(canvas: HTMLCanvasElement): void;
    pixelRatio: number;
    view: { zoom: number; x: number; y: number };
    frame: Size2D | null;
}

/**
 * The platform stack {@link MotionPlayer} mounts a scene graph into: a render
 * surface plus the four portable seams `PlaybackController` is built against —
 * `Measurer2D`, `StorageAdapter`, `AudioDevice`, `MasterClock` (all from
 * `@motion-script/core`).
 *
 * `MotionPlayer`'s `renderer` prop injects one of these instead of the
 * built-in {@link createWebPlayerBackend}. As {@link PlayerRenderContext}
 * explains, `renderContext` specifically has to be a real `SkiaRenderContext`
 * subclass — so this swaps the *platform binding underneath Skia* (a native
 * build, a different WASM target), not the renderer for a different graphics
 * engine entirely. That would mean reimplementing everything
 * `@motion-script/skia-render` does — every shape, fill, stroke, effect and
 * text op `core` can describe — which is real work no injected object can
 * shortcut. See that package's barrel comment for the platform-vs-renderer
 * split this mirrors.
 */
export interface PlayerBackend {
    renderContext: PlayerRenderContext;
    measurer: Measurer2D;
    storageAdapter: StorageAdapter;
    audioDevice: AudioDevice;
    masterClock: MasterClock;
}

/** What a {@link CreatePlayerBackend} is given to build one from. */
export interface PlayerBackendDeps {
    /**
     * The provider's loaded CanvasKit instance, from
     * {@link MotionScriptProvider} — every `renderContext` needs one, being a
     * `SkiaRenderContext` subclass (see {@link PlayerRenderContext}).
     */
    canvasKit: CanvasKit;
    catalog: AssetCatalog;
    viewport: Size2D;
    fps: number;
}

/** Builds the platform stack a {@link MotionPlayer} mounts. See {@link PlayerBackend}. */
export type CreatePlayerBackend = (deps: PlayerBackendDeps) => PlayerBackend;

/**
 * The default backend: `@motion-script/web`'s WebGL/Skia stack. This is what
 * `MotionPlayer` built inline before the `renderer` prop existed — pass your
 * own {@link CreatePlayerBackend} to replace it.
 */
export const createWebPlayerBackend: CreatePlayerBackend = ({ canvasKit, catalog, viewport, fps }) => {
    const storageAdapter = new WebStorageAdapter(canvasKit, catalog, viewport, fps);
    const audioDevice = new WebAudioPlayer();
    return {
        renderContext: new WebRenderContext(canvasKit, storageAdapter),
        measurer: new WebMeasurer(storageAdapter),
        storageAdapter,
        audioDevice,
        masterClock: new WebMasterClock({ context: audioDevice.getContext(), fps }),
    };
};
