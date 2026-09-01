import { describe, it, expect } from 'vitest';
import { Graphics3D } from '@/render3d/graphics3d';
import { Graphics2D } from '@/render/graphics2d';
import { Geo, Mat, Tex } from '@/render3d/builders';
import { evaluateParametric } from '@/render3d/geometry';
import {
    lerpVector3, lerpEuler3, slerpQuaternion, resolveVector3, quaternionFromEuler,
} from '@/render3d/vector3';
import { isDataTexture3D, isSurfaceTexture3D, resolveSurfaceSource, texture3DSource } from '@/render3d/texture';
import { Rect } from '@/nodes/geometry/rect-node';
import { track3DResources } from '@/render3d/tracking';
import type { AssetTracker } from '@/assets/tracker';

describe('Graphics3D', () => {
    it('records drawables in order', () => {
        const g3 = new Graphics3D()
            .box({ width: 2 })
            .sphere({ radius: 1 })
            .plane();

        expect(g3.ops().map((o) => o.kind)).toEqual(['mesh', 'mesh', 'mesh']);
    });

    // The whole point of the 2D/3D split: what one node draws carries no
    // hierarchy and no lights. Those are the scene's, and live on `Scene3D`.
    it('records only drawables — no hierarchy, no lights, no scene settings', () => {
        const g3 = new Graphics3D() as unknown as Record<string, unknown>;
        for (const absent of [
            'push', 'pop', 'group', 'light', 'ambient', 'directional', 'point', 'spot',
            'hemisphere', 'area', 'camera', 'perspective', 'orthographic',
            'fog', 'background', 'environment', 'shadows', 'tone', 'post',
        ]) {
            expect(g3[absent], absent).toBeUndefined();
        }
    });

    // The load-bearing property: the flat sugar bag desugars into a canonical
    // op, so the recorded list is the same whether the author used sugar or the
    // explicit `mesh(geometry, material, transform)` form.
    it('desugars a flat shorthand bag into geometry / material / transform', () => {
        const g3 = new Graphics3D().box({
            width: 2, height: 3,
            fill: 'red', roughness: 0.4,
            position: [1, 0, 0], rotation: [0, 90, 0],
        });

        expect(g3.ops()[0]).toEqual({
            kind: 'mesh',
            geometry: { type: 'box', width: 2, height: 3 },
            material: { type: 'standard', color: 'red', roughness: 0.4 },
            transform: { position: [1, 0, 0], rotation: [0, 90, 0] },
        });
    });

    it('sugar and the explicit mesh() form record the same op', () => {
        const sugared = new Graphics3D().box({ width: 2, fill: 'red', position: [1, 0, 0] });
        const explicit = new Graphics3D().mesh(
            Geo.box({ width: 2 }),
            Mat.standard({ color: 'red' }),
            { position: [1, 0, 0] },
        );
        expect(sugared.ops()).toEqual(explicit.ops());
    });

    it('an explicit material wins over the shorthand fields', () => {
        const g3 = new Graphics3D().box({
            width: 1,
            fill: 'red',                                   // ignored
            material: Mat.phong({ color: 'blue', shininess: 40 }),
        });
        expect((g3.ops()[0] as { material: unknown }).material)
            .toEqual({ type: 'phong', color: 'blue', shininess: 40 });
    });

    it('unlit selects a basic material instead of standard', () => {
        const g3 = new Graphics3D().box({ unlit: true, fill: 'white' });
        expect((g3.ops()[0] as { material: unknown }).material)
            .toEqual({ type: 'basic', color: 'white' });
        // `unlit` is a shorthand directive, not a geometry param.
        expect((g3.ops()[0] as { geometry: unknown }).geometry).toEqual({ type: 'box' });
    });

    it('a mesh always records a material, so the op needs no defaulting downstream', () => {
        const g3 = new Graphics3D().box();
        expect((g3.ops()[0] as { material: unknown }).material).toEqual({ type: 'standard' });
        expect(new Graphics3D().mesh(Geo.sphere()).ops()[0]).toMatchObject({
            material: { type: 'standard' },
        });
    });

    it('omits transform entirely when the bag carries no placement', () => {
        const g3 = new Graphics3D().box({ width: 1, fill: 'red' });
        expect((g3.ops()[0] as { transform: unknown }).transform).toBeUndefined();
    });

    it('isEmpty is true until something drawable is recorded', () => {
        expect(new Graphics3D().isEmpty()).toBe(true);
        expect(new Graphics3D().box().isEmpty()).toBe(false);
    });

    it('line() accepts explicit points and flattens them into a buffer geometry', () => {
        const g3 = new Graphics3D().line({
            points: [[0, 0, 0], { x: 1, y: 2, z: 3 }],
            stroke: { fill: 'white' },
        });
        expect(g3.ops()[0]).toEqual({
            kind: 'line',
            geometry: { type: 'buffer', position: [0, 0, 0, 1, 2, 3] },
            material: { type: 'lineBasic', color: 'white' },
            mode: 'strip',
            transform: undefined,
        });
    });

    // `closed` and `segments` are the 2D `Line` node's own vocabulary; the enum
    // they replaced still exists one level down, where it picks a three class.
    it('line() maps closed / segments onto the recorded mode', () => {
        const closed = new Graphics3D().line({ points: [[0, 0, 0], [1, 0, 0]], closed: true });
        expect((closed.ops()[0] as { mode: string }).mode).toBe('loop');

        const g3 = new Graphics3D().line({
            geometry: Geo.edges(Geo.box({ width: 2 })),
            segments: true,
            opacity: 0.4,
        });
        const op = g3.ops()[0] as { geometry: unknown; material: unknown; mode: string };
        expect(op.mode).toBe('segments');
        expect(op.geometry).toEqual({ type: 'edges', source: { type: 'box', width: 2 } });
        // No `transparent` here any more — the renderer derives it from opacity.
        expect(op.material).toEqual({ type: 'lineBasic', opacity: 0.4 });
    });

    it('line() requires either points or geometry', () => {
        expect(() => new Graphics3D().line({ stroke: { fill: 'red' } })).toThrow(/points.*geometry/);
    });

    it('model() normalizes a single animation into an array', () => {
        const g3 = new Graphics3D().model({ src: '/robot.glb', animation: { clip: 'walk', time: 1.5 } });
        expect(g3.ops()[0]).toMatchObject({
            kind: 'model',
            src: '/robot.glb',
            animation: [{ clip: 'walk', time: 1.5 }],
        });
    });

    it('instances() records per-instance transforms and the count follows the array', () => {
        const placements = [{ position: [0, 0, 0] }, { position: [1, 0, 0] }] as const;
        const g3 = new Graphics3D().instances(Geo.box(), Mat.standard(), placements);
        expect(g3.ops()[0]).toMatchObject({ kind: 'instances', instances: placements });
    });
});

