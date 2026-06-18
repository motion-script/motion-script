import { describe, it, expect, beforeAll } from "vitest";
import type { CanvasKit, Canvas } from "@motion-script/canvaskit";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
// Relative imports (not the "@/" tsconfig alias): the browser test harness has
// no vite-tsconfig-paths plugin, so "@/..." doesn't resolve at runtime here.
import { getCanvasKit } from "../src/getter";
import { EllipseShape } from "../src/shapes/ellipse";

let ck: CanvasKit;
const getCanvas = () => ({} as Canvas);

beforeAll(async () => {
    ck = await getCanvasKit(wasmUrl);
});

// Build a shape's ckPath and report what it looks like geometrically.
function describePath(state: Record<string, unknown>) {
    const shape = new EllipseShape(ck, getCanvas, state as any);
    shape.ensurePath();
    const path = shape.ckPath!;
    expect(path).toBeTruthy();
    const [left, top, right, bottom] = path.getBounds();

    // Count contours and whether every one is closed.
    const iter = new ck.ContourMeasureIter(path, false, 1);
    let contours = 0;
    let allClosed = true;
    let totalLength = 0;
    let c = iter.next();
    while (c) {
        contours++;
        if (!c.isClosed()) allClosed = false;
        totalLength += c.length();
        c.delete();
        c = iter.next();
    }
    iter.delete();

    const out = { left, top, right, bottom, w: right - left, h: bottom - top, contours, allClosed, totalLength };
    shape.deletePaths();
    return out;
}

describe("ellipse ratio geometry", () => {
    const W = 320, H = 320;

    it("full ellipse: ratio 0 is a solid disk (one closed contour)", () => {
        const g = describePath({ x: 0, y: 0, width: W, height: H, sweep: 360, ratio: 0 });
        expect(g.contours).toBe(1);
        expect(g.allClosed).toBe(true);
        expect(g.w).toBeCloseTo(W, 0);
    });

    it("full ellipse: 0 < ratio < 1 is an annulus (two closed contours, a hole)", () => {
        const g = describePath({ x: 0, y: 0, width: W, height: H, sweep: 360, ratio: 0.5 });
        expect(g.contours).toBe(2);
        expect(g.allClosed).toBe(true);
        // Outer extent is unchanged by the hole.
        expect(g.w).toBeCloseTo(W, 0);
    });

    it("full ellipse: ratio 1 collapses to the bare outline (one closed contour)", () => {
        const g = describePath({ x: 0, y: 0, width: W, height: H, sweep: 360, ratio: 1 });
        expect(g.contours).toBe(1);
        expect(g.w).toBeCloseTo(W, 0);
    });

    it("partial arc: ratio 0 is a solid wedge reaching the centre", () => {
        // A 220° wedge centred at angle 0 still reaches the centre (0,0).
        const g = describePath({ x: 0, y: 0, width: W, height: H, sweep: 220, ratio: 0 });
        expect(g.contours).toBe(1);
        expect(g.allClosed).toBe(true);
        // Wedge includes the centre, so it spans the full half-width on the +x side.
        expect(g.right).toBeCloseTo(W / 2, 0);
        expect(g.left).toBeLessThanOrEqual(0.01);
    });

    it("partial arc: ratio 1 is a bare open arc (one open contour)", () => {
        const g = describePath({ x: 0, y: 0, width: W, height: H, sweep: 220, ratio: 1 });
        expect(g.contours).toBe(1);
        expect(g.allClosed).toBe(false);
    });

    // The bug: animating `ratio` from 1 down used to flip the path topology and
    // make the stroke pop. Verify the family is CONTINUOUS — outer extent is
    // pinned across the whole range, and the enclosed band grows monotonically
    // (measured via the closed sector's perimeter length) without a sudden jump.
    it("partial arc: geometry is continuous as ratio decreases from 1", () => {
        const ratios = [1, 0.99, 0.9, 0.7, 0.5, 0.3, 0.1, 0];
        const samples = ratios.map(r =>
            describePath({ x: 0, y: 0, width: W, height: H, sweep: 220, ratio: r }),
        );

        // Outer extent (right edge at +halfWidth) is identical for every ratio —
        // ratio only moves the INNER edge, never the outer silhouette.
        for (const s of samples) {
            expect(s.right).toBeCloseTo(W / 2, 0);
        }

        // Within the sector family (ratio in (0,1)) the topology is constant: a
        // single closed contour at every step. The OLD code flipped open↔closed
        // here, which is exactly what made the stroke pop.
        for (let i = 1; i < samples.length - 1; i++) {
            expect(samples[i].contours).toBe(1);
            expect(samples[i].allClosed).toBe(true);
        }

        // Perimeter changes smoothly (no discontinuous jump) between adjacent
        // ratios. The band's outer arc is fixed; only the inner arc + radial
        // edges move, so step-to-step change stays bounded.
        for (let i = 2; i < samples.length - 1; i++) {
            const step = Math.abs(samples[i].totalLength - samples[i - 1].totalLength);
            expect(step).toBeLessThan(W); // < one outer half-extent per 0.1–0.2 ratio step
        }

        // A near-1 ratio is a razor-thin band: its perimeter is close to twice the
        // bare arc length (out-and-back), not some wildly different value — i.e. it
        // is the smooth limit of the family, the property the old code broke.
        const bareArc = samples[0].totalLength;       // ratio 1, open arc
        const thinBand = samples[1].totalLength;      // ratio 0.99, closed sector
        expect(thinBand).toBeGreaterThan(bareArc);    // closed band is longer
        expect(thinBand).toBeLessThan(bareArc * 2.2); // but ~2× the arc, not a blowup
    });

    // The lower end of the range (the scene animates ratio all the way to 0): a
    // near-0 sector and the ratio-0 wedge should be the same closed shape with
    // nearly the same perimeter — no pop as the inner edge reaches the centre.
    it("partial arc: sector → wedge is continuous as ratio reaches 0", () => {
        const nearZero = describePath({ x: 0, y: 0, width: W, height: H, sweep: 220, ratio: 0.02 });
        const wedge = describePath({ x: 0, y: 0, width: W, height: H, sweep: 220, ratio: 0 });
        expect(nearZero.contours).toBe(1);
        expect(nearZero.allClosed).toBe(true);
        expect(wedge.contours).toBe(1);
        // Perimeters within a few percent — the inner arc has shrunk to nearly a
        // point and the radial edges nearly meet at the centre.
        expect(Math.abs(nearZero.totalLength - wedge.totalLength)).toBeLessThan(wedge.totalLength * 0.05);
    });

    it("full ellipse: annulus → disk is continuous as ratio reaches 0", () => {
        const nearZero = describePath({ x: 0, y: 0, width: W, height: H, sweep: 360, ratio: 0.02 });
        const disk = describePath({ x: 0, y: 0, width: W, height: H, sweep: 360, ratio: 0 });
        // Outer silhouette identical; the hole has shrunk to a near-point.
        expect(nearZero.w).toBeCloseTo(disk.w, 0);
        expect(nearZero.contours).toBe(2); // outer + tiny inner hole
        expect(disk.contours).toBe(1);     // solid
    });
});
