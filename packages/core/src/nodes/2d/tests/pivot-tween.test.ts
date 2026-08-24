import { describe, it, expect } from "vitest";
import { Rect } from "@/nodes/geometry/rect-node";
import { attached } from "@/nodes/node/node.fixtures";

/**
 * A tween that positions a node via a named anchor prop (`topRight: {x, y}`,
 * or the new `pivot` option on `moveTo`/`rotateTo`/`scaleTo`) sets the node's
 * *transient* `transformOrigin`, never its permanent `pivot` — which stays
 * exactly what the node's own construction-time anchor put it at, for the
 * node's whole life. Before this, `_prepareStep` wrote straight to `pivot`,
 * so a `moveTo` anchored differently from the node quietly re-pointed every
 * rotation/scale that ran after it.
 */
describe("a tween's anchor/pivot never touches the node's own pivot", () => {
    it("sets transformOrigin, not pivot, for a tween anchored via a named prop", () => {
        const node = attached(new Rect({ width: 100, height: 50, pivot: "center" }));
        expect(node.pivot as unknown).toEqual({ x: 0, y: 0 });

        const cmd = node.to({ topRight: { x: 10, y: 20 } } as never, 1);
        cmd._stepper().seek(1);

        expect(node.pivot as unknown).toEqual({ x: 0, y: 0 });
        expect(node.transformOrigin as unknown).toEqual({ x: 1, y: 1 });
    });

    it("moveTo's object form accepts an explicit pivot, independent of its target", () => {
        const node = attached(new Rect({ width: 100, height: 50, pivot: "topLeft" }));

        const cmd = node.moveTo({ x: 50, y: 60, pivot: "bottomRight" }, 1);
        cmd._stepper().seek(1);

        expect(node.x).toBeCloseTo(50, 6);
        expect(node.y).toBeCloseTo(60, 6);
        expect(node.pivot as unknown).toEqual({ x: -1, y: 1 });
        expect(node.transformOrigin as unknown).toEqual({ x: 1, y: -1 });
    });

    it("moveTo's positional form still works, unchanged", () => {
        const node = attached(new Rect({ width: 100, height: 50, x: 0, y: 0 }));

        const cmd = node.moveTo(30, 40, 1);
        cmd._stepper().seek(1);

        expect(node.x).toBeCloseTo(30, 6);
        expect(node.y).toBeCloseTo(40, 6);
    });

    it("rotateTo's object form takes its own pivot without moving the node's own", () => {
        const node = attached(new Rect({ width: 100, height: 50, pivot: "center" }));

        const cmd = node.rotateTo({ rotation: 90, pivot: "topLeft" }, 1);
        cmd._stepper().seek(1);

        expect(node.rotation).toBeCloseTo(90, 6);
        expect(node.pivot as unknown).toEqual({ x: 0, y: 0 });
        expect(node.transformOrigin as unknown).toEqual({ x: -1, y: 1 });
    });

    it("rotateTo's positional form still works, unchanged", () => {
        const node = attached(new Rect({ width: 100, height: 50 }));

        const cmd = node.rotateTo(180, 1);
        cmd._stepper().seek(1);

        expect(node.rotation).toBeCloseTo(180, 6);
    });

    it("scaleTo's object form takes its own pivot without moving the node's own", () => {
        const node = attached(new Rect({ width: 100, height: 50, pivot: "center" }));

        const cmd = node.scaleTo({ scale: 2, pivot: "bottomCenter" }, 1);
        cmd._stepper().seek(1);

        expect(node.scale).toBeCloseTo(2, 6);
        expect(node.pivot as unknown).toEqual({ x: 0, y: 0 });
        expect(node.transformOrigin as unknown).toEqual({ x: 0, y: -1 });
    });

    it("scaleTo's positional form still works, unchanged", () => {
        const node = attached(new Rect({ width: 100, height: 50 }));

        const cmd = node.scaleTo(0.5, 1);
        cmd._stepper().seek(1);

        expect(node.scale).toBeCloseTo(0.5, 6);
    });

    it("a later step with no pivot of its own carries the last one forward, like any other prop", () => {
        const node = attached(new Rect({ width: 100, height: 50, pivot: "center" }));

        node.rotateTo({ rotation: 45, pivot: "topLeft" }, 1)._stepper().seek(1);
        expect(node.transformOrigin as unknown).toEqual({ x: -1, y: 1 });

        // No pivot on this one -- transformOrigin is untouched by it, exactly
        // as an unstated `x` or `opacity` would be.
        node.rotateTo(90, 1)._stepper().seek(1);
        expect(node.rotation).toBeCloseTo(90, 6);
        expect(node.transformOrigin as unknown).toEqual({ x: -1, y: 1 });
        expect(node.pivot as unknown).toEqual({ x: 0, y: 0 });
    });
});
