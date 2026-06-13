import { describe, it, expect } from 'vitest';
import { Clip, ClipShapeOp } from '@/render/clip';
import { PathBuilder } from '@/render/descriptors/path-builder';

describe('Clip', () => {
    it('records shape ops in order', () => {
        const c = new Clip()
            .rect({ width: 10, height: 10 })
            .ellipse({ width: 5, height: 5 })
            .polygon({ sides: 6 })
            .polygram({ sides: 5, ratio: 0.5 })
            .line({})
            .path({});

        expect(c.ops().map((o) => o.kind)).toEqual([
            'rect', 'ellipse', 'polygon', 'polygram', 'line', 'path',
        ]);
    });

    it('carries each shape op state through unchanged', () => {
        const c = new Clip().rect({ width: 200, height: 120, cornerRadius: 16 });
        const op = c.ops()[0] as ClipShapeOp;
        expect(op.kind).toBe('rect');
        expect(op.state).toEqual({ width: 200, height: 120, cornerRadius: 16 });
    });

    it('normalizes a PathBuilder into a path op with a PathState', () => {
        const builder = new PathBuilder().moveTo(0, 0).lineTo(10, 10).close();
        const c = new Clip().path(builder);

        const op = c.ops()[0] as ClipShapeOp;
        expect(op.kind).toBe('path');
        // toPathState() stores the command list under `d`.
        expect((op.state as any).d).toEqual(builder.toCommands());
    });

    it('records cut() as a compositing op in order', () => {
        const c = new Clip()
            .rect({ width: 200, height: 120 })
            .ellipse({ x: 60, width: 40, height: 40 })
            .cut();

        expect(c.ops().map((o) => o.kind)).toEqual(['rect', 'ellipse', 'cut']);
    });

    it('chaining returns the same Clip instance', () => {
        const c = new Clip();
        expect(c.rect({ width: 1, height: 1 })).toBe(c);
        expect(c.ellipse({ width: 1, height: 1 })).toBe(c);
        expect(c.cut()).toBe(c);
    });

    it('isEmpty is true for a fresh Clip and for a cut-only Clip', () => {
        expect(new Clip().isEmpty()).toBe(true);
        // A cut with no shapes still describes no region.
        expect(new Clip().cut().isEmpty()).toBe(true);
    });

    it('isEmpty is false once any shape is recorded', () => {
        expect(new Clip().rect({ width: 1, height: 1 }).isEmpty()).toBe(false);
        expect(new Clip().ellipse({ width: 1, height: 1 }).cut().isEmpty()).toBe(false);
    });

    it('ops() reflects later mutations (returns the live list)', () => {
        const c = new Clip().rect({ width: 1, height: 1 });
        expect(c.ops()).toHaveLength(1);
        c.ellipse({ width: 2, height: 2 });
        expect(c.ops()).toHaveLength(2);
    });
});
