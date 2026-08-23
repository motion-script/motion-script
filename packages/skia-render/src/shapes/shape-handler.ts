import type { CanvasKit, Canvas, Paint, Path as CKPath, TypefaceFontProvider } from "@motion-script/canvaskit";
import {
    BooleanOperation,
    EllipseState,
    LineState,
    MaskApplyLayer,
    MaskOptions,
    PathState,
    PolygonState,
    PolygramState,
    RectState,
    ShadowResolved,
    TextState,
} from "@motion-script/core";
import { RectShape } from "./rect";
import { EllipseShape } from "./ellipse";
import { PathShape } from "./path";
import { LineShape } from "./line";
import { buildText } from "./text";
import { ParagraphShapeCache } from "./paragraph-cache";
import { PolygonShape } from "./polygon";
import { PolygramShape } from "./polygram";
import { BaseShape } from "./base";
import { BooleanHandler } from "./boolean";
import { MaskHandler } from "./mask";

/**
 * A drawable produced by any shape kind (path-backed or text). `ckPath` is
 * absent for text (canvaskit-wasm exposes no glyph paths) and optional
 * `bounds`/`isText` let fills/strokes/bounds logic special-case those shapes.
 */
export interface CurrentShape {
    draw: (paint: Paint) => void;
    // Draw used by the stroke pass's centered fallback. Equals `draw` for closed
    // shapes; for freeform paths it draws an *open* copy so a stroke never paints
    // the closing edge. Always present (defaults to `draw`'s behavior).
    strokeDraw?: (paint: Paint) => void;
    ckPath?: CKPath;
    // The path the stroke pass should stroke. Equals `ckPath` for closed shapes;
    // for a freeform Path it's an open copy (trailing close removed) so the stroke
    // omits the closing chord while the fill keeps using the closed `ckPath`.
    strokePath?: CKPath;
    // True when this shape is start/end-trimmed (its contour may be open). Lets
    // the stroke-union path avoid a boolean union (a closed-region op that breaks
    // on open/animated contours) and concatenate contours instead.
    trimmed?: boolean;
    // A closed clip region for aligned (inside/outside) strokes when `ckPath` is
    // an open contour (e.g. an ellipse arc). Lets the stroke handler offset the
    // band radially even though the stroked curve bounds no region itself.
    // Absent when the shape's ckPath is already closed or defines no interior.
    // Owned by the shape — the stroke handler must not delete it.
    alignInterior?: CKPath;
    bounds?: { left: number; top: number; right: number; bottom: number };
    // Text shapes have no ckPath (canvaskit-wasm doesn't expose glyph paths),
    // and want strokes that follow the union of glyph silhouettes — see
    // StrokeHandler.drawTextUnionStroke.
    isText?: boolean;
    // A copy of the silhouette grown (positive) or shrunk (negative) by `spread`
    // px, for shadow spread. Only ellipses and rectangles can resize their
    // geometry cleanly, so this is absent for every other shape kind. Returns
    // null when the shrink would collapse the shape. The caller owns the path
    // and must delete() it.
    spreadPath?: (spread: number) => CKPath | null;
}

// Leaf equality for a shape descriptor's input-state values. Most fields are
// primitives (compared by `===`), but a shape's raw input state also carries a
// few small object-valued fields that are *freshly allocated every frame* by the
// renderer's y-flip helpers — `pivot` ({x,y}), `points` (Vector2[]), and per-
// corner `cornerRadius`/`cornerStyle` records. A plain `!==` on those always sees
// distinct references, so an animated Graphics2D whose shapes carry any of them
// would miss the cross-frame shape cache on every frame (rebuilding its wasm path
// each frame even though the geometry is identical). This comparator restores the
// hit by comparing those known small structures by value.
//
// Deliberately narrow and fail-closed: it only relaxes `!==` for the exact
// shapes enumerated below, with primitive (`===`) leaf equality; any other
// non-identical, non-matching value returns false and is treated as changed. So
// it can never report genuinely different states as equal (no stale-geometry
// false hits) — it only adds cache hits that were being needlessly missed.
export function valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

    // {x, y} — a pivot / anchor point.
    if ("x" in a && "y" in a && "x" in b && "y" in b) {
        const pa = a as { x: unknown; y: unknown };
        const pb = b as { x: unknown; y: unknown };
        return pa.x === pb.x && pa.y === pb.y;
    }

    // Vector2[] — a line's points. Element-wise, each element a primitive or {x,y}.
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!valuesEqual(a[i], b[i])) return false;
        }
        return true;
    }

    // Per-corner record — cornerRadius / cornerStyle. Each corner is a number or
    // string (or a small object), so recurse to keep the comparison value-based.
    const CORNER_KEYS = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;
    if (CORNER_KEYS.every(k => k in a) && CORNER_KEYS.every(k => k in b)) {
        for (const k of CORNER_KEYS) {
            if (!valuesEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
        }
        return true;
    }

    return false;
}

