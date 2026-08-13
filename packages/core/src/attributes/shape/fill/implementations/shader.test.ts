import { describe, it, expect, vi } from 'vitest';
import { resolveFill, resolveFillArray, lerpFill, lerpFillArray, canLerpFill, prepareFill } from '@/attributes/shape/fill/registry';
import { Fills } from '@/attributes/shape/fill/chain';
import { shaderFill, type ShaderFillResolved } from '@/attributes/shape/fill/implementations/shader';
import type { FillResolved } from '@/attributes/shape/fill/union';
import type { AssetTracker } from '@/assets/tracker';

const SRC_A = 'uniform float u_amount; vec4 main(vec2 p) { return vec4(u_amount); }';
const SRC_B = 'uniform float u_amount; vec4 main(vec2 p) { return vec4(1.0 - u_amount); }';

const fill = (source: string, extra: Record<string, unknown> = {}): FillResolved =>
    resolveFill({ type: 'shader', source, ...extra } as never);

describe('shader fill', () => {
    it('defaults coords to normalized and uniforms to an empty record', () => {
        const resolved = fill(SRC_A) as ShaderFillResolved;

        expect(resolved).toMatchObject({ type: 'shader', source: SRC_A, coords: 'normalized', uniforms: {} });
        // Omitted rather than an empty array, so the resolved shape stays minimal
        // and comparable like every other fill's optional fields.
        expect(resolved.textures).toBeUndefined();
    });

    it('normalises the positional uniform array the sksl effect uses', () => {
        const resolved = fill(SRC_A, {
            uniforms: [{ name: 'u_amount', value: 0.5 }, { name: 'u_tint', value: [1, 0, 0, 1] }],
        }) as ShaderFillResolved;

        expect(resolved.uniforms).toEqual({ u_amount: 0.5, u_tint: [1, 0, 0, 1] });
    });

    it('flattens a nested colour-array uniform', () => {
        const resolved = fill(SRC_A, { uniforms: { u_colors: [[1, 0, 0, 1], [0, 0, 1, 1]] } }) as ShaderFillResolved;

        expect(resolved.uniforms.u_colors).toEqual([1, 0, 0, 1, 0, 0, 1, 1]);
    });

    it('carries uniforms/coords/textures and the cross-cutting options through the chain', () => {
        const [resolved] = resolveFillArray(
            Fills.shader(SRC_A, {
                uniforms: { u_amount: 0.4 },
                coords: 'centered',
                textures: [{ name: 'u_photo', src: '/cat.jpg' }],
                opacity: 0.5,
                blend: 'screen',
                space: 'global',
            }),
        ) as ShaderFillResolved[];

        expect(resolved).toMatchObject({
            type: 'shader',
            coords: 'centered',
            uniforms: { u_amount: 0.4 },
            textures: [{ name: 'u_photo', src: '/cat.jpg' }],
            opacity: 0.5,
            blend: 'screen',
            space: 'global',
        });
    });

    // The source is `getOrCompileSkSL`'s cache key, so tweening it would compile a
    // program per frame — it snaps, exactly as an image fill's `src` does.
    it('snaps the source at the tween midpoint while uniforms and opacity interpolate', () => {
        const a = fill(SRC_A, { uniforms: { u_amount: 0 }, opacity: 0 });
        const b = fill(SRC_B, { uniforms: { u_amount: 1 }, opacity: 1 });
        const at = (t: number) => lerpFill(a, b, t) as ShaderFillResolved;

        expect(at(0.25).source).toBe(SRC_A);
        expect(at(0.75).source).toBe(SRC_B);
        expect(at(0.25).uniforms.u_amount).toBeCloseTo(0.25);
        expect(at(0.75).uniforms.u_amount).toBeCloseTo(0.75);
        expect(at(0.25).opacity).toBeCloseTo(0.25);
    });

    it('snaps coords and the texture list, both being discrete bindings', () => {
        const a = fill(SRC_A, { coords: 'local', textures: [{ name: 'u_t', src: '/a.jpg' }] });
        const b = fill(SRC_A, { coords: 'centered', textures: [{ name: 'u_t', src: '/b.jpg' }] });
        const at = (t: number) => lerpFill(a, b, t) as ShaderFillResolved;

        expect(at(0.25).coords).toBe('local');
        expect(at(0.75).coords).toBe('centered');
        expect(at(0.25).textures).toEqual([{ name: 'u_t', src: '/a.jpg' }]);
        expect(at(0.75).textures).toEqual([{ name: 'u_t', src: '/b.jpg' }]);
    });

    it('interpolates vector uniforms component-wise', () => {
        const a = fill(SRC_A, { uniforms: { u_p: [0, 10] } });
        const b = fill(SRC_A, { uniforms: { u_p: [10, 0] } });

        expect((lerpFill(a, b, 0.5) as ShaderFillResolved).uniforms.u_p).toEqual([5, 5]);
    });

    it('keeps a uniform only one endpoint declares, rather than zeroing it mid-tween', () => {
        const a = fill(SRC_A, { uniforms: { u_amount: 1, u_only_a: 7 } });
        const b = fill(SRC_A, { uniforms: { u_amount: 0 } });

        const mid = (lerpFill(a, b, 0.5) as ShaderFillResolved).uniforms;
        expect(mid.u_amount).toBeCloseTo(0.5);
        expect(mid.u_only_a).toBe(7);
    });

    it('preserves type/blend/space across a lerp, which lerp() itself must not return', () => {
        const from = fill(SRC_A, { blend: 'multiply', space: 'parent' });
        const to = fill(SRC_A, { blend: 'multiply', space: 'parent' });

        expect(lerpFill(from, to, 0.5)).toMatchObject({ type: 'shader', blend: 'multiply', space: 'parent' });
        // `FillResult` omits both; returning them here would be reassembled over.
        expect(shaderFill.lerp(from as never, to as never, 0.5)).not.toHaveProperty('type');
        expect(shaderFill.lerp(from as never, to as never, 0.5)).not.toHaveProperty('blend');
    });

    // The ragged-array branch: a fill with no counterpart fades against a copy of
    // itself, which routes back into our own lerp as a same-type self-pair.
    it('fades out against itself when the target array is shorter', () => {
        const out = lerpFillArray([fill(SRC_A, { uniforms: { u_amount: 0.5 } })], [], 0.25) as ShaderFillResolved[];

        expect(out).toHaveLength(1);
        expect(out[0].source).toBe(SRC_A);
        expect(out[0].uniforms.u_amount).toBe(0.5);
        expect(out[0].opacity).toBeCloseTo(0.75);
    });

    it('cross-fades against another fill type rather than throwing', () => {
        expect(canLerpFill(fill(SRC_A), resolveFill('red'))).toBe(false);

        const out = lerpFillArray([resolveFill('red')], [fill(SRC_A)], 0.25);
        // Outgoing beneath, incoming on top.
        expect(out.map((f) => f.type)).toEqual(['solid', 'shader']);
        expect(out[0].opacity).toBeCloseTo(0.75);
        expect(out[1].opacity).toBeCloseTo(0.25);
    });

    // Two sources are interpolatable as far as the array logic is concerned (same
    // type, same blend), so they take the in-place path — and hard-cut inside it.
    it('hard-cuts between two different sources instead of stacking two layers', () => {
        const out = lerpFillArray([fill(SRC_A)], [fill(SRC_B)], 0.4) as ShaderFillResolved[];

        expect(out).toHaveLength(1);
        expect(out[0].source).toBe(SRC_A);
        expect((lerpFillArray([fill(SRC_A)], [fill(SRC_B)], 0.6)[0] as ShaderFillResolved).source).toBe(SRC_B);
    });

    it('equals ignores uniform key order but not values, source, coords or textures', () => {
        const base = fill(SRC_A, { uniforms: { u_a: 1, u_b: [2, 3] } }) as ShaderFillResolved;
        const reordered = fill(SRC_A, { uniforms: { u_b: [2, 3], u_a: 1 } }) as ShaderFillResolved;

        expect(shaderFill.equals(base, reordered)).toBe(true);
        expect(shaderFill.equals(base, fill(SRC_A, { uniforms: { u_a: 2, u_b: [2, 3] } }) as ShaderFillResolved)).toBe(false);
        expect(shaderFill.equals(base, fill(SRC_B, { uniforms: { u_a: 1, u_b: [2, 3] } }) as ShaderFillResolved)).toBe(false);
        expect(shaderFill.equals(base, fill(SRC_A, { uniforms: { u_a: 1, u_b: [2, 3] }, coords: 'local' }) as ShaderFillResolved)).toBe(false);
        expect(shaderFill.equals(
            fill(SRC_A, { textures: [{ name: 'u_t', src: '/a.jpg' }] }) as ShaderFillResolved,
            fill(SRC_A, { textures: [{ name: 'u_t', src: '/b.jpg' }] }) as ShaderFillResolved,
        )).toBe(false);
    });

    it('requests each texture during precomp, sized to the destination', () => {
        const requestImage = vi.fn();
        const tracker = { requestImage } as unknown as AssetTracker;

        prepareFill(
            fill(SRC_A, { textures: [{ name: 'u_a', src: '/cat.jpg' }, { name: 'u_b', src: '/bird.jpg' }] }),
            tracker,
            800,
            600,
        );

        expect(requestImage).toHaveBeenCalledWith('/cat.jpg', 800, 600);
        expect(requestImage).toHaveBeenCalledWith('/bird.jpg', 800, 600);
    });

    it('requests nothing when the fill has no textures', () => {
        const requestImage = vi.fn();
        prepareFill(fill(SRC_A), { requestImage } as unknown as AssetTracker, 800, 600);

        expect(requestImage).not.toHaveBeenCalled();
    });
});
