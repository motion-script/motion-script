import { describe, it, expect } from 'vitest';
import { identity, translation, multiply, applyToPoint, nodeLocalMatrix } from '@/attributes/layout/matrix2d';

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
