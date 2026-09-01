import { describe, it, expect } from 'vitest';
import { Scene3D, type Scene3DOp } from '@/render3d/scene3d';
import { Node3D } from '@/nodes/three/node3d';
import { Group3D } from '@/nodes/three/group3d';
import { Box3D, Sphere3D } from '@/nodes/three/geometry-nodes';
import { AmbientLight3D, DirectionalLight3D } from '@/nodes/three/light-nodes';
import { Camera3D } from '@/nodes/three/camera-nodes';
import { Fog3D } from '@/nodes/three/environment-nodes';
import { Canvas3D } from '@/nodes/three/canvas3d-node';
import { Rect } from '@/nodes/geometry/rect-node';
import { Text } from '@/nodes/text/text-node';
import { Node2D } from '@/nodes/2d/node2d';
import { parseColor } from '@/attributes/shape/fill/color/parser';
import { attached } from '@/nodes/node/node.fixtures';

/** Record a subtree the way `Canvas3D` does, and hand back the op list. */
function record(root: Node3D): readonly Scene3DOp[] {
    const scene = new Scene3D();
    root.render(scene);
    return scene.ops();
}

/** The `key` on each `push`, i.e. the identity the renderer caches against. */
function pushKeys(ops: readonly Scene3DOp[]): (string | undefined)[] {
    return ops
        .filter((o): o is Extract<Scene3DOp, { kind: 'push' }> => o.kind === 'push')
        .map((o) => o.transform?.key);
}

describe('Node3D → Scene3D', () => {
    it('brackets every node with a balanced push/pop', () => {
        const tree = new Group3D({
            children: [new Box3D(), new Group3D({ children: [new Sphere3D()] })],
        });

        const ops = record(tree);
        expect(ops.map((o) => o.kind)).toEqual([
            'push', /* Box3D */ 'push', 'mesh', 'pop',
            /* inner Group3D */ 'push', /* Sphere3D */ 'push', 'mesh', 'pop', 'pop',
            'pop',
        ]);

        const scene = new Scene3D();
        tree.render(scene);
        expect(() => scene.assertBalanced()).not.toThrow();
    });

    it('keys each group by its node id, not by its index among siblings', () => {
        const box = new Box3D();
        const tree = new Group3D({ children: [box] });

        expect(pushKeys(record(tree))).toEqual([tree.id, box.id]);
    });

    // The whole reason identity moved off the structural path: a conditional
    // sibling used to renumber every later slot and rebuild the tail of the cache.
    it('a conditional sibling does not renumber the nodes after it', () => {
        const kept = new Box3D();
        const withoutFirst = new Group3D({ children: [kept] });
        const first = new Sphere3D();
        const withFirst = new Group3D({ children: [first, kept] });

        expect(pushKeys(record(withoutFirst))).toContain(kept.id);
        expect(pushKeys(record(withFirst))).toContain(kept.id);
    });

    it('a light, a camera and a fog each record their own kind of op', () => {
        const tree = new Group3D({
            children: [
                new Camera3D({ fov: 45 }),
                new AmbientLight3D({ intensity: 0.4 }),
                new Fog3D({ color: '#0b0d12', near: 5, far: 30 }),
                new Box3D({ width: 2 }),
            ],
        });

        const scene = new Scene3D();
        tree.render(scene);

        expect(scene.ops().filter((o) => o.kind === 'camera')).toHaveLength(1);
        expect(scene.ops().filter((o) => o.kind === 'light')).toHaveLength(1);
        expect(scene.cameraDescriptor()).toMatchObject({ type: 'perspective', fov: 45 });
        // `color` is a resolved attribute, so it arrives normalized — the same form
        // `Mesh3D.color` takes, and what the backend's `writeColor` reads.
        expect(scene.fogDescriptor()).toEqual({
            color: parseColor('#0b0d12'), near: 5, far: 30,
        });
    });

    it('carries a node\'s transform onto its group, so a rig moves its contents', () => {
        const rig = new Group3D({ position: [1, 2, 3] });
        const [push] = record(rig);

        expect(push).toMatchObject({
            kind: 'push',
            transform: { position: { x: 1, y: 2, z: 3 } },
        });
    });

    // A camera nested in a moving group must be carried by it. The scene records
    // the camera *inside* the group's push/pop and lets the renderer compose the
    // world matrix, rather than writing an absolute placement.
    it('records a nested camera inside its parent group\'s scope', () => {
        const camera = new Camera3D({ position: [0, 0, 5] });
        const rig = new Group3D({ position: [0, 10, 0], children: [camera] });

        const kinds = record(rig).map((o) => o.kind);
        const push = kinds.indexOf('push');
        const cameraAt = kinds.indexOf('camera');
        const pop = kinds.lastIndexOf('pop');

        expect(push).toBeLessThan(cameraAt);
        expect(cameraAt).toBeLessThan(pop);
    });

    it('an invisible node still records, so hiding does not rebuild its resources', () => {
        const box = new Box3D({ visible: false });
        const ops = record(box);

        expect(ops.map((o) => o.kind)).toEqual(['push', 'mesh', 'pop']);
        expect(ops[0]).toMatchObject({ transform: { visible: false } });
    });

    it('desugars material props onto the mesh the same way the builder does', () => {
        const [, mesh] = record(new Box3D({ width: 2, fill: 'red', roughness: 0.3 }));

        expect(mesh).toMatchObject({
            kind: 'mesh',
            geometry: { type: 'box', width: 2 },
            material: { type: 'standard', roughness: 0.3 },
        });
    });

    it('unlit selects a basic material, as the builder shorthand does', () => {
        const [, mesh] = record(new Box3D({ unlit: true }));
        expect(mesh).toMatchObject({ material: { type: 'basic' } });
    });
});

