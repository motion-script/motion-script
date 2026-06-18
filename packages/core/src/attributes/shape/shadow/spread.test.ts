import { describe, it, expect } from 'vitest';
import { resolveShadow, resolveShadowArray } from './resolver';
import { lerpShadowArray } from './lerp';

describe('shadow spread', () => {
    it('defaults to 0', () => {
        expect(resolveShadow({ blur: 10 }).spread).toBe(0);
    });
    it('honours an explicit value', () => {
        expect(resolveShadow({ blur: 10, spread: 12 }).spread).toBe(12);
    });
    it('allows negative spread', () => {
        expect(resolveShadow({ blur: 10, spread: -6 }).spread).toBe(-6);
    });
    it('carries from previous when unspecified', () => {
        const prev = resolveShadow({ blur: 10, spread: 8 });
        expect(resolveShadow({ blur: 20 }, prev).spread).toBe(8);
    });
    it('interpolates linearly across a tween', () => {
        const from = resolveShadowArray({ blur: 0, spread: 0 });
        const to = resolveShadowArray({ blur: 40, spread: 20 });
        expect(lerpShadowArray(from, to, 0.5)[0].spread).toBe(10);
        expect(lerpShadowArray(from, to, 1)[0].spread).toBe(20);
    });
});
