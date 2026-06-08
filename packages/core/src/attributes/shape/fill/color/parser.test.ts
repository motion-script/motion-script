import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseColor, setTheme } from '@/attributes/shape/fill/color/parser';

/** Asserts an RGBA tuple matches expected channels within float tolerance. */
function expectColor(actual: number[], expected: number[], precision = 2) {
    expect(actual).toHaveLength(4);
    actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], precision));
}

describe('parseColor – named colors', () => {
    it('resolves a CSS named color', () => {
        expectColor(parseColor('red'), [1, 0, 0, 1]);
    });

    it('is case-insensitive and trims whitespace', () => {
        expectColor(parseColor('  RED  '), [1, 0, 0, 1]);
    });

    it('resolves transparent to zero alpha', () => {
        expectColor(parseColor('transparent'), [0, 0, 0, 0]);
    });
});

describe('parseColor – hex', () => {
    it('parses #RRGGBB', () => {
        expectColor(parseColor('#ff0000'), [1, 0, 0, 1]);
    });

    it('expands shorthand #RGB', () => {
        expectColor(parseColor('#f00'), [1, 0, 0, 1]);
    });

    it('parses #RRGGBBAA with alpha', () => {
        expectColor(parseColor('#00ff0080'), [0, 1, 0, 128 / 255]);
    });

    it('expands shorthand #RGBA', () => {
        expectColor(parseColor('#0f08'), [0, 1, 0, 0x88 / 255]);
    });
});

describe('parseColor – rgb / rgba', () => {
    it('parses 0-255 channel form', () => {
        expectColor(parseColor('rgb(255, 0, 0)'), [1, 0, 0, 1]);
    });

    it('parses percentage channels', () => {
        expectColor(parseColor('rgb(100%, 0%, 0%)'), [1, 0, 0, 1]);
    });

    it('parses legacy comma alpha (rgba)', () => {
        expectColor(parseColor('rgba(0, 0, 255, 0.5)'), [0, 0, 1, 0.5]);
    });

    it('parses modern slash alpha', () => {
        expectColor(parseColor('rgb(0 0 255 / 0.25)'), [0, 0, 1, 0.25]);
    });
});

describe('parseColor – hsl', () => {
    it('parses pure red (hue 0)', () => {
        expectColor(parseColor('hsl(0, 100%, 50%)'), [1, 0, 0, 1]);
    });

    it('parses pure green (hue 120)', () => {
        expectColor(parseColor('hsl(120, 100%, 50%)'), [0, 1, 0, 1]);
    });

    it('parses white (lightness 100%)', () => {
        expectColor(parseColor('hsl(0, 0%, 100%)'), [1, 1, 1, 1]);
    });
});

describe('parseColor – CIE / Ok color spaces', () => {
    it('parses oklch lightness extremes near black and white', () => {
        const black = parseColor('oklch(0 0 0)');
        const white = parseColor('oklch(1 0 0)');
        expect(black[0]).toBeCloseTo(0, 1);
        expect(white[0]).toBeCloseTo(1, 1);
    });

    it('lab(100 0 0) is near white', () => {
        expectColor(parseColor('lab(100 0 0)'), [1, 1, 1, 1], 1);
    });
});

describe('parseColor – fallback', () => {
    it('warns and returns opaque black for unsupported input', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(parseColor('not-a-color')).toEqual([0, 0, 0, 1]);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });
});

describe('setTheme', () => {
    afterEach(() => setTheme()); // clear theme entries between tests

    it('registers a named theme color resolvable by name', () => {
        setTheme({ brand: '#ff0000' });
        expectColor(parseColor('brand'), [1, 0, 0, 1]);
    });

    it('accepts a pre-normalized tuple', () => {
        setTheme({ accent: [0, 0, 1, 1] });
        expectColor(parseColor('accent'), [0, 0, 1, 1]);
    });

    it('takes precedence over a CSS named color', () => {
        setTheme({ red: '#0000ff' });
        expectColor(parseColor('red'), [0, 0, 1, 1]);
    });

    it('clears entries when called with no argument', () => {
        setTheme({ brand: '#ff0000' });
        setTheme();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(parseColor('brand')).toEqual([0, 0, 0, 1]);
        warn.mockRestore();
    });
});
