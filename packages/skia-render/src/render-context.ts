import type {
    CanvasKit,
    Canvas,
    Image as CKImage,
    Surface,
    Paint,
    Path as CKPath,
    Shader,
    TileMode,
} from "@motion-script/canvaskit";
import {
    type BooleanOperation,
    Clip,
    type ClipOp,
    resolveSurfaceSource,
    type SurfaceSource3D,
    type EllipseState,
    type Fill,
    type FillResolved,
    type FillSpace,
    type Shadow,
    type ShadowResolved,
    type Stroke,
    type StrokeResolved,
    type LineState,
    type MaskOptions,
    type PathState,
    type PolygonState,
    type PolygramState,
    type PathCommand,
    type PathBounds,
    type RectState,
    type ShapeAnchorInput,
    Graphics,
    type GraphicsOp,
    type RasterizedSurface,
    RenderContext,
    type RichTextState,
    type SpaceRect,
    type NodeRenderState,
    type TextState,
    type TransformState,
    type Vector2,
    type Anchor,
    type MotionBlurEffect,
    type FontStyle,
    type SceneEffect,
    type EffectTarget,
    type NodeBlendMode,

    withRichTextDescriptor,
    resolveFillArray,
    resolveStrokeArray,
    resolveShadowArray,
    resolveAnchor,
    resolveShapeAnchor,
    resolvePivotPosition,
    stripShapeAnchorKeys,
    ShapeState,
    type TextBlockLayout,

} from "@motion-script/core";


// 3D backend. Only `view3DBackend`/`requestView3DWarm` are reached on a draw,
// and both are cheap no-ops until three has been lazily imported — so a 2D-only
// project never pulls in the three chunk.
import { disposeView3DBackend, view3DBackend } from "./three/backend";
// Through the seam rather than reaching into `./three/renderer` directly: the
// render context is portable and the renderer is not, so it must not know which
// platform owns the GL context.
import { view3DRendererHost } from "./three/renderer-seam";
import { disposeTextureCache } from "./three/handlers/texture";
import { layoutRichText } from "./shapes/richtext";
import { drawShapedRun } from "./shapes/paragraph-layout";
import { textBlockLayout } from "./shapes/text";
import { measureTextCached } from "./shapes/paragraph-cache";
import { layoutTextSegments, runCenter } from "./shapes/text-segments";
import { RectShape } from "./shapes/rect";
import { EllipseShape } from "./shapes/ellipse";
import { PolygonShape } from "./shapes/polygon";
import { PolygramShape } from "./shapes/polygram";
import { PathShape } from "./shapes/path";
import { LineShape } from "./shapes/line";
import type { CurrentShape } from "./shapes/shape-handler";
import { EffectRegistry } from "./effects/registry";
import { resolveMotionBlur } from "./effects/motion-blur";
import type { EffectHandler, EffectGeometry, EffectResources, RenderInputShaders } from "./effects/handler";
import { disposeSkSLCache } from "./sksl-cache";
import { StrokeHandler } from "./stroke/stroke-handler";
import { ShapeHandler } from "./shapes/shape-handler";
import { FillHandler } from "./fills/handler";
import type { SkiaAssets } from "./assets";
import { getCanvasKitBlendMode } from "./blend";

type DeferredPaintCall =
    | { kind: 'fill'; shapes: CurrentShape[]; fills: FillResolved[]; shadows: ShadowResolved[] | null }
    | { kind: 'stroke'; shapes: CurrentShape[]; strokes: StrokeResolved[]; shadows: ShadowResolved[] | null };

// ─── y-up → canvas-y flip ────────────────────────────────────────────────────
// Per-shape descriptor coordinates are authored y-UP (y=100 is 100px ABOVE the
// origin, matching node x/y and the pivot/anchor vocabulary). The canvas the
// shapes are drawn into is y-DOWN. Rather than scatter `-y` through the
// descriptor resolvers or every computeGeometry, the renderer owns the mapping:
// each shape op's y is negated here, once, as it enters the paint/measure pass.
//
// Negating a shape's *center* y (rect/ellipse/poly/text) moves the whole shape;
// its geometry is rebuilt symmetrically about the new center, so symmetric shapes
// are correct with nothing more. Vertically-asymmetric features must also be
// reflected so the shape isn't mirrored: a rect's per-corner radii/styles swap
// top↔bottom, and a partial ellipse's arc reverses (negate startAngle + sweep).
// Line points and path commands carry their own per-point y, negated individually.

/** Negate a scalar y, treating undefined as 0 (the descriptor default). */
const negY = (y: number | undefined): number => -(y ?? 0);

/**
 * Collapse any cardinal-anchor positioning into a concrete y-up centre `x`/`y`
 * and `pivot`, *then* negate that centre's y to canvas space. Anchor resolution
 * (`resolveShapeAnchor`) is done entirely in y-up (target y-up → centre y-up,
 * pivot y-up); only the final centre y is flipped here. The resolved x/y/pivot
 * replace the op's positioning inputs and the anchor keys are stripped, so the
 * later `with*Descriptor` sees a plain canvas-space centre and no anchor.
 */
function flipPositionY<T extends Partial<ShapeState> & ShapeAnchorInput>(
    state: T, width: number, height: number,
): T {
    const withPivotOffset = resolvePivotPosition(state, width, height);
    const { x, y, pivot } = resolveShapeAnchor(withPivotOffset, width, height);
    return { ...stripShapeAnchorKeys(withPivotOffset), x, y: -y, pivot } as T;
}

/** Swap the top and bottom entries of a per-corner value (a vertical mirror). */
function swapCornersTopBottom<T>(c: { topLeft: T; topRight: T; bottomRight: T; bottomLeft: T }) {
    return { topLeft: c.bottomLeft, topRight: c.bottomRight, bottomRight: c.topRight, bottomLeft: c.topLeft };
}

type RectInput = Partial<RectState> & ShapeAnchorInput;
type EllipseInput = Partial<EllipseState> & ShapeAnchorInput;
type PolygonInput = Partial<PolygonState> & ShapeAnchorInput;
type PolygramInput = Partial<PolygramState> & ShapeAnchorInput;
type TextInput = Partial<TextState> & ShapeAnchorInput;
type RichTextInput = Partial<RichTextState> & ShapeAnchorInput;

function flipRectY(state: RectInput): RectInput {
    const out: RectInput = flipPositionY(state, state.width ?? 0, state.height ?? 0);
    // Per-corner radii/styles are labelled top/bottom; a vertical flip must swap
    // them so the visual top keeps its authored top corners. A uniform radius (a
    // plain number) is mirror-invariant and passes through untouched.
    if (state.cornerRadius != null && typeof state.cornerRadius === "object") {
        out.cornerRadius = swapCornersTopBottom(state.cornerRadius as any) as any;
    }
    if (state.cornerStyle != null && typeof state.cornerStyle === "object") {
        out.cornerStyle = swapCornersTopBottom(state.cornerStyle as any) as any;
    }
    return out;
}

function flipEllipseY(state: EllipseInput): EllipseInput {
    const out: EllipseInput = flipPositionY(state, state.width ?? 0, state.height ?? 0);
    // A partial arc is defined by startAngle/sweep measured in y-down space; under
    // a vertical flip the arc must sweep the mirrored direction and start at the
    // mirrored angle, so it traces the same visual wedge. (Full ellipses: no-op.)
    if (state.startAngle != null) out.startAngle = -state.startAngle;
    if (state.sweep != null) out.sweep = -state.sweep;
    return out;
}

function flipPolygonY(state: PolygonInput): PolygonInput {
    // Vertices are cy + ry*sin(a); flipping the center mirrors them vertically.
    // Polygon/polygram have no startAngle field (their orientation is fixed by
    // `sides`), and a regular polygon's vertical mirror is itself for the default
    // orientation, so flipping the resolved centre y is sufficient.
    return flipPositionY(state, state.width ?? 0, state.height ?? 0);
}

function flipPolygramY(state: PolygramInput): PolygramInput {
    return flipPositionY(state, state.width ?? 0, state.height ?? 0);
}

function flipLineY(state: Partial<LineState>): Partial<LineState> {
    const points = state.points ? state.points.map((p) => ({ x: p.x, y: -p.y })) : state.points;
    return { ...state, y: negY(state.y), points };
}

function flipTextY(state: TextInput): TextInput {
    // Only the text's position flips; glyphs stay upright (we negate the origin y,
    // not the glyph orientation). Text-on-path follows its path verbatim.
    return flipPositionY(state, state.width ?? 0, state.height ?? 0);
}

function flipRichTextY(state: RichTextInput): RichTextInput {
    return flipPositionY(state, state.width ?? 0, state.height ?? 0);
}

/** Negate the y of a single PathCommand, mirroring it vertically. Arc commands
 *  also flip their sweep flag, since a vertical mirror reverses arc winding;
 *  `largeArc` and the arc rotation are unaffected. */
function flipPathCommandY(cmd: PathCommand): PathCommand {
    switch (cmd.type) {
        case "M": case "m": case "L": case "l": case "T": case "t":
            return { ...cmd, y: -cmd.y };
        case "V": case "v":
            return { ...cmd, y: -cmd.y };
        case "H": case "h":
            return cmd; // no y component
        case "C": case "c":
            return { ...cmd, y1: -cmd.y1, y2: -cmd.y2, y: -cmd.y };
        case "S": case "s":
            return { ...cmd, y2: -cmd.y2, y: -cmd.y };
        case "Q": case "q":
            return { ...cmd, y1: -cmd.y1, y: -cmd.y };
        case "A": case "a":
            return { ...cmd, y: -cmd.y, sweep: (cmd.sweep === 1 ? 0 : 1) };
        case "Z": case "z":
            return cmd;
    }
}

function flipPathY(state: Partial<PathState>): Partial<PathState> {
    const out: Partial<PathState> = { ...state, y: negY(state.y) };
    // PathCommand[] is authored y-up — mirror every command. A raw SVG `d` string
    // is interpreted in its own coordinate space (the path self-centers on its
    // bbox), so it is left untouched; use a command array for y-up authoring.
    if (Array.isArray(state.data)) {
        out.data = state.data.map(flipPathCommandY);
    }
    // centerBounds is [minX, minY, maxX, maxY]; a vertical flip negates and swaps
    // the y extents so the explicit frame still matches the mirrored commands.
    if (state.centerBounds) {
        const [minX, minY, maxX, maxY] = state.centerBounds;
        out.centerBounds = [minX, -maxY, maxX, -minY] as PathBounds;
    }
    return out;
}

/**
 * A foreground shader effect mid-flight: drawing is redirected into `offscreen`
 * until {@link SkiaRenderContext.endEffectScope} snapshots it and repaints it
 * through `handler`'s lens. `width`/`height` are the node's logical size,
 * `matrix` the CTM captured when the scope opened.
 */
type ForegroundCapture = {
    handler: EffectHandler;
    effect: SceneEffect;
    width: number;
    height: number;
    savedCanvas: Canvas;
    offscreen: Surface;
    matrix: number[];
};

/**
 * One shader the renderer built for a handler (see
 * {@link EffectHandler.renderInputs}), with the disposer for it and the two
 * objects behind it.
 */
type BuiltInput = { shader: Shader; dispose(): void };

/** Shared no-op disposer, for the overwhelmingly common "asked for nothing" case. */
const NOOP = (): void => { };

/** Map a {@link EffectHandler} tile-mode literal to its CanvasKit enum. */
function tileMode(ck: CanvasKit, mode: "clamp" | "decal") {
    return mode === "decal" ? ck.TileMode.Decal : ck.TileMode.Clamp;
}

