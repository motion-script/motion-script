import { FilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/**
 * Applies an arbitrary 4×5 color transform in Skia format.
 *
 * The matrix is row-major with rows [R, G, B, A], each row being
 * [rScale, gScale, bScale, aScale, bias]. Useful for tinting,
 * channel swaps, or any effect not covered by the named filters.
 */
export interface ColorMatrixFilter {
    type: 'colorMatrix';
    /** 4×5 row-major color matrix in Skia format. */
    matrix: number[];
}

FilterRegistry.register<ColorMatrixFilter>("colorMatrix", {
    // Lerps each matrix coefficient independently; missing target coefficients
    // hold their source value so partial matrices still animate gracefully.
    lerp: (from, to, t) => ({
        type: "colorMatrix",
        matrix: from.matrix.map((v, i) => lerpNumber(v, to.matrix[i] ?? v, t)),
    }),
    equals: (a, b) => a.matrix.length === b.matrix.length && a.matrix.every((v, i) => v === b.matrix[i]),
});