// Shallow equality check for plain state objects. Leaf values compare via
// `valuesEqual`, which handles primitives plus the small object-valued fields
// (pivot / points / per-corner records) that are reallocated each frame.
export function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    const keysA = Object.keys(a);
    if (keysA.length !== Object.keys(b).length) return false;
    for (const k of keysA) {
        if (!valuesEqual(a[k], b[k])) return false;
    }
    return true;
}

function shallowEqualExcluding(a: Record<string, unknown>, b: Record<string, unknown>, ...exclude: string[]): boolean {
    const excSet = new Set(exclude);
    const keysA = Object.keys(a).filter(k => !excSet.has(k));
    const keysB = Object.keys(b).filter(k => !excSet.has(k));
    if (keysA.length !== keysB.length) return false;
    for (const k of keysA) {
        if (!valuesEqual(a[k], b[k])) return false;
    }
    return true;
}

interface ShapeEntry {
    shape: BaseShape<unknown>;
    // Last trim range used, so we can detect trim-only changes.
    trimStart: number;
    trimEnd: number;
}

/**
 * Per-frame collector and compositor for a node's shapes. Accumulates path
 * primitives and text, resolves bounds for fill/stroke shaders, supports
 * cut/boolean/mask compositing that collapse `shapes` into a single drawable,
 * and caches `BaseShape` instances across frames (keyed by node id + index)
 * so `ckPath`s survive when input state is unchanged or only trim moved.
 */
/** The outer node's in-flight accumulation, parked by {@link ShapeHandler.beginNested}. */
export interface NestedShapeFrame {
    nodeId: string;
    shapeIndex: number;
    shapes: CurrentShape[];
    paintApplied: boolean;
    pendingShadows: ShadowResolved[] | null;
    transientPaths: Set<CKPath>;
}

export class ShapeHandler {
    shapes: CurrentShape[] = [];
    paintApplied: boolean = false;
    private pendingShadows: ShadowResolved[] | null = null;

    private boolean: BooleanHandler;
    private mask: MaskHandler;
    // Bounds override stack. Callers like the image-node renderer push their
    // own rect so fills that depend on shape bounds (gradients, image-shaders)
    // resolve correctly even though no path lives in `shapes`.
    private boundsOverride: Array<{ left: number; top: number; right: number; bottom: number }> = [];

    // Shape instance cache: survives reset() so ckPaths persist across frames.
    // Key format: "<nodeId>:<shapeIndex>"
    private shapeCache: Map<string, ShapeEntry> = new Map();
    private currentNodeId: string = "";
    private shapeIndex: number = 0;
    // Cached union bounds for the current shape set, cleared when shapes change.
    private _cachedBounds: { left: number; top: number; right: number; bottom: number } | null = null;
    private _boundsDirty: boolean = true;
    // Paths this handler synthesised itself (e.g. cut() results) rather than
    // cache-owned shape paths. These are ours to free at reset()/cut() — cached
    // shape paths must not be deleted here or the cross-frame cache would dangle.
    private transientPaths: Set<CKPath> = new Set();

