import type { CanvasKit } from "@motion-script/canvaskit";
import type { CurvesFilter, CurvesChannel } from "@motion-script/core";
import { ImageFillFilter } from "./filter";

/**
 * Evaluate a piecewise-linear curve at x ∈ [0, 1].
 * Assumes `points` are sorted by their x coordinate.
 */
function evalCurve(points: [number, number][], x: number): number {
    if (points.length === 0) return x;
    if (x <= points[0][0]) return points[0][1];
    const last = points[points.length - 1];
    if (x >= last[0]) return last[1];
    for (let i = 0; i < points.length - 1; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        if (x >= x0 && x <= x1) {
            const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
            return y0 + (y1 - y0) * t;
        }
    }
    return x;
}

/**
 * Best-fit linear approximation `out = scale * in + bias` for the curve, chosen
 * via least-squares over a dense sampling. The piecewise-linear curve cannot be
 * represented exactly by a 4×5 color matrix (Skia exposes no LUT color filter
 * in the WASM build), so a linear approximation is used.
 */
function fitLinear(points: [number, number][]): { scale: number; bias: number } {
    const N = 64;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < N; i++) {
        const x = i / (N - 1);
        const y = evalCurve(points, x);
        sumX += x; sumY += y; sumXY += x * y; sumXX += x * x;
    }
    const denom = N * sumXX - sumX * sumX;
    const scale = denom === 0 ? 1 : (N * sumXY - sumX * sumY) / denom;
    const bias = (sumY - scale * sumX) / N;
    return { scale, bias };
}

function buildMatrix(channel: CurvesChannel, scale: number, bias: number): number[] {
    // 4×5 row-major color matrix: rows are [R, G, B, A], columns [R, G, B, A, 1].
    // Default to identity; override the diagonal + bias on the chosen channel(s).
    const m = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1, 0,
    ];
    if (channel === 'rgb' || channel === 'r') { m[0] = scale; m[4] = bias; }
    if (channel === 'rgb' || channel === 'g') { m[6] = scale; m[9] = bias; }
    if (channel === 'rgb' || channel === 'b') { m[12] = scale; m[14] = bias; }
    if (channel === 'a') { m[18] = scale; m[19] = bias; }
    return m;
}

/** Applies a per-channel tone curve, approximated as a linear color-matrix fit (see `fitLinear`). */
export class CurvesImageFillFilter extends ImageFillFilter<CurvesFilter> {
    constructor() {
        super("curves");
    }

    makeImageFilter(filter: CurvesFilter, ck: CanvasKit): any {
        const channel: CurvesChannel = filter.channel ?? 'rgb';
        const sorted = [...filter.points].sort((a, b) => a[0] - b[0]);
        const { scale, bias } = fitLinear(sorted);
        const matrix = buildMatrix(channel, scale, bias);
        const colorFilter = ck.ColorFilter.MakeMatrix(matrix);
        const imageFilter = ck.ImageFilter.MakeColorFilter(colorFilter, null);
        colorFilter.delete();
        return imageFilter;
    }
}
