import type { CanvasKit, Shader } from "@motion-script/canvaskit";
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
 * The box an effect is being applied to, in **device px** — so a shader's
 * `fragCoord` (which runs in device space after the CTM is reset to identity)
 * lines up with it.
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
     */
    makeShader?(effect: T, ck: CanvasKit, content: Shader, geom: EffectGeometry): Shader | null;

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
