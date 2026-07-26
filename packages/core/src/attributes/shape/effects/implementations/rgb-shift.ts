import type { Vector2 } from "@/attributes/layout/vector2";
import { lerpVector2 } from "@/attributes/layout/vector2";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Per-channel spatial offset — the red/green/blue planes pulled apart along
 * independent vectors.
 *
 * Where `chromaticAberration` models a *lens*, so its fringing is symmetric and
 * driven by one distance and angle, this is the digital-artefact version: each
 * channel is displaced wherever you point it, including all three differently.
 * That freedom is what makes it the RGB-tear component of a glitch, and it is
 * why the two effects coexist rather than one subsuming the other.
 *
 * Offsets are in px and scale with the node, like every other px option.
 */
export interface RgbShiftEffect extends ModedEffect {
    type: "rgbShift";
    /** Red plane offset in px. */
    red: Vector2;
    /** Green plane offset in px. */
    green: Vector2;
    /** Blue plane offset in px. */
    blue: Vector2;
}

const sameVector = (a: Vector2, b: Vector2) => a.x === b.x && a.y === b.y;

export const rgbShiftEffect: EffectData<RgbShiftEffect> = {
    lerp: (from, to, t) => ({
        type: "rgbShift",
        red: lerpVector2(from.red, to.red, t),
        green: lerpVector2(from.green, to.green, t),
        blue: lerpVector2(from.blue, to.blue, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        sameVector(a.red, b.red) &&
        sameVector(a.green, b.green) &&
        sameVector(a.blue, b.blue) &&
        a.mode === b.mode,
    // Samples each channel at a different position.
    surface: "shader",
};
