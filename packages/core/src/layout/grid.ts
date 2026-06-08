
import { BoxBounds } from "@/attributes/layout/bounds";
import { PaddingResolved } from "@/attributes/layout/padding";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { Size2D } from "@/attributes/layout/size";

export interface GridChild {
    column?: number;
    row?: number;
    colSpan: number;
    rowSpan: number;
    measure(constraints: SizeConstraints): Partial<Size2D>;
}

export interface GridPlacement {
    col: number;
    row: number;
    colSpan: number;
    rowSpan: number;
}

export interface ResolvedTrack {
    start: number;
    size: number;
}

export interface GridMeasureResult {
    placements: GridPlacement[];
    colTrack: number;
    rowTracks: number[];
    hugWidth: number;
    hugHeight: number;
}

/**
 * Auto-place children into grid cells, filling left-to-right and wrapping to
 * new rows when a child's colSpan would overflow the column count.
 */
function autoPlace(children: GridChild[], columnCount: number): GridPlacement[] {
    const placements: GridPlacement[] = [];
    // occupied[row][col] = true when taken
    const occupied: boolean[][] = [];

    function isFree(r: number, c: number, colSpan: number, rowSpan: number): boolean {
        for (let dr = 0; dr < rowSpan; dr++) {
            for (let dc = 0; dc < colSpan; dc++) {
                if (occupied[r + dr]?.[c + dc]) return false;
            }
        }
        return true;
    }

    function mark(r: number, c: number, colSpan: number, rowSpan: number): void {
        for (let dr = 0; dr < rowSpan; dr++) {
            if (!occupied[r + dr]) occupied[r + dr] = [];
            for (let dc = 0; dc < colSpan; dc++) {
                occupied[r + dr][c + dc] = true;
            }
        }
    }

    let cursor = { r: 0, c: 0 };

    for (const child of children) {
        const colSpan = Math.min(child.colSpan, columnCount);
        const rowSpan = child.rowSpan;

        if (child.column !== undefined && child.row !== undefined) {
            // Explicit placement (1-based → 0-based)
            const r = child.row - 1;
            const c = child.column - 1;
            mark(r, c, colSpan, rowSpan);
            placements.push({ col: c, row: r, colSpan, rowSpan });
            continue;
        }

        // Auto-place: advance cursor until a free cell is found
        while (true) {
            if (cursor.c + colSpan > columnCount) {
                cursor.r++;
                cursor.c = 0;
            }
            if (isFree(cursor.r, cursor.c, colSpan, rowSpan)) break;
            cursor.c++;
        }

        mark(cursor.r, cursor.c, colSpan, rowSpan);
        placements.push({ col: cursor.c, row: cursor.r, colSpan, rowSpan });
        cursor.c += colSpan;
    }

    return placements;
}

/**
 * Pure measure pass for a grid container: determines column/row track sizes
 * and returns the hug dimensions.
 */
export function measureGrid(
    children: readonly GridChild[],
    columnCount: number,
    colGap: number,
    rowGap: number,
    innerWidth: number,
    innerHeight?: number,
): GridMeasureResult {
    const count = Math.max(1, columnCount);
    const totalColGaps = colGap * (count - 1);
    const colTrack = Math.max(0, (innerWidth - totalColGaps) / count);

    const placements = autoPlace([...children], count);

    const rowCount = placements.reduce((max, p) => Math.max(max, p.row + p.rowSpan), 0);

    // When the grid has a bounded height, divide it into equal row tracks so
    // `fill`-height children stretch to fill their cell (like the equal column
    // tracks). Without a bound (hug height) rows size to their content instead.
    const heightIsBounded = innerHeight !== undefined && rowCount > 0;
    const equalRowTrack = heightIsBounded
        ? Math.max(0, (innerHeight - rowGap * (rowCount - 1)) / rowCount)
        : 0;

    const rowTracks = new Array<number>(rowCount).fill(heightIsBounded ? equalRowTrack : 0);

    // Measure each child under its allocated cell size. Fill-height children are
    // measured against their row-track height so they report the full cell.
    for (let i = 0; i < children.length; i++) {
        const p = placements[i];
        const childWidth = colTrack * p.colSpan + colGap * (p.colSpan - 1);
        const spannedTrackH = equalRowTrack * p.rowSpan + rowGap * (p.rowSpan - 1);
        const constraints: SizeConstraints = heightIsBounded
            ? { maxWidth: childWidth, maxHeight: spannedTrackH }
            : { maxWidth: childWidth };
        const measured = children[i].measure(constraints);
        const childH = measured.height ?? 0;

        // With a bounded height the tracks are already equal — don't let content
        // grow them past the equal share. Otherwise size rows to their content.
        if (heightIsBounded) continue;

        // Distribute height across spanned rows (simple: put it all in first row if it fits)
        if (p.rowSpan === 1) {
            if (childH > rowTracks[p.row]) rowTracks[p.row] = childH;
        } else {
            // Multi-row: ensure total spanned height covers child
            const spanH = rowTracks.slice(p.row, p.row + p.rowSpan).reduce((s, h) => s + h, 0)
                + rowGap * (p.rowSpan - 1);
            if (spanH < childH) {
                const extra = childH - spanH;
                rowTracks[p.row] += extra;
            }
        }
    }

    const hugHeight = rowTracks.reduce((s, h) => s + h, 0) + rowGap * Math.max(0, rowCount - 1);

    return { placements, colTrack, rowTracks, hugWidth: innerWidth, hugHeight };
}

/**
 * Pure layout pass: returns the BoxBounds for each child given the resolved tracks.
 */
export function layoutGrid(
    placements: GridPlacement[],
    colTrack: number,
    rowTracks: number[],
    rect: BoxBounds,
    colGap: number,
    rowGap: number,
    padding: PaddingResolved,
): BoxBounds[] {
    // Compute cumulative row starts (top-down, relative to inner top-left)
    const rowStarts: number[] = [];
    let acc = 0;
    for (const h of rowTracks) {
        rowStarts.push(acc);
        acc += h + rowGap;
    }

    const innerW = rect.width - padding.left - padding.right;
    const innerH = rect.height - padding.top - padding.bottom;
    const originX = -rect.width / 2 + padding.left;
    // y-down layout space (matches flex/stack/transform): the inner top edge is
    // -height/2 + padding.top and rows grow downward (+y), so row 0 sits at top.
    const originY = -rect.height / 2 + padding.top;

    return placements.map((p) => {
        const cellW = colTrack * p.colSpan + colGap * (p.colSpan - 1);
        const spannedH = rowTracks.slice(p.row, p.row + p.rowSpan).reduce((s, h) => s + h, 0)
            + rowGap * (p.rowSpan - 1);

        const cellX = p.col * (colTrack + colGap);
        const cellY = rowStarts[p.row] ?? 0;

        // Convert from top-left inner-space to center-based coordinates
        const localX = originX + cellX + cellW / 2;
        const localY = originY + cellY + spannedH / 2;

        return { x: localX, y: localY, width: Math.min(cellW, innerW), height: Math.min(spannedH, innerH) };
    });
}
