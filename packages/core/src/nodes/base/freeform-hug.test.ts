import { describe, it, expect } from 'vitest';
import { Node2D } from '@/nodes/base/node2d';
import { Ellipse } from '@/nodes/geometry/ellipse-node';
import { FakeMeasurer } from '@/runtime/runtime.fixtures';
import { BoxBounds } from '@/attributes/layout/bounds';
import { SizeInput } from '@/attributes/layout/size';

/**
 * A fixed-size leaf that also exposes the box its parent laid it into — the
 * `layoutRect` is protected on Node2D, so a test subclass is the supported seam
 * for reading a child's resolved position. Mirrors the one in rect-node.test.ts.
 */
class Tile extends Node2D {
    constructor(width: SizeInput, height: SizeInput) {
        super({ width, height });
    }
    get rect(): BoxBounds {
        return this.layoutRect;
    }
}

/** Read a node's own laid-out box (protected `layoutRect` seam). */
class ProbeNode extends Node2D {
    get rect(): BoxBounds {
        return this.layoutRect;
    }
}

describe('Node2D – base freeform hug measure', () => {
    const scope = new FakeMeasurer();

    it('a plain Node2D with children hugs to its largest child (basic freeform), not 0', () => {
        // Regression: the base measure resolved "hug" against a content size of
        // 0, so any non-Rect container (plain Node2D, Ellipse, Camera, …)
        // collapsed to 0×0 and rendered nothing. It now hugs like a freeform Rect.
        const node = new Node2D({ children: [new Tile(400, 300)] });
        // Base "populated → hug" default.
        expect((node as any).width).toBe('hug');
        expect((node as any).height).toBe('hug');

        const size = node.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(400);
        expect(size.height).toBe(300);
    });

    it('hug takes the max child extent per axis (children overlap, do not sum)', () => {
        const node = new Node2D({ children: [new Tile(400, 200), new Tile(250, 500)] });
        const size = node.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(400); // max, not 400+250
        expect(size.height).toBe(500); // max, not 200+500
    });

    it('padding expands the hugged size and is reserved around the content', () => {
        const node = new Node2D({ padding: 40, children: [new Tile(400, 300)] });
        const size = node.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(480); // 400 + 40*2
        expect(size.height).toBe(380); // 300 + 40*2
    });

    it('an empty Node2D fills its parent (childless default), measured as before', () => {
        const node = new Node2D({});
        expect((node as any).width).toBe('fill');
        expect((node as any).height).toBe('fill');
        const size = node.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(1920);
        expect(size.height).toBe(1080);
    });

    it('explicit width/height still win over the hug default', () => {
        const node = new Node2D({ width: 800, height: 600, children: [new Tile(400, 400)] });
        const size = node.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(800);
        expect(size.height).toBe(600);
    });

    it('a mixed axis: hug width + fixed height resolves each independently', () => {
        const node = new Node2D({ height: 720, children: [new Tile(500, 300)] });
        const size = node.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(500); // hugged to child
        expect(size.height).toBe(720); // fixed
    });

    it('layout centers each child in the padded content area (freeform convention)', () => {
        const child = new Tile(400, 300);
        const node = new ProbeNode({ padding: 40, children: [child] });
        const size = node.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        node.layout({ x: 0, y: 0, width: size.width ?? 0, height: size.height ?? 0 }, scope);
        // Symmetric padding → centred at the container origin, size preserved.
        expect(child.rect).toMatchObject({ x: 0, y: 0, width: 400, height: 300 });
    });

    it('asymmetric padding shifts the content centre by the left/right delta', () => {
        const child = new Tile(200, 200);
        const node = new ProbeNode({
            padding: { left: 100, right: 20, top: 0, bottom: 0 },
            children: [child],
        });
        const size = node.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        node.layout({ x: 0, y: 0, width: size.width ?? 0, height: size.height ?? 0 }, scope);
        // offsetX = (left - right) / 2 = (100 - 20) / 2 = 40, matching Rect's freeform layout.
        expect(child.rect.x).toBe(40);
        expect(child.rect.y).toBe(0);
    });

    it('an Ellipse hugs its children the same way (the reported case)', () => {
        // The scene that surfaced this: an Ellipse (or any ShapeNode leaf) set to
        // hug should shrink-wrap its child instead of rendering nothing.
        const ellipse = new Ellipse({ children: [new Tile(600, 450)] });
        expect((ellipse as any).width).toBe('hug');
        expect((ellipse as any).height).toBe('hug');
        const size = ellipse.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(600);
        expect(size.height).toBe(450);
    });
});
