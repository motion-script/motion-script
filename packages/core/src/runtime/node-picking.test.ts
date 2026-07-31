import { describe, it, expect } from 'vitest';
import { Node } from '@/nodes/base/node';
import { Rect } from '@/nodes/geometry/rect-node';
import { RootNode } from '@/nodes/scene/root-node';
import { Camera } from '@/nodes/layout/camera-node';
import { BoxBounds } from '@/attributes/layout/bounds';
import { Vector2 } from '@/attributes/layout/vector2';
import { FakeMeasureScope } from '@/runtime/runtime.fixtures';
import { nodeBox, pickNode, collectBoxes, NodeBox } from '@/runtime/node-picking';

const scope = new FakeMeasureScope();

/** A plain leaf; its layout cell is assigned directly by {@link place}. */
class Tile extends Node {
    constructor(props?: any) {
        super(props ?? {});
    }
}

/** A Tile that hits only its left half — the custom-node seam. */
class LeftHalf extends Tile {
    protected override hitTestSelf(local: Vector2, tolerance: number): boolean {
        return super.hitTestSelf(local, tolerance) && local.x <= 0;
    }
}

/**
 * Assign a node's layout cell, exactly as its parent would. Calling this on a
 * container also lays out its children, so place the parent first and then
 * override each child's cell.
 */
function place(node: Node, rect: BoxBounds): void {
    node.layout(rect, scope);
}

function closeTo(actual: number, expected: number, eps = 1e-9): void {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(eps);
}

function closeToPoint(actual: Vector2, x: number, y: number): void {
    closeTo(actual.x, x);
    closeTo(actual.y, y);
}

describe('nodeBox – geometry', () => {
    it('reports the four corners of an unrotated node', () => {
        const n = new Tile({ x: 30, y: 40 });
        place(n, { x: 0, y: 0, width: 100, height: 60 });

        const box = nodeBox(n, '0');
        expect(box.path).toBe('0');
        expect(box.type).toBe('Tile');
        closeToPoint(box.center, 30, 40);
        closeToPoint(box.topLeft, -20, 70);
        closeToPoint(box.topRight, 80, 70);
        closeToPoint(box.bottomRight, 80, 10);
        closeToPoint(box.bottomLeft, -20, 10);
        expect(box.width).toBe(100);
        expect(box.height).toBe(60);
        // With no camera in play, the box centre is exactly `global`.
        expect(box.center).toEqual(n.global.center);
    });

    it('rotates the corners about the centre, leaving width/height as the layout size', () => {
        const n = new Tile({ rotation: 90 });
        place(n, { x: 0, y: 0, width: 100, height: 50 });

        const box = nodeBox(n, '');
        // 90° clockwise (canvas) maps +x → -y in y-up world space, so the corners
        // swing a quarter turn: topLeft (-50, 25) → (25, 50).
        closeToPoint(box.topLeft, 25, 50);
        closeToPoint(box.topRight, 25, -50);
        closeToPoint(box.bottomRight, -25, -50);
        closeToPoint(box.bottomLeft, -25, 50);
        // Reported size stays the *layout* size, not the rotated extent.
        expect(box.width).toBe(100);
        expect(box.height).toBe(50);
        expect(box.rotation).toBe(90);
    });

    it('folds an ancestor layout-cell offset into the box', () => {
        const parent = new Tile({});
        const child = new Tile({ x: 5, y: 0 });
        parent.addChild(child);
        place(parent, { x: 0, y: 0, width: 400, height: 400 });
        place(child, { x: 100, y: 0, width: 50, height: 50 });

        // World x = cell.x (100) + child.x (5), mirroring Node.global.
        closeTo(nodeBox(child, '0').center.x, 105);
    });

    it('accumulates rotation, scale and opacity up the chain', () => {
        const parent = new Tile({ rotation: 30, scale: 2, opacity: 0.5 });
        const child = new Tile({ rotation: 15, scale: 3, opacity: 0.4 });
        parent.addChild(child);
        place(parent, { x: 0, y: 0, width: 100, height: 100 });
        place(child, { x: 0, y: 0, width: 10, height: 10 });

        const box = nodeBox(child, '0');
        expect(box.rotation).toBe(45);
        expect(box.scale).toBe(6);
        closeTo(box.opacity, 0.2);
    });
});

