import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    coordsMatrix,
    describeUniforms,
    lerpUniformRecord,
    normalizeUniforms,
    parseShaderChildren,
    uniformRecordsEqual,
    writeUniforms,
    type SkSLUniformRecord,
    type UniformReflect,
} from '@/attributes/shape/sksl-uniforms';

/**
 * A stand-in for CanvasKit's `RuntimeEffect` reflection.
 *
 * The whole point of expressing reflection structurally: this is the layer that
 * fails *silently* (a value written to the wrong float offset renders plausible
 * garbage rather than throwing), and testing it needs no wasm at all.
 */
function fakeEffect(
    uniforms: Array<{ name: string; columns: number; rows: number; slot: number; isInteger?: boolean }>,
    floatCount?: number,
): UniformReflect {
    return {
        getUniformCount: () => uniforms.length,
        getUniformName: (i) => uniforms[i].name,
        getUniform: (i) => ({
            columns: uniforms[i].columns,
            rows: uniforms[i].rows,
            slot: uniforms[i].slot,
            isInteger: !!uniforms[i].isInteger,
        }),
        getUniformFloatCount: () =>
            floatCount ?? uniforms.reduce((n, u) => n + u.columns * u.rows, 0),
    };
}

const float = (name: string, slot: number) => ({ name, columns: 1, rows: 1, slot });
const vec = (name: string, slot: number, n: number) => ({ name, columns: n, rows: 1, slot });

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
});

afterEach(() => {
    warn.mockRestore();
});

/**
 * Warnings are deduped in a module-level ledger, so every test that asserts on a
 * warning has to use a scope no other test has used — otherwise the assertion
 * depends on file order.
 */
let scopeCounter = 0;
const scope = () => `test-scope-${scopeCounter++}`;

describe('normalizeUniforms', () => {
    it('accepts the record form and sorts keys, so the resolved shape is canonical', () => {
        const a = normalizeUniforms({ u_z: 1, u_a: 2 });
        const b = normalizeUniforms({ u_a: 2, u_z: 1 });

        expect(Object.keys(a)).toEqual(['u_a', 'u_z']);
        expect(Object.keys(b)).toEqual(['u_a', 'u_z']);
    });

    it('accepts the sksl effect\'s positional array, so a shader moves between the two unchanged', () => {
        expect(normalizeUniforms([
            { name: 'u_amount', value: 0.5 },
            { name: 'u_tint', value: [1, 0, 0, 1] },
        ])).toEqual({ u_amount: 0.5, u_tint: [1, 0, 0, 1] });
    });

    it('flattens nested arrays, so a colour list can be written the natural way', () => {
        expect(normalizeUniforms({ u_colors: [[1, 0, 0, 1], [0, 1, 0, 1]] as unknown as number[] }))
            .toEqual({ u_colors: [1, 0, 0, 1, 0, 1, 0, 1] });
    });

    it('drops non-finite values with a warning rather than writing NaN into the buffer', () => {
        expect(normalizeUniforms({ u_bad: NaN, u_good: 1 })).toEqual({ u_good: 1 });
        expect(warn).toHaveBeenCalled();
    });

    it('is idempotent, since an already-resolved fill is re-resolved on assignment', () => {
        const once = normalizeUniforms({ u_a: 1, u_v: [1, 2] });
        expect(normalizeUniforms(once)).toEqual(once);
    });
});

describe('lerpUniformRecord', () => {
    it('interpolates vectors component-wise', () => {
        expect(lerpUniformRecord({ u_p: [0, 10] }, { u_p: [10, 0] }, 0.5)).toEqual({ u_p: [5, 5] });
    });

    it('holds a one-sided key at its own value instead of pulling it toward zero', () => {
        expect(lerpUniformRecord({ u_a: 4 }, { u_b: 9 }, 0.5)).toEqual({ u_a: 4, u_b: 9 });
    });

    it('snaps a value whose arity changes, there being no in-between shape', () => {
        expect(lerpUniformRecord({ u_a: 1 }, { u_a: [1, 2] }, 0.25)).toEqual({ u_a: 1 });
        expect(lerpUniformRecord({ u_a: 1 }, { u_a: [1, 2] }, 0.75)).toEqual({ u_a: [1, 2] });
    });
});

