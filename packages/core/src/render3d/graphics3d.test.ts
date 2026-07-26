import { describe, it, expect } from 'vitest';
import { Graphics3D } from '@/render3d/graphics3d';
import { Geo, Mat, Tex } from '@/render3d/builders';
import { evaluateParametric } from '@/render3d/geometry';
import {
    lerpVector3, lerpEuler3, slerpQuaternion, resolveVector3, quaternionFromEuler,
} from '@/render3d/vector3';

describe('Graphics3D', () => {
    it('records drawables in order', () => {
        const g = new Graphics3D()
            .ambient({ intensity: 0.4 })
            .box({ width: 2 })
            .sphere({ radius: 1 })
            .directional({ intensity: 2 });

        expect(g.ops().map((o) => o.kind)).toEqual(['light', 'mesh', 'mesh', 'light']);
    });

    it('group(transform, build) brackets its children with push/pop', () => {
        const g = new Graphics3D()
            .box()
            .group({ position: [1, 0, 0] }, (inner) => inner.sphere().torus())
            .plane();

        expect(g.ops().map((o) => o.kind)).toEqual([
            'mesh', 'push', 'mesh', 'mesh', 'pop', 'mesh',
        ]);
        expect(g.ops()[1]).toEqual({ kind: 'push', transform: { position: [1, 0, 0] } });
    });

    it('group() accepts a bare callback with no transform', () => {
        const g = new Graphics3D().group((inner) => inner.box());
        expect(g.ops().map((o) => o.kind)).toEqual(['push', 'mesh', 'pop']);
        expect(g.ops()[0]).toEqual({ kind: 'push', transform: undefined });
    });

    it('assertBalanced throws on an unclosed push and passes for group()', () => {
        expect(() => new Graphics3D().push().box().assertBalanced()).toThrow(/unclosed push/);
        expect(() => new Graphics3D().pop().assertBalanced()).toThrow(/extra pop/);
        expect(() => new Graphics3D().group((g) => g.box()).assertBalanced()).not.toThrow();
        expect(() => new Graphics3D().box().assertBalanced()).not.toThrow();
    });

    // The load-bearing property: the flat sugar bag desugars into a canonical
    // op, so the recorded list is the same whether the author used sugar or the
    // explicit `mesh(geometry, material, transform)` form.
    it('desugars a flat shorthand bag into geometry / material / transform', () => {
        const g = new Graphics3D().box({
            width: 2, height: 3,
            color: 'red', roughness: 0.4,
            position: [1, 0, 0], rotation: [0, 90, 0],
        });

        expect(g.ops()[0]).toEqual({
            kind: 'mesh',
            geometry: { type: 'box', width: 2, height: 3 },
            material: { type: 'standard', color: 'red', roughness: 0.4 },
            transform: { position: [1, 0, 0], rotation: [0, 90, 0] },
        });
    });

    it('sugar and the explicit mesh() form record the same op', () => {
        const sugared = new Graphics3D().box({ width: 2, color: 'red', position: [1, 0, 0] });
        const explicit = new Graphics3D().mesh(
            Geo.box({ width: 2 }),
            Mat.standard({ color: 'red' }),
            { position: [1, 0, 0] },
        );
        expect(sugared.ops()).toEqual(explicit.ops());
    });

    it('an explicit material wins over the shorthand fields', () => {
        const g = new Graphics3D().box({
            width: 1,
            color: 'red',                                  // ignored
            material: Mat.phong({ color: 'blue', shininess: 40 }),
        });
        expect((g.ops()[0] as { material: unknown }).material)
            .toEqual({ type: 'phong', color: 'blue', shininess: 40 });
    });

    it('unlit selects a basic material instead of standard', () => {
        const g = new Graphics3D().box({ unlit: true, color: 'white' });
        expect((g.ops()[0] as { material: unknown }).material)
            .toEqual({ type: 'basic', color: 'white' });
        // `unlit` is a shorthand directive, not a geometry param.
        expect((g.ops()[0] as { geometry: unknown }).geometry).toEqual({ type: 'box' });
    });

    it('a mesh always records a material, so the op needs no defaulting downstream', () => {
        const g = new Graphics3D().box();
        expect((g.ops()[0] as { material: unknown }).material).toEqual({ type: 'standard' });
        expect(new Graphics3D().mesh(Geo.sphere()).ops()[0]).toMatchObject({
            material: { type: 'standard' },
        });
    });

    it('omits transform entirely when the bag carries no placement', () => {
        const g = new Graphics3D().box({ width: 1, color: 'red' });
        expect((g.ops()[0] as { transform: unknown }).transform).toBeUndefined();
    });

    it('splits a light bag into light params and placement', () => {
        const g = new Graphics3D().directional({ intensity: 2.4, position: [4, 6, 3], castShadow: true });
        expect(g.ops()[0]).toEqual({
            kind: 'light',
            light: { type: 'directional', intensity: 2.4 },
            transform: { position: [4, 6, 3], castShadow: true },
        });
    });

    // Scene settings are singletons — recording them positionally would imply an
    // ordering that doesn't exist, so they're fields with query accessors,
    // mirroring how Graphics exposes groupOpacity()/groupTransform().
    it('scene settings are graphics-level fields, not ops', () => {
        const g = new Graphics3D()
            .box()
            .perspective({ fov: 45 })
            .fog({ type: 'linear', color: 'black', near: 1, far: 10 })
            .background('#0b0d12')
            .shadows(true)
            .tone({ mapping: 'aces', exposure: 1.2 });

        expect(g.ops().map((o) => o.kind)).toEqual(['mesh']);
        expect(g.cameraDescriptor()).toEqual({ type: 'perspective', fov: 45 });
        expect(g.fogDescriptor()).toEqual({ type: 'linear', color: 'black', near: 1, far: 10 });
        expect(g.backgroundDescriptor()).toBe('#0b0d12');
        expect(g.shadowSettings()).toEqual({ enabled: true });
        expect(g.toneSettings()).toEqual({ mapping: 'aces', exposure: 1.2 });
    });

    it('last writer wins for a scene setting', () => {
        const g = new Graphics3D().perspective({ fov: 30 }).perspective({ fov: 60 });
        expect(g.cameraDescriptor()).toEqual({ type: 'perspective', fov: 60 });
    });

    it('fog() coerces a bare Color into linear fog', () => {
        expect(new Graphics3D().fog('#123456').fogDescriptor())
            .toEqual({ type: 'linear', color: '#123456' });
        expect(new Graphics3D().fog(null).fogDescriptor()).toBeNull();
    });

    it('shadows() coerces booleans', () => {
        expect(new Graphics3D().shadows().shadowSettings()).toEqual({ enabled: true });
        expect(new Graphics3D().shadows(false).shadowSettings()).toEqual({ enabled: false });
        expect(new Graphics3D().shadows({ type: 'vsm' }).shadowSettings()).toEqual({ type: 'vsm' });
    });

    it('post() appends passes in order', () => {
        const g = new Graphics3D()
            .post({ type: 'bloom', strength: 0.8 })
            .post([{ type: 'fxaa' }, { type: 'outline' }]);
        expect(g.postEffects().map((e) => e.type)).toEqual(['bloom', 'fxaa', 'outline']);
    });

    it('isEmpty is true until something drawable is recorded', () => {
        expect(new Graphics3D().isEmpty()).toBe(true);
        // Settings and bare grouping still draw nothing.
        expect(new Graphics3D().perspective().background('red').isEmpty()).toBe(true);
        expect(new Graphics3D().group(() => { }).isEmpty()).toBe(true);
        expect(new Graphics3D().box().isEmpty()).toBe(false);
        expect(new Graphics3D().ambient().isEmpty()).toBe(false);
    });

    it('line() accepts explicit points and flattens them into a buffer geometry', () => {
        const g = new Graphics3D().line({ points: [[0, 0, 0], { x: 1, y: 2, z: 3 }], color: 'white' });
        expect(g.ops()[0]).toEqual({
            kind: 'line',
            geometry: { type: 'buffer', position: [0, 0, 0, 1, 2, 3] },
            material: { type: 'lineBasic', color: 'white' },
            mode: 'strip',
            transform: undefined,
        });
    });

    it('line() accepts a geometry (e.g. edges) and a segments mode', () => {
        const g = new Graphics3D().line({
            geometry: Geo.edges(Geo.box({ width: 2 })),
            mode: 'segments',
            opacity: 0.4,
        });
        const op = g.ops()[0] as { geometry: unknown; material: unknown; mode: string };
        expect(op.mode).toBe('segments');
        expect(op.geometry).toEqual({ type: 'edges', source: { type: 'box', width: 2 } });
        // An opacity shorthand implies transparency, or it would have no effect.
        expect(op.material).toEqual({ type: 'lineBasic', opacity: 0.4, transparent: true });
    });

    it('line() requires either points or geometry', () => {
        expect(() => new Graphics3D().line({ color: 'red' })).toThrow(/points.*geometry/);
    });

    it('model() normalizes a single animation into an array', () => {
        const g = new Graphics3D().model({ src: '/robot.glb', animation: { clip: 'walk', time: 1.5 } });
        expect(g.ops()[0]).toMatchObject({
            kind: 'model',
            src: '/robot.glb',
            animation: [{ clip: 'walk', time: 1.5 }],
        });
    });

    it('instances() records per-instance transforms and the count follows the array', () => {
        const placements = [{ position: [0, 0, 0] }, { position: [1, 0, 0] }] as const;
        const g = new Graphics3D().instances(Geo.box(), Mat.standard(), placements);
        expect(g.ops()[0]).toMatchObject({ kind: 'instances', instances: placements });
    });
});

