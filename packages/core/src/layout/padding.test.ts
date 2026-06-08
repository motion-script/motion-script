import { describe, it, expect } from 'vitest';
import { applyPadding, expandByPadding } from '@/layout/padding';
import { PaddingResolved } from '@/attributes/layout/padding';

const pad = (l: number, r: number, t: number, b: number): PaddingResolved => ({
    left: l, right: r, top: t, bottom: b,
});

describe('applyPadding', () => {
    it('subtracts horizontal and vertical padding from the outer size', () => {
        const area = applyPadding(100, 80, pad(10, 10, 5, 5));
        expect(area.width).toBe(80);
        expect(area.height).toBe(70);
    });

    it('clamps negative inner sizes to 0', () => {
        const area = applyPadding(10, 10, pad(20, 20, 20, 20));
        expect(area.width).toBe(0);
        expect(area.height).toBe(0);
    });

    it('reports a zero center offset for symmetric padding', () => {
        const area = applyPadding(100, 100, pad(10, 10, 10, 10));
        expect(area.offsetX).toBe(0);
        expect(area.offsetY).toBe(0);
    });

    it('shifts the center toward the smaller-padded side', () => {
        const area = applyPadding(100, 100, pad(20, 0, 0, 10));
        expect(area.offsetX).toBe(10); // (20 - 0) / 2
        expect(area.offsetY).toBe(-5); // (0 - 10) / 2
    });
});

describe('expandByPadding', () => {
    it('adds padding back to recover the outer size', () => {
        expect(expandByPadding(80, 70, pad(10, 10, 5, 5))).toEqual({ width: 100, height: 80 });
    });

    it('round-trips with applyPadding for non-clamped sizes', () => {
        const p = pad(7, 3, 4, 6);
        const inner = applyPadding(200, 150, p);
        const outer = expandByPadding(inner.width, inner.height, p);
        expect(outer).toEqual({ width: 200, height: 150 });
    });
});
