import { describe, it, expect } from 'vitest';
import {
    isUniformBorderRadius,
    getUniformBorderRadius,
    isZeroBorderRadius,
    lerpBorderRadius,
    resolveBorderRadius,
    BorderRadiusResolved,
} from '@/attributes/shape/corners/border-radius';

const corners = (tl: number, tr: number, bl: number, br: number): BorderRadiusResolved => ({
    topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br,
});

describe('isUniformBorderRadius', () => {
    it('is true for a number', () => {
        expect(isUniformBorderRadius(8)).toBe(true);
    });

    it('is false for an object', () => {
        expect(isUniformBorderRadius({ topLeft: 8 })).toBe(false);
    });
});

describe('getUniformBorderRadius', () => {
    it('returns the (shared) topLeft corner', () => {
        expect(getUniformBorderRadius(corners(4, 4, 4, 4))).toBe(4);
    });
});

describe('isZeroBorderRadius', () => {
    it('is true when every corner is 0', () => {
        expect(isZeroBorderRadius(corners(0, 0, 0, 0))).toBe(true);
    });

    it('is false when any corner is non-zero', () => {
        expect(isZeroBorderRadius(corners(0, 0, 0, 1))).toBe(false);
    });
});

describe('resolveBorderRadius', () => {
    it('expands a number to all four corners', () => {
        expect(resolveBorderRadius(10)).toEqual(corners(10, 10, 10, 10));
    });

    it('fills missing corners from previous, then 0', () => {
        const previous = corners(1, 2, 3, 4);
        expect(resolveBorderRadius({ topLeft: 99 }, previous)).toEqual(corners(99, 2, 3, 4));
    });

    it('defaults unspecified corners to 0 with no previous', () => {
        expect(resolveBorderRadius({ topRight: 5 })).toEqual(corners(0, 5, 0, 0));
    });
});

describe('lerpBorderRadius', () => {
    it('interpolates each corner independently', () => {
        const from = corners(0, 0, 0, 0);
        const to = corners(10, 20, 30, 40);
        expect(lerpBorderRadius(from, to, 0.5)).toEqual(corners(5, 10, 15, 20));
    });

    it('returns endpoints at t=0 and t=1', () => {
        const from = corners(1, 2, 3, 4);
        const to = corners(5, 6, 7, 8);
        expect(lerpBorderRadius(from, to, 0)).toEqual(from);
        expect(lerpBorderRadius(from, to, 1)).toEqual(to);
    });
});
