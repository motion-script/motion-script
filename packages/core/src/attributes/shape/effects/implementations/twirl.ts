import { lerpNumber } from "@/tween/lerp";
import { lerpVector2, type Vector2 } from "@/attributes/layout/vector2";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Twirl / swirl — the content is rotated about `center` by an amount that falls
 * off with distance, so the middle spins and the rim stays put.
 *
 * The falloff is what separates this from simply rotating the node: rotation is
 * rigid, this shears. Everything inside `radius` twists by a fraction of `angle`
 * that reaches full strength at the centre and zero at the rim, which is what
 * makes it read as a vortex rather than a transform.
 *
 * Animating `angle` past a full turn keeps winding — there is no wrap point, so
 * a long tween produces an ever-tightening spiral.
 */
export interface TwirlEffect extends ModedEffect {
    type: "twirl";
    /** Rotation at the centre in degrees. Negative twirls the other way. 0 = off. */
    angle: number;
    /** 0–1 radius of influence, as a fraction of the node's half-extent. */
    radius: number;
    /** Vortex centre in 0–1 layer coords. */
    center: Vector2;
}

export const twirlEffect: EffectData<TwirlEffect> = {
    lerp: (from, to, t) => ({
        type: "twirl",
        angle: lerpNumber(from.angle, to.angle, t),
        radius: lerpNumber(from.radius, to.radius, t),
        center: lerpVector2(from.center, to.center, t),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.angle === b.angle &&
        a.radius === b.radius &&
        a.center.x === b.center.x &&
        a.center.y === b.center.y &&
        a.mode === b.mode,
    // Resamples the source at a rotated position.
    surface: "shader",
};
