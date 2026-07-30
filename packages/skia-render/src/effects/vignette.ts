import type { EffectGeometry, EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { resolveEffectColor, type VignetteEffect } from "@motion-script/core";

/**
 * Lens-style edge falloff.
 *
 * Positions are normalised by the node's half-extent, so `r` is 1 at the middle
 * of each edge and √2 at the corners *whatever the aspect ratio* — the darkening
 * follows the box rather than an off-centre circle, which is what makes it read
 * as a lens and not as a spotlight. A smoothstep from `radius` to
 * `radius + softness` ramps the tint in, reaching `amount` at the outside.
 *
 * The tint is a mix toward `u_color` rather than a multiply, so a white (or any
 * coloured) vignette works as naturally as the classic black one. Fully
 * transparent pixels return early, keeping the effect inside the silhouette.
 */
const VIGNETTE_SKSL = `
uniform shader u_content;   // snapshot of the source (premultiplied)
uniform vec2   u_center;    // box centre, device px
uniform vec2   u_half;      // box half-extent, device px
uniform vec4   u_color;     // tint colour, straight RGBA (alpha scales the tint)
uniform float  u_amount;    // tint strength at the outside
uniform float  u_radius;    // normalised radius where the ramp starts
uniform float  u_softness;  // normalised ramp width

vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    if (c.a <= 0.0) return c;

    vec2 p = (fragCoord - u_center) / max(u_half, vec2(1.0));
    float r = length(p);

    float inner = u_radius;
    float outer = u_radius + max(u_softness, 0.001);
    float falloff = smoothstep(inner, outer, r) * u_amount * u_color.a;

    vec3 base = c.rgb / c.a;                       // un-premultiply
    vec3 tinted = mix(base, u_color.rgb, clamp(falloff, 0.0, 1.0));
    return vec4(tinted * c.a, c.a);                // re-premultiply
}
`;

/**
 * Build the paint shader that draws the source with its edges tinted toward
 * `color`. Returns null when the effect is a no-op (no strength, transparent
 * tint, or a degenerate box).
 */
export function makeVignetteShader(
    effect: VignetteEffect,
    ck: CanvasKit,
    content: Shader,
    geom: EffectGeometry,
): Shader | null {
    const color = resolveEffectColor(effect.color);
    if (effect.amount <= 0 || color[3] <= 0) return null;
    if (geom.width <= 0 || geom.height <= 0) return null;

    const runtimeEffect = getOrCompileSkSL(VIGNETTE_SKSL, ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren(
        [
            geom.centerX, geom.centerY,
            geom.width / 2, geom.height / 2,
            color[0], color[1], color[2], color[3],
            effect.amount, effect.radius, effect.softness,
        ],
        [content],
    );
}

/**
 * Vignette. Serves both targets from the same shader — a backdrop vignette
 * darkens the corners of whatever the node sits over, clipped to its silhouette.
 */
export const vignetteEffectHandler: EffectHandler<VignetteEffect> = {
    type: "vignette",
    sampling: { tileMode: "decal", filterMode: "linear" },
    makeShader: (effect, ck, content, geom) => makeVignetteShader(effect, ck, content, geom),
};
