import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Two-tone cut: every pixel brighter than `level` becomes white, everything
 * else black — the stencil / high-contrast look.
 *
 * `smoothness` widens the cut into a ramp centred on `level`, which both
 * anti-aliases the boundary and, at higher values, keeps some midtone
 * modelling instead of a pure stencil.
 */
export interface ThresholdEffect extends ModedEffect {
    type: "threshold";
    /** 0–1 luminance cut point. */
    level: number;
    /** 0–1 width of the ramp around the cut; 0 is a hard, aliased edge. */
    smoothness: number;
}

export const thresholdEffect: EffectData<ThresholdEffect> = {
    lerp: (from, to, t) => ({
        type: "threshold",
        level: lerpNumber(from.level, to.level, t),
        smoothness: lerpNumber(from.smoothness, to.smoothness, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) => a.level === b.level && a.smoothness === b.smoothness && a.mode === b.mode,
    // A non-linear per-pixel remap; no LUT colour filter in this CanvasKit build.
    surface: "shader",
};
