import { describe, it, expect } from 'vitest';
import { applyDashPattern } from '@/attributes/shape/path/dash';
import { PathCommand } from '@/render/descriptors/path';

const line: PathCommand[] = [
    { type: 'M', x: 0, y: 0 },
    { type: 'L', x: 100, y: 0 },
];

describe('applyDashPattern – guards', () => {
    it('returns empty string for an empty dash array', () => {
        expect(applyDashPattern(line, [])).toBe('');
    });

    it('returns empty string when the dash cycle sums to zero', () => {
        expect(applyDashPattern(line, [0, 0])).toBe('');
    });

    it('returns empty string for a zero-length path', () => {
        const point: PathCommand[] = [{ type: 'M', x: 5, y: 5 }];
        expect(applyDashPattern(point, [4, 4])).toBe('');
    });
});

describe('applyDashPattern – output', () => {
    it('produces an SVG path string containing move and line commands', () => {
        const out = applyDashPattern(line, [10, 10]);
        expect(out).toMatch(/M /);
        expect(out).toMatch(/L /);
    });

    it('begins drawing (an "on" run) at the path start', () => {
        const out = applyDashPattern(line, [10, 10]);
        expect(out.trimStart().startsWith('M')).toBe(true);
    });

    it('emits dashes only along an "on" run, leaving gaps for "off"', () => {
        // A coarse pattern over a 100px line should yield multiple separate runs.
        const out = applyDashPattern(line, [10, 10]);
        const moveCount = (out.match(/M /g) ?? []).length;
        expect(moveCount).toBeGreaterThan(1);
    });
});
