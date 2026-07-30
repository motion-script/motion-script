import type { EffectHandler } from "./handler";
import { type StreakEffect } from "@motion-script/core";

/**
 * Anamorphic glare: a bright pass blurred along one axis and screened back on.
 *
 * Structurally this is `bloom` with an anisotropic blur — `MakeBlur` takes
 * independent sigmas, so passing a length on one axis and ~0 on the other is all
 * that separates a streak from a halo. That keeps it on the cheap ImageFilter
 * path rather than needing a shader scope.
 *
 * `angle` is applied by rotating into the blur and back out again: the blur
 * itself is axis-aligned, so a `-angle` matrix goes in front and a `+angle`
 * matrix behind, leaving the smear along the authored direction.
 */
export const streakEffectHandler: EffectHandler<StreakEffect> = {
    type: "streak",

    makeImageFilter(effect, ck) {
        if (effect.intensity <= 0 || effect.length <= 0) return null;

        const t = Math.max(0, Math.min(1, effect.threshold));
        // Zero out everything below the cutoff and rescale what survives, so a
        // dim scene doesn't streak: out = max(0, in − t) / (1 − t).
        const scale = t < 1 ? 1 / (1 - t) : 1;
        const bias = -t * scale;
        // prettier-ignore
        const thresholdMatrix = [
            scale, 0,     0,     0, bias,
            0,     scale, 0,     0, bias,
            0,     0,     scale, 0, bias,
            0,     0,     0,     1, 0,
        ];
        const thresholdCF = ck.ColorFilter.MakeMatrix(thresholdMatrix);
        let pass: any = ck.ImageFilter.MakeColorFilter(thresholdCF, null);
        thresholdCF.delete();

        const radians = (effect.angle * Math.PI) / 180;
        const linear = { filter: ck.FilterMode.Linear, mipmap: ck.MipmapMode.None };

        // Rotate the source so the streak axis lies on x, blur only in x, then
        // rotate back. A rotated blur is not otherwise expressible: MakeBlur's
        // sigmas are axis-aligned.
        if (radians !== 0) {
            const into = ck.ImageFilter.MakeMatrixTransform(ck.Matrix.rotated(-radians), linear, pass);
            pass.delete();
            pass = into;
        }

        const blurred = ck.ImageFilter.MakeBlur(effect.length / 2, 0.01, ck.TileMode.Decal, pass);
        pass.delete();
        pass = blurred;

        if (radians !== 0) {
            const back = ck.ImageFilter.MakeMatrixTransform(ck.Matrix.rotated(radians), linear, pass);
            pass.delete();
            pass = back;
        }

        if (effect.intensity !== 1) {
            const i = effect.intensity;
            // prettier-ignore
            const intensityMatrix = [
                i, 0, 0, 0, 0,
                0, i, 0, 0, 0,
                0, 0, i, 0, 0,
                0, 0, 0, 1, 0,
            ];
            const intensityCF = ck.ColorFilter.MakeMatrix(intensityMatrix);
            const scaled = ck.ImageFilter.MakeColorFilter(intensityCF, pass);
            intensityCF.delete();
            pass.delete();
            pass = scaled;
        }

        // Screen the streak onto the source: brightens only, and caps at white.
        const result = ck.ImageFilter.MakeBlend(ck.BlendMode.Screen, null, pass);
        pass.delete();
        return result;
    },
};
