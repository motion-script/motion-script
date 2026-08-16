import type { EffectGeometry, EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type GlassEffect } from "@motion-script/core";

/**
 * Figma-style glass: the backdrop seen through a bevelled slab, with chromatic
 * dispersion at the rim, an optional frosted blend and a specular highlight
 * along the bevel.
 *
 * Three children, two of which the render context builds on request (see
 * `EffectHandler.renderInputs`). `u_backdrop` is the snapshot of everything
 * painted beneath the node; `u_soft` is the same thing pre-blurred, for the
 * frost blend; and `u_mask` is the node's own silhouette, rasterised
 * white-on-transparent and **Gaussian-blurred**.
 *
 * That last one is the whole trick. Over a filled shape a Gaussian reads 0.5
 * exactly on the outline and climbs to 1 about 2σ inside, so `u_mask.a` *is* a
 * smooth signed distance near the edge and its gradient is the edge normal.
 * That buys a distance field for one blur and, unlike an analytic rounded-rect
 * SDF, it follows whatever the node actually is — an ellipse, a star, a
 * hand-drawn path.
 *
 * Per fragment:
 *
 *   c      = u_mask.a                              // 0.5 on the edge → 1 inside
 *   t      = clamp((c − 0.5) · 2, 0, 1)            // 0 on the edge → 1 at the bevel's foot
 *   u      = 1 − t                                 // bevel weight, 1 on the edge
 *   n      = normalize(−∇c)                        // outward edge normal
 *   N      = vec3(n·u, sqrt(1 − u²))               // surface normal of a quarter-round bevel
 *   offset = n · refraction · u                    // the sideways pull
 *   rgb    = backdrop sampled at ±dispersion around `offset`, per channel
 *   rgb    = mix(rgb, u_soft at `offset`, frost)
 *   out    = specular over rgb
 *
 * `u` doubles as the lateral component of the bevel normal because that is what
 * a quarter-round profile gives: with the surface at height `D·sqrt(1 − u²)` for
 * a bevel of depth `D`, the slope works out to `u / sqrt(1 − u²)`, whose sine —
 * the lateral part of the unit normal — is exactly `u`. So one number shapes the
 * refraction falloff and the lighting, and both go to zero together at the foot
 * of the bevel, which is what keeps the glass from washing its whole interior.
 *
 * Everything is scaled by `u`, so `depth: 0` (σ = 0, a hard mask, `c` = 1
 * everywhere inside) passes the backdrop through untouched — the neutral form
 * the effect tweens on from.
 */

/**
 * How far into the node a `depth` of 100 reaches, as a share of its **short**
 * side's half-extent.
 *
 * The short side rather than each axis, so the bevel is the same width all the
 * way round a wide rectangle rather than an ellipse of falloff; half of that
 * half-extent, because a bevel meeting itself in the middle would leave no flat
 * centre to read the backdrop through, and `depth: 100` is the default.
 */
const DEPTH_SPAN = 0.5;

/** Sideways pull at `refraction: 100`, as a share of the bevel's width. */
const REFRACTION_SPAN = 0.6;

/** Per-channel offset spread at `dispersion: 100`, as a share of the pull. */
const DISPERSION_SPAN = 0.4;

/** Frost blur sigma at `frost: 100`, in logical px. */
const FROST_SPAN = 8;

/** Specular exponent at `splay` 0 (a tight glint) and 100 (a broad rim wash). */
const SHININESS_TIGHT = 48;
const SHININESS_BROAD = 1.5;

/**
 * How head-on the light sits, as the z of its direction vector. Zero would put
 * the light exactly in the plane of the layer, lighting only the sheerest part
 * of the rim; this tips it out of the screen enough to catch the shoulder of the
 * bevel too.
 */
const LIGHT_Z = 0.6;

/** Ceiling on the specular alpha at `lightIntensity: 100`, so a rim never blows out. */
const LIGHT_GAIN = 0.9;

/**
 * The shader source, in a frosted and an unfrosted variant.
 *
 * Two variants rather than one that multiplies by a zero `u_frost`: the frosted
 * one takes a third child and two more uniforms, and most glass in a scene has
 * frost dialled down. Declaring them only where they are read also keeps the
 * uniform array below in step with what each variant actually has.
 */
