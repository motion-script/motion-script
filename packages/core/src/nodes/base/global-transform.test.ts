import { describe, it, expect } from 'vitest';
import { Node } from '@/nodes/base/node';
import { FakeMeasureScope } from '@/runtime/runtime.fixtures';
import { BoxBounds } from '@/attributes/layout/bounds';

const scope = new FakeMeasureScope();

/** A leaf whose layout cell can be set directly, mirroring what a parent would assign. */
class Tile extends Node {
    constructor(props?: any) {
        super(props ?? {});
    }
    place(rect: BoxBounds): void {
        this.layout(rect, scope);
    }
}

/** Approximate equality for floating-point world coordinates. */
function closeTo(actual: number, expected: number, eps = 1e-9): void {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(eps);
}

describe('Node.global', () => {
    it('equals local position for a root node at the layout origin', () => {
        const n = new Tile({ x: 30, y: 40 });
        n.place({ x: 0, y: 0, width: 100, height: 60 });

        expect(n.global.x).toBe(30);
        expect(n.global.y).toBe(40);
        // World center matches the local center getter when there is no parent.
        expect(n.global.center).toEqual(n.center);
    });

    it('folds the parent layout-cell offset into world position', () => {
        // Parent sits at world origin; child is laid into a cell offset within it.
        const parent = new Tile({});
        const child = new Tile({ x: 5, y: 0 });
        parent.addChild(child);

        parent.place({ x: 0, y: 0, width: 400, height: 400 });
        // Child cell centered at (100, 0) in the parent's local (y-down) space.
        child.place({ x: 100, y: 0, width: 50, height: 50 });

        // Local x/y are relative to the parent cell; global folds in the cell.
        expect(child.x).toBe(5);
        // World x = cell.x (100) + child.x (5) = 105.
        closeTo(child.global.x, 105);
        closeTo(child.global.y, 0);
    });

    it('reports the same world position for a node regardless of which subtree reads it', () => {
        // Two nodes under different parents. `global` resolves each to absolute
        // world coords, so a node placed deep in one subtree can be compared to
        // one in another — the whole point of `global`.
        const a = new Tile({ x: -50, y: 30 });
        const b = new Tile({ x: 10, y: 0 });
        const parentA = new Tile({ x: 200, y: 0 });
        const parentB = new Tile({ x: -100, y: 0 });
        parentA.addChild(a);
        parentB.addChild(b);

        parentA.place({ x: 0, y: 0, width: 400, height: 400 });
        parentB.place({ x: 0, y: 0, width: 400, height: 400 });
        a.place({ x: 0, y: 0, width: 40, height: 40 });
        b.place({ x: 0, y: 0, width: 40, height: 40 });

        // a: parent.x 200 + a.x -50 = 150 ; b: parent.x -100 + b.x 10 = -90.
        closeTo(a.global.x, 150);
        closeTo(a.global.y, 30);
        closeTo(b.global.x, -90);
    });

    it('aligns a sibling exactly onto another node when binding its center', () => {
        // The canonical use: `center: () => other.global.center` lands this node's
        // origin on the other's world position regardless of the parent offset.
        const a = new Tile({ x: -50, y: 30 });
        const b = new Tile({});
        const parentA = new Tile({ x: 200, y: 0 });
        const parentB = new Tile({ x: -100, y: 0 });
        parentA.addChild(a);
        parentB.addChild(b);

        parentA.place({ x: 0, y: 0, width: 400, height: 400 });
        parentB.place({ x: 0, y: 0, width: 400, height: 400 });
        a.place({ x: 0, y: 0, width: 40, height: 40 });

        // b must offset by its own parent's contribution to land on a's world pos.
        // Bind b's x/y so that b.global == a.global. b's only ancestor offset is
        // parentB.x (-100), so b.x = a.global.x - (-100).
        b.set({
            x: () => a.global.x - (b.parent?.global.x ?? 0),
            y: () => a.global.y - (b.parent?.global.y ?? 0),
        });
        b.place({ x: 0, y: 0, width: 40, height: 40 });

        closeTo(b.global.x, a.global.x);
        closeTo(b.global.y, a.global.y);
    });

    it('rotates a child corner around the parent when the parent is rotated', () => {
        const parent = new Tile({ rotation: 90 });
        const child = new Tile({});
        parent.addChild(child);

        parent.place({ x: 0, y: 0, width: 200, height: 200 });
        // Child centered in parent, 100×100, so its right edge is at local +50.
        child.place({ x: 0, y: 0, width: 100, height: 100 });

        // The child's local rightCenter is at world (+50, 0). A 90° clockwise
        // parent rotation (canvas) maps +x → -y (downward in y-up world).
        const rc = child.global.rightCenter;
        closeTo(rc.x, 0);
        closeTo(rc.y, -50);
    });

    it('accumulates rotation and scale up the chain', () => {
        const parent = new Tile({ rotation: 30, scale: 2 });
        const child = new Tile({ rotation: 15, scale: 3 });
        parent.addChild(child);
        parent.place({ x: 0, y: 0, width: 100, height: 100 });
        child.place({ x: 0, y: 0, width: 10, height: 10 });

        expect(child.global.rotation).toBe(45);
        expect(child.global.scale).toBe(6);
    });

    it('multiplies opacity down the chain', () => {
        const parent = new Tile({ opacity: 0.5 });
        const child = new Tile({ opacity: 0.4 });
        parent.addChild(child);
        parent.place({ x: 0, y: 0, width: 100, height: 100 });
        child.place({ x: 0, y: 0, width: 10, height: 10 });

        // Effective alpha is the product, matching the renderer's pass-through fold.
        closeTo(child.global.opacity, 0.2);
        // A node with no faded ancestor renders at full opacity.
        expect(parent.global.opacity).toBe(0.5);
    });

    it('reacts to ancestor movement', () => {
        const parent = new Tile({ x: 0, y: 0 });
        const child = new Tile({ x: 10, y: 0 });
        parent.addChild(child);
        parent.place({ x: 0, y: 0, width: 100, height: 100 });
        child.place({ x: 0, y: 0, width: 10, height: 10 });

        closeTo(child.global.x, 10);
        parent.x = 100;
        closeTo(child.global.x, 110);
    });
});
