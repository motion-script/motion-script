import type { Paint, Path as CKPath } from "@motion-script/canvaskit";
import { PathState, toPathString, withPathDescriptor } from "@motion-script/core";
import { BaseShape } from "./base";
import { trimPath } from "./trim";
export { trimPath } from "./trim";

/**
 * Returns the SVG `d` string with a trailing close (`Z`/`z`) removed so the
 * contour is left open. Stripping the close from the *source* string (rather
 * than from CanvasKit's normalized output) is what actually opens the contour:
 * CanvasKit's `toSVGString()` synthesizes an explicit `L` back to the start
 * *before* the `Z`, so removing only the `Z` there would leave that closing
 * line — the visible chord. The source has no such synthesized line.
 */
function openSvgString(svg: string): string {
    return svg.replace(/\s*[Zz]\s*$/, "");
}

type PathGeo = {
    svgString: string;
    // Centering offset computed after path is built — stored here once ensurePath runs.
    offsetX: number;
    offsetY: number;
};

/**
 * Renders an arbitrary SVG path `d`. Overrides `ensurePath` to bake a
 * centering translation (so the shape's local origin is its bbox center)
 * directly into the built path, then applies trim — avoiding a save/restore
 * on every draw/clip.
 */
export class PathShape extends BaseShape<PathState, PathGeo> {
    protected resolveState(state: Partial<PathState>): PathState {
        return withPathDescriptor(state);
    }

    protected computeGeometry(): PathGeo {
        // SVG string is known eagerly; centering offset requires the ck path bounds
        // and is filled in by ensurePath() after path construction.
        return { svgString: toPathString(this.fullState.d), offsetX: 0, offsetY: 0 };
    }

    protected buildSVGPath(geo: PathGeo): string {
        return geo.svgString;
    }

    // Strokes on a freeform path follow the *open* outline: a stroke never draws
    // the contour's closing chord back to the start (e.g. a `…z`-terminated
    // heart). The fill keeps using the closed `ckPath`, so a filled region is
    // unaffected — this splits stroke vs fill behavior.
    //
    // The open path is built from the *source* `d` with its trailing close
    // stripped, then put through the SAME centering offset + transform + trim as
    // `ckPath` — NOT derived from `ckPath`. CanvasKit's normalized output adds an
    // explicit `L` back to the start before the `Z`, so opening it after the fact
    // would leave that line (the chord); the source has no such line. Reusing the
    // stored `geo.offsetX/Y` (computed from the closed path's bounds in
    // ensurePath) keeps the stroke aligned with the fill. Returns undefined when
    // the source has no trailing close, so genuinely open paths reuse `ckPath`.
    protected override buildStrokePath(_built: CKPath): CKPath | undefined {
        const geo = this.geometry;
        const openSvg = openSvgString(geo.svgString);
        if (openSvg === geo.svgString) return undefined;
        return this.buildCenteredTransformedTrimmed(openSvg, geo.offsetX, geo.offsetY, false);
    }

    protected needsTrim(): boolean {
        return this.fullState.start !== 0 || this.fullState.end !== 1;
    }

    protected getTrimRange() {
        return { start: this.fullState.start, end: this.fullState.end };
    }

    // Parse `svgString`, bake the centering `offset`, bake the per-shape
    // rotation/scale, then trim. Shared by ensurePath() (closed fill path, which
    // also records the base path for retrim) and buildStrokePath() (open stroke
    // path). Returns null on parse failure. The caller owns the result.
    private buildCenteredTransformedTrimmed(
        svgString: string,
        ox: number,
        oy: number,
        setBaseOnTrim: boolean,
    ): CKPath | undefined {
        const rawPath = this.canvasKit.Path.MakeFromSVGString(svgString);
        if (!rawPath) {
            console.warn("PathShape: failed to parse SVG path string:", svgString);
            return undefined;
        }

        // Bake the centering translation into the path so draw/clip need no save/restore.
        const builder = new this.canvasKit.PathBuilder(rawPath);
        builder.offset(ox, oy);
        const centeredPath = builder.detachAndDelete();
        rawPath.delete();

        // Bake per-shape rotation/scale about the now-centred origin (no-op when
        // both are identity), so `.path({ rotation, scale })` works like the
        // other shapes.
        const transformed = this.applyShapeTransform(centeredPath, { x: 0, y: 0 });

        if (this.needsTrim()) {
            if (setBaseOnTrim) this._setBasePath(transformed);
            const { start, end } = this.getTrimRange();
            const trimmed = trimPath(this.canvasKit, transformed, start, end);
            // When we keep `transformed` as the base for retrim it must stay alive;
            // otherwise (stroke path) it's transient and freed here.
            if (!setBaseOnTrim && trimmed !== transformed) transformed.delete();
            return trimmed;
        }
        return transformed;
    }

    // Override ensurePath to bake the centering offset directly into the path.
    override ensurePath(): void {
        if (this.ckPath) return;
        const geo = this.geometry;
        const rawPath = this.canvasKit.Path.MakeFromSVGString(geo.svgString);
        if (!rawPath) {
            console.warn("PathShape: failed to parse SVG path string:", geo.svgString);
            return;
        }

        // Center against an explicit shared frame when provided (so paths that
        // share one layout frame keep their relative positions); otherwise fall
        // back to the path's own bbox center. Computed once here from the closed
        // path's bounds and reused by buildStrokePath so the stroke stays aligned.
        const cb = this.fullState.centerBounds;
        const [minX, minY, maxX, maxY] = cb ?? rawPath.getBounds();
        geo.offsetX = -(minX + (maxX - minX) / 2);
        geo.offsetY = -(minY + (maxY - minY) / 2);
        rawPath.delete();

        this.ckPath = this.buildCenteredTransformedTrimmed(geo.svgString, geo.offsetX, geo.offsetY, true);
    }

    override draw(paint: Paint, _isolated: boolean): void {
        this.ensurePath();
        if (this.ckPath) this.canvas.drawPath(this.ckPath, paint);
    }

    override clip(_isolated: boolean): void {
        this.ensurePath();
        if (this.ckPath) {
            this.canvas.clipPath(this.ckPath, this.canvasKit.ClipOp.Intersect, true);
        }
    }
}
