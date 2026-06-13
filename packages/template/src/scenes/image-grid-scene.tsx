import { Scene, createRef, ShapeProps, ShapeNode, property, NodeConfig, RenderContext, Graphics, Clip, AssetTracker, BoxBounds, SizeConstraints, Size2D, MeasureScope, easeOutElastic, FX, easeOutQuad, Rect, wait } from "@motion-script/core";

export interface ImageGridProps extends ShapeProps {
    src: string;
    rows?: number;
    columns?: number;
    /** Spacing on both axes. `rowGap` / `columnGap` override it per-axis. */
    gap?: number;
    rowGap?: number;
    columnGap?: number;
}

/**
 * One cell of an {@link ImageGrid}. Cells are real child nodes of the grid, so
 * the normal layout / animation / render pipeline drives them — `cell(r, c)`
 * returns the node and `cell(r, c).moveTo(...)` animates it like any other.
 *
 * A cell holds no state of its own: its slot comes from the grid's layout pass
 * (its `layoutRect`) and its styling (stroke, shadow, src) is read live from the
 * grid, so animating the grid reflows and restyles every cell. It shows the
 * slice of the image that falls within its slot — the whole image is drawn to
 * *cover* the grid (resolution-independent, computed by the renderer) and clipped
 * to the cell's window. `moveTo` carries that slice with it, since the image and
 * its clip are drawn in the cell's local space.
 */
class GridCell extends ShapeNode<ShapeProps> {
    constructor(
        private readonly grid: ImageGrid,
        readonly row: number,
        readonly col: number,
    ) {
        super({});
    }

    protected renderSelf(ctx: RenderContext): void {
        const r = this.layoutRect;
        if (r.width <= 0 || r.height <= 0) return;
        const { width: W, height: H } = this.grid.gridSize();
        // A zero-weight stroke still rasterises a hairline, so drop those — at
        // weight 0 the cell shows no stroke at all.
        const stroke = this.grid.stroke.filter(s => s.weight > 0);
        const shadow = this.grid.shadow;

        // Shadow behind the slice. A shadow only paints when a fill/stroke flushes
        // it, so pair it with a fully transparent fill — the slice covers the cell
        // anyway, and the offset/blurred shadow stays visible around it.
        if (shadow.length > 0) {
            ctx.draw(new Graphics().rect({ width: r.width, height: r.height }).shadow(shadow).fill("transparent"));
        }

        // The slice: draw the whole image covering the grid (mode 'crop' = cover,
        // computed from the decoded image), clipped to this cell's window. The
        // grid's centre sits at (-r.x, -r.y) in the cell's local space.
        //
        // Bleed the clip toward abutting neighbours so the anti-aliased clip edges
        // overlap instead of leaving a ~50%-coverage hairline (which a magnifying
        // effect like bulge readily reveals). Every cell draws the *same* cover
        // image at the same world position, so the overlap is pixel-identical —
        // invisible — while backing each tile's AA fringe with the neighbour's
        // solid fill. Only interior edges bleed (keeps the outer border crisp),
        // and the bleed tapers to 0 as the gap opens so real gaps stay intact.
        const BLEED = 1; // scene px — enough to cover the ~1px AA clip fringe
        const bx = Math.max(0, BLEED - (this.grid.columnGap ?? 0));
        const by = Math.max(0, BLEED - (this.grid.rowGap ?? 0));
        const left = this.col > 1 ? bx : 0;
        const right = this.col < this.grid.columns ? bx : 0;
        const top = this.row > 1 ? by : 0;
        const bottom = this.row < this.grid.rows ? by : 0;
        ctx.beginClip(new Clip().rect({
            x: (right - left) / 2,
            y: (bottom - top) / 2,
            width: r.width + left + right,
            height: r.height + top + bottom,
        }));
        ctx.draw(new Graphics().image({ x: -r.x, y: -r.y, width: W, height: H, src: this.grid.src, mode: "crop" }));
        ctx.endClip();

        // Stroke on top of the slice.
        if (stroke.length > 0) {
            ctx.draw(new Graphics().rect({ width: r.width, height: r.height }).stroke(stroke));
        }
    }
}

export class ImageGrid extends ShapeNode<ImageGridProps> {

    @property({ default: '' }) declare src: string;
    @property({ default: 3 }) declare rows: number;
    @property({ default: 3 }) declare columns: number;
    @property({ default: 0 }) declare rowGap: number | undefined;
    @property({ default: 0 }) declare columnGap: number | undefined;

