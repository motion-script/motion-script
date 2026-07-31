import { describe, it, expect } from 'vitest';
import { Node } from '@/nodes/base/node';
import { Rect } from '@/nodes/geometry/rect-node';
import { Ellipse } from '@/nodes/geometry/ellipse-node';
import { Polygram } from '@/nodes/geometry/polygram-node';
import { Line } from '@/nodes/geometry/line-node';
import { Path } from '@/nodes/geometry/path-node';
import { Text } from '@/nodes/text/text-node';
import { Image } from '@/nodes/media/image-node';
import { RootNode } from '@/nodes/scene/root-node';
import { BoxBounds } from '@/attributes/layout/bounds';
import { Vector2 } from '@/attributes/layout/vector2';
import { FakeMeasureScope } from '@/runtime/runtime.fixtures';
import { nodeBox, pickNode } from '@/runtime/node-picking';

/**
 * `Node.hitTestSelf` is the seam that decides what "clicking a node" means. The
 * default is the layout box; `ShapeNode` narrows it to the outline the node
 * already declares for clipping, and `Line` — which has no outline *and* no
 * layout size — tests its polyline directly.
 *
 * Assertions go through `pickNode` rather than poking the protected method, so
 * they pin the behaviour a host actually observes.
 */

const scope = new FakeMeasureScope();

function place(node: Node, rect: BoxBounds): void {
    node.layout(rect, scope);
}

/** Compare a point tolerantly — the y-flip yields -0 for an exact zero. */
function expectPoint(actual: Vector2, x: number, y: number): void {
    expect(actual.x).toBeCloseTo(x, 9);
    expect(actual.y).toBeCloseTo(y, 9);
}

/** Put `node` alone under a scene root and hand back a point-tester. */
function stage(node: Node, size: BoxBounds): (p: Vector2, tolerance?: number) => boolean {
    const root = new RootNode({});
    root.addChild(node);
    place(root, { x: 0, y: 0, width: 800, height: 600 });
    place(node, size);
    return (p, tolerance) => pickNode(root, p, tolerance)?.id === node.id;
}

describe('hitTestSelf – nodes with no declared outline keep the box', () => {
    it('Text hits anywhere in its block box, corners included', () => {
        // Testing glyph outlines would make the trailing whitespace of a short
        // line unclickable; the block box is the selection target.
        const text = new Text({ text: 'hello', width: 200, height: 60 });
        const hits = stage(text, { x: 0, y: 0, width: 200, height: 60 });
        expect(hits({ x: 0, y: 0 })).toBe(true);
        expect(hits({ x: 99, y: 29 })).toBe(true);   // box corner
        expect(hits({ x: 101, y: 0 })).toBe(false);
    });

    it('Path falls back to its box — no Bézier winding test is carried', () => {
        const path = new Path({ width: 100, height: 100 });
        const hits = stage(path, { x: 0, y: 0, width: 100, height: 100 });
        expect(hits({ x: 49, y: 49 })).toBe(true);
        expect(hits({ x: 51, y: 0 })).toBe(false);
    });
});

describe('hitTestSelf – shapes hit their declared outline', () => {
    it('Ellipse misses at its box corner but hits at its centre', () => {
        // The proof that ShapeNode's clipSelf-derived override is actually
        // reached, rather than shadowed by the base box test.
        const ellipse = new Ellipse({ width: 200, height: 200 });
        const hits = stage(ellipse, { x: 0, y: 0, width: 200, height: 200 });
        expect(hits({ x: 0, y: 0 })).toBe(true);
        expect(hits({ x: 95, y: 0 })).toBe(true);
        expect(hits({ x: 95, y: 95 })).toBe(false);   // inside the box, outside the ellipse
    });

    it('Polygram misses in a notch a same-sized Rect would catch', () => {
        const star = new Polygram({ width: 200, height: 200, sides: 6, ratio: 0.4 });
        const hitsStar = stage(star, { x: 0, y: 0, width: 200, height: 200 });
        const box = new Rect({ width: 200, height: 200 });
        const hitsBox = stage(box, { x: 0, y: 0, width: 200, height: 200 });

        // 60° — straight through a notch — at radius 70, past the notch's own 40.
        const notch = { x: 70 * Math.cos(Math.PI / 3), y: 70 * Math.sin(Math.PI / 3) };
        expect(hitsStar(notch)).toBe(false);
        expect(hitsBox(notch)).toBe(true);
        // The spike above it is still grabbable.
        expect(hitsStar({ x: 0, y: 90 })).toBe(true);
    });

    it('Rect honours its own corner radius', () => {
        const card = new Rect({ width: 200, height: 200, cornerRadius: 60 });
        const hits = stage(card, { x: 0, y: 0, width: 200, height: 200 });
        expect(hits({ x: 0, y: 0 })).toBe(true);
        expect(hits({ x: 99, y: 99 })).toBe(false);   // rounded away
        expect(hits({ x: 99, y: 0 })).toBe(true);     // straight edge
    });

    it('Image inherits Rect\'s outline — rectangular media is its own silhouette', () => {
        const img = new Image({ src: 'x.png', width: 100, height: 100 });
        const hits = stage(img, { x: 0, y: 0, width: 100, height: 100 });
        expect(hits({ x: 49, y: 49 })).toBe(true);
        expect(hits({ x: 51, y: 0 })).toBe(false);
    });
});