/** Map a {@link EffectHandler} filter-mode literal to its CanvasKit enum. */
function filterMode(ck: CanvasKit, mode: "linear" | "nearest") {
    return mode === "nearest" ? ck.FilterMode.Nearest : ck.FilterMode.Linear;
}

/**
 * Geometry for the ImageFilter path, where only the box *size* is meaningful —
 * a composed `ImageFilter` is positioned by the layer it is attached to, so a
 * centre would be meaningless. Filters here are authored in logical px and the
 * CTM scales them, hence `scale: 1`. (The shader path builds a full
 * {@link EffectGeometry} from the CTM in `shaderGeometry`.)
 */
function boxGeometry(width: number, height: number): EffectGeometry {
    return {
        width, height, centerX: 0, centerY: 0, scale: 1, time: 0,
        // Motion is meaningless on this path: an ImageFilter is positioned by the
        // layer it attaches to, and every velocity-derived effect is a shader.
        velocity: ZERO_VELOCITY, angularVelocity: 0,
    };
}

/** Shared "no motion" vector, so the common case allocates nothing per frame. */
const ZERO_VELOCITY = { x: 0, y: 0 } as const;

/** Nesting ceiling for {@link SkiaRenderContext.rasterizeOffscreen}. */
const MAX_RASTER_DEPTH = 4;

/**
 * Ceiling on a rasterized surface's device-pixel ratio. A surface's resolution is
 * its `width`/`height`; the ratio only exists to sharpen one viewed close up, and
 * the cost is quadratic in a buffer that gets read back every frame.
 */
const MAX_RASTER_PIXEL_RATIO = 4;

/**
 * Fold a text segment's opacity into its fill layers by multiplying each
 * layer's `opacity` (the fill handler then multiplies that by the node's world
 * alpha, so node opacity and selection opacity compose). Returns the input
 * unchanged when `segmentOpacity` is 1 to avoid allocating per frame.
 */
function applySegmentOpacityToFills(fills: FillResolved[], segmentOpacity: number): FillResolved[] {
    if (segmentOpacity >= 1) return fills;
    return fills.map(f => ({ ...f, opacity: (f.opacity ?? 1) * segmentOpacity }));
}

/** Fold a segment's opacity into each stroke's fill layers (see {@link applySegmentOpacityToFills}). */
function applySegmentOpacityToStrokes(strokes: StrokeResolved[], segmentOpacity: number): StrokeResolved[] {
    if (segmentOpacity >= 1) return strokes;
    return strokes.map(s => ({ ...s, fill: applySegmentOpacityToFills(s.fill, segmentOpacity) }));
}

/**
 * CanvasKit/Skia implementation of {@link RenderContext} — the main render
 * loop driving a mounted `<canvas>` (or an offscreen one during export).
 * Owns the WebGL surface and the per-frame draw stack (transforms, clips,
 * masks, camera, backdrop effects); delegates shape/fill/stroke painting to
 * the handlers built in {@link buildHandlers}. All async asset work happens
 * up front in the platform storage adapter so render() stays synchronous per frame.
 */
export abstract class SkiaRenderContext extends RenderContext {
    private currentCanvas!: Canvas;
    /** Protected so a platform subclass can create its own surface — see {@link attach}. */
    protected canvasKit!: CanvasKit;
    private surface!: Surface;

    /**
     * The surface `currentCanvas` belongs to.
     *
     * Normally the mounted one, but {@link rasterizeOffscreen} swaps both in
     * lockstep. Anything that needs the *size of what is being drawn into* — the
     * device-space shader rect, the `'global'` fill space, a backdrop snapshot,
     * a compatible offscreen — must read this rather than `this.surface`, or a
     * node inside a `Surface2D` gets the main canvas' dimensions.
     */
    private activeSurface!: Surface;

    /**
     * Depth of nested {@link rasterizeOffscreen} passes. A `Surface2D` may hold a
     * `View3D` which holds another `Surface2D`; the tree is finite so this can't
     * actually run away, but a mistake here costs a full GPU readback per level,
     * so it's bounded rather than trusted.
     */
    private rasterDepth = 0;
    private paint!: Paint;
    private layerPaint!: Paint;
    private mounted: boolean = false;
    private isRendering: boolean = false;

    // Tracks extra saveLayer() calls pushed by transform() for each begin()/end() pair.
    private effectLayerStack: number[] = [];

    // Accumulated "world" alpha for pass-through nodes. A pass-through node does
    // not isolate, so its opacity is folded into every paint it draws (and into
    // its descendants') instead of being realised through a group saveLayer —
    // this is what lets a fill's blend mode keep mixing against the backdrop
    // while the node fades. begin() snapshots the inherited alpha, transform()
    // multiplies in the node's own opacity (pass-through) or resets to 1 inside
    // an isolating blend layer, and end() restores the snapshot.
    private worldAlpha = 1;
    private worldAlphaStack: number[] = [];

    private clipRestoreStack: number[] = [];

    /**
     * The {@link Clip} each open `beginClip` scope was given, innermost last.
     *
     * The canvas keeps the clip as *state* — there is no reading a path back out
     * of it — but a shader effect that has to know the shape it is confined to
     * needs the outline itself (see {@link silhouetteShader}). Retaining the
     * `Clip` rather than a built path costs a push and a pop: the path is only
     * combined when an effect actually asks for it, which almost none do.
     */
    private clipShapeStack: Clip[] = [];

    private fillHandler!: FillHandler;
    private strokeHandler!: StrokeHandler;
    private shapeHandler!: ShapeHandler;

    // Per-mask-scope deferred paint calls (filled by stroke/fill when apply filtering is active).
    // Each entry on the stack corresponds to one active mask scope.
    private deferredPaintsStack: DeferredPaintCall[][] = [];

    // Initialized in init() once CanvasKit is loaded.
    storageAdapter!: SkiaAssets;


    constructor(canvasKit: CanvasKit, storageAdapter: SkiaAssets) {
        super();
        this.canvasKit = canvasKit;
        this.storageAdapter = storageAdapter;
        this.paint = new this.canvasKit.Paint();
        this.paint.setAntiAlias(true);
        this.layerPaint = new this.canvasKit.Paint();

        this.buildHandlers();
    }
    measureText(text: string, fontSize: number, fontFamily: string, fontWeight: number = 400, letterSpacing: number = 0, fontStyle: FontStyle = 'normal'): number {
        return measureTextCached(
            this.canvasKit,
            this.storageAdapter.getFontMgr(),
            this.storageAdapter.getParagraphCache(),
            this.storageAdapter.getFontEpoch(),
            text, fontSize, fontFamily, fontWeight, letterSpacing, fontStyle,
        );
    }
    override layoutTextBlock(state: Partial<TextState>): TextBlockLayout | null {
        // Same shaping path as the draw, so a caret drawn from these slots sits
        // on the glyph rather than beside it.
        return textBlockLayout(this.canvasKit, this.storageAdapter.getFontMgr(), state);
    }
    private buildHandlers(): void {
        const getCanvas = () => this.currentCanvas;
        const getPaint = () => this.paint;

        this.shapeHandler = new ShapeHandler(
            this.canvasKit,
            getCanvas,
            getPaint,
            this.storageAdapter.getFontMgr(),
            this.storageAdapter.getParagraphCache(),
            () => this.storageAdapter.getFontEpoch(),
        );

        const getWorldAlpha = () => this.worldAlpha;

        this.fillHandler = new FillHandler(
            this.canvasKit,
            getPaint,
            getCanvas,
            () => this.shapeHandler.getShapeBounds(),
            (space) => this.spaceRect(space),
            this.storageAdapter,
            getWorldAlpha,
            // The node stack, not ShapeHandler.currentNodeId — that one is set by
            // beginNode with no counterpart in end(), so it goes stale once a
            // child has rendered.
            () => (this.currentNodeStack.length > 0 ? this.currentNodeId() : ""),
            // The painting node's age, for fills that resolve themselves against
            // the clock (video). Same source the time-based effects read.
            () => this.currentRenderState()?.elapsed ?? 0,
            () => {
                // Pixel ratio, parent scale and camera zoom, already folded
                // together by the canvas matrix.
                const m = this.currentCanvas.getTotalMatrix();
                return Math.max(Math.hypot(m[0], m[3]), Math.hypot(m[1], m[4]), 1);
            },
            (source, width, height, ratio) => this.rasterizeSurfaceSource(source, width, height, ratio),
            // A media filter that bakes a second texture (ascii's glyph atlas,
            // texture/displace's source image) resolves it exactly as the scene
            // effect of the same name does.
            () => this.effectResources(),
        );

        this.strokeHandler = new StrokeHandler(
            this.canvasKit,
            getCanvas,
            getPaint,
            this.fillHandler,
        );
    }

    pixelRatio: number = 1;

    /**
     * A pan and zoom applied to the whole pass — an editor showing part of the
     * frame close up, rather than the frame.
     *
     * Identity by default, and every existing caller leaves it that way: an
     * export, a thumbnail and a plain player all draw the whole frame at 1:1, and
     * for them this costs one comparison per pass and changes nothing.
     *
     * It exists because zooming a preview by scaling the *canvas element* is
     * resolution-destroying. The surface holds `viewport × pixelRatio` device
     * pixels however far in the view is zoomed, so a 4× zoom stretches a
     * 1920-wide raster across four times the screen and the browser interpolates
     * the difference. Raising `pixelRatio` to compensate is not a fix either: it
     * supersamples the *entire* frame to show a crop of it, so covering 8× on a
     * 1920×1080 project means a 15360×8640 surface — hundreds of megabytes to
     * display a panel's worth of pixels.
     *
     * Putting the zoom here instead inverts that. The surface is sized to the
     * *viewing area* rather than to the frame, only what is on screen is
     * rasterized, and it is rasterized at exactly the display's resolution at any
     * zoom. The cost stops depending on the zoom altogether — and, since nothing
     * about the surface changes when the view does, so does the surface rebuild
     * that a zoom used to trigger.
     *
     * `x`/`y` are in the same logical pixels as the surface, applied before the
     * zoom; positive `y` moves the frame down, matching a CSS translate.
     */
    view: { zoom: number; x: number; y: number } = { zoom: 1, x: 0, y: 0 };

    /**
     * The project's frame in scene units, when the surface is not the frame.
     *
     * Required whenever {@link view} is used, and meaningless otherwise. Two
     * things stop being derivable from the surface once the two sizes come apart,
     * and both are wrong in ways that are easy to miss:
     *
     * - **What is off-frame stays off-frame.** A node parked outside the frame is
     *   currently hidden by the edge of the canvas and by nothing else. With a
     *   surface bigger than the frame it would simply be *visible*, so the frame
     *   boundary has to become a real clip.
     * - **`'global'` fill space means the frame**, not the window onto it. Left to
     *   read the surface, a global gradient would re-stretch itself every time the
     *   view was panned or zoomed — the one thing a preview must never do.
     */
    frame: { width: number; height: number } | null = null;

