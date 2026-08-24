import { describe, it, expect } from 'vitest';
import { GridChild, measureGrid, layoutGrid } from '@/layout/grid';
import { SizeConstraints } from '@/attributes/layout/constraints';

/** A cell that fills whatever size it's offered (width:fill, height:fill). */
function fillCell(): GridChild {
    return {
        colSpan: 1,
        rowSpan: 1,
        measure: (c: SizeConstraints) => ({
            width: c.maxWidth ?? 0,
            height: c.maxHeight ?? 0,
        }),
    };
}

/** A cell with a fixed intrinsic height, ignoring maxHeight. */
function fixedHeightCell(h: number): GridChild {
    return {
        colSpan: 1,
        rowSpan: 1,
        measure: (c: SizeConstraints) => ({ width: c.maxWidth ?? 0, height: h }),
    };
}

const noPad = { left: 0, right: 0, top: 0, bottom: 0 };

describe('measureGrid row tracks', () => {
    it('divides a bounded height into equal row tracks for fill cells', () => {
        // 6 fill cells, 3 columns => 2 rows. Inner area 900x600, no gaps.
        const cells = Array.from({ length: 6 }, fillCell);
        const m = measureGrid(cells, 3, 0, 0, 900, 600);

        expect(m.rowTracks).toHaveLength(2);
        // Each row is half the available height regardless of content.
        expect(m.rowTracks).toEqual([300, 300]);
        expect(m.colTrack).toBe(300);
    });

    it('accounts for row gaps when distributing bounded height', () => {
        const cells = Array.from({ length: 6 }, fillCell);
        const rowGap = 40;
        const m = measureGrid(cells, 3, 0, rowGap, 900, 640);

        // (640 - 40 gap) / 2 rows = 300 each.
        expect(m.rowTracks).toEqual([300, 300]);
    });

    it('does not let tall content grow a bounded row past its equal share', () => {
        const cells = [
            fixedHeightCell(50),
            fixedHeightCell(50),
            fixedHeightCell(50),
            fixedHeightCell(500), // would blow out row 1 if content-sized
            fixedHeightCell(50),
            fixedHeightCell(50),
        ];
        const m = measureGrid(cells, 3, 0, 0, 900, 600);
        expect(m.rowTracks).toEqual([300, 300]);
    });

    it('falls back to content-sized rows when height is unbounded (hug)', () => {
        const cells = [
            fixedHeightCell(120),
            fixedHeightCell(80),
            fixedHeightCell(200),
            fixedHeightCell(60),
            fixedHeightCell(60),
            fixedHeightCell(60),
        ];
        const m = measureGrid(cells, 3, 0, 0, 900 /* no innerHeight */);
        // Row tracks hug the tallest cell in each row.
        expect(m.rowTracks).toEqual([200, 60]);
    });
});

describe('layoutGrid placement', () => {
    it('produces six equal, non-overlapping cells in a 2x3 grid', () => {
        const cells = Array.from({ length: 6 }, fillCell);
        const m = measureGrid(cells, 3, 0, 0, 900, 600);
        const rect = { x: 0, y: 0, width: 900, height: 600 };
        const bounds = layoutGrid(m.placements, m.colTrack, m.rowTracks, rect, 0, 0, noPad);

        expect(bounds).toHaveLength(6);
        for (const b of bounds) {
            expect(b.width).toBe(300);
            expect(b.height).toBe(300);
        }

        // y-down space: top row centers at -150 (top half), bottom row at +150.
        expect(bounds.slice(0, 3).map((b) => b.y)).toEqual([-150, -150, -150]);
        expect(bounds.slice(3, 6).map((b) => b.y)).toEqual([150, 150, 150]);

        // Columns centered left/middle/right.
        expect(bounds.slice(0, 3).map((b) => b.x)).toEqual([-300, 0, 300]);
    });
});
