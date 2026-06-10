import type { CanvasKit, RuntimeEffect, Shader } from "@motion-script/canvaskit";
import { type PosterizeEffect } from "@motion-script/core";

/**
 * After Effects-style Posterize applied to the node's *own* content — the
 * `u_content` child shader wraps a snapshot of everything the node painted
 * (fill, stroke and children).
 *
 * AE's Posterize has a single "Level" parameter: the number of evenly-spaced
 * tones each channel is collapsed to. For `L` levels the output values per
 * channel are `{0, 1/(L-1), …, 1}`, computed as
 *
 *   q = floor(c · L) / (L − 1)
 *
 * (with the top bucket clamped so fully-bright input maps to 1). The content
 * snapshot is premultiplied, so we un-premultiply before banding and
 * re-premultiply after, leaving the alpha edge untouched.
 */
const POSTERIZE_SKSL = `
uniform shader u_content;  // snapshot of the node's own content (premultiplied)
uniform float u_level;     // number of brightness bands per channel (>= 2)

vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    float a = c.a;
    if (a <= 0.0) return vec4(0.0);

    vec3 base = c.rgb / a;                       // un-premultiply to straight colour
    float L = max(floor(u_level + 0.5), 2.0);
    vec3 q = min(floor(base * L), L - 1.0) / (L - 1.0);
    q = clamp(q, 0.0, 1.0);
    return vec4(q * a, a);                        // re-premultiply
}
`;

let cachedEffect: RuntimeEffect | null = null;

function getRuntimeEffect(ck: CanvasKit): RuntimeEffect | null {
    if (!cachedEffect) cachedEffect = ck.RuntimeEffect.Make(POSTERIZE_SKSL);
    return cachedEffect;
}

/** Drop the cached RuntimeEffect (called when the draw context is disposed). */
export function disposePosterize(): void {
    cachedEffect?.delete();
    cachedEffect = null;
}

/**
 * Build a paint shader that draws the node's content with each colour channel
 * quantized into `effect.level` bands. The caller draws it over the surface in
 * device space; the content snapshot's own alpha (Decal tiling) bounds it to the
 * node. Returns null when the effect is a no-op (level < 2 leaves nothing to
 * band).
 *
 * @param effect   posterize params (level).
 * @param ck       live CanvasKit instance.
 * @param content  child shader wrapping the snapshot of the node's own content.
 */
export function makePosterizeShader(
    effect: PosterizeEffect,
    ck: CanvasKit,
    content: Shader,
): Shader | null {
    if (effect.level < 2) return null;

    const runtimeEffect = getRuntimeEffect(ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren([effect.level], [content]);
}
