import { describe, it, expect } from 'vitest';
import { Node2D } from '@/nodes/2d/node2d';
import { Signal } from '@/signals/signal';
import { attached } from '@/nodes/node/node.fixtures';
import type { Command } from '@/tween/command';

/** A bare leaf node usable directly (Node2D's constructor accepts Node2DProps). */
class Tile extends Node2D {
    constructor(props?: any) {
        super(props ?? {});
    }
}

/** Drive a Command (or any Iterable<void>) to completion with a fixed frame delta. */
function drive(command: Command<Record<string, never>>, dt: number): void {
    const step = command._stepper();
    step.seek(0);
        let done = false;           // prime to first yield
    while (!done) done = step.advance(dt);
}

describe('Node2D.save / restore', () => {
    it('restores a plain prop instantly', () => {
        const n = new Tile({ x: 10, y: 20 });
        n.save();

        n.set({ x: 200, y: -50 });
        expect(n.x).toBe(200);

        n.restore();
        expect(n.x).toBe(10);
        expect(n.y).toBe(20);
    });

    it('restores multiple props at once', () => {
        const n = new Tile({ x: 0, opacity: 1, rotation: 0, scale: 1 });
        n.save();

        n.set({ x: 99, opacity: 0.2, rotation: 45, scale: 3 });
        n.restore();

        expect(n.x).toBe(0);
        expect(n.opacity).toBe(1);
        expect(n.rotation).toBe(0);
        expect(n.scale).toBe(1);
    });

    it('is a no-op when the stack is empty', () => {
        const n = new Tile({ x: 5 });
        expect(() => n.restore()).not.toThrow();
        expect(n.x).toBe(5);
    });

    it('behaves like a LIFO stack (nested save/restore)', () => {
        const n = new Tile({ x: 0 });

        n.set({ x: 1 });
        n.save();                 // layer A: x = 1
        n.set({ x: 2 });
        n.save();                 // layer B: x = 2
        n.set({ x: 3 });

        n.restore();              // pop B
        expect(n.x).toBe(2);
        n.restore();              // pop A
        expect(n.x).toBe(1);
    });

    it('captures and re-binds reactive bindings, not just their resolved value', () => {
        const source = new Signal(10);
        const n = new Tile({ x: () => source.get() });
        expect(n.x).toBe(10);

        n.save();                 // x is bound to source

        n.set({ x: 999 });        // overwrite with a plain value (detaches binding)
        expect(n.x).toBe(999);

        n.restore();              // should re-bind, not freeze at 10
        expect(n.x).toBe(10);
        source.set(42);
        expect(n.x).toBe(42);     // binding is live again
    });

    it('snapshots the resolved value at save time for a bound cell', () => {
        const source = new Signal(7);
        const n = new Tile({ x: () => source.get() });

        n.save();
        source.set(8);            // change after save — snapshot should keep re-binding fn
        n.set({ x: 0 });

        n.restore();
        // Re-bound to source, which now reads 8.
        expect(n.x).toBe(8);
    });

    it('animates numeric props back over a duration', () => {
        const n = new Tile({ x: 0, opacity: 1 });
        n.save();

        n.set({ x: 100, opacity: 0 });

        // duration 1s, dt 0.25 → t = 0, .25, .5, .75, 1
        drive(n.restore(1), 0.25);

        expect(n.x).toBeCloseTo(0);
        expect(n.opacity).toBeCloseTo(1);
    });

    it('passes through intermediate values during an animated restore', () => {
        const n = attached(new Tile({ x: 0 }));
        n.save();
        n.set({ x: 100 });

        const step = n.restore(1)._stepper();
        step.seek(0);               // prime, t=0 → still at the current value (100)
        expect(n.x).toBeCloseTo(100);
        step.advance(0.5);            // t=0.5 → halfway from 100 to 0
        expect(n.x).toBeCloseTo(50);
        step.advance(0.5);            // t=1 → fully restored
        expect(n.x).toBeCloseTo(0);
    });

    it('re-binds reactive props at the end of an animated restore', () => {
        const source = new Signal(0);
        const n = new Tile({ x: () => source.get() });
        n.save();

        n.set({ x: 100 });        // detach binding, jump away
        drive(n.restore(1), 0.25);

        // Tween lands on the saved resolved value (0)...
        expect(n.x).toBeCloseTo(0);
        // ...and the binding is live again.
        source.set(33);
        expect(n.x).toBe(33);
    });

    it('animated restore is a no-op generator when the stack is empty', () => {
        const n = new Tile({ x: 5 });
        expect(() => drive(n.restore(1), 0.5)).not.toThrow();
        expect(n.x).toBe(5);
    });

    it('each restore pops only one layer even when animated', () => {
        const n = new Tile({ x: 0 });
        n.set({ x: 1 });
        n.save();
        n.set({ x: 2 });
        n.save();
        n.set({ x: 5 });

        drive(n.restore(1), 0.5);  // pop top layer (x=2)
        expect(n.x).toBeCloseTo(2);

        n.restore();               // pop next layer (x=1)
        expect(n.x).toBe(1);
    });
});
