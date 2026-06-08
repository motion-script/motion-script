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
    ckPath?: CKPath;
    bounds?: { left: number; top: number; right: number; bottom: number };
    // Text shapes have no ckPath (canvaskit-wasm doesn't expose glyph paths),
    // and want strokes that follow the union of glyph silhouettes — see
    // StrokeHandler.drawTextUnionStroke.
    isText?: boolean;
}

// Shallow equality check for plain state objects. Handles the common case where
// all values are primitives or the same object reference (e.g. arrays held stable).
function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    const keysA = Object.keys(a);
    if (keysA.length !== Object.keys(b).length) return false;
    for (const k of keysA) {
        if (a[k] !== b[k]) return false;
    }
    return true;
}

function shallowEqualExcluding(a: Record<string, unknown>, b: Record<string, unknown>, ...exclude: string[]): boolean {
    const excSet = new Set(exclude);
    const keysA = Object.keys(a).filter(k => !excSet.has(k));
    const keysB = Object.keys(b).filter(k => !excSet.has(k));
    if (keysA.length !== keysB.length) return false;
    for (const k of keysA) {
        if (a[k] !== b[k]) return false;
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

    constructor(
        private canvasKit: CanvasKit,
        private getCanvas: () => Canvas,
        private getPaint: () => Paint,
        private fontMgr: TypefaceFontProvider,
    ) {
        this.boolean = new BooleanHandler(canvasKit, getCanvas);
        this.mask = new MaskHandler(canvasKit, getCanvas, this.boolean);
    }

    beginNode(nodeId: string): void {
        this.currentNodeId = nodeId;
        this.shapeIndex = 0;
    }

    reset(): void {
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
        if (!isolated && shape.ckPath) {
            this.boolean.contributeToPathCollection(shape.ckPath);
        }
        this.shapes.push(shape.toCurrentShape(isolated));
    }

    rect(state: Partial<RectState>): void {
        this.addShape(new RectShape(this.canvasKit, this.getCanvas(), state));
    }

    ellipse(state: Partial<EllipseState>): void {
        this.addShape(new EllipseShape(this.canvasKit, this.getCanvas(), state));
    }

    path(state: Partial<PathState>): void {
        this.addShape(new PathShape(this.canvasKit, this.getCanvas(), state));
    }

    line(state: Partial<LineState>): void {
        this.addShape(new LineShape(this.canvasKit, this.getCanvas(), state));
    }

    polygon(state: Partial<PolygonState>): void {
        this.addShape(new PolygonShape(this.canvasKit, this.getCanvas(), state));
    }

    polygram(state: Partial<PolygramState>): void {
        this.addShape(new PolygramShape(this.canvasKit, this.getCanvas(), state));
    }

    text(state: Partial<TextState>): void {
        this._boundsDirty = true;
        const shape = buildText(this.canvasKit, this.getCanvas(), this.fontMgr, state);
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

        // combinePaths consumed/deleted the copies; now drop the originals.
        for (const shape of this.shapes) shape.ckPath?.delete();
        this.shapes = [];
        this.paintApplied = false;
        if (!combined) return;

        const canvas = this.getCanvas();
        this.shapes.push({
            draw: (paint: Paint) => { canvas.drawPath(combined, paint); },
            ckPath: combined,
        });
    }

    // Build a single shape from the union of all accumulated path shapes, so a
    // stroke follows only the outer boundary with no seams where shapes overlap.
    // Returns null when there are fewer than two path shapes (caller strokes the
    // shapes directly) or text is involved (no path to union). The caller owns
    // the returned shape's ckPath and must delete() it. Does not mutate `shapes`.
    unionStrokeShape(): CurrentShape | null {
        if (this.shapes.some(s => s.isText)) return null;
        const withPaths = this.shapes.filter(s => s.ckPath);
        if (withPaths.length < 2) return null;

        const combined = this.boolean.combinePaths(
            withPaths.map(s => s.ckPath!.copy()),
            "union",
        );
        if (!combined) return null;

        const canvas = this.getCanvas();
        return {
            draw: (paint: Paint) => { canvas.drawPath(combined, paint); },
            ckPath: combined,
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
