import { describe, it, expect } from 'vitest';
import { resolveShadow, resolveShadowArray } from './resolver';
import { lerpShadowArray } from './lerp';

describe('inner shadow flag', () => {
    it('defaults to false', () => {
        expect(resolveShadow({ blur: 10 }).inner).toBe(false);
    });
    it('honours explicit true', () => {
        expect(resolveShadow({ blur: 10, inner: true }).inner).toBe(true);
    });
    it('carries from previous when unspecified', () => {
        const prev = resolveShadow({ blur: 10, inner: true });
        expect(resolveShadow({ blur: 20 }, prev).inner).toBe(true);
    });
    it('keeps the start kind mid-tween and adopts the end at t=1', () => {
        const from = resolveShadowArray({ blur: 0, inner: true });
        const to = resolveShadowArray({ blur: 40, inner: false });
        expect(lerpShadowArray(from, to, 0.5)[0].inner).toBe(true);
        expect(lerpShadowArray(from, to, 1)[0].inner).toBe(false);
    });
});
