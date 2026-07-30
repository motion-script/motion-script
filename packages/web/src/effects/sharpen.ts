import type { EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type SharpenEffect } from "@motion-script/core";

/**
 * Unsharp mask — `out = c + amount·(c − blur(c))`.
 *
 * The blurred reference is a 3×3 tent (centre 4, edges 2, corners 1, ÷16) with
 * its taps pushed out to ±`radius`, which is the cheapest kernel that stays
 * isotropic; widening the tap spacing rather than the kernel is what lets one
 * nine-tap pass cover both fine-detail and clarity-style sharpening.
 *
 * Both the source and the blurred reference are un-premultiplied before the
 * difference is taken. Skipping that would let the alpha ramp at an antialiased
 * edge masquerade as a luminance edge, ringing every silhouette.
 *
 * (Skia's `MakeMatrixConvolution` would be the natural home for this, but it is
 * absent from this CanvasKit build — hence the shader.)
 */
const SHARPEN_SKSL = `
uniform shader u_content;  // snapshot of the source (premultiplied)
uniform float  u_amount;   // edge-contrast boost
uniform float  u_radius;   // tap spacing, device px

vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    if (c.a <= 0.0) return c;

    float r = max(u_radius, 0.5);
    vec4 sum = c * 4.0;
    sum += u_content.eval(fragCoord + vec2( r, 0.0)) * 2.0;
    sum += u_content.eval(fragCoord + vec2(-r, 0.0)) * 2.0;
    sum += u_content.eval(fragCoord + vec2(0.0,  r)) * 2.0;
    sum += u_content.eval(fragCoord + vec2(0.0, -r)) * 2.0;
    sum += u_content.eval(fragCoord + vec2( r,  r));
    sum += u_content.eval(fragCoord + vec2( r, -r));
    sum += u_content.eval(fragCoord + vec2(-r,  r));
    sum += u_content.eval(fragCoord + vec2(-r, -r));
    vec4 blurred = sum / 16.0;

    vec3 base = c.rgb / c.a;
    vec3 reference = blurred.a > 0.0 ? blurred.rgb / blurred.a : base;
    vec3 sharpened = clamp(base + (base - reference) * u_amount, 0.0, 1.0);
    return vec4(sharpened * c.a, c.a);
}
`;

/**
 * Build the paint shader that draws the source with local contrast boosted.
 * Returns null when `amount` is zero (nothing to add back).
 */
export function makeSharpenShader(
    effect: SharpenEffect,
    ck: CanvasKit,
    content: Shader,
    scale: number,
): Shader | null {
    if (effect.amount === 0) return null;

    const runtimeEffect = getOrCompileSkSL(SHARPEN_SKSL, ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren(
        [effect.amount, Math.max(effect.radius, 0) * scale],
        [content],
    );
}

/** Unsharp-mask sharpen, on the node's own content or on the backdrop. */
export const sharpenEffectHandler: EffectHandler<SharpenEffect> = {
    type: "sharpen",
    sampling: { tileMode: "decal", filterMode: "linear" },
    makeShader: (effect, ck, content, geom) => makeSharpenShader(effect, ck, content, geom.scale),
};
