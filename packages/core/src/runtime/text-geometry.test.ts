import { describe, it, expect } from 'vitest';
import { Rect } from '@/nodes/geometry/rect-node';
import { Text } from '@/nodes/text/text-node';
import { BoxBounds } from '@/attributes/layout/bounds';
import { Vector2 } from '@/attributes/layout/vector2';
import { Measurer } from '@/render/measurer';
import { TextBlockLayout } from '@/render/text-layout';
import { FakeMeasurer } from '@/runtime/runtime.fixtures';
import { caretOffsetAt, caretRangeQuads, nodeTextLayout } from '@/runtime/text-geometry';

/**
 * The mapping from a backend's block-local caret slots into viewport space.
 *
 * The slots themselves come from the shaper and can't be exercised here, so the
 * fake below hands over a deliberately simple, exactly-predictable block — one
 * caret every 10px — and the assertions are about what the *transform* does to
 * it. That is the half that can silently disagree with `nodeBox`, and the half
 * a host draws its cursor from.
 */

/**
 * A scope whose text block is 4 characters at 10px each on one 20px-tall line,
 * centred on the origin: carets at x = -20, -10, 0, 10, 20 and the line box
 * spanning y = -10..10 (block-local, y-down).
 */
class BlockScope extends FakeMeasurer {
    constructor(private readonly block: TextBlockLayout | null = FOUR_CHARS) {
        super();
    }
    override layoutTextBlock(): TextBlockLayout | null {
        return this.block;
    }
}

const FOUR_CHARS: TextBlockLayout = {
    lines: [{ start: 0, end: 4, top: -10, bottom: 10, carets: [-20, -10, 0, 10, 20] }],
    width: 40,
    height: 20,
};

/** Two lines of two characters, stacked 20px apart — "ab\ncd". */
const TWO_LINES: TextBlockLayout = {
    lines: [
        { start: 0, end: 2, top: -20, bottom: 0, carets: [-10, 0, 10] },
        { start: 3, end: 5, top: 0, bottom: 20, carets: [-10, 0, 10] },
    ],
    width: 20,
    height: 40,
};

const scope = new BlockScope();

function place(node: { layout: (r: BoxBounds, s: Measurer) => void }, rect: BoxBounds): void {
    node.layout(rect, scope);
}

function closeToPoint(actual: Vector2, x: number, y: number, eps = 1e-9): void {
    expect(Math.abs(actual.x - x)).toBeLessThanOrEqual(eps);
    expect(Math.abs(actual.y - y)).toBeLessThanOrEqual(eps);
}

describe('nodeTextLayout', () => {
    it('reports one caret slot per character plus one after the last', () => {
        const text = new Text({ text: 'abcd' });
        place(text, { x: 0, y: 0, width: 40, height: 20 });

        const layout = nodeTextLayout(text, '0', scope)!;
        expect(layout.path).toBe('0');
        expect(layout.text).toBe('abcd');
        // Four characters, five places to put a cursor.
        expect(layout.carets).toHaveLength(5);
        expect(layout.carets.map(c => c.offset)).toEqual([0, 1, 2, 3, 4]);
    });

    it('lands the slots in viewport space, y-up, around the node', () => {
        const text = new Text({ text: 'abcd', x: 100, y: 50 });
        place(text, { x: 0, y: 0, width: 40, height: 20 });

        const layout = nodeTextLayout(text, '0', scope)!;
        // Block-local x carries straight across; block-local y is *down* while
        // viewport y is up, so the line's top edge is the greater y.
        closeToPoint(layout.carets[0].top, 80, 60);
        closeToPoint(layout.carets[0].bottom, 80, 40);
        closeToPoint(layout.carets[4].top, 120, 60);
        closeToPoint(layout.carets[4].bottom, 120, 40);
    });

    it('carries an ancestor rotation into the caret, so the cursor tilts with the text', () => {
        // 90° clockwise: the caret that pointed up now points left.
        const parent = new Rect({ rotation: 90 });
        const text = new Text({ text: 'abcd' });
        parent.add(text);
        place(parent, { x: 0, y: 0, width: 200, height: 200 });
        place(text, { x: 0, y: 0, width: 40, height: 20 });

        const layout = nodeTextLayout(text, '0.0', scope)!;
        // Caret 0 sat at the block's left edge, spanning vertically. Turned 90°
        // clockwise the text reads downward, so its first caret is at the *top*
        // and now spans horizontally — with the glyphs' own "up" pointing +x.
        closeToPoint(layout.carets[0].top, 10, 20);
        closeToPoint(layout.carets[0].bottom, -10, 20);
    });

    it('scales with the node, so a magnified block gets a magnified cursor', () => {
        const text = new Text({ text: 'abcd', scale: 2 });
        place(text, { x: 0, y: 0, width: 40, height: 20 });

        const layout = nodeTextLayout(text, '0', scope)!;
        closeToPoint(layout.carets[0].top, -40, 20);
        closeToPoint(layout.carets[4].bottom, 40, -20);
    });

    it('is null for a node that is not text', () => {
        const rect = new Rect({});
        place(rect, { x: 0, y: 0, width: 10, height: 10 });
        expect(nodeTextLayout(rect, '0', scope)).toBeNull();
    });

    it('is null when the backend has no caret model for the shape', () => {
        // What a text-on-path or segmented block reports.
        const text = new Text({ text: 'abcd' });
        const blind = new BlockScope(null);
        place(text, { x: 0, y: 0, width: 40, height: 20 });
        expect(nodeTextLayout(text, '0', blind)).toBeNull();
    });
});

