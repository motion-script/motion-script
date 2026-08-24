import { describe, it, expect } from 'vitest';
import { tween } from '@/tween/tween';

/** Drive a tween generator with a fixed-size frame delta until it completes. */
function drive(duration: number, dt: number) {
    const calls: number[] = [];
    const gen = tween(duration, (t) => calls.push(t));
    let res = gen.next(); // prime to the first yield
    while (!res.done) {
        res = gen.next(dt);
    }
    return calls;
}

describe('tween', () => {
    it('invokes the callback with t=0 on the first frame', () => {
        const calls = drive(1, 0.25);
        expect(calls[0]).toBe(0);
    });

    it('always finishes exactly at t=1', () => {
        const calls = drive(1, 0.3);
        expect(calls[calls.length - 1]).toBe(1);
    });

    it('produces non-decreasing t values', () => {
        const calls = drive(1, 0.1);
        for (let i = 1; i < calls.length; i++) {
            expect(calls[i]).toBeGreaterThanOrEqual(calls[i - 1]);
        }
    });

    it('reports progress as elapsed/duration before the final frame', () => {
        // duration 1, dt 0.25 → intermediate ts are 0, 0.25, 0.5, 0.75, then 1.
        const calls = drive(1, 0.25);
        expect(calls).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('still emits the final t=1 when the first frame already exceeds duration', () => {
        const calls = drive(0.1, 1);
        expect(calls).toEqual([0, 1]);
    });
});
