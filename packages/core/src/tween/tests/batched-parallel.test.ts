import { describe, it, expect } from 'vitest';
import { parallel } from '../parallel';
import { Rect } from '../../nodes/geometry/rect-node';

// Drive a generator to completion, sending a fixed dt each frame and snapshotting
// a value after every frame (the first next() primes / applies t=0).
function frames<T>(gen: Generator<void, void, number>, dt: number, sample: () => T): T[] {
    const out: T[] = [];
    let r = gen.next();      // prime → applies t=0
    out.push(sample());
    let safety = 0;
    while (!r.done) {
        r = gen.next(dt);
        out.push(sample());
        if (++safety > 100_000) throw new Error('did not terminate');
    }
    return out;
}

describe('parallel – batched stepper path (node.to)', () => {
    it('interpolates a single node tween linearly', () => {
        const node = new Rect({ x: 0 });
        // 1s tween at 0.5s steps → t = 0, 0.5, 1
        const xs = frames(parallel(node.to({ x: 100 }, 1)), 0.5, () => node.x);
        expect(xs).toEqual([0, 50, 100]);
    });

    it('drives many node tweens in one parallel to their targets', () => {
        const nodes = Array.from({ length: 50 }, (_, i) => new Rect({ x: i }));
        const targets = nodes.map((_, i) => i * 10 + 5);
        const gen = parallel(...nodes.map((n, i) => n.to({ x: targets[i] }, 1)));
        // Run to completion at 1/60s steps.
        let r = gen.next();
        let safety = 0;
        while (!r.done) { r = gen.next(1 / 60); if (++safety > 100_000) throw new Error('hang'); }
        nodes.forEach((n, i) => expect(n.x).toBeCloseTo(targets[i], 6));
    });

    it('animates multiple props of one node together', () => {
        const node = new Rect({ x: 0, y: 0, rotation: 0 });
        const gen = parallel(node.to({ x: 10, y: 20, rotation: 90 }, 1));
        gen.next();
        gen.next(0.5);
        expect(node.x).toBeCloseTo(5, 6);
        expect(node.y).toBeCloseTo(10, 6);
        expect(node.rotation).toBeCloseTo(45, 6);
        gen.next(0.5);
        expect(node.x).toBeCloseTo(10, 6);
        expect(node.y).toBeCloseTo(20, 6);
        expect(node.rotation).toBeCloseTo(90, 6);
    });

    it('chained .to() steps run sequentially within the batch', () => {
        const node = new Rect({ x: 0 });
        const gen = parallel(node.to({ x: 10 }, 1).to({ x: 20 }, 1));
        gen.next();                 // t=0 of step 1
        expect(node.x).toBeCloseTo(0, 6);
        gen.next(1);                // step 1 finishes (x=10), step 2 primed at t=0
        expect(node.x).toBeCloseTo(10, 6);
        gen.next(0.5);              // halfway through step 2
        expect(node.x).toBeCloseTo(15, 6);
        gen.next(0.5);              // step 2 finishes
        expect(node.x).toBeCloseTo(20, 6);
    });

    it('matches the generator (_toGen) path frame-for-frame', () => {
        const dt = 1 / 60;
        const a = new Rect({ x: 0 });
        const b = new Rect({ x: 0 });
        // Batched path via parallel(node.to(...))
        const batched = frames(parallel(a.to({ x: 100 }, 0.37)), dt, () => a.x);
        // Generator path: drive _toGen directly.
        const direct = frames(b._toGen({ x: 100 }, 0.37), dt, () => b.x);
        expect(batched).toEqual(direct);
    });
});
