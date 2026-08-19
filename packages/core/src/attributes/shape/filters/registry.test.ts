import { describe, it, expect } from 'vitest';
import {
    lerpFilter, lerpFilterArray, lerpOptionalFilters, isPixelFilter, hasFilter, filterSurface,
} from '@/attributes/shape/filters/registry';
import { MediaAdjustment, VideoOnlyAdjustment } from '@/attributes/shape/filters/union';
import { blurFilter } from '@/attributes/shape/filters/implementations/blur';
import { curvesFilter } from '@/attributes/shape/filters/implementations/curves';

type AnyFilter = MediaAdjustment | VideoOnlyAdjustment;

describe('FILTERS map', () => {
    it('contains every built-in filter, including the new video-only ones', () => {
        for (const type of ['blur', 'alpha', 'grayscale', 'curves', 'posterizeTime', 'echo']) {
            expect(hasFilter(type)).toBe(true);
        }
        expect(hasFilter('does-not-exist')).toBe(false);
    });

    it('classifies pixel vs video-only filters', () => {
        expect(isPixelFilter('blur')).toBe(true);
        expect(isPixelFilter('colorAdjustment')).toBe(true);
        expect(isPixelFilter('posterizeTime')).toBe(false);
        expect(isPixelFilter('echo')).toBe(false);
    });

    it('recognises the scene effects that double as filters', () => {
        for (const type of ['oilPaint', 'dither', 'halftone', 'scanlines', 'sharpen', 'invert']) {
            expect(hasFilter(type)).toBe(true);
            expect(isPixelFilter(type)).toBe(true);
        }
    });
});

describe('filterSurface', () => {
    it('reports a colour transform as composable', () => {
        expect(filterSurface({ type: 'blur', radius: 4 })).toBe('filter');
        expect(filterSurface({ type: 'invert', strength: 1 })).toBe('filter');
    });

    it('reports a position resampler as needing a shader', () => {
        expect(filterSurface({ type: 'oilPaint', radius: 3 })).toBe('shader');
        expect(filterSurface({ type: 'dither', levels: 4, matrix: 4, scale: 2, monochrome: false }))
            .toBe('shader');
    });

    it('ignores a stray `mode` — a fill has no backdrop', () => {
        // `sksl` is the one effect whose surface depends on its own fields.
        expect(filterSurface({ type: 'sksl', code: '', mode: 'backdrop' } as never)).toBe('filter');
    });
});

describe('lerpFilter', () => {
    it('interpolates two filters of the same type (no longer hard-cuts — the populated-map fix)', () => {
        const result = lerpFilter(
            { type: 'blur', radius: 0 },
            { type: 'blur', radius: 10 },
            0.5,
        ) as Extract<MediaAdjustment, { type: 'blur' }>;
        expect(result.radius).toBe(5);
    });

    it('interpolates the new posterizeTime fps', () => {
        const result = lerpFilter(
            { type: 'posterizeTime', fps: 4 },
            { type: 'posterizeTime', fps: 12 },
            0.5,
        ) as Extract<VideoOnlyAdjustment, { type: 'posterizeTime' }>;
        expect(result.fps).toBe(8);
    });

    it('interpolates echo fields and hard-cuts the discrete blend', () => {
        const result = lerpFilter(
            { type: 'echo', echoes: 2, delay: 0.1, decay: 0.4, blend: 'screen' },
            { type: 'echo', echoes: 6, delay: 0.3, decay: 0.8, blend: 'lighten' },
            0.5,
        ) as Extract<VideoOnlyAdjustment, { type: 'echo' }>;
        expect(result.echoes).toBe(4);
        expect(result.delay).toBeCloseTo(0.2, 6);
        expect(result.decay).toBeCloseTo(0.6, 6);
        expect(result.blend).toBe('lighten');
    });

    it('hard-cuts at t=0.5 when the two filter types differ', () => {
        const from: AnyFilter = { type: 'blur', radius: 1 };
        const to: AnyFilter = { type: 'alpha', amount: 1 };
        expect(lerpFilter(from, to, 0.4)).toBe(from);
        expect(lerpFilter(from, to, 0.6)).toBe(to);
    });

    it('hands an effect-backed filter to the effects registry', () => {
        const result = lerpFilter(
            { type: 'oilPaint', radius: 0 },
            { type: 'oilPaint', radius: 6 },
            0.5,
        ) as Extract<MediaAdjustment, { type: 'oilPaint' }>;
        expect(result.radius).toBe(3);
    });
});

describe('lerpOptionalFilters', () => {
    it('answers undefined when neither side has a filter', () => {
        expect(lerpOptionalFilters(undefined, undefined, 0.5)).toBeUndefined();
        expect(lerpOptionalFilters([], undefined, 0.5)).toBeUndefined();
    });

    it('interpolates when either side has one', () => {
        expect(lerpOptionalFilters<AnyFilter>(
            [{ type: 'grayscale', amount: 0 }],
            [{ type: 'grayscale', amount: 1 }],
            0.25,
        )).toEqual([{ type: 'grayscale', amount: 0.25 }]);
    });
});

describe('lerpFilterArray', () => {
    it('lerps matched indices pairwise', () => {
        const from: AnyFilter[] = [{ type: 'blur', radius: 0 }];
        const to: AnyFilter[] = [{ type: 'blur', radius: 8 }];
        expect(lerpFilterArray(from, to, 0.5)).toEqual([{ type: 'blur', radius: 4 }]);
    });

    it('keeps extra source entries when the target is shorter', () => {
        const from: AnyFilter[] = [{ type: 'blur', radius: 2 }, { type: 'alpha', amount: 1 }];
        const to: AnyFilter[] = [{ type: 'blur', radius: 2 }];
        const out = lerpFilterArray(from, to, 0.5);
        expect(out).toHaveLength(2);
        expect(out[1]).toEqual({ type: 'alpha', amount: 1 });
    });

    it('keeps extra target entries when the source is shorter', () => {
        const from: AnyFilter[] = [{ type: 'blur', radius: 2 }];
        const to: AnyFilter[] = [{ type: 'blur', radius: 2 }, { type: 'alpha', amount: 0.5 }];
        const out = lerpFilterArray(from, to, 0.5);
        expect(out).toHaveLength(2);
        expect(out[1]).toEqual({ type: 'alpha', amount: 0.5 });
    });
});

describe('filter data constants – lerp & equals', () => {
    it('blur lerps and compares by radius', () => {
        expect(blurFilter.lerp({ type: 'blur', radius: 0 }, { type: 'blur', radius: 4 }, 0.25))
            .toEqual({ type: 'blur', radius: 1 });
        expect(blurFilter.equals({ type: 'blur', radius: 3 }, { type: 'blur', radius: 3 })).toBe(true);
        expect(blurFilter.equals({ type: 'blur', radius: 3 }, { type: 'blur', radius: 4 })).toBe(false);
    });

    it('curves lerps points and hard-cuts the channel at t=0.5', () => {
        const from = { type: 'curves', channel: 'r', points: [[0, 0], [1, 1]] } as const;
        const to = { type: 'curves', channel: 'g', points: [[0, 0.5], [1, 0.5]] } as const;
        const early = curvesFilter.lerp(from as any, to as any, 0.25) as any;
        const late = curvesFilter.lerp(from as any, to as any, 0.75) as any;
        expect(early.channel).toBe('r');
        expect(late.channel).toBe('g');
        expect(early.points[0][1]).toBeCloseTo(0.125, 6);
    });
});