    private executePass(callback: () => void): void {
        // The surface is freed on dispose()/unmount(). A late async render (e.g. a
        // seek resolving after a StrictMode/HMR remount disposed this context)
        // would otherwise call getCanvas() on a deleted Surface and throw.
        if (!this.mounted || !this.surface) return;
        this.currentCanvas = this.surface.getCanvas();
        this.activeSurface = this.surface;
        // Transparent wherever the surface is larger than the frame, so whatever is
        // behind the canvas still shows *around* the picture — a preview's panel
        // and its backdrop, which a full-bleed black would paint over. The frame's
        // own black goes down inside the clip below, so the picture itself is
        // unchanged. With no frame the surface *is* the picture and the plain
        // full-surface clear is exactly right.
        this.currentCanvas.clear(this.frame ? this.canvasKit.TRANSPARENT : this.canvasKit.BLACK);
        this.currentCanvas.save();
        const logicalW = this.surface.width() / this.pixelRatio;
        const logicalH = this.surface.height() / this.pixelRatio;
        this.currentCanvas.scale(this.pixelRatio, this.pixelRatio);
        this.currentCanvas.translate(logicalW / 2 + this.view.x, logicalH / 2 + this.view.y);
        if (this.view.zoom !== 1) {
            this.currentCanvas.scale(this.view.zoom, this.view.zoom);
        }
        // The frame's own edge, now that the surface's is somewhere else. Anti-
        // aliased, so a fractional zoom doesn't leave a hard stair-stepped border
        // down the side of the picture.
        if (this.frame) {
            const ck = this.canvasKit;
            const halfW = this.frame.width / 2;
            const halfH = this.frame.height / 2;
            this.currentCanvas.clipRect(
                ck.LTRBRect(-halfW, -halfH, halfW, halfH),
                ck.ClipOp.Intersect,
                true,
            );
            // The frame's backdrop, in the space the full-surface clear used to
            // cover. `Src` rather than the default source-over, so it *replaces*
            // the transparent clear instead of compositing onto it — the frame is
            // opaque black, exactly as it has always been.
            this.currentCanvas.drawColor(ck.BLACK, ck.BlendMode.Src);
        }

        // Bracket the pass so the 3D backend can tell which nodes drew this frame
        // and free the graphs of ones that didn't (a removed View3D, a scene
        // switch). Cheap no-op before three has loaded.
        const view3D = view3DBackend(this.storageAdapter);
        view3D?.beginFrame();
        // Paint slots are per frame too, and key the 3D resources the sweep above
        // releases — the two brackets must stay together.
        this.fillHandler.beginFrame();
        // Which clip texture is claimed by which timestamp is also per pass, so a
        // second time of the same clip is served its own image (see
        // SkiaAssets.claimVideoFrame).
        this.storageAdapter.beginRenderPass();

        // `finally`, because a draw can throw — reaching for an asset that isn't
        // loaded is the designed way for one to fail (`AssetNotLoadedError`), and
        // the controller reports those rather than rethrowing. Without this the
        // pass would unwind having left `isRendering` set and the canvas one
        // `save()` deep, so the *next* frame would draw inside the abandoned
        // frame's clip and transform. A reported error would have quietly
        // corrupted every frame after it.
        this.isRendering = true;
        try {
            callback();
        } finally {
            this.isRendering = false;
            view3D?.sweep();
            this.currentCanvas.restore();
            this.surface.flush();
        }
    }

    begin(state: NodeRenderState): void {
        super.begin(state);
        this.shapeHandler.beginNode(state.id);
        this.shapeHandler.reset();
        if (!this.currentCanvas) {
            throw new Error("begin() must be called within the draw() method.");
        }
        this.effectLayerStack.push(0);
        this.worldAlphaStack.push(this.worldAlpha);
        this.currentCanvas.save();
    }

    end(): void {
        if (!this.currentCanvas) {
            throw new Error("end() must be called within the draw() method.");
        }
        const extraLayers = this.effectLayerStack.pop() ?? 0;
        for (let i = 0; i < extraLayers; i++) {
            this.currentCanvas.restore();
        }
        this.worldAlpha = this.worldAlphaStack.pop() ?? 1;
        this.currentCanvas.restore();
        super.end();
    }

    /** Accumulated pass-through alpha to fold into every paint this node draws. */
    currentWorldAlpha(): number {
        return this.worldAlpha;
    }

    dispose(): void {
        this.fillHandler?.dispose();
        this.shapeHandler?.dispose();
        this.storageAdapter.dispose();
        if (this.surface) {
            this.surface.dispose();
        }
        // Intentionally do NOT call loseContext() on the canvas — the canvas
        // element survives this component (HMR/StrictMode remount it), and a
        // fresh CanvasKit surface needs a live WebGL context to attach to.
        this.mounted = false;
        this.canvasKit = undefined as any;
        this.paint?.delete();
        this.paint = undefined as any;
        this.layerPaint?.delete();
        this.layerPaint = undefined as any;
        this.currentCanvas = undefined as any;
        this.effectLayerStack.length = 0;
        this.clipRestoreStack.length = 0;
        this.clipShapeStack.length = 0;
        this.deferredPaintsStack.length = 0;
        this.effectScopeStack.length = 0;
        // three's geometries, materials, textures and GL context are not
        // GC-managed, so dropping them here is what stops an HMR reload or scene
        // switch from accumulating GPU memory. Unlike CanvasKit's context (kept
        // alive deliberately above), the three renderer owns its own canvas and is
        // safe to drop — it is recreated on the next 3D frame.
        disposeView3DBackend();
        disposeTextureCache();
        view3DRendererHost()?.dispose();
        EffectRegistry.disposeAll();
        disposeSkSLCache();

        super.dispose();
    }

    /**
     * Runs one synchronous draw pass (`callback`) against the mounted surface.
     *
     * **Synchronous**, like the `RenderContext.execute` it implements and like
     * every other implementation of it. It used to be `async` — awaiting a
     * `void` — and the difference was not cosmetic: an `async` method turns
     * everything the draw throws into a *rejected promise*, and the abstract
     * declares `: void`, so no caller could see the promise to handle it. The
     * playback controller wraps this call in a `try`/`catch` that reports render
     * errors into the errors panel, and that guard was catching nothing at all;
     * a missing image surfaced as an unhandled rejection in the console instead.
     */
    execute(callback: () => void): void {
        this.executePass(callback);
    }

    /**
     * Attach `surface` as the draw target, replacing any previous one (HMR /
     * StrictMode remount).
     *
     * How the surface is *made* is the platform's business — a WebGL context over
     * a `<canvas>` in a browser, a CPU raster surface in Node, an FBO owned by a
     * native embedder — which is why this takes a built surface rather than
     * anything canvas-shaped. `@motion-script/web` wraps it in `mount(canvas)`.
     */
    attach(surface: Surface): void {
        if (this.mounted) this.detach();
        this.surface = surface;
        this.mounted = true;
        // Hand the live surface to the adapter so video frames upload straight to
        // GPU texture (Surface.makeImageFromTextureSource) — no CPU readback.
        this.storageAdapter.setSurface(surface);
    }

    /** Release the current surface. */
    detach(): void {
        if (this.mounted) {
            // Drop adapter-held GPU images tied to this surface before it dies, or
            // they become dangling texture handles on the next attach.
            this.storageAdapter.setSurface(null);
            this.surface.dispose();
            this.mounted = false;
        }
    }

    /**
     * Flush and read the current surface back as tightly-packed **unpremultiplied**
     * RGBA8888 pixels, already copied out of the wasm heap.
     *
     * The encode half is the platform's: this CanvasKit build ships no wasm image
     * encoders, so a browser goes through a 2D canvas, Node through its own PNG/JPEG
     * encoder, a native embedder through Skia's codecs. Unpremultiplied because that
     * maps 1:1 onto `ImageData` and onto what every encoder expects.
     *
     * With a {@link frame} set the read is narrowed to the frame's device rect
     * rather than the whole surface, because there the surface is a *window* onto
     * the picture and includes whatever panel sits around it. A snapshot has to be
     * of the work, not of the editor — so what comes back is the frame, and only
     * the part of it the window is currently showing. A caller wanting the whole
     * frame should put the view back to fitted first (or use the offscreen export
     * path, which never involves a view at all).
     */
    snapshotPixels(): { pixels: Uint8Array; width: number; height: number } | undefined {
        if (!this.mounted) {
            console.warn("snapshotPixels() must be called after attach().");
            return undefined;
        }
        this.surface.flush();
        const image = this.surface.makeImageSnapshot();
        if (!image) return undefined;
        const ck = this.canvasKit;
        // Clamped to the surface: a zoomed-in view puts most of the frame off the
        // edge, and asking Skia to read outside its own buffer fails the read.
        //
        // The extent is rounded as a *length* rather than as two independently
        // rounded edges. Rounding the edges lets the two errors pull apart, which
        // is how a 16:9 frame comes back 738×414 — an image that is a fraction of
        // a percent off the project's aspect, and off by a different fraction
        // depending on where the frame happened to land on the surface.
        const crop = this.frameDeviceRect();
        const left = crop ? Math.max(0, Math.round(crop.left)) : 0;
        const top = crop ? Math.max(0, Math.round(crop.top)) : 0;
        const width = crop
            ? Math.max(1, Math.min(image.width() - left, Math.round(crop.right - crop.left)))
            : image.width();
        const height = crop
            ? Math.max(1, Math.min(image.height() - top, Math.round(crop.bottom - crop.top)))
            : image.height();
        const pixels = image.readPixels(left, top, {
            width,
            height,
            colorType: ck.ColorType.RGBA_8888,
            alphaType: ck.AlphaType.Unpremul,
            colorSpace: ck.ColorSpace.SRGB,
        }) as Uint8Array | null;
        image.delete();
        if (!pixels) return undefined;
        // Copy out of the wasm heap before handing the buffer across the seam.
        return { pixels: new Uint8Array(pixels), width, height };
    }

    /**
     * Encode a snapshot as an image data URL. Platform-specific — see
     * {@link snapshotPixels} for why there is no portable encoder here.
     *
     * Abstract rather than returning `undefined` by default: core declares
     * `screenshot()` on `RenderContext`, and a backend that silently produced
     * nothing would be a much worse failure than one that won't compile.
     */
    abstract override screenshot(mime?: string, quality?: number): string | undefined;


    // ─── Draw commands ───────────────────────────────────────────────────────

