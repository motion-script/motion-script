import type { EffectGeometry, EffectHandler } from "./handler";
import type { CanvasKit } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type ProgressiveBlurEffect } from "@motion-script/core";

/** Clamp on the tap count — past this the cost stops buying visible smoothness. */
const MAX_SAMPLES = 32;
const MIN_SAMPLES = 2;

/**
 * Build the variable-radius blur shader for a given tap count.
 *
 * The loop bound is **baked into the source** rather than passed as a uniform:
 * SkSL wants a compile-time bound, and `getOrCompileSkSL` is keyed by source, so
 * each distinct tap count compiles once and is then reused. That is also why
 * `samples` snaps rather than interpolating in the effect's `lerp` — tweening it
 * would compile a new shader per frame.
 *
 * Taps are placed on a golden-angle spiral with radius `sqrt(i/n)`. The square
 * root is what makes the disc *uniformly* covered: spacing the radii linearly
 * would crowd the taps at the centre and leave the rim under-sampled, which
 * shows up as a bright core in the blur.
 *
 * The spiral is rotated by a **per-pixel** hashed angle. Without it every pixel
 * samples the same directions, so at any affordable tap count the taps read as
 * discrete ghosts of the source rather than as blur — a hard, structured
 * artefact. Decorrelating the directions turns that into fine noise, which the
 * eye accepts as blur at a fraction of the samples. The hash is of `fragCoord`
 * alone, so it is stable frame to frame: a still node does not shimmer, and a
 * re-render of the same frame is identical.
 *
 * The centre tap is always taken, so a pixel whose ramp is zero returns its
 * source value exactly rather than an average that merely rounds to it.
 *
 * The radius at a pixel is `mix(u_radius0, u_radius, ramp)`, so the ramp runs
 * between two softnesses; `u_radius0 = 0` is the fade-out-of-sharp this effect
 * did before it took a near-end radius.
 */
function source(samples: number): string {
    return `
uniform shader u_content;   // snapshot of the source (premultiplied)
uniform vec2  u_center;     // ramp origin, device px
uniform vec2  u_half;       // node half-extent, device px
uniform vec2  u_dir;        // ramp direction (linear)
uniform float u_radius;     // blur spread at the far end, device px
uniform float u_radius0;    // blur spread at the near end, device px
uniform float u_start;      // 0–1 where the blur starts building
uniform float u_end;        // 0–1 where it reaches u_radius
uniform float u_radial;     // 1 = radial ramp, 0 = linear

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 main(vec2 fragCoord) {
    vec2 half_ = max(u_half, vec2(1.0));
    vec2 p = (fragCoord - u_center) / half_;

    // One scalar drives the ramp, whichever shape it is: distance from the
    // origin, or distance along the ramp direction remapped to 0–1 across the box.
    float t = u_radial > 0.5 ? length(p) : dot(p, u_dir) * 0.5 + 0.5;

    // Smoothstep rather than a linear remap: a linear ramp leaves a visible line
    // at u_start where the blur switches on, because the radius' derivative
    // jumps there. Smoothstep lands both at zero.
    float ramp = smoothstep(u_start, max(u_end, u_start + 0.0001), clamp(t, 0.0, 1.0));
    // Between the two ends, not out of sharp: a ramp that starts blurred is a
    // depth-of-field falloff rather than a fade-to-blur.
    float radius = mix(u_radius0, u_radius, ramp);

    vec4 sum = u_content.eval(fragCoord);
    if (radius < 0.5) return sum;                 // sub-pixel — nothing to average

    const int N = ${samples};
    float jitter = hash(fragCoord) * 6.28318530718;
    for (int i = 1; i <= N; i++) {
        float fi = float(i);
        float ang = fi * 2.39996323 + jitter;     // golden angle, per-pixel rotated
        float rad = radius * sqrt(fi / float(N));
        sum += u_content.eval(fragCoord + vec2(cos(ang), sin(ang)) * rad);
    }
    return sum / float(N + 1);
}
`;
}

/**
 * Blur whose radius ramps across the node.
 *
 * In `mode: 'backdrop'` this is the frosted panel whose blur fades out instead
 * of ending at a hard line — the case a plain backdrop blur cannot express.
 */
export const progressiveBlurEffectHandler: EffectHandler<ProgressiveBlurEffect> = {
    type: "progressiveBlur",
    sampling: { tileMode: "clamp", filterMode: "linear" },

    makeShader(effect, ck: CanvasKit, content, geom: EffectGeometry) {
        const startRadius = effect.startRadius ?? 0;
        if ((effect.radius <= 0 && startRadius <= 0) || geom.width <= 0 || geom.height <= 0) return null;

        const samples = Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, Math.round(effect.samples)));
        const runtimeEffect = getOrCompileSkSL(source(samples), ck);
        if (!runtimeEffect) return null;

        const radians = (effect.angle * Math.PI) / 180;
        const cx = geom.centerX + (effect.center.x - 0.5) * geom.width;
        const cy = geom.centerY + (effect.center.y - 0.5) * geom.height;

        return runtimeEffect.makeShaderWithChildren(
            [
                cx, cy,
                geom.width / 2, geom.height / 2,
                Math.cos(radians), Math.sin(radians),
                effect.radius * geom.scale,
                startRadius * geom.scale,
                effect.start, effect.end,
                effect.shape === "radial" ? 1 : 0,
            ],
            [content],
        );
    },
};
