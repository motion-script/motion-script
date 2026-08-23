
import { Graphics2D } from "@/render/graphics2d";
import { Clip } from "@/render/clip";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D } from "@/attributes/layout/size";
import { InsetsResolved } from "@/attributes/layout/insets";
import { StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { Measurer } from "@/render/measurer";
import { applyPadding, expandByPadding } from "@/layout/padding";
import { resolveSize } from "@/layout/size-resolver";
import { GridChild, GridMeasureResult, layoutGrid, measureGrid } from "@/layout/grid";
import { RectCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { RectCornerStyle } from "@/attributes/shape/corners/corner-style";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node2d";
import { property } from "@/attributes/properties/decorator";
import { cornerRadiusProperty, cornerStyleProperty } from "@/attributes/properties/typed";


export interface GridProps extends ShapeProps {
    /** Number of equal-width columns (like Tailwind grid-cols-{n}). */
    columns: number;
    /** Gap between columns in pixels. Overridden by `gap`. */
    columnGap: number;
    /** Gap between rows in pixels. Overridden by `gap`. */
    rowGap: number;
    /** Shorthand: sets both columnGap and rowGap. */
    gap: number;
    /** Corner radius in pixels — uniform, per-corner, or per-axis. */
    cornerRadius: RectCornerRadius;
    /** How each corner is shaped once it has a radius: `'rounded'` or `'angled'`. */
    cornerStyle: RectCornerStyle;
}

/**
 * A Tailwind-style grid container. Lays children into N equal-width columns;
 * rows are auto-sized to their tallest child. Children use `colSpan`/`rowSpan`
 * for spanning and `column`/`row` for explicit placement.
 */
export class Grid extends ShapeNode<GridProps> {

    @property({ default: 1 }) declare readonly columns: number;
    @property({ default: 0 }) declare readonly columnGap: number;
    @property({ default: 0 }) declare readonly rowGap: number;
    @cornerRadiusProperty()
    declare cornerRadius: RectCornerRadius;
    @cornerStyleProperty()
    declare cornerStyle: RectCornerStyle;

    private _cachedMeasure: GridMeasureResult | null = null;

    constructor(props: NodeConfig<Grid, GridProps>) {
        super(props);

        // `gap` shorthand: if provided, apply to both axis gaps
        if (props.gap !== undefined) {
            if (props.columnGap === undefined) this.applyProp("columnGap", props.gap);
            if (props.rowGap === undefined) this.applyProp("rowGap", props.gap);
        }
    }

    // ---- Drawing -------------------------------------------------------------

    protected override shapeGraphics(): Graphics2D {
        return new Graphics2D().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
            start: this.start,
            end: this.end,
        });
    }

    protected override clipSelf(): Clip {
        return new Clip().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
        });
    }

    // ---- Padding -------------------------------------------------------------

    private effectivePadding(): InsetsResolved {
        let extra = 0;
        const p = this.padding as InsetsResolved;
        const strokes = this.stroke as StrokeResolved[];
        if (strokes && Symbol.iterator in Object(strokes)) {
            for (const s of strokes) {
                if (s.weight > extra) extra = s.weight;
            }
        }
        if (extra === 0) return p;
        return { left: p.left + extra, right: p.right + extra, top: p.top + extra, bottom: p.bottom + extra };
    }

    // ---- Measure -------------------------------------------------------------

    override measure(constraints: SizeConstraints, scope: Measurer): Partial<Size2D> {
        const maxWidth = constraints.maxWidth ?? 0;
        const maxHeight = constraints.maxHeight ?? 0;

        const widthIsHug = this.width === "hug";
        const heightIsHug = this.height === "hug";
        const outerW = widthIsHug ? maxWidth : resolveSize(this.width, maxWidth, 0);
        const outerH = heightIsHug ? maxHeight : resolveSize(this.height, maxHeight, 0);
        const padding = this.effectivePadding();
        const inner = applyPadding(outerW, outerH, padding);

        // Pass the bounded inner height so fill-height cells stretch to equal
        // row tracks. When the grid hugs its height, rows size to content.
        const innerHeight = heightIsHug ? undefined : inner.height;
        const m = this.computeMeasure(inner.width, innerHeight, scope);
        this._cachedMeasure = m;

        const hugOuter = expandByPadding(m.hugWidth, m.hugHeight, padding);
        return {
            width: widthIsHug ? resolveSize(this.width, maxWidth, hugOuter.width) : outerW,
            height: heightIsHug ? resolveSize(this.height, maxHeight, hugOuter.height) : outerH,
        };
    }

    override layout(rect: BoxBounds, scope: Measurer): void {
        this.setLayoutRect(rect);

        const padding = this.effectivePadding();
        const inner = applyPadding(rect.width, rect.height, padding);

        const innerHeight = this.height === "hug" ? undefined : inner.height;
        const measure = this._cachedMeasure ?? this.computeMeasure(inner.width, innerHeight, scope);
        this._cachedMeasure = null;

        const childNodes = this.flowChildren();
        const bounds = layoutGrid(
            measure.placements,
            measure.colTrack,
            measure.rowTracks,
            rect,
            this.columnGap,
            this.rowGap,
            padding,
        );

        for (let i = 0; i < childNodes.length; i++) {
            childNodes[i].layout(bounds[i], scope);
        }

        // Stage-pinned children get no track of their own — they're placed
        // against the scene root. See Node2DProps.childPositioning.
        this.layoutAbsoluteChildren(scope);
    }

    private computeMeasure(innerWidth: number, innerHeight: number | undefined, scope: Measurer): GridMeasureResult {
        const childNodes = this.flowChildren();
        const adapters: GridChild[] = childNodes.map((child) => ({
            column: child.column,
            row: child.row,
            colSpan: child.colSpan,
            rowSpan: child.rowSpan,
            measure: (c: SizeConstraints) => child.measure(c, scope),
        }));

        return measureGrid(adapters, this.columns, this.columnGap, this.rowGap, innerWidth, innerHeight);
    }
}
