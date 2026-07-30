import type { EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type ThresholdEffect } from "@motion-script/core";

/**
 * Two-tone luminance cut.
 *
 * `smoothness` is halved into a half-width either side of `level`, so the ramp
 * stays centred on the authored cut point as it widens — the boundary softens
 * symmetrically instead of drifting brighter. At zero it degenerates to a hard
 * `step`, which is aliased by construction; the default leaves just enough ramp
 * to antialias the boundary.
 *
 * (A LUT colour filter would be the natural fit — `MakeTableARGB` is absent from
 * this CanvasKit build, hence the shader.)
 */
const THRESHOLD_SKSL = `
uniform shader u_content;     // snapshot of the source (premultiplied)
uniform float  u_level;       // 0–1 cut point
uniform float  u_smoothness;  // 0–1 ramp width

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    if (c.a <= 0.0) return c;

    vec3 base = c.rgb / c.a;                       // un-premultiply
    float l = dot(base, LUMA);

    float halfWidth = max(u_smoothness, 0.0) * 0.5;
    float v = halfWidth <= 0.0
        ? step(u_level, l)
        : smoothstep(u_level - halfWidth, u_level + halfWidth, l);

    return vec4(vec3(v) * c.a, c.a);               // re-premultiply
}
`;

/**
 * Build the paint shader that cuts the source to black and white at `level`.
 * Always renders — unlike most effects there is no neutral setting, since even
 * `level: 0` (everything white) is a meaningful result.
 */
export function makeThresholdShader(
    effect: ThresholdEffect,
    ck: CanvasKit,
    content: Shader,
): Shader | null {
    const runtimeEffect = getOrCompileSkSL(THRESHOLD_SKSL, ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren([effect.level, effect.smoothness], [content]);
}

/** Luminance threshold, on the node's own content or on the backdrop. */
export const thresholdEffectHandler: EffectHandler<ThresholdEffect> = {
    type: "threshold",
    sampling: { tileMode: "decal", filterMode: "nearest" },
    makeShader: (effect, ck, content) => makeThresholdShader(effect, ck, content),
};
