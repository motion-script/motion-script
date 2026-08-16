import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import {
    AssetCatalog,
    PlaybackController,
    setTheme,
    setVariables,
    type AssetManifest,
    type BuildError,
    type Theme,
    type Variables,
    type Scene,
    type NodeBox,
    type NodeTextLayout,
    type NodeOverride,
    type NodeState,
    type Size2D,
    type TreeState,
    type Vector2,
    type WaveformInfo,
    type AudioTrack,
    type GlobalLayerConfig,
    Precomp,
    ProjectGlobals,
} from "@motion-script/core";
import {
    WebAudioPlayer,
    WebMasterClock,
    WebMeasurer,
    WebRenderContext,
    WebStorageAdapter,
} from "@motion-script/web";
import { useMotionScript } from "./provider";

/**
 * How far the background precomp pass has got. Only the scene that owns frame 0
 * is measured before the player mounts; the rest stream in behind it, growing
 * the timeline as they land (see `Precomp.runAsync`).
 */
export interface PrecompProgress {
    /** Scenes measured so far. */
    measuredScenes: number;
    /** Scenes in the project. */
    totalScenes: number;
    /** True on the final call, once every scene has been measured. */
    complete: boolean;
}

/**
 * What every caller that doesn't ask for a view gets: the whole frame, 1:1.
 *
 * A shared frozen object rather than a literal, so the view effect's dependency
 * on its fields is stable across renders for the overwhelming majority of
 * players, which never pass `view` at all.
 */
const IDENTITY_VIEW = Object.freeze({ zoom: 1, x: 0, y: 0 });

