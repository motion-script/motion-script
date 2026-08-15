import { describe, it, expect } from 'vitest';
import { Camera } from '@/nodes/layout/camera-node';
import { Node } from '@/nodes/base/node';
import { FakeMeasurer } from '@/runtime/runtime.fixtures';
import { BoxBounds } from '@/attributes/layout/bounds';
import { SizeInput } from '@/attributes/layout/size';

/**
 * A fixed-size leaf that also exposes the box its parent laid it into — the
 * `layoutRect` is protected on Node, so a test subclass is the supported seam
 * for reading a child's resolved position. Mirrors the one in rect-node.test.ts.
 */
class Tile extends Node {
    constructor(width: SizeInput, height: SizeInput) {
        super({ width, height });
    }
    get rect(): BoxBounds {
        return this.layoutRect;
    }
}

describe('Camera – stack-style hug measure', () => {
    const scope = new FakeMeasurer();

    it('a populated Camera hugs to its largest child (basic stack), not to 0', () => {
        // Regression: a hugging Camera used to collapse to 0×0 and render
        // nothing. The base Node.measure now hugs children stack-style (see
        // stack-hug.test.ts), which the Camera inherits, so a bare <Camera>
        // sizes itself to its world like a stack Rect.
        const camera = new Camera({ children: [new Tile(400, 300)] });
        // Base "populated → hug" default is back (no forced "fill").
        expect((camera as any).width).toBe('hug');
        expect((camera as any).height).toBe('hug');

        const size = camera.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(400);
        expect(size.height).toBe(300);
    });

    it('hug takes the max child extent per axis (children overlap, do not sum)', () => {
        const camera = new Camera({
            children: [new Tile(400, 200), new Tile(250, 500)],
        });
        const size = camera.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(400); // max width, not 400+250
        expect(size.height).toBe(500); // max height, not 200+500
    });

    it('padding expands the hug size on both axes', () => {
        const camera = new Camera({ padding: 40, children: [new Tile(400, 300)] });
        const size = camera.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(480); // 400 + 40*2
        expect(size.height).toBe(380); // 300 + 40*2
    });

    it('an empty Camera fills its parent (base default for a childless node)', () => {
        const camera = new Camera({});
        expect((camera as any).width).toBe('fill');
        expect((camera as any).height).toBe('fill');

        const size = camera.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(1920);
        expect(size.height).toBe(1080);
    });

    it('an explicit width/height still wins over the hug default', () => {
        const camera = new Camera({ width: 800, height: 600, children: [new Tile(400, 400)] });
        expect((camera as any).width).toBe(800);
        expect((camera as any).height).toBe(600);

        const size = camera.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(800);
        expect(size.height).toBe(600);
    });

    it('a mixed axis: hug width + fixed height resolves each independently', () => {
        const camera = new Camera({ height: 720, children: [new Tile(500, 300)] });
        expect((camera as any).width).toBe('hug');
        expect((camera as any).height).toBe(720);

        const size = camera.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(500); // hugged to child
        expect(size.height).toBe(720); // fixed
    });

    it('layout centers the world inside the hugged box (stack convention)', () => {
        const child = new Tile(400, 300);
        const camera = new Camera({ children: [child] });
        const size = camera.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        camera.layout({ x: 0, y: 0, width: size.width ?? 0, height: size.height ?? 0 }, scope);
        // Stack-laid-out: centered at the container origin.
        expect(child.rect).toMatchObject({ x: 0, y: 0, width: 400, height: 300 });
    });
});
