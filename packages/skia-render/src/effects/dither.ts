import type { EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type DitherEffect } from "@motion-script/core";

/**
 * Ordered (Bayer) dithering: quantize to `levels` tones per channel, but offset
 * each pixel's rounding by a repeating threshold matrix so the quantization
 * error becomes a fixed pattern instead of a visible band.
 *
 *   out = floor(v·(L−1) + threshold) / (L−1),   threshold ∈ [0,1)
 *
 * The 2×2 base matrix comes out of a two-line identity rather than a table:
 * `fract(x/2 + y²·¾)` enumerates {0, ½, ¾, ¼} over the four cells, which is
 * exactly Bayer's [[0,2],[3,1]]/4. The 4×4 and 8×8 matrices are then the
 * standard recursion — a coarser copy of the pattern, quarter-weighted, plus the
 * 2×2 detail on top.
 *
 * The matrix size is baked into the source (three variants, cached by
 * `getOrCompileSkSL`) so the shader isn't paying to evaluate all three sizes
 * behind a uniform branch.
 */
function skslFor(matrix: 2 | 4 | 8): string {
    const bayer =
        matrix === 2
            ? "bayer2(cell)"
            : matrix === 4
                ? "bayer2(cell * 0.5) * 0.25 + bayer2(cell)"
                : "(bayer2(cell * 0.25) * 0.25 + bayer2(cell * 0.5)) * 0.25 + bayer2(cell)";

    return `
uniform shader u_content;     // snapshot of the source (premultiplied)
uniform float  u_levels;      // output tones per channel (>= 2)
uniform float  u_scale;       // pattern cell size, device px
uniform float  u_monochrome;  // 1 = dither luminance, 0 = per channel

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

/** Bayer 2×2 threshold in [0,1) for an integer cell coordinate. */
float bayer2(vec2 c) {
    vec2 a = floor(c);
    return fract(a.x * 0.5 + a.y * a.y * 0.75);
}

vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    if (c.a <= 0.0) return c;

    vec2 cell = floor(fragCoord / max(u_scale, 1.0));
    float threshold = ${bayer};

    vec3 base = c.rgb / c.a;                       // un-premultiply
    if (u_monochrome > 0.5) base = vec3(dot(base, LUMA));

    float steps = max(u_levels, 2.0) - 1.0;
    vec3 dithered = clamp(floor(base * steps + threshold) / steps, 0.0, 1.0);
    return vec4(dithered * c.a, c.a);              // re-premultiply
}
`;
}

/**
 * Build the paint shader that draws the source ordered-dithered. Returns null
 * when `levels` is high enough that quantization is a no-op — past 256 tones per
 * channel there is nothing left to round in 8-bit output.
 */
export function makeDitherShader(
    effect: DitherEffect,
    ck: CanvasKit,
    content: Shader,
    scale: number,
): Shader | null {
    if (effect.levels >= 256) return null;

    const runtimeEffect = getOrCompileSkSL(skslFor(effect.matrix), ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren(
        [effect.levels, Math.max(effect.scale * scale, 1), effect.monochrome ? 1 : 0],
        [content],
    );
}

/** Ordered dithering, on the node's own content or on the backdrop beneath it. */
export const ditherEffectHandler: EffectHandler<DitherEffect> = {
    type: "dither",
    sampling: { tileMode: "decal", filterMode: "nearest" },
    makeShader: (effect, ck, content, geom) => makeDitherShader(effect, ck, content, geom.scale),
};