    // Measurement scope: while active, addShape() bypasses the cross-frame cache
    // and tracks every built shape so endMeasure() can free their paths without
    // touching the real accumulation. Used to size the union for graphics-level
    // rotation/scale before the actual paint pass runs.
    private _measuring: boolean = false;
    private _measureShapes: BaseShape<unknown>[] = [];
    private _savedNodeId: string = "";
    private _savedShapeIndex: number = 0;

    constructor(
        private canvasKit: CanvasKit,
        private getCanvas: () => Canvas,
        private getPaint: () => Paint,
        private fontMgr: TypefaceFontProvider,
        private paragraphCache: ParagraphShapeCache,
        private getFontEpoch: () => number,
    ) {
        this.boolean = new BooleanHandler(canvasKit, getCanvas);
        this.mask = new MaskHandler(canvasKit, getCanvas, this.boolean);
    }

    beginNode(nodeId: string): void {
        this.currentNodeId = nodeId;
        this.shapeIndex = 0;
    }

    reset(): void {
        // Free any synthesised paths still around (e.g. a cut() result that was
        // painted this frame). Cache-owned shape paths are left for the cache.
        for (const path of this.transientPaths) path.delete();
        this.transientPaths.clear();
        this.shapes = [];
        this.paintApplied = false;
        this.pendingShadows = null;
        this._boundsDirty = true;
        this._cachedBounds = null;
    }

    storePendingShadows(shadows: ShadowResolved[]): void {
        this.pendingShadows = shadows.length > 0 ? shadows : null;
    }

    takePendingShadows(): ShadowResolved[] | null {
        const s = this.pendingShadows;
        this.pendingShadows = null;
        return s;
    }

    dispose(): void {
        this.shapes = [];
        for (const path of this.transientPaths) path.delete();
        this.transientPaths.clear();
        for (const entry of this.shapeCache.values()) {
            entry.shape.deletePaths();
        }
        this.shapeCache.clear();
        this.boolean.dispose();
        this.mask.dispose();
    }

    isCollectingPaths(): boolean {
        return this.boolean.isCollecting();
    }

    pushBounds(b: { left: number; top: number; right: number; bottom: number }): void {
        this.boundsOverride.push(b);
    }

    popBounds(): void {
        this.boundsOverride.pop();
    }

    getShapeBounds(): { left: number; top: number; right: number; bottom: number } | null {
        if (this.boundsOverride.length > 0) {
            return this.boundsOverride[this.boundsOverride.length - 1];
        }
        if (!this._boundsDirty && this._cachedBounds !== null) {
            return this._cachedBounds;
        }
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (const shape of this.shapes) {
            if (shape.ckPath) {
                const b = shape.ckPath.getBounds();
                if (b[0] < left)   left   = b[0];
                if (b[1] < top)    top    = b[1];
                if (b[2] > right)  right  = b[2];
                if (b[3] > bottom) bottom = b[3];
            } else if (shape.bounds) {
                if (shape.bounds.left   < left)   left   = shape.bounds.left;
                if (shape.bounds.top    < top)    top    = shape.bounds.top;
                if (shape.bounds.right  > right)  right  = shape.bounds.right;
                if (shape.bounds.bottom > bottom) bottom = shape.bounds.bottom;
            }
        }
        this._boundsDirty = false;
        this._cachedBounds = isFinite(left) ? { left, top, right, bottom } : null;
        return this._cachedBounds;
    }

