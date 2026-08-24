import { describe, it, expect } from 'vitest';
import { sequence } from '@/tween/sequence';
import { tween } from '@/tween/tween';
import { wait } from '@/tween/wait';
import { parallel } from '@/tween/parallel';

function drive(gen: Generator<void, void, number>, dt = 1 / 60): number {
    let frames = 0;
    let result = gen.next();
    while (!result.done) {
        result = gen.next(dt);
        if (++frames > 100_000) throw new Error('did not terminate');
    }
    return frames;
}

describe('sequence', () => {
    it('returns immediately when given no animations', () => {
        const gen = sequence();
        expect(gen.next().done).toBe(true);
    });

    it('passes dt to a child tween end-to-end', () => {
        const values: number[] = [];
        const gen = sequence(tween(0.05, (t) => values.push(t)));
        drive(gen, 1 / 60);
        expect(values[values.length - 1]).toBe(1);
    });

    it('runs each animation to completion before starting the next', () => {
        const log: string[] = [];
        const a = (function* () {
            log.push('a-start');
            yield;
            log.push('a-end');
        })();
        const b = (function* () {
            log.push('b-start');
            yield;
            log.push('b-end');
        })();
        const seq = sequence(a, b);
        while (!seq.next().done) { }
        expect(log).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
    });

    it('combined wait times add up roughly correctly', () => {
        const dt = 1 / 60;
        const gen = sequence(wait(0.5), wait(0.5));
        const frames = drive(gen, dt);
        expect(frames).toBeGreaterThanOrEqual(60);
        expect(frames).toBeLessThanOrEqual(65);
    });

    it('nested sequence inside sequence flattens execution order', () => {
        const log: string[] = [];
        const inner = sequence(
            (function* () { log.push('i1'); yield; })(),
            (function* () { log.push('i2'); yield; })(),
        );
        const after = (function* () { log.push('after'); })();
        const outer = sequence(inner, after);
        while (!outer.next().done) { }
        expect(log).toEqual(['i1', 'i2', 'after']);
    });

    it('sequence containing parallel waits for parallel to finish', () => {
        const log: string[] = [];
        const par = parallel(
            (function* () { yield; log.push('p1'); })(),
            (function* () { yield; yield; log.push('p2'); })(),
        );
        const after = (function* () { log.push('after'); })();
        const seq = sequence(par, after);
        while (!seq.next().done) { }
        expect(log.indexOf('after')).toBeGreaterThan(log.indexOf('p1'));
        expect(log.indexOf('after')).toBeGreaterThan(log.indexOf('p2'));
    });
});