describe('hitTestSelf – Line', () => {
    /**
     * `Line` declares no `clipSelf()` **and** has no `measure()` override, so its
     * `points` never reach the layout engine: the layout rect describes the line
     * in neither size nor position. Both ends of that are wrong for a box test, in
     * opposite directions — hence the two cases below.
     *
     * Each asserts the layout rect explicitly, so a future `measure()` on Line
     * can't quietly turn either into a box test that passes for the wrong reason.
     */
    it('hits near its segment when hug sizing collapses the cell to 0×0', () => {
        // Nothing to hug — Line has no children and contributes no intrinsic
        // size — so a cell-based box would degenerate to a point and catch nothing.
        const line = new Line({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
        const hits = stage(line, { x: 0, y: 0, width: 0, height: 0 });

        expect(line.measuredWidth).toBe(0);
        expect(line.measuredHeight).toBe(0);

        expect(hits({ x: 50, y: 0 })).toBe(true);
        expect(hits({ x: 50, y: 3 }, 5)).toBe(true);
        expect(hits({ x: 50, y: 20 }, 5)).toBe(false);
        expect(hits({ x: 160, y: 0 }, 5)).toBe(false);   // past the far end
    });

    it('does not swallow the whole parent under the default fill sizing', () => {
        // The opposite failure, and the one that actually bites: `width`/`height`
        // default to 'fill', so a bare Line's *cell* is its parent's entire content
        // box. On a cell-based test every click in the scene would select it.
        const line = new Line({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
        const hits = stage(line, { x: 0, y: 0, width: 800, height: 600 });

        expect(line.measuredWidth).toBe(800);
        expect(line.measuredHeight).toBe(600);

        expect(hits({ x: 50, y: 0 })).toBe(true);        // on the line
        expect(hits({ x: 50, y: 200 })).toBe(false);     // inside the cell, off the line
        expect(hits({ x: -300, y: -250 })).toBe(false);  // far corner of the cell
    });

    it('widens the grab band by the stroke weight', () => {
        const line = new Line({ points: [{ x: -50, y: 0 }, { x: 50, y: 0 }], stroke: { weight: 40 } });
        const hits = stage(line, { x: 0, y: 0, width: 0, height: 0 });
        // Half of a 40px stroke reaches 20 units either side of the centreline.
        expect(hits({ x: 0, y: 18 })).toBe(true);
        expect(hits({ x: 0, y: 25 })).toBe(false);
    });

    it('reports a gizmo box on the ink, not on the layout cell', () => {
        // Asymmetric points on purpose: they span x 0..100 and y 0..40, so the box
        // must be centred at (50, 20) — *off* the node's own centre. A `measure()`
        // returning the extent would have produced the right size in the wrong
        // place, which is why `_localBounds` exists instead.
        const line = new Line({ points: [{ x: 0, y: 0 }, { x: 100, y: 40 }] });
        const root = new RootNode({});
        root.addChild(line);
        place(root, { x: 0, y: 0, width: 400, height: 300 });
        place(line, { x: 0, y: 0, width: 400, height: 300 });   // 'fill' cell

        const box = nodeBox(line, '0');
        expect(box.width).toBe(100);
        expect(box.height).toBe(40);
        expectPoint(box.center, 50, 20);
        expectPoint(box.topLeft, 0, 40);
        expectPoint(box.bottomRight, 100, 0);
    });

    it('grows the box by the stroke so an axis-aligned line still has thickness', () => {
        // A horizontal line's geometry is zero-height; a box with no thickness has
        // nowhere to put handles. The stroke is what is actually drawn, so the box
        // includes it.
        const line = new Line({ points: [{ x: -50, y: 0 }, { x: 50, y: 0 }], stroke: { weight: 12 } });
        const root = new RootNode({});
        root.addChild(line);
        place(root, { x: 0, y: 0, width: 400, height: 300 });
        place(line, { x: 0, y: 0, width: 400, height: 300 });

        const box = nodeBox(line, '0');
        expect(box.width).toBe(112);    // 100 span + 6 either side
        expect(box.height).toBe(12);
        expectPoint(box.center, 0, 0);
    });

    it('tracks the box when the points are tweened', () => {
        // The box is derived per read, not cached, so it follows an animated line.
        const line = new Line({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
        const root = new RootNode({});
        root.addChild(line);
        place(root, { x: 0, y: 0, width: 400, height: 300 });
        place(line, { x: 0, y: 0, width: 400, height: 300 });
        expect(nodeBox(line, '0').width).toBe(100);

        line.set({ points: [{ x: 0, y: 0 }, { x: 240, y: 0 }] });
        expect(nodeBox(line, '0').width).toBe(240);
        expectPoint(nodeBox(line, '0').center, 120, 0);
    });

    it('falls back to the layout cell when there is nothing to draw', () => {
        const line = new Line({ points: [] });
        const root = new RootNode({});
        root.addChild(line);
        place(root, { x: 0, y: 0, width: 400, height: 300 });
        place(line, { x: 0, y: 0, width: 400, height: 300 });

        const box = nodeBox(line, '0');
        expect(box.width).toBe(400);
        expect(box.height).toBe(300);
    });

    it('a closed line is grabbable across its enclosed area', () => {
        const tri = new Line({
            points: [{ x: 0, y: 60 }, { x: 60, y: -40 }, { x: -60, y: -40 }],
            closed: true,
        });
        const hits = stage(tri, { x: 0, y: 0, width: 0, height: 0 });
        expect(hits({ x: 0, y: 0 })).toBe(true);        // interior
        expect(hits({ x: 0, y: 100 })).toBe(false);     // outside
    });
});
