import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Photographic tonal and colour adjustments as a **scene effect** — the grading
 * panel `ImageFilters.colorAdjustment` gives an image fill, now available on any
 * node. All fields are optional and default to neutral.
 *
 * Shares its type name and renderer handler with `ColorAdjustmentFilter` (the
 * media-fill filter) with one deliberate difference: no `vignette` field. That
 * knob was never implemented on the filter — a vignette needs each pixel's
 * position, which a colour matrix does not have — so the scene effect leaves it
 * out and `Effects.vignette()` provides the real thing.
 */
export interface ColorAdjustmentEffect extends ModedEffect {
    type: "colorAdjustment";
    /** −1…1 (0 = unchanged). Shifts overall lightness without clipping the way exposure does. */
    brightness?: number;
    /** 0…2 (1 = unchanged). Spreads highlights and shadows further apart. */
    contrast?: number;
    /** 0…3 (1 = unchanged). Scales colour saturation uniformly. */
    saturation?: number;
    /** −1…1 (0 = unchanged). Boosts muted colours more than already-vivid ones. */
    vibrance?: number;
    /** −1…1 (0 = unchanged). Lifts or crushes the shadow end. */
    shadows?: number;
    /** −1…1 (0 = unchanged). Brightens or rolls off the highlight end. */
    highlights?: number;
    /** −1…1 (0 = unchanged). Negative = cool/blue, positive = warm/orange. */
    temperature?: number;
    /** −1…1 (0 = unchanged). Negative = green, positive = magenta. */
    tint?: number;
}

export const colorAdjustmentEffect: EffectData<ColorAdjustmentEffect> = {
    lerp: (from, to, t) => ({
        type: "colorAdjustment",
        brightness: lerpNumber(from.brightness ?? 0, to.brightness ?? 0, t),
        contrast: lerpNumber(from.contrast ?? 1, to.contrast ?? 1, t),
        saturation: lerpNumber(from.saturation ?? 1, to.saturation ?? 1, t),
        vibrance: lerpNumber(from.vibrance ?? 0, to.vibrance ?? 0, t),
        shadows: lerpNumber(from.shadows ?? 0, to.shadows ?? 0, t),
        highlights: lerpNumber(from.highlights ?? 0, to.highlights ?? 0, t),
        temperature: lerpNumber(from.temperature ?? 0, to.temperature ?? 0, t),
        tint: lerpNumber(from.tint ?? 0, to.tint ?? 0, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.brightness === b.brightness &&
        a.contrast === b.contrast &&
        a.saturation === b.saturation &&
        a.vibrance === b.vibrance &&
        a.shadows === b.shadows &&
        a.highlights === b.highlights &&
        a.temperature === b.temperature &&
        a.tint === b.tint &&
        a.mode === b.mode,
};
