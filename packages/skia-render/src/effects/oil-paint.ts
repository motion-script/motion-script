import type { EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type OilPaintEffect } from "@motion-script/core";

/**
 * Radius cap. Four windows of (r+1)² taps each, so r=6 is already 196 texture
 * reads per pixel over the whole surface — past this the effect stops being
 * usable in an interactive preview.
 */
const MAX_RADIUS = 6;

/**
 * Kuwahara: average within a region, never across an edge.
 *
 * The four quadrant windows all include the centre pixel and overlap along the
 * axes. For each, accumulate mean and mean-of-squares to get a variance, then
 * emit the mean of whichever window varied least. Because the winning window is
 * always the one that doesn't straddle a boundary, edges survive while flat
 * areas flatten further — which is what reads as brushwork rather than blur.
 *
 * Variance is measured on luminance rather than per channel: a single scalar to
 * compare, and it matches what "flat" means to the eye. Colour still comes from
 * that window's own mean, so hue is preserved.
 *
 * The radius is baked into the source because SkSL needs constant loop bounds;
 * `getOrCompileSkSL` keys on source text, so each radius compiles once.
 */
function skslFor(radius: number): string {
    return `
uniform shader u_content;  // snapshot of the source (premultiplied)

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec4 main(vec2 fragCoord) {
    vec4 centre = u_content.eval(fragCoord);
    if (centre.a <= 0.0) return centre;

    vec3 bestMean = centre.rgb / centre.a;
    float bestVar = 1e9;

    // Four quadrants: (-r..0,-r..0), (0..r,-r..0), (-r..0,0..r), (0..r,0..r).
    for (int q = 0; q < 4; q++) {
        float sx = (q == 1 || q == 3) ? 1.0 : -1.0;
        float sy = (q == 2 || q == 3) ? 1.0 : -1.0;

        vec3 sum = vec3(0.0);
        float sumL = 0.0;
        float sumL2 = 0.0;
        float n = 0.0;

        for (int y = 0; y <= ${radius}; y++) {
            for (int x = 0; x <= ${radius}; x++) {
                vec4 s = u_content.eval(fragCoord + vec2(float(x) * sx, float(y) * sy));
                // Skip anything outside the silhouette, or the window would be
                // pulled toward transparent black and the edge would darken.
                if (s.a <= 0.0) continue;
                vec3 c = s.rgb / s.a;
                float l = dot(c, LUMA);
                sum += c;
                sumL += l;
                sumL2 += l * l;
                n += 1.0;
            }
        }

        if (n <= 0.0) continue;
        float mean = sumL / n;
        float variance = sumL2 / n - mean * mean;
        if (variance < bestVar) {
            bestVar = variance;
            bestMean = sum / n;
        }
    }

    return vec4(bestMean * centre.a, centre.a);
}
`;
}

/**
 * Build the paint shader that redraws the source as brushwork. Returns null at
 * radius 0, where every window is the centre pixel and the filter is identity.
 */
export function makeOilPaintShader(
    effect: OilPaintEffect,
    ck: CanvasKit,
    content: Shader,
    scale: number,
): Shader | null {
    const radius = Math.round(Math.min(MAX_RADIUS, effect.radius * scale));
    if (radius < 1) return null;

    const runtimeEffect = getOrCompileSkSL(skslFor(radius), ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren([], [content]);
}

/** Kuwahara brushwork, on the node's own content or on the backdrop. */
export const oilPaintEffectHandler: EffectHandler<OilPaintEffect> = {
    type: "oilPaint",
    sampling: { tileMode: "decal", filterMode: "nearest" },
    makeShader: (effect, ck, content, geom) => makeOilPaintShader(effect, ck, content, geom.scale),
};
