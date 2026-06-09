import type { RectState } from "./descriptors/rect";
import type { EllipseState } from "./descriptors/ellipse";
import type { PathState } from "./descriptors/path";
import type { LineState } from "./descriptors/line";
import type { PolygonState } from "./descriptors/polygon";
import type { PolygramState } from "./descriptors/polygram";
import type { TextState } from "./descriptors/text";
import type { RichTextState } from "./descriptors/richtext";
import type { ImageState } from "./descriptors/image";
import type { ShapeState } from "./descriptors/shape";
import { PathBuilder } from "./descriptors/path-builder";
import type { FillProp } from "@/attributes/shape/fill/union";
import type { StrokeProp } from "@/attributes/shape/stroke/mapper";
import type { ShadowProp } from "@/attributes/shape/shadow/resolver";
import type { SceneEffect } from "@/attributes/shape/effects/union";
import type { MaskOptions } from "@/attributes/mask/mask";

/**
 * The kinds of shape ops a {@link Graphics} can record. Each carries the partial
 * descriptor state for that shape, exactly as the old per-shape context methods
 * accepted.
 */
export type GraphicsShapeOp =
    | { kind: "rect"; state: Partial<RectState> }
    | { kind: "ellipse"; state: Partial<EllipseState> }
    | { kind: "path"; state: Partial<PathState> }
    | { kind: "line"; state: Partial<LineState> }
    | { kind: "polygon"; state: Partial<PolygonState> }
    | { kind: "polygram"; state: Partial<PolygramState> }
    | { kind: "text"; state: Partial<TextState> }
    | { kind: "richText"; state: Partial<RichTextState> }
    | { kind: "image"; state: Partial<ImageState> };

/**
 * A single recorded operation in a {@link Graphics} command list. Shape ops
 * declare geometry; paint ops (fill/stroke/shadow) apply to the accumulated
 * shapes; cut/mask ops composite. The renderer replays this list in order via
 * `RenderContext.draw()`.
 */
export type GraphicsOp =
    | GraphicsShapeOp
    | { kind: "fill"; fills: FillProp | FillProp[] }
    | { kind: "stroke"; strokes: StrokeProp | StrokeProp[] }
    | { kind: "shadow"; shadows: ShadowProp | ShadowProp[] }
    | { kind: "cut" }
    | { kind: "mask"; options?: MaskOptions }
    | { kind: "applyMask" }
    | { kind: "endMask" };

const SHAPE_KINDS = new Set<GraphicsOp["kind"]>([
    "rect", "ellipse", "path", "line", "polygon", "polygram", "text", "richText", "image",
]);

/**
 * A renderer-agnostic, chainable shape/paint builder.
 *
 * `Graphics` records a sequence of shape declarations and paint/compositing
 * operations without touching any renderer. A built `Graphics` is handed to a
 * `RenderContext` via `ctx.draw(graphics)`, which replays the recorded ops
 * against its concrete drawing backend.
 *
 *   const g = new Graphics()
 *       .ellipse({ width: 100, height: 100 })
 *       .rect({ width: 40, height: 40 }).rotation(30)
 *       .fill(Fill.color("red"))
 *       .stroke({ weight: 2, fill: "black" });
 *   ctx.draw(g);
 *
 * Multiple shapes chained before a paint call are combined into a single surface
 * and painted together (one gradient maps across all of them). `cut()` uses the
 * most-recently declared shape as a cutter against the shapes before it. The
 * `mask()/applyMask()/endMask()` ops support an inline mask scope within a single
 * `draw()`.
 *
 * `rotation()` is a per-shape modifier: it attaches to the most-recently declared
 * shape by merging into its descriptor state (every shape state extends
 * `TransformState`). `opacity()` and `effects()` are *graphics-level*: they
 * composite the entire drawn result (all shapes together) into one layer with the
 * given alpha and image filter, exactly like a node-level transform — so a
 * trailing `.opacity(0.4)` dims the whole group, not just the last shape.
 */
export class Graphics {
    private _ops: GraphicsOp[] = [];
    private _opacity: number = 1;
    private _effects: SceneEffect[] = [];

    // ─── Shapes ──────────────────────────────────────────────────────────────

