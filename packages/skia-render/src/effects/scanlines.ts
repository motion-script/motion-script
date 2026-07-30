import type { EffectGeometry, EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type ScanlinesEffect } from "@motion-script/core";

/**
 * CRT scanlines — periodic dark bands across the content.
 *
 * The band profile is a smoothstep pair rather than a hard `step`: at typical
 * spacings (4–6 device px) a hard edge aliases into a moiré against the pixel
 * grid the moment the node moves or scales. Softening by half a pixel either
 * side costs nothing and keeps the pattern stable in motion.
 *
 * Bands are measured from the node's centre, so they travel with the node
 * rather than the node sliding underneath a screen-fixed pattern, and `offset`
 * is applied before the modulo so it wraps — a linear tween of `offset` rolls
 * the pattern forever without a seam.
 */
const SCANLINES_SKSL = `
uniform shader u_content;    // snapshot of the source (premultiplied)
uniform vec2   u_center;     // band origin, device px
uniform float  u_spacing;    // period, device px
uniform float  u_thickness;  // 0–1 share of the period the band covers
uniform float  u_darkness;   // 0–1 how far the band darkens
uniform float  u_offset;     // band phase, device px
uniform float  u_cos;        // band axis, precomputed
uniform float  u_sin;

vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    if (c.a <= 0.0) return c;

    vec2 d = fragCoord - u_center;
    float across = -d.x * u_sin + d.y * u_cos;    // distance along the band normal

    float period = max(u_spacing, 1.0);
    float phase = mod(across + u_offset, period) / period;   // 0–1 within the period

    // Dark band centred on phase 0.5, 'thickness' wide, with a half-pixel ramp.
    // ('half' is an SkSL type, so the local can't be called that.)
    float reach = clamp(u_thickness, 0.0, 1.0) * 0.5;
    float aa = 0.5 / period;
    float band = smoothstep(0.5 - reach - aa, 0.5 - reach + aa, phase)
               - smoothstep(0.5 + reach - aa, 0.5 + reach + aa, phase);

    float lit = 1.0 - band * clamp(u_darkness, 0.0, 1.0);
    return vec4(c.rgb * lit, c.a);   // premultiplied: scaling rgb dims, keeps alpha
}
`;

/**
 * Build the paint shader that draws the source with scanlines over it. Returns
 * null when the bands are invisible (no darkness, or a sub-pixel period).
 */
export function makeScanlinesShader(
    effect: ScanlinesEffect,
    ck: CanvasKit,
    content: Shader,
    geom: EffectGeometry,
): Shader | null {
    const spacing = effect.spacing * geom.scale;
    if (!(effect.darkness > 0) || !(spacing >= 1)) return null;

    const runtimeEffect = getOrCompileSkSL(SCANLINES_SKSL, ck);
    if (!runtimeEffect) return null;

    const radians = (effect.angle * Math.PI) / 180;

    return runtimeEffect.makeShaderWithChildren(
        [
            geom.centerX, geom.centerY,
            spacing,
            effect.thickness,
            effect.darkness,
            effect.offset * geom.scale,
            Math.cos(radians), Math.sin(radians),
        ],
        [content],
    );
}

/** CRT scanlines, on the node's own content or on the backdrop beneath it. */
export const scanlinesEffectHandler: EffectHandler<ScanlinesEffect> = {
    type: "scanlines",
    sampling: { tileMode: "decal", filterMode: "linear" },
    makeShader: (effect, ck, content, geom) => makeScanlinesShader(effect, ck, content, geom),
};
