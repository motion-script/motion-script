import { describe, it, expect } from 'vitest';
import { Canvas3D } from '@/nodes/three/canvas3d-node';
import { Group3D } from '@/nodes/three/group3d';
import { Box3D, Sphere3D } from '@/nodes/three/geometry-nodes';
import { PerspectiveCamera3D } from '@/nodes/three/camera-nodes';
import { Text } from '@/nodes/text/text-node';
import { Canvas2D } from '@/nodes/scene/canvas2d-node';
import { Node2D } from '@/nodes/2d/node2d';
import { BoxBounds } from '@/attributes/layout/bounds';
import { Vector2 } from '@/attributes/layout/vector2';
import { FakeMeasurer } from '@/runtime/runtime.fixtures';
import { collectBoxes, nodeBoxAt, pickNode, NodeBox } from '@/runtime/node-picking';
import { geometryBounds3D } from '@/render3d/bounds3d';

const scope = new FakeMeasurer();

/** A viewport 400×300, centred on the origin, with `children` inside it. */
function viewport(children: unknown[]): Canvas3D {
    const canvas = new Canvas3D({ width: 400, height: 300, children } as any);
    canvas.layout({ x: 0, y: 0, width: 400, height: 300 } as BoxBounds, scope);
    return canvas;
}

/** The one box in `boxes` at `path`, or a failure naming what was there instead. */
function at(boxes: NodeBox[], path: string): NodeBox {
    const found = boxes.find((box) => box.path === path);
    expect(found, `no box at "${path}" — got ${boxes.map((b) => b.path).join(', ')}`).toBeDefined();
    return found as NodeBox;
}

function closeTo(actual: number, expected: number, eps = 1e-6): void {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(eps);
}

describe('geometryBounds3D', () => {
    it('takes three\'s own defaults for an unparameterised primitive', () => {
        expect(geometryBounds3D({ type: 'box' })).toEqual({
            min: { x: -0.5, y: -0.5, z: -0.5 },
            max: { x: 0.5, y: 0.5, z: 0.5 },
        });
        expect(geometryBounds3D({ type: 'sphere' })).toEqual({
            min: { x: -1, y: -1, z: -1 },
            max: { x: 1, y: 1, z: 1 },
        });
    });

    it('adds the caps to a capsule\'s straight mid-section', () => {
        // `height` is the mid-section alone, so a radius lands at each end.
        const bounds = geometryBounds3D({ type: 'capsule', radius: 0.5, height: 2 });
        expect(bounds).toEqual({
            min: { x: -0.5, y: -1.5, z: -0.5 },
            max: { x: 0.5, y: 1.5, z: 0.5 },
        });
    });

    it('takes the wider of a cylinder\'s two radii', () => {
        const bounds = geometryBounds3D({ type: 'cylinder', radiusTop: 0.2, radiusBottom: 2, height: 4 });
        expect(bounds).toEqual({
            min: { x: -2, y: -2, z: -2 },
            max: { x: 2, y: 2, z: 2 },
        });
    });

    it('is flat where the geometry is flat', () => {
        const bounds = geometryBounds3D({ type: 'plane', width: 4, height: 2 });
        closeTo(bounds?.min.z ?? NaN, 0);
        closeTo(bounds?.max.z ?? NaN, 0);
        closeTo(bounds?.max.x ?? NaN, 2);
        closeTo(bounds?.max.y ?? NaN, 1);
    });

    it('reads a buffer geometry off its positions', () => {
        const bounds = geometryBounds3D({
            type: 'buffer',
            position: [0, 0, 0, 3, -1, 2, -1, 5, 1],
        });
        expect(bounds).toEqual({
            min: { x: -1, y: -1, z: 0 },
            max: { x: 3, y: 5, z: 2 },
        });
    });

    it('declines the three it cannot measure from the descriptor alone', () => {
        expect(geometryBounds3D({ type: 'modelGeometry', src: 'robot.glb' })).toBeNull();
        expect(geometryBounds3D({ type: 'extrude', shape: 'M0 0 L1 1' })).toBeNull();
        expect(geometryBounds3D({ type: 'parametric', segments: 4, vertex: () => ({ x: 0, y: 0, z: 0 }) })).toBeNull();
    });
});