    private addShape(newShape: BaseShape<unknown>): void {
        this._boundsDirty = true;
        const isolated = !this.boolean.isCollecting();

        // Try to reuse a cached shape if we have a stable node ID.
        let shape = newShape;
        if (this.currentNodeId) {
            const key = `${this.currentNodeId}:${this.shapeIndex++}`;
            const entry = this.shapeCache.get(key);
            if (entry) {
                const cached = entry.shape;
                const newState = newShape.inputState as Record<string, unknown>;
                const oldState = cached.inputState as Record<string, unknown>;
                if (shallowEqual(newState, oldState)) {
                    // Exact match — reuse the cached shape (with its ckPath intact).
                    shape = cached;
                } else if (cached.hasTrim() && newShape.hasTrim()
                    && shallowEqualExcluding(newState, oldState, 'start', 'end')) {
                    // Only trim range changed — re-trim from the cached base path.
                    const { start, end } = newShape.trimRange();
                    if (entry.trimStart !== start || entry.trimEnd !== end) {
                        cached.retrim(start, end);
                        entry.trimStart = start;
                        entry.trimEnd = end;
                    }
                    cached.inputState = newShape.inputState;
                    shape = cached;
                } else {
                    // State mismatch — evict old entry and use new shape.
                    cached.deletePaths();
                    const tr = newShape.hasTrim() ? newShape.trimRange() : { start: 0, end: 1 };
                    this.shapeCache.set(key, { shape: newShape, trimStart: tr.start, trimEnd: tr.end });
                    shape = newShape;
                }
            } else {
                const tr = newShape.hasTrim() ? newShape.trimRange() : { start: 0, end: 1 };
                this.shapeCache.set(key, { shape: newShape, trimStart: tr.start, trimEnd: tr.end });
            }
        }

        // Build the path eagerly (not just for boolean groups) so the fill's
        // shader matrix reads the shape's true ckPath bounds on the very first
        // paint. Without this, an isolated shape has no ckPath until it draws —
        // which happens *after* the fill resolves its bounds — so getShapeBounds()
        // falls back to computeBounds() (the inscribing-ellipse box for
        // polygon/polygram), zooming the image fill for one frame after a state
        // reset. ensurePath() is idempotent and the path is built on draw anyway.
        shape.ensurePath();
        // During a measurement scope the cache is bypassed (currentNodeId is
        // cleared), so every built shape is ours to free at endMeasure().
        if (this._measuring) this._measureShapes.push(shape);
        if (!isolated && shape.ckPath) {
            this.boolean.contributeToPathCollection(shape.ckPath);
        }
        this.shapes.push(shape.toCurrentShape(isolated));
    }

    rect(state: Partial<RectState>): void {
        this.addShape(new RectShape(this.canvasKit, this.getCanvas, state));
    }

    ellipse(state: Partial<EllipseState>): void {
        this.addShape(new EllipseShape(this.canvasKit, this.getCanvas, state));
    }

    path(state: Partial<PathState>): void {
        this.addShape(new PathShape(this.canvasKit, this.getCanvas, state));
    }

    line(state: Partial<LineState>): void {
        this.addShape(new LineShape(this.canvasKit, this.getCanvas, state));
    }

    polygon(state: Partial<PolygonState>): void {
        this.addShape(new PolygonShape(this.canvasKit, this.getCanvas, state));
    }

    polygram(state: Partial<PolygramState>): void {
        this.addShape(new PolygramShape(this.canvasKit, this.getCanvas, state));
    }

    text(state: Partial<TextState>): void {
        this._boundsDirty = true;
        const shape = buildText(
            this.canvasKit, this.getCanvas(), this.fontMgr, state,
            this.paragraphCache, this.getFontEpoch(),
        );
        this.shapes.push(shape);
    }

    // ─── Cut ───────────────────────────────────────────────────────────────────

    // Use the most-recently drawn shape as a cutter: union all the shapes before
    // it, then subtract that last shape, so only it punches a hole. The combined
    // path replaces `shapes`, so anything drawn afterward stacks onto it and the
    // whole thing paints as one surface — a single gradient resolves across all
    // of it. Shapes without a ckPath (text) are skipped.
    cut(): void {
        const withPaths = this.shapes.filter(s => s.ckPath);
        if (withPaths.length === 0) return;

        // The last shape is the cutter; everything before it is the base.
        const cutter = withPaths[withPaths.length - 1].ckPath!.copy();
        const baseShapes = withPaths.slice(0, -1);

        let combined: CKPath | null;
        if (baseShapes.length === 0) {
            // Nothing to cut from — the lone shape stays as-is.
            cutter.delete();
            combined = withPaths[0].ckPath!.copy();
        } else {
            const base = this.boolean.combinePaths(
                baseShapes.map(s => s.ckPath!.copy()),
                "union",
            );
            if (!base) {
                cutter.delete();
                combined = null;
            } else {
                combined = this.boolean.combinePaths([base, cutter], "subtract");
            }
        }

        // The base/cutter we passed in were copies, which combinePaths already
        // consumed. The originals in `this.shapes` are mostly cache-owned (built
        // via addShape and reused across frames), so deleting them here would
        // dangle the cache. Only paths *this handler* synthesised — e.g. a
        // previous cut()'s result — are ours to free; drop just those.
        for (const shape of this.shapes) {
            if (shape.ckPath && this.transientPaths.has(shape.ckPath)) {
                shape.ckPath.delete();
                this.transientPaths.delete(shape.ckPath);
            }
        }
        this.shapes = [];
        this.paintApplied = false;
        if (!combined) return;

        this.transientPaths.add(combined);
        const canvas = this.getCanvas();
        this.shapes.push({
            draw: (paint: Paint) => { canvas.drawPath(combined, paint); },
            ckPath: combined,
        });
    }

