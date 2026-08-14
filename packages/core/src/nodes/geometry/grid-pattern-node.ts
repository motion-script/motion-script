import { property } from "@/attributes/properties/decorator";
import { strokeProperty } from "@/attributes/properties/typed";
import { NodeConfig } from "../base/node";
import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { BoxBounds } from "@/attributes/layout/bounds";
import { PathCommand } from "@/render/descriptors/path";
import { Stroke, StrokeResolved } from "@/attributes/shape/stroke/mapper";
import { prepareFill } from "@/attributes/shape/fill/registry";
import { AssetTracker } from "@/assets/tracker";
import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import { lerpNumber } from "@/tween/lerp";
import { ViewportPattern } from "./viewport-pattern-node";
import { ShapeProps } from "./shape-node";
import { centered, dimStroke, GridAxis, gridLines, maxWeight } from "./grid-lines";

export interface GridPatternProps extends ShapeProps {
    /**
     * Spacing between adjacent grid cells, in world units. A single number is
     * used for both axes; a `{ x, y }` gives a different spacing per axis.
     * Defaults to 100.
     */
    cellSize: number | Vector2;
    /**
     * Number of finer cells each cell is split into. `1` (the default) draws no
     * minor lines; `2` adds one minor line per cell, and so on — same as
     * {@link LineGrid.subdivisions}.
     */
    subdivisions: number;
    /**
     * Stroke for the minor (subdivision) lines. When omitted but `stroke` is set
     * and `subdivisions > 1`, it defaults to the major `stroke` at half opacity.
     */
    subStroke?: Stroke;
    /**
     * Pixel offset that pans the whole grid relative to the world. The grid is
     * otherwise anchored to world coordinates, so it stays put as the camera
     * moves over it; animate `offset` to scroll the pattern itself.
     */
    offset: Vector2;
}

/**
 * An infinite line grid that fills the camera's visible region. Like
 * {@link LineGrid} it draws major/minor strokes, a fill behind them, and pans
 * with `offset` — but instead of being sized to a fixed rect it tiles a
 * world-anchored grid (spacing `cellSize`) across exactly what the parent
 * {@link Camera} can currently see, regenerated each frame. With no camera it
 * falls back to filling its own layout rect, so it works as a plain background.
 *
 * This replaces hand-sizing a huge `LineGrid` large enough to cover every place
 * the camera might pan or zoom to — the grid is always full, never reveals an
 * empty edge, and only generates the lines that are on screen.
 */
export class GridPattern extends ViewportPattern<GridPatternProps> {

    @property({ default: 100, tween: lerpCellSize })
    declare readonly cellSize: number | Vector2;
    @property({ default: 1 }) declare readonly subdivisions: number;
    // Asymmetric accessor like `ShapeNode.stroke`: reads yield `StrokeResolved[]`,
    // writes accept the loose `Stroke`. Runtime accessor installed by @property.
    @strokeProperty()
    get subStroke(): StrokeResolved[] { return undefined!; }
    set subStroke(_value: Stroke) { /* installed by @property */ }
    @property({ default: { x: 0, y: 0 }, tween: lerpVector2 })
    declare readonly offset: Vector2;

