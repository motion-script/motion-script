import type { Paint } from "@motion-script/canvaskit";
import { PathState, toPathString, withPathDescriptor } from "@motion-script/core";
import { BaseShape } from "./base";
import { trimPath } from "./trim";
export { trimPath } from "./trim";

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

    protected needsTrim(): boolean {
        return this.fullState.start !== 0 || this.fullState.end !== 1;
    }

    protected getTrimRange() {
        return { start: this.fullState.start, end: this.fullState.end };
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
        // back to the path's own bbox center.
        const cb = this.fullState.centerBounds;
        const [minX, minY, maxX, maxY] = cb ?? rawPath.getBounds();
        const ox = -(minX + (maxX - minX) / 2);
        const oy = -(minY + (maxY - minY) / 2);
        // Store for computeBounds() usage; no longer needed for draw/clip.
        geo.offsetX = ox;
        geo.offsetY = oy;

        // Bake the centering translation into the path so draw/clip need no save/restore.
        const builder = new this.canvasKit.PathBuilder(rawPath);
        builder.offset(ox, oy);
        const centeredPath = builder.detachAndDelete();
        rawPath.delete();

        if (this.needsTrim()) {
            this._setBasePath(centeredPath);
            const { start, end } = this.getTrimRange();
            this.ckPath = trimPath(this.canvasKit, centeredPath, start, end);
        } else {
            this.ckPath = centeredPath;
        }
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