    // ─── Measurement scope ─────────────────────────────────────────────────────

    // Open a throwaway accumulation that builds shapes purely to size them (e.g.
    // the union bbox for a graphics-level rotate/scale pivot). The cross-frame
    // cache is suspended for its duration so the subsequent real paint pass keys
    // its shapes from index 0 exactly as if no measurement ran. Pair with
    // endMeasure(), which frees the measured paths and restores the cache state.
    beginMeasure(): void {
        this._savedNodeId = this.currentNodeId;
        this._savedShapeIndex = this.shapeIndex;
        this.currentNodeId = "";
        this._measuring = true;
        this._measureShapes = [];
        this.shapes = [];
    }

    endMeasure(): void {
        for (const shape of this._measureShapes) shape.deletePaths();
        this._measureShapes = [];
        this._measuring = false;
        this.currentNodeId = this._savedNodeId;
        this.shapeIndex = this._savedShapeIndex;
        this.shapes = [];
        this._boundsDirty = true;
        this._cachedBounds = null;
    }

    // ─── Nested render scope ───────────────────────────────────────────────────

    // Open a nested render of a *different* node subtree in the middle of this
    // node's draw (a Surface2D rasterized offscreen by its Canvas3D parent).
    //
    // Unlike beginMeasure() the cross-frame cache stays **live**: the nested nodes
    // have real, stable ids of their own, so their shapes should be cached exactly
    // as they would be on the canvas. What has to be saved is the *outer* node's
    // in-flight accumulation — begin()/end() set `currentNodeId`/`shapeIndex` on
    // the way in but never restore them on the way out, so without this the outer
    // node would resume keying its shapes as the last nested child.
    beginNested(): NestedShapeFrame {
        const frame: NestedShapeFrame = {
            nodeId: this.currentNodeId,
            shapeIndex: this.shapeIndex,
            shapes: this.shapes,
            paintApplied: this.paintApplied,
            pendingShadows: this.pendingShadows,
            transientPaths: this.transientPaths,
        };
        this.shapes = [];
        this.paintApplied = false;
        this.pendingShadows = null;
        // A fresh set, because the nested subtree's begin() calls reset(), which
        // *deletes* everything in it — that would dangle any synthesised path the
        // parked `shapes` still points at.
        this.transientPaths = new Set();
        this._boundsDirty = true;
        this._cachedBounds = null;
        return frame;
    }

    endNested(frame: NestedShapeFrame): void {
        for (const path of this.transientPaths) path.delete();
        this.currentNodeId = frame.nodeId;
        this.shapeIndex = frame.shapeIndex;
        this.shapes = frame.shapes;
        this.paintApplied = frame.paintApplied;
        this.pendingShadows = frame.pendingShadows;
        this.transientPaths = frame.transientPaths;
        this._boundsDirty = true;
        this._cachedBounds = null;
    }

