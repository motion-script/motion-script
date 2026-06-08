import { describe, it, expect } from 'vitest';
import { resolvePadding, PaddingResolved } from '@/attributes/layout/padding';

describe('resolvePadding', () => {
    it('expands a single number to all four sides', () => {
        expect(resolvePadding(8)).toEqual({ left: 8, right: 8, top: 8, bottom: 8 });
    });

    it('uses explicit per-side values', () => {
        expect(resolvePadding({ left: 1, right: 2, top: 3, bottom: 4 })).toEqual({
            left: 1, right: 2, top: 3, bottom: 4,
        });
    });

    it('applies symmetric horizontal/vertical shorthands', () => {
        expect(resolvePadding({ horizontal: 10, vertical: 20 })).toEqual({
            left: 10, right: 10, top: 20, bottom: 20,
        });
    });

    it('prefers an explicit side over the symmetric shorthand', () => {
        expect(resolvePadding({ horizontal: 10, left: 99 })).toEqual({
            left: 99, right: 10, top: 0, bottom: 0,
        });
    });

    it('falls back to previous values when a side is unspecified', () => {
        const previous: PaddingResolved = { left: 5, right: 6, top: 7, bottom: 8 };
        expect(resolvePadding({ left: 1 }, previous)).toEqual({
            left: 1, right: 6, top: 7, bottom: 8,
        });
    });

    it('defaults to 0 when neither side, shorthand, nor previous is given', () => {
        expect(resolvePadding({})).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
    });
});
