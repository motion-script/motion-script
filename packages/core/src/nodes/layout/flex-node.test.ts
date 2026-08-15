import { describe, it, expect } from 'vitest';
import { Row } from '@/nodes/layout/row-node';
import { Column } from '@/nodes/layout/column-node';
import { Node } from '@/nodes/base/node';
import { FakeMeasurer } from '@/runtime/runtime.fixtures';
import { BoxBounds } from '@/attributes/layout/bounds';
import { SizeInput } from '@/attributes/layout/size';

const scope = new FakeMeasurer();

/**
 * A fixed-size leaf that also exposes the box its parent laid it into — the
 * `layoutRect` is protected on Node, so a test subclass is the supported seam
 * for reading a child's resolved position.
 */
class Tile extends Node {
    constructor(width: SizeInput, height: SizeInput) {
        super({ width, height });
    }
    get rect(): BoxBounds {
        return this.layoutRect;
    }
}

describe('Row', () => {
    it('hugs its children along both axes by default', () => {
        const row = new Row({ gap: 10 });
        row.addChildren([new Tile(100, 50), new Tile(100, 80), new Tile(100, 50)]);

        const size = row.measure({ maxWidth: 1000, maxHeight: 1000 }, scope);
        // 3 × 100 + 2 × 10 gap = 320 wide; tallest child = 80.
        expect(size.width).toBe(320);
        expect(size.height).toBe(80);
    });

    it('places children left-to-right with the gap between them', () => {
        const a = new Tile(100, 50);
        const b = new Tile(100, 50);
        const row = new Row({ gap: 10 });
        row.addChildren([a, b]);
        row.measure({ maxWidth: 1000, maxHeight: 1000 }, scope);
        row.layout({ x: 0, y: 0, width: 210, height: 50 }, scope);

        // Centered coordinates: total main = 210, first centre at -105 + 50 = -55.
        expect(a.rect.x).toBe(-55);
        expect(b.rect.x).toBe(55);
        // Cross axis centered.
        expect(a.rect.y).toBe(0);
    });
});

describe('Column', () => {
    it('hugs its children: width = widest child, height = sum + gaps', () => {
        const col = new Column({ gap: 20 });
        col.addChildren([new Tile(60, 100), new Tile(90, 100), new Tile(60, 100)]);

        const size = col.measure({ maxWidth: 1000, maxHeight: 1000 }, scope);
        expect(size.width).toBe(90);
        // 3 × 100 + 2 × 20 = 340.
        expect(size.height).toBe(340);
    });

    it('stacks children top-to-bottom (y descending in y-up space)', () => {
        const a = new Tile(50, 100);
        const b = new Tile(50, 100);
        const col = new Column({ gap: 0 });
        col.addChildren([a, b]);
        col.measure({ maxWidth: 1000, maxHeight: 1000 }, scope);
        col.layout({ x: 0, y: 0, width: 50, height: 200 }, scope);

        // Children stack along the column's main axis in order. In box-local
        // (y-down) space that means the first child gets the lower y and the
        // second sits one full child-height below it — same convention as
        // Rect with flow="vertical".
        expect(b.rect.y - a.rect.y).toBe(100);
    });

    it('respects an explicit fixed size instead of hugging', () => {
        const col = new Column({ width: 400, height: 600 });
        col.addChildren([new Tile(50, 50)]);

        const size = col.measure({ maxWidth: 1000, maxHeight: 1000 }, scope);
        expect(size.width).toBe(400);
        expect(size.height).toBe(600);
    });
});

describe('Row/Column – default main-axis size when a direct child is fill', () => {
    it('Row: a bare fill-width child (main axis) flips the default from hug to fill', () => {
        const row = new Row({ children: [new Tile('fill', 50)] });
        expect((row as any).width).toBe('fill');
        // Cross axis is unaffected — still hugs.
        expect((row as any).height).toBe('hug');
    });

    it('Row: a fill-height child (cross axis) does not flip height to fill', () => {
        const row = new Row({ children: [new Tile(100, 'fill')] });
        expect((row as any).width).toBe('hug');
        expect((row as any).height).toBe('hug');
    });

    it('Column: a bare fill-height child (main axis) flips the default from hug to fill', () => {
        const col = new Column({ children: [new Tile(100, 'fill')] });
        expect((col as any).height).toBe('fill');
        expect((col as any).width).toBe('hug');
    });

    it('an explicit height on the Column always wins over the fill-child default', () => {
        const col = new Column({ height: 'hug', children: [new Tile(100, 'fill')] });
        expect((col as any).height).toBe('hug');
    });

    it('promoted Row participates as a real fill sibling in an outer hug Row', () => {
        const middle = new Tile('fill', 400);
        const innerRow = new Row({ gap: 0, children: [new Tile(400, 400), middle, new Tile(400, 400)] });
        expect((innerRow as any).width).toBe('fill');

        const fixedSibling = new Tile(300, 300);
        const outerRow = new Row({ gap: 0, children: [fixedSibling, innerRow] });

        const size = outerRow.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        outerRow.layout({ x: 0, y: 0, width: size.width ?? 0, height: size.height ?? 0 }, scope);

        expect((innerRow as any).layoutRect.width).toBe(1920 - 300);
    });
});
