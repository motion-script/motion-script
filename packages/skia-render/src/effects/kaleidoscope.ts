import type { EffectGeometry, EffectHandler } from "./handler";
import { getOrCompileSkSL } from "../sksl-cache";
import { type KaleidoscopeEffect } from "@motion-script/core";

/**
 * Kaleidoscope — the polar angle folded into one wedge, so a single slice of the
 * source is mirrored around the circle.
 *
 * The fold is `abs(mod(a, wedge) − wedge/2)`: the modulo tiles the circle into
 * `segments` wedges, and the `abs` about the wedge's midpoint mirrors each one
 * onto its neighbour. Mirroring rather than merely repeating is what makes the
 * seams continuous — a plain `mod` leaves a hard edge at every wedge boundary
 * because the two sides sample opposite ends of the slice.
 *
 * Radius is left untouched, so the fold is purely angular and the source's own
 * radial structure survives. `u_offset` slides the sampled wedge outward, which
 * pulls different source material into the pattern without moving the node.
 */
const KALEIDOSCOPE_SKSL = `
uniform shader u_content;  // snapshot of the source (premultiplied)
uniform vec2  u_center;    // fold origin, device px
uniform vec2  u_half;      // node half-extent, device px
uniform float u_wedge;     // angular width of one wedge, radians
uniform float u_angle;     // pattern rotation, radians
uniform float u_offset;    // radial offset of the sampled wedge, normalised
uniform float u_amount;    // 0–1 blend from the original to the folded pattern

vec4 main(vec2 fragCoord) {
    vec2 half_ = max(u_half, vec2(1.0));
    vec2 p = (fragCoord - u_center) / half_;   // aspect-normalised

    float r = length(p);
    float a = atan(p.y, p.x) - u_angle;

    // Fold into a single mirrored wedge.
    a = mod(a, u_wedge);
    a = abs(a - u_wedge * 0.5);
    a += u_angle;

    vec2 sampled = vec2(cos(a), sin(a)) * max(r + u_offset, 0.0);
    vec4 folded = u_content.eval(u_center + sampled * half_);

    // Mixing the *sampled colours* rather than the sample positions: blending
    // the coordinates would slide the fold across the image as it ramps, which
    // reads as a warp rather than as the pattern appearing.
    return mix(u_content.eval(fragCoord), folded, u_amount);
}
`;

/** Mirrored-wedge fold over the node's own content, or the backdrop beneath it. */
export const kaleidoscopeEffectHandler: EffectHandler<KaleidoscopeEffect> = {
    type: "kaleidoscope",
    // Decal: a fold can point outside the node, and the honest answer there is
    // "nothing was drawn", not a smeared edge pixel repeated around the rim.
    sampling: { tileMode: "decal", filterMode: "linear" },

    makeShader(effect, ck, content, geom: EffectGeometry) {
        const segments = Math.round(effect.segments);
        if (segments < 2 || effect.amount <= 0) return null;
        if (geom.width <= 0 || geom.height <= 0) return null;

        const runtimeEffect = getOrCompileSkSL(KALEIDOSCOPE_SKSL, ck);
        if (!runtimeEffect) return null;

        const cx = geom.centerX + (effect.center.x - 0.5) * geom.width;
        const cy = geom.centerY + (effect.center.y - 0.5) * geom.height;

        return runtimeEffect.makeShaderWithChildren(
            [
                cx, cy,
                geom.width / 2, geom.height / 2,
                (2 * Math.PI) / segments,
                (effect.angle * Math.PI) / 180,
                effect.offset,
                Math.max(0, Math.min(1, effect.amount)),
            ],
            [content],
        );
    },
};
