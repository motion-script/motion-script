import { Graphics } from "@/render/graphics";
import { nearPolyline, pointInPolygon } from "@/render/clip-contains";
import { StrokeResolved } from "@/attributes/shape/stroke/mapper";

import { Vector2 } from "@/attributes/layout/vector2";
import { ShapeNode, ShapeProps } from "./shape-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
import { BoxBounds } from "@/attributes/layout/bounds";
export interface LineProps extends ShapeProps {
    points: Vector2[];
    radius: number;
    closed: boolean;

}
export class Line extends ShapeNode<LineProps> {



    @property({ default: [] }) declare points: Vector2[];
    @property({ default: 0 }) declare radius: number;
    @property({ default: false }) declare closed: boolean;

    constructor(props: NodeConfig<Line, LineProps>) {
        super(props);
    }

    protected override shapeGraphics(): Graphics {
        return new Graphics().line({
            points: this.points,
            radius: this.radius,
            closed: this.closed,
            start: this.start,
            end: this.end,
        });
    }

    /**
     * A line is the one shape a box cannot describe. It declares no `clipSelf()`
     * **and** has no `measure()` override, so `points` never reach the layout
     * engine: the layout rect is whatever sizing hands it, with no relation to
     * where the line is drawn. Under the default `'fill'` it is the parent's whole
     * content box, so a box test would select the line from anywhere in that
     * parent; under `'hug'` there is nothing to hug and it collapses to 0×0, so a
     * box test would select it from nowhere at all.
     *
     * Test the polyline directly instead: distance to the nearest segment, within
     * `tolerance` plus half the stroke. That needs no layout size, which is
     * exactly why it is right in both cases.
     *
     * `radius` (vertex rounding) is ignored — it only pulls the path *inward* at
     * joints, so testing the un-rounded polyline over-estimates slightly, which
     * is the forgiving direction for a grab test.
     */
    /**
     * A line's ink is its `points`, which never reach the layout engine — so the
     * layout rect describes it in neither size nor position. Left alone, an editor
     * selecting a line gets its parent's whole box (the default `'fill'`) or a
     * degenerate point (`'hug'`), and in both cases a box that is nowhere near the
     * line.
     *
     * Report the points' own extent instead, grown by half the stroke so the box
     * contains the drawn ink and an axis-aligned line still has thickness. That
     * growth is *conservative*: it is applied on all four sides, while a diagonal
     * stroke with butt caps only spreads perpendicular to itself, so the box can
     * overshoot by up to half the weight on each axis. Over-covering is the safe
     * direction — the failure that matters is ink sitting outside the gizmo — and
     * the exact hull would have to fold in caps, joins and the miter limit. The
     * grab region is unaffected: {@link hitTestSelf} below measures the real
     * distance to each segment. The
     * result is deliberately **off-centre** when the points are: `points: [(0,0),
     * (100,40)]` draws from the node's centre up and to the right, so its box is
     * centred at `(50, 20)`, not on the node. That is exactly what a `measure()`
     * override could not express — and why this is a separate seam.
     */
    override _localBounds(): BoxBounds {
        const reach = maxStrokeWeight(this.stroke as StrokeResolved[]) / 2;
        return pointsBounds(this.points, reach) ?? super._localBounds();
    }

    protected override hitTestSelf(local: Vector2, tolerance: number): boolean {
        const pts = this.points;
        if (pts.length === 0) return false;
        const reach = tolerance + maxStrokeWeight(this.stroke as StrokeResolved[]) / 2;
        if (pts.length === 1) return Math.hypot(local.x - pts[0].x, local.y - pts[0].y) <= reach;
        // A closed line encloses a fillable region, so a click inside it counts —
        // matching what the fill actually paints.
        if (this.closed && pts.length >= 3 && pointInPolygon(local, pts)) return true;
        return nearPolyline(local, pts, this.closed, reach);
    }
}

/**
 * Axis-aligned extent of `points`, grown by half the widest stroke so the box
 * contains the ink rather than just the centreline. Returns `null` for a line
 * with nothing to draw.
 */
function pointsBounds(pts: readonly Vector2[], reach: number): BoxBounds | null {
    if (pts.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        width: maxX - minX + reach * 2,
        height: maxY - minY + reach * 2,
    };
}

/** Widest stroke layer, so the grab band matches the thickest thing drawn. */
function maxStrokeWeight(strokes: readonly StrokeResolved[]): number {
    let max = 0;
    for (const s of strokes) if (s.weight > max) max = s.weight;
    return max;
}

// Its silhouette and paint are a pure function of its own props, so the
// composed drawing can be reused between frames. Registered by exact class:
// a subclass overriding `shapeGraphics` may read anything at all, and must
// opt in for itself. See `ShapeNode.MEMOIZABLE`.
ShapeNode.memoizeDrawing(Line);