describe('Geo / Mat / Tex builders', () => {
    it('stamp the discriminant onto the params', () => {
        expect(Geo.box({ width: 2 })).toEqual({ type: 'box', width: 2 });
        expect(Mat.standard({ color: 'red' })).toEqual({ type: 'standard', color: 'red' });
        expect(Tex.image('/wood.png', { repeat: [2, 2] })).toEqual({ src: '/wood.png', repeat: [2, 2] });
    });

    it('polyhedron helpers select the right shape', () => {
        expect(Geo.icosahedron({ segments: 2 }))
            .toEqual({ type: 'polyhedron', shape: 'icosahedron', segments: 2 });
    });

    // No `key`: identity comes from the source object, which the contract already
    // requires to be hoisted.
    it('Tex.surface takes a 2D source value and defaults its buffer size', () => {
        const source = new Graphics2D();
        expect(Tex.surface(source)).toEqual({ source, width: 512, height: 512 });
        expect(Tex.surface(source, { width: 1024, height: 640, flipY: false }))
            .toEqual({ source, width: 1024, height: 640, flipY: false });
    });
});

describe('Texture3D discrimination', () => {
    it('separates the three texture forms', () => {
        const image = Tex.image('/wood.png');
        const data = Tex.data(new Uint8Array(4), 1, 1);
        const surface = Tex.surface(new Graphics2D(), { width: 8, height: 8 });

        expect(isDataTexture3D(data)).toBe(true);
        expect(isDataTexture3D(surface)).toBe(false);
        expect(isSurfaceTexture3D(surface)).toBe(true);
        expect(isSurfaceTexture3D(image)).toBe(false);
        expect(isSurfaceTexture3D('/wood.png')).toBe(false);
    });

    // A surface has no manifest asset, so the tracking pass must see "nothing to
    // request" — `getImageMeta` throws for an unknown src, so leaking `undefined`
    // through here would break precomp outright.
    it('reports no asset source for data and surface textures', () => {
        expect(texture3DSource('/wood.png')).toBe('/wood.png');
        expect(texture3DSource(Tex.image('/wood.png'))).toBe('/wood.png');
        expect(texture3DSource(Tex.data(new Uint8Array(4), 1, 1))).toBeNull();
        expect(texture3DSource(Tex.surface(new Graphics2D(), { width: 8, height: 8 }))).toBeNull();
    });

    // The two arms are drawn completely differently — a Graphics2D is replayed into
    // a render context, a Node2D is laid out and rendered — so the narrowing is
    // load-bearing, not cosmetic.
    it('resolveSurfaceSource separates the two source arms', () => {
        const graphics = new Graphics2D();
        const node = new Rect({ width: 8, height: 8 });

        expect(resolveSurfaceSource(graphics)).toEqual({ kind: 'graphics', graphics });
        expect(resolveSurfaceSource(node)).toEqual({ kind: 'node', node });
    });

    it('track3DResources skips a surface map and still finds image maps', () => {
        const requested: string[] = [];
        const tracker = {
            addImage: (src: string) => { requested.push(src); },
            addFont: () => { },
            addAsync: () => { },
        } as unknown as AssetTracker;

        const g3 = new Graphics3D()
            .plane({ fill: Tex.surface(new Graphics2D(), { width: 8, height: 8 }) })
            .plane({ fill: '/wood.png' });
        track3DResources(g3, tracker, 100, 100);

        expect(requested).toEqual(['/wood.png']);
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