    /**
     * Replay a built {@link Graphics} command list against this context. Shape
     * ops accumulate into the shape handler; paint ops (fill/stroke/shadow) paint
     * the accumulated shapes as one combined surface; cut/mask ops composite.
     *
     * A paint-only Graphics (no shape ops — e.g. the fill/stroke applied to a
     * boolean result after `endBoolean()`) does NOT reset the shape handler, so
     * it styles whatever surface is currently active.
     *
     * Called by `RenderContext.draw()`, which has already folded the ambient
     * text-style defaults into the op list — so a `text` op that reaches here
     * with no `fontFamily` genuinely has none to inherit.
     */
    protected drawGraphics(graphics: Graphics): void {
        if (!this.isRendering) {
            console.warn("draw() must be called within the draw() method.");
            return;
        }
        // Graphics-level opacity is pass-through: it folds into worldAlpha (so
        // the group's paints fade while their blend modes keep mixing against the
        // backdrop), mirroring a pass-through node transform.
        const needsLayer = graphics.needsGroupLayer();
        const prevWorldAlpha = this.worldAlpha;
        if (needsLayer) {
            const opacity = graphics.groupOpacity();
            if (opacity < 1) this.worldAlpha *= opacity;
        }

        // Graphics-level rotation/scale transforms the whole union as one figure.
        // It's realised as a canvas matrix about the pivot (default: the union's
        // bbox centre, sized in a throwaway measurement pass) wrapping the entire
        // op replay — so the combined silhouette turns/grows together and the CTM
        // change flows into fill/stroke space resolution.
        const groupTransform = graphics.groupTransform();
        let pushedTransform = false;
        if (groupTransform) {
            const center = this.resolveGroupCenter(graphics, groupTransform.center);
            const cx = center.x;
            const cy = center.y;
            this.currentCanvas.save();
            this.currentCanvas.translate(cx, cy);
            this.currentCanvas.rotate(groupTransform.rotation, 0, 0);
            this.currentCanvas.scale(groupTransform.scale, groupTransform.scale);
            this.currentCanvas.translate(-cx, -cy);
            pushedTransform = true;
        }

        // `effects()` scopes like `fill()`: each `effects` op filters the shape
        // group accumulated since the previous one. The filtered saveLayer must be
        // opened *before* that group's shapes are drawn, but the op is recorded
        // *after* them — so pre-scan the op list into segments (a run of ops ending
        // in an `effects` op) and open the layer at each such segment's first op.
        const ops = graphics.ops();
        const segmentStartFilter = this.buildEffectSegments(graphics);

        // Shape ops reset the shape handler as needed; a paint-only Graphics (e.g.
        // the fill/stroke for a boolean result left active by endBoolean) is
        // applied to the currently-active surface without resetting it.
        let pushedEffectLayer = false;
        let effectFilter: ReturnType<typeof EffectRegistry.compose> | null = null;
        for (let i = 0; i < ops.length; i++) {
            // Open this segment's filtered layer before its first op is drawn.
            const seg = segmentStartFilter.get(i);
            if (seg) {
                effectFilter = seg.filter;
                this.layerPaint.setAlphaf(1);
                this.layerPaint.setImageFilter(effectFilter);
                // No explicit bounds: let Skia size the layer from the filter's
                // output so a blur/scatter/bloom that expands past the group's edges
                // isn't clipped (matching the former whole-graphics effect layer).
                // A Graphics segment has no per-segment clip to contain, unlike a
                // node, so the node path's tight-rect bounding doesn't apply here.
                this.currentCanvas.saveLayer(this.layerPaint);
                this.layerPaint.setImageFilter(null);
                pushedEffectLayer = true;
            }

            const op = ops[i];
            if (op.kind === "effects") {
                // Close the group: pop this segment's layer and start a fresh
                // shape accumulation, so shapes after the effects op render
                // unfiltered — the same boundary `fill()` establishes.
                if (pushedEffectLayer) {
                    this.currentCanvas.restore();
                    effectFilter?.delete?.();
                    effectFilter = null;
                    pushedEffectLayer = false;
                }
                this.shapeHandler.reset();
                continue;
            }

            this.applyOp(op);
        }
        // Defensive: an unterminated segment (should not happen — a segment is only
        // recorded when it ends in an effects op) still unwinds its layer.
        if (pushedEffectLayer) {
            this.currentCanvas.restore();
            effectFilter?.delete?.();
        }

        if (pushedTransform) this.currentCanvas.restore();
        this.worldAlpha = prevWorldAlpha;
    }

    /**
     * Pre-scan a Graphics op list into effect segments. A *segment* is a run of
     * ops ending in an `effects` op; its filter wraps every shape/paint drawn
     * since the previous `effects` op (or the start). Because the filtered
     * `saveLayer` must open *before* the segment's shapes are drawn but the op is
     * recorded after them, this returns a map from the segment's **first op index**
     * to the composed filter, so `draw()` can open the layer at the right point in
     * its forward replay.
     *
     * Backdrop-mode effects are excluded (they run on the backdrop layer, not the
     * group's own content); a segment whose foreground filter composes to nothing
     * is skipped entirely (its shapes then draw unfiltered). Motion-blur effects
     * are resolved against the current node's velocity, matching {@link transform}.
     */
    private buildEffectSegments(
        graphics: Graphics,
    ): Map<number, { filter: NonNullable<ReturnType<typeof EffectRegistry.compose>> }> {
        const ops = graphics.ops();
        const segments = new Map<number, { filter: NonNullable<ReturnType<typeof EffectRegistry.compose>> }>();

        // Track the start of the *current shape group*, mirroring the shape
        // accumulator's own boundaries (see `_fill` + the `paintApplied` reset in
        // the shape ops). A group begins at the first shape op drawn after a paint
        // (`fill`/`stroke`/`shadow`) or after an `effects` op — exactly where the
        // renderer resets its accumulator. An `effects` op then filters only *its*
        // group `[groupStart, i]`, not everything back to the previous effects op —
        // so already-painted content before it (e.g. gridlines/axis, each closed by
        // their own fill) is NOT swept into the first bar's filter.
        let groupStart = 0;
        let paintApplied = false;
        const isShape = (kind: GraphicsOp["kind"]) =>
            kind === "rect" || kind === "ellipse" || kind === "path" || kind === "line" ||
            kind === "polygon" || kind === "polygram" || kind === "text" || kind === "richText";

        for (let i = 0; i < ops.length; i++) {
            const op = ops[i];
            if (isShape(op.kind)) {
                // A shape after a paint (or after an effects reset) starts a fresh
                // group — the accumulator resets here in the real replay.
                if (paintApplied) {
                    groupStart = i;
                    paintApplied = false;
                }
                continue;
            }
            if (op.kind === "fill" || op.kind === "stroke" || op.kind === "shadow") {
                paintApplied = true;
                continue;
            }
            if (op.kind === "effects") {
                const foreground = this.resolveMotionBlurEffects(op.effects.filter((e) => e.mode !== "backdrop"));
                const filter = foreground.length > 0
                    ? EffectRegistry.compose(foreground, this.canvasKit, boxGeometry(this.activeSurface.width(), this.activeSurface.height()))
                    : null;
                if (filter != null) {
                    segments.set(groupStart, { filter });
                }
                // The effects op closes the group; the next shape starts a new one.
                groupStart = i + 1;
                paintApplied = false;
                continue;
            }
            // cut/mask/applyMask/endMask: leave group tracking as-is (these compose
            // within the current group and don't introduce an effect boundary).
        }
        return segments;
    }

    /**
     * Resolve a graphics-level rotate/scale `center` into a concrete local-space
     * pivot point.
     *
     *  - An explicit {@link Vector2} is already in local space — passed straight
     *    through, with no measurement pass.
     *  - A **named anchor** (`'topRight'`, …) or `undefined` (default) is resolved
     *    against the union's bounding box, sized in a throwaway measurement pass:
     *    `undefined` → the box centre; a name → the corresponding box corner/edge.
     *
     * The box is sized by building only the shape ops (skipping paint/compositing/
     * text) into a suspended-cache scope so the real paint pass is unaffected.
     * Falls back to the local origin when there are no path-backed shapes (e.g.
     * text only).
     */
    private resolveGroupCenter(graphics: Graphics, center: Anchor | undefined): Vector2 {
        // Explicit pixel pivot — no need to size the union.
        if (center !== undefined && typeof center !== "string") {
            return { x: center.x, y: center.y };
        }

        this.shapeHandler.beginMeasure();
        for (const op of graphics.ops()) {
            // Measure in the same y-up→canvas-flipped space the paint pass draws
            // in (see flip* helpers / applyOp), so the union bbox the pivot is
            // resolved against matches the rendered geometry.
            switch (op.kind) {
                case "rect": this.shapeHandler.rect(flipRectY(op.state)); break;
                case "ellipse": this.shapeHandler.ellipse(flipEllipseY(op.state)); break;
                case "path": this.shapeHandler.path(flipPathY(op.state)); break;
                case "line": this.shapeHandler.line(flipLineY(op.state)); break;
                case "polygon": this.shapeHandler.polygon(flipPolygonY(op.state)); break;
                case "polygram": this.shapeHandler.polygram(flipPolygramY(op.state)); break;
                // Paint/compositing/text ops don't change the union bbox used
                // for the pivot, so they're skipped during measurement.
            }
        }
        const bounds = this.shapeHandler.measureUnionBounds();
        this.shapeHandler.endMeasure();
        if (!bounds) return { x: 0, y: 0 };

        const cx = (bounds.left + bounds.right) / 2;
        const cy = (bounds.top + bounds.bottom) / 2;
        // Default (undefined) pivots about the box centre.
        if (center === undefined) return { x: cx, y: cy };

        // Named anchor: normalised [-1,1] (y-up) scaled onto the box, y flipped
        // to the renderer's y-down local space — so 'topRight' lands at the box's
        // top-right corner. Matches how node/per-shape pivots map onto their box.
        const a = resolveAnchor(center);
        const halfW = (bounds.right - bounds.left) / 2;
        const halfH = (bounds.bottom - bounds.top) / 2;
        return { x: cx + a.x * halfW, y: cy - a.y * halfH };
    }

    private applyOp(op: GraphicsOp): void {
        switch (op.kind) {
            case "rect": this._rect(flipRectY(op.state)); break;
            case "ellipse": this._ellipse(flipEllipseY(op.state)); break;
            case "path": this._path(flipPathY(op.state)); break;
            case "line": this._line(flipLineY(op.state)); break;
            case "polygon": this._polygon(flipPolygonY(op.state)); break;
            case "polygram": this._polygram(flipPolygramY(op.state)); break;
            case "text": this._text(flipTextY(op.state)); break;
            case "richText": this._richText(flipRichTextY(op.state)); break;
            case "fill": this._fill(op.fills); break;
            case "stroke": this._stroke(op.strokes); break;
            case "shadow": this._shadow(op.shadows); break;
            case "cut": this._cut(); break;
            case "mask": this._maskOp(op.options); break;
            case "applyMask": this._applyMask(); break;
            case "endMask": this._endMaskOp(); break;
            // `effects` ops are handled directly in draw()'s segment loop (they
            // open/close a scoped filter layer), never dispatched here.
            case "effects": break;
        }
    }

    /**
     * Applies the node's transform to the canvas, then realises its opacity and
     * blend. A `pass-through` node (the default) is *not* isolated: its opacity
     * folds into {@link worldAlpha} (so the node's fills/strokes and its
     * descendants paint at the faded alpha while their blend modes still mix
     * against the backdrop). A non-pass-through `blend` *is* isolated: a
     * `saveLayer` carrying that blend mode and the node's opacity flattens the
     * node into a group that then blends against the backdrop as a unit.
     * Effects always need their own isolated buffer. Any pushed `saveLayer` is
     * tracked in {@link effectLayerStack} for `end()` to unwind.
     */
    transform(state: Partial<TransformState>): RenderContext {
        if (!this.isRendering) {
            console.warn("transform() must be called within the draw() method.");
            return this;
        }

        const x = state.x ?? 0;
        const y = state.y ?? 0;
        const width = state.width ?? 0;
        const height = state.height ?? 0;
        const opacity = state.opacity ?? 1;
        const blend: NodeBlendMode = state.blend ?? 'pass-through';
        const rotate = state.rotation ?? 0;
        const scale = state.scale ?? 1;
        const effects = state.effects ?? [];
        const pivot = state.pivot ?? { x: 0, y: 0 };

        const pivotX = pivot.x * (width / 2);
        const pivotY = -pivot.y * (height / 2);

        this.currentCanvas.translate(x + pivotX, y + pivotY);
        this.currentCanvas.rotate(rotate, 0, 0);
        this.currentCanvas.scale(scale, scale);
        this.currentCanvas.translate(-pivotX, -pivotY);

        // Backdrop-mode effects run on the backdrop layer (applyBackdropEffects),
        // not the node's own content — exclude them from the foreground filter chain.
        const foregroundEffects = effects.filter((e) => e.mode !== "backdrop");
        let effectFilter: any = null;
        if (foregroundEffects.length > 0) {
            // Motion blur needs the node's live velocity, which static effect data
            // can't carry — resolve each `motionBlur` against the current node's
            // render state here, then hand the renderer a concrete directional
            // smear. Effects without motion blur skip the copy entirely.
            const resolved = this.resolveMotionBlurEffects(foregroundEffects);
            effectFilter = EffectRegistry.compose(resolved, this.canvasKit, boxGeometry(width, height));
        }

        const isolating = blend !== 'pass-through';
        if (isolating) {
            // Isolating blend: flatten this node (its own paint + descendants)
            // into a group, then composite back with the node's blend mode and
            // opacity (scaled by the inherited pass-through alpha). An effect
            // filter, when present, rides on the same layer. Descendants paint at
            // full alpha inside the group — the group's contribution is scaled on
            // composite-back — so reset worldAlpha to 1 for the layer's lifetime.
            this.layerPaint.setAlphaf(this.worldAlpha * (opacity < 1 ? opacity : 1));
            this.layerPaint.setBlendMode(getCanvasKitBlendMode(this.canvasKit, blend as any));
            this.layerPaint.setImageFilter(effectFilter ?? null);
            this.currentCanvas.saveLayer(this.layerPaint);
            this.layerPaint.setAlphaf(1);
            this.layerPaint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
            this.layerPaint.setImageFilter(null);
            this.effectLayerStack[this.effectLayerStack.length - 1]++;
            this.worldAlpha = 1;
        } else {
            // Pass-through: fold opacity into the accumulated alpha (carried into
            // every paint) instead of isolating. Effects still need their own
            // buffer — push an effect-only layer (no opacity, that's in the
            // paints) when one is present.
            if (effectFilter != null) {
                this.layerPaint.setAlphaf(1);
                this.layerPaint.setImageFilter(effectFilter);
                // Bound the effect layer to the node rect (laid out centred on the
                // local origin). Scaling filters like pixelate otherwise let Skia
                // pick layer bounds from the filter output, which overruns the
                // active clip and squares off rounded corners; an explicit bound
                // keeps the filtered result inside the node so the clip cuts clean.
                const bounds = this.canvasKit.LTRBRect(-width / 2, -height / 2, width / 2, height / 2);
                this.currentCanvas.saveLayer(this.layerPaint, bounds);
                this.layerPaint.setImageFilter(null);
                this.effectLayerStack[this.effectLayerStack.length - 1]++;
            }
            if (opacity < 1) this.worldAlpha *= opacity;
        }

        return this;
    }

