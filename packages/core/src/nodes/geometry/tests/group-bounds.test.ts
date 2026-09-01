import { describe, it, expect } from 'vitest';
import { Node2D } from '@/nodes/2d/node2d';
import { Rect } from '@/nodes/geometry/rect-node';
import { BooleanGroup } from '@/nodes/geometry/boolean-node';
import { MaskGroup } from '@/nodes/geometry/mask-node';
import { Canvas2D } from '@/nodes/scene/canvas2d-node';
import { BoxBounds } from '@/attributes/layout/bounds';
import { FakeMeasurer } from '@/runtime/runtime.fixtures';
import { nodeBox, pickNode } from '@/runtime/node-picking';

/**
 * A `BooleanGroup` and a `MaskGroup` draw nothing of their own: a boolean's
 * pixels are its children's outlines combined, and a mask's are its content seen
 * through its first child. Both used to report their **layout cell** as their
 * bounds, which meant a host drawing a selection box around one drew a rectangle
 * with no relationship to the drawing — and, since neither declares an outline,
 * a grab region in the same wrong place.
 *
 * These pin the replacement (`nodes/geometry/group-bounds.ts`): the box comes
 * from the children, and which children count is the boolean operation's answer.
 *
 * Asserted through `nodeBox`/`pickNode` rather than by calling the protected
 * seam, so they pin what a host actually observes.
 */

const scope = new FakeMeasurer();

function place(node: Node2D, rect: BoxBounds): void {
    node.layout(rect, scope);
}

/**
 * Lay `group` out alone in a big root, with each child placed at its own cell.
 *
 * The cells are stated rather than derived because the stack layout these
 * classes use centres its children: a child's `x`/`y` is an offset from the
 * group's centre, and the rect handed to `layout` is that offset already
 * resolved (canvas y-down, relative to the parent).
 */
function laidOut(group: Node2D, cells: BoxBounds[]): Canvas2D {
    const root = new Canvas2D({});
    root.add(group);
    place(root, { x: 0, y: 0, width: 800, height: 600 });
    place(group, { x: 0, y: 0, width: 100, height: 100 });
    group.children.forEach((child, i) => place(child, cells[i]));
    return root;
}

/** Two 100 × 100 squares overlapping by half, side by side. */
function twoSquares(): { a: Rect; b: Rect; cells: BoxBounds[] } {
    return {
        a: new Rect({ width: 100, height: 100 }),
        b: new Rect({ width: 100, height: 100 }),
        cells: [
            { x: -25, y: 0, width: 100, height: 100 },
            { x: 25, y: 0, width: 100, height: 100 },
        ],
    };
}

describe('a BooleanGroup measures its children, not its cell', () => {
    it('spans every child for a union', () => {
        const { a, b, cells } = twoSquares();
        const group = new BooleanGroup({ op: 'union', children: [a, b] });
        laidOut(group, cells);

        const box = nodeBox(group, '');
        // −75 to +75 across, and the two squares' own height.
        expect(box.width).toBeCloseTo(150);
        expect(box.height).toBeCloseTo(100);
    });

    it('keeps only the first child for a subtract', () => {
        // Subtracting can cut into the base shape and never extends it, so the
        // shape being subtracted contributes nothing to the box — even where it
        // sticks well outside.
        const { a, b, cells } = twoSquares();
        const group = new BooleanGroup({ op: 'subtract', children: [a, b] });
        laidOut(group, cells);

        const box = nodeBox(group, '');
        expect(box.width).toBeCloseTo(100);
        expect(box.center.x).toBeCloseTo(-25);
    });

    it('keeps only the overlap for an intersect', () => {
        const { a, b, cells } = twoSquares();
        const group = new BooleanGroup({ op: 'intersect', children: [a, b] });
        laidOut(group, cells);

        const box = nodeBox(group, '');
        // The squares overlap over 50 units, centred between them.
        expect(box.width).toBeCloseTo(50);
        expect(box.center.x).toBeCloseTo(0);
    });

    it('falls back to the cell when an intersect is empty', () => {
        // Nothing is drawn anywhere, so there is no box to draw. The cell at
        // least stays put and stays grabbable — which is what a node you have
        // to drag another child into has to be.
        const a = new Rect({ width: 100, height: 100 });
        const b = new Rect({ width: 100, height: 100 });
        const group = new BooleanGroup({ op: 'intersect', children: [a, b] });
        laidOut(group, [
            { x: -200, y: 0, width: 100, height: 100 },
            { x: 200, y: 0, width: 100, height: 100 },
        ]);

        const box = nodeBox(group, '');
        expect(box.width).toBeCloseTo(100);
        expect(box.height).toBeCloseTo(100);
    });

    it('is grabbed where its children are, not where its cell is', () => {
        // The other half of the same override: `hitTestSelf` falls back to these
        // bounds, because a boolean group declares no outline of its own.
        const { a, b, cells } = twoSquares();
        const group = new BooleanGroup({ op: 'union', children: [a, b] });
        const root = laidOut(group, cells);

        // 70 units right of centre: inside the union, outside the 100 × 100 cell
        // the group would otherwise have been hit on.
        expect(pickNode(root, { x: 70, y: 0 })).not.toBeNull();
    });
});

describe('a MaskGroup measures its stencil', () => {
    it('takes the first child, whatever the content does', () => {
        const stencil = new Rect({ width: 100, height: 100 });
        const content = new Rect({ width: 400, height: 400 });
        const group = new MaskGroup({ mode: 'alpha', inverted: false, children: [stencil, content] });
        laidOut(group, [
            { x: 0, y: 0, width: 100, height: 100 },
            { x: 0, y: 0, width: 400, height: 400 },
        ]);

        const box = nodeBox(group, '');
        // The content is four times the size and entirely cut off outside the
        // stencil, so it contributes nothing.
        expect(box.width).toBeCloseTo(100);
        expect(box.height).toBeCloseTo(100);
    });

    it('follows the stencil when it sits off the group centre', () => {
        const stencil = new Rect({ width: 60, height: 60 });
        const content = new Rect({ width: 400, height: 400 });
        const group = new MaskGroup({ mode: 'alpha', inverted: false, children: [stencil, content] });
        laidOut(group, [
            { x: 120, y: 0, width: 60, height: 60 },
            { x: 0, y: 0, width: 400, height: 400 },
        ]);

        const box = nodeBox(group, '');
        expect(box.width).toBeCloseTo(60);
        expect(box.center.x).toBeCloseTo(120);
    });

    it('keeps its cell with no children at all', () => {
        const group = new MaskGroup({ mode: 'alpha', inverted: false });
        laidOut(group, []);

        const box = nodeBox(group, '');
        expect(box.width).toBeCloseTo(100);
    });
});
