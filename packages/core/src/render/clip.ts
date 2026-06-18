import type { RectState } from "./descriptors/rect";
import type { EllipseState } from "./descriptors/ellipse";
import type { PathState } from "./descriptors/path";
import type { LineState } from "./descriptors/line";
import type { PolygonState } from "./descriptors/polygon";
import type { PolygramState } from "./descriptors/polygram";
import { PathBuilder } from "./descriptors/path-builder";

/**
 * The shape ops a {@link Clip} can record — the same geometry primitives a
 * {@link Graphics} can draw, minus text/image (which have no clippable outline).
 * Each carries the partial descriptor state for that shape.
 */
export type ClipShapeOp =
    | { kind: "rect"; state: Partial<RectState> }
    | { kind: "ellipse"; state: Partial<EllipseState> }
    | { kind: "path"; state: Partial<PathState> }
    | { kind: "line"; state: Partial<LineState> }
    | { kind: "polygon"; state: Partial<PolygonState> }
    | { kind: "polygram"; state: Partial<PolygramState> };

/**
 * A single recorded op in a {@link Clip}. Shape ops add geometry to the clip
 * region; `cut` subtracts the last-declared shape from the ones before it. The
 * renderer replays this list into a single clip path via
 * `RenderContext.beginClip()`.
 */
export type ClipOp = ClipShapeOp | { kind: "cut" };

/**
 * A renderer-agnostic, chainable clip-region builder — `Graphics` for clipping.
 *
 * `Clip` records a sequence of shape declarations (and optional `cut()`s) that
 * the renderer unions into a single clip path. Multiple shapes combine, so a
 * clip can be any compound silhouette, not just a single rect or ellipse:
 *
 *   const c = new Clip()
 *       .rect({ width: 200, height: 120, cornerRadius: 16 })
 *       .ellipse({ x: 80, width: 60, height: 60 })   // unions with the rect
 *       .ellipse({ x: -80, width: 40, height: 40 })
 *       .cut();                                        // punches the last hole
 *   ctx.beginClip(c);
 *   ...draw clipped content...
 *   ctx.endClip();
 *
 * A `Clip` carries no paint — it's purely the outline. It's what a `ShapeNode`
 * returns from `clipSelf()` to describe both its `clip` boundary and the
 * silhouette its backdrop effects (blur, magnify, …) are confined to, so a
 * single definition drives every clip the node needs.
 */
export class Clip {
    private _ops: ClipOp[] = [];

    // ─── Shapes ──────────────────────────────────────────────────────────────

    rect(state: Partial<RectState>): this {
        this._ops.push({ kind: "rect", state });
        return this;
    }

    ellipse(state: Partial<EllipseState>): this {
        this._ops.push({ kind: "ellipse", state });
        return this;
    }

    /** Add a vector path to the clip region, from a `PathState` or a `PathBuilder`. */
    path(state: Partial<PathState> | PathBuilder): this {
        const resolved = state instanceof PathBuilder ? state.toPathState() : state;
        this._ops.push({ kind: "path", state: resolved });
        return this;
    }

    line(state: Partial<LineState>): this {
        this._ops.push({ kind: "line", state });
        return this;
    }

    polygon(state: Partial<PolygonState>): this {
        this._ops.push({ kind: "polygon", state });
        return this;
    }

    polygram(state: Partial<PolygramState>): this {
        this._ops.push({ kind: "polygram", state });
        return this;
    }

    // ─── Compositing ─────────────────────────────────────────────────────────

    /**
     * Use the last-declared shape as a cutter: union the shapes before it and
     * subtract that last shape, punching a hole in the clip region. Mirrors
     * {@link Graphics.cut}.
     */
    cut(): this {
        this._ops.push({ kind: "cut" });
        return this;
    }

    // ─── Consumption ─────────────────────────────────────────────────────────

    /** The recorded ops, in order. Consumed by `RenderContext.beginClip()`. */
    ops(): readonly ClipOp[] {
        return this._ops;
    }

    /** True when no shape op has been recorded — the clip region is empty. */
    isEmpty(): boolean {
        return !this._ops.some((op) => op.kind !== "cut");
    }
}