    /**
     * Replace any `motionBlur` effect with a `motionBlurResolved` smear computed
     * from the current node's sampled velocity (from {@link currentRenderState}).
     * Returns the input array unchanged when there is no motion blur (the common
     * case) so non-motion-blur transforms keep their zero-copy fast path. A
     * motion blur that resolves to nothing (static node / unknown velocity) is
     * dropped from the array.
     */
    private resolveMotionBlurEffects(effects: SceneEffect[]): SceneEffect[] {
        let hasMotionBlur = false;
        for (const e of effects) {
            if (e.type === "motionBlur") { hasMotionBlur = true; break; }
        }
        if (!hasMotionBlur) return effects;

        const rs = this.currentRenderState();
        const out: SceneEffect[] = [];
        for (const e of effects) {
            if (e.type !== "motionBlur") {
                out.push(e);
                continue;
            }
            const resolved = rs
                ? resolveMotionBlur(e as MotionBlurEffect, rs.velocity, rs.dt)
                : null;
            if (resolved) out.push(resolved as unknown as SceneEffect);
        }
        return out;
    }

    /**
     * Where the project's frame lands on the surface, in device pixels.
     *
     * The pass transform is known rather than queried — `getTotalMatrix()` at the
     * point this is called is deep inside whatever node is painting — so this
     * re-applies it: `scale(pixelRatio) · translate(centre + view) · scale(zoom)`,
     * exactly as {@link executePass} lays it down.
     */
    private frameDeviceRect(): SpaceRect | null {
        if (!this.frame || !this.surface) return null;
        const pr = this.pixelRatio;
        const originX = this.surface.width() / pr / 2 + this.view.x;
        const originY = this.surface.height() / pr / 2 + this.view.y;
        const halfW = (this.frame.width / 2) * this.view.zoom;
        const halfH = (this.frame.height / 2) * this.view.zoom;
        return {
            left: (originX - halfW) * pr,
            top: (originY - halfH) * pr,
            right: (originX + halfW) * pr,
            bottom: (originY + halfH) * pr,
        };
    }

    // Resolve the reference rect for a fill `space`, in the current node's local
    // space. `parent` is supplied by the node via begin(); `global` is the render
    // viewport mapped from device space through the inverse current matrix.
    private spaceRect(space: FillSpace): SpaceRect | null {
        if (space === "parent") {
            return this.currentSpaceRects().parent ?? null;
        }
        if (space === "global") {
            const m = this.currentCanvas?.getTotalMatrix();
            if (!m) return null;
            const inv = this.canvasKit.Matrix.invert(m);
            if (!inv) return null;
            // A preview drawing a crop: the surface is a window onto the frame
            // rather than the frame, so the frame is what `global` has to span.
            // Reading the surface here would re-stretch every global gradient on
            // every pan and zoom — the fill would be a function of where the
            // editor was looking, which is exactly what "global" promises it
            // isn't. Only on the mounted surface: inside a Surface2D the buffer
            // really is the world, and the branch below is right for it.
            // The frame goes through the *same* inverse the surface corners do,
            // rather than being returned as-is: `inv` maps device space to the
            // current node's local space, and the frame is only in scene units at
            // the root of the pass.
            const framed = this.frame && this.activeSurface === this.surface
                ? this.frameDeviceRect()
                : null;
            if (framed) {
                const tl = this.canvasKit.Matrix.mapPoints(inv, [framed.left, framed.top]);
                const br = this.canvasKit.Matrix.mapPoints(inv, [framed.right, framed.bottom]);
                return {
                    left: Math.min(tl[0], br[0]),
                    top: Math.min(tl[1], br[1]),
                    right: Math.max(tl[0], br[0]),
                    bottom: Math.max(tl[1], br[1]),
                };
            }
            // Surface corners in device px → local space. Inside a Surface2D the
            // "viewport" is that surface's buffer, which is what a `global` fill
            // should span there.
            const w = this.activeSurface.width();
            const h = this.activeSurface.height();
            const tl = this.canvasKit.Matrix.mapPoints(inv, [0, 0]);
            const br = this.canvasKit.Matrix.mapPoints(inv, [w, h]);
            return {
                left: Math.min(tl[0], br[0]),
                top: Math.min(tl[1], br[1]),
                right: Math.max(tl[0], br[0]),
                bottom: Math.max(tl[1], br[1]),
            };
        }
        return null;
    }

    private _rect(state: Partial<RectState>): void {
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.rect(state);
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
    }

    private _ellipse(state: Partial<EllipseState>): void {
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.ellipse(state);
    }

    private _path(state: Partial<PathState>): void {
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.path(state);
    }

    private _line(state: Partial<LineState>): void {
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.line(state);
    }

    private _polygon(state: Partial<PolygonState>): void {
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.polygon(state);
    }

    private _polygram(state: Partial<PolygramState>): void {
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        this.shapeHandler.polygram(state);
    }

    private _text(state: Partial<TextState>): void {
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();
        if (state.segments && state.segments.length > 0) {
            this._segmentedText(state);
            return;
        }
        this.shapeHandler.text(state);
    }

    /**
     * Draw a Text node split into selection segments. Shapes all pieces in one
     * paragraph (consistent kerning/wrap/textAlign) and paints each shaped run with
     * its segment's overrides: opacity folded into the paint, a transform about
     * the run's centre, and the segment's fill/stroke (which default to the
     * node's paint when the selection didn't override them). Mirrors
     * {@link _richText}'s eager per-run paint path.
     */
    private _segmentedText(state: Partial<TextState>): void {
        const layout = layoutTextSegments(
            this.canvasKit,
            this.storageAdapter.getFontMgr(),
            state,
        );

        this.shapeHandler.pushBounds(layout.bounds);
        try {
            for (const run of layout.runs) {
                if (run.glyphs.length === 0 || !run.segment) continue;
                const seg = run.segment;

                const transformed = seg.x !== 0 || seg.y !== 0 || seg.scale !== 1 || seg.rotation !== 0;
                if (transformed) {
                    const c = runCenter(run);
                    this.currentCanvas.save();
                    this.currentCanvas.translate(seg.x, seg.y);
                    if (seg.rotation !== 0) this.currentCanvas.rotate(seg.rotation, c.x, c.y);
                    if (seg.scale !== 1) {
                        this.currentCanvas.translate(c.x, c.y);
                        this.currentCanvas.scale(seg.scale, seg.scale);
                        this.currentCanvas.translate(-c.x, -c.y);
                    }
                }

                const shape = {
                    isText: true,
                    draw: (paint: Paint) => drawShapedRun(this.currentCanvas, run, paint),
                };

                const fills = seg.fill ? applySegmentOpacityToFills(seg.fill, seg.opacity) : [];
                if (fills.length > 0) this.fillHandler.applyFills(fills, [shape]);

                const strokes = seg.stroke ? applySegmentOpacityToStrokes(seg.stroke, seg.opacity) : [];
                if (strokes.length > 0) this.strokeHandler.applyStrokes(strokes, [shape]);

                if (transformed) this.currentCanvas.restore();
            }
        } finally {
            this.shapeHandler.popBounds();
            for (const font of layout.fonts) font.delete();
        }
    }

    /** Lays out spans/runs and paints each run's fill/stroke immediately (rich text carries per-span paint, bypassing the usual fill/stroke ops). */
    private _richText(state: Partial<RichTextState>): void {
        if (this.shapeHandler.paintApplied) this.shapeHandler.reset();

        const fullState = withRichTextDescriptor(state);
        const layout = layoutRichText(
            this.canvasKit,
            this.storageAdapter.getFontMgr(),
            fullState,
        );

        // Spans carry their own resolved fills/strokes, so we draw eagerly
        // here rather than going through the fill/stroke ops. Push the overall
        // bounds so any per-run gradient resolves against the whole rich-text
        // box, not just the run.
        this.shapeHandler.pushBounds(layout.bounds);
        try {
            for (const run of layout.runs) {
                if (run.glyphs.length === 0) continue;
                const shape = {
                    isText: true,
                    draw: (paint: Paint) => {
                        drawShapedRun(this.currentCanvas, run, paint);
                    },
                };
                if (run.span.fill.length > 0) {
                    this.fillHandler.applyFills(run.span.fill, [shape]);
                }
                if (run.span.stroke.length > 0) {
                    this.strokeHandler.applyStrokes(run.span.stroke, [shape]);
                }
            }
        } finally {
            this.shapeHandler.popBounds();
            for (const font of layout.fonts) font.delete();
        }
    }

    private _fill(fills: Fill): void {
        const resolved = resolveFillArray(fills);
        if (resolved.length === 0) {
            // An empty fill paints nothing, but the shapes it was applied to were
            // still "consumed" by this draw() — mark the pass applied so the next
            // `_path` resets and starts a fresh shape set. Without this a fill-less
            // node (e.g. a stroke-only Path, whose renderSelf still emits an empty
            // fill) leaves its silhouette accumulated, so the later stroke pass
            // sees a *duplicate* shape and unions/concats two copies — distorting
            // the stroked outline.
            this.shapeHandler.paintApplied = true;
            return;
        }
        if (this.shapeHandler.isCollectingPaths()) {
            this.shapeHandler.paintApplied = true;
            return;
        }
        const maskApply = this.shapeHandler.getMaskApply();
        if (maskApply !== null && !maskApply.has('fill')) {
            const top = this.deferredPaintsStack[this.deferredPaintsStack.length - 1];
            if (top) {
                top.push({ kind: 'fill', shapes: [...this.shapeHandler.shapes], fills: resolved, shadows: this.shapeHandler.takePendingShadows() });
                this.shapeHandler.paintApplied = true;
                return;
            }
        }
        const pendingShadows = this.shapeHandler.takePendingShadows();
        if (pendingShadows) {
            const space = pendingShadows[0].fill[0]?.space ?? "local";
            const { shapes, dispose } = this.strokeShapesForSpace(space);
            // Outer shadows paint beneath the fill; inner shadows paint over it.
            this.strokeHandler.applyShadows(pendingShadows, shapes, resolved, [], this.applyFillSpaceBounds);
            this.fillHandler.applyFills(resolved, this.shapeHandler.shapes);
            this.strokeHandler.applyInnerShadows(pendingShadows, shapes, resolved, this.applyFillSpaceBounds);
            dispose();
        } else {
            this.fillHandler.applyFills(resolved, this.shapeHandler.shapes);
        }
        this.shapeHandler.paintApplied = true;
    }

