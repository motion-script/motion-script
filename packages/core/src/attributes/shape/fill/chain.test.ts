import { describe, it, expect } from 'vitest';
import { Fill, resolveChainFill } from '@/attributes/shape/fill/chain';

describe('Fill builders', () => {
    it('color produces a single solid fill', () => {
        expect([...Fill.color('red')]).toEqual([{ type: 'color', color: 'red' }]);
    });

    it('color carries opacity and blend options', () => {
        expect([...Fill.color('red', { opacity: 0.3, blend: 'overlay' })]).toEqual([
            { type: 'color', color: 'red', opacity: 0.3, blend: 'overlay' },
        ]);
    });

    it('image produces an image fill with common options merged', () => {
        expect([...Fill.image('./bg.jpg', { blend: 'overlay', opacity: 0.2 })]).toEqual([
            { type: 'image', src: './bg.jpg', blend: 'overlay', opacity: 0.2 },
        ]);
    });

    it('omits undefined option keys so props stay minimal', () => {
        expect([...Fill.color('red')]).toEqual([{ type: 'color', color: 'red' }]);
        expect(Object.keys([...Fill.color('red')][0])).toEqual(['type', 'color']);
    });

    it('linearGradient pulls gradient fields out of options', () => {
        expect([...Fill.linearGradient(['red', 'blue'], { opacity: 0.5, start: { x: 0, y: 0 } })]).toEqual([
            { type: 'linear-gradient', colors: ['red', 'blue'], start: { x: 0, y: 0 }, opacity: 0.5 },
        ]);
    });
});

describe('FillChain', () => {
    it('appends fills in order while staying immutable', () => {
        const base = Fill.image('./bg.jpg', { opacity: 0.2 });
        const extended = base.color('red', { opacity: 0.3 });
        expect(base.list).toHaveLength(1);
        expect(extended.list).toHaveLength(2);
        expect(extended.list[1]).toEqual({ type: 'color', color: 'red', opacity: 0.3 });
    });

    it('matches the example from the request', () => {
        const chain = Fill.image('./background.jpg', { blend: 'overlay', opacity: 0.2 })
            .color('red', { opacity: 0.3 });
        expect([...chain]).toEqual([
            { type: 'image', src: './background.jpg', blend: 'overlay', opacity: 0.2 },
            { type: 'color', color: 'red', opacity: 0.3 },
        ]);
    });

    it('is iterable for spreading into an array', () => {
        const arr = [...Fill.color('red').color('blue')];
        expect(arr).toHaveLength(2);
        expect(arr[0]).toEqual({ type: 'color', color: 'red' });
    });

    it('toJSON returns the raw fill list', () => {
        const chain = Fill.color('red');
        expect(chain.toJSON()).toBe(chain.list);
    });
});

describe('resolveChainFill', () => {
    it('returns [] for undefined', () => {
        expect(resolveChainFill(undefined)).toEqual([]);
    });

    it('unwraps a FillChain to its list', () => {
        const chain = Fill.color('red');
        expect(resolveChainFill(chain)).toBe(chain.list);
    });

    it('passes a plain array through (as a flat copy)', () => {
        const arr = [{ type: 'color', color: 'red' } as const];
        expect(resolveChainFill(arr)).toEqual(arr);
    });

    it('wraps a single fill into an array', () => {
        expect(resolveChainFill({ type: 'color', color: 'red' })).toEqual([{ type: 'color', color: 'red' }]);
    });

    it('wraps a plain string fill into an array', () => {
        expect(resolveChainFill('red')).toEqual(['red']);
    });

    it('flattens a FillChain used as an array element', () => {
        expect(resolveChainFill(['#e8c584', Fill.image('bg.jpg')])).toEqual([
            '#e8c584',
            { type: 'image', src: 'bg.jpg' },
        ]);
    });

    it('flattens a multi-layer FillChain element in place', () => {
        const chain = Fill.image('bg.jpg', { opacity: 0.2 }).color('red');
        expect(resolveChainFill(['#e8c584', chain, 'blue'])).toEqual([
            '#e8c584',
            { type: 'image', src: 'bg.jpg', opacity: 0.2 },
            { type: 'color', color: 'red' },
            'blue',
        ]);
    });

    it('treats spread and element forms equivalently', () => {
        const spread = resolveChainFill(['#e8c584', ...Fill.image('bg.jpg')]);
        const element = resolveChainFill(['#e8c584', Fill.image('bg.jpg')]);
        expect(spread).toEqual(element);
    });
});
