import { describe, it, expect } from 'vitest';
import { Random, SeedGenerator } from '@/util/random';

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

describe('Random', () => {
    it('nextFloat stays within [from, to)', () => {
        const r = new Random('floats');
        for (let i = 0; i < 200; i++) {
            const v = r.nextFloat(5, 10);
            expect(v).toBeGreaterThanOrEqual(5);
            expect(v).toBeLessThan(10);
        }
    });

    it('nextFloat defaults to [0, 1)', () => {
        const r = new Random(1);
        for (let i = 0; i < 50; i++) {
            const v = r.nextFloat();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('nextInt returns integers within [from, to)', () => {
        const r = new Random('ints');
        for (let i = 0; i < 200; i++) {
            const v = r.nextInt(3, 7);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(3);
            expect(v).toBeLessThan(7);
        }
    });

    it('floatArray / intArray produce the requested length', () => {
        const r = new Random('arrays');
        expect(r.floatArray(40, -1, 1)).toHaveLength(40);
        const ints = r.intArray(40, 0, 100);
        expect(ints).toHaveLength(40);
        expect(ints.every(Number.isInteger)).toBe(true);
    });

    it('floatArray draws match successive nextFloat draws (same stream)', () => {
        const a = new Random('stream');
        const b = new Random('stream');
        const arr = a.floatArray(5, 0, 1);
        for (const v of arr) expect(v).toBe(b.nextFloat(0, 1));
    });

    it('is deterministic for the same seed', () => {
        const a = new Random('motion');
        const b = new Random('motion');
        for (let i = 0; i < 10; i++) expect(a.nextFloat()).toBe(b.nextFloat());
    });

    it('reset rewinds to the original sequence', () => {
        const r = new Random(99);
        const first = r.floatArray(5);
        r.reset();
        expect(r.floatArray(5)).toEqual(first);
    });

    it('gauss is reproducible and roughly matches mean/stdev', () => {
        const a = new Random('g');
        const b = new Random('g');
        expect(a.gauss()).toBe(b.gauss());

        const r = new Random('stats');
        const N = 20000;
        let sum = 0;
        const xs: number[] = [];
        for (let i = 0; i < N; i++) { const x = r.gauss(10, 2); xs.push(x); sum += x; }
        const mean = sum / N;
        const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / N;
        expect(mean).toBeGreaterThan(9.8);
        expect(mean).toBeLessThan(10.2);
        expect(Math.sqrt(variance)).toBeGreaterThan(1.8);
        expect(Math.sqrt(variance)).toBeLessThan(2.2);
    });

    it('noise is smooth (nearby inputs → nearby outputs) and in [0, 1]', () => {
        const r = new Random('field');
        let prev = r.noise(0, 4);
        for (let i = 1; i <= 100; i++) {
            const v = r.noise(i / 100, 4);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
            // Adjacent samples at this step/frequency stay close — the property
            // that distinguishes noise from independent draws.
            expect(Math.abs(v - prev)).toBeLessThan(0.2);
            prev = v;
        }
    });

    it('noise does not consume the draw stream (pure in time)', () => {
        const r = new Random('pure');
        const before = r.nextFloat();
        r.noise(0.3, 5);
        r.noise(0.7, 5);
        r.reset();
        expect(r.nextFloat()).toBe(before);
    });
});
