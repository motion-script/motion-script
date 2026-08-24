import { describe, it, expect } from 'vitest';
import { lerpSizeInput, lerpInsets } from '@/layout/tweens';
import { InsetsResolved } from '@/attributes/layout/insets';

describe('lerpSizeInput', () => {
    it('interpolates between two numbers', () => {
        expect(lerpSizeInput(0, 100, 0.5)).toBe(50);
    });

    it('hard-switches to the target at t=1 when a keyword is involved', () => {
        expect(lerpSizeInput(100, 'fill', 1)).toBe('fill');
    });

    it('holds the source before t=1 when a keyword is involved', () => {
        expect(lerpSizeInput(100, 'fill', 0.9)).toBe(100);
        expect(lerpSizeInput('hug', 50, 0.5)).toBe('hug');
    });
});

describe('lerpInsets', () => {
    const a: InsetsResolved = { left: 0, right: 0, top: 0, bottom: 0 };
    const b: InsetsResolved = { left: 10, right: 20, top: 30, bottom: 40 };

    it('interpolates each side independently', () => {
        expect(lerpInsets(a, b, 0.5)).toEqual({ left: 5, right: 10, top: 15, bottom: 20 });
    });

    it('returns the endpoints at t=0 and t=1', () => {
        expect(lerpInsets(a, b, 0)).toEqual(a);
        expect(lerpInsets(a, b, 1)).toEqual(b);
    });
});
