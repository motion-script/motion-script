import { describe, it, expect, vi } from 'vitest';
import { createSignal } from '@/signals/create';
import { Signal } from '@/signals/signal';
import { linear } from '@/tween/ease/constants';

function drive(gen: Generator<void, void, number>, dt = 1 / 60): number {
    let frames = 0;
    let result = gen.next();
    while (!result.done) {
        result = gen.next(dt);
        if (++frames > 100_000) throw new Error('generator did not terminate');
    }
    return frames;
}

describe('createSignal – basic read/write', () => {
    it('returns the initial value via get()', () => {
        const s = createSignal(10);
        expect(s.get()).toBe(10);
    });

    it('zero-arg call is sugar for get()', () => {
        const s = createSignal(42);
        expect(s()).toBe(42);
    });

    it('set() updates the value', () => {
        const s = createSignal(0);
        s.set(5);
        expect(s.get()).toBe(5);
    });

    it('single-arg call writes the value', () => {
        const s = createSignal(0);
        s(7);
        expect(s.get()).toBe(7);
    });

    it('updater function receives previous value', () => {
        const s = createSignal(10);
        s.set((prev) => prev + 5);
        expect(s.get()).toBe(15);
    });

    it('updater via single-arg call works the same', () => {
        const s = createSignal(10);
        s((prev: number) => prev * 2);
        expect(s.get()).toBe(20);
    });
});

describe('createSignal – reactive binding', () => {
    it('binds to a zero-arity function and tracks dependencies', () => {
        const source = createSignal(1);
        const derived = createSignal(0);
        derived.set(() => source.get() * 10);

        expect(derived.get()).toBe(10);
        source.set(3);
        expect(derived.get()).toBe(30);
    });

    it('chain of derived signals propagates updates', () => {
        const a = createSignal(1);
        const b = createSignal(0);
        const c = createSignal(0);
        b.set(() => a.get() + 1);
        c.set(() => b.get() + 1);

        expect(c.get()).toBe(3);
        a.set(10);
        expect(c.get()).toBe(12);
    });

    it('plain value initializer is non-reactive', () => {
        const source = createSignal(5);
        const independent = createSignal(source.get());
        source.set(99);
        expect(independent.get()).toBe(5);
    });

    it('passing an existing signal returns the same signal', () => {
        const a = createSignal(1);
        const b = createSignal(a);
        expect(b).toBe(a);
    });
});

describe('createSignal – subscribe', () => {
    it('fires the subscriber when the value changes', () => {
        const s = createSignal(0);
        const fn = vi.fn();
        s.subscribe(fn);
        s.set(1);
        expect(fn).toHaveBeenCalledWith(1);
    });

    it('does not fire for set with identical value', () => {
        const s = createSignal(5);
        const fn = vi.fn();
        s.subscribe(fn);
        s.set(5);
        expect(fn).not.toHaveBeenCalled();
    });

    it('unsubscribe stops notifications', () => {
        const s = createSignal(0);
        const fn = vi.fn();
        const off = s.subscribe(fn);
        off();
        s.set(99);
        expect(fn).not.toHaveBeenCalled();
    });

    it('subscriber sees recomputed value when an upstream signal changes', () => {
        const source = createSignal(1);
        const derived = createSignal(0);
        derived.set(() => source.get() * 2);

        const fn = vi.fn();
        derived.subscribe(fn);
        // Ensure first compute happened
        derived.get();

        source.set(5);
        // The signal cell propagates eagerly to listened-to derived cells.
        expect(fn).toHaveBeenLastCalledWith(10);
    });
});

describe('createSignal – tween', () => {
    it('returns a FrameGenerator from tween()', () => {
        const s = createSignal(0);
        const gen = s.tween(10, 0.1, linear);
        expect(typeof gen.next).toBe('function');
    });

    it('arity ≥ 2 with numeric duration via call form delegates to tween', () => {
        const s = createSignal(0);
        const gen = s(10 as any, 0.1, linear);
        expect(typeof (gen as any).next).toBe('function');
    });

    it('tween advances numeric value to target by the end', () => {
        const s = createSignal(0);
        drive(s.tween(100, 0.2, linear));
        expect(s.get()).toBe(100);
    });

    it('intermediate value is between from and to', () => {
        const s = createSignal(0);
        const gen = s.tween(100, 0.5, linear);
        gen.next();
        gen.next(0.1);
        expect(s.get()).toBeGreaterThan(0);
        expect(s.get()).toBeLessThan(100);
    });

    it('applies easing function', () => {
        const s = createSignal(0);
        const seen: number[] = [];
        const easing = (t: number) => {
            seen.push(t);
            return t;
        };
        drive(s.tween(10, 0.05, easing));
        expect(seen.length).toBeGreaterThan(0);
        expect(s.get()).toBe(10);
    });

    it('uses defaultLerp when provided to createSignal', () => {
        type Pair = { x: number };
        const lerp = (from: Pair, to: Pair, t: number): Pair => ({
            x: from.x + (to.x - from.x) * t,
        });
        const s = createSignal<Pair>({ x: 0 }, lerp);
        drive(s.tween({ x: 100 }, 0.1, linear));
        expect(s.get().x).toBe(100);
    });

    it('custom lerp overrides default for a single tween', () => {
        const s = createSignal(0);
        const captured: number[] = [];
        const lerp = (from: number, to: number, t: number): number => {
            captured.push(t);
            return from + (to - from) * t;
        };
        drive(s.tween(10, 0.05, linear, lerp));
        expect(captured.length).toBeGreaterThan(0);
        expect(s.get()).toBe(10);
    });

    it('non-numeric values without lerp snap at t=1', () => {
        const s = createSignal<string>('a');
        drive(s.tween('b', 0.05, linear));
        expect(s.get()).toBe('b');
    });

    it('lerpNullable handles initial null', () => {
        const s = createSignal<number | null>(null);
        drive(s.tween(50, 0.1, linear));
        expect(s.get()).toBe(50);
    });

    it('lerpNullable handles null target (returns from)', () => {
        const s = createSignal<number | null>(10);
        drive(s.tween(null, 0.1, linear));
        expect(s.get()).toBe(10);
    });
});

describe('createSignal – interaction with Signal', () => {
    it('binding the underlying cell still drives the signal', () => {
        const upstream = new Signal(7);
        const s = createSignal(0);
        s.set(() => upstream.get() + 1);
        expect(s.get()).toBe(8);

        upstream.set(20);
        expect(s.get()).toBe(21);
    });
});