    constructor(props: NodeConfig<ImageGrid, ImageGridProps>) {
        super(props);
    }


    private cellGrid: GridCell[][] = [];
    private allCells: GridCell[] = [];
    private cellSignature = '';

    // (Re)build the cell children whenever the grid dimensions change. Cells are
    // created here — never in the constructor — and added as real children so the
    // standard layout/animation/render pipeline drives them.
    private ensureCells(): void {
        const signature = `${this.rows}x${this.columns}`;
        if (signature === this.cellSignature && this.allCells.length > 0) return;
        for (const cell of this.allCells) {
            this.removeChild(cell);
            cell.dispose();
        }
        this.cellSignature = signature;
        this.cellGrid = [];
        this.allCells = [];
        for (let r = 1; r <= this.rows; r++) {
            const rowCells: GridCell[] = [];
            for (let c = 1; c <= this.columns; c++) {
                const cell = new GridCell(this, r, c);
                this.addChild(cell);
                rowCells.push(cell);
                this.allCells.push(cell);
            }
            this.cellGrid.push(rowCells);
        }
    }

    /** The cell at the given 1-based (row, column). Returns the child node, so
     *  `grid.cell(2, 4).moveTo(400, 600, 2)` animates that slice. */
    cell(row: number, col: number): GridCell {
        this.ensureCells();
        if (row < 1 || row > this.rows || col < 1 || col > this.columns) {
            throw new Error(`cell(${row}, ${col}) is out of range for a ${this.rows}×${this.columns} grid`);
        }
        return this.cellGrid[row - 1][col - 1];
    }

    /** Grid size in scene pixels, from the last layout pass. */
    gridSize(): { width: number; height: number } {
        return { width: this.layoutRect.width, height: this.layoutRect.height };
    }

    /** A cell's slot size and home-centre offset (grid-local, y-down). Cells and
     *  the gaps between them exactly fill the grid. */
    private cellMetrics(row: number, col: number): { homeX: number; homeY: number; cellW: number; cellH: number } {
        const { width: W, height: H } = this.gridSize();
        const colGap = this.columnGap;
        const rowGap = this.rowGap;
        const cellW = (W - (this.columns - 1) * colGap) / this.columns;
        const cellH = (H - (this.rows - 1) * rowGap) / this.rows;
        const homeX = (col - 1) * (cellW + colGap) + cellW / 2 - W / 2;
        const homeY = (row - 1) * (cellH + rowGap) + cellH / 2 - H / 2;
        return { homeX, homeY, cellW, cellH };
    }

    override measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        this.ensureCells();
        return super.measure(constraints, scope);
    }

    // The grid is the only node that lays out its cells: each is placed in its
    // slot (using the live gaps + grid size, so animating either reflows them).
    override layout(rect: BoxBounds, scope: MeasureScope): void {
        super.layout(rect, scope);
        this.ensureCells();
        for (const cell of this.allCells) {
            const { homeX, homeY, cellW, cellH } = this.cellMetrics(cell.row, cell.col);
            cell.layout({ x: homeX, y: homeY, width: cellW, height: cellH }, scope);
        }
    }

    prepare(tracker: AssetTracker): void {
        super.prepare(tracker);
        if (this.src) tracker.requestImage(this.src, this.layoutRect.width, this.layoutRect.height);
    }

    // The grid draws nothing itself; its cells (children) render the image.
    protected renderSelf(_ctx: RenderContext): void { }
}

export class ImageGridScene extends Scene {
    *build() {
        this.set({ fill: ["#e8c584"] })
        const ref = createRef<ImageGrid>();
        this.add(
            <>
                <ImageGrid
                    ref={ref}
                    width={650}
                    height={650}
                    rows={16}
                    columns={16}
                    rowGap={0}
                    columnGap={0}
                    src={'./cat.jpg'}

                    effects={FX.bulge(0)}
                    stroke={{ weight: 0, fill: 'white' }}
                />
            </>
        );
        yield* wait(1);
        yield* ref().to({ effects: FX.bulge(0.05), stroke: { weight: 2 }, rowGap: 10, columnGap: 10, width: 850, height: 850 }, 1.5, easeOutElastic());
        yield* ref().cell(2, 4).to({ x: -400, scale: 5 }, 1, easeOutQuad);
        yield* wait(1);
    }
};
