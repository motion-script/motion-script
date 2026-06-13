
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D } from "@/attributes/layout/size";
import { PaddingResolved } from "@/attributes/layout/padding";
import { MeasureScope } from "@/render/measure-scope";
import { applyPadding, expandByPadding } from "@/layout/padding";
import { resolveSize } from "@/layout/size-resolver";
import { lerpSizeInput } from "@/layout/tweens";
import { GridChild, GridMeasureResult, layoutGrid, measureGrid } from "@/layout/grid";
import { CornerRadiusProps, CornerRadiusResolved, lerpCornerRadius, resolveCornerRadius } from "@/attributes/shape/corners/corner-radius";
import { CornerStyleProps, CornerStyleResolved, lerpCornerStyle, resolveCornerStyle } from "@/attributes/shape/corners/corner-style";
import { ShapeNode, ShapeProps } from "./shape-node";
import { Node, NodeConfig } from "../base/node";
import { property } from "@/attributes/properties/decorator";


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
    cornerRadius: CornerRadiusProps;
    /** How each corner is shaped once it has a radius: `'rounded'` or `'angled'`. */
    cornerStyle: CornerStyleProps;
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
    @property({ default: 0, mapper: (v: CornerRadiusProps, p?: CornerRadiusResolved) => resolveCornerRadius(v, p), tween: lerpCornerRadius })
    declare readonly cornerRadius: CornerRadiusResolved;
    @property({ default: "rounded", mapper: (v: CornerStyleProps, p?: CornerStyleResolved) => resolveCornerStyle(v, p), tween: lerpCornerStyle })
    declare readonly cornerStyle: CornerStyleResolved;

    private _cachedMeasure: GridMeasureResult | null = null;

    constructor(props: NodeConfig<Grid, GridProps>) {
        super(props);

        const hasChildren = Array.isArray(props.children) ? props.children.length > 0 : !!props.children;
        const defaultSize = hasChildren ? 'hug' : 'fill';
        if (props.width === undefined) this.applyProp("width", defaultSize, { tween: lerpSizeInput });
        if (props.height === undefined) this.applyProp("height", defaultSize, { tween: lerpSizeInput });

        // `gap` shorthand: if provided, apply to both axis gaps
        if (props.gap !== undefined) {
            if (props.columnGap === undefined) this.applyProp("columnGap", props.gap);
            if (props.rowGap === undefined) this.applyProp("rowGap", props.gap);
        }
    }

    // ---- Drawing -------------------------------------------------------------

    protected renderSelf(draw: RenderContext): void {
        draw.draw(new Graphics()
            .rect({
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                cornerRadius: this.cornerRadius,
                cornerStyle: this.cornerStyle,
                start: this.start,
                end: this.end,
            })
            .shadow(this.shadow).fill(this.fill).stroke(this.stroke));
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

    private effectivePadding(): PaddingResolved {
        let extra = 0;
        if (this.stroke && Symbol.iterator in Object(this.stroke)) {
            for (const s of this.stroke) {
                if (s.weight > extra) extra = s.weight;
            }
        }
        if (extra === 0) return this.padding;
        const p = this.padding;
        return { left: p.left + extra, right: p.right + extra, top: p.top + extra, bottom: p.bottom + extra };
    }

    // ---- Measure -------------------------------------------------------------

    override measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
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

    override layout(rect: BoxBounds, scope: MeasureScope): void {
        super.layout(rect, scope);

        const padding = this.effectivePadding();
        const inner = applyPadding(rect.width, rect.height, padding);

        const innerHeight = this.height === "hug" ? undefined : inner.height;
        const measure = this._cachedMeasure ?? this.computeMeasure(inner.width, innerHeight, scope);
        this._cachedMeasure = null;

        const childNodes = this.children.filter((c): c is Node => c instanceof Node);
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
    }

    private computeMeasure(innerWidth: number, innerHeight: number | undefined, scope: MeasureScope): GridMeasureResult {
        const childNodes = this.children.filter((c): c is Node => c instanceof Node);
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
