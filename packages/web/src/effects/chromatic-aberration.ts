import type { CanvasKit } from "@motion-script/canvaskit";
import type { ChromaticAberrationEffect } from "@motion-script/core";
import { CanvasKitEffect } from "./effect";

/**
 * Chromatic aberration — red/blue lens-dispersion fringing.
 *
 * Implemented as three ImageFilter passes composed via Screen-blend:
 *   1. R ghost: source shifted by (+dx, +dy) with red colour boost
 *   2. B ghost: source shifted by (-dx, -dy) with blue colour boost
 *   3. Screen-blend both ghosts onto the original source
 *
 * Screen-blend keeps the result from over-brightening and naturally
 * saturates highlights, mimicking real lens dispersion.
 */
export class ChromaticAberrationCanvasKitEffect extends CanvasKitEffect<ChromaticAberrationEffect> {
    constructor() {
        super("chromaticAberration");
    }

    makeImageFilter(effect: ChromaticAberrationEffect, ck: CanvasKit): any {
        if (effect.amount <= 0) return null;

        const rad = (effect.angle * Math.PI) / 180;
        const dx = Math.cos(rad) * effect.amount;
        const dy = Math.sin(rad) * effect.amount;

        // R ghost: shift source by (+dx, +dy), boost red channel, suppress others.
        // prettier-ignore
        const redMatrix = [
            1.4, -0.2, -0.2, 0, 0,
            0,    0,    0,   0, 0,
            0,    0,    0,   0, 0,
            0,    0,    0,   1, 0,
        ];
        const redCF = ck.ColorFilter.MakeMatrix(redMatrix);
        const redOffset = ck.ImageFilter.MakeOffset(dx, dy, null);
        const rGhost = ck.ImageFilter.MakeColorFilter(redCF, redOffset);
        redCF.delete();
        redOffset.delete();

        // B ghost: shift source by (-dx, -dy), boost blue channel, suppress others.
        // prettier-ignore
        const blueMatrix = [
            0,    0,    0,   0, 0,
            0,    0,    0,   0, 0,
            -0.2, -0.2, 1.4, 0, 0,
            0,    0,    0,   1, 0,
        ];
        const blueCF = ck.ColorFilter.MakeMatrix(blueMatrix);
        const blueOffset = ck.ImageFilter.MakeOffset(-dx, -dy, null);
        const bGhost = ck.ImageFilter.MakeColorFilter(blueCF, blueOffset);
        blueCF.delete();
        blueOffset.delete();

        // Screen-blend R ghost onto source (background = null = source).
        const step1 = ck.ImageFilter.MakeBlend(ck.BlendMode.Screen, null, rGhost);
        rGhost.delete();

        // Screen-blend B ghost onto the result of step1.
        const result = ck.ImageFilter.MakeBlend(ck.BlendMode.Screen, step1, bGhost);
        step1.delete();
        bGhost.delete();

        return result;
    }
}
