import { describe, it, expect } from 'vitest';
import { resolveAnchor } from '@/attributes/layout/anchor';

describe('resolveAnchor', () => {
    it('maps named positions to per-axis pivots (y-up: +1 top, -1 bottom)', () => {
        expect(resolveAnchor('center')).toEqual({ x: 0, y: 0 });
        expect(resolveAnchor('topLeft')).toEqual({ x: -1, y: 1 });
        expect(resolveAnchor('topRight')).toEqual({ x: 1, y: 1 });
        expect(resolveAnchor('bottomLeft')).toEqual({ x: -1, y: -1 });
        expect(resolveAnchor('bottomRight')).toEqual({ x: 1, y: -1 });
        expect(resolveAnchor('topCenter')).toEqual({ x: 0, y: 1 });
        expect(resolveAnchor('bottomCenter')).toEqual({ x: 0, y: -1 });
        expect(resolveAnchor('centerLeft')).toEqual({ x: -1, y: 0 });
        expect(resolveAnchor('centerRight')).toEqual({ x: 1, y: 0 });
    });

    it('passes an explicit Vector2 through unchanged', () => {
        expect(resolveAnchor({ x: -1, y: 0.5 })).toEqual({ x: -1, y: 0.5 });
    });

    it('returns a fresh object for both forms (no shared/mutable references)', () => {
        const named = resolveAnchor('center');
        named.x = 99;
        expect(resolveAnchor('center')).toEqual({ x: 0, y: 0 });

        const input = { x: 1, y: 1 };
        const out = resolveAnchor(input);
        expect(out).not.toBe(input);
    });

    it('throws on an unknown named position', () => {
        // @ts-expect-error – not an AnchorKey
        expect(() => resolveAnchor('middle')).toThrow(/Unknown anchor value/);
    });
});
