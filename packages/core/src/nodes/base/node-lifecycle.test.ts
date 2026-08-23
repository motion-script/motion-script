import { describe, it, expect } from 'vitest';
import { Row } from '@/nodes/layout/row-node';
import { Node2D } from '@/nodes/base/node2d';
import { FakeMeasurer } from '@/runtime/runtime.fixtures';
import { BoxBounds } from '@/attributes/layout/bounds';
import { SizeInput } from '@/attributes/layout/size';

const scope = new FakeMeasurer();

/** A leaf that exposes the box its parent laid it into (protected `layoutRect` seam). */
class Tile extends Node2D {
    constructor(width: SizeInput, height: SizeInput) {
        super({ width, height });
    }
    get rect(): BoxBounds {
        return this.layoutRect;
    }
}

/** A hug-sized container wrapping one fixed tile, so its natural width is only known once laid out. */
class HugItem extends Node2D {
    constructor(childWidth: number) {
        super({ width: 'hug', height: 'hug', children: [new Tile(childWidth, 40)] });
    }
    get rect(): BoxBounds {
        return this.layoutRect;
    }
    /** The protected opacity, surfaced so a test can tell visible frames apart. */
    get op(): number {
        return this.opacity;
    }
}

/**
 * Drive a child-management generator to completion, running a measure + layout
 * pass against `root` between every generator step. This mirrors the runtime's
 * per-frame order (advance generators → layout → render), which is what makes a
 * hug child's `measuredWidth` available to the animated add on the frame after
 * it is inserted. Returns the sequence of `sample()` snapshots taken *after*
 * each layout pass.
 */
function driveWithLayout<T>(
    root: Node2D & { rect: BoxBounds },
    command: Iterable<void>,
    dt: number,
    sample: () => T,
    rootBox: BoxBounds,
): T[] {
    const gen = command[Symbol.iterator]() as Iterator<void, void, number>;
    const snaps: T[] = [];
    const layout = () => {
        // Measure against a generous space, then lay the root into a cell sized to
        // its own hugged extent — so a hug root reports its content width via
        // layoutRect, exactly as a parent packing it to size would.
        const size = root.measure({ maxWidth: rootBox.width, maxHeight: rootBox.height }, scope);
        root.layout(
            { x: rootBox.x, y: rootBox.y, width: size.width ?? 0, height: size.height ?? 0 },
            scope,
        );
    };
    // Initial layout so on-screen children have a valid rect before we start.
    layout();
    for (;;) {
        const { done } = gen.next(dt);
        layout();
        snaps.push(sample());
        if (done) break;
    }
    return snaps;
}

/** A Row that exposes its own laid-out box for the driver. */
class ProbeRow extends Row {
    get rect(): BoxBounds {
        return this.layoutRect;
    }
}

describe('addChildAt (animated) — grows the child in so siblings reflow', () => {
    it('interpolates a hug child from 0 up to its measured width (no snap)', () => {
        const a = new Tile(100, 40);
        const b = new Tile(100, 40);
        const row = new ProbeRow({ gap: 20 });
        row.addChildren([a, b]);

        const incoming = new HugItem(60); // natural hug width = 60
        // 0.4s at dt = 0.1s → 4 tween frames. The hug width is measured detached
        // (off-tree) before the child is attached, so there is no in-flow measure
        // frame that could shift the siblings.
        const gen = row.addChildAt(incoming, 1, 0.4);

        const rootBox = { x: 0, y: 0, width: 1000, height: 1000 };
        const snaps = driveWithLayout(
            row,
            gen,
            0.1,
            () => ({ item: incoming.rect.width, row: row.rect.width, op: incoming.op }),
            rootBox,
        );

        // Final item width lands exactly on the hug size.
        expect(snaps[snaps.length - 1].item).toBeCloseTo(60, 5);
        // Final row width = 100 + 20 + 60 + 20 + 100 = 300.
        expect(snaps[snaps.length - 1].row).toBeCloseTo(300, 5);

        const itemWidths = snaps.map((s) => s.item);
        const rowWidths = snaps.map((s) => s.row);

        // No frame ever overshoots the final packed size — the regression this
        // guards is a one-frame jump to the final layout (siblings snapping to
        // their end positions) before the grow-in. Item width stays ≤ 60 and row
        // width stays ≤ 300 on *every* frame, including the first.
        for (const w of itemWidths) expect(w).toBeLessThanOrEqual(60 + 1e-6);
        for (const w of rowWidths) expect(w).toBeLessThanOrEqual(300 + 1e-6);

        // The grow-in is gradual: the item passes through partial widths and the
        // row climbs through intermediate totals rather than snapping.
        expect(itemWidths.some((w) => w > 0 && w < 60)).toBe(true);
        expect(rowWidths.some((w) => w > 240 && w < 300)).toBe(true);

        // Row width only ever widens across the whole animation — monotonic from
        // frame one, since there is no detached-measure dip in the flow.
        for (let i = 1; i < rowWidths.length; i++) {
            expect(rowWidths[i]).toBeGreaterThanOrEqual(rowWidths[i - 1] - 1e-6);
        }
    });

    it('restores the hug token after the tween so the child reflows naturally', () => {
        const row = new ProbeRow({ gap: 20 });
        row.addChildren([new Tile(100, 40)]);

        const incoming = new HugItem(60);
        const gen = row.addChildAt(incoming, 0, 0.2);
        driveWithLayout(row, gen, 0.1, () => null, { x: 0, y: 0, width: 1000, height: 1000 });

        // Once the animation completes the axis is a hug token again (not pinned
        // to the numeric tween end), so a later content change re-hugs.
        expect((incoming as unknown as { width: SizeInput }).width).toBe('hug');
        expect((incoming as unknown as { height: SizeInput }).height).toBe('hug');
    });
});

describe('removeChildAt (animated) — shrinks the child so siblings close the gap', () => {
    it('shrinks the removed child to 0 then detaches it', () => {
        const a = new Tile(100, 40);
        const b = new Tile(100, 40);
        const row = new ProbeRow({ gap: 20 });
        row.addChildren([a, b]);

        const gen = row.removeChildAt(1, 0.2);
        const rowWidths = driveWithLayout(
            row,
            gen,
            0.1,
            () => row.rect.width,
            { x: 0, y: 0, width: 1000, height: 1000 },
        );

        // Ends with b gone: single 100-wide child, no gap → row hugs to 100.
        expect(rowWidths[rowWidths.length - 1]).toBeCloseTo(100, 5);
        expect(row.children).not.toContain(b);
        // Width only ever shrank.
        for (let i = 1; i < rowWidths.length; i++) {
            expect(rowWidths[i]).toBeLessThanOrEqual(rowWidths[i - 1] + 1e-6);
        }
    });
});