    // Set the fill handler's bounds for a fill, honouring its `space`. Used as
    // the resolveBounds hook for stroke/shadow shaders.
    private applyFillSpaceBounds = (
        fill: FillResolved,
        shape: { ckPath?: any } | null,
    ): void => {
        this.fillHandler.setCurrentBounds(this.fillHandler.boundsForSpace(fill.space ?? "local", shape));
    };

    // Pick the shapes a stroke/shadow should be drawn over. The drawn shapes are
    // always treated as one unit, so stroke the union outline (overlapping shapes
    // then show no internal seams). Returns the shape list plus a disposer for
    // any transient union path. `space` is accepted for call-site symmetry with
    // the fill path but no longer changes the grouping.
    private strokeShapesForSpace(_space: FillSpace): {
        shapes: Array<{ draw: (p: any) => void; strokeDraw?: (p: any) => void; ckPath?: any; strokePath?: any; spreadPath?: (spread: number) => any }>;
        dispose: () => void;
    } {
        const union = this.shapeHandler.unionStrokeShape();
        if (union) {
            return {
                shapes: [union],
                dispose: () => {
                    union.ckPath?.delete();
                    // The concatenated open stroke contour is a separate synthesized
                    // path; free it too (it's distinct from ckPath when present).
                    if (union.strokePath && union.strokePath !== union.ckPath) union.strokePath.delete();
                },
            };
        }
        return { shapes: this.shapeHandler.shapes, dispose: () => { } };
    }

    private _stroke(strokes: Stroke): void {
        const resolved = resolveStrokeArray(strokes);
        if (resolved.length === 0) return;
        if (this.shapeHandler.isCollectingPaths()) {
            this.shapeHandler.paintApplied = true;
            return;
        }
        const maskApply = this.shapeHandler.getMaskApply();
        if (maskApply !== null && !maskApply.has('stroke')) {
            const top = this.deferredPaintsStack[this.deferredPaintsStack.length - 1];
            if (top) {
                top.push({ kind: 'stroke', shapes: [...this.shapeHandler.shapes], strokes: resolved, shadows: this.shapeHandler.takePendingShadows() });
                this.shapeHandler.paintApplied = true;
                return;
            }
        }
        const pendingShadows = this.shapeHandler.takePendingShadows();
        if (pendingShadows) {
            const shadowSpace = pendingShadows[0].fill[0]?.space ?? "local";
            const { shapes: shadowShapes, dispose: shadowDispose } = this.strokeShapesForSpace(shadowSpace);
            this.strokeHandler.applyShadows(pendingShadows, shadowShapes, [], resolved, this.applyFillSpaceBounds);
            shadowDispose();
        }
        // Strokes are always drawn over the union outline; each stroke's shader
        // bounds are resolved from its own fill space via applyFillSpaceBounds.
        const space = resolved[0].fill[0]?.space ?? "local";
        const { shapes, dispose } = this.strokeShapesForSpace(space);
        this.strokeHandler.applyStrokes(resolved, shapes, this.applyFillSpaceBounds);
        dispose();
        this.shapeHandler.paintApplied = true;
    }

    private _shadow(shadows: Shadow): void {
        const resolved = resolveShadowArray(shadows);
        if (resolved.length === 0) return;
        if (this.shapeHandler.isCollectingPaths()) return;
        this.shapeHandler.storePendingShadows(resolved);
    }

    private _cut(): void {
        this.shapeHandler.cut();
    }

    // ─── Camera viewport ─────────────────────────────────────────────────────

    private cameraRestoreStack: number[] = [];

    beginCamera(viewport: { x: number; y: number; width: number; height: number }, lookAt: Vector2, zoom: number, heading: number): void {
        if (!this.isRendering) {
            console.warn("beginCamera() must be called within the draw() method.");
            return;
        }
        const canvas = this.currentCanvas;
        const ck = this.canvasKit;

        canvas.save();
        const left = viewport.x - viewport.width / 2;
        const top = viewport.y - viewport.height / 2;
        const right = viewport.x + viewport.width / 2;
        const bottom = viewport.y + viewport.height / 2;
        canvas.clipRect(ck.LTRBRect(left, top, right, bottom), ck.ClipOp.Intersect, true);

        canvas.save();
        canvas.translate(viewport.x, viewport.y);
        canvas.rotate(-heading, 0, 0);
        canvas.scale(zoom, zoom);
        canvas.translate(-lookAt.x, lookAt.y);

        this.cameraRestoreStack.push(2);
    }

    endCamera(): void {
        if (!this.isRendering) {
            console.warn("endCamera() must be called within the draw() method.");
            return;
        }
        const restores = this.cameraRestoreStack.pop() ?? 0;
        for (let i = 0; i < restores; i++) {
            this.currentCanvas.restore();
        }
    }

    // ─── Clip scope ──────────────────────────────────────────────────────────

    beginClip(clip: Clip): void {
        if (!this.isRendering) {
            console.warn("beginClip() must be called within the draw() method.");
            return;
        }
        const canvas = this.currentCanvas;
        canvas.save();
        this.clipRestoreStack.push(1);
        this.clipShapeStack.push(clip);

        const ops = clip.ops();
        // Fast path — a single shape with no cut clips natively (clipRect/clipRRect
        // for axis-aligned rects/ellipses), no combined path needed.
        if (ops.length === 1 && ops[0].kind !== "cut") {
            const shape = this.buildClipShapeOp(ops[0]);
            if (shape) {
                shape.clip(/* isolated= */ true);
                shape.deletePaths();
            }
            return;
        }

        // Compound clip: union the shapes (subtracting cuts) into one path and
        // clip to it. No-op when nothing built a path.
        const combined = this.combineClipPath(clip);
        if (combined) {
            canvas.clipPath(combined, this.canvasKit.ClipOp.Intersect, true);
            combined.delete();
        }
    }

    endClip(): void {
        if (!this.isRendering) {
            console.warn("endClip() must be called within the draw() method.");
            return;
        }
        const restores = this.clipRestoreStack.pop() ?? 0;
        this.clipShapeStack.pop();
        for (let i = 0; i < restores; i++) {
            this.currentCanvas.restore();
        }
    }

    /** Build the concrete shape instance for a single clip shape op. */
    private buildClipShapeOp(op: ClipOp): RectShape | EllipseShape | PolygonShape | PolygramShape | PathShape | LineShape | null {
        const ck = this.canvasKit;
        const canvas = () => this.currentCanvas;
        // Clip shapes are authored y-up like every other descriptor; flip y to
        // canvas so a clip outline lines up with the (also-flipped) content it clips.
        switch (op.kind) {
            case "rect": return new RectShape(ck, canvas, flipRectY(op.state));
            case "ellipse": return new EllipseShape(ck, canvas, flipEllipseY(op.state));
            case "polygon": return new PolygonShape(ck, canvas, flipPolygonY(op.state));
            case "polygram": return new PolygramShape(ck, canvas, flipPolygramY(op.state));
            case "path": return new PathShape(ck, canvas, flipPathY(op.state));
            case "line": return new LineShape(ck, canvas, flipLineY(op.state));
            case "cut": return null;
        }
    }

    /**
     * Replay a {@link Clip}'s ops into a single CanvasKit path: shapes union
     * together, and a `cut` subtracts the most-recently declared shape from the
     * shapes before it (mirroring `Graphics.cut()`). Returns a freshly-owned path
     * the caller must `delete()`, or `null` when no shape produced a path.
     */
    private combineClipPath(clip: Clip): CKPath | null {
        const ck = this.canvasKit;
        // Each entry is a path the caller (this method) owns; we fold them into one.
        const paths: CKPath[] = [];
        for (const op of clip.ops()) {
            if (op.kind === "cut") {
                // Subtract the last path from the union of the ones before it.
                const cutter = paths.pop();
                if (!cutter) continue;
                const base = this.unionPaths(paths.splice(0, paths.length));
                if (!base) { cutter.delete(); continue; }
                const diff = ck.Path.MakeFromOp(base, cutter, ck.PathOp.Difference);
                base.delete();
                cutter.delete();
                if (diff) paths.push(diff);
                continue;
            }
            const shape = this.buildClipShapeOp(op);
            if (!shape) continue;
            shape.ensurePath();
            // Copy out the path so deletePaths() doesn't free what we keep.
            if (shape.ckPath) paths.push(shape.ckPath.copy());
            shape.deletePaths();
        }
        return this.unionPaths(paths);
    }

    /** Union a list of owned paths into one, consuming the inputs. */
    private unionPaths(paths: CKPath[]): CKPath | null {
        const ck = this.canvasKit;
        if (paths.length === 0) return null;
        let combined = paths[0];
        for (let i = 1; i < paths.length; i++) {
            const next = ck.Path.MakeFromOp(combined, paths[i], ck.PathOp.Union);
            combined.delete();
            paths[i].delete();
            if (!next) {
                for (let j = i + 1; j < paths.length; j++) paths[j].delete();
                return null;
            }
            combined = next;
        }
        return combined;
    }

    // ─── Effect scope (filters + shader effects, foreground or backdrop) ─────────

    // One entry per open beginEffectScope/endEffectScope pair. `canvasRestores`
    // counts saveLayer()s pushed in begin (the backdrop filter layer) that end()
    // must pop. `captures` holds foreground offscreen captures (one per foreground
    // shader effect), resolved in end() inner-first so nested effects compose in
    // the same order the old separate begin/end pairs did.
    private effectScopeStack: Array<{
        canvasRestores: number;
        captures: ForegroundCapture[];
    }> = [];