describe('Geo / Mat / Tex builders', () => {
    it('stamp the discriminant onto the params', () => {
        expect(Geo.box({ width: 2 })).toEqual({ type: 'box', width: 2 });
        expect(Mat.standard({ color: 'red' })).toEqual({ type: 'standard', color: 'red' });
        expect(Tex.image('/wood.png', { repeat: [2, 2] })).toEqual({ src: '/wood.png', repeat: [2, 2] });
    });

    it('polyhedron helpers select the right shape', () => {
        expect(Geo.icosahedron({ detail: 2 }))
            .toEqual({ type: 'polyhedron', shape: 'icosahedron', detail: 2 });
    });
});

describe('evaluateParametric', () => {
    it('builds a (segments+1)^2 vertex grid with two triangles per cell', () => {
        const buffer = evaluateParametric({
            type: 'parametric',
            segments: 2,
            vertex: (u, v) => ({ x: u, y: 0, z: v }),
        });

        expect(buffer.type).toBe('buffer');
        expect(buffer.position).toHaveLength(9 * 3);     // 3x3 vertices
        expect(buffer.index).toHaveLength(2 * 2 * 6);    // 4 cells, 2 tris, 3 indices
        expect(buffer.uv).toHaveLength(9 * 2);
    });

    it('samples the vertex callback across the full 0..1 range on both axes', () => {
        const buffer = evaluateParametric({
            type: 'parametric',
            segments: [1, 1],
            vertex: (u, v) => ({ x: u, y: 0, z: v }),
        });
        // 2x2 grid: (0,0) (1,0) (0,1) (1,1) — x carries u, z carries v.
        expect(Array.from(buffer.position as Float32Array)).toEqual([
            0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1,
        ]);
    });

    it('accepts a tuple vertex and non-square segment counts', () => {
        const buffer = evaluateParametric({
            type: 'parametric',
            segments: [3, 1],
            vertex: (u, v) => [u, v, 0],
        });
        expect(buffer.position).toHaveLength(4 * 2 * 3);
        expect(buffer.index).toHaveLength(3 * 1 * 6);
    });

    it('emits a linear-rgb colour buffer only when a colour callback is given', () => {
        const plain = evaluateParametric({
            type: 'parametric', segments: 1, vertex: () => ({ x: 0, y: 0, z: 0 }),
        });
        expect(plain.color).toBeUndefined();

        const tinted = evaluateParametric({
            type: 'parametric', segments: 1,
            vertex: () => ({ x: 0, y: 0, z: 0 }),
            color: () => 'red',
        });
        expect(tinted.color).toHaveLength(4 * 3);
        // Linear-light red — what a vertex-colour buffer wants, not gamma sRGB.
        expect(Array.from(tinted.color as Float32Array).slice(0, 3)).toEqual([1, 0, 0]);
    });

    it('passes computeNormals through so the renderer derives lighting normals', () => {
        const buffer = evaluateParametric({
            type: 'parametric', segments: 1,
            vertex: () => ({ x: 0, y: 0, z: 0 }),
            computeNormals: true,
        });
        expect(buffer.computeNormals).toBe(true);
        expect(buffer.normal).toBeUndefined();   // derived on the GPU side, not here
    });
});

