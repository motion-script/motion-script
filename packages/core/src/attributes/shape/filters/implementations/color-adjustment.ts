import { FilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/**
 * A collection of photographic-style tonal and color adjustments.
 * All fields are optional; omitted fields use their neutral default.
 */
export interface ColorAdjustmentFilter {
    type: 'colorAdjustment';
    /** -1 to 1 (0 = unchanged). Shifts the overall lightness without clipping like exposure does. */
    brightness?: number;
    /** 0 to 2 (1 = unchanged). Spreads highlights and shadows further apart. */
    contrast?: number;
    /** 0 to 3 (1 = unchanged). Scales color saturation uniformly. */
    saturation?: number;
    /** -1 to 1 (0 = unchanged). Boosts muted colors more than vibrant ones. */
    vibrance?: number;
    /** -1 to 1 (0 = unchanged). Lifts or crushes shadow regions. */
    shadows?: number;
    /** -1 to 1 (0 = unchanged). Brightens or dims highlight regions. */
    highlights?: number;
    /** -1 to 1 (0 = unchanged). Negative = cool (blue), positive = warm (orange). */
    temperature?: number;
    /** -1 to 1 (0 = unchanged). Negative = green shift, positive = magenta shift. */
    tint?: number;
    /** 0 to 1 (0 = none). Darkens the edges of the frame. */
    vignette?: number;
}

FilterRegistry.register<ColorAdjustmentFilter>("colorAdjustment", {
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
        vignette: lerpNumber(from.vignette ?? 0, to.vignette ?? 0, t),
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
        a.vignette === b.vignette,
});