describe('collectBoxes – 3D', () => {
    it('projects a mesh into the viewport, centred where the camera looks', () => {
        const canvas = viewport([
            new PerspectiveCamera3D({ position: [0, 0, 10], lookAt: 0, fov: 45 }),
            new Box3D({ width: 2, height: 2, depth: 2 }),
        ]);

        const boxes: NodeBox[] = [];
        collectBoxes(canvas, '3', boxes, false);

        // Path "3.1": the second child of the viewport, counted over the authored
        // list — the camera is index 0 even though it draws nothing.
        const box = at(boxes, '3.1');
        expect(box.type).toBe('Box3D');
        // A cube at the origin, seen down the axis, lands on the viewport's centre.
        closeTo(box.center.x, 0, 1e-9);
        closeTo(box.center.y, 0, 1e-9);
        // …and is square on screen, since the viewport's own aspect is applied to
        // the projection rather than to the result.
        closeTo(box.width, box.height, 1e-9);
        // Small enough to sit inside the viewport, big enough to be visible: a
        // 2-unit cube 10 units from a 45° camera is roughly a quarter of the height.
        expect(box.height).toBeGreaterThan(40);
        expect(box.height).toBeLessThan(120);
    });

    it('moves the box when the mesh moves', () => {
        const centred = viewport([
            new PerspectiveCamera3D({ position: [0, 0, 10], lookAt: 0 }),
            new Box3D({ width: 1 }),
        ]);
        const shifted = viewport([
            new PerspectiveCamera3D({ position: [0, 0, 10], lookAt: 0 }),
            new Box3D({ width: 1, position: [2, 0, 0] }),
        ]);

        const a: NodeBox[] = [];
        const b: NodeBox[] = [];
        collectBoxes(centred, '', a, true);
        collectBoxes(shifted, '', b, true);

        // +X in the scene is +X on screen.
        expect(at(b, '1').center.x).toBeGreaterThan(at(a, '1').center.x + 10);
        // Wider, but not much: an off-axis cube's near and far faces project to
        // different spans, so the box that encloses both grows — which is the
        // *correct* screen extent of the shape, not slack in the projection.
        expect(at(b, '1').width).toBeGreaterThan(at(a, '1').width);
        expect(at(b, '1').width).toBeLessThan(at(a, '1').width * 1.6);
    });

    it('gives a group the union of what is inside it', () => {
        const canvas = viewport([
            new PerspectiveCamera3D({ position: [0, 0, 20], lookAt: 0 }),
            new Group3D({
                children: [
                    new Box3D({ width: 1, position: [-3, 0, 0] }),
                    new Box3D({ width: 1, position: [3, 0, 0] }),
                ],
            } as any),
        ]);

        const boxes: NodeBox[] = [];
        collectBoxes(canvas, '', boxes, true);

        const group = at(boxes, '1');
        const left = at(boxes, '1.0');
        const right = at(boxes, '1.1');
        expect(group.type).toBe('Group3D');
        // The group spans both children and neither child spans the other.
        expect(group.width).toBeGreaterThan(left.width + right.width);
        closeTo(group.center.x, 0, 1e-6);
    });

    it('skips a hidden node and everything under it', () => {
        const canvas = viewport([
            new PerspectiveCamera3D({ position: [0, 0, 10], lookAt: 0 }),
            new Box3D({ width: 1, visible: false }),
            new Sphere3D({ radius: 0.5 }),
        ]);

        const boxes: NodeBox[] = [];
        collectBoxes(canvas, '', boxes, true);

        expect(boxes.some((box) => box.path === '1')).toBe(false);
        expect(at(boxes, '2').type).toBe('Sphere3D');
    });

    it('numbers a HUD child against the authored list, not the 2D one', () => {
        const canvas = viewport([
            new Box3D({ width: 1 }),
            new Text({ text: 'FPS', x: 0, y: 0 }),
        ]);

        const boxes: NodeBox[] = [];
        collectBoxes(canvas, '', boxes, true);

        // The label is the *second* child as written, and dropping the mesh from
        // the count would have handed it path "0" — the mesh's own.
        expect(at(boxes, '1').type).toBe('Text');
        expect(at(boxes, '0').type).toBe('Box3D');
    });

    it('reports nothing for a scene whose meshes are all behind the camera', () => {
        const canvas = viewport([
            // Looking away from the cube: the camera sits at −Z aimed further −Z.
            new PerspectiveCamera3D({ position: [0, 0, -10], lookAt: [0, 0, -20] }),
            new Box3D({ width: 1 }),
        ]);

        const boxes: NodeBox[] = [];
        collectBoxes(canvas, '', boxes, true);
        expect(boxes.some((box) => box.path === '1')).toBe(false);
    });
});

