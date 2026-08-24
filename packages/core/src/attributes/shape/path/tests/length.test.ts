import { describe, it, expect } from 'vitest';
import { calculatePathLength } from '@/attributes/shape/path/length';
import { PathCommand } from '@/render/descriptors/path';

describe('calculatePathLength', () => {
    it('returns 0 for an empty path', () => {
        expect(calculatePathLength([])).toBe(0);
    });

    it('measures a single straight line', () => {
        const path: PathCommand[] = [
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 3, y: 4 },
        ];
        expect(calculatePathLength(path)).toBe(5);
    });

    it('sums H/V/Z into a closed-square perimeter', () => {
        const path: PathCommand[] = [
            { type: 'M', x: 0, y: 0 },
            { type: 'H', x: 10 },
            { type: 'V', y: 10 },
            { type: 'H', x: 0 },
            { type: 'Z' },
        ];
        expect(calculatePathLength(path)).toBe(40);
    });

    it('treats a move (M) as zero-length travel', () => {
        const path: PathCommand[] = [
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 10, y: 0 },
            { type: 'M', x: 100, y: 100 },
            { type: 'L', x: 110, y: 100 },
        ];
        expect(calculatePathLength(path)).toBe(20);
    });

    it('handles relative line commands', () => {
        const path: PathCommand[] = [
            { type: 'm', x: 5, y: 5 },
            { type: 'l', x: 3, y: 4 },
        ];
        expect(calculatePathLength(path)).toBe(5);
    });

    it('measures a cubic curve as positive length close to its chord for a flat curve', () => {
        const path: PathCommand[] = [
            { type: 'M', x: 0, y: 0 },
            { type: 'C', x1: 3.33, y1: 0, x2: 6.66, y2: 0, x: 10, y: 0 },
        ];
        // Control points colinear with endpoints → length equals the chord.
        expect(calculatePathLength(path)).toBeCloseTo(10, 5);
    });

    it('approximates an arc as a straight chord', () => {
        const path: PathCommand[] = [
            { type: 'M', x: 0, y: 0 },
            { type: 'A', rx: 5, ry: 5, rotation: 0, largeArc: 0, sweep: 1, x: 0, y: 10 },
        ];
        expect(calculatePathLength(path)).toBe(10);
    });
});
