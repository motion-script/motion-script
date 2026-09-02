import { describe, it, expect, vi } from 'vitest';
import { createSignal } from '@/signals/create';
import { linear } from '@/tween/ease/constants';

describe('createSignal – read & write', () => {
    it('reads via call and via get()', () => {
        const s = createSignal(5);
        expect(s()).toBe(5);
        expect(s.get()).toBe(5);
    });

    it('writes via set() and via call', () => {
        const s = createSignal(0);
        s.set(10);
        expect(s.get()).toBe(10);
        s(20);
        expect(s.get()).toBe(20);
    });

    it('supports an updater function based on the previous value', () => {
        const s = createSignal(1);
        s.set((prev) => prev + 4);
        expect(s.get()).toBe(5);
    });

    it('binds a zero-arg function as a tracked computation', () => {
        const s = createSignal(0);
        s.set(() => 42);
        expect(s.get()).toBe(42);
    });
});

describe('createSignal – subscribe', () => {
    it('notifies subscribers on change', () => {
        const s = createSignal(0);
        const seen: number[] = [];
        s.subscribe((v) => seen.push(v));
        s.set(1);
        s.set(2);
        expect(seen).toContain(1);
        expect(seen).toContain(2);
    });

    it('returns an unsubscribe that stops further notifications', () => {
        const s = createSignal(0);
        const fn = vi.fn();
        const off = s.subscribe(fn);
        off();
        fn.mockClear();
        s.set(99);
        expect(fn).not.toHaveBeenCalled();
    });
});

describe('createSignal – passthrough', () => {
    it('returns an existing signal unchanged', () => {
        const inner = createSignal(7);
        const outer = createSignal(inner);
        expect(outer).toBe(inner);
    });
});

describe('createSignal – tween', () => {
    /** Evaluate a command at its end — what a timeline does for any frame past it. */
    function runToEnd(command: { at(t: number): unknown }) {
        command.at(1);
    }

    it('reaches the target value when driven to completion', () => {
        const s = createSignal(0);
        runToEnd(s.tween(10, 1, linear()));
        expect(s.get()).toBe(10);
    });

    it('interpolates partway through the tween', () => {
        const s = createSignal(0);
        s.tween(100, 1, linear()).at(0.5);
        expect(s.get()).toBeCloseTo(50, 5);
    });

    it('is callable in tween form: signal(value, duration)', () => {
        const s = createSignal(0);
        runToEnd(s(10, 1, linear()) as { at(t: number): unknown });
        expect(s.get()).toBe(10);
    });
});
