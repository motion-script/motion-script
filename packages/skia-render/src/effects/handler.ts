import type { CanvasKit, Image as CKImage, Shader, Surface, TypefaceFontProvider } from "@motion-script/canvaskit";
import type { MediaFilter, SceneEffect } from "@motion-script/core";

/**
 * Anything the effect registry can render.
 *
 * Three arms: an authored {@link SceneEffect}, an authored {@link MediaFilter}
 * (image/video fills), or a renderer-internal effect produced during a draw and
 * never authored on a node (e.g. motion blur resolved against velocity). All
 * three are discriminated by a `type` string.
 */
export type RenderEffect = SceneEffect | MediaFilter | { type: string };

/**
 * Which content an effect scope samples from: the node's own painted content
 * (`foreground`) or the canvas already painted beneath it (`backdrop`).
 * Mirrors `EffectTarget` in core's RenderContext.
 */
export type EffectTarget = "foreground" | "backdrop";

/**
 * The box an effect is being applied to, plus the per-draw context it may need.
 *
 * On the {@link EffectHandler.makeShader} path the box is in **device px** — so a
 * shader's `fragCoord` (which runs in device space after the CTM is reset to
 * identity) lines up with it, and {@link scale} converts an authored px option
 * into that space. On the {@link EffectHandler.makeImageFilter} path filters are
 * authored in *logical* px and the CTM scales them, so the box is logical and
 * `scale` is 1.
 *
 * Handlers that don't need geometry simply ignore it; most colour-matrix
 * filters do.
 */
export interface EffectGeometry {
    /** Box centre X in device px. */
    centerX: number;
    /** Box centre Y in device px. */
    centerY: number;
    /** Box width in device px. */
    width: number;
    /** Box height in device px. */
    height: number;
    /**
     * Device px per logical px — the CTM scale (node scale × camera zoom ×
     * device pixel ratio). Shader handlers multiply px-valued options by this so
     * an authored `width: 4` means the same thickness a 4px blur radius does on
     * the ImageFilter path. `1` on that path, which is already logical.
     */
    scale: number;
    /**
     * Seconds the node has existed (`NodeRenderState.elapsed`), or 0 when
     * unknown. Lets a shader vary per frame — animated film grain is the only
     * current user.
     */
    time: number;

    /**
     * The node's sampled translational velocity in **logical px/sec**, world
     * space (y-down), or `{0,0}` when unknown. Multiply by {@link scale} to reach
     * device space, like any other px-valued quantity.
     *
     * Sampled on every *advanced* frame rather than every rendered one, so it is
     * correct after a backward scrub — which is what lets a velocity-derived
     * effect stay a pure function of the playhead. `trails` is the current user;
     * `motionBlur` reads the same field through its own resolve step.
     */
    velocity: { x: number; y: number };

    /** The node's sampled rotational velocity in **degrees/sec**, or 0 when unknown. */
    angularVelocity: number;
}

/**
 * What an effect needs to *build its own texture* before drawing.
 *
 * Most effects only ever read their source. A few need a second input baked
 * first — a glyph atlas for `ascii`, a colour cube for a LUT — and that input is
 * expensive enough that it must be built once and cached, not per frame. This is
 * the seam for it: {@link EffectHandler.resources} receives one of these,
 * produces the extra child shaders, and caches them itself.
 */
export interface EffectResources {
    /**
     * Font families registered so far, for baking text into a texture.
     * Pair with {@link fontEpoch} when caching — a family that loads late
     * changes what this resolves to.
     */
    readonly fontMgr: TypefaceFontProvider;

    /**
     * Bumped whenever a font is registered. Fold it into any cache key derived
     * from {@link fontMgr}, or a texture baked before the real font arrived will
     * outlive it — silently, since a missing family still renders (as blanks).
     */
    readonly fontEpoch: number;

    /**
     * An offscreen GPU surface to bake into, sharing the draw surface's format.
     * Returns null if the surface could not be created; callers must cope.
     * The caller owns the result and should delete it once it has a snapshot.
     */
    makeSurface(width: number, height: number): Surface | null;

    /**
     * A GPU-resident image the project has loaded, or null if it isn't there.
     *
     * Null does **not** mean "broken" — it also means "not loaded yet", since
     * the asset manager fills its cache from the effect's own
     * `EffectData.prepare` declaration and the first frame can race it. Treat it
     * as "no texture this frame" and no-op; the next frame will have it. An
     * effect that instead drew something would flash.
     */
    getImage(src: string): CKImage | null;
}

/**
 * Extra child shaders a backdrop effect wants the renderer to rasterise for it,
 * each given as a blur sigma in **device px** (0 means no blur). An omitted
 * entry is not built at all.
 *
 * Both are things a handler cannot make on its own: one needs the clip path the
 * canvas has already swallowed, the other needs the source as an *image* where
 * `makeShader` is only handed a shader.
 */
