import { describe, it, expect } from 'vitest';
import { createPathSampler } from '@/attributes/shape/path/sampler';

describe('createPathSampler – straight line', () => {
    it('reports the line length and samples point + tangent', () => {
        const s = createPathSampler('M 0 0 L 100 0');
        expect(s.length).toBeCloseTo(100, 5);

        const mid = s.frameAt(50)!;
        expect(mid.x).toBeCloseTo(50, 5);
        expect(mid.y).toBeCloseTo(0, 5);
        expect(mid.tx).toBeCloseTo(1, 5);
        expect(mid.ty).toBeCloseTo(0, 5);
    });

    it('clamps distances outside [0, length]', () => {
        const s = createPathSampler('M 0 0 L 100 0');
        expect(s.frameAt(-10)!.x).toBeCloseTo(0, 5);
        expect(s.frameAt(200)!.x).toBeCloseTo(100, 5);
    });

    it('accepts a PathCommand[] as well as a string', () => {
        const s = createPathSampler([
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 0, y: 40 },
        ]);
        expect(s.length).toBeCloseTo(40, 5);
        const f = s.frameAt(20)!;
        expect(f.x).toBeCloseTo(0, 5);
        expect(f.y).toBeCloseTo(20, 5);
        // Tangent points down (+y) for a vertical line drawn downward.
        expect(f.tx).toBeCloseTo(0, 5);
        expect(f.ty).toBeCloseTo(1, 5);
    });
});

describe('createPathSampler – accurate arcs', () => {
    // Quarter circle, radius 100, centered at origin: from (100,0) up-and-left to
    // (0,100) via a 90° arc. Sweep=1 (clockwise in y-down space).
    const quarter = 'M 100 0 A 100 100 0 0 1 0 100';

    it('measures the arc length, not the chord', () => {
        const s = createPathSampler(quarter);
        const expected = (Math.PI / 2) * 100; // ~157, vs chord ~141
        expect(s.length).toBeCloseTo(expected, 0);
    });

    it('hits the endpoints at d=0 and d=length', () => {
        const s = createPathSampler(quarter);
        const start = s.frameAt(0)!;
        expect(start.x).toBeCloseTo(100, 0);
        expect(start.y).toBeCloseTo(0, 0);

        const end = s.frameAt(s.length)!;
        expect(end.x).toBeCloseTo(0, 0);
        expect(end.y).toBeCloseTo(100, 0);
    });

    it('samples the midpoint on the circle (tangent ⟂ radius)', () => {
        const s = createPathSampler(quarter);
        const mid = s.frameAt(s.length / 2)!;
        // Midpoint of the quarter circle sits at 45°: (cos45, sin45)*100.
        expect(mid.x).toBeCloseTo(Math.SQRT1_2 * 100, 0);
        expect(mid.y).toBeCloseTo(Math.SQRT1_2 * 100, 0);
        // Tangent is perpendicular to the radius. Compare the *normalized* dot
        // (cos of the angle between them); a flattened polyline tangent has a
        // sub-degree chord error, so allow a small tolerance.
        const r = Math.hypot(mid.x, mid.y);
        const cos = (mid.x * mid.tx + mid.y * mid.ty) / r; // |tangent| == 1
        expect(cos).toBeCloseTo(0, 1);
    });
});

describe('createPathSampler – multi-subpath and degenerate', () => {
    it('flows continuously across subpaths (lengths sum)', () => {
        const s = createPathSampler('M 0 0 L 10 0 M 100 0 L 110 0');
        expect(s.length).toBeCloseTo(20, 5);
        // d=15 lands on the second subpath: 5 units into [100,110].
        const f = s.frameAt(15)!;
        expect(f.x).toBeCloseTo(105, 5);
        expect(f.y).toBeCloseTo(0, 5);
    });

    it('returns null frames for a zero-length path', () => {
        expect(createPathSampler('M 5 5').frameAt(0)).toBeNull();
        expect(createPathSampler('').length).toBe(0);
        expect(createPathSampler('').frameAt(0)).toBeNull();
    });
});
