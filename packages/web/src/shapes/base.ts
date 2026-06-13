import type { CanvasKit, Canvas, Paint, Path as CKPath } from "@motion-script/canvaskit";
import type { CurrentShape } from "./shape-handler";
import { trimPath } from "./trim";

/**
 * Common lifecycle for path-backed shapes: resolve state once, lazily compute
 * geometry, build a CanvasKit path from an SVG string (with optional trim),
 * and cache it across frames. Subclasses fill in the geometry/SVG/trim hooks;
 * `ShapeHandler` drives caching and reuse via `inputState`/`hasTrim`/`retrim`.
 */
export abstract class BaseShape<S, G = unknown> {
    protected readonly fullState: S;
    // The original partial state this shape was built from, used for cache equality checks.
    inputState: Partial<S>;
    ckPath: CKPath | undefined;
    // The untrimmed base path, kept alive so re-trim doesn't require re-parsing SVG.
    private _basePath: CKPath | undefined;
    private _geo: G | undefined;

    // Resolves the canvas to draw into at draw time, not construction time.
    // Shapes are cached across frames by ShapeHandler, but the active canvas can
    // change between frames (e.g. an effect scope like posterize swaps in a
    // per-frame offscreen surface and deletes it on scope exit). Capturing the
    // canvas at construction would leave a cached shape drawing into a freed
    // surface — a WASM "table index is out of bounds" trap — so we read it live.
    private readonly getCanvas: () => Canvas;
    protected get canvas(): Canvas { return this.getCanvas(); }

    constructor(
        protected readonly canvasKit: CanvasKit,
        getCanvas: () => Canvas,
        state: Partial<S>,
    ) {
        this.getCanvas = getCanvas;
        this.inputState = state;
        this.fullState = this.resolveState(state);
    }

    protected abstract resolveState(state: Partial<S>): S;
    protected abstract computeGeometry(): G;
    protected abstract buildSVGPath(geo: G): string;
    protected abstract needsTrim(): boolean;
    protected abstract getTrimRange(): { start: number; end: number };

    // SVG for the silhouette grown (positive) or shrunk (negative) by `spread`
    // px, used by shadow spread. Subclasses whose geometry resizes cleanly
    // (ellipse, rect) override this; the default returns null so the shape kind
    // is treated as not supporting spread. Returning null for a given `spread`
    // (e.g. a shrink that collapses the shape) is also valid.
    protected buildSpreadSVGPath(_geo: G, _spread: number): string | null {
        return null;
    }

    // Public accessors used by ShapeHandler for cache invalidation.
    hasTrim(): boolean { return this.needsTrim(); }
    trimRange(): { start: number; end: number } { return this.getTrimRange(); }

    // True when the shape has a non-identity rotation/scale baked into its path,
    // so subclasses with native fast-draw paths (RectShape) must fall back to the
    // transformed ckPath instead of drawRect/drawRRect.
    protected hasShapeTransform(): boolean {
        const s = this.fullState as unknown as { rotation?: number; scale?: number };
        return (s.rotation ?? 0) !== 0 || (s.scale ?? 1) !== 1;
    }

    protected get geometry(): G {
        return (this._geo ??= this.computeGeometry());
    }

    // Idempotent: builds ckPath once and caches it.
    ensurePath(): void {
        if (this.ckPath) return;
        const svgPath = this.buildSVGPath(this.geometry);
        const path = this.canvasKit.Path.MakeFromSVGString(svgPath);
        if (!path) {
            console.warn(`${this.constructor.name}: failed to create path`);
            return;
        }
        // Bake the shape's own rotation/scale into the geometry (no-op for the
        // common untransformed case), replacing `path` with the transformed copy.
        const transformed = this.applyShapeTransform(path);
        if (this.needsTrim()) {
            this._basePath = transformed;
            const { start, end } = this.getTrimRange();
            this.ckPath = trimPath(this.canvasKit, transformed, start, end);
        } else {
            this.ckPath = transformed;
        }
    }

