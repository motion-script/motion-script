import type { EffectGeometry, EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type RadialBlurEffect } from "@motion-script/core";

/** Tap-count bounds. The upper end caps how many shader variants can be cached. */
const MIN_SAMPLES = 2;
const MAX_SAMPLES = 32;

/**
 * Radial blur: average the source along a path through each pixel.
 *
 * - **zoom** scales the pixel's offset from the centre across `1 ± amount/2`, so
 *   the smear length grows with distance and the centre stays sharp.
 * - **spin** rotates that offset instead, over `amount` of a quarter turn.
 *
 * Taps are spread symmetrically around the pixel (`t` runs −0.5…0.5) so the
 * result stays registered with the source rather than drifting outward.
 *
 * The tap count is baked into the source rather than passed as a uniform: SkSL
 * runtime effects require constant loop bounds, and the alternative — looping to
 * a fixed maximum and weighting the surplus taps to zero — would pay for 32
 * samples even when 4 were asked for. `getOrCompileSkSL` keys on source text, so
 * each distinct count compiles once and is reused.
 */
function skslFor(samples: number): string {
    return `
uniform shader u_content;  // snapshot of the source (premultiplied)
uniform vec2   u_center;   // blur centre, device px
uniform float  u_amount;   // smear length, 0–1
uniform float  u_spin;     // 1 = rotate about the centre, 0 = scale away from it

vec4 main(vec2 fragCoord) {
    vec2 offset = fragCoord - u_center;
    vec4 acc = vec4(0.0);

    for (int i = 0; i < ${samples}; i++) {
        float t = float(i) / ${samples - 1}.0 - 0.5;
        vec2 samplePos;
        if (u_spin > 0.5) {
            float angle = t * u_amount * 1.5707963;   // a quarter turn at amount = 1
            float ca = cos(angle);
            float sa = sin(angle);
            samplePos = u_center + vec2(offset.x * ca - offset.y * sa,
                                        offset.x * sa + offset.y * ca);
        } else {
            samplePos = u_center + offset * (1.0 + t * u_amount);
        }
        acc += u_content.eval(samplePos);
    }

    return acc / ${samples}.0;
}
`;
}

/**
 * Build the paint shader that draws the source smeared around `center`. Returns
 * null when the effect is a no-op (no smear, or a degenerate box).
 */
export function makeRadialBlurShader(
    effect: RadialBlurEffect,
    ck: CanvasKit,
    content: Shader,
    geom: EffectGeometry,
): Shader | null {
    if (!(effect.amount > 0)) return null;
    if (geom.width <= 0 || geom.height <= 0) return null;

    const samples = Math.round(Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, effect.samples)));
    const runtimeEffect = getOrCompileSkSL(skslFor(samples), ck);
    if (!runtimeEffect) return null;

    // `center` is authored in 0–1 layer coords; offset the box centre by how far
    // it sits from the middle, in device px (the mapping bulge/magnify use).
    const cx = geom.centerX + (effect.center.x - 0.5) * geom.width;
    const cy = geom.centerY + (effect.center.y - 0.5) * geom.height;

    return runtimeEffect.makeShaderWithChildren(
        [cx, cy, effect.amount, effect.style === "spin" ? 1 : 0],
        [content],
    );
}

/** Zoom / spin blur, on the node's own content or on the backdrop beneath it. */
export const radialBlurEffectHandler: EffectHandler<RadialBlurEffect> = {
    type: "radialBlur",
    sampling: { tileMode: "decal", filterMode: "linear" },
    makeShader: (effect, ck, content, geom) => makeRadialBlurShader(effect, ck, content, geom),
};
