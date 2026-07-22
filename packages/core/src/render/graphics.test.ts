import { describe, it, expect } from 'vitest';
import { Graphics, GraphicsShapeOp } from '@/render/graphics';
import { PathBuilder } from '@/render/descriptors/path-builder';
import { Effects } from '@/attributes/shape/effects/chain';

describe('Graphics', () => {
    it('records shapes and paint ops in order', () => {
        const g = new Graphics()
            .ellipse({ width: 10, height: 10 })
            .rect({ width: 5, height: 5 })
            .fill('red')
            .stroke({ weight: 2, fill: 'black' })
            .shadow({ fill: 'green', blur: 4 });

        expect(g.ops().map((o) => o.kind)).toEqual([
            'ellipse', 'rect', 'fill', 'stroke', 'shadow',
        ]);
    });

    it('normalizes a PathBuilder into a path op with a PathState', () => {
        const builder = new PathBuilder().moveTo(0, 0).lineTo(10, 10).close();
        const g = new Graphics().path(builder);

        const op = g.ops()[0] as GraphicsShapeOp;
        expect(op.kind).toBe('path');
        // toPathState() stores the command list under `data`.
        expect((op.state as any).data).toEqual(builder.toCommands());
    });

    it('rotation/scale/opacity are graphics-level modifiers, not shape ops', () => {
        const g = new Graphics()
            .rect({ width: 1, height: 1 })
            .rotation(30)
            .scale(2)
            .opacity(0.5);

        const op = g.ops()[0] as GraphicsShapeOp;
        // None of the modifiers merge into the shape — they're graphics-level.
        expect(op.state.rotation).toBeUndefined();
        expect(op.state.scale).toBeUndefined();
        expect(op.state.opacity).toBeUndefined();
        expect(g.groupOpacity()).toBe(0.5);
        expect(g.groupTransform()).toEqual({ rotation: 30, scale: 2, center: undefined });
        // Opacity < 1 still needs a whole-graphics layer; effects no longer do.
        expect(g.needsGroupLayer()).toBe(true);
        // Only the single shape op is recorded; these modifiers don't add ops.
        expect(g.ops()).toHaveLength(1);
    });

    it('effects() records an ordered op (scoped like fill), not a graphics-level field', () => {
        const g = new Graphics()
            .rect({ width: 1, height: 1 })
            .fill('red')
            .effects([{ type: 'blur', blur: 2 }]);

        // The effect is an in-order op after its shape group, mirroring fill.
        expect(g.ops().map((o) => o.kind)).toEqual(['rect', 'fill', 'effects']);
        expect(g.ops()[2]).toEqual({ kind: 'effects', effects: [{ type: 'blur', blur: 2 }] });
        // Effects alone do not force a whole-graphics layer — each op scopes its own.
        expect(g.needsGroupLayer()).toBe(false);
    });

    it('effects() accepts a ChainableFx (FX builder) and resolves the op to a SceneEffect[]', () => {
        const g = new Graphics().rect({ width: 1, height: 1 }).effects(Effects.blur(8).grayscale(1));
        expect(g.ops()[1]).toEqual({
            kind: 'effects',
            effects: [
                { type: 'blur', blur: 8 },
                { type: 'grayscale', amount: 1 },
            ],
        });
    });

    it('effects() scopes per group: each call closes its group, shapes after start fresh', () => {
        const g = new Graphics()
            .ellipse({ width: 2, height: 2 })
            .ellipse({ width: 3, height: 3 })
            .fill('red')
            .effects(Effects.blur(4))
            .rect({ width: 4, height: 4 })
            .fill('blue')
            .effects(Effects.scatter(2));

        // Two independent segments, each ending in its own effects op — as if two
        // separate Graphics were drawn.
        expect(g.ops().map((o) => o.kind)).toEqual([
            'ellipse', 'ellipse', 'fill', 'effects', 'rect', 'fill', 'effects',
        ]);
        expect(g.ops()[3]).toEqual({ kind: 'effects', effects: [{ type: 'blur', blur: 4 }] });
        expect(g.ops()[6]).toEqual({ kind: 'effects', effects: [{ type: 'scatter', strength: 2, direction: 'both' }] });
    });

    it('rotation/scale accept an explicit center pivot', () => {
        const g = new Graphics()
            .rect({ width: 1, height: 1 })
            .rotation(45, { x: 10, y: 20 });
        expect(g.groupTransform()).toEqual({ rotation: 45, scale: 1, center: { x: 10, y: 20 } });
    });

    it('rotation/scale accept a named-anchor center pivot (resolved later by the renderer)', () => {
        const g = new Graphics()
            .rect({ width: 1, height: 1 })
            .rotation(90, 'topRight');
        // The anchor name is carried through verbatim; the renderer resolves it
        // against the union's bounding box at paint time.
        expect(g.groupTransform()).toEqual({ rotation: 90, scale: 1, center: 'topRight' });
    });

    it('groupTransform is null when rotation/scale are identity', () => {
        expect(new Graphics().rect({ width: 1, height: 1 }).opacity(0.2).groupTransform()).toBeNull();
    });

    it('rotation/scale before any shape still record group transform; ops stay empty', () => {
        const g = new Graphics().rotation(10).scale(3).opacity(0.2);
        expect(g.ops()).toHaveLength(0);
        expect(g.groupOpacity()).toBe(0.2);
        expect(g.groupTransform()).toEqual({ rotation: 10, scale: 3, center: undefined });
    });

    it('needsGroupLayer is false for a plain graphics', () => {
        expect(new Graphics().rect({ width: 1, height: 1 }).fill('red').needsGroupLayer()).toBe(false);
    });

    it('records cut/mask/applyMask/endMask compositing ops in order', () => {
        const g = new Graphics()
            .mask({ mode: 'alpha' })
            .ellipse({ width: 1, height: 1 })
            .fill('white')
            .applyMask()
            .rect({ width: 2, height: 2 })
            .fill('red')
            .endMask();

        expect(g.ops().map((o) => o.kind)).toEqual([
            'mask', 'ellipse', 'fill', 'applyMask', 'rect', 'fill', 'endMask',
        ]);
    });

    it('isPaintOnly is true for a fill/stroke-only Graphics (e.g. boolean result)', () => {
        expect(new Graphics().fill('red').stroke({ weight: 1, fill: 'black' }).isPaintOnly()).toBe(true);
        expect(new Graphics().rect({ width: 1, height: 1 }).fill('red').isPaintOnly()).toBe(false);
    });
});
