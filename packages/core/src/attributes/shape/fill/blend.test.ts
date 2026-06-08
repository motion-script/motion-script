import { describe, it, expect } from 'vitest';
import { BlendModes, getBlendModeHash } from '@/attributes/shape/fill/blend';

describe('getBlendModeHash', () => {
    it('returns the index of the mode within the list', () => {
        expect(getBlendModeHash('multiply')).toBe(0);
        expect(getBlendModeHash('normal')).toBe(BlendModes.length - 1);
    });

    it('assigns a unique hash to every mode', () => {
        const hashes = BlendModes.map(getBlendModeHash);
        expect(new Set(hashes).size).toBe(BlendModes.length);
    });

    it('matches the list order for each mode', () => {
        BlendModes.forEach((mode, i) => {
            expect(getBlendModeHash(mode)).toBe(i);
        });
    });
});
