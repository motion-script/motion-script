import { describe, it, expect } from 'vitest';
import { parallel } from '../parallel';
import { tween } from '../tween';
import { wait } from '../wait';
import { sequence } from '../sequence';

// Drive a generator to completion, sending dt each frame.
function driveWithDt(gen: Generator<void, void, number>, dt: number): void {
    let result = gen.next();
    let safety = 0;
    while (!result.done) {
        result = gen.next(dt);
        if (++safety > 100_000) throw new Error('generator did not terminate');
    }
}

describe('parallel', () => {
    it('returns immediately when given no animations', () => {
        const gen = parallel();
        const result = gen.next();
        expect(result.done).toBe(true);
    });

    it('runs a single animation to completion', () => {
        const calls: number[] = [];
        const gen = parallel(tween(0.1, (t) => calls.push(t)));
        driveWithDt(gen, 1 / 60);
        expect(calls[calls.length - 1]).toBe(1);
    });

    it('advances all animations on every frame', () => {
        const log: string[] = [];

        const a = (function* () {
            log.push('a0'); yield;
            log.push('a1'); yield;
        })();

        const b = (function* () {
            log.push('b0'); yield;
        })();

        const p = parallel(a, b);
        while (!p.next().done) { }

        expect(log).toEqual(['a0', 'b0', 'a1']);
    });

    it('completes only after the longest animation finishes', () => {
        const dt = 1 / 60;
        let shortDone = false;
        let longDone = false;

        const short = (function* () {
            yield* wait(0.1);
            shortDone = true;
        })();

        const long = (function* () {
            yield* wait(0.5);
            longDone = true;
        })();

        const p = parallel(short, long);
        driveWithDt(p, dt);

        expect(shortDone).toBe(true);
        expect(longDone).toBe(true);
    });

    it('continues after one of two animations finishes', () => {
        const log: string[] = [];

        const fast = (function* () {
            log.push('fast-frame0'); yield;
            log.push('fast-done');
        })();

        const slow = (function* () {
            log.push('slow-frame0'); yield;
            log.push('slow-frame1'); yield;
            log.push('slow-done');
        })();

        const p = parallel(fast, slow);
        while (!p.next().done) { }

        expect(log).toContain('fast-done');
        expect(log).toContain('slow-done');
        // slow runs at least 2 frames after fast is done
        expect(log.indexOf('slow-done')).toBeGreaterThan(log.indexOf('fast-done'));
    });

    it('forwards dt to each child animation', () => {
        const dtReceived: number[] = [];

        const tracker = (function* () {
            for (let i = 0; i < 3; i++) {
                const received: number = yield;
                if (received !== undefined) dtReceived.push(received);
            }
        })();

        const p = parallel(tracker);
        p.next();                // prime — no dt yet
        p.next(0.016);
        p.next(0.033);
        p.next(0.050);

        expect(dtReceived).toEqual([0.016, 0.033, 0.050]);
    });

    it('works with three simultaneous tweens', () => {
        const results = { x: 0, y: 0, z: 0 };

        const p = parallel(
            tween(0.2, (t) => { results.x = t; }),
            tween(0.4, (t) => { results.y = t; }),
            tween(0.1, (t) => { results.z = t; }),
        );
        driveWithDt(p, 1 / 60);

        expect(results.x).toBe(1);
        expect(results.y).toBe(1);
        expect(results.z).toBe(1);
    });

    it('nested parallel inside sequence runs correctly', () => {
        const log: string[] = [];

        const inner = parallel(
            (function* () { log.push('p-a0'); yield; log.push('p-a1'); })(),
            (function* () { log.push('p-b0'); yield; })(),
        );

        const after = (function* () { log.push('after'); })();

        const seq = sequence(inner, after);
        while (!seq.next().done) { }

        // 'after' must come after both parallel arms finish
        const afterIdx = log.indexOf('after');
        expect(afterIdx).toBeGreaterThan(log.indexOf('p-a1'));
        expect(afterIdx).toBeGreaterThan(log.indexOf('p-b0'));
    });

    it('parallel nested inside parallel all complete', () => {
        const done: string[] = [];

        const a = (function* () { yield; done.push('a'); })();
        const b = (function* () { yield; yield; done.push('b'); })();
        const c = (function* () { yield; done.push('c'); })();

        const outer = parallel(parallel(a, b), c);
        while (!outer.next().done) { }

        expect(done).toContain('a');
        expect(done).toContain('b');
        expect(done).toContain('c');
    });
});
