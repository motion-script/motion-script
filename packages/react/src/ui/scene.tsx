import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import {
    AssetCatalog,
    PlaybackController,
    setTheme,
    type AssetManifest,
    type BuildError,
    type Color,
    type Scene,
    type NodeState,
    type Size2D,
    type TreeState,
    Precomp,
} from "@motion-script/core";
import {
    WebAudioPlayer,
    WebMasterClock,
    WebMeasureScope,
    WebRenderContext,
    WebStorageAdapter,
} from "@motion-script/web";
import { useMotionScript } from "./provider";

type Props = {
    /** Imperative handle exposing playback and inspection methods; see {@link FrameHandle}. */
    ref?: Ref<FrameHandle>;
    /** Frame to seek to while paused. Ignored while `isPlaying` is true. */
    initialFrame: number;
    /** Whether the controller's clock should be running. */
    isPlaying: boolean;
    /** Frames per second used for playback, seeking, and time/frame conversion. */
    fps: number;
    /** Output canvas size in pixels. */
    viewport: Size2D;
    /** Scenes composed into a single timeline by an internal {@link Precomp}. */
    scenes: Scene[];
    /** Manifest describing the media assets referenced by `scenes`. */
    assets: AssetManifest;
    /** Theme color overrides applied globally before the player mounts. */
    theme?: Record<string, Color>;
    /** Playback rate multiplier passed to the controller. Defaults to `1`. */
    speed?: number;
    /** Whether audio output is muted. Defaults to `false`. */
    muted?: boolean;
    /** Called when the player starts/finishes loading (mount or seek). */
    onLoadingChange?: (loading: boolean) => void;
    /** Called on every clock tick with the current frame number. */
    onFrameChange?: (frame: number) => void;
    /** Called once on mount if the scene graph failed to build. */
    onBuildErrors?: (errors: BuildError[]) => void;
};

/** Imperative API exposed by {@link MotionPlayer} via its `ref`. */
export interface FrameHandle {
    /** Captures the current frame as a data URL, or `undefined` if not yet rendered. */
    screenshot: () => Promise<string | undefined>;
    /** Seeks to and renders a specific frame, resolving once the render completes. */
    renderFrame: (frame: number) => Promise<void>;
    /** Seeks to a frame without interrupting active playback. */
    seekWhilePlaying: (frame: number) => void;
    /** Returns the current state of a node by id, or `null` if not found. */
    getNodeProps: (nodeId: string) => NodeState | null;
    /** Returns a snapshot of the full scene tree state, or `null` before mount. */
    getTreeState: () => TreeState | null;
    /** Total duration of the composed timeline, in seconds. */
    getDuration: () => number;
    /** Duration of each individual scene, in seconds. */
    getSceneDurations: () => number[];
    /** Errors raised while building the scene graph, if any. */
    getBuildErrors: () => BuildError[];
}

/**
 * Renders a MotionScript scene graph to a canvas and drives playback.
 *
 * Must be rendered inside a {@link MotionScriptProvider}, which supplies the
 * shared CanvasKit instance this component depends on.
 */
export function MotionPlayer({
    ref,
    initialFrame,
    isPlaying,
    fps,
    viewport,
    scenes,
    assets,
    theme,
    speed = 1,
    muted = false,
    onLoadingChange,
    onFrameChange,
    onBuildErrors,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { canvasKit, isInitialized } = useMotionScript();

    const [controller, setController] = useState<PlaybackController | null>(null);
    const controllerRef = useRef<PlaybackController | null>(null);

    const onLoadingChangeRef = useRef(onLoadingChange);
    // Force a re-render on each time tick; the value itself is unused.
    const [, setC] = useState(0);
    const initialFrameRef = useRef(initialFrame);
    const onFrameChangeRef = useRef(onFrameChange);
    const onBuildErrorsRef = useRef(onBuildErrors);

    // Keep callback/value refs current without touching them during render.
    useEffect(() => {
        onLoadingChangeRef.current = onLoadingChange;
        initialFrameRef.current = initialFrame;
        onFrameChangeRef.current = onFrameChange;
        onBuildErrorsRef.current = onBuildErrors;
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !canvasKit) return;
        setTheme(theme);
        const catalog = new AssetCatalog(assets);
        const storage = new WebStorageAdapter(canvasKit, catalog, viewport, fps);
        const measure = new WebMeasureScope(storage);
        const audio = new WebAudioPlayer();
        const clock = new WebMasterClock({ context: audio.getContext(), fps });
        const renderContext = new WebRenderContext(canvasKit, storage);
        renderContext.mount(canvas);

        const pc: PlaybackController = new PlaybackController({
            renderContext,
            measureScope: measure,
            storageAdapter: storage,
            masterClock: clock,
            precomposition: new Precomp(scenes, viewport, fps, catalog, measure),
            audioDevice: audio,
            assets: catalog,
            fps,
            viewport,
            scenes,
        });

        if (pc.buildErrors.length > 0) {
            onBuildErrorsRef.current?.(pc.buildErrors);
        }

        pc.onTime((t: number) => {
            onFrameChangeRef.current?.(Math.trunc(t * fps));
            setC(t);
        });
        controllerRef.current = pc;
        setController(pc);

        onLoadingChangeRef.current?.(true);

        return () => {
            controllerRef.current = null;
            setController(null);
            pc.dispose();
            renderContext.dispose();
        };
    }, [canvasKit, assets, viewport, fps, scenes, theme]);

    // Apply initialFrame changes while paused (scrubbing). When playing, the
    // controller's own clock drives time, so we ignore prop-driven seeks.
    useEffect(() => {
        if (!controller || isPlaying) return;
        let cancelled = false;
        onLoadingChangeRef.current?.(true);
        controller.seek(initialFrame).then(() => {
            if (cancelled) return;
            onLoadingChangeRef.current?.(false);
        });
        return () => {
            cancelled = true;
        };
    }, [controller, isPlaying, initialFrame]);

    useEffect(() => {
        if (!controller) return;
        if (isPlaying) {
            controller.play(speed);
        } else {
            controller.pause();
        }
    }, [controller, isPlaying, speed]);

    useEffect(() => {
        controller?.setMuted(muted);
    }, [controller, muted]);

    useImperativeHandle(
        ref,
        () => ({
            screenshot: async () => controllerRef.current?.screenshot() ?? undefined,
            renderFrame: async (f: number) => {
                const pc = controllerRef.current;
                if (!pc) return;
                await pc.seek(f);
            },
            seekWhilePlaying: (f: number) => controllerRef.current?.seekWhilePlaying(f),
            getTreeState: () => controllerRef.current?.getTreeState() ?? null,
            getNodeProps: (nodeId: string) => controllerRef.current?.getNodeState(nodeId) ?? null,
            getDuration: () => controllerRef.current?.totalDuration ?? 0,
            getSceneDurations: () => controllerRef.current?.tracks.slice() ?? [],
            getBuildErrors: () => controllerRef.current?.buildErrors ?? [],
        }),
        [],
    );

    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <canvas
                ref={canvasRef}
                width={viewport.width}
                height={viewport.height}
                style={{
                    display: isInitialized && controller ? "block" : "none",
                    width: "100%",
                    height: "100%",
                }}
            />
        </div>
    );
}