describe('nodeBox – camera', () => {
    /**
     * The assertion the whole render-matrix walk exists for. A camera is applied
     * at *render* time (`beginCamera`), so it is not part of `Node.worldMatrix`
     * and `Node.global` is blind to it — a box built from `global` alone would sit
     * off the pixels the moment a scene zooms. If this fails, suspect
     * `cameraMatrix`'s argument order or the `vy = -rect.y` sign, not the walk.
     */
    it('doubles a child position and spread under a root at zoom 2', () => {
        const root = new RootNode({ zoom: 2 });
        const child = new Tile({ x: 100, y: 0 });
        root.addChild(child);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(child, { x: 0, y: 0, width: 40, height: 20 });

        // Without the camera, this is where `global` puts it.
        closeTo(child.global.center.x, 100);

        const box = nodeBox(child, '0');
        closeTo(box.center.x, 200);
        closeTo(box.center.y, 0);
        // The corner spread doubles too: half-width 20 → 40 on screen.
        closeTo(box.topRight.x, 240);
        closeTo(box.topLeft.x, 160);
        closeTo(box.topRight.y, 20);
        expect(box.scale).toBe(2);
        // Layout size is unchanged — it is the pre-transform size by contract.
        expect(box.width).toBe(40);
    });

    it('pans by the camera origin', () => {
        const root = new RootNode({ origin: { x: 50, y: 0 } });
        const child = new Tile({ x: 50, y: 0 });
        root.addChild(child);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(child, { x: 0, y: 0, width: 10, height: 10 });

        // The camera centres on world (50, 0), so a node there lands dead centre.
        closeToPoint(nodeBox(child, '0').center, 0, 0);
    });

    it('folds a camera heading into the reported rotation', () => {
        const root = new RootNode({ heading: 90, zoom: 1, origin: { x: 0, y: 0 } });
        const child = new Tile({});
        root.addChild(child);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(child, { x: 0, y: 0, width: 10, height: 10 });

        // The renderer applies rotate(-heading), so the folded canvas rotation is -90.
        expect(nodeBox(child, '0').rotation).toBe(-90);
    });

    it('is inert for a root camera at rest — the renderer pushes nothing', () => {
        const root = new RootNode({});
        const child = new Tile({ x: 100, y: 40 });
        root.addChild(child);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(child, { x: 0, y: 0, width: 10, height: 10 });

        expect(nodeBox(child, '0').center).toEqual(child.global.center);
    });

    it('maps a pick back through the camera', () => {
        const root = new RootNode({ zoom: 2 });
        const child = new Tile({ x: 100, y: 0 });
        root.addChild(child);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(child, { x: 0, y: 0, width: 40, height: 20 });

        // Screen-space 200 is where the node now draws; 100 is where it *was*.
        expect(pickNode(root, { x: 200, y: 0 })?.path).toBe('0');
        expect(pickNode(root, { x: 100, y: 0 })).toBeNull();
    });
});

