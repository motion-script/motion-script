import type { CanvasKit } from "@motion-script/canvaskit";
import { CanvasKitEffect } from "./effect";
import {
    type MotionBlurEffect,
    type Vector2,
    resolveMotionBlurAxis,
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
    direction: number;
    /** Smear length in pixels along `direction`. 0 = no blur. */
    blurLength: number;
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
 * `axis` and by `strength`. The result's `direction`/`blurLength` are the polar
 * form of that smear vector.
 */
export function resolveMotionBlur(
    effect: MotionBlurEffect,
    velocity: Vector2,
    dt: number,
): MotionBlurResolved | null {
    if (dt <= 0 || effect.strength <= 0 || effect.length <= 0) return null;

    const axis = resolveMotionBlurAxis(effect.axis);
    const shutter = effect.length / 100;

    // Displacement this frame, axis-scaled, then weighted by shutter + strength.
    const sx = velocity.x * dt * axis.x * shutter * effect.strength;
    const sy = velocity.y * dt * axis.y * shutter * effect.strength;

    const blurLength = Math.hypot(sx, sy);
    if (blurLength < 0.01) return null;

    return {
        type: "motionBlurResolved",
        direction: (Math.atan2(sy, sx) * 180) / Math.PI,
        blurLength,
        phase: resolveMotionBlurAlignment(effect.alignment),
        samples: effect.samples,
    };
}

/**
 * Renders a {@link MotionBlurResolved} smear.
 *
 * Default (continuous) path mirrors {@link DirectionalBlurCanvasKitEffect}:
 * rotate the layer so the smear axis lands on X, blur anisotropically
 * (`sigmaX = blurLength/2`, `sigmaY = 0`), then rotate back with the inverse
 * matrix so only the kernel ends up rotated. A `phase` shutter offset is applied
 * as an extra translation along the smear direction.
 *
 * When `samples` exceeds {@link SAMPLE_THRESHOLD}, an After Effects-style
 * multi-tap path is used instead: N copies of the layer offset evenly along the
 * smear vector, each scaled to `1/N` alpha and summed (`BlendMode.Plus`), giving
 * the characteristic discrete-step look. Cost is O(samples), so it is gated.
 */
export class MotionBlurCanvasKitEffect extends CanvasKitEffect<MotionBlurResolved> {
    constructor() {
        super("motionBlurResolved");
    }

    makeImageFilter(effect: MotionBlurResolved, ck: CanvasKit): any {
        if (effect.blurLength <= 0) return null;

        const rad = (effect.direction * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Shutter phase shifts the smear centre along the motion direction by up
        // to ±half its length (behind ⇢ ahead of the node's current position).
        const phaseShift = (effect.phase * effect.blurLength) / 2;
        const phaseDx = cos * phaseShift;
        const phaseDy = sin * phaseShift;

        const taps = Math.min(Math.round(effect.samples), MAX_TAPS);
        if (taps > SAMPLE_THRESHOLD) {
            return this.makeMultiTap(effect, ck, cos, sin, phaseDx, phaseDy, taps);
        }
        return this.makeContinuous(effect, ck, cos, sin, phaseDx, phaseDy);
    }

    /** Continuous anisotropic-blur smear (cheap; ignores sample count). */
    private makeContinuous(
        effect: MotionBlurResolved,
        ck: CanvasKit,
        cos: number,
        sin: number,
        phaseDx: number,
        phaseDy: number,
    ): any {
        const sigma = effect.blurLength / 2;
        const linear = { filter: ck.FilterMode.Linear };

        // Source, optionally shifted by the shutter phase.
        const base = phaseDx !== 0 || phaseDy !== 0
            ? ck.ImageFilter.MakeOffset(phaseDx, phaseDy, null)
            : null;

        // Rotate by -direction so the smear axis lands on X.
        const rotateForward = ck.ImageFilter.MakeMatrixTransform(
            [cos, sin, 0, -sin, cos, 0, 0, 0, 1],
            linear,
            base,
        );
        base?.delete();

        const blur = ck.ImageFilter.MakeBlur(sigma, 0, ck.TileMode.Decal, rotateForward);
        rotateForward.delete();

        // Rotate back by +direction (inverse of the forward rotation).
        const rotateBack = ck.ImageFilter.MakeMatrixTransform(
            [cos, -sin, 0, sin, cos, 0, 0, 0, 1],
            linear,
            blur,
        );
        blur.delete();

        return rotateBack;
    }

    /** Discrete multi-tap accumulation (After Effects' samples-per-frame look). */
    private makeMultiTap(
        effect: MotionBlurResolved,
        ck: CanvasKit,
        cos: number,
        sin: number,
        phaseDx: number,
        phaseDy: number,
        taps: number,
    ): any {
        const half = effect.blurLength / 2;
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
}