    /**
     * Open an effect scope over the node (see {@link RenderContext.beginEffectScope}).
     * Effects are routed by the renderer, not the caller:
     *
     * - ImageFilter-composable effects (blur, grayscale, …) — only meaningful for
     *   the backdrop here (foreground filters ride the node's transform layer) —
     *   are composed into one filter and seeded into a backdrop saveLayer.
     * - Shader effects (bulge, magnify, posterize, backdrop SkSL) are dispatched to
     *   their {@link EffectHandler} handler. Backdrop ones snapshot the surface and
     *   repaint warped in device space immediately; foreground ones redirect drawing
     *   into a per-effect offscreen surface that {@link endEffectScope} resamples.
     *
     * `width`/`height` are logical px (size-relative filters and shader lens boxes
     * scale them by the CTM as needed).
     */
    beginEffectScope(effects: SceneEffect[], target: EffectTarget, width: number, height: number): void {
        if (!this.isRendering) {
            console.warn("beginEffectScope() must be called within the draw() method.");
            return;
        }

        const entry: (typeof this.effectScopeStack)[number] = { canvasRestores: 0, captures: [] };

        // Split into shader effects (per-handler) and the ImageFilter-composable
        // remainder, preserving authoring order.
        const filterEffects: SceneEffect[] = [];
        const shaderEffects: Array<{ handler: EffectHandler; effect: SceneEffect }> = [];
        for (const effect of effects) {
            const handler = EffectRegistry.resolveShader(effect, target);
            if (handler) shaderEffects.push({ handler, effect });
            else filterEffects.push(effect);
        }

        // Backdrop filter layer first (matches the old order: filters under the
        // shader passes). Foreground filters are handled by transform()/draw(), so
        // only run this for the backdrop.
        if (target === "backdrop" && filterEffects.length > 0) {
            if (this.openBackdropFilterLayer(filterEffects, width, height)) entry.canvasRestores++;
        }

        if (target === "backdrop") {
            // Each backdrop pass paints immediately and re-snapshots the surface,
            // so running them in author order already composes front to back.
            for (const { handler, effect } of shaderEffects) {
                this.paintBackdropShaderEffect(handler, effect, width, height);
            }
        } else {
            // Foreground: redirect drawing into an offscreen capture, resolved
            // (resampled through the lens) in endEffectScope.
            //
            // Opened in *reverse* author order, because the node's content is
            // drawn into the innermost (last-opened) capture and endEffectScope
            // unwinds inner-first. Reversing here makes effects[0] the innermost
            // scope, so it is the first to see the raw content — matching the
            // ImageFilter path, where index 0 is likewise applied first. Opening
            // in author order would run the chain backwards.
            for (let i = shaderEffects.length - 1; i >= 0; i--) {
                const { handler, effect } = shaderEffects[i];
                const capture = this.openForegroundCapture(handler, effect, width, height);
                if (capture) entry.captures.push(capture);
            }
        }

        this.effectScopeStack.push(entry);
    }

    endEffectScope(): void {
        if (!this.isRendering) {
            console.warn("endEffectScope() must be called within the draw() method.");
            return;
        }
        const entry = this.effectScopeStack.pop();
        if (!entry) return;

        // Resolve foreground captures inner-first (reverse of begin order) so a
        // capture's lens output redraws onto the next-outer capture's canvas,
        // composing exactly as the old nested begin/end pairs did.
        for (let i = entry.captures.length - 1; i >= 0; i--) {
            this.resolveForegroundCapture(entry.captures[i]);
        }
        for (let i = 0; i < entry.canvasRestores; i++) {
            this.currentCanvas.restore();
        }
    }

    /**
     * Compose `effects` into one ImageFilter and seed a backdrop saveLayer with the
     * current canvas content run through it, clipped to the active silhouette.
     * Returns `true` when a layer was pushed (so end() restores it).
     *
     * Per-effect handlers author filters in *logical* px, but a `saveLayer` backdrop
     * filter runs in *device* space, so the composed logical filter `F` is wrapped
     * `scale(pr) ∘ F ∘ scale(1/pr)` to behave as it would in the foreground.
     */
    private openBackdropFilterLayer(effects: SceneEffect[], width: number, height: number): boolean {
        const ck = this.canvasKit;
        const composed = EffectRegistry.compose(effects, ck, boxGeometry(width, height));
        if (composed == null) return false;
        const pr = this.pixelRatio;
        const linear = { filter: ck.FilterMode.Linear, mipmap: ck.MipmapMode.None };
        const toLogical = ck.ImageFilter.MakeMatrixTransform(ck.Matrix.scaled(1 / pr, 1 / pr), linear, null);
        const inLogical = ck.ImageFilter.MakeCompose(composed, toLogical);
        const backdrop = ck.ImageFilter.MakeMatrixTransform(ck.Matrix.scaled(pr, pr), linear, inLogical);
        // saveLayer with a backdrop filter seeds the new layer with the current
        // canvas content run through `backdrop`. Clamp tiling samples beyond the
        // active clip so the filter doesn't darken toward the silhouette edge; the
        // layer is bounded by the active clip, so only the silhouette composites
        // back on restore.
        this.currentCanvas.saveLayer(undefined, null, backdrop, undefined, ck.TileMode.Clamp);
        backdrop.delete();
        inLogical.delete();
        toLogical.delete();
        composed.delete();
        return true;
    }

    /**
     * Snapshot the backdrop (the content beneath the node), build the handler's
     * lens shader from it, and repaint it warped in device space — confined to the
     * active silhouette clip. Used for magnify, backdrop posterize, backdrop SkSL.
     */
    private paintBackdropShaderEffect(
        handler: EffectHandler,
        effect: SceneEffect,
        width: number,
        height: number,
    ): void {
        const ck = this.canvasKit;
        if (width <= 0 || height <= 0) return;

        // The node is already translated to its centre, so the CTM maps local
        // origin → device centre and its scale converts logical size to device px.
        const m = this.currentCanvas.getTotalMatrix();
        // A backdrop snapshot fully covers the surface, so it always samples with
        // Clamp regardless of the handler's foreground tile preference.
        const snapshot = this.activeSurface.makeImageSnapshot();
        const content = snapshot.makeShaderOptions(
            ck.TileMode.Clamp, ck.TileMode.Clamp, filterMode(ck, handler.sampling!.filterMode), ck.MipmapMode.None,
        );
        const geom = this.shaderGeometry(m, width, height);
        const extra = handler.resources?.(effect, ck, this.effectResources()) ?? [];
        const inputs = this.buildRenderInputs(handler, effect, geom, snapshot, m);

        const lens = handler.makeShader!(effect, ck, content, geom, extra, inputs.shaders);
        // Unlike the foreground path a null lens means there is nothing to paint
        // back: the backdrop is already on the canvas, untouched.
        if (lens != null) {
            this.paintShaderInDeviceSpace(lens, m);
            lens.delete();
        }
        // Built per draw from the live clip and the live snapshot, so unlike
        // `extra` (which the handler caches) this context owns them.
        inputs.dispose();
        content.delete();
        snapshot.delete();
    }

    /**
     * Build whatever the handler asked for via {@link EffectHandler.renderInputs}
     * — the node's silhouette, a pre-blurred copy of the source, or neither.
     * Anything that could not be built is simply absent; handlers read these by
     * name and treat a missing one as "not this frame", no-opping rather than
     * rendering something wrong.
     */
    private buildRenderInputs(
        handler: EffectHandler,
        effect: SceneEffect,
        geom: EffectGeometry,
        source: CKImage,
        m: number[],
    ): { shaders: RenderInputShaders; dispose(): void } {
        const request = handler.renderInputs?.(effect, geom);
        if (!request) return { shaders: {}, dispose: NOOP };

        const shaders: RenderInputShaders = {};
        const cleanups: (() => void)[] = [];

        if (request.silhouette !== undefined) {
            const built = this.silhouetteMask(request.silhouette, m);
            if (built) {
                shaders.silhouette = built.shader;
                cleanups.push(built.dispose);
            }
        }
        if (request.blurredSource !== undefined) {
            const built = this.blurredCopy(source, request.blurredSource);
            if (built) {
                shaders.blurredSource = built.shader;
                cleanups.push(built.dispose);
            }
        }

        return { shaders, dispose: () => { for (const free of cleanups) free(); } };
    }

    /**
     * Rasterise the active silhouette clip into a device-space alpha mask,
     * blurred by `sigma`, and wrap it as a child shader. Returns `null` when
     * there is no clip to trace or the offscreen could not be made.
     *
     * The blur is a **mask filter with `respectCTM: false`**, not an image
     * filter: `sigma` is already in device px (the handler derived it from
     * {@link EffectGeometry}, which is device-space), and an image filter's
     * sigma would be scaled by the CTM on the way through — so a node inside a
     * scaled group, or a zoomed camera, would get a bevel of the wrong width. A
     * mask filter also blurs the coverage directly, which is all this needs.
     */
    private silhouetteMask(sigma: number, m: number[]): BuiltInput | null {
        const clip = this.clipShapeStack[this.clipShapeStack.length - 1];
        if (!clip || clip.isEmpty()) return null;

        const ck = this.canvasKit;
        const path = this.combineClipPath(clip);
        if (!path) return null;

        const offscreen = this.activeSurface.makeSurface(this.activeSurface.imageInfo());
        if (!offscreen) {
            path.delete();
            return null;
        }

        const canvas = offscreen.getCanvas();
        canvas.clear(ck.TRANSPARENT);
        // The clip path is authored in the node's local space, so replicate the
        // CTM exactly as the foreground capture does — the mask then lines up
        // with the fragCoords the lens shader is evaluated at.
        canvas.save();
        canvas.concat(m);
        const paint = new ck.Paint();
        paint.setAntiAlias(true);
        paint.setColor(ck.WHITE);
        const blur = sigma > 0 ? ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, sigma, false) : null;
        if (blur) paint.setMaskFilter(blur);
        canvas.drawPath(path, paint);
        canvas.restore();

