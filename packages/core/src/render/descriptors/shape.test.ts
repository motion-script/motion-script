import { describe, it, expect } from 'vitest';
import { resolveShapePivot } from './shape';
import { withRectDescriptor } from './rect';

describe('resolveShapePivot', () => {
    it('passes an explicit Vector2 through', () => {
        expect(resolveShapePivot({ x: 0.5, y: -0.25 })).toEqual({ x: 0.5, y: -0.25 });
    });

    it('defaults to centre when absent', () => {
        expect(resolveShapePivot(undefined)).toEqual({ x: 0, y: 0 });
    });

    it('resolves a named anchor to its normalised [-1,1] pivot (y-up)', () => {
        expect(resolveShapePivot('topRight')).toEqual({ x: 1, y: 1 });
        expect(resolveShapePivot('bottomLeft')).toEqual({ x: -1, y: -1 });
        expect(resolveShapePivot('center')).toEqual({ x: 0, y: 0 });
        expect(resolveShapePivot('centerLeft')).toEqual({ x: -1, y: 0 });
        expect(resolveShapePivot('bottomCenter')).toEqual({ x: 0, y: -1 });
    });
});

describe('with*Descriptor normalises a named-anchor pivot', () => {
    it('rect resolves a named pivot to a Vector2 in the descriptor state', () => {
        const state = withRectDescriptor({ width: 10, height: 10, pivot: 'topRight' });
        expect(state.pivot).toEqual({ x: 1, y: 1 });
    });

    it('rect keeps an explicit Vector2 pivot', () => {
        const state = withRectDescriptor({ width: 10, height: 10, pivot: { x: 0.3, y: 0.7 } });
        expect(state.pivot).toEqual({ x: 0.3, y: 0.7 });
    });

    it('rect defaults pivot to centre', () => {
        const state = withRectDescriptor({ width: 10, height: 10 });
        expect(state.pivot).toEqual({ x: 0, y: 0 });
    });
});
