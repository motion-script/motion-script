import { describe, it, expect } from "vitest";
import { Rect } from "../geometry/rect-node";

/**
 * The base node `pivot` prop accepts a named anchor (the `align` vocabulary) in
 * addition to an explicit Vector2; the @property mapper resolves it to the
 * normalised [-1,1] (y-up) pivot the transform uses.
 */
describe("Node pivot accepts a named anchor", () => {
    it("resolves a named anchor to its normalised pivot", () => {
        expect((new Rect({ pivot: "topRight" }).pivot as any)).toEqual({ x: 1, y: 1 });
        expect((new Rect({ pivot: "bottomLeft" }).pivot as any)).toEqual({ x: -1, y: -1 });
        expect((new Rect({ pivot: "bottomCenter" }).pivot as any)).toEqual({ x: 0, y: -1 });
    });

    it("keeps an explicit Vector2 pivot", () => {
        expect((new Rect({ pivot: { x: 0.5, y: -0.5 } }).pivot as any)).toEqual({ x: 0.5, y: -0.5 });
    });

    it("defaults to centre", () => {
        expect((new Rect({}).pivot as any)).toEqual({ x: 0, y: 0 });
    });
});
