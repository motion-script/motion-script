import type { EffectGeometry, EffectHandler } from "./handler";
import { getOrCompileSkSL } from "../sksl-cache";
import { type TwirlEffect } from "@motion-script/core";

/**
 * Twirl — a rotation about the centre whose angle falls off with distance.
 *
 * The falloff is `(1 − r/radius)²`, smooth at the rim: a linear falloff leaves a
 * visible crease where the twirl stops, because the *derivative* jumps there
 * even though the angle reaches zero. Squaring it lands both at zero.
 *
 * Coordinates are normalised by the node's half-extent before rotating and
 * scaled back afterwards, so the vortex is round on a non-square node instead of
 * being stretched into an ellipse by the aspect ratio.
 */
const TWIRL_SKSL = `
uniform shader u_content;  // snapshot of the source (premultiplied)
uniform vec2  u_center;    // vortex centre, device px
uniform vec2  u_half;      // node half-extent, device px
uniform float u_angle;     // rotation at the centre, radians
uniform float u_radius;    // 0–1 radius of influence, in normalised units

vec4 main(vec2 fragCoord) {
    vec2 half_ = max(u_half, vec2(1.0));
    vec2 p = (fragCoord - u_center) / half_;   // aspect-normalised
    float r = length(p);
    if (r >= u_radius) return u_content.eval(fragCoord);

    float falloff = 1.0 - r / max(u_radius, 0.0001);
    float a = u_angle * falloff * falloff;

    float c = cos(a);
    float s = sin(a);
    vec2 rotated = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

    return u_content.eval(u_center + rotated * half_);
}
`;

/** Twirl / swirl vortex over the node's own content, or the backdrop beneath it. */
export const twirlEffectHandler: EffectHandler<TwirlEffect> = {
    type: "twirl",
    sampling: { tileMode: "clamp", filterMode: "linear" },

    makeShader(effect, ck, content, geom: EffectGeometry) {
        if (effect.angle === 0 || effect.radius <= 0) return null;
        if (geom.width <= 0 || geom.height <= 0) return null;

        const runtimeEffect = getOrCompileSkSL(TWIRL_SKSL, ck);
        if (!runtimeEffect) return null;

        const cx = geom.centerX + (effect.center.x - 0.5) * geom.width;
        const cy = geom.centerY + (effect.center.y - 0.5) * geom.height;

        return runtimeEffect.makeShaderWithChildren(
            [
                cx, cy,
                geom.width / 2, geom.height / 2,
                (effect.angle * Math.PI) / 180,
                effect.radius,
            ],
            [content],
        );
    },
};
