import { describe, it, expect } from 'vitest';
import { SeedGenerator } from '@/util/random';

describe('SeedGenerator', () => {
    it('produces values in the [0,1) range', () => {
        const gen = new SeedGenerator(123);
        for (let i = 0; i < 100; i++) {
            const v = gen.next();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('is deterministic for the same numeric seed', () => {
        const a = new SeedGenerator(42);
        const b = new SeedGenerator(42);
        for (let i = 0; i < 10; i++) {
            expect(a.next()).toBe(b.next());
        }
    });

    it('is deterministic for the same string seed', () => {
        const a = new SeedGenerator('motion');
        const b = new SeedGenerator('motion');
        expect(a.next()).toBe(b.next());
    });

    it('produces different sequences for different seeds', () => {
        const a = new SeedGenerator(1);
        const b = new SeedGenerator(2);
        expect(a.next()).not.toBe(b.next());
    });

    it('advances state across successive calls', () => {
        const gen = new SeedGenerator(7);
        const first = gen.next();
        const second = gen.next();
        expect(first).not.toBe(second);
    });

    it('reseeding resets the sequence', () => {
        const gen = new SeedGenerator(99);
        const first = gen.next();
        gen.setSeed(99);
        expect(gen.next()).toBe(first);
    });
});
