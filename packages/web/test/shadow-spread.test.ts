import { describe, it, expect, beforeAll } from "vitest";
import type { CanvasKit, Canvas, Path as CKPath } from "@motion-script/canvaskit";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
// Relative imports (not the "@/" tsconfig alias): the browser test harness has
// no vite-tsconfig-paths plugin, so "@/..." doesn't resolve at runtime here.
import { getCanvasKit } from "../src/getter";
import { RectShape } from "../src/shapes/rect";
import { EllipseShape } from "../src/shapes/ellipse";
import { PolygonShape } from "../src/shapes/polygon";

let ck: CanvasKit;
// spreadPath() never touches the canvas (it only parses SVG and edits a
// PathBuilder), so a stub canvas is enough to construct the shapes.
const getCanvas = () => ({} as Canvas);

beforeAll(async () => {
    ck = await getCanvasKit(wasmUrl);
});

function bounds(p: CKPath) {
    const [left, top, right, bottom] = p.getBounds();
    return { left, top, right, bottom, w: right - left, h: bottom - top };
}

describe("shadow spread paths", () => {
    it("grows a rectangle outward by `spread` on every side", () => {
        const rect = new RectShape(ck, getCanvas, { x: 0, y: 0, width: 100, height: 60 });
        const path = rect.spreadPath(10)!;
        expect(path).not.toBeNull();
        const b = bounds(path);
        // 10px on each side → +20 in each dimension, centred on the original.
        // 100×60 about the origin spans [-50,-30,50,30]; +10 → [-60,-40,60,40].
        expect(b.w).toBeCloseTo(120, 3);
        expect(b.h).toBeCloseTo(80, 3);
        expect(b.left).toBeCloseTo(-60, 3);
        expect(b.top).toBeCloseTo(-40, 3);
        path.delete();
    });

    it("shrinks a rectangle with negative spread", () => {
        const rect = new RectShape(ck, getCanvas, { x: 0, y: 0, width: 100, height: 60 });
        const path = rect.spreadPath(-10)!;
        const b = bounds(path);
        expect(b.w).toBeCloseTo(80, 3);
        expect(b.h).toBeCloseTo(40, 3);
        path.delete();
    });

    it("returns null when a negative spread collapses the rectangle", () => {
        const rect = new RectShape(ck, getCanvas, { x: 0, y: 0, width: 40, height: 40 });
        // −20 on each side removes the full 40px width.
        expect(rect.spreadPath(-20)).toBeNull();
    });

    it("grows an ellipse by `spread` on each half-axis", () => {
        const ell = new EllipseShape(ck, getCanvas, { x: 0, y: 0, width: 100, height: 100 });
        const path = ell.spreadPath(15)!;
        const b = bounds(path);
        expect(b.w).toBeCloseTo(130, 1);
        expect(b.h).toBeCloseTo(130, 1);
        path.delete();
    });

    it("does not spread a partial-arc ellipse (no bounded region)", () => {
        const arc = new EllipseShape(ck, getCanvas, { x: 0, y: 0, width: 100, height: 100, sweep: 180 });
        expect(arc.spreadPath(10)).toBeNull();
    });

    it("does not support spread on other shapes (e.g. polygon)", () => {
        const poly = new PolygonShape(ck, getCanvas, { x: 0, y: 0, width: 100, height: 100, sides: 5 });
        expect(poly.spreadPath(10)).toBeNull();
    });

    it("advertises the capability on the CurrentShape only for rect/ellipse", () => {
        const rect = new RectShape(ck, getCanvas, { x: 0, y: 0, width: 100, height: 60 });
        const ell = new EllipseShape(ck, getCanvas, { x: 0, y: 0, width: 100, height: 100 });
        const poly = new PolygonShape(ck, getCanvas, { x: 0, y: 0, width: 100, height: 100, sides: 5 });
        expect(typeof rect.toCurrentShape(true).spreadPath).toBe("function");
        expect(typeof ell.toCurrentShape(true).spreadPath).toBe("function");
        expect(poly.toCurrentShape(true).spreadPath).toBeUndefined();
    });
});
