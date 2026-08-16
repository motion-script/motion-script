import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Figma-style glass: the backdrop seen through a bevelled slab of glass.
 *
 * Every option is a **0–100 amount** rather than a physical quantity, and the
 * renderer maps each onto a device-px figure derived from the node's own size
 * (see `skia-render/src/effects/glass.ts`). That is deliberate, and it is what
 * makes the Figma defaults — everything at 100 — a sane starting point instead
 * of an extreme one: a 100 that meant "100 px of bevel" would swallow a small
 * node whole and be invisible on a large one, whereas a 100 that means "the full
 * bevel this node's size affords" reads the same at any scale.
 *
 * The exception is {@link lightAngle}, which is degrees like every other angle
 * in the effect vocabulary.
 *
 * Glass only has meaning on the **backdrop** — there is nothing to refract in a
 * node's own paint — so `Effects.glass()` defaults `mode` to `'backdrop'` and the
 * renderer's handler serves that target only.
 */
export interface GlassEffect extends ModedEffect {
    type: "glass";
    /**
     * Direction the light arrives from, in degrees, measured clockwise from the
     * right (screen space, y-down) — so 0 lights the right rim, 90 the bottom.
     * Matches the `angle` convention every other effect uses.
     */
    lightAngle: number;
    /** 0–100 brightness of the specular rim highlight. */
    lightIntensity: number;
    /** 0–100 magnitude of the sideways pull applied along the edge normal. */
    refraction: number;
    /** 0–100 how far inward the bevel extends, as a share of the node's short side. */
    depth: number;
    /** 0–100 spread between the R/G/B sample offsets — chromatic aberration. */
    dispersion: number;
    /** 0–100 blend weight toward a blurred copy of the refracted backdrop. */
    frost: number;
    /**
     * 0–100 spread of the specular highlight: 0 is a tight glint, 100 a broad
     * rim wash. The inverse of shininess, which is what the renderer converts it
     * to.
     */
    splay: number;
}

export const glassEffect: EffectData<GlassEffect> = {
    lerp: (from, to, t) => ({
        type: "glass",
        lightAngle: lerpNumber(from.lightAngle, to.lightAngle, t),
        lightIntensity: lerpNumber(from.lightIntensity, to.lightIntensity, t),
        refraction: lerpNumber(from.refraction, to.refraction, t),
        depth: lerpNumber(from.depth, to.depth, t),
        dispersion: lerpNumber(from.dispersion, to.dispersion, t),
        frost: lerpNumber(from.frost, to.frost, t),
        splay: lerpNumber(from.splay, to.splay, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.lightAngle === b.lightAngle &&
        a.lightIntensity === b.lightIntensity &&
        a.refraction === b.refraction &&
        a.depth === b.depth &&
        a.dispersion === b.dispersion &&
        a.frost === b.frost &&
        a.splay === b.splay &&
        a.mode === b.mode,
    // Resamples the backdrop through a bevel, three times per fragment.
    surface: "shader",
};
