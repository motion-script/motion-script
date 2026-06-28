import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseColor, setTheme, getTypographyPreset } from '@/attributes/shape/fill/color/parser';

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

describe('parseColor – opacity suffix', () => {
    it('applies a percentage opacity to a named color', () => {
        expectColor(parseColor('white/10'), [1, 1, 1, 0.1]);
    });

    it('applies opacity to a CSS named color', () => {
        expectColor(parseColor('red/30'), [1, 0, 0, 0.3]);
    });

    it('applies opacity to a hex color', () => {
        expectColor(parseColor('#00ff00/50'), [0, 1, 0, 0.5]);
    });

    it('composes opacity with an existing alpha channel', () => {
        // #00ff0080 has alpha 0.5; /50 scales it to 0.25.
        expectColor(parseColor('#00ff0080/50'), [0, 1, 0, 128 / 255 * 0.5]);
    });

    it('clamps opacity above 100% to 1', () => {
        expectColor(parseColor('red/150'), [1, 0, 0, 1]);
    });

    it('tolerates a trailing percent sign', () => {
        expectColor(parseColor('red/30%'), [1, 0, 0, 0.3]);
    });

    it('does not treat the internal slash-alpha of rgb() as an opacity suffix', () => {
        expectColor(parseColor('rgb(0 0 255 / 0.25)'), [0, 0, 1, 0.25]);
    });

    it('combines a theme color with an opacity suffix', () => {
        setTheme({ colors: { primary: '#0000ff' } });
        expectColor(parseColor('primary/90'), [0, 0, 1, 0.9]);
        setTheme();
    });
});

describe('setTheme – colors', () => {
    afterEach(() => setTheme()); // clear theme entries between tests

    it('registers a named theme color resolvable by name', () => {
        setTheme({ colors: { brand: '#ff0000' } });
        expectColor(parseColor('brand'), [1, 0, 0, 1]);
    });

    it('does not corrupt a cached theme color when opacity is applied', () => {
        setTheme({ colors: { brand: '#ff0000' } });
        parseColor('brand/20');
        expectColor(parseColor('brand'), [1, 0, 0, 1]); // still fully opaque
    });

    it('accepts a pre-normalized tuple', () => {
        setTheme({ colors: { accent: [0, 0, 1, 1] } });
        expectColor(parseColor('accent'), [0, 0, 1, 1]);
    });

    it('takes precedence over a CSS named color', () => {
        setTheme({ colors: { red: '#0000ff' } });
        expectColor(parseColor('red'), [0, 0, 1, 1]);
    });

    it('clears entries when called with no argument', () => {
        setTheme({ colors: { brand: '#ff0000' } });
        setTheme();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(parseColor('brand')).toEqual([0, 0, 0, 1]);
        warn.mockRestore();
    });

    it('flattens a nested color group to dash-joined names', () => {
        setTheme({ colors: { brand: { 500: '#0ea5e9' } } });
        expectColor(parseColor('brand-500'), parseColor('#0ea5e9'));
    });

    it('flattens numeric group keys and supports an opacity suffix on them', () => {
        setTheme({ colors: { brand: { 100: '#ff0000', 900: '#0000ff' } } });
        expectColor(parseColor('brand-100'), [1, 0, 0, 1]);
        expectColor(parseColor('brand-900/50'), [0, 0, 1, 0.5]);
    });

    it('flattens arbitrarily deep nesting', () => {
        setTheme({ colors: { a: { b: { c: '#00ff00' } } } });
        expectColor(parseColor('a-b-c'), [0, 1, 0, 1]);
    });

    it('lowercases keys (camelCase resolves only in lowercased form)', () => {
        setTheme({ colors: { brandPrimary: '#ff0000' } });
        expectColor(parseColor('brandprimary'), [1, 0, 0, 1]);
    });
});

describe('setTheme – typography', () => {
    afterEach(() => setTheme());

    it('registers a preset resolvable by variant name', () => {
        setTheme({ typography: { header: { fontSize: 96, fontWeight: 700 } } });
        expect(getTypographyPreset('header')).toEqual({ fontSize: 96, fontWeight: 700 });
    });

    it('looks up case-insensitively', () => {
        setTheme({ typography: { Header: { fontSize: 96 } } });
        expect(getTypographyPreset('HEADER')).toEqual({ fontSize: 96 });
    });

    it('returns undefined for an unregistered variant', () => {
        setTheme({ typography: { header: { fontSize: 96 } } });
        expect(getTypographyPreset('missing')).toBeUndefined();
    });

    it('clears presets when called with no argument', () => {
        setTheme({ typography: { header: { fontSize: 96 } } });
        setTheme();
        expect(getTypographyPreset('header')).toBeUndefined();
    });
});
