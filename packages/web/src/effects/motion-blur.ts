import type { CanvasKit } from "@motion-script/canvaskit";
import type { EffectHandler } from "./handler";
import {
    type MotionBlurEffect,
    type Vector2,
    resolveEffectAxis,
    resolveMotionBlurAlignment,
} from "@motion-script/core";

/**
 * A {@link MotionBlurEffect} resolved against a node's actual velocity into a
 * concrete directional smear the renderer can draw. Produced in
 * `WebRenderContext.transform()` (which has the velocity) and registered under
 * `'motionBlurResolved'`; the authored `motionBlur` effect never reaches
 * CanvasKit directly.
 */
export interface MotionBlurResolved {
    type: "motionBlurResolved";
    /** Smear axis angle in degrees (0 = horizontal), matching the directional-blur convention. */
    angle: number;
    /** Smear length in pixels along `angle`. 0 = no blur. */
    radius: number;
    /** Shutter phase in −1…1 — offsets the smear centre relative to the node's position. */
    phase: number;
    /** Renderer quality hint — multi-tap accumulation kicks in above {@link SAMPLE_THRESHOLD}. */
    samples: number;
}

/** Above this `samples` count, switch from the cheap continuous blur to discrete multi-tap accumulation. */
export const SAMPLE_THRESHOLD = 32;

/** Largest tap count we will actually accumulate, to bound per-node filter cost. */
const MAX_TAPS = 64;

/**
 * Resolve a {@link MotionBlurEffect} against a node's per-frame velocity into a
 * {@link MotionBlurResolved} (or `null` when the smear would be empty). Pure /
 * CanvasKit-free so it is unit-testable.
 *
 * `disp = velocity * dt` is the node's displacement this frame; `length/100` is
 * the shutter fraction (100% ≈ 360° = the full displacement), scaled per-axis by
 * `axis` and by `strength`. The result's `angle`/`radius` are the polar
 * form of that smear vector.
 */
export function resolveMotionBlur(
    effect: MotionBlurEffect,
    velocity: Vector2,
    dt: number,
): MotionBlurResolved | null {
    if (dt <= 0 || effect.strength <= 0 || effect.length <= 0) return null;

    const axis = resolveEffectAxis(effect.axis);
    const shutter = effect.length / 100;

    // Displacement this frame, axis-scaled, then weighted by shutter + strength.
    const sx = velocity.x * dt * axis.x * shutter * effect.strength;
    const sy = velocity.y * dt * axis.y * shutter * effect.strength;

    const radius = Math.hypot(sx, sy);
    if (radius < 0.01) return null;

    return {
        type: "motionBlurResolved",
        angle: (Math.atan2(sy, sx) * 180) / Math.PI,
        radius,
        phase: resolveMotionBlurAlignment(effect.alignment),
        samples: effect.samples,
    };
}

/**
 * Renders a {@link MotionBlurResolved} smear.
 *
 * Default (continuous) path mirrors {@link directionalBlurEffectHandler}:
 * rotate the layer so the smear axis lands on X, blur anisotropically
 * (`sigmaX = radius/2`, `sigmaY = 0`), then rotate back with the inverse
 * matrix so only the kernel ends up rotated. A `phase` shutter offset is applied
 * as an extra translation along the smear direction.
 *
 * When `samples` exceeds {@link SAMPLE_THRESHOLD}, an After Effects-style
 * multi-tap path is used instead: N copies of the layer offset evenly along the
 * smear vector, each scaled to `1/N` alpha and summed (`BlendMode.Plus`), giving
 * the characteristic discrete-step look. Cost is O(samples), so it is gated.
 */
export const motionBlurEffectHandler: EffectHandler<MotionBlurResolved> = {
    type: "motionBlurResolved",

    makeImageFilter(effect, ck) {
        if (effect.radius <= 0) return null;

        const rad = (effect.angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Shutter phase shifts the smear centre along the motion direction by up
        // to ±half its length (behind ⇢ ahead of the node's current position).
        const phaseShift = (effect.phase * effect.radius) / 2;
        const phaseDx = cos * phaseShift;
        const phaseDy = sin * phaseShift;

        const taps = Math.min(Math.round(effect.samples), MAX_TAPS);
        if (taps > SAMPLE_THRESHOLD) {
            return makeMultiTap(effect, ck, cos, sin, phaseDx, phaseDy, taps);
        }
        return makeContinuous(effect, ck, cos, sin, phaseDx, phaseDy);
    }
};

/** Continuous anisotropic-blur smear (cheap; ignores sample count). */
function makeContinuous(
    effect: MotionBlurResolved,
    ck: CanvasKit,
    cos: number,
    sin: number,
    phaseDx: number,
    phaseDy: number,
): any {
    const sigma = effect.radius / 2;
    const linear = { filter: ck.FilterMode.Linear };

    // Source, optionally shifted by the shutter phase.
    const base = phaseDx !== 0 || phaseDy !== 0
        ? ck.ImageFilter.MakeOffset(phaseDx, phaseDy, null)
        : null;

    // Rotate by -angle so the smear axis lands on X.
    const rotateForward = ck.ImageFilter.MakeMatrixTransform(
        [cos, sin, 0, -sin, cos, 0, 0, 0, 1],
        linear,
        base,
    );
    base?.delete();

    const blur = ck.ImageFilter.MakeBlur(sigma, 0, ck.TileMode.Decal, rotateForward);
    rotateForward.delete();

    // Rotate back by +angle (inverse of the forward rotation).
    const rotateBack = ck.ImageFilter.MakeMatrixTransform(
        [cos, -sin, 0, sin, cos, 0, 0, 0, 1],
        linear,
        blur,
    );
    blur.delete();

    return rotateBack;
}

/** Discrete multi-tap accumulation (After Effects' samples-per-frame look). */
function makeMultiTap(
    effect: MotionBlurResolved,
    ck: CanvasKit,
    cos: number,
    sin: number,
    phaseDx: number,
    phaseDy: number,
    taps: number,
): any {
    const half = effect.radius / 2;
    // Scale each tap's alpha to 1/taps so summing them preserves brightness.
    // prettier-ignore
    const avgMatrix = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1 / taps, 0,
    ];
    const avgCF = ck.ColorFilter.MakeMatrix(avgMatrix);

    let acc: any = null;
    for (let i = 0; i < taps; i++) {
        // Walk the smear vector from -half … +half, then apply the phase shift.
        const t = taps === 1 ? 0 : (i / (taps - 1)) * 2 - 1; // -1 … 1
        const dx = cos * half * t + phaseDx;
        const dy = sin * half * t + phaseDy;

        const offset = ck.ImageFilter.MakeOffset(dx, dy, null);
        const tap = ck.ImageFilter.MakeColorFilter(avgCF, offset);
        offset.delete();

        if (acc === null) {
            acc = tap;
        } else {
            const summed = ck.ImageFilter.MakeBlend(ck.BlendMode.Plus, acc, tap);
            acc.delete();
            tap.delete();
            acc = summed;
        }
    }
    avgCF.delete();
    return acc;
}
