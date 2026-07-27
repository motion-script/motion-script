import { describe, it, expect } from 'vitest';
import {
    ASCII_CHARSETS,
    resolveAsciiCharset,
    asciiEffect,
    type AsciiEffect,
} from '@/attributes/shape/effects/implementations/ascii';

const base: AsciiEffect = {
    type: 'ascii',
    size: 12,
    charset: 'standard',
    fontFamily: 'monospace',
    ink: 'white',
    background: 'black',
    colored: false,
};

describe('ascii charsets', () => {
    it('resolves every named charset to a non-empty ramp', () => {
        for (const [name, ramp] of Object.entries(ASCII_CHARSETS)) {
            expect(resolveAsciiCharset(name), name).toBe(ramp);
            expect(ramp.length, name).toBeGreaterThan(1);
        }
    });

    it('passes a custom ramp through untouched', () => {
        expect(resolveAsciiCharset(' .oO@')).toBe(' .oO@');
    });

    it('falls back to standard for an unknown name', () => {
        // A bare word is ambiguous — it could be a typo'd preset or a one-glyph
        // ramp. Treating it as a ramp would render a single character everywhere.
        expect(resolveAsciiCharset('standrd')).toBe('standrd');
    });

    it('orders ramps least-ink first, so index 0 is the darkest result', () => {
        // The renderer indexes by luminance and relies on this ordering; the
        // ramps are only correct if they start empty and end solid.
        expect(ASCII_CHARSETS.standard.startsWith(' ')).toBe(true);
        expect(ASCII_CHARSETS.standard.endsWith('@')).toBe(true);
        expect(ASCII_CHARSETS.blocks.startsWith(' ')).toBe(true);
        expect(ASCII_CHARSETS.blocks.endsWith('█')).toBe(true);
    });
});

describe('asciiEffect data', () => {
    it('needs a shader scope', () => {
        expect(asciiEffect.surface).toBe('shader');
    });

    it('interpolates the cell size and the colours', () => {
        const mid = asciiEffect.lerp(base, { ...base, size: 24, ink: 'black' }, 0.5);
        expect(mid.size).toBe(18);
        expect(mid.ink).toEqual([0.5, 0.5, 0.5, 1]);
    });

    it('snaps the discrete fields at the midpoint', () => {
        const to: AsciiEffect = { ...base, charset: 'blocks', fontFamily: 'Inter', colored: true };
        expect(asciiEffect.lerp(base, to, 0.4)).toMatchObject({
            charset: 'standard', fontFamily: 'monospace', colored: false,
        });
        expect(asciiEffect.lerp(base, to, 0.6)).toMatchObject({
            charset: 'blocks', fontFamily: 'Inter', colored: true,
        });
    });

    it('compares colours by value, not by spelling', () => {
        expect(asciiEffect.equals(base, { ...base, ink: '#ffffff' })).toBe(true);
        expect(asciiEffect.equals(base, { ...base, ink: 'red' })).toBe(false);
    });

    it('treats a different charset or family as a different effect', () => {
        // Both change what gets baked, so a stale atlas would otherwise be reused.
        expect(asciiEffect.equals(base, { ...base, charset: 'blocks' })).toBe(false);
        expect(asciiEffect.equals(base, { ...base, fontFamily: 'Inter' })).toBe(false);
    });
});
