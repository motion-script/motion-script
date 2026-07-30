import { describe, it, expect, beforeAll } from "vitest";
import type { CanvasKit, Canvas, Path as CKPath } from "@motion-script/canvaskit";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import { getCanvasKit } from "../src/getter";
import { PathShape } from "@motion-script/skia-render/shapes/path";

let ck: CanvasKit;
// PathShape's stroke/trim paths only parse SVG and edit PathBuilders; the canvas
// is never touched during ensurePath/retrim/strokePath, so a stub is enough.
const getCanvas = () => ({} as Canvas);

beforeAll(async () => {
    ck = await getCanvasKit(wasmUrl);
});

function totalLength(p: CKPath): number {
    const iter = new ck.ContourMeasureIter(p, false, 1);
    let c = iter.next();
    let len = 0;
    while (c) {
        len += c.length();
        c.delete();
        c = iter.next();
    }
    iter.delete();
    return len;
}

function anyClosed(p: CKPath): boolean {
    const iter = new ck.ContourMeasureIter(p, false, 1);
    let c = iter.next();
    let closed = false;
    while (c) {
        if (c.isClosed()) closed = true;
        c.delete();
        c = iter.next();
    }
    iter.delete();
    return closed;
}

// A closed (`Z`-terminated) triangle: stroking it must never draw the closing
// chord, and animating start/end via retrim must keep the stroke path in sync.
const TRI = "M 0 -100 L 87 50 L -87 50 Z";

describe("PathShape stroke path under retrim (start/end tween)", () => {
    it("rebuilds the open stroke path to the *current* trim after retrim", () => {
        // Build at end:0.3 (a first frame), then scrub forward via retrim â€” the
        // path cache's trim-only fast path. The stroke path must track each new
        // range, not freeze at the construction-time trim.
        const shape = new PathShape(ck, getCanvas, { data: TRI, start: 0, end: 0.3 });
        shape.ensurePath();

        const lenAt = (end: number) => {
            shape.retrim(0, end);
            const sp = shape.strokePath();
            expect(sp, `strokePath should exist at end=${end}`).toBeTruthy();
            return totalLength(sp!);
        };

        // Lengths must increase monotonically as `end` grows â€” a frozen (stale)
        // stroke path would report the same length regardless of the new range.
        const l4 = lenAt(0.4);
        const l6 = lenAt(0.6);
        const l8 = lenAt(0.8);
        const l10 = lenAt(1.0);

        expect(l6).toBeGreaterThan(l4);
        expect(l8).toBeGreaterThan(l6);
        expect(l10).toBeGreaterThan(l8);
    });

    it("keeps the stroke contour open (no closing chord) across the whole tween", () => {
        const shape = new PathShape(ck, getCanvas, { data: TRI, start: 0, end: 0.5 });
        shape.ensurePath();
        for (const end of [0.5, 0.75, 1.0]) {
            shape.retrim(0, end);
            const sp = shape.strokePath()!;
            expect(anyClosed(sp), `stroke contour must stay open at end=${end}`).toBe(false);
        }
    });

    it("at end:1 the open stroke contour is shorter than the closed fill contour (chord dropped)", () => {
        const shape = new PathShape(ck, getCanvas, { data: TRI, start: 0, end: 1 });
        shape.ensurePath();
        const fillLen = totalLength(shape.ckPath!);
        const strokeLen = totalLength(shape.strokePath()!);
        // The closed fill includes the chord edge back to the start; the open
        // stroke omits it, so it must be strictly shorter.
        expect(strokeLen).toBeLessThan(fillLen);
    });
});
