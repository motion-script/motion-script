import { describe, it, expect } from 'vitest';
import {
    isSmoothCurveType,
    reflectControlPoint,
    distance,
    cubicAxis,
    quadAxis,
    cubicPoint,
    quadPoint,
    sampleCurveLength,
} from '@/attributes/shape/path/bezier';

describe('isSmoothCurveType', () => {
    it('is true for curve commands that feed reflected control points', () => {
        for (const t of ['C', 'c', 'S', 's', 'Q', 'q', 'T', 't'] as const) {
            expect(isSmoothCurveType(t)).toBe(true);
        }
    });

    it('is false for line/move commands', () => {
        for (const t of ['M', 'L', 'H', 'V', 'Z'] as const) {
            expect(isSmoothCurveType(t)).toBe(false);
        }
    });
});

describe('reflectControlPoint', () => {
    it('reflects the control point through the current point', () => {
        expect(reflectControlPoint(10, 4)).toBe(16);
    });

    it('returns the current point when control equals it', () => {
        expect(reflectControlPoint(5, 5)).toBe(5);
    });
});

describe('distance', () => {
    it('computes a 3-4-5 triangle hypotenuse', () => {
        expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });

    it('is zero for identical points', () => {
        expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
    });
});

describe('cubicAxis', () => {
    it('returns p0 at t=0 and p3 at t=1', () => {
        expect(cubicAxis(0, 0, 1, 2, 3)).toBe(0);
        expect(cubicAxis(1, 0, 1, 2, 3)).toBe(3);
    });

    it('returns a constant when all control values are equal', () => {
        expect(cubicAxis(0.42, 5, 5, 5, 5)).toBeCloseTo(5, 10);
    });

    it('matches the midpoint of a symmetric curve', () => {
        // Linear ramp 0..3 with evenly spaced controls → 1.5 at t=0.5.
        expect(cubicAxis(0.5, 0, 1, 2, 3)).toBeCloseTo(1.5, 10);
    });
});

describe('quadAxis', () => {
    it('returns p0 at t=0 and p2 at t=1', () => {
        expect(quadAxis(0, 1, 5, 9)).toBe(1);
        expect(quadAxis(1, 1, 5, 9)).toBe(9);
    });

    it('evaluates the midpoint', () => {
        // 0.25*p0 + 0.5*p1 + 0.25*p2
        expect(quadAxis(0.5, 0, 4, 0)).toBe(2);
    });
});

describe('cubicPoint / quadPoint', () => {
    it('cubicPoint evaluates both axes', () => {
        const p = cubicPoint({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }, 0.5);
        expect(p.x).toBeCloseTo(0.5, 10);
        expect(p.y).toBeCloseTo(0.75, 10);
    });

    it('quadPoint returns the endpoints', () => {
        expect(quadPoint({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
        expect(quadPoint({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }, 1)).toEqual({ x: 10, y: 0 });
    });
});

describe('sampleCurveLength', () => {
    it('measures a straight diagonal accurately', () => {
        const line = (t: number) => ({ x: t * 3, y: t * 4 });
        expect(sampleCurveLength(line)).toBeCloseTo(5, 6);
    });

    it('returns 0 for a degenerate point curve', () => {
        expect(sampleCurveLength(() => ({ x: 2, y: 2 }))).toBe(0);
    });

    it('converges to the true length as steps increase', () => {
        const quarterCircle = (t: number) => ({
            x: Math.cos((t * Math.PI) / 2),
            y: Math.sin((t * Math.PI) / 2),
        });
        const coarse = sampleCurveLength(quarterCircle, 4);
        const fine = sampleCurveLength(quarterCircle, 256);
        const exact = Math.PI / 2;
        expect(Math.abs(fine - exact)).toBeLessThan(Math.abs(coarse - exact));
        expect(fine).toBeCloseTo(exact, 3);
    });
});
