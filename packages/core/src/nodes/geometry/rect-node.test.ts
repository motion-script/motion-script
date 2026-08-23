import { describe, it, expect } from 'vitest';
import { Rect } from '@/nodes/geometry/rect-node';
import { Node2D } from '@/nodes/base/node2d';
import { FakeMeasurer } from '@/runtime/runtime.fixtures';
import { BoxBounds } from '@/attributes/layout/bounds';
import { SizeInput } from '@/attributes/layout/size';


/**
 * A fixed-size leaf that also exposes the box its parent laid it into — the
 * `layoutRect` is protected on Node2D, so a test subclass is the supported seam
 * for reading a child's resolved position. Mirrors the one in flex-node.test.ts.
 */
class Tile extends Node2D {
    constructor(width: SizeInput, height: SizeInput) {
        super({ width, height });
    }
    get rect(): BoxBounds {
        return this.layoutRect;
    }
}

describe('Rect – default width/height when a direct child is fill on the main axis', () => {
    const scope = new FakeMeasurer();

    it('flow="horizontal": a bare fill-width child flips the default from hug to fill', () => {
        // Reproduces the default-size.tsx scene: without this, the row stayed
        // "hug" while its own fill child measured unconstrained — and since
        // the row's `width` prop never reflected the true resolved mode,
        // nesting this row as a child of another hug row broke (the outer
        // row saw "hug" and absorbed the inner row's full size as fixed
        // content instead of sharing space with it).
        const left = new Tile(400, 400);
        const middle = new Tile('fill', 400);
        const right = new Tile(400, 400);
        const row = new Rect({ flow: 'horizontal', padding: 48, gap: 48, children: [left, middle, right] });
        expect((row as any).width).toBe('fill');

        const size = row.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(1920);

        row.layout({ x: 0, y: 0, width: size.width ?? 0, height: size.height ?? 0 }, scope);
        // inner width = 1920 - 48*2 padding = 1824; minus 400+400 fixed tiles
        // minus 48*2 gaps = 928 left for the middle tile.
        expect(middle.rect.width).toBe(928);
    });

    it('flow="horizontal": a fill child on the cross axis (height) does not flip height to fill', () => {
        const row = new Rect({ flow: 'horizontal', children: [new Tile(400, 'fill')] });
        expect((row as any).width).toBe('hug');
        expect((row as any).height).toBe('hug');
    });

    it('flow="vertical": a bare fill-height child flips the default from hug to fill', () => {
        const col = new Rect({ flow: 'vertical', children: [new Tile(400, 'fill')] });
        expect((col as any).height).toBe('fill');
        expect((col as any).width).toBe('hug');
    });

    it('flow="freeform": a fill child on either axis flips that axis to fill (no main/cross split)', () => {
        const stackW = new Rect({ flow: 'freeform', children: [new Tile('fill', 400)] });
        expect((stackW as any).width).toBe('fill');
        expect((stackW as any).height).toBe('hug');

        const stackH = new Rect({ flow: 'freeform', children: [new Tile(400, 'fill')] });
        expect((stackH as any).height).toBe('fill');
        expect((stackH as any).width).toBe('hug');
    });

    it('an explicit width on the Rect always wins over the fill-child default', () => {
        const row = new Rect({ flow: 'horizontal', width: 'hug', children: [new Tile('fill', 400)] });
        expect((row as any).width).toBe('hug');
    });

    it('explicit width="hug" + a bare fill-main child: the child collapses to 0, row hugs the rest (not Infinity)', () => {
        // An explicit override intentionally re-creates the Figma-disallowed
        // combination (hug main axis + fill-main child). The fill child has
        // no real content to hug to, so it collapses to 0 — the row still
        // hugs to a finite size from its fixed siblings + padding + gaps,
        // rather than blowing up to Infinity and rendering nothing.
        const left = new Tile(400, 400);
        const middle = new Tile('fill', 400);
        const right = new Tile(400, 400);
        const row = new Rect({ flow: 'horizontal', width: 'hug', height: 400, padding: 48, gap: 48, children: [left, middle, right] });
        expect((row as any).width).toBe('hug');

        const scope2 = new FakeMeasurer();
        const size = row.measure({ maxWidth: 1920, maxHeight: 1080 }, scope2);
        // 400 (left) + 0 (collapsed middle) + 400 (right) = 800, + 2 gaps × 48 = 96,
        // + 2 × 48 padding = 96 → 992.
        expect(size.width).toBe(992);
        expect(Number.isFinite(size.width)).toBe(true);

        row.layout({ x: 0, y: 0, width: size.width ?? 0, height: size.height ?? 0 }, scope2);
        expect(middle.rect.width).toBe(0);
    });

    it('nested: a promoted row correctly shares space as a fill sibling in an outer hug row', () => {
        // The regression this whole feature targets: because the inner row's
        // `width` prop now truthfully reports "fill", the outer row treats it
        // as a real fill participant instead of measuring it once and
        // absorbing whatever it returns as fixed content.
        const left = new Tile(400, 400);
        const middle = new Tile('fill', 400);
        const right = new Tile(400, 400);
        const innerRow = new Rect({ flow: 'horizontal', padding: 0, gap: 0, children: [left, middle, right] });
        expect((innerRow as any).width).toBe('fill');

        const fixedSibling = new Tile(300, 300);
        const outerRow = new Rect({ flow: 'horizontal', gap: 0, children: [fixedSibling, innerRow] });
        expect((outerRow as any).width).toBe('fill');

        const size = outerRow.measure({ maxWidth: 1920, maxHeight: 1080 }, scope);
        expect(size.width).toBe(1920);

        outerRow.layout({ x: 0, y: 0, width: size.width ?? 0, height: size.height ?? 0 }, scope);
        // innerRow shares the outer row's space with fixedSibling: 1920 - 300 = 1620.
        expect((innerRow as any).layoutRect.width).toBe(1620);
    });
});
