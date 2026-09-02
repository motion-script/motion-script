import { describe, it, expect } from 'vitest';
import { Path } from '@/nodes/geometry/path-node';
import { PathCommand } from '@/render/descriptors/path';
import { attached } from '@/nodes/node/node.fixtures';
import type { TweenStepper } from '@/tween/stepper';

const square = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';
const triangle = 'M 0 0 L 10 0 L 5 10 Z';

/** Play a Command to completion, mirroring the playback advance loop. */
function runTween(step: TweenStepper, duration: number, steps: number): void {
    const dt = duration / steps;
    step.seek(0);
    // Feed frames until it finishes; the final advance crosses `duration` and
    // the stepper snaps to t=1 exactly.
    let done = false;
    while (!done) done = step.advance(dt);
}

describe('Path – data is a reactive property', () => {
    it('exposes the constructor data value', () => {
        const path = attached(new Path({ data: square }));
        expect(path.data).toBe(square);
    });

    it('defaults data to an empty string', () => {
        const path = new Path({});
        expect(path.data).toBe('');
    });

    it('updates data via set()', () => {
        const path = attached(new Path({ data: square }));
        path.set({ data: triangle });
        expect(path.data).toBe(triangle);
    });
});

describe('Path – animating data (morph)', () => {
    it('morphs data from the source toward the target during the tween', () => {
        const path = attached(new Path({ data: square }));
        const step = (path as any)._prepareStep({ data: triangle }, 1);

        // Midway, data should be a command array (an in-between morph), not a string.
        step.seek(0.5);
        const mid = path.data;
        expect(Array.isArray(mid)).toBe(true);
        const moves = (mid as PathCommand[]).filter((c) => c.type === 'M');
        expect(moves).toHaveLength(1);
    });

    it('lands exactly on the target shape at the end of the tween', () => {
        const path = attached(new Path({ data: square }));
        const step = path.to({ data: triangle }, 1)._stepper();
        runTween(step, 1, 10);
        // The string-snap path restores the exact target at t=1.
        expect(path.data).toBe(triangle);
    });

    it('keeps the source shape at t=0', () => {
        const path = attached(new Path({ data: square }));
        const step = (path as any)._prepareStep({ data: triangle }, 1);
        step.seek(0);
        expect(path.data).toBe(square);
    });

    it('accepts a command array as the animation target', () => {
        const path = attached(new Path({ data: square }));
        const target: PathCommand[] = [
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 10, y: 0 },
            { type: 'L', x: 5, y: 10 },
            { type: 'Z' },
        ];
        const step = (path as any)._prepareStep({ data: target }, 1);
        step.seek(0.5);
        expect(Array.isArray(path.data)).toBe(true);
    });
});
