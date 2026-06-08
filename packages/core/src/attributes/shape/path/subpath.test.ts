import { describe, it, expect } from 'vitest';
import { extractSubpath } from '@/attributes/shape/path/subpath';
import { PathCommand } from '@/render/descriptors/path';

const line: PathCommand[] = [
    { type: 'M', x: 0, y: 0 },
    { type: 'L', x: 10, y: 0 },
];

describe('extractSubpath – fast paths', () => {
    it('returns the input unchanged for the full 0..1 range', () => {
        expect(extractSubpath(line, 0, 1)).toBe(line);
    });

    it('passes a string path through untouched', () => {
        expect(extractSubpath('M0 0 L10 0', 0.2, 0.8)).toBe('M0 0 L10 0');
    });

    it('returns the input for an empty command array', () => {
        const empty: PathCommand[] = [];
        expect(extractSubpath(empty, 0.2, 0.8)).toBe(empty);
    });

    it('returns [] when the range is empty or inverted', () => {
        expect(extractSubpath(line, 0.8, 0.2)).toEqual([]);
        expect(extractSubpath(line, 0.5, 0.5)).toEqual([]);
    });
});

describe('extractSubpath – trimming a line', () => {
    it('trims the first half of a horizontal line', () => {
        const result = extractSubpath(line, 0, 0.5) as PathCommand[];
        expect(result[0]).toEqual({ type: 'M', x: 0, y: 0 });
        expect(result[1]).toMatchObject({ type: 'L', x: 5, y: 0 });
    });

    it('trims a middle segment, starting the result at the cut point', () => {
        const result = extractSubpath(line, 0.25, 0.75) as PathCommand[];
        const move = result[0] as Extract<PathCommand, { type: 'M' }>;
        expect(move.type).toBe('M');
        expect(move.x).toBeCloseTo(2.5, 4);
        const draw = result[1] as Extract<PathCommand, { type: 'L' }>;
        expect(draw.x).toBeCloseTo(7.5, 4);
    });

    it('clamps out-of-range start/end into 0..1', () => {
        const result = extractSubpath(line, -1, 2);
        // -1..2 clamps to 0..1 → returns the original input.
        expect(result).toBe(line);
    });
});

describe('extractSubpath – curves', () => {
    it('emits a cubic command when trimming a cubic segment', () => {
        const cubic: PathCommand[] = [
            { type: 'M', x: 0, y: 0 },
            { type: 'C', x1: 0, y1: 10, x2: 10, y2: 10, x: 10, y: 0 },
        ];
        const result = extractSubpath(cubic, 0.2, 0.8) as PathCommand[];
        expect(result[0].type).toBe('M');
        expect(result.some((c) => c.type === 'C')).toBe(true);
    });
});