    // Measure the union bounding box of the current accumulated path shapes,
    // independent of the bounds-override stack getShapeBounds() consults. Returns
    // null when no path-backed shape is present (e.g. only text). Used by the
    // graphics-level rotation/scale to pick a default pivot (the union centre)
    // without disturbing fill-space bounds overrides.
    measureUnionBounds(): { left: number; top: number; right: number; bottom: number } | null {
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (const shape of this.shapes) {
            if (shape.ckPath) {
                const b = shape.ckPath.getBounds();
                if (b[0] < left)   left   = b[0];
                if (b[1] < top)    top    = b[1];
                if (b[2] > right)  right  = b[2];
                if (b[3] > bottom) bottom = b[3];
            } else if (shape.bounds) {
                if (shape.bounds.left   < left)   left   = shape.bounds.left;
                if (shape.bounds.top    < top)    top    = shape.bounds.top;
                if (shape.bounds.right  > right)  right  = shape.bounds.right;
                if (shape.bounds.bottom > bottom) bottom = shape.bounds.bottom;
            }
        }
        return isFinite(left) ? { left, top, right, bottom } : null;
    }

    // Build a single shape from the union of all accumulated path shapes, so a
    // stroke follows only the outer boundary with no seams where shapes overlap.
    // Returns null when there are fewer than two path shapes (caller strokes the
    // shapes directly) or text is involved (no path to union). The caller owns
    // the returned shape's ckPath and must delete() it. Does not mutate `shapes`.
    //
    // `ckPath` is the *closed* boolean union (used as the align-clip interior and
    // for bounds). `strokePath`/`strokeDraw` expose a separate stroke contour:
    // the per-shape *open* stroke paths concatenated (not boolean-unioned, which
    // is ill-defined on open contours), so a stroked freeform Path never draws
    // its closing chord even when its node accumulates a fill + stroke pair.
    unionStrokeShape(): CurrentShape | null {
        if (this.shapes.some(s => s.isText)) return null;
        const withPaths = this.shapes.filter(s => s.ckPath);
        if (withPaths.length < 2) return null;

        const combined = this.boolean.combinePaths(
            withPaths.map(s => s.ckPath!.copy()),
            "union",
        );
        if (!combined) return null;

        // The stroke contour. A boolean union (`combined`) hides seams between
        // overlapping *closed* fills, but it is a closed-region op: applied to an
        // open or trimmed contour it changes topology discontinuously frame to
        // frame (the start/end-tween "jumps"). So whenever any shape is open
        // (a freeform path's open stroke variant) or trimmed, stroke a plain
        // concatenation of the per-shape stroke contours (`strokePath ?? ckPath`)
        // instead — `addPath` preserves each contour's openness and order, with no
        // boolean reshaping. Only fully-closed, untrimmed shapes keep using the
        // boolean union for seam-free stroking.
        const needsConcat = withPaths.some(
            s => (s.strokePath && s.strokePath !== s.ckPath) || s.trimmed,
        );
        let strokeUnion: CKPath | undefined;
        if (needsConcat) {
            const builder = new this.canvasKit.PathBuilder();
            for (const s of withPaths) builder.addPath(s.strokePath ?? s.ckPath!);
            strokeUnion = builder.detachAndDelete();
        }

        const canvas = this.getCanvas();
        return {
            draw: (paint: Paint) => { canvas.drawPath(combined, paint); },
            strokeDraw: (paint: Paint) => { canvas.drawPath(strokeUnion ?? combined, paint); },
            ckPath: combined,
            strokePath: strokeUnion,
        };
    }

    // ─── Boolean ─────────────────────────────────────────────────────────────

    beginBoolean(op: BooleanOperation): void {
        this.boolean.beginBoolean(op);
    }

    endBoolean(): void {
        const shape = this.boolean.endBoolean(this.getCanvas);
        this.shapes = [];
        this.paintApplied = false;
        if (shape) this.shapes.push(shape);
    }

    // ─── Mask ─────────────────────────────────────────────────────────────────

    beginMask(options?: MaskOptions): void {
        this.mask.beginMask(options);
    }

    applyMask(): void {
        this.mask.applyMask(() => {
            this.shapes = [];
            this.paintApplied = false;
        });
    }

    endMask(): void {
        this.mask.endMask();
    }

    getMaskApply(): Set<MaskApplyLayer> | null {
        return this.mask.getApply();
    }
}
