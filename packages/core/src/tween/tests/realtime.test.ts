import { describe, it, expect } from 'vitest';
import { sequence } from '../sequence';
import { parallel } from '../parallel';

describe('realtime generators', () => {

    // it('tween calls callback across frames and finishes at 1', () => {
    //     const calls: number[] = [];
    //     const duration = 0.1; // seconds -> gives several frames at 60 FPS

    //     const gen = tween(duration, (t) => calls.push(t));

    //     // Drive the generator to completion
    //     while (!gen.next().done) { }

    //     // There should be at least two calls (start..final)
    //     expect(calls.length).toBeGreaterThanOrEqual(2);
    //     // First call should be 0 (frame 0)
    //     expect(calls[0]).toBe(0);
    //     // Final call should be 1
    //     expect(calls[calls.length - 1]).toBe(1);
    //     // Values should be non-decreasing
    //     for (let i = 1; i < calls.length; i++) {
    //         expect(calls[i]).toBeGreaterThanOrEqual(calls[i - 1]);
    //     }
    // });

    it('sequence runs animations in order', () => {
        const calls: string[] = [];

        const a = (function* () {
            calls.push('a0');
            yield;
            calls.push('a1');
            yield;
        })();

        const b = (function* () {
            calls.push('b0');
            yield;
        })();

        const seq = sequence(a, b);
        while (!seq.next().done) { }

        expect(calls).toEqual(['a0', 'a1', 'b0']);
    });

    it('parallel advances animations together and completes when all done', () => {
        const calls: string[] = [];

        const a = (function* () {
            calls.push('a0');
            yield;
            calls.push('a1');
            yield;
        })();

        const b = (function* () {
            calls.push('b0');
            yield;
        })();

        const p = parallel(a, b);
        while (!p.next().done) { }

        // Expect interleaved execution: a0, b0, a1
        expect(calls).toEqual(['a0', 'b0', 'a1']);
    });

    // it('any delegates to parallel (same behavior)', () => {
    //     const calls1: string[] = [];
    //     const calls2: string[] = [];

    //     const makeA = () => (function* () {
    //         calls1.push('a0');
    //         yield;
    //         calls1.push('a1');
    //         yield;
    //     })();

    //     const makeB = () => (function* () {
    //         calls1.push('b0');
    //         yield;
    //     })();

    //     const a1 = (function* () { calls2.push('a0'); yield; calls2.push('a1'); yield; })();
    //     const b1 = (function* () { calls2.push('b0'); yield; })();

    //     const parGen = parallel(makeA(), makeB());

    //     while (!parGen.next().done) { }

    //     expect(calls2).toEqual(['a0', 'b0', 'a1']);
    //     expect(calls1).toEqual(['a0', 'b0', 'a1']);
    // });

});
