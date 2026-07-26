import type { EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "./sksl-cache";
import { resolveEffectColor, type OutlineEffect, type OutlinePosition } from "@motion-script/core";

/**
 * Angular tap counts the ring sampler may use, coarsest first.
 *
 * Quantised rather than computed exactly: the count is baked into the shader
 * source, so a continuously-varying one would compile a fresh GPU program on
 * every frame of a `width` tween. Five buckets cap the cache at fifteen programs
 * (five counts × three positions) across a whole project.
 */
const TAP_BUCKETS = [12, 16, 24, 32, 40] as const;

/** Arc length between adjacent taps to aim for, in device px. */
const TARGET_ARC = 3;

/**
 * Pick the cheapest tap count whose ring spacing stays under {@link TARGET_ARC}.
 *
 * Faceting is what gives a cheap outline away: the dilated silhouette is the
 * union of discs, so N taps turn a rounded corner into an N-gon. Spacing the
 * taps ~3 device px apart keeps each facet chord near the pixel grid, which
 * reads as a smooth arc.
 */
function tapsFor(radius: number): number {
    const wanted = (2 * Math.PI * radius) / TARGET_ARC;
    return TAP_BUCKETS.find((t) => t >= wanted) ?? TAP_BUCKETS[TAP_BUCKETS.length - 1];
}

/**
 * A coloured band traced around the node's own alpha silhouette.
 *
 * The band is the difference between a **dilated** and an **eroded** copy of the
 * source's alpha — grow the silhouette by `radiusOut`, shrink it by `radiusIn`,
 * and the ring between the two is the band. The three authored positions are
 * just different radius pairs:
 *
 *   outside → (width, 0)      band beyond the edge, content painted on top
 *   inside  → (0, width)      band eats inward, painted over the content
 *   center  → (width/2, …/2)  band straddles the edge, painted over the content
 *
 * Each position gets its own generated source so it only pays for the half it
 * needs, and so it can early-out over the region where the band cannot appear —
 * an inside band never leaves the silhouette, an outside one never enters it,
 * and those are the majority of the surface the lens is drawn over.
 *
 * Erode samples a second ring at half the radius; a true minimum over the disc
 * would need the interior too, so a feature thinner than the tap spacing can
 * leak through. Dilate needs only the outer ring: the maximum over a disc of a
 * silhouette's alpha is always attained on its boundary.
 *
 * Skia's native `MakeDilate`/`MakeErode` would be exact and cheaper, but they
 * live on the ImageFilter path, whose layer is bounded to the node rect
 * (`transform()` in the render context) — an outside outline on a box-filling
 * shape would be clipped away entirely. A shader scope has no such bound.
 */
function skslFor(position: OutlinePosition, taps: number): string {
    const dilating = position !== "inside";
    const eroding = position !== "outside";
    // An outside band lies under the content; the other two cover its edge.
    const bandOnTop = position !== "outside";

    const step = ((2 * Math.PI) / taps).toFixed(8);

    // Where the band provably cannot land, skip the ring sampling entirely.
    const earlyOut = position === "outside"
        ? "    if (src.a >= 1.0) return src;   // fully inside: no outward band here\n"
        : position === "inside"
            ? "    if (src.a <= 0.0) return src;   // fully outside: no inward band here\n"
            : "";

    return `
uniform shader u_content;    // snapshot of the node's own content (premultiplied)
${dilating ? "uniform float  u_radiusOut;  // dilate distance, device px" : ""}
${eroding ? "uniform float  u_radiusIn;   // erode distance, device px" : ""}
uniform vec4   u_color;      // band colour, straight RGBA

vec4 main(vec2 fragCoord) {
    vec4 src = u_content.eval(fragCoord);
${earlyOut}
    float dilated = src.a;
    float eroded = src.a;
    for (int i = 0; i < ${taps}; i++) {
        float angle = float(i) * ${step};
        vec2 dir = vec2(cos(angle), sin(angle));
${dilating ? "        dilated = max(dilated, u_content.eval(fragCoord + dir * u_radiusOut).a);" : ""}
${eroding ? `        eroded = min(eroded, u_content.eval(fragCoord + dir * u_radiusIn).a);
        eroded = min(eroded, u_content.eval(fragCoord + dir * u_radiusIn * 0.5).a);` : ""}
    }

    float ring = clamp(dilated - eroded, 0.0, 1.0);
    float bandAlpha = ring * u_color.a;
    vec4 band = vec4(u_color.rgb * bandAlpha, bandAlpha);   // premultiplied

    // Source-over of whichever layer this position puts on top.
    vec4 top = ${bandOnTop ? "band" : "src"};
    vec4 bottom = ${bandOnTop ? "src" : "band"};
    return top + bottom * (1.0 - top.a);
}
`;
}

/** Dilate / erode radii in device px for each authored position. */
function radiiFor(position: OutlinePosition, width: number): { out: number; in: number } {
    switch (position) {
        case "inside": return { out: 0, in: width };
        case "center": return { out: width / 2, in: width / 2 };
        default: return { out: width, in: 0 };
    }
}

/**
 * Build the paint shader that draws the node's content with an outline band
 * around its silhouette. Returns null when the effect is a no-op (no width, or
 * a fully transparent colour).
 *
 * `width` is authored in logical px; `scale` lifts it into the device space the
 * shader runs in, so an outline thickens with the node the way a blur radius
 * does rather than staying a fixed number of screen pixels.
 */
export function makeOutlineShader(
    effect: OutlineEffect,
    ck: CanvasKit,
    content: Shader,
    scale: number,
): Shader | null {
    const width = effect.width * scale;
    const color = resolveEffectColor(effect.color);
    if (!(width > 0) || color[3] <= 0) return null;

    const radii = radiiFor(effect.position, width);
    const source = skslFor(effect.position, tapsFor(Math.max(radii.out, radii.in)));
    const runtimeEffect = getOrCompileSkSL(source, ck);
    if (!runtimeEffect) return null;

    // Uniform order must match the declarations the variant actually emitted.
    const radiusUniforms = effect.position === "inside"
        ? [radii.in]
        : effect.position === "center"
            ? [radii.out, radii.in]
            : [radii.out];

    return runtimeEffect.makeShaderWithChildren([...radiusUniforms, ...color], [content]);
}

/**
 * Outline band around the node's own silhouette. Foreground only: a backdrop
 * snapshot covers the whole surface at full alpha, so there is no silhouette
 * there to trace.
 */
export const outlineEffectHandler: EffectHandler<OutlineEffect> = {
    type: "outline",
    sampling: { tileMode: "decal", filterMode: "linear" },
    handles: (_effect, target) => target === "foreground",
    makeShader: (effect, ck, content, geom) => makeOutlineShader(effect, ck, content, geom.scale),
};
