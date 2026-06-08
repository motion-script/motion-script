import { describe, it, expect } from 'vitest';
import { FilterRegistry } from '@/attributes/shape/filters/registry';
import { MediaFilter } from '@/attributes/shape/filters/union';
// Importing the implementations registers them via module side effects.
import '@/attributes/shape/filters/implementations/blur';
import '@/attributes/shape/filters/implementations/alpha';
import '@/attributes/shape/filters/implementations/grayscale';
import '@/attributes/shape/filters/implementations/curves';

describe('FilterRegistry – registration', () => {
    it('reports registered built-in filters via has()', () => {
        expect(FilterRegistry.has('blur')).toBe(true);
        expect(FilterRegistry.has('alpha')).toBe(true);
    });

    it('returns undefined for an unknown type', () => {
        expect(FilterRegistry.get('does-not-exist')).toBeUndefined();
    });

    it('throws when the same type is registered twice', () => {
        const dummy = { lerp: (a: any) => a, equals: () => true };
        FilterRegistry.register('test-unique-type', dummy as any);
        expect(() => FilterRegistry.register('test-unique-type', dummy as any)).toThrow(/already registered/i);
    });
});

describe('FilterRegistry.lerp', () => {
    it('interpolates two filters of the same registered type', () => {
        const result = FilterRegistry.lerp(
            { type: 'blur', value: 0 },
            { type: 'blur', value: 10 },
            0.5,
        ) as Extract<MediaFilter, { type: 'blur' }>;
        expect(result.value).toBe(5);
    });

    it('hard-cuts at t=0.5 when the two filter types differ', () => {
        const from: MediaFilter = { type: 'blur', value: 1 };
        const to: MediaFilter = { type: 'alpha', value: 1 };
        expect(FilterRegistry.lerp(from, to, 0.4)).toBe(from);
        expect(FilterRegistry.lerp(from, to, 0.6)).toBe(to);
    });
});

describe('FilterRegistry.lerpArray', () => {
    it('lerps matched indices pairwise', () => {
        const from: MediaFilter[] = [{ type: 'blur', value: 0 }];
        const to: MediaFilter[] = [{ type: 'blur', value: 8 }];
        const out = FilterRegistry.lerpArray(from, to, 0.5);
        expect(out).toEqual([{ type: 'blur', value: 4 }]);
    });

    it('keeps extra source entries when the target is shorter', () => {
        const from: MediaFilter[] = [{ type: 'blur', value: 2 }, { type: 'alpha', value: 1 }];
        const to: MediaFilter[] = [{ type: 'blur', value: 2 }];
        const out = FilterRegistry.lerpArray(from, to, 0.5);
        expect(out).toHaveLength(2);
        expect(out[1]).toEqual({ type: 'alpha', value: 1 });
    });

    it('keeps extra target entries when the source is shorter', () => {
        const from: MediaFilter[] = [{ type: 'blur', value: 2 }];
        const to: MediaFilter[] = [{ type: 'blur', value: 2 }, { type: 'alpha', value: 0.5 }];
        const out = FilterRegistry.lerpArray(from, to, 0.5);
        expect(out).toHaveLength(2);
        expect(out[1]).toEqual({ type: 'alpha', value: 0.5 });
    });
});

describe('registered implementations – lerp & equals', () => {
    it('blur lerps and compares by value', () => {
        const data = FilterRegistry.get('blur')!;
        expect(data.lerp({ type: 'blur', value: 0 } as any, { type: 'blur', value: 4 } as any, 0.25))
            .toEqual({ type: 'blur', value: 1 });
        expect(data.equals({ type: 'blur', value: 3 } as any, { type: 'blur', value: 3 } as any)).toBe(true);
        expect(data.equals({ type: 'blur', value: 3 } as any, { type: 'blur', value: 4 } as any)).toBe(false);
    });

    it('curves lerps points and hard-cuts the channel at t=0.5', () => {
        const data = FilterRegistry.get('curves')!;
        const from = { type: 'curves', channel: 'r', points: [[0, 0], [1, 1]] } as any;
        const to = { type: 'curves', channel: 'g', points: [[0, 0.5], [1, 0.5]] } as any;
        const early = data.lerp(from, to, 0.25) as any;
        const late = data.lerp(from, to, 0.75) as any;
        expect(early.channel).toBe('r');
        expect(late.channel).toBe('g');
        expect(early.points[0][1]).toBeCloseTo(0.125, 6);
    });
});
