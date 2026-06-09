import { describe, it, expect } from 'vitest';
import { Graphics, GraphicsShapeOp } from '@/render/graphics';
import { PathBuilder } from '@/render/descriptors/path-builder';

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
        // toPathState() stores the command list under `d`.
        expect((op.state as any).d).toEqual(builder.toCommands());
    });

    it('rotation merges into the most-recent shape; opacity/effects are group-level', () => {
        const effects: any[] = [{ type: 'blur', radius: 2 }];
        const g = new Graphics()
            .rect({ width: 1, height: 1 })
            .rotation(30)
            .opacity(0.5)
            .effects(effects);

        const op = g.ops()[0] as GraphicsShapeOp;
        expect(op.state.rotation).toBe(30);
        // opacity/effects do NOT merge into the shape — they're group-level.
        expect(op.state.opacity).toBeUndefined();
        expect(op.state.effects).toBeUndefined();
        expect(g.groupOpacity()).toBe(0.5);
        expect(g.groupEffects()).toBe(effects);
        expect(g.needsGroupLayer()).toBe(true);
        // Only the single shape op is recorded; modifiers don't add ops.
        expect(g.ops()).toHaveLength(1);
    });

    it('rotation attaches to the LAST shape when several are chained', () => {
        const g = new Graphics()
            .rect({ width: 1, height: 1 })
            .ellipse({ width: 2, height: 2 })
            .rotation(45);

        const rectOp = g.ops()[0] as GraphicsShapeOp;
        const ellipseOp = g.ops()[1] as GraphicsShapeOp;
        expect(rectOp.state.rotation).toBeUndefined();
        expect(ellipseOp.state.rotation).toBe(45);
    });

    it('rotation before any shape is a no-op; opacity/effects still record group state', () => {
        const g = new Graphics().rotation(10).opacity(0.2);
        expect(g.ops()).toHaveLength(0);
        expect(g.groupOpacity()).toBe(0.2);
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
