import { describe, it, expect } from 'vitest';
import { lerpText } from '@/attributes/text/lerp';

describe('lerpText', () => {
    it('returns from at t<=0 and to at t>=1', () => {
        expect(lerpText('abc', 'xyz', 0)).toBe('abc');
        expect(lerpText('abc', 'xyz', 1)).toBe('xyz');
        expect(lerpText('abc', 'xyz', -0.5)).toBe('abc');
        expect(lerpText('abc', 'xyz', 2)).toBe('xyz');
    });

    it('returns to immediately when the strings are identical', () => {
        expect(lerpText('same', 'same', 0.5)).toBe('same');
    });

    it('preserves a common prefix and suffix throughout', () => {
        // "cat" -> "cot": prefix "c", suffix "t", middle a->o.
        for (let t = 0; t <= 1; t += 0.1) {
            const out = lerpText('cat', 'cot', t);
            expect(out.startsWith('c')).toBe(true);
            expect(out.endsWith('t')).toBe(true);
        }
    });

    it('shrinks the removed middle before growing the added middle', () => {
        // Pure append: "go" -> "going". prefix "go", nothing removed.
        const early = lerpText('go', 'going', 0.25);
        const late = lerpText('go', 'going', 0.9);
        expect(early.length).toBeLessThanOrEqual(late.length);
        expect(late.startsWith('go')).toBe(true);
    });

    it('handles truncation (to is a prefix of from)', () => {
        const mid = lerpText('hello', 'hel', 0.5);
        expect(mid.startsWith('hel')).toBe(true);
        expect(mid.length).toBeGreaterThanOrEqual(3);
        expect(mid.length).toBeLessThanOrEqual(5);
    });

    it('never produces a string longer than both endpoints combined', () => {
        const out = lerpText('abcdef', 'uvwxyz', 0.5);
        expect(out.length).toBeLessThanOrEqual('abcdef'.length + 'uvwxyz'.length);
    });
});
