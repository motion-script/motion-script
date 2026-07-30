import type { EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type EdgesEffect } from "@motion-script/core";

/** Kernel selector passed to the shader — keep in sync with `EdgeKernel`. */
const KERNEL_ID: Record<EdgesEffect["kernel"], number> = {
    sobel: 0,
    prewitt: 1,
    laplacian: 2,
};

/**
 * Edge detection over a 3×3 neighbourhood.
 *
 * Sobel and Prewitt differ only in the weight given to the middle of each
 * kernel row (2 vs 1), so one gradient pair covers both; the Laplacian is a
 * separate second-derivative tap. Magnitude is `√(gx² + gy²)` for the gradient
 * operators and `|4c − neighbours|` for the Laplacian.
 *
 * The taps read **premultiplied** colour deliberately: it makes the alpha
 * silhouette itself a step in the signal, so a shape's outline registers as an
 * edge instead of vanishing into the transparent surround. The output alpha is
 * `max(source alpha, magnitude)` so that boundary edge is actually visible —
 * which lets the result grow by at most one tap outside the node.
 *
 * Tap spacing is one *logical* px (`u_step`), so the look doesn't change with
 * device pixel ratio.
 */
const EDGES_SKSL = `
uniform shader u_content;   // snapshot of the source (premultiplied)
uniform float  u_strength;  // magnitude multiplier
uniform float  u_kernel;    // 0 = sobel, 1 = prewitt, 2 = laplacian
uniform float  u_colored;   // 1 = per-channel edges, 0 = luminance
uniform float  u_step;      // tap spacing, device px

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec4 main(vec2 fragCoord) {
    float s = max(u_step, 1.0);

    vec4 c11 = u_content.eval(fragCoord);
    vec3 c00 = u_content.eval(fragCoord + vec2(-s, -s)).rgb;
    vec3 c01 = u_content.eval(fragCoord + vec2(0.0, -s)).rgb;
    vec3 c02 = u_content.eval(fragCoord + vec2( s, -s)).rgb;
    vec3 c10 = u_content.eval(fragCoord + vec2(-s, 0.0)).rgb;
    vec3 c12 = u_content.eval(fragCoord + vec2( s, 0.0)).rgb;
    vec3 c20 = u_content.eval(fragCoord + vec2(-s,  s)).rgb;
    vec3 c21 = u_content.eval(fragCoord + vec2(0.0,  s)).rgb;
    vec3 c22 = u_content.eval(fragCoord + vec2( s,  s)).rgb;

    // Sobel weights its middle tap twice as heavily as Prewitt does.
    float w = u_kernel < 0.5 ? 2.0 : 1.0;
    vec3 gx = (c02 + c12 * w + c22) - (c00 + c10 * w + c20);
    vec3 gy = (c20 + c21 * w + c22) - (c00 + c01 * w + c02);
    vec3 gradient = sqrt(gx * gx + gy * gy);
    vec3 laplacian = abs(c11.rgb * 4.0 - c01 - c10 - c12 - c21);

    vec3 e = u_kernel < 1.5 ? gradient : laplacian;
    vec3 edge = u_colored > 0.5 ? e : vec3(dot(e, LUMA));
    edge = clamp(edge * u_strength, 0.0, 1.0);

    float a = max(c11.a, max(edge.r, max(edge.g, edge.b)));
    return vec4(edge * a, a);
}
`;

/**
 * Build the paint shader that replaces the source with its own edge map.
 * Returns null when `strength` is zero (an all-black result adds nothing).
 */
export function makeEdgesShader(
    effect: EdgesEffect,
    ck: CanvasKit,
    content: Shader,
    scale: number,
): Shader | null {
    if (!(effect.strength > 0)) return null;

    const runtimeEffect = getOrCompileSkSL(EDGES_SKSL, ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren(
        [effect.strength, KERNEL_ID[effect.kernel] ?? 0, effect.colored ? 1 : 0, scale],
        [content],
    );
}

/** Edge detection, on the node's own content or on the backdrop beneath it. */
export const edgesEffectHandler: EffectHandler<EdgesEffect> = {
    type: "edges",
    sampling: { tileMode: "decal", filterMode: "nearest" },
    makeShader: (effect, ck, content, geom) => makeEdgesShader(effect, ck, content, geom.scale),
};