export interface RenderInputRequest {
    /**
     * The node's outline, rasterised white-on-transparent in device space.
     *
     * A backdrop snapshot covers the whole surface at full alpha, so an effect
     * running there cannot tell where the node *is*. Clipping the result to the
     * outline afterwards bounds the effect but does not shape it; this is how
     * the shape itself gets in.
     *
     * The sigma is how a **distance field** arrives. A Gaussian over a filled
     * shape reads 0.5 exactly on the edge and climbs to 1 about 2σ inside, so
     * the mask's alpha is a smooth signed distance near the boundary and its
     * gradient is the edge normal — a distance transform for the price of one
     * blur, and one that follows any silhouette (a rounded rect, an ellipse, a
     * hand-drawn path) where an analytic SDF would have to be written per shape.
     */
    silhouette?: number;

    /**
     * A pre-blurred copy of the same source `content` wraps.
     *
     * Blurring in the lens shader instead means a disc of taps per fragment,
     * and a disc cheap enough to run per fragment ghosts anything with a hard
     * edge in it — a Gaussian worth the name is separable and needs two passes.
     * One offscreen with a real blur on it is both cheaper and better, which is
     * why this is the renderer's job rather than the shader's.
     */
    blurredSource?: number;
}

/** The shaders {@link RenderInputRequest} asked for, by name. */
export interface RenderInputShaders {
    silhouette?: Shader;
    blurredSource?: Shader;
}

/**
 * How one effect type is realised against CanvasKit.
 *
 * A handler declares one or both capabilities, and the **call site** picks which
 * it needs — so there is a single registry rather than one per capability:
 *
 * - {@link makeImageFilter} — the effect transforms colours in place, so it
 *   composes into a Skia `ImageFilter` chain alongside its neighbours. This is
 *   the common case and the only one an image fill can use.
 * - {@link makeShader} — the effect resamples pixel *positions*, so it needs the
 *   source snapshotted into a texture and redrawn through a lens. Requires
 *   {@link sampling}.
 *
 * Which one an effect needs is declared in core as its `EffectSurface`; the
 * registry asserts the two agree at registration time.
 */
export interface EffectHandler<T extends RenderEffect = any> {
    /** Effect discriminator (matches `SceneEffect['type']` / `MediaFilter['type']`). */
    readonly type: string;

    /**
     * Build a Skia ImageFilter for this effect, or `null` for a no-op (e.g. zero
     * radius), in which case the effect is skipped in the composed chain.
     */
    makeImageFilter?(effect: T, ck: CanvasKit, geom: EffectGeometry): any;

    /**
     * Build the lens shader that redraws `content`. Returns `null` for a no-op,
     * in which case the scope leaves the source untouched.
     *
     * @param content child shader wrapping the snapshot of the source, already
     *                created with this handler's {@link sampling}.
     * @param extra   whatever {@link resources} produced, in the same order, or
     *                an empty array. Pass these to `makeShaderWithChildren`
     *                *after* `content` so the SkSL child order lines up.
     * @param built   whatever {@link renderInputs} asked for, by name. Empty on
     *                the foreground path, which does not honour that hook.
     */
    makeShader?(
        effect: T,
        ck: CanvasKit,
        content: Shader,
        geom: EffectGeometry,
        extra?: readonly Shader[],
        built?: RenderInputShaders,
    ): Shader | null;

    /**
     * Ask the renderer to build the inputs an effect cannot build for itself —
     * see {@link RenderInputRequest}. Handed to {@link makeShader} as `built`,
     * by name, so there is no index to keep in step with {@link resources}.
     *
     * Honoured on the **backdrop** path only. A foreground effect already has
     * everything both entries offer: its content snapshot's alpha *is* the
     * silhouette (see `outline`), and it can pre-blur nothing the ImageFilter
     * chain could not have blurred first.
     */
    renderInputs?(effect: T, geom: EffectGeometry): RenderInputRequest | null;

    /**
     * Bake the extra textures this effect samples besides its source, as child
     * shaders handed to {@link makeShader}. Return `null` when there is nothing
     * to build, or when baking failed — `makeShader` then receives an empty
     * array and should no-op rather than render something wrong.
     *
     * Called once per draw, so **cache internally**: baking is exactly the work
     * this hook exists to avoid repeating. Key the cache on everything the bake
     * depends on, including `res.fontEpoch` for anything text-derived, and free
     * it from {@link dispose}.
     */
    resources?(effect: T, ck: CanvasKit, res: EffectResources): Shader[] | null;

    /** How the content child shader samples. Required when {@link makeShader} is set. */
    readonly sampling?: {
        tileMode: "clamp" | "decal";
        filterMode: "linear" | "nearest";
    };

    /**
     * Whether this handler's shader path can serve `target`. Defaults to both.
     * Only consulted for {@link makeShader}.
     */
    handles?(effect: T, target: EffectTarget): boolean;

    /**
     * Release persistent GPU objects. Called from `EffectRegistry.disposeAll()`
     * when the draw context is disposed.
     */
    dispose?(): void;
}