function skslFor(frosted: boolean): string {
    return `
uniform shader u_backdrop;     // what is painted beneath the node
uniform shader u_mask;         // blurred silhouette: alpha 0.5 on the edge, 1 inside
${frosted ? "uniform shader u_soft;         // the backdrop, pre-blurred for the frost blend" : ""}
uniform float  u_step;         // central-difference step for the mask gradient, device px
uniform float  u_refraction;   // sideways pull at the rim, device px
uniform float  u_dispersion;   // per-channel spread, as a share of the pull
${frosted ? "uniform float  u_frost;        // 0-1 blend toward the blurred backdrop" : ""}
uniform vec3   u_light;        // unit direction toward the light
uniform float  u_shininess;    // specular exponent
uniform float  u_gain;         // specular multiplier

float coverage(vec2 p) {
    return u_mask.eval(p).a;
}

vec4 main(vec2 fragCoord) {
    float c = coverage(fragCoord);

    // 0 on the outline, 1 once the bevel has bottomed out.
    float t = clamp((c - 0.5) * 2.0, 0.0, 1.0);
    float u = 1.0 - t;

    vec2 g = vec2(
        coverage(fragCoord + vec2(u_step, 0.0)) - coverage(fragCoord - vec2(u_step, 0.0)),
        coverage(fragCoord + vec2(0.0, u_step)) - coverage(fragCoord - vec2(0.0, u_step))
    );
    // The mask grows inward, so its gradient points inward; the outward normal
    // is its negation. A flat interior has no gradient to normalize.
    float slope = length(g);
    vec2 n = slope > 1e-5 ? -g / slope : vec2(0.0);

    vec2 offset = n * (u_refraction * u);
    vec2 spread = offset * u_dispersion;

    // Red bends least and blue most, as through a prism. The gap between the
    // three sample positions *is* the dispersion.
    vec4 r = u_backdrop.eval(fragCoord + offset + spread);
    vec4 g2 = u_backdrop.eval(fragCoord + offset);
    vec4 b = u_backdrop.eval(fragCoord + offset - spread);
    vec4 glass = vec4(r.r, g2.g, b.b, g2.a);
${frosted ? `
    // Sampled at the *refracted* position too, so a frosted panel still bends
    // what is behind it rather than flattening to a plain blur.
    glass = mix(glass, u_soft.eval(fragCoord + offset), u_frost);
` : ""}
    vec3 N = vec3(n * u, sqrt(max(0.0, 1.0 - u * u)));
    // Scaled by the bevel weight as well as by the normal: without it the flat
    // interior, whose normal points straight out, takes a uniform wash of light.
    float spec = pow(max(dot(N, u_light), 0.0), u_shininess) * u_gain * u;

    // Source-over of an opaque white highlight, premultiplied — adding it to the
    // colour instead would break the premultiplied invariant wherever the
    // backdrop is transparent.
    float sa = clamp(spec, 0.0, 1.0);
    vec4 highlight = vec4(sa);
    return highlight + glass * (1.0 - sa);
}
`;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Linear blend, for mapping a 0–1 amount onto a pair of tuned endpoints. */
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** How far inward the bevel reaches, in device px. */
function depthPx(effect: GlassEffect, geom: EffectGeometry): number {
    const shortHalf = Math.min(geom.width, geom.height) / 2;
    return clamp01(effect.depth / 100) * DEPTH_SPAN * shortHalf;
}

/** Frost blur sigma in device px, or 0 when the frost is off. */
function frostSigma(effect: GlassEffect, geom: EffectGeometry): number {
    return clamp01(effect.frost / 100) * FROST_SPAN * geom.scale;
}

export const glassEffectHandler: EffectHandler<GlassEffect> = {
    type: "glass",
    // Clamp: a refracted sample that lands off the snapshot should smear the
    // edge pixel rather than punch a hole through the glass.
    sampling: { tileMode: "clamp", filterMode: "linear" },
    // Backdrop only. A node's own paint is what the glass sits *in front of*;
    // there is nothing behind it to bend, and the foreground path's content
    // snapshot has no backdrop in it at all.
    handles: (_effect, target) => target === "backdrop",

    renderInputs(effect, geom) {
        // A Gaussian over a filled shape reaches ~95% coverage about 2σ in,
        // which is where `t` hits 1 and the bevel ends — so σ is half the depth.
        const silhouette = depthPx(effect, geom) / 2;
        // No bevel, no glass. Skip the offscreens entirely rather than rasterise
        // inputs `makeShader` would immediately decline to use.
        if (!(silhouette > 0)) return null;

        const frost = frostSigma(effect, geom);
        return frost > 0 ? { silhouette, blurredSource: frost } : { silhouette };
    },

    makeShader(effect, ck: CanvasKit, backdrop, geom, _extra, built): Shader | null {
        const mask = built?.silhouette;
        // No mask means no clip to trace (a node with no silhouette) or a depth
        // of zero. Either way the bevel is undefined, and a glass with no bevel
        // is a pass-through — leave the backdrop as it is.
        if (!mask) return null;
        if (geom.width <= 0 || geom.height <= 0) return null;

        // Frost needs its pre-blurred copy; if the offscreen for it failed, fall
        // back to the unfrosted variant rather than dropping the whole effect.
        const soft = built?.blurredSource;
        const frost = soft ? clamp01(effect.frost / 100) : 0;

        const depth = depthPx(effect, geom);
        const refraction = clamp01(effect.refraction / 100) * REFRACTION_SPAN * depth;
        const dispersion = clamp01(effect.dispersion / 100) * DISPERSION_SPAN;
        const splay = clamp01(effect.splay / 100);
        const gain = Math.max(0, effect.lightIntensity / 100) * LIGHT_GAIN;

        // Degrees clockwise from the right, in the y-down device space the
        // shader runs in — so 0° lights the right rim and 90° the bottom one,
        // reading the same way the angle does on every other effect.
        const radians = (effect.lightAngle * Math.PI) / 180;
        const lx = Math.cos(radians);
        const ly = Math.sin(radians);
        const len = Math.hypot(lx, ly, LIGHT_Z);

        // The gradient step: a full device pixel at the low end, and a slice of
        // the bevel once it is wide, where a one-pixel difference across a very
        // gentle ramp is mostly quantisation noise.
        const step = Math.max(1, depth * 0.125);

        const runtimeEffect = getOrCompileSkSL(skslFor(frost > 0), ck);
        if (!runtimeEffect) return null;

        return runtimeEffect.makeShaderWithChildren(
            [
                step,
                refraction,
                dispersion,
                ...(frost > 0 ? [frost] : []),
                lx / len, ly / len, LIGHT_Z / len,
                mix(SHININESS_TIGHT, SHININESS_BROAD, splay),
                gain,
            ],
            frost > 0 ? [backdrop, mask, soft!] : [backdrop, mask],
        );
    },
};
