import type { EffectGeometry, EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "./sksl-cache";
import { type GodRaysEffect } from "@motion-script/core";

const MIN_SAMPLES = 4;
const MAX_SAMPLES = 48;

/**
 * Crepuscular rays: march from each pixel toward the light, accumulating only
 * what is brighter than `threshold`, and screen the result over the source.
 *
 * The threshold is what separates this from `radialBlur`. Radial blur smears
 * everything, so the occluder softens along with the light; here the dim pixels
 * contribute nothing, so the occluder stays sharp and only the bright parts
 * travel — which is what makes light appear to stream *past* something.
 *
 * Screening rather than adding keeps the result from blowing out: a bright area
 * that already reads as white cannot get whiter.
 *
 * The tap count is baked into the source rather than passed as a uniform: SkSL
 * wants constant loop bounds, and `getOrCompileSkSL` keys on source text so each
 * distinct count compiles once.
 */
function skslFor(samples: number): string {
    return `
uniform shader u_content;    // snapshot of the source (premultiplied)
uniform vec2   u_light;      // light source, device px
uniform float  u_length;     // ray reach, fraction of the distance to the light
uniform float  u_threshold;  // 0–1 luminance cutoff
uniform float  u_decay;      // per-step falloff
uniform float  u_intensity;  // additive multiplier

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

/** Straight colour of a tap, zeroed unless it clears the threshold. */
vec3 bright(vec2 p) {
    vec4 c = u_content.eval(p);
    if (c.a <= 0.0) return vec3(0.0);
    vec3 base = c.rgb / c.a;
    float lum = dot(base, LUMA);
    // Rescale rather than gate, so the rays fade in with the light instead of
    // switching on at the cutoff.
    float keep = max(lum - u_threshold, 0.0) / max(1.0 - u_threshold, 0.0001);
    return base * keep;
}

vec4 main(vec2 fragCoord) {
    vec4 src = u_content.eval(fragCoord);

    // Step from this pixel toward the light, a fraction of the way each time.
    vec2 delta = (u_light - fragCoord) * (u_length / ${samples}.0);

    // Start each pixel a random fraction of a step along. Marching every pixel
    // from the same offset makes the sample positions line up into concentric
    // arcs — visible banding at any affordable tap count. Dithering the start
    // trades those arcs for fine noise, which reads as light rather than as
    // artefact, and costs one hash.
    float jitter = fract(sin(dot(fragCoord, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 pos = fragCoord + delta * jitter;

    float weight = 1.0;
    vec3 rays = vec3(0.0);

    for (int i = 0; i < ${samples}; i++) {
        pos += delta;
        rays += bright(pos) * weight;
        weight *= u_decay;
    }
    rays = rays / ${samples}.0 * u_intensity;

    // Screen onto the source, in straight colour, then re-premultiply.
    vec3 base = src.a > 0.0 ? src.rgb / src.a : vec3(0.0);
    vec3 lit = 1.0 - (1.0 - base) * (1.0 - clamp(rays, 0.0, 1.0));

    // Rays land outside the silhouette too — that is the point of light
    // streaming past an occluder — so the alpha grows to carry them.
    float glow = clamp(max(rays.r, max(rays.g, rays.b)), 0.0, 1.0);
    float a = max(src.a, glow);
    return vec4(lit * a, a);
}
`;
}

/**
 * Build the paint shader that streams light from `center`. Returns null when
 * the effect is a no-op (no intensity, no reach, or a degenerate box).
 */
export function makeGodRaysShader(
    effect: GodRaysEffect,
    ck: CanvasKit,
    content: Shader,
    geom: EffectGeometry,
): Shader | null {
    if (!(effect.intensity > 0) || !(effect.length > 0)) return null;
    if (geom.width <= 0 || geom.height <= 0) return null;

    const samples = Math.round(Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, effect.samples)));
    const runtimeEffect = getOrCompileSkSL(skslFor(samples), ck);
    if (!runtimeEffect) return null;

    // `center` is authored in 0–1 layer coords; offset the box centre by how far
    // it sits from the middle, in device px (the mapping bulge/magnify use).
    const lx = geom.centerX + (effect.center.x - 0.5) * geom.width;
    const ly = geom.centerY + (effect.center.y - 0.5) * geom.height;

    return runtimeEffect.makeShaderWithChildren(
        [lx, ly, effect.length, effect.threshold, effect.decay, effect.intensity],
        [content],
    );
}

/** God rays, on the node's own content or on the backdrop beneath it. */
export const godRaysEffectHandler: EffectHandler<GodRaysEffect> = {
    type: "godRays",
    sampling: { tileMode: "decal", filterMode: "linear" },
    makeShader: (effect, ck, content, geom) => makeGodRaysShader(effect, ck, content, geom),
};