describe('uniformRecordsEqual', () => {
    it('ignores key insertion order, unlike the positional effect form', () => {
        expect(uniformRecordsEqual({ u_a: 1, u_b: [2, 3] }, { u_b: [2, 3], u_a: 1 })).toBe(true);
    });

    it('is false on a changed value or a differing key set', () => {
        expect(uniformRecordsEqual({ u_a: 1 }, { u_a: 2 })).toBe(false);
        expect(uniformRecordsEqual({ u_a: 1 }, { u_a: 1, u_b: 1 })).toBe(false);
        expect(uniformRecordsEqual({ u_a: 1 }, { u_b: 1 })).toBe(false);
    });
});

describe('describeUniforms', () => {
    it('reports the float range each uniform occupies', () => {
        const slots = describeUniforms(fakeEffect([
            float('u_amount', 0),
            vec('u_size', 1, 2),
            vec('u_tint', 3, 4),
        ]));

        expect(slots).toEqual([
            { name: 'u_amount', slot: 0, length: 1, isInteger: false },
            { name: 'u_size', slot: 1, length: 2, isInteger: false },
            { name: 'u_tint', slot: 3, length: 4, isInteger: false },
        ]);
    });

    it('folds an array uniform\'s length into its span, so `vec4 u_c[8]` is 32 floats', () => {
        const [slot] = describeUniforms(fakeEffect([{ name: 'u_colors', columns: 4, rows: 8, slot: 0 }]));
        expect(slot.length).toBe(32);
    });
});

