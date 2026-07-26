import { describe, it, expect } from "vitest";
import { duotoneMatrix } from "@/effects/duotone";

const BLACK = [0, 0, 0, 1];
const WHITE = [1, 1, 1, 1];

// 4×5 row-major, rows [R,G,B,A], columns [R,G,B,A,1].
const IDENTITY = [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0,
];

/** Apply a 4×5 colour matrix to a straight RGBA colour. */
function apply(matrix: number[], [r, g, b, a]: number[]): number[] {
    const channel = (row: number) =>
        matrix[row * 5] * r +
        matrix[row * 5 + 1] * g +
        matrix[row * 5 + 2] * b +
        matrix[row * 5 + 3] * a +
        matrix[row * 5 + 4];
    return [channel(0), channel(1), channel(2), channel(3)];
}

describe("duotoneMatrix", () => {
    it("is the identity at amount 0, whatever the ramp", () => {
        const m = duotoneMatrix(0, [1, 0, 0, 1], [0, 0, 1, 1]);
        m.forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i], 6));
    });

    it("maps a black→white ramp to plain luminance", () => {
        const m = duotoneMatrix(1, BLACK, WHITE);
        // Pure red carries only its BT.709 share of the luminance.
        const [r, g, b] = apply(m, [1, 0, 0, 1]);
        expect(r).toBeCloseTo(0.2126, 6);
        expect(g).toBeCloseTo(0.2126, 6);
        expect(b).toBeCloseTo(0.2126, 6);
    });

    it("sends black to `shadows` and white to `highlights`", () => {
        const shadows = [0.1, 0.2, 0.4, 1];
        const highlights = [1, 0.8, 0.2, 1];
        const m = duotoneMatrix(1, shadows, highlights);

        const dark = apply(m, [0, 0, 0, 1]);
        expect(dark.slice(0, 3)).toEqual(shadows.slice(0, 3).map((v) => expect.closeTo(v, 6)));

        const light = apply(m, [1, 1, 1, 1]);
        // luma(white) === 1, so the ramp lands exactly on `highlights`.
        light.slice(0, 3).forEach((v, i) => expect(v).toBeCloseTo(highlights[i], 6));
    });

    it("leaves alpha untouched so the silhouette survives the grade", () => {
        const m = duotoneMatrix(1, BLACK, WHITE);
        expect(m.slice(15)).toEqual([0, 0, 0, 1, 0]);
        expect(apply(m, [0.3, 0.6, 0.9, 0.42])[3]).toBeCloseTo(0.42, 6);
    });

    it("interpolates toward the ramp at partial amounts", () => {
        const full = apply(duotoneMatrix(1, BLACK, WHITE), [1, 0, 0, 1]);
        const half = apply(duotoneMatrix(0.5, BLACK, WHITE), [1, 0, 0, 1]);
        // Half-way between the original red and its fully-mapped grey.
        expect(half[0]).toBeCloseTo((1 + full[0]) / 2, 6);
        expect(half[1]).toBeCloseTo((0 + full[1]) / 2, 6);
    });

    it("ignores the ramp colours' alpha — they name tones, not inks", () => {
        const opaque = duotoneMatrix(1, [0.2, 0.2, 0.2, 1], [0.9, 0.9, 0.9, 1]);
        const translucent = duotoneMatrix(1, [0.2, 0.2, 0.2, 0.1], [0.9, 0.9, 0.9, 0.3]);
        expect(translucent).toEqual(opaque);
    });
});
