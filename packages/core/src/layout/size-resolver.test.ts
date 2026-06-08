import { describe, it, expect } from 'vitest';
import { resolveSize, isAutoSize } from '@/layout/size-resolver';

describe('resolveSize', () => {
    it('returns a fixed number as-is', () => {
        expect(resolveSize(120, 500, 80)).toBe(120);
    });

    it('"fill" returns the available size', () => {
        expect(resolveSize('fill', 500, 80)).toBe(500);
    });

    it('"hug" returns the content size', () => {
        expect(resolveSize('hug', 500, 80)).toBe(80);
    });
});

describe('isAutoSize', () => {
    it('is false for fixed numbers', () => {
        expect(isAutoSize(100)).toBe(false);
        expect(isAutoSize(0)).toBe(false);
    });

    it('is true for "fill" and "hug"', () => {
        expect(isAutoSize('fill')).toBe(true);
        expect(isAutoSize('hug')).toBe(true);
    });
});