    rect(state: Partial<RectState>): this {
        this._ops.push({ kind: "rect", state });
        return this;
    }

    ellipse(state: Partial<EllipseState>): this {
        this._ops.push({ kind: "ellipse", state });
        return this;
    }

    /** Declare a vector path, either from a `PathState` or a `PathBuilder`. */
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

    text(state: Partial<TextState>): this {
        this._ops.push({ kind: "text", state });
        return this;
    }

    richText(state: Partial<RichTextState>): this {
        this._ops.push({ kind: "richText", state });
        return this;
    }

    image(state: Partial<ImageState>): this {
        this._ops.push({ kind: "image", state });
        return this;
    }

    // ─── Paint ───────────────────────────────────────────────────────────────

    fill(fills: FillProp | FillProp[]): this {
        this._ops.push({ kind: "fill", fills });
        return this;
    }

    stroke(strokes: StrokeProp | StrokeProp[]): this {
        this._ops.push({ kind: "stroke", strokes });
        return this;
    }

    shadow(shadows: ShadowProp | ShadowProp[]): this {
        this._ops.push({ kind: "shadow", shadows });
        return this;
    }

    // ─── Compositing ─────────────────────────────────────────────────────────

    /**
     * Use the last-declared shape as a cutter: union the shapes before it and
     * subtract that last shape, leaving the result as the current surface so
     * subsequent shapes and paint calls treat everything as one.
     */
    cut(): this {
        this._ops.push({ kind: "cut" });
        return this;
    }

    /**
     * Open an inline mask scope. Shapes declared after this (until `applyMask()`)
     * are the mask; shapes after `applyMask()` are the content. Close with
     * `endMask()`.
     */
    mask(options?: MaskOptions): this {
        this._ops.push({ kind: "mask", options });
        return this;
    }

    applyMask(): this {
        this._ops.push({ kind: "applyMask" });
        return this;
    }

    endMask(): this {
        this._ops.push({ kind: "endMask" });
        return this;
    }

    // ─── Modifiers ───────────────────────────────────────────────────────────

    /**
     * Set the opacity of the whole graphics group (0–1). The entire drawn result
     * is composited into one layer at this alpha, so overlapping shapes don't
     * double up. Applies to everything in the list, not just the last shape.
     */
    opacity(opacity: number): this {
        this._opacity = opacity;
        return this;
    }

    /**
     * Set image effects (blur, etc.) applied to the whole graphics group. The
     * entire drawn result is composited through the composed filter as one layer.
     */
    effects(effects: SceneEffect[]): this {
        this._effects = effects;
        return this;
    }

    /** Set the most-recently declared shape's rotation (degrees). Per-shape. */
    rotation(rotation: number): this {
        return this._mergeIntoLastShape({ rotation });
    }

    private _mergeIntoLastShape(patch: Partial<ShapeState>): this {
        for (let i = this._ops.length - 1; i >= 0; i--) {
            const op = this._ops[i];
            if (SHAPE_KINDS.has(op.kind)) {
                const shapeOp = op as GraphicsShapeOp;
                shapeOp.state = { ...shapeOp.state, ...patch } as GraphicsShapeOp["state"];
                return this;
            }
        }
        // No shape recorded yet — no-op, matching the renderer's defensive style.
        return this;
    }

    // ─── Consumption ─────────────────────────────────────────────────────────

    /** The recorded ops, in order. Consumed by `RenderContext.draw()`. */
    ops(): readonly GraphicsOp[] {
        return this._ops;
    }

    /** Graphics-level opacity (0–1) for the whole group. Default 1. */
    groupOpacity(): number {
        return this._opacity;
    }

    /** Graphics-level effects applied to the whole group. Default empty. */
    groupEffects(): readonly SceneEffect[] {
        return this._effects;
    }

    /** True when the group needs a composited layer (opacity < 1 or any effect). */
    needsGroupLayer(): boolean {
        return this._opacity < 1 || this._effects.length > 0;
    }

    /** True when this Graphics has no shape ops (only paint/compositing) — used by
     * renderers to paint an externally-prepared surface (e.g. a boolean result)
     * without resetting their shape accumulator. */
    isPaintOnly(): boolean {
        return !this._ops.some((op) => SHAPE_KINDS.has(op.kind));
    }
}