    // Bake the shape's own rotation/scale (about its centre, honouring pivot)
    // into the path geometry. The shape's x/y are already baked into the SVG by
    // computeGeometry, so a shape rotates about its own (x,y) centre. Pivot is in
    // normalised shape space (0,0 = centre, ±1 = edges), matching the node-level
    // transform in WebRenderContext. Returns `path` unchanged for the common
    // untransformed case so axis-aligned rects/ellipses keep their fast native
    // draw/clip paths; otherwise returns a new transformed path and deletes the
    // input. Subclasses that override ensurePath (e.g. PathShape) call this on
    // their built path so per-shape rotation/scale still bakes in.
    protected applyShapeTransform(path: CKPath, centerOverride?: { x: number; y: number }): CKPath {
        const s = this.fullState as unknown as {
            x?: number; y?: number; rotation?: number; scale?: number;
            width?: number; height?: number;
            pivot?: { x: number; y: number };
        };
        const rotation = s.rotation ?? 0;
        const scale = s.scale ?? 1;
        if (rotation === 0 && scale === 1) return path;

        // Shapes bake x/y into their SVG, so they rotate/scale about their own
        // (x,y) centre. Subclasses that re-centre their path to the origin first
        // (PathShape) pass that origin as `centerOverride`.
        const cx = centerOverride ? centerOverride.x : (s.x ?? 0);
        const cy = centerOverride ? centerOverride.y : (s.y ?? 0);
        const pivot = s.pivot ?? { x: 0, y: 0 };
        const px = cx + pivot.x * ((s.width ?? 0) / 2);
        const py = cy - pivot.y * ((s.height ?? 0) / 2);

        const rad = (rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        // Affine that translates the pivot to the origin, scales, rotates, then
        // translates back — composed into a single 3x3 (row-major) matrix.
        const a = cos * scale;
        const b = -sin * scale;
        const c = sin * scale;
        const d = cos * scale;
        const e = px - a * px - b * py;
        const f = py - c * px - d * py;
        // This CanvasKit build exposes Path as immutable — geometry edits go
        // through a PathBuilder. Build from the path, apply the 3x3 row-major
        // matrix, and detach the transformed result (mirrors PathShape's offset).
        const builder = new this.canvasKit.PathBuilder(path);
        (builder as unknown as { transform(...m: number[]): void })
            .transform(a, b, e, c, d, f, 0, 0, 1);
        const out = builder.detachAndDelete();
        path.delete();
        return out;
    }

    // Build a fresh path for the silhouette grown/shrunk by `spread` px, with the
    // shape's own rotation/scale baked in (so a spread shadow tracks a rotated
    // shape). Returns null when the shape kind doesn't support spread or the
    // shrink collapses it. Trim is intentionally ignored — a spread shadow is
    // cast by the whole silhouette, not a trimmed arc. Caller owns the result and
    // must delete() it.
    spreadPath(spread: number): CKPath | null {
        const svg = this.buildSpreadSVGPath(this.geometry, spread);
        if (svg == null) return null;
        const path = this.canvasKit.Path.MakeFromSVGString(svg);
        if (!path) return null;
        return this.applyShapeTransform(path);
    }

    protected _setBasePath(path: CKPath): void {
        this._basePath = path;
    }

    // Re-trim from the cached base path when only start/end changed.
    // Only valid if ensurePath() was already called with trim active.
    retrim(start: number, end: number): void {
        const base = this._basePath;
        if (!base) return;
        this.ckPath?.delete();
        this.ckPath = trimPath(this.canvasKit, base, start, end);
    }

    // Release CanvasKit resources. Called by shape cache on eviction.
    deletePaths(): void {
        this.ckPath?.delete();
        this.ckPath = undefined;
        this._basePath?.delete();
        this._basePath = undefined;
    }

    draw(paint: Paint, _isolated: boolean): void {
        this.ensurePath();
        if (this.ckPath) this.canvas.drawPath(this.ckPath, paint);
    }

    clip(_isolated: boolean): void {
        this.ensurePath();
        if (this.ckPath) {
            this.canvas.clipPath(this.ckPath, this.canvasKit.ClipOp.Intersect, true);
        }
    }

    // True when this shape kind can resize its geometry cleanly for shadow
    // spread (ellipse, rect). Defaults to false; spread is silently ignored for
    // every other shape kind. Subclasses that override buildSpreadSVGPath set
    // this so the capability is advertised on the CurrentShape.
    protected supportsSpread(): boolean {
        return false;
    }

    // Returns a CurrentShape whose ckPath is a live getter on this instance,
    // so ensurePath() called after toCurrentShape() is reflected immediately.
    toCurrentShape(isolated: boolean): CurrentShape {
        const shape = this;
        return {
            draw: (paint: Paint) => shape.draw(paint, isolated),
            get ckPath() { return shape.ckPath; },
            bounds: this.computeBounds(this.geometry),
            spreadPath: this.supportsSpread() ? (spread: number) => shape.spreadPath(spread) : undefined,
        };
    }

    // Subclasses that can compute LTRB bounds purely from geometry should override
    // this so getShapeBounds() works for isolated shapes that never build a ckPath.
    protected computeBounds(_geo: G): { left: number; top: number; right: number; bottom: number } | undefined {
        return undefined;
    }
}
