import { property } from "@/attributes/properties/decorator";
import { ShapeNode, ShapeProps } from "./shape-node";
import { NodeConfig } from "../base/node";
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { Clip } from "@/render/clip";
import { PathBounds, PathCommand } from "@/render/descriptors/path";
import { lerpStrokeArray } from "@/attributes/shape/stroke/lerp";
import { resolveStrokeArray, Stroke, StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { centered, dimStroke, gridLinePaths, maxWeight } from "./grid-lines";
import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { BoxBounds } from "@/attributes/layout/bounds";
import { Size2D } from "@/attributes/layout/size";
import { PaddingResolved } from "@/attributes/layout/padding";
import { MeasureScope } from "@/render/measure-scope";
import { applyPadding } from "@/layout/padding";

export interface LineGridProps extends ShapeProps {
    /**
     * Number of cells along each axis — the count of equal gaps between the
     * major grid lines. `divisions` of 4 draws 5 major lines per axis (the two
     * outer edges plus three interior). Defaults to 4.
     */
    divisions: number;
    /**
     * Number of finer cells each division is split into. `subdivisions` of 1
     * (the default) draws no extra lines; 2 adds one minor line at the centre
     * of every division, 4 adds three, and so on.
     */
    subdivisions: number;
    /**
     * Stroke for the minor (subdivision) lines. Accepts the same loose values
     * as {@link ShapeProps.stroke}. When omitted but `stroke` is set and
     * `subdivisions > 1`, it defaults to the major `stroke` at half opacity so
     * the minor lines read as a lighter version of the grid.
     */
    subStroke?: Stroke;
    /**
     * Pixel offset that pans the whole grid. Every line shifts by
     * `(origin.x, origin.y)`; lines wrap and tile so the rect always stays full,
     * so animating `origin` scrolls the grid continuously behind the fixed rect.
     * Defaults to `{ x: 0, y: 0 }` (the grid centred in the rect).
     */
    origin: Vector2;
}

/**
 * A rectangular grid of lines filling the node's layout rect. `divisions` sets
 * how many cells span each axis and `subdivisions` how finely each cell is
 * split again.
 *
 * The paint layers map onto the grid as a whole, not the individual lines:
 * - `stroke` paints the major (division) grid lines. Every major line is one
 *   subpath of a single `path` op, so they paint as one union shape with one
 *   consistent stroke.
 * - `subStroke` paints the minor (subdivision) lines the same way, as their own
 *   union shape, so they can carry a distinct (typically lighter) stroke.
 * - `fill` paints across the entire grid rect, behind the lines.
 * - `shadow` casts off that same full grid rect, like the fill.
 */
export class LineGrid extends ShapeNode<LineGridProps> {

    @property({ default: 4 }) declare readonly divisions: number;
    @property({ default: 1 }) declare readonly subdivisions: number;
    // Asymmetric accessor like `ShapeNode.stroke`: reads yield `StrokeResolved[]`,
    // writes accept the loose `Stroke`. Runtime accessor installed by @property.
    @property({ default: [], mapper: resolveStrokeArray, tween: lerpStrokeArray })
    get subStroke(): StrokeResolved[] { return undefined!; }
    set subStroke(_value: Stroke) { /* installed by @property */ }
    @property({ default: { x: 0, y: 0 }, tween: lerpVector2 })
    declare readonly origin: Vector2;

    constructor(props: NodeConfig<LineGrid, LineGridProps>) {
        super(props);

        // Default the minor-line stroke to the major stroke at half opacity, so
        // subdivisions read as a lighter version of the grid without the author
        // having to spell out a second stroke. Only when there's a stroke to
        // derive from, subdivisions that actually draw minor lines, and no
        // explicit subStroke.
        if (props.subStroke === undefined && props.stroke !== undefined && this.subdivisions > 1) {
            this.set({ subStroke: dimStroke(this.stroke as StrokeResolved[], 0.5) });
        }
    }

    // ---- Child layout --------------------------------------------------------
    //
    // The grid sizes itself from its own width/height (it doesn't hug children),
    // but children still need to be measured and placed. Like a stack, each child
    // is measured against the padded content box and centred in the grid — the
    // grid is the backdrop, children float over its centre.

    override measure(constraints: SizeConstraints, scope: MeasureScope): Partial<Size2D> {
        const size = super.measure(constraints, scope);
        // Measure children so they have a resolved size for layout(); the result
        // doesn't change the grid's own size (it never hugs its children).
        const inner = applyPadding(size.width ?? 0, size.height ?? 0, this.padding as PaddingResolved);
        const childConstraints: SizeConstraints = { maxWidth: inner.width, maxHeight: inner.height };
        for (const child of this.children) child.measure(childConstraints, scope);
        return size;
    }

    override layout(rect: BoxBounds, scope: MeasureScope): void {
        super.layout(rect, scope);

        const pad = this.padding as PaddingResolved;
        const inner = applyPadding(rect.width, rect.height, pad);
        // Centre of the padded content box, in this node's local space (origin =
        // grid centre, matching how shapes are drawn).
        const cx = (pad.left - pad.right) / 2;
        const cy = (pad.top - pad.bottom) / 2;

        const childConstraints: SizeConstraints = { maxWidth: inner.width, maxHeight: inner.height };
        for (const child of this.children) {
            const size = child.measure(childConstraints, scope);
            const w = size.width ?? 0;
            const h = size.height ?? 0;
            child.layout({ x: cx, y: cy, width: w, height: h }, scope);
        }
    }

    protected renderSelf(draw: RenderContext): void {
        const width = this.layoutRect.width;
        const height = this.layoutRect.height;
        const centerBounds: PathBounds = [-width / 2, -height / 2, width / 2, height / 2];

        // Fill + shadow paint across the whole grid rect, behind the lines.
        draw.draw(new Graphics()
            .rect({ width, height, start: this.start, end: this.end })
            .shadow(this.shadow)
            .fill(this.fill));

        const divisions = Math.max(1, Math.floor(this.divisions));
        const subdivisions = Math.max(1, Math.floor(this.subdivisions));

        // Grid lines are centered strokes (open paths have no inside/outside, so
        // alignment is meaningless). They run edge-to-edge and pan with `origin`,
        // so their ends can fall outside the rect — clip them to it and overscan
        // the tiling by half the thickest stroke, so a thick line slides out under
        // the clip instead of popping in and out at the boundary as the grid scrolls.
        const major = centered(this.stroke as StrokeResolved[]);
        const minorStroke = centered(this.subStroke as StrokeResolved[]);
        const overscan = Math.max(maxWeight(major), maxWeight(minorStroke)) / 2;
        const { major: majorLines, minor: minorLines } = this.gridPaths(width, height, divisions, subdivisions, overscan);

        draw.beginClip(new Clip().rect({ width, height }));
        // Minor (subdivision) lines first so the major lines sit on top of them.
        if (subdivisions > 1 && minorStroke.length > 0 && minorLines.length > 0) {
            draw.draw(new Graphics()
                .path({ d: minorLines, centerBounds })
                .stroke(minorStroke));
        }
        // Major (division) lines on top.
        if (majorLines.length > 0) {
            draw.draw(new Graphics()
                .path({ d: majorLines, centerBounds })
                .stroke(major));
        }
        draw.endClip();
    }

    protected override clipSelf(): Clip {
        return new Clip().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
        });
    }

    // Build the grid lines as multi-subpath SVG paths, split into the major
    // (division) lines and the minor (subdivision) lines. Lines are tiled by the
    // minor step and panned by `origin`: every position within the rect (grown by
    // `overscan` so thick lines clip out smoothly) is emitted regardless of the
    // offset, so the rect always stays full and animating `origin` scrolls the
    // grid. A tile whose index aligns to the division grid is major; the rest are
    // minor. Drawn as single paths so each trailing stroke paints every subpath as
    // one union, with no destructive boolean op (which would erase the open lines).
    private gridPaths(width: number, height: number, divisions: number, subdivisions: number, overscan: number): { major: PathCommand[]; minor: PathCommand[] } {
        // Inset the grid by `overscan` (half the thickest stroke) on every side so
        // the outermost lines sit fully inside the rect rather than straddling the
        // edge — otherwise the clip would trim the bounds lines to half weight at
        // origin 0. The grid spacing is measured across this inset extent, so the
        // edge lines land exactly on the inset bounds.
        const cols = divisions * subdivisions;
        const innerW = Math.max(0, width - 2 * overscan);
        const innerH = Math.max(0, height - 2 * overscan);
        const insetX = width / 2 - overscan;
        const insetY = height / 2 - overscan;

        // Tile each axis by the minor step, panned by `origin`; lines span the full
        // cross-axis (clipped to the rect by the caller) and overscan the boundary
        // so a thick line slides out under the clip instead of popping.
        return gridLinePaths(
            { min: -insetX, max: insetX, step: innerW / cols, offset: this.origin.x },
            { min: -insetY, max: insetY, step: innerH / cols, offset: this.origin.y },
            subdivisions,
            overscan,
        );
    }
}
