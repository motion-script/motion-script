import { describe, it, expect } from 'vitest';
import { wait } from '@/tween/wait';

describe('wait', () => {
    it('completes immediately when duration is 0', () => {
        const gen = wait(0);
        // First next() enters the loop; 0 < 0 is false → returns immediately
        expect(gen.next().done).toBe(true);
    });

    it('completes after enough total dt accumulates', () => {
        const gen = wait(0.5);
        gen.next();              // prime
        let r = gen.next(0.2);
        expect(r.done).toBe(false);
        r = gen.next(0.2);
        expect(r.done).toBe(false);
        r = gen.next(0.2);       // 0.6 ≥ 0.5
        expect(r.done).toBe(true);
    });

    it('accepts a single oversized dt to finish in one shot', () => {
        const gen = wait(1.0);
        gen.next();
        const r = gen.next(10);
        expect(r.done).toBe(true);
    });

    it('does not finish before duration is reached', () => {
        const gen = wait(0.5);
        gen.next();
        for (let i = 0; i < 5; i++) {
            // 5 * 0.05 = 0.25 < 0.5 → not done
            const r = gen.next(0.05);
            expect(r.done).toBe(false);
        }
    });
});
