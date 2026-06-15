import { describe, it, expect } from 'vitest';
import { Path } from '@/nodes/geometry/path-node';
import { PathCommand } from '@/render/descriptors/path';

const square = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';
const triangle = 'M 0 0 L 10 0 L 5 10 Z';

/** Drive a `_toGen` generator to completion, mirroring the playback advance loop. */
function runTween(gen: Generator<void, unknown, number>, duration: number, steps: number): void {
    const dt = duration / steps;
    let res = gen.next(); // prime
    // Feed frames until the generator finishes; the final advance crosses
    // `duration` and the stepper snaps to t=1 exactly.
    while (!res.done) res = gen.next(dt);
}

describe('Path – d is a reactive property', () => {
    it('exposes the constructor d value', () => {
        const path = new Path({ d: square });
        expect(path.d).toBe(square);
    });

    it('defaults d to an empty string', () => {
        const path = new Path({});
        expect(path.d).toBe('');
    });

    it('updates d via set()', () => {
        const path = new Path({ d: square });
        path.set({ d: triangle });
        expect(path.d).toBe(triangle);
    });
});

describe('Path – animating d (morph)', () => {
    it('morphs d from the source toward the target during the tween', () => {
        const path = new Path({ d: square });
        const step = (path as any)._prepareStep({ d: triangle }, 1);

        // Midway, d should be a command array (an in-between morph), not a string.
        step.seek(0.5);
        const mid = path.d;
        expect(Array.isArray(mid)).toBe(true);
        const moves = (mid as PathCommand[]).filter((c) => c.type === 'M');
        expect(moves).toHaveLength(1);
    });

    it('lands exactly on the target shape at the end of the tween', () => {
        const path = new Path({ d: square });
        const gen = (path as any)._toGen({ d: triangle }, 1) as Generator<void, unknown, number>;
        runTween(gen, 1, 10);
        // The string-snap path restores the exact target at t=1.
        expect(path.d).toBe(triangle);
    });

    it('keeps the source shape at t=0', () => {
        const path = new Path({ d: square });
        const step = (path as any)._prepareStep({ d: triangle }, 1);
        step.seek(0);
        expect(path.d).toBe(square);
    });

    it('accepts a command array as the animation target', () => {
        const path = new Path({ d: square });
        const target: PathCommand[] = [
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 10, y: 0 },
            { type: 'L', x: 5, y: 10 },
            { type: 'Z' },
        ];
        const step = (path as any)._prepareStep({ d: target }, 1);
        step.seek(0.5);
        expect(Array.isArray(path.d)).toBe(true);
    });
});
