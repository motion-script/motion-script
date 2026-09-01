import { describe, expect, it } from "vitest";
import type { PathCommand } from "@motion-script/core";

import { prepareLatexTween } from "../tween";
import type { LatexToken } from "../geometry";

/**
 * A closed square of side `size`, centred on (cx, cy).
 *
 * Stands in for a glyph outline: what matters to the morph is that the same
 * character in two formulas is the *same* outline under two different
 * uniform-scale-plus-translate transforms, which is exactly the relationship
 * between two squares of different sizes.
 */
function square(size: number, cx = 0, cy = 0): PathCommand[] {
    const h = size / 2;
    return [
        { type: "M", x: cx - h, y: cy - h },
        { type: "L", x: cx + h, y: cy - h },
        { type: "L", x: cx + h, y: cy + h },
        { type: "L", x: cx - h, y: cy + h },
        { type: "Z" },
    ];
}

/** The width of a path's control-point bbox. */
function widthOf(path: PathCommand[]): number {
    let min = Infinity;
    let max = -Infinity;
    for (const cmd of path) {
        const c = cmd as { x?: number };
        if (c.x === undefined) continue;
        min = Math.min(min, c.x);
        max = Math.max(max, c.x);
    }
    return max - min;
}

function token(t: string, path: PathCommand[]): LatexToken {
    return { token: t, path };
}

describe("prepareLatexTween", () => {
    /**
     * The exponent-to-coefficient case: the `2` of `b^2` is set at script size
     * and the `2` of `2a` at full size, so a matched glyph routinely changes
     * size across a morph.
     */
    const from = [token("2", square(10, 0, 0))];
    const to = [token("2", square(20, 100, 50))];

    it("lands exactly on the source geometry at t = 0", () => {
        expect(prepareLatexTween(from, to)(0)[0].path).toEqual(from[0].path);
    });

    it("lands exactly on the target geometry at t = 1", () => {
        expect(prepareLatexTween(from, to)(1)[0].path).toEqual(to[0].path);
    });

    it("grows a resized glyph continuously rather than snapping to its new size", () => {
        const frame = prepareLatexTween(from, to);

        // The regression: the morph used to emit the *target* path from the
        // first frame and lerp only its centroid, so the whole size change
        // happened between the last static frame and t = 0+.
        expect(widthOf(frame(0.001)[0].path)).toBeCloseTo(10, 1);
        expect(widthOf(frame(0.5)[0].path)).toBeCloseTo(15, 6);
        expect(widthOf(frame(0.999)[0].path)).toBeCloseTo(20, 1);
    });

    it("carries the glyph's place in the path, leaving no residual offset", () => {
        const [glyph] = prepareLatexTween(from, to)(0.5);
        expect(glyph.x).toBe(0);
        expect(glyph.y).toBe(0);
        // Halfway between the two centres.
        const xs = glyph.path.flatMap(c => ("x" in c ? [c.x] : []));
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(50, 6);
    });

    it("scales a structurally incompatible match instead of dropping the size change", () => {
        // Same character, different command count — the pointwise lerp can't
        // apply, so the fallback shrinks the target outline and grows it back.
        const wonky = [token("2", [...square(20, 100, 50), { type: "Z" }])];
        const frame = prepareLatexTween(from, wonky);

        expect(widthOf(frame(0)[0].path)).toBeCloseTo(10, 6);
        expect(widthOf(frame(0.5)[0].path)).toBeCloseTo(15, 6);
        expect(frame(1)[0].path).toEqual(wonky[0].path);
    });

    it("fades a departing glyph out over the first half", () => {
        const frame = prepareLatexTween([token("a", square(10))], []);
        expect(frame(0)[0].opacity).toBeCloseTo(1, 6);
        expect(frame(0.25)[0].opacity).toBeCloseTo(0.5, 6);
        expect(frame(0.5)[0].opacity).toBeCloseTo(0, 6);
    });

    it("fades an arriving glyph in over the second half", () => {
        const frame = prepareLatexTween([], [token("a", square(10))]);
        expect(frame(0.5)[0].opacity).toBeCloseTo(0, 6);
        expect(frame(0.75)[0].opacity).toBeCloseTo(0.5, 6);
        expect(frame(1)[0].opacity).toBeCloseTo(1, 6);
    });

    it("treats synthetic shapes as unmatchable, since their keys are positional", () => {
        // A fraction bar is `__rect_0` in both formulas but need not be the
        // same bar, so it is replaced rather than carried.
        const frame = prepareLatexTween(
            [token("__rect_0", square(10))],
            [token("__rect_0", square(20))],
        );
        const tokens = frame(0.5);
        expect(tokens).toHaveLength(2);
        expect(tokens.every(t => t.opacity === 0)).toBe(true);
    });
});
