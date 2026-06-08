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

    constructor(
        protected readonly canvasKit: CanvasKit,
        protected readonly canvas: Canvas,
        state: Partial<S>,
    ) {
        this.inputState = state;
        this.fullState = this.resolveState(state);
    }

    protected abstract resolveState(state: Partial<S>): S;
    protected abstract computeGeometry(): G;
    protected abstract buildSVGPath(geo: G): string;
    protected abstract needsTrim(): boolean;
    protected abstract getTrimRange(): { start: number; end: number };

    // Public accessors used by ShapeHandler for cache invalidation.
    hasTrim(): boolean { return this.needsTrim(); }
    trimRange(): { start: number; end: number } { return this.getTrimRange(); }

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
        if (this.needsTrim()) {
            this._basePath = path;
            const { start, end } = this.getTrimRange();
            this.ckPath = trimPath(this.canvasKit, path, start, end);
        } else {
            this.ckPath = path;
        }
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

    // Returns a CurrentShape whose ckPath is a live getter on this instance,
    // so ensurePath() called after toCurrentShape() is reflected immediately.
    toCurrentShape(isolated: boolean): CurrentShape {
        const shape = this;
        return {
            draw: (paint: Paint) => shape.draw(paint, isolated),
            get ckPath() { return shape.ckPath; },
            bounds: this.computeBounds(this.geometry),
        };
    }

    // Subclasses that can compute LTRB bounds purely from geometry should override
    // this so getShapeBounds() works for isolated shapes that never build a ckPath.
    protected computeBounds(_geo: G): { left: number; top: number; right: number; bottom: number } | undefined {
        return undefined;
    }
}