describe('3D math', () => {
    it('resolveVector3 accepts objects, tuples and scalar broadcast', () => {
        expect(resolveVector3({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 });
        expect(resolveVector3([1, 2, 3])).toEqual({ x: 1, y: 2, z: 3 });
        expect(resolveVector3(2)).toEqual({ x: 2, y: 2, z: 2 });
        expect(resolveVector3(undefined)).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('lerpVector3 interpolates component-wise', () => {
        expect(lerpVector3({ x: 0, y: 0, z: 0 }, { x: 10, y: 20, z: 30 }, 0.5))
            .toEqual({ x: 5, y: 10, z: 15 });
    });

    it('lerpEuler3 interpolates angles and snaps the discrete order', () => {
        const out = lerpEuler3({ x: 0, y: 0, z: 0, order: 'XYZ' }, { x: 90, y: 0, z: 0, order: 'ZYX' }, 0.25);
        expect(out.x).toBe(22.5);
        expect(out.order).toBe('XYZ');
        expect(lerpEuler3({ x: 0, y: 0, z: 0, order: 'XYZ' }, { x: 90, y: 0, z: 0, order: 'ZYX' }, 0.75).order)
            .toBe('ZYX');
    });

    it('slerpQuaternion returns the endpoints exactly', () => {
        const a = quaternionFromEuler({ x: 0, y: 0, z: 0 });
        const b = quaternionFromEuler({ x: 0, y: 90, z: 0 });
        expect(slerpQuaternion(a, b, 0)).toMatchObject({ w: expect.closeTo(a.w, 6) });
        expect(slerpQuaternion(a, b, 1)).toMatchObject({ w: expect.closeTo(b.w, 6) });
    });

    it('slerpQuaternion stays on the unit hypersphere', () => {
        const a = quaternionFromEuler({ x: 30, y: 0, z: 0 });
        const b = quaternionFromEuler({ x: 0, y: 150, z: 20 });
        for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
            const q = slerpQuaternion(a, b, t);
            expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 6);
        }
    });

    // Both q and -q describe the same rotation; slerp must pick the nearer
    // representative or the object spins the long way round.
    it('slerpQuaternion takes the short arc when the inputs face away', () => {
        const a = { x: 0, y: 0, z: 0, w: 1 };
        const b = { x: 0, y: 0, z: 0, w: -1 };   // identity, negated
        const mid = slerpQuaternion(a, b, 0.5);
        expect(Math.abs(mid.w)).toBeCloseTo(1, 6);
        expect(mid.x).toBeCloseTo(0, 6);
    });

    it('quaternionFromEuler treats input as degrees', () => {
        // 180° about Y is (0, 1, 0, 0) — if this were radians it would be nowhere near.
        const q = quaternionFromEuler({ x: 0, y: 180, z: 0 });
        expect(q.y).toBeCloseTo(1, 6);
        expect(q.w).toBeCloseTo(0, 6);
    });
});