        blur?.delete();
        paint.delete();
        path.delete();
        // Decal, not Clamp: beyond the surface the mask must read zero, or a
        // shape running off the edge would have its bevel smeared to infinity.
        return this.wrapOffscreen(offscreen, ck.TileMode.Decal);
    }

    /**
     * Redraw `source` into an offscreen through a Gaussian and wrap the result
     * as a child shader. Drawn under an identity CTM, so `sigma` stays the
     * device-px figure the handler measured.
     */
    private blurredCopy(source: CKImage, sigma: number): BuiltInput | null {
        const ck = this.canvasKit;
        const offscreen = this.activeSurface.makeSurface(this.activeSurface.imageInfo());
        if (!offscreen) return null;

        const canvas = offscreen.getCanvas();
        canvas.clear(ck.TRANSPARENT);
        const paint = new ck.Paint();
        // Clamp: the blur must not darken toward the edges of the surface, which
        // Decal would do by pulling transparency in from beyond them.
        const blur = sigma > 0 ? ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Clamp, null) : null;
        if (blur) paint.setImageFilter(blur);
        canvas.drawImage(source, 0, 0, paint);

        blur?.delete();
        paint.delete();
        return this.wrapOffscreen(offscreen, ck.TileMode.Clamp);
    }

    /**
     * Snapshot an offscreen and wrap it as a child shader, with a disposer that
     * frees the three objects in the order the rest of this file uses: the
     * shader first, then what backs it.
     */
    private wrapOffscreen(offscreen: Surface, tile: TileMode): BuiltInput {
        const ck = this.canvasKit;
        const image = offscreen.makeImageSnapshot();
        const shader = image.makeShaderOptions(tile, tile, ck.FilterMode.Linear, ck.MipmapMode.None);
        return {
            shader,
            dispose: () => {
                shader.delete();
                image.delete();
                offscreen.delete();
            },
        };
    }

    /**
     * Redirect drawing into a fresh offscreen surface so the node's own content can
     * later be resampled through the handler's lens, leaving the backdrop untouched.
     * Returns the capture (resolved in {@link resolveForegroundCapture}) or `null`
     * when the offscreen couldn't be created (drawing then stays on the main canvas).
     */
    private openForegroundCapture(
        handler: EffectHandler,
        effect: SceneEffect,
        width: number,
        height: number,
    ): ForegroundCapture | null {
        const ck = this.canvasKit;
        if (width <= 0 || height <= 0) return null;

        const offscreen = this.activeSurface.makeSurface(this.activeSurface.imageInfo());
        if (!offscreen) return null;

        const m = this.currentCanvas.getTotalMatrix();
        const offCanvas = offscreen.getCanvas();
        offCanvas.save();
        offCanvas.clear(ck.TRANSPARENT);
        offCanvas.concat(m); // replicate the full CTM so the node draws at the same device coords

        const savedCanvas = this.currentCanvas;
        this.currentCanvas = offCanvas;
        return { handler, effect, width, height, savedCanvas, offscreen, matrix: m };
    }

    /**
     * Stop capturing into an offscreen, snapshot what the node drew, and repaint it
     * through the handler's lens onto the canvas active when the capture opened.
     */
    private resolveForegroundCapture(capture: ForegroundCapture): void {
        const ck = this.canvasKit;
        const { handler, effect, width, height, savedCanvas, offscreen, matrix: m } = capture;

        // Balance the save() from openForegroundCapture and resume the outer canvas.
        this.currentCanvas.restore();
        this.currentCanvas = savedCanvas;

        const snapshot = offscreen.makeImageSnapshot();
        const tm = tileMode(ck, handler.sampling!.tileMode);
        const content = snapshot.makeShaderOptions(
            tm, tm, filterMode(ck, handler.sampling!.filterMode), ck.MipmapMode.None,
        );
        const extra = handler.resources?.(effect, ck, this.effectResources()) ?? [];
        const lens = handler.makeShader!(effect, ck, content, this.shaderGeometry(m, width, height), extra);
        // A null lens means the effect is a no-op at these settings (zero radius,
        // zero amount, …). Drawing was already redirected into the offscreen, so
        // the content still has to be painted back — dropping it here would make
        // a neutral effect erase the node, which is exactly the state every
        // "animate the effect on from nothing" tween starts in.
        // `clip`: confine the effect to the silhouette it was handed. The
        // snapshot *is* the node's own content, so blending the lens into it with
        // SrcIn keeps only the part of the effect that lands where the node
        // already had alpha — the shader-path twin of `EffectRegistry.compose`'s
        // ImageFilter clip, and the reason the flag means the same thing whether
        // an effect composes as a filter or resamples through a shader.
        const clipped =
            lens != null && (effect as { clip?: boolean }).clip === true
                ? ck.Shader.MakeBlend(ck.BlendMode.SrcIn, content, lens)
                : null;
        this.paintShaderInDeviceSpace(clipped ?? lens ?? content, m);
        clipped?.delete();
        lens?.delete();
        content.delete();
        snapshot.delete();
        offscreen.delete();
        // `extra` belongs to the handler's own cache — it decides the lifetime.
    }

    /**
     * The bake context handed to {@link EffectHandler.resources}: the font
     * registry, its epoch (so a late-loading family invalidates any cached
     * bake), and a way to make an offscreen matching the draw surface's format.
     */
    private effectResources(): EffectResources {
        return {
            fontMgr: this.storageAdapter.getFontMgr(),
            fontEpoch: this.storageAdapter.getFontEpoch(),
            makeSurface: (width, height) => {
                if (!(width > 0) || !(height > 0)) return null;
                return this.activeSurface.makeSurface({
                    ...this.activeSurface.imageInfo(),
                    width: Math.ceil(width),
                    height: Math.ceil(height),
                });
            },
            getImage: (src) => this.storageAdapter.getCKImage(src),
        };
    }

    /**
     * Node box in device px: centre from the CTM translation, size from its scale.
     * `scale` is that same CTM scale, so a handler can lift an authored px option
     * into device space; a node's `scale` prop is a scalar and camera zoom is
     * uniform, so the two axes agree in practice and the x axis stands for both.
     */
    private shaderGeometry(m: number[], width: number, height: number): EffectGeometry {
        const sx = Math.hypot(m[0], m[3]);
        const sy = Math.hypot(m[1], m[4]);
        const rs = this.currentRenderState();
        return {
            centerX: m[2],
            centerY: m[5],
            width: width * sx,
            height: height * sy,
            scale: sx,
            time: rs?.elapsed ?? 0,
            velocity: rs?.velocity ?? ZERO_VELOCITY,
            angularVelocity: rs?.angularVelocity ?? 0,
        };
    }

    /**
     * Paint `shader` over the whole surface in device space (identity CTM, so the
     * shader's fragCoord == device px), confined to the active silhouette clip
     * (stored in device space, so it survives the matrix reset). CanvasKit has no
     * resetMatrix, so concat the inverse CTM to reach identity.
     */
    private paintShaderInDeviceSpace(shader: Shader, m: number[]): void {
        const ck = this.canvasKit;
        this.currentCanvas.save();
        const inverse = ck.Matrix.invert(m);
        if (inverse) this.currentCanvas.concat(inverse);
        const paint = new ck.Paint();
        paint.setShader(shader);
        paint.setAntiAlias(true);
        this.currentCanvas.drawRect(
            ck.LTRBRect(0, 0, this.activeSurface.width(), this.activeSurface.height()),
            paint,
        );
        paint.delete();
        this.currentCanvas.restore();
    }

    // ─── Offscreen rasterization ─────────────────────────────────────────────

    /**
     * Rasterize a `Tex.surface` source — a built `Graphics`, or a detached `Node`
     * subtree — into an offscreen buffer.
     *
     * A `Node` source is laid out here rather than by the scene tree, because it
     * *isn't* in the tree: its box is the texture's resolution, so it is measured
     * straight against that. Everything else it needs (asset catalog, context,
     * clock) was bound by whatever painted the 3D scene — see `Node.adoptDetached`.
     */
    private rasterizeSurfaceSource(
        source: SurfaceSource3D,
        width: number,
        height: number,
        pixelRatio: number,
    ): RasterizedSurface | null {
        const resolved = resolveSurfaceSource(source);
        if (resolved.kind === "graphics") {
            return this.rasterizeOffscreen(width, height, () => this.draw(resolved.graphics), pixelRatio);
        }
        const node = resolved.node;
        return this.rasterizeOffscreen(width, height, () => {
            node.layout({ x: 0, y: 0, width, height }, this);
            node.render(this);
        }, pixelRatio);
    }

    /**
     * Draw `draw` into a fresh offscreen surface and read its pixels back.
     *
     * Same redirect `openForegroundCapture` performs — swap `currentCanvas` (every
     * handler reads it through a live closure, so they all follow) and restore it
     * afterwards — but sized to the requested box rather than the whole canvas,
     * and with the CTM *reset* rather than replicated: the buffer is its own
     * coordinate space, origin at the centre, exactly as `executePass` sets up the
     * main canvas. That's what lets `draw` be an ordinary `node.render(this)`.
     *
     * The readback is a real GPU→CPU stall (three has its own GL context, so there
     * is no shared texture to hand over). It is bounded by the surface's size,
     * which is why `Tex.surface` defaults to a pixel ratio of 1.
     */
    override rasterizeOffscreen(
        width: number,
        height: number,
        draw: () => void,
        pixelRatio: number = 1,
    ): RasterizedSurface | null {
        if (!this.isRendering || !this.surface) return null;
        if (!(width > 0) || !(height > 0)) return null;
        if (this.rasterDepth >= MAX_RASTER_DEPTH) {
            console.warn(
                `rasterizeOffscreen() nested more than ${MAX_RASTER_DEPTH} deep — skipping. ` +
                "A Surface2D is most likely nested inside itself via a View3D.",
            );
            return null;
        }

        const ck = this.canvasKit;
        const ratio = Math.max(1, Math.min(pixelRatio, MAX_RASTER_PIXEL_RATIO));
        const deviceWidth = Math.max(1, Math.ceil(width * ratio));
        const deviceHeight = Math.max(1, Math.ceil(height * ratio));

        const offscreen = this.activeSurface.makeSurface({
            ...this.activeSurface.imageInfo(),
            width: deviceWidth,
            height: deviceHeight,
        });
        if (!offscreen) return null;

        const savedCanvas = this.currentCanvas;
        const savedSurface = this.activeSurface;
        const savedWorldAlpha = this.worldAlpha;
        const shapeFrame = this.shapeHandler.beginNested();

        const offCanvas = offscreen.getCanvas();
        offCanvas.save();
        offCanvas.clear(ck.TRANSPARENT);
        offCanvas.scale(ratio, ratio);
        offCanvas.translate(width / 2, height / 2);

        this.currentCanvas = offCanvas;
        this.activeSurface = offscreen;
        // The buffer is a fresh composite, not a layer over the canvas — inherited
        // opacity is the *3D material's* business, not the texture's.
        this.worldAlpha = 1;
        this.rasterDepth++;

        try {
            draw();
        } finally {
            offCanvas.restore();
            this.rasterDepth--;
            this.currentCanvas = savedCanvas;
            this.activeSurface = savedSurface;
            this.worldAlpha = savedWorldAlpha;
            this.shapeHandler.endNested(shapeFrame);
        }

        offscreen.flush();
        const snapshot = offscreen.makeImageSnapshot();
        // Unpremultiplied so the bytes drop straight into a three DataTexture,
        // whose default `premultiplyAlpha` is false — the same read `screenshot()`
        // does for ImageData.
        const pixels = snapshot?.readPixels(0, 0, {
            width: deviceWidth,
            height: deviceHeight,
            colorType: ck.ColorType.RGBA_8888,
            alphaType: ck.AlphaType.Unpremul,
            colorSpace: ck.ColorSpace.SRGB,
        }) as Uint8Array | null;
        snapshot?.delete();
        offscreen.delete();
        if (!pixels) return null;

        // Copy out of the wasm heap: the caller holds this across frames, and the
        // heap can be reallocated under it.
        return { pixels: new Uint8Array(pixels), width: deviceWidth, height: deviceHeight };
    }

    // ─── Boolean group ───────────────────────────────────────────────────────

    beginBoolean(op: BooleanOperation): void {
        if (!this.isRendering) {
            console.warn("beginBoolean() must be called within the draw() method.");
            return;
        }
        this.shapeHandler.beginBoolean(op);
    }

    endBoolean(): void {
        if (!this.isRendering) {
            console.warn("endBoolean() must be called within the draw() method.");
            return;
        }
        this.shapeHandler.endBoolean();
    }

    // ─── Mask group ──────────────────────────────────────────────────────────

    beginMask(options?: MaskOptions): void {
        if (!this.isRendering) {
            console.warn("beginMask() must be called within the draw() method.");
            return;
        }
        this.shapeHandler.beginMask(options);
        this.deferredPaintsStack.push([]);
    }

    applyMask(): void {
        if (!this.isRendering) {
            console.warn("applyMask() must be called within the draw() method.");
            return;
        }
        this.shapeHandler.applyMask();
    }

    endMask(): void {
        if (!this.isRendering) {
            console.warn("endMask() must be called within the draw() method.");
            return;
        }
        this.shapeHandler.endMask();
        const deferred = this.deferredPaintsStack.pop() ?? [];
        this.flushDeferredPaints(deferred);
    }

    // Graphics-op variants of the mask scope, used when a Graphics command list
    // opens an inline mask within a single draw(). They share the imperative
    // scope implementation above.
    private _maskOp(options?: MaskOptions): void {
        this.beginMask(options);
    }
    private _applyMask(): void {
        this.applyMask();
    }
    private _endMaskOp(): void {
        this.endMask();
    }

    /** Replays fill/stroke calls that were postponed by an active mask scope (see `beginMask`/`_fill`/`_stroke`), in original order, once the mask resolves at `endMask`. */
    private flushDeferredPaints(deferred: DeferredPaintCall[]): void {
        for (const d of deferred) {
            if (d.kind === 'stroke') {
                if (d.shadows) {
                    this.strokeHandler.applyShadows(d.shadows, d.shapes, [], d.strokes, this.applyFillSpaceBounds);
                }
                this.strokeHandler.applyStrokes(d.strokes, d.shapes, this.applyFillSpaceBounds);
            } else {
                if (d.shadows) {
                    this.strokeHandler.applyShadows(d.shadows, d.shapes, d.fills, [], this.applyFillSpaceBounds);
                }
                this.fillHandler.applyFills(d.fills, d.shapes);
                if (d.shadows) {
                    this.strokeHandler.applyInnerShadows(d.shadows, d.shapes, d.fills, this.applyFillSpaceBounds);
                }
            }
        }
    }
}