    /** The minor-line stroke, on top of the four slots `ShapeNode` declares. */
    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        const rect = this.layoutRect;
        const width = rect?.width ?? 0;
        const height = rect?.height ?? 0;
        for (const stroke of this.subStroke) {
            for (const fill of stroke.fill) prepareFill(fill, tracker, width, height);
        }
    }

    constructor(props: NodeConfig<GridPattern, GridPatternProps>) {
        super(props);

        // Match LineGrid: default the minor-line stroke to the major stroke at
        // half opacity when subdivisions actually draw minor lines.
        if (props.subStroke === undefined && props.stroke !== undefined && this.subdivisions > 1) {
            this.set({ subStroke: dimStroke(this.stroke as StrokeResolved[], 0.5) });
        }
    }

    protected renderPattern(draw: RenderContext, bounds: BoxBounds): void {
        const halfW = bounds.width / 2;
        const halfH = bounds.height / 2;
        // The clip (set by ViewportPattern) confines drawing to `bounds`; here we
        // draw in this node's local space, where bounds are centred on (x, y).
        // Descriptor coordinates are y-UP and the renderer flips them to canvas y
        // (see flip* in render-context). `visibleBounds()` already gives this
        // node's centre in y-up world space, so the fill rect's y and the y-axis
        // extents below are authored y-up and the renderer applies the single flip.
        const left = bounds.x - halfW;
        const right = bounds.x + halfW;
        const top = bounds.y - halfH;
        const bottom = bounds.y + halfH;

        // Fill paints across the whole visible region, behind the lines.
        draw.draw(new Graphics()
            .rect({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, start: this.start, end: this.end })
            .shadow(this.shadow)
            .fill(this.fill));

        const subdivisions = Math.max(1, Math.floor(this.subdivisions));
        const cell = this.cellSize;
        const cellX = Math.max(1e-3, typeof cell === "number" ? cell : cell.x);
        const cellY = Math.max(1e-3, typeof cell === "number" ? cell : cell.y);
        // Minor step is the cell divided by subdivisions; the tile at a multiple
        // of `subdivisions` is a major (cell) line.
        const stepX = cellX / subdivisions;
        const stepY = cellY / subdivisions;

        const major = centered(this.stroke as StrokeResolved[]);
        const minorStroke = centered(this.subStroke as StrokeResolved[]);
        const overscan = Math.max(maxWeight(major), maxWeight(minorStroke)) / 2;

        const xAxis: GridAxis = { min: left, max: right, step: stepX, offset: this.offset.x };
        const yAxis: GridAxis = { min: top, max: bottom, step: stepY, offset: this.offset.y };

        // Minor (subdivision) lines first so the major lines sit on top of them.
        if (subdivisions > 1 && minorStroke.length > 0) {
            this.drawGroup(draw, xAxis, yAxis, subdivisions, overscan, minorStroke, false);
        }
        // Major (division) lines on top.
        if (major.length > 0) {
            this.drawGroup(draw, xAxis, yAxis, subdivisions, overscan, major, true);
        }
    }

    // Draw one line group (major or minor). The grid is anchored to world
    // coordinates (lines at `n*step` about 0), so it stays fixed as the camera
    // pans — only `offset` scrolls the pattern. A solid stroke paints every line
    // as one union path (one draw). A dashed stroke instead draws each line on its
    // own with a `dashOffset` set to the line's world coordinate, so the dash
    // pattern is locked to world space: as new lines scroll into view they pick up
    // the phase their position would have had, and the dashes never crawl.
    private drawGroup(
        draw: RenderContext,
        xAxis: GridAxis,
        yAxis: GridAxis,
        subdivisions: number,
        overscan: number,
        stroke: StrokeResolved[],
        isMajor: boolean,
    ): void {
        // Each parallel line is one whole number of dash cycles long (the span is
        // snapped to `cycle`), so the renderer's per-path dash-fit is a no-op and
        // every line dashes identically.
        const cycle = dashCycle(stroke);
        const g = gridLines(xAxis, yAxis, subdivisions, overscan, cycle);
        const verticals = isMajor ? g.verticalMajor : g.verticalMinor;
        const horizontals = isMajor ? g.horizontalMajor : g.horizontalMinor;

        // Symmetric centerBounds → zero recentre offset, so the local-space line
        // coordinates draw verbatim.
        const centerBounds = [-1, -1, 1, 1] as const;

        if (cycle <= 0) {
            // Solid: one union path for the whole group.
            const data: PathCommand[] = [];
            for (const px of verticals) data.push({ type: "M", x: px, y: g.top }, { type: "L", x: px, y: g.bottom });
            for (const py of horizontals) data.push({ type: "M", x: g.left, y: py }, { type: "L", x: g.right, y: py });
            if (data.length > 0) draw.draw(new Graphics().path({ data, centerBounds }).stroke(stroke));
            return;
        }

        // Dashed: one path per line, with the dash phase anchored to the line's
        // world coordinate along its run (top for verticals, left for horizontals).
        for (const px of verticals) {
            const data: PathCommand[] = [{ type: "M", x: px, y: g.top }, { type: "L", x: px, y: g.bottom }];
            draw.draw(new Graphics().path({ data, centerBounds }).stroke(phaseShift(stroke, g.top)));
        }
        for (const py of horizontals) {
            const data: PathCommand[] = [{ type: "M", x: g.left, y: py }, { type: "L", x: g.right, y: py }];
            draw.draw(new Graphics().path({ data, centerBounds }).stroke(phaseShift(stroke, g.left)));
        }
    }
}

// Dash cycle (period) of a stroke array — the largest dash-array sum across its
// layers, or 0 when no layer is dashed. Used to decide solid vs per-line dashed
// drawing and to snap line spans to the dash lattice.
function dashCycle(strokes: StrokeResolved[]): number {
    let cycle = 0;
    for (const s of strokes) {
        if (s.dash && s.dash.length > 0) {
            const sum = s.dash.reduce((a, b) => a + b, 0);
            if (sum > cycle) cycle = sum;
        }
    }
    return cycle;
}

// Copy a stroke array, shifting each dashed layer's phase by `worldStart` (the
// line's start coordinate). Anchoring `dashOffset` to the world position makes
// the dash pattern continuous across all parallel lines and fixed as the camera
// pans. `dashOffset` advances the pattern, so we negate to align the "on" run to
// the same world phase a single infinite line would have.
function phaseShift(strokes: StrokeResolved[], worldStart: number): StrokeResolved[] {
    return strokes.map(s => (s.dash && s.dash.length > 0)
        ? { ...s, dashOffset: (s.dashOffset ?? 0) - worldStart }
        : s);
}

// Tween `cellSize`, which may be a uniform number or a per-axis `{ x, y }`.
// Numbers lerp directly; vectors lerp component-wise; a number↔vector tween
// promotes the number to a uniform vector first.
function lerpCellSize(from: number | Vector2, to: number | Vector2, t: number): number | Vector2 {
    if (typeof from === "number" && typeof to === "number") return lerpNumber(from, to, t);
    const a = typeof from === "number" ? { x: from, y: from } : from;
    const b = typeof to === "number" ? { x: to, y: to } : to;
    return lerpVector2(a, b, t);
}
