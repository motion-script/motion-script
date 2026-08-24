import { describe, it, expect } from 'vitest';
import { Effects } from '@/attributes/shape/effects/chain';
import { Adjustments } from '@/attributes/shape/filters/chain';
import { lerpEffect, effectSurface } from '@/attributes/shape/effects/registry';
import { lutEffect, type LutEffect } from '@/attributes/shape/effects/implementations/lut';

/** A 2³ identity cube, red-fastest. See `LutEffect.table`. */
const identity = () => new Float32Array([
    0, 0, 0, /**/ 1, 0, 0,
    0, 1, 0, /**/ 1, 1, 0,
    0, 0, 1, /**/ 1, 0, 1,
    0, 1, 1, /**/ 1, 1, 1,
]);

const lut = (table: Float32Array, amount = 1): LutEffect =>
    Effects.lut({ table, size: 2, amount }).list[0] as LutEffect;

describe('the lut builder', () => {
    it('defaults to the full look', () => {
        expect(lut(identity()).amount).toBe(1);
    });

    it('carries the table by reference rather than copying it', () => {
        const table = identity();
        expect(lut(table).table).toBe(table);
    });

    it('is reachable as a media adjustment under the same name', () => {
        const table = identity();
        expect([...Adjustments.lut({ table, size: 2, amount: 0.5 })]).toEqual([
            { type: 'lut', table, size: 2, amount: 0.5 },
        ]);
    });

    it('needs the source as a shader, not a colour matrix', () => {
        expect(effectSurface(lut(identity()))).toBe('shader');
    });
});

describe('lut equality', () => {
    it('compares the table by identity, not by contents', () => {
        // The contract the renderer's texture cache is keyed on. Two equal cubes
        // that are different arrays must compare unequal, or a scene that
        // rebuilds its table each frame would silently reuse a stale upload.
        const a = lut(identity());
        const b = lut(identity());
        expect(lutEffect.equals(a, a)).toBe(true);
        expect(lutEffect.equals(a, b)).toBe(false);
    });

    it('separates two amounts of the same cube', () => {
        const table = identity();
        expect(lutEffect.equals(lut(table, 1), lut(table, 0.5))).toBe(false);
    });
});

describe('lut interpolation', () => {
    it('ramps the mix', () => {
        const table = identity();
        const mid = lerpEffect(lut(table, 0), lut(table, 1), 0.25) as LutEffect;
        expect(mid.amount).toBe(0.25);
        expect(mid.table).toBe(table);
    });

    it('cuts between two different cubes rather than blending them', () => {
        // There is no meaningful midpoint between two measured cubes, and
        // interpolating one would allocate a third table every frame.
        const from = identity();
        const to = identity();
        expect((lerpEffect(lut(from), lut(to), 0.4) as LutEffect).table).toBe(from);
        expect((lerpEffect(lut(from), lut(to), 0.6) as LutEffect).table).toBe(to);
    });

    it('keeps the table and its size together across the cut', () => {
        // A cube read at the wrong stride is not a wrong colour, it is garbage.
        const small = identity();
        const big = new Float32Array(3 * 3 * 3 * 3);
        const a = Effects.lut({ table: small, size: 2 }).list[0] as LutEffect;
        const b = Effects.lut({ table: big, size: 3 }).list[0] as LutEffect;

        const early = lerpEffect(a, b, 0.2) as LutEffect;
        expect([early.table, early.size]).toEqual([small, 2]);

        const late = lerpEffect(a, b, 0.8) as LutEffect;
        expect([late.table, late.size]).toEqual([big, 3]);
    });
});
