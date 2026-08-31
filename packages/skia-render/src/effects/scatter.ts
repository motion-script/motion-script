import type { EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { resolveEffectAxis, type ScatterEffect } from "@motion-script/core";
import { patternOrigin } from "./pattern-origin";

/**
 * Scatter — randomly jitters each pixel of the node's own content, mimicking
 * After Effects' Scatter effect.
 *
 * Each pixel hashes its **node-local** coordinate into two decorrelated values,
 * remaps them to ±1 and samples the source that far away. Hashing the pixel
 * rather than the fragment is the whole point: the jitter a given piece of the
 * picture gets is a property of that piece, so the smear travels with the node
 * instead of being re-rolled every time it moves. See {@link patternOrigin}.
 *
 * ## Why this stopped being an ImageFilter
 *
 * It used to be built out of Skia primitives — `MakeFractalNoise` wrapped as an
 * image filter, driving `MakeDisplacementMap` — which needed no shader of its
 * own and was, on the face of it, the cheaper thing. It also boiled.
 *
 * An image filter's noise is evaluated against the **layer** Skia allocates for
 * it, and that layer's origin is snapped to whole device pixels. A node standing
 * at a fractional position therefore gets its content and its noise field offset
 * from each other by the sub-pixel remainder — so the field holds still for as
 * long as the node sits on a whole pixel and re-rolls the moment it doesn't.
 * Animating a position walks continuously through those remainders, which is
 * exactly the case where the effect is most visible and the crawl most
 * distracting. Nothing on that path fixes it: the snapping is Skia's, not ours,
 * and `MakeFractalNoise` takes no offset to compensate with.
 *
 * A shader can simply be told where the node is, so it is a shader now. The cost
 * is the one every resampling effect here already pays — the source is
 * snapshotted and redrawn through a lens rather than composed — and it buys a
 * jitter that is a pure function of the node's own pixels.
 *
 * The one visible difference is the grain of the field itself: two octaves of
 * fractal noise near Nyquist gave *almost* per-pixel decorrelation, and a hash
 * gives it exactly. Existing scenes keep the same amplitude, the same axis
 * behaviour and the same overall look; a close comparison shows a slightly
 * crisper speckle.
 *
 * Per-axis weighting is a multiply on the offset — `'x'` is `{1,0}`, `'y'` is
 * `{0,1}`, a `Vector2` scales each independently — which is what the old colour
 * matrix was doing the long way round, by pulling a noise channel toward the
 * neutral 0.5 that `MakeDisplacementMap` read as zero displacement.
 */
const SCATTER_SKSL = `
uniform shader u_content;   // snapshot of the source (premultiplied)
uniform vec2   u_origin;    // node box top-left, device px (0,0 on a backdrop)
uniform vec2   u_offset;    // max displacement per axis, device px

float hash(vec2 p, float salt) {
    return fract(sin(dot(p, vec2(127.1, 311.7)) + salt) * 43758.5453);
}

vec4 main(vec2 fragCoord) {
    // Quantised to the pixel so one pixel gets one offset. An unquantised hash
    // of a continuous coordinate takes a different value at every sample, which
    // reads as static rather than as a smear.
    vec2 cell = floor(fragCoord - u_origin);
    vec2 jitter = vec2(hash(cell, 0.0), hash(cell, 37.13)) * 2.0 - 1.0;
    return u_content.eval(fragCoord + jitter * u_offset);
}
`;

/**
 * Build the lens that redraws the source jittered. Returns null at zero
 * strength, which is where every tween-it-on-from-nothing starts.
 */
export function makeScatterShader(
    effect: ScatterEffect,
    ck: CanvasKit,
    content: Shader,
    scale: number,
    origin: readonly [number, number] = [0, 0],
): Shader | null {
    if (!(effect.strength > 0)) return null;

    const runtimeEffect = getOrCompileSkSL(SCATTER_SKSL, ck);
    if (!runtimeEffect) return null;

    // Authored in logical px like every other px-valued option, so it is lifted
    // into the device space `fragCoord` runs in.
    const axis = resolveEffectAxis(effect.axis);
    const strength = effect.strength * scale;

    return runtimeEffect.makeShaderWithChildren(
        [origin[0], origin[1], strength * axis.x, strength * axis.y],
        [content],
    );
}

/** Scatter, on the node's own content or on the backdrop beneath it. */
export const scatterEffectHandler: EffectHandler<ScatterEffect> = {
    type: "scatter",
    // Linear, because an offset lands between texels and nearest would add a
    // second, coarser quantisation on top of the one the hash already applies.
    // Decal so a jitter reaching past the content's edge reads as transparent
    // rather than smearing its border pixels outward.
    sampling: { tileMode: "decal", filterMode: "linear" },
    makeShader: (effect, ck, content, geom) =>
        makeScatterShader(effect, ck, content, geom.scale, patternOrigin(effect, geom)),
};
