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
     */
    makeShader?(
        effect: T,
        ck: CanvasKit,
        content: Shader,
        geom: EffectGeometry,
        extra?: readonly Shader[],
    ): Shader | null;

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
