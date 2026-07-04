import { describe, it, expect } from 'vitest';
import { resolveShapeAnchor, resolvePivotPosition, resolveShapePivot } from './shape';
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

describe('resolveShapeAnchor', () => {
    it('a bare pivot (no matching x/y offset applied here) passes x/y through unchanged', () => {
        // resolveShapeAnchor alone stays a pure pass-through in the no-anchor case —
        // it re-runs on already-resolved state (BaseShape.resolveState), so it must
        // not re-derive an offset from a `pivot` that's already been applied.
        expect(resolveShapeAnchor({ x: 0, y: 0, pivot: 'topRight' }, 100, 100))
            .toEqual({ x: 0, y: 0, pivot: 'topRight' });
    });

    it('defaults to a centered pivot with plain x/y and no pivot', () => {
        expect(resolveShapeAnchor({ x: 10, y: 20 }, 100, 100)).toEqual({ x: 10, y: 20, pivot: { x: 0, y: 0 } });
    });
});

describe('resolvePivotPosition', () => {
    it('an explicit pivot + plain x/y lands that corner on (x, y), matching the anchor shorthand', () => {
        const viaPivot = resolveShapeAnchor(resolvePivotPosition({ x: 0, y: 0, pivot: 'topRight' }, 100, 100), 100, 100);
        const viaShorthand = resolveShapeAnchor({ topRight: { x: 0, y: 0 } }, 100, 100);
        expect(viaPivot).toEqual(viaShorthand);
        expect(viaPivot).toEqual({ x: -50, y: -50, pivot: { x: 1, y: 1 } });
    });

    it('an explicit Vector2 pivot offsets the centre the same way as a named anchor', () => {
        const resolved = resolveShapeAnchor(
            resolvePivotPosition({ x: 0, y: 0, pivot: { x: 0.5, y: -0.5 } }, 100, 100), 100, 100,
        );
        expect(resolved).toEqual({ x: -25, y: 25, pivot: { x: 0.5, y: -0.5 } });
    });

    it('is a no-op when pivot is centre/absent', () => {
        const input = { x: 10, y: 20 };
        expect(resolvePivotPosition(input, 100, 100)).toBe(input);
    });

    it('is a no-op when an anchor shorthand is already present', () => {
        const input = { topRight: { x: 0, y: 0 } };
        expect(resolvePivotPosition(input, 100, 100)).toBe(input);
    });

    it('a second resolveShapeAnchor pass over its output does not double-apply the offset', () => {
        // Mirrors the real pipeline: `flipPositionY` calls resolvePivotPosition once,
        // then resolveShapeAnchor; `BaseShape.resolveState` (with*Descriptor) later
        // calls resolveShapeAnchor again on that same already-resolved state, but
        // never resolvePivotPosition again.
        const once = resolvePivotPosition({ x: 0, y: 0, pivot: 'topRight' }, 100, 100);
        const resolvedOnce = resolveShapeAnchor(once, 100, 100);
        const resolvedTwice = resolveShapeAnchor(resolvedOnce, 100, 100);
        expect(resolvedTwice).toEqual(resolvedOnce);
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
