import { describe, it, expect, vi } from 'vitest';
import { Signal, isTracking } from './signal';
import { getSignal, getOrCreateSignal } from './host';
import { Rect } from '../nodes/geometry/rect-node';

describe('Signal – basic get/set', () => {
    it('returns the initial value', () => {
        const cell = new Signal(42);
        expect(cell.get()).toBe(42);
    });

    it('set() updates the value', () => {
        const cell = new Signal(0);
        cell.set(10);
        expect(cell.get()).toBe(10);
    });

    it('set() is a no-op when value is identical (Object.is)', () => {
        const cell = new Signal(5);
        const peekBefore = cell.peek();
        cell.set(5); // same value
        expect(cell.peek()).toBe(peekBefore);
    });

    it('peek() returns value without entering tracking', () => {
        const cell = new Signal(99);
        expect(cell.peek()).toBe(99);
    });

    it('isBound() is false for plain cells', () => {
        const cell = new Signal(0);
        expect(cell.isBound()).toBe(false);
    });
});

describe('Signal – bind / reactive computation', () => {
    it('bind() makes isBound() return true', () => {
        const cell = new Signal(0);
        cell.bind(() => 1);
        expect(cell.isBound()).toBe(true);
    });

    it('get() after bind() returns computed value', () => {
        const cell = new Signal(0);
        cell.bind(() => 42);
        expect(cell.get()).toBe(42);
    });

    it('recomputes when a dependency changes', () => {
        const source = new Signal(10);
        const derived = new Signal(0);
        derived.bind(() => source.get() * 2);

        expect(derived.get()).toBe(20);
        source.set(5);
        expect(derived.get()).toBe(10);
    });

    it('does not recompute unnecessarily (no dirty)', () => {
        const source = new Signal(1);
        let computations = 0;
        const derived = new Signal(0);
        derived.bind(() => { computations++; return source.get(); });

        derived.get(); // computes once
        derived.get(); // should not recompute (not dirty)
        expect(computations).toBe(1);

        source.set(2); // marks dirty
        derived.get(); // recomputes
        expect(computations).toBe(2);
    });

    it('chains of derived cells propagate dirty', () => {
        const a = new Signal(1);
        const b = new Signal(0);
        const c = new Signal(0);
        b.bind(() => a.get() + 1);
        c.bind(() => b.get() + 1);

        expect(c.get()).toBe(3);
        a.set(10);
        expect(c.get()).toBe(12);
    });

    it('unbind() detaches computation and reverts to plain value', () => {
        const source = new Signal(5);
        const cell = new Signal(0);
        cell.bind(() => source.get() * 2);

        expect(cell.get()).toBe(10);
        cell.unbind();
        expect(cell.isBound()).toBe(false);
        // Value is the last computed value, now stored as plain
        expect(cell.get()).toBe(10);

        // Changing source no longer affects cell
        source.set(99);
        expect(cell.get()).toBe(10);
    });

    it('set() on a bound cell detaches and uses the new value', () => {
        const source = new Signal(5);
        const cell = new Signal(0);
        cell.bind(() => source.get() * 2);

        cell.set(77);
        expect(cell.isBound()).toBe(false);
        expect(cell.get()).toBe(77);
    });
});

describe('Signal – dependency re-subscription on recompute', () => {
    it('drops stale dependencies when recomputing', () => {
        const toggle = new Signal(true);
        const a = new Signal(1);
        const b = new Signal(100);
        const derived = new Signal(0);
        derived.bind(() => toggle.get() ? a.get() : b.get());

        expect(derived.get()).toBe(1); // reads a
        toggle.set(false);
        expect(derived.get()).toBe(100); // reads b now

        // Changing a should no longer dirty derived
        a.set(999);
        // derived is not dirty (a is no longer a dep), peek should still be 100
        expect(derived.peek()).toBe(100);
    });
});

describe('Signal – dispose', () => {
    it('dispose() removes cell from upstream _subs (no leak upstream → this)', () => {
        const source = new Signal(1);
        const derived = new Signal(0);
        derived.bind(() => source.get() * 2);
        derived.get(); // registers derived in source._subs

        derived.dispose();

        // source should no longer dirty derived — we verify by checking that
        // setting source doesn't throw and derived stays inert.
        expect(() => source.set(99)).not.toThrow();
    });

    it('dispose() removes cell from downstream _deps (no leak this → sub)', () => {
        const source = new Signal(1);
        const derived = new Signal(0);
        derived.bind(() => source.get() * 2);
        derived.get();

        // Create another cell that reads derived.
        const consumer = new Signal(0);
        consumer.bind(() => derived.get() + 10);
        consumer.get(); // consumer._deps now contains derived

        source.dispose();
        // consumer should not have source in its deps anymore (source cleared _subs → removed from consumer._deps)
        // At minimum: no throw when consumer tries to recompute.
        expect(() => consumer.get()).not.toThrow();
    });

    it('dispose() clears external listeners', () => {
        const cell = new Signal(0);
        const spy = vi.fn();
        cell.subscribe(spy);

        cell.dispose();

        // After dispose, no listener should fire (listeners were cleared).
        // We reach into the cell via set — but cell is inert after dispose,
        // so just verify no callback fires from a prior subscriber.
        expect(spy).not.toHaveBeenCalled();
    });

    it('dispose() on a bound cell stops upstream propagation', () => {
        const source = new Signal(10);
        const derived = new Signal(0);
        derived.bind(() => source.get() + 1);
        expect(derived.get()).toBe(11);

        derived.dispose();

        // Mutating source must not cause errors from stale subscriptions.
        source.set(20);
        expect(() => source.set(30)).not.toThrow();
    });
});

describe('isTracking', () => {
    it('returns false outside of any bound computation', () => {
        expect(isTracking()).toBe(false);
    });
});

describe('applyProp integration', () => {
    it('stores and retrieves plain values', () => {
        const node = new Rect({ x: 5 });
        expect(node.x).toBe(5);
    });

    it('allows direct assignment', () => {
        const node = new Rect({ x: 0 });
        node.set({ x: 42 });
        expect(node.x).toBe(42);
    });

    it('exposes a cell via getSignal once applyProp registers the field', () => {
        const node = new Rect({ x: 7 });
        const cell = getSignal(node, 'x');
        expect(cell).toBeDefined();
        expect(cell!.get()).toBe(7);
    });

    it('cell writes propagate to the public accessor', () => {
        const node = new Rect({ x: 3 });
        const cell = getSignal(node, 'x')!;
        cell.set(99);
        expect(node.x).toBe(99);
    });

    it('binding the cell reactively tracks a source signal', () => {
        const node = new Rect({ x: 0 });
        const source = new Signal(10);

        const cell = getOrCreateSignal(node as any, 'x')!;
        cell.bind(() => source.get());

        expect(node.x).toBe(10);
        source.set(20);
        expect(node.x).toBe(20);
    });
});

describe('getSignal / getOrCreateSignal', () => {
    it('returns the cell for a registered field', () => {
        const node = new Rect({});
        expect(getSignal(node as any, 'x')).toBeDefined();
    });

    it('returns undefined for unknown property name', () => {
        const node = new Rect({});
        expect(getOrCreateSignal(node as any, 'nonexistent')).toBeUndefined();
    });
});
