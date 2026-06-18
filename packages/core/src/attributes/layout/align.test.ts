import { describe, it, expect } from 'vitest';
import { resolveAlign } from '@/attributes/layout/align';

describe('resolveAlign', () => {
    it('maps named positions to per-axis pivots (y-up: +1 top, -1 bottom)', () => {
        expect(resolveAlign('center')).toEqual({ x: 0, y: 0 });
        expect(resolveAlign('topLeft')).toEqual({ x: -1, y: 1 });
        expect(resolveAlign('topRight')).toEqual({ x: 1, y: 1 });
        expect(resolveAlign('bottomLeft')).toEqual({ x: -1, y: -1 });
        expect(resolveAlign('bottomRight')).toEqual({ x: 1, y: -1 });
        expect(resolveAlign('topCenter')).toEqual({ x: 0, y: 1 });
        expect(resolveAlign('bottomCenter')).toEqual({ x: 0, y: -1 });
        expect(resolveAlign('leftCenter')).toEqual({ x: -1, y: 0 });
        expect(resolveAlign('rightCenter')).toEqual({ x: 1, y: 0 });
    });

    it('passes an explicit Vector2 through unchanged', () => {
        expect(resolveAlign({ x: -1, y: 0.5 })).toEqual({ x: -1, y: 0.5 });
    });

    it('returns a fresh object for both forms (no shared/mutable references)', () => {
        const named = resolveAlign('center');
        named.x = 99;
        expect(resolveAlign('center')).toEqual({ x: 0, y: 0 });

        const input = { x: 1, y: 1 };
        const out = resolveAlign(input);
        expect(out).not.toBe(input);
    });

    it('throws on an unknown named position', () => {
        // @ts-expect-error – not an AlignName
        expect(() => resolveAlign('middle')).toThrow(/Unknown align value/);
    });
});