describe('caretOffsetAt', () => {
    const layout = () => {
        const text = new Text({ text: 'abcd' });
        place(text, { x: 0, y: 0, width: 40, height: 20 });
        return nodeTextLayout(text, '0', scope)!;
    };

    it('picks the nearest slot, not the nearest character', () => {
        // Just right of the 3rd slot (x = 0) — a click lands on the boundary it
        // is closest to, which is what puts the cursor where it was aimed.
        expect(caretOffsetAt(layout(), { x: 1, y: 0 })).toBe(2);
        expect(caretOffsetAt(layout(), { x: -9, y: 0 })).toBe(1);
    });

    it('clamps to the ends rather than reporting nothing', () => {
        expect(caretOffsetAt(layout(), { x: -1000, y: 0 })).toBe(0);
        expect(caretOffsetAt(layout(), { x: 1000, y: 0 })).toBe(4);
    });

    it('measures to the caret segment, so a click below the line still lands on it', () => {
        // Far below the text: every slot is equally further away, so the x
        // comparison must still decide — which it only does if the distance is
        // to the segment rather than to its midpoint.
        expect(caretOffsetAt(layout(), { x: 9, y: -400 })).toBe(3);
    });
});

describe('caretRangeQuads', () => {
    const twoLines = () => {
        const text = new Text({ text: 'ab\ncd' });
        const scope2 = new BlockScope(TWO_LINES);
        place(text, { x: 0, y: 0, width: 20, height: 40 });
        return nodeTextLayout(text, '0', scope2)!;
    };

    it('emits one quad per line a range touches', () => {
        // The whole string, across the break: two disjoint areas, so two quads —
        // one enclosing box would paint over the gap between the lines.
        const quads = caretRangeQuads(twoLines(), 0, 5);
        expect(quads).toHaveLength(2);
        closeToPoint(quads[0].topLeft, -10, 20);
        closeToPoint(quads[0].bottomRight, 10, 0);
        closeToPoint(quads[1].topLeft, -10, 0);
        closeToPoint(quads[1].bottomRight, 10, -20);
    });

    it('drops lines the range does not cover', () => {
        expect(caretRangeQuads(twoLines(), 0, 1)).toHaveLength(1);
    });

    it('is empty for a collapsed range — a caret is not a selection', () => {
        expect(caretRangeQuads(twoLines(), 2, 2)).toEqual([]);
    });

    it('normalises a backwards range, so a right-to-left drag still highlights', () => {
        expect(caretRangeQuads(twoLines(), 5, 0)).toHaveLength(2);
    });
});
