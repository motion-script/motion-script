import { describe, it, expect } from 'vitest';
import { identity, translation, multiply, applyToPoint, invert, cameraMatrix, nodeLocalMatrix } from '@/attributes/layout/matrix2d';

function closeTo(a: number, b: number, eps = 1e-9): void {
    expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);
}

describe('matrix2d', () => {
    it('identity maps a point to itself', () => {
        const p = applyToPoint(identity(), { x: 7, y: -3 });
        expect(p).toEqual({ x: 7, y: -3 });
    });

    it('translation offsets a point', () => {
        const p = applyToPoint(translation(10, 20), { x: 1, y: 2 });
        expect(p).toEqual({ x: 11, y: 22 });
    });

    it('multiply applies the right matrix first (m1 · m2)', () => {
        // Scale-by-2 then translate-by-(5,0): translate is the outer (m1).
        const scale2 = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 };
        const m = multiply(translation(5, 0), scale2);
        const p = applyToPoint(m, { x: 3, y: 0 });
        closeTo(p.x, 11); // 3*2 + 5
    });

    it('nodeLocalMatrix with no rotation/scale is a pure translation to the origin', () => {
        const m = nodeLocalMatrix(40, 60, 0, 1, 0, 0);
        const p = applyToPoint(m, { x: 0, y: 0 });
        expect(p).toEqual({ x: 40, y: 60 });
    });

    it('nodeLocalMatrix rotates clockwise in canvas (y-down) space', () => {
        // 90° clockwise about the origin maps +x → +y (downward in canvas).
        const m = nodeLocalMatrix(0, 0, 90, 1, 0, 0);
        const p = applyToPoint(m, { x: 10, y: 0 });
        closeTo(p.x, 0);
        closeTo(p.y, 10);
    });

    it('nodeLocalMatrix rotates about the pivot, not the origin', () => {
        // Pivot at (10, 0): rotating 180° about it leaves a point on the far side.
        const m = nodeLocalMatrix(0, 0, 180, 1, 10, 0);
        const p = applyToPoint(m, { x: 10, y: 0 }); // the pivot itself is fixed
        closeTo(p.x, 10);
        closeTo(p.y, 0);
        const q = applyToPoint(m, { x: 20, y: 0 }); // 10 past the pivot → 10 before it
        closeTo(q.x, 0);
        closeTo(q.y, 0);
    });
});

describe('matrix2d – invert', () => {
    it('round-trips a point through a node transform', () => {
        // Every ingredient at once: offset centre, rotation, scale, pivot.
        const m = nodeLocalMatrix(40, -25, 37, 2.5, 12, -8);
        const p = { x: 13, y: -4 };
        const back = applyToPoint(invert(m)!, applyToPoint(m, p));
        closeTo(back.x, p.x);
        closeTo(back.y, p.y);
    });

    it('composes with its source to the identity', () => {
        const m = nodeLocalMatrix(5, 5, 20, 3, 0, 0);
        const composed = multiply(m, invert(m)!);
        closeTo(composed.a, 1);
        closeTo(composed.b, 0);
        closeTo(composed.c, 0);
        closeTo(composed.d, 1);
        closeTo(composed.e, 0);
        closeTo(composed.f, 0);
    });

    it('returns null at zero scale — the plane has collapsed', () => {
        expect(invert(nodeLocalMatrix(10, 10, 45, 0, 0, 0))).toBeNull();
    });
});

describe('matrix2d – cameraMatrix', () => {
    it('is the identity for a camera at rest on a viewport at the origin', () => {
        const m = cameraMatrix(0, 0, { x: 0, y: 0 }, 1, 0);
        closeTo(m.a, 1);
        closeTo(m.b, 0);
        closeTo(m.c, 0);
        closeTo(m.d, 1);
        closeTo(m.e, 0);
        closeTo(m.f, 0);
    });

    it('scales about the viewport centre when zoomed', () => {
        // zoom 2, origin at the world centre: a world point 100 to the right of
        // centre lands 200 to the right on screen.
        const p = applyToPoint(cameraMatrix(0, 0, { x: 0, y: 0 }, 2, 0), { x: 100, y: 0 });
        closeTo(p.x, 200);
        closeTo(p.y, 0);
    });

    it('centres on `origin`, whose y is y-up while the matrix is y-down', () => {
        // Origin at world (30, 40) y-up ⇒ canvas (30, -40): that point maps to
        // the viewport centre.
        const p = applyToPoint(cameraMatrix(0, 0, { x: 30, y: 40 }, 1, 0), { x: 30, y: -40 });
        closeTo(p.x, 0);
        closeTo(p.y, 0);
    });

    it('rotates by -heading, matching RenderContext.beginCamera', () => {
        // canvas.rotate(-90) maps +x → -y (upward in canvas space).
        const p = applyToPoint(cameraMatrix(0, 0, { x: 0, y: 0 }, 1, 90), { x: 10, y: 0 });
        closeTo(p.x, 0);
        closeTo(p.y, -10);
    });
});