function precompProgressOf(result: { scenes: readonly { measured: boolean }[]; complete: boolean }): PrecompProgress {
    return {
        measuredScenes: result.scenes.filter(s => s.measured).length,
        totalScenes: result.scenes.length,
        complete: result.complete,
    };
}

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
    /**
     * Device pixels to rasterize per {@link viewport} unit. Defaults to `1`.
     *
     * **This is not a zoom and it is not a crop.** `viewport` stays the scene's
     * logical coordinate space; this only changes how many real pixels that space
     * is drawn into, and CSS scales the canvas back up to fill its box. Shrinking
     * `viewport` instead would show a smaller *window* onto the scene â€” a crop â€”
     * because scene coordinates map straight into it with the origin at centre.
     *
     * The lever exists because a preview is usually displayed far smaller than the
     * project's output size: a 1920Ã—1080 project in a 700px-wide panel rasterizes
     * roughly seven times the pixels anyone can see. `0.5` there is a quarter of
     * the fill, the shader work and the effect offscreens, for an image the
     * display cannot resolve the difference in. `@motion-script/web`'s
     * `StillRenderer` calls the same thing `scale`, and `exportScenesAsVideo`
     * takes it as `scale` too â€” all three drive `RenderContext.pixelRatio`.
     *
     * Two things to know before animating it:
     *
     * - **Every change re-creates the Skia surface.** CanvasKit builds a surface
     *   from the canvas's `width`/`height` at mount, so a new scale means resizing
     *   the canvas and mounting again. That drops the storage adapter's
     *   texture-backed images (decoded video frames, 3D composites; still images
     *   survive) and asks the browser for a fresh GL context. Quantize to a few
     *   steps and settle before changing it â€” do not drive it straight from a
     *   resize observer or a zoom gesture.
     * - **Prefer scales that keep both dimensions whole.** `pixelRatio` is one
     *   uniform number, so a scale that rounds differently on each axis shifts the
     *   frame's centre by up to half a device pixel. Quarters of a 1920Ã—1080
     *   viewport are all exact.
     *
     * A snapshot taken through {@link FrameHandle.screenshot} comes back at the
     * surface's size, so it is scaled too â€” render at `1` first if you need the
     * project's full resolution out of it.
     */
    renderScale?: number;
    /**
     * The canvas's own size in CSS pixels, when it is **not** the frame.
     *
     * Omitted — the default — the canvas is the frame: sized `viewport ×
     * renderScale` and stretched over its box by CSS, which is what every export,
     * thumbnail and plain player wants.
     *
     * Supplied, together with {@link view}, the canvas becomes a *window* onto the
     * frame: it takes the size of the area it is being shown in, `renderScale`
     * stops meaning "fraction of the project's resolution" and starts meaning
     * plain device pixels per CSS pixel (i.e. `devicePixelRatio`), and only what
     * is actually on screen is rasterized. That is what lets an editor zoom in
     * without either going soft or paying for the whole frame at the zoomed
     * resolution — see {@link view}.
     *
     * It re-creates the surface exactly as `renderScale` does, and for the same
     * reason, so it wants the same treatment: quantize it and let it settle rather
     * than driving it straight from a resize observer.
     */
    surfaceSize?: Size2D;
    /**
     * A pan and zoom applied to the render itself. Requires {@link surfaceSize}.
     *
     * `zoom` multiplies scene units; `x`/`y` offset the frame's centre in CSS
     * pixels, positive `y` downwards — the same sign convention as a CSS
     * translate, so a preview can hand over the pan it was already computing.
     *
     * Changing it costs a repaint and nothing else: no surface, no textures, no
     * precomp. That is the point of it living here rather than in a CSS transform
     * on the canvas, which cannot add resolution it was not rasterized with.
     */
    view?: { zoom: number; x: number; y: number };
    /** Scenes composed into a single timeline by an internal {@link Precomp}. */
    scenes: Scene[];
    /** Manifest describing the media assets referenced by `scenes`. */
    assets: AssetManifest;
    /** Project theme (colors, typography) applied globally before the player mounts. */
    theme?: Theme;
    /** Project variables applied globally before the player mounts; read in scene
     *  generators via `stage.variables(...)`. */
    variables?: Variables;
    /**
     * Project-level audio beds played across scene cuts (`ProjectConfig.audioTracks`).
     * Identity-compared like `scenes` â€” pass a stable array (the project config's
     * own), not a fresh literal per render, or the controller is rebuilt each time.
     */
    audioTracks?: AudioTrack[];
    /** Project-level nodes drawn over every scene (`ProjectConfig.overlays`). Same stability rule as `audioTracks`. */
    overlays?: GlobalLayerConfig[];
    /** Project-level nodes drawn under every scene (`ProjectConfig.backgrounds`). Same stability rule as `audioTracks`. */
    backgrounds?: GlobalLayerConfig[];
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
    /**
     * Called each time the background precomp measures another scene. Until it
     * reports `complete`, `getDuration()`/`getSceneDurations()` describe only the
     * scenes measured so far and will grow â€” re-pull them on every call.
     */
    onPrecompProgress?: (progress: PrecompProgress) => void;
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
    /**
     * The project's audio beds as timeline clips, in absolute seconds. Bounded
     * by the measured duration, so re-read alongside `getDuration()` as the
     * background precomp lengthens the timeline.
     */
    getGlobalAudio: () => WaveformInfo[];
    /** Errors raised while building the scene graph, if any. */
    getBuildErrors: () => BuildError[];
    /**
     * Hot-reload a single scene in place (dev-server `?scene` HMR). Re-runs only
     * the edited scene's precomp, swaps it into the live controller without
     * tearing down the render surface, and repaints the current frame. Returns
     * the matched scene index, or -1 if no slot matched (caller can fall back to
     * a full reload). No-op before the controller mounts.
     *
     * **The swap does not paint before its assets have loaded**, so the returned
     * index means "the slot was matched", not "the frame is on screen". A caller
     * that goes on to screenshot or read the tree must await
     * {@link whenReplaced} first.
     */
    hotReplaceScene: (scene: Scene) => number;
    /** Resolves once the paint the last {@link hotReplaceScene} scheduled has landed. */
    whenReplaced: () => Promise<void>;

    // ---- Direct manipulation ----------------------------------------------
    // Enough to build a selection gizmo over the canvas: where a node is, what
    // is under the pointer, and a write path that doesn't rebuild the scene.
    // Points are in viewport space â€” origin at the viewport centre, y-up, in the
    // `viewport` pixels this player was given.

    /** On-screen box of one node at the current frame, keyed by {@link TreeState.path}. */
    getNodeBox: (path: string) => NodeBox | null;
    /** Every visible node's box, in draw order. */
    getNodeBoxes: () => NodeBox[];
    /**
     * Where a Text node's caret slots landed on screen â€” for drawing a text
     * cursor and selection over the rendered glyphs, rather than over a DOM
     * input laid on top of them, which cannot agree with the shaper. `null` for
     * anything that isn't editable text; see {@link NodeTextLayout}.
     */
    getTextLayout: (path: string) => NodeTextLayout | null;
    /**
     * Topmost node under a viewport-space point. `tolerance` is grab-slop in
     * scene units â€” divide the desired screen slop by the host's preview zoom.
     */
    pickNode: (point: Vector2, tolerance?: number) => NodeBox | null;
    /**
     * Layer transient props over a node for direct manipulation, without
     * rebuilding the scene (which would tear down the render surface). Call
     * {@link repaint} after. Clear them once the host has committed the value.
     */
    setNodeOverride: (path: string, props: NodeOverride) => void;
    /** Drop one node's overrides, or all of them when `path` is omitted. */
    clearNodeOverrides: (path?: string) => void;
    /** Re-layout and repaint the current frame â€” no generator replay. */
    repaint: () => void;
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
    renderScale = 1,
    surfaceSize,
    view,
    scenes,
    assets,
    theme,
    variables,
    audioTracks,
    overlays,
    backgrounds,
    speed = 1,
    muted = false,
    onLoadingChange,
    onFrameChange,
    onBuildErrors,
    onPrecompProgress,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { canvasKit, isInitialized, precompCache, precompProfile } = useMotionScript();

    const [controller, setController] = useState<PlaybackController | null>(null);
    const controllerRef = useRef<PlaybackController | null>(null);

    const onLoadingChangeRef = useRef(onLoadingChange);
    /** Monotonic seek id; only the latest may clear the loading flag. */
    const seekTokenRef = useRef(0);
    // Force a re-render on each time tick; the value itself is unused.
    const [, setC] = useState(0);
    const initialFrameRef = useRef(initialFrame);
    const onFrameChangeRef = useRef(onFrameChange);
    const onBuildErrorsRef = useRef(onBuildErrors);
    const onPrecompProgressRef = useRef(onPrecompProgress);
    /**
     * The precomp cache is an injected dependency, not an input to the scene
     * graph, so it is read through a ref rather than listed in the mount effect's
     * deps â€” a host swapping in a different store must not tear down and rebuild
     * the whole controller. This effect is declared before the mount effect, so on
     * mount it has already run by the time the controller is constructed.
     */
    const precompCacheRef = useRef(precompCache);
    /** Same reasoning as {@link precompCacheRef}: injected, not a scene-graph input. */
    const precompProfileRef = useRef(precompProfile);
    /**
     * Read through a ref by the mount effect for the same reason as the two above:
     * `renderScale` describes how the frame is rasterized, not what is in it, so it
     * must not appear in that effect's deps or a scale change would tear down the
     * whole playback controller â€” precomp, asset catalog, audio and all â€” to change
     * one number. The surface alone is re-created, by the effect further down.
     */
    const renderScaleRef = useRef(renderScale);
    /** The live render context, so the resize effect can reach it after mount. */
    const renderContextRef = useRef<WebRenderContext | null>(null);

    /**
     * The canvas's backing store, in device pixels.
     *
     * `viewport × renderScale` in the default case, where the canvas *is* the
     * frame. With {@link Props.surfaceSize} it is the viewing area instead, and
     * `renderScale` is the display's pixel ratio rather than a fraction of the
     * project's resolution — see that prop.
     *
     * Floored at 1 so a degenerate scale can't ask CanvasKit for a zero-sized
     * surface, which fails the surface creation outright.
     */
    const bufferWidth = Math.max(1, Math.round((surfaceSize?.width ?? viewport.width) * renderScale));
    const bufferHeight = Math.max(1, Math.round((surfaceSize?.height ?? viewport.height) * renderScale));

    /**
     * The view transform to draw with, and the frame to clip and anchor against.
     *
     * Both are only meaningful together (see {@link SkiaRenderContext.frame}), so
     * they are resolved in one place: no `surfaceSize` means the canvas is the
     * frame, and both revert to the identity behaviour every other caller gets.
     */
    const activeView = surfaceSize && view ? view : IDENTITY_VIEW;
    const activeFrame = surfaceSize && view ? viewport : null;

    /**
     * What the current surface was actually built for.
     *
     * Compared against the props rather than trusting the effect to fire once:
     * the resize effect and the mount effect can both run in the same commit (a
     * scene edit that also changes the preview's size), and the mount already
     * builds at the new size â€” without this the resize effect would immediately
     * throw that surface away and build an identical one.
     */
    const appliedSurfaceRef = useRef({ scale: renderScale, width: bufferWidth, height: bufferHeight });
    /** Read by the mount effect, for the same reason as {@link renderScaleRef}. */
    const viewRef = useRef(activeView);
    const frameRectRef = useRef(activeFrame);

    // Keep callback/value refs current without touching them during render.
    useEffect(() => {
        onLoadingChangeRef.current = onLoadingChange;
        initialFrameRef.current = initialFrame;
        onFrameChangeRef.current = onFrameChange;
        onBuildErrorsRef.current = onBuildErrors;
        onPrecompProgressRef.current = onPrecompProgress;
        precompCacheRef.current = precompCache;
        precompProfileRef.current = precompProfile;
        renderScaleRef.current = renderScale;
        viewRef.current = activeView;
        frameRectRef.current = activeFrame;
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !canvasKit) return;
        setTheme(theme);
        setVariables(variables);
        const catalog = new AssetCatalog(assets);
        const storage = new WebStorageAdapter(canvasKit, catalog, viewport, fps);
        const measure = new WebMeasurer(storage);
        const audio = new WebAudioPlayer();
        const clock = new WebMasterClock({ context: audio.getContext(), fps });
        const renderContext = new WebRenderContext(canvasKit, storage);
        // Before `mount`, which builds the Skia surface from the canvas's current
        // `width`/`height` â€” React has already written those at this scale, so the
        // two agree from the first frame and nothing paints at the wrong ratio.
        renderContext.pixelRatio = renderScaleRef.current;
        renderContext.view = viewRef.current;
        renderContext.frame = frameRectRef.current;
        appliedSurfaceRef.current = {
            scale: renderScaleRef.current,
            width: canvas.width,
            height: canvas.height,
        };
        renderContext.mount(canvas);
        renderContextRef.current = renderContext;

        // Built here, after setTheme/setVariables above: a layer declared as a
        // factory is invoked inside this constructor, so its theme tokens resolve
        // against the registry this mount just populated.
        const globals = new ProjectGlobals({ audioTracks, overlays, backgrounds }, viewport);

        const pc: PlaybackController = new PlaybackController({
            renderContext,
            measureScope: measure,
            storageAdapter: storage,
            masterClock: clock,
            precomposition: new Precomp(scenes, viewport, fps, catalog, measure, {
                cache: precompCacheRef.current,
                profile: precompProfileRef.current,
                globals,
            }),
            audioDevice: audio,
            assets: catalog,
            fps,
            viewport,
            scenes,
            // Only the scene owning frame 0 is measured before this returns; the
            // rest arrive here as they land. A scene finishing both lengthens the
            // timeline and can surface a build error it threw, so refresh both â€”
            // the same pair hotReplaceScene refreshes after an in-place swap.
            onPrecompProgress: (result) => {
                onBuildErrorsRef.current?.(result.buildErrors);
                onPrecompProgressRef.current?.(precompProgressOf(result));
            },
        });

        if (pc.buildErrors.length > 0) {
            onBuildErrorsRef.current?.(pc.buildErrors);
        }

        // A frame that fails to draw reaches the same banner a scene that failed
        // to build does. Before this it propagated out of `seek` as an unhandled
        // rejection and the scene simply stopped updating — the exact silence the
        // load-or-throw guards were added to replace.
        pc.onRenderError = (errors) => {
            onBuildErrorsRef.current?.(errors);
        };

        pc.onTime((t: number) => {
            onFrameChangeRef.current?.(Math.trunc(t * fps));
            setC(t);
        });
        controllerRef.current = pc;
        setController(pc);

        // Publish the starting position immediately. The controller only measured
        // the scene owning frame 0, so a multi-scene project is already incomplete
        // here â€” without this the UI would show nothing until the *second* scene
        // lands, which on a long project is exactly the wait we're trying to
        // make visible.
        onPrecompProgressRef.current?.(precompProgressOf(pc.precomp));
        onLoadingChangeRef.current?.(true);

        return () => {
            controllerRef.current = null;
            setController(null);
            renderContextRef.current = null;
            pc.dispose();
            renderContext.dispose();
        };
    }, [canvasKit, assets, viewport, fps, scenes, theme, variables, audioTracks, overlays, backgrounds]);

    /**
     * Rebuild the surface when the backing store changes â€” {@link Props.renderScale}
     * or {@link Props.surfaceSize}.
     *
     * Separate from the mount effect on purpose: a scale change must cost one
     * surface, not a whole playback controller. Everything the controller owns â€”
     * the measured precomp, the asset catalog, the audio graph, the clock, the
     * playhead â€” is unaffected by how many device pixels a frame is drawn into.
     *
     * The order matters and is why this is an effect rather than a callback: React
     * has already written the canvas's new `width`/`height` by the time effects
     * run, and CanvasKit reads exactly those when it builds the surface
     * (`MakeOnScreenGLSurface(ctx, canvas.width, canvas.height)`). Mounting before
     * the resize would produce a surface of the previous size.
     *
     * `repaint()` afterwards because the new surface starts blank, and the
     * controller's clock is not necessarily running to fill it â€” a paused editor
     * would otherwise show black until something else moved.
     */
    useEffect(() => {
        if (!controller) return;
        const renderContext = renderContextRef.current;
        const canvas = canvasRef.current;
        if (!renderContext || !canvas) return;
        const applied = appliedSurfaceRef.current;
        if (applied.scale === renderScale && applied.width === bufferWidth && applied.height === bufferHeight) return;
        appliedSurfaceRef.current = { scale: renderScale, width: bufferWidth, height: bufferHeight };
        renderContext.pixelRatio = renderScale;
        // `mount` detaches the old surface first, which also drops the storage
        // adapter's texture-backed images â€” they belong to the surface that made
        // them. Video frames and 3D composites are re-uploaded on demand; decoded
        // still images are raster-backed and survive.
        renderContext.mount(canvas);
        controller.repaint();
    }, [controller, renderScale, bufferWidth, bufferHeight]);

    /**
     * Apply {@link Props.view} â€” a repaint and nothing more.
     *
     * The whole reason the zoom lives in the render rather than in a CSS transform
     * on the canvas is that this is all it costs. The surface, its textures, the
     * precomp and the playhead are all indifferent to where the view is pointed,
     * so panning and zooming an editor never touches any of them â€” which is a
     * strict improvement on the arrangement it replaces, where zooming far enough
     * to change `renderScale` rebuilt the surface and dropped every decoded video
     * frame with it.
     *
     * Depends on the fields rather than the object so a caller passing a fresh
     * `{zoom, x, y}` each render â€” which is every caller, since it is derived from
     * a gesture â€” doesn't repaint on renders where the view didn't actually move.
     */
    useEffect(() => {
        if (!controller) return;
        const renderContext = renderContextRef.current;
        if (!renderContext) return;
        renderContext.view = { zoom: activeView.zoom, x: activeView.x, y: activeView.y };
        renderContext.frame = activeFrame;
        controller.repaint();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [controller, activeView.zoom, activeView.x, activeView.y, activeFrame?.width, activeFrame?.height]);

    // Apply initialFrame changes while paused (scrubbing). When playing, the
    // controller's own clock drives time, so we ignore prop-driven seeks.
    //
    // This effect is the single seek driver for the paused path â€” don't add a
    // competing imperative renderFrame() call for the same frame, or the two
    // seeks bump each other's generation and cancel one another in a ping-pong.
    useEffect(() => {
        if (!controller || isPlaying) return;
        // Only the newest seek may report "settled". A superseded seek still
        // resolves â€” its generation guard bailed inside the controller â€” but it
        // never painted, so clearing the loading flag from it would tell the UI a
        // frame is ready when the newest one is still in flight. Consumers use
        // that edge to pace scrubbing, so a false settle would let them commit
        // the next seek early and defeat the back-pressure.
        const token = ++seekTokenRef.current;
        onLoadingChangeRef.current?.(true);
        controller.seek(initialFrame).then(() => {
            if (token !== seekTokenRef.current) return;
            onLoadingChangeRef.current?.(false);
        });
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
            getGlobalAudio: () => controllerRef.current?.globalAudio ?? [],
            getBuildErrors: () => controllerRef.current?.buildErrors ?? [],
            hotReplaceScene: (scene: Scene) => {
                const pc = controllerRef.current;
                if (!pc) return -1;
                pc.clearRenderErrors();
                const index = pc.replaceScene(scene);
                if (index < 0) return -1;
                // Surface any new build error from the edited scene.
                onBuildErrorsRef.current?.(pc.buildErrors);
                // The swap loads before it paints now, so the loading edge is a
                // real one rather than the synchronous true/false pulse this
                // used to fire â€” which reported "done" before anything had
                // happened, and which a host watching that edge to re-read the
                // tree would act on too early.
                onLoadingChangeRef.current?.(true);
                void pc.whenReplaced().then(() => {
                    if (controllerRef.current !== pc) return;
                    onLoadingChangeRef.current?.(false);
                });
                return index;
            },
            whenReplaced: async () => {
                await controllerRef.current?.whenReplaced();
            },
            getNodeBox: (path: string) => controllerRef.current?.getNodeBox(path) ?? null,
            getNodeBoxes: () => controllerRef.current?.getNodeBoxes() ?? [],
            getTextLayout: (path: string) => controllerRef.current?.getTextLayout(path) ?? null,
            pickNode: (point: Vector2, tolerance?: number) =>
                controllerRef.current?.pickNode(point, tolerance) ?? null,
            setNodeOverride: (path: string, props: NodeOverride) =>
                controllerRef.current?.setNodeOverride(path, props),
            clearNodeOverrides: (path?: string) => controllerRef.current?.clearNodeOverrides(path),
            repaint: () => controllerRef.current?.repaint(),
        }),
        [],
    );

    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <canvas
                ref={canvasRef}
                // The backing store, in device pixels. CSS below stretches it back
                // over the whole box either way, so this is purely how much gets
                // rasterized â€” see {@link Props.renderScale} and
                // {@link Props.surfaceSize}.
                width={bufferWidth}
                height={bufferHeight}
                style={{
                    display: isInitialized && controller ? "block" : "none",
                    ...(surfaceSize
                        ? {
                              // `surfaceSize` is the canvas's CSS size, so it is
                              // honoured literally rather than stretched to the
                              // box: it is quantized by its caller (a canvas
                              // rebuilt on every pixel of a panel drag is a
                              // dropped texture set per pixel), which means it is
                              // usually a little larger than the box and rarely
                              // the same shape. Stretched, that difference would
                              // land as a non-uniform scale â€” a picture squashed
                              // on one axis, which is a far worse artefact than
                              // the softness this whole arrangement exists to
                              // remove.
                              //
                              // Centred, so the surface's midpoint is the box's
                              // midpoint. `executePass` puts the scene origin at
                              // the centre of the surface, so this is what makes
                              // the frame land where the caller's own layout says
                              // it is; the spare pixels hang off all four edges
                              // and are clipped by whatever is holding this.
                              position: "absolute",
                              left: "50%",
                              top: "50%",
                              width: `${surfaceSize.width}px`,
                              height: `${surfaceSize.height}px`,
                              transform: "translate(-50%, -50%)",
                          }
                        : { width: "100%", height: "100%" }),
                }}
            />
        </div>
    );
}
