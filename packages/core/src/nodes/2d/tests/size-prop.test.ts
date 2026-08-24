import { describe, it, expect } from 'vitest';
import { Node2D } from '@/nodes/2d/node2d';
import { Signal } from '@/signals/signal';
import { attached } from '@/nodes/node/node.fixtures';

/** A bare leaf node usable directly (Node2D's constructor accepts Node2DProps). */
class Tile extends Node2D {
    constructor(props?: any) {
        super(props ?? {});
    }
}

describe('Node2D `size` prop', () => {
    it('sets width and height to the same numeric value at construction', () => {
        const n = new Tile({ size: 200 });
        expect(n.width).toBe(200);
        expect(n.height).toBe(200);
    });

    it('sets width and height to the same keyword value', () => {
        const n = new Tile({ size: 'fill' });
        expect(n.width).toBe('fill');
        expect(n.height).toBe('fill');

        const hug = new Tile({ size: 'hug' });
        expect(hug.width).toBe('hug');
        expect(hug.height).toBe('hug');
    });

    it('lets an explicit width/height override size on the same axis', () => {
        const n = new Tile({ size: 200, width: 100 });
        expect(n.width).toBe(100);
        expect(n.height).toBe(200);

        const m = new Tile({ size: 200, height: 50 });
        expect(m.width).toBe(200);
        expect(m.height).toBe(50);
    });

    it('does not affect width/height when omitted', () => {
        const n = new Tile({ width: 300, height: 150 });
        expect(n.width).toBe(300);
        expect(n.height).toBe(150);
    });

    it('supports a reactive binding, tracked independently per axis', () => {
        const source = new Signal<number>(50);
        const n = new Tile({ size: () => source.get() });
        expect(n.width).toBe(50);
        expect(n.height).toBe(50);

        source.set(120);
        expect(n.width).toBe(120);
        expect(n.height).toBe(120);
    });

    it('is settable imperatively via set()', () => {
        const n = new Tile({ size: 100 });
        n.set({ size: 250 } as any);
        expect(n.width).toBe(250);
        expect(n.height).toBe(250);
    });

    it('set() lets an explicit width/height in the same call override size', () => {
        const n = new Tile({ size: 100 });
        n.set({ size: 250, width: 60 } as any);
        expect(n.width).toBe(60);
        expect(n.height).toBe(250);
    });

    it('is tweenable via to(), animating both axes together', () => {
        const n = attached(new Tile({ size: 0 }));
        const gen = n.to({ size: 100 } as any, 1)[Symbol.iterator]();
        let res = gen.next();
        while (!res.done) res = gen.next(0.5);
        expect(n.width).toBe(100);
        expect(n.height).toBe(100);
    });

    it('to() interpolates both axes over the duration', () => {
        const n = attached(new Tile({ size: 0 }));
        const gen = n.to({ size: 100 } as any, 1)[Symbol.iterator]();
        gen.next();          // prime, t=0
        gen.next(0.5);        // t=0.5 → halfway
        expect(n.width).toBeCloseTo(50);
        expect(n.height).toBeCloseTo(50);
        gen.next(0.5);        // t=1 → done
        expect(n.width).toBe(100);
        expect(n.height).toBe(100);
    });
});
