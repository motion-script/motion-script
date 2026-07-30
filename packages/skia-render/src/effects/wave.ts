import type { EffectGeometry, EffectHandler } from "./handler";
import { getOrCompileSkSL } from "../sksl-cache";
import { type WaveEffect } from "@motion-script/core";

/**
 * Sine displacement — the content resampled at a position offset by a sine of
 * its own coordinate.
 *
 * The phase argument is built from a single scalar `t` so both shapes share one
 * sine: for `linear`, `t` is the distance along the travel direction; for
 * `radial`, it is the distance from the centre. That is the only difference
 * between a flag and a pond ripple.
 *
 * `u_phase` arrives in radians already wrapped by the caller, so a linear tween
 * of the authored degrees loops seamlessly and never accumulates float error at
 * large values.
 *
 * Note the offset is *not* scaled by the local sine's derivative — a true
 * physical warp would displace along the surface normal, but the eye reads a
 * plain per-axis offset as the same thing at these amplitudes, and it costs one
 * sine instead of two.
 */
const WAVE_SKSL = `
uniform shader u_content;     // snapshot of the source (premultiplied)
uniform vec2   u_center;      // ripple origin, device px
uniform vec2   u_amplitude;   // peak displacement per axis, device px
uniform float  u_wavelength;  // distance between crests, device px
uniform float  u_phase;       // radians, pre-wrapped
uniform float  u_cos;         // travel direction, precomputed
uniform float  u_sin;
uniform float  u_radial;      // 1 = concentric rings, 0 = parallel bands

vec4 main(vec2 fragCoord) {
    vec2 d = fragCoord - u_center;
    // Distance along the travel axis, or from the origin — the one scalar the
    // sine is taken of.
    float t = u_radial > 0.5 ? length(d) : dot(d, vec2(u_cos, u_sin));

    float k = 6.28318530718 / max(u_wavelength, 1.0);
    float wave = sin(t * k + u_phase);

    return u_content.eval(fragCoord + u_amplitude * wave);
}
`;

/** Sine warp over the node's own content, or over the backdrop beneath it. */
export const waveEffectHandler: EffectHandler<WaveEffect> = {
    type: "wave",
    // Clamp, not decal: a sample pushed just past the edge should smear the edge
    // pixel rather than tear a transparent notch out of the silhouette.
    sampling: { tileMode: "clamp", filterMode: "linear" },

    makeShader(effect, ck, content, geom: EffectGeometry) {
        const { x: ax, y: ay } = effect.amplitude;
        if ((ax === 0 && ay === 0) || geom.width <= 0 || geom.height <= 0) return null;

        const runtimeEffect = getOrCompileSkSL(WAVE_SKSL, ck);
        if (!runtimeEffect) return null;

        const radians = (effect.angle * Math.PI) / 180;
        // Wrap here rather than in the shader so a long `phase` tween stays
        // precise: sin() of a large float loses resolution well before the
        // author would notice the tween itself drifting.
        const phase = (((effect.phase % 360) + 360) % 360) * Math.PI / 180;

        const cx = geom.centerX + (effect.center.x - 0.5) * geom.width;
        const cy = geom.centerY + (effect.center.y - 0.5) * geom.height;

        return runtimeEffect.makeShaderWithChildren(
            [
                cx, cy,
                ax * geom.scale, ay * geom.scale,
                Math.max(effect.wavelength, 0.01) * geom.scale,
                phase,
                Math.cos(radians), Math.sin(radians),
                effect.shape === "radial" ? 1 : 0,
            ],
            [content],
        );
    },
};