describe('nodeBoxAt – 3D', () => {
    it('resolves a mesh by the path the walks report it at', () => {
        // The gizmo's own lookup: it holds a path and asks for that one box. A
        // mesh is not in the 2D child list at all, so this is the case a plain
        // `nodeBox` walk cannot answer.
        const canvas = viewport([
            new PerspectiveCamera3D({ position: [0, 0, 10], lookAt: 0 }),
            new Box3D({ width: 2 }),
        ]);

        const collected: NodeBox[] = [];
        collectBoxes(canvas, '', collected, true);
        const walked = at(collected, '1');

        const direct = nodeBoxAt(canvas, '1');
        expect(direct?.type).toBe('Box3D');
        expect(direct?.center).toEqual(walked.center);
        expect(direct?.width).toBe(walked.width);
    });

    it('reaches a mesh nested inside a group', () => {
        const canvas = viewport([
            new PerspectiveCamera3D({ position: [0, 0, 10], lookAt: 0 }),
            new Group3D({ children: [new Box3D({ width: 1 })] } as any),
        ]);

        expect(nodeBoxAt(canvas, '1')?.type).toBe('Group3D');
        expect(nodeBoxAt(canvas, '1.0')?.type).toBe('Box3D');
        expect(nodeBoxAt(canvas, '1.7')).toBeNull();
    });
});

describe('pickNode – 3D', () => {
    /** The viewport-space point under the centre of the box at `path`. */
    function centreOf(canvas: Canvas3D, path: string): Vector2 {
        const boxes: NodeBox[] = [];
        collectBoxes(canvas, '', boxes, true);
        return at(boxes, path).center;
    }

    it('picks the mesh under the pointer', () => {
        const canvas = viewport([
            new PerspectiveCamera3D({ position: [0, 0, 12], lookAt: 0 }),
            new Box3D({ width: 2, position: [-3, 0, 0] }),
            new Box3D({ width: 2, position: [3, 0, 0] }),
        ]);

        expect(pickNode(canvas, centreOf(canvas, '1'))?.path).toBe('1');
        expect(pickNode(canvas, centreOf(canvas, '2'))?.path).toBe('2');
    });

    it('picks the nearer of two overlapping meshes', () => {
        const canvas = viewport([
            new PerspectiveCamera3D({ position: [0, 0, 12], lookAt: 0 }),
            new Box3D({ width: 2, position: [0, 0, -4] }),
            new Box3D({ width: 2, position: [0, 0, 4] }),
        ]);

        // Both are on the axis, so both boxes contain the centre; the one nearer
        // the camera is what you can see.
        expect(pickNode(canvas, { x: 0, y: 0 })?.path).toBe('2');
    });

    it('falls through to the viewport where no mesh is', () => {
        // Rooted, because `pickNode` never returns the node it was handed — the
        // root is the stage, not a selectable thing.
        const root = new Canvas2D({});
        const canvas = new Canvas3D({
            width: 400,
            height: 300,
            children: [
                new PerspectiveCamera3D({ position: [0, 0, 12], lookAt: 0 }),
                new Box3D({ width: 1 }),
            ],
        } as any);
        root.add(canvas as unknown as Node2D);
        root.layout({ x: 0, y: 0, width: 400, height: 300 } as BoxBounds, scope);
        canvas.layout({ x: 0, y: 0, width: 400, height: 300 } as BoxBounds, scope);

        // Near the viewport's corner, well clear of a 1-unit cube on the axis.
        const picked = pickNode(root, { x: 190, y: 140 });
        expect(picked?.type).toBe('Canvas3D');
        expect(picked?.path).toBe('0');
    });

    it('lets a 2D HUD child win over the mesh behind it', () => {
        const label = new Text({ text: 'FPS', x: 0, y: 0 }) as unknown as Node2D;
        const canvas = viewport([
            new PerspectiveCamera3D({ position: [0, 0, 12], lookAt: 0 }),
            new Box3D({ width: 4 }),
            label,
        ]);

        // The label is laid out over the centre of the viewport, where the cube is.
        const picked = pickNode(canvas, { x: 0, y: 0 });
        expect(picked?.type).toBe('Text');
    });
});