describe('writeUniforms', () => {
    it('writes each value at the slot the program reported, not in argument order', () => {
        const slots = describeUniforms(fakeEffect([vec('u_size', 0, 2), float('u_amount', 2)]));
        // Deliberately the reverse of declaration order — nothing about the record
        // form should depend on it.
        const buf = writeUniforms(slots, 3, { u_amount: 0.25, u_size: [64, 32] }, {}, scope());

        expect(Array.from(buf)).toEqual([64, 32, 0.25]);
    });

    it('honours a padding gap between slots', () => {
        const slots = describeUniforms(fakeEffect([float('u_a', 0), float('u_b', 4)], 5));
        const buf = writeUniforms(slots, 5, { u_a: 1, u_b: 2 }, {}, scope());

        expect(Array.from(buf)).toEqual([1, 0, 0, 0, 2]);
    });

    it('writes an integer uniform as an int32 bit pattern, not as a float', () => {
        const slots = describeUniforms(fakeEffect([{ ...float('u_seed', 0), isInteger: true }]));
        const buf = writeUniforms(slots, 1, { u_seed: 3 }, {}, scope());

        expect(new Int32Array(buf.buffer)[0]).toBe(3);
        // 3 as an int32 bit pattern is a denormal float, emphatically not 3.
        expect(buf[0]).not.toBe(3);
    });

    it('fills a built-in the program declares, and lets an author key of the same name win', () => {
        const slots = describeUniforms(fakeEffect([float('u_time', 0), float('u_aspect', 1)]));
        const buf = writeUniforms(slots, 2, { u_aspect: 9 }, { u_time: 2.5, u_aspect: 1.5 }, scope());

        expect(Array.from(buf)).toEqual([2.5, 9]);
    });

    it('zero-fills a declared-but-unsupplied uniform and warns exactly once across many frames', () => {
        const slots = describeUniforms(fakeEffect([float('u_amount', 0)]));
        const key = scope();

        for (let i = 0; i < 100; i++) writeUniforms(slots, 1, {}, {}, key);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('u_amount');
    });

    it('warns about a supplied uniform the shader does not declare', () => {
        const slots = describeUniforms(fakeEffect([float('u_amount', 0)]));
        writeUniforms(slots, 1, { u_amount: 1, u_tpyo: 2 }, {}, scope());

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('u_tpyo');
    });

    it('zero-pads an arity mismatch and warns rather than shifting the buffer', () => {
        const slots = describeUniforms(fakeEffect([vec('u_tint', 0, 4)]));
        const buf = writeUniforms(slots, 4, { u_tint: [1, 1, 1] }, {}, scope());

        expect(Array.from(buf)).toEqual([1, 1, 1, 0]);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('does not overflow when a reported slot exceeds the reported float count', () => {
        const slots = describeUniforms(fakeEffect([vec('u_tint', 2, 4)], 3));
        const buf = writeUniforms(slots, 3, { u_tint: [1, 2, 3, 4] }, {}, scope());

        expect(buf).toHaveLength(3);
        expect(Array.from(buf)).toEqual([0, 0, 1]);
    });
});

describe('coordsMatrix', () => {
    const bounds = { left: 10, top: 20, right: 90, bottom: 60 };   // 80 × 40
    // A shader is evaluated at M⁻¹·p, so this is what a given shape-local point
    // arrives as inside `main`.
    const at = (m: number[], x: number, y: number) => ({
        x: (x - m[2]) / m[0],
        y: (y - m[5]) / m[4],
    });

    it('is the identity for `local`, leaving fragCoord in shape-local px', () => {
        expect(coordsMatrix('local', bounds)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    });

    it('maps the bounds onto the unit square for `normalized`', () => {
        const m = coordsMatrix('normalized', bounds);

        expect(m).toEqual([80, 0, 10, 0, 40, 20, 0, 0, 1]);
        expect(at(m, 10, 20)).toEqual({ x: 0, y: 0 });
        expect(at(m, 90, 60)).toEqual({ x: 1, y: 1 });
    });

    it('centres the origin and keeps pixels square for `centered`', () => {
        const m = coordsMatrix('centered', bounds);

        // Both axes scale by the height, so the shorter one is the unit axis —
        // which is what makes an u_aspect-corrected circle round.
        expect(at(m, 50, 40)).toEqual({ x: 0, y: 0 });
        expect(at(m, 50, 20).y).toBeCloseTo(-0.5);
        expect(at(m, 50, 60).y).toBeCloseTo(0.5);
        // x spans ±aspect/2, aspect being 80/40 = 2.
        expect(at(m, 10, 40).x).toBeCloseTo(-1);
        expect(at(m, 90, 40).x).toBeCloseTo(1);
    });
});

describe('parseShaderChildren', () => {
    it('recovers declarations in source order, which is Skia\'s child order', () => {
        expect(parseShaderChildren(`
            uniform shader u_a;
            uniform float u_amount;
            uniform shader u_b;
            vec4 main(vec2 p) { return vec4(0); }
        `)).toEqual([
            { kind: 'shader', name: 'u_a' },
            { kind: 'shader', name: 'u_b' },
        ]);
    });

    it('counts every child kind, because one indexed list means a colorFilter shifts the rest', () => {
        expect(parseShaderChildren(`
            uniform shader u_a;
            uniform colorFilter u_grade;
            uniform shader u_b;
        `)).toEqual([
            { kind: 'shader', name: 'u_a' },
            { kind: 'colorFilter', name: 'u_grade' },
            { kind: 'shader', name: 'u_b' },
        ]);
    });

    it('ignores commented-out declarations', () => {
        expect(parseShaderChildren(`
            // uniform shader u_dead;
            /* uniform shader u_also_dead; */
            uniform shader u_live;
        `)).toEqual([{ kind: 'shader', name: 'u_live' }]);
    });

    it('finds nothing in a shader with no children', () => {
        expect(parseShaderChildren('uniform float u_amount;')).toEqual([]);
    });
});

describe('the marshaller end to end', () => {
    it('round-trips a mixed float/vec2/vec4/int program', () => {
        const effect = fakeEffect([
            float('u_time', 0),
            vec('u_size', 1, 2),
            vec('u_tint', 3, 4),
            { ...float('u_seed', 7), isInteger: true },
        ]);
        const slots = describeUniforms(effect);
        // Exactly representable in float32, so the assertion is about placement
        // rather than about rounding.
        const values: SkSLUniformRecord = { u_tint: [0.25, 0.5, 0.75, 1], u_seed: 7 };
        const buf = writeUniforms(slots, effect.getUniformFloatCount(), values, {
            u_time: 1.5,
            u_size: [640, 480],
        }, scope());

        expect(effect.getUniformFloatCount()).toBe(8);
        expect(Array.from(buf.subarray(0, 7))).toEqual([1.5, 640, 480, 0.25, 0.5, 0.75, 1]);
        expect(new Int32Array(buf.buffer)[7]).toBe(7);
        expect(warn).not.toHaveBeenCalled();
    });
});
