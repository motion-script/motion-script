import { describe, it, expect } from 'vitest';
import {
    isUniformCornerRadiusInput,
    isUniformCornerRadius,
    getUniformCornerRadius,
    isZeroCornerRadius,
    lerpCornerRadius,
    resolveCornerRadius,
    CornerRadiusResolved,
} from '@/attributes/shape/corners/corner-radius';
import { resolveCornerStyle, lerpCornerStyle } from '@/attributes/shape/corners/corner-style';

const corners = (tl: number, tr: number, bl: number, br: number): CornerRadiusResolved => ({
    topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br,
});

describe('isUniformCornerRadiusInput', () => {
    it('is true for a number', () => {
        expect(isUniformCornerRadiusInput(8)).toBe(true);
    });

    it('is false for an object', () => {
        expect(isUniformCornerRadiusInput({ topLeft: 8 })).toBe(false);
    });
});

describe('isUniformCornerRadius', () => {
    it('is true when every corner is equal', () => {
        expect(isUniformCornerRadius(corners(4, 4, 4, 4))).toBe(true);
    });

    it('is false when a corner differs', () => {
        expect(isUniformCornerRadius(corners(4, 4, 4, 5))).toBe(false);
    });
});

describe('getUniformCornerRadius', () => {
    it('returns the (shared) topLeft corner', () => {
        expect(getUniformCornerRadius(corners(4, 4, 4, 4))).toBe(4);
    });
});

describe('isZeroCornerRadius', () => {
    it('is true when every corner is 0', () => {
        expect(isZeroCornerRadius(corners(0, 0, 0, 0))).toBe(true);
    });

    it('is false when any corner is non-zero', () => {
        expect(isZeroCornerRadius(corners(0, 0, 0, 1))).toBe(false);
    });
});

describe('resolveCornerRadius', () => {
    it('expands a number to all four corners', () => {
        expect(resolveCornerRadius(10)).toEqual(corners(10, 10, 10, 10));
    });

    it('fills missing corners from previous, then 0', () => {
        const previous = corners(1, 2, 3, 4);
        expect(resolveCornerRadius({ topLeft: 99 }, previous)).toEqual(corners(99, 2, 3, 4));
    });

    it('defaults unspecified corners to 0 with no previous', () => {
        expect(resolveCornerRadius({ topRight: 5 })).toEqual(corners(0, 5, 0, 0));
    });

    // Axis shorthands — these mappings are part of the public contract, pinned here.
    it('{ top, bottom } sets the top pair and bottom pair', () => {
        expect(resolveCornerRadius({ top: 10, bottom: 20 })).toEqual(corners(10, 10, 20, 20));
    });

    it('{ top } alone sets only the top corners, rest fall back to 0', () => {
        expect(resolveCornerRadius({ top: 10 })).toEqual(corners(10, 10, 0, 0));
    });

    it('{ left, right } sets the left pair and right pair', () => {
        // corners(tl, tr, bl, br): left → tl + bl, right → tr + br
        expect(resolveCornerRadius({ left: 10, right: 20 })).toEqual(corners(10, 20, 10, 20));
    });

    it('per-corner keys take the whole branch when mixed with axis keys', () => {
        // The per-corner form wins outright: the `top` axis value is ignored, so
        // topRight is not set by it and falls back to 0.
        expect(resolveCornerRadius({ top: 10, topLeft: 99 } as never)).toEqual(corners(99, 0, 0, 0));
    });
});

describe('lerpCornerRadius', () => {
    it('interpolates each corner independently', () => {
        const from = corners(0, 0, 0, 0);
        const to = corners(10, 20, 30, 40);
        expect(lerpCornerRadius(from, to, 0.5)).toEqual(corners(5, 10, 15, 20));
    });

    it('returns endpoints at t=0 and t=1', () => {
        const from = corners(1, 2, 3, 4);
        const to = corners(5, 6, 7, 8);
        expect(lerpCornerRadius(from, to, 0)).toEqual(from);
        expect(lerpCornerRadius(from, to, 1)).toEqual(to);
    });
});

describe('resolveCornerStyle', () => {
    it('expands a single style to all corners', () => {
        expect(resolveCornerStyle('angled')).toEqual({
            topLeft: 'angled', topRight: 'angled', bottomLeft: 'angled', bottomRight: 'angled',
        });
    });

    it('defaults to rounded for unspecified corners', () => {
        expect(resolveCornerStyle({ topLeft: 'angled' })).toEqual({
            topLeft: 'angled', topRight: 'rounded', bottomLeft: 'rounded', bottomRight: 'rounded',
        });
    });

    it('supports the { top, bottom } shorthand', () => {
        expect(resolveCornerStyle({ top: 'angled' })).toEqual({
            topLeft: 'angled', topRight: 'angled', bottomLeft: 'rounded', bottomRight: 'rounded',
        });
    });
});

describe('lerpCornerStyle', () => {
    it('snaps at the midpoint', () => {
        const from = resolveCornerStyle('rounded');
        const to = resolveCornerStyle('angled');
        expect(lerpCornerStyle(from, to, 0.49).topLeft).toBe('rounded');
        expect(lerpCornerStyle(from, to, 0.5).topLeft).toBe('angled');
    });
});
