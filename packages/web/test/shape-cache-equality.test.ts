import { describe, it, expect } from "vitest";
import { valuesEqual, shallowEqual } from "@motion-script/skia-render/shapes/shape-handler";

/**
 * The cross-frame shape cache reuses a shape's built wasm path when its input
 * state is unchanged. The renderer's y-flip helpers reallocate a shape's small
 * object-valued fields (`pivot`, `points`, per-corner `cornerRadius`/`cornerStyle`)
 * every frame, so a reference-based comparison misses on every frame even when the
 * geometry is identical. `valuesEqual`/`shallowEqual` compare those known small
 * structures by value so an animated Graphics2D hits the cache — while failing closed
 * on anything else so a genuine change is never mistaken for equal.
 */
describe("valuesEqual", () => {
    it("treats value-equal pivot objects (distinct refs) as equal", () => {
        expect(valuesEqual({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
        expect(valuesEqual({ x: 1, y: -2 }, { x: 1, y: -2 })).toBe(true);
    });

    it("distinguishes different pivot values", () => {
        expect(valuesEqual({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(false);
        expect(valuesEqual({ x: 1, y: 0 }, { x: 0, y: 0 })).toBe(false);
    });

    it("compares points arrays element-wise by value", () => {
        expect(valuesEqual(
            [{ x: -10, y: 0 }, { x: 10, y: 0 }],
            [{ x: -10, y: 0 }, { x: 10, y: 0 }],
        )).toBe(true);
        expect(valuesEqual(
            [{ x: -10, y: 0 }, { x: 10, y: 0 }],
            [{ x: -10, y: 0 }, { x: 10, y: 1 }],
        )).toBe(false);
        expect(valuesEqual([{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
    });

    it("compares per-corner records by value", () => {
        const a = { topLeft: 8, topRight: 8, bottomRight: 4, bottomLeft: 4 };
        const b = { topLeft: 8, topRight: 8, bottomRight: 4, bottomLeft: 4 };
        expect(valuesEqual(a, b)).toBe(true);
        expect(valuesEqual(a, { ...b, bottomLeft: 5 })).toBe(false);
    });

    it("passes primitives straight through", () => {
        expect(valuesEqual(3, 3)).toBe(true);
        expect(valuesEqual("center", "center")).toBe(true);
        expect(valuesEqual(3, 4)).toBe(false);
        expect(valuesEqual(undefined, undefined)).toBe(true);
        expect(valuesEqual(null, null)).toBe(true);
    });

    it("fails closed on unknown object shapes (never a false hit)", () => {
        // An object that isn't a pivot / points / corner record is treated as
        // changed unless it is the very same reference.
        expect(valuesEqual({ foo: 1 }, { foo: 1 })).toBe(false);
        const shared = { foo: 1 };
        expect(valuesEqual(shared, shared)).toBe(true);
        // A pivot vs a non-pivot object doesn't accidentally match.
        expect(valuesEqual({ x: 0, y: 0 }, { foo: 1 })).toBe(false);
    });
});

describe("shallowEqual", () => {
    it("treats states with fresh-but-equal pivot objects as equal", () => {
        // Mirrors what the y-flip helpers produce each frame: identical numbers,
        // a brand-new pivot object reference.
        const frameA = { x: 100, y: 0, width: 40, height: 40, pivot: { x: 0, y: 0 } };
        const frameB = { x: 100, y: 0, width: 40, height: 40, pivot: { x: 0, y: 0 } };
        expect(shallowEqual(frameA, frameB)).toBe(true);
    });

    it("still reports a real geometry change as unequal", () => {
        const frameA = { x: 100, y: 0, width: 40, height: 40, pivot: { x: 0, y: 0 } };
        const frameB = { x: 120, y: 0, width: 40, height: 40, pivot: { x: 0, y: 0 } };
        expect(shallowEqual(frameA, frameB)).toBe(false);
    });

    it("reports differing key counts as unequal", () => {
        expect(shallowEqual({ x: 1 }, { x: 1, y: 2 })).toBe(false);
    });
});
