import { describe, it, expect } from 'vitest';
import { ditherEffect, type DitherEffect } from '@/attributes/shape/effects/implementations/dither';

const base: DitherEffect = {
    type: 'dither', levels: 2, matrix: 4, scale: 1, monochrome: false, noise: 'bayer',
};

describe('ditherEffect', () => {
    it('interpolates the continuous fields', () => {
        const mid = ditherEffect.lerp(base, { ...base, levels: 6, scale: 5 }, 0.5);
        expect(mid.levels).toBe(4);
        expect(mid.scale).toBe(3);
    });

    it('hard-cuts noise at t=0.5 — two threshold fields have no blend', () => {
        const to: DitherEffect = { ...base, noise: 'blue' };
        expect(ditherEffect.lerp(base, to, 0.4).noise).toBe('bayer');
        expect(ditherEffect.lerp(base, to, 0.6).noise).toBe('blue');
    });

    it('distinguishes the two noise sources', () => {
        expect(ditherEffect.equals(base, { ...base })).toBe(true);
        expect(ditherEffect.equals(base, { ...base, noise: 'blue' })).toBe(false);
    });
});