describe('Node3D animation', () => {
    it('interpolates position / scale rather than snapping', () => {
        const box = attached(new Box3D({ position: [0, 0, 0] }));
        const step = box._prepareStep({ position: [0, 10, 0] } as never, 1);

        step.seek(0.5);
        expect(box.position).toMatchObject({ x: 0, y: 5, z: 0 });

        step.seek(1);
        expect(box.position).toMatchObject({ x: 0, y: 10, z: 0 });
    });

    it('interpolates a Euler rotation per axis', () => {
        const rig = attached(new Group3D({ rotation: [0, 0, 0] }));
        const step = rig._prepareStep({ rotation: [0, 360, 0] } as never, 1);

        step.seek(0.25);
        expect(rig.rotation).toMatchObject({ x: 0, y: 90, z: 0 });
    });

    it('broadcasts a scalar across all three axes', () => {
        expect(new Box3D({ position: 2 }).position).toMatchObject({ x: 2, y: 2, z: 2 });
        expect(new Box3D().scale).toMatchObject({ x: 1, y: 1, z: 1 });
    });
});

describe('mixing the two trees', () => {
    it('a Node2D refuses a Node3D child, and vice versa', () => {
        expect(() => new Rect({ children: [new Box3D()] })).toThrow(/Canvas3D/);
        expect(() => new Group3D({ children: [new Rect({})] as never })).toThrow(/Canvas3D/);
        expect(() => new Rect({}).add(new Box3D() as never)).toThrow(/cannot hold/);
    });

    it('Canvas3D accepts both and partitions them', () => {
        const box = new Box3D();
        const label = new Text({ text: 'FPS 60' });
        const canvas = new Canvas3D({ children: [box, label] });

        expect(canvas.children3D).toEqual([box]);
        // `children` is the 2D tree — the HUD, not the scene.
        expect(canvas.children).toEqual([label]);
        expect(canvas.dimension).toBe('2d');
        expect(box.dimension).toBe('3d');
    });

    it('keeps a 3D child out of layout entirely', () => {
        const label = new Text({ text: 'hud' });
        const canvas = new Canvas3D({ children: [new Box3D(), label] });

        // flowChildren drives every measure and layout pass.
        expect(canvas.flowChildren()).toEqual([label]);
        expect(canvas.flowChildren().every((c) => c instanceof Node2D)).toBe(true);
    });

    it('records only the 3D children into the scene', () => {
        const canvas = new Canvas3D({
            children: [new AmbientLight3D(), new Box3D(), new Text({ text: 'hud' })],
        });

        const scene = new Scene3D();
        for (const child of canvas.children3D) child.render(scene);

        expect(scene.ops().filter((o) => o.kind === 'light')).toHaveLength(1);
        expect(scene.ops().filter((o) => o.kind === 'mesh')).toHaveLength(1);
    });

    it('a Canvas3D with no 3D children records an empty scene', () => {
        const canvas = new Canvas3D({ children: [new Text({ text: 'hud' })] });
        const scene = new Scene3D();
        for (const child of canvas.children3D) child.render(scene);
        expect(scene.isEmpty()).toBe(true);
    });

    it('shares the whole node vocabulary across both trees', () => {
        const rig = new Group3D({ children: [new DirectionalLight3D({ intensity: 2 })] });

        // Same tree API, same signals, same save/restore — inherited from `Node`.
        expect(rig.children).toHaveLength(1);
        expect(typeof rig.to).toBe('function');
        expect(typeof rig.save).toBe('function');
        rig.set({ position: [0, 5, 0] } as never);
        expect(rig.position).toMatchObject({ x: 0, y: 5, z: 0 });
    });
});