describe('pickNode – ordering and visibility', () => {
    function stack(...children: Node[]): RootNode {
        const root = new RootNode({});
        for (const c of children) root.addChild(c);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        for (const c of children) place(c, { x: 0, y: 0, width: 100, height: 100 });
        return root;
    }

    it('picks the last of two overlapping siblings — later paints over earlier', () => {
        const under = new Tile({});
        const over = new Tile({});
        const root = stack(under, over);
        expect(pickNode(root, { x: 0, y: 0 })?.id).toBe(over.id);
    });

    it('picks the child, not the parent, when both contain the point', () => {
        const parent = new Tile({});
        const child = new Tile({});
        parent.addChild(child);
        const root = new RootNode({});
        root.addChild(parent);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(parent, { x: 0, y: 0, width: 200, height: 200 });
        place(child, { x: 0, y: 0, width: 50, height: 50 });

        expect(pickNode(root, { x: 0, y: 0 })?.id).toBe(child.id);
        // Outside the child but inside the parent selects the parent.
        expect(pickNode(root, { x: 80, y: 0 })?.id).toBe(parent.id);
        expect(pickNode(root, { x: 80, y: 0 })?.path).toBe('0');
    });

    it('skips an invisible node and returns what is behind it', () => {
        // A scene built with spawn delays keeps not-yet-visible nodes in the tree
        // at opacity 0; those must not be selectable.
        const under = new Tile({});
        const ghost = new Tile({ opacity: 0 });
        const root = stack(under, ghost);
        expect(pickNode(root, { x: 0, y: 0 })?.id).toBe(under.id);
    });

    it('never returns the scene root', () => {
        const root = new RootNode({});
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        expect(pickNode(root, { x: 0, y: 0 })).toBeNull();
    });

    it('misses a rotated node inside its axis-aligned bounds but outside the rotated box', () => {
        const bar = new Tile({ rotation: 45 });
        const root = new RootNode({});
        root.addChild(bar);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(bar, { x: 0, y: 0, width: 200, height: 20 });

        // Along the rotated long axis: a hit.
        expect(pickNode(root, { x: 60, y: -60 })).not.toBeNull();
        // The same distance along the *unrotated* long axis: inside the AABB of
        // the rotated bar, but outside the bar itself.
        expect(pickNode(root, { x: 95, y: 0 })).toBeNull();
    });

    it('honours a custom hitTestSelf override', () => {
        // The seam is public behaviour, not an internal detail: a custom node that
        // draws something other than its box can say so.
        const half = new LeftHalf({});
        const root = new RootNode({});
        root.addChild(half);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(half, { x: 0, y: 0, width: 200, height: 200 });

        expect(pickNode(root, { x: -50, y: 0 })?.id).toBe(half.id);
        expect(pickNode(root, { x: 50, y: 0 })).toBeNull();
    });
});

describe('pickNode – clipping', () => {
    it('a clipping ancestor gates its whole subtree', () => {
        // The child overflows the parent; the renderer clips it away, so the part
        // that never painted is not pickable either.
        const parent = new Rect({ clip: true });
        const child = new Tile({ x: 300 });
        parent.addChild(child);
        const root = new RootNode({});
        root.addChild(parent);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(parent, { x: 0, y: 0, width: 100, height: 100 });
        place(child, { x: 0, y: 0, width: 100, height: 100 });

        expect(pickNode(root, { x: 300, y: 0 })).toBeNull();
        // Unclipped, the same point finds the child.
        parent.set({ clip: false });
        expect(pickNode(root, { x: 300, y: 0 })?.id).toBe(child.id);
    });

    it('a camera confines its world to the viewport', () => {
        // Camera always pushes beginCamera, so it always clips — even at rest.
        const camera = new Camera({});
        const inside = new Tile({});
        const outside = new Tile({ x: 300 });
        camera.addChild(inside);
        camera.addChild(outside);
        const root = new RootNode({});
        root.addChild(camera);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(camera, { x: 0, y: 0, width: 100, height: 100 });
        place(inside, { x: 0, y: 0, width: 50, height: 50 });
        place(outside, { x: 0, y: 0, width: 50, height: 50 });

        // The overflowing child never painted, so it is not pickable either…
        expect(pickNode(root, { x: 300, y: 0 })).toBeNull();
        // …while its sibling inside the viewport still is.
        expect(pickNode(root, { x: 0, y: 0 })?.id).toBe(inside.id);
    });
});

describe('pickNode – tolerance', () => {
    it('widens the grab region outward', () => {
        const thin = new Tile({});
        const root = new RootNode({});
        root.addChild(thin);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(thin, { x: 0, y: 0, width: 200, height: 2 });

        expect(pickNode(root, { x: 0, y: 5 })).toBeNull();
        expect(pickNode(root, { x: 0, y: 5 }, 6)?.id).toBe(thin.id);
    });
});

describe('collectBoxes', () => {
    it('walks in draw order, skipping the root and invisible nodes', () => {
        const a = new Tile({});
        const ghost = new Tile({ opacity: 0 });
        const nested = new Tile({});
        a.addChild(nested);
        const root = new RootNode({});
        root.addChild(a);
        root.addChild(ghost);
        place(root, { x: 0, y: 0, width: 800, height: 600 });
        place(a, { x: 0, y: 0, width: 100, height: 100 });
        place(ghost, { x: 0, y: 0, width: 100, height: 100 });
        place(nested, { x: 0, y: 0, width: 50, height: 50 });

        const out: NodeBox[] = [];
        collectBoxes(root, '', out, true);
        // Parent before child; the opacity-0 subtree is absent entirely.
        expect(out.map(b => b.path)).toEqual(['0', '0.0']);
    });
});
