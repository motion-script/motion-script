import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import type {
    SceneEffect as IEffect,
    BulgeEffect,
    MagnifyEffect,
    PosterizeEffect,
    SkSLEffect,
} from "@motion-script/core";

import { makeBulgeShader } from "./bulge";
import { makeMagnifyShader } from "./magnify";
import { makePosterizeShader } from "./posterize";
import { getOrCompileSkSL } from "./sksl-cache";

/**
 * Which content an effect scope samples from: the node's own painted content
 * (`foreground`) or the canvas already painted beneath the node (`backdrop`).
 * Mirrors `EffectTarget` in the core RenderContext.
 */
export type ShaderEffectTarget = "foreground" | "backdrop";

/**
 * Geometry the generic scope hands a shader effect, all in **device px** so the
 * shader's `fragCoord` (which runs in device space after the CTM is reset to
 * identity) lines up with the lens box.
 */
export interface ShaderEffectGeometry {
    /** Node centre X in device px. */
    centerX: number;
    /** Node centre Y in device px. */
    centerY: number;
    /** Node width in device px (CTM-scaled logical width). */
    width: number;
    /** Node height in device px. */
    height: number;
}

/**
 * A "shader effect" is an effect the renderer cannot express as a composable
 * Skia `ImageFilter` (the {@link CanvasKitEffect} path) — it works by snapshotting
 * the source content into a child shader and redrawing it through a custom SkSL
 * lens (bulge, magnify, posterize, backdrop SkSL).
 *
 * Every shader effect shares the same skeleton in `WebRenderContext`
 * (`runShaderEffectScope`): grab the source as a `Shader`, reset the canvas to
 * device space, draw a full-surface rect painted with the shader, clean up. The
 * only per-effect parts are (a) how the content shader should sample
 * ({@link tileMode}/{@link filterMode}) and (b) the lens shader itself. A handler
 * supplies exactly those, so adding one is a single registry entry — no new
 * method on `RenderContext`, no new stack, no new branch in `shape-node.ts`.
 */
export interface ShaderEffect<T extends IEffect = IEffect> {
    /** Effect discriminator (matches `SceneEffect.type`). */
    readonly type: string;
    /** Tiling for the content child shader outside the sampled region. */
    readonly tileMode: "clamp" | "decal";
    /** Sampling filter for the content child shader. */
    readonly filterMode: "linear" | "nearest";

    /** Whether this handler can run for the given target (some serve both). */
    handles(effect: T, target: ShaderEffectTarget): boolean;

    /**
     * Build the lens shader that redraws `content`. Returns `null` for a no-op
     * (e.g. zero strength), in which case the scope leaves the source untouched.
     *
     * @param content  child shader wrapping the snapshot/offscreen source, already
     *                 created with this handler's tile/filter mode.
     * @param geom     node box in device px.
     */
    makeShader(effect: T, ck: CanvasKit, content: Shader, geom: ShaderEffectGeometry): Shader | null;
}

// ── Handlers ────────────────────────────────────────────────────────────────

/** Bulge / pinch lens over the node's own content (foreground only). */
const bulgeShaderEffect: ShaderEffect<BulgeEffect> = {
    type: "bulge",
    tileMode: "decal",
    filterMode: "linear",
    handles: (_effect, target) => target === "foreground",
    makeShader: (effect, ck, content, geom) =>
        makeBulgeShader(effect, ck, content, geom.centerX, geom.centerY, geom.width, geom.height),
};

/** Magnifier lens over the backdrop beneath the node (backdrop only). */
const magnifyShaderEffect: ShaderEffect<MagnifyEffect> = {
    type: "magnify",
    tileMode: "clamp",
    filterMode: "linear",
    handles: (_effect, target) => target === "backdrop",
    makeShader: (effect, ck, content, geom) =>
        makeMagnifyShader(effect, ck, content, geom.centerX, geom.centerY, geom.width, geom.height),
};

/**
 * Posterize colour-banding. Serves both targets from the same shader — the only
 * difference between the old `beginPosterize`/`beginBackdropPosterize` was the
 * source, which the generic scope now selects from `target`.
 */
const posterizeShaderEffect: ShaderEffect<PosterizeEffect> = {
    type: "posterize",
    // Foreground bands the node's own content; backdrop bands what's beneath. The
    // old paths used Decal (foreground, transparent surround) vs Clamp (backdrop,
    // edge colour). Decal is correct for the node's own content and harmless for a
    // backdrop snapshot that fully covers the surface, so one mode serves both.
    tileMode: "decal",
    filterMode: "nearest",
    handles: () => true,
    makeShader: (effect, ck, content) => makePosterizeShader(effect, ck, content),
};

/** Custom SkSL that resamples the backdrop via `uniform shader u_backdrop`. */
const skslBackdropShaderEffect: ShaderEffect<SkSLEffect> = {
    type: "sksl",
    tileMode: "clamp",
    filterMode: "linear",
    handles: (effect, target) => target === "backdrop" && effect.mode === "backdrop",
    makeShader: (effect, ck, content) => {
        const rte = getOrCompileSkSL(effect.shader, ck);
        if (!rte) return null;
        const flat = effect.uniforms.flatMap((u) =>
            typeof u.value === "number" ? [u.value] : u.value,
        );
        // The first child shader is always u_backdrop.
        return rte.makeShaderWithChildren(flat, [content]);
    },
};

const HANDLERS: ShaderEffect<any>[] = [
    bulgeShaderEffect,
    magnifyShaderEffect,
    posterizeShaderEffect,
    skslBackdropShaderEffect,
];

/**
 * Registry of {@link ShaderEffect} handlers, parallel to
 * {@link CanvasKitEffectRegistry}. The generic effect scope asks this which
 * effects in a group are shader-based (so the rest can take the ImageFilter
 * path) and looks up the handler for each.
 */
export const ShaderEffectRegistry = {
    /** Handler that can render `effect` for `target`, or `undefined`. */
    resolve(effect: IEffect, target: ShaderEffectTarget): ShaderEffect | undefined {
        return HANDLERS.find((h) => h.type === effect.type && h.handles(effect as any, target));
    },

    /** Whether `effect` is rendered via a shader (vs. an ImageFilter) for `target`. */
    isShaderEffect(effect: IEffect, target: ShaderEffectTarget): boolean {
        return this.resolve(effect, target) !== undefined;
    },
};
