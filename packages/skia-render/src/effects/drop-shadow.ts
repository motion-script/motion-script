import type { EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { resolveEffectColor, type DropShadowEffect } from "@motion-script/core";

/**
 * Ring counts the disc sampler may use, coarsest first.
 *
 * Quantised for the reason {@link makeOutlineShader}'s tap counts are: the count
 * is baked into the shader source, so a continuously-varying one would compile a
 * fresh GPU program on every frame of a `blur` tween.
 */
const RING_BUCKETS = [2, 3, 4, 6] as const;

/** Angular taps per ring. Fixed, so the program cache stays one entry per ring count. */
const TAPS_PER_RING = 12;

/** Radial spacing to aim for between rings, in device px. */
const TARGET_RING_GAP = 4;

/**
 * Pick the cheapest ring count that keeps the rings close enough together to
 * read as a smooth falloff rather than as concentric bands.
 */
function ringsFor(radius: number): number {
    const wanted = radius / TARGET_RING_GAP;
    return RING_BUCKETS.find((r) => r >= wanted) ?? RING_BUCKETS[RING_BUCKETS.length - 1];
}

/**
 * A shadow cast from the node's own alpha, laid **under** its content.
 *
 * Three stages, in the order the uniforms are read:
 *
 *   spread → offset → blur
 *
 * `spread` grows the silhouette by taking the **maximum** alpha over a disc
 * (a dilation, exactly as the outline band's outward half does), which is what
 * `box-shadow`'s third length and Figma's "spread" mean. `offset` displaces
 * where the silhouette is sampled from. `blur` averages over a disc with
 * gaussian weights, which is what softens it.
 *
 * The blur is a **weighted disc average** rather than the usual separable
 * two-pass gaussian, because a shader scope gets one pass over the surface: it
 * cannot write an intermediate texture and read it back. Rings of taps with
 * gaussian weights approximate the same kernel closely enough for a shadow,
 * which is a soft, low-frequency thing by nature — the error a shadow can
 * actually show is *banding*, and that is what the ring spacing above is chosen
 * against.
 *
 * Sampling is `decal`-tiled (see the handler), so alpha outside the content
 * reads as 0 and the shadow falls away at the edges instead of smearing the
 * border texel outward forever.
 */
function skslFor(rings: number, spreading: boolean): string {
    const step = ((2 * Math.PI) / TAPS_PER_RING).toFixed(8);

    // Alpha of the (optionally dilated) silhouette at `p`. With no spread this
    // is one texture read; with spread it is a ring maximum, which is exact for
    // a dilation because the maximum over a disc is attained on its boundary.
    const alphaAt = spreading
        ? `
float silhouette(vec2 p) {
    float a = u_content.eval(p).a;
    for (int i = 0; i < ${TAPS_PER_RING}; i++) {
        float t = float(i) * ${step};
        a = max(a, u_content.eval(p + vec2(cos(t), sin(t)) * u_spread).a);
    }
    return a;
}`
        : `
float silhouette(vec2 p) {
    return u_content.eval(p).a;
}`;

    return `
uniform shader u_content;   // snapshot of the node's own content (premultiplied)
uniform vec2   u_offset;    // shadow displacement, device px (y already flipped)
uniform float  u_sigma;     // blur sigma, device px
uniform vec4   u_color;     // shadow colour, straight RGBA
${spreading ? "uniform float  u_spread;    // dilate distance, device px" : ""}
${alphaAt}

vec4 main(vec2 fragCoord) {
    vec4 src = u_content.eval(fragCoord);

    // Where this pixel's shadow is cast *from*.
    vec2 origin = fragCoord - u_offset;

    float shadowAlpha;
    if (u_sigma <= 0.0) {
        shadowAlpha = silhouette(origin);
    } else {
        // Centre tap carries the peak of the kernel.
        float sum = silhouette(origin);
        float weight = 1.0;
        for (int r = 1; r <= ${rings}; r++) {
            // Rings span out to 3σ, where a gaussian has all but ~1% of its mass.
            float radius = (3.0 * u_sigma * float(r)) / float(${rings});
            float w = exp(-(radius * radius) / (2.0 * u_sigma * u_sigma));
            for (int i = 0; i < ${TAPS_PER_RING}; i++) {
                float t = float(i) * ${step};
                sum += silhouette(origin + vec2(cos(t), sin(t)) * radius) * w;
                weight += w;
            }
        }
        shadowAlpha = sum / weight;
    }

    float a = clamp(shadowAlpha, 0.0, 1.0) * u_color.a;
    vec4 shadow = vec4(u_color.rgb * a, a);   // premultiplied

    // Source-over of the content on top of its own shadow.
    return src + shadow * (1.0 - src.a);
}
`;
}

/**
 * Build the paint shader that draws the node's content over a shadow cast from
 * its silhouette. Returns null when the effect is a no-op — a fully transparent
 * colour, or a shadow with no offset, no blur and no spread, which would sit
 * exactly under the content and never be seen.
 *
 * Every px-valued option is authored in logical px and lifted into the device
 * space the shader runs in by `scale`, so a shadow grows with the node the way a
 * blur radius does rather than staying a fixed number of screen pixels.
 *
 * `offsetY` is negated on the way in: the scene's axes are y-up (a positive
 * offset lifts a `shadow` prop's shadow upward) and the shader runs in y-down
 * device space, so the two kinds of shadow answer to the same numbers.
 */
export function makeDropShadowShader(
    effect: DropShadowEffect,
    ck: CanvasKit,
    content: Shader,
    scale: number,
): Shader | null {
    const color = resolveEffectColor(effect.color);
    if (color[3] <= 0) return null;

    const offsetX = effect.offsetX * scale;
    const offsetY = -effect.offsetY * scale;
    // Same convention the blur effect uses: sigma is about half the perceived
    // radius, so `blur: 10` here and `blur: 10` there look alike.
    const sigma = Math.max(0, effect.blur * scale) / 2;
    const spread = Math.max(0, effect.spread * scale);
    if (offsetX === 0 && offsetY === 0 && sigma === 0 && spread === 0) return null;

    const source = skslFor(ringsFor(sigma), spread > 0);
    const runtimeEffect = getOrCompileSkSL(source, ck);
    if (!runtimeEffect) return null;

    // Uniform order must match the declarations the variant actually emitted.
    const uniforms = [offsetX, offsetY, sigma, ...color];
    if (spread > 0) uniforms.push(spread);

    return runtimeEffect.makeShaderWithChildren(uniforms, [content]);
}

/**
 * Shadow cast from the node's own silhouette. Foreground only, on the same
 * grounds as the outline band: a backdrop snapshot covers the whole surface at
 * full alpha, so there is no silhouette there to cast from.
 */
export const dropShadowEffectHandler: EffectHandler<DropShadowEffect> = {
    type: "dropShadow",
    sampling: { tileMode: "decal", filterMode: "linear" },
    handles: (_effect, target) => target === "foreground",
    makeShader: (effect, ck, content, geom) => makeDropShadowShader(effect, ck, content, geom.scale),
};
